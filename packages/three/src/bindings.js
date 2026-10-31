/**
 * Bindings: what writes entities into an InstancedMesh each frame.
 *
 * A pool is the mesh. A pool keeps its items packed (removal moves the last
 * item into the gap), which is the layout an InstancedMesh wants: instance i
 * is items[i], count is length. `entities` records the order of the last
 * sync, so a picked instanceId maps back to the entity drawn there.
 *
 * Binding        a pool handle, or a function returning an array (a query's
 *                rows), written field by field
 * BufferBinding  a flat array written by something else (a thread's frame):
 *                records `stride` floats apart
 * UniformBinding a shader parameter: a function's value written into
 *                anything with a `.value` (a TSL uniform() node, a
 *                ShaderMaterial's uniforms entry)
 */

import { CODES, warn, fail } from './diagnostics.js';

// The page's three.js module, set once by wildflower.three.use(THREE).
export const lib = { T: null };

// Custom attributes live on the geometry, which several meshes may share.
// geometry -> Map(attribute name -> the live binding that writes it), so a
// second binding cannot silently replace the first one's buffer.
const attrOwners = new WeakMap();

export function field(e, f) { return typeof f === 'function' ? f(e) : e[f]; }

// Colour values are 0xRRGGBB numbers (sRGB, as three.js reads a hex) or
// [r, g, b] in linear space. Hex conversions are cached per value.
const colorCache = new Map();
function writeColor(arr, o, v) {
  if (typeof v === 'number') {
    let c = colorCache.get(v);
    if (!c) {
      const col = new lib.T.Color(v);
      c = [col.r, col.g, col.b];
      if (colorCache.size < 4096) colorCache.set(v, c);
    }
    arr[o] = c[0]; arr[o + 1] = c[1]; arr[o + 2] = c[2];
  } else if (v) {
    arr[o] = v[0]; arr[o + 1] = v[1]; arr[o + 2] = v[2];
  }
}

// The writers below fill the rotation-scale part of instance matrix `o`:
// three columns, the instance's x, y and z axes, each scaled by its own
// factor (sx, sy, sz), as Matrix4.compose() lays them out.

// +Z points along (zx, zy, zz), as Object3D.lookAt(position + direction)
// does: z = dir, x = up x z, y = z x x, with up = +Y (a fallback x when z
// is parallel to it).
function orient(m, o, zx, zy, zz, sx, sy, sz) {
  const zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (zl === 0) { zx = 0; zy = 0; zz = 1; } else { zx /= zl; zy /= zl; zz /= zl; }
  let xx = zz, xz = -zx;                          // up (0,1,0) x z
  let xl = Math.sqrt(xx * xx + xz * xz);
  if (xl < 1e-6) { xx = 1; xz = 0; xl = 1; }
  xx /= xl; xz /= xl;
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
  m[o] = xx * sx; m[o + 1] = 0; m[o + 2] = xz * sx;
  m[o + 4] = yx * sy; m[o + 5] = yy * sy; m[o + 6] = yz * sy;
  m[o + 8] = zx * sz; m[o + 9] = zy * sz; m[o + 10] = zz * sz;
}

// A quaternion's rotation, through three.js's own Matrix4.compose(); the
// position it writes is overwritten after. Its objects are made at first
// use, once use(THREE) has given the library.
let tmp = null;
function turn(m, o, q, sx, sy, sz) {
  tmp.m.compose(tmp.p, q, tmp.s.set(sx, sy, sz)).toArray(m, o);
}
function scratch() {
  const T = lib.T;
  return tmp || (tmp = { m: new T.Matrix4(), p: new T.Vector3(), s: new T.Vector3(), q: new T.Quaternion(), e: new T.Euler() });
}

// A quaternion x, y, z, w, normalized (a zero one is no rotation).
function quat(m, o, x, y, z, w, sx, sy, sz) {
  const t = scratch();
  turn(m, o, t.q.set(x, y, z, w).normalize(), sx, sy, sz);
}

