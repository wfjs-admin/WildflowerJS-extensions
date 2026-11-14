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
 *   --no-layout                                     skip the layout pass (below)
 *   --pace lively                                   measure the pace against the dial (below)
 *   --strip                                         with --frames, the frames tiled into strip.png
 *   --seam                                          the loop's seam: the last frame to frame 0 (below)
 *   --jumps                                         every pair of frames, for a sudden pop (below)
 *   --diff 16,17                                    the change between two frames, and where
 *   --isolate '#bleed,#faces circle'                each selector hidden in turn over the pair (below)
 *   --view render                                   which view to check: render (default), the
 *                                                   video's, with data-viewmode="render" shown;
 *                                                   live, the playing page's; or both, each in turn
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
 * The layout pass, on the reading pass's walk, measures the same blocks
 * against style.md's rules, each line of text by its box less 15% top and
 * bottom (about where its ink is), leaving out a line covered by something
 * that paints above it. It lists, under "layout:", a block outside the safe
 * area (5% of the frame's width and height on every side) while it is at
 * rest, a block past the frame's own edge ("cut off"), and two blocks whose
 * lines overlap, each when it lasts 0.2 s or more; and a block under its
 * contrast floor, 4.5:1, or 3:1 at 48 px and up, measured at the middle of
 * its longest stretch on screen: the block is captured as it is and with
 * its text made transparent, the pixels that change are its letters, and
 * the ratio is taken at its worst tenth of them against what is behind
 * each, so text over an image or a gradient is measured at its worst point.
 * The list does not fail the run: text kept in the margin, or a hint grayed
 * on purpose, is the author's call.
 *
 * The console lines are printed after the report. An error that comes
 * again with the same message and stack, from many seeks, is printed once,
 * where it first came, with its count ("× 37"). check() counts errors only
 * while it seeks, so the run also fails on an uncaught error or unhandled
 * rejection at any time, and on a console error in the framework's or an
 * extension's own form ([WildflowerJS], [WF-238], [TH-101], [3D-102]); an
 * author's own console error is printed and does not fail it.
 *
 * --pace calm|lively|bold: after the reading pass, the composition is sought
 * at every frame in video mode and the root captured small (an eighth of
 * its size, through Chrome's own capture), and each frame is compared with
 * the one before it as the mean change in brightness, 0 to 255. It prints
 * the share of frames near still (a change under 1), the snaps a minute
 * (peaks of change over 8, at least 0.3 s apart), the longest stretch near
 * still, the range of the frames' brightness, and, from a frame every half
 * second, the share in smooth ramps (light and shading: a gradient of 4 to
 * 60 after a [1,2,1] blur and a Sobel) and the tones in use (bins of 4
 * levels holding 0.4% of the frame), each beside the dial's target from
 * references/directions.md, and marks each that misses it. The
 * motion blur of a render is not in these frames, so a snap reads a little
 * sharper here than in the MP4. It does not fail the run: the pace is the
 * author's call, made against the numbers.
 *
 * --seam, --jumps, --diff and --isolate, after the pace: the composition is
 * sought in video mode and the root captured, each frame to brightness, and
 * a pair of frames is compared as the mean change, 0 to 255, with the box
 * of the pixels that changed by more than 24 levels, in the composition's
 * pixels. A pair is a jump when its change is over 2 and over three times
 * the usual change around it. --seam compares the last frame with frame 0,
 * as a loop plays them, against the larger of the pairs either side;
 * --jumps every pair from frame 0 to the last, against the median of the
 * three pairs either side, so a frame that pops in and out is found as well
 * as a cut; --diff the two frames given.
 * --isolate takes the pair from --diff, else the largest jump --seam or
 * --jumps found, and captures it again with each selector hidden in turn
 * (visibility: hidden), printing the change left and the share of it gone:
 * the selector that takes the change away is the layer that pops. A
 * selector is a CSS selector without a comma. None of these fails the run:
 * a cut is a jump too, and not every piece loops.
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
const VALUED = ['--samples', '--timeout', '--root', '--frames', '--out', '--pace', '--diff', '--isolate', '--view'];
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
const layout = !args.includes('--no-layout');
const pace = opt('pace');
if (args.includes('--pace') && !['calm', 'lively', 'bold'].includes(pace)) { console.error('--pace takes calm, lively or bold'); process.exit(2); }
const seam = args.includes('--seam');
const jumps = args.includes('--jumps');
const strip = args.includes('--strip');
const diffRaw = opt('diff');
const diff = diffRaw === undefined ? null : String(diffRaw).split(',').map((x) => x.trim());
if (args.includes('--diff') && !(diff && diff.length === 2 && diff.every((x) => /^\d+$/.test(x)))) { console.error('--diff takes two frame numbers, 0 or more, separated by a comma (16,17)'); process.exit(2); }
const isolateRaw = opt('isolate');
const isolate = isolateRaw === undefined ? null : String(isolateRaw).split(',').map((x) => x.trim()).filter(Boolean);
if (args.includes('--isolate') && !(isolate && isolate.length)) { console.error("--isolate takes CSS selectors separated by commas ('#bleed,#faces circle')"); process.exit(2); }
const view = opt('view', 'render');
if (!['render', 'live', 'both'].includes(view)) { console.error('--view takes render, live or both'); process.exit(2); }
const USAGE = 'usage: node check.cjs <url | path/to/index.html> [--root dir] [--samples 30] [--timeout 30] [--frames 0,2.5,5 | --frames 12] [--strip] [--lesson] [--no-reading] [--no-layout] [--pace calm|lively|bold] [--seam] [--jumps] [--diff 16,17] [--isolate sel,sel] [--view render|live|both] [--out dir]';
if (!target) { console.error(USAGE); process.exit(2); }
// --view both: the whole check once per view, each in its own run, the
// frames of each in a folder of the view's name; the worse exit wins.
if (view === 'both') {
  const { spawnSync } = require('child_process');
  let worst = 0;
  for (const v of ['render', 'live']) {
    console.log('== view: ' + v + ' ==');
    const rest = args.map((a, i) => (args[i - 1] === '--view' ? v : a));
    const r = spawnSync(process.execPath, [__filename, ...rest], { stdio: 'inherit', env: Object.assign({}, process.env, { KINETIC_CHECK_BOTH: '1' }) });
    worst = Math.max(worst, r.status === null ? 2 : r.status);
  }
  process.exit(worst);
}
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
if (strip && !frames) { console.error('--strip tiles the frames --frames saves; give --frames too'); process.exit(2); }

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
  if (process.env.KINETIC_CHECK_BOTH) outDir = path.join(outDir, view);

  const chromium = loadPlaywright();
  const { browser, name } = await launch(chromium);
  console.log('browser: ' + name);
  console.log('view: ' + view);
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  // The view held for the whole run, set before the page's scripts run.
  await page.addInitScript((v) => { self.__KINETIC_VIEW = v; }, view);
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
  let placed = null;         // the layout pass's findings
  let paced = null;          // the pace pass's measures
  let moved = null;          // --seam, --jumps, --diff and --isolate's findings
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

    // The window grown to hold the whole root, where the page lays it out
    // (a 1920 by 1080 stage with no bar, a stage below a header): the
    // passes hit-test and capture in the window, and a point outside it
    // hits nothing and captures nothing.
    if (checked) await holdRoot(page);

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
      const saved = [];
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
        saved.push({ f, file });
      }
      if (strip) console.log('strip: ' + await stripOf(page, saved, path.join(outDir, 'strip.png')));
      await page.evaluate(() => window.wildflower.kinetic.config({ mode: window.__checkMode }));
    }

    if (checked && (reading || layout)) {
      const text = await readingPass(page, layout);
      if (reading) short = text.short;
      placed = text.layout;
    }
    if (checked && pace) paced = await pacePass(page);
    if (checked && (seam || jumps || diff || isolate)) moved = await motionPass(page, { seam, jumps, diff: diff && diff.map(Number), isolate });

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

  if (placed) {
    if (!placed.length) console.log('layout: every block of text sits inside the safe area, clear of other text, at its contrast');
    else {
      console.log('layout: ' + placed.length + ' thing' + (placed.length === 1 ? '' : 's') + ' to look at (text inside the safe area, 5% of the frame on every side, while at rest; no text over text; contrast 4.5:1, 3:1 at 48 px and up)');
      const span = (f) => ' from ' + f.from.toFixed(1) + ' s for ' + f.held.toFixed(1) + ' s';
      for (const f of placed) {
        if (f.kind === 'cut') console.log('  cut off: "' + f.text + '" ' + f.px + ' px past the frame\'s ' + f.edge + ' edge' + span(f));
        else if (f.kind === 'safe') console.log('  outside the safe area: "' + f.text + '" ' + f.px + ' px past the ' + f.margin + ' px ' + f.edge + ' margin' + span(f));
        else if (f.kind === 'over') console.log('  text over text: "' + f.text + '" and "' + f.other + '", ' + f.w + ' by ' + f.h + ' px' + span(f));
        else console.log('  contrast: "' + f.text + '" ' + f.ratio.toFixed(1) + ':1 at ' + f.from.toFixed(1) + ' s (' + f.size + ' px), needs ' + f.needs + ':1');
      }
    }
  }

  if (paced) printPace(paced, pace);
  if (moved) printMotion(moved);

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

