/**
 * The preview bar across mounts: it registers its component once per page,
 * comes back after config({ preview: false }) or after the page removed it,
 * and its frame steps land on the frame grid between 0 and the end. It also
 * carries the count of KN lines printed since load (development build) or
 * says there is none (production build), and a Check button. The bar's other
 * controls and the player are covered in check.test.js.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, captureWarnings, BUILD, CORE, WF_FILE, CORE_TIER } from './helpers.js';

const dev = BUILD === 'dev';
const cleanup = [];
const restores = [];
afterEach(async () => {
  for (const f of restores.splice(0)) f();
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ preview: false });
  for (const el of cleanup.splice(0)) el.remove();
});

const bars = () => document.querySelectorAll('[data-kinetic-preview]');

// Replaces obj[name] for the rest of the test.
function stub(obj, name, fn) {
  const orig = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = orig; });
}

// Holds the bar's 4 s and 10 s timers instead of running them, so a test
// reads a message while it is up and then expires it on cue.
function holdTimers() {
  const held = [];
  const real = window.setTimeout;
  window.setTimeout = (fn, ms, ...rest) => ((ms === 4000 || ms === 10000) ? (held.push({ fn, ms }), 0) : real(fn, ms, ...rest));
  restores.push(() => { window.setTimeout = real; });
  return held;
}

// A bar over a 6 s, 30 fps composition on the shared page.
async function barOver(id) {
  const { wf } = await load();
  const host = await mount('<div data-composition-id="' + id + '" data-start="0" data-duration="6" data-fps="30"></div>');
  cleanup.push(host);
  wf.kinetic.config({ preview: true });
  await tick(10);
  return { wf, bar: bars()[0], readout: () => bars()[0].querySelector('span').textContent };
}

// A page of its own, for the counts that must start from zero: the shared
// page has printed KN-110 by the time a test runs. A first script puts a
// recorder on console.warn, error and info and keeps the originals' identity,
// so a test sees what reached the console and that the extension leaves the
// console as it is. `after` is markup placed after the extension's script.
async function framed(after = '', width = 900) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:300px;border:0;opacity:0;pointer-events:none';
  frame.srcdoc = '<!doctype html><html><body>'
    + '<div data-composition-id="fr" data-start="0" data-duration="2" data-fps="10"></div>'
    + '<script>window.__lines = []; for (const m of ["warn", "error", "info"]) console[m] = (...a) => window.__lines.push(m + " " + a.join(" "));'
    + 'window.__origWarn = console.warn; window.__origError = console.error;<\/script>'
    + '<script src="' + CORE + '"><\/script>'
    + '<script src="' + WF_FILE + '" data-preview><\/script>'
    + '<script>wildflower.kinetic.config({ autoplay: false });<\/script>'
    + after
    + '</body></html>';
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  for (let i = 0; i < 100 && !w.document.querySelector('[data-kinetic-preview]'); i++) await tick(20);
  await tick(20);
  const bar = w.document.querySelector('[data-kinetic-preview]');
  return { w, bar, count: bar && bar.querySelector('[data-kinetic-warnings]') };
}

describe(`preview bar mounts (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('mounts again after config({ preview: false }) without registering its component a second time', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="pv1" data-start="0" data-duration="2" data-fps="10"></div>');
    cleanup.push(host);
    const lines = await captureWarnings(async () => {
      wf.kinetic.config({ preview: true });
      await tick(10);
      wf.kinetic.config({ preview: false });
      expect(bars().length).toBe(0);
      await tick(10);                         // the framework has destroyed the bar's component
      wf.kinetic.config({ preview: true });
      await tick(10);
    });
    expect(lines.filter((l) => l.includes('kinetic-preview'))).toEqual([]);
    expect(bars().length).toBe(1);
    wf.kinetic.seek(0.5);
    await tick(10);
    expect(bars()[0].querySelector('span').textContent).toBe('0.50 / 2.00 s   frame 5');
  });

  it('mounts again after the page removed it', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="pv2" data-start="0" data-duration="2" data-fps="10"></div>');
    cleanup.push(host);
    wf.kinetic.config({ preview: true });
    await tick(10);
    bars()[0].remove();
    expect(bars().length).toBe(0);
    wf.kinetic.config({ preview: true });
    await tick(10);
    expect(bars().length).toBe(1);
    wf.kinetic.seek(1);
    await tick(10);
    expect(bars()[0].querySelector('span').textContent).toBe('1.00 / 2.00 s   frame 10');
  });
});

describe(`preview bar frame steps (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('step to the next or previous whole frame, and stop at 0 and at the end', async () => {
    const { wf } = await load();
    const host = await mount('<div data-composition-id="pv3" data-start="0" data-duration="2" data-fps="24"></div>');
    cleanup.push(host);
    wf.kinetic.config({ preview: true });
    await tick(10);
    const bar = bars()[0];
    const store = wf.getStore('kinetic');
    const click = async (action) => { bar.querySelector('[data-action="' + action + '"]').click(); await tick(10); };
    wf.kinetic.seek(0.5001);                  // just past frame 12
    await click('forward');
    expect(store.time).toBe(13 / 24);
    expect(store.frame).toBe(13);
    await click('back');
    await click('back');
    expect(store.time).toBe(11 / 24);
    wf.kinetic.seek(1.99);                    // frame 47.76, nearest 48 = the end
    await click('forward');
    expect(store.time).toBe(2);
    await click('forward');
    expect(store.time).toBe(2);
    wf.kinetic.seek(0.01);
    await click('back');
    expect(store.time).toBe(0);
    await click('back');
    expect(store.time).toBe(0);
  });
});

// The bar is fixed to the bottom of the window, so a control past its right
// edge cannot be reached at all. On a narrow window the bar wraps onto a
// second row instead; with room it stays one row.
describe(`preview bar layout (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const controls = (bar) => Array.from(bar.children);

  it('keeps every control inside a 390 px window by wrapping', async () => {
    const { w, bar } = await framed('', 390);
    const width = w.innerWidth;
    for (const el of controls(bar)) {
      const r = el.getBoundingClientRect();
      expect(r.left, el.outerHTML.slice(0, 60)).toBeGreaterThanOrEqual(0);
      expect(r.right, el.outerHTML.slice(0, 60)).toBeLessThanOrEqual(width + 0.5);
    }
    const render = bar.querySelector('[data-action="render"]');
    const check = bar.querySelector('[data-action="check"]');
    expect(render.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(check.getBoundingClientRect().width).toBeGreaterThan(0);
  });

  it('stays one row when the window has room', async () => {
    const { bar } = await framed('', 1400);
    const tops = new Set(controls(bar).map((el) => Math.round(el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2)));
    expect(tops.size).toBe(1);
  });
});

describe(`preview bar KN count (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it.runIf(dev)('starts at 0 warnings, in a colour quieter than the bar\'s text', async () => {
    const { w, bar, count } = await framed();
    expect(count.textContent).toBe('0 warnings');
    const text = w.getComputedStyle(bar.querySelector('span')).color;
    expect(w.getComputedStyle(count).color).not.toBe(text);
  });

  // A KN warning Kinetic prints: a scene that defines one of the extension's
  // own names (KN-152), printed as the definition is made.
  const reserved = (w) => w.wildflower.kinetic.scene('pv-reserved-' + Math.random().toString(36).slice(2), { state: { time: 1 } });

  it.runIf(dev)('counts the KN warnings and errors Kinetic prints, no other console line, and turns to the warning colour', async () => {
    const { w, bar, count } = await framed();
    const quiet = w.getComputedStyle(count).color;
    reserved(w);
    await tick(20);
    expect(count.textContent).toBe('1 warning');
    // Lines Kinetic did not print are not counted, a KN one included.
    w.console.warn('[KN-141] a line Kinetic did not print');
    w.console.warn('[WF-509] a framework line');
    w.console.error('an application error');
    await tick(20);
    expect(count.textContent).toBe('1 warning');
    // An error Kinetic prints on every build: a check() the bar ran failed.
    w.wildflower.kinetic.check = () => Promise.reject(Object.assign(new Error('[KN-160] check(): made up for the test'), { code: 'KN-160' }));
    bar.querySelector('[data-action="check"]').click();
    await tick(30);
    expect(count.textContent).toBe('2 warnings');
    expect(w.getComputedStyle(count).color).not.toBe(quiet);
    // The lines reach the console, in the [KN-nnn] form.
    expect(w.__lines.some((l) => l.startsWith('warn [KN-152] '))).toBe(true);
    expect(w.__lines.some((l) => l.startsWith('error [KN-160] check(): made up for the test'))).toBe(true);
    expect(w.__lines).toContain('warn [WF-509] a framework line');
  });

  it.runIf(dev)('counts the lines printed before the bar appeared', async () => {
    const { count } = await framed('<script>wildflower.kinetic.scene("pv-early", { state: { time: 1 } });<\/script>');
    expect(count.textContent).toBe('1 warning');
  });

  it.runIf(dev)('prints a one-line reminder to open the console when clicked, and does not count it', async () => {
    const { w, bar, count } = await framed();
    bar.querySelector('[data-action="remind"]').click();
    await tick(20);
    const info = w.__lines.filter((l) => l.startsWith('info '));
    expect(info.length).toBe(1);
    expect(info[0]).toMatch(/console/);
    expect(info[0]).not.toContain('\n');
    expect(count.textContent).toBe('0 warnings');
  });

  it.runIf(dev)('leaves console.warn and console.error alone, and keeps the count since load across the bar switched off and on', async () => {
    const { w, bar, count } = await framed();
    expect(w.console.warn).toBe(w.__origWarn);
    expect(w.console.error).toBe(w.__origError);
    w.wildflower.kinetic.config({ preview: false });
    reserved(w);                                            // while the bar is off
    w.wildflower.kinetic.config({ preview: true });
    await tick(30);
    const again = w.document.querySelector('[data-kinetic-warnings]');
    expect(again).toBeTruthy();
    expect(again.textContent).toBe('1 warning');
    reserved(w);
    await tick(20);
    expect(again.textContent).toBe('2 warnings');
    expect(bar.isConnected || count.isConnected).toBe(false);
    expect(w.console.warn).toBe(w.__origWarn);
  });

  it.runIf(!dev)('says "production build, no diagnostics" in a quiet colour instead of a zero, and leaves the console alone', async () => {
    const { w, bar, count } = await framed('<script>console.warn("[KN-141] a line the bar must not count");<\/script>');
    expect(count.textContent).toBe('production build, no diagnostics');
    expect(w.getComputedStyle(count).color).not.toBe(w.getComputedStyle(bar.querySelector('span')).color);
    expect(bar.querySelector('[data-action="remind"]')).toBeNull();
    expect(w.console.warn).toBe(w.__origWarn);
    expect(w.console.error).toBe(w.__origError);
  });
});

describe(`preview bar Check button (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('runs check({ samples: 30 }), reads checking… while it runs and the verdict for ten seconds', async () => {
    const { wf, bar, readout } = await barOver('pv5');
    const held = holdTimers();
    let seen, release;
    stub(wf.kinetic, 'check', (opts) => { seen = opts; return new Promise((r) => { release = r; }); });
    const button = bar.querySelector('[data-action="check"]');
    expect(button.textContent).toBe('Check');
    button.click();
    await tick(10);
    expect(seen).toEqual({ samples: 30 });
    expect(readout()).toBe('checking…');
    expect(button.disabled).toBe(true);
    release({ ok: true, frames: 180, samples: 30 });
    await tick(10);
    expect(readout()).toBe('check ok, 180 frames');
    expect(button.disabled).toBe(false);
    expect(held.map((t) => t.ms)).toEqual([10000]);
    held[0].fn();
    await tick(10);
    expect(readout()).toMatch(/ \/ 6\.00 s {3}frame /);
  });

  it('runs the real check and reports the composition\'s frames', async () => {
    const { bar, readout } = await barOver('pv6');
    bar.querySelector('[data-action="check"]').click();
    for (let i = 0; i < 100 && !readout().startsWith('check '); i++) await tick(20);
    expect(readout()).toBe('check ok, 180 frames');
  });

  it('names the frame and the property of a failing check, and the reason when the report has one', async () => {
    const { wf, bar, readout } = await barOver('pv7');
    holdTimers();
    stub(wf.kinetic, 'check', async () => ({ ok: false, frame: 42, time: 1.4, element: '#bar', property: 'style', first: 'width: 1px;', second: 'width: 2px;' }));
    bar.querySelector('[data-action="check"]').click();
    await tick(20);
    expect(readout()).toBe('check failed at frame 42: style');
    stub(wf.kinetic, 'check', async () => ({ ok: false, frame: 7, property: 'text', reason: 'a seek threw' }));
    bar.querySelector('[data-action="check"]').click();
    await tick(20);
    expect(readout()).toContain('frame 7');
    expect(readout()).toContain('a seek threw');
  });

  it('shows the code of a check that throws, and can run again', async () => {
    const { wf, bar, readout } = await barOver('pv8');
    holdTimers();
    stub(console, 'error', () => {});
    stub(wf.kinetic, 'check', async () => { const e = new Error('[KN-100] check(): no composition root'); e.code = 'KN-100'; throw e; });
    const button = bar.querySelector('[data-action="check"]');
    button.click();
    await tick(20);
    expect(readout()).toBe('check failed (KN-100)');
    expect(button.disabled).toBe(false);
  });

  it('the Render button is Cancel while a render runs: it aborts the signal the render was given, the readout says the render was cancelled, and Render comes back', async () => {
    const { wf, bar, readout } = await barOver('pv10');
    const held = holdTimers();
    const errors = [];
    stub(console, 'error', (...a) => errors.push(a.join(' ')));
    let given = null, renders = 0;
    stub(wf.kinetic, 'render', (opts) => {
      renders++;
      given = opts.signal;
      // As render() does: it rejects with the signal's reason once aborted.
      return new Promise((_, reject) => { given.addEventListener('abort', () => reject(given.reason)); });
    });
    const render = bar.querySelector('[data-action="render"]');
    const check = bar.querySelector('[data-action="check"]');
    expect(render.textContent).toBe('Render');
    render.click();
    await tick(10);
    expect(renders).toBe(1);
    expect(given instanceof AbortSignal && given.aborted).toBe(false);
    expect(render.textContent).toBe('Cancel');
    expect(render.disabled).toBe(false);
    expect(check.disabled).toBe(true);
    render.click();
    await tick(10);
    expect(given.aborted).toBe(true);
    expect(renders, 'Cancel starts no render').toBe(1);
    expect(readout()).toBe('render cancelled');
    expect(errors).toEqual([]);
    expect(render.textContent).toBe('Render');
    held.find((t) => t.ms === 4000).fn();
    await tick(10);
    expect(render.disabled).toBe(false);
    expect(check.disabled).toBe(false);
    // A render that ends on its own leaves Render as it was.
    stub(wf.kinetic, 'render', async () => ({ name: 'x.mp4', frames: 1, ms: 1 }));
    render.click();
    await tick(10);
    expect(render.textContent).toBe('Render');
    expect(readout()).toContain('x.mp4');
  });

  it('does not run while a render is running, and a render does not start while it checks', async () => {
    const { wf, bar } = await barOver('pv9');
    const held = holdTimers();
    let checks = 0, renders = 0, finishRender, finishCheck;
    stub(wf.kinetic, 'check', () => { checks++; return new Promise((r) => { finishCheck = r; }); });
    stub(wf.kinetic, 'render', () => { renders++; return new Promise((r) => { finishRender = r; }); });
    const check = bar.querySelector('[data-action="check"]');
    const render = bar.querySelector('[data-action="render"]');

    render.click();
    await tick(10);
    expect(renders).toBe(1);
    expect(check.disabled).toBe(true);
    check.click();
    check.disabled = false;                   // the method refuses too, not only the button
    check.click();
    await tick(10);
    expect(checks).toBe(0);

    finishRender({ name: 'x.mp4', frames: 1, ms: 1 });
    await tick(10);
    held.find((t) => t.ms === 4000).fn();     // the render's message expires
    await tick(10);
    expect(check.disabled).toBe(false);

    check.click();
    await tick(10);
    expect(checks).toBe(1);
    expect(render.disabled).toBe(true);
    render.disabled = false;
    render.click();
    await tick(10);
    expect(renders).toBe(1);
    finishCheck({ ok: true, frames: 1, samples: 1 });
    await tick(10);
    expect(render.disabled).toBe(false);
  });
});
