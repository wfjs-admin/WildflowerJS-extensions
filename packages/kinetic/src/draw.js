/**
 * draw(canvas, { scene, inks, …, strokes }): the drawn look, in pencil, pen
 * and ballpoint. Each stroke is a path a hand performs: slow at its ends and
 * fast in the middle (minimum jerk), wandering a little along its normal
 * (two layers of smooth noise, the arm's and the finger's), pressing in and
 * lifting off, thinner and lighter where it is fast. Pencil catches only the
 * peaks of the paper's tooth unless it is pressed hard; a ballpoint blobs
 * where it starts and skips where it is fast; a pen lays an even line. Ink
 * only adds up, and absorbs light as it does, so inks over each other
 * darken as real ones do.
 *
 *   const sheet = draw(canvas, { scene: this, start: 0.5,
 *     inks: { lead: { tool: 'pencil' }, pen: { tool: 'pen' }, red: { tool: 'pencil', color: '#c0392b' } },
 *     strokes: (s) => s
 *       .construct({ d: 'M…', ink: 'lead' })
 *       .contour({ d: 'M…', ink: 'pen' })
 *       .hatch({ clip: { path: 'M…' }, ink: 'red', angle: -50, spacing: 7 })
 *       .text({ text: 'Fig. 1', font: '600 64px Manrope', x: 120, y: 90, ink: 'pen' }) });
 *
 * The strokes are drawn in the order given, one after another from `start`
 * (s of the scene's local time with `scene: this`, else the composition
 * time), a pen lift between them; `at` pins one's start, `pause(s)` waits,
 * and `end` paces the strokes that follow one another so the last ends then,
 * a pinned one keeping its time. `drawn: true`
 * shows the drawing already drawn. Coordinates are CSS px of the canvas;
 * the hand's sizes and speeds are for a 1280 px wide composition and scale
 * with its data-width.
 *
 * The strokes are baked once, at the first draw, into each ink's amount,
 * pressure and the time each pixel was first inked; every frame is then
 * one WebGL pass that shows the ink laid by its time, so any seek order
 * draws the same pixels. The paper's tooth is fixed to the frame, not the
 * drawing: a drawing that moves (its canvas or an ancestor moved by CSS)
 * catches the paper anew as it moves, and costs nothing to move.
 * `paper` paints the sheet in a colour, blended normally; without it the
 * ink is multiplied onto what is under the canvas.
 *
 * Returns { duration, timeOf(group), set(params), redraw(), dispose() }:
 * duration is when the last stroke ends; timeOf(group) is { start, end } of
 * the strokes with that group (of the whole drawing without one), or null.
 * Errors: KN-100 for a bad call, ink or stroke, for more than 16 inks, and
 * for a canvas with no WebGL 2 context; KN-191 (development) when the
 * browser loses the context, which is drawn again once it is restored.
 */
import { CODES, fail, show, warn, openedContext } from './diagnostics.js';
import { clipName } from './clips.js';
import { parseColor } from './motion.js';
import { readPath, cubics } from './paths.js';
import { clipOf } from './shade.js';

