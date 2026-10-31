/**
 * distribute() and falloff(): points laid out along a line, round a circle,
 * on a grid, in a sunflower spiral, in a seeded even scatter or along an SVG
 * path; and a 0 to 1 weight for a point from a radial, linear, band, ring or
 * shape field. Both pure, so the expected values are worked out here by hand.
 */
import { describe, it, expect } from 'vitest';
import { load, expectKN, BUILD, CORE_TIER } from './helpers.js';

const EPS = 1e-6;
const close = (got, want, label, eps = EPS) => {
  expect(got.length, label + ': length').toBe(want.length);
  got.forEach((g, i) => expect(Math.abs(g - want[i]) <= eps, label + '[' + i + ']: ' + g + ' vs ' + want[i]).toBe(true));
};
const xs = (pts) => pts.map((p) => p.x);
const ys = (pts) => pts.map((p) => p.y);
const headings = (pts) => pts.map((p) => p.heading);
const GOLDEN = 180 * (3 - Math.sqrt(5));     // 137.5077... degrees

describe(`distribute (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("line: n points from from to to, both ends included, heading the direction of travel (0 right, 90 down), u 0 to 1", async () => {
    const { wf } = await load();
    const { distribute } = wf.kinetic;
    const p = distribute('line', 5, { from: [0, 10], to: [100, 10] });
    expect(Object.keys(p[0])).toEqual(['i', 'x', 'y', 'heading', 'u']);
    close(xs(p), [0, 25, 50, 75, 100], 'x');
    close(ys(p), [10, 10, 10, 10, 10], 'y');
    close(headings(p), [0, 0, 0, 0, 0], 'angle right');
    close(p.map((q) => q.u), [0, 0.25, 0.5, 0.75, 1], 'u');
    expect(p.map((q) => q.i)).toEqual([0, 1, 2, 3, 4]);
    close(headings(distribute('line', 2, { from: [0, 0], to: [0, 50] })), [90, 90], 'angle down');
    close(headings(distribute('line', 2, { from: [10, 10], to: [0, 0] })), [225, 225], 'angle up and left');
    const one = distribute('line', 1, { from: [3, 4], to: [9, 9] });
    expect([one[0].x, one[0].y, one[0].u]).toEqual([3, 4, 0]);
    expect(distribute('line', 0, { from: [0, 0], to: [1, 1] })).toEqual([]);
  });

  it('circle: a full circle spaced 360 / n from the top, clockwise, as shape() measures; an arc includes both ends; heading the clockwise tangent', async () => {
    const { wf } = await load();
    const { distribute } = wf.kinetic;
    const p = distribute('circle', 4, { cx: 100, cy: 100, radius: 50 });
    close(xs(p), [100, 150, 100, 50], 'x');
    close(ys(p), [50, 100, 150, 100], 'y');
    close(headings(p), [0, 90, 180, 270], 'angle');
    const arc = distribute('circle', 3, { cx: 0, cy: 0, radius: 10, from: -90, to: 90 });
    close(xs(arc), [-10, 0, 10], 'arc x');
    close(ys(arc), [0, -10, 0], 'arc y');
    close(headings(arc), [270, 0, 90], 'arc angle');
    // Anticlockwise when to is below from: the direction of travel turns round.
    close(headings(distribute('circle', 2, { cx: 0, cy: 0, radius: 10, from: 90, to: 0 })), [270, 180], 'anticlockwise');
  });

  it('grid: row by row as stagger({ grid }) numbers its cells, centred on cx and cy, cell apart; col and row on each point', async () => {
    const { wf } = await load();
    const { distribute } = wf.kinetic;
    const p = distribute('grid', 7, { columns: 3, cell: 10, cx: 50, cy: 50 });
    close(xs(p), [40, 50, 60, 40, 50, 60, 40], 'x');
    close(ys(p), [40, 40, 40, 50, 50, 50, 60], 'y');
    expect(p.map((q) => [q.col, q.row])).toEqual([[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2]]);
    const r = distribute('grid', 4, { columns: 2, cell: [20, 6] });
    close(xs(r), [-10, 10, -10, 10], 'x, cell [w, h]');
    close(ys(r), [-3, -3, 3, 3], 'y, cell [w, h]');
    close(headings(r), [0, 0, 0, 0], 'angle');
  });

  it("spiral: the sunflower, each point the golden angle round from the last, inside radius, with even density; heading outward", async () => {
    const { wf } = await load();
    const { distribute } = wf.kinetic;
    const n = 400, R = 100;
    const p = distribute('spiral', n, { cx: 0, cy: 0, radius: R });
    p.forEach((q, i) => {
      const r = R * Math.sqrt((i + 0.5) / n), a = i * GOLDEN;
      expect(Math.abs(q.x - r * Math.sin(a * Math.PI / 180)) < 1e-6 && Math.abs(q.y + r * Math.cos(a * Math.PI / 180)) < 1e-6, 'point ' + i).toBe(true);
      expect(Math.abs(((q.heading - (a - 90)) % 360 + 540) % 360 - 180) < 1e-6, 'heading ' + i).toBe(true);
    });
    expect(Math.max(...p.map((q) => Math.hypot(q.x, q.y)))).toBeLessThanOrEqual(R);
    // Even density: as many points in the inner half of the area as in the outer.
    const inner = p.filter((q) => Math.hypot(q.x, q.y) < R / Math.SQRT2).length;
    expect(Math.abs(inner - n / 2)).toBeLessThanOrEqual(1);
  });

  it('scatter: inside the rectangle, the same for the same seed on every call, another for another seed, and evenly spread', async () => {
    const { wf } = await load();
    const { distribute } = wf.kinetic;
    const o = { width: 400, height: 200, cx: 200, cy: 100 };
    const a = distribute('scatter', 120, o);
    expect(a.every((q) => q.x >= 0 && q.x <= 400 && q.y >= 0 && q.y <= 200)).toBe(true);
    expect(distribute('scatter', 120, o)).toEqual(a);
    expect(distribute('scatter', 120, Object.assign({ seed: 1 }, o))).toEqual(a);    // seed 1 by default
    expect(distribute('scatter', 120, Object.assign({ seed: 'two' }, o))).not.toEqual(a);
    // Evenly spread: no two points nearer than half the spacing of a square grid of the same count.
    let min = Infinity;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) min = Math.min(min, Math.hypot(a[i].x - a[j].x, a[i].y - a[j].y));
    expect(min).toBeGreaterThan(0.5 * Math.sqrt((400 * 200) / 120));
  });

  it('path: evenly by length along SVG path data, both ends of an open path, every n-th of a closed one; heading the tangent', async () => {
    const { wf } = await load();
    const { distribute } = wf.kinetic;
    const open = distribute('path', 5, { d: 'M0 0 H100' });
    close(xs(open), [0, 25, 50, 75, 100], 'open x');
    close(headings(open), [0, 0, 0, 0, 0], 'open angle');
    const square = distribute('path', 4, { d: 'M0 0 H100 V100 H0 Z' });
    close(xs(square), [0, 100, 100, 0], 'closed x', 1e-3);
    close(ys(square), [0, 0, 100, 100], 'closed y', 1e-3);
    // A circle drawn with two arcs: points even round it, each heading the circle's tangent.
    const circle = distribute('path', 8, { d: 'M50 0 A50 50 0 0 1 50 100 A50 50 0 0 1 50 0 Z' });
    circle.forEach((q, i) => {
      expect(Math.abs(Math.hypot(q.x - 50, q.y - 50) - 50) < 0.05, 'on the circle ' + i).toBe(true);
      const a = i * 45;     // from the top, clockwise
      expect(Math.abs(q.x - (50 + 50 * Math.sin(a * Math.PI / 180))) < 0.1 && Math.abs(q.y - (50 - 50 * Math.cos(a * Math.PI / 180))) < 0.1, 'even ' + i).toBe(true);
      expect(Math.abs(((q.heading - a) % 360 + 540) % 360 - 180) < 0.5, 'tangent ' + i + ': ' + q.heading).toBe(true);
    });
    // A curve: each point where a brute-force walk along the curve (20,000
    // steps) reaches the same share of its length.
    const P = [[0, 100], [30, -40], [70, 240], [100, 0]];
    const B = (t) => { const m = 1 - t; return [0, 1].map((k) => m * m * m * P[0][k] + 3 * m * m * t * P[1][k] + 3 * m * t * t * P[2][k] + t * t * t * P[3][k]); };
    const N = 20000, walk = [B(0)], acc = [0];
    for (let i = 1; i <= N; i++) { walk.push(B(i / N)); acc.push(acc[i - 1] + Math.hypot(walk[i][0] - walk[i - 1][0], walk[i][1] - walk[i - 1][1])); }
    const curve = distribute('path', 21, { d: 'M0 100 C30 -40 70 240 100 0' });
    curve.forEach((q, k) => {
      const s = (acc[N] * k) / 20, j = Math.max(1, acc.findIndex((a) => a >= s)), f = (s - acc[j - 1]) / (acc[j] - acc[j - 1]);
      const rx = walk[j - 1][0] + f * (walk[j][0] - walk[j - 1][0]), ry = walk[j - 1][1] + f * (walk[j][1] - walk[j - 1][1]);
      expect(Math.hypot(q.x - rx, q.y - ry), 'curve point ' + k).toBeLessThan(0.1);
    });
  });

  it('KN-100 for an unknown kind, a bad n and each bad option, with the call and the value', async () => {
    const { wf } = await load();
    const { distribute } = wf.kinetic;
    const bad = [
      ['ring', 3, {}], [42, 3, {}], ['line', -1, { from: [0, 0], to: [1, 1] }], ['line', 1.5, { from: [0, 0], to: [1, 1] }],
      ['line', 3, { from: [0], to: [1, 1] }], ['line', 3, { from: [0, 0] }], ['line', 3, { from: [0, NaN], to: [1, 1] }],
      ['circle', 3, { cx: 0, cy: 0 }], ['circle', 3, { cx: 0, cy: 0, radius: 0 }], ['circle', 3, { cx: 'a', cy: 0, radius: 5 }], ['circle', 3, { cx: 0, cy: 0, radius: 5, from: NaN }],
      ['grid', 3, { cell: 10 }], ['grid', 3, { columns: 0, cell: 10 }], ['grid', 3, { columns: 2 }], ['grid', 3, { columns: 2, cell: [10] }],
      ['spiral', 3, {}], ['spiral', 3, { radius: -1 }],
      ['scatter', 3, { width: 10 }], ['scatter', 3, { width: 0, height: 10 }], ['scatter', 3, { width: 10, height: 10, seed: null }],
      ['path', 3, {}], ['path', 3, { d: 'L0 0' }], ['path', 3, { d: 'M0 0 Q' }],
    ];
    for (const args of bad) expect(() => distribute(...args), JSON.stringify(args)).toThrow(/KN-100/);
    expectKN(() => distribute('ring', 3, {}), 'KN-100', 'distribute(kind)', /^kind is 'line', 'circle', 'grid', 'spiral', 'scatter' or 'path', not "ring"/);
    expectKN(() => distribute('line', 1.5, {}), 'KN-100', "distribute('line', n)", /^n is a whole number, 0 or more, not 1.5/);
    expectKN(() => distribute('circle', 3, { cx: 0, cy: 0, radius: 0 }), 'KN-100', "distribute('circle', n, { radius })", /radius .*not 0/);
    expectKN(() => distribute('path', 3, { d: 'M0 0 Q' }), 'KN-100', "distribute('path', n, { d })", /path data/);
  });
});

describe(`falloff (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('radial: 1 at the centre and out to inner, 0 at radius and past it, straight between, then eased; invert turns it over', async () => {
    const { wf } = await load();
    const { falloff, ease } = wf.kinetic;
    const f = (x, o) => falloff('radial', { x, y: 0 }, Object.assign({ x: 0, y: 0, radius: 100 }, o));
    close([0, 25, 50, 100, 150].map((x) => f(x)), [1, 0.75, 0.5, 0, 0], 'linear');
    close([0, 20, 60, 100].map((x) => f(x, { inner: 20 })), [1, 1, 0.5, 0], 'inner');
    close([f(50, { ease: 'power2.in' })], [ease('power2.in')(0.5)], 'eased');
    close([0, 50, 100].map((x) => f(x, { invert: true })), [0, 0.5, 1], 'invert');
    // A point as [x, y] or as an object with x and y, such as distribute() gives.
    expect(falloff('radial', [30, 40], { x: 0, y: 0, radius: 100 })).toBeCloseTo(0.5, 9);
  });

  it('an ease that overshoots, or a spring, keeps the weight from 0 to 1', async () => {
    const { wf } = await load();
    const { falloff } = wf.kinetic;
    for (const ease of ['back.out', 'back.in', 'elastic.out', 'spring']) {
      const w = Array.from({ length: 100 }, (_, i) => falloff('radial', [i, 0], { x: 0, y: 0, radius: 100, ease }));
      expect(Math.max(...w), ease).toBeLessThanOrEqual(1);
      expect(Math.min(...w), ease).toBeGreaterThanOrEqual(0);
    }
  });

  it('linear: an edge through (x, y) heading toward angle; 1 behind it, 0 more than width ahead', async () => {
    const { wf } = await load();
    const { falloff } = wf.kinetic;
    const right = (x) => falloff('linear', { x, y: 7 }, { x: 100, y: 0, angle: 0, width: 50 });
    close([0, 100, 125, 150, 300].map(right), [1, 1, 0.5, 0, 0], 'heading right');
    const down = (y) => falloff('linear', { x: 3, y }, { x: 0, y: 100, angle: 90, width: 20 });
    close([90, 100, 110, 120].map(down), [1, 1, 0.5, 0], 'heading down');
  });

  it('band: 1 on the line through (x, y) across angle, 0 at width either side; ring: 1 at radius from (x, y), 0 at width either side', async () => {
    const { wf } = await load();
    const { falloff } = wf.kinetic;
    const band = (x) => falloff('band', { x, y: 50 }, { x: 100, y: 0, angle: 0, width: 40 });
    close([60, 80, 100, 120, 140, 200].map(band), [0, 0.5, 1, 0.5, 0, 0], 'band');
    const ring = (r) => falloff('ring', { x: r, y: 0 }, { x: 0, y: 0, radius: 100, width: 20 });
    close([0, 80, 90, 100, 110, 120].map(ring), [0, 0, 0.5, 1, 0.5, 0], 'ring');
  });

  it('shape: 1 inside the path, fading to 0 at width outside its edge, moved by x and y and sized by scale; nonzero by default, evenodd on request', async () => {
    const { wf } = await load();
    const { falloff } = wf.kinetic;
    const SQ = 'M0 0 H100 V100 H0 Z';
    const f = (x, y, o) => falloff('shape', { x, y }, Object.assign({ d: SQ, width: 20 }, o));
    close([f(50, 50), f(0, 50), f(110, 50), f(120, 50), f(200, 50)], [1, 1, 0.5, 0, 0], 'square');
    close([f(-10, -10)], [Math.max(0, 1 - Math.hypot(10, 10) / 20)], 'nearest the corner');
    close([f(250, 250, { x: 200, y: 200 }), f(150, 250, { x: 200, y: 200 })], [1, 0], 'moved');
    close([f(150, 150, { scale: 2 }), f(210, 100, { scale: 2 })], [1, 0.5], 'scaled: width is in the page\'s px');
    close([f(10, 50, { width: 0 }), f(101, 50, { width: 0 })], [1, 0], 'a hard edge');
    // A square with a square hole drawn the same way round: nonzero fills the hole, evenodd leaves it.
    const holed = SQ + ' M25 25 H75 V75 H25 Z';
    expect(falloff('shape', { x: 50, y: 50 }, { d: holed, width: 0 })).toBe(1);
    expect(falloff('shape', { x: 50, y: 50 }, { d: holed, width: 0, rule: 'evenodd' })).toBe(0);
    expect(falloff('shape', { x: 10, y: 50 }, { d: holed, width: 0, rule: 'evenodd' })).toBe(1);
  });

  it('KN-100 for an unknown kind, a point without x and y and each bad option', async () => {
    const { wf } = await load();
    const { falloff } = wf.kinetic;
    const P = { x: 0, y: 0 };
    const bad = [
      ['sphere', P, { x: 0, y: 0, radius: 1 }], ['radial', null, { x: 0, y: 0, radius: 1 }], ['radial', { x: 1 }, { x: 0, y: 0, radius: 1 }], ['radial', [1], { x: 0, y: 0, radius: 1 }],
      ['radial', P, { x: 0, y: 0 }], ['radial', P, { x: 0, y: 0, radius: 0 }], ['radial', P, { x: 0, y: 0, radius: 10, inner: 10 }], ['radial', P, { x: 'a', y: 0, radius: 1 }],
      ['linear', P, { x: 0, y: 0, width: 10 }], ['linear', P, { x: 0, y: 0, angle: 0, width: 0 }],
      ['band', P, { x: 0, y: 0, angle: 0 }], ['ring', P, { x: 0, y: 0, radius: -1, width: 5 }], ['ring', P, { x: 0, y: 0, radius: 5, width: 0 }],
      ['shape', P, { width: 5 }], ['shape', P, { d: 'M0 0 Q', width: 5 }], ['shape', P, { d: 'M0 0 H1 V1 Z', width: -1 }], ['shape', P, { d: 'M0 0 H1 V1 Z', scale: 0 }], ['shape', P, { d: 'M0 0 H1 V1 Z', rule: 'odd' }],
      ['radial', P, { x: 0, y: 0, radius: 1, invert: 'yes' }],
    ];
    for (const args of bad) expect(() => falloff(...args), JSON.stringify(args)).toThrow(/KN-100/);
    expect(() => falloff('radial', P, { x: 0, y: 0, radius: 1, ease: 'nope' })).toThrow(/KN-121/);
    expectKN(() => falloff('sphere', P, {}), 'KN-100', 'falloff(kind)', /^kind is 'radial', 'linear', 'band', 'ring' or 'shape', not "sphere"/);
    expectKN(() => falloff('radial', { x: 1 }, { x: 0, y: 0, radius: 1 }), 'KN-100', "falloff('radial', point)", /^point is \{ x, y \} or \[x, y\]/);
    expectKN(() => falloff('radial', P, { x: 0, y: 0, radius: 10, inner: 10 }), 'KN-100', "falloff('radial', point, { inner })", /inner .*below radius/);
  });
});
