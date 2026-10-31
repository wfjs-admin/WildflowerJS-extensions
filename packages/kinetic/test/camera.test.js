/**
 * camera(), depth() and shake(): the style a camera gives the world that
 * holds a scene's layers, the style that puts a layer at a depth, and the
 * shake offsets from layered noise. Pure functions first, then the geometry
 * measured in the browser (markers on layers inside a world with camera()'s
 * style, no perspective on any ancestor), then a scene with a camera that
 * check() passes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { load, mount, tick, captureWarnings, uniqueName, expectKN, expectKNText, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const REST = 'perspective(1000px) scale(1) translateZ(1000px) rotateZ(0deg) rotateX(0deg) rotateY(0deg) translateZ(-1000px) translate3d(0px, 0px, 0px)';

// The spec's formula, written out from the public noise(): what shake()
// gives for a number seed.
function fbmRef(noise, u, seed, octaves) {
  let sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += Math.pow(0.5, i) * noise(u * Math.pow(2.03, i) + 17.37 * i, seed + i); norm += Math.pow(0.5, i); }
  return sum / norm;
}
const PROFILES = { handheld: [0.7, 16, 11, 1.1, 4, 0], rumble: [7, 5.4, 7.2, 0.36, 2, 0], impact: [11, 61, 47, 4.3, 2, 0.32] };
function shakeRef(noise, t, name, seed) {
  const [hz, X, Y, R, oct, decay] = PROFILES[name];
  if (decay && t < 0) return { x: 0, y: 0, roll: 0 };
  const a = decay ? Math.exp(-t / decay) : 1;
  return {
    x: fbmRef(noise, t * hz, seed, oct) * X * a,
    y: fbmRef(noise, t * hz + 50.43, seed + 101, oct) * Y * a,
    roll: fbmRef(noise, t * hz + 90.71, seed + 202, oct) * R * a,
  };
}

// A 640 x 360 stage fixed at the page's top left, a world in it with
// `worldStyle`, and one full-frame layer per entry [style, left, top], each
// holding a 20 x 20 marker at (left, top) in the layer. No ancestor has a
// perspective; the world's style carries its own.
const W = 640, H = 360, CX = 320, CY = 180;
function rig(worldStyle, layers) {
  const stage = document.createElement('div');
  stage.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px`;
  const world = document.createElement('div');
  world.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
  Object.assign(world.style, worldStyle);
  stage.appendChild(world);
  const markers = layers.map(([style, left, top]) => {
    const layer = document.createElement('div');
    layer.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
    Object.assign(layer.style, style);
    const m = document.createElement('i');
    m.style.cssText = `position:absolute;display:block;width:20px;height:20px;left:${left}px;top:${top}px;background:#c33`;
    layer.appendChild(m);
    world.appendChild(layer);
    return m;
  });
  document.body.appendChild(stage);
  cleanup.push(stage);
  return { world, markers };
}
// An element's on-screen box as its centre and size.
const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };

// The properties that make an element draw its children flat.
const FLATTENING = [{ opacity: '0.5' }, { filter: 'blur(1px)' }, { overflow: 'hidden' }, { clipPath: 'inset(0px)' }, { maskImage: 'linear-gradient(#000, #000)' }, { mixBlendMode: 'multiply' }, { isolation: 'isolate' }];

// A black 300 x 200 stage that fits the test frame, for a screenshot, with a
// world (its first child) holding one full-frame layer per entry [style,
// left, top, size, colour], each with a square marker.
function smallStage(layers) {
  const stage = document.createElement('div');
  stage.style.cssText = 'position:fixed;left:0;top:0;width:300px;height:200px;background:#000';
  stage.innerHTML = '<div style="position:absolute;inset:0">' + layers.map(([, left, top, size, color]) => '<div style="position:absolute;left:0;top:0;width:300px;height:200px">'
    + `<i style="position:absolute;display:block;left:${left}px;top:${top}px;width:${size}px;height:${size}px;background:${color}"></i></div>`).join('') + '</div>';
  [...stage.firstElementChild.children].forEach((layer, i) => Object.assign(layer.style, layers[i][0]));
  document.body.appendChild(stage);
  cleanup.push(stage);
  return stage;
}

// A screenshot of `el` as a function from its own coordinates to [r, g, b];
// the runner may scale the frame, so `width` is the element's CSS width.
async function shot(el, width) {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const img = new Image();
  img.src = 'data:image/png;base64,' + await page.screenshot({ save: false, element: el });
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const k = img.width / width;
  return (x, y) => [...ctx.getImageData(Math.floor(x * k), Math.floor(y * k), 1, 1).data].slice(0, 3);
}

describe(`camera, depth and shake (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('camera(): the documented style, in the documented order, from constants and tracks', async () => {
    const { wf } = await load();
    const { camera } = wf.kinetic;
    expect(camera(1, { x: 10, y: -20, z: { at: [0, 2], to: [0, 300], ease: 'power2.inOut' }, pan: 5, tilt: -3, roll: 2, zoom: 1.25 }, { perspective: 800 })).toEqual({
      transform: 'perspective(800px) scale(1.25) translateZ(800px) rotateZ(-2deg) rotateX(-3deg) rotateY(5deg) translateZ(-800px) translate3d(-10px, 20px, 150px)',
      transformStyle: 'preserve-3d',
      transformOrigin: '50% 50%',
    });
    // Every key missing is at rest, with the default perspective.
    expect(camera(0, {})).toEqual({ transform: REST, transformStyle: 'preserve-3d', transformOrigin: '50% 50%' });
    // A track reads at t, clamped outside its range as styleAt() clamps; a key left out stays at rest.
    expect(camera(5, { zoom: { at: [0, 1], to: [1, 2] } }).transform).toBe(REST.replace('scale(1)', 'scale(2)'));
    expect(camera(-1, { x: { at: [0, 1], to: [100, 200] } }).transform).toBe(REST.replace('translate3d(0px', 'translate3d(-100px'));
    // Numbers are written with at most four decimals, and never as -0.
    expect(camera(0, { x: 1 / 3, roll: -0 }).transform).toBe(REST.replace('translate3d(0px', 'translate3d(-0.3333px'));
  });

  it('camera(): a zoom or perspective below 0.0001 is KN-100, so neither is written as 0; an inherited key is not read', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    expectKNText(() => camera(0, { zoom: 1e-5 }), '[KN-100] camera(t, tracks).zoom < 0.0001: zoom is 0.0001 or more, not 0.00001 at t = 0');
    expectKNText(() => camera(0, {}, { perspective: 1e-5 }), '[KN-100] camera(t, tracks, { perspective }): perspective is a finite number, 0.0001 or more, not 0.00001');
    expectKNText(() => depth(0, { perspective: 1e-5 }), '[KN-100] depth(z, { perspective }): perspective is a finite number, 0.0001 or more, not 0.00001');
    const small = camera(0, { zoom: 1e-4 }, { perspective: 1e-4 }).transform;
    expect(small).toContain('scale(0.0001)');
    expect(small).toContain('perspective(0.0001px)');
    expect(small).not.toMatch(/scale\(0\)|perspective\(0px\)/);
    expect(camera(0, Object.create({ x: 10 })).transform).toBe(REST);
  });

  it('camera(): shake, one result or an array of them, adds to x, y and roll', async () => {
    const { wf } = await load();
    const { camera, shake } = wf.kinetic;
    const one = camera(0, { x: 10 }, { shake: { x: 1, y: 2, roll: 0.5 } }).transform;
    expect(one).toBe(REST.replace('rotateZ(0deg)', 'rotateZ(-0.5deg)').replace('translate3d(0px, 0px', 'translate3d(-11px, -2px'));
    const two = camera(0, { x: 10, roll: 1 }, { shake: [{ x: 1, y: 2, roll: 0.5 }, { x: 2, y: -1, roll: 0.25 }] }).transform;
    expect(two).toBe(REST.replace('rotateZ(0deg)', 'rotateZ(-1.75deg)').replace('translate3d(0px, 0px', 'translate3d(-13px, -1px'));
    expect(camera(0, {}, { shake: [] }).transform).toBe(REST);
    // A real shake() result.
    const s = shake(0.4, 'rumble', { seed: 3 });
    const f = (v) => String(Math.round(v * 1e4) / 1e4);
    expect(camera(0, {}, { shake: s }).transform).toBe(REST.replace('rotateZ(0deg)', 'rotateZ(' + f(-s.roll) + 'deg)').replace('translate3d(0px, 0px', 'translate3d(' + f(-s.x) + 'px, ' + f(-s.y) + 'px'));
  });

  it('depth(): translateZ and the scale that fills the frame at rest; fill: false leaves the scale out', async () => {
    const { wf } = await load();
    const { depth } = wf.kinetic;
    expect(depth(0)).toEqual({ transform: 'translateZ(0px) scale(1)' });
    expect(depth(-1600)).toEqual({ transform: 'translateZ(-1600px) scale(2.6)' });
    expect(depth(300)).toEqual({ transform: 'translateZ(300px) scale(0.7)' });
    expect(depth(-500, { perspective: 800 })).toEqual({ transform: 'translateZ(-500px) scale(1.625)' });
    expect(depth(-1000, { perspective: 3000 })).toEqual({ transform: 'translateZ(-1000px) scale(1.3333)' });
    expect(depth(-1600, { fill: false })).toEqual({ transform: 'translateZ(-1600px)' });
    expect(depth(250, { fill: true })).toEqual({ transform: 'translateZ(250px) scale(0.75)' });
  });

  it('shake(): the spec formula for a number seed, deterministic, different per seed and per axis', async () => {
    const { wf } = await load();
    const { shake, noise } = wf.kinetic;
    for (const name of ['handheld', 'rumble', 'impact']) {
      for (const t of [0, 0.13, 0.5, 1.7, 3.25]) {
        const got = shake(t, name, { seed: 7 }), want = shakeRef(noise, t, name, 7);
        for (const k of ['x', 'y', 'roll']) expect(got[k], name + ' ' + k + ' at ' + t).toBeCloseTo(want[k], 9);
      }
    }
    // The default seed is 1.
    expect(shake(0.37, 'handheld')).toEqual(shake(0.37, 'handheld', { seed: 1 }));
    expect(Object.keys(shake(0.37, 'handheld')).sort()).toEqual(['roll', 'x', 'y']);
    expect(shake(0.37, 'handheld', { seed: 4 })).toEqual(shake(0.37, 'handheld', { seed: 4 }));
    expect(shake(0.37, 'handheld', { seed: 'take 2' })).toEqual(shake(0.37, 'handheld', { seed: 'take 2' }));
    expect(shake(0.37, 'handheld', { seed: 4 }).x).not.toBe(shake(0.37, 'handheld', { seed: 5 }).x);
    expect(shake(0.37, 'handheld', { seed: 'a' }).x).not.toBe(shake(0.37, 'handheld', { seed: 'b' }).x);
    // The three axes do not move together: over a second, x / X and y / Y differ.
    let apart = 0;
    for (let i = 1; i <= 60; i++) {
      const s = shake(i / 60, 'handheld', { seed: 7 });
      if (Math.abs(s.x / 16 - s.y / 11) > 0.05 && Math.abs(s.x / 16 - s.roll / 1.1) > 0.05) apart++;
    }
    expect(apart).toBeGreaterThan(40);
  });

  // noise() is 0 at every whole number, so axis offsets that are whole
  // numbers would put the first octave of x, y and roll at zero together
  // once per cycle, and the camera would calm on a fixed beat.
  it('shake(): the three axes do not all calm at whole numbers of t * hz', async () => {
    const { wf } = await load();
    const { shake } = wf.kinetic;
    for (const seed of [1, 7, 42]) {
      const size = (u) => { const s = shake(u / 0.7, 'handheld', { seed }); return Math.max(Math.abs(s.x) / 16, Math.abs(s.y) / 11, Math.abs(s.roll) / 1.1); };
      let whole = 0, all = 0;
      for (let n = 1; n <= 20; n++) whole += size(n) / 20;
      for (let k = 1; k <= 2000; k++) all += size(k / 100 + 0.003) / 2000;
      // With offsets of 50 and 90 this ratio was 0.44 to 0.63.
      expect(whole / all, 'seed ' + seed).toBeGreaterThan(0.8);
    }
  });

  it('shake(): within its amplitudes times amount; amount 0 is zeros; speed 2 at t is speed 1 at 2t', async () => {
    const { wf } = await load();
    const { shake } = wf.kinetic;
    for (const name of ['handheld', 'rumble', 'impact']) {
      const [, X, Y, R] = PROFILES[name];
      for (const amount of [1, 0.4]) {
        for (let i = 0; i <= 600; i++) {
          const s = shake(i / 60, name, { seed: 11, amount });
          expect(Math.abs(s.x)).toBeLessThanOrEqual(X * amount);
          expect(Math.abs(s.y)).toBeLessThanOrEqual(Y * amount);
          expect(Math.abs(s.roll)).toBeLessThanOrEqual(R * amount);
        }
      }
      expect(shake(0.77, name, { amount: 0 })).toEqual({ x: 0, y: 0, roll: 0 });
      // amount scales all three offsets.
      const a = shake(0.77, name, { seed: 2 }), b = shake(0.77, name, { seed: 2, amount: 2.5 });
      for (const k of ['x', 'y', 'roll']) expect(b[k]).toBeCloseTo(a[k] * 2.5, 9);
    }
    for (const t of [0.1, 0.77, 2.3]) {
      expect(shake(t, 'handheld', { speed: 2, seed: 3 })).toEqual(shake(2 * t, 'handheld', { seed: 3 }));
      expect(shake(t, 'rumble', { speed: 2 })).toEqual(shake(2 * t, 'rumble'));
    }
  });

  it("shake(): an impact is 0 before t = 0 and decays; a handheld shake has no large step from frame to frame", async () => {
    const { wf } = await load();
    const { shake } = wf.kinetic;
    for (const t of [-0.001, -1, -50]) expect(shake(t, 'impact', { seed: 7 })).toEqual({ x: 0, y: 0, roll: 0 });
    for (const seed of [1, 7, 42]) {
      const peak = (from) => {
        let m = 0;
        for (let i = 0; i <= 300; i++) { const s = shake(from + i / 1000, 'impact', { seed }); m = Math.max(m, Math.abs(s.x), Math.abs(s.y)); }
        return m;
      };
      expect(peak(0), 'seed ' + seed).toBeGreaterThan(10 * peak(1.5));
    }
    // Handheld at 60 fps over 20 s: no step above 1.5 px or 0.1 deg. A
    // rumble, at ten times the frequency, steps more than 1.5 px.
    let sx = 0, sy = 0, sr = 0, prev = shake(0, 'handheld', { seed: 7 });
    for (let i = 1; i <= 1200; i++) {
      const s = shake(i / 60, 'handheld', { seed: 7 });
      sx = Math.max(sx, Math.abs(s.x - prev.x)); sy = Math.max(sy, Math.abs(s.y - prev.y)); sr = Math.max(sr, Math.abs(s.roll - prev.roll));
      prev = s;
    }
    expect(sx).toBeLessThan(1.5); expect(sy).toBeLessThan(1.5); expect(sr).toBeLessThan(0.1);
    expect(sx).toBeGreaterThan(0.1);
    let rumble = 0;
    prev = shake(0, 'rumble', { seed: 7 });
    for (let i = 1; i <= 1200; i++) { const s = shake(i / 60, 'rumble', { seed: 7 }); rumble = Math.max(rumble, Math.abs(s.y - prev.y)); prev = s; }
    expect(rumble).toBeGreaterThan(1.5);
  });

  it('KN-100: every wrong argument to camera(), depth() and shake(), with its message', async () => {
    const { wf } = await load();
    const { camera, depth, shake } = wf.kinetic;
    const KEYS = 'the keys are x, y, z, pan, tilt, roll, zoom';
    // camera
    expectKNText(() => camera(0, { rotateY: 10 }), "[KN-100] camera(t, { rotateY }): no key 'rotateY' (use pan); " + KEYS);
    expectKNText(() => camera(0, { rotateX: 10 }), "[KN-100] camera(t, { rotateX }): no key 'rotateX' (use tilt); " + KEYS);
    expectKNText(() => camera(0, { rotate: 10 }), "[KN-100] camera(t, { rotate }): no key 'rotate' (use roll); " + KEYS);
    expectKNText(() => camera(0, { dolly: 10 }), "[KN-100] camera(t, { dolly }): no key 'dolly'; " + KEYS);
    expectKNText(() => camera(0, { constructor: 1 }), "[KN-100] camera(t, { constructor }): no key 'constructor'; " + KEYS);
    expectKNText(() => camera(0, { zoom: 0 }), '[KN-100] camera(t, tracks).zoom < 0.0001: zoom is 0.0001 or more, not 0 at t = 0');
    expectKNText(() => camera(2, { zoom: { at: [0, 2], to: [1, -1] } }), '[KN-100] camera(t, tracks).zoom < 0.0001: zoom is 0.0001 or more, not -1 at t = 2');
    expect(camera(0.5, { zoom: { at: [0, 2], to: [1, -1] } }).transform).toContain('scale(0.5)');
    expectKNText(() => camera(0, {}, { perspective: 0 }), '[KN-100] camera(t, tracks, { perspective }): perspective is a finite number, 0.0001 or more, not 0');
    expectKNText(() => camera(0, {}, { perspective: -5 }), '[KN-100] camera(t, tracks, { perspective }): perspective is a finite number, 0.0001 or more, not -5');
    expectKNText(() => camera(0, {}, { perspective: Infinity }), '[KN-100] camera(t, tracks, { perspective }): perspective is a finite number, 0.0001 or more, not Infinity');
    expectKNText(() => camera(0, {}, { perspective: NaN }), '[KN-100] camera(t, tracks, { perspective }): perspective is a finite number, 0.0001 or more, not NaN');
    expectKNText(() => camera(0, {}, { perspective: '1000' }), '[KN-100] camera(t, tracks, { perspective }): perspective is a finite number, 0.0001 or more, not "1000"');
    expectKNText(() => camera(0, {}, { shake: 'impact' }), '[KN-100] camera(t, tracks, { shake }): shake is a shake() result or an array of them, not "impact"');
    expectKNText(() => camera(0, {}, { shake: { x: 1, y: 2 } }), '[KN-100] camera(t, tracks, { shake }): shake is a shake() result or an array of them, not {"x":1,"y":2}');
    expectKNText(() => camera(0, {}, { shake: [{ x: 1, y: 2, roll: 0 }, null] }), '[KN-100] camera(t, tracks, { shake }): shake is a shake() result or an array of them, not null');
    expectKN(() => camera(0, {}, { shake: { x: NaN, y: 0, roll: 0 } }), 'KN-100', 'camera(t, tracks, { shake })', /^shake is a shake\(\) result/);
    expectKN(() => camera(0, {}, { shake: { x: '1', y: 0, roll: 0 } }), 'KN-100', 'camera(t, tracks, { shake })', /^shake is a shake\(\) result/);
    // depth
    expectKNText(() => depth(1000), '[KN-100] depth(z): z is a finite number below the perspective, 1000, not 1000');
    expectKNText(() => depth(1200), '[KN-100] depth(z): z is a finite number below the perspective, 1000, not 1200');
    expectKNText(() => depth(600, { perspective: 500 }), '[KN-100] depth(z): z is a finite number below the perspective, 500, not 600');
    expectKNText(() => depth(-Infinity), '[KN-100] depth(z): z is a finite number below the perspective, 1000, not -Infinity');
    expectKNText(() => depth(NaN), '[KN-100] depth(z): z is a finite number below the perspective, 1000, not NaN');
    expectKNText(() => depth('-100'), '[KN-100] depth(z): z is a finite number below the perspective, 1000, not "-100"');
    expectKNText(() => depth(0, { perspective: 0 }), '[KN-100] depth(z, { perspective }): perspective is a finite number, 0.0001 or more, not 0');
    // shake
    expectKNText(() => shake(0, 'walk'), "[KN-100] shake(…, profile): profile is 'handheld', 'rumble' or 'impact', not \"walk\"");
    expectKNText(() => shake(0), "[KN-100] shake(…, profile): profile is 'handheld', 'rumble' or 'impact', not undefined");
    expectKN(() => shake(0, 'constructor'), 'KN-100', 'shake(…, profile)', /not "constructor"/);
    expectKNText(() => shake(NaN, 'impact'), '[KN-100] shake(t): t is the time in seconds, a finite number, not NaN');
    expectKNText(() => shake(Infinity, 'rumble'), '[KN-100] shake(t): t is the time in seconds, a finite number, not Infinity');
    expectKNText(() => shake('1', 'rumble'), '[KN-100] shake(t): t is the time in seconds, a finite number, not "1"');
    expectKNText(() => shake(0, 'rumble', { amount: -0.1 }), '[KN-100] shake(t, profile, { amount }): amount is a finite number, 0 or more, not -0.1');
    expectKNText(() => shake(0, 'rumble', { amount: NaN }), '[KN-100] shake(t, profile, { amount }): amount is a finite number, 0 or more, not NaN');
    expectKNText(() => shake(0, 'rumble', { speed: 0 }), '[KN-100] shake(t, profile, { speed }): speed is a finite number above 0, not 0');
    expectKNText(() => shake(0, 'rumble', { speed: -2 }), '[KN-100] shake(t, profile, { speed }): speed is a finite number above 0, not -2');
    expectKNText(() => shake(0, 'rumble', { seed: null }), '[KN-100] shake(t, profile, { seed }): seed is a number or a string, not null');
    expectKNText(() => shake(0, 'rumble', { seed: NaN }), '[KN-100] shake(t, profile, { seed }): seed is a number or a string, not NaN');
    // noise() and random() keep their own message.
    expectKNText(() => wf.kinetic.noise(0.5), '[KN-100] noise(…, seed): seed is a number or a string, not undefined');
    expectKNText(() => wf.kinetic.random(null), '[KN-100] random(seed): seed is a number or a string, not null');
  });

  it('KN-120: a malformed camera track, a track of text, or a value that is neither a number nor a track', async () => {
    const { wf } = await load();
    const { camera } = wf.kinetic;
    expectKNText(() => camera(0, { z: { at: [0, 1], to: [0] } }), '[KN-120] camera(t, tracks).z.to: at and to are arrays of the same length, two or more');
    expectKNText(() => camera(0, { x: { at: [1, 0], to: [0, 1] } }), '[KN-120] camera(t, tracks).x.at[1]: at must increase (at[1] = 0 after 1)');
    expectKN(() => camera(0, { pan: { at: [0, 1], to: [0, 10], ease: 'nope' } }), 'KN-121', 'camera(t, tracks).pan.ease', "'nope' is not an ease");
    expectKNText(() => camera(0, { x: { at: [0, 1], to: ['0px', '10px'] } }), '[KN-120] camera(t, tracks).x: a number or a track of numbers, not {"at":[0,1],"to":["0px","10px"]}');
    expectKN(() => camera(0, { x: { at: [0, 1], to: ['#000', '#fff'] } }), 'KN-120', 'camera(t, tracks).x', /^a number or a track of numbers/);
    expectKNText(() => camera(0, { y: '100px' }), '[KN-120] camera(t, tracks).y: a number or a track of numbers, not "100px"');
    expectKNText(() => camera(0, { y: NaN }), '[KN-120] camera(t, tracks).y: a number or a track of numbers, not NaN');
    expectKNText(() => camera(0, { roll: Infinity }), '[KN-120] camera(t, tracks).roll: a number or a track of numbers, not Infinity');
    expectKNText(() => camera(0, { z: { to: [0, 1] } }), '[KN-120] camera(t, tracks).z: a number or a track of numbers, not {"to":[0,1]}');
    expectKNText(() => camera(0, { y: null }), '[KN-120] camera(t, tracks).y: a number or a track of numbers, not null');
    // The units are fixed, so a unit on a camera track is an error rather than a conversion.
    const UNITS = 'a camera track has no unit; x, y and z are px, pan, tilt and roll degrees, zoom a factor';
    expectKNText(() => camera(0, { pan: { at: [0, 1], to: [0, 1], unit: 'rad' } }), '[KN-120] camera(t, tracks).pan.unit: ' + UNITS);
    expectKNText(() => camera(0, { x: { at: [0, 1], to: [0, 100], unit: 'px' } }), '[KN-120] camera(t, tracks).x.unit: ' + UNITS);
    expectKNText(() => camera(0, { zoom: { at: [0, 1], to: [1, 2], unit: '' } }), '[KN-120] camera(t, tracks).zoom.unit: ' + UNITS);
  });

  it('camera(): a key set to undefined is at rest, shake: null is no shake, and tracks that is not an object is all at rest', async () => {
    const { wf } = await load();
    const { camera } = wf.kinetic;
    expect(camera(0, { x: undefined, zoom: undefined, pan: 4 }).transform).toBe(REST.replace('rotateY(0deg)', 'rotateY(4deg)'));
    expect(camera(0, { x: 10 }, { shake: null }).transform).toBe(REST.replace('translate3d(0px', 'translate3d(-10px'));
    expect(camera(0, { x: 10 }, { shake: undefined }).transform).toBe(REST.replace('translate3d(0px', 'translate3d(-10px'));
    for (const tracks of [undefined, null, 5, true, 'zoom', 'x']) expect(camera(0, tracks).transform, String(tracks)).toBe(REST);
    expect(camera(0).transform).toBe(REST);
  });

  it('KN-123 in development: a camera track whose spring the next key cuts short, once per track', async () => {
    const { wf } = await load();
    const { camera } = wf.kinetic;
    const z = { at: [0, 0.3, 2], to: [0, 200, 200], ease: 'spring' };
    const lines = await captureWarnings(async () => { camera(0.1, { z }); camera(0.2, { z }); });
    const kn = lines.filter((l) => l.includes('KN-123'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, lines.join(' || ')).toBe(1);
    expect(kn[0]).toContain('camera(t, tracks).z springs from 0 s to 0.3 s');
  });

  // ---- geometry, measured ----------------------------------------------------

  it('at rest, full-frame layers at depth(-1600) and depth(300) have the box of one at depth(0), to 1 px', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    const { markers } = rig(camera(0, {}), [[depth(-1600), 100, 60], [depth(0), 100, 60], [depth(300), 100, 60], [depth(-1600, { perspective: 500 }), 100, 60]]);
    await tick(0);
    const [far, mid, near] = markers.map(box);
    expect(mid.x).toBeCloseTo(110, 0); expect(mid.y).toBeCloseTo(70, 0); expect(mid.w).toBeCloseTo(20, 0);
    for (const b of [far, near]) {
      for (const k of ['x', 'y', 'w', 'h']) expect(Math.abs(b[k] - mid[k]), k + ' ' + JSON.stringify(b)).toBeLessThanOrEqual(1);
    }
    for (const m of markers.slice(0, 3)) {
      const r = m.parentElement.getBoundingClientRect();
      expect(Math.abs(r.left) + Math.abs(r.top) + Math.abs(r.width - W) + Math.abs(r.height - H), JSON.stringify(r)).toBeLessThanOrEqual(1);
    }
    // A depth() perspective that does not match the camera's does not fill the frame.
    const off = box(markers[3]);
    expect(Math.abs(off.w - 20)).toBeGreaterThan(5);
  });

  it('a dolly moves a near layer out from the centre more than a far one, by the ratio the perspective predicts, to 2%', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    const P = 1000, Z = 200;
    const { world, markers } = rig(camera(0, {}), [[depth(-1600), 100, 60], [depth(0), 100, 60], [depth(300), 100, 60]]);
    const rest = markers.map(box);
    Object.assign(world.style, camera(0, { z: Z }));
    const moved = markers.map(box);
    const ratios = [-1600, 0, 300].map((zl, i) => {
      const predicted = (P / (P - zl - Z)) / (P / (P - zl));
      const got = Math.hypot(moved[i].x - CX, moved[i].y - CY) / Math.hypot(rest[i].x - CX, rest[i].y - CY);
      expect(Math.abs(got / predicted - 1), 'layer at ' + zl + ': ' + got + ' against ' + predicted).toBeLessThan(0.02);
      // Out from the centre along the same line.
      expect(Math.sign(moved[i].x - CX)).toBe(Math.sign(rest[i].x - CX));
      expect(Math.sign(moved[i].y - CY)).toBe(Math.sign(rest[i].y - CY));
      return got;
    });
    expect(ratios[2]).toBeGreaterThan(ratios[1]);
    expect(ratios[1]).toBeGreaterThan(ratios[0]);
    expect(ratios[0]).toBeGreaterThan(1);
  });

  it('a lens zoom of 1.5 scales every layer about the centre by 1.5, near and far alike, to 1%', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    const { world, markers } = rig(camera(0, {}), [[depth(-1600), 100, 60], [depth(0), 400, 220], [depth(300), 140, 230]]);
    const rest = markers.map(box);
    Object.assign(world.style, camera(0, { zoom: 1.5 }));
    const zoomed = markers.map(box);
    zoomed.forEach((b, i) => {
      const r = rest[i];
      expect(Math.abs((b.x - CX) / (r.x - CX) / 1.5 - 1), 'x of ' + i).toBeLessThan(0.01);
      expect(Math.abs((b.y - CY) / (r.y - CY) / 1.5 - 1), 'y of ' + i).toBeLessThan(0.01);
      expect(Math.abs(b.w / r.w / 1.5 - 1), 'width of ' + i).toBeLessThan(0.01);
    });
  });

  it('x, y, z, pan, tilt and roll each move a marker the way the camera table gives', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    // A marker at the centre and one 100 px right of it, on the layer at depth 0.
    const { world, markers } = rig(camera(0, {}), [[depth(0), CX - 10, CY - 10], [depth(0), CX + 90, CY - 10]]);
    const [c0, r0] = markers.map(box);
    expect(c0.x).toBeCloseTo(CX, 0); expect(r0.x).toBeCloseTo(CX + 100, 0);
    const at = (tracks) => { Object.assign(world.style, camera(0, tracks)); return markers.map(box); };
    // x: the camera trucks right, so the scene moves left.
    let [c, r] = at({ x: 40 });
    expect(c.x - c0.x).toBeCloseTo(-40, 0); expect(c.y - c0.y).toBeCloseTo(0, 0);
    // y: positive moves the camera down, so the scene moves up.
    [c] = at({ y: 40 });
    expect(c.y - c0.y).toBeCloseTo(-40, 0); expect(c.x - c0.x).toBeCloseTo(0, 0);
    // z: the camera moves in, so a marker off the centre moves out and grows.
    [c, r] = at({ z: 200 });
    expect(r.x - r0.x).toBeGreaterThan(20); expect(r.w).toBeGreaterThan(r0.w + 3); expect(c.x).toBeCloseTo(CX, 0);
    // pan: the camera turns right, so the scene moves left.
    [c] = at({ pan: 10 });
    expect(c.x - c0.x).toBeLessThan(-100); expect(Math.abs(c.y - c0.y)).toBeLessThan(1);
    // tilt: the camera turns up, so the scene moves down.
    [c] = at({ tilt: 10 });
    expect(c.y - c0.y).toBeGreaterThan(100); expect(Math.abs(c.x - c0.x)).toBeLessThan(1);
    // roll: the camera turns clockwise, so the scene turns anticlockwise: a
    // marker right of the centre rises and the centre stays.
    [c, r] = at({ roll: 10 });
    expect(r.y - r0.y).toBeLessThan(-10); expect(r.x).toBeGreaterThan(CX + 90);
    expect(Math.abs(c.x - c0.x) + Math.abs(c.y - c0.y)).toBeLessThan(1);
  });

  // x, y and z move along the scene's own axes and the turns are about the
  // moved eye, as a camera on a dolly track: a pan does not change the
  // direction a later dolly goes in. Predicted by hand from that rule, for
  // a point (px, py, pz) from the world's centre, z toward the viewer.
  it('a move and a turn together: the move in the scene\'s axes, the turn about the moved eye', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    const P = 1000;
    const project = ([px, py, pz], { x = 0, z = 0, pan = 0 }) => {
      const qx = px - x, qz = pz + z - P;               // moved, then the eye at the origin
      const a = pan * Math.PI / 180;
      const rx = Math.cos(a) * qx + Math.sin(a) * qz;   // rotateY(pan)
      const rz = -Math.sin(a) * qx + Math.cos(a) * qz;
      const f = P / -rz;                                // perspective from the eye
      return [CX + rx * f, CY + py * f];
    };
    // A marker 100 px right of the centre on the layer at depth 0, and one
    // 80 px right and 40 px up on the layer at depth(-1600), which depth()
    // scales by 2.6 about the centre.
    const { world, markers } = rig(camera(0, {}), [[depth(0), CX + 90, CY - 10], [depth(-1600), CX + 70, CY - 50]]);
    const points = [[100, 0, 0], [80 * 2.6, -40 * 2.6, -1600]];
    for (const cam of [{ z: 200, pan: 10 }, { x: 60, z: 150, pan: -8 }]) {
      Object.assign(world.style, camera(0, cam));
      markers.forEach((m, i) => {
        const b = box(m), [ex, ey] = project(points[i], cam);
        expect(Math.hypot(b.x - ex, b.y - ey), JSON.stringify(cam) + ' marker ' + i + ' at ' + b.x + ', ' + b.y + ' against ' + ex + ', ' + ey).toBeLessThan(1);
      });
    }
  });

  // The rules the reference page gives for what keeps a layer in depth.
  it('a layer keeps its depth with a flattening property on itself; inside a wrapper without preserve-3d, or with one of them, it is drawn flat', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    const { world, markers } = rig(camera(0, {}), [[depth(0), 100, 60], [depth(300), 100, 60]]);
    // A layer at depth(300) with each property on itself, and one inside a
    // wrapper in the world for each wrapper style.
    const layerWith = (style) => {
      const layer = markers[1].parentElement.cloneNode(true);
      Object.assign(layer.style, style);
      return layer;
    };
    const inWrapper = (style) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
      Object.assign(wrap.style, style);
      const layer = layerWith({});
      wrap.appendChild(layer);
      world.appendChild(wrap);
      return layer.firstElementChild;
    };
    const own = FLATTENING.map((style) => { const layer = layerWith(style); world.appendChild(layer); return layer.firstElementChild; });
    const kept = inWrapper({ transformStyle: 'preserve-3d' });
    const flat = [{}].concat(FLATTENING.map((style) => Object.assign({ transformStyle: 'preserve-3d' }, style))).map(inWrapper);
    Object.assign(world.style, camera(0, { z: 200 }));
    const [flat0, ref] = markers.map(box);
    expect(ref.w).toBeCloseTo(28, 0);   // 20 px at 1.4, the near layer's dolly ratio
    own.concat(kept).forEach((m, i) => {
      const b = box(m), what = i < FLATTENING.length ? 'on the layer: ' + JSON.stringify(FLATTENING[i]) : 'a wrapper with preserve-3d';
      expect(Math.abs(b.x - ref.x) + Math.abs(b.y - ref.y) + Math.abs(b.w - ref.w), what).toBeLessThan(1);
    });
    // Flat: the layer's translateZ is lost in the wrapper's plane, and its
    // scale of 0.7 is all that is left, under the dolly of a layer at 0.
    flat.forEach((m, i) => {
      const b = box(m), what = i ? 'a wrapper with preserve-3d and ' + JSON.stringify(FLATTENING[i - 1]) : 'a plain wrapper';
      expect(b.w, what).toBeCloseTo(flat0.w * 0.7, 0);
      expect(Math.abs(b.w - ref.w), what).toBeGreaterThan(5);
    });
  });

  it('on the world itself, a flattening property draws every layer flat, and a background hides the layers behind z = 0', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    // Flat: each layer keeps only the scale depth() gave it.
    for (const style of FLATTENING) {
      const { world, markers } = rig(Object.assign(camera(0, {}), style), [[depth(-1600), 100, 60], [depth(300), 500, 60]]);
      const [far, near] = markers.map(box);
      expect(far.w, JSON.stringify(style)).toBeCloseTo(20 * 2.6, 0);
      expect(near.w, JSON.stringify(style)).toBeCloseTo(20 * 0.7, 0);
      world.parentElement.remove();
    }
    // A crop on the world's parent keeps the depth: under a dolly of 200 the
    // far marker grows by 2600 / 2400, not to the flat 2.6.
    const { world, markers } = rig(camera(0, { z: 200 }), [[depth(-1600), 100, 60]]);
    world.parentElement.style.overflow = 'hidden';
    world.parentElement.style.clipPath = 'inset(0px)';
    expect(box(markers[0]).w).toBeCloseTo(20 * 2600 / 2400, 0);
    // A background on the world is a surface at z = 0: a red marker at
    // depth(-800) goes behind it, a green one at depth(200) stays in front.
    for (const bg of ['', 'rgb(0, 0, 255)']) {
      const stage = smallStage([[depth(-800), 40, 40, 40, 'rgb(255, 0, 0)'], [depth(200), 200, 120, 40, 'rgb(0, 255, 0)']]);
      Object.assign(stage.firstElementChild.style, camera(0, {}), { background: bg });
      const px = await shot(stage, 300);
      expect(px(60, 60), 'far marker, background ' + bg).toEqual(bg ? [0, 0, 255] : [255, 0, 0]);
      expect(px(220, 140), 'near marker, background ' + bg).toEqual([0, 255, 0]);
    }
  });

  it('a dolly that reaches a layer draws it over the whole frame, then not at all, with no error', async () => {
    const { wf } = await load();
    const { camera, depth } = wf.kinetic;
    // A green marker on a layer at depth(200), which reaches the eye at
    // z = 1000 - 200, over a large red one at depth(0).
    const stage = smallStage([[depth(0), 100, 50, 100, 'rgb(255, 0, 0)'], [depth(200), 130, 80, 40, 'rgb(0, 255, 0)']]);
    const greens = async (z) => {
      Object.assign(stage.firstElementChild.style, camera(0, { z }));
      const px = await shot(stage, 300);
      return [[10, 10], [150, 100], [290, 190]].filter(([x, y]) => px(x, y)[1] > 128).length;
    };
    expect(await greens(0)).toBe(1);     // the centre only
    expect(await greens(799)).toBe(3);   // the whole frame
    expect(await greens(801)).toBe(0);   // gone
  });

  // ---- in a scene ------------------------------------------------------------

  it('a scene with a camera track and three depths passes check(), with no KN warnings, and binds the style camera() gives', async () => {
    const { wf } = await load();
    const { camera, depth, shake } = wf.kinetic;
    const name = uniqueName('shot');
    const CAM = {
      z: { at: [0, 1], to: [0, 260], ease: 'power2.inOut' },
      x: { at: [0.5, 1.5], to: [0, 120], ease: 'sine.inOut' },
      roll: { at: [1, 2], to: [0, 8] },
      zoom: { at: [1.5, 2], to: [1, 1.2] },
    };
    const look = (t) => camera(t, CAM, { shake: [shake(t, 'handheld', { seed: 3 }), shake(t - 1.2, 'impact', { seed: 7 })] });
    wf.kinetic.scene(name, {
      computed: {
        world() { return look(this.local); },
        far() { return depth(-1600); },
        mid() { return depth(0); },
        near() { return depth(300); },
      },
    });
    const layer = (k, x, y) => `<div class="${k}" data-bind-style="${k}" style="position:absolute;left:0;top:0;width:320px;height:180px"><i style="position:absolute;display:block;left:${x}px;top:${y}px;width:16px;height:16px;background:#c33"></i></div>`;
    let host;
    const lines = await captureWarnings(async () => {
      host = await mount(`<div data-composition-id="cam-check" data-start="0" data-duration="2" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px;overflow:hidden">
        <div data-component="${name}" data-start="0" data-duration="2" style="position:absolute;inset:0">
          <div class="world" data-bind-style="world" style="position:absolute;inset:0">${layer('far', 40, 30)}${layer('mid', 150, 80)}${layer('near', 250, 120)}</div>
        </div>
      </div>`);
      cleanup.push(host);
      await wf.kinetic.ready();
      const r = await wf.kinetic.check({ samples: 20 });
      expect(r).toEqual({ ok: true, frames: 20, samples: 20, ready: 'true', errors: 0 });
    });
    expect(lines.filter((l) => l.includes('[KN')), lines.join(' || ')).toEqual([]);
    // The world carries camera()'s style at the time sought, serialised as
    // the browser serialises the same value set by hand.
    wf.kinetic.seek(1.3); await tick(0);
    const world = host.querySelector('.world');
    const probe = document.createElement('div');
    probe.style.transform = look(1.3).transform;
    expect(world.style.transform).toBe(probe.style.transform);
    expect(world.style.transformStyle).toBe('preserve-3d');
    expect(host.querySelector('.far').style.transform).toBe('translateZ(-1600px) scale(2.6)');
  });
});
