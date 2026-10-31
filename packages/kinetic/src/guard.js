/**
 * What keeps a render matching its preview when the author breaks a rule
 * without noticing.
 *
 * CSS-animation catch-up (every build). HyperFrames' CSS adapter collects
 * the page's animations once, when it discovers the composition, and seeks
 * only those. A row a list or a query creates later has animations the
 * runtime never positions, so they run on the wall clock and a render
 * captures them wherever they happen to be. After every seek's flush, before
 * the barrier resolves, Kinetic positions every CSS animation under a scene
 * in the composition root that is not paused (the runtime pauses the ones
 * it seeks) the way the adapter does: currentTime = max(0, time - start of
 * the nearest [data-start]) * 1000, then pause(). Once adopted, an animation is
 * positioned on every later seek. Without a runtime on the page every
 * animation is adopted, so a preview scrub shows what a render captures.
 *
 * Determinism diagnostics (development builds only), watching just the
 * window from a seek's arrival to its barrier:
 *
 *   KN-140  a wall clock read: Date.now(), performance.now(), new Date()
 *   KN-141  Math.random()
 *   KN-142  a timer, fetch or requestAnimationFrame started
 *   KN-143  a CSS transition under the composition root, except in
 *           interactive mode on a page with steps (lesson.js)
 *   KN-145  locale-dependent formatting with no locale
 *   KN-170  a seek that took longer than 8 ms to settle
 *
 * The clock reads are found by wrapping the globals for the window and
 * reading the stack: a call whose direct caller is the framework's file,
 * the runtime or this extension is the machinery's own and is ignored; one
 * whose direct caller is any other file is reported with that line. Each
 * code warns once. A global the page replaced after load stays the page's:
 * the wrapper calls it, and the window's end puts it back.
 */

import { CODES, warn } from './diagnostics.js';
import { resolveTiming, compositionRoot, timingEpoch } from './timing.js';

const SLOW_SEEK_MS = 8;

// Frames from these files are not the author's: the framework
// (wildflower.<tier>.<build>.js), the HyperFrames runtime, and a test
// runner's own modules. OWN is this extension's file.
const VENDOR = /\/wildflower\.[\w.-]*js|hyperframe\.runtime|\/node_modules\/|\/@vite\//;
const OWN = /kinetic\.wf/;

