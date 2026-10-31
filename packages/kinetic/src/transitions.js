/**
 * Transitions between clips, and into and out of a clip.
 *
 *   data-clip-transition="kind [direction] [ease]"   on a clip that starts while a sibling clip runs
 *   data-clip-enter="kind [direction] length [ease]" over the clip's first `length`
 *   data-clip-exit="kind [direction] length [ease]"  over its last `length`
 *   transition(kind, p, { direction })               the same styles, for use inside a scene
 *
 * A clip with data-clip-transition starts before the clip it replaces ends
 * (data-start="intro - 0.5"), and the overlap is the transition. The clip it
 * replaces is the one sibling with data-start whose window holds this clip's
 * start and ends before this clip does, so a backdrop that runs on past it
 * is never the one. Over the overlap the kind's incoming styles go on this
 * clip and its outgoing styles on the other. A length is seconds (0.6 or
 * 0.6s) or frames (18f, divided by the composition's fps).
 *
 * p runs from 0 on the window's first frame to 1 on its last captured frame,
 * 1/fps before the window ends, as a scene's progress does, and is then
 * eased (power2.inOut unless a token names another ease). At p = 1 the
 * incoming clip carries no style but cover's z-index, and at p = 0 the
 * outgoing clip carries none but reveal's z-index: each keeps the clip on
 * top above the other for the whole overlap, whatever their markup order.
 * Where two transitions write opacity on one clip at once, the two
 * multiply; for any other property the one applied last is used.
 *
 * Kinetic writes translate, scale and rotate, the individual transform
 * properties, never transform, so a transition composes with a transform
 * the clip has of its own; and opacity, clip-path, filter and z-index. Each
 * is written inline only inside the window. Outside it the property comes
 * off, and a value the clip had inline when Kinetic first wrote it, or one
 * written on it while the transition ran, comes back, in its own place in
 * the style attribute. Kinetic's own properties
 * are written in one fixed order, so the style attribute of a frame reads
 * the same whichever frame came before it (check() compares it as text).
 *
 * Three kinds mask the clip with a map (maps.js): luma, the brightness of
 * an image (url(path), invert, soft); halftone, dots on a turned grid that
 * open at once or from a side (a direction, the cell as 24px, the angle as
 * 45deg, soft); dissolve, seeded noise (the grain as 3px, soft). They write
 * filter, and in data-clip-transition only on the incoming clip, as wipe
 * does: the outgoing clip stays.
 *
 * Runs on every seek, with or without the HyperFrames runtime, after
 * clips.js and from its windows, and once before the page is shown
 * (readiness.js, through wf.js), which first loads the maps (load()). A clip
 * with an attribute that cannot be applied is left as it is, and
 * development builds say why once per clip (KN-115, KN-116). In
 * development, a property a transition wrote that something else writes
 * again in the same seek (a binding on the clip's tag, the scene's root:
 * block) or between two seeks inside the window is KN-156, once per clip.
 */
import { compositionRoot, frameRate } from './timing.js';
import { EPS, started, inWindow, NOT_CLIPS, clipName } from './clips.js';
import { ease } from './motion.js';
import { fmt } from './paths.js';
import { createMaps } from './maps.js';
import { CODES, warn, fail, show } from './diagnostics.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

const SIDES = ['from-right', 'from-left', 'from-top', 'from-bottom'];
const EDGES = ['from-left', 'from-right', 'from-top', 'from-bottom'];
const TURNS = ['clockwise', 'anticlockwise'];
// Each kind's directions, its default first; none for a kind that takes
// none. A halftone with no direction opens every dot at once.
const KINDS = {
  fade: [], push: SIDES, cover: SIDES, reveal: SIDES,
  wipe: EDGES,
  iris: [], clock: TURNS, zoom: [], blur: [], flip: [],
  luma: [], halftone: EDGES, dissolve: [],
};
const NAMES = Object.keys(KINDS).join(', ');
// The kinds that mask the clip with a map.
const MAPS = { luma: 1, halftone: 1, dissolve: 1 };
const SELECTOR = '[data-clip-transition], [data-clip-enter], [data-clip-exit]';

