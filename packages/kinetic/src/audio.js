/**
 * Audio clips: every <audio> with data-start inside the composition root,
 * and the sound of every footage clip with data-has-audio="true" (a <video>
 * with data-start, footage.js), written as HyperFrames writes them, so the
 * same page renders with sound through either route.
 *
 *   data-start, data-duration, data-end   timed like any clip (timing.js);
 *                                         without a length, the rest of the
 *                                         file at the rate
 *   data-media-start   seconds into the file where the clip starts
 *                      (data-playback-start first, the runtime's order)
 *   data-playback-rate file seconds per composition second, 0.1 to 10; the
 *                      pitch moves with it (mix.js)
 *   data-volume        gain, 1 is 0 dB, up to 3.98 (+12 dB)
 *   data-fade-in, data-fade-out   seconds of linear fade at the clip's own edges
 *   id                 for a start that names it, and level({ clip })
 *
 * loop, autoplay and controls on an <audio> are not applied, and
 * development builds say so once per clip (KN-136; footage.js warns about a
 * <video>'s, KN-139), and about a data-start that names no element (KN-113).
 *
 * load() runs at readiness (readiness.js), and so in check() and render():
 * each file is fetched and decoded once (and let go once a load finds no
 * clip using it), at 48 kHz, and the same buffers
 * serve the preview, the render's mix (render.js) and the levels. A file
 * that fails to load or decode is KN-135 for each clip on the page that
 * uses it, each message giving its own clip, which readiness prints on
 * every build and fails with; the next load asks for it again, so a file
 * put on the server since passes. For footage whose file decodes to no sound, its development
 * message says the file has no sound track. After the decode, the levels' tables are built
 * (levels.js) and,
 * when there were levels or now are, the clock store's `levels` count goes
 * up, so a computed that called level() or spectrum() reads them; frame 0
 * waits for all of it. When the clips changed, what sounds stops, and the
 * next seek starts the new set.
 *
 * The preview: with no HyperFrames runtime on the page, Kinetic plays the
 * clips through Web Audio, following its own clock (the runtime plays media
 * itself, so with it Kinetic plays nothing). On every seek: while playing,
 * the clips start so that the sound of a frame is heard while the frame is
 * on screen (mix.js, startPlan), and restart after a gap of more than 45 ms;
 * while paused, the seek plays its frame's slice alone, one frame long, and
 * a seek to the time already shown plays nothing. A pause stops every
 * source the moment `playing` turns false, and the hold at the end of
 * play({ to }) plays no slice. Seeks made by check() and render() play
 * nothing. The context starts suspended until a gesture: the preview bar's
 * sound or play button, or without the bar Kinetic's own speaker over the
 * stage's corner (below). config({ sound: false }) plays nothing and
 * suspends the context.
 * The layer starts no timer or fetch during a seek; its performance.now()
 * reads are this file's own, which the guard ignores.
 *
 * level(t, band, { clip }) and spectrum(t, bins) read the tables at the
 * frame nearest t: 0 (or zeros) before the first decode, and with no audio
 * clip, which development builds warn about once after a load (KN-137).
 */

import { CODES, warn, fail, show, checkTime } from './diagnostics.js';
import { compositionRoot, resolveTiming, frameRate, num, mediaStartOf, remapOf } from './timing.js';
import { clipName } from './clips.js';
import { RATE, clipOf, mixSegment, play, startPlan, heardAt, drift, DRIFT, remapWords, remapFix } from './mix.js';
import { analyse, BANDS, FINE } from './levels.js';

const IGNORED = ['loop', 'autoplay', 'controls'];
const EDGE = 0.003;              // s of ramp at each end of a paused frame's slice

// What a fetch that failed for `url` may need: a page opened from a file
// cannot fetch, and a file on another origin needs CORS headers (also for a
// luma transition's map, maps.js). The page's
// origin is self.origin, which a srcdoc frame shares with its parent while
// its location.origin reads "null". A url that is no URL gets no note, and
// never throws, since this runs on a failure's way to its error.
export function fetchNote(url) {
  try {
    return self.location.protocol === 'file:' ? '; a page opened from a file cannot fetch its files, so serve the folder over http, such as from localhost'
      : new URL(url, document.baseURI).origin !== self.origin ? '; a file on another origin needs CORS headers (Access-Control-Allow-Origin) to be read' : '';
  } catch (_) {
    return '';
  }
}

