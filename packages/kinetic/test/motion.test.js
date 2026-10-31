/**
 * The motion helpers: eases by name (CSS and GSAP vocabularies), the spring
 * in closed form, interpolate with its extrapolation modes and colors,
 * styleAt() from tracks, and the seeded random and noise.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, captureWarnings, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const samples = (f, n = 50) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
const monotonic = (arr) => arr.every((v, i) => i === 0 || v >= arr[i - 1] - 1e-12);

// The OKLab lightness, chroma and hue (in degrees) of an rgb() or rgba()
// string, with Björn Ottosson's published matrices, to measure what a mix in
// oklch returns independently of the code under test.
function oklch(s) {
  const c = s.match(/[\d.]+/g).slice(0, 3).map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const l = Math.cbrt(0.4122214708 * c[0] + 0.5363325363 * c[1] + 0.0514459929 * c[2]);
  const m = Math.cbrt(0.2119034982 * c[0] + 0.6806995451 * c[1] + 0.1073969566 * c[2]);
  const q = Math.cbrt(0.0883024619 * c[0] + 0.2817188376 * c[1] + 0.6299787005 * c[2]);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q;
  const b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q;
  return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}
const hueGap = (x, y) => Math.abs(((x - y + 540) % 360) - 180);

// The last time, scanned in steps of `step` up to `until`, that a spring with
// these options is more than 2% of its travel from rest.
function lastOff(spring, opts, step = 1e-4, until = 20) {
  let last = 0;
  for (let i = 0; i * step < until; i++) if (Math.abs(1 - spring(i * step, opts)) > 0.02) last = i * step;
  return last;
}

describe(`motion (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('ease: the CSS names, cubic-bezier and steps', async () => {
    const { wf } = await load();
    const { ease } = wf.kinetic;
    expect(ease('linear')(0.3)).toBe(0.3);
    expect(near(ease('ease')(0.5), 0.8024)).toBe(true);
    expect(ease('ease-in-out')(0.5)).toBeCloseTo(0.5, 6);
    expect(ease('ease-in')(0.3) + ease('ease-out')(0.7)).toBeCloseTo(1, 4);
    for (const n of ['ease', 'ease-in', 'ease-out', 'ease-in-out']) {
      const s = samples(ease(n));
      expect(s[0]).toBe(0); expect(s[50]).toBe(1); expect(monotonic(s)).toBe(true);
    }
    expect(near(ease('cubic-bezier(0.25, 0.1, 0.25, 1)')(0.5), 0.8024)).toBe(true);
    expect(ease('cubic-bezier(0.42,0,1,1)')(0.4)).toBeCloseTo(ease('ease-in')(0.4), 6);
    expect(ease('steps(4)')(0.3)).toBe(0.25);
    expect(ease('steps(4)')(1)).toBe(1);
    expect(ease('steps(4, start)')(0)).toBe(0.25);
    expect(ease('steps(4, jump-start)')(0.3)).toBe(0.5);
    expect(ease(' power2.out ')(0.5)).toBe(0.875);
    const f = (t) => t * 2;
    expect(ease(f)).toBe(f);
  });

  it("ease: GSAP's families with .in, .out and .inOut, and .out as the bare name", async () => {
    const { wf } = await load();
    const { ease } = wf.kinetic;
    expect(ease('power1.in')(0.5)).toBe(0.25);
    expect(ease('power1.out')(0.5)).toBe(0.75);
    expect(ease('power1')(0.5)).toBe(0.75);
    expect(ease('power1.inOut')(0.25)).toBe(0.125);
    expect(ease('power1.inOut')(0.75)).toBe(0.875);
    expect(ease('power4.in')(0.5)).toBe(0.03125);
    expect(ease('sine.in')(1)).toBeCloseTo(1, 12);
    expect(ease('sine.out')(0.5)).toBeCloseTo(Math.sin(Math.PI / 4), 12);
    expect(ease('expo.in')(0)).toBe(0);
    expect(ease('expo.out')(1)).toBe(1);
    expect(ease('circ.out')(0.5)).toBeCloseTo(Math.sqrt(0.75), 12);
    expect(ease('bounce.out')(0.5)).toBeCloseTo(0.765625, 12);
    expect(ease('bounce.out')(1)).toBe(1);
    expect(ease('bounce.in')(0)).toBe(0);
    expect(Math.max(...samples(ease('back.out')))).toBeGreaterThan(1);
    expect(Math.min(...samples(ease('back.in')))).toBeLessThan(0);
    expect(Math.max(...samples(ease('elastic.out'), 200))).toBeGreaterThan(1.1);
    expect(ease('elastic.out')(1)).toBe(1);
    for (const fam of ['power1', 'power2', 'power3', 'power4', 'sine', 'expo', 'circ']) {
      for (const dir of ['in', 'out', 'inOut']) {
        const s = samples(ease(fam + '.' + dir));
        expect(s[0]).toBeCloseTo(0, 9); expect(s[50]).toBeCloseTo(1, 9); expect(monotonic(s)).toBe(true);
      }
      // inOut is point-symmetric about (0.5, 0.5).
      const io = ease(fam + '.inOut');
      expect(io(0.3) + io(0.7)).toBeCloseTo(1, 9);
    }
    for (const bad of ['power5.out', 'ease.in', 'quad', 'cubic-bezier(2,0,1,1)', 'steps(0)', 42]) {
      expect(() => ease(bad)).toThrow(/KN-121/);
    }
  });

  it('spring: closed form, from rest to the target, with overshoot only when under-damped', async () => {
    const { wf } = await load();
    const { spring } = wf.kinetic;
    expect(spring(0)).toBe(0);
    expect(spring(-1)).toBe(0);
    expect(near(spring(5), 1, 1e-3)).toBe(true);
    // Defaults (100, 10, 1) are under-damped: it passes 1 and comes back.
    const s = Array.from({ length: 300 }, (_, i) => spring(i / 100));
    expect(Math.max(...s)).toBeGreaterThan(1.1);
    expect(monotonic(s)).toBe(false);
    // Critically damped: 1 - e^-1 (1 + 1) at t = 1 / w0.
    expect(spring(0.1, { damping: 20 })).toBeCloseTo(1 - Math.exp(-1) * 2, 9);
    expect(monotonic(Array.from({ length: 300 }, (_, i) => spring(i / 100, { damping: 20 })))).toBe(true);
    // Over-damped: monotonic, still reaches the target.
    const over = Array.from({ length: 600 }, (_, i) => spring(i / 100, { damping: 40 }));
    expect(monotonic(over)).toBe(true);
    expect(near(over[599], 1, 1e-2)).toBe(true);
    // from / to and overshootClamping.
    expect(spring(0, { from: 10, to: 20 })).toBe(10);
    expect(near(spring(5, { from: 10, to: 20 }), 20, 1e-2)).toBe(true);
    const clamped = Array.from({ length: 300 }, (_, i) => spring(i / 100, { overshootClamping: true }));
    expect(Math.max(...clamped)).toBe(1);
    // Stiffer settles sooner.
    expect(Math.abs(1 - spring(0.5, { stiffness: 400, damping: 40 }))).toBeLessThan(Math.abs(1 - spring(0.5, { stiffness: 100, damping: 20 })));
    expect(() => spring(1, { stiffness: 0 })).toThrow(/KN-100/);
    expect(() => spring(1, { mass: -1 })).toThrow(/KN-100/);
  });

  it('interpolate: segments, easing per segment, and the three extrapolations (clamp is the default)', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    const at = [0, 1, 3], to = [0, 10, 20];
    expect(interpolate(0.5, at, to)).toBe(5);
    expect(interpolate(2, at, to)).toBe(15);
    expect(interpolate(1, at, to)).toBe(10);
    expect(interpolate(-1, at, to)).toBe(0);
    expect(interpolate(9, at, to)).toBe(20);
    expect(interpolate(-1, at, to, { extrapolate: 'extend' })).toBe(-10);
    expect(interpolate(5, at, to, { extrapolate: 'extend' })).toBe(30);
    expect(interpolate(-1, at, to, { extrapolateLeft: 'identity' })).toBe(-1);
    expect(interpolate(9, at, to, { extrapolateRight: 'identity' })).toBe(9);
    expect(interpolate(9, at, to, { extrapolateLeft: 'extend' })).toBe(20);
    expect(interpolate(0.5, [0, 1], [0, 1], { ease: 'power1.in' })).toBe(0.25);
    expect(interpolate(2, at, to, { ease: 'power1.in' })).toBe(12.5);
    expect(interpolate(0.123456, [0, 1], [0, 100], { round: true })).toBe(12);
    expect(interpolate(0.123456, [0, 1], [0, 100], { round: 2 })).toBe(12.35);
    expect(interpolate(NaN, at, to)).toBe(0);
    for (const [a, b] of [[[0], [1]], [[0, 1], [1]], [[1, 0], [0, 1]], [[0, 0], [0, 1]], [['a', 1], [0, 1]], [[0, 1], [0, 'x']]]) {
      expect(() => interpolate(0.5, a, b)).toThrow(/KN-120/);
    }
    expect(() => interpolate(0.5, [0, 1], [0, 1], { extrapolate: 'repeat' })).toThrow(/KN-120/);
    expect(() => interpolate(0.5, [0, 1], [0, 1], { ease: 'nope' })).toThrow(/KN-121/);
  });

  it("ease 'smooth': the smoothstep alone or per segment; one curve through every key of a number track", async () => {
    const { wf } = await load();
    const { ease, interpolate, ramp, stagger, styleAt } = wf.kinetic;
    const s = ease('smooth');
    expect(s(0)).toBe(0);
    expect(s(1)).toBe(1);
    expect(s(0.5)).toBe(0.5);
    expect(s(0.25)).toBeCloseTo(0.15625, 12);
    expect(monotonic(samples(s))).toBe(true);
    expect(() => ease('smooth.in')).toThrow(/KN-121/);
    // Two keys: the threaded curve and the smoothstep are one curve, and
    // ramp() and stagger() take the name as they take any other.
    expect(interpolate(0.25, [0, 1], [0, 100], { ease: 'smooth' })).toBeCloseTo(15.625, 9);
    expect(ramp(0.25, 0, 1, 'smooth')).toBeCloseTo(0.15625, 12);
    expect(typeof stagger(1, 3, { ease: 'smooth' })).toBe('number');
    // Five keys: through each key at its value; the velocity the same on
    // both sides of each key between, above zero where the keys keep going
    // one way and zero where they turn; zero at the first and last key.
    const at = [0, 1, 2, 4, 5], to = [0, 10, 30, 40, 0];
    const v = (t, o) => interpolate(t, at, to, Object.assign({ ease: 'smooth' }, o));
    at.forEach((x, k) => expect(v(x)).toBeCloseTo(to[k], 9));
    // One-sided differences differ by h times the curvature's jump at a key,
    // so a small h shows the velocity itself continuous.
    const h = 1e-6, left = (t) => (v(t) - v(t - h)) / h, right = (t) => (v(t + h) - v(t)) / h;
    for (const x of [1, 2, 4]) expect(Math.abs(left(x) - right(x))).toBeLessThan(1e-3);
    expect(right(1)).toBeGreaterThan(5);
    expect(right(2)).toBeGreaterThan(5);
    expect(Math.abs(right(4))).toBeLessThan(0.01);
    expect(Math.abs(right(0))).toBeLessThan(0.01);
    expect(Math.abs(left(5))).toBeLessThan(0.01);
    // Never past a key's value between two keys: each segment stays between
    // its ends, and the whole track inside 0 to 40.
    for (let t = 0; t <= 5; t += 0.005) {
      const i = Math.min(at.findIndex((x) => x > t) - 1, 3), lo = Math.min(to[i], to[i + 1]), hi = Math.max(to[i], to[i + 1]);
      expect(v(t)).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(v(t)).toBeLessThanOrEqual(hi + 1e-9);
    }
    // A hold stays flat, and the threaded curve stops at it.
    expect(interpolate(1.5, [0, 1, 2, 3], [0, 10, 10, 20], { ease: 'smooth' })).toBe(10);
    expect(interpolate(1.999, [0, 1, 2, 3], [0, 10, 10, 20], { ease: 'smooth' })).toBe(10);
    // Extrapolation is unchanged: extend continues the last chord, wrap and
    // mirror evaluate the curve inside the range.
    expect(v(6, { extrapolate: 'extend' })).toBeCloseTo(-40, 9);
    expect(v(-1, { extrapolate: 'extend' })).toBeCloseTo(-10, 9);
    expect(v(5.5, { extrapolate: 'wrap' })).toBeCloseTo(v(0.5), 9);
    expect(v(5.5, { extrapolate: 'mirror' })).toBeCloseTo(v(4.5), 9);
    // In a per-segment array it is the smoothstep of that segment only: the
    // linear middle, and a stop at each key around it.
    const per = (t) => interpolate(t, at, to, { ease: ['smooth', 'linear', 'smooth', 'smooth'] });
    expect(per(3)).toBe(35);
    expect(per(0.5)).toBe(5);
    expect(Math.abs((per(1 + h) - per(1)) / h - 20)).toBeLessThan(0.01);
    expect(Math.abs((per(2 + h) - per(2)) / h)).toBeLessThan(0.01);
    // A colour track takes it per segment.
    expect(interpolate(0.5, [0, 1, 2], ['#000', '#888', '#fff'], { ease: 'smooth' })).toBe('rgb(68, 68, 68)');
    // styleAt() threads a track the same way, with the unit on.
    expect(styleAt(1, { left: { at, to, ease: 'smooth', unit: 'px' } }).left).toBe('10px');
    expect(parseFloat(styleAt(3, { left: { at, to, ease: 'smooth', unit: 'px' } }).left)).toBeCloseTo(v(3), 9);
  });

  it('interpolate: a spring ease runs on seconds and keeps going after the last key', async () => {
    const { wf } = await load();
    const { interpolate, spring } = wf.kinetic;
    const v = (t) => interpolate(t, [1, 1.5], [40, 0], { ease: 'spring' });
    expect(v(0.5)).toBe(40);
    expect(v(1)).toBe(40);
    expect(v(1.2)).toBeCloseTo(40 - 40 * spring(0.2), 9);
    // Past at[1] the spring continues to settle rather than snapping to 0.
    expect(v(1.7)).toBeCloseTo(40 - 40 * spring(0.7), 9);
    expect(near(v(6), 0, 1e-2)).toBe(true);
    const stiff = interpolate(1.2, [1, 1.5], [40, 0], { ease: { spring: { stiffness: 400, damping: 40 } } });
    expect(stiff).toBeCloseTo(40 - 40 * spring(0.2, { stiffness: 400, damping: 40 }), 9);
    // A spring segment before another key is cut by that key.
    expect(interpolate(2, [0, 1, 2, 3], [0, 10, 10, 0], { ease: 'spring' })).toBe(10);
  });

  it('interpolate: colors in hex and rgb(a), mixed with an alpha', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    expect(interpolate(0.5, [0, 1], ['#000', '#fff'])).toBe('rgb(128, 128, 128)');
    expect(interpolate(0, [0, 1], ['#ff0000', 'rgb(0, 0, 255)'])).toBe('rgb(255, 0, 0)');
    expect(interpolate(0.5, [0, 1], ['#ff0000', 'rgb(0, 0, 255)'])).toBe('rgb(128, 0, 128)');
    expect(interpolate(0.5, [0, 1], ['rgba(0, 0, 0, 0)', '#000000ff'])).toBe('rgba(0, 0, 0, 0.5)');
    expect(interpolate(0.25, [0, 1], ['rgb(0 0 0 / 0%)', 'rgb(0 0 0 / 100%)'])).toBe('rgba(0, 0, 0, 0.25)');
    expect(interpolate(2, [0, 1], ['#000', '#888'])).toBe('rgb(136, 136, 136)');
    expect(interpolate(2, [0, 1], ['#000', '#888'], { extrapolate: 'extend' })).toBe('rgb(255, 255, 255)');
    expect(() => interpolate(0.5, [0, 1], ['red', '#fff'])).toThrow(/KN-120/);
    expect(() => interpolate(0.5, [0, 1], ['#fff', 1])).toThrow(/KN-120/);
  });

  it('styleAt: a style object with the transform parts in a fixed order, units, colors', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const spec = {
      opacity: { at: [0, 1], to: [0, 1] },
      translateY: { at: [0, 1], to: [40, 0] },
      rotate: { at: [0, 1], to: [0, 90] },
      scale: { at: [0, 1], to: [1, 2] },
      width: { at: [0, 1], to: [100, 200], unit: 'px', round: true },
      background: { at: [0, 1], to: ['#000', '#fff'] },
    };
    expect(styleAt(0.5, spec)).toEqual({ transform: 'translate(0px, 20px) rotate(45deg) scale(1.5)', opacity: 0.5, width: '150px', background: 'rgb(128, 128, 128)' });
    expect(styleAt(0.5, { translateX: { at: [0, 1], to: [0, 50], unit: '%' } })).toEqual({ transform: 'translate(25%, 0px)' });
    expect(styleAt(0.5, { scale: { at: [0, 1], to: [0, 1] } })).toEqual({ transform: 'scale(0.5)' });
    expect(styleAt(0.5, { opacity: { at: [0, 1], to: [0, 1] } })).toEqual({ opacity: 0.5 });
    expect(() => styleAt(0.5, {})).toThrow(/KN-120/);
    expect(() => styleAt(0.5, { opacity: [0, 1] })).toThrow(/KN-120/);
    expect(() => styleAt(0.5, { background: { at: [0, 1], to: ['#000', '#fff'], unit: 'px' } })).toThrow(/KN-120/);
    expect(() => styleAt(0.5, 3)).toThrow(/KN-120/);
  });

  it('random: a seeded generator, the same sequence for the same seed, number or string', async () => {
    const { wf } = await load();
    const { random } = wf.kinetic;
    const a = random(7), b = random(7), c = random(8), d = random('seven'), e = random('seven');
    const seq = (g) => Array.from({ length: 5 }, () => g());
    const sa = seq(a);
    expect(sa).toEqual(seq(b));
    expect(sa).not.toEqual(seq(c));
    expect(seq(d)).toEqual(seq(e));
    expect(seq(d)).not.toEqual(sa);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(new Set(seq(random(1)).concat(seq(random(1)))).size).toBe(5);
    expect(() => random()).toThrow(/KN-100/);
    expect(() => random(null)).toThrow(/KN-100/);
  });

  it('noise: smooth, bounded, zero at whole numbers, the same for the same seed', async () => {
    const { wf } = await load();
    const { noise } = wf.kinetic;
    expect(noise(0, 1)).toBe(0);
    expect(noise(3, 1)).toBe(0);
    expect(noise(0.37, 1)).toBe(noise(0.37, 1));
    expect(noise(0.37, 1)).not.toBe(noise(0.37, 2));
    expect(noise(0.37, 'a')).toBe(noise(0.37, 'a'));
    let maxStep = 0, maxAbs = 0, nonzero = 0;
    for (let i = 0; i < 2000; i++) {
      const v = noise(i / 100, 5), w = noise((i + 1) / 100, 5);
      maxStep = Math.max(maxStep, Math.abs(w - v));
      maxAbs = Math.max(maxAbs, Math.abs(v));
      if (Math.abs(v) > 0.05) nonzero++;
    }
    expect(maxStep).toBeLessThan(0.05);
    expect(maxAbs).toBeLessThanOrEqual(1);
    expect(nonzero).toBeGreaterThan(500);
    expect(noise(NaN, 1)).toBe(0);
    expect(() => noise(0.5)).toThrow(/KN-100/);
  });

  it('wiggle: a seeded value every 1 / frequency s, smooth and never past the ones either side, and a value of its own on each posterized step', async () => {
    const { wf } = await load();
    const { wiggle, posterize } = wf.kinetic;
    const o = { frequency: 3, amplitude: 2.5, seed: 7 };
    expect(wiggle(1.234, o)).toBe(wiggle(1.234, o));
    expect(wiggle(1.234, o)).not.toBe(wiggle(1.234, { ...o, seed: 8 }));
    expect(wiggle(1.234, { ...o, seed: 'a' })).toBe(wiggle(1.234, { ...o, seed: 'a' }));
    expect(wiggle(0.4)).toBe(wiggle(0.4, { frequency: 1, amplitude: 1, seed: 1 }));
    expect(Object.is(wiggle(0.4, { amplitude: 0 }), 0)).toBe(true);
    // The values at the steps: within the amplitude, rarely near 0 (noise()
    // is 0 at every whole number; this is not), and each its own.
    const keys = Array.from({ length: 200 }, (_, k) => wiggle(k / 3, o));
    expect(Math.max(...keys.map(Math.abs))).toBeLessThanOrEqual(2.5);
    expect(keys.filter((v) => Math.abs(v) > 0.125).length).toBeGreaterThan(150);
    expect(keys.every((v, k) => k === 0 || v !== keys[k - 1])).toBe(true);
    // Between two steps it stays between their values, and moves smoothly.
    let maxStep = 0;
    for (let k = 0; k < 60; k++) {
      const lo = Math.min(keys[k], keys[k + 1]) - 1e-9, hi = Math.max(keys[k], keys[k + 1]) + 1e-9;
      for (let j = 0; j <= 50; j++) {
        const v = wiggle((k + j / 50) / 3, o);
        expect(v, 'step ' + k + ' sample ' + j).toBeGreaterThanOrEqual(lo);
        expect(v, 'step ' + k + ' sample ' + j).toBeLessThanOrEqual(hi);
        if (j) maxStep = Math.max(maxStep, Math.abs(v - wiggle((k + (j - 1) / 50) / 3, o)));
      }
    }
    expect(maxStep).toBeLessThan(0.3);
    // Posterized at the frequency: held through each step at that step's value,
    // including a time whose product lands a hair under the step.
    expect(wiggle(posterize(0.29, 100), { frequency: 100 })).toBe(wiggle(0.29, { frequency: 100 }));
    for (let k = 0; k < 30; k++) {
      expect(wiggle(posterize(k / 15 + 0.03, 15), { ...o, frequency: 15 })).toBe(wiggle(k / 15, { ...o, frequency: 15 }));
    }
    for (const args of [[NaN], [Infinity], ['1'], [1, { frequency: 0 }], [1, { frequency: -2 }], [1, { frequency: NaN }], [1, { amplitude: -1 }], [1, { amplitude: Infinity }], [1, { seed: {} }]]) {
      expect(() => wiggle(...args), JSON.stringify(args)).toThrow(/KN-100/);
    }
    expectKN(() => wiggle(1, { frequency: 0 }), 'KN-100', 'wiggle(t, { frequency })', /^frequency is wiggles a second, a finite number above 0, not 0/);
  });

  it('styleAt: a blur track becomes filter: blur(), in px, beside the transform', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    expect(styleAt(0.5, { blur: { at: [0, 1], to: [12, 0] } })).toEqual({ filter: 'blur(6px)' });
    expect(styleAt(0.5, { blur: { at: [0, 1], to: [12, 0] }, scale: { at: [0, 1], to: [1, 2] }, opacity: { at: [0, 1], to: [0, 1] } }))
      .toEqual({ transform: 'scale(1.5)', filter: 'blur(6px)', opacity: 0.5 });
    expect(styleAt(2, { blur: { at: [0, 1], to: [12, 0] } })).toEqual({ filter: 'blur(0px)' });
    // A scene's keyframes fold the same way.
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { keyframes: { look: { blur: { at: [0, 1], to: [8, 0] } } } });
    const host = await mount(`<div data-composition-id="mo-blur" data-start="0" data-duration="2"><div data-component="${name}" data-start="0"><b data-bind-style="look"></b></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.5); await tick(0);
    expect(host.querySelector('b').style.filter).toBe('blur(4px)');
  });

  it('focus: zero on the plane, a soft knee near it, max far from it, symmetric, quantised by steps', async () => {
    const { wf } = await load();
    const { focus } = wf.kinetic;
    expect(focus(100, 100)).toBe(0);
    expect(focus(300, 100)).toBe(6);                 // d = range: half of max
    expect(focus(-100, 100)).toBe(focus(300, 100));  // symmetric about the plane
    expect(focus(120, 100)).toBeLessThan(0.2);       // a near miss stays almost sharp
    expect(focus(5000, 100)).toBeGreaterThan(11.9);  // far away, max
    expect(focus(5000, 100, { max: 20 })).toBeGreaterThan(19.9);
    expect(focus(150, 100, { range: 50 })).toBe(6);
    expect(focus(300, 100, { steps: 4 })).toBe(8);   // 6 rounds to the nearest of 0, 4, 8, 12
    expect(focus(130, 100, { steps: 4 })).toBe(0);
    expect(() => focus('a', 0)).toThrow(/KN-100/);
    expect(() => focus(0, 0, { range: 0 })).toThrow(/KN-100/);
    expect(() => focus(0, 0, { steps: 1 })).toThrow(/KN-100/);
  });

  it('ease: the names on Object.prototype are unknown eases, not methods of the tables', async () => {
    const { wf } = await load();
    const { ease, interpolate } = wf.kinetic;
    for (const name of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__', 'isPrototypeOf']) {
      expect(() => ease(name)).toThrow(/KN-121/);
      expect(() => interpolate(0.5, [0, 1], [0, 1], { ease: name })).toThrow(/KN-121/);
    }
    expect(ease('linear')(0.5)).toBe(0.5);
  });

  it('sweep: a window through the items, the weight by its shape; the orders stagger has; KN-100 and KN-121 for bad arguments', async () => {
    const { wf } = await load();
    const { sweep } = wf.kinetic;
    const n = 5;
    // Rounded to a thousandth, and -0 to 0, since an item exactly under the
    // window's edge sits a rounding error either side of it.
    const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000 || 0);
    const all = (p, o) => r3(Array.from({ length: n }, (_, i) => sweep(i, n, p, o)));
    // Nothing under the window at 0 and before, everything past it at 1 and after.
    expect(all(0)).toEqual([0, 0, 0, 0, 0]);
    expect(all(-1)).toEqual([0, 0, 0, 0, 0]);
    expect(all(1)).toEqual([1, 1, 1, 1, 1]);
    expect(all(2)).toEqual([1, 1, 1, 1, 1]);
    // Halfway: the first item has passed, the second is in the window, the
    // rest are not reached; the weights fall off in order.
    const mid = all(0.5);
    expect(mid).toEqual([1, 0.833, 0, 0, 0]);
    // A wider window has more items under it at once.
    expect(all(0.5, { width: 1 })).toEqual([0.5, 0.25, 0, 0, 0]);
    // Square is 1 under the window only (measured a little past the
    // halfway point, where no item sits on an edge); triangle and round
    // bump and return to 0.
    expect(all(0.55, { shape: 'square' })).toEqual([0, 0, 1, 0, 0]);
    expect(all(0.5, { shape: 'triangle' })).toEqual([0, 0.333, 0, 0, 0]);
    expect(all(0.5, { shape: 'round' })).toEqual([0, 0.5, 0, 0, 0]);
    let peak = 0;
    for (let p = 0; p <= 1; p += 0.001) peak = Math.max(peak, sweep(2, n, p, { shape: 'triangle' }));
    expect(peak).toBeGreaterThan(0.99);
    // The ease shapes the rise: power2 is the cubic, as in GSAP.
    expect(sweep(1, n, 0.5, { ease: 'power2.in' })).toBeCloseTo((5 / 6) ** 3, 6);
    // The orders: last reverses, center goes outward, random is a seeded
    // permutation that holds for its seed.
    expect(all(0.5, { from: 'last' })).toEqual(mid.slice().reverse());
    expect(all(0.5, { from: 'center' })).toEqual([0, 0, 1, 0, 0]);
    expect(all(0.5, { from: 2 })).toEqual([0, 0, 1, 0, 0]);
    const r1 = all(0.5, { from: 'random' });
    expect(r1.slice().sort()).toEqual(mid.slice().sort());
    expect(all(0.5, { from: 'random' })).toEqual(r1);
    expect(all(0.5, { from: 'random', seed: 'other' }).slice().sort()).toEqual(mid.slice().sort());
    // One item sweeps like any other.
    expect(sweep(0, 1, 0)).toBe(0);
    expect(sweep(0, 1, 1)).toBe(1);
    for (const [i, m, p, o] of [[0, 0, 0], [5, 5, 0], [0, 5, NaN], [0, 5, 0, { from: 'middle' }], [0, 5, 0, { width: 0 }], [0, 5, 0, { shape: 'saw' }]]) {
      expect(() => sweep(i, m, p, o), JSON.stringify([i, m, p, o])).toThrow(/KN-100/);
    }
    expect(() => sweep(0, 5, 0, { ease: 'nope' })).toThrow(/KN-121/);
  });

  it('repeat: rows of n copies, each the transform of the one before it again as one matrix; opacity across the copies; offset; KN-100 for bad options', async () => {
    const { wf } = await load();
    const { repeat } = wf.kinetic;
    const r3 = (a) => a.map((v) => Math.round(v * 1000) / 1000);
    const rows = repeat(3, { translateX: 10 });
    expect(rows.map((r) => r.key)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.i)).toEqual([0, 1, 2]);
    expect(rows.map((r) => r.style.transform)).toEqual(['matrix(1, 0, 0, 1, 0, 0)', 'matrix(1, 0, 0, 1, 10, 0)', 'matrix(1, 0, 0, 1, 20, 0)']);
    // A turn with a move is an arc: the copies' origins go round a corner.
    const arc = repeat(4, { translateX: 100, rotate: 90 });
    const ef = (r) => r.style.transform.match(/matrix\(([^)]*)\)/)[1].split(', ').map(Number).slice(4);
    expect(arc[1].style.transform).toBe('matrix(0, 1, -1, 0, 100, 0)');
    expect(ef(arc[2])).toEqual([100, 100]);
    expect(ef(arc[3])).toEqual([0, 100]);
    // Scale compounds.
    expect(repeat(3, { scale: 0.5 })[2].style.transform).toBe('matrix(0.25, 0, 0, 0.25, 0, 0)');
    // Opacity from first to last across the copies; a number is the last's, from 1.
    expect(r3(repeat(3, { opacity: [1, 0] }).map((r) => r.style.opacity))).toEqual([1, 0.5, 0]);
    expect(r3(repeat(3, { opacity: 0.2 }).map((r) => r.style.opacity))).toEqual([1, 0.6, 0.2]);
    expect(repeat(1, { opacity: [0.3, 0.9] })[0].style.opacity).toBe(0.3);
    expect(repeat(2)[1].style.opacity).toBeUndefined();
    // Offset shifts the series, a negative one through the inverse.
    expect(ef(repeat(3, { translateX: 10, offset: 2 })[0])).toEqual([20, 0]);
    expect(ef(repeat(3, { translateX: 10, offset: -1 })[0])).toEqual([-10, 0]);
    expect(ef(repeat(3, { translateX: 10, offset: -1 })[1])).toEqual([0, 0]);
    expect(ef(repeat(3, { translateX: 10, rotate: 90, offset: -2 })[2])).toEqual([0, 0]);
    // origin passes through to the style.
    expect(repeat(2, { origin: '50% 100%' })[1].style.transformOrigin).toBe('50% 100%');
    expect(repeat(2)[1].style.transformOrigin).toBeUndefined();
    for (const [m, o] of [[0, {}], [10001, {}], [2, 5], [2, { skew: 1 }], [2, { translateX: 'a' }], [2, { rotate: Infinity }], [2, { scale: 0 }], [2, { offset: 1.5 }], [2, { opacity: [2, 0] }], [2, { origin: 5 }]]) {
      expect(() => repeat(m, o), JSON.stringify([m, o])).toThrow(/KN-100/);
    }
  });

  it('focus: depth keeps a band either side of the plane sharp, the depth of field, and the falloff starts at its edges', async () => {
    const { wf } = await load();
    const { focus } = wf.kinetic;
    const o = { range: 200, max: 12, depth: 100 };
    // Sharp through the band, on both sides.
    for (const z of [-100, -60, 0, 60, 100]) expect(focus(z, 0, o), 'z ' + z).toBe(0);
    // Past it, the same curve as without depth, moved out by the band.
    for (const z of [150, 300, 700]) expect(focus(z, 0, o), 'z ' + z).toBe(focus(z - 100, 0, { range: 200, max: 12 }));
    expect(focus(-300, 0, o)).toBe(focus(300, 0, o));
    // The default is 0: one sharp plane, as before.
    expect(focus(50, 0, { range: 200, max: 12 })).toBe(focus(50, 0, { range: 200, max: 12, depth: 0 }));
    expect(focus(50, 0, { range: 200, max: 12 })).toBeGreaterThan(0);
    expectKN(() => focus(0, 0, { depth: -1 }), 'KN-100', 'focus(z, plane, { depth })', /^depth is a finite number, 0 or more/);
    expectKN(() => focus(0, 0, { depth: Infinity }), 'KN-100', 'focus(z, plane, { depth })');
  });

  it('focus: max is a finite number; max 0 with steps gives 0', async () => {
    const { wf } = await load();
    const { focus } = wf.kinetic;
    expect(focus(300, 100, { max: 0, steps: 4 })).toBe(0);
    expect(focus(300, 100, { max: 0 })).toBe(0);
    expect(() => focus(300, 100, { max: Infinity })).toThrow(/KN-100/);
    expectKN(() => focus(300, 100, { max: NaN }), 'KN-100', 'focus(z, plane, { max })', /NaN/);
  });

  it('interpolate: a color track cannot extrapolate by identity, which returns a number (KN-120)', async () => {
    const { wf } = await load();
    const { interpolate, styleAt } = wf.kinetic;
    const colors = ['#000', '#fff'];
    expect(() => interpolate(-1, [0, 1], colors, { extrapolate: 'identity' })).toThrow(/KN-120/);
    expect(() => interpolate(0.5, [0, 1], colors, { extrapolateRight: 'identity' })).toThrow(/KN-120/);
    expect(() => styleAt(-1, { background: { at: [0, 1], to: colors, extrapolateLeft: 'identity' } })).toThrow(/KN-120/);
    expect(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { bg: { background: { at: [0, 1], to: colors, extrapolate: 'identity' } } } })).toThrow(/KN-120/);
    expect(interpolate(-1, [0, 1], [0, 1], { extrapolate: 'identity' })).toBe(-1);
  });

  it('styleAt: blur beside filter, or transform beside a transform part, is KN-120 at definition and in styleAt()', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const tr = (a, b) => ({ at: [0, 1], to: [a, b] });
    const clashes = [
      { blur: tr(12, 0), filter: tr(0, 1) },
      { scale: tr(1, 2), transform: tr(0, 1) },
      { translateX: tr(0, 10), transform: tr(0, 1) },
      { translateY: tr(0, 10), transform: tr(0, 1) },
      { rotate: tr(0, 90), transform: tr(0, 1) },
    ];
    for (const spec of clashes) {
      expect(() => styleAt(0.5, spec)).toThrow(/KN-120/);
      expect(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { look: spec } })).toThrow(/KN-120/);
    }
    expect(styleAt(0.5, { blur: tr(12, 0), opacity: tr(0, 1) })).toEqual({ filter: 'blur(6px)', opacity: 0.5 });
  });

  it('spring: settles at `to` at Infinity and at a time so large the terms overflow; its options are finite', async () => {
    const { wf } = await load();
    const { spring } = wf.kinetic;
    expect(spring(Infinity)).toBe(1);
    expect(spring(Infinity, { from: 10, to: 20 })).toBe(20);
    expect(spring(Infinity, { damping: 40 })).toBe(1);
    expect(spring(1e308)).toBe(1);
    expect(spring(1e308, { damping: 200, stiffness: 1e4 })).toBe(1);   // critically damped
    expect(() => spring(NaN)).toThrow(/KN-100/);
    for (const bad of [{ stiffness: Infinity }, { mass: Infinity }, { damping: Infinity }, { damping: NaN }, { from: NaN }, { to: Infinity }, { stiffness: '100' }]) {
      expect(() => spring(1, bad)).toThrow(/KN-100/);
    }
    expectKN(() => spring(1, { from: NaN }), 'KN-100', 'spring(t, { from })', /from: NaN/);
  });

  it('colors: a malformed channel is no color; channels clamp to 0..255 and alpha to 0..1 when parsed', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    expect(() => interpolate(0.5, [0, 1], ['rgb(1.2.3, 0, 0)', '#000'])).toThrow(/KN-120/);
    expect(() => interpolate(0.5, [0, 1], ['rgb(., 0, 0)', '#000'])).toThrow(/KN-120/);
    // CSS clamps 300 to 255 before mixing: halfway to black is 128, not 150.
    expect(interpolate(0.5, [0, 1], ['rgb(300, 0, 0)', '#000'])).toBe('rgb(128, 0, 0)');
    // An alpha of 2 is 1: halfway to transparent is 0.5, not opaque.
    expect(interpolate(0.5, [0, 1], ['rgba(0, 0, 0, 2)', 'rgba(0, 0, 0, 0)'])).toBe('rgba(0, 0, 0, 0.5)');
    expect(interpolate(0.5, [0, 1], ['rgb(0 0 0 / 150%)', 'rgb(0 0 0 / 0%)'])).toBe('rgba(0, 0, 0, 0.5)');
  });

  it('tracks: spring options, extrapolate and round are checked where the track is written (KN-121, KN-120)', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    const define = (track) => () => wf.kinetic.scene(uniqueName('scene'), { keyframes: { x: track } });
    expect(define({ at: [0, 1], to: [0, 1], ease: { spring: { stiffness: -1 } } })).toThrow(/KN-121/);
    expect(define({ at: [0, 1], to: [0, 1], ease: { spring: { damping: NaN } } })).toThrow(/KN-121/);
    expect(define({ at: [0, 1], to: [0, 1], extrapolate: 'repeat' })).toThrow(/KN-120/);
    expect(define({ at: [0, 1], to: [0, 1], extrapolateRight: 'nope' })).toThrow(/KN-120/);
    expect(define({ at: [0, 1], to: [0, 1], round: 'yes' })).toThrow(/KN-120/);
    expect(define({ at: [0, 1], to: [0, 1], round: -1 })).toThrow(/KN-120/);
    expect(define({ at: [0, 1], to: [0, 1], round: 1.5 })).toThrow(/KN-120/);
    expect(() => interpolate(0.5, [0, 1], [0, 1], { round: 'yes' })).toThrow(/KN-120/);
    expect(() => wf.kinetic.ease({ spring: { mass: 0 } })).toThrow(/KN-121/);
    expect(() => wf.kinetic.ease({ spring: null })).toThrow(/KN-121/);
    // Valid ones still define.
    expect(define({ at: [0, 1], to: [0, 1], ease: { spring: { stiffness: 200 } }, extrapolate: 'extend', round: 2 })).not.toThrow();
    expect(define({ at: [0, 1], to: [0, 1], round: true })).not.toThrow();
    expect(define({ at: [0, 1], to: [0, 1], round: false })).not.toThrow();
  });

  it('ease: a spring ease called on its own reads its argument as seconds', async () => {
    const { wf } = await load();
    const { ease, spring } = wf.kinetic;
    expect(ease('spring')(0.5)).toBe(spring(0.5));
    expect(ease('spring')(0.5)).toBeGreaterThan(0);
    expect(ease({ spring: { damping: 20 } })(0.1)).toBe(spring(0.1, { damping: 20 }));
    // interpolate hands it progress, then the seconds elapsed in the segment.
    expect(ease('spring')(0.9, 0.2)).toBe(spring(0.2));
  });

  it('interpolate: an infinite t gives the end value on its side, a t that is no number the first; both rounded', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    const at = [0, 1], to = [0.123, 10.456];
    expect(interpolate(Infinity, at, to)).toBe(10.456);
    expect(interpolate(-Infinity, at, to)).toBe(0.123);
    expect(interpolate(Infinity, at, to, { round: 1 })).toBe(10.5);
    expect(interpolate(NaN, at, to, { round: 1 })).toBe(0.1);
    expect(interpolate(Infinity, at, to, { extrapolate: 'extend' })).toBe(10.456);
    expect(interpolate(-Infinity, at, to, { extrapolate: 'extend' })).toBe(0.123);
    expect(interpolate(Infinity, at, [5, 5], { extrapolate: 'extend' })).toBe(5);
    expect(interpolate(Infinity, at, ['#000', '#fff'])).toBe('rgb(255, 255, 255)');
    expect(interpolate(Infinity, at, ['#000', '#fff'], { extrapolate: 'extend' })).toBe('rgb(255, 255, 255)');
    expect(interpolate(Infinity, at, to, { ease: 'spring' })).toBeCloseTo(10.456, 9);
    expect(interpolate(Infinity, at, to, { extrapolate: 'identity' })).toBe(Infinity);
  });

  it('ease: steps() counts the step a product just under a whole number stands for', async () => {
    const { wf } = await load();
    const { ease } = wf.kinetic;
    // 0.29 * 100 is 28.999999999999996 in floating point.
    expect(ease('steps(100)')(0.29)).toBe(0.29);
    expect(ease('steps(100, start)')(0.29)).toBe(0.3);
    expect(ease('steps(4)')(0.2499)).toBe(0);
  });

  it("ramp: t's progress from `from` to `to` as 0 to 1, clamped, shaped by an ease name or function", async () => {
    const { wf } = await load();
    const { ramp, spring } = wf.kinetic;
    expect(ramp(0.5, 0, 1)).toBe(0.5);
    expect(ramp(1.5, 1, 3)).toBe(0.25);
    expect(ramp(-1, 0, 1)).toBe(0);
    expect(ramp(5, 0, 1)).toBe(1);
    expect(ramp(-Infinity, 0, 1)).toBe(0);
    expect(ramp(Infinity, 0, 1)).toBe(1);
    expect(() => ramp(NaN, 0, 1)).toThrow(/KN-100/);
    expect(ramp(0.5, 0, 1, 'power1.in')).toBe(0.25);
    expect(ramp(2, 1, 3, 'power1.in')).toBe(0.25);
    expect(ramp(0.5, 0, 1, (p) => p * p * p)).toBe(0.125);
    expect(ramp(2, 0, 1, 'back.out')).toBe(1);
    // A spring reads the seconds since `from` and settles past `to`, as it does in interpolate.
    expect(ramp(1.2, 1, 1.5, 'spring')).toBeCloseTo(spring(0.2), 12);
    expect(ramp(1.7, 1, 1.5, 'spring')).toBeCloseTo(spring(0.7), 12);
    expect(ramp(0.5, 1, 1.5, 'spring')).toBe(0);
    for (const bad of [['a', 0, 1], [0.5, 1, 1], [0.5, 2, 1], [0.5, NaN, 1], [0.5, 0, Infinity], [0.5, '0', 1], [0.5, 0]]) {
      expect(() => ramp(...bad), JSON.stringify(bad)).toThrow(/KN-100/);
    }
    expect(() => ramp(0.5, 0, 1, 'zoom')).toThrow(/KN-121/);
  });

  it('mix: a + (b - a) * p for numbers, and the colour path interpolate uses for colours', async () => {
    const { wf } = await load();
    const { mix, interpolate } = wf.kinetic;
    expect(mix(0, 10, 0.25)).toBe(2.5);
    expect(mix(10, 0, 0.5)).toBe(5);
    expect(mix(0, 10, 1.5)).toBe(15);
    expect(mix(-4, 4, 0)).toBe(-4);
    expect(mix('#000', '#fff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(mix('#ff0000', 'rgb(0, 0, 255)', 0.5)).toBe('rgb(128, 0, 128)');
    expect(mix('rgba(0, 0, 0, 0)', '#000000ff', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(mix('#000', '#888', 2)).toBe(interpolate(2, [0, 1], ['#000', '#888'], { extrapolate: 'extend' }));
    for (const p of [0, 0.3, 0.77, 1]) {
      expect(mix('#102040', 'rgb(200, 69, 45)', p)).toBe(interpolate(p, [0, 1], ['#102040', 'rgb(200, 69, 45)']));
    }
    for (const bad of [[0, '#fff', 0.5], ['red', '#fff', 0.5], [0, 1, NaN], [0, 1], [NaN, 1, 0.5], [0, 1, '0.5'], [Infinity, 1, 0.5], ['#000', '#fff', Infinity]]) {
      expect(() => mix(...bad), JSON.stringify(bad)).toThrow(/KN-100/);
    }
  });

  it('ease as an array: one ease per segment, in interpolate, styleAt and keyframes; a wrong length or entry is KN-121', async () => {
    const { wf } = await load();
    const { interpolate, styleAt, spring, ease } = wf.kinetic;
    const at = [0, 1, 2], to = [0, 10, 20];
    expect(interpolate(0.5, at, to, { ease: ['power1.in', 'linear'] })).toBe(2.5);
    expect(interpolate(1.5, at, to, { ease: ['power1.in', 'linear'] })).toBe(15);
    expect(interpolate(1.5, at, to, { ease: ['linear', (p) => p * p] })).toBe(12.5);
    // Spring in, ease out, on one property.
    const sp = { at: [0, 1, 2], to: [0, 10, 0], ease: ['spring', 'power3.in'] };
    expect(interpolate(0.2, sp.at, sp.to, sp)).toBeCloseTo(10 * spring(0.2), 12);
    expect(interpolate(1.5, sp.at, sp.to, sp)).toBe(10 - 10 * ease('power3.in')(0.5));
    expect(interpolate(3, sp.at, sp.to, sp)).toBe(0);   // an eased last segment holds its end value
    // A spring on the last segment runs on past the last key, as a single spring ease does.
    expect(interpolate(2.5, [0, 1, 2], [0, 0, 10], { ease: ['linear', 'spring'] })).toBeCloseTo(10 * spring(1.5), 12);
    expect(styleAt(0.2, { translateY: sp })).toEqual(styleAt(0.2, { translateY: { at: [0, 1], to: [0, 10], ease: 'spring' } }));
    expectKN(() => interpolate(0.5, at, to, { ease: ['linear'] }), 'KN-121', 'interpolate.ease', /one ease per segment, 2 for 3 keyframes/);
    expectKN(() => interpolate(0.5, at, to, { ease: ['linear', 'zoom'] }), 'KN-121', 'interpolate.ease[1]', /'zoom'/);
    const define = (track) => () => wf.kinetic.scene(uniqueName('scene'), { keyframes: { look: { opacity: track } } });
    expectKN(define({ at: [0, 1, 2], to: [0, 1, 0], ease: ['linear', 'linear', 'linear'] }), 'KN-121', /scene\('scene-\d+'\)\.keyframes\.look\.opacity\.ease/, /2 for 3 keyframes, not 3/);
    expectKN(define({ at: [0, 1, 2], to: [0, 1, 0], ease: ['spring', { spring: { mass: 0 } }] }), 'KN-121', /scene\('scene-\d+'\)\.keyframes\.look\.opacity\.ease\[1\]\.spring\.mass/);
    expect(define({ at: [0, 1, 2], to: [0, 1, 0], ease: [] })).toThrow(/KN-121/);
    expect(define({ at: [0, 1, 2], to: [0, 1, 0], ease: ['spring', 'power3.in'] })).not.toThrow();
    // A scene reads the per-segment eases through its keyframes.
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { keyframes: { look: { translateY: { at: [0, 1, 2.4, 3], to: [60, 0, 0, -60], ease: ['spring', 'linear', 'power3.in'] } } } });
    const host = await mount(`<div data-composition-id="mo-arr" data-start="0" data-duration="4"><div data-component="${name}" data-start="0"><b data-bind-style="look"></b></div></div>`);
    cleanup.push(host);
    const y = () => parseFloat(host.querySelector('b').style.transform.split(',')[1]);
    wf.kinetic.seek(0.4); await tick(0);
    expect(y()).toBeCloseTo(60 - 60 * spring(0.4), 3);
    wf.kinetic.seek(1.7); await tick(0);
    expect(y()).toBe(0);
    wf.kinetic.seek(2.7); await tick(0);
    expect(y()).toBeCloseTo(-60 * ease('power3.in')(0.5), 3);
  });

  it('KN-122: a length property given numbers with no unit warns once per track, in development only', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, {
        keyframes: {
          bar: { width: { at: [0, 0.6], to: [0, 560] }, opacity: { at: [0, 1], to: [0, 1] }, translateX: { at: [0, 1], to: [0, 50] } },
          box: { height: { at: [0, 1], to: [0, 100], unit: 'px' }, marginTop: { at: [0, 1], to: [0, 0] } },
          lead: { lineHeight: { at: [0, 1], to: [1, 1.4] } },
          size: { at: [0, 1], to: [0, 10] },   // one track: no property to judge
        },
      });
      const spec = { left: { at: [0, 1], to: [0, 100] } };
      wf.kinetic.styleAt(0.5, spec);
      wf.kinetic.styleAt(0.7, spec);
      wf.kinetic.styleAt(0.5, { 'font-size': { at: [0, 1], to: [10, 20] } });
    });
    // The warning's premise: the browser drops a bare number on a length.
    const host = await mount(`<div data-composition-id="mo-unit" data-start="0" data-duration="2"><div data-component="${name}" data-start="0"><b data-bind-style="bar"></b></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.3); await tick(0);
    expect(host.querySelector('b').style.opacity).toBe('0.3');
    expect(host.querySelector('b').style.width).toBe('');
    const kn = lines.filter((l) => l.includes('KN-122'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(4);
    expect(kn[0]).toContain("scene('" + name + "').keyframes.bar.width");
    expect(kn[0]).toMatch(/width takes a length/);
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/Suggestion: .*unit: 'px'/);
    expect(kn[1]).toContain('keyframes.lead.lineHeight');
    expect(kn[1]).toMatch(/multiple of the font size/);
    expect(kn[2]).toMatch(/styleAt\(\): the track 'left'/);
    expect(kn[3]).toMatch(/'font-size'/);
  });

  it('KN-123: a spring cut off by its next key more than 2% from rest warns once per track, in development only', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const cutPose = { translateY: { at: [0, 0.3, 1], to: [40, 0, 0], ease: 'spring' } };
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, {
        keyframes: {
          cut: { translateY: { at: [0, 0.3, 2, 3], to: [40, 0, 0, 40], ease: 'spring' } },
          settled: { translateY: { at: [0, 2, 3], to: [40, 0, 40], ease: 'spring' } },
          last: { opacity: { at: [0, 1, 1.2], to: [0, 1, 0], ease: ['linear', 'spring'] } },
          still: { opacity: { at: [0, 0.3, 1], to: [1, 1, 0], ease: 'spring' } },
          mixed: { scale: { at: [0, 0.3, 1], to: [0.5, 1, 1.2], ease: [{ spring: { stiffness: 100, damping: 10 } }, 'linear'] } },
          one: { at: [0, 0.25, 1], to: [0, 100, 0], ease: ['spring', 'linear'], unit: '%' },
        },
      });
      wf.kinetic.styleAt(0.1, cutPose);
      wf.kinetic.styleAt(0.2, cutPose);
    });
    const kn = lines.filter((l) => l.includes('KN-123'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(4);
    expect(kn[0]).toContain("scene('" + name + "').keyframes.cut.translateY");
    expect(kn[0]).toMatch(/from 0 s to 0\.3 s/);
    expect(kn[0]).toMatch(/4\.97px from rest \(12\.4% of the segment's travel\)/);
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/Suggestion: Give the spring a track of its own with two keyframes.*or lengthen the segment/);
    expect(kn[1]).toContain('keyframes.mixed.scale');
    expect(kn[1]).toMatch(/0\.06 from rest/);
    expect(kn[2]).toContain('keyframes.one');
    expect(kn[2]).toMatch(/from 0 s to 0\.25 s.*2\.34% from rest/);
    expect(kn[3]).toMatch(/styleAt\(\): the track 'translateY'/);
  });

  // The pin: a spec with only translateX, translateY, rotate and scale writes
  // these exact strings, whatever order its keys are in, and with explicit
  // units. Written against the build before the transform keys were added.
  it('styleAt: the four original transform keys write the same transform string in every combination, byte for byte', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const TRACKS = {
      translateX: { at: [0, 1], to: [0, 20] },
      translateY: { at: [0, 1], to: [0, -30] },
      rotate:     { at: [0, 1], to: [0, 90] },
      scale:      { at: [0, 1], to: [1, 2] },
    };
    const PINNED = {
      '':     undefined,
      X:      'translate(10px, 0px)',
      Y:      'translate(0px, -15px)',
      XY:     'translate(10px, -15px)',
      R:      'rotate(45deg)',
      XR:     'translate(10px, 0px) rotate(45deg)',
      YR:     'translate(0px, -15px) rotate(45deg)',
      XYR:    'translate(10px, -15px) rotate(45deg)',
      S:      'scale(1.5)',
      XS:     'translate(10px, 0px) scale(1.5)',
      YS:     'translate(0px, -15px) scale(1.5)',
      XYS:    'translate(10px, -15px) scale(1.5)',
      RS:     'rotate(45deg) scale(1.5)',
      XRS:    'translate(10px, 0px) rotate(45deg) scale(1.5)',
      YRS:    'translate(0px, -15px) rotate(45deg) scale(1.5)',
      XYRS:   'translate(10px, -15px) rotate(45deg) scale(1.5)',
    };
    const LETTER = { translateX: 'X', translateY: 'Y', rotate: 'R', scale: 'S' };
    const keys = Object.keys(TRACKS);
    let combos = 0;
    for (let mask = 0; mask < 16; mask++) {
      const present = keys.filter((k, i) => mask & (1 << i));
      const id = present.map((k) => LETTER[k]).join('');
      for (const order of [present, present.slice().reverse()]) {
        const spec = { opacity: { at: [0, 1], to: [0, 1] } };
        for (const k of order) spec[k] = TRACKS[k];
        const out = styleAt(0.5, spec);
        expect(out.transform, id || 'none').toBe(PINNED[id]);
        expect(out.opacity).toBe(0.5);
      }
      combos++;
    }
    expect(combos).toBe(16);
    // Explicit units, and the ends of the range.
    expect(styleAt(0.5, { translateX: { at: [0, 1], to: [0, 50], unit: '%' }, rotate: { at: [0, 1], to: [0, 1], unit: 'turn' } }).transform).toBe('translate(25%, 0px) rotate(0.5turn)');
    expect(styleAt(0.5, { translateY: { at: [0, 1], to: [0, 4], unit: 'em' }, scale: { at: [0, 1], to: [1, 3], unit: '' } }).transform).toBe('translate(0px, 2em) scale(2)');
    expect(styleAt(-1, { translateX: TRACKS.translateX, translateY: TRACKS.translateY, rotate: TRACKS.rotate, scale: TRACKS.scale }).transform).toBe('translate(0px, 0px) rotate(0deg) scale(1)');
    expect(styleAt(9, { scale: TRACKS.scale, rotate: TRACKS.rotate, translateY: TRACKS.translateY, translateX: TRACKS.translateX }).transform).toBe('translate(20px, -30px) rotate(90deg) scale(2)');
    // Through a scene's keyframes, into the DOM.
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { keyframes: { look: { scale: TRACKS.scale, rotate: TRACKS.rotate, translateY: TRACKS.translateY, translateX: TRACKS.translateX } } });
    const host = await mount(`<div data-composition-id="mo-pin" data-start="0" data-duration="2"><div data-component="${name}" data-start="0"><b data-bind-style="look"></b></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.5); await tick(0);
    const css = (v) => { const i = document.createElement('i'); i.style.transform = v; return i.style.transform; };
    expect(host.querySelector('b').style.transform).toBe(css(PINNED.XYRS));
  });

  // What the browser writes back for a value, so a check reads the same in
  // every browser; an empty string means the browser rejected the value.
  const cssOf = (prop, v) => { const i = document.createElement('i'); i.style[prop] = v; return i.style[prop]; };

  it('styleAt: each of the eight new transform keys alone, with its default unit and with an explicit unit', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const cases = [
      ['perspective', [800, 1000], 'perspective(900px)', [10, 20], 'em', 'perspective(15em)'],
      ['translateZ', [0, 40], 'translateZ(20px)', [0, 4], 'em', 'translateZ(2em)'],
      ['rotateX', [0, 90], 'rotateX(45deg)', [0, 1], 'turn', 'rotateX(0.5turn)'],
      ['rotateY', [0, 90], 'rotateY(45deg)', [0, 1], 'turn', 'rotateY(0.5turn)'],
      ['skewX', [0, 20], 'skewX(10deg)', [0, 1], 'rad', 'skewX(0.5rad)'],
      ['skewY', [0, 20], 'skewY(10deg)', [0, 1], 'rad', 'skewY(0.5rad)'],
      ['scaleX', [1, 2], 'scaleX(1.5)', [100, 200], '%', 'scaleX(150%)'],
      ['scaleY', [1, 2], 'scaleY(1.5)', [100, 200], '%', 'scaleY(150%)'],
    ];
    for (const [key, to, out, toU, unit, outU] of cases) {
      expect(styleAt(0.5, { [key]: { at: [0, 1], to } }), key).toEqual({ transform: out });
      expect(styleAt(0.5, { [key]: { at: [0, 1], to: toU, unit } }), key + ' ' + unit).toEqual({ transform: outU });
      expect(cssOf('transform', out), key).not.toBe('');
      expect(cssOf('transform', outU), key + ' ' + unit).not.toBe('');
    }
  });

  it('styleAt: all twelve transform keys together write eleven functions in the specified order, whatever the order of the keys', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const TRACKS = {
      perspective: { at: [0, 1], to: [800, 1000] },
      translateX:  { at: [0, 1], to: [0, 20] },
      translateY:  { at: [0, 1], to: [0, -30] },
      translateZ:  { at: [0, 1], to: [0, 40] },
      rotateX:     { at: [0, 1], to: [0, 60] },
      rotateY:     { at: [0, 1], to: [0, 90] },
      rotate:      { at: [0, 1], to: [0, 90] },
      skewX:       { at: [0, 1], to: [0, 20] },
      skewY:       { at: [0, 1], to: [0, 10] },
      scale:       { at: [0, 1], to: [1, 2] },
      scaleX:      { at: [0, 1], to: [1, 3] },
      scaleY:      { at: [0, 1], to: [1, 0] },
    };
    const ALL = 'perspective(900px) translate(10px, -15px) translateZ(20px) rotateX(30deg) rotateY(45deg) rotate(45deg) skewX(10deg) skewY(5deg) scale(1.5) scaleX(2) scaleY(0.5)';
    const keys = Object.keys(TRACKS);
    for (const order of [keys, keys.slice().reverse(), [5, 0, 11, 2, 9, 7, 1, 3, 10, 4, 8, 6].map((i) => keys[i])]) {
      const spec = { opacity: { at: [0, 1], to: [0, 1] } };
      for (const k of order) spec[k] = TRACKS[k];
      expect(styleAt(0.5, spec), order.join(' ')).toEqual({ transform: ALL, opacity: 0.5 });
    }
    expect(cssOf('transform', ALL)).not.toBe('');
    // translateZ is a function of its own after translate(X, Y), which keeps its rule.
    expect(styleAt(0.5, { translateZ: TRACKS.translateZ, translateY: TRACKS.translateY }).transform).toBe('translate(0px, -15px) translateZ(20px)');
    // Through a scene's keyframes, into the DOM.
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { keyframes: { look: TRACKS } });
    const host = await mount(`<div data-composition-id="mo-3d" data-start="0" data-duration="2"><div data-component="${name}" data-start="0"><b data-bind-style="look"></b></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.5); await tick(0);
    expect(host.querySelector('b').style.transform).toBe(cssOf('transform', ALL));
  });

  it('styleAt: a transform track beside any of the new transform keys is KN-120, at definition and in styleAt()', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const tr = (a, b) => ({ at: [0, 1], to: [a, b] });
    const transform = { at: [0, 1], to: ['rotate(0deg)', 'rotate(90deg)'] };
    for (const key of ['perspective', 'translateZ', 'rotateX', 'rotateY', 'skewX', 'skewY', 'scaleX', 'scaleY']) {
      const spec = { [key]: tr(1, 2), transform };
      expectKN(() => styleAt(0.5, spec), 'KN-120', 'styleAt(t, tracks).transform', new RegExp('^a transform track beside ' + key));
      expectKN(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { look: spec } }), 'KN-120', /scene\('scene-\d+'\)\.keyframes\.look\.transform/, new RegExp('^a transform track beside ' + key));
    }
    // The development message lists every key that writes transform.
    expectKN(() => styleAt(0.5, { skewY: tr(0, 1), transform }), 'KN-120', 'styleAt(t, tracks).transform', /perspective, translateX, translateY, translateZ, rotateX, rotateY, rotate, skewX, skewY, scale, scaleX, scaleY/);
    // A text track on transform itself, with none of the keys beside it, writes its string.
    expect(styleAt(0.5, { transform: { at: [0, 1], to: ['translate(0px, 0px) rotate(0deg)', 'translate(10px, 20px) rotate(90deg)'] } })).toEqual({ transform: 'translate(5px, 10px) rotate(45deg)' });
  });

  it('styleAt: with only plain numbers the time is not read, so any t does; with a track in it, a t that is no number is KN-100', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const STILL = { translateX: 40, rotate: 12, scale: 1.5, opacity: 0.5 };
    const want = { transform: 'translate(40px, 0px) rotate(12deg) scale(1.5)', opacity: 0.5 };
    for (const t of [0, 3.2, undefined, null, NaN, 'now']) expect(styleAt(t, STILL), String(t)).toEqual(want);
    expectKN(() => styleAt(undefined, { scale: 1.5, rotate: { at: [0, 1], to: [0, 90] } }), 'KN-100', 'styleAt(t)');
  });

  it('styleAt: an object of tracks gives a style object; one track is interpolate(t, track), and pose is gone', async () => {
    const { wf } = await load();
    const { styleAt, interpolate } = wf.kinetic;
    expect(wf.kinetic.pose).toBeUndefined();
    expect(styleAt(0.5, { scale: { at: [0, 1], to: [1, 2] }, opacity: 0.5 })).toEqual({ transform: 'scale(1.5)', opacity: 0.5 });
    // One track is no style: styleAt names the call that reads it.
    expectKN(() => styleAt(0.5, { at: [0, 1], to: [0, 10] }), 'KN-120', 'styleAt(t, track)', /^styleAt\(\) takes an object of tracks; read one track with interpolate\(t, track\)/);
    // interpolate() takes a track as its at, with its own to and options, and a unit as the old one-track form did.
    expect(interpolate(0.5, { at: [0, 1], to: [0, 10] })).toBe(5);
    expect(interpolate(0.5, { at: [0, 1], to: [0, 10], unit: 'px' })).toBe('5px');
    expect(interpolate(0.25, { at: [0, 1], to: [0, 100], ease: 'linear', round: true })).toBe(25);
    expect(interpolate(0.5, { at: [0, 1], to: ['#000', '#fff'] })).toBe('rgb(128, 128, 128)');
    expect(interpolate(-1, { at: [0, 1], to: [0, 10] })).toBe(0);
    expect(interpolate(0.5, [0, 1], [0, 10])).toBe(5);
    // The track is checked as a track, under interpolate's name.
    expectKN(() => interpolate(0.5, { at: [0], to: [1] }), 'KN-120', 'interpolate(t, track).at');
    expectKN(() => interpolate(0.5, { at: [0, 1], to: ['#000', '#fff'], unit: 'px' }), 'KN-120', 'interpolate(t, track).unit');
    // A track carries its own to and options, so anything after it is a mistake.
    expectKN(() => interpolate(0.5, { at: [0, 1], to: [0, 10] }, [0, 5]), 'KN-100', 'interpolate(t, track, …)', /^a track carries its own to and options; pass it alone/);
  });

  it('styleAt: a number is that key at every time, with its default unit, beside tracks and in the same order', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const tr = (a, b) => ({ at: [0, 1], to: [a, b] });
    expect(styleAt(0.5, { scale: 1.5 })).toEqual({ transform: 'scale(1.5)' });
    expect(styleAt(0.5, { translateY: 20 })).toEqual({ transform: 'translate(0px, 20px)' });
    expect(styleAt(0.5, { translateX: 10, translateY: tr(0, -30) })).toEqual({ transform: 'translate(10px, -15px)' });
    expect(styleAt(0.5, { scale: 2, rotate: tr(0, 90), translateY: 8, opacity: 0.5 })).toEqual({ transform: 'translate(0px, 8px) rotate(45deg) scale(2)', opacity: 0.5 });
    expect(styleAt(0.5, { blur: 4, scale: tr(1, 2) })).toEqual({ transform: 'scale(1.5)', filter: 'blur(4px)' });
    // 0 is a value, not a missing key: scale(0) hides the element.
    expect(styleAt(0.5, { scale: 0 })).toEqual({ transform: 'scale(0)' });
    expect(styleAt(0.5, { rotate: 0, blur: 0 })).toEqual({ transform: 'rotate(0deg)', filter: 'blur(0px)' });
    // All twelve as numbers, written in the order the tracks are.
    const ALL = 'perspective(900px) translate(10px, -15px) translateZ(20px) rotateX(30deg) rotateY(45deg) rotate(45deg) skewX(10deg) skewY(5deg) scale(1.5) scaleX(2) scaleY(0.5)';
    const nums = { scaleY: 0.5, scaleX: 2, scale: 1.5, skewY: 5, skewX: 10, rotate: 45, rotateY: 45, rotateX: 30, translateZ: 20, translateY: -15, translateX: 10, perspective: 900 };
    expect(styleAt(0, nums).transform).toBe(ALL);
    expect(cssOf('transform', ALL)).not.toBe('');
    // The same at any time, in a seek or outside one.
    expect(styleAt(-5, { scale: 1.5 })).toEqual(styleAt(99, { scale: 1.5 }));
    // A property that is no transform key takes the number as it is.
    expect(styleAt(0.5, { opacity: 0.25, zIndex: 3 })).toEqual({ opacity: 0.25, zIndex: 3 });
    // A number that is not finite is KN-120 at its key; a string is still no track.
    expectKN(() => styleAt(0.5, { scale: NaN }), 'KN-120', 'styleAt(t, tracks).scale', /^a number or a track/);
    expectKN(() => styleAt(0.5, { rotate: Infinity }), 'KN-120', 'styleAt(t, tracks).rotate', /^a number or a track/);
    expectKN(() => styleAt(0.5, { transform: 'scale(1.2)' }), 'KN-120', 'styleAt(t, tracks).transform', /^a number or a track/);
    // A whole style is still tracks, not one number.
    expect(() => styleAt(0.5, 3)).toThrow(/KN-120/);
    // A number on a transform key beside a transform track still clashes.
    expectKN(() => styleAt(0.5, { scale: 2, transform: { at: [0, 1], to: ['rotate(0deg)', 'rotate(90deg)'] } }), 'KN-120', 'styleAt(t, tracks).transform', /^a transform track beside scale/);
  });

  it('keyframes: a number is that key at every time, as in styleAt(), into the DOM', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { keyframes: { card: { rotate: 12, scale: 0.5, opacity: { at: [0, 1], to: [0, 1] } } } });
    const host = await mount(`<div data-composition-id="mo-num" data-start="0" data-duration="2"><div data-component="${name}" data-start="0"><b data-bind-style="card"></b></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.5); await tick(0);
    const b = host.querySelector('b');
    expect(b.style.transform).toBe(cssOf('transform', 'rotate(12deg) scale(0.5)'));
    expect(b.style.opacity).toBe('0.5');
    wf.kinetic.seek(1.5); await tick(0);
    expect(b.style.transform).toBe(cssOf('transform', 'rotate(12deg) scale(0.5)'));
    // Checked where it was written, as a track is.
    expectKN(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { card: { scale: NaN } } }), 'KN-120', /scene\('scene-\d+'\)\.keyframes\.card\.scale/, /^a number or a track/);
    expectKN(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { card: { scale: 2, transform: { at: [0, 1], to: ['rotate(0deg)', 'rotate(90deg)'] } } } }), 'KN-120', /scene\('scene-\d+'\)\.keyframes\.card\.transform/, /^a transform track beside scale/);
  });

  it('KN-122: a number on a length property warns once per place, in development only, at definition and in styleAt()', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, { keyframes: { bar: { width: 120, opacity: 1 } } });
      for (let i = 0; i < 3; i++) wf.kinetic.styleAt(i / 3, { left: 40 + i });
      wf.kinetic.styleAt(0.5, { top: 0 });   // 0 needs no unit
    });
    const kn = lines.filter((l) => l.includes('KN-122'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(2);
    expect(kn[0]).toContain("scene('" + name + "').keyframes.bar.width");
    expect(kn[0]).toMatch(/is a number with no unit, and width takes a length, so the browser ignores 120/);
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/Suggestion: Set width in CSS \(width: 120px\), or give it a track with unit: 'px'/);
    expect(kn[1]).toMatch(/styleAt\(\): 'left' is a number with no unit/);
  });

  it('styleAt: a track of colours or text on a transform key, or on blur, is KN-120; they take numbers', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const colors = { at: [0, 1], to: ['#000', '#fff'] };
    const text = { at: [0, 1], to: ['10deg', '20deg'] };
    for (const key of ['perspective', 'translateX', 'translateY', 'translateZ', 'rotateX', 'rotateY', 'rotate', 'skewX', 'skewY', 'scale', 'scaleX', 'scaleY', 'blur']) {
      for (const track of [colors, text]) {
        expectKN(() => styleAt(0.5, { [key]: track }), 'KN-120', 'styleAt(t, tracks).' + key + '.to', key + ' takes numbers, not colours or text');
        expectKN(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { look: { [key]: track } } }), 'KN-120', new RegExp("scene\\('scene-\\d+'\\)\\.keyframes\\.look\\." + key + '\\.to'), new RegExp('^' + key + ' takes numbers'));
      }
    }
  });

  it('text tracks: inset(), circle(), drop-shadow() with a colour, font-variation-settings and a gradient with stops interpolate every number and colour', async () => {
    const { wf } = await load();
    const { interpolate, styleAt } = wf.kinetic;
    const at = [0, 1];
    expect(interpolate(0.5, at, ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'])).toBe('inset(0% 50% 0% 0%)');
    expect(interpolate(0.25, at, ['circle(0% at 30% 40%)', 'circle(80% at 50% 60%)'])).toBe('circle(20% at 35% 45%)');
    expect(interpolate(0.5, at, ['drop-shadow(0px 0px 0px rgba(0, 0, 0, 0))', 'drop-shadow(0px 12px 24px rgba(0, 0, 0, 0.45))'])).toBe('drop-shadow(0px 6px 12px rgba(0, 0, 0, 0.225))');
    expect(interpolate(0.5, at, ['drop-shadow(0px 4px 8px #000000)', 'drop-shadow(0px 4px 8px #ff8000)'])).toBe('drop-shadow(0px 4px 8px rgb(128, 64, 0))');
    expect(interpolate(0.5, at, ['"wght" 300', '"wght" 800'])).toBe('"wght" 550');
    expect(interpolate(0.5, at, ['"wght" 300, "wdth" 75', '"wght" 800, "wdth" 125'])).toBe('"wght" 550, "wdth" 100');
    expect(interpolate(0.5, at, ['linear-gradient(90deg, #102040 0%, #c8452d 50%, #ffffff 100%)', 'linear-gradient(180deg, #000000 0%, #ffffff 20%, #ffffff 100%)']))
      .toBe('linear-gradient(135deg, rgb(8, 16, 32) 0%, rgb(228, 162, 150) 35%, rgb(255, 255, 255) 100%)');
    // A number inside a word, a quoted string or after # stays text.
    expect(interpolate(0.5, at, ['"ss01" 0, h1 0', '"ss01" 1, h1 2'])).toBe('"ss01" 0.5, h1 1');
    // In styleAt(), on any style key, as the string.
    const look = styleAt(0.5, {
      clipPath: { at, to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'] },
      filter: { at, to: ['drop-shadow(0px 2px 4px rgba(0, 0, 0, 0.3))', 'drop-shadow(0px 24px 32px rgba(0, 0, 0, 0.5))'] },
      fontVariationSettings: { at, to: ['"wght" 300', '"wght" 800'] },
      backgroundImage: { at, to: ['linear-gradient(90deg, #000000 0%, #ffffff 100%)', 'linear-gradient(90deg, #000000 50%, #ffffff 100%)'] },
      opacity: { at, to: [0, 1] },
    });
    expect(look).toEqual({
      clipPath: 'inset(0% 50% 0% 0%)',
      filter: 'drop-shadow(0px 13px 18px rgba(0, 0, 0, 0.4))',
      fontVariationSettings: '"wght" 550',
      backgroundImage: 'linear-gradient(90deg, rgb(0, 0, 0) 25%, rgb(255, 255, 255) 100%)',
      opacity: 0.5,
    });
    for (const k of ['clipPath', 'filter', 'fontVariationSettings', 'backgroundImage']) expect(cssOf(k, look[k]), k).not.toBe('');
  });

  it('text tracks: eased, eased per segment and sprung, with extend, clamp and round', async () => {
    const { wf } = await load();
    const { interpolate, ease, spring } = wf.kinetic;
    const WIPE = ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'];
    expect(interpolate(0.5, [0, 1], WIPE, { ease: 'power1.in' })).toBe('inset(0% 75% 0% 0%)');
    // One ease per segment.
    const three = ['circle(0% at 50% 50%)', 'circle(40% at 50% 50%)', 'circle(40% at 90% 10%)'];
    expect(interpolate(0.5, [0, 1, 2], three, { ease: ['power1.in', 'linear'] })).toBe('circle(10% at 50% 50%)');
    expect(interpolate(1.5, [0, 1, 2], three, { ease: ['power1.in', 'linear'] })).toBe('circle(40% at 70% 30%)');
    expect(interpolate(1.5, [0, 1, 2], three, { ease: ['linear', 'power1.in'] })).toBe('circle(40% at ' + (50 + 40 * ease('power1.in')(0.5)) + '% ' + (50 - 40 * ease('power1.in')(0.5)) + '%)');
    // A spring reads seconds, applies to every number, and runs on past the last key.
    const num = (s, i) => Number(s.match(/-?[\d.]+/g)[i]);
    for (const t of [0.2, 0.7]) {
      const v = interpolate(t, [0, 0.5], ['circle(0% at 50% 50%)', 'circle(100% at 40% 50%)'], { ease: 'spring' });
      expect(Math.abs(num(v, 0) - 100 * spring(t)), v).toBeLessThan(6e-5);
      expect(Math.abs(num(v, 1) - (50 - 10 * spring(t))), v).toBeLessThan(6e-5);
    }
    // clamp is the default; extend continues every number and colour of the end segment.
    expect(interpolate(1.5, [0, 1], WIPE)).toBe('inset(0% 0% 0% 0%)');
    expect(interpolate(-1, [0, 1], WIPE)).toBe('inset(0% 100% 0% 0%)');
    expect(interpolate(1.5, [0, 1], WIPE, { extrapolate: 'extend' })).toBe('inset(0% -50% 0% 0%)');
    expect(interpolate(-0.5, [0, 1], WIPE, { extrapolateLeft: 'extend' })).toBe('inset(0% 150% 0% 0%)');
    expect(interpolate(-0.5, [0, 1], WIPE, { extrapolateRight: 'extend' })).toBe('inset(0% 100% 0% 0%)');
    expect(interpolate(2, [0, 1], ['drop-shadow(0px 12px 24px rgba(0, 0, 0, 0))', 'drop-shadow(0px 24px 48px rgba(0, 0, 0, 0.45))'], { extrapolate: 'extend' }))
      .toBe('drop-shadow(0px 36px 72px rgba(0, 0, 0, 0.9))');
    expect(interpolate(Infinity, [0, 1], WIPE, { extrapolate: 'extend' })).toBe('inset(0% 0% 0% 0%)');
    // round applies to every number, first; colours are written as colour tracks write them.
    expect(interpolate(1 / 3, [0, 1], WIPE)).toBe('inset(0% 66.6667% 0% 0%)');
    expect(interpolate(1 / 3, [0, 1], WIPE, { round: true })).toBe('inset(0% 67% 0% 0%)');
    expect(interpolate(1 / 3, [0, 1], WIPE, { round: 1 })).toBe('inset(0% 66.7% 0% 0%)');
    expect(interpolate(1 / 3, [0, 1], ['drop-shadow(0px 0px 0px #000)', 'drop-shadow(0px 10px 0px #fff)'], { round: true })).toBe('drop-shadow(0px 3px 0px rgb(85, 85, 85))');
    // A keyframes entry reads the same values.
    const define = (track) => () => wf.kinetic.scene(uniqueName('scene'), { keyframes: { panel: { clipPath: track } } });
    expect(define({ at: [0, 1], to: WIPE, ease: ['power3.out'], extrapolate: 'extend', round: 2 })).not.toThrow();
  });

  it('text tracks: a mismatch between keyframes is KN-120 at definition, with the first difference in the message', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    const name = uniqueName('scene');
    const define = (to) => () => wf.kinetic.scene(name, { keyframes: { panel: { clipPath: { at: to.map((_, i) => i), to } } } });
    // The where names the keyframe that differs from the first.
    const where = (i) => "scene('" + name + "').keyframes.panel.clipPath.to[" + i + ']';
    const tail = '; the values of a track must have the same text, with only the numbers and colours changing';
    // Different text.
    expectKN(define(['inset(0% 0% 0% 0%)', 'circle(0% at 50% 50%)']), 'KN-120', where(1), /^to\[1\] has "circle\(" at its start where to\[0\] has "inset\("/);
    // A unit change.
    expectKN(define(['inset(0% 100% 0% 0%)', 'inset(0% 0px 0% 0%)']), 'KN-120', where(1), /^to\[1\] has "px " after its 2nd number where to\[0\] has "% "/);
    // A number where a colour was, in the third keyframe.
    expectKN(define(['drop-shadow(0px 0px 0px #000)', 'drop-shadow(0px 4px 8px #333)', 'drop-shadow(0px 4px 8px 0)']), 'KN-120', where(2),
      /^to\[2\] has a number after its 3rd number where to\[0\] has a colour/);
    // A different count of numbers.
    expectKN(define(['inset(0% 0% 0% 0%)', 'inset(0% 0%)']), 'KN-120', where(1), /^to\[1\] has "%\)" after its 2nd number where to\[0\] has "% "/);
    expectKN(define(['translate(0px) ', 'translate(0px) 4']), 'KN-120', where(1), /^to\[1\] has a number after its 1st number where to\[0\] has nothing/);
    expectKN(define(['blur(4px)', 'blur(#fff)']), 'KN-120', where(1), /^to\[1\] has a colour after "blur\(" where to\[0\] has a number/);
    expect(define(['inset(0%)', 'inset(1%)'])).not.toThrow();
    const err = expectKN(define(['inset(0% 100% 0% 0%)', 'inset(0% 0px 0% 0%)']), 'KN-120', where(1));
    if (BUILD === 'dev') expect(err.message.endsWith(tail)).toBe(true);
    // The same from interpolate(); a colour beside a word is a mismatch too.
    expectKN(() => interpolate(0.5, [0, 1], ['red', '#fff']), 'KN-120', 'interpolate.to[1]', /^to\[1\] has a colour at its start where to\[0\] has "red"/);
    expect(() => interpolate(0.5, [0, 1], ['1px', 2])).toThrow(/KN-120/);
  });

  it("text tracks: 'identity' and unit are KN-120, and a text track is written as numbers formatted to four decimals at most, with no -0 and no trailing zeros", async () => {
    const { wf } = await load();
    const { interpolate, styleAt } = wf.kinetic;
    const WIPE = ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'];
    // The where names the option: extrapolate, or the side's own.
    expectKN(() => interpolate(-1, [0, 1], WIPE, { extrapolate: 'identity' }), 'KN-120', 'interpolate.extrapolate', /^a text track cannot extrapolate by 'identity'/);
    expectKN(() => interpolate(2, [0, 1], WIPE, { extrapolateRight: 'identity' }), 'KN-120', 'interpolate.extrapolateRight', /^a text track cannot extrapolate by 'identity'/);
    const define = (track) => () => wf.kinetic.scene(uniqueName('scene'), { keyframes: { panel: { clipPath: track } } });
    expectKN(define({ at: [0, 1], to: WIPE, unit: 'px' }), 'KN-120', /scene\('scene-\d+'\)\.keyframes\.panel\.clipPath\.unit/, /^a text track has no unit/);
    expectKN(define({ at: [0, 1], to: WIPE, extrapolate: 'identity' }), 'KN-120', /scene\('scene-\d+'\)\.keyframes\.panel\.clipPath\.extrapolate/, /^a text track cannot extrapolate by 'identity'/);
    expectKN(() => styleAt(0.5, { clipPath: { at: [0, 1], to: WIPE, unit: '%' } }), 'KN-120', 'styleAt(t, tracks).clipPath.unit', /has no unit/);
    // Formatting.
    const decimals = (s) => (s.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) || []);
    const check = (s) => {
      for (const n of decimals(s)) {
        expect(n, s).not.toMatch(/^-0(?:\.0*)?$/);
        expect(n, s).not.toMatch(/\.\d{5,}/);
        expect(n, s).not.toMatch(/\.\d*0$|\.$/);
      }
    };
    const TRACK = ['translate(-0.00001px, 3.14159265px) rotate(1.50deg)', 'translate(5px, -2.71828183px) rotate(-1.5deg)'];
    for (let i = 0; i <= 30; i++) check(interpolate(i / 30, [0, 1], TRACK));
    expect(interpolate(0, [0, 1], TRACK)).toBe('translate(0px, 3.1416px) rotate(1.5deg)');
    expect(interpolate(1 / 3, [0, 1], ['translate(0px, 0px)', 'translate(1px, -1px)'])).toBe('translate(0.3333px, -0.3333px)');
    expect(interpolate(0.5, [0, 1], ['rotate(-10deg)', 'rotate(10deg)'])).toBe('rotate(0deg)');
    expect(interpolate(0.04, [0, 1], ['rotate(-10deg)', 'rotate(0deg)'], { round: true })).toBe('rotate(-10deg)');
    expect(interpolate(0.97, [0, 1], ['rotate(-10deg)', 'rotate(0deg)'], { round: true })).toBe('rotate(0deg)');
    expect(interpolate(1, [0, 1], ['scale(1.000)', 'scale(2.50000)'])).toBe('scale(2.5)');
    expect(interpolate(0, [0, 1], ['scale(1e2)', 'scale(2e2)'])).toBe('scale(100)');
  });

  it('interpolate() and mix() take text values; a mix() of two values that do not match is KN-100', async () => {
    const { wf } = await load();
    const { interpolate, mix } = wf.kinetic;
    expect(interpolate(0.25, [0, 1], ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'])).toBe('inset(0% 75% 0% 0%)');
    expect(mix('inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)', 0.25)).toBe('inset(0% 75% 0% 0%)');
    expect(mix('drop-shadow(0px 0px 0px #000)', 'drop-shadow(0px 8px 16px #fff)', 0.5)).toBe('drop-shadow(0px 4px 8px rgb(128, 128, 128))');
    expect(mix('inset(0%)', 'inset(10%)', 2)).toBe('inset(20%)');
    expect(mix('"wght" 300', '"wght" 800', 1 / 3)).toBe('"wght" 466.6667');
    for (const p of [0, 0.3, 0.77, 1]) {
      expect(mix('circle(0% at 30% 40%)', 'circle(80% at 50% 60%)', p)).toBe(interpolate(p, [0, 1], ['circle(0% at 30% 40%)', 'circle(80% at 50% 60%)']));
    }
    // Two colours still mix as colours.
    expect(mix('#000', '#fff', 0.5)).toBe('rgb(128, 128, 128)');
    expectKN(() => mix('inset(0%)', 'inset(10px)', 0.5), 'KN-100', 'mix(…, b)', /^b has "px\)" after its 1st number where a has "%\)"; a and b must have the same text/);
    expectKN(() => mix('inset(0%)', 'circle(0%)', 0.5), 'KN-100', 'mix(…, b)', /^b has "circle\(" at its start where a has "inset\("/);
    expectKN(() => mix('drop-shadow(0px #000)', 'drop-shadow(0px 1)', 0.5), 'KN-100', 'mix(…, b)', /^b has a number after its 1st number where a has a colour/);
    expectKN(() => mix('inset(0%)', 4, 0.5), 'KN-100', 'mix(a, b)', /^a and b are two finite numbers/);
    expectKN(() => mix(0, 1, 'half'), 'KN-100', 'mix(…, p)', /^p is a finite number/);
    expect(() => mix('inset(0%)', 4, 0.5)).toThrow(/KN-100/);
  });

  it('KN-123 reads a spring cut short on a text track from its largest number change, and the new transform keys carry their default units', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, {
        keyframes: {
          panel: { clipPath: { at: [0, 0.3, 2], to: ['inset(0% 40% 0% 4%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 0%)'], ease: 'spring' } },
          turn: { rotateY: { at: [0, 0.3, 2, 3], to: [40, 0, 0, 40], ease: 'spring' } },
          deep: { perspective: { at: [0, 0.3, 2], to: [840, 800, 800], ease: 'spring' }, translateZ: { at: [0, 1], to: [0, 100] }, skewX: { at: [0, 1], to: [0, 10] } },
        },
      });
    });
    const kn = lines.filter((l) => l.includes('KN-123'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(lines.filter((l) => l.includes('KN-122'))).toEqual([]);
    expect(kn.length, kn.join(' || ')).toBe(3);
    expect(kn[0]).toContain('keyframes.panel.clipPath');
    expect(kn[0]).toMatch(/is still 4\.97% from rest \(12\.4% of the segment's travel\)/);
    expect(kn[1]).toMatch(/keyframes\.turn\.rotateY.*4\.97deg from rest/);
    expect(kn[2]).toMatch(/keyframes\.deep\.perspective.*4\.97px from rest/);
  });

  it('messages print NaN and Infinity as themselves, not as null', async () => {
    const { wf } = await load();
    const { focus, spring, random } = wf.kinetic;
    expectKN(() => focus(0, 0, { range: NaN }), 'KN-100', 'focus(z, plane, { range })', /not NaN/);
    expectKN(() => focus(0, 0, { steps: Infinity }), 'KN-100', 'focus(z, plane, { steps })', /not Infinity/);
    expectKN(() => spring(1, { stiffness: NaN }), 'KN-100', 'spring(t, { stiffness })', /stiffness: NaN/);
    expectKN(() => random(NaN), 'KN-100', 'random(seed)', /not NaN/);
    expectKN(() => random(-Infinity), 'KN-100', 'random(seed)', /not -Infinity/);
  });

  // ---- the small helpers (KINETIC_SPEC_SMALL_HELPERS_2026-10-09) ----

  const close = (got, want, label) => {
    expect(got.length, label).toBe(want.length);
    got.forEach((v, i) => expect(v, (label || '') + ' [' + i + ']').toBeCloseTo(want[i], 12));
  };

  it('stagger: the delay of item i of n from each origin in one dimension, by each or by total, eased', async () => {
    const { wf } = await load();
    const { stagger } = wf.kinetic;
    const d = (n, o) => Array.from({ length: n }, (_, i) => stagger(i, n, o));
    close(d(5), [0, 0.05, 0.1, 0.15, 0.2], 'first, 0.05 s each by default');
    close(d(5, { each: 0.1, from: 'first' }), [0, 0.1, 0.2, 0.3, 0.4], 'first');
    close(d(5, { each: 0.1, from: 'last' }), [0.4, 0.3, 0.2, 0.1, 0], 'last');
    close(d(5, { each: 0.1, from: 'center' }), [0.2, 0.1, 0, 0.1, 0.2], 'center, odd');
    // The delays count from the first item to start: with an even n the two middle items start at 0.
    close(d(4, { each: 0.1, from: 'center' }), [0.1, 0, 0, 0.1], 'center, even');
    close(d(4, { total: 1, from: 'center' }), [1, 0, 0, 1], 'center, even, total');
    close(d(6, { total: 1, from: 'center', ease: 'power1.in' }), [1, 0.25, 0, 0, 0.25, 1], 'center, even, eased');
    close(d(5, { each: 0.1, from: 'edges' }), [0, 0.1, 0.2, 0.1, 0], 'edges, odd');
    close(d(6, { each: 0.1, from: 'edges' }), [0, 0.1, 0.2, 0.2, 0.1, 0], 'edges, even');
    close(d(5, { each: 0.1, from: 1 }), [0.1, 0, 0.1, 0.2, 0.3], 'an index');
    // total: seconds from the first item to start to the last; it overrides each.
    close(d(5, { total: 1 }), [0, 0.25, 0.5, 0.75, 1], 'total');
    close(d(5, { total: 1, from: 'center' }), [1, 0.5, 0, 0.5, 1], 'total from center');
    close(d(5, { total: 1, each: 9 }), [0, 0.25, 0.5, 0.75, 1], 'total over each');
    // ease: an item at fraction d of the largest distance starts at ease(d) times the span.
    close(d(5, { total: 1, ease: 'power1.in' }), [0, 0.0625, 0.25, 0.5625, 1], 'eased total');
    close(d(5, { each: 0.1, ease: 'power1.in' }), [0, 0.025, 0.1, 0.225, 0.4], 'eased each');
    close(d(5, { each: 0.1, ease: (p) => p * p * p }), [0, 0.4 / 64, 0.4 / 8, 0.4 * 27 / 64, 0.4], 'an ease function');
    // One item, or every item at distance 0, starts at once.
    expect(stagger(0, 1)).toBe(0);
    expect(stagger(0, 1, { from: 'center', total: 2 })).toBe(0);
    expect(stagger(1, 2, { from: 'edges', each: 1 })).toBe(0);
    expect(stagger(2, 3, { each: 0 })).toBe(0);
  });

  it('stagger: on a grid, the straight-line distance between cells, or the distance along one axis', async () => {
    const { wf } = await load();
    const { stagger } = wf.kinetic;
    const g = (o) => Array.from({ length: 9 }, (_, i) => stagger(i, 9, Object.assign({ grid: [3, 3], each: 0.1 }, o)));
    const r2 = Math.SQRT2, r5 = Math.sqrt(5), r8 = Math.sqrt(8);
    const x01 = (a) => a.map((v) => v * 0.1);
    close(g(), x01([0, 1, 2, 1, r2, r5, 2, r5, r8]), 'first');
    close(g({ from: 'last' }), x01([r8, r5, 2, r5, r2, 1, 2, 1, 0]), 'last');
    close(g({ from: 'center' }), x01([r2, 1, r2, 1, 0, 1, r2, 1, r2]), 'center');
    close(g({ from: 2 }), x01([2, 1, 0, r5, r2, 1, r8, r5, 2]), 'an index');
    close(g({ axis: 'x' }), x01([0, 1, 2, 0, 1, 2, 0, 1, 2]), 'axis x');
    close(g({ axis: 'y', from: 'last' }), x01([2, 2, 2, 1, 1, 1, 0, 0, 0]), 'axis y from last');
    close(g({ total: 1 }), [0, 1, 2, 1, r2, r5, 2, r5, r8].map((v) => v / r8), 'total');
    // edges: the distance to the nearest edge of the grid, rings from the outside in.
    const e = (o) => Array.from({ length: 15 }, (_, i) => stagger(i, 15, Object.assign({ grid: [5, 3], each: 0.1, from: 'edges' }, o)));
    close(e(), x01([0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0]), 'edges');
    close(e({ axis: 'x' }), x01([0, 1, 2, 1, 0, 0, 1, 2, 1, 0, 0, 1, 2, 1, 0]), 'edges along x');
    // Fewer items than cells: the centre is the grid's, the largest distance the items'.
    close(Array.from({ length: 7 }, (_, i) => stagger(i, 7, { grid: [3, 3], total: 1, from: 'center' })), [r2, 1, r2, 1, 0, 1, r2].map((v) => v / r2), 'seven of nine');
    // The delays count from the first item to start. 'last' on seven of nine is the empty cell
    // at (2, 2): item 5, one cell away, starts at 0 and item 0, the farthest, at total.
    close(Array.from({ length: 7 }, (_, i) => stagger(i, 7, { grid: [3, 3], total: 1, from: 'last' })), [r8, r5, 2, r5, r2, 1, 2].map((v) => (v - 1) / (r8 - 1)), 'seven of nine from last');
    // A 4 x 4 grid's centre falls between cells: the middle four start at 0, the corners at total.
    const c4 = Array.from({ length: 16 }, (_, i) => stagger(i, 16, { grid: [4, 4], total: 1, from: 'center' }));
    expect([5, 6, 9, 10].map((i) => c4[i])).toEqual([0, 0, 0, 0]);
    expect(Math.min(...c4)).toBe(0);
    close([0, 3, 12, 15].map((i) => c4[i]), [1, 1, 1, 1], '4 x 4 corners');
    close([1, 4].map((i) => c4[i]), [1, 1].map(() => (Math.sqrt(2.5) - Math.sqrt(0.5)) / (Math.sqrt(4.5) - Math.sqrt(0.5))), '4 x 4 edge middles');
    close(Array.from({ length: 16 }, (_, i) => stagger(i, 16, { grid: [4, 4], each: 0.1, from: 'center' })).filter((_, i) => [0, 5].includes(i)), [(Math.sqrt(4.5) - Math.sqrt(0.5)) * 0.1, 0], '4 x 4 by each');
  });

  it("stagger: 'random' gives each item a rank in a seeded shuffle, the same for the same seed and n", async () => {
    const { wf } = await load();
    const { stagger } = wf.kinetic;
    const ranks = (n, seed) => Array.from({ length: n }, (_, i) => Math.round(stagger(i, n, { from: 'random', each: 1, seed })));
    const a = ranks(10, 1);
    expect(a.slice().sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(a).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ranks(10, 1)).toEqual(a);
    expect(ranks(10, undefined)).toEqual(a);   // seed 1 by default
    expect(ranks(10, 2)).not.toEqual(a);
    expect(ranks(10, 'two')).not.toEqual(a);
    // The same orders on every machine: mulberry32 and xmur3 use integer arithmetic only.
    expect(a).toEqual([7, 8, 3, 2, 1, 5, 9, 4, 0, 6]);
    expect(ranks(10, 'two')).toEqual([0, 4, 3, 7, 5, 9, 8, 1, 2, 6]);
    // The last in the order starts at total; a grid does not change the order.
    expect(stagger(a.indexOf(9), 10, { from: 'random', total: 2 })).toBe(2);
    expect(Array.from({ length: 10 }, (_, i) => Math.round(stagger(i, 10, { from: 'random', each: 1, grid: [5, 2] })))).toEqual(a);
    // Another stagger in between leaves the order as it was.
    stagger(0, 7, { from: 'random', seed: 99 });
    expect(ranks(10, 1)).toEqual(a);
  });

  it('stagger: KN-100 for a bad i, n or option, with the call, the range and the value; KN-121 for an unknown ease', async () => {
    const { wf } = await load();
    const { stagger } = wf.kinetic;
    const bad = [
      [0, 0], [0, 1.5], [0, '3'], [-1, 3], [3, 3], [0.5, 3], ['0', 3],
      [0, 3, { each: -0.1 }], [0, 3, { each: NaN }], [0, 3, { each: '0.1' }], [0, 3, { total: -1 }], [0, 3, { total: Infinity }],
      [0, 3, { from: 'middle' }], [0, 3, { from: 3 }], [0, 3, { from: -1 }], [0, 3, { from: 1.5 }],
      [0, 3, { grid: [3] }], [0, 3, { grid: 3 }], [0, 3, { grid: [1, 2] }], [0, 3, { grid: [3, 0] }], [0, 3, { grid: [1.5, 2] }],
      [0, 3, { axis: 'x' }], [0, 3, { grid: [3, 1], axis: 'z' }], [0, 3, { from: 'random', seed: null }],
    ];
    for (const args of bad) expect(() => stagger(...args), JSON.stringify(args)).toThrow(/KN-100/);
    expectKN(() => stagger(0, 0), 'KN-100', 'stagger(…, n)', /^n is a whole number from 1 to 1000000, not 0/);
    expectKN(() => stagger(3, 3), 'KN-100', 'stagger(i)', /^i is a whole number from 0 to 2, not 3/);
    expectKN(() => stagger(0, 3, { from: 'middle' }), 'KN-100', 'stagger(i, n, { from })', /from is 'first', 'last', 'center', 'edges', 'random' or an index from 0 to 2, not "middle"/);
    expectKN(() => stagger(0, 3, { each: NaN }), 'KN-100', 'stagger(i, n, { each })', /each .*not NaN/);
    expectKN(() => stagger(0, 3, { axis: 'x' }), 'KN-100', 'stagger(i, n, { axis, grid })', /^axis "x" needs grid: \[columns, rows\]$/);
    expectKN(() => stagger(0, 3, { grid: [3, 1], axis: 'z' }), 'KN-100', 'stagger(i, n, { axis })', /^axis is 'x' or 'y', not "z"$/);
    expectKN(() => stagger(0, 3, { from: 'random', seed: null }), 'KN-100', 'stagger(i, n, { seed })', /^seed is a number or a string, not null/);
    expect(() => stagger(0, 3, { ease: 'nope' })).toThrow(/KN-121/);
  });

  it('spring by duration and bounce: settles within 1 ms of the duration, measured by settle() and by a scan; bounce 0 never overshoots', async () => {
    const { wf } = await load();
    const { spring, settle } = wf.kinetic;
    for (const duration of [0.3, 0.8, 2]) {
      for (const bounce of [0, 0.25, 0.5, 0.9]) {
        const o = { duration, bounce };
        expect(Math.abs(settle(o) - duration), JSON.stringify(o)).toBeLessThan(1e-3);
        expect(Math.abs(lastOff(spring, o, 1e-4, duration + 1) - duration), JSON.stringify(o)).toBeLessThan(1e-3);
      }
    }
    expect(spring(0.5, { duration: 0.8 })).toBe(spring(0.5, { duration: 0.8, bounce: 0 }));
    const crit = Array.from({ length: 400 }, (_, i) => spring(i / 100, { duration: 0.8 }));
    expect(Math.max(...crit)).toBeLessThanOrEqual(1);
    expect(monotonic(crit)).toBe(true);
    expect(Math.abs(1 - spring(0.79, { duration: 0.8 }))).toBeGreaterThan(0.02);
    expect(Math.abs(1 - spring(0.81, { duration: 0.8 }))).toBeLessThan(0.02);
    // More bounce overshoots more.
    const peak = (bounce) => Math.max(...Array.from({ length: 400 }, (_, i) => spring(i / 100, { duration: 0.8, bounce })));
    expect(peak(0.2)).toBeGreaterThan(1.005);
    expect(peak(0.6)).toBeGreaterThan(peak(0.2));
    // from, to and overshootClamping work as before.
    expect(spring(0, { duration: 1, from: 10, to: 20 })).toBe(10);
    expect(spring(Infinity, { duration: 1, from: 10, to: 20 })).toBe(20);
    expect(spring(0.4, { duration: 1, bounce: 0.3, from: 10, to: 20 })).toBeCloseTo(10 + 10 * spring(0.4, { duration: 1, bounce: 0.3 }), 12);
    expect(Math.max(...Array.from({ length: 300 }, (_, i) => spring(i / 100, { duration: 0.8, bounce: 0.6, overshootClamping: true })))).toBe(1);
    // A spring ease takes the same two options.
    const { ease, interpolate } = wf.kinetic;
    expect(ease({ spring: { duration: 0.5, bounce: 0.2 } })(0.3)).toBe(spring(0.3, { duration: 0.5, bounce: 0.2 }));
    expect(interpolate(1.3, [1, 2], [0, 100], { ease: { spring: { duration: 0.5 } } })).toBeCloseTo(100 * spring(0.3, { duration: 0.5 }), 9);
  });

  it('settle(): the seconds a spring of either form takes to stay within 2% of the distance; KN-100 and KN-121 for a bad spring', async () => {
    const { wf } = await load();
    const { spring, settle, ease } = wf.kinetic;
    for (const o of [{}, { damping: 20 }, { damping: 40 }, { stiffness: 400, damping: 4, mass: 2 }, { stiffness: 170, damping: 26 }, { damping: 6, overshootClamping: true }]) {
      expect(Math.abs(settle(o) - lastOff(spring, o)), JSON.stringify(o)).toBeLessThan(2e-4);
    }
    expect(settle()).toBe(settle({}));
    expect(settle({ from: 10, to: 20 })).toBe(settle());       // the distance scales, the time does not
    expect(settle({ from: 5, to: 5 })).toBe(settle());
    // Clamped, an overshoot is held at `to`: at damping 6 the last swing past 2% is one, and it no longer counts.
    expect(settle({ damping: 6, overshootClamping: true })).toBeLessThan(settle({ damping: 6 }) - 0.05);
    expect(settle({ overshootClamping: true })).toBe(settle());   // the last swing past 2% falls short of `to`
    expect(settle({ damping: 0 })).toBe(Infinity);
    expect(settle({ duration: 0.6, bounce: 0.4, overshootClamping: true })).toBeCloseTo(0.6, 3);
    const bad = [{ stiffness: -1 }, { duration: 0 }, { duration: -1 }, { duration: NaN }, { duration: Infinity }, { duration: '1' },
      { duration: 1, bounce: 1 }, { duration: 1, bounce: -0.1 }, { duration: 1, bounce: NaN }, { bounce: 0.5 },
      { duration: 1, stiffness: 100 }, { duration: 1, damping: 10 }, { duration: 1, mass: 1 }];
    for (const o of bad) {
      expect(() => settle(o), JSON.stringify(o)).toThrow(/KN-100/);
      expect(() => spring(0.5, o), JSON.stringify(o)).toThrow(/KN-100/);
      expect(() => ease({ spring: o }), JSON.stringify(o)).toThrow(/KN-121/);
    }
    expectKN(() => spring(1, { duration: 1, stiffness: 100 }), 'KN-100', 'spring(t, opts)', /duration and bounce.*stiffness, damping and mass/);
    expectKN(() => settle({ duration: 1, bounce: 1 }), 'KN-100', 'settle({ bounce })', /bounce.*not .*bounce: 1/);
  });

  it('KN-123 says when a spring cut short is within 2% of rest, from settle(): a duration spring at its duration, a slow one past 10 s', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, {
        keyframes: {
          timed: { translateY: { at: [0, 0.3, 2], to: [40, 0, 0], ease: { spring: { duration: 0.6 } } } },
          slow: { translateY: { at: [0, 0.3, 30], to: [40, 0, 0], ease: { spring: { stiffness: 1, damping: 0.5 } } } },
        },
      });
    });
    const kn = lines.filter((l) => l.includes('KN-123'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(2);
    const tip = (l) => lines[lines.indexOf(l) + 1];
    expect(tip(kn[0])).toMatch(/this spring is within 2% of rest 0\.6 s after its key\./);
    const s = Math.ceil(wf.kinetic.settle({ stiffness: 1, damping: 0.5 }) * 100) / 100;
    expect(s).toBeGreaterThan(10);
    expect(tip(kn[1])).toContain('this spring is within 2% of rest ' + s + ' s after its key.');
  });

  it('noise2 and noise3: 0 on the lattice, within -1..1, continuous, the same for the same seed and a different field for another', async () => {
    const { wf } = await load();
    const { noise2, noise3, random } = wf.kinetic;
    for (const [x, y, z] of [[0, 0, 0], [3, -2, 5], [-7, 11, -1]]) {
      expect(noise2(x, y, 1)).toBe(0);      // toBe: +0, never -0
      expect(noise3(x, y, z, 1)).toBe(0);
      expect(noise3(x, y, z, 'a')).toBe(0);
    }
    let max2 = 0, max3 = 0, big2 = 0, big3 = 0;
    for (let i = 0; i < 160; i++) {
      for (let j = 0; j < 160; j++) {
        const v = noise2(i * 0.0371 - 3, j * 0.0413 - 2, 4);
        max2 = Math.max(max2, Math.abs(v));
        if (Math.abs(v) > 0.2) big2++;
      }
    }
    for (let i = 0; i < 36; i++) {
      for (let j = 0; j < 36; j++) {
        for (let k = 0; k < 36; k++) {
          const v = noise3(i * 0.137 - 2, j * 0.119 + 1, k * 0.151 - 4, 4);
          max3 = Math.max(max3, Math.abs(v));
          if (Math.abs(v) > 0.15) big3++;
        }
      }
    }
    expect(max2).toBeLessThanOrEqual(1);
    expect(max3).toBeLessThanOrEqual(1);
    expect(max2).toBeGreaterThan(0.4);
    expect(max3).toBeGreaterThan(0.3);
    expect(big2).toBeGreaterThan(160 * 160 * 0.1);
    expect(big3).toBeGreaterThan(36 * 36 * 36 * 0.1);
    // Continuous: a step of 1e-6 along any axis moves the value by 1e-4 at most.
    const r = random(11);
    let jump = 0;
    for (let n = 0; n < 2000; n++) {
      const x = r() * 20 - 10, y = r() * 20 - 10, z = r() * 20 - 10, h = 1e-6;
      const v2 = noise2(x, y, 3), v3 = noise3(x, y, z, 3);
      jump = Math.max(jump, Math.abs(noise2(x + h, y, 3) - v2), Math.abs(noise2(x, y + h, 3) - v2),
        Math.abs(noise3(x + h, y, z, 3) - v3), Math.abs(noise3(x, y + h, z, 3) - v3), Math.abs(noise3(x, y, z + h, 3) - v3));
    }
    expect(jump).toBeLessThanOrEqual(1e-4);
    // The same on every machine (integer hashing, then +, - and * only), a different field for another seed.
    expect(noise2(0.37, 0.61, 1)).toBe(-0.4280006028700776);
    expect(noise3(0.37, 0.61, 0.2, 'x')).toBe(-0.021548633940510053);
    let differ2 = 0, differ3 = 0;
    for (let n = 0; n < 200; n++) {
      const x = r() * 10, y = r() * 10, z = r() * 10;
      if (Math.abs(noise2(x, y, 1) - noise2(x, y, 2)) > 1e-3) differ2++;
      if (Math.abs(noise3(x, y, z, 1) - noise3(x, y, z, 2)) > 1e-3) differ3++;
    }
    expect(differ2).toBeGreaterThan(180);
    expect(differ3).toBeGreaterThan(180);
    // The axes are not interchangeable.
    expect(noise2(0.5, 0.25, 1)).not.toBe(noise2(0.25, 0.5, 1));
    expect(noise3(0.5, 0.25, 0.75, 1)).not.toBe(noise3(0.75, 0.25, 0.5, 1));
    // A coordinate that is not finite gives 0, as noise() does; a seed that is neither a number nor a string is KN-100.
    for (const v of [NaN, Infinity, -Infinity, '1']) {
      expect(noise2(v, 0.5, 1)).toBe(0);
      expect(noise2(0.5, v, 1)).toBe(0);
      expect(noise3(0.5, 0.5, v, 1)).toBe(0);
    }
    expectKN(() => noise2(0.5, 0.5), 'KN-100', 'noise2(…, seed)', /^seed is a number or a string, not undefined/);
    expectKN(() => noise3(0.5, 0.5, 0.5, null), 'KN-100', 'noise3(…, seed)', /^seed/);
  });

  it('posterize: time stepped to fps frames a second, a product a hair under a whole number on that frame', async () => {
    const { wf } = await load();
    const { posterize, styleAt } = wf.kinetic;
    expect(posterize(0, 12)).toBe(0);
    expect(posterize(0.0833, 12)).toBe(0);
    expect(posterize(0.1, 12)).toBe(1 / 12);
    expect(posterize(1 / 12, 12)).toBe(1 / 12);
    expect(posterize(0.29, 100)).toBe(0.29);   // 0.29 * 100 is 28.999999999999996
    expect(posterize(-0.01, 12)).toBe(-1 / 12);
    // On twos at 24 fps: each style held for two frames.
    expect([0, 1, 2, 3, 4, 5].map((f) => posterize(f / 24, 12))).toEqual([0, 0, 1 / 12, 1 / 12, 2 / 12, 2 / 12]);
    const RISE = { opacity: { at: [0, 1], to: [0, 1] } };
    expect(styleAt(posterize(0.3, 4), RISE)).toEqual({ opacity: 0.25 });
    for (const args of [[1, 0], [1, -12], [1, NaN], [1, Infinity], [1, '12'], [1], ['1', 12]]) {
      expect(() => posterize(...args), JSON.stringify(args)).toThrow(/KN-100/);
    }
    expectKN(() => posterize(1, 0), 'KN-100', 'posterize(t, fps)', /^fps is a finite number above 0, not 0/);
  });

  it('loop and hold: a clip time cycling through [from, to), and a time that stops for a length and carries on', async () => {
    const { wf } = await load();
    const { loop, hold } = wf.kinetic;
    expect(loop(0.5, 1, 3)).toBe(0.5);   // before from: t
    expect(loop(1, 1, 3)).toBe(1);
    expect(loop(2.5, 1, 3)).toBe(2.5);
    expect(loop(3, 1, 3)).toBe(1);
    expect(loop(4.5, 1, 3)).toBe(2.5);
    expect(loop(7.25, 1, 3)).toBe(1.25);
    expect(loop(0.3, 0, 0.1)).toBe(0);  // 0.3 / 0.1 is 2.9999999999999996: the cycle has come round
    expect(loop(0.35, 0, 0.1)).toBeCloseTo(0.05, 12);
    for (let f = 0; f < 90; f++) {
      const v = loop(f / 30, 0, 1 / 3);
      expect(v, 'frame ' + f).toBeGreaterThanOrEqual(0);
      expect(v, 'frame ' + f).toBeLessThan(1 / 3);
      expect(v, 'frame ' + f).toBeCloseTo((f % 10) / 30, 12);
    }
    for (const args of [[1, 2, 2], [1, 3, 2], [1, NaN, 2], [1, 0, Infinity], [1, '0', 1], ['1', 0, 1], [1, 0]]) {
      expect(() => loop(...args), JSON.stringify(args)).toThrow(/KN-100/);
    }
    expectKN(() => loop(1, 3, 2), 'KN-100', 'loop(t, from, to)', /to after from, not 3, 2/);
    expect(hold(0.5, 1, 2)).toBe(0.5);
    expect(hold(1, 1, 2)).toBe(1);
    expect(hold(2.9, 1, 2)).toBe(1);
    expect(hold(3, 1, 2)).toBe(1);
    expect(hold(4, 1, 2)).toBe(2);
    expect(hold(4, 1, 0)).toBe(4);
    for (const args of [[1, 1, -1], [1, NaN, 1], [1, 1, Infinity], [1, Infinity, 1], ['1', 1, 1], [1, 1]]) {
      expect(() => hold(...args), JSON.stringify(args)).toThrow(/KN-100/);
    }
    expectKN(() => hold(1, 1, -1), 'KN-100', 'hold(t, at, length)', /length .*0 or more, not 1, -1/);
  });

  it('posterize, loop and hold: a t that is NaN is KN-100, not a NaN time', async () => {
    const { wf } = await load();
    const { posterize, loop, hold } = wf.kinetic;
    expectKN(() => posterize(NaN, 12), 'KN-100', 'posterize(t)', 't is the time in seconds, a number, not NaN');
    expectKN(() => loop(NaN, 0, 1), 'KN-100', 'loop(t)', 't is the time in seconds, a number, not NaN');
    expectKN(() => hold(NaN, 1, 1), 'KN-100', 'hold(t)', 't is the time in seconds, a number, not NaN');
  });

  it('the time check: every function that takes the time first throws KN-100 for a t that is no number or NaN, names the call, and points a Remotion-shaped object at Kinetic\'s call', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const TR = { opacity: { at: [0, 1], to: [0, 1] } };
    const calls = {
      spring: (t) => k.spring(t), ramp: (t) => k.ramp(t, 0, 1), posterize: (t) => k.posterize(t, 12), loop: (t) => k.loop(t, 0, 1), hold: (t) => k.hold(t, 0, 1),
      styleAt: (t) => k.styleAt(t, TR), smear: (t) => k.smear(t, TR), camera: (t) => k.camera(t, { z: 0 }), shake: (t) => k.shake(t, 'rumble'), wiggle: (t) => k.wiggle(t),
      typewriter: (t) => k.typewriter(t, 'abc'), scramble: (t) => k.scramble(t, 'abc'), rank: (t) => k.rank(t, [1], (r) => r), captions: (t) => k.captions(t, []), moment: (t) => k.moment(t, []),
      beat: (t) => k.beat(t, []), level: (t) => k.level(t), spectrum: (t) => k.spectrum(t),
    };
    const USAGE = {
      spring: 'spring(t, options)', ramp: 'ramp(t, from, to, ease)', posterize: 'posterize(t, fps)', loop: 'loop(t, from, to)', hold: 'hold(t, at, length)', styleAt: 'styleAt(t, tracks)',
      smear: 'smear(t, style, options)', camera: 'camera(t, tracks, options)', shake: 'shake(t, profile, options)', wiggle: 'wiggle(t, options)', typewriter: 'typewriter(t, text, cps)',
      scramble: 'scramble(t, text, options)', rank: 'rank(t, rows, by, options)', captions: 'captions(t, words, options)', moment: 'moment(t, rows)', beat: 'beat(t, beats, options)',
      level: 'level(t, band, options)', spectrum: 'spectrum(t, bins)',
    };
    const FINITE = ['smear', 'shake', 'wiggle', 'rank'];
    for (const [name, call] of Object.entries(calls)) {
      const a = FINITE.includes(name) ? 'a finite number' : 'a number';
      for (const [t, shown] of [[undefined, 'undefined'], ['1', '"1"'], [NaN, 'NaN'], [null, 'null']]) {
        expectKN(() => call(t), 'KN-100', name + '(t)', new RegExp('^t is the time in seconds, ' + a + ', not ' + shown + '$'));
      }
      expectKN(() => call({ frame: 3, fps: 30 }), 'KN-100', name + '(t)',
        't is the time in seconds, ' + a + ', not {"frame":3,"fps":30}; an object there is Remotion\'s shape, and Kinetic\'s is ' + USAGE[name]);
      // A negative t is a time like any other.
      expect(() => call(-1), name).not.toThrow();
      if (FINITE.includes(name)) expectKN(() => call(Infinity), 'KN-100', name + '(t)', /a finite number, not Infinity$/);
      else expect(() => call(Infinity), name).not.toThrow();
    }
    // What the ones that take Infinity give there.
    expect(k.spring(Infinity)).toBe(1);
    expect(k.loop(Infinity, 0, 1)).toBe(1);
    expect(k.typewriter(Infinity, 'abc')).toBe('abc');
    expect(k.ramp(Infinity, 0, 1)).toBe(1);
    // interpolate() keeps its own rule: a t that is not a number gives the first value.
    expect(k.interpolate(NaN, [0, 1], [5, 6])).toBe(5);
  });

  it('scramble() refuses an option it does not have, and options that are no object', async () => {
    const { wf } = await load();
    const { scramble } = wf.kinetic;
    expectKN(() => scramble(0, 'abc', { speed: 2 }), 'KN-100', 'scramble(t, text, { speed })', "'speed' is not an option; the options are duration, chars, fps, seed");
    expectKN(() => scramble(0, 'abc', 5), 'KN-100', 'scramble(t, text, options)', 'options is an object, not 5');
    expect(scramble(5, 'abc', { duration: 1, fps: 20, seed: 3, chars: 'XY' })).toBe('abc');
  });

  it("mix and tracks in oklch: blue to yellow keeps its chroma where rgb's falls to grey, the endpoints are exact, a mix out of gamut loses chroma, not hue", async () => {
    const { wf } = await load();
    const { mix, interpolate, styleAt } = wf.kinetic;
    const OK = { space: 'oklch' };
    const rgbMid = mix('#0000ff', '#ffff00', 0.5);
    expect(rgbMid).toBe('rgb(128, 128, 128)');
    expect(oklch(rgbMid).C).toBeLessThan(1e-3);
    const mid = mix('#0000ff', '#ffff00', 0.5, OK);
    const blue = oklch('rgb(0, 0, 255)'), yellow = oklch('rgb(255, 255, 0)');
    expect(oklch(mid).C).toBeGreaterThan(0.08);
    expect(Math.abs(oklch(mid).L - (blue.L + yellow.L) / 2)).toBeLessThan(0.005);
    // The endpoints are exact, alpha mixes linearly.
    const pairs = [['#0000ff', '#ffff00'], ['#102040', 'rgb(200, 69, 45)'], ['#ff0000', '#00ff00'], ['rgba(0, 128, 255, 0.2)', '#fa0'], ['#000', '#fff'], ['#808080', '#c8452d']];
    for (const [a, b] of pairs) {
      expect(mix(a, b, 0, OK), a + ' ' + b).toBe(mix(a, b, 0));
      expect(mix(a, b, 1, OK), a + ' ' + b).toBe(mix(a, b, 1));
    }
    expect(mix('rgba(255, 0, 0, 0)', 'rgba(0, 0, 255, 1)', 0.25, OK)).toMatch(/^rgba\(\d+, \d+, \d+, 0\.25\)$/);
    // The hue goes the shorter way round: red to blue passes magenta, not green.
    const red = oklch('rgb(255, 0, 0)');
    const rb = oklch(mix('#ff0000', '#0000ff', 0.5, OK));
    expect(hueGap(rb.h, 326.6)).toBeLessThan(2);
    expect(hueGap(rb.h, (red.h + blue.h) / 2)).toBeGreaterThan(150);
    // A grey has no hue: it takes the other colour's.
    expect(hueGap(oklch(mix('#808080', '#ff0000', 0.5, OK)).h, red.h)).toBeLessThan(1);
    expect(hueGap(oklch(mix('#ffffff', '#0000ff', 0.3, OK)).h, blue.h)).toBeLessThan(1);
    expect(oklch(mix('#000', '#fff', 0.5, OK)).C).toBeLessThan(1e-3);
    // Out of gamut: blue to green at 0.5 asks for chroma 0.30 at a cyan no screen shows; the lightness and hue stay, the chroma drops.
    const green = oklch('rgb(0, 255, 0)');
    const bg = oklch(mix('#0000ff', '#00ff00', 0.5, OK));
    const wantH = blue.h - hueGap(blue.h, green.h) / 2;
    expect(Math.abs(bg.L - (blue.L + green.L) / 2)).toBeLessThan(0.005);
    expect(hueGap(bg.h, wantH)).toBeLessThan(1.5);
    expect(bg.C).toBeLessThan((blue.C + green.C) / 2 - 0.1);
    expect(bg.C).toBeGreaterThan(0.08);
    // 'rgb' is the default, and the same as now.
    expect(mix('#0000ff', '#ffff00', 0.5, { space: 'rgb' })).toBe(rgbMid);
    expect(mix(0, 10, 0.5, OK)).toBe(5);
    // interpolate, a colour track and a text track with a colour in it take space.
    expect(interpolate(0.5, [0, 1], ['#0000ff', '#ffff00'], OK)).toBe(mid);
    expect(interpolate(1.5, [1, 2], ['#0000ff', '#ffff00'], OK)).toBe(mid);
    expect(styleAt(0.5, { color: { at: [0, 1], to: ['#0000ff', '#ffff00'], space: 'oklch' } })).toEqual({ color: mid });
    expect(interpolate(0.5, [0, 1], ['drop-shadow(0px 0px 4px #0000ff)', 'drop-shadow(0px 0px 8px #ffff00)'], OK)).toBe('drop-shadow(0px 0px 6px ' + mid + ')');
    expect(mix('drop-shadow(0px 0px 4px #0000ff)', 'drop-shadow(0px 0px 8px #ffff00)', 0.5, OK)).toBe('drop-shadow(0px 0px 6px ' + mid + ')');
    // KN-100 from mix(), KN-120 from interpolate() and a track.
    expectKN(() => mix('#000', '#fff', 0.5, { space: 'hsl' }), 'KN-100', 'mix(a, b, p, { space })', /^space is 'rgb' or 'oklch', not "hsl"/);
    expectKN(() => interpolate(0.5, [0, 1], ['#000', '#fff'], { space: 'lab' }), 'KN-120', 'interpolate.space', /^space is 'rgb' or 'oklch', not "lab"/);
    expectKN(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { c: { color: { at: [0, 1], to: ['#000', '#fff'], space: 'OKLCH' } } } }), 'KN-120', /scene\('scene-\d+'\)\.keyframes\.c\.color\.space/, /^space/);
  });

  it("interpolate and tracks: 'wrap' repeats the keyframes and 'mirror' plays them back and forth, on either side, for numbers, colours and text", async () => {
    const { wf } = await load();
    const { interpolate, styleAt, spring } = wf.kinetic;
    const at = [1, 3], to = [0, 20];
    const W = { extrapolate: 'wrap' }, M = { extrapolate: 'mirror' };
    expect([3, 3.5, 4, 5, 6.5].map((t) => interpolate(t, at, to, W))).toEqual([20, 5, 10, 0, 15]);
    expect([0.5, -1, -0.5].map((t) => interpolate(t, at, to, W))).toEqual([15, 0, 5]);
    expect([3.5, 4, 5, 6, 7].map((t) => interpolate(t, at, to, M))).toEqual([15, 10, 0, 10, 20]);
    expect([0, -1, -3].map((t) => interpolate(t, at, to, M))).toEqual([10, 20, 0]);
    // One side at a time.
    expect(interpolate(4, at, to, { extrapolateLeft: 'wrap' })).toBe(20);
    expect(interpolate(0.5, at, to, { extrapolateLeft: 'wrap' })).toBe(15);
    expect(interpolate(4, at, to, { extrapolateRight: 'mirror' })).toBe(10);
    expect(interpolate(0, at, to, { extrapolateLeft: 'extend', extrapolateRight: 'mirror' })).toBe(-10);
    // Every segment with its own ease.
    const three = { ease: ['power1.in', 'linear'] };
    expect(interpolate(2.5, [0, 1, 2], [0, 10, 0], Object.assign({ extrapolate: 'wrap' }, three))).toBe(2.5);
    expect(interpolate(2.5, [0, 1, 2], [0, 10, 0], Object.assign({ extrapolate: 'mirror' }, three))).toBe(5);
    // A time a hair under a whole number of cycles is that cycle's start.
    expect(interpolate(0.3, [0, 0.1], [0, 10], W)).toBe(0);
    // An infinite time on a wrap or mirror side gives that side's end value.
    expect(interpolate(Infinity, at, to, W)).toBe(20);
    expect(interpolate(-Infinity, at, to, M)).toBe(0);
    // A spring on the last segment repeats with the keyframes instead of running on.
    expect(interpolate(1.5, [0, 1], [0, 10], { ease: 'spring', extrapolate: 'wrap' })).toBeCloseTo(10 * spring(0.5), 12);
    // Colours and text.
    expect(interpolate(1.5, [0, 1], ['#000', '#fff'], W)).toBe('rgb(128, 128, 128)');
    expect(interpolate(1.25, [0, 1], ['#000', '#fff'], M)).toBe('rgb(191, 191, 191)');
    const WIPE = ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'];
    expect(interpolate(1.25, [0, 1], WIPE, W)).toBe('inset(0% 75% 0% 0%)');
    expect(interpolate(1.25, [0, 1], WIPE, M)).toBe('inset(0% 25% 0% 0%)');
    expect(interpolate(-0.25, [0, 1], WIPE, { extrapolateLeft: 'mirror' })).toBe('inset(0% 75% 0% 0%)');
    // In styleAt() and a scene's keyframes.
    expect(styleAt(2.5, { opacity: { at: [0, 1], to: [0, 1], extrapolate: 'mirror' } })).toEqual({ opacity: 0.5 });
    expect(styleAt(2.25, { clipPath: { at: [0, 1], to: WIPE, extrapolateRight: 'wrap' } })).toEqual({ clipPath: 'inset(0% 75% 0% 0%)' });
    expect(() => wf.kinetic.scene(uniqueName('scene'), { keyframes: { a: { at: [0, 1], to: ['#000', '#fff'], extrapolate: 'mirror' }, b: { at: [0, 1], to: WIPE, extrapolateLeft: 'wrap' } } })).not.toThrow();
    // Another value is still KN-120, and the message gives all five.
    expectKN(() => interpolate(0.5, [0, 1], [0, 1], { extrapolate: 'repeat' }), 'KN-120', 'interpolate.extrapolate', /^extrapolate is 'clamp', 'extend', 'identity', 'wrap' or 'mirror', not "repeat"/);
  });

  // ---- the review of the small helpers ----

  const DURATIONS = [0.3, 0.5, 0.8, 1, 1.2, 1.5, 2, 3, 4.5];
  const BOUNCES = [0, 0.1, 0.3, 0.5, 0.7, 0.9];

  it('spring by duration: within 2% of rest at exactly its duration, for every duration and bounce', async () => {
    const { wf } = await load();
    const { spring } = wf.kinetic;
    const over = [];
    for (const d of DURATIONS) {
      for (const b of BOUNCES) {
        const off = Math.abs(1 - spring(d, { duration: d, bounce: b }));
        if (off > 0.02) over.push([d, b, off]);
      }
    }
    expect(over).toEqual([]);
  });

  it('KN-123: a segment exactly as long as its duration spring does not warn', async () => {
    const { wf } = await load();
    const keyframes = {};
    DURATIONS.forEach((d, i) => BOUNCES.forEach((b, j) => {
      keyframes['k' + i + '_' + j] = { translateY: { at: [0, d, d + 1], to: [0, 100, 100], ease: { spring: { duration: d, bounce: b } } } };
    }));
    const lines = await captureWarnings(async () => { wf.kinetic.scene(uniqueName('scene'), { keyframes }); });
    expect(lines.filter((l) => l.includes('KN-123'))).toEqual([]);
  });

  it("KN-123 on a track that wraps lints the last segment, whose spring is cut at the last key; one that mirrors is continuous there and does not warn", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(name, {
        keyframes: {
          wrapped: { translateY: { at: [0, 0.3], to: [40, 0], ease: 'spring', extrapolate: 'wrap' } },
          mirrored: { translateY: { at: [0, 0.3], to: [40, 0], ease: 'spring', extrapolate: 'mirror' } },
          long: { translateY: { at: [0, 2], to: [40, 0], ease: 'spring', extrapolateRight: 'wrap' } },
        },
      });
    });
    const kn = lines.filter((l) => l.includes('KN-123'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, kn.join(' || ')).toBe(1);
    expect(kn[0]).toContain('keyframes.wrapped.translateY');
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/Suggestion: Lengthen the segment, since the track wraps at its last key: this spring is within 2% of rest 0\.81 s after its key\./);
  });

  it('KN-123 with an ease that reads seconds and is not a spring warns with no settle time, and does not throw', async () => {
    const { wf } = await load();
    const own = (p, s) => (s === undefined ? p : Math.min(1, s * 2));
    own.seconds = true;
    let lines;
    const define = async () => {
      lines = await captureWarnings(async () => { wf.kinetic.scene(uniqueName('scene'), { keyframes: { a: { translateY: { at: [0, 0.2, 1], to: [40, 0, 0], ease: own } } } }); });
    };
    await expect(define()).resolves.toBeUndefined();
    const kn = lines.filter((l) => l.includes('KN-123'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length).toBe(1);
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/or lengthen the segment\.$/);
  });

  it('noise2 and noise3 are fields of their own: noise2 on y = 0 is not noise(), and noise3 on z = 0 is not noise2()', async () => {
    const { wf } = await load();
    const { noise, noise2, noise3, random } = wf.kinetic;
    const r = random(21);
    let sameAsNoise = 0, sameAsNoise2 = 0;
    for (let n = 0; n < 200; n++) {
      const x = r() * 20 - 10, y = r() * 20 - 10;
      if (Math.abs(noise2(x, 0, 5) - noise(x, 5) / 2) < 1e-9) sameAsNoise++;
      if (Math.abs(noise3(x, y, 0, 5) - (noise2(x, y, 5) * 2) / 3) < 1e-9) sameAsNoise2++;
    }
    expect(sameAsNoise).toBeLessThan(10);
    expect(sameAsNoise2).toBeLessThan(10);
  });

  it('loop at an infinite t gives the end of its side, as a track that wraps does', async () => {
    const { wf } = await load();
    const { loop, interpolate } = wf.kinetic;
    expect(loop(Infinity, 0, 1)).toBe(1);
    expect(loop(Infinity, 2, 5)).toBe(5);
    expect(loop(-Infinity, 0, 1)).toBe(-Infinity);
    expect(interpolate(loop(Infinity, 0, 1), [0, 1], [0, 10])).toBe(interpolate(Infinity, [0, 1], [0, 10], { extrapolate: 'wrap' }));
  });

  it('interpolate: identity past the last key returns t when the last segment is a spring, which runs on under every other mode but extend', async () => {
    const { wf } = await load();
    const { interpolate } = wf.kinetic;
    expect(interpolate(5, [0, 1], [0, 100], { ease: 'spring', extrapolateRight: 'identity' })).toBe(5);
    expect(interpolate(5, [0, 1], [0, 100], { ease: 'spring', extrapolate: 'identity' })).toBe(5);
    expect(interpolate(5, [0, 1, 2], [0, 100, 50], { ease: ['linear', { spring: { duration: 0.5 } }], extrapolateRight: 'identity' })).toBe(5);
    expect(interpolate(-3, [0, 1], [0, 100], { ease: 'spring', extrapolate: 'identity' })).toBe(-3);
  });

  it('styleAt: a key whose value is neither a track nor a number, null and undefined included, is KN-120 on both builds', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const tr = { at: [0, 1], to: [0, 1] };
    const PART = (v) => new RegExp('^a number or a track \\{ at: \\[\\.\\.\\.\\], to: \\[\\.\\.\\.\\] \\}, not ' + v + '$');
    expectKN(() => styleAt(0, { opacity: null }), 'KN-120', 'styleAt(t, tracks).opacity', PART('null'));
    expectKN(() => styleAt(0, { opacity: undefined }), 'KN-120', 'styleAt(t, tracks).opacity', PART('undefined'));
    expectKN(() => styleAt(0, { rotate: null, opacity: tr }), 'KN-120', 'styleAt(t, tracks).rotate', PART('null'));
    expectKN(() => styleAt(0, { rotate: undefined, opacity: tr }), 'KN-120', 'styleAt(t, tracks).rotate', PART('undefined'));
    // A number is a value at every time (see 'styleAt: a number is that key...').
    expect(styleAt(0, { opacity: tr, blur: 0 })).toEqual({ opacity: 0, filter: 'blur(0px)' });
    expect(styleAt(0, { opacity: 5 })).toEqual({ opacity: 5 });
  });

  it('styleAt: reads its own keys only, so a track named constructor or toString is a style property and an inherited key is not read', async () => {
    const { wf } = await load();
    const { styleAt } = wf.kinetic;
    const tr = { at: [0, 1], to: [0, 1] };
    expect(styleAt(1, { constructor: tr, opacity: tr })).toEqual({ constructor: 1, opacity: 1 });
    expect(styleAt(1, { toString: tr })).toEqual({ toString: 1 });
    expect(styleAt(1, Object.assign(Object.create({ width: tr }), { opacity: tr }))).toEqual({ opacity: 1 });
  });

  it('stagger: n above 1000000 is KN-100, not a RangeError or a billion-step loop', async () => {
    const { wf } = await load();
    const { stagger } = wf.kinetic;
    expectKN(() => stagger(0, 2 ** 32, { from: 'random' }), 'KN-100', 'stagger(…, n)', /^n is a whole number from 1 to 1000000, not 4294967296$/);
    expectKN(() => stagger(0, 1e9), 'KN-100', 'stagger(…, n)', /not 1000000000$/);
    expect(stagger(0, 1e6)).toBe(0);
  });

  it('colors: rgb() with percentage channels or an exponent is a colour; a name or hsl() in a mismatch is told which forms are colours', async () => {
    const { wf } = await load();
    const { mix, interpolate } = wf.kinetic;
    expect(mix('rgb(100%, 0%, 0%)', '#000', 0.5)).toBe('rgb(128, 0, 0)');
    expect(mix('rgb(1e2, 0, 0)', '#000', 0)).toBe('rgb(100, 0, 0)');
    expect(interpolate(0.5, [0, 1], ['rgb(0%, 50%, 100%)', 'rgb(0, 0, 0)'])).toBe('rgb(0, 64, 128)');
    expect(mix('rgba(100%, 100%, 100%, 50%)', 'rgba(0, 0, 0, 0.5)', 0)).toBe('rgba(255, 255, 255, 0.5)');
    const FORMS = /a colour is #rgb, #rrggbb, #rrggbbaa, rgb\(\) or rgba\(\), and a name or hsl\(\) is text$/;
    expectKN(() => interpolate(0.5, [0, 1], ['red', 'blue']), 'KN-120', 'interpolate.to[1]', FORMS);
    expectKN(() => interpolate(0.5, [0, 1], ['hsl(0, 100%, 50%)', '#000']), 'KN-120', 'interpolate.to[1]', FORMS);
    expectKN(() => mix('red', '#00f', 0.5), 'KN-100', 'mix(…, b)', FORMS);
  });

  it('ease: every named ease is exactly 0 at 0 and exactly 1 at 1, so a keyframe gives its own value', async () => {
    const { wf } = await load();
    const { ease, interpolate } = wf.kinetic;
    const names = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'steps(4)'];
    for (const f of ['power1', 'power2', 'power3', 'power4', 'sine', 'expo', 'circ', 'back', 'elastic', 'bounce']) names.push(f, f + '.in', f + '.out', f + '.inOut');
    for (const n of names) {
      expect(ease(n)(0), n + ' at 0').toBe(0);
      expect(ease(n)(1), n + ' at 1').toBe(1);
    }
    expect(interpolate(1, [0, 1], [0, 100], { ease: 'sine.in' })).toBe(100);
    expect(interpolate(0, [0, 1], [0, 100], { ease: 'back.out' })).toBe(0);
  });
});
