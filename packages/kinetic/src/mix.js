/**
 * The mix of a composition's audio clips, and when the preview starts them.
 * No DOM and no clock here: the render's mix, the levels' analysis
 * (levels.js) and the preview (audio.js) share these.
 *
 * A clip, as clipOf() builds it from composition seconds, is in whole
 * samples at 48 kHz: where it starts, how long it plays, how far into its
 * file it starts, and its gain as a piecewise linear envelope (the volume,
 * with the fades from the clip's own edges). The same seconds give the same
 * samples everywhere, so the mix is the same on every machine and in every
 * segment. Its rate (data-playback-rate) is file seconds per composition
 * second: the start, the length and the envelope stay in composition
 * samples, and the source plays the file at the rate, its pitch moving with
 * it.
 *
 * mixSegment(clips, start, length) renders `length` samples of the mix from
 * composition sample `start` with an OfflineAudioContext, stereo: each clip
 * that overlaps the segment is scheduled at its offset into it, its gain set
 * to the envelope's value there and ramped to each breakpoint after, so two
 * segments join without a step.
 *
 * startPlan() is the preview's start computation: the sound of composition
 * time x is heard while the frame for x is on screen.
 */

import { interpolate, easeAt } from './motion.js';
import { parseLiteral, literalProblem } from './literal.js';

export const RATE = 48000;
export const SEGMENT = 10 * RATE;      // samples in one mix segment
export const MAX_VOLUME = 3.98;        // +12 dB
export const LEAD = 0.1;               // s, how far ahead of now the preview schedules a start
export const LAG = 1 / 60;             // s, from the animation frame callback to the screen at 60 Hz
export const DRIFT = 0.045;            // s, a gap between picture and sound past this restarts the sound

// The gain over a clip of `len` samples: points [sample, gain], linear
// between. A fade in and a fade out that overlap meet where their lines cross.
function envelope(volume, len, fadeIn, fadeOut) {
  const fi = Math.min(fadeIn, len), fo = Math.min(fadeOut, len);
  if (fi > 0 && fo > 0 && fi + fo > len) {
    const x = len * fi / (fi + fo);
    return [[0, 0], [x, volume * x / fi], [len, 0]];
  }
  const env = [[0, fi > 0 ? 0 : volume]];
  if (fi > 0) env.push([fi, volume]);
  if (fo > 0) env.push([len - fo, volume]);
  env.push([len, fo > 0 ? 0 : volume]);
  return env;
}

// The envelope's gain at s samples into the clip.
export function envAt(env, s) {
  let i = 1;
  while (i < env.length - 1 && env[i][0] <= s) i++;
  const [s0, g0] = env[i - 1], [s1, g1] = env[i];
  if (s <= s0) return g0;
  if (s >= s1) return g1;
  return g0 + (g1 - g0) * (s - s0) / (s1 - s0);
}

// A playback rate as a clip plays it: 1 when it is not a number, else
// clamped to 0.1 to 10.
export const clampRate = (r) => (typeof r === 'number' && r === r ? Math.min(10, Math.max(0.1, r)) : 1);

// ---- time remapping ----------------------------------------------------------------

// data-remap on a clip: { at: [clip seconds], to: [file seconds from the
// media start], ease? } in the attribute object syntax (literal.js, JSON
// too), the clip's time remapped as a track is: linear
// between the keys, or by `ease` as a track takes it (a name, 'smooth', or
// one per segment; not a spring or another ease that overshoots, which would
// run back); before the first
// key the first file time, after the last the last, so the frame holds.
// `at` increases and `to` never goes back, both from 0 up. parseRemap(text)
// gives the remap, with `length` the last key's time, or false for anything
// else: the clip's layer says what was wrong (KN-139 for footage, KN-136
// for an <audio> clip) and plays the clip at its rate.
// An ease that leaves 0..1 or goes back between its ends (back, elastic, a
// cubic-bezier past 0..1) would run the file time back, or below 0.
function overshoots(f) {
  let was = 0;
  for (let i = 0; i <= 64; i++) {
    const v = f(i / 64);
    if (!(v >= -1e-9 && v <= 1 + 1e-9 && v >= was - 1e-9)) return true;
    was = v;
  }
  return false;
}
const overshooting = (ease) => {
  try { return (Array.isArray(ease) ? ease : [ease]).some((e) => { const f = easeAt(e, 'data-remap'); return !f.seconds && overshoots(f); }); } catch (_) { return false; }
};

