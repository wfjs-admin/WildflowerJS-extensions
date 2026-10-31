/**
 * Points and fields, for many things moving as one. Nothing here touches the
 * DOM, and the same arguments give the same numbers on every machine, so a
 * computed calls them with the scene's time and every seek agrees.
 *
 *   distribute(kind, n, options)   n points, [{ i, x, y, heading, u }, ...],
 *                                  along a line, round a circle, on a grid,
 *                                  in a sunflower spiral, in a seeded even
 *                                  scatter or along SVG path data
 *   falloff(kind, point, options)  a weight from 0 to 1 for a point, from a
 *                                  field: near a centre (radial), behind a
 *                                  moving edge (linear), on a strip (band),
 *                                  on a circle (ring) or inside a path (shape)
 *
 * A point's heading is the direction of travel in degrees as rotate() takes
 * it, 0 pointing right and 90 down, which is how offset-rotate: auto turns an
 * element along a path; a spiral's points face outward. Positions on a
 * circle (its from and to) are degrees clockwise from up, as shape() takes
 * them. u runs from 0 at the first point to 1 at the last.
 *
 * The work a layout costs is kept: a scatter's search and a path's measure
 * and outline are done once for their arguments, and each call returns new
 * point objects, so a caller may change them. falloff() runs for every point
 * of every frame, so its checks put a message together only when one fails.
 */

import { CODES, fail, show } from './diagnostics.js';
import { readPath, cubics } from './paths.js';
import { easeAt, seedOf, next } from './motion.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const GOLDEN = 180 * (3 - Math.sqrt(5));    // the golden angle, about 137.5 degrees
const DISTRIBUTIONS = ['line', 'circle', 'grid', 'spiral', 'scatter', 'path'];
const FIELDS = ['radial', 'linear', 'band', 'ring', 'shape'];
const CANDIDATES = 16;                       // a scatter's tries for each point
const STEPS = 64;                            // samples on each cubic of a path that is measured
const EDGE_STEPS = 24;                       // and of one that is a shape's outline

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const pair = (v) => Array.isArray(v) && v.length === 2 && num(v[0]) && num(v[1]);
const turn = (a) => ((a % 360) + 360) % 360;
const heading = (dx, dy) => turn(Math.atan2(dy, dx) * DEG);
const keep = (map, key, value) => { if (map.size > 31) map.clear(); map.set(key, value); return value; };

// KN-100 unless ok, with the option's key in the where, or none for n or
// the point.
function needD(ok, kind, key, what, v) {
  if (!ok) throw fail(CODES.BAD_CALL, "distribute('" + kind + "', n" + (key ? ', { ' + key + ' })' : ')'), __DEV__ && what + ', not ' + show(v));
}
function needF(ok, kind, key, what, v) {
  if (!ok) throw fail(CODES.BAD_CALL, "falloff('" + kind + "', point" + (key ? ', { ' + key + ' })' : ')'), __DEV__ && what + ', not ' + show(v));
}

// A cubic from p at t: its point and its derivative.
function onCubic(p, c, t) {
  const m = 1 - t, a = m * m * m, b = 3 * m * m * t, e = 3 * m * t * t, f = t * t * t;
  return [
    a * p[0] + b * c[0] + e * c[2] + f * c[4],
    a * p[1] + b * c[1] + e * c[3] + f * c[5],
    3 * m * m * (c[0] - p[0]) + 6 * m * t * (c[2] - c[0]) + 3 * t * t * (c[4] - c[2]),
    3 * m * m * (c[1] - p[1]) + 6 * m * t * (c[3] - c[1]) + 3 * t * t * (c[5] - c[3]),
  ];
}

