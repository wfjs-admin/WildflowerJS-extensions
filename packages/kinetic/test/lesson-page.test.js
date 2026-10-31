/**
 * Interactive mode as a page loads, and the sine lesson (www/demos/kinetic-sine/).
 *
 * With autoplay on, an interactive page with steps enters the first step when the
 * registered run of readiness resolves, and not at all when that run fails;
 * a page with no steps plays the whole composition at load, as before. The
 * sine lesson passes check() with the learner's values back and a playing
 * step still playing, holds and waits in interactive mode, and plays straight
 * through with its scripts as a video.
 *
 * Each page is its own, in a frame, since the registered run happens once,
 * at load. The lesson's quiz is a data-list, so its tests skip on the tiers
 * without lists.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, lessonFrame, sinePage, BUILD, CORE_TIER, SITE_SINE_SCRIPT, siteHas } from './helpers.js';

const HAS_SINE = await siteHas(SITE_SINE_SCRIPT);

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const until = async (fn, ms = 8000) => {
  for (let t = 0; t < ms && !fn(); t += 20) await tick(20);
  return fn();
};

const STAGE = (inner) => '<div id="stage" data-composition-id="lp" data-no-timeline data-start="0" data-duration="6" data-fps="30" style="width:320px;height:180px">' + inner + '</div>';
const STEPS = '<section id="one" data-step data-start="0" data-duration="3"></section><section id="two" data-step data-start="one" data-duration="3"></section>';
// The page's record of the kinetic:step events.
const RECORD = 'window.__steps = []; document.addEventListener("kinetic:step", (e) => window.__steps.push(e.detail.step));';

describe(`interactive mode as the page loads (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('autoplay enters the first step when the registered readiness run resolves, after a slow font, and not at load', async () => {
    // document.fonts.ready held until the test lets it go.
    const head = '<script>let go; const slow = new Promise((r) => { go = r; }); window.__fonts = () => go(); Object.defineProperty(document.fonts, "ready", { get: () => slow, configurable: true });<\/script>';
    const { w, store, doc } = await lessonFrame(STAGE(STEPS), { head, script: 'wildflower.kinetic.step("one", { wait: 1 });' + RECORD, cleanup });
    await tick(400);
    expect([store.playing, store.time, w.__steps.length]).toEqual([false, 0, 0]);
    expect(doc.getElementById('stage').hasAttribute('data-kinetic-ready')).toBe(false);
    w.__fonts();
    expect(await until(() => w.__steps.length > 0)).toBe(true);
    expect(w.__steps).toEqual(['one']);
    expect([store.mode, store.step]).toEqual(['interactive', 'one']);
    expect(await until(() => store.waiting)).toBe(true);
    expect(store.time).toBe(29 / 30);
  });

  it('autoplay does not enter the first step when the registered run fails; the root is marked failed', async () => {
    const script = 'wildflower.kinetic.step("one", { script: { "nostore.x": { at: [0, 1], to: [0, 1] } } });' + RECORD;
    const { w, store, doc } = await lessonFrame(STAGE(STEPS), { script, cleanup });
    expect(await until(() => doc.getElementById('stage').getAttribute('data-kinetic-ready') === 'failed')).toBe(true);
    await tick(300);
    expect([store.playing, store.time, w.__steps.length]).toEqual([false, 0, 0]);
  });

  it("a runtime's player that arrived with no seek since keeps autoplay from entering a step, also when readiness passes before load", async () => {
    // Fonts at once (Chrome's document.fonts.ready waits for load), and an
    // image that holds load back, so readiness passes first. The player is
    // a stand-in that records what the clock asks of it.
    const head = '<script>Object.defineProperty(document.fonts, "ready", { get: () => Promise.resolve(document.fonts), configurable: true });<\/script>';
    const player = 'window.__calls = []; window.__player = { play() { __calls.push("play"); }, pause() { __calls.push("pause"); }, renderSeek(t) { __calls.push("seek " + t); }, isPlaying() { return false; }, getDuration() { return 6; } };';
    const script = player + RECORD
      + 'window.__readyAt = wildflower.kinetic.ready().then(() => performance.now()); window.__loadAt = 0; addEventListener("load", () => { window.__loadAt = performance.now(); });';
    const { w, store } = await lessonFrame(STAGE(STEPS) + '<img src="/__kinetic/slow/1000/frames.png" alt="" style="position:absolute;width:1px;height:1px">', { head, script, cleanup });
    await tick(300);
    expect(await w.__readyAt, 'readiness passed before load').toBeLessThan(w.__loadAt);
    expect([store.mode, store.playing, w.__steps.length]).toEqual(['video', false, 0]);
    expect(w.__calls).toEqual([]);
  });

  it("KN-158 waits for the page to load: with data-preview, config({ mode: 'interactive' }) after Kinetic's tag keeps the lesson and the bar with no warning; without it the bar's video mode warns once (dev)", async () => {
    // The page's warnings, kept from before the framework loads.
    const head = '<script>window.__warns = []; const w = console.warn; console.warn = function (...a) { window.__warns.push(a.join(" ")); return w.apply(this, a); };<\/script>';
    const kept = await lessonFrame(STAGE(STEPS), { head, preview: true, script: 'wildflower.kinetic.config({ mode: "interactive" });', cleanup });
    const left = await lessonFrame(STAGE(STEPS), { head, preview: true, cleanup });
    for (const p of [kept, left]) await p.k.ready().catch(() => {});
    await tick(100);
    const kn158 = (p) => p.w.__warns.filter((l) => l.includes('[KN-158]'));
    expect([kept.store.mode, !!kept.doc.querySelector('[data-kinetic-preview]')]).toEqual(['interactive', true]);
    expect(kn158(kept)).toEqual([]);
    expect(left.store.mode).toBe('video');
    expect(kn158(left).length).toBe(BUILD === 'dev' ? 1 : 0);
  });

  it('a page with no steps plays the whole composition at load, as before', async () => {
    const { store } = await lessonFrame(STAGE(''), { cleanup });
    expect(await until(() => store.playing && store.time > 0.1, 3000)).toBe(true);
    expect([store.mode, store.stepIndex, store.stepCount]).toEqual(['interactive', -1, 0]);
  });

  it('with autoplay off, an interactive page with steps shows the first frame of the first step, and play() starts it', async () => {
    const steps = '<section id="one" data-step data-start="1" data-duration="2"></section><section id="two" data-step data-start="one" data-duration="3"></section>';
    const { w, store } = await lessonFrame(STAGE(steps), { script: 'wildflower.kinetic.config({ autoplay: false });' + RECORD, cleanup });
    expect(await until(() => store.time === 1)).toBe(true);
    expect([store.playing, store.step, w.__steps.length]).toEqual([false, 'one', 0]);
    w.wildflower.kinetic.play();
    expect(store.playing).toBe(true);
    expect(await until(() => store.waiting)).toBe(true);
    expect([store.step, store.time]).toEqual(['one', 89 / 30]);
  });
});

describe.skipIf(!HAS_SINE)(`the sine lesson (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const lists = async (skip) => { const { wf } = await load(); if (wf.features && wf.features.lists === false) skip(); };

  it("check() passes, sampling across the question in both orders, with the learner's values back afterwards and a playing step still playing", async ({ skip }) => {
    await lists(skip);
    const { k, store, sine } = await sinePage(cleanup);
    sine.angle = 200;
    k.go('unwrap');
    expect(store.playing).toBe(true);
    const r = await k.check({ samples: 120 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect([sine.angle, sine.choice, store.mode, store.step, store.playing]).toEqual([200, null, 'interactive', 'unwrap', true]);
  });

  it('in interactive mode the steps hold, the question waits for its answer, plays its explanation and holds for Next, entry clears it on the way back in, and the last step waits for the drag', async ({ skip }) => {
    await lists(skip);
    const { k, store, sine, doc } = await sinePage(cleanup);
    k.go('ask');
    expect(await until(() => store.waiting)).toBe(true);
    expect([store.step, store.canAdvance]).toEqual(['ask', false]);
    k.next();
    expect(store.step).toBe('ask');
    const button = [...doc.querySelectorAll('.choices button')].find((b) => b.textContent === '270°');
    button.click();
    expect(sine.choice).toBe(270);
    // The explanation plays, and the step holds on its last frame for Next.
    expect(await until(() => store.step === 'ask' && store.waiting && !store.playing && store.time > store.stepStart + store.stepLength - 0.1)).toBe(true);
    expect(store.canAdvance).toBe(true);
    k.next();
    expect(await until(() => store.step === 'find')).toBe(true);
    expect(await until(() => store.waiting)).toBe(true);
    const shown = (sel) => doc.querySelector(sel).style.display !== 'none';
    expect([shown('#find .searching'), shown('#find .found')]).toEqual([true, false]);
    sine.angle = 270;
    await tick(0);
    expect([shown('#find .searching'), shown('#find .found')]).toEqual([false, true]);
    k.back();
    expect([store.step, sine.choice, store.canAdvance]).toEqual(['ask', null, false]);
  });

  it('with the preview bar the page is the video, and offers no way back to the lesson', async ({ skip }) => {
    await lists(skip);
    const { store, doc } = await sinePage(cleanup, { preview: true });
    await tick(0);
    const shown = (id) => doc.getElementById(id).style.display !== 'none';
    expect([store.mode, shown('watch-video'), shown('back-to-lesson')]).toEqual(['video', false, false]);
    expect(doc.querySelector('[data-kinetic-preview]')).toBeTruthy();
  });

  it('as a video it plays straight through with the scripts, and back in interactive mode the learner has their values again', async ({ skip }) => {
    await lists(skip);
    const { k, store, sine, doc } = await sinePage(cleanup);
    sine.angle = 200;
    doc.getElementById('watch-video').click();
    expect([store.mode, store.playing]).toEqual(['video', true]);
    k.seek(4);
    expect(sine.angle).toBeGreaterThan(30);
    k.seek(15);
    expect([store.step, sine.angle, sine.choice]).toEqual(['ask', 360, null]);
    k.seek(16.1);
    expect(sine.choice).toBe(270);
    k.seek(21.9);
    expect([store.step, sine.angle]).toEqual(['find', 270]);
    doc.getElementById('back-to-lesson').click();
    expect([store.mode, sine.angle, sine.choice]).toEqual(['interactive', 200, null]);
  });
});
