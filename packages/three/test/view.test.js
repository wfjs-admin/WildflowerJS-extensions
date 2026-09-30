/**
 * The view as a store, against the built file with a real three.js and WebGL:
 * registration and diagnostics, bindings (pool, array, buffer), picking and
 * its tie rule, the occluder, hovered (lazy) and selected, sizing and inset,
 * follow(), stats, and teardown with disposal.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, stage, planes, frames, tick, uniq, captureWarnings, clientAt, pointer, BUILD, CORE_TIER, WF_FILE } from './helpers.js';

let wf, THREE;
const cleanup = [];

beforeAll(async () => { ({ wf, THREE } = await load()); });
afterEach(() => {
  while (cleanup.length) {
    const c = cleanup.pop();
    try { c(); } catch (e) { /* already gone */ }
  }
});

// A stage and a view on it, both removed after the test.
function makeView(opts = {}, size) {
  const s = stage(THREE, size && size[0], size && size[1]);
  const name = uniq('v');
  const view = wf.three.view(name, Object.assign({ renderer: s.renderer, scene: s.scene, camera: s.camera }, opts));
  cleanup.push(() => s.remove());
  cleanup.push(() => { if (wf.getStore(name)) wf.unregister(name); });
  return { s, name, view };
}

const pos = ['x', 'y', 'z'];

