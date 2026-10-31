/**
 * The data helpers: ticks() for axes, rank() for races, captions() over a
 * HyperFrames transcript and beat() over a HyperFrames beat file.
 */
import { describe, it, expect } from 'vitest';
import { load, expectKN, BUILD, CORE_TIER } from './helpers.js';

describe(`data (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('ticks: round steps covering the range', async () => {
    const { wf } = await load();
    const { ticks } = wf.kinetic;
    expect(ticks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(ticks(0, 7, 5)).toEqual([0, 2, 4, 6, 8]);
    expect(ticks(0, 0.73, 4)).toEqual([0, 0.5, 1]);
    expect(ticks(0, 1)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(ticks(1, 0)).toEqual(ticks(0, 1));
    expect(ticks(-50, 50, 5)).toEqual([-60, -40, -20, 0, 20, 40, 60]);
    expect(ticks(5, 5)).toEqual([5]);
    expect(ticks(12, 987654, 6)).toEqual([0, 200000, 400000, 600000, 800000, 1000000]);
    expect(() => ticks('0', 1)).toThrow(/KN-100/);
    expect(() => ticks(0, 1, 1)).toThrow(/KN-100/);
  });

  it('rank: values and positions blend between two keyframe orderings', async () => {
    const { wf } = await load();
    const { rank } = wf.kinetic;
    const rows = [{ id: 'a', v: [10, 30] }, { id: 'b', v: [20, 20] }, { id: 'c', v: [30, 10] }];
    const by = (r, k) => r.v[k];
    const at = (t) => rank(t, rows, by).map((x) => [x.row.id, x.index, x.value, x.position]);
    expect(at(0)).toEqual([['a', 0, 10, 2], ['b', 1, 20, 1], ['c', 2, 30, 0]]);
    expect(at(1)).toEqual([['a', 0, 30, 0], ['b', 1, 20, 1], ['c', 2, 10, 2]]);
    expect(at(0.5)).toEqual([['a', 0, 20, 1], ['b', 1, 20, 1], ['c', 2, 20, 1]]);
    expect(at(0.25).map((x) => x[3])).toEqual([1.5, 1, 0.5]);
    expect(rank(0, rows, by, { ascending: true }).map((x) => x.position)).toEqual([0, 1, 2]);
    // Ties keep input order; a non-number keyframe reads as 0.
    expect(rank(0, [{ v: 1 }, { v: 1 }], (r) => r.v).map((x) => x.position)).toEqual([0, 1]);
    expect(() => rank(NaN, rows, by)).toThrow(/KN-100/);
    expect(() => rank(0, null, by)).toThrow(/KN-100/);
    expect(() => rank(0, rows, 3)).toThrow(/KN-100/);
  });

  it('captions: lines from a transcript, the current one with word states', async () => {
    const { wf } = await load();
    const { captions } = wf.kinetic;
    const words = [
      { id: 'w0', text: 'Hello', start: 0, end: 0.4 },
      { id: 'w1', text: 'there.', start: 0.4, end: 0.8 },        // sentence end: a new line after it
      { id: 'w2', text: 'Big', start: 0.9, end: 1.2 },
      { id: 'w3', text: 'wide', start: 1.2, end: 1.5 },
      { id: 'w4', text: 'world', start: 1.5, end: 1.9 },
      { id: 'w5', text: 'again', start: 1.9, end: 2.2 },          // maxWords 3: a new line
      { id: 'w6', text: 'later', start: 4, end: 4.5 },            // gap over maxGap: a new line
    ];
    const o = { maxWords: 3 };
    expect(captions(-1, words, o).empty).toBe(true);
    const l0 = captions(0.5, words, o);
    expect(l0.index).toBe(0);
    expect(l0.text).toBe('Hello there.');
    expect(l0.words.map((w) => [w.key, w.state, Number(w.p.toFixed(2))])).toEqual([['w0', 'past', 1], ['w1', 'active', 0.25]]);
    const l1 = captions(1.3, words, o);
    expect(l1.text).toBe('Big wide world');
    expect(l1.words.map((w) => w.state)).toEqual(['past', 'active', 'future']);
    expect(captions(2, words, o).text).toBe('again');
    // After a line's end: held for 0.4 s, then empty until the next line.
    expect(captions(2.5, words, o).text).toBe('again');
    expect(captions(2.7, words, o).empty).toBe(true);
    expect(captions(2.7, words, { maxWords: 3, hold: Infinity }).text).toBe('again');
    expect(captions(4.2, words, o).text).toBe('later');
    expect(captions(9, words, o).empty).toBe(true);
    // Line 0 ends at 0.8 and line 1 starts at 0.9: the hold stops at the next line.
    expect(captions(0.85, words, o).index).toBe(0);
    expect(captions(0.9, words, o).index).toBe(1);
    // Without the sentence rule, maxWords alone breaks the lines.
    expect(captions(0.5, words, { maxWords: 3, sentences: false }).text).toBe('Hello there. Big');
    expect(captions(0.2, words, { maxWords: 3, maxChars: 8 }).text).toBe('Hello');
    expect(captions(0.5, words, { maxWords: 3, maxChars: 8 }).text).toBe('there.');
    expect(captions(1, []).empty).toBe(true);
    expect(() => captions(0, [{ text: 'x' }])).toThrow(/KN-100/);
    expect(() => captions(0, 'x')).toThrow(/KN-100/);
  });

  it('beat: a pulse that decays from each beat, the file or its array', async () => {
    const { wf } = await load();
    const { beat } = wf.kinetic;
    const file = { version: 1, audio: 'a.mp3', beats: [{ time: 2, strength: 0.5 }, { time: 1, strength: 1 }, { time: 3 }] };
    expect(beat(0.5, file)).toBe(0);
    expect(beat(1, file)).toBe(1);
    expect(beat(1.2, file)).toBeCloseTo(Math.exp(-1), 9);
    expect(beat(2, file)).toBe(0.5);
    expect(beat(3, file.beats)).toBe(0.5);                       // strength absent: 0.5
    expect(beat(1.2, file, { decay: 0.4 })).toBeCloseTo(Math.exp(-0.5), 9);
    // A quiet beat soon after a loud one: the loud one still rings.
    const loud = [{ time: 1, strength: 1 }, { time: 1.05, strength: 0.1 }];
    expect(beat(1.06, loud)).toBeCloseTo(Math.exp(-0.06 / 0.2), 9);
    expect(() => beat(NaN, file)).toThrow(/KN-100/);
    expect(beat(Infinity, file)).toBe(0);
    expect(beat(1, [])).toBe(0);
    expect(() => beat(1, null)).toThrow(/KN-100/);
    expect(() => beat(1, file, { decay: 0 })).toThrow(/KN-100/);
  });

  it('ticks: a bounded count, and KN-100 where the range is too small or too large for the arithmetic', async () => {
    const { wf } = await load();
    const { ticks } = wf.kinetic;
    expect(() => ticks(0, 1, 1e9)).toThrow(/KN-100/);
    expect(() => ticks(0, 1, Infinity)).toThrow(/KN-100/);
    expect(() => ticks(0, 1, NaN)).toThrow(/KN-100/);
    expect(ticks(0, 1000, 1000).length).toBeGreaterThan(500);
    for (const [lo, hi] of [[0, 1e-110], [0, 5e-324], [0, 1e-320], [1e17, 1e17 + 16]]) {
      // The where is the call with its two numbers, which are what cannot be divided.
      expectKN(() => ticks(lo, hi), 'KN-100', 'ticks(' + lo + ', ' + hi + ')', /^the range is too small to divide into round steps/);
    }
    for (const [lo, hi] of [[-1e308, 1e308], [0, 1.7e308], [-1.7e308, 0]]) {
      expectKN(() => ticks(lo, hi), 'KN-100', 'ticks(' + lo + ', ' + hi + ')', /^the numbers are too large to divide into round steps/);
    }
    // The ends of what still works.
    expect(ticks(0, 1e-90, 2)).toEqual([0, 1e-90]);
    expect(ticks(0, 1e308, 6)).toEqual([0, 2e307, 4e307, 6e307, 8e307, 1e308]);
  });

  it('captions: an option passed as undefined takes its default', async () => {
    const { wf } = await load();
    const { captions } = wf.kinetic;
    expect(captions(40, [{ text: 'a.', start: 0, end: 1 }], { hold: undefined }).empty).toBe(true);
    const words = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'].map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.3 }));
    const opts = { maxWords: undefined, maxChars: undefined, maxGap: undefined, sentences: undefined, hold: undefined };
    expect(captions(0.1, words, opts).text).toBe('one two three four five');
    expect(captions(0.1, words, opts)).toEqual(captions(0.1, words));
    const long = [{ text: 'a'.repeat(30), start: 0, end: 0.5 }, { text: 'b'.repeat(30), start: 0.5, end: 1 }];
    expect(captions(0.2, long, { maxChars: undefined }).text).toBe('a'.repeat(30));
    const gap = [{ text: 'x', start: 0, end: 0.5 }, { text: 'y', start: 5, end: 5.5 }];
    expect(captions(0.2, gap, { maxGap: undefined, hold: 10 }).text).toBe('x');
  });

  it('captions and beat: an entry pushed onto the array is seen on the next call', async () => {
    const { wf } = await load();
    const { captions, beat } = wf.kinetic;
    const words = [{ text: 'first.', start: 0, end: 1 }];
    expect(captions(2.5, words).empty).toBe(true);
    words.push({ text: 'second', start: 2, end: 3 });
    expect(captions(2.5, words).text).toBe('second');
    const beats = [{ time: 1, strength: 1 }];
    expect(beat(5, beats)).toBeLessThan(1e-6);
    beats.push({ time: 5, strength: 1 });
    expect(beat(5, beats)).toBe(1);
  });

  // The fields of each word, its times to nine decimals.
  const fields = (words) => words.map((w) => [w.id, w.text, Number(w.start.toFixed(9)), Number(w.end.toFixed(9))]);

  const SRT = [
    '1',
    '00:00:01,000 --> 00:00:02,500',
    'Hello there,',
    'big world.',
    '',
    '2',
    '00:00:03,000 --> 00:00:04,000',
    '<i>Again</i>',
    '',
    '3',
    '01:00:00,000 --> 01:00:01,500 X1:40 X2:600 Y1:20 Y2:50',
    'Late',
    '',
  ].join('\n');

  it('srt: SRT cues as a transcript, one word each, sharing the cue by length, the last word ending at the cue; captions() reads it', async () => {
    const { wf } = await load();
    const { srt, captions } = wf.kinetic;
    const words = srt(SRT);
    // Cue 1 has 5 + 6 + 3 + 6 = 20 characters over 1.5 s; its line break is a space.
    expect(fields(words)).toEqual([
      ['w0', 'Hello', 1, 1.375], ['w1', 'there,', 1.375, 1.825], ['w2', 'big', 1.825, 2.05], ['w3', 'world.', 2.05, 2.5],
      ['w4', 'Again', 3, 4],
      ['w5', 'Late', 3600, 3601.5],
    ]);
    expect(words[3].end).toBe(2.5);
    expect(Object.keys(words[0]).sort()).toEqual(['end', 'id', 'start', 'text']);
    // Windows line endings read the same.
    expect(srt(SRT.replace(/\n/g, '\r\n'))).toEqual(words);
    const line = captions(1.5, words);
    expect(line.text).toBe('Hello there, big world.');
    expect(line.words.map((w) => [w.key, w.state])).toEqual([['w0', 'past'], ['w1', 'active'], ['w2', 'future'], ['w3', 'future']]);
    expect(captions(3.5, words).text).toBe('Again');
    expect(captions(3600.2, words).text).toBe('Late');
  });

  it('srt: WebVTT with mm:ss.mmm times, a header, a note, cue identifiers and settings, and tags dropped', async () => {
    const { wf } = await load();
    const { srt, captions } = wf.kinetic;
    const VTT = [
      'WEBVTT - a title',
      'Kind: captions',
      '',
      'NOTE a comment',
      'over two lines',
      '',
      'STYLE',
      '::cue { color: yellow }',
      '',
      'intro',
      '00:01.000 --> 00:02.000 align:start position:10%',
      '<v Ana>Hi <c.loud>you</c></v>',
      '',
      '00:00:02.500 --> 00:00:04.000',
      'Two <00:00:03.000>words',
      '<b>here</b>',
      '',
    ].join('\n');
    // Cue 1: 2 + 3 characters over a second. Cue 2: 3 + 5 + 4 over 1.5 s.
    expect(fields(srt(VTT))).toEqual([
      ['w0', 'Hi', 1, 1.4], ['w1', 'you', 1.4, 2],
      ['w2', 'Two', 2.5, 2.875], ['w3', 'words', 2.875, 3.5], ['w4', 'here', 3.5, 4],
    ]);
    // The 0.5 s between the cues is a line break at maxGap 0.4.
    expect(captions(1.2, srt(VTT), { maxGap: 0.4 }).text).toBe('Hi you');
    expect(captions(3, srt(VTT), { maxGap: 0.4 }).words.map((w) => w.state)).toEqual(['past', 'active', 'future']);
    // A cue whose text is only tags has no words.
    expect(srt('00:00.000 --> 00:01.000\n<i></i>\n\n00:01.000 --> 00:02.000\nyes')).toEqual([{ id: 'w0', text: 'yes', start: 1, end: 2 }]);
  });

  it("srt: a BOM, WebVTT's entities, a raw < or >, SRT's {\\an8} override tags, and cues with no blank line between them", async () => {
    const { wf } = await load();
    const { srt } = wf.kinetic;
    const words = (text) => srt(text).map((w) => w.text);
    // A byte order mark before the first cue.
    expect(fields(srt('﻿00:00:01.000 --> 00:00:02.000\nHi there'))).toEqual([['w0', 'Hi', 1, 1.285714286], ['w1', 'there', 1.285714286, 2]]);
    expect(words('﻿WEBVTT\n\n00:01.000 --> 00:02.000\nHi')).toEqual(['Hi']);
    // Only tags are dropped: a < or > in the text stays.
    expect(words('1\n00:00:01,000 --> 00:00:03,000\nif a < b and c > d')).toEqual(['if', 'a', '<', 'b', 'and', 'c', '>', 'd']);
    expect(words('1\n00:00:01,000 --> 00:00:03,000\n3<5 and <b>bold</b> <00:00:02.000>now')).toEqual(['3<5', 'and', 'bold', 'now']);
    // The WebVTT entities, decoded after the tags are dropped; a non-breaking space joins its two words.
    expect(words('00:01.000 --> 00:02.000\nTom &amp; Jerry &lt;3 &gt; 10&nbsp;km &lrm;x&rlm; &copy;')).toEqual(['Tom', '&', 'Jerry', '<3', '>', '10 km', '‎x‏', '&copy;']);
    expect(words('00:01.000 --> 00:02.000\n&lt;i&gt;kept&lt;/i&gt;')).toEqual(['<i>kept</i>']);
    // SRT override tags such as {\an8} (top centre) are dropped.
    expect(words('1\n00:00:01,000 --> 00:00:02,000\n{\\an8}Top {\\i1}line{\\i0}')).toEqual(['Top', 'line']);
    // A missing blank line still starts a new cue at the next timing line; the number before it is not a word.
    const merged = '1\n00:00:01,000 --> 00:00:02,000\nFirst cue\n2\n00:00:03,000 --> 00:00:04,000\nSecond cue\n';
    expect(fields(srt(merged))).toEqual([['w0', 'First', 1, 1.625], ['w1', 'cue', 1.625, 2], ['w2', 'Second', 3, 3.666666667], ['w3', 'cue', 3.666666667, 4]]);
    expect(fields(srt('00:01.000 --> 00:02.000\nOne\n00:02.000 --> 00:03.000\nTwo'))).toEqual([['w0', 'One', 1, 2], ['w1', 'Two', 2, 3]]);
  });

  it('srt: KN-100 for a text with no cue, or a value that is not a string', async () => {
    const { wf } = await load();
    const { srt } = wf.kinetic;
    for (const bad of ['', 'WEBVTT\n\nNOTE nothing here', 'just some text', '1\n00:00:01 --> 00:00:02\nno milliseconds', null, 42, ['00:00.000 --> 00:01.000\nx']]) {
      // A string with no cue is a different mistake from a value that is no string.
      expectKN(() => srt(bad), 'KN-100', typeof bad === 'string' ? 'srt(text): 0 cues' : 'srt(text)', /^text is /);
    }
    expectKN(() => srt('just some text'), 'KN-100', 'srt(text): 0 cues', /text is SRT or WebVTT subtitles with at least one cue/);
  });

  it('messages print NaN and Infinity as themselves, not as null', async () => {
    const { wf } = await load();
    const { ticks, beat } = wf.kinetic;
    expectKN(() => ticks(0, 1, NaN), 'KN-100', 'ticks(…, count)', /not NaN/);
    expectKN(() => ticks(0, 1, Infinity), 'KN-100', 'ticks(…, count)', /not Infinity/);
    expectKN(() => ticks(NaN, 1), 'KN-100', 'ticks(min, max)', /NaN/);
    expectKN(() => beat(1, [], { decay: NaN }), 'KN-100', 'beat(t, beats, { decay })', /not NaN/);
    expectKN(() => beat(1, [], { decay: -Infinity }), 'KN-100', 'beat(t, beats, { decay })', /not -Infinity/);
  });

  it('beat: a strength that is NaN, or not a number, counts as absent (0.5)', async () => {
    const { wf } = await load();
    const { beat } = wf.kinetic;
    expect(beat(0.5, [{ time: 0.5, strength: NaN }])).toBe(0.5);
    expect(beat(0.5, [{ time: 0.5, strength: '1' }])).toBe(0.5);
  });

  it('captions: KN-100 for a word time that is not finite', async () => {
    const { wf } = await load();
    const { captions } = wf.kinetic;
    expectKN(() => captions(0.5, [{ text: 'a', start: NaN, end: 1 }]), 'KN-100', 'captions(t, words[0])', /not \{ text, start, end \}/);
    expectKN(() => captions(0.5, [{ text: 'a', start: 0, end: 1 }, { text: 'b', start: 1, end: Infinity }]), 'KN-100', 'captions(t, words[1])');
  });

  it('captions: KN-100 for an option of the wrong kind, naming it', async () => {
    const { wf } = await load();
    const { captions } = wf.kinetic;
    const words = [{ text: 'you', start: 3, end: 3.4 }];
    expectKN(() => captions(10, words, { hold: NaN }), 'KN-100', 'captions(t, words, { hold })', /not NaN/);
    expectKN(() => captions(10, words, { maxGap: -1 }), 'KN-100', 'captions(t, words, { maxGap })', /not -1/);
    expectKN(() => captions(10, words, { maxWords: 'x' }), 'KN-100', 'captions(t, words, { maxWords })', /not "x"/);
    expectKN(() => captions(10, words, { maxChars: 2.5 }), 'KN-100', 'captions(t, words, { maxChars })', /not 2.5/);
    expectKN(() => captions(10, words, { sentences: 1 }), 'KN-100', 'captions(t, words, { sentences })', /not 1/);
    expect(captions(10, words, { hold: Infinity, maxGap: Infinity, maxWords: Infinity }).text).toBe('you');
  });

  it('moment: the row current at t, its start, end, seconds since and progress, the next row, and each row\'s state', async () => {
    const { wf } = await load();
    const { moment } = wf.kinetic;
    const CH = [{ at: 0, name: 'Red' }, { at: 8.2, name: 'Yellow' }, { at: 16.4, name: 'Blue' }];
    const m = moment(4.1, CH);
    expect(m.index).toBe(0);
    expect(m.row).toBe(CH[0]);
    expect([m.start, m.end, m.empty]).toEqual([0, 8.2, false]);
    expect(m.since).toBeCloseTo(4.1, 12);
    expect(m.p).toBeCloseTo(0.5, 12);
    expect(m.next).toBe(CH[1]);
    expect(m.rows.map((r) => [r.key, r.state])).toEqual([[0, 'active'], [1, 'future'], [2, 'future']]);
    expect(m.rows.map((r) => r.row)).toEqual(CH);
    expect(m.rows[0].p).toBeCloseTo(0.5, 12);
    expect(m.rows[1].p).toBe(0);
    // A row starts at its at, so t on a boundary is the later row.
    expect(moment(8.2, CH).index).toBe(1);
    // The last row with no end runs on: no length, so p is 0.
    const last = moment(20, CH);
    expect([last.index, last.end, last.p, last.next]).toEqual([2, Infinity, 0, null]);
    expect(last.since).toBeCloseTo(3.6, 12);
    expect(last.rows.map((r) => r.state)).toEqual(['past', 'past', 'active']);
    expect(last.rows[0].p).toBe(1);
    expect(moment(Infinity, CH).index).toBe(2);
    // Before the first row: empty, the first row next, every row future.
    expect(moment(-1, CH)).toEqual({ index: -1, row: null, start: 0, end: 0, since: 0, p: 0, next: CH[0], empty: true,
      rows: CH.map((row, key) => ({ key, row, state: 'future', p: 0 })) });
    // An empty list is empty at every time.
    expect(moment(3, [])).toEqual({ index: -1, row: null, start: 0, end: 0, since: 0, p: 0, next: null, empty: true, rows: [] });
  });

  it('moment: a row with an end leaves a gap where nothing is current; rows are read in time order, and of equal times the last wins', async () => {
    const { wf } = await load();
    const { moment } = wf.kinetic;
    const NOTES = [{ at: 1, end: 2 }, { at: 3 }];
    const m = moment(1.5, NOTES);
    expect([m.index, m.start, m.end, m.p]).toEqual([0, 1, 2, 0.5]);
    const gap = moment(2.5, NOTES);
    expect([gap.index, gap.row, gap.empty, gap.next]).toEqual([-1, null, true, NOTES[1]]);
    expect(gap.rows.map((r) => r.state)).toEqual(['past', 'future']);
    // An end at its own at is a row of no length, never current.
    expect(moment(1, [{ at: 1, end: 1 }]).empty).toBe(true);
    // Out of order: the index and the rows follow time.
    const LATE = [{ at: 5, n: 'b' }, { at: 1, n: 'a' }];
    const o = moment(2, LATE);
    expect([o.index, o.row, o.next]).toEqual([0, LATE[1], LATE[0]]);
    expect(o.rows.map((r) => r.row.n)).toEqual(['a', 'b']);
    // Equal times keep their order, and the last of them is current.
    const SAME = [{ at: 1, n: 'a' }, { at: 1, n: 'b' }];
    expect(moment(1, SAME).row.n).toBe('b');
    expect(moment(1, SAME).rows.map((r) => r.state)).toEqual(['past', 'active']);
  });

  it('moment: a fresh result each call; a row pushed onto the array is seen on the next call', async () => {
    const { wf } = await load();
    const { moment } = wf.kinetic;
    const R = [{ at: 0 }];
    const a = moment(1, R);
    expect(moment(1, R)).not.toBe(a);
    expect(moment(1, R).rows).not.toBe(a.rows);
    R.push({ at: 0.5 });
    expect(moment(1, R).index).toBe(1);
  });

  it('moment: KN-100 for a t that is no number, rows that are no array, a row that is no object, an at that is not finite, or an end before its at', async () => {
    const { wf } = await load();
    const { moment } = wf.kinetic;
    expectKN(() => moment(NaN, []), 'KN-100', 'moment(t)');
    expectKN(() => moment(0, {}), 'KN-100', 'moment(t, rows)', /^rows is an array of \{ at, end \}/);
    expectKN(() => moment(0, [null]), 'KN-100', 'moment(t, rows[0])', /^rows\[0\] is an object with at/);
    expectKN(() => moment(0, [{ at: 0 }, { at: '2' }]), 'KN-100', 'moment(t, rows[1].at)', /^at is a finite number of seconds, not "2"/);
    expectKN(() => moment(0, [{ at: Infinity }]), 'KN-100', 'moment(t, rows[0].at)');
    expectKN(() => moment(0, [{ at: 2, end: 1 }]), 'KN-100', 'moment(t, rows[0].end)', /^end is a number of seconds at or after its at \(2\), not 1/);
    expectKN(() => moment(0, [{ at: 2, end: NaN }]), 'KN-100', 'moment(t, rows[0].end)');
    expectKN(() => moment(0, [{ at: 0, end: '5' }]), 'KN-100', 'moment(t, rows[0].end)', /not "5"/);
  });

  it('moment: an end of null is no end, as JSON writes it, so the row runs to the next', async () => {
    const { wf } = await load();
    const m = wf.kinetic.moment(0.5, [{ at: 0, end: null }, { at: 2 }]);
    expect(m.index).toBe(0);
    expect(m.rows[0].state).toBe('active');
    expect(m.rows[0].p).toBeCloseTo(0.25, 5);
  });
});
