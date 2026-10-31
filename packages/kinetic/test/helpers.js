/**
 * Shared set-up for the Kinetic extension's suite: the framework tier file,
 * then the built extension, each through a classic <script src> as a page
 * loads them. The standalone clock is switched off after loading so no test
 * sees time move on its own; a test that wants it calls play().
 */
import { expect } from 'vitest';

export const BUILD = typeof __KINETIC_EXT_BUILD__ !== 'undefined' ? __KINETIC_EXT_BUILD__ : 'dev';
export const CORE = typeof __KINETIC_EXT_CORE__ !== 'undefined' ? __KINETIC_EXT_CORE__ : '/www/js/dist/wildflower.full.dev.js';
export const WF_FILE = typeof __KINETIC_EXT_FILE__ !== 'undefined' ? __KINETIC_EXT_FILE__ : '/packages/kinetic/dist/kinetic.wf.js';
export const CORE_TIER = (CORE.match(/wildflower(?:\.([\w-]+?))?(?:\.(dev|min))?\.js$/) || [])[1] || 'standard';
export const RUNTIME_FILE = '/tools/hyperframes/dist/hyperframe.runtime.iife.js';
// lottie-web, fetched by scripts/fetch-lottie.cjs; a page loads it, Kinetic never does.
export const LOTTIE_FILE = '/tools/lottie/build/player/lottie.min.js';

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}

let loaded = null;
// The framework with the extension installed and the standalone clock off.
export function load() {
  if (loaded) return loaded;
  loaded = (async () => {
    await loadScript(CORE);
    await loadScript(WF_FILE).catch(() => { throw new Error('could not load ' + WF_FILE + '; build it first: node scripts/build-rollup.cjs kinetic.wf'); });
    const wf = window.wildflower;
    wf.kinetic.config({ autoplay: false });
    return { wf };
  })();
  return loaded;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
export const frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r)); await tick(0); };

let counter = 0;
export const uniqueName = (base) => base + '-' + (++counter);

// Appends markup to the page, scans it, and waits for the components in it
// to initialize. Returns the container; remove() it when done.
export async function mount(html) {
  const { wf } = await load();
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  wf.scan(host);
  if (typeof wf.whenIdle === 'function') await wf.whenIdle();
  await tick(0);
  return host;
}

// The production build's link to a code's entry on the error-codes page.
export const DOCS = 'https://www.wildflowerjs.com/docs/error-codes?code=';

// A Kinetic error as the build under test words it. Every build throws or
// rejects with the same `code`, and the message starts with "[code] where",
// the call as the author wrote it or the clip, scene, input or query a page
// failure is about. The production build ends with a space and the link to
// the code's entry; the development build goes on with ": " and the
// sentence, which `detail` matches (a RegExp, or a string the sentence
// contains; leave it out to check the start alone), and has no link.
// `where` is a string, or a RegExp for a where with a generated name in it;
// either way it is the whole where, so it must end where the sentence or the
// link begins (render() does not pass for "render(): a seek…", nor ease[1]
// for "ease[10]"). `x` is the error, a function that throws or returns a
// promise, or a promise; for either promise, await the call. Returns the
// error.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function expectKN(x, code, where, detail) {
  const check = (err) => {
    expect(err, 'expected a ' + code + ' error, and nothing was thrown').toBeTruthy();
    const msg = String(err && err.message);
    expect(err.code, msg).toBe(code);
    const end = BUILD === 'min' ? '(?= ' + escape(DOCS + code) + '$)' : '(?=: |$)';
    const m = new RegExp('^' + escape('[' + code + '] ') + '(?:' + (where instanceof RegExp ? where.source : escape(where)) + ')' + end).exec(msg);
    expect(m, 'expected the message to be [' + code + '] ' + where + (BUILD === 'min' ? ' and the link' : ' and the sentence') + ': ' + msg).not.toBeNull();
    const head = m[0];
    if (BUILD === 'min') expect(msg).toBe(head + ' ' + DOCS + code);
    else expect(msg).not.toContain(DOCS);
    if (BUILD !== 'min' && detail !== undefined) {
      expect(msg.slice(head.length, head.length + 2), msg).toBe(': ');
      const rest = msg.slice(head.length + 2);
      if (detail instanceof RegExp) expect(rest).toMatch(detail);
      else expect(rest).toContain(detail);
    }
    return err;
  };
  const settle = (p) => p.then(() => check(null), check);
  if (typeof x === 'function') {
    let r;
    try { r = x(); } catch (e) { return check(e); }
    return r && typeof r.then === 'function' ? settle(r) : check(null);
  }
  if (x && typeof x.then === 'function') return settle(x);
  return check(x);
}

