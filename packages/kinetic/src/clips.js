/**
 * Clips outside their window, when no runtime is on the page.
 *
 * HyperFrames' runtime shows each timed element (every element with
 * data-start) inside its window and hides it outside, with inline
 * visibility, on every seek. The window is half-open, [start, end). A clip
 * running to the composition's end is still shown on the final instant, and
 * a descendant of a hidden clip is hidden with it (runtime/clipWindow.ts and
 * applyTimedElementVisibility in init.ts of the pinned runtime). A clip
 * with data-hidden is taken out with display: none instead, and its own
 * inline display comes back when the attribute goes. script, style, link
 * and meta are never clips, and here an <audio> clip is not one either.
 * Without the runtime, nothing applied that rule,
 * so a scrub in a plain tab showed every clip at once. This applies the
 * same rule on every seek when the page has no runtime, and once before the
 * page is shown. With the runtime present it does nothing, because the
 * runtime sets visibility itself.
 *
 * A hidden clip paints nothing at all. visibility: hidden alone let the
 * output of an SVG filter that makes its own pixels (feFlood, feImage,
 * feTurbulence) paint through, on the clip or on a descendant, and so did a
 * descendant with visibility: visible of its own (probed in Chrome 155,
 * 2026-10-09). So a hidden clip also carries data-kinetic-hidden, which one
 * style sheet Kinetic adopts clips to nothing with clip-path (adopted again
 * on the next seek when page code has replaced document.adoptedStyleSheets).
 * A clip-path changes no layout, and through the sheet it leaves the clip's
 * own style as it was; opacity and the other candidates either did not stop
 * the filter or are written by transitions and authors. A runtime that
 * arrives later gets the clips back unmarked, and each data-hidden clip
 * with its own inline display.
 *
 * In development it also warns, once per clip and with or without the
 * runtime, when a clip's start or end falls between two frames (KN-114): a
 * render captures whole frames only, so that cut lands on the later frame,
 * or, with a shutter, part-way through the frame before.
 *
 * transitions.js reads each clip's window from here (windowOf) and runs
 * after this on every seek. A footage clip (a <video> with data-start,
 * footage.js) with no data-duration or data-end runs for the rest of its
 * file from data-media-start, at its rate, once the file's metadata has
 * given its length (timing.js); until then it runs to the composition's
 * end. A window worked out before a length was known is worked out again
 * after, its own or that of a clip it is timed from.
 */
import { compositionRoot, resolveTiming, frameRate, timingEpoch, timingChanged, parseStart, referenceOf } from './timing.js';
import { CODES, warn } from './diagnostics.js';

export const EPS = 1e-6;
const same = (a, b) => Math.abs(a - b) < EPS;
export const started = (t, start) => t >= start || same(t, start);
export const inWindow = (t, start, end) => started(t, start) && t < end && !same(t, end);
// An <audio> clip (audio.js) has no box to show or hide, starts at any
// sample rather than on a frame, and is never the clip a transition replaces.
export const NOT_CLIPS = new Set(['script', 'style', 'link', 'meta', 'audio']);
const HIDDEN = 'data-kinetic-hidden';

// A style sheet of Kinetic's own, adopted by the document: the function
// that adopts it, again whenever page code has set
// document.adoptedStyleSheets without it. Called before each use.
export function adopter(css) {
  let sheet = null;
  return () => {
    try {
      if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(css); }
      const list = document.adoptedStyleSheets;
      if (!list.includes(sheet)) document.adoptedStyleSheets = [...list, sheet];
    } catch (_) { /* no constructable style sheets */ }
  };
}

// ---- development: the frame grid ----------------------------------------------

const seconds = (v) => String(Math.round(v * 10000) / 10000);

// "between frame 90 (3 s) and frame 91 (3.0333 s)", or null when x is on a frame.
function between(x, fps) {
  const f = x * fps;
  if (Math.abs(f - Math.round(f)) <= EPS) return null;
  const lo = Math.floor(f);
  return { lo, hi: lo + 1, text: 'between frame ' + lo + ' (' + seconds(lo / fps) + ' s) and frame ' + (lo + 1) + ' (' + seconds((lo + 1) / fps) + ' s)' };
}

