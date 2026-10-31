/**
 * Motion as pure functions of time. Nothing here touches the DOM or the
 * framework; a scene calls these from computeds, so the same frame always
 * gives the same value.
 *
 *   ease(name)                      an easing function of progress 0..1
 *   interpolate(t, at, to, opts)    a value from keyframe times and values,
 *   interpolate(t, track)           or from one track
 *   styleAt(t, tracks)              the style object for time t, from tracks
 *   spring(t, opts)                 a damped spring, closed form, seconds in
 *   settle(opts)                    the seconds a spring takes to stay within 2%
 *   ramp(t, from, to, ease)         t's progress from `from` to `to`, 0..1
 *   mix(a, b, p, opts)              a number, a color or a text value between a and b
 *   stagger(i, n, opts)             item i of n's delay, by its distance from an origin
 *   sweep(i, n, p, opts)            item i of n's weight under a window that sweeps
 *                                   through the items as p goes 0 to 1 (a range selector)
 *   repeat(n, opts)                 rows of n copies, each the transform of the one
 *                                   before it again (a repeater)
 *   posterize(t, fps)               time stepped to fps frames a second
 *   loop(t, from, to)               time cycling through [from, to)
 *   hold(t, at, length)             time that stops at `at` for `length` seconds
 *   random(seed)                    a seeded generator, mulberry32
 *   noise(x, seed)                  1-D gradient noise in -1..1
 *   noise2(x, y, seed)              the same in 2-D and in 3-D
 *   noise3(x, y, z, seed)
 *   camera(t, tracks, opts)         the style of a world that a camera looks at
 *   depth(z, opts)                  the style of a layer at a depth in that world
 *   shake(t, profile, opts)         camera shake offsets from layered noise
 *   smear(t, style, opts)           rows of copies styled inside the frame's
 *                                   shutter, for motion blur in the preview
 *                                   (made with the clock store, createSmear)
 *
 * Ease names: the CSS set (linear, ease, ease-in, ease-out, ease-in-out,
 * cubic-bezier(x1, y1, x2, y2), steps(n), steps(n, start)) and GSAP's
 * (power1..power4, sine, expo, circ, back, elastic, bounce, each with
 * .in, .out or .inOut; a bare name is .out, as in GSAP), plus 'spring' or
 * { spring: { stiffness, damping, mass } } or { spring: { duration, bounce } },
 * whose progress comes from the
 * seconds elapsed in its segment rather than from the segment's length;
 * called on its own, a spring ease takes seconds. 'smooth' is the
 * smoothstep, 3p² - 2p³, and as the one ease of a number track with three
 * or more keys it threads one curve through them all, the velocity
 * continuous at each key between (threaded(), under interpolate). A
 * track's ease, or interpolate's, can also be an array with one of these
 * per segment.
 */

import { CODES, fail, warn, show, checkTime } from './diagnostics.js';
import { readPath, fmt } from './paths.js';

// ---- eases ------------------------------------------------------------------

const PI = Math.PI;

// The tables below are plain objects, so a name is looked up as an own key:
// 'constructor' or 'valueOf' would otherwise find Object.prototype's methods.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Each family as its `in` form; out and inOut are derived.
const IN = {
  power1: (t) => t * t,
  power2: (t) => t * t * t,
  power3: (t) => t * t * t * t,
  power4: (t) => t * t * t * t * t,
  sine: (t) => 1 - Math.cos((t * PI) / 2),
  expo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  circ: (t) => 1 - Math.sqrt(1 - t * t),
  back: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  elastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin(((t * 10 - 10.75) * 2 * PI) / 3)),
  bounce: (t) => 1 - bounceOut(1 - t),
};

function bounceOut(t) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

const outOf = (f) => (t) => 1 - f(1 - t);
const inOutOf = (f) => (t) => (t < 0.5 ? f(2 * t) / 2 : 1 - f(2 - 2 * t) / 2);

// A cubic bezier from (0,0) to (1,1) solved for x, as the browser solves
// transition-timing-function: Newton's method, then bisection.
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const z = sx(t) - x;
      if (Math.abs(z) < 1e-6) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= z / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 64 && lo < hi; i++) {
      const z = sx(t);
      if (Math.abs(z - x) < 1e-6) return t;
      if (x > z) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

const CSS = {
  linear: (t) => t,
  ease: bezier(0.25, 0.1, 0.25, 1),
  'ease-in': bezier(0.42, 0, 1, 1),
  'ease-out': bezier(0, 0, 0.58, 1),
  'ease-in-out': bezier(0.42, 0, 0.58, 1),
};

// The smoothstep, the cubic between two values with zero velocity at both
// ends. Its `smooth` flag is what interpolateAt reads to thread one curve
// through a whole number track.
const SMOOTH = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
SMOOTH.smooth = true;

// The 1e-9 keeps a product that lands a hair under a whole number on that
// number's step: 0.29 * 100 is 28.999999999999996.
function steps(n, start) {
  return (t) => {
    if (t >= 1) return 1;
    const k = Math.floor(t * n + 1e-9);
    return start ? Math.min(1, (k + 1) / n) : k / n;
  };
}

const cache = new Map();

// The easing function for a name. A function is returned as it is; a
// spring spec becomes a function of elapsed seconds (see interpolate), and
// its options are checked here, so a bad one fails where it is written.
export function ease(name) {
  return easeAt(name, 'ease(name)');
}

// A track's place in a message: its label, such as interpolate or
// scene('intro').keyframes.title, then the key of a track inside an object
// of tracks. A message's where goes on to the part of the track that failed,
// such as .at[2] or .ease[1]. The strings are joined only when a message is
// made, since tracks are read on every frame.
const place = (label, key) => (key === undefined ? label : label + '.' + key);

// The KN-121 where of an ease: with no `i`, `label` is the whole where, as
// ease(name), ramp(t, from, to, ease) or stagger(i, n, { ease }); otherwise
// the track's .ease, with the index of an ease array's entry when i is 0 or
// more.
const easeWhere = (label, i, key) => (i === undefined ? label : place(label, key) + '.ease' + (i < 0 ? '' : '[' + i + ']'));
export function easeAt(name, label, i, key) {
  if (typeof name === 'function') return name;
  if (name && typeof name === 'object' && name.spring && typeof name.spring === 'object') return springEase(name.spring, label, i, key);
  if (name === 'spring') return springEase(null, label, i, key);
  if (typeof name !== 'string') throw fail(CODES.BAD_EASE, easeWhere(label, i, key), __DEV__ && 'a name, a function or { spring: {...} }, not ' + show(name));
  const k = name.trim();
  let fn = cache.get(k);
  if (fn) return fn;
  fn = parseEase(k);
  if (!fn) throw fail(CODES.BAD_EASE, easeWhere(label, i, key), __DEV__ && unknownEase(k));
  // Capped as the other caches are, for a page that makes ever-new
  // cubic-bezier or steps names.
  if (cache.size > 63) cache.clear();
  cache.set(k, fn);
  return fn;
}

// Development, for KN-121: the sentence for a name that is no ease, with
// the closest ease when there is one, and the eases there are. The closest
// reads the habits of other tools first: Penner's names (easeInOutCubic),
// GSAP 2's (Power2.easeOut), Remotion's (Easing.inOut(Easing.cubic)) and
// Framer's (easeInOut), whose families are quad, cubic, quart and quint for
// power1 to power4 and whose direction alone is power2's; then a CSS name
// written in another case or with underscores; then the nearest name by
// edit distance, when it is near.
const FAMILIES = ['power1', 'power2', 'power3', 'power4', 'sine', 'expo', 'circ', 'back', 'elastic', 'bounce'];
const HABITS = [['quad', 'power1'], ['cubic', 'power2'], ['quart', 'power3'], ['quint', 'power4'], ['power1', 'power1'], ['power2', 'power2'], ['power3', 'power3'], ['power4', 'power4'],
  ['sine', 'sine'], ['sin', 'sine'], ['expo', 'expo'], ['exp', 'expo'], ['circle', 'circ'], ['circ', 'circ'], ['back', 'back'], ['elastic', 'elastic'], ['bounce', 'bounce']];
function closestEase(k) {
  const css = k.toLowerCase().replace(/[\s_]+/g, '-');
  if (parseEase(css)) return css;
  let s = k.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/easing|ease/g, '');
  if (/^(linear|none)/.test(s)) return 'linear';
  if (/^(cubic)?bezier/.test(s)) return 'cubic-bezier(x1, y1, x2, y2)';
  if (/^steps?\d*/.test(s)) return 'steps(n)';
  let fam = '';
  for (const [w, f] of HABITS) {
    const at = s.indexOf(w);
    if (at >= 0) { fam = f; s = s.slice(0, at) + s.slice(at + w.length); break; }
  }
  const dir = /^inout$|^outin$/.test(s) ? 'inOut' : s === 'out' ? 'out' : s === 'in' ? 'in' : s ? null : '';
  if (dir !== null && (fam || dir)) return (fam || 'power2') + (dir ? '.' + dir : '');
  // The nearest name, when it is at most a third of the name's length away.
  const names = ['linear', 'smooth', 'spring', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
  for (const f of FAMILIES) names.push(f, f + '.in', f + '.out', f + '.inOut');
  let best = '', d = Math.max(2, Math.floor(k.length / 3)) + 1;
  for (const n of names) {
    const e = distance(k, n);
    if (e < d) { d = e; best = n; }
  }
  return best;
}
// Levenshtein's distance between two strings.
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}
function unknownEase(k) {
  const near = closestEase(k);
  return "'" + k + "' is not an ease" + (near ? "; did you mean '" + near + "'?" : '.')
    + ' The eases are linear, smooth, spring, the CSS names ease, ease-in, ease-out, and ease-in-out, steps(n), cubic-bezier(x1, y1, x2, y2) with x1 and x2 from 0 to 1,'
    + ' and power1 to power4, sine, expo, circ, back, elastic, and bounce, each alone (the .out form) or with .in, .out, or .inOut';
}

// The ease of every segment: one function for them all, or, for an array,
// one per segment, each anything ease() takes. An array is resolved once and
// kept, since a track's array is the same object on every frame. `label`
// and `key` say where the track is, for KN-121.
const perSegment = new WeakMap();
function easesOf(e, segments, label, key) {
  if (!Array.isArray(e)) return easeAt(e, label, -1, key);
  const kept = perSegment.get(e);
  if (kept && kept.length === segments) return kept;
  if (e.length !== segments) throw fail(CODES.BAD_EASE, easeWhere(label, -1, key), __DEV__ && 'ease is one ease per segment, ' + segments + ' for ' + (segments + 1) + ' keyframes, not ' + e.length);
  const fns = e.map((x, i) => easeAt(x, label, i, key));
  perSegment.set(e, fns);
  return fns;
}

function parseEase(key) {
  if (own(CSS, key)) return CSS[key];
  if (key === 'smooth') return SMOOTH;
  let m = /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(key);
  if (m) {
    const [x1, y1, x2, y2] = m.slice(1).map(Number);
    if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v)) || x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) return null;
    return bezier(x1, y1, x2, y2);
  }
  m = /^steps\(\s*(\d+)\s*(?:,\s*(start|end|jump-start|jump-end)\s*)?\)$/.exec(key);
  if (m) {
    const n = Number(m[1]);
    return n > 0 ? steps(n, m[2] === 'start' || m[2] === 'jump-start') : null;
  }
  m = /^([a-z]+[1-4]?)(?:\.(in|out|inOut))?$/.exec(key);
  if (!m || !own(IN, m[1])) return null;
  const f = IN[m[1]], g = m[2] === 'in' ? f : m[2] === 'inOut' ? inOutOf(f) : outOf(f);
  // Exactly 0 and 1 at the ends, as bezier is: the formulas land a rounding
  // error off (back at 0 is 2.2e-16, sine.in at 1 is 0.9999999999999999).
  return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : g(t));
}