// "the audio clip audio#music", or "the footage clip video#talk".
const clipWord = (el) => 'the ' + (el.localName === 'video' ? 'footage' : 'audio') + ' clip ' + clipName(el);

// A clip's file: its src, and for an <audio> or a <video> with <source>
// children the one the element chose, else the first.
function fileOf(el) {
  const src = el.getAttribute('src');
  if (src) return src;
  const first = el.querySelector('source[src]');
  return el.currentSrc || (first && first.getAttribute('src'));
}

export function createAudio(wf, clock) {
  const w = self;
  const files = new Map();       // url -> Promise<AudioBuffer>, rejecting with { why } (decode)
  let clips = [];                // the decoded clips, as mix.js reads them, with id
  let tables = null;             // { sig, fps, frames, mix, byId }
  let building = null;           // { sig, promise } while tables are built
  let loaded = false;            // a load has finished
  let ctx = null;                // the preview's AudioContext
  let on = true;                 // the sound is wanted; the bar's button turns it off
  let muted = false;             // config({ sound: false }) suspended the context
  let sources = [];
  let anchor = null;             // { x, when } of the playing sources
  let still = null;              // the paused frame whose slice has played
  let preview = null;
  let early = false;             // KN-137 printed
  const attrsWarned = new WeakSet();

  // Each file fetched and decoded once, for every clip that uses it. A
  // failure rejects with `why`, which gives the development sentence for a
  // clip, so each clip's KN-135 gives that clip (clipFrom), and is not kept,
  // so the next load asks for the file again.
  function decode(url) {
    let p = files.get(url);
    if (!p) {
      p = (async () => {
        let res, data;
        try {
          res = await fetch(url);
          data = res.ok && await res.arrayBuffer();
        } catch (e) {
          throw { why: __DEV__ && (() => 'could not be fetched (' + (e && e.message || e) + ')' + fetchNote(url)) };
        }
        if (!res.ok) throw { why: __DEV__ && (() => 'could not be loaded (HTTP ' + res.status + ')') };
        try {
          return await new OfflineAudioContext(2, 1, RATE).decodeAudioData(data);
        } catch (e) {
          // A video file whose sound does not decode has no sound track this
          // browser reads.
          throw { why: __DEV__ && ((el) => (el.localName === 'video'
            ? 'has no sound track to decode (' + (e && e.message || e) + '), so data-has-audio="true" has nothing to play; give it muted in place of data-has-audio for the picture alone'
            : 'could not be decoded (' + (e && e.message || e) + ')')) };
        }
      })();
      files.set(url, p);
      p.catch(() => { if (files.get(url) === p) files.delete(url); });
    }
    return p;
  }

  async function clipFrom(el) {
    const tm = resolveTiming(el);
    if (__DEV__ && !attrsWarned.has(el)) {
      attrsWarned.add(el);
      // A footage clip's remap is footage.js's to report (KN-139); an <audio>
      // clip's is reported here.
      if (el.localName === 'audio') {
        const remap = remapOf(el);
        if (remap === false) {
          warn(CODES.AUDIO_ATTR, clipWord(el) + ' has ' + remapWords(el.getAttribute('data-remap')) + ', so the clip plays at data-playback-rate', remapFix());
        } else if (remap && el.hasAttribute('data-playback-rate')) {
          warn(CODES.AUDIO_ATTR, clipWord(el) + ' has data-playback-rate with data-remap, whose keys set the speed, so the rate is not applied', 'Remove data-playback-rate.');
        }
      }
      const found = el.localName === 'audio' ? IGNORED.filter((a) => el.hasAttribute(a)) : [];
      if (found.length) {
        warn(CODES.AUDIO_ATTR, clipWord(el) + ' has ' + found.join(', ') + ', which this version of Kinetic does not apply'
          + (found.includes('autoplay') || found.includes('controls') ? '; Kinetic plays the clip itself, so the element\'s own playback would double it' : ''),
        'Remove ' + (found.length > 1 ? 'them' : 'it') + '. For a clip that repeats, write one <audio> per repeat.');
      }
      // footage.js warns about a footage clip's, sound or none.
      if (tm.missing.length && el.localName === 'audio') {
        warn(CODES.BAD_REFERENCE, 'data-start on ' + clipWord(el) + " names '" + tm.missing[0] + "', which is no element's id or composition id, so the clip starts at 0",
          'Give the referenced clip that id, or write the start in seconds.');
      }
    }
    const src = fileOf(el);
    if (!src) throw fail(CODES.AUDIO_FAILED, clipWord(el), __DEV__ && 'has no src and no <source src>, so it has nothing to play');
    const url = new URL(src, document.baseURI).href;
    let buffer;
    try { buffer = await decode(url); } catch (r) { throw fail(CODES.AUDIO_FAILED, clipWord(el) + ' (' + src + ')', __DEV__ && r.why(el)); }
    const c = clipOf({
      buffer, start: tm.start, duration: tm.duration, mediaStart: mediaStartOf(el),
      volume: num(el, 'data-volume'), fadeIn: num(el, 'data-fade-in'), fadeOut: num(el, 'data-fade-out'),
      rate: num(el, 'data-playback-rate'),
      remap: remapOf(el) || null,   // false, a malformed one, is not applied
    });
    c.id = el.id;
    c.url = url;
    return c;
  }

  const sigOf = (list) => list.map((c) => [c.url, c.id, c.start, c.len, c.offset, c.rate, c.remap ? c.remap.text : '', c.env.join(' ')].join(',')).join('|');

  // The composition's clips decoded, the tables built for them, and the
  // preview's context made when there is something to play. When the clips
  // changed, what sounds stops, and the next seek starts the new set. Every
  // clip is settled: `onFail` is given each one's KN-135, and the load
  // rejects with the first. A clip `skip(el)` names (footage whose picture
  // failed, readiness.js) is not asked for.
  async function load(onFail, skip) {
    const root = compositionRoot(document);
    let els = root ? Array.from(root.querySelectorAll('audio[data-start], video[data-start][data-has-audio="true"]')) : [];
    if (skip) els = els.filter((el) => !skip(el));
    const settled = await Promise.allSettled(els.map(clipFrom));
    const bad = settled.filter((r) => r.status === 'rejected').map((r) => r.reason);
    if (onFail) bad.forEach(onFail);
    if (bad.length) throw bad[0];
    const list = settled.map((r) => r.value);
    if (sigOf(list) !== sigOf(clips)) { stopAll(); still = null; }
    clips = list;
    // A decoded file no clip uses now is let go; a clip that uses it again
    // fetches it again.
    for (const url of Array.from(files.keys())) if (!list.some((c) => c.url === url)) files.delete(url);
    await build(root);
    loaded = true;
    sync();
    return list;
  }

  // ---- levels ---------------------------------------------------------------

  // The mix of `list` in one channel.
  const mono = (list, start, length) => mixSegment(list, start, length, 1).then((b) => b.getChannelData(0));

  function build(root) {
    const fps = root ? frameRate(root, clock.store.fps) : clock.store.fps;
    // The root's own length, else the store's (the runtime's player), else
    // the end of the last clip.
    let total = root ? Number(root.getAttribute('data-duration')) : 0;
    if (!(total > 0)) total = clock.store.duration;
    if (!(total > 0)) for (const c of clips) total = Math.max(total || 0, (c.start + c.len) / RATE);
    const frames = Math.max(0, Math.ceil(total * fps - 1e-6));
    const sig = fps + '|' + frames + '|' + sigOf(clips);
    if (tables && tables.sig === sig) return null;
    if (building && building.sig === sig) return building.promise;
    const list = clips;
    const job = building = { sig, promise: null };
    job.promise = (async () => {
      const t = { sig, fps, frames, mix: null, byId: new Map() };
      if (list.length && frames) {
        t.mix = await analyse((s, n) => mono(list, s, n), frames, fps, 4 + FINE);
        // One clip alone, over its own frames and the release after them.
        for (const c of list) {
          if (!c.id || t.byId.has(c.id)) continue;
          const from = Math.floor(c.start / RATE * fps) - 1, to = Math.ceil(((c.start + c.len) / RATE + 0.2) * fps) + 1;
          t.byId.set(c.id, await analyse((s, n) => mono([c], s, n), frames, fps, 4, from, to));
        }
      }
      // A newer job, for clips that changed meanwhile, has the last word,
      // and this one settles with it, so its load() waits for tables that
      // cover its own clips.
      if (building !== job) return building ? building.promise : undefined;
      building = null;
      // The count moves only when there were levels or now are, so a page
      // with no audio clip is left as it was.
      const changed = !!((tables && tables.mix) || t.mix);
      tables = t;
      if (changed) clock.store.levels++;
    })();
    // A build that failed is not kept: the next load builds again.
    job.promise.catch(() => { if (building === job) building = null; });
    return job.promise;
  }

  // The table level() or spectrum() reads, or null: before the first decode,
  // or with no audio clip. The read of the store's `levels` makes a computed
  // that calls them run again when the tables change.
  function table(id, what) {
    const t = clock.store.levels > -1 ? tables : null;
    if (!t || !t.mix) {
      if (__DEV__ && loaded && !early) {
        early = true;
        warn(CODES.NO_LEVELS, what + '() was read, and the composition has no audio clip decoded, so it reads 0',
          'Put an <audio src="..." data-start="0"> inside the composition root. A clip added after the page loaded is decoded by await wildflower.kinetic.ready().');
      }
      return null;
    }
    if (id === undefined) return t;
    const own = t.byId.get(id);
    if (!own) throw fail(CODES.BAD_CALL, what + "(t, band, { clip: '" + id + "' })", __DEV__ &&"no audio clip in the composition has the id '" + id + "'; the ids are " + (t.byId.size ? Array.from(t.byId.keys()).join(', ') : 'none'));
    return { fps: t.fps, frames: t.frames, mix: own, cols: 4 };
  }

  const row = (t, time) => {
    const f = Math.round(time * t.fps);
    return f >= 0 && f < t.frames ? f : -1;
  };

  function level(time, band, opts) {
    checkTime(time, 'level');
    const col = BANDS.indexOf(band === undefined ? 'all' : band);
    if (col < 0) throw fail(CODES.BAD_CALL, 'level(…, band)', __DEV__ && "band is 'bass', 'mid', 'treble' or 'all', not " + show(band));
    if (opts !== undefined && (!opts || typeof opts !== 'object')) throw fail(CODES.BAD_CALL, 'level(…, options)', __DEV__ &&'options is { clip }, not ' + show(opts));
    const id = opts && opts.clip;
    if (id !== undefined && typeof id !== 'string') throw fail(CODES.BAD_CALL, 'level(t, band, { clip })', __DEV__ && "clip is an audio clip's id, not " + show(id));
    const t = table(id, 'level');
    if (!t) return 0;
    const f = row(t, time);
    return f < 0 ? 0 : t.mix[f * (t.cols || 4 + FINE) + col];
  }

  function spectrum(time, bins) {
    checkTime(time, 'spectrum');
    const n = bins === undefined ? 16 : bins;
    if (!(Number.isInteger(n) && n >= 1 && n <= FINE)) throw fail(CODES.BAD_CALL, 'spectrum(…, bins)', __DEV__ && 'bins is a whole number from 1 to ' + FINE + ', not ' + show(bins));
    const out = new Array(n).fill(0);
    const t = table(undefined, 'spectrum');
    const f = t ? row(t, time) : -1;
    if (f < 0) return out;
    // Each bin is the mean of the fine bins it covers, a fine bin cut by
    // its edge counting by the part inside.
    const base = f * (4 + FINE) + 4;
    for (let j = 0; j < n; j++) {
      const lo = j * FINE / n, hi = (j + 1) * FINE / n;
      let sum = 0;
      for (let k = Math.floor(lo); k < hi; k++) sum += t.mix[base + k] * (Math.min(hi, k + 1) - Math.max(lo, k));
      out[j] = sum / (hi - lo);
    }
    return out;
  }

  // ---- the preview ------------------------------------------------------------

  const notify = () => { if (preview) preview.sound(); speaker(); };

  // 0: no button (no clip, sound off by config, the runtime plays media,
  // or no context); 1: the sound is off; 2: on.
  function status() {
    if (!clips.length || !clock.soundOn() || clock.hasRuntime() || !ctx) return 0;
    return on && ctx.state === 'running' ? 2 : 1;
  }

  const barShown = () => { const el = preview && preview.element(); return !!(el && el.isConnected); };

  function context() {
    if (ctx || !clips.length || !clock.soundOn() || clock.hasRuntime() || w.__HF_RENDER_CAPTURE_MODE || typeof w.AudioContext !== 'function') return;
    ctx = new w.AudioContext({ latencyHint: 'interactive' });
    // Without the bar, the first gesture on the page turns the sound on: a
    // click (after a mouse press or a tap, both of which let a page start
    // sound) or a key. The listeners go after that first one.
    const events = ['click', 'keydown'];
    const gesture = () => {
      if (barShown() || btn) return;
      unlock();
      for (const e of events) document.removeEventListener(e, gesture, true);
    };
    for (const e of events) document.addEventListener(e, gesture, true);
    ctx.onstatechange = notify;
  }

  function stopAll() {
    for (const s of sources) {
      try { s.stop(); } catch (_) { /* already stopped */ }
      s.disconnect();
    }
    sources = [];
    anchor = null;
  }

  // Resumes the context, unless the sound was turned off on the bar.
  function unlock() {
    if (ctx && on && ctx.state !== 'running') ctx.resume().catch(() => {});
  }

  // The bar's sound button.
  function toggle() {
    if (!ctx) return;
    if (status() === 2) {
      on = false;
      stopAll();
      ctx.suspend().catch(() => {});
    } else {
      on = true;
      ctx.resume().catch(() => {});
    }
    notify();
  }

  // ---- the speaker -------------------------------------------------------
  // Without the bar, a page with sound gets a speaker button over the stage's
  // lower right corner, beside the composition root and outside it, so no
  // check or render sees it. It turns the sound on and off and does nothing
  // else (a click on the stage pauses), and the sound stays off until it is
  // pressed. It shows for 2 s once it is made, then while the pointer is over
  // the stage, fading 2 s after the pointer leaves or 3 s after it last
  // moved, for 3 s after a touch on the stage, and while the keyboard's focus
  // is on it. Left alone it always fades, since a page may run unattended
  // on a screen in a hall or a talk.
  let btn = null, root = null, hide = 0, over = false;
  const SPEAKER = 'data-kinetic-speaker';
  const ICON = (on) => '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>'
    + (on ? '<path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>' : '<path d="M17 9l5 6M22 9l-5 6"/>') + '</svg>';
  // Keyboard focus keeps it up; the focus a mouse click leaves behind does not.
  const keyed = () => { try { return btn.matches(':focus-visible'); } catch (_) { return false; } };
  function show(ms) {
    if (!btn) return;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    clearTimeout(hide);
    if (ms) hide = setTimeout(() => { if (btn && !keyed()) { btn.style.opacity = '0'; btn.style.pointerEvents = 'none'; } }, ms);
  }
  // The button's place: the root's lower right corner, inside the root's
  // parent, which the fit's scale and the page's layout move with it. A root
  // the fit has wrapped since takes the button with it, sound as it was.
  function place() {
    const p = root.parentElement;
    if (btn.parentElement !== p) {
      if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
      p.insertBefore(btn, root.nextSibling);
    }
    const r = root.getBoundingClientRect(), b = p.getBoundingClientRect();
    btn.style.left = (r.right - b.left - p.clientLeft - 60) + 'px';
    btn.style.top = (r.bottom - b.top - p.clientTop - 60) + 'px';
  }
  function speaker() {
    const r = compositionRoot(document);
    if (!r || barShown() || status() === 0) {
      if (btn) { btn.remove(); btn = null; }
      return;
    }
    if (!btn || root !== r || !btn.isConnected) {
      if (btn) btn.remove();
      root = r;
      btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute(SPEAKER, '');
      btn.style.cssText = 'position:absolute;z-index:2;width:44px;height:44px;margin:0;padding:0;border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;'
        + 'background:rgba(38,40,45,0.72);color:#efe8db;cursor:pointer;opacity:0;pointer-events:none;transition:opacity 0.3s';
      btn.addEventListener('click', toggle);
      btn.addEventListener('focus', () => show(keyed() ? 0 : 2000));
      btn.addEventListener('blur', () => { if (!over) show(2000); });
      const p = r.parentElement;
      if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
      p.insertBefore(btn, r.nextSibling);
      show(2000);
      // Off until the viewer presses it, even where the browser would let the page start sound.
      if (status() === 2) { on = false; stopAll(); ctx.suspend().catch(() => {}); }
    }
    const sounding = status() === 2;
    btn.innerHTML = ICON(sounding);
    btn.setAttribute('aria-pressed', String(sounding));   // a toggle: its name stays, its state is pressed or not
    btn.setAttribute('aria-label', 'Sound');
    place();
  }
  // Over the stage or the button: shown, and gone 3 s after the pointer last
  // moved. A touch on the stage shows it for 3 s.
  const within = (e) => { const r = root.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  document.addEventListener('pointermove', (e) => {
    if (!btn || e.pointerType === 'touch') return;
    if (within(e)) { over = true; place(); show(3000); } else if (over) { over = false; show(2000); }
  });
  document.addEventListener('pointerdown', (e) => {
    if (btn && e.pointerType === 'touch' && (within(e) || e.target === btn || btn.contains(e.target))) { place(); show(3000); }
  });
  w.addEventListener('resize', () => { if (btn) place(); });

  // A paused frame's slice: from t for one frame, every clip that overlaps
  // it, at its gain there, with a 3 ms ramp at each end.
  function slice(t) {
    stopAll();
    const len = 1 / (clock.store.fps || 30), when = ctx.currentTime + 0.01;
    for (const c of clips) {
      const s = c.start / RATE, e = (c.start + c.len) / RATE;
      if (t >= e || t + len <= s) continue;
      const from = Math.max(t, s), dur = Math.min(t + len, e) - from;
      sources.push(play(ctx, c, when + (from - t), (from - s) * RATE, dur * RATE, Math.min(EDGE, dur / 2)));
    }
  }

  // After every seek's store write.
  function follow(t) {
    // A quiet seek (check(), render(), or the hold at the end of play({ to })
    // or with loop off) stops the sound on its frame and plays no slice.
    if (clock.quiet()) still = t;
    if (!ctx || ctx.state !== 'running' || !on || !clock.soundOn() || clock.hasRuntime() || clock.quiet()) {
      if (sources.length) stopAll();
      return undefined;
    }
    if (!clock.store.playing) {
      if (t !== still) { still = t; slice(t); }
      return undefined;
    }
    still = null;
    const perf = performance.now();
    const ts = ctx.getOutputTimestamp();
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    if (anchor && Math.abs(drift(anchor, t, heardAt(perf, ts, ctx.currentTime, latency))) <= DRIFT) return undefined;
    const plan = startPlan(clips, { t, perf, ctxTime: ctx.currentTime, ts, latency });
    stopAll();
    for (const s of plan.starts) sources.push(play(ctx, s.clip, s.at, s.into * RATE, s.clip.len - s.into * RATE));
    anchor = { x: plan.x, when: plan.when };
    return undefined;
  }

  clock.onSeek(follow);
  // A pause writes `playing` without a seek: the playing sources stop on the
  // change itself, and the frame on screen is the one already heard.
  clock.store.subscribe('playing', (playing) => {
    if (!playing && anchor) { stopAll(); still = clock.now(); }
  });

  // config({ sound }) and the clips changed. Sound turned off by config()
  // suspends the context, and turned on again resumes it, unless the bar's
  // button had turned it off.
  function sync() {
    if (!clock.soundOn()) {
      stopAll();
      if (ctx && ctx.state === 'running') { muted = true; ctx.suspend().catch(() => {}); }
    } else {
      context();
      if (muted) { muted = false; unlock(); }
    }
    notify();
  }

  return {
    load, level, spectrum, status, toggle, unlock, sync,
    usePreview(p) { preview = p; },
  };
}
