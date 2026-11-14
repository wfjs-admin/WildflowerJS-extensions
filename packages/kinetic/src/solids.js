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
 *   });
 *   stage.add('cage', solids.cage({ size: 2, beam: 0.26 }), { albedo: 0.42, glow: 0.85 });
 *   stage.add('core', solids.box({ size: 0.8 }));
 *   // in a scene's seek(t):
 *   stage.set('cage', { rotate: [90 * p, 0, 0] });
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
 * add(name, shape, { albedo: 1, glow: 1 }) puts a shape on the stage;
 * set(name, { rotate: [x, y, z] degrees (about x, then y, then z), scale (a
 * number or [x, y, z]), position: [x, y, z], opacity: 0 to 1 }) places it;
 * draw() draws them all. Faces are sorted by distance from the eye, and a
 * tie by place on screen, never by which object or face it is, so a loop
 * where one face takes another's place draws the same frame; each path runs
 * clockwise on screen from its leftmost corner, so it writes the same markup
 * too. Each face on the stage has a slot of SVG elements, made when its
 * shape is added; a draw fills the slots it needs, in order, and blanks the
 * ones the draw before filled, so any order of draws at the same values
 * leaves the same DOM. remove(name) takes a shape off;
 * dispose() takes the stage's elements out of the page.
 *
 * Shapes, each in its own space around its center:
 *   solids.box({ size })          size the edge, or [x, y, z]
 *   solids.cage({ size, beam })   a box's twelve edges as square beams `beam` thick,
 *                                 corner blocks showing only their outer faces
 *   solids.faces([{ pts, n }])    faces of your own: 3 or more corners, and
 *                                 the outward normal (from the first three corners when left out)
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
const SET_KEYS = ['rotate', 'scale', 'position', 'opacity'];

function rgbOf(c) {
  const m = /^#([0-9a-f]{6})$/i.exec(c);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [v >> 16, (v >> 8) & 255, v & 255];
}

// ---- shapes -----------------------------------------------------------------

const SHAPE = Symbol('solids shape');
const shape = (faces) => Object.freeze({ [SHAPE]: true, faces: Object.freeze(faces) });

// A box's faces about center c with half sizes h, those keep(axis, sign) passes.
function boxFaces(out, c, h, keep) {
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    if (!keep(axis, sign)) continue;
    const u = (axis + 1) % 3, v = (axis + 2) % 3, pts = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 0, 0];
      p[axis] = c[axis] + sign * h[axis]; p[u] = c[u] + su * h[u]; p[v] = c[v] + sv * h[v];
      pts.push(p);
    }
    const n = [0, 0, 0]; n[axis] = sign;
    out.push({ pts, n });
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
  return shape(boxFaces([], [0, 0, 0], sizeOf(o, 'solids.box({ size })'), () => true));
}

function cage(o) {
  const h = sizeOf(o, 'solids.cage({ size })'), T = o.beam;
  if (!(num(T) && T > 0 && T < 2 * Math.min(...h))) throw fail(CODES.BAD_CALL, 'solids.cage({ beam })', __DEV__ && 'beam is the beams\' thickness, above 0 and less than the size, not ' + show(T));
  const out = [], m = h.map((x) => x - T / 2);
  // A corner block shows only its three outward faces; the beams cover the rest.
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const s = [x, y, z];
    boxFaces(out, [x * m[0], y * m[1], z * m[2]], [T / 2, T / 2, T / 2], (axis, sign) => sign === s[axis]);
  }
  // Each beam's four sides; its ends touch the corner blocks.
  for (let axis = 0; axis < 3; axis++) for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const c = [0, 0, 0], hh = [T / 2, T / 2, T / 2];
    c[(axis + 1) % 3] = a * m[(axis + 1) % 3]; c[(axis + 2) % 3] = b * m[(axis + 2) % 3]; hh[axis] = h[axis] - T;
    boxFaces(out, c, hh, (ax) => ax !== axis);
  }
  return shape(out);
}

