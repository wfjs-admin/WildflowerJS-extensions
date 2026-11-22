/**
 * render({ alpha: true }): a QuickTime file of PNG frames with transparency,
 * in the installed Chrome with HTML-in-Canvas enabled (vitest.render.config.js).
 * The file is parsed here: ftyp qt, one video trak with a `png ` sample
 * entry of depth 32, its sample tables, no sound; each sample a PNG whose
 * pixels are read back: the cleared background fully transparent, a
 * half-transparent shape's alpha near its opacity, its color straight. The
 * finish is off, the shutter's edges carry straight alpha, the root's
 * background and the page mark come back after the render and after a
 * failure, config({ alpha }) sets the default and the bar's Render follows
 * it, KN-100 for a bad value and KN-201 where the browser cannot draw.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const restores = [];
afterEach(async () => {
  for (const f of restores.splice(0)) f();
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ alpha: false, finish: null, shutter: 0, preview: false });
  for (const el of cleanup.splice(0)) el.remove();
});

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);

// The boxes of a QuickTime or MP4 file: { type, start, size, body, kids }.
function boxes(bytes, from = 0, to = bytes.length) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  for (let at = from; at + 8 <= to;) {
    let size = dv.getUint32(at), head = 8;
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (size === 1) { size = dv.getUint32(at + 8) * 4294967296 + dv.getUint32(at + 12); head = 16; }
    if (size === 0) size = to - at;
    const b = { type, start: at, size, body: at + head };
    if (CONTAINERS.has(type)) b.kids = boxes(bytes, at + head, at + size);
    out.push(b);
    at += size;
  }
  return out;
}
const find = (list, ...path) => {
  let b = null;
  for (const t of path) { b = (list || []).find((x) => x.type === t); if (!b) return null; list = b.kids; }
  return b;
};

// The file's parts: the movie's and the track's lengths, the sample entry,
// the frames' times, sizes and offsets.
async function parseMov(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(bytes.buffer);
  const top = boxes(bytes);
  const ftyp = find(top, 'ftyp');
  const moov = find(top, 'moov');
  const mvhd = find(moov.kids, 'mvhd');
  const v = bytes[mvhd.body];
  const mvTimescale = dv.getUint32(mvhd.body + (v ? 20 : 12));
  const mvDuration = v ? dv.getUint32(mvhd.body + 24) * 4294967296 + dv.getUint32(mvhd.body + 28) : dv.getUint32(mvhd.body + 16);
  const traks = moov.kids.filter((b) => b.type === 'trak');
  const trak = traks[0];
  const hdlr = find(trak.kids, 'mdia', 'hdlr');
  const mdhd = find(trak.kids, 'mdia', 'mdhd');
  const mv = bytes[mdhd.body];
  const timescale = dv.getUint32(mdhd.body + (mv ? 20 : 12));
  const duration = mv ? dv.getUint32(mdhd.body + 24) * 4294967296 + dv.getUint32(mdhd.body + 28) : dv.getUint32(mdhd.body + 16);
  const stbl = find(trak.kids, 'mdia', 'minf', 'stbl');
  const stsd = find(stbl.kids, 'stsd');
  const entry = stsd.body + 8;
  const entryType = String.fromCharCode(...bytes.subarray(entry + 4, entry + 8));
  // The image description: width and height at 32, depth at 82 from its start.
  const entryWidth = dv.getUint16(entry + 32), entryHeight = dv.getUint16(entry + 34), depth = dv.getUint16(entry + 82);
  const stts = find(stbl.kids, 'stts');
  let frames = 0, ticks = 0;
  for (let i = 0, n = dv.getUint32(stts.body + 4); i < n; i++) {
    const c = dv.getUint32(stts.body + 8 + i * 8), d = dv.getUint32(stts.body + 12 + i * 8);
    frames += c; ticks += c * d;
  }
  const stsz = find(stbl.kids, 'stsz');
  const sizes = [];
  for (let i = 0, n = dv.getUint32(stsz.body + 8); i < n; i++) sizes.push(dv.getUint32(stsz.body + 12 + i * 4));
  const stco = find(stbl.kids, 'stco'), co64 = find(stbl.kids, 'co64');
  const first = stco ? dv.getUint32(stco.body + 8) : dv.getUint32(co64.body + 8) * 4294967296 + dv.getUint32(co64.body + 12);
  const offsets = [];
  for (let i = 0, at = first; i < sizes.length; at += sizes[i++]) offsets.push(at);
  return {
    bytes, top: top.map((b) => b.type), brand: String.fromCharCode(...bytes.subarray(ftyp.body, ftyp.body + 4)),
    traks: traks.length, handler: String.fromCharCode(...bytes.subarray(hdlr.body + 8, hdlr.body + 12)),
    seconds: mvDuration / mvTimescale, trackSeconds: duration / timescale, sttsSeconds: ticks / timescale,
    entryType, entryWidth, entryHeight, depth, frames, sizes, offsets, mdat: find(top, 'mdat'),
  };
}

// Frame i's PNG as straight RGBA: drawn into a canvas, which gives back the
// file's own straight values for an alpha of 128 and up.
async function pixels(mov, i) {
  const png = mov.bytes.slice(mov.offsets[i], mov.offsets[i] + mov.sizes[i]);
  expect(Array.from(png.subarray(0, 8)), 'a PNG signature').toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, at: (x, y) => Array.from(img.data.subarray((y * c.width + x) * 4, (y * c.width + x) * 4 + 4)), img };
}

const close = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// A 160 x 90 stage at 10 fps on a navy background: a red box at half
// opacity until 0.3 s, then a blue one, over a transparent stage.
async function stage(wf, duration = 0.6, extra = '') {
  const name = uniqueName('scene');
  wf.kinetic.scene(name, { computed: { box() { return { background: this.local < 0.3 ? '#ff0000' : '#0000ff' }; } } });
  const id = uniqueName('al');
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="${duration}" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative;overflow:hidden;background:#123456">
    <div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="box" style="position:absolute;left:40px;top:20px;width:80px;height:50px;opacity:0.5"></div>${extra}</div>
  </div>`);
  cleanup.push(host);
  return { id, root: host.querySelector('[data-composition-id]') };
}

describe(`render({ alpha }) (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a QuickTime file of PNG frames: ftyp qt, one png  track of depth 32, no sound, the frames and the length right; the background clear, the shape at its opacity with straight color', async () => {
    const { wf } = await load();
    const { id, root } = await stage(wf);
    const html = document.documentElement;
    const during = [];
    const r = await wf.kinetic.render({ alpha: true, download: false, onProgress: () => {
      during.push([html.hasAttribute('data-kinetic-alpha'), getComputedStyle(root).backgroundColor]);
    } });
    expect(r.name).toBe(id + '.mov');
    expect(r.blob.type).toBe('video/quicktime');
    expect(r.frames).toBe(6);
    expect([r.width, r.height, r.fps]).toEqual([160, 90, 10]);
    expect(r.codec).toBe('png');
    expect(r.audioCodec).toBe(null);
    // The page is marked and the root's background clear while it renders.
    expect(during.length).toBe(6);
    for (const d of during) expect(d).toEqual([true, 'rgba(0, 0, 0, 0)']);
    // And both back after.
    expect(html.hasAttribute('data-kinetic-alpha')).toBe(false);
    expect(getComputedStyle(root).backgroundColor).toBe('rgb(18, 52, 86)');
    expect(root.hasAttribute('data-kinetic-clear')).toBe(false);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();

    const mov = await parseMov(r.blob);
    expect(mov.brand).toBe('qt  ');
    expect(mov.top).toEqual(['ftyp', 'mdat', 'moov']);
    expect(mov.traks, 'one track: no sound').toBe(1);
    expect(mov.handler).toBe('vide');
    expect(mov.entryType).toBe('png ');
    expect([mov.entryWidth, mov.entryHeight, mov.depth]).toEqual([160, 90, 32]);
    expect(mov.frames).toBe(6);
    expect(mov.sizes.length).toBe(6);
    expect(mov.seconds).toBeCloseTo(0.6, 6);
    expect(mov.trackSeconds).toBeCloseTo(0.6, 6);
    expect(mov.sttsSeconds).toBeCloseTo(0.6, 6);
    // The samples fill mdat, and the file is the blob's size.
    const end = mov.offsets[5] + mov.sizes[5];
    expect(end).toBe(mov.mdat.start + mov.mdat.size);
    expect(mov.bytes.length).toBe(r.blob.size);

    const early = await pixels(mov, 1), late = await pixels(mov, 4);
    expect([early.width, early.height]).toEqual([160, 90]);
    expect(early.at(5, 5), 'the background, clear').toEqual([0, 0, 0, 0]);
    expect(early.at(155, 85), 'the background, clear').toEqual([0, 0, 0, 0]);
    // Half opacity: alpha near 128, and the color straight: full red, not
    // red multiplied by its alpha.
    const red = early.at(80, 45);
    expect(Math.abs(red[3] - 128), red.join(',')).toBeLessThanOrEqual(3);
    expect(close(red.slice(0, 3), [255, 0, 0]), red.join(',')).toBe(true);
    const blue = late.at(80, 45);
    expect(Math.abs(blue[3] - 128), blue.join(',')).toBeLessThanOrEqual(3);
    expect(close(blue.slice(0, 3), [0, 0, 255]), blue.join(',')).toBe(true);
  });

  it('the finish is off: a grade of exposure -1 set with config() leaves the color as it is', async () => {
    const { wf } = await load();
    await stage(wf, 0.3);
    wf.kinetic.config({ finish: { grade: { exposure: -1 }, vignette: 1 } });
    const r = await wf.kinetic.render({ alpha: true, download: false });
    const f = await pixels(await parseMov(r.blob), 1);
    const red = f.at(80, 45);
    expect(close(red.slice(0, 3), [255, 0, 0]), red.join(',')).toBe(true);
    expect(f.at(2, 2), 'no vignette in a corner').toEqual([0, 0, 0, 0]);
  });

  it('the shutter keeps straight alpha: a white square crossing a clear stage has a ramp of alpha at its edge, white all along it', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { move() { return wf.kinetic.styleAt(this.local, { translateX: { at: [0, 1], to: [-100, 1100] } }); } } });
    const host = await mount(`<div data-composition-id="${uniqueName('as')}" data-start="0" data-duration="0.4" data-width="640" data-height="120" data-fps="30" style="width:640px;height:120px;position:relative;overflow:hidden;background:#000">
      <div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="move" style="position:absolute;left:0;top:10px;width:100px;height:100px;background:#fff"></div></div>
    </div>`);
    cleanup.push(host);
    const r = await wf.kinetic.render({ alpha: true, shutter: 180, download: false });
    const mov = await parseMov(r.blob);
    expect(mov.frames).toBe(12);
    // Frame 9 (0.3 s): the square covers 260 to 360, streaked 20 px past it.
    const f = await pixels(mov, 9);
    const row = Array.from({ length: 60 }, (_, j) => f.at(330 + j, 60));
    const ramp = row.filter((p) => p[3] > 20 && p[3] < 235);
    expect(ramp.length, row.map((p) => p[3]).join(',')).toBeGreaterThanOrEqual(8);
    // Straight color: white at every alpha of the ramp (an opaque average
    // would be grey over black, a premultiplied one grey with its alpha).
    for (const p of ramp.filter((q) => q[3] >= 64)) expect(Math.min(p[0], p[1], p[2]), p.join(',')).toBeGreaterThan(240);
    expect(f.at(300, 60), 'inside the square').toEqual([255, 255, 255, 255]);
    expect(f.at(5, 60)[3], 'clear behind it').toBe(0);
    expect(f.at(630, 60)[3], 'clear ahead of it').toBe(0);
  });

  it('a render that fails or is aborted puts the root\'s background and the page mark back', async () => {
    const { wf } = await load();
    const { root } = await stage(wf);
    const html = document.documentElement;
    const err = await wf.kinetic.render({ alpha: true, download: false, onProgress: (i) => { if (i === 2) throw new Error('stopped at 2'); } }).catch((e) => e);
    expect(String(err && err.message)).toMatch(/stopped at 2/);
    expect(html.hasAttribute('data-kinetic-alpha')).toBe(false);
    expect(root.hasAttribute('data-kinetic-clear')).toBe(false);
    expect(getComputedStyle(root).backgroundColor).toBe('rgb(18, 52, 86)');
    const ac = new AbortController();
    const aborted = await wf.kinetic.render({ alpha: true, download: false, signal: ac.signal, onProgress: (i) => { if (i === 1) ac.abort(); } }).catch((e) => e);
    expect(aborted && aborted.name).toBe('AbortError');
    expect(html.hasAttribute('data-kinetic-alpha')).toBe(false);
    expect(getComputedStyle(root).backgroundColor).toBe('rgb(18, 52, 86)');
    // A page that marked <html> itself keeps its mark.
    html.setAttribute('data-kinetic-alpha', 'mine');
    try {
      await wf.kinetic.render({ alpha: true, download: false, to: 0.1 });
      expect(html.getAttribute('data-kinetic-alpha')).toBe('mine');
    } finally {
      html.removeAttribute('data-kinetic-alpha');
    }
  });

  it('a page\'s CSS answers the mark: an element it hides under [data-kinetic-alpha] is out of the file', async () => {
    const { wf } = await load();
    const style = document.createElement('style');
    style.textContent = '[data-kinetic-alpha] .backdrop { display: none }';
    document.head.appendChild(style);
    cleanup.push(style);
    await stage(wf, 0.3, '<div class="backdrop" style="position:absolute;left:0;top:0;width:20px;height:20px;background:#0f0"></div>');
    const r = await wf.kinetic.render({ alpha: true, download: false });
    const f = await pixels(await parseMov(r.blob), 1);
    expect(f.at(10, 10)).toEqual([0, 0, 0, 0]);
  });

  it('config({ alpha }) is the default for render(), render({ alpha: false }) writes an MP4, config() reports it, and KN-100 for a value that is not a boolean', async () => {
    const { wf } = await load();
    const { id } = await stage(wf, 0.3);
    expect(wf.kinetic.config().alpha).toBe(false);
    expect(wf.kinetic.config({ alpha: true }).alpha).toBe(true);
    const mov = await wf.kinetic.render({ download: false });
    expect(mov.name).toBe(id + '.mov');
    expect(mov.blob.type).toBe('video/quicktime');
    const mp4 = await wf.kinetic.render({ download: false, alpha: false, bitrate: 1e6 });
    expect(mp4.name).toBe(id + '.mp4');
    expect(mp4.blob.type).toBe('video/mp4');
    expectKN(() => wf.kinetic.config({ alpha: 'yes' }), 'KN-100', 'config({ alpha })', /alpha is true .* or false/);
    expect(wf.kinetic.config().alpha, 'a refused value changes nothing').toBe(true);
    wf.kinetic.config({ alpha: false });
    await expectKN(wf.kinetic.render({ alpha: 1, download: false }), 'KN-100', 'render({ alpha })', /alpha is true .* or false/);
    expect(document.querySelector('[data-kinetic-render]')).toBeNull();
    expect(document.documentElement.hasAttribute('data-kinetic-alpha')).toBe(false);
  });

  it('KN-201 where the browser cannot draw the page, as an MP4 render, with the page untouched', async () => {
    const { wf } = await load();
    const { root } = await stage(wf, 0.3);
    const orig = CanvasRenderingContext2D.prototype.drawElementImage;
    delete CanvasRenderingContext2D.prototype.drawElementImage;
    try {
      await expectKN(wf.kinetic.render({ alpha: true, download: false }), 'KN-201', 'render()', /drawElementImage/);
    } finally {
      CanvasRenderingContext2D.prototype.drawElementImage = orig;
    }
    expect(document.documentElement.hasAttribute('data-kinetic-alpha')).toBe(false);
    expect(getComputedStyle(root).backgroundColor).toBe('rgb(18, 52, 86)');
  });

  it("the bar's Render follows config({ alpha }): the dialog first, then a MOV", async () => {
    const { wf } = await load();
    const { id } = await stage(wf, 0.3);
    wf.kinetic.config({ alpha: true, preview: true });
    await tick(20);
    const bar = document.querySelector('[data-kinetic-preview]');
    const orig = wf.kinetic.render;
    let result = null, failed = null;
    const wrapped = (o) => orig(Object.assign({}, o, { download: false })).then((r) => (result = r), (e) => { failed = e; throw e; });
    wrapped.still = orig.still;
    wf.kinetic.render = wrapped;
    restores.push(() => { wf.kinetic.render = orig; });
    bar.querySelector('[data-action="render"]').click();
    await tick(20);
    const dialog = bar.querySelector('dialog[data-kinetic-alpha-notice]');
    expect(dialog.open).toBe(true);
    expect(result).toBe(null);
    dialog.querySelector('[data-action="alphaRender"]').click();
    for (let i = 0; i < 200 && !result && !failed; i++) await tick(25);
    expect(failed).toBe(null);
    expect(dialog.open).toBe(false);
    expect(result.name).toBe(id + '.mov');
    expect((await parseMov(result.blob)).entryType).toBe('png ');
  });
});