// ---- spring -------------------------------------------------------------------

// Position of a damped spring released at `from` and pulled to `to`, at t
// seconds: the closed form of m x'' + c x' + k x = 0, so any t answers
// without stepping. Defaults match Remotion's (stiffness 100, damping 10,
// mass 1), which settle in about a second.
export function spring(t, opts) {
  checkTime(t, 'spring');
  return springAt(t, springOptions(opts, CODES.BAD_CALL, SPRING));
}

// The where of a spring's options that failed, `field` naming the ones that
// failed, or none for the options as a whole: a spring() or settle() call
// (`label` is SPRING or SETTLE), or an ease's .spring (easeWhere's label, i
// and key).
const SPRING = (field) => 'spring(t, ' + (field ? '{ ' + field + ' }' : 'opts') + ')';
const SETTLE = (field) => 'settle(' + (field ? '{ ' + field + ' }' : 'opts') + ')';
const springWhere = (label, i, key, field) => (typeof label === 'function' ? label(field) : easeWhere(label, i, key) + '.spring' + (field ? '.' + field : ''));

// The options with their defaults, every one a finite number. `code` is
// KN-100 for a spring() call and KN-121 for a spring ease. A spring set by
// duration and bounce has mass 1 and the damping ratio 1 - bounce, and its
// stiffness is solved: at a fixed damping ratio the travel left is a function
// of sqrt(k / m) * t alone, so the settle time is the unit spring's divided by
// sqrt(k). The unit spring's time depends on bounce and clamping alone and is
// kept, since a spring ease or a computed asks for it on every frame. The
// spring is made a hair stiffer than the solve, so that at its duration it is
// inside 2% of rest and not on the line, where rounding can put it a
// hundred-quadrillionth over.
const units = new Map();
export function springOptions(opts, code, label, i, key) {
  const o = opts || {};
  let k = o.stiffness === undefined ? 100 : o.stiffness;
  let c = o.damping === undefined ? 10 : o.damping;
  let m = o.mass === undefined ? 1 : o.mass;
  const from = o.from === undefined ? 0 : o.from;
  const to = o.to === undefined ? 1 : o.to;
  const clamp = !!o.overshootClamping;
  if (o.duration !== undefined || o.bounce !== undefined) {
    const d = o.duration, b = o.bounce === undefined ? 0 : o.bounce;
    if (o.stiffness !== undefined || o.damping !== undefined || o.mass !== undefined) throw fail(code, springWhere(label, i, key), __DEV__ && 'a spring is set by duration and bounce or by stiffness, damping and mass, not both');
    if (!(Number.isFinite(d) && d > 0 && Number.isFinite(b) && b >= 0 && b < 1)) {
      throw fail(code, springWhere(label, i, key, Number.isFinite(d) && d > 0 ? 'bounce' : 'duration'), __DEV__ && 'duration is a finite number of seconds above 0 and bounce a number from 0 to below 1, not { duration: ' + show(d) + ', bounce: ' + show(o.bounce) + ' }');
    }
    const kept = b + (clamp ? ' clamped' : '');
    let unit = units.get(kept);
    if (unit === undefined) {
      if (units.size > 63) units.clear();
      units.set(kept, unit = settleOf({ k: 1, c: 2 - 2 * b, m: 1, clamp }));
    }
    const w = (unit * (1 + 1e-12)) / d;
    k = w * w; c = (2 - 2 * b) * w; m = 1;
  }
  if (!(Number.isFinite(k) && k > 0 && Number.isFinite(c) && c >= 0 && Number.isFinite(m) && m > 0)) {
    throw fail(code, springWhere(label, i, key, !(Number.isFinite(k) && k > 0) ? 'stiffness' : !(Number.isFinite(c) && c >= 0) ? 'damping' : 'mass'),
      __DEV__ && 'stiffness and mass are finite numbers above 0, damping a finite number 0 or more, not { stiffness: ' + show(k) + ', damping: ' + show(c) + ', mass: ' + show(m) + ' }');
  }
  if (!(Number.isFinite(from) && Number.isFinite(to))) throw fail(code, springWhere(label, i, key, Number.isFinite(from) ? 'to' : 'from'), __DEV__ &&'from and to are finite numbers, not { from: ' + show(from) + ', to: ' + show(to) + ' }');
  return { k, c, m, from, to, clamp };
}

// The seconds until a spring stays within `tol` of its travel from rest:
// 2% by default, the measure KN-123 and a spring set by duration use, and
// 1e-4 for a follower's fold (follow.js). Infinity with no damping.
// Under-damped, the swings peak at multiples of pi / wd, each smaller than
// the one before, so the search starts at the last peak past the tolerance
// (with overshootClamping, the last one short of `to`, since an overshoot is
// held at `to`) and ends half a cycle on. Otherwise the travel left only
// shrinks, and the end of the search doubles until it is within the
// tolerance.
export function settleOf(s, tol = 0.02) {
  const u = Object.assign({}, s, { from: 0, to: 1 });
  const w0 = Math.sqrt(s.k / s.m), z = s.c / (2 * Math.sqrt(s.k * s.m));
  const off = (t) => Math.abs(1 - springAt(t, u)) > tol;
  let lo = 0, hi = 1 / w0;
  if (!z) return Infinity;
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    let n = Math.floor(Math.log(1 / tol) * wd / (z * w0 * PI));
    if (s.clamp && n % 2) n--;
    lo = n * PI / wd;
    hi = lo + PI / wd;
  } else while (off(hi)) { lo = hi; hi *= 2; }
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2;
    if (off(mid)) lo = mid; else hi = mid;
  }
  return hi;
}

// The seconds a spring with these options, either form, takes to stay
// within 2% of the distance from `from` to `to`.
export function settle(opts) {
  return settleOf(springOptions(opts, CODES.BAD_CALL, SETTLE));
}

export function springAt(t, s) {
  if (!(t > 0)) return s.from;
  // At Infinity the spring has settled at `to`. With no damping it never
  // settles, and `to` is the middle of its swing.
  if (t === Infinity) return s.to;
  const w0 = Math.sqrt(s.k / s.m);
  const zeta = s.c / (2 * Math.sqrt(s.k * s.m));
  let p;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    p = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  } else if (zeta === 1) {
    p = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  } else {
    const r = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - r), r2 = -w0 * (zeta + r);
    p = 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  if (p !== p) return s.to;   // t so large that a rate times t overflowed: settled as well
  if (s.clamp) p = p < 0 ? 0 : p > 1 ? 1 : p;
  return s.from + (s.to - s.from) * p;
}

// An ease that reads seconds. interpolate calls it with the segment's
// progress and then the seconds elapsed in the segment, and lets the last
// segment run on past its key, since the ease is marked. Called with one
// argument, as ease('spring')(0.5) is, that argument is the seconds. It
// carries its options, for KN-123's settle time. `label`, `i` and `key` are
// easeAt()'s, for the where of a KN-121.
function springEase(cfg, label, i, key) {
  const s = springOptions(cfg, CODES.BAD_EASE, label, i, key);
  const f = (p, seconds) => springAt(seconds === undefined ? p : seconds, s);
  f.seconds = true;
  f.spring = s;
  return f;
}

// ---- colors ---------------------------------------------------------------------

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
// A channel is a number, with an exponent or not, or a percentage of 255.
const RGB = /^rgba?\(\s*([\d.]+(?:e[+-]?\d+)?%?)[\s,]+([\d.]+(?:e[+-]?\d+)?%?)[\s,]+([\d.]+(?:e[+-]?\d+)?%?)(?:[\s,/]+([\d.]+(?:e[+-]?\d+)?%?))?\s*\)$/i;
const channel = (v, whole) => (v.endsWith('%') ? (Number(v.slice(0, -1)) / 100) * whole : Number(v));

export function parseColor(s) {
  if (typeof s !== 'string') return null;
  let m = HEX.exec(s.trim());
  if (m) {
    let h = m[1];
    if (h.length < 6) h = h.split('').map((ch) => ch + ch).join('');
    const n = parseInt(h, 16);
    return h.length === 8
      ? [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, (n & 255) / 255]
      : [(n >>> 16) & 255, (n >>> 8) & 255, n & 255, 1];
  }
  m = RGB.exec(s.trim());
  if (m) {
    const c = [channel(m[1], 255), channel(m[2], 255), channel(m[3], 255), m[4] === undefined ? 1 : channel(m[4], 1)];
    // The pattern lets through '1.2.3' and '.', which are NaN. CSS clamps a
    // channel to 255 and the alpha to 1 before it mixes, so this does too.
    if (!c.every(Number.isFinite)) return null;
    return [Math.min(255, c[0]), Math.min(255, c[1]), Math.min(255, c[2]), Math.min(1, c[3])];
  }
  return null;
}

function formatColor(c) {
  const ch = (v) => Math.round(v < 0 ? 0 : v > 255 ? 255 : v);
  const a = c[3] < 0 ? 0 : c[3] > 1 ? 1 : c[3];
  return a < 1
    ? 'rgba(' + ch(c[0]) + ', ' + ch(c[1]) + ', ' + ch(c[2]) + ', ' + Math.round(a * 1000) / 1000 + ')'
    : 'rgb(' + ch(c[0]) + ', ' + ch(c[1]) + ', ' + ch(c[2]) + ')';
}

// Two parsed colors mixed per channel, alpha included, as a string; with
// `ok`, in oklch.
const mixColor = (a, b, p, ok) => (ok ? mixOklch(a, b, p) : formatColor([a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p, a[3] + (b[3] - a[3]) * p]));

// sRGB to OKLab and back, with Björn Ottosson's matrices (public domain),
// rounded from ten decimals to seven, which leaves an 8-bit color's round
// trip exact and each row's sum as it was: linear light to the cone
// responses, their cube roots to L, a and b, and the inverses.
const LMS = [0.4122215, 0.5363325, 0.051446, 0.2119035, 0.6806995, 0.107397, 0.0883025, 0.2817188, 0.6299787];
const LAB = [0.2104543, 0.7936178, -0.004072, 1.9779985, -2.4285922, 0.4505937, 0.025904, 0.7827718, -0.8086758];
const LAB_LMS = [1, 0.3963378, 0.2158038, 1, -0.1055613, -0.0638542, 1, -0.0894842, -1.2914855];
const LMS_RGB = [4.0767417, -3.3077116, 0.2309699, -1.268438, 2.6097574, -0.3413194, -0.0041961, -0.7034186, 1.7076147];
const times = (m, v, f) => [0, 3, 6].map((i) => f(m[i] * v[0] + m[i + 1] * v[1] + m[i + 2] * v[2]));
const same = (v) => v;
const toLinear = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toByte = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

// [lightness, chroma, hue in radians] of a parsed color.
function lch(c) {
  const lab = times(LAB, times(LMS, c.map(toLinear), Math.cbrt), same);
  return [lab[0], Math.hypot(lab[1], lab[2]), Math.atan2(lab[2], lab[1])];
}

