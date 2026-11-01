/**
 * Readiness: when frame 0 may be captured.
 *
 * HyperFrames waits on every promise in window.__hf.buildReady before it
 * publishes __renderReady, in a render and in preview. The extension
 * registers one, `kinetic`, that settles once
 *
 *   - the framework's first scan is done (wildflower.whenIdle),
 *   - the fonts are loaded (document.fonts.ready),
 *   - every query a scene names in waitFor has loaded (public state:
 *     isLoading false and lastSync not null),
 *   - every <img>, and every SVG <image> (such as the ones lottie-web's svg
 *     renderer draws), under a scene has decoded (a failed decode is not
 *     held against the render; HyperFrames has its own rules for images),
 *   - every audio clip's file is decoded and the level tables are built
 *     (audio.js), and
 *   - every footage clip has its metadata and first frame (footage.js;
 *     with the runtime on the page, which owns media, this is not waited
 *     for), and
 *   - the luma transitions' maps are drawn or fetched, the effects' <img>
 *     sources decoded, every Lottie animation handed to lottie() loaded
 *     (lottie.js) and every animated image decoded (images.js) (`extra`,
 *     from wf.js).
 *
 * A lazy <img> or <iframe> in the composition is made eager first, since a
 * hidden clip's clip-path keeps Chrome from loading one inside it.
 *
 * One run of readiness evaluates the page as it is when the run is made,
 * and holds nothing from one run to the next. The registered entry is one
 * run; wildflower.kinetic.ready() is another, and check() and render() each
 * begin with one, so check() fails exactly when render() rejects. A map or
 * an animated image that failed is fetched again by the next run; the
 * clips, scenes and queries are the ones on the page at that run, so a
 * source taken off the page fails nothing. Failures: a query that ended in
 * error (KN-131), a waitFor name that is no query (KN-133), an input that
 * fails its type or validator (KN-130, in any scene on the page), an audio
 * clip's file that fails to load or decode (KN-135), a footage clip's file
 * that fails, or a footage clip with no source (KN-138), a luma map that
 * fails (KN-117), a Lottie animation that fires data_failed (KN-180), an
 * animated image that cannot be fetched or decoded (KN-181). An error
 * without a code (one the browser threw) fails the run too. ready() rejects
 * with the first to come. The registered entry never rejects: the runtime
 * swallows a rejection and renders anyway, so on a failure it is held open
 * instead, and the render stops at its readiness timeout with the [KN-xxx]
 * console error in its diagnostics.
 *
 * Each failure is printed once with console.error, on every build, as it
 * comes (through the core's wildflower.diagnostic() when the core is a
 * development build, diagnostics.js), so two failures both show, and a source that keeps failing is not
 * printed again by the next run; one whose source passed in between is. A
 * source can fail outside a run (report(), through diagnostics.health): a
 * Lottie animation or an animated image made later, a scene mounted later
 * whose input fails. That is printed, and the page is marked failed until
 * the next run, which evaluates the page again; one that comes while a run
 * is going is a source that run may not have seen, so the run evaluates
 * the page once more, and one that comes during check()'s or render()'s
 * seeks fails that call (watch()).
 *
 * After frame 0, a waitFor query that goes back to loading or stale is a
 * render hazard; development builds warn once per query (KN-132), except in
 * interactive mode on a page with steps (lesson.js). A run
 * after frame 0, such as the one check() and render() begin with, waits
 * for a waitFor query that is loading again and fails on one that a
 * refresh left in error (KN-131).
 *
 * The composition root gets data-kinetic-ready once the page may be shown,
 * for a stylesheet to hold the stage hidden until then and so avoid a flash
 * of unbound markup with every clip stacked. After that it follows each
 * run's result.
 */

import { CODES, warn, fail, health, printError } from './diagnostics.js';
import { compositionRoot } from './timing.js';

const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const MARK_POLL_MS = 16;
const MARK_WAIT_MS = 60000;
const IMAGE_WAIT_MS = 30000;   // an image still loading after this fails the run (KN-182)
const PASSES = 3;              // a run's evaluations at most, while failures keep coming

