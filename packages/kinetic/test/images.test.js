/**
 * animatedImage(src): a GIF, animated WebP or APNG decoded with ImageDecoder
 * and drawn by time. The fixtures (fixtures/make-images.cjs) give each frame
 * one colour for its number, 0 red, 1 green, 2 blue, 3 yellow, at uneven
 * durations: frames.gif 100, 300, 200 and 400 ms; frames.webp 150, 50, 300
 * and 500 ms; frames.png (APNG) 200, 100 and 300 ms.
 *
 * The cells: made before ready() is first called (at the top level of a
 * page's script, outside any scene) and after; the same URL twice; frameAt()
 * and draw() by the durations, loop on and off, t before 0; canvases of
 * different sizes; a 404, an undecodable file, a file that is no image and
 * a file on another origin that cannot be fetched (KN-181, before and after
 * frame 0); no ImageDecoder (KN-100); a bad call (KN-100); check() with the
 * image drawn in a scene's seek. A render is in lottie-render.test.js.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, dispatchSeek, uniqueName, expectKN, framedPage, BUILD, CORE_TIER } from './helpers.js';

const FIX = '/packages/kinetic/test/fixtures/';
const GIF = FIX + 'frames.gif', WEBP = FIX + 'frames.webp', APNG = FIX + 'frames.png';
const cleanup = [];
const scenesToDrop = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

// The frame number a colour gives, or -1.
const number = ([r, g, b]) => (r > 128 && g > 128 && b < 128 ? 3 : r > 128 && g < 128 && b < 128 ? 0
  : r < 128 && g > 128 && b < 128 ? 1 : r < 128 && g < 128 && b > 128 ? 2 : -1);
const shown = (canvas, x, y) => number(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

async function stage(id, inner = '') {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="4" data-fps="10" data-width="100" data-height="100" style="position:relative;width:100px;height:100px">${inner}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return { wf, host };
}

describe(`animatedImage() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('frames and duration from the file; frameAt() follows the uneven durations, loop wraps by default and false holds the last frame, and before 0 is the first frame', async () => {
    const { wf } = await stage('ai1');
    const gif = wf.kinetic.animatedImage(GIF), webp = wf.kinetic.animatedImage(WEBP), apng = wf.kinetic.animatedImage(APNG);
    await wf.kinetic.ready();
    expect([gif.frames, gif.duration, webp.frames, webp.duration, apng.frames, apng.duration]).toEqual([4, 1, 4, 1, 3, 0.6]);
    // [t, frame with loop, frame without]
    const table = {
      gif: [gif, [[-0.5, 0, 0], [0, 0, 0], [0.0999, 0, 0], [0.1, 1, 1], [0.25, 1, 1], [0.3999, 1, 1], [0.4, 2, 2], [0.5999, 2, 2],
        [0.6, 3, 3], [0.9999, 3, 3], [1, 0, 3], [1.15, 1, 3], [7.45, 2, 3]]],
      webp: [webp, [[0.149, 0, 0], [0.15, 1, 1], [0.199, 1, 1], [0.2, 2, 2], [0.4999, 2, 2], [0.5, 3, 3], [1, 0, 3], [1.17, 1, 3]]],
      apng: [apng, [[0.25, 1, 1], [0.3, 2, 2], [0.65, 0, 2]]],
    };
    for (const [kind, [h, rows]] of Object.entries(table)) {
      for (const [t, looped, held] of rows) {
        expect(h.frameAt(t), kind + ' at ' + t).toBe(looped);
        expect(h.frameAt(t, { loop: true }), kind + ' at ' + t + ', loop').toBe(looped);
        expect(h.frameAt(t, { loop: false }), kind + ' at ' + t + ', no loop').toBe(held);
      }
    }
  });

  it("loop follows the file by default, as browsers play it: a file played once holds its last frame, one played twice wraps once, and loop overrides it", async () => {
    const { wf } = await stage('ai7');
    const once = wf.kinetic.animatedImage(FIX + 'once.gif'), twice = wf.kinetic.animatedImage(FIX + 'twice.gif');
    await wf.kinetic.ready();
    expect([once.frames, once.duration, twice.duration]).toEqual([2, 0.2, 0.2]);
    // [t, once, twice]
    for (const [t, a, b] of [[0.05, 0, 0], [0.15, 1, 1], [0.25, 1, 0], [0.35, 1, 1], [0.45, 1, 1], [5, 1, 1]]) {
      expect([once.frameAt(t), twice.frameAt(t)], 'at ' + t).toEqual([a, b]);
    }
    expect([once.frameAt(0.25, { loop: true }), twice.frameAt(0.45, { loop: true }), twice.frameAt(0.25, { loop: false })]).toEqual([0, 0, 1]);
    const c = canvas(4, 4);
    once.draw(c, 0.25);
    expect(shown(c, 1, 1)).toBe(1);
  });

  it('a frame of 10 ms or less lasts 100 ms, as browsers play it: frames of 10, 190 and 0 ms play for 100, 190 and 100', async () => {
    const { wf } = await stage('ai8');
    const h = wf.kinetic.animatedImage(FIX + 'short.gif');
    await wf.kinetic.ready();
    expect([h.frames, h.duration]).toEqual([3, 0.39]);
    for (const [t, f] of [[0.05, 0], [0.099, 0], [0.1, 1], [0.289, 1], [0.29, 2], [0.389, 2], [0.39, 0], [0.45, 0]]) expect(h.frameAt(t), 'at ' + t).toBe(f);
  });

  it("draw() draws with no transform of its own, whatever the context's transform, and leaves it as it was", async () => {
    const { wf } = await stage('ai9');
    const gif = wf.kinetic.animatedImage(GIF);
    await wf.kinetic.ready();
    const c = canvas(40, 40);
    const x = c.getContext('2d');
    x.setTransform(0.25, 0, 0, 0.25, 30, 30);
    gif.draw(c, 0.45);
    expect([shown(c, 1, 1), shown(c, 38, 38), shown(c, 20, 20)]).toEqual([2, 2, 2]);
    const m = x.getTransform();
    expect([m.a, m.d, m.e, m.f]).toEqual([0.25, 0.25, 30, 30]);
  });

  it('draw() paints the frame for t over the whole canvas, at any size, by the same durations', async () => {
    const { wf } = await stage('ai2');
    const gif = wf.kinetic.animatedImage(GIF), webp = wf.kinetic.animatedImage(WEBP);
    await wf.kinetic.ready();
    for (const [w, h] of [[7, 5], [300, 50], [64, 64]]) {
      const c = canvas(w, h);
      for (const [img, t, opts, want] of [[gif, 0.45, undefined, 2], [gif, 0.05, undefined, 0], [gif, 1.2, undefined, 1], [gif, 1.2, { loop: false }, 3],
        [webp, 0.17, undefined, 1], [webp, -1, undefined, 0], [webp, 9.6, undefined, 3]]) {
        img.draw(c, t, opts);
        const at = [[0, 0], [w - 1, h - 1], [Math.floor(w / 2), Math.floor(h / 2)], [w - 1, 0]].map(([x, y]) => shown(c, x, y));
        expect(at, w + 'x' + h + ' at ' + t).toEqual([want, want, want, want]);
      }
    }
  });

  it('the same URL twice, written two ways, is the same handle, fetched and decoded once', async () => {
    const { wf } = await stage('ai3');
    const u = GIF + '?twice';
    const a = wf.kinetic.animatedImage(u);
    const b = wf.kinetic.animatedImage(new URL(u, location.href).href);
    expect(b).toBe(a);
    await wf.kinetic.ready();
    expect(a.frames).toBe(4);
    expect(performance.getEntriesByType('resource').filter((e) => e.name.endsWith('frames.gif?twice')).length).toBe(1);
  });

  it('made after ready() was first called: 0 frames until the next ready(), which waits for its decode', async () => {
    const { wf } = await stage('ai4');
    await wf.kinetic.ready();
    const h = wf.kinetic.animatedImage(WEBP + '?late');
    expect([h.frames, h.duration, h.frameAt(0.3)]).toEqual([0, 0, 0]);
    const c = canvas(4, 4);
    h.draw(c, 0.3);
    expect(c.getContext('2d').getImageData(1, 1, 1, 1).data[3], 'nothing drawn before the decode').toBe(0);
    await wf.kinetic.ready();
    expect([h.frames, h.frameAt(0.3)]).toEqual([4, 2]);
  });

  it("check() passes with an animated image drawn in a scene's seek, which shows the frame for the scene's local time", async () => {
    const { wf } = await load();
    const name = uniqueName('sticker');
    scenesToDrop.push(name);
    const sticker = wf.kinetic.animatedImage(GIF);
    wf.kinetic.scene(name, { seek(local) { sticker.draw(this.element.querySelector('canvas'), local); } });
    const { host } = await stage('ai5', `<div data-component="${name}" data-start="0.2" data-duration="3"><canvas width="40" height="20"></canvas></div>`);
    await wf.kinetic.ready();
    const report = await wf.kinetic.check({ samples: 12 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
    const c = host.querySelector('canvas');
    await dispatchSeek(0.65).done;
    expect(shown(c, 20, 10)).toBe(2);
    await dispatchSeek(1.0).done;
    expect(shown(c, 20, 10)).toBe(3);
    await dispatchSeek(1.3).done;
    expect(shown(c, 20, 10)).toBe(1);
  });

  it('without ImageDecoder, animatedImage() is KN-100', async () => {
    const { wf } = await load();
    const had = 'ImageDecoder' in window;
    const saved = window.ImageDecoder;
    delete window.ImageDecoder;
    try {
      expect(typeof window.ImageDecoder).toBe('undefined');
      expectKN(() => wf.kinetic.animatedImage(GIF + '?none'), 'KN-100', 'animatedImage(src): ImageDecoder', /^this browser has no ImageDecoder .*plain <img>/);
    } finally {
      if (had) window.ImageDecoder = saved;
    }
  });

  it('KN-100 for a bad call, each mistake with its own where', async () => {
    const { wf } = await stage('ai6');
    const { animatedImage } = wf.kinetic;
    expectKN(() => animatedImage(5), 'KN-100', 'animatedImage(src)', /^src is the URL of a GIF, animated WebP or APNG file, not 5/);
    expectKN(() => animatedImage(''), 'KN-100', 'animatedImage(src)', /not ""$/);
    const h = animatedImage(GIF);
    await wf.kinetic.ready();
    const c = canvas(10, 10);
    expectKN(() => h.draw(document.createElement('div'), 0), 'KN-100', 'draw(canvas)', /^canvas is a <canvas> element, not a <div>/);
    expectKN(() => h.draw(c, '1'), 'KN-100', 'draw(canvas, t)', /^t is a number of seconds, not "1"/);
    expectKN(() => h.draw(c, NaN), 'KN-100', 'draw(canvas, t)', /not NaN/);
    expectKN(() => h.draw(c, 0, null), 'KN-100', 'draw(canvas, t, options)', /^options is \{ loop \}, not null/);
    expectKN(() => h.draw(c, 0, { loops: true }), 'KN-100', 'draw(canvas, t, { loops })', /^'loops' is not an option/);
    expectKN(() => h.draw(c, 0, { loop: 1 }), 'KN-100', 'draw(canvas, t, { loop })', /^loop is true .*, not 1/);
    expectKN(() => h.frameAt(Infinity), 'KN-100', 'frameAt(t)', /not Infinity/);
    expectKN(() => h.frameAt(0, { loop: 'no' }), 'KN-100', 'frameAt(t, { loop })', /not "no"/);
    const gl = canvas(10, 10);
    expect(gl.getContext('webgl2') || gl.getContext('webgl')).toBeTruthy();
    expectKN(() => h.draw(gl, 0), 'KN-100', 'draw(canvas): 2D', /needs a 2D one/);
  });
});

describe(`animatedImage() on its own page (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const ROOT = (inner = '') => `<div data-composition-id="af" data-start="0" data-duration="2" data-fps="10" data-width="40" data-height="20">${inner}</div>`;
  // Kinetic loads in <head>, so the page's script can call it at its top level.
  const page = (src) => framedPage(ROOT() + `<script>window.img = wildflower.kinetic.animatedImage(${JSON.stringify(src)});<\/script>`, cleanup, '', '');

  async function expectFailed(p, src, detail) {
    const { w, result } = p;
    expectKN(result, 'KN-181', 'the animated image ' + src, detail);
    // Printed once, with console.error, on every build.
    expect(w.__errors.filter((l) => l.startsWith('[KN-181]'))).toEqual([result.message]);
    expect(w.document.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready')).toBe('failed');
    const held = await Promise.race([w.__hf.buildReady.kinetic.then(() => 'resolved'), tick(100).then(() => 'pending')]);
    expect(held).toBe('pending');
  }

  it("made at the top level of a page's script, outside any scene, before ready(): ready() resolves with it decoded, and a scene's seek draws it", async () => {
    const p = await framedPage(ROOT(`<div data-component="st" data-start="0" data-duration="2"><canvas width="40" height="20"></canvas></div>`)
      + `<script>
        window.sticker = wildflower.kinetic.animatedImage(${JSON.stringify(WEBP + '?top')});
        wildflower.kinetic.scene('st', { seek(local) { window.sticker.draw(this.element.querySelector('canvas'), local); } });
      <\/script>`, cleanup, 'window.__at = { frames: window.sticker.frames, duration: window.sticker.duration }', '');
    expect(p.result).toBe('resolved');
    expect(p.w.__at).toEqual({ frames: 4, duration: 1 });
    await dispatchSeek(0.3, p.w).done;
    expect(shown(p.doc.querySelector('canvas'), 20, 10)).toBe(2);
    expect(p.w.__errors).toEqual([]);
  });

  it('a 404 is KN-181 with the file and the status: printed once, ready() rejects with it, readiness held', async () => {
    const src = FIX + 'no-such-file.gif';
    await expectFailed(await page(src), src, 'could not be loaded (HTTP 404)');
  });

  it('a file that does not decode is KN-181, and says it could not be decoded as the type its first bytes give', async () => {
    const src = URL.createObjectURL(new Blob(['GIF89a this is no picture'], { type: 'image/gif' }));
    await expectFailed(await page(src), src, /^could not be decoded as image\/gif \(/);
  });

  it('a file that is no image is KN-181, and names the type it was served as', async () => {
    const src = FIX + 'make-images.cjs';
    await expectFailed(await page(src), src, /^could not be decoded as \S*javascript \(.*\); animatedImage\(\) reads GIF, WebP and PNG files/);
  });

  it('a file on another origin that cannot be fetched is KN-181 with the CORS note', async () => {
    const src = 'http://127.0.0.1:9/sticker.gif';
    await expectFailed(await page(src), src, /^could not be fetched \(.*\); a file on another origin needs CORS headers/);
  });

  it('a failure after frame 0 is printed once as it happens, marks the page failed, fails check(), and the next ready() rejects with it', async () => {
    const p = await framedPage(ROOT(), cleanup, '', '');
    expect(p.result).toBe('resolved');
    const root = p.doc.querySelector('[data-composition-id]');
    expect(root.getAttribute('data-kinetic-ready')).toBe('true');
    const src = FIX + 'no-such-file.webp';
    p.kinetic.animatedImage(src);
    const r = await p.kinetic.check({ samples: 3 });
    expect([r.ok, r.ready, r.reason]).toEqual([false, 'failed', 'readiness failed']);
    expect(root.getAttribute('data-kinetic-ready')).toBe('failed');
    const err = await p.kinetic.ready().then(() => null, (e) => e);
    expectKN(err, 'KN-181', 'the animated image ' + src, 'could not be loaded (HTTP 404)');
    expect(p.w.__errors.filter((l) => l.startsWith('[KN-181]'))).toEqual([err.message]);
  });

  it('a footage clip that fails after frame 0 marks the page failed and fails check() the same way (KN-138)', async () => {
    const p = await framedPage(ROOT(), cleanup, '', '');
    expect(p.result).toBe('resolved');
    p.doc.querySelector('[data-composition-id]').insertAdjacentHTML('beforeend', `<video id="late" src="${FIX}no-such-file.webm" data-start="0" muted></video>`);
    const r = await p.kinetic.check({ samples: 3 });
    expect([r.ok, r.ready, r.reason]).toEqual([false, 'failed', 'readiness failed']);
    expect(p.w.__errors.filter((l) => l.startsWith('[KN-138]')).length).toBe(1);
  });

  it('a src that is no URL is KN-181, and readiness does not hang on it', async () => {
    const src = 'http://[bad';
    await expectFailed(await page(src), src, /^could not be fetched/);
  });

  it('a decode that fails partway (an APNG cut off in its third frame) closes the frames it had made', async () => {
    const bytes = new Uint8Array(await (await fetch(APNG)).arrayBuffer());
    const cut = URL.createObjectURL(new Blob([bytes.slice(0, Math.floor(bytes.length * 0.85))], { type: 'image/png' }));
    const count = '<script>window.__made = 0; window.__closed = 0; const make = window.createImageBitmap, close = ImageBitmap.prototype.close;'
      + ' window.createImageBitmap = (...a) => make(...a).then((b) => { window.__made++; return b; });'
      + ' ImageBitmap.prototype.close = function () { window.__closed++; return close.call(this); };<\/script>';
    const p = await framedPage(ROOT() + `<script>wildflower.kinetic.animatedImage(${JSON.stringify(cut)});<\/script>`, cleanup, '', count);
    expectKN(p.result, 'KN-181', 'the animated image ' + cut, /^could not be decoded as image\/png/);
    expect(p.w.__made).toBe(2);
    expect(p.w.__closed).toBe(2);
  });
});