// Lightness and chroma mixed linearly, the hue the shorter way round, alpha
// linearly. A grey has no hue of its own, so it takes the other color's. A
// mix outside sRGB keeps its lightness and hue and loses chroma, by
// bisection, until it fits.
function mixOklch(a, b, p) {
  const x = lch(a), y = lch(b);
  if (x[1] < 1e-4) x[2] = y[2];
  if (y[1] < 1e-4) y[2] = x[2];
  let dh = y[2] - x[2];
  dh -= 2 * PI * Math.round(dh / (2 * PI));
  const L = x[0] + (y[0] - x[0]) * p, h = x[2] + dh * p;
  const rgb = (c) => times(LMS_RGB, times(LAB_LMS, [L, c * Math.cos(h), c * Math.sin(h)], (v) => v * v * v), same);
  const fits = (c) => rgb(c).every((v) => v > -1e-4 && v < 1 + 1e-4);
  let lo = Math.max(0, x[1] + (y[1] - x[1]) * p), hi = lo;
  if (!fits(lo)) {
    lo = 0;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  }
  return formatColor(rgb(lo).map(toByte).concat(a[3] + (b[3] - a[3]) * p));
}

// options.space, checked: true for 'oklch', false for 'rgb', the default.
// The where is the track's .space, or with a key of null, `label` itself.
function spaceOf(o, code, label, key) {
  const s = o && o.space;
  if (s !== undefined && s !== 'rgb' && s !== 'oklch') throw fail(code, key === null ? label : place(label, key) + '.space', __DEV__ && "space is 'rgb' or 'oklch', not " + show(s));
  return s === 'oklch';
}

// ---- text values ------------------------------------------------------------------

