/**
 * check(): the render self-test. Seeks a shuffled sample of frames twice and
 * compares what the composition root held each time: every element's text,
 * inline style, class list, hidden state, its other attributes (an SVG
 * path's d, a viewBox), the value of an input, textarea or select, each of
 * its animations' currentTime and play state, a hash of each 2-D canvas, and
 * each footage clip's currentTime (a <video> with data-start), to the
 * microsecond, so a clip sought to another time for the same seek fails
 * with the element and both times. That is the time the clip was sought
 * to; the frame the decoder then shows is not read. data-component-id is
 * left out, since the framework numbers a component created in a seek
 * afresh on every pass. Pseudo-element animations and shadow DOM are not
 * compared. Class tokens, style declarations and attributes are compared
 * in sorted order: a binding adds and removes them one at a time, so their
 * order follows what the element held before, and the page looks the same
 * either way. A report shows them in the order the element held them.
 *
 * It begins with a run of readiness (readiness.js), as render() does: the
 * page's files, clips, scenes and queries as they are now, a file that
 * failed before fetched again. So the footage and the audio clips are
 * loaded before the seeks, and a clip still loading is not sought in one
 * pass and passed over in the other.
 *
 * Every report carries `ready`, the root's data-kinetic-ready after the
 * seeks ('true' or 'failed'), and `errors`, the console.error calls, error
 * events and unhandled rejections during the seeks, with `firstError` the
 * first one's message. The report fails, in this order, when readiness
 * failed, in the run or by a failure reported during the seeks (a scene a
 * section mounts partway), with the failure's `code` and `where` (render()
 * rejects with the same error); when there was an error; and on the first
 * frame that differs: which frame, which element (its selector when the
 * frame was taken), which property, and both values.
 *
 *   const r = await wildflower.kinetic.check({ samples: 30 });
 *   // { ok: true, frames: 180, samples: 30, ready: 'true', errors: 0 }
 *   // { ok: false, reason: 'readiness failed', code: 'KN-130', where: "scene 'card' input 'title'",
 *   //   frames: 180, samples: 30, ready: 'failed', errors: 4, firstError: '[KN-130] ...' }
 *   // { ok: false, reason: 'a seek threw', frames: 180, samples: 30, ready: 'true',
 *   //   errors: 60, firstError: "[WildflowerJS] Error in computed property 'bar': ..." }
 *   // { ok: false, frame: 41, time: 1.3667, element: 'ol > li:nth-child(3)',
 *   //   property: 'style', first: 'width: 212px;', second: 'width: 230px;',
 *   //   ready: 'true', errors: 0 }
 *
 * It does not see a binding that resolves to nothing, an empty list, or a
 * scene that never registered: each of those is the same on every seek.
 *
 * Seeks go the way a render's do: through the runtime's player and its
 * barrier when one is on the page, else through the clock. A playing clock
 * is paused for the run, and the page is in video mode for it (lesson.js),
 * so the steps' scripts write their paths. The time the clock had before is
 * restored afterwards, also when a seek throws, still in video mode; then
 * the learner's values of the scripted paths come back, interactive mode
 * with them, and a clock that was playing plays on. A WebGL canvas without
 * preserveDrawingBuffer reads back blank in both
 * passes and so cannot fail here; its check is the frame hashes of a real
 * render.
 */

import { CODES, warn, fail, show } from './diagnostics.js';
import { compositionRoot } from './timing.js';
import { random } from './motion.js';

// FNV-1a over a string: enough to tell two canvases apart.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

function ownText(el) {
  let t = '';
  for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
  return t;
}

// Every attribute but the two with their own slots and the framework's
// component id, so an SVG path's d, a viewBox or a width written by
// data-bind-attr is compared too.
function otherAttributes(el) {
  const out = [];
  for (const a of el.attributes) if (a.name !== 'style' && a.name !== 'class' && a.name !== 'data-component-id') out.push(a.name + '=' + a.value + '\n');
  return out;
}

// The class tokens, sorted.
function classKey(raw) {
  return raw ? raw.split(/\s+/).filter(Boolean).sort().join(' ') : '';
}