describe(`the view as a store (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('view(name) registers a store by that name with the documented state', () => {
    const { name, view } = makeView();
    expect(wf.getStore(name)).toBe(view);
    expect(view.pointer).toBeNull();
    expect(view.selected).toBeNull();
    expect(view.hovered).toBeNull();
    expect(view.size).toEqual({ width: 400, height: 300 });
    expect(view.stats).toEqual({ syncMs: 0, renderMs: 0, fps: 0 });
  });

  it('3D-108: the name of an existing view returns that view (options ignored), with a development note', async () => {
    const { s, name, view } = makeView();
    let again;
    const lines = await captureWarnings(() => { again = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera }); });
    expect(again).toBe(view);
    expect(lines.some((l) => l.includes('3D-108'))).toBe(BUILD === 'dev');   // the note is development-only
  });

  it('3D-103: the name of a store that is not a view throws, and leaves that store alone', () => {
    const name = uniq('taken');
    wf.store(name, { state: { boids: 3 } });
    cleanup.push(() => wf.unregister(name));
    const s = stage(THREE);
    cleanup.push(() => s.remove());
    expect(() => wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera })).toThrow(/3D-103/);
    expect(wf.getStore(name).boids).toBe(3);
  });

  it('3D-101 before use(THREE), 3D-102 without a name or the three objects', () => {
    wf.three.use(null);
    try {
      expect(() => wf.three.view('x', {})).toThrow(/3D-101/);
    } finally { wf.three.use(THREE); }
    expect(() => wf.three.view('', {})).toThrow(/3D-102/);
    expect(() => wf.three.view(uniq('bad'), { scene: new THREE.Scene() })).toThrow(/3D-102/);
  });

  it('3D-104 / 3D-105: bad instanced() and buffer() arguments throw with their code', () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    expect(() => view.instanced(42, mesh, { position: pos })).toThrow(/3D-104/);
    expect(() => view.instanced(() => [], new THREE.Mesh(), { position: pos })).toThrow(/3D-104/);
    expect(() => view.instanced(() => [], mesh, {})).toThrow(/3D-104/);
    expect(() => view.buffer([], mesh, { stride: 3, position: [0, 1, 2], count: () => 0 })).toThrow(/3D-105/);
    expect(() => view.buffer(() => null, mesh, { position: [0, 1, 2] })).toThrow(/3D-105/);
  });
});

describe('bindings', () => {
  it('an array source writes position, scale and colour, and skips an unchanged array unless live', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const items = [{ id: 1, x: 0.5, y: 0.25, z: 0, s: 2, c: 0xff0000 }];
    let calls = 0;
    view.instanced(() => { calls++; return items; }, mesh, { position: pos, scale: 's', color: 'c' });
    await frames(3);
    const m = mesh.instanceMatrix.array, c = mesh.instanceColor.array;
    expect([m[0], m[12], m[13]]).toEqual([2, 0.5, 0.25]);
    expect(c[0]).toBeCloseTo(1, 5);
    expect(c[1]).toBeCloseTo(0, 5);
    items[0].x = 3;                       // same array, mutated in place: not re-read
    await frames(3);
    expect(m[12]).toBe(0.5);
    expect(calls).toBeGreaterThan(1);
  });

  it('live: true re-reads an array mutated in place', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const items = [{ id: 1, x: 0, y: 0, z: 0 }];
    view.instanced(() => items, mesh, { position: pos, live: true });
    await frames(2);
    items[0].x = 1.5;
    await frames(3);
    expect(mesh.instanceMatrix.array[12]).toBe(1.5);
  });

  it('custom attributes are written per instance', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const items = [{ id: 1, x: 0, y: 0, z: 0, heat: 7 }, { id: 2, x: 1, y: 0, z: 0, heat: 9 }];
    view.instanced(() => items, mesh, { position: pos, attributes: { heat: 'heat' } });
    await frames(3);
    expect(Array.from(mesh.geometry.getAttribute('heat').array.slice(0, 2))).toEqual([7, 9]);
  });

  it('3D-106: more entities than the mesh holds warns once and draws what fits', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene, 2);
    const items = [0, 1, 2, 3].map((i) => ({ id: i, x: i, y: 0, z: 0 }));
    const lines = await captureWarnings(async () => {
      view.instanced(() => items.slice(), mesh, { position: pos, live: true });
      await frames(4);
    });
    expect(mesh.count).toBe(2);
    expect(lines.filter((l) => l.includes('3D-106')).length).toBe(BUILD === 'dev' ? 1 : 0);
  });

  it('a store pool binds as the mesh', async () => {
    const poolStore = uniq('ps');
    wf.store(poolStore, { pools: { dots: {} }, state: {} });
    cleanup.push(() => wf.unregister(poolStore));
    const pool = wf.getStore(poolStore).pools && wf.getStore(poolStore).pools.dots;
    if (!pool) return;                    // a tier without pools
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(pool, mesh, { position: pos });
    pool.push({ id: 1, x: 0.75, y: 0, z: 0 });
    pool.push({ id: 2, x: -0.75, y: 0, z: 0 });
    await frames(3);
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.array[12]).toBe(0.75);
  });

  // A pool emptied and refilled with the same number of entities (a new
  // molecule with the same atom count) changes no count. The new entities
  // sit outside the old bounding sphere, so a sphere kept from before the
  // refill would make the pick miss them.
  it('a pool refilled with the same count picks the new entities, not the old ones', async () => {
    const poolStore = uniq('ps');
    wf.store(poolStore, { pools: { dots: {} }, state: {} });
    cleanup.push(() => wf.unregister(poolStore));
    const pool = wf.getStore(poolStore).pools && wf.getStore(poolStore).pools.dots;
    if (!pool) return;                    // a tier without pools
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(pool, mesh, { position: pos });
    pool.push({ id: 1, x: 0.75, y: 0, z: 0 });
    pool.push({ id: 2, x: -0.75, y: 0, z: 0 });
    await frames(3);
    const oldSpot = clientAt(view, s.canvas, 0.75, 0, 0);
    expect(view.pick(new PointerEvent('pointermove', oldSpot)).entity.id).toBe(1);

    pool.clear();
    pool.push({ id: 3, x: 0, y: 1.5, z: 0 });
    pool.push({ id: 4, x: 0, y: -1.5, z: 0 });
    await frames(3);
    expect(mesh.count).toBe(2);
    const hit = view.pick(new PointerEvent('pointermove', clientAt(view, s.canvas, 0, 1.5, 0)));
    expect(hit && hit.entity.id).toBe(3);
    expect(view.pick(new PointerEvent('pointermove', oldSpot))).toBe(null);
  });

  // sync: 'change': a pool that sits
  // still is neither written nor uploaded. three.js raises an attribute's
  // `version` each time needsUpdate is set, which is what triggers the upload,
  // so a version that stays put means no upload.
  describe("sync: 'change'", () => {
    function poolView(spec) {
      const poolStore = uniq('ps');
      wf.store(poolStore, { pools: { dots: {} }, state: {} });
      cleanup.push(() => wf.unregister(poolStore));
      const pool = wf.getStore(poolStore).pools && wf.getStore(poolStore).pools.dots;
      if (!pool) return null;               // a tier without pools
      const { s, view } = makeView();
      const mesh = planes(THREE, s.scene);
      mesh.material.color.set(0xffffff);
      const binding = view.instanced(pool, mesh, Object.assign({ position: pos }, spec));
      pool.push({ id: 1, x: 0.5, y: 0, z: 0, c: 0xff0000 }, { id: 2, x: -0.5, y: 0, z: 0, c: 0x00ff00 });
      return { pool, mesh, binding, s, view };
    }

    it("'frame' (the default) uploads every frame, even when nothing changed", async () => {
      const t = poolView({});
      if (!t) return;
      await frames(3);
      const v = t.mesh.instanceMatrix.version;
      await frames(3);
      expect(t.mesh.instanceMatrix.version).toBeGreaterThan(v);
    });

    it("'change' neither writes nor uploads while the pool's version stays put", async () => {
      const t = poolView({ sync: 'change' });
      if (!t) return;
      await frames(3);
      expect(t.mesh.count).toBe(2);
      expect(t.mesh.instanceMatrix.array[12]).toBe(0.5);
      const v = t.mesh.instanceMatrix.version;
      await frames(4);
      expect(t.mesh.instanceMatrix.version).toBe(v);
    });

    it("'change' redraws after markDirty() and after update()", async () => {
      const t = poolView({ sync: 'change' });
      if (!t) return;
      await frames(3);
      t.pool.get(1).x = 1.25;
      t.pool.markDirty(1);
      await frames(2);
      expect(t.mesh.instanceMatrix.array[12]).toBe(1.25);
      t.pool.update(2, { y: 0.75 });
      await frames(2);
      expect(t.mesh.instanceMatrix.array[16 + 13]).toBe(0.75);
    });

    it("'change' picks up a refill with the same number of entities", async () => {
      const t = poolView({ sync: 'change' });
      if (!t) return;
      await frames(3);
      t.pool.clear();
      t.pool.push({ id: 3, x: 0, y: 1, z: 0 }, { id: 4, x: 0, y: -1, z: 0 });
      await frames(2);
      expect(t.mesh.count).toBe(2);
      expect(t.mesh.instanceMatrix.array[13]).toBe(1);
      expect(t.binding.entities[0].id).toBe(3);
    });

    it("3D-111: a position changed in place without markDirty() warns once (development)", async () => {
      const t = poolView({ sync: 'change' });
      if (!t) return;
      await frames(3);
      const lines = await captureWarnings(async () => {
        t.pool.get(2).x = 2;                 // not reported
        await tick(1150);
        await frames(2);
        await tick(1150);
        await frames(2);
      });
      const hits = lines.filter((l) => l.includes('3D-111'));
      expect(hits.length).toBe(BUILD === 'dev' ? 1 : 0);
      if (BUILD === 'dev') expect(hits[0]).toContain('the position');
      expect(t.mesh.instanceMatrix.array[16 + 12]).toBe(-0.5);   // not drawn, as documented
    });

    it('3D-111 also covers the colour, not only the position', async () => {
      const t = poolView({ sync: 'change', color: 'c' });
      if (!t) return;
      await frames(3);
      const lines = await captureWarnings(async () => {
        t.pool.get(1).c = 0x0000ff;          // not reported
        await tick(1150);
        await frames(2);
      });
      const hits = lines.filter((l) => l.includes('3D-111'));
      expect(hits.length).toBe(BUILD === 'dev' ? 1 : 0);
      if (BUILD === 'dev') expect(hits[0]).toContain('the color');
    });

    it('3D-111 stays quiet when every change was reported', async () => {
      const t = poolView({ sync: 'change', color: 'c' });
      if (!t) return;
      await frames(3);
      const lines = await captureWarnings(async () => {
        t.pool.update(1, { x: 0.9, c: 0x0000ff });
        await tick(1150);
        await frames(2);
      });
      expect(lines.filter((l) => l.includes('3D-111'))).toEqual([]);
    });

    it("an unknown sync value throws 3D-104", () => {
      const { s, view } = makeView();
      const mesh = planes(THREE, s.scene);
      expect(() => view.instanced(() => [], mesh, { position: pos, sync: 'static' })).toThrow(/3D-104/);
    });
  });

  it('a buffer binding writes records, colours once per slot, and recolor() rewrites them', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    let arr = new Float32Array([2, 0.5, 0, 0, -0.5, 0, 0]);   // [count, x, y, z, ...]
    let colour = 0xff0000;
    const b = view.buffer(() => arr, mesh, { stride: 3, offset: 1, count: (a) => a[0], position: [0, 1, 2], color: () => colour });
    await frames(3);
    expect(mesh.count).toBe(2);
    expect(mesh.instanceMatrix.array[12]).toBe(0.5);
    expect(mesh.instanceColor.array[0]).toBeCloseTo(1, 5);
    colour = 0x0000ff;
    await frames(2);
    expect(mesh.instanceColor.array[0]).toBeCloseTo(1, 5);   // not rewritten
    b.recolor();
    await frames(2);
    expect(mesh.instanceColor.array[2]).toBeCloseTo(1, 5);
    arr = null;
    await frames(2);
    expect(mesh.count).toBe(0);
  });
});

describe('picking', () => {
  it('pick() returns the entity under the pointer, with its binding name and every hit', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const items = [{ id: 'a', x: -1, y: 0, z: 0 }, { id: 'b', x: 1, y: 0, z: 0 }];
    view.instanced(() => items, mesh, { name: 'dots', position: pos });
    await frames(3);
    const hit = view.pick(clientAt(view, s.canvas, 1, 0, 0));
    expect(hit.entity.id).toBe('b');
    expect(hit.name).toBe('dots');
    expect(hit.hits.length).toBe(1);
    expect(view.pick(clientAt(view, s.canvas, 0, 1.2, 0))).toBeNull();
  });

  it('at the same distance, the mesh drawn later (renderOrder) wins, whatever the binding order', async () => {
    const { s, view } = makeView();
    const top = planes(THREE, s.scene), under = planes(THREE, s.scene);
    top.renderOrder = 2;
    view.instanced(() => [{ id: 'top', x: 0, y: 0, z: 0 }], top, { name: 'top', position: pos });
    view.instanced(() => [{ id: 'under', x: 0, y: 0, z: 0 }], under, { name: 'under', position: pos });
    await frames(3);
    const hit = view.pick(clientAt(view, s.canvas, 0, 0, 0));
    expect(hit.entity.id).toBe('top');
    expect(hit.hits.map((h) => h.entity.id)).toEqual(['top', 'under']);
  });

  it('markers that write no depth are picked by draw order, even when the top one is farther away', async () => {
    const { s, view } = makeView();
    const marker = () => {
      const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), 4);
      s.scene.add(m);
      return m;
    };
    const top = marker(), near = marker();
    top.renderOrder = 2;
    view.instanced(() => [{ id: 'near', x: 0, y: 0, z: 0.01 }], near, { position: pos });
    view.instanced(() => [{ id: 'top', x: 0, y: 0, z: 0 }], top, { position: pos });
    await frames(3);
    expect(view.pick(clientAt(view, s.canvas, 0, 0, 0)).entity.id).toBe('top');
    // An opaque (depth-writing) mesh in front still wins by distance.
    const solid = planes(THREE, s.scene);
    view.instanced(() => [{ id: 'solid', x: 0, y: 0, z: 0.5 }], solid, { position: pos });
    await frames(3);
    expect(view.pick(clientAt(view, s.canvas, 0, 0, 0)).entity.id).toBe('solid');
  });

  it('the occluder hides what is behind it; pickable: false and hidden meshes are skipped', async () => {
    const { s, view } = makeView({ occluder: { x: 0, y: 0, z: 0, radius: 1 } });
    const behind = planes(THREE, s.scene), off = planes(THREE, s.scene), gone = planes(THREE, s.scene);
    view.instanced(() => [{ id: 'behind', x: 0, y: 0, z: -2 }], behind, { position: pos });
    view.instanced(() => [{ id: 'off', x: 1.8, y: 0, z: 0 }], off, { position: pos, pickable: false });
    view.instanced(() => [{ id: 'gone', x: -1.8, y: 0, z: 0 }], gone, { position: pos });
    gone.visible = false;
    await frames(3);
    expect(view.pick(clientAt(view, s.canvas, 0, 0, -2))).toBeNull();
    expect(view.occluded(0, 0, -2)).toBe(true);
    expect(view.occluded(0, 0, 2)).toBe(false);
    expect(view.pick(clientAt(view, s.canvas, 1.8, 0, 0))).toBeNull();
    expect(view.pick(clientAt(view, s.canvas, -1.8, 0, 0))).toBeNull();
  });

  // A cube at the origin, camera at z = 5. P is behind the cube (the line to
  // it crosses the front face); Q is past the cube's edge, in plain view.
  const P = [0.95, 0.95, -3], Q = [1.5, 0, 0];

  it('occluder: a three.js Sphere or Box3 is tested exactly', () => {
    const box = makeView({ occluder: new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)) }).view;
    expect(box.occluded(...P)).toBe(true);
    expect(box.occluded(...Q)).toBe(false);
    expect(box.occluded(0, 0, 1.01)).toBe(false);          // on the near face
    const sphere = makeView({ occluder: new THREE.Sphere(new THREE.Vector3(), 1) }).view;
    expect(sphere.occluded(0, 0, -2)).toBe(true);
    expect(sphere.occluded(0, 0, 2)).toBe(false);
  });

  it('occluder: a function decides', () => {
    const seen = [];
    const { view } = makeView({ occluder: (x, y, z) => { seen.push([x, y, z]); return x > 1; } });
    expect(view.occluded(2, 0, 0)).toBe(true);
    expect(view.occluded(0, 0, 0)).toBe(false);
    expect(seen).toEqual([[2, 0, 0], [0, 0, 0]]);
  });

  it('occluder: meshes are raycast for their real shape; bound and hidden meshes never occlude', async () => {
    const s = stage(THREE);
    cleanup.push(() => s.remove());
    const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.1), new THREE.MeshBasicMaterial());
    ghost.position.set(0, 0, 3);
    ghost.visible = false;
    s.scene.add(cube, ghost);
    const name = uniq('mesh-occ');
    const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera, occluder: [cube, ghost] });
    cleanup.push(() => wf.unregister(name));
    const front = planes(THREE, s.scene), back = planes(THREE, s.scene);
    front.position.set(0, 0, 2);          // a bound mesh between the camera and the cube
    view.instanced(() => [{ id: 'front', x: 0, y: 0, z: 0 }], front, { position: pos });
    view.instanced(() => [{ id: 'back', x: P[0], y: P[1], z: P[2] }], back, { position: pos });
    await frames(3);
    s.scene.updateMatrixWorld();
    expect(view.occluded(...P)).toBe(true);
    expect(view.occluded(...Q)).toBe(false);
    expect(view.occluded(0, 0, 1.5)).toBe(false);           // the bound plane in front does not count
    expect(view.pick(clientAt(view, s.canvas, ...P))).toBeNull();
    expect(view.pick(clientAt(view, s.canvas, 0, 0, 2)).entity.id).toBe('front');
  });

  it('buffer bindings with entity(i) pick in screen space, behind the occluder skipped', async () => {
    const { s, view } = makeView({ occluder: { x: 0, y: 0, z: 0, radius: 1 } });
    const mesh = planes(THREE, s.scene);
    const arr = new Float32Array([2, 1.5, 0, 0, 0, 0, -2]);
    view.buffer(() => arr, mesh, { name: 'sats', stride: 3, offset: 1, count: (a) => a[0], position: [0, 1, 2], entity: (i) => ({ i }) });
    await frames(3);
    const hit = view.pick(clientAt(view, s.canvas, 1.5, 0, 0));
    expect(hit.entity).toEqual({ i: 0 });
    expect(hit.name).toBe('sats');
    expect(view.pick(clientAt(view, s.canvas, 0, 0, -2))).toBeNull();
  });
});

describe('hovered and selected', () => {
  it('hovered is not picked while nothing reads it, and follows the pointer once something does', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(() => [{ id: 7, x: 0, y: 0, z: 0 }], mesh, { name: 'dots', position: pos });
    await frames(2);
    let casts = 0;
    const orig = THREE.Raycaster.prototype.intersectObject;
    THREE.Raycaster.prototype.intersectObject = function (...a) { casts++; return orig.apply(this, a); };
    cleanup.push(() => { THREE.Raycaster.prototype.intersectObject = orig; });
    pointer(s.canvas, 'pointermove', clientAt(view, s.canvas, 0, 0, 0));
    await frames(4);
    expect(view.pointer).not.toBeNull();
    expect(casts).toBe(0);
    const seen = [];
    view.subscribe('hovered', (v) => seen.push(v));
    await frames(4);
    expect(casts).toBeGreaterThan(0);
    const snap = seen.at(-1) || view.hovered;
    expect(snap).toEqual({ binding: 'dots', id: 7, entity: { id: 7, x: 0, y: 0, z: 0 } });
    expect(view.hovered).toBe(view.hovered);   // the same snapshot while the same entity is under the pointer
    pointer(s.canvas, 'pointerleave', clientAt(view, s.canvas, 0, 0, 0));
    await frames(2);
    expect(view.hovered).toBeNull();
  });

  it('a click selects what is under it; a drag does not; a click on nothing clears it', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(() => [{ id: 3, x: 0, y: 0, z: 0 }], mesh, { name: 'dots', position: pos });
    await frames(3);
    const at = clientAt(view, s.canvas, 0, 0, 0);
    pointer(s.canvas, 'pointerdown', at);
    s.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: at.clientX, clientY: at.clientY }));
    expect(view.selected).toEqual({ binding: 'dots', id: 3, entity: { id: 3, x: 0, y: 0, z: 0 } });
    const empty = clientAt(view, s.canvas, 1.5, 1, 0);
    pointer(s.canvas, 'pointerdown', at);
    s.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: at.clientX + 20, clientY: at.clientY }));
    expect(view.selected.id).toBe(3);             // dragged: unchanged
    pointer(s.canvas, 'pointerdown', empty);
    s.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: empty.clientX, clientY: empty.clientY }));
    expect(view.selected).toBeNull();
  });

  it('markup binds $view.selected', async () => {
    const { s, name, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(() => [{ id: 5, x: 0, y: 0, z: 0, label: 'five' }], mesh, { position: pos });
    const comp = uniq('sel-card');
    wf.component(comp, { subscribe: { [name]: [] } });
    const el = document.createElement('div');
    el.innerHTML = `<div data-component="${comp}"><span class="out" data-bind="$${name}.selected.entity.label"></span></div>`;
    document.body.appendChild(el);
    cleanup.push(() => el.remove());
    wf.scan(el);
    await frames(3);
    const at = clientAt(view, s.canvas, 0, 0, 0);
    pointer(s.canvas, 'pointerdown', at);
    s.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: at.clientX, clientY: at.clientY }));
    await frames(3);
    expect(el.querySelector('.out').textContent).toBe('five');
  });
});

// One test per fix made before the first release.
describe('pre-release fixes', () => {
  const marker = (s, ro = 0) => {
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }), 4);
    m.renderOrder = ro;
    s.scene.add(m);
    return m;
  };

  it('B1: live sources are not copied: getters are read, picks return the author\'s row, unchanged colours are not re-uploaded', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    class Boid { constructor() { this._x = 0.5; this.id = 'b'; this.c = 0xff0000; } get x() { return this._x; } get y() { return 0; } get z() { return 0; } }
    const row = new Boid();
    view.instanced(() => [row], mesh, { position: pos, color: 'c', live: true });
    await frames(3);
    expect(mesh.instanceMatrix.array[12]).toBe(0.5);
    const v0 = mesh.instanceColor.version;
    await frames(3);
    expect(mesh.instanceColor.version).toBe(v0);
    expect(view.pick(clientAt(view, s.canvas, 0.5, 0, 0)).entity).toBe(row);
  });

  it('B2: unregister disposes the instanced meshes themselves (their instance buffers)', async () => {
    const { s, name, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(() => [{ id: 1, x: 0, y: 0, z: 0 }], mesh, { position: pos });
    await frames(2);
    let n = 0;
    mesh.addEventListener('dispose', () => n++);
    wf.unregister(name);
    expect(n).toBe(1);
  });

  it('B3: loading the file a second time leaves the first install working', async () => {
    const api = wf.three;
    const lines = await captureWarnings(async () => {
      await new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = WF_FILE + '?again';
        tag.onload = resolve; tag.onerror = reject;
        document.head.appendChild(tag);
      });
    });
    expect(wf.three).toBe(api);
    if (BUILD === 'dev') expect(lines.some((l) => l.includes('3D-109'))).toBe(true);
    const { s } = makeView();
    let renders = 0;
    const orig = s.renderer.render.bind(s.renderer);
    s.renderer.render = (a, b) => { renders++; return orig(a, b); };
    await frames(3);
    expect(renders).toBeGreaterThan(0);
  });

  it('B4: a view whose options fail leaves no store behind, so a corrected retry works', () => {
    const s = stage(THREE);
    cleanup.push(() => s.remove());
    const name = uniq('b4');
    expect(() => wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera, fit: '#nope' })).toThrow(/3D-102/);
    expect(wf.getStore(name)).toBeFalsy();
    const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera, fit: s.host });
    cleanup.push(() => wf.unregister(name));
    expect(wf.getStore(name)).toBe(view);
  });

  it('B5: a view unregistered in its own before() does not render that frame', async () => {
    const s = stage(THREE);
    cleanup.push(() => s.remove());
    const name = uniq('b5');
    let calls = 0, renders = 0, rendersAtUnregister = -1;
    const orig = s.renderer.render.bind(s.renderer);
    s.renderer.render = (a, b) => { renders++; return orig(a, b); };
    wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera,
      before() { if (++calls === 3) { rendersAtUnregister = renders; wf.unregister(name); } } });
    await frames(6);
    expect(calls).toBe(3);
    expect(renders).toBe(rendersAtUnregister);
  });

  it('B6: hit distances use the camera\'s world position; an orthographic camera occludes along its view axis', async () => {
    const s = stage(THREE);
    cleanup.push(() => s.remove());
    const rig = new THREE.Group();
    rig.position.set(0, 0, 5);
    const cam = new THREE.PerspectiveCamera(45, 400 / 300, 0.1, 100);
    rig.add(cam);
    s.scene.add(rig);
    s.scene.updateMatrixWorld();
    const name = uniq('b6');
    const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: cam });
    cleanup.push(() => wf.unregister(name));
    const mesh = planes(THREE, s.scene);
    view.buffer(() => new Float32Array([1, 0, 0, 0]), mesh, { stride: 3, offset: 1, count: (a) => a[0], position: [0, 1, 2], entity: (i) => ({ i }) });
    await frames(3);
    expect(view.pick(clientAt(view, s.canvas, 0, 0, 0)).hits[0].distance).toBeCloseTo(5, 3);

    const s2 = stage(THREE);
    cleanup.push(() => s2.remove());
    const ortho = new THREE.OrthographicCamera(-3, 3, 2, -2, 0.1, 100);
    ortho.position.set(0, 0, 5);
    ortho.lookAt(0, 0, 0);
    ortho.updateMatrixWorld();
    const name2 = uniq('b6o');
    const v2 = wf.three.view(name2, { renderer: s2.renderer, scene: s2.scene, camera: ortho, occluder: new THREE.Sphere(new THREE.Vector3(), 1) });
    cleanup.push(() => wf.unregister(name2));
    expect(v2.occluded(1.05, 0, -3)).toBe(false);
    expect(v2.occluded(0.5, 0, -3)).toBe(true);
  });

  it('R1: the top hit does not depend on the order the bindings were created', async () => {
    const tops = [];
    for (const order of [['A', 'B', 'C'], ['B', 'C', 'A'], ['C', 'A', 'B']]) {
      const { s, view } = makeView();
      const make = {
        A: () => { const m = marker(s, 2); view.instanced(() => [{ id: 'A', x: 0, y: 0, z: -2 }], m, { position: pos }); },
        B: () => { const m = planes(THREE, s.scene); view.instanced(() => [{ id: 'B', x: 0, y: 0, z: 0 }], m, { position: pos }); },
        C: () => { const m = marker(s, 1); view.instanced(() => [{ id: 'C', x: 0, y: 0, z: 2 }], m, { position: pos }); },
      };
      order.forEach((k) => make[k]());
      await frames(3);
      tops.push(view.pick(clientAt(view, s.canvas, 0, 0, 0)).hits.map((h) => h.entity.id).join(''));
    }
    expect(new Set(tops).size).toBe(1);
    expect(tops[0][0]).toBe('C');   // the marker in front of the opaque plane
  });

  it('R2: an occluder group with a sprite or points neither throws nor occludes; its meshes still do', () => {
    const s = stage(THREE);
    cleanup.push(() => s.remove());
    const group = new THREE.Group();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    sprite.position.set(0, 0, 1);
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.3, 0, 1], 3)), new THREE.PointsMaterial());
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    wall.position.set(3, 0, 0);
    wall.rotation.y = Math.PI / 2;
    group.add(sprite, pts, wall);
    s.scene.add(group);
    s.scene.updateMatrixWorld();
    const name = uniq('r2');
    const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera, occluder: group });
    cleanup.push(() => wf.unregister(name));
    expect(() => view.occluded(0, 0, -2)).not.toThrow();
    expect(view.occluded(0, 0, -2)).toBe(false);
    expect(view.occluded(6, 0, -5)).toBe(true);   // the sightline crosses the wall at x = 3
  });

  it('R3: two bindings may not write the same custom attribute on one shared geometry', () => {
    const { s, view } = makeView();
    const geo = new THREE.PlaneGeometry(0.3, 0.3);
    const m1 = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 4), m2 = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 4);
    s.scene.add(m1, m2);
    view.instanced(() => [], m1, { position: pos, attributes: { heat: 'h' } });
    expect(() => view.instanced(() => [], m2, { position: pos, attributes: { heat: 'h' } })).toThrow(/3D-104/);
  });

  it('R4: hovered changes when a different entity takes the same slot (no ids)', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    let rows = [{ x: 0, y: 0, z: 0, label: 'first' }];
    view.instanced(() => rows, mesh, { position: pos });
    const seen = [];
    view.subscribe('hovered', (v) => seen.push(v));
    await frames(2);
    pointer(s.canvas, 'pointermove', clientAt(view, s.canvas, 0, 0, 0));
    await frames(3);
    expect(view.hovered.entity.label).toBe('first');
    rows = [{ x: 0, y: 0, z: 0, label: 'second' }];
    await frames(3);
    expect(view.hovered.entity.label).toBe('second');
  });

  it('R5: a buffer binding reports the entity\'s id as its key', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.buffer(() => new Float32Array([1, 0, 0, 0]), mesh, { name: 'sats', stride: 3, offset: 1, count: (a) => a[0], position: [0, 1, 2], entity: (i) => ({ id: 'sat' + i }) });
    await frames(3);
    const at = clientAt(view, s.canvas, 0, 0, 0);
    pointer(s.canvas, 'pointerdown', at);
    s.canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: at.clientX, clientY: at.clientY }));
    expect(view.selected.id).toBe('sat0');
  });

  it('R6: a view that throws in its frame does not stop the others', async () => {
    const bad = makeView({ before() { throw new Error('boom'); } });
    const good = makeView();
    let renders = 0;
    const orig = good.s.renderer.render.bind(good.s.renderer);
    good.s.renderer.render = (a, b) => { renders++; return orig(a, b); };
    const errs = [];
    const oe = console.error;
    console.error = (...a) => errs.push(a.map(String).join(' '));
    try { await frames(4); } finally { console.error = oe; }
    expect(renders).toBeGreaterThan(1);
    expect(errs.some((l) => l.includes('boom'))).toBe(true);
    void bad;
  });

  it('R7: resize() leaves an author\'s own view offset alone when there is no inset', async () => {
    const s = stage(THREE);
    cleanup.push(() => s.remove());
    s.camera.setViewOffset(800, 600, 0, 0, 400, 300);
    const name = uniq('r7');
    const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera, fit: s.host });
    cleanup.push(() => wf.unregister(name));
    view.resize();
    expect(s.camera.view && s.camera.view.enabled).toBe(true);
  });

  it('R8: follow() hides an element with no position, and drops one removed from the page', async () => {
    const { view } = makeView();
    const el = document.createElement('div');
    document.body.appendChild(el);
    let calls = 0;
    view.follow(el, () => { calls++; return { name: 'no position' }; });
    await frames(3);
    expect(el.style.display).toBe('none');
    el.remove();
    const before = calls;
    await frames(3);
    expect(calls).toBe(before);
  });

  it('R9: a function occluder that projects points does not move the label', async () => {
    let view;
    ({ view } = makeView({ occluder: (x, y, z) => { view.projectPoint(0, 0, 0); return false; } }));
    const el = document.createElement('div');
    document.body.appendChild(el);
    cleanup.push(() => el.remove());
    view.follow(el, () => ({ x: 1.5, y: 0, z: 0 }));
    await frames(3);
    const p = view.projectPoint(1.5, 0, 0);
    const [tx] = (el.style.transform.match(/-?[\d.]+/g) || []).map(Number);
    expect(tx).toBeCloseTo(p.x, 1);
  });

  it('R10: a resting pointer does not re-run a subscribed component that reads other view fields', async () => {
    const { s, name, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(() => [{ id: 1, x: 0, y: 0, z: 0 }], mesh, { position: pos });
    const comp = uniq('r10');
    const counts = { update: 0, computed: 0 };
    wf.component(comp, {
      subscribe: { [name]: [] },
      computed: { width() { counts.computed++; return this.stores[name].size.width; } },
      onStoreUpdate() { counts.update++; },
    });
    const host = document.createElement('div');
    host.innerHTML = `<div data-component="${comp}"><span data-bind="width"></span></div>`;
    document.body.appendChild(host);
    cleanup.push(() => host.remove());
    wf.scan(host);
    await frames(3);
    pointer(s.canvas, 'pointermove', clientAt(view, s.canvas, 0, 0, 0));
    await frames(2);
    const before = { ...counts };
    let pointerWrites = 0;
    view.subscribe('pointer', () => pointerWrites++);
    await frames(10);   // the pointer rests over the canvas for ten frames
    expect(pointerWrites).toBeGreaterThan(5);   // control: the pointer really is rewritten each frame
    expect(counts.update - before.update).toBe(0);
    expect(counts.computed - before.computed).toBe(0);
  });

  it('N5: 3D-110 warns (development) when the framework has no frame loop', async () => {
    const real = wf.features;
    wf.features = Object.freeze(Object.assign({}, real, { pools: false }));
    let lines;
    try {
      lines = await captureWarnings(() => { makeView(); });
    } finally { wf.features = real; }
    expect(lines.some((l) => l.includes('3D-110'))).toBe(BUILD === 'dev');
    const quiet = await captureWarnings(() => { makeView(); });
    expect(quiet.some((l) => l.includes('3D-110'))).toBe(false);
  });

  it('D5: size follows the canvas without fit', async () => {
    const { s, view } = makeView();
    s.canvas.style.width = '500px';   // without fit, the author sizes the canvas
    await frames(4);
    expect(view.size.width).toBe(500);
  });
});

describe('frame order', () => {
  // The view draws in a microtask queued from the wf-three store's tick(), so
  // by the time it renders, every tick() of the frame has run and the pools
  // have flushed. A component tick writes the frame number into a pool entity;
  // at each render the pool's DOM must already show the number that frame's
  // tick wrote.
  it('draws after every tick() and pool flush of the frame', async () => {
    const comp = uniq('ticker');
    let n = 0;
    const inTick = [];   // the DOM as the tick sees it, just after writing: not flushed yet
    wf.component(comp, {
      pools: { dots: {} },
      init() { this.pools.dots.push({ id: 1, v: 0 }); },
      tick() {
        n++;
        const e = this.pools.dots.items[0];
        if (e) e.v = n;
        const dot = this.element.querySelector('.dot');
        if (dot) inTick.push([n, Number(dot.textContent)]);
      },
    });
    const host = document.createElement('div');
    host.innerHTML = `<div data-component="${comp}"><div data-pool="dots" data-key="id"><template><span class="dot" data-bind="v"></span></template></div></div>`;
    document.body.appendChild(host);
    cleanup.push(() => host.remove());
    wf.scan(host);
    await frames(3);
    const { s } = makeView();
    const seen = [];
    const orig = s.renderer.render.bind(s.renderer);
    s.renderer.render = (a, b) => { seen.push([n, Number(host.querySelector('.dot').textContent)]); return orig(a, b); };
    await frames(6);
    expect(seen.length).toBeGreaterThan(3);
    for (const [ticked, shown] of seen) expect(shown).toBe(ticked);
    // Control: inside the tick the DOM still lags a frame, so the check above
    // would fail if the view drew before the flush.
    expect(inTick.slice(-3).every(([ticked, shown]) => shown === ticked - 1)).toBe(true);
  });
});

describe('sizing, follow and stats', () => {
  it('fit sizes the renderer and camera to the element; inset centres the scene in the free area', async () => {
    const s = stage(THREE, 400, 300);
    cleanup.push(() => s.remove());
    const name = uniq('fit');
    let right = 100;
    const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera, fit: s.host, inset: () => ({ right }) });
    cleanup.push(() => wf.unregister(name));
    await frames(2);
    expect(view.size).toEqual({ width: 400, height: 300 });
    expect(s.camera.aspect).toBeCloseTo(400 / 300, 5);
    expect(s.camera.view.enabled).toBe(true);
    expect(s.camera.view.offsetX).toBe(50);
    s.host.style.width = '600px';
    await frames(4);
    expect(view.size.width).toBe(600);
    right = 0;
    view.resize();
    expect(s.camera.view && s.camera.view.enabled).toBeFalsy();
  });

  it('follow() keeps an element over an entity and hides it behind the occluder or when there is none', async () => {
    const { s, view } = makeView({ occluder: { x: 0, y: 0, z: 0, radius: 1 } });
    const el = document.createElement('div');
    document.body.appendChild(el);
    cleanup.push(() => el.remove());
    let target = { x: 1.5, y: 0, z: 0 };
    const stop = view.follow(el, () => target);
    await frames(3);
    const p = view.projectPoint(1.5, 0, 0);
    expect(el.style.display).toBe('');
    const [tx, ty] = (el.style.transform.match(/-?[\d.]+/g) || []).map(Number);
    expect(tx).toBeCloseTo(p.x, 1);
    expect(ty).toBeCloseTo(p.y, 1);
    target = { x: 0, y: 0, z: -2 };
    await frames(2);
    expect(el.style.display).toBe('none');
    target = null;
    await frames(2);
    expect(el.style.display).toBe('none');
    stop();
  });

  it('stats are published about once a second', async () => {
    const { view } = makeView();
    await tick(1200);
    await frames(2);
    expect(view.stats.fps).toBeGreaterThan(0);
  });
});

// render: 'change' and maxFps (2026-09-28/29, measured: a still molecule
// cost ~19% Chrome CPU redrawing identical frames, the same as spinning).
describe('render on demand', () => {
  function counted(s) {
    const c = { n: 0 };
    const orig = s.renderer.render.bind(s.renderer);
    s.renderer.render = (a, b) => { c.n++; return orig(a, b); };
    return c;
  }

  it("render: 'frame' (the default) draws every frame of a still scene", async () => {
    const { s } = makeView();
    planes(THREE, s.scene);
    await frames(2);
    const c = counted(s);
    await frames(5);
    expect(c.n).toBeGreaterThanOrEqual(4);
  });

  it("render: 'change' draws at the start, then nothing while nothing changes", async () => {
    const { s } = makeView({ render: 'change' });
    planes(THREE, s.scene);
    const c = counted(s);
    await frames(3);
    // The first frame, and possibly one more for the resize observer's first
    // report, which settles the size.
    expect(c.n).toBeGreaterThanOrEqual(1);
    const settled = c.n;
    await frames(6);
    expect(c.n).toBe(settled);
  });

  it("render: 'change' draws after a binding writes (a new array from a function source)", async () => {
    const { s, view } = makeView({ render: 'change' });
    const mesh = planes(THREE, s.scene);
    let rows = [{ id: 1, x: 0, y: 0, z: 0 }];
    view.instanced(() => rows, mesh, { position: pos });
    await frames(3);
    const c = counted(s);
    await frames(3);
    expect(c.n).toBe(0);
    rows = [{ id: 1, x: 1, y: 0, z: 0 }];
    await frames(3);
    expect(c.n).toBe(1);
    expect(mesh.instanceMatrix.array[12]).toBe(1);
  });

  it("render: 'change' draws after the camera moves, with no call from the app", async () => {
    const { s } = makeView({ render: 'change' });
    planes(THREE, s.scene);
    await frames(3);
    const c = counted(s);
    s.camera.position.x = 0.5;
    s.camera.lookAt(0, 0, 0);
    await frames(3);
    expect(c.n).toBe(1);
    await frames(3);
    expect(c.n).toBe(1);
  });

  it("invalidate() draws the next frame, once", async () => {
    const { s, view } = makeView({ render: 'change' });
    const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    s.scene.add(box);
    await frames(3);
    const c = counted(s);
    box.rotation.y = 1;                  // invisible to the view
    await frames(3);
    expect(c.n).toBe(0);
    view.invalidate();
    await frames(3);
    expect(c.n).toBe(1);
  });

  it("resize() draws the next frame", async () => {
    const { s, view } = makeView({ render: 'change' });
    planes(THREE, s.scene);
    await frames(3);
    const c = counted(s);
    view.resize();
    await frames(3);
    expect(c.n).toBe(1);
  });

  it("stats.fps counts frames drawn, so a still 'change' view reads 0", async () => {
    const { s, view } = makeView({ render: 'change' });
    planes(THREE, s.scene);
    await tick(2300);                    // two stats windows
    expect(view.stats.fps).toBe(0);
  });

  it('maxFps caps the frames drawn per second', async () => {
    const { s } = makeView({ maxFps: 10 });
    planes(THREE, s.scene);
    await frames(2);
    const c = counted(s);
    await tick(1000);
    expect(c.n).toBeGreaterThanOrEqual(7);
    expect(c.n).toBeLessThanOrEqual(12);
  });

  it('an unknown render value, or a maxFps that is not a positive number, throws 3D-102', () => {
    expect(() => makeView({ render: 'lazy' })).toThrow(/3D-102/);
    expect(() => makeView({ maxFps: 0 })).toThrow(/3D-102/);
    expect(() => makeView({ maxFps: 'fast' })).toThrow(/3D-102/);
  });
});

describe('teardown', () => {
  function disposed(obj) { let n = 0; obj.addEventListener('dispose', () => n++); return () => n; }

  it('unregister() stops drawing and frees the scene, sparing what another live view uses', async () => {
    const { s, name, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const tex = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    mesh.material.map = tex;
    const shared = new THREE.MeshBasicMaterial();
    s.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
    const other = makeView();
    other.s.scene.add(new THREE.Mesh(new THREE.BoxGeometry(), shared));
    view.instanced(() => [{ id: 1, x: 0, y: 0, z: 0 }], mesh, { position: pos });
    await frames(3);
    const geo = disposed(mesh.geometry), mat = disposed(mesh.material), t = disposed(tex), sh = disposed(shared);
    let renders = 0;
    const orig = s.renderer.render.bind(s.renderer);
    s.renderer.render = (a, b) => { renders++; return orig(a, b); };
    wf.unregister(name);
    expect([geo(), mat(), t()]).toEqual([1, 1, 1]);
    expect(sh()).toBe(0);
    await frames(3);
    expect(renders).toBe(0);
    pointer(s.canvas, 'pointermove', { clientX: 10, clientY: 10 });   // no listener left to throw
  });

  it('dispose: false keeps the scene', async () => {
    const { s, name } = makeView({ dispose: false });
    const mesh = planes(THREE, s.scene);
    const geo = disposed(mesh.geometry);
    wf.unregister(name);
    expect(geo()).toBe(0);
  });
});
