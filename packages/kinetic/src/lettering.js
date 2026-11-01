/**
 * text(canvas, { scene, font, lines }): lines of type drawn on a canvas from baked
 * outlines (the baker, bake/outlines.mjs, makes them from a variable font),
 * each letter with its own weight, slant, offset, scale, rotation, opacity,
 * blur and colour, its place worked out here from the advances and the
 * kerning at its own setting. The page lays nothing out and nothing snaps
 * to a pixel, and no font is built while the clock plays, so a weight that
 * changes on every frame draws as smoothly on the first loop as the next.
 *
 *   text(canvas, { scene: this, font: OUTLINES, lines: (m, t) => {
 *     m.line('KINETIC', { at: [300, 300], size: 34, align: 'center', valign: 'middle' },
 *       (i, ch) => ({ wght: 700 + 200 * swell(i, t) }));
 *   } });
 *
 * scene: this, given in a scene's own methods, ties the text to that
 * scene: it follows the scene's local time and is disposed with the scene,
 * wherever and whenever it was made. Without it, the text follows the
 * composition time and lasts until dispose(). Anything but a scene's
 * component is KN-100, and set() cannot change it.
 *
 * The option lines(m, t), which text() needs, is called before each draw
 * with that time, and
 * m.line(string, options, letter) adds a line: at [x, y] (px from the
 * canvas's top left), size (px, 16), align ('left', 'center', 'right'),
 * valign ('baseline', the default, or 'middle', the caps' middle on y),
 * tracking (em between letters, 0), spacing ('natural': each letter's own
 * advance, as After Effects' per-character spacing; 'fixed': each letter
 * in the slot of its default advance), color (#000), and an axis value for
 * the whole line (wght, slnt, or any other axis the outlines were baked
 * with, by its tag, such as BNCE). letter(i, ch) returns that letter's own
 * values, any of those axes, dx, dy, scale, rotate (degrees), opacity,
 * blur (px) and color. A slant on a font with no slnt axis is drawn by
 * skewing the letter. A line takes the left letter's setting for each
 * kerning pair, and its width is the advances and the tracking between
 * letters, none after the last.
 *
 * Returns { set(options), dispose() }; set() takes font and lines. The canvas is drawn
 * at its shown size times the device pixel ratio, its CSS box in a render.
 * 'fixed' spacing applies no kerning. Errors: KN-100 for outlines that are
 * not the baker's, no lines, a third argument (the lines go in the
 * options), an unknown or bad option or letter value, or a character the
 * outlines do not hold.
 */
import { CODES, fail, show } from './diagnostics.js';
import { painterOf } from './shade.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const LINE = ['at', 'size', 'align', 'valign', 'tracking', 'spacing', 'color', 'wght', 'slnt'];
const LETTER = ['wght', 'slnt', 'dx', 'dy', 'scale', 'rotate', 'opacity', 'blur', 'color'];
const CHOICE = [['align', ['left', 'center', 'right']], ['valign', ['baseline', 'middle']], ['spacing', ['natural', 'fixed']]];

// An axis value to its place in the baked stops: the user value mapped to
// -1..1 about the default, through avar, then the two stops around it and
// how far between them.
function placeOf(ax, v) {
  let u = v < ax.default ? (v - ax.default) / (ax.default - ax.min || 1) : (v - ax.default) / (ax.max - ax.default || 1);
  u = u < -1 ? -1 : u > 1 ? 1 : u;
  const s = ax.avar;
  let n = u;
  for (let i = 1; i < s.length; i++) {
    if (u <= s[i][0] || i === s.length - 1) {
      const [a0, b0] = s[i - 1], [a1, b1] = s[i];
      n = a1 === a0 ? b0 : b0 + ((b1 - b0) * (u - a0)) / (a1 - a0);
      break;
    }
  }
  const st = ax.stops;
  if (st.length === 1) return [0, 0, 0];
  let i = 1;
  while (i < st.length - 1 && n > st[i]) i++;
  const t = (n - st[i - 1]) / (st[i] - st[i - 1]);
  return [i - 1, i, t < 0 ? 0 : t > 1 ? 1 : t];
}

// The grid points and their weights for a setting of the axes.
function cornersOf(font, values) {
  let out = [[0, 1]];
  font.axes.forEach((ax, k) => {
    const [a, b, t] = placeOf(ax, values[k]);
    const n = ax.stops.length;
    out = out.flatMap(([idx, w]) => (t === 0 ? [[idx * n + a, w]] : t === 1 ? [[idx * n + b, w]] : [[idx * n + a, w * (1 - t)], [idx * n + b, w * t]]));
  });
  return out;
}
const blend = (arr, corners) => corners.reduce((s, [i, w]) => s + arr[i] * w, 0);

