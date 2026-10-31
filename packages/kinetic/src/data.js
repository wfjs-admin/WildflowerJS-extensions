/**
 * Data helpers for scene computeds: charts, races, captions and beats. Pure
 * functions of their arguments and the time.
 *
 *   ticks(min, max, count)      "nice" axis values covering the range
 *   rank(t, rows, by)           each row's value and position at a fractional
 *                               keyframe t, for a bar race
 *   captions(t, words, opts)    the caption line current at t, from a
 *                               HyperFrames transcript, with per-word state
 *   moment(t, rows)             the row of a timing table current at t, with
 *                               its start, end, progress and per-row state
 *   srt(text)                   SRT or WebVTT subtitles as such a transcript
 *   beat(t, beats, opts)        a decaying pulse from a HyperFrames beat file
 *
 * Lines and sorted copies are cached per input array and its length, so a
 * computed that calls these on every seek does the grouping once, and an
 * array that grows is grouped again. An edit in place that keeps the length
 * is not seen; hand over a new array for that.
 */

import { CODES, fail, show, checkTime } from './diagnostics.js';

// ---- ticks --------------------------------------------------------------------

// Heckbert's nice numbers: 1, 2, 5 times a power of ten.
function nice(range, round) {
  const exp = Math.floor(Math.log10(range));
  const f = range / Math.pow(10, exp);
  const nf = round
    ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10)
    : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
  return nf * Math.pow(10, exp);
}

const MAX_TICKS = 1000;

// About `count` evenly spaced round values from at or below min to at or
// above max: [0, 20, 40, 60, 80, 100] for 0..100 and 5.
export function ticks(min, max, count) {
  const n = count === undefined ? 5 : count;
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw fail(CODES.BAD_CALL, 'ticks(min, max)', __DEV__ && 'min and max are finite numbers, not ' + show(min) + ' and ' + show(max));
  if (!(typeof n === 'number' && n >= 2 && n <= MAX_TICKS)) throw fail(CODES.BAD_CALL, 'ticks(…, count)', __DEV__ && 'count is a number from 2 to ' + MAX_TICKS + ', not ' + show(count));
  if (min > max) { const s = min; min = max; max = s; }
  if (min === max) return [min];
  // Near the largest numbers the step or the ends overflow to Infinity. Near
  // the smallest the step underflows to 0, and a range tiny beside the size
  // of its ends rounds to repeated values. The where is the call with its two
  // numbers, finite by now, since they are what cannot be divided.
  const degenerate = (what) => fail(CODES.BAD_CALL, 'ticks(' + min + ', ' + max + ')', __DEV__ && what + ' to divide into round steps');
  const step = nice(nice(max - min, false) / (n - 1), true);
  if (!(step > 0)) throw degenerate(__DEV__ && 'the range is too small');
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  if (!Number.isFinite(step) || !Number.isFinite(lo) || !Number.isFinite(hi + step)) throw degenerate(__DEV__ && 'the numbers are too large');
  const decimals = Math.min(100, Math.max(0, -Math.floor(Math.log10(step))));   // toFixed takes 0 to 100
  const out = [];
  for (let i = 0; ; i++) {
    const v = lo + i * step;
    if (v > hi + step / 2) break;
    const r = Number(v.toFixed(decimals));
    if (out.length && !(r > out[out.length - 1])) throw degenerate(__DEV__ && 'the range is too small');
    out.push(r);
  }
  return out;
}

// ---- rank ---------------------------------------------------------------------

// Each row's value and position (0 is first) at t, where whole numbers of t
// are the keyframes `by(row, k, index)` knows and the fraction between two
// of them blends their values and their orderings. Descending unless
// opts.ascending; ties keep input order.
export function rank(t, rows, by, opts) {
  checkTime(t, 'rank', 1);
  if (!Array.isArray(rows)) throw fail(CODES.BAD_CALL, 'rank(t, rows)', __DEV__ && 'rows is an array');
  if (typeof by !== 'function') throw fail(CODES.BAD_CALL, 'rank(…, by)', __DEV__ &&'by is a function (row, keyframe, index) returning a number');
  const asc = !!(opts && opts.ascending);
  const lo = Math.floor(t), hi = Math.ceil(t), f = t - lo;
  const valuesAt = (k) => rows.map((r, i) => { const v = Number(by(r, k, i)); return Number.isFinite(v) ? v : 0; });
  const order = (vals) => {
    const idx = rows.map((_, i) => i);
    idx.sort((a, b) => (asc ? vals[a] - vals[b] : vals[b] - vals[a]) || a - b);
    const pos = new Array(rows.length);
    idx.forEach((i, p) => { pos[i] = p; });
    return pos;
  };
  const vLo = valuesAt(lo), pLo = order(vLo);
  if (hi === lo) return rows.map((row, i) => ({ row, index: i, value: vLo[i], position: pLo[i] }));
  const vHi = valuesAt(hi), pHi = order(vHi);
  return rows.map((row, i) => ({ row, index: i, value: vLo[i] + (vHi[i] - vLo[i]) * f, position: pLo[i] + (pHi[i] - pLo[i]) * f }));
}

