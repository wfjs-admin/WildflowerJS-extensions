/**
 * Coded diagnostics for the Kinetic extension. Own prefix (KN), own ledger.
 *
 * Warnings are development-only, printed as "[KN-141] message" through the
 * core's wildflower.diagnostic() when the core is a development build, and
 * through console.warn in the same format otherwise; errors are thrown or
 * rejected on every build as real Errors carrying `code`. An error's message
 * starts with the code and where, "[KN-100] render({ audioBitrate })", on
 * every build. The development build goes on with the sentence that explains
 * it; the production build goes on with a link to the code's entry on the
 * error-codes page, which has the sentence, so the production file carries
 * none of them. Codes are numbered by range:
 * 10x install and the seek channel, 11x the composition's markup, 12x
 * tracks and eases, 13x inputs, readiness, audio and footage clips, 14x determinism hazards seen
 * during a seek, 15x the scene definition, 16x check(), 17x seek cost,
 * 18x Lottie and animated images, 19x WebGL (Trillium views, effects),
 * 20x render().
 */

export const CODES = {
  BAD_CALL:      'KN-100',   // a Kinetic call with a wrong argument (thrown)
  NO_QUERIES:    'KN-101',   // waitFor used on a tier without queries
  LOADED_TWICE:  'KN-102',   // the extension file was loaded a second time
  NO_DURATION:   'KN-110',   // the composition root has no data-duration
  NO_TIMELINE:   'KN-111',   // the HyperFrames runtime is on the page, and the root has neither data-no-timeline nor a registered timeline
  NO_TIMING:     'KN-112',   // a scene element has no timing ancestor; local equals time
  BAD_REFERENCE: 'KN-113',   // a data-start reference names no element
  OFF_GRID:      'KN-114',   // a clip's start or end falls between two frames
  BAD_TRANSITION:'KN-115',   // a data-clip-transition, data-clip-enter or data-clip-exit Kinetic cannot apply; the clip is left as it is
  NO_PARTNER:    'KN-116',   // a data-clip-transition overlaps no sibling clip, or more than one
  MAP_FAILED:    'KN-117',   // a luma transition's image map failed to load or decode (console error, every build; ready() rejects)
  BAD_STEP:      'KN-118',   // a data-step element that is no step (no id or no data-start), two steps with one id, a step inside a step, a first step that starts after 0, or a step that starts at or past the composition's end
  BAD_TRACK:     'KN-120',   // a malformed track: at/to length, order or value type (thrown)
  BAD_EASE:      'KN-121',   // an unknown ease name, or an ease array of the wrong length (thrown)
  NO_UNIT:       'KN-122',   // a track gives a length property numbers with no unit
  SPRING_CUT:    'KN-123',   // a spring segment's next key arrives before the spring is near rest
  BAD_INPUT:     'KN-130',   // an input fails its type or validator (console error, every build; ready() rejects)
  QUERY_FAILED:  'KN-131',   // a waitFor query ended in error (same)
  QUERY_RELOAD:  'KN-132',   // a waitFor query reloaded after frame 0
  NO_QUERY:      'KN-133',   // a waitFor name is no query (same as 131)
  DEFAULT_CLASH: 'KN-134',   // an input's default differs from the one data-composition-variables declares
  AUDIO_FAILED:  'KN-135',   // an audio clip's file failed to load or decode (console error, every build; ready() rejects)
  AUDIO_ATTR:    'KN-136',   // an audio clip attribute this version does not apply (loop, autoplay, controls), a data-remap not applied, or data-playback-rate beside a remap
  NO_LEVELS:     'KN-137',   // level() or spectrum() read with no audio clip decoded
  FOOTAGE_FAILED:'KN-138',   // a footage clip's file failed to load or decode, or it has no source (console error, every build; ready() rejects)
  FOOTAGE_ATTR:  'KN-139',   // a footage clip attribute Kinetic does not apply, a rate it clamps, or a media start at or past the file's end with no length written
  WALL_CLOCK:    'KN-140',   // Date.now(), performance.now() or new Date() during a seek
  RANDOM:        'KN-141',   // Math.random() during a seek
  ASYNC_WORK:    'KN-142',   // a timer, fetch or requestAnimationFrame started during a seek
  TRANSITION:    'KN-143',   // a CSS transition running under the composition root
  LOCALE:        'KN-145',   // locale-dependent formatting with no locale during a seek
  FOREIGN_WRITE: 'KN-146',   // video mode: a scripted path written by something other than its script; Kinetic puts the script's value back
  SCENE_TICK:    'KN-151',   // a scene that defines tick() is on the page in video mode (render(), the runtime, the setting; not check()), where tick() never runs
  RESERVED:      'KN-152',   // a scene defines a computed or state the extension provides
  KEYS_SHADOW:   'KN-153',   // a scene's keyframes entry and computed share a name; keyframes win
  ROOT_BINDING:  'KN-154',   // a binding on the root tag of a scene inside another scene reads one of Kinetic's values (progress, local...); it reads the outer scene's (the general case is the core's WF-521)
  STYLE_CLASH:   'KN-156',   // a binding or a scene's root: block writes a property a transition writes on the same clip
  LESSON_GAP:    'KN-157',   // step() for an id no data-step has, an until or follow target with no store at readiness, a wait past the step's range, a settings entry after 0 in the first step that scripts its path
  PREVIEW_VIDEO: 'KN-158',   // a page with steps put in video mode by the preview bar alone, under config({ mode: 'auto' })
  STYLE_READ:    'KN-159',   // a key read on a multi-track keyframes entry's style object that it does not have, such as translateY
  CHECK_FAILED:  'KN-160',   // check() failed: readiness failed, a seek printed an error, or a frame differed between two seeks
  SLOW_SEEK:     'KN-170',   // 3 of the last 30 seeks took longer than 8 ms to settle
  LOTTIE_FAILED: 'KN-180',   // a Lottie animation fired data_failed (console error, every build; ready() rejects)
  IMAGE_FAILED:  'KN-181',   // an animated image failed to fetch or decode (console error, every build; ready() rejects)
  IMAGE_STALLED: 'KN-182',   // an image under a scene still loading after 30 s (console error, every build; ready() rejects)
  NO_PRESERVE:   'KN-190',   // a Trillium view in a scene without preserveDrawingBuffer
  CONTEXT_LOST:  'KN-191',   // an effect's WebGL context was lost; it draws nothing until restored
  FINISH_CONTEXT:'KN-192',   // render({ finish }) with 16 WebGL contexts of effects and drawings, so the finish's own pushes the oldest out
  NO_WEBCODECS:  'KN-200',   // render(): no VideoEncoder (insecure context or no WebCodecs) (thrown)
  NO_DRAW_ELEMENT: 'KN-201', // render(): a DOM source without drawElementImage (thrown)
  AAC_FALLBACK:  'KN-202',   // render(): the browser cannot encode AAC, so the sound is Opus
  NO_DELAY:      'KN-203',   // render(): the audio encoder's delay could not be measured (thrown)
  FOREIGN_MEDIA: 'KN-204',   // render(): media from another origin in a DOM source would be drawn black; effect(): a source WebGL cannot read (thrown)
  RUNTIME_SHUTTER: 'KN-205', // render(): a shutter with the HyperFrames runtime on the page, whose player rounds seeks down to its own frames; not applied
  RUNTIME_FPS:   'KN-206',   // render(): the HyperFrames runtime's player seeks on a grid that misses this render's frames, so frames would repeat or skip (thrown)
  ENCODER_FAILED:'KN-207',   // render(): the video encoder reported an error, stopped taking frames for 10 s, or gave output the MP4 cannot hold (thrown)
};

