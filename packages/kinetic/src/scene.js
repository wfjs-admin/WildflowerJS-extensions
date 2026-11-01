/**
 * scene(name, definition): a component whose every frame is a function of
 * time. The definition is an ordinary component definition; the extension
 * subscribes it to the clock store and adds the computeds a scene reads:
 *
 *   time        composition seconds, the clock store's own value
 *   local       seconds since this scene's clip started (data-start, with
 *               the host composition's offset, plus data-playback-start),
 *               held at the clip's edges: 0 before it starts and its
 *               duration after it ends. Outside its clip a scene is hidden,
 *               so there its local stands still, and its computeds and
 *               seek(local) run no more
 *   clipFrame   Math.round(local * fps), the frame number within the clip,
 *               of the frame's own time during a render's shutter samples
 *   fps         the clock's frames per second, the clock store's own value
 *   progress    0 to 1 from the clip's start to its last captured frame,
 *               duration - 1/fps; 0 when it has no duration
 *   remaining   seconds until the clip ends; Infinity when it has no end
 *   enter       0 to 1 over the first `edges.enter` seconds; 1 without edges
 *   exit        0 to 1 over the `edges.exit` seconds that end on the last
 *               captured frame; 0 without edges
 *   presence    enter * (1 - exit): 0 at both ends of the clip, 1 between
 *   vars        the composition variables HyperFrames resolved for this element
 *
 * A render captures frames 0 to duration * fps - 1, so the clip's last
 * captured frame is duration - 1/fps after its start, and progress and exit
 * reach 1 there: a fade out is complete in the file.
 *
 * plus one optional method, seek(local), called after every seek with the
 * clip-local time, and once when the scene initializes; in interactive mode a
 * change to the scene's state while the clock stands still seeks the time
 * again, so it runs then too. A seek that leaves the scene's local as it
 * was at the scene's last seek, on the same side of its clip's start, does
 * not call it (a scene outside its clip draws its edge frame once, then
 * nothing until its clip comes round); a redraw for a change of state,
 * the first seek after a change of mode or fps, and every seek of check()
 * always do. A promise it returns
 * holds the render's frame capture until it settles. It runs before the
 * frame's bindings are written, so a computed a binding reads sees what it
 * set (a camera aimed for view.projectPoint()).
 *
 * A `keyframes` block declares keyframe tracks as data: each entry becomes a
 * computed of `local`, a style object for an object of tracks or one value
 * for a single track (motion.js, styleAt() and interpolate(t, track)). Checked when the scene is defined.
 *
 * A pool inside the scene is flushed by every seek (clock.js calls
 * wildflower.flushPools() once the seek's scenes have settled), so what
 * seek(local) wrote to its entities is in the DOM when the frame is
 * captured, with no animation frame needed.
 *
 * `inputs` declares what the scene needs from its composition variables,
 * typed like props: { name: { type, required, default, validator } } or
 * { name: String }. The values are read from the scene's own composition,
 * coerced to the type and validated the first time `this.inputs` is read,
 * which the first render or init() does, and readiness does for every
 * live scene before frame 0. A failure is KN-130: a console error on every
 * build, and readiness holds so the render fails instead of capturing a
 * wrong video. (Validation cannot wait for the component:beforeInit hook:
 * init is deferred to a later task, and bindings render before it.)
 *
 * `waitFor` names the queries readiness waits for before frame 0.
 *
 * A `follow` block eases values toward store paths by a spring, each entry
 * a computed (follow.js). Checked when the scene is defined; a follow entry
 * wins over a computed or keyframes entry of the same name (KN-153).
 *
 * A data-list row may bind `$kinetic.time` or `local` alike; both follow
 * every seek (test/rows-store.test.js pins it).
 */

import { STORE_NAME, FOLLOW_STORE } from './names.js';
import { CODES, warn, fail, show } from './diagnostics.js';
import { timingElement, resolveTiming, readVariables, declaredDefaults, timingEpoch } from './timing.js';
import { styled, foldOf, checkTracks } from './motion.js';
import { EPS } from './clips.js';

