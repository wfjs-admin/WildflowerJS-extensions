/**
 * kinetic.25d.js: the flat shapes (plane, disc, sector, capsule) and the
 * null; a shape inside its parent's transform; the pivot; a shape's own
 * color, a side's color and a flat shape's back; grain from the stage's
 * shade canvas; drop shadows cast and refused; the order that overrides
 * depth; a clip by a hidden shape; set({ shape }); and their KN-100 cases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, loadScript, mount, dispatchSeek, expectKN, BUILD, CORE_TIER } from './helpers.js';

const SOLIDS_FILE = typeof __KINETIC_SOLIDS_FILE__ !== 'undefined' ? __KINETIC_SOLIDS_FILE__ : '/packages/kinetic/dist/kinetic.25d.js';
const NS = 'http://www.w3.org/2000/svg';
const cleanup = [];
const stages = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const s of stages.splice(0)) s.dispose();
  for (const el of cleanup.splice(0)) el.remove();
});

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

// The slots drawn, in the order they are painted, the blank ones left out.
const slotsOf = (g) => [...g.querySelectorAll('[data-solids] > g:nth-of-type(1) > g')].filter((s) => s.querySelector('path').getAttribute('d'));
const drawn = (g) => slotsOf(g).map((s) => s.querySelector('path').getAttribute('d'));
const pointsOf = (d) => d.slice(1).replace(' Z', '').split(' L').map((p) => p.trim().split(' ').map(Number));
const boundsOf = (d) => { const p = pointsOf(d), x = p.map((q) => q[0]), y = p.map((q) => q[1]); return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)]; };
const gradientOf = (g, slot) => { const id = /url\(#(.+)\)/.exec(slot.querySelector('path').getAttribute('fill'))[1]; return g.querySelector('#' + CSS.escape(id)); };
const VIEW = { camera: { distance: 5, focal: 400 } };

describe(`kinetic.25d.js: flat shapes, nulls and the stage's further keys (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the flat shapes are one face in z = 0 facing +z, with sides front and back; a null has no faces', async () => {
    const solids = await solidsLoaded();
    const plane = solids.plane({ size: [2, 1] });
    expect(plane.faces.length).toBe(1);
    expect(plane.faces[0].pts).toEqual([[-1, -0.5, 0], [1, -0.5, 0], [1, 0.5, 0], [-1, 0.5, 0]]);
    expect(plane.faces[0].n).toEqual([0, 0, 1]);
    expect([...plane.sides]).toEqual(['front', 'back']);
    expect(plane.flat).toBe(true);
    expect(solids.disc({ radius: 1 }).faces[0].pts.length).toBe(128);
    // Every corner of a disc on its circle.
    for (const p of solids.disc({ radius: 2 }).faces[0].pts) expect(Math.hypot(p[0], p[1])).toBeCloseTo(2, 9);
    // A quarter sector: its arc from straight up to the right, and its center.
    const quarter = solids.sector({ radius: 1, from: 0, to: 90 }).faces[0].pts;
    expect(quarter[0][0]).toBeCloseTo(0, 9); expect(quarter[0][1]).toBeCloseTo(1, 9);
    expect(quarter[quarter.length - 2][0]).toBeCloseTo(1, 9); expect(quarter[quarter.length - 2][1]).toBeCloseTo(0, 9);
    expect(quarter[quarter.length - 1]).toEqual([0, 0, 0]);
    // A ring: an outer and an inner arc, no center.
    const ring = solids.sector({ radius: 1, inner: 0.5, from: 0, to: 180 }).faces[0].pts;
    expect(ring.some((p) => Math.hypot(p[0], p[1]) < 0.4)).toBe(false);
    expect(ring.filter((p) => Math.abs(Math.hypot(p[0], p[1]) - 0.5) < 1e-9).length).toBeGreaterThan(2);
    // A capsule 2 long with ends of radius 0.5 reaches 1.5 each way along x and 0.5 along y.
    const pill = solids.capsule({ radius: 0.5, length: 2 }).faces[0].pts;
    expect(Math.max(...pill.map((p) => p[0]))).toBeCloseTo(1.5, 6);
    expect(Math.min(...pill.map((p) => p[0]))).toBeCloseTo(-1.5, 6);
    expect(Math.max(...pill.map((p) => p[1]))).toBeCloseTo(0.5, 6);
    // Ends of two sizes; one end inside the other is that end's circle alone.
    const cone = solids.capsule({ radius: [1, 0.25], length: 3 }).faces[0].pts;
    // Each end a ring of short edges: its far point within a thousandth.
    expect(Math.min(...cone.map((p) => p[0]))).toBeCloseTo(-2.5, 3);
    expect(Math.max(...cone.map((p) => p[0]))).toBeCloseTo(1.75, 3);
    const inside = solids.capsule({ radius: [1, 0.25], length: 0.5 }).faces[0].pts;
    for (const p of inside) expect(Math.hypot(p[0] + 0.25, p[1])).toBeCloseTo(1, 9);
    expect(solids.null().faces.length).toBe(0);
  });

  it('a flat shape turned away is not drawn, unless side.back has a color, drawn in it', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW).add('card', solids.plane({ size: 1 }), { color: '#ff0000' }).draw();
    expect(drawn(g).length).toBe(1);
    expect(slotsOf(g)[0].querySelector('path').getAttribute('fill')).toBe('#ff0000');
    stage.set('card', { rotate: [0, 180, 0] }).draw();
    expect(drawn(g)).toEqual([]);
    stage.set('card', { side: { back: { color: '#0000ff' } } }).draw();
    expect(drawn(g).length).toBe(1);
    expect(slotsOf(g)[0].querySelector('path').getAttribute('fill')).toBe('#0000ff');
    // The front's own color over the shape's.
    stage.set('card', { rotate: [0, 0, 0], side: { front: { color: '#00ff00' } } }).draw();
    expect(slotsOf(g)[0].querySelector('path').getAttribute('fill')).toBe('#00ff00');
  });

  it('a null and parents: a shape inside a null placed at x = 1 draws where the shape placed at x = 1 does; the parent turns it about the parent; parent: null takes it off', async () => {
    const solids = await solidsLoaded();
    const a = canvas(), b = canvas();
    solids(a, VIEW).add('card', solids.plane({ size: 1 })).set('card', { position: [1, 0, 0] }).draw();
    const stage = solids(b, VIEW).add('rig', solids.null()).add('card', solids.plane({ size: 1 }), { parent: 'rig' });
    stage.set('rig', { position: [1, 0, 0] }).draw();
    expect(drawn(b)).toEqual(drawn(a));
    // A quarter turn of the parent about z carries the card from x = 1 to y = 1: up on screen.
    stage.set('rig', { position: [0, 0, 0], rotate: [0, 0, 90] }).set('card', { position: [1, 0, 0] }).draw();
    const [x0, y0, x1, y1] = boundsOf(drawn(b)[0]);
    expect((x0 + x1) / 2).toBeCloseTo(200, 0);
    expect((y0 + y1) / 2).toBeLessThan(150);
    // Only the transform passes down: a parent's opacity is its own.
    stage.set('rig', { opacity: 0 }).draw();
    expect(drawn(b).length).toBe(1);
    stage.set('card', { parent: null }).draw();
    const [cx0, , cx1] = boundsOf(drawn(b)[0]);
    expect((cx0 + cx1) / 2).toBeGreaterThan(250);
  });

  it('pivot: the point of its own space that position places and that it turns about', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    // Its left edge on the center.
    const stage = solids(g, VIEW).add('card', solids.plane({ size: [2, 1] }), { pivot: [-1, 0, 0] }).draw();
    let [x0, , x1] = boundsOf(drawn(g)[0]);
    expect(x0).toBeCloseTo(200, 0);
    expect(x1).toBeCloseTo(360, 0);
    // A half turn about z, about that edge: now to the left of the center.
    stage.set('card', { rotate: [0, 0, 180] }).draw();
    [x0, , x1] = boundsOf(drawn(g)[0]);
    expect(x0).toBeCloseTo(40, 0);
    expect(x1).toBeCloseTo(200, 0);
    // Set back to the middle, it draws as one never given a pivot.
    const h = canvas();
    solids(h, VIEW).add('card', solids.plane({ size: [2, 1] })).set('card', { rotate: [0, 0, 180] }).draw();
    stage.set('card', { pivot: [0, 0, 0] }).draw();
    expect(drawn(g)).toEqual(drawn(h));
  });

  it("color: a ramp is read through the light, a paint is used as it is, a gradient lies in the shape's space; back on the stage's ramp, the markup is as if it had never been colored", async () => {
    const solids = await solidsLoaded();
    const g = canvas(), plain = canvas();
    const light = { dir: [0, 0, 1], ramp: ['#000000', '#ffffff'], gamma: 1, floor: 0, gain: 1, across: [0, 0] };
    const stage = solids(g, Object.assign({ light }, VIEW)).add('card', solids.plane({ size: 1 }));
    solids(plain, Object.assign({ light }, VIEW)).add('card', solids.plane({ size: 1 })).draw();
    const before = plain.innerHTML.replace(/kns\d+-/g, '');
    // Square on to the light: the top of its ramp.
    stage.set('card', { color: ['#000000', '#ff0000'] }).draw();
    const grad = gradientOf(g, slotsOf(g)[0]);
    expect(grad.children[1].getAttribute('stop-color')).toBe('rgb(255,0,0)');
    stage.set('card', { color: { gradient: ['#ff0000', '#0000ff80', [1, '#00ff00']], angle: 0 } }).draw();
    const stops = [...gradientOf(g, slotsOf(g)[0]).children];
    expect(stops.map((s) => [s.getAttribute('offset'), s.getAttribute('stop-color'), s.getAttribute('stop-opacity')])).toEqual([['0', '#ff0000', '1'], ['0.5', '#0000ff', '0.5'], ['1', '#00ff00', '1']]);
    // Angle 0 runs along its x axis: left to right on screen.
    const lg = gradientOf(g, slotsOf(g)[0]);
    expect(Number(lg.getAttribute('x1'))).toBeLessThan(Number(lg.getAttribute('x2')));
    stage.set('card', { color: 'url(#somewhere)' }).draw();
    expect(slotsOf(g)[0].querySelector('path').getAttribute('fill')).toBe('url(#somewhere)');
    stage.set('card', { color: { gradient: ['#ff0000', '#00ff00', '#0000ff', '#ffffff'] } }).draw();
    // Its own ramp equal to the stage's: the same markup as the card never colored.
    stage.set('card', { color: ['#000000', '#ffffff'] }).draw();
    expect(g.innerHTML.replace(/kns\d+-/g, '')).toBe(before);
  });

  it("side: a box's faces colored by name, over the shape's color; a side with a shade", async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW).add('cube', solids.box({ size: 1 }), { color: '#888888', side: { front: { color: '#ff0000' } } });
    stage.set('cube', { rotate: [30, 40, 0] }).draw();
    const fills = slotsOf(g).map((s) => s.querySelector('path').getAttribute('fill'));
    expect(fills.length).toBe(3);
    expect(fills.filter((f) => f === '#ff0000').length).toBe(1);
    expect(fills.filter((f) => f === '#888888').length).toBe(2);
    expect(() => stage.set('cube', { side: { top: { shade: { fill: 0.2 } } } })).not.toThrow();
  });

  it('order: a shape of a higher order is painted over one of a lower, whatever their depth; one order sorts by depth', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW)
      .add('near', solids.plane({ size: 1 }), { color: '#ff0000' })
      .add('far', solids.plane({ size: 1 }), { color: '#0000ff' })
      .set('near', { position: [0, 0, 1] }).set('far', { position: [0, 0, -1] });
    const fills = () => slotsOf(g).map((s) => s.querySelector('path').getAttribute('fill'));
    stage.draw();
    expect(fills()).toEqual(['#0000ff', '#ff0000']);
    stage.set('far', { order: 1 }).draw();
    expect(fills()).toEqual(['#ff0000', '#0000ff']);
    stage.set('far', { order: 0 }).draw();
    expect(fills()).toEqual(['#0000ff', '#ff0000']);
  });

  it("casts: with the stage's dropShadow, a shape nearer the eye shadows the shape behind it; casts 0 or accepts false keeps it off", async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, Object.assign({ dropShadow: { blur: 4, opacity: 0.5, offset: [6, 6] } }, VIEW))
      .add('back', solids.plane({ size: 2 }))
      .add('front', solids.plane({ size: 0.5 }))
      .set('front', { position: [0, 0, 1] });
    // The shadows that fall on a slot: its caster paths with an outline.
    const shadowsOn = (slot) => [...slot.querySelectorAll('g[filter] path')].filter((p) => p.getAttribute('d')).map((p) => p.closest('g[filter] > g'));
    stage.draw();
    let [back, front] = slotsOf(g);
    expect(shadowsOn(front)).toEqual([]);
    const cast = shadowsOn(back);
    expect(cast.length).toBe(1);
    expect(cast[0].getAttribute('opacity')).toBe('0.5');
    expect(cast[0].getAttribute('transform')).toBe('translate(6 6)');
    stage.set('front', { casts: 0.5 }).draw();
    expect(shadowsOn(slotsOf(g)[0])[0].getAttribute('opacity')).toBe('0.25');
    stage.set('front', { casts: 0 }).draw();
    expect(shadowsOn(slotsOf(g)[0])).toEqual([]);
    // accepts: false, on the shape behind.
    const h = canvas();
    solids(h, Object.assign({ dropShadow: {} }, VIEW))
      .add('back', solids.plane({ size: 2 }), { accepts: false })
      .add('front', solids.plane({ size: 0.5 }))
      .set('front', { position: [0, 0, 1] }).draw();
    [back, front] = slotsOf(h);
    expect(shadowsOn(back)).toEqual([]);
  });

  it('clip and hidden: a hidden shape is not drawn, and a shape clipped by it is drawn inside its outline, or with invert outside it', async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW)
      .add('mask', solids.disc({ radius: 0.5 }), { hidden: true })
      .add('card', solids.plane({ size: 2 }), { clip: 'mask' })
      .add('other', solids.plane({ size: 2 }), { clip: { shape: 'mask', invert: true } })
      .draw();
    const slots = slotsOf(g);
    expect(slots.length).toBe(2);
    const [inside, outside] = slots.map((s) => g.querySelector('#' + CSS.escape(/url\(#(.+)\)/.exec(s.getAttribute('clip-path'))[1])).firstElementChild.getAttribute('d'));
    expect(pointsOf(inside).length).toBe(128);
    expect(outside.startsWith('M-99999 -99999')).toBe(true);
    expect(outside.endsWith(inside)).toBe(true);
  });

  it("set({ shape }): some of a shape's numbers, the rest as they were, or a whole shape in its place", async () => {
    const solids = await solidsLoaded();
    const g = canvas();
    const stage = solids(g, VIEW).add('pill', solids.capsule({ radius: 0.25, length: 1 })).draw();
    const w = (d) => { const [x0, , x1] = boundsOf(d); return x1 - x0; };
    const short = w(drawn(g)[0]);
    stage.set('pill', { shape: { length: 2 } }).draw();
    expect(w(drawn(g)[0]) - short).toBeCloseTo(80, 0);
    stage.set('pill', { shape: solids.box({ size: 1 }) }).draw();
    expect(drawn(g).length).toBe(1);
    stage.set('pill', { shape: { size: 0.5 } }).draw();
    expect(w(drawn(g)[0])).toBeCloseTo(80 * 0.5 * 5 / 4.75, 0);
  });

  it("shade: a shape's grain is drawn on the stage's shade canvas, inside the shape's outline", async () => {
    const solids = await solidsLoaded();
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="solids-shade" data-start="0" data-duration="2" data-fps="10" data-width="200" data-height="200" style="position:relative;width:200px;height:200px">
      <svg viewBox="0 0 200 200" width="200" height="200" style="position:absolute;left:0;top:0"><g></g></svg>
      <canvas style="position:absolute;left:0;top:0;width:200px;height:200px"></canvas>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const cv = host.querySelector('canvas');
    const stage = solids(host.querySelector('g'), { camera: { distance: 5, focal: 200 }, shade: { canvas: cv, kind: 'stipple' } });
    stages.push(stage);
    // A plane 2 wide: 80 px across at the middle, from 60 to 140.
    stage.add('card', solids.plane({ size: 2 }), { shade: { fill: 1, ink: '#000000' } }).draw();
    await dispatchSeek(0.1).done;
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, 0, 0);
    const s = cv.width / cv.clientWidth, data = ctx.getImageData(0, 0, c.width, c.height).data;
    const share = (x0, x1, y0, y1) => { let n = 0, hit = 0; for (let y = Math.floor(y0 * s); y < Math.floor(y1 * s); y++) for (let x = Math.floor(x0 * s); x < Math.floor(x1 * s); x++) { n++; if (data[(y * c.width + x) * 4 + 3] > 100) hit++; } return hit / n; };
    expect(share(70, 130, 70, 130)).toBeGreaterThan(0.3);
    expect(share(0, 50, 0, 200)).toBe(0);
    expect(share(150, 200, 0, 200)).toBe(0);
  });

  it('KN-100: the flat shapes, null and parent, pivot, color, side, shade, casts, order, clip and set({ shape }) each named', async () => {
    const solids = await solidsLoaded();
    expectKN(() => solids.plane({ size: 0 }), 'KN-100', 'solids.plane({ size })');
    expectKN(() => solids.plane({ size: [1, 2, 3] }), 'KN-100', 'solids.plane({ size })');
    expectKN(() => solids.disc({ radius: -1 }), 'KN-100', 'solids.disc({ radius })');
    expectKN(() => solids.sector({ radius: 1, inner: 1 }), 'KN-100', 'solids.sector({ inner })');
    expectKN(() => solids.sector({ radius: 1, from: 90, to: 0 }), 'KN-100', 'solids.sector({ from, to })');
    expectKN(() => solids.sector({ radius: 0 }), 'KN-100', 'solids.sector({ radius })');
    expectKN(() => solids.capsule({ radius: [1], length: 1 }), 'KN-100', 'solids.capsule({ radius })');
    expectKN(() => solids.capsule({ radius: 1, length: -1 }), 'KN-100', 'solids.capsule({ length })');
    expectKN(() => solids.faces([{ pts: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], side: 3 }]), 'KN-100', 'solids.faces(faces[0].side)');
    const g = canvas();
    // A shade needs the stage's canvas, named when the stage draws.
    const bare = solids(canvas(), VIEW).add('card', solids.plane({ size: 1 }), { shade: { fill: 1 } });
    expectKN(() => bare.draw(), 'KN-100', 'solids({ shade: { canvas } })');
    for (const [options, where] of [
      [{ dropShadow: { blur: -1 } }, 'solids({ dropShadow: { blur } })'],
      [{ dropShadow: { offset: 4 } }, 'solids({ dropShadow: { offset } })'],
      [{ dropShadow: { color: 0 } }, 'solids({ dropShadow: { color } })'],
    ]) expectKN(() => solids(g, options), 'KN-100', where);
    const stage = solids(g, VIEW).add('a', solids.plane({ size: 1 })).add('b', solids.null(), { parent: 'a' }).add('list', solids.faces([{ pts: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] }]));
    expectKN(() => stage.add('c', solids.plane({ size: 1 }), { rim: 'x' }), 'KN-100', 'solids: add("c").rim');
    expectKN(() => stage.add('c', solids.plane({ size: 1 }), { casts: null }), 'KN-100', 'solids: add("c").casts');
    expectKN(() => stage.add('c', solids.plane({ size: 1 }), { order: '1' }), 'KN-100', 'solids: add("c").order');
    expectKN(() => stage.add('c', solids.plane({ size: 1 }), { clip: { invert: true } }), 'KN-100', 'solids: add("c").clip');
    expectKN(() => stage.add('c', solids.plane({ size: 1 }), { pivot: [0, 0] }), 'KN-100', 'solids: add("c").pivot');
    expectKN(() => stage.add('c', solids.plane({ size: 1 }), { color: ['red', 'blue'] }), 'KN-100', 'solids: add("c").color');
    expectKN(() => stage.add('c', solids.plane({ size: 1 }), { parent: 7 }), 'KN-100', 'solids: add("c").parent');
    expectKN(() => stage.set('a', { parent: 'b' }), 'KN-100', 'solids: set("a").parent');
    expectKN(() => stage.set('a', { parent: 'a' }), 'KN-100', 'solids: set("a").parent');
    expectKN(() => stage.set('a', { pivot: 'middle' }), 'KN-100', 'solids: set("a").pivot');
    expectKN(() => stage.set('a', { order: NaN }), 'KN-100', 'solids: set("a").order');
    expectKN(() => stage.set('a', { casts: '1' }), 'KN-100', 'solids: set("a").casts');
    expectKN(() => stage.set('a', { color: { gradient: ['#ff0000'] } }), 'KN-100', 'solids: set("a").color');
    expectKN(() => stage.set('a', { side: { left: { color: '#ff0000' } } }), 'KN-100', 'solids: set("a").side.left');
    expectKN(() => stage.set('a', { side: { front: { glow: 1 } } }), 'KN-100', 'solids: set("a").side.front.glow');
    expectKN(() => stage.set('a', { side: { front: 'red' } }), 'KN-100', 'solids: set("a").side.front');
    expectKN(() => stage.set('a', { side: ['red'] }), 'KN-100', 'solids: set("a").side');
    expectKN(() => stage.set('a', { shade: { speck: 1 } }), 'KN-100', 'solids: set("a").shade');
    expectKN(() => stage.set('a', { shape: 3 }), 'KN-100', 'solids: set("a").shape');
    expectKN(() => stage.set('list', { shape: { size: 1 } }), 'KN-100', 'solids: set("list").shape');
    expectKN(() => stage.set('a', { shape: { size: -1 } }), 'KN-100', 'solids.plane({ size })');
    // Nothing of a refused call is kept: the stage draws, and a's parent is none.
    expect(() => stage.draw()).not.toThrow();
    expect(drawn(g).length).toBe(2);
  });
});
