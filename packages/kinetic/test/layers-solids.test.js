/**
 * Solid layers in a record, with the shipped kinetic.25d.js: the record's
 * stage (where it draws, its view, light, rim and glows), the box and faces
 * shapes with their material (a cage made of faces), and what this solids file cannot draw.
 * A record's drawing is compared with the same solids() calls made directly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, loadScript, mount, uniqueName, cageFaces, BUILD, CORE_TIER } from './helpers.js';

const SOLIDS_FILE = typeof __KINETIC_SOLIDS_FILE__ !== 'undefined' ? __KINETIC_SOLIDS_FILE__ : '/packages/kinetic/dist/kinetic.25d.js';
const NS = 'http://www.w3.org/2000/svg';
let ready = null;
const solidsReady = () => ready || (ready = (async () => { const { wf } = await load(); await loadScript(SOLIDS_FILE); return wf; })());

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const VIEW = { distance: 5, focal: 300, roll: 45, near: 0.2, fade: 1.4 };
const LIGHT = { dir: [-0.35, 0.45, 0.85], ramp: ['#04040F', '#3C39C4', '#E2E0FF'], gamma: 2.4, floor: 0.03, gain: 0.7, across: [0.22, 0.2] };
const RIM = { color: '#EAF0FF', width: 2, base: 0.2, edge: 0.45, power: 1.5 };

async function host(name) {
  const el = await mount(`<div data-composition-id="${name}-root" data-start="0" data-duration="2" data-width="200" data-height="200"><div data-component="${name}" data-start="0" data-duration="2"><svg viewBox="0 0 200 200" width="200" height="200"><g class="solids"></g></svg></div></div>`);
  cleanup.push(el);
  return el;
}

describe(`layers.scene() with solids (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a cage of faces with its stage and material draws as the same solids() calls do', async () => {
    const wf = await solidsReady();
    const name = uniqueName('cages');
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT, rim: RIM },
      layers: [{
        id: 'cage', kind: 'solid', content: { shape: 'faces', faces: cageFaces(2, 0.24) },
        place: { rotate: [{ at: [0, 2], to: [0, 90] }, 0, 0], scale: 0.8 },
        look: { opacity: 0.9, albedo: 0.6, glow: 0.5 },
      }],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);

    // The same drawing made directly.
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    const g = document.createElementNS(NS, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    cleanup.push(svg);
    const { solids } = wf.kinetic;
    const stage = solids(g, { camera: VIEW, light: LIGHT, rim: RIM });
    stage.add('cage', solids.faces(cageFaces(2, 0.24)), { albedo: 0.6, glow: 0.5 });
    stage.set('cage', { rotate: [45, 0, 0], scale: 0.8, opacity: 0.9 });
    stage.draw();

    const drawn = el.querySelector('.solids');
    expect(drawn.querySelectorAll('path').length).toBeGreaterThan(0);
    const bare = (h) => h.replace(/id="[^"]*"/g, '').replace(/url\(#[^)]*\)/g, '');
    const a = bare(drawn.innerHTML), b = bare(g.innerHTML);
    // Equal markup; on a difference, the stretch around the first one.
    expect(a.length).toBe(b.length);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    expect(a.slice(Math.max(0, i - 60), i + 80)).toBe(b.slice(Math.max(0, i - 60), i + 80));
  });

  it('polygon, prism, pyramid and sphere draw as the same solids() calls do, and a sphere\'s radius can move', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.sphere !== 'function') return;
    const name = uniqueName('round');
    const SHAPES = [
      ['poly', { shape: 'polygon', sides: 5, radius: 0.5 }, [-1.2, 0.6, 0]],
      ['prism', { shape: 'prism', sides: 6, radius: 0.4, depth: 0.6, taper: 0.5 }, [0, 0.6, 0]],
      ['pyr', { shape: 'pyramid', sides: 4, radius: 0.5, height: 0.8 }, [1.2, 0.6, 0]],
      ['ball', { shape: 'sphere', radius: { at: [0, 2], to: [0.3, 0.7] }, wedges: 4, around: 'x' }, [0, -0.8, 0]],
    ];
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: SHAPES.map(([id, content, position]) => ({ id, kind: 'solid', content, place: { position, rotate: [20, 30, 0] } })),
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    const g = document.createElementNS(NS, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    cleanup.push(svg);
    const { solids } = wf.kinetic;
    const stage = solids(g, { camera: VIEW, light: LIGHT, rim: false });
    stage.add('poly', solids.polygon({ sides: 5, radius: 0.5 }));
    stage.add('prism', solids.prism({ sides: 6, radius: 0.4, depth: 0.6, taper: 0.5 }));
    stage.add('pyr', solids.pyramid({ sides: 4, radius: 0.5, height: 0.8 }));
    stage.add('ball', solids.sphere({ radius: 0.5, wedges: 4, around: 'x' }));
    for (const [id, , position] of SHAPES) stage.set(id, { position, rotate: [20, 30, 0] });
    stage.draw();

    const paths = (root) => [...root.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean).sort();
    expect(paths(el.querySelector('.solids'))).toEqual(paths(g));
  });

  it('a sector with no from or to is a full turn, as solids.sector() makes it', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.sector !== 'function') return;
    const name = uniqueName('ring');
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: [{ id: 'ring', kind: 'solid', content: { shape: 'sector', radius: 0.5, inner: 0.3 } }],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    const g = document.createElementNS(NS, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    cleanup.push(svg);
    const { solids } = wf.kinetic;
    const stage = solids(g, { camera: VIEW, light: LIGHT, rim: false });
    stage.add('ring', solids.sector({ radius: 0.5, inner: 0.3 }));
    stage.draw();
    const paths = (root) => [...root.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean).sort();
    expect(paths(el.querySelector('.solids'))).toEqual(paths(g));
  });

  it('with no bands, solids that interleave in depth are sorted by depth, as the stage does', async () => {
    const wf = await solidsReady();
    const name = uniqueName('nest');
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: [
        { id: 'cage', kind: 'solid', content: { shape: 'faces', faces: cageFaces(2, 0.26) }, place: { rotate: [50, 0, 0] } },
        { id: 'core', kind: 'solid', content: { shape: 'box', size: 0.8 }, place: { rotate: [-50, 0, 0] } },
      ],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    const g = document.createElementNS(NS, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    cleanup.push(svg);
    const { solids } = wf.kinetic;
    const stage = solids(g, { camera: VIEW, light: LIGHT, rim: false });
    stage.add('cage', solids.faces(cageFaces(2, 0.26)));
    stage.add('core', solids.box({ size: 0.8 }));
    stage.set('cage', { rotate: [50, 0, 0] });
    stage.set('core', { rotate: [-50, 0, 0] });
    stage.draw();
    // The same faces in the same drawing order.
    const order = (root) => [...root.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean);
    expect(order(el.querySelector('.solids'))).toEqual(order(g));
  });

  it("box and faces draw; with no stage.src the clip's first <svg> is the target", async () => {
    const wf = await solidsReady();
    const name = uniqueName('shapes');
    wf.kinetic.layers.scene(name, {
      stage: { view: VIEW },
      layers: [
        { id: 'box', kind: 'solid', content: { shape: 'box', size: [1, 0.5, 0.5] }, place: { rotate: [20, 30, 0] } },
        { id: 'tri', kind: 'solid', content: { shape: 'faces', faces: [{ pts: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }] } },
      ],
    });
    const errors = [], was = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    let el;
    try {
      el = await host(name);
      await wf.kinetic.ready();
      await wf.kinetic.seek(0.5);
    } finally { console.error = was; }
    expect(errors.filter((e) => /KN-/.test(e))).toEqual([]);
    // The box's three faces toward the eye and the triangle.
    expect(el.querySelectorAll('svg path').length).toBeGreaterThanOrEqual(4);
  });

  // The two files are made for each other: a kinetic.25d.js without the shapes this kinetic.wf.js asks of it is
  // from another version, and no solid is drawn with it, a box included.
  it('a kinetic.25d.js from an earlier version than kinetic.wf.js is named (KN-100), whatever the record asks for', async () => {
    const wf = await solidsReady();
    const solids = wf.kinetic.solids, plane = solids.plane;
    const root = await host(uniqueName('none'));
    const base = (layer) => ({ id: 't', size: [200, 200], duration: 2, layers: [layer] });
    delete solids.plane;
    try {
      expect(typeof solids.plane).not.toBe('function');
      for (const layer of [
        { id: 'b', kind: 'solid', content: { shape: 'box', size: 1 } },
        { id: 'd', kind: 'solid', content: { shape: 'disc', radius: 1 } },
        { id: 'n', kind: 'null' },
      ]) {
        let err = null;
        try { wf.kinetic.layers(base(layer), { root }).seek(0); } catch (e) { err = e; }
        expect(err && err.message, layer.id).toMatch(/^\[KN-100\] layers: stage/);
      }
    } finally { solids.plane = plane; }
    expect(() => wf.kinetic.layers(base({ id: 'b', kind: 'solid', content: { shape: 'box', size: 1 } }), { root }).seek(0)).not.toThrow();
  });

  // The same drawing made directly, in an <svg> of the host's size; and the two compared as markup.
  const direct = (wf, options, build) => {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 200 200');
    const g = document.createElementNS(NS, 'g');
    svg.appendChild(g);
    document.body.appendChild(svg);
    cleanup.push(svg);
    const stage = wf.kinetic.solids(g, options);
    build(stage, wf.kinetic.solids);
    stage.draw();
    return g;
  };
  const sameMarkup = (drawn, g) => {
    const bare = (h) => h.replace(/id="[^"]*"/g, '').replace(/url\(#[^)]*\)/g, '');
    const a = bare(drawn.innerHTML), b = bare(g.innerHTML);
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    expect(a.slice(Math.max(0, i - 60), i + 80)).toBe(b.slice(Math.max(0, i - 60), i + 80));
    expect(a.length).toBe(b.length);
  };

  it("look.side colors a box's sides by name and a sphere's in order, each a value, as set({ side }) does", async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.sphere !== 'function') return;
    const name = uniqueName('sides');
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      swatches: { coral: '#ff6f59', sun: '#ffc145' },
      roles: { lid: 'sun' },
      layers: [
        { id: 'box', kind: 'solid', content: { shape: 'box', size: 0.8 }, place: { position: [-0.6, 0, 0], rotate: [30, 40, 0] },
          look: { side: { front: 'coral', top: { color: 'lid' }, right: ['#1d2b53', '#fff1d6'] } } },
        { id: 'ball', kind: 'solid', content: { shape: 'sphere', radius: 0.5, wedges: 3 }, place: { position: [0.6, 0, 0], rotate: [10, 20, 0] },
          look: { side: [{ keys: [[0, 'coral'], [2, '#ffffff']] }, null, { color: ['#0a2a52', '#8fd0f5'] }] } },
      ],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const g = direct(wf, { camera: VIEW, light: LIGHT, rim: false }, (stage, solids) => {
      stage.add('box', solids.box({ size: 0.8 }));
      stage.add('ball', solids.sphere({ radius: 0.5, wedges: 3 }));
      stage.set('box', { position: [-0.6, 0, 0], rotate: [30, 40, 0], side: { front: { color: '#ff6f59' }, top: { color: '#ffc145' }, right: { color: ['#1d2b53', '#fff1d6'] } } });
      stage.set('ball', { position: [0.6, 0, 0], rotate: [10, 20, 0], side: [{ color: '#ffb7ac' }, null, { color: ['#0a2a52', '#8fd0f5'] }] });
    });
    sameMarkup(el.querySelector('.solids'), g);
  });

  it('stage.dropShadow, look.casts (a value) and look.accepts draw the shadows set() and add() do', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const name = uniqueName('shadow');
    const SHADOW = { blur: 6, color: '#404860', opacity: 0.8, offset: [4, 6] };
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT, dropShadow: Object.assign({}, SHADOW, { color: 'dusk' }) },
      swatches: { dusk: '#404860' },
      layers: [
        { id: 'wall', kind: 'solid', content: { shape: 'plane', size: 3 }, place: { position: [0, 0, -1] }, look: { casts: 0 } },
        { id: 'card', kind: 'solid', content: { shape: 'plane', size: 0.6 }, place: { position: [0.4, 0, 0.2] }, look: { accepts: false } },
        { id: 'cube', kind: 'solid', content: { shape: 'box', size: 0.5 }, place: { rotate: [20, 30, 0] },
          look: { casts: { at: [0, 2], to: [0, 1] } } },
      ],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const g = direct(wf, { camera: VIEW, light: LIGHT, rim: false, dropShadow: SHADOW }, (stage, solids) => {
      stage.add('wall', solids.plane({ size: 3 }), { casts: 0 });
      stage.add('card', solids.plane({ size: 0.6 }), { accepts: false });
      stage.add('cube', solids.box({ size: 0.5 }));
      stage.set('wall', { position: [0, 0, -1] });
      stage.set('card', { position: [0.4, 0, 0.2] });
      stage.set('cube', { rotate: [20, 30, 0], casts: 0.5 });
    });
    const drawn = el.querySelector('.solids');
    expect(drawn.querySelectorAll('feGaussianBlur').length).toBe(1);
    sameMarkup(drawn, g);
  });

  it('look.color takes a gradient, each stop a swatch or a color and each number a value, as set({ color }) does', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const name = uniqueName('gradient');
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      swatches: { coral: '#ff6f59' },
      layers: [
        { id: 'a', kind: 'solid', content: { shape: 'plane', size: 0.8 }, place: { position: [-0.5, 0, 0] },
          look: { color: { gradient: ['coral', [0.6, '#ffc145'], '#ffffff80'], angle: { at: [0, 2], to: [0, 90] } } } },
        { id: 'b', kind: 'solid', content: { shape: 'box', size: 0.6 }, place: { position: [0.5, 0, 0], rotate: [20, 30, 0] },
          look: { side: { front: { gradient: ['#1d2b53', 'coral'], from: [-0.3, -0.3], to: [0.3, 0.3] } } } },
      ],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1);
    const g = direct(wf, { camera: VIEW, light: LIGHT, rim: false }, (stage, solids) => {
      stage.add('a', solids.plane({ size: 0.8 }));
      stage.add('b', solids.box({ size: 0.6 }));
      stage.set('a', { position: [-0.5, 0, 0], color: { gradient: ['#ff6f59', [0.6, '#ffc145'], '#ffffff80'], angle: 45 } });
      stage.set('b', { position: [0.5, 0, 0], rotate: [20, 30, 0], side: { front: { color: { gradient: ['#1d2b53', '#ff6f59'], from: [-0.3, -0.3], to: [0.3, 0.3] } } } });
    });
    sameMarkup(el.querySelector('.solids'), g);
  });

  it("look.clip: { layer, invert: true } draws outside the other layer's outline, as add()'s clip { shape, invert } does", async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const name = uniqueName('invert');
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: [
        { id: 'gate', kind: 'solid', hidden: true, content: { shape: 'plane', size: [1, 0.5] }, place: { position: [{ at: [0, 2], to: [-0.5, 0.5] }, 0, 0] } },
        { id: 'out', kind: 'solid', content: { shape: 'disc', radius: 0.6 }, look: { color: '#ff6f59', clip: { layer: 'gate', invert: true } } },
        { id: 'in', kind: 'solid', content: { shape: 'disc', radius: 0.4 }, place: { position: [0, 0, 0.1] }, look: { color: '#1d2b53', clip: { layer: 'gate' } } },
      ],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(1.5);
    const g = direct(wf, { camera: VIEW, light: LIGHT, rim: false }, (stage, solids) => {
      stage.add('gate', solids.plane({ size: [1, 0.5] }), { hidden: true });
      stage.add('out', solids.disc({ radius: 0.6 }), { clip: { shape: 'gate', invert: true } });
      stage.add('in', solids.disc({ radius: 0.4 }), { clip: 'gate' });
      stage.set('gate', { position: [0.25, 0, 0] });
      stage.set('out', { color: '#ff6f59' });
      stage.set('in', { position: [0, 0, 0.1], color: '#1d2b53' });
    });
    const drawn = el.querySelector('.solids');
    expect(drawn.querySelectorAll('clipPath > path[clip-rule="evenodd"]').length).toBe(1);
    sameMarkup(drawn, g);
  });

  it('content.faces as a value form is read every frame and the shape made again; an empty list draws nothing', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const name = uniqueName('flow');
    // A triangle whose tip rises over a second, then nothing from 1.5 s.
    const tri = (t) => (t >= 1.5 ? [] : [{ pts: [[-0.5, -0.4, 0], [0.5, -0.4, 0], [0, -0.4 + 0.9 * Math.min(1, t), 0]], n: [0, 0, 1] }]);
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: [{ id: 'tri', kind: 'solid', content: { shape: 'faces', faces: { call: 'tri', args: [{ rate: 1 }] } }, look: { color: '#ffc145' } }],
    }, { fns: { tri } });
    const el = await host(name);
    await wf.kinetic.ready();
    const drawn = el.querySelector('.solids');
    for (const t of [0.25, 0.75]) {
      await wf.kinetic.seek(t);
      const g = direct(wf, { camera: VIEW, light: LIGHT, rim: false }, (stage, solids) => {
        stage.add('tri', solids.faces(tri(t)));
        stage.set('tri', { color: '#ffc145' });
      });
      const paths = (root) => [...root.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean);
      expect(paths(drawn).length).toBeGreaterThan(0);
      expect(paths(drawn)).toEqual(paths(g));
    }
    const drawnPaths = () => [...drawn.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter(Boolean);
    const before = drawnPaths();
    await wf.kinetic.seek(1.8);
    expect(drawnPaths()).toEqual([]);
    await wf.kinetic.seek(0.75);
    expect(drawnPaths()).toEqual(before);
  });

  // A faces list that moves names its own sides, and they come and go with its faces: look.side colors the sides
  // the list has at that moment, and one it does not have then is left out, at time 0 too.
  it('a moving faces list with named sides: look.side colors the sides it has at that moment', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const name = uniqueName('sail');
    // Nothing until 0.5 s, then a sail, and from 1.5 s a mast alone.
    const sail = (t) => (t < 0.5 ? [] : t < 1.5
      ? [{ pts: [[-0.5, -0.4, 0], [0.5, -0.4, 0], [0, 0.5, 0]], n: [0, 0, 1], side: 'sail' }]
      : [{ pts: [[-0.05, -0.5, 0], [0.05, -0.5, 0], [0.05, 0.5, 0], [-0.05, 0.5, 0]], n: [0, 0, 1], side: 'mast' }]);
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: [{ id: 's', kind: 'solid', content: { shape: 'faces', faces: { call: 'sail', args: [{ rate: 1 }] } }, look: { side: { sail: '#ff6f59', mast: '#1d2b53' } } }],
    }, { fns: { sail } });
    const errors = [], was = console.error;
    console.error = (...a) => { errors.push(a.map(String).join(' ')); };
    let el;
    try {
      el = await host(name);
      await wf.kinetic.ready();
      const drawn = el.querySelector('.solids');
      const look = (root) => [...root.querySelectorAll('path')].filter((p) => p.getAttribute('d')).map((p) => [p.getAttribute('d'), p.getAttribute('fill')]);
      await wf.kinetic.seek(0.2);
      expect(look(drawn)).toEqual([]);
      for (const [t, side] of [[1, { sail: { color: '#ff6f59' } }], [1.8, { mast: { color: '#1d2b53' } }]]) {
        await wf.kinetic.seek(t);
        const g = direct(wf, { camera: VIEW, light: LIGHT, rim: false }, (stage, solids) => {
          stage.add('s', solids.faces(sail(t)));
          stage.set('s', { side });
        });
        expect(look(drawn).length).toBeGreaterThan(0);
        expect(look(drawn).map((x) => x[0])).toEqual(look(g).map((x) => x[0]));
      }
      expect((await wf.kinetic.check({ samples: 20 })).ok).toBe(true);
    } finally { console.error = was; }
    expect(errors.filter((e) => /KN-/.test(e))).toEqual([]);
  });

  it('a band track of held names keeps each name when a band shares its name with a role or a swatch', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const root = await host(uniqueName('bandrole'));
    const record = {
      id: 't', size: [200, 200], duration: 2, bands: ['back', 'ground', 'front'],
      swatches: { front: '#ffc145' }, roles: { ground: 'front' },
      layers: [
        { id: 'a', kind: 'solid', band: { keys: [[0, ['hold', 'ground']], [1, ['hold', 'front']]] }, content: { shape: 'disc', radius: 0.2 }, look: { color: 'ground' } },
        { id: 'b', kind: 'solid', band: 'back', content: { shape: 'disc', radius: 0.3 }, look: { color: '#1d2b53' } },
      ],
    };
    const comp = wf.kinetic.layers(record, { root });
    expect(() => comp.seek(0.5)).not.toThrow();
    expect(() => comp.seek(1.5)).not.toThrow();
  });

  it('in a band, a placement from this lap draws over one wrapped from the lap before, in a loop of any length', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const RED = '#ff0000', BLUE = '#0000ff';
    const disc = (id, color) => ({ layers: [{ id, kind: 'solid', band: 'a', life: [0, 900], content: { shape: 'disc', radius: 0.3 }, look: { color } }] });
    const painted = (root) => [...root.querySelectorAll('.solids path')].filter((p) => p.getAttribute('d')).map((p) => p.getAttribute('fill')).filter((c) => c === RED || c === BLUE);
    // Counted in frames. P starts 600 frames before the loop's end and is still playing 150 frames into the next lap;
    // Q starts with the lap.
    const order = async (duration) => {
      const root = await host(uniqueName('lap'));
      const comp = wf.kinetic.layers({
        id: 't', size: [200, 200], unit: 'frame', duration, loop: { wrap: true }, bands: ['a'], stage: { src: '.solids', view: VIEW, light: LIGHT },
        comps: { p: disc('pd', RED), q: disc('qd', BLUE) },
        layers: [{ id: 'P', kind: 'comp', comp: 'p', start: duration - 600 }, { id: 'Q', kind: 'comp', comp: 'q', start: 0 }],
      }, { root });
      comp.seek(5);
      return painted(root);
    };
    expect(await order(1200)).toEqual([RED, BLUE]);
    expect(await order(12000)).toEqual([RED, BLUE]);
  });

  it('in a band, a copy that started a frame later draws over the others, however many copies come after it in the list', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const RED = '#ff0000', BLUE = '#0000ff';
    const root = await host(uniqueName('late'));
    // Sixty copies in one place, all starting at 0 but the first, which starts a frame later.
    const rows = Array.from({ length: 60 }, (_, i) => ({ s: i ? 0 : 1 / 30, c: i ? BLUE : RED }));
    const comp = wf.kinetic.layers({
      id: 't', size: [200, 200], duration: 2, bands: ['a'], stage: { src: '.solids', view: VIEW, light: LIGHT },
      comps: { c: { layers: [{ id: 'd', kind: 'solid', band: 'a', content: { shape: 'disc', radius: 0.3 }, look: { color: { from: 'params.c' } } }] } },
      layers: [{ id: 'p', kind: 'comp', comp: 'c', start: { from: 'params.s' }, repeat: { over: rows } }],
    }, { root });
    comp.seek(1);
    const fills = [...root.querySelectorAll('.solids path')].filter((p) => p.getAttribute('d')).map((p) => p.getAttribute('fill')).filter((c) => c === RED || c === BLUE);
    expect(fills.length).toBe(60);
    expect(fills[59]).toBe(RED);
  });

  it("a side's color track that holds null gives the side back the shape's color", async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.plane !== 'function') return;
    const root = await host(uniqueName('sidenull'));
    const RED = '#ff0000', BLUE = '#0000ff';
    const comp = wf.kinetic.layers({
      id: 't', size: [200, 200], duration: 2, stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: [{ id: 'b', kind: 'solid', content: { shape: 'plane', size: 1 }, look: { color: { keys: [[0, ['hold', BLUE]], [1.5, ['hold', null]]] }, side: { front: { keys: [[0, ['hold', RED]], [1, ['hold', null]]] } } } }],
    }, { root });
    const fill = () => [...root.querySelectorAll('.solids path')].filter((p) => p.getAttribute('d')).map((p) => p.getAttribute('fill'));
    comp.seek(0.5);
    expect(fill()).toContain(RED);
    expect(() => comp.seek(1.2)).not.toThrow();
    expect(fill()).toContain(BLUE);
    expect(fill()).not.toContain(RED);
    expect(() => comp.seek(1.8)).not.toThrow();
    expect(fill()).not.toContain(BLUE);
  });

  it('a side, a cast shadow or a gradient written wrong is named: KN-162 for a key, KN-165 for a value', async () => {
    const wf = await solidsReady();
    if (typeof wf.kinetic.solids.sphere !== 'function') return;
    const root = await host(uniqueName('badlook'));
    const rec = (layer, stage) => ({ id: 't', size: [200, 200], duration: 2, stage, swatches: { coral: '#ff6f59' }, layers: [Object.assign({ id: 's', kind: 'solid' }, layer)] });
    const code = (record) => { try { wf.kinetic.layers(record, { root }).seek(0); } catch (e) { return e.message.slice(0, 8); } return null; };
    const box = { shape: 'box', size: 1 };
    expect(code(rec({ content: box, look: { side: { lid: 'coral' } } }))).toBe('[KN-162]');
    expect(code(rec({ content: box, look: { side: ['coral'] } }))).toBe('[KN-162]');
    expect(code(rec({ content: { shape: 'sphere', radius: 1, wedges: 2 }, look: { side: ['coral', 'coral', 'coral'] } }))).toBe('[KN-162]');
    expect(code(rec({ content: box, look: { side: { front: { colour: 'coral' } } } }))).toBe('[KN-162]');
    expect(code(rec({ content: box, look: { side: 'coral' } }))).toBe('[KN-162]');
    expect(code(rec({ content: box, look: { color: { gradient: ['coral', '#ffffff'], turn: 45 } } }))).toBe('[KN-162]');
    expect(code(rec({ content: box, look: { color: { gradient: ['coral'] } } }))).toBe('[KN-165]');
    expect(code(rec({ content: box, look: { color: { gradient: ['coral', 'url(#paint)'] } } }))).toBe('[KN-165]');
    expect(code(rec({ content: box, look: { accepts: 'no' } }))).toBe('[KN-165]');
    expect(code(rec({ content: box }, { dropShadow: 'soft' }))).toBe('[KN-162]');
    expect(code(rec({ content: box, look: { clip: { layer: 's', outside: true } } }))).toBe('[KN-162]');
    expect(code(rec({ content: box, look: { clip: { layer: 'nowhere', invert: true } } }))).toBe('[KN-164]');
    expect(code({ id: 't', size: [200, 200], duration: 2, layers: [{ id: 'h', kind: 'html', src: 'svg', look: { casts: 1 } }] })).toBe('[KN-162]');
  });

  it('a stage key that is not one is KN-162; a stage.src that finds nothing is KN-168', async () => {
    const wf = await solidsReady();
    const root = await host(uniqueName('bad'));
    const rec = (stage) => ({ id: 't', size: [200, 200], duration: 2, stage, layers: [{ id: 'c', kind: 'solid', content: { shape: 'box', size: 1 } }] });
    let err = null;
    try { wf.kinetic.layers(rec({ camera: VIEW }), { root }).seek(0); } catch (e) { err = e; }
    expect(err && err.message).toMatch(/^\[KN-162\] /);
    err = null;
    try { wf.kinetic.layers(rec({ src: '#nowhere' }), { root }).seek(0); } catch (e) { err = e; }
    expect(err && err.message).toMatch(/^\[KN-168\] /);
  });

  // A shape whose count of faces or parts changes over time: the stage holds what the frame needs and no more, so
  // a frame is the same elements whatever was drawn before it, which is what check() compares.
  it('a solid whose face or part count changes over time passes check()', async () => {
    const wf = await solidsReady();
    const grow = (t) => Array.from({ length: 1 + Math.floor(t * 3) }, (_, i) => ({ pts: [[-0.5 + i * 0.1, -0.4, 0], [0.5, -0.4, 0], [0, 0.5, 0]], n: [0, 0, 1] }));
    const cases = {
      'a prism whose sides change': { content: { shape: 'prism', sides: { keys: [[0, ['hold', 3]], [1, ['hold', 8]]] }, radius: 0.5, depth: 0.5 }, place: { rotate: [20, 30, 0] } },
      'a sphere whose wedges change': { content: { shape: 'sphere', radius: 0.5, wedges: { keys: [[0, ['hold', 2]], [1, ['hold', 6]]] } }, place: { rotate: [20, 30, 0] } },
      'a faces list that grows': { content: { shape: 'faces', faces: { call: 'grow', args: [{ rate: 1 }] } } },
    };
    for (const [what, layer] of Object.entries(cases)) {
      const name = uniqueName('count');
      wf.kinetic.layers.scene(name, {
        stage: { src: '.solids', view: VIEW, light: LIGHT, dropShadow: { color: '#000000' } },
        layers: [Object.assign({ id: 'p', kind: 'solid' }, layer), { id: 'q', kind: 'solid', content: { shape: 'box', size: 0.4 }, place: { position: [1, 0, 0] } }],
      }, { fns: { grow } });
      const el = await host(name);
      await wf.kinetic.ready();
      const report = await wf.kinetic.check({ samples: 60 });
      expect(report.ok, what + ': ' + JSON.stringify(report)).toBe(true);
      cleanup.splice(cleanup.indexOf(el), 1);
      el.remove();
    }
  });

  it('a sphere and boxes that pass each other in depth, and a sphere whose wedges change among boxes, pass check()', async () => {
    const wf = await solidsReady();
    const z = (from, to) => ({ keys: [[0, from], [2, to]] });
    const cases = {
      'a sphere passing boxes': [
        { id: 'ball', kind: 'solid', content: { shape: 'sphere', radius: 0.4, wedges: 10 }, place: { rotate: [20, 30, 0], position: [0, 0, z(-2, 1.5)] }, look: { side: Array.from({ length: 10 }, (_, i) => ({ color: i % 2 ? '#d04020' : '#2040d0' })) } },
        { id: 'a', kind: 'solid', content: { shape: 'box', size: 0.5 }, place: { rotate: [20, 30, 0], position: [0.3, 0, z(1, -1)] } },
        { id: 'b', kind: 'solid', content: { shape: 'box', size: 0.5 }, place: { rotate: [10, 50, 0], position: [-0.3, 0.2, 0] } },
        { id: 'c', kind: 'solid', content: { shape: 'box', size: 0.5 }, place: { rotate: [30, 10, 0], position: [0, -0.3, z(0.8, -1.6)] } },
      ],
      'wedges as a track among boxes': [
        { id: 'ball', kind: 'solid', content: { shape: 'sphere', radius: 0.5, wedges: { keys: [[0, ['hold', 3]], [0.7, ['hold', 12]], [1.4, ['hold', 5]]] } }, place: { rotate: [20, 30, 0], position: [0, 0, z(-1, 1)] } },
        { id: 'a', kind: 'solid', content: { shape: 'box', size: 0.5 }, place: { rotate: [20, 30, 0], position: [0.4, 0, 0] } },
        { id: 'b', kind: 'solid', content: { shape: 'box', size: 0.5 }, place: { rotate: [10, 50, 0], position: [-0.4, 0.2, 0.2] } },
      ],
    };
    for (const [what, layers] of Object.entries(cases)) {
      const name = uniqueName('pass');
      wf.kinetic.layers.scene(name, { stage: { src: '.solids', view: VIEW, light: LIGHT, rim: RIM, dropShadow: { color: '#000000' } }, layers });
      const el = await host(name);
      await wf.kinetic.ready();
      const report = await wf.kinetic.check({ samples: 60 });
      expect(report.ok, what + ': ' + JSON.stringify(report)).toBe(true);
      cleanup.splice(cleanup.indexOf(el), 1);
      el.remove();
    }
  });

  it('a destroyed clip leaves its stage empty', async () => {
    const wf = await solidsReady();
    const name = uniqueName('gone');
    wf.kinetic.layers.scene(name, {
      stage: { src: '.solids', view: VIEW, light: LIGHT },
      layers: [{ id: 'c', kind: 'solid', content: { shape: 'box', size: 1 }, place: { rotate: [20, 30, 0] } }],
    });
    const el = await host(name);
    await wf.kinetic.ready();
    await wf.kinetic.seek(0.5);
    const world = el.querySelector('.solids');
    expect(world.querySelectorAll('path').length).toBeGreaterThan(0);
    el.firstElementChild.remove();
    await new Promise((r) => setTimeout(r, 80));
    expect(world.childNodes.length).toBe(0);
  });
});
