/**
 * SVG paths as keyframe values. Nothing here touches the DOM: each function
 * returns path data, so a path is a value a track or a computed gives.
 *
 *   readPath(d)                  path data read by the SVG 2 grammar; a text
 *                                track reads path data through it (motion.js)
 *   matchPaths(paths, options)   paths with any commands made into absolute
 *                                cubics with the same commands and count, so
 *                                a text track moves from one to the next
 *   shape(kind, options)         a polygon, star, sector or arrow as path data
 *   trimPath(d, from, to, opts)  the stretch of a path between two fractions
 *                                of it, or of a band between two edges
 *   pathLength(d)                a path's length
 *
 * Written from SVG 2 (the path data grammar, and the implementation notes for
 * elliptical arcs), CSS Motion Path and CSS Shapes.
 */

import { CODES, fail, show } from './diagnostics.js';

const PI = Math.PI;

// A number with at most four decimals, no trailing zeros and no -0, as a
// text track writes its numbers. From 1e15 up a double has no decimals to
// round, and v * 1e4 would overflow to Infinity above 1.8e304, so v is
// written as it is (1e+305 is a number in path data and in CSS).
export const fmt = (v) => String(Math.abs(v) >= 1e15 ? v : Math.round(v * 1e4) / 1e4);

// ---- the grammar --------------------------------------------------------------

// The arguments each command takes. The 4th and 5th of an arc are flags.
const ARGS = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;
const WSP = /[ \t\n\f\r]*/y;
const isCommand = (ch) => ARGS[ch.toLowerCase()] !== undefined;

// Path data as a list of commands, each [letter, written, ...arguments], or
// the index of the first character the grammar rejects. `written` is false
// for a set of arguments that repeats the command before it without its
// letter, and a moveto's repeats are linetos. A number ends where the next
// cannot continue it, so -30 after 190 and .5 after 0.5 are numbers of their
// own; a flag is the one character 0 or 1.
export function readPath(d) {
  const out = [];
  let i = 0, cmd = '';
  const skip = () => { WSP.lastIndex = i; WSP.test(d); i = WSP.lastIndex; };
  skip();
  while (i < d.length) {
    const at = i, written = isCommand(d[i]);
    let c = cmd;
    if (written) { c = cmd = d[i++]; skip(); }
    else if (!cmd || cmd === 'z' || cmd === 'Z') return at;
    else if (cmd === 'M') c = 'L';
    else if (cmd === 'm') c = 'l';
    if (!out.length && c !== 'M' && c !== 'm') return at;
    const n = ARGS[c.toLowerCase()], e = [c, written];
    for (let j = 0; j < n; j++) {
      if (j) { skip(); if (d[i] === ',') { i++; skip(); } }
      if (n === 7 && (j === 3 || j === 4)) {
        if (d[i] !== '0' && d[i] !== '1') return i;
        e.push(+d[i++]);
      } else {
        NUM.lastIndex = i;
        const m = NUM.exec(d);
        if (!m) return i;
        e.push(+m[0]);
        i = NUM.lastIndex;
      }
    }
    out.push(e);
    skip();
    // A comma between two sets of arguments: another set follows.
    if (n && d[i] === ',') { i++; skip(); if (i >= d.length || isCommand(d[i])) return i; }
  }
  return out;
}

// ---- absolute cubics ------------------------------------------------------------

