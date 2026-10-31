/**
 * An audio clip whose file fails to load or decode is KN-135: a console
 * error on every build, ready() rejects with it, the entry registered for
 * the runtime is held open, and the root still gets data-kinetic-ready so
 * the page shows. A page keeps its first failure, so each case loads its
 * own page in a frame. The message gives the clip and its file, and in the
 * development build the cause; a file on another origin that cannot be
 * fetched gets the CORS note there.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { tick, wavUrl, expectKN, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

// A page with one audio clip, loading `src`, that calls ready() once loaded.
async function framed(src) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:200px;border:0;opacity:0;pointer-events:none';
  frame.srcdoc = '<!doctype html><html><body>'
    + '<div data-composition-id="ar" data-start="0" data-duration="2" data-fps="30"><audio id="music" src="' + src + '" data-start="0"></audio></div>'
    + '<script>window.__errors = []; const e = console.error; console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); };<\/script>'
    + '<script src="' + CORE + '"><\/script>'
    + '<script src="' + WF_FILE + '"><\/script>'
    + '<script>wildflower.kinetic.config({ autoplay: false }); window.__ready = wildflower.kinetic.ready().then(() => "resolved", (e) => e);<\/script>'
    + '</body></html>';
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  const result = await Promise.race([w.__ready, tick(10000).then(() => 'timed out')]);
  const held = await Promise.race([w.__hf.buildReady.kinetic.then(() => 'resolved'), tick(100).then(() => 'pending')]);
  return { w, result, held, root: w.document.querySelector('[data-composition-id]') };
}

// The clip and its file are the where on every build; `re` matches the
// development build's sentence.
function expectKN135(page, src, re) {
  const { w, result, held, root } = page;
  expectKN(result, 'KN-135', 'the audio clip audio#music (' + src + ')', re);
  // Printed once, with console.error, on every build.
  expect(w.__errors.filter((l) => l.startsWith('[KN-135]'))).toEqual([result.message]);
  // The page shows, and the runtime's render is held at its timeout.
  expect(root.getAttribute('data-kinetic-ready')).toBe('failed');
  expect(held).toBe('pending');
}

describe(`an audio clip that fails (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a 404 is KN-135 with the status, ready() rejects with it, and readiness is held', async () => {
    expectKN135(await framed('/packages/kinetic/test/no-such-file.wav'), '/packages/kinetic/test/no-such-file.wav', /404/);
  });

  it('a file that does not decode is KN-135, and says it could not be decoded', async () => {
    const bad = URL.createObjectURL(new Blob(['this is not audio'], { type: 'audio/wav' }));
    expectKN135(await framed(bad), bad, /decode/);
  });

  it('a file on another origin that cannot be fetched is KN-135 with the CORS note', async () => {
    expectKN135(await framed('http://127.0.0.1:9/music.wav'), 'http://127.0.0.1:9/music.wav', /CORS/);
  });

  it('a file that loads and decodes leaves readiness to settle', async () => {
    const page = await framed(wavUrl(new Float32Array(4800)));
    expect(page.result).toBe('resolved');
    expect(page.held).toBe('resolved');
    expect(page.root.getAttribute('data-kinetic-ready')).toBe('true');
    expect(page.w.__errors.filter((l) => l.startsWith('[KN'))).toEqual([]);
  });
});
