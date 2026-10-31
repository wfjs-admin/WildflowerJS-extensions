/**
 * animatedImage(src): a GIF, animated WebP or APNG decoded once with
 * WebCodecs' ImageDecoder, each frame kept as an ImageBitmap, and drawn by
 * time, so a seek shows the frame for its time rather than the one the
 * browser's own clock has reached.
 *
 *   const sticker = animatedImage('wave.gif');
 *   scene('sticker', { seek(local) { sticker.draw(this.element.querySelector('canvas'), local); } });
 *
 * animatedImage(src, { scene: this }) in a scene's own methods ties the
 * wait to that scene (below).
 *
 * The handle: duration (seconds) and frames (a count), both 0 until the
 * file is decoded; frameAt(t, { loop }), the index of the frame on screen t
 * seconds in; draw(canvas, t, { loop }), that frame drawn over the whole
 * canvas, cleared first and stretched to its width and height with no
 * transform of the context's (its alpha and composite mode stay the page's).
 * The frames follow the durations in the file, read in whole microseconds,
 * with a frame of 10 ms or less lasting 100 ms, as browsers play one
 * (ImageDecoder reports the file's own number). Before 0 the first frame
 * shows. Past the end it plays as browsers play the file: again and again
 * when the file loops for ever, n + 1 times in all when it repeats n times
 * (ImageDecoder's repetitionCount), then holding its last frame; loop: true
 * wraps for ever and loop: false holds the last frame after one play. The
 * frame for t comes from the durations alone, so a seek shows the same frame
 * however it was reached. Before the file is decoded, frameAt() gives 0 and
 * draw() draws nothing.
 *
 * Every frame is kept as a bitmap for the life of the page, width x height x
 * 4 bytes each: 300 frames at 1920 x 1080 are about 2.5 GB. A decode that
 * fails partway closes the frames it had made.
 *
 * The file is fetched and decoded once per URL: animatedImage() with the
 * same URL again returns the same handle. Readiness, check() and render()
 * wait for every animated image the page asks for: one asked for with
 * animatedImage(src, { scene: this }) while that scene is on the page, and
 * one asked for without a scene for good. scene is the scene's own
 * component, this in its methods; anything else is KN-100. A file that cannot be fetched or
 * decoded is KN-181, printed once on every build as it fails, the page
 * marked failed, and ready(), check() and render() fail with it; the
 * development message gives the cause, with the notes for a page opened
 * from a file and for a file on another origin without CORS headers. Each
 * run of readiness fetches it again, so once the file is there they pass.
 *
 * KN-100 on every build for a bad call, and from animatedImage() in a
 * browser without ImageDecoder (Safari at the time of writing), where a page
 * can show the file in a plain <img>, which plays on the browser's clock.
 */

import { CODES, fail, show, health } from './diagnostics.js';
import { fetchNote } from './audio.js';

const SHORTEST = 10000;    // µs: a frame this short or shorter lasts LONG
const LONG = 100000;       // µs

const what = (x) => (x && x.localName ? 'a <' + x.localName + '>' : show(x));

// The type from the file's first bytes, else the response's.
function typeOf(data, res) {
  const s = String.fromCharCode(...new Uint8Array(data, 0, Math.min(12, data.byteLength)));
  return s.startsWith('GIF8') ? 'image/gif' : s.startsWith('\x89PNG') ? 'image/png'
    : s.startsWith('RIFF') && s.slice(8) === 'WEBP' ? 'image/webp' : (res.headers.get('content-type') || '').split(';')[0].trim();
}

// Every frame of the file as an ImageBitmap, with the end of each in µs.
// Rejects with KN-181, whose where is the file as written.
async function decode(src, url) {
  const failed = (why) => fail(CODES.IMAGE_FAILED, 'the animated image ' + src, __DEV__ && why);
  let res, data;
  try {
    res = await fetch(url);
    data = res.ok && await res.arrayBuffer();
  } catch (e) {
    throw failed(__DEV__ && ('could not be fetched (' + (e && e.message || e) + ')' + fetchNote(url)));
  }
  if (!res.ok) throw failed(__DEV__ && 'could not be loaded (HTTP ' + res.status + ')');
  const type = typeOf(data, res);
  const bitmaps = [], ends = [];
  let dec = null;
  try {
    dec = new self.ImageDecoder({ data, type });
    await dec.tracks.ready;
    await dec.completed;
    const track = dec.tracks.selectedTrack, n = track.frameCount;
    let end = 0;
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      const d = image.duration;
      try { bitmaps.push(await createImageBitmap(image)); } finally { image.close(); }
      end += d > SHORTEST ? d : LONG;
      ends.push(end);
    }
    if (!n) throw new Error('no frames');
    // The times it plays: once and then repetitionCount more (Infinity for ever).
    return { bitmaps, ends, plays: track.repetitionCount + 1 };
  } catch (e) {
    for (const b of bitmaps) b.close();
    throw failed(__DEV__ && ('could not be decoded as ' + (type || 'an image') + ' (' + (e && e.message || e) + '); animatedImage() reads GIF, WebP and PNG files'));
  } finally {
    if (dec) dec.close();
  }
}