// expectKN() from the development build's whole message, "[KN-xxx] where:
// sentence", split at its first ": " outside brackets, so a where such as
// config({ shutter: { angle } }) stays whole. The development build's
// sentence contains the given one.
export function expectKNText(x, text) {
  const m = /^\[(KN-\d+)\] /.exec(text);
  let depth = 0, cut = -1;
  for (let i = m ? m[0].length : 0; m && i < text.length - 1; i++) {
    const c = text[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ':' && text[i + 1] === ' ' && depth === 0) { cut = i; break; }
  }
  if (cut < 0) throw new Error('not a "[KN-xxx] where: sentence" message: ' + text);
  return expectKN(x, m[1], text.slice(m[0].length, cut), text.slice(cut + 2));
}

// The console.warn lines `fn` prints. A development core adds a Docs line,
// "  ↳ Docs: https://…?code=KN-123", after each line Kinetic prints through
// wildflower.diagnostic(); the core's own suite covers that line, and it is
// left out here, so a test counting a code's lines counts the warnings.
export async function captureWarnings(fn) {
  const lines = [];
  const orig = console.warn;
  console.warn = (...a) => { const l = a.map(String).join(' '); if (!l.startsWith('  ↳ Docs: ')) lines.push(l); };
  try { await fn(); } finally { console.warn = orig; }
  return lines;
}

// A 16-bit PCM WAV file of one channel, or of several when `samples` is an
// array of channels, as bytes; wavUrl() hands it out as a blob URL that a
// page's <audio src> and fetch() both read.
export function wav(samples, rate = 48000) {
  const chans = Array.isArray(samples) ? samples : [samples];
  const n = chans[0].length, k = chans.length;
  const v = new DataView(new ArrayBuffer(44 + n * k * 2));
  const text = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); v.setUint32(4, 36 + n * k * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, k, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * k * 2, true); v.setUint16(32, k * 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, n * k * 2, true);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) v.setInt16(44 + (i * k + c) * 2, Math.max(-32768, Math.min(32767, Math.round(chans[c][i] * 32767))), true);
  }
  return new Uint8Array(v.buffer);
}
export const wavUrl = (samples, rate) => URL.createObjectURL(new Blob([wav(samples, rate)], { type: 'audio/wav' }));

// `seconds` of a sine at `hz`, amplitude `amp`, from `from` seconds on
// (silence before), at 48 kHz.
export function tone(hz, seconds, amp = 0.5, from = 0) {
  const out = new Float32Array(Math.round(seconds * 48000));
  for (let i = Math.round(from * 48000); i < out.length; i++) out[i] = amp * Math.sin(2 * Math.PI * hz * i / 48000);
  return out;
}

// A synthetic hf-seek in the runtime's shape: { time, waitUntil }, where
// waitUntil accepts promises only while the listeners run. Returns what the
// barrier would wait on. `w` is the window to seek, this one by default.
export function dispatchSeek(time, w = window) {
  const pending = [];
  let accepting = true;
  const detail = {
    time,
    waitUntil(p) {
      if (!accepting) throw new Error('waitUntil called after the listeners returned');
      pending.push(p);
    },
  };
  w.dispatchEvent(new w.CustomEvent('hf-seek', { detail }));
  accepting = false;
  return { pending, done: Promise.all(pending) };
}

// ---- interactive mode ----------------------------------------------------------

