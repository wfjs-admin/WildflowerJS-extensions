/**
 * render(): an MP4 from the page, with no renderer installed. Every frame
 * is a seek, settled the way a render's is (the runtime's player and its
 * barrier when one is on the page, else the clock's), drawn into a canvas,
 * encoded with WebCodecs and written into an MP4 by mp4.js.
 *
 *   const { blob } = await wildflower.kinetic.render({ codec: 'avc1.640028' });
 *
 * The frame source:
 *   - a canvas (the composition root is one, or `source` is one): captured
 *     as it is, in any Chrome;
 *   - the composition root as DOM: drawn with drawElementImage, which Chrome
 *     has only with HTML-in-Canvas enabled and which only
 *     draws an element inside the canvas's own subtree, so the root is
 *     wrapped in a <canvas layoutsubtree content="drawable"> for the render
 *     and unwrapped after (the opt-in under both its names: Chrome renamed
 *     layoutsubtree to content="drawable" in 155 or 156), and the root
 *     itself is marked `drawable` for the render, which Chrome 157 requires
 *     of an element it draws.
 *     Components and the runtime's timing survive the move. A stage
 *     fitted to the window (fit.js) has its scale moved onto the canvas for
 *     the render, so the root draws at the composition's own size while the
 *     canvas shows at the fitted one. A transform the page gave the root
 *     (transform, translate, rotate, scale) places the stage on that page and
 *     is no part of the frame: the canvas takes it for the render, so the
 *     page looks the same, and the root draws without it.
 *
 * Before the page is touched, render() runs readiness (readiness.js), as
 * check() does, and rejects with its failure: an input or a query in any
 * scene on the page, a footage clip's metadata and first frame (KN-138), an
 * audio clip's decode (KN-135, with audio: false too), a map, a Lottie
 * animation or an animated image; and with a failure reported during a
 * frame's seek, such as a scene a section mounts partway whose input fails,
 * after which its finally puts the page back. Each frame's seek holds the capture until
 * every footage clip has seeked to its frame. The page is in video mode for
 * the frames (lesson.js), so the steps' scripts write their paths; after the
 * seek back the learner's values come back, and interactive mode with them.
 *
 * The shutter: render({ shutter }), or config({ shutter }) by default, seeks
 * each frame `samples` times, at t + (k / samples) * (angle / 360) / fps,
 * forward from the frame's own time and short of the next, so a cut on a
 * frame stays a cut. Each sample is settled and drawn as a frame is, read
 * from a 2D canvas (the render's own, or for a canvas source one of the
 * source's size) and summed per channel in integers, each colour weighted
 * by its alpha, so the average is the same on every run and a transparent
 * pixel averages as the black the file shows; the average is written back,
 * opaque, before the frame is made.
 * The clock store's `shutter` holds the angle while it runs, which smear()
 * reads to give one copy, and each seek carries the frame's own time, so
 * `frame` and `clipFrame` give the frame's number through all its samples.
 *
 * The finish: render({ finish }), or config({ finish }) by default, draws
 * each frame, after the shutter's average, through the finishing pass
 * (finish.js: grain, a vignette, bloom, chromatic aberration, a grade, a
 * soften, dust) into the pass's own canvas, and the frame is made from
 * that. The pass is deterministic by the frame's number.
 * With the HyperFrames runtime on the page there is no shutter: its player
 * rounds each seek down to one of its own frames, so render() seeks once a
 * frame, and development builds warn once per page (KN-205).
 *
 * The runtime's frames: its player puts every seek on a grid of 1 / fps,
 * with fps read as it starts (clock.js gives it the root's data-fps when
 * Kinetic loads first). Each frame's seek has to land on the frame's own
 * time; one that lands elsewhere (a grid that misses this fps, or a `from`
 * off the grid) would repeat or skip frames, so render() throws KN-206 and
 * its finally puts the page and the clock back. The pinned player lands
 * i / fps exactly at 23.976, 25, 29.97, 30 and 60 fps.
 *
 * The sound: when the composition has an audio clip (audio.js) and `audio`
 * is not false, the clips decoded at readiness are mixed, the codec is
 * chosen before the page is touched (soundtrack.js: AAC-LC, else Opus with
 * KN-202 in development), and after the frames the mix over the render's
 * range is encoded and written as the file's second track.
 *
 * Errors, thrown on every build: KN-200 (no WebCodecs: an insecure context,
 * or a browser without it), KN-201 (a DOM source without drawElementImage,
 * with the flag named in development), KN-100 for bad options, a range past
 * the composition's duration, a render while one runs or an audio
 * codec the browser cannot encode, KN-203 for an audio encoder delay that
 * cannot be measured (soundtrack.js), KN-204 for media from another origin
 * in a DOM source that would be drawn black, KN-206 for a frame's seek that the
 * runtime's player put off the frame's time, KN-207 for a video encoder
 * that reports an error or stalls, or output mp4.js cannot write.
 *
 * Transparency: render({ alpha: true }), or config({ alpha: true }) by
 * default (the preview bar's Render follows it), makes a QuickTime file of
 * PNG frames with their alpha (mp4.js, createMov()), the form video editors
 * import with transparency, since WebCodecs encodes no alpha. Each frame is
 * taken as a PNG with canvas.toBlob(), a few at a time, and kept as a Blob,
 * so the frames stay out of the script's memory; the file is a Blob of
 * them, and before it is offered a byte of each frame and of the file's
 * start, middle and end is read back, since a Chrome just started can hand
 * back a large Blob it cannot read (KN-207). For the render's duration the
 * drawn element's background is cleared (data-kinetic-clear, through a
 * sheet of Kinetic's own, so its style is never written) and <html> carries
 * data-kinetic-alpha for a page's CSS to answer; both go again after, on a
 * failure too. The finish is off and there is no sound; no video encoder is
 * used, so codec and bitrate do not apply. The shutter weights each
 * sample's color by its alpha and sums the alphas too, so a blurred edge
 * comes out as straight color with its coverage as alpha. render.still(t)
 * follows config({ alpha }) as a render would.
 *
 * render({ signal }) takes an AbortSignal, as fetch() does. One already
 * aborted rejects at once with its reason; one aborted during the render
 * stops it at the next frame, sample, encoder wait or sound segment (a wait
 * on readiness or the sound's set-up ends at once), closes the encoders,
 * puts the page, the clock, the fps, the shutter and the live finish back
 * as after a render, and rejects with `signal.reason` (an AbortError
 * DOMException unless abort() was given another). Anything else is KN-100.
 *
 * The encoder: `codec`, `bitrate` (16 Mbps unless set), `audioCodec` and
 * `audioBitrate` passed, else the ones config({ encode }) set, so a piece
 * carries its own and the preview bar's Render button uses them.
 *
 * A `width` and `height` passed scale a DOM source's box to that size, as
 * the encoder scales a canvas source's frames. A clock that was playing
 * plays on from its time once the render is done, as after check().
 */

