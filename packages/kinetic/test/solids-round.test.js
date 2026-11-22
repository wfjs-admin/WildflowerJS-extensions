/**
 * kinetic.25d.js: solids.polygon, solids.prism, solids.pyramid and
 * solids.sphere; a sphere's outline, its wedges and bands painted in its
 * sides' colors, as a clip, and at the near plane; a glow's spread; and
 * their KN-100 cases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, loadScript, expectKN, BUILD, CORE_TIER } from './helpers.js';

const SOLIDS_FILE = typeof __KINETIC_SOLIDS_FILE__ !== 'undefined' ? __KINETIC_SOLIDS_FILE__ : '/packages/kinetic/dist/kinetic.25d.js';
const NS = 'http://www.w3.org/2000/svg';
const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

let ready = null;
function solidsLoaded() {
  if (!ready) ready = (async () => { const { wf } = await load(); await loadScript(SOLIDS_FILE); return wf.kinetic.solids; })();
  return ready;
}

// An SVG of 400 by 400 in the page and a <g> in it to draw into.
function canvas() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 400 400');
  svg.setAttribute('width', '400');
  svg.setAttribute('height', '400');
  const g = document.createElementNS(NS, 'g');
  svg.appendChild(g);
  document.body.appendChild(svg);
  cleanup.push(svg);
  return g;
}

// The slots in paint order: a face's slot has its path's d, a sphere's its rim's (the outline).
const slotsOf = (g) => [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')].filter((s) => s.getAttribute('opacity') !== '0');
// A sphere slot's painted parts: [d, fill] for each with a path.
const partsOf = (s) => [...s.querySelectorAll('g[mask] > path')].filter((p) => p.getAttribute('d')).map((p) => [p.getAttribute('d'), p.getAttribute('fill')]);
const pointsOf = (d) => d.slice(1).replace(' Z', '').split(' L').map((p) => p.trim().split(' ').map(Number));
const VIEW = { camera: { distance: 5, focal: 400 } };
const outward = (f) => f.n[0] * f.pts.reduce((a, p) => a + p[0], 0) + f.n[1] * f.pts.reduce((a, p) => a + p[1], 0) + f.n[2] * f.pts.reduce((a, p) => a + p[2], 0);

describe(`kinetic.25d.js: polygons, prisms, pyramids and spheres (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('polygon: a flat regular polygon, its first corner straight up, with sides front and back', async () => {
    const solids = await solidsLoaded();
    const tri = solids.polygon({ sides: 3, radius: 2 });
    expect(tri.faces.length).toBe(1);
    const pts = tri.faces[0].pts;
    expect(pts.length).toBe(3);
    expect(pts[0][0]).toBeCloseTo(0, 9); expect(pts[0][1]).toBeCloseTo(2, 9);
    for (const p of pts) { expect(Math.hypot(p[0], p[1])).toBeCloseTo(2, 9); expect(p[2]).toBe(0); }
    expect([...tri.sides]).toEqual(['front', 'back']);
    expect(tri.flat).toBe(true);
    const g = canvas();
    solids(g, VIEW).add('hex', solids.polygon({ sides: 6, radius: 1 })).draw();
    expect(pointsOf(slotsOf(g)[0].querySelector('path').getAttribute('d')).length).toBe(6);
  });

  it('prism: front, back and n sides, each normal outward; taper 0 a point with no back', async () => {
    const solids = await solidsLoaded();
    const p = solids.prism({ sides: 5, radius: 1, depth: 0.4 });
    expect(p.faces.length).toBe(7);
    expect([...p.sides]).toEqual(['front', 'back', 'side']);
    for (const f of p.faces) expect(outward(f)).toBeGreaterThan(0);
    expect(p.faces[0].pts.every((q) => q[2] === 0.2)).toBe(true);
    // The back, tapered to half the front's size.
    const t = solids.prism({ sides: 4, radius: 1, depth: 1, taper: 0.5 });
    expect(Math.max(...t.faces[1].pts.map((q) => Math.hypot(q[0], q[1])))).toBeCloseTo(0.5, 9);
    const cone = solids.prism({ sides: 4, radius: 1, depth: 1, taper: 0 });
    expect(cone.faces.length).toBe(5);
    expect([...cone.sides]).toEqual(['front', 'side']);
    for (const f of cone.faces) expect(outward(f)).toBeGreaterThan(0);
    // Turned a little, its front and some sides face the eye.
    const g = canvas();
    solids(g, VIEW).add('p', p).set('p', { rotate: [20, 30, 0] }).draw();
    expect(slotsOf(g).length).toBeGreaterThan(2);
  });

  it('pyramid: standing on its base, height about the center, sides base and side', async () => {
    const solids = await solidsLoaded();
    const p = solids.pyramid({ sides: 4, radius: 1, height: 2 });
    expect(p.faces.length).toBe(5);
    expect([...p.sides]).toEqual(['base', 'side']);
    const base = p.faces.find((f) => f.side === 'base');
    expect(base.n).toEqual([0, -1, 0]);
    expect(base.pts.every((q) => q[1] === -1)).toBe(true);
    // The apex at the top, and a corner of the base toward the front.
    expect(Math.max(...p.faces.flatMap((f) => f.pts.map((q) => q[1])))).toBe(1);
    expect(Math.max(...base.pts.map((q) => q[2]))).toBeCloseTo(1, 9);
    for (const f of p.faces) expect(outward(f)).toBeGreaterThan(0);
    const g = canvas();
    solids(g, VIEW).add('p', p, { side: { base: { color: '#00ff00' } } }).set('p', { rotate: [-60, 0, 0] }).draw();
    expect(slotsOf(g).some((s) => s.querySelector('path').getAttribute('fill') === '#00ff00')).toBe(true);
  });

  it('sphere: one slot, its outline a circle of the projected radius, painted in its color under the mask of that outline', async () => {
    const solids = await solidsLoaded();
    const ball = solids.sphere({ radius: 0.5 });
    expect(ball.faces.length).toBe(0);
    expect(ball.ball).toBe(0.5);
    const g = canvas();
    solids(g, VIEW).add('b', ball, { color: '#ff0000' }).draw();
    const [s] = slotsOf(g);
    expect(slotsOf(g).length).toBe(1);
    const outline = pointsOf(s.querySelectorAll('path')[s.querySelectorAll('path').length - 1].getAttribute('d'));
    expect(outline.length).toBe(128);
    // Seen from 5 away, the outline's radius is r / sqrt(d^2 - r^2) times focal: about 40.2 px.
    const r = 400 * 0.5 / Math.sqrt(25 - 0.25);
    for (const q of outline) expect(Math.hypot(q[0] - 200, q[1] - 200)).toBeCloseTo(r, 0);
    // The face's own path is empty; its one part is the whole square, in its color.
    expect(s.querySelector('path').getAttribute('d')).toBe('');
    expect(partsOf(s).map((p) => p[1])).toEqual(['#ff0000']);
    const maskId = /url\(#(.+)\)/.exec(s.querySelector('g[mask]').getAttribute('mask'))[1];
    expect(pointsOf(g.querySelector('#' + CSS.escape(maskId) + ' path').getAttribute('d')).length).toBe(128);
  });

  it("sphere: wedges and bands paint their sides' colors, each side its own; side is a list", async () => {
    const solids = await solidsLoaded();
    const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
    const g = canvas();
    const stage = solids(g, VIEW).add('w', solids.sphere({ radius: 0.6, wedges: 4 }), { side: COLORS.map((color) => ({ color })) });
    stage.set('w', { rotate: [20, 30, 0] }).draw();
    const fills = new Set(partsOf(slotsOf(g)[0]).map((p) => p[1]));
    expect(fills.size).toBeGreaterThanOrEqual(3);
    for (const f of fills) expect(COLORS).toContain(f);
    const h = canvas();
    solids(h, VIEW).add('b', solids.sphere({ radius: 0.6, bands: 3 }), { side: [{ color: '#ff0000' }, { color: '#00ff00' }, { color: '#0000ff' }] })
      .set('b', { rotate: [20, 0, 0] }).draw();
    expect(new Set(partsOf(slotsOf(h)[0]).map((p) => p[1]))).toEqual(new Set(['#ff0000', '#00ff00', '#0000ff']));
    // Bands at the heights given, along x.
    const k = canvas();
    solids(k, VIEW).add('b', solids.sphere({ radius: 0.6, bands: [0.3, -0.3], along: 'x' }), { side: [{ color: '#ff0000' }, { color: '#00ff00' }, { color: '#0000ff' }] }).draw();
    expect(new Set(partsOf(slotsOf(k)[0]).map((p) => p[1]))).toEqual(new Set(['#ff0000', '#00ff00', '#0000ff']));
  });

  it('sphere: the same values draw the same DOM, a slot that held a sphere and then a face blanks its parts, and one reaching the near plane is not drawn', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW).add('w', solids.sphere({ radius: 0.6, wedges: 3 }), { side: [{ color: '#ff0000' }, { color: '#00ff00' }, { color: '#0000ff' }] });
    const at = (p) => { stage.set('w', { rotate: [90 * p, 40 * p, 0] }).draw(); return g.innerHTML; };
    const first = at(0.3);
    at(0.9); at(0); at(0.6);
    expect(at(0.3)).toBe(first);
    stage.remove('w').add('card', solids.plane({ size: 1 })).draw();
    expect(slotsOf(g).length).toBe(1);
    expect(partsOf(slotsOf(g)[0])).toEqual([]);
    expect(slotsOf(g)[0].querySelector('path').getAttribute('d')).not.toBe('');
    const h = canvas();
    solids(h, Object.assign({}, VIEW)).add('b', solids.sphere({ radius: 1 })).set('b', { position: [0, 0, 4.5] }).draw();
    expect(slotsOf(h)).toEqual([]);
  });

  it('sphere: it thins out as it nears the eye, as a face beside it at the same distance does', async () => {
    const solids = await solidsLoaded();
    const opacities = (z) => {
      const g = canvas();
      solids(g, { camera: { distance: 5, focal: 400, near: 0.2, fade: 1.4 }, rim: false })
        .add('ball', solids.sphere({ radius: 1 })).set('ball', { position: [-1.2, 0, z] })
        .add('card', solids.plane({ size: 2 })).set('card', { position: [1.2, 0, z + 1] })
        .draw();
      const out = {};
      for (const s of slotsOf(g)) out[s.querySelector('g[mask] path[d]:not([d=""])') ? 'ball' : 'card'] = +s.getAttribute('opacity');
      return out;
    };
    // Far from the eye both are whole; with the sphere's near side and the card both 0.5 from the near plane,
    // both are as thin as each other.
    expect(opacities(0)).toEqual({ ball: 1, card: 1 });
    const near = opacities(3.3);
    expect(near.ball).toBeGreaterThan(0);
    expect(near.ball).toBeLessThan(1);
    expect(near.ball).toBeCloseTo(near.card, 3);
  });

  it('a sphere under a parent scaled to 0, whole or on one axis, is not drawn, and no path holds NaN', async () => {
    const solids = await solidsLoaded();
    for (const scale of [0, [1, 1, 0], [0, 1, 1]]) {
      for (const split of [{ wedges: 4 }, { bands: 3 }, {}]) {
        const g = canvas();
        const stage = solids(g, VIEW).add('rig', solids.null()).add('b', solids.sphere(Object.assign({ radius: 0.5 }, split)), { parent: 'rig' }).add('c', solids.box({ size: 0.5 }), { parent: 'rig' });
        stage.set('rig', { scale });
        expect(() => stage.draw()).not.toThrow();
        expect(slotsOf(g).length).toBe(0);
        expect([...g.querySelectorAll('path')].filter((p) => /NaN/.test(p.getAttribute('d') || '')).length).toBe(0);
      }
    }
  });

  it('sphere as a clip: hidden, its outline is the clip of the shape it masks', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    solids(g, VIEW).add('m', solids.sphere({ radius: 0.5 }), { hidden: true }).add('card', solids.plane({ size: 2 }), { clip: 'm' }).draw();
    const [s] = slotsOf(g);
    expect(slotsOf(g).length).toBe(1);
    const clipId = /url\(#(.+)\)/.exec(s.getAttribute('clip-path'))[1];
    expect(pointsOf(g.querySelector('#' + CSS.escape(clipId) + ' path').getAttribute('d')).length).toBe(128);
  });

  it("a glow's spread moves it from the face's middle toward an edge as the face turns from the mirror, the other way below 0", async () => {
    const solids = await solidsLoaded();
    const glowX = (spread) => {
      const g = canvas();
      solids(g, Object.assign({ glows: [{ dir: [0, 0, 1], color: '#ffffff', spread }] }, VIEW))
        .add('card', solids.plane({ size: 1 })).set('card', { rotate: [0, 15, 0] }).draw();
      return Number(/matrix\((?:\S+ ){4}(\S+)/.exec(g.querySelector('circle').getAttribute('transform'))[1]);
    };
    const plus = glowX(30), minus = glowX(-30);
    expect(Math.sign(plus - 200)).toBe(-Math.sign(minus - 200));
    expect(Math.abs(plus - 200)).toBeGreaterThan(5);
    expect(Math.abs(minus - 200)).toBeGreaterThan(5);
  });

  it('KN-100: polygon, prism and pyramid, the sphere and its side, and a glow spread, each named', async () => {
    const solids = await solidsLoaded();
    expectKN(() => solids.polygon({ sides: 2, radius: 1 }), 'KN-100', 'solids.polygon({ sides })');
    expectKN(() => solids.polygon({ sides: 3.5, radius: 1 }), 'KN-100', 'solids.polygon({ sides })');
    expectKN(() => solids.polygon({ sides: 3, radius: 0 }), 'KN-100', 'solids.polygon({ radius })');
    expectKN(() => solids.prism({ sides: 3, radius: 1 }), 'KN-100', 'solids.prism({ depth })');
    expectKN(() => solids.prism({ sides: 3, radius: 1, depth: 1, taper: -1 }), 'KN-100', 'solids.prism({ taper })');
    expectKN(() => solids.prism({ radius: 1, depth: 1 }), 'KN-100', 'solids.prism({ sides })');
    expectKN(() => solids.pyramid({ sides: 4, radius: 1, height: 0 }), 'KN-100', 'solids.pyramid({ height })');
    expectKN(() => solids.pyramid({ sides: 4, radius: 'big', height: 1 }), 'KN-100', 'solids.pyramid({ radius })');
    expectKN(() => solids.sphere({}), 'KN-100', 'solids.sphere({ radius })');
    expectKN(() => solids.sphere({ radius: 1, wedges: 1 }), 'KN-100', 'solids.sphere({ wedges })');
    expectKN(() => solids.sphere({ radius: 1, wedges: 2, bands: 2 }), 'KN-100', 'solids.sphere({ wedges, bands })');
    expectKN(() => solids.sphere({ radius: 1, bands: [1.5] }), 'KN-100', 'solids.sphere({ bands })');
    expectKN(() => solids.sphere({ radius: 1, bands: 1 }), 'KN-100', 'solids.sphere({ bands })');
    expectKN(() => solids.sphere({ radius: 1, wedges: 3, around: 'w' }), 'KN-100', 'solids.sphere({ around })');
    expectKN(() => solids.sphere({ radius: 1, bands: 3, along: 1 }), 'KN-100', 'solids.sphere({ along })');
    const g = canvas();
    expectKN(() => solids(g, { glows: [{ dir: [0, 0, 1], color: '#fff', spread: '30' }] }), 'KN-100', 'solids({ glows[0]: { spread } })');
    const stage = solids(g, VIEW).add('b', solids.sphere({ radius: 1, wedges: 2 }));
    expectKN(() => stage.set('b', { side: { front: { color: '#ff0000' } } }), 'KN-100', 'solids: set("b").side');
    expectKN(() => stage.set('b', { side: [{}, {}, {}] }), 'KN-100', 'solids: set("b").side');
    expectKN(() => stage.set('b', { side: [{ color: 'red', glow: 1 }] }), 'KN-100', 'solids: set("b").side[0].glow');
    expectKN(() => stage.set('b', { shape: { wedges: 1 } }), 'KN-100', 'solids.sphere({ wedges })');
    expect(() => stage.set('b', { shape: { wedges: 3 } }).draw()).not.toThrow();
  });
});
