/**
 * Behaviour that until now only a development-build warning pinned, checked
 * on every build: the extension's computeds win over a scene's own of the
 * same name (KN-152), a keyframes entry wins over a computed (KN-153), a scene
 * with no timing ancestor runs on composition time (KN-112), and a data-start
 * that names nothing starts the clip at 0 (KN-113). Then the clock's fps
 * precedence, `compat` against the pinned runtime, the preview bar's Render
 * button when a render cannot start, and KN-102 for a second copy (dev).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, loadScript, mount, tick, dispatchSeek, captureWarnings, uniqueName, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ preview: false });
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__HF_EXPORT_RENDER_SEEK_CONFIG;
});

const quiet = (fn) => captureWarnings(fn);   // the dev build warns on purpose in these definitions

describe(`what the dev warnings describe, on every build (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a scene's own computed or state named like one the extension provides reads the extension's value (KN-152)", async () => {
    const { wf } = await load();
    const name = uniqueName('reserved');
    await quiet(async () => {
      wf.kinetic.scene(name, { state: { local: 'mine' }, computed: { progress() { return 'mine'; }, time() { return -1; } } });
    });
    const el = await mount(`<div data-composition-id="bd1" data-start="0" data-duration="4"><div data-component="${name}" data-start="1" data-duration="2">
      <b class="l" data-bind="local"></b><b class="p" data-bind="progress"></b><b class="t" data-bind="time"></b></div></div>`);
    cleanup.push(el);
    await dispatchSeek(2).done;
    // progress runs to 1 on the clip's last captured frame, 2 - 1/30 s in.
    expect(['l', 'p', 't'].map((k) => el.querySelector('.' + k).textContent)).toEqual(['1', String(1 / (2 - 1 / 30)), '2']);
  });

  it('a keyframes entry and a computed of the same name: the scene reads the keyframes entry (KN-153)', async () => {
    const { wf } = await load();
    const name = uniqueName('shadow');
    await quiet(async () => {
      wf.kinetic.scene(name, { keyframes: { fade: { at: [0, 2], to: [0, 1] } }, computed: { fade() { return 'computed'; } } });
    });
    const el = await mount(`<div data-composition-id="bd2" data-start="0" data-duration="4"><div data-component="${name}" data-start="0"><b data-bind="fade"></b></div></div>`);
    cleanup.push(el);
    await dispatchSeek(1).done;
    expect(el.querySelector('b').textContent).toBe('0.5');
  });

  it('a scene with no timing ancestor runs on composition time (KN-112), and a data-start naming nothing starts at 0 (KN-113)', async () => {
    const { wf } = await load();
    const loose = uniqueName('loose');
    const dangling = uniqueName('dangling');
    wf.kinetic.scene(loose, {});
    wf.kinetic.scene(dangling, {});
    let el1, el2;
    await quiet(async () => {
      el1 = await mount(`<div data-component="${loose}"><b class="l" data-bind="local"></b></div>`);
      el2 = await mount(`<div data-composition-id="bd3" data-start="0" data-duration="10"><div data-component="${dangling}" data-start="no-such-clip + 2" data-duration="4"><b class="l" data-bind="local"></b></div></div>`);
    });
    cleanup.push(el1, el2);
    await dispatchSeek(3).done;
    expect(el1.querySelector('.l').textContent).toBe('3');
    // The reference resolves to nothing, so the clip starts at 0 and the offset is dropped with it.
    expect(el2.querySelector('.l').textContent).toBe('3');
  });
});

describe(`the clock's fps (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a render's own fps beats the root's data-fps, which beats config({ fps }), which beats 30; a scene's clipFrame and fps follow", async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const name = uniqueName('fps');
    wf.kinetic.scene(name, {});
    const el = await mount(`<div data-composition-id="bd4" data-start="0" data-duration="4"><div data-component="${name}" data-start="0"><b data-bind="clipFrame"></b><i data-bind="fps"></i></div></div>`);
    cleanup.push(el);
    const root = el.firstElementChild;
    const shown = () => [el.querySelector('b').textContent, el.querySelector('i').textContent];
    try {
      wf.kinetic.config({ fps: 50 });
      await dispatchSeek(2).done;
      expect([store.fps, ...shown()]).toEqual([50, '100', '50']);
      root.setAttribute('data-fps', '24');
      wf.kinetic.config({});
      await dispatchSeek(2).done;
      expect([store.fps, ...shown()]).toEqual([24, '48', '24']);
      window.__HF_EXPORT_RENDER_SEEK_CONFIG = { fps: 60 };
      wf.kinetic.config({});
      await dispatchSeek(2).done;
      expect([store.fps, store.frame, ...shown()]).toEqual([60, 120, '120', '60']);
    } finally {
      delete window.__HF_EXPORT_RENDER_SEEK_CONFIG;
      root.removeAttribute('data-fps');
      wf.kinetic.config({ fps: 30 });
    }
    expect(store.fps).toBe(30);
  });
});

describe(`compat (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('compat.hyperframes is the runtime version scripts/fetch-hyperframes.cjs pins and the suite runs against', async () => {
    const { wf } = await load();
    const src = await fetch('/scripts/fetch-hyperframes.cjs').then((r) => r.text());
    const pinned = (/const VERSION = '([^']+)'/.exec(src) || [])[1];
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
    expect(wf.kinetic.compat.hyperframes).toBe(pinned);
    expect(Object.isFrozen(wf.kinetic.compat)).toBe(true);
  });
});

describe(`the preview bar's Render button (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const bar = () => document.querySelector('[data-kinetic-preview]');
  const readout = () => bar().querySelector('span').textContent;

  async function clickRender(wf) {
    wf.kinetic.config({ preview: true });
    await tick(10);
    const errors = [];
    const orig = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    try {
      bar().querySelector('[data-action="render"]').click();
      await tick(30);
    } finally {
      console.error = orig;
    }
    return errors;
  }

  // check.test.js pins KN-200 only where the browser lacks VideoEncoder, and
  // Playwright's headless shell has it, so that test skips; this one takes
  // VideoEncoder away for its duration, as an insecure context would.
  it('with no WebCodecs, render() is KN-200, and the bar pauses the clock and says what the render lacks, with the message on the console', async () => {
    const { wf } = await load();
    const el = await mount('<div data-composition-id="bd5" data-start="0" data-duration="2" data-fps="10" data-width="64" data-height="36"></div>');
    cleanup.push(el);
    const had = 'VideoEncoder' in window;
    const saved = window.VideoEncoder;
    delete window.VideoEncoder;
    try {
      const err = await wf.kinetic.render({ download: false }).catch((e) => e);
      expect(err && err.code).toBe('KN-200');
      wf.kinetic.play();
      const errors = await clickRender(wf);
      expect(wf.getStore('kinetic').playing).toBe(false);
      expect(readout()).toBe('render failed (KN-200): serve the page over https or localhost');
      expect(bar().querySelector('[data-action="render"]').disabled).toBe(true);   // until the message clears
      expect(errors.filter((l) => l.startsWith('[KN-200]')).length).toBe(1);
    } finally {
      if (had) window.VideoEncoder = saved;
    }
  });

  it('with WebCodecs but no drawElementImage, it names the Chrome flag (KN-201)', async ({ skip }) => {
    const { wf } = await load();
    if (typeof CanvasRenderingContext2D.prototype.drawElementImage === 'function') skip();
    const el = await mount('<div data-composition-id="bd6" data-start="0" data-duration="2" data-fps="10" data-width="64" data-height="36"></div>');
    cleanup.push(el);
    const had = 'VideoEncoder' in window;
    const saved = window.VideoEncoder;
    if (!had) window.VideoEncoder = function VideoEncoder() {};   // only its presence is read before KN-201
    try {
      const errors = await clickRender(wf);
      expect(readout()).toBe('render failed (KN-201): Chrome needs HTML-in-Canvas enabled');
      expect(errors.filter((l) => l.startsWith('[KN-201]')).length).toBe(1);
    } finally {
      if (had) window.VideoEncoder = saved; else delete window.VideoEncoder;
    }
  });
});

if (BUILD === 'dev') {
  describe(`a second copy (${BUILD} extension, ${CORE_TIER} core)`, () => {
    it('loading the file again warns KN-102 and keeps the first copy (dev)', async () => {
      const { wf } = await load();
      const first = wf.kinetic;
      const lines = await captureWarnings(async () => { await loadScript(WF_FILE + '?coverage-again'); });
      expect(lines.filter((l) => l.startsWith('[KN-102]')).length).toBe(1);
      expect(window.wildflower.kinetic).toBe(first);
    });
  });
}
