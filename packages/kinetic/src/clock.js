/**
 * The clock: one store, `kinetic`, that holds the composition time, and the
 * three ways a time arrives in it.
 *
 *   hf-seek      HyperFrames dispatches it on every seek, in preview and in a
 *                render, with { time, waitUntil }. The default channel.
 *   timeline     an object registered as window.__timelines[rootId] that the
 *                runtime drives through seek(t). The fallback channel, chosen
 *                with config({ channel: 'timeline' }).
 *   standalone   no runtime on the page: a requestAnimationFrame loop so a
 *                scene file previews with two script tags. Stops the moment
 *                a runtime is found. At the duration it holds the last
 *                frame for config({ loop: { hold } }) seconds (3 with
 *                loop: true, the default; none with the preview bar up),
 *                then wraps to 0; with loop: false it holds the last frame
 *                and stops. A click on the composition root, outside the
 *                page's own controls, pauses it and plays it again, with
 *                the bar down; on a lesson, while a step plays, and on
 *                to its hold. Space or Enter on the focused root does the
 *                same.
 *
 * play({ from, to }) seeks to `from`, plays, and holds the last frame before
 * `to`: the standalone loop stops there, and with a player the first hf-seek
 * at or past it is applied as that frame, and the player is paused and
 * sought to it.
 *
 * Every arrival goes through applyTime(), which writes the store once, as a
 * batch, then runs the scene seek hooks. The hf-seek listener hands the
 * barrier a promise that settles after the framework's flush, after every
 * promise a seek hook returned has settled, after the scenes that mounted
 * during the seek have run their first seek(local), after the after-seek
 * hooks (guard.js: the CSS-animation catch-up), and after the media the
 * seek moved has landed (footage.js: each clip's `seeked`), so a frame is
 * captured only once the DOM and the media hold it. The media is waited for
 * after the after hooks, outside the guard's window: a 1080p file can take
 * 140 ms to seek, which is the decoder's time and not the page's, and the
 * page's own code that runs meanwhile is not part of the seek.
 */

import { STORE_NAME } from './names.js';
import { CODES, warn, fail, show } from './diagnostics.js';
import { compositionRoot } from './timing.js';
import { checkShutter } from './motion.js';
import { readFinish, reportFinish } from './finish.js';

const DEFAULT_FPS = 30;
const LOOP_HOLD = 3;          // seconds on the last frame before a loop starts again
const OPTIONS = ['fps', 'channel', 'autoplay', 'preview', 'loop', 'fit', 'sound', 'shutter', 'finish', 'mode'];
const MODES = ['auto', 'interactive', 'video'];

// A shutter, for render({ shutter }) and config({ shutter }): an angle in
// degrees or { angle, samples }, as { angle, samples } with the defaults
// filled in, or null for 0, false, null or none. `call` is render or
// config, and the KN-100 message's where names the field that failed, as in
// render({ shutter: { samples } }).
export function readShutter(v, call) {
  if (v == null || v === 0 || v === false) return null;
  const o = typeof v == 'number' ? { angle: v } : typeof v == 'object' && !Array.isArray(v) ? v : null;
  if (!o) throw fail(CODES.BAD_CALL, call + '({ shutter })', __DEV__ && 'shutter is an angle in degrees, { angle, samples }, or 0, false or null, not ' + show(v));
  for (const k in o) if (k !== 'angle' && k !== 'samples') throw fail(CODES.BAD_CALL, call + '({ shutter: { ' + k + ' } })', __DEV__ && "'" + k + "' is not a field of shutter; the fields are angle and samples");
  const angle = o.angle === undefined ? 180 : o.angle;
  const samples = o.samples === undefined ? 8 : o.samples;
  checkShutter(call + '({ shutter: { ', ' } })', angle, samples, 2, 64);
  return { angle, samples };
}

// The time of the last frame before t: (t * fps - 1) / fps when t is on a
// frame, the same number check() and render() seek for that frame.
export const lastFrameBefore = (t, fps) => (Math.ceil(t * fps - 1e-6) - 1) / fps;

