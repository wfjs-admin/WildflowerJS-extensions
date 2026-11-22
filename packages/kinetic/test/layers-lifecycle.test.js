/**
 * layers.scene(): what a clip leaves behind when it goes. A scene that is
 * destroyed stops following its stores, its queries and its springs, and takes
 * the copies it made of a <template> with it, so the same clip can be built
 * again and a clip that comes and goes costs nothing once it is gone.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, tick, frames, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});
const clip = (name, inner, id, dur = 2) => `<div data-composition-id="${id}" data-start="0" data-duration="${dur}" data-width="100" data-height="100"><div data-component="${name}" data-start="0" data-duration="${dur}">${inner}</div></div>`;

describe(`layers.scene() and its clip's life (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a destroyed clip is not drawn again when a store it read changes', async () => {
    const { wf } = await load();
    const st = uniqueName('st');
    wf.store(st, { state: { v: 1 } });
    const name = uniqueName('scene');
    let calls = 0;
    wf.kinetic.layers.scene(name, {
      stores: [st],
      layers: [{ id: 'a', kind: 'html', src: '.a', content: { text: { call: 'f', args: [{ from: st + '.v' }] } } }],
    }, { fns: { f: (v) => { calls++; return String(v); } } });
    const host = await mount(clip(name, '<b class="a"></b>', 'life1'));
    await wf.kinetic.ready();
    await wf.kinetic.seek(0.5);
    expect(host.querySelector('.a').textContent).toBe('1');
    host.remove();
    await tick(50); await frames(3);
    const before = calls;
    wf.getStore(st).v = 2;
    await tick(20); await frames(2);
    wf.getStore(st).v = 3;
    await tick(20);
    expect(calls - before).toBe(0);
  });

  it('a clip turned off and on by data-render draws once for a store change, not once for each time it was made', async () => {
    const { wf } = await load();
    const st = uniqueName('st');
    wf.store(st, { state: { v: 1 } });
    const outer = uniqueName('outer');
    wf.component(outer, { state: { on: true }, flip() { this.on = !this.on; } });
    const name = uniqueName('scene');
    let calls = 0;
    wf.kinetic.layers.scene(name, {
      stores: [st],
      comps: { row: { layers: [{ id: 'l', kind: 'html', src: ':scope', content: { text: { call: 'f', args: [{ from: 'params.label' }, { from: st + '.v' }] } } }] } },
      layers: [{ id: 'rows', kind: 'comp', comp: 'row', src: '.rows', repeat: { over: [{ label: 'a' }, { label: 'b' }] } }],
    }, { fns: { f: (l, v) => { calls++; return l + v; } } });
    const host = await mount(`<div data-composition-id="life2" data-start="0" data-duration="2" data-width="100" data-height="100"><div data-component="${outer}"><button class="flip" data-action="flip"></button><div data-render="on"><div data-component="${name}" data-start="0" data-duration="2"><div class="rows"><template><p></p></template></div></div></div></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(0.5);
    const texts = () => [...host.querySelectorAll('.rows p')].map((p) => p.textContent);
    const flip = () => host.querySelector('.flip').click();
    flip(); await tick(20); await frames(3);
    flip(); await tick(20); await frames(3);
    await wf.whenIdle(); await tick(20);
    await wf.kinetic.seek(0.7);
    expect(texts()).toEqual(['a1', 'b1']);
    const before = calls;
    wf.getStore(st).v = 2;
    await tick(20); await frames(3);
    expect(texts()).toEqual(['a2', 'b2']);
    expect(calls - before).toBe(2);   // one draw of the two rows
  });

  it('a destroyed clip with a spring is not drawn on the frames of a later spring', async () => {
    const { wf } = await load();
    const st = uniqueName('st');
    wf.store(st, { state: { v: 0 } });
    const name = uniqueName('scene');
    let calls = 0;
    wf.kinetic.layers.scene(name, {
      stores: [st],
      layers: [{ id: 'a', kind: 'html', src: '.a', content: { text: { call: 'f', args: [{ follow: st + '.v' }] } } }],
    }, { fns: { f: (v) => { calls++; return String(Math.round(v)); } } });
    const was = wf.kinetic.config().mode;
    wf.kinetic.config({ mode: 'interactive' });
    try {
      const host = await mount(clip(name, '<b class="a"></b>', 'life3', 10));
      await wf.kinetic.ready();
      await wf.kinetic.seek(0.5);
      wf.getStore(st).v = 100;
      await tick(1500);
      expect(host.querySelector('.a').textContent).toBe('100');
      host.remove();
      await tick(50);
      const before = calls;
      wf.getStore(st).v = 0;
      await tick(600);
      expect(calls - before).toBe(0);
    } finally { wf.kinetic.config({ mode: was }); }
  });

  // A selector that finds nothing in the scene's clip looks beside the clip, in the composition, a clip with no
  // scene of its own included; it never looks inside another scene's clip, so a clip missing its element fails
  // (KN-168) where it would write into its neighbor's.
  it("a clip's selectors reach an element beside the clip, and never one inside another scene's clip", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      props: { word: { type: String, default: 'x' } },
      layers: [
        { id: 't', kind: 'html', src: '.t', content: { text: { from: 'props.word' } } },
        { id: 'b', kind: 'html', src: '.beside', look: { opacity: 0.5 } },
        { id: 'p', kind: 'html', src: '.plain', look: { opacity: 0.25 } },
      ],
    });
    const errors = [], was = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    let host;
    try {
      host = await mount(`<div data-composition-id="life6" data-start="0" data-duration="2" data-width="100" data-height="100">
        <i class="beside"></i>
        <div data-start="0" data-duration="1"><i class="plain"></i></div>
        <div data-component="${name}" data-start="0" data-duration="2" data-prop-word="one"><b class="t"></b></div>
        <div data-component="${name}" data-start="0" data-duration="2" data-prop-word="two"></div></div>`);
      cleanup.push(host);
      await Promise.resolve(wf.kinetic.ready()).catch(() => {});
      await Promise.resolve(wf.kinetic.seek(0.73)).catch(() => {});
    } finally { console.error = was; }
    // The second clip's word is never written into the first clip's element.
    expect(host.querySelector('.t').textContent).not.toBe('two');
    expect(host.querySelector('.beside').style.opacity).toBe('0.5');
    expect(host.querySelector('.plain').style.opacity).toBe('0.25');
    expect(errors.some((e) => /KN-168/.test(e)), errors.join(' | ')).toBe(true);
  });

  // A repeat over a query's rows follows them: when the rows change the scene is built again, so the copies match
  // the data its links read; rows that come back the same leave the copies as they are.
  it("a repeat over a query's rows is built again when the rows change, and left alone when they come back the same", async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const q = uniqueName('q');
    let rows = [{ label: 'Wind' }, { label: 'Solar' }];
    wf.query(q, { from: () => Promise.resolve(rows.map((r) => Object.assign({}, r))) });
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      queries: [q],
      comps: { row: { layers: [{ id: 'l', kind: 'html', src: 'b', content: { text: { from: 'params.label' } } }] } },
      layers: [
        { id: 'c', kind: 'html', src: '.count', content: { text: { call: 'count', args: [{ from: q + '.rows' }] } } },
        { id: 'rows', kind: 'comp', comp: 'row', src: '.rows', repeat: { over: q + '.rows' } },
      ],
    }, { fns: { count: (r) => String(r.length) } });
    const host = await mount(clip(name, '<i class="count"></i><div class="rows"><template><p><b></b></p></template></div>', 'life7'));
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(0.5);
    const labels = () => [...host.querySelectorAll('.rows p')].map((p) => p.textContent);
    const again = async (at) => { await wf.getQuery(q).refresh(); await tick(30); await wf.kinetic.seek(at); };
    expect(labels()).toEqual(['Wind', 'Solar']);

    // The same rows again: the copies are the elements they were.
    const first = host.querySelector('.rows p');
    await again(0.6);
    expect(host.querySelector('.rows p')).toBe(first);

    // A row more, and others in another order.
    rows = [{ label: 'Hydro' }, { label: 'Wind' }, { label: 'Coal' }];
    await again(0.7);
    expect(host.querySelector('.count').textContent).toBe('3');
    expect(labels()).toEqual(['Hydro', 'Wind', 'Coal']);

    // Rows fewer: no copy is left behind.
    rows = [{ label: 'Coal' }];
    await again(0.8);
    expect(host.querySelector('.count').textContent).toBe('1');
    expect(labels()).toEqual(['Coal']);
  });

  it('a clip built again on the same elements has its copies once', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.layers.scene(name, {
      comps: { row: { layers: [{ id: 'l', kind: 'html', src: ':scope', content: { text: { from: 'params.label' } } }] } },
      layers: [{ id: 'rows', kind: 'comp', comp: 'row', src: '.rows', repeat: { over: [{ label: 'a' }, { label: 'b' }] } }],
    });
    const host = await mount(clip(name, '<div class="rows"><template><p></p></template></div>', 'life4'));
    cleanup.push(host);
    await wf.kinetic.ready();
    await wf.kinetic.seek(0.5);
    expect(host.querySelectorAll('.rows p').length).toBe(2);
    const root = host.firstElementChild;
    root.remove();
    await tick(50); await frames(3);
    expect(root.querySelectorAll('.rows p').length).toBe(0);
    host.appendChild(root);
    wf.scan(host);
    await wf.whenIdle(); await tick(20);
    await wf.kinetic.seek(0.7);
    expect([...host.querySelectorAll('.rows p')].map((p) => p.textContent)).toEqual(['a', 'b']);
  });
});
