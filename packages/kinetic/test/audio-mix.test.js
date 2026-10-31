/**
 * The audio mix and the preview's start computation, from the source module
 * (src/mix.js), as mp4.test.js reads the MP4 writer: pure functions over
 * generated buffers, run in the browser for OfflineAudioContext.
 *
 * The mix puts every clip at whole samples from composition seconds:
 * data-start places it, data-media-start trims its head, data-duration cuts
 * it, data-volume scales it and the fades are linear from the clip's own
 * edges, also across the 10 s boundary between two segments.
 *
 * The preview's start computation takes the clock's time, the performance
 * time of the seek, the context's time and the device's output timestamp,
 * and gives each clip's start time, offset and length.
 */
import { describe, it, expect } from 'vitest';
import * as mix from '../src/mix.js';

const { RATE, SEGMENT, clipOf, mixSegment, startPlan, heardAt, drift, LEAD, LAG, DRIFT } = mix;

// A mono buffer of `seconds` at 48 kHz, with value v at each listed sample.
function buffer(seconds, marks = {}, fill = 0) {
  const b = new AudioBuffer({ length: Math.round(seconds * 48000), sampleRate: 48000, numberOfChannels: 1 });
  const d = b.getChannelData(0);
  if (fill) d.fill(fill);
  for (const [i, v] of Object.entries(marks)) d[Number(i)] = v;
  return b;
}
// Every sample of channel 0 that is not 0, as [index, value].
function nonZero(b) {
  const d = b.getChannelData(0), out = [];
  for (let i = 0; i < d.length; i++) if (d[i] !== 0) out.push([i, Math.round(d[i] * 1e4) / 1e4]);
  return out;
}

describe('the mix (src/mix.js)', () => {
  it('works at 48 kHz in segments of 10 s', () => {
    expect(RATE).toBe(48000);
    expect(SEGMENT).toBe(480000);
  });

  it('puts an impulse at the exact sample data-start gives, in both channels, also in a later segment', async () => {
    const b = buffer(1, { 100: 1 });
    const out = await mixSegment([clipOf({ buffer: b, start: 0.5 })], 0, 48000);
    expect(out.numberOfChannels).toBe(2);
    expect(nonZero(out)).toEqual([[24100, 1]]);
    expect(out.getChannelData(1)[24100]).toBe(1);
    const later = await mixSegment([clipOf({ buffer: b, start: 12.25 })], SEGMENT, 4 * 48000);
    expect(nonZero(later)).toEqual([[12.25 * 48000 - SEGMENT + 100, 1]]);
  });

  it('data-media-start trims the head of the file', async () => {
    // Impulses 0.05 s and 0.3 s into the file; starting 0.25 s in drops the first.
    const b = buffer(1, { 2400: 0.5, 14400: 1 });
    const out = await mixSegment([clipOf({ buffer: b, start: 0.1, mediaStart: 0.25 })], 0, 48000);
    expect(nonZero(out)).toEqual([[4800 + 2400, 1]]);
  });

  it('data-duration cuts the clip, and a length past the file ends in silence', async () => {
    const b = buffer(1, { 4800: 1, 28800: 1 });          // at 0.1 s and 0.6 s
    const cut = await mixSegment([clipOf({ buffer: b, start: 0, duration: 0.5 })], 0, 96000);
    expect(nonZero(cut)).toEqual([[4800, 1]]);
    const long = await mixSegment([clipOf({ buffer: b, start: 0, duration: 1.8 })], 0, 96000);
    expect(nonZero(long)).toEqual([[4800, 1], [28800, 1]]);
  });

  it('data-volume scales the clip, up to +12 dB, and the clips add', async () => {
    const b = buffer(0.1, { 10: 0.25 });
    const out = await mixSegment([clipOf({ buffer: b, start: 0, volume: 2 }), clipOf({ buffer: b, start: 0.01, volume: 0.5 })], 0, 9600);
    expect(nonZero(out)).toEqual([[10, 0.5], [490, 0.125]]);
    const loud = await mixSegment([clipOf({ buffer: b, start: 0, volume: 10 })], 0, 4800);
    expect(nonZero(loud)).toEqual([[10, Math.round(0.25 * 3.98 * 1e4) / 1e4]]);
  });

  it('the fades are linear from the clip\'s own edges, multiplied with the volume', async () => {
    // A steady 1 for 2 s at volume 0.8: 0.5 s in, 0.5 s out.
    const b = buffer(2, {}, 1);
    const out = await mixSegment([clipOf({ buffer: b, start: 0, volume: 0.8, fadeIn: 0.5, fadeOut: 0.5 })], 0, 2 * 48000);
    const d = out.getChannelData(0);
    for (const s of [0, 1, 6000, 12000, 23999, 24000, 48000, 72000, 80000, 95999]) {
      const want = s <= 24000 ? 0.8 * s / 24000 : s >= 72000 ? 0.8 * (96000 - s) / 24000 : 0.8;
      expect(Math.abs(d[s] - want), 'sample ' + s).toBeLessThan(1e-4);
    }
  });

  it('a fade across the 10 s boundary between two segments has no step', async () => {
    // From 9 s to 11 s the clip fades in, so 10 s is half way.
    const b = buffer(3, {}, 1);
    const c = clipOf({ buffer: b, start: 9, duration: 3, fadeIn: 2 });
    const first = await mixSegment([c], 0, SEGMENT);
    const second = await mixSegment([c], SEGMENT, SEGMENT);
    const last = first.getChannelData(0)[SEGMENT - 1], next = second.getChannelData(0)[0];
    const slope = 1 / 96000;
    expect(Math.abs(next - 0.5)).toBeLessThan(1e-4);
    expect(Math.abs((next - last) - slope)).toBeLessThan(1e-5);
    // One context across the boundary gives the same samples.
    const whole = await mixSegment([c], SEGMENT - 4800, 9600);
    expect(Math.abs(whole.getChannelData(0)[4799] - last)).toBeLessThan(1e-5);
    expect(Math.abs(whole.getChannelData(0)[4800] - next)).toBeLessThan(1e-5);
  });

  it('a mix in one channel, as the levels read it, holds a mono clip as it is and a stereo clip as the mean of its two channels', async () => {
    const stereo = new AudioBuffer({ length: 4800, sampleRate: 48000, numberOfChannels: 2 });
    stereo.getChannelData(0)[100] = 0.8;
    stereo.getChannelData(1)[100] = 0.2;
    const out = await mixSegment([clipOf({ buffer: stereo, start: 0 }), clipOf({ buffer: buffer(0.1, { 200: 0.5 }), start: 0 })], 0, 4800, 1);
    expect(out.numberOfChannels).toBe(1);
    expect(nonZero(out)).toEqual([[100, 0.5], [200, 0.5]]);
  });

  it('a segment before 0 or past every clip is silence', async () => {
    const b = buffer(0.5, { 0: 1 });
    expect(nonZero(await mixSegment([clipOf({ buffer: b, start: 0 })], -4800, 4800))).toEqual([]);
    expect(nonZero(await mixSegment([clipOf({ buffer: b, start: 0 })], 48000, 4800))).toEqual([]);
  });
});

