/**
 * Interactive mode: the same scenes as a lesson on a page, and as a video.
 *
 * Two modes, in the kinetic store's `mode`. Video mode is the composition as
 * a video: the clock plays it straight through, check() and render() seek
 * it, and each step's script writes its store paths on every seek.
 * Interactive mode is the page: each step plays its range and holds on a
 * frame, and the learner's controls write those paths. config({ mode }) is
 * 'auto' (the default), 'interactive' or 'video'. Under auto the page is in
 * video mode with the preview bar up, and in interactive mode otherwise.
 * Whatever the setting, it is in video mode with the HyperFrames runtime on
 * the page or a render capturing it (the runtime's player drives the clock
 * there), and while check() or
 * render() runs (force()). The mode is worked out again before each seek, at
 * each config() call, when the page has loaded and readiness has run, and at
 * each next(), back(), go() and play(). A page with no steps, scripts or
 * followers is the same in both.
 *
 * Steps. A clip with data-step under the composition root is a step, named
 * by its id. The steps are read in order of start, document order breaking a
 * tie, and step k's range runs to step k + 1's start; the last one's to its
 * own end, or the composition's. The table is kept between seeks and worked
 * out again when the definitions, the timing epoch (timing.js), the duration
 * or the root change, at each run of readiness, and, while the page has
 * steps or step definitions, when an element under the root that is a step,
 * holds one or is named by a step's relative start comes or goes, or one of
 * the timing attributes changes (a MutationObserver, whose records each read
 * takes, so a step added just before a seek counts). The store's step, stepIndex,
 * stepStart, stepLength and stepCount follow the clock's time in both modes,
 * written inside the seek's batch (clock.onWrite), so seek(local) and the
 * seek's first flush see the step of the new time.
 *
 * step(id, { wait, until, entry, script }) gives a step what markup cannot:
 *
 *   wait     seconds from the step's start at which interactive mode holds:
 *            by default the shorter of its range and its own clip, so the
 *            hold never shows the step's clip hidden; clamped to the range
 *            and to the composition; false to play on into the next step
 *            with no hold between, so a run of them plays as one range
 *   until    a store path; at the hold, once it is truthy (or when it
 *            already is as the hold lands), interactive mode plays the rest
 *            of the step's range from a task of its own and holds on its
 *            last frame, so what comes after the hold (the explanation of a
 *            right answer) plays; a hold at the range's end stays. next()
 *            and canAdvance wait for it
 *   entry    { path: value }, written as interactive mode enters the step,
 *            and when it is done again: play() at or past its hold, or a
 *            seek of the learner's own landing in it before its hold
 *   script   { path: track or settings }, video mode's writer
 *
 * Interactive mode enters a step with play({ from: start, to: start +
 * wait }), so the clock holds on the last frame before the wait point; `waiting` turns
 * true once that seek has settled (clock.onHold). The clock stands still
 * at the hold, so `local` does too: what the learner changes there moves
 * through follow springs and bindings to state, never through time.
 * Interactive mode never moves to the next step by itself: the learner
 * does, with Next. `canAdvance`, which a page binds its Next button to,
 * follows the until path (true with none), while the step plays as much
 * as at its hold, so Next is ready as soon as nothing is left for the
 * learner to do. next() enters the next step at once, wherever the step
 * is (playing in, held, or playing out), leaving the rest of it unplayed:
 * what follows a hold with no until is the video's alone, since the scripts
 * write only there. After a truthy until, the rest of the range plays by
 * itself (the play-out), play({ to: end }) from the hold, with `waiting`
 * false while it plays; at its last frame the step holds again, `waiting`
 * true, for Next. Back,
 * go() or a seek during it are what they are anywhere in the step; back()
 * is never disabled. A step with wait: false and the steps after it up to the
 * first that holds are one range, played from the first step's start; each
 * later step of it is entered on the first frame inside it, with its entry
 * written in that seek's batch. The kinetic:step event, { step, index },
 * comes once the entering seek has settled (for a later step of a run, once
 * the seek that reached it has landed), outside the guard's window. next(), back() and
 * go() enter a step there; in video mode they seek to its start, keeping a
 * playing clock playing with its hold, entry is not written, and
 * canAdvance stays true. Past the last step's end, next() does nothing, back() enters the last step, and
 * play() plays on to the composition's end. With autoplay on, an
 * interactive page with steps enters its first step when the registered run
 * of readiness resolves (wf.js), and not at all when that run fails. Back
 * in interactive mode after a stay in video mode, the step interactive mode
 * entered is kept only when the clock is back inside it, as check() and
 * render() leave it.
 *
 * Scripts. A path's entry is a track ({ at, to, ease, ... }, as keyframes
 * take, read by interpolate()) or settings ({ at, set }, each value a string,
 * number, boolean or null, held from its time to the next), times in seconds
 * from the step's start. In video mode a path's value at time t comes from
 * the scripts alone and never from the store: the latest step that starts
 * by t and scripts it, at t minus that step's start; before a settings
 * entry's first time, the step before that; before any, the first entry's
 * first value. So a seek to any frame shows what playing through shows. A
 * value is written through the store's own update(), only when it differs.
 * Times are compared with the clips' epsilon, so a setting at 59 / 30 applies
 * on frame 59.
 *
 * In video mode a write to a scripted path by anything else (a slider, a
 * watcher) is undone within a microtask, before the next paint, with KN-146
 * in development. A watcher that writes a scripted path inside one of the
 * script's own writes runs where the listener cannot tell it apart, so
 * Kinetic compares each path with the value it last wrote there before its
 * writes, and reads every one back after them. Each path is undone once at
 * most between two seeks: a watcher that writes it again every time keeps
 * its value after that one correction, with KN-146 printed. A path whose
 * store does not exist is skipped. Switching to video mode keeps the learner's values
 * of the scripted paths aside, and switching back writes them back, after
 * check()'s or render()'s seek back to the time they found and before
 * interactive mode resumes. A readiness run fails with KN-100 for a script path whose
 * store does not exist or that names no state field (check()).
 *
 * Development: KN-118 for a data-step that is no step, two steps with one
 * id, a step inside a step, two steps that start together and a first step
 * that starts after 0; KN-157 for step() with no data-step, an until or
 * follow target with no store at readiness, a wait past the range and a
 * settings entry after 0 in the first step that scripts its path. In
 * interactive mode on a page with steps, KN-132 and KN-143 are off
 * (quiet()): an interactive lesson refreshes its queries and has hover
 * transitions.
 */