// The window made large enough that the root, scrolled to the top, lies
// inside it: never smaller than 1280 by 720, and measured again after each
// change, since a fitted stage follows the window.
async function holdRoot(page) {
  for (let i = 0; i < 3; i++) {
    const need = await page.evaluate(() => {
      scrollTo(0, 0);
      const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
      const r = root.getBoundingClientRect();
      return { w: Math.ceil(r.right + scrollX), h: Math.ceil(r.bottom + scrollY), iw: innerWidth, ih: innerHeight };
    });
    if (need.w <= need.iw && need.h <= need.ih) return;
    await page.setViewportSize({ width: Math.max(1280, need.w, need.iw), height: Math.max(720, need.h, need.ih) });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
}

// A figure the eye has to take in: a number of three digits or more, with
// its separators (498, 4.07, 24,318).
const FIGURE = /\d[\d,.]*\d[\d,.]*\d/;

// The reading pass: the blocks of text whose longest stretch fully on
// screen is shorter than the BBC subtitle rate allows (at least 1.5 s, and
// 0.5 s plus 0.375 s a word, with 1 s more for a figure), in order of first
// showing. With `layout`, the same walk also finds the layout pass's
// findings (below), returned as `layout`.
async function readingPass(page, layout) {
  const STEP = 0.1;
  const plan = await page.evaluate(() => {
    const k = window.wildflower.kinetic, s = window.wildflower.getStore('kinetic');
    // A lesson is read as its video, in video mode, as --frames sees it; a
    // page with no steps is the same in both modes, so its mode is left as
    // it is (video mode would wake KN-151 for a scene with tick()).
    k.pause();
    const lesson = s.stepCount > 0;
    if (lesson) { window.__checkMode = k.config().mode; k.config({ mode: 'video' }); }
    const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
    const R = root.getBoundingClientRect();
    const width = Number(root.getAttribute('data-width')) || R.width;
    return { duration: s.duration, fps: s.fps, lesson, width, height: Number(root.getAttribute('data-height')) || R.height * width / R.width };
  });
  const last = Math.max(0, plan.duration - 1 / plan.fps);
  const runs = new Map();   // key -> { text, words, start, best, bestFrom, from }
  const place = layout ? placement(plan.width, plan.height, STEP) : null;
  const close = (r, t) => { if (r.start !== null) { const held = t - r.start; if (held > r.best) { r.best = held; r.bestFrom = r.start; } r.start = null; } };
  for (let t = 0; t <= last + 1e-6; t += STEP) {
    const shown = await page.evaluate(async ([t, layout]) => {
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
      const blocks = new Map();   // block -> { ok, nodes }
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const p = n.parentElement;
        if (!p || p.closest('[data-kinetic-finish], [data-kinetic-preview], script, style, template')) continue;
        const b = blockOf(p);
        const e = blocks.get(b) || { ok: true, nodes: [] };
        e.ok = e.ok && visible(p);
        e.nodes.push(n);
        blocks.set(b, e);
      }
      // For the layout pass, each line of a block's own text as a box
      // [left, top, right, bottom] in the composition's pixels.
      const els = window.__readEls || (window.__readEls = new Map());
      const s = (Number(root.getAttribute('data-width')) || R.width) / R.width;
      const range = document.createRange();
      // Something above the text that paints: a background, an image, a
      // canvas, a video or an SVG shape, mostly opaque.
      const paints = (e) => {
        const cs = getComputedStyle(e);
        if (parseFloat(cs.opacity) < 0.5 || cs.visibility === 'hidden') return false;
        if (/^(IMG|CANVAS|VIDEO)$/.test(e.tagName) || e instanceof SVGGeometryElement) return true;
        // An image paints; a gradient with a stop mostly transparent (a
        // vignette, a light leak, a scrim over part of the frame) is not
        // taken to cover what is under it, since its clear part shows the text.
        if (cs.backgroundImage !== 'none') {
          if (/url\(/.test(cs.backgroundImage)) return true;
          const stops = cs.backgroundImage.match(/rgba?\([^)]*\)|transparent/g) || [];
          if (!stops.some((c) => c === 'transparent' || (c.split(',').length === 4 && parseFloat(c.split(',')[3]) < 0.5))) return true;
        }
        const a = /rgba?\(([^)]*)\)/.exec(cs.backgroundColor);
        return !!a && (a[1].split(',').length < 4 || parseFloat(a[1].split(',')[3]) > 0.5);
      };
      // A line is covered when, at each of three points along it, something
      // that paints lies above its block, as a scene growing over the last
      // one covers it. A block the hit test skips (pointer-events: none)
      // counts as uncovered.
      // A line partly covered (a wipe growing over it) is cut to the
      // stretch that shows, from sixteen points along it.
      const coveredAt = (b, x, y) => {
        const stack = document.elementsFromPoint(x, y);
        const i = stack.findIndex((e) => e === b || b.contains(e));
        return i >= 0 && stack.slice(0, i).some((e) => !e.contains(b) && paints(e));
      };
      const uncovered = (b, r) => {
        const y = (r.top + r.bottom) / 2;
        const n = [0.25, 0.5, 0.75].filter((f) => coveredAt(b, r.left + f * r.width, y)).length;
        if (n === 0) return r;
        if (n === 3) return null;
        const step = r.width / 16;
        let a = Infinity, z = -Infinity;
        for (let i = 0; i < 16; i++) {
          const x = r.left + (i + 0.5) * step;
          if (!coveredAt(b, x, y)) { a = Math.min(a, x); z = Math.max(z, x); }
        }
        return z - a >= 1 ? { left: a, top: r.top, right: z, bottom: r.bottom, width: z - a, height: r.height } : null;
      };
      // A text node's line boxes as far as they show: each cut to the boxes
      // of the ancestors below the root that clip (overflow other than
      // visible), and, under a clip-path, kept only where a hit test at one
      // of three points along it reaches the text (pointer-events made auto
      // on it for the test). The root's own clip is the frame's edge, which
      // the layout pass measures, so it is left alone.
      const shownRects = (n) => {
        let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity, clipped = false;
        for (let a = n.parentElement; a && a !== root; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.clipPath !== 'none') clipped = true;
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
            const c = a.getBoundingClientRect();
            if (cs.overflowX !== 'visible') { x0 = Math.max(x0, c.left); x1 = Math.min(x1, c.right); }
            if (cs.overflowY !== 'visible') { y0 = Math.max(y0, c.top); y1 = Math.min(y1, c.bottom); }
          }
        }
        range.selectNodeContents(n);
        const out = [];
        for (const r of range.getClientRects()) {
          const left = Math.max(r.left, x0), top = Math.max(r.top, y0), right = Math.min(r.right, x1), bottom = Math.min(r.bottom, y1);
          if (right - left < 1 || bottom - top < 1) continue;
          out.push({ left, top, right, bottom, width: right - left, height: bottom - top });
        }
        if (!clipped || !out.length) return out;
        const p = n.parentElement, was = p.style.getPropertyValue('pointer-events'), pri = p.style.getPropertyPriority('pointer-events');
        p.style.setProperty('pointer-events', 'auto', 'important');
        // Sixteen points along the line's middle: the line is cut to the
        // stretch from the first point that reaches the text to the last, so
        // a wipe's clip-path leaves the part it shows.
        const hit = [];
        for (const r of out) {
          const y = (r.top + r.bottom) / 2, step = r.width / 16;
          let a = Infinity, b = -Infinity;
          for (let i = 0; i < 16; i++) {
            const x = r.left + (i + 0.5) * step;
            if (document.elementsFromPoint(x, y).some((e) => e === p || p.contains(e))) { a = Math.min(a, x); b = Math.max(b, x); }
          }
          if (b - a >= 1) hit.push({ left: a, top: r.top, right: b, bottom: r.bottom, width: b - a, height: r.height });
        }
        if (was) p.style.setProperty('pointer-events', was, pri); else p.style.removeProperty('pointer-events');
        return hit;
      };
      const linesOf = (b, rects) => {
        const out = [];
        {
          for (const whole of rects) {
            const r = uncovered(b, whole);
            if (!r) continue;
            // The line's box is the font's whole height; its ink sits
            // inside, so 15% comes off the top and the bottom.
            const inset = 0.15 * r.height;
            out.push([(r.left - R.left) * s, (r.top + inset - R.top) * s, (r.right - R.left) * s, (r.bottom - inset - R.top) * s].map((v) => Math.round(v * 10) / 10));
          }
        }
        return out;
      };
      const out = [];
      for (const [b, e] of blocks) {
        if (!e.ok) continue;
        // A block a mask or a clip-path hides entirely is not on screen.
        const rects = [].concat(...e.nodes.map(shownRects));
        if (!rects.length) continue;
        if (!keys.has(b)) { keys.set(b, (window.__readN = (window.__readN || 0) + 1)); els.set(keys.get(b), b); }
        out.push([keys.get(b), b.textContent.replace(/\s+/g, ' ').trim(), layout ? linesOf(b, rects) : null]);
      }
      return out;
    }, [t, layout]);
    if (place) place.sample(t, shown);
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
  // Contrast, for each block at the middle of its longest stretch on screen.
  const low = [];
  if (place) {
    for (const [key, r] of runs) {
      const at = r.bestFrom + Math.floor(r.best / STEP / 2) * STEP;
      const c = await contrastOf(page, key, at, plan.width);
      if (c && c.ratio < c.needs) low.push({ key, text: r.text, at, ratio: c.ratio, needs: c.needs, size: c.size });
    }
  }
  if (plan.lesson) await page.evaluate(() => window.wildflower.kinetic.config({ mode: window.__checkMode }));
  const out = [];
  for (const r of runs.values()) {
    const needs = Math.max(1.5, 0.5 + 0.375 * r.words) + (FIGURE.test(r.text) ? 1 : 0);
    // Within half a sample of the time it needs counts as enough.
    if (r.best + STEP / 2 < needs) out.push({ text: clip(r.text), words: r.words, held: r.best, from: r.bestFrom, needs, first: r.from });
  }
  return { short: out.sort((a, b) => a.first - b.first), layout: place ? place.findings(runs, low) : null };
}