// An element as a warning names it: its tag, then its id, its component or
// composition, or its first class.
export function clipName(el) {
  const tag = el.localName;
  if (el.id) return tag + '#' + el.id;
  for (const a of ['data-component', 'data-wf-component', 'data-composition-id']) {
    if (el.hasAttribute(a)) return tag + '[' + a + '="' + el.getAttribute(a) + '"]';
  }
  return el.classList.length ? tag + '.' + el.classList[0] : tag;
}

// [message, suggestion] for a clip whose start or end is off the grid, or null.
function gridReport(el, w, fps) {
  const parts = [];
  let first = null, footage = '';
  const start = between(w.start, fps);
  if (start) {
    const raw = el.getAttribute('data-start');
    const plain = Number(raw) === w.start;
    parts.push('has data-start="' + raw + '", which ' + (plain ? '' : 'resolves to ' + seconds(w.start) + ' s and ') + 'falls ' + start.text);
    first = start;
    // Timed from footage with no length, the clip starts where that file
    // ends, which is seldom on a frame.
    const ref = parseStart(raw);
    const to = ref && ref.kind === 'reference' && referenceOf(el.ownerDocument, ref);
    const from = to && !to[1] && to[0];
    if (from && resolveTiming(from).file) {
      footage = ' The start comes from ' + clipName(from) + ', which has no data-duration, so this clip starts where that file ends; give ' + clipName(from) + ' a data-duration that ends on a frame, or start this clip in seconds.';
    }
  }
  // An end that comes from a footage file's length is where the file ends,
  // which the author did not write.
  const end = w.end !== Infinity && !w.file ? between(w.end, fps) : null;
  if (end) {
    const byDuration = Number(el.getAttribute('data-duration')) > 0;
    parts.push(byDuration
      ? 'ends at ' + seconds(w.end) + ' s (data-start + data-duration), which falls ' + end.text
      : 'has data-end="' + el.getAttribute('data-end') + '", which falls ' + end.text);
    first = first || end;
  }
  if (!parts.length) return null;
  const exact = (n) => String(Number((n / fps).toFixed(8)));
  return [
    'the clip ' + clipName(el) + ' ' + parts.join(', and ') + ', at ' + fps + ' fps; a render captures whole frames only, so the clip changes on the later frame, or in a render with a shutter part-way through the frame before',
    "Put it on a frame: a frame's time is its number divided by " + fps + ', so the nearest here are ' + exact(first.lo) + ' (frame ' + first.lo + ') and ' + exact(first.hi) + ' (frame ' + first.hi + ').' + footage,
  ];
}

