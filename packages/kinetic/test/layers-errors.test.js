/**
 * layers(): a broken record fails with the code that names what is wrong
 * (KN-161 to KN-169, KN-100 for a call), and a few records at the edge of a
 * rule draw. Each case builds the record on a small root and seeks it once.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const base = (layers, more) => Object.assign({ id: 't', size: [100, 100], duration: 2, layers }, more);
const box = (extra) => Object.assign({ id: 'b', kind: 'html', src: '#lx-box' }, extra);

const CASES = [
  ['KN-161', 'no duration', { id: 't', size: [100, 100], layers: [] }],
  ['KN-161', 'unknown top key', base([], { colours: {} })],
  ['KN-161', 'unknown kind', base([{ id: 'a', kind: 'image' }])],
  ['KN-161', 'two layers one id', base([box(), box()])],
  ['KN-162', 'misspelled layer key', base([box({ plce: {} })])],
  ['KN-162', 'misspelled look key', base([box({ look: { opactiy: 1 } })])],
  ['KN-162', 'a look key that is none of the look\'s: drift', base([box({ look: { drift: { rate: [1, 1], tile: 10 } } })])],
  ['KN-167', 'band not listed', base([{ id: 's', kind: 'solid', band: 'nope', content: { shape: 'disc', radius: 1 } }], { bands: ['a'] })],
  ['KN-167', 'comp inside itself', base([{ id: 'p', kind: 'comp', comp: 'c' }], { comps: { c: { layers: [{ id: 'q', kind: 'comp', comp: 'c' }] } } })],
  ['KN-166', 'call not handed', base([box({ look: { opacity: { call: 'model' } } })])],
  ['KN-165', 'no value form', base([box({ look: { opacity: { fom: 'x' } } })])],
  ['KN-165', 'keys backward', base([box({ look: { opacity: { keys: [[1, 0], [0.5, 1]] } } })])],
  ['KN-165', 'text beside a number in keys', base([box({ look: { opacity: { keys: [[0, 0], [1, 'params.w']] } } })])],
  ['KN-165', 'keys with no key', base([box({ look: { opacity: { keys: [] } } })])],
  ['KN-165', 'keys that are not pairs', base([box({ look: { opacity: { keys: [0, 1] } } })])],
  ['KN-165', 'keys that is no list', base([box({ look: { opacity: { keys: 5 } } })])],
  ['KN-165', 'min that is no list', base([box({ look: { opacity: { min: 3 } } })])],
  ['KN-165', 'max that is no list', base([box({ look: { opacity: { max: 3 } } })])],
  ['KN-165', 'multiply that is no list', base([box({ look: { opacity: { multiply: 2 } } })])],
  ['KN-165', 'loop that is no pair', base([box({ look: { opacity: { at: [0, 1], to: [0, 1], loop: 5 } } })])],
  ['KN-165', 'hold that is no pair', base([box({ look: { opacity: { at: [0, 1], to: [0, 1], hold: 5 } } })])],
  ['KN-165', 'min of no values', base([box({ look: { opacity: { min: [] } } })])],
  ['KN-165', 'max of no values', base([box({ look: { opacity: { max: [] } } })])],
  ['KN-165', 'text added to a number', base([box({ look: { opacity: { add: [1, 'coral'] } } })])],
  ['KN-165', 'text multiplied', base([box({ look: { opacity: { multiply: [2, 'coral'] } } })])],
  ['KN-165', 'a list in min', base([box({ look: { opacity: { min: [1, [2, 3]] } } })])],
  ['KN-165', 'text in floor', base([box({ look: { opacity: { floor: 'coral' } } })])],
  ['KN-165', 'text in rate', base([box({ look: { opacity: { rate: 'coral' } } })])],
  ['KN-165', 'a link scaled by text', base([box({ look: { opacity: { from: 'c.look.opacity', scale: 'coral' } } }), { id: 'c', kind: 'html', src: '#lx-cv', look: { opacity: 1 } }])],
  ['KN-165', 'a link with text added', base([box({ look: { opacity: { from: 'c.look.opacity', add: 'coral' } } }), { id: 'c', kind: 'html', src: '#lx-cv', look: { opacity: 1 } }])],
  ['KN-163', 'a key at NaN', base([box({ look: { opacity: { keys: [[NaN, 0], [1, 1]] } } })])],
  ['KN-163', 'key at no name', base([box({ look: { opacity: { keys: [['hitX', 0], [1, 1]] } } })])],
  ['KN-163', 'a comp that starts at no name', base([{ id: 'p', kind: 'comp', comp: 'c', start: 'intro' }], { comps: { c: { layers: [box({ look: { opacity: { at: [0, 2], to: [0, 1] } } })] } } })],
  ['KN-163', 'a life from no name', base([box({ life: ['intro', 2] })])],
  ['KN-163', 'a life to no name', base([box({ life: [0, 'outro'] })])],
  ['KN-162', 'html repeat with text', base([box({ repeat: { count: 3 }, content: { text: 'Label' } })])],
  ['KN-164', 'link to no layer', base([box({ look: { opacity: { from: 'ghost.look.opacity' } } })])],
  ['KN-168', 'src finds nothing', base([{ id: 'b', kind: 'html', src: '#lx-nothing' }])],
  ['KN-169', 'names in a loop', base([box({ look: { opacity: 'a' } })], { shared: { a: 'b', b: 'a' } })],
  ['KN-169', 'two layers that link to each other', base([box({ look: { opacity: { from: 'c.look.opacity' } } }), { id: 'c', kind: 'html', src: '#lx-cv', look: { opacity: { from: 'b.look.opacity' } } }])],
  ['KN-169', 'a layer that links to itself', base([box({ look: { opacity: { from: 'b.look.opacity', add: 1 } } })])],
  ['KN-169', 'a loop through a track driven by a link', base([box({ look: { opacity: { by: 'b.look.opacity', keys: [[0, 0], [1, 1]] } } })])],
  ['KN-162', 'text with no src', base([{ id: 'w', kind: 'text', content: { text: 'Hi' } }])],
  ['KN-162', 'split by line', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { text: 'Hi', split: 'line' } }])],
  ['KN-162', 'animate unsplit', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { text: 'Hi' }, animate: { each: 0.1 } }])],
  ['KN-162', 'animate key', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { text: 'Hi', split: 'letter' }, animate: { delay: 0.1 } }])],
  ['KN-162', 'part place key', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { text: 'Hi', split: 'letter' }, animate: { place: { position: [0, 0] } } }])],
  ['KN-162', 'split and typed', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { text: 'Hi', split: 'letter', typewriter: { cps: 9 } } }])],
  ['KN-162', 'captions both', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { captions: { srt: '', cues: [] } } }])],
  ['KN-162', 'captions key', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { captions: { cues: [], maxLines: 2 } } }])],
  ['KN-162', 'word look, no captions', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { text: 'Hi' }, look: { words: { active: {} } } }])],
  ['KN-162', 'word state', base([{ id: 'w', kind: 'text', src: '#lx-box', content: { captions: { cues: [] } }, look: { words: { current: {} } } }])],
  ['KN-162', 'effect on svg', base([{ id: 's', kind: 'svg', src: '#lx-box', look: { effect: { kind: 'halftone' } } }])],
  ['KN-162', 'two engines', base([box({ look: { effect: { kind: 'halftone' }, draw: {} } })])],
  ['KN-162', 'effect no kind', base([box({ look: { effect: { cell: 9 } } })])],
  ['KN-162', 'boil on html', base([box({ look: { boil: { amount: 2 } } })])],
  ['KN-162', 'engine not object', base([box({ look: { shade: 'stipple' } })])],
  ['KN-168', 'source finds nothing', base([{ id: 'c', kind: 'html', src: '#lx-cv', look: { effect: { kind: 'halftone', source: '#lx-none' } } }])],
  ['KN-166', 'move not handed', base([{ id: 'c', kind: 'html', src: '#lx-cv', look: { shade: { kind: 'stipple', fps: 2, move: 'swing', marks: [] } } }])],
  ['KN-162', 'trails kind', base([box({ look: { trails: { kind: 'comet' } } })])],
  ['KN-164', 'ghosts of nothing', base([box({ look: { trails: { kind: 'ghosts', of: 'ghost' } } })])],
  ['KN-162', 'repeat shape', base([{ id: 'p', kind: 'comp', comp: 'c', repeat: { times: 3 } }], { comps: { c: { layers: [] } } })],
  ['KN-162', 'repeat count zero', base([{ id: 'p', kind: 'comp', comp: 'c', repeat: { count: 0 } }], { comps: { c: { layers: [] } } })],
  ['KN-162', 'comp src unrepeated', base([{ id: 'p', kind: 'comp', comp: 'c', src: '#lx-box' }], { comps: { c: { layers: [] } } })],
  ['KN-168', 'repeat src no template', base([{ id: 'p', kind: 'comp', comp: 'c', src: '#lx-box', repeat: { count: 2 } }], { comps: { c: { layers: [box()] } } })],
  ['KN-163', 'stagger with no i', base([box({ look: { opacity: { stagger: { each: 0.1 } } } })])],
  ['KN-162', 'html repeat shape', base([box({ repeat: { times: 3 } })])],
  ['KN-162', 'html animate no repeat', base([box({ animate: { look: { opacity: 1 } } })])],
  ['KN-162', 'copy animate key', base([box({ repeat: { every: 1, life: 2 }, animate: { place: { position: [0, 0] } } })])],
  ['KN-168', 'born copies no template', base([box({ repeat: { every: 1, life: 2 } })])],
  ['KN-163', 'lettering no outlines', base([{ id: 'w', kind: 'text', src: '#lx-cv', content: { font: 'NO_SUCH_OUTLINES', text: 'A' } }])],
  ['KN-161', 'shutter allowed, unit bad', base([], { shutter: 180, unit: 'tick' })],
  ['KN-163', 'spectrum with no i', base([box({ look: { opacity: { spectrum: {} } } })])],
  ['KN-162', 'lottie with no src', base([{ id: 'l', kind: 'lottie', content: { path: 'x.json' } }])],
  ['KN-162', 'lottie content key', base([{ id: 'l', kind: 'lottie', src: '#lx-box', content: { file: 'x.json' } }])],
  ['KN-162', "a row field named n, a copy's own count", base([{ id: 'p', kind: 'comp', comp: 'c', repeat: { over: [{ n: 1 }] } }], { comps: { c: { layers: [] } } })],
  ['KN-162', 'html repeat count and every', base([box({ repeat: { count: 3, every: 1 } })])],
];

async function rig() {
  const host = await mount('<div data-composition-id="lx" data-start="0" data-duration="2"><div id="lx-box"></div><canvas id="lx-cv" width="40" height="40"></canvas></div>');
  cleanup.push(host);
  return host;
}

describe(`layers(): broken records (${BUILD} extension, ${CORE_TIER} core)`, () => {
  for (const [code, what, rec] of CASES) {
    it(`${what}: ${code}`, async () => {
      const { wf } = await load();
      const root = await rig();
      let err = null;
      try { wf.kinetic.layers(rec, { root }).seek(0.5); } catch (e) { err = e; }
      expect(err && err.message, 'expected ' + code).toMatch(new RegExp('^\\[' + code + '\\] '));
    });
  }

  // A value is worked out at a seek, so its error comes then: it names the layer and the field that holds the value,
  // on both builds, whether it is the layers' own, one of Kinetic's helpers' (its code kept), or a function's.
  it('an error while a value is worked out names the layer and the field', async () => {
    const { wf } = await load();
    const root = await rig();
    const fine = { id: 'a', kind: 'html', src: '#lx-cv', look: { opacity: { at: [0, 2], to: [0, 1] } } };
    const message = (layer, fns) => { try { wf.kinetic.layers(base([fine, box(layer)]), { root, fns }).seek(0.5); } catch (e) { return e.message; } return 'no error'; };
    expect(message({ look: { opacity: { keys: [[1, 0], [0.5, 1]] } } })).toMatch(/^\[KN-165\] layers: b\.look\.opacity[: ]/);
    expect(message({ look: { opacity: { at: [0, 1], to: [0] } } })).toMatch(/^\[KN-120\] layers: b\.look\.opacity: interpolate\.to[: ]/);
    expect(message({ place: { translate: [0, { at: [0, 1], to: [0, 1], ease: 'nope' }] } })).toMatch(/^\[KN-121\] layers: b\.place\.translate\.1: interpolate\.ease[: ]/);
    expect(message({ look: { style: { width: { from: 'ghost.look.opacity' } } } })).toMatch(/^\[KN-164\] layers: b\.look\.style\.width[: ]/);
    expect(message({ look: { opacity: { call: 'boom' } } }, { boom: () => { throw new Error('the model failed'); } })).toBe('layers: b.look.opacity: the model failed');
    // A value that is fine on the layer before it leaves no name behind.
    expect(message({ look: { opacity: 1 } })).toBe('no error');
  });

  // NaN written to a style is dropped by the browser, so the element would keep what it had and nothing would say so.
  it('a function that returns NaN is KN-165, with the layer and the field; a number, text and nothing pass', async () => {
    const { wf } = await load();
    const root = await rig();
    const message = (layer, f) => { try { wf.kinetic.layers(base([box(layer)]), { root, fns: { f } }).seek(0.5); } catch (e) { return e.message; } return 'no error'; };
    expect(message({ look: { opacity: { call: 'f' } } }, () => NaN)).toMatch(/^\[KN-165\] layers: b\.look\.opacity[: ]/);
    expect(message({ place: { translate: [{ call: 'f' }, 0] } }, () => 0 / 0)).toMatch(/^\[KN-165\] layers: b\.place\.translate\.0[: ]/);
    expect(message({ look: { opacity: { call: 'f', scale: 2, add: 0.1 } } }, () => 0.25)).toBe('no error');
    expect(message({ look: { style: { color: { call: 'f' } } } }, () => 'red')).toBe('no error');
    expect(message({ look: { style: { color: { call: 'f' } } } }, () => undefined)).toBe('no error');
  });

  // Each copy has its own parameters, so its keys are its own to get wrong.
  it("a later copy whose parameters put its keys out of order, or name nothing, is named as the first would be", async () => {
    const { wf } = await load();
    const root = await rig();
    const over = (rows) => base([{ id: 'p', kind: 'comp', comp: 'c', repeat: { over: rows } }], { comps: { c: { layers: [box({ look: { opacity: { keys: [['a', 0], ['b', 1]] } } })] } } });
    const message = (rows) => { try { wf.kinetic.layers(over(rows), { root }).seek(0.5); } catch (e) { return e.message; } return 'no error'; };
    expect(message([{ a: 0, b: 2 }, { a: 0, b: 1 }])).toBe('no error');
    expect(message([{ a: 0, b: 2 }, { a: 2, b: 0 }])).toMatch(/^\[KN-165\] /);
    expect(message([{ a: 0, b: 2 }, { a: 0 }])).toMatch(/^\[KN-163\] /);
  });

  // Nothing there (a store's empty field, a cleared input's empty text) counts as 0 in arithmetic, and a flag as
  // 0 or 1.
  it('nothing, an empty text and a flag still count in arithmetic', async () => {
    const { wf } = await load();
    const root = await rig();
    const rec = base([box({ look: { opacity: { add: [0.25, null, '', { multiply: [0.5, true] }, { multiply: [9, false] }] } } })]);
    expect(() => wf.kinetic.layers(rec, { root }).seek(0.5)).not.toThrow();
    expect(root.querySelector('#lx-box').style.opacity).toBe('0.75');
  });

  it('a record at the edge of a rule draws: copies with a stagger, wiggle and on, a word split', async () => {
    const { wf } = await load();
    const root = await rig();
    const rows = base([{ id: 'p', kind: 'comp', comp: 'c', start: { stagger: { each: 0.2 } }, repeat: { over: [{ v: 'a' }, { v: 'b' }] } }], { comps: { c: { layers: [{ id: 'q', kind: 'html', src: '#lx-box', content: { text: { from: 'params.v' } } }] } } });
    expect(() => wf.kinetic.layers(rows, { root }).seek(0.5)).not.toThrow();
    const mods = base([box({ look: { opacity: { keys: [[0, 0], [2, 1]], on: 4, wiggle: { amplitude: 0.1, seed: 2 } } } })]);
    expect(() => wf.kinetic.layers(mods, { root }).seek(0.5)).not.toThrow();
    const words = base([{ id: 'w', kind: 'text', src: '#lx-box', content: { text: 'one two', split: 'word' }, animate: { each: 0.2, look: { opacity: { at: [0, 1], to: [0, 1] } } } }]);
    wf.kinetic.layers(words, { root }).seek(0.5);
    const parts = [...root.querySelectorAll('#lx-box > span')];
    expect(parts.map((s) => s.textContent)).toEqual(['one', ' ', 'two']);
    expect(+parts[0].style.opacity).toBeCloseTo(0.5, 5);
    // The space is a part too, so 'two' is the third and starts 0.4 s in.
    expect(+parts[2].style.opacity).toBeCloseTo(0.1, 5);
  });
});