// ---- captions -------------------------------------------------------------------

const lineCache = new WeakMap();   // words array -> { length, byKey: { key: lines } }

const SENTENCE_END = /[.!?]["')\]]?$/;

function checkWords(words) {
  if (!Array.isArray(words)) throw fail(CODES.BAD_CALL, 'captions(t, words)', __DEV__ && 'words is an array of { text, start, end }');
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (!w || typeof w.text !== 'string' || !Number.isFinite(w.start) || !Number.isFinite(w.end)) {
      throw fail(CODES.BAD_CALL, 'captions(t, words[' + i + '])', __DEV__ &&'words[' + i + '] is not { text, start, end }');
    }
  }
}

// maxWords and maxChars are whole numbers from 1, maxGap and hold seconds
// from 0; each may be Infinity, for no limit. sentences is a boolean.
function checkOptions(o) {
  for (const k of ['maxWords', 'maxChars', 'maxGap', 'hold', 'sentences']) {
    const v = o[k], whole = k === 'maxWords' || k === 'maxChars';
    const ok = k === 'sentences' ? typeof v === 'boolean' : whole ? (Number.isInteger(v) || v === Infinity) && v >= 1 : typeof v === 'number' && v >= 0;
    if (!ok) throw fail(CODES.BAD_CALL, 'captions(t, words, { ' + k + ' })', __DEV__ && k + ' is ' + (k === 'sentences' ? 'true or false' : whole ? 'a whole number from 1' : 'seconds, 0 or more') + ', not ' + show(v));
  }
}

function buildLines(words, o) {
  const sorted = words.map((w, i) => ({ key: w.id === undefined ? i : w.id, text: w.text, start: w.start, end: w.end })).sort((a, b) => a.start - b.start);
  const lines = [];
  let line = null;
  for (const w of sorted) {
    const prev = line && line.words[line.words.length - 1];
    const breakHere = !line
      || line.words.length >= o.maxWords
      || line.text.length + 1 + w.text.length > o.maxChars
      || w.start - prev.end > o.maxGap
      || (o.sentences && SENTENCE_END.test(prev.text));
    if (breakHere) {
      line = { index: lines.length, start: w.start, end: w.end, text: w.text, words: [w] };
      lines.push(line);
    } else {
      line.words.push(w);
      line.end = Math.max(line.end, w.end);
      line.text += ' ' + w.text;
    }
  }
  return lines;
}

// A fresh object each time: a frozen, shared one would be handed to a
// data-list, which keeps its own bookkeeping on the arrays it renders.
const empty = () => ({ index: -1, start: 0, end: 0, text: '', words: [], empty: true });

// The line current at t from a HyperFrames transcript ([{ id, text, start,
// end }]): words grouped into lines at a sentence end, a gap over maxGap
// seconds, maxWords or maxChars. Each word carries state ('past', 'active'
// or 'future') and p, its own progress 0..1. A line shows from its first
// word until the next line starts, at most `hold` seconds after its last
// word ends. Between lines, or before the first, the result is empty, with
// `words: []`, so a data-list over it renders nothing.
export function captions(t, words, opts) {
  checkTime(t, 'captions');
  checkWords(words);
  // Per key, so an option passed as undefined takes its default.
  const given = opts || {};
  const or = (v, d) => (v === undefined ? d : v);
  const o = {
    maxWords: or(given.maxWords, 5), maxChars: or(given.maxChars, 40), maxGap: or(given.maxGap, 1),
    sentences: or(given.sentences, true), hold: or(given.hold, 0.4),
  };
  checkOptions(o);
  const key = [o.maxWords, o.maxChars, o.maxGap, o.sentences ? 1 : 0].join(' ');
  let cached = lineCache.get(words);
  if (!cached || cached.length !== words.length) { cached = { length: words.length, byKey: {} }; lineCache.set(words, cached); }
  const lines = cached.byKey[key] || (cached.byKey[key] = buildLines(words, o));
  if (!lines.length || t === Infinity || t < lines[0].start) return empty();
  let lo = 0, hi = lines.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid].start <= t) lo = mid; else hi = mid - 1;
  }
  const line = lines[lo];
  const next = lines[lo + 1];
  const until = Math.min(next ? next.start : Infinity, line.end + o.hold);
  if (t >= until) return empty();
  return {
    index: line.index, start: line.start, end: line.end, text: line.text, empty: false,
    words: line.words.map((w) => ({
      key: w.key, text: w.text, start: w.start, end: w.end,
      state: t < w.start ? 'future' : t >= w.end ? 'past' : 'active',
      p: t < w.start ? 0 : t >= w.end ? 1 : (t - w.start) / (w.end - w.start),
    })),
  };
}

