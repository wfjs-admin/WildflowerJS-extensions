/**
 * Footage on a texture in a Trillium view: a <video> clip in the composition
 * drawn by a three.js VideoTexture, registered with view.video(), on a plane
 * that fills the view. Kinetic draws the view once the seek's footage has
 * landed, so after each seek the canvas shows the footage frame of that seek,
 * as an effect() with a <video> source does, and check() passes. Needs
 * Trillium's build and the pinned three.js:
 *   node scripts/build-rollup.cjs three.wf
 *   node scripts/fetch-three.cjs
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, loadScript, mount, dispatchSeek, uniqueName, FOOTAGE, shownFrame, footageFrame, BUILD, CORE_TIER } from './helpers.js';

const THREE_WF = BUILD === 'min' ? '/packages/three/dist/three.wf.min.js' : '/packages/three/dist/three.wf.js';

let wf, THREE, available = true;
const cleanup = [];

beforeAll(async () => {
  ({ wf } = await load());
  if (wf.features && wf.features.pools === false) { available = false; return; }   // Trillium needs the frame loop
  try {
    await loadScript(THREE_WF);
    THREE = await import(/* @vite-ignore */ '/tools/three/build/three.module.js');
    wf.three.use(THREE);
  } catch (_) { available = false; }
}, 20000);

afterEach(async () => {
  wf.kinetic.pause();
  while (cleanup.length) { try { cleanup.pop()(); } catch (_) { /* gone */ } }
});

describe(`footage on a texture in a Trillium view (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the view shows the footage frame of each seek', async ({ skip }) => {
    if (!available) skip();
    const name = uniqueName('scene');
    const viewName = uniqueName('view');
    let renderer = null;
    wf.kinetic.scene(name, {
      init() {
        const canvas = this.element.querySelector('canvas');
        renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
        renderer.setSize(160, 90, false);
        const world = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const texture = new THREE.VideoTexture(this.element.querySelector('video'));
        world.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: texture })));
        wf.three.view(viewName, { renderer, scene: world, camera, render: 'change' }).video(texture);
      },
    });
    const host = await mount(`<div data-composition-id="tf1" data-start="0" data-duration="3" data-fps="30" data-width="160" data-height="90" style="position:relative;width:160px;height:90px">
      <div data-component="${name}" style="position:absolute;inset:0">
        <canvas style="position:absolute;left:0;top:0;width:160px;height:90px"></canvas>
        <video src="${FOOTAGE}f30.webm" data-start="0" muted playsinline style="position:absolute;left:0;top:0;width:16px;height:9px;opacity:0.01"></video>
      </div>
    </div>`);
    cleanup.push(() => host.remove());
    cleanup.push(() => { if (wf.getStore(viewName)) wf.unregister(viewName); });
    cleanup.push(() => renderer && renderer.dispose());
    await wf.kinetic.ready();
    const canvas = host.querySelector('canvas');
    const got = [], want = [];
    for (const t of [0.5, 2, 1 / 30, 1.2, 0.5]) {
      await dispatchSeek(t).done;
      got.push(shownFrame(canvas));
      want.push(footageFrame(t));
    }
    expect(got).toEqual(want);
    const r = await wf.kinetic.check({ samples: 20 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
});
