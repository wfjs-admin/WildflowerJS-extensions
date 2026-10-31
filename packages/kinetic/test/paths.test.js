/**
 * Paths and shapes: SVG path data inside text tracks (a whole value of path
 * data, or the inside of path("…")), matchPaths() for paths with different
 * commands, shape() for polygons, stars, sectors and arrows, and KN-122 on
 * offsetDistance. Geometry is measured with the browser's own
 * getTotalLength() and getPointAtLength().
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, captureWarnings, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const SVG = 'http://www.w3.org/2000/svg';
let svg = null;
// A <path> on the page, for the browser's own measurements; remove() it after.
function pathEl(d) {
  if (!svg || !svg.isConnected) {
    svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('width', '10');
    svg.setAttribute('height', '10');
    document.body.appendChild(svg);
  }
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', d);
  svg.appendChild(p);
  return p;
}
const lengthOf = (d) => { const p = pathEl(d); const l = p.getTotalLength(); p.remove(); return l; };
// The points at n + 1 even fractions of the length.
function pointsOf(d, n = 10) {
  const p = pathEl(d), l = p.getTotalLength(), out = [];
  for (let i = 0; i <= n; i++) { const q = p.getPointAtLength((l * i) / n); out.push([q.x, q.y]); }
  p.remove();
  return out;
}
// The area inside the outline, by the shoelace formula over 400 points along it.
function areaOf(d) {
  const pts = pointsOf(d, 400);
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return Math.abs(a) / 2;
}
// The command letters of path data, in order.
const commands = (d) => (d.match(/[MLHVCSQTAZ]/gi) || []).join('');
// The end points of matchPaths() output (M x y, then the end of each C), and
// the signed area of the polygon through them: its sign is the direction.
function ends(d) {
  const n = d.match(/-?\d*\.?\d+/g).map(Number), out = [[n[0], n[1]]];
  for (let i = 2; i + 5 < n.length; i += 6) out.push([n[i + 4], n[i + 5]]);
  return out;
}
function signedArea(d) {
  const p = ends(d);
  let a = 0;
  for (let i = 0; i < p.length - 1; i++) a += p[i][0] * p[i + 1][1] - p[i + 1][0] * p[i][1];
  return a / 2;
}

const SQUARE = 'M -100 -100 L 100 -100 L 100 100 L -100 100 Z';
// Clockwise on the screen (y down), from the right; and the same circle drawn the other way.
const CIRCLE = 'M 150 0 A 150 150 0 0 1 0 150 A 150 150 0 0 1 -150 0 A 150 150 0 0 1 0 -150 A 150 150 0 0 1 150 0 Z';
const CIRCLE_CCW = 'M 150 0 A 150 150 0 0 0 0 -150 A 150 150 0 0 0 -150 0 A 150 150 0 0 0 0 150 A 150 150 0 0 0 150 0 Z';
const HINT = '; the paths have different commands; wildflower.kinetic.matchPaths() makes any two paths morphable';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe(`paths and shapes (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('path data in a text track: numbers glued to letters, minus signs and a second decimal point are numbers, and the output is spaced so it parses', async () => {
    const { wf } = await load();
    const { interpolate, mix } = wf.kinetic;
    const at = [0, 1];
    // As design tools write it.
    const A = 'M190-30C130 70 60 210-30 140Z';
    const B = 'M 210 -10 C 150 90 80 230 -10 160 Z';
    expect(interpolate(0.5, at, [A, B])).toBe('M 200 -20 C 140 80 70 220 -20 150 Z');
    expect(interpolate(0, at, [A, B])).toBe('M 190 -30 C 130 70 60 210 -30 140 Z');
    // A second decimal point starts a new number: .5.5 is 0.5 and then 0.5.
    expect(interpolate(0.5, at, ['M0.5.5L10.25.75', 'M1.5 1.5L11.25 1.75'])).toBe('M 1 1 L 10.75 1.25');
    // Exponents, relative commands, H and V, commas, implicit repeats, z.
    expect(interpolate(0.5, at, ['m1e1,2e1 l10,0 0,10 h-10 v-10z', 'm30,40 l20,0 0,20 h-20 v-20z'])).toBe('m 20 30 l 15 0 0 15 h -15 v -15 z');
    expect(interpolate(1 / 3, at, ['M0 0L0 0', 'M1-1L1 1'])).toBe('M 0.3333 -0.3333 L 0.3333 0.3333');
    expect(mix('M0 0L-1-1', 'M2 2L1 1', 0.5)).toBe('M 1 1 L 0 0');
    // The same path data in two spellings is the same text.
    expect(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { d: { at, to: [A, B] } } })).not.toThrow();
    const p = pathEl(interpolate(0.5, at, [A, B]));
    expect(p.getTotalLength()).toBeGreaterThan(0);
    p.remove();
  });

  it('path("…") inside clipPath, offsetPath and a CSS d is read as path data in either quote style, and the text around it stays as written', async () => {
    const { wf } = await load();
    const { interpolate, styleAt } = wf.kinetic;
    const at = [0, 1];
    expect(interpolate(0.5, at, ['path("M0 0L100 0L50 80Z")', 'path("M20 20L120-20L50 100Z")'])).toBe('path("M 10 10 L 110 -10 L 50 90 Z")');
    expect(interpolate(0.5, at, ["path('M0 0H100')", "path('M0 10H50')"])).toBe("path('M 0 5 H 75')");
    const look = styleAt(0.25, {
      clipPath: { at, to: ['path("M0,0 L200,0 L100,160 Z")', 'path("M0,40 L200,40 L100,200 Z")'] },
      offsetPath: { at, to: ["path('M0 0C100 0 100 100 200 100')", "path('M0 100C100 100 100 0 200 0')"] },
      d: { at, to: ['path("M10 10h80v80h-80z")', 'path("M30 30h40v40h-40z")'] },
    });
    expect(look).toEqual({
      clipPath: 'path("M 0 10 L 200 10 L 100 170 Z")',
      offsetPath: "path('M 0 25 C 100 25 100 75 200 75')",
      d: 'path("M 15 15 h 70 v 70 h -70 z")',
    });
    // The browser takes each one.
    const i = document.createElement('i');
    i.style.clipPath = look.clipPath;
    i.style.offsetPath = look.offsetPath;
    expect(i.style.clipPath).not.toBe('');
    expect(i.style.offsetPath).not.toBe('');
    const el = pathEl('M 0 0');
    el.style.setProperty('d', look.d);
    expect(el.style.getPropertyValue('d')).not.toBe('');
    el.remove();
    // With more text after it, and as a keyframes entry.
    expect(interpolate(0.5, at, ['path("M0 0L10 0") border-box', 'path("M0 0L20 0") border-box'])).toBe('path("M 0 0 L 15 0") border-box');
    expect(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { shape: { clipPath: { at, to: ["path('M0 0L10 0L5 8Z')", "path('M0 0L20 0L10 16Z')"] } } } })).not.toThrow();
  });

  it('a value that starts with M but is not path data stays text, read as before; one that is path data is read by the path grammar', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    const at = [0, 1];
    // Path data: the numbers glued to the letters are numbers.
    expect(interpolate(0.5, at, ['M10 0', 'M20 0'])).toBe('M 15 0');
    // Not path data: a word, and a command letter the grammar does not have.
    expect(interpolate(0.5, at, ['Medium 300', 'Medium 500'])).toBe('Medium 400');
    expect(interpolate(0.5, at, ['M 10 X 4', 'M 20 X 8'])).toBe('M 15 X 6');
    // There a number glued to a letter is still text, so these differ.
    expectKN(() => interpolate(0.5, at, ['M 10 X4', 'M 20 X8']), 'KN-120', 'interpolate.to[1]', /^to\[1\] has " X8" after its 1st number where to\[0\] has " X4"; the values of a track must have the same text/);
    // A path("…") whose inside the grammar rejects is a quoted string, as before.
    expect(interpolate(0.5, at, ['path("M 0 0 L") 0px', 'path("M 0 0 L") 10px'])).toBe('path("M 0 0 L") 5px');
    expect(() => interpolate(0.5, at, ['path("M 0 0 L 1")', 'path("M 0 0 L 2")'])).toThrow(/KN-120/);
    // A function whose name only ends in path is not path().
    expect(() => interpolate(0.5, at, ['xpath("M 0 0 L 1 1")', 'xpath("M 0 0 L 2 2")'])).toThrow(/KN-120/);
    // Spacing in text that is not path data is kept as written.
    expect(interpolate(0, at, ['Mx  0', 'Mx  1'])).toBe('Mx  0');
  });

  it('arc flags are text: equal flags let the other numbers move, different flags are KN-120 with the matchPaths() hint, and no output carries a flag that is not 0 or 1', async () => {
    const { wf } = await load();
    const { interpolate, mix } = wf.kinetic;
    const at = [0, 1];
    // The flags glued to each other and to the next number, as design tools write them.
    const A = 'M 10 80 A 45 45 0 0 1 100 80';
    const B = 'M10 80A60 30 30 01120 80';
    expect(interpolate(0.5, at, [A, B])).toBe('M 10 80 A 52.5 37.5 15 0 1 110 80');
    const flags = (s) => [...s.matchAll(/A (\S+) (\S+) (\S+) (\S+) (\S+) /g)].map((m) => m[4] + m[5]);
    for (let i = -10; i <= 30; i++) {
      const v = interpolate(i / 20, at, [A, B], { ease: 'back.inOut', extrapolate: 'extend' });
      expect(flags(v), v).toEqual(['01']);
    }
    // Different flags, at definition and in interpolate() and mix().
    const name = uniqueName('scene');
    const flipped = 'M 10 80 A 45 45 0 1 1 100 80';
    expectKN(() => wf.kinetic.scene(name, { keyframes: { arc: { at, to: [A, flipped] } } }), 'KN-120', "scene('" + name + "').keyframes.arc.to[1]",
      new RegExp('^to\\[1\\] has " 1 1 " after its 5th number where to\\[0\\] has " 0 1 "' + esc(HINT) + '$'));
    expectKN(() => interpolate(0.5, at, [A, flipped]), 'KN-120', 'interpolate.to[1]', new RegExp(esc(HINT) + '$'));
    // Different commands say the same.
    expectKN(() => interpolate(0.5, at, ['M0 0L10 0L10 10Z', 'M0 0A5 5 0 0 1 10 0Z']), 'KN-120', 'interpolate.to[1]',
      new RegExp('^to\\[1\\] has " A " after its 2nd number where to\\[0\\] has " L "' + esc(HINT) + '$'));
    expectKN(() => mix('M0 0L10 0', 'M0 0H10', 0.5), 'KN-100', 'mix(…, b)', new RegExp('^b has " H " after its 2nd number where a has " L "' + esc(HINT) + '$'));
    // A difference outside the path data keeps the usual ending.
    expectKN(() => interpolate(0.5, at, ['path("M0 0L1 1") 0px', 'path("M0 0L1 1") 0%']), 'KN-120', 'interpolate.to[1]', /has "%" after its 5th number where to\[0\] has "px"; the values of a track must have the same text/);
  });

  it('matchPaths(): any paths come back as absolute cubics with the same commands and count, at least `segments`, in the form they came in', async () => {
    const { wf } = await load();
    const { matchPaths, interpolate } = wf.kinetic;
    const C8 = 'M' + 'C'.repeat(8) + 'Z';
    const [a, b] = matchPaths([SQUARE, CIRCLE]);
    expect(commands(a)).toBe(C8);
    expect(commands(b)).toBe(C8);
    // Every number with four decimals at most.
    for (const n of (a + ' ' + b).match(/-?\d*\.?\d+(?:e[+-]?\d+)?/g)) expect(n).not.toMatch(/\.\d{5,}|e/);
    // Three at once, with 12 segments, from quadratics, smooth curves and relative commands.
    const QTS = 'm0 0q50-50 100 0t100 0s50 50 100 0z';
    const three = matchPaths([SQUARE, CIRCLE, QTS], { segments: 12 });
    for (const d of three) expect(commands(d)).toBe('M' + 'C'.repeat(12) + 'Z');
    // A path with more segments than `segments` sets the count.
    const STAR10 = 'M 0 -100 L 30 -40 L 95 -31 L 48 15 L 59 81 L 0 50 L -59 81 L -48 15 L -95 -31 L -30 -40 Z';
    for (const d of matchPaths([STAR10, SQUARE])) expect(commands(d)).toBe('M' + 'C'.repeat(10) + 'Z');
    // An open path keeps no Z; a subpath closed in one path and open in another has none.
    for (const d of matchPaths(['M 0 0 L 100 0', 'M 0 0 Q 50 50 100 0'])) expect(commands(d)).toBe('M' + 'C'.repeat(8));
    for (const d of matchPaths([SQUARE, 'M 0 0 L 100 0 L 50 50'])) expect(commands(d)).toBe('M' + 'C'.repeat(8));
    // Ready for a track.
    expect(interpolate(0.5, [0, 1], [a, b])).toMatch(/^M [^A-Z]+ C /);
    const name = uniqueName('scene');
    expect(() => wf.kinetic.scene(name, { keyframes: { shape: { at: [0, 1], to: [a, b] } } })).not.toThrow();
    // path("…") in, path("…") out, in its own quote style.
    const [p, q] = matchPaths(['path("' + SQUARE + '")', "path('" + CIRCLE + "')"]);
    expect(p).toBe('path("' + a + '")');
    expect(q).toBe("path('" + b + "')");
    expect(interpolate(0.5, [0, 1], [p, 'path("' + b + '")'])).toBe('path("' + interpolate(0.5, [0, 1], [a, b]) + '")');
  });

  it('matchPaths(): each output is within 0.05 px of its input by getTotalLength(), and the first path by getPointAtLength() at ten fractions', async () => {
    const { wf } = await load();
    const { matchPaths } = wf.kinetic;
    const CASES = [
      'm10 20 l30 0 40 10 v40 h-30 z m5 5 l10 10',
      'M 10 10 H 100 V 80 H 10 Z',
      'M 10 80 C 40 10, 65 10, 95 80 S 150 150, 180 80',
      'M 10 80 c 30 -70 55 -70 85 0 s 55 70 85 0',
      'M 10 80 Q 52.5 10 95 80 T 180 80',
      'm 10 80 q 42.5 -70 85 0 t 85 0',
      'M 10 80 A 45 45 0 0 1 100 80',
      'M 10 80 A 45 45 0 1 1 100 80',
      'M 20 100 A 60 25 30 1 0 140 60',
      'M 10 80 A 10 10 0 0 1 100 80',
      'M10 80a45 45 0 11100 0',
      'm 10 80 a 20 20 0 0 1 40 0 a 20 20 0 0 1 40 0 a 20 20 0 0 0 40 0',
      'M10-20L30.5.5-.5 3e1-1.5e1 40Z',
      'M 10 10 L 50 10 L 30 40 Z L 80 80 M 100 100 L 120 100 L 120 120 Z',
      'M 10 10 A 5 5 0 0 1 10 10 L 20 20',
      'M 10 10 A 0 5 0 0 1 50 50',
      SQUARE,
      CIRCLE,
    ];
    for (const d of CASES) {
      const [out] = matchPaths([d, d]);
      expect(Math.abs(lengthOf(out) - lengthOf(d)), d + ' -> ' + out).toBeLessThan(0.05);
      const pa = pointsOf(d), pb = pointsOf(out);
      pa.forEach((pt, i) => expect(Math.hypot(pt[0] - pb[i][0], pt[1] - pb[i][1]), d + ' at ' + i / 10).toBeLessThan(0.05));
    }
    // With alignment turning and restarting the later paths, each keeps its length.
    const ins = [SQUARE, CIRCLE_CCW, CIRCLE, 'M 0 -120 L 104 60 L -104 60 Z'];
    matchPaths(ins).forEach((out, i) => expect(Math.abs(lengthOf(out) - lengthOf(ins[i])), ins[i]).toBeLessThan(0.05));
  });

  it("matchPaths(): halfway from a square to a circle keeps more than half the square's area, either way the circle is drawn; align: false on a reversed circle makes a sliver", async () => {
    const { wf } = await load();
    const { matchPaths, interpolate } = wf.kinetic;
    const square = areaOf(SQUARE);
    expect(square).toBeCloseTo(40000, -2);
    for (const circle of [CIRCLE, CIRCLE_CCW]) {
      const mid = interpolate(0.5, [0, 1], matchPaths([SQUARE, circle]));
      expect(areaOf(mid), circle).toBeGreaterThan(square / 2);
    }
    const twisted = interpolate(0.5, [0, 1], matchPaths([SQUARE, CIRCLE_CCW], { align: false }));
    expect(areaOf(twisted)).toBeLessThan(square / 2);
    // Triangle to octagon at 24 segments: every frame of the morph keeps its area.
    const TRI = 'M 0 -120 L 104 60 L -104 60 Z';
    const OCT = 'M 0 -110 L 77.8 -77.8 L 110 0 L 77.8 77.8 L 0 110 L -77.8 77.8 L -110 0 L -77.8 -77.8 Z';
    const pair = matchPaths([TRI, OCT], { segments: 24 });
    expect(commands(pair[0])).toBe('M' + 'C'.repeat(24) + 'Z');
    const tri = areaOf(TRI);
    for (const p of [0.25, 0.5, 0.75]) expect(areaOf(interpolate(p, [0, 1], pair)), 'at ' + p).toBeGreaterThan(tri * 0.9);
  });

  it("matchPaths(): a path drawn the other way is reversed and started at the point nearest the first path's start; align: false leaves it as given", async () => {
    const { wf } = await load();
    const { matchPaths } = wf.kinetic;
    const [a, b] = matchPaths([SQUARE, CIRCLE_CCW]);
    expect(Math.sign(signedArea(b))).toBe(Math.sign(signedArea(a)));
    // The square starts at (-100, -100); the circle's nearest of its eight points is at 225 degrees.
    const start = (d) => ends(d)[0];
    expect(start(a)).toEqual([-100, -100]);
    expect(start(b)[0]).toBeCloseTo(-106.066, 2);
    expect(start(b)[1]).toBeCloseTo(-106.066, 2);
    const [c, d] = matchPaths([SQUARE, CIRCLE_CCW], { align: false });
    expect(Math.sign(signedArea(d))).toBe(-Math.sign(signedArea(c)));
    expect(start(d)).toEqual([150, 0]);
    // A circle already going the square's way is only restarted.
    const [, e] = matchPaths([SQUARE, CIRCLE]);
    expect(Math.sign(signedArea(e))).toBe(Math.sign(signedArea(a)));
    expect(start(e)[0]).toBeCloseTo(-106.066, 2);
  });

  it('matchPaths(): KN-100 for a different number of subpaths, path data the grammar rejects (with where), an empty path, one path, and segments that is not a whole number of 1 or more', async () => {
    const { wf } = await load();
    const { matchPaths } = wf.kinetic;
    // The where names the path, or the two that cannot be matched.
    expectKN(() => matchPaths([SQUARE, SQUARE + ' M 0 0 L 10 0 L 5 5 Z']), 'KN-100', 'matchPaths(paths[0], paths[1])', /^paths\[0\] has 1 subpath and paths\[1\] has 2;/);
    expectKN(() => matchPaths([SQUARE, 'M 0 0 L 10 X 5']), 'KN-100', 'matchPaths(paths[1])', /^paths\[1\] is not SVG path data; the path grammar rejects "X" at index 11/);
    expectKN(() => matchPaths([SQUARE, 'M 0 0 L 10']), 'KN-100', 'matchPaths(paths[1])', /^paths\[1\] is not SVG path data; it ends at index 10 in the middle of a command/);
    expectKN(() => matchPaths(['L 0 0 10 10', SQUARE]), 'KN-100', 'matchPaths(paths[0])', /^paths\[0\] is not SVG path data; the path grammar rejects "L" at index 0/);
    expectKN(() => matchPaths([SQUARE, 'path("M 0 0 L 1 x")']), 'KN-100', 'matchPaths(paths[1])', /^paths\[1\] is not SVG path data; the path grammar rejects "x" at index 16/);
    expectKN(() => matchPaths([SQUARE, '']), 'KN-100', 'matchPaths(paths[1])', /^paths\[1\] is empty/);
    expectKN(() => matchPaths([SQUARE, '  ']), 'KN-100', 'matchPaths(paths[1])', /^paths\[1\] is empty/);
    expectKN(() => matchPaths([SQUARE, 42]), 'KN-100', 'matchPaths(paths[1])', /^paths\[1\] is a string of path data or a path\("…"\) value, not 42/);
    expectKN(() => matchPaths([SQUARE]), 'KN-100', 'matchPaths(paths)', /^paths is an array of two or more paths, not \["M -100/);
    expectKN(() => matchPaths(SQUARE), 'KN-100', 'matchPaths(paths)', /two or more paths/);
    expectKN(() => matchPaths(), 'KN-100', 'matchPaths(paths)', /two or more paths/);
    for (const segments of [0, 2.5, -1, NaN, Infinity, '8', null]) {
      expectKN(() => matchPaths([SQUARE, CIRCLE], { segments }), 'KN-100', 'matchPaths(paths, { segments })', /^segments is a whole number, 1 or more, not /);
    }
    expect(() => matchPaths([SQUARE, CIRCLE], { segments: 1 })).not.toThrow();
  });

  it('shape() writes a number too large for four decimals as itself, never as Infinity', async () => {
    const { wf } = await load();
    const { shape } = wf.kinetic;
    const d = shape('polygon', { sides: 3, radius: 1e305 });
    expect(d).not.toMatch(/Infinity|NaN/);
    expect(d.startsWith('M 0 -1e+305 L ')).toBe(true);
    for (const v of d.split(' ').filter((s) => !/^[MLZ]$/.test(s))) expect(Number.isFinite(Number(v)), v).toBe(true);
  });

  it('shape(): a polygon, a star, a sector, a ring segment and an arrow, each path data with a finite length', async () => {
    const { wf } = await load();
    const { shape } = wf.kinetic;
    const hex = shape('polygon', { sides: 6, radius: 100, cx: 200, cy: 150 });
    expect(hex).toBe('M 200 50 L 286.6025 100 L 286.6025 200 L 200 250 L 113.3975 200 L 113.3975 100 Z');
    expect(lengthOf(hex)).toBeCloseTo(600, 1);
    // rotate turns it clockwise, in degrees; at 0 the first vertex points up.
    expect(shape('polygon', { sides: 4, radius: 100, rotate: 45 })).toBe('M 70.7107 -70.7107 L 70.7107 70.7107 L -70.7107 70.7107 L -70.7107 -70.7107 Z');
    const star = shape('star', { points: 5, outer: 100, inner: 40 });
    expect(commands(star)).toBe('M' + 'L'.repeat(9) + 'Z');
    expect(star.startsWith('M 0 -100 L 23.5114 -32.3607 L ')).toBe(true);
    expect(shape('star', { points: 2, outer: 10, inner: 2, cx: 5, cy: 5, rotate: 90 })).toBe('M 15 5 L 5 7 L -5 5 L 5 3 Z');
    // A quarter: the centre, up, and clockwise to the right, each arc in two
    // halves through its middle.
    const pie = shape('sector', { radius: 100, to: 90 });
    expect(pie).toBe('M 0 0 L 0 -100 A 100 100 0 0 1 70.7107 -70.7107 A 100 100 0 0 1 100 0 Z');
    expect(lengthOf(pie)).toBeCloseTo(200 + 50 * Math.PI, 1);
    expect(shape('sector', { radius: 100, from: 90, to: 360, cx: 10, cy: 10 })).toBe('M 10 10 L 110 10 A 100 100 0 0 1 -60.7107 80.7107 A 100 100 0 0 1 10 -90 Z');
    expect(lengthOf(shape('sector', { radius: 100, from: 90, to: 360 }))).toBeCloseTo(200 + 150 * Math.PI, 0);
    expect(shape('sector', { radius: 100, to: -90 })).toBe('M 0 0 L 0 -100 A 100 100 0 0 0 -70.7107 -70.7107 A 100 100 0 0 0 -100 0 Z');
    const ring = shape('sector', { radius: 100, inner: 60, from: 0, to: 90 });
    expect(ring).toBe('M 0 -100 A 100 100 0 0 1 70.7107 -70.7107 A 100 100 0 0 1 100 0 L 60 0 A 60 60 0 0 0 42.4264 -42.4264 A 60 60 0 0 0 0 -60 Z');
    expect(lengthOf(ring)).toBeCloseTo(80 + 80 * Math.PI, 1);
    const arrow = shape('arrow', { from: [0, 0], to: [200, 0], width: 20, head: 40 });
    expect(arrow).toBe('M 0 -10 L 160 -10 L 160 -40 L 200 0 L 160 40 L 160 10 L 0 10 Z');
    const down = shape('arrow', { from: [10, 10], to: [10, 110], width: 10, head: 20 });
    expect(down).toBe('M 15 10 L 15 90 L 30 90 L 10 110 L -10 90 L 5 90 L 5 10 Z');
    // An arrow shorter than its head is the head alone, as long as the arrow.
    expect(shape('arrow', { from: [0, 0], to: [10, 0], width: 4, head: 40 })).toBe('M 0 -2 L 0 -2 L 0 -10 L 10 0 L 0 10 L 0 2 L 0 2 Z');
    expect(shape('arrow', { from: [5, 5], to: [5, 5], width: 4, head: 8 })).toBe('');
    for (const d of [hex, star, pie, ring, arrow, down]) {
      const l = lengthOf(d);
      expect(Number.isFinite(l) && l > 0, d).toBe(true);
    }
  });

  // An arc whose end point is its start point is dropped by the SVG renderer,
  // so a sector sweeping toward 360 degrees used to collapse to its radius for
  // the frames where the end rounded onto the start: a pie flashed off just
  // before it closed. Each arc below a full turn is now two halves.
  it('shape(): a sector never collapses as it nears a full turn, either way round', async () => {
    const { wf } = await load();
    const { shape } = wf.kinetic;
    for (const to of [359.9, 359.99, 359.999, 359.9999, 359.99999, 359.999999, -359.99999]) {
      const pie = pathEl(shape('sector', { radius: 100, to }));
      const box = pie.getBBox();
      expect(Math.round(box.width), 'pie to ' + to).toBe(200);
      expect(Math.round(box.height), 'pie to ' + to).toBe(200);
      expect(pie.getTotalLength(), 'pie to ' + to).toBeCloseTo(200 * Math.PI + 200, 0);
      pie.remove();
      const ring = pathEl(shape('sector', { radius: 100, inner: 50, to }));
      const rbox = ring.getBBox();
      expect(Math.round(rbox.width), 'ring to ' + to).toBe(200);
      expect(Math.round(rbox.height), 'ring to ' + to).toBe(200);
      ring.remove();
    }
  });

  it('shape(): a sector at 0 degrees is empty, a full turn or more closes as two arcs, and a full ring keeps its hole', async () => {
    const { wf } = await load();
    const { shape } = wf.kinetic;
    expect(shape('sector', { radius: 100, from: 30, to: 30 })).toBe('');
    expect(shape('sector', { radius: 100, to: 0 })).toBe('');
    const full = shape('sector', { radius: 100, to: 360 });
    expect(full).toBe('M 0 -100 A 100 100 0 1 1 0 100 A 100 100 0 1 1 0 -100 Z');
    // The browser measures its own arcs to within a tenth of a pixel or so.
    expect(lengthOf(full)).toBeCloseTo(200 * Math.PI, 0);
    const p = pathEl(full);
    expect(p.isPointInFill(new DOMPoint(0, 0))).toBe(true);
    expect(p.isPointInFill(new DOMPoint(70, 70))).toBe(true);
    p.remove();
    expect(lengthOf(shape('sector', { radius: 100, from: 10, to: 400 }))).toBeCloseTo(200 * Math.PI, 0);
    expect(lengthOf(shape('sector', { radius: 100, to: -720 }))).toBeCloseTo(200 * Math.PI, 0);
    // Just short of a full turn: two halves, closed through the centre.
    expect(shape('sector', { radius: 100, to: 359 })).toBe('M 0 0 L 0 -100 A 100 100 0 0 1 0.8727 99.9962 A 100 100 0 0 1 -1.7452 -99.9848 Z');
    expect(lengthOf(shape('sector', { radius: 100, to: 359 }))).toBeCloseTo(200 + 200 * Math.PI * 359 / 360, 0);
    const ring = shape('sector', { radius: 100, inner: 50, to: 360 });
    expect(commands(ring)).toBe('MAAZMAAZ');
    const r = pathEl(ring);
    expect(r.isPointInFill(new DOMPoint(75, 0))).toBe(true);
    expect(r.isPointInFill(new DOMPoint(0, 0))).toBe(false);
    r.remove();
    expect(lengthOf(ring)).toBeCloseTo(300 * Math.PI, 0);
  });

  it('shape(): KN-100 for a count that is not whole, a missing option, a value that is not a finite number, a negative size, an inner at or above the radius, and an unknown kind', async () => {
    const { wf } = await load();
    const { shape } = wf.kinetic;
    expectKN(() => shape('polygon', { sides: 4.5, radius: 10 }), 'KN-100', "shape('polygon', { sides })", /^sides is a whole number, 3 or more, not 4\.5; a count does not interpolate, so morph between two counts with wildflower\.kinetic\.matchPaths\(\)/);
    expectKN(() => shape('polygon', { sides: 2, radius: 10 }), 'KN-100', "shape('polygon', { sides })", /sides is a whole number, 3 or more, not 2/);
    expectKN(() => shape('star', { points: 1.5, outer: 10, inner: 5 }), 'KN-100', "shape('star', { points })", /^points is a whole number, 2 or more, not 1\.5/);
    expectKN(() => shape('star', { points: 1, outer: 10, inner: 5 }), 'KN-100', "shape('star', { points })", /points is a whole number, 2 or more, not 1/);
    expectKN(() => shape('polygon', { radius: 10 }), 'KN-100', "shape('polygon', { sides })", /^sides is required, a whole number, 3 or more/);
    expectKN(() => shape('polygon', { sides: 5 }), 'KN-100', "shape('polygon', { radius })", /radius is required, a finite number/);
    expectKN(() => shape('star', { points: 5, outer: 10 }), 'KN-100', "shape('star', { inner })", /inner is required/);
    expectKN(() => shape('sector', { radius: 10 }), 'KN-100', "shape('sector', { to })", /^to is required/);
    expectKN(() => shape('arrow', { from: [0, 0], to: [10, 0], width: 2 }), 'KN-100', "shape('arrow', { head })", /^head is required/);
    expectKN(() => shape('arrow', { from: [0, 0], to: [10], width: 2, head: 4 }), 'KN-100', "shape('arrow', { to })", /to is \[x, y\], two finite numbers, not \[10\]/);
    expectKN(() => shape('arrow', { to: [10, 0], width: 2, head: 4 }), 'KN-100', "shape('arrow', { from })", /from is required, \[x, y\]/);
    expectKN(() => shape('polygon', { sides: 5, radius: NaN }), 'KN-100', "shape('polygon', { radius })", /radius is a finite number, not NaN/);
    expectKN(() => shape('sector', { radius: 10, to: 90, cx: '5' }), 'KN-100', "shape('sector', { cx })", /cx is a finite number, not "5"/);
    expectKN(() => shape('polygon', { sides: 5, radius: -10 }), 'KN-100', "shape('polygon', { radius })", /^radius is 0 or more, not -10/);
    expectKN(() => shape('star', { points: 5, outer: 10, inner: -1 }), 'KN-100', "shape('star', { inner })", /^inner is 0 or more, not -1/);
    expectKN(() => shape('arrow', { from: [0, 0], to: [10, 0], width: -2, head: 4 }), 'KN-100', "shape('arrow', { width })", /^width is 0 or more, not -2/);
    expectKN(() => shape('arrow', { from: [0, 0], to: [10, 0], width: 2, head: -4 }), 'KN-100', "shape('arrow', { head })", /^head is 0 or more, not -4/);
    expectKN(() => shape('sector', { radius: 10, inner: 10, to: 90 }), 'KN-100', "shape('sector', { inner })", /^inner is below the radius, not 10/);
    expectKN(() => shape('hexagon', { sides: 6 }), 'KN-100', 'shape(kind)', /^kind is 'polygon', 'star', 'sector' or 'arrow', not "hexagon"/);
    expectKN(() => shape(), 'KN-100', 'shape(kind)', /kind is 'polygon'/);
    expectKN(() => shape('polygon'), 'KN-100', "shape('polygon', { sides })", /sides is required/);
  });

  it('KN-122: an offsetDistance track given numbers with no unit warns in development, as the other lengths do', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, {
        keyframes: {
          mover: { offsetDistance: { at: [0, 1], to: [0, 100] } },
          fine: { offsetDistance: { at: [0, 1], to: [0, 100], unit: '%' } },
        },
      });
      wf.kinetic.styleAt(0.5, { 'offset-distance': { at: [0, 1], to: [0, 50] } });
    });
    // The warning's premise: the browser drops a bare number there.
    const i = document.createElement('i');
    i.style.offsetDistance = '50';
    expect(i.style.offsetDistance).toBe('');
    const kn = lines.filter((l) => l.includes('KN-122'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(2);
    expect(kn[0]).toContain("scene('" + name + "').keyframes.mover.offsetDistance");
    expect(kn[0]).toMatch(/offsetDistance takes a length, so the browser ignores a value such as 100/);
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/Suggestion: .*unit: 'px'.*'%'/);
    expect(kn[1]).toMatch(/styleAt\(\): the track 'offset-distance'/);
  });

  it('a scene with a morph, an element moving along a path and shapes from tracks passes check() with no console lines', async () => {
    const { wf } = await load();
    const { matchPaths, shape } = wf.kinetic;
    const name = uniqueName('paths');
    const MORPH = matchPaths([SQUARE, CIRCLE]);
    const lines = [];
    const saved = {};
    for (const k of ['log', 'info', 'warn', 'error']) { saved[k] = console[k]; console[k] = (...a) => lines.push(k + ': ' + a.map(String).join(' ')); }
    let report, host;
    try {
      wf.kinetic.scene(name, {
        keyframes: {
          morph: { at: [0.2, 1.6], to: MORPH, ease: 'power2.inOut' },
          mover: { offsetDistance: { at: [0, 1.9], to: [0, 100], unit: '%', ease: 'sine.inOut' } },
          inner: { at: [0, 1, 1.9], to: [20, 45, 20], ease: 'sine.inOut' },
          sweep: { at: [0, 1.9], to: [0, 360] },
        },
        computed: {
          star() { return shape('star', { points: 5, outer: 50, inner: this.inner, cx: 60, cy: 60 }); },
          pie() { return shape('sector', { radius: 40, to: this.sweep, cx: 60, cy: 60 }); },
        },
      });
      host = await mount(`<div data-composition-id="pk-check" data-start="0" data-duration="2" data-fps="10" style="position: relative; width: 320px; height: 320px">
        <div data-component="${name}" data-start="0">
          <svg viewBox="-160 -160 320 320" width="320" height="320"><path class="morph" data-bind-attr="{ d: morph }"></path><path class="star" data-bind-attr="{ d: star }"></path><path class="pie" data-bind-attr="{ d: pie }"></path></svg>
          <div class="mover" style="position: absolute; left: 0; top: 0; width: 10px; height: 10px; offset-path: path('M 0 0 C 100 0 100 100 200 100')" data-bind-style="mover"></div>
        </div></div>`);
      cleanup.push(host);
      await wf.kinetic.ready();
      report = await wf.kinetic.check({ samples: 20 });
    } finally {
      for (const k in saved) console[k] = saved[k];
      wf.unregister(name);
    }
    expect(report).toEqual({ ok: true, frames: 20, samples: 20, ready: 'true', errors: 0 });
    expect(lines).toEqual([]);
  });

  // The browser's point at a length, and how far apart two points are.
  const atLength = (d, s) => { const p = pathEl(d); const q = p.getPointAtLength(s); p.remove(); return [q.x, q.y]; };
  const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ends = (d) => { const pts = pointsOf(d, 1); return [pts[0], pts[1]]; };

  it('trimPath: the stretch from one fraction of the length to another, as path data the browser measures to match', async () => {
    const { wf } = await load();
    const { trimPath } = wf.kinetic;
    const CURVE = 'M0 0 C 50 -80 150 80 200 0';
    const L = lengthOf(CURVE);
    const mid = trimPath(CURVE, 0.25, 0.75);
    expect(mid).toMatch(/^M [-\d.]+ [-\d.]+ C /);
    expect(lengthOf(mid) / L).toBeCloseTo(0.5, 2);
    const [a, b] = ends(mid);
    expect(apart(a, atLength(CURVE, 0.25 * L))).toBeLessThan(0.5);
    expect(apart(b, atLength(CURVE, 0.75 * L))).toBeLessThan(0.5);
    // From the start: the stroke as geometry, which can fill.
    const first = trimPath(CURVE, 0, 0.4);
    expect(apart(ends(first)[0], [0, 0])).toBeLessThan(1e-6);
    expect(apart(ends(first)[1], atLength(CURVE, 0.4 * L))).toBeLessThan(0.5);
    // Clamped to 0..1; from at or past to is no path.
    expect(trimPath(CURVE, -1, 2)).toBe(trimPath(CURVE, 0, 1));
    expect(trimPath(CURVE, 0.5, 0.5)).toBe('');
    expect(trimPath(CURVE, 0.7, 0.2)).toBe('');
    // A path("…") value comes back in the same form.
    expect(trimPath('path("' + CURVE + '")', 0, 0.4)).toBe('path("' + first + '")');
    // Trimmed to nothing, a path("…") value is a lone move, which draws nothing
    // as a d and clips everything as a clip-path; '' would take the style off.
    expect(trimPath('path("' + CURVE + '")', 0.5, 0.5)).toBe('path("M 0 0")');
    expect(trimPath("path('" + CURVE + "')", 0, 0)).toBe("path('M 0 0')");
    const box = document.createElement('div');
    box.style.cssText = 'width:100px;height:100px';
    box.style.clipPath = trimPath('path("M 0 0 L 100 0 L 100 100 Z")', 0, 0);
    expect(box.style.clipPath).not.toBe('');
  });

  it("trimPath: by segment, each segment an equal share and the curve's own parameter inside it; subpaths keep their moves; a closed subpath whole keeps its Z", async () => {
    const { wf } = await load();
    const { trimPath } = wf.kinetic;
    const ELL = 'M0 0 L100 0 L100 300';   // segments of 100 and 300
    expect(apart(ends(trimPath(ELL, 0, 0.5))[1], [100, 100])).toBeLessThan(0.01);
    expect(apart(ends(trimPath(ELL, 0, 0.5, { by: 'segment' }))[1], [100, 0])).toBeLessThan(1e-6);
    expect(apart(ends(trimPath(ELL, 0, 0.75, { by: 'segment' }))[1], [100, 150])).toBeLessThan(1e-6);
    expect(trimPath(ELL, 0, 0.5, { by: 'length' })).toBe(trimPath(ELL, 0, 0.5));
    // Two subpaths: the stretch crosses into the second with a move of its own.
    const TWO = trimPath('M0 0 H100 M0 50 H100', 0.25, 0.75);
    expect(TWO.match(/M /g).length).toBe(2);
    expect(TWO).toMatch(/^M 50 0 C .* M 0 50 C .* 50 50$/);
    // A closed square: whole, it keeps its Z; cut partway, it leaves the Z off.
    const SQ = 'M0 0 H100 V100 H0 Z';
    expect(trimPath(SQ, 0, 1)).toMatch(/ Z$/);
    const half = trimPath(SQ, 0, 0.5);
    expect(half).not.toMatch(/Z/);
    expect(apart(ends(half)[1], [100, 100])).toBeLessThan(0.01);
  });

  it('trimPath: the band form closes the stretch of two edges, the bottom turned round when it runs the other way', async () => {
    const { wf } = await load();
    const { trimPath } = wf.kinetic;
    const TOP = 'M0 0 C 50 0 50 100 100 100', BOTTOM = 'M0 20 C 50 20 50 120 100 120';
    const band = trimPath([TOP, BOTTOM], 0, 0.5);
    expect(band).toMatch(/^M 0 0 C .* L [-\d.]+ [-\d.]+ C .* 0 20 Z$/);
    // The bottom written right to left gives the same band.
    expect(trimPath([TOP, 'M100 120 C 50 120 50 20 0 20'], 0, 0.5)).toBe(band);
    // Whole, the band's area is its width, 20, times its run, 100.
    expect(areaOf(trimPath([TOP, BOTTOM], 0, 1))).toBeCloseTo(2000, -1);
    expect(trimPath([TOP, BOTTOM], 0.6, 0.6)).toBe('');
  });

  it("pathLength: a path's length, as the browser measures it, for path data or a path(\"…\") value", async () => {
    const { wf } = await load();
    const { pathLength, trimPath } = wf.kinetic;
    for (const d of ['M0 0 H100', 'M0 0 C 50 -80 150 80 200 0', 'M0 0 H100 V100 H0 Z', 'M0 0 H10 M0 50 A 40 40 0 0 1 80 50']) {
      expect(Math.abs(pathLength(d) / lengthOf(d) - 1), d).toBeLessThan(0.002);
    }
    expect(pathLength('M0 0 H100')).toBeCloseTo(100, 6);
    expect(pathLength('path("M0 0 H100")')).toBeCloseTo(100, 6);
    // A distance along the path as a fraction for trimPath().
    const D = 'M0 0 L100 0 L100 300';
    expect(apart(ends(trimPath(D, 0, 150 / pathLength(D)))[1], [100, 50])).toBeLessThan(0.01);
    expectKN(() => pathLength(5), 'KN-100', 'pathLength(d)', /^d is SVG path data or a path\("…"\) value/);
    expectKN(() => pathLength('M0 0 X'), 'KN-100', 'pathLength(d)', /grammar/);
  });

  it('trimPath: many distinct paths a frame, by segment or by length, keep their answers as the kept measures turn over', async () => {
    const { wf } = await load();
    const { trimPath } = wf.kinetic;
    // More paths than are kept, each cut twice in turn: the second pass must match the first.
    const paths = Array.from({ length: 90 }, (_, i) => 'M0 ' + i + ' Q 50 ' + (i - 80) + ' 100 ' + i);
    for (const by of ['segment', 'length']) {
      const first = paths.map((d) => trimPath(d, 0, 0.6, { by }));
      const second = paths.map((d) => trimPath(d, 0, 0.6, { by }));
      expect(second, by).toEqual(first);
    }
  });

  it('trimPath: KN-100 for d that is no path data, a from or to that is not finite, an unknown by, and band edges that are not two one-subpath paths', async () => {
    const { wf } = await load();
    const { trimPath } = wf.kinetic;
    expectKN(() => trimPath(5, 0, 1), 'KN-100', 'trimPath(d)', /^d is SVG path data, a path\("…"\) value, or \[top, bottom\]/);
    expectKN(() => trimPath('M0 0 X 5', 0, 1), 'KN-100', 'trimPath(d)', /grammar/);
    expectKN(() => trimPath('', 0, 1), 'KN-100', 'trimPath(d)');
    expectKN(() => trimPath('M0 0 H10', NaN, 1), 'KN-100', 'trimPath(d, from, to)', /^from and to are finite numbers/);
    expectKN(() => trimPath('M0 0 H10', 0, '1'), 'KN-100', 'trimPath(d, from, to)');
    expectKN(() => trimPath('M0 0 H10', 0, 1, { by: 'time' }), 'KN-100', 'trimPath(d, from, to, { by })', /'length' or 'segment'/);
    expectKN(() => trimPath(['M0 0 H10', 3], 0, 1), 'KN-100', 'trimPath([top, bottom])');
    expectKN(() => trimPath(['M0 0 H10'], 0, 1), 'KN-100', 'trimPath([top, bottom])');
    expectKN(() => trimPath(['M0 0 H10 M0 5 H10', 'M0 20 H10'], 0, 1), 'KN-100', 'trimPath([top, bottom])', /one subpath/);
  });
});
