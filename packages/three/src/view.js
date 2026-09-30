/**
 * A view: one renderer, scene and camera, the bindings drawn into it, and
 * what the page reacts to, which the entry keeps in the view's store.
 *
 * The view owns no three.js object it was handed. It sizes the renderer and
 * the camera when asked to (`fit`), listens to the pointer on the canvas
 * (for `hovered` and `selected`), and on teardown frees the scene's GPU
 * resources unless told to keep them (`dispose: false`).
 */

import { lib, Binding, BufferBinding } from './bindings.js';
import { CODES, fail } from './diagnostics.js';

const DRAG_PX = 4;          // a pointer that moved further than this between press and release dragged, not clicked
const STATS_MS = 1000;      // how often the averaged frame cost is published

export function View(name, opts, publish) {
  const T = lib.T;
  this.name = name;
  this.renderer = opts.renderer;
  this.scene = opts.scene;
  this.camera = opts.camera;
  this.before = opts.before || null;       // optional per-frame hook (controls.update)
  this.fit = opts.fit || null;
  this.inset = opts.inset || null;
  this.occluder = opts.occluder || null;
  this.keep = opts.dispose === false;
  this.maxPixelRatio = opts.maxPixelRatio || 2;
  // render: 'change' draws only when something changed since the last drawn
  // frame; maxFps runs the whole frame at most that often.
  this.onDemand = opts.render === 'change';
  this.minGap = opts.maxFps ? 1000 / opts.maxFps : 0;
  this.lastFrameAt = -Infinity;
  this.invalid = true;                     // the first frame always draws
  this.camSeen = new Float64Array(32);     // camera world and projection matrices at the last draw
  this.publish = publish;                  // writes into the view's store
  this.bindings = [];
  this.followers = [];
  this.raycaster = new T.Raycaster();
  this.occRay = new T.Raycaster();         // the occluder's own, so picking's ray is left alone
  this.occRay.camera = this.camera;        // a Sprite's raycast needs it
  this.ray = new T.Ray();
  this.ndc = new T.Vector2();
  this.v = new T.Vector3();                // projection scratch
  this.fv = new T.Vector3();               // follow() scratch, kept apart from the occluder's
  this.cp = new T.Vector3();               // occluded() scratch
  this.cw = new T.Vector3();               // hits() camera world position
  this.dir = new T.Vector3();
  this.tmp = new T.Vector3();
  this.seen = new Set();
  this.bound = new Set();                  // meshes the bindings draw into; they never occlude
  this.acc = { frames: 0, draws: 0, syncMs: 0, renderMs: 0, since: performance.now() };
  this.pointer = null;                     // { x, y } over the canvas, CSS px, or null
  this.hoverCache = null;                  // { name, key, entity, snap } of the last hovered entity
  this.offsetSet = false;                  // whether the view offset on the camera is this view's
  this.w = 0; this.h = 0;                  // the canvas size, CSS px, from the last resize
  this.dead = false;
  this.listen();
  // The size is tracked either way: of `fit` (which the view then sizes the
  // renderer to), or of the canvas the author sizes.
  this.observer = new ResizeObserver(() => this.resize());
  this.observer.observe(this.fit || this.renderer.domElement);
}

// ── Bindings ──

View.prototype.instanced = function (source, mesh, spec) {
  if (!source || (typeof source !== 'function' && typeof source.at !== 'function')) {
    throw fail(CODES.BAD_INSTANCED, 'instanced(source, mesh, spec): source is a pool handle or a function returning an array');
  }
  if (!mesh || !mesh.isInstancedMesh) throw fail(CODES.BAD_INSTANCED, 'instanced(source, mesh, spec): mesh must be an InstancedMesh');
  if (!spec || !spec.position) throw fail(CODES.BAD_INSTANCED, 'instanced(source, mesh, spec): spec.position names the x, y, z fields');
  if (spec.sync !== undefined && spec.sync !== 'frame' && spec.sync !== 'change') {
    throw fail(CODES.BAD_INSTANCED, "instanced(source, mesh, spec): spec.sync is 'frame' (the default) or 'change', not " + JSON.stringify(spec.sync));
  }
  const b = new Binding(source, mesh, spec, spec.name || 'binding' + this.bindings.length);
  this.bindings.push(b);
  this.bound.add(mesh);
  return b;
};

