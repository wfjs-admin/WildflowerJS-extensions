/**
 * Line boil: boil(d, options) moves path data along its normals by stepped
 * noise; effect(canvas, { kind: 'boil' }) moves a source's pixels. The
 * path's points are read back, and the effect's pixels compared with its
 * source.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, dispatchSeek, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const handles = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const h of handles.splice(0)) h.dispose();
  for (const el of cleanup.splice(0)) el.remove();
});

async function stage(id, inner = '') {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="2" data-fps="10" data-width="200" data-height="100" style="position:relative;width:200px;height:100px">${inner}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return { wf, host };
}

// A path's points, from the M and L commands boil() writes.
const points = (d) => Array.from(d.matchAll(/[ML] (-?[\d.e-]+) (-?[\d.e-]+)/g), (m) => [+m[1], +m[2]]);
const CIRCLE = 'M 100 10 A 40 40 0 1 1 99.99 10 Z';

describe(`line boil (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('boil(): every point within amount of the outline, the same within a step and new on the next, closed as the path was', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const a = k.boil(CIRCLE, { amount: 3, scale: 20, fps: 4, t: 0.1 });
    expect(a.startsWith('M ')).toBe(true);
    expect(a.endsWith(' Z')).toBe(true);
    const pts = points(a);
    expect(pts.length).toBeGreaterThan(100);
    const off = pts.map(([x, y]) => Math.hypot(x - 100, y - 50) - 40);
    expect(Math.max(...off.map(Math.abs))).toBeLessThan(3.05);
    expect(Math.max(...off) - Math.min(...off)).toBeGreaterThan(1);
    expect(k.boil(CIRCLE, { amount: 3, scale: 20, fps: 4, t: 0.2 })).toBe(a);
    expect(k.boil(CIRCLE, { amount: 3, scale: 20, fps: 4, t: 0.3 })).not.toBe(a);
    // With no fps the seed holds at every time.
    expect(k.boil(CIRCLE, { amount: 3, t: 0.1 })).toBe(k.boil(CIRCLE, { amount: 3, t: 1.9 }));
    // amount 0 leaves the outline where it was; an open path stays open.
    expect(Math.max(...points(k.boil(CIRCLE, { amount: 0 })).map(([x, y]) => Math.abs(Math.hypot(x - 100, y - 50) - 40)))).toBeLessThan(0.05);
    expect(k.boil('M 0 0 L 100 0', { amount: 2 }).endsWith('Z')).toBe(false);
  });

  it('boil(): delay holds the first seed for its seconds of t, then steps fps times a second from it', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const at = (t) => k.boil(CIRCLE, { amount: 3, scale: 20, fps: 4, delay: 1, t });
    const first = k.boil(CIRCLE, { amount: 3, scale: 20, t: 0 });
    // Through the delay the outline is the seed's own, where a step would have moved it.
    for (const t of [0, 0.3, 0.6, 0.99]) expect(at(t)).toBe(first);
    expect(k.boil(CIRCLE, { amount: 3, scale: 20, fps: 4, t: 0.3 })).not.toBe(first);
    // The first step a quarter of a second after the delay, as effect(), shade() and blur() step.
    expect(at(1.2)).toBe(first);
    expect(at(1.3)).not.toBe(first);
    expect(at(1.3)).toBe(k.boil(CIRCLE, { amount: 3, scale: 20, fps: 4, t: 0.3 }));
  });

  it('boil(): the closed outline has no jump where it closes', async () => {
    const { wf } = await load();
    const pts = points(wf.kinetic.boil(CIRCLE, { amount: 4, scale: 15, detail: 1 }));
    const gap = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    let most = 0;
    for (let i = 1; i < pts.length; i++) most = Math.max(most, gap(pts[i - 1], pts[i]));
    expect(gap(pts[pts.length - 1], pts[0])).toBeLessThan(most * 1.5);
  });

  it("effect(canvas, { kind: 'boil' }): the source's pixels moved by up to amount; amount 0 is the source", async () => {
    const { wf, host } = await stage('bo2', '<canvas id="fx" style="position:absolute;left:0;top:0;width:200px;height:100px"></canvas>');
    const src = document.createElement('canvas');
    src.width = 200; src.height = 100;
    const g = src.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 100);
    g.fillStyle = '#000'; g.fillRect(50, 20, 100, 60);
    const canvas = host.querySelector('#fx');
    const fx = wf.kinetic.effect(canvas, { source: src, kind: 'boil', amount: 0 });
    handles.push(fx);
    // The box's left edge, row by row: the first dark pixel.
    const edges = () => {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(canvas, 0, 0, 200, 100);
      const out = [];
      for (let y = 30; y < 70; y += 2) {
        const d = x.getImageData(30, y, 60, 1).data;
        let e = -1;
        for (let i = 0; i < 60; i++) if (d[i * 4] < 128) { e = i; break; }
        out.push(e);
      }
      return out;
    };
    await dispatchSeek(0.1).done;
    expect(new Set(edges())).toEqual(new Set([20]));
    fx.set({ amount: 4, scale: 15 });
    await dispatchSeek(0.2).done;
    const e = edges();
    expect(Math.max(...e) - Math.min(...e)).toBeGreaterThan(1);
    expect(Math.max(...e.map((v) => Math.abs(v - 20)))).toBeLessThanOrEqual(5);
  });

  it('KN-100 for a bad call', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    expectKN(err(() => k.boil(5)), 'KN-100', 'boil(d)', /^d is SVG path data/);
    expectKN(err(() => k.boil(document.body)), 'KN-100', 'boil(d)', /effect\(\)'s boil kind/);
    expectKN(err(() => k.boil('M 0 0 Q', {})), 'KN-100', 'boil(d)', /grammar stops/);
    expectKN(err(() => k.boil(CIRCLE, 3)), 'KN-100', 'boil(d, options)', /^options is an object/);
    expectKN(err(() => k.boil(CIRCLE, { amount: -1 })), 'KN-100', 'boil(d, { amount })', /^amount is a number, 0 or more/);
    expectKN(err(() => k.boil(CIRCLE, { scale: 0 })), 'KN-100', 'boil(d, { scale })', /^scale is a number of px above 0/);
    expectKN(err(() => k.boil(CIRCLE, { rough: 2 })), 'KN-100', 'boil(d, { rough })', /is not an option/);
    expectKN(err(() => k.boil(CIRCLE, { rate: 8 })), 'KN-100', 'boil(d, { rate })', /is not an option/);
    expectKN(err(() => k.boil(CIRCLE, { delay: -1 })), 'KN-100', 'boil(d, { delay })', /^delay is a number, 0 or more/);
    expect(k.boilPath).toBe(undefined);
  });
});
