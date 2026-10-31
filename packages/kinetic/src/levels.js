/**
 * The analysis behind level() and spectrum(): for each frame of the
 * composition, a 2048-sample Hann window centred on the frame's time goes
 * through Kinetic's own radix-2 FFT, in JavaScript, so every machine computes
 * the same numbers. Per frame it keeps, in decibels:
 *
 *   bass    20 to 250 Hz        mid     250 Hz to 2 kHz
 *   treble  2 to 16 kHz         all     the loudness (RMS of the window,
 *                                       its mean, any DC offset, taken out)
 *
 * and, with `fine`, 64 bins on a logarithmic scale from 20 Hz to 16 kHz. A
 * bin narrower than the FFT's own spacing reads the power between its two
 * nearest FFT bins at its centre.
 *
 * Each column is then mapped from -60 dB to its loudest frame in the
 * composition onto 0 to 1, and given a release: a level falls by at most
 * 1 / (0.15 s * fps) a frame, so it falls over 0.15 s rather than in one.
 */

import { RATE, SEGMENT } from './mix.js';

const N = 2048;
const HALF = N / 2;
const STEP = RATE / N;                  // Hz between two FFT bins
const FLOOR = -60;                      // dB that maps to 0
const RELEASE = 0.15;                   // s over which a level falls from 1 to 0
const LO = 20, HI = 16000;
export const BANDS = ['bass', 'mid', 'treble', 'all'];
const EDGES = [[20, 250], [250, 2000], [2000, 16000]];
export const FINE = 64;

let re, im, cos, sin, rev, hann, norm;

// The window, the twiddle factors and the bit-reversed order, once.
function setup() {
  if (re) return;
  re = new Float64Array(N); im = new Float64Array(N);
  cos = new Float64Array(HALF); sin = new Float64Array(HALF);
  rev = new Uint16Array(N); hann = new Float64Array(N);
  let w2 = 0;
  for (let i = 0; i < HALF; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = -Math.sin(2 * Math.PI * i / N); }
  for (let i = 0; i < N; i++) {
    let r = 0;
    for (let b = 1, x = i; b < N; b <<= 1, x >>= 1) r = (r << 1) | (x & 1);
    rev[i] = r;
    hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    w2 += hann[i] * hann[i];
  }
  // One-sided power to the mean square of the windowed signal, so a full
  // scale sine reads -3 dB in its band, as its RMS does.
  norm = 2 / (N * w2);
}

function fft() {
  for (let i = 0; i < N; i++) {
    const j = rev[i];
    if (j > i) { const t = re[i]; re[i] = re[j]; re[j] = t; }
  }
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1, stride = N / size;
    for (let s = 0; s < N; s += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * stride], d = sin[k * stride];
        const a = s + k, b = a + half;
        const xr = re[b] * c - im[b] * d, xi = re[b] * d + im[b] * c;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
      }
    }
  }
}

const dB = (p) => (p > 0 ? 10 * Math.log10(p) : -Infinity);

// The power of the bins from frequency lo up to hi.
function band(lo, hi) {
  const k0 = Math.ceil(lo / STEP), k1 = Math.ceil(hi / STEP) - 1;
  let p = 0;
  if (k0 <= k1) {
    for (let k = k0; k <= k1; k++) p += re[k];
  } else {
    // Narrower than one bin: the power at its centre, between two bins.
    const at = Math.sqrt(lo * hi) / STEP, k = Math.floor(at), f = at - k;
    p = re[k] * (1 - f) + re[k + 1] * f;
  }
  return dB(p * norm);
}

// One frame's columns, in dB, from the window at `at` in `mono`. The
// window's mean is taken out first: a DC offset is no sound, and through
// the Hann window's leakage it would read as bass and as the lowest bins.
function frame(mono, at, out, row, cols) {
  let mean = 0, sum = 0;
  for (let i = 0; i < N; i++) mean += mono[at + i];
  mean /= N;
  for (let i = 0; i < N; i++) { const v = mono[at + i] - mean; sum += v * v; re[i] = v * hann[i]; im[i] = 0; }
  if (!(sum > 0)) { out.fill(-Infinity, row, row + cols); return; }
  fft();
  // The power spectrum, in place of the real part.
  for (let k = 0; k <= HALF; k++) re[k] = re[k] * re[k] + im[k] * im[k];
  for (let b = 0; b < 3; b++) out[row + b] = band(EDGES[b][0], EDGES[b][1]);
  out[row + 3] = dB(sum / N);
  for (let j = 0; j < cols - 4; j++) out[row + 4 + j] = band(LO * Math.pow(HI / LO, j / FINE), LO * Math.pow(HI / LO, (j + 1) / FINE));
}

// The table of levels, 0 to 1, for frames 0 to `frames` - 1 at `fps`, with
// `cols` columns a frame (4, or 4 + FINE). `mono(start, length)` resolves to
// the mix's samples from composition sample `start`. Frames before `from`
// and from `to` on are silent and not analysed.
export async function analyse(mono, frames, fps, cols, from = 0, to = frames) {
  setup();
  const out = new Float32Array(frames * cols).fill(-Infinity);
  const centre = (f) => Math.round(f / fps * RATE);
  for (let f = Math.max(0, from); f < Math.min(to, frames);) {
    // The frames whose centres fall in the next segment, read in one piece.
    const first = centre(f);
    let last = f;
    while (last + 1 < Math.min(to, frames) && centre(last + 1) < first + SEGMENT) last++;
    const start = first - HALF;
    const samples = await mono(start, centre(last) + HALF - start);
    for (let g = f; g <= last; g++) frame(samples, centre(g) - HALF - start, out, g * cols, cols);
    f = last + 1;
  }
  const fall = 1 / (RELEASE * fps);
  for (let c = 0; c < cols; c++) {
    let max = -Infinity;
    for (let f = 0; f < frames; f++) if (out[f * cols + c] > max) max = out[f * cols + c];
    let prev = 0;
    for (let f = 0; f < frames; f++) {
      const i = f * cols + c;
      const v = max > FLOOR ? Math.min(1, Math.max(0, (out[i] - FLOOR) / (max - FLOOR))) : 0;
      out[i] = prev = Math.max(v, prev - fall);
    }
  }
  return out;
}
