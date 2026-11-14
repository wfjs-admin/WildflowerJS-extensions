/**
 * A camera built from moves, and a camera that looks at a point. Pure
 * functions of time, as motion.js's are.
 *
 *   moves(list, opts)      a function of t giving the camera's numbers,
 *                          { x, y, z, pan, tilt, roll, zoom }, for camera(),
 *                          cameraAt() and depth(z, { camera })
 *   look(eye, at, opts)    the camera's numbers for an eye at `eye` looking at `at`
 *
 * The first entry of the list is where the camera starts; each one after it
 * is a move { t, d, to, ease, lag, over, kick, swing, drift, dolly }. Moves
 * add: each adds its change, its `to` less where the moves before it have
 * the camera when it lands, times its own progress, so moves that overlap
 * blend, a delayed key keeps moving with the move before it, and every move
 * lands on its `to` at t + d (plus a key's lag) and holds there. A drift
 * keeps a hold moving: its speed rises over its move, stays until the next
 * move starts and falls away over that move, and the next move's change
 * counts it, so the next `to` is still exact. `to` as a function of t is a
 * shot the camera follows for d seconds, blended in from where it was and
 * handed on at its end with its speed, which falls away over the next move.
 *
 * Every number is worked out from the list and t alone: the changes once,
 * when moves() is called, and the camera on each call.
 */

import { CODES, fail, show } from './diagnostics.js';
import { easeAt, interpolate } from './motion.js';

const PI = Math.PI, RAD = PI / 180;
const KEYS = ['x', 'y', 'z', 'pan', 'tilt', 'roll', 'zoom'];
const REST = { x: 0, y: 0, z: 0, pan: 0, tilt: 0, roll: 0, zoom: 1 };
// A look move's own keys: the eye's and the target's coordinates, then the
// camera keys a look leaves alone.
const LOOK = ['eye.x', 'eye.y', 'eye.z', 'at.x', 'at.y', 'at.z', 'roll', 'zoom'];
const TURNS = ['pan', 'tilt', 'roll'];
const FIELDS = ['t', 'd', 'to', 'ease', 'lag', 'over', 'kick', 'swing', 'drift', 'dolly', 'blend'];
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const SMOOTH = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp01 = (u) => (u < 0 ? 0 : u > 1 ? 1 : u);
// The fast-in, long-settle profile of the skill's camera rules: full speed by
// about 27% of the move, then a long settle, threaded on 'smooth'.
const ATTACK = { at: [0, 0.27, 1], to: [0, 0.62, 1], ease: 'smooth' };
const near = (a, g) => a - 360 * Math.round((a - g) / 360);   // an angle the turn nearest g

function eyeOf(o, who) {
  const p = o.perspective === undefined ? 1000 : o.perspective;
  if (!(typeof p === 'number' && p >= 1e-4 && p < Infinity)) throw fail(CODES.BAD_CALL, who, __DEV__ && 'perspective is a finite number, 0.0001 or more, not ' + show(p));
  return p;
}

const isPoint = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

// The camera's numbers for an eye at e looking at a, both [x, y, z] in the
// world, z toward the viewer: pan about the eye, then tilt, as camera()
// turns, and z the camera's own, P less the eye's. Straight up or down, pan
// has no direction of its own: it keeps `hint` (degrees), the pan the camera
// has, else 0, so a top-down look does not turn the picture over.
function lookOf(e, a, P, hint) {
  const r0 = a[0] - e[0], r1 = a[1] - e[1], r2 = a[2] - e[2];
  const pan = Math.hypot(r0, r2) <= 1e-9 * Math.abs(r1) ? (hint || 0) * RAD : Math.atan2(r0, -r2);
  const z1 = -r0 * Math.sin(pan) + r2 * Math.cos(pan);
  return { x: e[0], y: e[1], z: P - e[2], pan: pan / RAD + 0, tilt: -Math.atan2(r1, -z1) / RAD + 0 };   // + 0: never -0
}