describe('the preview\'s start computation (src/mix.js)', () => {
  // A long clip, one that starts later, and one that has ended.
  const clips = [
    clipOf({ buffer: buffer(4), start: 0, duration: 2 }),
    clipOf({ buffer: buffer(4), start: 1.5, duration: 1, mediaStart: 0.25 }),
    clipOf({ buffer: buffer(4), start: 0, duration: 0.5 }),
  ];
  const close = (a, b) => Math.abs(a - b) < 1e-9;

  it('leads by 0.1 s and lags the screen by one 60 Hz frame', () => {
    expect(LEAD).toBe(0.1);
    expect(LAG).toBe(1 / 60);
    expect(DRIFT).toBe(0.045);
  });

  it('the context time heard now: from the output timestamp, else the context time less the latency', () => {
    expect(heardAt(1000, { contextTime: 4.95, performanceTime: 990 }, 5, 0.024)).toBeCloseTo(4.96, 12);
    expect(heardAt(1000, { contextTime: 0, performanceTime: 0 }, 5, 0.024)).toBeCloseTo(4.976, 12);
  });

  it('starts every clip that has not ended so that the sound of x is heard while x is on screen', () => {
    const p = startPlan(clips, { t: 1, perf: 1000, ctxTime: 5, ts: { contextTime: 4.95, performanceTime: 990 }, latency: 0.024 });
    // when = 5.1, heard then = 4.96 + 0.14; the screen shows 1 + 0.14 - 1/60 then.
    const x = 1 + (5.1 - 4.96) - 1 / 60;
    expect(close(p.when, 5.1)).toBe(true);
    expect(close(p.x, x)).toBe(true);
    expect(p.starts.length).toBe(2);
    const [a, b] = p.starts;
    expect(a.clip).toBe(clips[0]);
    expect(close(a.at, 5.1) && close(a.offset, x) && close(a.duration, 2 - x)).toBe(true);
    expect(b.clip).toBe(clips[1]);
    expect(close(b.at, 5.1 + 1.5 - x) && close(b.offset, 0.25) && close(b.duration, 1)).toBe(true);
  });

  it('before the device reports a timestamp, the output latency stands in for it', () => {
    const p = startPlan(clips, { t: 0.2, perf: 500, ctxTime: 2, ts: { contextTime: 0, performanceTime: 0 }, latency: 0.03 });
    const x = 0.2 + (2.1 - (2 - 0.03)) - 1 / 60;
    expect(close(p.x, x)).toBe(true);
    expect(p.starts.map((s) => s.clip)).toEqual([clips[0], clips[1], clips[2]]);
    expect(close(p.starts[2].duration, 0.5 - x)).toBe(true);
  });

  it('the drift: the time on screen against the time heard, past 45 ms a restart', () => {
    const anchor = { x: 1.2, when: 5.1 };
    // At context time 5.6 heard, 1.7 is heard; the screen shows t - 1/60.
    expect(drift(anchor, 1.7 + 1 / 60, 5.6)).toBeCloseTo(0, 12);
    expect(Math.abs(drift(anchor, 1.74 + 1 / 60, 5.6))).toBeLessThan(DRIFT);
    expect(Math.abs(drift(anchor, 0 + 1 / 60, 5.6))).toBeGreaterThan(DRIFT);
  });

  it('at a rate, the offset and the duration are in file seconds: rate times the composition seconds', () => {
    const c = clipOf({ buffer: buffer(4), start: 0, duration: 1, mediaStart: 0.25, rate: 2 });
    const p = startPlan([c], { t: 0.3, perf: 1000, ctxTime: 5, ts: { contextTime: 4.95, performanceTime: 990 }, latency: 0.024 });
    const [s] = p.starts;
    expect(close(s.into, p.x)).toBe(true);
    expect(close(s.offset, 0.25 + 2 * p.x), 'offset ' + s.offset).toBe(true);
    expect(close(s.duration, 2 * (1 - p.x)), 'duration ' + s.duration).toBe(true);
  });
});

