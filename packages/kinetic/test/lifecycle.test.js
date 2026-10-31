/**
 * Lifecycle cases: a rejected seek(local), a scene that mounts during a
 * seek, readiness and unmounted scenes, chained data-end references, a
 * config() call that throws, the standalone loop after a runtime arrives,
 * and KN-154 (a scene inside a scene) on store paths.
 *
 * Order matters in this file. The first test needs a clock that has not yet
 * seen an hf-seek, and the page keeps its first readiness failure for good,
 * so the cases that call ready() come before the ones that fail an input.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { load, mount, tick, frames, dispatchSeek, captureWarnings, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

// Saved before any seek, so a development build's guard never sees it.
const now = performance.now.bind(performance);

const cleanup = [];
const scenesToDrop = [];    // scenes a later test must not seek
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__player;
  delete window.__hyperframes;
  delete window.__timelines;
  delete window.__renderReady;
  delete window.__hfVariables;
  const c = wf.kinetic.config();
  if (c.channel !== 'event' || c.preview) wf.kinetic.config({ channel: 'event', preview: false });
});

async function captureErrors(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.error = orig; }
  return lines;
}

const KEYFRAMES = '<style>@keyframes kn-lifecycle-fade { from { opacity: 0 } to { opacity: 1 } }</style>';

describe(`lifecycle (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the first hf-seek reads the root: its data-fps, and the player\'s duration when the root has none', async () => {
    const { wf } = await load();
    await tick(20);   // the clock's own read after load has run
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="rl-first" data-start="0" data-fps="24"></div>');
    cleanup.push(host);
    window.__player = { play() {}, pause() {}, getDuration() { return 7; } };
    await dispatchSeek(1).done;
    expect({ fps: store.fps, duration: store.duration, frame: store.frame }).toEqual({ fps: 24, duration: 7, frame: 24 });
    wf.kinetic.config({ fps: 30 });
  });

  it('defect 1: a seek(local) promise that rejects reaches onError, and the barrier still runs the after-seek hooks', async () => {
    const { wf } = await load();
    const errors = [];
    const unhandled = [];
    const onUnhandled = (e) => { unhandled.push(String(e.reason && e.reason.message)); };
    window.addEventListener('unhandledrejection', onUnhandled);
    try {
      const name = uniqueName('reject');
      scenesToDrop.push(name);
      wf.kinetic.scene(name, {
        seek(local) { if (local > 0.5) return Promise.reject(new Error('seek failed at ' + local)); return undefined; },
        onError(e, info) { errors.push(e.message + ' in ' + info.methodName); },
      });
      wf.kinetic.seek(0);
      const host = await mount(`${KEYFRAMES}<div data-composition-id="rl1" data-start="0" data-duration="5">
        <div data-component="${name}" data-start="0"><i class="a" style="animation: kn-lifecycle-fade 10s linear"></i></div></div>`);
      cleanup.push(host);
      const { done } = dispatchSeek(2);
      const settled = await Promise.race([done.then(() => 'resolved', (e) => 'rejected: ' + e.message), tick(500).then(() => 'pending')]);
      expect(settled).toBe('resolved');
      expect(errors).toEqual(['seek failed at 2 in seek']);
      // The CSS catch-up, an after-seek hook on every build, positioned the
      // animation; in development the guard put the globals back.
      const anim = host.querySelector('.a').getAnimations()[0];
      expect([anim.playState, anim.currentTime]).toEqual(['paused', 2000]);
      if (BUILD === 'dev') expect(Function.prototype.toString.call(Math.random)).toMatch(/\[native code\]/);
      // A seek nobody awaits leaves no unhandled rejection either.
      wf.kinetic.seek(3);
      await tick(20);
      expect(errors).toEqual(['seek failed at 2 in seek', 'seek failed at 3 in seek']);
      expect(unhandled).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('defect 1: the init seek(local) that rejects reaches onError, not an unhandled rejection', async () => {
    const { wf } = await load();
    const errors = [];
    const unhandled = [];
    const onUnhandled = (e) => { unhandled.push(String(e.reason && e.reason.message)); };
    window.addEventListener('unhandledrejection', onUnhandled);
    try {
      const name = uniqueName('reject-init');
      scenesToDrop.push(name);
      wf.kinetic.scene(name, {
        seek() { return Promise.reject(new Error('init seek failed')); },
        onError(e, info) { errors.push(e.message + ' in ' + info.methodName); },
      });
      const host = await mount(`<div data-composition-id="rl1b" data-start="0" data-duration="5"><div data-component="${name}" data-start="0"></div></div>`);
      cleanup.push(host);
      await tick(20);
      expect(errors).toEqual(['init seek failed in seek']);
      expect(unhandled).toEqual([]);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });

  it('defect 2: a scene that a data-render section mounts at a seek runs seek(local) and the after-seek hooks before that barrier resolves', async () => {
    const { wf } = await load();
    const outer = uniqueName('outer');
    const inner = uniqueName('inner');
    let release = null;
    let hold = true;
    wf.component(outer, { subscribe: ['kinetic'], computed: { on() { return this.stores.kinetic.time > 2; } } });
    scenesToDrop.push(inner);
    wf.kinetic.scene(inner, {
      seek(local) {
        this.element.querySelector('.c').textContent = 'drawn@' + local;
        return hold ? new Promise((r) => { release = r; }) : undefined;
      },
    });
    wf.kinetic.seek(0);
    const host = await mount(`${KEYFRAMES}<div data-composition-id="rl2" data-start="0" data-duration="5">
      <div data-component="${outer}"><section data-render="on"><div data-component="${inner}"><b class="l" data-bind="local"></b><i class="c"></i><i class="a" style="animation: kn-lifecycle-fade 10s linear"></i></div></section></div>
    </div>`);
    cleanup.push(host);
    expect(host.querySelector('.c')).toBe(null);
    const { done } = dispatchSeek(3);
    // The new scene's first seek(local) ran inside this seek, and the
    // promise it returned holds the barrier.
    const first = await Promise.race([done.then(() => 'resolved'), tick(40).then(() => 'held')]);
    hold = false;
    if (release) release();
    expect(first).toBe('held');
    expect({ l: host.querySelector('.l').textContent, c: host.querySelector('.c').textContent }).toEqual({ l: '3', c: 'drawn@3' });
    await done;
    // The after-seek hooks saw the new scene: the catch-up positioned its animation.
    const anim = host.querySelector('.a').getAnimations()[0];
    expect([anim.playState, anim.currentTime]).toEqual(['paused', 3000]);
  });

  it('defect 7: a chain of data-end references resolves in linear time', async () => {
    const { wf } = await load();
    const N = 20;
    let clips = '';
    for (let i = 0; i < N; i++) clips += `<div id="ch${i}" data-start="${i ? 'ch' + (i - 1) : '0'}" data-end="${i + 1}"></div>`;
    const host = await mount(`<div data-composition-id="rl7" data-start="0" data-duration="${N}">${clips}</div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const t0 = now();
    wf.kinetic.seek(N - 0.5);
    const took = now() - t0;
    await tick(0);
    expect(took).toBeLessThan(50);
    expect(['ch0', 'ch' + (N - 2), 'ch' + (N - 1)].map((id) => host.querySelector('#' + id).style.visibility)).toEqual(['hidden', 'hidden', 'visible']);
  });

  it('defect 7: a clip window kept between seeks follows a changed attribute and a changed root duration', async () => {
    const { wf } = await load();
    const host = await mount(`<div id="rl7b-root" data-composition-id="rl7b" data-start="0" data-duration="6">
      <div id="m" data-start="1" data-duration="1"></div>
      <div id="r" data-start="rl7b"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const vis = (id) => host.querySelector('#' + id).style.visibility;
    const at = async (t) => { wf.kinetic.seek(t); await tick(0); };
    await at(1.5); expect(vis('m')).toBe('visible');
    await at(6); expect(vis('r')).toBe('visible');
    host.querySelector('#m').setAttribute('data-start', '3');
    await at(1.5); expect(vis('m')).toBe('hidden');
    await at(3.5); expect(vis('m')).toBe('visible');
    host.querySelector('#rl7b-root').setAttribute('data-duration', '8');
    wf.kinetic.config({});
    await at(6); expect(vis('r')).toBe('hidden');
    await at(8); expect(vis('r')).toBe('visible');
  });

  it('clips: data-hidden hides a clip with display none, and script, style, link and meta are left alone', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="rl-hid" data-start="0" data-duration="6">
      <div id="h" data-start="0" data-duration="6" data-hidden style="display: flex"></div>
      <script id="s" type="text/plain" data-start="4"></script>
      <style id="st" data-start="4"></style>
      <link id="ln" rel="preload" as="image" href="data:," data-start="4">
      <meta id="mt" name="x" data-start="4">
    </div>`);
    cleanup.push(host);
    const el = (id) => host.querySelector('#' + id);
    wf.kinetic.seek(1); await tick(0);
    expect([el('h').style.display, el('h').style.visibility]).toEqual(['none', '']);
    expect(['s', 'st', 'ln', 'mt'].map((id) => el(id).style.visibility)).toEqual(['', '', '', '']);
    el('h').removeAttribute('data-hidden');
    wf.kinetic.seek(1); await tick(0);
    expect([el('h').style.display, el('h').style.visibility]).toEqual(['flex', 'visible']);
  });

  it('defect 8: a config() call that throws changes nothing', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const before = wf.kinetic.config();
    // No composition root on the page, so no timeline can be registered.
    expect(() => wf.kinetic.config({ channel: 'timeline', fps: 50 })).toThrow(/KN-100/);
    expect(wf.kinetic.config()).toEqual(before);
    expect(() => wf.kinetic.config({ fps: 50, channel: 'gsap' })).toThrow(/KN-100/);
    expect(() => wf.kinetic.config({ preview: true, fps: -1 })).toThrow(/KN-100/);
    expect(wf.kinetic.config()).toEqual(before);
    expect(store.fps).toBe(before.fps);
    await dispatchSeek(1.25).done;
    expect(store.time).toBe(1.25);
  });

  it('defect 9: pause() stops the standalone loop once a player has arrived', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    wf.kinetic.seek(0);
    wf.kinetic.play();
    await frames(3);
    window.__player = { play() {}, pause() {}, isPlaying() { return false; } };
    wf.kinetic.pause();
    const at = store.time;
    await frames(4);
    expect([store.time, store.playing]).toEqual([at, false]);
  });

  it('defect 9: the standalone loop stops when a runtime appears, whichever channel it drives', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    wf.kinetic.seek(0);
    wf.kinetic.play();
    await frames(3);
    window.__hyperframes = {};
    await frames(2);
    const at = store.time;
    await frames(4);
    expect(store.time).toBe(at);
  });

  if (BUILD === 'dev') {
    it('defect 10: KN-154 (a scene inside a scene) skips store paths, members and string literals on a scene root (dev)', async () => {
      const { wf } = await load();
      const outer = uniqueName('scene');
      wf.kinetic.scene(outer, {});
      const names = [uniqueName('scene'), uniqueName('scene'), uniqueName('scene'), uniqueName('scene')];
      for (const n of names) wf.kinetic.scene(n, {});
      const lines = await captureWarnings(async () => {
        const host = await mount(`<div data-composition-id="rl10" data-start="0" data-duration="5"><div data-component="${outer}" data-start="0">
          <div data-component="${names[0]}" data-start="0" data-show="$kinetic.time > 1"></div>
          <div data-component="${names[1]}" data-start="0" data-show="mode === 'local'"></div>
          <div data-component="${names[2]}" data-start="0" data-show="cfg.progress > 0"></div>
          <div data-component="${names[3]}" data-start="0" data-show="local > 1"></div>
        </div></div>`);
        cleanup.push(host);
        await tick(20);
      });
      const hits = lines.filter((l) => l.startsWith('[KN-154]'));
      expect(hits.length, hits.join(' || ')).toBe(1);
      expect(hits[0]).toContain("scene '" + names[3] + "'");
    });
  }

  it('markShown: with a runtime that never publishes __renderReady, the mark stops waiting after 60 s and leaves the root unmarked', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="rl-ms" data-start="0" data-duration="2"></div>');
    cleanup.push(host);
    const root = host.firstElementChild;
    root.removeAttribute('data-kinetic-ready');
    window.__player = { renderSeek() {}, play() {}, pause() {}, isPlaying() { return false; }, getDuration() { return 2; } };
    window.__renderReady = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    try {
      const p = wf.kinetic.ready();
      await vi.advanceTimersByTimeAsync(200);
      await p;
      expect(root.hasAttribute('data-kinetic-ready')).toBe(false);
      vi.advanceTimersByTime(60000);
      window.__renderReady = true;
      vi.advanceTimersByTime(1000);
      expect(root.hasAttribute('data-kinetic-ready')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('defect 3: readiness waits on the waitFor of mounted scenes, not of every defined scene', async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    wf.kinetic.scene(uniqueName('unused'), { waitFor: ['only-on-other-pages'] });
    let err = null;
    const errors = await captureErrors(async () => { await wf.kinetic.ready().catch((e) => { err = e; }); });
    expect(err && err.message).toBe(null);
    expect(errors).toEqual([]);
  });

  it('inputs: a blank Number or Boolean variable counts as missing; a String keeps it', async () => {
    const { wf } = await load();
    window.__hfVariables = { n: ' ', nd: '', b: '  ', bd: '', s: '', s2: ' ' };
    const name = uniqueName('scene');
    let seen = null;
    wf.kinetic.scene(name, {
      inputs: {
        n: Number,
        nd: { type: Number, default: 5 },
        b: Boolean,
        bd: { type: Boolean, default: true },
        s: String,
        s2: { type: String, default: 'x' },
      },
      init() { seen = Object.assign({}, this.inputs); },
    });
    let errors;
    errors = await captureErrors(async () => {
      const host = await mount(`<div data-composition-id="rl-in" data-start="0" data-duration="2"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
    });
    expect(errors.filter((l) => l.includes('KN-130'))).toEqual([]);
    expect(seen).toEqual({ n: undefined, nd: 5, b: undefined, bd: true, s: '', s2: ' ' });
  });

  // Last: a failed input holds readiness for the rest of the page.
  it('inputs: a required Number that is blank is reported as empty, not as absent', async () => {
    const { wf } = await load();
    window.__hfVariables = { price: ' ' };
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { inputs: { price: { type: Number, required: true } } });
    const errors = await captureErrors(async () => {
      const host = await mount(`<div data-composition-id="rl-req" data-start="0" data-duration="2"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      await wf.kinetic.ready().catch(() => {});
    });
    const ours = errors.filter((l) => l.startsWith('[KN-130] scene '));
    expect(ours.length).toBe(1);
    expectKN({ code: 'KN-130', message: ours[0] }, 'KN-130', "scene '" + name + "' input 'price'", "is required and the composition's variable 'price' is empty");
  });
});
