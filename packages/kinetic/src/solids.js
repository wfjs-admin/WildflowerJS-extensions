/**
 * solids(target, options): 2.5D. Solids live in 3D only as numbers; each
 * draw() rotates every face's corners, projects them to the frame, drops
 * the faces turned away, clips the rest against a plane in front of the
 * eye, sorts them far to near and draws each as an SVG path into `target`
 * (an SVG element), shaded by its angle to one light. Sharp at any size,
 * no WebGL context, and the finish works on it as on anything else. Faces
 * that cross each other sort wrong; that is 3D's job (Trillium).
 *
 *   const stage = solids(svg.querySelector('#world'), {
 *     camera: { distance: 5, focal: 900, roll: 45, near: 0.2, fade: 0, center: [540, 540] },
 *     light: { dir: [-0.25, 0.35, 0.9], ramp: ['#2A141D', ..., '#FBE4DE'], gamma: 1.8, floor: 0.03, gain: 0.97, bounce: 0, across: [0.2, 0.16] },
 *     rim: { color: '#FBE4DE', width: 1.6, base: 0.12, edge: 0.5, power: 2 },   // or false
 *     glows: [{ dir, color, size: 0.85, strength: 1, sharp: 1.5, bleed: { size: 1.7, strength: 0.2, cap: 0 } }],
 *     dropShadow: { blur: 24, color: '#000000', opacity: 0.35, offset: [0, 0] },   // optional
 *     shade: { canvas, scene: this, kind: 'stipple', fps: 0 },                     // optional, for grain
 *   });
 *   stage.add('shell', solids.prism({ sides: 6, radius: 1.4, depth: 0.4 }), { albedo: 0.42, glow: 0.85 });
 *   stage.add('core', solids.box({ size: 0.8 }));
 *   // in a scene's seek(t):
 *   stage.set('shell', { rotate: [90 * p, 0, 0] });
 *   stage.draw();
 *
 * The camera looks down -z from (0, 0, distance); +y is up on screen. focal
 * is pixels at a distance of 1; roll turns the frame about its center, in
 * degrees; center is the frame's middle in the target's units (default the
 * middle of the nearest <svg>'s viewBox). A face crossing the plane `near`
 * in front of the eye is clipped there; with `fade` above 0 a face thins out
 * over that distance past `near` instead of filling the frame with one color.
 *
 * The light: a face's tone is floor + gain * max(0, n . dir)^gamma, times its
 * object's albedo, plus bounce times how far it faces down, read through the
 * ramp's colors; a gradient runs across it from tone + across[0] on its side
 * toward the light to tone - across[1] on the other. The rim is a fine edge
 * whose opacity is base + edge * (1 - |n . toward the eye|)^power, so it
 * brightens as the face turns edge-on.
 *
 * A glow is soft color where a light at `dir` would reflect off a face into
 * the eye: a circle in the face's plane, tethered within reach of the face,
 * clipped to it, its ellipse taken from the projection's local slope (so the
 * same face listed from another corner draws the same ellipse, and a loop
 * that lands on itself closes), as bright as strength * (n . half)^sharp
 * times the object's glow, and given back as the face turns edge-on. Its
 * `bleed` is the same glow again, `size` times larger, `strength` times as
 * strong and unclipped, so color spills past the face's edge; with `cap`, a
 * bleed wider than `cap` pixels is fainter in proportion, so a big near face
 * does not wash the frame. The bleeds of a light share one layer above the
 * faces and one flat color, so their order changes nothing. `color` makes
 * the gradients; `gradient` and `bleed.gradient` name a radialGradient of
 * the page's own instead.
 *
 * A drop shadow: each shape's outline, blurred, falls on the shapes drawn
 * behind it and multiplies their color by `color`, `opacity` strong, moved
 * by `offset`.
 *
 * add(name, shape, { albedo: 1, glow: 1, rim: 1, casts: 1, accepts: true,
 * color, side, shade, parent, pivot, order, clip, hidden }) puts a shape on
 * the stage; set(name, { shape, parent, rotate: [x, y, z] degrees (about x,
 * then y, then z), scale (a number or [x, y, z]), position: [x, y, z],
 * pivot, opacity: 0 to 1, color, shade, side, casts, order }) places it;
 * draw() draws them all. Faces are sorted by distance from the eye, and a
 * tie by place on screen, never by which object or face it is, so a loop
 * where one face takes another's place draws the same frame; of two that
 * overlap on screen, one wholly in front of the other's plane is then
 * drawn after it, so a shape in front of a wall is over it; each path runs
 * clockwise on screen from its leftmost corner, so it writes the same markup
 * too. Each face on the stage has a slot of SVG elements, made when its
 * shape is added; a draw fills the slots it needs, in order, and blanks the
 * ones the draw before filled. A sphere's parts are elements of its own,
 * which each draw puts into the slot the sphere fills and takes out of the
 * page when it is not drawn. So any order of draws at the same values
 * leaves the same DOM. remove(name) takes a shape off;
 * dispose() takes the stage's elements out of the page.
 *
 *   rim, glow     how much of the stage's rim and glows the shape takes
 *   casts         how strong a drop shadow it casts, 0 to 1; accepts: false keeps shadows off it
 *   color         its own color: a ramp of #rrggbb dark to lit, read through the light as the
 *                 stage's is; a paint of the page's ('#f00', 'url(#id)') drawn as it is; or
 *                 { gradient: [colors], angle } or { gradient, from, to }, a gradient in its own space
 *   side          { name: { color, shade } } for its sides by name; a flat shape's back is drawn
 *                 only when side.back has a color
 *   shade         grain on it, drawn by the stage's shade canvas (see "grain" below)
 *   parent        the name of another shape, often a solids.null(), whose transform its own is inside
 *   pivot         the point of its own space that position places, and that it turns and scales about
 *   order         drawn over every shape of a lower order, under every one of a higher; one order sorts by depth
 *   clip          the name of another shape, or { shape, invert }: drawn only inside its outline, or outside
 *   hidden        worked out but not drawn, as a clip for others
 *   shape (set)   another shape in its place, or some of its numbers, the rest as they were
 *
 * Shapes, each in its own space around its center:
 *   solids.box({ size })          size the edge, or [x, y, z]; sides front, back, left, right, top, bottom
 *   solids.faces([{ pts, n, side }])  faces of your own: 3 or more corners, the outward normal
 *                                 (from the first three corners when left out), and a side name
 *   solids.plane({ size })        a flat rectangle, size the edge or [x, y]
 *   solids.disc({ radius })       a flat circle
 *   solids.sector({ radius, from, to, inner })  a flat slice of a circle, degrees clockwise
 *                                 from straight up; with inner, a ring's part
 *   solids.capsule({ radius, length })  two circles length apart along x and the lines that touch
 *                                 both; radius a number or [left, right]
 *   solids.polygon({ sides, radius })  a flat regular polygon, its first corner straight up
 *   solids.prism({ sides, radius, depth, taper: 1 })  a regular polygon carried back along z,
 *                                 `depth` deep about the center, its back `taper` times the
 *                                 front's size (0: a point); sides front, back, side
 *   solids.pyramid({ sides, radius, height })  standing on its base, `height` tall about the
 *                                 center, a corner of the base toward the front; sides base, side
 *   solids.sphere({ radius, wedges, around: 'y', bands, along: 'y' })  a sphere, drawn from its
 *                                 outline each draw; `wedges` divides it into that many equal
 *                                 segments around an axis, side 0 centered on the front (on the
 *                                 top, around z); `bands` into that many slices of equal height
 *                                 along an axis, or at the heights given (each between 1, the
 *                                 axis' far end, and -1), side 0 at the far end. Its sides are
 *                                 numbered, so its side is a list: [{ color, shade }, ...]
 *   solids.null()                 a transform with nothing to draw, a parent for other shapes
 * The flat shapes lie in the plane z = 0, facing +z, with sides front and back.
 *
 * A glow's `spread`, in degrees, puts it at the face's middle when the face
 * mirrors the light to the eye and at its edge when the face is turned
 * `spread` degrees from that, whatever the camera's distance; below 0 it
 * crosses the other way. 0 (the default) tethers it as above.
 * KN-100 for a wrong argument.
 */

import { CODES, fail, show } from './diagnostics.js';

const NS = 'http://www.w3.org/2000/svg';
const DEG = Math.PI / 180;
const n1 = (v) => Math.round(v * 10) / 10;
const n2 = (v) => Math.round(v * 100) / 100;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const mean = (pts) => [0, 1, 2].map((k) => pts.reduce((a, p) => a + p[k], 0) / pts.length);
// sine.inOut between a and b, clamped.
const ease = (x, a, b) => { const p = Math.max(0, Math.min(1, (x - a) / (b - a))); return 0.5 - 0.5 * Math.cos(Math.PI * p); };
const HIDDEN = 'matrix(0 0 0 0 0 0)';
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const vec = (v) => Array.isArray(v) && v.length === 3 && v.every(num);
const SET_KEYS = ['shape', 'parent', 'rotate', 'scale', 'position', 'pivot', 'opacity', 'color', 'shade', 'side', 'casts', 'order'];
// The whole plane, for a clip that keeps everything outside an outline.
const EVERYWHERE = 'M-99999 -99999 H99999 V99999 H-99999 Z ';

function rgbOf(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}

// ---- shapes -----------------------------------------------------------------

const SHAPE = Symbol('solids shape');
// sides: the names its faces go by, for a color each. flat: one face with a back.
const shape = (faces, sides, flat) => Object.freeze({ [SHAPE]: true, faces: Object.freeze(faces), sides: Object.freeze(sides || []), flat: !!flat });
const BOX_SIDES = [['left', 'right'], ['bottom', 'top'], ['back', 'front']];

// A box's six faces about its center, h its half sizes.
function boxFaces(h) {
  const out = [], c = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3, pts = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0];
      p[axis] = c[axis] + sign * h[axis]; p[u] = c[u] + su * h[u]; p[v] = c[v] + sv * h[v];
      pts.push(p);
    }
    const n = [0, 0, 0]; n[axis] = sign;
    out.push({ pts, n, side: BOX_SIDES[axis][sign < 0 ? 0 : 1] });
  }
  return out;
}

function sizeOf(o, where) {
  const s = o && o.size;
  if (num(s) && s > 0) return [s / 2, s / 2, s / 2];
  if (vec(s) && s.every((x) => x > 0)) return s.map((x) => x / 2);
  throw fail(CODES.BAD_CALL, where, __DEV__ && 'size is the edge, a number above 0, or [x, y, z], not ' + show(s));
}

function box(o) {
  return shape(boxFaces(sizeOf(o, 'solids.box({ size })')), ['front', 'back', 'left', 'right', 'top', 'bottom']);
}

