#!/usr/bin/env node
/**
 * check.cjs opens a Kinetic composition in a headless browser, waits for
 * readiness, runs wildflower.kinetic.check() and prints every KN line the
 * page wrote to the console, with the report. It exits 0 when the report is
 * ok and no KN line, page error or framework error printed (below), 1
 * otherwise, and 2 for a bad argument or no Playwright. Every KN line fails
 * the check: each one names something to fix.
 *
 * check() seeks a sample of frames twice, in two orders, and compares the
 * DOM each time. Its report has `ready`, the root's data-kinetic-ready, and
 * `errors`, the console errors, error events and unhandled rejections during
 * the seeks, with `firstError` the first message. It fails with `reason`
 * 'readiness failed' or 'a seek threw', or else with the first frame that
 * differed (`frame`, `time`, `element`, `property`, `first`, `second`). It
 * does not see a binding that shows nothing or a list with no rows, since
 * those are the same on every seek; look at the frames for those (--frames).
 *
 *   node check.cjs http://localhost:3000/           a served page
 *   node check.cjs path/to/index.html               a file, served from its folder
 *   node check.cjs index.html --root .              a file, served from another root
 *   --samples 30                                    frames to compare (default 30)
 *   --timeout 30                                    seconds to wait for readiness
 *   --frames 0,2.5,5                                a PNG of the root at each time
 *   --frames 12                                     a PNG of the root at 12 evenly spaced times
 *   --lesson                                        walk a lesson's steps (below)
 *   --no-reading                                    skip the reading pass (below)
 *   --out dir                                       where the PNGs go (default: frames/
 *                                                   beside the page, or in the folder
 *                                                   the script is run in for a URL)
 *
 * --frames: after the check, each time is snapped to its frame and sought in
 * video mode, the way check() seeks (the clock paused, the seek's promise
 * awaited: scenes, pools, effects and footage settled), and the composition
 * root is saved as frames/frame-<number>-<time>s.png. A whole number alone
 * is a count of frames from 0 to the last frame; anything else is a list of
 * seconds (one time: --frames 2.0). The paths are printed.
 *
 * The reading pass: after the check (and --frames), the composition is paused and sought
 * every 0.1 s from start to end, and each block of text (an element
 * that is not inline, or an SVG <text>) is timed while all of its text is
 * on screen: inside the root, its box not empty, and at least 90% opaque
 * through its ancestors. A block whose longest such stretch is shorter than
 * the BBC subtitle rate allows, at least 1.5 s and 0.5 s plus 0.375 s a word
 * (160 words a minute, and half a second to start reading), with 1 s more
 * for a figure of three digits or more, is listed under "reading:", with
 * its words, how long it held and from when. This is a floor: a calm piece
 * holds about twice as long. The list does not fail the run: a word that is meant to fly past is
 * the author's call, and everything else on it is a slide the viewer cannot
 * read. Words that come in one at a time count from the last one in. A
 * lesson is read as its video, in video mode; on the page each step holds
 * for the learner, so the list is about the video alone.
 *
 * The console lines are printed after the report. An error that comes
 * again with the same message and stack, from many seeks, is printed once,
 * where it first came, with its count ("× 37"). check() counts errors only
 * while it seeks, so the run also fails on an uncaught error or unhandled
 * rejection at any time, and on a console error in the framework's or an
 * extension's own form ([WildflowerJS], [WF-238], [TH-101], [3D-102]); an
 * author's own console error is printed and does not fail it.
 *
 * --lesson: on a page with steps, after the check, the page is put in
 * interactive mode and each step is entered in order with go(). For each
 * step the script waits for its hold, the last frame before the step's
 * wait (0.467 s for a wait of 0.5 at 30 fps), and reports whether it held, whether
 * it waits on an `until` (and the path), the console errors and KN lines
 * during the step, and a still of the root at the hold
 * (step-<number>-<id>.png). It answers no question: a step that waits on
 * its until is reported and the walk goes on with go() to the next step. A
 * step with wait: false plays on by design. It exits 1 for a step that never
 * holds, a console error or a KN line.
 *
 * It runs in the installed Chrome when there is one, else in Playwright's
 * Chromium, and prints which. It needs Playwright: `npm i -D playwright`
 * (and `npx playwright install chromium` on a machine without Chrome), or
 * `playwright-core` with Chrome installed, found from the folder it is run
 * in first, then from the script's own. The page's own scripts load as they
 * would in a browser, including the HyperFrames runtime from its CDN on a
 * page that loads it. Load Kinetic's development build, kinetic.wf.js, so
 * the warnings print.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const args = process.argv.slice(2);
// The page is the first argument that is neither an option nor the value
// after one.
const VALUED = ['--samples', '--timeout', '--root', '--frames', '--out'];
const target = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
// A KN line, "[KN-141] ...", also inside an Error's text ("Error: [KN-100] ...").
const KN = /\[KN-/;
// A console error in the framework's own form ([WildflowerJS], [WF],
// [Wildflower], [WF-238]) or an extension's ([TH-101] Threads, [3D-102]
// Trillium), as check.cjs prints it, "error: ...".
const FRAMEWORK = /^error: (?:Error: )?\[(?:WildflowerJS|Wildflower|WF|WF-\d+|TH-\d+|3D-\d+)\]/;
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def; };
const samples = Number(opt('samples', 30));
const timeoutMs = Number(opt('timeout', 30)) * 1000;
const lesson = args.includes('--lesson');
const reading = !args.includes('--no-reading');
const USAGE = 'usage: node check.cjs <url | path/to/index.html> [--root dir] [--samples 30] [--timeout 30] [--frames 0,2.5,5 | --frames 12] [--lesson] [--no-reading] [--out dir]';
if (!target) { console.error(USAGE); process.exit(2); }
if (!Number.isInteger(samples) || samples < 1) { console.error('--samples takes a whole number of frames, 1 or more'); process.exit(2); }
if (!(timeoutMs > 0) || !Number.isFinite(timeoutMs)) { console.error('--timeout takes a number of seconds above 0'); process.exit(2); }

// --frames: { count } for a whole number alone, { times } for a list of seconds.
function readFrames(raw) {
  if (raw === undefined) return null;
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) {
    const count = Number(s);
    return count >= 1 ? { count } : null;
  }
  const times = s.split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
  return times.length && times.every((t) => Number.isFinite(t) && t >= 0) ? { times } : null;
}
const frames = readFrames(opt('frames'));
if (args.includes('--frames') && !frames) { console.error('--frames takes seconds, 0 or more, separated by commas (0,2.5,5), or a whole number of frames, 1 or more (12)'); process.exit(2); }
if (args.includes('--out') && opt('out') === undefined) { console.error('--out takes a folder'); process.exit(2); }

// Whether `file` is inside the folder `root`.
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel); };

// Playwright from the folder the script is run in first, so a copy of the
// skill outside the project (in a user-wide skills folder) finds the project's.
function loadPlaywright() {
  const from = (name) => { try { return require(require.resolve(name, { paths: [process.cwd()] })); } catch (_) {} try { return require(name); } catch (_) {} return null; };
  const pw = from('playwright') || from('playwright-core');
  if (pw) return pw.chromium;
  console.error('check.cjs needs Playwright: npm i -D playwright (and npx playwright install chromium without Chrome)');
  process.exit(2);
}

// The installed Chrome when there is one, else Playwright's Chromium.
async function launch(chromium) {
  try {
    const browser = await chromium.launch({ channel: 'chrome' });
    return { browser, name: 'Chrome ' + browser.version() };
  } catch (_) {
    const browser = await chromium.launch();
    return { browser, name: "Playwright's Chromium " + browser.version() };
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff' };

// Serves a folder so a file path runs as a page would, with relative data paths.
function serve(root) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    // Chrome asks for /favicon.ico on its own; a page without one is no error.
    if (p === '/favicon.ico' && !fs.existsSync(file)) { res.statusCode = 204; res.end(); return; }
    if (!inside(root, file) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end('not found'); return; }
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

// Runs in the page before its scripts, for --lesson: records each step()
// definition's wait and until as Kinetic's step() receives it, so the walk
// can name the path a step waits on. Nothing else changes.
function recordSteps() {
  window.__checkSteps = {};
  let wf;
  Object.defineProperty(window, 'wildflower', {
    configurable: true,
    get() { return wf; },
    set(v) {
      wf = v;
      if (!v || typeof v !== 'object') return;
      let api;
      Object.defineProperty(v, 'kinetic', {
        configurable: true,
        enumerable: true,
        get() { return api; },
        set(a) {
          api = a;
          if (!a || typeof a.step !== 'function') return;
          const step = a.step;
          a.step = function (id, def) {
            if (typeof id === 'string' && def && typeof def === 'object') window.__checkSteps[id] = { wait: def.wait, until: def.until };
            return step.apply(this, arguments);
          };
        },
      });
    },
  });
}

// The composition root's selector, as Kinetic finds it.
const ROOT_SELECTOR = () => (document.querySelector('[data-root="true"]') ? '[data-root="true"]' : '[data-composition-id]');

(async () => {
  let url = target, server = null, outDir;
  if (!/^https?:\/\//.test(target)) {
    const file = path.resolve(target);
    if (!fs.existsSync(file)) { console.error('no such file: ' + file); process.exit(2); }
    const root = path.resolve(opt('root', path.dirname(file)));
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (!inside(root, file)) { console.error('the page is outside --root'); process.exit(2); }
    const s = await serve(root);
    server = s.server;
    url = 'http://127.0.0.1:' + s.port + '/' + rel;
    outDir = path.join(path.dirname(file), 'frames');
  } else {
    outDir = path.join(process.cwd(), 'frames');
  }
  if (opt('out') !== undefined) outDir = path.resolve(opt('out'));

  const chromium = loadPlaywright();
  const { browser, name } = await launch(chromium);
  console.log('browser: ' + name);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  if (lesson) await page.addInitScript(recordSteps);
  const lines = [];
  const keys = [];   // by line: what makes two errors the same, their message and stack
  let lastWasKn = false;
  page.on('console', (m) => {
    const text = m.text();
    if (KN.test(text)) { lines.push(text); lastWasKn = true; return; }
    if (lastWasKn && /^\s*↳/.test(text)) { lines.push(text); return; }
    lastWasKn = false;
    if (m.type() === 'error') { keys[lines.length] = text; lines.push('error: ' + text); }
  });
  page.on('pageerror', (e) => { keys[lines.length] = e.message + '\n' + (e.stack || ''); lines.push('page error: ' + e.message); });
  // The lines from `from` to `to` as printed: an error that came again (the
  // same message and stack, from many seeks) once, at its first place,
  // with a count.
  const fold = (from, to) => {
    const out = [], at = new Map();
    for (let i = from; i < to; i++) {
      const key = keys[i];
      if (key === undefined) { out.push({ line: lines[i], n: 1 }); continue; }
      if (at.has(key)) { at.get(key).n++; continue; }
      const entry = { line: lines[i], n: 1 };
      at.set(key, entry);
      out.push(entry);
    }
    return out.map((e) => (e.n > 1 ? e.line + ' × ' + e.n : e.line));
  };

  // The root, saved as a PNG under outDir; the path printed.
  const still = async (fileName) => {
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, fileName);
    const sel = await page.evaluate(ROOT_SELECTOR);
    // The preview bar, fixed over the window's foot, the speaker over the
    // stage's corner and the pause mark are left out of the still.
    await page.locator(sel).first().screenshot({ path: file, style: '[data-kinetic-preview], [data-kinetic-speaker], [data-kinetic-paused] { visibility: hidden !important; }' });
    return file;
  };

  let exit = 0;
  let checked = false;
  let walk = null;
  let short = null;          // the reading pass's blocks that leave too soon
  let walkFrom = Infinity;   // the console lines from here on belong to the lesson's steps
  try {
    await page.goto(url, { waitUntil: 'load' });
    const started = Date.now();
    let ready = null;
    while (Date.now() - started < timeoutMs) {
      ready = await page.evaluate(() => {
        const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
        if (!root) return 'no root';
        return root.getAttribute('data-kinetic-ready') || null;
      });
      if (ready === 'true' || ready === 'failed' || ready === 'no root') break;
      await page.waitForTimeout(100);
    }
    if (ready === 'no root') { console.log('No composition root: the page has no element with data-composition-id.'); exit = 1; }
    else if (ready !== 'true' && ready !== 'failed') { console.log('Readiness did not settle within ' + (timeoutMs / 1000) + ' s. A waitFor query, a font or an image is still pending, or the runtime is waiting on something else.'); exit = 1; }
    else {
      if (ready === 'failed') { console.log('Readiness failed. The KN line below says why.'); exit = 1; }
      const report = await page.evaluate(async (samples) => {
        const k = window.wildflower && window.wildflower.kinetic;
        if (!k) return { error: 'wildflower.kinetic is not on the page' };
        try { return await k.check({ samples }); } catch (e) { return { error: e.message }; }
      }, samples);
      console.log('check: ' + JSON.stringify(report));
      if (report.error || report.ok !== true) exit = 1;
      checked = !report.error;
    }

    if (checked && frames) {
      // The times, snapped to frames, in video mode with the clock paused.
      const plan = await page.evaluate((frames) => {
        const k = window.wildflower.kinetic, s = window.wildflower.getStore('kinetic');
        const fps = s.fps, last = Math.max(0, Math.round(s.duration * fps) - 1);
        let list;
        if (frames.count) list = Array.from({ length: frames.count }, (_, i) => (frames.count === 1 ? 0 : Math.round(i * last / (frames.count - 1))));
        else list = frames.times.map((t) => Math.min(last, Math.round(t * fps)));
        window.__checkMode = k.config().mode;
        k.pause();
        k.config({ mode: 'video' });
        return { fps, frames: list };
      }, frames);
      console.log('frames:');
      for (const f of plan.frames) {
        const t = f / plan.fps;
        // The seek check() makes: hf-seek's waitUntil hands over the seek's
        // promise, which settles with the scenes, the pools, the effects and
        // the footage. A page on the timeline channel hears no hf-seek, so
        // it is sought with seek() and given two frames.
        await page.evaluate(async (t) => {
          const pending = [];
          window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t, waitUntil: (p) => pending.push(p) } }));
          if (pending.length) await Promise.all(pending);
          else {
            window.wildflower.kinetic.seek(t);
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          }
        }, t);
        const file = await still('frame-' + String(f).padStart(4, '0') + '-' + t.toFixed(3) + 's.png');
        console.log('  ' + t.toFixed(3) + ' s (frame ' + f + '): ' + file);
      }
      await page.evaluate(() => window.wildflower.kinetic.config({ mode: window.__checkMode }));
    }

    if (checked && reading) short = await readingPass(page);

    walkFrom = lines.length;
    if (checked && lesson) walk = await walkLesson(page, still, lines, fold);
  } finally {
    await browser.close();
    if (server) server.close();
  }

  if (short) {
    if (!short.length) console.log('reading: every block of text stays on screen long enough to read');
    else {
      console.log('reading: ' + short.length + ' block' + (short.length === 1 ? '' : 's') + ' of text leave' + (short.length === 1 ? 's' : '') + ' before ' + (short.length === 1 ? 'it' : 'they') + ' can be read (fully on screen for at least 1.5 s, and 0.5 s plus 0.375 s a word, with 1 s more for a figure)');
      for (const b of short) console.log('  "' + b.text + '" (' + b.words + ' word' + (b.words === 1 ? '' : 's') + '): ' + b.held.toFixed(1) + ' s from ' + b.from.toFixed(1) + ' s, needs ' + b.needs.toFixed(1) + ' s');
    }
  }

  if (walk) {
    if (walk.error) { console.log('lesson: ' + walk.error); exit = 1; }
    else {
      console.log('lesson: ' + walk.steps.length + ' step' + (walk.steps.length === 1 ? '' : 's'));
      for (const s of walk.steps) {
        const what = [];
        if (s.held) what.push('held at ' + s.time.toFixed(3) + ' s, the last frame before its wait');
        else if (s.playsOn) what.push('plays on into the next step (wait: false)');
        else what.push('NEVER HELD within ' + s.waited.toFixed(1) + ' s');
        if (s.until) what.push(s.waits ? 'waits on until ' + s.until : 'until ' + s.until + ' was already true at the hold, so it went on by itself');
        console.log('  ' + (s.index + 1) + ' ' + s.id + ': ' + what.join('; '));
        if (s.still) console.log('    still: ' + s.still);
        for (const l of s.printed) console.log('    ' + l);
        // A step that never holds, a console error or a KN line during it.
        if ((!s.held && !s.playsOn) || s.lines.some((l) => KN.test(l) || /^(error|page error): /.test(l))) exit = 1;
      }
    }
  }

  // The lines before the lesson's walk; the walk's are listed by step above.
  const before = walk && !walk.error ? lines.slice(0, walkFrom) : lines;
  if (before.length) {
    console.log('console:');
    for (const l of fold(0, before.length)) console.log('  ' + l);
    if (before.some((l) => KN.test(l))) exit = 1;
    // check() counts errors only while it seeks, so an error at load, after
    // readiness or after the last seek passes its report. An uncaught error
    // or rejection at any time fails the run, and so does a console error in
    // the framework's or an extension's own form; an author's own console
    // error is printed and does not.
    if (before.some((l) => /^page error: /.test(l) || FRAMEWORK.test(l))) {
      console.log('Failed: an error outside the seeks, a page error or one the framework printed, which check() does not count.');
      exit = 1;
    }
  }
  else console.log('console: no KN lines, no errors');
  process.exit(exit);
})().catch((e) => { console.error(e.message || e); process.exit(2); });

// A figure the eye has to take in: a number of three digits or more, with
// its separators (498, 4.07, 24,318).
const FIGURE = /\d[\d,.]*\d[\d,.]*\d/;

// The reading pass: the blocks of text whose longest stretch fully on
// screen is shorter than the BBC subtitle rate allows (at least 1.5 s, and
// 0.5 s plus 0.375 s a word, with 1 s more for a figure), in order of first
// showing.
async function readingPass(page) {
  const STEP = 0.1;
  const plan = await page.evaluate(() => {
    const k = window.wildflower.kinetic, s = window.wildflower.getStore('kinetic');
    // A lesson is read as its video, in video mode, as --frames sees it; a
    // page with no steps is the same in both modes, so its mode is left as
    // it is (video mode would wake KN-151 for a scene with tick()).
    k.pause();
    const lesson = s.stepCount > 0;
    if (lesson) { window.__checkMode = k.config().mode; k.config({ mode: 'video' }); }
    return { duration: s.duration, fps: s.fps, lesson };
  });
  const last = Math.max(0, plan.duration - 1 / plan.fps);
  const runs = new Map();   // key -> { text, words, start, best, bestFrom, from }
  const close = (r, t) => { if (r.start !== null) { const held = t - r.start; if (held > r.best) { r.best = held; r.bestFrom = r.start; } r.start = null; } };
  for (let t = 0; t <= last + 1e-6; t += STEP) {
    const shown = await page.evaluate(async (t) => {
      const pending = [];
      window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t, waitUntil: (p) => pending.push(p) } }));
      if (pending.length) await Promise.all(pending);
      else { window.wildflower.kinetic.seek(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
      const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
      const R = root.getBoundingClientRect();
      const keys = window.__readKeys || (window.__readKeys = new WeakMap());
      // On screen: a box that is not empty, its centre inside the root, and
      // 90% opaque or more through its ancestors up to the root.
      const visible = (el) => {
        const b = el.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return false;
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        if (cx < R.left || cx > R.right || cy < R.top || cy > R.bottom) return false;
        let op = 1;
        for (let e = el; e && e !== root.parentElement; e = e.parentElement) {
          const cs = getComputedStyle(e);
          if (cs.display === 'none' || cs.visibility === 'hidden') return false;
          op *= parseFloat(cs.opacity);
        }
        return op >= 0.9;
      };
      // A text node's block: an SVG <text>, or the nearest ancestor that is not inline.
      const blockOf = (p) => {
        const svgText = p.closest('text');
        if (svgText && root.contains(svgText)) return svgText;
        let b = p;
        while (b !== root && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
        return b;
      };
      const blocks = new Map();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const p = n.parentElement;
        if (!p || p.closest('[data-kinetic-finish], [data-kinetic-preview], script, style, template')) continue;
        const b = blockOf(p);
        blocks.set(b, (blocks.has(b) ? blocks.get(b) : true) && visible(p));
      }
      const out = [];
      for (const [b, ok] of blocks) {
        if (!ok) continue;
        if (!keys.has(b)) keys.set(b, (window.__readN = (window.__readN || 0) + 1));
        out.push([keys.get(b), b.textContent.replace(/\s+/g, ' ').trim()]);
      }
      return out;
    }, t);
    const now = new Set();
    for (const [key, text] of shown) {
      now.add(key);
      let r = runs.get(key);
      if (!r) runs.set(key, (r = { text, words: 0, start: null, best: 0, bestFrom: t, from: t }));
      r.words = Math.max(r.words, text.split(' ').filter(Boolean).length);
      if (text.length > r.text.length) r.text = text;
      if (r.start === null) r.start = t;
    }
    for (const [key, r] of runs) if (!now.has(key)) close(r, t);
  }
  for (const r of runs.values()) close(r, last + STEP);
  if (plan.lesson) await page.evaluate(() => window.wildflower.kinetic.config({ mode: window.__checkMode }));
  const out = [];
  for (const r of runs.values()) {
    const needs = Math.max(1.5, 0.5 + 0.375 * r.words) + (FIGURE.test(r.text) ? 1 : 0);
    // Within half a sample of the time it needs counts as enough.
    if (r.best + STEP / 2 < needs) out.push({ text: r.text.length > 70 ? r.text.slice(0, 67) + '...' : r.text, words: r.words, held: r.best, from: r.bestFrom, needs, first: r.from });
  }
  return out.sort((a, b) => a.first - b.first);
}

// --lesson: each step entered with go() in interactive mode, waited on to
// its hold, and reported with the console lines it printed and a still.
async function walkLesson(page, still, lines, fold) {
  const info = await page.evaluate(() => {
    const k = window.wildflower.kinetic, s = window.wildflower.getStore('kinetic');
    k.pause();
    k.config({ mode: 'interactive' });
    if (s.mode !== 'interactive') return { error: 'the page stays in video mode (a renderer runtime on it, or a render capturing), so it has no lesson to walk' };
    if (!s.stepCount) return { error: 'the page has no steps (a clip with an id and data-step)' };
    // Every hold, as the store reports it: the step and the time.
    window.__checkHolds = [];
    s.subscribe('waiting', (v) => { if (v) window.__checkHolds.push({ i: s.stepIndex, t: s.time, can: s.canAdvance }); });
    return { count: s.stepCount };
  });
  if (info.error) return info;
  const steps = [];
  const defs = await page.evaluate(() => window.__checkSteps || {});
  for (let i = 0; i < info.count; i++) {
    const mark = lines.length;
    const { id, length } = await page.evaluate((i) => {
      window.__checkHolds = [];
      window.wildflower.kinetic.go(i);
      const s = window.wildflower.getStore('kinetic');
      return { id: s.step, length: s.stepLength };
    }, i);
    const def = defs[id] || {};
    const limit = (length + 5) * 1000, start = Date.now();
    let hold = null, left = false;
    while (Date.now() - start < limit) {
      const r = await page.evaluate((i) => {
        const s = window.wildflower.getStore('kinetic');
        return { hold: window.__checkHolds.find((h) => h.i === i) || null, index: s.stepIndex, playing: s.playing };
      }, i);
      if (r.hold) { hold = r.hold; break; }
      if (r.index > i || (r.index < 0 && !r.playing)) { left = true; break; }
      await page.waitForTimeout(25);
    }
    const s = { index: i, id, until: def.until || null, held: !!hold, playsOn: !hold && left && def.wait === false, waited: (Date.now() - start) / 1000, lines: [] };
    if (hold) {
      s.time = hold.t;
      s.waits = !!def.until && !hold.can;
      s.still = await still('step-' + String(i + 1).padStart(2, '0') + '-' + id + '.png');
    }
    // Lines that arrive a moment after the hold still belong to the step.
    await page.waitForTimeout(100);
    s.lines = lines.slice(mark);
    s.printed = fold(mark, lines.length);
    steps.push(s);
  }
  return { steps };
}
