/**
 * shade(canvas, { scene, kind, …, marks }): printed shading. A layer paints a density
 * field (how much ink each point gets) from marks, and draws it with
 * effect(): in a printed style (stipple, splatter, halftone or dither), as
 * light (the field itself, smooth, its canvas blended by screen), or as
 * grain (noise as strong as the field, blended by overlay, a new pattern
 * fps times a second). blend sets the canvas's CSS
 * mix-blend-mode. Returns a handle with set(params), redraw() and dispose().
 * set() changes options (all but kind, which a layer is made with; marks
 * too); values all as they were change nothing. redraw() paints the marks
 * again, for a frozen layer whose marks read something that changed.
 *
 * blur(element, { scene, radius, …, marks }), below, paints the same marks as the
 * mask of a backdrop blur over what is under the element.
 *
 *   const layer = shade(canvas, { scene: this, kind: 'stipple', fps: 2, marks: (m, t) => {
 *     m.band({ from: [0, 400], to: [600, 380], width: 60, ink: '#c47c6a' })
 *      .glow({ at: [240, 220], radius: 160, invert: true, clip: { circle: [300, 300, 140] } });
 *   } });
 *
 * scene: this, given in a scene's own methods, ties the layer to that
 * scene: it follows the scene's local time and is disposed with the scene,
 * wherever and whenever it was made. Without it, a layer follows the
 * composition time and lasts until dispose(). Anything but a scene's
 * component is KN-100, and set() cannot change it.
 *
 * `marks(m, t)`, an option every layer needs, is called before each draw
 * with the time to paint, that time. Each call on `m` adds a mark and
 * returns `m`:
 *
 *   band   along the line from `from` to `to`, `width` px to each side
 *          (side: 'both') or to one (side: 'left' or 'right', as seen
 *          walking from `from` to `to`), falling off away from the line
 *   glow   from the point `at` out to `radius` px, falling off outward, or
 *          rising outward with invert: true and full past the radius
 *   edge   inward from the outline of its `clip`, `width` px deep
 *   path   along the SVG path data `d`, full on it and falling off over
 *          `width` px to each side (side: 'both') or to one (side: 'left'
 *          or 'right', as seen walking along it), for a shade along a
 *          flat shape's side or a stripe
 *   fill   `amount` everywhere in its clip
 *   paint  fn(ctx, t): the author paints the field, the ink as colour and
 *          the density as alpha
 *   marks  a list of marks as data: { band: {…}, falloff, amount, ink,
 *          clip }, { fill: 0.3, … }, { paint: fn }
 *
 * Every mark takes `clip` ({ circle: [x, y, r] }, { rect: [x, y, w, h] },
 * { polygon: [[x, y], …] }, { path: 'M…' } or a Path2D), `amount` (the
 * density at full, 0 to 1, default 1), `ink` (its colour; an alpha thins
 * the mark) and `falloff` (an ease from the far end, 0, to full, 1:
 * 'linear', the default, 'smooth', or any of Kinetic's eases). Coordinates
 * are px from the canvas's top left. Marks laid over each other combine as
 * alpha layers (density b over a gives a + b(1 - a)), and the threshold
 * inks each speck, drop, dot or cell in the colour of the field under it.
 *
 * Time. fps: n gives the noise (stipple's, splatter's and grain's) a new
 * seed n times a second, held between (0, the default, keeps it; film
 * grain that changes every frame has fps at the frame rate); halftone,
 * dither and light have no noise and take the steps fps sets for their
 * freezes alone. delay: s holds the boil for its first s seconds, so a layer can
 * hold still while something rises and boil once it is up. What moving
 * marks do between steps:
 *
 *   freeze: 'seed'  (the default) the marks are painted for every frame and
 *                 move smoothly; the noise holds, so specks come and go at
 *                 a moving edge
 *   freeze: 'all'   the marks are painted for the scatter's start only, so
 *                 the whole texture holds and jumps, as hand-drawn frames do
 *   move(t)       { x, y, scale, rotate, origin: [x, y] }: the marks are
 *                 painted for the scatter's start and the canvas's CSS
 *                 transform is set to move(t) with move(start) undone, so
 *                 specks move with marks that all move together; the layer
 *                 owns the canvas's transform; set({ move: null }) stops
 *                 it and clears the transform
 *
 * freeze: 'all' and move need fps above 0; with fps at 0 the marks are
 * painted for every frame.
 *
 * Each layer is one canvas, one WebGL context, one upload and one pass for
 * all its marks; a browser keeps only so many contexts, so marks drawn
 * together belong on one layer. mask (a clip's shapes: { circle },
 * { rect }, { polygon }, { path } or a Path2D) cuts what the layer draws
 * to the shape, so a speck, drop or dot crossing its outline is cut
 * there; a mark's clip only limits where its density is painted. A mask
 * is in the canvas's px and moves with the canvas under move; set({ mask:
 * null }) takes it off. opacity (0 to 1) is the layer's, and
 * density (-1 to 1, 0 by default) moves a stipple, a splatter or a
 * halftone toward more ink or less everywhere, as effect()'s does; the
 * kind's own parameters (scale, contrast, grade, speck; min, max, warp, vary;
 * cell, angle, shape; matrix, levels) pass through to effect(), which also
 * checks them.
 * Errors: KN-100 for a bad call or mark, a layer with no marks, and a
 * third argument (the marks go in the options).
 */