// HyperFrames' player puts every seek on a grid of 1 / fps, with fps read
// from window.__HF_EXPORT_RENDER_SEEK_CONFIG as the runtime starts (30
// without one) and not from the root's data-fps; the CLI sets the config
// before the page loads. With none set, Kinetic defines it as the root's
// data-fps at the moment it is read (undefined with no root or no number),
// so a runtime that reads it after this script has run seeks on the
// composition's frames. Probed in Chrome: a runtime whose script runs while
// the page is still loading reads it at DOMContentLoaded, so a plain or
// deferred Kinetic tag anywhere in the page is in time; one whose script
// runs later (deferred, or added after load) reads it at once, so Kinetic's
// tag has to come before it. An assignment replaces the definition with the
// value assigned, so a config the CLI or the page sets later reads back as
// set, and a config already present is left as it is. The runtime reads an
// fps from this config alone, and takes any config as an export render, so
// a preview of a root with data-fps also runs its export branch: no
// codec-proxy swap, no cross-origin audio diagnostic, clip windows snapped
// to frames, no wait on a video still loading (kept: the frame grid is what
// a render needs; runtime.test.js pins the branch).
const RENDER_CONFIG = '__HF_EXPORT_RENDER_SEEK_CONFIG';
function defineRenderConfig(w) {
  if (RENDER_CONFIG in w) return;
  Object.defineProperty(w, RENDER_CONFIG, {
    configurable: true,
    enumerable: true,
    get() {
      const root = compositionRoot(w.document);
      const fps = root ? Number(root.getAttribute('data-fps')) : 0;
      return fps > 0 && fps < Infinity ? { fps } : undefined;
    },
    set(value) {
      Object.defineProperty(w, RENDER_CONFIG, { value, writable: true, enumerable: true, configurable: true });
    },
  });
}