View.prototype.buffer = function (source, mesh, spec) {
  if (typeof source !== 'function') throw fail(CODES.BAD_BUFFER, 'buffer(source, mesh, spec): source is a function returning the array');
  if (!mesh || !mesh.isInstancedMesh) throw fail(CODES.BAD_BUFFER, 'buffer(source, mesh, spec): mesh must be an InstancedMesh');
  const missing = !spec ? ['spec'] : [!spec.stride && 'stride', !spec.position && 'position', typeof spec.count !== 'function' && 'count(arr)'].filter(Boolean);
  if (missing.length) throw fail(CODES.BAD_BUFFER, 'buffer(source, mesh, spec): spec is missing ' + missing.join(', '));
  const b = new BufferBinding(source, mesh, spec, spec.name || 'binding' + this.bindings.length);
  this.bindings.push(b);
  this.bound.add(mesh);
  return b;
};

// ── Sizing ──

// With `fit`, the renderer, pixel ratio and camera follow that element's
// size. Without it, the camera's aspect follows the canvas, which the author
// sizes. With `inset` ({ left, right, top, bottom } in CSS px, or a function
// returning one, or null), the camera's view offset centres the scene in
// the area the inset leaves; picking and projection read the camera, so
// they follow. A view offset the author set is left alone. Call resize()
// again when the inset changes on its own.
View.prototype.resize = function () {
  const r = this.renderer, cam = this.camera;
  let w, h;
  if (this.fit) {
    w = this.fit.clientWidth; h = this.fit.clientHeight;
    if (!w || !h) return;
    const ratio = Math.min(self.devicePixelRatio || 1, this.maxPixelRatio);
    if (r.getPixelRatio() !== ratio) r.setPixelRatio(ratio);
    r.setSize(w, h);
  } else {
    const el = r.domElement;
    w = el.clientWidth; h = el.clientHeight;
    if (!w || !h) return;            // not laid out yet (not in the page)
  }
  this.w = w; this.h = h;
  if (cam.isPerspectiveCamera) cam.aspect = w / h;
  const ins = typeof this.inset === 'function' ? this.inset() : this.inset;
  const dx = ins ? ((ins.right || 0) - (ins.left || 0)) / 2 : 0;
  const dy = ins ? ((ins.bottom || 0) - (ins.top || 0)) / 2 : 0;
  if (dx || dy) { cam.setViewOffset(w, h, dx, dy, w, h); this.offsetSet = true; }
  else if (this.offsetSet) { cam.clearViewOffset(); this.offsetSet = false; }
  cam.updateProjectionMatrix();
  this.invalid = true;
  this.publish({ size: { width: w, height: h }, pixelRatio: r.getPixelRatio() });
};

// Draw the next frame even if nothing the view can see has changed: for a
// scene changed by the app's own code, under render: 'change'.
View.prototype.invalidate = function () { this.invalid = true; };

// Whether the camera moved or its projection changed since the last drawn
// frame; remembers the current state. Orbit controls, damping, auto-rotate
// and camera moves in code all show up here, with no call from the app.
View.prototype.cameraChanged = function () {
  const cam = this.camera, seen = this.camSeen;
  cam.updateMatrixWorld();
  const w = cam.matrixWorld.elements, p = cam.projectionMatrix.elements;
  let changed = false;
  for (let i = 0; i < 16; i++) {
    if (seen[i] !== w[i]) { seen[i] = w[i]; changed = true; }
    if (seen[16 + i] !== p[i]) { seen[16 + i] = p[i]; changed = true; }
  }
  return changed;
};

// ── Visibility ──