// Write entity e's instance matrix at offset o: the whole rotation-scale
// block, so nothing set earlier survives, and the position. One of
// quaternion, rotation, direction and rotationY sets the rotation
// (instanced() refuses quaternion or rotation beside another; direction
// wins over rotationY). rotation is Euler angles in radians, in three.js's
// default 'XYZ' order.
function writeMatrix(m, o, e, spec) {
  const sc = spec.scale, q = spec.quaternion, rot = spec.rotation, dir = spec.direction, ry = spec.rotationY, pos = spec.position;
  let sx, sy, sz;
  if (sc === undefined) sx = sy = sz = 1;
  else if (Array.isArray(sc)) { sx = e[sc[0]]; sy = e[sc[1]]; sz = e[sc[2]]; }
  else sx = sy = sz = field(e, sc);
  if (q !== undefined) {
    quat(m, o, e[q[0]], e[q[1]], e[q[2]], e[q[3]], sx, sy, sz);
  } else if (rot !== undefined) {
    const t = scratch();
    turn(m, o, t.q.setFromEuler(t.e.set(e[rot[0]], e[rot[1]], e[rot[2]])), sx, sy, sz);
  } else if (dir !== undefined) {
    orient(m, o, e[dir[0]], e[dir[1]], e[dir[2]], sx, sy, sz);
  } else if (ry !== undefined) {
    const r = field(e, ry), c = Math.cos(r), sn = Math.sin(r);
    m[o] = c * sx; m[o + 1] = 0; m[o + 2] = -sn * sx;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0;
    m[o + 8] = sn * sz; m[o + 9] = 0; m[o + 10] = c * sz;
  } else {
    m[o] = sx; m[o + 1] = 0; m[o + 2] = 0;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sz;
  }
  m[o + 12] = e[pos[0]]; m[o + 13] = e[pos[1]]; m[o + 14] = e[pos[2]];
}

function overCapacity(binding, n, what) {
  if (!__DEV__ || binding.warned) return;
  binding.warned = true;
  warn(CODES.OVER_CAPACITY, (binding.name ? "binding '" + binding.name + "': " : '') + 'the ' + what + ' has ' + n +
    ' entities but the mesh holds ' + binding.capacity + '; the rest are not drawn',
    'Create the InstancedMesh with a count at least as large as the most entities you expect.');
}

export function Binding(pool, mesh, spec, name) {
  this.pool = pool;
  this.mesh = mesh;
  this.spec = spec;
  this.name = name;
  this.capacity = mesh.instanceMatrix.count;
  this.entities = new Array(this.capacity); // order of the last sync, for picking
  this.warned = false;
  // sync: 'change' writes a pool only after its version moves; 'frame' (the
  // default) writes every frame. A function source is written when it
  // returns a different array in either mode.
  this.changeOnly = spec.sync === 'change';
  this.seenVersion = -1;
  if (__DEV__) {
    this.checkedAt = 0;          // the last 3D-111 check
    this.unreportedWarned = false;
  }
  const Attr = mesh.instanceMatrix.constructor; // InstancedBufferAttribute
  if (spec.color && !mesh.instanceColor) {
    mesh.instanceColor = new Attr(new Float32Array(this.capacity * 3), 3);
  }
  // The colour value each slot last wrote: a colour that has not changed
  // for the same entity is skipped (most colours are set once).
  this.lastColor = spec.color ? new Array(this.capacity) : null;
  this.attrs = [];
  const custom = spec.attributes || {};
  let owners = attrOwners.get(mesh.geometry);
  for (const attrName in custom) {
    if (owners && owners.has(attrName)) {
      throw fail(CODES.BAD_INSTANCED, "instanced(): attribute '" + attrName + "' is already written by binding '" + owners.get(attrName).name +
        "' on this mesh's geometry; give each mesh its own geometry (geometry.clone()) when both need the attribute");
    }
  }
  for (const attrName in custom) {
    const def = custom[attrName];
    const size = (def && def.size) || 1;
    const a = new Attr(new Float32Array(this.capacity * size), size);
    mesh.geometry.setAttribute(attrName, a);
    this.attrs.push({ name: attrName, attr: a, size, get: (def && def.field) || def });
    if (!owners) attrOwners.set(mesh.geometry, owners = new Map());
    owners.set(attrName, this);
  }
  // Instances move every frame: culling by a stale bounding sphere would
  // drop visible ones. Picking recomputes it on demand instead.
  mesh.frustumCulled = false;
}

