/**
 * An instance's rotation and scale: quaternion and rotation (Euler) fields,
 * a scale per axis with every way of setting the rotation, a buffer's
 * quaternion offsets, the specs instanced() and buffer() refuse, and
 * projectPoint() through a camera moved in code since the last frame and
 * through a camera given as its fourth argument. Each
 * matrix is checked against the one three.js composes for an Object3D with
 * the same position, rotation and scale.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { load, stage, planes, frames, uniq, BUILD, CORE_TIER } from './helpers.js';

let wf, THREE;
const cleanup = [];

beforeAll(async () => { ({ wf, THREE } = await load()); });
afterEach(() => {
  while (cleanup.length) {
    const c = cleanup.pop();
    try { c(); } catch (e) { /* already gone */ }
  }
});

function makeView() {
  const s = stage(THREE);
  const name = uniq('t');
  const view = wf.three.view(name, { renderer: s.renderer, scene: s.scene, camera: s.camera });
  cleanup.push(() => s.remove());
  cleanup.push(() => { if (wf.getStore(name)) wf.unregister(name); });
  return { s, view };
}

const pos = ['x', 'y', 'z'];

// Instance i's matrix, and the matrix three.js gives an Object3D set up by
// `place`, compared element by element (the instance buffer is 32-bit).
function instanceMatrix(mesh, i) { return Array.from(mesh.instanceMatrix.array.slice(i * 16, i * 16 + 16)); }
function composed(place) {
  const o = new THREE.Object3D();
  place(o);
  o.updateMatrix();
  return Array.from(o.matrix.elements);
}
function expectClose(actual, expected) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((v, i) => expect(v, 'element ' + i).toBeCloseTo(expected[i], 5));
}

