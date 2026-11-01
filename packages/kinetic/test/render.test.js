/**
 * render(): an MP4 from the page through WebCodecs, in the installed Chrome
 * with HTML-in-canvas enabled (vitest.render.config.js). A DOM composition
 * is wrapped, drawn and unwrapped; a canvas source is captured as it is;
 * the file decodes in a <video> element to the right length, size and
 * colours; VP9 and AV1 write too; KN-201 names the flag when the browser
 * lacks drawElementImage. The shutter: the streak of a moving square, a cut
 * that stays a cut, smear() not blurred twice, a canvas source averaged,
 * config({ shutter }) as the default, the same pixels on every run, and
 * KN-100 for a bad shutter.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { load, mount, tick, dispatchSeek, uniqueName, expectKN, captureWarnings, framedPage, FOOTAGE, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

// Decodes the file in a <video> and draws the frame at `at` seconds to a
// canvas: the file's duration and the frame as ImageData.
async function frameAt(blob, at) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  document.body.appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('video failed to load: ' + (v.error && v.error.message))); });
    v.currentTime = at;
    await new Promise((res) => { v.onseeked = () => res(); });
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return { duration: v.duration, img: c.getContext('2d').getImageData(0, 0, c.width, c.height) };
  } finally {
    v.remove();
    URL.revokeObjectURL(url);
  }
}

// The file's metadata, and the pixel at (x, y) at `at` seconds.
async function probeVideo(blob, at, x, y) {
  const { duration, img } = await frameAt(blob, at);
  const i = (y * img.width + x) * 4;
  return { duration, width: img.width, height: img.height, px: [img.data[i], img.data[i + 1], img.data[i + 2]] };
}

const near = (px, rgb, tol = 24) => px.every((c, i) => Math.abs(c - rgb[i]) <= tol);

// The centre of the pixels `match` picks in a frame, in pixel coordinates.
function centroid(img, match) {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (match(img.data[i], img.data[i + 1], img.data[i + 2])) { n++; sx += x + 0.5; sy += y + 0.5; }
    }
  }
  return n ? { x: sx / n, y: sy / n, n } : null;
}

describe(`render() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a DOM composition: wrapped in a canvas under both opt-in names, drawn, encoded, unwrapped, and the file decodes with the right frames', async () => {
    const { wf } = await load();
    expect(typeof VideoEncoder).toBe('function');
    const name = uniqueName('scene');
    // Blue for the first half, red for the second: a step a codec cannot blur.
    wf.kinetic.scene(name, { computed: { bg() { return { background: this.local < 0.5 ? '#2040c0' : '#c02020' }; } } });
    const host = await mount(`<div data-composition-id="rv1" data-start="0" data-duration="1" data-width="320" data-height="180" data-fps="10" style="width:320px;height:180px;position:relative;overflow:hidden">
      <div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="bg" style="position:absolute;inset:0"></div></div>
    </div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    wf.kinetic.seek(0.3);
    const progress = [];
    let wrapper = null;
    const r = await wf.kinetic.render({ download: false, bitrate: 2e6, onProgress: (i, n) => {
      progress.push([i, n]);
      // Chrome renamed the canvas opt-in: layoutsubtree before 155 (or 156),
      // content="drawable" after; from 157 the drawn element itself must be
      // marked drawable.
      if (i === 1) {
        const c = root.parentElement;
        wrapper = c.tagName + ' layoutsubtree=' + c.hasAttribute('layoutsubtree') + ' content=' + c.getAttribute('content') + ' root drawable=' + root.hasAttribute('drawable');
      }
    } });
    expect(wrapper).toBe('CANVAS layoutsubtree=true content=drawable root drawable=true');
    expect(root.hasAttribute('drawable'), 'drawable is taken off after the render').toBe(false);
    expect(r.frames).toBe(10);
    expect(r.width).toBe(320); expect(r.height).toBe(180); expect(r.fps).toBe(10);
    expect(r.name).toBe('rv1.mp4');
    expect(r.blob.type).toBe('video/mp4');
    expect(r.blob.size).toBeGreaterThan(1000);
    expect(progress.length).toBe(10); expect(progress[9]).toEqual([10, 10]);
    // The page is as it was: the root back under its host, no wrapper left, the clock restored.
    expect(root.parentElement).toBe(host);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    expect(wf.getStore('kinetic').time).toBe(0.3);
    const early = await probeVideo(r.blob, 0.15, 160, 90);
    expect(early.width).toBe(320); expect(early.height).toBe(180);
    expect(Math.abs(early.duration - 1)).toBeLessThan(0.15);
    expect(near(early.px, [0x20, 0x40, 0xc0]), early.px.join(',')).toBe(true);
    const late = await probeVideo(r.blob, 0.75, 160, 90);
    expect(near(late.px, [0xc0, 0x20, 0x20]), late.px.join(',')).toBe(true);
  });

  it('scenes on consecutive clips, hidden outside them: each drawn on its own frames, its first frame included, from local', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    // Red, green, blue by the clip, dark in its first half and bright after.
    const colours = [[[0x60, 0, 0], [0xe0, 0x20, 0x20]], [[0, 0x60, 0], [0x20, 0xe0, 0x20]], [[0, 0, 0x60], [0x20, 0x20, 0xe0]]];
    wf.kinetic.scene(name, {
      seek(local) {
        const c = colours[Number(this.element.dataset.i)][local < 0.5 ? 0 : 1];
        const ctx = this.element.querySelector('canvas').getContext('2d');
        ctx.fillStyle = 'rgb(' + c.join(',') + ')';
        ctx.fillRect(0, 0, 320, 180);
      },
    });
    const clips = [0, 1, 2].map((i) => `<div data-i="${i}" data-component="${name}" data-start="${i}" data-duration="1" style="position:absolute;inset:0"><canvas width="320" height="180" style="position:absolute;inset:0"></canvas></div>`).join('');
    const host = await mount(`<div data-composition-id="rvh" data-start="0" data-duration="3" data-width="320" data-height="180" data-fps="10" style="width:320px;height:180px;position:relative;overflow:hidden;background:#fff">${clips}</div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    // The two later scenes have drawn their first frame while hidden.
    wf.kinetic.seek(0.5);
    await tick(0);
    const r = await wf.kinetic.render({ download: false, bitrate: 2e6 });
    expect(r.frames).toBe(30);
    for (const [at, c] of [[0.05, colours[0][0]], [0.75, colours[0][1]], [1.05, colours[1][0]], [1.75, colours[1][1]], [2.05, colours[2][0]], [2.75, colours[2][1]]]) {
      const p = await probeVideo(r.blob, at, 160, 90);
      expect(near(p.px, c), at + ' s: ' + p.px.join(',')).toBe(true);
    }
  });

  it('a transition between two clips is in the file: a mid-transition frame holds both clips', async () => {
    const { wf } = await load();
    // Blue from 0 to 1.5 s, red from 0.5 s wiping in from the left over the
    // overlap, 0.5 to 1.5 s, whose last frame at 10 fps is 1.4 s.
    const host = await mount(`<div data-composition-id="rv11" data-start="0" data-duration="2" data-width="320" data-height="180" data-fps="10" style="width:320px;height:180px;position:relative;overflow:hidden">
      <div id="blue" style="position:absolute;inset:0;background:#2040c0" data-start="0" data-duration="1.5"></div>
      <div style="position:absolute;inset:0;background:#c02020" data-start="blue - 1" data-duration="1.5" data-clip-transition="wipe from-left linear"></div>
    </div>`);
    cleanup.push(host);
    // From 0 s, where neither clip has a transition style: the render puts the
    // page back at the time it found (an earlier test can leave the clock at a
    // time where the wipe has begun).
    wf.kinetic.seek(0);
    await tick(0);
    const r = await wf.kinetic.render({ download: false, bitrate: 2e6 });
    expect(r.frames).toBe(20);
    // Frame 9, 0.9 s: p = 0.4 / 0.9, so red covers the left 44% and blue the rest.
    const left = await probeVideo(r.blob, 0.92, 40, 90);
    expect(near(left.px, [0xc0, 0x20, 0x20]), 'left ' + left.px.join(',')).toBe(true);
    const right = await probeVideo(r.blob, 0.92, 280, 90);
    expect(near(right.px, [0x20, 0x40, 0xc0]), 'right ' + right.px.join(',')).toBe(true);
    const before = await probeVideo(r.blob, 0.22, 40, 90);
    expect(near(before.px, [0x20, 0x40, 0xc0]), 'before ' + before.px.join(',')).toBe(true);
    const after = await probeVideo(r.blob, 1.62, 280, 90);
    expect(near(after.px, [0xc0, 0x20, 0x20]), 'after ' + after.px.join(',')).toBe(true);
    // The page is left with no transition style on either clip.
    expect([...host.querySelectorAll('[data-composition-id] > [data-start]')].map((el) => el.style.clipPath).join('|')).toBe('|');
  });

  // A luma transition's mask is an SVG filter on the clip: the file's frame
  // has the incoming clip revealed where the live page has it, half by half.
  it('a halftone and a luma transition are in the file: each frame revealed as the live page is at that time', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="rv14" data-start="0" data-duration="3" data-width="200" data-height="100" data-fps="10" style="position:fixed;left:0;top:0;width:200px;height:100px;overflow:hidden;background:#ff0000">
      <div id="red" style="position:absolute;inset:0;background:#ff0000" data-start="0" data-duration="1.5"></div>
      <div id="blue" style="position:absolute;inset:0;background:#0000ff" data-start="red - 1" data-duration="1.5" data-clip-transition="halftone from-left 20px linear"></div>
      <div style="position:absolute;inset:0;background:#00ff00" data-start="blue - 0.5" data-duration="1.5" data-clip-transition="luma url(/packages/kinetic/test/fixtures/ramp.png) soft linear"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const root = host.firstElementChild;
    // The share of each half that is blue, and that is green, from RGBA data.
    const shares = (d, w, h) => {
      const out = [0, 0, 0, 0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, half = x < w / 2 ? 0 : 1;
        if (d[i + 2] > 160 && d[i] < 100) out[half]++;
        if (d[i + 1] > 160 && d[i] < 100) out[2 + half]++;
      }
      return out.map((n) => n / (w * h / 2));
    };
    // The halftone runs 0.5 to 1.5 s, the luma 1.5 to 2 s.
    const times = [0.6, 1, 1.2, 1.6, 1.8];
    const live = [];
    for (const t of times) {
      await dispatchSeek(t).done;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const img = new Image();
      img.src = 'data:image/png;base64,' + await page.screenshot({ save: false, element: root });
      await img.decode();
      const c = document.createElement('canvas');
      c.width = 200; c.height = 100;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, 200, 100);
      live.push(shares(g.getImageData(0, 0, 200, 100).data, 200, 100));
    }
    // Under way at each time: some of the incoming clip shown, not all.
    expect(live[1][0]).toBeGreaterThan(live[1][1] + 0.2);
    expect(live[3][2]).toBeGreaterThan(live[3][3] + 0.2);
    const r = await wf.kinetic.render({ download: false, bitrate: 6e6 });
    expect(r.frames).toBe(30);
    for (let k = 0; k < times.length; k++) {
      const { img } = await frameAt(r.blob, times[k] + 0.02);
      const got = shares(img.data, img.width, img.height);
      got.forEach((v, j) => expect(Math.abs(v - live[k][j]), 'at ' + times[k] + ' s, share ' + j + ': file ' + got.map((x) => x.toFixed(3)) + ', live ' + live[k].map((x) => x.toFixed(3))).toBeLessThan(0.06));
    }
  });

  // effect() draws into a WebGL canvas after each seek; the file's frame has
  // the ink the live canvas has at the same time.
  it('an effect is in the file: each frame inked as the live canvas is at that time', async () => {
    const { wf } = await load();
    const { effect, ramp } = wf.kinetic;
    const name = uniqueName('fxscene');
    const src = document.createElement('canvas');
    src.width = 160; src.height = 90;
    const g = src.getContext('2d');
    g.fillStyle = 'rgb(128, 128, 128)'; g.fillRect(0, 0, 160, 90);
    let fx = null;
    wf.kinetic.scene(name, {
      init() { fx = effect(this.element.querySelector('canvas'), { scene: this, source: src, kind: 'halftone', cell: 16 }); },
      seek(local) { fx.set({ density: ramp(local, 0, 1) - 0.5 }); },
    });
    const host = await mount(`<div data-composition-id="rv15" data-start="0" data-duration="1" data-fps="10" data-width="160" data-height="90" style="position:relative;width:160px;height:90px">
      <div data-component="${name}" data-start="0" data-duration="1" style="position:absolute;inset:0"><canvas style="position:absolute;left:0;top:0;width:160px;height:90px"></canvas></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    // The share of a 160 x 90 drawing that is ink.
    const inkOf = (el) => {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 90;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(el, 0, 0, 160, 90);
      const d = x.getImageData(0, 0, 160, 90).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 192) n++;
      return n / (160 * 90);
    };
    const canvas = host.querySelector('canvas');
    const live = [];
    for (const t of [0.2, 0.8]) { await dispatchSeek(t).done; live.push(inkOf(canvas)); }
    expect(live[1]).toBeGreaterThan(live[0] + 0.3);
    const r = await wf.kinetic.render({ download: false, bitrate: 4e6 });
    expect(r.frames).toBe(10);
    const url = URL.createObjectURL(r.blob);
    const v = document.createElement('video');
    v.muted = true; v.src = url;
    document.body.appendChild(v);
    try {
      await new Promise((res) => { v.onloadeddata = res; });
      for (const [k, t] of [0.2, 0.8].entries()) {
        v.currentTime = t + 0.05;
        await new Promise((res) => { v.onseeked = res; });
        expect(Math.abs(inkOf(v) - live[k]), 'at ' + t + ' s').toBeLessThan(0.08);
      }
    } finally { v.remove(); URL.revokeObjectURL(url); fx.dispose(); }
  });

  it('blur() and a light layer are in the file: the masked half blurred, the other sharp, the light screened over its corner', async () => {
    const { wf } = await load();
    const name = uniqueName('blurscene');
    wf.kinetic.scene(name, {
      init() {
        wf.kinetic.blur(this.element.querySelector('.over'), { scene: this, radius: 6, marks: (m) => m.fill({ clip: { rect: [0, 0, 80, 90] } }) });
        wf.kinetic.shade(this.element.querySelector('canvas'), { scene: this, kind: 'light', marks: (m) => m.glow({ at: [160, 0], radius: 50, ink: '#ff0000' }) });
      },
    });
    const host = await mount(`<div data-composition-id="rv-blur" data-start="0" data-duration="0.5" data-fps="10" data-width="160" data-height="90" style="position:relative;width:160px;height:90px;background:repeating-linear-gradient(90deg,#000 0 4px,#fff 4px 8px)">
      <div data-component="${name}" data-start="0" data-duration="0.5" style="position:absolute;inset:0">
        <div class="over" style="position:absolute;inset:0"></div>
        <canvas style="position:absolute;left:0;top:0;width:160px;height:90px"></canvas>
      </div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    // The spread of brightness along a row of x0..x1 at y, and the red over green at a point.
    const measure = (el) => {
      const c = document.createElement('canvas');
      c.width = 160; c.height = 90;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(el, 0, 0, 160, 90);
      const spread = (x0, x1, y) => {
        const d = x.getImageData(x0, y, x1 - x0, 1).data;
        let lo = 255, hi = 0;
        for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; lo = Math.min(lo, v); hi = Math.max(hi, v); }
        return hi - lo;
      };
      const corner = x.getImageData(152, 4, 1, 1).data;
      return { blurred: spread(20, 60, 60), sharp: spread(100, 130, 60), red: corner[0] - corner[1] };
    };
    const r = await wf.kinetic.render({ download: false, bitrate: 6e6 });
    const url = URL.createObjectURL(r.blob);
    const v = document.createElement('video');
    v.muted = true; v.src = url;
    document.body.appendChild(v);
    try {
      await new Promise((res) => { v.onloadeddata = res; });
      v.currentTime = 0.25;
      await new Promise((res) => { v.onseeked = res; });
      const m = measure(v);
      expect(m.sharp).toBeGreaterThan(150);
      expect(m.blurred).toBeLessThan(m.sharp / 3);
      expect(m.red).toBeGreaterThan(60);
    } finally { v.remove(); URL.revokeObjectURL(url); }
  });

  it('every frame of a DOM render is the frame for its own time, none a frame late', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    // Frame i paints a block whose colour encodes i: red = 25 * i.
    wf.kinetic.scene(name, { computed: { bg() { return { background: 'rgb(' + Math.round(this.clipFrame) * 25 + ', 0, 0)' }; } } });
    const host = await mount(`<div data-composition-id="rv5" data-start="0" data-duration="1" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative"><div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="bg" style="position:absolute;inset:0"></div></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.render({ download: false, bitrate: 2e6 });
    expect(r.frames).toBe(10);
    const reds = [];
    for (let i = 0; i < 10; i++) {
      const v = await probeVideo(r.blob, i / 10 + 0.02, 80, 45);
      reds.push(v.px[0]);
    }
    const expected = reds.map((_, i) => 25 * i);
    const offBy = reds.map((v, i) => Math.round((v - expected[i]) / 25));
    expect(offBy, 'red per frame: ' + reds.join(',')).toEqual(new Array(10).fill(0));
  });

  // Chrome's drawElementImage drew a canvas that was already on screen when
  // the render wrapped the page from its last composited image, so a WebGL
  // view redrawn on every seek came out frozen at the moment Render was
  // pressed (Empty Docks, 2026-10-08). The canvas here is on screen first,
  // is cleared on each seek to a red that encodes the frame, and has a white
  // square over it that must stay on top.
  it('a WebGL canvas already on screen when the render starts is captured fresh on every frame, under what covers it', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let gl = null;
    wf.kinetic.scene(name, {
      seek() {
        if (!gl) gl = this.element.querySelector('canvas').getContext('webgl', { preserveDrawingBuffer: true });
        gl.clearColor(Math.round(this.clipFrame) * 25 / 255, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      },
    });
    const host = await mount(`<div data-composition-id="rv12" data-start="0" data-duration="1" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative">
      <div data-component="${name}" style="position:absolute;inset:0">
        <canvas width="160" height="90" style="position:absolute;left:0;top:0;width:160px;height:90px"></canvas>
        <div style="position:absolute;left:0;top:0;width:40px;height:30px;background:#ffffff"></div>
      </div>
    </div>`);
    cleanup.push(host);
    // On screen, and composited, before the render begins.
    wf.kinetic.seek(0.3);
    for (let k = 0; k < 4; k++) await new Promise((r) => requestAnimationFrame(r));
    const canvas = host.querySelector('canvas');
    const r = await wf.kinetic.render({ download: false, bitrate: 2e6 });
    expect(r.frames).toBe(10);
    const reds = [];
    for (let i = 0; i < 10; i++) reds.push((await probeVideo(r.blob, i / 10 + 0.02, 120, 60)).px[0]);
    const offBy = reds.map((v, i) => Math.round((v - 25 * i) / 25));
    expect(offBy, 'red per frame: ' + reds.join(',')).toEqual(new Array(10).fill(0));
    const square = await probeVideo(r.blob, 0.52, 20, 15);
    expect(near(square.px, [255, 255, 255]), 'the square over the canvas ' + square.px.join(',')).toBe(true);
    // The page is as it was: the canvas shown, nothing added beside it.
    expect(canvas.style.visibility).toBe('');
    expect(host.querySelectorAll('canvas').length).toBe(1);
  });

  // Chrome clips a canvas inside the render's canvas to its drawing size at
  // the origin its layout offsets would give it (probed 2026-10-10), so a
  // canvas away from the top left, or drawn smaller than its box, came out
  // cut off or missing. Each one here is whole in the file, where it is on the page.
  it('a canvas anywhere in the composition, in normal flow or positioned, inside an offset box, or drawn smaller than its box, is in the file whole', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="rv16" data-start="0" data-duration="0.2" data-width="320" data-height="160" data-fps="10" style="width:320px;height:160px;position:relative;background:#000">
      <div style="display:flex;padding:10px 0 0 40px"><div style="width:30px;height:20px"></div><canvas id="flow" width="60" height="40" style="width:60px;height:40px"></canvas></div>
      <canvas id="abs" width="80" height="40" style="position:absolute;left:200px;top:100px;width:80px;height:40px"></canvas>
      <div style="position:absolute;left:150px;top:20px;width:100px;height:60px;border:5px solid #000"><canvas id="nested" width="50" height="30" style="position:absolute;left:20px;top:10px;width:50px;height:30px"></canvas></div>
      <canvas id="small" width="10" height="5" style="position:absolute;left:20px;top:90px;width:100px;height:50px;image-rendering:pixelated"></canvas>
    </div>`);
    cleanup.push(host);
    const paint = (id, colour) => { const c = host.querySelector('#' + id), g = c.getContext('2d'); g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height); };
    paint('flow', '#ff0000'); paint('abs', '#00ff00'); paint('nested', '#0000ff'); paint('small', '#ffff00');
    // The pixel on the page each box covers: its corners, 3 px in, and its middle.
    const boxes = { flow: [[70, 10], [60, 40]], abs: [[200, 100], [80, 40]], nested: [[175, 35], [50, 30]], small: [[20, 90], [100, 50]] };
    const colours = { flow: [255, 0, 0], abs: [0, 255, 0], nested: [0, 0, 255], small: [255, 255, 0] };
    const r = await wf.kinetic.render({ download: false, bitrate: 4e6 });
    const { img } = await frameAt(r.blob, 0.05);
    const at = (x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
    for (const [id, [[x, y], [w, h]]] of Object.entries(boxes)) {
      for (const [px, py] of [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4], [x + (w >> 1), y + (h >> 1)]]) {
        expect(near(at(px, py), colours[id]), id + ' at ' + px + ',' + py + ': ' + at(px, py).join(',')).toBe(true);
      }
      // Nothing of it outside its box.
      expect(near(at(x - 3, y + (h >> 1)), colours[id]), id + ' left of its box').toBe(false);
    }
    expect(host.querySelectorAll('canvas').length).toBe(4);
  });

  // The copy a render draws in place of each canvas shows what the canvas
  // shows at that seek and nothing of its own: a transition or a CSS
  // animation from the canvas's class does not run on it, and the canvas's
  // transform, rotate, translate and object-fit carry over. Each canvas's box
  // in the file is the one a screenshot of the page has at the same seek.
  it("a canvas's class transition and seeked animation, its own transform, a transformed parent, a push on a canvas clip, object-fit and a calc() translate: the file matches the page at that seek", async () => {
    const { wf } = await load();
    const name = uniqueName('copies');
    wf.kinetic.scene(name, {});
    const C = 'position:absolute;';
    const host = await mount(`<style>.kn-tr { transition: all 0.3s linear } .kn-kf { animation: kn-slide 1s linear both } @keyframes kn-slide { from { transform: translateX(0) } to { transform: translateX(100px) } }</style>
      <div data-composition-id="rv17" data-start="0" data-duration="1" data-width="400" data-height="200" data-fps="10" style="width:400px;height:200px;position:relative;background:#000">
        <div data-component="${name}" data-start="0" style="position:absolute;inset:0">
          <canvas id="tr" class="kn-tr" width="40" height="30" style="${C}left:10px;top:10px;width:40px;height:30px"></canvas>
          <canvas id="kf" class="kn-kf" width="40" height="30" style="${C}left:10px;top:60px;width:40px;height:30px"></canvas>
          <canvas id="own" width="40" height="20" style="${C}left:180px;top:20px;width:40px;height:20px;transform:scale(1.5);rotate:20deg"></canvas>
          <div style="${C}left:250px;top:10px;width:120px;height:80px;transform:scale(0.75) translate(10px, 6px);transform-origin:0 0"><canvas id="anc" width="60" height="40" style="${C}left:20px;top:10px;width:60px;height:40px"></canvas></div>
          <canvas id="contain" width="100" height="50" style="${C}left:10px;top:110px;width:80px;height:80px;object-fit:contain"></canvas>
          <canvas id="none" width="30" height="30" style="${C}left:110px;top:110px;width:70px;height:70px;object-fit:none"></canvas>
          <canvas id="calc" width="40" height="20" style="${C}left:330px;top:170px;width:40px;height:20px;translate:calc(10px + 25%) 5px"></canvas>
        </div>
        <div style="${C}left:220px;top:110px;width:100px;height:60px;overflow:hidden">
          <canvas id="pa" data-start="0" data-duration="0.7" width="100" height="60" style="${C}left:0;top:0;width:100px;height:60px"></canvas>
          <canvas id="pb" data-start="pa - 0.5" data-duration="1" data-clip-transition="push from-right linear" width="100" height="60" style="${C}left:0;top:0;width:100px;height:60px"></canvas>
        </div>
      </div>`);
    cleanup.push(host);
    const colours = { tr: [255, 0, 0], kf: [0, 255, 0], own: [0, 0, 255], anc: [255, 255, 0], contain: [255, 0, 255], none: [255, 255, 255], pa: [0, 255, 255], calc: [128, 0, 255] };
    for (const [id, [r, g, b]] of Object.entries(colours)) {
      const c = host.querySelector('#' + id), x = c.getContext('2d');
      x.fillStyle = `rgb(${r}, ${g}, ${b})`; x.fillRect(0, 0, c.width, c.height);
    }
    const pb = host.querySelector('#pb').getContext('2d');
    pb.fillStyle = '#000'; pb.fillRect(0, 0, 100, 60);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const root = host.querySelector('[data-composition-id]');
    // The box of each colour in RGBA data, as [left, top, right, bottom].
    const boxes = (d, w, h) => {
      const out = {};
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        for (const [id, rgb] of Object.entries(colours)) {
          if (!rgb.every((v, k) => Math.abs(d[i + k] - v) < 60)) continue;
          const bx = out[id] || (out[id] = [x, y, x, y]);
          bx[0] = Math.min(bx[0], x); bx[1] = Math.min(bx[1], y); bx[2] = Math.max(bx[2], x); bx[3] = Math.max(bx[3], y);
        }
      }
      return out;
    };
    await dispatchSeek(0.4).done;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const shot = new Image();
    shot.src = 'data:image/png;base64,' + await page.screenshot({ save: false, element: root });
    await shot.decode();
    const c = document.createElement('canvas');
    c.width = 400; c.height = 200;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(shot, 0, 0, 400, 200);
    const live = boxes(g.getImageData(0, 0, 400, 200).data, 400, 200);
    expect(Object.keys(live).sort(), 'every canvas shows on the page').toEqual(Object.keys(colours).sort());
    const r = await wf.kinetic.render({ download: false, bitrate: 6e6, from: 0.4, to: 0.5 });
    const { img } = await frameAt(r.blob, 0.05);
    const file = boxes(img.data, img.width, img.height);
    for (const id of Object.keys(colours)) {
      expect(file[id], id + ' is in the file').toBeTruthy();
      const off = file[id].map((v, k) => Math.abs(v - live[id][k]));
      expect(Math.max(...off), id + ': file ' + file[id] + ', page ' + live[id]).toBeLessThanOrEqual(3);
    }
  });

  // A frame the render starts before: the copy keeps each canvas's state as
  // the page has it at that seek. A keyframed background-color and
  // box-shadow (what the guard seeks), a canvas whose data-show turns on
  // there, a canvas a data-render section mounts there, object-fit inside a
  // border, and a canvas placed by right in a right-to-left box; a canvas of
  // 0 x 0 is passed over.
  it('the canvas state at a seek the render reaches: keyframed background and shadow, a canvas shown or mounted there, object-fit in a border, right-to-left: the file matches the page', async () => {
    const { wf } = await load();
    const name = uniqueName('copies2'), lateName = uniqueName('late');
    const paint = (c, rgb) => { if (c && c.width) { const x = c.getContext('2d'); x.fillStyle = rgb; x.fillRect(0, 0, c.width, c.height); } };
    wf.kinetic.scene(name, {
      computed: { shown() { return this.local >= 0.3; } },
      seek() { paint(this.element.querySelector('#show'), '#ffff00'); },
    });
    // Mounted by the section as the seek to 0.3 turns it on; its first seek paints it.
    wf.kinetic.scene(lateName, { seek() { paint(this.element.querySelector('canvas'), '#ff00ff'); } });
    const C = 'position:absolute;';
    const host = await mount(`<style>.kn-bgc { animation: kn-bgc 1s linear both } @keyframes kn-bgc { from { background-color: #ff0000 } to { background-color: #0000ff } }
      .kn-sh { animation: kn-sh 1s linear both } @keyframes kn-sh { from { box-shadow: 0 0 0 0 #00ff00 } to { box-shadow: 0 0 0 20px #00ff00 } }</style>
      <div data-composition-id="rv18" data-start="0" data-duration="1" data-width="400" data-height="200" data-fps="10" style="width:400px;height:200px;position:relative;background:#000">
        <div data-component="${name}" data-start="0" style="position:absolute;inset:0">
          <canvas id="bgc" class="kn-bgc" width="40" height="30" style="${C}left:10px;top:10px;width:40px;height:30px"></canvas>
          <canvas id="sh" class="kn-sh" width="30" height="30" style="${C}left:100px;top:30px;width:30px;height:30px"></canvas>
          <canvas id="show" data-show="shown" width="60" height="40" style="${C}left:160px;top:10px;width:60px;height:40px"></canvas>
          <div data-render="shown"><div data-component="${lateName}"><canvas id="late" width="60" height="40" style="${C}left:240px;top:10px;width:60px;height:40px"></canvas></div></div>
          <canvas id="zero" width="0" height="0" style="${C}left:330px;top:10px"></canvas>
          <canvas id="pad" width="100" height="100" style="${C}left:10px;top:80px;width:200px;height:100px;box-sizing:border-box;border:10px solid #444;object-fit:contain"></canvas>
          <div dir="rtl" style="${C}left:250px;top:100px;width:140px;height:90px"><canvas id="rtl" width="50" height="30" style="${C}right:20px;top:10px;width:50px;height:30px"></canvas></div>
        </div>
      </div>`);
    cleanup.push(host);
    paint(host.querySelector('#sh'), '#ffffff');
    paint(host.querySelector('#pad'), '#00ffff');
    paint(host.querySelector('#rtl'), '#8000ff');
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const root = host.querySelector('[data-composition-id]');
    const colours = { sh: [0, 255, 0], show: [255, 255, 0], late: [255, 0, 255], pad: [0, 255, 255], rtl: [128, 0, 255] };
    const boxes = (d, w) => {
      const out = {};
      for (let i = 0; i < d.length; i += 4) {
        const x = (i / 4) % w, y = Math.floor(i / 4 / w);
        for (const [id, rgb] of Object.entries(colours)) {
          if (!rgb.every((v, k) => Math.abs(d[i + k] - v) < 60)) continue;
          const b = out[id] || (out[id] = [x, y, x, y]);
          b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
        }
      }
      return out;
    };
    const px = (d, w, x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    await dispatchSeek(0.3).done;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const shot = new Image();
    shot.src = 'data:image/png;base64,' + await page.screenshot({ save: false, element: root });
    await shot.decode();
    const c = document.createElement('canvas');
    c.width = 400; c.height = 200;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(shot, 0, 0, 400, 200);
    const ld = g.getImageData(0, 0, 400, 200).data, live = boxes(ld, 400);
    expect(Object.keys(live).sort(), 'every canvas shows on the page').toEqual(Object.keys(colours).sort());
    // The render starts at 0, before the section mounts and the canvas shows.
    await dispatchSeek(0).done;
    const r = await wf.kinetic.render({ download: false, bitrate: 6e6, from: 0, to: 0.5 });
    const { img } = await frameAt(r.blob, 0.32);
    const file = boxes(img.data, img.width);
    for (const id of Object.keys(colours)) {
      expect(file[id], id + ' is in the file').toBeTruthy();
      const off = file[id].map((v, k) => Math.abs(v - live[id][k]));
      expect(Math.max(...off), id + ': file ' + file[id] + ', page ' + live[id]).toBeLessThanOrEqual(3);
    }
    const a = px(ld, 400, 30, 25), b = px(img.data, img.width, 30, 25);
    expect(a.every((v, k) => Math.abs(v - b[k]) < 40), 'the background-color: page ' + a + ', file ' + b).toBe(true);
  });

  // The page after a render is as it was before, to the byte, whether the
  // render ended or threw: the canvases' own style attributes, and no copy
  // or attribute of Kinetic's left behind.
  it("a render leaves the page as it found it, after it ends and after it throws: each canvas's style attribute to the byte, no copies, no attributes", async () => {
    const { wf } = await load();
    const STYLES = [
      'position:absolute;left:10px;top:10px;width:40px;height:30px;transition-property:opacity;transition-duration:0.5s',
      'position:absolute;left:60px;top:10px;width:40px;height:30px;transition-duration:0.5s !important;visibility:visible !important',
      'position: absolute; left: 110px; top: 10px; width: 40px; height: 30px; transition: transform 1s ease 0s; visibility: visible',
    ];
    const host = await mount(`<div data-composition-id="rv19" data-start="0" data-duration="0.4" data-width="160" data-height="60" data-fps="10" style="width:160px;height:60px;position:relative;background:#000">
      ${STYLES.map((s, i) => `<canvas id="k${i}" width="40" height="30" style="${s}"></canvas>`).join('')}
    </div>`);
    cleanup.push(host);
    const before = [...host.querySelectorAll('canvas')].map((cv) => cv.getAttribute('style'));
    const left = () => document.querySelectorAll('[data-kinetic-copy], [data-kinetic-copied], [data-kinetic-still], [data-kinetic-render]').length;
    const after = () => [...host.querySelectorAll('canvas')].map((cv) => cv.getAttribute('style'));
    await wf.kinetic.render({ download: false, bitrate: 2e6 });
    expect(after()).toEqual(before);
    expect(left()).toBe(0);
    const err = await wf.kinetic.render({ download: false, bitrate: 2e6, onProgress: (i) => { if (i === 2) throw new Error('stop here'); } }).catch((e) => e);
    expect(err && err.message).toBe('stop here');
    expect(after()).toEqual(before);
    expect(left()).toBe(0);
    expect(host.querySelectorAll('canvas').length).toBe(3);
  });

  // A zoom writes scale on the clip, which makes it the containing block of
  // what is absolutely positioned inside it though it is not positioned
  // itself: the copies are laid out in that box. A canvas in the clip's
  // flow and one positioned in it, half way through the zoom.
  it('a canvas inside a clip that is not positioned, during a zoom transition: the file matches the page', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="rv22" data-start="0" data-duration="1" data-width="300" data-height="200" data-fps="10" style="width:300px;height:200px;position:relative;overflow:hidden;background:#000">
        <div data-start="0" data-duration="1" data-clip-enter="zoom 1s" style="margin:60px 0 0 120px;width:150px;height:100px">
          <canvas id="flow" width="40" height="30" style="display:block;width:40px;height:30px"></canvas>
          <canvas id="abs" width="30" height="20" style="position:absolute;left:80px;top:50px;width:30px;height:20px"></canvas>
        </div>
      </div>`);
    cleanup.push(host);
    const paint = (id, rgb) => { const c = host.querySelector('#' + id), x = c.getContext('2d'); x.fillStyle = rgb; x.fillRect(0, 0, c.width, c.height); };
    paint('flow', '#00ff00');
    paint('abs', '#ff0000');
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const root = host.querySelector('[data-composition-id]');
    // At half opacity, on black: dark green and dark red.
    const kinds = { flow: (r, g, b) => g > 50 && r < 25 && b < 25, abs: (r, g, b) => r > 50 && g < 25 && b < 25 };
    const boxes = (d, w) => {
      const out = {};
      for (let i = 0; i < d.length; i += 4) {
        const x = (i / 4) % w, y = Math.floor(i / 4 / w);
        for (const [id, is] of Object.entries(kinds)) {
          if (!is(d[i], d[i + 1], d[i + 2])) continue;
          const b = out[id] || (out[id] = [x, y, x, y]);
          b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
        }
      }
      return out;
    };
    await dispatchSeek(0.5).done;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const shot = new Image();
    shot.src = 'data:image/png;base64,' + await page.screenshot({ save: false, element: root });
    await shot.decode();
    const c = document.createElement('canvas');
    c.width = 300; c.height = 200;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(shot, 0, 0, 300, 200);
    const live = boxes(g.getImageData(0, 0, 300, 200).data, 300);
    expect(Object.keys(live).sort(), 'both canvases show on the page').toEqual(['abs', 'flow']);
    await dispatchSeek(0).done;
    const r = await wf.kinetic.render({ download: false, bitrate: 6e6 });
    const { img } = await frameAt(r.blob, 0.52);
    const file = boxes(img.data, img.width);
    for (const id of Object.keys(kinds)) {
      expect(file[id], id + ' is in the file').toBeTruthy();
      const off = file[id].map((v, k) => Math.abs(v - live[id][k]));
      expect(Math.max(...off), id + ': file ' + file[id] + ', page ' + live[id]).toBeLessThanOrEqual(3);
    }
  });

  // A canvas whose drawing goes to 0 x 0 shows its box's background, as
  // the page does, and not the pixels it had; a copy the page's code takes
  // out of the page during the render is put back beside its canvas.
  it('a canvas whose drawing goes to 0 x 0 during the render shows its background, not its last pixels; a copy taken off the page is put back', async () => {
    const { wf } = await load();
    const name = uniqueName('zero');
    wf.kinetic.scene(name, {
      seek(local) {
        const a = this.element.querySelector('#za');
        if (local >= 0.25) { if (a.width) { a.width = 0; a.height = 0; } return; }
        if (!a.width) { a.width = 40; a.height = 30; }
        const x = a.getContext('2d');
        x.fillStyle = '#ff0000';
        x.fillRect(0, 0, 40, 30);
      },
    });
    const host = await mount(`<div data-composition-id="rv23" data-start="0" data-duration="0.5" data-width="200" data-height="100" data-fps="10" style="width:200px;height:100px;position:relative;background:#000">
        <div data-component="${name}" data-start="0" style="position:absolute;inset:0">
          <canvas id="za" width="40" height="30" style="position:absolute;left:10px;top:10px;width:40px;height:30px;background:#0000ff"></canvas>
          <canvas id="zb" width="40" height="30" style="position:absolute;left:100px;top:10px;width:40px;height:30px"></canvas>
        </div>
      </div>`);
    cleanup.push(host);
    const zb = host.querySelector('#zb'), x = zb.getContext('2d');
    x.fillStyle = '#00ff00';
    x.fillRect(0, 0, 40, 30);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    let taken = 0;
    const r = await wf.kinetic.render({ download: false, bitrate: 4e6, onProgress: (i) => {
      if (i !== 2) return;
      for (const c of host.querySelectorAll('[data-kinetic-copy]')) if (c.previousElementSibling === zb) { c.remove(); taken++; }
    } });
    expect(taken).toBe(1);
    const px = (img, x0, y0) => { const i = (y0 * img.width + x0) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
    const early = (await frameAt(r.blob, 0.12)).img, late = (await frameAt(r.blob, 0.32)).img;
    expect(near(px(early, 30, 25), [255, 0, 0], 40), 'za drawn red at 0.1 s: ' + px(early, 30, 25)).toBe(true);
    expect(near(px(late, 30, 25), [0, 0, 255], 40), 'za its blue background at 0.3 s: ' + px(late, 30, 25)).toBe(true);
    expect(near(px(late, 120, 25), [0, 255, 0], 40), 'zb green at 0.3 s: ' + px(late, 120, 25)).toBe(true);
    expect(host.querySelectorAll('[data-kinetic-copy]').length).toBe(0);
  });

  // The canvas is hidden by a style sheet Kinetic adopts; page code that
  // sets document.adoptedStyleSheets without it gets it back at the next
  // frame, so the canvas stays hidden behind its copy.
  it('page code that replaces document.adoptedStyleSheets during a render: the canvas stays hidden behind its copy', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="rv24" data-start="0" data-duration="0.5" data-width="100" data-height="60" data-fps="10" style="width:100px;height:60px;position:relative;background:#000">
        <canvas id="ka" width="40" height="30" style="position:absolute;left:10px;top:10px;width:40px;height:30px"></canvas>
      </div>`);
    cleanup.push(host);
    const ka = host.querySelector('#ka');
    const saved = [...document.adoptedStyleSheets];
    let seen = null;
    try {
      await wf.kinetic.render({ download: false, bitrate: 2e6, onProgress: (i) => {
        if (i === 1) document.adoptedStyleSheets = [];
        if (i === 3) seen = getComputedStyle(ka).visibility;
      } });
    } finally {
      if (!document.adoptedStyleSheets.length) document.adoptedStyleSheets = saved;
    }
    expect(seen).toBe('hidden');
    expect(getComputedStyle(ka).visibility).toBe('visible');
  });

  // camera() and depth(): a dolly and a roll on a world of three layers. The
  // file's frame has each layer's marker where the live page lays it out at
  // the same time.
  it('a camera move is in the file: each marker where the live layout puts it at that time, to 2 px', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    const name = uniqueName('scene');
    const CAM = { z: { at: [0, 1], to: [0, 300] }, roll: { at: [0, 1], to: [0, 20] } };
    wf.kinetic.scene(name, {
      computed: {
        world() { return camera(this.local, CAM); },
        far() { return depth(-800); },
        mid() { return depth(0); },
        near() { return depth(250); },
      },
    });
    // Each marker 16 px square, 60 px and 30 px off the centre at rest.
    const layer = (k, left, top, color) => `<div data-bind-style="${k}" style="position:absolute;left:0;top:0;width:320px;height:180px"><i class="${k}" style="position:absolute;display:block;left:${left}px;top:${top}px;width:16px;height:16px;background:${color}"></i></div>`;
    const host = await mount(`<div data-composition-id="rv13" data-start="0" data-duration="1" data-width="320" data-height="180" data-fps="10" style="width:320px;height:180px;position:relative;overflow:hidden;background:#000">
      <div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="world" style="position:absolute;inset:0">
        ${layer('far', 212, 112, '#ff0000')}${layer('mid', 92, 112, '#00ff00')}${layer('near', 92, 52, '#0000ff')}
      </div></div>
    </div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    // Each marker's centre in the root, laid out live at time t.
    const liveAt = async (t) => {
      wf.kinetic.seek(t);
      await tick(0);
      const rr = root.getBoundingClientRect(), out = {};
      for (const k of ['far', 'mid', 'near']) {
        const b = host.querySelector('i.' + k).getBoundingClientRect();
        out[k] = { x: b.left + b.width / 2 - rr.left, y: b.top + b.height / 2 - rr.top };
      }
      return out;
    };
    const rest = await liveAt(0);
    const live = await liveAt(0.6);
    // The move is under way at 0.6 s: the near marker is well out from where it sat at rest.
    expect(Math.hypot(live.near.x - rest.near.x, live.near.y - rest.near.y)).toBeGreaterThan(10);
    const r = await wf.kinetic.render({ download: false, bitrate: 4e6 });
    expect(r.frames).toBe(10);
    const { img } = await frameAt(r.blob, 0.62);
    const found = {
      far: centroid(img, (R, G, B) => R > 128 && G < 100 && B < 100),
      mid: centroid(img, (R, G, B) => G > 128 && R < 100 && B < 100),
      near: centroid(img, (R, G, B) => B > 128 && R < 100 && G < 100),
    };
    for (const k of ['far', 'mid', 'near']) {
      expect(found[k], k + ' not found in the frame').not.toBeNull();
      expect(found[k].n, k + ' pixels').toBeGreaterThan(150);
      const d = Math.hypot(found[k].x - live[k].x, found[k].y - live[k].y);
      expect(d, k + ': file ' + JSON.stringify(found[k]) + ', live ' + JSON.stringify(live[k])).toBeLessThanOrEqual(2);
    }
  });

  it('a stage fitted small renders at the composition\'s size, filled to the corners, and stays fitted after', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    // Green on the left half, blue on the right: a frame drawn at the fitted
    // scale would leave the right half and the bottom of the frame empty.
    wf.kinetic.scene(name, {});
    const host = await mount(`<div style="width:160px"><div data-composition-id="rv10" data-start="0" data-duration="0.5" data-width="320" data-height="180" data-fps="10" style="width:320px;height:180px;position:relative;overflow:hidden;background:#000">
      <div data-component="${name}" style="position:absolute;inset:0"><div style="position:absolute;left:0;top:0;width:160px;height:180px;background:#20c040"></div><div style="position:absolute;left:160px;top:0;width:160px;height:180px;background:#2040c0"></div></div>
    </div></div>`);
    cleanup.push(host);
    const root = host.querySelector('[data-composition-id]');
    try {
      wf.kinetic.config({ fit: true });
      expect(root.parentElement.className).toBe('kinetic-fit');
      expect(root.style.transform).toBe('scale(0.5)');
      let during = null;
      const r = await wf.kinetic.render({ download: false, bitrate: 1e6, onProgress: (i) => {
        // The scale is on the canvas while the root draws at its own size.
        if (i === 1) during = { canvas: root.parentElement.style.transform, root: root.style.transform, wrapped: root.parentElement.parentElement.className };
      } });
      expect(during).toEqual({ canvas: 'scale(0.5)', root: '', wrapped: 'kinetic-fit' });
      expect([r.width, r.height]).toEqual([320, 180]);
      const v = await probeVideo(r.blob, 0.15, 300, 170);
      expect([v.width, v.height]).toEqual([320, 180]);
      expect(near(v.px, [0x20, 0x40, 0xc0]), 'bottom right ' + v.px.join(',')).toBe(true);
      const left = await probeVideo(r.blob, 0.15, 20, 170);
      expect(near(left.px, [0x20, 0xc0, 0x40]), 'bottom left ' + left.px.join(',')).toBe(true);
      // The page is as it was: the root in its wrapper, scaled, no canvas left.
      expect(root.parentElement.className).toBe('kinetic-fit');
      expect(root.style.transform).toBe('scale(0.5)');
      expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    } finally {
      wf.kinetic.config({ fit: false });
    }
    expect(root.parentElement).toBe(host.firstElementChild);
  });

  it('a canvas source is captured as it is, with no wrapper', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {
      seek(local) {
        const ctx = this.element.querySelector('canvas').getContext('2d');
        ctx.fillStyle = local < 0.5 ? '#20c040' : '#c0c020';
        ctx.fillRect(0, 0, 160, 90);
      },
    });
    const host = await mount(`<div data-composition-id="rv2" data-start="0" data-duration="1" data-width="160" data-height="90" data-fps="10"><div data-component="${name}"><canvas width="160" height="90"></canvas></div></div>`);
    cleanup.push(host);
    const canvas = host.querySelector('canvas');
    const r = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6 });
    expect(r.frames).toBe(10); expect(r.width).toBe(160);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    const early = await probeVideo(r.blob, 0.15, 80, 45);
    expect(near(early.px, [0x20, 0xc0, 0x40]), early.px.join(',')).toBe(true);
    const late = await probeVideo(r.blob, 0.85, 80, 45);
    expect(near(late.px, [0xc0, 0xc0, 0x20]), late.px.join(',')).toBe(true);
  });

  // The finishing pass (finish.js): a 160 x 90 canvas composition painted
  // by `paint` each seek, rendered with `finish`, and its frame at `at`
  // seconds decoded back.
  async function finished(wf, paint, finish, at = 0.15, more = {}) {
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { seek() { paint(this.element.querySelector('canvas').getContext('2d')); } });
    const host = await mount(`<div data-composition-id="${uniqueName('rf')}" data-start="0" data-duration="0.5" data-width="160" data-height="90" data-fps="10"><div data-component="${name}"><canvas width="160" height="90"></canvas></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.render(Object.assign({ source: host.querySelector('canvas'), download: false, bitrate: 4e6, finish }, more));
    return (await frameAt(r.blob, at)).img;
  }
  const grey = (ctx) => { ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 160, 90); };
  // The mean and the spread of the brightness over a box of the frame.
  function stats(img, x0, y0, w, h) {
    let n = 0, s = 0, ss = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.width + x) * 4, l = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
      n++; s += l; ss += l * l;
    }
    const m = s / n;
    return { mean: m, sd: Math.sqrt(Math.max(0, ss / n - m * m)) };
  }
  const rgb = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

  it('the finish: off leaves a flat frame flat; a vignette darkens the corners and not the centre; a grade of exposure -1 halves the frame; the shutter and the finish compose', async () => {
    const { wf } = await load();
    const off = await finished(wf, grey, null);
    const o = stats(off, 0, 0, 160, 90);
    expect(Math.abs(o.mean - 128), 'off: mean ' + o.mean).toBeLessThan(6);
    expect(o.sd, 'off: spread').toBeLessThan(3);
    const vig = await finished(wf, grey, { vignette: { amount: 1, radius: 0.2, softness: 0.3 } });
    expect(Math.abs(stats(vig, 72, 40, 16, 10).mean - 128), 'vignette: the centre').toBeLessThan(8);
    expect(stats(vig, 0, 0, 12, 8).mean, 'vignette: a corner').toBeLessThan(60);
    const half = await finished(wf, grey, { grade: { exposure: -1 } });
    expect(Math.abs(stats(half, 0, 0, 160, 90).mean - 64), 'exposure -1').toBeLessThan(8);
    const both = await finished(wf, grey, { grade: { exposure: -1 } }, 0.15, { shutter: 180 });
    expect(Math.abs(stats(both, 0, 0, 160, 90).mean - 64), 'with the shutter').toBeLessThan(8);
  });

  it('the finish: grain spreads a flat frame about its level, holds still by default, differs from frame to frame at its fps, and is the same on every render', async () => {
    const { wf } = await load();
    const mean = (a, b) => { let d = 0; for (let i = 0; i < a.data.length; i += 4) d += Math.abs(a.data[i] - b.data[i]); return d / (a.data.length / 4); };
    const a = await finished(wf, grey, { grain: 0.8 });
    const s = stats(a, 0, 0, 160, 90);
    expect(Math.abs(s.mean - 128), 'grain: mean ' + s.mean).toBeLessThan(8);
    expect(s.sd, 'grain: spread').toBeGreaterThan(6);
    expect(mean(a, await finished(wf, grey, { grain: 0.8 }, 0.25)), 'still: frames 1 and 2 alike').toBeLessThan(2);
    const film = { grain: { amount: 0.8, fps: 10 } };
    const f1 = await finished(wf, grey, film);
    expect(mean(f1, await finished(wf, grey, film, 0.25)), 'fps 10: frames 1 and 2 differ').toBeGreaterThan(3);
    const again = await finished(wf, grey, film);
    let worst = 0;
    for (let i = 0; i < f1.data.length; i += 4) worst = Math.max(worst, Math.abs(f1.data[i] - again.data[i]));
    expect(worst, 'the same frame on another render').toBeLessThan(16);
  });

  it('the finish: bloom lights the black beside a white square, aberration fringes its edge away from the centre, dust specks a black frame', async () => {
    const { wf } = await load();
    const square = (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 160, 90); ctx.fillStyle = '#fff'; ctx.fillRect(70, 35, 20, 20); };
    const plain = await finished(wf, square, null);
    const lit = await finished(wf, square, { bloom: { amount: 1, threshold: 0.5, radius: 24 } });
    expect(stats(plain, 96, 40, 6, 10).mean, 'no bloom: black beside the square').toBeLessThan(6);
    expect(stats(lit, 96, 40, 6, 10).mean, 'bloom: light beside the square').toBeGreaterThan(12);
    expect(stats(lit, 78, 42, 4, 6).mean, 'bloom: the square stays white').toBeGreaterThan(240);
    const corner = (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 160, 90); ctx.fillStyle = '#fff'; ctx.fillRect(124, 62, 26, 22); };
    const sharp = await finished(wf, corner, null);
    const fringed = await finished(wf, corner, { aberration: 1 });
    // The strongest red-blue split along the square's left edge: the file's
    // chroma is at half resolution, so the fringe comes back softened.
    const edge = (img) => { let m = 0; for (let y = 64; y < 82; y++) for (const x of [121, 122]) { const p = rgb(img, x, y); m = Math.max(m, Math.abs(p[0] - p[2])); } return m; };
    expect(edge(sharp), 'no aberration: grey edge').toBeLessThan(16);
    expect(edge(fringed), 'aberration: a coloured fringe').toBeGreaterThan(30);
    const black = (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 160, 90); };
    const dusty = await finished(wf, black, { dust: 1 });
    let specks = 0;
    for (let i = 0; i < dusty.data.length; i += 4) if (dusty.data[i] > 100) specks++;
    expect(specks, 'dust: bright pixels').toBeGreaterThan(5);
    expect(specks, 'dust: sparse').toBeLessThan(1500);
    const clean = await finished(wf, black, null);
    expect(stats(clean, 0, 0, 160, 90).mean, 'no dust').toBeLessThan(4);
  });

  it('the finish: KN-100 for a bad option before the page is touched, config({ finish }) as the default, and KN-100 naming WebGL 2 when the browser has none', async () => {
    const { wf } = await load();
    const bad = uniqueName('scene');
    wf.kinetic.scene(bad, { seek() { grey(this.element.querySelector('canvas').getContext('2d')); } });
    const first = await mount(`<div data-composition-id="${uniqueName('rf')}" data-start="0" data-duration="0.5" data-width="160" data-height="90" data-fps="10"><div data-component="${bad}"><canvas width="160" height="90"></canvas></div></div>`);
    cleanup.push(first);
    await expectKN(wf.kinetic.render({ source: first.querySelector('canvas'), download: false, finish: { glow: 1 } }), 'KN-100', 'render({ finish: { glow } })', /not a field of finish/);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    wf.kinetic.config({ finish: { grade: { exposure: -1 } } });
    try {
      const img = await finished(wf, grey, undefined);
      expect(Math.abs(stats(img, 0, 0, 160, 90).mean - 64), 'the config default').toBeLessThan(8);
      const plain = await finished(wf, grey, null);
      expect(Math.abs(stats(plain, 0, 0, 160, 90).mean - 128), 'null turns the default off').toBeLessThan(6);
    } finally {
      wf.kinetic.config({ finish: null });
    }
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : orig.call(this, kind, ...rest); };
    try {
      const name = uniqueName('scene');
      wf.kinetic.scene(name, { seek() { grey(this.element.querySelector('canvas').getContext('2d')); } });
      const host = await mount(`<div data-composition-id="${uniqueName('rf')}" data-start="0" data-duration="0.5" data-width="160" data-height="90" data-fps="10"><div data-component="${name}"><canvas width="160" height="90"></canvas></div></div>`);
      cleanup.push(host);
      await expectKN(wf.kinetic.render({ source: host.querySelector('canvas'), download: false, finish: { grain: 0.5 } }), 'KN-100', 'render({ finish }): WebGL 2', /WebGL 2/);
      expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });

  it('the finish: a render from partway gives each frame the dust and grain of the same frame in a full render', async () => {
    const { wf } = await load();
    const black = (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 160, 90); };
    const dusty = { dust: 1, grain: { amount: 0.6, fps: 10 } };
    const full = await finished(wf, black, dusty, 0.25);
    const part = await finished(wf, black, dusty, 0.05, { from: 0.2 });
    const other = await finished(wf, black, dusty, 0.15);
    let same = 0, diff = 0;
    for (let i = 0; i < full.data.length; i += 4) { same += Math.abs(full.data[i] - part.data[i]); diff += Math.abs(full.data[i] - other.data[i]); }
    const n = full.data.length / 4;
    expect(diff / n, 'another frame differs').toBeGreaterThan(2);
    expect(same / n, 'the same frame matches').toBeLessThan(diff / n / 4);
  });

  it('the finish: KN-192 in a development build when effects and drawings hold 16 WebGL contexts, so the finish\'s own would push the oldest out; none at 15', async () => {
    const { wf } = await load();
    const src = document.createElement('canvas');
    src.width = src.height = 8;
    grey(src.getContext('2d'));
    const layers = await mount('<div>' + '<canvas width="8" height="8"></canvas>'.repeat(16) + '</div>');
    cleanup.push(layers);
    const fx = Array.from(layers.querySelectorAll('canvas'), (c) => wf.kinetic.effect(c, { source: src, kind: 'duotone' }));
    const kn = (lines) => lines.filter((l) => l.includes('KN-192'));
    try {
      const at16 = kn(await captureWarnings(() => finished(wf, grey, { grain: 0.2 })));
      expect(at16.length, at16.join(' || ')).toBe(BUILD === 'dev' ? 1 : 0);
      if (BUILD === 'dev') expect(at16[0]).toMatch(/16 WebGL contexts/);
      fx.pop().dispose();
      expect(kn(await captureWarnings(() => finished(wf, grey, { grain: 0.2 }))).length).toBe(0);
    } finally {
      for (const f of fx) f.dispose();
    }
  });

  it('the live finish: its overlays in the root are hidden for the render and back after it, so the file is finished by the pass alone', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { bg() { return { background: '#808080' }; } } });
    const host = await mount(`<div data-composition-id="${uniqueName('rf')}" data-start="0" data-duration="0.5" data-width="160" data-height="90" data-fps="10"><div data-component="${name}"><div data-bind-style="bg" style="width:160px;height:90px"></div></div></div>`);
    cleanup.push(host);
    const root = host.querySelector('[data-composition-id]');
    wf.kinetic.config({ finish: { vignette: { amount: 1, radius: 0.2, softness: 0.3 } } });
    try {
      const over = root.querySelectorAll('[data-kinetic-finish]');
      expect(over.length).toBe(1);
      // No pass for this file: the corners would only darken from the overlay.
      const r = await wf.kinetic.render({ download: false, bitrate: 4e6, finish: null });
      const img = (await frameAt(r.blob, 0.15)).img;
      expect(Math.abs(stats(img, 0, 0, 12, 8).mean - 128), 'a corner, no overlay in the file').toBeLessThan(8);
      expect(over[0].style.display, 'the overlay back after the render').toBe('');
      expect(over[0].parentNode).toBe(root);
      // With the pass, the file's corners darken once, from the pass.
      const f = await wf.kinetic.render({ download: false, bitrate: 4e6 });
      const fin = (await frameAt(f.blob, 0.15)).img;
      expect(stats(fin, 0, 0, 12, 8).mean, 'a corner, the pass').toBeLessThan(60);
      expect(Math.abs(stats(fin, 72, 40, 16, 10).mean - 128), 'the centre').toBeLessThan(8);
    } finally {
      wf.kinetic.config({ finish: null });
    }
  });

  it('writes VP9 and AV1 as well, and from and to pick a range', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { bg() { return { background: '#4020c0' }; } } });
    const host = await mount(`<div data-composition-id="rv3" data-start="0" data-duration="3" data-width="160" data-height="90" data-fps="10"><div data-component="${name}"><div data-bind-style="bg" style="width:160px;height:90px"></div></div></div>`);
    cleanup.push(host);
    for (const codec of ['vp09.00.10.08', 'av01.0.04M.08']) {
      const r = await wf.kinetic.render({ codec, from: 1, to: 1.5, download: false, bitrate: 1e6 });
      expect(r.frames).toBe(5);
      expect(r.codec).toBe(codec);
      const v = await probeVideo(r.blob, 0.25, 80, 45);
      expect(Math.abs(v.duration - 0.5), codec).toBeLessThan(0.15);
      expect(near(v.px, [0x40, 0x20, 0xc0]), codec + ' ' + v.px.join(',')).toBe(true);
    }
  });

  it('a bad bitrate is KN-100 before the page is touched, and the next render works', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="rv6" data-start="0" data-duration="0.3" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px"><div data-component="${name}"></div></div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    for (const bitrate of ['8M', -1, NaN]) {
      const err = await wf.kinetic.render({ bitrate, download: false }).catch((e) => e);
      expect('root parent=' + root.parentElement.tagName + ' wraps=' + document.querySelectorAll('[data-kinetic-render]').length, String(bitrate)).toBe('root parent=DIV wraps=0');
      expectKN(err, 'KN-100', 'render({ bitrate })', /^bitrate is bits per second/);
    }
    const r = await wf.kinetic.render({ download: false, bitrate: 1e6 });
    expect(r.frames).toBe(3);
    expect(root.parentElement).toBe(host);
  });

  it('media from another origin that would draw black is KN-204 before the page is touched, each element listed with its URL', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    // The test server under its other host name is another origin. Without
    // CORS, drawElementImage draws an <img>, <video> or SVG <image> from it
    // black, and a CSS image black even with CORS, with no error.
    const other = location.protocol + '//' + (location.hostname === 'localhost' ? '127.0.0.1' : 'localhost') + ':' + location.port;
    const host = await mount(`<div data-composition-id="rv13" data-start="0" data-duration="0.3" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative">
      <div data-component="${name}" style="position:absolute;inset:0">
        <img id="xo-img" alt="" src="${other}/xo-a.png" style="width:40px;height:30px">
        <div id="xo-bg" style="width:40px;height:30px;background-image:url('${other}/xo-b.png')"></div>
        <svg width="40" height="30"><image id="xo-svg" href="${other}/xo-c.png" width="40" height="30"/></svg>
        <video id="xo-vid" src="${other}/xo-d.mp4" muted playsinline style="width:40px;height:30px"></video>
        <img id="here" alt="" src="/xo-same.png" style="width:4px;height:3px">
        <img id="inline" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="width:4px;height:3px">
      </div>
    </div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    const err = await wf.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
    // Each element with its URL is the where, on every build; the development sentence says what to do.
    expectKN(err, 'KN-204', 'render(): img#xo-img (' + other + "/xo-a.png), div#xo-bg's background-image (" + other + '/xo-b.png), image#xo-svg ('
      + other + '/xo-c.png), video#xo-vid (' + other + '/xo-d.mp4)', /^media from another origin would be drawn black\. .*crossorigin/);
    expect(err.message).not.toContain('#here');
    expect(err.message).not.toContain('#inline');
    expect('root parent=' + root.parentElement.tagName + ' wraps=' + document.querySelectorAll('[data-kinetic-render]').length).toBe('root parent=DIV wraps=0');
    // With crossorigin on the elements and the CSS image gone, it renders.
    for (const id of ['xo-img', 'xo-svg', 'xo-vid']) host.querySelector('#' + id).setAttribute('crossorigin', 'anonymous');
    host.querySelector('#xo-bg').style.backgroundImage = 'none';
    const r = await wf.kinetic.render({ download: false, bitrate: 1e6 });
    expect(r.frames).toBe(3);
    expect(root.parentElement).toBe(host);
  });

  // A ::before or ::after image and content: url() are CSS images; a poster,
  // an <input type=image> and an <img> in an open shadow root are drawn
  // black from another origin, and a frame or an object from another origin
  // is drawn empty (probed 2026-10-14 in Chrome: the stage's white where the
  // same-origin twin showed the PNG).
  it('KN-204 covers a ::before or ::after image, content: url(), a poster, an input type=image, an open shadow root, a frame and an object; each same-origin twin renders', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const other = location.protocol + '//' + (location.hostname === 'localhost' ? '127.0.0.1' : 'localhost') + ':' + location.port;
    const F = '/packages/kinetic/test/fixtures/frames.png';
    const css = document.createElement('style');
    css.textContent = ['', other].map((o, k) => `.b${k}::before{content:'';display:block;width:20px;height:10px;background-image:url('${o}${F}')}.a${k}::after{content:url('${o}${F}')}`).join('')
      + `.quiet::before{background-image:url('${other}${F}')}`;   // no content, so no ::before to draw
    document.head.appendChild(css);
    cleanup.push(css);
    const host = await mount(`<div data-composition-id="rv15" data-start="0" data-duration="0.3" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative;overflow:hidden">
      <div data-component="${name}" style="position:absolute;inset:0">
        <div id="xo-before" class="b1"></div>
        <div id="xo-after" class="a1"></div>
        <video id="xo-poster" poster="${other}${F}" muted playsinline style="width:20px;height:10px"></video>
        <input id="xo-input" type="image" alt="" src="${other}${F}" style="width:20px;height:10px">
        <div id="xo-shadow"></div>
        <iframe id="xo-frame" src="${other}${F}" style="width:20px;height:10px;border:0"></iframe>
        <object id="xo-object" data="${other}${F}" type="image/png" style="width:20px;height:10px"></object>
        <div id="quiet" class="quiet"></div>
      </div>
    </div>`);
    cleanup.push(host);
    const $ = (id) => host.querySelector('#' + id);
    $('xo-shadow').attachShadow({ mode: 'open' }).innerHTML = `<img id="xo-shadow-img" alt="" src="${other}${F}" style="width:20px;height:10px">`;
    const root = host.firstElementChild;
    const err = await wf.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
    const u = other + F;
    expectKN(err, 'KN-204', "render(): div#xo-before's ::before background-image (" + u + "), div#xo-after's ::after content (" + u + "), video#xo-poster's poster ("
      + u + '), input#xo-input (' + u + '), img#xo-shadow-img (' + u + '), iframe#xo-frame (' + u + '), object#xo-object (' + u + ')', /^media from another origin would be drawn black\. /);
    expect(err.message).not.toContain('#quiet');
    expect('root parent=' + root.parentElement.tagName + ' wraps=' + document.querySelectorAll('[data-kinetic-render]').length).toBe('root parent=DIV wraps=0');
    // The same-origin twins render.
    $('xo-before').className = 'b0';
    $('xo-after').className = 'a0';
    $('xo-poster').setAttribute('poster', F);
    $('xo-input').setAttribute('src', F);
    $('xo-shadow').shadowRoot.querySelector('img').setAttribute('src', F);
    $('xo-frame').setAttribute('src', F);
    $('xo-object').setAttribute('data', F);
    const r = await wf.kinetic.render({ download: false, bitrate: 1e6 });
    expect(r.frames).toBe(3);
    expect(root.parentElement).toBe(host);
  });

  it('media from the page\'s own origin in a srcdoc frame is not KN-204, though its location.origin reads "null"', async () => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0;pointer-events:none';
    frame.srcdoc = '<!doctype html><html><body style="margin:0">'
      + '<div data-composition-id="sd" data-start="0" data-duration="0.3" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative">'
      + '<video id="here" src="' + location.origin + '/packages/kinetic/test/fixtures/f30.mp4" data-start="0" muted playsinline style="width:160px;height:90px"></video></div>'
      + '<script src="' + CORE + '"><\/script><script src="' + WF_FILE + '"><\/script>'
      + '<script>wildflower.kinetic.config({ autoplay: false }); window.__ready = wildflower.kinetic.ready();<\/script>'
      + '</body></html>';
    const loaded = new Promise((r) => { frame.onload = r; });
    document.body.appendChild(frame);
    cleanup.push(frame);
    await loaded;
    const w = frame.contentWindow;
    expect(w.location.origin).toBe('null');
    await w.__ready;
    const r = await w.wildflower.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
    expect(r && r.code, String(r && r.message || '')).toBeUndefined();
    expect(r.frames).toBe(3);
  });

  // A frame sandboxed without allow-same-origin has an opaque origin, so
  // drawElementImage draws an image from the page's own host black there
  // (probed 2026-10-08 in Chrome 155: no pixel lit, against 1,724 in an
  // unsandboxed frame), and KN-204 is right to stop the render.
  it('in a frame sandboxed without allow-same-origin, media from the page\'s own host is KN-204, since it would be drawn black', async () => {
    const img = location.origin + '/packages/devtools/extension/icons/icon48.png';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0;pointer-events:none';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = '<!doctype html><html><body style="margin:0">'
      + '<div data-composition-id="sb" data-start="0" data-duration="0.3" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative">'
      + '<img id="icon" alt="" src="' + img + '" style="width:48px;height:48px"></div>'
      + '<script src="' + location.origin + CORE + '"><\/script><script src="' + location.origin + WF_FILE + '"><\/script>'
      + '<script>wildflower.kinetic.config({ autoplay: false }); wildflower.kinetic.ready()'
      + '.then(() => wildflower.kinetic.render({ download: false, bitrate: 1e6 }))'
      + '.then((r) => parent.postMessage({ origin: self.origin, frames: r.frames }, "*"), (e) => parent.postMessage({ origin: self.origin, code: e.code, message: e.message }, "*"));<\/script>'
      + '</body></html>';
    const got = new Promise((resolve) => {
      const hear = (e) => { if (e.source === frame.contentWindow) { removeEventListener('message', hear); resolve(e.data); } };
      addEventListener('message', hear);
    });
    document.body.appendChild(frame);
    cleanup.push(frame);
    const r = await Promise.race([got, tick(20000).then(() => ({ code: 'timed out' }))]);
    expect(r.origin).toBe('null');
    expectKN(r, 'KN-204', 'render(): img#icon (' + img + ')', /^media from another origin would be drawn black/);
  });

  it('render({ fps }) is the fps of this.clipFrame for the render, and the clock gets its own back after', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const frames = [];
    let rendering = false;
    wf.kinetic.scene(name, {
      seek() {
        if (rendering) frames.push(this.clipFrame);
        const ctx = this.element.querySelector('canvas').getContext('2d');
        ctx.fillStyle = '#204080';
        ctx.fillRect(0, 0, 64, 36);
      },
    });
    const host = await mount(`<div data-composition-id="rv7" data-start="0" data-duration="0.5" data-width="64" data-height="36" data-fps="10"><div data-component="${name}"><canvas width="64" height="36"></canvas></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.3);
    const store = wf.getStore('kinetic');
    rendering = true;
    const r = await wf.kinetic.render({ source: host.querySelector('canvas'), fps: 20, download: false, bitrate: 1e6 });
    rendering = false;
    expect(r.frames).toBe(10);
    expect(frames.slice(0, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(store.fps).toBe(10);
    expect(store.time).toBe(0.3);
    expect(store.frame).toBe(3);
  });

  it('rounds an odd H.264 size up to even, and says so when the browser still refuses it', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { bg() { return { background: '#2040c0' }; } } });
    const host = await mount(`<div data-composition-id="rv8" data-start="0" data-duration="0.3" data-width="161" data-height="91" data-fps="10" style="width:161px;height:91px;position:relative"><div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="bg" style="position:absolute;inset:0"></div></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.render({ download: false, bitrate: 1e6 });
    expect([r.width, r.height]).toEqual([162, 92]);
    const v = await probeVideo(r.blob, 0.15, 80, 45);
    expect([v.width, v.height]).toEqual([162, 92]);
    expect(near(v.px, [0x20, 0x40, 0xc0]), v.px.join(',')).toBe(true);
    // A canvas source of an odd size is encoded at the even size too.
    const canvas = document.createElement('canvas');
    canvas.width = 63; canvas.height = 35;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c02020'; ctx.fillRect(0, 0, 63, 35);
    host.firstElementChild.appendChild(canvas);
    const c = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6 });
    expect([c.width, c.height]).toEqual([64, 36]);
    const cv = await probeVideo(c.blob, 0.15, 30, 17);
    expect(near(cv.px, [0xc0, 0x20, 0x20]), cv.px.join(',')).toBe(true);
    const check = VideoEncoder.isConfigSupported;
    VideoEncoder.isConfigSupported = async () => ({ supported: false });
    try {
      const err = await wf.kinetic.render({ width: 161, height: 91, download: false }).catch((e) => e);
      expectKN(err, 'KN-100', 'render(): avc1.640028 at 162x92', /at 162x92 \(161x91 rounded up to even/);
    } finally {
      VideoEncoder.isConfigSupported = check;
    }
  });

  it('closes the VideoFrame when encode() throws', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="rv9" data-start="0" data-duration="0.3" data-width="64" data-height="36" data-fps="10"><div data-component="${name}"><canvas width="64" height="36"></canvas></div></div>`);
    cleanup.push(host);
    const encode = VideoEncoder.prototype.encode;
    const close = VideoFrame.prototype.close;
    let closed = 0;
    VideoEncoder.prototype.encode = function () { throw new Error('encode failed'); };
    VideoFrame.prototype.close = function () { closed++; return close.call(this); };
    try {
      await expect(wf.kinetic.render({ source: host.querySelector('canvas'), download: false, bitrate: 1e6 })).rejects.toThrow(/encode failed/);
      expect(closed).toBe(1);
    } finally {
      VideoEncoder.prototype.encode = encode;
      VideoFrame.prototype.close = close;
    }
  });

  it('validates its options, and names the flag when drawElementImage is missing (KN-201)', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="rv4" data-start="0" data-duration="1" data-width="160" data-height="90"></div>');
    cleanup.push(host);
    await expect(wf.kinetic.render({ fps: 0, download: false })).rejects.toThrow(/KN-100/);
    await expect(wf.kinetic.render({ codec: 'hvc1.1', download: false })).rejects.toThrow(/KN-100/);
    await expect(wf.kinetic.render({ from: 2, to: 1, download: false })).rejects.toThrow(/KN-100/);
    await expect(wf.kinetic.render({ source: 'stage', download: false })).rejects.toThrow(/KN-100/);
    // Not finite, or past the composition's 1 s: KN-100 before the page is
    // touched. An onProgress that throws stops a render that got through.
    const escaped = () => { throw new Error('escaped the checks'); };
    for (const [opt, where] of [[{ fps: Infinity }, 'render({ fps })'], [{ to: Infinity }, 'render({ from, to })'], [{ from: 0.5, to: 1.5 }, 'render({ from, to })'],
      [{ from: 5, to: 5.5 }, 'render({ from, to })'], [{ width: Infinity }, 'render({ width, height })'], [{ height: Infinity }, 'render({ width, height })']]) {
      const err = await wf.kinetic.render(Object.assign({ download: false, bitrate: 1e6, onProgress: escaped }, opt)).catch((e) => e);
      expectKN(err, 'KN-100', where);
      expect(document.querySelector('[data-kinetic-render]'), JSON.stringify(opt)).toBeNull();
    }
    const orig = CanvasRenderingContext2D.prototype.drawElementImage;
    delete CanvasRenderingContext2D.prototype.drawElementImage;
    try {
      let err = null;
      await wf.kinetic.render({ download: false }).catch((e) => { err = e; });
      expectKN(err, 'KN-201', 'render()', /^drawing the page into a video needs drawElementImage.*HTML-in-Canvas/);
    } finally {
      CanvasRenderingContext2D.prototype.drawElementImage = orig;
    }
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
  });

  it('a second render() while one runs is KN-100, the first finishes, and the root is back in the document after both', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="rv16" data-start="0" data-duration="0.3" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;background:#2040c0"><div data-component="${name}"></div></div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    const first = wf.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
    const second = await wf.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
    const done = await first;
    expectKN(second, 'KN-100', 'render()', /^a render is running/);
    expect(done && done.frames, String(done && done.message)).toBe(3);
    expect(root.isConnected).toBe(true);
    expect(root.parentElement).toBe(host);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    // And the next one runs.
    expect((await wf.kinetic.render({ download: false, bitrate: 1e6 })).frames).toBe(3);
  });

  it('render({ signal }): an abort ends a render waiting on a footage seek that never lands, and puts the clock back', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { seek() { grey(this.element.querySelector('canvas').getContext('2d')); } });
    const host = await mount(`<div data-composition-id="${uniqueName('rh')}" data-start="0" data-duration="1" data-fps="10" data-width="160" data-height="90" style="width:160px;height:90px"><video src="${FOOTAGE}f30.webm" data-start="0" data-duration="1" muted playsinline style="width:160px;height:90px"></video><div data-component="${name}"><canvas width="160" height="90"></canvas></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    wf.kinetic.seek(0.4);
    // A server that stops sending mid-file: the seek never lands.
    const v = host.querySelector('video');
    Object.defineProperty(v, 'currentTime', { configurable: true, get() { return 0; }, set() {} });
    const c = new AbortController();
    const done = wf.kinetic.render({ source: host.querySelector('canvas'), download: false, bitrate: 1e6, signal: c.signal }).catch((e) => e);
    await tick(1000);
    const t = performance.now();
    c.abort();
    const err = await Promise.race([done, new Promise((r) => setTimeout(() => r('still pending'), 3000))]);
    expect(err).toBe(c.signal.reason);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(wf.getStore('kinetic').time).toBeCloseTo(0.4, 5);
    delete v.currentTime;
  });

  it('a footage seek that has not landed in 30 s is KN-138 naming the clip, and the page is put back', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { seek() { grey(this.element.querySelector('canvas').getContext('2d')); } });
    const host = await mount(`<div data-composition-id="${uniqueName('rh')}" data-start="0" data-duration="1" data-fps="10" data-width="160" data-height="90" style="width:160px;height:90px"><video id="slow" src="${FOOTAGE}f30.webm" data-start="0" data-duration="1" muted playsinline style="width:160px;height:90px"></video><div data-component="${name}"><canvas width="160" height="90"></canvas></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    wf.kinetic.seek(0.4);
    const v = host.querySelector('video');
    Object.defineProperty(v, 'currentTime', { configurable: true, get() { return 0; }, set() {} });
    // The 30 s wait is shortened here, and only it.
    const realTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms === 30000 ? 50 : ms, ...a);
    let err;
    try {
      err = await wf.kinetic.render({ source: host.querySelector('canvas'), download: false, bitrate: 1e6 }).catch((e) => e);
    } finally {
      window.setTimeout = realTimeout;
      delete v.currentTime;
    }
    expectKN(err, 'KN-138', 'the footage clip video#slow', /^did not land on its frame in 30 s/);
    expect(wf.getStore('kinetic').time).toBeCloseTo(0.4, 5);
  });

  it('render({ signal }): an abort mid-render rejects with the reason, puts the page, the clock, the fps, the shutter and the live finish back, and the next render works', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const seen = [];
    wf.kinetic.scene(name, { seek(local) { seen.push(local); } });
    const host = await mount(`<div data-composition-id="${uniqueName('ra')}" data-start="0" data-duration="3" data-width="160" data-height="90" data-fps="30" style="width:160px;height:90px;background:#2040c0"><div data-component="${name}"></div></div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    const store = wf.getStore('kinetic');
    wf.kinetic.config({ finish: { vignette: { amount: 1, radius: 0.2, softness: 0.3 } } });
    try {
      wf.kinetic.seek(1.2);
      const over = root.querySelector('[data-kinetic-finish]');
      // Aborted with the default reason at frame 5, with a shutter and an fps of its own.
      const c = new AbortController();
      const progress = [];
      const err = await wf.kinetic.render({ download: false, bitrate: 1e6, fps: 20, shutter: { angle: 180, samples: 2 }, signal: c.signal,
        onProgress: (i) => { progress.push(i); if (i === 5) c.abort(); } }).catch((e) => e);
      expect(err).toBe(c.signal.reason);
      expect(err instanceof DOMException && err.name).toBe('AbortError');
      expect(progress[progress.length - 1], 'the loop stopped at the next frame').toBe(5);
      expect(root.parentElement).toBe(host);
      expect(document.querySelector('[data-kinetic-render]')).toBeNull();
      expect([store.time, store.fps, store.shutter, store.mode]).toEqual([1.2, 30, 0, 'interactive']);
      expect(over.style.display, 'the live finish back').toBe('');
      expect(seen[seen.length - 1]).toBe(1.2);
      // A reason of the caller's own.
      const own = new Error('stop here');
      const c2 = new AbortController();
      const err2 = await wf.kinetic.render({ download: false, bitrate: 1e6, signal: c2.signal, onProgress: (i) => { if (i === 2) c2.abort(own); } }).catch((e) => e);
      expect(err2).toBe(own);
      // The next render runs to the end, with a signal never aborted.
      const r = await wf.kinetic.render({ download: false, bitrate: 1e6, to: 0.5, signal: new AbortController().signal });
      expect(r.frames).toBe(15);
      expect(store.time).toBe(1.2);
    } finally {
      wf.kinetic.config({ finish: null });
    }
  });

  it('render({ signal }): one already aborted rejects at once with its reason, the page untouched; a signal that is no AbortSignal is KN-100', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let seeks = 0;
    wf.kinetic.scene(name, { seek() { seeks++; } });
    const host = await mount(`<div data-composition-id="${uniqueName('rb')}" data-start="0" data-duration="1" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px"><div data-component="${name}"></div></div>`);
    cleanup.push(host);
    const before = seeks;
    const reason = new DOMException('gone', 'AbortError');
    const err = await wf.kinetic.render({ download: false, signal: AbortSignal.abort(reason) }).catch((e) => e);
    expect(err).toBe(reason);
    expect(seeks, 'no seek').toBe(before);
    const t = AbortSignal.timeout(0);
    await tick(20);
    expect(await wf.kinetic.render({ download: false, signal: t }).catch((e) => e)).toBe(t.reason);
    for (const signal of [{ aborted: false }, 'stop', null]) {
      expectKN(await wf.kinetic.render({ download: false, signal }).catch((e) => e), 'KN-100', 'render({ signal })', /^signal is an AbortSignal/);
    }
    expect((await wf.kinetic.render({ download: false, bitrate: 1e6 })).frames).toBe(10);
  });

  it('a playing clock plays on after render(), from where it was, as after check()', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="rv17" data-start="0" data-duration="20" data-width="64" data-height="36" data-fps="10" style="width:64px;height:36px;background:#2040c0"><div data-component="${name}"></div></div>`);
    cleanup.push(host);
    const store = wf.getStore('kinetic');
    wf.kinetic.seek(1);
    wf.kinetic.play();
    await tick(100);
    await wf.kinetic.render({ download: false, bitrate: 1e6, to: 0.3 });
    const at = store.time;
    await tick(300);
    expect(store.playing).toBe(true);
    expect(store.time - at).toBeGreaterThan(0.1);
    wf.kinetic.pause();
  });

  it('render({ width, height }) scales a DOM source to that size, as it does a canvas source', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    // Left half white, right half black.
    const host = await mount(`<div data-composition-id="rv18" data-start="0" data-duration="0.3" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative;background:#000"><div data-component="${name}" style="position:absolute;left:0;top:0;width:80px;height:90px;background:#fff"></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.render({ download: false, bitrate: 1e6, width: 80, height: 46 });
    expect([r.width, r.height]).toEqual([80, 46]);
    const { img } = await frameAt(r.blob, 0.15);
    const at = (x) => img.data[(23 * img.width + x) * 4];
    expect([at(10), at(30), at(50), at(70)].map((v) => (v > 128 ? 'white' : 'black')).join(' ')).toBe('white white black black');
  });

  describe('the encoder', () => {
    // A VideoEncoder stand-in: `how` is 'error' (it reports an error and
    // its flush rejects), 'stall' (its queue never drains) or 'bare' (its
    // chunks come with no decoderConfig, so the MP4 has no avcC).
    const real = self.VideoEncoder;
    afterEach(() => { self.VideoEncoder = real; });
    function fake(how) {
      self.VideoEncoder = class {
        static isConfigSupported() { return Promise.resolve({ supported: true }); }
        constructor(init) { this.init = init; this.encodeQueueSize = 0; }
        configure() {}
        encode() {
          if (how === 'stall') { this.encodeQueueSize = 9; return; }
          if (how === 'error') { this.failed = true; queueMicrotask(() => this.init.error(new DOMException('the encoder broke', 'EncodingError'))); return; }
          this.init.output({ byteLength: 4, type: 'key', copyTo(b) { b.set([0, 0, 0, 1]); } }, {});
        }
        flush() { return this.failed ? Promise.reject(new DOMException('closed', 'InvalidStateError')) : Promise.resolve(); }
        close() {}
      };
    }
    async function stage(id) {
      const { wf } = await load();
      const name = uniqueName('scene');
      wf.kinetic.scene(name, {});
      const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="0.3" data-width="64" data-height="36" data-fps="10" style="width:64px;height:36px"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      return { wf, host, root: host.firstElementChild };
    }

    it('an encoder that reports an error is KN-207 with its message, and the page is put back', async () => {
      const { wf, host, root } = await stage('rv19');
      fake('error');
      const err = await wf.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
      expectKN(err, 'KN-207', 'render(): the avc1.640028 encoder', /^the browser's video encoder failed \(the encoder broke\)/);
      expect(root.parentElement).toBe(host);
    });

    it('an encoder whose queue does not drain for 10 s is KN-207, and the page is put back', async () => {
      const { wf, host, root } = await stage('rv20');
      fake('stall');
      const err = await wf.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
      expectKN(err, 'KN-207', 'render(): the avc1.640028 encoder, frame 0', /^the browser's video encoder stalled, with no frame done in 10 s/);
      expect(root.parentElement).toBe(host);
    }, 30000);

    it('chunks with no decoder configuration are KN-207 naming the MP4 writer, not a bare Error', async () => {
      const { wf, host, root } = await stage('rv21');
      fake('bare');
      const err = await wf.kinetic.render({ download: false, bitrate: 1e6 }).catch((e) => e);
      expectKN(err, 'KN-207', 'render(): the MP4', /^the browser's video encoder gave output the MP4 cannot hold \(mp4: avc1 needs the avcC description\)/);
      expect(root.parentElement).toBe(host);
    });
  });
});

// ---- the shutter -----------------------------------------------------------------

// A 100 px white square crossing a black stage at 1,200 px a second, from
// x = -100 at 0 s, so at 0.3 s (frame 9 at 30 fps) it covers 260 to 360.
// `extra` is markup laid under it, from y = 130.
const MOVE = { translateX: { at: [0, 1], to: [-100, 1100] } };
const SQUARE = 'position:absolute;left:0;top:0;width:100px;height:100px;background:#fff';
async function streakStage(wf, id, computed, extra = '') {
  const name = uniqueName('scene');
  wf.kinetic.scene(name, { computed: Object.assign({ move() { return wf.kinetic.styleAt(this.local, MOVE); } }, computed) });
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="0.4" data-width="640" data-height="240" data-fps="30" style="width:640px;height:240px;position:relative;overflow:hidden;background:#000">
    <div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="move" style="${SQUARE};top:10px"></div>${extra}</div>
  </div>`);
  cleanup.push(host);
  return host;
}

// The square's leading edge in row y of a frame: the first x past `from`
// where the value drops below 240, the first after it at 15 or under, and
// the values between.
function edgeOf(img, y, from = 300) {
  const v = (x) => img.data[(y * img.width + x) * 4];
  let top = -1, bottom = -1;
  for (let x = from; x < img.width; x++) {
    if (top < 0 && v(x) < 240) top = x;
    if (top >= 0 && v(x) <= 15) { bottom = x; break; }
  }
  const between = [];
  for (let x = top; x < bottom; x++) between.push(v(x));
  return { top, bottom, width: bottom - top, between, middle: v(320) };
}

describe(`render({ shutter }) (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the streak: without a shutter the leading edge is sharp; at 180 degrees it is a ramp about 20 px wide, and the middle of the square stays white', async () => {
    const { wf } = await load();
    await streakStage(wf, 'sh1');
    const store = wf.getStore('kinetic');
    const sharp = await wf.kinetic.render({ download: false });
    const during = [], progress = [];
    const r = await wf.kinetic.render({ download: false, shutter: 180, onProgress: (i, n) => { progress.push([i, n]); during.push(store.shutter); } });
    expect(r.frames).toBe(12);
    // onProgress counts the frames of the file, not the seeks.
    expect(progress.length).toBe(12); expect(progress[11]).toEqual([12, 12]);
    // The store says a shutter render is under way, and says it no longer is after.
    expect(new Set(during)).toEqual(new Set([180]));
    expect(store.shutter).toBe(0);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    const a = edgeOf((await frameAt(sharp.blob, 0.31)).img, 60);
    const b = edgeOf((await frameAt(r.blob, 0.31)).img, 60);
    expect(Math.abs(a.top - 360), 'no shutter: ' + JSON.stringify(a)).toBeLessThanOrEqual(2);
    expect(a.width, 'no shutter: ' + JSON.stringify(a)).toBeLessThanOrEqual(2);
    // 1,200 px/s * 0.5 / 30 = 20 px, of which the eight samples' coverage ramps over 17.5.
    expect(Math.abs(b.top - 360), 'shutter: ' + JSON.stringify(b)).toBeLessThanOrEqual(2);
    expect(b.width, 'shutter: ' + JSON.stringify(b)).toBeGreaterThanOrEqual(15);
    expect(b.width, 'shutter: ' + JSON.stringify(b)).toBeLessThanOrEqual(24);
    expect(b.between.filter((v) => v > 40 && v < 215).length, 'values in between: ' + b.between.join(',')).toBeGreaterThanOrEqual(8);
    expect(b.middle, 'the middle of the square').toBeGreaterThan(240);
    expect(a.middle).toBeGreaterThan(240);
  });

  it('a cut stays a cut: with a 360-degree shutter, no frame holds the red clip and the blue one together', async () => {
    const { wf } = await load();
    // Red to 0.3 s, blue from 0.3 s: the cut is on frame 9's boundary at 30 fps.
    const host = await mount(`<div data-composition-id="sh2" data-start="0" data-duration="0.6" data-width="160" data-height="90" data-fps="30" style="width:160px;height:90px;position:relative;overflow:hidden;background:#000">
      <div style="position:absolute;inset:0;background:#ff0000" data-start="0" data-duration="0.3"></div>
      <div style="position:absolute;inset:0;background:#0000ff" data-start="0.3" data-duration="0.3"></div>
    </div>`);
    cleanup.push(host);
    // The positive control: the store says a shutter render ran.
    const during = new Set();
    const r = await wf.kinetic.render({ download: false, bitrate: 2e6, shutter: 360, onProgress: () => during.add(wf.getStore('kinetic').shutter) });
    expect([...during]).toEqual([360]);
    expect(r.frames).toBe(18);
    const wrong = [];
    for (let i = 0; i < 18; i++) {
      const { img } = await frameAt(r.blob, (i + 0.5) / 30);
      let purple = 0;
      // One sample of eight from the other clip is 32 of 255.
      for (let p = 0; p < img.data.length; p += 4) if (img.data[p] > 24 && img.data[p + 2] > 24) purple++;
      const mid = (45 * img.width + 80) * 4;
      const want = i < 9 ? [255, 0, 0] : [0, 0, 255];
      if (purple || !near([img.data[mid], img.data[mid + 1], img.data[mid + 2]], want)) wrong.push(i + ': ' + purple + ' purple, middle ' + [img.data[mid], img.data[mid + 1], img.data[mid + 2]].join(','));
    }
    expect(wrong).toEqual([]);
  });

  it('smear() inside a shutter render is one copy, so it renders as plain styleAt() does and is not blurred twice; without the shutter its copies make the streak', async () => {
    const { wf } = await load();
    const { smear } = wf.kinetic;
    // Above, the square as smear()'s copies in an isolated group; below, the square styled plainly.
    const host = await streakStage(wf, 'sh3', { copies() { return smear(this.local, MOVE); } },
      `<div style="position:absolute;left:0;top:130px;width:640px;height:100px;isolation:isolate" data-list="copies" data-key="key"><template><div class="copy" data-bind-style="style" style="${SQUARE}"></div></template></div>`);
    wf.kinetic.seek(0.3);
    await tick(0);
    expect(host.querySelectorAll('.copy').length).toBe(8);
    const rows = async (r) => {
      const { img } = await frameAt(r.blob, 0.31);
      return { plain: edgeOf(img, 60), smeared: edgeOf(img, 180), diff: Math.max(...Array.from({ length: 200 }, (_, j) => Math.abs(img.data[(60 * 640 + 220 + j) * 4] - img.data[(180 * 640 + 220 + j) * 4]))) };
    };
    const shut = await rows(await wf.kinetic.render({ download: false, shutter: 180 }));
    expect(shut.smeared.width, JSON.stringify(shut)).toBeGreaterThanOrEqual(15);
    expect(shut.diff, JSON.stringify(shut)).toBeLessThanOrEqual(24);
    // The copies are back once the render ends.
    expect(host.querySelectorAll('.copy').length).toBe(8);
    const open = await rows(await wf.kinetic.render({ download: false }));
    expect(open.plain.width, JSON.stringify(open)).toBeLessThanOrEqual(2);
    expect(open.smeared.width, JSON.stringify(open)).toBeGreaterThanOrEqual(15);
    expect(open.smeared.middle, JSON.stringify(open)).toBeGreaterThan(240);
  });

  it('a canvas source averages its samples too: a canvas that changes colour on every sample seek gives the average colour', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    // At 10 fps with four samples over the whole frame, sample k of a frame is at local * 40 = 4i + k.
    wf.kinetic.scene(name, {
      seek(local) {
        const k = Math.round(local * 40) % 4;
        const ctx = this.element.querySelector('canvas').getContext('2d');
        ctx.fillStyle = 'rgb(' + k * 80 + ', 0, ' + (255 - k * 80) + ')';
        ctx.fillRect(0, 0, 160, 90);
      },
    });
    const host = await mount(`<div data-composition-id="sh4" data-start="0" data-duration="0.5" data-width="160" data-height="90" data-fps="10"><div data-component="${name}"><canvas width="160" height="90"></canvas></div></div>`);
    cleanup.push(host);
    const canvas = host.querySelector('canvas');
    const plain = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6 });
    const v0 = await probeVideo(plain.blob, 0.25, 80, 45);
    expect(near(v0.px, [0, 0, 255]), 'no shutter ' + v0.px.join(',')).toBe(true);
    const r = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6, shutter: { angle: 360, samples: 4 } });
    expect(r.frames).toBe(5);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    // (0 + 80 + 160 + 240) / 4 = 120 red, and 255 - 120 = 135 blue.
    for (const at of [0.05, 0.25, 0.45]) {
      const v = await probeVideo(r.blob, at, 80, 45);
      expect(near(v.px, [120, 0, 135]), at + ' s: ' + v.px.join(',')).toBe(true);
    }
  });

  it('config({ shutter }) is the default for render(), render({ shutter: 0 }) turns it off, and config() reports it', async () => {
    const { wf } = await load();
    await streakStage(wf, 'sh5');
    try {
      expect(wf.kinetic.config({ shutter: 180 }).shutter).toEqual({ angle: 180, samples: 8 });
      const blurred = edgeOf((await frameAt((await wf.kinetic.render({ download: false })).blob, 0.31)).img, 60);
      expect(blurred.width, JSON.stringify(blurred)).toBeGreaterThanOrEqual(15);
      const sharp = edgeOf((await frameAt((await wf.kinetic.render({ download: false, shutter: 0 })).blob, 0.31)).img, 60);
      expect(sharp.width, JSON.stringify(sharp)).toBeLessThanOrEqual(2);
      const off = edgeOf((await frameAt((await wf.kinetic.render({ download: false, shutter: false })).blob, 0.31)).img, 60);
      expect(off.width, JSON.stringify(off)).toBeLessThanOrEqual(2);
      expect(wf.kinetic.config().shutter).toEqual({ angle: 180, samples: 8 });
    } finally {
      wf.kinetic.config({ shutter: false });
    }
    expect(wf.kinetic.config().shutter).toBe(false);
  });

  it('the pixels are the same on two renders of the same frame with the shutter', async () => {
    const { wf } = await load();
    await streakStage(wf, 'sh6');
    // Frame 9 as the encoder is handed it, from each render.
    const kept = [];
    const encode = VideoEncoder.prototype.encode;
    VideoEncoder.prototype.encode = function (frame, opts) {
      if (frame.timestamp === Math.round(9 * 1e6 / 30)) kept.push(frame.clone());
      return encode.call(this, frame, opts);
    };
    try {
      await wf.kinetic.render({ download: false, shutter: 180 });
      await wf.kinetic.render({ download: false, shutter: 180 });
    } finally {
      VideoEncoder.prototype.encode = encode;
    }
    expect(kept.length).toBe(2);
    const bytes = await Promise.all(kept.map(async (f) => {
      const b = new Uint8Array(f.allocationSize());
      await f.copyTo(b);
      f.close();
      return b;
    }));
    expect(bytes[0].length).toBe(bytes[1].length);
    let differ = 0, grey = 0;
    for (let j = 0; j < bytes[0].length; j++) {
      if (bytes[0][j] !== bytes[1][j]) differ++;
      if (bytes[0][j] > 40 && bytes[0][j] < 215) grey++;
    }
    expect(differ).toBe(0);
    // It is the blurred frame: the ramp's in-between values are in it.
    expect(grey).toBeGreaterThan(1000);
  });

  // The encoder takes a canvas's colour weighted by its alpha, so a
  // transparent pixel is black in the file. An average of the samples'
  // colours that left their alpha out darkened a pixel the square covered in
  // m of 8 samples to (m / 8)^2 of white on a transparent root (measured:
  // 195, 143, 99, 64 where the black stage gives 223, 191, 159, 128).
  it('on a transparent root the streak is the one over black: the ramp is as light as on a black stage', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { move() { return wf.kinetic.styleAt(this.local, MOVE); } } });
    // Above, the square on a black band; below, the same square on nothing.
    const host = await mount(`<div data-composition-id="sh8" data-start="0" data-duration="0.4" data-width="640" data-height="240" data-fps="30" style="width:640px;height:240px;position:relative;overflow:hidden">
      <div data-component="${name}" style="position:absolute;inset:0">
        <div style="position:absolute;left:0;top:0;width:640px;height:120px;background:#000"><div data-bind-style="move" style="${SQUARE};top:10px"></div></div>
        <div data-bind-style="move" style="${SQUARE};top:130px"></div>
      </div>
    </div>`);
    cleanup.push(host);
    const r = await wf.kinetic.render({ download: false, shutter: 180 });
    const { img } = await frameAt(r.blob, 0.31);
    const black = edgeOf(img, 60), clear = edgeOf(img, 180);
    const diff = Math.max(...Array.from({ length: 200 }, (_, j) => Math.abs(img.data[(60 * 640 + 220 + j) * 4] - img.data[(180 * 640 + 220 + j) * 4])));
    expect(clear.width, JSON.stringify({ black, clear })).toBeGreaterThanOrEqual(15);
    expect(diff, JSON.stringify({ black, clear })).toBeLessThanOrEqual(24);
  });

  // Above 180 * S / (S - 1) degrees the last samples of frame i are past
  // its middle, where Math.round(local * fps) is i + 1. A frame number
  // read during a sample seek is the frame's own.
  it('frame and clipFrame stay on the frame through its samples: at 360 degrees an element shown from clipFrame 9 leaves no trace in frame 8, and rows[clipFrame] reads no row past the last', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const ROWS = Array.from({ length: 12 }, (_, i) => ({ v: i }));   // one per frame of 0.4 s at 30 fps
    const seen = [];
    wf.kinetic.scene(name, {
      computed: { late() { return { opacity: this.clipFrame >= 9 ? '1' : '0' }; } },
      seek() { seen.push([this.clipFrame, wf.getStore('kinetic').frame]); return ROWS[this.clipFrame].v; },
    });
    const host = await mount(`<div data-composition-id="sh9" data-start="0" data-duration="0.4" data-width="160" data-height="90" data-fps="30" style="width:160px;height:90px;position:relative;overflow:hidden;background:#000">
      <div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="late" style="position:absolute;inset:0;background:#fff"></div></div>
    </div>`);
    cleanup.push(host);
    const errors = [];
    const orig = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    let r;
    try {
      seen.length = 0;
      r = await wf.kinetic.render({ download: false, bitrate: 2e6, shutter: 360 });
    } finally {
      console.error = orig;
    }
    const f8 = await probeVideo(r.blob, 8.5 / 30, 80, 45);
    expect(f8.px[0], 'frame 8 ' + f8.px.join(',')).toBeLessThan(16);
    const f9 = await probeVideo(r.blob, 9.5 / 30, 80, 45);
    expect(f9.px[0], 'frame 9 ' + f9.px.join(',')).toBeGreaterThan(240);
    expect(errors).toEqual([]);
    // Every seek of the render saw a frame from 0 to 11, the store's and the clip's alike.
    expect(Math.max(...seen.map((s) => Math.max(s[0], s[1]))), JSON.stringify(seen)).toBe(11);
    expect(seen.every((s) => s[0] === s[1])).toBe(true);
  });

  it("a render without a shutter leaves the store's shutter as it found it", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="sh10" data-start="0" data-duration="0.2" data-width="64" data-height="36" data-fps="10"><div data-component="${name}"><canvas width="64" height="36"></canvas></div></div>`);
    cleanup.push(host);
    const store = wf.getStore('kinetic');
    try {
      store.shutter = 90;
      await wf.kinetic.render({ source: host.querySelector('canvas'), download: false, bitrate: 1e6 });
      expect(store.shutter).toBe(90);
    } finally {
      store.shutter = 0;
    }
  });

  it('a bad shutter is KN-100 before the page is touched', async () => {
    const { wf } = await load();
    const host = await streakStage(wf, 'sh7');
    const root = host.firstElementChild;
    const TYPE = 'shutter is an angle in degrees, { angle, samples }, or 0, false or null, not ';
    // The where names the field: render({ shutter: { angle } }).
    const cases = [[400, 'angle', 'angle is a number above 0, up to 360, not 400'], [{ angle: 0 }, 'angle', 'angle is a number above 0, up to 360, not 0'],
      [{ samples: 1 }, 'samples', 'samples is a whole number from 2 to 64, not 1'], [{ samples: 65 }, 'samples', 'samples is a whole number from 2 to 64, not 65'],
      ['180', '', TYPE + '"180"'], [true, '', TYPE + 'true'], [[180, 8], '', TYPE + '[180,8]'],
      [{ angle: 180, smaples: 8 }, 'smaples', "'smaples' is not a field of shutter; the fields are angle and samples"]];
    for (const [shutter, field, message] of cases) {
      const err = await wf.kinetic.render({ download: false, shutter }).catch((e) => e);
      expectKN(err, 'KN-100', field ? 'render({ shutter: { ' + field + ' } })' : 'render({ shutter })', message);
      expect('root parent=' + root.parentElement.tagName + ' wraps=' + document.querySelectorAll('[data-kinetic-render]').length).toBe('root parent=DIV wraps=0');
      expect(wf.getStore('kinetic').shutter).toBe(0);
    }
  });
});

describe(`render() and check() agree on readiness's failures (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // Each page renders its root's canvas, so the render needs no HTML in
  // canvas. check() and render() each run readiness on the page as it is,
  // and the root's mark follows the last run.
  const FIX = '/packages/kinetic/test/fixtures/';
  const STAGE = (id, inner = '') => `<div data-composition-id="${id}" data-start="0" data-duration="0.3" data-fps="10" data-width="64" data-height="36" style="position:relative;width:64px;height:36px"><canvas id="cv" width="64" height="36"></canvas>${inner}</div>`;
  // fetch() answers 404 for a URL containing `part` until the page sets window.__fixed.
  const BROKEN = (part) => `<script>{ const f = window.fetch; window.fetch = (u, o) => (String(u).includes(${JSON.stringify(part)}) && !window.__fixed ? Promise.resolve(new Response('', { status: 404 })) : f(u, o)); }<\/script>`;
  // check(), then render(): check()'s ok and reason, the root's mark, and
  // render()'s frames or its error's code; `err` is the error.
  async function both(p) {
    const r = await p.kinetic.check({ samples: 2 });
    const out = await p.kinetic.render({ download: false, source: p.doc.getElementById('cv') }).then((v) => v, (e) => e);
    const err = out && out.blob ? null : out;   // an Error of the frame's realm
    return { got: [r.ok, r.reason, p.doc.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready'), err ? err.code || err.message : out.frames], err };
  }
  const PASS = [true, undefined, 'true', 3];
  const FAIL = (code) => [false, 'readiness failed', 'failed', code];

  // A scene mounted after frame 0 whose input fails is KN-130: check()
  // fails and render() rejects with it before the page is touched; once the
  // scene is removed, both pass.
  it('a late KN-130 fails check() and render() alike, and both pass once its scene is removed', async () => {
    const p = await framedPage(STAGE('ra') + `<script>wildflower.kinetic.scene('ra-card', { inputs: { title: { type: String, required: true } } });<\/script>`, cleanup, '', '');
    expect(p.result).toBe('resolved');
    const root = p.doc.querySelector('[data-composition-id]');
    root.insertAdjacentHTML('beforeend', '<div id="card" data-component="ra-card" data-start="0"><b data-bind="inputs.title"></b></div>');
    p.w.wildflower.scan(root);
    for (let i = 0; i < 100 && root.getAttribute('data-kinetic-ready') !== 'failed'; i++) await tick(10);
    const a = await both(p);
    expect(a.got).toEqual(FAIL('KN-130'));
    expectKN(a.err, 'KN-130', "scene 'ra-card' input 'title'");
    p.doc.getElementById('card').remove();
    expect((await both(p)).got).toEqual(PASS);
  });

  // A section that mounts a scene with a bad input partway: the failure is
  // reported during the seeks, after the run, and fails check() and render()
  // alike, on every call.
  it('a scene a section mounts partway with a bad input fails every check() and render() with KN-130, reported during their seeks', async () => {
    const p = await framedPage(STAGE('rg', '<div data-component="rg-host" data-start="0" style="position:absolute;inset:0"><div data-render="on"><div data-component="rg-bad"><b data-bind="inputs.title"></b></div></div></div>')
      + `<script>
        wildflower.kinetic.scene('rg-host', { computed: { on() { return this.local >= 0.15; } } });
        wildflower.kinetic.scene('rg-bad', { inputs: { title: { type: String, required: true } } });
      <\/script>`, cleanup, '', '');
    expect(p.result).toBe('resolved');
    for (let i = 1; i <= 2; i++) {
      const s = await both(p);
      expect(s.got, 'call ' + i).toEqual(FAIL('KN-130'));
      expectKN(s.err, 'KN-130', "scene 'rg-bad' input 'title'");
    }
  });

  // The first run fails at page load, so readiness never settled; once the
  // files are there, the next check() passes and the root is "true" again.
  it('a luma map and an animated image that 404 at page load and are fixed afterwards: check() and render() pass, and the root is "true" again', async () => {
    const p = await framedPage(STAGE('rb', `<div style="position:absolute;inset:0;background:#00f" data-start="0.1" data-duration="0.2" data-clip-enter="luma url(${FIX}ramp.png?rb) 0.1s"></div>`)
      + `<script>wildflower.kinetic.animatedImage('${FIX}frames.gif?rb');<\/script>`, cleanup, '', BROKEN('?rb'));
    expect(p.result && p.result.code).toMatch(/^KN-1(17|81)$/);
    expect(p.doc.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready')).toBe('failed');
    const a = await both(p);
    expect(a.got.slice(0, 3)).toEqual(FAIL('').slice(0, 3));
    expect(a.got[3]).toMatch(/^KN-1(17|81)$/);
    p.w.__fixed = true;
    expect((await both(p)).got).toEqual(PASS);
  });

  // A failure is the page's only while its source is on the page: a clip
  // whose map fails, removed or given a map that loads, fails nothing.
  it('a clip whose luma map fails stops failing check() and render() once it is removed, or once its map is one that loads', async () => {
    const p = await framedPage(STAGE('rc'), cleanup, '', BROKEN('missing-map'));
    expect(p.result).toBe('resolved');
    const root = p.doc.querySelector('[data-composition-id]');
    const clip = (id) => root.insertAdjacentHTML('beforeend', `<div id="${id}" style="position:absolute;inset:0;background:#00f" data-start="0.1" data-duration="0.2" data-clip-enter="luma url(${FIX}missing-map.png) 0.1s"></div>`);
    clip('m1');
    const a = await both(p);
    expect(a.got).toEqual(FAIL('KN-117'));
    expectKN(a.err, 'KN-117', "the map url(" + FIX + "missing-map.png) of div#m1's data-clip-enter");
    p.doc.getElementById('m1').remove();
    expect((await both(p)).got).toEqual(PASS);
    clip('m2');
    expect((await both(p)).got).toEqual(FAIL('KN-117'));
    p.doc.getElementById('m2').setAttribute('data-clip-enter', `luma url(${FIX}ramp.png) 0.1s`);
    expect((await both(p)).got).toEqual(PASS);
  });

  it('a scene whose waitFor names no query (KN-133), and one whose query failed (KN-131), stop failing check() and render() once they are removed', async ({ skip }) => {
    const p = await framedPage(STAGE('rd', '<div id="sa" data-component="rd-a" data-start="0"></div><div id="sb" data-component="rd-b" data-start="0"></div>')
      + `<script>if (typeof wildflower.query === 'function') {
          wildflower.query('rd-bad', { from: () => Promise.reject(new Error('down')) });
          wildflower.kinetic.scene('rd-a', { waitFor: ['rd-none'] });
          wildflower.kinetic.scene('rd-b', { waitFor: ['rd-bad'] });
        }<\/script>`, cleanup, '', '');
    if (typeof p.w.wildflower.query !== 'function') skip();
    expect(p.result && p.result.code).toMatch(/^KN-13[13]$/);
    expect((await both(p)).got[3]).toMatch(/^KN-13[13]$/);
    p.doc.getElementById('sa').remove();
    const b = await both(p);
    expect(b.got).toEqual(FAIL('KN-131'));
    expectKN(b.err, 'KN-131', "scene 'rd-b' waits for query 'rd-bad'");
    p.doc.getElementById('sb').remove();
    expect((await both(p)).got).toEqual(PASS);
  });

  it('a waitFor query that failed at page load and has loaded since: check() and render() pass with no ready() call', async ({ skip }) => {
    const p = await framedPage(STAGE('re', '<div data-component="re-a" data-start="0"></div>')
      + `<script>if (typeof wildflower.query === 'function') {
          let n = 0;
          wildflower.query('re-flaky', { from: () => (n++ ? Promise.resolve([{ id: 1 }]) : Promise.reject(new Error('down'))) });
          wildflower.kinetic.scene('re-a', { waitFor: ['re-flaky'] });
        }<\/script>`, cleanup, '', '');
    if (typeof p.w.wildflower.query !== 'function') skip();
    expectKN(p.result, 'KN-131', "scene 're-a' waits for query 're-flaky'");
    await p.w.wildflower.getQuery('re-flaky').refresh();
    expect(p.w.wildflower.getQuery('re-flaky').error).toBeFalsy();
    expect((await both(p)).got).toEqual(PASS);
  });

  // Clips that share a file share its decode: with the first or the last
  // taken off the page, the one left still fails, and its own element is
  // named.
  it('three audio clips share a file that fails: with the first and then the last removed, check() and render() still fail, naming the clip left; with all removed, both pass', async () => {
    const p = await framedPage(STAGE('rf', ['a1', 'a2', 'a3'].map((id) => `<audio id="${id}" src="${FIX}missing-sound.wav" data-start="0"></audio>`).join('')), cleanup, '', BROKEN('missing-sound'));
    expect(p.result && p.result.code).toBe('KN-135');
    for (const gone of ['a1', 'a3']) {
      p.doc.getElementById(gone).remove();
      const a = await both(p);
      expect(a.got, 'with ' + gone + ' removed').toEqual(FAIL('KN-135'));
      expectKN(a.err, 'KN-135', 'the audio clip audio#a2 (' + FIX + 'missing-sound.wav)');
    }
    p.doc.getElementById('a2').remove();
    expect((await both(p)).got).toEqual(PASS);
    // render({ audio: false }) waits for the audio clips as readiness does.
    p.doc.querySelector('[data-composition-id]').insertAdjacentHTML('beforeend', `<audio id="a4" src="${FIX}missing-sound.wav" data-start="0"></audio>`);
    const off = await p.kinetic.render({ download: false, audio: false, source: p.doc.getElementById('cv') }).catch((e) => e);
    expectKN(off, 'KN-135', 'the audio clip audio#a4 (' + FIX + 'missing-sound.wav)');
  });
});