// A value such as 'inset(0% 40% 0% 0%)' or '"wght" 300' is read left to right
// into pieces: the text between tokens as a string, a number (the CSS number
// token) as a number, and a color (hex, rgb() or rgba()) as its parsed
// channels. A quoted string and a url() are text, and so is a number right
// after a letter, a digit or # (h1, e2e, the digits of a hex color). SVG path
// data is read by its own grammar instead (pathPieces): a whole value that
// is path data, and the inside of a path("…") or path('…') anywhere.
const TOKEN = /path\(\s*(?:"[^"]*"|'[^']*')|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)|#[\da-f]{3,8}(?![\w-])|rgba?\([^)]*\)|[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/gi;

// Path data as pieces, after `lead` (text that is not path data): each
// command letter and arc flag as text, every other argument as a number, one
// space between them, so 'M190-30C130' reads as 'M ', 190, ' ', -30, ' C ',
// 130 and is written back so it parses. The indexes of the path's pieces go
// in out.path, for the hint on a mismatch. Returns false, adding nothing,
// when the grammar rejects the data.
function pathPieces(d, out, lead) {
  const cmds = readPath(d);
  if (typeof cmds === 'number' || !cmds.length) return false;
  if (lead) out.push(lead);
  const mark = out.path || (out.path = new Set());
  let text = '', sep = '';
  const flush = () => { if (text) { mark.add(out.length); out.push(text); } text = ''; };
  for (const e of cmds) {
    if (e[1]) { text += sep + e[0]; sep = ' '; }
    for (let j = 2; j < e.length; j++) {
      text += sep; sep = ' ';
      if ((e[0] === 'A' || e[0] === 'a') && (j === 5 || j === 6)) text += e[j];
      else { flush(); mark.add(out.length); out.push(e[j]); }
    }
  }
  flush();
  return true;
}

function splitText(s) {
  const out = [];
  let text = '', from = 0, m;
  if (/^\s*m/i.test(s) && pathPieces(s, out, '')) return out;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(s))) {
    const w = m[0], at = m.index, c = w[0];
    let end = TOKEN.lastIndex, tok = null;
    if (c === 'p' || c === 'P') {
      // path("…"), its function name not the end of a longer one: the path
      // data is read as path data, and path(" and the closing quote are text.
      const q = w.search(/["']/) + 1;
      if (!/[\w-]/.test(s[at - 1] || '') && pathPieces(w.slice(q, -1), out, text + s.slice(from, at) + w.slice(0, q))) {
        text = w.slice(-1);
        from = end;
        continue;
      }
      // Otherwise as before: path( is text, then the quoted string.
      end = TOKEN.lastIndex = at + 5;
    } else if (c === '#' || c === 'r' || c === 'R') {
      tok = parseColor(w);
      // An rgb( that is no color: the numbers inside it are read one by one.
      if (!tok && c !== '#') end = TOKEN.lastIndex = at + w.indexOf('(') + 1;
    } else if (/[\d.+-]/.test(c) && !/[\da-z#]/i.test(s[at - 1] || '')) tok = Number(w);
    text += s.slice(from, tok === null ? end : at);
    if (tok !== null) { if (text) out.push(text); out.push(tok); text = ''; }
    from = end;
  }
  text += s.slice(from);
  if (text) out.push(text);
  return out;
}

const ORD = ['st', 'nd', 'rd'];
const piece = (v) => (typeof v === 'string' ? show(v) : v === undefined ? 'nothing' : typeof v === 'number' ? 'a number' : 'a colour');

const SAME = ' must have the same text, with only the numbers and colours changing';
// A colour this does not read, a name or hsl(), is text, so values of them
// differ as text: the message then names the forms that are colours.
const COLOURS = '; a colour is #rgb, #rrggbb, #rrggbbaa, rgb() or rgba(), and a name or hsl() is text';
const named = (s) => /^\s*(?:[a-z]+|hsla?\(.*\))\s*$/i.test(s);
const PATHS = 'the paths have different commands; wildflower.kinetic.matchPaths() makes any two paths morphable';
const inPath = (v, j) => !!v.path && v.path.has(j);

// The first place where two split values differ, as a sentence ending in
// `tail`, or in the matchPaths() hint when the place is in path data; '' when
// they have the same text and the same kind of token in each place. The
// sentence is the development build's; the production build returns 1.
function differ(a, b, an, bn, tail) {
  let n = 0, c = 0, k = '';
  for (let j = 0; j < a.length || j < b.length; j++) {
    const x = a[j], y = b[j];
    if (typeof x === 'string' ? x !== y : typeof x !== typeof y) {
      if (!__DEV__) return 1;
      const i = k === 'number' ? n : c;
      const where = k ? 'after its ' + i + (ORD[((i + 90) % 100 - 10) % 10 - 1] || 'th') + ' ' + k : j ? 'after ' + show(a[0]) : 'at its start';
      return bn + ' has ' + piece(y) + ' ' + where + ' where ' + an + ' has ' + piece(x) + '; ' + (inPath(a, j) || inPath(b, j) ? PATHS : tail);
    }
    if (typeof x === 'number') { n++; k = 'number'; } else if (typeof x === 'object') { c++; k = 'colour'; }
  }
  return '';
}

// Two matched split values at p: the text as it is, each color mixed as a
// color track mixes it (in oklch with `ok`), and each number rounded by
// `round` and then written with at most four decimals, no trailing zeros and
// no -0.
function mixText(a, b, p, round, ok) {
  let s = '';
  for (let j = 0; j < a.length; j++) {
    const x = a[j];
    s += typeof x === 'string' ? x : typeof x === 'number' ? fmt(roundTo(x + (b[j] - x) * p, round)) : mixColor(x, b[j], p, ok);
  }
  return s;
}

// ---- interpolate ------------------------------------------------------------------

const EXTRAPOLATE = ['clamp', 'extend', 'identity', 'wrap', 'mirror'];

// x modulo span, in [0, span): an x a hair under a whole number of spans is
// that number's start, as steps() counts it.
function cycle(x, span) {
  const n = x / span;
  return Math.max(0, n - Math.floor(n + 1e-9)) * span;
}

// A track's values: null for numbers, else one list of pieces per keyframe,
// a color track's list holding its one color, and `text` set on a track of
// text. A text track's keyframes must split the same way (KN-120 with the
// first difference otherwise). The strings are read once per `to` array and
// kept, as an ease array is, until one of them changes. `label` and `key`
// say where the track is, and the KN-120 where goes on to .at, .to or the
// keyframe, as in interpolate.to[1].
const parsedTo = new WeakMap();
function checkRange(at, to, label, key) {
  if (!Array.isArray(at) || !Array.isArray(to) || at.length < 2 || at.length !== to.length) {
    throw fail(CODES.BAD_TRACK, place(label, key) + (!Array.isArray(at) || at.length < 2 ? '.at' : '.to'), __DEV__ && 'at and to are arrays of the same length, two or more');
  }
  for (let i = 0; i < at.length; i++) {
    if (typeof at[i] !== 'number' || !Number.isFinite(at[i])) throw fail(CODES.BAD_TRACK, place(label, key) + '.at[' + i + ']', __DEV__ && 'at[' + i + '] is not a number');
    if (i && !(at[i] > at[i - 1])) throw fail(CODES.BAD_TRACK, place(label, key) + '.at[' + i + ']', __DEV__ && 'at must increase (at[' + i + '] = ' + at[i] + ' after ' + at[i - 1] + ')');
  }
  if (typeof to[0] !== 'string') {
    for (let i = 0; i < to.length; i++) {
      if (typeof to[i] !== 'number' || !Number.isFinite(to[i])) throw fail(CODES.BAD_TRACK, place(label, key) + '.to[' + i + ']', __DEV__ && 'to[' + i + '] is not a number' + (typeof to[i] === 'string' ? ' (a track mixes numbers and strings)' : ''));
    }
    return null;
  }
  let v = parsedTo.get(to);
  if (v && v.src.length === to.length && v.src.every((s, i) => s === to[i])) return v;
  for (let i = 0; i < to.length; i++) {
    if (typeof to[i] !== 'string') throw fail(CODES.BAD_TRACK, place(label, key) + '.to[' + i + ']', __DEV__ && 'to[' + i + '] is not a string (a track mixes strings and other values)');
  }
  const colors = to.map(parseColor);
  if (colors.every(Boolean)) v = colors.map((c) => [c]);
  else {
    v = to.map(splitText);
    v.text = true;
    for (let i = 1; i < v.length; i++) {
      const d = differ(v[0], v[i], __DEV__ && 'to[0]', __DEV__ && 'to[' + i + ']', __DEV__ && 'the values of a track' + SAME);
      if (d) throw fail(CODES.BAD_TRACK, place(label, key) + '.to[' + i + ']', __DEV__ && d + (to.some(named) ? COLOURS : ''));
    }
  }
  v.src = to.slice();
  parsedTo.set(to, v);
  return v;
}

function roundTo(v, round) {
  if (round === true) return Math.round(v);
  if (typeof round === 'number' && round >= 0) {
    const f = Math.pow(10, round);
    const r = Math.round(v * f) / f;
    return Number.isFinite(r) ? r : v;   // more decimals than a number holds change nothing
  }
  return v;
}

// The extrapolation on each side, `round` and `space`, checked; returns
// [left, right, true for oklch]. A color or text track cannot use 'identity',
// which returns t, a number. The KN-120 where is the track's option that
// failed, such as .extrapolateRight.
const sideOf = (o, left) => (left ? (o.extrapolateLeft ? 'extrapolateLeft' : 'extrapolate') : (o.extrapolateRight ? 'extrapolateRight' : 'extrapolate'));
function checkOptions(o, vals, label, key) {
  const left = o.extrapolateLeft || o.extrapolate || 'clamp';
  const right = o.extrapolateRight || o.extrapolate || 'clamp';
  if (!EXTRAPOLATE.includes(left) || !EXTRAPOLATE.includes(right)) {
    throw fail(CODES.BAD_TRACK, place(label, key) + '.' + sideOf(o, !EXTRAPOLATE.includes(left)), __DEV__ && "extrapolate is 'clamp', 'extend', 'identity', 'wrap' or 'mirror', not " + show(EXTRAPOLATE.includes(left) ? right : left));
  }
  if (vals && (left === 'identity' || right === 'identity')) {
    throw fail(CODES.BAD_TRACK, place(label, key) + '.' + sideOf(o, left === 'identity'), __DEV__ && 'a ' + (vals.text ? 'text' : 'color') + " track cannot extrapolate by 'identity', which returns t, a number");
  }
  const r = o.round;
  if (!(r === undefined || typeof r === 'boolean' || (Number.isInteger(r) && r >= 0))) throw fail(CODES.BAD_TRACK, place(label, key) + '.round', __DEV__ && 'round is true, false or a whole number of decimals, not ' + show(r));
  return [left, right, spaceOf(o, CODES.BAD_TRACK, label, key)];
}

// The tangent at key k of a curve threaded through every key: 0 at the
// first and last key, so the curve slows in and out; between, the Fritsch
// and Butland weighted harmonic mean of the slopes on either side, and 0
// where they differ in sign or one of them is 0, so the curve never passes
// a key's value on the way to the next and a hold of equal keys stays flat.
function tangent(at, to, k) {
  if (k === 0 || k === at.length - 1) return 0;
  const h0 = at[k] - at[k - 1], h1 = at[k + 1] - at[k];
  const d0 = (to[k] - to[k - 1]) / h0, d1 = (to[k + 1] - to[k]) / h1;
  if (d0 * d1 <= 0) return 0;
  return 3 * (h0 + h1) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
}

// The value p of the way through segment i of that curve: the cubic Hermite
// segment between the two keys with their tangents, so the curve passes
// each key at its value and keeps its velocity through the keys between.
function threaded(at, to, i, p) {
  const h = at[i + 1] - at[i], p2 = p * p, p3 = p2 * p;
  return (2 * p3 - 3 * p2 + 1) * to[i] + (p3 - 2 * p2 + p) * h * tangent(at, to, i) + (3 * p2 - 2 * p3) * to[i + 1] + (p3 - p2) * h * tangent(at, to, i + 1);
}

// The value at t for keyframe times `at` and values `to` (numbers, colors,
// or text with numbers and colors in it, every keyframe the same text).
// Options: ease (a name, function or spring spec, applied per segment, or an
// array of them, one per segment),
// extrapolate / extrapolateLeft / extrapolateRight ('clamp', the default,
// 'extend', 'identity', 'wrap' or 'mirror'), round (true for whole numbers,
// or a number of decimals), space ('rgb', the default, or 'oklch', for the
// colors). Outside the range, 'clamp' holds the end values, 'extend'
// continues the end segments, 'identity' returns t itself, 'wrap' starts
// the keyframes again from the first and 'mirror' plays them backward and
// forward in turn. A t that is not a number gives the first value; an
// infinite t on an 'extend', 'wrap' or 'mirror' side holds that side's end
// value, since there is no finite value there.
// interpolate(t, track) reads one track { at, to, ... } with its own options,
// its unit appended to a number, as a scene's keyframes entry of one track.
export function interpolate(t, at, to, opts) {
  if (isTrack(at)) {
    if (to !== undefined || opts !== undefined) throw fail(CODES.BAD_CALL, 'interpolate(t, track, …)', __DEV__ && 'a track carries its own to and options; pass it alone');
    return trackOf(t, at, ONE);
  }
  return interpolateAt(t, at, to, opts, 'interpolate');
}

// interpolate() for a track at `label` and `key` (see place()), which its
// KN-120 and KN-121 messages name.
function interpolateAt(t, at, to, opts, label, key) {
  const o = opts || {};
  const vals = checkRange(at, to, label, key);
  const [left, right, ok] = checkOptions(o, vals, label, key);
  const last = at.length - 1;
  const fns = o.ease === undefined ? null : easesOf(o.ease, last, label, key);
  // Past the last key, the last segment's ease decides: a spring runs on.
  const tail = Array.isArray(fns) ? fns[last - 1] : fns;
  const end = (k) => (vals ? mixText(vals[k], vals[k], 0, o.round) : roundTo(to[k], o.round));
  if (typeof t !== 'number' || t !== t) return end(0);
  // Wrapped or mirrored into the range: the cycle is the keyframes' span, or
  // twice it for a mirror, whose second half runs back.
  const side = t > at[last] ? right : t < at[0] ? left : '';
  if ((side === 'wrap' || side === 'mirror') && Number.isFinite(t)) {
    const all = at[last] - at[0], q = cycle(t - at[0], side === 'wrap' ? all : 2 * all);
    t = at[0] + (q > all ? 2 * all - q : q);
  }
  if (t < at[0] && (left !== 'extend' || t === -Infinity)) return left === 'identity' ? t : end(0);
  // identity returns t whatever the last ease is; a spring runs on otherwise.
  if (t > at[last] && right === 'identity') return t;
  if (t > at[last] && ((right !== 'extend' && !(tail && tail.seconds)) || (t === Infinity && right === 'extend'))) return end(last);
  let i = 0;
  while (i < last - 1 && t >= at[i + 1]) i++;
  const span = at[i + 1] - at[i];
  let p = (t - at[i]) / span;
  const fn = Array.isArray(fns) ? fns[i] : fns;
  // One 'smooth' ease over a number track of three or more keys threads one
  // curve through them all; the segment's own smoothstep would stop at
  // each key. Outside the segment (an 'extend' side) the chord continues,
  // as it does for every ease.
  if (fn && fn.smooth && !Array.isArray(fns) && !vals && last > 1 && p >= 0 && p <= 1) return roundTo(threaded(at, to, i, p), o.round);
  if (fn) {
    if (fn.seconds) p = fn(p, t - at[i], span);
    else if (p >= 0 && p <= 1) p = fn(p);
  }
  if (vals) return mixText(vals[i], vals[i + 1], p, o.round, ok);
  return roundTo(to[i] + (to[i + 1] - to[i]) * p, o.round);
}

// t's progress from `from` to `to` seconds as 0 to 1, clamped, then shaped
// by an ease when one is given: interpolate(t, [from, to], [0, 1], { ease })
// without the arrays, so a scene can call it many times a frame. A spring
// ease reads the seconds since `from` and runs on past `to`, as it does in
// interpolate.
export function ramp(t, from, to, how) {
  checkTime(t, 'ramp');
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) {
    throw fail(CODES.BAD_CALL, 'ramp(t, from, to)', __DEV__ && 'from and to are finite seconds with to after from, not ' + show(from) + ', ' + show(to));
  }
  const fn = how === undefined ? null : easeAt(how, 'ramp(t, from, to, ease)');
  if (!(t >= from)) return 0;
  if (t > to && !(fn && fn.seconds)) return 1;
  const p = (t - from) / (to - from);
  if (!fn) return p;
  return fn.seconds ? fn(p, t - from) : fn(p);
}

// a + (b - a) * p for two numbers. For two colors, in any form interpolate
// takes, the same mix interpolate makes (per channel, or in oklch with
// options.space), as an rgb() or rgba() string. For two text values with the
// same text, every number and color in them mixed, as a text track mixes
// them. p is not clamped.
export function mix(a, b, p, opts) {
  const ok = spaceOf(opts, CODES.BAD_CALL, 'mix(a, b, p, { space })', null);
  if (typeof p !== 'number' || !Number.isFinite(p)) throw fail(CODES.BAD_CALL, 'mix(…, p)', __DEV__ && 'p is a finite number, not ' + show(p));
  if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) return a + (b - a) * p;
  if (typeof a !== 'string' || typeof b !== 'string') throw fail(CODES.BAD_CALL, 'mix(a, b)', __DEV__ &&'a and b are two finite numbers, two colors (#rgb, #rrggbb, #rrggbbaa, rgb() or rgba()) or two strings of the same text with numbers in it, not ' + show(a) + ' and ' + show(b));
  const x = parseColor(a), y = parseColor(b);
  if (x && y) return mixColor(x, y, p, ok);
  const sa = splitText(a), sb = splitText(b), d = differ(sa, sb, __DEV__ && 'a', __DEV__ && 'b', __DEV__ && 'a and b' + SAME);
  if (d) throw fail(CODES.BAD_CALL, 'mix(…, b)', __DEV__ && d + (named(a) || named(b) ? COLOURS : ''));
  return mixText(sa, sb, p, undefined, ok);
}

// ---- time ---------------------------------------------------------------------

// The delay in seconds for item i of n: its distance from the origin past
// the nearest item's, as a fraction of the farthest item's, eased, times the
// span (total, or each times that spread). In one dimension the items sit in a row; on a
// grid [columns, rows], item i is at column i % columns and row
// floor(i / columns), and the distance is the straight line between cells,
// or its part along `axis`. 'edges' measures to the nearest edge, so the
// outermost items start first; 'random' is each item's rank in a seeded
// shuffle. The largest distance and the shuffle are kept per n and options,
// since a stagger is called for every item on every frame.
const ORIGINS = ['first', 'last', 'center', 'edges', 'random'];
const staggers = new Map();
// KN-100 from stagger(), `where` naming the argument or option that failed.
const staggerFail = (where, what, v) => fail(CODES.BAD_CALL, where, __DEV__ && what + ', not ' + show(v));
export function stagger(i, n, opts) {
  const o = opts || {};
  const from = o.from === undefined ? 'first' : o.from;
  const each = o.each === undefined ? 0.05 : o.each;
  const total = o.total, g = o.grid, axis = g ? o.axis : 'x';
  // A million items at most: the distances are measured over all n, once.
  if (!(Number.isInteger(n) && n > 0 && n <= 1e6)) throw staggerFail('stagger(…, n)', __DEV__ && 'n is a whole number from 1 to 1000000', n);
  if (!(Number.isInteger(i) && i >= 0 && i < n)) throw staggerFail('stagger(i)', __DEV__ && 'i is a whole number from 0 to ' + (n - 1), i);
  if (!(ORIGINS.includes(from) || (Number.isInteger(from) && from >= 0 && from < n))) throw staggerFail('stagger(i, n, { from })', __DEV__ && "from is 'first', 'last', 'center', 'edges', 'random' or an index from 0 to " + (n - 1), from);
  if (!(Number.isFinite(each) && each >= 0)) throw staggerFail('stagger(i, n, { each })', __DEV__ && 'each is a finite number of seconds, 0 or more', each);
  if (total !== undefined && !(Number.isFinite(total) && total >= 0)) throw staggerFail('stagger(i, n, { total })', __DEV__ && 'total is a finite number of seconds, 0 or more', total);
  if (g !== undefined && !(Array.isArray(g) && g.length === 2 && Number.isInteger(g[0]) && Number.isInteger(g[1]) && g[0] > 0 && g[1] > 0 && g[0] * g[1] >= n)) {
    throw staggerFail('stagger(i, n, { grid })', __DEV__ && 'grid is [columns, rows], two whole numbers 1 or more with a cell for each of the n items', g);
  }
  if (o.axis !== undefined && !g) throw fail(CODES.BAD_CALL, 'stagger(i, n, { axis, grid })', __DEV__ && 'axis ' + show(o.axis) + ' needs grid: [columns, rows]');
  if (o.axis !== undefined && axis !== 'x' && axis !== 'y') throw staggerFail('stagger(i, n, { axis })', __DEV__ && "axis is 'x' or 'y'", o.axis);
  const f = o.ease === undefined ? null : easeAt(o.ease, 'stagger(i, n, { ease })');
  const seed = from === 'random' ? seedOf(o.seed === undefined ? 1 : o.seed, 'stagger(i, n, { seed })') : 0;
  const kept = spread(n, from, g, axis, seed);
  // Measured from the nearest item, so the first to start starts at 0 and
  // `total` is the time from the first start to the last.
  const d = kept[0](i) - kept[1], range = kept[2];
  if (!range) return 0;
  return (f ? f(d / range) : d / range) * (total === undefined ? each * range : total);
}

// The distances of n items from an origin, for stagger() and sweep(): the
// distance as a function of the item, the smallest, and the range above
// it, kept per n and options, since the helpers are called for every item
// on every frame.
function spread(n, from, g, axis, seed) {
  const key = n + ' ' + from + ' ' + g + ' ' + axis + ' ' + seed;
  let kept = staggers.get(key);
  if (!kept) {
    const cols = g ? g[0] : n, rows = g ? g[1] : 1;
    const cell = (j) => [j % cols, Math.floor(j / cols)];
    const o0 = from === 'first' ? [0, 0] : from === 'last' ? [cols - 1, rows - 1] : from === 'center' ? [(cols - 1) / 2, (rows - 1) / 2] : cell(from);
    let dist;
    if (from === 'random') {
      // A seeded Fisher-Yates shuffle of 0 .. n - 1: item j's rank is ranks[j].
      const ranks = Array.from({ length: n }, (_, j) => j);
      let r = [0, seed];
      for (let j = n - 1; j > 0; j--) {
        r = next(r[1]);
        const k = Math.floor(r[0] * (j + 1)), x = ranks[j];
        ranks[j] = ranks[k]; ranks[k] = x;
      }
      dist = (j) => ranks[j];
    } else {
      dist = (j) => {
        const [x, y] = cell(j);
        const ex = Math.min(x, cols - 1 - x), ey = Math.min(y, rows - 1 - y);
        if (from === 'edges') return axis === 'x' ? ex : axis === 'y' ? ey : Math.min(ex, ey);
        const dx = Math.abs(x - o0[0]), dy = Math.abs(y - o0[1]);
        return axis === 'x' ? dx : axis === 'y' ? dy : Math.hypot(dx, dy);
      };
    }
    let min = Infinity, max = 0;
    for (let j = 0; j < n; j++) { const x = dist(j); min = Math.min(min, x); max = Math.max(max, x); }
    if (staggers.size > 63) staggers.clear();
    staggers.set(key, kept = [dist, min, max - min]);
  }
  return kept;
}

// The weight, 0 to 1, of item i of n under a window that sweeps through
// the items as p goes from 0 to 1: the window is `width` of the items wide
// (0.3), starts before the first item and ends past the last, and the
// item's weight is the window's `shape` at the item's place in it. 'ramp'
// (the default) rises from 0 as the window's leading edge reaches the item
// to 1 as its trailing edge passes, and holds; 'square' is 1 inside the
// window and 0 outside; 'triangle' rises and falls back over the window;
// 'round' is a half-sine bump. `ease` shapes the rise and the fall. The
// order is `from`, as stagger() has it in one dimension: 'first', 'last',
// 'center', 'edges', 'random' with `seed`, or an index. A letter then takes
// opacity w and translateY (1 - w) * 40: the change scaled by the
// selection, where stagger() delays each letter's own timeline.
const SHAPES = ['ramp', 'square', 'triangle', 'round'];
export function sweep(i, n, p, opts) {
  const o = opts || {};
  const from = o.from === undefined ? 'first' : o.from;
  const width = o.width === undefined ? 0.3 : o.width;
  const shape = o.shape === undefined ? 'ramp' : o.shape;
  if (!(Number.isInteger(n) && n > 0 && n <= 1e6)) throw staggerFail('sweep(…, n)', __DEV__ && 'n is a whole number from 1 to 1000000', n);
  if (!(Number.isInteger(i) && i >= 0 && i < n)) throw staggerFail('sweep(i)', __DEV__ && 'i is a whole number from 0 to ' + (n - 1), i);
  if (typeof p !== 'number' || p !== p) throw staggerFail('sweep(…, p)', __DEV__ && 'p is a number, the progress of the sweep from 0 to 1', p);
  if (!(ORIGINS.includes(from) || (Number.isInteger(from) && from >= 0 && from < n))) throw staggerFail('sweep(i, n, p, { from })', __DEV__ && "from is 'first', 'last', 'center', 'edges', 'random' or an index from 0 to " + (n - 1), from);
  if (!(Number.isFinite(width) && width > 0 && width <= 4)) throw staggerFail('sweep(i, n, p, { width })', __DEV__ && 'width is a number above 0 and up to 4, the window as a fraction of the items', width);
  if (!SHAPES.includes(shape)) throw staggerFail('sweep(i, n, p, { shape })', __DEV__ && "shape is 'ramp', 'square', 'triangle' or 'round'", shape);
  const f = o.ease === undefined ? null : easeAt(o.ease, 'sweep(i, n, p, { ease })');
  const seed = from === 'random' ? seedOf(o.seed === undefined ? 1 : o.seed, 'sweep(i, n, p, { seed })') : 0;
  const kept = spread(n, from, undefined, 'x', seed);
  const u = kept[2] ? (kept[0](i) - kept[1]) / kept[2] : 0;
  // The leading edge runs from a window's width before the first item to
  // one past the last, so nothing is under the window at 0 and everything
  // has passed it at 1; x is the item's place in the window, 0 at the
  // leading edge and 1 at the trailing one.
  const q = p <= 0 ? 0 : p >= 1 ? 1 : p;
  const x = (q * (1 + 2 * width) - width - u) / width;
  const rise = (y) => (y <= 0 ? 0 : y >= 1 ? 1 : f ? f(y) : y);
  if (shape === 'square') return x >= 0 && x < 1 ? 1 : 0;
  if (shape === 'ramp') return rise(x);
  if (x <= 0 || x >= 1) return 0;
  return shape === 'triangle' ? rise(x < 0.5 ? 2 * x : 2 - 2 * x) : Math.sin(PI * x);
}

// Rows { key, i, style } for a data-list of n copies of one element, each
// the transform of the one before it again, as a repeater: copy k is moved
// by k times translateX and translateY (px), turned by k times rotate
// (degrees) and scaled by scale to the power k, composed as one matrix, so
// a turn with a move makes an arc and a scale with a move a spiral, about
// the element's transform-origin, which `origin` writes. `opacity` is
// [first, last], mixed across the copies. `offset` shifts the series: copy
// k takes copy k + offset's transform, so a negative offset centres the
// copies on the original.
const REPEAT_KEYS = ['translateX', 'translateY', 'rotate', 'scale', 'opacity', 'offset', 'origin'];
// A · B for two CSS matrix() lists [a, b, c, d, e, f]: B applied first.
const affine = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
export function repeat(n, opts) {
  const o = opts || {};
  if (!(Number.isInteger(n) && n > 0 && n <= 10000)) throw fail(CODES.BAD_CALL, 'repeat(n)', __DEV__ && 'n is a whole number from 1 to 10000, not ' + show(n));
  if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL, 'repeat(n, options)', __DEV__ && 'options is an object, not ' + show(opts));
  for (const k in o) if (!REPEAT_KEYS.includes(k)) throw fail(CODES.BAD_CALL, 'repeat(n, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the options are " + REPEAT_KEYS.join(', '));
  const num = (k, d, lo, what) => {
    const v = o[k] === undefined ? d : o[k];
    if (!(typeof v === 'number' && Number.isFinite(v) && v >= lo)) throw fail(CODES.BAD_CALL, 'repeat(n, { ' + k + ' })', __DEV__ && what + ', not ' + show(v));
    return v;
  };
  const tx = num('translateX', 0, -Infinity, __DEV__ && 'translateX is a finite number of px'), ty = num('translateY', 0, -Infinity, __DEV__ && 'translateY is a finite number of px');
  const r = num('rotate', 0, -Infinity, __DEV__ && 'rotate is a finite number of degrees'), s = num('scale', 1, 1e-6, __DEV__ && 'scale is a finite number above 0');
  const offset = o.offset === undefined ? 0 : o.offset;
  if (!(Number.isInteger(offset) && Math.abs(offset) <= 10000)) throw fail(CODES.BAD_CALL, 'repeat(n, { offset })', __DEV__ && 'offset is a whole number from -10000 to 10000, not ' + show(offset));
  const op = o.opacity === undefined ? null : typeof o.opacity === 'number' ? [1, o.opacity] : o.opacity;
  if (op !== null && !(Array.isArray(op) && op.length === 2 && op.every((v) => typeof v === 'number' && v >= 0 && v <= 1))) throw fail(CODES.BAD_CALL, 'repeat(n, { opacity })', __DEV__ && 'opacity is [first, last], two numbers from 0 to 1, or the last copy\'s alone, not ' + show(o.opacity));
  if (o.origin !== undefined && typeof o.origin !== 'string') throw fail(CODES.BAD_CALL, 'repeat(n, { origin })', __DEV__ && 'origin is a transform-origin string, such as \'50% 100%\', not ' + show(o.origin));
  const c = Math.cos((r * PI) / 180) * s, d = Math.sin((r * PI) / 180) * s;
  const M = [c, d, -d, c, tx, ty];
  // The inverse, for the copies before the original when offset is negative.
  const det = M[0] * M[3] - M[1] * M[2];
  const inv = [M[3] / det, -M[1] / det, -M[2] / det, M[0] / det, (M[2] * M[5] - M[3] * M[4]) / det, (M[1] * M[4] - M[0] * M[5]) / det];
  let m = [1, 0, 0, 1, 0, 0];
  for (let k = 0; k < Math.abs(offset); k++) m = affine(m, offset < 0 ? inv : M);
  const rows = [];
  for (let k = 0; k < n; k++) {
    const style = { transform: 'matrix(' + m.map(fmt).join(', ') + ')' };
    if (op) style.opacity = n > 1 ? op[0] + (op[1] - op[0]) * (k / (n - 1)) : op[0];
    if (o.origin !== undefined) style.transformOrigin = o.origin;
    rows.push({ key: k, i: k, style });
    m = affine(m, M);
  }
  return rows;
}

// t stepped to fps frames a second, for animation on twos or a stop-motion
// look: styleAt(posterize(t, 12), tracks). The 1e-9 keeps a product that lands a
// hair under a whole number on that number's frame.
export function posterize(t, fps) {
  checkTime(t, 'posterize');
  if (!(typeof fps === 'number' && fps > 0 && fps < Infinity)) throw fail(CODES.BAD_CALL, 'posterize(t, fps)', __DEV__ && 'fps is a finite number above 0, not ' + show(fps));
  return Math.floor(t * fps + 1e-9) / fps;
}

// A clip's time cycling through [from, to): t before `from`, then from plus
// the time since `from` modulo the length. At t = Infinity it is `to`, the
// end a track that wraps holds there.
export function loop(t, from, to) {
  checkTime(t, 'loop');
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) {
    throw fail(CODES.BAD_CALL, 'loop(t, from, to)', __DEV__ && 'from and to are finite seconds with to after from, not ' + show(from) + ', ' + show(to));
  }
  return t < from ? t : t === Infinity ? to : from + cycle(t - from, to - from);
}