// ---- moment ---------------------------------------------------------------------

// A timing table's rows in time order, each with its start and end: its own
// end, or the next row's at, or Infinity for the last. Checked and sorted
// once per array and length; the sort is stable, so rows with equal times
// keep their order.
const momentCache = new WeakMap();   // rows array -> { length, spans }
function spansOf(rows) {
  const cached = momentCache.get(rows);
  if (cached && cached.length === rows.length) return cached.spans;
  const order = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r || typeof r !== 'object') throw fail(CODES.BAD_CALL, 'moment(t, rows[' + i + '])', __DEV__ && 'rows[' + i + '] is an object with at, the seconds it starts, not ' + show(r));
    if (!Number.isFinite(r.at)) throw fail(CODES.BAD_CALL, 'moment(t, rows[' + i + '].at)', __DEV__ && 'at is a finite number of seconds, not ' + show(r.at));
    // A null end is no end, as JSON writes it.
    if (r.end != null && !(typeof r.end === 'number' && r.end >= r.at)) throw fail(CODES.BAD_CALL, 'moment(t, rows[' + i + '].end)', __DEV__ && 'end is a number of seconds at or after its at (' + r.at + '), not ' + show(r.end));
    order.push(r);
  }
  order.sort((a, b) => a.at - b.at);
  const spans = order.map((row, k) => ({ row, start: row.at, end: row.end != null ? row.end : k + 1 < order.length ? order[k + 1].at : Infinity }));
  momentCache.set(rows, { length: rows.length, spans });
  return spans;
}

// The row current at t: the last whose at is at or before t, while t is
// before its end. index is its place in time order. Between rows, or before
// the first, the result is empty, with next the row to come. Each row's
// state is 'past', 'active' or 'future', and p its progress 0..1; a row
// with no length (the last, with no end) has p 0 while it is active.
export function moment(t, rows) {
  checkTime(t, 'moment');
  if (!Array.isArray(rows)) throw fail(CODES.BAD_CALL, 'moment(t, rows)', __DEV__ && 'rows is an array of { at, end }, the seconds each starts and, if it stops before the next, ends');
  const spans = spansOf(rows);
  let lo = 0, hi = spans.length - 1, k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (spans[mid].start <= t) { k = mid; lo = mid + 1; } else hi = mid - 1;
  }
  // A row with no end is never past, even at t = Infinity.
  const past = (s) => s.end !== Infinity && t >= s.end;
  const progress = (s) => (t < s.start ? 0 : past(s) ? 1 : s.end === Infinity ? 0 : (t - s.start) / (s.end - s.start));
  const list = spans.map((s, key) => ({ key, row: s.row, state: t < s.start ? 'future' : past(s) ? 'past' : 'active', p: progress(s) }));
  const next = spans[k + 1] ? spans[k + 1].row : null;
  const s = spans[k];
  if (!s || past(s)) return { index: -1, row: null, start: 0, end: 0, since: 0, p: 0, next, empty: true, rows: list };
  return { index: k, row: s.row, start: s.start, end: s.end, since: t - s.start, p: progress(s), next, empty: false, rows: list };
}

// ---- srt ------------------------------------------------------------------------

// A cue's timing line: hh:mm:ss,mmm (SRT) or hh:mm:ss.mmm or mm:ss.mmm
// (WebVTT) on each side of the arrow, and anything after it (VTT cue
// settings, SRT coordinates) left out.
const CUE = /((?:\d+:)?\d+:\d+[,.]\d+)[ \t]*-->[ \t]*((?:\d+:)?\d+:\d+[,.]\d+)/;
const seconds = (s) => s.replace(',', '.').split(':').reduce((a, v) => a * 60 + Number(v), 0);