import { CODES, fail, warn, show, liveContexts } from './diagnostics.js';
import { compositionRoot } from './timing.js';
import { clipName, adopter } from './clips.js';
import { createMp4, createMov } from './mp4.js';
import { RATE } from './mix.js';
import { soundConfig, encodeSound } from './soundtrack.js';
import { readShutter, checkEncoding, checkAlpha } from './clock.js';
import { readFinish, createFinish } from './finish.js';

const DEFAULT_CODEC = 'avc1.640028';   // H.264 High 4.0: 1080p30 and below
const DEFAULT_BITRATE = 16e6;          // grain, glows and soft gradients keep their detail
const DEFAULT_AUDIO_BITRATE = 192000;
const KEYFRAME_EVERY = 2;              // seconds

// Resolves after the browser has painted once: an animation frame callback
// runs before its frame's paint, so one more is needed for the paint that
// drawElementImage reads to be the one after the seek.
const painted = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

// Canvases inside a DOM source are drawn through 2D copies while it renders.
// drawElementImage draws a canvas that was already on screen when the root
// moved into the render's canvas from its last composited image, so a WebGL
// view redrawn on every seek came out frozen at the frame the render began
// on (seen in Chrome 154; a canvas first shown inside the
// render's canvas was drawn fresh). A copy made inside it is drawn fresh, so
// each canvas is hidden and a copy laid over its box, and after every seek
// the copy takes the canvas's own style and current pixels. A WebGL canvas
// needs preserveDrawingBuffer for its pixels to be read (KN-190 warns).
//
// Chrome also clips a canvas inside the render's canvas to a rectangle of
// its drawing size, in CSS px, at the place its layout offsets (each box's
// left, top and border on the way down from the render's canvas) would put
// the render's top left, while its transforms move it whole (seen
// in Chrome 155): a canvas laid out anywhere else came out cut
// off or missing, and one drawn smaller than its box cut to that size. So
// each copy is laid out at that place, its left and top undoing the offsets
// of the box it is positioned in, moved to the canvas's own place with
// `translate` (on top of the canvas's own). And a canvas inside the render's
// canvas is painted at its drawing's own size, one drawing px to the CSS px,
// from its border box's corner and clipped to its content box, whatever its
// CSS size, border, padding and object-fit (measured: a 10 x 10
// drawing in a 100 x 100 box showed 10 x 10, and a bordered canvas's
// drawing sat a border's width up and left). So the copy's drawing is its
// border box, with the canvas drawn into it where the content box and
// object-fit and object-position put it, scaled as the canvas's
// image-rendering says (high quality when smoothed).
//
// The copy shows what the canvas shows at the seek and nothing of its own:
// it takes the canvas's class and inline style, with no transition and no
// animation, and the canvas's computed values for MIRRORED and for every
// property one of its animations moves (getAnimations(), getKeyframes(): a
// keyframed background-color or box-shadow too) are written on it with
// !important, so a CSS animation the guard seeked moves the copy with the
// canvas, and a transition never slides it in from where it was. Each frame
// reads every canvas before it writes any copy, so the page is laid out once
// a frame. A canvas that appears during the render (a scene mounted, a
// display: none lifted) gets its copy at the next frame, a canvas taken off
// the page loses its copy, a copy page code takes off the page is put back,
// and a drawing of 0 x 0 shows the box's background alone. A visibility
// the canvas's own animations move is not copied: the copy takes the
// canvas's inline visibility only.
//
// The copy is positioned in the canvas's offset parent, which in Chrome is
// the copy's containing block too: an ancestor that is positioned, or that
// has a transform, translate, rotate, scale, filter, perspective, contain
// or will-change (as a clip during a zoom, flip or blur transition does),
// past a table or cell that is not positioned.
//
// The page's own style is never written: the canvas is hidden by an
// attribute, data-kinetic-copied, and one adopted style sheet that hides it
// with its transitions off, as clips.js hides with data-kinetic-hidden, so
// its inline style, longhands and priorities included, is as it was after
// the render, and the copy takes the canvas's inline visibility (clips.js
// writes it on a canvas that is a clip) as it stands each frame. The sheet
// is adopted again at the next frame when page code replaces
// document.adoptedStyleSheets. At the end the canvas keeps its transitions
// off (data-kinetic-still) while it shows again, so nothing fades back in.
const COPIED = 'data-kinetic-copied', STILL = 'data-kinetic-still', COPY = 'data-kinetic-copy';
const MIRRORED = ['transform', 'rotate', 'scale', 'transform-origin', 'opacity', 'filter', 'clip-path', 'border-radius'];
// Keyframe keys that are no property, or that the copy works out itself.
const NOT_MIRRORED = ['offset', 'easing', 'composite', 'computedOffset', 'translate', 'visibility'];
// Adopted at every frame, so page code that replaced the list gets it back.
// The last rule: the root in the render's canvas draws without a transform of its own, whatever rule gave it one.
const PLACED = ['transform', 'translate', 'rotate', 'scale'];
const adopt = adopter('[' + COPIED + ']{visibility:hidden!important}[' + COPIED + '],[' + STILL + ']{transition:none!important}'
  + '[data-kinetic-render]>:not(#kinetic-clear#kinetic-clear){' + PLACED.map((p) => p + ':none!important').join(';') + '}');