// Time that stops at `at` for `length` seconds and then carries on: t before
// `at`, `at` until at + length, and t - length after.
export function hold(t, at, length) {
  checkTime(t, 'hold');
  if (!Number.isFinite(at) || !(Number.isFinite(length) && length >= 0)) {
    throw fail(CODES.BAD_CALL, 'hold(t, at, length)', __DEV__ && 'at is finite seconds and length finite seconds, 0 or more, not ' + show(at) + ', ' + show(length));
  }
  return t < at ? t : t < at + length ? at : t - length;
}

// ---- tracks and styleAt ---------------------------------------------------------

// The keys a style folds into `transform`, in the order it writes them, with
// their default units. A transform list composes left to right in the
// element's own coordinates, so this gives the element depth, moves it, turns
// it in 3D, turns it in the plane, shears it and sizes it; perspective()
// comes first because it acts only on the functions after it. translateX and
// translateY write one translate(X, Y). blur folds into `filter: blur()`.
// Every one of them takes numbers. Any other key is a style property of its
// own.
const TRANSFORM = { perspective: 'px', translateX: 'px', translateY: 'px', translateZ: 'px', rotateX: 'deg', rotateY: 'deg', rotate: 'deg', skewX: 'deg', skewY: 'deg', scale: '', scaleX: '', scaleY: '' };
const FOLDED = Object.assign({ blur: 'px' }, TRANSFORM);

