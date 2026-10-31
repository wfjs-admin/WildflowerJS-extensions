/**
 * view.draw() draws one frame now, past the render: 'change' and maxFps
 * gates; views() lists the live views; canvas() is the renderer's canvas.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, stage, frames, uniq, captureWarnings, BUILD, CORE_TIER } from './helpers.js';

let wf, THREE;
const cleanup = [];

beforeAll(async () => { ({ wf, THREE } = await load()); });
afterEach(() => {
  while (cleanup.length) {
    const c = cleanup.pop();
    try { c(); } catch (e) { /* already gone */ }
  }
});

function makeView(opts = {}) {
  const s = stage(THREE);
  let draws = 0;
  const render = s.renderer.render.bind(s.renderer);
  s.renderer.render = (...a) => { draws++; return render(...a); };
  const name = uniq('v');
  const view = wf.three.view(name, Object.assign({ renderer: s.renderer, scene: s.scene, camera: s.camera }, opts));
  cleanup.push(() => s.remove());
  cleanup.push(() => { if (wf.getStore(name)) wf.unregister(name); });
  return { s, name, view, draws: () => draws };
}

describe(`draw(), views(), canvas() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the draw option replaces renderer.render for every drawn frame, with the renderer, scene and camera', async () => {
    const calls = [];
    const { s, view, draws } = makeView({ draw: (renderer, scene, camera) => calls.push([renderer, scene, camera]) });
    await frames(3);
    expect(draws()).toBe(0);                 // the view's own render call is not made
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toEqual([s.renderer, s.scene, s.camera]);
    const n = calls.length;
    view.draw();
    expect(calls.length).toBe(n + 1);
    expect(() => wf.three.view(uniq('v'), { renderer: s.renderer, scene: s.scene, camera: s.camera, draw: 'composer' })).toThrow(/3D-102/);
  });

  it('draw() while the view is drawing does nothing, and a development build warns 3D-115 once', async () => {
    // Each inner call is capped at 5, so without the guard the test fails on
    // the count instead of overflowing the stack. The caps start spent, so
    // the frame loop's own frames call nothing until the test says so.
    let view, calls = 0, inner = 5;
    ({ view } = makeView({ render: 'change', draw: () => { calls++; if (inner < 5) { inner++; view.draw(); } } }));
    let before = 5;
    const s2 = makeView({ before: () => { if (before < 5) { before++; s2.view.draw(); } } });
    await frames(2);
    const lines = await captureWarnings(async () => {
      calls = 0; inner = 0;
      expect(() => view.draw()).not.toThrow();
      expect(calls).toBe(1);                 // the inner draw() drew nothing
      view.draw();
      expect(calls).toBe(2);
      before = 0;
      expect(() => s2.view.draw()).not.toThrow();
      expect(before).toBe(1);                // a draw() from before() did nothing either
    });
    const warned = lines.filter((l) => l.startsWith('[3D-115] '));
    expect(warned.length).toBe(BUILD === 'dev' ? 2 : 0);   // once per view
  });

  it("draw() draws now under render: 'change' with nothing changed, and again on the next call", async () => {
    const { view, draws } = makeView({ render: 'change' });
    await frames(3);
    const before = draws();
    await frames(2);
    expect(draws()).toBe(before);          // still: the loop draws nothing
    view.draw();
    expect(draws()).toBe(before + 1);
    view.draw();
    expect(draws()).toBe(before + 2);
  });

  it('draw() ignores the maxFps gate, and the loop resumes its own pacing after', async () => {
    const { view, draws } = makeView({ maxFps: 1 });
    await frames(2);
    const before = draws();
    view.draw(); view.draw(); view.draw();
    expect(draws()).toBe(before + 3);
    await frames(3);
    expect(draws()).toBe(before + 3);      // under 1 fps, nothing more within a few frames
  });

  it('views() lists the live views as their stores, and canvas() is the renderer canvas', () => {
    const a = makeView(), b = makeView();
    const list = wf.three.views();
    expect(list).toContain(a.view);
    expect(list).toContain(b.view);
    expect(a.view.canvas()).toBe(a.s.renderer.domElement);
    wf.unregister(b.name);
    expect(wf.three.views()).toContain(a.view);
    expect(wf.three.views()).not.toContain(b.view);
  });
});
