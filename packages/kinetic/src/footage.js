/**
 * Footage: every <video> with data-start inside the composition root, timed
 * like any clip and written as HyperFrames writes one, so the same page
 * renders through either route.
 *
 *   data-start, data-duration, data-end   timed like any clip (timing.js);
 *                                         without a length, the rest of the
 *                                         file at its rate
 *   data-media-start      seconds into the file where the clip starts
 *                         (data-playback-start first, the runtime's order);
 *                         at or past the file's end with no length written,
 *                         a clip of no length, never shown (KN-139)
 *   data-playback-rate    file seconds per composition second, 0.1 to 10
 *   muted                 the picture alone
 *   data-has-audio="true" its sound plays, as an audio clip (audio.js)
 *
 * At composition time t a clip is at data-media-start + (t - start) * rate
 * in its file, with t held inside the clip's window and the result at most
 * the file's length, so past the end of the file the last frame holds. The
 * frame it shows is the source frame on screen 1 ms after that time. A seek
 * to the exact time showed the frame before it for a third of frames in
 * Chrome, which reads a time down to the microsecond, and WebM stores each
 * frame's time in whole milliseconds: 10 µs on was exact for MP4 and missed
 * a third of the frames of 30 fps WebM, 0.5 ms on missed 4 of 60 frames of
 * 24 fps WebM in Chrome 154, and 1 ms on was exact for every file tried. The
 * seek goes 2 µs past that millisecond as well, so a frame that starts
 * exactly 1 ms after the time (29.97 fps footage at a whole second) is the
 * one taken.
 *
 * With no HyperFrames runtime on the page, this layer drives each clip. On
 * a seek while the clock is paused, and on every seek of check() and
 * render(), each clip is paused and its currentTime set to its time, and the
 * clock's media hook waits for its `seeked`, after the guard's window has
 * closed (clock.js), so the frame is on the element when the barrier
 * resolves. A clip already there, or already seeking there, is not given the
 * time again; a `seeked` that arrives while the element is still seeking is
 * an earlier seek's. A clip before its window is held on its first frame
 * and one after it on the frame at its end, so a clip that enters its window
 * has its frame decoded. While the clock plays, a clip inside its window
 * plays natively at its rate: a clip that starts within 50 ms of its frame,
 * in composition time, plays from where it is, and a playing clip is seeked
 * again only when it is more than 50 ms off and is neither seeking nor short
 * of data (a scrub, the loop back to 0, a stall); its rate is kept to the
 * clip's on every seek. Outside its window it is held as above. A pause
 * writes `playing` without a seek, so the layer follows `playing` too and
 * holds every clip at the clock's time. The element is kept muted, since its
 * sound, with data-has-audio, plays through Web Audio. A play() the browser
 * refuses (an autoplay block) leaves the clip held, and the next seek tries
 * again. The layer starts no timer, animation frame or fetch during a seek,
 * and reads no clock.
 *
 * load() runs at readiness, before check() and before a render: each clip's
 * metadata and first frame (loadeddata), so its length is known and its
 * first seek has data to show. A clip with preload="none" is set to
 * preload="auto", which starts its load, since Kinetic plays the element. A clip that fails, or has no
 * source, is KN-138, which readiness prints on every build and fails with;
 * the next load loads it again from its source, so a file put on the server
 * since passes, and a clip taken off the page or given another source fails
 * nothing more.
 * Chrome reports a missing file as a format it cannot play, so the file is
 * asked for once, with no-cors: a file on another origin answers opaquely,
 * which shows it was reached, and a <video> needs no CORS headers to play.
 * The request is waited for 3 s at most, and a blob: or data: URL, which no
 * server holds, is not asked for.
 * Each clip's length, when its metadata arrives or changes, moves the clips
 * timed from it (timing.js, timingChanged).
 *
 * With the runtime on the page, the runtime owns media: no seek, no
 * playback, no muting and no wait here. A runtime that arrives after
 * Kinetic started playing the clips gets them paused, each with the muted
 * its markup gives it. Development builds warn once per clip, with the
 * runtime or without, about an attribute Kinetic does not apply, a rate it
 * clamps, or muted and data-has-audio together (KN-139), and about a
 * data-start that names no element (KN-113).
 */