const clip = (text) => (text.length > 70 ? text.slice(0, 67) + '...' : text);

// The layout pass, beside the reading pass on its walk: text outside the
// safe area (5% of the frame's width and height on every side, style.md)
// while it is at rest, text past the frame's own edge, and text over other
// text, each when it lasts 0.2 s or more (3 samples 0.1 s apart), and text
// under its contrast floor (4.5:1, and 3:1 at 48 px and up) at the middle
// of its longest stretch on screen. Moving text is left out of the safe
// area's list, so a block sliding in from outside the frame is not listed.
const LAYOUT_HOLD = 3;
function placement(W, H, step) {
  const mx = 0.05 * W, my = 0.05 * H;
  const prev = new Map();     // key -> the block's box at the sample before
  const open = new Map();     // finding key -> { n, from, worst, ... } for the run in progress
  const found = new Map();    // finding key -> the longest run that lasted LAYOUT_HOLD samples
  const boxOf = (lines) => lines.reduce((b, l) => [Math.min(b[0], l[0]), Math.min(b[1], l[1]), Math.max(b[2], l[2]), Math.max(b[3], l[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const seen = new Set();
  const note = (id, t, amount, extra) => {
    seen.add(id);
    const o = open.get(id);
    if (o) { o.n++; o.to = t; o.worst = Math.max(o.worst, amount); }
    else open.set(id, Object.assign({ n: 1, from: t, to: t, worst: amount }, extra));
  };
  const settle = () => {
    for (const [id, o] of open) {
      if (seen.has(id)) continue;
      if (o.to - o.from >= (LAYOUT_HOLD - 1) * step - 1e-6) { const f = found.get(id); if (!f || o.to - o.from > f.to - f.from) found.set(id, o); }
      open.delete(id);
    }
    seen.clear();
  };
  // The farthest a box reaches past the edges [left, top, right, bottom] of
  // a rectangle, and which edge.
  const past = (b, x0, y0, x1, y1) => {
    const d = [x0 - b[0], y0 - b[1], b[2] - x1, b[3] - y1];
    const i = d.indexOf(Math.max(...d));
    return { px: d[i], edge: ['left', 'top', 'right', 'bottom'][i] };
  };
  return {
    sample(t, shown) {
      const boxes = [];
      for (const [key, , lines] of shown) {
        if (!lines || !lines.length) continue;
        const b = boxOf(lines), p = prev.get(key);
        boxes.push([key, lines]);
        const still = p && b.every((v, i) => Math.abs(v - p[i]) < 1);
        prev.set(key, b);
        if (!still) continue;
        // At rest is known a sample late: the block was there at the sample before.
        const cut = past(b, 0, 0, W, H), out = past(b, mx, my, W - mx, H - my);
        if (cut.px >= 1) note('cut ' + key, t, cut.px, { kind: 'cut', key, edge: cut.edge, from: t - step });
        else if (out.px >= 1) note('safe ' + key, t, out.px, { kind: 'safe', key, edge: out.edge, from: t - step });
      }
      for (const key of [...prev.keys()]) if (!shown.some((s) => s[0] === key)) prev.delete(key);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        let w = 0, h = 0;
        for (const a of boxes[i][1]) for (const b of boxes[j][1]) {
          const iw = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), ih = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
          if (iw >= 2 && ih >= 2 && iw * ih > w * h) { w = iw; h = ih; }
        }
        if (w) { const [a, b] = [boxes[i][0], boxes[j][0]].sort((x, y) => x - y); note('over ' + a + ' ' + b, t, w * h, { kind: 'over', key: a, other: b, w, h }); }
      }
      settle();
    },
    findings(runs, low) {
      settle();   // nothing is seen after the last sample, so this closes every run still open
      const text = (key) => clip((runs.get(key) || { text: '' }).text);
      const out = [];
      for (const f of found.values()) {
        const held = f.to + step - f.from;
        if (f.kind === 'over') out.push({ kind: f.kind, text: text(f.key), other: text(f.other), w: Math.round(f.w), h: Math.round(f.h), from: f.from, held });
        else out.push({ kind: f.kind, text: text(f.key), edge: f.edge, px: Math.round(f.worst), margin: Math.round(f.edge === 'left' || f.edge === 'right' ? mx : my), from: f.from, held });
      }
      for (const c of low) out.push({ kind: 'contrast', text: clip(c.text), ratio: c.ratio, needs: c.needs, size: c.size, from: c.at });
      return out.sort((a, b) => a.from - b.from);
    },
  };
}

// A block's contrast at time t: the root captured around the block's own
// lines twice, as it is and with its text made transparent; the pixels that
// change are its letters, and the second capture is what is behind each.
// The text's color is the median of the letters' cores (the quarter of them
// that changed most, where the edge's smoothing does not reach), and the
// block's contrast the WCAG ratio at its worst tenth of letter pixels, so a
// gradient or an image behind it is measured at its worst. null for a block
// with too few letter pixels to measure.
async function contrastOf(page, key, t, W) {
  await seekTo(page, t);
  const at = await page.evaluate(([key, W]) => {
    const el = window.__readEls.get(key);
    const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
    if (!el || !el.isConnected) return null;
    const R = root.getBoundingClientRect(), s = W / R.width;
    // The block's own text, as the reading pass found it.
    const own = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim() || !n.parentElement) continue;
      let b = n.parentElement;
      const svgText = b.closest('text');
      if (svgText && el.contains(svgText)) b = svgText;
      else while (b !== root && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
      if (b === el) own.push(n);
    }
    if (!own.length) return null;
    const range = document.createRange(), lines = [];
    for (const n of own) { range.selectNodeContents(n); for (const r of range.getClientRects()) if (r.width >= 1 && r.height >= 1) lines.push([r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY]); }
    if (!lines.length) return null;
    // Its size in the composition's pixels: the computed size times the
    // scale the element is drawn at.
    const p = own[0].parentElement, cs = parseFloat(getComputedStyle(p).fontSize);
    let k = s;
    if (p instanceof SVGElement && p.getScreenCTM()) { const m = p.getScreenCTM(); k = Math.hypot(m.a, m.b) * s; }
    else if (p.offsetWidth) k = p.getBoundingClientRect().width / p.offsetWidth * s;
    const x0 = Math.min(...lines.map((l) => l[0])) - 2, y0 = Math.min(...lines.map((l) => l[1])) - 2;
    const x1 = Math.max(...lines.map((l) => l[2])) + 2, y1 = Math.max(...lines.map((l) => l[3])) + 2;
    return { box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, lines, size: cs * k, scale: 2 * s };
  }, [key, W]);
  if (!at || at.box.width < 2 || at.box.height < 2) return null;
  const cdp = await page.context().newCDPSession(page);
  const grab = async () => {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: Object.assign({ scale: at.scale }, at.box) });
    return pngPixels(Buffer.from(shot.data, 'base64'));
  };
  const HIDE = '[data-kinetic-finish], [data-kinetic-preview], [data-kinetic-speaker], [data-kinetic-paused] { visibility: hidden !important; }'
    + ' [data-kinetic-check-text], [data-kinetic-check-text] * { color: transparent !important; -webkit-text-fill-color: transparent !important; fill: transparent !important; stroke: transparent !important; }';
  await page.evaluate((css) => { const st = document.createElement('style'); st.id = '__kinetic-check-hide'; st.textContent = css; document.head.appendChild(st); }, HIDE);
  const shown = await grab();
  await page.evaluate((key) => window.__readEls.get(key).setAttribute('data-kinetic-check-text', ''), key);
  const behind = await grab();
  await page.evaluate((key) => { window.__readEls.get(key).removeAttribute('data-kinetic-check-text'); document.getElementById('__kinetic-check-hide').remove(); }, key);
  await cdp.detach();
  if (shown.w !== behind.w || shown.h !== behind.h) return null;
  const { w, h } = shown, k = shown.w / at.box.width;
  const inLine = (x, y) => at.lines.some((l) => x >= (l[0] - at.box.x) * k && x < (l[2] - at.box.x) * k && y >= (l[1] - at.box.y) * k && y < (l[3] - at.box.y) * k);
  const letters = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    const d = Math.max(Math.abs(shown.rgb[i] - behind.rgb[i]), Math.abs(shown.rgb[i + 1] - behind.rgb[i + 1]), Math.abs(shown.rgb[i + 2] - behind.rgb[i + 2]));
    if (d > 16 && inLine(x, y)) letters.push([i, d]);
  }
  if (letters.length < 20) return null;
  const cores = letters.slice().sort((a, b) => b[1] - a[1]).slice(0, Math.max(5, Math.floor(letters.length / 4)));
  const med = (c) => { const v = cores.map(([i]) => shown.rgb[i + c]).sort((a, b) => a - b); return v[v.length >> 1]; };
  const ink = luminance(med(0), med(1), med(2));
  const ratios = letters.map(([i]) => { const g = luminance(behind.rgb[i], behind.rgb[i + 1], behind.rgb[i + 2]); return (Math.max(ink, g) + 0.05) / (Math.min(ink, g) + 0.05); }).sort((a, b) => a - b);
  const ratio = Math.round(ratios[Math.floor(ratios.length / 10)] * 10) / 10;
  return { ratio, needs: at.size >= 48 ? 3 : 4.5, size: Math.round(at.size) };
}