// Path data as subpaths of absolute cubics, or KN-100 from need.
function subpathsOf(d, need, kind) {
  need(typeof d === 'string', kind, 'd', __DEV__ && 'd is SVG path data, such as "M0 0 H100"', d);
  const cmds = readPath(d);
  need(typeof cmds !== 'number', kind, 'd', __DEV__ && 'd is SVG path data, and the grammar stops at character ' + cmds + ' of it', d);
  const subs = cubics(cmds);
  need(subs.length > 0, kind, 'd', __DEV__ && 'd is SVG path data that draws something', d);
  return subs;
}

// ---- distribute() --------------------------------------------------------------------

// A path measured: samples along it with the length so far, each with its
// cubic and t, so a point at a length is found on the curve itself.
const measured = new Map();
function measure(d) {
  const kept = measured.get(d);
  if (kept) return kept;
  const subs = subpathsOf(d, needD, 'path');
  const pieces = [], xs = [], ys = [], acc = [], ci = [], ts = [];
  let total = 0, closed = true;
  for (const s of subs) {
    if (!s.closed) closed = false;
    let p = s.s;
    if (!s.c.length) { pieces.push([p, [...p, ...p, ...p]]); xs.push(p[0]); ys.push(p[1]); acc.push(total); ci.push(pieces.length - 1); ts.push(0); continue; }
    s.c.forEach((c, k) => {
      pieces.push([p, c]);
      const id = pieces.length - 1;
      for (let j = k ? 1 : 0; j <= STEPS; j++) {
        const t = j / STEPS, q = onCubic(p, c, t);
        if (j || k) total += Math.hypot(q[0] - xs[xs.length - 1], q[1] - ys[ys.length - 1]);
        xs.push(q[0]); ys.push(q[1]); acc.push(total); ci.push(id); ts.push(t);
      }
      p = c.slice(4);
    });
  }
  return keep(measured, d, { pieces, xs, ys, acc, ci, ts, total, closed });
}

// The point at length s along a measured path, with its tangent's heading.
function along(m, s) {
  const { acc } = m;
  let lo = 0, hi = acc.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (acc[mid] < s) lo = mid + 1; else hi = mid; }
  const j = lo, i = Math.max(0, j - 1), span = acc[j] - acc[i];
  // No length between them: the first sample, or a move to another subpath.
  if (!span) {
    const [p, c] = m.pieces[m.ci[j]], q = onCubic(p, c, m.ts[j]);
    return [m.xs[j], m.ys[j], q[2] || q[3] ? heading(q[2], q[3]) : 0];
  }
  // Across the join of two cubics, the earlier one's end is the later one's t = 0.
  const from = m.ci[i] === m.ci[j] ? m.ts[i] : 0;
  const t = from + ((s - acc[i]) / span) * (m.ts[j] - from);
  const [p, c] = m.pieces[m.ci[j]], q = onCubic(p, c, t);
  return [q[0], q[1], q[2] || q[3] ? heading(q[2], q[3]) : heading(m.xs[j] - m.xs[i], m.ys[j] - m.ys[i])];
}

// A scatter by best candidate: each point the one of several seeded tries
// that is farthest from the points before it, so they spread evenly without
// a grid's rows.
const scattered = new Map();
function scatter(n, w, h, cx, cy, seed) {
  const key = n + ' ' + w + ' ' + h + ' ' + cx + ' ' + cy + ' ' + seed;
  const kept = scattered.get(key);
  if (kept) return kept;
  const out = new Float64Array(n * 2);
  let state = seed;
  const rnd = () => { const r = next(state); state = r[1]; return r[0]; };
  for (let i = 0; i < n; i++) {
    let bx = 0, by = 0, best = -1;
    for (let k = 0; k < CANDIDATES; k++) {
      const x = cx - w / 2 + rnd() * w, y = cy - h / 2 + rnd() * h;
      let near = Infinity;
      for (let j = 0; j < i && near > best; j++) near = Math.min(near, (out[j * 2] - x) ** 2 + (out[j * 2 + 1] - y) ** 2);
      if (near > best) { best = near; bx = x; by = y; }
    }
    out[i * 2] = bx; out[i * 2 + 1] = by;
  }
  return keep(scattered, key, out);
}