import { CODES, warn, fail } from './diagnostics.js';
import { compositionRoot, resolveTiming, num, rateOf, mediaStartOf, remapOf, timingChanged, fileLength } from './timing.js';
import { remapAt, remapRate, remapWords, remapFix } from './mix.js';
import { clipName, inWindow } from './clips.js';

const NUDGE = 0.001002;  // s past the file time a seek goes to: 1 ms, and 2 µs for a frame that starts exactly then
const SAME = 1e-6;       // s; a clip this close to its frame is not seeked
const DRIFT = 0.05;      // s of composition time a playing clip may be off before it is seeked
const SEEK_WAIT_MS = 30000;  // a seek not landed after this fails (KN-138)
const LEAST = 0.0625;    // the slowest playbackRate Chrome plays; a remap slower than that is held frame by frame
const MOST = 16;         // and the fastest
const DRIVEN = ['autoplay', 'controls', 'loop'];
const SETTLED = ['seeked', 'error', 'emptied'];
const READY = ['loadeddata', 'canplay', 'seeked'];
const FORMATS = '; Chrome plays H.264, VP9 and AV1 video in an MP4 or WebM file';
const PROBE_MS = 3000;   // the most a KN-138's cause-finding request is waited for (development)

export function createFootage(clock, clips) {
  const waits = new WeakMap();    // element -> { key, promise }: its readiness wait
  const watched = new WeakSet();  // clips whose length moves the clips timed from them
  const warned = new WeakSet();   // clips KN-139 has looked at
  const driven = new WeakSet();   // clips Kinetic has muted, started or seeked
  let drove = false;              // some clip is in `driven`

  function list() {
    const root = compositionRoot(document);
    return root ? Array.from(root.querySelectorAll('video[data-start]')) : [];
  }

  // [the file time a clip shows at t, 1 ms on and at most the file's end,
  // whether t is inside its window, its speed there in file seconds per
  // second]. With data-remap (timing.js, remapOf) the file time and the
  // speed come from the remap's keys; else from the rate.
  function at(el, t) {
    const w = clips.windowOf(el, clock.store.duration);
    const local = Math.min(Math.max(t, w.start), w.end) - w.start;
    const r = remapOf(el);
    const file = mediaStartOf(el) + (r ? remapAt(r, local) : local * rateOf(el));
    return [Math.min(file + NUDGE, el.duration), inWindow(t, w.start, w.end), r ? remapRate(r, local) : rateOf(el)];
  }

  // Pauses a clip and seeks it to `to`, unless it is there or already seeking
  // there; true when its `seeked` is still to come.
  function hold(el, to) {
    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - to) > SAME) el.currentTime = to;
    else if (!el.seeking) return false;
    return true;
  }

  // The clip's next `seeked` that leaves it still, or the end of its source.
  // A seek set over one still running fires one `seeked`, for the later time,
  // and a `seeked` that arrives while the element is still seeking belongs
  // to an earlier seek. For a seek onto the end of the file, Chrome can fire
  // `seeked` before it has flushed the last frames, and `ended` reads only
  // the position, so that seek waits for `ended` and for the element to
  // present a frame, for up to a second.
  // A seek that has not landed in SEEK_WAIT_MS, its file stopped loading
  // partway, is KN-138 naming the clip, so a render never waits forever.
  const seeked = (el, end) => new Promise((resolve, reject) => {
    let shown = !end || !el.requestVideoFrameCallback;
    if (!shown) el.requestVideoFrameCallback(() => { shown = true; });
    const late = setTimeout(() => {
      for (const n of SETTLED) el.removeEventListener(n, done);
      reject(fail(CODES.FOOTAGE_FAILED, 'the footage clip ' + clipName(el), __DEV__ && 'did not land on its frame in 30 s; its file may have stopped loading partway'));
    }, SEEK_WAIT_MS);
    const done = (e) => {
      if (e.type === 'seeked' && el.seeking) return;
      clearTimeout(late);
      for (const n of SETTLED) el.removeEventListener(n, done);
      let polls = 0;
      const out = () => (!end || e.type !== 'seeked' || el.ended && shown || ++polls > 60 ? resolve() : setTimeout(out, 16));
      out();
    };
    for (const n of SETTLED) el.addEventListener(n, done);
  });

  // The runtime has arrived, and owns media from here: each clip on the page
  // that Kinetic drove is paused and gets the muted its markup gives it. A
  // clip taken off the page is let go, and the set holds it weakly.
  function release() {
    for (const el of list()) {
      if (!driven.has(el)) continue;
      driven.delete(el);
      if (!el.paused) el.pause();
      el.muted = el.hasAttribute('muted');
    }
    drove = false;
  }
  const drive = (el) => { driven.add(el); drove = true; };

  // Moves every clip for a seek to t, and returns the promise of the clips
  // that have a `seeked` to wait for, or undefined.
  function seek(t) {
    if (clock.hasRuntime()) { if (drove) release(); return undefined; }
    const exact = !clock.store.playing || clock.quiet();
    let held = null;
    for (const el of list()) {
      if (el.readyState < 1) continue;      // no metadata yet; load() waits for it
      drive(el);
      if (!el.muted) el.muted = true;
      const [to, inside, speed] = at(el, t);
      // Held frame by frame, as a paused clip is, when the clock is paused,
      // outside the window, at the file's end, or where a remap is slower
      // than the browser plays.
      if (exact || !inside || to >= el.duration || speed < LEAST) {
        if (hold(el, to) && exact) (held || (held = [])).push(seeked(el, to >= el.duration));
        continue;
      }
      const rate = Math.min(MOST, speed);
      if (el.playbackRate !== rate) el.playbackRate = rate;
      // How far the clip is from its frame, in composition seconds.
      const off = Math.abs(el.currentTime - to) / rate;
      if (el.paused) {
        if (off > DRIFT) el.currentTime = to;
        el.play().catch(() => {});
      } else if (off > DRIFT && !el.seeking && el.readyState >= 3) el.currentTime = to;
    }
    return held && Promise.all(held);
  }

  // Called with the seek hooks, waited for after the after hooks.
  clock.onMedia(seek);
  // A pause writes `playing` without a seek: every clip is held on the frame
  // of the clock's time.
  clock.store.subscribe('playing', (playing) => {
    if (playing) return;
    if (clock.hasRuntime()) { if (drove) release(); return; }
    for (const el of list()) if (el.readyState > 0) hold(el, at(el, clock.now())[0]);
  });

  // ---- readiness -----------------------------------------------------------------

  // The source a clip loads: its src, else its <source> children's.
  const srcOf = (el) => el.getAttribute('src') || Array.from(el.querySelectorAll('source[src]'), (s) => s.getAttribute('src')).join(' ');

  // KN-138 for a clip that failed, with the clip and its src. The
  // development build adds the cause: from its MediaError, and when the error
  // cannot tell a missing file from a format this browser cannot play, from
  // asking for the file once; the production build, whose message has no
  // cause, does not ask. So the development build's KN-138 settles a fetch
  // later than the production build's, and with two failures on one page
  // ready() can reject with a different first code on each build. Never
  // rejects.
  async function failure(el) {
    const src = srcOf(el);
    const what = 'the footage clip ' + clipName(el);
    if (!src) return fail(CODES.FOOTAGE_FAILED, what, __DEV__ && 'has no src and no <source>, so it has nothing to show');
    let why = '';
    if (__DEV__) {
      const e = el.error;
      const said = e && e.message ? ' (' + e.message + ')' : '';
      why = 'could not be loaded' + said;
      if (e && e.code === 3) why = 'could not be decoded' + said;
      else if (e && e.code === 2) why = 'could not be loaded, a network error' + said;
      // A page opened from a file plays its videos without a fetch, and cannot fetch them.
      else if (self.location.protocol === 'file:') why = 'is missing, or in a format this browser cannot play' + said + FORMATS;
      else {
        let url = null;
        try { url = new URL(el.getAttribute('src') || el.querySelector('source[src]').getAttribute('src'), document.baseURI).href; } catch (_) { /* no URL to ask */ }
        // A blob: or data: URL has no server to ask: the file is in memory.
        if (url && /^blob:/.test(url)) why = 'could not be loaded' + said + ': its blob: URL was revoked, or the file is in a format this browser cannot play' + FORMATS;
        else if (url && /^data:/.test(url)) why = 'is in a format this browser cannot play' + said + FORMATS;
        else if (url) {
          // A request that has no answer in PROBE_MS leaves the sentence
          // above, so a stalled server cannot hold readiness open.
          const stop = new AbortController();
          let timer;
          const res = await Promise.race([
            fetch(url, { mode: 'no-cors', signal: stop.signal }).catch(() => 'unreached'),
            new Promise((r) => { timer = setTimeout(r, PROBE_MS, null); }),
          ]);
          clearTimeout(timer);
          stop.abort();
          if (res === 'unreached') why = 'could not be reached' + said + '; check the address, and that its server is up';
          else if (res) {
            why = res.type === 'opaque' ? 'is missing, or in a format this browser cannot play' + said + FORMATS
              : res.status >= 400 ? 'could not be loaded (HTTP ' + res.status + ')'
                : 'is in a format this browser cannot play' + said + FORMATS;
          }
        }
      }
    }
    return fail(CODES.FOOTAGE_FAILED, what + ' (' + src + ')', __DEV__ && why);
  }

  // A clip's length, when its metadata arrives or changes, moves the clips
  // timed from it.
  function watch(el) {
    if (watched.has(el)) return;
    watched.add(el);
    el.addEventListener('durationchange', timingChanged);
    if (el.readyState > 0) timingChanged();
  }

  // Resolves once the clip has its metadata and first frame; rejects with
  // KN-138. One wait per clip and source while it loads or has loaded; one
  // that failed is tried again by the next load. A seek drops readyState
  // below 2 until it is done, so `seeked` and `canplay` are watched as well
  // as `loadeddata`, which fires once per source.
  function waitFor(el) {
    const key = srcOf(el);
    let w = waits.get(el);
    if (w && w.key === key && !w.failed) return w.promise;
    // One that failed is loaded again from the same source, in case the file
    // has been put there since; the element tries no source again by itself.
    if (w && w.key === key && key) el.load();
    w = { key, promise: null, failed: false };
    w.promise = new Promise((resolve, reject) => {
      let over = false;
      const end = () => {
        if (over) return false;
        over = true;
        for (const e of READY) el.removeEventListener(e, ok);
        el.removeEventListener('error', onError, true);
        return true;
      };
      const ok = () => { if (el.readyState >= 2 && end()) resolve(); };
      const bad = () => { if (end()) { w.failed = true; failure(el).then(reject, reject); } };
      // An error on the element itself, or on its last <source>.
      const onError = (e) => { if (e.target === el || e.target === Array.from(el.querySelectorAll('source')).pop()) bad(); };
      if (!key) { bad(); return; }
      drive(el);
      el.muted = true;
      for (const e of READY) el.addEventListener(e, ok);
      el.addEventListener('error', onError, true);
      // preload="none" never loads on its own, and Kinetic plays the element.
      // Setting preload starts the load at once, with networkState LOADING
      // (measured in Chrome 155: one request; with load() after it, two).
      if (el.preload === 'none') el.preload = 'auto';
      if (el.readyState >= 2) ok();
      // A task on, past the moment a new source sets networkState to
      // NETWORK_NO_SOURCE, an element with no source left to try has failed.
      else setTimeout(() => { if (el.error || el.networkState === 3) bad(); }, 0);
    });
    waits.set(el, w);
    return w.promise;
  }

  // Development: what in a clip's markup Kinetic does not apply, clamps or
  // reads two ways, and a data-start that names no element, once per clip.
  function attrs(el) {
    if (warned.has(el)) return;
    warned.add(el);
    const found = [], fixes = [];
    const driving = DRIVEN.filter((a) => el.hasAttribute(a));
    if (driving.length) {
      found.push(driving.join(', ') + ', which Kinetic does not apply, since it seeks and plays the element itself');
      fixes.push('Remove ' + driving.join(', ') + '; a clip that repeats is one <video> per repeat.');
    }
    if (el.hasAttribute('data-automation')) {
      found.push('data-automation, whose speed ramps Kinetic does not apply, so the clip plays at data-playback-rate');
      fixes.push('Remove data-automation, or write the ramp as data-remap, or cut the clip into one <video> per speed.');
    }
    const remap = remapOf(el);
    if (remap === false) {
      found.push(remapWords(el.getAttribute('data-remap')) + ', so the clip plays at data-playback-rate');
      fixes.push(remapFix());
    } else if (remap && el.hasAttribute('data-playback-rate')) {
      found.push('data-playback-rate with data-remap, whose keys set the speed, so the rate is not applied');
      fixes.push('Remove data-playback-rate.');
    }
    if (remap && clock.hasRuntime()) {
      found.push('data-remap, which the HyperFrames runtime on the page does not apply, so the clip plays at its rate there');
      fixes.push("Remove the runtime's script tag for Kinetic to apply the remap, or cut the clip into one <video> per speed.");
    }
    const muted = el.hasAttribute('muted'), sound = el.getAttribute('data-has-audio') === 'true';
    if (!muted && !sound) {
      found.push('neither muted nor data-has-audio="true", so it plays no sound in Kinetic, and HyperFrames needs one or the other');
      fixes.push('Add muted for the picture alone, or data-has-audio="true" for its sound.');
    } else if (muted && sound) {
      found.push('both muted and data-has-audio="true", which contradict each other; Kinetic plays its sound, as data-has-audio asks');
      fixes.push('Keep muted for the picture alone, or data-has-audio="true" for its sound, not both.');
    }
    const r = num(el, 'data-playback-rate');
    if (r !== null && r !== rateOf(el)) {
      found.push('data-playback-rate="' + el.getAttribute('data-playback-rate') + '", outside 0.1 to 10, so it plays at ' + rateOf(el));
      fixes.push('Give data-playback-rate a value from 0.1 to 10.');
    }
    if (found.length) warn(CODES.FOOTAGE_ATTR, 'the footage clip ' + clipName(el) + ' has ' + found.join('; and '), fixes.join(' '));
    const missing = resolveTiming(el).missing;
    if (missing.length) {
      warn(CODES.BAD_REFERENCE, 'data-start on the footage clip ' + clipName(el) + " names '" + missing[0] + "', which is no element's id or composition id, so the clip starts at 0",
        'Give the referenced clip that id, or write the start in seconds.');
    }
  }

  // Development: a clip whose length comes from its file and whose media
  // start is at or past the file's end lasts no time, once per clip.
  const empty = new WeakSet();
  function emptyWindow(el) {
    if (empty.has(el) || fileLength(el) !== 0 || !resolveTiming(el).file) return;
    empty.add(el);
    const name = num(el, 'data-playback-start') != null && num(el, 'data-playback-start') >= 0 ? 'data-playback-start' : 'data-media-start';
    warn(CODES.FOOTAGE_ATTR, 'the footage clip ' + clipName(el) + ' has ' + name + '="' + el.getAttribute(name) + '", at or past the end of its file (' + el.duration + ' s), and no data-duration or data-end, so it lasts no time and is never shown',
      'Give ' + name + ' a time before the end of the file.');
  }

  // Every footage clip's metadata and first frame, with the runtime absent.
  // Every clip is settled: `onFail` is given each one's KN-138, and the load
  // rejects with the first.
  async function load(onFail) {
    const els = list();
    for (const el of els) watch(el);
    if (__DEV__) for (const el of els) attrs(el);
    if (clock.hasRuntime()) return;
    const bad = (await Promise.allSettled(els.map(waitFor))).filter((r) => r.status === 'rejected').map((r) => r.reason);
    if (__DEV__) for (const el of els) emptyWindow(el);
    if (onFail) bad.forEach(onFail);
    if (bad.length) throw bad[0];
  }

  // Whether the clip's last load failed, so its sound is not asked for.
  const failed = (el) => { const w = waits.get(el); return !!(w && w.failed); };

  return { load, seek, failed };
}
