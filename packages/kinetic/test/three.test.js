/**
 * Trillium views inside a scene are drawn once per seek, before the
 * barrier resolves, through view.draw(); a view outside every scene is
 * left to the frame loop; a context without preserveDrawingBuffer is
 * KN-190 in development; a computed that projects through a camera aimed
 * in seek(local) reads the frame's camera. Needs Trillium's build and the
 * pinned three.js:
 *   node scripts/build-rollup.cjs three.wf
 *   node scripts/fetch-three.cjs
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, loadScript, mount, dispatchSeek, captureWarnings, uniqueName, BUILD, CORE_TIER } from './helpers.js';

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

// A canvas with a renderer, a scene with one box, and a count of draws.
function stage(preserve) {
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 48;
  const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: !!preserve });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 64 / 48, 0.1, 100);
  camera.position.z = 5;
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  scene.add(box);
  let draws = 0;
  const render = renderer.render.bind(renderer);
  renderer.render = (...a) => { draws++; return render(...a); };
  return { canvas, renderer, scene, camera, box, draws: () => draws, dispose() { renderer.dispose(); } };
}

describe(`Trillium views in scenes (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // First in the file: KN-170 warns once per page.
  it("a slow draw counts toward its seek's time: KN-170 with the shader hint (dev)", async ({ skip }) => {
    if (!available || BUILD !== 'dev') skip();
    const s = stage(true);
    cleanup.push(() => s.dispose());
    const render = s.renderer.render;
    s.renderer.render = (...a) => { const until = performance.now() + 12; while (performance.now() < until) { /* a slow draw */ } return render(...a); };
    const name = uniqueName('scene');
    const viewName = uniqueName('view');
    wf.kinetic.scene(name, {
      init() {
        this.element.appendChild(s.canvas);
        wf.three.view(viewName, { renderer: s.renderer, scene: s.scene, camera: s.camera, render: 'change' });
      },
    });
    let host;
    const lines = await captureWarnings(async () => {
      host = await mount(`<div data-composition-id="t0" data-start="0" data-duration="4"><div data-component="${name}"></div></div>`);
      // KN-170 needs 3 slow seeks in the last 30.
      await dispatchSeek(1).done;
      await dispatchSeek(2).done;
      await dispatchSeek(3).done;
    });
    cleanup.push(() => host.remove());
    cleanup.push(() => { if (wf.getStore(viewName)) wf.unregister(viewName); });
    expect(lines.filter((l) => l.startsWith('[KN-170]')).length, lines.join('\n')).toBe(1);
    expect(lines.join('\n')).toMatch(/renderer\.compile/);
  });

  it('a view inside a scene is drawn once per seek, before the barrier, with the seek hook applied', async ({ skip }) => {
    if (!available) skip();
    const s = stage(true);
    cleanup.push(() => s.dispose());
    const name = uniqueName('scene');
    const viewName = uniqueName('view');
    wf.kinetic.scene(name, {
      init() {
        this.element.appendChild(s.canvas);
        this.view = wf.three.view(viewName, { renderer: s.renderer, scene: s.scene, camera: s.camera, render: 'change' });
      },
      seek(local) { s.box.rotation.y = local; },
    });
    const host = await mount(`<div data-composition-id="t1" data-start="0" data-duration="4"><div data-component="${name}" data-start="1"></div></div>`);
    cleanup.push(() => host.remove());
    cleanup.push(() => { if (wf.getStore(viewName)) wf.unregister(viewName); });
    expect(wf.three.views().map((v) => v === wf.getStore(viewName))).toContain(true);
    expect(wf.getStore(viewName).canvas()).toBe(s.canvas);
    const before = s.draws();
    let drawsAtBarrier = -1;
    const { done } = dispatchSeek(2.5);
    await done;
    drawsAtBarrier = s.draws();
    expect(drawsAtBarrier).toBe(before + 1);
    expect(s.box.rotation.y).toBe(1.5);
    await dispatchSeek(1.25).done;
    expect(s.draws()).toBe(before + 2);
    expect(s.box.rotation.y).toBe(0.25);
  });

  it('a view inside a hidden clip is not drawn while the clip is hidden, and is drawn on the first seek that shows it; check() draws it on every seek', async ({ skip }) => {
    if (!available) skip();
    const s = stage(true);
    cleanup.push(() => s.dispose());
    const name = uniqueName('scene');
    const viewName = uniqueName('view');
    wf.kinetic.scene(name, {
      init() {
        this.element.appendChild(s.canvas);
        wf.three.view(viewName, { renderer: s.renderer, scene: s.scene, camera: s.camera, render: 'change' });
      },
      seek(local) { s.box.rotation.y = local; },
    });
    const host = await mount(`<div data-composition-id="t1h" data-start="0" data-duration="6"><div data-component="${name}" data-start="2" data-duration="2"></div></div>`);
    cleanup.push(() => host.remove());
    cleanup.push(() => { if (wf.getStore(viewName)) wf.unregister(viewName); });
    wf.kinetic.config({});
    await dispatchSeek(0.5).done;
    const before = s.draws();
    // Before the clip: hidden, never drawn.
    for (const t of [0.6, 1, 1.5]) await dispatchSeek(t).done;
    expect(s.draws()).toBe(before);
    // Inside it: drawn on each seek, the first one included.
    await dispatchSeek(2).done;
    expect([s.draws(), s.box.rotation.y]).toEqual([before + 1, 0]);
    await dispatchSeek(3).done;
    expect([s.draws(), s.box.rotation.y]).toEqual([before + 2, 1]);
    // After it: hidden again.
    for (const t of [4, 4.5, 5]) await dispatchSeek(t).done;
    expect(s.draws()).toBe(before + 2);
    // check() draws every view, hidden or not, on each of its seeks.
    const r = await wf.kinetic.check({ samples: 6 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(s.draws()).toBeGreaterThanOrEqual(before + 2 + 12);
  });

  it('a view outside every scene is left to the frame loop', async ({ skip }) => {
    if (!available) skip();
    const s = stage(true);
    cleanup.push(() => s.dispose());
    const viewName = uniqueName('view');
    const holder = document.createElement('div');
    holder.appendChild(s.canvas);
    document.body.appendChild(holder);
    cleanup.push(() => holder.remove());
    wf.three.view(viewName, { renderer: s.renderer, scene: s.scene, camera: s.camera, render: 'change' });
    cleanup.push(() => { if (wf.getStore(viewName)) wf.unregister(viewName); });
    const before = s.draws();
    await dispatchSeek(1).done;
    expect(s.draws()).toBe(before);
  });

  it("seek(local) runs before the frame's bindings are written, so a computed projects through a camera aimed there", async ({ skip }) => {
    if (!available) skip();
    const s = stage(true);
    cleanup.push(() => s.dispose());
    const name = uniqueName('scene');
    const viewName = uniqueName('view');
    let view = null;
    wf.kinetic.scene(name, {
      // Set once the view exists, so the label runs again then, though the
      // clock may not move (it was left at 1 by the tests before).
      state: { viewReady: false },
      init() {
        this.element.appendChild(s.canvas);
        view = wf.three.view(viewName, { renderer: s.renderer, scene: s.scene, camera: s.camera, render: 'change' });
        this.viewReady = true;
      },
      // Aimed from the clip's time, with no updateMatrixWorld() of its own.
      seek(local) { s.camera.position.set(local * 2, 0, 5); s.camera.lookAt(0, 0, 0); },
      computed: { label() { const p = this.viewReady && this.local >= 0 && view.projectPoint(1, 0, 0); return p ? String(p.x) : ''; } },
    });
    const host = await mount(`<div data-composition-id="t4" data-start="0" data-duration="4" data-fps="10"><div data-component="${name}"><b data-bind="label"></b></div></div>`);
    cleanup.push(() => host.remove());
    cleanup.push(() => { if (wf.getStore(viewName)) wf.unregister(viewName); });
    for (const t of [1, 3, 2]) {
      await dispatchSeek(t).done;
      const ref = s.camera.clone();
      ref.updateMatrixWorld(true);
      const want = (new THREE.Vector3(1, 0, 0).project(ref).x + 1) / 2 * s.canvas.clientWidth;
      expect(Number(host.querySelector('b').textContent), 'at ' + t).toBeCloseTo(want, 6);
    }
    const r = await wf.kinetic.check({ samples: 40 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("with the view's camera aimed in before(), a computed that passes projectPoint() a camera aimed from the scene's time matches the drawn frame", async ({ skip }) => {
    if (!available) skip();
    const s = stage(true);
    cleanup.push(() => s.dispose());
    const aim = (cam, local) => { cam.position.set(local * 2, 0, 5); cam.lookAt(0, 0, 0); };
    const probe = s.camera.clone();
    const name = uniqueName('scene');
    const viewName = uniqueName('view');
    let view = null, clip = 0;
    wf.kinetic.scene(name, {
      state: { viewReady: false },
      init() {
        this.element.appendChild(s.canvas);
        view = wf.three.view(viewName, { renderer: s.renderer, scene: s.scene, camera: s.camera, render: 'change', before: () => aim(s.camera, clip) });
        this.viewReady = true;
      },
      seek(local) { clip = local; },
      computed: {
        label() {
          if (!this.viewReady) return '';
          aim(probe, this.local);
          const p = view.projectPoint(1, 0, 0, probe);
          return p ? String(p.x) : '';
        },
      },
    });
    const host = await mount(`<div data-composition-id="t5" data-start="0" data-duration="4" data-fps="10"><div data-component="${name}"><b data-bind="label"></b></div></div>`);
    cleanup.push(() => host.remove());
    cleanup.push(() => { if (wf.getStore(viewName)) wf.unregister(viewName); });
    for (const t of [1, 3, 2]) {
      await dispatchSeek(t).done;
      // The view's camera as the frame was drawn.
      const ref = s.camera.clone();
      ref.updateMatrixWorld(true);
      const want = (new THREE.Vector3(1, 0, 0).project(ref).x + 1) / 2 * s.canvas.clientWidth;
      expect(Number(host.querySelector('b').textContent), 'at ' + t).toBeCloseTo(want, 6);
    }
    const r = await wf.kinetic.check({ samples: 40 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("a view that throws while drawing does not stop a later view's draw; the seek rejects with its error", async ({ skip }) => {
    if (!available) skip();
    const a = stage(true), b = stage(true);
    cleanup.push(() => { a.dispose(); b.dispose(); });
    const na = uniqueName('scene'), nb = uniqueName('scene');
    const va = uniqueName('view'), vb = uniqueName('view');
    let throwing = false;
    const boom = new Error('view a before threw');
    wf.kinetic.scene(na, {
      init() {
        this.element.appendChild(a.canvas);
        wf.three.view(va, { renderer: a.renderer, scene: a.scene, camera: a.camera, render: 'change', before() { if (throwing) throw boom; } });
      },
    });
    wf.kinetic.scene(nb, {
      init() {
        this.element.appendChild(b.canvas);
        wf.three.view(vb, { renderer: b.renderer, scene: b.scene, camera: b.camera, render: 'change' });
      },
    });
    const host = await mount(`<div data-composition-id="t5" data-start="0" data-duration="4"><div data-component="${na}"></div><div data-component="${nb}"></div></div>`);
    cleanup.push(() => host.remove());
    cleanup.push(() => { for (const n of [va, vb]) if (wf.getStore(n)) wf.unregister(n); });
    await dispatchSeek(1).done;
    const before = b.draws();
    throwing = true;
    const origError = console.error;
    console.error = () => {};   // Trillium's own loop prints the view's error once
    let rejected = null;
    try {
      await dispatchSeek(2).done.catch((e) => { rejected = e; });
    } finally { throwing = false; console.error = origError; }
    expect(b.draws()).toBe(before + 1);
    expect(rejected).toBe(boom);
  });

  if (BUILD === 'dev') {
    it('KN-190 once for a context without preserveDrawingBuffer, nothing for one with it (dev)', async ({ skip }) => {
      if (!available) skip();
      const a = stage(false), b = stage(true);
      cleanup.push(() => { a.dispose(); b.dispose(); });
      const name = uniqueName('scene');
      const va = uniqueName('view'), vb = uniqueName('view');
      wf.kinetic.scene(name, {
        init() {
          this.element.appendChild(a.canvas);
          this.element.appendChild(b.canvas);
          wf.three.view(va, { renderer: a.renderer, scene: a.scene, camera: a.camera });
          wf.three.view(vb, { renderer: b.renderer, scene: b.scene, camera: b.camera });
        },
      });
      let host;
      const lines = await captureWarnings(async () => {
        host = await mount(`<div data-composition-id="t3" data-start="0" data-duration="4"><div data-component="${name}"></div></div>`);
        await dispatchSeek(1).done;
        await dispatchSeek(2).done;
      });
      cleanup.push(() => host.remove());
      cleanup.push(() => { for (const n of [va, vb]) if (wf.getStore(n)) wf.unregister(n); });
      const kn190 = lines.filter((l) => l.startsWith('[KN-190]'));
      expect(kn190.length).toBe(1);
      expect(kn190[0]).toMatch(new RegExp("scene '" + name + "'"));
    });
  }
});