// The page's own clock, taken before guard.js can wrap performance.now()
// for a seek, to time the settle hook's wait for inits.
const perfNow = typeof performance !== 'undefined' ? performance.now.bind(performance) : Date.now;

const PROVIDED = ['time', 'local', 'clipFrame', 'fps', 'progress', 'remaining', 'enter', 'exit', 'presence', 'vars', 'inputs'];

// Development: the computed of a keyframes entry of several tracks, whose
// style object is handed out behind a proxy that warns (KN-159), once per
// scene, entry and key, when code reads a key the object does not have and
// a style could: a track key styleAt() folds into transform or filter, such as
// translateY, or a CSS property. A symbol, then, toJSON, a framework's own
// field or a key the object has passes through without a word, and
// data-bind-style reads only the keys the object has. The production build
// hands out the object itself.
const styleReads = new Set();
let probe;
function watchedPose(name, k, spec) {
  return function () {
    return new Proxy(styled(this.local, spec), {
      get(o, key) {
        if (typeof key === 'string' && !(key in o)) {
          probe = probe || document.createElement('div').style;
          const fold = spec[key] != null ? foldOf(key) : '';
          const id = name + ' ' + k + ' ' + key;
          if ((fold || (typeof probe[key] === 'string' && key !== 'cssText')) && !styleReads.has(id)) {
            styleReads.add(id);
            warn(CODES.STYLE_READ, "scene '" + name + "': '" + k + "' is a style object (" + Object.keys(o).join(', ') + '); '
              + (fold ? key + ' is folded into ' + fold : 'it has no ' + key) + ', so reading ' + key + ' gives undefined',
              fold ? 'For the number, give ' + key + ' its own keyframes entry or call styleAt().' : "Read the keys it has, or bind the whole object with data-bind-style=\"" + k + '".');
          }
        }
        return o[key];
      },
    });
  };
}

// The binding attributes a root tag can carry, with and without the wf
// prefix, for the KN-154 check.
const ROOT_BINDINGS = ['bind', 'bind-style', 'bind-class', 'bind-attr', 'bind-html', 'show', 'render', 'model']
  .flatMap((k) => ['data-' + k, 'data-wf-' + k]);
const IDENT = /[A-Za-z_$][\w$]*/g;
const STRINGS = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

// The names an expression reads from its own scope: not the words inside a
// string literal, not a member after a dot (cfg.progress), not a store
// path ($kinetic.time), and not an object-literal key ({ opacity: progress }
// reads progress only).
function scopeNames(expr) {
  const src = expr.replace(STRINGS, "''");
  const out = [];
  for (const m of src.matchAll(IDENT)) {
    if (m[0][0] === '$') continue;
    let i = m.index - 1;
    while (i >= 0 && (src[i] === ' ' || src[i] === '\t' || src[i] === '\n')) i--;
    if (src[i] === '.') continue;
    let j = m.index + m[0].length;
    while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\n')) j++;
    if (src[j] === ':' && (i < 0 || src[i] === '{' || src[i] === ',')) continue;
    out.push(m[0]);
  }
  return out;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// clamp01, with a value a rounding error short of 1 taken as 1: the last
// frame's time is a frame number over the fps, which division leaves at
// 0.9999999999999998 of the way.
const toOne = (v) => (v > 1 - 1e-9 ? 1 : v < 0 ? 0 : v);

const TYPES = new Map([[String, 'String'], [Number, 'Number'], [Boolean, 'Boolean']]);

// One input's value from the composition's variables: the default when the
// variable is absent, coerced to the declared type, then validated. Returns
// { value } or { error }, whose value is the sentence for the development
// build's KN-130 message and false in production. A blank string is no
// Number and no Boolean, so for those two types it counts as absent; a
// String, or an input with no type, keeps it as written.
function readInput(name, decl, vars) {
  let v = Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : undefined;
  const blank = typeof v === 'string' && v.trim() === '' && (decl.type === Number || decl.type === Boolean);
  if (v === undefined || v === null || blank) {
    if (decl.default !== undefined) v = decl.default;
    else if (decl.required) return { error: __DEV__ && (blank ? "is required and the composition's variable '" + name + "' is empty" : "is required and the composition has no variable '" + name + "'") };
    else return { value: undefined };
  }
  if (decl.type === Number) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
    if (!Number.isFinite(n)) return { error: __DEV__ && show(v) + ' is not a Number' };
    v = n;
  } else if (decl.type === Boolean) {
    if (v === true || v === 'true' || v === 1 || v === '1') v = true;
    else if (v === false || v === 'false' || v === 0 || v === '0') v = false;
    else return { error: __DEV__ && show(v) + ' is not a Boolean' };
  } else if (decl.type === String) {
    v = typeof v === 'string' ? v : String(v);
  }
  if (typeof decl.validator === 'function') {
    let ok;
    try { ok = decl.validator(v); } catch (e) { return { error: __DEV__ && 'failed its validator, which threw ' + show(e && e.message || String(e)) }; }
    if (!ok) return { error: __DEV__ && show(v) + ' failed its validator' };
  }
  return { value: v };
}