// WCAG 2's relative luminance of an sRGB color, 0 to 1.
function luminance(r, g, b) {
  const c = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
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

// The dial's targets (references/directions.md, "The expression dial"):
// [low, high] for the share near still, the snaps a minute, the longest
// stretch near still in seconds, and the brightness range (p95 - p5).
const DIAL = {
  calm:   { still: [0.5, 1], snaps: [0, 15], longest: [0, 7.5], range: [0, 255], ramps: [0, 1], tones: [0, 64] },
  lively: { still: [0.35, 0.6], snaps: [20, 60], longest: [0, 3.5], range: [120, 255], ramps: [0.15, 1], tones: [14, 64] },
  bold:   { still: [0.25, 0.4], snaps: [45, 120], longest: [0, 2.5], range: [170, 255], ramps: [0.15, 1], tones: [14, 64] },
};

// A PNG from Chrome's capture, decoded to brightness: 8-bit RGB or RGBA,
// not interlaced, which is what the capture writes.
function pngLuma(buf) {
  const { w, h, rgb } = pngPixels(buf), out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = 0.299 * rgb[i * 3] + 0.587 * rgb[i * 3 + 1] + 0.114 * rgb[i * 3 + 2];
  return out;
}

// The same PNG decoded to { w, h, rgb }, three bytes a pixel.
function pngPixels(buf) {
  const zlib = require('zlib');
  let p = 8, w = 0, h = 0, ch = 4; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ch = d[9] === 2 ? 3 : 4; }
    else if (type === 'IDAT') idat.push(d);
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 3);
  let prev = Buffer.alloc(stride), o = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[o++], line = Buffer.from(raw.subarray(o, o + stride)); o += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = line[x];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) out[(y * w + x) * 3 + c] = line[x * ch + c];
    prev = line;
  }
  return { w, h, rgb: out };
}

