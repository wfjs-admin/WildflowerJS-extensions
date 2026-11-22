/**
 * kinetic.tools.js: the passes of wildflower.kinetic.check() beyond its
 * self-test, run in the page, and render.batch() (batch.js). Loaded after
 * kinetic.wf.js, which loads it itself, from beside its own file, the first
 * time check() is given an option besides samples and seed or render.batch()
 * is called; a page that loads it with its own script tag has it already.
 * On a page without Kinetic it says so and does nothing.
 *
 *   const r = await wildflower.kinetic.check({
 *     samples: 30, seed: 1,       the self-test, as check() alone runs it
 *     reading: true,              blocks of text that leave before they can be read
 *     layout: true,               text outside the safe area, cut off, over other
 *                                 text, or under its contrast floor
 *     frames: 6 | [0, 2.5, 5],    PNGs of frames: a count, or a list of seconds
 *     strip: true,                those frames tiled into one PNG
 *     lesson: true,               each step entered and waited on to its hold
 *     pace: 'lively',             the pace measured against the dial (calm,
 *                                 lively or bold)
 *     seam: true,                 the last frame to frame 0, as a loop plays it
 *     jumps: true,                every pair of frames, for a sudden pop
 *     diff: [16, 17],             the change between two frames, and where
 *     isolate: ['#bleed'],        each selector hidden in turn over the pair
 *     view: 'render',             the view checked: render (the default),
 *                                 live, or both, each in turn
 *   });
 *
 * The report is check()'s own (ok, reason, frames, samples, ready, errors,
 * ...), with view, console (the KN lines and errors printed during the run,
 * each { kind, text, count }) and a field for each pass that ran: reading
 * { short }, layout { found }, images [{ t, frame, png }], strip (a PNG
 * Blob), lesson { ok, steps }, pace, seam, jumps, diff and isolate. The
 * frames, the strip, the contrast measure, the pace, the seam, the jumps,
 * the diff, isolate and the lesson's stills read pixels (pixels.js); where
 * the browser cannot draw a frame, each of those is left out and named in
 * `skipped`, { pass: { code, message } }, with the error that stopped it
 * (KN-201 without drawElementImage), while the other passes run. With view
 * 'both' the report is the render view's, `live` holds the live view's, and
 * `ok` is false when either fails. A lesson walk that fails makes `ok`
 * false. Nothing else here fails the check: the reading, the layout, the
 * pace and a jump are the author's call, made against the numbers.
 */

import { CODES, fail, show } from '../diagnostics.js';
import { seekTo } from './shared.js';
import { textPass } from './reading.js';
import { createPixels, framesPass, stripOf, pacePass, motionPass, contrastOf } from './pixels.js';
import { walkLesson } from './lesson.js';
import { createBatch } from './batch.js';

const OPTIONS = ['samples', 'seed', 'reading', 'layout', 'frames', 'strip', 'lesson', 'pace', 'seam', 'jumps', 'diff', 'isolate', 'view'];
const FLAGS = ['reading', 'layout', 'strip', 'lesson', 'seam', 'jumps'];
const whole = (n) => Number.isInteger(n) && n >= 0;

// The options, checked: KN-100 naming the option for one that is wrong.
function read(opts) {
  const o = opts || {};
  const bad = (k, why) => fail(CODES.BAD_CALL, 'check({ ' + k + ' })', why);
  for (const k in o) if (!OPTIONS.includes(k)) throw bad(k, __DEV__ && "'" + k + "' is not an option of check(); the options are " + OPTIONS.join(', '));
  for (const k of FLAGS) if (o[k] !== undefined && typeof o[k] !== 'boolean') throw bad(k, __DEV__ && k + ' is true or false, not ' + show(o[k]));
  const f = o.frames;
  if (f !== undefined && !(typeof f === 'number' ? Number.isInteger(f) && f >= 1 : Array.isArray(f) && f.length && f.every((t) => typeof t === 'number' && Number.isFinite(t) && t >= 0))) {
    throw bad('frames', __DEV__ && 'frames is a whole number of frames, 1 or more, or a list of seconds, each 0 or more, not ' + show(f));
  }
  if (o.strip && f === undefined) throw bad('strip', __DEV__ && 'strip tiles the frames that frames asks for; give frames too');
  if (o.pace !== undefined && !['calm', 'lively', 'bold'].includes(o.pace)) throw bad('pace', __DEV__ && "pace is 'calm', 'lively' or 'bold', not " + show(o.pace));
  if (o.diff !== undefined && !(Array.isArray(o.diff) && o.diff.length === 2 && o.diff.every(whole))) throw bad('diff', __DEV__ && 'diff is two frame numbers, each a whole number 0 or more, as [16, 17], not ' + show(o.diff));
  if (o.isolate !== undefined && !(Array.isArray(o.isolate) && o.isolate.length && o.isolate.every((x) => typeof x === 'string' && x.trim()))) throw bad('isolate', __DEV__ && "isolate is a list of CSS selectors, as ['#bleed', '#faces circle'], not " + show(o.isolate));
  if (o.view !== undefined && !['render', 'live', 'both'].includes(o.view)) throw bad('view', __DEV__ && "view is 'render', 'live' or 'both', not " + show(o.view));
  return o;
}

