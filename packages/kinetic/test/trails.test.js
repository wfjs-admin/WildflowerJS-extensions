/**
 * trails(kind, at, options): marks left by a mover, each a pure function of
 * the time, so every frame seeks. 'ghosts' are copies of the element at
 * earlier times, fading and shrinking; 'ribbon' is the stretch of its path
 * just behind it; 'dots' are marks along its path, past once it has gone by.
 */
import { describe, it, expect } from 'vitest';
import { load, expectKN, BUILD, CORE_TIER } from './helpers.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

describe(`trails() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("ghosts: copy k styled at t - k * lag, its opacity the style's times 1 - fade * k / count, normal blending", async () => {
    const { wf } = await load();
    const { trails, styleAt } = wf.kinetic;
    const TRACKS = { translateX: { at: [0, 1], to: [0, 100] }, opacity: 0.8 };
    const rows = trails('ghosts', 0.5, { style: TRACKS, count: 4, lag: 0.1, fade: 0.8 });
    expect(rows.map((r) => [r.key, r.k])).toEqual([[1, 1], [2, 2], [3, 3], [4, 4]]);
    rows.forEach((r) => {
      expect(near(r.t, 0.5 - r.k * 0.1), 'copy ' + r.k + "'s time").toBe(true);
      expect(r.style.transform).toBe(styleAt(r.t, TRACKS).transform);
      expect(near(r.style.opacity, 0.8 * (1 - 0.8 * r.k / 4)), 'copy ' + r.k + "'s opacity").toBe(true);
      expect(r.style.mixBlendMode).toBeUndefined();
    });
    // The same in a render with a shutter: no rule of smear()'s.
    const store = wf.getStore('kinetic');
    const before = store.shutter;
    try { store.shutter = 180; expect(trails('ghosts', 0.5, { style: TRACKS, count: 4, lag: 0.1, fade: 0.8 })).toEqual(rows); } finally { store.shutter = before; }
  });

  it('ghosts: a style function, and scale shrinking each copy by scale * k after its own transform; the defaults', async () => {
    const { wf } = await load();
    const { trails } = wf.kinetic;
    const seen = [];
    const rows = trails('ghosts', 1, { style: (s) => { seen.push(s); return { transform: 'translateX(' + s * 100 + 'px)' }; }, count: 3, lag: 0.25, fade: 0.6, scale: 0.1 });
    expect(seen.map((s) => Math.round(s * 100) / 100)).toEqual([0.75, 0.5, 0.25]);
    expect(rows[0].style.transform).toBe('translateX(75px) scale(0.9)');
    expect(rows[2].style.transform).toBe('translateX(25px) scale(0.7)');
    expect(near(rows[0].style.opacity, 1 - 0.6 / 3)).toBe(true);
    // A style with no transform gets the scale alone; the object returned is left as it was.
    const own = { color: 'red' };
    const plain = trails('ghosts', 0, { style: () => own, count: 1, scale: 0.5 });
    expect(plain[0].style).toEqual({ color: 'red', transform: 'scale(0.5)', opacity: 1 - 0.8 });
    expect(own).toEqual({ color: 'red' });
    // Defaults: 6 copies, 0.04 s apart, fading by 0.8, no shrink.
    const d = trails('ghosts', 1, { style: () => ({}) });
    expect(d.length).toBe(6);
    expect(near(d[5].t, 1 - 6 * 0.04)).toBe(true);
    expect(near(d[5].style.opacity, 1 - 0.8)).toBe(true);
    expect(d[0].style.transform).toBeUndefined();
  });

  it("ribbon: trimPath() of the path from u - length to u, by length or by segment", async () => {
    const { wf } = await load();
    const { trails, trimPath } = wf.kinetic;
    const D = 'M0 0 C 50 -80 150 80 200 0';
    expect(trails('ribbon', 0.6, { d: D, length: 0.2 })).toBe(trimPath(D, 0.6 - 0.2, 0.6));
    expect(trails('ribbon', 0.6, { d: D })).toBe(trimPath(D, 0.6 - 0.1, 0.6));
    expect(trails('ribbon', 0.05, { d: D, length: 0.2 })).toBe(trimPath(D, 0, 0.05));
    expect(trails('ribbon', 0.6, { d: D, length: 0.2, by: 'segment' })).toBe(trimPath(D, 0.6 - 0.2, 0.6, { by: 'segment' }));
    expect(trails('ribbon', 0, { d: D })).toBe('');
  });

  it("dots: count marks evenly along the path, each past once u reaches it, with distribute()'s fields", async () => {
    const { wf } = await load();
    const { trails } = wf.kinetic;
    const dots = trails('dots', 0.5, { d: 'M0 0 H100', count: 5 });
    expect(dots.map((p) => [p.i, p.key, Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4, p.u, p.state])).toEqual([
      [0, 0, 0, 0, 0, 'past'], [1, 1, 25, 0, 0.25, 'past'], [2, 2, 50, 0, 0.5, 'past'], [3, 3, 75, 0, 0.75, 'future'], [4, 4, 100, 0, 1, 'future'],
    ]);
    expect(dots.every((p) => near(p.heading, 0))).toBe(true);
    // By segment on an L of 100 and 300: the middle dot at the corner; by length, 200 along it.
    const ELL = 'M0 0 L100 0 L100 300';
    const seg = trails('dots', 1, { d: ELL, count: 3, by: 'segment' });
    expect(seg.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[0, 0], [100, 0], [100, 300]]);
    expect(near(seg[2].heading, 90)).toBe(true);
    const len = trails('dots', 1, { d: ELL, count: 3 });
    expect(len.map((p) => [Math.round(p.x), Math.round(p.y)])).toEqual([[0, 0], [100, 100], [100, 300]]);
    // One dot sits at the start.
    expect(trails('dots', 0, { d: ELL, count: 1 }).map((p) => [p.x, p.y, p.state])).toEqual([[0, 0, 'past']]);
  });

  it('KN-100 for an unknown kind, a time or place that is not finite, and a missing or bad option, naming it', async () => {
    const { wf } = await load();
    const { trails } = wf.kinetic;
    expectKN(() => trails('echo', 0, {}), 'KN-100', 'trails(kind)', /^kind is 'ghosts', 'ribbon' or 'dots', not "echo"/);
    expectKN(() => trails('ghosts', NaN, { style: () => ({}) }), 'KN-100', "trails('ghosts', t)");
    expectKN(() => trails('ribbon', Infinity, { d: 'M0 0 H1' }), 'KN-100', "trails('ribbon', u)", /^u is the mover's place along the path/);
    expectKN(() => trails('ghosts', 0, {}), 'KN-100', "trails('ghosts', t, { style })", /^style is an object of tracks, as styleAt\(\) takes, or a function of the time/);
    expectKN(() => trails('ghosts', 0, { style: () => 5 }), 'KN-100', "trails('ghosts', t, { style })", /returns a style object, not 5/);
    expectKN(() => trails('ghosts', 0, { style: () => ({}), count: 0 }), 'KN-100', "trails('ghosts', t, { count })");
    expectKN(() => trails('ghosts', 0, { style: () => ({}), count: 1.5 }), 'KN-100', "trails('ghosts', t, { count })");
    expectKN(() => trails('ghosts', 0, { style: () => ({}), lag: -1 }), 'KN-100', "trails('ghosts', t, { lag })");
    expectKN(() => trails('ghosts', 0, { style: () => ({}), fade: 2 }), 'KN-100', "trails('ghosts', t, { fade })");
    expectKN(() => trails('ghosts', 0, { style: () => ({}), scale: -0.1 }), 'KN-100', "trails('ghosts', t, { scale })");
    expectKN(() => trails('ribbon', 0.5, {}), 'KN-100', "trails('ribbon', u, { d })", /^d is SVG path data/);
    expectKN(() => trails('ribbon', 0.5, { d: 'M0 0 H1', length: 0 }), 'KN-100', "trails('ribbon', u, { length })");
    expectKN(() => trails('dots', 0.5, { d: 'M0 0 H1', count: 0 }), 'KN-100', "trails('dots', u, { count })");
    expectKN(() => trails('dots', 0.5, { d: 'M0 0 H1', by: 'time' }), 'KN-100', "trails('dots', u, { by })");
  });
});