// Hands the page's animation frames and performance.now() to the test. Each
// run(ms) sets the clock to ms, runs the frames asked for so far with that
// timestamp, then lets their seeks settle; frames(from, to, hz) runs one
// every 1000/hz ms. The standalone clock, the followers' loop and anything
// else that asks for a frame run only when the test says. restore() puts the
// real ones back.
export function manualFrames(start = 100000) {
  const realRaf = window.requestAnimationFrame;
  const realCancel = window.cancelAnimationFrame;
  let queue = new Map();
  let id = 0;
  let ms = start;
  window.requestAnimationFrame = (cb) => { queue.set(++id, cb); return id; };
  window.cancelAnimationFrame = (i) => { queue.delete(i); };
  performance.now = () => ms;
  const self = {
    get pending() { return queue.size; },
    get now() { return ms; },
    set now(v) { ms = v; },
    async run(t) {
      ms = t;
      const cbs = Array.from(queue.values());
      queue = new Map();
      for (const cb of cbs) cb(t);
      await tick(0);
    },
    async frames(from, to, hz = 60) {
      for (let t = from; t <= to + 1e-9; t += 1000 / hz) await self.run(t);
    },
    restore() {
      window.requestAnimationFrame = realRaf;
      window.cancelAnimationFrame = realCancel;
      delete performance.now;
    },
  };
  return self;
}

// A page of its own in a frame, for what happens as a page loads: `body` is
// parsed before the framework and Kinetic load, `head` (markup) comes before
// both, and `script` runs after them. Autoplay is left as the page sets it.
// Resolves at the frame's load, without waiting for readiness.
export async function lessonFrame(body, { head = '', script = '', cleanup = null, preview = false } = {}) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:400px;border:0;pointer-events:none';
  const html = '<!doctype html><html><head><base href="' + location.href + '">' + head + '</head><body style="margin:0">' + body
    + '<script src="' + CORE + '"><\/script><script src="' + WF_FILE + '"' + (preview ? ' data-preview' : '') + '><\/script>'
    + '<script>' + script + '<\/script></body></html>';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  frame.src = url;
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  if (cleanup) cleanup.push(frame);
  await loaded;
  URL.revokeObjectURL(url);
  const w = frame.contentWindow;
  return { w, frame, k: w.wildflower.kinetic, store: w.wildflower.getStore('kinetic'), doc: w.document };
}

// Files from the main site that a few tests use: present in the repository
// the package is developed in, absent from the extensions repository, where
// those tests skip (the development repository runs them before every
// release). A missing file can come back as the server's HTML fallback, so
// an HTML answer counts as absent for the non-HTML files asked about here.
export const SITE_FONT = '/www/fonts/work-sans-normal-latin.woff2';
export const SITE_SINE_SCRIPT = '/www/demos/kinetic-sine/sine.js';
export const SITE_CODE_EXAMPLE = '/www/js/components/code-example.js';
export async function siteHas(file) {
  try {
    const r = await fetch(file);
    return r.ok && !/text\/html/.test(r.headers.get('content-type') || '');
  } catch (_) { return false; }
}

// The sine lesson demo (www/demos/kinetic-sine/) as its own page in a frame,
// with the framework tier and the Kinetic build under test in place of the
// site's files. `head` goes before the page's own scripts and `tail` at the
// end of the body; `preview` puts data-preview on Kinetic's tag, as ?preview
// in the address would. Resolves once ready() has settled.
export const SINE = '/www/demos/kinetic-sine/';
export async function sinePage(cleanup, { head = '', tail = '', width = 640, height = 400, preview = false } = {}) {
  const text = await (await fetch(SINE + 'index.html')).text();
  const html = text
    .replace(/<script[^>]*analytics\.js[^>]*><\/script>/, '')
    .replace('<head>', '<head><base href="' + new URL(SINE, location.href).href + '">' + head)
    .replace('</body>', tail + '</body>')
    .replace(/src="\/js\/dist\/wildflower\.[\w.-]+\.js"/, 'src="' + CORE + '"')
    .replace(/src="\/js\/extensions\/kinetic\.wf(?:\.min)?\.js"/, 'src="' + WF_FILE + '"' + (preview ? ' data-preview' : ''));
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:' + height + 'px;border:0;pointer-events:none';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  frame.src = url;
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  if (cleanup) cleanup.push(frame);
  await loaded;
  URL.revokeObjectURL(url);
  const w = frame.contentWindow;
  for (let i = 0; i < 300 && !(w.wildflower && w.wildflower.kinetic); i++) await tick(10);
  await w.wildflower.kinetic.ready();
  return { w, k: w.wildflower.kinetic, store: w.wildflower.getStore('kinetic'), sine: w.wildflower.getStore('sine'), doc: w.document };
}