export function createGuard(wf, clock, scenes, lesson) {
  const G = self;
  const adopted = new WeakSet();     // CSSAnimations Kinetic positions
  const starts = new WeakMap();      // element -> [timing epoch, clip start in seconds]
  const warned = new Set();          // codes already printed

  const once = (code, message, suggestion) => {
    if (warned.has(code)) return;
    warned.add(code);
    warn(code, message, suggestion);
  };

  // Kept until a footage file's length arrives, which can move a start timed
  // from that clip (timing.js).
  function clipStart(el) {
    let s = starts.get(el);
    if (!s || s[0] !== timingEpoch()) {
      const clip = el.closest('[data-start]');
      starts.set(el, s = [timingEpoch(), clip ? resolveTiming(clip).start : 0]);
    }
    return s[1];
  }

  // ---- catch-up ---------------------------------------------------------------

  // The live scene an element sits in, the nearest one when scenes nest.
  function sceneOf(el, byElement, root) {
    for (let e = el; e; e = e.parentElement) {
      const inst = byElement.get(e);
      if (inst) return inst;
      if (e === root) break;
    }
    return null;
  }

  // One getAnimations() call on the composition root per seek (the document
  // when there is no root), then each animation is matched to its scene.
  function catchUp(time) {
    if (typeof G.CSSAnimation !== 'function' || !scenes.live.size) return;
    const root = compositionRoot(document);
    let anims;
    try { anims = root ? root.getAnimations({ subtree: true }) : document.getAnimations(); } catch (_) { return; }
    if (!anims.length) return;
    const byElement = new Map();
    for (const inst of scenes.live) byElement.set(inst.element, inst);
    for (const a of anims) {
      if (!(a instanceof G.CSSAnimation)) continue;
      const target = a.effect && a.effect.target;
      if (!target) continue;
      const inst = sceneOf(target, byElement, root);
      if (!inst) continue;
      if (!adopted.has(a)) {
        if (a.playState === 'paused') continue;
        adopted.add(a);
      }
      const ms = Math.max(0, time - clipStart(target)) * 1000;
      try { a.currentTime = ms; } catch (_) { /* an animation that refuses currentTime */ }
      try { a.pause(); } catch (_) { /* an unresolved infinite animation */ }
    }
  }

  clock.onAfterSeek(catchUp);

  if (!__DEV__) return;

  // ---- diagnostics (development) -------------------------------------------

  // The guard's own clock, for the seek's duration (KN-170).
  const perfNow = G.performance.now;
  const clockNow = () => perfNow.call(G.performance);
  let depth = 0;
  // [object, key, value when the seek opened, own property then, wrapper]
  // for every global the open window wrapped.
  let installed = [];

  // The direct caller of the wrapped global. The first three stack frames
  // with a URL are the guard's own (this function, report() and the
  // wrapper), and frames without a URL (natives such as forEach) are
  // skipped. The caller is the author's line when it is theirs, and null
  // when it belongs to the framework, the runtime or Kinetic itself,
  // whatever author code sits deeper in the stack. A seek the author's scrub
  // handler started still runs the framework's own timers, and the clock
  // that check() seeks reads performance.now() for the line that called
  // check().
  function authorFrame() {
    const lines = (new Error().stack || '').split('\n');
    let guardFrames = 3;
    for (const line of lines) {
      if (!/(https?|file|blob):/.test(line)) continue;
      if (guardFrames) { guardFrames--; continue; }
      return VENDOR.test(line) || OWN.test(line) ? null : line.trim().replace(/^at\s+/, '');
    }
    return null;
  }

  function report(code, what, suggestion) {
    if (warned.has(code)) return;
    const at = authorFrame();
    if (!at) return;
    once(code, what + ' during a seek (' + at + '); a render would capture a different frame on every run', suggestion);
  }

  const CLOCK = 'Derive every value from local or time; a frame is a function of the seek, never of the wall clock.';
  const RANDOM = 'Use wildflower.kinetic.random(seed) for a sequence, or noise(x, seed) for a drift.';
  const ASYNC = 'A frame is captured when the seek settles; work started by a timer, fetch or requestAnimationFrame lands in a later frame or in none. Load data before frame 0 (waitFor) and compute in the seek.';
  const LOCALE = "Pass a locale ('en-US') or use wildflower.kinetic.format(), so every render machine formats the same.";

  // Puts a wrapper in obj[key] and records what was there, so close() can
  // put it back.
  function put(obj, key, wrapper) {
    installed.push([obj, key, obj[key], Object.prototype.hasOwnProperty.call(obj, key), wrapper]);
    obj[key] = wrapper;
  }

  function wrapLocale(proto, key, label) {
    const fn = proto[key];
    put(proto, key, function (...args) {
      if (args[0] === undefined) report(CODES.LOCALE, label + ' with no locale');
      return fn.apply(this, args);
    });
  }

  function wrapIntl(key, label) {
    const Orig = G.Intl && G.Intl[key];
    if (!Orig) return;
    const W = function (locales, options) {
      if (locales === undefined) report(CODES.LOCALE, label + ' with no locale');
      return new Orig(locales, options);
    };
    W.prototype = Orig.prototype;
    Object.setPrototypeOf(W, Orig);
    put(G.Intl, key, W);
  }

  // The window: open from a seek's before hooks to its after hooks, and
  // with the globals wrapped through it, except from the moment a seek's
  // synchronous part returns to the next microtask. The code that called
  // seek(t) runs on in that gap, and it is the page's, not the seek's
  // (KN-142 for a timer the page starts after its own seek() was its).
  // The microtask is queued as the window opens, ahead of the framework's
  // flush, so the flush and every later part of the seek run wrapped. A
  // seek whose synchronous part throws closes its window there, since its
  // after hooks never run. `sync` holds the seeks whose synchronous part
  // runs, nested seeks among them.
  let wrapped = false;
  const sync = [];
  function open(t, seek) {
    depth++;
    seek.opened = clockNow();
    sync.push(seek);
    wrap();
    queueMicrotask(() => { if (depth) wrap(); });
  }
  function returned(seek, threw) {
    const i = sync.indexOf(seek);
    if (i < 0) return;   // it threw before the window opened
    sync.splice(i, 1);
    if (threw) close(null, seek);
    else if (!sync.length) unwrap();
  }

  // Each wrapper calls the value the global held when it was wrapped, which
  // is the page's own when it replaced one after load (a seeded
  // Math.random), and unwrap() puts that value back.
  function wrap() {
    if (wrapped) return;
    wrapped = true;
    const D = G.Date, perf = G.performance.now, random = Math.random;
    const setT = G.setTimeout, setI = G.setInterval, fetchFn = G.fetch, raf = G.requestAnimationFrame;
    const WrappedDate = function (...args) {
      if (new.target) {
        if (!args.length) report(CODES.WALL_CLOCK, 'new Date() was read', CLOCK);
        return Reflect.construct(D, args, new.target === WrappedDate ? D : new.target);
      }
      report(CODES.WALL_CLOCK, 'Date() was read', CLOCK);
      return D();
    };
    WrappedDate.prototype = D.prototype;
    Object.setPrototypeOf(WrappedDate, D);
    WrappedDate.now = () => { report(CODES.WALL_CLOCK, 'Date.now() was read', CLOCK); return D.now(); };
    put(G, 'Date', WrappedDate);
    put(G.performance, 'now', function () { report(CODES.WALL_CLOCK, 'performance.now() was read', CLOCK); return perf.call(G.performance); });
    put(Math, 'random', () => { report(CODES.RANDOM, 'Math.random() was called', RANDOM); return random.call(Math); });
    put(G, 'setTimeout', function (...a) { report(CODES.ASYNC_WORK, 'a timer was started (setTimeout)', ASYNC); return setT.apply(G, a); });
    put(G, 'setInterval', function (...a) { report(CODES.ASYNC_WORK, 'a timer was started (setInterval)', ASYNC); return setI.apply(G, a); });
    if (fetchFn) put(G, 'fetch', function (...a) { report(CODES.ASYNC_WORK, 'fetch() was started', ASYNC); return fetchFn.apply(G, a); });
    put(G, 'requestAnimationFrame', function (...a) { report(CODES.ASYNC_WORK, 'requestAnimationFrame() was called', ASYNC); return raf.apply(G, a); });
    wrapLocale(Number.prototype, 'toLocaleString', 'Number toLocaleString()');
    wrapLocale(D.prototype, 'toLocaleString', 'Date toLocaleString()');
    wrapLocale(D.prototype, 'toLocaleDateString', 'Date toLocaleDateString()');
    wrapLocale(D.prototype, 'toLocaleTimeString', 'Date toLocaleTimeString()');
    wrapIntl('NumberFormat', 'new Intl.NumberFormat()');
    wrapIntl('DateTimeFormat', 'new Intl.DateTimeFormat()');
  }

  // Puts back each value wrap() replaced, when the global still holds the
  // wrapper; a value the page assigned during the seek stays. An inherited
  // global (performance.now is on Performance.prototype) is inherited again.
  function unwrap() {
    if (!wrapped) return;
    wrapped = false;
    for (const [obj, key, before, own, wrapper] of installed) {
      if (obj[key] !== wrapper) continue;
      if (own) obj[key] = before;
      else {
        delete obj[key];
        if (obj[key] !== before) obj[key] = before;
      }
    }
    installed = [];
  }

  // A seek's after hooks, or its synchronous part's throw: the window closes
  // with the last seek in it. KN-170's first part is this seek's own, from
  // its window opening to after the after hooks registered later than this
  // one: a microtask queued here runs once the hook chain returns. The
  // second part is the land hooks after the media (landed()).
  function close(t, seek) {
    if (!--depth) unwrap();
    // Less the time the settle hook waited for scenes' init() (scene.js),
    // which is their setup, not this seek's work.
    queueMicrotask(() => { seek.settled = clockNow() - seek.opened - (seek.waited || 0); });
  }

  // The seek's time for KN-170: the window and the after hooks, then the land
  // hooks registered later than this one, the Trillium draw among them
  // (three.js), and not the wait for the footage between them, which is the
  // decoder's time. The draw stays outside the window, so its own clock reads
  // are not reported. Both parts are the same seek's, kept on its own object
  // (clock.js), when seeks overlap.
  function landed(t, seek) {
    const before = seek.settled || 0, start = clockNow();
    queueMicrotask(() => slow(before + clockNow() - start));
  }

  function slow(took) {
    if (took <= SLOW_SEEK_MS || warned.has(CODES.SLOW_SEEK)) return;
    // A Trillium view compiles its shaders in the first seek that draws,
    // which is one slow seek the author can move into init().
    let three = false;
    if (wf.three) for (const inst of scenes.live) if (inst.element.querySelector('canvas')) { three = true; break; }
    // Scenes inside their clips each run their computeds and seek(local) on
    // every seek; a scene outside its clip runs neither (scene.js).
    let showing = 0;
    const now = clock.now();
    for (const inst of scenes.live) if (inst.element.isConnected && scenes.insideAt(inst.element, now)) showing++;
    once(CODES.SLOW_SEEK, 'a seek took ' + took.toFixed(1) + ' ms to settle, over the ' + SLOW_SEEK_MS + ' ms budget (about half a frame at 60 fps)',
      'Keep per-seek work small: fewer rows, a static pool, no layout reads in computeds.'
      + (showing > 1 ? ' ' + showing + ' scenes are inside their clips at ' + +now.toFixed(3) + " s, and each one's computeds and seek(local) run on every seek; a scene outside its clip costs nothing, so a scene's per-frame work counts only while it shows." : '')
      + (three ? ' A Trillium view compiles its shaders in the first seek that draws it; call renderer.compile(scene, camera) in init() so that cost lands before frame 0.' : ''));
  }

  // Not in interactive mode on a page with steps, where the learner's hover and
  // press start transitions (lesson.js); a render and check() are in video
  // mode, where it is on.
  function transitions() {
    if (typeof G.CSSTransition !== 'function' || warned.has(CODES.TRANSITION) || lesson.quiet()) return;
    const root = compositionRoot(document);
    if (!root) return;
    let anims;
    try { anims = root.getAnimations({ subtree: true }); } catch (_) { return; }
    for (const a of anims) {
      if (a instanceof G.CSSTransition) {
        const el = a.effect && a.effect.target;
        once(CODES.TRANSITION, "a CSS transition of '" + a.transitionProperty + "' is running on <" + (el ? el.tagName.toLowerCase() : '?') + '> under the composition root; it animates on the wall clock, so a render captures it part-way',
          'Replace the transition with a keyframes track or an interpolate() in a computed, so the value is a function of local.');
        return;
      }
    }
  }

  clock.onBeforeSeek(open);
  clock.onReturn(returned);
  clock.onAfterSeek((t, seek) => { transitions(); close(t, seek); });
  clock.onLanded(landed);
}
