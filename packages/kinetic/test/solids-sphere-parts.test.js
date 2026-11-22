/**
 * kinetic.25d.js: a sphere's parts belong to the sphere. Its paths and
 * their gradients are one group, put into whichever slot the sphere sorts
 * to, so a stage holds them once per sphere, not once per face; and the same
 * values still draw the same DOM, whatever was drawn before.
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

const OPTIONS = {
  camera: { distance: 8, focal: 400 },
  rim: { color: '#ffffff', width: 1.5 },
  glows: [{ dir: [-0.3, 0.5, 0.8], color: '#ffeedd', bleed: { size: 1.7, strength: 0.2 } }],
};
// The stage's markup, its id prefix taken out, so two stages compare.
const markup = (g) => g.innerHTML.replace(/kns\d+-/g, 'kns-');
const count = (g) => g.querySelectorAll('*').length;
const sliced = (n) => ({ color: '#808080', side: Array.from({ length: n }, (_, i) => ({ color: i % 2 ? '#d04020' : '#2040d0' })) });

// Twenty boxes in a grid, each turned to show three faces.
function boxes(solids, stage, n = 20) {
  for (let i = 0; i < n; i++) {
    stage.add('b' + i, solids.box({ size: 0.5 }));
    stage.set('b' + i, { rotate: [25, 35 + i * 7, 0], position: [(i % 5) - 2, Math.floor(i / 5) - 1.5, -(i % 3) * 0.4] });
  }
  return stage;
}

describe(`kinetic.25d.js: a sphere's parts live with the sphere (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('twenty boxes and a sphere of 32 wedges: under 2,000 elements, the sphere adding about what one sphere needs', async () => {
    const solids = await solidsLoaded();
    const plain = canvas(), round = canvas();
    const a = boxes(solids, solids(plain, OPTIONS)), b = boxes(solids, solids(round, OPTIONS));
    stages.push(a, b);
    b.add('ball', solids.sphere({ radius: 0.6, wedges: 32 }), sliced(32)).set('ball', { rotate: [20, 30, 0], position: [0, 0, 0.6] });
    a.draw(); b.draw();
    const without = count(plain), withBall = count(round);
    expect(withBall).toBeLessThan(2000);
    // 33 paths to paint it, each with a gradient of three stops: 165 elements, and a few more for its group,
    // its cut and its mask, and its own slot.
    expect(withBall - without).toBeGreaterThan(165);
    expect(withBall - without).toBeLessThan(165 + 40);
  });

  it('the parts follow the sphere from slot to slot, and the same values draw the same DOM', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = boxes(solids, solids(g, OPTIONS), 6);
    stages.push(stage);
    stage.add('ball', solids.sphere({ radius: 0.6, wedges: 8 }), sliced(8));
    const at = (z) => stage.set('ball', { rotate: [20, 30 + z * 10, 0], position: [0.3, 0.2, z] }).draw();
    at(-1.5);
    const far = markup(g), farCount = count(g);
    at(1.5);
    const near = markup(g);
    expect(near).not.toBe(far);
    expect(count(g)).toBe(farCount);
    // Only the slot the sphere is in holds its parts.
    expect(g.querySelectorAll('g[mask]').length).toBe(1);
    at(-1.5);
    expect(markup(g)).toBe(far);
    at(1.5);
    expect(markup(g)).toBe(near);
    // A stage that never drew the sphere far away draws the same.
    const h = canvas(), fresh = boxes(solids, solids(h, OPTIONS), 6);
    stages.push(fresh);
    fresh.add('ball', solids.sphere({ radius: 0.6, wedges: 8 }), sliced(8));
    fresh.set('ball', { rotate: [20, 45, 0], position: [0.3, 0.2, 1.5] }).draw();
    expect(markup(h)).toBe(near);
  });

  it('two spheres that swap depth, one divided in wedges and one in bands, draw as the same values always do', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = boxes(solids, solids(g, OPTIONS), 4);
    stages.push(stage);
    stage.add('w', solids.sphere({ radius: 0.7, wedges: 12 }), sliced(12)).add('s', solids.sphere({ radius: 0.7, bands: 5 }), sliced(5));
    const at = (t) => stage.set('w', { rotate: [10, 40 * t, 0], position: [-0.4, 0, t] }).set('s', { rotate: [30, 0, 20 * t], position: [0.4, 0, -t] }).draw();
    const seen = [-1, 1, 0.3].map((t) => { at(t); return markup(g); });
    for (const t of [1, -1, 0.3, -1, 1]) { at(t); expect(markup(g)).toBe(seen[[-1, 1, 0.3].indexOf(t)]); }
    expect(g.querySelectorAll('g[mask]').length).toBe(2);
    // Element ids are unique on the stage.
    const ids = [...g.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('wedges or bands that change, a sphere turned to a box and back, removed and added again: the DOM of the values drawn', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = boxes(solids, solids(g, Object.assign({ dropShadow: { blur: 4 } }, OPTIONS)), 3);
    stages.push(stage);
    stage.add('ball', solids.sphere({ radius: 0.6, wedges: 6 }), { color: '#808080' });
    stage.set('ball', { rotate: [20, 30, 0], position: [0, 0, 0.5] }).draw();
    const six = markup(g), sixCount = count(g);
    stage.set('ball', { shape: { wedges: 24 } }).draw();
    expect(count(g)).toBeGreaterThan(sixCount);
    stage.set('ball', { shape: { wedges: 6 } }).draw();
    expect(markup(g)).toBe(six);
    stage.set('ball', { shape: { wedges: undefined, bands: 7 } }).draw();
    stage.set('ball', { shape: solids.sphere({ radius: 0.6, wedges: 6 }) }).draw();
    expect(markup(g)).toBe(six);
    // A box in its place, then the sphere again.
    stage.set('ball', { shape: solids.box({ size: 0.8 }) }).draw();
    expect(g.querySelectorAll('g[mask]').length).toBe(0);
    stage.set('ball', { shape: solids.sphere({ radius: 0.6, wedges: 6 }) }).draw();
    expect(markup(g)).toBe(six);
    // Out of sight and back.
    stage.set('ball', { opacity: 0 }).draw();
    expect(g.querySelectorAll('g[mask]').length).toBe(0);
    stage.set('ball', { opacity: 1 }).draw();
    expect(markup(g)).toBe(six);
    // Removed, then added again.
    stage.remove('ball');
    expect(g.querySelectorAll('g[mask]').length).toBe(0);
    stage.draw();
    stage.add('ball', solids.sphere({ radius: 0.6, wedges: 6 }), { color: '#808080' });
    stage.set('ball', { rotate: [20, 30, 0], position: [0, 0, 0.5] }).draw();
    expect(markup(g)).toBe(six);
  });

  it('a hidden sphere clips, a sphere casts and takes a shadow, and dispose() leaves the target empty', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, Object.assign({ dropShadow: { blur: 4, opacity: 0.5 } }, OPTIONS));
    stage.add('mask', solids.sphere({ radius: 0.8 }), { hidden: true })
      .add('card', solids.plane({ size: 3 }), { clip: 'mask', color: '#406080' })
      .add('ball', solids.sphere({ radius: 0.5, bands: 3 }), sliced(3))
      .add('cap', solids.box({ size: 0.4 }));
    stage.set('card', { position: [0, 0, -1] }).set('ball', { position: [0.6, 0, 0] }).set('cap', { position: [0.6, 0, 1] }).draw();
    // The hidden sphere has no parts; the clip is its outline.
    expect(g.querySelectorAll('g[mask]').length).toBe(1);
    const clip = g.querySelector('clipPath[id$="-i0"] path');
    expect(clip.getAttribute('d')).toMatch(/^M/);
    // The sphere casts onto the card, and the box onto the sphere.
    const shadows = [...g.querySelectorAll('[style*="multiply"] path')].filter((p) => p.getAttribute('d'));
    expect(shadows.length).toBeGreaterThanOrEqual(2);
    stage.dispose();
    expect(g.childNodes.length).toBe(0);
  });
});
