/**
 * Where an element sits on the composition clock, read from HyperFrames' own
 * attributes with HyperFrames' own rules (packages/core/src/runtime/
 * startResolver.ts and compositionContract.ts in its source), so a scene and
 * the renderer agree on when a clip runs:
 *
 *   data-start="2"            2 s after the host composition starts
 *   data-start="intro"        when the clip with id (or composition id) `intro` ends
 *   data-start="intro + 0.5"  half a second after that; "intro - 0.5" overlaps it
 *   data-start="voice.start"  when `voice` starts, Kinetic's own form, which
 *                             HyperFrames does not read; "voice.start + 0.5"
 *                             too, and "voice.end" is the same as "voice"
 *   data-duration="3"         the clip's length; data-end="5" is the alternative
 *   data-playback-start="4"   a nested composition shows its own 4 s first
 *
 * A composition root with no data-start inherits its host's start. An
 * element with no data-start is not a clip; the scene's timing is then the
 * nearest ancestor that is one, which is also how HyperFrames hides it.
 *
 * A footage clip (a <video> with data-start, footage.js) with no
 * data-duration or data-end lasts the rest of its file from
 * data-media-start, at its data-playback-rate, once its metadata has given
 * the file's length; a length of Infinity (a file still being written, or a
 * MediaRecorder WebM) counts as unknown. footage.js calls timingChanged()
 * when a file's length arrives or changes, and every cache of resolved
 * timing keys on timingEpoch(), so a clip timed from a footage clip moves
 * when that length is known.
 */

import { clampRate, parseRemap } from './mix.js';

let epoch = 0;
export const timingEpoch = () => epoch;
export const timingChanged = () => { epoch++; };

// A number from a clip's attribute, or null when it is absent or no number.
export const num = (el, name) => number(el.getAttribute(name));
// data-playback-rate: file seconds per composition second, 0.1 to 10.
export const rateOf = (el) => clampRate(num(el, 'data-playback-rate'));
// Seconds into the file where the clip starts: data-playback-start when it
// is 0 or more, else data-media-start, the runtime's order.
export const mediaStartOf = (el) => {
  const p = num(el, 'data-playback-start');
  return Math.max(0, p != null && p >= 0 ? p : num(el, 'data-media-start') || 0);
};
// data-remap, the clip's time remapped (mix.js, parseRemap), parsed once per
// text: null without the attribute, false for a malformed one, which
// footage.js (KN-139) and audio.js (KN-136) report and do not apply.
const remaps = new Map();
export function remapOf(el) {
  const text = el.getAttribute('data-remap');
  if (text == null) return null;
  let r = remaps.get(text);
  if (r === undefined) {
    r = parseRemap(text);
    if (remaps.size > 63) remaps.clear();   // capped as the other caches are
    remaps.set(text, r);
  }
  return r;
}
// A footage clip's length from its file: what is left of it from the media
// start, at its rate; null before the length is known, and for any element
// that is no footage clip (a <video> with data-start inside the composition
// root, whose length footage.js watches).
export function fileLength(el) {
  if (el.localName !== 'video' || !el.hasAttribute('data-start') || !(el.duration > 0 && el.duration < Infinity)) return null;
  const root = compositionRoot(el.ownerDocument);
  if (!root || !root.contains(el)) return null;
  // With a remap, the clip lasts to the remap's last key.
  const r = remapOf(el);
  return r ? r.length : Math.max(0, el.duration - mediaStartOf(el)) / rateOf(el);
}

// A name, with Kinetic's own trailing .start or .end, and an offset.
const REFERENCE = /^(([A-Za-z_][\w-]*)(?:\.(start|end))?)(?:\s*([+-])\s*(\d+(?:\.\d+)?|\.\d+))?$/;

// refId is the whole token, name the clip before a trailing .start or .end,
// and atStart whether that edge is .start.
export function parseStart(raw) {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!s) return null;
  const n = Number(s);
  if (s !== '' && Number.isFinite(n)) return { kind: 'absolute', value: n };
  const m = REFERENCE.exec(s);
  if (!m) return null;
  return { kind: 'reference', refId: m[1], name: m[2], atStart: m[3] === 'start', offset: m[4] ? (m[4] === '-' ? -Number(m[5]) : Number(m[5])) : 0 };
}

function number(raw) {
  if (raw == null) return null;
  const n = Number(String(raw).trim());
  return String(raw).trim() !== '' && Number.isFinite(n) ? n : null;
}

const isComposition = (el) => el.hasAttribute('data-composition-id');

// The element whose timing a scene follows: itself when it is a clip, else
// the nearest ancestor clip or composition root. null when there is none.
export function timingElement(el) {
  let e = el;
  while (e && e.nodeType === 1) {
    if (e.hasAttribute('data-start') || isComposition(e)) return e;
    e = e.parentElement;
  }
  return null;
}

// The composition root the renderer times against: the one marked
// data-root, else the outermost element with a composition id.
export function compositionRoot(doc) {
  return doc.querySelector('[data-root="true"]') || doc.querySelector('[data-composition-id]');
}

// The frames per second a render of `root` captures, in the clock's order: a
// render's own fps (which without one set reads as the root's data-fps,
// clock.js), else the root's data-fps, else `fallback` (the clock's, which
// holds config({ fps }) or 30). Read fresh, since a root added after load
// has not reached the clock's store until the next seek from the runtime.
export function frameRate(root, fallback) {
  const cfg = (root.ownerDocument.defaultView || self).__HF_EXPORT_RENDER_SEEK_CONFIG;
  const render = cfg && Number(cfg.fps);
  const own = Number(root.getAttribute('data-fps'));
  return (render > 0 && render) || (own > 0 && own) || fallback;
}