// The properties a transition writes, as transition() names them and as the
// style attribute does, in the order Kinetic writes them.
const PROPS = [['opacity', 'opacity'], ['translate', 'translate'], ['scale', 'scale'], ['rotate', 'rotate'], ['clipPath', 'clip-path'], ['filter', 'filter'], ['zIndex', 'z-index']];

// Four decimals, never -0.
const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const pc = (v) => fmt(v) + '%';

// clip-path for a clock wipe at p: the centre, 12 o'clock, every corner the
// hand has passed, and where the hand meets the box's edge. Angles are taken
// in the box's own percentages, so the hand reaches each corner at a
// multiple of 45 degrees whatever the box's shape.
const CORNERS = [[100, 0], [100, 100], [0, 100], [0, 0]];
function sweep(p, anti) {
  const a = (p < 0 ? 0 : p > 1 ? 1 : p) * 2 * Math.PI;
  const at = (x, y) => pc(anti ? 100 - x : x) + ' ' + pc(y);
  let s = '50% 50%, 50% 0%';
  CORNERS.forEach((c, k) => { if (a > (k + 0.5) * Math.PI / 2) s += ', ' + at(c[0], c[1]); });
  const sin = Math.sin(a), cos = Math.cos(a), m = 50 / Math.max(Math.abs(sin), Math.abs(cos));
  return 'polygon(' + s + ', ' + at(50 + m * sin, 50 - m * cos) + ')';
}

// The incoming and outgoing styles of a kind at eased progress p, with
// positions in percentages of the clip's own box.
function styles(kind, dir, p) {
  const q = 1 - p;
  const across = dir === 'from-left' || dir === 'from-right';
  const sign = dir === 'from-left' || dir === 'from-top' ? -1 : 1;
  const slide = (v) => (across ? pc(sign * v) + ' 0%' : '0% ' + pc(sign * v));
  let i = {}, o = {};
  if (kind === 'fade') {
    i = { opacity: r4(p) }; o = { opacity: r4(q) };
  } else if (kind === 'push' || kind === 'cover' || kind === 'reveal') {
    if (kind !== 'reveal') i = { translate: slide(100 * q) };
    if (kind !== 'cover') o = { translate: slide(-100 * p) };
    // The clip on top keeps z-index: 1 for the whole overlap, whichever of
    // the two comes first in the markup.
    if (kind === 'reveal') o.zIndex = 1;
    if (kind === 'cover') i.zIndex = 1;
  } else if (kind === 'wipe') {
    const side = (d) => (dir === d ? pc(100 * q) : '0%');
    i = { clipPath: 'inset(' + side('from-bottom') + ' ' + side('from-left') + ' ' + side('from-top') + ' ' + side('from-right') + ')' };
  } else if (kind === 'iris') {
    // A percentage radius is of the box's diagonal over the square root of
    // 2, so the corners are 100 / sqrt(2) percent from the centre. An ease
    // that overshoots (back, elastic, spring) takes p under 0, and the
    // browser drops a negative radius, so it is held at 0; blur's lengths too.
    i = { clipPath: 'circle(' + pc(Math.SQRT1_2 * 100 * Math.max(0, p)) + ' at 50% 50%)' };
  } else if (kind === 'clock') {
    i = { clipPath: sweep(p, dir === 'anticlockwise') };
  } else if (kind === 'zoom') {
    i = { scale: r4(1.15 - 0.15 * p), opacity: r4(p) }; o = { scale: r4(1 - 0.1 * p), opacity: r4(q) };
  } else if (kind === 'blur') {
    i = { filter: 'blur(' + fmt(16 * Math.max(0, q)) + 'px)', opacity: r4(p) }; o = { filter: 'blur(' + fmt(16 * Math.max(0, p)) + 'px)', opacity: r4(q) };
  } else {
    // flip: the outgoing clip turns edge-on in the first half, the incoming
    // one turns from edge-on in the second.
    i = { rotate: 'y ' + fmt(p < 0.5 ? 90 : 180 * q) + 'deg' }; o = { rotate: 'y ' + fmt(p > 0.5 ? -90 : -180 * p) + 'deg' };
  }
  if (p === 1) i = kind === 'cover' ? { zIndex: 1 } : {};
  if (p === 0) o = kind === 'reveal' ? { zIndex: 1 } : {};
  return { in: i, out: o };
}

