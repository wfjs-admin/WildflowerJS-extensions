/**
 * kinetic.25d.js: a shape's own gradient on a face that crosses the near
 * plane. The gradient's line is cut where it crosses the plane and its stops
 * re-spaced on the part kept, so it lies on the part of the face that is
 * drawn; a gradient wholly in front of the plane is written as it is.
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

const slotsOf = (g) => [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')].filter((s) => s.getAttribute('opacity') !== '0');
const gradientOf = (g, slot) => { const id = /url\(#(.+)\)/.exec(slot.querySelector('path').getAttribute('fill'))[1]; return g.querySelector('#' + CSS.escape(id)); };
const ends = (lg) => ['x1', 'y1', 'x2', 'y2'].map((k) => lg.getAttribute(k));
const stopsOf = (lg) => [...lg.children].map((s) => [s.getAttribute('offset'), s.getAttribute('stop-color'), s.getAttribute('stop-opacity')]);
const pointsOf = (d) => d.slice(1).replace(' Z', '').split(' L').map((p) => p.trim().split(' ').map(Number));
// The camera of these tests: center (200, 200), focal 400, eye at z = 5, near plane at z = 4.8.
const VIEW = { camera: { distance: 5, focal: 400, near: 0.2 } };

describe(`kinetic.25d.js: a shape's gradient at the near plane (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a floor under the camera: the gradient runs from its far edge to where the floor is cut, far color at the far edge', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    // A 20-unit floor one unit below the eye, from z = -10 to z = 10; its gradient black at the far edge, white at the near.
    const stage = solids(g, VIEW).add('floor', solids.plane({ size: 20 }), { color: { gradient: ['#000000', '#ffffff'], from: [0, 10], to: [0, -10] } });
    stages.push(stage);
    stage.set('floor', { rotate: [-90, 0, 0], position: [0, -1, 0] }).draw();
    const slot = slotsOf(g)[0], lg = gradientOf(g, slot);
    const [x1, y1, x2, y2] = ends(lg).map(Number);
    for (const v of [x1, y1, x2, y2]) expect(Number.isFinite(v)).toBe(true);
    // The far edge, z = -10, is at y = 200 + 400 / 15; the cut, z = 4.8, at y = 200 + 400 / 0.2.
    expect(x1).toBeCloseTo(200, 0); expect(y1).toBeCloseTo(200 + 400 / 15, 0);
    expect(x2).toBeCloseTo(200, 0); expect(y2).toBeCloseTo(2200, 0);
    // Both ends within the drawn face's extent on screen.
    const pts = pointsOf(slot.querySelector('path').getAttribute('d')), ys = pts.map((p) => p[1]);
    for (const y of [y1, y2]) { expect(y).toBeGreaterThanOrEqual(Math.min(...ys) - 1); expect(y).toBeLessThanOrEqual(Math.max(...ys) + 1); }
    // The far color at the far edge; at the cut, the color the gradient has there, 14.8 of its 20 units along.
    const stops = stopsOf(lg);
    expect(stops[0]).toEqual(['0', '#000000', '1']);
    expect(stops.length).toBe(2);
    expect(Number(stops[1][0])).toBe(1);
    expect(stops[1][1]).toBe('#bdbdbd');
  });

  it('the stops kept are re-spaced on the part in front, opacity included, and the near end may be either one', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    // The near end first this time: from z = 10 (cut at 4.8) to z = -10, with a stop at 0.5 (z = 0) and one at 0.1 (z = 8, behind).
    const stage = solids(g, VIEW).add('floor', solids.plane({ size: 20 }), { color: { gradient: [[0, '#ffffff00'], [0.1, '#ff0000'], [0.5, '#00ff00'], [1, '#0000ff']], from: [0, -10], to: [0, 10] } });
    stages.push(stage);
    stage.set('floor', { rotate: [-90, 0, 0], position: [0, -1, 0] }).draw();
    const lg = gradientOf(g, slotsOf(g)[0]);
    const [x1, y1, x2, y2] = ends(lg).map(Number);
    expect(x1).toBeCloseTo(200, 0); expect(y1).toBeCloseTo(2200, 0);
    expect(x2).toBeCloseTo(200, 0); expect(y2).toBeCloseTo(200 + 400 / 15, 0);
    // The cut is at 0.26 of the line: between the stops at 0.1 and 0.5, 0.4 of the way from red to green.
    const stops = stopsOf(lg);
    expect(stops.length).toBe(3);
    expect(stops[0]).toEqual(['0', '#996600', '1']);
    expect(Number(stops[1][0])).toBeCloseTo((0.5 - 0.26) / 0.74, 3); expect(stops[1][1]).toBe('#00ff00');
    expect(stops[2]).toEqual(['1', '#0000ff', '1']);
    // An end stop cut between two of differing opacity takes the opacity between them.
    stage.set('floor', { color: { gradient: [[0, '#ffffff00'], [1, '#000000']], from: [0, -10], to: [0, 10] } }).draw();
    const half = stopsOf(gradientOf(g, slotsOf(g)[0]));
    expect(half[0][0]).toBe('0'); expect(half[0][1]).toBe('#bdbdbd'); expect(Number(half[0][2])).toBeCloseTo(0.26, 2);
  });

  it('no NaN or Infinity in a gradient, wherever the shape is, an end at the eye or both behind the near plane', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW)
      .add('floor', solids.plane({ size: 20 }), { color: { gradient: ['#000000', '#ffffff'], from: [0, 10], to: [0, -5] } })
      .add('wall', solids.box({ size: 2 }), { color: { gradient: ['#ff0000', '#0000ff80'], from: [0, 40, 0], to: [0, 30, 1] } })
      .add('ball', solids.sphere({ radius: 0.5, wedges: 4 }), { color: { gradient: ['#ff0000', '#00ff00'], angle: 90 } });
    stages.push(stage);
    for (let z = -12; z <= 12; z += 0.25) {
      stage.set('floor', { rotate: [-90, 0, 0], position: [0, -1, z - 5] });
      stage.set('wall', { rotate: [-90, 0, 0], position: [0.5, -0.5, z] });
      stage.set('ball', { position: [0, 0, z / 3] });
      stage.draw();
      for (const lg of g.querySelectorAll('linearGradient')) {
        const text = [...lg.attributes, ...[...lg.children].flatMap((s) => [...s.attributes])].map((a) => a.value).join(' ');
        expect(text, 'z ' + z).not.toMatch(/NaN|Infinity/);
      }
    }
    // An end exactly at the eye's depth, z = 5.
    stage.set('floor', { rotate: [-90, 0, 0], position: [0, -1, 0] }).draw();
    expect(ends(gradientOf(g, slotsOf(g).find((s) => s.querySelector('path').getAttribute('d'))))).not.toContain('NaN');
  });

  it('a gradient wholly in front of the near plane is written as it is', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW)
      .add('b', solids.box({ size: 1 }), { color: { gradient: ['#102030', [0.4, '#a0b0c080'], '#ffffff'], angle: 30 } })
      .add('p', solids.plane({ size: 1.5 }), { color: { gradient: ['#ff0000', '#00ff00', '#0000ff'], from: [-0.5, 0.2], to: [0.6, -0.4, 0.3] } });
    stages.push(stage);
    stage.set('b', { rotate: [20, 30, 0], position: [-0.8, 0, 1] }).set('p', { rotate: [-50, 10, 0], position: [0.9, 0.2, 2] }).draw();
    const out = slotsOf(g).map((s) => { const lg = gradientOf(g, s); return [ends(lg), stopsOf(lg)]; });
    expect(out).toEqual(FRONT);
  });
});

// The markup this scene writes with its gradients clear of the near plane, taken from the drawing as it is.
const BOX = [['37.6', '243.4', '192.8', '161.7'], [['0', '#102030', '1'], ['0.4', '#a0b0c0', '0.5'], ['1', '#ffffff', '1']]];
const FRONT = [BOX, BOX, BOX, [['249.7', '157.1', '441.5', '173.6'], [['0', '#ff0000', '1'], ['0.5', '#00ff00', '1'], ['1', '#0000ff', '1']]]];
