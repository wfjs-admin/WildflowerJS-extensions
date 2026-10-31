/**
 * render() with Lottie and animated images, in the installed Chrome with
 * HTML-in-Canvas (vitest.render.config.js). One scene, laid out as a flex
 * row, holds the Lottie square (fixtures/square.json: a red square whose
 * centre is at x 10 + 4f at frame f, 10 fps, 20 frames) under the svg
 * renderer and under the canvas renderer, the second from 0.5 s, and a
 * 40 x 20 canvas shown at 100 x 100 that its seek(local) draws frames.gif
 * into (each frame one colour: 0 red, 1 green, 2 blue, 3 yellow; 100, 300,
 * 200 and 400 ms). Each frame of the file has the squares where the
 * animation puts them at the frame's time and the image's frame for it. A
 * Lottie animation or an animated image that fails rejects render() with
 * KN-180 or KN-181 before the page is touched.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, loadScript, mount, uniqueName, framedPage, expectKN, LOTTIE_FILE, BUILD, CORE_TIER } from './helpers.js';

const FIX = '/packages/kinetic/test/fixtures/';
const cleanup = [];
const stops = [];
let DATA = null;
beforeAll(async () => {
  await load();
  await loadScript(LOTTIE_FILE);
  DATA = await (await fetch(FIX + 'square.json')).json();
});
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const h of stops.splice(0)) h.dispose();
  for (const el of cleanup.splice(0)) el.remove();
});

// The file's frame at `at` seconds, as ImageData.
async function frameAt(blob, at) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  document.body.appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('video failed to load')); });
    v.currentTime = at;
    await new Promise((res) => { v.onseeked = () => res(); });
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(v, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  } finally {
    v.remove();
    URL.revokeObjectURL(url);
  }
}

// The centre of the red pixels in the columns from x0 to x1, and the frame
// number the colour at (x, y) gives.
function redCentre(img, x0, x1) {
  let n = 0, sx = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4, d = img.data;
      if (d[i] > 150 && d[i + 1] < 100 && d[i + 2] < 100) { n++; sx += x + 0.5; }
    }
  }
  return n ? sx / n : NaN;
}
function numberAt(img, x, y) {
  const i = (y * img.width + x) * 4, [r, g, b] = [img.data[i], img.data[i + 1], img.data[i + 2]];
  return r > 128 && g > 128 && b < 128 ? 3 : r > 128 && g < 128 && b < 128 ? 0 : r < 128 && g > 128 && b < 128 ? 1 : r < 128 && g < 128 && b > 128 ? 2 : -1;
}
const xAt = (f) => 10 + 4 * Math.min(f, 19);
const gifFrame = (t) => { const x = t % 1; return x < 0.1 ? 0 : x < 0.4 ? 1 : x < 0.6 ? 2 : 3; };

describe(`render() with Lottie and animated images (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("each frame of the file has the svg and canvas Lottie squares and the animated image's frame for its time", async () => {
    const { wf } = await load();
    const name = uniqueName('lrender');
    const sticker = wf.kinetic.animatedImage(FIX + 'frames.gif');
    wf.kinetic.scene(name, {
      init() {
        const make = (cls, renderer) => window.lottie.loadAnimation({ container: this.element.querySelector(cls), renderer, loop: false, autoplay: false, animationData: structuredClone(DATA) });
        stops.push(wf.kinetic.lottie(make('.s', 'svg'), { scene: this }), wf.kinetic.lottie(make('.c', 'canvas'), { scene: this, start: 0.5 }));
      },
      seek(local) { sticker.draw(this.element.querySelector('canvas.img'), local); },
    });
    const host = await mount(`<div data-composition-id="lrn" data-start="0" data-duration="2.5" data-fps="10" data-width="300" data-height="100" style="position:relative;width:300px;height:100px;background:#fff">
      <div data-component="${name}" data-start="0" style="position:absolute;inset:0;display:flex">
        <div class="s" style="width:100px;height:100px"></div><div class="c" style="width:100px;height:100px"></div>
        <canvas class="img" width="40" height="20" style="width:100px;height:100px"></canvas>
      </div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const r = await wf.kinetic.render({ download: false, bitrate: 4e6 });
    expect(r.frames).toBe(25);
    for (const t of [0.3, 0.7, 1.2, 1.8, 2.3]) {
      const img = await frameAt(r.blob, t + 0.02);
      const f = Math.round(t * 10);
      expect(Math.abs(redCentre(img, 0, 100) - xAt(f)), 'svg at ' + t).toBeLessThan(2);
      expect(Math.abs(redCentre(img, 100, 200) - 100 - xAt(Math.max(0, f - 5))), 'canvas at ' + t).toBeLessThan(2);
      // The image fills its 100 x 100 box: its middle and two corners.
      for (const [x, y] of [[250, 50], [203, 3], [296, 96]]) expect(numberAt(img, x, y), 'image at ' + t + ', ' + x + ',' + y).toBe(gifFrame(f / 10));
    }
  });

  it('an animated image that fails: render() rejects with KN-181 before the page is touched', async () => {
    const src = FIX + 'no-such-file.gif';
    const page = await framedPage(`<div data-composition-id="lrf" data-start="0" data-duration="1" data-fps="10" data-width="40" data-height="20"></div>
      <script>wildflower.kinetic.animatedImage(${JSON.stringify(src)});<\/script>`, cleanup, '', '');
    const err = await page.kinetic.render({ download: false }).catch((e) => e);
    expectKN(err, 'KN-181', 'the animated image ' + src, 'could not be loaded (HTTP 404)');
    expect(page.doc.querySelector('[data-kinetic-render]')).toBeNull();
  });

  it('a Lottie animation that fails: render() rejects with KN-180 before the page is touched', async () => {
    const page = await framedPage(`<div data-composition-id="lrl" data-start="0" data-duration="1" data-fps="10" data-width="100" data-height="100"><div id="holder" style="width:100px;height:100px"></div></div>
      <script>wildflower.kinetic.lottie(lottie.loadAnimation({ container: document.getElementById('holder'), renderer: 'svg', autoplay: false, path: '${FIX}no-such-file.json' }));<\/script>`,
    cleanup, '', '<script src="' + LOTTIE_FILE + '"><\/script>');
    const err = await page.kinetic.render({ download: false }).catch((e) => e);
    expectKN(err, 'KN-180', 'the Lottie animation (' + FIX + 'no-such-file.json)', /data_failed/);
    expect(page.doc.querySelector('[data-kinetic-render]')).toBeNull();
  });
});