export function createClips(clock) {
  // Each clip's window, kept between seeks: resolving one walks its
  // data-start references, and every seek visits every clip. Worked out
  // again when one of the clip's own timing attributes or the composition's
  // duration has changed, when a footage file's length has arrived or
  // changed (the timing epoch), and for footage its own media start or rate.
  const windows = new WeakMap();    // element -> { key, start, end, file }
  const displays = new Map();   // data-hidden element -> its inline display before (iterated at a runtime's hand-over)
  // Without constructable style sheets, visibility alone.
  const adopt = adopter('[' + HIDDEN + ']{clip-path:inset(50%)!important}');
  adopt();

  // A timing attribute changed anywhere moves every clip timed from that
  // element, through a reference, as well as its own: each change bumps the
  // timing epoch, which every cache of resolved timing keys on (scene.js,
  // lesson.js, guard.js, the windows here). Read again at each seek, so a
  // change made in the same task as the seek counts.
  const observer = new MutationObserver(() => timingChanged());
  observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-start', 'data-duration', 'data-end', 'data-media-start', 'data-playback-start', 'data-playback-rate', 'id', 'data-composition-id'] });

  function windowOf(el, total) {
    const key = el.getAttribute('data-start') + '|' + el.getAttribute('data-duration') + '|' + el.getAttribute('data-end') + '|' + total + '|' + timingEpoch()
      + (el.localName === 'video' ? '|' + el.duration + '|' + el.getAttribute('data-media-start') + '|' + el.getAttribute('data-playback-start') + '|' + el.getAttribute('data-playback-rate') + '|' + el.getAttribute('data-remap') : '');
    let w = windows.get(el);
    if (!w || w.key !== key) {
      const tm = resolveTiming(el);
      // A file length of 0 (a media start at or past the file's end) is a
      // window of no length, as the sound's is (mix.js).
      w = { key, start: tm.start, end: tm.duration != null && (tm.duration > 0 || tm.file) ? tm.start + tm.duration : Infinity, file: tm.file };
      windows.set(el, w);
    }
    return w;
  }

  function visibleAt(el, t, total) {
    const { start, end } = windowOf(el, total);
    return inWindow(t, start, end) || (started(t, start) && total > 0 && end >= total - EPS);
  }

  function hide(el) {
    if (!displays.has(el)) displays.set(el, [el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')]);
    if (el.style.display !== 'none') el.style.display = 'none';
  }

  function unhide(el) {
    const [value, priority] = displays.get(el);
    displays.delete(el);
    if (value) el.style.setProperty('display', value, priority);
    else el.style.removeProperty('display');
  }

  // Development: the clips whose start or end is off the frame grid, each
  // warned about once. A clip that is on it is looked at again on the next
  // seek, from its cached window, in case its attributes change.
  const offGrid = new WeakSet();
  function checkGrid(nodes, root, total) {
    const fps = frameRate(root, clock.store.fps);
    for (const el of nodes) {
      if (NOT_CLIPS.has(el.localName) || offGrid.has(el)) continue;
      const found = gridReport(el, windowOf(el, total), fps);
      if (!found) continue;
      offGrid.add(el);
      warn(CODES.OFF_GRID, found[0], found[1]);
    }
  }

  let marked = false;   // some clip carries HIDDEN
  function apply(t) {
    if (observer.takeRecords().length) timingChanged();
    const runtime = clock.hasRuntime();
    if (runtime && marked) {
      marked = false;
      for (const el of document.querySelectorAll('[' + HIDDEN + ']')) el.removeAttribute(HIDDEN);
    }
    // The runtime applies data-hidden itself: each clip Kinetic took out gets
    // its own inline display back.
    if (runtime && displays.size) for (const el of Array.from(displays.keys())) unhide(el);
    if (runtime && !__DEV__) return;
    const root = compositionRoot(document);
    if (!root) return;
    const total = clock.store.duration;
    const nodes = Array.from(root.querySelectorAll('[data-start]'));
    if (root.hasAttribute('data-start')) nodes.unshift(root);
    if (__DEV__) checkGrid(nodes, root, total);
    if (runtime) return;
    adopt();
    const seen = new Map();
    // A clip is shown when its own window holds t and every timed ancestor
    // below the root is shown too.
    const shown = (el) => {
      if (seen.has(el)) return seen.get(el);
      let v = visibleAt(el, t, total);
      if (v && el !== root) {
        const up = el.parentElement && el.parentElement.closest('[data-start]');
        if (up && up !== root && root.contains(up)) v = shown(up);
      }
      seen.set(el, v);
      return v;
    };
    for (const el of nodes) {
      if (NOT_CLIPS.has(el.localName)) continue;
      if (el.hasAttribute('data-hidden')) { hide(el); el.removeAttribute(HIDDEN); continue; }
      if (displays.has(el)) unhide(el);
      const on = shown(el);
      if (el.style.visibility !== (on ? 'visible' : 'hidden')) el.style.visibility = on ? 'visible' : 'hidden';
      if (el.hasAttribute(HIDDEN) === on) el.toggleAttribute(HIDDEN, !on);
      if (!on) marked = true;
    }
  }

  clock.onBeforeSeek(apply);
  // windowOf is shared with transitions.js, which times each transition
  // from the same resolved windows.
  return { apply, windowOf };
}
