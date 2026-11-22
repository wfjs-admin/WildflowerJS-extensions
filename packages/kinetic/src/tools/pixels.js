/**
 * The passes that read pixels: the frames as PNGs and their strip, the
 * pace, the seam, the jumps, the diff, isolate and a block's contrast. Every
 * frame is render.still(t), the frame as a render draws it (render()'s
 * seeks, shutter and finish, through drawElementImage), so the preview bar,
 * the speaker and the pause mark, which sit outside the root, are never in
 * it. A browser without drawElementImage cannot draw one: the first capture
 * throws KN-201, and every pixel pass after it is skipped with that error.
 */

import { rootOf, sizeOf, seekTo } from './shared.js';

// The captures, with the error that stopped them, once there is one.
export function createPixels(k) {
  let broken = null;
  return {
    get broken() { return broken; },
    async still(t) {
      if (broken) throw broken;
      try { return await k.render.still(t); } catch (e) { broken = e; throw e; }
    },
  };
}

// A canvas's pixels at `w` px wide (its own width when it is no wider).
function shrink(c, w) {
  if (!w || w >= c.width) return c.getContext('2d').getImageData(0, 0, c.width, c.height);
  const h = Math.max(1, Math.round(c.height * w / c.width));
  const s = document.createElement('canvas');
  s.width = w; s.height = h;
  const g = s.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(c, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}

// Brightness, 0 to 255, a pixel.
function luma(d) {
  const p = d.data, out = new Float32Array(d.width * d.height);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2];
  return out;
}

export const png = (c) => new Promise((ok) => c.toBlob(ok, 'image/png'));

// ---- the frames and the strip ---------------------------------------------------

// Each frame as { t, frame, png }, and its canvas for the strip. A count is
// that many frames evenly spaced from 0 to the last; a list is seconds, each
// snapped to its frame.
export async function framesPass(wf, px, spec) {
  const s = wf.getStore('kinetic'), fps = s.fps, last = Math.max(0, Math.round(s.duration * fps) - 1);
  const list = typeof spec === 'number'
    ? Array.from({ length: spec }, (_, i) => (spec === 1 ? 0 : Math.round(i * last / (spec - 1))))
    : spec.map((t) => Math.min(last, Math.round(t * fps)));
  const out = [];
  for (const f of list) {
    const c = await px.still(f / fps);
    out.push({ t: f / fps, frame: f, png: await png(c), canvas: c });
  }
  return out;
}

// The frames tiled into one PNG, each labelled with its frame number, at
// most 320 px wide a tile.
export function stripOf(shots) {
  const cols = Math.ceil(Math.sqrt(shots.length)), rows = Math.ceil(shots.length / cols);
  const first = shots[0].canvas, k = Math.min(1, 320 / first.width), w = Math.round(first.width * k), h = Math.round(first.height * k);
  const c = document.createElement('canvas');
  c.width = cols * w; c.height = rows * h;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.font = 'bold 14px sans-serif'; g.textBaseline = 'top';
  shots.forEach((shot, i) => {
    const x = (i % cols) * w, y = Math.floor(i / cols) * h;
    g.drawImage(shot.canvas, x, y, w, h);
    const label = String(shot.frame), tw = g.measureText(label).width;
    g.fillStyle = 'rgba(0, 0, 0, 0.7)'; g.fillRect(x + 4, y + 4, tw + 8, 20);
    g.fillStyle = '#fff'; g.fillText(label, x + 8, y + 7);
  });
  return png(c);
}

// ---- the pace -------------------------------------------------------------------

// The dial's targets (the skill's directions, "The expression dial"): [low,
// high] for the share near still, the snaps a minute, the longest stretch
// near still in seconds, the brightness range (p95 - p5), the share in
// smooth ramps and the tones in use.
export const DIAL = {
  calm: { still: [0.5, 1], snaps: [0, 15], longest: [0, 7.5], range: [0, 255], ramps: [0, 1], tones: [0, 64] },
  lively: { still: [0.35, 0.6], snaps: [20, 60], longest: [0, 3.5], range: [120, 255], ramps: [0.15, 1], tones: [14, 64] },
  bold: { still: [0.25, 0.4], snaps: [45, 120], longest: [0, 2.5], range: [170, 255], ramps: [0.15, 1], tones: [14, 64] },
};

