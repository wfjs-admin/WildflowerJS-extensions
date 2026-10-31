/**
 * bakeOutlines(font, options): a variable font's outlines for a set of
 * characters, as the data Kinetic's text() draws from. `font` is a font
 * read by fontkit (fontkit.create(bytes) in a page, fontkit.openSync(path)
 * in Node); this file reads no font itself, so it runs in either.
 *
 * A variable font's outline at any setting of its axes is a blend of a few
 * stored shapes, linear between them once each axis's value is mapped
 * through the font's avar table. So each glyph is kept at a few stops on
 * each axis, in that mapped space (n from -1 to 1), and text() blends the
 * two stops either side: a stop at each end and the default, and more
 * wherever the blend of two stops misses the font's own outline between
 * them by more than `tolerance` font units (2), found by splitting the span
 * in half until it does not. With two axes the glyphs are kept on the grid
 * of both axes' stops, and the cells' centres are checked too.
 *
 * Returns:
 *   { format: 1, family, upm, ascender, descender, capHeight, xHeight,
 *     axes: [{ tag, min, default, max, avar: [[from, to], ...], stops: [n, ...] }],
 *     glyphs: { ch: { cmds: 'MLQCZ...', adv: [...], pts: [[...], ...] } },
 *     kern: { pair: [...] }, missing: [ch, ...], error }
 *
 * adv, pts and kern hold one entry per grid point, the first axis's stops
 * varying slowest; pts are the commands' numbers with y pointing down;
 * kern holds the pairs that kern at the default setting or at a corner of
 * the grid; error is the largest miss found at the checks (quarter points
 * of each span and the centres of the cells), in font units.
 */

const COMMANDS = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' };