Binding.prototype.sync = function () {
  const pool = this.pool, spec = this.spec, mesh = this.mesh;
  // A pool, or a function returning an array (a query's rows). An array is
  // read again only when the function returns a different one (a query
  // replaces its rows wholesale, so once per fetch), unless live: true, for
  // an array changed in place. The rows are read as they are, never copied:
  // a pick returns the author's own row, and a class with getter
  // coordinates keeps them.
  let items;
  if (typeof pool === 'function') {
    const src = pool() || [];
    // The same array as last frame: nothing moved, so the instance buffers
    // are already right (a ground-fixed layer turns with its parent's
    // transform, not its matrices).
    if (src === this.srcRef && !spec.live) return false;
    this.srcRef = src;
    items = src;
  } else {
    // sync: 'change': the pool's version says whether anything changed
    // through its API since the last write. Unchanged, nothing is written
    // and nothing is uploaded. A core without pool.version (before 1.5.4)
    // draws every frame, as 'frame' does.
    if (this.changeOnly && typeof pool.version === 'number') {
      if (pool.version === this.seenVersion) {
        if (__DEV__) this.checkUnreported();
        return false;
      }
      this.seenVersion = pool.version;
    }
    items = pool.items;
  }
  let n = items.length;
  if (n > this.capacity) { overCapacity(this, n, typeof pool === 'function' ? 'source' : 'pool'); n = this.capacity; }
  const m = mesh.instanceMatrix.array;
  const col = spec.color, carr = col ? mesh.instanceColor.array : null;
  const attrs = this.attrs, ents = this.entities, last = this.lastColor;
  let colorDirty = false;
  for (let i = 0; i < n; i++) {
    const e = items[i];
    if (carr) {
      const cv = field(e, col);
      if (ents[i] !== e || last[i] !== cv) { writeColor(carr, i * 3, cv); last[i] = cv; colorDirty = true; }
    }
    ents[i] = e;
    writeMatrix(m, i * 16, e, spec);
    for (let k = 0; k < attrs.length; k++) {
      const at = attrs[k], v = field(e, at.get), arr = at.attr.array;
      if (at.size === 1) arr[i] = v;
      else for (let j = 0; j < at.size; j++) arr[i * at.size + j] = v[j];
    }
  }
  for (let z = n; z < ents.length && ents[z] !== undefined; z++) ents[z] = undefined;
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (colorDirty) mesh.instanceColor.needsUpdate = true;
  for (let q = 0; q < attrs.length; q++) attrs[q].attr.needsUpdate = true;
  this.moved = true;   // picking recomputes the bounding sphere only after a write
  return true;         // wrote: the view draws this frame under render: 'change'
};

// Development builds, sync: 'change', a frame with an unchanged version: once
// a second, work out what a sync would write for every entity and compare it
// with the buffers. A difference means an entity changed in place and nobody
// called markDirty() or update(), so the change is not drawn: warn once.
// Everything here is development-only: production builds drop the block.
if (__DEV__) {
const scratchMatrix = new Float32Array(16);
const scratchVec = new Float32Array(4);
const MATRIX_SLOTS = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];

Binding.prototype.checkUnreported = function () {
  const now = performance.now();
  if (this.unreportedWarned || now - this.checkedAt < 1000) return;
  this.checkedAt = now;
  const spec = this.spec, mesh = this.mesh, items = this.pool.items, ents = this.entities;
  const n = Math.min(items.length, this.capacity);
  const m = mesh.instanceMatrix.array;
  const carr = spec.color ? mesh.instanceColor.array : null;
  let what = null, at = -1;
  if (n !== mesh.count) what = 'the number of entities';
  for (let i = 0; i < n && !what; i++) {
    const e = items[i];
    if (ents[i] !== e) { what = 'the entities it holds'; break; }
    writeMatrix(scratchMatrix, 0, e, spec);
    for (const j of MATRIX_SLOTS) {
      if (scratchMatrix[j] !== m[i * 16 + j]) { what = j >= 12 ? 'the position' : 'the direction, rotation or scale'; break; }
    }
    if (!what && carr) {
      writeColor(scratchVec, 0, field(e, spec.color));
      if (scratchVec[0] !== carr[i * 3] || scratchVec[1] !== carr[i * 3 + 1] || scratchVec[2] !== carr[i * 3 + 2]) what = 'the color';
    }
    for (let k = 0; k < this.attrs.length && !what; k++) {
      const a = this.attrs[k], v = field(e, a.get), arr = a.attr.array;
      if (a.size === 1) scratchVec[0] = v;
      else for (let j = 0; j < a.size; j++) scratchVec[j] = v[j];
      for (let j = 0; j < a.size; j++) {
        if (scratchVec[j] !== arr[i * a.size + j]) { what = "attribute '" + a.name + "'"; break; }
      }
    }
    if (what) at = i;
  }
  if (!what) return;
  this.unreportedWarned = true;
  warn(CODES.UNREPORTED_CHANGE, "binding '" + this.name + "' (sync: 'change'): " + what +
    (at >= 0 ? ' of entity ' + JSON.stringify(this.keyOf(items[at], at)) : '') +
    " changed, but the pool's version did not, so the change is not drawn",
    "After changing an entity in place, call pool.markDirty(key) or pool.update(key, props); or use sync: 'frame', which redraws the pool every frame.");
};
}

// The key an entity is known by in `hovered` / `selected`: spec.key (a field
// name, default 'id'), or the instance index when the entity has none.
Binding.prototype.keyOf = function (entity, index) {
  const k = entity ? entity[this.spec.key || 'id'] : undefined;
  return k === undefined ? index : k;
};

// Whether the entity carries its own key (else keyOf fell back to the index).
Binding.prototype.keyed = function (entity) {
  return !!entity && entity[this.spec.key || 'id'] !== undefined;
};