function faces(list) {
  if (!Array.isArray(list) || !list.length) throw fail(CODES.BAD_CALL, 'solids.faces(faces)', __DEV__ && 'faces is an array of { pts, n, side }, not ' + show(list));
  const names = [];
  return shape(list.map((f, i) => {
    const pts = f && f.pts;
    if (!(Array.isArray(pts) && pts.length >= 3 && pts.every(vec))) throw fail(CODES.BAD_CALL, 'solids.faces(faces[' + i + '].pts)', __DEV__ && 'pts is 3 or more corners, each [x, y, z], not ' + show(pts));
    if (f.n !== undefined && !vec(f.n)) throw fail(CODES.BAD_CALL, 'solids.faces(faces[' + i + '].n)', __DEV__ && 'n is the outward normal, [x, y, z], not ' + show(f.n));
    if (f.side !== undefined && !(typeof f.side === 'string' && f.side)) throw fail(CODES.BAD_CALL, 'solids.faces(faces[' + i + '].side)', __DEV__ && 'side is a name for the face, to color it by, not ' + show(f.side));
    if (f.side && !names.includes(f.side)) names.push(f.side);
    // The way it faces, when not told: by its first three corners, or, with those on one line, by all of them
    // (Newell's sum, which a corner on an edge leaves as it is).
    let n = f.n || cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    if (!Math.hypot(...n)) n = pts.reduce((s, p, j) => { const q = pts[(j + 1) % pts.length]; return [s[0] + (p[1] - q[1]) * (p[2] + q[2]), s[1] + (p[2] - q[2]) * (p[0] + q[0]), s[2] + (p[0] - q[0]) * (p[1] + q[1])]; }, [0, 0, 0]);
    if (!Math.hypot(...n)) throw fail(CODES.BAD_CALL, 'solids.faces(faces[' + i + '].pts)', __DEV__ && 'the corners all lie on one line, so the face faces no way; give corners that enclose an area, or n');
    return { pts: pts.map((p) => p.slice()), n: norm(n), side: f.side };
  }), names);
}

// Flat shapes: one face in the plane z = 0, facing +z, with a front and a
// back. A round outline is a ring of ROUND short edges.
const ROUND = 128;
const FLAT = ['front', 'back'];
const flat = (pts) => shape([{ pts, n: [0, 0, 1], side: 'front' }], FLAT, true);

function plane(o) {
  const s = o && o.size, w = num(s) ? [s, s] : s;
  if (!(Array.isArray(w) && w.length === 2 && w.every((x) => num(x) && x > 0))) throw fail(CODES.BAD_CALL, 'solids.plane({ size })', __DEV__ && 'size is the edge, a number above 0, or [x, y], not ' + show(s));
  const x = w[0] / 2, y = w[1] / 2;
  return flat([[-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0]]);
}

function radiusOf(o, where) {
  const r = o && o.radius;
  if (!(num(r) && r > 0)) throw fail(CODES.BAD_CALL, where, __DEV__ && 'radius is a number above 0, not ' + show(r));
  return r;
}

function disc(o) {
  const r = radiusOf(o, 'solids.disc({ radius })'), pts = [];
  for (let i = 0; i < ROUND; i++) { const a = (i / ROUND) * 2 * Math.PI; pts.push([r * Math.cos(a), r * Math.sin(a), 0]); }
  return flat(pts);
}

// A capsule: two circles `length` apart along x, about the middle, and the
// straight lines that touch both. `radius` is one number, or [left, right]
// for ends of two sizes.
function capsule(o) {
  const r = o && o.radius, ra = num(r) ? r : Array.isArray(r) ? r[0] : NaN, rb = num(r) ? r : Array.isArray(r) ? r[1] : NaN, L = o && o.length;
  if (!(num(ra) && num(rb) && ra > 0 && rb > 0)) throw fail(CODES.BAD_CALL, 'solids.capsule({ radius })', __DEV__ && 'radius is a number above 0, or [left, right], not ' + show(r));
  if (!(num(L) && L >= 0)) throw fail(CODES.BAD_CALL, 'solids.capsule({ length })', __DEV__ && 'length is how far apart the two ends\' middles are, 0 or more, not ' + show(L));
  const pts = [], arc = (cx, rad, from, to) => { const n = Math.max(2, Math.ceil((ROUND * Math.abs(to - from)) / (2 * Math.PI))); for (let i = 0; i <= n; i++) { const a = from + ((to - from) * i) / n; pts.push([cx + rad * Math.cos(a), rad * Math.sin(a), 0]); } };
  // One end inside the other is the larger circle alone.
  if (L <= Math.abs(ra - rb) + 1e-9) arc(ra >= rb ? -L / 2 : L / 2, Math.max(ra, rb), 0, 2 * Math.PI * (1 - 1 / ROUND));
  else { const t = Math.acos((ra - rb) / L); arc(L / 2, rb, -t, t); arc(-L / 2, ra, t, 2 * Math.PI - t); }
  return flat(pts);
}

// A sector of a circle about the middle, from one angle to another, in
// degrees clockwise from straight up; with `inner`, the part of it outside
// that radius, which over a whole turn is a ring.
function sector(o) {
  const R = radiusOf(o, 'solids.sector({ radius })'), inner = o.inner === undefined ? 0 : o.inner, from = o.from === undefined ? 0 : o.from, to = o.to === undefined ? 360 : o.to;
  if (!(num(inner) && inner >= 0 && inner < R)) throw fail(CODES.BAD_CALL, 'solids.sector({ inner })', __DEV__ && 'inner is a radius from 0 up to the radius, not ' + show(o.inner));
  if (!(num(from) && num(to) && to >= from)) throw fail(CODES.BAD_CALL, 'solids.sector({ from, to })', __DEV__ && 'from and to are angles in degrees clockwise from straight up, to no less than from, not ' + show([o.from, o.to]));
  const span = Math.min(360, to - from), n = Math.max(2, Math.ceil((ROUND * span) / 360)), whole = span >= 360;
  const at = (rad, deg) => [rad * Math.sin(deg * DEG), rad * Math.cos(deg * DEG), 0], pts = [];
  const steps = whole ? n - 1 : n;
  for (let i = 0; i <= steps; i++) pts.push(at(R, from + (span * i) / n));
  if (inner > 0) for (let i = steps; i >= 0; i--) pts.push(at(inner, from + (span * i) / n));
  else if (!whole) pts.push([0, 0, 0]);
  return flat(pts);
}

// The corners of a regular polygon in the plane at z, the first straight up, going round to the left.
const ring = (n, r, z) => Array.from({ length: n }, (_, i) => { const a = Math.PI / 2 + (i / n) * 2 * Math.PI; return [r * Math.cos(a), r * Math.sin(a), z]; });
function countOf(o, where) {
  const n = o && o.sides;
  if (!(Number.isInteger(n) && n >= 3)) throw fail(CODES.BAD_CALL, where, __DEV__ && 'sides is how many sides the polygon has, a whole number, 3 or more, not ' + show(n));
  return n;
}
function polygon(o) {
  return flat(ring(countOf(o, 'solids.polygon({ sides })'), radiusOf(o, 'solids.polygon({ radius })'), 0));
}
// A regular polygon carried back along z: `depth` deep about the center,
// its back `taper` times the size of its front (0 brings it to a point).
// Its sides: front, back, side.
function prismFaces(n, r, depth, taper) {
  const front = ring(n, r, depth / 2), back = taper > 0 ? ring(n, r * taper, -depth / 2) : null, tip = [0, 0, -depth / 2];
  const out = [{ pts: front, n: [0, 0, 1], side: 'front' }];
  if (back) out.push({ pts: back.slice().reverse(), n: [0, 0, -1], side: 'back' });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, pts = back ? [front[i], back[i], back[j], front[j]] : [front[i], tip, front[j]];
    let nn = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
    if (dot(nn, mean(pts)) < 0) nn = nn.map((x) => -x);
    out.push({ pts, n: nn, side: 'side' });
  }
  return out;
}
function prism(o) {
  const n = countOf(o, 'solids.prism({ sides })'), r = radiusOf(o, 'solids.prism({ radius })'), d = o.depth, t = o.taper === undefined ? 1 : o.taper;
  if (!(num(d) && d > 0)) throw fail(CODES.BAD_CALL, 'solids.prism({ depth })', __DEV__ && 'depth is a number above 0, not ' + show(d));
  if (!(num(t) && t >= 0)) throw fail(CODES.BAD_CALL, 'solids.prism({ taper })', __DEV__ && 'taper is the back\'s size as a share of the front\'s, 0 or more, not ' + show(t));
  return shape(prismFaces(n, r, d, t), t > 0 ? ['front', 'back', 'side'] : ['front', 'side']);
}
// A pyramid standing on its base: the base about the y axis, `height` tall
// about the center, a corner of the base toward the front. Its sides: base, side.
function pyramid(o) {
  const n = countOf(o, 'solids.pyramid({ sides })'), r = radiusOf(o, 'solids.pyramid({ radius })'), h = o.height;
  if (!(num(h) && h > 0)) throw fail(CODES.BAD_CALL, 'solids.pyramid({ height })', __DEV__ && 'height is a number above 0, not ' + show(h));
  const up = (p) => [p[0], -p[2], p[1]];
  return shape(prismFaces(n, r, h, 0).map((f) => ({ pts: f.pts.map(up), n: up(f.n), side: f.side === 'front' ? 'base' : 'side' })), ['base', 'side']);
}

// A sphere has no faces: each draw works out its outline and the outline of
// each of its sides. Undivided, it has one side. `wedges` divides it into
// that many equal segments around an axis (`around`: 'x', 'y' or 'z'; y by
// default), numbered around it, side 0 centered on the front (on the top,
// around z). `bands` divides it across an axis (`along`, y by default) into
// that many slices of equal height, or at the heights given, each between 1
// (the axis' far end) and -1; side 0 is at the far end.
const AXES = { x: 0, y: 1, z: 2 };
function sphere(o) {
  const radius = radiusOf(o, 'solids.sphere({ radius })');
  const axisOf = (k, given) => { const v = given === undefined ? 'y' : given; if (!(typeof v === 'string' && v in AXES)) throw fail(CODES.BAD_CALL, 'solids.sphere({ ' + k + ' })', __DEV__ && "the axis is 'x', 'y' or 'z', not " + show(given)); return AXES[v]; };
  let split = null;
  if (o.wedges !== undefined && o.bands !== undefined) throw fail(CODES.BAD_CALL, 'solids.sphere({ wedges, bands })', __DEV__ && 'a sphere is divided into wedges or into bands, not both');
  if (o.wedges !== undefined) {
    if (!(Number.isInteger(o.wedges) && o.wedges >= 2)) throw fail(CODES.BAD_CALL, 'solids.sphere({ wedges })', __DEV__ && 'wedges is a whole number, 2 or more, not ' + show(o.wedges));
    split = { wedges: o.wedges, axis: axisOf('around', o.around), sides: o.wedges };
  } else if (o.bands !== undefined) {
    const n = o.bands;
    const cuts = Number.isInteger(n) && n >= 2 ? Array.from({ length: n - 1 }, (_, i) => 1 - (2 * (i + 1)) / n)
      : Array.isArray(n) && n.length && n.every((x) => num(x) && x > -1 && x < 1) ? n.slice().sort((p, q) => q - p) : null;
    if (!cuts) throw fail(CODES.BAD_CALL, 'solids.sphere({ bands })', __DEV__ && 'bands is a whole number, 2 or more, or the heights to cut at, each between -1 and 1, not ' + show(n));
    split = { cuts, axis: axisOf('along', o.along), sides: cuts.length + 1 };
  }
  return Object.freeze({ [SHAPE]: true, faces: Object.freeze([]), ball: radius, split });
}

// A null: a transform with nothing to draw, for other shapes to take as their parent.
function nil() {
  return shape([], []);
}

// ---- the stage --------------------------------------------------------------

let stages = 0;

