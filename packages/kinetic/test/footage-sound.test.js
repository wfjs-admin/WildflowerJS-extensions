/**
 * The sound of footage, in the preview: a <video data-has-audio="true"> is
 * an audio clip as an <audio> is, its sound read from the video file and
 * played through Web Audio, with its media start, and with its rate
 * (data-playback-rate), the pitch moving with it. The test wraps
 * AudioBufferSourceNode's start() to see what Kinetic plays, and presses
 * Kinetic's speaker over the stage so the context may start.
 *
 * Also: level() and spectrum() read the footage's sound by its id, and
 * KN-136 no longer lists data-playback-rate, which audio clips now apply.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { load, mount, tick, captureWarnings, wavUrl, tone, FOOTAGE, BUILD, CORE_TIER } from './helpers.js';

const made = [];
const RealContext = window.AudioContext;
window.AudioContext = class extends RealContext { constructor(...a) { super(...a); made.push(this); } };
const starts = [];
const realStart = AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start = function (when, offset, duration) {
  if (this.context instanceof RealContext) starts.push({ node: this, buffer: this.buffer, when, offset, duration, rate: this.playbackRate.value });
  return realStart.apply(this, arguments);
};

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const until = async (fn, ms = 4000) => { for (let i = 0; i < ms / 20 && !fn(); i++) await tick(20); return fn(); };
const BOX = 'style="position:absolute;left:0;top:0;width:160px;height:90px"';

// A 4 s composition with the footage's sound from 0.5 s to 3.5 s, 0.2 s
// into the file, at `rate`.
async function talking(id, rate) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="4" data-fps="30" data-width="160" data-height="90" style="position:relative;width:160px;height:90px">
    <video id="talk" src="${FOOTAGE}f30.webm" data-start="0.5" data-duration="3" data-media-start="0.2" data-has-audio="true"${rate ? ' data-playback-rate="' + rate + '"' : ''} playsinline ${BOX}></video>
  </div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  await wf.kinetic.ready();
  await soundOn();
  return wf;
}

// The sound is off until Kinetic's speaker over the stage is pressed (a
// stage of its own gets a speaker of its own, off): shown as a hover shows
// it, then pressed with a real click.
async function soundOn() {
  const sp = await until(() => document.querySelector('[data-kinetic-speaker]'));
  expect(sp).toBeTruthy();
  if (sp.getAttribute('aria-pressed') !== 'true') {
    sp.style.opacity = '1';
    sp.style.pointerEvents = 'auto';
    await userEvent.click(sp);
  }
  expect(await until(() => made.length && made[0].state === 'running')).toBe(true);
}

// The sources started from the footage's sound: its decoded track is 4 s.
const fromTalk = () => starts.filter((s) => Math.abs(s.buffer.duration - 4) < 0.01);

describe(`the sound of footage in the preview (${BUILD} extension, ${CORE_TIER} core)`, () => {
  for (const rate of [1, 2]) {
    it(`data-has-audio${rate !== 1 ? ' with rate ' + rate : ''}: a paused seek plays the slice of its sound for that frame${rate !== 1 ? ', at the rate, pitch up' : ''}`, async () => {
      const wf = await talking('fp' + rate, rate !== 1 ? rate : 0);
      wf.kinetic.seek(2.5);
      await tick(20);
      starts.length = 0;
      wf.kinetic.seek(1.5);
      await tick(0);
      const [s] = fromTalk();
      expect(fromTalk().length).toBe(1);
      expect(s.rate).toBe(rate);
      // One frame of the composition, rate times as much of the file.
      expect(Math.abs(s.offset - (0.2 + 1 * rate)), 'offset ' + s.offset).toBeLessThan(1e-6);
      expect(Math.abs(s.duration - rate / 30), 'duration ' + s.duration).toBeLessThan(1e-6);
    });

    it(`data-has-audio${rate !== 1 ? ' with rate ' + rate : ''}: playing starts its sound at the clip's place in the file${rate !== 1 ? ' at the rate' : ''} (the start computation; what is heard is not measured)`, async () => {
      const wf = await talking('fq' + rate, rate !== 1 ? rate : 0);
      wf.kinetic.seek(1);
      await tick(20);
      starts.length = 0;
      wf.kinetic.play();
      expect(await until(() => fromTalk().length > 0)).toBe(true);
      const [s] = fromTalk();
      expect(s.rate).toBe(rate);
      // Heard from x, a little after 1 s on screen: x - 0.5 s into the clip,
      // rate times that into the file, from 0.2 s.
      const x = 0.5 + (s.offset - 0.2) / rate;
      expect(x, 'heard from ' + x).toBeGreaterThan(1);
      expect(x, 'heard from ' + x).toBeLessThan(1.45);
      // It runs to the clip's end at 3.5 s, in file time.
      expect(Math.abs(s.offset + s.duration - (0.2 + 3 * rate)), 'ends at ' + (s.offset + s.duration)).toBeLessThan(1e-6);
      wf.kinetic.pause();
    });
  }

  it("level() and spectrum() read the footage's sound by its id", async () => {
    const wf = await talking('fl1', 0);
    // The beep at 1 s in the file plays at 0.5 + (1 - 0.2) = 1.3 s.
    expect(await until(() => wf.kinetic.level(1.3, 'all', { clip: 'talk' }) > 0.5)).toBe(true);
    expect(wf.kinetic.level(1.3, 'all')).toBeGreaterThan(0.5);
    expect(wf.kinetic.level(0.3, 'all', { clip: 'talk' })).toBe(0);
    expect(Math.max(...wf.kinetic.spectrum(1.3, 16))).toBeGreaterThan(0.5);
  });

  it('sound timed from footage with no length starts where that file ends: an <audio> and a clip with data-has-audio, in a paused slice and in level()', async () => {
    const { wf } = await load();
    // 1 s of sound: a tone over its first 0.1 s, then silence.
    const beep = new Float32Array(48000);
    for (let i = 0; i < 4800; i++) beep[i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000);
    // crowd runs from 2 s into a file of 4.008 s, so it ends at 2.008.
    const host = await mount(`<div data-composition-id="fs-after" data-start="0" data-duration="4" data-fps="30" data-width="160" data-height="90" style="position:relative;width:160px;height:90px">
      <video id="crowd" src="${FOOTAGE}f30.webm" data-start="0" data-media-start="2" muted playsinline ${BOX}></video>
      <audio id="after" src="${wavUrl(beep)}" data-start="crowd"></audio>
      <video id="talk" src="${FOOTAGE}f30.webm" data-start="crowd" data-duration="1.5" data-has-audio="true" playsinline ${BOX}></video>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    await soundOn();
    wf.kinetic.seek(3);
    await tick(20);
    starts.length = 0;
    wf.kinetic.seek(2.05);
    await tick(0);
    // Each starts 2.05 - 2.008 s into its sound.
    const after = starts.filter((s) => Math.abs(s.buffer.duration - 1) < 0.01), talk = fromTalk();
    expect([after.length, talk.length]).toEqual([1, 1]);
    expect(Math.abs(after[0].offset - 0.042), 'after at ' + after[0].offset).toBeLessThan(1e-4);
    expect(Math.abs(talk[0].offset - 0.042), 'talk at ' + talk[0].offset).toBeLessThan(1e-4);
    expect(wf.kinetic.level(2.05, 'all', { clip: 'after' })).toBeGreaterThan(0.5);
    expect(wf.kinetic.level(0.05, 'all', { clip: 'after' })).toBe(0);
  });
});

describe(`KN-136 without data-playback-rate (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('an <audio> with data-playback-rate draws no KN-136; with loop, KN-136 lists loop alone', async () => {
    const { wf } = await load();
    const lines = await captureWarnings(async () => {
      const host = await mount(`<div data-composition-id="fk136" data-start="0" data-duration="2" data-fps="30">
        <audio id="sped" src="${wavUrl(tone(220, 1))}" data-start="0" data-playback-rate="2"></audio>
        <audio id="looped" src="${wavUrl(tone(330, 1))}" data-start="0" data-playback-rate="2" loop></audio>
      </div>`);
      cleanup.push(host);
      wf.kinetic.config({});
      await wf.kinetic.ready();
    });
    const kn = lines.filter((l) => l.startsWith('[KN-136]'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.filter((l) => l.includes('#sped'))).toEqual([]);
    const looped = kn.filter((l) => l.includes('#looped'));
    expect(looped.length).toBe(1);
    expect(looped[0]).toMatch(/loop/);
    expect(looped[0]).not.toMatch(/data-playback-rate/);
  });
});