// Readiness's report() (readiness.js fills it in), for a failure a source
// meets on its own time, outside a run of readiness: a Lottie animation's
// data_failed, an animated image's fetch, a scene's input when it is first
// read. It prints the error once and marks the page failed until the next
// run of readiness, which looks at the page again.
export const health = { report() {} };

// The framework's wildflower.diagnostic(), which a development build of the
// core has: a line printed through it is in the core's format, with its Docs
// line, and lands in wildflower.diagnostics and the wildflower:diagnostic
// event. A production core has none, and nor is there a framework when the
// extension is loaded without one; the line is then printed here, in the
// same format. Set at install (wf.js).
let core = null;
export function useCore(wf) {
  core = wf && typeof wf.diagnostic === 'function' ? wf : null;
}

// Development build: the KN lines printed since load (warnings, and the
// errors printed on every build), for the preview bar's count. onLine hears
// each new total.
let lines = 0;
let onLine = null;
export function countLines(fn) { onLine = fn; return lines; }
function counted() {
  lines++;
  if (onLine) onLine(lines);
}

// Development build: the WebGL contexts effect() and draw() opened, for
// KN-192. Chrome keeps 16 a page and drops the oldest for good when another
// is opened. A context counts until it is lost or its canvas is collected.
const contexts = new Set();
const seen = new WeakSet();
export function openedContext(gl) {
  if (seen.has(gl)) return;
  seen.add(gl);
  contexts.add(new WeakRef(gl));
}
export function liveContexts() {
  let n = 0;
  for (const r of contexts) {
    const gl = r.deref();
    if (!gl || gl.isContextLost()) contexts.delete(r);
    else n++;
  }
  return n;
}

