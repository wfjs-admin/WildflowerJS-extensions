/**
 * follow: a scene's `follow` block. Each entry becomes a computed of the
 * same name that eases toward a store path by a spring:
 *
 *   follow: { angle: 'sine.angle', tilt: { target: 'sine.tilt', ease: { spring: { duration: 0.6 } } } }
 *
 * The ease is 'spring', { spring: { stiffness, damping, mass } } or
 * { spring: { duration, bounce } }; the default is { spring: { duration: 0.4 } },
 * critically damped. A spring is a linear system, so the follower's value is
 * its value before the first change plus each change of the target times
 * the spring's step response at the time since it:
 *
 *   x(t) = x0 + sum of d_i * r(t - t_i)
 *
 * and a target that moves while the follower is still moving carries its
 * velocity on. A change older than its fold time, when the response is
 * within 1e-4 of rest (settleOf), is added into x0, so the list stays short.
 * Eases other than springs, and overshootClamping, are KN-100: neither is
 * the response of one spring through a retarget. The target's value is a
 * finite number, or true or false as 1 or 0.
 *
 * Interactive mode: the changes come from a store listener, timed on the page's
 * clock (performance.now()), and while one is still moving a loop of
 * Kinetic's own writes the seconds to a small store of its own, which the
 * computeds read; while the clock plays, the clock's frame writes them in its
 * batch, so the frame has one flush. Video mode: the same spring applied to
 * the target's script (lesson.js), sampled on the frames of the root's
 * data-fps (config({ fps }) for a root with none) over the fold window
 * before the time, so it is a function of
 * composition time; a target that no step scripts is passed through. The
 * interactive history is frozen in video mode: the listener records nothing
 * and the loop stops. Back in interactive mode it resumes on the page's
 * clock, and a
 * follower whose history no longer ends on the store's value starts again
 * from that value.
 */

import { STORE_NAME, FOLLOW_STORE } from './names.js';
import { CODES, fail, show } from './diagnostics.js';
import { springOptions, springAt, settleOf } from './motion.js';
import { compositionRoot } from './timing.js';
import { pathOf } from './lesson.js';

const FOLD = 1e-4;
const DEFAULT_EASE = { spring: { duration: 0.4 } };
const secs = () => performance.now() / 1000;

