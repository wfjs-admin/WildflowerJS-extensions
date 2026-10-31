/**
 * The guard watches a seek from its arrival to its after hooks: wall-clock
 * reads, timers and animation frames started by author code (KN-140,
 * KN-142), and the seek's cost (KN-170). Footage takes its own time to land
 * (a 1080p file with far keyframes takes 40 to 140 ms to seek), and the page
 * keeps running while it does. That wait is outside the guard's window: a
 * clip slow to seek draws no KN-170, and author code that runs meanwhile
 * draws no KN-140 or KN-142, while the barrier still waits for the frame.
 *
 * The test delays every 'seeked' of one clip by 40 ms and runs an interval
 * of its own, from before the seeks, that reads the clock and starts a timer
 * and an animation frame. Its own file, since each code warns once a page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, captureWarnings, dispatchSeek, FOOTAGE, shownFrame, BUILD, CORE_TIER } from './helpers.js';

// The page's own globals, taken before any seek wraps them.
const later = window.setTimeout.bind(window);
const every = window.setInterval.bind(window);
const stopEvery = window.clearInterval.bind(window);

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

describe(`footage and the guard (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a clip slow to seek draws no KN-170, and author code that runs while it lands draws no KN-140 or KN-142', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="fg" data-start="0" data-duration="4" data-fps="30" data-width="160" data-height="90" style="position:relative;width:160px;height:90px">
      <video id="v" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" muted playsinline style="position:absolute;left:0;top:0;width:160px;height:90px"></video>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const v = host.querySelector('#v');
    // Every 'seeked' listener on the clip hears the event 40 ms late.
    const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
    const late = new Map();
    v.addEventListener = function (type, fn, opts) {
      if (type !== 'seeked') return add.call(this, type, fn, opts);
      const w = (e) => later(() => fn.call(this, e), 40);
      late.set(fn, w);
      return add.call(this, type, w, opts);
    };
    v.removeEventListener = function (type, fn, opts) { return remove.call(this, type, (type === 'seeked' && late.get(fn)) || fn, opts); };
    let ran = 0;
    const id = every(() => {
      ran++;
      performance.now();
      setTimeout(() => {}, 0);
      requestAnimationFrame(() => {});
    }, 4);
    let lines;
    try {
      lines = await captureWarnings(async () => {
        await dispatchSeek(1).done;
        expect(shownFrame(v)).toBe(30);
        await dispatchSeek(2).done;
        expect(shownFrame(v)).toBe(60);
      });
    } finally {
      stopEvery(id);
      delete v.addEventListener;
      delete v.removeEventListener;
    }
    expect(ran, 'the interval ran while the clip landed').toBeGreaterThan(4);
    expect(lines.filter((l) => /^\[KN-1[47]\d\]/.test(l))).toEqual([]);
  });

  // After the test above, which expects no KN-170 on this page.
  it("KN-170 measures each seek on its own: a slow seek still lands with a fast seek's window closed meanwhile", async ({ skip }) => {
    if (BUILD !== 'dev') skip();
    const { wf } = await load();
    const busy = performance.now.bind(performance);
    wf.kinetic.scene('fg-slow', { seek(local) { if (Math.abs(local - 1) < 1e-6) { const until = busy() + 14; while (busy() < until) { /* a slow seek */ } } } });
    const host = await mount(`<div data-composition-id="fg2" data-start="0" data-duration="4" data-fps="30" style="position:relative;width:160px;height:90px">
      <div data-component="fg-slow" data-start="0" data-duration="4"></div>
      <video id="v2" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" muted playsinline style="position:absolute;left:0;top:0;width:160px;height:90px"></video>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const v = host.querySelector('#v2');
    const add = EventTarget.prototype.addEventListener;
    v.addEventListener = function (type, fn, opts) {
      return add.call(this, type, type === 'seeked' ? (e) => later(() => fn.call(this, e), 120) : fn, opts);
    };
    let lines;
    try {
      lines = await captureWarnings(async () => {
        const a = dispatchSeek(1).done;               // slow window, then a long wait for its frame
        await new Promise((r) => later(r, 40));
        const b = dispatchSeek(2).done;               // a fast window while the first still waits
        await Promise.all([a, b]);
      });
    } finally {
      delete v.addEventListener;
    }
    expect(lines.filter((l) => l.startsWith('[KN-170]')).length, lines.join(' || ')).toBe(1);
  });
});