// The inline declarations, each with its priority, sorted. Read through the
// style object, since a value can hold a ';' (a data: URL).
function styleKey(el, raw) {
  const s = el.style;
  if (!s) return raw;
  const out = [];
  for (let i = 0; i < s.length; i++) out.push(s[i] + ': ' + s.getPropertyValue(s[i]) + (s.getPropertyPriority(s[i]) ? ' !important' : '') + ';');
  return out.sort().join(' ');
}

// The fields compared in sorted order, and where each keeps the element's own.
const SORTED = { class: 'rawClass', style: 'rawStyle', attrs: 'rawAttrs' };

const FORM_CONTROL = { INPUT: 1, TEXTAREA: 1, SELECT: 1 };

// One record per element, in document order, with the element's selector
// built on the way down: the nearest id, else the parent's selector and the
// element's place among its siblings. Taken with the record, since a row the
// seek created is gone once the time is restored.
function snapshot(root) {
  const out = [];
  const selectors = new Map([[root, '']]);
  const childCount = new Map();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    let sel = '';
    if (el !== root) {
      const p = el.parentElement;
      const i = (childCount.get(p) || 0) + 1;
      childCount.set(p, i);
      const up = selectors.get(p);
      sel = el.id ? '#' + el.id : (up ? up + ' > ' : '') + el.tagName.toLowerCase() + ':nth-child(' + i + ')';
      selectors.set(el, sel);
    }
    const rawStyle = el.getAttribute('style') || '', rawClass = el.getAttribute('class') || '', attrs = otherAttributes(el);
    const rec = { sel, text: ownText(el), style: styleKey(el, rawStyle), class: classKey(rawClass), hidden: el.hidden ? '1' : '', attrs: attrs.slice().sort().join(''), rawStyle, rawClass, rawAttrs: attrs.join('') };
    if (FORM_CONTROL[el.tagName]) rec.value = el.value;
    let anims = [];
    try { anims = el.getAnimations(); } catch (_) { /* no animations API */ }
    if (anims.length) rec.animations = anims.map((a) => (a.animationName || a.transitionProperty || a.id || '') + '@' + a.currentTime + ':' + a.playState).join(' ');
    if (el.tagName === 'CANVAS') {
      try { rec.canvas = hash(el.toDataURL()); } catch (_) { rec.canvas = 'unreadable'; }
    }
    if (el.tagName === 'VIDEO' && el.hasAttribute('data-start')) rec.currentTime = String(Math.round(el.currentTime * 1e6) / 1e6);
    out.push(rec);
  }
  return out;
}

// A console.error argument as the report shows it: an Error's message, else
// the value as a string.
const text = (a) => (a && typeof a === 'object' && typeof a.message === 'string' ? a.message : String(a));

// Counts console.error calls, error events and unhandled rejections until
// the returned function is called, which puts console.error back when it
// still holds this wrapper.
function countErrors(errors) {
  const note = (message) => { if (!errors.errors++) errors.firstError = message; };
  const orig = console.error;
  const wrapper = function (...a) { note(a.map(text).join(' ')); return orig.apply(this, a); };
  const onError = (e) => note(e.error ? text(e.error) : e.message);
  const onRejection = (e) => note('unhandled rejection: ' + text(e.reason));
  console.error = wrapper;
  self.addEventListener('error', onError);
  self.addEventListener('unhandledrejection', onRejection);
  return () => {
    if (console.error === wrapper) console.error = orig;
    self.removeEventListener('error', onError);
    self.removeEventListener('unhandledrejection', onRejection);
  };
}

function firstDifference(a, b, root) {
  if (a.length !== b.length) return { element: root.tagName.toLowerCase(), property: 'elements', first: String(a.length), second: String(b.length) };
  for (let i = 0; i < a.length; i++) {
    for (const k of ['text', 'style', 'class', 'hidden', 'attrs', 'value', 'animations', 'canvas', 'currentTime']) {
      if (a[i][k] === b[i][k]) continue;
      const shown = SORTED[k] || k;
      return { element: a[i].sel || 'root', property: k, first: a[i][shown] === undefined ? '' : a[i][shown], second: b[i][shown] === undefined ? '' : b[i][shown] };
    }
  }
  return null;
}