const isTrack = (v) => !!v && typeof v === 'object' && Array.isArray(v.at);

// A key of an object of tracks is a track or a number, the number being
// that key's value at every time, as camera() takes its keys. Thrown at
// `label` and `key` when it is neither, or a number that is not finite.
function checkPart(v, label, key) {
  if (typeof v === 'number' ? !Number.isFinite(v) : !isTrack(v)) throw fail(CODES.BAD_TRACK, place(label, key), __DEV__ && 'a number or a track { at: [...], to: [...] }, not ' + show(v));
}

// Checks a track or a spec of tracks once, at definition time, so a bad
// keyframe fails where it was written and not on the first seek.
export function checkTracks(spec, label) {
  if (isTrack(spec)) {
    checkTrack(spec, label);
    if (__DEV__) lint(spec, null, label);
    return;
  }
  if (!spec || typeof spec !== 'object') throw fail(CODES.BAD_TRACK, label, __DEV__ && 'a track { at, to } or an object of tracks');
  const keys = Object.keys(spec);
  if (!keys.length) throw fail(CODES.BAD_TRACK, label + ' = {}', __DEV__ && 'no tracks');
  checkWrites(spec, label);
  for (const k of keys) {
    checkPart(spec[k], label, k);
    if (isTrack(spec[k])) checkTrack(spec[k], label, k);
  }
  if (__DEV__) {
    for (const k of keys) lint(spec[k], k, label + '.' + k);
    lintedSpecs.add(spec);
  }
}

// blur writes `filter` and the transform keys write `transform`, so a
// track of either name beside them would have one value replace the other.
// The folded keys take numbers.
function checkWrites(spec, label) {
  if (spec.blur != null && spec.filter != null) throw fail(CODES.BAD_TRACK, label + '.filter', __DEV__ && 'blur and filter both write the filter property; use one of them');
  for (const k in FOLDED) {
    const tr = spec[k];
    if (tr == null) continue;
    if (spec.transform != null && k !== 'blur') throw fail(CODES.BAD_TRACK, label + '.transform', __DEV__ && 'a transform track beside ' + k + '; ' + Object.keys(TRANSFORM).join(', ') + ' write transform themselves, so use one or the other');
    if (tr.to && typeof tr.to[0] === 'string') throw fail(CODES.BAD_TRACK, label + '.' + k + '.to', __DEV__ && k + ' takes numbers, not colours or text');
  }
}

// A track at `label` and `key` (see place()), checked.
function checkTrack(tr, label, key) {
  const vals = checkRange(tr.at, tr.to, label, key);
  checkOptions(tr, vals, label, key);
  if (tr.ease !== undefined) easesOf(tr.ease, tr.at.length - 1, label, key);
  if (tr.unit !== undefined && typeof tr.unit !== 'string') throw fail(CODES.BAD_TRACK, place(label, key) + '.unit', __DEV__ && 'unit is a string');
  if (vals && tr.unit) throw fail(CODES.BAD_TRACK, place(label, key) + '.unit', __DEV__ && (vals.text ? 'a text track has no unit; its units are in its text' : 'a color track has no unit'));
}

// ---- development lint ------------------------------------------------------------

// The style properties that take a CSS length, where a number with no unit is
// not valid CSS and the browser drops it. The keys styleAt() folds are not here:
// it gives them their units itself (FOLDED).
const LENGTH = /^(?:width|height|top|right|bottom|left|inset\w*|(?:min|max)(?:Width|Height)|(?:margin|padding)\w*|fontSize|letterSpacing|wordSpacing|lineHeight|textIndent|gap|rowGap|columnGap|flexBasis|outlineWidth|outlineOffset|offsetDistance|border\w*(?:Radius|Width))$/;
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const round2 = (v) => Math.round(v * 100) / 100;

// What a valid track does that its author is unlikely to want, warned about
// once per track: a length with no unit (KN-122), and a spring that the next
// key cuts off short of rest, so the value jumps (KN-123). `prop` is the
// style property, or null for a track that gives one value.
// A number given for a length property (KN-122), warned about once per
// place: styleAt() hands it to the browser as it is, and 0 is the one length
// that needs no unit. A bare number on lineHeight is a valid multiple.
const lintedAt = new Set();
// The objects of tracks checkTracks() has linted, a scene's keyframes.
const lintedSpecs = new WeakSet();
function lintNumber(v, prop, who) {
  const name = prop && camel(prop);
  if (!v || !name || name === 'lineHeight' || !LENGTH.test(name) || lintedAt.has(who)) return;
  lintedAt.add(who);
  warn(CODES.NO_UNIT, who + ' is a number with no unit, and ' + prop + ' takes a length, so the browser ignores ' + v,
    'Set ' + prop + ' in CSS (' + name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) + ': ' + v + "px), or give it a track with unit: 'px'.");
}

const linted = new WeakSet();
function lint(tr, prop, who) {
  if (typeof tr === 'number') return lintNumber(tr, prop, who);
  if (linted.has(tr)) return;
  linted.add(tr);
  const numbers = typeof tr.to[0] === 'number';
  const name = prop && camel(prop);
  if (name && numbers && tr.unit === undefined && LENGTH.test(name) && tr.to.some((v) => v !== 0)) {
    const value = tr.to.find((v) => v !== 0);
    if (name === 'lineHeight') {
      warn(CODES.NO_UNIT, who + " gives numbers with no unit, and a bare number on lineHeight is a multiple of the font size, so " + value + ' is ' + value + ' lines, not pixels',
        "Add unit: 'px' to the track for pixels, or unit: '' to keep the multiple.");
    } else {
      warn(CODES.NO_UNIT, who + ' gives numbers with no unit, and ' + prop + ' takes a length, so the browser ignores a value such as ' + value,
        "Add unit: 'px' to the track (or '%', 'em', 'rem'): " + prop + ': { at: [...], to: [...], unit: \'px\' }.');
    }
  }
  if (tr.ease === undefined) return;
  const fns = easesOf(tr.ease, tr.at.length - 1, who);
  const unit = tr.unit !== undefined ? tr.unit : own(FOLDED, prop) ? FOLDED[prop] : '';
  // Every segment but the last, where a spring runs on past its key, unless
  // the track wraps: then time starts again from the first key there, and the
  // spring is cut. A mirror plays the last segment back from where it is, so
  // the value does not jump. The 1e-9 lets a spring exactly 2% from rest at
  // its key pass.
  const wraps = (tr.extrapolateRight || tr.extrapolate) === 'wrap';
  for (let i = 0; i < tr.at.length - (wraps ? 1 : 2); i++) {
    const fn = Array.isArray(fns) ? fns[i] : fns;
    if (!fn || !fn.seconds || tr.to[i] === tr.to[i + 1]) continue;
    const start = fn(0, 0), rest = fn(1, Infinity);
    if (rest === start) continue;
    const off = Math.abs((rest - fn(1, tr.at[i + 1] - tr.at[i])) / (rest - start));
    if (!(off > 0.02 + 1e-9)) continue;
    const pct = Math.round(off * 1000) / 10;
    // How far from rest, by the segment's change: a text track's largest
    // number change, with the unit written after that number.
    let d = numbers ? Math.abs(tr.to[i + 1] - tr.to[i]) : 0, u = unit;
    if (!numbers) {
      const v = checkRange(tr.at, tr.to, who);
      v[i].forEach((x, j) => {
        const e = typeof x === 'number' && Math.abs(v[i + 1][j] - x);
        if (e > d) { d = e; u = /^[a-z%]*/i.exec(typeof v[i][j + 1] === 'string' ? v[i][j + 1] : '')[0]; }
      });
    }
    const far = d ? round2(d * off) + u + ' from rest (' + pct + "% of the segment's travel)" : pct + "% of the segment's travel from rest";
    // When the spring comes within 2% of rest for good, as settle() gives it,
    // rounded up to a hundredth; a hair over a hundredth is that hundredth.
    // An ease that reads seconds and is no spring has no settle time.
    const settled = fn.spring ? Math.ceil(settleOf(fn.spring) * 100 - 1e-6) / 100 : Infinity;
    warn(CODES.SPRING_CUT, who + ' springs from ' + tr.at[i] + ' s to ' + tr.at[i + 1] + ' s and is still ' + far + ' when the key at ' + tr.at[i + 1] + ' s arrives, so the value jumps there',
      (i < tr.at.length - 2 ? 'Give the spring a track of its own with two keyframes, so it runs on past its last one, or lengthen the segment' : 'Lengthen the segment, since the track wraps at its last key')
        + (settled < Infinity ? ': this spring is within 2% of rest ' + settled + ' s after its key.' : '.'));
    return;
  }
}

// One track's value in styleAt(), the track at `label` and `key` (see
// place()). A number is its own value, with the key's default unit.
function trackValue(t, tr, defaultUnit, label, key) {
  if (typeof tr === 'number') return defaultUnit ? tr + defaultUnit : tr;
  const v = interpolateAt(t, tr.at, tr.to, tr, label, key);
  if (typeof v !== 'number') {
    if (tr.unit) throw fail(CODES.BAD_TRACK, place(label, key) + '.unit', __DEV__ && 'a color or text track has no unit');
    return v;
  }
  const unit = tr.unit === undefined ? defaultUnit : tr.unit;
  return unit ? v + unit : v;
}

