/**
 * The maps of the luma transitions, luma, halftone and dissolve
 * (transitions.js). Each clip and attribute that uses one gets a <filter> in
 * one hidden <svg> Kinetic adds to the composition root:
 *
 *   feImage (the map over the clip's own box, preserveAspectRatio none)
 *   -> feColorMatrix luminanceToAlpha -> feComponentTransfer (feFuncA
 *   linear) -> feComposite in, with SourceGraphic
 *
 * in sRGB, so the map's tones are read as they are stored. Coming in, the
 * clip shows where the map is darker than a threshold that sweeps through
 * its tones: the mask is clamp(k (threshold - map)), the threshold running
 * from -1/k at p = 0 to 1 + 1/k at p = 1, so the clip is wholly hidden at
 * the first and wholly shown at the last; k is 30, or 8 with soft. invert
 * reads 1 - map. Going out (data-clip-exit) the mask is 1 minus that, so
 * the clip goes in the map's order. Only the feImage's href and feFuncA's
 * intercept are written per seek; a filter no clip used in a seek has no
 * href and an intercept of 0, so its attributes read the same whichever
 * frame came before (check() compares them). Until a clip has a map (an
 * image map not loaded yet, an empty box), its intercept is 0 and the
 * clip is hidden through the transition. The filter's region is the clip's
 * own box, so whatever the clip draws outside it is cut while the filter is
 * on, and development builds warn once when that box is empty while the
 * clip holds elements (KN-115).
 *
 * The built-in maps are drawn on a canvas at the clip's box size, at
 * readiness and once for each new size a seek finds, and handed to the
 * feImage as a PNG behind a blob URL, which is kept for that size (the
 * framework refuses an SVG data: URI in a binding, and a data: URL would
 * put the whole PNG in an attribute that check() reads every frame):
 *
 *   halftone  0.55 (1 - cone) + 0.45 ramp, where cone is 1 at each dot's
 *             centre and 0 at its cell's corners (cell * 0.7071 away) on a
 *             grid turned by the angle, and ramp runs from 0 to 1 in the
 *             direction given; with no direction, 1 - cone
 *   dissolve  value noise: a value from the seeded hash at each corner of
 *             a grid of the grain's size, blended with smoothstep; the seed
 *             from the clip's id, else its place among the clips
 *
 * Both are the same PNG on every page load. Chrome paints an feImage from a
 * fresh blob or data: URL in the frame after it is set, a 1920 x 1080 noise
 * map too (probed in Chrome 155, 2026-10-09), so a map drawn during a seek
 * is there when the frame is captured.
 *
 * An image map, luma url(path), is fetched at readiness (and by check() and
 * render()), never during a seek, checked to decode and handed over as a
 * blob URL. One that fails is KN-117, printed with console.error on every
 * build, and fails that run of readiness; the next run fetches it again if a
 * clip still asks for it. A map from another origin needs CORS from its
 * server: a filter draws nothing from an image of another origin.
 */
import { CODES, fail, warn } from './diagnostics.js';
import { clipName } from './clips.js';
import { seedOf, next } from './motion.js';
import { fetchNote } from './audio.js';

const set = (el, name, v) => { v = String(v); if (el.getAttribute(name) !== v) el.setAttribute(name, v); };

