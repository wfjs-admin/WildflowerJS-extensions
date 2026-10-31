/**
 * Scenes that arrive with the page: a real page load in an iframe, with the
 * framework and the built extension as script tags and the page's own script
 * registering its scenes before DOMContentLoaded. The framework then
 * initializes them through its batched page-load scanner, not through
 * wildflower.scan(), which is the path test/helpers.js mounts through and
 * the one every other file drives.
 *
 * Until a core fix on 2026-10-07 the batched scanner did not fire
 * component:afterInit for a component with no init(), so a page-load scene
 * with no init() never went live: no seek(local), no CSS catch-up, no
 * readiness wait for its waitFor. The framework's own suite pins the hook
 * itself; this file pins what Kinetic does with it, on every tier and build (wildflower._scanForComponents
 * is mangled in the min builds, so a real page is the only way to reach the
 * path there).
 *
 * Where the scripts sit decides the path. Probed in Chromium on 2026-10-07:
 * a framework loaded in <head> before the markup sees the markup through its
 * mutation observer, starts init early, and the scenes registered later go
 * through the incremental path (late registration). The batched scanner
 * creates the scenes only when the framework runs after the markup is
 * parsed: script tags at the end of <body>, or `defer` tags in <head> with
 * the scenes in a module, which is the docs sandbox's shape. The pages here
 * use those two shapes; the late-registration case is its own test.
 *
 * Each page is its own document, so a readiness failure or a runtime on one
 * page does not reach the others or this test page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, expectKNText, CORE, WF_FILE, RUNTIME_FILE, BUILD, CORE_TIER } from './helpers.js';

const ONE_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Every console.warn and console.error the page writes, from its first script on.
const CAPTURE = '<script>window.__lines = []; for (const k of ["warn", "error"]) { console[k] = function (...a) { window.__lines.push(a.map(String).join(" ")); }; }</script>';

const frames = [];
afterEach(() => { for (const f of frames.splice(0)) f.remove(); });

// Opens a page and resolves on its load event. By default the markup comes
// first and the scripts follow it at the end of <body>: the framework, then
// Kinetic (with `extAttrs` on its tag), then the runtime when asked for, then
// the page's own script. With `defer`, the framework and Kinetic are deferred
// tags in <head> and the page's script is a module, as in the docs sandbox.
// `head` goes into <head> before any of them.
async function openPage(markup, { script = '', extAttrs = '', runtime = false, defer = false, head = '' } = {}) {
  await load();
  const tags = (d) => '<script' + d + ' src="' + CORE + '"></script>'
    + '<script' + d + ' src="' + WF_FILE + '"' + extAttrs + '></script>'
    + (runtime ? '<script' + d + ' src="' + RUNTIME_FILE + '"></script>' : '');
  const own = script ? (defer ? '<script type="module">' : '<script>') + script + '</script>' : '';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'display: block; width: 480px; height: 300px; border: 0';
  frame.srcdoc = '<!DOCTYPE html><html><head><meta charset="utf-8">' + CAPTURE + head + (defer ? tags(' defer') : '') + '</head><body>'
    + markup + (defer ? '' : tags('')) + own + '</body></html>';
  const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }));
  document.body.appendChild(frame);
  frames.push(frame);
  await loaded;
  return frame.contentWindow;
}

// A page at a data: URL, so it can carry a search (a srcdoc page cannot take
// one, even through history.replaceState). Its origin is opaque, so it posts
// what it found back: its search, whether the bar is mounted, and the
// preview setting. Scripts load from this server by absolute URL.
async function probeDataPage(markup, search, headScript = '') {
  await load();
  const html = '<!DOCTYPE html><html><head><meta charset="utf-8">' + (headScript ? '<script>' + headScript + '</script>' : '') + '</head><body>' + markup
    + '<script src="' + location.origin + CORE + '"></script><script src="' + location.origin + WF_FILE + '"></script>'
    + '<script>addEventListener("load", () => setTimeout(() => parent.postMessage({ kineticProbe: { search: location.search,'
    + ' bar: !!document.querySelector("[data-kinetic-preview]"), preview: wildflower.kinetic.config().preview } }, "*"), 150));</script></body></html>';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'display: block; width: 480px; height: 300px; border: 0';
  const message = new Promise((resolve) => {
    const on = (e) => { if (e.source === frame.contentWindow && e.data && e.data.kineticProbe) { removeEventListener('message', on); resolve(e.data.kineticProbe); } };
    addEventListener('message', on);
  });
  frame.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html) + search;
  document.body.appendChild(frame);
  frames.push(frame);
  return Promise.race([message, tick(8000).then(() => { throw new Error('the data: page never reported back'); })]);
}

// Polls fn until it returns something truthy, or fails with `what`.
async function until(fn, what, ms = 3000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for ' + what);
    await tick(10);
  }
}

// A synthetic hf-seek on the page, in the runtime's shape.
function seekIn(win, time) {
  const pending = [];
  win.dispatchEvent(new win.CustomEvent('hf-seek', { detail: { time, waitUntil(p) { pending.push(p); } } }));
  return Promise.all(pending);
}

const state = (p, ms = 60) => Promise.race([p.then(() => 'resolved', () => 'rejected'), tick(ms).then(() => 'pending')]);
const kn = (win) => win.__lines.filter((l) => /\[KN-/.test(l));

const KEYFRAMES = '<style>@keyframes pl-fade { from { opacity: 0 } to { opacity: 1 } }</style>';
const BARE_PAGE = `${KEYFRAMES}
  <div id="root" data-composition-id="pl1" data-no-timeline data-start="0" data-duration="4">
    <div data-component="pl-bare" data-start="1" data-duration="2"><b class="l" data-bind="local"></b><i class="a" style="animation: pl-fade 10s linear"></i><img src="${ONE_PX}"></div>
    <div data-component="pl-init" data-start="0"><b class="l" data-bind="local"></b></div>
  </div>`;
const BARE_SCRIPT = `
  window.seen = { bare: [], order: [] };
  wildflower.kinetic.config({ autoplay: false });
  wildflower.kinetic.scene('pl-bare', { seek(local) { seen.bare.push(local); } });
  wildflower.kinetic.scene('pl-init', { init() { seen.order.push('init'); }, seek(local) { seen.order.push('seek ' + local); } });`;

// The scene with no init() is live: seek(local) at init and on a seek, and
// the CSS catch-up, which looks only under live scenes, positions its
// animation, silently: with no runtime every running animation is adopted.
async function expectBareSceneLive(win) {
  await until(() => win.seen && win.seen.bare.length && win.seen.order.length, 'the init seeks');
  // Before its clip, local holds at 0.
  expect(win.seen.bare).toEqual([0]);
  // init() runs before the first seek(local), so a pool filled in init() is there to write.
  expect(win.seen.order).toEqual(['init', 'seek 0']);
  await seekIn(win, 2);
  expect(win.seen.bare).toEqual([0, 1]);
  expect(win.seen.order).toEqual(['init', 'seek 0', 'seek 2']);
  const doc = win.document;
  expect([...doc.querySelectorAll('.l')].map((b) => b.textContent)).toEqual(['1', '2']);
  const anim = doc.querySelector('.a').getAnimations()[0];
  expect([anim.playState, anim.currentTime]).toEqual(['paused', 1000]);
  expect(await state(win.__hf.buildReady.kinetic, 2000)).toBe('resolved');
  await until(() => doc.getElementById('root').getAttribute('data-kinetic-ready'), 'the ready mark');
  expect(doc.getElementById('root').getAttribute('data-kinetic-ready')).toBe('true');
  expect(kn(win)).toEqual([]);
}

describe(`scenes at page load (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a scene with no init() goes live, with the scripts at the end of <body>', async () => {
    await expectBareSceneLive(await openPage(BARE_PAGE, { script: BARE_SCRIPT }));
  });

  it("a scene with no init() goes live, with deferred scripts and the scenes in a module (the docs sandbox's shape)", async () => {
    await expectBareSceneLive(await openPage(BARE_PAGE, { script: BARE_SCRIPT, defer: true }));
  });

  it('a scene registered after the page-load scan, from a later script, goes live too', async () => {
    const win = await openPage(`
      <div data-composition-id="pl2" data-no-timeline data-start="0" data-duration="4">
        <div data-component="pl-late" data-start="1"><b class="l" data-bind="local"></b></div>
      </div>`, { script: `
        window.seen = [];
        wildflower.kinetic.config({ autoplay: false });
        addEventListener('load', () => setTimeout(() => {
          wildflower.kinetic.scene('pl-late', { seek(local) { seen.push(local); } });
        }, 50));` });
    await until(() => win.seen.length, "the late scene's init seek");
    expect(win.seen).toEqual([0]);
    await seekIn(win, 3);
    expect(win.seen).toEqual([0, 2]);
    expect(win.document.querySelector('.l').textContent).toBe('2');
  });

  it('with no runtime, the clock plays and loops from load, hides the clips outside their window, and data-preview on the script tag mounts the bar', async () => {
    const win = await openPage(`
      <div id="root" data-composition-id="pl3" data-no-timeline data-start="0" data-duration="0.4">
        <div id="a" data-start="0" data-duration="0.2"></div>
        <div id="b" data-start="0.2" data-duration="0.2"></div>
      </div>`, { extAttrs: ' data-preview' });
    const store = await until(() => win.wildflower && win.wildflower.getStore('kinetic'), 'the store');
    await until(() => store.playing && store.time > 0, 'the clock to play');
    // Long enough to pass the end once: the time wraps instead of running on.
    await tick(600);
    const t = store.time;
    const vis = (id) => win.document.getElementById(id).style.visibility;
    // Read in the same task as the time, so no frame comes between them.
    const shown = [vis('a'), vis('b')];
    expect(store.playing).toBe(true);
    expect(t).toBeLessThan(0.4);
    expect(shown).toEqual(t < 0.2 ? ['visible', 'hidden'] : ['hidden', 'visible']);
    const bar = win.document.querySelector('[data-kinetic-preview]');
    expect(bar).toBeTruthy();
    expect(win.document.getElementById('root').contains(bar)).toBe(false);
    expect(win.wildflower.kinetic.config().preview).toBe(true);
    await until(() => win.document.getElementById('root').getAttribute('data-kinetic-ready') === 'true', 'the ready mark');
  });

  it('?preview in the URL mounts the bar at load, alone or among other parameters; a look-alike parameter does not, and ?kinetic does not', async () => {
    const ROOT = '<div data-composition-id="pl8" data-no-timeline data-start="0" data-duration="1"></div>';
    expect(await probeDataPage(ROOT, '?preview')).toEqual({ search: '?preview', bar: true, preview: true });
    expect(await probeDataPage(ROOT, '?x=1&preview=1')).toEqual({ search: '?x=1&preview=1', bar: true, preview: true });
    expect(await probeDataPage(ROOT, '?previews')).toEqual({ search: '?previews', bar: false, preview: false });
    expect(await probeDataPage(ROOT, '?kinetic')).toEqual({ search: '?kinetic', bar: false, preview: false });
  });

  it('a page loaded in render capture mode gets no bar, though its script tag asks for one', async () => {
    const win = await openPage('<div id="root" data-composition-id="pl9" data-no-timeline data-start="0" data-duration="1"></div>', {
      extAttrs: ' data-preview',
      script: '',
      // Set before any script runs, as HyperFrames' capture does.
      head: '<script>window.__HF_RENDER_CAPTURE_MODE = true;</script>',
    });
    await until(() => win.document.getElementById('root').getAttribute('data-kinetic-ready'), 'the ready mark');
    await tick(50);
    expect(win.document.querySelector('[data-kinetic-preview]')).toBe(null);
  });

  it("config({ autoplay: false }) from the page's script keeps the clock at 0 through load", async () => {
    const win = await openPage('<div data-composition-id="pl4" data-no-timeline data-start="0" data-duration="2"></div>',
      { script: 'wildflower.kinetic.config({ autoplay: false });' });
    const store = await until(() => win.wildflower.getStore('kinetic'), 'the store');
    await until(() => win.document.querySelector('[data-kinetic-ready]'), 'the ready mark');
    await tick(150);
    expect([store.playing, store.time, store.duration]).toEqual([false, 0, 2]);
    expect(win.wildflower.kinetic.config().autoplay).toBe(false);
  });

  it('a page-load scene with no init() that names a query in waitFor holds readiness until the query loads', async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const win = await openPage(`
      <div id="root" data-composition-id="pl5" data-no-timeline data-start="0" data-duration="2">
        <div data-component="pl-data"><b class="n" data-bind="n"></b></div>
      </div>`, { script: `
        window.release = null;
        wildflower.kinetic.config({ autoplay: false });
        wildflower.query('pl-rows', { from: () => new Promise((r) => { window.release = () => r([{ id: 1 }, { id: 2 }, { id: 3 }]); }) });
        wildflower.kinetic.scene('pl-data', { waitFor: ['pl-rows'], computed: { n() { return wildflower.getQuery('pl-rows').rows.length; } } });` });
    const entry = win.__hf.buildReady.kinetic;
    await until(() => win.release, 'the query to start');
    expect(await state(entry, 300)).toBe('pending');
    expect(win.document.getElementById('root').hasAttribute('data-kinetic-ready')).toBe(false);
    win.release();
    expect(await state(entry, 2000)).toBe('resolved');
    await until(() => win.document.getElementById('root').getAttribute('data-kinetic-ready') === 'true', 'the ready mark');
    expect(win.document.querySelector('.n').textContent).toBe('3');
  });

  it('a page-load scene with no init() whose inputs fail, read by no binding, holds readiness: KN-130 on the console and the root marked failed', async () => {
    const win = await openPage(`
      <div id="root" data-composition-id="pl10" data-no-timeline data-start="0" data-duration="2">
        <div data-component="pl-inputs"><b>static</b></div>
      </div>`, { script: `
        wildflower.kinetic.config({ autoplay: false });
        wildflower.kinetic.scene('pl-inputs', { inputs: { price: { type: Number, required: true } } });` });
    await until(() => win.document.getElementById('root').getAttribute('data-kinetic-ready'), 'the ready mark');
    expect(win.document.getElementById('root').getAttribute('data-kinetic-ready')).toBe('failed');
    const lines = win.__lines.filter((l) => l.startsWith('[KN-130]'));
    expect(lines.length, lines.join('\n')).toBe(1);
    expectKNText({ code: 'KN-130', message: lines[0] }, "[KN-130] scene 'pl-inputs' input 'price': is required and the composition has no variable 'price'");
    if (BUILD === 'dev') expect(lines[0]).toBe("[KN-130] scene 'pl-inputs' input 'price': is required and the composition has no variable 'price'");
    expect(await state(win.__hf.buildReady.kinetic, 300)).toBe('pending');
  });

  if (BUILD === 'dev') {
    it('warns KN-110 at load for a page with no composition root, and for a root with no data-duration (dev)', async () => {
      const none = await openPage('<p>no root</p>');
      await until(() => none.__lines.some((l) => l.startsWith('[KN-110]')), 'KN-110 (no root)');
      expect(none.__lines.find((l) => l.startsWith('[KN-110]'))).toMatch(/no composition root was found/);
      const bare = await openPage('<div data-composition-id="pl6" data-start="0"></div>');
      await until(() => bare.__lines.some((l) => l.startsWith('[KN-110]')), 'KN-110 (no duration)');
      expect(bare.__lines.find((l) => l.startsWith('[KN-110]'))).toMatch(/has no data-duration/);
      // A root that has both is not warned about.
      const good = await openPage('<div data-composition-id="pl7" data-no-timeline data-start="0" data-duration="2"></div>');
      await until(() => good.document.querySelector('[data-kinetic-ready]'), 'the ready mark');
      await tick(50);
      expect(good.__lines.filter((l) => l.startsWith('[KN-11'))).toEqual([]);
    });
  }
});

describe(`scenes at page load with the HyperFrames runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("the runtime's seeks reach a page-load scene with no init(), and a promise from its seek(local) holds the runtime's own barrier", async () => {
    const win = await openPage(`
      <div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="4" data-fps="25" data-width="320" data-height="180">
        <div data-component="pl-rt" data-start="1" data-duration="2"><b class="l" data-bind="local"></b><i class="c"></i></div>
      </div>`, { runtime: true, script: `
        window.seen = [];
        window.hold = null;
        wildflower.kinetic.scene('pl-rt', {
          seek(local) {
            seen.push(local);
            if (local === 1.6) return new Promise((r) => { window.hold = () => { this.element.querySelector('.c').textContent = 'drawn'; r(); }; });
          },
        });` });
    const player = await until(() => win.__player, "the runtime's player", 10000);
    await until(() => win.__renderReady === true, '__renderReady', 10000);
    await until(() => win.document.getElementById('root').getAttribute('data-kinetic-ready') === 'true', 'the ready mark');
    await until(() => win.seen.length, 'the init seek');
    // Kinetic loaded before the runtime, so the player seeks on the root's
    // 1/25 s (clock.js), and 2.6 s is one of its frames.
    player.renderSeek(2.6);
    const done = win.__hfWaitForSeekCompletion();
    expect(await state(done, 200)).toBe('pending');
    expect(win.document.querySelector('.l').textContent).toBe('1.6');
    win.hold();
    expect(await state(done, 2000)).toBe('resolved');
    expect(win.document.querySelector('.c').textContent).toBe('drawn');
    expect(win.wildflower.getStore('kinetic').frame).toBe(65);   // 2.6 s at the root's 25 fps
  });

  it("the runtime waits for a page-load scene's waitFor query before it publishes __renderReady", async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const win = await openPage(`
      <div id="root" data-composition-id="main" data-no-timeline data-start="0" data-duration="2" data-width="320" data-height="180">
        <div data-component="pl-rtq"><b class="n" data-bind="n"></b></div>
      </div>`, { runtime: true, script: `
        window.release = null;
        wildflower.query('pl-rt-rows', { from: () => new Promise((r) => { window.release = () => r([{ id: 1 }, { id: 2 }]); }) });
        wildflower.kinetic.scene('pl-rtq', { waitFor: ['pl-rt-rows'], computed: { n() { return wildflower.getQuery('pl-rt-rows').rows.length; } } });` });
    await until(() => win.__player && win.release, 'the player and the query', 10000);
    await tick(300);
    expect(win.__renderReady === true).toBe(false);
    expect(win.document.getElementById('root').hasAttribute('data-kinetic-ready')).toBe(false);
    win.release();
    await until(() => win.__renderReady === true, '__renderReady after the rows', 10000);
    await until(() => win.document.getElementById('root').getAttribute('data-kinetic-ready') === 'true', 'the ready mark');
    expect(win.document.querySelector('.n').textContent).toBe('2');
  });

  if (BUILD === 'dev') {
    it('warns KN-111 when the runtime is on the page and the root has no data-no-timeline (dev)', async () => {
      const win = await openPage('<div data-composition-id="main" data-start="0" data-duration="2" data-width="320" data-height="180"></div>', { runtime: true });
      await until(() => win.__lines.some((l) => l.startsWith('[KN-111]')), 'KN-111', 10000);
      expect(win.__lines.filter((l) => l.startsWith('[KN-11')).length).toBe(1);
    });
  }
});
