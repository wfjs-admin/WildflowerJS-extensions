/**
 * Text helpers for scene computeds. Pure functions; the same input gives the
 * same output on every render machine.
 *
 *   split(text, by)            rows for a data-list: one per letter or word
 *   typewriter(t, text, cps)   the text typed so far at t seconds
 *   scramble(t, text, opts)    the text settling from scrambled characters
 *   format(n, opts)            Intl.NumberFormat with a fixed default locale
 *
 * Letters are graphemes (Intl.Segmenter), so an emoji with a skin tone or a
 * letter with a combining mark stays one row and types as one character.
 */

import { CODES, fail, show, checkTime } from './diagnostics.js';
import { seedOf, next } from './motion.js';

let segmenter;   // undefined until first use; null where the platform has none

function graphemes(text) {
  if (segmenter === undefined) {
    try { segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' }); } catch (_) { segmenter = null; }
  }
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

const str = (v) => (v == null ? '' : String(v));

// Rows { i, key, text, space } for a data-list, by 'letter' (the default) or
// 'word'. Whitespace keeps its own rows, flagged `space`, so a stagger can
// skip them and the layout keeps its gaps (give the row white-space: pre).
export function split(text, by) {
  const mode = by === undefined ? 'letter' : by;
  if (mode !== 'letter' && mode !== 'word') throw fail(CODES.BAD_CALL, 'split(…, by)', __DEV__ &&"by is 'letter' (the default) or 'word', not " + show(by));
  const s = str(text);
  const parts = mode === 'word' ? (s.match(/\s+|\S+/g) || []) : graphemes(s);
  return parts.map((p, i) => ({ i, key: i, text: p, space: /^\s+$/.test(p) }));
}

// The first Math.floor(t * cps) characters of the text; all of it once t is
// past the end, none before 0. The 1e-9 keeps a product that lands a hair
// under a whole number on that number: frame 392 at 24 fps and 15 cps is
// 244.99999999999997 characters, and 245 are typed.
export function typewriter(t, text, cps) {
  checkTime(t, 'typewriter');
  const rate = cps === undefined ? 20 : cps;
  if (!(typeof rate === 'number' && rate > 0)) throw fail(CODES.BAD_CALL, 'typewriter(…, cps)', __DEV__ &&'cps is characters per second, above 0, not ' + show(cps));
  const u = graphemes(str(text));
  const n = t > 0 ? Math.min(u.length, Math.floor(t * rate + 1e-9)) : 0;
  return n === u.length ? u.join('') : u.slice(0, n).join('');
}

const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=?';
const SCRAMBLE_OPTIONS = ['duration', 'chars', 'fps', 'seed'];

// The text settling left to right from scrambled characters over `duration`
// seconds from t = 0: grapheme k of L settles at duration * (k + 1) / L, with
// the 1e-9 typewriter() adds. Until then it shows a grapheme of `chars`
// picked by a hash of the seed, k and floor(t * fps), so it changes `fps`
// times a second and is the same on every machine. Whitespace is never
// scrambled.
export function scramble(t, text, opts) {
  checkTime(t, 'scramble');
  const o = opts === undefined ? {} : opts;
  if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL, 'scramble(t, text, options)', __DEV__ && 'options is an object, not ' + show(o));
  for (const k in o) if (!SCRAMBLE_OPTIONS.includes(k)) throw fail(CODES.BAD_CALL, 'scramble(t, text, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the options are " + SCRAMBLE_OPTIONS.join(', '));
  const duration = o.duration === undefined ? 1 : o.duration;
  const chars = o.chars === undefined ? SCRAMBLE : o.chars;
  const fps = o.fps === undefined ? 20 : o.fps;
  // `where` names the argument or option that failed.
  const bad = (where, what, v) => fail(CODES.BAD_CALL, where, __DEV__ && what + ', not ' + show(v));
  if (!(Number.isFinite(duration) && duration > 0)) throw bad('scramble(t, text, { duration })', __DEV__ && 'duration is a finite number of seconds above 0', duration);
  if (!(Number.isFinite(fps) && fps > 0)) throw bad('scramble(t, text, { fps })', __DEV__ && 'fps is a finite number of changes a second above 0', fps);
  if (!(typeof chars === 'string' && chars)) throw bad('scramble(t, text, { chars })', __DEV__ && 'chars is a string of one character or more', chars);
  const s = seedOf(o.seed === undefined ? 1 : o.seed, 'scramble(t, text, { seed })');
  const set = graphemes(chars), u = graphemes(str(text));
  const settled = t > 0 ? Math.floor(t * u.length / duration + 1e-9) : 0;
  const step = Math.floor(t * fps + 1e-9);
  return u.map((g, k) => (k < settled || /^\s+$/.test(g) ? g
    : set[Math.floor(next((Math.imul(k, 374761393) ^ Math.imul(step, 668265263) ^ s) >>> 0)[0] * set.length)])).join('');
}

const formatters = new Map();

// The formatter cache's key. A string locale is quoted, so it differs from
// an array of locales that String() would join into the same text; an
// Intl.Locale is its tag. In the options, NaN and the infinities are kept
// apart from null, which JSON would print for all three.
const localeKey = (l) => (typeof l === 'string' ? JSON.stringify(l) : Array.isArray(l) ? JSON.stringify(l.map(String)) : String(l));
const nonFinite = (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? { nonFinite: String(v) } : v);

// Intl.NumberFormat, 'en-US' unless opts.locale says otherwise, so a number
// reads the same on every machine that renders the composition. The other
// options are Intl's own: maximumFractionDigits, notation: 'compact',
// style: 'percent' or 'currency' with currency, and so on.
export function format(n, opts) {
  const o = opts || {};
  const locale = o.locale === undefined ? 'en-US' : o.locale;
  const rest = Object.assign({}, o);
  delete rest.locale;
  const key = localeKey(locale) + ' ' + JSON.stringify(rest, nonFinite);
  let f = formatters.get(key);
  if (!f) {
    // A locale or options Intl refuses is KN-100, named by which it was.
    try { f = new Intl.NumberFormat(locale, rest); } catch (e) {
      let byLocale = false;
      try { new Intl.NumberFormat(locale); } catch (_) { byLocale = true; }
      throw fail(CODES.BAD_CALL, byLocale ? 'format(n, { locale })' : 'format(n, opts)', __DEV__ && 'Intl.NumberFormat refused the ' + (byLocale ? 'locale ' + show(locale) : 'options ' + show(rest)) + ': ' + e.message);
    }
    // Capped as the other caches are: a page that formats with ever-new
    // options holds 64 formatters at most.
    if (formatters.size > 63) formatters.clear();
    formatters.set(key, f);
  }
  return f.format(n);
}
