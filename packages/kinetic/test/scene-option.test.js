/**
 * The `scene` option of effect(), shade(), blur(), text(), lottie() and
 * animatedImage(): with scene: this, a layer follows that scene's local time
 * and is disposed with the scene, wherever and whenever it was made (here
 * after an await in init(), on canvases outside the scene); without it, a
 * layer follows the composition time and outlives the scene, even when made
 * in the synchronous part of the scene's init(). KN-100 for a scene that is
 * no scene's component, and for set({ scene }).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, dispatchSeek, uniqueName, expectKN, tick, BUILD, CORE_TIER } from './helpers.js';
import WS from './fixtures/outlines-work-sans.json';

const cleanup = [];
const scenesToDrop = [];
const handles = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const h of handles.splice(0)) h.dispose();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

function source() {
  const c = document.createElement('canvas');
  c.width = 20; c.height = 10;
  const g = c.getContext('2d');
  g.fillStyle = '#505050';
  g.fillRect(0, 0, 20, 10);
  return c;
}

// A loaded lottie-web stand-in: 100 frames at 10 a second.
function duck() {
  const d = {
    isLoaded: true, totalFrames: 100, frameRate: 10, calls: [],
    goToAndStop(v) { d.calls.push(v); },
    addEventListener() { return () => {}; },
  };
  return d;
}

const box = (cls, tag = 'canvas') => `<${tag} class="${cls}" style="position:absolute;left:0;top:0;width:20px;height:10px"></${tag}>`;

describe(`the scene option (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("with scene: this, made after an await in init(): the scene's local time, disposed with the scene; without, made in init(): composition time, kept", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const name = uniqueName('scopt');
    scenesToDrop.push(name);
    const host = await mount(`<div data-composition-id="so1" data-start="0" data-duration="3" data-fps="10" data-width="200" data-height="100" style="position:relative;width:200px;height:100px">
      ${['e1', 'e2', 's1', 's2', 't1', 't2'].map((c) => box(c)).join('')}${box('b1', 'div')}${box('b2', 'div')}
    </div>`);
    cleanup.push(host);
    k.config({});
    const q = (s) => host.querySelector(s);
    const seen = { s1: [], s2: [], b1: [], b2: [], t1: [], t2: [] };
    const mark = (key) => (m, t) => { seen[key].push(t); m.fill({ amount: 0.5 }); };
    const word = (key) => (m, t) => { seen[key].push(t); m.line('KI', { at: [0, 8], size: 8 }); };
    const lIn = duck(), lOut = duck();
    let destroyed = 0, made = false;
    k.scene(name, {
      async init() {
        // In the synchronous part of init(), without a scene: composition time.
        handles.push(k.effect(q('.e2'), { source: source(), kind: 'duotone' }));
        handles.push(k.shade(q('.s2'), { marks: mark('s2') }));
        handles.push(k.blur(q('.b2'), { marks: mark('b2') }));
        handles.push(k.text(q('.t2'), { font: WS, lines: word('t2') }));
        handles.push(k.lottie(lOut));
        await tick(0);
        // After the await, with the scene: its local time, and gone with it.
        handles.push(k.effect(q('.e1'), { scene: this, source: source(), kind: 'duotone' }));
        handles.push(k.shade(q('.s1'), { scene: this, marks: mark('s1') }));
        handles.push(k.blur(q('.b1'), { scene: this, marks: mark('b1') }));
        handles.push(k.text(q('.t1'), { scene: this, font: WS, lines: word('t1') }));
        handles.push(k.lottie(lIn, { scene: this }));
        made = true;
      },
      beforeDestroy() { destroyed++; },
    });
    host.firstElementChild.insertAdjacentHTML('beforeend', `<div class="sc" data-component="${name}" data-start="1" data-duration="2"></div>`);
    wf.scan(host);
    await wf.whenIdle();
    for (let i = 0; i < 100 && !made; i++) await tick(10);
    expect(made).toBe(true);
    await k.ready();
    await dispatchSeek(1.5).done;
    const last = (key) => seen[key][seen[key].length - 1];
    expect(['s1', 'b1', 't1'].map(last), 'shade, blur and text with the scene: 0.5 s into it').toEqual([0.5, 0.5, 0.5]);
    expect(['s2', 'b2', 't2'].map(last), 'shade, blur and text without one: the composition time').toEqual([1.5, 1.5, 1.5]);
    expect([lIn.calls.at(-1), lOut.calls.at(-1)], 'lottie: frame 5 in the scene, 15 on the composition').toEqual([5, 15]);
    const gl = (c) => q(c).getContext('webgl2');
    expect([gl('.e1').isContextLost(), gl('.e2').isContextLost()]).toEqual([false, false]);

    q('.sc').remove();
    for (let i = 0; i < 100 && !destroyed; i++) await tick(10);
    expect(destroyed).toBe(1);
    await tick(0);
    expect([gl('.e1').isContextLost(), gl('.e2').isContextLost()], "the scene's effect is released, the other kept").toEqual([true, false]);
    for (const key in seen) seen[key].length = 0;
    lIn.calls.length = 0; lOut.calls.length = 0;
    await dispatchSeek(1.6).done;
    expect([seen.s1, seen.b1, seen.t1, lIn.calls], 'nothing of the scene is drawn after it').toEqual([[], [], [], []]);
    expect(['s2', 'b2', 't2'].map(last)).toEqual([1.6, 1.6, 1.6]);
    expect(lOut.calls).toEqual([16]);
    expect(q('.b1').style.backdropFilter, "the scene's blur took its filter off").toBe('');
  });

  it('a scene given from seek(local) counts too', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const name = uniqueName('scseek');
    scenesToDrop.push(name);
    const seen = [];
    let layer = null;
    k.scene(name, {
      seek() {
        if (layer) return;
        layer = k.shade(this.element.querySelector('canvas'), { scene: this, marks: (m, t) => { seen.push(t); m.fill({}); } });
        handles.push(layer);
      },
    });
    const host = await mount(`<div data-composition-id="so2" data-start="0" data-duration="2" data-fps="10" data-width="20" data-height="10" style="position:relative;width:20px;height:10px">
      <div data-component="${name}" data-start="0.5" data-duration="1.5">${box('c')}</div>
    </div>`);
    cleanup.push(host);
    k.config({});
    await k.ready();
    await dispatchSeek(1.2).done;
    expect(seen.at(-1)).toBeCloseTo(0.7, 9);
  });

  it('KN-100 for a scene that is no scene component: an element, a name, a plain object, null, an object whose element is no scene; and for set({ scene })', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const host = await mount(`<div data-composition-id="so3" data-start="0" data-duration="1" data-width="20" data-height="10" style="position:relative;width:20px;height:10px">${box('c')}${box('d', 'div')}</div>`);
    cleanup.push(host);
    const canvas = host.querySelector('.c'), div = host.querySelector('.d');
    const none = () => {};
    const bad = [
      [div, /^scene is the scene's own component, this in its init\(\) or seek\(\), not a <div> element$/],
      ['title', /not a name \('title'\)$/],
      [{}, /not \{\}$/],
      [null, /not null$/],
      [{ element: div }, /whose element is no scene's$/],
    ];
    for (const [v, re] of bad) {
      expectKN(() => k.effect(canvas, { scene: v, source: source(), kind: 'duotone' }), 'KN-100', 'effect(canvas, { scene })', re);
      expectKN(() => k.shade(canvas, { scene: v, marks: none }), 'KN-100', 'shade(canvas, { scene })', re);
      expectKN(() => k.blur(div, { scene: v, marks: none }), 'KN-100', 'blur(element, { scene })', re);
      expectKN(() => k.text(canvas, { scene: v, font: WS, lines: none }), 'KN-100', 'text(canvas, { scene })', re);
      expectKN(() => k.lottie(duck(), { scene: v }), 'KN-100', 'lottie(animation, { scene })', re);
      if (typeof self.ImageDecoder === 'function') expectKN(() => k.animatedImage('x.gif', { scene: v }), 'KN-100', 'animatedImage(src, { scene })', re);
    }
    if (typeof self.ImageDecoder === 'function') expectKN(() => k.animatedImage('x.gif', { loop: true }), 'KN-100', 'animatedImage(src, { loop })', /the one option is scene/);
    // Nothing was made by the failed calls: the canvas still takes an effect.
    const fx = k.effect(canvas, { source: source(), kind: 'duotone' });
    handles.push(fx);
    expectKN(() => fx.set({ scene: {} }), 'KN-100', 'set({ scene })', /^scene is given when the effect is made$/);
    const other = document.createElement('canvas');
    host.firstElementChild.appendChild(other);
    const layer = k.shade(other, { marks: none });
    handles.push(layer);
    expectKN(() => layer.set({ scene: {} }), 'KN-100', 'set({ scene })', /^scene is set when the layer is made$/);
    const b = k.blur(div, { marks: none });
    handles.push(b);
    expectKN(() => b.set({ scene: {} }), 'KN-100', 'set({ scene })', /^scene is set when the blur is made$/);
    const t = k.text(document.createElement('canvas'), { font: WS, lines: none });
    handles.push(t);
    expectKN(() => t.set({ scene: {} }), 'KN-100', 'set({ scene })', /^scene is given when the text is made$/);
  });
});