// The other way: an eye and a target P ahead of it, as six numbers, for
// camera numbers a look move starts from.
function eyeAtOf(c, P) {
  const p = c.pan * RAD, t = c.tilt * RAD, ez = P - c.z, ct = Math.cos(t);
  return [c.x, c.y, ez, c.x + P * Math.sin(p) * ct, c.y - P * Math.sin(t), ez - P * Math.cos(p) * ct];
}

// The eye's offset from the target u of the way from o0 to o1: its length
// straight between theirs and its direction on the great circle between
// theirs, so an eye that keeps its distance from the target stays on its arc.
// Opposite directions turn about the vertical; a zero offset goes straight.
function arc(o0, o1, u) {
  const r0 = Math.hypot(o0[0], o0[1], o0[2]), r1 = Math.hypot(o1[0], o1[1], o1[2]);
  const line = () => o0.map((a, n) => a + (o1[n] - a) * u);
  if (!(r0 > 0 && r1 > 0)) return line();
  const a = o0.map((v) => v / r0), b = o1.map((v) => v / r1);
  const cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (cos > 1 - 1e-12) return line();
  const w = Math.acos(Math.max(-1, cos)), r = r0 + (r1 - r0) * u;
  let d;
  if (Math.sin(w) > 1e-6) {
    const k0 = Math.sin((1 - u) * w) / Math.sin(w), k1 = Math.sin(u * w) / Math.sin(w);
    d = a.map((v, n) => k0 * v + k1 * b[n]);
  } else {
    // Half a turn: about the vertical (or about x for an offset along y).
    let ax = [-a[2], 0, a[0]];
    const n = Math.hypot(ax[0], ax[2]);
    ax = n > 1e-9 ? ax.map((v) => v / n) : [1, 0, 0];
    const c = Math.cos(u * w), s = Math.sin(u * w);
    const x = [ax[1] * a[2] - ax[2] * a[1], ax[2] * a[0] - ax[0] * a[2], ax[0] * a[1] - ax[1] * a[0]];
    d = a.map((v, i) => v * c + x[i] * s);
  }
  return d.map((v) => v * r);
}

export function look(eye, at, opts) {
  const P = eyeOf(opts || {}, 'look(eye, at, { perspective })');
  if (!isPoint(eye) || !isPoint(at)) throw fail(CODES.BAD_CALL, 'look(eye, at)', __DEV__ && 'eye and at are points [x, y, z] of finite numbers, not ' + show(eye) + ', ' + show(at));
  if (eye[0] === at[0] && eye[1] === at[1] && eye[2] === at[2]) throw fail(CODES.BAD_CALL, 'look(eye, at)', __DEV__ && 'the eye and the target are the same point, so there is no direction to look');
  return lookOf(eye, at, P);
}

// A drift's distance at t, in seconds of full speed: its speed rises over
// rd seconds from t0 on a smoothstep (at once when rd is 0), stays, and from
// b falls away over fd seconds from where it had reached. The integral of
// the smoothstep is u^3 - u^4 / 2.
function driftDist(r, t) {
  if (!(t > r.t0)) return 0;
  const tb = Math.min(t, r.b);
  let s;
  if (r.rd > 0) {
    const u = Math.min(1, (tb - r.t0) / r.rd);
    s = r.rd * (u * u * u - (u * u * u * u) / 2) + Math.max(0, tb - r.t0 - r.rd);
  } else s = tb - r.t0;
  if (t > r.b) {
    const w = r.rd > 0 ? SMOOTH((r.b - r.t0) / r.rd) : 1;
    const u = Math.min(1, (t - r.b) / r.fd);
    s += w * r.fd * (u - (u * u * u - (u * u * u * u) / 2));
  }
  return s;
}