// The character references WebVTT defines for cue text.
const ENTITIES = { amp: '&', lt: '<', gt: '>', nbsp: ' ', lrm: '‎', rlm: '‏' };

// SRT or WebVTT subtitles as a transcript captions() takes, [{ id, text,
// start, end }], one entry per word. Each timing line starts a cue, whose
// text is the lines after it up to a blank line or the next timing line;
// with no blank line before a timing line, a number on the line above it is
// that cue's number, not the last cue's text. Lines outside a cue (a VTT
// header, NOTE, STYLE or REGION) are skipped. Line breaks become spaces;
// tags (<i>, <v Speaker>, <00:00:01.000>) and SRT override tags ({\an8}) are
// dropped, then the WebVTT entities are decoded, so a < that opens no tag
// stays. Words are split at whitespace other than a non-breaking space, and
// share the cue's time in proportion to their lengths in characters, the
// last ending at the cue's end.
export function srt(text) {
  if (typeof text !== 'string') throw fail(CODES.BAD_CALL, 'srt(text)', __DEV__ && 'text is the SRT or WebVTT file as a string, not ' + show(text));
  const cues = [];
  let cue = null;
  text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').forEach((line, j) => {
    const m = CUE.exec(line);
    if (m) {
      if (cue && cue.last === j - 1 && /^\d+$/.test(cue.text[cue.text.length - 1].trim())) cue.text.pop();
      cues.push(cue = { start: seconds(m[1]), end: seconds(m[2]), text: [] });
    } else if (!line.trim()) cue = null;
    else if (cue) { cue.text.push(line); cue.last = j; }
  });
  if (!cues.length) throw fail(CODES.BAD_CALL, 'srt(text): 0 cues', __DEV__ &&'text is SRT or WebVTT subtitles with at least one cue (00:00:01,000 --> 00:00:02,500 and its text), and this one has none');
  const words = [];
  for (const { start, end, text: lines } of cues) {
    const ws = lines.join(' ').replace(/<\/?[A-Za-z][^>]*>|<\d[\d:.]*>|\{\\[^}]*\}/g, '')
      .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/g, (_, e) => ENTITIES[e])
      .split(/[^\S ]+/).filter(Boolean);
    const chars = ws.reduce((n, w) => n + w.length, 0);
    let done = 0;
    ws.forEach((w, j) => {
      const from = start + ((end - start) * done) / chars;
      done += w.length;
      words.push({ id: 'w' + words.length, text: w, start: from, end: j === ws.length - 1 ? end : start + ((end - start) * done) / chars });
    });
  }
  return words;
}

// ---- beat -----------------------------------------------------------------------

const beatCache = new WeakMap();   // beats array -> { length, sorted: [{ time, strength }] }

// A pulse at t from a beat file ({ version, audio, beats } or just its
// beats array): each beat's strength (0..1, 0.5 when absent) decaying as
// e^(-elapsed / decay), the strongest still ringing winning. 0 before the
// first beat. decay defaults to 0.2 s.
export function beat(t, beats, opts) {
  checkTime(t, 'beat');
  const arr = Array.isArray(beats) ? beats : beats && Array.isArray(beats.beats) ? beats.beats : null;
  if (!arr) throw fail(CODES.BAD_CALL, 'beat(…, beats)', __DEV__ &&'beats is a beat file ({ beats: [{ time, strength }] }) or its beats array');
  const decay = opts && opts.decay !== undefined ? opts.decay : 0.2;
  if (!(typeof decay === 'number' && decay > 0)) throw fail(CODES.BAD_CALL, 'beat(t, beats, { decay })', __DEV__ && 'decay is seconds above 0, not ' + show(decay));
  let cached = beatCache.get(arr);
  if (!cached || cached.length !== arr.length) {
    const list = arr.filter((b) => b && typeof b.time === 'number' && Number.isFinite(b.time))
      .map((b) => ({ time: b.time, strength: Number.isFinite(b.strength) ? Math.min(1, Math.max(0, b.strength)) : 0.5 }))
      .sort((a, b) => a.time - b.time);
    cached = { length: arr.length, sorted: list };
    beatCache.set(arr, cached);
  }
  const sorted = cached.sorted;
  let lo = 0, hi = sorted.length - 1;
  if (!sorted.length || t < sorted[0].time) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sorted[mid].time <= t) lo = mid; else hi = mid - 1;
  }
  let v = 0;
  for (let i = lo; i >= 0 && t - sorted[i].time < decay * 8; i--) {
    v = Math.max(v, sorted[i].strength * Math.exp(-(t - sorted[i].time) / decay));
  }
  return v;
}