// The commands as subpaths of absolute cubic Béziers, { s: [x, y], c:
// [[x1, y1, x2, y2, x, y], ...], closed }: a line with its control points at
// thirds, a quadratic raised, an arc split into pieces of 90 degrees at most,
// and a Z that ends away from the start closed with a line. Also what
// fields.js measures a path along and inside.
export function cubics(cmds) {
  const subs = [];
  let x = 0, y = 0, sx = 0, sy = 0, cur = null, lc = null, lq = null;
  const move = (nx, ny) => { cur = { s: [nx, ny], c: [], closed: false }; subs.push(cur); x = sx = nx; y = sy = ny; };
  const cubic = (...p) => { if (cur.closed) move(x, y); cur.c.push(p); x = p[4]; y = p[5]; };
  const line = (nx, ny) => cubic(x + (nx - x) / 3, y + (ny - y) / 3, x + (2 * (nx - x)) / 3, y + (2 * (ny - y)) / 3, nx, ny);
  const quad = (qx, qy, nx, ny) => cubic(x + (2 * (qx - x)) / 3, y + (2 * (qy - y)) / 3, nx + (2 * (qx - nx)) / 3, ny + (2 * (qy - ny)) / 3, nx, ny);
  // SVG 2's implementation notes: the end points to a centre and two angles,
  // then a cubic for each piece of the sweep.
  const arc = (rx, ry, phi, fa, fs, nx, ny) => {
    if (nx === x && ny === y) return;            // no arc between a point and itself
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) return line(nx, ny);         // a zero radius is a straight line
    const co = Math.cos((phi * PI) / 180), si = Math.sin((phi * PI) / 180);
    const dx = (x - nx) / 2, dy = (y - ny) / 2, x1 = co * dx + si * dy, y1 = co * dy - si * dx;
    const l = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (l > 1) { rx *= Math.sqrt(l); ry *= Math.sqrt(l); }   // radii too small to reach: scaled up
    const r2 = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const f = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, (rx * rx * ry * ry - r2) / r2));
    const cx1 = (f * rx * y1) / ry, cy1 = (-f * ry * x1) / rx;
    const cx = co * cx1 - si * cy1 + (x + nx) / 2, cy = si * cx1 + co * cy1 + (y + ny) / 2;
    const ux = (x1 - cx1) / rx, uy = (y1 - cy1) / ry, vx = (-x1 - cx1) / rx, vy = (-y1 - cy1) / ry;
    const t1 = Math.atan2(uy, ux);
    let dt = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    if (!fs && dt > 0) dt -= 2 * PI; else if (fs && dt < 0) dt += 2 * PI;
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (PI / 2) - 1e-9)), st = dt / n, k = (4 / 3) * Math.tan(st / 4);
    const on = (u, v) => [cx + co * rx * u - si * ry * v, cy + si * rx * u + co * ry * v];
    for (let j = 0; j < n; j++) {
      const a = t1 + j * st, b = a + st, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const p1 = on(ca - k * sa, sa + k * ca), p2 = on(cb + k * sb, sb - k * cb), e = j < n - 1 ? on(cb, sb) : [nx, ny];
      cubic(p1[0], p1[1], p2[0], p2[1], e[0], e[1]);
    }
  };
  for (const [c, , ...a] of cmds) {
    const C = c.toUpperCase(), ox = c === C ? 0 : x, oy = c === C ? 0 : y;
    const X = (j) => a[j] + ox, Y = (j) => a[j] + oy;
    let q = null, k = null;
    if (C === 'M') move(X(0), Y(1));
    else if (C === 'L') line(X(0), Y(1));
    else if (C === 'H') line(X(0), y);
    else if (C === 'V') line(x, Y(0));
    else if (C === 'C') { k = [X(2), Y(3)]; cubic(X(0), Y(1), k[0], k[1], X(4), Y(5)); }
    else if (C === 'S') { k = [X(0), Y(1)]; cubic(lc ? 2 * x - lc[0] : x, lc ? 2 * y - lc[1] : y, k[0], k[1], X(2), Y(3)); }
    else if (C === 'Q') { q = [X(0), Y(1)]; quad(q[0], q[1], X(2), Y(3)); }
    else if (C === 'T') { q = lq ? [2 * x - lq[0], 2 * y - lq[1]] : [x, y]; quad(q[0], q[1], X(0), Y(1)); }
    else if (C === 'A') arc(a[0], a[1], a[2], a[3], a[4], X(5), Y(6));
    else {
      if (!cur.closed) { if (x !== sx || y !== sy) line(sx, sy); cur.closed = true; }
      x = sx; y = sy;
    }
    lc = k; lq = q;   // the control point S and T reflect, after a C or S and a Q or T
  }
  return subs;
}

const start = (s, k) => (k ? s.c[k - 1].slice(4) : s.s);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
// The length of a cubic's control polygon, which is at least its own.
const hull = (p, c) => Math.hypot(c[0] - p[0], c[1] - p[1]) + Math.hypot(c[2] - c[0], c[3] - c[1]) + Math.hypot(c[4] - c[2], c[5] - c[3]);

// The cubic c from p cut at t, by de Casteljau: [left, right].
function cut(p, c, t) {
  const p1 = c.slice(0, 2), p2 = c.slice(2, 4), p3 = c.slice(4);
  const a = lerp(p, p1, t), b = lerp(p1, p2, t), e = lerp(p2, p3, t), f = lerp(a, b, t), g = lerp(b, e, t);
  return [[...a, ...f, ...lerp(f, g, t)], [...g, ...e, ...p3]];
}

