/**
 * lottie(animation, { start, rate, loop }): a lottie-web animation (the
 * pinned player in tools/lottie, fetched by scripts/fetch-lottie.cjs) on
 * Kinetic's clock. The fixture, fixtures/square.json, is a 20 px red square
 * whose centre moves from x 10 to x 90 over frames 0 to 20 at 10 fps, so at
 * frame f it is at 10 + 4f; the svg renderer writes that into the layer's
 * transform and the canvas renderer paints it.
 *
 * The cells: called inside a scene's init() (local time) and outside one
 * (composition time); the animation loaded when lottie() is called and
 * still loading; lottie() before ready() is first called (a page's script)
 * and after; the svg and canvas renderers; a paused seek, preview playback,
 * check() and the HyperFrames runtime (Kinetic seeks nothing); start, rate,
 * loop, the hold on the last frame, 0 before start and a subframe; a
 * data_failed (KN-180, before and after frame 0); the returned function,
 * destroy() and the scene's removal; a duck-typed object; KN-100. A render
 * is in lottie-render.test.js, which needs the installed Chrome.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, loadScript, mount, tick, frames, dispatchSeek, captureWarnings, uniqueName, expectKN, framedPage, LOTTIE_FILE, RUNTIME_FILE, BUILD, CORE_TIER } from './helpers.js';

const FIX = '/packages/kinetic/test/fixtures/';
let DATA = null;
let available = true;
const cleanup = [];
const scenesToDrop = [];
const anims = [];
const stops = [];

beforeAll(async () => {
  await load();
  try { await loadScript(LOTTIE_FILE); } catch (_) { available = false; }
  DATA = await (await fetch(FIX + 'square.json')).json();
});

afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const h of stops.splice(0)) h.dispose();
  for (const a of anims.splice(0)) a.destroy();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

const xAt = (f) => 10 + 4 * f;

// A composition of 4 s at 10 fps holding `inner`.
async function stage(id, inner) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-no-timeline data-start="0" data-duration="4" data-fps="10" data-width="300" data-height="100" style="position:relative;width:300px;height:100px">${inner}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return { wf, host };
}
const BOX = (cls) => `<div class="${cls}" style="display:inline-block;width:100px;height:100px"></div>`;

// The fixture as an animation in `container`: from its data, which the svg
// renderer has loaded at once and the canvas renderer a task later, or from
// its path, which loads later with either.
function make(container, renderer = 'svg', { path = false, name } = {}) {
  const opts = { container, renderer, loop: false, autoplay: false };
  if (path) opts.path = FIX + 'square.json'; else opts.animationData = structuredClone(DATA);
  if (name) opts.name = name;
  const a = window.lottie.loadAnimation(opts);
  anims.push(a);
  return a;
}

// Every goToAndStop() call on `a` from here on.
function spy(a) {
  const calls = [];
  const orig = a.goToAndStop.bind(a);
  a.goToAndStop = (v, f) => { calls.push([v, f]); return orig(v, f); };
  return calls;
}

// The square's centre: from the svg layer's transform, or read off the
// canvas renderer's canvas along the middle row.
function svgX(el) {
  const g = el.querySelector('#box');
  const m = /matrix\(([^)]+)\)/.exec((g && g.getAttribute('transform')) || '');
  return m ? Number(m[1].split(',')[4]) : NaN;
}
function canvasX(el) {
  const c = el.querySelector('canvas');
  const copy = document.createElement('canvas');
  copy.width = c.width; copy.height = c.height;
  const g = copy.getContext('2d', { willReadFrequently: true });
  g.drawImage(c, 0, 0);
  const s = c.width / 100;
  const d = g.getImageData(0, Math.floor(50 * s), c.width, 1).data;
  let lo = -1, hi = -1;
  for (let i = 0; i < c.width; i++) if (d[i * 4] > 128 && d[i * 4 + 1] < 100 && d[i * 4 + 3] > 128) { if (lo < 0) lo = i; hi = i; }
  return lo < 0 ? NaN : (lo + hi + 1) / 2 / s;
}

// An object with lottie-web's methods and no lottie-web behind it.
function duck(totalFrames = 30, frameRate = 30) {
  const listeners = {};
  const d = {
    isLoaded: false, totalFrames, frameRate, calls: [], sub: null, listeners,
    goToAndStop(v, f) { d.calls.push([v, f]); },
    setSubframe(v) { d.sub = v; },
    addEventListener(n, fn) {
      (listeners[n] = listeners[n] || []).push(fn);
      return () => { listeners[n] = listeners[n].filter((x) => x !== fn); };
    },
    fire(n, e) { for (const fn of (listeners[n] || []).slice()) fn(e); },
  };
  return d;
}

// Whether `p` settles only after `cause()`, which runs two frames on, by when
// readiness that nothing holds has long settled. A readiness that waits for
// what `cause` does always passes; the frames only decide how early one that
// does not wait would be caught.
async function settlesAfter(p, cause) {
  let caused = false, early = null;
  const seen = p.then(() => { early = !caused; }, () => { early = !caused; });
  await frames(2);
  caused = true;
  await cause();
  await seen;
  return early === false;
}

describe(`lottie() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('lottie-web is on the page (fetch it with node scripts/fetch-lottie.cjs if this fails)', () => {
    expect(available).toBe(true);
    expect(typeof window.lottie.loadAnimation).toBe('function');
  });

  it('outside a scene, on composition time: a paused seek puts the square where the animation has it then, with the svg and the canvas renderer, and seeking warns of nothing', async () => {
    const { wf, host } = await stage('lt1', BOX('s') + BOX('c'));
    const s = host.querySelector('.s'), c = host.querySelector('.c');
    const sa = make(s, 'svg'), ca = make(c, 'canvas');
    stops.push(wf.kinetic.lottie(sa), wf.kinetic.lottie(ca));
    await wf.kinetic.ready();
    const lines = await captureWarnings(async () => {
      for (const t of [0.5, 1.2, 0.3]) {
        await dispatchSeek(t).done;
        expect(svgX(s), 'svg at ' + t).toBeCloseTo(xAt(t * 10), 3);
        expect(Math.abs(canvasX(c) - xAt(t * 10)), 'canvas at ' + t).toBeLessThan(1);
      }
    });
    expect(lines.filter((l) => l.includes('[Kinetic KN'))).toEqual([]);
  });

  it("with scene: this, on the scene's local time; without, on composition time", async () => {
    const { wf } = await load();
    const name = uniqueName('lscene');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      init() { stops.push(wf.kinetic.lottie(make(this.element.querySelector('.in')), { scene: this, start: 0.5 })); },
    });
    const { host } = await stage('lt2', `<div data-component="${name}" data-start="1" data-duration="2">${BOX('in')}</div>${BOX('out')}`);
    stops.push(wf.kinetic.lottie(make(host.querySelector('.out'))));
    await wf.kinetic.ready();
    // 1.7 s: the scene is 0.7 s in, and the animation, from 0.5 s, 0.2 s in.
    await dispatchSeek(1.7).done;
    expect(svgX(host.querySelector('.in'))).toBeCloseTo(xAt(2), 3);
    expect(svgX(host.querySelector('.out'))).toBeCloseTo(xAt(17), 3);
  });

  it('start and rate, 0 before start, the hold on the last frame, loop, and a subframe seek drawn between two frames', async () => {
    const { wf, host } = await stage('lt3', BOX('a') + BOX('b') + BOX('c'));
    const a = make(host.querySelector('.a')), b = make(host.querySelector('.b')), c = make(host.querySelector('.c'));
    const ca = spy(a), cb = spy(b), cc = spy(c);
    stops.push(wf.kinetic.lottie(a, { start: 1, rate: 2 }), wf.kinetic.lottie(b), wf.kinetic.lottie(c, { loop: true }));
    const at = async (t) => {
      for (const calls of [ca, cb, cc]) calls.length = 0;
      await dispatchSeek(t).done;
      return [ca[0], cb[0], cc[0]];
    };
    // Before start: frame 0. b and c on composition time.
    let [fa, fb, fc] = await at(0.5);
    expect([fa, fb, fc]).toEqual([[0, true], [5, true], [5, true]]);
    expect(svgX(host.querySelector('.a'))).toBeCloseTo(xAt(0), 3);
    // 0.25 s past start at twice the speed: frame 5.
    [fa] = await at(1.25);
    expect(fa[0]).toBeCloseTo(5, 9);
    expect(svgX(host.querySelector('.a'))).toBeCloseTo(xAt(5), 3);
    // A subframe: 0.55 s is frame 5.5, between frames 5 and 6.
    [, fb] = await at(0.55);
    expect(fb[0]).toBeCloseTo(5.5, 9);
    expect(svgX(host.querySelector('.b'))).toBeCloseTo(xAt(5.5), 3);
    // Past the end: b holds frame 19, the last, where the square still
    // shows; c wraps at 20 frames.
    [, fb, fc] = await at(1.95);
    expect(fb[0]).toBe(19);
    expect(fc[0]).toBeCloseTo(19.5, 9);
    [fa, fb, fc] = await at(3.5);
    expect([fa[0], fb[0]]).toEqual([19, 19]);
    expect(fc[0]).toBeCloseTo(15, 9);
    expect(svgX(host.querySelector('.b'))).toBeCloseTo(xAt(19), 3);
    expect(svgX(host.querySelector('.c'))).toBeCloseTo(xAt(15), 3);
  });

  it("an animation already loaded when lottie() is called is put on the frame of the clock's time at once, without a seek", async () => {
    const { wf, host } = await stage('lt4', BOX('a'));
    await dispatchSeek(1.2).done;
    const a = make(host.querySelector('.a'));
    expect(a.isLoaded).toBe(true);
    const calls = spy(a);
    stops.push(wf.kinetic.lottie(a));
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBeCloseTo(12, 9);
    expect(svgX(host.querySelector('.a'))).toBeCloseTo(xAt(12), 3);
  });

  it("after ready() was first called, an animation still loading holds the next ready() until it has loaded, and is on the clock's frame then", async () => {
    const { wf, host } = await stage('lt5', BOX('a') + BOX('b'));
    await wf.kinetic.ready();
    await dispatchSeek(1.2).done;
    const a = make(host.querySelector('.a'), 'svg', { path: true });
    const b = make(host.querySelector('.b'), 'canvas', { path: true });
    expect([a.isLoaded, b.isLoaded]).toEqual([false, false]);
    const order = [];
    stops.push(wf.kinetic.lottie(a), wf.kinetic.lottie(b));
    a.addEventListener('DOMLoaded', () => order.push('a loaded'));
    b.addEventListener('DOMLoaded', () => order.push('b loaded'));
    await wf.kinetic.ready().then(() => order.push('ready'));
    expect(order.at(-1)).toBe('ready');
    expect(order.length).toBe(3);
    expect(svgX(host.querySelector('.a'))).toBeCloseTo(xAt(12), 3);
    expect(Math.abs(canvasX(host.querySelector('.b')) - xAt(12))).toBeLessThan(1);
  });

  it("before ready() is first called: a page's script hands a loading animation to lottie(), and ready() resolves with it loaded and on the clock's frame", async () => {
    const p = await framedPage(`<div data-composition-id="lp" data-no-timeline data-start="0" data-duration="4" data-fps="10" data-width="100" data-height="100"><div id="holder" style="width:100px;height:100px"></div></div>
      <script>
        wildflower.kinetic.config({ autoplay: false });
        wildflower.kinetic.seek(1.2);
        window.a = lottie.loadAnimation({ container: document.getElementById('holder'), renderer: 'svg', loop: false, autoplay: false, path: '${FIX}square.json' });
        window.wasLoaded = window.a.isLoaded;
        wildflower.kinetic.lottie(window.a);
      <\/script>`, cleanup,
    "window.__at = { loaded: window.a.isLoaded, transform: document.getElementById('box').getAttribute('transform') }",
    '<script src="' + LOTTIE_FILE + '"><\/script>');
    expect(p.result).toBe('resolved');
    expect(p.w.wasLoaded).toBe(false);
    expect(p.w.__at.loaded).toBe(true);
    expect(Number(/matrix\(([^)]+)\)/.exec(p.w.__at.transform)[1].split(',')[4])).toBeCloseTo(xAt(12), 3);
    expect(p.w.__errors).toEqual([]);
  });

  it("preview playback: while the clock plays, every frame puts the animation on the clock's time", async () => {
    const { wf, host } = await stage('lt6', BOX('a'));
    const a = make(host.querySelector('.a'));
    const calls = spy(a);
    stops.push(wf.kinetic.lottie(a));
    await dispatchSeek(0.2).done;
    calls.length = 0;
    wf.kinetic.play();
    await frames(8);
    wf.kinetic.pause();
    await tick(0);
    const store = wf.getStore('kinetic');
    expect(calls.length).toBeGreaterThan(2);
    for (let i = 1; i < calls.length; i++) expect(calls[i][0]).toBeGreaterThanOrEqual(calls[i - 1][0]);
    expect(calls.at(-1)[0]).toBeCloseTo(Math.min(store.time * 10, 19), 9);
    expect(calls.every(([, f]) => f === true)).toBe(true);
  });

  it('check() passes with a Lottie animation in a scene, svg and canvas', async () => {
    const { wf } = await load();
    const name = uniqueName('lcheck');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      init() {
        stops.push(wf.kinetic.lottie(make(this.element.querySelector('.s'), 'svg'), { scene: this }), wf.kinetic.lottie(make(this.element.querySelector('.c'), 'canvas'), { scene: this, loop: true }));
      },
    });
    const { host } = await stage('lt7', `<div data-component="${name}" data-start="0" data-duration="4">${BOX('s')}${BOX('c')}</div>`);
    await wf.kinetic.ready();
    const report = await wf.kinetic.check({ samples: 12 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
    await dispatchSeek(0.4).done;
    expect(svgX(host.querySelector('.s'))).toBeCloseTo(xAt(4), 3);
    await dispatchSeek(2.4).done;
    expect(Math.abs(canvasX(host.querySelector('.c')) - xAt(4))).toBeLessThan(1);
  });

  it('a duck-typed object is seeked with (frame, true) once loaded, with subframes on, and ready() waits for its DOMLoaded', async () => {
    const { wf } = await stage('lt8', '');
    await dispatchSeek(0.4).done;
    const d = duck();
    stops.push(wf.kinetic.lottie(d));
    expect(d.sub).toBe(true);
    expect(d.calls).toEqual([]);
    const ready = wf.kinetic.ready();
    expect(await settlesAfter(ready, () => {
      d.isLoaded = true;
      d.fire('DOMLoaded');
      expect(d.calls).toEqual([[12, true]]);
    })).toBe(true);
    d.calls.length = 0;
    await dispatchSeek(0.5).done;
    expect(d.calls).toEqual([[15, true]]);
    // An object with no isLoaded is taken as loaded.
    const e = duck();
    delete e.isLoaded;
    stops.push(wf.kinetic.lottie(e, { rate: 2 }));
    expect(e.calls).toEqual([[30 - 1, true]]);
  });

  it('lottie() again for the same animation replaces its timing', async () => {
    const { wf } = await stage('lt12', '');
    const d = duck();
    d.isLoaded = true;
    stops.push(wf.kinetic.lottie(d), wf.kinetic.lottie(d, { start: 0.2 }));
    expect(d.listeners.DOMLoaded.length).toBe(1);
    d.calls.length = 0;
    await dispatchSeek(0.5).done;
    expect(d.calls.length).toBe(1);
    expect(d.calls[0][0]).toBeCloseTo(9, 9);
  });

  it('lottie() again while readiness waits for the animation: readiness waits for it under its new options', async () => {
    const { wf } = await stage('lt13', '');
    await dispatchSeek(0.5).done;
    const d = duck();
    stops.push(wf.kinetic.lottie(d));
    const ready = wf.kinetic.ready();
    // A frame on, readiness is waiting on the first registration.
    await frames(1);
    stops.push(wf.kinetic.lottie(d, { start: 0.2 }));
    expect(await settlesAfter(ready, () => { d.isLoaded = true; d.fire('DOMLoaded'); })).toBe(true);
    expect(d.calls.at(-1)[0]).toBeCloseTo(9, 9);
  });

  it("the animation's destroy() hands it back without taking Kinetic's listeners off while lottie-web calls them, so the page's own destroy listener runs", async () => {
    const { wf, host } = await stage('lt14', BOX('a'));
    const a = make(host.querySelector('.a'));
    const calls = spy(a);
    wf.kinetic.lottie(a);
    let heard = 0;
    a.addEventListener('destroy', () => { heard++; });
    expect(() => a.destroy()).not.toThrow();
    anims.splice(anims.indexOf(a), 1);
    expect(heard).toBe(1);
    calls.length = 0;
    await dispatchSeek(0.7).done;
    expect(calls).toEqual([]);
  });

  it("the handle's dispose(), the animation's destroy() and its scene's removal each hand it back: no goToAndStop() after, and ready() no longer waits for it", async () => {
    const { wf } = await load();
    const name = uniqueName('lgone');
    scenesToDrop.push(name);
    let destroyed = 0;
    const inScene = [];
    wf.kinetic.scene(name, {
      init() { const a = make(this.element.querySelector('.x')); inScene.push(spy(a)); wf.kinetic.lottie(a, { scene: this }); },
      beforeDestroy() { destroyed++; },
    });
    const { host } = await stage('lt9', BOX('a') + BOX('b') + `<div class="sc" data-component="${name}" data-start="0">${BOX('x')}</div>`);
    const a = make(host.querySelector('.a')), b = make(host.querySelector('.b'));
    const ca = spy(a), cb = spy(b);
    const handle = wf.kinetic.lottie(a);
    expect(Object.keys(handle)).toEqual(['dispose']);
    stops.push(wf.kinetic.lottie(b));
    await dispatchSeek(0.5).done;
    expect([ca.length, cb.length, inScene[0].length].every((n) => n > 0)).toBe(true);
    handle.dispose();
    handle.dispose();
    b.destroy();
    anims.splice(anims.indexOf(b), 1);
    host.querySelector('.sc').remove();
    for (let i = 0; i < 100 && !destroyed; i++) await tick(10);
    expect(destroyed).toBe(1);
    ca.length = 0; cb.length = 0; inScene[0].length = 0;
    await dispatchSeek(0.7).done;
    expect([ca, cb, inScene[0]]).toEqual([[], [], []]);
    // One that never loads holds ready() until it is handed back.
    const d = duck();
    const give = wf.kinetic.lottie(d);
    const ready = wf.kinetic.ready();
    expect(await settlesAfter(ready, () => give.dispose())).toBe(true);
    expect(d.listeners.DOMLoaded).toEqual([]);
  });

  // An image layer: the svg renderer draws it as an SVG <image>, which it
  // loads after DOMLoaded. decode() is held here until the test lets it go,
  // and ready() settles only after.
  const IMAGE_LAYER = {
    v: '5.7.4', fr: 10, ip: 0, op: 20, w: 100, h: 100, ddd: 0, markers: [],
    assets: [{ id: 'im', w: 40, h: 20, u: FIX, p: 'frames.png', e: 0 }],
    layers: [{ ddd: 0, ind: 1, ty: 2, nm: 'pic', refId: 'im', sr: 1, ao: 0, ip: 0, op: 20, st: 0, bm: 0, ks: { o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } } }],
  };
  async function heldDecode(fn) {
    const seen = [];
    let release;
    const gate = new Promise((r) => { release = r; });
    const orig = SVGImageElement.prototype.decode;
    SVGImageElement.prototype.decode = function () { seen.push(this); return gate.then(() => orig.call(this)); };
    try { await fn(seen, () => release()); } finally { SVGImageElement.prototype.decode = orig; }
  }

  it('inside a scene, readiness waits for the <image> elements the svg renderer draws for an image layer to decode', async () => {
    const { wf } = await load();
    const name = uniqueName('limg');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      init() {
        const a = window.lottie.loadAnimation({ container: this.element.querySelector('.x'), renderer: 'svg', autoplay: false, animationData: structuredClone(IMAGE_LAYER) });
        anims.push(a);
        stops.push(wf.kinetic.lottie(a, { scene: this }));
      },
    });
    await heldDecode(async (seen, release) => {
      const { host } = await stage('lt10', `<div data-component="${name}" data-start="0">${BOX('x')}</div>`);
      expect(await settlesAfter(wf.kinetic.ready(), release)).toBe(true);
      const image = host.querySelector('.x image');
      expect(image).toBeTruthy();
      expect(seen).toContain(image);
    });
  });

  it('outside any scene, readiness waits for those <image> elements under the composition root too', async () => {
    await heldDecode(async (seen, release) => {
      const { wf, host } = await stage('lt15', BOX('x'));
      const a = window.lottie.loadAnimation({ container: host.querySelector('.x'), renderer: 'svg', autoplay: false, animationData: structuredClone(IMAGE_LAYER) });
      anims.push(a);
      stops.push(wf.kinetic.lottie(a));
      expect(await settlesAfter(wf.kinetic.ready(), release)).toBe(true);
      expect(seen).toContain(host.querySelector('.x image'));
    });
  });

  it('KN-100 for a bad call, each mistake with its own where: the animation, the options, an unknown option, start, rate and loop', async () => {
    const { wf, host } = await stage('lt11', BOX('a'));
    const { lottie } = wf.kinetic;
    const a = make(host.querySelector('.a'));
    expectKN(() => lottie({}), 'KN-100', 'lottie(animation)', /^animation is what lottie\.loadAnimation\(\) returns/);
    expectKN(() => lottie(null), 'KN-100', 'lottie(animation)', /, not null$/);
    expectKN(() => lottie(host.querySelector('.a')), 'KN-100', 'lottie(animation)', /not a <div>$/);
    expectKN(() => lottie(a, 5), 'KN-100', 'lottie(…, options)', /^options is \{ scene, start, rate, loop \}, not 5/);
    expectKN(() => lottie(a, { speed: 2 }), 'KN-100', 'lottie(animation, { speed })', /^'speed' is not an option; the options are scene, start, rate and loop/);
    expectKN(() => lottie(a, { start: '1' }), 'KN-100', 'lottie(animation, { start })', /^start is a number of seconds, not "1"/);
    expectKN(() => lottie(a, { start: NaN }), 'KN-100', 'lottie(animation, { start })', /not NaN/);
    expectKN(() => lottie(a, { rate: 0 }), 'KN-100', 'lottie(animation, { rate })', /^rate is a number above 0/);
    expectKN(() => lottie(a, { rate: Infinity }), 'KN-100', 'lottie(animation, { rate })', /not Infinity/);
    expectKN(() => lottie(a, { loop: 'yes' }), 'KN-100', 'lottie(animation, { loop })', /^loop is true .* or false .*, not "yes"/);
    // Nothing was taken by the calls that threw.
    const calls = spy(a);
    await dispatchSeek(0.3).done;
    expect(calls).toEqual([]);
  });
});

describe(`lottie() on its own page (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const ROOT = (inner) => `<div data-composition-id="lf" data-no-timeline data-start="0" data-duration="2" data-fps="10" data-width="100" data-height="100">${inner}</div>`;
  const HOLDER = '<div id="holder" style="width:100px;height:100px"></div>';

  async function expectHeld(p, result) {
    const { w } = p;
    expect(w.__errors.filter((l) => l.startsWith('[KN-180]'))).toEqual([result.message]);
    expect(w.document.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready')).toBe('failed');
    const held = await Promise.race([w.__hf.buildReady.kinetic.then(() => 'resolved'), tick(100).then(() => 'pending')]);
    expect(held).toBe('pending');
  }

  it('a data_failed is KN-180 with the animation, its name and its file: printed once on every build, ready() rejects with it, readiness held', async () => {
    const p = await framedPage(ROOT(HOLDER) + `<script>
      wildflower.kinetic.lottie(lottie.loadAnimation({ container: document.getElementById('holder'), renderer: 'svg', autoplay: false, name: 'logo', path: '${FIX}no-such-file.json' }));
    <\/script>`, cleanup, '', '<script src="' + LOTTIE_FILE + '"><\/script>');
    expectKN(p.result, 'KN-180', "the Lottie animation 'logo' (" + FIX + 'no-such-file.json)', /^fired data_failed, so part of it could not be loaded/);
    await expectHeld(p, p.result);
    const r = await p.kinetic.check({ samples: 3 });
    expect([r.ok, r.ready, r.reason]).toEqual([false, 'failed', 'readiness failed']);
  });

  it("an animation lottie-web cannot set up fires error, which is KN-180 too, with the file and the scene it was given", async () => {
    const p = await framedPage(ROOT(`<div data-component="lt-badscene" data-start="0">${HOLDER}</div>`) + `<script>
      wildflower.kinetic.scene('lt-badscene', { init() { wildflower.kinetic.lottie(lottie.loadAnimation({ container: this.element.querySelector('#holder'), renderer: 'svg', autoplay: false, path: '${FIX}broken.json' }), { scene: this }); } });
    <\/script>`, cleanup, '', '<script src="' + LOTTIE_FILE + '"><\/script>');
    expectKN(p.result, 'KN-180', 'the Lottie animation (' + FIX + "broken.json) in scene 'lt-badscene': its data", /^lottie-web could not set it up \(.+\)/);
    await expectHeld(p, p.result);
  });

  it('a data_failed after frame 0 is printed once as it happens, marks the page failed, fails check(), and the next ready() rejects with it', async () => {
    const p = await framedPage(ROOT(HOLDER), cleanup, '', '<script src="' + LOTTIE_FILE + '"><\/script>');
    expect(p.result).toBe('resolved');
    const w = p.w;
    const root = w.document.querySelector('[data-composition-id]');
    expect(root.getAttribute('data-kinetic-ready')).toBe('true');
    p.kinetic.lottie(w.lottie.loadAnimation({ container: w.document.getElementById('holder'), renderer: 'svg', autoplay: false, path: FIX + 'no-such-file.json' }));
    const r = await p.kinetic.check({ samples: 3 });
    expect([r.ok, r.ready, r.reason]).toEqual([false, 'failed', 'readiness failed']);
    expect(root.getAttribute('data-kinetic-ready')).toBe('failed');
    const err = await p.kinetic.ready().then(() => null, (e) => e);
    expectKN(err, 'KN-180', 'the Lottie animation (' + FIX + 'no-such-file.json)', /data_failed/);
    expect(w.__errors.filter((l) => l.startsWith('[KN-180]'))).toEqual([err.message]);
  });

  it('lottie() again for an animation that already fired data_failed keeps its KN-180: ready() rejects, and does not hang', async () => {
    const { wf } = await stage('lt9', '');
    const d = duck();
    const quiet = console.error;
    console.error = () => {};
    try {
      stops.push(wf.kinetic.lottie(d));
      d.fire('data_failed');
      const first = await wf.kinetic.ready().then(() => 'resolved', (e) => e.code);
      stops.push(wf.kinetic.lottie(d, { rate: 2 }));
      const again = await Promise.race([wf.kinetic.ready().then(() => 'resolved', (e) => e.code), tick(1500).then(() => 'pending')]);
      expect([first, again]).toEqual(['KN-180', 'KN-180']);
    } finally {
      console.error = quiet;
      for (const h of stops.splice(0)) h.dispose();
    }
  });

  it('a data_failed whose path is no URL is still KN-180, and readiness does not hang on it', async () => {
    const p = await framedPage(ROOT('') + `<script>
      const d = { isLoaded: false, totalFrames: 20, frameRate: 10, path: 'http://[bad/', fileName: 'logo', on: {}, goToAndStop() {},
        addEventListener(n, fn) { (this.on[n] = this.on[n] || []).push(fn); return () => {}; } };
      wildflower.kinetic.lottie(d);
      setTimeout(() => d.on.data_failed.forEach((fn) => fn()), 0);
    <\/script>`, cleanup, '', '');
    expectKN(p.result, 'KN-180', 'the Lottie animation (http://[bad/logo.json)', /data_failed/);
  });

  it('with the HyperFrames runtime on the page, which seeks lottie-web animations itself, Kinetic seeks none', async () => {
    const p = await framedPage(`<div id="stage" data-composition-id="lr" data-no-timeline data-start="0" data-duration="2" data-fps="10" data-width="100" data-height="100">${HOLDER}</div>
      <script>
        window.duck = { calls: [], totalFrames: 20, frameRate: 10, goToAndStop(v, f) { this.calls.push([v, f]); }, addEventListener() { return () => {}; } };
        window.real = lottie.loadAnimation({ container: document.getElementById('holder'), renderer: 'svg', loop: false, autoplay: false, animationData: ${JSON.stringify(DATA)} });
        window.realCalls = [];
        const go = window.real.goToAndStop.bind(window.real);
        window.real.goToAndStop = (v, f) => { window.realCalls.push([v, f]); return go(v, f); };
        wildflower.kinetic.lottie(window.duck);
        wildflower.kinetic.lottie(window.real, { start: 1 });
      <\/script>`, cleanup, '', '<script src="' + LOTTIE_FILE + '"><\/script><script src="' + RUNTIME_FILE + '"><\/script>');
    expect(p.result).toBe('resolved');
    const w = p.w;
    for (let i = 0; i < 600 && !w.__player; i++) await tick(16);
    expect(w.__player, "the runtime's player (fetch it with node scripts/fetch-hyperframes.cjs)").toBeTruthy();
    w.realCalls.length = 0;
    w.__player.renderSeek(0.5);
    await w.__hfWaitForSeekCompletion();
    expect(w.duck.calls).toEqual([]);
    // Kinetic would put it on frame 0, half a second before its start; the
    // runtime puts it on composition time.
    expect(w.realCalls.length).toBeGreaterThan(0);
    expect(w.realCalls.some(([v, f]) => f === true && v === 0)).toBe(false);
    expect(w.real.currentFrame).toBeCloseTo(5, 6);
  });
});