describe(`instance rotation and scale (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('quaternion: the rotation of the four fields, normalized, as Object3D.quaternion gives it', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -1.1, 2.3));
    // Twice the length: drawn as the unit quaternion.
    const items = [{ x: 1, y: 2, z: 3, qx: q.x * 2, qy: q.y * 2, qz: q.z * 2, qw: q.w * 2 }, { x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 0 }];
    view.instanced(() => items, mesh, { position: pos, quaternion: ['qx', 'qy', 'qz', 'qw'] });
    await frames(3);
    expectClose(instanceMatrix(mesh, 0), composed((o) => { o.position.set(1, 2, 3); o.quaternion.copy(q); }));
    // A zero quaternion is no rotation.
    expectClose(instanceMatrix(mesh, 1), composed(() => {}));
  });

  it('rotation: radians about each axis in the XYZ order, as Object3D.rotation gives it', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const items = [{ x: -1, y: 0.5, z: 2, rx: 0.4, ry: -1.1, rz: 2.3 }];
    view.instanced(() => items, mesh, { position: pos, rotation: ['rx', 'ry', 'rz'] });
    await frames(3);
    expectClose(instanceMatrix(mesh, 0), composed((o) => { o.position.set(-1, 0.5, 2); o.rotation.set(0.4, -1.1, 2.3); }));
  });

  describe('a scale per axis', () => {
    const e = { x: 1, y: -2, z: 0.5, sx: 2, sy: 0.5, sz: 3 };
    const scaled = (o) => { o.position.set(1, -2, 0.5); o.scale.set(2, 0.5, 3); };

    it('with no rotation', async () => {
      const { s, view } = makeView();
      const mesh = planes(THREE, s.scene);
      view.instanced(() => [e], mesh, { position: pos, scale: ['sx', 'sy', 'sz'] });
      await frames(3);
      expectClose(instanceMatrix(mesh, 0), composed(scaled));
    });

    it('with quaternion', async () => {
      const { s, view } = makeView();
      const mesh = planes(THREE, s.scene);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.2, 0.3, -0.7));
      view.instanced(() => [Object.assign({ qx: q.x, qy: q.y, qz: q.z, qw: q.w }, e)], mesh, { position: pos, quaternion: ['qx', 'qy', 'qz', 'qw'], scale: ['sx', 'sy', 'sz'] });
      await frames(3);
      expectClose(instanceMatrix(mesh, 0), composed((o) => { scaled(o); o.quaternion.copy(q); }));
    });

    it('with rotation', async () => {
      const { s, view } = makeView();
      const mesh = planes(THREE, s.scene);
      view.instanced(() => [Object.assign({ rx: 1.2, ry: 0.3, rz: -0.7 }, e)], mesh, { position: pos, rotation: ['rx', 'ry', 'rz'], scale: ['sx', 'sy', 'sz'] });
      await frames(3);
      expectClose(instanceMatrix(mesh, 0), composed((o) => { scaled(o); o.rotation.set(1.2, 0.3, -0.7); }));
    });

    it('with rotationY', async () => {
      const { s, view } = makeView();
      const mesh = planes(THREE, s.scene);
      view.instanced(() => [Object.assign({ r: 0.9 }, e)], mesh, { position: pos, rotationY: 'r', scale: ['sx', 'sy', 'sz'] });
      await frames(3);
      expectClose(instanceMatrix(mesh, 0), composed((o) => { scaled(o); o.rotation.set(0, 0.9, 0); }));
    });

    it('with direction: the third factor stretches the instance along the direction', async () => {
      const { s, view } = makeView();
      const mesh = planes(THREE, s.scene);
      view.instanced(() => [Object.assign({ dx: 1, dy: 2, dz: -2 }, e)], mesh, { position: pos, direction: ['dx', 'dy', 'dz'], scale: ['sx', 'sy', 'sz'] });
      await frames(3);
      expectClose(instanceMatrix(mesh, 0), composed((o) => { scaled(o); o.lookAt(1 + 1, -2 + 2, 0.5 - 2); }));
      // The local +Z axis, scaled: length 3 along (1, 2, -2) / 3.
      const m = instanceMatrix(mesh, 0);
      expect([m[8], m[9], m[10]].map((v) => Math.round(v * 1e4) / 1e4)).toEqual([1, 2, -2]);
    });
  });

  it("buffer(): quaternion offsets rotate each record's instance", async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.8, 1.9));
    const arr = new Float32Array([0.5, 0, 1, q.x, q.y, q.z, q.w]);   // x, y, z, qx, qy, qz, qw
    view.buffer(() => arr, mesh, { stride: 7, count: () => 1, position: [0, 1, 2], quaternion: [3, 4, 5, 6] });
    await frames(3);
    expectClose(instanceMatrix(mesh, 0), composed((o) => { o.position.set(0.5, 0, 1); o.quaternion.set(arr[3], arr[4], arr[5], arr[6]); }));
  });

  it('3D-104 / 3D-105: a rotation or scale array that is not 4 or 3 field names, or quaternion or rotation beside another rotation field', () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    const bad = [
      { quaternion: ['a', 'b', 'c'] },
      { quaternion: ['a', 'b', 'c', 4] },
      { rotation: 'r' },
      { rotation: ['a', 'b'] },
      { scale: ['a', 'b'] },
      { scale: [1, 1, 'len'] },
      { quaternion: ['a', 'b', 'c', 'd'], rotation: ['a', 'b', 'c'] },
      { quaternion: ['a', 'b', 'c', 'd'], direction: ['a', 'b', 'c'] },
      { rotation: ['a', 'b', 'c'], rotationY: 'r' },
    ];
    for (const extra of bad) {
      expect(() => view.instanced(() => [], mesh, Object.assign({ position: pos }, extra)), JSON.stringify(extra)).toThrow(/3D-104/);
    }
    const buf = { stride: 7, count: () => 0, position: [0, 1, 2] };
    expect(() => view.buffer(() => null, mesh, Object.assign({ quaternion: [3, 4, 5] }, buf))).toThrow(/3D-105/);
    expect(() => view.buffer(() => null, mesh, Object.assign({ quaternion: ['qx', 'qy', 'qz', 'qw'] }, buf))).toThrow(/3D-105/);
    expect(() => view.buffer(() => null, mesh, Object.assign({ quaternion: [3, 4, 5, 6], direction: [3, 4, 5] }, buf))).toThrow(/3D-105/);
  });

  it('direction beside rotationY is still allowed, and draws the direction', async () => {
    const { s, view } = makeView();
    const mesh = planes(THREE, s.scene);
    view.instanced(() => [{ x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0, r: 0.6 }], mesh, { position: pos, rotationY: 'r', direction: ['dx', 'dy', 'dz'] });
    await frames(3);
    expectClose(instanceMatrix(mesh, 0), composed((o) => { o.lookAt(1, 0, 0); }));
  });

  it("projectPoint(x, y, z, camera) projects through the given camera in the view's canvas pixels; without one, through the view's", async () => {
    const { s, view } = makeView();
    await frames(2);
    const w = s.renderer.domElement.clientWidth, h = s.renderer.domElement.clientHeight;
    const px = (cam, x, y, z) => {
      const ref = cam.clone();
      ref.updateMatrixWorld(true);
      const v = new THREE.Vector3(x, y, z).project(ref);
      return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
    };
    // Aimed differently from the view's last-drawn camera, with no update
    // of its own matrices.
    const other = new THREE.PerspectiveCamera(30, 2, 0.1, 100);
    other.position.set(-4, 2, 3);
    other.lookAt(0, 0, 0);
    const p = view.projectPoint(1, 0.5, 0, other), want = px(other, 1, 0.5, 0);
    expect(p.x).toBeCloseTo(want.x, 3);
    expect(p.y).toBeCloseTo(want.y, 3);
    const own = view.projectPoint(1, 0.5, 0), wantOwn = px(s.camera, 1, 0.5, 0);
    expect(own.x).toBeCloseTo(wantOwn.x, 3);
    expect(own.y).toBeCloseTo(wantOwn.y, 3);
    expect(Math.abs(p.x - own.x)).toBeGreaterThan(10);
    // Behind the given camera, and in front of the view's.
    expect(view.projectPoint(-6, 3, 4.5, other)).toBeNull();
    expect(view.projectPoint(-6, 3, 4.5)).not.toBeNull();
  });

  it('projectPoint() projects through the camera where it is now, when code moved it since the last frame', async () => {
    const { s, view } = makeView();
    await frames(2);
    // Moved and turned in code, with no frame drawn since and no
    // updateMatrixWorld(): lookAt() alone leaves the matrices half updated.
    s.camera.position.set(3, 1, 4);
    s.camera.lookAt(0, 0, 0);
    const ref = s.camera.clone();
    ref.updateMatrixWorld(true);
    const expected = new THREE.Vector3(1, 0.5, 0).project(ref);
    const w = s.renderer.domElement.clientWidth, h = s.renderer.domElement.clientHeight;
    const p = view.projectPoint(1, 0.5, 0);
    expect(p.x).toBeCloseTo((expected.x + 1) / 2 * w, 3);
    expect(p.y).toBeCloseTo((1 - expected.y) / 2 * h, 3);
  });
});
