/**
 * Motion blur, the parts that need no encoder: smear()'s rows (the times,
 * the opacity, the blend, from tracks and from a function, one row at
 * samples 1 and inside a shutter render, the fps from the clock store, the
 * KN-100 and KN-120 cases), a computed that calls it running again when a
 * shutter render starts and ends, and config({ shutter }). The shutter in
 * render() is in render.test.js and footage-render.test.js, which need the
 * installed Chrome.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, expectKN, expectKNText, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const TRACKS = { translateX: { at: [0, 1], to: [0, 1200] }, opacity: { at: [0, 1], to: [1, 0.5] } };
// The time of copy k of n, as the spec writes it.
const at = (t, k, n, angle, fps) => t + (k / n) * (angle / 360) / fps;

describe(`motion blur (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('smear() from tracks: eight copies over half a frame, each the style at its time, at 1/8 of its opacity, added with plus-lighter', async () => {
    const { wf } = await load();
    const { smear, styleAt } = wf.kinetic;
    const rows = smear(0.5, TRACKS, { fps: 30 });
    expect(rows.length).toBe(8);
    rows.forEach((row, k) => {
      const want = styleAt(at(0.5, k, 8, 180, 30), TRACKS);
      expect(Object.keys(row).sort()).toEqual(['key', 'style']);
      expect(row.key).toBe(k);
      expect(row.style.transform, 'copy ' + k).toBe(want.transform);
      expect(row.style.opacity, 'copy ' + k).toBeCloseTo(want.opacity / 8, 12);
      expect(row.style.mixBlendMode).toBe('plus-lighter');
    });
    // The first copy is at t, and the last short of t + half a frame.
    expect(rows[0].style.transform).toBe(styleAt(0.5, TRACKS).transform);
    expect(parseFloat(/translate\(([-\d.]+)px/.exec(rows[7].style.transform)[1])).toBeCloseTo(617.5, 9);
  });

  it('smear() with samples, angle and fps: the copies at t + (k / N) * (angle / 360) / fps', async () => {
    const { wf } = await load();
    const { smear } = wf.kinetic;
    const seen = [];
    const rows = smear(1, (s) => { seen.push(s); return { left: s + 'px' }; }, { samples: 4, angle: 90, fps: 10 });
    expect(rows.length).toBe(4);
    expect(seen.length).toBe(4);
    seen.forEach((s, k) => expect(s, 'copy ' + k).toBeCloseTo(at(1, k, 4, 90, 10), 12));
    expect(rows.map((r) => r.style.left)).toEqual(seen.map((s) => s + 'px'));
    // 360 degrees: the copies spread over the whole frame and stop short of the next.
    const whole = [];
    smear(0, (s) => { whole.push(s); return {}; }, { samples: 32, angle: 360, fps: 24 });
    expect(whole.length).toBe(32);
    expect(whole[31]).toBeCloseTo(31 / 32 / 24, 12);
    expect(whole[31]).toBeLessThan(1 / 24);
  });

  it('smear() from a function: its style copied, 1/N of its own opacity (1 when it has none), and the object it returned left as it was', async () => {
    const { wf } = await load();
    const { smear } = wf.kinetic;
    const fixed = { color: 'red' };
    const rows = smear(0, () => fixed, { samples: 4 });
    expect(rows.map((r) => r.style)).toEqual(new Array(4).fill({ color: 'red', opacity: 0.25, mixBlendMode: 'plus-lighter' }));
    expect(fixed).toEqual({ color: 'red' });
    expect(rows[0].style).not.toBe(fixed);
    // An opacity given as a string is divided too, and one with % is a percentage.
    const faded = smear(0, () => ({ opacity: '0.6' }), { samples: 8 });
    for (const r of faded) expect(r.style.opacity).toBeCloseTo(0.075, 12);
    const pct = smear(0, () => ({ opacity: '50%' }), { samples: 4 });
    for (const r of pct) expect(r.style.opacity).toBeCloseTo(0.125, 12);
    expect(smear(0, () => ({ opacity: ' 80% ' }), { samples: 2 })[0].style.opacity).toBeCloseTo(0.4, 12);
  });

  it('smear(): an empty opacity is 1, as no opacity is; one that is not a number, such as a keyword, is KN-100', async () => {
    const { wf } = await load();
    const { smear } = wf.kinetic;
    for (const r of smear(0, () => ({ opacity: '' }), { samples: 4 })) expect(r.style.opacity).toBe(0.25);
    for (const r of smear(0, () => ({ opacity: '  ' }), { samples: 4 })) expect(r.style.opacity).toBe(0.25);
    for (const a of ['inherit', 'x%', NaN]) {
      expectKN(() => smear(0, () => ({ opacity: a }), { samples: 4 }), 'KN-100', 'smear(…, style()).opacity', /^opacity is a number, or a string of a number or a percentage, not /);
    }
  });

  it('smear(): a style function that returns no object is KN-100', async () => {
    const { wf } = await load();
    const { smear } = wf.kinetic;
    const RET = '[KN-100] smear(…, style()): the style function returns a style object, not ';
    expectKNText(() => smear(0, () => 5), RET + '5');
    expectKNText(() => smear(0, () => null), RET + 'null');
    expectKNText(() => smear(0, () => undefined), RET + 'undefined');
    expectKNText(() => smear(0, () => 'opacity: 1'), RET + '"opacity: 1"');
    expectKNText(() => smear(0, () => undefined, { samples: 1 }), RET + 'undefined');
  });

  it('smear() with samples 1 is the plain style at t: one row, no blend mode, its opacity unchanged', async () => {
    const { wf } = await load();
    const { smear, styleAt } = wf.kinetic;
    expect(smear(0.25, TRACKS, { samples: 1 })).toEqual([{ key: 0, style: styleAt(0.25, TRACKS) }]);
    expect(smear(0.25, () => ({ color: 'blue' }), { samples: 1, angle: 360, fps: 60 })).toEqual([{ key: 0, style: { color: 'blue' } }]);
  });

  it("smear()'s fps is the clock store's, so a render at another rate uses that rate", async () => {
    const { wf } = await load();
    const { smear } = wf.kinetic;
    const store = wf.getStore('kinetic');
    const before = store.fps;
    const times = () => { const out = []; smear(0, (s) => { out.push(s); return {}; }); return out; };
    try {
      store.fps = 60;
      times().forEach((s, k) => expect(s, '60 fps, copy ' + k).toBeCloseTo(at(0, k, 8, 180, 60), 12));
      store.fps = 24;
      times().forEach((s, k) => expect(s, '24 fps, copy ' + k).toBeCloseTo(at(0, k, 8, 180, 24), 12));
      // An fps given in the options wins over the store's.
      const own = [];
      smear(0, (s) => { own.push(s); return {}; }, { fps: 10 });
      expect(own[1]).toBeCloseTo(at(0, 1, 8, 180, 10), 12);
    } finally {
      store.fps = before;
    }
  });

  it("inside a shutter render (the store's shutter above 0), smear() is one row at t, and a computed that calls it runs again when that starts and ends", async () => {
    const { wf } = await load();
    const { smear, styleAt } = wf.kinetic;
    const store = wf.getStore('kinetic');
    expect(store.shutter).toBe(0);
    const name = uniqueName('scene');
    // A count bound with data-bind, so the test runs on the tiers without data-list too.
    wf.kinetic.scene(name, { computed: { n() { return String(smear(this.local, TRACKS).length); } } });
    const host = await mount(`<div data-composition-id="mb1" data-start="0" data-duration="1" data-fps="30"><div data-component="${name}"><b data-bind="n"></b></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0.5);
    await tick(0);
    const shown = () => host.querySelector('b').textContent;
    expect(shown()).toBe('8');
    try {
      store.shutter = 180;
      expect(smear(0.5, TRACKS)).toEqual([{ key: 0, style: styleAt(0.5, TRACKS) }]);
      await tick(0);
      expect(shown()).toBe('1');
    } finally {
      store.shutter = 0;
    }
    await tick(0);
    expect(shown()).toBe('8');
  });

  it('KN-100: a t that is not a finite number, a style that is neither tracks nor a function, and samples, angle or fps out of range; KN-120: a malformed track', async () => {
    const { wf } = await load();
    const { smear } = wf.kinetic;
    for (const t of [NaN, Infinity, '1', undefined, null]) {
      expectKNText(() => smear(t, TRACKS), '[KN-100] smear(t): t is the time in seconds, a finite number, not ' + (typeof t === 'string' ? '"1"' : String(t)));
    }
    const STYLE = '[KN-100] smear(…, style): style is an object of tracks, as styleAt() takes, or a function of the time that returns a style object, not ';
    expectKNText(() => smear(0), STYLE + 'undefined');
    expectKNText(() => smear(0, null), STYLE + 'null');
    expectKNText(() => smear(0, 5), STYLE + '5');
    expectKNText(() => smear(0, 'spin'), STYLE + '"spin"');
    // One track gives one value, not a style.
    expectKNText(() => smear(0, { at: [0, 1], to: [0, 1] }), STYLE + '{"at":[0,1],"to":[0,1]}');
    for (const samples of [0, 33, 1.5, -1, NaN, '8', Infinity]) {
      expectKNText(() => smear(0, TRACKS, { samples }), '[KN-100] smear(t, style, { samples }): samples is a whole number from 1 to 32, not ' + (typeof samples === 'string' ? '"8"' : String(samples)));
    }
    for (const angle of [0, -10, 361, NaN, Infinity, '180']) {
      expectKNText(() => smear(0, TRACKS, { angle }), '[KN-100] smear(t, style, { angle }): angle is a number above 0, up to 360, not ' + (typeof angle === 'string' ? '"180"' : String(angle)));
    }
    for (const fps of [0, -30, Infinity, NaN, '30']) {
      expectKNText(() => smear(0, TRACKS, { fps }), '[KN-100] smear(t, style, { fps }): fps is a finite number above 0, not ' + (typeof fps === 'string' ? '"30"' : String(fps)));
    }
    // The limits themselves are allowed.
    expect(smear(0, TRACKS, { samples: 32, angle: 360 }).length).toBe(32);
    expect(smear(0, TRACKS, { samples: 1, angle: 0.5 }).length).toBe(1);
    // A malformed track is styleAt()'s KN-120.
    expect(() => smear(0, { opacity: { at: [0], to: [1] } })).toThrow(/^\[KN-120\]/);
    expectKN(() => smear(0, { opacity: { at: [1, 0], to: [0, 1] } }), 'KN-120', 'styleAt(t, tracks).opacity.at[1]', /^at must increase/);
    expectKN(() => smear(0, {}), 'KN-120', 'styleAt(t, {})', /^no tracks/);
  });

  it('config({ shutter }): an angle or { angle, samples }, reported with its defaults; 0 or false turns it off', async () => {
    const { wf } = await load();
    const { config } = wf.kinetic;
    expect(config().shutter).toBe(false);
    try {
      expect(config({ shutter: 180 }).shutter).toEqual({ angle: 180, samples: 8 });
      expect(config().shutter).toEqual({ angle: 180, samples: 8 });
      expect(config({ shutter: { samples: 4 } }).shutter).toEqual({ angle: 180, samples: 4 });
      expect(config({ shutter: { angle: 360, samples: 64 } }).shutter).toEqual({ angle: 360, samples: 64 });
      expect(config({ shutter: { angle: 0.5, samples: 2 } }).shutter).toEqual({ angle: 0.5, samples: 2 });
      // The report is a copy: changing it changes nothing.
      config().shutter.angle = 10;
      expect(config().shutter).toEqual({ angle: 0.5, samples: 2 });
      // Another option leaves it as it was.
      expect(config({ loop: true }).shutter).toEqual({ angle: 0.5, samples: 2 });
      expect(config({ shutter: 0 }).shutter).toBe(false);
      config({ shutter: 90 });
      expect(config({ shutter: false }).shutter).toBe(false);
      config({ shutter: 90 });
      expect(config({ shutter: null }).shutter).toBe(false);
    } finally {
      config({ shutter: false });
    }
  });

  it('config({ shutter }): KN-100 for an angle of 0 or less in an object, above 360 or not finite, samples outside 2 to 64, a field that is not angle or samples, and any other type; nothing is applied', async () => {
    const { wf } = await load();
    const { config } = wf.kinetic;
    try {
      config({ shutter: 90 });
      const before = config();
      const ANGLE = '[KN-100] config({ shutter: { angle } }): angle is a number above 0, up to 360, not ';
      const SAMPLES = '[KN-100] config({ shutter: { samples } }): samples is a whole number from 2 to 64, not ';
      const TYPE = '[KN-100] config({ shutter }): shutter is an angle in degrees, { angle, samples }, or 0, false or null, not ';
      const FIELD = "' is not a field of shutter; the fields are angle and samples";
      expectKNText(() => config({ shutter: [180] }), TYPE + '[180]');
      expectKNText(() => config({ shutter: [] }), TYPE + '[]');
      expectKNText(() => config({ shutter: { angle: 90, sampels: 4 } }), "[KN-100] config({ shutter: { sampels } }): 'sampels" + FIELD);
      expectKNText(() => config({ shutter: { shutter: 180 } }), "[KN-100] config({ shutter: { shutter } }): 'shutter" + FIELD);
      expectKNText(() => config({ shutter: { angle: 0 } }), ANGLE + '0');
      expectKNText(() => config({ shutter: { angle: -90 } }), ANGLE + '-90');
      expectKNText(() => config({ shutter: -90 }), ANGLE + '-90');
      expectKNText(() => config({ shutter: 361 }), ANGLE + '361');
      expectKNText(() => config({ shutter: { angle: 720 } }), ANGLE + '720');
      expectKNText(() => config({ shutter: NaN }), ANGLE + 'NaN');
      expectKNText(() => config({ shutter: Infinity }), ANGLE + 'Infinity');
      expectKNText(() => config({ shutter: { angle: '180' } }), ANGLE + '"180"');
      expectKNText(() => config({ shutter: { samples: 1 } }), SAMPLES + '1');
      expectKNText(() => config({ shutter: { samples: 65 } }), SAMPLES + '65');
      expectKNText(() => config({ shutter: { samples: 2.5 } }), SAMPLES + '2.5');
      expectKNText(() => config({ shutter: { samples: '8' } }), SAMPLES + '"8"');
      expectKNText(() => config({ shutter: true }), TYPE + 'true');
      expectKNText(() => config({ shutter: '180' }), TYPE + '"180"');
      // A throw applies nothing, the other options in the call included.
      expect(() => config({ loop: false, shutter: { samples: 99 } })).toThrow(/KN-100/);
      expect(config()).toEqual(before);
    } finally {
      config({ shutter: false });
    }
  });
});
