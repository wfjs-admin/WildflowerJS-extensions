/**
 * Sound in the preview, with a real AudioContext in the test browser and a
 * real click for the user gesture. The test wraps AudioContext and
 * AudioBufferSourceNode's start() and stop() to see what Kinetic plays.
 *
 * The bar's sound button appears only with an audio clip, starts off, and a
 * click resumes the context. Playing starts one source per clip that has not
 * ended; a pause stops every source; a jump of more than 45 ms while playing
 * restarts them. While paused, a seek plays its frame's slice: one source per
 * clip overlapping the frame, one frame long; a seek to the time already
 * shown plays nothing. config({ sound: false }) plays nothing. Sources never
 * stack: through the bar's own play button, pauses, resumes and seeks, the
 * sources sounding are one per live clip, and none once paused. check()
 * passes on a composition with audio clips.
 *
 * One file, one page, one context: the tests run in order, the first one
 * before any click.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { load, mount, tick, frames, tone, wavUrl, BUILD, CORE_TIER } from './helpers.js';

// Every AudioContext made on the page, and every start() and stop() of a
// source on one (not on an OfflineAudioContext).
const made = [];
const RealContext = window.AudioContext;
window.AudioContext = class extends RealContext { constructor(...a) { super(...a); made.push(this); } };
const starts = [];
const stops = [];
// The sources sounding, or scheduled to: from start() until stop() or 'ended'.
const live = new Set();
const realStart = AudioBufferSourceNode.prototype.start;
const realStop = AudioBufferSourceNode.prototype.stop;
AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
  if (this.context instanceof RealContext) {
    starts.push({ node: this, buffer: this.buffer, when, offset, duration });
    live.add(this);
    this.addEventListener('ended', () => live.delete(this));
  }
  return realStart.apply(this, arguments);
};
AudioBufferSourceNode.prototype.stop = function () {
  if (this.context instanceof RealContext) { stops.push(this); live.delete(this); }
  return realStop.apply(this, arguments);
};

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const soundButton = () => document.querySelector('[data-kinetic-preview] [data-kinetic-sound]');
const until = async (fn, ms = 3000) => { for (let i = 0; i < ms / 20 && !fn(); i++) await tick(20); return fn(); };

// Three clips of tones on a 4 s composition: A over the whole, B from 0.5 to
// 2.5 s, C over the first 0.2 s. Each has its own buffer, so a start says
// which clip it was.
const A = wavUrl(tone(220, 4)), B = wavUrl(tone(440, 2)), C = wavUrl(tone(880, 0.2));
async function threeClips(id) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="4" data-fps="30">
    <audio id="a" src="${A}" data-start="0" data-duration="4"></audio>
    <audio id="b" src="${B}" data-start="0.5" data-duration="2"></audio>
    <audio id="c" src="${C}" data-start="0"></audio>
  </div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  await wf.kinetic.ready();
  return wf;
}
// The clip a start played, by its buffer's length in seconds.
const which = (s) => ({ 4: 'a', 2: 'b', 0.2: 'c' })[Math.round(s.buffer.duration * 10) / 10];

describe(`sound in the preview (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the bar\'s sound button appears only with an audio clip, starts off, and a click resumes the context', async () => {
    const { wf } = await load();
    const silent = await mount('<div data-composition-id="ap0" data-start="0" data-duration="2"></div>');
    cleanup.push(silent);
    wf.kinetic.config({ preview: true });
    await wf.kinetic.ready();
    await tick(20);
    expect(document.querySelector('[data-kinetic-preview]')).toBeTruthy();
    expect(soundButton()).toBeNull();
    // A page with no audio clip: readiness leaves the store's audio count alone.
    expect(wf.getStore('kinetic').levels).toBe(0);
    silent.remove();
    await threeClips('ap1');
    await until(() => soundButton());
    const button = soundButton();
    expect(button).toBeTruthy();
    expect(button.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(made.length).toBe(1);
    // A click in a file that ran before can let the browser start the
    // context running; suspended is what a blocked autoplay leaves.
    if (made[0].state === 'running') await made[0].suspend();
    expect(made[0].state).toBe('suspended');
    expect(await until(() => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    await userEvent.click(button);
    expect(await until(() => made[0].state === 'running')).toBe(true);
    expect(await until(() => button.getAttribute('aria-pressed') === 'true')).toBe(true);
    // Pressed again, it turns the sound off, and on once more.
    await userEvent.click(button);
    expect(await until(() => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    await userEvent.click(button);
    expect(await until(() => button.getAttribute('aria-pressed') === 'true' && made[0].state === 'running')).toBe(true);
    expect(made.length).toBe(1);
  });

  it('playing starts one source per clip that has not ended, each at its own offset, and a pause stops every one', async () => {
    const wf = await threeClips('ap2');
    expect(made[0].state).toBe('running');
    wf.kinetic.seek(1);
    await frames(2);
    starts.length = 0; stops.length = 0;
    wf.kinetic.play();
    expect(await until(() => starts.length >= 2)).toBe(true);
    await frames(3);
    // Each clip's first start. Under load (the whole suite on a busy
    // machine) the first frames after play() come late, the picture runs
    // more than 45 ms from the sound, and the preview restarts every clip
    // from the new time, as it should; three starts a clip were seen
    // 2026-10-28, on the commit before the review fixes too. Sources
    // stacking is the next tests' to catch.
    const first = [];
    for (const s of starts) if (!first.some((f) => which(f) === which(s))) first.push(s);
    expect(first.map(which).sort()).toEqual(['a', 'b']);
    expect(starts.every((s) => ['a', 'b'].includes(which(s))), 'only the clips not ended').toBe(true);
    // A starts about 1 s into its file, B about 0.5 s into its own.
    const a = first.find((s) => which(s) === 'a'), b = first.find((s) => which(s) === 'b');
    expect(a.offset).toBeGreaterThan(1);
    expect(a.offset).toBeLessThan(1.4);
    expect(b.offset).toBeGreaterThan(0.5);
    expect(b.offset).toBeLessThan(0.9);
    wf.kinetic.pause();
    await tick(0);
    // Every source started, restarts included, is stopped.
    expect(await until(() => starts.every((s) => stops.includes(s.node)))).toBe(true);
  });

  it('a jump of more than 45 ms while playing restarts every clip from the new time', async () => {
    const wf = await threeClips('ap3');
    wf.kinetic.seek(0.6);
    wf.kinetic.play();
    expect(await until(() => starts.some((s) => which(s) === 'b' && s.offset < 0.5))).toBe(true);
    const before = starts.length;
    const running = starts.slice(-2);
    // play({ from }) while playing: the clock jumps to 3 s and plays on.
    wf.kinetic.play({ from: 3 });
    expect(await until(() => starts.slice(before).some((s) => which(s) === 'a' && s.offset > 2.9))).toBe(true);
    // B ended at 2.5 s, so only A starts again; the sources before are stopped.
    expect(starts.slice(before).filter((s) => s.offset > 2.9).map(which)).toEqual(['a']);
    expect(running.every((s) => stops.includes(s.node))).toBe(true);
  });

  it('while paused, a seek plays its frame\'s slice: one source per clip overlapping the frame, one frame long', async () => {
    const wf = await threeClips('ap4');
    wf.kinetic.seek(2);
    await frames(2);
    starts.length = 0;
    wf.kinetic.seek(1.5);
    await tick(0);
    expect(starts.map(which).sort()).toEqual(['a', 'b']);
    for (const s of starts) expect(Math.abs(s.duration - 1 / 30), which(s) + ' ' + s.duration).toBeLessThan(1e-6);
    const a = starts.find((s) => which(s) === 'a'), b = starts.find((s) => which(s) === 'b');
    expect(a.offset).toBeCloseTo(1.5, 6);
    expect(b.offset).toBeCloseTo(1, 6);
    // A frame step to 0.1 s: C overlaps it too.
    starts.length = 0;
    wf.kinetic.seek(0.1);
    expect(starts.map(which).sort()).toEqual(['a', 'c']);
    // The slice before is stopped when the next one starts.
    // A seek to the time already shown plays nothing.
    starts.length = 0;
    wf.kinetic.seek(0.1);
    await tick(0);
    expect(starts.length).toBe(0);
  });

  it('a pause leaves the frame on screen silent until the next seek moves it', async () => {
    const wf = await threeClips('ap5');
    wf.kinetic.seek(1);
    wf.kinetic.play();
    expect(await until(() => starts.length > 0)).toBe(true);
    await frames(3);
    wf.kinetic.pause();
    await tick(0);
    const shown = wf.getStore('kinetic').time;
    starts.length = 0;
    wf.kinetic.seek(shown);
    await tick(0);
    expect(starts.length).toBe(0);
  });

  it('config({ sound: false }) plays nothing, hides the button and suspends the context; true resumes it', async () => {
    const wf = await threeClips('ap6');
    wf.kinetic.config({ sound: false });
    try {
      expect(wf.kinetic.config().sound).toBe(false);
      await until(() => !soundButton());
      expect(soundButton()).toBeNull();
      expect(await until(() => made[0].state === 'suspended')).toBe(true);
      starts.length = 0;
      wf.kinetic.seek(1);
      wf.kinetic.play();
      await frames(4);
      wf.kinetic.pause();
      wf.kinetic.seek(2);
      await tick(0);
      expect(starts.length).toBe(0);
    } finally {
      wf.kinetic.config({ sound: true });
    }
    expect(wf.kinetic.config().sound).toBe(true);
    expect(await until(() => made[0].state === 'running')).toBe(true);
  });

  // The sources sounding, by their file's length in whole seconds.
  const sounding = () => [...live].map((n) => Math.round(n.buffer.duration)).sort().join();

  it('a clip added while playing sounds with no seek, and a clip removed stops', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="ap9" data-start="0" data-duration="8" data-fps="30">
      <audio id="first" src="${wavUrl(tone(330, 6))}" data-start="0"></audio>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    wf.kinetic.seek(1);
    wf.kinetic.play();
    expect(await until(() => sounding() === '6'), sounding()).toBe(true);
    const late = document.createElement('audio');
    late.setAttribute('src', wavUrl(tone(550, 3)));
    late.setAttribute('data-start', '0');
    host.firstElementChild.appendChild(late);
    await wf.kinetic.ready();
    expect(await until(() => sounding() === '3,6'), 'after the add: ' + sounding()).toBe(true);
    host.querySelector('#first').remove();
    await wf.kinetic.ready();
    expect(await until(() => sounding() === '3'), 'after the removal: ' + sounding()).toBe(true);
  });

  it('the end of a play range holds its last frame with no slice after the sound stops', async () => {
    const wf = await threeClips('ap10');
    const store = wf.getStore('kinetic');
    wf.kinetic.seek(1);
    await frames(2);
    wf.kinetic.play({ from: 1, to: 1.4 });
    const mark = starts.length;
    expect(await until(() => !store.playing)).toBe(true);
    await tick(100);
    expect(store.time).toBeCloseTo(1.4 - 1 / 30, 9);
    const slices = starts.slice(mark).filter((s) => Math.abs(s.duration - 1 / 30) < 1e-6);
    expect(slices.length).toBe(0);
    expect(live.size).toBe(0);
  });

  it('sources never stack with two clips, one ending while they play: each resume sounds the clips live then, and a pause none', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="ap11" data-start="0" data-duration="8" data-fps="30">
      <audio id="long" src="${wavUrl(tone(330, 8))}" data-start="0"></audio>
      <audio id="short" src="${wavUrl(tone(660, 1.6))}" data-start="0"></audio>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const toggle = document.querySelector('[data-kinetic-preview] [data-action="toggle"]');
    const store = wf.getStore('kinetic');
    const counts = [];
    const resumed = async (what) => { await until(() => live.size > 0); await tick(250); counts.push(what + ' ' + sounding()); };
    const silent = async (what) => { await tick(150); counts.push(what + ' ' + sounding()); };
    wf.kinetic.seek(1);
    await silent('seek');
    await userEvent.click(toggle);
    await resumed('resume');
    // The short clip ends at 1.6 s while the clock plays.
    await until(() => store.time > 1.8);
    await silent('after the short one ends');
    for (let k = 0; k < 3; k++) {
      await userEvent.click(toggle);
      await silent('pause');
      await userEvent.click(toggle);
      await resumed('resume');
    }
    await userEvent.click(toggle);
    await silent('pause');
    expect(counts).toEqual(['seek ', 'resume 2,8', 'after the short one ends 8',
      'pause ', 'resume 8', 'pause ', 'resume 8', 'pause ', 'resume 8', 'pause ']);
  });

  it("sources never stack: through the bar's play button, pauses, resumes and seeks, one clip sounds once, and nothing once paused", async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="ap8" data-start="0" data-duration="8" data-fps="30">
      <audio id="long" src="${wavUrl(tone(330, 8))}" data-start="0"></audio>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    expect(made[0].state).toBe('running');
    const toggle = document.querySelector('[data-kinetic-preview] [data-action="toggle"]');
    const playing = () => wf.getStore('kinetic').playing;
    const counts = [];
    // Plays, and the count once the start has settled.
    const resumed = async (what) => { await until(() => live.size > 0); await tick(250); counts.push(what + ' ' + live.size); };
    // Paused, and the count once any slice has ended.
    const silent = async (what) => { await tick(150); counts.push(what + ' ' + live.size); };
    wf.kinetic.seek(1);
    await silent('seek while paused');
    for (let k = 0; k < 4; k++) {
      await userEvent.click(toggle);
      expect(playing()).toBe(true);
      await resumed('resume ' + k);
      await userEvent.click(toggle);
      expect(playing()).toBe(false);
      await silent('pause ' + k);
    }
    // A jump while playing, a seek that stops the clock, frame steps while paused.
    await userEvent.click(toggle);
    await resumed('resume');
    wf.kinetic.play({ from: 5 });
    await resumed('jump while playing');
    wf.kinetic.seek(2);
    await silent('seek while playing');
    for (const t of [2 + 1 / 30, 2 + 2 / 30, 2 + 2 / 30]) { wf.kinetic.seek(t); await silent('step'); }
    await userEvent.click(toggle);
    await resumed('resume after steps');
    await userEvent.click(toggle);
    await silent('pause');
    expect(counts).toEqual(['seek while paused 0',
      'resume 0 1', 'pause 0 0', 'resume 1 1', 'pause 1 0', 'resume 2 1', 'pause 2 0', 'resume 3 1', 'pause 3 0',
      'resume 1', 'jump while playing 1', 'seek while playing 0', 'step 0', 'step 0', 'step 0', 'resume after steps 1', 'pause 0']);
  });

  it('check() passes on a composition with audio clips, and plays no slice for its seeks', async () => {
    const wf = await threeClips('ap7');
    starts.length = 0;
    const report = await wf.kinetic.check({ samples: 20 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(starts.length).toBe(0);
  });
});