// The box a copy, absolutely positioned beside its canvas, is positioned in:
// the canvas's offset parent, past a table or cell that is not positioned.
function boxOf(canvas) {
  let b = canvas.offsetParent;
  while (b && /^(TD|TH|TABLE)$/.test(b.tagName) && getComputedStyle(b).position === 'static') b = b.offsetParent;
  return b;
}
// A computed value's parts, split at the spaces outside parentheses.
function parts(v) {
  const out = [];
  let depth = 0, cur = '';
  for (const c of v === 'none' ? '' : v) {
    if (c === ' ' && !depth) { if (cur) out.push(cur); cur = ''; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
// A computed object-position part in px: its px and its % of `free`, as in
// calc(100% - 10px).
function place(v, free) {
  let x = 0;
  for (const m of v.matchAll(/([+-]?)\s*([\d.]+)(%|px)/g)) x += (m[1] === '-' ? -1 : 1) * m[2] * (m[3] === '%' ? free / 100 : 1);
  return x;
}
// An element's border box from the top of its chain of offset parents, in
// layout px.
function offsetOf(el) {
  let x = 0, y = 0;
  for (let e = el; e; e = e.offsetParent) {
    x += e.offsetLeft + (e.offsetParent ? e.offsetParent.clientLeft : 0);
    y += e.offsetTop + (e.offsetParent ? e.offsetParent.clientTop : 0);
  }
  return [x, y];
}
// How Chrome paints a canvas's bitmap inside the render's canvas. Until 156
// (seen in 154 and 156): at one drawing px to the CSS px from its border
// box's corner, clipped to its content box, whatever its border, padding and
// object-fit, so a copy's bitmap is the border box with the drawing placed
// inside it. From 158 (seen in 158.0.8127.18): as CSS paints any canvas,
// into its content box, so the bitmap is the content box. Another browser
// cannot render the DOM at all.
//
// Chrome 157, the version that turned HTML-in-Canvas on, does neither
// (seen in 157.0.8103.78): it stretches the bitmap to the
// content box's size but places it at the border box's corner, clipped to
// the content box, and object-fit and object-position on the copy change
// nothing. So in 157 a canvas with a border or padding is drawn that much up
// and left and loses the strip at its right and bottom, whatever bitmap the
// copy supplies; a canvas with neither is right. 157 takes the content-box
// branch (its scale is right, its corner is not). A copy with no border or
// padding of its own, beside one that carries them, would be right in all
// three; that is not built.
const CONTENT_BOX_PAINT = (() => {
  const m = typeof navigator !== 'undefined' && /Chrome\/(\d+)/.exec(navigator.userAgent);
  return !m || Number(m[1]) >= 157;
})();

// One frame of the copies: `pairs` maps each canvas to its copy, kept from
// frame to frame.
function updateCopies(pairs, source, wrap) {
  adopt();
  // New canvases get a copy, and a canvas off the page loses its own.
  for (const canvas of source.querySelectorAll('canvas:not([' + COPY + '])')) {
    if (pairs.has(canvas) || canvas.closest('template')) continue;
    const copy = document.createElement('canvas');
    copy.setAttribute(COPY, '');
    copy.style.cssText = 'position:absolute!important;transition:none!important;animation:none!important;display:none';
    canvas.after(copy);
    canvas.setAttribute(COPIED, '');
    pairs.set(canvas, { copy, ctx: copy.getContext('2d') });
  }
  // A copy page code took off the page goes back beside its canvas.
  for (const [canvas, p] of pairs) {
    if (!source.contains(canvas)) { p.copy.remove(); canvas.removeAttribute(COPIED); pairs.delete(canvas); }
    else if (!p.copy.isConnected) canvas.after(p.copy);
  }
  // Read every canvas.
  const [wx, wy] = offsetOf(wrap);
  for (const [canvas, p] of pairs) {
    const s = getComputedStyle(canvas), box = boxOf(canvas);
    const names = new Set(MIRRORED);
    for (const a of canvas.getAnimations()) {
      if (a.effect && a.effect.getKeyframes) for (const k of a.effect.getKeyframes()) for (const n in k) if (!NOT_MIRRORED.includes(n)) names.add(n.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()));
    }
    const px = (k) => parseFloat(s.getPropertyValue(k)) || 0;
    p.r = {
      w: canvas.offsetWidth, h: canvas.offsetHeight, cw: canvas.width, ch: canvas.height, box,
      at: offsetOf(canvas), from: box ? offsetOf(box) : [wx, wy], bl: box ? box.clientLeft : 0, bt: box ? box.clientTop : 0,
      values: Array.from(names, (k) => [k, s.getPropertyValue(k)]),
      t: parts(s.translate), fit: s.objectFit, pos: parts(s.objectPosition),
      smooth: !/pixelated|crisp/.test(s.imageRendering), cls: canvas.className, css: canvas.getAttribute('style') || '', bg: s.backgroundColor,
      // The content box, which object-fit fills: inside the border and padding.
      il: px('border-left-width') + px('padding-left'), it: px('border-top-width') + px('padding-top'),
      ih: px('border-left-width') + px('padding-left') + px('border-right-width') + px('padding-right'),
      iv: px('border-top-width') + px('padding-top') + px('border-bottom-width') + px('padding-bottom'),
    };
  }
  // Then write every copy.
  for (const [canvas, p] of pairs) {
    const { copy, ctx, r } = p;
    copy.className = r.cls;
    copy.setAttribute('style', r.css);
    const set = (k, v) => copy.style.setProperty(k, v, 'important');
    set('transition', 'none');
    set('animation', 'none');
    for (const [k, v] of r.values) if (v) set(k, v);
    // Chrome paints no background for a canvas inside the render's canvas;
    // the copy draws the background colour into its bitmap instead.
    set('background', 'none');
    set('position', 'absolute');
    set('margin', '0');
    set('box-sizing', 'border-box');
    set('width', r.w + 'px');
    set('height', r.h + 'px');
    set('left', (r.box ? wx - r.from[0] - r.bl : 0) + 'px');
    set('top', (r.box ? wy - r.from[1] - r.bt : 0) + 'px');
    set('right', 'auto');
    set('bottom', 'auto');
    set('translate', 'calc(' + (r.at[0] - wx) + 'px + ' + (r.t[0] || '0px') + ') calc(' + (r.at[1] - wy) + 'px + ' + (r.t[1] || '0px') + ')' + (r.t[2] ? ' ' + r.t[2] : ''));
    set('object-fit', 'fill');
    // The background, then the drawing where object-fit and object-position
    // put it in the content box, in a bitmap the size of the content box
    // (Chrome 157 on) or of the border box with the drawing inset by the
    // border and padding (before 157): see CONTENT_BOX_PAINT. A drawing of
    // 0 x 0, or a box with no content area, leaves the background alone, as
    // the page shows it.
    const bw = CONTENT_BOX_PAINT ? Math.max(1, Math.ceil(r.w - r.ih)) : Math.ceil(r.w), bh = CONTENT_BOX_PAINT ? Math.max(1, Math.ceil(r.h - r.iv)) : Math.ceil(r.h);
    if (copy.width !== bw) copy.width = bw;
    if (copy.height !== bh) copy.height = bh;
    ctx.clearRect(0, 0, bw, bh);
    ctx.fillStyle = r.bg;
    ctx.fillRect(0, 0, bw, bh);
    const { cw, ch, fit } = r, w = r.w - r.ih, h = r.h - r.iv;
    if (!cw || !ch || !(w > 0) || !(h > 0)) continue;
    const f = fit === 'contain' ? Math.min(w / cw, h / ch) : fit === 'cover' ? Math.max(w / cw, h / ch)
      : fit === 'none' ? 1 : fit === 'scale-down' ? Math.min(1, w / cw, h / ch) : 0;
    const dw = f ? cw * f : w, dh = f ? ch * f : h;
    const dx = place(r.pos[0] || '50%', w - dw), dy = place(r.pos[1] || '50%', h - dh);
    ctx.imageSmoothingEnabled = r.smooth;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, (CONTENT_BOX_PAINT ? 0 : r.il) + dx, (CONTENT_BOX_PAINT ? 0 : r.it) + dy, dw, dh);
  }
}
function removeCopies(pairs) {
  for (const [canvas, p] of pairs) {
    p.copy.remove();
    canvas.setAttribute(STILL, '');
    canvas.removeAttribute(COPIED);
  }
  // Shown again with its transitions still off, so it is not faded back in.
  if (pairs.size) pairs.flushed = getComputedStyle(pairs.keys().next().value).visibility;
  for (const canvas of pairs.keys()) canvas.removeAttribute(STILL);
  pairs.clear();
}

// An alpha render's stage: the drawn element's background cleared by an
// attribute and a sheet of Kinetic's own (the two ids that cannot both
// match lift the rule over a page's own rule by id), and <html> marked for
// the page's CSS. Returns what puts both back; a mark the page set itself
// stays.
const CLEAR = 'data-kinetic-clear', MARK = 'data-kinetic-alpha';
const adoptClear = adopter('[' + CLEAR + ']:not(#kinetic-clear#kinetic-clear){background:none!important}');
function clearStage(el) {
  const html = document.documentElement, marked = html.hasAttribute(MARK), own = el.hasAttribute(CLEAR);
  if (!marked) html.setAttribute(MARK, '');
  el.setAttribute(CLEAR, '');
  adoptClear();
  return () => {
    if (!marked) html.removeAttribute(MARK);
    if (!own) el.removeAttribute(CLEAR);
  };
}

// A frame as a PNG Blob. The canvas's pixels are copied as toBlob() is
// called, so the next frame can be drawn while this one encodes. A canvas
// source, or a canvas of another size, is drawn into one of the render's
// size first.
function png(shown, source, width, height, i) {
  let c = shown;
  if (c === source || c.width !== width || c.height !== height) {
    c = document.createElement('canvas');
    c.width = width; c.height = height;
    c.getContext('2d').drawImage(shown, 0, 0, width, height);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(fail(CODES.ENCODER_FAILED, 'render(): frame ' + i, __DEV__ && 'the browser could not make the frame a PNG; a smaller size may'))), 'image/png'));
}

