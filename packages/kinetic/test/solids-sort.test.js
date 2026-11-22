/**
 * kinetic.25d.js: the order faces are painted in. A shape wholly on the
 * eye's side of a face's plane is painted after that face, however far to
 * the side it sits; faces that tell nothing about each other keep the order
 * of their distances; and the same values draw the same DOM, whatever was
 * drawn before.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, loadScript, BUILD, CORE_TIER } from './helpers.js';

const SOLIDS_FILE = typeof __KINETIC_SOLIDS_FILE__ !== 'undefined' ? __KINETIC_SOLIDS_FILE__ : '/packages/kinetic/dist/kinetic.25d.js';
const NS = 'http://www.w3.org/2000/svg';
const cleanup = [];
const stages = [];
afterEach(() => {
  for (const s of stages.splice(0)) s.dispose();
  for (const el of cleanup.splice(0)) el.remove();
});

let ready = null;
function solidsLoaded() {
  if (!ready) ready = (async () => { const { wf } = await load(); await loadScript(SOLIDS_FILE); return wf.kinetic.solids; })();
  return ready;
}

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

const VIEW = { camera: { distance: 5, focal: 400 }, rim: false };
const WALL = '#102030', SHAPE = '#d04020', OTHER = '#20a040';
// The colors painted, in order: each drawn slot's flat fills, a color named once however many faces carry it.
const slotsOf = (g) => [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')].filter((s) => s.getAttribute('opacity') !== '0' && [...s.querySelectorAll('path')].some((p) => p.getAttribute('d')));
const fillsOf = (s) => [...s.querySelectorAll('path')].filter((p) => p.getAttribute('d')).map((p) => p.getAttribute('fill')).filter((c) => [WALL, SHAPE, OTHER].includes(c));
const paint = (g) => { const out = []; for (const s of slotsOf(g)) for (const c of fillsOf(s)) if (out[out.length - 1] !== c) out.push(c); return out; };
const markup = (g) => g.innerHTML.replace(/kns\d+-/g, 'kns-');

describe(`kinetic.25d.js: the order faces are painted in (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a box in front of a large wall, off to the side, is painted after the wall', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW);
    stages.push(stage);
    stage.add('wall', solids.plane({ size: 12 }), { color: WALL }).set('wall', { position: [0, 0, -1] });
    stage.add('box', solids.box({ size: 0.3 }), { color: SHAPE });
    // Nearer the eye than the wall along the view, farther from the eye than the wall's middle.
    for (const x of [-2, 0, 2]) {
      stage.set('box', { position: [x, 0, -0.8], rotate: [25, 35, 0] }).draw();
      expect(paint(g), 'box at x ' + x).toEqual([WALL, SHAPE]);
    }
  });

  it('a sphere in front of a large wall, off to the side, is painted after the wall', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW);
    stages.push(stage);
    stage.add('wall', solids.plane({ size: 12 }), { color: WALL }).set('wall', { position: [0, 0, -1] });
    stage.add('ball', solids.sphere({ radius: 0.15 }), { color: SHAPE });
    for (const x of [-2, 0, 2]) {
      stage.set('ball', { position: [x, 0, -0.8] }).draw();
      const order = slotsOf(g).map((s) => (fillsOf(s).includes(WALL) ? 'wall' : 'ball'));
      expect(order, 'ball at x ' + x).toEqual(['wall', 'ball']);
    }
  });

  it('a box standing on a floor that tilts away is painted after the floor, at its near end and its far end', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW);
    stages.push(stage);
    // A floor seen from above: its far end is farther from the eye than its middle.
    stage.add('floor', solids.plane({ size: 6 }), { color: WALL }).set('floor', { rotate: [-70, 0, 0], position: [0, -1, 0] });
    stage.add('rig', solids.null()).set('rig', { rotate: [-70, 0, 0], position: [0, -1, 0] });
    stage.add('box', solids.box({ size: 0.4 }), { color: SHAPE, parent: 'rig' });
    for (const y of [-2.5, 0, 1.5]) {
      stage.set('box', { position: [0, y, 0.2] }).draw();
      expect(paint(g), 'box at ' + y + ' along the floor').toEqual([WALL, SHAPE]);
    }
  });

  it("with the drop shadow on, a face that does not meet the floor on screen is still painted after it, to shadow it", async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, { ...VIEW, dropShadow: { blur: 4, offset: [0, 20] } });
    stages.push(stage);
    stage.add('floor', solids.plane({ size: 6 }), { color: WALL, casts: 0 }).set('floor', { rotate: [-70, 0, 0], position: [0, -1, 0] });
    stage.add('rig', solids.null()).set('rig', { rotate: [-70, 0, 0], position: [0, -1, 0] });
    stage.add('box', solids.box({ size: 0.4 }), { color: SHAPE, parent: 'rig' });
    // At the floor's far end the box's top is above the floor's far edge on screen.
    stage.set('box', { position: [0, 2.5, 0.2] }).draw();
    expect(paint(g)).toEqual([WALL, SHAPE]);
  });

  it('a shape behind the wall is painted before it, and two walls with a shape between them paint far to near', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW);
    stages.push(stage);
    stage.add('back', solids.plane({ size: 12 }), { color: WALL }).set('back', { position: [0, 0, -1] });
    stage.add('pane', solids.plane({ size: [1, 1] }), { color: OTHER }).set('pane', { position: [2, 0, -0.6] });
    stage.add('box', solids.box({ size: 0.2 }), { color: SHAPE }).set('box', { position: [2, 0, -0.8], rotate: [25, 35, 0] });
    stage.draw();
    expect(paint(g)).toEqual([WALL, SHAPE, OTHER]);
    stage.set('box', { position: [2, 0, -1.3] }).draw();
    expect(paint(g)).toEqual([SHAPE, WALL, OTHER]);
  });

  it('two faces that do not overlap on screen keep the order of their distances, whatever their planes say', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW);
    stages.push(stage);
    // A pane in front of the wall's plane, beside the wall on screen, its middle the farther of the two.
    stage.add('wall', solids.plane({ size: 2 }), { color: WALL }).set('wall', { position: [0, 0, -1] });
    stage.add('pane', solids.plane({ size: 0.4 }), { color: SHAPE }).set('pane', { position: [1.9, 0, -0.8] });
    stage.draw();
    expect(paint(g)).toEqual([SHAPE, WALL]);
    // Moved over the wall, it is painted after it.
    stage.set('pane', { position: [0.7, 0, -0.8] }).draw();
    expect(paint(g)).toEqual([WALL, SHAPE]);
  });

  it('faces that cut through each other keep the order of their distances, and order still overrides depth', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW);
    stages.push(stage);
    // Two planes crossing in an X, the second's middle nearer the eye.
    stage.add('a', solids.plane({ size: 2 }), { color: WALL }).set('a', { rotate: [0, 40, 0] });
    stage.add('b', solids.plane({ size: 2 }), { color: SHAPE }).set('b', { rotate: [0, -40, 0], position: [0, 0, 0.1] });
    stage.draw();
    expect(paint(g)).toEqual([WALL, SHAPE]);
    // A wall of a higher order than the box in front of it is painted over the box.
    stage.remove('a').remove('b');
    stage.add('wall', solids.plane({ size: 12 }), { color: WALL, order: 1 }).set('wall', { position: [0, 0, -1] });
    stage.add('box', solids.box({ size: 0.3 }), { color: SHAPE }).set('box', { position: [2, 0, -0.8], rotate: [25, 35, 0] });
    stage.draw();
    expect(paint(g)).toEqual([SHAPE, WALL]);
  });

  it('three planes that each overlap the next in a ring are drawn, the same DOM whatever was drawn before', async () => {
    const solids = await solidsLoaded();
    const one = canvas(), two = canvas();
    const ring = (stage) => {
      [WALL, SHAPE, OTHER].forEach((color, i) => stage.add('p' + i, solids.plane({ size: [2.4, 0.5] }), { color }));
      return stage;
    };
    const place = (stage, t) => {
      for (let i = 0; i < 3; i++) stage.set('p' + i, { rotate: [20, 0, i * 120 + t], position: [Math.cos((i * 2 * Math.PI) / 3) * 0.5, Math.sin((i * 2 * Math.PI) / 3) * 0.5, 0] });
      return stage;
    };
    const a = ring(solids(one, VIEW)), b = ring(solids(two, VIEW));
    stages.push(a, b);
    place(a, 0).draw();
    for (const t of [50, 170, 20]) place(b, t).draw();
    place(b, 0).draw();
    expect(paint(one).length).toBe(3);
    expect(markup(two)).toBe(markup(one));
  });

  it("the drop shadow falls from the shape onto the wall behind it, off to the side as in the middle", async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, { ...VIEW, dropShadow: { blur: 4, offset: [6, 8] } });
    stages.push(stage);
    stage.add('wall', solids.plane({ size: 12 }), { color: WALL, casts: 0 }).set('wall', { position: [0, 0, -1] });
    stage.add('box', solids.box({ size: 0.3 }), { color: SHAPE });
    // The shadow groups that hold an outline, in the wall's slot.
    const cast = () => [...slotsOf(g)[0].querySelectorAll('[style*="multiply"] path')].filter((p) => p.getAttribute('d')).length;
    for (const x of [-2, 0, 2]) {
      stage.set('box', { position: [x, 0, -0.8], rotate: [25, 35, 0] }).draw();
      expect(fillsOf(slotsOf(g)[0]), 'box at x ' + x).toContain(WALL);
      expect(cast(), 'box at x ' + x).toBeGreaterThan(0);
    }
  });
});
