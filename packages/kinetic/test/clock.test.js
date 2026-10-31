/**
 * The clock: the `kinetic` store, seek/play/pause/config, the hf-seek
 * channel with its barrier promise, the timeline fallback, and the
 * standalone requestAnimationFrame clock when no runtime is on the page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, frames, dispatchSeek, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__player;
  delete window.__timelines;
});

// Hands the standalone clock's animation frames to the test, which runs each
// one with the timestamp it chooses, so a test can play at 60 Hz or deliver
// one late frame.
function manualFrames() {
  const realRaf = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;
  let queue = new Map();
  let id = 0;
  window.requestAnimationFrame = (cb) => { queue.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => { queue.delete(i); };
  return {
    get pending() { return queue.size; },
    // Runs the frames asked for so far with timestamp ts, then lets the seek settle.
    async run(ts) {
      const cbs = Array.from(queue.values());
      queue = new Map();
      for (const cb of cbs) cb(ts);
      await tick(0);
    },
    restore() { window.requestAnimationFrame = realRaf; window.cancelAnimationFrame = realCancel; },
  };
}

// Plays frames 1000/hz ms apart from base until the clock asks for no more,
// at most `max` of them, and returns the store's time after each.
async function playAt(raf, store, base, hz, max) {
  const seen = [];
  for (let i = 1; i <= max && raf.pending; i++) {
    await raf.run(base + i * 1000 / hz);
    seen.push(store.time);
  }
  return seen;
}

describe(`clock (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('exposes the API and the kinetic store', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    for (const m of ['scene', 'seek', 'play', 'pause', 'config']) expect(typeof k[m]).toBe('function');
    expect(k.compat.hyperframes).toMatch(/^\d+\.\d+\.\d+$/);
    const store = wf.getStore('kinetic');
    expect(store).toBeTruthy();
    expect(typeof store.time).toBe('number');
    expect(store.fps).toBe(30);
    expect(store.playing).toBe(false);
  });

  it('seek writes time and the frame at the configured fps; bad arguments throw KN-100', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    wf.kinetic.seek(1.5);
    expect(store.time).toBe(1.5);
    expect(store.frame).toBe(45);
    wf.kinetic.config({ fps: 60 });
    expect(store.fps).toBe(60);
    wf.kinetic.seek(1.5);
    expect(store.frame).toBe(90);
    wf.kinetic.seek(-2);
    expect(store.time).toBe(0);
    expect(() => wf.kinetic.seek('1')).toThrow(/KN-100/);
    expect(() => wf.kinetic.config({ fps: 0 })).toThrow(/KN-100/);
    expect(() => wf.kinetic.config({ channel: 'gsap' })).toThrow(/KN-100/);
    expect(() => wf.kinetic.config(null)).toThrow(/KN-100/);
    wf.kinetic.config({ fps: 30 });
  });

  it('config({ fps }) rejects Infinity and NaN with KN-100 and keeps the fps it had', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    for (const fps of [Infinity, NaN]) {
      let err = null;
      try { wf.kinetic.config({ fps }); } catch (e) { err = e; }
      expectKN(err, 'KN-100', 'config({ fps })', 'fps is a finite number above 0, not ' + fps);
      expect(store.fps).toBe(30);
      expect(wf.kinetic.config().fps).toBe(30);
    }
    // The shutter's angle check already refuses a non-finite angle.
    expect(() => wf.kinetic.config({ shutter: Infinity })).toThrow(/KN-100/);
    expect(() => wf.kinetic.config({ shutter: { angle: NaN } })).toThrow(/KN-100/);
  });

  it('config() reports the settings', async () => {
    const { wf } = await load();
    const c = wf.kinetic.config();
    expect(c).toEqual({ fps: 30, channel: 'event', autoplay: false, preview: false, loop: { hold: 3 }, fit: false, sound: true, shutter: false, finish: false, mode: 'auto' });
  });

  it('config() rejects an unknown option with KN-100, naming it and the known ones, and applies nothing', async () => {
    const { wf } = await load();
    const before = wf.kinetic.config();
    let err = null;
    try { wf.kinetic.config({ fps: 50, lop: false }); } catch (e) { err = e; }
    // The option is in the where on every build; the known ones are in the development sentence.
    expectKN(err, 'KN-100', 'config({ lop })', /^'lop' is not an option; the options are /);
    if (BUILD === 'dev') for (const k of ['fps', 'channel', 'autoplay', 'preview', 'loop']) expect(err.message).toContain(k);
    expect(wf.kinetic.config()).toEqual(before);
    expect(wf.getStore('kinetic').fps).toBe(before.fps);
  });

  it('config({ loop: false }): the standalone clock stops on the last frame, sets playing false, and play() there starts again from 0', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="noloop-root" data-start="0" data-duration="1" data-fps="30" data-no-timeline></div>');
    cleanup.push(host);
    const raf = manualFrames();
    try {
      expect(wf.kinetic.config({ loop: false }).loop).toBe(false);
      wf.kinetic.seek(0.9);
      const base = performance.now();
      wf.kinetic.play();
      const seen = await playAt(raf, store, base, 60, 20);
      expect(store.playing).toBe(false);
      expect(raf.pending).toBe(0);
      expect(store.time).toBe(29 / 30);
      expect(store.frame).toBe(29);
      expect(Math.max(...seen)).toBe(29 / 30);
      // Play on the last frame starts again from 0, as a video element does at its end.
      wf.kinetic.play();
      expect(store.time).toBe(0);
      expect(store.playing).toBe(true);
    } finally {
      wf.kinetic.pause();
      raf.restore();
      wf.kinetic.config({ loop: true });
    }
  });

  it('play({ from, to }) seeks to from, plays, and at 60 Hz holds on the last frame before to', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="range-root" data-start="0" data-duration="10" data-fps="30" data-no-timeline></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    try {
      wf.kinetic.seek(5);
      const base = performance.now();
      wf.kinetic.play({ from: 1, to: 2 });
      expect(store.time).toBe(1);
      expect(store.playing).toBe(true);
      const seen = await playAt(raf, store, base, 60, 120);
      expect(seen.length).toBeGreaterThan(50);       // it played through, frame by frame
      expect(store.playing).toBe(false);
      expect(raf.pending).toBe(0);
      expect(store.time).toBe(59 / 30);
      expect(store.time).toBeCloseTo(2 - 1 / 30, 12);
      expect(store.frame).toBe(59);
      expect(Math.max(...seen)).toBe(59 / 30);
    } finally {
      raf.restore();
    }
  });

  it('play({ from, to }) still ends on the last frame before to when a slow frame overshoots to', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="slow-root" data-start="0" data-duration="10" data-fps="30" data-no-timeline></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    try {
      const base = performance.now();
      wf.kinetic.play({ from: 1, to: 2 });
      await raf.run(base + 400);
      expect(store.time).toBeGreaterThan(1.3);
      expect(store.time).toBeLessThan(1.5);
      expect(store.playing).toBe(true);
      await raf.run(base + 1750);                     // a frame that arrives 0.75 s past to
      expect(store.time).toBe(59 / 30);
      expect(store.playing).toBe(false);
      expect(raf.pending).toBe(0);
    } finally {
      raf.restore();
    }
  });

  it('play({ to }) starts from the current time, play({ from }) holds on the composition\'s last frame, also with loop on', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="defaults-root" data-start="0" data-duration="1" data-fps="30" data-no-timeline></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    expect(wf.kinetic.config().loop).toEqual({ hold: 3 });
    const raf = manualFrames();
    try {
      wf.kinetic.seek(0.5);
      let base = performance.now();
      wf.kinetic.play({ to: 0.6 });
      expect(store.time).toBe(0.5);
      await raf.run(base + 200);
      expect(store.time).toBe(17 / 30);
      expect(store.playing).toBe(false);
      base = performance.now();
      wf.kinetic.play({ from: 0.9 });
      expect(store.time).toBe(0.9);
      await playAt(raf, store, base, 60, 20);
      expect(store.time).toBe(29 / 30);
      expect(store.playing).toBe(false);
      expect(raf.pending).toBe(0);
    } finally {
      raf.restore();
    }
  });

  it('play() with a bad range throws KN-100 and does not start the clock', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    wf.kinetic.config({});                     // no root on the page: no duration
    expect(() => wf.kinetic.play(5)).toThrow(/KN-100/);
    expect(() => wf.kinetic.play({ from: '1', to: 2 })).toThrow(/KN-100/);
    expect(() => wf.kinetic.play({ from: 0, to: NaN })).toThrow(/KN-100/);
    expect(() => wf.kinetic.play({ from: 2, to: 1 })).toThrow(/KN-100/);
    expectKN(() => wf.kinetic.play({ from: 0 }), 'KN-100', 'play({ from }): data-duration', /duration/);
    expectKN(() => wf.kinetic.play(5), 'KN-100', 'play(range)', /^the argument is an object of seconds/);
    expectKN(() => wf.kinetic.play({ from: '1', to: 2 }), 'KN-100', 'play({ from })', /^from is a number of seconds/);
    expect(store.playing).toBe(false);
  });

  it('play({ from, to }) with a runtime player: renderSeek(from) and play(), and the first frame past the hold is held, then the player paused and sought to it', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    let playing = false;
    const calls = [];
    window.__player = {
      renderSeek(t) { calls.push(['renderSeek', t]); dispatchSeek(t); },
      play() { calls.push(['play']); playing = true; },
      pause() { calls.push(['pause']); playing = false; },
      isPlaying() { return playing; },
      getDuration() { return 10; },
    };
    const host = await mount('<div data-composition-id="player-range-root" data-start="0" data-duration="10" data-fps="30" data-no-timeline></div>');
    cleanup.push(host);
    wf.kinetic.play({ from: 1, to: 2 });
    expect(calls).toEqual([['renderSeek', 1], ['play']]);
    expect(store.time).toBe(1);
    expect(store.playing).toBe(true);
    dispatchSeek(1.5);
    expect(store.time).toBe(1.5);
    dispatchSeek(2.02);                       // the player's next frame passes to
    expect(store.time).toBe(59 / 30);
    await tick(0);
    expect(calls.slice(2)).toEqual([['pause'], ['renderSeek', 59 / 30]]);
    expect(store.playing).toBe(false);
    expect(store.time).toBe(59 / 30);
    // Paused, a later seek is the person's own and is not held.
    dispatchSeek(3);
    expect(store.time).toBe(3);
  });

  it('a $kinetic.time binding follows a seek', async () => {
    const { wf } = await load();
    const name = uniqueName('plain');
    wf.component(name, {});
    const host = await mount(`<div data-component="${name}"><b class="t" data-bind="$kinetic.time"></b></div>`);
    cleanup.push(host);
    wf.kinetic.seek(2.25);
    await tick(0);
    expect(host.querySelector('.t').textContent).toBe('2.25');
  });

  it('hf-seek: the store takes the time and waitUntil is handed a promise synchronously', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const name = uniqueName('plain');
    wf.component(name, {});
    const host = await mount(`<div data-component="${name}"><b class="t" data-bind="$kinetic.time"></b></div>`);
    cleanup.push(host);
    const { pending, done } = dispatchSeek(0.75);
    expect(store.time).toBe(0.75);
    expect(pending.length).toBe(1);
    expect(typeof pending[0].then).toBe('function');
    await done;
    // The barrier resolved after the flush: the DOM already holds the frame.
    expect(host.querySelector('.t').textContent).toBe('0.75');
  });

  it('hf-seek: shuffled seeks leave the same DOM for the same time', async () => {
    const { wf } = await load();
    const name = uniqueName('plain');
    wf.component(name, { computed: { w() { return { width: (wf.getStore('kinetic').time * 100) + 'px' }; } } });
    const host = await mount(`<div data-component="${name}"><i class="bar" data-bind-style="w"></i></div>`);
    cleanup.push(host);
    const snap = async (t) => { await dispatchSeek(t).done; return host.querySelector('.bar').style.width; };
    const a = {}; for (const t of [0.2, 1.4, 0.9]) a[t] = await snap(t);
    const b = {}; for (const t of [0.9, 0.2, 1.4]) b[t] = await snap(t);
    expect(b).toEqual(a);
    expect(a[1.4]).toBe('140px');
  });

  it('with a runtime player on the page, seek/play/pause go through it', async () => {
    const { wf } = await load();
    const calls = [];
    window.__player = {
      renderSeek(t) { calls.push(['renderSeek', t]); dispatchSeek(t); },
      play() { calls.push(['play']); },
      pause() { calls.push(['pause']); },
      getDuration() { return 9; },
    };
    wf.kinetic.seek(1.25);
    expect(calls).toEqual([['renderSeek', 1.25]]);
    expect(wf.getStore('kinetic').time).toBe(1.25);
    wf.kinetic.play();
    wf.kinetic.pause();
    expect(calls.slice(1)).toEqual([['play'], ['pause']]);
  });

  it("the standalone clock advances time with play() and stops with pause()", async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    wf.kinetic.seek(0);
    wf.kinetic.play();
    expect(store.playing).toBe(true);
    await frames(4);
    const moved = store.time;
    expect(moved).toBeGreaterThan(0);
    wf.kinetic.pause();
    expect(store.playing).toBe(false);
    await frames(3);
    expect(store.time).toBe(moved);
  });

  it('the standalone clock loops at the composition duration from the root', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="loop-root" data-start="0" data-duration="0.05" data-no-timeline></div>');
    cleanup.push(host);
    wf.kinetic.config({ loop: { hold: 0 } });     // re-reads the root
    try {
      expect(store.duration).toBe(0.05);
      wf.kinetic.seek(0);
      wf.kinetic.play();
      await tick(120);
      await frames(2);
      wf.kinetic.pause();
      expect(store.time).toBeLessThan(0.05);
    } finally {
      wf.kinetic.config({ loop: true });
    }
  });

  it('a loop holds the last frame for its hold, 3 s by default, then starts again from 0; none with the preview bar up; KN-100 for a bad loop', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="hold-root" data-start="0" data-duration="1" data-fps="30" data-no-timeline></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    try {
      wf.kinetic.seek(0.9);
      const base = performance.now();
      wf.kinetic.play();
      // Past the end: the last frame, still playing, for 3 s.
      await raf.run(base + 200);
      expect([store.time, store.playing]).toEqual([29 / 30, true]);
      await raf.run(base + 2900);
      expect([store.time, store.playing]).toEqual([29 / 30, true]);
      // Then from 0 again: 0.1 s to the end, 3 s of hold, 0.25 s in.
      await raf.run(base + 3350);
      expect(store.time).toBeGreaterThan(0.2);
      expect(store.time).toBeLessThan(0.3);
      wf.kinetic.pause();
      // A hold of its own.
      expect(wf.kinetic.config({ loop: { hold: 1 } }).loop).toEqual({ hold: 1 });
      wf.kinetic.seek(0.9);
      const b2 = performance.now();
      wf.kinetic.play();
      await raf.run(b2 + 1050);
      expect(store.time).toBe(29 / 30);
      await raf.run(b2 + 1250);
      expect(store.time).toBeLessThan(0.2);
      wf.kinetic.pause();
      // The preview bar up: no hold.
      wf.kinetic.config({ preview: true });
      wf.kinetic.seek(0.9);
      const b3 = performance.now();
      wf.kinetic.play();
      await raf.run(b3 + 200);
      expect(store.time).toBeLessThan(0.2);
      wf.kinetic.pause();
      wf.kinetic.config({ preview: false });
      for (const bad of [2, 'yes', null, { hold: -1 }, { hold: Infinity }, { wait: 1 }]) {
        let err = null;
        try { wf.kinetic.config({ loop: bad }); } catch (e) { err = e; }
        expectKN(err, 'KN-100', 'config({ loop })', /false, or \{ hold \}/);
      }
      expect(wf.kinetic.config().loop).toEqual({ hold: 1 });
    } finally {
      wf.kinetic.pause();
      raf.restore();
      wf.kinetic.config({ loop: true, preview: false });
    }
  });

  it('a click on a video page\'s composition pauses it and plays it again; not on its controls, outside it, or with the bar up', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="click-root" data-start="0" data-duration="4" data-fps="30" data-no-timeline><div class="art" style="width:100px;height:50px"></div><button type="button">Sound</button></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    const art = host.querySelector('.art'), button = host.querySelector('button');
    try {
      wf.kinetic.seek(0);
      wf.kinetic.play();
      const mark = () => document.querySelector('[data-kinetic-paused]');
      art.click();
      expect(store.playing).toBe(false);
      // Paused by the click: the pause mark over the stage's centre, beside the root, at once.
      const root = host.querySelector('[data-composition-id]');
      expect(mark()).toBeTruthy();
      expect(root.contains(mark())).toBe(false);
      expect(getComputedStyle(mark()).pointerEvents).toBe('none');
      const r = root.getBoundingClientRect(), m = mark().getBoundingClientRect();
      expect(Math.abs((m.left + m.right) / 2 - (r.left + r.right) / 2)).toBeLessThan(1);
      expect(Math.abs((m.top + m.bottom) / 2 - (r.top + r.bottom) / 2)).toBeLessThan(1);
      art.click();
      expect(store.playing).toBe(true);
      expect(mark()).toBeNull();
      // Paused by a call, no mark; paused by a click and played by a call, the mark goes.
      wf.kinetic.pause();
      expect(mark()).toBeNull();
      wf.kinetic.play();
      art.click();
      expect(mark()).toBeTruthy();
      wf.kinetic.play();
      expect(mark()).toBeNull();
      button.click();
      expect(store.playing).toBe(true);
      // Outside the root: nothing.
      document.body.click();
      expect(store.playing).toBe(true);
      wf.kinetic.config({ preview: true });
      art.click();
      expect(store.playing).toBe(true);
      wf.kinetic.config({ preview: false });
    } finally {
      wf.kinetic.pause();
      raf.restore();
      wf.kinetic.config({ preview: false });
    }
  });

  it('a click pauses a composition inside a focusable or data-action wrapper, and one made focusable itself; its own controls still do not', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const raf = manualFrames();
    try {
      for (const [open, close, rootAttrs] of [['<main tabindex="-1">', '</main>', ''], ['<div data-action="noop">', '</div>', ''], ['', '', ' tabindex="0"']]) {
        const host = await mount(open + '<div data-composition-id="click-wrapped" data-start="0" data-duration="4" data-fps="30" data-no-timeline' + rootAttrs + '><div class="art" style="width:100px;height:50px"></div><span tabindex="0">Knob</span></div>' + close);
        wf.kinetic.config({});
        wf.kinetic.seek(0);
        wf.kinetic.play();
        host.querySelector('[tabindex="0"]:not([data-composition-id])').click();
        expect(store.playing).toBe(true);
        host.querySelector('.art').click();
        expect(store.playing).toBe(false);
        host.querySelector('.art').click();
        expect(store.playing).toBe(true);
        wf.kinetic.pause();
        host.remove();
      }
    } finally {
      wf.kinetic.pause();
      raf.restore();
    }
  });

  it('a composition replaced while the page runs: ready() reads the new one\'s duration and fps', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const first = await mount('<div data-composition-id="swap-a" data-start="0" data-duration="4" data-fps="30" data-no-timeline></div>');
    wf.kinetic.config({});
    wf.kinetic.seek(0);
    expect(store.duration).toBe(4);
    first.remove();
    const second = await mount('<div data-composition-id="swap-b" data-start="0" data-duration="1" data-fps="24" data-no-timeline></div>');
    cleanup.push(second);
    await wf.kinetic.ready();
    expect(store.duration).toBe(1);
    expect(store.fps).toBe(24);
  });

  it('play({ from, to }) with to less than a frame after from holds at from, never a frame before it', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="short-range" data-start="0" data-duration="4" data-fps="30" data-no-timeline></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    try {
      wf.kinetic.play({ from: 2.99, to: 3 });
      const seen = await playAt(raf, store, 1000, 60, 20);
      expect(store.playing).toBe(false);
      for (const t of seen.concat(store.time)) expect(t, seen.join(',')).toBeGreaterThanOrEqual(2.99 - 1e-9);
    } finally {
      wf.kinetic.pause();
      raf.restore();
    }
  });

  it('a click\'s pause and play keeps the hold of play({ from, to })', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="click-hold" data-start="0" data-duration="4" data-fps="30" data-no-timeline><div class="art" style="width:100px;height:50px"></div></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    const art = host.querySelector('.art');
    try {
      wf.kinetic.play({ from: 0, to: 1 });
      await playAt(raf, store, 1000, 60, 20);
      art.click();
      expect(store.playing).toBe(false);
      art.click();
      expect(store.playing).toBe(true);
      await playAt(raf, store, 5000, 60, 200);
      expect(store.playing).toBe(false);
      expect(store.time).toBeCloseTo(29 / 30, 5);
    } finally {
      wf.kinetic.pause();
      raf.restore();
    }
  });

  it('a click that ends a drag, or leaves a text selection, does not pause; nor does one on an ARIA widget', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="click-drag" data-start="0" data-duration="4" data-fps="30" data-no-timeline><p class="art" style="width:200px;height:50px;margin:0">select me text</p><div role="slider" aria-valuenow="1" style="width:40px;height:20px"></div></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    const art = host.querySelector('.art');
    const at = (type, x, y) => art.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }));
    try {
      wf.kinetic.seek(0);
      wf.kinetic.play();
      art.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
      at('click', 60, 12);
      expect(store.playing, 'a drag').toBe(true);
      // A still click after it pauses as before.
      art.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
      at('click', 11, 10);
      expect(store.playing, 'a click').toBe(false);
      at('click', 11, 10);
      expect(store.playing).toBe(true);
      const range = document.createRange();
      range.setStart(art.firstChild, 0);
      range.setEnd(art.firstChild, 6);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      at('click', 11, 10);
      expect(store.playing, 'a selection').toBe(true);
      getSelection().removeAllRanges();
      host.querySelector('[role=slider]').click();
      expect(store.playing, 'a slider').toBe(true);
    } finally {
      getSelection().removeAllRanges();
      wf.kinetic.pause();
      raf.restore();
    }
  });

  it('Space or Enter on the focused root pauses and plays as a click does; the root is made focusable, one with its own tabindex keeps it, and keys on its controls do nothing', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="key-root" data-start="0" data-duration="4" data-fps="30" data-no-timeline><div class="art" style="width:100px;height:50px"></div><button type="button">Sound</button></div>');
    cleanup.push(host);
    wf.kinetic.config({});
    const raf = manualFrames();
    const root = host.querySelector('[data-composition-id]');
    const key = (el, k) => { const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
    try {
      wf.kinetic.seek(0);
      wf.kinetic.play();
      expect(root.tabIndex).toBe(0);
      root.focus();
      const space = key(root, ' ');
      expect(store.playing).toBe(false);
      expect(space.defaultPrevented, 'Space does not scroll the page').toBe(true);
      expect(document.querySelector('[data-kinetic-paused]')).toBeTruthy();
      key(root, 'Enter');
      expect(store.playing).toBe(true);
      key(root, 'a');
      expect(store.playing).toBe(true);
      key(host.querySelector('button'), ' ');
      expect(store.playing).toBe(true);
      wf.kinetic.config({ preview: true });
      key(root, ' ');
      expect(store.playing).toBe(true);
      wf.kinetic.config({ preview: false });
      host.remove();
      const own = await mount('<div data-composition-id="key-own" data-start="0" data-duration="4" data-fps="30" data-no-timeline tabindex="-1"></div>');
      cleanup.push(own);
      wf.kinetic.seek(0);
      expect(own.querySelector('[data-composition-id]').getAttribute('tabindex')).toBe('-1');
    } finally {
      wf.kinetic.pause();
      raf.restore();
      wf.kinetic.config({ preview: false });
    }
  });

  it("config({ channel: 'timeline' }) registers a timeline the runtime can drive, and hf-seek is then ignored", async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="tl-root" data-start="0" data-duration="6"></div>');
    cleanup.push(host);
    wf.kinetic.config({ channel: 'timeline' });
    const tl = window.__timelines['tl-root'];
    for (const m of ['play', 'pause', 'paused', 'seek', 'time', 'duration', 'add', 'set']) expect(typeof tl[m]).toBe('function');
    expect(tl.paused()).toBe(true);
    expect(tl.duration()).toBe(6);
    tl.seek(2.5);
    expect(store.time).toBe(2.5);
    expect(tl.time()).toBe(2.5);
    const { pending } = dispatchSeek(4);
    expect(pending.length).toBe(0);
    expect(store.time).toBe(2.5);
    wf.kinetic.config({ channel: 'event' });
    dispatchSeek(4);
    expect(store.time).toBe(4);
    // Back on the event channel, the registered timeline drives nothing.
    tl.seek(1.5);
    expect(store.time).toBe(4);
  });

  // A page that holds a clip on its last frame pauses from a watcher on the
  // clock's time. That watcher runs inside the loop's own seek, so the loop
  // must look again before it asks for the next frame.
  it('pause() from a watcher on the clock stops the standalone loop', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const name = uniqueName('clock-hold');
    let held = 0;
    wf.component(name, {
      subscribe: ['kinetic'],
      watch: {
        'store:kinetic.time'() {
          if (this.stores.kinetic.playing && this.stores.kinetic.time >= 0.05) { held++; wf.kinetic.pause(); }
        },
      },
    });
    const host = await mount('<div data-composition-id="hold-root" data-start="0" data-duration="10" data-no-timeline></div><div data-component="' + name + '"></div>');
    cleanup.push(host);
    wf.kinetic.seek(0);
    wf.kinetic.play();
    await tick(250);
    await frames(2);
    expect(store.playing).toBe(false);
    expect(held).toBe(1);
    const stopped = store.time;
    await tick(100);
    await frames(2);
    expect(store.time).toBe(stopped);
  });

  // The timestamp handed to the first animation frame after play() can be
  // earlier than the performance.now() that set the clock's origin, which
  // would show the frame before the one play() started from.
  it('play() never moves time backwards on its first frame', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const real = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => real.call(window, (ts) => cb(ts - 10));
    try {
      wf.kinetic.seek(5);
      wf.kinetic.play();
      await new Promise((r) => real.call(window, r));
      await frames(1);
      expect(store.time).toBeGreaterThanOrEqual(5);
    } finally {
      wf.kinetic.pause();
      window.requestAnimationFrame = real;
    }
  });
});