const directions = (kind, dirs) => kind + (dirs.length ? ' takes ' + dirs.join(', ') : ' takes no direction');

// transition(kind, p, { direction }): { in, out }, the two style objects of
// a kind at p, the progress the caller has already eased.
export function transition(kind, p, options) {
  const dirs = typeof kind === 'string' && own(KINDS, kind) ? KINDS[kind] : null;
  if (!dirs) throw fail(CODES.BAD_CALL, 'transition(kind)', __DEV__ &&'kind is one of ' + NAMES + ', not ' + show(kind));
  if (typeof p !== 'number' || !Number.isFinite(p)) throw fail(CODES.BAD_CALL, "transition('" + kind + "', p)", __DEV__ && 'p is the eased progress, a finite number, not ' + show(p));
  if (options !== undefined && (!options || typeof options !== 'object')) throw fail(CODES.BAD_CALL, "transition('" + kind + "', p, options)", __DEV__ && 'options is { direction }, not ' + show(options));
  if (MAPS[kind]) throw fail(CODES.BAD_CALL, "transition('" + kind + "')", __DEV__ &&kind + ' masks a clip with a map, so it is for data-clip-transition, data-clip-enter and data-clip-exit');
  const dir = options && options.direction;
  if (dir !== undefined && !dirs.includes(dir)) throw fail(CODES.BAD_CALL, "transition('" + kind + "', p, { direction })", __DEV__ && directions(kind, dirs) + ', not ' + show(dir));
  return styles(kind, dir || dirs[0], p);
}

// ---- the attributes ------------------------------------------------------------

// A token is a word, or a word with a parenthesised argument list, so that
// cubic-bezier(0.4, 0, 0.2, 1) stays one ease and url(maps/burn.png) one map.
const TOKEN = /[^\s(]+\([^)]*\)|\S+/g;
const LENGTH = /^(\d+(?:\.\d+)?|\.\d+)(s|f)?$/;
const PX = /^(\d+(?:\.\d+)?|\.\d+)px$/;
const DEG = /^(-?(?:\d+(?:\.\d+)?|\.\d+))deg$/;
// What else each map kind takes, for the messages.
const EXTRA = { luma: 'url(path), invert and soft', halftone: 'a cell in px (24px), an angle in deg (45deg) and soft', dissolve: 'a grain in px (3px) and soft' };