// The KN lines, console errors and uncaught errors while the run lasts,
// each { kind, text }: kind 'kn', 'note' (the suggestion under a KN line),
// 'error' or 'page error'.
function listen() {
  const lines = [];
  let afterKn = false;
  const text = (a) => (a && typeof a === 'object' && typeof a.message === 'string' ? a.message : String(a));
  const wrap = (orig, error) => function (...a) {
    const t = a.map(text).join(' ');
    if (/\[KN-/.test(t)) { lines.push({ kind: 'kn', text: t }); afterKn = true; }
    else if (afterKn && /^\s*↳/.test(t)) lines.push({ kind: 'note', text: t });
    else { afterKn = false; if (error) lines.push({ kind: 'error', text: t }); }
    return orig.apply(this, a);
  };
  const warn = console.warn, err = console.error;
  const w = console.warn = wrap(warn, false), e = console.error = wrap(err, true);
  const onError = (ev) => lines.push({ kind: 'page error', text: ev.error ? text(ev.error) : ev.message });
  const onRejection = (ev) => lines.push({ kind: 'page error', text: 'unhandled rejection: ' + text(ev.reason) });
  self.addEventListener('error', onError);
  self.addEventListener('unhandledrejection', onRejection);
  return {
    lines,
    stop() {
      if (console.warn === w) console.warn = warn;
      if (console.error === e) console.error = err;
      self.removeEventListener('error', onError);
      self.removeEventListener('unhandledrejection', onRejection);
    },
  };
}

// The lines as a report lists them: one that came again (the same kind and
// text, from many seeks) once, at its first place, with its count.
function fold(lines) {
  const out = [], at = new Map();
  for (const l of lines) {
    const key = l.kind + '\n' + l.text;
    if (at.has(key)) { at.get(key).count++; continue; }
    const entry = { kind: l.kind, text: l.text, count: 1 };
    at.set(key, entry);
    out.push(entry);
  }
  return out;
}

export function createTools(wf) {
  const k = wf.kinetic;

  // One check at a time: each holds the view, the mode and the clock's time
  // and puts them back, so a second one started meanwhile waits its turn.
  let turn = Promise.resolve();
  async function check(opts) {
    const o = read(opts);
    const run = turn.then(() => checkNow(o));
    turn = run.catch(() => {});
    return run;
  }
  async function checkNow(o) {
    if (o.view !== 'both') return once(o, o.view || 'render');
    const r = await once(o, 'render');
    r.live = await once(o, 'live');
    r.ok = r.ok && r.live.ok;
    return r;
  }

  // The whole check in one view, held through self.__KINETIC_VIEW (the
  // store's viewmode) from the self-test to the last pass. The time, the
  // mode and a playing clock are put back after.
  async function once(o, view) {
    const s = wf.getStore('kinetic');
    const held = self.__KINETIC_VIEW;
    self.__KINETIC_VIEW = view;
    const before = s.time, was = s.playing, mode = k.config().mode;
    const log = listen();
    const px = createPixels(k);
    const skipped = {};
    let r = null;
    // A pass that reads pixels: an error from a capture skips it, with that
    // error, and anything else is thrown.
    const pixels = async (names, fn) => {
      try { return await fn(); } catch (e) {
        if (e !== px.broken) throw e;
        for (const n of names) skipped[n] = { code: e.code || null, message: String(e.message || e) };
      }
    };
    try {
      r = await k.check({ samples: o.samples, seed: o.seed });
      r.view = view;
      k.pause();
      if (o.frames !== undefined) {
        await pixels(o.strip ? ['images', 'strip'] : ['images'], async () => {
          const shots = await framesPass(wf, px, o.frames);
          r.images = shots.map((x) => ({ t: x.t, frame: x.frame, png: x.png }));
          if (o.strip) r.strip = await stripOf(shots);
        });
      }
      if (o.reading || o.layout) {
        // A lesson is read as its video; a page with no steps is the same in
        // both modes, so its mode is left as it is.
        const lesson = s.stepCount > 0;
        if (lesson) k.config({ mode: 'video' });
        const text = await textPass(wf, k, !!o.layout, o.layout ? (el, t) => contrastOf(k, px, el, t) : null);
        if (lesson) k.config({ mode });
        if (o.reading) r.reading = { short: text.short };
        if (o.layout) r.layout = { found: text.found };
        if (text.contrastError) await pixels(['contrast'], () => { throw text.contrastError; });
      }
      if (o.pace) await pixels(['pace'], async () => { r.pace = await pacePass(wf, px, o.pace); });
      const motion = ['seam', 'jumps', 'diff', 'isolate'].filter((n) => o[n]);
      if (motion.length) await pixels(motion, async () => Object.assign(r, await motionPass(wf, px, o)));
      if (o.lesson) {
        r.lesson = await walkLesson(wf, k, log, px, (e) => { skipped.stills = { code: e.code || null, message: String(e.message || e) }; });
        if (!r.lesson.ok) r.ok = false;
      }
    } finally {
      log.stop();
      if (held === undefined) delete self.__KINETIC_VIEW; else self.__KINETIC_VIEW = held;
      k.pause();
      k.config({ mode });
      // A clock that was playing plays on, whether or not the seek back to its time settles.
      try { await seekTo(k, before); } finally { if (was) k.play(); }
    }
    r.console = fold(log.lines);
    if (Object.keys(skipped).length) r.skipped = skipped;
    return r;
  }

  return Object.assign({ check }, createBatch(k));
}

const wf = self.wildflower;
const kinetic = wf && wf.kinetic;
if (!kinetic) console.error('[KN-100] kinetic.tools.js: wildflower.kinetic is not on the page; load kinetic.wf.js before kinetic.tools.js');
else if (!kinetic.tools) kinetic.tools = createTools(wf);