export function createCheck(clock, readiness, lesson) {
  return async function check(opts) {
    const o = opts || {};
    const samples = o.samples === undefined ? 30 : o.samples;
    if (!(typeof samples === 'number' && samples >= 1)) throw fail(CODES.BAD_CALL, 'check({ samples })', __DEV__ && 'samples is a number of frames, 1 or more, not ' + show(o.samples));
    const root = compositionRoot(document);
    if (!root) throw fail(CODES.BAD_CALL, 'check(): data-composition-id', __DEV__ && 'no composition root (an element with data-composition-id) on the page');
    clock.resolveComposition();
    const { fps, duration } = clock.store;
    if (!(duration > 0)) throw fail(CODES.BAD_CALL, 'check(): data-duration', __DEV__ && 'the composition has no duration (data-duration on the root)');
    const frames = Math.max(1, Math.round(duration * fps));
    const rnd = random(o.seed === undefined ? 1 : o.seed);
    const chosen = new Set();
    if (frames > 1) chosen.add(frames - 1);
    chosen.add(0);
    while (chosen.size < Math.min(samples, frames)) chosen.add(Math.floor(rnd() * frames));
    const order = Array.from(chosen);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }

    // A run of readiness first, whose failure is the one render() rejects
    // with; and then one reported during the seeks (a scene a section mounts
    // partway), which render() rejects with too.
    const ran = await readiness.ready().then(() => null, (e) => e || new Error(String(e)));
    const since = readiness.watch();
    const before = clock.now();
    const resume = clock.suspend();
    const release = lesson.force();
    // A check puts the page in video mode to compare its frames, and makes
    // no video, so KN-151 (scene.js) stays quiet while one runs.
    clock.checking = (clock.checking || 0) + 1;
    const errors = { errors: 0 };
    const uncount = countErrors(errors);
    const pass = async () => {
      const seen = new Map();
      for (const f of order) {
        await clock.seekSettled(f / fps);
        seen.set(f, snapshot(root));
      }
      return seen;
    };
    let first, second;
    try {
      first = await pass();
      order.reverse();
      second = await pass();
    } finally {
      try { await clock.seekSettled(before); } finally { try { release(); } finally { clock.checking--; uncount(); resume(); } }
    }

    // The root's mark, read after the seeks (the first seek after readiness
    // marks a root added since).
    const ready = root.getAttribute('data-kinetic-ready');
    const counts = Object.assign({ frames, samples: order.length, ready }, errors);
    const failure = ran || since();
    if (failure || errors.errors) {
      const reason = failure ? 'readiness failed' : 'a seek threw';
      if (__DEV__) {
        if (failure) warn(CODES.CHECK_FAILED, 'check(): readiness failed with ' + (failure.code || failure.message) + ', so render() rejects with the same error' + (readiness.held() ? ', and a HyperFrames render of the page waits at frame 0 until it times out' : ''),
          'The error printed when it failed gives the file, clip, input or query; check(), render() and wildflower.kinetic.ready() each look at the page again, so it passes once that source loads or leaves the page.');
        else warn(CODES.CHECK_FAILED, 'check(): ' + errors.errors + (errors.errors === 1 ? ' error' : ' errors') + ' during the seeks; the first: ' + errors.firstError,
          'Fix the first error and run check() again. A render captures these frames as the page draws them after the error.');
      }
      // The failure's code and where, which the production message carries
      // too; an error with no code gives its message as where.
      return Object.assign({ ok: false, reason }, failure ? { code: failure.code, where: failure.where || failure.message } : {}, counts);
    }

    const byFrame = Array.from(first.keys()).sort((a, b) => a - b);
    for (const f of byFrame) {
      const d = firstDifference(first.get(f), second.get(f), root);
      if (d) {
        const report = Object.assign({ ok: false, frame: f, time: f / fps }, d, { ready, errors: 0 });
        if (__DEV__) warn(CODES.CHECK_FAILED, 'check(): frame ' + f + ' (' + (f / fps).toFixed(4) + ' s) differed between two seeks at ' + report.element + ', ' + report.property + ': ' + JSON.stringify(report.first) + ' then ' + JSON.stringify(report.second),
          'Something in that frame depends on the order of seeks or on the wall clock; the KN-14x warnings during the seeks name the usual causes.');
        return report;
      }
    }
    return Object.assign({ ok: true }, counts);
  };
}