// A frame's depth of finish, from its brightness at w by h: the share of
// pixels in a smooth ramp (a gradient magnitude of 4 to 60 after a [1,2,1]
// blur and a 3x3 Sobel, the border left out) and the tones in use (bins of
// 4 levels holding 0.4% of the frame or more). Flat fills give few tones and
// almost no ramps; light, shading and layers give many.
function finish(l, w, h) {
  const b = new Float32Array(w * h), t = new Float32Array(w * h);
  const at = (a, x, y) => a[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = (at(l, x - 1, y) + 2 * at(l, x, y) + at(l, x + 1, y)) / 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = (at(t, x, y - 1) + 2 * at(t, x, y) + at(t, x, y + 1)) / 4;
  let ramps = 0, inner = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = (dx, dy) => b[(y + dy) * w + x + dx];
    const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
    const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
    const m = Math.hypot(gx, gy);
    inner++; if (m >= 4 && m < 60) ramps++;
  }
  const bins = new Array(64).fill(0);
  for (const v of l) bins[Math.min(63, Math.max(0, Math.round(v)) >> 2)]++;
  return { ramps: ramps / inner, tones: bins.filter((c) => c >= 0.004 * l.length).length };
}

async function pacePass(page) {
  const plan = await page.evaluate(() => {
    const k = window.wildflower.kinetic, s = window.wildflower.getStore('kinetic');
    window.__paceMode = k.config().mode;
    k.pause(); k.config({ mode: 'video' });
    const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
    const r = root.getBoundingClientRect();
    return { fps: s.fps, n: Math.max(1, Math.round(s.duration * s.fps)), box: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } };
  });
  const cdp = await page.context().newCDPSession(page);
  const scale = 240 / plan.box.width;
  const diffs = [], lumas = [], finishes = [];
  let prev = null;
  for (let f = 0; f < plan.n; f++) {
    await page.evaluate(async (t) => {
      const pending = [];
      window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t, waitUntil: (p) => pending.push(p) } }));
      if (pending.length) await Promise.all(pending);
      else { window.wildflower.kinetic.seek(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
    }, f / plan.fps);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: Object.assign({ scale }, plan.box) });
    const png = Buffer.from(shot.data, 'base64'), l = pngLuma(png);
    if (f % Math.max(1, Math.round(plan.fps / 2)) === 0) finishes.push(finish(l, png.readUInt32BE(16), png.readUInt32BE(20)));
    let m = 0; for (const v of l) m += v; lumas.push(m / l.length);
    if (prev) { let d = 0; for (let i = 0; i < l.length; i++) d += Math.abs(l[i] - prev[i]); diffs.push(d / l.length); }
    prev = l;
  }
  await page.evaluate(() => window.wildflower.kinetic.config({ mode: window.__paceMode }));
  const secs = plan.n / plan.fps, gap = Math.round(plan.fps * 0.3);
  const still = diffs.filter((d) => d < 1).length / Math.max(1, diffs.length);
  let snaps = 0, lastPeak = -Infinity;
  for (let i = 1; i < diffs.length - 1; i++) {
    if (diffs[i] > 8 && diffs[i] >= diffs[i - 1] && diffs[i] >= diffs[i + 1] && i - lastPeak >= gap) { snaps++; lastPeak = i; }
  }
  let longest = 0, run = 0, longestAt = 0;
  const body = Math.max(0, diffs.length - Math.round(plan.fps * 4.5));   // the end card aside
  for (let i = 0; i < body; i++) { if (diffs[i] < 1) { run++; if (run > longest) { longest = run; longestAt = i - run + 1; } } else run = 0; }
  const sorted = lumas.slice().sort((a, b) => a - b), q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { secs, still, snaps: snaps / secs * 60, longest: longest / plan.fps, longestFrom: longestAt / plan.fps, range: q(0.95) - q(0.05),
    ramps: median(finishes.map((x) => x.ramps)), tones: median(finishes.map((x) => x.tones)) };
}