export function createFollow(wf, clock, lesson) {
  const store = clock.store;
  const all = new Map();      // path and spring -> { x0, last, ch }, ch a list of each change's time and size
  let tick = null;            // the seconds store
  let raf = 0;
  let moving = false;

  // The target's value as a number, or the KN-100 for anything else.
  function num(spec, v) {
    if (v === true || v === false) return +v;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    throw fail(CODES.BAD_CALL, spec.path + ' in ' + spec.at, __DEV__ && 'the target holds ' + show(v) + '; a follower follows a finite number, or true and false as 1 and 0');
  }
  const storeOf = (spec) => wf.getStore(spec.name);
  const read = (st, spec) => spec.field.split('.').reduce((o, k) => (o == null ? o : o[k]), st);

  // A follow block, checked: the computeds, and the paths for readiness.
  function define(scene, block) {
    const at0 = "scene('" + scene + "').follow";
    if (!block || typeof block !== 'object' || Array.isArray(block)) throw fail(CODES.BAD_CALL, at0, __DEV__ && 'follow is an object of store paths or { target, ease } by name, not ' + show(block));
    if (!tick) tick = wf.store(FOLLOW_STORE, { state: { seconds: 0 } });
    const computeds = {}, paths = [];
    for (const k of Object.keys(block)) {
      const at = at0 + '.' + k, v = block[k];
      const o = typeof v === 'string' ? { target: v } : v;
      if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL, at, __DEV__ && 'an entry is a store path, or { target, ease }, not ' + show(v));
      for (const f of Object.keys(o)) if (f !== 'target' && f !== 'ease') throw fail(CODES.BAD_CALL, at + '.' + f, __DEV__ && "'" + f + "' is not a field of a follow entry; the fields are target and ease");
      const path = pathOf(o.target);
      if (!path) throw fail(CODES.BAD_CALL, at + '.target', __DEV__ && 'target is a store path, store.field, not ' + show(o.target));
      const e = o.ease === undefined ? DEFAULT_EASE : o.ease;
      const cfg = e === 'spring' ? {} : e && typeof e === 'object' && e.spring && typeof e.spring === 'object' ? e.spring : null;
      if (!cfg) throw fail(CODES.BAD_CALL, at + '.ease', __DEV__ && "a follower eases by a spring: 'spring', { spring: { stiffness, damping, mass } } or { spring: { duration, bounce } }, not " + show(e));
      if (cfg.overshootClamping) throw fail(CODES.BAD_CALL, at + '.ease.spring.overshootClamping', __DEV__ && 'a follower adds one spring response per change of its target, and clamping each one on its own is no longer the response of one spring');
      const s = Object.assign(springOptions(cfg, CODES.BAD_CALL, (field) => at + '.ease' + (field ? '.spring.' + field : '')), { from: 0, to: 1 });
      if (!s.c) throw fail(CODES.BAD_CALL, at + '.ease.spring.damping', __DEV__ && 'a spring with no damping never comes to rest, so the follower would never settle');
      const spec = { at, path: o.target, name: path[0], field: path[1], s, fold: settleOf(s, FOLD), key: o.target + ' ' + s.k + ' ' + s.c + ' ' + s.m };
      paths.push(o.target);
      computeds[k] = function () {
        const ks = this.stores[STORE_NAME];
        return valueAt(spec, ks.mode, ks.time, this.stores[FOLLOW_STORE].seconds);
      };
    }
    return { computeds, paths };
  }

  function valueAt(spec, mode, t, sec) {
    const st = storeOf(spec);
    if (mode === 'video') {
      const list = lesson.scriptOf(spec.path);
      return list ? sampled(spec, list, t) : st ? num(spec, read(st, spec)) : 0;
    }
    const f = st && follower(spec, st);
    if (!f) return 0;
    let x = f.x0;
    for (const [at, d] of f.ch) x += d * springAt(sec - at, spec.s);
    return x;
  }

  // Video mode: the script sampled on the root's frames over the fold window
  // before t, each change between two frames a step response from the later.
  // The frames are the root's data-fps, else config({ fps }), else 30, and
  // never a render's own rate, so the curve is the same at any render fps.
  function sampled(spec, list, t) {
    const root = compositionRoot(document);
    const fps = Number(root && root.getAttribute('data-fps')) || clock.fpsSetting() || 30;
    const k1 = Math.floor(t * fps + 1e-6);
    let prev = num(spec, lesson.valueOf(list, Math.floor((t - spec.fold) * fps) / fps)), x = prev;
    for (let k = Math.floor((t - spec.fold) * fps) + 1; k <= k1; k++) {
      const v = num(spec, lesson.valueOf(list, k / fps));
      if (v !== prev) { x += (v - prev) * springAt(t - k / fps, spec.s); prev = v; }
    }
    return x;
  }

  // Interactive mode: the follower of a path and spring, made at its first read.
  function follower(spec, st) {
    let f = all.get(spec.key);
    if (f) {
      if (f.st !== st) bind(f, st);
      return f;
    }
    const x = num(spec, read(st, spec));
    f = { spec, st, x0: x, last: x, ch: [] };
    all.set(spec.key, f);
    bind(f, st);
    return f;
  }
  // The target's own field: a subscription to the whole store would make
  // every computed of the store run on every change. A target that is a
  // computed is heard through the store's notice of that computed, which
  // can miss a change made in the same task as this subscription (a
  // framework issue with that notice's first value, fixed separately). A
  // store registered again under the target's name (unregister, then
  // store()) is listened to in its place, as it arrives, and a value it
  // holds that differs is a change of the target; the dead store's notices
  // are ignored.
  function bind(f, st) {
    f.st = st;
    const changed = () => {
      if (f.st !== st || store.mode !== 'interactive') return;
      const v = read(st, f.spec);
      const n = v === true || v === false ? +v : v;
      if (typeof n !== 'number' || !Number.isFinite(n) || n === f.last) return;
      f.ch.push([secs(), n - f.last]);
      f.last = n;
      moving = true;
      run();
    };
    st.subscribe(f.spec.field, changed);
    changed();
  }
  document.addEventListener('wildflower:store-ready', (e) => {
    const n = e.detail && e.detail.storeName;
    for (const f of all.values()) {
      const st = f.spec.name === n && wf.getStore(n);
      if (st && st !== f.st) bind(f, st);
    }
  });

  function run() { if (!raf) raf = requestAnimationFrame(frame); }
  // One frame of the loop: old changes fold, and the seconds move on.
  function frame() {
    raf = 0;
    if (store.mode !== 'interactive') return;
    const now = secs();
    moving = false;
    for (const f of all.values()) {
      f.ch = f.ch.filter(([at, d]) => (now - at > f.spec.fold ? (f.x0 += d, false) : true));
      if (f.ch.length) moving = true;
    }
    if (!moving || !store.playing) tick.seconds = now;
    if (moving) raf = requestAnimationFrame(frame);
  }
  clock.onWrite(() => { if (moving && store.mode === 'interactive') tick.seconds = secs(); });

  // Back in interactive mode: a history that no longer ends on the store's value
  // starts again from it, and the loop picks up where the page's clock is.
  lesson.onMode((m) => {
    if (m !== 'interactive') { moving = false; return; }
    if (!all.size) return;
    for (const f of all.values()) {
      const v = read(f.st, f.spec);
      const n = v === true || v === false ? +v : v;
      if (typeof n === 'number' && Number.isFinite(n) && n !== f.last) { f.x0 = f.last = n; f.ch = []; }
    }
    run();
  });

  return { define };
}