// KN-131's sentence for a failed query. A page opened from disk (file:)
// cannot fetch the files beside it, the commonest cause, so there it names
// the two ways out.
export function queryFailedWhy(error, protocol) {
  const why = 'the query failed (' + (error && error.message || String(error)) + ')';
  return protocol === 'file:'
    ? why + '; this page was opened from disk, where it cannot fetch the files beside it: serve the folder (npx serve), or load the data as a script (const ROWS = [...] in a .js file) and read it without a query'
    : why;
}

export function createReadiness(wf, clock, scenes, clips, fit, audio, footage, extra, lesson) {
  const w = self;
  let frameZero = false;       // a run has passed: later reloads are hazards
  let ok = false;              // the last run passed, and nothing failed since
  const warned = new Set();

  // Each failure is printed once while it lasts: keyed by its message and,
  // for a Lottie animation or a clip (err.source), by that source too, since
  // two can share a message. An evaluation that has settled every wait
  // without meeting a failure printed before it began drops the key, so a
  // source that passed and fails again is printed again.
  const printed = new Set();
  const ids = new WeakMap();
  let id = 0;
  function print(err) {
    const m = err && typeof err.message === 'string' ? err.message : String(err), s = err && err.source;
    if (s && !ids.has(s)) ids.set(s, ++id);
    const key = s ? ids.get(s) + ' ' + m : m;
    if (!printed.has(key)) { printed.add(key); printError(err); }
    return key;
  }
  // A failure from outside a run. `reports` counts them, so a run knows
  // that one came while it went, and check() and render() that one came
  // during their seeks (watch()).
  let reports = 0, late = null;
  function report(err) {
    print(err);
    if (!err || !err.code) return;
    reports++;
    late = err;
    ok = false;
    if (frameZero) mark('failed');
  }
  health.report = report;
  // A function that gives the failure reported since watch() was called,
  // or null.
  const watch = () => { const n = reports; return () => (reports !== n ? late : null); };

  const hasQueries = () => typeof wf.getQuery === 'function' && !(wf.features && wf.features.query === false);

  // Resolves when the query has its rows; rejects when it has failed or
  // does not exist. Polls the public fields: a query is a store, and its
  // load is the one state change readiness needs. The poll's stop goes in
  // `stops`, which the evaluation runs once it has settled either way.
  function queryLoaded(sceneName, name, stops) {
    const q = wf.getQuery(name);
    const where = "scene '" + sceneName + "' waits for query '" + name + "'";
    if (!q) return Promise.reject(fail(CODES.NO_QUERY, where, __DEV__ && 'no query by that name exists'));
    return new Promise((resolve, reject) => {
      const check = () => {
        if (q.error) { reject(fail(CODES.QUERY_FAILED, where, __DEV__ && queryFailedWhy(q.error, location.protocol))); return true; }
        // lastSync is null until the first load. A HyperFrames render runs
        // with the clock frozen at 0, so a load there stamps it 0.
        if (!q.isLoading && q.lastSync != null) { resolve(); return true; }
        return false;
      };
      if (check()) return;
      const id = setInterval(() => { if (check()) clearInterval(id); }, 16);
      stops.push(() => clearInterval(id));
    });
  }

  // The <img> elements under a scene, and the SVG <image> elements under
  // the composition root, where lottie-web's svg renderer draws an image
  // layer of an animation in a scene or out of one.
  function imagesDecoded() {
    const els = new Set();
    for (const inst of scenes.live) for (const img of inst.element.querySelectorAll('img, image')) els.add(img);
    const root = compositionRoot(document);
    if (root) for (const img of root.querySelectorAll('image')) els.add(img);
    return Promise.all(Array.from(els, (img) => typeof img.decode === 'function' && decoded(img)));
  }
  // One image decoded, or failed (not held against the render); one still
  // loading after IMAGE_WAIT_MS, from a server that stopped answering, fails
  // the run with KN-182 naming it, so a render never waits forever.
  function decoded(img) {
    let timer;
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const src = img.getAttribute('src') || img.getAttribute('href') || img.getAttribute('xlink:href') || '';
        reject(fail(CODES.IMAGE_STALLED, 'the image ' + src, __DEV__ && 'did not load in 30 s, so the page cannot be checked or rendered; check that its server answers, or remove the image'));
      }, IMAGE_WAIT_MS);
    });
    return Promise.race([img.decode().catch(() => undefined), late]).finally(() => clearTimeout(timer));
  }

  // Scenes are registered by the page's own scripts, deferred or module,
  // all of which have run by DOMContentLoaded; readiness that settled before
  // them would let the runtime show the page with nothing bound. A deferred
  // script runs with readyState already 'interactive', so the wait is for
  // the event itself (or load, whichever comes first), unless the document
  // is complete.
  const parsed = () => (document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((r) => {
      document.addEventListener('DOMContentLoaded', () => r(), { once: true });
      w.addEventListener('load', () => r(), { once: true });
    }));

  // The page as it is now: rejects with the first failure to come.
  async function evaluate() {
    // The sound is read once the footage has its metadata: a sound timed from
    // footage with no length starts where that file ends, which is known
    // only then, and a missing file on a footage clip with data-has-audio is
    // KN-138, the picture's failure, and its sound is then not asked for; the
    // other clips' sound still is. Every clip is settled, and each one that
    // fails is printed (`failed`), so two broken files both show.
    // The transitions' maps and the effects' images load beside them.
    const before = new Set(printed), met = new Set(), stops = [];
    const failed = (e) => { met.add(print(e)); };
    const picture = footage.load(failed);
    const waits = [picture, picture.then(() => audio.load(failed), () => audio.load(failed, footage.failed)), extra()];
    const input = scenes.validateLive();
    if (input) waits.push(Promise.reject(input));
    if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready);
    if (hasQueries()) {
      for (const [sceneName, names] of scenes.waitFor()) {
        for (const name of names) waits.push(queryLoaded(sceneName, name, stops));
      }
    }
    const all = waits.map((p) => p.catch((e) => { failed(e); throw e; }));
    Promise.allSettled(all).then(() => { for (const k of before) if (!met.has(k)) printed.delete(k); });
    // A run that fails stops its polls, so none outlives it.
    try { await Promise.all(all); } finally { for (const stop of stops) stop(); }
    await tick(0);                       // the flush after the last load
    await imagesDecoded();
  }

  // One run: the page evaluated, and again when a failure came from outside
  // meanwhile (a source this evaluation may not have seen). Resolves with
  // the count of those failures at its end, which settle() compares.
  async function run() {
    await parsed();
    // The stage's size from data-width and data-height, and the clock's
    // duration and fps, for a root added since the page was parsed (fit.js).
    if (fit) fit.size();
    clock.resolveComposition();
    await tick(0);
    if (typeof wf.whenIdle === 'function') await wf.whenIdle();
    // Every component's init() that is still to run, store waits included,
    // so each scene is live before the page is evaluated.
    await wf.whenInitialized();
    // A hidden clip is clipped to nothing (clips.js), and Chrome then does
    // not load a lazy image or frame inside it until the clip shows, so
    // every lazy one in the composition is made eager.
    const root = compositionRoot(document);
    if (root) for (const el of root.querySelectorAll('img[loading="lazy"], iframe[loading="lazy"]')) el.loading = 'eager';
    for (let n = 1; ; n++) {
      const seen = reports;
      await evaluate();
      if (reports === seen) return seen;
      if (n === PASSES) throw late;
    }
  }

  // data-kinetic-ready on the composition root: "true" once the page may be
  // shown, and with the runtime present only once it has published
  // __renderReady, which comes after its own pass hiding the clips outside
  // their window; "failed" when a run failed. Until then the root holds
  // unbound markup and every clip at once, so a page hides it:
  // [data-composition-id]:not([data-kinetic-ready]) { visibility: hidden }.
  // Without the runtime, a root already marked was shown, and takes each
  // run's result at once; with it, "true" waits for __renderReady, which
  // the runtime never publishes while the registered entry is held.
  // A fitted stage is wrapped and scaled first (fit.js), so it is never
  // shown at its full size.
  function mark(value) {
    if (fit) fit.sync();
    const root = compositionRoot(document);
    if (root) root.setAttribute('data-kinetic-ready', value);
  }
  const shown = () => { if (ok) mark('true'); };
  let polling = 0;
  async function markShown() {
    if (!clock.hasRuntime()) {
      // The clips outside their window are hidden, and each footage clip
      // has landed on its frame, before the page is first shown, so the
      // first frame shows neither every clip at once nor a file's own first
      // frame.
      const root = compositionRoot(document);
      if (!(root && root.hasAttribute('data-kinetic-ready'))) await clips.apply(clock.now());
      shown();
      return;
    }
    if (w.__renderReady === true) { shown(); return; }
    if (polling) return;
    // A runtime that never publishes __renderReady is waited for 60 s, not
    // for the life of the page; the root then stays unmarked.
    let left = Math.ceil(MARK_WAIT_MS / MARK_POLL_MS);
    polling = setInterval(() => {
      if (w.__renderReady === true) shown();
      else if (--left > 0) return;
      clearInterval(polling);
      polling = 0;
    }, MARK_POLL_MS);
  }
  // A seek from the runtime means it is up and about to capture or show the
  // frame: the mark lands inside that seek, before its barrier resolves.
  clock.onBeforeSeek(() => {
    const root = compositionRoot(document);
    if (ok && root && !root.hasAttribute('data-kinetic-ready')) mark('true');
  });
  // A run, and the root marked with its result. A failure from outside
  // that came after the run's last evaluation fails the run too. The page
  // around the root is settled here (fit.js), before the runtime hears that
  // frame 0 may be captured.
  async function settle() {
    try {
      if (await run() !== reports) throw late;
    } catch (e) {
      ok = false;
      print(e);
      mark('failed');
      throw e;
    }
    ok = true;
    frameZero = true;
    if (fit) fit.sync();
    await markShown();
  }

  // The public form: resolves or rejects. The registered form holds on a
  // failure (see the header).
  const ready = () => settle();
  let held = false;
  const entry = settle().catch(() => { held = true; return new Promise(() => {}); });
  // The runtime keeps window.__hf when it finds one, but replaces
  // __hf.buildReady with a fresh object as it initialises, which would drop
  // an entry registered before it ran. A setter puts the entry back into
  // whatever object the runtime installs, so the order of the script tags
  // does not decide whether the runtime waits.
  w.__hf = w.__hf || {};
  let registry = w.__hf.buildReady && typeof w.__hf.buildReady === 'object' ? w.__hf.buildReady : {};
  registry.kinetic = entry;
  Object.defineProperty(w.__hf, 'buildReady', {
    configurable: true,
    enumerable: true,
    get() { return registry; },
    set(v) {
      registry = v && typeof v === 'object' ? v : {};
      if (!registry.kinetic) registry.kinetic = entry;
    },
  });

  // Not in interactive mode on a page with steps, where a lesson driven by server
  // data refreshes its queries (lesson.js); check() and render() are in
  // video mode, where it is on.
  if (__DEV__) {
    clock.onSeek(() => {
      if (!frameZero || !hasQueries() || lesson.quiet()) return;
      for (const [sceneName, names] of scenes.waitFor()) {
        for (const name of names) {
          if (warned.has(name)) continue;
          const q = wf.getQuery(name);
          if (q && (q.isLoading || q.isStale)) {
            warned.add(name);
            warn(CODES.QUERY_RELOAD, "query '" + name + "', which scene '" + sceneName + "' waits for, went back to loading after frame 0; a render can capture frames before its new rows land",
              'Load the data once: no refresh interval, no invalidate() or refresh() while the composition renders.');
          }
        }
      }
      return undefined;
    });
  }

  scenes.onFailure(report);
  // held(): the registered entry's run failed, so a HyperFrames render of
  // the page waits at frame 0 until its timeout. entry: the registered run,
  // which resolves when it passes and never when it fails (lesson.js starts
  // an interactive page's first step on it).
  return { ready, watch, held: () => held, entry };
}