// --strip: the saved frames tiled into one PNG, each labelled with its frame
// number, at most 320 px wide a tile, laid out in the page on a canvas.
async function stripOf(page, saved, file) {
  const urls = saved.map((s) => ({ f: s.f, url: 'data:image/png;base64,' + fs.readFileSync(s.file).toString('base64') }));
  const data = await page.evaluate(async (urls) => {
    const imgs = await Promise.all(urls.map((u) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = u.url; })));
    const cols = Math.ceil(Math.sqrt(imgs.length)), rows = Math.ceil(imgs.length / cols);
    const k = Math.min(1, 320 / imgs[0].naturalWidth), w = Math.round(imgs[0].naturalWidth * k), h = Math.round(imgs[0].naturalHeight * k);
    const c = document.createElement('canvas'); c.width = cols * w; c.height = rows * h;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.font = 'bold 14px sans-serif'; g.textBaseline = 'top';
    imgs.forEach((img, i) => {
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      g.drawImage(img, x, y, w, h);
      const label = String(urls[i].f), tw = g.measureText(label).width;
      g.fillStyle = 'rgba(0, 0, 0, 0.7)'; g.fillRect(x + 4, y + 4, tw + 8, 20);
      g.fillStyle = '#fff'; g.fillText(label, x + 8, y + 7);
    });
    return c.toDataURL('image/png').split(',')[1];
  }, urls);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