export function createImages(scenes) {
  const cache = new Map();   // URL -> { handle, job: its decode, failed, go(), by }
  // Who asked for an image: the scenes given with it, or the page (by null)
  // when it was asked for without one, for good.
  const own = (c, el) => { if (!el) c.by = null; else if (c.by) c.by.add(el); };

  function animatedImage(src, opts) {
    if (typeof src !== 'string' || !src) throw fail(CODES.BAD_CALL, 'animatedImage(src)', __DEV__ && 'src is the URL of a GIF, animated WebP or APNG file, not ' + show(src));
    if (opts !== undefined && (!opts || typeof opts !== 'object')) throw fail(CODES.BAD_CALL, 'animatedImage(src, options)', __DEV__ && 'options is { scene }, not ' + show(opts));
    for (const k in opts) if (k !== 'scene') throw fail(CODES.BAD_CALL, 'animatedImage(src, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the one option is scene");
    const el = scenes.sceneOf(opts && opts.scene, 'animatedImage(src, ');
    if (typeof self.ImageDecoder !== 'function') {
      throw fail(CODES.BAD_CALL, 'animatedImage(src): ImageDecoder', __DEV__ && "this browser has no ImageDecoder (WebCodecs), which animatedImage() decodes the file with; use Chrome or Edge, or show the file in a plain <img>, which plays on the browser's own clock");
    }
    let url = src;
    try { url = new URL(src, document.baseURI).href; } catch (_) { /* fetched as written, which fails as KN-181 */ }
    const known = cache.get(url);
    if (known) { own(known, el); return known.handle; }
    let bitmaps = [], ends = [], plays = Infinity;

    // The frame on screen t seconds in. `pre` starts the call for KN-100,
    // 'frameAt(' or 'draw(canvas, '. Without loop, it plays as many times as
    // the file says, then holds its last frame.
    function index(t, opts, pre) {
      if (typeof t !== 'number' || !Number.isFinite(t)) throw fail(CODES.BAD_CALL, pre + 't)', __DEV__ && 't is a number of seconds, not ' + show(t));
      if (opts !== undefined && (!opts || typeof opts !== 'object')) throw fail(CODES.BAD_CALL, pre + 't, options)', __DEV__ && 'options is { loop }, not ' + show(opts));
      for (const k in opts) if (k !== 'loop') throw fail(CODES.BAD_CALL, pre + 't, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the one option is loop");
      const loop = opts && opts.loop;
      if (loop !== undefined && typeof loop !== 'boolean') throw fail(CODES.BAD_CALL, pre + 't, { loop })', __DEV__ && 'loop is true (wrap at the end for ever) or false (hold the last frame), or left out to play as the file says, not ' + show(loop));
      const n = ends.length, total = ends[n - 1];
      let x = Math.round(t * 1e6);
      if (!n || x <= 0) return 0;
      if (x >= total) {
        if (x >= total * (loop === undefined ? plays : loop ? Infinity : 1)) return n - 1;
        x %= total;
      }
      let lo = 0, hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ends[mid] > x) hi = mid; else lo = mid + 1;
      }
      return lo;
    }

    const handle = {
      duration: 0,
      frames: 0,
      frameAt: (t, opts) => index(t, opts, 'frameAt('),
      draw(canvas, t, opts) {
        if (!canvas || canvas.localName !== 'canvas') throw fail(CODES.BAD_CALL, 'draw(canvas)', __DEV__ && 'canvas is a <canvas> element, not ' + what(canvas));
        const i = index(t, opts, 'draw(canvas, ');
        const ctx = canvas.getContext('2d');
        if (!ctx) throw fail(CODES.BAD_CALL, 'draw(canvas): 2D', __DEV__ && 'the canvas already has a WebGL or bitmap context, and draw() needs a 2D one; give the image a canvas of its own');
        if (!bitmaps.length) return;
        // Over the whole canvas whatever its transform; its alpha and
        // composite mode are the page's to set.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmaps[i], 0, 0, canvas.width, canvas.height);
        ctx.restore();
      },
    };
    // The fetch and decode, again at the next load when it failed. A failure
    // is printed as it comes (readiness's report()).
    const c = { handle, failed: false, by: new Set() };
    c.go = () => {
      c.failed = false;
      c.job = decode(src, url).then((r) => {
        bitmaps = r.bitmaps;
        ends = r.ends;
        plays = r.plays;
        handle.frames = ends.length;
        handle.duration = ends[ends.length - 1] / 1e6;
      });
      c.job.catch((e) => { c.failed = true; health.report(e); });
      return c.job;
    };
    own(c, el);
    c.go();
    cache.set(url, c);
    return handle;
  }

  return {
    animatedImage,
    // At readiness, check() and render(): every animated image the page
    // still asks for decoded, one that failed fetched again. One asked for
    // only by scenes that have left the page is passed over.
    load: () => Promise.all(Array.from(cache.values(), (c) => (c.by && !Array.from(c.by).some((el) => el.isConnected) ? null
      : c.failed ? c.go() : c.job))),
  };
}