// A byte from the end of each frame, a few at a time, then from the start,
// middle and end of the file: a Blob Chrome cannot read fails here.
async function readBack(blob, parts) {
  for (let i = 0; i < parts.length; i += 32) await Promise.all(parts.slice(i, i + 32).map((b) => b.slice(b.size - 1).arrayBuffer()));
  for (const at of [0, Math.floor(blob.size / 2), Math.max(0, blob.size - 16)]) await blob.slice(at, at + 16).arrayBuffer();
}

// Media from another origin. drawElementImage draws an <img>, <video> or
// SVG <image> from another origin black unless it was fetched with CORS
// (a crossorigin attribute, and Access-Control-Allow-Origin from its
// server), and a CSS image from another origin black even then, with no
// error (seen in Chrome 154): a video's poster and an
// <input type=image> too, a ::before or ::after image and content: url(),
// and media in an open shadow root. A frame or an <object> from another
// origin is drawn empty. Each such element in a DOM
// source, with its URL, found before the page is touched (KN-204).
const CSS_IMAGES = ['background-image', 'mask-image', 'border-image-source', 'list-style-image', 'content'];
// The page's origin is self.origin, which a srcdoc frame shares with its
// parent while its location.origin reads "null".
function foreignMedia(source) {
  const foreign = (url) => {
    try {
      const u = new URL(url, document.baseURI);
      return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== self.origin;
    } catch (_) { return false; }
  };
  const found = [];
  const visit = (el) => {
    const tag = el.localName, name = clipName(el), cors = el.hasAttribute('crossorigin');
    const add = (url, what) => { if (url && foreign(url)) found.push(name + what + ' (' + url + ')'); };
    if (!cors && (tag === 'img' || tag === 'video' || tag === 'image')) {
      const first = tag === 'video' && el.querySelector('source');
      add(tag === 'image' ? el.getAttribute('href') || el.getAttribute('xlink:href')
        : el.currentSrc || el.getAttribute('src') || (first && first.getAttribute('src')), '');
    }
    if (!cors && tag === 'video') add(el.getAttribute('poster'), "'s poster");
    // These have no crossorigin that would let them draw.
    if (tag === 'input' && el.type === 'image') add(el.getAttribute('src'), '');
    if (tag === 'iframe') add(el.getAttribute('src'), '');
    if (tag === 'object') add(el.getAttribute('data'), '');
    for (const pseudo of [null, '::before', '::after']) {
      const style = getComputedStyle(el, pseudo);
      // A pseudo-element with no content is not drawn.
      if (pseudo && /^(none|normal)$/.test(style.content)) continue;
      for (const p of CSS_IMAGES) {
        const v = style.getPropertyValue(p);
        if (v.indexOf('url(') < 0) continue;
        for (const m of v.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/g)) add(m[2], "'s " + (pseudo ? pseudo + ' ' : '') + p);
      }
    }
  };
  const walk = (scope) => {
    for (const el of scope.querySelectorAll('*')) { visit(el); if (el.shadowRoot) walk(el.shadowRoot); }
  };
  visit(source);
  if (source.shadowRoot) walk(source.shadowRoot);
  walk(source);
  return found;
}