function findReference(doc, refId) {
  return doc.getElementById(refId) || doc.querySelector('[data-composition-id="' + CSS.escape(refId) + '"]');
}

// What a parsed reference times from, as [element, fromStart], or null when
// it names nothing. An element whose id (or composition id) is the whole
// token wins, as HyperFrames reads it, since an id may hold a dot; only
// otherwise is a trailing .start or .end an edge of the clip before it.
export function referenceOf(doc, e) {
  const whole = findReference(doc, e.refId);
  if (whole) return [whole, false];
  const el = e.name !== e.refId && findReference(doc, e.name);
  return el ? [el, e.atStart] : null;
}

// start, duration and playbackStart in composition seconds, with the ids of
// any data-start references that resolved to nothing, and `file` when the
// duration is a footage clip's file length. The resolver is
// re-entrant over references (a reference to a reference) and stops on a
// cycle the way the runtime does: the element in progress resolves to 0.
// Each element's start is worked out once per call, as the runtime's own
// resolver does: duration() reads start() again, so a chain of data-end
// references would otherwise double the work at every link.
export function resolveTiming(el) {
  const doc = el.ownerDocument;
  const missing = [];
  const visiting = new Set();
  const starts = new Map();

  const hostOffset = (e) => {
    const host = isComposition(e)
      ? (e.parentElement && e.parentElement.closest('[data-composition-id]'))
      : e.closest('[data-composition-id]');
    return host ? start(host) : 0;
  };

  const written = (e) => {
    const d = number(e.getAttribute('data-duration'));
    if (d != null && d > 0) return d;
    const end = number(e.getAttribute('data-end'));
    if (end != null) {
      const len = end - start(e);
      if (len > 0) return len;
    }
    return null;
  };
  const duration = (e) => { const d = written(e); return d != null ? d : fileLength(e); };

  const startOf = (e) => {
    const expr = parseStart(e.getAttribute('data-start'));
    if (!expr) {
      // A composition root with no start of its own runs when its host does.
      if (isComposition(e) && e.parentElement) {
        const p = e.parentElement;
        if (p.hasAttribute('data-composition-src') || isComposition(p) || p.hasAttribute('data-composition-file')) return start(p);
      }
      return 0;
    }
    if (expr.kind === 'absolute') return Math.max(0, hostOffset(e) + Math.max(0, expr.value));
    const ref = referenceOf(doc, expr);
    if (!ref) { missing.push(expr.refId); return 0; }
    const base = start(ref[0]);
    if (ref[1]) return Math.max(0, base + expr.offset);
    const len = duration(ref[0]);
    return Math.max(0, base + (len == null ? 0 : len) + expr.offset);
  };

  const start = (e) => {
    if (starts.has(e)) return starts.get(e);
    if (visiting.has(e)) return 0;
    visiting.add(e);
    let s;
    try { s = startOf(e); } finally { visiting.delete(e); }
    starts.set(e, s);
    return s;
  };

  const s = start(el);
  const own = written(el);
  return {
    start: s,
    duration: own != null ? own : fileLength(el),
    file: own == null && fileLength(el) != null,
    playbackStart: isComposition(el) ? (number(el.getAttribute('data-playback-start')) || 0) : 0,
    missing,
  };
}

// The defaults the page declares in data-composition-variables, keyed by id,
// merged from every element that carries the attribute, as the runtime reads
// them: a JSON array of { id, type, label, default }. Parsed once per text.
const declared = new Map();
export function declaredDefaults(doc) {
  const out = {};
  for (const el of doc.querySelectorAll('[data-composition-variables]')) {
    const text = el.getAttribute('data-composition-variables');
    let d = declared.get(text);
    if (!d) {
      d = {};
      let list = null;
      try { list = JSON.parse(text); } catch (_) { /* the runtime skips it too */ }
      if (Array.isArray(list)) {
        for (const v of list) if (v && typeof v === 'object' && typeof v.id === 'string' && 'default' in v) d[v.id] = v.default;
      }
      declared.set(text, d);
    }
    Object.assign(out, d);
  }
  return out;
}

// The values HyperFrames resolved for an element: the per-instance table of
// an inlined sub-composition first, then the merged top-level variables
// (runtime/variableScope.ts in its source). With no runtime on the page,
// the defaults the page declares, with window.__hfVariables over them, as
// the runtime would merge them, so a standalone page shows what a render does.
export function readVariables(el) {
  const doc = el.ownerDocument;
  const w = doc.defaultView || self;
  const scope = el.closest('[data-composition-id]');
  const id = scope ? (scope.getAttribute('data-composition-id') || '').trim() : '';
  const byComp = w.__hfVariablesByComp;
  if (id && byComp && Object.prototype.hasOwnProperty.call(byComp, id) && byComp[id]) return byComp[id];
  const helper = w.__hyperframes;
  if (helper && typeof helper.getVariables === 'function') {
    const v = helper.getVariables();
    if (v && typeof v === 'object') return v;
  }
  const injected = w.__hfVariables;
  return Object.assign(declaredDefaults(doc), injected && typeof injected === 'object' && !Array.isArray(injected) ? injected : null);
}
