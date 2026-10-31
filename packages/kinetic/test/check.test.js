/**
 * check(): a deterministic composition passes, one that depends on the
 * order of seeks or the wall clock fails with the frame, element and
 * property named; the preview bar mounts on request, outside the root, and
 * drives the clock.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, frames, dispatchSeek, captureWarnings, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ preview: false });
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__HF_RENDER_CAPTURE_MODE;
});

describe(`check (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('passes a composition whose frames are functions of time, and restores the time', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {
      keyframes: { box: { translateX: { at: [0, 2], to: [0, 300] }, opacity: { at: [0, 1], to: [0, 1] } } },
      computed: { rows() { return this.local > 1 ? [{ k: 1 }, { k: 2 }] : [{ k: 1 }]; }, label() { return 'f' + this.clipFrame; } },
      seek(local) {
        const c = this.element.querySelector('canvas');
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 40, 10);
        ctx.fillStyle = '#c00';
        ctx.fillRect(0, 0, Math.round(local * 10), 10);
      },
    });
    const host = await mount(`<div data-composition-id="c1" data-start="0" data-duration="2" data-fps="10"><div data-component="${name}"><i data-bind-style="box"></i><b data-bind="label"></b><canvas width="40" height="10"></canvas>`
      + (wf.features && wf.features.lists === false ? '' : '<ol data-list="rows" data-key="k"><template><li data-bind="k"></li></template></ol>') + '</div></div>');
    cleanup.push(host);
    await wf.kinetic.ready();               // marks the root data-kinetic-ready="true"
    wf.kinetic.seek(0.7);
    const r = await wf.kinetic.check({ samples: 8 });
    expect(r).toEqual({ ok: true, frames: 20, samples: 8, ready: 'true', errors: 0 });
    expect(wf.getStore('kinetic').time).toBe(0.7);
    const all = await wf.kinetic.check({ samples: 100 });
    expect(all).toEqual({ ok: true, frames: 20, samples: 20, ready: 'true', errors: 0 });
  });

  it('passes a scene that runs stagger(), scramble(), posterize() and an oklch colour track, and writes their values', async () => {
    const { wf } = await load();
    const { stagger, scramble, posterize, styleAt, mix } = wf.kinetic;
    const RISE = { opacity: { at: [0, 0.4], to: [0, 1] }, translateY: { at: [0, 0.4], to: [20, 0] } };
    const rise = (local, i) => styleAt(posterize(local, 12) - stagger(i, 3, { each: 0.2, from: 'center' }), RISE);
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {
      keyframes: { tint: { color: { at: [0, 2], to: ['#0000ff', '#ffff00'], space: 'oklch' } } },
      computed: {
        a() { return rise(this.local, 0); },
        b() { return rise(this.local, 1); },
        c() { return rise(this.local, 2); },
        code() { return scramble(this.local, 'KINETIC', { duration: 1.5, seed: 7 }); },
      },
    });
    const host = await mount(`<div data-composition-id="c-helpers" data-start="0" data-duration="2" data-fps="10"><div data-component="${name}">`
      + '<i class="a" data-bind-style="a"></i><i class="b" data-bind-style="b"></i><i class="c" data-bind-style="c"></i><b data-bind="code" data-bind-style="tint"></b></div></div>');
    cleanup.push(host);
    try {
      await wf.kinetic.ready();
      const r = await wf.kinetic.check({ samples: 20 });
      expect(r).toEqual({ ok: true, frames: 20, samples: 20, ready: 'true', errors: 0 });
      // At 0.2 s the middle item has had 2/12 s of its rise and the outer two none.
      await dispatchSeek(0.2).done;
      const css = (prop, v) => { const i = document.createElement('i'); i.style[prop] = v; return i.style[prop]; };
      expect(['a', 'b', 'c'].map((k) => host.querySelector('.' + k).style.opacity)).toEqual(['0', css('opacity', String((2 / 12) / 0.4)), '0']);
      expect(host.querySelector('b').textContent).toBe(scramble(0.2, 'KINETIC', { duration: 1.5, seed: 7 }));
      await dispatchSeek(1).done;
      expect(host.querySelector('b').style.color).toBe(css('color', mix('#0000ff', '#ffff00', 0.5, { space: 'oklch' })));
      expect(host.querySelector('b').textContent.slice(0, 4)).toBe('KINE');
      // fps: the unsettled letters change that many times a second and hold between.
      const word = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      expect(scramble(0.01, word, { duration: 10, fps: 4 })).toBe(scramble(0.24, word, { duration: 10, fps: 4 }));
      expect(scramble(0.26, word, { duration: 10, fps: 4 }).slice(1)).not.toBe(scramble(0.24, word, { duration: 10, fps: 4 }).slice(1));
    } finally {
      // A removed host's instance would go on throwing in later tests' seeks if this one failed.
      wf.unregister(name);
    }
  });

  it("fails with reason 'a seek threw' when a computed throws on the seeks, with the count and the first message, and puts console.error back", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { label() { if (this.local >= 0) throw new Error('label broke at frame ' + this.clipFrame); return ''; } } });
    const host = await mount(`<div data-composition-id="c10" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><b data-bind="label"></b></div></div>`);
    cleanup.push(host);
    const quiet = () => {};
    const orig = console.error;
    console.error = quiet;
    let r;
    try {
      r = await wf.kinetic.check({ samples: 4 });
      expect(console.error).toBe(quiet);
    } finally {
      // The removed host's instance would go on throwing in later tests' seeks.
      wf.unregister(name);
      console.error = orig;
    }
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('a seek threw');
    expect(r.errors).toBeGreaterThan(0);
    expect(r.firstError).toMatch(/label broke at frame \d+/);
    expect(r.frames).toBe(10);
    expect(r.samples).toBe(4);
  });

  // Vitest's own catcher logs an error event's error with console.error when
  // the page has a listener of its own, as check() does while it runs, so
  // here each event counts twice, both times with its message. On a page it
  // counts once.
  it('counts an uncaught error and an unhandled rejection during the seeks', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let n = 0;
    let fire = null;
    wf.kinetic.scene(name, { seek() { if (++n === 2 && fire) fire(); } });
    const host = await mount(`<div data-composition-id="c11" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"></div></div>`);
    cleanup.push(host);
    const quiet = () => {};
    const orig = console.error;
    console.error = quiet;
    let a, b;
    try {
      fire = () => window.dispatchEvent(new ErrorEvent('error', { message: 'a listener failed', error: new Error('a listener failed') }));
      a = await wf.kinetic.check({ samples: 3 });
      n = 0;
      fire = () => window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: new Error('a fetch was lost') }));
      b = await wf.kinetic.check({ samples: 3 });
    } finally {
      console.error = orig;
    }
    expect(a.ok).toBe(false);
    expect(a.reason).toBe('a seek threw');
    expect(a.errors).toBeGreaterThanOrEqual(1);
    expect(a.firstError).toBe('a listener failed');
    expect(b.reason).toBe('a seek threw');
    expect(b.errors).toBeGreaterThanOrEqual(1);
    // Newer test runners (vitest 4.1) log an unhandled rejection through
    // console.error from a listener that runs before check()'s, so the first
    // error counted can be that log of the event rather than its reason.
    expect(b.firstError).toMatch(/a fetch was lost|PromiseRejectionEvent/);
  });

  // check() runs readiness first and goes by that run, which marks the
  // root: a mark set by hand is not what decides.
  it("fails with reason 'readiness failed' when its run of readiness fails, and reports the mark that run left", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { inputs: { title: { type: String, required: true } } });
    const host = await mount(`<div data-composition-id="c12" data-start="0" data-duration="1" data-fps="10" data-kinetic-ready="true"><div data-component="${name}" data-start="0"></div></div>`);
    cleanup.push(host);
    const orig = console.error;
    console.error = () => {};
    let r;
    try { r = await wf.kinetic.check({ samples: 3 }); } finally { console.error = orig; }
    expect([r.ok, r.reason, r.frames, r.samples, r.ready]).toEqual([false, 'readiness failed', 10, 3, 'failed']);
    host.querySelector('[data-component]').remove();
    const ok = await wf.kinetic.check({ samples: 3 });
    expect(ok).toEqual({ ok: true, frames: 10, samples: 3, ready: 'true', errors: 0 });
  });

  it('a playing standalone clock is playing again after check(), from the time it had', async () => {
    const { wf } = await load();
    const store = wf.getStore('kinetic');
    const host = await mount('<div data-composition-id="c13" data-start="0" data-duration="10" data-fps="10"></div>');
    cleanup.push(host);
    wf.kinetic.seek(4);
    wf.kinetic.play();
    expect(store.playing).toBe(true);
    const r = await wf.kinetic.check({ samples: 3 });
    expect(r.ok).toBe(true);
    expect(store.playing).toBe(true);
    const t = store.time;
    expect(t).toBeGreaterThanOrEqual(4);
    expect(t).toBeLessThan(4.5);
    // It plays on: its time moves within 2 s. Under load (the whole suite
    // on a busy machine) 80 ms passed with no animation frame, 2026-10-28.
    for (let i = 0; i < 100 && !(store.time > t); i++) await tick(20);
    expect(store.time).toBeGreaterThan(t);
    expect(store.playing).toBe(true);
    wf.kinetic.pause();
    // A paused clock stays paused.
    await wf.kinetic.check({ samples: 2 });
    expect(store.playing).toBe(false);
  });

  it('fails a frame that depends on the order of seeks, naming the element and property', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let calls = 0;
    wf.kinetic.scene(name, { computed: { n() { calls++; return this.local >= 0 ? String(calls) : ''; } } });
    const host = await mount(`<div data-composition-id="c2" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><p id="count-${name}" data-bind="n"></p></div></div>`);
    cleanup.push(host);
    let r;
    const lines = await captureWarnings(async () => { r = await wf.kinetic.check({ samples: 4 }); });
    expect(r.ok).toBe(false);
    expect(r.element).toBe('#count-' + name);
    expect(r.property).toBe('text');
    expect(r.first).not.toBe(r.second);
    expect(typeof r.frame).toBe('number');
    expect(r.time).toBe(r.frame / 10);
    if (BUILD === 'dev') expect(lines.some((l) => l.startsWith('[KN-160]'))).toBe(true);
  });

  it("sees an attribute that differs, such as an SVG path's d", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let calls = 0;
    // Reads local so it re-evaluates on every seek, and counts the calls.
    wf.kinetic.scene(name, { computed: { d() { calls++; return 'M0 0 L' + (this.local >= 0 ? calls : 0) + ' 10'; } } });
    const host = await mount(`<div data-composition-id="c5" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><svg viewBox="0 0 20 20"><path id="curve-${name}" data-bind-attr="{ d: d }"></path></svg></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.check({ samples: 3 });
    expect(r.ok).toBe(false);
    expect(r.property).toBe('attrs');
    expect(r.element).toBe('#curve-' + name);
    expect(r.first).toMatch(/(^|\n)d=M0 0 L\d+ 10\n/);
    expect(r.first).not.toBe(r.second);
  });

  // Three regions of time: two whose tokens differ, and a third with both,
  // which a seek from the first and a seek from the second reach with the
  // tokens added in a different order.
  const region = (local, a, b, both) => (local < 0.7 ? a : local < 1.4 ? b : both);

  it('passes class tokens, style declarations and attributes that a seek order left in another order', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: {
      cls() { return region(this.local, 'ply key', 'ply todo', 'ply todo key'); },
      sty() { return region(this.local, { opacity: '0.5' }, { color: 'red' }, { opacity: '0.5', color: 'red' }); },
      at() { return region(this.local, { 'data-x': '1', 'data-y': null }, { 'data-x': null, 'data-y': '1' }, { 'data-x': '1', 'data-y': '1' }); },
    } });
    const host = await mount(`<div data-composition-id="c10" data-start="0" data-duration="2" data-fps="10"><div data-component="${name}"><span id="cls-${name}" data-bind-class="cls"></span><span id="sty-${name}" data-bind-style="sty"></span><span id="at-${name}" data-bind-attr="at"></span></div></div>`);
    cleanup.push(host);
    // The order really differs: 0 then 1.5, against 1 then 1.5.
    const read = () => [host.querySelector('#cls-' + name).getAttribute('class'), host.querySelector('#sty-' + name).getAttribute('style'), Array.from(host.querySelector('#at-' + name).attributes, (a) => a.name).join()];
    await dispatchSeek(0).done; await dispatchSeek(1.5).done;
    const fromFirst = read();
    await dispatchSeek(1).done; await dispatchSeek(1.5).done;
    const fromSecond = read();
    expect(fromFirst.map((v, i) => v !== fromSecond[i])).toEqual([true, true, true]);
    const r = await wf.kinetic.check({ samples: 100 });
    expect(r).toEqual({ ok: true, frames: 20, samples: 20, ready: 'true', errors: 0 });
  });

  it('still sees a class or style that differs, and reports it as the element held it', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let calls = 0;
    wf.kinetic.scene(name, { computed: { cls() { calls++; return this.local >= 0 ? 'b a n' + calls : ''; } } });
    const host = await mount(`<div data-composition-id="c11" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><i id="k-${name}" data-bind-class="cls"></i></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.check({ samples: 3 });
    expect(r.ok).toBe(false);
    expect(r.property).toBe('class');
    expect(r.element).toBe('#k-' + name);
    expect(r.first).toMatch(/^b a n\d+$/);
    expect(r.first).not.toBe(r.second);
  });

  it('sees a canvas drawn from the wall clock', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let n = 0;
    wf.kinetic.scene(name, {
      seek() {
        const ctx = this.element.querySelector('canvas').getContext('2d');
        ctx.fillStyle = ['#000', '#fff'][n++ % 2];
        ctx.fillRect(0, 0, 4, 4);
      },
    });
    const host = await mount(`<div data-composition-id="c3" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><canvas width="4" height="4"></canvas></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.check({ samples: 3 });
    expect(r.ok).toBe(false);
    expect(r.property).toBe('canvas');
    expect(r.element).toMatch(/canvas/);
  });

  it('passes a component nested in a row a seek creates, though the row gets a new component id on each pass', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const child = uniqueName('zzchild');
    wf.component(child, {});
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { rows() { return this.local > 0.45 ? [{ k: 1 }, { k: 2 }] : []; } } });
    const host = await mount(`<div data-composition-id="c6" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><ol data-list="rows" data-key="k"><template><li><span data-component="${child}"></span></li></template></ol></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0);
    const r = await wf.kinetic.check({ samples: 10 });
    expect(JSON.stringify(r)).toBe(JSON.stringify({ ok: true, frames: 10, samples: 10, ready: 'true', errors: 0 }));
  });

  it('passes a list whose template sits on lines of its own, full at the start and empty later', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { rows() { return this.local > 1.75 ? [] : [{ k: 1 }]; } } });
    const host = await mount(`<div data-composition-id="c12" data-start="0" data-duration="2" data-fps="10"><div data-component="${name}"><ul data-list="rows" data-key="k">
        <template><li data-bind="k"></li></template>
      </ul></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.check({ samples: 100 });
    expect(r).toEqual({ ok: true, frames: 20, samples: 20, ready: 'true', errors: 0 });
  });

  it("names the element where it was when the frame was taken, though the restored time removed it", async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const name = uniqueName('scene');
    let calls = 0;
    wf.kinetic.scene(name, { computed: {
      rows() { return this.local > 0.45 ? [{ k: 1 }] : []; },
      n() { calls++; return this.local >= 0 ? String(calls) : ''; },
    } });
    const host = await mount(`<div data-composition-id="c8" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><ol data-list="rows" data-key="k"><template><li><b id="late-${name}" data-bind="n"></b></li></template></ol></div></div>`);
    cleanup.push(host);
    wf.kinetic.seek(0);
    const r = await wf.kinetic.check({ samples: 10 });
    expect(r.ok).toBe(false);
    expect(r.frame).toBeGreaterThanOrEqual(5);
    expect(r.element).toBe('#late-' + name);
  });

  it("sees a form control's value", async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    let n = 0;
    wf.kinetic.scene(name, { seek() { this.element.querySelector('input').value = String(++n); } });
    const host = await mount(`<div data-composition-id="c9" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"><input id="field-${name}"></div></div>`);
    cleanup.push(host);
    const r = await wf.kinetic.check({ samples: 3 });
    expect(r.ok).toBe(false);
    expect(r.property).toBe('value');
    expect(r.element).toBe('#field-' + name);
  });

  it('restores the time when a seek fails part-way', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="c7" data-start="0" data-duration="1" data-fps="10"></div>');
    cleanup.push(host);
    wf.kinetic.seek(0.95);
    let calls = 0;
    window.__player = { renderSeek(t) { if (++calls === 3) throw new Error('the player went away'); dispatchSeek(t); } };
    try {
      await expect(wf.kinetic.check({ samples: 10 })).rejects.toThrow(/the player went away/);
      expect(wf.getStore('kinetic').time).toBe(0.95);
    } finally {
      delete window.__player;
    }
  });

  it('render() without WebCodecs is KN-200 (the headless shell has none)', async ({ skip }) => {
    const { wf } = await load();
    if (typeof VideoEncoder === 'function') skip();
    let err = null;
    await wf.kinetic.render({ download: false }).catch((e) => { err = e; });
    expectKN(err, 'KN-200', 'render()', /secure context/);
  });

  it('validates its options and needs a root with a duration', async () => {
    const { wf } = await load();
    await expect(wf.kinetic.check({ samples: 0 })).rejects.toThrow(/KN-100/);
    const host = await mount('<div data-composition-id="c4" data-start="0"></div>');
    cleanup.push(host);
    await expect(wf.kinetic.check()).rejects.toThrow(/KN-100/);
  });
});

describe(`preview bar (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('mounts on config({ preview: true }) outside the root, drives the clock, and unmounts', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="p1" data-start="0" data-duration="2" data-fps="10"></div>');
    cleanup.push(host);
    wf.kinetic.config({ preview: true });
    expect(wf.kinetic.config().preview).toBe(true);
    await tick(10);
    const bar = document.querySelector('[data-kinetic-preview]');
    expect(bar).toBeTruthy();
    expect(host.contains(bar)).toBe(false);
    const store = wf.getStore('kinetic');
    wf.kinetic.seek(0.5);
    await tick(10);
    expect(bar.querySelector('span').textContent).toBe('0.50 / 2.00 s   frame 5');
    // The scrubber's thumb follows the clock.
    expect(Number(bar.querySelector('input[type=range]').value)).toBeCloseTo(0.5, 9);
    bar.querySelector('[data-action="forward"]').click();
    await tick(10);
    expect(store.time).toBeCloseTo(0.6, 9);
    bar.querySelector('[data-action="back"]').click();
    bar.querySelector('[data-action="back"]').click();
    await tick(10);
    expect(store.time).toBeCloseTo(0.4, 9);
    const range = bar.querySelector('input[type=range]');
    expect(range.getAttribute('max')).toBe('2');
    range.value = '1.3';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await tick(10);
    expect(store.time).toBeCloseTo(1.3, 9);
    // The browser rounds a range's value to its step, one frame here.
    range.value = '1.34';
    expect(range.value).toBe('1.3');
    range.value = '1.3';
    bar.querySelector('[data-action="toggle"]').click();
    await tick(10);
    expect(store.playing).toBe(true);
    expect(bar.querySelector('[data-action="toggle"]').textContent).toBe('Pause');
    // The scrubber's step is one frame, 0.1 s at 10 fps, so its value moves
    // past 1.3 once the clock has played half a frame, which takes as many
    // animation frames as the machine needs: wait for the clock, not a time.
    for (let i = 0; i < 300 && store.time < 1.36; i++) await frames(1);
    expect(store.time).toBeGreaterThanOrEqual(1.36);
    expect(Number(bar.querySelector('input[type=range]').value)).toBeGreaterThan(1.3);   // the thumb moved with playback
    bar.querySelector('[data-action="toggle"]').click();
    await tick(10);
    expect(store.playing).toBe(false);
    wf.kinetic.config({ preview: false });
    expect(document.querySelector('[data-kinetic-preview]')).toBeNull();
  });

  it("with a runtime player, the bar's state is the player's: Pause while it plays, Play again when it stops", async () => {
    const { wf } = await load();
    let playing = false;
    window.__player = {
      play() { playing = true; dispatchSeek(0.1); },
      pause() { playing = false; },
      isPlaying() { return playing; },
      renderSeek(t) { dispatchSeek(t); },
      getDuration() { return 2; },
    };
    const host = await mount('<div data-composition-id="p3" data-start="0" data-duration="2" data-fps="10"></div>');
    cleanup.push(host);
    wf.kinetic.config({ preview: true });
    await tick(10);
    const bar = document.querySelector('[data-kinetic-preview]');
    bar.querySelector('[data-action="toggle"]').click();
    await tick(10);
    expect(wf.getStore('kinetic').playing).toBe(true);
    expect(bar.querySelector('[data-action="toggle"]').textContent).toBe('Pause');
    dispatchSeek(0.2);                      // another frame from the player: still playing
    await tick(10);
    expect(bar.querySelector('[data-action="toggle"]').textContent).toBe('Pause');
    expect(Number(bar.querySelector('input[type=range]').value)).toBeCloseTo(0.2, 9);
    playing = false;                        // the player reached the end on its own
    dispatchSeek(2);
    await tick(10);
    expect(wf.getStore('kinetic').playing).toBe(false);
    expect(bar.querySelector('[data-action="toggle"]').textContent).toBe('Play');
    delete window.__player;
  });

  it('never mounts while a render is capturing', async () => {
    const { wf } = await load();
    window.__HF_RENDER_CAPTURE_MODE = true;
    wf.kinetic.config({ preview: true });
    await tick(10);
    expect(document.querySelector('[data-kinetic-preview]')).toBeNull();
  });
});