// Is world point (x, y, z) hidden behind the occluder, as seen from the
// camera? The occluder is one of:
//   a function (x, y, z) => boolean         the author's own test
//   a three.js Sphere or Box3               exact, a few operations
//   { x, y, z, radius }                     a sphere, the same
//   an Object3D, or a list of them          raycast against the real shapes;
//                                           only meshes occlude, and never
//                                           bound meshes or hidden objects
// The sightline runs from the camera to the point, or for an orthographic
// camera along its view axis. False when there is no occluder, the camera
// is inside the shape, or the point is behind the camera.
View.prototype.occluded = function (x, y, z) {
  const oc = this.occluder;
  if (!oc) return false;
  if (typeof oc === 'function') return !!oc(x, y, z);
  const cam = this.camera, c = cam.getWorldPosition(this.cp), d = this.dir;
  let len;
  if (cam.isOrthographicCamera) {
    cam.getWorldDirection(d);
    len = (x - c.x) * d.x + (y - c.y) * d.y + (z - c.z) * d.z;
    if (len <= 0) return false;
    c.set(x - d.x * len, y - d.y * len, z - d.z * len);   // the point's foot on the camera plane
  } else {
    d.set(x - c.x, y - c.y, z - c.z);
    len = d.length();
    if (!len) return false;
    d.divideScalar(len);
  }
  const limit = len * (1 - 1e-6);      // the point's own surface does not hide it
  if (oc.isSphere || oc.isBox3) {
    if (oc.containsPoint(c)) return false;
    this.ray.set(c, d);
    const hit = oc.isSphere ? this.ray.intersectSphere(oc, this.tmp) : this.ray.intersectBox(oc, this.tmp);
    return !!hit && hit.distanceTo(c) < limit;
  }
  if (typeof oc.radius === 'number') {
    const ox = c.x - (oc.x || 0), oy = c.y - (oc.y || 0), oz = c.z - (oc.z || 0);
    const k = ox * ox + oy * oy + oz * oz - oc.radius * oc.radius;
    if (k <= 0) return false;
    const b = ox * d.x + oy * d.y + oz * d.z;
    const disc = b * b - k;
    if (disc < 0) return false;
    const t = -b - Math.sqrt(disc);
    return t > 0 && t < limit;
  }
  const rc = this.occRay;
  rc.set(c, d);
  rc.near = 0;
  rc.far = limit;
  rc.layers.mask = cam.layers.mask;
  for (const hit of rc.intersectObjects(Array.isArray(oc) ? oc : [oc], true)) {
    if (!hit.object.isMesh || this.bound.has(hit.object) || !shown(hit.object)) continue;
    return true;
  }
  return false;
};

// ── Projection ──

// A world point on screen, in CSS pixels of the canvas, or null behind the camera.
View.prototype.projectPoint = function (x, y, z) {
  const el = this.renderer.domElement;
  this.v.set(x, y, z).project(this.camera);
  if (this.v.z > 1) return null;
  return { x: (this.v.x + 1) / 2 * el.clientWidth, y: (1 - this.v.y) / 2 * el.clientHeight };
};

// An entity's position on screen, through a binding's position fields and
// its mesh's transform (else the entity's x, y, z in world space), or null
// when it is behind the camera.
View.prototype.project = function (entity, binding) {
  const f = fieldsOf(binding);
  this.v.set(entity[f[0]], entity[f[1]], entity[f[2]]);
  if (binding && binding.spec && typeof binding.spec.position[0] === 'string') this.v.applyMatrix4(binding.mesh.matrixWorld);
  return this.projectPoint(this.v.x, this.v.y, this.v.z);
};

// Keep an element over an entity: getEntity() returns the entity (or null
// to hide). Position comes through a pool binding's position fields and
// mesh transform when one is given, else the entity's x, y, z in world
// space. Hidden when there is no entity, its position is not a number, or
// it is behind the camera or the occluder. The element's `transform` and
// `display` are the view's to write. An element removed from the page is
// dropped.
View.prototype.follow = function (el, getEntity, binding) {
  const own = binding && binding.spec && typeof binding.spec.position[0] === 'string';
  const f = { el, get: getEntity, fields: fieldsOf(binding), mesh: own ? binding.mesh : null };
  this.followers.push(f);
  return () => { const i = this.followers.indexOf(f); if (i !== -1) this.followers.splice(i, 1); };
};

// ── Picking ──