// The view is done with this binding: its custom attributes are free again.
Binding.prototype.release = function () {
  const owners = attrOwners.get(this.mesh.geometry);
  if (!owners) return;
  for (const [name, b] of owners) if (b === this) owners.delete(name);
};

export function BufferBinding(source, mesh, spec, name) {
  this.source = source;
  this.mesh = mesh;
  this.spec = spec;
  this.name = name;
  this.capacity = mesh.instanceMatrix.count;
  this.colored = 0;
  this.warned = false;
  if (spec.color && !mesh.instanceColor) {
    mesh.instanceColor = new mesh.instanceMatrix.constructor(new Float32Array(this.capacity * 3), 3);
  }
  mesh.frustumCulled = false;
}

// Colours are written once per slot; after the records' meaning changes
// (a new catalogue in the same buffer), recolor() rewrites them all on the
// next frame.
BufferBinding.prototype.recolor = function () { this.colored = 0; };

BufferBinding.prototype.offsetOf = function (arr) {
  const o = this.spec.offset;
  return typeof o === 'function' ? o(arr) : (o || 0);
};

BufferBinding.prototype.sync = function () {
  const spec = this.spec, mesh = this.mesh, arr = this.source();
  let n = arr ? spec.count(arr) : 0;
  // No frame yet (a worker's first one has not arrived): draw nothing, and
  // never call offset() or count() with a missing array.
  if (!n) {
    const had = mesh.count;
    mesh.count = 0;
    return had !== 0;              // emptied: the view draws the change once
  }
  if (n > this.capacity) { overCapacity(this, n, 'buffer'); n = this.capacity; }
  const m = mesh.instanceMatrix.array, st = spec.stride;
  const base = this.offsetOf(arr);
  const p = spec.position, q = spec.quaternion, d = spec.direction;
  for (let i = 0; i < n; i++) {
    const r = base + i * st, o = i * 16;
    if (q) quat(m, o, arr[r + q[0]], arr[r + q[1]], arr[r + q[2]], arr[r + q[3]], 1, 1, 1);
    else if (d) orient(m, o, arr[r + d[0]], arr[r + d[1]], arr[r + d[2]], 1, 1, 1);
    m[o + 12] = arr[r + p[0]]; m[o + 13] = arr[r + p[1]]; m[o + 14] = arr[r + p[2]];
  }
  if (spec.color && n > this.colored) {
    const carr = mesh.instanceColor.array;
    for (let c = this.colored; c < n; c++) writeColor(carr, c * 3, spec.color(c));
    this.colored = n;
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  return true;                     // a buffer is written every frame it has records
};

BufferBinding.prototype.keyOf = Binding.prototype.keyOf;
BufferBinding.prototype.keyed = Binding.prototype.keyed;
BufferBinding.prototype.release = function () {};

// ── Uniforms ──

const isList = (a) => Array.isArray(a) || ArrayBuffer.isView(a);

export function UniformBinding(target, source) {
  this.target = target;
  this.source = source;
  this.warned = false;
}

// Reads the source and writes the target only when the value differs, so a
// view with render: 'change' draws exactly when a bound value moves. A three
// math object (Color, Vector*, Matrix*) or an array is copied into the
// target's own object: TSL nodes and materials hold that object, so it keeps
// its identity, and a number is set into a Color target. Returns whether
// the target changed.
UniformBinding.prototype.sync = function () {
  let v;
  try { v = this.source(); } catch (err) {
    if (__DEV__ && !this.warned) {
      this.warned = true;
      warn(CODES.UNIFORM_SOURCE_THREW, 'uniform(): the source threw (' + (err && err.message) + '); the last value stays',
        'Fix the source function; it is read every frame.');
    }
    return false;
  }
  const t = this.target, cur = t.value;
  if (cur === v) return false;
  if (cur && v && typeof cur.equals === 'function' && typeof cur.copy === 'function' && typeof v.equals === 'function') {
    if (cur.equals(v)) return false;
    cur.copy(v);
    return true;
  }
  if (cur && cur.isColor && typeof v === 'number') {
    const c = this.color || (this.color = cur.clone());
    c.setHex(v);
    if (cur.equals(c)) return false;
    cur.copy(c);
    return true;
  }
  // An array takes the source's length. A typed array cannot change length,
  // so it takes as much as fits and keeps the rest. Changed means a stored
  // element changed, compared after the write, so a value a Float32Array
  // rounds still settles.
  if (isList(cur) && isList(v)) {
    const grow = Array.isArray(cur), n = grow ? v.length : Math.min(cur.length, v.length);
    let changed = grow && cur.length !== v.length;
    for (let i = 0; i < n; i++) {
      const was = cur[i];
      cur[i] = v[i];
      if (!Object.is(cur[i], was)) changed = true;
    }
    if (grow) cur.length = v.length;
    return changed;
  }
  t.value = v;
  return true;
};
