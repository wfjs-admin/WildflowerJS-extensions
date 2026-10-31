/**
 * trails(kind, at, options): marks a mover leaves, each a pure function of
 * the time, so every frame seeks and renders alike.
 *
 *   'ghosts'  rows { key, k, t, style } for a data-list: copy k of the
 *             element styled at t - k * lag, fading and, with scale,
 *             shrinking; at is the time
 *   'ribbon'  path data: the stretch of the mover's path from u - length to
 *             u (trimPath()); at is u, its place along the path, 0 to 1
 *   'dots'    rows { i, key, x, y, heading, u, state }: count marks evenly
 *             along the path, each 'past' once u reaches it, else 'future'
 *
 * A trail of something that is no function of time, such as the pointer or
 * a slider, needs a memory of earlier frames that a seek cannot rebuild, so
 * it is no kind here: a ghost of a style that reads a store sits on the
 * element itself.
 */

import { CODES, fail, show } from './diagnostics.js';
import { styled } from './motion.js';
import { fmt, trimPath, pointsAlong } from './paths.js';

const KINDS = ['ghosts', 'ribbon', 'dots'];
const BY = ['length', 'segment'];

export function trails(kind, at, options) {
  if (!KINDS.includes(kind)) throw fail(CODES.BAD_CALL, 'trails(kind)', __DEV__ && "kind is 'ghosts', 'ribbon' or 'dots', not " + show(kind));
  const o = options || {}, ghost = kind === 'ghosts', name = "trails('" + kind + "', " + (ghost ? 't' : 'u');
  const need = (ok, key, what, v) => { if (!ok) throw fail(CODES.BAD_CALL, name + ', { ' + key + ' })', __DEV__ && what + ', not ' + show(v)); };
  if (!Number.isFinite(at)) throw fail(CODES.BAD_CALL, name + ')', __DEV__ && (ghost ? 't is the time in seconds, a finite number' : "u is the mover's place along the path, a finite number from 0 to 1") + ', not ' + show(at));
  if (ghost) return ghosts(at, o, need);
  const by = o.by === undefined ? 'length' : o.by;
  need(typeof o.d === 'string', 'd', __DEV__ && 'd is SVG path data, the path the mover follows', o.d);
  need(BY.includes(by), 'by', __DEV__ && "by is 'length' or 'segment'", by);
  if (kind === 'ribbon') {
    const length = o.length === undefined ? 0.1 : o.length;
    need(Number.isFinite(length) && length > 0 && length <= 1, 'length', __DEV__ && 'length is the fraction of the path the ribbon covers, above 0 and up to 1', length);
    return trimPath(o.d, at - length, at, { by });
  }
  const count = o.count === undefined ? 12 : o.count;
  need(Number.isInteger(count) && count >= 1 && count <= 1000, 'count', __DEV__ && 'count is a whole number from 1 to 1000', count);
  return pointsAlong(o.d, count, by === 'segment', name + ', { d })').map((p) => Object.assign(p, { key: p.i, state: p.u <= at ? 'past' : 'future' }));
}

// Copy k of count styled at t - k * lag. Its opacity is the style's (a
// number, or a string of one or of a percentage; 1 when it has none) times
// 1 - fade * k / count, and scale multiplies the copy by 1 - scale * k after
// its own transform. Normal blending, and the same in a render with a
// shutter, unlike smear().
function ghosts(t, o, need) {
  const count = o.count === undefined ? 6 : o.count, lag = o.lag === undefined ? 0.04 : o.lag;
  const fade = o.fade === undefined ? 0.8 : o.fade, shrink = o.scale === undefined ? 0 : o.scale, spec = o.style;
  need(typeof spec === 'function' || (spec && typeof spec === 'object' && !Array.isArray(spec.at)), 'style', __DEV__ && 'style is an object of tracks, as styleAt() takes, or a function of the time that returns a style object', spec);
  need(Number.isInteger(count) && count >= 1 && count <= 64, 'count', __DEV__ && 'count is a whole number from 1 to 64', count);
  need(Number.isFinite(lag) && lag >= 0, 'lag', __DEV__ && 'lag is the seconds between copies, 0 or more', lag);
  need(Number.isFinite(fade) && fade >= 0 && fade <= 1, 'fade', __DEV__ && 'fade is from 0 to 1, the opacity the last copy loses', fade);
  need(Number.isFinite(shrink) && shrink >= 0 && shrink <= 1, 'scale', __DEV__ && 'scale is from 0 to 1, the size each copy loses', shrink);
  const rows = [];
  for (let k = 1; k <= count; k++) {
    const s = t - k * lag;
    const own = typeof spec === 'function' ? spec(s) : styled(s, spec);
    need(own && typeof own === 'object', 'style', __DEV__ && 'the style function returns a style object', own);
    const style = Object.assign({}, own), a = style.opacity;
    const v = a == null || (typeof a === 'string' && !a.trim()) ? 1 : /%\s*$/.test(a) ? parseFloat(a) / 100 : Number(a);
    need(Number.isFinite(v), 'style', __DEV__ && 'opacity is a number, or a string of a number or a percentage', a);
    style.opacity = v * (1 - (fade * k) / count);
    if (shrink) {
      const f = 'scale(' + fmt(Math.max(0, 1 - shrink * k)) + ')';
      style.transform = style.transform ? style.transform + ' ' + f : f;
    }
    rows.push({ key: k, k, t: s, style });
  }
  return rows;
}