export function createRender(clock, fit, audio, readiness, lesson, finishLive) {
  let warned = false;   // KN-205 prints once per page
  // One render at a time: a second would wrap the root inside the first's
  // canvas, and their unwraps would leave it out of the document.
  let running = false;
  async function render(opts) {
    if (running) throw fail(CODES.BAD_CALL, 'render()', __DEV__ && 'a render is running; await the one before starting the next');
    running = true;
    try { return await once(opts); } finally { running = false; }
  }
  // The preview bar's As Rendered: the frame at t as the file would have it,
  // through the same seeks, shutter and finish, with no encoder and no
  // sound, as a 2D canvas of the composition's size. Not public.
  render.still = async function still(t) {
    if (running) throw fail(CODES.BAD_CALL, 'render()', __DEV__ && 'a render is running; await the one before starting the next');
    running = true;
    try { return await run({ audio: false }, self, () => {}, (p) => p, t); } finally { running = false; }
  };
  return render;
  async function once(opts) {
    const o = opts || {};
    const G = self;
    // signal, an AbortSignal as fetch() takes: an aborted one rejects at
    // once with its reason; one aborted later stops the render at the next
    // check, and the finally below puts the page back as after a render.
    const signal = o.signal;
    if (signal !== undefined && !(typeof G.AbortSignal === 'function' && signal instanceof G.AbortSignal)) throw fail(CODES.BAD_CALL, 'render({ signal })', __DEV__ && 'signal is an AbortSignal, such as an AbortController\'s signal, not ' + show(signal));
    const stop = () => { if (signal && signal.aborted) throw signal.reason; };
    stop();
    // A wait that ends when the signal aborts, so a render waiting on
    // readiness or the sound rejects without waiting for them.
    let unhook = null;
    const halted = signal ? new Promise((_, reject) => {
      const on = () => reject(signal.reason);
      signal.addEventListener('abort', on);
      unhook = () => signal.removeEventListener('abort', on);
    }) : null;
    if (halted) halted.catch(() => {});
    const until = (p) => (halted ? Promise.race([p, halted]) : p);
    try { return await run(o, G, stop, until); } finally { if (unhook) unhook(); }
  }
  // `still`, a time, makes the one frame render.still() returns.
  async function run(o, G, stop, until, still) {
    const one = still !== undefined;
    // A MOV of PNG frames, with no video encoder: config({ alpha }) when the
    // call gives none.
    const alpha = o.alpha === undefined ? clock.alpha() : checkAlpha(o.alpha, 'render');
    if (!one && !alpha && typeof G.VideoEncoder !== 'function') {
      throw fail(CODES.NO_WEBCODECS, 'render()', __DEV__ && 'this page has no VideoEncoder; WebCodecs needs a secure context (https or localhost) and a browser that has it (Chrome 94 and later)');
    }
    clock.resolveComposition();
    const root = compositionRoot(document);
    const source = o.source === undefined ? root : o.source;
    if (!(source instanceof Element)) throw fail(CODES.BAD_CALL, 'render({ source })', __DEV__ && 'source is an element (the composition root when omitted); no composition root was found');
    const fps = o.fps === undefined ? clock.store.fps : o.fps;
    if (!(typeof fps === 'number' && Number.isFinite(fps) && fps > 0)) throw fail(CODES.BAD_CALL, 'render({ fps })', __DEV__ && 'fps is a finite number above 0');
    const duration = clock.store.duration;
    // A still from the last frame's start to the end, where playback stops
    // and the bar's step lands, is the last frame, as a render has it.
    if (one && !(typeof still === 'number' && Number.isFinite(still) && still >= 0)) throw fail(CODES.BAD_CALL, 'render.still(t)', __DEV__ && 't is seconds, 0 or more, not ' + show(still));
    const at = one && duration > 0 ? Math.min(still, (Math.max(1, Math.round(duration * fps)) - 1) / fps) : still;
    const from = one ? at : o.from === undefined ? 0 : o.from;
    const to = one ? at + 1 / fps : o.to === undefined ? duration : o.to;
    // Within the composition: past its end there is nothing to draw.
    if (!one && (!(typeof from === 'number' && from >= 0) || !(typeof to === 'number' && Number.isFinite(to) && to > from) || to > duration + 1e-9)) throw fail(CODES.BAD_CALL, 'render({ from, to })', __DEV__ && 'seconds within the composition, with to after from and no later than its duration, ' + show(duration) + ' s (the composition needs data-duration when to is omitted)');
    // The encoder's settings: each from the call, else config({ encode }),
    // else the default (config's were checked when it was set).
    checkEncoding(o, (k) => 'render({ ' + k + ' })');
    const set = clock.encode() || {};
    const pick = (k, d) => (o[k] !== undefined ? o[k] : set[k] !== undefined ? set[k] : d);
    const codec = pick('codec', DEFAULT_CODEC);
    const bitrate = pick('bitrate', DEFAULT_BITRATE);
    const audioCodec = pick('audioCodec', undefined);
    const audioBitrate = pick('audioBitrate', DEFAULT_AUDIO_BITRATE);
    const withAudio = o.audio === undefined ? true : o.audio;
    if (typeof withAudio !== 'boolean') throw fail(CODES.BAD_CALL, 'render({ audio })', __DEV__ && 'audio is true (the default: the sound, when the composition has an audio clip) or false, not ' + show(o.audio));
    const wanted = o.shutter === undefined ? clock.shutter() : readShutter(o.shutter, 'render');
    // The HyperFrames runtime's player rounds each seek down to one of its
    // own frames, which puts every sample on the frame's own time, so with
    // the runtime on the page the shutter is not applied: one seek a frame,
    // and the store's shutter stays 0, so smear() keeps its copies.
    const runtime = clock.hasRuntime();
    const shutter = wanted && !runtime ? wanted : null;
    if (__DEV__ && wanted && !shutter && !warned) {
      warned = true;
      warn(CODES.RUNTIME_SHUTTER, 'render(): the shutter needs Kinetic\'s own clock; with the HyperFrames runtime on the page the player rounds each seek down to one of its frames, so the shutter is not applied',
        'Remove the runtime\'s script tag for an in-browser render with motion blur, or render without the shutter.');
    }
    const isCanvas = source instanceof HTMLCanvasElement;
    // The finishing pass (finish.js), on each frame after the shutter's
    // average and before it is encoded; config({ finish }) when none is given.
    // Checked, and off, in an alpha render.
    const finishing = o.finish === undefined ? clock.finish() : readFinish(o.finish, 'render');
    const finish = alpha ? null : finishing;
    // A size passed for a DOM source scales its box to that size, as the
    // encoder scales a canvas source's frames.
    const sized = !!(o.width || o.height);
    const asked = {
      width: Math.round(o.width || (isCanvas ? source.width : Number(root && root.getAttribute('data-width')) || source.clientWidth)),
      height: Math.round(o.height || (isCanvas ? source.height : Number(root && root.getAttribute('data-height')) || source.clientHeight)),
    };
    if (!(Number.isFinite(asked.width) && Number.isFinite(asked.height) && asked.width > 0 && asked.height > 0)) throw fail(CODES.BAD_CALL, 'render({ width, height })', __DEV__ && 'the source has no size, or a size that is not a finite number of pixels; set data-width and data-height on the root, or pass width and height');
    // H.264 encodes 4:2:0, which needs an even width and height, so an odd
    // size is rounded up. The wrapper around a DOM source leaves the extra
    // row or column blank; Chrome's encoder scales a canvas source's frames
    // to the even size.
    const even = !alpha && codec.startsWith('avc1');
    const width = even ? Math.ceil(asked.width / 2) * 2 : asked.width;
    const height = even ? Math.ceil(asked.height / 2) * 2 : asked.height;
    if (!isCanvas && typeof CanvasRenderingContext2D.prototype.drawElementImage !== 'function') {
      throw fail(CODES.NO_DRAW_ELEMENT, 'render()', __DEV__ && 'drawing the page into a video needs drawElementImage, which this browser has not enabled; turn on HTML-in-Canvas in Chrome (paste chrome://flags/#canvas-draw-element into the address bar, set the entry to Enabled and restart Chrome; https://developer.chrome.com/blog/html-in-canvas-origin-trial), or render a canvas source');
    }
    // Each element with its URL is the where, on every build.
    const foreign = isCanvas ? [] : foreignMedia(source);
    if (foreign.length) {
      throw fail(CODES.FOREIGN_MEDIA, 'render(): ' + foreign.join(', '), __DEV__ && 'media from another origin would be drawn black. '
        + 'Give an <img>, <video> or SVG <image> crossorigin="anonymous", with Access-Control-Allow-Origin from its server; a CSS image, an <input type=image>, a frame or an <object> (drawn empty) has to come from this origin or a data: URL');
    }

    const support = one || alpha ? { supported: true } : await G.VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
    if (!support.supported) {
      const rounded = width !== asked.width || height !== asked.height ? ' (' + asked.width + 'x' + asked.height + ' rounded up to even, which H.264 needs)' : '';
      throw fail(CODES.BAD_CALL, 'render(): ' + codec + ' at ' + width + 'x' + height, __DEV__ && 'this browser cannot encode ' + codec + ' at ' + width + 'x' + height + rounded);
    }
    // A run of readiness, as check() begins with, before the page is
    // touched: the footage loaded, the audio clips decoded (with audio:
    // false too), every scene's inputs and queries, the maps and images, a
    // file that failed before fetched again. Its failure is the one render()
    // rejects with, as check() fails with it, and so is one reported during
    // the frames (a scene a section mounts partway). Then the sound's codec.
    stop();
    await until(readiness.ready());
    const since = readiness.watch();
    let clips = [], sound = null;
    if (withAudio && !alpha) {
      clips = await until(audio.load());
      if (clips.length) sound = await until(soundConfig(audioCodec, audioBitrate));
    }
    stop();

    let canvas = null, ctx = null, wrap = null, encoder = null, fin = null, kept = null;
    const copies = new Map();
    // The shutter's samples per frame and angle, and the 2D canvas they are
    // read from, its context, their sums and the average written back.
    const samples = shutter ? shutter.samples : 1, angle = shutter ? shutter.angle : 0;
    let pane = null, pctx = null, sum = null, avg = null;
    // An alpha render's PNG Blobs, as promises in frame order, how many of
    // them are known done, and what puts the stage back.
    const pngs = [];
    let taken = 0, cleared = null;
    const mp4 = createMp4({ width, height, fps, codec, description: null });
    let description = null;
    let failure = null;
    const frames = Math.max(1, Math.round((to - from) * fps));
    const keyEvery = Math.max(1, Math.round(KEYFRAME_EVERY * fps));
    const started = performance.now();
    const before = clock.now();
    // A playing clock plays on from `before` once the render is done, as
    // after check().
    const resume = clock.suspend();
    const clockFps = clock.store.fps;
    // The encoder's failures, KN-207: its own error, a queue that does not
    // drain, and output the MP4 cannot hold.
    const broke = (what, why) => fail(CODES.ENCODER_FAILED, 'render(): the ' + what, __DEV__ && why + '; another codec, a smaller size or a lower bitrate may encode');
    // Video mode for the frames (lesson.js), until the seek back is done.
    let release = null;
    // The preview bar's As Rendered frame, laid over the root (preview.js),
    // is out of the frames and back after.
    const laid = source.querySelectorAll('[data-kinetic-as-rendered]');
    // Whether the root carried `drawable` before the render marked it.
    let hadDrawable = false;
    function unwrap() {
      if (!wrap) return;
      removeCopies(copies);
      wrap.parentNode.insertBefore(source, wrap);
      wrap.remove();
      wrap = null;
      if (!hadDrawable) source.removeAttribute('drawable');
      if (fit) fit.refresh();
    }
    try {
      release = lesson.force();
      // The live finish's overlays sit in the root; the pass finishes the file.
      if (finishLive) finishLive.hide();
      for (const c of laid) c.style.display = 'none';
      if (alpha) cleared = clearStage(source);
      if (!one && !alpha) {
        encoder = new G.VideoEncoder({
          output(chunk, meta) {
            if (meta && meta.decoderConfig && meta.decoderConfig.description && !description) description = meta.decoderConfig.description;
            const bytes = new Uint8Array(chunk.byteLength);
            chunk.copyTo(bytes);
            mp4.addSample(bytes, chunk.type === 'key');
          },
          error(e) { failure = broke(codec + ' encoder', __DEV__ && "the browser's video encoder failed (" + (e && e.message || e) + ')'); },
        });
        encoder.configure(Object.assign({ codec, width, height, bitrate, framerate: fps, latencyMode: 'quality' }, even ? { avc: { format: 'avc' } } : {}));
      }
      if (finish) {
        if (__DEV__) {
          const n = liveContexts();
          if (n >= 16) {
            warn(CODES.FINISH_CONTEXT, 'effects and drawings on the page hold ' + n + ' WebGL contexts, and the finish opens one more for the render; Chrome keeps 16, and drops the oldest for good, so a layer may come out blank',
              'Dispose effects and drawings no longer drawn, or give each { scene: this } so it is disposed with its scene; a Trillium view holds a context too.');
          }
        }
        fin = createFinish(finish, fps);
      }
      // Wrapped only once the options passed the support check, and inside
      // the try, so a failure puts the root back.
      if (!isCanvas) {
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        c.setAttribute('layoutsubtree', '');
        c.setAttribute('content', 'drawable');
        c.setAttribute('data-kinetic-render', '');
        c.style.display = 'block';
        // The canvas stands where the root stood: it takes the transform the page gave the root.
        const placed = getComputedStyle(source);
        for (const p of PLACED.concat('transformOrigin')) c.style[p] = placed[p];
        source.parentNode.insertBefore(c, source);
        wrap = c;
        // Chrome 157 draws only an element marked `drawable` (the canvas's
        // content="drawable" alone is no longer enough, and layoutsubtree is
        // gone); earlier Chromes ignore the attribute. Taken off again after.
        hadDrawable = source.hasAttribute('drawable');
        source.setAttribute('drawable', '');
        c.appendChild(source);
        if (fit) fit.refresh();
        canvas = c;
        // The shutter reads every sample back.
        ctx = c.getContext('2d', { willReadFrequently: !!shutter });
      }
      if (shutter) {
        pane = canvas || document.createElement('canvas');
        if (!canvas) { pane.width = source.width; pane.height = source.height; }
        pctx = ctx || pane.getContext('2d', { willReadFrequently: true });
        sum = new Uint32Array(pane.width * pane.height * 4);
        avg = pctx.createImageData(pane.width, pane.height);
        avg.data.fill(255);
        clock.store.shutter = angle;
      }
      // this.clipFrame in a scene is local * the store's fps, so the store has
      // the render's fps until the render ends.
      if (fps !== clockFps) clock.setFps(fps, clock.now());
      for (let i = 0; i < frames; i++) {
        if (failure) throw failure;
        stop();
        const t = from + i / fps;
        for (let k = 0; k < samples; k++) {
          // A seek whose media never lands (a server that stops mid-file)
          // still ends at an abort.
          await until(clock.seekSettled(t + (k / samples) * (angle / 360) / fps, t));
          stop();
          const late = since();
          if (late) throw late;
          // The runtime's player put the seek on one of its own frames; the
          // frame is this render's only if that is t (KN-206).
          const landed = clock.now();
          if (runtime && Math.abs(landed - t) > 1e-6) {
            const s = (v) => +v.toFixed(4) + ' s';
            throw fail(CODES.RUNTIME_FPS, 'render(): a seek to ' + s(t) + ' landed at ' + s(landed), __DEV__ && "the HyperFrames player puts each seek on one of its own frames, so "
              + (i ? 'a render at ' + fps + ' fps would repeat or skip frames' : 'from (' + s(from) + ') is not on those frames')
              + '. Give the root a data-fps that is a whole multiple of ' + fps + " (config({ fps }) comes too late for the runtime), with Kinetic's script tag before the runtime's and the root in the page when the runtime starts; or set window.__HF_EXPORT_RENDER_SEEK_CONFIG = { fps: " + fps + " } in a script before the runtime's; or remove the runtime's script tag for an in-browser render");
          }
          if (cleared) adoptClear();
          if (ctx) {
            updateCopies(copies, source, wrap);
            await painted();
            ctx.clearRect(0, 0, width, height);
            if (sized) ctx.drawElementImage(source, 0, 0, asked.width, asked.height);
            else ctx.drawElementImage(source, 0, 0);
          }
          if (sum) {
            if (!ctx) { pctx.clearRect(0, 0, pane.width, pane.height); pctx.drawImage(source, 0, 0); }
            const d = pctx.getImageData(0, 0, pane.width, pane.height).data;
            for (let j = 0; j < d.length; j += 4) {
              const a = d[j + 3];
              sum[j] += d[j] * a; sum[j + 1] += d[j + 1] * a; sum[j + 2] += d[j + 2] * a; sum[j + 3] += a;
            }
          }
        }
        if (sum) {
          // Each colour weighted by its alpha, so the average is over black,
          // as the file shows a transparent pixel: an unweighted average
          // would darken a pixel covered by m of n samples to (m / n)^2 of its
          // colour on a transparent root. The frame is
          // written opaque (avg's alpha is 255 throughout), and
          // Uint8ClampedArray rounds each level. With alpha the colour is
          // divided by the alphas' sum instead, which gives it straight, and
          // the alpha is their average, the coverage.
          for (let j = 0; j < sum.length; j += 4) {
            const a = sum[j + 3], k = alpha ? a : 255 * samples;
            for (let c = j; c < j + 3; c++) { avg.data[c] = k ? sum[c] / k : 0; sum[c] = 0; }
            if (alpha) avg.data[j + 3] = a / samples;
            sum[j + 3] = 0;
          }
          pctx.putImageData(avg, 0, 0);
        }
        const shown = pane || canvas || source;
        if (alpha && !one) {
          const p = png(shown, source, width, height, i);
          p.catch(() => {});
          pngs.push(p);
          // A few frames encode at once; the next waits for the oldest.
          while (pngs.length - taken > 4) { await until(pngs[taken]); taken++; }
          stop();
          if (typeof o.onProgress === 'function') o.onProgress(i + 1, frames);
          continue;
        }
        if (one) {
          // A copy, since the pass's canvas and the wrapper go at the end.
          kept = document.createElement('canvas');
          kept.width = width; kept.height = height;
          kept.getContext('2d').drawImage(fin ? fin.apply(shown, Math.round(t * fps)) : shown, 0, 0);
          continue;
        }
        // The finish takes the composition's frame number, so a render from
        // partway has the dust and grain of the same frames in a full one.
        const frame = new G.VideoFrame(fin ? fin.apply(shown, Math.round(t * fps)) : shown, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
        try {
          encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
        } finally {
          frame.close();
        }
        // A queue that has not shrunk in 10 s is a stalled encoder.
        for (let q = encoder.encodeQueueSize, moved = performance.now(); encoder.encodeQueueSize > 4;) {
          if (failure) throw failure;
          stop();
          if (encoder.encodeQueueSize < q) { q = encoder.encodeQueueSize; moved = performance.now(); }
          else if (performance.now() - moved > 10000) throw broke(codec + ' encoder, frame ' + i, __DEV__ && "the browser's video encoder stalled, with no frame done in 10 s");
          await new Promise((r) => setTimeout(r, 2));
        }
        if (typeof o.onProgress === 'function') o.onProgress(i + 1, frames);
      }
      stop();
      if (one) return kept;
      if (alpha) await until(Promise.all(pngs));
      else await until(encoder.flush()).catch((e) => { stop(); throw failure || broke(codec + ' encoder', __DEV__ && "the browser's video encoder failed (" + (e && e.message || e) + ')'); });
      if (failure) throw failure;
    } finally {
      if (encoder) try { encoder.close(); } catch (_) { /* already closed */ }
      unwrap();
      if (cleared) cleared();
      if (finishLive) finishLive.show();
      for (const c of laid) c.style.display = '';
      if (clock.store.fps !== clockFps) clock.setFps(clockFps, before);
      if (shutter) clock.store.shutter = 0;
      if (fin) fin.dispose();
      // The time is put back at once; an abort stops waiting for its media.
      try { await until(clock.seekSettled(before)); } finally { try { if (release) release(); } finally { resume(); } }
    }
    const base = o.name || (root && root.getAttribute('data-composition-id')) || 'composition';
    const offer = (blob, name, made, track) => {
      if (o.download !== false) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
      return { blob, name, frames, width, height, fps, codec: made, audioCodec: track ? track.codec : null, ms: Math.round(performance.now() - started) };
    };
    if (alpha) {
      const parts = await Promise.all(pngs);
      const { head, tail } = createMov({ width, height, fps, sizes: parts.map((b) => b.size) });
      const blob = new Blob([head, ...parts, tail], { type: 'video/quicktime' });
      try { await readBack(blob, parts); } catch (e) {
        throw fail(CODES.ENCODER_FAILED, 'render(): the MOV', __DEV__ && 'the file could not be read back (' + (e && e.message || e) + '); a Chrome started moments ago holds less, so render again in a minute, or a shorter range');
      }
      return offer(blob, base + '.mov', 'png', null);
    }
    // The sound over the render's range, as long as its frames.
    const track = sound ? await encodeSound(clips, sound, Math.round(from * RATE), Math.round(frames / fps * RATE), stop) : null;
    stop();
    const file = createMp4({ width, height, fps, codec, description, audio: track });
    // Re-add in order: the first writer only counted; the description was
    // not known until the first chunk arrived.
    for (let i = 0; i < mp4.count; i++) file.addSample(mp4.sampleAt(i).bytes, mp4.sampleAt(i).key);
    let bytes;
    try { bytes = file.finish(); } catch (e) { throw broke('MP4', __DEV__ && "the browser's video encoder gave output the MP4 cannot hold (" + e.message + ')'); }
    return offer(new Blob([bytes], { type: 'video/mp4' }), base + '.mp4', codec, track);
  }
}
