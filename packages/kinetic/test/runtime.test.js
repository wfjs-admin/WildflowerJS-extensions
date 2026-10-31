/**
 * Against the real HyperFrames runtime (the pinned IIFE in tools/hyperframes,
 * fetched by scripts/fetch-hyperframes.cjs): the runtime's own seeks reach
 * the store through hf-seek, the barrier the engine awaits sees the DOM of
 * that frame, the root's data-fps and data-duration are read, and
 * wildflower.kinetic.seek() drives the runtime's player. The player floors a
 * seek to its own grid of frames, so render() does not apply a shutter with
 * the runtime on the page (KN-205 in development): the streak at 180 degrees
 * and the cut at 360, in the render suite, which includes this file too.
 * The grid is 1 / the fps the runtime read as it started: the root's data-fps
 * when Kinetic loaded first, else 30, and render() throws KN-206 at a rate
 * the grid misses (the frame grid tests at the end).
 *
 * Loads in page order, runtime first, so it has its own loader and the root
 * is in the document before the runtime looks for it. The runtime starts
 * before Kinetic loads here, so this page's grid is 1/30 s.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadScript, tick, framedPage, sinePage, expectKN, CORE, WF_FILE, RUNTIME_FILE, BUILD, CORE_TIER, SITE_SINE_SCRIPT, siteHas } from './helpers.js';

const HAS_SINE = await siteHas(SITE_SINE_SCRIPT);

const SCENE = 'rt-scene';
let wf, host, available = true;

beforeAll(async () => {
  host = document.createElement('div');
  host.innerHTML = `<div id="stage" data-composition-id="main" data-no-timeline data-start="0" data-duration="4" data-fps="25" data-width="640" data-height="360">
    <div data-component="${SCENE}" data-start="1" data-duration="2">
      <b class="t" data-bind="$kinetic.time"></b><b class="l" data-bind="local"></b><b class="p" data-bind="progress"></b>
      <ol data-list="bars" data-key="key"><template><li data-bind-style="style"></li></template></ol>
    </div>
  </div>`;
  document.body.appendChild(host);
  try { await loadScript(RUNTIME_FILE); } catch (_) { available = false; return; }
  await loadScript(CORE);
  await loadScript(WF_FILE);
  wf = window.wildflower;
  wf.kinetic.scene(SCENE, {
    computed: {
      bars() { return [0, 1].map((i) => ({ key: i, style: { opacity: String(Math.max(0, Math.min(1, this.local - i * 0.5))) } })); },
    },
  });
  wf.scan(host);
  for (let i = 0; i < 600 && !window.__player; i++) await tick(16);
  await tick(0);
}, 20000);

const seekAndWait = async (t) => { window.__player.renderSeek(t); await window.__hfWaitForSeekCompletion(); };
// The rows only where the tier has data-list (not nano, mini-pool).
const hasLists = () => !(wf.features && wf.features.lists === false);
const snap = () => ({
  t: host.querySelector('.t').textContent, l: host.querySelector('.l').textContent, p: host.querySelector('.p').textContent,
  bars: hasLists() ? [...host.querySelectorAll('li')].map((li) => li.style.opacity).join(' ') : '-',
});

describe(`HyperFrames runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the runtime is on the page (fetch it with node scripts/fetch-hyperframes.cjs if this fails)', () => {
    expect(available).toBe(true);
    expect(window.__player).toBeTruthy();
  });

  it('reads fps and duration from the root', () => {
    const store = wf.getStore('kinetic');
    expect(store.fps).toBe(25);
    expect(store.duration).toBe(4);
    expect(store.playing).toBe(false);
  });

  it("the runtime's seeks reach the scene, and the DOM holds the frame when the barrier resolves", async () => {
    // progress runs to 1 on the clip's last captured frame, 2 - 1/25 s in.
    const last = 2 - 1 / 25;
    await seekAndWait(1.5);
    expect(snap()).toEqual({ t: '1.5', l: '0.5', p: String((1.5 - 1) / last), bars: hasLists() ? '0.5 0' : '-' });
    await seekAndWait(2.4);
    expect(snap()).toEqual({ t: '2.4', l: '1.4', p: String((2.4 - 1) / last), bars: hasLists() ? '1 0.9' : '-' });
    expect(wf.getStore('kinetic').frame).toBe(60);
  });

  it('shuffled seeks give the same frames', async () => {
    const a = {}; for (const t of [0.5, 2.2, 1.2]) { await seekAndWait(t); a[t] = snap(); }
    const b = {}; for (const t of [1.2, 0.5, 2.2]) { await seekAndWait(t); b[t] = snap(); }
    expect(b).toEqual(a);
  });

  // Observed in the pinned runtime: renderSeek(t) floors t to a grid of
  // 1/30 s on this page, where the runtime started before Kinetic loaded,
  // whatever the root's data-fps (25 here), and the hf-seek carries the
  // floored time. A render's shutter samples go through renderSeek, so this
  // is what they get (the shutter tests below).
  it("the runtime's player floors a seek to its 1/30 s grid, whatever data-fps says, and the store follows it", async () => {
    const heard = [];
    const on = (e) => heard.push(e.detail.time);
    window.addEventListener('hf-seek', on);
    const got = [];
    try {
      for (const t of [1.0125, 1.03, 2.99, 0.12, 0.16, 1 / 60, 0.3 + 0.5 / 30 * 7 / 8]) {
        await seekAndWait(t);
        got.push([wf.getStore('kinetic').time, heard[heard.length - 1]].map((v) => Math.round(v * 3000) / 3000));
      }
    } finally {
      window.removeEventListener('hf-seek', on);
    }
    const grid = [1, 1, 89 / 30, 0.1, 4 / 30, 0, 0.3].map((v) => Math.round(v * 3000) / 3000);
    expect(got).toEqual(grid.map((v) => [v, v]));
  });

  it("wildflower.kinetic.seek() drives the runtime's player", async () => {
    wf.kinetic.seek(1.8);
    await window.__hfWaitForSeekCompletion();
    expect(wf.getStore('kinetic').time).toBe(1.8);
    expect(Number(window.__player.getTime().toFixed(3))).toBe(1.8);
  });
});

// ---- render({ shutter }) with the runtime on the page --------------------------
//
// render() needs WebCodecs and drawElementImage, so these run in the render
// suite (vitest.render.config.js) and are skipped in Playwright's shell. Each
// composition is a page of its own in a frame: the markup, the framework,
// Kinetic, the page's script, then the runtime, the order the docs give.

const frames = [];
afterEach(() => { for (const f of frames.splice(0)) f.remove(); });
const canRender = () => typeof VideoEncoder === 'function' && typeof CanvasRenderingContext2D.prototype.drawElementImage === 'function';

async function runtimePage(body, script) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:700px;height:300px;border:0;pointer-events:none';
  const html = '<!doctype html><html><head><base href="' + location.href + '"></head><body style="margin:0">' + body
    + '<script src="' + CORE + '"><\/script><script src="' + WF_FILE + '"><\/script>'
    + '<script>wildflower.kinetic.config({ autoplay: false });' + script + '<\/script>'
    + '<script src="' + RUNTIME_FILE + '"><\/script></body></html>';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  frame.src = url;
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  frames.push(frame);
  await loaded;
  URL.revokeObjectURL(url);
  const w = frame.contentWindow;
  for (let i = 0; i < 600 && !w.__player; i++) await tick(16);
  await w.wildflower.kinetic.ready();
  return w;
}

// The frame of a rendered file at `at` seconds, as ImageData.
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
    c.getContext('2d').drawImage(v, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height);
  } finally {
    v.remove();
    URL.revokeObjectURL(url);
  }
}

describe(`render({ shutter }) with the HyperFrames runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // The runtime's player floors every sample of frame i back to i / 30 (the
  // test above), so with the runtime on the page render() takes no samples:
  // one seek a frame, the store's shutter left at 0 (so smear() keeps its
  // copies), and in development KN-205, once per page.
  it('the shutter is not applied: one seek a frame, the store says no shutter, KN-205 once per page in development, and the edge is sharp', async ({ skip }) => {
    if (!canRender()) skip();
    const w = await runtimePage(`<div data-composition-id="rts" data-no-timeline data-start="0" data-duration="0.4" data-width="640" data-height="120" data-fps="30" style="width:640px;height:120px;position:relative;overflow:hidden;background:#000">
      <div data-component="rt-square" data-start="0" data-duration="0.4" style="position:absolute;inset:0"><div data-bind-style="move" style="position:absolute;left:0;top:10px;width:100px;height:100px;background:#fff"></div></div>
    </div>`, "wildflower.kinetic.scene('rt-square', { computed: { move() { return wildflower.kinetic.styleAt(this.local, { translateX: { at: [0, 1], to: [-100, 1100] } }); } }, seek() { if (window.__times) window.__times.push(this.time); } });");
    const k = w.wildflower.kinetic, store = w.wildflower.getStore('kinetic');
    // The player's seeks, and the page's KN lines.
    let seeks = 0;
    const renderSeek = w.__player.renderSeek;
    w.__player.renderSeek = function (...a) { seeks++; return renderSeek.apply(this, a); };
    const lines = [];
    const warn = w.console.warn;
    w.console.warn = (...a) => { lines.push(a.map(String).join(' ')); };
    const during = new Set();
    let r;
    try {
      w.__times = [];
      r = await k.render({ download: false, shutter: 180, onProgress: () => during.add(store.shutter) });
    } finally {
      w.console.warn = warn;
    }
    const times = w.__times;
    w.__times = null;
    expect(r.frames).toBe(12);
    // Twelve frames and the seek back to where the clock was: no samples.
    expect(seeks).toBe(13);
    expect([...during]).toEqual([0]);
    expect(store.shutter).toBe(0);
    // The warning's own line (a development core adds a Docs line naming the code too).
    const kn = lines.filter((l) => l.startsWith('[KN-205]'));
    if (BUILD === 'dev') {
      expect(kn.length, lines.join(' || ')).toBe(1);
      expect(kn[0]).toContain('the shutter is not applied');
      expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/Suggestion: .*runtime/);
    } else {
      expect(kn).toEqual([]);
    }
    // A second render on the same page says nothing more.
    const again = [];
    w.console.warn = (...a) => { again.push(a.map(String).join(' ')); };
    try {
      await k.render({ download: false, shutter: { angle: 360 } });
    } finally {
      w.console.warn = warn;
      w.__player.renderSeek = renderSeek;
    }
    expect(again.filter((l) => l.includes('KN-205'))).toEqual([]);
    // The times the scene was seeked to: the twelve frames' own.
    const distinct = [...new Set(times.map((t) => Math.round(t * 3000)))].sort((a, b) => a - b).map((t) => t / 3000);
    expect(distinct).toEqual(Array.from({ length: 12 }, (_, i) => Math.round(i / 30 * 3000) / 3000));
    expect(times.length).toBe(12);
    // The leading edge at 0.3 s, x = 360: black to white within 2 px.
    const img = await frameAt(r.blob, 0.31);
    const v = (x) => img.data[(60 * img.width + x) * 4];
    let top = -1, bottom = -1;
    for (let x = 300; x < img.width; x++) {
      if (top < 0 && v(x) < 240) top = x;
      if (top >= 0 && v(x) <= 15) { bottom = x; break; }
    }
    expect(Math.abs(top - 360), 'top ' + top).toBeLessThanOrEqual(2);
    expect(bottom - top, 'edge ' + top + ' to ' + bottom).toBeLessThanOrEqual(2);
  });

  it('the cut at 360 degrees: the shutter is not applied, and the red clip and the blue one never share a frame', async ({ skip }) => {
    if (!canRender()) skip();
    const w = await runtimePage(`<div data-composition-id="rtc" data-no-timeline data-start="0" data-duration="0.6" data-width="160" data-height="90" data-fps="30" style="width:160px;height:90px;position:relative;overflow:hidden;background:#000">
      <div style="position:absolute;inset:0;background:#ff0000" data-start="0" data-duration="0.3"></div>
      <div style="position:absolute;inset:0;background:#0000ff" data-start="0.3" data-duration="0.3"></div>
    </div>`, '');
    const k = w.wildflower.kinetic, store = w.wildflower.getStore('kinetic');
    const during = new Set();
    const r = await k.render({ download: false, bitrate: 2e6, shutter: 360, onProgress: () => during.add(store.shutter) });
    expect([...during]).toEqual([0]);
    expect(r.frames).toBe(18);
    const wrong = [];
    for (let i = 0; i < 18; i++) {
      const img = await frameAt(r.blob, (i + 0.5) / 30);
      let purple = 0;
      for (let p = 0; p < img.data.length; p += 4) if (img.data[p] > 24 && img.data[p + 2] > 24) purple++;
      const m = (45 * img.width + 80) * 4;
      const px = [img.data[m], img.data[m + 1], img.data[m + 2]];
      const want = i < 9 ? [255, 0, 0] : [0, 0, 255];
      if (purple || !px.every((c, j) => Math.abs(c - want[j]) <= 24)) wrong.push(i + ': ' + purple + ' purple, middle ' + px.join(','));
    }
    expect(wrong).toEqual([]);
  });
});

// ---- the frame grid the runtime's player seeks on -------------------------------
//
// The player puts every seek on a grid of 1 / fps, with fps read from
// window.__HF_EXPORT_RENDER_SEEK_CONFIG as the runtime starts (30 without
// one), not from the root's data-fps; the CLI sets that config before the
// page loads. Kinetic, loaded before the runtime starts, defines the config
// as the root's data-fps at the moment it is read, so the player takes the
// composition's own rate. Loaded after the runtime started (this file's own
// page), the grid stays 1/30 s, and render() throws KN-206 at a rate that
// grid does not divide.

const CFG = '__HF_EXPORT_RENDER_SEEK_CONFIG';
const STRIPES = 12;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// A page in the order a page loads them: `before` and the runtime's tag in
// <head> (no runtime with `runtime: false`, `runtimeAttrs` on the tag), then
// the framework and Kinetic (deferred with `deferKinetic`), then the root
// (`fps` as its data-fps, none when null) and the page's script. The scene
// paints the clock's time, in 1/300 s, as twelve stripes, white for a set
// bit, on every seek: 1/25 s is 12 and 1/30 s is 10, so either grid gives
// whole numbers. Resolves once the player is up.
async function stripePage(fps, duration, { before = '', runtime = true, runtimeAttrs = '', deferKinetic = false } = {}) {
  const scene = "wildflower.kinetic.scene('rt-stripes', { seek() { const n = Math.round(this.time * 300); if (window.__times) window.__times.push(this.time); this.element.querySelectorAll('i').forEach((el, i) => { el.style.background = (n >> i) & 1 ? '#fff' : '#000'; }); } });";
  const page = await framedPage(`<div id="stage" data-composition-id="grid" data-no-timeline data-start="0" data-duration="${duration}"${fps === null ? '' : ' data-fps="' + fps + '"'} data-width="240" data-height="40" style="position:relative;width:240px;height:40px;background:#000">
      <div data-component="rt-stripes" data-start="0" data-duration="${duration}" style="position:absolute;inset:0;display:flex">${'<i style="flex:1;background:#000"></i>'.repeat(STRIPES)}</div>
    </div>
    <script>${deferKinetic ? 'addEventListener("DOMContentLoaded", () => { ' + scene + ' });' : scene}<\/script>`,
  frames, '', before + (runtime ? '<script' + runtimeAttrs + ' src="' + RUNTIME_FILE + '"><\/script>' : ''), deferKinetic);
  expect(page.result).toBe('resolved');
  const w = page.w;
  for (let i = 0; i < 600 && runtime && !w.__player; i++) await tick(16);
  // A page that should have the runtime has its player, so the seeks below
  // go through it and not through Kinetic's own clock.
  if (runtime) expect(w.__player, "the runtime's player").toBeTruthy();
  return { w, k: w.wildflower.kinetic, store: w.wildflower.getStore('kinetic'), root: w.document.getElementById('stage') };
}

// The time each of the first `n` frames of a rendered file carries, in
// 1/300 s: the stripes read across the middle of each frame. One <video>
// per frame (frameAt): reusing one for this file stalled on its second
// seek, which never fired seeked.
async function stripesOf(blob, n, fps) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const img = await frameAt(blob, (i + 0.5) / fps);
    let t = 0;
    for (let j = 0; j < STRIPES; j++) if (img.data[(Math.floor(img.height / 2) * img.width + Math.floor((j + 0.5) * img.width / STRIPES)) * 4] > 128) t |= 1 << j;
    out.push(t);
  }
  return out;
}

// Seeks the page's player and resolves with where the clock landed.
async function landing(w, t) {
  w.__player.renderSeek(t);
  await w.__hfWaitForSeekCompletion();
  return r6(w.wildflower.getStore('kinetic').time);
}

describe(`the player's frame grid with Kinetic loaded in page order (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // Long enough to pass the first frame a plain floor(i / fps * fps) puts on
  // the frame before (i = 29 at 25 fps, 123 at 30 and 60 fps); the pinned
  // player lands on every one (probed 2026-10-09), and render() checks each.
  for (const [fps, n] of [[25, 62], [30, 126], [60, 126]]) {
    it(`a render at the root's ${fps} fps writes all ${n} frames at their own times, with no repeat or skip`, async ({ skip }) => {
      if (!canRender()) skip();
      const { w, k } = await stripePage(fps, n / fps);
      w.__times = [];
      const r = await k.render({ download: false });
      const times = w.__times.map(r6);
      w.__times = null;
      expect([r.frames, r.fps]).toEqual([n, fps]);
      const want = Array.from({ length: n }, (_, i) => i / fps);
      // The scene heard each frame's own time (frame 0 found the clock at 0),
      // then the seek back to 0.
      expect(times).toEqual([...want.slice(1).map(r6), 0]);
      expect(await stripesOf(r.blob, n, fps)).toEqual(want.map((t) => Math.round(t * 300)));
    });
  }

  it('a render of one frame, shorter than 1/fps, renders that frame', async ({ skip }) => {
    if (!canRender()) skip();
    const { k } = await stripePage(25, 0.03);
    const r = await k.render({ download: false });
    expect([r.frames, r.fps]).toEqual([1, 25]);
    expect(await stripesOf(r.blob, 1, 25)).toEqual([0]);
  });

  // A deferred Kinetic tag runs once the page is parsed: in time for a plain
  // runtime tag, which reads the config at DOMContentLoaded, and too late for
  // a deferred runtime tag before it, which reads it as its script runs.
  it("a deferred Kinetic tag: in time after a plain runtime tag, too late after a deferred one, and render() then throws KN-206", async ({ skip }) => {
    const plain = await stripePage(25, 1, { deferKinetic: true });
    expect(await landing(plain.w, 0.04)).toBe(0.04);
    const late = await stripePage(25, 1, { deferKinetic: true, runtimeAttrs: ' defer' });
    expect(await landing(late.w, 0.04)).toBe(r6(1 / 30));
    if (!canRender()) skip();
    let err = null;
    try { await late.k.render({ download: false }); } catch (e) { err = e; }
    expectKN(err, 'KN-206', 'render(): a seek to 0.04 s landed at 0.0333 s', /^the HyperFrames player puts each seek on one of its own frames/);
  });

  it("the config reads as the root's data-fps when it is read, the player seeks on 1/25 s, and preview playback runs with the store following", async () => {
    const { w, k, store, root } = await stripePage(25, 3);
    expect(typeof Object.getOwnPropertyDescriptor(w, CFG)?.get).toBe('function');
    expect(w[CFG]).toEqual({ fps: 25 });
    root.setAttribute('data-fps', '48');
    expect(w[CFG]).toEqual({ fps: 48 });
    root.setAttribute('data-fps', 'none');
    expect(w[CFG]).toBe(undefined);
    root.setAttribute('data-fps', '25');
    // The player took 25 as it started.
    const got = [];
    for (const t of [0.04, 0.16, 1.24]) got.push(await landing(w, t));
    expect(got).toEqual([0.04, 0.16, 1.24]);
    expect(store.fps).toBe(25);
    // Preview playback: the player plays and the store follows it.
    const from = store.time;
    k.play();
    await tick(500);
    const state = { playing: store.playing, player: w.__player.isPlaying(), advanced: store.time - from, capture: !!w.__HF_RENDER_CAPTURE_MODE };
    k.pause();
    expect(state.playing).toBe(true);
    expect(state.player).toBe(true);
    expect(state.advanced).toBeGreaterThan(0.2);
    expect(state.capture).toBe(false);
    await tick(300);
    expect(store.playing).toBe(false);
  });

  // The runtime's tag deferred, as the docs give it: its script runs once
  // the page is parsed, after Kinetic's plain tag has run, and reads the
  // config then. (Probed outside the suite: a deferred Kinetic tag after a
  // deferred runtime's runs too late, and KN-206 follows.)
  it("with the runtime's tag deferred, as the docs give it, the player seeks on the root's 1/25 s", async () => {
    const { w, store } = await stripePage(25, 1, { runtimeAttrs: ' defer' });
    const got = [];
    for (const t of [0.04, 0.16]) got.push(await landing(w, t));
    expect(got).toEqual([0.04, 0.16]);
    expect(store.fps).toBe(25);
  });

  it('with no data-fps on the root the config reads as none, and the player keeps its 1/30 s', async () => {
    const { w, store } = await stripePage(null, 1);
    expect(CFG in w).toBe(true);
    expect(w[CFG]).toBe(undefined);
    expect(await landing(w, 0.04)).toBe(r6(1 / 30));
    expect(store.fps).toBe(30);
  });

  // The runtime reads an fps from this config only, and takes any config as
  // an export render (its codec-proxy swap, cross-origin audio diagnostic,
  // frame-snapped clip windows and wait on a loading video all follow it), so
  // a preview of a root with data-fps runs the runtime's export branch, which
  // it marks with this line; the README's runtime section says so.
  it("a preview of a root with data-fps runs the runtime's export branch, and one with none does not", async () => {
    const spy = '<script>window.__infos = []; const i = console.info; console.info = (...a) => { window.__infos.push(a.join(" ")); i.apply(console, a); };<\/script>';
    const branch = (w) => w.__infos.some((l) => l.startsWith('[hyperframes] render runtime fps'));
    expect(branch((await stripePage(25, 1, { before: spy })).w)).toBe(true);
    expect(branch((await stripePage(null, 1, { before: spy })).w)).toBe(false);
  });

  it("a config the page sets before the runtime's script is left as it is, and the player and Kinetic both read it", async () => {
    const { w, store } = await stripePage(25, 1, { before: '<script>window.__mine = window.__HF_EXPORT_RENDER_SEEK_CONFIG = { fps: 50 };<\/script>' });
    expect(w[CFG]).toBe(w.__mine);
    expect(Object.getOwnPropertyDescriptor(w, CFG).value).toBe(w.__mine);
    expect(w.__mine).toEqual({ fps: 50 });
    expect(store.fps).toBe(50);
    expect(await landing(w, 0.02)).toBe(0.02);
  });

  it('a config assigned after Kinetic loaded replaces the accessor and reads back as assigned', async () => {
    const { w, k, store, root } = await stripePage(25, 1);
    expect(typeof Object.getOwnPropertyDescriptor(w, CFG)?.get).toBe('function');
    const mine = { fps: 12, other: 'kept' };
    w[CFG] = mine;
    expect(w[CFG]).toBe(mine);
    expect(Object.getOwnPropertyDescriptor(w, CFG)).toEqual({ value: mine, writable: true, enumerable: true, configurable: true });
    root.setAttribute('data-fps', '48');
    expect(w[CFG]).toBe(mine);
    k.config({});
    expect(store.fps).toBe(12);
    const again = { fps: 24 };
    w[CFG] = again;
    expect(w[CFG]).toBe(again);
  });

  it('with no runtime on the page, render() seeks the frames and the seek back only', async ({ skip }) => {
    if (!canRender()) skip();
    const { w, k } = await stripePage(25, 0.4, { runtime: false });
    w.__times = [];
    const r = await k.render({ download: false });
    const times = w.__times.map(r6);
    w.__times = null;
    expect(r.frames).toBe(10);
    expect(times).toEqual([...Array.from({ length: 10 }, (_, i) => r6(i / 25)), 0]);
    expect(await stripesOf(r.blob, 10, 25)).toEqual(Array.from({ length: 10 }, (_, i) => i * 12));
  });
});

describe(`render() with Kinetic loaded after the runtime started (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // This file's own page: the runtime's player started on 1/30 s before
  // Kinetic loaded, with the root at data-fps="25".
  for (const [fps, to, landed] of [[25, '0.04 s', '0.0333 s'], [60, '0.0167 s', '0 s']]) {
    it(`a render at ${fps} fps throws KN-206 at its second frame with where the seek landed, and leaves the clock and the page as they were`, async ({ skip }) => {
      if (!canRender()) skip();
      await seekAndWait(1.2);
      let err = null;
      try { await wf.kinetic.render({ download: false, fps, to: 0.4 }); } catch (e) { err = e; }
      // Where the seek landed is the where on every build; the development sentence has the fixes.
      expectKN(err, 'KN-206', 'render(): a seek to ' + to + ' landed at ' + landed, new RegExp('a render at ' + fps + ' fps would repeat or skip frames\\. .*data-fps.*' + CFG));
      expect(err.message).not.toContain('from (');
      expect(wf.getStore('kinetic').time).toBe(1.2);
      expect(wf.getStore('kinetic').fps).toBe(25);
      expect(document.querySelector('canvas[data-kinetic-render]')).toBeNull();
    });
  }

  it("a render from a time off the player's frames throws KN-206 at its first frame, with from in the message", async ({ skip }) => {
    if (!canRender()) skip();
    await seekAndWait(1.2);
    let err = null;
    try { await wf.kinetic.render({ download: false, fps: 30, from: 0.05, to: 0.3 }); } catch (e) { err = e; }
    expectKN(err, 'KN-206', 'render(): a seek to 0.05 s landed at 0.0333 s', 'from (0.05 s) is not on those frames');
    expect(wf.getStore('kinetic').time).toBe(1.2);
    expect(document.querySelector('canvas[data-kinetic-render]')).toBeNull();
  });

  for (const fps of [30, 15]) {
    it(`a render at ${fps} fps, which the 1/30 s grid divides, renders every frame at its own time, with no seek but the frames' and the seek back`, async ({ skip }) => {
      if (!canRender()) skip();
      await seekAndWait(1.2);
      const heard = [];
      const on = (e) => heard.push(r6(e.detail.time));
      window.addEventListener('hf-seek', on);
      let r;
      try { r = await wf.kinetic.render({ download: false, fps, to: 0.4 }); } finally { window.removeEventListener('hf-seek', on); }
      const n = Math.round(0.4 * fps);
      expect(r.frames).toBe(n);
      expect(heard).toEqual([...Array.from({ length: n }, (_, i) => r6(i / fps)), 1.2]);
      expect(wf.getStore('kinetic').time).toBe(1.2);
    });
  }

  // The store holds 25 fps (the root's) here. A render at 15 fps from the
  // clock's own time: the player sends no hf-seek for frame 0, since it is
  // already there, and for a one-frame render none for the seek back either,
  // so the store's frame has to follow the fps when render() changes it.
  it("the store's frame follows the render's fps, when frame 0 or the seek back finds the player already there", async ({ skip }) => {
    if (!canRender()) skip();
    const store = wf.getStore('kinetic');
    for (const to of [0.4, 0.2 + 1 / 15]) {
      await seekAndWait(0.2);
      expect(store.frame).toBe(5);
      const seen = [];
      await wf.kinetic.render({ download: false, fps: 15, from: 0.2, to, onProgress: () => seen.push(store.frame) });
      expect(seen, 'to ' + to).toEqual(to === 0.4 ? [3, 4, 5] : [3]);
      expect([store.fps, r6(store.time), store.frame], 'to ' + to).toEqual([25, 0.2, 5]);
    }
  });
});

// ---- the sine lesson with the runtime ---------------------------------------------
//
// A page with the runtime is in video mode whatever it sets, so the lesson's
// steps are clips its player plays straight through, with the scripts writing
// the angle and the answer on every seek. The runtime's tag comes last, after
// the lesson's own deferred scripts.

describe.skipIf(!HAS_SINE)(`the sine lesson with the HyperFrames runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('is in video mode, its scripts write on the runtime\'s seeks, and its player plays across a step with no hold', async ({ skip }) => {
    if (!available || (wf.features && wf.features.lists === false)) skip();
    const { w, k, store, sine } = await sinePage(frames, { tail: '<script defer src="' + RUNTIME_FILE + '"><\/script>' });
    for (let i = 0; i < 600 && !w.__player; i++) await tick(16);
    expect(w.__player, "the runtime's player").toBeTruthy();
    expect(store.mode).toBe('video');
    const at = async (t) => { w.__player.renderSeek(t); await w.__hfWaitForSeekCompletion(); return [store.step, sine.angle, sine.choice]; };
    expect(await at(15)).toEqual(['ask', 360, null]);
    expect(await at(16.1)).toEqual(['ask', 360, 270]);
    expect(await at(21.9)).toEqual(['find', 270, 270]);
    const early = await at(1);
    expect(early).toEqual(['circle', 30, null]);
    await at(5.8);
    k.play();
    await tick(800);
    const state = [store.playing, store.step, store.time > 6.2, store.waiting];
    k.pause();
    expect(state).toEqual([true, 'unwrap', true, false]);
  });

  // The runtime's tag after Kinetic's, autoplay on, and an image outside the
  // composition that holds the page's load event back, so readiness passes
  // before the clock's own load step reads the mode. Chrome's
  // document.fonts.ready waits for the load event, so here it is a promise
  // already resolved.
  it('with autoplay on and the runtime after Kinetic, a page with steps enters no step in interactive mode, even when readiness passes before load', async () => {
    if (!available) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0;pointer-events:none';
    const fonts = '<script>Object.defineProperty(document.fonts, "ready", { get: () => Promise.resolve(document.fonts), configurable: true });<\/script>';
    const html = '<!doctype html><html><head><base href="' + location.href + '">' + fonts + '</head><body style="margin:0">'
      + '<div id="stage" data-composition-id="rl" data-no-timeline data-start="0" data-duration="6" data-fps="30" style="width:320px;height:180px">'
      + '<section id="one" data-step data-start="0" data-duration="3"></section><section id="two" data-step data-start="one" data-duration="3"></section></div>'
      + '<img src="/__kinetic/slow/1500/frames.png" alt="" style="position:absolute;left:-10px;width:1px;height:1px">'
      + '<script src="' + CORE + '"><\/script><script src="' + WF_FILE + '"><\/script>'
      + '<script>window.__steps = []; document.addEventListener("kinetic:step", (e) => window.__steps.push(e.detail.step));'
      + 'window.__readyAt = wildflower.kinetic.ready().then(() => performance.now()); window.__loadAt = 0; addEventListener("load", () => { window.__loadAt = performance.now(); });<\/script>'
      + '<script src="' + RUNTIME_FILE + '"><\/script></body></html>';
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    frame.src = url;
    const loaded = new Promise((r) => { frame.onload = r; });
    document.body.appendChild(frame);
    frames.push(frame);
    await loaded;
    URL.revokeObjectURL(url);
    const w = frame.contentWindow;
    for (let i = 0; i < 300 && !w.__player; i++) await tick(16);
    await tick(800);
    const store = w.wildflower.getStore('kinetic');
    expect(await w.__readyAt, 'readiness passed before load').toBeLessThan(w.__loadAt);
    expect([store.mode, store.playing, store.time, w.__steps.length]).toEqual(['video', false, 0, 0]);
    expect(w.__player.isPlaying()).toBe(false);
  });
});