// The style object for time t from an object of tracks. The transform keys
// combine into `transform` in the order TRANSFORM gives, and blur becomes
// `filter: blur()`; the rest are properties, with `unit` appended to
// numbers, and a text track writes its string. Each track is checked as it
// is read; a scene's keyframes are checked once, when the scene is defined.
// A message names a track as styleAt(t, tracks).opacity.
// Development, for KN-159: the property of a style object that styleAt()
// folds a track key into, 'transform' or 'filter', or '' for a key it writes
// as itself.
export const foldOf = (k) => (k === 'blur' ? 'filter' : own(TRANSFORM, k) ? 'transform' : '');

// One track's value: interpolate(t, track), and a scene's keyframes entry
// of one track, which styled() is given.
const ONE = 'interpolate(t, track)';
function trackOf(t, tr, label) {
  const v = trackValue(t, tr, '', label);
  if (__DEV__) lint(tr, null, 'interpolate(): the track');
  return v;
}

// styleAt() checks its t and takes an object of tracks only; a scene's
// keyframes and smear() call styled() with a time of their own. With only
// plain numbers the time is never read, so any t does.
const STYLE = 'styleAt(t, tracks)';
export function styleAt(t, spec) {
  if (!(spec && typeof spec === 'object' && !isTrack(spec) && Object.keys(spec).every((k) => typeof spec[k] === 'number'))) checkTime(t, 'styleAt');
  if (isTrack(spec)) throw fail(CODES.BAD_TRACK, 'styleAt(t, track)', __DEV__ && 'styleAt() takes an object of tracks; read one track with interpolate(t, track)');
  return styled(t, spec);
}
export function styled(t, spec) {
  if (isTrack(spec)) return trackOf(t, spec, ONE);
  if (!spec || typeof spec !== 'object') throw fail(CODES.BAD_TRACK, STYLE, __DEV__ && 'tracks is an object of tracks');
  const style = {};
  // Its own keys, each a track or a number, as checkTracks() has them:
  // null or undefined is neither, so a key present is never null below.
  const keys = Object.keys(spec);
  if (!keys.length) throw fail(CODES.BAD_TRACK, 'styleAt(t, {})', __DEV__ && 'no tracks');
  for (const k of keys) checkPart(spec[k], STYLE,k);
  checkWrites(spec, STYLE);
  const has = (k) => spec[k] != null;
  let tf = '';
  for (const k in TRANSFORM) {
    let part = '';
    if (k === 'translateX') {
      // Written when either axis is present, the other as 0px.
      if (has('translateX') || has('translateY')) part = 'translate(' + (has('translateX') ? trackValue(t, spec.translateX, 'px', STYLE,'translateX') : '0px') + ', ' + (has('translateY') ? trackValue(t, spec.translateY, 'px', STYLE,'translateY') : '0px') + ')';
    } else if (k !== 'translateY' && has(k)) part = k + '(' + trackValue(t, spec[k], TRANSFORM[k], STYLE,k) + ')';
    if (part) tf += (tf ? ' ' : '') + part;
  }
  if (tf) style.transform = tf;
  if (has('blur')) style.filter = 'blur(' + trackValue(t, spec.blur, 'px', STYLE,'blur') + ')';
  for (const k of keys) {
    if (!own(FOLDED, k)) style[k] = trackValue(t, spec[k], '', STYLE,k);
  }
  // A scene's keyframes were linted when it was defined, so this skips them.
  if (__DEV__ && !lintedSpecs.has(spec)) for (const k of keys) lint(spec[k], k, typeof spec[k] === 'number' ? "styleAt(): '" + k + "'" : "styleAt(): the track '" + k + "'");
  return style;
}

// ---- smear ---------------------------------------------------------------------

// smear(t, style, options): rows { key, style } for a data-list of copies
// of one element. Copy k of N is styled at t + (k / N) * (angle / 360) / fps,
// the times render()'s shutter seeks, at 1/N of its own opacity and added
// with plus-lighter, so inside an isolated group the copies sum to the
// element where they all overlap and leave a streak where they part. `style`
// is tracks, as styleAt() takes, or a function of the time that returns a
// style object. Made by wf.js with the clock store: its fps is the default,
// and its shutter, above 0 while a render with a shutter runs, makes smear()
// one copy at t, which the shutter blurs already. Reading the store's
// shutter makes a computed that calls smear() run again when that starts
// and ends.
export const createSmear = (store) => function smear(t, spec, opts) {
  const o = opts || {};
  const n = o.samples === undefined ? 8 : o.samples;
  const angle = o.angle === undefined ? 180 : o.angle;
  const fps = o.fps === undefined ? store.fps : o.fps;
  checkTime(t, 'smear', 1);
  if (typeof spec != 'function' && (!spec || typeof spec != 'object' || isTrack(spec))) {
    throw fail(CODES.BAD_CALL, 'smear(…, style)', __DEV__ && 'style is an object of tracks, as styleAt() takes, or a function of the time that returns a style object, not ' + show(spec));
  }
  checkShutter('smear(t, style, { ', ' })', angle, n, 1, 32);
  if (!(typeof fps == 'number' && fps > 0 && fps < Infinity)) throw fail(CODES.BAD_CALL, 'smear(t, style, { fps })', __DEV__ && 'fps is a finite number above 0, not ' + show(fps));
  const copies = store.shutter > 0 ? 1 : n;
  const rows = [];
  for (let k = 0; k < copies; k++) {
    const s = t + (k / copies) * (angle / 360) / fps;
    const own = typeof spec == 'function' ? spec(s) : styled(s, spec);
    if (!own || typeof own != 'object') throw fail(CODES.BAD_CALL, 'smear(…, style())', __DEV__ && 'the style function returns a style object, not ' + show(own));
    const style = Object.assign({}, own);
    if (copies > 1) {
      // The copy's own opacity is the style's, a number or a string, where
      // '50%' is 0.5; with none, or '', 1. A keyword such as 'inherit' has
      // no number to divide.
      const a = style.opacity;
      const v = a == null || (typeof a == 'string' && !a.trim()) ? 1 : /%\s*$/.test(a) ? parseFloat(a) / 100 : Number(a);
      if (!Number.isFinite(v)) throw fail(CODES.BAD_CALL, 'smear(…, style()).opacity', __DEV__ && 'opacity is a number, or a string of a number or a percentage, not ' + show(a));
      style.opacity = v / copies;
      style.mixBlendMode = 'plus-lighter';
    }
    rows.push({ key: k, style });
  }
  return rows;
};

// A shutter's angle and its samples, for smear() (1 to 32 copies) and
// render() and config() (2 to 64 seeks): KN-100 otherwise, its where the
// field's name between `pre` and `post`, as in smear(t, style, { angle }).
export function checkShutter(pre, post, angle, samples, fewest, most) {
  if (!(typeof angle == 'number' && angle > 0 && angle <= 360)) throw fail(CODES.BAD_CALL, pre + 'angle' + post, __DEV__ && 'angle is a number above 0, up to 360, not ' + show(angle));
  if (!(Number.isInteger(samples) && samples >= fewest && samples <= most)) throw fail(CODES.BAD_CALL, pre + 'samples' + post, __DEV__ &&'samples is a whole number from ' + fewest + ' to ' + most + ', not ' + show(samples));
}

// ---- focus -----------------------------------------------------------------

// The blur, in pixels, of a thing at depth z when the focal plane is at
// `plane`, in the same units (CSS translateZ pixels, or any depth scale the
// scene uses). The falloff is a soft knee, max * (1 - 1 / (1 + (d / range)^2)):
// zero on the plane, still small a little off it, and max well away from it,
// which is how a lens's circle of confusion grows. `depth`, the depth of
// field, keeps everything within that distance of the plane sharp, and d
// counts from the band's edges. `steps` quantises the result to that many
// levels, for a band of elements that share one filter.
export function focus(z, plane, opts) {
  const o = opts || {};
  const range = o.range === undefined ? 200 : o.range;
  const max = o.max === undefined ? 12 : o.max;
  const steps = o.steps, field = o.depth === undefined ? 0 : o.depth;
  if (typeof z !== 'number' || !Number.isFinite(z) || typeof plane !== 'number' || !Number.isFinite(plane)) throw fail(CODES.BAD_CALL, 'focus(z, plane)', __DEV__ && 'z and plane are numbers');
  if (!(Number.isFinite(field) && field >= 0)) throw fail(CODES.BAD_CALL, 'focus(z, plane, { depth })', __DEV__ && 'depth is a finite number, 0 or more, the distance either side of the plane that stays sharp, not ' + show(o.depth));
  if (!(typeof range === 'number' && range > 0)) throw fail(CODES.BAD_CALL, 'focus(z, plane, { range })', __DEV__ && 'range is a number above 0, not ' + show(o.range));
  if (!(Number.isFinite(max) && max >= 0)) throw fail(CODES.BAD_CALL, 'focus(z, plane, { max })', __DEV__ && 'max is a finite number, 0 or more, not ' + show(o.max));
  if (steps !== undefined && !(Number.isInteger(steps) && steps >= 2)) throw fail(CODES.BAD_CALL, 'focus(z, plane, { steps })', __DEV__ &&'steps is a whole number, 2 or more, not ' + show(steps));
  // The depth of field: within `field` of the plane is sharp, and the knee
  // starts at the band's edges.
  const d = Math.max(0, Math.abs(z - plane) - field) / range;
  let blur = max * (1 - 1 / (1 + d * d));
  // At max 0 every level is 0, and the step would be 0.
  if (steps && max > 0) { const step = max / (steps - 1); blur = Math.round(blur / step) * step; }
  return Math.round(blur * 100) / 100;
}

// ---- random and noise ----------------------------------------------------------

// A 32-bit seed from a number or a string (xmur3 for strings). `who` is the
// where of the KN-100 message for a seed that is neither, as in
// random(seed) or shake(t, profile, { seed }).
export function seedOf(seed, who) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.floor(seed) >>> 0;
  if (typeof seed === 'string') {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  throw fail(CODES.BAD_CALL, who, __DEV__ &&'seed is a number or a string, not ' + show(seed));
}

