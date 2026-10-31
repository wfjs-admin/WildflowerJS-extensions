/**
 * effect(canvas, { source, kind, ...params }): halftone, stipple, dither and
 * duotone drawn with WebGL 2 from an <img>, <video> or <canvas> into a canvas,
 * after each seek has settled. The pixels are read from the effect's canvas
 * through a 2D copy: each kind from a test image, the footage frame of a
 * seek from a <video>, the draws counted on the context, check(), the
 * KN-100 and KN-204 cases, dispose(), the drawing size at a device pixel
 * ratio of 2 (window.devicePixelRatio redefined for the test, which is all
 * effect() reads of it), a canvas taken off the page and a lost context. A
 * render capturing an effect is in render.test.js, which needs the
 * installed Chrome.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, dispatchSeek, captureWarnings, uniqueName, expectKN, FOOTAGE, shownFrame, footageFrame, BUILD, CORE_TIER } from './helpers.js';

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

// A 2D canvas of w x h painted by `paint(ctx)`, as a source.
function source(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'));
  return c;
}
const gray = (v) => (g) => { g.fillStyle = `rgb(${v}, ${v}, ${v})`; g.fillRect(0, 0, 400, 400); };
const ramp = (g) => { const l = g.createLinearGradient(0, 0, 200, 0); l.addColorStop(0, '#000'); l.addColorStop(1, '#fff'); g.fillStyle = l; g.fillRect(0, 0, 200, 100); };

// A stage with one 200 x 100 canvas for the effect.
async function stage(id, extra = '') {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="1" data-fps="10" data-width="200" data-height="100" style="position:relative;width:200px;height:100px">
    <canvas id="fx" style="position:absolute;left:0;top:0;width:200px;height:100px"></canvas>${extra}
  </div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return { wf, host, canvas: host.querySelector('#fx') };
}

// The effect's canvas read back: at(x, y) in CSS px as [r, g, b, a], and
// share(x0, x1, test) over the band from x0 to x1 (fractions of the width).
function read(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const s = canvas.width / (canvas.clientWidth || canvas.width);
  const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  return {
    s, width: c.width, height: c.height,
    at: (x, y) => px(Math.floor(x * s), Math.floor(y * s)),
    share(x0, x1, test) {
      let n = 0, hit = 0;
      for (let y = 0; y < c.height; y++) for (let x = Math.floor(x0 * c.width); x < Math.floor(x1 * c.width); x++) { n++; if (test(px(x, y))) hit++; }
      return hit / n;
    },
    row: (y) => Array.from({ length: c.width }, (_, x) => px(x, Math.floor(y * s))),
    hash() { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; },
  };
}
const ink = ([r, g, b]) => r + g + b < 3 * 64;
const near = (px, rgb, tol = 6) => rgb.every((c, i) => Math.abs(px[i] - c) <= tol);

// Runs of ink along a row, as [start, end) in device pixels.
function runs(row) {
  const out = [];
  let from = -1;
  row.forEach((p, x) => { if (ink(p) && from < 0) from = x; if (!ink(p) && from >= 0) { out.push([from, x]); from = -1; } });
  if (from >= 0) out.push([from, row.length]);
  return out;
}

describe(`effect() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('halftone: dots a cell apart, larger where the source is darker, larger again with tone', async () => {
    const { wf, host, canvas } = await stage('fx1', '<canvas id="fx2" style="position:absolute;left:0;top:100px;width:200px;height:100px"></canvas>');
    const fx = wf.kinetic.effect(canvas, { source: source(200, 100, gray(128)), kind: 'halftone', cell: 20, angle: 0, shape: 'square', ink: '#000000', paper: '#ffffff' });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    let r = read(canvas);
    // A row through the dots' centres: ten runs of ink, 20 px apart, each
    // the side of a square of half the cell's area, 20 * sqrt(0.5) px.
    const centre = runs(r.row(10)).map(([a, b]) => (a + b) / 2 / r.s);
    expect(centre.length, JSON.stringify(centre)).toBe(10);
    centre.slice(1).forEach((c, i) => expect(Math.abs(c - centre[i] - 20), 'spacing ' + i).toBeLessThan(0.75));
    const width = runs(r.row(10)).map(([a, b]) => (b - a) / r.s);
    for (const w of width) expect(Math.abs(w - 20 * Math.SQRT1_2)).toBeLessThan(1.5);
    const flat = r.share(0, 1, ink);
    expect(Math.abs(flat - 0.5)).toBeLessThan(0.04);
    // density moves every dot toward ink.
    fx.set({ density: 0.2 });
    await dispatchSeek(0.2).done;
    r = read(canvas);
    expect(r.share(0, 1, ink)).toBeGreaterThan(flat + 0.12);
    // From a ramp, black to white: the dots shrink from left to right.
    const second = host.querySelector('#fx2');
    handles.push(wf.kinetic.effect(second, { source: source(200, 100, ramp), kind: 'halftone', cell: 10 }));
    await dispatchSeek(0.3).done;
    r = read(second);
    const bands = [0, 0.25, 0.5, 0.75].map((x) => r.share(x, x + 0.25, ink));
    expect(bands[0]).toBeGreaterThan(bands[1]);
    expect(bands[1]).toBeGreaterThan(bands[2]);
    expect(bands[2]).toBeGreaterThan(bands[3]);
  });

  it('halftone shapes, and color: source takes each dot in the colour under it', async () => {
    const { wf, canvas } = await stage('fx2');
    const red = source(200, 100, (g) => { g.fillStyle = '#c00000'; g.fillRect(0, 0, 200, 100); });
    const fx = wf.kinetic.effect(canvas, { source: red, kind: 'halftone', cell: 20, angle: 0, color: 'source', paper: '#ffffff' });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    let r = read(canvas);
    expect(near(r.at(10, 10), [0xc0, 0, 0])).toBe(true);     // a dot's centre
    expect(near(r.at(0.5, 0.5), [255, 255, 255])).toBe(true);  // a cell's corner
    const shares = {};
    for (const shape of ['circle', 'square', 'line']) {
      fx.set({ shape, color: 'ink', ink: '#000000' });
      await dispatchSeek(0.2 + Object.keys(shares).length / 10).done;
      r = read(canvas);
      shares[shape] = r.share(0, 1, ink);
    }
    // #c00000 is 0.16 light: each shape covers about 0.84 of a cell, the
    // circle a little less, since round dots that have joined leave the
    // cells' corners.
    expect(shares.square).toBeGreaterThan(0.78);
    expect(shares.line).toBeGreaterThan(0.78);
    expect(shares.circle).toBeGreaterThan(0.72);
    // A line screen at 0 degrees: rows of ink, the same in every column.
    fx.set({ shape: 'line' });
    await dispatchSeek(0.6).done;
    r = read(canvas);
    expect(runs(r.row(10)).length).toBe(1);
  });

  it('a halftone circle past half a cell grows into the next cells as a circle, in its own cell\'s colour', async () => {
    const { wf, canvas } = await stage('fx-circle-overflow');
    // The left half #400000, 0.053 light, the right half white: at cell 20
    // a dot of radius 0.69 cell, 13.9 px and the pixel of anti-aliasing,
    // centred at x = 90, beside an empty cell centred at x = 110.
    const split = source(200, 100, (g) => { g.fillStyle = '#400000'; g.fillRect(0, 0, 100, 100); g.fillStyle = '#ffffff'; g.fillRect(100, 0, 100, 100); });
    const fx = wf.kinetic.effect(canvas, { source: split, kind: 'halftone', cell: 20, angle: 0, shape: 'circle', color: 'source', paper: '#ffffff' });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    const r = read(canvas);
    // Across the cells' edge at x = 100 on the dots' centre row: ink to the
    // dot's radius, in the dot's own colour, and paper past it. Before, a
    // dot was cut at its cell's edge, a square on a turned grid.
    expect(near(r.at(101, 10), [0x40, 0, 0]), 'past the edge, inside the dot: ' + r.at(101, 10)).toBe(true);
    expect(near(r.at(108, 10), [255, 255, 255]), 'past the dot: ' + r.at(108, 10)).toBe(true);
    // On the row between two dots, 5 px into the empty cell is 18 px from
    // the nearest dot's centre, outside it.
    expect(ink(r.at(105, 20)), 'between the dots: ' + r.at(105, 20)).toBe(false);
    // The band 100 to 110 px holds each dot's overflow, the segment of a
    // 13.9 px circle past a chord 10 px from its centre, 51 px² in each
    // cell's 200: about a quarter, less the edge pixels anti-aliasing
    // leaves lighter than ink. Before, none.
    expect(r.share(0.5, 0.55, ink)).toBeGreaterThan(0.15);
    expect(r.share(0.5, 0.55, ink)).toBeLessThan(0.35);
  });

  it('stipple: as much ink as the source is dark, the same pixels on every draw, a new pattern for a new seed', async () => {
    const { wf, canvas } = await stage('fx3');
    const fx = wf.kinetic.effect(canvas, { source: source(200, 100, gray(128)), kind: 'stipple' });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    const a = read(canvas);
    expect(Math.abs(a.share(0, 1, ink) - 0.5)).toBeLessThan(0.03);
    fx.set({ seed: 2 });
    await dispatchSeek(0.2).done;
    const b = read(canvas);
    expect(b.hash()).not.toBe(a.hash());
    fx.set({ seed: 1 });
    await dispatchSeek(0.3).done;
    expect(read(canvas).hash()).toBe(a.hash());
    fx.set({ contrast: 1, density: 0.25 });
    await dispatchSeek(0.4).done;
    expect(Math.abs(read(canvas).share(0, 1, ink) - 0.75)).toBeLessThan(0.03);
  });

  it('dither: a Bayer matrix, half ink at middle grey with two levels, and steps between ink and paper with more', async () => {
    const { wf, canvas } = await stage('fx4');
    const fx = wf.kinetic.effect(canvas, { source: source(200, 100, gray(128)), kind: 'dither', matrix: 4, scale: 2 });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    let r = read(canvas);
    expect(r.share(0, 1, ink)).toBeCloseTo(0.5, 2);
    // The pattern repeats every matrix * scale = 8 px.
    const row = r.row(1).map(ink);
    for (let x = 0; x + 8 * r.s < row.length; x++) expect(row[x + 8 * r.s], 'x ' + x).toBe(row[x]);
    fx.set({ levels: 3, ink: '#000000', paper: '#ffffff' });
    await dispatchSeek(0.2).done;
    r = read(canvas);
    // At 0.5 with three levels, every pixel is the middle step.
    expect(near(r.at(3, 3), [128, 128, 128], 2)).toBe(true);
    for (const matrix of [2, 8]) {
      fx.set({ matrix, levels: 2 });
      await dispatchSeek(0.3 + matrix / 100).done;
      expect(read(canvas).share(0, 1, ink)).toBeCloseTo(0.5, 2);
    }
  });

  it('duotone: black to the shadow, white to the highlight, from an <img>', async () => {
    const { wf, host, canvas } = await stage('fx5', '<img id="pic" alt="" style="display:none">');
    const pic = host.querySelector('#pic');
    pic.src = source(20, 10, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 10, 10); g.fillStyle = '#fff'; g.fillRect(10, 0, 10, 10); }).toDataURL();
    const fx = wf.kinetic.effect(canvas, { source: pic, kind: 'duotone', shadow: '#1b1530', highlight: 'rgb(243, 234, 216)' });
    handles.push(fx);
    await wf.kinetic.ready();
    await dispatchSeek(0.1).done;
    const r = read(canvas);
    expect(near(r.at(25, 50), [0x1b, 0x15, 0x30]), r.at(25, 50).join(',')).toBe(true);
    expect(near(r.at(175, 50), [243, 234, 216]), r.at(175, 50).join(',')).toBe(true);
  });

  it('a <video> source shows the footage frame of each seek', async () => {
    const { wf, host, canvas } = await stage('fx6', `<video id="clip" src="${FOOTAGE}f30.webm" data-start="0" muted playsinline style="position:absolute;left:0;top:0;width:160px;height:90px"></video>`);
    host.firstElementChild.setAttribute('data-duration', '3');
    host.firstElementChild.setAttribute('data-fps', '30');
    wf.kinetic.config({});
    await wf.kinetic.ready();
    canvas.style.width = '160px'; canvas.style.height = '90px';
    const fx = wf.kinetic.effect(canvas, { source: host.querySelector('#clip'), kind: 'duotone' });
    handles.push(fx);
    const got = [], want = [];
    for (const t of [0.5, 2, 1 / 30, 1.2, 0.5]) {
      await dispatchSeek(t).done;
      got.push(shownFrame(canvas));
      want.push(footageFrame(t));
    }
    expect(got).toEqual(want);
  });

  it('an effect whose parameters and source have not changed is not drawn again', async () => {
    const { wf, host, canvas } = await stage('fx7', '<img id="pic" alt="" style="display:none">');
    const pic = host.querySelector('#pic');
    pic.src = source(20, 10, gray(100)).toDataURL();
    await pic.decode();
    const fx = wf.kinetic.effect(canvas, { source: pic, kind: 'halftone' });
    handles.push(fx);
    const gl = canvas.getContext('webgl2');
    let draws = 0;
    const orig = gl.drawArrays.bind(gl);
    gl.drawArrays = (...a) => { draws++; return orig(...a); };
    for (const t of [0.1, 0.2, 0.3]) await dispatchSeek(t).done;
    expect(draws).toBe(1);
    fx.set({ cell: 14 });
    await dispatchSeek(0.4).done;
    expect(draws).toBe(2);
    fx.set({ cell: 14 });
    await dispatchSeek(0.5).done;
    expect(draws).toBe(2);
  });

  it('a scene that sets its effect on every seek passes check()', async () => {
    const { wf } = await load();
    const { effect, ramp: rampOf } = wf.kinetic;
    const name = uniqueName('fxscene');
    scenesToDrop.push(name);
    const src = source(160, 90, gray(128));
    wf.kinetic.scene(name, {
      init() { this.fx = effect(this.element.querySelector('canvas'), { scene: this, source: src, kind: 'halftone', cell: 16 }); handles.push(this.fx); },
      seek(local) { this.fx.set({ density: rampOf(local, 0, 1) - 0.5 }); },
    });
    const host = await mount(`<div data-composition-id="fx8" data-start="0" data-duration="1" data-fps="10" data-width="160" data-height="90" style="position:relative;width:160px;height:90px">
      <div data-component="${name}" data-start="0" data-duration="1" style="position:absolute;inset:0"><canvas style="position:absolute;left:0;top:0;width:160px;height:90px"></canvas></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const report = await wf.kinetic.check({ samples: 10 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
    // Live at 0.2 s (density -0.3) and at 0.8 s (density 0.3): the ink differs.
    const canvas = host.querySelector('canvas');
    await dispatchSeek(0.2).done;
    const early = read(canvas).share(0, 1, ink);
    await dispatchSeek(0.8).done;
    expect(read(canvas).share(0, 1, ink)).toBeGreaterThan(early + 0.3);
  });

  it('halftone at full darkness prints solid ink, in every shape', async () => {
    const { wf, canvas } = await stage('fx13');
    const fx = wf.kinetic.effect(canvas, { source: source(200, 100, gray(0)), kind: 'halftone', cell: 20 });
    handles.push(fx);
    for (const [k, shape] of ['circle', 'square', 'line'].entries()) {
      fx.set({ shape });
      await dispatchSeek(0.1 + k / 10).done;
      expect(read(canvas).share(0, 1, ink), shape).toBeGreaterThan(0.999);
    }
  });

  it('an <img> source that loads while the clock is paused is drawn when it loads', async () => {
    const { wf, host, canvas } = await stage('fx14', '<img id="pic" alt="" style="display:none">');
    const pic = host.querySelector('#pic');
    const fx = wf.kinetic.effect(canvas, { source: pic, kind: 'duotone', shadow: '#ff0000' });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    expect(read(canvas).at(100, 50)[3], 'nothing drawn before the image').toBe(0);
    pic.src = source(20, 10, gray(0)).toDataURL();
    await new Promise((r) => { pic.onload = r; });
    await tick(0);
    expect(near(read(canvas).at(100, 50), [255, 0, 0])).toBe(true);
  });

  it('a canvas with no CSS size of its own keeps its size at a device pixel ratio of 2 and draws at twice it; inside a transform that halves it, at its shown size', async () => {
    const own = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => 2 });
    try {
      const { wf, host } = await stage('fx15', `<canvas id="plain" width="96" height="54"></canvas>
        <div style="position:absolute;left:0;top:0;transform:scale(0.5);transform-origin:0 0"><canvas id="half" style="display:block;width:96px;height:54px"></canvas></div>`);
      const plain = host.querySelector('#plain'), half = host.querySelector('#half');
      const src = source(20, 10, gray(80));
      handles.push(wf.kinetic.effect(plain, { source: src, kind: 'duotone' }), wf.kinetic.effect(half, { source: src, kind: 'duotone' }));
      for (const t of [0.1, 0.2, 0.3, 0.4]) await dispatchSeek(t).done;
      expect([plain.width, plain.height, plain.clientWidth, plain.clientHeight]).toEqual([192, 108, 96, 54]);
      expect([half.width, half.height, half.clientWidth]).toEqual([96, 54, 96]);
    } finally {
      if (own) Object.defineProperty(window, 'devicePixelRatio', own);
      else delete window.devicePixelRatio;
    }
  });

  it('seed is a whole number (KN-100)', async () => {
    const { wf, canvas } = await stage('fx16');
    let err = null;
    try { wf.kinetic.effect(canvas, { source: source(10, 10, gray(0)), kind: 'stipple', seed: 1.5 }); } catch (e) { err = e; }
    expectKN(err, 'KN-100', 'effect(canvas, { seed })', /^seed is a whole number/);
  });

  it('an effect whose canvas is taken off the page is released at the next seek', async () => {
    const { wf, canvas } = await stage('fx17');
    const fx = wf.kinetic.effect(canvas, { source: source(20, 10, gray(80)), kind: 'dither' });
    handles.push(fx);
    const gl = canvas.getContext('webgl2');
    await dispatchSeek(0.1).done;
    canvas.remove();
    await dispatchSeek(0.2).done;
    await tick(0);
    expect(gl.isContextLost()).toBe(true);
  });

  it('an effect made with scene: this is released when the scene is removed, with no seek after, also on a canvas outside the scene; one made without a scene is not', async () => {
    const { wf, host, canvas: outside } = await stage('fx19', '<canvas id="top" style="position:absolute;left:0;top:0;width:20px;height:10px"></canvas>');
    const name = uniqueName('fxown');
    scenesToDrop.push(name);
    let destroyed = 0;
    const made = [];
    wf.kinetic.scene(name, {
      init() {
        made.push(wf.kinetic.effect(this.element.querySelector('canvas'), { scene: this, source: source(20, 10, gray(80)), kind: 'dither' }));
        made.push(wf.kinetic.effect(outside, { scene: this, source: source(20, 10, gray(80)), kind: 'stipple' }));
      },
      beforeDestroy() { destroyed++; },
    });
    const top = host.querySelector('#top');
    const free = wf.kinetic.effect(top, { source: source(20, 10, gray(80)), kind: 'duotone' });
    handles.push(free, ...made);
    host.firstElementChild.insertAdjacentHTML('beforeend', `<div class="sc" data-component="${name}" data-start="0" data-duration="1"><canvas style="display:block;width:20px;height:10px"></canvas></div>`);
    wf.scan(host);
    await wf.whenIdle();
    await wf.kinetic.ready();
    expect(made.length, 'the scene made its two effects').toBe(2);
    await dispatchSeek(0.1).done;
    const own = host.querySelector('.sc canvas').getContext('webgl2');
    const out = outside.getContext('webgl2'), kept = top.getContext('webgl2');
    expect([own.isContextLost(), out.isContextLost(), kept.isContextLost()]).toEqual([false, false, false]);
    host.querySelector('.sc').remove();
    for (let i = 0; i < 100 && !destroyed; i++) await tick(10);
    expect(destroyed).toBe(1);
    await tick(0);
    expect([own.isContextLost(), out.isContextLost(), kept.isContextLost()], 'its own canvas, the canvas outside it, the free effect').toEqual([true, true, false]);
  });

  it('a context the browser loses is warned about in development, and drawn again once restored', async () => {
    const { wf, canvas } = await stage('fx18');
    const fx = wf.kinetic.effect(canvas, { source: source(200, 100, gray(0)), kind: 'duotone', shadow: '#00ff00' });
    handles.push(fx);
    await dispatchSeek(0.1).done;
    const gl = canvas.getContext('webgl2');
    const ext = gl.getExtension('WEBGL_lose_context');
    const lines = await captureWarnings(async () => {
      ext.loseContext();
      await new Promise((r) => canvas.addEventListener('webglcontextlost', r, { once: true }));
      await tick(0);
    });
    const kn = lines.filter((l) => l.includes('KN-191'));
    if (BUILD === 'dev') expect(kn.length, lines.join(' || ')).toBe(1);
    else expect(kn).toEqual([]);
    ext.restoreContext();
    await new Promise((r) => canvas.addEventListener('webglcontextrestored', r, { once: true }));
    await dispatchSeek(0.2).done;
    expect(near(read(canvas).at(100, 50), [0, 255, 0])).toBe(true);
  });

  it('a scene added after load with an effect in its init, then ready(): drawn on the next seek', async () => {
    const { wf } = await load();
    const name = uniqueName('fxlate');
    scenesToDrop.push(name);
    const src = source(160, 90, gray(0));
    const host = await mount(`<div data-composition-id="fx9" data-start="0" data-duration="1" data-fps="10" style="position:relative;width:160px;height:90px"></div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    wf.kinetic.scene(name, { init() { handles.push(wf.kinetic.effect(this.element.querySelector('canvas'), { scene: this, source: src, kind: 'duotone', shadow: '#ff0000' })); } });
    host.firstElementChild.insertAdjacentHTML('beforeend', `<div data-component="${name}" data-start="0" data-duration="1"><canvas style="display:block;width:160px;height:90px"></canvas></div>`);
    wf.scan(host);
    await wf.whenIdle();
    await wf.kinetic.ready();
    await dispatchSeek(0.5).done;
    expect(near(read(host.querySelector('canvas')).at(80, 45), [255, 0, 0])).toBe(true);
  });

  it('KN-100 for a bad call: the canvas, the source, the kind, a parameter and its value, and a canvas with no WebGL 2', async () => {
    const { wf, canvas } = await stage('fx10');
    const { effect } = wf.kinetic;
    const src = source(10, 10, gray(0));
    // The argument is in the where on every build, and the development sentence says what it takes.
    expectKN(() => effect(document.createElement('div'), { source: src, kind: 'halftone' }), 'KN-100', 'effect(canvas)', /^canvas is a <canvas> element/);
    expectKN(() => effect(canvas, null), 'KN-100', 'effect(…, options)', /^options is \{ scene, source, kind/);
    expectKN(() => effect(canvas, { source: document.createElement('div'), kind: 'halftone' }), 'KN-100', 'effect(canvas, { source })', /<img>, <video> or <canvas>/);
    expectKN(() => effect(canvas, { source: src, kind: 'ascii' }), 'KN-100', 'effect(canvas, { kind })', /halftone, stipple, dither, duotone.*ascii/);
    expectKN(() => effect(canvas, { source: src, kind: 'halftone', size: 4 }), 'KN-100', 'effect(canvas, { size })', /^'size' is not a parameter of halftone; .*cell/);
    expectKN(() => effect(canvas, { source: src, kind: 'halftone', cell: -1 }), 'KN-100', 'effect(canvas, { cell })', /^cell is a number of px above 0, not -1/);
    expectKN(() => effect(canvas, { source: src, kind: 'halftone', shape: 'star' }), 'KN-100', 'effect(canvas, { shape })', /circle, square or line/);
    expectKN(() => effect(canvas, { source: src, kind: 'halftone', ink: 'blue' }), 'KN-100', 'effect(canvas, { ink })', /^ink is a colour/);
    expectKN(() => effect(canvas, { source: src, kind: 'dither', matrix: 3 }), 'KN-100', 'effect(canvas, { matrix })', /^matrix is 2, 4 or 8/);
    expectKN(() => effect(canvas, { source: src, kind: 'dither', levels: 17 }), 'KN-100', 'effect(canvas, { levels })', /^levels is a whole number from 2 to 16/);
    expectKN(() => effect(canvas, { source: src, kind: 'stipple', density: 2 }), 'KN-100', 'effect(canvas, { density })', /^density is a number from -1 to 1/);
    // tone, the old name for density, is no parameter.
    expectKN(() => effect(canvas, { source: src, kind: 'halftone', tone: 0.2 }), 'KN-100', 'effect(canvas, { tone })', /^'tone' is not a parameter of halftone/);
    const flat = document.createElement('canvas');
    flat.getContext('2d');
    // A canvas with no WebGL 2 is a different mistake from an element that is no canvas.
    expectKN(() => effect(flat, { source: src, kind: 'duotone' }), 'KN-100', 'effect(canvas): WebGL 2', /WebGL 2/);
    const fx = effect(canvas, { source: src, kind: 'stipple' });
    handles.push(fx);
    expectKN(() => fx.set({ cell: 3 }), 'KN-100', 'set({ cell })', /^'cell' is not a parameter of stipple/);
    expectKN(() => fx.set({ kind: 'dither' }), 'KN-100', 'set({ kind })');
  });

  it('KN-204: a source from another origin without CORS throws at its first draw, with its URL, once, and the effect waits for another source', async () => {
    // The test server under another loopback name, which is another origin
    // (the server can listen on one address family only).
    let other = null;
    for (const name of ['[::1]', '127.0.0.1', 'localhost']) {
      const origin = location.protocol + '//' + name + ':' + location.port;
      if (origin === location.origin) continue;
      try { await fetch(origin + '/packages/kinetic/test/fixtures/ramp.png', { mode: 'no-cors' }); other = origin; break; } catch (_) { /* not listening there */ }
    }
    expect(other, 'the test server answers under another loopback name').not.toBeNull();
    const url = other + '/packages/kinetic/test/fixtures/ramp.png';
    const { wf, host, canvas } = await stage('fx11', `<img id="far" alt="" src="${url}" style="display:none">`);
    const pic = host.querySelector('#far');
    await pic.decode();
    handles.push(wf.kinetic.effect(canvas, { source: pic, kind: 'duotone', shadow: '#0000ff' }));
    const gl = canvas.getContext('webgl2');
    let uploads = 0;
    const orig = gl.texImage2D.bind(gl);
    gl.texImage2D = (...a) => { uploads++; return orig(...a); };
    const err = await dispatchSeek(0.1).done.catch((e) => e);
    expectKN(err, 'KN-204', 'effect(): the source img#far (' + url + ')', /^it is from another origin without CORS, so WebGL cannot read it; give it crossorigin/);
    // Later seeks neither throw nor try the source again.
    const later = [];
    for (const t of [0.2, 0.3, 0.4, 0.5]) later.push(await dispatchSeek(t).done.then(() => 'ok', (e) => e.code));
    expect(later).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(uploads).toBe(1);
    // A source of this origin is drawn.
    pic.src = source(20, 10, gray(0)).toDataURL();
    await new Promise((r) => { pic.onload = r; });
    await dispatchSeek(0.6).done;
    expect(near(read(canvas).at(100, 50), [0, 0, 255])).toBe(true);
  });

  it('a second effect() on a canvas with a live effect is KN-100, and the first draws on; once it is disposed the canvas takes no other', async () => {
    const { wf, canvas } = await stage('fx13');
    const { effect } = wf.kinetic;
    const src = source(200, 100, gray(100));
    const a = effect(canvas, { source: src, kind: 'dither' });
    handles.push(a);
    expectKN(() => effect(canvas, { source: src, kind: 'duotone' }), 'KN-100', 'effect(canvas)', /already has a live dither effect/);
    await dispatchSeek(0.1).done;
    expect(canvas.getContext('webgl2').isContextLost()).toBe(false);
    a.dispose();
    expectKN(() => effect(canvas, { source: src, kind: 'duotone' }), 'KN-100', 'effect(canvas): WebGL 2');
  });

  it('dispose() releases the context, and the effect is drawn no more', async () => {
    const { wf, canvas } = await stage('fx12');
    const fx = wf.kinetic.effect(canvas, { source: source(200, 100, gray(100)), kind: 'dither' });
    const gl = canvas.getContext('webgl2');
    await dispatchSeek(0.1).done;
    expect(gl.isContextLost()).toBe(false);
    fx.dispose();
    await tick(0);
    expect(gl.isContextLost()).toBe(true);
    let draws = 0;
    gl.drawArrays = () => { draws++; };
    fx.set({ matrix: 8 });
    await dispatchSeek(0.2).done;
    expect(draws).toBe(0);
  });
});