// ---- --seam, --jumps, --diff and --isolate ----------------------------------

// A seek as check() makes it, in the mode the page is in.
async function seekTo(page, t) {
  await page.evaluate(async (t) => {
    const pending = [];
    window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: t, waitUntil: (p) => pending.push(p) } }));
    if (pending.length) await Promise.all(pending);
    else { window.wildflower.kinetic.seek(t); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
  }, t);
}

// The change between two frames' brightness at w by h: the mean change, 0
// to 255, and the box of the pixels that changed by more than 24 levels, in
// the composition's pixels (k of them to a captured one), or null.
function change(a, b, w, h, k) {
  let sum = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.abs(a[y * w + x] - b[y * w + x]);
    sum += d;
    if (d > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const box = x1 < 0 ? null : { x: Math.floor(x0 * k), y: Math.floor(y0 * k), width: Math.ceil((x1 - x0 + 1) * k), height: Math.ceil((y1 - y0 + 1) * k) };
  return { mean: sum / (w * h), box };
}

// A pair is a jump when its change is over 2 and over three times the
// larger of the changes either side of it: a pop, where motion around it is
// smooth. A cut is one too, and is the author's call.
const JUMP_FLOOR = 2, JUMP_RATIO = 3;
const isJump = (d, before, after) => d > JUMP_FLOOR && d > JUMP_RATIO * Math.max(before, after);
const where = (box) => (box ? ' at x ' + box.x + ', y ' + box.y + ', ' + box.width + ' by ' + box.height : '');

// The pass for the four options. Every frame is captured for --jumps, at
// 320 px wide; --seam, --diff and --isolate capture only the frames they
// compare, at 480. Nothing here fails the run: a cut is a jump too, and not
// every piece loops.
async function motionPass(page, o) {
  const plan = await page.evaluate(() => {
    const k = window.wildflower.kinetic, s = window.wildflower.getStore('kinetic');
    window.__motionMode = k.config().mode;
    k.pause(); k.config({ mode: 'video' });
    const root = document.querySelector('[data-root="true"]') || document.querySelector('[data-composition-id]');
    const r = root.getBoundingClientRect();
    return { fps: s.fps, n: Math.max(1, Math.round(s.duration * s.fps)), width: Number(root.getAttribute('data-width')) || r.width,
      box: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height } };
  });
  const cdp = await page.context().newCDPSession(page);
  const grab = async (f, px) => {
    await seekTo(page, f / plan.fps);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: Object.assign({ scale: px / plan.box.width }, plan.box) });
    const png = Buffer.from(shot.data, 'base64'), w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    return { l: pngLuma(png), w, h, k: plan.width / w };
  };
  const pairOf = async (a, b, px) => { const A = await grab(a, px), B = await grab(b, px); return change(A.l, B.l, A.w, A.h, A.k); };
  const out = { n: plan.n, fps: plan.fps };
  const last = plan.n - 1;
  let worst = null;   // the pair --isolate takes without --diff

  if (o.seam && plan.n >= 3) {
    const before = await pairOf(last - 1, last, 480), wrap = await pairOf(last, 0, 480), after = await pairOf(0, 1, 480);
    out.seam = { wrap, before: before.mean, after: after.mean, jump: isJump(wrap.mean, before.mean, after.mean) };
    if (out.seam.jump) worst = { a: last, b: 0, mean: wrap.mean };
  } else if (o.seam) out.seam = null;
  if (o.jumps) {
    const d = [];
    let prev = await grab(0, 320);
    for (let f = 1; f < plan.n; f++) { const cur = await grab(f, 320); d.push(change(prev.l, cur.l, cur.w, cur.h, cur.k)); prev = cur; }
    out.jumps = [];
    // Against the usual change around it, the median of the three pairs
    // either side, so a frame that pops in and out (two large changes in a
    // row) is found as well as a cut.
    for (let i = 0; i < d.length; i++) {
      const near = [];
      for (let j = Math.max(0, i - 3); j <= Math.min(d.length - 1, i + 3); j++) if (j !== i) near.push(d[j].mean);
      near.sort((x, y) => x - y);
      const usual = near.length ? (near[(near.length - 1) >> 1] + near[near.length >> 1]) / 2 : 0;
      if (isJump(d[i].mean, usual, 0)) {
        out.jumps.push({ a: i, b: i + 1, mean: d[i].mean, box: d[i].box, usual });
        if (!worst || d[i].mean > worst.mean) worst = { a: i, b: i + 1, mean: d[i].mean };
      }
    }
  }
  if (o.diff) {
    const [a, b] = o.diff.map((f) => Math.min(last, f));
    out.diff = Object.assign({ a, b }, await pairOf(a, b, 480));
    worst = { a, b, mean: out.diff.mean };
  }
  if (o.isolate) {
    if (!worst) out.isolate = { none: true };
    else {
      out.isolate = { a: worst.a, b: worst.b, mean: worst.mean, rows: [] };
      for (const sel of o.isolate) {
        const found = await page.evaluate((sel) => {
          let n = 0; try { n = document.querySelectorAll(sel).length; } catch (e) { return -1; }
          const s = document.createElement('style'); s.id = '__checkIsolate';
          s.textContent = sel + ' { visibility: hidden !important; }';
          document.head.appendChild(s);
          return n;
        }, sel);
        const d = found > 0 ? await pairOf(worst.a, worst.b, 480) : null;
        await page.evaluate(() => { const s = document.getElementById('__checkIsolate'); if (s) s.remove(); });
        out.isolate.rows.push({ sel, found, mean: d ? d.mean : null });
      }
    }
  }
  await page.evaluate(() => window.wildflower.kinetic.config({ mode: window.__motionMode }));
  return out;
}

