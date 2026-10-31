/**
 * Named times and musical time: timeOf() over an audio clip's data-markers
 * and the page's ids, and tempo() over its data-tempo, data-downbeat and
 * data-meter, each in file seconds through the clip's start, media start and
 * playback rate, read from the page on every call; and their KN-100 cases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, expectKN, FOOTAGE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

// A composition of 20 s holding `inner`, in the page.
async function comp(inner) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${uniqueName('tm')}" data-start="0" data-duration="20" data-fps="30">${inner}</div>`);
  cleanup.push(host);
  return { wf, host };
}
const SONG = `${FOOTAGE}f30.webm`;

describe(`named and musical time (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("timeOf() reads a marker in the file's seconds through the clip's start, media start and rate, with an offset, and a number as itself", async () => {
    const { wf, host } = await comp(`<audio id="m" src="${SONG}" data-start="2" data-media-start="10" data-playback-rate="2" data-markers='{"drop": 14, "stop": 16.5}'></audio>`);
    const { timeOf } = wf.kinetic;
    expect(timeOf('drop')).toBe(4);
    expect(timeOf('stop')).toBe(5.25);
    expect(timeOf('drop + 0.5')).toBe(4.5);
    expect(timeOf('drop - 1')).toBe(3);
    expect(timeOf(3.25)).toBe(3.25);
    expect(timeOf('3.25')).toBe(3.25);
    // Read from the page on every call.
    host.querySelector('audio').setAttribute('data-start', '3');
    expect(timeOf('drop')).toBe(5);
  });

  it("a name that is no marker is an element's id, the time it ends, as in data-start; a marker wins over an id of the same name", async () => {
    const { wf } = await comp(`<audio src="${SONG}" data-start="0" data-markers='{"twice": 7}'></audio>
      <div id="intro" data-start="1" data-duration="2"></div><div id="twice" data-start="0" data-duration="1"></div><i id="mark" data-start="4.5"></i>`);
    const { timeOf } = wf.kinetic;
    expect(timeOf('intro')).toBe(3);
    expect(timeOf('intro + 1')).toBe(4);
    expect(timeOf('mark')).toBe(4.5);
    expect(timeOf('twice')).toBe(7);
  });

  it("data-markers in the attribute object syntax: unquoted keys, single- or double-quoted keys, signs, fractions and exponents; strict JSON reads the same", async () => {
    const { wf, host } = await comp(`<audio id="m" src="${SONG}" data-start="0" data-markers="{ drop: 14.28, 'build-up': 2, &quot;stop&quot;: 1.5e1, tail: .5, _end: 18, early: -1 }"></audio>`);
    const { timeOf } = wf.kinetic;
    // early is -1 s into the file, clamped to 0 as data-start clamps.
    expect([timeOf('drop'), timeOf('build-up'), timeOf('stop'), timeOf('tail'), timeOf('_end'), timeOf('early + 1.5')]).toEqual([14.28, 2, 15, 0.5, 18, 0.5]);
    const a = host.querySelector('audio');
    a.setAttribute('data-markers', '{"drop": 3, "stop": 4}');
    expect([timeOf('drop'), timeOf('stop')]).toEqual([3, 4]);
    a.setAttribute('data-markers', '{\n  drop: 5,\n  stop: 6\n}');
    expect([timeOf('drop'), timeOf('stop')]).toEqual([5, 6]);
    // A key named __proto__ is a marker like any other, not the object's prototype.
    a.setAttribute('data-markers', '{ __proto__: 7 }');
    expect(timeOf('__proto__')).toBe(7);
  });

  it('timeOf() clamps at 0 where data-start does: a negative number, a reference and a marker less too much', async () => {
    const { wf } = await comp(`<audio src="${SONG}" data-start="0" data-markers='{"drop": 1}'></audio><div id="intro" data-start="0" data-duration="1"></div>`);
    const { timeOf } = wf.kinetic;
    expect([timeOf(-3), timeOf('-3'), timeOf('intro - 5'), timeOf('drop - 2')]).toEqual([0, 0, 0, 0]);
  });

  it('tempo() is the beat grid: the downbeat in file seconds on the clock, the beat at the playback rate, the meter 4 unless given', async () => {
    const { wf, host } = await comp(`<audio id="music" src="${SONG}" data-start="2" data-media-start="10" data-tempo="120" data-downbeat="11"></audio>`);
    const { tempo } = wf.kinetic;
    const g = tempo();
    expect([g.bpm, g.beat, g.meter]).toEqual([120, 0.5, 4]);
    expect([g.at(0), g.at(4), g.at(-2), g.at(0.5)]).toEqual([3, 5, 2, 3.25]);
    expect([g.of(3), g.of(5), g.of(4.75)]).toEqual([0, 4, 3.5]);
    expect(Math.floor(g.of(7.1) / g.meter)).toBe(2);
    const audio = host.querySelector('audio');
    audio.setAttribute('data-playback-rate', '2');
    audio.setAttribute('data-meter', '3');
    const h = tempo('music');
    expect([h.beat, h.meter, h.at(0), h.at(2)]).toEqual([0.25, 3, 2.5, 3]);
  });

  it('KN-100: an expression that is not one, a name that is neither, bad markers; tempo() with none or two clips, an unknown id, or a bad attribute', async () => {
    const { wf, host } = await comp(`<audio id="a" src="${SONG}" data-start="0" data-markers='{"drop": 1}'></audio><audio id="b" src="${SONG}" data-start="0" data-tempo="90" data-downbeat="0"></audio>`);
    const { timeOf, tempo } = wf.kinetic;
    expectKN(() => timeOf({}), 'KN-100', 'timeOf(time)', /a time is a number of seconds.*not \{\}/);
    expectKN(() => timeOf('drop * 2'), 'KN-100', 'timeOf(time)', /not "drop \* 2"/);
    expectKN(() => timeOf('nowhere'), 'KN-100', 'timeOf(time)', /no marker and no element is named 'nowhere'; the markers are drop/);
    // A number that is not finite is no time, not a name 'NaN' or 'Infinity'.
    expectKN(() => timeOf(NaN), 'KN-100', 'timeOf(time)', /a time is a number of seconds.*not NaN$/);
    expectKN(() => timeOf(Infinity), 'KN-100', 'timeOf(time)', /a time is a number of seconds.*not Infinity$/);
    const a =host.querySelector('#a'), b = host.querySelector('#b');
    a.setAttribute('data-markers', '{"drop": "soon"}');
    expectKN(() => timeOf('drop'), 'KN-100', '<audio id="a"> data-markers', /an object of names and seconds into the file.*every value must be a finite number/);
    a.setAttribute('data-markers', 'drop 1');
    expectKN(() => timeOf('drop'), 'KN-100', '<audio id="a"> data-markers', /does not read at character 1, expected a value; 'drop' is a name/);
    a.setAttribute('data-markers', '{ drop: 1, }');
    expectKN(() => timeOf('drop'), 'KN-100', '<audio id="a"> data-markers', /does not read at character 12, expected a key/);
    a.setAttribute('data-markers', '{ drop: 1 + 2 }');
    expectKN(() => timeOf('drop'), 'KN-100', '<audio id="a"> data-markers', /does not read at character 11, expected ',' or '\}'/);
    a.setAttribute('data-markers', "{ drop: 'soon }");
    expectKN(() => timeOf('drop'), 'KN-100', '<audio id="a"> data-markers', /expected the closing '/);
    expectKN(() => tempo('a'), 'KN-100', 'tempo(id)', /no audio clip with the id "a" has data-tempo/);
    a.setAttribute('data-tempo', '120');
    a.setAttribute('data-downbeat', '0');
    expectKN(() => tempo(), 'KN-100', 'tempo()', /more than one audio clip has data-tempo \(a, b\)/);
    b.setAttribute('data-tempo', '-3');
    expectKN(() => tempo('b'), 'KN-100', '<audio id="b"> data-tempo', /above 0/);
    b.setAttribute('data-tempo', '90');
    b.removeAttribute('data-downbeat');
    expectKN(() => tempo('b'), 'KN-100', '<audio id="b"> data-downbeat');
    b.setAttribute('data-downbeat', '0');
    b.setAttribute('data-meter', '3.5');
    expectKN(() => tempo('b'), 'KN-100', '<audio id="b"> data-meter', /whole number/);
    a.removeAttribute('data-tempo');
    b.removeAttribute('data-tempo');
    expectKN(() => tempo(), 'KN-100', 'tempo()', /no audio clip under the composition root has data-tempo/);
  });
});