import { CODES, warn, fail, show } from './diagnostics.js';
import { compositionRoot, resolveTiming, timingEpoch, parseStart } from './timing.js';
import { interpolate, checkTracks } from './motion.js';
import { started, clipName, EPS } from './clips.js';
import { lastFrameBefore } from './clock.js';

const STEP_OPTIONS = ['wait', 'until', 'entry', 'script'];
// The attributes under the root that the step table reads, a footage clip's
// media start and rate among them, since a step can be timed from its end.
const STEP_ATTRS = ['data-step', 'id', 'data-composition-id', 'data-start', 'data-duration', 'data-end', 'data-media-start', 'data-playback-rate'];

// [store, field] of a store path written as data-model writes one, or null.
export function pathOf(p) {
  const i = typeof p === 'string' ? p.indexOf('.') : -1;
  return i > 0 && i < p.length - 1 ? [p.slice(0, i), p.slice(i + 1)] : null;
}

const primitive = (v) => v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));
const keyed = (label, k) => label + "['" + k + "']";
// A store's own state field, never a name Object.prototype gives it (toString).
const isField = (st, f) => Object.prototype.hasOwnProperty.call(st.state, f);

// A script entry at `label`, checked: a track, or settings.
function checkEntry(e, label) {
  if (!e || typeof e !== 'object') throw fail(CODES.BAD_CALL, label, __DEV__ && 'a script entry is a track { at, to } or settings { at, set }, not ' + show(e));
  if (e.set === undefined) {
    if (!Array.isArray(e.at)) throw fail(CODES.BAD_TRACK, label + '.at', __DEV__ && 'a track is { at: [...], to: [...] }, and settings { at: [...], set: [...] }');
    checkTracks(e, label);
    return;
  }
  if (e.to !== undefined) throw fail(CODES.BAD_CALL, label + '.to', __DEV__ && 'an entry is a track (to) or settings (set), not both');
  const { at, set } = e;
  if (!Array.isArray(at) || !Array.isArray(set) || !at.length || at.length !== set.length) throw fail(CODES.BAD_CALL, label + '.set', __DEV__ && 'settings are { at, set }, two arrays of the same length, one or more');
  at.forEach((t, i) => {
    if (!(typeof t === 'number' && Number.isFinite(t)) || (i && !(t > at[i - 1]))) throw fail(CODES.BAD_CALL, label + '.at[' + i + ']', __DEV__ && "at holds seconds from the step's start, each after the one before, not " + show(t));
  });
  set.forEach((v, i) => {
    if (!primitive(v)) throw fail(CODES.BAD_CALL, label + '.set[' + i + ']', __DEV__ && 'set holds strings, numbers, booleans or null, not ' + show(v) + '; an object written to a store reads back as another object, so the script would write it again on every seek');
  });
}

// The value of a path's script entries at composition time t, from the
// steps that script it in order of start: { start, e } each. Before the
// first, the first entry's first value, read at its first time, so a track
// that extrapolates by 'identity' gives its value and not the time.
export function valueOf(list, t) {
  for (let k = list.length - 1; k >= 0; k--) {
    const { start, e } = list[k];
    if (!started(t, start)) continue;
    const u = t - start;
    if (e.set === undefined) return interpolate(u, e.at, e.to, e);
    for (let j = e.at.length - 1; j >= 0; j--) if (started(u, e.at[j])) return e.set[j];
  }
  const e = list[0].e;
  return e.set === undefined ? interpolate(e.at[0], e.at, e.to, e) : e.set[0];
}