export function bakeOutlines(font, options) {
  const o = Object.assign({ chars: '', axes: ['wght', 'slnt'], tolerance: 2 }, options || {});
  const all = font.variationAxes || {};
  const order = Object.keys(all);
  const segs = font.avar && font.avar.segment ? font.avar.segment : [];
  const axes = o.axes.filter((tag) => all[tag]).map((tag) => {
    const a = all[tag], i = order.indexOf(tag);
    const avar = segs[i] && segs[i].correspondence && segs[i].correspondence.length
      ? segs[i].correspondence.map((c) => [round4(c.fromCoord), round4(c.toCoord)])
      : [[-1, -1], [0, 0], [1, 1]];
    return { tag, min: a.min, default: a.default, max: a.max, avar, stops: [] };
  });
  const chars = Array.from(new Set(Array.from(o.chars)));
  const ids = {}, missing = [];
  for (const ch of chars) {
    const g = font.glyphForCodePoint(ch.codePointAt(0));
    if (!g || !g.id) missing.push(ch); else ids[ch] = g.id;
  }
  const kept = chars.filter((ch) => ids[ch] !== undefined);

  // The user value of an axis for a mapped n, through the inverse of avar.
  const userOf = (ax, n) => {
    const s = ax.avar;
    let u = n;
    for (let i = 1; i < s.length; i++) {
      if (n <= s[i][1] || i === s.length - 1) {
        const [a0, b0] = s[i - 1], [a1, b1] = s[i];
        u = b1 === b0 ? a0 : a0 + ((a1 - a0) * (n - b0)) / (b1 - b0);
        break;
      }
    }
    return u < 0 ? ax.default + u * (ax.default - ax.min) : ax.default + u * (ax.max - ax.default);
  };
  // An instance of the font at mapped values, one per axis, kept.
  const instances = new Map();
  const instance = (ns) => {
    const key = ns.join(',');
    let f = instances.get(key);
    if (!f) {
      const at = {};
      axes.forEach((ax, k) => { at[ax.tag] = userOf(ax, ns[k]); });
      f = axes.length ? font.getVariation(at) : font;
      instances.set(key, f);
    }
    return f;
  };
  const outline = (ns, ch) => {
    const g = instance(ns).getGlyph(ids[ch]);
    return {
      cmds: g.path.commands.map((c) => COMMANDS[c.command]).join(''),
      nums: g.path.commands.flatMap((c) => c.args.map((v, j) => (j % 2 ? -v : v))),
      adv: g.advanceWidth,
    };
  };
  // How far the blend of two outlines misses the font's own, at the
  // quarter points of the span between them, over every character.
  const miss = (lo, hi) => {
    let worst = 0;
    for (const ch of kept) {
      const a = outline(lo, ch).nums, b = outline(hi, ch).nums;
      for (const t of [0.25, 0.5, 0.75]) {
        const at = lo.map((v, k) => v + (hi[k] - v) * t);
        const m = outline(at, ch).nums;
        for (let i = 0; i < m.length; i++) worst = Math.max(worst, Math.abs(a[i] + (b[i] - a[i]) * t - m[i]));
      }
    }
    return worst;
  };
  let error = 0;
  axes.forEach((ax, k) => {
    const base = axes.map(() => 0);
    const at = (n) => { const v = base.slice(); v[k] = n; return v; };
    const stops = new Set([0]);
    if (ax.min < ax.default) stops.add(-1);
    if (ax.max > ax.default) stops.add(1);
    const split = (lo, hi, depth) => {
      const e = miss(at(lo), at(hi));
      if (e <= o.tolerance || depth >= 6) { error = Math.max(error, e); return; }
      const mid = (lo + hi) / 2;
      stops.add(mid);
      split(lo, mid, depth + 1);
      split(mid, hi, depth + 1);
    };
    const list = Array.from(stops).sort((a, b) => a - b);
    for (let i = 1; i < list.length; i++) split(list[i - 1], list[i], 0);
    ax.stops = Array.from(stops).sort((a, b) => a - b).map(round4);
  });

  // The grid of every axis's stops, the first axis varying slowest.
  const grid = axes.reduce((acc, ax) => acc.flatMap((p) => ax.stops.map((n) => p.concat([n]))), [[]]);
  // With two axes, the centre of each cell against the blend of its corners.
  if (axes.length === 2) {
    const [A, B] = axes;
    for (let i = 1; i < A.stops.length; i++) {
      for (let j = 1; j < B.stops.length; j++) {
        const c = [[A.stops[i - 1], B.stops[j - 1]], [A.stops[i], B.stops[j - 1]], [A.stops[i - 1], B.stops[j]], [A.stops[i], B.stops[j]]];
        const mid = [(c[0][0] + c[1][0]) / 2, (c[0][1] + c[2][1]) / 2];
        for (const ch of kept) {
          const q = c.map((p) => outline(p, ch).nums), m = outline(mid, ch).nums;
          for (let n = 0; n < m.length; n++) error = Math.max(error, Math.abs((q[0][n] + q[1][n] + q[2][n] + q[3][n]) / 4 - m[n]));
        }
      }
    }
  }

  const glyphs = {};
  for (const ch of kept) {
    const first = outline(grid[0], ch);
    const g = { cmds: first.cmds, adv: [], pts: [] };
    for (const p of grid) {
      const v = outline(p, ch);
      if (v.cmds !== first.cmds) throw new Error('"' + ch + '" changes its commands across the axes, so it cannot be blended');
      g.adv.push(Math.round(v.adv));
      g.pts.push(v.nums.map(Math.round));
    }
    glyphs[ch] = g;
  }

  // Kerning: each pair laid out at the default setting and at the grid's
  // corners (every axis at an end), and a pair that kerns at any of them
  // kept at every grid point.
  const kern = {};
  const lay = (f, pair) => {
    const run = f.layout(pair);
    return run.positions.length === 2 ? Math.round(run.positions[0].xAdvance - run.glyphs[0].advanceWidth) : 0;
  };
  const ends = axes.reduce((acc, ax) => acc.flatMap((p) => [ax.stops[0], ax.stops[ax.stops.length - 1]].map((n) => p.concat([n]))), [[]]);
  const probes = [axes.map(() => 0)].concat(ends).map(instance);
  for (const a of kept) {
    for (const b of kept) {
      const pair = a + b;
      if (!probes.some((f) => lay(f, pair))) continue;
      kern[pair] = grid.map((p) => lay(instance(p), pair));
    }
  }

  const os2 = font['OS/2'] || {};
  return {
    format: 1,
    family: font.familyName,
    upm: font.unitsPerEm,
    ascender: font.ascent,
    descender: font.descent,
    capHeight: os2.capHeight || font.capHeight || Math.round(font.unitsPerEm * 0.7),
    xHeight: os2.xHeight || font.xHeight || Math.round(font.unitsPerEm * 0.5),
    axes,
    glyphs,
    kern,
    missing,
    error: Math.round(error * 10) / 10,
  };
}

function round4(v) { return Math.round(v * 1e4) / 1e4; }