import { CODES, fail, show } from './diagnostics.js';
import { easeAt, parseColor } from './motion.js';
import { readPath, cubics } from './paths.js';
import { boilStep, defaultOf } from './effects.js';

const KINDS = ['stipple', 'splatter', 'halftone', 'dither', 'light', 'grain', 'crachis', 'ink'];
const PLANES = 4;   // the inks a crachis or ink layer prints
const DENSE = KINDS.slice(0, 3);
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light',
  'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'plus-lighter'];
const SIDES = ['both', 'left', 'right'];
const MARKS = ['band', 'glow', 'edge', 'path', 'fill', 'paint'];
const SHARED = ['clip', 'amount', 'ink', 'falloff'];
// Each mark's own options, beside the shared ones.
const OPTIONS = { band: ['from', 'to', 'width', 'side'], glow: ['at', 'radius', 'invert'], edge: ['width'], path: ['d', 'width', 'side'], fill: [] };
const STOPS = 16;   // the steps a falloff is drawn in

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]);
const smooth = (u) => u * u * (3 - 2 * u);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// A canvas layer's painter, checked: shade()'s and blur()'s marks, or
// text()'s lines when `lines` is true. `pre` is the call so far, as
// 'shade(canvas, '; `extra` is a third argument, which no layer takes: the
// painter goes in the options.
export function painterOf(fn, extra, pre, lines) {
  const name = lines ? 'lines' : 'marks';
  if (extra !== undefined) throw fail(CODES.BAD_CALL, pre + 'options, ' + name + ')', __DEV__ && 'the ' + name + ' go in the options: { …, ' + name + ': (m, t) => … }');
  if (typeof fn !== 'function') throw fail(CODES.BAD_CALL, pre + '{ ' + name + ' })', __DEV__ && name + ' is a function (m, t) that adds the ' + name + ' for the time t, not ' + show(fn));
  return fn;
}

// A clip as a Path2D, or null (shade()'s marks and masks, draw()'s hatching).
export function clipOf(c, where, name = 'clip') {
  if (c === undefined) return null;
  if (typeof Path2D !== 'undefined' && c instanceof Path2D) return c;
  const p = new Path2D();
  if (c && Array.isArray(c.circle) && c.circle.length === 3 && c.circle.every(isNum)) p.arc(c.circle[0], c.circle[1], Math.max(0, c.circle[2]), 0, Math.PI * 2);
  else if (c && Array.isArray(c.rect) && c.rect.length === 4 && c.rect.every(isNum)) p.rect(c.rect[0], c.rect[1], c.rect[2], c.rect[3]);
  else if (c && Array.isArray(c.polygon) && c.polygon.length > 2 && c.polygon.every(isPoint)) {
    c.polygon.forEach((q, i) => (i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])));
    p.closePath();
  } else if (c && typeof c.path === 'string') {
    // Path2D takes anything and draws nothing of what it cannot read.
    const at = readPath(c.path);
    if (typeof at === 'number') throw fail(CODES.BAD_CALL, where + '{ ' + name + ' })', __DEV__ && 'path is SVG path data, and the grammar stops at character ' + at + ' of it');
    return new Path2D(c.path);
  } else throw fail(CODES.BAD_CALL,where + '{ ' + name + ' })', __DEV__ && 'a shape is { circle: [x, y, r] }, { rect: [x, y, w, h] }, { polygon: [[x, y], …] }, { path: \'M…\' } or a Path2D, not ' + show(c));
  return p;
}

