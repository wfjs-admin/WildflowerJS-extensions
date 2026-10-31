/**
 * textMetrics(text, font, options): a line of text measured with the
 * canvas's own measureText(), for laying out around a line, centring on a
 * letter, or fitting a title to a width.
 *
 * Unlike text.js's helpers, the numbers depend on the font files the browser
 * has: a web font from @font-face measures the same on every machine, and a
 * system font may not. Each font measured with is kept, and readiness waits
 * for it to load (fontsMeasured()), so a render or a check never measures
 * with the fallback. The measure itself is not kept, so a line measured
 * before its font loaded is measured again with it. A computed keeps its
 * value until what it read changes, so textMetrics() also reads a count
 * that readiness raises once the fonts have loaded (trackFonts()): a scene
 * hidden at load, whose computed measured before then, measures again.
 */

import { CODES, fail, show } from './diagnostics.js';
import { split } from './text.js';

const fonts = new Set();   // each font measured with, at one size: what readiness loads
let ctx = null;
let loaded = null;         // reads the count of font loads, so a computed depends on it
const SENTINEL = '1px a';
const FONT = 'textMetrics(…, font)', WIDTH = 'textMetrics(…, { width })';

// The fonts measured with, loaded. A font with no face on the page loads as
// nothing, and the fallback is what it measures with.
export const fontsMeasured = () => (fonts.size && typeof document !== 'undefined' && document.fonts
  ? Promise.all(Array.from(fonts, (f) => document.fonts.load(f).catch(() => null)))
  : Promise.resolve());

export const trackFonts = (read) => { loaded = read; };

// { width, left, right, ascent, descent }: the advance width, and the ink's
// extent left and right of the line's start and above and below its
// baseline. `tracking`, in em as text() takes it, adds between graphemes and
// never after the last. `letters: true` adds split()'s rows, each with x, its
// left edge, and width, its advance, kerning in. `width` adds size: the font
// size in px at which the line is that wide, exact for one line since its
// width grows in step with its size, tracking included.
export function textMetrics(text, font, options) {
  if (typeof text !== 'string') throw fail(CODES.BAD_CALL, 'textMetrics(text)', __DEV__ && 'text is a string, not ' + show(text));
  const o = options || {}, tracking = o.tracking === undefined ? 0 : o.tracking;
  if (!Number.isFinite(tracking)) throw fail(CODES.BAD_CALL, 'textMetrics(…, { tracking })', __DEV__ && 'tracking is a finite number of em between letters, not ' + show(tracking));
  if (o.width !== undefined && !(Number.isFinite(o.width) && o.width > 0)) throw fail(CODES.BAD_CALL, WIDTH, __DEV__ && 'width is a finite number of px above 0, the width to fit the line to, not ' + show(o.width));
  if (loaded) loaded();
  if (!ctx) {
    if (typeof document === 'undefined') throw fail(CODES.BAD_CALL, 'textMetrics()', __DEV__ && 'textMetrics() measures with a canvas, so it needs a document');
    ctx = document.createElement('canvas').getContext('2d');
  }
  // The canvas keeps its font when it refuses one, so a font the sentinel
  // survives is refused; a size in px is what the canvas writes back.
  ctx.font = SENTINEL;
  if (typeof font === 'string' && font) ctx.font = font;
  const px = /(\d*\.?\d+(?:e[+-]?\d+)?)px/.exec(ctx.font);
  if (typeof font !== 'string' || (ctx.font === SENTINEL && font.trim() !== SENTINEL) || !px) {
    throw fail(CODES.BAD_CALL, FONT, __DEV__ && "font is a CSS font shorthand, such as '700 54px \"Work Sans\"', not " + show(font));
  }
  const size = +px[1], key = ctx.font.replace(px[0], '16px');
  if (!fonts.has(key)) {
    fonts.add(key);
    if (document.fonts && document.fonts.load) document.fonts.load(key).catch(() => {});
  }
  const rows = split(text, 'letter'), gap = tracking * size, extra = rows.length > 1 ? gap * (rows.length - 1) : 0;
  const m = ctx.measureText(text);
  const out = { width: m.width + extra, left: m.actualBoundingBoxLeft, right: m.actualBoundingBoxRight + extra, ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent };
  if (o.letters) {
    let before = 0, prefix = '';
    out.letters = rows.map((r, i) => {
      prefix += r.text;
      const w = ctx.measureText(prefix).width;
      const row = Object.assign(r, { x: before + gap * i, width: w - before });
      before = w;
      return row;
    });
  }
  if (o.width !== undefined) {
    if (!(out.width > 0)) throw fail(CODES.BAD_CALL, WIDTH, __DEV__ && 'an empty line has no width to fit');
    out.size = (size * o.width) / out.width;
  }
  return out;
}