// Every entity under a pointer event (or { clientX, clientY }), top first.
// Instanced bindings are raycast; buffer bindings with entity(i) pick in
// screen space (points within pickRadius px, default 6). Entities behind
// the occluder, bindings with pickable: false and meshes not shown are
// skipped. The order is what appears on top (see order()).
View.prototype.hits = function (ev, rect) {
  const T = lib.T, el = this.renderer.domElement;
  rect = rect || el.getBoundingClientRect();
  const cx = ev.clientX - rect.left, cy = ev.clientY - rect.top, w = rect.width, h = rect.height;
  const out = [];
  const cam = this.camera.getWorldPosition(this.cw);
  let rayReady = false;
  for (const b of this.bindings) {
    if (b.spec.pickable === false || !shown(b.mesh)) continue;
    if (b instanceof BufferBinding) {
      const spec = b.spec;
      if (typeof spec.entity !== 'function') continue;
      const arr = b.source(), cnt = arr ? Math.min(spec.count(arr), b.capacity) : 0;
      if (!cnt) continue;
      const base = b.offsetOf(arr), st = spec.stride, p = spec.position, mw = b.mesh.matrixWorld;
      const r2 = (spec.pickRadius || 6) * (spec.pickRadius || 6);
      for (let k = 0; k < cnt; k++) {
        const r = base + k * st;
        this.v.set(arr[r + p[0]], arr[r + p[1]], arr[r + p[2]]).applyMatrix4(mw);
        const x = this.v.x, y = this.v.y, z = this.v.z;
        this.v.project(this.camera);
        if (this.v.z > 1) continue;
        const dx = (this.v.x + 1) / 2 * w - cx, dy = (1 - this.v.y) / 2 * h - cy;
        if (dx * dx + dy * dy > r2) continue;
        // Only the few points near the pointer get this far, so an occluder
        // that raycasts real meshes stays affordable.
        if (spec.pickFilter && !spec.pickFilter(k, x, y, z)) continue;
        if (this.occluded(x, y, z)) continue;
        const ddx = x - cam.x, ddy = y - cam.y, ddz = z - cam.z;
        out.push({ binding: b, index: k, entity: spec.entity(k), point: new T.Vector3(x, y, z),
          distance: Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) });
      }
    } else {
      if (!rayReady) {
        this.raycaster.setFromCamera(this.ndc.set(cx / w * 2 - 1, -(cy / h) * 2 + 1), this.camera);
        this.raycaster.layers.mask = this.camera.layers.mask;
        rayReady = true;
      }
      if (b.moved) { b.mesh.computeBoundingSphere(); b.moved = false; }
      // Nearest first; a ray through an edge between two triangles hits the
      // same instance twice, and only its nearest hit is kept.
      const seen = this.seen;
      seen.clear();
      for (const hit of this.raycaster.intersectObject(b.mesh, false)) {
        if (hit.instanceId === undefined || seen.has(hit.instanceId)) continue;
        seen.add(hit.instanceId);
        const entity = b.entities[hit.instanceId];
        if (!entity || this.occluded(hit.point.x, hit.point.y, hit.point.z)) continue;
        out.push({ binding: b, index: hit.instanceId, entity, point: hit.point, distance: hit.distance });
      }
    }
  }
  return order(out);
};

// The top entity under a pointer event: { entity, binding, name, point,
// hits } with every hit in `hits`, or null.
View.prototype.pick = function (ev) {
  const hits = this.hits(ev);
  if (!hits.length) return null;
  const top = hits[0];
  return { entity: top.entity, binding: top.binding, name: top.binding.name, point: top.point, hits };
};

// What `hovered` and `selected` hold: a plain copy of the entity, with its
// binding's name and key. The same entity under the pointer keeps the same
// snapshot object, so a hover that has not changed notifies nothing. An
// entity without its own key is matched by identity, since its index can be
// taken by another.
View.prototype.snapshot = function (top) {
  if (!top) { this.hoverCache = null; return null; }
  const b = top.binding, key = b.keyOf(top.entity, top.index), name = b.name;
  const c = this.hoverCache;
  if (c && c.name === name && c.key === key && (b.keyed(top.entity) || c.entity === top.entity)) return c.snap;
  const snap = { binding: name, id: key, entity: Object.assign({}, top.entity) };
  this.hoverCache = { name, key, entity: top.entity, snap };
  return snap;
};

// The entity under the pointer's last position, as a snapshot (hovered).
View.prototype.hoverAt = function (p) {
  if (!p) return this.snapshot(null);
  const rect = this.renderer.domElement.getBoundingClientRect();
  const hits = this.hits({ clientX: rect.left + p.x, clientY: rect.top + p.y }, rect);
  return this.snapshot(hits[0] || null);
};