// A subpath given n segments. Each cut goes to the segment whose pieces are
// longest, and a segment with k pieces is cut into k equal spans of its
// parameter, so a triangle at 24 has eight even pieces a side and an octagon
// three. A subpath that draws nothing gets one segment of no length.
function refine(s, n) {
  if (!s.c.length) s.c.push([...s.s, ...s.s, ...s.s]);
  const len = s.c.map((c, k) => hull(start(s, k), c)), parts = len.map(() => 1), out = [];
  for (let m = s.c.length; m < n; m++) {
    let b = 0;
    len.forEach((l, k) => { if (l / parts[k] > len[b] / parts[b]) b = k; });
    parts[b]++;
  }
  s.c.forEach((c, k) => {
    let p = start(s, k);
    for (let j = parts[k]; j > 1; j--) { const [l, r] = cut(p, c, 1 / j); out.push(l); p = l.slice(4); c = r; }
    out.push(c);
  });
  s.c = out;
}

// Twice the signed area of the polygon through a subpath's end points; its
// sign is the direction the subpath runs.
const area = (s) => s.c.reduce((sum, c, k) => { const p = start(s, k); return sum + p[0] * c[5] - c[4] * p[1]; }, 0);

// The closed subpath b turned to run the way a runs, then started at its
// segment whose start is nearest a's start.
function align(a, b) {
  if (!a.closed || !b.closed) return;
  if (area(a) * area(b) < 0) {
    const from = b.c.map((c, k) => start(b, k));
    b.s = b.c[b.c.length - 1].slice(4);
    b.c = b.c.map((c, k) => [c[2], c[3], c[0], c[1], ...from[k]]).reverse();
  }
  let best = 0, near = Infinity;
  b.c.forEach((c, k) => {
    const p = start(b, k), d = (p[0] - a.s[0]) ** 2 + (p[1] - a.s[1]) ** 2;
    if (d < near) { near = d; best = k; }
  });
  if (best) { b.s = start(b, best); b.c = b.c.slice(best).concat(b.c.slice(0, best)); }
}

const write = (subs) => subs.map((s) => 'M ' + s.s.map(fmt).join(' ') + s.c.map((c) => ' C ' + c.map(fmt).join(' ')).join('') + (s.z ? ' Z' : '')).join(' ');
const subpaths = (n) => n + (n === 1 ? ' subpath' : ' subpaths');

