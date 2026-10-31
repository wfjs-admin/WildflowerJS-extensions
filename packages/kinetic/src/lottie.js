/**
 * lottie(animation, { scene, start, rate, loop }): a lottie-web animation, or any
 * object with its methods, on Kinetic's clock, so it previews, checks and
 * renders frame by frame like everything else. Kinetic never loads or
 * imports lottie-web; the page does, as it loads three.js.
 *
 * On every seek, once the animation has loaded, Kinetic calls
 * goToAndStop(frame, true), the frame being (t - start) * rate * frameRate:
 * 0 before start, and past the end held on the last frame, totalFrames - 1,
 * where lottie-web holds an animation that has played to its end (frame
 * totalFrames is past its layers' out point and shows nothing), unless loop
 * wraps it at totalFrames. t is the scene's local time with scene: this,
 * given in a scene's own methods, and the composition time without it.
 * Anything but a scene's component is KN-100. Frames are passed rather than milliseconds, which lottie-web would scale
 * by the animation's own setSpeed() and setDirection(), so rate is the one
 * speed. Subframes are turned on (setSubframe(true)), so a seek between two
 * of its frames draws between them. The animation is put on the frame of
 * the clock's time when lottie() is called, and again when it loads.
 *
 * Duck-typed: Kinetic calls goToAndStop(), setSubframe() when there is one,
 * and addEventListener() for DOMLoaded, data_failed, error and destroy,
 * using the function it returns to stop listening; it reads isLoaded,
 * totalFrames and frameRate, and for KN-180's message name, path and
 * fileName (lottie-web's file, cut before its .json). lottie() again for the
 * same animation replaces its options, and a readiness run waiting for it
 * waits for the new registration.
 *
 * Readiness, check() and render() wait for each animation to load: isLoaded
 * true, or its DOMLoaded. lottie-web's svg renderer loads an animation's
 * images after DOMLoaded, as <image> elements, which readiness decodes under
 * the composition root as it does an <img> under a scene (readiness.js); the
 * canvas renderer loads them before. A data_failed (the file could not be
 * loaded) is KN-180, and so is an error before the animation has loaded
 * (lottie-web could not set up the data it loaded), with a where of its own:
 * printed once on every build as it happens, the page marked failed, and
 * ready(), check() and render() fail with it until the animation is handed
 * back (Kinetic cannot load it again; the page loads it). lottie-web 5.13 fires
 * neither for a file that is not JSON at all, which throws inside lottie-web
 * instead, and readiness then waits until the runtime's timeout; and an
 * event that fired before lottie() was called is missed, so lottie() is
 * called in the same task as loadAnimation(). lottie-web keeps no state that
 * says a load failed.
 *
 * lottie() returns a handle, { dispose() }, whose dispose() hands the
 * animation back: Kinetic seeks it no more, stops listening to it and no
 * longer waits for it. It is
 * handed back as well when it is destroyed (lottie-web's destroy event, while
 * which Kinetic's listeners are left in place, since lottie-web calls them
 * from the live list and drops the list just after), and when the scene
 * it was given is removed. With the HyperFrames
 * runtime on the page, which finds and seeks lottie-web animations itself
 * (probed with the pinned runtime), Kinetic does not seek it, so two clocks
 * do not fight over it; readiness still waits for it to load.
 *
 * KN-100 on every build for a bad call: an animation without goToAndStop()
 * and addEventListener(), options that are no object, an unknown option, a
 * start that is no finite number, a rate that is not above 0, a loop that is
 * not true or false.
 */

import { CODES, fail, show, health } from './diagnostics.js';
import { fetchNote } from './audio.js';

const OPTIONS = ['scene', 'start', 'rate', 'loop'];

// KN-180's where: the animation, with its name, its file and its scene, each
// when there is one.
function label(anim, el) {
  const file = typeof anim.path === 'string' && typeof anim.fileName === 'string' && anim.fileName ? anim.path + anim.fileName + '.json' : '';
  const scene = el && (el.getAttribute('data-component') || el.getAttribute('data-wf-component'));
  return 'the Lottie animation' + (typeof anim.name === 'string' && anim.name ? " '" + anim.name + "'" : '')
    + (file ? ' (' + file + ')' : '') + (scene ? " in scene '" + scene + "'" : '');
}

