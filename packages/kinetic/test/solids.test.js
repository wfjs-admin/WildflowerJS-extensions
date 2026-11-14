/**
 * kinetic.25d.js: wildflower.kinetic.solids, solids in 3D as numbers drawn
 * as SVG paths. Its shapes; a draw that culls the faces turned away, sorts
 * the rest far to near with a tie broken by place on screen, clips at the
 * near plane and fades there; draws that leave the same DOM for the same
 * values in any order; a cage a quarter turn on drawing the frame it started
 * from; the glows, their bleeds and the rim; and its KN-100 cases.
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

// The faces drawn, in the order they are painted: each slot's path data
// and its group's opacity, the slots left blank out.
const drawn = (g) => [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')]
  .map((s) => ({ d: s.querySelector('path').getAttribute('d'), opacity: Number(s.getAttribute('opacity')) }))
  .filter((f) => f.d);
const xs = (d) => d.slice(1).split(' L').map((p) => Number(p.split(' ')[0]));
const ys = (d) => d.slice(1).split(' L').map((p) => Number(p.trim().split(' ')[1]));
const meanOf = (a) => a.reduce((s, x) => s + x, 0) / a.length;

describe(`kinetic.25d.js: solids (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('is wildflower.kinetic.solids once kinetic.25d.js loads after kinetic.wf.js, with its shapes: a box of 6 faces, a cage of 72', async () => {
    const solids = await solidsLoaded();
    expect(typeof solids).toBe('function');
    expect(solids.box({ size: 1 }).faces.length).toBe(6);
    expect(solids.cage({ size: 2, beam: 0.3 }).faces.length).toBe(8 * 3 + 12 * 4);
    const tri = solids.faces([{ pts: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }]);
    expect(tri.faces[0].n).toEqual([0, 0, 1]);
  });

  it('draws the faces turned toward the eye, far first: one face of a cube seen square on, three of one turned, the nearest painted last', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, { camera: { distance: 5, focal: 400 } }).add('cube', solids.box({ size: 1 })).draw();
    expect(drawn(g).length).toBe(1);
    // Centered: the square's middle is the viewBox's.
    const [f] = drawn(g);
    expect(meanOf(xs(f.d))).toBeCloseTo(200, 0);
    stage.set('cube', { rotate: [30, 40, 0] }).draw();
    const faces = drawn(g);
    expect(faces.length).toBe(3);
    // The face nearest the eye: the one whose projected area is largest here, painted last.
    const area = (d) => { const x = xs(d), y = ys(d); let a = 0; for (let i = 0; i < x.length; i++) { const j = (i + 1) % x.length; a += x[i] * y[j] - x[j] * y[i]; } return Math.abs(a / 2); };
    expect(area(faces[2].d)).toBeGreaterThan(area(faces[0].d));
  });

  it('the same values draw the same DOM, whatever was drawn before: a slot used and then not used is blanked', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, { camera: { distance: 6, focal: 400 }, glows: [{ dir: [-0.5, 0.5, 0.7], color: '#ff00aa', bleed: {} }] });
    stage.add('a', solids.cage({ size: 2, beam: 0.3 })).add('b', solids.box({ size: 0.6 }));
    const at = (p) => { stage.set('a', { rotate: [90 * p, 20 * p, 0] }).set('b', { rotate: [0, -90 * p, 10], opacity: 1 - p / 2 }); stage.draw(); return g.innerHTML; };
    const first = at(0.3);
    at(0.9); at(0); at(0.55);
    expect(at(0.3)).toBe(first);
    // Taken off the stage, its slots go blank.
    stage.remove('a').remove('b').draw();
    expect(drawn(g)).toEqual([]);
    expect([...g.querySelectorAll('circle')].every((c) => c.getAttribute('opacity') === '0')).toBe(true);
  });

  it('a cage a quarter turn on draws the frame it started from: a tie is broken by place on screen, never by which face, and the glows close too', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, { camera: { distance: 4, focal: 500, roll: 45 }, glows: [{ dir: [-0.85, 0.3, 0.45], color: '#ff5ce6', bleed: { size: 1.4, strength: 0.1, cap: 90 } }] });
    stage.add('cage', solids.cage({ size: 2, beam: 0.26 }));
    const frame = (deg) => { stage.set('cage', { rotate: [deg, 0, 0] }).draw(); return g.innerHTML.replace(/-0(?=[ ")])/g, '0'); };
    const start = frame(0);
    const end = frame(90);
    let i = 0;
    while (i < start.length && start[i] === end[i]) i++;
    expect(end, 'first difference at ' + i + ': ' + start.slice(i - 80, i + 40) + ' | ' + end.slice(i - 80, i + 40)).toBe(start);
  });

  it('the near plane: a face that crosses it is clipped there, and with fade it thins out near it', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, { camera: { distance: 5, focal: 400, near: 0.5, fade: 1 } }).add('slab', solids.box({ size: [1, 1, 4] }));
    // From z = 3.2 to 7.2, past the eye at 5: its inner side face crosses the near plane at 4.5.
    stage.set('slab', { position: [0.8, 0, 5.2], rotate: [0, 0, 0] }).draw();
    const faces = drawn(g);
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) for (const v of [...xs(f.d), ...ys(f.d)]) expect(Number.isFinite(v)).toBe(true);
    // Nearer than near + fade (1.5 from the eye): thinner than full.
    expect(Math.min(...faces.map((f) => f.opacity))).toBeLessThan(1);
    // Far off, with the same fade: full.
    stage.set('slab', { position: [0, 0, -4] }).draw();
    expect(drawn(g).every((f) => f.opacity === 1)).toBe(true);
  });

  it('shading: a face toward the light is lighter than one turned from it; a glow on a face that catches its light, its bleed in a layer above the faces, and the rim brighter edge-on', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, {
      camera: { distance: 5, focal: 400 },
      light: { dir: [0, 0, 1], ramp: ['#000000', '#ffffff'], gamma: 1, floor: 0, gain: 1 },
      rim: { color: '#ffffff', width: 2, base: 0.1, edge: 0.6, power: 1 },
      glows: [{ dir: [0, 0, 1], color: '#ff0000', sharp: 1, bleed: { size: 1.5, strength: 0.5 } }],
    });
    stage.add('cube', solids.box({ size: 1 })).set('cube', { rotate: [0, 35, 0] }).draw();
    const slots = [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')].filter((s) => s.querySelector('path').getAttribute('d'));
    expect(slots.length).toBe(2);
    const mid = (s) => { const id = /url\(#(.+)\)/.exec(s.querySelector('path').getAttribute('fill'))[1]; return g.querySelector('#' + CSS.escape(id)).children[1].getAttribute('stop-color'); };
    const level = (c) => Number(/rgb\((\d+)/.exec(c)[1]);
    // Turned 35 degrees: the front face (normal 35 degrees off the light) lighter than the side (55 off).
    const [side, front] = slots;
    expect(level(mid(front))).toBeGreaterThan(level(mid(side)));
    expect(Number(front.querySelector('circle').getAttribute('opacity'))).toBeGreaterThan(0.3);
    const bleedLayer = g.querySelector('[data-solids]').children[2];
    expect([...bleedLayer.children].some((c) => Number(c.getAttribute('opacity')) > 0)).toBe(true);
    const rimOf = (s) => Number(s.querySelectorAll('path')[1].getAttribute('stroke-opacity'));
    expect(rimOf(side)).toBeGreaterThan(rimOf(front));
  });

  it('KN-100: a target that is no SVG element, a size or beam out of range, a ramp that is no colors, an unknown name in set(), a bad rotate', async () => {
    const solids = await solidsLoaded();
    expectKN(() => solids(document.createElement('div')), 'KN-100', 'solids(target)');
    expectKN(() => solids.box({ size: 0 }), 'KN-100', 'solids.box({ size })');
    expectKN(() => solids.cage({ size: 1, beam: 2 }), 'KN-100', 'solids.cage({ beam })');
    const g = canvas();
    expectKN(() => solids(g, { light: { ramp: ['red', 'blue'] } }), 'KN-100', 'solids({ light: { ramp } })');
    const stage = solids(g).add('a', solids.box({ size: 1 }));
    expectKN(() => stage.set('b', {}), 'KN-100', 'solids: set("b")');
    expectKN(() => stage.set('a', { rotate: 90 }), 'KN-100', 'solids: set("a").rotate');
    expectKN(() => stage.add('c', { faces: [] }), 'KN-100', 'solids: add("c")');
  });
});