// A grayscale PNG of w x h whose pixel (x, y) is f(x + 0.5, y + 0.5), 0 to
// 1, as a blob URL, made at once so a seek can draw one.
function png(w, h, f) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h), d = img.data;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i += 4) {
      d[i] = d[i + 1] = d[i + 2] = Math.round(f(x + 0.5, y + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const s = atob(c.toDataURL().slice(22));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return URL.createObjectURL(new Blob([b], { type: 'image/png' }));
}

function halftone(s, w, h) {
  const cell = s.size || 28, a = (s.angle === undefined ? 45 : s.angle) * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a), r = cell * Math.SQRT1_2, dir = s.dir;
  return (x, y) => {
    const u = x * cos + y * sin, v = y * cos - x * sin;
    const cone = Math.max(0, 1 - Math.hypot(u - (Math.floor(u / cell) + 0.5) * cell, v - (Math.floor(v / cell) + 0.5) * cell) / r);
    if (!dir) return 1 - cone;
    const ramp = dir === 'from-left' ? x / w : dir === 'from-right' ? 1 - x / w : dir === 'from-top' ? y / h : 1 - y / h;
    return 0.55 * (1 - cone) + 0.45 * ramp;
  };
}

function dissolve(s, seed) {
  const grain = s.size || 2;
  const at = (i, j) => next((Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ seed) >>> 0)[0];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const gx = x / grain, gy = y / grain, i = Math.floor(gx), j = Math.floor(gy), u = fade(gx - i), v = fade(gy - j);
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + at(i + 1, j + 1)) * u * v;
  };
}

// A clip's own box in CSS px: its layout box, or for an SVG element its box
// on screen.
function box(el) {
  if (el.offsetWidth !== undefined) return [el.offsetWidth, el.offsetHeight];
  const r = el.getBoundingClientRect();
  return [Math.round(r.width), Math.round(r.height)];
}

const absolute = (src) => { try { return new URL(src, document.baseURI).href; } catch (_) { return src; } };

