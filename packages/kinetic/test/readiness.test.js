/**
 * Readiness and inputs: the buildReady entry, ready() over fonts, the first
 * scan, waitFor queries and images; inputs read from the composition's
 * variables, coerced and validated, with KN-130 on a failure.
 *
 * The page keeps the first failure for good (one page is one render), so the
 * failing-inputs case is the last test in the file, and the waitFor failures
 * (KN-131, KN-133) have a file each: readiness-query-failed.test.js and
 * readiness-query-missing.test.js.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, captureWarnings, uniqueName, expectKN, framedPage, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__hfVariables;
  delete window.__hfVariablesByComp;
});

async function captureErrors(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.error = orig; }
  return lines;
}

// Resolves to 'pending' if the promise has not settled within ms.
const state = (p, ms = 60) => Promise.race([p.then(() => 'resolved', () => 'rejected'), tick(ms).then(() => 'pending')]);

const ONE_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe(`readiness (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('registers window.__hf.buildReady.kinetic, which settles with nothing to wait for, and survives the runtime resetting the registry', async () => {
    await load();
    const p = window.__hf.buildReady.kinetic;
    expect(typeof p.then).toBe('function');
    expect(await state(p, 500)).toBe('resolved');
    // The runtime replaces the registry with a fresh object as it initialises.
    window.__hf.buildReady = {};
    expect(window.__hf.buildReady.kinetic).toBe(p);
    window.__hf.buildReady.other = Promise.resolve();
    expect(Object.keys(window.__hf.buildReady).sort()).toEqual(['kinetic', 'other']);
    delete window.__hf.buildReady.other;
  });

  it('marks the composition root data-kinetic-ready once the page may be shown', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="rd0" data-start="0" data-duration="2"></div>');
    cleanup.push(host);
    const root = host.firstElementChild;
    // Without a runtime, readiness alone marks it.
    root.removeAttribute('data-kinetic-ready');
    await wf.kinetic.ready();
    expect(root.getAttribute('data-kinetic-ready')).toBe('true');
    // With the runtime present, the mark waits for its __renderReady, which
    // follows its own pass hiding the clips outside their window.
    root.removeAttribute('data-kinetic-ready');
    window.__player = { renderSeek() {}, play() {}, pause() {}, isPlaying() { return false; }, getDuration() { return 2; } };
    window.__renderReady = false;
    try {
      await wf.kinetic.ready();
      await tick(50);
      expect(root.hasAttribute('data-kinetic-ready')).toBe(false);
      window.__renderReady = true;
      await tick(60);
      expect(root.getAttribute('data-kinetic-ready')).toBe('true');
    } finally {
      delete window.__player;
      delete window.__renderReady;
    }
  });

  it('ready() resolves with fonts, the scan and the images under scenes', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="rd1" data-start="0" data-duration="2"><div data-component="${name}"><img src="${ONE_PX}"><img src="data:,broken"></div></div>`);
    cleanup.push(host);
    expect(await state(wf.kinetic.ready(), 2000)).toBe('resolved');
  });

  it('an image under a scene still loading after 30 s is KN-182 naming it: printed, ready() rejects, the root is "failed"', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="rd-stall" data-start="0" data-duration="2"><div data-component="${name}"><img id="stuck" src="${ONE_PX}#stuck"></div></div>`);
    cleanup.push(host);
    // A server that never answers: the decode never settles. The 30 s wait
    // is shortened here, and only it.
    host.querySelector('#stuck').decode = () => new Promise(() => {});
    const realTimeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => realTimeout(fn, ms === 30000 ? 50 : ms, ...a);
    let err = null, printed = [];
    try {
      printed = await captureErrors(async () => { err = await wf.kinetic.ready().then(() => null, (e) => e); });
    } finally {
      window.setTimeout = realTimeout;
    }
    expectKN(err, 'KN-182', 'the image ' + ONE_PX + '#stuck', /^did not load in 30 s/);
    expect(printed.some((l) => l.includes('KN-182'))).toBe(true);
    expect(host.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready')).toBe('failed');
  });

  it('scene(): waitFor and inputs are checked when the scene is defined', async () => {
    const { wf } = await load();
    expect(() => wf.kinetic.scene(uniqueName('bad'), { waitFor: 'sales' })).toThrow(/KN-100/);
    expect(() => wf.kinetic.scene(uniqueName('bad'), { waitFor: [''] })).toThrow(/KN-100/);
    expect(() => wf.kinetic.scene(uniqueName('bad'), { inputs: 3 })).toThrow(/KN-100/);
    expect(() => wf.kinetic.scene(uniqueName('bad'), { inputs: { a: Date } })).toThrow(/KN-100/);
    expect(() => wf.kinetic.scene(uniqueName('bad'), { inputs: { a: { type: Array } } })).toThrow(/KN-100/);
    expect(() => wf.kinetic.scene(uniqueName('bad'), { inputs: { a: { validator: 1 } } })).toThrow(/KN-100/);
  });

  it('inputs: read from the composition, coerced, defaulted, and there in init()', async () => {
    const { wf } = await load();
    window.__hfVariables = { title: 'Launch', price: '12.5', live: 'true', count: 3 };
    const name = uniqueName('scene');
    let seenInInit;
    wf.kinetic.scene(name, {
      inputs: {
        title: String,
        price: { type: Number, validator: (v) => v > 0 },
        live: Boolean,
        count: { type: String },
        accent: { type: String, default: '#c8452d' },
        optional: Number,
      },
      init() { seenInInit = Object.assign({}, this.inputs); },
      computed: { line() { return this.inputs.title + '/' + (this.inputs.price * 2) + '/' + typeof this.inputs.live + '/' + typeof this.inputs.count + '/' + this.inputs.accent + '/' + this.inputs.optional; } },
    });
    const host = await mount(`<div data-composition-id="rd2" data-start="0" data-duration="2"><div data-component="${name}"><b data-bind="line"></b></div></div>`);
    cleanup.push(host);
    expect(host.querySelector('b').textContent).toBe('Launch/25/boolean/string/#c8452d/undefined');
    expect(seenInInit).toEqual({ title: 'Launch', price: 12.5, live: true, count: '3', accent: '#c8452d', optional: undefined });
    expect(await state(wf.kinetic.ready(), 1000)).toBe('resolved');
  });

  it("inputs: per composition, through the scene's own variables, with no init() on the scene", async () => {
    const { wf } = await load();
    window.__hfVariables = { who: 'top' };
    window.__hfVariablesByComp = { 'rd3-a': { who: 'A' } };
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { inputs: { who: String } });
    const host = await mount(`<div data-composition-id="rd3" data-start="0" data-duration="2">
      <div data-composition-id="rd3-a" data-start="0"><div data-component="${name}"><b data-bind="inputs.who"></b></div></div>
      <div data-composition-id="rd3-b" data-start="0"><div data-component="${name}"><b data-bind="inputs.who"></b></div></div>
    </div>`);
    cleanup.push(host);
    expect([...host.querySelectorAll('b')].map((b) => b.textContent)).toEqual(['A', 'top']);
  });
});

describe(`readiness with queries (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('waitFor: ready() holds until the query has loaded, then resolves', async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const qn = uniqueName('q');
    let release;
    wf.query(qn, { from: () => new Promise((r) => { release = () => r([{ id: 1 }, { id: 2 }]); }) });
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { waitFor: [qn], computed: { n() { return wf.getQuery(qn).rows.length; } } });
    const host = await mount(`<div data-composition-id="rd5" data-start="0" data-duration="2"><div data-component="${name}"><b data-bind="n"></b></div></div>`);
    cleanup.push(host);
    const p = wf.kinetic.ready();
    expect(await state(p, 150)).toBe('pending');
    release();
    expect(await state(p, 2000)).toBe('resolved');
    expect(host.querySelector('b').textContent).toBe('2');
  });

  // The HyperFrames CLI renders with the page's clock frozen at 0 (probed
  // with v0.8.140: Date.now() and performance.now() both return 0), so a
  // query loaded there has lastSync 0, which is a load all the same.
  it('waitFor: ready() resolves for a query that loaded with the clock at 0, as in a HyperFrames render', async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const realNow = Date.now;
    Date.now = () => 0;
    try {
      const qn = uniqueName('q');
      let release;
      wf.query(qn, { from: () => new Promise((r) => { release = () => r([{ id: 1 }]); }) });
      const name = uniqueName('scene');
      wf.kinetic.scene(name, { waitFor: [qn] });
      const host = await mount(`<div data-composition-id="rd5z" data-start="0" data-duration="2"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      const p = wf.kinetic.ready();
      expect(await state(p, 150)).toBe('pending');
      release();
      expect(await state(p, 2000)).toBe('resolved');
      expect(wf.getQuery(qn).lastSync).toBe(0);
    } finally {
      Date.now = realNow;
    }
  });

  if (BUILD === 'dev') {
    it('waitFor: a reload after frame 0 warns KN-132 once (dev)', async ({ skip }) => {
      const { wf } = await load();
      if (!wf.features || wf.features.query === false) skip();
      const qn = uniqueName('q');
      let calls = 0;
      wf.query(qn, { from: () => new Promise((r) => setTimeout(() => r([{ id: ++calls }]), 80)) });
      const name = uniqueName('scene');
      wf.kinetic.scene(name, { waitFor: [qn] });
      const host = await mount(`<div data-composition-id="rd7" data-start="0" data-duration="2"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      await wf.kinetic.ready();
      const lines = await captureWarnings(async () => {
        wf.getQuery(qn).refresh();
        wf.kinetic.seek(0.5);
        wf.kinetic.seek(0.6);
        await tick(200);
        wf.kinetic.seek(0.7);
      });
      expect(lines.filter((l) => l.startsWith('[KN-132]') && l.includes("'" + qn + "'")).length).toBe(1);
    });

    it('waitFor on a tier without queries warns KN-101 and is not waited for (dev)', async ({ skip }) => {
      const { wf } = await load();
      if (!(wf.features && wf.features.query === false)) skip();
      const lines = await captureWarnings(async () => { wf.kinetic.scene(uniqueName('scene'), { waitFor: ['sales'] }); });
      expect(lines.some((l) => l.startsWith('[KN-101]'))).toBe(true);
      expect(await state(wf.kinetic.ready(), 1000)).toBe('resolved');
    });
  }

  it('a run that fails before a waitFor query loads leaves no poll of that query running', async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    // The page's 16 ms intervals, counted from before the framework loads.
    const head = '<script>window.__live = new Set(); const si = setInterval, ci = clearInterval;'
      + ' window.setInterval = (fn, ms, ...a) => { const id = si(fn, ms, ...a); if (ms === 16) __live.add(id); return id; };'
      + ' window.clearInterval = (id) => { __live.delete(id); return ci(id); };<\/script>';
    const body = '<div data-composition-id="rl" data-no-timeline data-start="0" data-duration="2" data-fps="30"><div data-component="rq" data-start="0" data-duration="2">x</div></div>'
      + '<script>wildflower.query("never", { from: () => new Promise(() => {}) });'
      + ' wildflower.kinetic.scene("rq", { waitFor: ["never"], inputs: { must: { type: Number, required: true } } });<\/script>';
    const p = await framedPage(body, cleanup, '', head);
    expect(p.result && p.result.code).toBe('KN-130');
    for (let i = 0; i < 2; i++) await p.kinetic.ready().catch(() => {});
    await tick(50);
    expect(p.w.__live.size).toBe(0);
  });

});

describe(`readiness failures (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('inputs: a missing required value, a wrong type or a failed validator is KN-130 on the console, and ready() rejects', async () => {
    const { wf } = await load();
    // The scene and input are the where on every build; the development
    // sentence says what is wrong with the value.
    const cases = [
      [{ price: { type: Number, required: true } }, {}, 'price', /^is required/],
      [{ price: Number }, { price: 'free' }, 'price', /^"free" is not a Number/],
      [{ on: Boolean }, { on: 'yes' }, 'on', /^"yes" is not a Boolean/],
      [{ price: { type: Number, validator: (v) => v > 0 } }, { price: '-1' }, 'price', /^-1 failed its validator/],
      [{ price: { validator: () => { throw new Error('boom'); } } }, { price: 1 }, 'price', /validator, which threw "boom"/],
    ];
    for (const [inputs, vars, input, re] of cases) {
      window.__hfVariables = vars;
      const name = uniqueName('scene');
      wf.kinetic.scene(name, { inputs });
      let host, rejected = null;
      const errors = await captureErrors(async () => {
        host = await mount(`<div data-composition-id="rd4" data-start="0" data-duration="2"><div data-component="${name}"></div></div>`);
        await wf.kinetic.ready().catch((e) => { rejected = e; });
      });
      host.remove();
      // One KN-130 line, ours: the inputs computed throws no error for the
      // framework to print again.
      const ours = errors.filter((l) => l.startsWith('[KN-130] scene '));
      expect(ours.length).toBe(1);
      expect(errors.filter((l) => l.includes('KN-130')), errors.join(' || ')).toEqual(ours);
      expect(errors[0]).toBe(ours[0]);
      expectKN({ code: 'KN-130', message: ours[0] }, 'KN-130', "scene '" + name + "' input '" + input + "'", re);
      expect(rejected && rejected.code).toBe('KN-130');
      expect(host.firstElementChild.getAttribute('data-kinetic-ready')).toBe('failed');
    }
    // The entry registered for the runtime had settled before the failures.
    expect(await state(window.__hf.buildReady.kinetic)).toBe('resolved');
  });
});