export function createClock(wf) {
  const w = self;
  defineRenderConfig(w);
  // loop: false, or the seconds a loop holds its last frame.
  const settings = { fps: null, channel: 'event', autoplay: true, preview: null, loop: LOOP_HOLD, fit: null, sound: true, audio: null, shutter: null, finish: null, mode: 'auto', lesson: null };
  const beforeHooks = [];     // (time) => void, before the store write (guard.js)
  const writeHooks = [];      // (time) => void, inside the store write's batch (lesson.js: the steps and the scripts)
  const holdHooks = [];       // (time) => void, once the seek onto a play({ to }) hold has settled (lesson.js)
  const seekHooks = [];       // (time) => thenable | undefined, from scene.js
  const settleHooks = [];     // (time, seek) => thenable | undefined, once the seek hooks' promises have settled (scene.js)
  const afterHooks = [];      // (time) => void, after the flush and the hooks' promises
  const mediaHooks = [];      // (time) => thenable | undefined, called with the seek hooks, waited for after the after hooks (footage.js)
  const landHooks = [];       // (time) => void, once the media has landed (effects.js)
  const returnHooks = [];     // (seek, threw) => void, as a seek's synchronous part returns or throws (guard.js)
  let current = 0;
  let raf = 0;
  let origin = 0;             // performance.now() at which standalone time was 0
  let duckTimeline = null;
  let watch = 0;              // interval while the runtime's player plays
  let until = null;           // the frame play({ to }) holds on, while it plays
  let quiet = false;          // a seek the preview's sound plays no slice for: check(), render(), a hold
  // The time of the frame a render's seek belongs to (render.js), or null.
  // A shutter's samples run up to a frame later than the frame's time, where
  // Math.round would give the next frame's number, so `frame` here and
  // `clipFrame` (scene.js) are worked out from this time instead.
  let anchor = null;

  // `levels` counts the times the audio clips' level tables changed
  // (audio.js), so a computed that calls level() or spectrum() runs again
  // when they do. `shutter` is the angle of the render with a shutter that
  // is running (render.js), 0 otherwise, so a computed that calls smear()
  // runs again when one starts and ends. `mode` and the step fields are
  // lesson.js's.
  const store = wf.store(STORE_NAME, {
    state: {
      time: 0, frame: 0, fps: DEFAULT_FPS, duration: 0, playing: false, levels: 0, shutter: 0,
      mode: 'interactive', step: '', stepIndex: -1, stepCount: 0, stepStart: 0, stepLength: 0, waiting: false, canAdvance: true,
    },
  });

  // HyperFrames on the page: its player once the composition is up, the
  // __renderReady flag it sets as it starts, or its __hyperframes helpers.
  // Not window.__hf: readiness.js creates that itself for buildReady.
  const hasRuntime = () => !!(w.__player || '__renderReady' in w || (w.__hyperframes && typeof w.__hyperframes === 'object'));
  const player = () => w.__player || null;

  // fps and duration, the way the CLI resolves them: a render's own fps
  // (window.__HF_EXPORT_RENDER_SEEK_CONFIG, which without one set reads as
  // the root's data-fps), else the root's data-fps, else config({ fps }),
  // else 30. The duration is the root's data-duration, or what the runtime's
  // player reports when it is up.
  function resolveComposition() {
    const root = compositionRoot(document);
    const renderCfg = w[RENDER_CONFIG];
    const renderFps = renderCfg && Number(renderCfg.fps);
    const rootFps = root && Number(root.getAttribute('data-fps'));
    const fps = (renderFps > 0 && renderFps) || (rootFps > 0 && rootFps) || settings.fps || DEFAULT_FPS;
    let duration = root ? Number(root.getAttribute('data-duration')) : 0;
    if (!(duration > 0)) {
      const p = player();
      duration = p && typeof p.getDuration === 'function' ? Number(p.getDuration()) || 0 : 0;
    }
    if (store.fps !== fps || store.duration !== duration) {
      wf.batch(() => { store.fps = fps; store.duration = duration; store.frame = Math.round(current * fps); });
    }
    // Space and Enter on the root pause and play it as a click does (below),
    // so it is made focusable, unless the page gave it a tabindex or a
    // runtime drives it.
    if (root && !root.hasAttribute('tabindex') && !hasRuntime()) root.tabIndex = 0;
    return root;
  }

  function thenables(hooks, t, seek) {
    const out = [];
    for (const hook of hooks) {
      const r = hook(t, seek);
      if (r && typeof r.then === 'function') out.push(r);
    }
    return out;
  }

  // One seek: the before hooks, the store as one change with the write hooks
  // inside it, every scene hook and
  // media hook, then, once the framework's flush (one microtask, queued by
  // the write) and the seek hooks' promises have settled, the settle hooks
  // (scenes that mounted during the seek), then the pools' flush
  // (wildflower.flushPools()), then the after hooks, then the
  // media hooks' promises, then the land hooks (the effects, drawn from the
  // footage's frame). Returns the promise the barrier waits on. A hook
  // promise that rejects does not stop the after hooks; scene.js has already
  // reported it. Every after and land hook runs even when one throws, and
  // the first exception then rejects the promise. The before, after and land
  // hooks are also given one object of this seek's own (guard.js keeps its
  // measure there), and the return hooks hear (that object, threw) as the
  // seek's synchronous part returns or throws, so a window opened in a
  // before hook is closed when nothing after it will run.
  function applyTime(t) {
    t = Math.max(0, Number(t) || 0);
    current = t;
    const seek = {};
    let seeking, media;
    try {
      for (const hook of beforeHooks) hook(t, seek);
      wf.batch(() => {
        store.time = t;
        store.frame = Math.round((anchor === null ? t : anchor) * store.fps);
        for (const hook of writeHooks) hook(t);
      });
      seeking = thenables(seekHooks, t);
      media = thenables(mediaHooks, t);
    } catch (e) {
      for (const hook of returnHooks) hook(seek, true);
      throw e;
    }
    for (const hook of returnHooks) hook(seek, false);
    return Promise.allSettled(seeking)
      .then(() => Promise.allSettled(thenables(settleHooks, t, seek)))
      .then(() => {
        // The after hooks take the clock's latest time, not this seek's: a
        // seek held by a scene's promise can settle after a later seek has,
        // and the catch-up then has to leave the animations where the store
        // is, at the later frame, and not drag them back to this one.
        let failed = null;
        const run = (hooks) => {
          for (const hook of hooks) {
            try { hook(current, seek); } catch (e) { if (!failed) failed = { e }; }
          }
        };
        // What seek(local) wrote to pool entities, synchronously and in its
        // promise, goes to the DOM now: a render advances no animation
        // frame, so the pools' frame loop would not flush it. A tier
        // without pools has no flushPools().
        if (typeof wf.flushPools === 'function') wf.flushPools();
        run(afterHooks);
        // Media that never landed (footage.js: KN-138 after its wait) fails
        // the seek, after the land hooks.
        return Promise.allSettled(media).then((done) => {
          run(landHooks);
          if (failed) throw failed.e;
          const lost = done.find((r) => r.status === 'rejected');
          if (lost) throw lost.reason;
        });
      });
  }

  // A seek that nobody waits on (seek(), the standalone loop, the timeline
  // channel): an exception from an after-seek hook is printed, as the
  // framework prints an author's exception, instead of surfacing as an
  // unhandled rejection.
  const detach = (p) => { p.catch((e) => console.error(e)); };

  // The runtime announces no pause or end of its own, so while its player
  // plays, `playing` is checked every 200 ms and cleared when it stops.
  function stopWatch() { if (watch) { clearInterval(watch); watch = 0; } }
  function watchPlayer() {
    if (watch) return;
    watch = setInterval(() => {
      const p = player();
      if (!p || typeof p.isPlaying !== 'function' || !p.isPlaying()) {
        until = null;
        if (store.playing) store.playing = false;
        stopWatch();
      }
    }, 200);
  }

  let heard = false;          // an hf-seek has arrived
  w.addEventListener('hf-seek', (e) => {
    if (settings.channel !== 'event' || !e.detail) return;
    // The first seek, and any while the length is still unknown: the root
    // and the player are both up by now, so a root added after load is read,
    // and a root with no data-duration takes the player's.
    if (!heard || !(store.duration > 0)) { heard = true; resolveComposition(); }
    // The runtime drives now: the standalone loop, if it ran, stops, and
    // `playing` is the player's own state.
    if (raf) stopStandalone();
    const p = player();
    let t = e.detail.time;
    if (p && typeof p.isPlaying === 'function') {
      const playing = !!p.isPlaying();
      if (store.playing !== playing) store.playing = playing;
      if (playing) watchPlayer();
      else until = null;
      // play({ to }): the first frame at or past the hold shows the hold's
      // frame, and the player is paused and sought there once this seek's
      // listeners have returned. Never during a render's capture.
      if (playing && until !== null && t >= until && !w.__HF_RENDER_CAPTURE_MODE) {
        const hold = t = until;
        until = null;
        Promise.resolve().then(() => {
          const q = player();
          if (!q) return;
          q.pause();
          stopWatch();
          if (store.playing) store.playing = false;
          if (typeof q.renderSeek === 'function') q.renderSeek(hold);
        });
      }
    }
    const done = applyTime(t);
    // waitUntil must be called synchronously, so the promise is handed over now.
    if (typeof e.detail.waitUntil === 'function') e.detail.waitUntil(done);
  });

  // The fallback channel: the shape the runtime's GSAP adapter drives when a
  // timeline has no totalTime(): pause(), then seek(t). Registered on the
  // root's composition id, so it needs the root to be in the document.
  function timelineId() {
    const root = compositionRoot(document);
    const id = root && root.getAttribute('data-composition-id');
    if (!id) throw fail(CODES.BAD_CALL, "config({ channel: 'timeline' })", __DEV__ && 'the composition root needs a data-composition-id to register a timeline under');
    return id;
  }

  function registerTimeline(id) {
    let paused = true;
    duckTimeline = {
      play() { paused = false; },
      pause() { paused = true; },
      paused() { return paused; },
      // Kept registered after a switch back to the event channel, where it
      // drives nothing.
      seek(t) { if (settings.channel === 'timeline') detach(applyTime(t)); },
      time() { return current; },
      duration() { return store.duration; },
      add() { return duckTimeline; },
      set() { return duckTimeline; },
    };
    w.__timelines = w.__timelines || {};
    w.__timelines[id] = duckTimeline;
  }

  // ---- the standalone clock -----------------------------------------------

  function frame(now) {
    raf = 0;
    // A runtime has arrived and drives the clock from here, on either
    // channel, so the standalone loop ends.
    if (hasRuntime()) { until = null; if (store.playing) store.playing = false; return; }
    let t = (now - origin) / 1000;
    if (t < current) {
      // The timestamp of the first frame after play() can be earlier than
      // the performance.now() that set the origin. Time never runs
      // backwards: this frame shows the time play() started from.
      t = current;
      origin = now - t * 1000;
    }
    // play({ to }), or the end with loop off: the clock stops on the last
    // frame before it, also when this frame came late and passed it. The
    // hold hooks hear a play({ to }) hold once its seek has settled.
    const held = until !== null;
    const hold = held ? until
      : settings.loop === false && store.duration > 0 ? lastFrameBefore(store.duration, store.fps) : null;
    if (hold !== null && t >= hold) {
      until = null;
      store.playing = false;
      quiet = true;
      let p;
      try { detach(p = applyTime(hold)); } finally { quiet = false; }
      if (held) p.then(() => { for (const hook of holdHooks) hook(hold); }, () => {});
      return;
    }
    if (store.duration > 0 && t >= store.duration) {
      // The loop's hold: the last frame, shown once, until the hold is over.
      const wait = previewing() ? 0 : settings.loop, last = lastFrameBefore(store.duration, store.fps);
      if (t < store.duration + wait) {
        raf = requestAnimationFrame(frame);
        if (current !== last) detach(applyTime(last));
        return;
      }
      t = (t - store.duration - wait) % store.duration;
      origin = now - t * 1000;
    }
    // The next frame is asked for before the seek, so a pause() or seek()
    // from a watcher that runs inside it cancels the request and the loop
    // ends there.
    raf = requestAnimationFrame(frame);
    detach(applyTime(t));
  }

  function stopLoop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  function stopStandalone() {
    stopLoop();
    until = null;
    if (store.playing) store.playing = false;
  }

  // Starts playing from the current time, with whatever hold is set. With a
  // player on the page, play, pause and seek go to it, and the standalone
  // loop, if it still ran, stops first.
  function start() {
    const p = player();
    if (p) { stopLoop(); p.play(); store.playing = true; watchPlayer(); return; }
    if (raf) return;
    resolveComposition();
    origin = performance.now() - current * 1000;
    store.playing = true;
    raf = requestAnimationFrame(frame);
  }

  // play() plays on from the current time. With loop off, on the last frame
  // it starts again from 0, as a video element does at its end. play({ from,
  // to }) seeks to from (the current time by default), plays, and holds the
  // last frame before to (the composition's end by default).
  function play(range) {
    if (range !== undefined) return playRange(range);
    until = null;
    if (!player()) {
      resolveComposition();
      if (!raf && settings.loop === false && store.duration > 0 && current >= lastFrameBefore(store.duration, store.fps)) detach(applyTime(0));
    }
    start();
  }

  function playRange(range) {
    if (!range || typeof range !== 'object') throw fail(CODES.BAD_CALL, 'play(range)', __DEV__ && 'the argument is an object of seconds, or nothing, not ' + show(range));
    resolveComposition();
    const { fps, duration } = store;
    const from = range.from === undefined ? current : range.from;
    let to = range.to === undefined ? duration : range.to;
    if (typeof from !== 'number' || !Number.isFinite(from)) throw fail(CODES.BAD_CALL, 'play({ from })', __DEV__ && 'from is a number of seconds, not ' + show(range.from));
    if (typeof to !== 'number' || !Number.isFinite(to)) throw fail(CODES.BAD_CALL, 'play({ to })', __DEV__ && 'to is a number of seconds, not ' + show(range.to));
    if (range.to === undefined && !(duration > 0)) throw fail(CODES.BAD_CALL, 'play({ from }): data-duration', __DEV__ && "with no to, the clock holds at the composition's end, and the composition has no duration (data-duration on the root)");
    if (duration > 0 && to > duration) to = duration;
    if (!(to > from)) throw fail(CODES.BAD_CALL, 'play({ from, to })', __DEV__ && 'to (' + to + ' s' + (to !== range.to ? ", the composition's end" : '') + ') is not after from (' + from + ' s)');
    const p = player();
    let seeking;
    stopLoop();
    if (p && typeof p.renderSeek === 'function') p.renderSeek(from);
    else detach(seeking = applyTime(from));
    // Never before `from`: a range shorter than a frame holds at from.
    until = Math.max(lastFrameBefore(to, fps), from);
    start();
    // The seek to `from`, for lesson.js, which enters a step once it has
    // settled; undefined with a player.
    return seeking;
  }

  function pause() {
    until = null;
    const p = player();
    if (p) { stopLoop(); p.pause(); store.playing = false; stopWatch(); return; }
    stopStandalone();
  }

  // For check(): pauses a playing clock, and returns the function that plays
  // it again from the clock's time then, with the same hold.
  function suspend() {
    const was = store.playing, hold = until;
    if (was) pause();
    return () => { if (was) { until = hold; start(); } };
  }

  function seek(t) {
    if (typeof t !== 'number' || !Number.isFinite(t)) throw fail(CODES.BAD_CALL, 'seek(time)', __DEV__ && 'time is a number of seconds, not ' + show(t));
    until = null;
    const p = player();
    if (p && typeof p.renderSeek === 'function') { stopLoop(); p.renderSeek(t); return; }
    stopStandalone();
    origin = performance.now() - t * 1000;
    detach(applyTime(t));
  }

  // The current time applied again, with no sound, while the clock stands
  // still: a scene's state changed (scene.js, interactive mode), so its
  // seek(local) and the effects drawn after a seek run for it. A playing
  // clock seeks on the next frame anyway, and a runtime owns its own seeks.
  let redrawing = false;      // inside redraw(): the same time again, no seek of anyone's
  function redraw() {
    if (store.playing || player()) return;
    quiet = redrawing = true;
    try { detach(applyTime(current)); } finally { quiet = redrawing = false; }
  }

  // A seek that resolves once the frame is settled, the way a render's
  // does: the runtime's player and its barrier when there is one, else the
  // clock's own barrier promise. `at` is the time of the frame the seek
  // belongs to, from render(); any other call leaves it out.
  function seekSettled(t, at) {
    anchor = at === undefined ? null : at;
    const p = player();
    if (p && typeof p.renderSeek === 'function') {
      stopLoop();
      p.renderSeek(t);
      return typeof w.__hfWaitForSeekCompletion === 'function' ? w.__hfWaitForSeekCompletion() : Promise.resolve();
    }
    stopStandalone();
    origin = performance.now() - t * 1000;
    // The preview's sound plays no slice for these seeks (audio.js).
    quiet = true;
    try { return applyTime(t); } finally { quiet = false; }
  }

  // loop: true (a hold of 3 s), false, or { hold } in seconds.
  function readLoop(v) {
    if (v === true || v === false) return v && LOOP_HOLD;
    const h = v && typeof v === 'object' && !Array.isArray(v) ? v.hold : undefined;
    if (Object.keys(v || {}).every((k) => k === 'hold') && typeof h === 'number' && h >= 0 && h < Infinity) return h;
    throw fail(CODES.BAD_CALL, 'config({ loop })', __DEV__ && 'loop is true (the default, holding the last frame ' + LOOP_HOLD + ' s before it starts again), false, or { hold } in seconds from 0, not ' + show(v));
  }

  // Every option is checked, and the timeline's root found, before any is
  // applied, so a call that throws leaves the settings as they were.
  function config(opts) {
    if (opts === undefined) return { fps: store.fps, channel: settings.channel, autoplay: settings.autoplay, preview: previewing(), loop: settings.loop === false ? false : { hold: settings.loop }, fit: settings.fit ? settings.fit.get() : false, sound: settings.sound, shutter: settings.shutter ? Object.assign({}, settings.shutter) : false, finish: settings.finish ? reportFinish(settings.finish) : false, mode: settings.mode };
    if (!opts || typeof opts !== 'object') throw fail(CODES.BAD_CALL, 'config(options)', __DEV__ && 'options is an object');
    for (const k of Object.keys(opts)) {
      if (!OPTIONS.includes(k)) throw fail(CODES.BAD_CALL, 'config({ ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the options are " + OPTIONS.join(', '));
    }
    if (opts.fps !== undefined && !(Number.isFinite(opts.fps) && opts.fps > 0)) throw fail(CODES.BAD_CALL, 'config({ fps })', __DEV__ && 'fps is a finite number above 0, not ' + show(opts.fps));
    if (opts.channel !== undefined && opts.channel !== 'event' && opts.channel !== 'timeline') throw fail(CODES.BAD_CALL, 'config({ channel })', __DEV__ && "channel is 'event' (the default) or 'timeline', not " + show(opts.channel));
    if (opts.mode !== undefined && !MODES.includes(opts.mode)) throw fail(CODES.BAD_CALL, 'config({ mode })', __DEV__ && "mode is 'auto' (the default), 'interactive' or 'video', not " + show(opts.mode));
    const loop = opts.loop === undefined ? settings.loop : readLoop(opts.loop);
    const shutter = opts.shutter !== undefined ? readShutter(opts.shutter, 'config') : settings.shutter;
    const finish = opts.finish !== undefined ? readFinish(opts.finish, 'config') : settings.finish;
    const timeline = opts.channel === 'timeline' && !duckTimeline ? timelineId() : null;
    settings.shutter = shutter;
    settings.finish = finish;
    if (opts.finish !== undefined && settings.finishLive) settings.finishLive.sync(finish);
    if (opts.fps !== undefined) settings.fps = opts.fps;
    if (opts.channel !== undefined) settings.channel = opts.channel;
    if (timeline) registerTimeline(timeline);
    if (opts.autoplay !== undefined) settings.autoplay = !!opts.autoplay;
    settings.loop = loop;
    if (opts.sound !== undefined) { settings.sound = !!opts.sound; if (settings.audio) settings.audio.sync(); }
    if (opts.preview !== undefined && settings.preview) settings.preview.set(opts.preview);
    // The fit follows the bar unless set on its own, so either option moves it.
    if (opts.fit !== undefined && settings.fit) settings.fit.set(opts.fit);
    if ((opts.fit !== undefined || opts.preview !== undefined) && settings.fit) settings.fit.sync();
    if (opts.mode !== undefined) settings.mode = opts.mode;
    resolveComposition();
    // The mode in force follows the setting and the bar (lesson.js).
    if (settings.lesson) settings.lesson.resolve();
    return config();
  }

  const previewing = () => (settings.preview ? settings.preview.get() : false);

  // After the page has loaded: read the root, and with no runtime in sight
  // start the standalone clock. In development, say what the renderer would
  // miss.
  function onReady() {
    const root = resolveComposition();
    if (__DEV__) {
      if (!root) {
        warn(CODES.NO_DURATION, 'no composition root was found (an element with data-composition-id), so time has no duration',
          'Wrap the scenes in <div data-composition-id="main" data-start="0" data-duration="..." data-width="..." data-height="...">.');
      } else if (!(Number(root.getAttribute('data-duration')) > 0)) {
        warn(CODES.NO_DURATION, 'the composition root has no data-duration, so the renderer has no length to render',
          'Set data-duration on the root, in seconds. A time-driven composition has no timeline to take it from.');
      } else if (hasRuntime() && !root.hasAttribute('data-no-timeline') && !duckTimeline) {
        warn(CODES.NO_TIMELINE, 'the HyperFrames runtime is on the page, and the composition root has no data-no-timeline and no registered timeline, so the renderer may wait for a timeline that never comes',
          "Add data-no-timeline to the root, or choose wildflower.kinetic.config({ channel: 'timeline' }).");
      }
    }
    if (settings.fit) settings.fit.sync();
    // The mode as the page stands now, a runtime that loaded after Kinetic
    // included (lesson.js). An interactive page with steps enters its first step
    // when readiness has settled instead of playing here.
    if (settings.lesson) settings.lesson.resolve();
    if (!hasRuntime() && settings.autoplay && !(settings.lesson && settings.lesson.takes())) play();
    if (settings.preview) settings.preview.onReady();
  }

  // A click on the composition root pauses it and plays it again, with no
  // runtime and no bar, and not on the page's own controls; on a lesson,
  // only while a step plays and from that pause. Paused by that click, a
  // large pause mark sits over the centre
  // of the stage, beside the root and outside it, so no check or render sees
  // it; it takes no pointer events, so a click on it plays, and it is gone
  // the moment the clock plays again, by any route. No fade either way.
  let mark = null, sized = null;
  const unmark = () => {
    if (mark) { mark.remove(); mark = null; }
    if (sized) { sized.disconnect(); sized = null; }
  };
  // Over the root's center, in its parent.
  function place(root) {
    const p = mark.parentElement, r = root.getBoundingClientRect(), b = p.getBoundingClientRect();
    mark.style.left = (r.left - b.left - p.clientLeft + r.width / 2) + 'px';
    mark.style.top = (r.top - b.top - p.clientTop + r.height / 2) + 'px';
  }
  function showMark(root) {
    unmark();
    const p = root.parentElement;
    if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
    mark = document.createElement('div');
    mark.setAttribute('data-kinetic-paused', '');
    mark.setAttribute('aria-hidden', 'true');
    mark.style.cssText = 'position:absolute;z-index:2;width:112px;height:112px;margin:-56px 0 0 -56px;border-radius:50%;pointer-events:none;display:flex;align-items:center;justify-content:center;gap:14px;background:rgba(38,40,45,0.72)';
    mark.innerHTML = '<i style="width:14px;height:44px;border-radius:3px;background:#efe8db"></i><i style="width:14px;height:44px;border-radius:3px;background:#efe8db"></i>';
    p.insertBefore(mark, root.nextSibling);
    place(root);
    // A container resized with no window resize: the fit's own observer,
    // made before this one, has scaled the root by the time this one runs.
    if (typeof ResizeObserver === 'function') {
      sized = new ResizeObserver(() => { if (mark) place(root); });
      sized.observe(p);
    }
  }
  store.subscribe('playing', (playing) => { if (playing) unmark(); });
  w.addEventListener('resize', () => { const root = compositionRoot(document); if (mark && root && !store.playing) showMark(root); });
  // The hold of play({ to }) a click's pause kept, for the click's play.
  let held = null;
  function toggle(root) {
    if (store.playing) { const h = until; pause(); showMark(root); held = h; return; }
    // A lesson plays on from a pause its click made, to the step's hold;
    // at a hold the learner's controls go on, so a click there does nothing.
    const lesson = settings.lesson && settings.lesson.takes() ? settings.lesson : null;
    if (!lesson) {
      const h = mark ? held : null;
      play();
      if (h !== null && current < h) until = h;
    } else if (mark) lesson.play();
  }
  // Where the last press began: a click that ends a drag is no click here.
  let down = null;
  w.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; }, true);
  w.addEventListener('click', (e) => {
    const root = compositionRoot(document), t = e.target, from = down;
    down = null;
    if (e.defaultPrevented || e.button !== 0 || hasRuntime() || previewing() || !root || !(t instanceof Element) || !root.contains(t)) return;
    if (from && Math.abs(e.clientX - from[0]) + Math.abs(e.clientY - from[1]) > 4) return;
    const s = w.getSelection();
    if (s && !s.isCollapsed) return;
    // A control inside the root, not the root or a wrapper around it.
    const c = t.closest('a,button,input,select,textarea,label,summary,[contenteditable],[tabindex],[data-action],[role=button],[role=slider],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=link],[role=menuitem],[role=option],[role=spinbutton],[role=textbox],[role=combobox],[role=scrollbar]');
    if (c && c !== root && root.contains(c)) return;
    toggle(root);
  });
  w.addEventListener('keydown', (e) => {
    const root = compositionRoot(document);
    if ((e.key !== ' ' && e.key !== 'Enter') || e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || !root || e.target !== root || hasRuntime() || previewing()) return;
    e.preventDefault();
    toggle(root);
  });

  // Loaded after the root was parsed (a script at the end of the body, a
  // late tag): fps and duration are readable now, so read them now.
  if (document.readyState !== 'loading') resolveComposition();
  if (document.readyState === 'complete') setTimeout(onReady, 0);
  else w.addEventListener('load', () => setTimeout(onReady, 0), { once: true });

  return {
    store,
    play, pause, seek, seekSettled, redraw, config, suspend, playRange,
    // The preview bar, handed over by wf.js once it exists; config() and
    // onReady() drive it.
    usePreview(p) { settings.preview = p; },
    // The live finish (finish.js), handed over by wf.js; config({ finish })
    // rebuilds its overlays.
    useFinishLive(l) { settings.finishLive = l; },
    previewing,
    // The lesson (lesson.js), which config() and onReady() consult.
    useLesson(l) { settings.lesson = l; },
    mode: () => settings.mode,
    autoplay: () => settings.autoplay,
    // config({ fps }), or null: follow.js samples a root with no data-fps on it.
    fpsSetting: () => settings.fps,
    // The frame a play({ to }) holds on while it plays, or null (lesson.js).
    holding: () => until,
    // The fit (fit.js), handed over the same way.
    useFit(f) { settings.fit = f; },
    // The audio layer (audio.js), which config({ sound }) drives.
    useAudio(a) { settings.audio = a; },
    soundOn: () => settings.sound,
    // config({ shutter }) and config({ finish }), what render() uses when
    // given none.
    shutter: () => settings.shutter,
    finish: () => settings.finish,
    // render()'s fps on the store, with the frame for time t at that fps in
    // the same change: the runtime's player sends no hf-seek for a seek to
    // the time it is already at, so no seek may follow to work the frame out.
    setFps(fps, t) { wf.batch(() => { store.fps = fps; store.frame = Math.round(t * fps); }); },
    quiet: () => quiet,
    redrawing: () => redrawing,
    now: () => current,
    anchor: () => anchor,
    onBeforeSeek(fn) { beforeHooks.push(fn); },
    onWrite(fn) { writeHooks.push(fn); },
    onHold(fn) { holdHooks.push(fn); },
    onSeek(fn) { seekHooks.push(fn); },
    onSettle(fn) { settleHooks.push(fn); },
    onAfterSeek(fn) { afterHooks.push(fn); },
    onMedia(fn) { mediaHooks.push(fn); },
    onLanded(fn) { landHooks.push(fn); },
    onReturn(fn) { returnHooks.push(fn); },
    hasRuntime,
    resolveComposition,
  };
}