export function createLottie(wf, clock, scenes) {
  const live = new Map();   // animation -> its entry, while Kinetic has it
  const errors = new WeakMap();   // animation -> the KN-180 it failed with

  // The frame for composition time t, or -1 while the length is unknown.
  function frameOf(a, t) {
    const total = a.anim.totalFrames, fr = a.anim.frameRate;
    if (!(total > 0 && fr > 0)) return -1;
    const f = Math.max(0, (a.el ? scenes.localOf(a.el, t) : t) - a.start) * a.rate * fr;
    return a.loop ? f % total : Math.min(f, total - 1);
  }

  // A seek: an exception is printed, as the framework prints an author's,
  // so one animation cannot stop the seek or the others.
  function put(a, t) {
    if (clock.hasRuntime() || a.anim.isLoaded === false) return;
    try {
      const f = frameOf(a, t);
      if (f >= 0) a.anim.goToAndStop(f, true);
    } catch (e) { console.error(e); }
  }

  clock.onSeek((t) => { for (const a of live.values()) put(a, t); });

  // The scene an animation was given is removed: it is handed back.
  wf.hook('component:beforeDestroy', (inst) => {
    for (const a of live.values()) if (a.el && a.el === inst.element) a.release();
  });

  function lottie(animation, opts) {
    if (!animation || typeof animation !== 'object' || typeof animation.goToAndStop !== 'function' || typeof animation.addEventListener !== 'function') {
      throw fail(CODES.BAD_CALL, 'lottie(animation)', __DEV__ && 'animation is what lottie.loadAnimation() returns, or an object with its goToAndStop() and addEventListener(), not ' + (animation && animation.localName ? 'a <' + animation.localName + '>' : show(animation)));
    }
    if (opts !== undefined && (!opts || typeof opts !== 'object')) throw fail(CODES.BAD_CALL, 'lottie(…, options)', __DEV__ && 'options is { scene, start, rate, loop }, not ' + show(opts));
    const o = opts || {};
    for (const k in o) if (!OPTIONS.includes(k)) throw fail(CODES.BAD_CALL, 'lottie(animation, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the options are scene, start, rate and loop");
    const el = scenes.sceneOf(o.scene, 'lottie(animation, ');
    const start = o.start === undefined ? 0 : o.start;
    if (typeof start !== 'number' || !Number.isFinite(start)) throw fail(CODES.BAD_CALL, 'lottie(animation, { start })', __DEV__ && 'start is a number of seconds, not ' + show(o.start));
    const rate = o.rate === undefined ? 1 : o.rate;
    if (typeof rate !== 'number' || !(rate > 0 && rate < Infinity)) throw fail(CODES.BAD_CALL, 'lottie(animation, { rate })', __DEV__ && 'rate is a number above 0, the animation seconds per second, not ' + show(o.rate));
    const loop = o.loop === undefined ? false : o.loop;
    if (typeof loop !== 'boolean') throw fail(CODES.BAD_CALL, 'lottie(animation, { loop })', __DEV__ && 'loop is true (wrap at the end) or false (hold the last frame, the default), not ' + show(o.loop));

    const a = { anim: animation, start, rate, loop, el, offs: [] };
    a.wait = new Promise((resolve, reject) => { a.done = resolve; a.bad = reject; });
    a.wait.catch(() => {});
    const listen = (name, fn) => {
      const off = animation.addEventListener(name, (e) => { if (live.get(animation) === a) fn(e); });
      if (typeof off === 'function') a.offs.push(off);
    };
    // A failure is printed as it comes (readiness's report(), which keys it
    // by the animation, since two can share a message), and each run of
    // readiness fails with it while Kinetic has the animation.
    // lottie-web keeps no failed state, so an animation registered again
    // after its failure keeps that failure, which no event will repeat.
    const failed = (err) => { err.source = animation; errors.set(animation, err); health.report(err); a.bad(err); };
    if (errors.has(animation)) a.bad(errors.get(animation));
    if (animation.isLoaded !== false) a.done();
    listen('DOMLoaded', () => { put(a, clock.now()); a.done(); });
    listen('data_failed', () => failed(fail(CODES.LOTTIE_FAILED, label(animation, a.el),
      __DEV__ && ('fired data_failed, so part of it could not be loaded; check the path given to loadAnimation() and that the file is there'
        + fetchNote(typeof animation.path === 'string' ? animation.path : document.baseURI)))));
    listen('error', (e) => {
      if (animation.isLoaded === false) {
        failed(fail(CODES.LOTTIE_FAILED, label(animation, a.el) + ': its data',
          __DEV__ && ('lottie-web could not set it up (' + (e && e.nativeError ? e.nativeError.message : show(e)) + '), so the file is not an animation lottie-web reads')));
      }
    });
    // Destroyed: lottie-web is calling its destroy listeners from the live
    // list, and drops the list just after, so Kinetic's are left in place.
    listen('destroy', () => a.release(true));
    // Handed back: no more seeks or listening, and a readiness run that was
    // waiting for it goes on, or, when lottie() registered the animation
    // again (`next`), waits for that.
    a.release = (gone, next) => {
      if (live.get(animation) !== a) return;
      live.delete(animation);
      if (!gone) for (const off of a.offs) off();
      a.offs = [];
      a.done(next);
    };
    const prior = live.get(animation);
    if (prior) prior.release(false, a.wait);
    live.set(animation, a);
    if (!clock.hasRuntime() && typeof animation.setSubframe === 'function') animation.setSubframe(true);
    put(a, clock.now());
    return { dispose: () => a.release() };
  }

  return {
    lottie,
    // At readiness, check() and render(): every animation Kinetic has, loaded.
    load: () => Promise.all(Array.from(live.values(), (a) => a.wait)),
  };
}
