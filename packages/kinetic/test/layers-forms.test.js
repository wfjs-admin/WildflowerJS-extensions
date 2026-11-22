/**
 * layers.scene() and layers(): one record per value form, record key and
 * layer kind, each seeked and read back from the page. Expected numbers are
 * worked out by hand or with Kinetic's own helpers (interpolate, stagger,
 * sweep, styleAt, repeat, typewriter, ...), which the runtime draws with.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, tick, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

// An html layer that writes a value as its element's text: the plainest way
// to read back what a value form works out to. A string written as text is
// shown as it is, so the form goes in a one-item list, whose item is a value.
const probe = (id, form) => ({ id, kind: 'html', src: '.' + id, content: { text: [form] } });
const slots = (...ids) => ids.map((id) => `<b class="${id}"></b>`).join('');

// The record as a scene on a clip of `dur` seconds (starting at `start` in a
// root of `rootDur`), `markup` inside the clip and `beside` next to it.
// Resolves once ready() has settled and the clock is at `t`.
async function scene(record, markup, { fns, t = 1, dur = 2, start = 0, rootDur, beside = '', clipAttrs = '' } = {}) {
  const { wf } = await load();
  const name = uniqueName('scene');
  wf.kinetic.layers.scene(name, record, fns ? { fns } : {});
  const host = await mount(`<div data-composition-id="${uniqueName('lf')}" data-start="0" data-duration="${rootDur || start + dur}" data-width="100" data-height="100">`
    + `<div data-component="${name}" data-start="${start}" data-duration="${dur}"${clipAttrs}>${markup}</div>${beside}</div>`);
  cleanup.push(host);
  await wf.kinetic.ready();
  await wf.kinetic.seek(t);
  const text = (sel) => host.querySelector(sel).textContent;
  const texts = (sel) => [...host.querySelectorAll(sel)].map((e) => e.textContent);
  return { wf, host, text, texts, name, seek: (s) => wf.kinetic.seek(s) };
}

// A CSS value as the page writes it back, for comparing a transform or a
// filter worked out by hand with the one the runtime set.
const css = (prop, v) => { const i = document.createElement('i'); i.style[prop] = v; return i.style[prop]; };

describe(`layers(): value forms (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a beat whose beats come from each copy's row pulses on that copy's own beats", async () => {
    const rows = [{ bt: [{ time: 0.9, strength: 1 }] }, { bt: [{ time: 0.2, strength: 1 }] }];
    const { wf, texts } = await scene({
      comps: { k: { layers: [{ id: 'v', kind: 'html', src: 'b', content: { text: [{ beat: { beats: { from: 'params.bt' }, decay: 0.5 } }] } }] } },
      layers: [{ id: 'c', kind: 'comp', comp: 'k', src: '.c', repeat: { over: rows } }],
    }, '<div class="c"><template><p><b></b></p></template></div>');
    const got = texts('.c b').map(Number);
    expect(got[0]).toBeCloseTo(wf.kinetic.beat(1, rows[0].bt, { decay: 0.5 }), 9);
    expect(got[1]).toBeCloseTo(wf.kinetic.beat(1, rows[1].bt, { decay: 0.5 }), 9);
    expect(got[0]).not.toBeCloseTo(got[1], 3);
  });

  // An svg layer's move and scale are a CSS transform, which on an SVG element takes the place of its transform
  // attribute: a layer that also turns has its turn in the same transform, between the move and the scale.
  it('an svg layer that turns about its pivot and is also moved or scaled keeps its turn', async () => {
    const { host } = await scene({
      layers: [
        { id: 'r', kind: 'svg', src: '.r', place: { rotate: 90, pivot: [10, 10], translate: [5, 0] } },
        { id: 's', kind: 'svg', src: '.s', place: { rotate: { at: [0, 2], to: [0, 180] }, pivot: [10, 10], scale: 2 } },
        { id: 'o', kind: 'svg', src: '.o', place: { rotate: 90, pivot: [10, 10] } },
      ],
    }, '<svg width="100" height="100" viewBox="0 0 100 100"><rect class="r" width="20" height="10"/><rect class="s" width="20" height="10"/><rect class="o" width="20" height="10"/></svg>');
    const matrix = (sel) => { const c = host.querySelector(sel).getCTM(); return [c.a, c.b, c.c, c.d, c.e, c.f].map((x) => Math.round(x * 100) / 100 + 0); };
    expect(matrix('.r')).toEqual([0, 1, -1, 0, 25, 0]);   // moved 5 right, then a quarter turn about (10, 10)
    expect(matrix('.s')).toEqual([0, 2, -2, 0, 20, 0]);   // at 1 s a quarter turn about (10, 10), of the shape at twice its size
    expect(matrix('.o')).toEqual([0, 1, -1, 0, 20, 0]);   // a turn alone, as the attribute writes it
    expect(host.querySelector('.o').getAttribute('transform')).toBe('rotate(90.00 10 10)');
  });

  it('a number, a name, a sum, a number before a name, shared values, end and last; other text stays text', async () => {
    const ids = ['num', 'sum', 'diff', 'times', 'name', 'sh', 'shsum', 'end', 'last', 'word'];
    const { text } = await scene({
      constants: { OUT: 10, R: 4 },
      shared: { mid: { at: [0, 2], to: [0, 100] } },
      layers: [
        probe('num', 7), probe('sum', 'OUT + R'), probe('diff', 'OUT - R'), probe('times', '0.6R'), probe('name', 'R'),
        probe('sh', 'mid'), probe('shsum', 'mid + OUT'), probe('end', 'end'), probe('last', 'last'), probe('word', 'tall grass'),
      ],
    }, slots(...ids));
    expect(text('.num')).toBe('7');
    expect(text('.sum')).toBe('14');
    expect(text('.diff')).toBe('6');
    expect(+text('.times')).toBeCloseTo(2.4, 9);
    expect(text('.name')).toBe('4');
    expect(text('.sh')).toBe('50');
    expect(text('.shsum')).toBe('60');
    expect(text('.end')).toBe('2');
    expect(+text('.last')).toBeCloseTo(2 - 1 / 30, 9);
    expect(text('.word')).toBe('tall grass');
  });

  it('a list is each part a value, and a track { at, to, ease } is interpolate()', async () => {
    const { wf, host, text } = await scene({
      layers: [
        { id: 'mv', kind: 'html', src: '.mv', place: { translate: [10, { at: [0, 2], to: [0, 40] }] } },
        probe('eased', { at: [0, 2], to: [0, 100], ease: 'power2.inOut' }),
        probe('plain', { at: [0, 1, 2], to: [0, 10, 30] }),
      ],
    }, '<i class="mv"></i>' + slots('eased', 'plain'), { t: 1.5 });
    expect(host.querySelector('.mv').style.transform).toBe('translate(10px, 30px)');
    expect(+text('.eased')).toBeCloseTo(wf.kinetic.interpolate(1.5, [0, 2], [0, 100], { ease: 'power2.inOut' }), 9);
    expect(text('.plain')).toBe('20');
  });

  it("keys: straight between keys and held past both ends, ['hold', v], an ease, a driver in by, and colors that blend through swatches", async () => {
    const { wf, host, text, seek } = await scene({
      constants: { X: 3 },
      swatches: { ink: '#000000', paper: '#ff0000' },
      layers: [
        probe('k', { keys: [[0.5, 0], [1.5, 100]] }),
        probe('hold', { keys: [[0, ['hold', 10]], [1, 20], [2, 40]] }),
        probe('eased', { keys: [[0, 0], [2, 100]], ease: 'power2.inOut' }),
        probe('by', { keys: [[0, 0], [10, 100]], by: 'X' }),
        { id: 'hex', kind: 'html', src: '.hex', look: { style: { color: { keys: [[0, '#000000'], [2, '#ffffff']] } } } },
        { id: 'sw', kind: 'html', src: '.sw', look: { style: { color: { keys: [[0, 'ink'], [2, 'paper']] } } } },
      ],
    }, slots('k', 'hold', 'eased', 'by', 'hex', 'sw'), { t: 0.5 });
    expect(text('.k')).toBe('0');
    expect(text('.hold')).toBe('10');
    expect(+text('.eased')).toBeCloseTo(wf.kinetic.interpolate(0.5, [0, 2], [0, 100], { ease: 'power2.inOut' }), 9);
    expect(text('.by')).toBe('30');
    expect(host.querySelector('.hex').style.color).toBe('rgb(64, 64, 64)');
    await seek(1);
    expect(text('.k')).toBe('50');
    expect(host.querySelector('.sw').style.color).toBe('rgb(128, 0, 0)');
    await seek(1.5);
    expect(text('.hold')).toBe('30');
    await seek(1.9);
    expect(text('.k')).toBe('100');
  });

  it("links: a parameter with scale and add, an input's default, the clip's prop, and another layer's field read earlier", async () => {
    const { text, host } = await scene({
      inputs: { headline: { type: String, default: 'Hello' } },
      props: { role: { type: String, default: 'nobody' } },
      comps: { card: { params: { w: 30 }, layers: [probe('pw', { from: 'params.w', scale: 2, add: 1 })] } },
      layers: [
        { id: 'src', kind: 'html', src: '.src', look: { opacity: { at: [0, 2], to: [0, 1] } } },
        probe('lag', { from: 'src.look.opacity', time: -0.5 }),
        probe('in', { from: 'inputs.headline' }),
        probe('pr', { from: 'props.role' }),
        { id: 'c', kind: 'comp', comp: 'card' },
      ],
    }, slots('src', 'lag', 'in', 'pr', 'pw'), { clipAttrs: ` data-prop-role="'Director'"` });
    expect(text('.pw')).toBe('61');
    expect(host.querySelector('.src').style.opacity).toBe('0.5');
    expect(text('.lag')).toBe('0.25');
    expect(text('.in')).toBe('Hello');
    expect(text('.pr')).toBe('Director');
  });

  it('a link to a list scales each number in it and adds to each', async () => {
    const { text } = await scene({
      layers: [
        { id: 'src', kind: 'html', src: '.src', place: { translate: [1, 2] } },
        probe('sc', { from: 'src.place.translate', scale: 2 }),
        probe('ad', { from: 'src.place.translate', add: 10 }),
        probe('both', { from: 'src.place.translate', scale: 2, add: 10 }),
      ],
    }, slots('src', 'sc', 'ad', 'both'));
    expect(text('.sc')).toBe('2,4');
    expect(text('.ad')).toBe('11,12');
    expect(text('.both')).toBe('12,14');
  });

  it("a split text takes the place of the text its element holds, and keeps the element's template", async () => {
    const { host, seek } = await scene({
      layers: [
        { id: 'lt', kind: 'text', src: '.lt', content: { text: 'AB', split: 'letter' } },
        { id: 'wd', kind: 'text', src: '.wd', content: { text: { keys: [[0, ['hold', '']], [1.5, ['hold', 'one two']]] }, split: 'word' } },
        { id: 'tp', kind: 'text', src: '.tp', content: { text: 'AB', split: 'letter' } },
        { id: 'cp', kind: 'text', src: '.cp', content: { captions: { cues: [{ id: 'w0', text: 'Big', start: 0, end: 1 }, { id: 'w1', text: 'world', start: 1, end: 2 }] } } },
      ],
    }, '<p class="lt">Hello</p><p class="wd">old</p><p class="tp">Hello<template><i class="part"></i></template></p><p class="cp">A caption</p>');
    expect([...host.querySelectorAll('.cp > span')].map((e) => e.textContent.trim())).toEqual(['Big', 'world']);
    expect(host.querySelector('.cp').textContent).not.toContain('A caption');
    expect(host.querySelector('.lt').textContent).toBe('AB');
    expect(host.querySelector('.wd').textContent).toBe('');
    const tp = host.querySelector('.tp');
    expect([...tp.querySelectorAll(':scope > i.part')].map((e) => e.textContent)).toEqual(['A', 'B']);
    expect(tp.querySelector(':scope > template')).not.toBe(null);
    expect([...tp.childNodes].filter((n) => n.nodeType === 3).length).toBe(0);
    await seek(1.8);
    expect(host.querySelector('.wd').textContent).toBe('one two');
  });

  it("a store's field by a link and by a follower, drawn again when the store changes while the clock is still", async () => {
    const { wf } = await load();
    const st = uniqueName('st');
    wf.store(st, { state: { v: 40 } });
    const { text } = await scene({
      stores: [st],
      layers: [
        probe('ln', { from: st + '.v' }),
        probe('fl', { follow: st + '.v' }),
        probe('by', { keys: [[0, 0], [100, 10]], by: st + '.v' }),
      ],
    }, slots('ln', 'fl', 'by'));
    expect(text('.ln')).toBe('40');
    expect(text('.fl')).toBe('40');
    expect(text('.by')).toBe('4');
    wf.getStore(st).v = 60;
    await tick(0);
    await tick(0);
    expect(text('.ln')).toBe('60');
    expect(text('.by')).toBe('6');
  });

  it("a query's rows by a link, and a repeat over a query's path", async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const qn = uniqueName('q');
    wf.query(qn, { from: () => Promise.resolve([{ label: 'Wind' }, { label: 'Solar' }]) });
    const { text, texts } = await scene({
      queries: [qn],
      comps: { row: { layers: [{ id: 'l', kind: 'html', src: 'b', content: { text: { from: 'params.label' } } }] } },
      layers: [
        probe('count', { call: 'count', args: [{ from: qn + '.rows' }] }),
        { id: 'rows', kind: 'comp', comp: 'row', src: '.rows', repeat: { over: qn + '.rows' } },
      ],
    }, slots('count') + '<div class="rows"><template><p><b></b></p></template></div>', { fns: { count: (rows) => String(rows.length) } });
    expect(text('.count')).toBe('2');
    expect(texts('.rows p')).toEqual(['Wind', 'Solar']);
  });

  it('a call with scale and add, rate, multiply, add, min, max and floor', async () => {
    const { text, seek } = await scene({
      constants: { K: 3 },
      layers: [
        probe('call', { call: 'plus', args: [2, 'K'], scale: 10, add: 1 }),
        probe('callText', { call: 'say', args: ['K'] }),
        probe('rate', { rate: 10 }),
        probe('mul', { multiply: [2, 'K'] }),
        probe('add', { add: [1, { rate: 1 }] }),
        probe('min', { min: [5, 'K', 4] }),
        probe('max', { max: [1, 'K', 4] }),
        probe('floor', { floor: { rate: 1.5 } }),
      ],
    }, slots('call', 'callText', 'rate', 'mul', 'add', 'min', 'max', 'floor'), { fns: { plus: (a, b) => a + b, say: (k) => 'k=' + k } });
    expect(text('.call')).toBe('51');
    expect(text('.callText')).toBe('k=3');
    expect(text('.rate')).toBe('10');
    expect(text('.mul')).toBe('6');
    expect(text('.add')).toBe('2');
    expect(text('.min')).toBe('3');
    expect(text('.max')).toBe('4');
    expect(text('.floor')).toBe('1');
    await seek(1.5);
    expect(text('.rate')).toBe('15');
    expect(text('.floor')).toBe('2');
  });

  it("stagger and sweep read each element's i of n when a src finds several, and delay starts each one's time later", async () => {
    const { wf, texts, host } = await scene({
      layers: [
        { id: 'st', kind: 'html', src: '.st', content: { text: { stagger: { each: 0.25, from: 'center' } } } },
        { id: 'sw', kind: 'html', src: '.sw', content: { text: { sweep: { p: 0.5, width: 0.5 } } } },
        { id: 'dl', kind: 'html', src: '.dl', delay: { stagger: { each: 0.25 } }, look: { opacity: { at: [0, 1], to: [0, 1] } } },
      ],
    }, '<b class="st"></b>'.repeat(3) + '<b class="sw"></b>'.repeat(3) + '<i class="dl"></i>'.repeat(3), { t: 0.5 });
    const k = wf.kinetic;
    expect(texts('.st').map(Number)).toEqual([0, 1, 2].map((i) => k.stagger(i, 3, { each: 0.25, from: 'center' })));
    texts('.sw').map(Number).forEach((v, i) => expect(v).toBeCloseTo(k.sweep(i, 3, 0.5, { width: 0.5 }), 9));
    const ops = [...host.querySelectorAll('.dl')].map((e) => +e.style.opacity);
    ops.forEach((v, i) => expect(v).toBeCloseTo(0.5 - k.stagger(i, 3, { each: 0.25 }), 5));
  });

  it('time modifiers: loop repeats, hold stops, on posterizes, and wiggle adds wiggle()', async () => {
    const { wf, text, seek } = await scene({
      layers: [
        probe('lp', { at: [0, 1], to: [0, 100], loop: [0, 1] }),
        probe('hd', { at: [0, 2], to: [0, 100], hold: [0.5, 1] }),
        probe('on', { at: [0, 2], to: [0, 100], on: 4 }),
        probe('twos', { at: [0, 2], to: [0, 100], on: 'twos' }),
        probe('wg', { at: [0, 2], to: [0, 100], wiggle: { amplitude: 5, frequency: 2, seed: 3 } }),
      ],
    }, slots('lp', 'hd', 'on', 'twos', 'wg'), { t: 0.25 });
    const k = wf.kinetic;
    const first = text('.lp');
    expect(first).toBe('25');
    await seek(1.25);
    expect(text('.lp')).toBe(first);
    await seek(1);
    expect(text('.hd')).toBe('25');
    await seek(1.75);
    expect(+text('.hd')).toBeCloseTo(50 * k.hold(1.75, 0.5, 1), 9);
    await seek(1.1);
    expect(+text('.on')).toBeCloseTo(50 * k.posterize(1.1, 4), 9);
    expect(+text('.twos')).toBeCloseTo(50 * k.posterize(1.1, 15), 9);
    expect(+text('.wg')).toBeCloseTo(55 + k.wiggle(1.1, { amplitude: 5, frequency: 2, seed: 3 }), 9);
  });
});

describe(`layers(): record keys (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("unit 'frame': every time in the record, the duration and a rate, counts frames", async () => {
    const { text, host } = await scene({
      unit: 'frame', fps: 30, duration: 60,
      layers: [
        probe('tr', { at: [0, 60], to: [0, 100] }),
        probe('rate', { rate: 30 }),
        probe('end', 'end'),
        { id: 'lf', kind: 'html', src: '.lf', life: [15, 45], look: { opacity: 1 } },
      ],
    }, slots('tr', 'rate', 'end') + '<i class="lf"></i>');
    expect(text('.tr')).toBe('50');
    expect(text('.rate')).toBe('30');
    expect(text('.end')).toBe('60');
    expect(host.querySelector('.lf').style.display).toBe('');
  });

  it("a name that is an element's id is the time it ends, counted from the clip's start; snap: 'frame' lands it on a frame", async () => {
    const mk = uniqueName('mk').replace('-', '_');
    const { text } = await scene({
      layers: [probe('m', mk), probe('m2', mk + ' + 0.25')],
    }, slots('m', 'm2'), { start: 1, dur: 2, t: 2, beside: `<i id="${mk}" data-start="1.51"></i>` });
    expect(+text('.m')).toBeCloseTo(0.51, 9);
    expect(+text('.m2')).toBeCloseTo(0.76, 9);
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="${uniqueName('lf')}" data-start="0" data-duration="2"><b class="a"></b><b class="b"></b><i id="${mk}x" data-start="1.51"></i></div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    wf.kinetic.layers({ id: 't', size: [100, 100], duration: 2, layers: [probe('a', mk + 'x')] }, { root }).seek(1);
    wf.kinetic.layers({ id: 't', size: [100, 100], duration: 2, snap: 'frame', layers: [probe('b', mk + 'x')] }, { root }).seek(1);
    expect(+root.querySelector('.a').textContent).toBeCloseTo(1.51, 9);
    expect(+root.querySelector('.b').textContent).toBeCloseTo(1.5, 9);
  });

  it("comps: the placement's params over the comp's own, a param worked out in the placement above, and starts that add up", async () => {
    const { text } = await scene({
      comps: {
        card: { params: { a: 1, b: 2 }, layers: [probe('ab', 'a + b')] },
        outer: { layers: [{ id: 'in', kind: 'comp', comp: 'inner', start: 0.25, params: { y: 'x + 1' } }] },
        inner: { layers: [probe('ny', 'y'), probe('nt', { at: [0, 1], to: [0, 100] })] },
      },
      layers: [
        { id: 'c', kind: 'comp', comp: 'card', params: { b: 5 } },
        { id: 'o', kind: 'comp', comp: 'outer', start: 0.5, params: { x: 2 } },
      ],
    }, slots('ab', 'ny', 'nt'));
    expect(text('.ab')).toBe('6');
    expect(text('.ny')).toBe('3');
    expect(text('.nt')).toBe('25');
  });

  it("repeat: { count } reads i and n, a row that is no object is item, and a start's stagger is worked out in each copy", async () => {
    const { wf, texts } = await scene({
      comps: {
        idx: { layers: [{ id: 'v', kind: 'html', src: 'b', content: { text: ['i + n'] } }] },
        item: { layers: [{ id: 'v', kind: 'html', src: 'b', content: { text: { from: 'params.item' } } }] },
        late: { layers: [{ id: 'v', kind: 'html', src: 'b', content: { text: { at: [0, 1], to: [0, 100] } } }] },
      },
      layers: [
        { id: 'a', kind: 'comp', comp: 'idx', src: '.a', repeat: { count: 3 } },
        { id: 'b', kind: 'comp', comp: 'item', src: '.b', repeat: { over: ['x', 'y'] } },
        { id: 'c', kind: 'comp', comp: 'late', src: '.c', start: { stagger: { each: 0.5 } }, repeat: { count: 2 } },
      ],
    }, ['a', 'b', 'c'].map((c) => `<div class="${c}"><template><p><b></b></p></template></div>`).join(''));
    expect(texts('.a p')).toEqual(['3', '4', '5']);
    expect(texts('.b p')).toEqual(['x', 'y']);
    expect(texts('.c p').map(Number)).toEqual([0, 1].map((i) => 100 * Math.min(1, 1 - wf.kinetic.stagger(i, 2, { each: 0.5 }))));
  });

  it("steps: a record's steps are the lesson's, with no layers", async () => {
    const { wf } = await load();
    const id = uniqueName('step');
    await scene({ steps: { [id]: { wait: 1 } }, layers: [] }, '', { beside: `<section id="${id}" data-step data-start="0.5" data-duration="1"></section>` });
    const s = wf.getStore('kinetic');
    expect([s.stepCount, s.step]).toEqual([1, id]);
  });
});

describe(`layers(): layer kinds (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('html: translate, shift and scale on the screen; rotate in 3D through styleAt(); opacity, blur and style with a unit; life', async () => {
    const { wf, host, seek } = await scene({
      layers: [
        { id: 'pl', kind: 'html', src: '.pl', place: { translate: [10, 20], shift: ['-50%', '25%'], scale: 2 } },
        { id: 'sx', kind: 'html', src: '.sx', place: { scale: [2, 3] } },
        { id: 'rt', kind: 'html', src: '.rt', place: { translate: [5, 0], rotate: 30, scale: 1.5 } },
        { id: 'lk', kind: 'html', src: '.lk', look: { opacity: 0.4, blur: { at: [0, 2], to: [0, 4] }, style: { width: { at: [0, 2], to: [0, 80], unit: 'px' }, backgroundColor: '#00ff00' } } },
        { id: 'lf', kind: 'html', src: '.lf', life: [0.5, 1.5], look: { opacity: 1 } },
      ],
    }, ['pl', 'sx', 'rt', 'lk', 'lf'].map((c) => `<i class="${c}"></i>`).join(''));
    const el = (c) => host.querySelector('.' + c);
    expect(el('pl').style.transform).toBe(css('transform', 'translate(10px, 20px) translate(-50%, 25%) scale(2)'));
    expect(el('sx').style.transform).toBe(css('transform', 'scale(2, 3)'));
    expect(el('rt').style.transform).toBe(css('transform', wf.kinetic.styleAt(0, { translateX: 5, translateY: 0, rotate: 30, scale: 1.5 }).transform));
    expect(el('lk').style.opacity).toBe('0.4');
    expect(el('lk').style.filter).toBe(css('filter', 'blur(2px)'));
    expect(el('lk').style.width).toBe('40px');
    expect(el('lk').style.backgroundColor).toBe('rgb(0, 255, 0)');
    expect(el('lf').style.display).toBe('');
    await seek(1.75);
    expect(el('lf').style.display).toBe('none');
  });

  it('svg: content attributes by name (to a tenth, colors through roles and swatches), a turn about a pivot, a trim, and the d it reports', async () => {
    const { host, text } = await scene({
      constants: { R: 9 },
      swatches: { brand: '#ff0000' },
      roles: { accent: 'brand' },
      layers: [
        { id: 'dot', kind: 'svg', src: '.dot', content: { cx: { at: [0, 2], to: [0, 50] }, cy: 10, r: '0.5R', fill: 'accent' } },
        { id: 'ln', kind: 'svg', src: '.ln', place: { rotate: 45, pivot: [10, 20] }, look: { trim: { end: 0.25 } }, content: { d: 'M0 0 L10 10' } },
        probe('rd', { from: 'ln.d' }),
      ],
    }, '<svg width="100" height="100"><circle class="dot"></circle><path class="ln" pathLength="1" stroke-dasharray="1"></path></svg>' + slots('rd'));
    const dot = host.querySelector('.dot'), ln = host.querySelector('.ln');
    expect(['cx', 'cy', 'r', 'fill'].map((a) => dot.getAttribute(a))).toEqual(['25.0', '10.0', '4.5', '#ff0000']);
    expect(ln.getAttribute('d')).toBe('M0 0 L10 10');
    expect(ln.getAttribute('transform')).toBe('rotate(45.00 10 20)');
    expect(ln.getAttribute('stroke-dashoffset')).toBe('0.7500');
    expect(text('.rd')).toBe('M0 0 L10 10');
  });

  it("html repeat: { count } plays animate on each copy with its i of n, and a class from the animator", async () => {
    const { wf, host } = await scene({
      layers: [{
        id: 'r', kind: 'html', src: '.r', repeat: { count: 3 },
        animate: { place: { translate: [{ multiply: ['i', 10] }, 0] }, look: { opacity: { add: [0.25, { multiply: ['i', 0.25] }] }, class: 'on' } },
      }],
    }, '<ul class="r"><template><li class="cp"></li></template></ul>');
    const lis = [...host.querySelectorAll('.r li')];
    expect(lis.length).toBe(3);
    lis.forEach((li, i) => {
      const want = wf.kinetic.styleAt(0, { translateX: 10 * i, translateY: 0, opacity: 0.25 + 0.25 * i });
      expect(li.style.transform).toBe(css('transform', want.transform));
      expect(+li.style.opacity).toBeCloseTo(0.25 + 0.25 * i, 5);
      expect(li.className).toBe('cp on');
    });
  });

  it("text: a letter split's animate staggered by each, a word split, a typewriter and a scramble, and the text and length it reports", async () => {
    const { wf, host, text } = await scene({
      layers: [
        { id: 'lt', kind: 'text', src: '.lt', content: { text: 'AB', split: 'letter' }, animate: { each: 0.5, place: { translate: [{ at: [0, 1], to: [20, 0] }, 0] } } },
        { id: 'wd', kind: 'text', src: '.wd', content: { text: 'one two', split: 'word' }, animate: { look: { opacity: 0.5 } } },
        { id: 'tw', kind: 'text', src: '.tw', content: { text: 'Hello', typewriter: { start: 0.5, cps: 4 } } },
        { id: 'sc', kind: 'text', src: '.sc', content: { text: 'Hello', scramble: { start: 0, duration: 2, seed: 2 } } },
        probe('len', { from: 'tw.length' }),
        probe('tx', { from: 'tw.text' }),
      ],
    }, '<p class="lt"></p><p class="wd"></p><p class="tw"></p><p class="sc"></p>' + slots('len', 'tx'));
    const k = wf.kinetic;
    const parts = [...host.querySelectorAll('.lt span')];
    expect(parts.map((s) => s.textContent)).toEqual(['A', 'B']);
    parts.forEach((s, j) => {
      const lt = 1 - k.stagger(j, 2, { each: 0.5 });
      expect(s.style.transform).toBe(css('transform', k.styleAt(0, { translateX: k.interpolate(lt, [0, 1], [20, 0]), translateY: 0 }).transform));
    });
    const words = [...host.querySelectorAll('.wd span')];
    expect(words.map((s) => s.textContent)).toEqual(['one', ' ', 'two']);
    expect([words[0].style.opacity, words[1].style.opacity, words[2].style.opacity]).toEqual(['0.5', '', '0.5']);
    const typed = k.typewriter(0.5, 'Hello', 4);
    expect(text('.tw')).toBe(typed);
    expect(text('.sc')).toBe(k.scramble(1, 'Hello', { duration: 2, seed: 2 }));
    expect(text('.len')).toBe(String(typed.length));
    expect(text('.tx')).toBe(typed);
  });

  it("look.repeat: repeat()'s copies of the element's template, and the count it reports", async () => {
    const { wf, host, text } = await scene({
      layers: [
        { id: 'rp', kind: 'html', src: '.rp', look: { repeat: { count: 3, translate: [10, 0], opacity: 0.5 } } },
        probe('n', { from: 'rp.count' }),
      ],
    }, '<div class="rp"><template><i></i></template></div>' + slots('n'));
    const rows = wf.kinetic.repeat(3, { translateX: 10, translateY: 0, opacity: 0.5 });
    const copies = [...host.querySelectorAll('.rp i')];
    expect(copies.length).toBe(3);
    copies.forEach((c, j) => {
      expect(c.style.transform).toBe(css('transform', rows[j].style.transform));
      expect(+c.style.opacity).toBeCloseTo(rows[j].style.opacity, 5);
    });
    expect(text('.n')).toBe('3');
  });
});
