/**
 * The helpers inside scenes, in the shapes the README and the skill's
 * patterns teach: a keyframes entry read by a data-list row, a stagger built with
 * styleAt() over split() rows, depth bands whose blur comes from focus() and a
 * `plane` track, a static pool written in seek(local) from a keyframes track read
 * there, the sound patterns (music under a scene, a sound on a cut, bars from
 * spectrum(), a pulse from level()), and captions() over a query's rows. Each
 * is checked at seeks in two different orders, as check() and a render would
 * visit them.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, dispatchSeek, uniqueName, captureWarnings, tone, wavUrl, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const scenesToDrop = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

// The frame for each time, visited in `order`, then again in another order;
// returns the first visit's snapshots after checking the second matches.
async function bothOrders(times, snap) {
  const first = {};
  for (const t of times) { await dispatchSeek(t).done; first[t] = snap(); }
  const second = {};
  for (const t of times.slice().reverse()) { await dispatchSeek(t).done; second[t] = snap(); }
  expect(second).toEqual(first);
  return first;
}

describe(`helpers in scenes (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a data-list row reads the scene's keyframes entry by name and follows every seek", async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const name = uniqueName('keyrows');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: { rise: { opacity: { at: [0, 1], to: [0, 1] }, translateY: { at: [0, 1], to: [30, 0] } } },
      state: { items: [{ k: 1 }, { k: 2 }] },
    });
    const el = await mount(`<div data-composition-id="pt1" data-start="0" data-duration="4"><div data-component="${name}" data-start="1"><ul data-list="items" data-key="k"><template><li data-bind-style="rise"></li></template></ul></div></div>`);
    cleanup.push(el);
    const frames = await bothOrders([1.25, 2.5, 1.5], () => [...el.querySelectorAll('li')].map((li) => li.style.opacity + ' ' + li.style.transform).join(' | '));
    expect(frames[1.25]).toBe('0.25 translate(0px, 22.5px) | 0.25 translate(0px, 22.5px)');
    expect(frames[1.5]).toBe('0.5 translate(0px, 15px) | 0.5 translate(0px, 15px)');
    expect(frames[2.5]).toBe('1 translate(0px, 0px) | 1 translate(0px, 0px)');
  });

  it('a stagger: split() rows each styled at local minus its own delay, the same in any seek order', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const { split, styleAt } = wf.kinetic;
    const RISE = { opacity: { at: [0, 0.4], to: [0, 1] }, translateY: { at: [0, 0.4], to: [20, 0] } };
    const name = uniqueName('stagger');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      computed: { letters() { return split('Go!').map((r) => Object.assign({}, r, { style: styleAt(this.local - r.i * 0.1, RISE) })); } },
    });
    const el = await mount(`<div data-composition-id="pt2" data-start="0" data-duration="3"><div data-component="${name}" data-start="0.5"><h1 data-list="letters" data-key="key"><template><span data-bind="text" data-bind-style="style"></span></template></h1></div></div>`);
    cleanup.push(el);
    const frames = await bothOrders([0.7, 0.6, 1.5], () => [...el.querySelectorAll('span')].map((s) => s.textContent + ':' + s.style.opacity).join(' '));
    // At local 0.2 the letters have had 0.2, 0.1 and 0 s of their 0.4 s rise.
    expect(frames[0.7]).toBe('G:0.5 o:0.25 !:0');
    expect(frames[0.6]).toBe('G:0.25 o:0 !:0');
    expect(frames[1.5]).toBe('G:1 o:1 !:1');
  });

  it("depth bands: focus() of each band's depth against a keyframes `plane` track, quantised by steps", async () => {
    const { wf } = await load();
    const { focus, interpolate } = wf.kinetic;
    const BANDS = { far: -900, mid: -450, near: 0 };
    const PLANE = { at: [0.5, 4.5], to: [-900, 0], ease: 'power2.inOut' };
    const blur = (z, t) => 'blur(' + focus(z, interpolate(t, PLANE.at, PLANE.to, { ease: PLANE.ease }), { range: 300, steps: 6 }) + 'px)';
    const name = uniqueName('bands');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: { plane: PLANE },
      computed: {
        far() { return { filter: 'blur(' + focus(BANDS.far, this.plane, { range: 300, steps: 6 }) + 'px)' }; },
        mid() { return { filter: 'blur(' + focus(BANDS.mid, this.plane, { range: 300, steps: 6 }) + 'px)' }; },
        near() { return { filter: 'blur(' + focus(BANDS.near, this.plane, { range: 300, steps: 6 }) + 'px)' }; },
      },
    });
    const el = await mount(`<div data-composition-id="pt3" data-start="0" data-duration="5"><div data-component="${name}" data-start="0">
      <div class="far" data-bind-style="far"></div><div class="mid" data-bind-style="mid"></div><div class="near" data-bind-style="near"></div>
    </div></div>`);
    cleanup.push(el);
    const times = [0.5, 2.5, 4.5, 1.7];
    const frames = await bothOrders(times, () => ['far', 'mid', 'near'].map((k) => el.querySelector('.' + k).style.filter));
    for (const t of times) expect(frames[t], 'at ' + t).toEqual([blur(-900, t), blur(-450, t), blur(0, t)]);
    expect(frames[0.5][0]).toBe('blur(0px)');     // the plane starts on the far band
    expect(frames[4.5][2]).toBe('blur(0px)');     // and ends on the near one
    expect(frames[2.5][1]).toBe('blur(0px)');     // halfway, on the middle one
  });

  it('a static pool filled in init() and written in seek(local) from a keyframes track holds each frame when the seek settles', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.pools === false) skip();   // nano, mini: no pools
    const { random, focus, interpolate } = wf.kinetic;
    const COUNT = 12;
    const PLANE = { at: [0, 2], to: [-1000, 0] };
    const name = uniqueName('bokeh');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      pools: { lights: {} },
      keyframes: { plane: PLANE },
      init() {
        const rnd = random(23);
        for (let i = 0; i < COUNT; i++) this.pools.lights.add({ id: i, z: Math.round(-rnd() * 1000), style: {} });
      },
      seek() {
        this.pools.lights.forEach((l) => {
          this.pools.lights.update(l.id, { style: { width: (4 + 20 * focus(l.z, this.plane, { range: 200, max: 1 })).toFixed(2) + 'px' } });
        });
      },
    });
    const el = await mount(`<div data-composition-id="pt4" data-start="0" data-duration="2"><div data-component="${name}" data-start="0">
      <div class="lights" data-pool="lights" data-key="id" data-pool-static><template><i data-bind-style="style"></i></template></div>
    </div></div>`);
    cleanup.push(el);
    const zs = (() => { const rnd = random(23); return Array.from({ length: COUNT }, () => Math.round(-rnd() * 1000)); })();
    const expected = (t) => zs.map((z) => Number((4 + 20 * focus(z, interpolate(t, PLANE.at, PLANE.to), { range: 200, max: 1 })).toFixed(2)));
    const times = [1.5, 0.25, 1];
    const frames = await bothOrders(times, () => [...el.querySelectorAll('.lights i')].map((i) => parseFloat(i.style.width)));
    for (const t of times) expect(frames[t], 'at ' + t).toEqual(expected(t));
  });

  it("one scene, several clips: text in each clip's markup, a data- attribute read in a computed, and a colour on each clip's root", async () => {
    const { wf } = await load();
    const { typewriter } = wf.kinetic;
    const name = uniqueName('namecard');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      edges: { enter: 0.4, exit: 0.4 },
      root: { style: { background: 'background', opacity: 'presence' } },
      keyframes: { slide: { translateX: { at: [0, 0.5], to: [-40, 0], ease: 'power3.out' } } },
      computed: {
        background() { return this.element.dataset.color; },
        role() { return typewriter(this.local - 0.3, this.element.dataset.role, 24); },
      },
    });
    const card = (start, who, role, color) => `<div class="card" data-component="${name}" data-start="${start}" data-duration="2" data-role="${role}" data-color="${color}">`
      + `<div data-bind-style="slide"><h2>${who}</h2><p data-bind="role"></p></div></div>`;
    const el = await mount(`<div data-composition-id="pt6" data-start="0" data-duration="6">${card(0, 'Ada Lovelace', 'Director', '#892dbf')}${card(2, 'Grace Hopper', 'Engineer', '#2d5fbf')}${card(4, 'Katherine Johnson', 'Mathematician', '#bf6a2d')}</div>`);
    cleanup.push(el);
    const cards = () => [...el.querySelectorAll('.card')].map((c) => [c.querySelector('h2').textContent, c.querySelector('p').textContent, c.style.background, c.style.opacity].join(' / '));
    // The colour as this browser writes it back.
    const css = (c) => { const i = document.createElement('i'); i.style.background = c; return i.style.background; };
    const frames = await bothOrders([0.2, 3, 5.5], cards);
    expect(frames[0.2][0]).toBe('Ada Lovelace /  / ' + css('#892dbf') + ' / 0.5');
    expect(frames[3][1]).toBe('Grace Hopper / Engineer / ' + css('#2d5fbf') + ' / 1');
    expect(frames[5.5][2]).toBe('Katherine Johnson / ' + typewriter(1.5 - 0.3, 'Mathematician', 24) + ' / ' + css('#bf6a2d') + ' / 1');
  });

  // The five patterns for the transform keys and text tracks, with the scene
  // code the patterns page shows. Values are compared as this browser writes
  // them back.
  const cssOf = (prop, v) => { const i = document.createElement('i'); i.style[prop] = v; return i.style[prop]; };

  it('a card that turns over: rotateY under perspective, two faces with backface-visibility hidden', async () => {
    const { wf } = await load();
    const name = uniqueName('turn');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        card: {
          perspective: { at: [0, 3], to: [1200, 1200] },
          translateZ:  { at: [1, 1.4, 1.8], to: [0, 120, 0], ease: ['power2.out', 'power2.in'] },
          rotateY:     { at: [1, 1.8], to: [0, 180], ease: 'power3.inOut' },
        },
      },
    });
    const face = 'position: absolute; inset: 0; backface-visibility: hidden;';
    const el = await mount(`<div data-composition-id="pt7" data-start="0" data-duration="3" style="position: relative; width: 400px; height: 300px">
      <div style="position: absolute; inset: 0" data-component="${name}" data-start="0">
        <div class="card" style="position: absolute; left: 100px; top: 50px; width: 200px; height: 200px; transform-style: preserve-3d" data-bind-style="card">
          <div class="front" style="${face} background: #c8452d">Question</div>
          <div class="back" style="${face} background: #102040; transform: rotateY(180deg)">Answer</div>
        </div>
      </div></div>`);
    cleanup.push(el);
    const card = el.querySelector('.card');
    const facing = () => {
      const r = el.firstElementChild.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + 200, r.top + 150);
      return hit && hit.className;
    };
    const frames = await bothOrders([0.5, 1.4, 2.5], () => card.style.transform + ' | ' + facing());
    expect(frames[0.5]).toBe(cssOf('transform', 'perspective(1200px) translateZ(0px) rotateY(0deg)') + ' | front');
    expect(frames[1.4].split(' | ')[0]).toBe(cssOf('transform', 'perspective(1200px) translateZ(120px) rotateY(90deg)'));
    expect(frames[2.5]).toBe(cssOf('transform', 'perspective(1200px) translateZ(0px) rotateY(180deg)') + ' | back');
  });

  it('a wipe: a clipPath text track over inset(), in from the left and out to the right', async () => {
    const { wf } = await load();
    const name = uniqueName('wipe');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        panel: {
          clipPath: {
            at: [0, 0.8, 3, 3.8],
            to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 100%)'],
            ease: ['power3.out', 'linear', 'power3.in'],
          },
        },
      },
    });
    const el = await mount(`<div data-composition-id="pt8" data-start="0" data-duration="4"><div data-component="${name}" data-start="0">
      <div class="panel" data-bind-style="panel"><h2>Chapter two</h2></div>
    </div></div>`);
    cleanup.push(el);
    const frames = await bothOrders([0, 0.4, 2, 3.4, 3.9], () => el.querySelector('.panel').style.clipPath);
    expect(frames[0]).toBe(cssOf('clipPath', 'inset(0% 100% 0% 0%)'));
    expect(frames[0.4]).toBe(cssOf('clipPath', 'inset(0% 6.25% 0% 0%)'));     // power3.out at 0.5 is 1 - 0.5^4
    expect(frames[2]).toBe(cssOf('clipPath', 'inset(0% 0% 0% 0%)'));
    expect(frames[3.4]).toBe(cssOf('clipPath', 'inset(0% 0% 0% 6.25%)'));     // power3.in at 0.5 is 0.5^4
    expect(frames[3.9]).toBe(cssOf('clipPath', 'inset(0% 0% 0% 100%)'));
  });

  it('an iris: a clipPath text track over circle(), open from the centre and closed onto a point', async () => {
    const { wf } = await load();
    const name = uniqueName('iris');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        shot: {
          clipPath: {
            at: [0, 1, 2.8, 3.6],
            to: ['circle(0% at 50% 50%)', 'circle(75% at 50% 50%)', 'circle(75% at 50% 50%)', 'circle(0% at 72% 38%)'],
            ease: ['expo.out', 'linear', 'power2.in'],
          },
        },
      },
    });
    const el = await mount(`<div data-composition-id="pt9" data-start="0" data-duration="4"><div data-component="${name}" data-start="0">
      <div class="shot" data-bind-style="shot"></div>
    </div></div>`);
    cleanup.push(el);
    const frames = await bothOrders([0, 2, 3.2, 3.9], () => el.querySelector('.shot').style.clipPath);
    expect(frames[0]).toBe(cssOf('clipPath', 'circle(0% at 50% 50%)'));
    expect(frames[2]).toBe(cssOf('clipPath', 'circle(75% at 50% 50%)'));
    expect(frames[3.2]).toBe(cssOf('clipPath', 'circle(65.625% at 52.75% 48.5%)'));   // power2.in at 0.5 is 0.5^3
    expect(frames[3.9]).toBe(cssOf('clipPath', 'circle(0% at 72% 38%)'));
  });

  it('a shadow that lifts: a filter text track over drop-shadow() with a colour in it, beside the transform keys', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const TILE = {
      translateY: { at: [0.5, 1.1], to: [0, -18], ease: 'power2.out' },
      scale:      { at: [0.5, 1.1], to: [1, 1.04], ease: 'power2.out' },
      filter: {
        at: [0.5, 1.1],
        to: ['drop-shadow(0px 2px 3px rgba(20, 16, 48, 0.35))', 'drop-shadow(0px 22px 28px rgba(20, 16, 48, 0.25))'],
        ease: 'power2.out',
      },
    };
    const name = uniqueName('lift');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, { keyframes: { tile: TILE } });
    const el = await mount(`<div data-composition-id="pt10" data-start="0" data-duration="3"><div data-component="${name}" data-start="0">
      <div class="tile" data-bind-style="tile">Pick me</div>
    </div></div>`);
    cleanup.push(el);
    const tile = () => { const s = el.querySelector('.tile').style; return [s.transform, s.filter]; };
    const frames = await bothOrders([0, 0.8, 2], tile);
    expect(frames[0]).toEqual([cssOf('transform', 'translate(0px, 0px) scale(1)'), cssOf('filter', 'drop-shadow(0px 2px 3px rgba(20, 16, 48, 0.35))')]);
    expect(frames[2]).toEqual([cssOf('transform', 'translate(0px, -18px) scale(1.04)'), cssOf('filter', 'drop-shadow(0px 22px 28px rgba(20, 16, 48, 0.25))')]);
    const mid = styleAt(0.8, TILE);
    expect(mid.filter).toMatch(/^drop-shadow\(0px 19\.5px 24\.875px rgba\(20, 16, 48, 0\.26\d?\)\)$/);
    expect(frames[0.8]).toEqual([cssOf('transform', mid.transform), cssOf('filter', mid.filter)]);
  });

  it('weight that breathes: a fontVariationSettings text track over two axes of a variable font', async () => {
    const { wf } = await load();
    const name = uniqueName('breathe');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        word: {
          fontVariationSettings: {
            at: [0, 2, 4],
            to: ['"wght" 200, "wdth" 75', '"wght" 900, "wdth" 125', '"wght" 200, "wdth" 75'],
            ease: 'sine.inOut',
          },
        },
      },
    });
    // No font file here: the track's values are what the test reads.
    const el = await mount(`<div data-composition-id="pt11" data-start="0" data-duration="4"><div data-component="${name}" data-start="0">
      <h1 class="word" data-bind-style="word">Breathe</h1>
    </div></div>`);
    cleanup.push(el);
    const frames = await bothOrders([0, 1, 2, 3], () => el.querySelector('.word').style.fontVariationSettings);
    expect(frames[0]).toBe(cssOf('fontVariationSettings', '"wght" 200, "wdth" 75'));
    expect(frames[1]).toBe(cssOf('fontVariationSettings', '"wght" 550, "wdth" 100'));   // sine.inOut at 0.5 is 0.5
    expect(frames[2]).toBe(cssOf('fontVariationSettings', '"wght" 900, "wdth" 125'));
    expect(frames[3]).toBe(cssOf('fontVariationSettings', '"wght" 550, "wdth" 100'));
  });

  // The five patterns for paths and shapes, with the scene code the patterns
  // page shows.
  const commands = (d) => (d.match(/[MLHVCSQTAZ]/gi) || []).join('');
  const centreIn = (el, box) => {
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    return [r.left + r.width / 2 - b.left, r.top + r.height / 2 - b.top];
  };

  it('lines that draw themselves: a strokeDashoffset track from 1 to 0 on paths with pathLength="1", one path per stroke, staggered', async () => {
    const { wf } = await load();
    const name = uniqueName('sign');
    scenesToDrop.push(name);
    const draw = (from, to) => ({ strokeDashoffset: { at: [from, to], to: [1, 0], ease: 'power2.inOut' } });
    wf.kinetic.scene(name, {
      keyframes: { s1: draw(0.2, 1.2), s2: draw(0.8, 1.8), s3: draw(1.4, 2.4) },
    });
    const stroke = 'fill: none; stroke: #f5c542; stroke-width: 8; stroke-linecap: round; stroke-dasharray: 1';
    const el = await mount(`<div data-composition-id="pt12" data-start="0" data-duration="3"><div data-component="${name}" data-start="0">
      <svg viewBox="0 0 1280 720" width="1280" height="720">
        <path pathLength="1" style="${stroke}" d="M 200 400 C 300 200 450 200 520 380" data-bind-style="s1"></path>
        <path pathLength="1" style="${stroke}" d="M 560 380 L 640 220 L 720 380" data-bind-style="s2"></path>
        <path pathLength="1" style="${stroke}" d="M 760 300 C 860 200 980 420 1080 300" data-bind-style="s3"></path>
      </svg>
    </div></div>`);
    cleanup.push(el);
    const frames = await bothOrders([0, 0.7, 1.3, 2.5], () => [...el.querySelectorAll('path')].map((p) => p.style.strokeDashoffset));
    const css = (...v) => v.map((x) => cssOf('strokeDashoffset', String(x)));
    expect(frames[0]).toEqual(css(1, 1, 1));
    expect(frames[0.7]).toEqual(css(0.5, 1, 1));     // power2.inOut at 0.5 is 0.5
    expect(frames[1.3]).toEqual(css(0, 0.5, 1));
    expect(frames[2.5]).toEqual(css(0, 0, 0));
  });

  it('along a path: offset-path with offset-rotate: auto and an offsetDistance track in %, the mover at left: 0; top: 0, its centre on the path', async () => {
    const { wf } = await load();
    const name = uniqueName('flight');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        plane: { offsetDistance: { at: [0.3, 3.5], to: [0, 100], unit: '%', ease: 'power1.inOut' } },
      },
    });
    const ROUTE = 'M 160 560 C 400 80 880 80 1120 560';
    const el = await mount(`<div data-composition-id="pt13" data-start="0" data-duration="4" style="position: relative; width: 1280px; height: 720px">
      <div style="position: absolute; inset: 0" data-component="${name}" data-start="0">
        <svg viewBox="0 0 1280 720" width="1280" height="720" style="position: absolute; inset: 0"><path class="route" d="${ROUTE}" style="fill: none; stroke: #334"></path></svg>
        <div class="plane" style="position: absolute; left: 0; top: 0; width: 40px; height: 20px; offset-path: path('${ROUTE}'); offset-rotate: auto" data-bind-style="plane"></div>
      </div></div>`);
    cleanup.push(el);
    const route = el.querySelector('.route'), plane = el.querySelector('.plane'), stage = el.firstElementChild;
    const frames = await bothOrders([0, 1.9, 3.5], () => plane.style.offsetDistance);
    expect(frames[0]).toBe(cssOf('offsetDistance', '0%'));
    expect(frames[1.9]).toBe(cssOf('offsetDistance', '50%'));   // power1.inOut at 0.5 is 0.5
    expect(frames[3.5]).toBe(cssOf('offsetDistance', '100%'));
    const len = route.getTotalLength();
    for (const [t, f] of [[0, 0], [1.9, 0.5], [3.5, 1]]) {
      await dispatchSeek(t).done;
      const p = route.getPointAtLength(len * f), c = centreIn(plane, stage);
      expect(Math.hypot(c[0] - p.x, c[1] - p.y), 'at ' + t).toBeLessThan(1);
    }
  });

  it('a shape that becomes another: matchPaths() on a square and a circle, and on a triangle and an octagon at 24 segments, turning about its own centre', async () => {
    const { wf } = await load();
    const { matchPaths, shape, interpolate } = wf.kinetic;
    const SQUARE = 'M -100 -100 H 100 V 100 H -100 Z';
    const CIRCLE = 'M 0 -120 A 120 120 0 1 1 0 120 A 120 120 0 1 1 0 -120 Z';
    const TRIANGLE = shape('polygon', { sides: 3, radius: 130 });
    const OCTAGON = shape('polygon', { sides: 8, radius: 120 });
    const name = uniqueName('morph');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        blob: { at: [0.3, 1.5], to: matchPaths([SQUARE, CIRCLE]), ease: 'power2.inOut' },
        turn: { rotate: { at: [0.3, 1.5], to: [0, 45], ease: 'power2.inOut' } },
        poly: { at: [1, 2.6], to: matchPaths([TRIANGLE, OCTAGON], { segments: 24 }), ease: 'power2.inOut' },
      },
    });
    const el = await mount(`<div data-composition-id="pt14" data-start="0" data-duration="3"><div data-component="${name}" data-start="0">
      <svg viewBox="0 0 1280 720" width="1280" height="720">
        <g transform="translate(400 360)"><path class="blob" style="fill: #f5c542; transform-box: fill-box; transform-origin: center" data-bind-attr="{ d: blob }" data-bind-style="turn"></path></g>
        <g transform="translate(880 360)"><path class="poly" style="fill: #f5c542" data-bind-attr="{ d: poly }"></path></g>
      </svg>
    </div></div>`);
    cleanup.push(el);
    const blob = el.querySelector('.blob'), poly = el.querySelector('.poly'), svg = el.querySelector('svg');
    const frames = await bothOrders([0, 0.9, 1.8, 3], () => [blob.getAttribute('d'), poly.getAttribute('d'), blob.style.transform]);
    const BLOB = matchPaths([SQUARE, CIRCLE]), POLY = matchPaths([TRIANGLE, OCTAGON], { segments: 24 });
    expect(frames[0][0]).toBe(BLOB[0]);
    expect(frames[0.9][0]).toBe(interpolate(0.9, [0.3, 1.5], BLOB, { ease: 'power2.inOut' }));
    expect(frames[3][0]).toBe(BLOB[1]);
    expect(frames[1.8][1]).toBe(interpolate(1.8, [1, 2.6], POLY, { ease: 'power2.inOut' }));
    expect(commands(frames[1.8][1])).toBe('M' + 'C'.repeat(24) + 'Z');
    expect(frames[0.9][2]).toBe(cssOf('transform', 'rotate(22.5deg)'));
    // Turned about the centre of its own box, the shape stays where its <g> put it.
    await dispatchSeek(0.9).done;
    const c = centreIn(blob, svg);
    expect(Math.hypot(c[0] - 400, c[1] - 360)).toBeLessThan(1);
  });

  it('a star that breathes and a pie that fills: shape() in computeds, its numbers from keyframes tracks', async () => {
    const { wf } = await load();
    const { shape } = wf.kinetic;
    const name = uniqueName('gauges');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        inner: { at: [0, 1, 2, 3, 4], to: [40, 80, 40, 80, 40], ease: 'sine.inOut' },
        sweep: { at: [0.5, 3.5], to: [0, 360], ease: 'power2.inOut' },
      },
      computed: {
        star() { return shape('star', { points: 5, outer: 120, inner: this.inner, cx: 400, cy: 360 }); },
        pie() { return shape('sector', { radius: 120, to: this.sweep, cx: 880, cy: 360 }); },
      },
    });
    const el = await mount(`<div data-composition-id="pt15" data-start="0" data-duration="4"><div data-component="${name}" data-start="0">
      <svg viewBox="0 0 1280 720" width="1280" height="720">
        <path class="star" style="fill: #f5c542" data-bind-attr="{ d: star }"></path>
        <path class="pie" style="fill: #c8452d" data-bind-attr="{ d: pie }"></path>
      </svg>
    </div></div>`);
    cleanup.push(el);
    const d = (k) => el.querySelector('.' + k).getAttribute('d') || '';
    const frames = await bothOrders([0.25, 1, 2, 3.8], () => [d('star'), d('pie')]);
    expect(frames[1][0]).toBe(shape('star', { points: 5, outer: 120, inner: 80, cx: 400, cy: 360 }));
    expect(frames[2][0]).toBe(shape('star', { points: 5, outer: 120, inner: 40, cx: 400, cy: 360 }));
    expect(frames[0.25][1]).toBe('');                                                        // 0 degrees: nothing drawn
    expect(frames[2][1]).toBe(shape('sector', { radius: 120, to: 180, cx: 880, cy: 360 }));   // power2.inOut at 0.5 is 0.5
    expect(commands(frames[3.8][1])).toBe('MAAZ');                                           // 360: a closed circle
  });

  it('a clip that changes shape: a clipPath track over polygon() with the same points in every keyframe, and one over path() from matchPaths()', async () => {
    const { wf } = await load();
    const { matchPaths, shape, interpolate } = wf.kinetic;
    const [STAR, DISC] = matchPaths([
      'path("' + shape('star', { points: 5, outer: 200, inner: 90, cx: 640, cy: 360 }) + '")',
      'path("' + shape('sector', { radius: 260, to: 360, cx: 640, cy: 360 }) + '")',
    ]);
    const OPEN = ['polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)', 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'];
    const name = uniqueName('reveal');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        photo: { clipPath: { at: [0, 0.6, 1.4], to: OPEN, ease: ['power2.out', 'power2.inOut'] } },
        badge: { clipPath: { at: [1.4, 2.6], to: [STAR, DISC], ease: 'power2.inOut' } },
      },
    });
    const el = await mount(`<div data-composition-id="pt16" data-start="0" data-duration="3" style="position: relative; width: 1280px; height: 720px">
      <div style="position: absolute; inset: 0" data-component="${name}" data-start="0">
        <div class="photo" style="position: absolute; inset: 0; background: #2d5fbf" data-bind-style="photo"></div>
        <div class="badge" style="position: absolute; inset: 0; background: #f5c542" data-bind-style="badge"></div>
      </div></div>`);
    cleanup.push(el);
    const clip = (k) => el.querySelector('.' + k).style.clipPath;
    const frames = await bothOrders([0, 0.3, 1, 2, 2.8], () => [clip('photo'), clip('badge')]);
    for (const t of [0, 0.3, 1, 2, 2.8]) {
      expect(frames[t][0], 'photo at ' + t).toBe(cssOf('clipPath', interpolate(t, [0, 0.6, 1.4], OPEN, { ease: ['power2.out', 'power2.inOut'] })));
      expect(frames[t][1], 'badge at ' + t).toBe(cssOf('clipPath', interpolate(t, [1.4, 2.6], [STAR, DISC], { ease: 'power2.inOut' })));
    }
    expect(frames[2][1]).not.toBe('');
    expect(STAR.startsWith('path("M ')).toBe(true);
  });

  // The five patterns for transitions, with the markup and scene code the
  // patterns page shows. The expected styles come from transition(), whose
  // own values transitions.test.js checks against the table.
  const owned = (el) => ['opacity', 'translate', 'scale', 'rotate', 'clip-path', 'filter', 'z-index']
    .map((k) => el.style.getPropertyValue(k) ? k + ': ' + el.style.getPropertyValue(k) : '').filter(Boolean).join('; ');
  // A style object from transition() as owned() reads it back from an element.
  const asCss = (style) => {
    const i = document.createElement('i');
    for (const k of Object.keys(style)) i.style.setProperty(k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), String(style[k]));
    return owned(i);
  };
  // p for a window from w0 to w1 at 30 fps: 1 on the window's last frame.
  const pOf = (t, w0, w1) => Math.min(1, Math.max(0, (t - w0) / (w1 - w0 - 1 / 30)));

  it('a push between two scenes: data-clip-transition on the second scene turns the overlap its data-start makes into a push', async () => {
    const { wf } = await load();
    const { interpolate, format, transition, ease } = wf.kinetic;
    const title = uniqueName('title'), numbers = uniqueName('numbers');
    scenesToDrop.push(title, numbers);
    wf.kinetic.scene(title, {
      keyframes: {
        rise: { opacity: { at: [0.2, 0.8], to: [0, 1] }, translateY: { at: [0.2, 0.8], to: [40, 0], ease: 'power3.out' } },
      },
    });
    wf.kinetic.scene(numbers, {
      computed: {
        orders() { return format(Math.round(interpolate(this.local, [0.6, 2], [0, 48200], { ease: 'power2.out' }))) + ' orders'; },
      },
    });
    const el = await mount(`<div data-composition-id="pt17" data-start="0" data-duration="6" data-fps="30">
      <div id="intro" class="layer" data-component="${title}" data-start="0" data-duration="3">
        <h1 data-bind-style="rise">Northwind</h1>
      </div>
      <div class="layer next" data-component="${numbers}" data-start="intro - 0.6" data-duration="3.6"
           data-clip-transition="push from-right power3.inOut">
        <h2 data-bind="orders"></h2>
      </div>
    </div>`);
    cleanup.push(el);
    const intro = el.querySelector('#intro'), next = el.querySelector('.next');
    const times = [2.3, 2.4, 2.7, 3 - 1 / 30, 3.2];
    const frames = await bothOrders(times, () => [owned(intro), owned(next)]);
    for (const t of times) {
      const inside = t >= 2.4 && t < 3;
      const s = transition('push', ease('power3.inOut')(pOf(t, 2.4, 3)));
      expect(frames[t], 'at ' + t).toEqual(inside ? [asCss(s.out), asCss(s.in)] : ['', '']);
    }
    expect(frames[2.4]).toEqual(['', asCss({ translate: '100% 0%' })]);
    expect(frames[3 - 1 / 30]).toEqual([asCss({ translate: '-100% 0%' }), '']);
    expect(el.querySelector('h2').textContent).toMatch(/orders$/);
  });

  it('an iris into the next scene: the second clip opens from the centre over the first', async () => {
    const { wf } = await load();
    const { transition, ease } = wf.kinetic;
    const name = uniqueName('still');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: { drift: { scale: { at: [0, 4], to: [1, 1.08] } } },
    });
    const el = await mount(`<div data-composition-id="pt18" data-start="0" data-duration="6" data-fps="30">
      <div id="harbour" class="layer" data-component="${name}" data-start="0" data-duration="3">
        <div class="layer photo" data-bind-style="drift" style="background: #284860"></div>
      </div>
      <div id="market" class="layer" data-component="${name}" data-start="harbour - 0.8" data-duration="3.8"
           data-clip-transition="iris power2.out">
        <div class="layer photo" data-bind-style="drift" style="background: #806040"></div>
      </div>
    </div>`);
    cleanup.push(el);
    const harbour = el.querySelector('#harbour'), market = el.querySelector('#market');
    const times = [2.1, 2.2, 2.5, 2.8, 3 - 1 / 30, 3.5];
    const frames = await bothOrders(times, () => [owned(harbour), owned(market), market.querySelector('.photo').style.transform]);
    for (const t of times) {
      const inside = t >= 2.2 && t < 3;
      const s = transition('iris', ease('power2.out')(pOf(t, 2.2, 3)));
      expect(frames[t].slice(0, 2), 'at ' + t).toEqual(['', inside ? asCss(s.in) : '']);
    }
    expect(frames[2.2][1]).toBe(asCss({ clipPath: 'circle(0% at 50% 50%)' }));
    // The scene's own drift is on the layer inside, so it composes with the iris.
    expect(frames[2.5][2]).toBe(cssOf('transform', wf.kinetic.styleAt(0.3, { scale: { at: [0, 4], to: [1, 1.08] } }).transform));
  });

  it('a title that wipes in and fades out over a backdrop: data-clip-enter and data-clip-exit with lengths of their own', async () => {
    const { wf } = await load();
    const { transition, ease } = wf.kinetic;
    const name = uniqueName('sky');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: { bg: { at: [0, 6], to: ['#0b0f1a', '#181030'] } },
      root: { style: { background: 'bg' } },
    });
    const el = await mount(`<div data-composition-id="pt19" data-start="0" data-duration="6" data-fps="30">
      <div class="layer" data-component="${name}" data-start="0" data-duration="6"></div>
      <h1 class="title" data-start="1" data-duration="4"
          data-clip-enter="wipe from-left 0.6" data-clip-exit="fade 12f">Launch</h1>
    </div>`);
    cleanup.push(el);
    // The clock read the length of the first root this file mounted; the
    // exit's hold on the final instant needs this one's.
    wf.kinetic.config({});
    const h1 = el.querySelector('h1');
    const times = [0.9, 1, 1.3, 1.6, 3, 4.6, 4.8, 5 - 1 / 30, 5.2];
    const frames = await bothOrders(times, () => owned(h1));
    for (const t of times) {
      let want = '';
      if (t >= 1 && t < 1.6) want = asCss(transition('wipe', ease('power2.inOut')(pOf(t, 1, 1.6))).in);
      if (t >= 4.6 && t < 5) want = asCss(transition('fade', ease('power2.inOut')(pOf(t, 4.6, 5))).out);
      expect(frames[t], 'at ' + t).toBe(want);
    }
    expect(frames[1]).toBe(asCss({ clipPath: 'inset(0% 100% 0% 0%)' }));
    expect(frames[5 - 1 / 30]).toBe(asCss({ opacity: 0 }));
    expect(frames[4.6]).toBe('');
  });

  it('a sequence of four clips joined by different kinds, every overlap 18 frames: plain HTML, no scene, and check() passes', async () => {
    const { wf } = await load();
    const { transition, ease } = wf.kinetic;
    const el = await mount(`<div data-composition-id="pt20" data-start="0" data-duration="6" data-fps="30" style="position: relative; width: 640px; height: 360px; overflow: hidden">
      <div id="one" class="layer card" data-start="0" data-duration="2" data-clip-enter="fade 18f"><h2>Plan</h2></div>
      <div id="two" class="layer card" data-start="one - 0.6" data-duration="2" data-clip-transition="push from-bottom"><h2>Build</h2></div>
      <div id="three" class="layer card" data-start="two - 0.6" data-duration="2" data-clip-transition="clock"><h2>Ship</h2></div>
      <div id="four" class="layer card" data-start="three - 0.6" data-duration="1.8" data-clip-transition="zoom" data-clip-exit="fade 18f"><h2>Again</h2></div>
    </div>`);
    cleanup.push(el);
    wf.kinetic.config({});   // this root's length, as in the pattern before
    const ids = ['one', 'two', 'three', 'four'];
    const times = [0.3, 1.7, 3.1, 4.5, 5.7];
    const frames = await bothOrders(times, () => ids.map((id) => owned(el.querySelector('#' + id))));
    const pe = (t, w0, w1) => ease('power2.inOut')(pOf(t, w0, w1));
    expect(frames[0.3]).toEqual([asCss(transition('fade', pe(0.3, 0, 0.6)).in), '', '', '']);
    const push = transition('push', pe(1.7, 1.4, 2), { direction: 'from-bottom' });
    expect(frames[1.7]).toEqual([asCss(push.out), asCss(push.in), '', '']);
    expect(frames[3.1]).toEqual(['', '', asCss(transition('clock', pe(3.1, 2.8, 3.4)).in), '']);
    const zoom = transition('zoom', pe(4.5, 4.2, 4.8));
    expect(frames[4.5]).toEqual(['', '', asCss(zoom.out), asCss(zoom.in)]);
    expect(frames[5.7]).toEqual(['', '', '', asCss(transition('fade', pe(5.7, 5.4, 6)).out)]);
    const report = await wf.kinetic.check({ samples: 40 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
  });

  it('a transition inside a scene: transition() over ramp() flips a card from its question to its answer', async () => {
    const { wf } = await load();
    const { transition, ramp } = wf.kinetic;
    const name = uniqueName('quiz');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      computed: {
        turn() { return transition('flip', ramp(this.local, 1.6, 2.2, 'power2.inOut')); },
        question() { return this.turn.out; },
        answer() { return this.turn.in; },
      },
    });
    const el = await mount(`<div data-composition-id="pt21" data-start="0" data-duration="4" data-fps="30">
      <div class="layer" data-component="${name}" data-start="0" data-duration="4" style="perspective: 1200px">
        <div class="layer face question" data-bind-style="question"><h2>What is the capital of Australia?</h2></div>
        <div class="layer face answer" data-bind-style="answer"><h2>Canberra</h2></div>
      </div>
    </div>`);
    cleanup.push(el);
    const q = el.querySelector('.question'), a = el.querySelector('.answer');
    const times = [1, 1.75, 1.9, 2.05, 3];
    const frames = await bothOrders(times, () => [q.style.rotate, a.style.rotate]);
    for (const t of times) {
      const s = transition('flip', ramp(t, 1.6, 2.2, 'power2.inOut'));
      expect(frames[t], 'at ' + t).toEqual([s.out.rotate ? cssOf('rotate', s.out.rotate) : '', s.in.rotate ? cssOf('rotate', s.in.rotate) : '']);
    }
    expect(frames[1]).toEqual(['', cssOf('rotate', 'y 90deg')]);
    expect(frames[3]).toEqual([cssOf('rotate', 'y -90deg'), '']);
  });

  // The four patterns for sound. Each file is generated here; the markup and
  // the scene code are the patterns page's.

  it('music under a scene: an <audio> clip with a volume and fades under a title, and check() passes', async () => {
    const { wf } = await load();
    const { level } = wf.kinetic;
    const name = uniqueName('title');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      keyframes: {
        heading: { opacity: { at: [0.5, 1.5], to: [0, 1] }, translateY: { at: [0.5, 1.5], to: [30, 0], ease: 'power3.out' } },
      },
    });
    const el = await mount(`<div data-composition-id="pt22" data-start="0" data-duration="6" data-fps="30">
      <audio id="music" src="${wavUrl(tone(220, 6, 0.4))}" data-start="0" data-duration="6" data-volume="0.8" data-fade-in="1" data-fade-out="2"></audio>
      <div class="layer" data-component="${name}" data-start="0" data-duration="6">
        <h1 data-bind-style="heading">Northwind</h1>
      </div>
    </div>`);
    cleanup.push(el);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const frames = await bothOrders([0.5, 1, 3], () => el.querySelector('h1').style.opacity);
    expect(frames[3]).toBe('1');
    // The music is under the title from 0: quieter in its fades than between them.
    const at = (t) => level(t, 'all', { clip: 'music' });
    expect(at(0.5)).toBeLessThan(at(3));
    expect(at(5.5)).toBeLessThan(at(3));
    expect(at(3)).toBeGreaterThan(0.9);
    const report = await wf.kinetic.check({ samples: 20 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
  });

  it('a sound on a cut: an <audio> clip timed from the clip a push replaces starts with the push, and the push still applies', async () => {
    const { wf } = await load();
    const { level, transition, ease } = wf.kinetic;
    const whoosh = new Float32Array(48000 * 0.6);
    for (let i = 0; i < whoosh.length; i++) whoosh[i] = 0.5 * Math.sin(i * 0.37) * Math.sin(Math.PI * i / whoosh.length);
    let lines;
    let el;
    lines = await captureWarnings(async () => {
      el = await mount(`<div data-composition-id="pt23" data-start="0" data-duration="6" data-fps="30">
        <div id="intro" class="layer" data-start="0" data-duration="3"><h1>Plan</h1></div>
        <div class="layer next" data-start="intro - 0.6" data-duration="3.6" data-clip-transition="push from-right power3.inOut"><h1>Build</h1></div>
        <audio src="${wavUrl(whoosh)}" data-start="intro - 0.6" data-duration="0.6" data-volume="0.7"></audio>
      </div>`);
      wf.kinetic.config({});
      await wf.kinetic.ready();
    });
    cleanup.push(el);
    const intro = el.querySelector('#intro'), next = el.querySelector('.next');
    const frames = await bothOrders([2.2, 2.7], () => [owned(intro), owned(next)]);
    const s = transition('push', ease('power3.inOut')(pOf(2.7, 2.4, 3)));
    expect(frames[2.7]).toEqual([asCss(s.out), asCss(s.in)]);
    expect(frames[2.2]).toEqual(['', '']);
    expect(lines.filter((l) => /KN-11[56]/.test(l))).toEqual([]);
    // The whoosh is silent before the push and sounds during it.
    expect(level(1.5, 'all')).toBe(0);
    expect(level(2.7, 'all')).toBeGreaterThan(0.5);
  });

  it('bars that move with the music: spectrum() in a computed gives each row its height', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const { spectrum } = wf.kinetic;
    const name = uniqueName('bars');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      computed: {
        bars() {
          return spectrum(this.time, 16).map((v, i) => ({ key: i, style: { height: (4 + 296 * v).toFixed(1) + 'px' } }));
        },
      },
    });
    // A low note for the first second, then a high one.
    const music = tone(80, 2, 0.4);
    for (let i = 48000; i < music.length; i++) music[i] = 0.4 * Math.sin(2 * Math.PI * 4000 * i / 48000);
    const el = await mount(`<div data-composition-id="pt24" data-start="0" data-duration="2" data-fps="30">
      <audio id="music" src="${wavUrl(music)}" data-start="0"></audio>
      <div class="layer" data-component="${name}" data-start="0" data-duration="2">
        <div class="bars" data-list="bars" data-key="key"><template><i data-bind-style="style"></i></template></div>
      </div>
    </div>`);
    cleanup.push(el);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const heights = () => [...el.querySelectorAll('.bars i')].map((i) => parseFloat(i.style.height));
    const frames = await bothOrders([0.5, 1.5], heights);
    expect(frames[0.5].length).toBe(16);
    for (const t of [0.5, 1.5]) expect(frames[t]).toEqual(spectrum(t, 16).map((v) => Number((4 + 296 * v).toFixed(1))));
    // The low note lifts the bars on the left, the high note those on the right.
    expect(Math.max(...frames[0.5].slice(0, 4))).toBeGreaterThan(250);
    expect(Math.max(...frames[0.5].slice(12))).toBeLessThan(40);
    expect(frames[1.5].indexOf(Math.max(...frames[1.5]))).toBeGreaterThan(10);
  });

  it('a pulse on the bass: level() in a computed scales a disc on each kick and lets it fall between', async () => {
    const { wf } = await load();
    const { level } = wf.kinetic;
    const name = uniqueName('kick');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      computed: {
        bass() { return level(this.time, 'bass'); },
        disc() { return { transform: 'scale(' + (1 + 0.25 * this.bass).toFixed(3) + ')' }; },
        glow() { return { opacity: (0.2 + 0.8 * this.bass).toFixed(3) }; },
      },
    });
    // A kick every half second: a tenth of a second of 60 Hz.
    const kicks = new Float32Array(48000 * 2);
    for (let i = 0; i < kicks.length; i++) if (i % 24000 < 4800) kicks[i] = 0.6 * Math.sin(2 * Math.PI * 60 * i / 48000);
    const el = await mount(`<div data-composition-id="pt25" data-start="0" data-duration="2" data-fps="30">
      <audio src="${wavUrl(kicks)}" data-start="0"></audio>
      <div class="layer" data-component="${name}" data-start="0" data-duration="2">
        <div class="glow" data-bind-style="glow"></div>
        <div class="disc" data-bind-style="disc"></div>
      </div>
    </div>`);
    cleanup.push(el);
    wf.kinetic.config({});
    await wf.kinetic.ready();
    const scale = () => Number(/scale\(([\d.]+)\)/.exec(el.querySelector('.disc').style.transform)[1]);
    // On a kick (1.05 s) and a third of a second after it (1.4 s).
    const frames = await bothOrders([1.05, 1.4], () => [scale(), Number(el.querySelector('.glow').style.opacity)]);
    expect(frames[1.05][0]).toBeGreaterThan(1.2);
    expect(frames[1.05][1]).toBeGreaterThan(0.8);
    expect(frames[1.4]).toEqual([1, 0.2]);
  });

  it("captions() over a query's rows: the line and its words follow the seeks, and a refresh with new words is seen", async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const { captions } = wf.kinetic;
    let words = [
      { id: 'w0', text: 'Every', start: 0, end: 0.3 },
      { id: 'w1', text: 'frame', start: 0.3, end: 0.6 },
      { id: 'w2', text: 'counts.', start: 0.6, end: 1 },
      { id: 'w3', text: 'Then', start: 2, end: 2.3 },
      { id: 'w4', text: 'more', start: 2.3, end: 2.6 },
    ];
    const qn = uniqueName('transcript');
    wf.query(qn, { from: () => Promise.resolve(words.map((w) => Object.assign({}, w))) });
    const name = uniqueName('captions');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      waitFor: [qn],
      computed: {
        line() { return captions(this.local, wf.getQuery(qn).rows); },
        words() { return this.line.words; },
      },
    });
    const el = await mount(`<div data-composition-id="pt5" data-start="0" data-duration="4"><div data-component="${name}" data-start="0">
      <p class="text" data-bind="line.text"></p>
      ${wf.features.lists === false ? '' : '<span class="words" data-list="words" data-key="key"><template><b><i class="t" data-bind="text"></i>/<i class="s" data-bind="state"></i></b></template></span>'}
    </div></div>`);
    cleanup.push(el);
    await wf.kinetic.ready();
    const snap = () => el.querySelector('.text').textContent + ' | ' + [...el.querySelectorAll('.words b')].map((b) => b.textContent).join(' ');
    const frames = await bothOrders([0.45, 1.2, 1.6, 2.4], snap);
    expect(frames[0.45]).toBe('Every frame counts. | Every/past frame/active counts./future');
    expect(frames[1.2]).toBe('Every frame counts. | Every/past frame/past counts./past');   // held 0.4 s after the line ends
    expect(frames[1.6]).toBe(' | ');                                                        // between lines: no rows
    expect(frames[2.4]).toBe('Then more | Then/past more/active');
    // The transcript is fetched again with a word corrected, the same number of words.
    words = words.map((w) => (w.id === 'w4' ? Object.assign({}, w, { text: 'again' }) : w));
    await wf.getQuery(qn).refresh();
    await tick(20);
    await dispatchSeek(2.45).done;
    expect(snap()).toBe('Then again | Then/past again/active');
  });
});