export function distribute(kind, n, options) {
  if (!DISTRIBUTIONS.includes(kind)) throw fail(CODES.BAD_CALL, 'distribute(kind)', __DEV__ && "kind is 'line', 'circle', 'grid', 'spiral', 'scatter' or 'path', not " + show(kind));
  needD(Number.isInteger(n) && n >= 0, kind, '', __DEV__ && 'n is a whole number, 0 or more', n);
  const o = options || {};
  const u = (i) => (n > 1 ? i / (n - 1) : 0);
  const out = [];
  // A centre that may be left out, as 0.
  if (kind !== 'line' && kind !== 'path') {
    needD(o.cx === undefined ? kind !== 'circle' : num(o.cx), kind, 'cx', __DEV__ && 'cx is a number', o.cx);
    needD(o.cy === undefined ? kind !== 'circle' : num(o.cy), kind, 'cy', __DEV__ && 'cy is a number', o.cy);
  }
  const cx = o.cx || 0, cy = o.cy || 0;

  if (kind === 'line') {
    needD(pair(o.from), kind, 'from', __DEV__ && 'from is [x, y], two numbers', o.from);
    needD(pair(o.to), kind, 'to', __DEV__ && 'to is [x, y], two numbers', o.to);
    const [x0, y0] = o.from, [x1, y1] = o.to, a = heading(x1 - x0, y1 - y0);
    for (let i = 0; i < n; i++) out.push({ i, x: x0 + (x1 - x0) * u(i), y: y0 + (y1 - y0) * u(i), heading: a, u: u(i) });
  } else if (kind === 'circle') {
    needD(num(o.radius) && o.radius > 0, kind, 'radius', __DEV__ && 'radius is a number above 0', o.radius);
    const from = o.from === undefined ? 0 : o.from, to = o.to === undefined ? from + 360 : o.to;
    needD(num(from), kind, 'from', __DEV__ && 'from is degrees clockwise from up', o.from);
    needD(num(to), kind, 'to', __DEV__ && 'to is degrees clockwise from up', o.to);
    // A full turn spaces n points round it; an arc puts one at each end.
    const sweep = to - from, step = Math.abs(sweep) >= 360 - 1e-9 ? sweep / n : n > 1 ? sweep / (n - 1) : 0;
    const back = sweep < 0 ? 180 : 0;
    for (let i = 0; i < n; i++) {
      const a = from + step * i;
      out.push({ i, x: cx + o.radius * Math.sin(a * RAD), y: cy - o.radius * Math.cos(a * RAD), heading: turn(a + back), u: u(i) });
    }
  } else if (kind === 'grid') {
    needD(Number.isInteger(o.columns) && o.columns > 0, kind, 'columns', __DEV__ && 'columns is a whole number, 1 or more', o.columns);
    const cell = typeof o.cell === 'number' ? [o.cell, o.cell] : o.cell;
    needD(pair(cell) && cell[0] > 0 && cell[1] > 0, kind, 'cell', __DEV__ && 'cell is the distance between neighbours in px, a number or [width, height], above 0', o.cell);
    const cols = o.columns, rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      out.push({ i, x: cx + (col - (cols - 1) / 2) * cell[0], y: cy + (row - (rows - 1) / 2) * cell[1], heading: 0, u: u(i), col, row });
    }
  } else if (kind === 'spiral') {
    needD(num(o.radius) && o.radius > 0, kind, 'radius', __DEV__ && 'radius is a number above 0', o.radius);
    for (let i = 0; i < n; i++) {
      // Vogel's sunflower: radius by the square root of the count, so each
      // point has the same area, turned by the golden angle each time.
      const r = o.radius * Math.sqrt((i + 0.5) / n), a = i * GOLDEN;
      out.push({ i, x: cx + r * Math.sin(a * RAD), y: cy - r * Math.cos(a * RAD), heading: turn(a - 90), u: u(i) });
    }
  } else if (kind === 'scatter') {
    needD(num(o.width) && o.width > 0, kind, 'width', __DEV__ && 'width is a number above 0', o.width);
    needD(num(o.height) && o.height > 0, kind, 'height', __DEV__ && 'height is a number above 0', o.height);
    const xy = scatter(n, o.width, o.height, cx, cy, seedOf(o.seed === undefined ? 1 : o.seed, "distribute('scatter', n, { seed })"));
    for (let i = 0; i < n; i++) out.push({ i, x: xy[i * 2], y: xy[i * 2 + 1], heading: 0, u: u(i) });
  } else {
    const m = measure(o.d);
    // A closed path spaces n points round it; an open one puts one at each end.
    const step = m.closed ? m.total / n : n > 1 ? m.total / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const [x, y, a] = along(m, Math.min(step * i, m.total));
      out.push({ i, x, y, heading: a, u: u(i) });
    }
  }
  return out;
}