export function solids(target, options) {
  if (!(target && target.namespaceURI === NS)) throw fail(CODES.BAD_CALL, 'solids(target)', __DEV__ && 'target is an SVG element to draw into, such as a <g>, not ' + show(target && target.nodeName));
  const o = options || {};
  const cam = Object.assign({ distance: 5, focal: 900, roll: 0, near: 0.2, fade: 0 }, o.camera);
  const light = Object.assign({ dir: [-0.35, 0.45, 0.85], ramp: ['#111111', '#eeeeee'], gamma: 1.8, floor: 0.03, gain: 0.97, bounce: 0, across: [0.2, 0.18] }, o.light);
  const rim = o.rim === false ? null : Object.assign({ color: '#ffffff', width: 1.5, base: 0.12, edge: 0.5, power: 2 }, o.rim);
  for (const k of ['distance', 'focal', 'near']) if (!(num(cam[k]) && cam[k] > 0)) throw fail(CODES.BAD_CALL, 'solids({ camera: { ' + k + ' } })', __DEV__ && k + ' is a number above 0, not ' + show(cam[k]));
  if (!(cam.near < cam.distance)) throw fail(CODES.BAD_CALL, 'solids({ camera: { near } })', __DEV__ && 'near is less than the distance, not ' + show(cam.near));
  if (!vec(light.dir)) throw fail(CODES.BAD_CALL, 'solids({ light: { dir } })', __DEV__ && 'dir is [x, y, z], not ' + show(light.dir));
  const ramp = Array.isArray(light.ramp) && light.ramp.length >= 2 ? light.ramp.map(rgbOf) : null;
  if (!ramp || ramp.some((c) => !c)) throw fail(CODES.BAD_CALL, 'solids({ light: { ramp } })', __DEV__ && 'ramp is two or more colors as #rrggbb, dark to lit, not ' + show(light.ramp));
  // The other numbers, each named as the call wrote it.
  const nums = (obj, keys, at, close = '') => { for (const k of keys) if (!num(obj[k])) throw fail(CODES.BAD_CALL, 'solids({ ' + at + ': { ' + k + ' } ' + close + '})', __DEV__ && k + ' is a number, not ' + show(obj[k])); };
  const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(num);
  nums(cam, ['roll', 'fade'], 'camera');
  if (cam.center !== undefined && !pair(cam.center)) throw fail(CODES.BAD_CALL, 'solids({ camera: { center } })', __DEV__ && 'center is [x, y] in the target\'s units, not ' + show(cam.center));
  nums(light, ['gamma', 'floor', 'gain', 'bounce'], 'light');
  if (!pair(light.across)) throw fail(CODES.BAD_CALL, 'solids({ light: { across } })', __DEV__ && 'across is [toward the light, away from it], two numbers, not ' + show(light.across));
  if (rim) nums(rim, ['width', 'base', 'edge', 'power'], 'rim');
  const glows = (o.glows || []).map((g, i) => {
    if (!(g && vec(g.dir) && (g.color || g.gradient))) throw fail(CODES.BAD_CALL, 'solids({ glows[' + i + '] })', __DEV__ && 'a glow is { dir: [x, y, z], color } (or gradient, a radialGradient\'s id), not ' + show(g));
    const out = Object.assign({ size: 0.85, strength: 1, sharp: 1.5, spread: 0 }, g, { dir: norm(g.dir) });
    nums(out, ['size', 'strength', 'sharp', 'spread'], 'glows[' + i + ']');
    out.bleed = g.bleed ? Object.assign({ size: 1.7, strength: 0.2, cap: 0, color: g.color }, g.bleed) : null;
    if (out.bleed) nums(out.bleed, ['size', 'strength', 'cap'], 'glows[' + i + ']: { bleed', '} ');
    return out;
  });
  const shadow = o.dropShadow ? Object.assign({ blur: 24, color: '#000000', opacity: 0.35, offset: [0, 0] }, o.dropShadow) : null;
  if (shadow) {
    for (const k of ['blur', 'opacity']) if (!(num(shadow[k]) && shadow[k] >= 0)) throw fail(CODES.BAD_CALL, 'solids({ dropShadow: { ' + k + ' } })', __DEV__ && k + ' is a number, 0 or more, not ' + show(shadow[k]));
    if (!pair(shadow.offset)) throw fail(CODES.BAD_CALL, 'solids({ dropShadow: { offset } })', __DEV__ && 'offset is [x, y] in the target\'s units, not ' + show(shadow.offset));
    if (!(typeof shadow.color === 'string' && shadow.color)) throw fail(CODES.BAD_CALL, 'solids({ dropShadow: { color } })', __DEV__ && 'color is a color, not ' + show(shadow.color));
  }

  const L = norm(light.dir);
  const eye = [0, 0, cam.distance];
  const roll = cam.roll * DEG, cr = Math.cos(roll), sr = Math.sin(roll);
  const view = (target.ownerSVGElement || target).viewBox;
  const vb = view && view.baseVal && view.baseVal.width ? view.baseVal : null;
  const center = cam.center || (vb ? [vb.x + vb.width / 2, vb.y + vb.height / 2] : [0, 0]);
  const zmax = cam.distance - cam.near;
  const project = (p) => {
    const s = cam.focal / (cam.distance - p[2]), x = p[0] * s, y = -p[1] * s;
    return [center[0] + x * cr - y * sr, center[1] + x * sr + y * cr];
  };
  const shadeAt = (t, r) => {
    const x = Math.max(0, Math.min(0.999, t)) * (r.length - 1), i = Math.floor(x), f = x - i;
    const c = r[i].map((a, k) => Math.round(a + (r[i + 1][k] - a) * f));
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  };

  // A shape's own color: a ramp, dark to lit, read through the light as the
  // stage's ramp is; a paint of the page's (a color, url(#gradient)) drawn as
  // it is; or { gradient, angle } or { gradient, from, to }, colors along a
  // line in the shape's own space (degrees round from its x axis, through its
  // middle; or between two of its points), each #rrggbb or #rrggbbaa, evenly
  // spaced, or [offset, color].
  const colorOf = (v, at) => {
    // null takes a color off: the shape is back on the stage's ramp, a side on its shape's color.
    if (v == null) return null;
    if (typeof v === 'string' && v) return { fill: v };
    if (v && typeof v === 'object' && !Array.isArray(v) && 'gradient' in v) {
      const list = v.gradient, hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;
      const ok = Array.isArray(list) && list.length >= 2 && list.every((s) => hex.test(Array.isArray(s) ? s[1] : s) && (!Array.isArray(s) || num(s[0])));
      const point = (p) => p === undefined || (Array.isArray(p) && p.length >= 2 && p.every(num));
      if (!ok || !point(v.from) || !point(v.to) || !v.from !== !v.to || (v.angle !== undefined && !num(v.angle))) throw fail(CODES.BAD_CALL, at, __DEV__ && 'a gradient is { gradient: [colors], angle } or { gradient, from, to }, each color #rrggbb or #rrggbbaa or [offset, color], not ' + show(v));
      const stops = list.map((s, i) => { const c = Array.isArray(s) ? s[1] : s, m = hex.exec(c); return [Array.isArray(s) ? s[0] : i / (list.length - 1), '#' + m[1], m[2] ? n2(parseInt(m[2], 16) / 255) : 1]; });
      return { grad: { stops, angle: v.angle || 0, from: v.from && v.to ? v.from : null, to: v.from && v.to ? v.to : null } };
    }
    const r = Array.isArray(v) && v.length >= 2 ? v.map(rgbOf) : null;
    if (!r || r.some((c) => !c)) throw fail(CODES.BAD_CALL, at, __DEV__ && 'a color is a ramp of two or more #rrggbb colors, dark to lit, or a paint such as url(#id), not ' + show(v));
    return { ramp: r };
  };
  // Grain on a shape or a side: marks as shade() takes them as data, one or a
  // list; or { marks, travel, ...the layer's own options }, for marks with a
  // look of their own; or a list of those, for several looks on one shape.
  // null takes it off. It is kept as a list of { marks, travel, look }.
  const MARKS = ['edge', 'glow', 'band', 'fill'];
  const shadeOf = (v, at) => {
    if (v === null) return null;
    const grouped = (g) => g && typeof g === 'object' && !Array.isArray(g) && 'marks' in g;
    const groups = Array.isArray(v) && v.length && v.every(grouped) ? v : grouped(v) ? [v] : [{ marks: v }];
    return groups.map((g) => {
      const marks = Array.isArray(g.marks) ? g.marks : [g.marks], look = Object.assign({}, g);
      delete look.marks; delete look.travel;
      for (const m of marks) if (!(m && typeof m === 'object' && MARKS.some((k) => k in m))) throw fail(CODES.BAD_CALL, at, __DEV__ && 'a shade is marks, each with one of ' + MARKS.join(', ') + ' (as shade() takes them as data), or { marks, travel, and the layer\'s options }, or a list of those, not ' + show(v));
      return { marks, travel: g.travel !== false, look };
    });
  };
  // What is said of one side, over what is said of the whole shape: `side` is
  // an object for each side, by name for a shape with faces (front, back,
  // ...), in order for a sphere's wedges or bands. A side takes a color and a shade.
  const SIDE_KEYS = ['color', 'shade'];
  const sideOf = (v, ob, at) => {
    const one = (k, s, here) => {
      if (s === undefined || s === null) return;
      if (typeof s !== 'object' || Array.isArray(s)) throw fail(CODES.BAD_CALL, here, __DEV__ && 'a side is an object, such as { color }, not ' + show(s));
      for (const key in s) if (!SIDE_KEYS.includes(key)) throw fail(CODES.BAD_CALL, here + '.' + key, __DEV__ && "'" + key + "' is not something a side takes; it takes " + SIDE_KEYS.join(', '));
      const side = ob.side[k] || (ob.side[k] = {});
      if (s.color !== undefined) side.color = colorOf(s.color, here + '.color');
      if (s.shade !== undefined) side.shade = shadeOf(s.shade, here + '.shade');
    };
    if (ob.ball) {
      const n = ob.split ? ob.split.sides : 1;
      if (!(Array.isArray(v) && v.length <= n)) throw fail(CODES.BAD_CALL, at, __DEV__ && 'side is a list for this sphere, one object for each of its ' + n + ', in order, not ' + show(v));
      v.forEach((s, i) => one(i, s, at + '[' + i + ']'));
      return;
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw fail(CODES.BAD_CALL, at, __DEV__ && 'side is an object for each side by its name (' + (ob.names.join(', ') || 'this shape has none') + '), not ' + show(v));
    for (const k in v) {
      if (!ob.names.includes(k)) throw fail(CODES.BAD_CALL, at + '.' + k, __DEV__ && "'" + k + "' is not a side of this shape; its sides are " + (ob.names.join(', ') || 'not named'));
      one(k, v[k], at + '.' + k);
    }
  };
  const sideColor = (ob, k) => (ob.side[k] && ob.side[k].color) || null;
  // A parent by name (null takes it off), never one that leads back to the shape itself.
  function parentOf(ob, v, at) {
    if (v === null) { ob.parent = null; return; }
    if (!(typeof v === 'string' && v)) throw fail(CODES.BAD_CALL, at, __DEV__ && 'parent is the name of another shape, or null, not ' + show(v));
    for (let up = v, n = 0; up; up = (objects.get(up) || {}).parent, n++) {
      if (up === ob.name || n > 64) throw fail(CODES.BAD_CALL, at, __DEV__ && show(v) + ' leads back to ' + show(ob.name) + ' through its parents');
    }
    ob.parent = v;
  }
  // What a record takes from its shape: its faces or its sphere, its sides' names, how it was made, and how far it reaches.
  function shapeOn(ob, sh) {
    ob.faces = sh.faces; ob.ball = sh.ball || 0; ob.split = sh.split || null; ob.names = sh.sides || []; ob.flat = !!sh.flat; ob.made = sh.made || null;
    ob.reach = sh.ball || Math.max(0, ...sh.faces.map((f) => Math.max(...f.pts.map((p) => Math.hypot(p[0], p[1], p[2])))));
    if (!ob.ball) dropKit(ob);
  }
  // A shape that is not a sphere, or not on the stage, takes its sphere's elements out of the page.
  const dropKit = (ob) => { if (ob.kit) { ob.kit.wrap.remove(); ob.kit = null; } };
  const pivotAt = (v, at) => { if (!vec(v)) throw fail(CODES.BAD_CALL, at, __DEV__ && 'pivot is [x, y, z] in the shape\'s own space, not ' + show(v)); return v.slice(); };
  const orderAt = (v, at) => { if (!num(v)) throw fail(CODES.BAD_CALL, at, __DEV__ && 'order is a number, not ' + show(v)); return v; };

  // ---- the elements: defs, the faces, a bleed layer per glow ----
  const id = 'kns' + (++stages) + '-';
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
  const root = mk('g', { 'data-solids': '' }, target);
  const defs = mk('defs', {}, root);
  const faceLayer = mk('g', {}, root);
  const radial = (name, color, tops) => {
    const g = mk('radialGradient', { id: id + name }, defs);
    tops.forEach(([at, a]) => mk('stop', { offset: at, 'stop-color': color, 'stop-opacity': a }, g));
    return 'url(#' + id + name + ')';
  };
  const glowFill = glows.map((g, k) => (g.gradient ? 'url(#' + g.gradient + ')' : radial('g' + k, g.color, [[0, 1], [0.5, 0.5], [1, 0]])));
  const bleedLayers = glows.map((g) => (g.bleed ? mk('g', {}, root) : null));
  const bleedFill = glows.map((g, k) => (!g.bleed ? null : g.bleed.gradient ? 'url(#' + g.bleed.gradient + ')' : radial('b' + k, g.bleed.color, [[0, 1], [0.5, 0.5], [1, 0]])));
  let shadowFilter = '';
  if (shadow) {
    const m = 4 * shadow.blur + Math.hypot(shadow.offset[0], shadow.offset[1]);
    const f = mk('filter', vb ? { id: id + 's', filterUnits: 'userSpaceOnUse', x: vb.x - m, y: vb.y - m, width: vb.width + 2 * m, height: vb.height + 2 * m } : { id: id + 's', x: '-100%', y: '-100%', width: '300%', height: '300%' }, defs);
    mk('feGaussianBlur', { stdDeviation: shadow.blur }, f);
    shadowFilter = 'url(#' + id + 's)';
  }

  const slots = [];
  let filled = 0, nCast = 0, placed = new Set();
  // A linear gradient in the defs, or in `parent`, for one fill.
  const gradient = (name, parent = defs) => { const g = mk('linearGradient', { id: name, gradientUnits: 'userSpaceOnUse' }, parent); return { g, url: 'url(#' + name + ')', stops: [0, 0.5, 1].map((at) => mk('stop', { offset: at }, g)) }; };
  // A slot draws one face or one sphere. In its group, bottom to top: a
  // face's fill; a sphere's sides, masked to its outline (the sphere's own
  // elements, put in the slot it is drawn in); the shadows that fall on the
  // shape, clipped to its outline; its glows; its rim.
  function slot(i) {
    const grad = gradient(id + 'f' + i);
    const clip = mk('clipPath', { id: id + 'c' + i }, defs), clipPath = mk('path', {}, clip);
    const group = mk('g', {}, faceLayer);
    const path = mk('path', { fill: grad.url }, group);
    const shade = shadow ? mk('g', { filter: shadowFilter }, mk('g', { 'clip-path': 'url(#' + id + 'c' + i + ')', style: 'mix-blend-mode: multiply' }, group)) : null;
    const glowGroup = mk('g', { 'clip-path': 'url(#' + id + 'c' + i + ')' }, group);
    const blobs = glows.map((_, k) => mk('circle', { r: 1, fill: glowFill[k], transform: HIDDEN, opacity: 0 }, glowGroup));
    const edge = rim ? mk('path', { fill: 'none', stroke: rim.color, 'stroke-width': rim.width, 'stroke-linejoin': 'round' }, group) : null;
    // Its bleeds, in each light's layer above the faces: one flat color there,
    // so which slot's bleed sits where changes nothing.
    const spill = glows.map((gl, k) => (gl.bleed ? mk('circle', { r: 1, fill: bleedFill[k], transform: HIDDEN, opacity: 0 }, bleedLayers[k]) : null));
    return { i, grad, clipPath, path, blobs, edge, group, spill, shade, casters: [] };
  }
  // The gradient's stops, each [offset, color, opacity]: as many as listed, and
  // no stop-opacity where none is given, so a gradient back on the ramp writes
  // the markup of one that was always on it.
  function stopsTo(gr, list) {
    while (gr.stops.length < list.length) gr.stops.push(mk('stop', {}, gr.g));
    while (gr.stops.length > list.length) gr.stops.pop().remove();
    list.forEach(([at, c, a], i) => {
      const st = gr.stops[i];
      st.setAttribute('offset', at); st.setAttribute('stop-color', c);
      if (a === undefined) st.removeAttribute('stop-opacity'); else st.setAttribute('stop-opacity', a);
    });
  }
  const BLACK = [[0, '#000'], [0.5, '#000'], [1, '#000']];
  function blankGradient(gr) {
    for (const k of ['x1', 'y1', 'x2', 'y2']) gr.g.setAttribute(k, '0');
    stopsTo(gr, BLACK);
  }
  function blankCaster(c) { c.path.setAttribute('d', ''); c.move.setAttribute('opacity', '0'); c.move.removeAttribute('transform'); c.cl.removeAttribute('clip-path'); }
  function blankPart(p) { p.el.setAttribute('d', ''); p.el.setAttribute('fill', p.grad.url); p.el.removeAttribute('clip-path'); blankGradient(p.grad); }
  // A sphere's own elements, one group that each draw puts into the slot the
  // sphere sorts to: in its defs, the cut for wedges, the mask to its outline
  // and a gradient for each part; then the parts, a path for each, as many as
  // its sides need. Their ids are the slot's, given as the sphere enters it,
  // so they follow where it is drawn and not where it was before.
  function kitOf(ob, i) {
    let k = ob.kit;
    if (!k) {
      const wrap = mk('g', {}), store = mk('defs', {}, wrap);
      k = ob.kit = {
        wrap, store, parts: [], at: -1, cutUrl: '',
        cut: mk('path', { 'clip-rule': 'evenodd', d: '' }, mk('clipPath', { id: '' }, store)),
        // A mask, where a clip would let each side under the top one tint the outline's edge.
        mask: mk('path', { fill: '#fff', d: '' }, mk('mask', { id: '' }, store)),
        layer: mk('g', { mask: '' }, wrap),
      };
    }
    const n = partsOf(ob.split);
    if (k.parts.length !== n) k.at = -1;
    while (k.parts.length < n) k.parts.push({ grad: gradient('', k.store), el: mk('path', { 'fill-rule': 'evenodd' }, k.layer) });
    while (k.parts.length > n) { const p = k.parts.pop(); p.el.remove(); p.grad.g.remove(); }
    if (k.at !== i) {
      k.at = i;
      k.cut.parentNode.id = id + 'w' + i; k.cutUrl = 'url(#' + id + 'w' + i + ')';
      k.mask.parentNode.id = id + 'm' + i; k.layer.setAttribute('mask', 'url(#' + id + 'm' + i + ')');
      k.parts.forEach((p, j) => { p.grad.g.id = id + 'f' + i + '-' + (j + 1); p.grad.url = 'url(#' + p.grad.g.id + ')'; });
    }
    return k;
  }
  function blank(s) {
    for (const e of [s.path, s.clipPath, s.edge]) if (e) e.setAttribute('d', '');
    s.group.setAttribute('opacity', '0'); s.group.removeAttribute('clip-path');
    s.path.setAttribute('fill', s.grad.url);
    blankGradient(s.grad);
    s.casters.forEach(blankCaster);
    if (s.edge) s.edge.setAttribute('stroke-opacity', '0');
    for (const b of s.blobs.concat(s.spill)) if (b) { b.setAttribute('transform', HIDDEN); b.setAttribute('opacity', '0'); }
  }
  // A slot for every face on the stage, and no more, so the DOM depends on
  // what is on the stage now and never on what it held or drew before (a
  // shape whose count of faces changes over time gives up the slots it no
  // longer fills); with a drop shadow, every slot can hold a shadow from
  // every shape.
  function provide() {
    let total = 0, cast = 0;
    for (const ob of objects.values()) {
      if (ob.hidden) continue;
      total += ob.faces.length + (ob.ball ? 1 : 0); cast++;
    }
    while (slots.length > total) {
      const s = slots.pop();
      s.group.remove(); s.grad.g.remove(); s.clipPath.parentNode.remove();
      for (const e of s.spill) if (e) e.remove();
    }
    if (filled > slots.length) filled = slots.length;
    while (slots.length < total) { const s = slot(slots.length); blank(s); slots.push(s); }
    if (!shadow) return;
    nCast = cast;
    for (const s of slots) while (s.casters.length > nCast) s.casters.pop().move.remove();
    for (const s of slots) while (s.casters.length < nCast) {
      const move = mk('g', {}, s.shade), cl = mk('g', {}, move), c = { move, cl, path: mk('path', { fill: shadow.color }, cl) };
      blankCaster(c);
      s.casters.push(c);
    }
  }
  // A shape drawn only inside another's outline, or only outside it: a clip
  // path of each kind for every shape named as a mask, written by each draw.
  const masks = new Map();
  function maskOf(name) {
    let m = masks.get(name);
    if (!m) {
      const k = masks.size;
      const clipOf = (suffix, attrs) => { const c = mk('clipPath', { id: id + suffix + k }, defs); return { path: mk('path', attrs, c), url: 'url(#' + id + suffix + k + ')' }; };
      m = { inside: clipOf('i', {}), outside: clipOf('o', { 'clip-rule': 'evenodd' }) };
      masks.set(name, m);
    }
    return m;
  }
  // The paths a sphere is painted with: one under everything, and one for each side painted over it.
  const partsOf = (sp) => (!sp ? 1 : sp.wedges ? (sp.wedges === 2 ? 2 : sp.wedges + 1) : sp.sides);
  // A path's fill: the page's own paint as it is, or the ramp read at the
  // tone, brighter toward the light, or the shape's own gradient, through
  // the gradient gr.
  function fillWith(el, gr, color, tone, p1, p2, ob) {
    if (color && color.fill) { el.setAttribute('fill', color.fill); blankGradient(gr); return; }
    el.setAttribute('fill', gr.url);
    const ends = (a, b) => { gr.g.setAttribute('x1', n1(a[0])); gr.g.setAttribute('y1', n1(a[1])); gr.g.setAttribute('x2', n1(b[0])); gr.g.setAttribute('y2', n1(b[1])); };
    if (color && color.grad) {
      // Along a line in the shape's own space, so it goes and turns with the shape.
      const G = color.grad, t = G.angle * DEG, far = ob.reach;
      const a = G.from || [-Math.cos(t) * far, -Math.sin(t) * far], b = G.to || [Math.cos(t) * far, Math.sin(t) * far];
      let A = ob.at.point([a[0], a[1], a[2] || 0]), B = ob.at.point([b[0], b[1], b[2] || 0]), stops = G.stops;
      const inA = A[2] <= zmax, inB = B[2] <= zmax;
      if (inA !== inB) {
        // A line that crosses the near plane is cut there, so it lies on the part of the face that is drawn.
        const u = (zmax - A[2]) / (B[2] - A[2]), cut = A.map((x, k) => x + (B[k] - x) * u);
        stops = cutStops(stops, u, inA);
        if (inA) B = cut; else A = cut;
      }
      // Wholly behind the near plane, it is a point: one color, and no face is drawn there to show it.
      if (inA || inB) ends(project(A), project(B)); else ends([0, 0], [0, 0]);
      stopsTo(gr, stops);
      return;
    }
    const r = (color && color.ramp) || ramp;
    ends(p1, p2);
    stopsTo(gr, [[0, shadeAt(tone + light.across[0], r)], [0.5, shadeAt(tone, r)], [1, shadeAt(tone - light.across[1], r)]]);
  }
  // A gradient's stops cut at u along its line, keeping the part before u (or
  // after it): the stops on that part re-spaced on it, and the color the
  // gradient has at u, opacity too, as the new end. Offsets are read as the
  // page reads them: each from 0 to 1, and none below the one before.
  function cutStops(list, u, before) {
    let lo = 0;
    const E = list.map(([o, c, al]) => [lo = Math.max(lo, Math.min(1, Math.max(0, o))), c, al, rgbOf(c)]);
    let i = -1;
    while (i + 1 < E.length && E[i + 1][0] <= u) i++;
    const p = E[Math.max(0, i)], q = E[Math.min(E.length - 1, i + 1)], f = p === q ? 0 : (u - p[0]) / (q[0] - p[0]);
    const hex = '#' + p[3].map((x, k) => { const v = Math.round(x + (q[3][k] - x) * f); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
    const end = [before ? 1 : 0, hex, n2(p[2] + (q[2] - p[2]) * f)], at = (x) => Math.round(x * 1e4) / 1e4;
    return before ? E.filter((s) => s[0] < u).map((s) => [at(s[0] / u), s[1], s[2]]).concat([end])
      : [end].concat(E.filter((s) => s[0] > u).map((s) => [at((s[0] - u) / (1 - u)), s[1], s[2]]));
  }
  // Clockwise on screen from the corner leftmost (then topmost), so a face
  // listed from another corner or the other way round, as after a turn
  // that lands a solid on itself, writes the same path.
  function pathOf(pts) {
    let q = pts.map(project).map((p) => [n1(p[0]), n1(p[1])]);
    let area = 0;
    for (let j = 0; j < q.length; j++) { const k = (j + 1) % q.length; area += q[j][0] * q[k][1] - q[k][0] * q[j][1]; }
    if (area < 0) q = q.reverse();
    let first = 0;
    for (let j = 1; j < q.length; j++) if (q[j][0] < q[first][0] || (q[j][0] === q[first][0] && q[j][1] < q[first][1])) first = j;
    return 'M' + q.slice(first).concat(q.slice(0, first)).map((p) => p[0] + ' ' + p[1]).join(' L') + ' Z';
  }

  // ---- the objects ----
  const objects = new Map();
  const where = (name, call) => 'solids: ' + call + '(' + show(name) + ')';

  const stage = {
    add(name, sh, opts) {
      if (typeof name !== 'string' || !name) throw fail(CODES.BAD_CALL, 'solids: add(name)', __DEV__ && 'name is a string, not ' + show(name));
      const at = where(name, 'add');
      if (!(sh && sh[SHAPE])) throw fail(CODES.BAD_CALL, at, __DEV__ && 'the shape is from solids.box(), solids.faces(), solids.plane(), solids.disc(), solids.sector(), solids.capsule(), solids.polygon(), solids.prism(), solids.pyramid(), solids.sphere() or solids.null()');
      const a = Object.assign({ albedo: 1, glow: 1, rim: 1, casts: 1 }, opts);
      for (const k of ['albedo', 'glow', 'rim', 'casts']) if (!num(a[k])) throw fail(CODES.BAD_CALL, at + '.' + k, __DEV__ && k + ' is a number, not ' + show(a[k]));
      const clip = a.clip === undefined ? null : typeof a.clip === 'string' ? { shape: a.clip } : a.clip;
      if (clip && !(typeof clip.shape === 'string' && clip.shape)) throw fail(CODES.BAD_CALL, at + '.clip', __DEV__ && 'clip is the name of another shape, or { shape, invert }, not ' + show(a.clip));
      const ob = {
        name, outline: '', drawn: [], polys: [], at: null, parent: null, clipBy: clip, clip: '', shade: null, side: sh.ball ? [] : {},
        color: colorOf(a.color, at + '.color'), pivot: [0, 0, 0], hidden: !!a.hidden,
        casts: Math.max(0, Math.min(1, a.casts)), accepts: a.accepts !== false,
        albedo: a.albedo, glow: a.glow, rim: a.rim, rotate: [0, 0, 0], scale: [1, 1, 1], position: [0, 0, 0], opacity: 1, order: 0,
      };
      if (a.order !== undefined) ob.order = orderAt(a.order, at + '.order');
      shapeOn(ob, sh);
      if (a.side !== undefined) sideOf(a.side, ob, at + '.side');
      if (a.shade !== undefined) ob.shade = shadeOf(a.shade, at + '.shade');
      if (a.parent !== undefined) parentOf(ob, a.parent, at + '.parent');
      if (a.pivot !== undefined) ob.pivot = pivotAt(a.pivot, at + '.pivot');
      if (clip) ob.clip = maskOf(clip.shape)[clip.invert ? 'outside' : 'inside'].url;
      objects.set(name, ob);
      provide();
      return stage;
    },
    set(name, props) {
      const ob = objects.get(name);
      if (!ob) throw fail(CODES.BAD_CALL, where(name, 'set'), __DEV__ && 'no shape is named ' + show(name) + '; the shapes are ' + ([...objects.keys()].join(', ') || 'none'));
      const p = props || {}, at = where(name, 'set');
      for (const k in p) if (!SET_KEYS.includes(k)) throw fail(CODES.BAD_CALL, at + '.' + k, __DEV__ && "'" + k + "' is not something set() places; it takes " + SET_KEYS.join(', '));
      if (p.rotate !== undefined) { if (!vec(p.rotate)) throw fail(CODES.BAD_CALL, at + '.rotate', __DEV__ && 'rotate is [x, y, z] in degrees, not ' + show(p.rotate)); ob.rotate = p.rotate.slice(); }
      if (p.scale !== undefined) { const s = num(p.scale) ? [p.scale, p.scale, p.scale] : p.scale; if (!vec(s)) throw fail(CODES.BAD_CALL, at + '.scale', __DEV__ && 'scale is a number or [x, y, z], not ' + show(p.scale)); ob.scale = s.slice(); }
      if (p.position !== undefined) { if (!vec(p.position)) throw fail(CODES.BAD_CALL, at + '.position', __DEV__ && 'position is [x, y, z], not ' + show(p.position)); ob.position = p.position.slice(); }
      if (p.opacity !== undefined) { if (!num(p.opacity)) throw fail(CODES.BAD_CALL, at + '.opacity', __DEV__ && 'opacity is a number from 0 to 1, not ' + show(p.opacity)); ob.opacity = Math.max(0, Math.min(1, p.opacity)); }
      // shape: another shape in its place; or some of its numbers, the rest as they were.
      if (p.shape !== undefined) {
        const v = p.shape;
        if (v && v[SHAPE]) shapeOn(ob, v);
        else if (v && typeof v === 'object' && !Array.isArray(v) && ob.made) shapeOn(ob, ob.made[0](Object.assign({}, ob.made[1], v)));
        else throw fail(CODES.BAD_CALL, at + '.shape', __DEV__ && (ob.made ? 'shape is a shape, or some of its numbers such as { radius: 2 }, not ' + show(v) : 'this shape was made from a list, so it takes a whole shape, not ' + show(v)));
        provide();
      }
      if (p.color !== undefined) ob.color = colorOf(p.color, at + '.color');
      if (p.side !== undefined) sideOf(p.side, ob, at + '.side');
      if (p.shade !== undefined) ob.shade = shadeOf(p.shade, at + '.shade');
      if (p.parent !== undefined) parentOf(ob, p.parent, at + '.parent');
      if (p.pivot !== undefined) ob.pivot = pivotAt(p.pivot, at + '.pivot');
      if (p.order !== undefined) ob.order = orderAt(p.order, at + '.order');
      if (p.casts !== undefined) { if (!num(p.casts)) throw fail(CODES.BAD_CALL, at + '.casts', __DEV__ && 'casts is a number from 0 to 1, not ' + show(p.casts)); ob.casts = Math.max(0, Math.min(1, p.casts)); }
      return stage;
    },
    remove(name) { const ob = objects.get(name); if (ob) { dropKit(ob); objects.delete(name); provide(); } return stage; },
    draw,
    dispose() {
      root.remove(); objects.clear();
      for (const Lr of layers.values()) { Lr.handle.dispose(); if (Lr.canvas !== grain.canvas) Lr.canvas.remove(); }
      layers.clear();
    },
    project,
  };

  // Each object's corners and normals in the eye's space: moved by its pivot,
  // scaled, turned about x, then y, then z, and moved; a normal through the
  // inverse scale. A shape with a parent goes where its own transform puts it
  // in its parent's space, and then wherever the parent's transform, and its
  // parent's, puts that. Only the transform is passed down: opacity, color
  // and the rest stay the shape's own.
  function placer(ob, seen = 0) {
    const own = placeOwn(ob), up = ob.parent ? objects.get(ob.parent) : null;
    if (!up) return own;
    if (seen > 64) throw fail(CODES.BAD_CALL, where(ob.name, 'set') + '.parent', __DEV__ && 'its parents lead back to itself');
    const pl = placer(up, seen + 1);
    return { point: (q) => pl.point(own.point(q)), normal: (n) => pl.normal(own.normal(n)), flat: own.flat || pl.flat };
  }
  function placeOwn(ob) {
    const [ax, ay, az] = ob.rotate.map((d) => d * DEG);
    const c = [Math.cos(ax), Math.cos(ay), Math.cos(az)], s = [Math.sin(ax), Math.sin(ay), Math.sin(az)];
    const turn = (p) => {
      let [x, y, z] = p;
      [y, z] = [y * c[0] - z * s[0], y * s[0] + z * c[0]];
      [x, z] = [x * c[1] + z * s[1], -x * s[1] + z * c[1]];
      [x, y] = [x * c[2] - y * s[2], x * s[2] + y * c[2]];
      return [x, y, z];
    };
    return {
      point: (p) => { const q = turn([(p[0] - ob.pivot[0]) * ob.scale[0], (p[1] - ob.pivot[1]) * ob.scale[1], (p[2] - ob.pivot[2]) * ob.scale[2]]); return [q[0] + ob.position[0], q[1] + ob.position[1], q[2] + ob.position[2]]; },
      normal: (n) => norm(turn([n[0] / ob.scale[0], n[1] / ob.scale[1], n[2] / ob.scale[2]])),
      flat: ob.scale.includes(0),
    };
  }

  // Sutherland-Hodgman against the plane `near` in front of the eye.
  function clipNear(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ina = a[2] <= zmax, inb = b[2] <= zmax;
      if (ina) out.push(a);
      if (ina !== inb) { const t = (zmax - a[2]) / (b[2] - a[2]); out.push(a.map((x, k) => x + (b[k] - x) * t)); }
    }
    return out;
  }

  // Where on the plane (c, n) light from l reflects into the eye, or null.
  function reflectPoint(c, n, l) {
    const nl = dot(n, l);
    if (nl <= 1e-3) return null;
    const R = [2 * nl * n[0] - l[0], 2 * nl * n[1] - l[1], 2 * nl * n[2] - l[2]], t = dot(n, sub(eye, c)) / nl;
    return eye.map((x, k) => x - t * R[k]);
  }

  function draw() {
    let items = [];
    for (const ob of objects.values()) {
      ob.outline = ''; ob.drawn = []; ob.polys = [];
      if (ob.clipBy && !objects.has(ob.clipBy.shape)) throw fail(CODES.BAD_CALL, where(ob.name, 'draw'), __DEV__ && 'its clip names ' + show(ob.clipBy.shape) + ', and no shape is named that; the shapes are ' + [...objects.keys()].join(', '));
    }
    for (const ob of objects.values()) {
      // Unseen, or flat on an axis scaled to 0 (its own, or a parent's), with no area to draw.
      if (ob.opacity <= 0.001) continue;
      const at = ob.at = placer(ob);
      if (at.flat) continue;
      let ball = null;
      if (ob.ball) {
        // Round by its x scale; one that reaches the near plane is not drawn, and one brushing past the camera
        // thins out as a face does, by its nearest point.
        const c = at.point([0, 0, 0]), R = ob.ball * Math.hypot(...sub(at.point([1, 0, 0]), c)), toEye = sub(eye, c), far = Math.hypot(toEye[0], toEye[1], toEye[2]);
        const close = cam.fade > 0 ? ease(cam.distance - (c[2] + R), cam.near, cam.near + cam.fade) : 1;
        if (c[2] + R < zmax && far > R) ball = { ob, ball: true, c, R, far, w: norm(toEye), turn: at.normal, alpha: ob.opacity * close, screen: project(c) };
      }
      if (ob.hidden) {
        // A mask: its outline alone, whichever way its faces are turned.
        if (ball) { ob.outline = ballGeom(ball); ob.polys.push(ball.poly); }
        else ob.outline = ob.faces.map((f) => { const pts = clipNear(f.pts.map(at.point)); if (pts.length < 3) return ''; ob.polys.push(pts.map(project)); return pathOf(pts); }).filter(Boolean).join(' ');
        continue;
      }
      if (ball) items.push(ball);
      ob.faces.forEach((f) => {
        let n = at.normal(f.n), color = (f.side && sideColor(ob, f.side)) || ob.color;
        const full = f.pts.map(at.point), c0 = mean(full), side = dot(n, sub(eye, c0));
        if (!(side > 0)) {
          // Facing away: a flat shape's back, when it has a color; or no normal to face by.
          if (!(ob.flat && sideColor(ob, 'back') && side < 0)) return;
          n = n.map((x) => -x); color = sideColor(ob, 'back');
        }
        const pts = clipNear(full);
        if (pts.length < 3) return;
        const c = mean(pts), toEye = sub(eye, c), far = Math.hypot(toEye[0], toEye[1], toEye[2]);
        const span = Math.max(...full.map((p) => Math.hypot(...sub(p, c0))));
        // A face brushing past the camera thins out instead of filling the frame.
        const close = cam.fade > 0 ? ease(cam.distance - Math.max(...pts.map((p) => p[2])), cam.near, cam.near + cam.fade) : 1;
        items.push({ ob, color, side: f.side, pts, n, c, far, span, view: dot(n, norm(toEye)), alpha: ob.opacity * close, screen: project(c) });
      });
    }
    // By order, then far first; a tie by place on screen, never by which object or face.
    items.sort((a, b) => a.ob.order - b.ob.order || (Math.abs(b.far - a.far) > 1e-7 ? b.far - a.far : a.screen[0] - b.screen[0] || a.screen[1] - b.screen[1]));
    // Every outline before anything is painted, so a mask is ready whichever shape is drawn first.
    for (const f of items) { if (f.ball) f.d = ballGeom(f); else { f.d = pathOf(f.pts); f.poly = f.pts.map(project); } }
    // A middle's distance misleads beside a large face: a small shape in front of a wall, off to the side, is
    // farther from the eye than the wall's middle. So of two whose outlines on screen overlap, the one wholly
    // behind the other's plane, or with the other wholly on the eye's side of its own, goes first. A pair that
    // says neither, or both, keeps its order by distance, and so does every pair that does not overlap, and each
    // one caught in a ring.
    const off = (f, p) => f.n[0] * (p[0] - f.c[0]) + f.n[1] * (p[1] - f.c[1]) + f.n[2] * (p[2] - f.c[2]);
    // Is b wholly on one side of the face a's plane: the eye's (s 1) or the far one (s -1)?
    const beyond = (a, b, s) => !a.ball && (b.ball ? s * off(a, b.c) >= b.R - 1e-6 : b.pts.every((p) => s * off(a, p) >= -1e-6));
    const under = (a, b) => beyond(a, b, 1) || beyond(b, a, -1);
    // Two outlines that only touch do not overlap; with the drop shadow on, two within its reach do, since one
    // shadows the other from there.
    const gap = shadow ? Math.hypot(shadow.offset[0], shadow.offset[1]) + 3 * shadow.blur : -0.5;
    const reach = (P, x, y) => { let lo = Infinity, hi = -lo; for (const p of P) { const d = p[0] * x + p[1] * y; if (d < lo) lo = d; if (d > hi) hi = d; } return [lo, hi]; };
    // Does a line along one of P's edges have P and Q on opposite sides, more than `gap` apart? An outline of
    // many corners is tried by eight of its edges.
    const split = (P, Q) => {
      for (let i = 0, step = Math.ceil(P.length / 8); i < P.length; i += step) {
        const a = P[i], b = P[(i + 1) % P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, x = (b[1] - a[1]) / l, y = (a[0] - b[0]) / l, u = reach(P, x, y), v = reach(Q, x, y);
        if (u[0] > v[1] + gap || v[0] > u[1] + gap) return 1;
      }
    };
    // Each outline's box on screen, half the gap wider all round, in one list of numbers: most pairs are told
    // apart by their boxes, and there are as many pairs as the square of the faces.
    const first = items.map(() => []), bx = new Float64Array(4 * items.length);
    items.forEach((f, i) => {
      const xs = f.poly.map((p) => p[0]), ys = f.poly.map((p) => p[1]);
      bx.set([Math.min(...xs) - gap / 2, Math.min(...ys) - gap / 2, Math.max(...xs) + gap / 2, Math.max(...ys) + gap / 2], 4 * i);
    });
    for (let i = 0; i < items.length; i++) {
      const a = items[i], x0 = bx[4 * i], y0 = bx[4 * i + 1], x1 = bx[4 * i + 2], y1 = bx[4 * i + 3];
      for (let j = i + 1, k = 4 * j; j < items.length; j++, k += 4) {
        if (bx[k] > x1 || x0 > bx[k + 2] || bx[k + 1] > y1 || y0 > bx[k + 3]) continue;
        const b = items[j];
        if (a.ob.order !== b.ob.order || split(a.poly, b.poly) || split(b.poly, a.poly)) continue;
        const ab = under(a, b);
        if (ab !== under(b, a)) first[ab ? j : i].push(ab ? i : j);
      }
    }
    const sorted = [];
    const put = (i) => { if (!items[i].put) { items[i].put = 1; first[i].forEach(put); sorted.push(items[i]); } };
    items.forEach((f, i) => put(i));
    items = sorted;
    items.forEach((f, i) => { f.ob.outline += (f.ob.outline ? ' ' : '') + f.d; f.ob.drawn.push([i, f.d]); f.ob.polys.push(f.poly); });
    for (const [name, m] of masks) {
      const ob = objects.get(name), d = ob ? ob.outline : '';
      m.inside.path.setAttribute('d', d);
      m.outside.path.setAttribute('d', EVERYWHERE + d);
    }

    for (let i = items.length; i < filled; i++) blank(slots[i]);
    filled = items.length;
    const was = placed;
    placed = new Set();

    items.forEach((f, i) => {
      const s = slots[i];
      if (f.ob.clip) s.group.setAttribute('clip-path', f.ob.clip); else s.group.removeAttribute('clip-path');
      // The shadows on it: each shape that casts one, by the outlines it drew nearer the eye than this.
      if (shadow) {
        let k = 0;
        for (const co of objects.values()) {
          if (co.hidden) continue;
          const e = s.casters[k++], d = co === f.ob || !f.ob.accepts || co.casts <= 0 ? '' : co.drawn.filter((x) => x[0] > i).map((x) => x[1]).join(' ');
          if (!d) { blankCaster(e); continue; }
          e.path.setAttribute('d', d);
          e.move.setAttribute('transform', 'translate(' + n1(shadow.offset[0]) + ' ' + n1(shadow.offset[1]) + ')');
          e.move.setAttribute('opacity', String(Math.round(shadow.opacity * co.casts * co.opacity * 1000) / 1000));
          if (co.clip) e.cl.setAttribute('clip-path', co.clip); else e.cl.removeAttribute('clip-path');
        }
        for (; k < s.casters.length; k++) blankCaster(s.casters[k]);
      }
      if (f.ball) return drawBall(f, s, i);
      const d = f.d;
      for (const e of [s.path, s.clipPath, s.edge]) if (e) e.setAttribute('d', d);
      s.group.setAttribute('opacity', String(Math.round(f.alpha * 1000) / 1000));
      // Lit by its angle, with the ground's bounce in faces turned down.
      const l = Math.max(0, dot(f.n, L));
      const tone = (light.floor + light.gain * Math.pow(l, light.gamma)) * f.ob.albedo + light.bounce * Math.max(0, -f.n[1]);
      // Across the face: brighter on its side toward the light.
      let lt = L.map((x, k) => x - dot(L, f.n) * f.n[k]);
      if (Math.hypot(...lt) < 1e-3) lt = cross(f.n, [0, 0, 1]);
      if (Math.hypot(...lt) < 1e-3) lt = cross(f.n, [0, 1, 0]);
      lt = norm(lt);
      // Each end held in front of the near plane, so a face that crosses it
      // keeps its gradient on the part drawn; a face clear of it is as before.
      const reach = (dd) => (dd * lt[2] > 0 ? Math.min(f.span, (zmax - f.c[2]) / Math.abs(lt[2])) : f.span);
      const r1 = reach(1), r2 = reach(-1);
      const p1 = project(f.c.map((x, k) => x + lt[k] * r1)), p2 = project(f.c.map((x, k) => x - lt[k] * r2));
      fillWith(s.path, s.grad, f.color, tone, p1, p2, f.ob);
      const u = lt, v = norm(cross(f.n, u)), facing = ease(f.view, 0, 0.3);
      glows.forEach((G, k) => {
        const b = s.blobs[k], bl = s.spill[k], P = reflectPoint(f.c, f.n, G.dir);
        const hide = () => { for (const e of [b, bl]) if (e) { e.setAttribute('transform', HIDDEN); e.setAttribute('opacity', '0'); } };
        if (!P) return hide();
        // Tethered: it slides in from an edge, crosses the face and leaves.
        let dP = sub(P, f.c);
        const dist = Math.hypot(...dP), far = 1.1 * f.span;
        if (G.spread) {
          // Spread: at the face's middle when the face mirrors the light to the eye, and at its edge when it
          // is turned `spread` degrees from that, whatever the camera's distance. Below 0 it crosses the other way.
          const mirror = norm(G.dir.map((x, j) => x + (eye[j] - f.c[j]) / f.far)), off = Math.acos(Math.max(-1, Math.min(1, dot(f.n, mirror)))) / DEG;
          const to = Math.min(far, (far * off) / Math.abs(G.spread)) * Math.sign(G.spread);
          dP = dist > 1e-9 ? dP.map((x) => (x * to) / dist) : dP;
        } else if (dist > far) dP = dP.map((x) => (x * far) / dist);
        const Q = f.c.map((x, j) => x + dP[j]), r = G.size * f.span, E = 0.001;
        if (Q[2] > zmax) return hide();
        // The ellipse from the projection's local slope at its center.
        const o2 = project(Q), qu = project(Q.map((x, j) => x + u[j] * r * E)), qv = project(Q.map((x, j) => x + v[j] * r * E));
        const a = [(qu[0] - o2[0]) / E, (qu[1] - o2[1]) / E, (qv[0] - o2[0]) / E, (qv[1] - o2[1]) / E];
        const H = norm(G.dir.map((x, j) => x + (eye[j] - f.c[j]) / f.far));
        const w = G.strength * Math.pow(Math.max(0, dot(f.n, H)), G.sharp) * f.ob.glow * facing;
        b.setAttribute('transform', 'matrix(' + a.map(n1).join(' ') + ' ' + n1(o2[0]) + ' ' + n1(o2[1]) + ')');
        b.setAttribute('opacity', String(n2(w)));
        if (bl) {
          const B = G.bleed.size, rs = Math.hypot(a[0], a[1]) * B, big = G.bleed.cap > 0 ? Math.min(1, G.bleed.cap / Math.max(1, rs)) : 1;
          bl.setAttribute('transform', 'matrix(' + a.map((x) => n1(x * B)).join(' ') + ' ' + n1(o2[0]) + ' ' + n1(o2[1]) + ')');
          bl.setAttribute('opacity', String(n2(w * G.bleed.strength * f.alpha * big)));
        }
      });
      if (s.edge) s.edge.setAttribute('stroke-opacity', String(n2(f.ob.rim * (rim.base + rim.edge * Math.pow(1 - Math.abs(f.view), rim.power)))));
    });
    // A sphere not drawn this time takes its elements out of the page.
    for (const k of was) if (!placed.has(k)) k.wrap.remove();
    shadePlan(items);
    return stage;
  }

  // A sphere's outline is the circle where the lines from the eye touch it,
  // projected: `lift` toward the eye from its center, `rho` in radius, across
  // the line of sight. ballGeom() keeps those on the item and returns the
  // outline's path, and the path of a square well outside it.
  function ballGeom(f) {
    const { c, R, w, far } = f;
    const a = norm(Math.abs(w[1]) < 0.9 ? cross([0, 1, 0], w) : cross([1, 0, 0], w)), b = cross(w, a);
    f.lift = (R * R) / far; f.rho = R * Math.sqrt(1 - (R * R) / (far * far));
    const at = (x, y) => c.map((v, k) => v + w[k] * f.lift + f.rho * (x * a[k] + y * b[k]));
    const whole = [];
    for (let i = 0; i < ROUND; i++) { const phi = (i / ROUND) * 2 * Math.PI; whole.push(at(Math.cos(phi), Math.sin(phi))); }
    f.all = pathOf([at(1.5, 1.5), at(-1.5, 1.5), at(-1.5, -1.5), at(1.5, -1.5)]);
    f.poly = whole.map(project);
    return pathOf(whole);
  }
  // The part of a sphere in sight on the side of a plane that the plane's
  // normal m points to, the plane d radii from the center along m (0: through
  // the center): 'all', '' for none, or its path. Where the part reaches the
  // sphere's outline the path runs past it, and the slot masks to the
  // outline, so the outline's edge is drawn once however many parts meet it.
  // A part, or what it leaves, less than a pixel wide is all or none.
  function cap(f, m, d) {
    const { c, R, w, lift, rho } = f, cT = dot(m, w);
    // The point nearest the eye stands for the whole when the plane's circle is out of sight.
    const whole = () => (cT >= d ? 'all' : '');
    let a = m.map((x, k) => x - cT * w[k]);
    const sT = Math.hypot(a[0], a[1], a[2]);
    if (sT < 1e-9) return whole();
    a = a.map((x) => x / sT);
    const b = cross(w, a), e2 = cross(m, b), rc = R * Math.sqrt(1 - d * d);
    // The outline is on the plane's side where cos(phi) >= K; the plane's circle faces the eye where sin(psi) >= J.
    const K = (d * R - lift * cT) / (rho * sT), J = (lift - d * R * cT) / (rc * sT);
    const rimAt = (phi, k) => c.map((x, q) => x + w[q] * lift + k * rho * (Math.cos(phi) * a[q] + Math.sin(phi) * b[q]));
    const edge = (psi) => c.map((x, q) => x + d * R * m[q] + rc * (Math.cos(psi) * b[q] + Math.sin(psi) * e2[q]));
    if (J >= 1) return whole();
    if (J <= -1) {
      // The whole circle faces the eye: the part is the spot inside it, or everything but that spot.
      const loop = [];
      for (let i = 0; i < ROUND; i++) loop.push(edge((i / ROUND) * 2 * Math.PI));
      return K < 0 ? f.all + ' ' + pathOf(loop) : pathOf(loop);
    }
    if (K >= 1 || K <= -1) return whole();
    const mid = project(edge(Math.PI / 2)), gap = (p) => Math.hypot(p[0] - mid[0], p[1] - mid[1]);
    if (gap(project(rimAt(0, 1))) < 1) return '';
    if (gap(project(rimAt(Math.PI, 1))) < 1) return 'all';
    const phi0 = Math.acos(K), psi0 = Math.asin(J), pts = [];
    const n = Math.max(2, Math.ceil((ROUND * phi0) / Math.PI)), e = ROUND / 2;
    for (let i = 0; i <= n; i++) pts.push(rimAt(-phi0 + (2 * phi0 * i) / n, 1.06));
    for (let i = 0; i <= e; i++) pts.push(edge(psi0 + ((Math.PI - 2 * psi0) * i) / e));
    return pathOf(pts);
  }
  function drawBall(f, s, slotAt) {
    const { c, R, w, ob, d } = f, sp = ob.split, col = (i) => sideColor(ob, i) || ob.color, kit = kitOf(ob, slotAt);
    // Its elements, just above the slot's own face path.
    if (s.path.nextSibling !== kit.wrap) s.group.insertBefore(kit.wrap, s.path.nextSibling);
    placed.add(kit);
    // What to paint, bottom to top, each [part, color, cut]: one color under
    // everything, then each side over it. A later side covers the edge of an
    // earlier one, so no two sides meet at a seam.
    const plan = [], dir = (v) => f.turn(v);
    let cutD = '';
    if (!sp) plan.push(['all', col(0)]);
    else if (sp.wedges) {
      // Each side is the half of the sphere that starts at its own edge; the
      // next side's half paints over all but one wedge of it. The halves that
      // start in the second half of the turn are cut where side 0 begins.
      const n = sp.wedges, step = 360 / n, u = sp.axis === 0 ? 1 : 0, v = sp.axis === 2 ? 1 : 2;
      const normalAt = (deg) => { const t = (deg + 90) * DEG, p = [0, 0, 0]; p[u] = Math.cos(t); p[v] = Math.sin(t); return dir(p); };
      const first = 90 - step / 2;
      plan.push(['all', col(n - 1)]);
      for (let k = 0; k < (n === 2 ? 1 : n); k++) plan.push([cap(f, normalAt(first + k * step), 0), col(k), k * step >= 180 - 1e-9]);
      cutD = cap(f, normalAt(first).map((x) => -x), -0.004);
    } else {
      const axis = [0, 0, 0]; axis[sp.axis] = 1;
      const m = dir(axis), n = sp.sides;
      plan.push(['all', col(n - 1)]);
      for (let i = n - 2; i >= 0; i--) plan.push([cap(f, m, sp.cuts[i]), col(i)]);
    }
    for (const e of [s.clipPath, kit.mask, s.edge]) if (e) e.setAttribute('d', d);
    s.path.setAttribute('d', ''); s.path.setAttribute('fill', s.grad.url); blankGradient(s.grad);
    kit.cut.setAttribute('d', cutD === 'all' ? f.all : cutD);
    s.group.setAttribute('opacity', String(Math.round(f.alpha * 1000) / 1000));
    // Lit as a face turned to the eye would be, brighter on its side toward the light.
    const tone = (light.floor + light.gain * Math.pow(Math.max(0, dot(w, L)), light.gamma)) * ob.albedo;
    let lt = L.map((x, k) => x - dot(L, w) * w[k]);
    if (Math.hypot(...lt) < 1e-3) lt = Math.abs(w[1]) < 0.9 ? cross([0, 1, 0], w) : cross([1, 0, 0], w);
    lt = norm(lt);
    const p1 = project(c.map((x, k) => x + lt[k] * R)), p2 = project(c.map((x, k) => x - lt[k] * R));
    kit.parts.forEach((part, k) => {
      const p = plan[k];
      if (!p || !p[0]) return blankPart(part);
      part.el.setAttribute('d', p[0] === 'all' ? f.all : p[0]);
      fillWith(part.el, part.grad, p[1], tone, p1, p2, ob);
      if (p[2] && cutD !== 'all') part.el.setAttribute('clip-path', kit.cutUrl); else part.el.removeAttribute('clip-path');
    });
    for (const e of s.blobs.concat(s.spill)) if (e) { e.setAttribute('transform', HIDDEN); e.setAttribute('opacity', '0'); }
    if (s.edge) s.edge.setAttribute('stroke-opacity', String(n2(ob.rim * rim.base)));
  }

  // ---- grain: Kinetic's shade() on a canvas over the stage ----
  // The stage's `shade` names the canvas, and gives the layer's options
  // (scene, kind, scale, fps...). A shape's `shade`, or a side's, is marks as
  // shade() takes them as data, in the shape's own space and units, each
  // cut to the side it is on:
  //   { edge: { width: 0.14 }, ink }                    inward from the outline
  //   { glow: { at: [x, y], radius, invert }, ink }     from a point out
  //   { band: { from, to, width, side }, ink }          along a line
  //   { fill: 0.3, ink }                                everywhere
  // A glow's `at` may be { point, offset }, a named point of the shape
  // (center; a capsule's left and right), and any mark may take within:
  // { point, radius }, kept inside a circle about such a point.
  // The specks go where the shape goes: each shape with a shade has a canvas
  // of its own, a copy of the stage's, that follows it. { marks, travel:
  // false } leaves a shape's specks where they are on the frame, and those
  // shapes share one canvas. On every canvas, each shape nearer the eye rubs
  // out the grain it covers, so the grain keeps the stage's order.
  const grain = o.shade || null;
  const layers = new Map();
  let shadeList = [];
  const lent = new Map();
  function layerFor(key, look) {
    let layer = layers.get(key);
    if (layer) return layer;
    const make = self.wildflower && self.wildflower.kinetic && self.wildflower.kinetic.shade;
    if (!(grain && grain.canvas && typeof grain.canvas.getContext === 'function' && make)) throw fail(CODES.BAD_CALL, 'solids({ shade: { canvas } })', __DEV__ && 'a shape with a shade needs a canvas over the stage for its grain: solids(target, { shade: { canvas, scene, kind } })');
    // A browser keeps about sixteen such canvases alive on a page and drops the oldest past that.
    if (layers.size >= 12) throw fail(CODES.BAD_CALL, 'solids: shade', __DEV__ && 'each shade whose specks travel has a canvas of its own, and so has each look among those that do not, and this stage has twelve; give more of them { marks, travel: false } and one look, to share a canvas');
    // The stage's own canvas first, then copies of it, each after the last.
    let canvas = grain.canvas;
    if (layers.size) { canvas = grain.canvas.cloneNode(false); grain.canvas.parentNode.insertBefore(canvas, grain.canvas.nextSibling); }
    // The stage's options for its layers, under the look this shade asked for. A look of another kind
    // takes only what every kind takes from the stage, since the rest are the stage's kind's own.
    const options = Object.assign({}, grain);
    delete options.canvas;
    if (look.kind && look.kind !== grain.kind) for (const k in options) if (!['scene', 'fps', 'delay', 'freeze', 'opacity', 'blend'].includes(k)) delete options[k];
    Object.assign(options, look);
    layer = { key, canvas, kind: options.kind || 'stipple', x: 0, y: 0, home: null };
    layer.handle = make(canvas, Object.assign(options, { marks: (m) => paintLayer(layer, m) }));
    layers.set(key, layer);
    return layer;
  }
  // From the target's units to a canvas's own px, as the canvas now lies.
  function onto(canvas) {
    const r = canvas.getBoundingClientRect(), k = r.width ? canvas.clientWidth / r.width : 1;
    return new DOMMatrix().scale(k).translate(-r.left, -r.top).multiply(target.getScreenCTM());
  }
  const spot = (M, p) => { const q = M.transformPoint(new DOMPoint(p[0], p[1])); return [q.x, q.y]; };
  // What each canvas needs of the draw just made: every outline, far to near, and the marks on it.
  function shadePlan(items) {
    const seen = new Set();
    shadeList = items.map((f) => {
      const ob = f.ob, own = (f.side && ob.side[f.side] && ob.side[f.side].shade) || ob.shade || [];
      const by = ob.clipBy ? objects.get(ob.clipBy.shape) : null;
      // A shade whose specks travel has a canvas to itself while it is drawn; the rest share one for each look.
      const groups = own.map((g, i) => ({ key: g.travel ? null : 'still ' + JSON.stringify(g.look), want: g.travel ? ob.name + ' ' + i : null, kind: JSON.stringify(g.look), marks: g.marks, look: g.look, follows: g.travel ? ob : null }));
      return { ob, d: f.d, poly: f.poly, groups, clip: ob.clipBy ? { d: by ? by.outline : '', polys: by ? by.polys : [], invert: !!ob.clipBy.invert } : null };
    });
    // A traveling shade borrows a canvas of its look while its shape is drawn, and gives it back when it is not, so
    // shapes never on screen together share one.
    const wanted = new Set();
    for (const e of shadeList) for (const g of e.groups) if (g.want) wanted.add(g.want);
    for (const [want, key] of lent) if (!wanted.has(want)) { lent.delete(want); const Lr = layers.get(key); if (Lr) Lr.home = null; }
    const taken = new Set(lent.values());
    for (const e of shadeList) for (const g of e.groups) {
      if (!g.want) continue;
      if (!lent.has(g.want)) {
        let n = 0, key;
        do key = 'travel ' + g.kind + ' ' + n++; while (taken.has(key));
        lent.set(g.want, key);
        taken.add(key);
      }
      g.key = lent.get(g.want);
    }
    for (const e of shadeList) for (const g of e.groups) {
      if (seen.has(g.key)) continue;
      seen.add(g.key);
      const layer = layerFor(g.key, g.look);
      if (!g.follows) continue;
      // A shape's canvas moves, by whole px, so the shape stays at one place on it.
      const at = spot(onto(layer.canvas), project(g.follows.position)), was = [at[0] + layer.x, at[1] + layer.y];
      if (!layer.home) layer.home = was;
      const x = Math.round(was[0] - layer.home[0]), y = Math.round(was[1] - layer.home[1]);
      if (x !== layer.x || y !== layer.y) { layer.x = x; layer.y = y; layer.canvas.style.transform = x || y ? 'translate(' + x + 'px, ' + y + 'px)' : ''; }
    }
  }
  const areaOf = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; };
  // The part of polygon p inside the convex polygon q.
  function within(p, q) {
    const turn = areaOf(q) >= 0 ? 1 : -1;
    let out = p;
    for (let i = 0; i < q.length && out.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length], side = (pt) => turn * ((b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0])), next = [];
      for (let j = 0; j < out.length; j++) {
        const c = out[j], d = out[(j + 1) % out.length], sc = side(c), sd = side(d);
        if (sc >= 0) next.push(c);
        if ((sc >= 0) !== (sd >= 0)) { const t = sc / (sc - sd); next.push([c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t]); }
      }
      out = next;
    }
    return out;
  }
  // A polygon added to a path, wound the way asked: two wound opposite ways cancel where they overlap.
  function wind(path, pts, clockwise) {
    if (pts.length < 3) return;
    const list = (areaOf(pts) > 0) === clockwise ? pts : pts.slice().reverse();
    path.moveTo(list[0][0], list[0][1]);
    for (let i = 1; i < list.length; i++) path.lineTo(list[i][0], list[i][1]);
    path.closePath();
  }
  // A polygon moved out by d px all round (in by d below 0). The shape under the marks has a soft
  // antialiased edge, and so has the area the marks are cut to; laid one over the other, a pixel the
  // edge half covers would keep a quarter of the shape's own color. Grown by a pixel, the marks cover
  // every pixel the shape touches.
  function widen(pts, d) {
    if (pts.length < 3) return pts;
    const s = areaOf(pts) > 0 ? 1 : -1, n = pts.length;
    const normal = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [s * dy / l, -s * dx / l]; };
    return pts.map((p, i) => {
      const na = normal(pts[(i + n - 1) % n], p), nb = normal(p, pts[(i + 1) % n]);
      const mx = na[0] + nb[0], my = na[1] + nb[1], dt = (mx * na[0] + my * na[1]) || 1;
      // Along the corner's bisector, far enough that each side moves out by d; capped at sharp corners.
      const k = Math.min(d / dt, 4 * Math.abs(d));
      return [p[0] + mx * k, p[1] + my * k];
    });
  }
  const BLEED = 1;
  // A shape's named points, in its own space: every shape's `center`, and a capsule's `left` and `right`, the
  // middles of its two ends. A mark can be laid from one ({ point, offset }) or kept within a circle about one.
  function pointOf(ob, name, at) {
    if (name === 'center') return [0, 0, 0];
    if (ob.made && ob.made[0] === solids.capsule && (name === 'left' || name === 'right')) { const len = ob.made[1].length; return [name === 'left' ? -len / 2 : len / 2, 0, 0]; }
    throw fail(CODES.BAD_CALL, at, __DEV__ && show(name) + ' is not a point of this shape; every shape has center, and a capsule has left and right');
  }
  const placeOf = (ob, v, at) => {
    if (Array.isArray(v)) return v;
    if (!(v && typeof v === 'object' && typeof v.point === 'string')) throw fail(CODES.BAD_CALL, at, __DEV__ && 'a place on a shape is [x, y] or { point, offset }, not ' + show(v));
    const p = pointOf(ob, v.point, at), off = v.offset || [0, 0];
    return [p[0] + off[0], p[1] + off[1], p[2] + (off[2] || 0)];
  };
  function paintLayer(layer, m) {
    const mine = (e) => e.groups.filter((g) => g.key === layer.key), first = shadeList.findIndex((e) => mine(e).length);
    if (first < 0) return;
    const M = onto(layer.canvas), pathOn = (d) => { const p = new Path2D(); if (d) p.addPath(new Path2D(d), M); return p; };
    // Crachis and ink keep each ink apart, so a shape rubs out each ink laid so far.
    const apart = layer.kind === 'crachis' || layer.kind === 'ink', inks = [];
    for (let i = first; i < shadeList.length; i++) {
      const e = shadeList[i], outline = pathOn(e.d), clip = e.clip ? pathOn(e.clip.invert ? EVERYWHERE + e.clip.d : e.clip.d) : null;
      const rub = (ctx) => { if (clip) ctx.clip(clip, e.clip.invert ? 'evenodd' : 'nonzero'); ctx.globalCompositeOperation = 'destination-out'; ctx.fill(outline); };
      if (i > first) { if (apart) inks.forEach((ink) => m.paint(rub, { ink })); else m.paint(rub); }
      const marks = [].concat(...mine(e).map((g) => g.marks));
      if (!marks.length) continue;
      // The shape's own space on the canvas: a point of it, and how long a unit of it is there.
      const at = e.ob.at || placer(e.ob), px = (p) => spot(M, project(at.point([p[0], p[1], p[2] || 0])));
      const a = px(e.ob.pivot), ux = px([e.ob.pivot[0] + 1, e.ob.pivot[1], e.ob.pivot[2]]), uy = px([e.ob.pivot[0], e.ob.pivot[1] + 1, e.ob.pivot[2]]);
      const unit = Math.max(Math.hypot(ux[0] - a[0], ux[1] - a[1]), Math.hypot(uy[0] - a[0], uy[1] - a[1]));
      // Where its marks may fall: its outline, less what its clip cuts away. The clip's faces are taken as
      // convex; the part of the outline in each is kept, or with invert wound the other way so it is left out.
      const own = widen(e.poly.map((p) => spot(M, p)), BLEED);
      let parts = [[own, true]];
      if (e.clip) {
        parts = e.clip.invert ? [[own, true]] : [];
        // The clip's edge is soft too: grown with the shape, or shrunk where it is a hole.
        for (const q of e.clip.polys) parts.push([within(own, widen(q.map((p) => spot(M, p)), e.clip.invert ? -BLEED : BLEED)), !e.clip.invert]);
      }
      const area = new Path2D();
      for (const [pts, cw] of parts) wind(area, pts, cw);
      const here = 'solids: ' + e.ob.name + '.shade';
      m.marks(marks.map((mk) => {
        // within: { point, radius }, the mark kept inside a circle about a point of the shape.
        let room = area;
        if (mk.within) {
          const c = placeOf(e.ob, { point: mk.within.point, offset: mk.within.offset }, here + '.within'), r = mk.within.radius, ring = [];
          for (let k = 0; k < 96; k++) { const t = (k / 96) * 2 * Math.PI; ring.push(px([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t), c[2]])); }
          const cut = widen(ring, BLEED);
          room = new Path2D();
          for (const [pts, cw] of parts) wind(room, cw ? within(pts, cut) : pts, cw);
        }
        // An edge runs inward from its clip's outline, so it keeps the shape's whole outline, grown as the area is.
        const out = Object.assign({}, mk, { clip: mk.edge && e.clip ? outline : room });
        delete out.within;
        if (mk.edge) out.edge = Object.assign({}, mk.edge, { width: mk.edge.width * unit });
        else if (mk.glow) out.glow = Object.assign({}, mk.glow, { at: px(placeOf(e.ob, mk.glow.at, here + '.glow.at')), radius: mk.glow.radius * unit });
        else if (mk.band) out.band = Object.assign({}, mk.band, { from: px(mk.band.from), to: px(mk.band.to), width: mk.band.width * unit });
        if (apart && mk.ink && !inks.includes(mk.ink)) inks.push(mk.ink);
        return out;
      }));
    }
  }

  return stage;
}

// A shape remembers how it was made, so set() can change some of its numbers.
const remember = (fn) => { const made = (o) => Object.freeze(Object.assign({}, fn(o), { made: [made, o] })); return made; };
solids.box = remember(box);
solids.faces = faces;
solids.plane = remember(plane);
solids.disc = remember(disc);
solids.sector = remember(sector);
solids.capsule = remember(capsule);
solids.polygon = remember(polygon);
solids.prism = remember(prism);
solids.pyramid = remember(pyramid);
solids.sphere = remember(sphere);
solids.null = remember(nil);