function printMotion(r) {
  const at = (f) => 'frame ' + f + ' (' + (f / r.fps).toFixed(3) + ' s)';
  if (r.seam) {
    const s = r.seam;
    console.log('seam: the last frame to frame 0 changes ' + s.wrap.mean.toFixed(1) + ', the frames either side ' + s.before.toFixed(1) + ' and ' + s.after.toFixed(1)
      + (s.jump ? '  << a jump at the loop' + where(s.wrap.box) : ', smooth'));
  } else if (r.seam === null) console.log('seam: too few frames to compare');
  if (r.jumps) {
    if (!r.jumps.length) console.log('jumps: none; every change between frames is in line with the ones either side of it');
    else {
      console.log('jumps: ' + r.jumps.length + ' (a change over ' + JUMP_FLOOR + ' and over ' + JUMP_RATIO + ' times the usual change around it; a cut is one too)');
      for (const j of r.jumps) console.log('  ' + at(j.a) + ' to ' + j.b + ': ' + j.mean.toFixed(1) + ', usually ' + j.usual.toFixed(1) + where(j.box));
    }
  }
  if (r.diff) console.log('diff: ' + at(r.diff.a) + ' to frame ' + r.diff.b + ': ' + r.diff.mean.toFixed(1) + where(r.diff.box));
  if (r.isolate) {
    if (r.isolate.none) console.log('isolate: no pair to isolate; give --diff a,b, or --seam or --jumps that finds one');
    else {
      const i = r.isolate;
      console.log('isolate: ' + at(i.a) + ' to frame ' + i.b + ', a change of ' + i.mean.toFixed(1) + ', with each hidden in turn:');
      for (const row of i.rows) {
        if (row.found < 0) console.log("  '" + row.sel + "': not a selector");
        else if (!row.found) console.log("  '" + row.sel + "': matches nothing");
        else console.log("  '" + row.sel + "' (" + row.found + '): ' + row.mean.toFixed(1) + (i.mean > 0 ? ', ' + Math.round(100 * (1 - row.mean / i.mean)) + '% of the change gone' : ''));
      }
    }
  }
}

function printPace(r, dial) {
  const t = DIAL[dial], mark = (v, [lo, hi]) => (v < lo || v > hi ? '  << misses' : '');
  console.log('pace (' + dial + ', ' + r.secs.toFixed(1) + ' s):');
  console.log('  frames near still: ' + Math.round(r.still * 100) + '%, target ' + Math.round(t.still[0] * 100) + ' to ' + Math.round(t.still[1] * 100) + '%' + mark(r.still, t.still));
  console.log('  snaps a minute: ' + r.snaps.toFixed(0) + ', target ' + t.snaps[0] + ' to ' + t.snaps[1] + mark(r.snaps, t.snaps));
  console.log('  longest stretch near still: ' + r.longest.toFixed(1) + ' s from ' + r.longestFrom.toFixed(1) + ' s, target ' + t.longest[1] + ' s at most, the end card aside' + mark(r.longest, t.longest));
  console.log('  brightness range: ' + r.range.toFixed(0) + ', target ' + t.range[0] + ' or more' + mark(r.range, t.range));
  console.log('  smooth ramps (light and shading): ' + Math.round(r.ramps * 100) + '% of a frame, target ' + Math.round(t.ramps[0] * 100) + '% or more' + mark(r.ramps, t.ramps));
  console.log('  tones in use: ' + r.tones + ' a frame, target ' + t.tones[0] + ' or more' + mark(r.tones, t.tones));
}
