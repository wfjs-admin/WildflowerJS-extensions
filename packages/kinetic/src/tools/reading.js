/**
 * The reading pass and the layout pass, on one walk: the composition is
 * paused and sought every 0.1 s from start to end, and each block of text
 * (an element that is not inline, or an SVG <text>) is timed while all of
 * its text is on screen: its box not empty, its center inside the root, at
 * least 90% opaque through its ancestors, and not wholly hidden by a mask
 * or a clip.
 *
 * Reading: a block whose longest such stretch is shorter than the BBC
 * subtitle rate allows, at least 1.5 s and 0.5 s plus 0.375 s a word (160
 * words a minute, and half a second to start reading), with 1 s more for a
 * figure of three digits or more, is listed with its words, how long it held
 * and from when. This is a floor: a calm piece holds about twice as long.
 * Words that come in one at a time count from the last one in. Text that
 * is typed counts from its first letter, since it is read as it types, and
 * the whole line has then to hold for the 1.5 s floor, or it is listed with
 * `whole: true` and the time the whole line held. A lesson is read as its
 * video, in video mode.
 *
 * Layout: each line of text measured by its box less 15% top and bottom
 * (about where its ink is), leaving out a line covered by something that
 * paints above it. Listed: a block outside the safe area (5% of the frame's
 * width and height on every side) while it is at rest, a block past the
 * frame's own edge ("cut"), and two blocks whose lines overlap ("over"),
 * each when it lasts 0.2 s or more; and, through `contrast`, a block under
 * its contrast floor at the middle of its longest stretch on screen.
 *
 * The hit tests (what covers a line, what a clip-path shows) reach only the
 * part of the root inside the window, so the walk fits a larger root to the
 * window while it runs. A point still outside it (a root with a transform of
 * its own, a page that cannot scroll) counts as shown and uncovered.
 */

import { rootOf, sizeOf, seekTo, clip } from './shared.js';

const STEP = 0.1;
// A figure the eye has to take in: a number of three digits or more, with
// its separators (498, 4.07, 24,318).
const FIGURE = /\d[\d,.]*\d[\d,.]*\d/;
// Samples a layout finding lasts before it is listed: 0.2 s.
const LAYOUT_HOLD = 3;

const inWindow = (x, y) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
// A time in a report, to a hundredth of a second: the walk's steps add up with a float's noise.
const sec = (t) => Math.round(t * 100) / 100;

// Something above the text that paints: a background, an image, a canvas, a
// video or an SVG shape, mostly opaque. A gradient with a stop mostly
// transparent (a vignette, a light leak, a scrim over part of the frame) is
// not taken to cover what is under it, since its clear part shows the text.
function paints(e) {
  const cs = getComputedStyle(e);
  if (parseFloat(cs.opacity) < 0.5 || cs.visibility === 'hidden') return false;
  if (/^(IMG|CANVAS|VIDEO)$/.test(e.tagName) || e instanceof SVGGeometryElement) return true;
  if (cs.backgroundImage !== 'none') {
    if (/url\(/.test(cs.backgroundImage)) return true;
    const stops = cs.backgroundImage.match(/rgba?\([^)]*\)|transparent/g) || [];
    if (!stops.some((c) => c === 'transparent' || (c.split(',').length === 4 && parseFloat(c.split(',')[3]) < 0.5))) return true;
  }
  const a = /rgba?\(([^)]*)\)/.exec(cs.backgroundColor);
  return !!a && (a[1].split(',').length < 4 || parseFloat(a[1].split(',')[3]) > 0.5);
}

