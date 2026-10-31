/**
 * The scripted writer: a step's script writes store paths in video mode, on
 * every seek, inside the seek's batch. A path's value at a time comes from
 * the scripts alone, never from the store, so a frame is the same whatever
 * was sought before and whatever the learner did; a write by anything else
 * in video mode is undone before the next paint (KN-146); and a script path
 * whose store is missing, or that names a computed, fails readiness with
 * KN-100.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, expectKN, captureWarnings, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ mode: 'auto' });
  for (const el of cleanup.splice(0)) el.remove();
});

const ids = (...names) => names.map((n) => uniqueName(n));
async function lesson(duration, inner) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${uniqueName('sc')}" data-start="0" data-duration="${duration}" data-fps="30">${inner}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return host;
}
const section = (id, start, duration) => `<section id="${id}" data-step data-start="${start}" data-duration="${duration}"></section>`;

// A store for one test, with its handle.
async function store(state, computed) {
  const { wf } = await load();
  const name = uniqueName('st');
  wf.store(name, computed ? { state, computed } : { state });
  return [name, wf.getStore(name)];
}

describe(`scripts (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a track writes its path on every seek in video mode at the step's own seconds, clamped past its keys; settings hold each value from its time", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P, st] = await store({ angle: 0, choice: null, label: '' });
    const [a, b] = ids('a', 'b');
    const track = { at: [1, 3], to: [30, 120], ease: 'power2.inOut' };
    k.step(a, { script: { [P + '.angle']: track } });
    k.step(b, { script: { [P + '.choice']: { at: [0, 2], set: [null, 270] }, [P + '.label']: { at: [0, 1], set: ['', 'go'] } } });
    await lesson(8, section(a, 0, 4) + section(b, a, 4));
    k.config({ mode: 'video' });
    for (const t of [0, 1, 2, 2.9, 3, 3.5, 4, 5.5, 6, 7.9]) {
      k.seek(t);
      expect(st.angle, 'angle at ' + t).toBe(k.interpolate(t, track.at, track.to, track));
      expect(st.choice, 'choice at ' + t).toBe(t < 6 ? null : 270);
      expect(st.label, 'label at ' + t).toBe(t < 5 ? '' : 'go');
    }
  });

  it('a setting at a frame\'s time applies on that frame, also in a step that starts partway', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P, st] = await store({ n: 0, m: 0 });
    const [a, b] = ids('a', 'b');
    k.step(a, { script: { [P + '.n']: { at: [0, 59 / 30], set: [0, 1] } } });
    k.step(b, { script: { [P + '.m']: { at: [0, 59 / 30], set: [0, 1] } } });
    await lesson(8, section(a, 0, 2.1) + section(b, a, 4));
    k.config({ mode: 'video' });
    k.seek(58 / 30);
    expect(st.n).toBe(0);
    k.seek(59 / 30);
    expect(st.n).toBe(1);
    k.seek(2.1 + 58 / 30);
    expect(st.m).toBe(0);
    k.seek((63 + 59) / 30);
    expect(st.m).toBe(1);
  });

  it("before a path's first script it holds that script's first value, whatever the store held: there is no baseline", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P, st] = await store({ angle: 999, choice: 'mine' });
    const [a, b] = ids('a', 'b');
    k.step(b, { script: { [P + '.angle']: { at: [1, 2], to: [40, 80] }, [P + '.choice']: { at: [0, 1], set: [null, 270] } } });
    await lesson(8, section(a, 0, 4) + section(b, a, 4));
    st.angle = 555;
    k.config({ mode: 'video' });
    k.seek(1);
    expect([st.angle, st.choice]).toEqual([40, null]);
    k.seek(7);
    k.seek(0);
    expect([st.angle, st.choice]).toEqual([40, null]);
  });

  it('before its first at, a settings entry takes the value of the previous step that scripts the path', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P, st] = await store({ angle: 0 });
    const [a, b] = ids('a', 'b');
    k.step(a, { script: { [P + '.angle']: { at: [0, 2], to: [10, 120] } } });
    k.step(b, { script: { [P + '.angle']: { at: [1, 2], set: [200, 300] } } });
    await lesson(8, section(a, 0, 4) + section(b, a, 4));
    k.config({ mode: 'video' });
    k.seek(6.5);
    expect(st.angle).toBe(300);
    k.seek(4.5);
    expect(st.angle).toBe(120);
    k.seek(5);
    expect(st.angle).toBe(200);
  });

  it('KN-157 (development): a settings entry that starts after 0 in the first step that scripts its path', async () => {
    const { wf } = await load();
    const [P] = await store({ choice: null, n: 0 });
    const [a, b] = ids('a', 'b');
    wf.kinetic.step(a, { script: { [P + '.choice']: { at: [2], set: [270] }, [P + '.n']: { at: [0, 1], set: [0, 1] } } });
    wf.kinetic.step(b, { script: { [P + '.n']: { at: [1], set: [2] } } });
    const lines = await captureWarnings(async () => {
      await lesson(8, section(a, 0, 4) + section(b, a, 4));
      await wf.kinetic.ready();
    });
    // Steps defined by the tests before this one name no element here, and
    // KN-157 says so too.
    const hits = lines.filter((l) => l.startsWith('[KN-157]') && l.includes(P));
    if (BUILD !== 'dev') { expect(hits).toEqual([]); return; }
    expect(hits.length, lines.join('\n')).toBe(1);
    expect(hits[0]).toContain(P + '.choice');
  });

  it('a frame is the same whatever the seek order and whatever the learner did before, and check() passes', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P, st] = await store({ angle: 30, choice: null });
    const [a, b, c] = ids('a', 'b', 'c');
    k.step(a, { script: { [P + '.angle']: { at: [2, 5.5], to: [30, 120], ease: 'power2.inOut' } } });
    k.step(b, { script: { [P + '.angle']: { at: [1.5, 2.3, 7.5], to: [120, 0, 360], ease: ['power2.inOut', 'linear'] } } });
    k.step(c, { script: { [P + '.choice']: { at: [0, 2], set: [null, 270] } } });
    const name = uniqueName('scene');
    k.scene(name, { subscribe: [P], computed: { text() { const s = this.stores[P]; return s.angle.toFixed(3) + ' ' + s.choice; } } });
    const host = await lesson(17, section(a, 0, 6) + section(b, a, 8) + section(c, b, 3) + `<div data-component="${name}" data-start="0" data-duration="17"><b data-bind="text"></b></div>`);
    const read = async (t) => { k.seek(t); await tick(0); return host.querySelector('b').textContent; };
    st.angle = 200; st.choice = 90;
    k.config({ mode: 'video' });
    const one = [];
    for (const t of [16, 14.5, 3, 9, 16.1, 0]) one.push(await read(t));
    k.config({ mode: 'interactive' });
    st.angle = 12; st.choice = 180;
    k.config({ mode: 'video' });
    const two = [];
    for (const t of [0, 16.1, 9, 3, 14.5, 16]) two.unshift(await read(t));
    expect(two).toEqual(one);
    expect(one[1]).toBe('360.000 null');
    expect(one[4]).toBe('360.000 270');
    k.config({ mode: 'interactive' });
    const r = await k.check({ samples: 60 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect([st.angle, st.choice]).toEqual([12, 180]);
  });

  it('a write by anything else in video mode is undone within a microtask, before the next paint, with KN-146 in development; in interactive mode it stays', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P, st] = await store({ angle: 0 });
    const [a] = ids('a');
    k.step(a, { script: { [P + '.angle']: { at: [0, 2], to: [0, 100] } } });
    await lesson(4, section(a, 0, 4));
    k.config({ mode: 'video' });
    k.seek(1);
    expect(st.angle).toBe(50);
    let painted = null;
    const lines = await captureWarnings(async () => {
      st.angle = 5;
      expect(st.angle).toBe(5);
      requestAnimationFrame(() => { painted = st.angle; });
      await Promise.resolve();
      expect(st.angle).toBe(50);
      await new Promise((r) => requestAnimationFrame(() => r()));
      // Each seek allows one more undo of the path, as each frame of a render does.
      k.seek(1);
      st.angle = 6;
      await Promise.resolve();
      expect(st.angle).toBe(50);
    });
    expect(painted).toBe(50);
    const hits = lines.filter((l) => l.startsWith('[KN-146]'));
    if (BUILD === 'dev') {
      expect(hits.length, lines.join('\n')).toBe(1);
      expect(hits[0]).toContain(P + '.angle');
    } else expect(hits).toEqual([]);
    k.config({ mode: 'interactive' });
    st.angle = 5;
    await tick(0);
    expect(st.angle).toBe(5);
  });

  it("a watcher that writes a scripted path inside the script's own write is undone once, with KN-146 in development, so the frame is the same in any seek order and check() passes", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const P = uniqueName('st');
    // The store's own watcher runs inside the write of `choice`, the script's own.
    wf.store(P, { state: { angle: 0, choice: null }, watch: { choice(v) { if (v !== null) this.angle = v; } } });
    const st = wf.getStore(P);
    const [a, b] = ids('a', 'b');
    k.step(a, { script: { [P + '.angle']: { at: [0, 4], to: [0, 400] } } });
    k.step(b, { script: { [P + '.choice']: { at: [0, 1], set: [null, 270] } } });
    const name = uniqueName('scene');
    k.scene(name, { subscribe: [P], computed: { text() { return String(this.stores[P].angle); } } });
    const host = await lesson(8, section(a, 0, 4) + section(b, a, 4) + `<div data-component="${name}" data-start="0" data-duration="8"><b data-bind="text"></b></div>`);
    const read = async (t) => { k.seek(t); await tick(0); return [st.angle, host.querySelector('b').textContent]; };
    k.config({ mode: 'video' });
    let one, two;
    const lines = await captureWarnings(async () => {
      one = [await read(6), await read(2), await read(7)];
      two = [await read(7), await read(2), await read(6)].reverse();
    });
    expect(one).toEqual([ [400, '400'], [200, '200'], [400, '400'] ]);
    expect(two).toEqual(one);
    const hits = lines.filter((l) => l.startsWith('[KN-146]'));
    if (BUILD === 'dev') {
      expect(hits.length, lines.join('\n')).toBe(1);
      expect(hits[0]).toContain(P + '.angle');
    } else expect(hits).toEqual([]);
    k.config({ mode: 'interactive' });
    const r = await k.check({ samples: 40 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("a watcher of an earlier path that writes a later one is undone too, with KN-146 in development", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const P = uniqueName('st');
    // `angle` comes first in the scripts' order, and its watcher writes `label`.
    wf.store(P, { state: { angle: 0, label: '' }, watch: { angle(v) { this.label = 'w' + Math.round(v); } } });
    const st = wf.getStore(P);
    const [a] = ids('a');
    k.step(a, { script: { [P + '.angle']: { at: [0, 4], to: [0, 400] }, [P + '.label']: { at: [0, 2], set: ['first', 'second'] } } });
    await lesson(4, section(a, 0, 4));
    k.config({ mode: 'video' });
    const lines = await captureWarnings(async () => {
      for (const t of [1, 3, 0.5, 2.5]) {
        k.seek(t);
        expect([st.angle, st.label], 'at ' + t).toEqual([t * 100, t < 2 ? 'first' : 'second']);
      }
    });
    const hits = lines.filter((l) => l.startsWith('[KN-146]') && l.includes(P + '.label'));
    expect(hits.length, lines.join('\n')).toBe(BUILD === 'dev' ? 1 : 0);
  });

  it('a watcher that rewrites a scripted path on the next frame is undone once per seek, and then keeps its value, with no write traded on every frame', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const P = uniqueName('st');
    // Rounds the angle a frame after each change.
    wf.store(P, { state: { angle: 0 }, watch: { angle() { requestAnimationFrame(() => { const r = Math.round(this.angle); if (r !== this.angle) this.angle = r; }); } } });
    const st = wf.getStore(P);
    const [a] = ids('a');
    k.step(a, { script: { [P + '.angle']: { at: [0, 4], to: [0, 10] } } });
    await lesson(4, section(a, 0, 4));
    k.config({ mode: 'video' });
    const seen = [];
    const off = st.subscribe('angle', (v) => seen.push(v));
    let lines;
    try {
      lines = await captureWarnings(async () => {
        k.seek(1.23);
        for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(() => r()));
      });
    } finally { off(); }
    // The script's 3.075, the watcher's 3, the undo, the watcher's 3 again, kept.
    expect(seen.length, JSON.stringify(seen)).toBeLessThanOrEqual(4);
    expect(st.angle).toBe(3);
    expect(lines.filter((l) => l.startsWith('[KN-146]')).length).toBe(BUILD === 'dev' ? 1 : 0);
    // The next seek undoes it again, once.
    k.seek(2.07);
    expect(st.angle).toBeCloseTo(5.175, 9);
  });

  it('a scripted path whose store does not exist is skipped on every seek, with no KN-146 beside readiness\'s KN-100', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [a] = ids('a');
    k.step(a, { script: { ['nostore-' + a + '.v']: { at: [0, 4], to: [0, 4] } } });
    await lesson(4, section(a, 0, 4));
    const lines = await captureWarnings(async () => {
      k.config({ mode: 'video' });
      for (const t of [0.5, 1, 2, 3]) { k.seek(t); await tick(0); }
    });
    expect(lines.filter((l) => l.startsWith('[KN-146]'))).toEqual([]);
  });

  it("before the first step that scripts a path, a track with extrapolate: 'identity' gives its first value", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P, st] = await store({ n: 0 });
    const [a, b] = ids('a', 'b');
    k.step(b, { script: { [P + '.n']: { at: [1, 2], to: [10, 20], extrapolate: 'identity' } } });
    await lesson(8, section(a, 0, 4) + section(b, a, 4));
    k.config({ mode: 'video' });
    k.seek(1);
    expect(st.n).toBe(10);
    k.seek(5.5);
    expect(st.n).toBe(15);
  });

  it("writes inside the seek's batch: a computed that reads the time and a scripted value sees both of one seek", async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [P] = await store({ angle: 0 });
    const [a] = ids('a');
    k.step(a, { script: { [P + '.angle']: { at: [0, 4], to: [0, 400] } } });
    const name = uniqueName('scene');
    const seen = [];
    k.scene(name, { subscribe: [P], computed: { pair() { seen.push([this.stores.kinetic.time, this.stores[P].angle]); return String(this.stores[P].angle); } } });
    await lesson(4, section(a, 0, 4) + `<div data-component="${name}" data-start="0" data-duration="4"><b data-bind="pair"></b></div>`);
    k.config({ mode: 'video' });
    seen.length = 0;
    for (const t of [1, 3, 0.5, 2]) { k.seek(t); await tick(0); }
    expect(seen.length).toBeGreaterThan(3);
    for (const [t, v] of seen) expect(v, 'at ' + t).toBeCloseTo(t * 100, 9);
  });

  it('KN-100 at readiness: a script path whose store does not exist, or that names a computed; ready() rejects, and check() fails with it', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [Q] = await store({ choice: null }, { answered() { return this.choice !== null; } });
    const [a, b] = ids('a', 'b');
    k.step(a, { script: { ['nostore-' + a + '.x']: { at: [0, 1], to: [0, 1] } } });
    await lesson(4, section(a, 0, 4));
    // The two failures have wheres of their own: the store, then the field.
    const missing = "step('" + a + "').script['nostore-" + a + ".x'], store nostore-" + a;
    await expectKN(k.ready(), 'KN-100', missing, /no store/);
    const r = await k.check({ samples: 2 });
    expect([r.ok, r.reason, r.code, r.where]).toEqual([false, 'readiness failed', 'KN-100', missing]);
    for (const el of cleanup.splice(0)) el.remove();
    k.step(b, { script: { [Q + '.answered']: { at: [0], set: [true] } } });
    await lesson(4, section(b, 0, 4));
    await expectKN(k.ready(), 'KN-100', "step('" + b + "').script['" + Q + ".answered'], field answered", /state field/);
    for (const el of cleanup.splice(0)) el.remove();
    // A page without those steps passes again.
    await lesson(4, '');
    await k.ready();
  });

  it('KN-100 at readiness: a script path that names an Object.prototype member is no state field', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const [Q] = await store({ choice: null });
    const [a] = ids('a');
    k.step(a, { script: { [Q + '.toString']: { at: [0], set: [1] } } });
    await lesson(4, section(a, 0, 4));
    await expectKN(k.ready(), 'KN-100', "step('" + a + "').script['" + Q + ".toString'], field toString", /state field/);
    for (const el of cleanup.splice(0)) el.remove();
    await lesson(4, '');
    await k.ready();
  });
});