export function createLesson(wf, clock) {
  const store = clock.store;
  const defs = new Map();      // step id -> { wait, until, entry, script }, the last two lists of path and value
  let table = [];              // { el, id, start, end, own } each, by start
  let tableKey = '', tableSig = '', dirty = true, rootEl = null;
  let scripted = new Map();    // path -> { start, e, id } each, in step order
  let forced = 0;              // check() and render() runs going
  let kept = null;             // the learner's values of the scripted paths, kept aside in video mode
  let writing = 0;             // inside a write of Kinetic's own
  let target = null;           // { i, hold, last, out }: the step interactive mode entered, the time it holds on, the last step of its run, and whether it is playing out its range after until
  let heldAt = null;           // that hold's time, once its seek has settled
  const crossed = [];          // steps a run entered in a seek's batch, for their kinetic:step once it has landed
  let steering = 0;            // above 0 while Kinetic seeks into a step itself (enter(), play())
  let gen = 0;                 // entries made, so a late entering seek does nothing
  const watched = new Map();   // path Kinetic listens to -> the store it listens on
  const warned = new Set();    // development: what KN-146 and KN-157 have said
  const elWarned = new WeakMap(); // development: what KN-118 has said of each element

  const interactive = () => store.mode === 'interactive';
  const once = (key, code, message, suggestion) => { if (!warned.has(key)) { warned.add(key); warn(code, message, suggestion); } };
  // Once per element and problem, so a second problem of one element shows too.
  const onceEl = (el, what, message, suggestion) => {
    let s = elWarned.get(el);
    if (!s) elWarned.set(el, s = new Set());
    if (!s.has(what)) { s.add(what); warn(CODES.BAD_STEP, message, suggestion); }
  };
  const put = (k, v) => { if (store[k] !== v) store[k] = v; };

  // A path's store and field, read and written by path.
  function read(path) {
    const [n, f] = pathOf(path), st = wf.getStore(n);
    return st ? f.split('.').reduce((o, k) => (o == null ? o : o[k]), st) : undefined;
  }
  function write(path, v) {
    const [n, f] = pathOf(path), st = wf.getStore(n);
    if (st) st.update(f, v);
  }
  function own(fn) { writing++; try { fn(); } finally { writing--; } }

  // ---- step() ------------------------------------------------------------------

  // A definition's entry or script block, checked, as a list of path and value.
  function block(at, name, k, script) {
    const list = [];
    if (k === undefined) return list;
    if (!k || typeof k !== 'object' || Array.isArray(k)) throw fail(CODES.BAD_CALL, at + '.' + name, __DEV__ && 'it is an object of store paths, not ' + show(k));
    for (const p of Object.keys(k)) {
      if (!pathOf(p)) throw fail(CODES.BAD_CALL, keyed(at + '.' + name, p), __DEV__ && "each key is a store path, store.field, and '" + p + "' has no store");
      if (script) checkEntry(k[p], keyed(at + '.script', p));
      list.push({ p, v: k[p] });
    }
    return list;
  }

  function step(id, def) {
    if (typeof id !== 'string' || !id) throw fail(CODES.BAD_CALL, 'step(id)', __DEV__ && 'id is the id of a data-step element, not ' + show(id));
    const at = "step('" + id + "')";
    const d = def === undefined ? {} : def;
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw fail(CODES.BAD_CALL, "step('" + id + "', definition)", __DEV__ && 'the definition is an object of wait, until, entry and script, not ' + show(def));
    for (const k of Object.keys(d)) if (!STEP_OPTIONS.includes(k)) throw fail(CODES.BAD_CALL, at + '.' + k, __DEV__ && "'" + k + "' is not an option of step(); the options are wait, until, entry and script");
    const { wait, until } = d;
    if (wait !== undefined && wait !== false && !(typeof wait === 'number' && wait >= 0 && wait < Infinity)) throw fail(CODES.BAD_CALL, at + '.wait', __DEV__ && "wait is seconds from the step's start, 0 or more, or false, not " + show(wait));
    if (until !== undefined && !pathOf(until)) throw fail(CODES.BAD_CALL, at + '.until', __DEV__ && 'until is a store path, store.field, not ' + show(until));
    if (wait === false && until !== undefined) throw fail(CODES.BAD_CALL, "step('" + id + "', { wait: false, until })", __DEV__ && 'wait: false plays on into the next step without holding, so until has nothing to hold');
    defs.set(id, { wait, until, entry: block(at, 'entry', d.entry, false), script: block(at, 'script', d.script, true) });
    dirty = true;
  }

  // ---- the table -----------------------------------------------------------------

  // Whether DOM records touch the steps: a timing attribute under the root,
  // or an element added or taken away that is a step, holds one, or is one
  // a step's relative start names. The node lists are read in place.
  let refs = new Set();        // the ids the steps' relative starts name
  function touches(records) {
    for (const m of records) {
      if (m.type === 'attributes') return true;
      for (const nodes of [m.addedNodes, m.removedNodes]) {
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          if (n.nodeType === 1 && (n.hasAttribute('data-step') || refs.has(n.id) || refs.has(n.getAttribute('data-composition-id')) || n.querySelector('[data-step]'))) return true;
        }
      }
    }
    return false;
  }
  const seen = typeof MutationObserver === 'function' ? new MutationObserver((r) => { if (touches(r)) dirty = true; }) : null;
  // The observer is on only while the page has steps or step definitions,
  // so a page without either pays nothing for its own DOM changes; it is
  // read again at each run of readiness and each step() call.
  let observing = false;
  function watchRoot(on) {
    if (!seen || on === observing) return;
    seen.disconnect();
    observing = on && !!rootEl;
    if (observing) seen.observe(rootEl, { subtree: true, childList: true, attributes: true, attributeFilter: STEP_ATTRS });
  }

  // The composition root, checked at each lookup, so a root that a new
  // [data-root="true"] replaces is let go even while it is still on the page.
  function rootNow() {
    const r = compositionRoot(document);
    if (r !== rootEl) {
      watchRoot(false);
      rootEl = r;
      dirty = true;
    }
    return r;
  }

  // The steps on the page now: kept, and worked out again when they, their
  // timing or the definitions change.
  function steps() {
    const root = rootNow();
    if (!seen || (observing && touches(seen.takeRecords()))) dirty = true;
    const key = timingEpoch() + '|' + store.duration;
    if (!dirty && key === tableKey) return table;
    dirty = false;
    tableKey = key;
    const els = root ? Array.from(root.querySelectorAll('[data-step]')) : [];
    const total = store.duration;
    const list = [];
    const ids = new Set();
    refs = new Set();
    els.forEach((el, n) => {
      const start = parseStart(el.getAttribute('data-start'));
      if (start && start.kind === 'reference') refs.add(start.refId).add(start.name);
      if (!el.id || !el.hasAttribute('data-start')) {
        if (__DEV__) onceEl(el, 'none', 'the data-step element ' + clipName(el) + ' has ' + (el.id ? 'no data-start' : 'no id') + ', so it is no step',
          'A step is a clip named by its id: give it an id and a data-start, such as data-start="0" or data-start="intro".');
        return;
      }
      if (__DEV__) {
        const up = el.parentElement && el.parentElement.closest('[data-step]');
        if (up && root.contains(up)) {
          onceEl(el, 'inside', 'the step ' + clipName(el) + ' sits inside the step ' + clipName(up) + '; a number in data-start counts from the composition and not from the step around it, so the inner step cuts the outer one in two',
            'Take data-step off one of them, or put the inner step beside the outer one, timed from it (data-start="' + up.id + '").');
        }
        if (ids.has(el.id)) {
          onceEl(el, 'id', 'two data-step elements have the id ' + el.id + "; step('" + el.id + "') applies to both, and go('" + el.id + "') enters only the first",
            'Give each step an id of its own.');
        }
      }
      ids.add(el.id);
      const tm = resolveTiming(el);
      list.push({ el, id: el.id, start: tm.start, own: tm.duration, n });
    });
    list.sort((a, b) => a.start - b.start || a.n - b.n);
    list.forEach((s, k) => {
      const next = list[k + 1];
      s.end = next ? next.start : s.own > 0 ? s.start + s.own : Math.max(total, s.start);
      if (__DEV__ && next && next.start - s.start <= EPS) {
        onceEl(s.el, 'tie', 'the steps ' + clipName(s.el) + ' and ' + clipName(next.el) + ' start together, at ' + s.start + ' s, so the first has no range: from that time on, the time is the second step\'s',
          'Start ' + clipName(s.el) + ' earlier, or ' + clipName(next.el) + ' later.');
      }
    });
    if (__DEV__ && total > 0) {
      for (const s of list) {
        if (s.start < total - EPS) continue;
        onceEl(s.el, 'end', 'the step ' + clipName(s.el) + ' starts at ' + s.start + " s, at or past the composition's end (" + total + ' s), so it has no frame of its own; go() to it holds on the last frame',
          'Start the step before ' + total + ' s, or lengthen the composition\'s data-duration.');
      }
    }
    if (__DEV__ && list.length && list[0].start > EPS) {
      onceEl(list[0].el, 'first', 'the first step, ' + clipName(list[0].el) + ', starts at ' + list[0].start + ' s; interactive mode never shows the time before it, which only the video plays',
        'Start the first step at 0, or put what comes first in a step of its own.');
    }
    table = list;
    // The scripted paths, by the steps on the page.
    scripted = new Map();
    for (const s of list) {
      const d = defs.get(s.id);
      if (d) for (const { p, v: e } of d.script) { if (!scripted.has(p)) scripted.set(p, []); scripted.get(p).push({ start: s.start, e, id: s.id }); }
    }
    if (__DEV__) {
      for (const [p, l] of scripted) {
        const { e, id } = l[0];
        if (e.set !== undefined && e.at[0] > EPS) {
          once('set ' + id + ' ' + p, CODES.LESSON_GAP, "step('" + id + "').script['" + p + "'] sets its first value at " + e.at[0] + ' s, and no earlier step scripts ' + p + ', so that value also shows from the start of the video until then',
            'Start the settings at 0, with the value before: { at: [0, ' + e.at[0] + '], set: [null, ' + show(e.set[0]) + '] }.');
        }
      }
    }
    // A table that changed leaves interactive mode's place in it behind.
    const sig = list.map((s) => s.id + ' ' + s.start + ' ' + s.end).join('|');
    if (sig !== tableSig) { tableSig = sig; target = null; heldAt = null; }
    watchRoot(defs.size > 0 || list.length > 0);
    return table;
  }

  // The step whose range holds t, or -1.
  function indexAt(tb, t) {
    let i = -1;
    for (let k = 0; k < tb.length; k++) if (started(t, tb[k].start)) i = k;
    return i >= 0 && (t < tb[i].end - EPS || tb[i].end >= store.duration - EPS) ? i : -1;
  }
  // The same for next(), back() and play(), with a time past the last
  // step's end at tb.length: next() does nothing there, and back() enters
  // the last step.
  const navAt = (tb, t) => { const i = indexAt(tb, t); return i < 0 && tb.length && started(t, tb[tb.length - 1].start) ? tb.length : i; };

  const NONE = { entry: [], script: [] };
  const defOf = (s) => (s && defs.get(s.id)) || NONE;
  // Where interactive mode's play() stops for step i, never past the composition's
  // end, and the frame it holds on.
  function stopOf(tb, i) {
    const s = tb[i], w = defOf(s).wait, range = s.end - s.start, d = store.duration;
    const stop = w === false ? s.end : s.start + Math.min(range, w === undefined ? (s.own > 0 ? s.own : range) : w);
    return d > 0 ? Math.min(stop, d) : stop;
  }
  // Never past the composition's last frame, for a step that starts at or
  // past its end (KN-118).
  const holdOf = (tb, i) => {
    const h = Math.max(tb[i].start, lastFrameBefore(stopOf(tb, i), store.fps)), d = store.duration;
    return d > 0 ? Math.min(h, Math.max(0, lastFrameBefore(d, store.fps))) : h;
  };
  const truthy = (path) => !!read(path);
  const canGo = (tb, i) => { const u = defOf(tb[i]).until; return !u || truthy(u); };
  // The last step of the run that starts at step i. A step with wait: false
  // plays on into the next with no hold between, so a run of them plays as
  // one range, to the first step after them that holds. A step that holds
  // on its first frame ends the run before it, and is entered with a seek of
  // its own, as before.
  function runEnd(tb, i) {
    let j = i;
    while (defOf(tb[j]).wait === false && j + 1 < tb.length && holdOf(tb, j + 1) > tb[j + 1].start + EPS) j++;
    return j;
  }
  const cur = (tb) => (target && tb[target.i] ? target.i : navAt(tb, clock.now()));
  // canAdvance: in interactive mode, until allows it, while the step plays as
  // much as at its hold, so the learner never waits on Next once nothing is
  // left for them to do; in video mode, always.
  const adv = (tb) => put('canAdvance', !interactive() || canGo(tb, cur(tb)));

  // ---- the scripts -----------------------------------------------------------------

  // KN-146, once per path.
  function undone(p, list) {
    if (__DEV__) once('146 ' + p, CODES.FOREIGN_WRITE, "'" + p + "' was written in video mode, where the script of step '" + list[0].id + "' writes it; Kinetic put the script's value back",
      "Disable the control in video mode, such as data-bind-attr=\"{ disabled: $kinetic.mode === 'video' }\", and keep watchers from writing a scripted path.");
  }

  // Writes each scripted path's value at t where it differs, then reads them
  // all back. A store's or a component's watcher that writes a scripted path
  // runs inside one of these writes, where changed() cannot tell it from
  // Kinetic's own. So a value that is neither the one Kinetic last wrote to
  // the path nor the script's is someone else's: found before the writes
  // (a watcher of an earlier path, or `foreign`, from fix()), or after them,
  // it is undone with KN-146, once per path between two seeks (correct()).
  // A path whose store does not exist is left to readiness's KN-100.
  const wrote = new Map();     // path -> the value Kinetic last wrote to it
  const corrected = new Set(); // paths undone since the last seek
  function writeScripts(t, foreign) {
    const want = [];
    for (const [p, list] of scripted) {
      if (!wf.getStore(pathOf(p)[0])) continue;
      const v = valueOf(list, t), was = read(p);
      want.push({ p, v, list });
      if (was !== v) {
        if (foreign || (wrote.has(p) && was !== wrote.get(p))) correct(p, list, v);
        else own(() => write(p, v));
      }
      wrote.set(p, v);
    }
    for (const { p, v, list } of want) if (read(p) !== v) correct(p, list, v);
  }
  // One undo of a path, at most, between two seeks: a watcher that writes
  // the path again every time keeps its value after it, with KN-146
  // printed, rather than the two writing in turn on every frame.
  function correct(p, list, v) {
    if (corrected.has(p)) return;
    corrected.add(p);
    undone(p, list);
    own(() => write(p, v));
    wrote.set(p, v);
  }

  // ---- the seek's batch ----------------------------------------------------------

  clock.onWrite((t) => {
    corrected.clear();
    const tb = steps(), i = indexAt(tb, t), s = tb[i];
    put('stepCount', tb.length);
    put('step', s ? s.id : '');
    put('stepIndex', i);
    put('stepStart', s ? s.start : 0);
    put('stepLength', s ? s.end - s.start : 0);
    if (!tb.length && !scripted.size) return;
    watch();
    if (!interactive()) { writeScripts(t); return; }
    // A seek away from the step interactive mode entered, or from its hold.
    if (target && (t < tb[target.i].start - EPS || t > target.hold + EPS)) target = null;
    // Playing through a run: each later step of it is entered on the first
    // frame inside it, its entry written in this batch and its kinetic:step
    // sent once the seek has landed, outside the guard's window.
    if (target && target.last > target.i) {
      const k = Math.min(indexAt(tb, t), target.last);
      while (target.i < k) {
        const s = tb[++target.i];
        for (const { p, v } of defOf(s).entry) write(p, v);
        crossed.push({ g: gen, id: s.id, i: target.i });
      }
    }
    // A seek of the learner's own (seek(), the preview bar's scrub or frame
    // step: the clock is paused for them) that lands in a step before its
    // hold: the step is being done again, so its entry is written, as
    // entering it writes it. The playing clock's frames and Kinetic's own
    // seeks into a step (`steering`) write nothing, nor does a redraw for a
    // scene's state, which is no seek; nor does a seek at or past the hold,
    // so a scrub there keeps the learner's work.
    if (!store.playing && !steering && !clock.redrawing()) {
      const j = indexAt(tb, t);
      if (j >= 0 && t < holdOf(tb, runEnd(tb, j)) - EPS) for (const { p, v } of defOf(tb[j]).entry) write(p, v);
    }
    if (heldAt !== null && Math.abs(t - heldAt) > EPS) { heldAt = null; put('waiting', false); }
    adv(tb);
  });
  // A pause writes `playing` without a seek.
  store.subscribe('playing', () => { if (interactive() && table.length) adv(table); });
  clock.onLanded(() => {
    if (!crossed.length) return;
    for (const c of crossed.splice(0)) {
      if (c.g === gen && interactive()) document.dispatchEvent(new CustomEvent('kinetic:step', { detail: { step: c.id, index: c.i } }));
    }
  });

  // ---- the stores ------------------------------------------------------------------

  // One listener per scripted path and per until path of a step on the page,
  // added once its store exists. A state field is listened to on its own: a
  // subscription to the whole store would make every computed of the store
  // run on every change. An until path that names a computed takes the
  // whole store, since the store's notice of one computed comes only at the
  // flush after the change, and canAdvance follows the answer in the task
  // that wrote it; a computed reading another store is heard through that
  // notice. In video mode a write that is not Kinetic's own is undone in a
  // microtask; in interactive mode an until path that turns truthy at a hold sends
  // the lesson on, through the rest of the step's range. A store registered again under a path's name (unregister,
  // then store()) is listened to in its place, as it arrives, and what it
  // holds is read at once; the dead store's notices are ignored.
  let fixing = false;
  function listen(p) {
    const [n, f] = pathOf(p), st = wf.getStore(n);
    if (!st || watched.get(p) === st) return;
    watched.set(p, st);
    st.subscribe(isField(st, f.split('.')[0]) ? f : '', () => { if (watched.get(p) === st) changed(); });
  }
  document.addEventListener('wildflower:store-ready', (e) => {
    const n = e.detail && e.detail.storeName;
    for (const p of watched.keys()) {
      if (pathOf(p)[0] === n) { watch(); changed(); return; }
    }
  });
  function watch() {
    for (const p of scripted.keys()) listen(p);
    for (const s of table) { const u = defOf(s).until; if (u) listen(u); }
  }
  function changed() {
    if (writing) return;
    if (!interactive()) {
      if (!fixing) { fixing = true; queueMicrotask(fix); }
      return;
    }
    const tb = table;
    adv(tb);
    if (heldAt !== null && target && defOf(tb[target.i]).until && store.canAdvance) later(target.i);
  }
  function fix() {
    fixing = false;
    if (!interactive()) writeScripts(clock.now(), true);
  }

  // ---- interactive mode: entering a step ------------------------------------------------

  function enter(i, withEntry) {
    // The fps and duration the clock will hold with, read first.
    clock.resolveComposition();
    const tb = steps(), s = tb[i];
    if (withEntry) for (const { p, v } of defOf(s).entry) write(p, v);
    const last = runEnd(tb, i), hold = holdOf(tb, last), g = ++gen;
    target = { i, hold, last };
    heldAt = null;
    put('waiting', false);
    adv(tb);
    const first = hold <= s.start + EPS;
    steering++;
    let p;
    try { p = first ? clock.seekSettled(hold < s.start - EPS ? hold : s.start) : clock.playRange({ from: s.start, to: stopOf(tb, last) }); } finally { steering--; }
    if (p) p.then(() => {
      if (g !== gen || !interactive()) return;
      document.dispatchEvent(new CustomEvent('kinetic:step', { detail: { step: s.id, index: i } }));
      if (first) held(hold);
    }, () => {});
  }

  // The hold's seek has settled, at the hold or at the end of a play-out
  // (target.out, after until): the step waits there for Next, and
  // a truthy until at a hold before the range's end plays the rest.
  function held(h) {
    if (!target || !interactive() || Math.abs(h - target.hold) > EPS || Math.abs(clock.now() - h) > EPS) return;
    heldAt = h;
    const tb = table, i = target.i, d = defOf(tb[i]);
    if (d.wait === false && !target.out) { if (i + 1 < tb.length) enter(i + 1, true); return; }
    // canAdvance first, so a listener to waiting reads the hold's.
    adv(tb);
    put('waiting', true);
    if (!target.out && d.until && truthy(d.until)) later(i);
  }
  clock.onHold(held);

  // The last frame of step i's range, never past the composition's.
  const endHold = (tb, i) => {
    const s = tb[i], d = store.duration, to = d > 0 ? Math.min(s.end, d) : s.end;
    return { to, hold: Math.max(s.start, lastFrameBefore(to, store.fps)) };
  };

  // The play-out: the rest of step i's range, from the clock's time to its
  // last frame, where the step holds again; Next skips what is left of it.
  function playOut(tb, i) {
    const { to, hold } = endHold(tb, i);
    target = { i, hold, last: i, out: true };
    heldAt = null;
    put('waiting', false);
    gen++;
    steering++;
    try { clock.play({ to }); } finally { steering--; }
    adv(tb);
  }

  // Once until allows it at a hold before the end of the step's range, the
  // rest of the range (the play-out), from a task of Kinetic's own, so the
  // handler that wrote the answer and its flush have both finished. A hold at
  // the range's end stays where it is, waiting for Next.
  function later(i) {
    setTimeout(() => {
      const tb = table;
      if (!(interactive() && target && target.i === i && heldAt !== null && !target.out && canGo(tb, i))) return;
      if (target.hold < endHold(tb, i).hold - EPS) playOut(tb, i);
    }, 0);
  }

  // ---- next(), back(), go(), play() --------------------------------------------------

  // Video mode: a seek, after which a clock that was playing plays on with
  // the hold it had, such as the end of play({ from: 0 }), when the hold is
  // still ahead; past it, it plays on with none, so the clock never goes back.
  function jump(t) {
    const was = store.playing, hold = clock.holding(), resume = clock.suspend();
    clock.seek(t);
    if (!was) return;
    if (hold === null || t < hold - EPS) resume();
    else clock.play();
  }

  function next() {
    resolve();
    const tb = steps();
    if (!tb.length) return;
    if (!interactive()) { const i = navAt(tb, clock.now()); if (i + 1 < tb.length) jump(tb[i + 1].start); return; }
    // Nothing while until holds the step; otherwise the next step at once,
    // wherever the step is, leaving the rest of it to the video.
    const i = cur(tb);
    if (i >= tb.length || !canGo(tb, i)) return;
    if (i + 1 < tb.length) enter(i + 1, true);
  }

  function back() {
    resolve();
    const tb = steps();
    const i = interactive() ? cur(tb) : navAt(tb, clock.now());
    if (i <= 0) return;
    if (interactive()) enter(i - 1, true);
    else jump(tb[i - 1].start);
  }

  function go(which) {
    resolve();
    const tb = steps();
    let i;
    if (typeof which === 'number') i = Number.isInteger(which) && which >= 0 && which < tb.length ? which : -1;
    else if (typeof which === 'string') i = tb.findIndex((s) => s.id === which);
    else throw fail(CODES.BAD_CALL, 'go(step)', __DEV__ && "step is a step's id, or an id or an index from 0, not " + show(which));
    if (i < 0) throw fail(CODES.BAD_CALL, typeof which === 'number' ? 'go(' + which + ')' : "go('" + which + "')", __DEV__ && 'the composition has no step ' + show(which) + '; its steps are ' + (tb.map((s) => s.id).join(', ') || 'none'));
    if (interactive()) enter(i, true);
    else jump(tb[i].start);
  }

  // Interactive mode with steps: on to the step's hold, or at or past it the step
  // again from its start; in a paused play-out, on to the step's end; before the first step, the first; past the last
  // one's end, on to the composition's end, and at the end the last step
  // again. Otherwise, and for play({ from, to }), the clock's.
  function play(range) {
    resolve();
    const tb = range === undefined && interactive() ? steps() : [];
    if (!tb.length) { clock.play(range); return; }
    const i = cur(tb), now = clock.now();
    if (i < 0) { enter(0, false); return; }
    if (i === tb.length) {
      const d = store.duration;
      if (!(d > 0 && now < lastFrameBefore(d, store.fps) - EPS)) { enter(i - 1, true); return; }
      target = null;
      heldAt = null;
      gen++;
      clock.play({ to: d });
      return;
    }
    // Paused in the play-out: on to the step's end, the answer kept.
    if (target && target.out && target.i === i && now < target.hold - EPS) {
      heldAt = null;
      gen++;
      steering++;
      try { clock.play({ to: endHold(tb, i).to }); } finally { steering--; }
      return;
    }
    const last = runEnd(tb, i), hold = holdOf(tb, last);
    if (now >= hold - EPS) { enter(i, true); return; }
    target = { i, hold, last };
    heldAt = null;
    gen++;
    steering++;
    try { clock.play({ to: stopOf(tb, last) }); } finally { steering--; }
  }

  // ---- the mode --------------------------------------------------------------------

  function resolve() {
    const setting = clock.mode();
    const decided = forced || clock.hasRuntime() || self.__HF_RENDER_CAPTURE_MODE || setting === 'video';
    const m = decided || (setting === 'auto' && clock.previewing()) ? 'video' : 'interactive';
    // A lesson the preview bar alone put in video mode plays as a video, and
    // its controls are written over by the scripts. Said once the page has
    // loaded (onReady() resolves the mode then), so the page's own
    // config({ mode: 'interactive' }) after Kinetic's tag comes first.
    if (__DEV__ && m === 'video' && !decided && !warned.has('158') && document.readyState === 'complete' && steps().length) {
      once('158', CODES.PREVIEW_VIDEO, 'the composition ' + clipName(rootNow()) + " has steps, and the preview bar put it in video mode, as config({ mode: 'auto' }) does with the bar up; a lesson in video mode plays as a video, so its steps never hold and its controls stop working",
        "For the lesson, remove data-preview from the script tag (or ?preview from the URL), or call wildflower.kinetic.config({ mode: 'interactive' }) to keep the bar.");
    }
    if (m === store.mode) return;
    if (m === 'video') {
      steps();
      kept = new Map();
      for (const p of scripted.keys()) if (wf.getStore(pathOf(p)[0])) kept.set(p, read(p));
      store.mode = 'video';
      put('waiting', false);
      put('canAdvance', true);
      watch();
      // The learner's values are no write of anyone else's.
      wrote.clear();
      corrected.clear();
      wf.batch(() => writeScripts(clock.now()));
    } else {
      // The learner's values, still in video mode, then interactive mode.
      if (kept) own(() => { for (const [p, v] of kept) write(p, v); });
      kept = null;
      wrote.clear();
      store.mode = 'interactive';
      const tb = steps(), now = clock.now();
      // The step interactive mode entered is kept only when the clock is back inside
      // it, as check() and render() leave it after their seek back.
      if (target && !(tb[target.i] && now >= tb[target.i].start - EPS && now <= target.hold + EPS)) { target = null; heldAt = null; }
      if (heldAt !== null && Math.abs(now - heldAt) > EPS) heldAt = null;
      put('waiting', heldAt !== null);
      adv(tb);
    }
    for (const fn of modeHooks) fn(m);
  }
  const modeHooks = [];

  // check() and render(): video mode until the returned function is called.
  function force() {
    forced++;
    resolve();
    let done = false;
    return () => { if (!done) { done = true; forced--; resolve(); } };
  }

  clock.onBeforeSeek(resolve);

  // ---- readiness -------------------------------------------------------------------

  // Each run of readiness: the table, the step fields, the stores listened
  // to, the script paths checked (KN-100 fails the run, with the store or
  // the field in its where), and in development what KN-157 says.
  // `followed` lists a scene and a path for each live scene's follower. The
  // steps are read afresh, for a page whose observer is off.
  function check(followed) {
    dirty = true;
    const tb = steps();
    wf.batch(() => {
      const i = indexAt(tb, clock.now()), s = tb[i];
      put('stepCount', tb.length);
      put('step', s ? s.id : '');
      put('stepIndex', i);
      put('stepStart', s ? s.start : 0);
      put('stepLength', s ? s.end - s.start : 0);
    });
    watch();
    const has = (path) => !!wf.getStore(pathOf(path)[0]);
    if (__DEV__) {
      const on = new Set(tb.map((s) => s.id));
      for (const [id, d] of defs) {
        if (!on.has(id)) once('none ' + id, CODES.LESSON_GAP, "step('" + id + "') names no data-step element in the composition, so its definition is not used",
          'Give the clip id="' + id + '" and data-step, or remove the definition.');
        else if (d.until && !has(d.until)) once('until ' + id, CODES.LESSON_GAP, "step('" + id + "').until reads " + d.until + ', and no store named ' + pathOf(d.until)[0] + ' exists at readiness, so interactive mode never goes on from that step by itself',
          'Define the store with wildflower.store() before the page has loaded.');
      }
      for (const [scene, path] of followed) {
        if (!has(path)) once('follow ' + scene + ' ' + path, CODES.LESSON_GAP, "scene '" + scene + "' follows " + path + ', and no store named ' + pathOf(path)[0] + ' exists at readiness, so the follower reads 0',
          'Define the store with wildflower.store() before the page has loaded.');
      }
      tb.forEach((s, i) => {
        const w = defOf(s).wait;
        if (typeof w === 'number' && w > s.end - s.start + EPS) once('wait ' + s.id, CODES.LESSON_GAP, "step('" + s.id + "') has wait: " + w + ', longer than its range of ' + (s.end - s.start) + ' s, which ends ' + (i + 1 < tb.length ? 'where the next step starts' : 'with the step') + ', so interactive mode holds on the last frame of the range',
          'Give wait a number of seconds up to ' + (s.end - s.start) + ', or lengthen the step.');
      });
    }
    for (const [p, list] of scripted) {
      const [n, f] = pathOf(p), st = wf.getStore(n), field = f.split('.')[0];
      const where = "step('" + list[0].id + "').script['" + p + "']";
      if (!st) return Promise.reject(fail(CODES.BAD_CALL, where + ', store ' + n, __DEV__ && 'no store named ' + n + ' exists; a script writes the state fields of a store'));
      if (!isField(st, field)) return Promise.reject(fail(CODES.BAD_CALL, where + ', field ' + field, __DEV__ && field + ' is no state field of the store ' + n + ' (a computed, or a name it does not have); a script writes state fields'));
    }
    return Promise.resolve();
  }

  // The registered run of readiness has resolved: with autoplay on, an
  // interactive page with steps enters its first step; with it off, it shows the first
  // frame of the first step. The mode is read first, since the HyperFrames
  // runtime can have arrived since the last seek.
  function start() {
    resolve();
    const tb = steps();
    if (!interactive() || !tb.length || target) return;
    if (clock.autoplay()) enter(0, true);
    else if (clock.now() < tb[0].start) clock.seek(tb[0].start);
  }

  return {
    step, next, back, go, play, resolve, force, check, start, valueOf,
    // The scripts of a path, or undefined (follow.js).
    scriptOf: (path) => (steps(), scripted.get(path)),
    // An interactive page with steps: onReady() leaves its autoplay to start().
    takes: () => interactive() && steps().length > 0,
    // KN-132 and KN-143 are off (readiness.js, guard.js).
    quiet: () => interactive() && steps().length > 0,
    onMode(fn) { modeHooks.push(fn); },
  };
}