// The blocks on screen at the current time, each as [key, text, lines]:
// lines (with `layout`) its lines' boxes [left, top, right, bottom] in the
// composition's pixels. `keys` gives each block element a number for the
// walk, and `els` the element back from it.
function sample(root, keys, els, layout) {
  const { R, s } = sizeOf(root);
  const visible = (el) => {
    const b = el.getBoundingClientRect();
    if (b.width < 1 || b.height < 1) return false;
    const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    if (cx < R.left || cx > R.right || cy < R.top || cy > R.bottom) return false;
    let op = 1;
    for (let e = el; e && e !== root.parentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      op *= parseFloat(cs.opacity);
    }
    return op >= 0.9;
  };
  // A text node's block: an SVG <text>, or the nearest ancestor that is not inline.
  const blockOf = (p) => {
    const svgText = p.closest('text');
    if (svgText && root.contains(svgText)) return svgText;
    let b = p;
    while (b !== root && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
    return b;
  };
  // A block's text is its own text nodes, in order: what a block inside it holds is that block's. Where another
  // block's text, or white space between two elements, comes between two of its nodes, a space stands for it.
  const blocks = new Map();   // block -> { ok, nodes, text }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let at = null, gap = false;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) { gap = true; continue; }
    const p = n.parentElement;
    if (!p || p.closest('[data-kinetic-finish], [data-kinetic-preview], [data-kinetic-as-rendered], script, style, template')) continue;
    const b = blockOf(p);
    const e = blocks.get(b) || { ok: true, nodes: [], text: '' };
    e.ok = e.ok && visible(p);
    e.nodes.push(n);
    e.text += (e.text && (gap || at !== b) ? ' ' : '') + n.nodeValue;
    at = b;
    gap = false;
    blocks.set(b, e);
  }
  const range = document.createRange();
  // A line is covered when, at each of three points along it, something
  // that paints lies above its block, as a scene growing over the last one
  // covers it; one partly covered (a wipe growing over it) is cut to the
  // stretch that shows, from sixteen points along it. A block the hit test
  // skips (pointer-events: none) counts as uncovered.
  const coveredAt = (b, x, y) => {
    if (!inWindow(x, y)) return false;
    const stack = document.elementsFromPoint(x, y);
    const i = stack.findIndex((e) => e === b || b.contains(e));
    return i >= 0 && stack.slice(0, i).some((e) => !e.contains(b) && paints(e));
  };
  const uncovered = (b, r) => {
    const y = (r.top + r.bottom) / 2;
    const n = [0.25, 0.5, 0.75].filter((f) => coveredAt(b, r.left + f * r.width, y)).length;
    if (n === 0) return r;
    if (n === 3) return null;
    const step = r.width / 16;
    let a = Infinity, z = -Infinity;
    for (let i = 0; i < 16; i++) {
      const x = r.left + (i + 0.5) * step;
      if (!coveredAt(b, x, y)) { a = Math.min(a, x); z = Math.max(z, x); }
    }
    return z - a >= 1 ? { left: a, top: r.top, right: z, bottom: r.bottom, width: z - a, height: r.height } : null;
  };
  // A text node's line boxes as far as they show: each cut to the boxes of
  // the ancestors below the root that clip (overflow other than visible),
  // and, under a clip-path, kept only from the first of sixteen points along
  // it that reaches the text to the last (pointer-events made auto on it for
  // the test). The root's own clip is the frame's edge, which the layout
  // pass measures, so it is left alone.
  const shownRects = (n) => {
    let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity, clipped = false;
    for (let a = n.parentElement; a && a !== root; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.clipPath !== 'none') clipped = true;
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const c = a.getBoundingClientRect();
        if (cs.overflowX !== 'visible') { x0 = Math.max(x0, c.left); x1 = Math.min(x1, c.right); }
        if (cs.overflowY !== 'visible') { y0 = Math.max(y0, c.top); y1 = Math.min(y1, c.bottom); }
      }
    }
    range.selectNodeContents(n);
    const out = [];
    for (const r of range.getClientRects()) {
      const left = Math.max(r.left, x0), top = Math.max(r.top, y0), right = Math.min(r.right, x1), bottom = Math.min(r.bottom, y1);
      if (right - left < 1 || bottom - top < 1) continue;
      out.push({ left, top, right, bottom, width: right - left, height: bottom - top });
    }
    if (!clipped || !out.length) return out;
    const p = n.parentElement, was = p.style.getPropertyValue('pointer-events'), pri = p.style.getPropertyPriority('pointer-events');
    p.style.setProperty('pointer-events', 'auto', 'important');
    const hit = [];
    for (const r of out) {
      const y = (r.top + r.bottom) / 2, step = r.width / 16;
      let a = Infinity, b = -Infinity;
      for (let i = 0; i < 16; i++) {
        const x = r.left + (i + 0.5) * step;
        if (!inWindow(x, y) || document.elementsFromPoint(x, y).some((e) => e === p || p.contains(e))) { a = Math.min(a, x); b = Math.max(b, x); }
      }
      if (b - a >= 1) hit.push({ left: a, top: r.top, right: b, bottom: r.bottom, width: b - a, height: r.height });
    }
    if (was) p.style.setProperty('pointer-events', was, pri); else p.style.removeProperty('pointer-events');
    return hit;
  };
  const linesOf = (b, rects) => {
    const out = [];
    for (const whole of rects) {
      const r = uncovered(b, whole);
      if (!r) continue;
      // The line's box is the font's whole height; its ink sits inside, so
      // 15% comes off the top and the bottom.
      const inset = 0.15 * r.height;
      out.push([(r.left - R.left) * s, (r.top + inset - R.top) * s, (r.right - R.left) * s, (r.bottom - inset - R.top) * s].map((v) => Math.round(v * 10) / 10));
    }
    return out;
  };
  const out = [];
  for (const [b, e] of blocks) {
    if (!e.ok) continue;
    // A block a mask or a clip-path hides entirely is not on screen.
    const rects = [].concat(...e.nodes.map(shownRects));
    if (!rects.length) continue;
    if (!keys.has(b)) { keys.set(b, keys.size + 1); els.set(keys.get(b), b); }
    out.push([keys.get(b), e.text.replace(/\s+/g, ' ').trim(), layout ? linesOf(b, rects) : null]);
  }
  return out;
}