function faces(list) {
  if (!Array.isArray(list) || !list.length) throw fail(CODES.BAD_CALL, 'solids.faces(faces)', __DEV__ && 'faces is an array of { pts, n }, not ' + show(list));
  return shape(list.map((f, i) => {
    const pts = f && f.pts;
    if (!(Array.isArray(pts) && pts.length >= 3 && pts.every(vec))) throw fail(CODES.BAD_CALL, 'solids.faces(faces[' + i + '].pts)', __DEV__ && 'pts is 3 or more corners, each [x, y, z], not ' + show(pts));
    if (f.n !== undefined && !vec(f.n)) throw fail(CODES.BAD_CALL, 'solids.faces(faces[' + i + '].n)', __DEV__ && 'n is the outward normal, [x, y, z], not ' + show(f.n));
    return { pts: pts.map((p) => p.slice()), n: norm(f.n || cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))) };
  }));
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
    const out = Object.assign({ size: 0.85, strength: 1, sharp: 1.5 }, g, { dir: norm(g.dir) });
    nums(out, ['size', 'strength', 'sharp'], 'glows[' + i + ']');
    out.bleed = g.bleed ? Object.assign({ size: 1.7, strength: 0.2, cap: 0, color: g.color }, g.bleed) : null;
    if (out.bleed) nums(out.bleed, ['size', 'strength', 'cap'], 'glows[' + i + ']: { bleed', '} ');
    return out;
  });

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
  const shadeAt = (t) => {
    const x = Math.max(0, Math.min(0.999, t)) * (ramp.length - 1), i = Math.floor(x), f = x - i;
    const c = ramp[i].map((a, k) => Math.round(a + (ramp[i + 1][k] - a) * f));
    return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  };

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

  const slots = [];
  let filled = 0;
  function slot(i) {
    const g = mk('linearGradient', { id: id + 'f' + i, gradientUnits: 'userSpaceOnUse' }, defs);
    const stops = [0, 0.5, 1].map((at) => mk('stop', { offset: at }, g));
    const clip = mk('clipPath', { id: id + 'c' + i }, defs), clipPath = mk('path', {}, clip);
    const group = mk('g', {}, faceLayer);
    const path = mk('path', { fill: 'url(#' + id + 'f' + i + ')' }, group);
    const glowGroup = mk('g', { 'clip-path': 'url(#' + id + 'c' + i + ')' }, group);
    const blobs = glows.map((_, k) => mk('circle', { r: 1, fill: glowFill[k], transform: HIDDEN, opacity: 0 }, glowGroup));
    const edge = rim ? mk('path', { fill: 'none', stroke: rim.color, 'stroke-width': rim.width, 'stroke-linejoin': 'round' }, group) : null;
    // Its bleeds, in each light's layer above the faces: one flat color there,
    // so which slot's bleed sits where changes nothing.
    const spill = glows.map((g, k) => (g.bleed ? mk('circle', { r: 1, fill: bleedFill[k], transform: HIDDEN, opacity: 0 }, bleedLayers[k]) : null));
    return { g, stops, clipPath, path, blobs, edge, group, spill };
  }
  function blank(s) {
    for (const e of [s.path, s.clipPath, s.edge]) if (e) e.setAttribute('d', '');
    s.group.setAttribute('opacity', '0');
    for (const k of ['x1', 'y1', 'x2', 'y2']) s.g.setAttribute(k, '0');
    for (const st of s.stops) st.setAttribute('stop-color', '#000');
    if (s.edge) s.edge.setAttribute('stroke-opacity', '0');
    for (const b of s.blobs.concat(s.spill)) if (b) { b.setAttribute('transform', HIDDEN); b.setAttribute('opacity', '0'); }
  }
  // A slot for every face on the stage, made when its shape is added, so the
  // DOM depends on what is on the stage and never on what was drawn before.
  function provide() {
    let total = 0;
    for (const ob of objects.values()) total += ob.faces.length;
    while (slots.length < total) { const s = slot(slots.length); blank(s); slots.push(s); }
  }

  // ---- the objects ----
  const objects = new Map();
  const where = (name, call) => 'solids: ' + call + '(' + show(name) + ')';

  const stage = {
    add(name, sh, opts) {
      if (typeof name !== 'string' || !name) throw fail(CODES.BAD_CALL, 'solids: add(name)', __DEV__ && 'name is a string, not ' + show(name));
      if (!(sh && sh[SHAPE])) throw fail(CODES.BAD_CALL, where(name, 'add'), __DEV__ && 'the shape is from solids.box(), solids.cage() or solids.faces()');
      const a = Object.assign({ albedo: 1, glow: 1 }, opts);
      for (const k of ['albedo', 'glow']) if (!num(a[k])) throw fail(CODES.BAD_CALL, where(name, 'add') + '.' + k, __DEV__ && k + ' is a number, not ' + show(a[k]));
      objects.set(name, { faces: sh.faces, albedo: a.albedo, glow: a.glow, rotate: [0, 0, 0], scale: [1, 1, 1], position: [0, 0, 0], opacity: 1 });
      provide();
      return stage;
    },
    set(name, props) {
      const ob = objects.get(name);
      if (!ob) throw fail(CODES.BAD_CALL, where(name, 'set'), __DEV__ && 'no shape is named ' + show(name) + '; the shapes are ' + ([...objects.keys()].join(', ') || 'none'));
      const p = props || {};
      for (const k in p) if (!SET_KEYS.includes(k)) throw fail(CODES.BAD_CALL, where(name, 'set') + '.' + k, __DEV__ && "'" + k + "' is not something set() places; it takes " + SET_KEYS.join(', '));
      if (p.rotate !== undefined) { if (!vec(p.rotate)) throw fail(CODES.BAD_CALL, where(name, 'set') + '.rotate', __DEV__ && 'rotate is [x, y, z] in degrees, not ' + show(p.rotate)); ob.rotate = p.rotate.slice(); }
      if (p.scale !== undefined) { const s = num(p.scale) ? [p.scale, p.scale, p.scale] : p.scale; if (!vec(s)) throw fail(CODES.BAD_CALL, where(name, 'set') + '.scale', __DEV__ && 'scale is a number or [x, y, z], not ' + show(p.scale)); ob.scale = s.slice(); }
      if (p.position !== undefined) { if (!vec(p.position)) throw fail(CODES.BAD_CALL, where(name, 'set') + '.position', __DEV__ && 'position is [x, y, z], not ' + show(p.position)); ob.position = p.position.slice(); }
      if (p.opacity !== undefined) { if (!num(p.opacity)) throw fail(CODES.BAD_CALL, where(name, 'set') + '.opacity', __DEV__ && 'opacity is a number from 0 to 1, not ' + show(p.opacity)); ob.opacity = Math.max(0, Math.min(1, p.opacity)); }
      return stage;
    },
    remove(name) { objects.delete(name); return stage; },
    draw,
    dispose() { root.remove(); objects.clear(); },
    project,
  };

  // Each object's corners and normals in the eye's space: scaled, turned
  // about x, then y, then z, and moved; a normal through the inverse scale.
  function placer(ob) {
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
      point: (p) => { const q = turn([p[0] * ob.scale[0], p[1] * ob.scale[1], p[2] * ob.scale[2]]); return [q[0] + ob.position[0], q[1] + ob.position[1], q[2] + ob.position[2]]; },
      normal: (n) => norm(turn([n[0] / ob.scale[0], n[1] / ob.scale[1], n[2] / ob.scale[2]])),
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
    const items = [];
    for (const ob of objects.values()) {
      // Unseen, or flat on an axis scaled to 0, with no area to draw.
      if (ob.opacity <= 0.001 || ob.scale.includes(0)) continue;
      const at = placer(ob);
      ob.faces.forEach((f) => {
        const n = at.normal(f.n), full = f.pts.map(at.point), c0 = mean(full);
        if (!(dot(n, sub(eye, c0)) > 0)) return;                  // facing away, or no normal to face by
        const pts = clipNear(full);
        if (pts.length < 3) return;
        const c = mean(pts), toEye = sub(eye, c), far = Math.hypot(toEye[0], toEye[1], toEye[2]);
        const span = Math.max(...full.map((p) => Math.hypot(...sub(p, c0))));
        // A face brushing past the camera thins out instead of filling the frame.
        const close = cam.fade > 0 ? ease(cam.distance - Math.max(...pts.map((p) => p[2])), cam.near, cam.near + cam.fade) : 1;
        items.push({ ob, pts, n, c, far, span, view: dot(n, norm(toEye)), alpha: ob.opacity * close, screen: project(c) });
      });
    }
    // Far first; a tie by place on screen, never by which object or face.
    items.sort((a, b) => (Math.abs(b.far - a.far) > 1e-7 ? b.far - a.far : a.screen[0] - b.screen[0] || a.screen[1] - b.screen[1]));

    for (let i = items.length; i < filled; i++) blank(slots[i]);
    filled = items.length;

    items.forEach((f, i) => {
      const s = slots[i];
      // Clockwise on screen from the corner leftmost (then topmost), so a face
      // listed from another corner or the other way round, as after a turn
      // that lands a solid on itself, writes the same path.
      let q = f.pts.map(project).map((p) => [n1(p[0]), n1(p[1])]);
      let area = 0;
      for (let j = 0; j < q.length; j++) { const k = (j + 1) % q.length; area += q[j][0] * q[k][1] - q[k][0] * q[j][1]; }
      if (area < 0) q = q.reverse();
      let first = 0;
      for (let j = 1; j < q.length; j++) if (q[j][0] < q[first][0] || (q[j][0] === q[first][0] && q[j][1] < q[first][1])) first = j;
      const d = 'M' + q.slice(first).concat(q.slice(0, first)).map((p) => p[0] + ' ' + p[1]).join(' L') + ' Z';
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
      const reach = (d) => (d * lt[2] > 0 ? Math.min(f.span, (zmax - f.c[2]) / Math.abs(lt[2])) : f.span);
      const r1 = reach(1), r2 = reach(-1);
      const p1 = project(f.c.map((x, k) => x + lt[k] * r1)), p2 = project(f.c.map((x, k) => x - lt[k] * r2));
      s.g.setAttribute('x1', n1(p1[0])); s.g.setAttribute('y1', n1(p1[1])); s.g.setAttribute('x2', n1(p2[0])); s.g.setAttribute('y2', n1(p2[1]));
      s.stops[0].setAttribute('stop-color', shadeAt(tone + light.across[0]));
      s.stops[1].setAttribute('stop-color', shadeAt(tone));
      s.stops[2].setAttribute('stop-color', shadeAt(tone - light.across[1]));
      const u = lt, v = norm(cross(f.n, u)), facing = ease(f.view, 0, 0.3);
      glows.forEach((G, k) => {
        const b = s.blobs[k], bl = s.spill[k], P = reflectPoint(f.c, f.n, G.dir);
        const hide = () => { for (const e of [b, bl]) if (e) { e.setAttribute('transform', HIDDEN); e.setAttribute('opacity', '0'); } };
        if (!P) return hide();
        // Tethered: it slides in from an edge, crosses the face and leaves.
        let dP = sub(P, f.c);
        const dist = Math.hypot(...dP), reach = 1.1 * f.span;
        if (dist > reach) dP = dP.map((x) => (x * reach) / dist);
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
      if (s.edge) s.edge.setAttribute('stroke-opacity', String(n2(rim.base + rim.edge * Math.pow(1 - Math.abs(f.view), rim.power))));
    });
    return stage;
  }

  return stage;
}

solids.box = box;
solids.cage = cage;
solids.faces = faces;
