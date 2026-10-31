/**
 * shade(canvas, { …, marks }): marks paint a density field, drawn as
 * stipple, halftone or dither in each mark's ink. The pixels are read from
 * the layer's canvas through a 2D copy: each mark's shape and falloff, the
 * data form of the marks, colour and opacity, the boil, the three freezes,
 * the kinds, effect()'s new stipple options (grade, speck, color), check()
 * on a scene with a layer, and the KN-100 cases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, dispatchSeek, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const scenesToDrop = [];
const handles = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const h of handles.splice(0)) h.dispose();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

// A stage with one 200 x 100 canvas for the layer.
async function stage(id, extra = '') {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="2" data-fps="10" data-width="200" data-height="100" style="position:relative;width:200px;height:100px">
    <canvas id="fx" style="position:absolute;left:0;top:0;width:200px;height:100px"></canvas>${extra}
  </div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return { wf, host, canvas: host.querySelector('#fx') };
}

// The layer's canvas read back. share(x0, x1, y0, y1) is the inked part of
// that box, in CSS px; at(x, y) a pixel as [r, g, b, a].
function read(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const s = canvas.width / (canvas.clientWidth || canvas.width);
  const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  return {
    at: (x, y) => px(Math.floor(x * s), Math.floor(y * s)),
    share(x0, x1, y0, y1) {
      let n = 0, hit = 0;
      for (let y = Math.floor(y0 * s); y < Math.floor(y1 * s); y++) for (let x = Math.floor(x0 * s); x < Math.floor(x1 * s); x++) { n++; if (px(x, y)[3] > 100) hit++; }
      return hit / n;
    },
    hash() { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; },
  };
}

async function layer(id, opts, marks, t = 0.1) {
  const { wf, canvas } = await stage(id);
  const h = wf.kinetic.shade(canvas, Object.assign({}, opts, { marks }));
  handles.push(h);
  await dispatchSeek(t).done;
  return { wf, canvas, h };
}

describe(`shade() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('band: dense at its line, none past its width, on both sides or one', async () => {
    const line = (side) => (m) => m.band({ from: [0, 50], to: [200, 50], width: 40, side });
    const both = read((await layer('sh1', {}, line('both'))).canvas);
    expect(both.share(0, 200, 48, 52)).toBeGreaterThan(0.85);
    expect(both.share(0, 200, 0, 8)).toBe(0);
    expect(both.share(0, 200, 92, 100)).toBe(0);
    expect(both.share(0, 200, 25, 35)).toBeGreaterThan(0.2);
    expect(both.share(0, 200, 65, 75)).toBeGreaterThan(0.2);
    // Walking left to right, the left is up.
    const left = read((await layer('sh2', {}, line('left'))).canvas);
    expect(left.share(0, 200, 25, 35)).toBeGreaterThan(0.2);
    expect(left.share(0, 200, 55, 100)).toBe(0);
  });

  it('glow: dense at its point, none past its radius; inverted, none at its point and full past it, inside its clip', async () => {
    const out = read((await layer('sh3', {}, (m) => m.glow({ at: [100, 50], radius: 40 }))).canvas);
    expect(out.share(96, 104, 46, 54)).toBeGreaterThan(0.85);
    expect(out.share(0, 50, 0, 100)).toBe(0);
    const inv = read((await layer('sh4', {}, (m) => m.glow({ at: [100, 50], radius: 40, invert: true, clip: { circle: [100, 50, 48] } }))).canvas);
    // Within 3 px of the point the density is under a tenth.
    expect(inv.share(97, 103, 47, 53)).toBeLessThan(0.15);
    expect(inv.share(140, 146, 47, 53)).toBeGreaterThan(0.85);
    expect(inv.share(0, 40, 0, 100)).toBe(0);
  });

  it('edge: dense inside the outline of a rectangle or a circle, thin toward the middle, none outside', async () => {
    // Each shape's top edge: the rectangle's at y 10, the circle's at y 5.
    for (const [id, clip, top] of [['sh5', { rect: [40, 10, 120, 80] }, 10], ['sh6', { circle: [100, 50, 45] }, 5]]) {
      const r = read((await layer(id, {}, (m) => m.edge({ width: 12, clip }))).canvas);
      expect(r.share(95, 105, top + 1, top + 3)).toBeGreaterThan(0.6);
      expect(r.share(95, 105, top + 1, top + 3)).toBeGreaterThan(r.share(95, 105, top + 8, top + 10));
      expect(r.share(90, 110, 40, 60)).toBe(0);
      expect(r.share(0, 30, 0, 100)).toBe(0);
    }
  });

  it('path: dense along its curve, none past its width, on both sides or one, open or closed', async () => {
    // A curve that dips from y 50 to about y 65 and back.
    const d = 'M 0 50 C 60 70 140 70 200 50';
    const both = read((await layer('sh7', {}, (m) => m.path({ d, width: 30 }))).canvas);
    expect(both.share(95, 105, 63, 66)).toBeGreaterThan(0.85);
    expect(both.share(95, 105, 40, 50)).toBeGreaterThan(0.2);
    expect(both.share(95, 105, 78, 88)).toBeGreaterThan(0.2);
    expect(both.share(95, 105, 0, 30)).toBe(0);
    // Walking left to right, the right is down.
    const right = read((await layer('sh8', {}, (m) => m.path({ d, width: 30, side: 'right' }))).canvas);
    expect(right.share(95, 105, 72, 82)).toBeGreaterThan(0.2);
    expect(right.share(95, 105, 0, 60)).toBe(0);
    // A closed square walked clockwise on the screen: its right is inside.
    const ring = read((await layer('sh9', {}, (m) => m.path({ d: 'M 50 10 L 150 10 L 150 90 L 50 90 Z', width: 15, side: 'right' }))).canvas);
    expect(ring.share(95, 105, 12, 18)).toBeGreaterThan(0.3);
    expect(ring.share(95, 105, 0, 8)).toBe(0);
    expect(ring.share(90, 110, 40, 60)).toBe(0);
    // As data.
    const data = read((await layer('sh10', {}, (m) => m.marks([{ path: { d, width: 30 }, amount: 1 }]))).canvas);
    expect(data.share(95, 105, 63, 66)).toBeGreaterThan(0.85);
  });

  it('mask: what the layer draws is cut to the shape, specks across its outline too; set({ mask: null }) takes it off', async () => {
    // Round specks 8 px across, full everywhere: the mask's edge at x 100.5
    // falls through a column of them.
    const { canvas, h } = await layer('sh11', { kind: 'stipple', speck: 'round', scale: 8, mask: { rect: [0, 0, 100.5, 100] } }, (m) => m.fill({}));
    const r = read(canvas);
    expect(r.share(0, 100, 0, 100)).toBeGreaterThan(0.5);
    expect(r.share(101, 200, 0, 100)).toBe(0);
    h.set({ mask: null });
    await dispatchSeek(0.2).done;
    expect(read(canvas).share(101, 200, 0, 100)).toBeGreaterThan(0.5);
    h.set({ mask: { circle: [150, 50, 30] } });
    await dispatchSeek(0.3).done;
    const c = read(canvas);
    expect(c.share(0, 100, 0, 100)).toBe(0);
    expect(c.share(140, 160, 40, 60)).toBeGreaterThan(0.5);
  });

  it('fill: its amount inside its clip; paint: what the author paints', async () => {
    const f = read((await layer('sh7', {}, (m) => m.fill({ amount: 0.5, clip: { rect: [0, 0, 100, 100] } }))).canvas);
    expect(Math.abs(f.share(0, 100, 0, 100) - 0.5)).toBeLessThan(0.04);
    expect(f.share(100, 200, 0, 100)).toBe(0);
    const p = read((await layer('sh8', {}, (m) => m.paint((ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(120, 20, 40, 40); }))).canvas);
    expect(p.share(122, 158, 22, 58)).toBe(1);
    expect(p.share(0, 110, 0, 100)).toBe(0);
  });

  it('marks([…]) draws what the calls draw', async () => {
    const calls = read((await layer('sh9', {}, (m) => m.band({ from: [0, 50], to: [200, 50], width: 30, ink: '#336' }).fill({ amount: 0.2, clip: { rect: [0, 0, 50, 100] } }))).canvas).hash();
    const data = read((await layer('sh10', {}, (m) => m.marks([{ band: { from: [0, 50], to: [200, 50], width: 30 }, ink: '#336' }, { fill: 0.2, clip: { rect: [0, 0, 50, 100] } }]))).canvas).hash();
    expect(data).toBe(calls);
  });

  it("each speck in its mark's ink, at the layer's opacity", async () => {
    const r = read((await layer('sh11', { opacity: 0.5 }, (m) => m
      .fill({ ink: '#ff0000', clip: { rect: [0, 0, 100, 100] } })
      .fill({ ink: '#0000ff', clip: { rect: [100, 0, 100, 100] } }))).canvas);
    const a = r.at(50, 50), b = r.at(150, 50);
    expect(Math.abs(a[3] - 128)).toBeLessThan(4);
    expect(a[0]).toBeGreaterThan(240);
    expect(a[2]).toBeLessThan(10);
    expect(b[2]).toBeGreaterThan(240);
    expect(b[0]).toBeLessThan(10);
  });

  it('fps: a new scatter each step, the same one for the same time', async () => {
    const { canvas } = await layer('sh12', { fps: 2 }, (m) => m.fill({ amount: 0.5 }), 0.1);
    const a = read(canvas).hash();
    await dispatchSeek(0.3).done;
    expect(read(canvas).hash()).toBe(a);
    await dispatchSeek(0.6).done;
    const b = read(canvas).hash();
    expect(b).not.toBe(a);
    await dispatchSeek(0.1).done;
    expect(read(canvas).hash()).toBe(a);
  });

  it('delay: the first scatter holds until the boil starts, then a new one each step', async () => {
    const { canvas } = await layer('sh30', { fps: 2, delay: 1 }, (m) => m.fill({ amount: 0.5 }), 0.1);
    const a = read(canvas).hash();
    await dispatchSeek(0.9).done;
    expect(read(canvas).hash()).toBe(a);
    // The boil's clock starts at 1 s: its first step is half a second on.
    await dispatchSeek(1.4).done;
    expect(read(canvas).hash()).toBe(a);
    await dispatchSeek(1.6).done;
    expect(read(canvas).hash()).not.toBe(a);
  });

  it('effect(): fps moves a seeded kind on n times a second, after its delay, and set() changes both', async () => {
    const { wf, canvas } = await stage('sh31');
    const src = document.createElement('canvas');
    src.width = 50; src.height = 25;
    const g = src.getContext('2d');
    g.fillStyle = '#888'; g.fillRect(0, 0, 50, 25);
    const fx = wf.kinetic.effect(canvas, { source: src, kind: 'stipple', fps: 2 });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    const a = read(canvas).hash();
    await dispatchSeek(0.3).done;
    expect(read(canvas).hash()).toBe(a);
    await dispatchSeek(0.6).done;
    expect(read(canvas).hash()).not.toBe(a);
    fx.set({ delay: 1 });
    await dispatchSeek(0.7).done;
    expect(read(canvas).hash()).toBe(a);
    fx.set({ fps: 0 });
    await dispatchSeek(1.9).done;
    expect(read(canvas).hash()).toBe(a);
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    expectKN(err(() => wf.kinetic.effect(document.createElement('canvas'), { source: src, kind: 'dither', fps: 2 })), 'KN-100', 'effect(canvas, { fps })', /^fps is for the kinds with a seed/);
    // The old name for fps is no option: KN-100 as any parameter the kind does not take.
    expectKN(err(() => fx.set({ boil: 2 })), 'KN-100', 'set({ boil })', /^'boil' is not a parameter of stipple/);
    expectKN(err(() => wf.kinetic.effect(document.createElement('canvas'), { source: src, kind: 'boil', boil: 2 })), 'KN-100', 'effect(canvas, { boil })', /^'boil' is not a parameter of boil/);
    expectKN(err(() => fx.set({ delay: -1 })), 'KN-100', 'set({ delay })', /^delay is seconds, 0 or more/);
  });

  it('set(): unchanged values paint nothing, redraw() paints the marks again, and move can be turned off and on', async () => {
    let y = 20;
    const band = (m) => m.band({ from: [0, y], to: [200, y], width: 4 });
    const { canvas, h } = await layer('sh32', { fps: 2, freeze: 'all' }, band, 0.1);
    expect(read(canvas).share(0, 200, 18, 22)).toBeGreaterThan(0.6);
    // Frozen: the marks read y again only when told.
    y = 70;
    await dispatchSeek(0.2).done;
    expect(read(canvas).share(0, 200, 68, 72)).toBe(0);
    h.set({ fps: 2, freeze: 'all', mask: null, marks: band });
    await dispatchSeek(0.25).done;
    expect(read(canvas).share(0, 200, 68, 72)).toBe(0);
    h.redraw();
    await dispatchSeek(0.3).done;
    expect(read(canvas).share(0, 200, 68, 72)).toBeGreaterThan(0.6);
    expect(read(canvas).share(0, 200, 18, 22)).toBe(0);
    // move: on, off (the transform cleared), and on again.
    const down = (t) => ({ y: t * 100 });
    h.set({ move: down });
    await dispatchSeek(0.4).done;
    expect(new DOMMatrix(canvas.style.transform).f).toBeCloseTo(40, 3);
    h.set({ move: null });
    expect(canvas.style.transform).toBe('');
    await dispatchSeek(0.45).done;
    expect(canvas.style.transform).toBe('');
    h.set({ move: down });
    await dispatchSeek(0.4).done;
    expect(new DOMMatrix(canvas.style.transform).f).toBeCloseTo(40, 3);
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    expectKN(err(() => h.set({ move: 5 })), 'KN-100', 'set({ move })', /or null for none/);
    expectKN(err(() => h.set({ delay: -1 })), 'KN-100', 'set({ delay })', /^delay is the seconds before the boil starts/);
    expectKN(err(() => h.set({ marks: null })), 'KN-100', 'set({ marks })', /^marks is a function \(m, t\)/);
    // A new marks function paints at the next draw, frozen or not.
    h.set({ move: null });
    h.set({ marks: (m) => m.band({ from: [0, 50], to: [200, 50], width: 4 }) });
    await dispatchSeek(0.5).done;
    expect(read(canvas).share(0, 200, 48, 52)).toBeGreaterThan(0.6);
    expect(read(canvas).share(0, 200, 68, 72)).toBe(0);
  });

  it('set() of a default the layer was never given changes nothing and paints nothing', async () => {
    let y = 20;
    const band = (m) => m.band({ from: [0, y], to: [200, y], width: 4 });
    const { canvas, h } = await layer('sh33', { fps: 2, freeze: 'all' }, band, 0.1);
    y = 70;
    for (const p of [{ density: 0 }, { scale: 1 }, { contrast: 1, grade: 0 }]) {
      h.set(p);
      await dispatchSeek(0.2).done;
      expect(read(canvas).share(0, 200, 68, 72), JSON.stringify(p)).toBe(0);
    }
    // A real change still paints.
    h.set({ density: 0.1 });
    await dispatchSeek(0.25).done;
    expect(read(canvas).share(0, 200, 68, 72)).toBeGreaterThan(0.3);
  });

  it("freeze: 'seed' moves the marks every frame, 'all' paints them at the step's start, move carries the canvas with them", async () => {
    // A band that moves down 100 px a second.
    const moving = (m, t) => m.band({ from: [0, 10 + t * 100], to: [200, 10 + t * 100], width: 4 });
    const seed = read((await layer('sh13', { fps: 2 }, moving, 0.4)).canvas);
    expect(seed.share(0, 200, 48, 52)).toBeGreaterThan(0.6);
    expect(seed.share(0, 200, 8, 12)).toBe(0);
    const all = read((await layer('sh14', { fps: 2, freeze: 'all' }, moving, 0.4)).canvas);
    expect(all.share(0, 200, 8, 12)).toBeGreaterThan(0.6);
    expect(all.share(0, 200, 48, 52)).toBe(0);
    const { canvas } = await layer('sh15', { fps: 2, move: (t) => ({ y: t * 100 }) }, moving, 0.4);
    expect(new DOMMatrix(canvas.style.transform).f).toBeCloseTo(40, 3);
  });

  it('splatter: more drops where the field is denser, longer than stipple specks, a new pattern for a new seed', async () => {
    const coverage = [];
    for (const [i, amount] of [0.25, 0.5, 0.75].entries()) {
      const r = read((await layer('sp' + i, { kind: 'splatter' }, (m) => m.fill({ amount }))).canvas);
      coverage.push(r.share(0, 200, 0, 100));
    }
    expect(coverage[0]).toBeGreaterThan(0.01);
    expect(coverage[0]).toBeLessThan(coverage[1]);
    expect(coverage[1]).toBeLessThan(coverage[2]);
    // The longest run of ink along a row: a splatter's large drops make it
    // longer than a stipple's.
    const runLength = async (id, opts) => {
      const r = read((await layer(id, opts, (m) => m.fill({ amount: 0.5 }))).canvas);
      let run = 0, most = 0;
      for (let y = 0; y < 100; y++) for (let x = 0; x < 200; x += 0.5) {
        run = r.at(x, y)[3] > 100 && x > 0 ? run + 1 : 0;
        most = Math.max(most, run);
      }
      return most;
    };
    expect(await runLength('sp3', { kind: 'splatter', max: 32 })).toBeGreaterThan(1.5 * await runLength('sp4', { kind: 'stipple' }));
    // max sets how large the drops get.
    expect(await runLength('sp7', { kind: 'splatter', min: 3, max: 32 })).toBeGreaterThan(2 * await runLength('sp8', { kind: 'splatter', min: 3, max: 4 }));
    const { canvas, h } = await layer('sp5', { kind: 'splatter', seed: 1 }, (m) => m.fill({ amount: 0.5 }));
    const a = read(canvas).hash();
    h.set({ seed: 2 });
    await dispatchSeek(0.2).done;
    expect(read(canvas).hash()).not.toBe(a);
  });

  it('effect() splatter: min, max, warp and vary are checked (KN-100)', async () => {
    const { wf, canvas } = await stage('sp6');
    const src = document.createElement('canvas');
    let err = null;
    try { wf.kinetic.effect(canvas, { source: src, kind: 'splatter', rough: 4 }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { rough })', /^'rough' is not a parameter of splatter; its parameters are min, max,/);
    err = null;
    try { wf.kinetic.effect(canvas, { source: src, kind: 'splatter', min: 0 }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { min })', /^min is a number of px above 0/);
    err = null;
    try { wf.kinetic.effect(canvas, { source: src, kind: 'splatter', min: 30 }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { min, max })', /^min is the smallest drop and max the largest, so min is at most max, not 30 and 24/);
    const fx = wf.kinetic.effect(canvas, { source: src, kind: 'splatter', min: 4, max: 12 });
    handles.push(fx);
    err = null;
    try { fx.set({ max: 3 }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'set({ min, max })', /not 4 and 3/);
    fx.dispose();
    err = null;
    try { wf.kinetic.effect(canvas, { source: src, kind: 'splatter', warp: 2 }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { warp })', /^warp is a number from 0 to 1/);
    err = null;
    try { wf.kinetic.effect(canvas, { source: src, kind: 'splatter', vary: -0.1 }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { vary })', /^vary is a number from 0 to 1/);
  });

  it("light: the field itself in its ink, at its density, blended by screen unless blend says otherwise", async () => {
    const { canvas, h } = await layer('li1', { kind: 'light' }, (m) => m.fill({ amount: 0.5, ink: '#ff8000', clip: { rect: [0, 0, 100, 100] } }));
    expect(canvas.style.mixBlendMode).toBe('screen');
    const r = read(canvas);
    const px = r.at(50, 50);
    expect(Math.abs(px[3] - 128)).toBeLessThan(4);
    expect(px[0]).toBeGreaterThan(240);
    expect(Math.abs(px[1] - 128)).toBeLessThan(6);
    expect(r.at(150, 50)[3]).toBe(0);
    h.set({ blend: 'plus-lighter' });
    expect(canvas.style.mixBlendMode).toBe('plus-lighter');
  });

  it('density: more ink everywhere toward 1, less toward -1, and set() changes it', async () => {
    const inked = (c) => { const r = read(c); let n = 0; for (let y = 2; y < 98; y += 3) for (let x = 2; x < 98; x += 3) if (r.at(x, y)[3] > 128) n++; return n; };
    const marks = (m) => m.fill({ amount: 0.3, clip: { rect: [0, 0, 100, 100] } });
    const plain = inked((await layer('dn1', { kind: 'stipple' }, marks)).canvas);
    const dense = await layer('dn2', { kind: 'stipple', density: 0.5 }, marks);
    expect(inked(dense.canvas)).toBeGreaterThan(plain * 1.5);
    dense.h.set({ density: -0.5 });
    await dispatchSeek(0.2).done;
    expect(inked(dense.canvas)).toBeLessThan(plain * 0.5);
  });

  it('grain: noise as strong as the field, still with no boil, a new pattern each step with boil', async () => {
    const { canvas } = await layer('gr1', { kind: 'grain' }, (m) => m.fill({ clip: { rect: [0, 0, 100, 100] } }), 0.1);
    expect(canvas.style.mixBlendMode).toBe('overlay');
    const r = read(canvas);
    const greys = new Set();
    for (let x = 10; x < 90; x += 3) { const p = r.at(x, 50); expect(p[3]).toBeGreaterThan(250); greys.add(p[0]); }
    expect(greys.size).toBeGreaterThan(8);
    expect(r.at(150, 50)[3]).toBe(0);
    const a = r.hash();
    await dispatchSeek(0.2).done;
    expect(read(canvas).hash()).toBe(a);
    const held = await layer('gr2', { kind: 'grain', fps: 2 }, (m) => m.fill({}), 0.1);
    const b = read(held.canvas).hash();
    await dispatchSeek(0.3).done;
    expect(read(held.canvas).hash()).toBe(b);
    await dispatchSeek(0.6).done;
    expect(read(held.canvas).hash()).not.toBe(b);
  });

  it('blur(): a backdrop blur masked by the field, the mask decoded before the seek settles, set() and dispose()', async () => {
    const { wf, host } = await stage('bl1', '<div id="over" style="position:absolute;inset:0"></div>');
    const over = host.querySelector('#over');
    const h = wf.kinetic.blur(over, { radius: 10, marks: (m, t) => m.band({ from: [0, 10 + t * 100], to: [200, 10 + t * 100], width: 8 }) });
    handles.push(h);
    await dispatchSeek(0.1).done;
    expect(over.style.backdropFilter).toBe('blur(10px)');
    const first = over.style.maskImage;
    expect(first).toMatch(/^url\("data:image\/png;base64,/);
    // The mask's own pixels: dense along the band, empty away from it.
    const img = new Image();
    img.src = first.slice(5, -2);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const alpha = (x, y) => g.getImageData(Math.floor(x / 4), Math.floor(y / 4), 1, 1).data[3];
    expect(alpha(100, 20)).toBeGreaterThan(150);
    expect(alpha(100, 80)).toBe(0);
    await dispatchSeek(0.5).done;
    expect(over.style.maskImage).not.toBe(first);
    h.set({ radius: 4 });
    expect(over.style.backdropFilter).toBe('blur(4px)');
    // A new marks function: the mask follows it at the next seek.
    const moved = over.style.maskImage;
    h.set({ freeze: 'all', fps: 2, marks: (m) => m.fill({ clip: { rect: [0, 60, 200, 40] } }) });
    await dispatchSeek(0.6).done;
    expect(over.style.maskImage).not.toBe(moved);
    h.dispose();
    expect(over.style.backdropFilter).toBe('');
    expect(over.style.maskImage).toBe('');
  });

  it('KN-100: light and grain are shade()\'s alone, and blur() checks its element and options', async () => {
    const { wf, canvas } = await stage('bl2');
    const k = wf.kinetic;
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    expectKN(err(() => k.effect(canvas, { source: document.createElement('canvas'), kind: 'light' })), 'KN-100', 'effect(canvas, { kind })', /^kind is one of halftone, stipple, dither, duotone, splatter, boil, not/);
    const marks = () => {};
    expectKN(err(() => k.shade(canvas, { kind: 'light', blend: 'shiny', marks })), 'KN-100', 'shade(canvas, { blend })', /^blend is a CSS mix-blend-mode/);
    expectKN(err(() => k.blur(null, { marks })), 'KN-100', 'blur(element)', /^element is an element/);
    expectKN(err(() => k.blur(canvas, { size: 3, marks })), 'KN-100', 'blur(element, { size })', /is not an option/);
    expectKN(err(() => k.blur(canvas, { boil: 2, marks })), 'KN-100', 'blur(element, { boil })', /is not an option; the options are scene, radius, fps, delay, freeze and marks/);
    expectKN(err(() => k.blur(canvas, { radius: -1, marks })), 'KN-100', 'blur(element, { radius })', /^radius is a number/);
    // freeze is the option; hold is not one.
    expectKN(err(() => k.blur(canvas, { freeze: 'some', marks })), 'KN-100', 'blur(element, { freeze })', /^freeze is 'seed' or 'all'/);
    expectKN(err(() => k.blur(canvas, { hold: 'all', marks })), 'KN-100', 'blur(element, { hold })', /^'hold' is not an option/);
    // The marks are an option: none, and a third argument, are KN-100.
    expectKN(err(() => k.blur(canvas, { radius: 4 })), 'KN-100', 'blur(element, { marks })', /^marks is a function \(m, t\)/);
    expectKN(err(() => k.blur(canvas)), 'KN-100', 'blur(element, { marks })', /^marks is a function \(m, t\)/);
    expectKN(err(() => k.blur(canvas, undefined, marks)), 'KN-100', 'blur(element, options, marks)', /^the marks go in the options: \{ …, marks: \(m, t\) => … \}$/);
    expectKN(err(() => k.blur(canvas, { radius: 4 }, marks)), 'KN-100', 'blur(element, options, marks)', /^the marks go in the options/);
    const h = k.blur(canvas, { marks });
    handles.push(h);
    expectKN(err(() => h.set({ marks: 5 })), 'KN-100', 'set({ marks })', /^marks is a function \(m, t\)/);
  });

  it('halftone and dither draw the field in the ink', async () => {
    for (const [id, kind] of [['sh16', 'halftone'], ['sh17', 'dither']]) {
      const r = read((await layer(id, { kind }, (m) => m.fill({ amount: 0.5, ink: '#00aa00' }))).canvas);
      const share = r.share(0, 200, 0, 100);
      expect(share).toBeGreaterThan(0.2);
      expect(share).toBeLessThan(0.8);
      let px = null;
      for (let x = 0; x < 200 && !px; x++) for (let y = 0; y < 100 && !px; y++) { const p = r.at(x, y); if (p[3] > 250) px = p; }
      expect(px[1]).toBeGreaterThan(150);
      expect(px[0]).toBeLessThan(20);
    }
  });

  it("an edge between ink and the transparent paper is the ink's colour, not darker, in each printed kind", async () => {
    // White ink: a pixel part-way across an edge is white at part alpha.
    for (const [id, kind, extra] of [['sh16d', 'splatter', {}], ['sh16e', 'halftone', {}], ['sh16f', 'stipple', { speck: 'round', scale: 4 }]]) {
      const r = read((await layer(id, Object.assign({ kind }, extra), (m) => m.fill({ amount: 0.5, ink: '#ffffff' }))).canvas);
      let edge = 0, darkest = 255;
      for (let x = 0; x < 200; x++) for (let y = 0; y < 100; y++) {
        const p = r.at(x, y);
        if (p[3] > 40 && p[3] < 215) { edge++; darkest = Math.min(darkest, p[0]); }
      }
      expect(edge, kind).toBeGreaterThan(20);
      expect(darkest, kind).toBeGreaterThan(235);
    }
  });

  it('stipple: square specks between device pixels have soft edges, and specks that touch join with no seam', async () => {
    // 1.5 px cells land between pixels: a covered part of a pixel is drawn
    // at that part's alpha. At full density every cell is inked, and a
    // pixel shared by two specks is fully inked.
    const alphas = async (id, amount) => {
      const r = read((await layer(id, { kind: 'stipple', scale: 1.5 }, (m) => m.fill({ amount }))).canvas);
      const out = [];
      for (let x = 2; x < 198; x++) for (let y = 2; y < 98; y++) out.push(r.at(x, y)[3]);
      return out;
    };
    const half = await alphas('sh16i', 0.5);
    expect(half.filter((a) => a > 20 && a < 235).length / half.length).toBeGreaterThan(0.05);
    const full = await alphas('sh16j', 1);
    expect(Math.min(...full)).toBeGreaterThan(250);
  });

  it('splatter: vary prints some drops lighter than others', async () => {
    const mid = async (id, vary) => {
      const r = read((await layer(id, { kind: 'splatter', vary }, (m) => m.fill({ amount: 0.7 }))).canvas);
      let n = 0;
      for (let x = 0; x < 200; x++) for (let y = 0; y < 100; y++) { const a = r.at(x, y)[3]; if (a > 40 && a < 200) n++; }
      return n / 20000;
    };
    // At 0 only the drops' antialiased edges are part strength.
    const even = await mid('sh16g', 0), varied = await mid('sh16h', 1);
    expect(varied).toBeGreaterThan(even * 1.25);
  });

  it('halftone: no ink where the field is empty, in shade() and on a white source in effect()', async () => {
    const r = read((await layer('sh16b', { kind: 'halftone' }, (m) => m.fill({ amount: 0.5, clip: { rect: [0, 0, 100, 100] } }))).canvas);
    expect(r.share(0, 100, 0, 100)).toBeGreaterThan(0.2);
    let most = 0;
    for (let x = 104; x < 200; x++) for (let y = 0; y < 100; y++) most = Math.max(most, r.at(x, y)[3]);
    expect(most).toBe(0);

    const { wf, canvas } = await stage('sh16c');
    const src = document.createElement('canvas');
    src.width = 200; src.height = 100;
    const g = src.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 100);
    handles.push(wf.kinetic.effect(canvas, { source: src, kind: 'halftone' }));
    await dispatchSeek(0.1).done;
    const w = read(canvas);
    let darkest = 255;
    for (let x = 0; x < 200; x++) for (let y = 0; y < 100; y++) darkest = Math.min(darkest, w.at(x, y)[0]);
    expect(darkest).toBe(255);
  });

  it("effect() stipple: grade shrinks the specks where the source is light; speck: 'round'; color: 'source'", async () => {
    const { wf, canvas } = await stage('sh18');
    const src = document.createElement('canvas');
    src.width = 200; src.height = 100;
    const g = src.getContext('2d');
    g.fillStyle = 'rgb(160, 40, 40)'; g.fillRect(0, 0, 200, 100);
    const fx = wf.kinetic.effect(canvas, { source: src, kind: 'stipple', scale: 8, paper: '#ffffff00' });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    const full = read(canvas).share(0, 200, 0, 100);
    fx.set({ grade: 1, speck: 'round' });
    await dispatchSeek(0.2).done;
    // At a darkness near 0.74 a graded speck covers about that much of its cell.
    expect(read(canvas).share(0, 200, 0, 100)).toBeLessThan(full * 0.88);
    fx.set({ grade: 0, speck: 'square', color: 'source' });
    await dispatchSeek(0.3).done;
    const r = read(canvas);
    let px = null;
    for (let x = 0; x < 200 && !px; x++) { const p = r.at(x, 50); if (p[3] > 250) px = p; }
    expect(px[0]).toBeGreaterThan(140);
    expect(px[1]).toBeLessThan(60);
  });

  it('a scene with a layer in its init() passes check()', async () => {
    const { wf } = await load();
    const name = uniqueName('shade');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      init() {
        handles.push(wf.kinetic.shade(this.element.querySelector('canvas'), { scene: this, fps: 4, freeze: 'all', marks: (m, t) => m
          .glow({ at: [50 + t * 60, 50], radius: 30 })
          .edge({ width: 8, clip: { polygon: [[120, 10], [190, 50], [120, 90]] } }) }));
      },
    });
    const host = await mount(`<div data-composition-id="${name}-c" data-start="0" data-duration="1" data-fps="10" data-width="200" data-height="100" style="position:relative;width:200px;height:100px">
      <div data-component="${name}" data-start="0" data-duration="1" style="position:absolute;inset:0"><canvas style="position:absolute;left:0;top:0;width:200px;height:100px"></canvas></div>
    </div>`);
    cleanup.push(host);
    const report = await wf.kinetic.check({ samples: 6 });
    expect(report.ok).toBe(true);
  });

  it('crachis: drops in each ink, coverage as the density up to 92%, overprinted inks multiplied, blended by multiply', async () => {
    const { canvas } = await layer('cr1', { kind: 'crachis' }, (m) => m
      .fill({ ink: '#ffff00', clip: { rect: [0, 0, 100, 100] } })
      .fill({ ink: '#ffff00', amount: 0.5, clip: { rect: [100, 0, 100, 50] } }));
    expect(canvas.style.mixBlendMode).toBe('multiply');
    const r = read(canvas);
    const full = r.share(0, 100, 0, 100), half = r.share(100, 200, 0, 50);
    expect(full).toBeGreaterThan(0.88);
    expect(full).toBeLessThan(0.96);
    expect(half).toBeGreaterThan(0.40);
    expect(half).toBeLessThan(0.52);
    expect(r.share(100, 200, 50, 100)).toBe(0);
    // Each drop is the ink itself, with no soft edge.
    let off = 0;
    for (let y = 1; y < 99; y += 2) for (let x = 1; x < 99; x += 2) { const p = r.at(x, y); if (p[3] > 0 && (p[0] < 250 || p[1] < 250 || p[2] > 5)) off++; }
    expect(off).toBe(0);
    // Two inks over each other: where both drops land, the product, yellow times cyan.
    const two = read((await layer('cr2', { kind: 'crachis' }, (m) => m.fill({ ink: '#ffff00' }).fill({ ink: '#00ffff' }))).canvas);
    let green = 0, n = 0;
    for (let y = 1; y < 99; y += 2) for (let x = 1; x < 199; x += 2) { n++; const p = two.at(x, y); if (p[0] < 5 && p[1] > 250 && p[2] < 5) green++; }
    expect(green / n).toBeGreaterThan(0.75);
    expect(green / n).toBeLessThan(0.92);
  });

  it('ink and crachis at a pixel ratio of 2: no ink bleeds into the next ink\'s plane at the canvas\'s top or bottom rows', async () => {
    const real = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    try {
      // Red only in the bottom rows; blue everywhere, too faint to see.
      const { canvas } = await layer('cr9', { kind: 'ink' }, (m) => m
        .fill({ ink: '#ff0000', clip: { rect: [0, 90, 200, 10] } })
        .fill({ ink: '#0000ff', amount: 0.0001 }));
      expect(canvas.width).toBe(400);
      const r = read(canvas);
      const top = r.at(50, 0.2);
      expect(top[3] === 0 || (top[0] > 240 && top[1] > 240), 'row 0: ' + top.join(',')).toBe(true);
    } finally {
      if (real) Object.defineProperty(window, 'devicePixelRatio', real);
      else delete window.devicePixelRatio;
    }
  });

  it('crachis: the same seed draws the same drops, another seed others; dot and spread are checked', async () => {
    const marks = (m) => m.fill({ amount: 0.5, ink: '#204060' });
    const a = read((await layer('cr3', { kind: 'crachis', seed: 3 }, marks)).canvas).hash();
    const b = read((await layer('cr4', { kind: 'crachis', seed: 3 }, marks)).canvas).hash();
    const c = read((await layer('cr5', { kind: 'crachis', seed: 4 }, marks)).canvas).hash();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    const { wf, canvas } = await stage('cr6');
    let err = null;
    try { wf.kinetic.shade(canvas, { kind: 'crachis', dot: 0, marks }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { dot })', /^dot is a number of px above 0/);
    err = null;
    try { wf.kinetic.shade(canvas, { kind: 'crachis', spread: -1, marks }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { spread })', /^spread is a number of 0 or more/);
  });

  it('ink: smooth, the inks absorbing light as their densities add, on white, blended by multiply', async () => {
    const { canvas } = await layer('in1', { kind: 'ink' }, (m) => m
      .fill({ ink: '#e8b04a', clip: { rect: [0, 0, 50, 100] } })
      .fill({ ink: '#808080', amount: 0.5, clip: { rect: [50, 0, 50, 100] } })
      .fill({ ink: '#ffff00', clip: { rect: [100, 0, 50, 100] } })
      .fill({ ink: '#00ffff', clip: { rect: [100, 0, 50, 100] } }));
    expect(canvas.style.mixBlendMode).toBe('multiply');
    const r = read(canvas);
    const near = (p, q, d) => q.forEach((v, i) => expect(Math.abs(p[i] - v)).toBeLessThanOrEqual(d));
    near(r.at(25, 50), [0xe8, 0xb0, 0x4a, 255], 2);
    // Half the density of a mid gray lets through the square root of its light: 0.5 in sRGB is 0.214 in linear light, its root 0.463, 181 in sRGB.
    near(r.at(75, 50), [181, 181, 181, 255], 3);
    near(r.at(125, 50), [0, 255, 0, 255], 2);
    near(r.at(175, 50), [255, 255, 255, 255], 0);
  });

  it('KN-100: crachis and ink take at most four inks, and paint() names its ink there', async () => {
    const { wf, canvas } = await stage('in2');
    const tries = [
      [(m) => ['#100', '#200', '#300', '#400', '#500'].forEach((ink) => m.fill({ ink })), 'shade(canvas, { kind: \'ink\' })', /^a layer of crachis or ink prints at most four inks/],
      [(m) => m.paint(() => {}), 'paint(fn, { ink })', /^in crachis and ink, paint\(\) names the ink it paints/],
    ];
    for (const [marks, where, why] of tries) {
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:100px';
      canvas.parentNode.appendChild(c);
      const h = wf.kinetic.shade(c, { kind: 'ink', marks });
      let e = null;
      try { await dispatchSeek(0.1).done; } catch (x) { e = x; }
      h.dispose();
      c.remove();
      expectKN(e, 'KN-100', where, why);
    }
  });

  it('KN-100 for a bad call: the canvas, the options, the marks, a mark, set()', async () => {
    const { wf, canvas } = await stage('sh19');
    const k = wf.kinetic;
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    const none = () => {};
    expectKN(err(() => k.shade(document.createElement('div'), { marks: none })), 'KN-100', 'shade(canvas)', /^canvas is a <canvas>/);
    expectKN(err(() => k.shade(canvas, { kind: 'duotone', marks: none })), 'KN-100', 'shade(canvas, { kind })', /^kind is stipple, splatter, halftone, dither, light, grain, crachis or ink/);
    expectKN(err(() => k.shade(canvas, { ink: '#000', marks: none })), 'KN-100', 'shade(canvas, { ink })', /each mark/);
    expectKN(err(() => k.shade(canvas, { freeze: 'some', marks: none })), 'KN-100', 'shade(canvas, { freeze })', /^freeze is 'seed' or 'all'/);
    // hold is no option of a layer's: effect() rejects it as any parameter the kind does not take.
    expectKN(err(() => k.shade(canvas, { hold: 'all', marks: none })), 'KN-100', 'effect(canvas, { hold })', /^'hold' is not a parameter of stipple/);
    // The marks are an option every layer needs; a third argument is KN-100, named for where the marks go.
    expectKN(err(() => k.shade(canvas, {})), 'KN-100', 'shade(canvas, { marks })', /^marks is a function \(m, t\) that adds the marks/);
    expectKN(err(() => k.shade(canvas)), 'KN-100', 'shade(canvas, { marks })', /^marks is a function \(m, t\)/);
    expectKN(err(() => k.shade(canvas, { marks: 'band' })), 'KN-100', 'shade(canvas, { marks })', /, not "band"$/);
    expectKN(err(() => k.shade(canvas, { kind: 'stipple' }, none)), 'KN-100', 'shade(canvas, options, marks)', /^the marks go in the options: \{ …, marks: \(m, t\) => … \}$/);
    expectKN(err(() => k.shade(canvas, { kind: 'stipple', marks: none }, none)), 'KN-100', 'shade(canvas, options, marks)', /^the marks go in the options/);
    // tone and boil, the old names for density and fps, are no options: effect() rejects them as any parameter the kind does not take.
    expectKN(err(() => k.shade(canvas, { tone: 0.2, marks: none })), 'KN-100', 'effect(canvas, { tone })', /^'tone' is not a parameter of stipple/);
    expectKN(err(() => k.shade(canvas, { boil: 2, marks: none })), 'KN-100', 'effect(canvas, { boil })', /^'boil' is not a parameter of stipple/);
    expectKN(err(() => k.shade(canvas, { mask: { square: 4 }, marks: none })), 'KN-100', 'shade(canvas, { mask })', /^a shape is \{ circle/);
    expectKN(err(() => k.shade(canvas, { density: 2, marks: none })), 'KN-100', 'shade(canvas, { density })', /^density is a number from -1 to 1/);
    expectKN(err(() => k.shade(canvas, { kind: 'dither', density: 0.2, marks: none })), 'KN-100', 'shade(canvas, { density })', /^density is for stipple, splatter and halftone/);
    // A bad mark throws from the seek's draw.
    const marks = [
      [(m) => m.band({ from: [0, 0], to: [10, 0] }), 'band({ width })', /^width is a number/],
      [(m) => m.edge({ width: 4 }), 'edge({ clip })', /^an edge needs a clip/],
      [(m) => m.path({ d: 'M 0 0 Q', width: 4 }), 'path({ d })', /^d is SVG path data, and the grammar stops at character/],
      [(m) => m.path({ d: 5, width: 4 }), 'path({ d })', /^d is SVG path data, not 5/],
      [(m) => m.path({ d: 'M 0 0 L 9 9', width: 0 }), 'path({ width })', /^width is a number of px above 0/],
      [(m) => m.path({ d: 'M 0 0 L 9 9', width: 4, side: 'up' }), 'path({ side })', /^side is 'both', 'left' or 'right'/],
      [(m) => m.fill({ amount: 2 }), 'fill({ amount })', /^amount is a number from 0 to 1/],
      [(m) => m.fill({ clip: { square: 1 } }), 'fill({ clip })', /^a shape is/],
      [(m) => m.glow({ at: [0, 0], radius: 5, size: 1 }), 'glow({ size })', /is not an option here/],
    ];
    for (const [fn, where, why] of marks) {
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:100px';
      canvas.parentNode.appendChild(c);
      const h = k.shade(c, { marks: fn });
      let e = null;
      try { await dispatchSeek(0.1).done; } catch (x) { e = x; }
      h.dispose();
      c.remove();
      expectKN(e, 'KN-100', where, why);
    }
    const h = k.shade(canvas, { marks: (m) => m.fill({}) });
    handles.push(h);
    expectKN(err(() => h.set({ kind: 'dither' })), 'KN-100', 'set({ kind })', /set when the layer is made/);
  });

  it('KN-100 for a clip or mask path the grammar cannot read, a move that is no transform, and data marks with options that would do nothing', async () => {
    const { wf, canvas } = await stage('sh22');
    const k = wf.kinetic;
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    const none = () => {};
    expectKN(err(() => k.shade(canvas, { mask: { path: 'not a path' }, marks: none })), 'KN-100', 'shade(canvas, { mask })', /grammar stops at character 0/);
    // These throw from the seek's draw.
    const seekErr = async (opts) => {
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:100px';
      canvas.parentNode.appendChild(c);
      const h = k.shade(c, opts);
      let e = null;
      try { await dispatchSeek(0.1).done; } catch (x) { e = x; }
      h.dispose();
      c.remove();
      return e;
    };
    const fill = (m) => m.fill({ amount: 0.5 });
    expectKN(await seekErr({ marks: (m) => m.fill({ clip: { path: 'circle please' } }) }), 'KN-100', 'fill({ clip })', /grammar stops at character 0/);
    expectKN(await seekErr({ marks: (m) => m.marks([{ paint: none, amount: 0.1 }]) }), 'KN-100', 'paint(fn, { amount })', /is not an option here/);
    expectKN(await seekErr({ marks: (m) => m.paint(none, { falloff: 'smooth' }) }), 'KN-100', 'paint(fn, { falloff })', /is not an option here/);
    expectKN(await seekErr({ marks: (m) => m.marks([{ fill: 0.3, amount: 0.9 }]) }), 'KN-100', 'marks([{ fill, amount }])', /fill's value is its amount/);
    expectKN(await seekErr({ move: () => ({ x: 10, origin: 'center' }), marks: fill }), 'KN-100', 'shade(canvas, { move })', /origin is a point/);
    expectKN(await seekErr({ move: () => ({ x: '10px' }), marks: fill }), 'KN-100', 'shade(canvas, { move })', /x is a number/);
    expectKN(await seekErr({ move: () => ({ scale: NaN }), marks: fill }), 'KN-100', 'shade(canvas, { move })', /scale is a number/);
  });

  it("set() on a layer and on a blur is all or none: one that throws, here or in the effect's checks, changes nothing, and the good values then apply", async () => {
    const { wf, canvas, h } = await layer('sh21', {}, (m) => m.fill({ ink: '#ff0000' }));
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    expectKN(err(() => h.set({ opacity: 0.5, fps: -1 })), 'KN-100', 'set({ fps })');
    await dispatchSeek(0.2).done;
    expect(read(canvas).at(100, 50)[3]).toBeGreaterThan(240);
    h.set({ opacity: 0.5 });
    await dispatchSeek(0.3).done;
    expect(Math.abs(read(canvas).at(100, 50)[3] - 128)).toBeLessThan(4);
    expectKN(err(() => h.set({ scale: -1 })), 'KN-100', 'set({ scale })');
    expectKN(err(() => h.set({ scale: -1 })), 'KN-100', 'set({ scale })');
    const host = canvas.parentNode, over = document.createElement('div');
    over.style.cssText = 'position:absolute;inset:0';
    host.appendChild(over);
    const b = wf.kinetic.blur(over, { radius: 8, marks: (m) => m.fill({}) });
    handles.push(b);
    expectKN(err(() => b.set({ radius: 20, fps: -1 })), 'KN-100', 'set({ fps })');
    expect(over.style.backdropFilter).toBe('blur(8px)');
    b.set({ radius: 20 });
    expect(over.style.backdropFilter).toBe('blur(20px)');
  });

  it('a layer on a hidden canvas (crachis, ink, an edge, a path) lets the seek land, and draws once the canvas is shown', async () => {
    const { wf, canvas } = await stage('sh20');
    const host = canvas.parentNode;
    const setups = [
      [{ kind: 'crachis' }, (m) => m.fill({ ink: '#203040' })],
      [{ kind: 'ink' }, (m) => m.fill({ ink: '#203040' })],
      [{}, (m) => m.edge({ clip: { rect: [20, 20, 160, 60] }, width: 12 })],
      [{}, (m) => m.path({ d: 'M20 50 H180', width: 12 })],
    ];
    for (const [opts, marks] of setups) {
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;left:0;top:0;width:200px;height:100px;display:none';
      host.appendChild(c);
      const h = wf.kinetic.shade(c, Object.assign({}, opts, { marks }));
      handles.push(h);
      let e = null;
      try { await dispatchSeek(0.5).done; } catch (x) { e = x; }
      expect(e, JSON.stringify(opts) + ' ' + (e && e.message)).toBe(null);
      c.style.display = '';
      await dispatchSeek(0.6).done;
      expect(read(c).share(0, 200, 0, 100), JSON.stringify(opts)).toBeGreaterThan(0.02);
      h.dispose();
      c.remove();
    }
  });
});