// A frame's depth of finish, from its brightness at w by h: the share of
// pixels in a smooth ramp (a gradient magnitude of 4 to 60 after a [1,2,1]
// blur and a 3x3 Sobel, the border left out) and the tones in use (bins of
// 4 levels holding 0.4% of the frame or more). Flat fills give few tones and
// almost no ramps; light, shading and layers give many.
function depth(l, w, h) {
  const b = new Float32Array(w * h), t = new Float32Array(w * h);
  const at = (a, x, y) => a[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t[y * w + x] = (at(l, x - 1, y) + 2 * at(l, x, y) + at(l, x + 1, y)) / 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = (at(t, x, y - 1) + 2 * at(t, x, y) + at(t, x, y + 1)) / 4;
  let ramps = 0, inner = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = (dx, dy) => b[(y + dy) * w + x + dx];
    const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
    const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
    const m = Math.hypot(gx, gy);
    inner++; if (m >= 4 && m < 60) ramps++;
  }
  const bins = new Array(64).fill(0);
  for (const v of l) bins[Math.min(63, Math.max(0, Math.round(v)) >> 2)]++;
  return { ramps: inner ? ramps / inner : 0, tones: bins.filter((c) => c >= 0.004 * l.length).length };
}

// Every frame at 240 px wide, each compared with the one before as the mean
// change in brightness: the share near still (a change under 1), the snaps
// a minute (peaks over 8, at least 0.3 s apart), the longest stretch near
// still (the last 4.5 s, the end card, aside), the range of the frames'
// brightness, and from a frame every half second the smooth ramps and the
// tones; each beside the dial's target, with the ones it misses.
export async function pacePass(wf, px, dial) {
  const s = wf.getStore('kinetic'), fps = s.fps, n = Math.max(1, Math.round(s.duration * fps));
  const diffs = [], lumas = [], depths = [];
  let prev = null;
  for (let f = 0; f < n; f++) {
    const d = shrink(await px.still(f / fps), 240), l = luma(d);
    if (f % Math.max(1, Math.round(fps / 2)) === 0) depths.push(depth(l, d.width, d.height));
    let m = 0; for (const v of l) m += v; lumas.push(m / l.length);
    if (prev) { let c = 0; for (let i = 0; i < l.length; i++) c += Math.abs(l[i] - prev[i]); diffs.push(c / l.length); }
    prev = l;
  }
  const secs = n / fps, gap = Math.round(fps * 0.3);
  const still = diffs.filter((d) => d < 1).length / Math.max(1, diffs.length);
  let snaps = 0, lastPeak = -Infinity;
  for (let i = 1; i < diffs.length - 1; i++) {
    if (diffs[i] > 8 && diffs[i] >= diffs[i - 1] && diffs[i] >= diffs[i + 1] && i - lastPeak >= gap) { snaps++; lastPeak = i; }
  }
  let longest = 0, run = 0, longestAt = 0;
  const body = Math.max(0, diffs.length - Math.round(fps * 4.5));
  for (let i = 0; i < body; i++) { if (diffs[i] < 1) { run++; if (run > longest) { longest = run; longestAt = i - run + 1; } } else run = 0; }
  const sorted = lumas.slice().sort((a, b) => a - b), q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const median = (a) => { const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const r = { dial, secs, still, snaps: snaps / secs * 60, longest: longest / fps, longestFrom: longestAt / fps, range: q(0.95) - q(0.05),
    ramps: median(depths.map((x) => x.ramps)), tones: median(depths.map((x) => x.tones)) };
  const target = DIAL[dial];
  r.target = target;
  r.misses = Object.keys(target).filter((key) => r[key] < target[key][0] || r[key] > target[key][1]);
  return r;
}

// ---- the seam, the jumps, the diff and isolate -----------------------------------

// The change between two frames' brightness at w by h: the mean change, 0
// to 255, and the box of the pixels that changed by more than 24 levels, in
// the composition's pixels (k of them to a captured one), or null.
function change(a, b, w, h, k) {
  let sum = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.abs(a[y * w + x] - b[y * w + x]);
    sum += d;
    if (d > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const box = x1 < 0 ? null : { x: Math.floor(x0 * k), y: Math.floor(y0 * k), width: Math.ceil((x1 - x0 + 1) * k), height: Math.ceil((y1 - y0 + 1) * k) };
  return { mean: sum / (w * h), box };
}

// A pair is a jump when its change is over 2 and over three times the
// larger of the changes either side of it: a pop, where motion around it is
// smooth. A cut is one too, and is the author's call.
const JUMP_FLOOR = 2, JUMP_RATIO = 3;
const isJump = (d, before, after) => d > JUMP_FLOOR && d > JUMP_RATIO * Math.max(before, after);

// Every frame is captured for the jumps at 320 px wide; the seam, the diff
// and isolate capture only the frames they compare, at 480. `o` holds seam,
// jumps, diff ([a, b]) and isolate (selectors); the result has a field for
// each asked for.
export async function motionPass(wf, px, o) {
  const s = wf.getStore('kinetic'), fps = s.fps, n = Math.max(1, Math.round(s.duration * fps)), last = n - 1;
  const { width } = sizeOf(rootOf());
  const grab = async (f, w) => { const d = shrink(await px.still(f / fps), w); return { l: luma(d), w: d.width, h: d.height, k: width / d.width }; };
  const pairOf = async (a, b, w) => { const A = await grab(a, w), B = await grab(b, w); return change(A.l, B.l, A.w, A.h, A.k); };
  const out = {};
  let worst = null;   // the pair isolate takes without a diff

  if (o.seam) {
    if (n >= 3) {
      const before = await pairOf(last - 1, last, 480), wrap = await pairOf(last, 0, 480), after = await pairOf(0, 1, 480);
      out.seam = { wrap, before: before.mean, after: after.mean, jump: isJump(wrap.mean, before.mean, after.mean) };
      if (out.seam.jump) worst = { a: last, b: 0, mean: wrap.mean };
    } else out.seam = null;
  }
  if (o.jumps) {
    const d = [];
    let prev = await grab(0, 320);
    for (let f = 1; f < n; f++) { const cur = await grab(f, 320); d.push(change(prev.l, cur.l, cur.w, cur.h, cur.k)); prev = cur; }
    out.jumps = [];
    // Against the usual change around it, the median of the three pairs
    // either side, so a frame that pops in and out (two large changes in a
    // row) is found as well as a cut.
    for (let i = 0; i < d.length; i++) {
      const near = [];
      for (let j = Math.max(0, i - 3); j <= Math.min(d.length - 1, i + 3); j++) if (j !== i) near.push(d[j].mean);
      near.sort((x, y) => x - y);
      const usual = near.length ? (near[(near.length - 1) >> 1] + near[near.length >> 1]) / 2 : 0;
      if (isJump(d[i].mean, usual, 0)) {
        out.jumps.push({ a: i, b: i + 1, mean: d[i].mean, box: d[i].box, usual });
        if (!worst || d[i].mean > worst.mean) worst = { a: i, b: i + 1, mean: d[i].mean };
      }
    }
  }
  if (o.diff) {
    const [a, b] = o.diff.map((f) => Math.min(last, f));
    out.diff = Object.assign({ a, b }, await pairOf(a, b, 480));
    worst = { a, b, mean: out.diff.mean };
  }
  if (o.isolate) {
    // The pair captured again with each selector hidden in turn: the one
    // that takes the change away is the layer that pops.
    if (!worst) out.isolate = { none: true };
    else {
      out.isolate = { a: worst.a, b: worst.b, mean: worst.mean, rows: [] };
      for (const selector of o.isolate) {
        let found = 0;
        try { found = document.querySelectorAll(selector).length; } catch (_) { found = -1; }
        let mean = null;
        if (found > 0) {
          const st = document.createElement('style');
          st.textContent = selector + '{visibility:hidden!important}';
          document.head.appendChild(st);
          try { mean = (await pairOf(worst.a, worst.b, 480)).mean; } finally { st.remove(); }
        }
        out.isolate.rows.push({ selector, found, mean, gone: mean !== null && worst.mean > 0 ? 1 - mean / worst.mean : null });
      }
    }
  }
  return out;
}

// ---- contrast -------------------------------------------------------------------

// WCAG 2's relative luminance of an sRGB color, 0 to 1.
function luminance(r, g, b) {
  const c = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

const TEXT_OFF = 'data-kinetic-check-text';

// A block's contrast at time t: the frame captured twice, as it is and with
// the block's text made transparent; the pixels around its own lines that
// change are its letters, and the second capture is what is behind each.
// The text's color is the median of the letters' cores (the quarter of them
// that changed most, where the edge's smoothing does not reach), and the
// block's contrast the WCAG ratio at its worst tenth of letter pixels, so a
// gradient or an image behind it is measured at its worst. The floor is
// 4.5:1, and 3:1 at 48 px and up. null for a block with too few letter
// pixels to measure. The finish and the shutter are off for both captures,
// so the text is measured as it is drawn.
export async function contrastOf(k, px, el, t) {
  await seekTo(k, t);
  const root = rootOf();
  if (!el.isConnected || !root) return null;
  const { R, s } = sizeOf(root);
  // The block's own text: the text nodes whose block it is.
  const own = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim() || !n.parentElement) continue;
    let b = n.parentElement;
    const svgText = b.closest('text');
    if (svgText && el.contains(svgText)) b = svgText;
    else while (b !== root && /^(inline|contents)/.test(getComputedStyle(b).display)) b = b.parentElement;
    if (b === el) own.push(n);
  }
  if (!own.length) return null;
  const range = document.createRange(), lines = [];
  for (const n of own) {
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width >= 1 && r.height >= 1) lines.push([(r.left - R.left) * s, (r.top - R.top) * s, (r.right - R.left) * s, (r.bottom - R.top) * s]);
  }
  if (!lines.length) return null;
  // Its size in the composition's pixels: the computed size times the
  // scale the element is drawn at.
  const p = own[0].parentElement, fs = parseFloat(getComputedStyle(p).fontSize);
  let scale = s;
  if (p instanceof SVGElement && p.getScreenCTM()) { const m = p.getScreenCTM(); scale = Math.hypot(m.a, m.b) * s; }
  else if (p.offsetWidth) scale = p.getBoundingClientRect().width / p.offsetWidth * s;
  const size = fs * scale;
  const cfg = k.config(), off = !!(cfg.finish || cfg.shutter);
  const sheet = document.createElement('style');
  sheet.textContent = '[' + TEXT_OFF + '],[' + TEXT_OFF + '] *{color:transparent!important;-webkit-text-fill-color:transparent!important;fill:transparent!important;stroke:transparent!important}';
  let shown, behind;
  if (off) k.config({ finish: false, shutter: false });
  try {
    shown = await px.still(t);
    document.head.appendChild(sheet);
    el.setAttribute(TEXT_OFF, '');
    behind = await px.still(t);
  } finally {
    el.removeAttribute(TEXT_OFF);
    sheet.remove();
    if (off) k.config({ finish: cfg.finish, shutter: cfg.shutter });
  }
  const x0 = Math.max(0, Math.floor(Math.min(...lines.map((l) => l[0])) - 2)), y0 = Math.max(0, Math.floor(Math.min(...lines.map((l) => l[1])) - 2));
  const x1 = Math.min(shown.width, Math.ceil(Math.max(...lines.map((l) => l[2])) + 2)), y1 = Math.min(shown.height, Math.ceil(Math.max(...lines.map((l) => l[3])) + 2));
  const w = x1 - x0, h = y1 - y0;
  if (w < 2 || h < 2) return null;
  const a = shown.getContext('2d').getImageData(x0, y0, w, h).data, b = behind.getContext('2d').getImageData(x0, y0, w, h).data;
  const inLine = (x, y) => lines.some((l) => x + x0 >= l[0] && x + x0 < l[2] && y + y0 >= l[1] && y + y0 < l[3]);
  const letters = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > 16 && inLine(x, y)) letters.push([i, d]);
  }
  if (letters.length < 20) return null;
  const cores = letters.slice().sort((m, n) => n[1] - m[1]).slice(0, Math.max(5, Math.floor(letters.length / 4)));
  const med = (c) => { const v = cores.map(([i]) => a[i + c]).sort((m, n) => m - n); return v[v.length >> 1]; };
  const ink = luminance(med(0), med(1), med(2));
  const ratios = letters.map(([i]) => { const g = luminance(b[i], b[i + 1], b[i + 2]); return (Math.max(ink, g) + 0.05) / (Math.min(ink, g) + 0.05); }).sort((m, n) => m - n);
  const ratio = Math.round(ratios[Math.floor(ratios.length / 10)] * 10) / 10;
  return { ratio, needs: size >= 48 ? 3 : 4.5, size: Math.round(size) };
}