// ── Pointer ──

View.prototype.listen = function () {
  const el = this.renderer.domElement;
  let down = null;
  this.onMove = (e) => {
    const rect = el.getBoundingClientRect();
    this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.moved = true;
    this.publish({ pointer: this.pointer });
  };
  this.onLeave = () => { this.pointer = null; this.publish({ pointer: null }); };
  this.onDown = (e) => { down = [e.clientX, e.clientY]; };
  // A click that did not drag selects what is under it (or clears it).
  this.onClick = (e) => {
    const dragged = down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > DRAG_PX;
    down = null;
    if (dragged) return;
    const top = this.hits(e)[0];
    this.publish({ selected: top ? { binding: top.binding.name, id: top.binding.keyOf(top.entity, top.index), entity: Object.assign({}, top.entity) } : null });
  };
  el.addEventListener('pointermove', this.onMove);
  el.addEventListener('pointerleave', this.onLeave);
  el.addEventListener('pointerdown', this.onDown);
  el.addEventListener('click', this.onClick);
};

// ── The frame ──

View.prototype.frame = function () {
  if (this.dead) return;
  const start = performance.now();
  // maxFps: the whole frame runs at most that often. The 2 ms slack keeps a
  // 60 Hz display from dropping a frame it should have drawn.
  if (this.minGap) {
    if (start - this.lastFrameAt < this.minGap - 2) return;
    this.lastFrameAt = start;
  }
  if (this.before) this.before();
  if (this.dead) return;               // unregistered by its own before()
  const t0 = performance.now();
  let wrote = false;
  for (const b of this.bindings) if (b.sync()) wrote = true;
  const t1 = performance.now();
  // render: 'change' draws only for a write, a camera move, a resize or an
  // invalidate(). cameraChanged() runs every frame so it always compares
  // against the last frame, drawn or not.
  const camMoved = this.cameraChanged();
  const draw = !this.onDemand || wrote || camMoved || this.invalid;
  if (draw) {
    this.invalid = false;
    this.renderer.render(this.scene, this.camera);
  }
  const t2 = performance.now();
  if (this.followers.length) {
    const el = this.renderer.domElement, w = this.w || el.clientWidth, h = this.h || el.clientHeight, v = this.fv;
    for (let i = this.followers.length - 1; i >= 0; i--) {
      const f = this.followers[i];
      if (!f.el.isConnected) { this.followers.splice(i, 1); continue; }
      const e = f.get();
      if (!e) { f.el.style.display = 'none'; continue; }
      const p = f.fields;
      v.set(e[p[0]], e[p[1]], e[p[2]]);
      if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) { f.el.style.display = 'none'; continue; }
      if (f.mesh) v.applyMatrix4(f.mesh.matrixWorld);
      if (this.occluded(v.x, v.y, v.z)) { f.el.style.display = 'none'; continue; }
      v.project(this.camera);
      if (v.z > 1) { f.el.style.display = 'none'; continue; }
      f.el.style.display = '';
      f.el.style.transform = 'translate(' + ((v.x + 1) / 2 * w) + 'px,' + ((1 - v.y) / 2 * h) + 'px)';
    }
  }
  // syncMs averages every frame; renderMs and fps count the frames drawn, so
  // a still view under render: 'change' reads 0 fps.
  const a = this.acc;
  a.frames++; a.syncMs += t1 - t0;
  if (draw) { a.draws++; a.renderMs += t2 - t1; }
  if (t2 - a.since >= STATS_MS) {
    this.publish({ stats: { syncMs: +(a.syncMs / a.frames).toFixed(2), renderMs: a.draws ? +(a.renderMs / a.draws).toFixed(2) : 0,
      fps: Math.round(a.draws * 1000 / (t2 - a.since)) } });
    a.frames = 0; a.draws = 0; a.syncMs = 0; a.renderMs = 0; a.since = t2;
  }
  // The scene moves under a still pointer: refresh the pointer each drawn
  // frame it is over the canvas and has not just moved (a move already
  // published), so a watched `hovered` re-picks. A frame not drawn changed
  // nothing under the pointer. Unwatched, `hovered` is never evaluated.
  if (draw && this.pointer && !this.moved) { this.pointer = { x: this.pointer.x, y: this.pointer.y }; this.publish({ pointer: this.pointer }); }
  this.moved = false;
};