// Two or more paths, each a d string or a path("…") value, returned in the
// same forms as absolute cubics with the same commands, ready to be a text
// track's `to`. Subpaths match in order, each given the most segments any
// of the paths has there and at least `segments` (default 8). With `align`
// (the default) each closed subpath after the first path's is turned to run
// the first's way and started nearest the first's start. A Z is written
// where every path closes the subpath.
export function matchPaths(paths, options) {
  const o = options || {}, n = o.segments === undefined ? 8 : o.segments;
  if (!Array.isArray(paths) || paths.length < 2) throw fail(CODES.BAD_CALL, 'matchPaths(paths)', __DEV__ && 'paths is an array of two or more paths, not ' + show(paths));
  if (!(Number.isInteger(n) && n >= 1)) throw fail(CODES.BAD_CALL, 'matchPaths(paths, { segments })', __DEV__ && 'segments is a whole number, 1 or more, not ' + show(n));
  const forms = [];
  // A path that is not path data, as a string, an empty one or one the
  // grammar rejects, is matchPaths(paths[i]); two that cannot be matched are
  // matchPaths(paths[0], paths[i]).
  const all = paths.map((p, i) => {
    if (typeof p !== 'string') throw fail(CODES.BAD_CALL, 'matchPaths(paths[' + i + '])', __DEV__ && 'paths[' + i + '] is a string of path data or a path("…") value, not ' + show(p));
    const m = /^(\s*path\(\s*(["']))([^"']*)\2\s*\)\s*$/i.exec(p), d = m ? m[3] : p, off = m ? m[1].length : 0;
    forms.push(m ? (s) => m[1] + s + m[2] + ')' : (s) => s);
    const cmds = readPath(d);
    if (typeof cmds === 'number') {
      throw fail(CODES.BAD_CALL, 'matchPaths(paths[' + i + '])', __DEV__ && 'paths[' + i + '] is not SVG path data; ' + (cmds < d.length
        ? 'the path grammar rejects ' + show(d[cmds]) + ' at index ' + (cmds + off)
        : 'it ends at index ' + (cmds + off) + ' in the middle of a command'));
    }
    if (!cmds.length) throw fail(CODES.BAD_CALL, 'matchPaths(paths[' + i + '])', __DEV__ && 'paths[' + i + '] is empty');
    return cubics(cmds);
  });
  const count = all[0].length;
  all.forEach((p, i) => {
    if (p.length !== count) throw fail(CODES.BAD_CALL, 'matchPaths(paths[0], paths[' + i + '])', __DEV__ &&'paths[0] has ' + subpaths(count) + ' and paths[' + i + '] has ' + p.length + '; paths are matched subpath by subpath, in order, so each needs the same number');
  });
  for (let k = 0; k < count; k++) {
    const subs = all.map((p) => p[k]), most = Math.max(n, ...subs.map((s) => s.c.length)), z = subs.every((s) => s.closed);
    for (const s of subs) { refine(s, most); s.z = z; }
    if (o.align !== false) for (const s of subs.slice(1)) align(subs[0], s);
  }
  return all.map((p, i) => forms[i](write(p)));
}

// ---- trimPath ---------------------------------------------------------------------

const TRIM_STEPS = 32;   // samples on each cubic that is measured for trimPath()
const BY = ['length', 'segment'];
const TRIM = 'trimPath(d)';
const onCurve = (p, c, t) => {
  const m = 1 - t, a = m * m * m, b = 3 * m * m * t, e = 3 * m * t * t, f = t * t * t;
  return [a * p[0] + b * c[0] + e * c[2] + f * c[4], a * p[1] + b * c[1] + e * c[3] + f * c[5]];
};

// Path data as its cubics, each with its start, its subpath and the length so
// far at TRIM_STEPS + 1 even steps of its parameter. Kept for its d, so a
// computed that trims the same path on every frame measures it once.
// The 64 paths used last are kept, the least recently used dropped first, so
// a page that cuts many paths a frame (a flight per shot) measures each once.
// A path's lengths are worked out only when a cut by length or pathLength()
// needs them; a cut by segment reads the cubics alone.
const KEPT_PATHS = 64;
const measuredPaths = new Map();
function measured(d, where, lengths) {
  let m = measuredPaths.get(d);
  if (m) { measuredPaths.delete(d); measuredPaths.set(d, m); }
  else {
    const cmds = readPath(d);
    if (typeof cmds === 'number') throw fail(CODES.BAD_CALL, where, __DEV__ && 'the path grammar stops at index ' + cmds + ' of ' + show(d));
    const subs = cubics(cmds), segs = [];
    subs.forEach((s, si) => s.c.forEach((c, k) => segs.push({ si, p: start(s, k), c, acc: null })));
    if (!segs.length) throw fail(CODES.BAD_CALL, where, __DEV__ && 'd is SVG path data that draws something, not ' + show(d));
    m = { subs, segs, total: -1 };
    if (measuredPaths.size >= KEPT_PATHS) measuredPaths.delete(measuredPaths.keys().next().value);
    measuredPaths.set(d, m);
  }
  if (lengths && m.total < 0) {
    let total = 0;
    for (const g of m.segs) {
      const acc = [total];
      let q = g.p;
      for (let j = 1; j <= TRIM_STEPS; j++) { const r = onCurve(g.p, g.c, j / TRIM_STEPS); total += Math.hypot(r[0] - q[0], r[1] - q[1]); acc.push(total); q = r; }
      g.acc = acc;
    }
    m.total = total;
  }
  return m;
}

// pathLength(d): the length of path data or a path("…") value, in its own
// units, from the same measure trimPath() cuts by length with.
const PATH_VALUE = /^(\s*path\(\s*(["']))([^"']*)\2\s*\)\s*$/i;
export function pathLength(d) {
  if (typeof d !== 'string') throw fail(CODES.BAD_CALL, 'pathLength(d)', __DEV__ && 'd is SVG path data or a path("…") value, not ' + show(d));
  const w = PATH_VALUE.exec(d);
  return measured(w ? w[3] : d, 'pathLength(d)', true).total;
}

// A measured cubic's parameter at length s along the whole path, between the
// two samples either side of it.
function lengthParam(g, s) {
  const acc = g.acc;
  let j = 0;
  while (j < TRIM_STEPS - 1 && acc[j + 1] < s) j++;
  return (j + (acc[j + 1] > acc[j] ? (s - acc[j]) / (acc[j + 1] - acc[j]) : 0)) / TRIM_STEPS;
}

// n points evenly along path data, [{ i, x, y, heading, u }] as distribute()
// gives them: u from 0 at the start to 1 at the end, by length or with each
// segment an equal share, and heading the direction of travel in degrees,
// 0 right and 90 down. For trails('dots').
export function pointsAlong(d, n, bySegment, where) {
  const m = measured(d, where, !bySegment), { segs, total } = m, N = segs.length, out = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    let g, t;
    if (bySegment || !total) { const k = Math.min(N - 1, Math.floor(u * N)); g = segs[k]; t = u * N - k; }
    else { const s = u * total; g = segs.find((x) => x.acc[TRIM_STEPS] >= s) || segs[N - 1]; t = lengthParam(g, s); }
    const [x, y] = onCurve(g.p, g.c, t), p = g.p, c = g.c, w = 1 - t;
    const dx = 3 * w * w * (c[0] - p[0]) + 6 * w * t * (c[2] - c[0]) + 3 * t * t * (c[4] - c[2]);
    const dy = 3 * w * w * (c[1] - p[1]) + 6 * w * t * (c[3] - c[1]) + 3 * t * t * (c[5] - c[3]);
    out.push({ i, x, y, heading: (((Math.atan2(dy, dx) * 180) / PI) % 360 + 360) % 360, u });
  }
  return out;
}

// The cubic c from p between its parameters ta and tb.
function between(p, c, ta, tb) {
  if (tb < 1) c = cut(p, c, tb)[0];
  if (ta > 0) { const [l, r] = cut(p, c, ta / tb); p = l.slice(4); c = r; }
  return [p, c];
}

// The stretch of a measured path from fraction a to b (0 <= a < b <= 1) as
// subpaths { s, c, z }: by length, a fraction of the whole length, its
// parameter found between two samples; by segment, each cubic an equal share
// and the fraction inside it its own parameter. A subpath taken whole keeps
// its Z.
function stretch(m, a, b, bySegment) {
  const { segs, total } = m, n = segs.length, out = [];
  const seg = bySegment || !total;
  let cur = null, si = -1, whole = 0;
  segs.forEach((g, i) => {
    const lo = seg ? i / n : g.acc[0] / total, hi = seg ? (i + 1) / n : g.acc[TRIM_STEPS] / total;
    const from = Math.max(a, lo), to = Math.min(b, hi);
    if (!(to > from)) return;
    const param = (u) => (seg ? (u - lo) / (hi - lo) : lengthParam(g, u * total));
    const [p, c] = between(g.p, g.c, from > lo ? param(from) : 0, to < hi ? param(to) : 1);
    if (g.si !== si) { cur = { s: p, c: [], z: false }; out.push(cur); si = g.si; whole = 0; }
    cur.c.push(c);
    if (from <= lo && to >= hi && ++whole === m.subs[si].c.length) cur.z = m.subs[si].closed;
  });
  return out;
}

const writeSub = (s) => 'M ' + s.s.map(fmt).join(' ') + s.c.map((c) => ' C ' + c.map(fmt).join(' ')).join('') + (s.z ? ' Z' : '');

// A subpath run backwards: its end its start, each cubic's control points
// swapped.
function reversed(s) {
  const from = s.c.map((c, k) => (k ? s.c[k - 1].slice(4) : s.s));
  return { s: s.c[s.c.length - 1].slice(4), c: s.c.map((c, k) => [c[2], c[3], c[0], c[1], ...from[k]]).reverse(), z: false };
}

// trimPath(d, from, to, { by }): the stretch of a path from fraction `from`
// to fraction `to` of it (each clamped to 0..1), as absolute cubics, with a
// move wherever it crosses into another subpath; '' when from is at or past
// to. By length (the default) a fraction is of the whole length; by segment
// each segment is an equal share, so a path sampled evenly in time is cut at
// a time. d is path data or a path("…") value, returned in the same form.
// [top, bottom], two edges of one subpath each, gives the band between them
// closed: the top's stretch, a line to the bottom's, the bottom's run back,
// and Z. The bottom is turned round first when it starts nearer the top's
// end than the top's start, so either direction draws the same band.
export function trimPath(d, from, to, options) {
  const o = options || {}, by = o.by === undefined ? 'length' : o.by;
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw fail(CODES.BAD_CALL, 'trimPath(d, from, to)', __DEV__ && 'from and to are finite numbers, fractions of the path from 0 to 1, not ' + show(from) + ', ' + show(to));
  if (!BY.includes(by)) throw fail(CODES.BAD_CALL, 'trimPath(d, from, to, { by })', __DEV__ && "by is 'length' or 'segment', not " + show(by));
  const a = Math.max(0, from), b = Math.min(1, to), seg = by === 'segment';
  if (Array.isArray(d)) {
    const BAND = 'trimPath([top, bottom])';
    if (d.length !== 2 || typeof d[0] !== 'string' || typeof d[1] !== 'string') throw fail(CODES.BAD_CALL, BAND, __DEV__ && 'a band is [top, bottom], two strings of path data, not ' + show(d));
    const top = measured(d[0], BAND, !seg), bottom = measured(d[1], BAND, !seg);
    if (top.subs.length !== 1 || bottom.subs.length !== 1) throw fail(CODES.BAD_CALL, BAND, __DEV__ && 'each edge of a band is one subpath; top has ' + top.subs.length + ' and bottom ' + bottom.subs.length);
    if (!(b > a)) return '';
    const t0 = top.subs[0].s, tl = top.segs[top.segs.length - 1].c.slice(4), b0 = bottom.subs[0].s;
    const turned = Math.hypot(b0[0] - tl[0], b0[1] - tl[1]) < Math.hypot(b0[0] - t0[0], b0[1] - t0[1]);
    // The bottom's run back: its own stretch when it already runs right to
    // left, from the mirrored fractions, or the stretch turned round.
    const upper = stretch(top, a, b, seg)[0];
    const back = turned ? stretch(bottom, 1 - b, 1 - a, seg)[0] : reversed(stretch(bottom, a, b, seg)[0]);
    upper.z = false;
    return writeSub(upper) + ' L ' + back.s.map(fmt).join(' ') + back.c.map((c) => ' C ' + c.map(fmt).join(' ')).join('') + ' Z';
  }
  if (typeof d !== 'string') throw fail(CODES.BAD_CALL, TRIM, __DEV__ && 'd is SVG path data, a path("…") value, or [top, bottom] for a band, not ' + show(d));
  const w = PATH_VALUE.exec(d), m = measured(w ? w[3] : d, TRIM, !seg);
  // Nothing left: '' for path data, and for a path("…") value a lone move at
  // the start, which draws nothing as a d and clips all as a clip-path where
  // '' would take the style off.
  if (!(b > a)) {
    if (!w) return '';
    const s = m.subs.length ? m.subs[0].s : [0, 0];
    return w[1] + 'M ' + fmt(s[0]) + ' ' + fmt(s[1]) + w[2] + ')';
  }
  const out = stretch(m, a, b, seg).map(writeSub).join(' ');
  return w ? w[1] + out + w[2] + ')' : out;
}

// ---- shapes -----------------------------------------------------------------------

const KINDS = ['polygon', 'star', 'sector', 'arrow'];
const COUNT = '; a count does not interpolate, so morph between two counts with wildflower.kinetic.matchPaths()';

// The point `deg` degrees clockwise from up, r from (cx, cy), as path data.
const point = (cx, cy, r, deg) => fmt(cx + r * Math.sin((deg * PI) / 180)) + ' ' + fmt(cy - r * Math.cos((deg * PI) / 180));

// Path data for a shape, every number an option, so a track can drive any of
// them. Points run clockwise from up.
//   polygon  sides, radius, cx, cy, rotate (degrees)
//   star     points, outer, inner, cx, cy, rotate
//   sector   radius, inner (a ring segment above 0), from, to (degrees), cx, cy
//   arrow    from [x, y], to [x, y], width (the shaft's), head (its length; twice that wide)
export function shape(kind, options) {
  if (!KINDS.includes(kind)) throw fail(CODES.BAD_CALL, 'shape(kind)', __DEV__ && "kind is 'polygon', 'star', 'sector' or 'arrow', not " + show(kind));
  const o = options || {};
  const bad = (k, what, more) => fail(CODES.BAD_CALL, "shape('" + kind + "', { " + k + ' })', __DEV__ && k +(o[k] === undefined ? ' is required, ' + what : ' is ' + what + ', not ' + show(o[k]) + (more || '')));
  const num = (k, def) => {
    const v = o[k] === undefined ? def : o[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw bad(k, __DEV__ && 'a finite number');
    return v;
  };
  // A size: a finite number, 0 or more (a negative radius flips a polygon
  // and a negative head draws an arrow backwards).
  const size = (k, def) => {
    const v = num(k, def);
    if (v < 0) throw bad(k, __DEV__ && '0 or more');
    return v;
  };
  const count = (k, min) => {
    const v = o[k];
    if (!Number.isInteger(v) || v < min) throw bad(k, __DEV__ && 'a whole number, ' + min + ' or more', __DEV__ && (Number.isFinite(v) && !Number.isInteger(v) ? COUNT : ''));
    return v;
  };
  const xy = (k) => {
    const v = o[k];
    if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) throw bad(k, __DEV__ && '[x, y], two finite numbers');
    return v;
  };
  if (kind === 'arrow') {
    const f = xy('from'), t = xy('to'), w = size('width') / 2, head = size('head');
    const dx = t[0] - f[0], dy = t[1] - f[1], len = Math.hypot(dx, dy);
    if (!len) return '';
    // An arrow shorter than its head is the head alone, as long as the arrow.
    const ux = dx / len, uy = dy / len, h = Math.min(head, len), b = [t[0] - ux * h, t[1] - uy * h];
    // A point s across the arrow from q: to its left, on the screen, for a negative s.
    const p = (q, s) => fmt(q[0] - uy * s) + ' ' + fmt(q[1] + ux * s);
    return 'M ' + [p(f, -w), p(b, -w), p(b, -h), p(t, 0), p(b, h), p(b, w), p(f, w)].join(' L ') + ' Z';
  }
  const cx = num('cx', 0), cy = num('cy', 0);
  if (kind !== 'sector') {
    const star = kind === 'star', n = star ? 2 * count('points', 2) : count('sides', 3);
    const r = size(star ? 'outer' : 'radius'), ri = star ? size('inner') : r, rot = num('rotate', 0), pts = [];
    for (let k = 0; k < n; k++) pts.push(point(cx, cy, k % 2 ? ri : r, rot + (k * 360) / n));
    return 'M ' + pts.join(' L ') + ' Z';
  }
  const r = size('radius'), ri = size('inner', 0), a0 = num('from', 0), a1 = num('to'), span = a1 - a0;
  if (ri >= r) throw fail(CODES.BAD_CALL, "shape('sector', { inner })", __DEV__ && 'inner is below the radius, not ' + show(ri));
  if (!span) return '';   // nothing to draw, and no line from the centre
  const arc = (rad, deg, large, sweep) => ' A ' + fmt(rad) + ' ' + fmt(rad) + ' 0 ' + large + ' ' + sweep + ' ' + point(cx, cy, rad, deg);
  if (Math.abs(span) >= 360) {
    // A whole turn is two half circles, so the outline closes; a ring's
    // inner circle runs the other way, which leaves the hole unfilled.
    const circle = (rad, sweep) => 'M ' + point(cx, cy, rad, a0) + arc(rad, a0 + 180, 1, sweep) + arc(rad, a0, 1, sweep) + ' Z';
    return circle(r, 1) + (ri > 0 ? ' ' + circle(ri, 0) : '');
  }
  // Each arc below a full turn is drawn as two halves, through its middle.
  // One arc whose end rounds onto its start, just short of 360 degrees, is
  // dropped by the renderer and the sector collapses to its radius; a half
  // never comes near its own start.
  const sweep = span > 0 ? 1 : 0, mid = a0 + span / 2;
  return ri > 0
    ? 'M ' + point(cx, cy, r, a0) + arc(r, mid, 0, sweep) + arc(r, a1, 0, sweep) + ' L ' + point(cx, cy, ri, a1) + arc(ri, mid, 0, 1 - sweep) + arc(ri, a0, 0, 1 - sweep) + ' Z'
    : 'M ' + fmt(cx) + ' ' + fmt(cy) + ' L ' + point(cx, cy, r, a0) + arc(r, mid, 0, sweep) + arc(r, a1, 0, sweep) + ' Z';
}
