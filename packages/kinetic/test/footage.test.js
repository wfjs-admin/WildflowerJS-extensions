/**
 * Footage in Kinetic's own route, with no HyperFrames runtime on the page: a
 * <video> with data-start, seeked to the frame on every paused seek and in
 * check(), played natively while the clock plays, and compared by check().
 * The fixtures show their own frame number (helpers.js, shownFrame), so a
 * test reads which source frame the element holds.
 *
 * Arrivals: in the page at load (a page of its own in a frame), added after
 * load and then ready(), and a src changed after load and then ready(). The
 * attributes: no data-duration (the window from the file's length),
 * data-media-start, data-playback-rate, a seek before and after the window,
 * and past the end of the file. Also KN-139 in development, once per clip,
 * and the guard's silence during footage seeks.
 *
 * Seeks here go through a synthetic hf-seek, whose barrier is the promise a
 * render or check() waits on: once it resolves, the frame must be on the
 * element, with no further wait.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, captureWarnings, dispatchSeek, FOOTAGE, shownFrame, footageFrame, framedPage, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const until = async (fn, ms = 4000) => { for (let i = 0; i < ms / 20 && !fn(); i++) await tick(20); return fn(); };

const ROOT = 'data-no-timeline data-start="0" data-width="160" data-height="90" data-fps="30" style="position:relative;width:160px;height:90px;background:#ff0000"';
const BOX = 'style="position:absolute;left:0;top:0;width:160px;height:90px"';
const video = (id, src, attrs = '') => `<video id="${id}" src="${FOOTAGE + src}" ${attrs} muted playsinline ${BOX}></video>`;

// A composition of `duration` seconds holding `clips`, added after load,
// with ready() awaited.
async function stage(id, duration, clips) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-duration="${duration}" ${ROOT}>${clips}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  const r = await Promise.race([wf.kinetic.ready().then(() => 'resolved', (e) => e), tick(8000).then(() => 'timed out')]);
  expect(r).toBe('resolved');
  return { wf, host, k: wf.kinetic, el: (sel) => host.querySelector('#' + sel) };
}

// Seeks through the barrier and reads each clip's frame once it resolves.
async function frameAt(t, els, w = window) {
  await dispatchSeek(t, w).done;
  return els.map(shownFrame);
}

// Plays from `from` for `ms` and samples, on every animation frame after
// the clock's own, the clock's time and what `read` returns.
async function playAndSample(k, store, from, ms, read, w = window) {
  k.play({ from });
  const out = [];
  const t0 = performance.now();
  await new Promise((resolve) => {
    const step = () => {
      out.push(Object.assign({ t: store.time, at: performance.now() - t0 }, read()));
      if (performance.now() - t0 < ms) w.requestAnimationFrame(step); else resolve();
    };
    w.requestAnimationFrame(step);
  });
  return out;
}

// How a playing clip keeps step with the clock, from the samples after the
// first 400 ms: `far`, the samples further from the clip's frame at the
// clock's time than 100 ms of composition time, in the source frames that
// is at the clip's rate, which is what the re-seek rule guarantees: a clip
// is seeked once it is 50 ms off, and the frame it shows stays put while
// that seek lands, about 45 ms more (a sample 67 ms behind was seen on a
// rate-2 clip during one); and `median`, how many source frames behind the
// middle sample is. Measured 2026-10-08 in Playwright's Chromium 151 and Chrome 155,
// headless: the element's currentTime sits 40 to 47 ms behind the clock (the
// stall of its start), and the frame drawn from it is 0 or 1 frames behind
// in every one of about 2,900 samples, never 2, so a median of at most 1 is
// not a coin flip.
//
// Under load (the whole suite on a busy machine) a frame can come late and
// a sample land past the 100 ms while a re-seek is under way: three such
// samples in a 1 s play were seen 2026-10-28, on the commit before the
// review fixes too. What the rule guarantees is that a clip out of step
// comes back, so `run` is the longest stretch of samples out of step, in ms.
function inStep(samples, key, opts = {}) {
  const { rate = 1, fps = 30 } = opts;
  const rows = samples.filter((s) => s.at > 400 && typeof s[key] === 'number')
    .map((s) => ({ t: s.t, at: s.at, want: footageFrame(s.t, opts), got: s[key] }));
  const behind = rows.map((r) => r.want - r.got).sort((a, b) => a - b);
  const out = (r) => Math.abs(r.want - r.got) > Math.ceil(0.1 * rate * fps);
  let run = 0, from = null;
  rows.forEach((r, i) => {
    if (!out(r)) { from = null; return; }
    if (from === null) from = i ? rows[i - 1].at : r.at;
    run = Math.max(run, r.at - from);
  });
  return { far: rows.filter(out), run, median: behind[behind.length >> 1], samples: rows.length };
}
// The samples out of the 100 ms few (one in ten at most) and each stretch of
// them short (250 ms at most, a re-seek's time with room for a late frame),
// and the middle sample within one frame.
function expectComesBack(s, key) {
  expect(s.samples, 'samples of ' + key).toBeGreaterThan(10);
  expect(s.far.length / s.samples, key + ' further than 100 ms: ' + JSON.stringify(s.far)).toBeLessThanOrEqual(0.1);
  expect(s.run, key + ' out of step for longer than 250 ms: ' + JSON.stringify(s.far)).toBeLessThanOrEqual(250);
}
function expectInStep(samples, key, opts) {
  const s = inStep(samples, key, opts);
  expectComesBack(s, key);
  expect(s.median, key + ' frames behind in the middle sample').toBeLessThanOrEqual(Math.ceil((opts && opts.rate || 1) * (opts && opts.fps || 30) / 30));
}

// Pauses, and once the pause has settled, expects each clip on its frame for
// the clock's time. A pause stops at any time, not only on a frame, and a
// seek goes 1.002 ms past its time. WebM stores each frame's time rounded
// down to the millisecond (frame 61 of the 30 fps fixture at 2.033000, not
// 2.0333), so a frame can start up to 1 ms before its nominal time: within
// about 2 ms of the next frame the clip shows that one (a pause at 2.0322
// showed frame 61, probed 2026-10-10). Seeks on whole frames, as check() and
// render() make, are unaffected.
async function expectPausedOn(k, store, els, opts) {
  k.pause();
  await until(() => els.every((v) => v.paused && !v.seeking));
  await tick(30);
  const t = store.time;
  els.forEach((v, i) => {
    const o = opts ? opts[i] : {};
    expect([footageFrame(t, o), footageFrame(t + 0.0021, o)], v.id + ' paused at ' + t).toContain(shownFrame(v));
  });
}

// Calls after(element, value) after each currentTime the element is given;
// returns the function that takes the wrapper off.
function onWrite(v, after) {
  const media = Object.getPrototypeOf(Object.getPrototypeOf(v));
  const own = Object.getOwnPropertyDescriptor(media, 'currentTime');
  Object.defineProperty(v, 'currentTime', {
    configurable: true,
    get() { return own.get.call(this); },
    set(x) { own.set.call(this, x); after(this, x); },
  });
  return () => { delete v.currentTime; };
}

// Makes one element report what a test gives: `time` for the currentTime it
// reads, `seeking` and `readyState`; onSet(value) hears each currentTime it
// is given, which still reaches the element. Returns the function that puts
// the element back.
function fake(v, { time, seeking, readyState } = {}, onSet = () => {}) {
  const own = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  Object.defineProperty(v, 'currentTime', {
    configurable: true,
    get() { return time ? time() : own.get.call(this); },
    set(x) { onSet(x); own.set.call(this, x); },
  });
  if (seeking) Object.defineProperty(v, 'seeking', { configurable: true, get: seeking });
  if (readyState) Object.defineProperty(v, 'readyState', { configurable: true, get: readyState });
  return () => { delete v.currentTime; delete v.seeking; delete v.readyState; };
}

// check() fails on a frame where a clip lands on another time in its second
// pass: every second currentTime the element is given is a quarter second on.
function landDifferently(v) {
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(v));
  const own = Object.getOwnPropertyDescriptor(proto, 'currentTime') || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(proto), 'currentTime');
  let k = 0;
  Object.defineProperty(v, 'currentTime', {
    configurable: true,
    get() { return own.get.call(this); },
    set(x) { own.set.call(this, x + (++k % 2 ? 0 : 0.25)); },
  });
}

describe(`footage in the page at load (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const PAGE = `<div data-composition-id="fl" data-duration="4" ${ROOT}>${video('a', 'f30.webm', 'data-start="0" data-duration="4"')}${video('b', 'f24.webm', 'data-start="0" data-duration="4"')}</div>`;

  it('a paused seek shows the exact frame, for every frame of 2 s, 30 fps footage and 24 fps footage in a 30 fps composition', async () => {
    const page = await framedPage(PAGE, cleanup);
    expect(page.result).toBe('resolved');
    const [a, b] = ['a', 'b'].map((id) => page.doc.getElementById(id));
    const wrong = [];
    for (let i = 0; i < 60; i++) {
      const [fa, fb] = await frameAt(i / 30, [a, b], page.w);
      const wa = footageFrame(i / 30), wb = footageFrame(i / 30, { fps: 24 });
      if (fa !== wa || fb !== wb) wrong.push(`frame ${i}: 30 fps showed ${fa} for ${wa}, 24 fps showed ${fb} for ${wb}`);
    }
    expect(wrong).toEqual([]);
    // Played back from frame 59 to frame 0 as well.
    for (let i = 59; i >= 0; i -= 7) {
      expect(await frameAt(i / 30, [a, b], page.w), 'back to frame ' + i).toEqual([footageFrame(i / 30), footageFrame(i / 30, { fps: 24 })]);
    }
  });

  it('while playing, each clip keeps step with the clock (within 100 ms, its 50 ms of drift and a re-seek landing, the middle sample within one frame), and a pause lands on the exact frame', async () => {
    const page = await framedPage(PAGE, cleanup);
    const [a, b] = ['a', 'b'].map((id) => page.doc.getElementById(id));
    const store = page.w.wildflower.getStore('kinetic');
    const samples = await playAndSample(page.kinetic, store, 0.5, 1500, () => ({ a: shownFrame(a), b: shownFrame(b), paused: a.paused }), page.w);
    expect(samples.filter((s) => s.at > 250 && s.paused).length, 'samples with the element paused').toBe(0);
    expectInStep(samples, 'a');
    expectInStep(samples, 'b', { fps: 24 });
    await expectPausedOn(page.kinetic, store, [a, b], [{}, { fps: 24 }]);
  });

  it('check() passes, and fails with the element and both times when a clip lands differently for the same seek', async () => {
    const page = await framedPage(PAGE, cleanup);
    const ok = await page.kinetic.check({ samples: 20 });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
    landDifferently(page.doc.getElementById('a'));
    const r = await page.kinetic.check({ samples: 10 });
    expect(r.ok).toBe(false);
    expect(r.element).toBe('#a');
    expect(r.property).toBe('currentTime');
    expect(Math.abs(Math.abs(Number(r.first) - Number(r.second)) - 0.25), r.first + ' then ' + r.second).toBeLessThan(1e-3);
  });
});

describe(`footage added after load, then ready() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a paused seek shows the exact frame', async () => {
    const { el } = await stage('fa1', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    for (const t of [1, 0.4, 2 + 1 / 30, 3.5, 0]) expect(await frameAt(t, [el('v')]), 't = ' + t).toEqual([footageFrame(t)]);
  });

  it('a seek through kinetic.seek() lands on the exact frame once the element has seeked', async () => {
    const { k, el } = await stage('fa2', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    k.seek(1.5);
    await until(() => !el('v').seeking);
    await tick(20);
    expect(shownFrame(el('v'))).toBe(45);
  });

  it('plays', async () => {
    const { wf, k, el } = await stage('fa3', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    const v = el('v');
    const samples = await playAndSample(k, wf.getStore('kinetic'), 1, 1200, () => ({ v: shownFrame(v), paused: v.paused }));
    expect(samples.filter((s) => s.at > 250 && s.paused).length).toBe(0);
    expectInStep(samples, 'v');
    await expectPausedOn(k, wf.getStore('kinetic'), [v]);
  });

  it('check() passes', async () => {
    const { k } = await stage('fa4', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    const r = await k.check({ samples: 20 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it('the element is muted whatever its markup says, since its sound plays through Web Audio', async () => {
    const { el } = await stage('fa5', 4, `<video id="v" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" data-has-audio="true" playsinline ${BOX}></video>`);
    await frameAt(1, [el('v')]);
    expect(el('v').muted).toBe(true);
    expect(el('v').hasAttribute('muted')).toBe(false);
  });
});

describe(`footage whose src changed after load, then ready() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  async function swapped(id) {
    const s = await stage(id, 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    expect(await frameAt(1, [s.el('v')])).toEqual([30]);
    s.el('v').src = FOOTAGE + 'f24.webm';
    await s.k.ready();
    return s;
  }

  it("a paused seek shows the new file's frame", async () => {
    const { el } = await swapped('fs1');
    for (const t of [1, 2.5, 0.2]) expect(await frameAt(t, [el('v')]), 't = ' + t).toEqual([footageFrame(t, { fps: 24 })]);
  });

  it('plays the new file', async () => {
    const { wf, k, el } = await swapped('fs2');
    const v = el('v');
    const samples = await playAndSample(k, wf.getStore('kinetic'), 0.5, 1000, () => ({ v: shownFrame(v) }));
    expectInStep(samples, 'v', { fps: 24 });
  });

  it('check() passes', async () => {
    const { k } = await swapped('fs3');
    const r = await k.check({ samples: 20 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
});

describe(`footage attributes (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // Without data-duration: 2 s into a file of 4.008 s, from 0.5 s, so the
  // window is [0.5, 2.508).
  const OPEN = { start: 0.5, mediaStart: 2 };
  const open = (id) => stage(id, 4, video('v', 'f30.webm', 'data-start="0.5" data-media-start="2"'));

  it('without data-duration, a paused seek finds the window from the file\'s length', async () => {
    const { el } = await open('fd1');
    const v = el('v');
    expect(await frameAt(2.4, [v])).toEqual([footageFrame(2.4, OPEN)]);
    expect(v.style.visibility).toBe('visible');
    expect(await frameAt(2.6, [v])).toEqual([119]);
    expect(v.style.visibility).toBe('hidden');
    expect(await frameAt(0.6, [v])).toEqual([footageFrame(0.6, OPEN)]);
  });

  it("without data-duration, playing stops at the file's end", async () => {
    const { wf, k, el } = await open('fd2');
    const v = el('v');
    const store = wf.getStore('kinetic');
    k.play({ from: 2.1 });
    expect(await until(() => store.time > 2.8)).toBe(true);
    expect(v.paused).toBe(true);
    expect(v.style.visibility).toBe('hidden');
    await until(() => !v.seeking);
    expect(shownFrame(v)).toBe(119);
  });

  it('without data-duration, check() passes', async () => {
    const { k } = await open('fd3');
    const r = await k.check({ samples: 24 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  const TRIM = { start: 1, end: 3, mediaStart: 1.5 };
  const trimmed = (id) => stage(id, 4, video('v', 'f30.webm', 'data-start="1" data-duration="2" data-media-start="1.5"'));

  it('data-media-start: a paused seek shows the trimmed frame', async () => {
    const { el } = await trimmed('fm1');
    for (const t of [1, 1.5, 2.9]) expect(await frameAt(t, [el('v')]), 't = ' + t).toEqual([footageFrame(t, TRIM)]);
    expect(footageFrame(1, TRIM)).toBe(45);
  });

  it('data-media-start: playing is trimmed', async () => {
    const { wf, k, el } = await trimmed('fm2');
    const v = el('v');
    const samples = await playAndSample(k, wf.getStore('kinetic'), 1.2, 1000, () => ({ v: shownFrame(v) }));
    expectInStep(samples, 'v', TRIM);
  });

  it('data-remap: a paused seek shows the remapped frame, double speed then a hold then single; development warns once about a malformed remap and a rate beside one (KN-139)', async () => {
    const lines = await captureWarnings(async () => {
      const { el } = await stage('frm', 4,
        video('ramp', 'f30.mp4', 'data-start="0.5" data-duration="3" data-remap=\'{"at":[0,1,2,3],"to":[0,2,2,3]}\'')
        + video('bad', 'f30.mp4', 'data-start="0" data-duration="1" data-remap=\'{"at":[0,1],"to":[1,0]}\'')
        + video('both', 'f30.mp4', 'data-start="0" data-duration="1" data-playback-rate="2" data-remap=\'{"at":[0,1],"to":[0,1]}\''));
      // 0.5 s in: file 1 s; 1.5 s in: held at 2 s; 2.5 s in: 2.5 s. The
      // malformed remap is not applied, so that clip plays at rate 1; the
      // one beside a rate follows its keys, at 1x, not the rate's 2x.
      expect(await frameAt(1, [el('ramp')])).toEqual([30]);
      expect(await frameAt(2, [el('ramp')])).toEqual([60]);
      expect(await frameAt(3, [el('ramp')])).toEqual([75]);
      expect(await frameAt(0.5, [el('bad'), el('both')])).toEqual([15, 15]);
    });
    if (BUILD === 'dev') {
      const kn = lines.filter((l) => l.startsWith('[KN-139]') && l.includes('data-remap'));
      expect(kn.length, kn.join('\n')).toBe(2);
      expect(kn.some((l) => l.includes('video#bad') && l.includes('never going back'))).toBe(true);
      expect(kn.some((l) => l.includes('video#both') && l.includes('the rate is not applied'))).toBe(true);
    }
  });

  it("data-remap in the attribute object syntax (unquoted keys, single-quoted strings) remaps as JSON does; one that does not read warns where it stopped (KN-139)", async () => {
    const lines = await captureWarnings(async () => {
      const { el } = await stage('frw', 4,
        video('ramp', 'f30.mp4', `data-start="0.5" data-duration="3" data-remap="{ at: [0, 1, 2, 3], to: [0, 2, 2, 3] }"`)
        + video('eased', 'f30.mp4', `data-start="0" data-duration="2" data-remap="{ 'at': [0, 2], to: [0, 2], ease: 'linear' }"`)
        + video('typo', 'f30.mp4', `data-start="0" data-duration="1" data-remap="{ at: [0, 1] to: [0, 1] }"`)
        + video('bare', 'f30.mp4', `data-start="0" data-duration="1" data-remap="{ at: [0, 1], to: [0, 1], ease: linear }"`));
      expect(await frameAt(1, [el('ramp')])).toEqual([30]);
      expect(await frameAt(2, [el('ramp')])).toEqual([60]);
      expect(await frameAt(3, [el('ramp')])).toEqual([75]);
      expect(await frameAt(1.5, [el('eased')])).toEqual([45]);
      // Neither malformed one is applied: both play at rate 1.
      expect(await frameAt(0.5, [el('typo'), el('bare')])).toEqual([15, 15]);
    });
    if (BUILD === 'dev') {
      const kn = lines.filter((l) => l.startsWith('[KN-139]') && l.includes('data-remap'));
      expect(kn.length, kn.join('\n')).toBe(2);
      expect(kn.find((l) => l.includes('video#typo'))).toMatch(/does not read at character 14, expected ',' or '\}'/);
      expect(kn.find((l) => l.includes('video#bare'))).toMatch(/does not read at character 33, expected a value; 'linear' is a name, and a string is quoted/);
    }
  });

  it('data-remap with an ease that overshoots (back, elastic, a cubic-bezier past 0..1) is not applied, as one that runs back is not, and development warns (KN-139)', async () => {
    const lines = await captureWarnings(async () => {
      const { el } = await stage('fro', 4,
        video('back', 'f30.mp4', `data-start="0" data-duration="2" data-remap="{ at: [0, 2], to: [0, 2], ease: 'back.in' }"`)
        + video('elastic', 'f30.mp4', `data-start="0" data-duration="2" data-remap="{ at: [0, 2], to: [0, 2], ease: 'elastic.out' }"`)
        + video('bezier', 'f30.mp4', `data-start="0" data-duration="2" data-remap="{ at: [0, 2], to: [0, 2], ease: 'cubic-bezier(0.5, -0.6, 0.5, 1)' }"`)
        + video('ok', 'f30.mp4', `data-start="0" data-duration="2" data-remap="{ at: [0, 2], to: [0, 2], ease: ['linear'] }"`));
      expect(await frameAt(1, [el('back'), el('elastic'), el('bezier'), el('ok')])).toEqual([30, 30, 30, 30]);
    });
    if (BUILD === 'dev') {
      const kn = lines.filter((l) => l.startsWith('[KN-139]') && l.includes('data-remap'));
      expect(kn.length, kn.join('\n')).toBe(3);
      for (const id of ['back', 'elastic', 'bezier']) expect(kn.find((l) => l.includes('video#' + id))).toMatch(/overshoots/);
    }
  });

  it('data-media-start: check() passes', async () => {
    const { k } = await trimmed('fm3');
    const r = await k.check({ samples: 20 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  // The runtime reads data-playback-start before data-media-start.
  it('data-playback-start: with no duration the clip ends at the file\'s length less it, and seeks to it plus (t - start) * rate', async () => {
    const { el } = await stage('fp1', 4, video('v', 'f30.webm', 'data-start="0" data-playback-start="1" data-media-start="0.5"'));
    const v = el('v');
    const PS = { start: 0, mediaStart: 1 };
    for (const t of [0, 1, 2.9]) expect(await frameAt(t, [v]), 't = ' + t).toEqual([footageFrame(t, PS)]);
    expect(v.style.visibility).toBe('visible');
    await frameAt(3.2, [v]);
    expect(v.style.visibility).toBe('hidden');
  });

  it('a data-media-start past the end of the file, with no duration, is a clip of no length: hidden at every time, and KN-139 once in development', async () => {
    let s;
    const lines = await captureWarnings(async () => { s = await stage('fp2', 4, video('v', 'f30.webm', 'data-start="0" data-media-start="5"')); });
    const v = s.el('v');
    for (const t of [0, 1, 2.5, 3.9]) {
      await frameAt(t, [v]);
      expect(v.style.visibility, 't = ' + t).toBe('hidden');
    }
    const kn = lines.filter((l) => l.startsWith('[KN-139]') && l.includes('data-media-start'));
    expect(kn.length).toBe(BUILD === 'dev' ? 1 : 0);
  });

  const FAST = { start: 0, end: 1.9, rate: 2 }, SLOW = { start: 0, end: 4, rate: 0.5 };
  const rated = (id) => stage(id, 4, video('fast', 'f30.webm', 'data-start="0" data-duration="1.9" data-playback-rate="2"') + video('slow', 'f30.webm', 'data-start="0" data-duration="4" data-playback-rate="0.5"'));

  it('data-playback-rate 2 and 0.5: a paused seek shows the frame at the rate', async () => {
    const { el } = await rated('fr1');
    for (const t of [0.5, 1.5, 1 + 1 / 30]) {
      expect(await frameAt(t, [el('fast'), el('slow')]), 't = ' + t).toEqual([footageFrame(t, FAST), footageFrame(t, SLOW)]);
    }
  });

  it('data-playback-rate 2 and 0.5: playing sets playbackRate, and the frames follow the rate', async () => {
    const { wf, k, el } = await rated('fr2');
    const [fast, slow] = [el('fast'), el('slow')];
    const samples = await playAndSample(k, wf.getStore('kinetic'), 0.3, 1200, () => ({ fast: shownFrame(fast), slow: shownFrame(slow), rates: fast.playbackRate + ',' + slow.playbackRate }));
    expect(samples.filter((s) => s.at > 250 && s.rates !== '2,0.5').map((s) => s.rates)).toEqual([]);
    expectComesBack(inStep(samples, 'fast', FAST), 'fast');
    expectComesBack(inStep(samples, 'slow', SLOW), 'slow');
  });

  it('data-playback-rate 2 and 0.5: check() passes', async () => {
    const { k } = await rated('fr3');
    const r = await k.check({ samples: 20 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  // [1, 2): before its window the first frame, after it the frame at its end.
  const MID = { start: 1, end: 2 };
  const mid = (id) => stage(id, 4, video('v', 'f30.webm', 'data-start="1" data-duration="1"'));

  it('a seek before its window decodes its first frame, and after it its last', async () => {
    const { el } = await mid('fw1');
    const v = el('v');
    expect(await frameAt(0.3, [v])).toEqual([0]);
    expect(v.style.visibility).toBe('hidden');
    expect(await frameAt(1.5, [v])).toEqual([15]);
    expect(await frameAt(2.5, [v])).toEqual([footageFrame(2.5, MID)]);
    expect(v.style.visibility).toBe('hidden');
    expect(await frameAt(0, [v])).toEqual([0]);
  });

  it('playing, a clip outside its window is paused', async () => {
    const { wf, k, el } = await mid('fw2');
    const v = el('v');
    const samples = await playAndSample(k, wf.getStore('kinetic'), 0.5, 2000, () => ({ paused: v.paused }));
    const before = samples.filter((s) => s.t > 0.55 && s.t < 0.95), inside = samples.filter((s) => s.t > 1.3 && s.t < 1.9), after = samples.filter((s) => s.t > 2.05);
    expect([before.length > 0, inside.length > 0, after.length > 0]).toEqual([true, true, true]);
    expect(before.every((s) => s.paused)).toBe(true);
    expect(inside.every((s) => !s.paused)).toBe(true);
    expect(after.every((s) => s.paused)).toBe(true);
  });

  it('a clip with a window in the middle: check() passes', async () => {
    const { k } = await mid('fw3');
    const r = await k.check({ samples: 24 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  // [0, 4) from 2 s into a file of 4.008 s: the file ends at 2.008.
  const PAST = { start: 0, end: 4, mediaStart: 2 };
  const past = (id) => stage(id, 4, video('v', 'f30.webm', 'data-start="0" data-duration="4" data-media-start="2"'));

  it('past the end of the file, the last frame holds', async () => {
    const { el } = await past('fe1');
    const v = el('v');
    expect(await frameAt(1.9, [v])).toEqual([footageFrame(1.9, PAST)]);
    for (const t of [2.2, 3, 3.9]) expect(await frameAt(t, [v]), 't = ' + t).toEqual([119]);
    expect(v.style.visibility).toBe('visible');
  });

  // Chrome can fire seeked for a seek onto the end of the file before it has
  // flushed the last frames, and sets ended once they are out: seen under the
  // full suite's load as frame 117 at seeked, then 119 with ended 100 ms
  // later. Here ended reads false after the real seeked, as it did then.
  it('a seek onto the end of the file is settled once the element has ended, not at seeked alone', async () => {
    const { el } = await past('fe9');
    const v = el('v');
    await frameAt(1.9, [v]);
    let open = false;
    const own = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'ended');
    Object.defineProperty(v, 'ended', { configurable: true, get() { return open && own.get.call(this); } });
    try {
      let settled = false;
      const done = dispatchSeek(2.2).done.then(() => { settled = true; });
      await until(() => !v.seeking && Math.abs(v.currentTime - v.duration) < 1e-6);
      await tick(150);
      expect(settled, 'settled while ended was still false').toBe(false);
      open = true;
      await done;
      expect(shownFrame(v)).toBe(119);
    } finally {
      delete v.ended;
    }
  });

  // ended reads only the position, true once the time is the duration, so it
  // can be true while the frame on the element is still the one before the
  // seek: seen once in the full matrix as frame 117 after the seek settled.
  // A seek onto the end also waits for the element to present a frame.
  it('a seek onto the end of the file is settled once the element has presented a frame, not at ended alone', async () => {
    const { el } = await past('fe10');
    const v = el('v');
    await frameAt(1.9, [v]);
    const held = [];
    v.requestVideoFrameCallback = (cb) => { held.push(cb); return held.length; };
    try {
      let settled = false;
      const done = dispatchSeek(2.2).done.then(() => { settled = true; });
      await until(() => !v.seeking && v.ended);
      await tick(150);
      expect(settled, 'settled before a frame was presented').toBe(false);
      expect(held.length).toBe(1);
      held[0](performance.now(), {});
      await done;
      expect(shownFrame(v)).toBe(119);
    } finally {
      delete v.requestVideoFrameCallback;
    }
  });

  it('past the end of the file, playing holds the last frame', async () => {
    const { wf, k, el } = await past('fe2');
    const v = el('v');
    const store = wf.getStore('kinetic');
    k.play({ from: 1.8 });
    expect(await until(() => store.time > 2.6)).toBe(true);
    expect(shownFrame(v)).toBe(119);
    expect(v.style.visibility).toBe('visible');
  });

  it('past the end of the file, check() passes', async () => {
    const { k } = await past('fe3');
    const r = await k.check({ samples: 24 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });
});

describe(`footage seeks and timing (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a seek waits for its own seeked: one the element fires while it is still seeking does not settle the barrier", async () => {
    const { el } = await stage('fq1', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    const v = el('v');
    await frameAt(0.5, [v]);
    // Each new time is followed, before the seek can land, by a 'seeked' of
    // its own, as one an earlier seek queued would be.
    const off = onWrite(v, (e) => queueMicrotask(() => e.dispatchEvent(new Event('seeked'))));
    try {
      expect(await frameAt(2, [v])).toEqual([60]);
      expect(await frameAt(1, [v])).toEqual([30]);
    } finally { off(); }
  });

  it('a second seek to the time a clip is already seeking to writes no new currentTime, and waits all the same', async () => {
    const { el } = await stage('fq2', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    const v = el('v');
    await frameAt(0.5, [v]);
    const writes = [];
    const off = onWrite(v, (e, x) => writes.push(x));
    try {
      const a = dispatchSeek(1.5), b = dispatchSeek(1.5);
      await Promise.all([a.done, b.done]);
      expect(writes.length).toBe(1);
      expect(shownFrame(v)).toBe(45);
    } finally { off(); }
  });

  it('a clip whose data-start refers to a footage clip with no length starts where that file ends, in its window, a scene\'s local time and its CSS animations, also after a seek made before the length was known', async () => {
    const { wf } = await load();
    const name = 'after-footage-' + Math.random().toString(36).slice(2, 7);
    wf.kinetic.scene(name, { computed: { at() { return this.local.toFixed(3); } } });
    // 2 s into a file of 4.008 s: crowd ends at 2.008. preload="none" holds
    // its metadata back until readiness loads it.
    const host = await mount(`<style>@keyframes ft-fade { from { opacity: 0 } to { opacity: 1 } }</style>
      <div data-composition-id="ft1" data-duration="4" ${ROOT}>${video('crowd', 'f30.webm', 'data-start="0" data-media-start="2" preload="none"')}
      <div id="next" data-component="${name}" data-start="crowd" data-duration="1"><b id="at" data-bind="at"></b><i id="spin" style="display:block;animation: ft-fade 10s linear infinite"></i></div></div>`);
    cleanup.push(host);
    const el = (id) => host.querySelector('#' + id);
    wf.kinetic.config({});
    // A seek before the length is known caches every timing as if crowd had none.
    await dispatchSeek(2.2).done;
    expect(el('crowd').readyState).toBe(0);
    await wf.kinetic.ready();
    await dispatchSeek(1.9).done;
    expect(el('next').style.visibility).toBe('hidden');
    await dispatchSeek(2.2).done;
    expect(el('next').style.visibility).toBe('visible');
    expect(el('at').textContent).toBe('0.192');
    const [anim] = el('spin').getAnimations();
    expect(Math.abs(anim.currentTime - 192), 'animation at ' + anim.currentTime).toBeLessThan(1);
  });

  it('a clip timed from a <video> that is no clip starts where that video starts, whether its metadata has arrived or not', async () => {
    const { el, host } = await stage('ft2', 4, `<video id="loose" src="${FOOTAGE}f30.webm" muted playsinline ${BOX}></video>`);
    await until(() => el('loose').readyState >= 1);
    const next = document.createElement('div');
    next.id = 'next';
    next.setAttribute('data-start', 'loose');
    next.setAttribute('data-duration', '1');
    host.firstElementChild.appendChild(next);
    await dispatchSeek(0.5).done;
    expect(next.style.visibility).toBe('visible');
  });

  it('a clip timed from footage with no length, off the frame grid, is KN-114 with the suggestion to give the footage a data-duration', async () => {
    let lines;
    lines = await captureWarnings(async () => {
      await stage('fk3', 4, video('crowd', 'f30.webm', 'data-start="0" data-media-start="2"') + '<div id="next" data-start="crowd" data-duration="1"></div>');
      await dispatchSeek(2.2).done;
    });
    const at = lines.findIndex((l) => l.startsWith('[KN-114]') && l.includes('div#next'));
    if (BUILD !== 'dev') { expect(at).toBe(-1); return; }
    expect(at, lines.join('\n')).toBeGreaterThan(-1);
    expect(lines[at + 1]).toMatch(/video#crowd/);
    expect(lines[at + 1]).toMatch(/data-duration/);
  });

  it('check() run the moment a clip is added waits for it to load, so its two passes agree', async () => {
    const { k, host } = await stage('fc1', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    const late = document.createElement('video');
    late.id = 'late';
    late.muted = true;
    late.setAttribute('muted', '');
    late.setAttribute('data-start', '0');
    late.setAttribute('data-duration', '4');
    late.src = FOOTAGE + 'f24.webm';
    host.firstElementChild.appendChild(late);
    const r = await k.check({ samples: 20 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it('a clip that starts within 50 ms of its frame plays from where it is: play() writes no currentTime', async () => {
    const { k, el } = await stage('fd5', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    const v = el('v');
    await frameAt(0.5, [v]);
    const writes = [];
    const off = fake(v, {}, (x) => writes.push(x));
    try {
      k.play();
      expect(await until(() => !v.paused)).toBe(true);
      expect(writes).toEqual([]);
    } finally { off(); }
  });

  it('a playing clip at rate 2 that is 80 ms of file time off, 40 ms of composition time, is not seeked again', async () => {
    const { wf, k, el } = await stage('fd6', 4, video('v', 'f30.webm', 'data-start="0" data-duration="1.9" data-playback-rate="2"'));
    const v = el('v');
    const store = wf.getStore('kinetic');
    k.play({ from: 0.2 });
    expect(await until(() => !v.paused)).toBe(true);
    const writes = [];
    const off = fake(v, { time: () => store.time * 2 + 0.001002 - 0.08 }, (x) => writes.push(x));
    try {
      await tick(400);
      expect(writes).toEqual([]);
    } finally { off(); }
  });

  it('a playing clip 200 ms off is not given its time again while it is seeking, or short of data', async () => {
    const { wf, k, el } = await stage('fd7', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"'));
    const v = el('v');
    const store = wf.getStore('kinetic');
    k.play({ from: 0.2 });
    expect(await until(() => !v.paused)).toBe(true);
    const behind = () => store.time + 0.001002 - 0.2;
    for (const state of [{ seeking: () => true }, { readyState: () => 2 }]) {
      const writes = [];
      const off = fake(v, Object.assign({ time: behind }, state), (x) => writes.push(x));
      try {
        await tick(300);
        expect(writes, JSON.stringify(Object.keys(state))).toEqual([]);
      } finally { off(); }
    }
  });

  it('a rate changed while the clock plays is applied on the next seek', async () => {
    const { k, el } = await stage('fr4', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4" data-playback-rate="2"'));
    const v = el('v');
    k.play({ from: 0.2 });
    expect(await until(() => !v.paused && v.playbackRate === 2)).toBe(true);
    v.setAttribute('data-playback-rate', '0.5');
    expect(await until(() => v.playbackRate === 0.5, 1500)).toBe(true);
  });

  it('when a runtime arrives while the standalone clock plays, the clips Kinetic started are paused and get their own muted back', async () => {
    const { k, el } = await stage('fh1', 4, `<video id="v" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" data-has-audio="true" playsinline ${BOX}></video>`);
    const v = el('v');
    k.play({ from: 0.5 });
    expect(await until(() => !v.paused)).toBe(true);
    expect(v.muted).toBe(true);
    window.__hyperframes = {};          // what the runtime sets as it loads
    try {
      expect(await until(() => v.paused, 1500)).toBe(true);
      expect(v.muted).toBe(false);
    } finally { delete window.__hyperframes; }
  });

  it('a clip taken off the page after Kinetic drove it is let go: a runtime that arrives later leaves it as it is', async () => {
    const { k, el } = await stage('fh2', 4, `<video id="gone" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" data-has-audio="true" playsinline ${BOX}></video>`
      + `<video id="kept" src="${FOOTAGE}f24.webm" data-start="0" data-duration="4" data-has-audio="true" playsinline ${BOX}></video>`);
    const [gone, kept] = [el('gone'), el('kept')];
    k.play({ from: 0.5 });
    expect(await until(() => !gone.paused && !kept.paused)).toBe(true);
    gone.remove();
    expect(gone.muted).toBe(true);
    window.__hyperframes = {};
    try {
      expect(await until(() => kept.paused, 1500)).toBe(true);
      expect(kept.muted).toBe(false);
      expect(gone.muted).toBe(true);
    } finally { delete window.__hyperframes; }
  });
});

describe(`footage warnings (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('KN-139, once per clip in development: autoplay, controls or loop; data-automation; neither muted nor data-has-audio; a rate out of range, clamped', async () => {
    const { wf } = await load();
    let s;
    const lines = await captureWarnings(async () => {
      s = await stage('fk1', 4, [
        `<video id="auto" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" autoplay muted ${BOX}></video>`,
        `<video id="ctl" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" controls loop muted ${BOX}></video>`,
        `<video id="ramp" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" data-automation='[{"t":0,"rate":1}]' muted ${BOX}></video>`,
        `<video id="loud" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" ${BOX}></video>`,
        `<video id="quick" src="${FOOTAGE}f30.webm" data-start="0" data-duration="0.3" data-playback-rate="20" muted ${BOX}></video>`,
        `<video id="both" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" muted data-has-audio="true" ${BOX}></video>`,
        `<video id="fine" src="${FOOTAGE}f30.webm" data-start="0" data-duration="4" muted ${BOX}></video>`,
        `<video id="lost" src="${FOOTAGE}f30.webm" data-start="nobody" data-duration="1" muted ${BOX}></video>`,
        `<video id="lost2" src="${FOOTAGE}f30.webm" data-start="nobody2" data-duration="1" data-has-audio="true" ${BOX}></video>`,
      ].join(''));
      await wf.kinetic.ready();
      await frameAt(0.2, [s.el('fine')]);
    });
    const kn = lines.filter((l) => l.startsWith('[KN-139]'));
    const ref = lines.filter((l) => l.startsWith('[KN-113]'));
    if (BUILD !== 'dev') { expect(kn.concat(ref)).toEqual([]); return; }
    const of = (id) => kn.filter((l) => l.includes('video#' + id + ' '));
    for (const id of ['auto', 'ctl', 'ramp', 'loud', 'quick', 'both']) expect(of(id).length, id + ': ' + kn.join('\n')).toBe(1);
    expect(of('fine')).toEqual([]);
    // muted and data-has-audio together: the sound plays, and the two contradict.
    expect(of('both')[0]).toMatch(/both muted and data-has-audio/);
    // A data-start that refers to no element, once per footage clip, with sound or without.
    expect(ref.filter((l) => l.includes('video#lost '))).toHaveLength(1);
    expect(ref.filter((l) => l.includes('video#lost2 '))).toHaveLength(1);
    expect(of('auto')[0]).toMatch(/autoplay/);
    expect(of('ctl')[0]).toMatch(/controls/);
    expect(of('ctl')[0]).toMatch(/loop/);
    expect(of('ramp')[0]).toMatch(/data-automation/);
    expect(of('loud')[0]).toMatch(/muted/);
    expect(of('loud')[0]).toMatch(/data-has-audio/);
    expect(of('quick')[0]).toMatch(/data-playback-rate="20"/);
    expect(of('quick')[0]).toMatch(/10/);
    // Each with a suggestion.
    const all = lines.join('\n');
    expect((all.match(/↳ Suggestion/g) || []).length).toBeGreaterThanOrEqual(5);
  });

  it('a rate out of range is clamped: data-playback-rate="20" plays at 10', async () => {
    const { el } = await stage('fk2', 4, `<video id="q" src="${FOOTAGE}f30.webm" data-start="0" data-duration="0.3" data-playback-rate="20" muted ${BOX}></video>`);
    expect(await frameAt(0.2, [el('q')])).toEqual([60]);
  });

  it('the guard prints nothing during footage seeks: paused, playing, check()', async () => {
    let s;
    const lines = await captureWarnings(async () => {
      s = await stage('fg1', 4, video('v', 'f30.webm', 'data-start="0" data-duration="4"') + video('w', 'f24.webm', 'data-start="1" data-media-start="0.5" data-playback-rate="2"'));
      for (const t of [0.5, 1.2, 3, 0]) await frameAt(t, [s.el('v')]);
      s.k.seek(2);
      await playAndSample(s.k, s.wf.getStore('kinetic'), 1, 600, () => ({}));
      s.k.pause();
      await s.k.check({ samples: 10 });
    });
    expect(lines.filter((l) => /^\[KN-1[47]\d\]/.test(l))).toEqual([]);
  });
});
