/**
 * Interactive mode: the two modes, steps and their holds, next(), back() and go(),
 * and the diagnostics that change with the mode. The scripts are in
 * script.test.js, followers in follow.test.js, and the sine lesson and the
 * pages that load with steps in lesson-page.test.js.
 *
 * The standalone clock's frames and performance.now() are the test's here
 * (manualFrames), so a step plays to its hold in as many frames as the test
 * runs.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, expectKN, captureWarnings, manualFrames, dispatchSeek, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
let raf = null;
afterEach(async () => {
  const { wf } = await load();
  if (raf) { raf.restore(); raf = null; }
  wf.kinetic.pause();
  wf.kinetic.config({ mode: 'auto', preview: false });
  delete window.__HF_RENDER_CAPTURE_MODE;
  delete window.__renderReady;
  for (const el of cleanup.splice(0)) el.remove();
});

const codesIn = (lines) => lines.map((l) => (/^\[(KN-\d+)\]/.exec(l) || [])[1]).filter(Boolean);
const ids = (...names) => names.map((n) => uniqueName(n));

// A composition of `duration` seconds at 30 fps holding `inner`, in the page.
async function lesson(duration, inner) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${uniqueName('ls')}" data-no-timeline data-start="0" data-duration="${duration}" data-fps="30">${inner}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return host;
}
const section = (id, start, duration, attrs = '') => `<section id="${id}" data-step data-start="${start}"${duration === null ? '' : ' data-duration="' + duration + '"'}${attrs}></section>`;

// The last frame before t, as the clock holds on it.
const before = (t) => (Math.ceil(t * 30 - 1e-6) - 1) / 30;

// Plays the standalone clock at 60 Hz until it stops or `max` seconds pass.
async function playOut(max = 12) {
  const { wf } = await load();
  const s = wf.getStore('kinetic');
  for (let i = 0; i < max * 60 && s.playing; i++) await raf.run(raf.now + 1000 / 60);
  await tick(0);
}

// Runs the clock's frames, and tasks while it stands still, until it has
// stood still for a few tasks: the times it showed while it played.
async function playAll(max = 12) {
  const { wf } = await load();
  const s = wf.getStore('kinetic');
  const seen = [];
  let still = 0;
  for (let i = 0; i < max * 60 && still < 3; i++) {
    if (s.playing) { still = 0; await raf.run(raf.now + 1000 / 60); seen.push(s.time); }
    else { still++; await tick(0); }
  }
  return seen;
}

describe(`interactive mode: the modes (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('auto is interactive on a plain page and video with the preview bar or a render capturing; config({ mode }) overrides it, and config() reports it', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    expect(k.config().mode).toBe('auto');
    expect(s.mode).toBe('interactive');
    k.config({ preview: true });
    expect(s.mode).toBe('video');
    k.config({ mode: 'interactive' });
    expect(s.mode).toBe('interactive');
    expect(k.config().mode).toBe('interactive');
    k.config({ mode: 'auto', preview: false });
    expect(s.mode).toBe('interactive');
    k.config({ mode: 'video' });
    expect(s.mode).toBe('video');
    expect(k.config().mode).toBe('video');
    k.config({ mode: 'auto' });
    expect(s.mode).toBe('interactive');
    window.__HF_RENDER_CAPTURE_MODE = true;
    k.config({});
    expect(s.mode).toBe('video');
    delete window.__HF_RENDER_CAPTURE_MODE;
    k.config({});
    expect(s.mode).toBe('interactive');
  });

  it("KN-158: a page with steps that the preview bar alone put in video mode under 'auto' warns once (dev); a forced, set or runtime video mode does not", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    const host = await lesson(6, section(a, 0, 3) + section(b, a, 3));
    // Video mode set, forced by check(), or decided by a runtime: no word.
    let lines = await captureWarnings(async () => {
      k.config({ mode: 'video' });
      k.config({ mode: 'auto' });
      await k.check({ samples: 2 });
      window.__renderReady = false;
      await dispatchSeek(0.5).done;
      delete window.__renderReady;
      k.config({});
    });
    expect(codesIn(lines)).not.toContain('KN-158');
    expect(s.mode).toBe('interactive');
    // The bar under 'auto': video mode, and once in development.
    lines = await captureWarnings(async () => {
      k.config({ preview: true });
      k.seek(1);
      k.config({ preview: false });
      k.config({ preview: true });
      k.seek(2);
    });
    expect(s.mode).toBe('video');
    const id = host.firstElementChild.getAttribute('data-composition-id');
    if (BUILD === 'min') expect(codesIn(lines)).toEqual([]);
    else {
      expect(codesIn(lines).filter((c) => c === 'KN-158')).toEqual(['KN-158']);
      const line = lines.find((l) => l.startsWith('[KN-158]'));
      expect(line).toBe('[KN-158] the composition div[data-composition-id="' + id + "\"] has steps, and the preview bar put it in video mode, as config({ mode: 'auto' }) does with the bar up; a lesson in video mode plays as a video, so its steps never hold and its controls stop working");
      expect(lines[lines.indexOf(line) + 1]).toBe("  ↳ Suggestion: For the lesson, remove data-preview from the script tag (or ?preview from the URL), or call wildflower.kinetic.config({ mode: 'interactive' }) to keep the bar.");
    }
    // Interactive mode with the bar up keeps the lesson.
    k.config({ mode: 'interactive' });
    expect(s.mode).toBe('interactive');
  });

  it('a page with the HyperFrames runtime is in video mode whatever the setting, from the first seek after it arrives', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    await lesson(4, '');
    k.config({ mode: 'interactive' });
    expect(s.mode).toBe('interactive');
    window.__renderReady = false;
    await dispatchSeek(0.5).done;
    expect(s.mode).toBe('video');
    delete window.__renderReady;
    k.config({});
    expect(s.mode).toBe('interactive');
  });

  it('config({ mode }) takes auto, interactive or video, and anything else is KN-100 with nothing applied', async () => {
    const { wf } = await load();
    const before = wf.kinetic.config();
    expectKN(() => wf.kinetic.config({ mode: 'show', fps: 50 }), 'KN-100', 'config({ mode })', /^mode is 'auto'/);
    expect(wf.kinetic.config()).toEqual(before);
  });

  it('$kinetic.mode is reactive', async () => {
    const { wf } = await load();
    const name = uniqueName('modes');
    wf.component(name, { subscribe: ['kinetic'], computed: { upper() { return this.stores.kinetic.mode.toUpperCase(); } } });
    const host = await lesson(4, `<div data-component="${name}"><b class="m" data-bind="$kinetic.mode"></b><i class="u" data-bind="upper"></i></div>`);
    const read = () => host.querySelector('.m').textContent + ' ' + host.querySelector('.u').textContent;
    expect(read()).toBe('interactive INTERACTIVE');
    wf.kinetic.config({ mode: 'video' });
    await tick(0);
    expect(read()).toBe('video VIDEO');
    wf.kinetic.config({ mode: 'auto' });
    await tick(0);
    expect(read()).toBe('interactive INTERACTIVE');
  });

  it("watching it as a video keeps the learner's values aside while the scripts write, and switching back puts them back", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const P = uniqueName('wv');
    wf.store(P, { state: { angle: 30, choice: null, other: 5 } });
    const st = wf.getStore(P);
    const [a, b] = ids('a', 'b');
    k.step(a, { script: { [P + '.angle']: { at: [0, 2], to: [0, 100] } } });
    k.step(b, { script: { [P + '.choice']: { at: [0, 1], set: [null, 270] } } });
    await lesson(8, section(a, 0, 4) + section(b, a, 4));
    st.angle = 77; st.choice = 90; st.other = 6;
    // Interactive mode: the scripts are not applied.
    k.seek(1);
    expect([st.angle, st.choice]).toEqual([77, 90]);
    k.config({ mode: 'video' });
    expect(s.mode).toBe('video');
    // The scripts' values at the clock's time, with no seek; before b, the
    // choice is its script's first value.
    expect([st.angle, st.choice]).toEqual([50, null]);
    k.seek(5.5);
    expect([st.angle, st.choice, st.other]).toEqual([100, 270, 6]);
    k.config({ mode: 'interactive' });
    expect(s.mode).toBe('interactive');
    expect([st.angle, st.choice, st.other]).toEqual([77, 90, 6]);
  });

  it("check() runs in video mode; afterwards it seeks back still in video mode, puts the learner's values back, then goes back to interactive", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const P = uniqueName('ck');
    wf.store(P, { state: { angle: 30 } });
    const st = wf.getStore(P);
    const [a] = ids('a');
    k.step(a, { script: { [P + '.angle']: { at: [0, 2], to: [0, 100] } } });
    const name = uniqueName('scene');
    const modes = new Set();
    k.scene(name, { subscribe: [P], computed: { text() { return String(this.stores[P].angle); } }, seek() { modes.add(this.stores.kinetic.mode); } });
    await lesson(4, section(a, 0, 4) + `<div data-component="${name}" data-start="0" data-duration="4"><b data-bind="text"></b></div>`);
    k.seek(1);
    st.angle = 77;
    const log = [];
    const offs = [s.subscribe('mode', (v) => log.push('mode ' + v)), st.subscribe('angle', (v) => log.push('angle ' + v + ' ' + s.mode + ' ' + s.time))];
    modes.clear();
    let r;
    try { r = await k.check({ samples: 8 }); } finally { offs.forEach((f) => f()); }
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect([...modes]).toEqual(['video']);
    expect(log[0]).toBe('mode video');
    expect(log.slice(-2)).toEqual(['angle 77 video 1', 'mode interactive']);
    expect([st.angle, s.mode, s.time]).toEqual([77, 'interactive', 1]);
  });

  it("a scene's state changed while the clock stands still seeks the time again in interactive mode, once for a frame's changes, and not in video mode", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const name = uniqueName('knob');
    const seen = [];
    k.scene(name, { state: { n: 0 }, bump() { this.n++; this.n++; }, seek(local) { seen.push([this.n, local]); } });
    const host = await lesson(4, `<div data-component="${name}" data-start="0" data-duration="4"><button data-action="bump"></button></div>`);
    const frames = async () => { for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); await tick(0); };
    k.seek(1);
    await frames();
    expect(s.playing).toBe(false);
    // A seek at rest runs seek(local) once and asks for no second one.
    seen.length = 0;
    k.seek(1.5);
    await frames();
    expect(seen).toEqual([[0, 1.5]]);
    // Two writes in one action: one seek, at the same time, with the new state.
    seen.length = 0;
    host.querySelector('button').click();
    await frames();
    expect(seen).toEqual([[2, 1.5]]);
    expect(s.time).toBe(1.5);
    k.config({ mode: 'video' });
    seen.length = 0;
    host.querySelector('button').click();
    await frames();
    expect(seen).toEqual([]);
  });

  it("a seek(local) that writes a new object or array to the scene's state asks for no seek again, while the learner's changes still do", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const name = uniqueName('echo');
    const seen = [];
    k.scene(name, {
      state: { n: 0, pt: { x: 0 }, rows: [] },
      bump() { this.n++; },
      seek(local) { seen.push([this.n, local]); this.pt = { x: local }; this.rows = [local, this.n]; },
    });
    const host = await lesson(4, `<div data-component="${name}" data-start="0" data-duration="4"><span data-bind="pt.x"></span><button data-action="bump"></button></div>`);
    const frames = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); await tick(0); };
    k.seek(1);
    await frames();
    expect(s.playing).toBe(false);
    seen.length = 0;
    k.seek(1.5);
    await frames();
    expect(seen).toEqual([[0, 1.5]]);
    seen.length = 0;
    host.querySelector('button').click();
    await frames();
    expect(seen).toEqual([[1, 1.5]]);
  });

  it("a scene's tick(dt) runs on the page's frame loop in interactive mode only, never in video mode or while check() runs; KN-151 is silent on the interactive page and says so once when check() runs it (dev)", async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.pools === false) skip();   // nano and mini have no frame loop, so no tick()
    const k = wf.kinetic;
    const name = uniqueName('live');
    const ticks = [], during = [];
    let checking = false;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Defined, mounted and ticking in interactive mode: nothing to say.
    const quiet = await captureWarnings(async () => {
      k.scene(name, {
        tick(dt) { ticks.push({ dt, mode: this.stores.kinetic.mode }); },
        // The ticks so far, at each of check()'s seeks.
        seek() { if (checking && this.stores.kinetic.mode === 'video') during.push(ticks.length); },
      });
      await lesson(4, `<div data-component="${name}" data-start="0" data-duration="4"></div>`);
      k.config({ mode: 'interactive' });
      await wait(150);
      k.seek(1);
      await wait(50);
    });
    expect(codesIn(quiet).filter((c) => c === 'KN-151')).toEqual([]);
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks.every((t) => t.mode === 'interactive' && typeof t.dt === 'number')).toBe(true);
    ticks.length = 0;
    checking = true;
    let r;
    const lines = await captureWarnings(async () => {
      try { r = await k.check({ samples: 20 }); } finally { checking = false; }
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    // check()'s seeks span frames, and none of them ticked.
    expect(during.length).toBeGreaterThan(20);
    expect(new Set(during).size).toBe(1);
    // check() makes no video, so KN-151 stays quiet through it (check() also
    // reads the steps other tests defined, KN-157; only KN-151 is this test's).
    expect(codesIn(lines).filter((c) => c === 'KN-151')).toEqual([]);
    // Video mode does name it, once: a second check() then says nothing more.
    const again = await captureWarnings(async () => {
      k.config({ mode: 'video' });
      ticks.length = 0;
      k.seek(2);
      await wait(150);
      await k.check({ samples: 4 });
    });
    expect(codesIn(again).filter((c) => c === 'KN-151')).toEqual(BUILD === 'dev' ? ['KN-151'] : []);
    if (BUILD === 'dev') expect(again.find((l) => l.includes('KN-151'))).toMatch(new RegExp("scene '" + name + "' defines tick\\(\\), and the page is in video mode"));
    expect(ticks.length).toBe(0);
    k.config({ mode: 'interactive' });
    await wait(150);
    expect(ticks.length).toBeGreaterThan(2);
  });

  it("KN-151: a scene with tick() on a page in video mode is named once, at the first seek (dev)", async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.pools === false) skip();
    const k = wf.kinetic;
    const name = uniqueName('vt');
    const lines = await captureWarnings(async () => {
      k.scene(name, { tick() {} });
      await lesson(4, `<div data-component="${name}" data-start="0" data-duration="4"></div>`);
      k.config({ mode: 'video' });
      k.seek(1);
      k.seek(2);
      await tick(0);
    });
    // This scene's lines only: a scene another test left live may be named too.
    expect(lines.filter((l) => l.includes('KN-151') && l.includes("scene '" + name + "'")).length).toBe(BUILD === 'dev' ? 1 : 0);
  });

  // The guide's recipe for motion while a step holds, on a lesson that is
  // also checked or rendered: tick() on a store, which KN-151 does not name.
  // A store's tick() runs in both modes, so the recipe reads the mode.
  it("a store's tick() runs in both modes and KN-151 names no store, so the recipe's mode and waiting test keeps its work to a held step in interactive mode", async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.pools === false) skip();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, world] = ids('sa', 'sb', 'world');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const calls = [], steps = [];
    wf.store(world, {
      state: { n: 0 },
      tick(dt) {
        const ks = wildflower.getStore('kinetic');
        calls.push(ks.mode);
        if (ks.mode === 'interactive' && ks.waiting) steps.push(dt);
      },
    });
    k.step(a, { wait: 0.2 });
    let lines;
    try {
      lines = await captureWarnings(async () => {
        await lesson(4, section(a, 0, 2) + section(b, a, 2));
        k.config({ mode: 'interactive' });
        k.go(a);
        await wait(500);
        expect(s.waiting).toBe(true);
        expect(steps.length).toBeGreaterThan(2);
        k.config({ mode: 'video' });
        await wait(50);
        calls.length = 0;
        steps.length = 0;
        k.seek(1);
        k.seek(3);
        await wait(150);
      });
    } finally {
      k.config({ mode: 'interactive' });
      wf.unregister(world);
    }
    expect(calls.length, 'the store ticked in video mode').toBeGreaterThan(2);
    expect(calls.every((m) => m === 'video')).toBe(true);
    expect(steps).toEqual([]);
    expect(codesIn(lines).filter((c) => c === 'KN-151')).toEqual([]);
  });

  // patterns.md, "A rate the learner controls": one rate function, summed
  // over the scripted settings in the video and advanced by a store's tick()
  // while the step holds on the page.
  it('a rate the learner controls: the video sums the scripted rate in seek(local), the same in any order; the page fills from the learner\'s setting while the step holds, then plays on; check() passes', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.pools === false) skip();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [fill, tank, view] = ids('fill', 'tank', 'tank-view');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const RATE = (tap) => tap * 0.08;
    const TAP = { at: [0, 1, 3.5], set: [0, 1, 3] };
    function levelAt(t) {
      let level = 0;
      for (let i = 0; i < TAP.at.length; i++) {
        const end = Math.min(t, i + 1 < TAP.at.length ? TAP.at[i + 1] : Infinity);
        if (end > TAP.at[i]) level += RATE(TAP.set[i]) * (end - TAP.at[i]);
      }
      return Math.min(level, 1);
    }
    wf.store(tank, {
      state: { tap: 0, level: 0 },
      computed: { full() { return this.level >= 1; } },
      tick(dt) {
        const ks = wildflower.getStore('kinetic');
        if (ks.mode !== 'interactive' || !ks.waiting || this.level >= 1) return;
        this.level = Math.min(1, this.level + RATE(this.tap) * Math.min(dt, 50) / 1000);
      },
    });
    k.step(fill, { wait: 1, until: tank + '.full', entry: { [tank + '.tap']: 0, [tank + '.level']: 0 }, script: { [tank + '.tap']: TAP } });
    k.scene(view, {
      subscribe: [tank, 'kinetic'],
      seek(local) { if (this.stores.kinetic.mode === 'video') this.stores[tank].level = levelAt(local); },
      computed: { water() { return { height: (400 * this.stores[tank].level).toFixed(1) }; } },
    });
    const t = wf.getStore(tank);
    let host, report;
    const lines = await captureWarnings(async () => {
      host = await lesson(8, section(fill, 0, 8) + `<div data-component="${view}" data-start="0" data-duration="8"><svg><rect width="10" data-bind-attr="water"></rect></svg></div>`);
      await k.ready();
      // The video: the scripted taps' sum at each time, visited in two orders.
      k.config({ mode: 'video' });
      const times = [0.5, 2, 5, 7.5];
      for (const order of [times, times.slice().reverse()]) {
        for (const at of order) {
          await dispatchSeek(at).done;
          expect([at, t.tap, t.level]).toEqual([at, at < 1 ? 0 : at < 3.5 ? 1 : 3, levelAt(at)]);
          expect(host.querySelector('rect').getAttribute('height')).toBe((400 * levelAt(at)).toFixed(1));
        }
      }
      report = await k.check({ samples: 12 });
      // The page: empty at the hold, then the learner's tap fills it.
      k.config({ mode: 'interactive' });
      k.go(fill);
      await wait(1300);
      expect([s.waiting, t.level]).toEqual([true, 0]);
      t.tap = 3;
      await wait(300);
      expect(t.level).toBeGreaterThan(0.02);
      expect(t.level).toBeLessThan(0.2);
      expect(s.waiting).toBe(true);
      // Nearly full: the rest fills, until is true, and the step plays on.
      t.level = 0.99;
      await wait(400);
      expect(t.full).toBe(true);
      expect(s.time).toBeGreaterThan(1);
    });
    k.pause();
    wf.unregister(view);
    wf.unregister(tank);
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(codesIn(lines).filter((c) => c !== 'KN-157'), lines.join(' || ')).toEqual([]);
  });
});

describe(`interactive mode: steps (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("reads the steps by start, each named by its id; a range runs to the next step's start and the last one's to its own end, and the store follows the time in both modes", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, c] = ids('a', 'b', 'c');
    // c is timed from b and written before it.
    await lesson(10, section(a, 0, 2) + section(c, b, 2) + section(b, 3, 3));
    const at = (t) => { k.seek(t); return [s.step, s.stepIndex, s.stepStart, s.stepLength, s.stepCount]; };
    expect(at(0)).toEqual([a, 0, 0, 3, 3]);
    // Past a's own clip, still in its range.
    expect(at(2.5)).toEqual([a, 0, 0, 3, 3]);
    expect(at(3)).toEqual([b, 1, 3, 3, 3]);
    expect(at(6.5)).toEqual([c, 2, 6, 2, 3]);
    // Past the last step's end.
    expect(at(9)).toEqual(['', -1, 0, 0, 3]);
    k.config({ mode: 'video' });
    expect(at(4)).toEqual([b, 1, 3, 3, 3]);
  });

  it("writes the step fields inside the seek's batch: seek(local) and the first flush of a seek that crosses a step see the new step", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [a, b] = ids('a', 'b');
    const name = uniqueName('scene');
    const seen = [];
    k.scene(name, {
      computed: { pair() { const ks = this.stores.kinetic; seen.push(ks.time + ' ' + ks.step); return ks.step; } },
      seek() { const ks = this.stores.kinetic; seen.push(ks.time + ' ' + ks.step); },
    });
    await lesson(4, section(a, 0, 2) + section(b, a, 2) + `<div data-component="${name}" data-start="0" data-duration="4"><b data-bind="pair"></b></div>`);
    seen.length = 0;
    for (const t of [1, 3, 1.5, 2, 0.2]) { k.seek(t); await tick(0); }
    expect(seen.length).toBeGreaterThan(8);
    for (const e of seen) {
      const [t, id] = e.split(' ');
      expect(id, e).toBe(Number(t) < 2 ? a : b);
    }
  });

  it('keeps the step table between seeks, on a page with steps or none, and works it out again for a step added before a seek in the same task', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const real = Element.prototype.querySelectorAll;
    let reads = 0;
    Element.prototype.querySelectorAll = function (sel) { if (sel === '[data-step]') reads++; return real.call(this, sel); };
    try {
      await lesson(4, '<div data-start="0" data-duration="4"></div>');
      k.seek(0.5);
      reads = 0;
      for (let i = 0; i < 20; i++) k.seek(i / 10);
      expect(reads).toBe(0);
      for (const el of cleanup.splice(0)) el.remove();
      const [a, b] = ids('a', 'b');
      const host = await lesson(4, section(a, 0, 2));
      k.seek(0.5);
      expect(s.stepCount).toBe(1);
      reads = 0;
      for (let i = 0; i < 20; i++) k.seek(i / 10);
      expect(reads).toBe(0);
      host.firstElementChild.insertAdjacentHTML('beforeend', section(b, a, 2));
      k.seek(3);
      expect([s.stepCount, s.step]).toEqual([2, b]);
    } finally {
      Element.prototype.querySelectorAll = real;
    }
  });

  it('works the table out again when the timing epoch changes: a step timed from footage moves once the file gives its length', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [v, s1, s2] = ids('v', 's1', 's2');
    await lesson(8, `<video id="${v}" data-start="0" src="/packages/kinetic/test/fixtures/f30.webm" preload="none" muted playsinline></video>` + section(s1, 0, 1) + section(s2, v, 2));
    // Before the file's length is known, s2 starts with s1, and as the later
    // of two steps that start together it holds the time.
    k.seek(0.5);
    expect(s.step).toBe(s2);
    await k.ready();
    k.seek(0.5);
    expect(s.step).toBe(s1);
    k.seek(4.5);
    expect(s.step).toBe(s2);
    expect(s.stepStart).toBeGreaterThan(3.9);
  });

  it('go() plays the step from its start and holds on the last frame before start + wait; waiting turns true once the hold has settled, and kinetic:step comes once the entering seek has', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 1 });
    const host = await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    const events = [];
    const on = (e) => {
      events.push([e.detail.step, e.detail.index, s.time, host.querySelector('#' + e.detail.step).style.visibility]);
      // Outside the guard's window: no KN-142 for this.
      setTimeout(() => {}, 0);
    };
    document.addEventListener('kinetic:step', on);
    let lines;
    try {
      lines = await captureWarnings(async () => {
        k.go(a);
        expect([s.step, s.time, s.playing, s.waiting]).toEqual([a, 0, true, false]);
        await tick(0);
        expect(events).toEqual([ [a, 0, 0, 'visible'] ]);
        await raf.run(raf.now + 500);
        expect(s.time).toBeCloseTo(0.5, 9);
        expect(s.waiting).toBe(false);
        await raf.run(raf.now + 600);
        expect([s.time, s.playing]).toEqual([before(1), false]);
        expect(s.waiting).toBe(true);
        expect(raf.pending).toBe(0);
      });
    } finally {
      document.removeEventListener('kinetic:step', on);
    }
    expect(codesIn(lines)).not.toContain('KN-142');
  });

  it('Next is ready when nothing is left to do, and next() enters the next step at once from the play-in or a hold before the end, with its entry values; on the last step it does nothing', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const P = uniqueName('nx');
    wf.store(P, { state: { choice: 5 } });
    const st = wf.getStore(P);
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(a, { wait: 1 });
    k.step(b, { wait: 1, entry: { [P + '.choice']: null } });
    k.step(c, { wait: 1 });
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    raf = manualFrames();
    k.go(a);
    // The play-in: Next enabled, and next() enters the next step with its entry values.
    expect([s.step, s.playing, s.canAdvance]).toEqual([a, true, true]);
    await raf.run(raf.now + 300);
    k.next();
    expect([s.step, s.time, s.playing, st.choice]).toEqual([b, 3, true, null]);
    st.choice = 5;
    k.go(a);
    await playOut();
    // The hold before the end: Next enabled, and next() leaves the rest of a to the video.
    expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([a, before(1), true, true]);
    k.next();
    expect([s.step, s.time, s.playing, st.choice]).toEqual([b, 3, true, null]);
    await playOut();
    expect([s.step, s.time, s.canAdvance]).toEqual([b, before(4), true]);
    // A scrub to the end of b's range: next() enters c at once.
    k.seek(before(6));
    expect(s.canAdvance).toBe(true);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([c, 6, true]);
    await playOut();
    // The last step: next() does nothing, at its hold or at its end.
    expect([s.step, s.time, s.playing, s.canAdvance]).toEqual([c, before(7), false, true]);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([c, before(7), false]);
    k.seek(before(9));
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([c, before(9), false]);
  });

  it('a step that holds at the end of its range: next() at the hold enters the next step at once', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(a);
    expect(s.canAdvance).toBe(true);
    await playOut();
    expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([a, before(3), true, true]);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([b, 3, true]);
  });

  it('Back stays available during the play-in and the play-out; next() during a pause in the play-in enters the next step', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { ok: false } });
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(a, { wait: 1 });
    k.step(b, { wait: 1, until: Q + '.ok', entry: { [Q + '.ok']: false } });
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    raf = manualFrames();
    // Back during b's play-in.
    k.go(b);
    await raf.run(raf.now + 300);
    expect(s.canAdvance).toBe(false);
    k.back();
    expect([s.step, s.time, s.playing]).toEqual([a, 0, true]);
    await playOut();
    // Back during b's play-out, after its until.
    k.go(b);
    await playOut();
    wf.getStore(Q).ok = true;
    await tick(0);
    await tick(0);
    await raf.run(raf.now + 300);
    expect([s.step, s.playing, s.canAdvance]).toEqual([b, true, true]);
    k.back();
    expect([s.step, s.time, s.playing]).toEqual([a, 0, true]);
    // A pause during the play-in.
    await raf.run(raf.now + 300);
    k.pause();
    expect([s.step, s.playing, s.canAdvance]).toEqual([a, false, true]);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([b, 3, true]);
  });

  it('until holds the step until its path is truthy: canAdvance follows it, next() does nothing before, and the lesson plays the rest of the step from a task of its own and holds at its end until next()', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { choice: null }, computed: { answered() { return this.choice !== null; } } });
    const q = wf.getStore(Q);
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 0.5, until: Q + '.answered' });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    const entered = [];
    const on = (e) => entered.push([e.detail.step, s.time]);
    document.addEventListener('kinetic:step', on);
    try {
      k.go(a);
      expect(s.canAdvance).toBe(false);
      await playOut();
      expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([a, before(0.5), true, false]);
      k.next();
      expect(s.step).toBe(a);
      q.choice = 270;
      expect(s.canAdvance).toBe(true);
      // Not inside the write: from a task once it and its flush have finished.
      expect([s.step, s.playing]).toEqual([a, false]);
      await tick(0);
      await tick(0);
      // The rest of the step's range plays, from the hold to its last frame.
      expect([s.step, s.playing, s.waiting]).toEqual([a, true, false]);
      const seen = await playAll();
      expect(Math.min(...seen)).toBeGreaterThan(before(0.5));
      expect(Math.max(...seen)).toBe(before(3));
      expect([s.step, s.time, s.playing, s.waiting, s.canAdvance]).toEqual([a, before(3), false, true, true]);
      expect(entered.map((e) => e[0])).toEqual([a]);
      k.next();
      expect([s.step, s.time, s.playing]).toEqual([b, 3, true]);
      await tick(0);
      expect(entered.map((e) => e[0])).toEqual([a, b]);
    } finally {
      document.removeEventListener('kinetic:step', on);
    }
  });

  it('until on a step that holds at the end of its range: once it is truthy, Next is ready, and the step stays until next()', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { ok: false } });
    const [a, b] = ids('a', 'b');
    k.step(a, { until: Q + '.ok' });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(a);
    await playOut();
    expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([a, before(3), true, false]);
    wf.getStore(Q).ok = true;
    await tick(0);
    await tick(0);
    expect([s.step, s.time, s.playing, s.waiting, s.canAdvance]).toEqual([a, before(3), false, true, true]);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([b, 3, true]);
  });

  it('during the play-out after until: canAdvance is true and next() enters the next step at once; the play-out holds at the step\'s end for Next, which until turned false disables until it is truthy again; Back and a seek are what they are anywhere in the step', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { ok: false } });
    const q = wf.getStore(Q);
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(a, { wait: 1 });
    k.step(b, { wait: 0.5, until: Q + '.ok' });
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    raf = manualFrames();
    const answer = async () => {
      k.go(b);
      await playOut();
      expect([s.step, s.time, s.waiting]).toEqual([b, before(3.5), true]);
      q.ok = true;
      await tick(0);
      await tick(0);
      expect([s.step, s.playing]).toEqual([b, true]);
      await raf.run(raf.now + 500);
      expect(s.time).toBeGreaterThan(3.9);
    };
    // next() during the play-out enters c at once.
    await answer();
    expect(s.canAdvance).toBe(true);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([c, 6, true]);
    // The play-out, left to play, holds at the step's end.
    q.ok = false;
    await answer();
    await playOut();
    await tick(0);
    await tick(0);
    expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([b, before(6), true, true]);
    // until turned false during the play-out: Next waits for it at the end.
    q.ok = false;
    await answer();
    q.ok = false;
    await playOut();
    await tick(0);
    await tick(0);
    expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([b, before(6), true, false]);
    q.ok = true;
    await tick(0);
    await tick(0);
    expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([b, before(6), true, true]);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([c, 6, true]);
    // Back during the play-out enters the step before, which holds as usual.
    q.ok = false;
    await answer();
    k.back();
    expect([s.step, s.time, s.playing]).toEqual([a, 0, true]);
    await playOut();
    await tick(0);
    await tick(0);
    expect([s.step, s.time, s.waiting]).toEqual([a, before(1), true]);
    // A seek during the play-out stops the clock where it lands, in the step.
    q.ok = false;
    await answer();
    k.seek(4.5);
    for (let i = 0; i < 5; i++) await tick(0);
    expect([s.step, s.time, s.playing]).toEqual([b, 4.5, false]);
  });

  it('video mode plays an until step straight through, with no hold and no wait for its path', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { ok: false } });
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 0.5, until: Q + '.ok' });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.config({ mode: 'video' });
    k.play({ from: 0 });
    const seen = [], adv = new Set();
    for (let i = 0; i < 800 && s.playing; i++) { await raf.run(raf.now + 1000 / 60); seen.push(s.time); adv.add(s.canAdvance); }
    expect([s.time, s.playing, s.waiting]).toEqual([before(6), false, false]);
    // canAdvance stays true in video mode, playing or not.
    expect([...adv]).toEqual([true]);
    // Each frame a sixtieth of a second after the one before: no hold at 0.5 s.
    for (let i = 1; i < seen.length; i++) expect(seen[i] - seen[i - 1]).toBeLessThan(0.02);
  });

  it('a store replaced under an until path at a hold: the new store is heard, and the lesson plays the rest of the step when its path turns truthy', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { ok: false } });
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 0.5, until: Q + '.ok' });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(a);
    await playOut();
    expect([s.step, s.waiting, s.canAdvance]).toEqual([a, true, false]);
    wf.unregister(Q);
    wf.store(Q, { state: { ok: false } });
    await tick(0);
    wf.getStore(Q).ok = true;
    expect(s.canAdvance).toBe(true);
    await tick(0);
    await tick(0);
    expect([s.step, s.playing]).toEqual([a, true]);
    await playAll();
    expect([s.step, s.time, s.waiting]).toEqual([a, before(3), true]);
  });

  it('an until already truthy at the hold plays the rest of the step, which holds at its end for Next; on the last step it holds at the end of the range, canAdvance following the path, with nothing to go on to', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { choice: 1 }, computed: { answered() { return this.choice !== null; } } });
    const q = wf.getStore(Q);
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 0.5, until: Q + '.answered' });
    k.step(b, { wait: 0.5, until: Q + '.answered' });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(a);
    // Truthy already: Next is ready through the play-in.
    expect(s.canAdvance).toBe(true);
    const seen = await playAll();
    expect(Math.max(...seen)).toBe(before(3));
    expect([s.step, s.time, s.playing, s.waiting, s.canAdvance]).toEqual([a, before(3), false, true, true]);
    k.next();
    expect([s.step, s.playing]).toEqual([b, true]);
    await playOut();
    await tick(0);
    await tick(0);
    // Held at 3.5 s with the path truthy: the rest of the last step plays.
    expect([s.step, s.time, s.playing, s.waiting]).toEqual([b, before(3.5), true, false]);
    await playOut();
    await tick(0);
    await tick(0);
    expect([s.step, s.time, s.waiting, s.canAdvance]).toEqual([b, before(6), true, true]);
    q.choice = null;
    expect(s.canAdvance).toBe(false);
    q.choice = 2;
    expect(s.canAdvance).toBe(true);
    await tick(0);
    await tick(0);
    expect([s.step, s.time]).toEqual([b, before(6)]);
  });

  it('back() enters the previous step from its start with its entry values, and does nothing at the first; go() takes an id or an index, and KN-100 names a step that is not there', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const P = uniqueName('bk');
    wf.store(P, { state: { choice: 5 } });
    const st = wf.getStore(P);
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 1, entry: { [P + '.choice']: 'a' } });
    k.step(b, { wait: 1 });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(1);
    expect([s.step, s.time, st.choice]).toEqual([b, 3, 5]);
    await raf.run(raf.now + 400);
    k.back();
    expect([s.step, s.time, s.playing, st.choice]).toEqual([a, 0, true, 'a']);
    st.choice = 7;
    await raf.run(raf.now + 200);
    const t = s.time;
    k.back();
    expect([s.step, s.time, st.choice]).toEqual([a, t, 7]);
    k.go(b);
    expect([s.step, s.time]).toEqual([b, 3]);
    expectKN(() => k.go('nope'), 'KN-100', "go('nope')", /no step/);
    expectKN(() => k.go(2), 'KN-100', 'go(2)', /no step/);
    expectKN(() => k.go(1.5), 'KN-100', 'go(1.5)', /no step/);
    expectKN(() => k.go({}), 'KN-100', 'go(step)', /an id or an index/);
  });

  it('in video mode next(), back() and go() move the clock to a step\'s start, and entry is not written', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const P = uniqueName('vm');
    wf.store(P, { state: { choice: 5 } });
    const st = wf.getStore(P);
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(b, { entry: { [P + '.choice']: null } });
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    k.config({ mode: 'video' });
    k.go(b);
    expect([s.step, s.time, s.playing, st.choice]).toEqual([b, 3, false, 5]);
    k.next();
    expect([s.step, s.time]).toEqual([c, 6]);
    k.next();
    expect([s.step, s.time]).toEqual([c, 6]);
    k.back();
    expect([s.step, s.time, st.choice]).toEqual([b, 3, 5]);
    k.seek(1);
    k.back();
    expect([s.step, s.time]).toEqual([a, 1]);
  });

  it('play() before the hold plays on to it, and at or past the hold plays the step again from its start', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 1 });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(a);
    await raf.run(raf.now + 300);
    k.pause();
    const t = s.time;
    expect(t).toBeCloseTo(0.3, 9);
    k.play();
    expect([s.time, s.playing]).toEqual([t, true]);
    await playOut();
    expect([s.time, s.waiting]).toEqual([before(1), true]);
    k.play();
    expect([s.step, s.time, s.playing, s.waiting]).toEqual([a, 0, true, false]);
    await playOut();
    expect([s.time, s.waiting]).toEqual([before(1), true]);
    // Seeked past the hold, inside the step: play() starts it again too.
    k.seek(2);
    k.play();
    expect([s.time, s.playing]).toEqual([0, true]);
  });

  it('a click on the stage pauses a step as it plays, with the pause mark, and a second click plays it on to its hold; at the hold a click does nothing', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 1 });
    const host = await lesson(6, '<div class="art" style="width:100px;height:50px"></div>' + section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    const art = host.querySelector('.art');
    const mark = () => document.querySelector('[data-kinetic-paused]');
    k.go(a);
    await raf.run(raf.now + 300);
    art.click();
    expect(s.playing).toBe(false);
    expect(mark()).toBeTruthy();
    art.click();
    expect(s.playing).toBe(true);
    expect(mark()).toBeNull();
    await playOut();
    expect([s.step, s.time, s.playing, s.waiting]).toEqual([a, before(1), false, true]);
    art.click();
    expect([s.time, s.playing, s.waiting]).toEqual([before(1), false, true]);
    expect(mark()).toBeNull();
  });

  it("a scene's state changing while the play-in is paused redraws the frame and keeps what the learner set, not the step's entry", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q'), name = uniqueName('scene');
    wf.store(Q, { state: { v: 0 } });
    const q = wf.getStore(Q);
    k.scene(name, { state: { hover: '' } });
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 1, entry: { [Q + '.v']: 0 } });
    const host = await lesson(6, `<div data-component="${name}"><div class="art" style="width:100px;height:50px"></div><input data-model="hover"></div>` + section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(a);
    await raf.run(raf.now + 300);
    q.v = 5;
    await tick(0);
    host.querySelector('.art').click();
    expect(s.playing).toBe(false);
    const input = host.querySelector('input');
    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    for (let i = 0; i < 4; i++) { await tick(0); await raf.run(raf.now + 16); }
    expect(q.v).toBe(5);
  });

  it("a pause during the play-out after until, by a call or a click, and a play go on to the step's end with the learner's answer kept", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { answer: 0 } });
    const q = wf.getStore(Q);
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 1, until: Q + '.answer', entry: { [Q + '.answer']: 0 } });
    const host = await lesson(6, '<div class="art" style="width:100px;height:50px"></div>' + section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    const art = host.querySelector('.art');
    for (const [pause, resume] of [[() => k.pause(), () => k.play()], [() => art.click(), () => art.click()]]) {
      k.go(a);
      await playOut();
      expect([s.step, s.time, s.waiting]).toEqual([a, before(1), true]);
      q.answer = 1;
      await tick(0);
      await tick(0);
      await raf.run(raf.now + 500);
      expect(s.playing).toBe(true);
      const t = s.time;
      expect(t).toBeGreaterThan(1.2);
      pause();
      expect(s.playing).toBe(false);
      resume();
      expect([s.step, s.playing, q.answer]).toEqual([a, true, 1]);
      expect(s.time).toBeCloseTo(t, 5);
      await playOut();
      await tick(0);
      await tick(0);
      expect([s.step, s.time, s.waiting, q.answer]).toEqual([a, before(3), true, 1]);
    }
  });

  it("a seek that lands in a step before its hold writes the step's entry, as entering does, and play() at or past the hold starts the step again with it; a seek at or past the hold, the playing clock's frames, a pause and play, and video mode write nothing", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const P = uniqueName('again');
    wf.store(P, { state: { count: 5 } });
    const st = wf.getStore(P);
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 1, entry: { [P + '.count']: 0 } });
    k.step(b, { wait: 1 });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    raf = manualFrames();
    k.go(a);
    await playOut();
    expect([s.step, s.waiting, st.count]).toEqual([a, true, 0]);
    // The learner's work at the hold; a scrub at or past the hold keeps it.
    st.count = 2;
    k.seek(before(1));
    k.seek(2.5);
    expect(st.count).toBe(2);
    // A scrub back before the hold: the step is done again.
    k.seek(0.5);
    expect([s.step, s.playing, st.count]).toEqual([a, false, 0]);
    // Played on from there, the frames write nothing over the learner's values.
    k.play();
    st.count = 3;
    await playOut();
    expect([s.waiting, st.count]).toEqual([true, 3]);
    // play() at the hold starts the step again, with its entry.
    k.play();
    expect([s.time, s.playing, st.count]).toEqual([0, true, 0]);
    // A pause and play before the hold, with no seek between, writes nothing.
    await raf.run(raf.now + 300);
    st.count = 4;
    k.pause();
    k.play();
    expect([s.playing, st.count]).toEqual([true, 4]);
    await playOut();
    // play() seeked past the hold, inside the step, starts it again with its entry.
    st.count = 6;
    k.seek(2);
    expect(st.count).toBe(6);
    k.play();
    expect([s.time, st.count]).toEqual([0, 0]);
    await playOut();
    // A step with no entry writes nothing, and from it a scrub back into a writes a's.
    st.count = 7;
    k.seek(3.2);
    expect([s.step, st.count]).toEqual([b, 7]);
    k.seek(0.2);
    expect([s.step, st.count]).toEqual([a, 0]);
    // Video mode writes no entry on a seek.
    k.config({ mode: 'video' });
    st.count = 8;
    k.seek(0.4);
    expect(st.count).toBe(8);
  });

  it("the default wait is the shorter of the range and the step's own clip, so the hold never shows the step hidden; a wait longer than the range holds on the range's last frame, with KN-157", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(b, { wait: 9 });
    let host;
    const lines = await captureWarnings(async () => {
      host = await lesson(10, section(a, 0, 2) + section(b, 4, 3) + section(c, 7, 3));
      await k.ready();
    });
    raf = manualFrames();
    k.go(a);
    await playOut();
    expect([s.time, s.waiting]).toEqual([before(2), true]);
    expect(host.querySelector('#' + a).style.visibility).toBe('visible');
    k.go(b);
    await playOut();
    expect([s.time, s.waiting, s.step]).toEqual([before(7), true, b]);
    const hit = lines.filter((l) => l.startsWith('[KN-157]') && l.includes(b));
    if (BUILD === 'dev') {
      expect(hit.length, lines.join('\n')).toBe(1);
      expect(hit[0]).toMatch(/wait/);
    } else expect(hit).toEqual([]);
  });

  it('wait: false plays the step and goes on to the next; a wait of 0 holds on the first frame', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(a, { wait: false });
    k.step(b, { wait: 0 });
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    raf = manualFrames();
    const entered = [];
    const on = (e) => entered.push(e.detail.step);
    document.addEventListener('kinetic:step', on);
    try {
      k.go(a);
      await playOut();
      await tick(0);
      await tick(0);
      expect([s.step, s.time, s.waiting, s.playing]).toEqual([b, 3, true, false]);
      expect(entered).toEqual([a, b]);
    } finally {
      document.removeEventListener('kinetic:step', on);
    }
  });

  it('a run of wait: false steps plays as one range: the time moves 1/60 s a frame through each boundary, and each step is entered (its entry, then kinetic:step) on the first frame inside it', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, c, q] = ids('a', 'b', 'c', 'q');
    const st = wf.store(q, { state: { mark: '' } });
    k.step(a, { wait: false, entry: { [q + '.mark']: 'a' } });
    k.step(b, { wait: false, entry: { [q + '.mark']: 'b' } });
    k.step(c, { entry: { [q + '.mark']: 'c' } });
    await lesson(4, section(a, 0, 1) + section(b, a, 1) + section(c, b, 2));
    raf = manualFrames();
    const entered = [];
    const on = (e) => entered.push(e.detail.step + ' ' + st.mark);
    document.addEventListener('kinetic:step', on);
    try {
      k.go(a);
      await tick(0);
      const rows = [];
      for (let i = 0; i < 300 && s.playing; i++) {
        await raf.run(raf.now + 1000 / 60);
        rows.push([s.time, st.mark, s.step]);
      }
      await tick(0);
      // Every frame before the hold is (n + 1) / 60, and the step's entry is
      // on that frame already.
      const off = [];
      rows.forEach(([t, mark, at], n) => {
        const want = (n + 1) / 60;
        if (want >= before(4) - 1e-6) return;
        const id = want < 1 - 1e-6 ? a : want < 2 - 1e-6 ? b : c;
        if (Math.abs(t - want) > 1e-6 || mark !== { [a]: 'a', [b]: 'b', [c]: 'c' }[id] || at !== id) off.push(n + ': ' + t.toFixed(4) + ' ' + mark + ' ' + at + ', not ' + want.toFixed(4));
      });
      expect(off.slice(0, 5)).toEqual([]);
      expect([s.step, s.time, s.waiting, s.playing]).toEqual([c, before(4), true, false]);
      expect(entered).toEqual([a + ' a', b + ' b', c + ' c']);
    } finally {
      document.removeEventListener('kinetic:step', on);
    }
  });

  it('two steps that start together are ordered as the document has them; the later one holds the time, and the earlier one, left with no range, is KN-118 in development', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, c] = ids('a', 'b', 'c');
    const lines = await captureWarnings(async () => {
      await lesson(6, section(b, 0, 3) + section(a, 0, 3) + section(c, 3, 3));
      k.config({ mode: 'video' });
      k.seek(1);
    });
    expect([s.step, s.stepIndex, s.stepCount]).toEqual([a, 1, 3]);
    k.go(0);
    expect([s.time, s.step]).toEqual([0, a]);
    k.go(b);
    expect(s.time).toBe(0);
    k.go(c);
    expect([s.step, s.stepIndex]).toEqual([c, 2]);
    const hits = lines.filter((l) => l.startsWith('[KN-118]'));
    if (BUILD !== 'dev') { expect(hits).toEqual([]); return; }
    expect(hits.length, lines.join('\n')).toBe(1);
    expect(hits[0]).toContain(b);
    expect(hits[0]).toContain(a);
    expect(hits[0]).toMatch(/together/);
  });

  it("a stay in video mode leaves no step behind: back in interactive mode, canAdvance, back() and play() follow the step at the clock's time", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const Q = uniqueName('q');
    wf.store(Q, { state: { choice: null }, computed: { answered() { return this.choice !== null; } } });
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(b, { wait: 0.5, until: Q + '.answered' });
    k.step(c, { wait: 2 });
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    raf = manualFrames();
    // Held at the question; the video, watched to the last step; back.
    k.go(b);
    await playOut();
    expect([s.step, s.waiting, s.canAdvance]).toEqual([b, true, false]);
    k.config({ mode: 'video' });
    k.seek(8.5);
    k.config({ mode: 'interactive' });
    expect([s.step, s.waiting, s.canAdvance]).toEqual([c, false, true]);
    k.back();
    expect([s.step, s.time]).toEqual([b, 3]);
    // Held at the question again; under 'auto', the preview bar up, a scrub,
    // and the bar closed.
    await playOut();
    expect([s.step, s.waiting]).toEqual([b, true]);
    k.config({ mode: 'auto' });
    k.config({ preview: true });
    expect(s.mode).toBe('video');
    k.seek(8.5);
    k.config({ preview: false });
    expect([s.mode, s.step, s.canAdvance]).toEqual(['interactive', c, true]);
    k.play();
    expect([s.step, s.time, s.playing]).toEqual([c, 6, true]);
  });

  it('next(), back(), go() and play() read the mode first, so a runtime that arrived since the last seek puts them in video mode', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(a, { wait: 0 });
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    raf = manualFrames();
    const entered = [];
    const on = (e) => entered.push(e.detail.step);
    document.addEventListener('kinetic:step', on);
    // The runtime arrives with no seek and no config() after it.
    const arrive = () => { delete window.__renderReady; k.config({}); expect(s.mode).toBe('interactive'); window.__renderReady = false; };
    try {
      k.seek(0);
      arrive();
      k.go(b);
      expect([s.mode, s.time, s.playing]).toEqual(['video', 3, false]);
      k.seek(0);
      arrive();
      k.next();
      expect([s.mode, s.time, s.playing]).toEqual(['video', 3, false]);
      arrive();
      k.back();
      expect([s.mode, s.time, s.playing]).toEqual(['video', 0, false]);
      arrive();
      k.play();
      await tick(0);
      expect(s.mode).toBe('video');
      expect(entered).toEqual([]);
    } finally {
      document.removeEventListener('kinetic:step', on);
    }
  });

  it("past the last step's end, next() does nothing, back() enters the last step, and play() plays on to the end and holds there", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    // An outro from 5 s to 8 s that belongs to no step.
    await lesson(8, section(a, 0, 3) + section(b, a, 2));
    raf = manualFrames();
    k.seek(6);
    expect([s.step, s.stepIndex]).toEqual(['', -1]);
    k.next();
    expect([s.time, s.playing]).toEqual([6, false]);
    k.back();
    expect([s.step, s.time, s.playing]).toEqual([b, 3, true]);
    k.seek(6);
    k.play();
    const seen = [];
    for (let i = 0; i < 400 && s.playing; i++) { await raf.run(raf.now + 1000 / 60); seen.push(s.time); }
    expect([s.time, s.playing]).toEqual([before(8), false]);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(6);
    // At the end, play() plays the last step again.
    k.play();
    expect([s.step, s.time, s.playing]).toEqual([b, 3, true]);
    k.pause();
    k.config({ mode: 'video' });
    k.seek(6);
    k.next();
    expect(s.time).toBe(6);
    k.back();
    expect([s.step, s.time]).toEqual([b, 3]);
  });

  it('a last step that runs past the composition holds on its last frame and reports the hold', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    await lesson(6, section(a, 0, 3) + section(b, a, 5));
    raf = manualFrames();
    k.go(b);
    await playOut();
    expect([s.step, s.time, s.playing, s.waiting]).toEqual([b, before(6), false, true]);
  });

  it('in video mode next() keeps a playing clock playing, and keeps the hold of play({ from, to }) so the video stops at its end', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b, c] = ids('a', 'b', 'c');
    await lesson(9, section(a, 0, 3) + section(b, a, 3) + section(c, b, 3));
    raf = manualFrames();
    k.config({ mode: 'video' });
    k.play({ from: 0 });
    await raf.run(raf.now + 500);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([b, 3, true]);
    const seen = [];
    for (let i = 0; i < 800 && s.playing; i++) { await raf.run(raf.now + 1000 / 60); seen.push(s.time); }
    expect([s.time, s.playing]).toEqual([before(9), false]);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(3);
  });

  it("works the table out again when an element a step's start names comes or goes, and when a footage clip it is timed from changes its rate or media start", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [intro, a, later, b, v, c] = ids('intro', 'a', 'later', 'b', 'v', 'c');
    const host = await lesson(10, `<div id="${intro}" data-start="0" data-duration="2"></div>` + section(a, intro, 2) + section(b, later, 2));
    const root = host.firstElementChild;
    k.seek(2.5);
    expect([s.step, s.stepStart]).toEqual([a, 2]);
    // #later does not exist yet, so b starts at 0, and a at 2 holds the time.
    root.insertAdjacentHTML('beforeend', `<div id="${later}" data-start="5" data-duration="1"></div>`);
    k.seek(6.5);
    expect([s.step, s.stepStart]).toEqual([b, 6]);
    root.querySelector('#' + intro).remove();
    k.seek(0.5);
    expect([s.step, s.stepStart]).toEqual([a, 0]);
    for (const el of cleanup.splice(0)) el.remove();
    // A step timed from footage with no length: it starts where the file ends.
    const h2 = await lesson(8, `<video id="${v}" data-start="0" src="/packages/kinetic/test/fixtures/f30.webm" muted playsinline></video>` + section(c, v, 6));
    await k.ready();
    k.seek(5);
    const full = s.stepStart;
    expect(full).toBeGreaterThan(3.9);
    h2.querySelector('video').setAttribute('data-playback-rate', '2');
    k.seek(5);
    expect(s.stepStart).toBeCloseTo(full / 2, 3);
    h2.querySelector('video').setAttribute('data-media-start', '1');
    k.seek(5);
    expect(s.stepStart).toBeCloseTo((full - 1) / 2, 3);
  });

  it('reads the steps from a new [data-root="true"] that appears while the old root is still on the page', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    await lesson(4, section(a, 0, 4));
    k.seek(1);
    expect([s.step, s.stepCount]).toEqual([a, 1]);
    const other = document.createElement('div');
    other.innerHTML = `<div data-root="true" data-composition-id="${uniqueName('ls')}" data-no-timeline data-start="0" data-duration="4" data-fps="30">${section(b, 0, 4)}</div>`;
    document.body.appendChild(other);
    cleanup.push(other);
    k.seek(1);
    expect([s.step, s.stepCount]).toEqual([b, 1]);
  });

  it("in video mode next() past a play({ from, to })'s hold plays on from the new step, never back to the hold", async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    await lesson(9, section(a, 0, 6) + section(b, a, 3));
    raf = manualFrames();
    k.config({ mode: 'video' });
    k.play({ from: 0, to: 5 });
    await raf.run(raf.now + 500);
    k.next();
    expect([s.step, s.time, s.playing]).toEqual([b, 6, true]);
    const seen = [];
    for (let i = 0; i < 30; i++) { await raf.run(raf.now + 1000 / 60); seen.push(s.time); }
    expect(Math.min(...seen)).toBeGreaterThan(6);
    expect(s.playing).toBe(true);
  });

  it('until can be a computed that reads another store, written in a later task', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const S = uniqueName('s'), Q = uniqueName('q');
    wf.store(S, { state: { choice: null } });
    wf.store(Q, { state: { n: 0 }, computed: { done() { return wf.getStore(S).choice !== null; } } });
    const [a, b] = ids('a', 'b');
    k.step(a, { wait: 0.5, until: Q + '.done' });
    await lesson(6, section(a, 0, 3) + section(b, a, 3));
    await k.ready();
    raf = manualFrames();
    k.go(a);
    await playOut();
    expect([s.step, s.waiting, s.canAdvance]).toEqual([a, true, false]);
    await tick(0);
    wf.getStore(S).choice = 1;
    await tick(0);
    await tick(0);
    expect([s.step, s.playing]).toEqual([a, true]);
    await playAll();
    expect([s.step, s.time, s.waiting]).toEqual([a, before(3), true]);
    k.next();
    expect([s.step, s.time]).toEqual([b, 3]);
  });

  it('step() checks its definition when it is called: KN-100 with the option, KN-120 and KN-121 for a script track', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [x] = ids('x');
    const at = "step('" + x + "')";
    expectKN(() => k.step(5, {}), 'KN-100', 'step(id)', /^id is/);
    expectKN(() => k.step(x, 5), 'KN-100', "step('" + x + "', definition)", /object/);
    expectKN(() => k.step(x, { hold: 1 }), 'KN-100', at + '.hold', /'hold' is not an option/);
    expectKN(() => k.step(x, { wait: -1 }), 'KN-100', at + '.wait', /seconds/);
    expectKN(() => k.step(x, { wait: '1' }), 'KN-100', at + '.wait', /seconds/);
    expectKN(() => k.step(x, { until: 'answered' }), 'KN-100', at + '.until', /store path/);
    expectKN(() => k.step(x, { wait: false, until: 'q.answered' }), 'KN-100', "step('" + x + "', { wait: false, until })", /nothing to hold/);
    expectKN(() => k.step(x, { entry: 5 }), 'KN-100', at + '.entry', /object/);
    expectKN(() => k.step(x, { entry: { choice: 1 } }), 'KN-100', at + ".entry['choice']", /store path/);
    expectKN(() => k.step(x, { script: 5 }), 'KN-100', at + '.script', /object/);
    expectKN(() => k.step(x, { script: { angle: { at: [0, 1], to: [0, 1] } } }), 'KN-100', at + ".script['angle']", /store path/);
    const S = at + ".script['q.x']";
    expectKN(() => k.step(x, { script: { 'q.x': 5 } }), 'KN-100', S, /track/);
    expectKN(() => k.step(x, { script: { 'q.x': { at: [0, 1], to: [0, 1], set: [0, 1] } } }), 'KN-100', S + '.to', /not both/);
    expectKN(() => k.step(x, { script: { 'q.x': { at: [0, 1], set: [1] } } }), 'KN-100', S + '.set', /same length/);
    expectKN(() => k.step(x, { script: { 'q.x': { at: [1, 0], set: [1, 2] } } }), 'KN-100', S + '.at[1]', /after the one before/);
    expectKN(() => k.step(x, { script: { 'q.x': { at: [0], set: [{ a: 1 }] } } }), 'KN-100', S + '.set[0]', /strings, numbers, booleans or null/);
    expectKN(() => k.step(x, { script: { 'q.x': { at: [0], set: [ [1] ] } } }), 'KN-100', S + '.set[0]', /strings, numbers, booleans or null/);
    expectKN(() => k.step(x, { script: { 'q.x': { at: [0], set: [NaN] } } }), 'KN-100', S + '.set[0]', /strings, numbers, booleans or null/);
    expectKN(() => k.step(x, { script: { 'q.x': { to: [0, 1] } } }), 'KN-120', S + '.at');
    expectKN(() => k.step(x, { script: { 'q.x': { at: [0], to: [1] } } }), 'KN-120', S + '.at');
    expectKN(() => k.step(x, { script: { 'q.x': { at: [0, 1], to: [0, 1], ease: 'wobble' } } }), 'KN-121', S + '.ease');
    // These pass.
    k.step(x, { script: { 'q.x': { at: [0, 1, 2, 3], set: ['a', 2, true, null] } } });
    k.step(x);
  });
});

describe(`interactive mode: development warnings (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('KN-118: a data-step with no id or no data-start, two steps with one id, a step inside a step, and a first step that starts after 0', async () => {
    const { wf } = await load();
    const [a, b, c] = ids('a', 'b', 'c');
    const lines = await captureWarnings(async () => {
      await lesson(9, `<section data-step data-start="0" data-duration="1"></section><section id="${uniqueName('nostart')}" data-step></section>`
        + `<section id="${a}" data-step data-start="1" data-duration="4"><div id="${b}" data-step data-start="2" data-duration="1"></div></section>`
        + section(c, 5, 2) + `<section id="${c}" data-step data-start="7" data-duration="2"></section>`);
      await wf.kinetic.ready();
      wf.kinetic.seek(1);
      wf.kinetic.seek(2);
    });
    const hits = lines.filter((l) => l.startsWith('[KN-118]'));
    if (BUILD !== 'dev') { expect(hits).toEqual([]); return; }
    expect(hits.length, lines.join('\n')).toBe(5);
    expect(hits.some((l) => /section/.test(l) && /no id/.test(l))).toBe(true);
    expect(hits.some((l) => /no data-start/.test(l))).toBe(true);
    expect(hits.some((l) => l.includes(b) && l.includes(a) && /inside/.test(l))).toBe(true);
    expect(hits.some((l) => l.includes(c) && /two/.test(l))).toBe(true);
    expect(hits.some((l) => l.includes(a) && /starts at 1 s/.test(l))).toBe(true);
  });

  it('KN-118: a step that starts at or past the composition\'s end, and go() to it holds on the last frame', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, z] = ids('a', 'z');
    const lines = await captureWarnings(async () => {
      await lesson(8, section(a, 0, 4) + section(z, 10, 2));
      await k.ready();
      k.seek(0);
    });
    const hits = lines.filter((l) => l.startsWith('[KN-118]') && l.includes(z));
    if (BUILD === 'dev') {
      expect(hits.length, lines.join('\n')).toBe(1);
      expect(hits[0]).toMatch(/starts at 10 s, at or past the composition's end \(8 s\)/);
    } else expect(hits).toEqual([]);
    raf = manualFrames();
    k.go(z);
    await playOut();
    expect(s.time).toBeLessThanOrEqual(before(8) + 1e-9);
  });

  it('KN-118 says each problem one element has; a definition applies to every step with its id, and go() enters the first', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const [a, b] = ids('a', 'b');
    k.step(b, { wait: 0.5 });
    let lines;
    // The second #b is inside #a, and shares its id with the first.
    lines = await captureWarnings(async () => {
      await lesson(8, section(b, 0, 2) + `<section id="${a}" data-step data-start="2" data-duration="4"><div id="${b}" data-step data-start="3" data-duration="1"></div></section>`);
      k.seek(0);
    });
    const hits = lines.filter((l) => l.startsWith('[KN-118]') && l.includes(b));
    if (BUILD === 'dev') {
      expect(hits.length, lines.join('\n')).toBe(2);
      expect(hits.some((l) => /inside/.test(l))).toBe(true);
      expect(hits.some((l) => /applies to both/.test(l))).toBe(true);
    } else expect(hits).toEqual([]);
    raf = manualFrames();
    k.go(b);
    await playOut();
    expect([s.time, s.waiting]).toEqual([before(0.5), true]);
    k.go(2);
    await playOut();
    expect([s.time, s.waiting]).toEqual([before(3.5), true]);
  });

  it('KN-157: step() for an id no data-step has, and an until whose store does not exist at readiness', async () => {
    const { wf } = await load();
    const [a, gone] = ids('a', 'gone');
    wf.kinetic.step(gone, { wait: 1 });
    wf.kinetic.step(a, { until: 'nostore-' + a + '.answered' });
    const lines = await captureWarnings(async () => {
      await lesson(4, section(a, 0, 4));
      await wf.kinetic.ready();
      await wf.kinetic.ready();
    });
    const hits = lines.filter((l) => l.startsWith('[KN-157]'));
    if (BUILD !== 'dev') { expect(hits).toEqual([]); return; }
    expect(hits.filter((l) => l.includes(gone)).length, lines.join('\n')).toBe(1);
    expect(hits.filter((l) => l.includes('nostore-' + a)).length).toBe(1);
  });

  it('KN-132 and KN-143 are off in interactive mode on a page with steps and on in video mode; KN-141 stays on in both', async () => {
    const { wf } = await load();
    if (BUILD !== 'dev') return;
    const k = wf.kinetic;
    const queries = !!(wf.features && wf.features.query !== false && typeof wf.query === 'function');
    const qn = uniqueName('q');
    let calls = 0;
    if (queries) wf.query(qn, { from: () => new Promise((r) => setTimeout(() => r([{ id: ++calls }]), 20)) });
    const name = uniqueName('scene');
    k.scene(name, Object.assign({
      computed: { o() { return { opacity: String(this.local > 1 ? 1 : 0) }; } },
      seek() { if (this.local > 3) Math.random(); },
    }, queries ? { waitFor: [qn] } : {}));
    const [a] = ids('a');
    await lesson(8, '<style>.ls-fade { transition: opacity 2s linear; }</style>' + section(a, 0, 8)
      + `<div data-component="${name}" data-start="0" data-duration="8"><i class="ls-fade" style="display:block;width:10px;height:10px" data-bind-style="o"></i></div>`);
    await k.ready();
    const seeks = async (...ts) => { for (const t of ts) { await dispatchSeek(t).done; await tick(0); } };
    const interactive = await captureWarnings(async () => {
      if (queries) wf.getQuery(qn).refresh();
      await seeks(0.5, 2, 0.5, 2, 3.5);
      await tick(60);
    });
    expect(codesIn(interactive)).not.toContain('KN-143');
    expect(codesIn(interactive)).not.toContain('KN-132');
    expect(codesIn(interactive)).toContain('KN-141');
    k.config({ mode: 'video' });
    const video = await captureWarnings(async () => {
      if (queries) wf.getQuery(qn).refresh();
      await seeks(0.5, 2, 0.5, 2);
    });
    expect(codesIn(video)).toContain('KN-143');
    if (queries) expect(codesIn(video)).toContain('KN-132');
  });
});