function checkInputs(name, inputs) {
  if (!inputs || typeof inputs !== 'object') throw fail(CODES.BAD_CALL, "scene('" + name + "').inputs", __DEV__ && 'inputs is an object of { type, required, default, validator } by input name');
  const out = {};
  for (const k of Object.keys(inputs)) {
    const d = inputs[k];
    const decl = TYPES.has(d) ? { type: d } : d;
    if (!decl || typeof decl !== 'object') throw fail(CODES.BAD_CALL, "scene('" + name + "').inputs." + k, __DEV__ && 'String, Number, Boolean or { type, required, default, validator }');
    if (decl.type !== undefined && !TYPES.has(decl.type)) throw fail(CODES.BAD_CALL, "scene('" + name + "').inputs." + k + '.type', __DEV__ && 'type is String, Number or Boolean');
    if (decl.validator !== undefined && typeof decl.validator !== 'function') throw fail(CODES.BAD_CALL, "scene('" + name + "').inputs." + k + '.validator', __DEV__ && 'validator is a function');
    out[k] = decl;
  }
  return out;
}

export function createScenes(wf, clock, follows) {
  const scenes = new Map();     // name -> { edges, waitFor, inputs, names, follow }
  const live = new Set();       // instances of scenes, from afterInit to beforeDestroy
  const timings = new WeakMap(); // element -> resolved timing
  const inputsOf = new WeakMap(); // element -> { values } or { error }
  let onFailure = null;         // readiness.js reports KN-130 through here
  const sceneEls = new WeakSet(); // the element of every scene that has begun to initialise
  // Development: the names of scenes that define tick(), and those KN-151
  // has named. A scene's tick() runs only in interactive mode, so it is
  // named once it is on the page in video mode (a render(), the runtime or
  // the setting), where what tick() changes is missing from the video. A
  // check() compares frames and makes no video, so it names nothing, and
  // an interactive page using tick() hears nothing.
  const tickers = new Set();
  const tickNamed = new Set();
  function checkTicks() {
    if (!__DEV__ || !tickers.size || clock.store.mode !== 'video' || clock.checking > 0) return;
    for (const inst of live) {
      const n = inst.name;
      if (!tickers.has(n) || tickNamed.has(n)) continue;
      tickNamed.add(n);
      warn(CODES.SCENE_TICK, "scene '" + n + "' defines tick(), and the page is in video mode (a render(), the HyperFrames runtime or config({ mode: 'video' })), where tick() never runs, so what it changes is missing from the video",
        "Keep what the video shows a function of local. For what a lesson does on its own while a step holds, such as physics, use a store's tick(dt), which runs in both modes, and return early unless wildflower.getStore('kinetic') has mode 'interactive' and waiting true.");
    }
  }

  // A layer's `scene` option: the scene's own component (`this` in its
  // methods), whose local time the layer follows and with which it is
  // disposed. Returns the scene's element, or null when the option is left
  // out; anything else is KN-100. `pre` starts the call, as 'effect(canvas, '.
  function sceneOf(v, pre) {
    if (v === undefined) return null;
    if (v && typeof v === 'object' && !v.nodeType && v.element && sceneEls.has(v.element)) return v.element;
    throw fail(CODES.BAD_CALL, pre + '{ scene })', __DEV__ && ("scene is the scene's own component, this in its init() or seek(), not "
      + (v && v.localName ? 'a <' + v.localName + '> element' : typeof v === 'string' ? "a name ('" + v + "')" : show(v))
      + (v && v.element ? ", whose element is no scene's" : '')));
  }

  // Reads and checks an element's inputs once; the values, or throws the
  // KN-130 error, on this and every later read.
  const clashWarned = new Set();   // 'scene|input' already warned about (KN-134)
  function inputsFor(el, sceneName, decls) {
    let r = inputsOf.get(el);
    if (!r) {
      // The composition's declared default is a variable, so it is the
      // value the input reads; a different default on the input never shows.
      if (__DEV__) {
        const html = declaredDefaults(el.ownerDocument);
        for (const k of Object.keys(decls)) {
          const own = decls[k].default;
          if (own === undefined || !(k in html) || String(html[k]) === String(own) || clashWarned.has(sceneName + '|' + k)) continue;
          clashWarned.add(sceneName + '|' + k);
          warn(CODES.DEFAULT_CLASH, "scene '" + sceneName + "' input '" + k + "' has the default " + JSON.stringify(own) + ', and the composition declares ' + JSON.stringify(html[k])
            + " for it in data-composition-variables; the composition's default is the one the scene reads, with the runtime and without it",
          "Keep one default: drop it from the scene's inputs, or make the two agree.");
        }
      }
      const vars = readVariables(el);
      const values = {};
      r = { values };
      for (const k of Object.keys(decls)) {
        const read = readInput(k, decls[k], vars);
        if ('error' in read) {
          r = { error: fail(CODES.BAD_INPUT, "scene '" + sceneName + "' input '" + k + "'", __DEV__ && read.error) };
          break;
        }
        values[k] = read.value;
      }
      inputsOf.set(el, r);
      if (r.error && onFailure) onFailure(r.error);
    }
    if (r.error) throw r.error;
    return r.values;
  }

  // Resolved once per element, and again when a timing attribute on the
  // page changes or a footage file's length arrives (the timing epoch,
  // clips.js and timing.js), either of which can move a clip timed from
  // that element. The warnings print once.
  function timingFor(el) {
    let tm = timings.get(el);
    if (tm && tm.epoch === timingEpoch()) return tm;
    const first = !tm;
    const clip = timingElement(el);
    if (clip) {
      const r = resolveTiming(clip);
      tm = { start: r.start, duration: r.duration, playbackStart: r.playbackStart };
      if (__DEV__ && first && r.missing.length) {
        warn(CODES.BAD_REFERENCE, "data-start on the scene's clip names '" + r.missing[0] + "', which is no element's id or composition id, so the clip starts at 0",
          'Give the referenced clip that id, or write the start in seconds.');
      }
    } else {
      tm = { start: 0, duration: null, playbackStart: 0 };
      if (__DEV__ && first) {
        warn(CODES.NO_TIMING, "a scene element has no data-start and no ancestor with data-start or data-composition-id, so its local time equals the composition time",
          'Put the scene inside the composition root, or give it data-start and data-duration of its own.');
      }
    }
    tm.epoch = timingEpoch();
    timings.set(el, tm);
    return tm;
  }

  // The clip's length, or what is left of the composition from its start.
  function durationFor(el) {
    const tm = timingFor(el);
    if (tm.duration != null) return tm.duration;
    const total = clock.store.duration;
    return total > 0 ? Math.max(0, total - tm.start) : 0;
  }

  // A scene's local time, held at its clip's edges: the seconds since the
  // clip started, 0 before it and the clip's duration after it (no upper
  // bound for a clip with no duration, which runs to the composition's
  // end), plus data-playback-start. Outside its clip the scene is hidden,
  // so its local stands still there, and what reads it runs no more.
  function localOf(el, time) {
    const tm = timingFor(el);
    let l = time - tm.start;
    if (l <= 0) l = 0;
    else if (tm.duration != null && l > tm.duration) l = tm.duration;
    return l + tm.playbackStart;
  }
  // Whether time t is inside the scene's clip, its window [start, start +
  // duration), as clips.js shows a clip: a clip that ends with the
  // composition is shown on its final instant too.
  function insideAt(el, time) {
    const tm = timingFor(el), l = time - tm.start, d = tm.duration, total = clock.store.duration;
    if (l < -EPS) return false;
    return d == null || l < d - EPS || (total > 0 && tm.start + d >= total - EPS);
  }

  function computedsFor(edges, name, inputs) {
    return {
      time() { return this.stores[STORE_NAME].time; },
      local() { return localOf(this.element, this.stores[STORE_NAME].time); },
      // During a render's seek, the number of the frame the seek belongs to:
      // a shutter's sample past the middle of frame i still gives i (clock.js).
      clipFrame() {
        const l = this.local, at = clock.anchor();
        return Math.round((at === null ? l : localOf(this.element, at)) * this.stores[STORE_NAME].fps);
      },
      // The clock's frames per second: a render's own, else the root's
      // data-fps, else config({ fps }), else 30.
      fps() { return this.stores[STORE_NAME].fps; },
      // progress and exit end on the clip's last captured frame, d - 1/fps.
      // A clip of one frame or less has progress 1 from its start.
      progress() {
        const d = durationFor(this.element);
        if (!(d > 0)) return 0;
        const last = d - 1 / this.stores[STORE_NAME].fps;
        return last > 0 ? toOne(this.local / last) : this.local >= 0 ? 1 : 0;
      },
      remaining() { const d = durationFor(this.element); return d > 0 ? d - this.local : Infinity; },
      enter() { return edges.enter > 0 ? clamp01(this.local / edges.enter) : 1; },
      exit() {
        const d = durationFor(this.element);
        return edges.exit > 0 && d > 0 ? toOne((this.local - (d - 1 / this.stores[STORE_NAME].fps - edges.exit)) / edges.exit) : 0;
      },
      presence() { return this.enter * (1 - this.exit); },
      vars() { return readVariables(this.element); },
      // A failed input reads as no inputs here: readiness has printed its
      // KN-130 and fails with it, and a throw would have the framework print
      // it again.
      inputs() {
        try { return inputs ? inputsFor(this.element, name, inputs) : {}; } catch (e) { if (e && e.code === CODES.BAD_INPUT) return {}; throw e; }
      },
    };
  }

  // The author's subscribe block with the clock store added, and for a scene
  // that follows, the followers' seconds, in whichever of the two shapes it
  // uses.
  function withClock(sub, follow) {
    const add = follow ? [STORE_NAME, FOLLOW_STORE] : [STORE_NAME];
    if (Array.isArray(sub)) return sub.concat(add.filter((n) => !sub.includes(n)));
    if (sub && typeof sub === 'object') {
      const o = {};
      for (const n of add) if (!(n in sub)) o[n] = [];
      return Object.assign(o, sub);
    }
    return add;
  }

  function scene(name, def) {
    if (typeof name !== 'string' || !name) throw fail(CODES.BAD_CALL, 'scene(name)', __DEV__ && "name is the scene's component name, used as data-component");
    if (!def || typeof def !== 'object') throw fail(CODES.BAD_CALL, "scene('" + name + "', definition)", __DEV__ && 'definition is an object');
    const edges = { enter: 0, exit: 0 };
    if (def.edges !== undefined) {
      if (!def.edges || typeof def.edges !== 'object') throw fail(CODES.BAD_CALL, "scene('" + name + "').edges", __DEV__ && 'edges is { enter, exit } in seconds');
      for (const k of ['enter', 'exit']) {
        if (def.edges[k] === undefined) continue;
        if (!(typeof def.edges[k] === 'number' && def.edges[k] >= 0)) throw fail(CODES.BAD_CALL, "scene('" + name + "').edges." + k, __DEV__ && 'edges.' + k + ' is a number of seconds, 0 or more, not ' + show(def.edges[k]));
        edges[k] = def.edges[k];
      }
    }
    let waitFor = [];
    if (def.waitFor !== undefined) {
      if (!Array.isArray(def.waitFor) || def.waitFor.some((n) => typeof n !== 'string' || !n)) throw fail(CODES.BAD_CALL, "scene('" + name + "').waitFor", __DEV__ && 'waitFor is an array of query names');
      waitFor = def.waitFor.slice();
      if (__DEV__ && waitFor.length && wf.features && wf.features.query === false) {
        warn(CODES.NO_QUERIES, "scene '" + name + "' has waitFor, but this framework build (" + (wf.tier || 'unknown tier') + ') has no queries, so nothing is waited for',
          'Load the full tier (wildflower.full.min.js) for a composition that reads data through wildflower.query.');
      }
    }
    const inputs = def.inputs === undefined ? null : checkInputs(name, def.inputs);
    const keyed = {};
    if (def.keyframes !== undefined) {
      if (!def.keyframes || typeof def.keyframes !== 'object') throw fail(CODES.BAD_TRACK, "scene('" + name + "').keyframes", __DEV__ && 'keyframes is an object of named tracks');
      for (const k of Object.keys(def.keyframes)) {
        const spec = def.keyframes[k];
        checkTracks(spec, "scene('" + name + "').keyframes." + k);
        keyed[k] = __DEV__ && !Array.isArray(spec.at) ? watchedPose(name, k, spec) : function () { return styled(this.local, spec); };
      }
    }
    const followed = def.follow === undefined ? null : follows.define(name, def.follow);
    const fk = followed ? Object.keys(followed.computeds) : [];
    if (__DEV__) {
      if (typeof def.tick === 'function') tickers.add(name);
      else tickers.delete(name);
      const taken = PROVIDED.filter((k) => (def.computed && k in def.computed) || (def.state && k in def.state) || k in keyed || fk.includes(k));
      if (taken.length) {
        warn(CODES.RESERVED, "scene '" + name + "' defines " + taken.map((k) => "'" + k + "'").join(', ') + ', which the extension provides; the extension\'s value is the one the scene reads',
          'Rename the ' + (taken.length > 1 ? 'properties' : 'property') + '.');
      }
      const shadowed = Object.keys(keyed).filter((k) => def.computed && k in def.computed && !fk.includes(k));
      if (shadowed.length) {
        warn(CODES.KEYS_SHADOW, "scene '" + name + "' has " + shadowed.map((k) => "'" + k + "'").join(', ') + ' in both keyframes and computed; the keyframes entry is the one the scene reads',
          'Keep one of the two.');
      }
      const over = fk.filter((k) => !PROVIDED.includes(k) && ((def.computed && k in def.computed) || k in keyed));
      if (over.length) {
        warn(CODES.KEYS_SHADOW, "scene '" + name + "' has " + over.map((k) => "'" + k + "'").join(', ') + ' in follow and in computed or keyframes; the follow entry is the one the scene reads',
          'Keep one of them.');
      }
    }
    const { edges: _edges, keyframes: _keyframes, waitFor: _waitFor, inputs: _inputs, follow: _follow, ...rest } = def;
    // The scene's element is known as a scene's (sceneOf()) from its
    // beforeInit on; the author's own beforeInit runs after.
    const ownBefore = rest.beforeInit;
    rest.beforeInit = function (...args) {
      sceneEls.add(this.element);
      if (typeof ownBefore === 'function') return ownBefore.apply(this, args);
    };
    // tick(dt, now), the framework's frame-loop hook (dt in ms), runs only in
    // interactive mode: never in video mode, so never in check(), render() or
    // with the HyperFrames runtime on the page, where a frame is a seek.
    if (typeof rest.tick === 'function') {
      const ownTick = rest.tick;
      rest.tick = function (dt, now) {
        if (clock.store.mode !== 'interactive') return undefined;
        return ownTick.call(this, dt, now);
      };
    }
    // In interactive mode a change to the scene's state, such as a control
    // the learner moved while a step holds, seeks the time it stands at
    // again, once for all the changes of a frame, so what seek(local) and
    // the effects draw follows the control with the clock stopped.
    // A write seek(local) makes as it runs is what it draws at that time,
    // and asks for no seek again; the learner's writes, and anyone else's, do.
    const ownBeforeUpdate = rest.beforeUpdate;
    rest.beforeUpdate = function (...args) {
      if (this.element !== seekingEl) changed.add(this.element);
      if (typeof ownBeforeUpdate === 'function') return ownBeforeUpdate.apply(this, args);
    };
    const ownUpdate = rest.onUpdate;
    rest.onUpdate = function (...args) {
      const asks = changed.delete(this.element);
      if (clock.store.mode === 'interactive' && asks && !redrawing) {
        redrawing = true;
        // The framework calls onUpdate from frame callbacks, one a change,
        // with microtasks run between them: the next frame takes them all.
        requestAnimationFrame(() => {
          redrawing = false;
          forcing = true;
          try { clock.redraw(); } finally { forcing = false; }
        });
      }
      if (typeof ownUpdate === 'function') return ownUpdate.apply(this, args);
    };
    // seek(local) rethrows a rejection handed to it by reportRejection(),
    // from inside the framework's method wrapper.
    if (typeof rest.seek === 'function') {
      const own = rest.seek;
      rest.seek = function (local) {
        if (rethrow) { const e = rethrow.error; rethrow = null; throw e; }
        return own.call(this, local);
      };
    }
    scenes.set(name, { edges, waitFor, inputs, follow: followed ? followed.paths : [] });
    return wf.component(name, Object.assign({}, rest, {
      subscribe: withClock(rest.subscribe, !!followed),
      computed: Object.assign({}, rest.computed, keyed, followed && followed.computeds, computedsFor(edges, name, inputs)),
    }));
  }

  // A promise from seek(local) that rejects is reported the way a throw
  // from seek(local) is: rethrown inside the framework's method wrapper,
  // which hands it to the component's onError, or prints it on every build
  // when there is none. The barrier then goes on with the DOM as it is.
  let rethrow = null;
  let redrawing = false;     // a redraw is queued for this frame's state changes
  let forcing = false;       // inside that redraw, whose seek(local) calls all run
  let seekingEl = null;      // the element of the scene whose seek(local) is running now
  const changed = new WeakSet(); // scenes whose state changed outside their own seek(local)
  let lastSeek = new WeakMap(); // scene instance -> { l, inside } of its last seek(local)
  // A change of mode (the scripts write their paths in video mode, and the
  // learner's values come back in interactive mode) or of fps (a render's
  // own) can change what seek(local) draws at the same local, so the next
  // seek runs every scene's.
  const forget = () => { lastSeek = new WeakMap(); };
  clock.store.subscribe('mode', forget);
  clock.store.subscribe('fps', forget);
  function reportRejection(inst, error) {
    rethrow = { error };
    try { inst.seek(0); } catch (_) { /* errorHandling: 'throw' has nowhere to throw to here */ } finally { rethrow = null; }
  }

  // A seek hook's return value, for the barrier: a promise that settles
  // once the scene's own promise has, and never rejects. The hook is the
  // author's method, so a synchronous exception is reported through the
  // component's own onError by the framework's method wrapper, and not here.
  // A seek that leaves the scene's local as it was at its last seek, inside
  // or outside its clip alike, is skipped: a scene outside its clip draws
  // its edge frame once. The first seek after init (`fresh`), a redraw for
  // a change of state (`forcing`) and check()'s seeks always run, so
  // check() still compares what seek(local) draws on every seek, and a
  // scene that draws from anything but local fails it whatever the order.
  function runSeek(inst, time, fresh) {
    if (typeof inst.seek !== 'function') return undefined;
    const l = localOf(inst.element, time), inside = insideAt(inst.element, time), was = lastSeek.get(inst);
    if (!fresh && !forcing && !(clock.checking > 0) && was && was.l === l && was.inside === inside) return undefined;
    lastSeek.set(inst, { l, inside });
    const prev = seekingEl;
    seekingEl = inst.element;
    let r;
    try { r = inst.seek(l); } finally { seekingEl = prev; }
    return r && typeof r.then === 'function' ? Promise.resolve(r).catch((e) => reportRejection(inst, e)) : undefined;
  }

  // A binding written on the scene's own root tag is read in the scope of
  // whoever wrote the tag, by the framework's rule: the component around the
  // scene. A development core warns (WF-521) when the binding uses a name
  // the scene has and that component lacks. Inside another scene, Kinetic's
  // own values (progress, local and the rest) are on both, so the binding
  // reads the outer scene's value with no warning from the core; this check
  // covers that case. The warning appears once per scene.
  const rootWarned = new Set();
  function checkRootBindings(inst) {
    if (rootWarned.has(inst.name)) return;
    const up = inst.element.parentElement;
    const outer = up && up.closest('[data-component], [data-wf-component]');
    const around = outer && (outer.getAttribute('data-component') || outer.getAttribute('data-wf-component'));
    if (!around || !scenes.has(around)) return;
    for (const attr of ROOT_BINDINGS) {
      const expr = inst.element.getAttribute(attr);
      if (!expr) continue;
      const hit = scopeNames(expr).find((id) => PROVIDED.includes(id));
      if (!hit) continue;
      rootWarned.add(inst.name);
      warn(CODES.ROOT_BINDING, "scene '" + inst.name + "' sits inside the scene '" + around + "', so " + attr + '="' + expr + "\" on its root tag reads '" + hit + "' of '" + around + "', not its own",
        "Move the binding onto an element inside the scene, or declare the scene's own side of its root in the definition: root: { style: { opacity: '" + hit + "' } } (class, attr, show and directives likewise).");
      return;
    }
  }

  // A scene that mounts during a seek (a data-render section that turns on
  // at this time) is created in the seek's flush, but the framework runs its
  // init() a task later, and with it the afterInit hook below that makes it
  // live and runs its first seek(local). The clock's settle hook waits for
  // every pending init (wildflower.whenInitialized(), stores included), so
  // the frame holds the new scene and the after-seek hooks see it. The wait
  // is kept on the seek's own object (`waited`), since it is a scene's
  // setup and not the seek's work, and KN-170 leaves it out (guard.js).
  const freshSeeks = [];        // the first seek(local) promises of scenes that mounted during a seek
  let collecting = false;       // from a seek's before hook to its settle hook

  wf.hook('component:afterInit', (inst) => {
    if (!scenes.has(inst.name)) return;
    live.add(inst);
    if (__DEV__) { checkRootBindings(inst); checkTicks(); }
    const r = runSeek(inst, clock.now(), true);
    if (collecting && r) freshSeeks.push(r);
  });
  wf.hook('component:beforeDestroy', (inst) => { live.delete(inst); });

  clock.onBeforeSeek(() => { collecting = true; });
  if (__DEV__) clock.onBeforeSeek(checkTicks);
  clock.onSettle((t, seek) => { const from = perfNow(); return wf.whenInitialized().then(() => {
    if (seek) seek.waited = (seek.waited || 0) + perfNow() - from;
    collecting = false;
    return Promise.all(freshSeeks.splice(0));
  }); });

  clock.onSeek((time) => {
    let pending = null;
    for (const inst of live) {
      const r = runSeek(inst, time);
      if (r && typeof r.then === 'function') (pending || (pending = [])).push(r);
    }
    return pending && Promise.all(pending);
  });

  return {
    scene, timingFor, live, localOf, sceneOf, insideAt,
    // [sceneName, queryNames] for every mounted scene that waits. A scene
    // defined for another page, and never mounted on this one, holds nothing,
    // and nor does one whose element has left the page, which the framework
    // may destroy only later.
    waitFor() {
      const out = new Map();
      for (const inst of live) {
        const s = scenes.get(inst.name);
        if (s && s.waitFor.length && inst.element.isConnected) out.set(inst.name, s.waitFor);
      }
      return Array.from(out);
    },
    onFailure(fn) { onFailure = fn; },
    // [scene, path] for each follow target of a live scene on the page.
    followTargets() {
      const out = [];
      for (const inst of live) {
        const s = scenes.get(inst.name);
        if (s && inst.element.isConnected) for (const p of s.follow) out.push([inst.name, p]);
      }
      return out;
    },
    // Checks the inputs of every live scene on the page that declares them;
    // a failure reaches onFailure when first read, and the first one is
    // returned for readiness to fail with.
    validateLive() {
      let first = null;
      for (const inst of live) {
        const s = scenes.get(inst.name);
        if (s && s.inputs && inst.element.isConnected) { try { inputsFor(inst.element, inst.name, s.inputs); } catch (e) { first = first || e; } }
      }
      return first;
    },
  };
}