// ---- footage ------------------------------------------------------------------

// The fixtures test/fixtures/make-footage.cjs writes: 160x90, 4 s, each
// frame's number in ten stripes, a 10 ms beep of 1 kHz at every whole second.
export const FOOTAGE = '/packages/kinetic/test/fixtures/';

// The source frame a fixture shows: the element drawn to a 10x1 canvas, so
// each pixel is the middle of one stripe, and bit i set where stripe i is
// light. 'bg' when the pixels are the red a test paints behind its clips.
export function shownFrame(el) {
  const c = document.createElement('canvas');
  c.width = 10; c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(el, 0, 0, 10, 1);
  const d = ctx.getImageData(0, 0, 10, 1).data;
  let n = 0, red = 0;
  for (let i = 0; i < 10; i++) {
    if (d[i * 4] > 128) n |= 1 << i;
    if (d[i * 4] > 160 && d[i * 4 + 1] < 96) red++;
  }
  return red === 10 ? 'bg' : n;
}

// The source frame a clip should show at composition time t: its media
// start plus the time into its window at its rate, held at the window's
// edges and at the file's last frame.
export function footageFrame(t, { start = 0, end = Infinity, mediaStart = 0, rate = 1, fps = 30, last = Math.round(4 * fps) - 1 } = {}) {
  const s = mediaStart + (Math.min(Math.max(t, start), end) - start) * rate;
  return Math.min(last, Math.floor(s * fps + 1e-6));
}

// A page of its own in a frame: `body` is parsed before the framework and
// Kinetic load, as markup in the page at load is, with the standalone clock
// off. Resolves once ready() has settled, with the frame's window, ready()'s
// outcome ('resolved' or the error) and the console.error lines. The page is
// a blob: URL with a <base> at this page's, so its location.origin is this
// page's origin (a srcdoc page's location.origin reads "null"). The frame is
// shown, since Chrome presents no new video frame in a frame at opacity 0,
// and render() would draw a <video> there on its first frame throughout.
// `onReady` is script run inside the page the moment ready() resolves.
// With `head` (markup for <head>, such as the runtime's script tag), the
// framework and Kinetic load in <head> after it, before `body` is parsed, so
// a script in `body` runs after Kinetic and before DOMContentLoaded. With
// `defer` as well, those two tags are deferred and the ready() script runs
// at DOMContentLoaded, after them; a script in `body` that calls Kinetic has
// to wait for DOMContentLoaded too.
export async function framedPage(body, cleanup, onReady = '', head = null, defer = false) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0;pointer-events:none';
  const tag = (src) => '<script' + (defer ? ' defer' : '') + ' src="' + src + '"><\/script>';
  const scripts = '<script>window.__errors = []; const e = console.error; console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); };<\/script>'
    + (head === null ? '' : head)
    + tag(CORE)
    + tag(WF_FILE);
  const ready = 'wildflower.kinetic.config({ autoplay: false }); window.__ready = wildflower.kinetic.ready().then(() => { ' + onReady + '; return "resolved"; }, (e) => e);';
  const html = '<!doctype html><html><head><base href="' + location.href + '">' + (head === null ? '' : scripts) + '</head><body style="margin:0">' + body
    + (head === null ? scripts : '')
    + '<script>' + (defer ? 'addEventListener("DOMContentLoaded", () => { ' + ready + ' });' : ready) + '<\/script>'
    + '</body></html>';
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  frame.src = url;
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  if (cleanup) cleanup.push(frame);
  await loaded;
  URL.revokeObjectURL(url);
  const w = frame.contentWindow;
  const result = await Promise.race([w.__ready, tick(10000).then(() => 'timed out')]);
  return { w, frame, result, kinetic: w.wildflower.kinetic, doc: w.document };
}
