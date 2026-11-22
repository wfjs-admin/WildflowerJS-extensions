/**
 * layers.scene(): a record drawn on its clip. What each value form and layer
 * writes to the page at a seek.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, tone, wavUrl, captureWarnings, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

describe(`layers.scene() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a split text's animate: look.color is each letter's color, from a track or a function", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [
        { id: 'track', kind: 'text', src: '.track', content: { text: 'AB', split: 'letter' }, animate: { look: { color: { at: [0, 2], to: ['#000000', '#ffffff'] } } } },
        { id: 'call', kind: 'text', src: '.call', content: { text: 'AB', split: 'letter' }, animate: { look: { color: { call: 'tint', args: ['i'] } } } },
      ],
    }, { fns: { tint: (i) => (i ? '#0000ff' : '#ff0000') } });
    const host = await mount(`<div data-composition-id="ly1" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><p class="track"><template><span></span></template></p><p class="call"><template><span></span></template></p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const colors = (sel) => [...host.querySelectorAll(sel + ' span')].map((s) => s.style.color);
    expect(colors('.track')).toEqual(['rgb(128, 128, 128)', 'rgb(128, 128, 128)']);
    expect(colors('.call')).toEqual(['rgb(255, 0, 0)', 'rgb(0, 0, 255)']);
  });

  it("a split text's animate: look.style sets each letter's CSS properties by name, with a unit", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [{
        id: 'line', kind: 'text', src: '.line', content: { text: 'AB', split: 'letter' },
        animate: { look: { style: { letterSpacing: { at: [0, 2], to: [0, 8], unit: 'px' }, color: { call: 'tint', args: ['i'] } } } },
      }],
    }, { fns: { tint: (i) => (i ? 'blue' : 'red') } });
    const host = await mount(`<div data-composition-id="ly2" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><p class="line"><template><span></span></template></p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const spans = [...host.querySelectorAll('.line span')];
    expect(spans.map((s) => s.style.letterSpacing)).toEqual(['4px', '4px']);
    expect(spans.map((s) => s.style.color)).toEqual(['red', 'blue']);
  });

  // Data is read as it is: only strings written in the record are names and sums.
  it('data text stays text: a row\'s "1.10", and a label that is also a layer\'s id', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      comps: { row: { layers: [
        { id: 'label', kind: 'html', src: 'b', content: { text: { from: 'params.label' } } },
        { id: 'total', kind: 'html', src: 'span', content: { text: { from: 'params.total' } } },
      ] } },
      layers: [
        { id: 'rows', kind: 'comp', comp: 'row', src: '.rows', repeat: { over: [{ label: 'rows', total: '1.10' }, { label: 'Coal', total: '7.0' }] } },
      ],
    });
    const host = await mount(`<div data-composition-id="ly4" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><div class="rows"><template><p><b></b><span></span></p></template></div></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    expect([...host.querySelectorAll('.rows p')].map((p) => p.textContent)).toEqual(['rows1.10', 'Coal7.0']);
  });

  it("a store's number written as text still drives a track and a sum", async () => {
    const { wf } = await load();
    const store = uniqueName('st');
    wf.store(store, { state: { v: '50' } });
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      stores: [store],
      layers: [
        { id: 'w', kind: 'html', src: '.w', look: { style: { width: { by: store + '.v', keys: [[0, 0], [100, 80]], unit: 'px' } } } },
        { id: 'h', kind: 'html', src: '.h', look: { style: { height: { add: [10, { from: store + '.v' }], unit: 'px' } } } },
      ],
    });
    const host = await mount(`<div data-composition-id="ly5" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><i class="w"></i><i class="h"></i></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    expect(host.querySelector('.w').style.width).toBe('40px');
    expect(host.querySelector('.h').style.height).toBe('60px');
  });

  // A function handed a store's rows by a link reads them as plain data: walking them thousands of times a seek
  // sets off no hot-loop warning (WF-216, which the development core gives for a property read that often through
  // a store), a write to the store shows at the next seek, and a write to the rows stays out of the store.
  // A store's field that is there and empty (a choice not made yet) is read as empty: as text it shows nothing, and
  // in a sum or with a scale it counts as 0. A field the store does not have is a mistake in the record: KN-164.
  it("a link to a store's field: empty shows nothing and counts as 0 in a sum; a field the store does not have is KN-164", async () => {
    const { wf } = await load();
    const store = uniqueName('st');
    wf.store(store, { state: { pick: null, none: null, unset: undefined, score: 4, word: 'hi', deep: { on: true } } });
    const text = (id, form) => ({ id, kind: 'html', src: '.' + id, content: { text: form } });
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      stores: [store],
      layers: [
        text('score', { from: store + '.score' }), text('pick', { from: store + '.pick' }), text('unset', { from: store + '.unset' }),
        text('sum', { add: [10, { from: store + '.none' }] }), text('scaled', { from: store + '.unset', scale: 2, add: 1 }),
        text('len', { from: store + '.word.length' }), text('deep', { call: 'yes', args: [{ from: store + '.deep.on' }] }),
      ],
    }, { fns: { yes: (on) => (on ? 'yes' : 'no') } });
    const host = await mount(`<div data-composition-id="ly5c" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2">${['score', 'pick', 'unset', 'sum', 'scaled', 'len', 'deep'].map((c) => `<b class="${c}">was</b>`).join('')}</div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const shown = (c) => host.querySelector('.' + c).textContent;
    expect(shown('score')).toBe('4');
    expect(shown('pick')).toBe('');
    expect(shown('unset')).toBe('');
    expect(shown('sum')).toBe('10');
    expect(shown('scaled')).toBe('1');
    expect(shown('len')).toBe('2');
    expect(shown('deep')).toBe('yes');
    wf.getStore(store).pick = 'venus';
    // A cleared input leaves empty text, which is nothing too.
    wf.getStore(store).none = '';
    await wf.kinetic.seek(1.2);
    expect(shown('pick')).toBe('venus');
    expect(shown('sum')).toBe('10');

    let at = 0.5;
    for (const path of ['.pik', '.deep.off', '.pik.deeper']) {
      const bad = uniqueName('scene');
      wf.kinetic.layers.scene(bad, { stores: [store], layers: [text('t', { from: store + path })] });
      const el = await mount(`<div data-composition-id="${uniqueName('ly5d')}" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${bad}" data-start="0" data-duration="2"><b class="t"></b></div></div>`);
      const errors = [], was = console.error;
      console.error = (...a) => { errors.push(a.map(String).join(' ')); };
      try {
        await wf.kinetic.ready();
        await wf.kinetic.seek(at += 0.1);   // a time the clock is not at, so the scene is drawn
      } finally { console.error = was; el.remove(); }
      expect(errors.some((e) => /KN-164/.test(e)), path + ': ' + errors.join(' | ')).toBe(true);
    }
  });

  it("a function handed a store's rows reads plain data, fresh at each seek", async () => {
    const { wf } = await load();
    const store = uniqueName('st');
    wf.store(store, { state: { rows: [{ id: 'a', qzLevel: 2 }, { id: 'b', qzLevel: 5 }] } });
    const name = uniqueName('scene');
    const most = (rows) => {
      let m = 0;
      for (let k = 0; k < 1500; k++) for (const r of rows) m = Math.max(m, r.qzLevel);
      rows[0].qzLevel = -1;
      return m;
    };
    wf.kinetic.layers.scene(name, {
      stores: [store],
      layers: [{ id: 'm', kind: 'html', src: '.m', content: { text: { call: 'most', args: [{ from: store + '.rows' }] } } }],
    }, { fns: { most } });
    const host = await mount(`<div data-composition-id="ly5b" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><b class="m"></b></div></div>`);
    cleanup.push(host);
    const warnings = [], was = console.warn;
    console.warn = (...a) => { warnings.push(a.map(String).join(' ')); };
    try {
      await wf.kinetic.ready();
      for (let i = 0; i < 8; i++) {
        await wf.kinetic.seek(0.1 + i * 0.2);
        await new Promise((r) => setTimeout(r, 20));
      }
    } finally { console.warn = was; }
    expect(warnings.filter((w) => /WF-216/.test(w))).toEqual([]);
    expect(host.querySelector('.m').textContent).toBe('5');
    expect(wf.getStore(store).rows[0].qzLevel).toBe(2);
    wf.getStore(store).rows[1].qzLevel = 9;
    await wf.kinetic.seek(1.9);
    expect(host.querySelector('.m').textContent).toBe('9');
  });

  it("a key that is text beside a number ('params.w' for a link) is KN-165", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      comps: { bar: { layers: [{ id: 'bar', kind: 'html', src: ':scope', look: { style: { width: { keys: [[0, 0], [1, 'params.w']], unit: 'px' } } } }] } },
      layers: [{ id: 'bars', kind: 'comp', comp: 'bar', src: '.bars', repeat: { over: [{ w: 40 }] } }],
    });
    const host = await mount(`<div data-composition-id="ly6" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><div class="bars"><template><i></i></template></div></div></div>`);
    cleanup.push(host);
    const errors = [], was = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    try {
      await wf.kinetic.ready();
      await wf.kinetic.seek(0.5);
    } finally { console.error = was; }
    expect(errors.some((e) => /KN-165/.test(e))).toBe(true);
  });

  it("a stagger's option words stay words: from: 'last' is the option, not the record's last frame", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [{ id: 'st', kind: 'html', src: '.st', content: { text: { stagger: { each: 0.25, from: 'last' } } } }],
    });
    const host = await mount(`<div data-composition-id="ly7" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><b class="st"></b><b class="st"></b><b class="st"></b></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const want = [0, 1, 2].map((i) => String(wf.kinetic.stagger(i, 3, { each: 0.25, from: 'last' })));
    expect([...host.querySelectorAll('.st')].map((b) => b.textContent)).toEqual(want);
  });

  it('repeat { every, life }: a copy shows while its age is under life, and no longer', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [{ id: 'r', kind: 'html', src: '.r', repeat: { every: 0.5, life: 1 }, animate: { look: { style: { width: { rate: 10, unit: 'px' } } } } }],
    });
    const host = await mount(`<div data-composition-id="ly8" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><ul class="r"><template><li></li></template></ul></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(0.75);
    expect([...host.querySelectorAll('.r li')].map((li) => li.style.width)).toEqual(['7.5px', '2.5px']);
    await wf.kinetic.seek(1.25);
    // Born at 0.5 and 1; the one born at 0 is 1.25 s old.
    expect([...host.querySelectorAll('.r li')].map((li) => li.style.width)).toEqual(['7.5px', '2.5px']);
  });

  it("a split text's part keeps what its template holds, its letter first", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [{ id: 'mark', kind: 'text', src: '.mark', content: { text: 'ab', split: 'letter' } }],
    });
    const host = await mount(`<div data-composition-id="ly10" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><p class="mark"><template><span class="ch"><i class="dot"></i></span></template></p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    expect([...host.querySelectorAll('.mark .ch')].map((s) => s.innerHTML)).toEqual(['a<i class="dot"></i>', 'b<i class="dot"></i>']);
  });

  it("a record with no camera leaves the composition's world as another record's camera set it", async () => {
    const { wf } = await load();
    const a = uniqueName('cam'), b = uniqueName('flat');
    wf.kinetic.layers.scene(a, { layers: [{ id: 'cam', kind: 'camera', perspective: 900, moves: [{ to: { x: -40 } }] }] });
    wf.kinetic.layers.scene(b, { layers: [{ id: 'x', kind: 'html', src: '.x', look: { opacity: 0.5 } }] });
    const host = await mount(`<div data-composition-id="ly11" data-start="0" data-duration="2" data-width="100" data-height="100"><div class="world"></div><div data-component="${a}" data-start="0" data-duration="2"></div><div data-component="${b}" data-start="0" data-duration="2"><i class="x"></i></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const want = wf.kinetic.camera(1, { x: -40, y: 0, z: 0, pan: 0, tilt: 0, roll: 0 }, { perspective: 900 }).transform;
    const probe = document.createElement('i');
    probe.style.transform = want;
    expect(host.querySelector('.world').style.transform).toBe(probe.style.transform);
  });

  it('a layer in the world takes look.style, each property a value at the layer\'s time', async () => {
    const { wf } = await load();
    const name = uniqueName('world');
    wf.kinetic.layers.scene(name, {
      layers: [
        { id: 'cam', kind: 'camera', perspective: 900, moves: [{ to: { x: 0 } }] },
        { id: 'g', kind: 'html', band: 'world', src: '.g', life: [0, 1.5], place: { position: [10, 20, -100] }, size: [400, 300],
          look: { style: { backgroundPosition: { call: 'at', args: [{ rate: 1 }, { from: 'g.place.position' }, { from: 'g.size' }] }, letterSpacing: { at: [0, 2], to: [0, 4], unit: 'px' }, '--c': { call: 'tint', args: [] } } } },
      ],
    }, { fns: { at: (t, p, s) => (t * 10) + 'px ' + (p[0] + s[0]) + 'px', tint: () => 'rgb(1, 2, 3)' } });
    const host = await mount(`<div data-composition-id="${uniqueName('lyw')}" data-start="0" data-duration="2" data-width="100" data-height="100"><div class="world"><div class="g"></div></div><div data-component="${name}" data-start="0" data-duration="2"></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const g = host.querySelector('.g');
    expect(g.style.backgroundPosition).toBe('10px 410px');
    expect(g.style.letterSpacing).toBe('2px');
    expect(g.style.getPropertyValue('--c')).toBe('rgb(1, 2, 3)');
    await wf.kinetic.seek(0.5);
    expect(g.style.backgroundPosition).toBe('5px 410px');
    // Not shown, it holds none of them, so the page at a time is the same whatever was drawn before.
    await wf.kinetic.seek(1.8);
    expect(g.style.display).toBe('none');
    expect(g.style.backgroundPosition).toBe('');
    expect(g.style.letterSpacing).toBe('');
    expect(g.style.getPropertyValue('--c')).toBe('');
    expect((await wf.kinetic.check({ samples: 12 })).ok).toBe(true);
  });

  it('look.style and a copy\'s animate write custom properties (--name)', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [
        { id: 'one', kind: 'html', src: '.one', look: { style: { '--c': { call: 'tint', args: [0] } } } },
        { id: 'many', kind: 'html', src: '.many', repeat: { count: 2 }, animate: { look: { style: { '--c': { call: 'tint', args: ['i'] } } } } },
      ],
    }, { fns: { tint: (i) => (i ? 'blue' : 'red') } });
    const host = await mount(`<div data-composition-id="ly12" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><i class="one"></i><p class="many"><template><b></b></template></p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    expect(host.querySelector('.one').style.getPropertyValue('--c')).toBe('red');
    expect([...host.querySelectorAll('.many b')].map((b) => b.style.getPropertyValue('--c'))).toEqual(['red', 'blue']);
  });

  it("repeat.over's rows from a call that reads an input", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      inputs: { word: { type: String, default: 'abc' } },
      comps: { letter: { layers: [{ id: 'l', kind: 'html', src: ':scope', content: { text: { from: 'params.ch' } } }] } },
      layers: [{ id: 'letters', kind: 'comp', comp: 'letter', src: '.letters', repeat: { over: { call: 'letters', args: [{ from: 'inputs.word' }] } } }],
    }, { fns: { letters: (word) => [...word].map((ch) => ({ ch })) } });
    const host = await mount(`<div data-composition-id="ly9" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><p class="letters"><template><b></b></template></p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    expect([...host.querySelectorAll('.letters b')].map((b) => b.textContent)).toEqual(['a', 'b', 'c']);
  });

  it("look.draw: a text stroke written as data keeps its text, the option of the same name", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [{
        id: 'pad', kind: 'html', src: 'canvas',
        look: { draw: { inks: { ink: { tool: 'pencil' } }, start: 0, end: 1, strokes: [{ text: { text: 'Hi', font: '40px serif', x: 10, y: 60, ink: 'ink' } }] } },
      }],
    });
    const host = await mount(`<div data-composition-id="ly3" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><canvas width="100" height="100"></canvas></div></div>`);
    cleanup.push(host);
    const errors = [], was = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    try {
      await wf.kinetic.ready();
      await wf.kinetic.seek(1.5);
    } finally { console.error = was; }
    expect(errors.filter((e) => /KN-/.test(e))).toEqual([]);
  });

  // The music plays on the composition's clock, so a clip that starts later reads it at the composition's time.
  it("{ level } and { spectrum } in a clip that starts at 2 read the music at the composition's time", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      layers: [
        { id: 'lv', kind: 'html', src: '.lv', content: { text: { level: 'bass' } } },
        { id: 'sp', kind: 'html', src: '.sp b', look: { opacity: { spectrum: { bins: 2 } } } },
      ],
    });
    const host = await mount(`<div data-composition-id="ly4" data-start="0" data-duration="4" data-width="100" data-height="100" data-fps="30"><audio src="${wavUrl(tone(60, 2))}" data-start="2"></audio><div data-component="${name}" data-start="2" data-duration="2"><p class="lv"></p><p class="sp"><b></b><b></b></p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(3);
    expect(Number(host.querySelector('.lv').textContent)).toBeGreaterThan(0.9);
    const bin = wf.kinetic.spectrum(3, 2)[0];
    expect(bin).toBeGreaterThan(0.1);
    expect(Number(host.querySelector('.sp b').style.opacity)).toBeCloseTo(bin, 3);
  });

  it('a record the check refuses when its scene starts fails check()', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, { layrs: [] });
    const was = console.error, logged = [];
    console.error = (...a) => { logged.push(a.map(String).join(' ')); };
    let host, r;
    try {
      host = await mount(`<div data-composition-id="ly6" data-start="0" data-duration="1" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="1"></div></div>`);
      cleanup.push(host);
      await wf.kinetic.ready().catch(() => {});
      r = await wf.kinetic.check({ samples: 2 });
    } finally { console.error = was; }
    expect(r.ok).toBe(false);
    expect(r.firstError || r.code).toMatch(/KN-161/);
  });

  it("a preset that leaves out a track keeps that property at rest", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      presets: { fade: { opacity: { at: [0, 1], to: [0, 1] } } },
      layers: [{ id: 'p', kind: 'html', src: '.p', look: { preset: 'fade' } }],
    });
    const host = await mount(`<div data-composition-id="ly7" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><p class="p">p</p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(0.5);
    const p = host.querySelector('.p');
    expect(Number(p.style.opacity)).toBe(0.5);
    expect(p.style.transform).toBe('translateY(0px) scale(1)');
  });

  it("a swatch or role name is its color in look.style, an { at, to } track, a copy's style, and an html layer's look.color", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      swatches: { ink: '#000000', red: '#ff0000', blue: 'rgb(0, 0, 255)' },
      roles: { accent: 'red', cool: 'blue' },
      layers: [
        { id: 'st', kind: 'html', src: '.st', look: { style: { color: 'accent', background: 'cool', display: 'block' } } },
        { id: 'tr', kind: 'html', src: '.tr', look: { style: { color: { at: [0, 2], to: ['ink', 'accent'] } } } },
        { id: 'lc', kind: 'html', src: '.lc', look: { color: 'accent' } },
        { id: 'cp', kind: 'html', src: '.cp', repeat: { count: 1 }, animate: { look: { style: { color: 'cool' } } } },
      ],
    });
    const host = await mount(`<div data-composition-id="ly8" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><p class="st">a</p><p class="tr">b</p><p class="lc">c</p><div class="cp"><template><i>d</i></template></div></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const st = host.querySelector('.st').style;
    expect([st.color, st.background, st.display]).toEqual(['rgb(255, 0, 0)', 'rgb(0, 0, 255)', 'block']);
    expect(host.querySelector('.tr').style.color).toBe('rgb(128, 0, 0)');
    expect(host.querySelector('.lc').style.color).toBe('rgb(255, 0, 0)');
    expect(host.querySelector('.cp i').style.color).toBe('rgb(0, 0, 255)');
  });

  it("an html layer's text string is shown as written; a bare 'end' or 'last' in CSS or an attribute is the keyword", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      constants: { bud: 7, R: 12 },
      layers: [
        { id: 'a', kind: 'html', src: '.a', content: { text: 'bud' }, look: { style: { textAlign: 'end', width: { add: ['R'], unit: 'px' } } } },
        { id: 'b', kind: 'html', src: '.b', content: { text: 'end' } },
        { id: 'n', kind: 'html', src: '.n', content: { text: { add: ['bud'] } } },
        { id: 'c', kind: 'svg', src: '.c', content: { 'text-anchor': 'end', x: 'R' } },
        { id: 'k', kind: 'html', src: '.k', look: { opacity: { keys: [[0, 0], ['end', 1]] } } },
      ],
    });
    const host = await mount(`<div data-composition-id="ly9" data-start="0" data-duration="4" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="4"><p class="a">x</p><p class="b">y</p><p class="n">z</p><svg><text class="c">t</text></svg><p class="k">k</p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(2);
    expect(host.querySelector('.a').textContent).toBe('bud');
    expect(host.querySelector('.a').style.textAlign).toBe('end');
    expect(host.querySelector('.a').style.width).toBe('12px');
    expect(host.querySelector('.b').textContent).toBe('end');
    expect(host.querySelector('.n').textContent).toBe('7');
    expect(host.querySelector('.c').getAttribute('text-anchor')).toBe('end');
    expect(host.querySelector('.c').getAttribute('x')).toBe('12.0');
    expect(Number(host.querySelector('.k').style.opacity)).toBeCloseTo(0.5, 3);
  });

  // A key's color written as a swatch or a role is that color before the first key and after the last too.
  it('a { keys } color track of swatch and role names writes the color at its ends', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      swatches: { ink: '#000000', red: '#ff0000' },
      roles: { accent: 'red' },
      layers: [{ id: 'k', kind: 'html', src: '.k', look: { style: { color: { keys: [[0.5, 'ink'], [1, 'accent']] } } } }],
    });
    const host = await mount(`<div data-composition-id="ly5" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2"><p class="k">k</p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    const at = async (t) => { await wf.kinetic.seek(t); return host.querySelector('.k').style.color; };
    expect(await at(0.2)).toBe('rgb(0, 0, 0)');
    expect(await at(0.75)).toBe('rgb(128, 0, 0)');
    expect(await at(1.5)).toBe('rgb(255, 0, 0)');
  });

  // A beat between two beats, as timeOf() reads it: at 120 beats a minute from 0, beat 2.5 is 1.25 s.
  it("a beat name takes a fraction ('beat 2.5'), in a key, in a sum, and snapped to its frame", async () => {
    const { wf } = await load();
    const plain = uniqueName('scene'), snapped = uniqueName('scene');
    const layers = [
      { id: 'a', kind: 'html', src: '.a', look: { opacity: { keys: [['beat 1', 0], ['beat 2.5', 1]] } } },
      { id: 'b', kind: 'html', src: '.b', look: { opacity: { keys: [[0, 0], ['beat 2.5 - 0.25', 1]] } } },
    ];
    wf.kinetic.layers.scene(plain, { layers });
    // 1.25 s is frame 37.5 at 30 fps, and lands on frame 38.
    wf.kinetic.layers.scene(snapped, { snap: 'frame', layers: [{ id: 'a', kind: 'html', src: '.a', look: { opacity: { keys: [[0, 0], ['beat 2.5', 1]] } } }] });
    const host = await mount(`<div data-composition-id="ly9" data-start="0" data-duration="2" data-width="100" data-height="100" data-fps="30"><audio src="${wavUrl(tone(60, 2))}" data-start="0" data-tempo="120" data-downbeat="0"></audio>
      <div data-component="${plain}" data-start="0" data-duration="2"><p class="a">a</p><p class="b">b</p></div><div data-component="${snapped}" data-start="0" data-duration="2"><p class="a">a</p></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    expect(wf.kinetic.timeOf('beat 2.5')).toBe(1.25);
    await wf.kinetic.seek(0.9);
    const [a, b, s] = [...host.querySelectorAll('.a, .b')].map((p) => Number(p.style.opacity));
    expect(a).toBeCloseTo(0.4 / 0.75, 5);
    expect(b).toBeCloseTo(0.9, 5);
    expect(s).toBeCloseTo(0.9 / (38 / 30), 5);
  });

  // A record that counts in frames and names no fps counts at the root's rate, as it takes the root's size.
  it("a record with no fps counts frames at the root's data-fps, and one with its own fps keeps it", async () => {
    const { wf } = await load();
    const follows = uniqueName('scene'), own = uniqueName('scene');
    const fade = { id: 'a', kind: 'html', src: '.a', look: { opacity: { keys: [[0, 0], [60, 1]] } } };
    wf.kinetic.layers.scene(follows, { unit: 'frame', layers: [fade] });
    wf.kinetic.layers.scene(own, { unit: 'frame', fps: 30, layers: [fade] });
    const clip = (name) => `<div data-component="${name}" data-start="0" data-duration="2"><p class="a">a</p></div>`;
    const host = await mount(`<div data-composition-id="ly8" data-start="0" data-duration="2" data-fps="60" data-width="100" data-height="100">${clip(follows)}${clip(own)}</div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    const at = async (t) => { await wf.kinetic.seek(t); return [...host.querySelectorAll('.a')].map((p) => Number(p.style.opacity)); };
    expect(await at(0.5)).toEqual([0.5, 0.25]);
    expect(await at(1)).toEqual([1, 0.5]);
  });

  it("a smeared layer's copies, and the ghosts trailing a layer, take its look.style with the unit, each at its own time", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const width = { at: [0, 2], to: [0, 80], unit: 'px' };
    wf.kinetic.layers.scene(name, {
      layers: [
        { id: 's', kind: 'html', src: '.s', place: { translate: { keys: [[0, [0, 0]], [2, [200, 0]]] } }, look: { smear: { samples: 3 }, style: { width, letterSpacing: '3px' } } },
        { id: 'plain', kind: 'html', src: '.plain', look: { style: { width } } },
        { id: 'g', kind: 'html', src: '.g', look: { trails: { kind: 'ghosts', of: 'plain', count: 2, lag: 0.1 } } },
      ],
    });
    const host = await mount(`<div data-composition-id="ly11" data-start="0" data-duration="2" data-width="300" data-height="100"><div data-component="${name}" data-start="0" data-duration="2">
      <p class="s">a</p><p class="plain">a</p><div class="g"><template><i></i></template></div></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    expect(host.querySelector('.plain').style.width).toBe('40px');
    // The element is the first sample, at the frame's own time; the others are later in the shutter, and wider.
    const smear = [...host.querySelectorAll('.s')].map((e) => e.style);
    expect(smear.length).toBe(3);
    expect(smear.map((s) => s.letterSpacing)).toEqual(['3px', '3px', '3px']);
    expect(smear.every((s) => /px$/.test(s.width)), smear.map((s) => s.width).join(', ')).toBe(true);
    const w = smear.map((s) => parseFloat(s.width));
    expect(w[0]).toBeCloseTo(40, 5);
    expect(w[1] > w[0] && w[2] > w[1] && w[2] < 41, w.join(', ')).toBe(true);
    // Each ghost is the layer a lag earlier.
    const ghosts = [...host.querySelectorAll('.g > i')].map((e) => e.style.width);
    expect(ghosts.every((x) => /px$/.test(x)), ghosts.join(', ')).toBe(true);
    expect(parseFloat(ghosts[0])).toBeCloseTo(36, 5);
    expect(parseFloat(ghosts[1])).toBeCloseTo(32, 5);
  });

  // The browser drops a length with no unit, and the element keeps what it had.
  it('KN-122: a length in look.style, or in an animate\'s, given a number or a track of numbers with no unit warns once, in development only', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.layers.scene(name, {
        layers: [
          { id: 'num', kind: 'html', src: '.num', look: { style: { letterSpacing: 20 } } },
          { id: 'track', kind: 'html', src: '.track', look: { style: { width: { at: [0, 2], to: [0, 80] } } } },
          { id: 'keys', kind: 'html', src: '.keys', look: { style: { 'font-size': { keys: [[0, 10], [2, ['hold', 30]]] } } } },
          { id: 'parts', kind: 'text', src: '.parts', content: { text: 'AB', split: 'letter' }, animate: { look: { style: { letterSpacing: { at: [0, 2], to: [0, 8] } } } } },
          { id: 'copies', kind: 'html', src: '.copies', repeat: { count: 2 }, animate: { look: { style: { marginLeft: 4 } } } },
          // Each of these is a length the browser takes, or no length.
          { id: 'fine', kind: 'html', src: '.fine', look: { style: {
            letterSpacing: '20px', width: { at: [0, 2], to: [0, 80], unit: 'px' }, height: { call: 'tall' }, fontSize: { keys: [[0, 10], [2, 30]], unit: 'px' },
            top: 0, left: { at: [0, 2], to: [0, 0] }, lineHeight: 1.4, opacity: 0.5, zIndex: { at: [0, 2], to: [1, 3] },
          } } },
        ],
      }, { fns: { tall: () => '12px' } });
      const host = await mount(`<div data-composition-id="ly10" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="2">
        <p class="num">a</p><p class="track">a</p><p class="keys">a</p><p class="parts"><template><span></span></template></p><p class="copies"><template><span></span></template></p><p class="fine">a</p></div></div>`);
      cleanup.push(host);
      await wf.kinetic.ready();
      for (const t of [0.5, 1, 1.5, 1]) await wf.kinetic.seek(t);
      // What was written with its unit is on the element. A number with none is not, and a track with none is
      // not either, or is left at its 0, the one length that needs no unit, when a frame there was drawn.
      const fine = host.querySelector('.fine').style;
      expect([fine.letterSpacing, fine.width, fine.height, fine.fontSize, fine.top, fine.lineHeight]).toEqual(['20px', '40px', '12px', '20px', '0px', '1.4']);
      expect(host.querySelector('.num').style.letterSpacing).toBe('');
      expect(['', '0px']).toContain(host.querySelector('.track').style.width);
    });
    const kn = lines.filter((l) => l.includes('KN-122'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(5);
    expect(kn[0]).toContain('layers.num.look.style.letterSpacing is a number with no unit, and letterSpacing takes a length, so the browser ignores 20');
    expect(lines[lines.indexOf(kn[0]) + 1]).toContain("Suggestion: Write it with its unit: letterSpacing: '20px'.");
    expect(kn[1]).toContain('layers.track.look.style.width gives numbers with no unit, and width takes a length, so the browser ignores a value such as 80');
    expect(lines[lines.indexOf(kn[1]) + 1]).toContain("Suggestion: Add unit: 'px' (or '%', 'em', 'rem') beside its keys: width: { …, unit: 'px' }.");
    expect(kn[2]).toContain('layers.keys.look.style.font-size gives numbers with no unit');
    expect(kn[3]).toContain('layers.parts.animate.look.style.letterSpacing gives numbers with no unit');
    expect(kn[4]).toContain('layers.copies.animate.look.style.marginLeft is a number with no unit');
  });
});