// The layout pass's bookkeeping beside the walk: text outside the safe area
// while it is at rest, text past the frame's own edge, and text over other
// text, each when it lasts LAYOUT_HOLD samples. Moving text is left out of
// the safe area's list, so a block sliding in from outside the frame is not
// listed.
function placement(W, H) {
  const mx = 0.05 * W, my = 0.05 * H;
  const prev = new Map();     // key -> the block's box at the sample before
  const open = new Map();     // finding key -> { n, from, worst, ... } for the run in progress
  const found = new Map();    // finding key -> the longest run that lasted LAYOUT_HOLD samples
  const boxOf = (lines) => lines.reduce((b, l) => [Math.min(b[0], l[0]), Math.min(b[1], l[1]), Math.max(b[2], l[2]), Math.max(b[3], l[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const seen = new Set();
  const note = (id, t, amount, extra) => {
    seen.add(id);
    const o = open.get(id);
    if (o) { o.n++; o.to = t; o.worst = Math.max(o.worst, amount); }
    else open.set(id, Object.assign({ n: 1, from: t, to: t, worst: amount }, extra));
  };
  const settle = () => {
    for (const [id, o] of open) {
      if (seen.has(id)) continue;
      if (o.to - o.from >= (LAYOUT_HOLD - 1) * STEP - 1e-6) { const f = found.get(id); if (!f || o.to - o.from > f.to - f.from) found.set(id, o); }
      open.delete(id);
    }
    seen.clear();
  };
  // The farthest a box reaches past the edges of a rectangle, and which edge.
  const past = (b, x0, y0, x1, y1) => {
    const d = [x0 - b[0], y0 - b[1], b[2] - x1, b[3] - y1];
    const i = d.indexOf(Math.max(...d));
    return { px: d[i], edge: ['left', 'top', 'right', 'bottom'][i] };
  };
  return {
    sample(t, shown) {
      const boxes = [];
      for (const [key, , lines] of shown) {
        if (!lines || !lines.length) continue;
        const b = boxOf(lines), p = prev.get(key);
        boxes.push([key, lines]);
        const still = p && b.every((v, i) => Math.abs(v - p[i]) < 1);
        prev.set(key, b);
        if (!still) continue;
        // At rest is known a sample late: the block was there at the sample before.
        const cut = past(b, 0, 0, W, H), out = past(b, mx, my, W - mx, H - my);
        if (cut.px >= 1) note('cut ' + key, t, cut.px, { kind: 'cut', key, edge: cut.edge, from: t - STEP });
        else if (out.px >= 1) note('safe ' + key, t, out.px, { kind: 'safe', key, edge: out.edge, from: t - STEP });
      }
      for (const key of [...prev.keys()]) if (!shown.some((x) => x[0] === key)) prev.delete(key);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        let w = 0, h = 0;
        for (const a of boxes[i][1]) for (const b of boxes[j][1]) {
          const iw = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), ih = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
          if (iw >= 2 && ih >= 2 && iw * ih > w * h) { w = iw; h = ih; }
        }
        if (w) { const [a, b] = [boxes[i][0], boxes[j][0]].sort((x, y) => x - y); note('over ' + a + ' ' + b, t, w * h, { kind: 'over', key: a, other: b, w, h }); }
      }
      settle();
    },
    findings(runs, low) {
      settle();   // nothing is seen after the last sample, so this closes every run still open
      const text = (key) => clip((runs.get(key) || { text: '' }).text);
      const out = [];
      for (const f of found.values()) {
        const held = sec(f.to + STEP - f.from), from = sec(f.from);
        if (f.kind === 'over') out.push({ kind: f.kind, text: text(f.key), other: text(f.other), w: Math.round(f.w), h: Math.round(f.h), from, held });
        else out.push({ kind: f.kind, text: text(f.key), edge: f.edge, px: Math.round(f.worst), margin: Math.round(f.edge === 'left' || f.edge === 'right' ? mx : my), from, held });
      }
      for (const c of low) out.push({ kind: 'contrast', text: clip(c.text), ratio: c.ratio, needs: c.needs, size: c.size, from: sec(c.at) });
      return out.sort((a, b) => a.from - b.from);
    },
  };
}

// The walk. Returns { short } for reading, the blocks that leave too soon in
// order of first showing, and with `layout` { found }, the layout pass's
// findings. `contrast(el, t)` measures a block (pixels.js), or is null; an
// error it throws stops the contrast measures and is returned as
// `contrastError`.
export async function textPass(wf, k, layout, contrast) {
  const s = wf.getStore('kinetic');
  const root = rootOf();
  const { width, height } = sizeOf(root);
  const last = Math.max(0, s.duration - 1 / s.fps);
  const keys = new Map(), els = new Map();
  const runs = new Map();   // key -> { text, words, start, best, bestFrom, from, last, typed, whole, full, fullFrom }
  const place = layout ? placement(width, height) : null;
  // The stretch a block's text was whole (its longest) ends; the longest such stretch is kept.
  const part = (r, t) => { if (r.whole !== null) { if (t - r.whole > r.full) { r.full = t - r.whole; r.fullFrom = r.whole; } r.whole = null; } };
  const close = (r, t) => { part(r, t); r.last = null; if (r.start !== null) { const held = t - r.start; if (held > r.best) { r.best = held; r.bestFrom = r.start; } r.start = null; } };
  // For the walk, a root larger than the window is scaled from its top left
  // corner to fit it, and the page scrolled to bring the root to the window's
  // corner, so the hit tests reach the whole frame; both are put back after.
  const sx = scrollX, sy = scrollY, st = root.style, wasT = st.transform, wasO = st.transformOrigin;
  let box = root.getBoundingClientRect();
  const fit = Math.min(1, innerWidth / box.width, innerHeight / box.height);
  const scaled = fit < 1 && getComputedStyle(root).transform === 'none';
  if (scaled) { st.transformOrigin = '0 0'; st.transform = 'scale(' + fit + ')'; box = root.getBoundingClientRect(); }
  scrollBy(box.left, box.top);
  try {
    for (let i = 0, t = 0; t <= last + 1e-6; t = ++i * STEP) {
      await seekTo(k, t);
      const shown = sample(rootOf() || root, keys, els, layout);
      if (place) place.sample(t, shown);
      const now = new Set();
      for (const [key, text] of shown) {
        now.add(key);
        let r = runs.get(key);
        if (!r) runs.set(key, (r = { text, words: 0, start: null, best: 0, bestFrom: t, from: t, last: null, typed: false, whole: null, full: 0, fullFrom: t }));
        r.words = Math.max(r.words, text.split(' ').filter(Boolean).length);
        // Text that grows by what is added to its end is being typed.
        if (r.last !== null && text.length > r.last.length && text.startsWith(r.last)) r.typed = true;
        // Whole while it is its longest; a longer text than any before starts the count again.
        if (text.length > r.text.length) { r.text = text; r.full = 0; r.whole = t; } else if (text !== r.text) part(r, t); else if (r.whole === null) r.whole = t;
        r.last = text;
        if (r.start === null) r.start = t;
      }
      for (const [key, r] of runs) if (!now.has(key)) close(r, t);
    }
  } finally {
    if (scaled) { st.transform = wasT; st.transformOrigin = wasO; }
    scrollTo(sx, sy);
  }
  for (const r of runs.values()) close(r, last + STEP);
  // Contrast, for each block at the middle of its longest stretch on screen.
  const low = [];
  let contrastError = null;
  if (place && contrast) {
    for (const [key, r] of runs) {
      const at = Math.round((r.bestFrom + Math.floor(r.best / STEP / 2) * STEP) * 1e6) / 1e6;
      let c;
      try { c = await contrast(els.get(key), at); } catch (e) { contrastError = e; break; }
      if (c && c.ratio < c.needs) low.push({ key, text: r.text, at, ratio: c.ratio, needs: c.needs, size: c.size });
    }
  }
  const short = [];
  for (const r of runs.values()) {
    const needs = Math.max(1.5, 0.5 + 0.375 * r.words) + (FIGURE.test(r.text) ? 1 : 0);
    // Within half a sample of the time it needs counts as enough.
    if (r.best + STEP / 2 < needs) short.push({ text: clip(r.text), words: r.words, held: sec(r.best), from: sec(r.bestFrom), needs, first: r.from });
    // Typed text is read as it types, so it counts from its first letter; whole, it still holds for the floor.
    else if (r.typed && r.full + STEP / 2 < 1.5) short.push({ text: clip(r.text), words: r.words, held: sec(r.full), from: sec(r.fullFrom), needs: 1.5, whole: true, first: r.from });
  }
  short.sort((a, b) => a.first - b.first);
  for (const b of short) delete b.first;
  return { short, found: place ? place.findings(runs, low) : null, contrastError };
}