// Each tool's ink, how dark it can get, its tip's radius in px, the ink a
// stamp lays and the speed at which that halves.
const TOOLS = {
  pencil: { color: '#4a4b51', dmax: 1.35, tip: 1.7, base: 0.16, v0: 1400 },
  pen: { color: '#222222', dmax: 1.9, tip: 1.15, base: 0.55, v0: 650 },
  ballpoint: { color: '#1c2f7a', dmax: 1.9, tip: 1.15, base: 0.24, v0: 650 },
};
// Each kind of stroke's hand speed in px a second, and its pressure.
const KINDS = { construct: [520, 0.25], contour: [300, 0.85], hatch: [700, 0.7], accent: [300, 1.05] };
const MAX_INKS = 16;
const PASSES = 4;   // the times a pixel is inked in one ink, each shown from its own time
const RATE = 240;   // the time map's most steps a second, fewer for a drawing over 273 s
const FADE = 0.06;  // s for a pixel's ink to come in
const OPTIONS = ['scene', 'inks', 'strokes', 'start', 'end', 'drawn', 'paper', 'wobble', 'pressure', 'speed', 'tooth', 'lead', 'seed'];
const STROKE = ['d', 'points', 'ink', 'pressure', 'at', 'group'];
const HATCH = ['clip', 'ink', 'angle', 'spacing', 'cross', 'pressure', 'at', 'group'];
const TEXT = ['text', 'font', 'x', 'y', 'ink', 'letter', 'at', 'group'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
// A font CSS can read: FontFaceSet.check() throws for one it cannot.
const fontReads = (f) => { try { if (typeof document !== 'undefined' && document.fonts) document.fonts.check(f); return true; } catch (_) { return false; } };
const isPoint = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const smooth = (u) => u * u * (3 - 2 * u);

// Integer hashes, the same on every machine, and 1-D value noise in -1..1.
function hash(i, s) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(s | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vn(x, s) {
  const i = Math.floor(x), f = x - i, u = smooth(f);
  return (hash(i, s) * (1 - u) + hash(i + 1, s) * u) * 2 - 1;
}
// Minimum jerk: the share of the length drawn at the share of the time, inverted.
const mj = (t) => t * t * t * (10 - 15 * t + 6 * t * t);
function mjInverse(u) {
  let lo = 0, hi = 1;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (mj(m) < u) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// A polyline's cumulative lengths, and its point and unit normal at s.
function measure(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}
function pointAt(pts, cum, s, cur) {
  let i = cur.i;
  while (i < cum.length - 2 && cum[i + 1] < s) i++;
  cur.i = i;
  const a = pts[i], b = pts[i + 1] || a, l = (cum[i + 1] - cum[i]) || 1, t = Math.min(1, Math.max(0, (s - cum[i]) / l));
  const tx = (b[0] - a[0]) / l, ty = (b[1] - a[1]) / l;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, -ty, tx];
}

// SVG path data as polylines, a point every 4 px or so: [{ pts, closed }].
function polylines(d, where) {
  const cmds = typeof d === 'string' ? readPath(d) : 0;
  if (typeof cmds === 'number') throw fail(CODES.BAD_CALL, where + '{ d })', __DEV__ && 'd is SVG path data' + (typeof d === 'string' ? ', and the grammar stops at character ' + cmds + ' of it' : ', not ' + show(d)));
  return cubics(cmds).map((s) => {
    const pts = [s.s];
    let p = s.s;
    for (const c of s.c) {
      const n = Math.max(1, Math.ceil((Math.hypot(c[0] - p[0], c[1] - p[1]) + Math.hypot(c[2] - c[0], c[3] - c[1]) + Math.hypot(c[4] - c[2], c[5] - c[3])) / 4));
      for (let j = 1; j <= n; j++) {
        const t = j / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, e = 3 * u * t * t, f = t * t * t;
        pts.push([a * p[0] + b * c[0] + e * c[2] + f * c[4], a * p[1] + b * c[1] + e * c[3] + f * c[5]]);
      }
      p = c.slice(4);
    }
    return { pts, closed: s.closed };
  }).filter((l) => l.pts.length > 1);
}

// A clip's box, [x, y, w, h]: a shape's own, or the canvas's for a Path2D.
function boxOf(c, cw, ch) {
  if (typeof Path2D !== 'undefined' && c instanceof Path2D) return [0, 0, cw, ch];
  if (c.circle) return [c.circle[0] - c.circle[2], c.circle[1] - c.circle[2], 2 * c.circle[2], 2 * c.circle[2]];
  if (c.rect) {
    const [x, y, w, h] = c.rect;
    return [Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h)];
  }
  const pts = c.polygon || (typeof c.path === 'string' ? cubics(readPath(c.path)).flatMap((s) => [s.s].concat(s.c.flatMap((q) => [q.slice(0, 2), q.slice(2, 4), q.slice(4)]))) : null);
  if (!pts || !pts.length) return [0, 0, cw, ch];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

// The paper's tooth at a frame pixel: white noise blurred by two 3 x 3 box
// passes (a 5 x 5 tent), stretched about the middle; and the pass that shows
// each ink laid by time t, absorbing light. An ink's layers (its passes)
// are each shown from their own time and added up before the ink darkens.
const VS = '#version 300 es\nvoid main(){gl_Position=vec4(vec2(gl_VertexID&1,gl_VertexID>>1)*4.-1.,0,1);}';
const FS = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2DArray S;
uniform int n;
uniform int inkOf[${MAX_INKS * PASSES}];
uniform float t, H, toothAmt, drawn, papered, base, rate;
uniform vec2 off;
uniform float k;
uniform uint seed;
uniform vec3 paper;
uniform vec3 K[16];
uniform float D[16], pencil[16];
out vec4 o;
float h(ivec2 p) {
  uint x = (uint(p.x) * 374761393u) ^ (uint(p.y) * 668265263u) ^ (seed * 2654435761u);
  x = (x ^ (x >> 13u)) * 1274126177u;
  return float(x ^ (x >> 16u)) / 4294967296.;
}
float tooth;
vec3 inked(int i, float a, float pm) {
  float g = clamp(3. * (tooth - (1. - pm * .9)) + .2, 0., 1.);
  float dn = pencil[i] > .5 ? a * (toothAmt * g + (1. - toothAmt) * .6) : a * (.6 + .4 * (toothAmt * tooth + (1. - toothAmt) * .5));
  return min(dn / D[i], 1.) * K[i];
}
void main() {
  ivec2 c = ivec2(gl_FragCoord.x, H - gl_FragCoord.y);
  ivec2 p = ivec2(floor(off + (vec2(c) + .5) * k));
  float s0 = 0.;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) s0 += (3. - abs(float(x))) * (3. - abs(float(y))) * h(p + ivec2(x, y));
  tooth = clamp((s0 / 81. - .5) * 2.65 + .5, 0., 1.);
  vec3 sum = vec3(0);
  int cur = -1;
  float a = 0., pm = 0.;
  for (int i = 0; i < ${MAX_INKS * PASSES}; i++) {
    if (i >= n) break;
    if (inkOf[i] != cur) { if (cur >= 0) sum += inked(cur, a, pm); cur = inkOf[i]; a = 0.; pm = 0.; }
    vec4 v = texelFetch(S, ivec3(c, i), 0);
    if (v.r == 0.) continue;
    float at = base + (floor(v.b * 255. + .5) * 256. + floor(v.a * 255. + .5)) / rate;
    float shown = drawn > .5 ? 1. : clamp((t - at) / ${FADE}, 0., 1.);
    a += v.r * v.r * 4. * shown;
    if (shown > 0.) pm = max(pm, v.g);
  }
  if (cur >= 0) sum += inked(cur, a, pm);
  vec3 col = exp(-sum);
  if (papered > .5) o = vec4(paper * (.965 + .035 * tooth) * col, 1);
  else { float al = 1. - min(col.r, min(col.g, col.b)); o = vec4(col - 1. + al, al); }
}`;

export function createDraw(wf, clock, scenes) {
  const live = new Set();
  // One drawing a canvas: a second would share its context and paint over
  // the first every frame.
  const onCanvas = new WeakSet();

  // Each value checked; the sheet's options, with the defaults.
  function optionsOf(o, pre) {
    const v = { start: 0, end: undefined, drawn: false, paper: null, wobble: 1, pressure: 0.85, speed: 1, tooth: 0.7, lead: 1, seed: 7 };
    for (const key in o) {
      if (!OPTIONS.includes(key)) throw fail(CODES.BAD_CALL, pre + '{ ' + key + ' })', __DEV__ && "'" + key + "' is not an option; the options are " + OPTIONS.join(', '));
      const x = o[key];
      const need = (ok, what) => { if (!ok) throw fail(CODES.BAD_CALL, pre + '{ ' + key + ' })', __DEV__ && key + ' is ' + what + ', not ' + show(x)); };
      if (key === 'start') need(isNum(x) && x >= 0, __DEV__ && 'a time in s, 0 or more');
      else if (key === 'end') need(x === undefined || isNum(x), __DEV__ && 'a time in s after start');
      else if (key === 'drawn') need(typeof x === 'boolean', __DEV__ && 'true or false');
      else if (key === 'paper') { need(x == null || parseColor(x), __DEV__ && 'a colour, or null for none'); v.paper = x == null ? null : parseColor(x); continue; }
      else if (key === 'tooth') need(isNum(x) && x >= 0 && x <= 1, __DEV__ && 'a number from 0 to 1');
      else if (key === 'wobble') need(isNum(x) && x >= 0, __DEV__ && 'a number, 0 or more (1 is a steady hand)');
      else if (key === 'pressure' || key === 'speed' || key === 'lead') need(isNum(x) && x > 0, __DEV__ && 'a number above 0 (1 is the default hand)');
      else if (key === 'seed') need(isNum(x) && x % 1 === 0, __DEV__ && 'a whole number');
      else continue;
      v[key] = x;
    }
    if (v.end !== undefined && !(v.end > v.start)) throw fail(CODES.BAD_CALL, pre + '{ end })', __DEV__ && 'end is a time in s after start (' + v.start + '), not ' + show(v.end));
    return v;
  }

  // The inks, checked: [{ name, color: [r, g, b], tool }].
  function inksOf(x, pre) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) throw fail(CODES.BAD_CALL, pre + '{ inks })', __DEV__ && "inks names each ink, { lead: { tool: 'pencil' }, red: { tool: 'pencil', color: '#c0392b' } }, not " + show(x));
    const names = Object.keys(x);
    if (!names.length || names.length > MAX_INKS) throw fail(CODES.BAD_CALL, pre + '{ inks })', __DEV__ && 'a drawing has from 1 to ' + MAX_INKS + ' inks, not ' + names.length);
    return names.map((name) => {
      const ink = x[name] || {};
      const where = pre + '{ inks: { ' + name + ': { ';
      for (const k in ink) if (k !== 'tool' && k !== 'color') throw fail(CODES.BAD_CALL, where + k + ' } } })', __DEV__ && 'an ink is { tool, color }');
      const tool = ink.tool === undefined ? 'pencil' : ink.tool;
      if (!TOOLS[tool]) throw fail(CODES.BAD_CALL, where + 'tool } } })', __DEV__ && "tool is 'pencil', 'pen' or 'ballpoint', not " + show(ink.tool));
      const c = parseColor(ink.color === undefined ? TOOLS[tool].color : ink.color);
      if (!c) throw fail(CODES.BAD_CALL, where + 'color } } })', __DEV__ && 'color is a colour, not ' + show(ink.color));
      return { name, tool, color: c.slice(0, 3).map((u) => u / 255) };
    });
  }

  // The strokes planned: the builder's calls, checked, as items in order.
  function plan(fn, inks, pre) {
    if (typeof fn !== 'function') throw fail(CODES.BAD_CALL, pre + '{ strokes })', __DEV__ && 'strokes is a function (s) => s.contour({ … }) … that plans the drawing, not ' + show(fn));
    const items = [];
    const inkOf = (o, call) => {
      const i = inks.findIndex((k) => k.name === o.ink);
      if (i < 0) throw fail(CODES.BAD_CALL, call + '({ ink })', __DEV__ && 'ink is the name of one of the inks (' + inks.map((k) => k.name).join(', ') + '), not ' + show(o.ink));
      return i;
    };
    const common = (o, call, keys) => {
      if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL, call + '(options)', __DEV__ && 'options is an object, not ' + show(o));
      for (const k in o) if (!keys.includes(k)) throw fail(CODES.BAD_CALL, call + '({ ' + k + ' })', __DEV__ && "'" + k + "' is not an option here; the options are " + keys.join(', '));
      for (const k of ['pressure', 'at']) if (o[k] !== undefined && !(isNum(o[k]) && o[k] >= 0)) throw fail(CODES.BAD_CALL, call + '({ ' + k + ' })', __DEV__ && k + ' is a number, 0 or more, not ' + show(o[k]));
      return { ink: inkOf(o, call), at: o.at, group: o.group === undefined ? null : String(o.group) };
    };
    const lines = (o, call) => {
      if (o.points !== undefined) {
        if (!Array.isArray(o.points) || o.points.length < 2 || !o.points.every(isPoint)) throw fail(CODES.BAD_CALL, call + '({ points })', __DEV__ && 'points is two or more [x, y] points, not ' + show(o.points));
        return [{ pts: o.points.map((p) => p.slice()), closed: false }];
      }
      if (o.d === undefined) throw fail(CODES.BAD_CALL, call + '({ d, points })', __DEV__ && 'a stroke needs d, SVG path data, or points, [[x, y], …]');
      return polylines(o.d, call + '(');
    };
    const stroke = (kind) => (o) => {
      const keys = kind === 'contour' ? STROKE.concat('twice') : STROKE;
      const c = common(o, kind, keys);
      const twice = kind === 'contour' && o.twice !== false;
      for (const l of lines(o, kind)) items.push(Object.assign({ kind, lines: l, twice, pressure: o.pressure === undefined ? KINDS[kind][1] : o.pressure }, c));
      return s;
    };
    const s = {
      construct: stroke('construct'),
      contour: stroke('contour'),
      accent: stroke('accent'),
      hatch(o) {
        const c = common(o, 'hatch', HATCH);
        if (o.clip === undefined) throw fail(CODES.BAD_CALL, 'hatch({ clip })', __DEV__ && 'hatching needs a clip, the shape it fills');
        const path = clipOf(o.clip, 'hatch(');
        for (const k of ['angle', 'spacing']) if (o[k] !== undefined && !(isNum(o[k]) && (k === 'angle' || o[k] > 0))) throw fail(CODES.BAD_CALL, 'hatch({ ' + k + ' })', __DEV__ && k + ' is a number' + (k === 'spacing' ? ' of px above 0' : ' of degrees') + ', not ' + show(o[k]));
        items.push(Object.assign({ kind: 'hatch', clip: o.clip, path, angle: o.angle === undefined ? -50 : o.angle, spacing: o.spacing === undefined ? 7 : o.spacing,
          cross: !!o.cross, pressure: o.pressure === undefined ? KINDS.hatch[1] : o.pressure }, c));
        return s;
      },
      text(o) {
        const c = common(o, 'text', TEXT);
        if (typeof o.text !== 'string') throw fail(CODES.BAD_CALL, 'text({ text })', __DEV__ && 'text is a string, not ' + show(o.text));
        if (typeof o.font !== 'string' || !fontReads(o.font)) throw fail(CODES.BAD_CALL, 'text({ font })', __DEV__ && "font is a CSS font with a size and a family, '600 64px Manrope', not " + show(o.font));
        if (!isNum(o.x) || !isNum(o.y)) throw fail(CODES.BAD_CALL, 'text({ x, y })', __DEV__ && 'x and y are the start of its baseline, in px');
        if (o.letter !== undefined && !(isNum(o.letter) && o.letter > 0)) throw fail(CODES.BAD_CALL, 'text({ letter })', __DEV__ && 'letter is the s each letter takes, above 0, not ' + show(o.letter));
        items.push(Object.assign({ kind: 'text', text: o.text, font: o.font, x: o.x, y: o.y, letter: o.letter === undefined ? 0.11 : o.letter }, c));
        return s;
      },
      pause(t) {
        if (!(isNum(t) && t >= 0)) throw fail(CODES.BAD_CALL, 'pause(s)', __DEV__ && 's is a number of seconds, 0 or more, not ' + show(t));
        items.push({ kind: 'pause', t });
        return s;
      },
    };
    fn(s);
    return items;
  }

  function draw(canvas, options, extra) {
    if (!canvas || canvas.localName !== 'canvas') throw fail(CODES.BAD_CALL, 'draw(canvas)', __DEV__ && 'canvas is a <canvas> element, not ' + show(canvas));
    if (!options || typeof options !== 'object') throw fail(CODES.BAD_CALL, 'draw(canvas, options)', __DEV__ && 'options is { inks, …, strokes }, not ' + show(options));
    if (extra !== undefined) throw fail(CODES.BAD_CALL, 'draw(canvas, options, strokes)', __DEV__ && 'the strokes go in the options: { …, strokes: (s) => … }');
    if (onCanvas.has(canvas)) throw fail(CODES.BAD_CALL, 'draw(canvas)', __DEV__ && 'the canvas already has a drawing; dispose() it first, or give this drawing a canvas of its own');
    const el = scenes.sceneOf(options.scene, 'draw(canvas, ');
    let o = Object.assign({}, options);
    let v, inks, items, sched;
    let baked = '', gl = null, prog = null, tex = null, at = null, layout = null;

    // Every stroke's polyline, start and length in time, in order; hatching
    // made into its lines here, which needs the canvas's size for a Path2D clip:
    // before the canvas has a layout, the composition's, which a canvas over
    // the whole stage has, so the plan and its times hold once it is drawn.
    function schedule() {
      const root = canvas.closest('[data-composition-id]');
      const S = (root && Number(root.getAttribute('data-width')) || 1280) / 1280;
      const cw = canvas.clientWidth || (root && Number(root.getAttribute('data-width'))) || 0;
      const ch = canvas.clientHeight || (root && Number(root.getAttribute('data-height'))) || 0;
      const list = [], texts = [];
      // `last` is the end of the strokes that follow one another, which end paces.
      let clock0 = v.start, n = 0, last = v.start;
      const add = (it, t1) => { if (it.at === undefined) last = Math.max(last, t1); };
      // One stroke on the clock, or pinned at `at`; returns its end.
      const put = (it, pts, kind, pressure, t0) => {
        const cum = measure(pts), L = cum[cum.length - 1];
        if (L < 1) return t0;
        const T = Math.max(0.08, L / (KINDS[kind][0] * S * v.speed));
        list.push({ k: it.ink, pts, cum, L, T, t0, kind, pressure: pressure * v.pressure, seed: v.seed * 977 + n * 31, it });
        n++;
        add(it, t0 + T);
        return t0 + T + (0.07 + 0.05 * hash(n, 3)) / v.speed;
      };
      for (const it of items) {
        if (it.kind === 'pause') { clock0 += it.t; continue; }
        let t = it.at === undefined ? clock0 : it.at;
        if (it.kind === 'text') {
          let d = 0;
          for (const ch of Array.from(it.text)) d += ch.trim() ? it.letter : it.letter * 0.4;
          texts.push({ it, t0: t, d });
          add(it, t + d);
          t += d + 0.12;
        } else if (it.kind === 'hatch') {
          for (const [angle, spacing, pr] of it.cross ? [[it.angle, it.spacing, 1], [it.angle + 85, it.spacing * 1.15, 0.9]] : [[it.angle, it.spacing, 1]]) {
            for (const line of hatchLines(it, angle * Math.PI / 180, spacing * S, S, cw, ch)) t = put(it, line.pts, 'hatch', it.pressure * pr * line.press, t);
          }
        } else {
          const { pts, closed } = it.lines;
          // A closed outline runs on a little past its start, as a hand closing it does.
          const run = closed ? pts.concat(pts.slice(1, Math.max(2, Math.ceil(pts.length * 0.04)))) : pts;
          t = put(it, run, it.kind, it.pressure, t);
          // The second pass: a little off the first, along most of it, never quite closing.
          if (it.twice) {
            const cum = measure(pts), L = cum[cum.length - 1], cur = { i: 0 }, off = (1.2 + hash(n, 61)) * S;
            const second = [];
            for (let s = L * 0.08; s <= L * 0.88; s += 4 * S) { const q = pointAt(pts, cum, s, cur); second.push([q[0] + q[2] * off, q[1] + q[3] * off]); }
            if (second.length > 1) t = put(it, second, it.kind, it.pressure * 1.1, t);
          }
        }
        if (it.at === undefined) clock0 = t;
      }
      // end paces the hand so the last stroke that follows the others ends
      // then; a stroke pinned with at keeps its time and its speed.
      const pace = v.end === undefined || last <= v.start ? 1 : (v.end - v.start) / (last - v.start);
      const scale = (x) => v.start + (x - v.start) * pace;
      for (const e of list.concat(texts)) {
        e.pace = e.it.at === undefined ? pace : 1;
        if (e.pace !== 1) { e.t0 = scale(e.t0); if (e.T) e.T *= pace; }
      }
      // The groups, the first time and the end, from the strokes as paced.
      const groups = {};
      let first = v.start, end = v.start;
      for (const e of list.concat(texts)) {
        const t0 = e.t0, t1 = e.t0 + (e.T || e.d * e.pace), key = e.it.group;
        first = Math.min(first, t0);
        end = Math.max(end, t1);
        if (key) groups[key] = groups[key] ? [Math.min(groups[key][0], t0), Math.max(groups[key][1], t1)] : [t0, t1];
      }
      sched = { list, texts, groups, first, end, S, start: v.start };
    }

    // Hatching: parallel lines across the clip, a line for each run inside
    // it (two for a line that crosses two parts of it), spacing apart with a little jitter, overshoot and angle drift.
    function hatchLines(it, angle, sp, S, cw, ch) {
      const [bx, by, bw, bh] = boxOf(it.clip, cw || 1280, ch || 720);
      const pad = 4, w = Math.max(1, Math.ceil(bw + pad * 2)), hgt = Math.max(1, Math.ceil(bh + pad * 2));
      const m = document.createElement('canvas');
      m.width = w; m.height = hgt;
      const c = m.getContext('2d', { willReadFrequently: true });
      c.translate(pad - bx, pad - by);
      c.fill(it.path);
      const px = c.getImageData(0, 0, w, hgt).data;
      const inside = (x, y) => {
        const ix = Math.floor(x - bx + pad), iy = Math.floor(y - by + pad);
        return ix >= 0 && iy >= 0 && ix < w && iy < hgt && px[(iy * w + ix) * 4 + 3] > 127;
      };
      const cx = bx + bw / 2, cy = by + bh / 2, R = Math.hypot(bw, bh) / 2 + 4, out = [];
      let n = 0;
      for (let off = -R; off <= R; off += sp * (0.8 + 0.4 * hash(n, 41))) {
        const a = angle + 0.05 * vn(off * 0.05, 5);
        const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
        const runs = [];
        let run = null;
        for (let s = -R; s <= R; s += 2) {
          if (inside(cx + nx * off + ux * s, cy + ny * off + uy * s)) { if (!run) run = [s, s]; else run[1] = s; }
          else if (run) { runs.push(run); run = null; }
        }
        if (run) runs.push(run);
        n++;
        const p = (s) => [cx + nx * off + ux * s, cy + ny * off + uy * s];
        runs.forEach((r, m) => {
          if (r[1] - r[0] < 4 * S) return;
          const q = n + 7919 * m;
          const s0 = r[0] + 3 * S * hash(q, 43), s1 = r[1] + S * (-1 + 4 * hash(q, 47));
          out.push({ pts: [p(s0), p((s0 + s1) / 2), p(s1)], press: 0.85 + 0.3 * hash(q, 53) });
        });
      }
      return out;
    }

    // The bake: for each ink, each pass over a pixel (the strokes that ink it
    // at one time; a later stroke over it is another pass) as its amount,
    // peak pressure and first-inked time, packed as RGBA8 layers, a layer for
    // each pass an ink has somewhere (the amount's square root, the pressure,
    // the time's two bytes from the drawing's first time, at `rate` steps a
    // second). A pixel inked more than PASSES times adds the rest to its last.
    function bake(W, H) {
      const N = W * H, nk = inks.length, S = sched.S, KP = PASSES;
      let base = Infinity;
      for (const st of sched.list) base = Math.min(base, st.t0);
      for (const tx of sched.texts) base = Math.min(base, tx.t0);
      if (!Number.isFinite(base)) base = 0;
      const rate = Math.min(RATE, 65535 / Math.max(1e-3, sched.end - base));
      const A = new Float32Array(N * KP), P = new Float32Array(N * KP), T = new Float32Array(N * KP);
      const count = new Uint8Array(N), who = new Int32Array(N), passOf = new Uint8Array(N);
      const layers = [], inkOf = [];
      // A stroke's (or a letter's) ink at pixel i: added to its own pass
      // there, or to a pass within FADE of its time, or a new pass. `most`
      // keeps the most, for text, where the rest add up.
      let id = 0;
      const put = (i, amt, pr, time, most) => {
        let p;
        if (who[i] === id) p = passOf[i];
        else {
          p = -1;
          for (let q = 0; q < count[i]; q++) if (Math.abs(T[i * KP + q] - time) < FADE) { p = q; break; }
          if (p < 0) {
            if (count[i] < KP) { p = count[i]++; T[i * KP + p] = time; }
            else p = KP - 1;
          }
          who[i] = id;
          passOf[i] = p;
        }
        const j = i * KP + p;
        if (most) A[j] = Math.max(A[j], amt);
        else A[j] += amt;
        if (pr > P[j]) P[j] = pr;
        if (time < T[j]) T[j] = time;
      };
      const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
      for (let k = 0; k < nk; k++) {
        A.fill(0); P.fill(0); count.fill(0); who.fill(-1);
        for (const st of sched.list) {
          if (st.k !== k) continue;
          id++;
          const tool = TOOLS[inks[k].tool], pencil = inks[k].tool === 'pencil', ball = inks[k].tool === 'ballpoint';
          const r = tool.tip * S * v.lead, ds = Math.max(0.4, r * 0.35), cur = { i: 0 };
          const wob = v.wobble * (st.kind === 'hatch' ? 0.6 : 1);
          for (let s = 0; s <= st.L; s += ds) {
            const tau = mjInverse(s / st.L);
            // The hand's speed at its own pace, so `end` does not change the ink it lays.
            const vel = st.L / st.T * 30 * tau * tau * (1 - tau) * (1 - tau) * st.pace;
            const q = pointAt(st.pts, st.cum, s, cur);
            const w = wob * S * (2.2 * vn(s / (90 * S), st.seed) + 0.35 * vn(s / (7 * S), st.seed + 9));
            const taper = smooth(Math.max(0, Math.min(1, tau / 0.08) * Math.min(1, (1 - tau) / 0.18)));
            const pr = st.pressure * (0.4 + 0.6 * taper) * (0.9 + 0.1 * vn(s / (40 * S), st.seed + 3));
            let flow = 1 / (1 + vel / (S * tool.v0)), rr = r * (0.75 + 0.25 * Math.min(1, pr));
            if (ball) {
              if (tau < 0.03) { rr *= 1.5; flow *= 1.8; }
              if (vn(s / (9 * S), st.seed + 17) > 0.8 - 0.35 * Math.min(1, vel / (1600 * S))) continue;
            }
            const x = q[0] + q[2] * w, y = q[1] + q[3] * w, time = st.t0 + tau * st.T;
            let lay = tool.base * flow * (pencil ? 1 : Math.min(1, pr + 0.3));
            // A tip under 0.75 px can miss every pixel's center, so it is laid
            // at 0.75 px, its ink thinned by the width alone (by the area it
            // washed a small drawing out): a thin line stays whole and dark.
            if (rr < 0.75) { lay *= rr / 0.75; rr = 0.75; }
            const x0 = Math.max(0, Math.floor(x - rr)), x1 = Math.min(W - 1, Math.ceil(x + rr));
            const y0 = Math.max(0, Math.floor(y - rr)), y1 = Math.min(H - 1, Math.ceil(y + rr));
            for (let py = y0; py <= y1; py++) {
              const dy = py + 0.5 - y;
              for (let px = x0; px <= x1; px++) {
                const d = Math.hypot(px + 0.5 - x, dy);
                if (d < rr) put(py * W + px, (1 - d / rr) * lay, pr, time);
              }
            }
          }
        }
        // Text: each letter's pixels inked in writing order along its center line.
        for (const { it, t0, pace } of sched.texts) {
          if (it.ink !== k) continue;
          // The size in px as the canvas reads the font back, for one given
          // in pt, rem or em.
          c.font = it.font;
          const size = parseFloat((/(\d+(?:\.\d+)?)px/.exec(c.font) || [0, 16])[1]);
          const chars = Array.from(it.text), dmax = TOOLS[inks[k].tool].dmax;
          let t = t0;
          chars.forEach((chr, ci) => {
            const step = it.letter * pace;
            if (!chr.trim()) { t += step * 0.4; return; }
            c.font = it.font;
            const x = it.x + c.measureText(chars.slice(0, ci).join('')).width, y = it.y;
            const pad = Math.ceil(size * 0.3), w = Math.ceil(c.measureText(chr).width + pad * 2), h = Math.ceil(size * 1.5), top = Math.round(size * 1.1);
            c.canvas.width = w; c.canvas.height = h;
            c.font = it.font;
            c.textBaseline = 'alphabetic';
            c.fillText(chr, pad + x - Math.floor(x), top + y - Math.floor(y));
            const px = c.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) mask[i] = px[i * 4 + 3] > 110 ? 1 : 0;
            const order = writingOrder(mask, w, h), X = Math.floor(x) - pad, Y = Math.floor(y) - top;
            id++;
            for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
              const a = px[(yy * w + xx) * 4 + 3] / 255, gx = X + xx, gy = Y + yy;
              if (a <= 0 || gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
              put(gy * W + gx, a * dmax / 0.85, 1, t + step * (order[yy * w + xx] >= 0 ? order[yy * w + xx] : 1), true);
            }
            t += step;
          });
        }
        // The ink's layers, as many as the most passes over any one pixel.
        let used = 0;
        for (let i = 0; i < N; i++) if (count[i] > used) used = count[i];
        for (let p = 0; p < used; p++) {
          const out = new Uint8Array(N * 4);
          for (let i = 0; i < N; i++) {
            const j = i * KP + p;
            if (!(A[j] > 0)) continue;
            const tq = Math.max(0, Math.min(65535, Math.round((T[j] - base) * rate)));
            out[i * 4] = Math.max(1, Math.round(Math.sqrt(Math.min(A[j], 4) / 4) * 255));
            out[i * 4 + 1] = Math.round(Math.min(1, P[j]) * 255);
            out[i * 4 + 2] = tq >> 8;
            out[i * 4 + 3] = tq & 255;
          }
          layers.push(out);
          inkOf.push(k);
        }
      }
      if (!layers.length) { layers.push(new Uint8Array(N * 4)); inkOf.push(0); }
      const data = new Uint8Array(N * 4 * layers.length);
      layers.forEach((l, i) => data.set(l, i * N * 4));
      return { data, n: layers.length, inkOf, base, rate };
    }

    // The program and texture, on the canvas's context: at the first draw,
    // and again once a lost context is restored.
    function setup() {
      prog = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(prog, sh);
      }
      gl.linkProgram(prog);
      gl.useProgram(prog);
      at = {};
      for (const u of ['S', 'n', 'inkOf', 't', 'H', 'toothAmt', 'drawn', 'papered', 'base', 'rate', 'off', 'k', 'seed', 'paper', 'K', 'D', 'pencil']) at[u] = gl.getUniformLocation(prog, u);
      tex = gl.createTexture();
    }

    // The frame at the clock's time: baked when the canvas's size or the
    // drawing changed, then the one pass.
    const sheet = {
      el,
      draw() {
        if (!canvas.isConnected) return;
        const cw = canvas.clientWidth, ch = canvas.clientHeight;
        if (!cw || !ch) return;
        if (gl.isContextLost()) return;
        if (!prog) setup();
        // Text written in a font still loading is baked again once it has loaded.
        const id = cw + ' ' + ch + ' ' + sheet.fonts().map(([f, s]) => (document.fonts && document.fonts.check(f, s) ? 1 : 0)).join('');
        if (baked !== id) {
          if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
          if (!sched || sched.cw !== cw || sched.ch !== ch) { schedule(); sched.cw = cw; sched.ch = ch; }
          layout = bake(cw, ch);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
          gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
          gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, cw, ch, layout.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, layout.data);
          layout.data = null;
          baked = id;
        }
        // The frame pixel under the canvas's top left, and frame px per canvas px.
        const root = canvas.closest('[data-composition-id]');
        let off = [0, 0], k = 1;
        if (root) {
          const r = canvas.getBoundingClientRect(), q = root.getBoundingClientRect();
          const f = q.width / (Number(root.getAttribute('data-width')) || q.width || 1) || 1;
          off = [(r.left - q.left) / f, (r.top - q.top) / f];
          k = r.width / f / cw || 1;
        }
        const now = clock.now(), t = el ? scenes.localOf(el, now) : now;
        const ref = v.paper ? v.paper.slice(0, 3).map((u) => u / 255) : [1, 1, 1];
        const K = new Float32Array(48), D = new Float32Array(16), pen = new Float32Array(16);
        inks.forEach((ink, i) => {
          const tool = TOOLS[ink.tool];
          ink.color.forEach((c, j) => { K[i * 3 + j] = -Math.log(Math.max(c, 0.004) / Math.max(ref[j], 0.004)) * tool.dmax; });
          D[i] = tool.dmax;
          pen[i] = ink.tool === 'pencil' ? 1 : 0;
        });
        gl.useProgram(prog);
        gl.viewport(0, 0, cw, ch);
        gl.uniform1i(at.S, 0);
        gl.uniform1i(at.n, layout.n);
        const inkOf = new Int32Array(MAX_INKS * PASSES);
        inkOf.set(layout.inkOf);
        gl.uniform1iv(at.inkOf, inkOf);
        gl.uniform1f(at.base, layout.base);
        gl.uniform1f(at.rate, layout.rate);
        gl.uniform1f(at.t, t);
        gl.uniform1f(at.H, ch);
        gl.uniform1f(at.toothAmt, v.tooth);
        gl.uniform1f(at.drawn, v.drawn ? 1 : 0);
        gl.uniform1f(at.papered, v.paper ? 1 : 0);
        gl.uniform2f(at.off, off[0], off[1]);
        gl.uniform1f(at.k, k);
        gl.uniform1ui(at.seed, v.seed >>> 0);
        gl.uniform3fv(at.paper, ref);
        gl.uniform3fv(at.K, K);
        gl.uniform1fv(at.D, D);
        gl.uniform1fv(at.pencil, pen);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      // The context is kept while the canvas is on the page, cleared, for a
      // draw() on it again (a scene brought back); one off the page is let go.
      dispose() {
        if (!live.delete(sheet)) return;
        onCanvas.delete(canvas);
        canvas.removeEventListener('webglcontextlost', lost);
        canvas.removeEventListener('webglcontextrestored', restored);
        if (gl.isContextLost()) return;
        if (prog) { gl.deleteTexture(tex); gl.deleteProgram(prog); prog = null; }
        if (canvas.isConnected) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        } else {
          const lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        }
      },
      fonts: () => (items || []).filter((it) => it.kind === 'text').map((it) => [it.font, it.text]),
    };

    // The options read, the inks and the strokes planned; the times are
    // worked out now, for duration and timeOf(), and again at the bake.
    function take(pre) {
      v = optionsOf(o, pre);
      inks = inksOf(o.inks, pre);
      items = plan(o.strokes, inks, pre);
      schedule();
      baked = '';
      canvas.style.mixBlendMode = v.paper ? 'normal' : 'multiply';
    }
    take('draw(canvas, ');
    gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: true });
    if (!gl || gl.isContextLost()) throw fail(CODES.BAD_CALL, 'draw(canvas): WebGL 2', __DEV__ && 'the canvas has no WebGL 2 context; a canvas with a 2D or WebGL 1 context, or one taken off the page after its drawing was disposed, cannot have one, and a browser can have WebGL 2 turned off');
    if (__DEV__) openedContext(gl);
    // A lost context draws nothing until the browser restores it, and is
    // set up again then.
    const lost = (e) => {
      e.preventDefault();
      if (__DEV__) {
        warn(CODES.CONTEXT_LOST, 'the WebGL context of ' + clipName(canvas) + "'s drawing was lost, so it draws nothing until the browser restores it; a browser drops the oldest context when a page holds too many",
          'Give each drawing { scene: this }, which disposes it with its scene, or call dispose() on those you no longer draw, and keep the number of WebGL canvases low.');
      }
    };
    const restored = () => { prog = null; baked = ''; };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    live.add(sheet);
    onCanvas.add(canvas);

    const handle = {
      get duration() { return sched.end; },
      timeOf(group) {
        if (group === undefined) return { start: sched.first, end: sched.end };
        const g = sched.groups[String(group)];
        return g ? { start: g[0], end: g[1] } : null;
      },
      // New options: the drawing planned and baked again.
      set(p) {
        if (!p || typeof p !== 'object') throw fail(CODES.BAD_CALL, 'set(params)', __DEV__ && 'the parameters are an object, not ' + show(p));
        if ('scene' in p) throw fail(CODES.BAD_CALL, 'set({ scene })', __DEV__ && 'scene is set when the drawing is made');
        const was = o;
        o = Object.assign({}, o, p);
        try { take('set('); } catch (e) { o = was; take('set('); throw e; }
        return handle;
      },
      // The strokes planned again, for strokes that read something that changed.
      redraw() {
        take('draw(canvas, ');
        return handle;
      },
      dispose: () => sheet.dispose(),
    };
    return handle;
  }

  // Every drawing, once a seek has landed; each drawn even when one throws.
  function drawAll() {
    let failed = null;
    for (const s of live) {
      try { s.draw(); } catch (e) { if (!failed) failed = e; }
    }
    if (failed) throw failed;
  }
  clock.onLanded(drawAll);
  wf.hook('component:beforeDestroy', (inst) => {
    for (const s of live) if (s.el && s.el === inst.element) s.dispose();
  });

  return {
    draw,
    drawAll,
    // At readiness, check() and render(): the fonts the drawings' text is written in.
    load: () => (typeof document !== 'undefined' && document.fonts ? Promise.all(Array.from(live).flatMap((s) => s.fonts()).map(([f, t]) => document.fonts.load(f, t).catch(() => {}))) : Promise.resolve()),
  };
}

// A letter's center line (Zhang-Suen thinning of its mask) walked from its
// upper-left end, so each pixel of the letter takes the time the pen passes
// its nearest point on that line. Returns order[i] in 0..1 for every mask
// pixel (-1 off the letter).
function writingOrder(mask, w, h) {
  const sk = mask.slice(), N = w * h;
  const nb = (i) => {
    const x = i % w, y = (i - x) / w;
    const g = (dx, dy) => (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h ? sk[i + dy * w + dx] : 0);
    return [g(0, -1), g(1, -1), g(1, 0), g(1, 1), g(0, 1), g(-1, 1), g(-1, 0), g(-1, -1)];
  };
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      const kill = [];
      for (let i = 0; i < N; i++) {
        if (!sk[i]) continue;
        const p = nb(i), B = p.reduce((a, b) => a + b, 0);
        if (B < 2 || B > 6) continue;
        let A = 0;
        for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) A++;
        if (A !== 1) continue;
        if (step === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6])) continue;
        kill.push(i);
      }
      for (const i of kill) sk[i] = 0;
      if (kill.length) changed = true;
    }
  }
  const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  const dist = new Int32Array(N).fill(-1), pieces = [];
  for (let i = 0; i < N; i++) {
    if (!sk[i] || dist[i] >= 0) continue;
    const comp = [i];
    dist[i] = 0;
    for (let q = 0; q < comp.length; q++) for (const [dx, dy] of STEPS) {
      const x = comp[q] % w + dx, y = Math.floor(comp[q] / w) + dy, j = y * w + x;
      if (x >= 0 && x < w && y >= 0 && y < h && sk[j] && dist[j] < 0) { dist[j] = 0; comp.push(j); }
    }
    const start = comp.reduce((best, j) => { const s = j % w + Math.floor(j / w) * 1.5; return s < best[1] ? [j, s] : best; }, [comp[0], Infinity])[0];
    for (const j of comp) dist[j] = -1;
    const order = [start];
    dist[start] = 0;
    for (let q = 0; q < order.length; q++) for (const [dx, dy] of STEPS) {
      const x = order[q] % w + dx, y = Math.floor(order[q] / w) + dy, j = y * w + x;
      if (x >= 0 && x < w && y >= 0 && y < h && sk[j] && dist[j] < 0) { dist[j] = dist[order[q]] + 1; order.push(j); }
    }
    let left = w, len = 1;
    for (const j of comp) { left = Math.min(left, j % w); len = Math.max(len, dist[j]); }
    pieces.push({ order, left, len });
  }
  pieces.sort((a, b) => a.left - b.left);
  const total = pieces.reduce((s, p) => s + p.len, 0) || 1;
  const value = new Float32Array(N).fill(-1), queue = [];
  let base = 0;
  for (const p of pieces) {
    for (const j of p.order) { value[j] = (base + dist[j]) / total; queue.push(j); }
    base += p.len;
  }
  // Every pixel of the letter: the value of its nearest center-line pixel.
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = (i - x) / w;
    for (const [dx, dy] of STEPS.slice(0, 4)) {
      const nx = x + dx, ny = y + dy, j = ny * w + nx;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[j] && value[j] < 0) { value[j] = value[i]; queue.push(j); }
    }
  }
  return value;
}
