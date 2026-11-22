/**
 * check() with the passes of kinetic.tools.js: reading, layout, the lesson
 * walk and the view, each with a composition that trips it and one that
 * does not; the pixel passes, where the browser cannot draw a frame,
 * skipped with KN-201 while the others run; and KN-100 for a bad option.
 * The tools file is loaded here by its own script tag, as a page may load
 * it; tools-loader.test.js covers check() loading it. The pixel passes
 * themselves are in tools-pixels.test.js, in the render suite.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, loadScript, mount, uniqueName, expectKN, tick, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const TOOLS_FILE = WF_FILE.replace(/kinetic\.wf(\.min)?\.js$/, 'kinetic.tools$1.js');
const canDraw = typeof CanvasRenderingContext2D.prototype.drawElementImage === 'function';

let ready = null;
const tools = () => ready || (ready = (async () => { const { wf } = await load(); await loadScript(TOOLS_FILE); return wf; })());

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ mode: 'auto' });
  for (const el of cleanup.splice(0)) el.remove();
});

// A composition 320 by 180 at the top of the page, `duration` seconds at
// 10 fps, holding `inner`.
async function comp(duration, inner) {
  const wf = await tools();
  scrollTo(0, 0);
  const host = await mount(`<div data-composition-id="${uniqueName('tl')}" data-no-timeline data-start="0" data-duration="${duration}" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px;background:#fff;color:#000;font:14px/1.2 sans-serif">${inner}</div>`);
  cleanup.push(host);
  await wf.kinetic.ready();
  return { wf, host };
}
const text = (id, style, words, timing = '') => `<p id="${id}"${timing} style="position:absolute;margin:0;white-space:nowrap;${style}">${words}</p>`;

describe(`check() with the tools (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('reading: lists a block that leaves before it can be read, with its words, hold and need, and not one that stays', async () => {
    const { wf } = await comp(4, text('quick', 'left:40px;top:40px', 'Gone too soon', ' data-start="0" data-duration="0.5"')
      + text('slow', 'left:40px;top:100px', 'Stays long enough', ' data-start="0.5" data-duration="3.5"'));
    const r = await wf.kinetic.check({ samples: 4, reading: true });
    expect(r.ok).toBe(true);
    expect(r.frames).toBe(40);
    expect(r.view).toBe('render');
    expect(r.reading.short).toHaveLength(1);
    const b = r.reading.short[0];
    expect(b.text).toBe('Gone too soon');
    expect(b.words).toBe(3);
    expect(b.held).toBeCloseTo(0.5, 5);
    expect(b.from).toBe(0);
    expect(b.needs).toBeCloseTo(1.625, 5);
    expect(r.layout).toBeUndefined();
  });

  it('reading: a figure of three digits needs a second more', async () => {
    const { wf } = await comp(4, text('fig', 'left:40px;top:40px', 'Sales 24,318', ' data-start="0" data-duration="2"'));
    const r = await wf.kinetic.check({ samples: 2, reading: true });
    expect(r.reading.short.map((b) => [b.text, b.needs])).toEqual([['Sales 24,318', 2.5]]);
  });

  // Typed text is read as it types, so its time counts from its first letter; the line once whole still has to
  // hold for the floor, 1.5 s, or it is gone as it finishes.
  it('reading: typed text counts from its first letter, and the whole line holds 1.5 s or is listed', async () => {
    const wf = await tools();
    const typed = uniqueName('typed');
    wf.kinetic.scene(typed, { computed: { line() { return wf.kinetic.typewriter(this.local, 'one two three four', 9); } } });
    const clip = (id, duration) => `<div data-component="${typed}" data-start="1" data-duration="${duration}" style="position:absolute;left:20px;top:${id === 'brief' ? 30 : 100}px"><p id="${id}" style="margin:0;white-space:nowrap" data-bind="line"></p></div>`;
    // Both type from 1 s and are whole at 3 s; one is gone at 4 s, the other stays to 5 s.
    const { wf: k } = await comp(5, clip('brief', 3) + clip('stays', 4));
    const r = await k.kinetic.check({ samples: 2, reading: true });
    expect(r.reading.short).toHaveLength(1);
    const b = r.reading.short[0];
    expect(b.text).toBe('one two three four');
    expect(b.whole).toBe(true);
    expect(b.held).toBeCloseTo(1, 1);
    expect(b.needs).toBe(1.5);
    expect(b.from).toBeCloseTo(3, 1);
  });

  it('layout: text outside the safe area, cut off and over other text is listed; text inside it is not', async () => {
    const { wf } = await comp(2, text('edge', 'left:4px;top:60px', 'Near the edge')
      + text('cut', 'left:-30px;top:120px', 'Cut off words')
      + text('one', 'left:120px;top:20px', 'First line')
      + text('two', 'left:130px;top:24px', 'Second line')
      + text('fine', 'left:160px;top:90px', 'Inside'));
    const r = await wf.kinetic.check({ samples: 2, layout: true });
    const found = r.layout.found;
    const safe = found.find((f) => f.kind === 'safe');
    expect(safe).toMatchObject({ text: 'Near the edge', edge: 'left', margin: 16 });
    expect(safe.px).toBeGreaterThanOrEqual(10);
    expect(safe.held).toBeGreaterThanOrEqual(0.2);
    expect(found.find((f) => f.kind === 'cut')).toMatchObject({ text: 'Cut off words', edge: 'left' });
    const over = found.find((f) => f.kind === 'over');
    expect([over.text, over.other].sort()).toEqual(['First line', 'Second line']);
    expect(found.some((f) => f.text === 'Inside')).toBe(false);
    expect(r.reading).toBeUndefined();
    // The contrast reads pixels: measured where the browser can draw a frame.
    if (!canDraw) expect(r.skipped.contrast.code).toBe('KN-201');
    else expect(r.skipped).toBeUndefined();
  });

  it('layout: text at rest for less than 0.2 s outside the safe area is not listed', async () => {
    const { wf } = await comp(2, text('blip', 'left:4px;top:60px', 'Brief', ' data-start="1" data-duration="0.2"'));
    const r = await wf.kinetic.check({ samples: 2, layout: true });
    expect(r.layout.found.filter((f) => f.kind !== 'contrast')).toEqual([]);
  });

  // A stage larger than the window: the walk fits it to the window, so what covers a line is found for the whole
  // frame. The caption is under the second scene's card from 1 s, so it is outside the safe area for 1 s and over
  // nothing; afterwards the page is as it was.
  it('layout: a stage larger than the window is read whole, and the page is put back', async () => {
    const wf = await tools();
    const P = (css, words) => `<p style="position:absolute;margin:0;font:bold 60px sans-serif;color:#111;white-space:nowrap;${css}">${words}</p>`;
    const host = await mount('<div style="height:300px"></div>'
      + `<div data-composition-id="${uniqueName('big')}" data-no-timeline data-start="0" data-duration="3" data-fps="10" data-width="1920" data-height="1080" style="position:relative;width:1920px;height:1080px;background:#fff;overflow:hidden">`
      + `<div data-start="0" data-duration="3" style="position:absolute;inset:0">${P('left:1300px;top:900px', 'Scene one caption')}</div>`
      + `<div data-start="1" data-duration="2" style="position:absolute;left:960px;top:540px;width:960px;height:540px;background:#e8e0d0">${P('left:300px;top:340px', 'Scene two')}</div>`
      + '</div><div style="height:2000px"></div>');
    cleanup.push(host);
    scrollTo(0, 120);
    await wf.kinetic.ready();
    const root = host.querySelector('[data-composition-id]');
    expect(root.getBoundingClientRect().width, 'the stage is wider than the window').toBeGreaterThan(innerWidth);
    const r = await wf.kinetic.check({ samples: 3, layout: true });
    const found = r.layout.found.filter((f) => f.kind !== 'contrast');
    expect(found.filter((f) => f.kind === 'over')).toEqual([]);
    const safe = found.filter((f) => f.kind === 'safe' && f.text === 'Scene one caption');
    expect(safe).toHaveLength(1);
    expect(safe[0].held).toBeCloseTo(1, 6);
    expect(scrollY).toBe(120);
    expect(root.style.transform).toBe('');
    expect(root.getBoundingClientRect().width).toBe(1920);
  });

  it('two checks started together run one after the other, and the view is live again after both', async () => {
    const { wf } = await comp(2, text('a', 'left:40px;top:40px', 'Stays long enough'));
    expect(wf.kinetic.viewmode()).toBe('live');
    const [a, b] = await Promise.all([wf.kinetic.check({ samples: 3, reading: true }), wf.kinetic.check({ samples: 3, layout: true })]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.reading).toBeTruthy();
    expect(b.layout).toBeTruthy();
    expect(wf.kinetic.viewmode()).toBe('live');
    expect(document.documentElement.querySelector('[data-composition-id]').isConnected).toBe(true);
  });

  it('the pixel passes are skipped with the capture\'s error where the browser cannot draw a frame, and the others run', async () => {
    const { wf } = await comp(1, text('quick', 'left:40px;top:40px', 'Gone too soon', ' data-start="0" data-duration="0.3"'));
    const r = await wf.kinetic.check({ samples: 2, reading: true, frames: 3, strip: true, pace: 'calm', seam: true, jumps: true, diff: [0, 1], isolate: ['#quick'] });
    expect(r.reading.short).toHaveLength(1);
    if (canDraw) {
      expect(r.images).toHaveLength(3);
      return;
    }
    for (const pass of ['images', 'strip', 'pace', 'seam', 'jumps', 'diff', 'isolate']) {
      expect(r.skipped[pass].code, pass).toBe('KN-201');
      expect(r.skipped[pass].message).toMatch(/^\[KN-201\] render\(\)/);
      expect(r[pass], pass).toBeUndefined();
    }
  });

  it('lesson: walks every step to its hold, says which waits on its until and which plays on, and keeps the page as it was', async () => {
    const wf = await tools();
    const quiz = uniqueName('quiz');
    wf.store(quiz, { state: { done: false } });
    const [a, b, c] = [uniqueName('ask'), uniqueName('pass'), uniqueName('end')];
    const { host } = await comp(1.5, `<section id="${a}" data-step data-start="0" data-duration="0.5"></section><section id="${b}" data-step data-start="0.5" data-duration="0.5"></section><section id="${c}" data-step data-start="1" data-duration="0.5"></section>`);
    wf.kinetic.step(a, { until: quiz + '.done' });
    wf.kinetic.step(b, { wait: false });
    wf.kinetic.seek(0.2);
    const r = await wf.kinetic.check({ samples: 2, lesson: true });
    expect(r.lesson.ok).toBe(true);
    expect(r.ok).toBe(true);
    const [s1, s2, s3] = r.lesson.steps;
    expect(r.lesson.steps).toHaveLength(3);
    expect(s1).toMatchObject({ index: 0, id: a, held: true, waits: true, playsOn: false, lines: [] });
    expect(s1.time).toBeCloseTo(0.4, 6);
    expect(s2).toMatchObject({ index: 1, id: b, held: false, playsOn: true, ok: true });
    expect(s3).toMatchObject({ index: 2, id: c, held: true, waits: false });
    expect(s3.time).toBeCloseTo(1.4, 6);
    if (canDraw) for (const s of [s1, s3]) expect(s.png.type).toBe('image/png');
    else expect(r.skipped.stills.code).toBe('KN-201');
    // The time and the mode setting as they were.
    expect(wf.getStore('kinetic').time).toBeCloseTo(0.2, 6);
    expect(wf.kinetic.config().mode).toBe('auto');
    expect(host.isConnected).toBe(true);
  });

  it('lesson: a page with no steps reports so and fails', async () => {
    const { wf } = await comp(1, text('t', 'left:40px;top:40px', 'No steps'));
    const r = await wf.kinetic.check({ samples: 2, lesson: true });
    expect(r.lesson).toEqual({ ok: false, steps: [], reason: 'no steps' });
    expect(r.ok).toBe(false);
  });

  it("view: the render view reads data-viewmode=\"render\" text, the live view the live text, both runs each, and the page's view is put back", async () => {
    const { wf } = await comp(2, `<div data-viewmode="render">${text('r', 'left:40px;top:40px', 'Render words', ' data-start="0" data-duration="0.3"')}</div>`
      + `<div data-viewmode="live">${text('l', 'left:40px;top:100px', 'Live words', ' data-start="0" data-duration="0.3"')}</div>`);
    const shortOf = (r) => r.reading.short.map((x) => x.text);
    expect(shortOf(await wf.kinetic.check({ samples: 2, reading: true }))).toEqual(['Render words']);
    expect(shortOf(await wf.kinetic.check({ samples: 2, reading: true, view: 'live' }))).toEqual(['Live words']);
    const both = await wf.kinetic.check({ samples: 2, reading: true, view: 'both' });
    expect(both.view).toBe('render');
    expect(shortOf(both)).toEqual(['Render words']);
    expect(both.live.view).toBe('live');
    expect(shortOf(both.live)).toEqual(['Live words']);
    expect(both.ok).toBe(true);
    expect('__KINETIC_VIEW' in window).toBe(false);
    expect(wf.kinetic.viewmode()).toBe('live');
  });

  it('lists the KN lines printed during the run, once each with a count', async () => {
    const wf = await tools();
    const name = uniqueName('scene');
    // Math.random() during a seek: KN-141 in development, once per page.
    wf.kinetic.scene(name, { computed: { n() { return this.local >= 0 ? Math.random() > 2 : 0; } } });
    const { wf: w } = await comp(1, `<div data-component="${name}"><b data-bind="n"></b></div>`);
    const r = await w.kinetic.check({ samples: 2, reading: true });
    if (BUILD === 'min') expect(r.console).toEqual([]);
    else expect(r.console.some((l) => l.kind === 'kn' && /\[KN-141\]/.test(l.text))).toBe(true);
    for (const l of r.console) expect(l.count).toBeGreaterThanOrEqual(1);
  });

  // A block's text is its own: what a block inside it holds is that block's, read and timed apart.
  it("reading: a block that holds another block is read by its own words, and a word split across elements is one word", async () => {
    const { wf } = await comp(4, '<div id="card" data-start="0" data-duration="1" style="position:absolute;left:40px;top:20px">Label one two<p style="margin:0">alpha beta gamma delta epsilon zeta</p>and after</div>'
      + text('split', 'left:40px;top:120px', 'Hel<b>lo</b> <i>the</i><i>re</i>', ' data-start="0" data-duration="1"'));
    const r = await wf.kinetic.check({ samples: 2, reading: true });
    expect(r.reading.short.map((b) => [b.text, b.words]).sort()).toEqual([['Hello there', 2], ['Label one two and after', 5], ['alpha beta gamma delta epsilon zeta', 6]]);
  });

  it('the times in a report are whole hundredths of a second', async () => {
    const { wf } = await comp(3, text('quick', 'left:40px;top:40px', 'Gone too soon', ' data-start="0.3" data-duration="0.7"')
      + text('edge', 'left:4px;top:100px', 'Near the edge', ' data-start="0.3" data-duration="2.4"'));
    const r = await wf.kinetic.check({ samples: 2, reading: true, layout: true });
    const numbers = [];
    for (const b of r.reading.short) numbers.push(b.from, b.held);
    for (const f of r.layout.found) if (f.kind !== 'contrast') numbers.push(f.from, f.held);
    expect(numbers.length).toBeGreaterThanOrEqual(4);
    for (const n of numbers) expect(String(n)).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(r.reading.short.find((b) => b.text === 'Gone too soon')).toMatchObject({ from: 0.3, held: 0.7 });
  });

  // A seek that fails ends the check with its error. The clock was playing, and plays on, even when the seek
  // back to where it was fails too.
  it('a check ended by a seek that fails leaves a playing clock playing', async () => {
    const { wf } = await comp(3, text('a', 'left:40px;top:40px', 'Stays long enough'));
    const k = wf.kinetic, s = wf.getStore('kinetic');
    await k.seek(1.15);
    k.play();
    await tick(30);
    expect(s.playing).toBe(true);
    const on = (e) => { if (e.detail.time > 1.0 && e.detail.time < 1.3) e.detail.waitUntil(Promise.reject(new Error('this seek fails'))); };
    addEventListener('hf-seek', on);
    let err = null;
    try { await k.check({ samples: 2, reading: true }); } catch (e) { err = e; } finally { removeEventListener('hf-seek', on); }
    expect(String(err && err.message)).toContain('this seek fails');
    expect(s.playing).toBe(true);
    k.pause();
  });

  it('an option set to false asks for nothing: the self-test runs alone, and the tools are not called', async () => {
    const { wf } = await comp(1, text('a', 'left:40px;top:40px', 'Stays long enough'));
    const t = wf.kinetic.tools, was = t.check;
    let calls = 0;
    t.check = (o) => { calls++; return was(o); };
    try {
      const r = await wf.kinetic.check({ samples: 2, reading: false, layout: false, lesson: false });
      expect(r.ok).toBe(true);
      expect(calls).toBe(0);
      await wf.kinetic.check({ samples: 2, reading: true });
      expect(calls).toBe(1);
    } finally { t.check = was; }
  });

  // A page whose policy lets scripts run by a nonce: the tools' script tag carries the nonce kinetic.wf.js had.
  it('under a Content-Security-Policy with a nonce, the tools load with the nonce kinetic.wf.js was loaded with', async () => {
    const abs = (u) => new URL(u, location.href).href;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0';
    const loaded = new Promise((r) => { frame.onload = r; });
    frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="script-src 'nonce-abc'">
<script nonce="abc" src="${abs(CORE)}"></script><script nonce="abc" src="${abs(WF_FILE)}"></script></head><body style="margin:0">
<div data-composition-id="csp" data-no-timeline data-start="0" data-duration="1" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px;background:#fff;color:#000;font:14px/1.2 sans-serif">
<p style="position:absolute;left:40px;top:40px;margin:0">Stays long enough</p></div></body></html>`;
    document.body.appendChild(frame);
    cleanup.push(frame);
    await loaded;
    const k = frame.contentWindow.wildflower.kinetic;
    await k.ready();
    const r = await k.check({ samples: 2, reading: true }).then((x) => x, (e) => e);
    expect(r.message).toBeUndefined();
    expect(r.reading.short.map((b) => b.text)).toEqual(['Stays long enough']);
  });

  it('KN-100 for an option check() does not take or a value it cannot use', async () => {
    const wf = await tools();
    await expectKN(wf.kinetic.check({ readng: true }), 'KN-100', 'check({ readng })', "'readng' is not an option of check()");
    await expectKN(wf.kinetic.check({ reading: 'yes' }), 'KN-100', 'check({ reading })', 'reading is true or false, not "yes"');
    await expectKN(wf.kinetic.check({ frames: 0 }), 'KN-100', 'check({ frames })');
    await expectKN(wf.kinetic.check({ frames: [1, -1] }), 'KN-100', 'check({ frames })');
    await expectKN(wf.kinetic.check({ strip: true }), 'KN-100', 'check({ strip })', 'give frames too');
    await expectKN(wf.kinetic.check({ pace: 'fast' }), 'KN-100', 'check({ pace })');
    await expectKN(wf.kinetic.check({ diff: [1] }), 'KN-100', 'check({ diff })');
    await expectKN(wf.kinetic.check({ isolate: '#a' }), 'KN-100', 'check({ isolate })');
    await expectKN(wf.kinetic.check({ view: 'video' }), 'KN-100', 'check({ view })');
  });
});
