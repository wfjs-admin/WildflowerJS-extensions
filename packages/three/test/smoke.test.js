/**
 * The pieces load and draw: the framework, the built extension, three.js,
 * and a WebGL renderer in the test browser.
 */
import { describe, it, expect } from 'vitest';
import { load, stage, planes, frames, uniq, BUILD, CORE_TIER } from './helpers.js';

describe(`smoke (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('installs wildflower.three and the wf-three loop store, and draws a view', async () => {
    const { wf, THREE } = await load();
    expect(typeof wf.three.view).toBe('function');
    expect(wf.getStore('wf-three')).toBeTruthy();
    const s = stage(THREE);
    const mesh = planes(THREE, s.scene);
    const name = uniq('smoke');
    const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera });
    const items = [{ id: 1, x: 0, y: 0, z: 0 }, { id: 2, x: 1, y: 0, z: 0 }];
    view.instanced(() => items, mesh, { position: ['x', 'y', 'z'] });
    let renders = 0;
    const orig = s.renderer.render.bind(s.renderer);
    s.renderer.render = (a, b) => { renders++; return orig(a, b); };
    await frames(4);
    expect(renders).toBeGreaterThan(0);
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.array[16 + 12]).toBe(1);
    wf.unregister(name);
    s.remove();
  });
});