// ── Teardown ──

// Stop drawing, listening and observing, and (unless dispose: false) free
// the GPU resources reachable in the scene, the instanced meshes' own
// buffers included, except those another live view's scene still uses. The
// renderer and any controls are the author's: three.js cannot use them
// again after dispose().
View.prototype.dispose = function (others) {
  this.dead = true;
  const el = this.renderer.domElement;
  el.removeEventListener('pointermove', this.onMove);
  el.removeEventListener('pointerleave', this.onLeave);
  el.removeEventListener('pointerdown', this.onDown);
  el.removeEventListener('click', this.onClick);
  this.observer.disconnect();
  for (const b of this.bindings) b.release();
  this.followers.length = 0;
  this.bindings.length = 0;
  this.bound.clear();
  if (this.keep) return;
  const shared = { meshes: new Set(), geometries: new Set(), materials: new Set(), textures: new Set() };
  for (const o of others) collect(o.scene, shared);
  const mine = { meshes: new Set(), geometries: new Set(), materials: new Set(), textures: new Set() };
  collect(this.scene, mine);
  for (const m of mine.meshes) if (!shared.meshes.has(m)) m.dispose();
  for (const g of mine.geometries) if (!shared.geometries.has(g)) g.dispose();
  for (const m of mine.materials) if (!shared.materials.has(m)) m.dispose();
  for (const t of mine.textures) if (!shared.textures.has(t)) t.dispose();
};

// Every instanced mesh, geometry, material and texture reachable from a
// scene: object geometries and materials, textures on material properties
// and on shader uniforms, and the scene's background and environment.
function collect(scene, into) {
  const tex = (v) => { if (v && v.isTexture) into.textures.add(v); };
  scene.traverse((obj) => {
    if (obj.isInstancedMesh) into.meshes.add(obj);
    if (obj.geometry) into.geometries.add(obj.geometry);
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      into.materials.add(m);
      for (const k in m) tex(m[k]);
      if (m.uniforms) for (const u in m.uniforms) { const v = m.uniforms[u] && m.uniforms[u].value; if (Array.isArray(v)) v.forEach(tex); else tex(v); }
    }
  });
  tex(scene.background);
  tex(scene.environment);
}

// Order hits as they appear on screen, top first, in the order three.js
// draws: depth-writing materials hide what is behind them, and markers that
// write no depth are drawn over anything nearer than they are not. So:
//   1. markers in front of the nearest depth-writing hit, by renderOrder
//      (higher first) then distance;
//   2. depth-writing hits, nearest first (renderOrder breaks a tie);
//   3. markers behind the nearest depth-writing hit, nearest first.
// Built in passes rather than by one comparator, so the result does not
// depend on the order the hits arrived in.
function order(hits) {
  const solid = [], clear = [];
  for (const h of hits) (writesDepth(h.binding) ? solid : clear).push(h);
  const ro = (h) => h.binding.mesh.renderOrder || 0;
  solid.sort((a, b) => {
    const d = a.distance - b.distance;
    return Math.abs(d) > 1e-6 * Math.max(1, a.distance) ? d : ro(b) - ro(a);
  });
  const wall = solid.length ? solid[0].distance : Infinity;
  const front = clear.filter((h) => h.distance <= wall).sort((a, b) => ro(b) - ro(a) || a.distance - b.distance);
  const behind = clear.filter((h) => h.distance > wall).sort((a, b) => a.distance - b.distance);
  return front.concat(solid, behind);
}

// Whether a binding's mesh writes depth (any of its materials).
function writesDepth(b) {
  const m = b.mesh.material;
  if (!Array.isArray(m)) return !!m && m.depthWrite !== false;
  for (let i = 0; i < m.length; i++) if (m[i] && m[i].depthWrite !== false) return true;
  return false;
}

// The three position fields to read from an entity: a binding's own field
// names, or x, y, z.
function fieldsOf(binding) {
  return binding && binding.spec && typeof binding.spec.position[0] === 'string' ? binding.spec.position : ['x', 'y', 'z'];
}

// Visible, and every parent visible: what the renderer would draw.
function shown(obj) {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}