export function warn(code, message, suggestion) {
  if (__DEV__) counted();
  if (core) {
    core.diagnostic({ code, message, suggestion });
    return;
  }
  console.warn('[' + code + '] ' + message);
  if (suggestion) console.warn('  ↳ Suggestion: ' + suggestion);
}

// An error printed on every build (readiness's failures, a render the
// preview bar started): through the core's diagnostic() when there is one,
// as a coded error, and with console.error otherwise. `err` is an Error
// from fail(), whose message starts with its code, or anything else.
export function printError(err) {
  const m = err && typeof err.message === 'string' ? err.message : String(err);
  const code = err && err.code;
  if (code && m.startsWith('[' + code + ']')) {
    if (__DEV__) counted();
    if (core) {
      core.diagnostic({ code, severity: 'error', message: m.slice(code.length + 2).trim() });
      return;
    }
  }
  console.error(m);
}

// The code's entry on the error-codes page, which a production message links
// to in place of the sentence.
const DOCS = 'https://www.wildflowerjs.com/docs/error-codes?code=';

// An Error with the code in `code` and in the message, so it reads the same
// in a console and in a catch block. `where` is the call as the author wrote
// it, such as render({ audioBitrate }) or a track's label, or for a failure
// the page raises, the clip with its file, the scene and its input or query.
// `detail` is the sentence, passed as __DEV__ && (...) so the production
// build drops it at every call site: "[code] where: detail" in development,
// "[code] where <link to the code's entry>" in production.
export function fail(code, where, detail) {
  const err = new Error('[' + code + '] ' + where + (__DEV__ ? (detail ? ': ' + detail : '') : ' ' + DOCS + code));
  err.code = code;
  err.where = where;   // check() reports it
  return err;
}

// The time a function that takes it first was given, checked: a number, not
// NaN, and with `finite`, not infinite either; KN-100 otherwise, its where
// the call, such as spring(t). An object there is how Remotion passes its
// frame, and the development message says so, with the call as Kinetic
// takes it. These run every frame, so the number's test comes first and the
// rest only for a bad t.
const USAGE = {
  spring: 'options', ramp: 'from, to, ease', posterize: 'fps', loop: 'from, to', hold: 'at, length', styleAt: 'tracks', smear: 'style, options',
  camera: 'tracks, options', shake: 'profile, options', wiggle: 'options', typewriter: 'text, cps', scramble: 'text, options',
  rank: 'rows, by, options', captions: 'words, options', moment: 'rows', beat: 'beats, options', level: 'band, options', spectrum: 'bins',
};
export function checkTime(t, name, finite) {
  if (typeof t === 'number' && (finite ? Number.isFinite(t) : t === t)) return;
  throw fail(CODES.BAD_CALL, name + '(t)', __DEV__ && 't is the time in seconds, a ' + (finite ? 'finite ' : '') + 'number, not ' + show(t)
    + (t && typeof t === 'object' ? "; an object there is Remotion's shape, and Kinetic's is " + name + '(t, ' + USAGE[name] + ')' : ''));
}

// A value as a development build's error message prints it. JSON, except
// that NaN and the infinities print as themselves where JSON would print
// null (inside an object, as strings), a BigInt prints with its n, and a
// function or a symbol prints as its type rather than as JSON's undefined.
export function show(v) {
  if (typeof v === 'number' || v === undefined) return String(v);
  if (typeof v === 'bigint') return v + 'n';
  if (typeof v === 'function' || typeof v === 'symbol') return 'a ' + typeof v;
  try {
    return JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));
  } catch (_) {
    return String(v);   // a cycle
  }
}