// An attribute's value as { kind, dir, fn, len, frames }, with a map kind's
// url, invert, soft, size (the cell or grain) and angle, or a string that
// says why it cannot be applied ('' in production builds, which print
// nothing). `timed` is set for data-clip-enter and data-clip-exit, which take a length.
function parse(text, timed) {
  const toks = text.match(TOKEN) || [];
  const kind = toks[0];
  const dirs = kind && own(KINDS, kind) ? KINDS[kind] : null;
  if (!dirs) return __DEV__ ? (kind ? "'" + kind + "' is not a kind" : 'it names no kind') + '; the kinds are ' + NAMES : '';
  const map = MAPS[kind];
  const r = { kind, dir: kind === 'halftone' ? null : dirs[0], fn: null, len: 0, frames: false };
  const seen = {};
  for (let j = 1; j < toks.length; j++) {
    const tok = toks[j];
    let what, m;
    if (SIDES.includes(tok) || TURNS.includes(tok)) {
      if (!dirs.includes(tok)) return __DEV__ ? "'" + tok + "' is not a direction for " + kind + '; ' + directions(kind, dirs) : '';
      what = 'direction';
      r.dir = tok;
    } else if ((m = LENGTH.exec(tok))) {
      if (!timed) return __DEV__ ? "'" + tok + "' is a length, and data-clip-transition takes no length: the transition runs over the overlap that data-start makes" : '';
      if (!(Number(m[1]) > 0)) return __DEV__ ? "its length '" + tok + "' is 0" : '';
      what = 'length';
      r.len = Number(m[1]);
      r.frames = m[2] === 'f';
    } else if (tok.startsWith('url(')) {
      if (kind !== 'luma') return __DEV__ ? "'" + tok + "' is a map, and only luma takes one" : '';
      what = 'map';
      r.url = tok.slice(4, -1).trim().replace(/^(["'])(.*)\1$/, '$2');
    } else if (tok === 'invert' || tok === 'soft') {
      if (tok === 'invert' ? kind !== 'luma' : !map) return __DEV__ ? "'" + tok + "' is for a map, and " + (tok === 'invert' ? 'only luma takes it' : 'only luma, halftone and dissolve take it') : '';
      what = tok;
      r[tok] = true;
    } else if ((m = PX.exec(tok))) {
      what = kind === 'halftone' ? 'cell' : 'grain';
      if (kind !== 'halftone' && kind !== 'dissolve') return __DEV__ ? "'" + tok + "' is a size, and only halftone (its cell) and dissolve (its grain) take one" : '';
      if (!(Number(m[1]) > 0)) return __DEV__ ? 'its ' + what + " '" + tok + "' is 0" : '';
      r.size = Number(m[1]);
    } else if ((m = DEG.exec(tok))) {
      if (kind !== 'halftone') return __DEV__ ? "'" + tok + "' is an angle, and only halftone takes one" : '';
      what = 'angle';
      r.angle = Number(m[1]);
    } else {
      try { r.fn = ease(tok); } catch (_) {
        return __DEV__ ? "'" + tok + "' is not a direction, " + (timed ? 'a length ' : '') + (map ? EXTRA[kind] + ', ' : '') + 'or an ease; ' + directions(kind, dirs) : '';
      }
      what = 'ease';
    }
    if (seen[what]) return __DEV__ ? 'it gives two ' + what + 's' : '';
    seen[what] = 1;
  }
  if (timed && !seen.length) return __DEV__ ? 'it has no length; give one in seconds (0.6), seconds with s (0.6s) or frames with f (18f)' : '';
  if (kind === 'luma' && !r.url) return __DEV__ ? 'luma takes its map as url(path), and it has none' : '';
  r.fn = r.fn || ease('power2.inOut');
  return r;
}

export function createTransitions(clock, clips) {
  const parsed = new Map();    // 'e' or 't', then the attribute's text -> parse()
  const state = new Map();     // element -> { keys, own, wrote }: what Kinetic has written on it
  const warned = new WeakSet();
  const clashed = __DEV__ ? new WeakSet() : null;   // the clips KN-156 has named
  const maps = createMaps();

  function read(text, timed) {
    const key = (timed ? 'e' : 't') + text;
    let r = parsed.get(key);
    if (r === undefined) parsed.set(key, r = parse(text, timed));
    return r;
  }

  const bad = (code, attr, why) => ({ code, attr, why });

  // What an element's attributes do at this duration and fps: a list of
  // [target, from, to, parsed, 'in' or 'out', attribute], null for none, or
  // what is wrong, as { code, attr, why }.
  function effects(el, total, fps) {
    const tr = el.getAttribute('data-clip-transition'), en = el.getAttribute('data-clip-enter'), ex = el.getAttribute('data-clip-exit');
    if (!el.hasAttribute('data-start') || NOT_CLIPS.has(el.localName)) {
      // A data-clip-transition with no data-start is left alone.
      if (en == null && ex == null) return null;
      return bad(CODES.BAD_TRANSITION, en == null ? 'data-clip-exit' : 'data-clip-enter', __DEV__ && 'the element has no data-start, so it is no clip and has no window to ' + (en == null ? 'exit' : 'enter') + ' in');
    }
    if (tr != null && en != null) return bad(CODES.BAD_TRANSITION, 'data-clip-enter', __DEV__ && 'it has both data-clip-transition and data-clip-enter; data-clip-transition already brings it in, so keep one of the two');
    const w = clips.windowOf(el, total);
    const endOf = (o) => (o.end < Infinity ? o.end : total > 0 ? total : Infinity);
    const start = w.start, end = endOf(w);
    const out = [];
    if (tr != null) {
      const s = read(tr, false);
      if (typeof s === 'string') return bad(CODES.BAD_TRANSITION, 'data-clip-transition', s);
      const found = [];
      for (const sib of el.parentElement.children) {
        if (sib === el || !sib.hasAttribute('data-start') || NOT_CLIPS.has(sib.localName)) continue;
        const o = clips.windowOf(sib, total), e = endOf(o);
        if (started(start, o.start) && start < e - EPS && e < end - EPS) found.push([sib, e]);
      }
      if (found.length !== 1) {
        return bad(CODES.NO_PARTNER, 'data-clip-transition', __DEV__ && (found.length
          ? found.length + ' sibling clips are running when it starts, at ' + fmt(start) + ' s (' + found.map((f) => clipName(f[0])).join(', ') + '), so it is not clear which one it replaces'
          : 'no sibling clip is running when it starts, at ' + fmt(start) + ' s, and ends before it does, so the transition has no length'));
      }
      out.push([el, start, found[0][1], s, 'in', 'data-clip-transition']);
      if (!MAPS[s.kind]) out.push([found[0][0], start, found[0][1], s, 'out']);
    }
    for (const [attr, text, exit] of [['data-clip-enter', en, false], ['data-clip-exit', ex, true]]) {
      if (text == null) continue;
      const s = read(text, true);
      if (typeof s === 'string') return bad(CODES.BAD_TRANSITION, attr, s);
      const len = s.frames ? s.len / fps : s.len;
      if (exit && end === Infinity) return bad(CODES.BAD_TRANSITION, attr, __DEV__ && 'the clip has no end to exit at: no data-duration or data-end, and the composition has no data-duration');
      if (len > end - start + EPS) return bad(CODES.BAD_TRANSITION, attr, __DEV__ && 'its length, ' + fmt(len) + ' s, is longer than the clip, ' + fmt(end - start) + ' s');
      out.push(exit ? [el, end - len, end, s, 'out', attr] : [el, start, start + len, s, 'in', attr]);
    }
    return out;
  }

  // Writes one element's transition styles for this frame. When the set of
  // properties changes, Kinetic's own come off first and the new set goes on
  // in PROPS order; a property the clip had inline is written in its place
  // and put back when the transition no longer covers it.
  function write(el, style) {
    const css = {};
    let keys = '';
    for (const [k, name] of PROPS) if (own(style, k)) { css[name] = String(style[k]); keys += name + ' '; }
    let s = state.get(el);
    if (!s) {
      if (!keys) return;
      state.set(el, s = { keys: '', own: new Map(), wrote: null });
    }
    const st = el.style;
    // A value written on one of these properties since Kinetic wrote it,
    // between two seeks, becomes the clip's own, put back after the window.
    if (s.wrote) {
      for (const [name, v] of s.wrote) {
        const now = st.getPropertyValue(name);
        if (now === v) continue;
        if (now) s.own.set(name, [now, st.getPropertyPriority(name)]);
        else s.own.delete(name);
        if (__DEV__ && !clashed.has(el)) {
          clashed.add(el);
          warn(CODES.STYLE_CLASH, clipName(el) + ' has a transition, and its ' + name + ' was written as "' + now + '" while the transition ran; Kinetic shows the transition until its window ends and then puts that value back',
            "Set the clip's own value before its transition starts or after it ends, or put it on an inner element.");
        }
      }
    }
    if (s.keys !== keys) {
      for (const name of s.keys.split(' ')) {
        if (!name) continue;
        const o = s.own.get(name);
        if (!o) st.removeProperty(name);
        else if (!own(css, name)) { st.setProperty(name, o[0], o[1]); s.own.delete(name); }
      }
      for (const name in css) {
        if (!s.own.has(name) && st.getPropertyValue(name)) s.own.set(name, [st.getPropertyValue(name), st.getPropertyPriority(name)]);
      }
      s.keys = keys;
    }
    for (const name in css) st.setProperty(name, css[name]);
    if (!keys) state.delete(el);
    else s.wrote = Object.keys(css).map((name) => [name, st.getPropertyValue(name)]);
  }

  function apply(t) {
    const root = compositionRoot(document);
    const want = new Map();
    if (root) {
      const total = clock.store.duration;
      const fps = frameRate(root, clock.store.fps);
      for (const el of root.querySelectorAll(SELECTOR)) {
        const fx = effects(el, total, fps);
        if (!fx) continue;
        if (!Array.isArray(fx)) {
          if (__DEV__ && !warned.has(el)) {
            warned.add(el);
            warn(fx.code, clipName(el) + ' has ' + fx.attr + '="' + el.getAttribute(fx.attr) + '", and ' + fx.why + '; Kinetic leaves the clip as it is',
              fx.code === CODES.NO_PARTNER
                ? "Start the clip while exactly one sibling clip runs, with data-start=\"<that clip's id> - 0.5\"; a sibling that runs on past this clip's end, such as a backdrop, does not count. A clip that comes in over nothing takes data-clip-enter instead."
                : 'Write the kind first, then in any order a direction, a length (data-clip-enter and data-clip-exit only: 0.6, 0.6s or 18f) and an ease; luma takes url(path), invert and soft, halftone a cell (24px), an angle (45deg) and soft, and dissolve a grain (3px) and soft.');
          }
          continue;
        }
        for (const [target, from, to, s, side, attr] of fx) {
          // Half-open like a clip's window, and held on the composition's
          // final instant like a clip that runs to the end.
          if (!(inWindow(t, from, to) || (started(t, from) && total > 0 && to >= total - EPS))) continue;
          const last = to - from - 1 / fps;
          let p = last > 0 ? (t - from) / last : 1;
          p = p > 1 - 1e-9 ? 1 : p < 0 ? 0 : p;
          const e = p === 1 ? 1 : s.fn.seconds ? s.fn(p, t - from) : s.fn(p);
          // A map's mask is off where the clip is wholly shown: coming in
          // at 1, going out at 0.
          const style = !MAPS[s.kind] ? styles(s.kind, s.dir, e)[side]
            : e === (side === 'in' ? 1 : 0) ? {} : { filter: maps.style(target, attr, s, e, root) };
          // Two opacities on one clip multiply, each held to 0 to 1 first
          // as the browser holds a single one.
          const prev = want.get(target);
          if (prev && own(prev, 'opacity') && own(style, 'opacity')) style.opacity = r4(Math.min(1, Math.max(0, prev.opacity)) * Math.min(1, Math.max(0, style.opacity)));
          want.set(target, Object.assign(prev || {}, style));
        }
      }
    }
    maps.done();
    for (const el of state.keys()) if (!want.has(el)) write(el, {});
    for (const [el, style] of want) write(el, style);
  }

  // At readiness, check() and render(): each map of a transition that
  // applies built, drawn or fetched. Rejects with KN-117 for an image map
  // that fails.
  apply.load = () => {
    const root = compositionRoot(document);
    const jobs = [];
    if (root) {
      const fps = frameRate(root, clock.store.fps);
      for (const el of root.querySelectorAll(SELECTOR)) {
        const fx = effects(el, clock.store.duration, fps);
        if (!Array.isArray(fx)) continue;
        for (const [target, , , s, , attr] of fx) if (MAPS[s.kind]) jobs.push(maps.prepare(target, attr, s, root));
      }
    }
    return Promise.all(jobs);
  };

  clock.onBeforeSeek(apply);
  // The maps follow each clip's box as the seek has laid it out.
  clock.onAfterSeek(maps.settle);
  apply.settle = maps.settle;

  // Development: a property this seek's transition wrote that reads
  // differently once the seek has settled was written again by something
  // else, and the two now overwrite each other on every seek.
  if (__DEV__) {
    clock.onAfterSeek(() => {
      for (const [el, s] of state) {
        if (clashed.has(el) || !s.wrote) continue;
        const hit = s.wrote.find((w) => el.style.getPropertyValue(w[0]) !== w[1]);
        if (!hit) continue;
        clashed.add(el);
        warn(CODES.STYLE_CLASH, clipName(el) + ' has a transition, and its ' + hit[0] + ' was written again after Kinetic wrote it on this seek, by a binding on its tag or its scene\'s root: block; the two overwrite each other, so the frame depends on which wrote last',
          "Put the scene's own styling on an inner element, and leave the clip's tag to the transition.");
      }
    });
  }

  return apply;
}