export function moves(list, opts) {
  const o = opts || {};
  const P = eyeOf(o, 'moves(list, { perspective })');
  if (!Array.isArray(list) || !list.length) throw fail(CODES.BAD_CALL, 'moves(list)', __DEV__ && 'list is an array: where the camera starts, then its moves, not ' + show(list));
  const at = (i, f) => 'moves(list)[' + i + ']' + (f ? '.' + f : '');
  // KN-100 at entry i's field f; `why` comes gated by __DEV__ at each call.
  const bad = (i, f, why) => fail(CODES.BAD_CALL, at(i, f), __DEV__ && why);

  // Per-key numbers: { key: finite } with keys from `keys`, checked.
  const numbers = (i, f, v, keys, check) => {
    if (v === undefined) return {};
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad(i, f, __DEV__ && f + ' is an object of keys and numbers, not ' + show(v));
    for (const k of Object.keys(v)) {
      if (!keys.includes(k)) throw bad(i, f + '.' + k, __DEV__ && "no key '" + k + "' here; the keys are " + keys.join(', '));
      if (!Number.isFinite(v[k]) || (check && !check(v[k]))) throw bad(i, f + '.' + k, __DEV__ && 'a finite number' + (check ? ' of 0 or more' : '') + ', not ' + show(v[k]));
    }
    return v;
  };

  let prev = 0;
  const steps = list.map((m, i) => {
    if (!m || typeof m !== 'object') throw bad(i, '', __DEV__ && 'an entry is an object { t, d, to, … }, not ' + show(m));
    for (const k of Object.keys(m)) if (!FIELDS.includes(k)) throw bad(i, k, __DEV__ && "no field '" + k + "'; a move's fields are " + FIELDS.join(', '));
    const t = m.t === undefined && !i ? 0 : m.t;
    if (!Number.isFinite(t)) throw bad(i, 't', __DEV__ && 't is the move\'s start in seconds, not ' + show(m.t));
    if (i && t < prev) throw bad(i, 't', __DEV__ && 'the moves are in order of t: ' + t + ' comes before ' + prev);
    prev = t;
    const s = { t, i };
    const v = m.to;
    if (typeof v === 'function' && i) s.kind = 'fn', s.fn = v;
    else if (v && typeof v === 'object' && (own(v, 'eye') || own(v, 'at'))) {
      if (!isPoint(v.eye) || !isPoint(v.at)) throw bad(i, 'to', __DEV__ && 'a look is { eye: [x, y, z], at: [x, y, z] }, both points of finite numbers');
      for (const k of Object.keys(v)) if (!['eye', 'at', 'roll', 'zoom'].includes(k)) throw bad(i, 'to.' + k, __DEV__ && "a look's keys are eye, at, roll and zoom, not '" + k + "'");
      s.kind = 'look';
      s.ea = v.eye.concat(v.at);
      const rz = {};
      for (const k of ['roll', 'zoom']) if (v[k] !== undefined) rz[k] = v[k];
      s.to = numbers(i, 'to', rz, KEYS);
    } else {
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad(i, 'to', __DEV__ && (i ? 'to is where the move ends: camera keys, { eye, at } or a function of t' : 'the first entry is where the camera starts: camera keys or { eye, at }') + ', not ' + show(v));
      s.kind = 'keys';
      s.to = numbers(i, 'to', v, KEYS);
    }
    const drift = typeof m.drift === 'number' ? { z: m.drift } : m.drift;
    s.drift = numbers(i, 'drift', drift, KEYS);
    if (!i) {
      for (const f of ['d', 'ease', 'lag', 'over', 'kick', 'swing', 'dolly', 'blend']) if (m[f] !== undefined) throw bad(0, f, __DEV__ && 'the first entry is where the camera starts, so it has no ' + f + '; its only fields are t, to and drift');
      return s;
    }
    s.d = m.d === undefined ? 0.8 : m.d;
    if (!(Number.isFinite(s.d) && s.d > 0)) throw bad(i, 'd', __DEV__ && 'd is the move\'s length in seconds, above 0, not ' + show(m.d));
    if (s.kind === 'fn') {
      for (const f of ['ease', 'lag', 'over', 'kick', 'swing', 'dolly']) if (m[f] !== undefined) throw bad(i, f, __DEV__ && 'a move that follows a function takes t, d, to, blend and drift, not ' + f);
      s.blend = m.blend === undefined ? Math.min(0.4, s.d) : m.blend;
      if (!(Number.isFinite(s.blend) && s.blend > 0 && s.blend <= s.d)) throw bad(i, 'blend', __DEV__ && 'blend is the seconds over which the camera joins the function, above 0 and no more than d, not ' + show(m.blend));
      return s;
    }
    if (m.blend !== undefined) throw bad(i, 'blend', __DEV__ && 'blend is for a move whose to is a function');
    const keys = s.kind === 'look' ? LOOK : KEYS;
    s.lag = numbers(i, 'lag', m.lag, keys, (n) => n >= 0);
    s.over = numbers(i, 'over', m.over, keys);
    s.kick = numbers(i, 'kick', m.kick, TURNS.filter((k) => keys.includes(k)));
    s.swing = numbers(i, 'swing', m.swing, keys.filter((k) => !TURNS.includes(k) && k !== 'zoom'));
    const spec = m.ease === undefined ? 'power2.inOut' : m.ease;
    s.attack = spec === 'attack';
    s.ease = s.attack ? null : easeAt(spec, at(i, 'ease'));
    if (s.ease && s.ease.seconds) throw bad(i, 'ease', __DEV__ && 'a spring runs on past its end, so a move, which lands at t + d, takes another ease');
    // Each key's progress, 0 to 1 over the move (past 1 and back for an overshoot).
    s.prof = {};
    for (const k of keys) {
      const ov = s.over[k];
      s.prof[k] = ov ? (u) => interpolate(u, s.attack ? { at: [0, 0.27, 0.68, 1], to: [0, 0.62, 1 + ov, 1], ease: 'smooth' } : { at: [0, 0.7, 1], to: [0, 1 + ov, 1], ease: [spec, 'sine.inOut'] })
        : s.attack ? (u) => interpolate(u, ATTACK) : s.ease;
    }
    if (m.dolly !== undefined) {
      if (!(m.dolly === true || Number.isFinite(m.dolly))) throw bad(i, 'dolly', __DEV__ && 'dolly is true (the z = 0 plane) or the z of the plane the camera moves toward, not ' + show(m.dolly));
      if (s.kind === 'keys' && s.to.z === undefined) throw bad(i, 'dolly', __DEV__ && 'a dolly moves z, so the move\'s to has a z');
      s.dolly = m.dolly === true ? 0 : m.dolly;
    }
    return s;
  });

  // The drifts: each entry's own, rising over its move and falling over the
  // next, and each function move's speed at its end, handed on the same way.
  const drifts = steps.map(() => []);
  steps.forEach((s, i) => {
    if (!Object.keys(s.drift).length) return;
    const n = steps[i + 1];
    drifts[i].push({ v: s.drift, t0: s.t, rd: s.d || 0, b: n ? n.t : Infinity, fd: n ? n.d : 1 });
  });

  // The camera at t from the start and the first n entries.
  const sumTo = (n, t) => {
    const c = Object.assign({}, REST, steps[0].kind === 'look' ? lookOf(steps[0].ea.slice(0, 3), steps[0].ea.slice(3), P) : null, steps[0].to);
    for (let j = 0; j < n; j++) {
      for (const r of drifts[j]) {
        const s = driftDist(r, t);
        if (s) for (const k in r.v) c[k] += r.v[k] * s;
      }
      if (j) add(j, t, c);
    }
    return c;
  };

  // Move j's part of the camera at t, added into c, which holds the moves
  // before it at t.
  const add = (j, t, c) => {
    const s = steps[j];
    if (!(t > s.t)) return;
    if (s.kind === 'fn') {
      const te = Math.min(t, s.t + s.d);
      const base = te === t ? c : sumTo(j, te);
      const v = call(s, te);
      const w = SMOOTH((t - s.t) / s.blend);
      for (const k in v) c[k] += w * ((k === 'pan' ? near(v[k], base[k]) : v[k]) - base[k]);
      return;
    }
    const u0 = clamp01((t - s.t) / s.d);
    const p0 = s.attack ? interpolate(u0, ATTACK) : s.ease(u0);
    const bump = p0 > 0 && p0 < 1 ? Math.sin(PI * p0) : 0;   // exactly 0 once landed, so the hold is the to
    const q = (k) => {
      const u = clamp01((t - s.t - (s.lag[k] || 0)) / s.d);
      return u > 0 ? s.prof[k](u) : 0;
    };
    if (s.kind === 'keys') {
      for (const k in s.delta) {
        const dq = q(k);
        if (k === 'z' && s.dolly !== undefined) c.z += P - s.dolly - s.d0 * Math.pow(s.d1 / s.d0, dq) - s.zb;
        else c[k] += s.delta[k] * dq;
      }
    } else {
      const qs = LOOK.slice(0, 6).map(q);
      const ea = s.from.map((a, n) => a + (s.ea[n] - a) * qs[n] + (s.swing[LOOK[n]] || 0) * bump);
      // The eye on its arc about the target, both at the eye's shared
      // progress; a lagged eye key adds its own difference from that progress.
      const qe = (qs[0] + qs[1] + qs[2]) / 3;
      const o = arc(s.o0, s.o1, qe);
      // Weighted by s.w: all arc when only the eye travels (an orbit), none
      // when only the target does (a pan from a still eye).
      for (let n = 0; n < 3; n++) ea[n] += s.w * (s.from[n + 3] + (s.ea[n + 3] - s.from[n + 3]) * qe + o[n] + (s.ea[n] - s.from[n]) * (qs[n] - qe) - (s.from[n] + (s.ea[n] - s.from[n]) * qs[n]));
      if (s.dolly !== undefined) ea[2] = s.dolly + s.e0 * Math.pow(s.e1 / s.e0, qs[2]) + (s.swing['eye.z'] || 0) * bump;
      const qm = (qs[0] + qs[1] + qs[2] + qs[3] + qs[4] + qs[5]) / 6;
      const L = lookOf(ea.slice(0, 3), ea.slice(3), P, s.b.pan + s.dPan * qm);
      L.pan = near(L.pan, s.b.pan + s.dPan * qm);
      for (const k of ['x', 'y', 'z', 'pan', 'tilt']) c[k] += L[k] - s.b[k];
      for (const k in s.delta) c[k] += s.delta[k] * q(k);
    }
    for (const k in s.kick) c[k] += s.kick[k] * bump;
    if (s.kind === 'keys') for (const k in s.swing) c[k] += s.swing[k] * bump;
  };

  // A function move's camera numbers at t, checked.
  const call = (s, t) => {
    const v = s.fn(t);
    if (!v || typeof v !== 'object') throw bad(s.i, 'to', __DEV__ && 'the function returns camera numbers { x, y, z, pan, tilt, roll, zoom }, not ' + show(v) + ' at t = ' + t);
    const out = {};
    for (const k of Object.keys(v)) {
      if (!KEYS.includes(k)) throw bad(s.i, 'to', __DEV__ && "the function returned a key '" + k + "'; the keys are " + KEYS.join(', '));
      if (!Number.isFinite(v[k])) throw bad(s.i, 'to', __DEV__ && 'the function returned ' + k + ' = ' + show(v[k]) + ' at t = ' + t);
      out[k] = v[k];
    }
    return out;
  };

  // Each move's change, in order: its to less where the moves before it,
  // and its own drift, have the camera as it lands.
  const landed = {};   // key -> [the latest landing so far, its entry]
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i], n = steps[i + 1];
    const drifted = (k, t) => { let d = 0; for (const r of drifts[i]) if (r.v[k]) d += r.v[k] * driftDist(r, t); return d; };
    if (s.kind === 'fn') {
      // Its speed at its end, handed on to fall away over the next move.
      if (n) {
        if (n.t < s.t + s.d - 1e-9) throw bad(i + 1, 't', __DEV__ && 'the move starts at ' + n.t + ' s, inside the function move before it, which runs to ' + (s.t + s.d) + ' s, so it would not hold its to; start it at the function move\'s end or shorten that move\'s d');
        const te = s.t + s.d, h = 1 / 120, a = call(s, te), b = call(s, te - h), v = {};
        for (const k in a) if (b[k] !== undefined) v[k] = ((k === 'pan' ? near(a[k], b[k]) : a[k]) - b[k]) / h;
        drifts[i].push({ v, t0: te, rd: 0, b: Math.max(te, n.t), fd: n.d });
      }
      continue;
    }
    const lagMax = Math.max(0, ...Object.values(s.lag));
    s.delta = {};
    // Each key this move lands, and when: an earlier move still moving that
    // key after then would carry the camera off this move's to.
    for (const k of s.kind === 'look' ? ['x', 'y', 'z', 'pan', 'tilt'].concat(Object.keys(s.to)) : Object.keys(s.to)) {
      const tk = s.t + s.d + (s.kind === 'look' && !own(s.to, k) ? lagMax : s.lag[k] || 0);
      const was = landed[k];
      if (was && was[0] > tk + 1e-9) throw bad(i, 't', __DEV__ && k + ' of moves(list)[' + was[1] + '] lands at ' + was[0] + ' s, after this move lands it at ' + tk + ' s, so this move would not hold its to; land the earlier move first');
      if (!was || tk > was[0]) landed[k] = [tk, i];
    }
    if (s.kind === 'keys') {
      for (const k in s.to) {
        const tl = s.t + s.d + (s.lag[k] || 0);
        const b = sumTo(i, tl)[k] + drifted(k, tl);
        s.delta[k] = s.to[k] - b;
        if (k === 'z' && s.dolly !== undefined) {
          s.zb = b; s.d0 = P - s.dolly - b; s.d1 = P - s.dolly - s.to.z;
          if (!(s.d0 > 0 && s.d1 > 0)) throw bad(i, 'dolly', __DEV__ && 'the camera is at or past the plane z = ' + s.dolly + ' at one end of the move');
        }
      }
    } else {
      const tl = s.t + s.d + lagMax;
      const b = sumTo(i, tl);
      for (const k of KEYS) b[k] += drifted(k, tl);
      s.b = b;
      s.from = eyeAtOf(b, P);
      // A camera still looking at an earlier look's target starts from that
      // target, not from a point P ahead, so the target holds its place.
      for (let j = i - 1; j >= 0; j--) {
        if (steps[j].kind !== 'look') continue;
        const e = s.from, a = steps[j].ea.slice(3), v = [a[0] - e[0], a[1] - e[1], a[2] - e[2]], d = [e[3] - e[0], e[4] - e[1], e[5] - e[2]];
        const dot = v[0] * d[0] + v[1] * d[1] + v[2] * d[2], vl = Math.hypot(v[0], v[1], v[2]);
        if (dot > 0 && dot >= (1 - 1e-9) * vl * P) s.from = e.slice(0, 3).concat(a);
        break;
      }
      s.o0 = [0, 1, 2].map((n) => s.from[n] - s.from[n + 3]);
      s.o1 = [0, 1, 2].map((n) => s.ea[n] - s.ea[n + 3]);
      const de = Math.hypot(s.ea[0] - s.from[0], s.ea[1] - s.from[1], s.ea[2] - s.from[2]), da = Math.hypot(s.ea[3] - s.from[3], s.ea[4] - s.from[4], s.ea[5] - s.from[5]);
      s.w = de > 0 ? de / (de + da) : 0;
      s.dPan = near(lookOf(s.ea.slice(0, 3), s.ea.slice(3), P, b.pan).pan, b.pan) - b.pan;
      for (const k in s.to) s.delta[k] = s.to[k] - b[k];
      if (s.dolly !== undefined) {
        s.e0 = s.from[2] - s.dolly; s.e1 = s.ea[2] - s.dolly;
        if (!(s.e0 > 0 && s.e1 > 0)) throw bad(i, 'dolly', __DEV__ && 'the eye is at or past the plane z = ' + s.dolly + ' at one end of the move');
      }
    }
  }

  return (t) => {
    if (typeof t !== 'number' || t !== t) throw fail(CODES.BAD_CALL, 'moves(list)(t)', __DEV__ && 't is the time in seconds, a number, not ' + show(t));
    return sumTo(steps.length, t);
  };
}
