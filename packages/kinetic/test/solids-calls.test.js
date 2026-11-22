/**
 * kinetic.25d.js: calls at the edge of what they take. A face whose first
 * corners lie on one line still faces the way its corners wind; a color and
 * a side's color come off with null; and a call that cannot draw what it was
 * given says so (KN-100): corners all on one line, a gradient with one end,
 * a clip that names no shape.
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
const RED = '#d04020', BLUE = '#2040d0';
const markup = (g) => g.innerHTML.replace(/kns\d+-/g, 'kns-');
const fills = (g) => [...g.querySelectorAll('path')].filter((p) => p.getAttribute('d')).map((p) => p.getAttribute('fill')).filter((c) => c === RED || c === BLUE);
async function staged(build) {
  const solids = await solidsLoaded();
  const g = canvas(), stage = solids(g, VIEW);
  stages.push(stage);
  build(stage, solids);
  return { g, stage, solids };
}

describe(`kinetic.25d.js: calls at the edge of what they take (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a face whose first three corners lie on one line faces the way its corners wind', async () => {
    // A triangle with a corner on its bottom edge, wound toward the eye, then away from it.
    const pts = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [1, 1, 0]];
    const wound = await staged((stage, solids) => { stage.add('t', solids.faces([{ pts }]), { color: RED }).draw(); });
    const told = await staged((stage, solids) => { stage.add('t', solids.faces([{ pts, n: [0, 0, 1] }]), { color: RED }).draw(); });
    expect(fills(wound.g)).toEqual([RED]);
    expect(markup(wound.g)).toBe(markup(told.g));
    const away = await staged((stage, solids) => { stage.add('t', solids.faces([{ pts: pts.slice().reverse() }]), { color: RED }).draw(); });
    const toldAway = await staged((stage, solids) => { stage.add('t', solids.faces([{ pts: pts.slice().reverse(), n: [0, 0, -1] }]), { color: RED }).draw(); });
    expect(markup(away.g)).toBe(markup(toldAway.g));
  });

  it('corners that all lie on one line are no face (KN-100)', async () => {
    const solids = await solidsLoaded();
    expect(() => solids.faces([{ pts: [[0, 0, 0], [1, 0, 0], [2, 0, 0]] }])).toThrow(/KN-100/);
    expect(() => solids.faces([{ pts: [[0, 0, 0], [0, 0, 0], [1, 1, 0], [2, 2, 0]] }])).toThrow(/KN-100/);
    // Told which way it faces, the same corners are taken as they are.
    expect(() => solids.faces([{ pts: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], n: [0, 0, 1] }])).not.toThrow();
  });

  it('a gradient with one end of its line and not the other is refused (KN-100)', async () => {
    const { stage, solids } = await staged(() => {});
    const colors = ['#102030', '#d0e0f0'];
    expect(() => stage.add('a', solids.plane({ size: 1 }), { color: { gradient: colors, from: [0, 0] } })).toThrow(/KN-100/);
    stage.add('b', solids.plane({ size: 1 }), { color: { gradient: colors, from: [0, 0], to: [1, 0] } });
    expect(() => stage.set('b', { color: { gradient: colors, to: [1, 0] } })).toThrow(/KN-100/);
    expect(() => stage.set('b', { color: { gradient: colors, angle: 30 } }).draw()).not.toThrow();
  });

  it('a clip that names no shape is named at the draw (KN-100), and one added later is found', async () => {
    const { stage, solids } = await staged(() => {});
    stage.add('card', solids.plane({ size: 1 }), { color: RED, clip: 'window' });
    expect(() => stage.draw()).toThrow(/KN-100/);
    stage.add('window', solids.disc({ radius: 0.4 }), { hidden: true });
    expect(() => stage.draw()).not.toThrow();
    // With the clipped shape gone, a clip shape that goes too is missed by nothing.
    stage.remove('card').remove('window');
    expect(() => stage.draw()).not.toThrow();
  });

  it('a second add() of a name takes the place of the first, whose parts leave the page', async () => {
    const both = await staged((stage, solids) => {
      stage.add('a', solids.sphere({ radius: 0.6, wedges: 8 }), { color: RED }).draw();
      stage.add('a', solids.box({ size: 0.8 }), { color: BLUE }).set('a', { rotate: [20, 30, 0] }).draw();
    });
    const alone = await staged((stage, solids) => { stage.add('a', solids.box({ size: 0.8 }), { color: BLUE }).set('a', { rotate: [20, 30, 0] }).draw(); });
    expect(fills(both.g)).not.toContain(RED);
    expect(both.g.querySelectorAll('*').length).toBe(alone.g.querySelectorAll('*').length);
    expect(markup(both.g)).toBe(markup(alone.g));
  });

  it("null takes a shape's color off, and a side's", async () => {
    const plain = await staged((stage, solids) => { stage.add('b', solids.box({ size: 1 })).set('b', { rotate: [20, 30, 0] }).draw(); });
    const colored = await staged((stage, solids) => { stage.add('b', solids.box({ size: 1 }), { color: RED, side: { front: { color: BLUE } } }).set('b', { rotate: [20, 30, 0] }).draw(); });
    expect(fills(colored.g)).toContain(BLUE);
    expect(fills(colored.g)).toContain(RED);
    colored.stage.set('b', { side: { front: { color: null } } }).draw();
    expect(fills(colored.g)).not.toContain(BLUE);
    expect(fills(colored.g)).toContain(RED);
    colored.stage.set('b', { color: null }).draw();
    expect(markup(colored.g)).toBe(markup(plain.g));
  });
});
