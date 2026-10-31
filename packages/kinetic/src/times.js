/**
 * Named times and musical time: declared on an audio clip, read from code.
 *
 * An audio clip (an <audio> with data-start under the composition root, or
 * footage with data-has-audio="true") can carry, in its file's own seconds:
 *
 *   data-tempo="134.68"     beats per minute, steady through the file
 *   data-downbeat="10.712"  a time in the file where a bar starts
 *   data-meter="4"          beats to a bar, 4 by default
 *   data-markers="{ drop: 14.28, stop: 48.05 }"   named moments, in the
 *                           attribute object syntax (literal.js), JSON too
 *
 * File seconds go through the clip's data-start, data-media-start and
 * data-playback-rate, so the grid and the moments stay on the song however it
 * is trimmed. HyperFrames reads none of these, and a marker names nothing in
 * data-start, where an element's id is a name, as it always has been.
 *
 * timeOf(expr) is composition seconds for an expression in data-start's
 * grammar: a number, a name, or a name plus or minus seconds. A name is a
 * marker, else an element's id, which is when that element ends, as in
 * data-start; "voice.start" is when it starts, as data-start reads it.
 *
 * tempo(id) is the beat grid of the audio clip with that id, or with no id of
 * the one clip that has data-tempo: { bpm, beat, meter, at(n), of(t) }, with
 * beat the length of a beat in composition seconds, at(n) the composition
 * time of beat n (0 is the downbeat; fractions and negatives allowed) and
 * of(t) the beat at composition time t, so Math.floor(of(t) / meter) is the
 * bar.
 *
 * Both read the page on every call, so a clip's attributes or timing can
 * change between calls. KN-100 on every build for an expression that is not
 * one, a name that is neither, and a bad attribute, with the clip and the
 * attribute in the where.
 */

import { CODES, fail, show } from './diagnostics.js';
import { parseLiteral, literalProblem } from './literal.js';
import { compositionRoot, parseStart, referenceOf, resolveTiming, mediaStartOf, rateOf, num } from './timing.js';

const CLIPS = 'audio[data-start], video[data-start][data-has-audio="true"]';
const parsed = new Map();    // a data-markers text -> its object, or false when it is no object of numbers

function clips() {
  const root = compositionRoot(document);
  return root ? Array.from(root.querySelectorAll(CLIPS)) : [];
}

const where = (el, attr) => '<' + el.localName + (el.id ? ' id="' + el.id + '"' : '') + '> ' + attr;

// A time in the clip's file, on the composition clock.
function onClock(el, fileTime) {
  return resolveTiming(el).start + (fileTime - mediaStartOf(el)) / rateOf(el);
}

function markersOf(el) {
  const text = el.getAttribute('data-markers');
  if (text == null) return null;
  let m = parsed.get(text);
  if (m === undefined) {
    const r = parseLiteral(text);
    const o = 'value' in r ? r.value : null;
    m = o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every((k) => typeof o[k] === 'number' && Number.isFinite(o[k])) ? o : false;
    if (parsed.size > 63) parsed.clear();   // capped as the other caches are
    parsed.set(text, m);
  }
  if (!m) {
    throw fail(CODES.BAD_CALL, where(el, 'data-markers'), __DEV__ && ('data-markers is an object of names and seconds into the file, such as { drop: 14.28, stop: 48.05 }, not ' + show(text)
      + (literalProblem(text) ? ', which does not read ' + literalProblem(text) : ', whose every value must be a finite number')));
  }
  return m;
}

export function timeOf(expr) {
  const at = 'timeOf(time)';
  // A number that is not finite is no time, though parseStart reads 'NaN' as a name.
  const e = typeof expr === 'string' || Number.isFinite(expr) ? parseStart(expr) : null;
  if (!e) throw fail(CODES.BAD_CALL, at, __DEV__ && 'a time is a number of seconds, a name, or a name plus or minus seconds, as data-start takes, not ' + show(expr));
  // Never before 0, where data-start clamps too.
  if (e.kind === 'absolute') return Math.max(0, e.value);
  const named = [];
  for (const el of clips()) {
    const m = markersOf(el);
    if (!m) continue;
    if (Object.prototype.hasOwnProperty.call(m, e.refId)) return Math.max(0, onClock(el, m[e.refId]) + e.offset);
    named.push(...Object.keys(m));
  }
  const ref = referenceOf(document, e);
  if (!ref) throw fail(CODES.BAD_CALL, at, __DEV__ && "no marker and no element is named '" + e.refId + "'; the markers are " + (named.join(', ') || 'none'));
  const t = resolveTiming(ref[0]);
  return Math.max(0, t.start + (ref[1] || t.duration == null ? 0 : t.duration) + e.offset);
}

export function tempo(id) {
  const all = clips().filter((el) => el.hasAttribute('data-tempo'));
  let el;
  if (id === undefined) {
    if (all.length !== 1) {
      throw fail(CODES.BAD_CALL, 'tempo()', __DEV__ && (all.length
        ? 'more than one audio clip has data-tempo (' + all.map((c) => c.id || '<' + c.localName + '>').join(', ') + "); name one, as tempo('music')"
        : 'no audio clip under the composition root has data-tempo'));
    }
    el = all[0];
  } else {
    el = typeof id === 'string' ? all.find((c) => c.id === id) : null;
    if (!el) throw fail(CODES.BAD_CALL, 'tempo(id)', __DEV__ && 'no audio clip with the id ' + show(id) + ' has data-tempo');
  }
  const bpm = num(el, 'data-tempo'), down = num(el, 'data-downbeat');
  const meter = el.hasAttribute('data-meter') ? num(el, 'data-meter') : 4;
  if (!(bpm > 0)) throw fail(CODES.BAD_CALL, where(el, 'data-tempo'), __DEV__ && 'data-tempo is beats per minute, above 0, not ' + show(el.getAttribute('data-tempo')));
  if (down == null) throw fail(CODES.BAD_CALL, where(el, 'data-downbeat'), __DEV__ && 'data-downbeat is the seconds into the file where a bar starts, needed with data-tempo');
  if (!(Number.isInteger(meter) && meter > 0)) throw fail(CODES.BAD_CALL, where(el, 'data-meter'), __DEV__ && 'data-meter is a whole number of beats to a bar, not ' + show(el.getAttribute('data-meter')));
  const beat = 60 / bpm / rateOf(el), zero = onClock(el, down);
  return { bpm, beat, meter, at: (n) => zero + n * beat, of: (t) => (t - zero) / beat };
}