export function parseRemap(text) {
  const r = parseLiteral(text);
  if (!('value' in r)) return false;
  const o = r.value;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const { at, to, ease } = o;
  for (const k in o) if (k !== 'at' && k !== 'to' && k !== 'ease') return false;
  if (!Array.isArray(at) || !Array.isArray(to) || at.length < 2 || at.length !== to.length) return false;
  for (let i = 0; i < at.length; i++) {
    if (!Number.isFinite(at[i]) || !Number.isFinite(to[i]) || at[i] < 0 || to[i] < 0) return false;
    if (i && (at[i] <= at[i - 1] || to[i] < to[i - 1])) return false;
  }
  const opts = ease === undefined ? undefined : { ease };
  try {
    const fns = ease === undefined ? [] : (Array.isArray(ease) ? ease : [ease]).map((e) => easeAt(e, 'data-remap'));
    if (fns.some((f) => f.seconds || overshoots(f))) return false;
    interpolate(0, at, to, opts);
  } catch (_) { return false; }
  return { at, to, opts, text, length: at[at.length - 1] };
}

// Development: a malformed data-remap in words, for KN-139 (footage.js) and
// KN-136 (audio.js), and the fix both suggest.
export function remapWords(text) {
  if (!__DEV__) return '';
  const why = literalProblem(text), r = why ? null : parseLiteral(text).value;
  if (r && typeof r === 'object' && r.ease !== undefined && overshooting(r.ease)) return 'data-remap="' + text + '", whose ease overshoots, which would run the file time back';
  return 'data-remap="' + text + '", which ' + (why ? 'does not read ' + why : 'is not { at: [clip seconds, increasing], to: [file seconds from the media start, never going back] } with an optional ease');
}
export const remapFix = () => (__DEV__ ? "Write data-remap as { at: [0, 1, 3], to: [0, 0.5, 3.5] }, with ease as a track takes it, such as ease: 'power2.out', or remove it." : '');

// The file seconds, from the media start, a remapped clip shows `local`
// seconds into itself.
export const remapAt = (r, local) => interpolate(local, r.at, r.to, r.opts);

// Its speed there, file seconds per second: the slope over 2 ms, one-sided
// at the first key, and 0 before it and from the last key on.
export function remapRate(r, local) {
  const first = r.at[0], last = r.length;
  if (!(local >= first && local < last)) return 0;
  const a = Math.max(first, local - 0.001), b = Math.min(last, local + 0.001);
  return (remapAt(r, b) - remapAt(r, a)) / (b - a);
}

// A clip in samples from one in seconds: { buffer (an AudioBuffer at 48 kHz),
// start, duration (null: the rest of the file from mediaStart, at the rate),
// mediaStart, volume (0 to 3.98), fadeIn, fadeOut, rate }. A length past
// the end of the file plays silence; the file never loops.
export function clipOf(o) {
  const rate = clampRate(o.rate);
  const remap = o.remap || null;   // parseRemap's, which sets the speed in place of the rate
  const offset = Math.max(0, Math.round((o.mediaStart || 0) * RATE));
  // Without a length, the clip lasts to its remap's last key, else the rest
  // of the file at the rate.
  const len = o.duration != null && o.duration > 0
    ? Math.round(o.duration * RATE)
    : remap ? Math.round(remap.length * RATE)
      : Math.max(0, Math.round((Math.round(o.buffer.duration * RATE) - offset) / rate));
  const v = o.volume == null || !(o.volume === o.volume) ? 1 : o.volume;
  const volume = Math.min(MAX_VOLUME, Math.max(0, v));
  return {
    buffer: o.buffer, start: Math.round(Math.max(0, o.start || 0) * RATE), len, offset, volume, rate, remap,
    env: envelope(volume, len, Math.max(0, Math.round((o.fadeIn || 0) * RATE)), Math.max(0, Math.round((o.fadeOut || 0) * RATE))),
  };
}