// mulberry32 at a state: the same seed gives the same sequence everywhere.
// Returns [the number in 0..1, the next state].
export function next(a) {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

// A generator: each call returns the next number in 0..1 for that seed.
export function random(seed) {
  let a = seedOf(seed, 'random(seed)');
  return () => { const r = next(a); a = r[1]; return r[0]; };
}

// Gradient noise along one axis: 0 at whole numbers, smooth between, the
// same curve for the same seed. Call with x in seconds for a drift, or with
// an entity's index plus time for many independent drifts.
export function noise(x, seed) {
  const s = seedOf(seed, 'noise(…, seed)');
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0;
  const i = Math.floor(x);
  const f = x - i;
  const g = (n) => next((Math.imul(n, 374761393) ^ s) >>> 0)[0] * 2 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  const a = g(i) * f, b = g(i + 1) * (f - 1);
  return (a + (b - a) * u) * 2 + 0;   // + 0: never -0 at a whole number
}

// Gradient noise in 2-D and 3-D, built as noise() is: at each corner of the
// lattice cell, a gradient whose components (each in -1..1) come one after
// another from mulberry32 at a hash of the corner and the seed, dotted with
// the offset from that corner; the corners blended with the quintic fade.
// Each axis adds at most 0.5 to the size of the sum, so it is scaled by
// 2 / dimensions into -1..1. The hash takes in the number of dimensions too:
// without it, at y = 0 a corner's hash and first gradient component would be
// noise()'s, and noise2(x, 0) would be noise(x) / 2.
const AXES = [374761393, 668265263, 2246822519];
function noiseN(p, seed, who) {
  const s = seedOf(seed, who);
  if (!p.every(Number.isFinite)) return 0;
  const n = p.length, i = p.map(Math.floor), f = p.map((v, d) => v - i[d]);
  const u = f.map((v) => v * v * v * (v * (v * 6 - 15) + 10));
  let sum = 0;
  for (let c = 0; c < 1 << n; c++) {
    let h = s ^ Math.imul(n, 2654435761), w = 1, dot = 0;
    for (let d = 0; d < n; d++) h ^= Math.imul(i[d] + ((c >> d) & 1), AXES[d]);
    let r = [0, h >>> 0];
    for (let d = 0; d < n; d++) {
      const b = (c >> d) & 1;
      r = next(r[1]);
      dot += (r[0] * 2 - 1) * (f[d] - b);
      w *= b ? u[d] : 1 - u[d];
    }
    sum += w * dot;
  }
  return (sum * 2) / n + 0;   // + 0: never -0 on the lattice
}

export const noise2 = (x, y, seed) => noiseN([x, y], seed, 'noise2(…, seed)');
export const noise3 = (x, y, z, seed) => noiseN([x, y, z], seed, 'noise3(…, seed)');

// ---- camera, depth and shake --------------------------------------------------

// A camera's keys at rest, and the transform keys an author may reach for
// in place of a turn.
const CAMERA = { x: 0, y: 0, z: 0, pan: 0, tilt: 0, roll: 0, zoom: 1 };
const INSTEAD = { rotateY: 'pan', rotateX: 'tilt', rotate: 'roll' };

// options.perspective, checked: the eye's distance from the z = 0 plane, px.
// `who` is the KN-100 where, as in depth(z, { perspective }). 0.0001 at
// least, as zoom is, so the transform never writes perspective(0px).
function eyeOf(o, who) {
  const p = o.perspective === undefined ? 1000 : o.perspective;
  if (!(typeof p === 'number' && p >= 1e-4 && p < Infinity)) throw fail(CODES.BAD_CALL, who, __DEV__ && 'perspective is a finite number, 0.0001 or more, not ' + show(p));
  return p;
}

// The style for the world, the element that holds a scene's layers. Read
// right to left, the transform moves the scene by -x, -y and +z, along the
// scene's own axes, turns it about the eye, which sits P in front of the
// z = 0 plane at the world's centre once moved, scales it by the lens and
// projects it. Each key is a number or a track of numbers; a key left out or
// undefined is at rest, and so is every key when tracks is not an object.
// options.shake, one shake() result or an array of them, adds to x, y and
// roll. A message names a key's track as camera(t, tracks).pan.
const CAMERA_TRACKS = 'camera(t, tracks)';
export function camera(t, tracks, opts) {
  checkTime(t, 'camera');
  const o = opts || {};
  const P = eyeOf(o, 'camera(t, tracks, { perspective })');
  const c = Object.assign({}, CAMERA);
  for (const k of tracks && typeof tracks == 'object' ? Object.keys(tracks) : []) {
    if (!own(CAMERA, k)) throw fail(CODES.BAD_CALL, 'camera(t, { ' + k + ' })', __DEV__ && "no key '" + k + "'" + (own(INSTEAD, k) ? ' (use ' + INSTEAD[k] + ')' : '') + '; the keys are ' + Object.keys(CAMERA).join(', '));
    const v = tracks[k];
    if (v === undefined) continue;
    if (isTrack(v)) {
      if (v.unit !== undefined) throw fail(CODES.BAD_TRACK, place(CAMERA_TRACKS, k) + '.unit', __DEV__ && 'a camera track has no unit; x, y and z are px, pan, tilt and roll degrees, zoom a factor');
      checkTrack(v, CAMERA_TRACKS, k);
      if (__DEV__) lint(v, null, place(CAMERA_TRACKS, k));
    }
    // A text or colour track interpolates to a string, which fails here too.
    c[k] = isTrack(v) ? interpolateAt(t, v.at, v.to, v, CAMERA_TRACKS, k) : v;
    if (!Number.isFinite(c[k])) throw fail(CODES.BAD_TRACK, place(CAMERA_TRACKS, k), __DEV__ && 'a number or a track of numbers, not ' + show(v));
  }
  // 0.0001 at least, the smallest the transform writes (fmt) that is not 0.
  if (!(c.zoom >= 1e-4)) throw fail(CODES.BAD_CALL, 'camera(t, tracks).zoom < 0.0001', __DEV__ && 'zoom is 0.0001 or more, not ' + c.zoom + ' at t = ' + t);
  const sh = o.shake;
  if (sh != null) {
    for (const s of Array.isArray(sh) ? sh : [sh]) {
      if (!(s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.roll))) throw fail(CODES.BAD_CALL, 'camera(t, tracks, { shake })', __DEV__ &&'shake is a shake() result or an array of them, not ' + show(s));
      c.x += s.x; c.y += s.y; c.roll += s.roll;
    }
  }
  return {
    transform: 'perspective(' + fmt(P) + 'px) scale(' + fmt(c.zoom) + ') translateZ(' + fmt(P) + 'px) rotateZ(' + fmt(-c.roll) + 'deg) rotateX(' + fmt(c.tilt)
      + 'deg) rotateY(' + fmt(c.pan) + 'deg) translateZ(' + fmt(-P) + 'px) translate3d(' + fmt(-c.x) + 'px, ' + fmt(-c.y) + 'px, ' + fmt(c.z) + 'px)',
    transformStyle: 'preserve-3d',
    transformOrigin: '50% 50%',
  };
}

// The style that puts a layer at depth z (negative is farther) inside a
// camera's world, scaled by (P - z) / P so that a full-frame layer fills the
// frame while the camera is at rest. fill: false leaves the scale out.
export function depth(z, opts) {
  const o = opts || {};
  const P = eyeOf(o, 'depth(z, { perspective })');
  if (!(typeof z === 'number' && z < P && z > -Infinity)) throw fail(CODES.BAD_CALL, 'depth(z)', __DEV__ && 'z is a finite number below the perspective, ' + P + ', not ' + show(z));
  return { transform: 'translateZ(' + fmt(z) + 'px)' + (o.fill === false ? '' : ' scale(' + fmt((P - z) / P) + ')') };
}

// Each profile is [hz, x px, y px, roll deg, octaves, decay s], tuned by eye
// for a 1280 x 720 stage. A profile with a decay is an impact: still before
// t = 0, then fading as e^(-t / decay).
const SHAKES = { handheld: [0.7, 16, 11, 1.1, 4], rumble: [7, 5.4, 7.2, 0.36, 2], impact: [11, 61, 47, 4.3, 2, 0.32] };

// Octaves of noise, each at 2.03 times the frequency and half the weight of
// the one before, offset so that they share no zeros, in -1..1. The
// frequency is multiplied up rather than taken from Math.pow, so it is the
// same number on every engine.
function fbm(u, seed, octaves) {
  let sum = 0, norm = 0, w = 1, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += w * noise(u * f + 17.37 * i, seed + i);
    norm += w;
    w /= 2;
    f *= 2.03;
  }
  return sum / norm;
}

// Camera offsets at t seconds, { x, y, roll } in px and degrees, from three
// fbm curves of one seed (a string seed is hashed first, so seed + i is a
// number). The same t, profile and seed give the same offsets.
export function shake(t, profile, opts) {
  checkTime(t, 'shake', 1);
  const o = opts || {};
  const p = own(SHAKES, profile) && SHAKES[profile];
  if (!p) throw fail(CODES.BAD_CALL, 'shake(…, profile)', __DEV__ && "profile is 'handheld', 'rumble' or 'impact', not " + show(profile));
  const amount = o.amount === undefined ? 1 : o.amount;
  const speed = o.speed === undefined ? 1 : o.speed;
  if (!(Number.isFinite(amount) && amount >= 0)) throw fail(CODES.BAD_CALL, 'shake(t, profile, { amount })', __DEV__ && 'amount is a finite number, 0 or more, not ' + show(amount));
  if (!(Number.isFinite(speed) && speed > 0)) throw fail(CODES.BAD_CALL, 'shake(t, profile, { speed })', __DEV__ && 'speed is a finite number above 0, not ' + show(speed));
  const s = seedOf(o.seed === undefined ? 1 : o.seed, 'shake(t, profile, { seed })');
  if (p[5] && t < 0) return { x: 0, y: 0, roll: 0 };
  const a = p[5] ? amount * Math.exp(-t / p[5]) : amount;
  const u = t * p[0] * speed;
  // noise() is 0 at every whole number, so the axes' offsets have fractional
  // parts that differ, or x, y and roll would calm together once a cycle.
  // + 0: never -0, at amount 0 or a zero of the noise.
  return { x: fbm(u, s, p[4]) * p[1] * a + 0, y: fbm(u + 50.43, s + 101, p[4]) * p[2] * a + 0, roll: fbm(u + 90.71, s + 202, p[4]) * p[3] * a + 0 };
}

// A value that wanders between -amplitude and amplitude, as After Effects'
// wiggle does. Every 1 / frequency seconds it passes through a value the seed
// draws in that range, and between them it follows a monotone cubic
// (Fritsch and Butland's tangents: 0 where the values turn, else the
// harmonic mean of the slopes either side), so it is smooth, never goes past
// the values either side, and turns only at its peaks. Value noise, since
// noise() is gradient noise and 0 at every whole number: with t stepped by
// posterize() at the frequency, each step lands on a value of its own, the
// jitter of pieces moved by hand between exposures.
export function wiggle(t, opts) {
  checkTime(t, 'wiggle', 1);
  const o = opts || {};
  const frequency = o.frequency === undefined ? 1 : o.frequency;
  const amplitude = o.amplitude === undefined ? 1 : o.amplitude;
  if (!(Number.isFinite(frequency) && frequency > 0)) throw fail(CODES.BAD_CALL, 'wiggle(t, { frequency })', __DEV__ && 'frequency is wiggles a second, a finite number above 0, not ' + show(frequency));
  if (!(Number.isFinite(amplitude) && amplitude >= 0)) throw fail(CODES.BAD_CALL, 'wiggle(t, { amplitude })', __DEV__ && 'amplitude is a finite number, 0 or more, not ' + show(amplitude));
  const s = seedOf(o.seed === undefined ? 1 : o.seed, 'wiggle(t, { seed })');
  // The 1e-9, as in posterize(): a product a hair under a whole number lands on it.
  const x = t * frequency + 1e-9, i = Math.floor(x), f = x - i;
  const v = (n) => next((Math.imul(n, 668265263) ^ s) >>> 0)[0] * 2 - 1;
  const p0 = v(i - 1), p1 = v(i), p2 = v(i + 1), p3 = v(i + 2);
  const m = (a, b) => (a * b > 0 ? 2 * a * b / (a + b) : 0);
  const m1 = m(p1 - p0, p2 - p1), m2 = m(p2 - p1, p3 - p2), f2 = f * f, f3 = f2 * f;
  // + 0: never -0.
  return ((2 * f3 - 3 * f2 + 1) * p1 + (f3 - 2 * f2 + f) * m1 + (3 * f2 - 2 * f3) * p2 + (f3 - f2) * m2) * amplitude + 0;
}