// ---- falloff() -----------------------------------------------------------------------

// A path as closed rings of points, for inside and distance tests, with its
// bounding box.
const outlined = new Map();
function outline(d) {
  const kept = outlined.get(d);
  if (kept) return kept;
  const rings = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of subpathsOf(d, needF, 'shape')) {
    const pts = [s.s[0], s.s[1]];
    let p = s.s;
    for (const c of s.c) {
      for (let j = 1; j <= EDGE_STEPS; j++) { const q = onCubic(p, c, j / EDGE_STEPS); pts.push(q[0], q[1]); }
      p = c.slice(4);
    }
    for (let k = 0; k < pts.length; k += 2) {
      x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k]); y0 = Math.min(y0, pts[k + 1]); y1 = Math.max(y1, pts[k + 1]);
    }
    rings.push(pts);
  }
  return keep(outlined, d, { rings, box: [x0, y0, x1, y1] });
}

// Whether (x, y) is inside the rings: nonzero counts the winding number,
// each edge that crosses the point's row adding 1 or taking 1 away by the
// side the point is on; evenodd counts the edges crossed to its right.
function inside(rings, x, y, evenodd) {
  let wind = 0, crossed = 0;
  for (const r of rings) {
    for (let k = 0; k < r.length; k += 2) {
      const ax = r[k], ay = r[k + 1], b = (k + 2) % r.length, bx = r[b], by = r[b + 1];
      if ((ay <= y) === (by <= y)) continue;
      const side = (bx - ax) * (y - ay) - (x - ax) * (by - ay);
      if (ay <= y && side > 0) wind++;
      else if (ay > y && side < 0) wind--;
      if (x < ax + ((y - ay) / (by - ay)) * (bx - ax)) crossed++;
    }
  }
  return evenodd ? crossed % 2 === 1 : wind !== 0;
}

// The distance from (x, y) to the nearest edge of the rings.
function edgeDistance(rings, x, y) {
  let best = Infinity;
  for (const r of rings) {
    for (let k = 0; k < r.length; k += 2) {
      const ax = r[k], ay = r[k + 1], b = (k + 2) % r.length, dx = r[b] - ax, dy = r[b + 1] - ay;
      const len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len)) : 0;
      best = Math.min(best, (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2);
    }
  }
  return Math.sqrt(best);
}

// The where of each kind's ease, for a KN-121 from easeAt().
const EASE_WHERE = {};
for (const k of FIELDS) EASE_WHERE[k] = "falloff('" + k + "', point, { ease })";

