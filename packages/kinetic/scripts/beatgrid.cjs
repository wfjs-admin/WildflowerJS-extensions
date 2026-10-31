#!/usr/bin/env node
/**
 * The beat grid of a music file, for an audio clip's data-tempo,
 * data-downbeat, data-meter and data-markers:
 *
 *   node beatgrid.cjs track.mp3            what it found, and the attributes to paste
 *   node beatgrid.cjs track.wav --json     the same as JSON
 *   node beatgrid.cjs -- --odd-name.wav    -- ends the options
 *
 * Every time is in the file's own seconds, which is what the attributes take.
 * A WAV file (PCM or float, the extensible format too) is read directly;
 * anything else is decoded with ffmpeg, which must be on the PATH. No npm
 * packages.
 *
 * What it does, and how sure it is:
 *
 *   tempo     spectral flux (how much the sound gets louder, band by band,
 *             every 11.6 ms) autocorrelated over 60 to 200 BPM, weighted
 *             toward the tempos music is usually written at, then refined
 *             over the whole file to a hundredth of a BPM, with the beat's
 *             phase. Reliable on music with a steady pulse; on rubato or
 *             ambient music the grid is a metronome the analysis imposes.
 *             When the half beats hit nearly as hard as the beats, a
 *             double-time reading is added; when the runner-up tempo is half
 *             the one found and every other beat hits clearly softer, a
 *             half-time reading. A file with no onsets at all is an error.
 *   meter     3 or 4 beats to a bar, from how much each beat's sound repeats
 *             3 and 6 beats later against 4 and 8, and from where the low
 *             band (kick and bass) puts its weight in the bar.
 *   downbeat  of the beats in a bar, the one where the sound changes most
 *             (new chords and bass notes start on bar lines) and the low
 *             band hits hardest. The hardest call: check it by ear.
 *   markers   bar lines where the two bars after rise or fall against the
 *             four bars before, by 2.5 dB or more over the whole band or 3 dB
 *             in the low band, one per change: drops, breakdowns and the
 *             like, as candidates to name and keep or drop.
 *
 * The tempo, the meter and the downbeat each have a confidence, high, medium
 * or low, from how far the winning answer is ahead of the next one; with no
 * steady pulse (noise, a held tone) all three are low, and a meter is low
 * under about 8 bars. The section changes have none: each prints its change
 * in dB. The values are a starting point: the composition declares what the
 * author decides.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SR = 22050;            // the analysis rate
const N = 1024;              // the FFT size
const HOP = 256;             // 11.6 ms between frames
const FR = SR / HOP;         // frames per second

// ---- Reading the file -------------------------------------------------------------

// A WAV file's samples as mono Float32 at its own rate, or null for anything
// that is not PCM (8, 16, 24 or 32 bit) or 32-bit float. The extensible
// format (0xFFFE) carries its format in the first two bytes of its subformat.
function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let fmt = null, data = null;
  for (let o = 12; o + 8 <= buf.length;) {
    const id = buf.toString('ascii', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') {
      const tag = buf.readUInt16LE(o + 8);
      fmt = { format: tag === 0xFFFE && size >= 26 ? buf.readUInt16LE(o + 8 + 24) : tag, channels: buf.readUInt16LE(o + 10), rate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    } else if (id === 'data') {
      // A writer that cannot seek back leaves the size 0: the data runs to the end of the file.
      data = buf.subarray(o + 8, size === 0 ? buf.length : Math.min(buf.length, o + 8 + size));
      if (size === 0) break;
    }
    o += 8 + size + (size & 1);
  }
  if (!fmt || !data) return null;
  if (!fmt.channels || !fmt.rate) throw new Error('not a readable WAV: its header gives ' + fmt.channels + ' channels at ' + fmt.rate + ' Hz');
  if (!(fmt.format === 1 || fmt.format === 3) || ![8, 16, 24, 32].includes(fmt.bits)) return null;
  const float = fmt.format === 3;
  const step = fmt.bits / 8, frames = Math.floor(data.length / (step * fmt.channels));
  const read = float ? (o) => data.readFloatLE(o)
    : fmt.bits === 8 ? (o) => (data[o] - 128) / 128
    : fmt.bits === 16 ? (o) => data.readInt16LE(o) / 32768
    : fmt.bits === 24 ? (o) => data.readIntLE(o, 3) / 8388608
    : (o) => data.readInt32LE(o) / 2147483648;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += read((i * fmt.channels + c) * step);
    out[i] = s / fmt.channels;
  }
  return { samples: out, rate: fmt.rate };
}

// Linear resampling, enough for analysis.
function resample(x, from, to) {
  if (from === to) return x;
  const n = Math.floor(x.length * to / from), out = new Float32Array(n), r = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * r, k = Math.floor(p), u = p - k;
    out[i] = (x[k] || 0) * (1 - u) + (x[k + 1] || 0) * u;
  }
  return out;
}

function load(file) {
  const buf = fs.readFileSync(file);
  const wav = readWav(buf);
  if (wav) return resample(wav.samples, wav.rate, SR);
  let raw;
  try {
    raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new Error(e.code === 'ENOENT' ? 'ffmpeg is not on the PATH; it is needed for anything but a PCM or float WAV file' : 'ffmpeg could not decode ' + file + ': ' + String(e.stderr || e.message).trim());
  }
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

// ---- Spectra --------------------------------------------------------------------------

// In-place radix-2 FFT of re and im.
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti;
        re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// 24 bands spaced evenly in log frequency from 40 Hz to 8 kHz; the first few
// are the low band (kick and bass, up to about 150 Hz).
const BANDS = 24, LO_HZ = 40, HI_HZ = 8000;
const edges = Array.from({ length: BANDS + 1 }, (_, b) => Math.round(LO_HZ * Math.pow(HI_HZ / LO_HZ, b / BANDS) * N / SR));
const LOW_BANDS = edges.filter((e) => e * SR / N <= 150).length - 1;

// Per frame: the log energy of each band, the flux (summed rise of the log
// band energies against the frame before) over all bands and over the low
// band, and the RMS loudness.
function analyse(x) {
  const frames = Math.max(0, Math.floor((x.length - N) / HOP) + 1);
  const bands = new Float32Array(frames * BANDS), flux = new Float32Array(frames), low = new Float32Array(frames), rms = new Float32Array(frames);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    let s2 = 0;
    for (let i = 0; i < N; i++) { const v = x[f * HOP + i]; re[i] = v * win[i]; im[i] = 0; s2 += v * v; }
    rms[f] = Math.sqrt(s2 / N);
    fft(re, im);
    for (let b = 0; b < BANDS; b++) {
      let e = 0;
      for (let k = edges[b]; k < Math.max(edges[b] + 1, edges[b + 1]); k++) e += re[k] * re[k] + im[k] * im[k];
      // Floored, so digital silence is not a cliff to climb out of.
      bands[f * BANDS + b] = Math.log(1e-4 + e);
    }
    if (f > 0) {
      let all = 0, lo = 0;
      for (let b = 0; b < BANDS; b++) {
        // Each band's rise capped, so one frame (sound starting after
        // silence) cannot outweigh the beats.
        const d = Math.min(3, Math.max(0, bands[f * BANDS + b] - bands[(f - 1) * BANDS + b]));
        all += d;
        if (b < LOW_BANDS) lo += d;
      }
      flux[f] = all; low[f] = lo;
    }
  }
  return { frames, bands, flux, low, rms, kick: kickOnset(x), attack: attackOnset(x) };
}

// The full band's onset at 1 ms: its energy per millisecond, and the rise of
// that over 2 ms, sharp at each attack.
function attackOnset(x) {
  const ms = Math.floor(x.length * 1000 / SR), env = new Float32Array(ms), on = new Float32Array(ms);
  for (let i = 0; i < ms; i++) {
    const s0 = Math.floor(i * SR / 1000), s1 = Math.floor((i + 1) * SR / 1000);
    let s = 0;
    for (let j = s0; j < s1; j++) s += x[j] * x[j];
    env[i] = Math.sqrt(s / (s1 - s0));
  }
  for (let i = 2; i < ms; i++) on[i] = Math.max(0, env[i] - env[i - 2]);
  return on;
}

// The low band's onset at 1 ms: the signal low-passed at 120 Hz (two
// second-order sections), its energy per millisecond, and the rise of that
// over 10 ms, so each kick is one sharp peak.
function kickOnset(x) {
  const w = 2 * Math.PI * 120 / SR, cw = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, a1 = -2 * cw / a0, a2 = (1 - al) / a0;
  let y = x;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(y.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const v = b0 * y[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = y[i]; y2 = y1; y1 = v; out[i] = v;
    }
    y = out;
  }
  const ms = Math.floor(y.length * 1000 / SR), env = new Float32Array(ms), on = new Float32Array(ms);
  for (let i = 0; i < ms; i++) {
    const s0 = Math.floor(i * SR / 1000), s1 = Math.floor((i + 1) * SR / 1000);
    let s = 0;
    for (let j = s0; j < s1; j++) s += y[j] * y[j];
    env[i] = Math.sqrt(s / (s1 - s0));
  }
  for (let i = 10; i < ms; i++) on[i] = Math.max(0, env[i] - env[i - 10]);
  return on;
}

// ---- Tempo -----------------------------------------------------------------------------

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
// The value of a frame curve at a fractional frame.
const sampleAt = (c, f) => { const k = Math.floor(f), u = f - k; return k < 0 || k + 1 >= c.length ? 0 : c[k] * (1 - u) + c[k + 1] * u; };

// How far the winning score is ahead of the next one, against the larger of
// the two, or against `floor` when both are small beside it. A winner at 0
// or below is no answer.
function confidence(best, next, floor = 0) {
  if (!(best > 0)) return 'low';
  const lead = (best - next) / Math.max(Math.abs(best), Math.abs(next), floor);
  return lead > 0.25 ? 'high' : lead > 0.08 ? 'medium' : 'low';
}

function findTempo(a) {
  // The onset curve, centred, with the low band counted twice: the kick
  // carries the beat in most music with one.
  const on = new Float32Array(a.frames);
  for (let f = 0; f < a.frames; f++) on[f] = a.flux[f] + 2 * a.low[f];
  const m = mean(on);
  for (let f = 0; f < on.length; f++) on[f] -= m;
  const ac = (lag) => { let s = 0; for (let f = 0; f + lag < on.length; f++) s += on[f] * on[f + lag]; return s / (on.length - lag); };
  // Autocorrelation at each lag from 60 to 200 BPM with its half and double,
  // weighted by a log-normal prior centred on 120 BPM.
  const scores = [];
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const lag = FR * 60 / bpm;
    const s = ac(Math.round(lag)) + 0.5 * ac(Math.round(2 * lag)) + 0.25 * ac(Math.round(lag / 2));
    scores.push({ bpm, s: s * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2)) });
  }
  scores.sort((x, y) => y.s - x.s);
  const best = scores[0], next = scores.find((x) => Math.abs(x.bpm - best.bpm) / best.bpm > 0.06);
  // The period refined over the whole file with the phase (to 1 ms), by the
  // mean of the 1 ms low-band onset at every beat of the grid: the kick's
  // energy, at that resolution, pins the grid where the band flux at 11.6 ms
  // frames (bass notes and the like among it) settles a few tenths of a BPM
  // off. Over a whole song the peak is sharp, so a pass at 0.02 ms steps,
  // then one at 0.002 ms round the best.
  const ko = a.kick;
  const comb = (p) => {
    let bs = -1, bph = 0;
    for (let ph = 0; ph < p; ph += 0.001) {
      let s = 0, k = 0;
      for (let t = ph; t * 1000 < ko.length - 1; t += p) { s += ko[Math.round(t * 1000)]; k++; }
      if (s / k > bs) { bs = s / k; bph = ph; }
    }
    return { s: bs, period: p, phase: bph };
  };
  let top = null;
  const p0 = 60 / best.bpm;
  for (let p = p0 * 0.985; p <= p0 * 1.015; p += 0.00002) { const c = comb(p); if (!top || c.s > top.s) top = c; }
  const q0 = top.period;
  for (let p = q0 - 0.00002; p <= q0 + 0.00002; p += 0.000002) { const c = comb(p); if (c.s > top.s) top = c; }
  // Half-time or double-time: when the half beats hit nearly as hard as the
  // beats, the music may as well be counted twice as fast (a kick on 1 and 3
  // and a snare on 2 and 4, read at half the tempo, puts the snares on the
  // half beats), or the half beats may be hats and eighth notes. Which is a
  // matter of feel, so the faster reading is offered beside the tempo found.
  const hitAt = (t) => { let m = 0; for (let f = Math.round(t * FR) - 2; f <= Math.round(t * FR) + 2; f++) m = Math.max(m, a.flux[f] || 0); return m; };
  const onBeats = [], halves = [];
  for (let t = top.phase; (t + top.period) * FR < a.frames; t += top.period) { onBeats.push(hitAt(t)); halves.push(hitAt(t + top.period / 2)); }
  const doubled = 60 / top.period * 2 <= 200 && mean(onBeats) > 0 && mean(halves) >= 0.7 * mean(onBeats);
  // Half time, the other way round: when the tempo's runner-up is half the
  // tempo found and every other beat hits clearly softer (a kick and snare at
  // 70 BPM with hats between, read at 140), the slower reading is offered
  // too, counted from the harder of the two sets of beats.
  const evens = mean(onBeats.filter((_, i) => i % 2 === 0)), odds = mean(onBeats.filter((_, i) => i % 2 === 1));
  const halved = 30 / top.period >= 60 && !!next && Math.abs(next.bpm - 30 / top.period) <= 0.03 * 30 / top.period
    && Math.min(evens, odds) < 0.7 * Math.max(evens, odds);
  // The beat at the attack. The kick curve comes through a low-pass filter
  // and a rise over 10 ms, so it peaks some way after the attack; the
  // full-band energy's rise over 2 ms marks the attack itself. The phase
  // moves to where that, averaged over every beat, peaks, within 40 ms before
  // the kick curve's peak.
  const att = a.attack, prof = [];
  for (let j = -40; j <= 5; j++) {
    let s = 0, k = 0;
    for (let t = top.phase; t * 1000 + j < att.length - 1; t += top.period) { const i = Math.round(t * 1000) + j; if (i >= 0) { s += att[i]; k++; } }
    prof.push(s / k);
  }
  let pk = 0;
  for (let j = 0; j < prof.length; j++) if (prof[j] > prof[pk]) pk = j;
  let phase = top.phase + (pk - 40) / 1000, halfPhase = phase + (odds > evens ? top.period : 0);
  while (phase < 0) phase += top.period;
  while (halfPhase < 0) halfPhase += 2 * top.period;
  // The confidence: the lead over the next tempo that is not offered as a
  // reading of its own (the double or the half), measured against half the
  // onset curve's own variance as well, since noise correlates a little at
  // every lag and a small lead among small scores is no pulse.
  const octave = (x, r) => Math.abs(x.bpm - best.bpm * r) <= 0.03 * best.bpm * r;
  const rival = scores.find((x) => Math.abs(x.bpm - best.bpm) / best.bpm > 0.06 && !(doubled && octave(x, 2)) && !(halved && octave(x, 0.5)));
  return {
    period: top.period, phase, doubled, halfTime: halved ? { period: 2 * top.period, phase: halfPhase } : null,
    confidence: confidence(best.s, rival ? rival.s : 0, ac(0) / 2),
  };
}

// ---- Meter and downbeat ----------------------------------------------------------------

function cosine(v, i, j) {
  let ab = 0, aa = 0, bb = 0;
  for (let b = 0; b < BANDS; b++) { const x = v[i * BANDS + b], y = v[j * BANDS + b]; ab += x * y; aa += x * x; bb += y * y; }
  return ab / Math.sqrt(aa * bb + 1e-12);
}

function findMeter(a, grid) {
  // Each beat's mean band energies, centred on the file's mean, and its low-band hit.
  const beats = [];
  for (let t = grid.phase; (t + grid.period) * FR < a.frames; t += grid.period) beats.push(t);
  const n = beats.length, v = new Float64Array(n * BANDS), hit = new Float64Array(n), avg = new Float64Array(BANDS);
  for (let k = 0; k < n; k++) {
    const f0 = Math.round(beats[k] * FR), f1 = Math.round((beats[k] + grid.period) * FR);
    for (let f = f0; f < f1; f++) for (let b = 0; b < BANDS; b++) v[k * BANDS + b] += a.bands[f * BANDS + b] / (f1 - f0);
    for (let f = Math.max(0, f0 - 2); f <= f0 + 3; f++) hit[k] = Math.max(hit[k], a.low[f] || 0);
  }
  for (let k = 0; k < n; k++) for (let b = 0; b < BANDS; b++) avg[b] += v[k * BANDS + b] / n;
  for (let k = 0; k < n; k++) for (let b = 0; b < BANDS; b++) v[k * BANDS + b] -= avg[b];
  const same = (lag) => { let s = 0, c = 0; for (let k = 0; k + lag < n; k++) { s += cosine(v, k, k + lag); c++; } return c ? s / c : 0; };
  // A song's sound drifts from section to section, so beats further apart
  // are less alike whatever the meter; what counts is the peak at a lag over
  // the lags either side.
  const peak = (lag) => same(lag) - (same(lag - 1) + same(lag + 1)) / 2;
  // How strongly the bar's low-band hits fall on one beat of m: the best
  // position's mean over the others'.
  const accent = (m) => {
    let best = -Infinity, rest = 0;
    for (let p = 0; p < m; p++) {
      const at = []; for (let k = p; k < n; k += m) at.push(hit[k]);
      const s = mean(at);
      rest += s;
      best = Math.max(best, s);
    }
    return best / ((rest - best) / (m - 1) + 1e-9);
  };
  const score = { 3: peak(3) + peak(6) + 0.1 * (accent(3) - 1), 4: peak(4) + peak(8) + 0.1 * (accent(4) - 1) };
  const meter = score[3] > score[4] ? 3 : 4;
  // The downbeat: of the meter's positions, the one where the sound changes
  // most from the beat before and the low band hits hardest.
  const change = new Float64Array(n);
  for (let k = 1; k < n; k++) change[k] = 1 - cosine(v, k - 1, k);
  const norm = (arr) => { const m = mean(Array.from(arr)) || 1; return (k) => arr[k] / m; };
  const ch = norm(change), hh = norm(hit);
  const at = [];
  for (let p = 0; p < meter; p++) {
    const s = []; for (let k = p; k < n; k += meter) s.push(ch(k) + hh(k));
    at.push({ p, s: mean(s) });
  }
  at.sort((x, y) => y.s - x.s);
  // Bars counted on a beat that is not sure are not sure either, and a meter
  // needs about 8 bars to compare. The scores are differences of cosines, so
  // a lead is measured against 0.1 at least.
  const pulse = grid.confidence !== 'low';
  return {
    meter, meterConfidence: pulse && n / meter >= 8 ? confidence(Math.max(score[3], score[4]), Math.min(score[3], score[4]), 0.1) : 'low',
    downbeat: beats[at[0].p], downbeatConfidence: pulse ? confidence(at[0].s, at[1].s) : 'low', beats,
  };
}

// ---- Sections --------------------------------------------------------------------------

// Bars where the music changes section: the two bars from a bar line against
// the four before it, in the whole band and in the low band (kick and bass),
// so a build-up in the bars before a drop does not hide it. A change of 2.5 dB
// in the whole band or 3 dB in the low band; of a run of bars that pass, the
// one with the biggest change.
function findSections(a, grid, bar) {
  const len = grid.period * bar.meter, all = [], low = [], times = [];
  for (let t = bar.downbeat; (t + len) * FR <= a.frames; t += len) {
    let s = 0, l = 0, c = 0;
    // Only the frames whose whole window is inside the bar: the bar's energy
    // is a linear mean, so a frame reaching into a loud next bar outweighs
    // a quiet bar.
    for (let f = Math.ceil(t * FR); f <= Math.floor((t + len) * FR) - N / HOP; f++) {
      s += a.rms[f] * a.rms[f];
      for (let b = 0; b < LOW_BANDS; b++) l += Math.exp(a.bands[f * BANDS + b]);
      c++;
    }
    times.push(t);
    all.push(10 * Math.log10(s / c + 1e-12));
    low.push(10 * Math.log10(l / c + 1e-12));
  }
  const step = (db, i) => (db[i] + db[i + 1]) / 2 - (db[i - 1] + db[i - 2] + db[i - 3] + db[i - 4]) / 4;
  const found = [];
  for (let i = 4; i + 1 < times.length; i++) {
    const d = step(all, i), dl = step(low, i);
    if (Math.abs(d) >= 2.5 || Math.abs(dl) >= 3) found.push({ bar: i, time: times[i], change: +d.toFixed(1), low: +dl.toFixed(1), size: Math.max(Math.abs(d) / 2.5, Math.abs(dl) / 3) });
  }
  // Of a run of neighbouring bars that pass with the same sign, the biggest.
  // A step passes on the four bars after it too (each pair of them against
  // four bars that reach back before it), so a run is measured bar to bar,
  // from the previous bar that passed, not from the one kept.
  const out = [];
  const sign = (x) => Math.sign(Math.abs(x.change) / 2.5 >= Math.abs(x.low) / 3 ? x.change : x.low);
  let prev = null;
  for (const s of found) {
    const last = out[out.length - 1];
    if (last && s.bar - prev.bar <= 1 && sign(prev) === sign(s)) { if (s.size > last.size) out[out.length - 1] = s; } else out.push(s);
    prev = s;
  }
  return out.map(({ size, ...s }) => s);
}

// ---- Output ----------------------------------------------------------------------------

function analyseFile(file) {
  const a = analyse(load(file));
  if (a.frames < FR * 8) throw new Error('the file is under 8 s; the grid needs a few bars of music');
  if (!a.flux.some((v) => v > 1e-3)) throw new Error('no onsets found: the file is silent, or its sound never changes');
  const grid = findTempo(a);
  // A grid's meter and its first downbeat in the file.
  const read = (g) => {
    const m = findMeter(a, { confidence: grid.confidence, ...g }), len = g.period * m.meter;
    let first = m.downbeat;
    while (first - len >= 0) first -= len;
    return { ...m, first };
  };
  const bar = read(grid), down = bar.first;
  // Counted in double time. When the bar is sure, the same bar lines: a bar
  // of 3 is 6 of the faster beats, and a bar of 4 two bars of 4. Otherwise a
  // reading of its own.
  const dbl = !grid.doubled ? null
    : bar.meterConfidence === 'high' ? { ...bar, meter: bar.meter === 3 ? 6 : 4 }
    : read({ period: grid.period / 2, phase: grid.phase });
  // Counted in half time, a reading of its own.
  const half = grid.halfTime ? read(grid.halfTime) : null;
  // Bars counted from the file's first downbeat, bar 0.
  const sections = findSections(a, grid, { meter: bar.meter, downbeat: down });
  let rise = 0, fall = 0;
  const markers = {};
  for (const s of sections) {
    const up = Math.abs(s.change) / 2.5 >= Math.abs(s.low) / 3 ? s.change > 0 : s.low > 0;
    markers[up ? 'rise' + (++rise) : 'fall' + (++fall)] = +s.time.toFixed(3);
  }
  return {
    file: path.basename(file),
    seconds: +(a.frames / FR).toFixed(2),
    bpm: +(60 / grid.period).toFixed(2), tempoConfidence: grid.confidence,
    doubleTime: dbl && { bpm: +(120 / grid.period).toFixed(2), meter: dbl.meter, meterConfidence: dbl.meterConfidence, downbeat: +dbl.first.toFixed(3), downbeatConfidence: dbl.downbeatConfidence },
    halfTime: half && { bpm: +(30 / grid.period).toFixed(2), meter: half.meter, meterConfidence: half.meterConfidence, downbeat: +half.first.toFixed(3), downbeatConfidence: half.downbeatConfidence },
    meter: bar.meter, meterConfidence: bar.meterConfidence,
    downbeat: +down.toFixed(3), downbeatConfidence: bar.downbeatConfidence,
    sections: sections.map((s) => ({ bar: s.bar, time: +s.time.toFixed(3), change: s.change, low: s.low })),
    markers,
  };
}

function report(r) {
  const lines = [
    r.file + ', ' + r.seconds + ' s',
    '  tempo     ' + r.bpm + ' BPM (' + r.tempoConfidence + ')',
    '  meter     ' + r.meter + ' beats to a bar (' + r.meterConfidence + ')',
    '  downbeat  ' + r.downbeat + ' s in the file (' + r.downbeatConfidence + '): check it by ear',
  ];
  const d = r.doubleTime, h = r.halfTime;
  if (d) {
    lines.push('  or, counted in double time (the half beats hit nearly as hard as the beats):',
      '            ' + d.bpm + ' BPM, ' + d.meter + ' beats to a bar (' + d.meterConfidence + '), downbeat ' + d.downbeat + ' s (' + d.downbeatConfidence + ')');
  }
  if (h) {
    lines.push('  or, counted in half time (every other beat hits clearly softer):',
      '            ' + h.bpm + ' BPM, ' + h.meter + ' beats to a bar (' + h.meterConfidence + '), downbeat ' + h.downbeat + ' s (' + h.downbeatConfidence + ')');
  }
  if (r.sections.length) {
    lines.push('  section changes, at bar lines (whole band / low band, the 2 bars after against the 4 before):');
    const dB = (x) => (x > 0 ? '+' : '') + x.toFixed(1);
    for (const s of r.sections) lines.push('    ' + String(s.time.toFixed(3)).padStart(8) + ' s  bar ' + String(s.bar).padStart(3) + '  ' + dB(s.change).padStart(5) + ' / ' + dB(s.low).padStart(5) + ' dB');
  }
  const attrs = 'data-tempo="' + r.bpm + '" data-downbeat="' + r.downbeat + '"' + (r.meter === 4 ? '' : ' data-meter="' + r.meter + '"');
  lines.push('', 'For the audio clip (rename the markers, keep the ones you want):', '  ' + attrs);
  // The names are rise1, fall1 and so on, so they need no quotes.
  if (Object.keys(r.markers).length) lines.push('  data-markers="{ ' + Object.keys(r.markers).map((k) => k + ': ' + r.markers[k]).join(', ') + ' }"');
  if (d) lines.push('  or, in double time:', '  data-tempo="' + d.bpm + '" data-downbeat="' + d.downbeat + '"' + (d.meter === 4 ? '' : ' data-meter="' + d.meter + '"'));
  if (h) lines.push('  or, in half time:', '  data-tempo="' + h.bpm + '" data-downbeat="' + h.downbeat + '"' + (h.meter === 4 ? '' : ' data-meter="' + h.meter + '"'));
  return lines.join('\n');
}

if (require.main === module) {
  // `--` ends the options, for a file whose name starts with `--`.
  const all = process.argv.slice(2), end = all.indexOf('--');
  const args = end < 0 ? all : all.slice(0, end), json = args.includes('--json');
  const file = end < 0 ? args.find((a) => !a.startsWith('--')) : all[end + 1];
  if (!file) { console.error('Usage: node beatgrid.cjs [--json] [--] <music file>'); process.exit(2); }
  try {
    const r = analyseFile(file);
    console.log(json ? JSON.stringify(r, null, 2) : report(r));
  } catch (e) {
    console.error('beatgrid: ' + e.message);
    process.exit(1);
  }
}

module.exports = { analyseFile, readWav };
