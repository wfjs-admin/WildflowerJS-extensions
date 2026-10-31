/**
 * Line boil: edges that wobble a little and are drawn again a few times a
 * second, as hand-drawn frames are. boil() here for SVG path data, and
 * effect()'s boil kind (effects.js) for a canvas, an image or a video.
 *
 *   boil(d, options)   SVG path data with its outline moved along its normals
 *                      by seeded noise, as a polyline: each subpath sampled
 *                      every `detail` px (2), each sample moved by up to
 *                      `amount` px (2) by noise read along the outline every
 *                      `scale` px (30). With `t` and `fps`, the noise's seed
 *                      steps `fps` times a second, held for the first
 *                      `delay` seconds of `t` (0); on a closed subpath the
 *                      noise is blended across the seam, so the outline has
 *                      no jump where it closes.
 *
 * Every value comes from the options, so check() and a render see the same
 * edges. Errors: KN-100 for a bad call.
 */
import { CODES, fail, show } from './diagnostics.js';
import { noise } from './motion.js';
import { readPath, cubics, fmt } from './paths.js';
import { boilStep } from './effects.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const OPTIONS = ['amount', 'scale', 'fps', 'delay', 'seed', 't', 'detail'];

// The point and the tangent on a cubic from p at t.
function on(p, c, t) {
  const m = 1 - t, a = m * m * m, b = 3 * m * m * t, e = 3 * m * t * t, f = t * t * t;
  return [
    a * p[0] + b * c[0] + e * c[2] + f * c[4],
    a * p[1] + b * c[1] + e * c[3] + f * c[5],
    3 * m * m * (c[0] - p[0]) + 6 * m * t * (c[2] - c[0]) + 3 * t * t * (c[4] - c[2]),
    3 * m * m * (c[1] - p[1]) + 6 * m * t * (c[3] - c[1]) + 3 * t * t * (c[5] - c[3]),
  ];
}

// Checks the options against their names and ranges, and returns their
// values with the defaults filled in.
function read(o) {
  const v = { amount: 2, scale: 30, fps: 0, delay: 0, seed: 1, detail: 2 };
  if (o === undefined) return v;
  if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL, 'boil(d, options)', __DEV__ && 'options is an object, not ' + show(o));
  for (const k in o) {
    if (!OPTIONS.includes(k)) throw fail(CODES.BAD_CALL, 'boil(d, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the options are " + OPTIONS.join(', '));
    const x = o[k];
    if (k === 'seed' ? !(isNum(x) && x % 1 === 0) : k === 'scale' || k === 'detail' ? !(isNum(x) && x > 0) : k === 't' ? !isNum(x) : !(isNum(x) && x >= 0)) {
      throw fail(CODES.BAD_CALL, 'boil(d, { ' + k + ' })', __DEV__ && k + ' is ' + (k === 'seed' ? 'a whole number'
        : k === 'scale' || k === 'detail' ? 'a number of px above 0' : k === 't' ? 'a number of seconds' : 'a number, 0 or more') + ', not ' + show(x));
    }
    v[k] = x;
  }
  return v;
}


export function boil(d, options) {
  if (typeof d !== 'string') throw fail(CODES.BAD_CALL, 'boil(d)', __DEV__ && 'd is SVG path data, not ' + show(d) + "; for a canvas, an image or a video use effect()'s boil kind");
  const o = read(options);
  const cmds = readPath(d);
  if (typeof cmds === 'number') throw fail(CODES.BAD_CALL, 'boil(d)', __DEV__ && 'd is SVG path data, and the grammar stops at character ' + cmds + ' of it');
  // The seed for the time: stepped fps times a second once the delay is up
  // (none without t), as effect(), shade() and blur() step theirs.
  const seed = o.seed + boilStep(o.t, o.fps, o.delay) * 7919;
  const out = [];
  cubics(cmds).forEach((s, si) => {
    if (!s.c.length) return;
    // Samples along the subpath with the length so far, each cubic in
    // pieces of about `detail` px; a cubic's start is the last one's end.
    const pts = [];
    let p = s.s, len = 0, prev = null;
    for (const c of s.c) {
      const hull = Math.hypot(c[0] - p[0], c[1] - p[1]) + Math.hypot(c[2] - c[0], c[3] - c[1]) + Math.hypot(c[4] - c[2], c[5] - c[3]);
      const n = Math.max(1, Math.ceil(hull / o.detail));
      for (let j = pts.length ? 1 : 0; j <= n; j++) {
        const q = on(p, c, j / n);
        if (prev) len += Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        pts.push([q[0], q[1], q[2], q[3], len]);
        prev = q;
      }
      p = c.slice(4);
    }
    const total = len, sub = seed + si * 101;
    // A closed outline ends where it began: the last `scale` px blend toward
    // the noise from before the start, so the two ends meet.
    // Smooth noise stays near its middle, so it is stretched and eased into
    // -1..1 (tanh, so nothing is cut flat), and `amount` is about the
    // largest move seen.
    const at = (l) => {
      let n = noise(l / o.scale, sub);
      if (s.closed && total > o.scale && l >= total - o.scale) {
        const u = (l - (total - o.scale)) / o.scale, w = u * u * (3 - 2 * u);
        n += (noise((l - total) / o.scale, sub) - n) * w;
      }
      return Math.tanh(n * 1.8);
    };
    const last = s.closed ? pts.length - 1 : pts.length;
    let path = '';
    for (let i = 0; i < last; i++) {
      const [x, y, dx, dy, l] = pts[i];
      const h = Math.hypot(dx, dy) || 1, k = o.amount * at(l);
      path += (i ? ' L ' : 'M ') + fmt(x - (dy / h) * k) + ' ' + fmt(y + (dx / h) * k);
    }
    out.push(path + (s.closed ? ' Z' : ''));
  });
  return out.join(' ');
}