// Plays `length` samples of a clip on ctx from `into` samples into it, both
// in composition samples, starting at context time `at`, through a gain that
// follows its envelope from there. The source plays at the clip's rate, so
// it starts rate times `into` into the file and plays rate times `length` of
// it. With `edge`, the preview's paused slice: the gain there, with a linear
// ramp of `edge` seconds at each end. Returns the source.
export function play(ctx, clip, at, into, length, edge) {
  const src = ctx.createBufferSource();
  src.buffer = clip.buffer;
  const gain = ctx.createGain();
  const g = gain.gain, v = envAt(clip.env, into), end = at + length / RATE;
  if (edge) {
    g.setValueAtTime(0, at);
    g.linearRampToValueAtTime(v, at + edge);
    g.setValueAtTime(v, end - edge);
    g.linearRampToValueAtTime(0, end);
  } else {
    g.setValueAtTime(v, at);
    for (const [s, w] of clip.env) if (s > into) g.linearRampToValueAtTime(w, at + (s - into) / RATE);
  }
  const r = clip.remap;
  if (r) {
    // A remapped clip: the source starts where the remap puts `into`, and
    // its rate steps every 10 ms to the remap's average speed over that
    // step, so the file position is exact at every step's end; it stops at
    // the segment's end in context time, and a gain that is 0 through a
    // step slower than 0.1 keeps a hold silent, as a held frame is still.
    const t0 = into / RATE, span = length / RATE, d = 0.01, n = Math.max(1, Math.ceil(span / d));
    const hush = ctx.createGain();
    for (let i = 0; i < n; i++) {
      const a = t0 + i * d, b = Math.min(t0 + span, a + d);
      const s = b > a ? (remapAt(r, b) - remapAt(r, a)) / (b - a) : 0;
      // A hold is a rate of 0, which Web Audio takes: the file stands still.
      if (!i) { src.playbackRate.value = Math.max(0, s); hush.gain.value = s < 0.1 ? 0 : 1; }
      src.playbackRate.setValueAtTime(Math.max(0, s), at + i * d);
      hush.gain.setValueAtTime(s < 0.1 ? 0 : 1, at + i * d);
    }
    src.connect(hush).connect(gain).connect(ctx.destination);
    src.start(at, clip.offset / RATE + remapAt(r, t0));
    src.stop(end);
    return src;
  }
  src.playbackRate.value = clip.rate;
  src.connect(gain).connect(ctx.destination);
  src.start(at, (clip.offset + into * clip.rate) / RATE, length * clip.rate / RATE);
  return src;
}

// `length` samples of the mix from composition sample `start` (which may be
// before 0), as an AudioBuffer: stereo, or with `channels` 1 the two
// channels' mean, as the levels read it.
export function mixSegment(clips, start, length, channels = 2) {
  const ctx = new OfflineAudioContext(channels, Math.max(1, length), RATE);
  for (const c of clips) {
    const a = Math.max(start, c.start), b = Math.min(start + length, c.start + c.len);
    if (b > a) play(ctx, c, (a - start) / RATE, a - c.start, b - a);
  }
  return ctx.startRendering();
}

// ---- the preview ------------------------------------------------------------------

// The context time heard now, at performance time `perf`: from the output
// device's timestamp once it has given one, else the context's time now
// less the device's latency.
export function heardAt(perf, ts, ctxTime, latency) {
  if (ts && ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + (perf - ts.performanceTime) / 1000;
  return ctxTime - latency;
}

// The starts for a seek to composition time t, made at performance time
// perf with the context at ctxTime: everything is scheduled at when, LEAD
// ahead, and x is the composition time on screen when `when` is heard. Each
// clip that has not ended by x starts at max(when, when + its start - x),
// `into` composition seconds into the clip, and runs to its end; `offset`
// and `duration` are where in its file that is and how much of the file, in
// file seconds at the clip's rate.
export function startPlan(clips, { t, perf, ctxTime, ts, latency }) {
  const when = ctxTime + LEAD;
  const x = t + when - heardAt(perf, ts, ctxTime, latency) - LAG;
  const starts = [];
  for (const clip of clips) {
    const start = clip.start / RATE, len = clip.len / RATE;
    if (x >= start + len) continue;
    const into = Math.max(0, x - start);
    const r = clip.remap;
    starts.push({ clip, at: when + Math.max(0, start - x), into, offset: clip.offset / RATE + (r ? remapAt(r, into) : into * clip.rate), duration: r ? remapAt(r, len) - remapAt(r, into) : (len - into) * clip.rate });
  }
  return { when, x, starts };
}

// The composition time on screen less the time being heard, for sound
// started by the plan whose `x` was heard at context time `when`, with the
// context time heard now `heard`.
export const drift = (anchor, t, heard) => (t - LAG) - (anchor.x + heard - anchor.when);