export function createShade(wf, clock, scenes, effects) {

  // The parts every mark shares: its peak density, its colour and its
  // falloff, checked.
  function common(o, where, keys) {
    if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL,where + 'options)', __DEV__ && 'a mark is an object, not ' + show(o));
    for (const k in o) if (!keys.includes(k) && !SHARED.includes(k)) throw fail(CODES.BAD_CALL,where + '{ ' + k + ' })', __DEV__ && "'" + k + "' is not an option here; the options are " + keys.concat(SHARED).join(', '));
    const amount = o.amount === undefined ? 1 : o.amount;
    if (!isNum(amount) || amount < 0 || amount > 1) throw fail(CODES.BAD_CALL,where + '{ amount })', __DEV__ && 'amount is a number from 0 to 1, not ' + show(o.amount));
    const c = parseColor(o.ink === undefined ? '#000' : o.ink);
    if (!c) throw fail(CODES.BAD_CALL,where + '{ ink })', __DEV__ && 'ink is a colour, #rgb, #rrggbb (alpha optional) or rgb(), not ' + show(o.ink));
    const f = o.falloff === undefined || o.falloff === 'linear' ? (u) => u : o.falloff === 'smooth' ? smooth : easeAt(o.falloff, where + '{ falloff })');
    const circle = o.clip && Array.isArray(o.clip.circle) ? o.clip.circle : null;
    return { peak: amount * c[3], rgb: c[0] + ',' + c[1] + ',' + c[2], f, clip: clipOf(o.clip, where), circle };
  }

  // A gradient's stops: density(u) for u from 0 to 1 along it.
  function stops(g, k, density) {
    for (let i = 0; i <= STOPS; i++) {
      const u = i / STOPS;
      g.addColorStop(u, 'rgba(' + k.rgb + ',' + clamp01(density(u)) + ')');
    }
  }

  // Fills the canvas with `style` inside the mark's clip.
  function cover(ctx, k, style) {
    ctx.save();
    if (k.clip) ctx.clip(k.clip);
    ctx.fillStyle = style;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  // `plane`, from crachis and ink alone, gives the 2D context of a mark's
  // ink, { rgb }: each ink is painted on a plane of its own.
  function painter(ctx, scratch, t, plane) {
    const to = (k) => (plane ? plane(k) : ctx);
    // Strokes of `outline`, widest first, each adding a step of the
    // falloff, cut to the mark's clip and to `region`: a point d px from
    // the outline is under every stroke wider than 2d. Drawn apart and laid
    // on the field, so the steps add only to each other. The strokes are
    // white, then the ink is put in where they are: added up in the ink,
    // each step's colour would be rounded at its small alpha, and the sum
    // would drift off the ink.
    const strokes = (k, outline, width, region) => {
      const s = scratch();
      s.save();
      s.clearRect(0, 0, s.canvas.width, s.canvas.height);
      if (k.clip) s.clip(k.clip);
      if (region) s.clip(region);
      s.globalCompositeOperation = 'lighter';
      s.lineJoin = 'round';
      s.strokeStyle = '#fff';
      for (let i = 1; i <= STOPS; i++) {
        const step = k.peak * (k.f(1 - (i - 1) / STOPS) - k.f(1 - i / STOPS));
        if (step <= 0) continue;
        s.globalAlpha = Math.min(1, step);
        s.lineWidth = 2 * width * i / STOPS;
        s.stroke(outline);
      }
      s.restore();
      // Out of the clip, so a pixel the outline crosses is all ink too.
      s.save();
      s.globalCompositeOperation = 'source-in';
      s.fillStyle = 'rgb(' + k.rgb + ')';
      s.fillRect(0, 0, s.canvas.width, s.canvas.height);
      s.restore();
      to(k).drawImage(s.canvas, 0, 0);
    };
    const m = {
      band(o) {
        const k = common(o, 'band(', OPTIONS.band);
        if (!isPoint(o.from) || !isPoint(o.to)) throw fail(CODES.BAD_CALL,'band({ from, to })', __DEV__ && 'from and to are points, [x, y], not ' + show(isPoint(o.from) ? o.to : o.from));
        if (!isNum(o.width) || o.width <= 0) throw fail(CODES.BAD_CALL,'band({ width })', __DEV__ && 'width is a number of px above 0, not ' + show(o.width));
        const side = o.side === undefined ? 'both' : o.side;
        if (!SIDES.includes(side)) throw fail(CODES.BAD_CALL,'band({ side })', __DEV__ && "side is 'both', 'left' or 'right', not " + show(o.side));
        const dx = o.to[0] - o.from[0], dy = o.to[1] - o.from[1], len = Math.hypot(dx, dy);
        if (!len) throw fail(CODES.BAD_CALL,'band({ from, to })', __DEV__ && 'from and to are two different points');
        // The left of the line, walking from `from` to `to` on the screen.
        const nx = dy / len, ny = -dx / len, w = o.width, c = to(k);
        const g = c.createLinearGradient(o.from[0] - nx * w, o.from[1] - ny * w, o.from[0] + nx * w, o.from[1] + ny * w);
        // u runs from the right edge (0) through the line (0.5) to the left (1).
        stops(g, k, (u) => {
          const s = u * 2 - 1;
          if ((side === 'left' && s < 0) || (side === 'right' && s > 0)) return 0;
          return k.peak * k.f(1 - Math.abs(s));
        });
        cover(c, k, g);
        return m;
      },
      glow(o) {
        const k = common(o, 'glow(', OPTIONS.glow);
        if (!isPoint(o.at)) throw fail(CODES.BAD_CALL,'glow({ at })', __DEV__ && 'at is a point, [x, y], not ' + show(o.at));
        if (!isNum(o.radius) || o.radius <= 0) throw fail(CODES.BAD_CALL,'glow({ radius })', __DEV__ && 'radius is a number of px above 0, not ' + show(o.radius));
        if (o.invert !== undefined && typeof o.invert !== 'boolean') throw fail(CODES.BAD_CALL,'glow({ invert })', __DEV__ && 'invert is true or false, not ' + show(o.invert));
        const c = to(k), g = c.createRadialGradient(o.at[0], o.at[1], 0, o.at[0], o.at[1], o.radius);
        stops(g, k, (u) => k.peak * k.f(o.invert ? u : 1 - u));
        cover(c, k, g);
        return m;
      },
      // Strokes of the clip's outline, cut to its inside.
      edge(o) {
        const k = common(o, 'edge(', OPTIONS.edge);
        if (!k.clip) throw fail(CODES.BAD_CALL,'edge({ clip })', __DEV__ && 'an edge needs a clip: the shape whose outline it follows inward');
        if (!isNum(o.width) || o.width <= 0) throw fail(CODES.BAD_CALL,'edge({ width })', __DEV__ && 'width is a number of px above 0, not ' + show(o.width));
        // A circle's edge is a radial gradient: the same falloff in one fill.
        if (k.circle) {
          const [x, y, r] = k.circle, r0 = Math.max(0, r - o.width), c = to(k);
          const g = c.createRadialGradient(x, y, r0, x, y, r);
          stops(g, k, (u) => k.peak * k.f(u));
          cover(c, k, g);
          return m;
        }
        strokes(k, k.clip, o.width, null);
        return m;
      },
      // Along the path data d, full on it and falling off over `width` px
      // to each side (side: 'both'), or to one, as seen walking along it:
      // the strokes are cut to the strip between the path and the path
      // moved `width` px to that side along its normals.
      path(o) {
        const k = common(o, 'path(', OPTIONS.path);
        const cmds = typeof o.d === 'string' ? readPath(o.d) : 0;
        if (typeof cmds === 'number') throw fail(CODES.BAD_CALL,'path({ d })', __DEV__ && 'd is SVG path data' + (typeof o.d === 'string' ? ', and the grammar stops at character ' + cmds + ' of it' : ', not ' + show(o.d)));
        if (!isNum(o.width) || o.width <= 0) throw fail(CODES.BAD_CALL,'path({ width })', __DEV__ && 'width is a number of px above 0, not ' + show(o.width));
        const side = o.side === undefined ? 'both' : o.side;
        if (!SIDES.includes(side)) throw fail(CODES.BAD_CALL,'path({ side })', __DEV__ && "side is 'both', 'left' or 'right', not " + show(o.side));
        let strip = null;
        if (side !== 'both') {
          // Each subpath in points every 4 px or so, and moved to the side
          // along the normal between its neighbours, past the falloff.
          strip = new Path2D();
          const w = (o.width + 2) * (side === 'left' ? 1 : -1);
          for (const s of cubics(cmds)) {
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
            if (pts.length < 2) continue;
            const L = pts.length, moved = pts.map((q, i) => {
              const r = pts[s.closed ? (i + 1) % L : Math.min(i + 1, L - 1)], l = pts[s.closed ? (i + L - 1) % L : Math.max(i - 1, 0)];
              const dx = r[0] - l[0], dy = r[1] - l[1], len = Math.hypot(dx, dy) || 1;
              return [q[0] + dy / len * w, q[1] - dx / len * w];
            });
            // An open path and its moved copy make one outline; a closed one
            // makes a ring, the moved copy turned the other way.
            const ring = s.closed ? [pts, moved.reverse()] : [pts.concat(moved.reverse())];
            for (const r of ring) {
              r.forEach((q, i) => (i ? strip.lineTo(q[0], q[1]) : strip.moveTo(q[0], q[1])));
              strip.closePath();
            }
          }
        }
        strokes(k, new Path2D(o.d), o.width, strip);
        return m;
      },
      fill(o) {
        const k = common(o, 'fill(', OPTIONS.fill);
        cover(to(k), k, 'rgba(' + k.rgb + ',' + k.peak + ')');
        return m;
      },
      paint(fn, o) {
        if (typeof fn !== 'function') throw fail(CODES.BAD_CALL,'paint(fn)', __DEV__ && 'fn is a function (ctx, t) that paints the field, not ' + show(fn));
        if (o !== undefined && (!o || typeof o !== 'object')) throw fail(CODES.BAD_CALL, 'paint(fn, options)', __DEV__ && 'the options are { clip, ink }, not ' + show(o));
        for (const k in o) if (k !== 'clip' && k !== 'ink') throw fail(CODES.BAD_CALL, 'paint(fn, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option here; paint() takes clip and ink, and fn paints its own amount");
        const clip = o === undefined ? null : clipOf(o.clip, 'paint(fn, ');
        let c = ctx;
        // In crachis and ink, fn paints the density, as alpha, of the ink named.
        if (plane) {
          const ink = o && o.ink !== undefined ? parseColor(o.ink) : null;
          if (!ink) throw fail(CODES.BAD_CALL, 'paint(fn, { ink })', __DEV__ && 'in crachis and ink, paint() names the ink it paints, paint(fn, { ink }), and fn paints its density as alpha' + (o && o.ink !== undefined ? '; ' + show(o.ink) + ' is not a colour' : ''));
          c = plane({ rgb: ink[0] + ',' + ink[1] + ',' + ink[2] });
        }
        c.save();
        if (clip) c.clip(clip);
        fn(c, t);
        c.restore();
        return m;
      },
      marks(list) {
        if (!Array.isArray(list)) throw fail(CODES.BAD_CALL,'marks(list)', __DEV__ && 'list is an array of marks, not ' + show(list));
        for (const item of list) {
          const kind = item && MARKS.find((n) => n in item);
          if (!kind) throw fail(CODES.BAD_CALL,'marks([…])', __DEV__ && 'each mark has one of ' + MARKS.join(', ') + ', not ' + show(item));
          const rest = Object.assign({}, item);
          delete rest[kind];
          if (kind === 'paint') m.paint(item.paint, rest);
          else if (kind === 'fill') {
            if ('amount' in rest) throw fail(CODES.BAD_CALL, 'marks([{ fill, amount }])', __DEV__ && "a fill's value is its amount, so give one or the other, not " + show(item));
            m.fill(Object.assign({ amount: item.fill }, rest));
          }
          else m[kind](Object.assign({}, item[kind], rest));
        }
        return m;
      },
    };
    return m;
  }

  const matrixOf = (v, where) => {
    if (!v || typeof v !== 'object') throw fail(CODES.BAD_CALL,where, __DEV__ && 'move(t) returns { x, y, scale, rotate, origin }, not ' + show(v));
    for (const k of ['x', 'y', 'scale', 'rotate']) if (v[k] !== undefined && !isNum(v[k])) throw fail(CODES.BAD_CALL, where, __DEV__ && k + ' is a number, not ' + show(v[k]));
    if (v.origin !== undefined && !isPoint(v.origin)) throw fail(CODES.BAD_CALL, where, __DEV__ && 'origin is a point [x, y] in px, not ' + show(v.origin));
    const o = v.origin || [0, 0];
    return new DOMMatrix().translate(v.x || 0, v.y || 0).translate(o[0], o[1])
      .rotate(v.rotate || 0).scale(v.scale === undefined ? 1 : v.scale).translate(-o[0], -o[1]);
  };

  function shade(canvas, options, extra) {
    if (!canvas || canvas.localName !== 'canvas') throw fail(CODES.BAD_CALL,'shade(canvas)', __DEV__ && 'canvas is a <canvas> element, not ' + show(canvas));
    const o = options === undefined ? {} : options;
    if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL,'shade(canvas, options)', __DEV__ && 'options is { kind, …, marks }, not ' + show(options));
    let marks = painterOf(o.marks, extra, 'shade(canvas, ');
    for (const k of ['ink', 'paper', 'color', 'source']) {
      if (k in o) throw fail(CODES.BAD_CALL,'shade(canvas, { ' + k + ' })', __DEV__ && 'a layer takes its ink from each mark and has no paper; give each mark its ink');
    }
    const kind = o.kind === undefined ? 'stipple' : o.kind;
    if (!KINDS.includes(kind)) throw fail(CODES.BAD_CALL,'shade(canvas, { kind })', __DEV__ && 'kind is ' + KINDS.join(', ').replace(/, (\w+)$/, ' or $1') + ', not ' + show(o.kind));
    const moving = (v, pre) => {
      if (v != null && typeof v !== 'function') throw fail(CODES.BAD_CALL, pre + '{ move })', __DEV__ && 'move is a function of t returning { x, y, scale, rotate, origin }, or null for none, not ' + show(v));
      return v || null;
    };
    let move = moving(o.move, 'shade(canvas, ');
    const el = scenes.sceneOf(o.scene, 'shade(canvas, ');
    // Crachis and ink print each ink on a plane of its own, and multiply onto what is under them.
    const print = kind === 'crachis' || kind === 'ink';
    const own = { fps: 0, delay: 0, freeze: 'seed', opacity: 1, seed: 1, blend: kind === 'light' ? 'screen' : kind === 'grain' ? 'overlay' : print ? 'multiply' : 'normal' };
    const params = {};
    // The mask: its shape (a Path2D, or null), the value it came from (a
    // shape's JSON, or the Path2D), how many times it changed, and its
    // canvas, painted at the drawing's size when either changes.
    let shape = null, from = '', shaped = 0, drawn = '';
    const sheet = document.createElement('canvas');
    const mask = (w, h, P) => {
      if (!shape) return null;
      const id = w + ' ' + h + ' ' + shaped;
      if (id !== drawn) {
        sheet.width = w;
        sheet.height = h;
        const c = sheet.getContext('2d');
        c.scale(P, P);
        c.fill(shape);
        drawn = id;
      }
      return { canvas: sheet, id };
    };
    const take = (p, pre) => {
      for (const k in p) {
        if (k === 'kind' || k === 'move' || k === 'marks' || k === 'scene') continue;
        const v = p[k];
        // density, effect()'s own: more or less ink everywhere.
        if (k === 'density') {
          if (!DENSE.includes(kind)) throw fail(CODES.BAD_CALL, pre + '{ density })', __DEV__ && 'density is for stipple, splatter and halftone, not ' + kind);
          if (!(isNum(v) && v >= -1 && v <= 1)) throw fail(CODES.BAD_CALL, pre + '{ density })', __DEV__ && 'density is a number from -1 to 1, not ' + show(v));
          params.density = v;
          continue;
        }
        if (k === 'mask') {
          // The same shape again is no change.
          const key = v === null ? '' : typeof Path2D !== 'undefined' && v instanceof Path2D ? v : JSON.stringify(v);
          if (key === from) continue;
          shape = v === null ? null : clipOf(v, pre, 'mask');
          from = key;
          shaped++;
          continue;
        }
        if (!(k in own)) { params[k] = v; continue; }
        if (k === 'fps' && !(isNum(v) && v >= 0)) throw fail(CODES.BAD_CALL, pre + '{ fps })', __DEV__ && 'fps is scatters a second, 0 or more, not ' + show(v));
        if (k === 'delay' && !(isNum(v) && v >= 0)) throw fail(CODES.BAD_CALL, pre + '{ delay })', __DEV__ && 'delay is the seconds before the boil starts, 0 or more, not ' + show(v));
        if (k === 'freeze' && v !== 'seed' && v !== 'all') throw fail(CODES.BAD_CALL, pre + '{ freeze })', __DEV__ && "freeze is 'seed' or 'all', not " + show(v));
        if (k === 'opacity' && !(isNum(v) && v >= 0 && v <= 1)) throw fail(CODES.BAD_CALL, pre + '{ opacity })', __DEV__ && 'opacity is a number from 0 to 1, not ' + show(v));
        if (k === 'seed' && !(isNum(v) && v % 1 === 0)) throw fail(CODES.BAD_CALL, pre + '{ seed })', __DEV__ && 'seed is a whole number, not ' + show(v));
        if (k === 'blend' && !BLENDS.includes(v)) throw fail(CODES.BAD_CALL, pre + '{ blend })', __DEV__ && 'blend is a CSS mix-blend-mode, such as screen, overlay, multiply or plus-lighter, not ' + show(v));
        own[k] = v;
      }
    };
    take(o, 'shade(canvas, ');
    canvas.style.mixBlendMode = own.blend;
    const field = document.createElement('canvas');
    const ctx = field.getContext('2d');
    let spare = null;
    const scratch = () => {
      if (!spare) spare = document.createElement('canvas').getContext('2d');
      if (spare.canvas.width !== field.width || spare.canvas.height !== field.height) {
        spare.canvas.width = field.width;
        spare.canvas.height = field.height;
      }
      return spare;
    };
    const ink = () => '#000000' + ('0' + Math.round(own.opacity * 255).toString(16)).slice(-2);
    // The inks, 'r,g,b' in the order the marks first use them, and a plane
    // for each; the field is the planes stacked, one under the other.
    const inks = [], planes = [];
    const plane = (k) => {
      let i = inks.indexOf(k.rgb);
      if (i < 0) {
        if (inks.length === PLANES) throw fail(CODES.BAD_CALL, "shade(canvas, { kind: '" + kind + "' })", __DEV__ && 'a layer of crachis or ink prints at most four inks, and the marks name a fifth; give the others a layer of their own');
        i = inks.push(k.rgb) - 1;
      }
      return planes[i];
    };

    function prepare(cw, ch) {
      const now = clock.now();
      const t = el ? scenes.localOf(el, now) : now;
      const step = boilStep(t, own.fps, own.delay);
      const at = (own.freeze === 'all' || move) && own.fps > 0 ? (step && own.delay + step / own.fps) : t;
      if (seeded) fx.set({ seed: own.seed + step });
      // Frozen marks are painted once a step; set() and redraw() paint them again.
      const key = cw + ' ' + ch + ' ' + at + ' ' + version;
      const fresh = own.freeze === 'seed' && !move || key !== painted;
      if (fresh) {
        const fh = print ? ch * PLANES : ch;
        if (field.width !== cw || field.height !== fh) {
          field.width = cw;
          field.height = fh;
        }
        ctx.clearRect(0, 0, cw, fh);
        if (print) {
          for (let i = 0; i < PLANES; i++) {
            const p = planes[i] || (planes[i] = document.createElement('canvas').getContext('2d'));
            if (p.canvas.width !== cw || p.canvas.height !== ch) { p.canvas.width = cw; p.canvas.height = ch; } else p.clearRect(0, 0, cw, ch);
          }
          inks.length = 0;
          marks(painter(ctx, scratch, at, plane), at);
          for (let i = 0; i < inks.length; i++) ctx.drawImage(planes[i].canvas, 0, i * ch);
        } else marks(painter(ctx, scratch, at), at);
        painted = key;
      }
      if (move) {
        const d = matrixOf(move(t), 'shade(canvas, { move })').multiply(matrixOf(move(at), 'shade(canvas, { move })').inverse());
        canvas.style.transformOrigin = '0 0';
        canvas.style.transform = d.toString();
      }
      return fresh;
    }
    let painted = null, version = 0;

    // Stipple, splatter and grain have noise to seed; halftone, dither and
    // light take the steps fps sets for their freezes alone. Light and grain draw
    // the field's own colour, so take no color.
    const seeded = kind === 'stipple' || kind === 'splatter' || kind === 'grain' || kind === 'crachis';
    const fx = effects.inner(canvas, Object.assign({}, params, seeded ? { seed: own.seed } : {},
      kind === 'light' || kind === 'grain' || print ? {} : { color: 'source' },
      // box is read at each draw: a moving layer is sized from its CSS box
      // alone, past the transform it puts on the canvas.
      { source: field, kind, ink: ink(), paper: '#00000000' }), { alpha: true, get box() { return !!move; }, prepare, mask, scene: el,
      inks: print ? () => inks.map((s) => s.split(',').map((v) => v / 255)) : null });

    const handle = {
      // Values that are all as they were change nothing and paint nothing.
      set(p) {
        if (!p || typeof p !== 'object') throw fail(CODES.BAD_CALL,'set(params)', __DEV__ && 'the parameters are an object, not ' + show(p));
        for (const k of ['kind', 'scene', 'ink', 'paper', 'color', 'source']) {
          if (k in p) throw fail(CODES.BAD_CALL,'set({ ' + k + ' })', __DEV__ && k + ' is set when the layer is made');
        }
        // All of it or none: a throw, here or in the effect's own checks,
        // leaves the layer as it was.
        const before = Object.assign({}, params), ownWas = Object.assign({}, own), was = JSON.stringify(own);
        const cut = shaped, moved = move, drew = marks, shapeWas = shape, fromWas = from;
        try {
          if ('move' in p) move = moving(p.move, 'set(');
          if ('marks' in p) marks = painterOf(p.marks, undefined, 'set(');
          take(p, 'set(');
          // A value never given is the kind's default.
          const prior = (k) => (k in before ? before[k] : defaultOf(kind, k));
          if (JSON.stringify(own) === was && shaped === cut && move === moved && marks === drew && Object.keys(params).every((k) => params[k] === prior(k))) return handle;
          const changed = {};
          for (const k in params) if (params[k] !== prior(k)) changed[k] = params[k];
          changed.ink = ink();
          fx.set(changed);
        } catch (e) {
          for (const k in params) if (!(k in before)) delete params[k];
          Object.assign(params, before);
          Object.assign(own, ownWas);
          shaped = cut; shape = shapeWas; from = fromWas; move = moved; marks = drew;
          throw e;
        }
        if (!move && moved) canvas.style.transform = canvas.style.transformOrigin = '';
        canvas.style.mixBlendMode = own.blend;
        version++;
        return handle;
      },
      // The marks painted again at the next draw, for marks that read
      // something that changed (a frozen layer paints them once a step).
      redraw() {
        version++;
        return handle;
      },
      dispose: () => fx.dispose(),
    };
    return handle;
  }

  // blur(element, { scene, radius, …, marks }): the content under `element`
  // blurred by `radius` px where the marks' field is full and sharp where it
  // is empty, on its scene's local time with `scene`, as a layer's marks:
  // the element gets backdrop-filter: blur() and a mask-image of the field.
  // The field is painted in the seek's media phase, which the clock waits
  // for, and the seek waits for the mask image to decode, so a check and a
  // render never take a frame with the last frame's mask. The mask is a
  // quarter of the element's size: a blur's edge needs no more. fps,
  // delay and freeze step its marks as a layer's; its handle has set(),
  // redraw() and dispose(), as a layer's does.
  const blurs = new Set();
  clock.onMedia(() => {
    let wait = null;
    for (const b of blurs) {
      const p = b.update();
      if (p) (wait || (wait = [])).push(p);
    }
    return wait && Promise.all(wait);
  });
  wf.hook('component:beforeDestroy', (inst) => {
    for (const b of blurs) if (b.el && b.el === inst.element) b.dispose();
  });
  const MASK = ['maskImage', 'webkitMaskImage', 'maskSize', 'webkitMaskSize', 'maskRepeat', 'webkitMaskRepeat', 'backdropFilter', 'webkitBackdropFilter'];

  function blur(element, options, extra) {
    if (!element || !element.style || typeof element.getBoundingClientRect !== 'function') throw fail(CODES.BAD_CALL, 'blur(element)', __DEV__ && 'element is an element over what it blurs, not ' + show(element));
    const o = options === undefined ? {} : options;
    if (!o || typeof o !== 'object') throw fail(CODES.BAD_CALL, 'blur(element, options)', __DEV__ && 'options is { scene, radius, fps, delay, freeze, marks }, not ' + show(options));
    let marks = painterOf(o.marks, extra, 'blur(element, ');
    const el = scenes.sceneOf(o.scene, 'blur(element, ');
    const own = { radius: 8, fps: 0, delay: 0, freeze: 'seed' };
    const take = (p, pre) => {
      for (const k in p) {
        const v = p[k];
        if (k === 'marks' || (k === 'scene' && pre !== 'set(')) continue;
        if (k === 'scene') throw fail(CODES.BAD_CALL, 'set({ scene })', __DEV__ && 'scene is set when the blur is made');
        if (!(k in own)) throw fail(CODES.BAD_CALL, pre + '{ ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the options are scene, radius, fps, delay, freeze and marks");
        if (k === 'radius' && !(isNum(v) && v >= 0)) throw fail(CODES.BAD_CALL, pre + '{ radius })', __DEV__ && 'radius is a number of px, 0 or more, not ' + show(v));
        if (k === 'fps' && !(isNum(v) && v >= 0)) throw fail(CODES.BAD_CALL, pre + '{ fps })', __DEV__ && 'fps is steps a second, 0 or more, not ' + show(v));
        if (k === 'delay' && !(isNum(v) && v >= 0)) throw fail(CODES.BAD_CALL, pre + '{ delay })', __DEV__ && 'delay is the seconds before the boil starts, 0 or more, not ' + show(v));
        if (k === 'freeze' && v !== 'seed' && v !== 'all') throw fail(CODES.BAD_CALL, pre + '{ freeze })', __DEV__ && "freeze is 'seed' or 'all', not " + show(v));
        own[k] = v;
      }
    };
    take(o, 'blur(element, ');
    const saved = MASK.map((k) => element.style[k]);
    const filter = () => {
      element.style.backdropFilter = element.style.webkitBackdropFilter = 'blur(' + own.radius + 'px)';
    };
    filter();
    for (const [k, v] of [['maskSize', '100% 100%'], ['maskRepeat', 'no-repeat']]) {
      element.style[k] = v;
      element.style['webkit' + k[0].toUpperCase() + k.slice(1)] = v;
    }
    const field = document.createElement('canvas');
    const ctx = field.getContext('2d');
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d', { willReadFrequently: true });
    let spare = null;
    const scratch = () => {
      if (!spare) spare = document.createElement('canvas').getContext('2d');
      if (spare.canvas.width !== field.width || spare.canvas.height !== field.height) {
        spare.canvas.width = field.width;
        spare.canvas.height = field.height;
      }
      return spare;
    };
    let painted = null, shown = null, version = 0;
    const b = {
      el,
      update() {
        if (!element.isConnected) return null;
        const now = clock.now();
        const t = b.el ? scenes.localOf(b.el, now) : now;
        const step = boilStep(t, own.fps, own.delay);
        const at = own.freeze === 'all' && own.fps > 0 ? (step && own.delay + step / own.fps) : t;
        const w = element.clientWidth, h = element.clientHeight;
        const key = w + ' ' + h + ' ' + at + ' ' + version;
        if (!w || !h || key === painted) return null;
        painted = key;
        if (field.width !== w || field.height !== h) { field.width = w; field.height = h; }
        ctx.clearRect(0, 0, w, h);
        marks(painter(ctx, scratch, at), at);
        const sw = Math.max(1, Math.ceil(w / 4)), sh = Math.max(1, Math.ceil(h / 4));
        if (small.width !== sw || small.height !== sh) { small.width = sw; small.height = sh; }
        sctx.clearRect(0, 0, sw, sh);
        sctx.drawImage(field, 0, 0, sw, sh);
        // Marks that did not move give the same mask: it is not encoded again.
        const px = sctx.getImageData(0, 0, sw, sh).data;
        let sum = 0x811c9dc5;
        for (let i = 3; i < px.length; i += 4) sum = Math.imul(sum ^ px[i], 0x01000193);
        const id = sw + 'x' + sh + ':' + (sum >>> 0);
        if (id === shown) return null;
        shown = id;
        const data = small.toDataURL();
        element.style.maskImage = element.style.webkitMaskImage = 'url("' + data + '")';
        const img = new Image();
        img.src = data;
        return img.decode().catch(() => {});
      },
      dispose() {
        if (!blurs.delete(b)) return;
        MASK.forEach((k, i) => { element.style[k] = saved[i]; });
      },
    };
    blurs.add(b);
    const handle = {
      set(p) {
        if (!p || typeof p !== 'object') throw fail(CODES.BAD_CALL, 'set(params)', __DEV__ && 'the parameters are an object, not ' + show(p));
        const was = JSON.stringify(own), ownWas = Object.assign({}, own), drew = marks;
        // All of it or none, as the layer's set().
        try {
          if ('marks' in p) marks = painterOf(p.marks, undefined, 'set(');
          take(p, 'set(');
        } catch (e) { Object.assign(own, ownWas); marks = drew; throw e; }
        if (JSON.stringify(own) === was && marks === drew) return handle;
        filter();
        version++;
        return handle;
      },
      redraw() {
        version++;
        return handle;
      },
      dispose: () => b.dispose(),
    };
    return handle;
  }

  return { shade, blur };
}