export function createMaps() {
  const entries = new Map();    // clip -> Map(attribute -> its filter)
  const images = new Map();     // an image map's absolute URL -> { url, promise }
  const pngs = new WeakMap();   // a parsed attribute -> Map(size and seed -> blob URL)
  const warned = new WeakSet(); // clips warned about for an empty box
  let svg = null, ids = 0, used = new Set(), last = new Set();

  // An image map, fetched once per URL while it loads or has loaded; one
  // that failed is fetched again by the next load. `url` is its blob URL.
  function image(src, el, attr) {
    const abs = absolute(src);
    let r = images.get(abs);
    if (r) return r;
    images.set(abs, r = { url: null, promise: null });
    const why = (text) => { images.delete(abs); return fail(CODES.MAP_FAILED, 'the map url(' + src + ') of ' + clipName(el) + "'s " + attr, __DEV__ && text); };
    r.promise = fetch(abs).then((res) => {
      if (!res.ok) throw why(__DEV__ && 'could not be loaded (HTTP ' + res.status + ')');
      return res.blob();
    }, () => {
      let note = '';
      if (__DEV__) try { note = fetchNote(abs); } catch (_) { /* no URL to say more about */ }
      throw why(__DEV__ && 'could not be fetched' + note);
    }).then((b) => createImageBitmap(b).then((bm) => { bm.close(); r.url = URL.createObjectURL(b); }, () => {
      throw why(__DEV__ && 'is not an image this browser can decode');
    }));
    return r;
  }

  // The filter for a clip's attribute, built on first use or when the
  // attribute or the root has changed.
  function entry(el, attr, s, root) {
    let byAttr = entries.get(el);
    if (!byAttr) entries.set(el, byAttr = new Map());
    let m = byAttr.get(attr);
    if (m && m.s === s && root.contains(m.filter)) return m;
    if (m) m.filter.remove();
    if (!svg || svg.parentNode !== root) {
      root.insertAdjacentHTML('beforeend', '<svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"></svg>');
      svg = root.lastElementChild;
    }
    // The slope is the mask's, k or -k, fixed by the side: an exit's goes
    // out. The feImage fills the filter's region, the clip's box.
    const k = s.soft ? 8 : 30, id = 'kinetic-map-' + ++ids;
    svg.insertAdjacentHTML('beforeend', '<filter id="' + id + '" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feImage preserveAspectRatio="none"/>'
      + '<feColorMatrix type="luminanceToAlpha"/><feComponentTransfer result="m"><feFuncA type="linear" slope="' + (s.invert ? k : -k) * (attr === 'data-clip-exit' ? -1 : 1)
      + '" intercept="0"/></feComponentTransfer><feComposite in="SourceGraphic" in2="m" operator="in"/></filter>');
    const filter = svg.lastElementChild;
    m = { s, attr, el, id, filter, image: filter.firstChild, func: filter.children[2].firstChild, icpt: 0, empty: false, w: 0, h: 0,
      seed: s.kind === 'dissolve' ? (el.id ? seedOf(el.id) : Array.prototype.indexOf.call(root.querySelectorAll('[data-start]'), el)) : 0 };
    byAttr.set(attr, m);
    return m;
  }

  // The map's URL for the clip now, or null: an image map once loaded, a
  // built-in map drawn at the clip's box size, once for each size, so a
  // frame's href is the same whichever frame came before.
  function mapOf(m, el) {
    const s = m.s;
    [m.w, m.h] = box(el);
    m.empty = !m.w || !m.h;
    if (s.url) { const r = images.get(absolute(s.url)); return r && r.url; }
    if (m.empty) return null;
    let cache = pngs.get(s);
    if (!cache) pngs.set(s, cache = new Map());
    const key = m.w + ' ' + m.h + ' ' + m.seed;
    let url = cache.get(key);
    if (!url) cache.set(key, url = png(m.w, m.h, s.kind === 'halftone' ? halftone(s, m.w, m.h) : dissolve(s, m.seed)));
    return url;
  }

  return {
    // At readiness, check() and render(): the filter built, a built-in map
    // drawn at the clip's size, an image map fetched (KN-117 rejects).
    prepare(el, attr, s, root) {
      const m = entry(el, attr, s, root);
      return s.url ? image(s.url, el, attr).promise : void mapOf(m, el);
    },
    // The filter value for a clip's attribute at eased progress e, with the
    // mask's intercept kept for settle(): k threshold, or k (threshold - 1)
    // inverted, and 1 minus that going out.
    style(el, attr, s, e, root) {
      const m = entry(el, attr, s, root);
      const k = s.soft ? 8 : 30, thr = -1 / k + e * (1 + 2 / k);
      const icpt = k * (s.invert ? thr - 1 : thr);
      m.icpt = Math.round((attr === 'data-clip-exit' ? 1 - icpt : icpt) * 1e4) / 1e4 + 0;
      used.add(m);
      return 'url(#' + m.id + ')';
    },
    // Once the seek has flushed, with each clip laid out for the frame: each
    // filter in use gets the map for its clip's box and its intercept. With
    // no map yet (an image map not loaded, an empty box), it gets no href,
    // so the feImage is transparent, and an intercept of 0, which hides the
    // clip.
    settle() {
      for (const m of last) {
        const el = m.el, url = mapOf(m, el);
        if (__DEV__ && m.empty && el.firstElementChild && !warned.has(el)) {
          warned.add(el);
          warn(CODES.BAD_TRANSITION, clipName(el) + ' has ' + m.attr + '="' + el.getAttribute(m.attr) + '", and its own box is empty (' + m.w + ' x ' + m.h + ' px); a ' + m.s.kind + " transition's filter covers only that box, so nothing inside the clip shows until the transition ends",
            'Give the clip a size, such as position: absolute; inset: 0, or put the transition on an element inside it that has one.');
        }
        if (url) set(m.image, 'href', url);
        else m.image.removeAttribute('href');
        set(m.func, 'intercept', url ? m.icpt : 0);
      }
    },
    // After each seek: the filters no clip used read 0, with no href, and
    // the filters of clips taken off the page go.
    done() {
      for (const m of last) {
        if (used.has(m)) continue;
        set(m.func, 'intercept', 0);
        m.image.removeAttribute('href');
      }
      [last, used] = [used, last];
      used.clear();
      for (const [el, byAttr] of entries) {
        if (el.isConnected) continue;
        for (const m of byAttr.values()) { m.filter.remove(); last.delete(m); }
        entries.delete(el);
      }
    },
  };
}
