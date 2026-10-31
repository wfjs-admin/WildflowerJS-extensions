/**
 * follow: a scene's computed that eases toward a store path by a spring. In
 * interactive mode it is the sum of one step response per change of the target, on
 * the page's clock, so a retarget carries the velocity on; in video mode it
 * is the same spring applied to the script, sampled on the root's data-fps,
 * so it is a function of composition time. The interactive history is frozen in
 * video mode and resumed after.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, expectKN, captureWarnings, manualFrames, BUILD, CORE_TIER } from './helpers.js';
import { settleOf, springOptions } from '../src/motion.js';
import { CODES } from '../src/diagnostics.js';

const cleanup = [];
let raf = null;
afterEach(async () => {
  const { wf } = await load();
  if (raf) { raf.restore(); raf = null; }
  wf.kinetic.pause();
  wf.kinetic.config({ mode: 'auto' });
  for (const el of cleanup.splice(0)) el.remove();
});

const ids = (...names) => names.map((n) => uniqueName(n));
async function stage(duration, inner, fps = 30) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${uniqueName('fo')}" data-start="0" data-duration="${duration}" data-fps="${fps}">${inner}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return host;
}

// A store with one number, and a scene that follows it and shows the eased
// value to full precision.
async function follower(ease, start = 0) {
  const { wf } = await load();
  const P = uniqueName('fp');
  wf.store(P, { state: { angle: start, on: false } });
  const name = uniqueName('scene');
  wf.kinetic.scene(name, {
    subscribe: [P],
    follow: { angle: ease === undefined ? P + '.angle' : { target: P + '.angle', ease } },
    computed: { text() { return String(this.angle); } },
  });
  return { P, st: wf.getStore(P), name, markup: `<div data-component="${name}" data-start="0" data-duration="10"><b class="v" data-bind="text"></b></div>` };
}

// The manual clock, installed after one real frame. The follow loop asks
// for one frame at a time, and the frame an earlier test's afterEach asked
// for, on its switch back to interactive mode, can still be pending; while it is,
// the loop asks the manual clock for none (seen in Firefox).
async function manualClock() {
  await new Promise((r) => requestAnimationFrame(() => r()));
  return manualFrames();
}

// The default spring's step response, through the public spring().
const response = (k, u) => k.spring(u, { duration: 0.4 });

describe(`follow (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('takes a spring only: another ease, overshootClamping, no damping, a target that is no store path and an unknown field are KN-100', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const n = uniqueName('bad');
    const at = "scene('" + n + "').follow";
    const def = (follow) => () => k.scene(n, { follow });
    expectKN(def(5), 'KN-100', at, /object/);
    expectKN(def({ angle: 5 }), 'KN-100', at + '.angle', /store path/);
    expectKN(def({ angle: 'angle' }), 'KN-100', at + '.angle.target', /store path/);
    expectKN(def({ angle: { target: 'q.angle', speed: 2 } }), 'KN-100', at + '.angle.speed', /'speed' is not a field/);
    expectKN(def({ angle: { target: 'q.angle', ease: 'power2.out' } }), 'KN-100', at + '.angle.ease', /spring/);
    expectKN(def({ angle: { target: 'q.angle', ease: (t) => t } }), 'KN-100', at + '.angle.ease', /spring/);
    expectKN(def({ angle: { target: 'q.angle', ease: { spring: { duration: 0.4, overshootClamping: true } } } }), 'KN-100', at + '.angle.ease.spring.overshootClamping', /clamp/);
    expectKN(def({ angle: { target: 'q.angle', ease: { spring: { stiffness: 100, damping: 0 } } } }), 'KN-100', at + '.angle.ease.spring.damping', /never/);
    expectKN(def({ angle: { target: 'q.angle', ease: { spring: { duration: -1 } } } }), 'KN-100', at + '.angle.ease.spring.duration');
    // These are springs.
    k.scene(uniqueName('ok'), { follow: { a: 'q.a', b: { target: 'q.b', ease: 'spring' }, c: { target: 'q.c', ease: { spring: { stiffness: 100, damping: 10 } } } } });
  });

  it('KN-152 for an entry named like a provided value, KN-153 for one named like a computed or keyframes entry (development)', async () => {
    const { wf } = await load();
    const lines = await captureWarnings(async () => {
      wf.kinetic.scene(uniqueName('names'), {
        follow: { local: 'q.a', twice: 'q.b', fade: 'q.c' },
        computed: { twice() { return 2; } },
        keyframes: { fade: { at: [0, 1], to: [0, 1] } },
      });
    });
    const code = (c) => lines.filter((l) => l.startsWith('[' + c + ']'));
    if (BUILD !== 'dev') { expect(code('KN-152').concat(code('KN-153'))).toEqual([]); return; }
    expect(code('KN-152').length).toBe(1);
    expect(code('KN-152')[0]).toContain("'local'");
    const shadow = code('KN-153');
    expect(shadow.length, lines.join('\n')).toBe(1);
    expect(shadow[0]).toMatch(/'twice'/);
    expect(shadow[0]).toMatch(/'fade'/);
    expect(shadow[0]).toMatch(/follow/);
  });

  it('interactive: eases toward the target by the spring, with value and velocity continuous through a retarget, and comes to rest exactly on it', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const f = await follower();
    const host = await stage(10, f.markup);
    const read = () => Number(host.querySelector('.v').textContent);
    raf = await manualClock();
    const T0 = raf.now;
    expect(read()).toBe(0);
    f.st.angle = 100;
    const want = (u) => 100 * response(k, u) - 150 * response(k, u - 0.2);
    const at = async (u) => { await raf.run(T0 + u * 1000); return read(); };
    for (const u of [0.05, 0.1, 0.15]) expect(await at(u)).toBeCloseTo(want(u), 9);
    const d = 1e-4;
    const left = [await at(0.2 - d), await at(0.2)];
    // The retarget, at 0.2 s on the page's clock.
    f.st.angle = -50;
    const right = [await at(0.2), await at(0.2 + d)];
    expect(right[0]).toBeCloseTo(left[1], 9);
    const vl = (left[1] - left[0]) / d, vr = (right[1] - right[0]) / d;
    expect(Math.abs(vr - vl)).toBeLessThan(0.02 * Math.abs(vl));
    for (const u of [0.3, 0.45, 0.6]) expect(await at(u)).toBeCloseTo(want(u), 9);
    // Folded at 1e-4 of each change, not at 2%: half a second after the last
    // change it is still moving, and it is on the target exactly once both
    // have folded, with no frame asked for after that.
    expect(await at(0.7)).not.toBe(-50);
    expect(raf.pending).toBeGreaterThan(0);
    await at(1.05);
    expect(await at(1.1)).toBe(-50);
    expect(raf.pending).toBe(0);
  });

  it('interactive: a store replaced under the target is followed in its place, eased by the spring', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const f = await follower();
    const host = await stage(10, f.markup);
    const read = () => Number(host.querySelector('.v').textContent);
    raf = await manualClock();
    expect(read()).toBe(0);
    wf.unregister(f.P);
    wf.store(f.P, { state: { angle: 0, on: false } });
    await tick(0);
    const T0 = raf.now;
    wf.getStore(f.P).angle = 100;
    const at = async (u) => { await raf.run(T0 + u * 1000); return read(); };
    expect(await at(0.1)).toBeCloseTo(100 * response(k, 0.1), 9);
    await at(1.05);
    expect(await at(1.1)).toBe(100);
  });

  it('video: a function of composition time, sampled on the root\'s data-fps, the same at a time whatever the seek order', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const f = await follower();
    const [a] = ids('a');
    const track = { at: [0, 1, 1.5], to: [0, 90, 30] };
    k.step(a, { script: { [f.P + '.angle']: track } });
    const host = await stage(4, `<section id="${a}" data-step data-start="0" data-duration="4"></section>` + f.markup);
    const read = async (t) => { k.seek(t); await tick(0); return Number(host.querySelector('.v').textContent); };
    // The sum the follower makes, from the track sampled at 30 fps over the
    // fold window before t.
    const s = springOptions({ duration: 0.4 }, CODES.BAD_CALL, 'test');
    const fold = settleOf(s, 1e-4);
    const value = (u) => k.interpolate(u, track.at, track.to);
    const want = (t) => {
      const k1 = Math.floor(t * 30 + 1e-6), k0 = Math.floor((t - fold) * 30);
      let prev = value(k0 / 30), x = prev;
      for (let i = k0 + 1; i <= k1; i++) {
        const v = value(i / 30);
        if (v !== prev) { x += (v - prev) * response(k, t - i / 30); prev = v; }
      }
      return x;
    };
    // An independent oracle: the spring's equation, m x'' + c x' + k (x - u) = 0,
    // integrated with RK4 from rest, with u the track held over each frame of
    // the root's 30 fps. The two agree to the fold's 1e-4 of the moves.
    const rk4 = (t) => {
      const acc = (x, v, u) => (s.k * (u - x) - s.c * v) / s.m;
      let x = 0, v = 0, tau = -1;
      while (tau < t - 1e-12) {
        const f = Math.floor(tau * 30 + 1e-6), u = value(f / 30), end = Math.min(t, (f + 1) / 30);
        const n = Math.max(1, Math.ceil((end - tau) / 2e-4)), h = (end - tau) / n;
        for (let j = 0; j < n; j++) {
          const a1 = acc(x, v, u), b1 = v;
          const a2 = acc(x + h / 2 * b1, v + h / 2 * a1, u), b2 = v + h / 2 * a1;
          const a3 = acc(x + h / 2 * b2, v + h / 2 * a2, u), b3 = v + h / 2 * a2;
          const a4 = acc(x + h * b3, v + h * a3, u), b4 = v + h * a3;
          x += h / 6 * (b1 + 2 * b2 + 2 * b3 + b4);
          v += h / 6 * (a1 + 2 * a2 + 2 * a3 + a4);
        }
        tau = end;
      }
      return x;
    };
    k.config({ mode: 'video' });
    const times = [1.2, 0.5, 3, 1.55, 0.05, 2.2];
    const one = [];
    for (const t of times) one.push(await read(t));
    for (let i = 0; i < times.length; i++) expect(one[i], 'at ' + times[i]).toBeCloseTo(want(times[i]), 9);
    for (let i = 0; i < times.length; i++) expect(Math.abs(one[i] - rk4(times[i])), 'the oracle at ' + times[i]).toBeLessThan(0.05);
    const two = [];
    for (const t of times.slice().reverse()) two.unshift(await read(t));
    expect(two).toEqual(one);
    // A render's own rate on the store leaves the curve as the root's data-fps gives it.
    window.__HF_EXPORT_RENDER_SEEK_CONFIG = { fps: 60 };
    try {
      k.config({});
      expect(wf.getStore('kinetic').fps).toBe(60);
      const three = [];
      for (const t of times) three.push(await read(t));
      expect(three).toEqual(one);
    } finally {
      delete window.__HF_EXPORT_RENDER_SEEK_CONFIG;
      k.config({});
    }
  });

  it("video: with no data-fps on the root, the sampler takes config({ fps })", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const f = await follower();
    const [a] = ids('a');
    const track = { at: [0, 1], to: [0, 90] };
    k.step(a, { script: { [f.P + '.angle']: track } });
    const host = await mount(`<div data-composition-id="${uniqueName('fo')}" data-start="0" data-duration="4"><section id="${a}" data-step data-start="0" data-duration="4"></section>${f.markup}</div>`);
    cleanup.push(host);
    const s = springOptions({ duration: 0.4 }, CODES.BAD_CALL, 'test');
    const fold = settleOf(s, 1e-4);
    const value = (u) => k.interpolate(u, track.at, track.to);
    const want = (t, fps) => {
      const k1 = Math.floor(t * fps + 1e-6), k0 = Math.floor((t - fold) * fps);
      let prev = value(k0 / fps), x = prev;
      for (let i = k0 + 1; i <= k1; i++) { const v = value(i / fps); if (v !== prev) { x += (v - prev) * response(k, t - i / fps); prev = v; } }
      return x;
    };
    try {
      k.config({ fps: 60, mode: 'video' });
      k.seek(0.51);
      await tick(0);
      const got = Number(host.querySelector('.v').textContent);
      expect(got).toBeCloseTo(want(0.51, 60), 9);
      expect(Math.abs(got - want(0.51, 30))).toBeGreaterThan(1e-6);
    } finally {
      k.config({ fps: 30 });
    }
  });

  it('KN-157 (development): a follow target whose store does not exist at readiness', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    const path = 'nostore-' + name + '.angle';
    wf.kinetic.scene(name, { follow: { angle: path }, computed: { text() { return String(this.angle); } } });
    const lines = await captureWarnings(async () => {
      const host = await stage(4, `<div data-component="${name}" data-start="0" data-duration="4"><b data-bind="text"></b></div>`);
      expect(host.querySelector('b').textContent).toBe('0');
      await wf.kinetic.ready();
      await wf.kinetic.ready();
    });
    const hits = lines.filter((l) => l.startsWith('[KN-157]') && l.includes(path));
    if (BUILD !== 'dev') { expect(hits).toEqual([]); return; }
    expect(hits.length, lines.join('\n')).toBe(1);
    expect(hits[0]).toContain(name);
  });

  it('go() and back() while a follower moves: it carries on from its history, also while the clock plays', async () => {
    const { wf } = await load();
    const k = wf.kinetic, ks = wf.getStore('kinetic');
    const f = await follower();
    const [a, b, c] = ids('a', 'b', 'c');
    for (const id of [a, b, c]) k.step(id, { wait: 1 });
    const host = await stage(9, `<section id="${a}" data-step data-start="0" data-duration="3"></section><section id="${b}" data-step data-start="${a}" data-duration="3"></section><section id="${c}" data-step data-start="${b}" data-duration="3"></section>` + f.markup);
    const read = () => Number(host.querySelector('.v').textContent);
    raf = await manualClock();
    const T0 = raf.now;
    k.go(a);
    f.st.angle = 100;
    const at = async (u) => { await raf.run(T0 + u * 1000); return read(); };
    expect(await at(0.1)).toBeCloseTo(100 * response(k, 0.1), 9);
    expect(ks.playing).toBe(true);
    const before = await at(0.2);
    k.go(b);
    await tick(0);
    expect([ks.step, read()]).toEqual([b, before]);
    expect(await at(0.3)).toBeCloseTo(100 * response(k, 0.3), 9);
    k.back();
    expect(await at(0.4)).toBeCloseTo(100 * response(k, 0.4), 9);
    k.go(c);
    expect(await at(0.5)).toBeCloseTo(100 * response(k, 0.5), 9);
    expect(ks.step).toBe(c);
    await raf.frames(T0 + 516, T0 + 1200);
    expect(read()).toBe(100);
  });

  it('video: a path no step scripts is passed through, and true and false read as 1 and 0', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const P = uniqueName('fb');
    wf.store(P, { state: { on: false, n: 7 } });
    const name = uniqueName('scene');
    k.scene(name, { follow: { on: P + '.on', n: P + '.n' }, computed: { text() { return this.on + ' ' + this.n; } } });
    const host = await stage(4, `<div data-component="${name}" data-start="0" data-duration="4"><b data-bind="text"></b></div>`);
    expect(host.querySelector('b').textContent).toBe('0 7');
    k.config({ mode: 'video' });
    wf.getStore(P).n = 9;
    k.seek(1);
    await tick(0);
    expect(host.querySelector('b').textContent).toBe('0 9');
  });

  it('the interactive history is frozen in video mode and resumed after: a follower settled before is still settled on the learner\'s value, and one in flight carries on by the page\'s clock', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const f = await follower();
    const [a] = ids('a');
    k.step(a, { script: { [f.P + '.angle']: { at: [0, 4], to: [0, 400] } } });
    const host = await stage(10, `<section id="${a}" data-step data-start="0" data-duration="10"></section>` + f.markup);
    const read = () => Number(host.querySelector('.v').textContent);
    raf = await manualClock();
    const T0 = raf.now;
    f.st.angle = 100;
    await raf.run(T0 + 100);
    const mid = read();
    expect(mid).toBeCloseTo(100 * response(k, 0.1), 9);
    k.config({ mode: 'video' });
    k.seek(2);
    await raf.run(T0 + 150);
    // The script's value, eased in composition time.
    expect(read()).toBeGreaterThan(150);
    k.seek(1);
    await raf.run(T0 + 300);
    k.config({ mode: 'interactive' });
    expect(f.st.angle).toBe(100);
    await raf.run(T0 + 300);
    expect(read()).toBeCloseTo(100 * response(k, 0.3), 9);
    await raf.frames(T0 + 316, T0 + 1500);
    expect(read()).toBe(100);
    // Settled, then a run in video mode, then interactive again: still 100, nothing springs back.
    k.config({ mode: 'video' });
    k.seek(3);
    await raf.frames(T0 + 1516, T0 + 2000);
    k.config({ mode: 'interactive' });
    await raf.run(T0 + 2016);
    expect(read()).toBe(100);
    expect(raf.pending).toBe(0);
  });

  it('settleOf takes a tolerance: 2% stays the default, for KN-123 and the duration solve, and 1e-4 is the fold time', () => {
    const def = springOptions({ duration: 0.4 }, CODES.BAD_CALL, 'test');
    const bouncy = springOptions({ duration: 0.6, bounce: 0.2 }, CODES.BAD_CALL, 'test');
    const k100c20 = { k: 100, c: 20, m: 1 }, k100c10 = { k: 100, c: 10, m: 1 };
    expect(settleOf(def)).toBeCloseTo(0.4, 3);
    expect(settleOf(def, 0.02)).toBe(settleOf(def));
    expect(settleOf(bouncy)).toBeCloseTo(0.6, 3);
    expect(settleOf(k100c20)).toBeCloseTo(0.583, 3);
    expect(settleOf(k100c10)).toBeCloseTo(0.808, 3);
    expect(settleOf(def, 1e-4)).toBeCloseTo(0.806, 3);
    expect(settleOf(k100c20, 1e-4)).toBeCloseTo(1.176, 3);
    expect(settleOf(k100c10, 1e-4)).toBeCloseTo(1.871, 3);
    expect(settleOf(bouncy, 1e-4)).toBeCloseTo(1.941, 3);
    // Checked against a scan of 0.1 ms: the last time the spring is off by
    // more than the tolerance.
    for (const s of [def, bouncy, k100c20, k100c10]) {
      const u = Object.assign({}, s, { from: 0, to: 1 });
      const w0 = Math.sqrt(s.k / s.m), z = s.c / (2 * Math.sqrt(s.k * s.m));
      const at = (t) => {
        if (z < 1) { const wd = w0 * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
        return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
      };
      let last = 0;
      for (let t = 0; t < 4; t += 1e-4) if (Math.abs(1 - at(t)) > 1e-4) last = t;
      expect(Math.abs(settleOf(u, 1e-4) - last)).toBeLessThan(2e-4);
    }
  });
});