export function createLettering(wf, clock, scenes) {
  const live = new Set();
  clock.onLanded((time) => {
    let failed = null;
    for (const l of live) {
      try { l.draw(time); } catch (e) { if (!failed) failed = e; }
    }
    if (failed) throw failed;
  });
  // The scene a text was made with is removed: the text is disposed with it.
  wf.hook('component:beforeDestroy', (inst) => {
    for (const l of live) if (l.el && l.el === inst.element) l.dispose();
  });

  const checkFont = (f, pre) => {
    if (!f || f.format !== 1 || !f.glyphs || !Array.isArray(f.axes) || !isNum(f.upm)) throw fail(CODES.BAD_CALL, pre + '{ font })', __DEV__ && 'font is the outlines the baker writes (format 1), not ' + show(f));
  };

  function text(canvas, options, extra) {
    if (!canvas || canvas.localName !== 'canvas') throw fail(CODES.BAD_CALL, 'text(canvas)', __DEV__ && 'canvas is a <canvas> element, not ' + show(canvas));
    if (!options || typeof options !== 'object') throw fail(CODES.BAD_CALL, 'text(canvas, options)', __DEV__ && 'options is { scene, font, lines }, not ' + show(options));
    let lines = painterOf(options.lines, extra, 'text(canvas, ', true);
    checkFont(options.font, 'text(canvas, ');
    const el = scenes.sceneOf(options.scene, 'text(canvas, ');
    let font = options.font;
    const ctx = canvas.getContext('2d');

    // Draws one glyph's outline into the current path, blended.
    const trace = (g, corners) => {
      const pts = g.pts, cmds = g.cmds;
      let n = 0;
      const v = () => { let s = 0; for (const [i, w] of corners) s += pts[i][n] * w; n++; return s; };
      ctx.beginPath();
      for (let c = 0; c < cmds.length; c++) {
        const k = cmds[c];
        if (k === 'M') ctx.moveTo(v(), v());
        else if (k === 'L') ctx.lineTo(v(), v());
        else if (k === 'Q') ctx.quadraticCurveTo(v(), v(), v(), v());
        else if (k === 'C') ctx.bezierCurveTo(v(), v(), v(), v(), v(), v());
        else ctx.closePath();
      }
    };

    function drawLine(str, o, letter) {
      if (typeof str !== 'string') throw fail(CODES.BAD_CALL, 'line(string)', __DEV__ && 'string is the text of the line, not ' + show(str));
      const opt = o || {};
      // Any axis the outlines were baked with is a value too, as wght and slnt are.
      const tags = font.axes.map((ax) => ax.tag);
      const held = __DEV__ && (tags.length ? ', and an axis the outlines hold: ' + tags.join(', ') : '');
      for (const k in opt) if (!LINE.includes(k) && !tags.includes(k)) throw fail(CODES.BAD_CALL, 'line(string, { ' + k + ' })', __DEV__ && "'" + k + "' is not an option; the options are " + LINE.join(', ') + held);
      const at = opt.at || [0, 0];
      if (!Array.isArray(at) || at.length !== 2 || !at.every(isNum)) throw fail(CODES.BAD_CALL, 'line(string, { at })', __DEV__ && 'at is a point, [x, y], not ' + show(opt.at));
      const size = opt.size === undefined ? 16 : opt.size;
      if (!isNum(size) || size <= 0) throw fail(CODES.BAD_CALL, 'line(string, { size })', __DEV__ && 'size is a number of px above 0, not ' + show(opt.size));
      if (letter !== undefined && typeof letter !== 'function') throw fail(CODES.BAD_CALL, 'line(string, options, letter)', __DEV__ && 'letter is a function (i, ch) returning that letter\'s values, not ' + show(letter));
      for (const [k, ok] of CHOICE) {
        if (opt[k] !== undefined && !ok.includes(opt[k])) throw fail(CODES.BAD_CALL, 'line(string, { ' + k + ' })', __DEV__ && k + ' is ' + ok.join(', ').replace(/, (\w+)$/, ' or $1') + ', not ' + show(opt[k]));
      }
      for (const k of ['tracking', 'wght', 'slnt'].concat(tags)) {
        if (opt[k] !== undefined && !isNum(opt[k])) throw fail(CODES.BAD_CALL, 'line(string, { ' + k + ' })', __DEV__ && k + ' is a number, not ' + show(opt[k]));
      }
      if (opt.color !== undefined && typeof opt.color !== 'string') throw fail(CODES.BAD_CALL, 'line(string, { color })', __DEV__ && 'color is a CSS colour, not ' + show(opt.color));
      const u = size / font.upm, tracking = (opt.tracking || 0) * font.upm;
      const chars = Array.from(str);
      const states = chars.map((ch, i) => {
        const g = font.glyphs[ch];
        if (!g) throw fail(CODES.BAD_CALL, 'line(string)', __DEV__ && 'the outlines hold no "' + ch + '"; bake them with it');
        const s = letter ? letter(i, ch) || {} : {};
        for (const k in s) {
          if (!LETTER.includes(k) && !tags.includes(k)) throw fail(CODES.BAD_CALL, 'letter(i, ch)', __DEV__ && "'" + k + "' is not a letter value; they are " + LETTER.join(', ') + held);
          if (s[k] !== undefined && (k === 'color' ? typeof s[k] !== 'string' : !isNum(s[k]))) throw fail(CODES.BAD_CALL, 'letter(i, ch).' + k, __DEV__ && k + ' is ' + (k === 'color' ? 'a CSS colour' : 'a number') + ', not ' + show(s[k]));
        }
        const values = font.axes.map((ax) => (s[ax.tag] !== undefined ? s[ax.tag] : opt[ax.tag] !== undefined ? opt[ax.tag] : ax.default));
        const slnt = s.slnt !== undefined ? s.slnt : opt.slnt;
        const corners = cornersOf(font, values);
        return { ch, g, s, corners, adv: blend(g.adv, corners), skew: !tags.includes('slnt') && isNum(slnt) ? Math.tan((-slnt * Math.PI) / 180) : 0 };
      });
      // Each letter's left edge, in font units from the line's start. With
      // 'fixed' spacing each letter's slot is its advance at the defaults.
      const fixed = opt.spacing === 'fixed';
      const homeCorners = cornersOf(font, font.axes.map((ax) => ax.default));
      const slotOf = (st) => blend(st.g.adv, homeCorners);
      const xs = [];
      let x = 0;
      states.forEach((st, i) => {
        xs.push(x);
        const next = states[i + 1];
        if (!next) return;
        const kern = font.kern && font.kern[st.ch + next.ch];
        x += (fixed ? slotOf(st) : st.adv + (kern ? blend(kern, st.corners) : 0)) + tracking;
      });
      const last = states[states.length - 1];
      const width = states.length ? x + (fixed ? slotOf(last) : last.adv) : 0;
      const start = opt.align === 'center' ? -width / 2 : opt.align === 'right' ? -width : 0;
      const base = opt.valign === 'middle' ? font.capHeight / 2 : 0;
      states.forEach((st, i) => {
        const s = st.s;
        const opacity = s.opacity === undefined ? 1 : s.opacity;
        if (!(opacity > 0)) return;
        // In 'fixed' spacing a letter sits in the middle of its slot.
        const slot = fixed ? (slotOf(st) - st.adv) / 2 : 0;
        const cx = (start + xs[i] + slot) * u + at[0] + (s.dx || 0);
        const cy = at[1] + (s.dy || 0);
        ctx.save();
        ctx.globalAlpha *= opacity;
        if (s.blur > 0) ctx.filter = 'blur(' + s.blur * scaleOf() + 'px)';
        ctx.fillStyle = s.color || opt.color || '#000';
        ctx.translate(cx, cy);
        // Scale and turn about the letter's middle (its advance, its caps).
        const mx = (st.adv / 2) * u, my = (-font.capHeight / 2 + base) * u;
        if (s.rotate || (s.scale !== undefined && s.scale !== 1)) {
          ctx.translate(mx, my);
          if (s.rotate) ctx.rotate((s.rotate * Math.PI) / 180);
          if (s.scale !== undefined) ctx.scale(s.scale, s.scale);
          ctx.translate(-mx, -my);
        }
        ctx.scale(u, u);
        ctx.translate(0, base);
        if (st.skew) ctx.transform(1, 0, -st.skew, 1, 0, 0);
        trace(st.g, st.corners);
        ctx.fill();
        ctx.restore();
      });
    }

    let ratio = 1;
    const scaleOf = () => ratio;
    const l = {
      el,
      draw(time) {
        if (!canvas.isConnected) return;
        const t = l.el ? scenes.localOf(l.el, time) : time;
        const cw = canvas.clientWidth, ch = canvas.clientHeight;
        if (!cw || !ch) return;
        ratio = canvas.closest('[data-kinetic-render]') ? 1 : self.devicePixelRatio || 1;
        const w = Math.round(cw * ratio), h = Math.round(ch * ratio);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        ctx.clearRect(0, 0, cw, ch);
        const m = { line(str, o, letter) { drawLine(str, o, letter); return m; } };
        lines(m, t);
      },
      dispose() { live.delete(l); },
    };
    live.add(l);
    const handle = {
      set(p) {
        if (!p || typeof p !== 'object') throw fail(CODES.BAD_CALL, 'set(options)', __DEV__ && 'options is { font, lines }, not ' + show(p));
        if ('scene' in p) throw fail(CODES.BAD_CALL, 'set({ scene })', __DEV__ && 'scene is given when the text is made');
        if (p.font !== undefined) { checkFont(p.font, 'set('); font = p.font; }
        if (p.lines !== undefined) lines = painterOf(p.lines, undefined, 'set(', true);
        return handle;
      },
      dispose: () => l.dispose(),
    };
    return handle;
  }

  return { text };
}
