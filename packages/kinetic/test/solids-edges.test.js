/**
 * kinetic.25d.js: solids at the edges of their arguments. A shape scaled to
 * 0 on any axis draws nothing and throws nothing, through a scale animated
 * from 0 to 1, and a mirrored shape draws as its mirror does; a face that
 * crosses the near plane has its gradient on the part that is drawn, its lit
 * end toward the light; and every option of the stage, of add() and of
 * set() is checked, KN-100 naming the option, so a wrong kind never reaches
 * the SVG as NaN or a TypeError from draw().
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

// The faces drawn, in the order they are painted, the slots left blank out.
const drawn = (g) => [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')]
  .map((s) => ({ d: s.querySelector('path').getAttribute('d'), opacity: Number(s.getAttribute('opacity')) }))
  .filter((f) => f.d);
// Each drawn face's path and its gradient's stops, for comparing two stages.
const shaded = (g) => [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')]
  .filter((s) => s.querySelector('path').getAttribute('d'))
  .map((s) => { const id = /url\(#(.+)\)/.exec(s.querySelector('path').getAttribute('fill'))[1]; return s.querySelector('path').getAttribute('d') + ' ' + [...g.querySelector('#' + CSS.escape(id)).children].map((c) => c.getAttribute('stop-color')).join(' '); });
const ys = (d) => d.slice(1).split(' L').map((p) => Number(p.trim().split(' ')[1]));
const NOT_A_NUMBER = /NaN|Infinity|undefined/;

describe(`kinetic.25d.js: solids at the edges (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a shape scaled to 0 on any axis draws nothing and throws nothing; a scale animated from 0 to 1 draws nothing, then the shape', async () => {
    const solids = await solidsLoaded();
    for (const scale of [0, [1, 1, 0], [0, 1, 1]]) {
      const g = canvas();
      const stage = solids(g, { glows: [{ dir: [0, 0, 1], color: '#ff0000', bleed: {} }] }).add('a', solids.box({ size: 1 })).set('a', { scale, rotate: [20, 30, 0] });
      expect(() => stage.draw(), 'scale ' + JSON.stringify(scale)).not.toThrow();
      expect(drawn(g), 'scale ' + JSON.stringify(scale)).toEqual([]);
      expect(g.innerHTML).not.toMatch(NOT_A_NUMBER);
    }
    const g = canvas();
    const stage = solids(g).add('a', solids.box({ size: 1 }));
    for (const s of [0, 1e-300, 1e-12, 1e-6, 0.25, 1]) {
      stage.set('a', { scale: s, rotate: [20, 30, 0] });
      expect(() => stage.draw(), 'scale ' + s).not.toThrow();
      expect(g.innerHTML, 'scale ' + s).not.toMatch(NOT_A_NUMBER);
    }
    expect(drawn(g).length).toBe(3);
  });

  it('a mirrored shape draws as its mirror: a box scaled [-1, 1, 1] draws and shades as the box at 1', async () => {
    const solids = await solidsLoaded();
    const a = canvas(), b = canvas();
    solids(a).add('box', solids.box({ size: 1 })).set('box', { rotate: [20, 30, 10] }).draw();
    solids(b).add('box', solids.box({ size: 1 })).set('box', { rotate: [20, 30, 10], scale: [-1, 1, 1] }).draw();
    expect(shaded(b)).toEqual(shaded(a));
    expect(shaded(a).length).toBe(3);
  });

  it('a face that crosses the near plane: its gradient lies on the part drawn, the lit end toward the light', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    // A floor from z = -5 to 5 below the eye at 5, lit from in front: the end
    // toward the light is the near edge, at the bottom of the frame.
    solids(g, { camera: { distance: 5, focal: 400 }, light: { dir: [0, 0.5, 1], ramp: ['#000000', '#ffffff'] }, rim: false })
      .add('floor', solids.faces([{ pts: [[-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]], n: [0, 1, 0] }]))
      .set('floor', { position: [0, -1, 0] })
      .draw();
    const [face] = drawn(g);
    const top = Math.min(...ys(face.d)), bottom = Math.max(...ys(face.d));
    const grad = g.querySelector('linearGradient');
    const [y1, y2] = ['y1', 'y2'].map((k) => Number(grad.getAttribute(k)));
    expect(Number.isFinite(y1) && Number.isFinite(y2)).toBe(true);
    expect(y1, 'the lit end on the face drawn (' + top + ' to ' + bottom + ')').toBeGreaterThanOrEqual(top - 1);
    expect(y1).toBeLessThanOrEqual(bottom + 1);
    expect(y1, 'the lit end nearer the eye than the dark end').toBeGreaterThan(y2);
  });

  it('KN-100 for each option of a wrong kind, naming it: the camera, the light, the rim, a glow and its bleed, add() and set()', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const cases = [
      [{ camera: { roll: '45' } }, 'solids({ camera: { roll } })'],
      [{ camera: { fade: NaN } }, 'solids({ camera: { fade } })'],
      [{ camera: { center: [540] } }, 'solids({ camera: { center } })'],
      [{ light: { gamma: 'x' } }, 'solids({ light: { gamma } })'],
      [{ light: { floor: '0.1' } }, 'solids({ light: { floor } })'],
      [{ light: { gain: null } }, 'solids({ light: { gain } })'],
      [{ light: { bounce: '0' } }, 'solids({ light: { bounce } })'],
      [{ light: { across: 0.2 } }, 'solids({ light: { across } })'],
      [{ rim: { width: '2px' } }, 'solids({ rim: { width } })'],
      [{ rim: { power: 'x' } }, 'solids({ rim: { power } })'],
      [{ glows: [{ dir: [0, 0, 1], color: '#ff0000', size: 'big' }] }, 'solids({ glows[0]: { size } })'],
      [{ glows: [{ dir: [0, 0, 1], color: '#ff0000', strength: '1' }] }, 'solids({ glows[0]: { strength } })'],
      [{ glows: [{ dir: [0, 0, 1], color: '#ff0000', bleed: { cap: '90' } }] }, 'solids({ glows[0]: { bleed: { cap } } })'],
    ];
    for (const [options, where] of cases) expectKN(() => solids(g, options), 'KN-100', where);
    const stage = solids(g);
    expectKN(() => stage.add('a', solids.box({ size: 1 }), { albedo: 'x' }), 'KN-100', 'solids: add("a").albedo');
    expectKN(() => stage.add('b', solids.box({ size: 1 }), { glow: NaN }), 'KN-100', 'solids: add("b").glow');
    stage.add('c', solids.box({ size: 1 }));
    expectKN(() => stage.set('c', { rotation: [0, 90, 0] }), 'KN-100', 'solids: set("c").rotation');
    expectKN(() => stage.set('c', { positon: [1, 0, 0] }), 'KN-100', 'solids: set("c").positon');
    // Nothing of a refused call is kept: the stage draws as before.
    expect(() => stage.draw()).not.toThrow();
    expect(g.innerHTML).not.toMatch(NOT_A_NUMBER);
  });
});