describe('the playback rate (src/mix.js)', () => {
  // The samples of channel 0 above 0.6, as indices.
  const peaks = (b) => { const d = b.getChannelData(0), out = []; for (let i = 0; i < d.length; i++) if (d[i] > 0.6) out.push(i); return out; };

  it('clipOf takes the rate, 1 by default and clamped to 0.1 to 10; without a duration the clip is what is left of the file over the rate', () => {
    const b = buffer(1);
    expect(clipOf({ buffer: b, start: 0 }).rate).toBe(1);
    expect(clipOf({ buffer: b, start: 0, rate: NaN }).rate).toBe(1);
    expect(clipOf({ buffer: b, start: 0, rate: 20 }).rate).toBe(10);
    expect(clipOf({ buffer: b, start: 0, rate: 0.01 }).rate).toBe(0.1);
    expect(clipOf({ buffer: b, start: 0, rate: 2 }).len).toBe(24000);
    expect(clipOf({ buffer: b, start: 0, rate: 0.5 }).len).toBe(96000);
    expect(clipOf({ buffer: b, start: 0, rate: 2, mediaStart: 0.5 }).len).toBe(12000);
    // A duration stays composition seconds.
    expect(clipOf({ buffer: b, start: 0, rate: 2, duration: 0.3 }).len).toBe(14400);
  });

  it('the mix plays a clip at its rate: what is 0.5 s apart in the file is 0.25 s apart at rate 2, and 1 s apart at rate 0.5', async () => {
    const b = buffer(1, { 4800: 1, 28800: 1 });          // at 0.1 s and 0.6 s in the file
    const fast = await mixSegment([clipOf({ buffer: b, start: 0.5, rate: 2 })], 0, 48000);
    expect(peaks(fast)).toEqual([24000 + 2400, 24000 + 14400]);
    const slow = await mixSegment([clipOf({ buffer: b, start: 0, rate: 0.5 })], 0, 96000);
    expect(peaks(slow)).toEqual([9600, 57600]);
    // data-media-start is file seconds, and the rate runs from there.
    const trimmed = await mixSegment([clipOf({ buffer: b, start: 0, rate: 2, mediaStart: 0.5 })], 0, 48000);
    expect(peaks(trimmed)).toEqual([2400]);
  });

  it('a duration at a rate plays rate times as much of the file, and a segment boundary inside the clip joins at the rate', async () => {
    const b = buffer(2, { 4800: 1, 72000: 1 });          // at 0.1 s and 1.5 s in the file
    const cut = await mixSegment([clipOf({ buffer: b, start: 0, rate: 2, duration: 0.5 })], 0, 48000);
    expect(peaks(cut)).toEqual([2400]);
    // The same clip mixed in two halves puts the second impulse where one mix does.
    const c = clipOf({ buffer: b, start: 0, rate: 2 });
    const second = await mixSegment([c], 24000, 24000);
    expect(peaks(second)).toEqual([36000 - 24000]);
  });
});

describe('data-remap in the mix (src/mix.js)', () => {
  // The sample of channel 0 with the largest value.
  const loudest = (b) => { const d = b.getChannelData(0); let k = 0; for (let i = 1; i < d.length; i++) if (d[i] > d[k]) k = i; return k; };

  it('a hold stands the file still: a click after a hold of 1.6 s lands on its sample, not early', async () => {
    const b = buffer(1, { 24000: 1 });                     // a click at 0.5 s in the file
    // 0.4 s at speed 1, a hold of 1.6 s, then speed 1 again: the click is
    // 0.1 s after the hold ends, at 2.1 s.
    const remap = mix.parseRemap('{ at: [0, 0.4, 2.0, 2.4], to: [0, 0.4, 0.4, 0.8] }');
    const out = await mixSegment([clipOf({ buffer: b, start: 0, duration: 2.4, remap })], 0, Math.round(2.4 * 48000));
    expect(Math.abs(loudest(out) - 100800)).toBeLessThan(3);
  });
});
