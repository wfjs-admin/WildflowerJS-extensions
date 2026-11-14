/**
 * moves() and look(): a camera built from a list of moves, and the camera's
 * numbers for an eye looking at a point. Pure functions first, then look()'s
 * geometry measured in the browser: a marker at the target, inside a world
 * with camera()'s style, lands at the stage's center.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

// Samples of key k from t0 to t1 every dt.
const samples = (C, k, t0, t1, dt = 1 / 60) => { const out = []; for (let t = t0; t <= t1 + 1e-9; t += dt) out.push(C(t)[k]); return out; };
const steps = (v) => v.slice(1).map((x, i) => x - v[i]);

describe(`moves and look (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('moves(): a move lands on its to at t + d and holds; the first entry is where the camera starts; keys left out stay', async () => {
    const { wf } = await load();
    const { moves, ease } = wf.kinetic;
    const C = moves([{ to: { x: -100, zoom: 1.5 } }, { t: 1, d: 2, to: { x: 300, y: 50 } }]);
    expect(C(0)).toEqual({ x: -100, y: 0, z: 0, pan: 0, tilt: 0, roll: 0, zoom: 1.5 });
    expect(C(1).x).toBe(-100);
    // The default ease is power2.inOut.
    expect(C(1.5).x).toBeCloseTo(-100 + 400 * ease('power2.inOut')(0.25), 9);
    expect(C(3)).toEqual({ x: 300, y: 50, z: 0, pan: 0, tilt: 0, roll: 0, zoom: 1.5 });
    expect(C(30)).toEqual(C(3));
  });

  it("moves(): ease 'attack' is fast in and long to settle; over goes past the mark and back; kick and swing return to 0", async () => {
    const { wf } = await load();
    const { moves } = wf.kinetic;
    const A = moves([{ to: { x: 0 } }, { t: 0, d: 1, to: { x: 100 }, ease: 'attack' }]);
    expect(A(0.27).x).toBeCloseTo(62, 6);
    // Fastest early: the first third covers more than the last two.
    expect(A(1 / 3).x).toBeGreaterThan(100 - A(1 / 3).x);
    const O = moves([{ to: { x: 0 } }, { t: 0, d: 1, to: { x: 100 }, over: { x: 0.05 } }]);
    expect(Math.max(...samples(O, 'x', 0, 1))).toBeCloseTo(105, 1);
    expect(O(1).x).toBe(100);
    const K = moves([{ to: {} }, { t: 0, d: 1, to: { x: 100 }, kick: { roll: -4 }, swing: { y: 80 } }]);
    expect(Math.min(...samples(K, 'roll', 0, 1))).toBeCloseTo(-4, 2);
    expect(Math.max(...samples(K, 'y', 0, 1))).toBeCloseTo(80, 1);
    expect(K(1)).toMatchObject({ x: 100, y: 0, roll: 0 });
  });

  it('moves(): moves add, so a delayed key keeps moving with the drift before it, overlapping moves blend, and each still lands', async () => {
    const { wf } = await load();
    const { moves } = wf.kinetic;
    const C = moves([{ to: { x: 0 } }, { t: 0, d: 1, to: { x: 100 }, drift: { x: 50 } }, { t: 1.5, d: 1, to: { x: 400 }, lag: { x: 0.3 } }]);
    // From the drift through the delayed move, x never stops and never turns back.
    const dx = steps(samples(C, 'x', 1, 2.7));
    expect(Math.min(...dx)).toBeGreaterThan(0.05);
    expect(C(2.8).x).toBeCloseTo(400, 9);
    expect(C(9).x).toBeCloseTo(400, 9);
    // The drift is in the plan: the move with the drift passes its to at its end and keeps going.
    expect(C(1).x).toBeCloseTo(100, 9);
    expect(C(1.4).x).toBeCloseTo(120, 9);
    // A move that starts before the last has landed: one curve, ending on the second's to.
    const B = moves([{ to: { y: 0 } }, { t: 0, d: 1, to: { y: 100 } }, { t: 0.6, d: 1, to: { y: 300 } }]);
    const dy = steps(samples(B, 'y', 0.02, 1.58));
    expect(Math.min(...dy)).toBeGreaterThan(0);
    expect(B(1.6).y).toBeCloseTo(300, 9);
    // A drift on the first entry runs from its t until the next move, then falls away over it.
    const D = moves([{ to: { z: 0 }, drift: 25 }, { t: 2, d: 1, to: { z: 500 } }]);
    expect(D(2).z).toBeCloseTo(50, 9);
    expect(D(3).z).toBeCloseTo(500, 9);
  });

  it('moves(): dolly moves z at a steady rate of zoom toward a plane; a function move is followed, blended in, and handed on at its speed', async () => {
    const { wf } = await load();
    const { moves } = wf.kinetic;
    // The eye from 5000 px to 10 px from the z = 0 plane on a linear ease: the distance shrinks by the same factor each step.
    const C = moves([{ to: { z: -4000 } }, { t: 0, d: 1, to: { z: 990 }, dolly: true, ease: 'linear' }]);
    const dist = [0, 0.25, 0.5, 0.75, 1].map((t) => 1000 - C(t).z);
    expect(dist[0]).toBeCloseTo(5000, 6);
    expect(dist[4]).toBeCloseTo(10, 6);
    for (let i = 1; i < 4; i++) expect(dist[i + 1] / dist[i]).toBeCloseTo(dist[1] / dist[0], 6);
    // dolly: z is a plane of its own.
    const Z = moves([{ to: { z: 0 } }, { t: 0, d: 1, to: { z: 5900 }, dolly: -5000, ease: 'linear' }]);
    expect(1000 - Z(0.5).z + 5000).toBeCloseTo(Math.sqrt(6000 * 100), 6);
    // A function shot: x = 100 t for 2 s, then a move to 500. The speed going in is the function's, with no jump.
    const F = moves([{ to: { x: 0 } }, { t: 0, d: 2, to: (t) => ({ x: 100 * t }) }, { t: 2, d: 1, to: { x: 500 } }]);
    expect(F(1).x).toBeCloseTo(100, 9);
    expect(F(2.05).x - F(2).x).toBeCloseTo(5, 0);
    expect(F(3).x).toBeCloseTo(500, 9);
    // Blended in over its first 0.4 s from where the camera was.
    const G = moves([{ to: { x: 50 } }, { t: 1, d: 2, to: () => ({ x: 0 }) }]);
    expect(G(1).x).toBe(50);
    expect(G(1.2).x).toBeCloseTo(25, 9);
    expect(G(1.4).x).toBe(0);
  });

  it('look(): the camera for an eye looking at a point, z in the camera\'s own terms; a look move interpolates the eye and the target and lands on look()', async () => {
    const { wf } = await load();
    const { look, moves } = wf.kinetic;
    expect(look([0, 0, 1000], [0, 0, 0])).toEqual({ x: 0, y: 0, z: 0, pan: 0, tilt: 0 });
    expect(look([0, 0, 600], [0, 0, -100], { perspective: 800 }).z).toBe(200);
    const end = look([500, -200, 800], [0, 0, -300]);
    const C = moves([{ to: { x: 0 } }, { t: 0, d: 1, to: { eye: [500, -200, 800], at: [0, 0, -300] }, lag: { 'eye.x': 0.2 } }]);
    expect(C(0)).toEqual({ x: 0, y: 0, z: 0, pan: 0, tilt: 0, roll: 0, zoom: 1 });
    for (const k of ['x', 'y', 'z', 'pan', 'tilt']) expect(C(1.2)[k]).toBeCloseTo(end[k], 6);
    // The first entry can be a look.
    const L = moves([{ to: { eye: [0, 0, 1000], at: [300, 0, 0], roll: 2 } }]);
    expect(L(0).pan).toBeCloseTo(look([0, 0, 1000], [300, 0, 0]).pan, 9);
    expect(L(0).roll).toBe(2);
  });

  it('look(): a marker at the target lands at the center of the stage under camera()', async () => {
    const { wf } = await load();
    const { look, camera } = wf.kinetic;
    const W = 640, H = 360;
    const stage = document.createElement('div');
    stage.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px`;
    const world = document.createElement('div');
    world.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
    stage.appendChild(world);
    document.body.appendChild(stage);
    cleanup.push(stage);
    for (const [eye, at] of [[[400, -150, 900], [-120, 60, -400]], [[-300, 200, 500], [100, -50, 0]], [[0, -600, 300], [0, 0, -200]]]) {
      world.innerHTML = '';
      const m = document.createElement('i');
      m.style.cssText = `position:absolute;display:block;width:10px;height:10px;left:${W / 2 + at[0] - 5}px;top:${H / 2 + at[1] - 5}px;transform:translateZ(${at[2]}px)`;
      world.appendChild(m);
      Object.assign(world.style, camera(0, look(eye, at)));
      const r = m.getBoundingClientRect();
      expect(r.left + r.width / 2).toBeCloseTo(W / 2, 0);
      expect(r.top + r.height / 2).toBeCloseTo(H / 2, 0);
    }
  });

  it('moves() and look(): KN-100 naming the entry and field, KN-121 for an unknown ease', async () => {
    const { wf } = await load();
    const { moves, look } = wf.kinetic;
    expectKN(() => moves([]), 'KN-100', 'moves(list)', /^list is an array/);
    expectKN(() => moves([{ to: { q: 1 } }]), 'KN-100', 'moves(list)[0].to.q', /no key 'q'/);
    expectKN(() => moves([{ to: {}, d: 1 }]), 'KN-100', 'moves(list)[0].d', /where the camera starts/);
    expectKN(() => moves([{ t: 1, to: {} }, { t: 0.5, to: { x: 1 } }]), 'KN-100', 'moves(list)[1].t', /in order of t/);
    expectKN(() => moves([{ to: {} }, { t: 1, d: 0, to: { x: 1 } }]), 'KN-100', 'moves(list)[1].d', /above 0/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { x: 1 }, speed: 2 }]), 'KN-100', 'moves(list)[1].speed', /no field 'speed'/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { x: 1 }, kick: { x: 1 } }]), 'KN-100', 'moves(list)[1].kick.x', /no key 'x'/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { x: 1 }, lag: { x: -1 } }]), 'KN-100', 'moves(list)[1].lag.x', /0 or more/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { x: 1 }, ease: 'spring' }]), 'KN-100', 'moves(list)[1].ease', /spring/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { x: 1 }, dolly: true }]), 'KN-100', 'moves(list)[1].dolly', /has a z/);
    expectKN(() => moves([{ to: { z: 0 } }, { t: 1, to: { z: 1200 }, dolly: true }]), 'KN-100', 'moves(list)[1].dolly', /at or past the plane/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: () => ({}), lag: { x: 1 } }]), 'KN-100', 'moves(list)[1].lag', /follows a function/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { eye: [0, 0], at: [0, 0, 0] } }]), 'KN-100', 'moves(list)[1].to', /a look is/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { eye: [0, 0, 1], at: [0, 0, 0] }, lag: { x: 1 } }]), 'KN-100', 'moves(list)[1].lag.x', /eye\.x/);
    expectKN(() => moves([{ to: {} }, { t: 1, to: { x: 1 }, ease: 'nope' }]), 'KN-121', 'moves(list)[1].ease');
    expectKN(() => moves([{ to: {} }, { t: 0, d: 1, to: () => ({ w: 1 }) }])(0.5), 'KN-100', 'moves(list)[1].to', /key 'w'/);
    expectKN(() => moves([{ to: {} }])('1'), 'KN-100', 'moves(list)(t)', /time in seconds/);
    expectKN(() => look([0, 0, 0], [0, 0, 0]), 'KN-100', 'look(eye, at)', /same point/);
    expectKN(() => look([0, 0, 1], [0, 0]), 'KN-100', 'look(eye, at)', /points/);
  });
});