export function falloff(kind, point, options) {
  if (!FIELDS.includes(kind)) throw fail(CODES.BAD_CALL, 'falloff(kind)', __DEV__ && "kind is 'radial', 'linear', 'band', 'ring' or 'shape', not " + show(kind));
  let px, py;
  if (Array.isArray(point) && point.length >= 2 && num(point[0]) && num(point[1])) { px = point[0]; py = point[1]; }
  else {
    needF(point && typeof point === 'object' && num(point.x) && num(point.y), kind, '', __DEV__ && 'point is { x, y } or [x, y], with numbers', point);
    px = point.x; py = point.y;
  }
  const o = options || {};
  needF(o.invert === undefined || typeof o.invert === 'boolean', kind, 'invert', __DEV__ && 'invert is true or false', o.invert);
  const f = o.ease === undefined ? null : easeAt(o.ease, EASE_WHERE[kind]);
  let w;

  if (kind === 'shape') {
    const { rings, box } = outline(o.d);
    const width = o.width === undefined ? 0 : o.width, scale = o.scale === undefined ? 1 : o.scale;
    needF(num(width) && width >= 0, kind, 'width', __DEV__ && 'width is px outside the edge over which the weight falls to 0, 0 or more', o.width);
    needF(num(scale) && scale > 0, kind, 'scale', __DEV__ && 'scale is a number above 0', o.scale);
    needF(o.x === undefined || num(o.x), kind, 'x', __DEV__ && 'x is a number', o.x);
    needF(o.y === undefined || num(o.y), kind, 'y', __DEV__ && 'y is a number', o.y);
    needF(o.rule === undefined || o.rule === 'nonzero' || o.rule === 'evenodd', kind, 'rule', __DEV__ && "rule is 'nonzero' or 'evenodd'", o.rule);
    // The point in the path's own units.
    const lx = (px - (o.x || 0)) / scale, ly = (py - (o.y || 0)) / scale, reach = width / scale;
    if (lx < box[0] - reach || lx > box[2] + reach || ly < box[1] - reach || ly > box[3] + reach) w = 0;
    else if (inside(rings, lx, ly, o.rule === 'evenodd')) w = 1;
    else w = width ? Math.max(0, 1 - (edgeDistance(rings, lx, ly) * scale) / width) : 0;
  } else {
    needF(num(o.x), kind, 'x', __DEV__ && 'x is a number', o.x);
    needF(num(o.y), kind, 'y', __DEV__ && 'y is a number', o.y);
    const dx = px - o.x, dy = py - o.y;
    if (kind === 'radial') {
      needF(num(o.radius) && o.radius > 0, kind, 'radius', __DEV__ && 'radius is a number above 0', o.radius);
      const inner = o.inner === undefined ? 0 : o.inner;
      needF(num(inner) && inner >= 0 && inner < o.radius, kind, 'inner', __DEV__ && 'inner is a number from 0 to below radius', o.inner);
      const d = Math.hypot(dx, dy);
      w = d <= inner ? 1 : d >= o.radius ? 0 : 1 - (d - inner) / (o.radius - inner);
    } else if (kind === 'ring') {
      needF(num(o.radius) && o.radius >= 0, kind, 'radius', __DEV__ && 'radius is a number, 0 or more', o.radius);
      needF(num(o.width) && o.width > 0, kind, 'width', __DEV__ && 'width is a number above 0', o.width);
      w = Math.max(0, 1 - Math.abs(Math.hypot(dx, dy) - o.radius) / o.width);
    } else {
      needF(num(o.angle), kind, 'angle', __DEV__ && 'angle is degrees, 0 heading right and 90 down', o.angle);
      needF(num(o.width) && o.width > 0, kind, 'width', __DEV__ && 'width is a number above 0', o.width);
      // How far the point is ahead of the line through (x, y), along angle.
      const s = dx * Math.cos(o.angle * RAD) + dy * Math.sin(o.angle * RAD);
      w = kind === 'band' ? Math.max(0, 1 - Math.abs(s) / o.width) : s <= 0 ? 1 : s >= o.width ? 0 : 1 - s / o.width;
    }
  }
  // Clamped after the ease, since back, elastic and a spring overshoot.
  if (f) { w = f(w); w = w < 0 ? 0 : w > 1 ? 1 : w; }
  return o.invert ? 1 - w : w;
}
