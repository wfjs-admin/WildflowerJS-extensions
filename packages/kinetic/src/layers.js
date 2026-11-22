/**
 * layers: a composition written as layer records, drawn each frame.
 *
 *   wildflower.kinetic.layers.scene(name, record, { fns })   a scene of that name that draws the record
 *   wildflower.kinetic.layers(record, { root, target, canvas, fns })   returns { seek(seconds), refresh(), dispose(), stage }
 *
 * A record with solids needs kinetic.25d.js on the page.
 */
// layers(record, options):
//   target, canvas: the solids stage's SVG group and its grain canvas (records with solids);
//   root: the element whose `src` selectors find a record's HTML and SVG layers, and whose `.world` the camera moves.
// Time inside a record is in seconds, or in frames with unit: 'frame'.
//
// Values. A field holds one of:
//   a number; a string (a name, or a sum of names and numbers such as 'OUT + R', '0.6R' or 'hit1 - beat 1', where a
//   number before a name multiplies it, and + or - between terms has spaces round it); a list (each part a value);
//   { keys: [[x, v], ...], by, ease }: straight between keys (or eased), held past both ends; x is the time, or the
//     value of `by`; a value ['hold', v] holds until the next key instead of moving toward it;
//   { from: 'layer.path', scale, add, time }: another layer's value, read `time` later (or earlier);
//     'params.name' reads the placement's parameter, 'self.name' a value the renderer measures for this layer;
//   { rate }: so much a second; { multiply: [...] } or { add: [...] }: values combined;
//   { focus: { depth, max } }: the blur for this layer's distance from the camera's focus plane.
// Names resolve in this order: the placement's parameters, the record's constants, its shared values, 'end' and
// 'last', then the composition's markers (timeOf()'s names: 'hit1', 'beat 4'). A string in content.text is the
// text itself, and a bare 'end' or 'last' in a CSS value or an attribute is the keyword.
// Colors resolve through roles (placement, then comp, then the one above) to swatches, wherever a color goes.
import { fail as knFail, warn } from './diagnostics.js';
import { isLength } from './motion.js';

// wf is the framework; K is Kinetic's public object, which the runtime draws with.
export function createLayers(wf, K) {
  // A record's errors, each naming the layer and the field: KN-161 to KN-169.
  const CODES = { RECORD: 'KN-161', FIELD: 'KN-162', NAME: 'KN-163', LINK: 'KN-164', VALUE: 'KN-165', FUNCTION: 'KN-166', ORDER: 'KN-167', ELEMENT: 'KN-168', LOOP: 'KN-169', CALL: 'KN-100' };
  const fail = (code, where, what) => knFail(code, 'layers: ' + where, what);
  const show = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };

  const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const hexOf = (v) => '#' + v.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  const START = { plane: { size: 1 }, disc: { radius: 1 }, sector: { radius: 1, from: 0, to: 360 }, capsule: { radius: 1, length: 0 } };
  const SOLID = (k) => k === 'solid' || k === 'null', DOM = (k) => k === 'html' || k === 'svg' || k === 'path' || k === 'text' || k === 'lottie';
  const RAD = Math.PI / 180;
  // A vector turned as a CSS rotateY(y) rotateX(x) turns it: about x first, then y.
  const turnXY = (v, rx, ry) => {
    const p = rx * RAD, a = ry * RAD, y = v[1] * Math.cos(p) - v[2] * Math.sin(p), z1 = v[1] * Math.sin(p) + v[2] * Math.cos(p);
    return [v[0] * Math.cos(a) + z1 * Math.sin(a), y, -v[0] * Math.sin(a) + z1 * Math.cos(a)];
  };
  const vadd = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const vlen = (v) => Math.hypot(v[0], v[1], v[2]);
  const vmix = (a, b, p) => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
  const polyOf = (d) => d.trim().slice(1).split(/\s*L\s*/).map((s) => s.trim().split(/\s+/).map(Number));

  // What a record may hold, checked when it is handed over: the keys of the record, of each kind of layer, and of a
  // layer's place, look and content.
  const TOP = ['id', 'size', 'fps', 'duration', 'unit', 'snap', 'loop', 'constants', 'shared', 'swatches', 'roles', 'looks', 'curves', 'presets', 'bands', 'stores', 'queries', 'inputs', 'props', 'steps', 'finish', 'shutter', 'stage', 'layers', 'comps'];
  // The solids stage: where it draws, and its view (solids()' camera), light, rim, glows and drop shadow, worked out once.
  const STAGE = ['src', 'grain', 'view', 'light', 'rim', 'glows', 'dropShadow'];
  const KINDS = {
    solid: ['parent', 'band', 'hidden', 'place', 'look', 'content'],
    null: ['parent', 'place', 'controls'],
    comp: ['comp', 'start', 'params', 'roles', 'parent', 'repeat', 'src'],
    camera: ['perspective', 'moves', 'focus'],
    html: ['parent', 'band', 'src', 'size', 'group', 'stagger', 'delay', 'place', 'look', 'content', 'repeat', 'animate'],
    svg: ['parent', 'src', 'delay', 'place', 'look', 'content'],
    path: ['parent', 'content', 'look'],
    text: ['parent', 'src', 'delay', 'place', 'look', 'content', 'animate'],
    lottie: ['parent', 'src', 'place', 'look', 'content'],
  };
  const PLACE = ['position', 'rotate', 'scale', 'pivot', 'translate', 'shift', 'perspective'];
  const LOOK = ['opacity', 'color', 'side', 'albedo', 'glow', 'casts', 'accepts', 'shade', 'clip', 'blur', 'style', 'trim', 'preset', 'words', 'effect', 'backdrop', 'draw', 'boil', 'smear', 'trails', 'repeat', 'transition'];
  // Kinetic's layer calls a look can name, each on the layer's own element: a canvas for effect, shade and draw.
  const ENGINES = ['effect', 'shade', 'backdrop', 'draw'];
  const CONTENT = { solid: ['shape', 'radius', 'size', 'from', 'to', 'length', 'inner', 'faces', 'sides', 'depth', 'taper', 'height', 'wedges', 'around', 'bands', 'along'], html: ['text'], path: ['points', 'between', 'head'], text: ['text', 'split', 'typewriter', 'scramble', 'captions', 'font', 'at', 'size', 'align', 'valign', 'tracking', 'spacing', 'color'], lottie: ['path', 'renderer', 'start', 'rate', 'loop'] };
  // A text layer on a canvas, drawn by Kinetic's text() from baked outlines: content.font, the line's options, and
  // per letter the animator's place, look and font axes.
  const LINE = ['at', 'size', 'align', 'valign', 'tracking', 'spacing', 'color'];
  // Captions: a word-timed transcript (SRT or WebVTT text, or cues), grouped into lines as Kinetic's captions() groups it.
  const CAPTIONS = ['srt', 'cues', 'maxWords', 'maxChars', 'maxGap', 'sentences', 'hold'];
  const WORD_STATES = ['active', 'past', 'future'];
  // A text layer's animator: per-part tracks, each part starting stagger()'s delay after `start`.
  const ANIMATE = ['start', 'each', 'total', 'from', 'ease', 'grid', 'axis', 'seed', 'spaces', 'place', 'look', 'axes'];
  const PART = { place: ['translate', 'rotate', 'scale'], look: ['opacity', 'blur', 'color', 'class', 'style'] };
  const SPLITS = ['letter', 'word'];
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const isForm = (v) => Array.isArray(v.keys) || typeof v.from === 'string' || 'rate' in v || Array.isArray(v.multiply) || Array.isArray(v.add)
    || Array.isArray(v.min) || Array.isArray(v.max) || 'floor' in v || isObj(v.focus) || typeof v.startOf === 'string' || typeof v.follow === 'string'
    || typeof v.call === 'string' || (Array.isArray(v.at) && Array.isArray(v.to)) || isObj(v.stagger) || isObj(v.sweep)
    || 'level' in v || isObj(v.spectrum) || isObj(v.beat) || isObj(v.wiggle) || (v.on !== undefined && Object.keys(v).length > 1);
  // A solid's color, told from a value form by its shape: a gradient, { gradient: [stops], angle } or { gradient, from, to }.
  const GRADIENT = ['gradient', 'angle', 'from', 'to'];
  const isGradient = (v) => isObj(v) && 'gradient' in v;
  // One side's look, { color, shade }, told from a value form or a gradient written as its color.
  const isSide = (v) => isObj(v) && !isForm(v) && !isGradient(v);
  // A <template>'s element to copy: in HTML its content's first element; inside an <svg>, where the parser makes the
  // template an inert element of its own, its first child.
  const proto = (tpl) => (tpl.content ? tpl.content.firstElementChild : tpl.firstElementChild);
  // Development: a length in a style given a number, or a track of numbers, with no unit (KN-122), once for each
  // style. The browser drops such a value, and the element keeps what it had. 0 needs no unit, and a bare number
  // on lineHeight is a multiple of the font size. Text, a link and a function may give the unit themselves.
  const lintedStyles = new WeakSet();
  function lintStyle(style, where) {
    if (!isObj(style) || lintedStyles.has(style)) return;
    lintedStyles.add(style);
    for (const k in style) {
      const v = style[k], one = typeof v === 'number';
      if (!isLength(k) || (isObj(v) && v.unit !== undefined) || (one && /^line-?[Hh]eight$/.test(k))) continue;
      const to = one ? [v] : !isObj(v) ? [] : Array.isArray(v.to) ? v.to : !Array.isArray(v.keys) ? []
        : v.keys.map((key) => { const kv = Array.isArray(key) ? key[1] : null; return Array.isArray(kv) && kv[0] === 'hold' ? kv[1] : kv; });
      const n = to.every((x) => typeof x === 'number') && to.find((x) => x !== 0);
      if (!n) continue;
      if (one) warn('KN-122', 'layers: ' + where + '.' + k + ' is a number with no unit, and ' + k + ' takes a length, so the browser ignores ' + n, 'Write it with its unit: ' + k + ": '" + n + "px'.");
      else warn('KN-122', 'layers: ' + where + '.' + k + ' gives numbers with no unit, and ' + k + ' takes a length, so the browser ignores a value such as ' + n, "Add unit: 'px' (or '%', 'em', 'rem') beside its keys: " + k + ": { …, unit: 'px' }.");
    }
  }
  function check(record, opts) {
    if (!isObj(record)) throw fail(CODES.RECORD, 'the scene', __DEV__ && ('the scene is an object of its layers and their settings, not ' + show(record)));
    for (const k in record) if (!TOP.includes(k)) throw fail(CODES.RECORD, k, __DEV__ && ("'" + k + "' is not one of the scene's keys; it takes " + TOP.join(', ')));
    if (record.stage !== undefined) {
      if (!isObj(record.stage)) throw fail(CODES.FIELD, 'stage', __DEV__ && ('stage is an object of ' + STAGE.join(', ') + ', not ' + show(record.stage)));
      for (const k in record.stage) if (!STAGE.includes(k)) throw fail(CODES.FIELD, 'stage.' + k, __DEV__ && ("'" + k + "' is not one of the stage's keys; it takes " + STAGE.join(', ')));
      const ds = record.stage.dropShadow;
      if (ds !== undefined && ds !== false && !isObj(ds)) throw fail(CODES.FIELD, 'stage.dropShadow', __DEV__ && ('dropShadow is { blur, color, opacity, offset }, or false, not ' + show(ds)));
    }
    if (typeof record.id !== 'string' || !record.id) throw fail(CODES.RECORD, 'id', __DEV__ && ('id is the piece\'s name, a string, not ' + show(record.id)));
    if (!(Array.isArray(record.size) && record.size.length === 2 && record.size.every((n) => typeof n === 'number' && n > 0))) throw fail(CODES.RECORD, 'size', __DEV__ && ('size is [width, height] in px, not ' + show(record.size)));
    if (!(typeof record.duration === 'number' && record.duration > 0)) throw fail(CODES.RECORD, 'duration', __DEV__ && ('duration is a number above 0, in the scene\'s unit, not ' + show(record.duration)));
    if (record.unit !== undefined && record.unit !== 'second' && record.unit !== 'frame') throw fail(CODES.RECORD, 'unit', __DEV__ && ("unit is 'second' (the default) or 'frame', not " + show(record.unit)));
    if (!Array.isArray(record.layers)) throw fail(CODES.RECORD, 'layers', __DEV__ && ('layers is a list of layers, not ' + show(record.layers)));
    const comps = record.comps || {}, bands = record.bands || [];
    const walk = (layers, where, inside) => {
      const ids = new Set();
      layers.forEach((L, i) => {
        const at = where + '[' + i + ']';
        if (!isObj(L)) throw fail(CODES.RECORD, at, __DEV__ && ('a layer is an object, not ' + show(L)));
        if (typeof L.id !== 'string' || !L.id) throw fail(CODES.RECORD, at + '.id', __DEV__ && 'every layer has an id, a string');
        const me = where + '.' + L.id;
        if (ids.has(L.id)) throw fail(CODES.RECORD, me, __DEV__ && ('two layers here are named ' + show(L.id)));
        ids.add(L.id);
        const keys = KINDS[L.kind];
        if (!keys) throw fail(CODES.RECORD, me + '.kind', __DEV__ && ('kind is one of ' + Object.keys(KINDS).join(', ') + ', not ' + show(L.kind)));
        for (const k in L) if (k !== 'id' && k !== 'kind' && k !== 'life' && !keys.includes(k)) throw fail(CODES.FIELD, me + '.' + k, __DEV__ && ("a layer of kind '" + L.kind + "' does not take '" + k + "'; it takes id, kind, life, " + keys.join(', ')));
        for (const [field, allowed] of [['place', PLACE], ['look', LOOK], ['content', CONTENT[L.kind]]]) {
          if (L[field] === undefined || !allowed) continue;
          if (!isObj(L[field])) throw fail(CODES.FIELD, me + '.' + field, __DEV__ && (field + ' is an object, not ' + show(L[field])));
          for (const k in L[field]) if (!allowed.includes(k)) throw fail(CODES.FIELD, me + '.' + field + '.' + k, __DEV__ && ("'" + k + "' is not in a " + L.kind + " layer's " + field + '; it takes ' + allowed.join(', ')));
        }
        const lk = L.look || {};
        if (__DEV__) {
          lintStyle(lk.style, me + '.look.style');
          lintStyle(isObj(L.animate) && isObj(L.animate.look) && L.animate.look.style, me + '.animate.look.style');
        }
        // A solid's shade is its marks; every other layer call draws on an html layer's element.
        const misplaced = ENGINES.find((k) => lk[k] !== undefined && L.kind !== 'html' && !(k === 'shade' && L.kind === 'solid'));
        if (misplaced) throw fail(CODES.FIELD, me + '.look.' + misplaced, __DEV__ && ('look.' + misplaced + ' draws on an html layer (its element a canvas, or any element for backdrop), not a ' + L.kind + ' layer'));
        if (L.kind === 'html' && ENGINES.filter((k) => lk[k] !== undefined).length > 1) throw fail(CODES.FIELD, me + '.look', __DEV__ && ('one element takes one of ' + ENGINES.join(', ') + '; give each its own layer'));
        for (const k of ENGINES) if (L.kind === 'html' && lk[k] !== undefined && !isObj(lk[k])) throw fail(CODES.FIELD, me + '.look.' + k, __DEV__ && (k + ' is an object of its options, not ' + show(lk[k])));
        if (L.kind === 'html' && lk.effect && lk.effect.kind === undefined && lk.effect.options === undefined) throw fail(CODES.FIELD, me + '.look.effect.kind', __DEV__ && "effect names its kind: 'halftone', 'stipple', 'splatter', 'dither', 'duotone' or 'boil'");
        if (lk.boil !== undefined && L.kind !== 'svg') throw fail(CODES.FIELD, me + '.look.boil', __DEV__ && 'look.boil moves the outline of an svg layer\'s d; for a canvas, use look.effect with kind \'boil\'');
        if ((L.kind === 'html' || L.kind === 'svg' || L.kind === 'text' || L.kind === 'lottie') && L.src === undefined) throw fail(CODES.FIELD, me + '.src', __DEV__ && ((L.kind === 'text' || L.kind === 'lottie' ? 'a ' : 'an ') + L.kind + ' layer names the element it draws: src, a selector'));
        if (L.kind === 'html' && (L.repeat !== undefined || L.animate !== undefined)) {
          // Copies born over time: one every `every`, each living `life`, its animator in its own time.
          const r = L.repeat, a = L.animate;
          const born = isObj(r) && r.every !== undefined && r.life !== undefined && Object.keys(r).every((k) => k === 'every' || k === 'life');
          const counted = isObj(r) && r.count !== undefined && Object.keys(r).length === 1;
          if (!born && !counted) throw fail(CODES.FIELD, me + '.repeat', __DEV__ && ('an html layer\'s repeat is { every, life }, a copy born every so often and each living so long, or { count }' + (r === undefined ? '; animate plays on those copies' : ', not ' + show(r))));
          if (L.content && L.content.text !== undefined) throw fail(CODES.FIELD, me + '.content.text', __DEV__ && 'a repeated layer holds its copies, which text would take the place of; put the words in its <template>');
          if (a !== undefined) for (const k in a) {
            if (!PART[k]) throw fail(CODES.FIELD, me + '.animate.' + k, __DEV__ && ("a copy's animate takes place and look, not '" + k + "'"));
            for (const p in a[k]) if (!PART[k].includes(p)) throw fail(CODES.FIELD, me + '.animate.' + k + '.' + p, __DEV__ && ("'" + p + "' is not in a copy's " + k + '; it takes ' + PART[k].join(', ')));
          }
        }
        if (L.kind === 'text') {
          const c = L.content || {}, a = L.animate;
          if (c.split !== undefined && !SPLITS.includes(c.split)) throw fail(CODES.FIELD, me + '.content.split', __DEV__ && ("split is 'letter' or 'word', not " + show(c.split)));
          if (c.split !== undefined && (c.typewriter || c.scramble)) throw fail(CODES.FIELD, me + '.content', __DEV__ && 'a split text is not typed or scrambled yet; split it, or type or scramble it whole');
          if (c.captions !== undefined) {
            const cp = c.captions;
            if (!isObj(cp)) throw fail(CODES.FIELD, me + '.content.captions', __DEV__ && ('captions is an object, not ' + show(cp)));
            for (const k in cp) if (!CAPTIONS.includes(k)) throw fail(CODES.FIELD, me + '.content.captions.' + k, __DEV__ && ("'" + k + "' is not in captions; it takes " + CAPTIONS.join(', ')));
            if ((cp.srt === undefined) === (cp.cues === undefined)) throw fail(CODES.FIELD, me + '.content.captions', __DEV__ && 'captions reads one transcript: srt, the text of an SRT or WebVTT file, or cues, a list of { text, start, end }');
            if (c.text !== undefined || c.split !== undefined || c.typewriter || c.scramble) throw fail(CODES.FIELD, me + '.content', __DEV__ && 'a captions layer takes its words from the transcript; it has no text, split, typewriter or scramble');
          }
          const lw = L.look && L.look.words;
          if (lw !== undefined) {
            if (c.captions === undefined) throw fail(CODES.FIELD, me + '.look.words', __DEV__ && 'look.words styles a caption line\'s words; the layer has no captions');
            for (const k in lw) if (!WORD_STATES.includes(k)) throw fail(CODES.FIELD, me + '.look.words.' + k, __DEV__ && ("a word's state is " + WORD_STATES.join(', ') + ', not ' + show(k)));
          }
          if (a !== undefined) {
            if (!isObj(a)) throw fail(CODES.FIELD, me + '.animate', __DEV__ && ('animate is an object, not ' + show(a)));
            if (c.split === undefined && c.font === undefined) throw fail(CODES.FIELD, me + '.animate', __DEV__ && "animate moves the parts of a split text, or the letters of one drawn on a canvas from content.font; give content a split, 'letter' or 'word', or a font");
            for (const k in a) if (!ANIMATE.includes(k)) throw fail(CODES.FIELD, me + '.animate.' + k, __DEV__ && ("'" + k + "' is not in a text layer's animate; it takes " + ANIMATE.join(', ')));
            for (const f in PART) {
              if (a[f] === undefined) continue;
              if (!isObj(a[f])) throw fail(CODES.FIELD, me + '.animate.' + f, __DEV__ && (f + ' is an object, not ' + show(a[f])));
              for (const k in a[f]) if (!PART[f].includes(k)) throw fail(CODES.FIELD, me + '.animate.' + f + '.' + k, __DEV__ && ("'" + k + "' is not in a part's " + f + '; it takes ' + PART[f].join(', ')));
            }
          }
        }
        if (L.kind === 'solid' && typeof L.band === 'string' && !bands.includes(L.band)) throw fail(CODES.ORDER, me + '.band', __DEV__ && ('band ' + show(L.band) + ' is not one of the scene\'s bands (' + bands.join(', ') + ')'));
        for (const k of ['side', 'casts', 'accepts']) if (lk[k] !== undefined && L.kind !== 'solid') throw fail(CODES.FIELD, me + '.look.' + k, __DEV__ && ('look.' + k + ' is a solid layer\'s, not a ' + L.kind + ' layer\'s'));
        if (L.kind === 'solid') {
          const cl = lk.clip;
          if (isObj(cl)) for (const q in cl) if (q !== 'layer' && q !== 'invert') throw fail(CODES.FIELD, me + '.look.clip.' + q, __DEV__ && ("look.clip is a layer's id, or { layer, invert }, not with '" + q + "'"));
          // Its colors: look.color and each side's, a gradient among them written as one.
          const sd = lk.side, paints = [['color', lk.color]];
          if (sd !== undefined && !isObj(sd) && !Array.isArray(sd)) throw fail(CODES.FIELD, me + '.look.side', __DEV__ && ('side is an object of the shape\'s sides by name, such as { front: \'coral\' }, or a list for a sphere\'s wedges or bands, not ' + show(sd)));
          for (const k in sd || {}) {
            const s = sd[k];
            if (!isSide(s)) { paints.push(['side.' + k, s]); continue; }
            for (const q in s) if (q !== 'color' && q !== 'shade') throw fail(CODES.FIELD, me + '.look.side.' + k + '.' + q, __DEV__ && ("a side takes color and shade, not '" + q + "'"));
            paints.push(['side.' + k + '.color', s.color]);
          }
          for (const [at, v] of paints) {
            if (!isGradient(v)) continue;
            for (const q in v) if (!GRADIENT.includes(q)) throw fail(CODES.FIELD, me + '.look.' + at + '.' + q, __DEV__ && ("a gradient takes " + GRADIENT.join(', ') + ", not '" + q + "'"));
            if (!(Array.isArray(v.gradient) && v.gradient.length > 1)) throw fail(CODES.VALUE, me + '.look.' + at + '.gradient', __DEV__ && ('gradient is a list of two or more stops, each a color or [offset, color], not ' + show(v.gradient)));
          }
        }
        if (L.kind === 'comp') {
          if (!comps[L.comp]) throw fail(CODES.RECORD, me + '.comp', __DEV__ && ('no comp is named ' + show(L.comp)));
          if (inside.includes(L.comp)) throw fail(CODES.ORDER, me + '.comp', __DEV__ && ('comp ' + show(L.comp) + ' is placed inside itself'));
          const rp = L.repeat;
          if (rp !== undefined && !(isObj(rp) && (Array.isArray(rp.over) || typeof rp.over === 'string' || isObj(rp.over) ? rp.count === undefined : Number.isInteger(rp.count) && rp.count > 0) && Object.keys(rp).every((k) => k === 'over' || k === 'count'))) {
            throw fail(CODES.FIELD, me + '.repeat', __DEV__ && ('repeat is { over: [rows] }, { over: \'query.path\' } or { count: a whole number above 0 }, not ' + show(rp)));
          }
          if (L.src !== undefined && rp === undefined) throw fail(CODES.FIELD, me + '.src', __DEV__ && 'src on a comp names the container its repeated copies are made in; this comp is not repeated');
          walk(comps[L.comp].layers || [], 'comps.' + L.comp, inside.concat(L.comp));
        }
      });
    };
    walk(record.layers, 'layers', []);
    // Every function the record calls is one it was handed.
    (function walk(v, at) {
      if (!v || typeof v !== 'object') return;
      if (isObj(v) && typeof v.call === 'string' && !(opts.fns && typeof opts.fns[v.call] === 'function')) throw fail(CODES.FUNCTION, at, __DEV__ && ('it calls ' + show(v.call) + ', and no function of that name was handed over in fns'));
      for (const k in v) walk(v[k], at ? at + '.' + k : k);
    })(record, '');
  }

  function layers(record, opts) {
    check(record, opts || {});
    const fps = record.fps || 30, perSecond = record.unit === 'frame' ? fps : 1, D = record.duration;
    const wrap = !!(record.loop && record.loop.wrap);
    const constants = record.constants || {}, shared = record.shared || {}, swatches = record.swatches || {};
    const bands = record.bands || [];

    // ---- placements: every comp placed is a scope; every layer in it, a node ----
    const nodes = [];
    // A query's, a store's, an input's or a prop's field by its path, for the rows a repeat is made from.
    function field(path, where) {
      const [id, ...rest] = path.split('.');
      let f = (record.queries || []).includes(id) ? wf.getQuery(id) : (record.stores || []).includes(id) ? wf.getStore(id)
        : (id === 'inputs' || id === 'props') && record[id] ? (opts.scene && opts.scene[id]) || {} : undefined;
      if (f === undefined) throw fail(CODES.LINK, where, __DEV__ && ('repeat.over reads ' + show(path) + ', and the scene reads no query, store, inputs or props named ' + show(id)));
      for (const k of rest) f = f && f[k];
      return f;
    }
    const rowsOf = (f, what, where) => {
      if (!Array.isArray(f)) throw fail(CODES.VALUE, where, __DEV__ && ('repeat.over ' + what + ', which is not a list: ' + show(f)));
      return f;
    };
    const source = (path, where) => rowsOf(field(path, where), __DEV__ && ('reads ' + show(path)), where);
    // Rows a function makes, its arguments plain values or links to a query's or a store's field.
    function made(v, where) {
      const fn = opts.fns && opts.fns[v.call];
      if (typeof v.call !== 'string' || typeof fn !== 'function') throw fail(CODES.FUNCTION, where, __DEV__ && ('repeat.over calls ' + show(v.call) + ', and no function of that name was handed over in fns'));
      const rows = fn(...(v.args || []).map((a) => (isObj(a) && typeof a.from === 'string' ? field(a.from, where) : a)));
      return rowsOf(rows, __DEV__ && ('is what ' + show(v.call) + ' returned'), where);
    }
    function place(scope) {
      for (const rec of scope.comp.layers) {
        if (rec.kind === 'comp') {
          const comp = record.comps[rec.comp];
          if (!comp) throw fail(CODES.RECORD, scope.prefix + rec.id, __DEV__ && ('no comp is named ' + show(rec.comp)));
          // A repeat places the comp once per row (over) or per index (count). Each copy reads i, n and its row's
          // fields (a row that is no object is `item`) as parameters, literally; with src, each copy is a clone of
          // that container's <template>, and its layers find their elements inside it.
          const rp = rec.repeat;
          // Rows written in the record, read from a query or a store by its path ('sales.rows'), or made from them by
          // a function ({ call: 'ticksOf', args: [{ from: 'sales.rows' }] }).
          const where = scope.prefix + rec.id;
          const over = !rp ? null : typeof rp.over === 'string' ? source(rp.over, where) : isObj(rp.over) ? made(rp.over, where) : rp.over;
          const rows = !rp ? [null] : Array.isArray(over) ? over : Array.from({ length: rp.count }, (_, j) => j);
          rows.forEach((row, j) => {
            // A copy reads i and n as its place among the copies, so a row cannot name a field i or n.
            if (isObj(row) && ('i' in row || 'n' in row)) throw fail(CODES.FIELD, where + '.repeat.over[' + j + ']', __DEV__ && ("a row's field is not named i or n: a copy reads those as its index and the count; name it otherwise"));
            const child = {
              comp, parent: scope, start: rec.start || 0, prefix: scope.prefix + rec.id + (rp ? '#' + j : '') + '/', ids: new Map(),
              roles: Object.assign({}, scope.roles, comp.roles, rec.roles),
              params: Object.assign({}, comp.params, rec.params),
              rows: rp ? Object.assign(isObj(row) ? Object.assign({}, row) : { item: row }, { i: j, n: rows.length }) : null,
              copy: rp && rec.src !== undefined ? { src: rec.src, j } : null,
              under: rec.parent === undefined ? scope.under : rec.parent === null ? null : { name: rec.parent, scope },
            };
            scopes.push(child);
            place(child);
          });
        } else {
          const node = { rec, scope, name: scope.prefix + rec.id, seq: nodes.length, cache: {} };
          scope.ids.set(rec.id, node);
          nodes.push(node);
        }
      }
    }
    const root = { comp: record, parent: null, start: 0, at: 0, prefix: '', ids: new Map(), roles: record.roles || {}, params: {}, under: null };
    const scopes = [];
    place(root);

    // ---- values ----
    let self = {};   // what the renderer measured for the layer being worked out now
    // A store's or a query's field as read in this seek: it holds still through a seek, so each copy that reads it
    // reads it once between them all. Emptied at each seek and refresh.
    const held = new Map();
    // The field as plain data: its lists and plain objects copied once, anything else (a Date, a Map) as it is. A
    // read through a store costs many times a plain one, and a function handed rows may walk them for every copy.
    const plain = (v, seen) => {
      if (v === null || typeof v !== 'object') return v;
      const list = Array.isArray(v), proto = Object.getPrototypeOf(v);
      if (!list && proto !== Object.prototype && proto !== null) return v;
      let out = seen.get(v);
      if (!out) { seen.set(v, out = list ? [] : {}); for (const k of Object.keys(v)) out[k] = plain(v[k], seen); }
      return out;
    };
    // A value form worked out once a seek for all who read it at the same time with the same options (the beat a
    // ring of copies pulses on): its last result, kept on the form.
    let seekNo = 0;
    const once = new WeakMap();
    // `d` is the data it was worked out from, when that can differ between readers (a copy's own beats).
    const memo = (v, t, key, fn, d) => {
      const m = once.get(v);
      if (m && m.s === seekNo && m.t === t && m.k === key && m.d === d) return m.x;
      const x = fn();
      once.set(v, { s: seekNo, t, k: key, x, d });
      return x;
    };
    const matched = new WeakMap();   // path tracks' keys, matched once for the options they were matched with
    // The layer being drawn, so an error found while drawing names it, and the value being worked out for it (the
    // outermost one), so the error names the field that holds it.
    let current = '', forming;
    // Where in an object a value sits, as a path of keys: an object by its identity, a name or a sum by its text.
    const pathTo = (o, x, at) => {
      for (const k in o) {
        const v = o[k], p = at ? at + '.' + k : k;
        if (v === x) return p;
        if (v && typeof v === 'object') { const found = pathTo(v, x, p); if (found) return found; }
      }
      return '';
    };
    // An error thrown while a layer's value was worked out, with the layer and the field ahead of what it says: the
    // layers' own gains the field, a helper's (interpolate, loop, a function handed over) the layer too, its code kept.
    const located = new WeakSet();
    const locate = (e) => {
      const node = current && nodes.find((n) => n.name === current);
      if (!node || !(e instanceof Error) || located.has(e)) return e;
      located.add(e);
      const field = forming === undefined ? '' : pathTo(node.rec, forming, ''), where = 'layers: ' + current + (field ? '.' + field : '');
      if (e.where === 'layers: ' + current) { e.message = e.message.replace(e.where, where); e.where = where; }
      else if (!(e.where || '').startsWith('layers: ')) {
        const code = e.code ? '[' + e.code + '] ' : '';
        e.message = code && e.message.startsWith(code) ? code + where + ': ' + e.message.slice(code.length) : where + ': ' + e.message;
        e.where = e.where ? where + ': ' + e.where : where;
      }
      return e;
    };
    // While a word is read (a solid's band), a track's names stay names, never a role's or a swatch's color.
    let word = false;
    const here = (scope) => current || scope.prefix + '(the scene)';
    const markers = new Map();
    const marker = (name) => {
      if (name === 'end') return D;
      // The last frame a render captures, a frame before the end: a fade out that lands there is gone in the file.
      if (name === 'last') return D - perSecond / fps;
      if (!markers.has(name)) {
        let s = null;
        try { s = K.timeOf(name); } catch (e) { s = null; }
        // snap: 'frame' lands every marker and beat on its nearest frame, as a cut or a contact would be.
        if (typeof s === 'number' && record.snap === 'frame') s = Math.round(s * fps) / fps;
        // A marker is a time in the composition; the record counts from its clip's start.
        if (typeof s === 'number') s -= opts.clipStart || 0;
        markers.set(name, typeof s === 'number' && isFinite(s) ? s * perSecond : null);
      }
      const m = markers.get(name);
      return m === null ? undefined : m;
    };
    const find = (id, scope) => { for (let s = scope; s; s = s.parent) if (s.ids.has(id)) return s.ids.get(id); return null; };
    // t is a time in the scope's own frames; up a scope, its start is added.
    function named(name, scope, t, depth) {
      if (depth > 16) throw fail(CODES.LOOP, name, __DEV__ && 'names lead back to themselves');
      // A parameter is worked out in the placement above, at that placement's time; t itself stays this scope's.
      for (let s = scope, ts = t; s; ts += s.start, s = s.parent) {
        // A copy's index, count and row fields, and an element's or a part's own i and n: as they are.
        if (s.rows && name in s.rows) return s.rows[name];
        if (s.params && name in s.params) return value(s.params[name], s.parent || s, ts + s.start, depth + 1);
      }
      if (name in constants) return value(constants[name], root, 0, depth + 1);
      if (name in shared) return value(shared[name], scope, t, depth + 1);
      return marker(name);
    }
    function sum(str, scope, t, depth) {
      const parts = str.trim().split(/\s+([+-])\s+/);
      let total = 0;
      for (let i = 0; i < parts.length; i += 2) {
        const sign = i ? parts[i - 1] : '+';
        // A name may end in a number, as 'beat 9' and 'frame 170' do, and a beat's may have a fraction: 'beat 9.5'.
        const m = /^([+-]?)(\d*\.?\d+)?([A-Za-z_]\w*(?: \d+(?:\.\d+)?)?)?$/.exec(parts[i]);
        if (!m || (!m[2] && !m[3])) return undefined;
        let v = m[2] ? parseFloat(m[2]) : 1;
        if (m[3]) {
          let n = named(m[3], scope, t, depth);
          if (typeof n === 'string') n = sum(n, scope, t, depth + 1);
          if (typeof n !== 'number') return undefined;
          v *= n;
        }
        if (m[1] === '-') v = -v;
        total += sign === '-' ? -v : v;
      }
      return total;
    }
    // A value's time modifiers, After Effects' expressions on a property: `on` (a posterize rate a second, or 'twos'),
    // `loop: [from, to]` and `hold: [at, length]` change the time the value is read at; `wiggle` adds Kinetic's
    // wiggle() at the time itself, and is a value on its own.
    const MODS = ['on', 'loop', 'hold', 'wiggle'];
    // What a form takes as a list (keys, a key's pair, min, max, multiply, a loop's or a hold's pair), or KN-165.
    // An empty list is none: it has no key, and no least or greatest.
    const listOf = (x, what, scope) => { if (!Array.isArray(x) || !x.length) throw fail(CODES.VALUE, here(scope), __DEV__ && (what + ' takes a list of one or more, not ' + show(x))); return x; };
    function modified(v, scope, t, depth) {
      const inner = Object.assign({}, v);
      for (const k of MODS) delete inner[k];
      let tt = t;
      const sec = (x) => x / perSecond, rec = (x) => x * perSecond;
      if (v.loop !== undefined) { const [a, b] = listOf(value(v.loop, scope, t, depth + 1), __DEV__ && 'loop', scope); tt = rec(K.loop(sec(tt), sec(a), sec(b))); }
      if (v.hold !== undefined) { const [a, d] = listOf(value(v.hold, scope, t, depth + 1), __DEV__ && 'hold', scope); tt = rec(K.hold(sec(tt), sec(a), sec(d))); }
      if (v.on !== undefined) { const r = v.on === 'twos' ? fps / 2 : value(v.on, scope, t, depth + 1); tt = rec(K.posterize(sec(tt), r)); }
      const base = Object.keys(inner).length ? value(inner, scope, tt, depth + 1) : 0;
      if (v.wiggle === undefined) return base;
      const w = {};
      for (const k in v.wiggle) w[k] = value(v.wiggle[k], scope, t, depth + 1);
      return base + K.wiggle(sec(t), w);
    }
    // A number written as text (a slider's value in a store) where a form takes a number; anything else as it is.
    const asNum = (x) => (typeof x === 'string' && x.trim() !== '' && isFinite(x) ? Number(x) : x);
    // What a form does arithmetic with: a number, a number written as text, a flag (0 or 1), or nothing (0), which
    // an empty text (a cleared input) is too. Other text, a list and NaN are KN-165.
    const nOf = (x, scope) => {
      x = asNum(x);
      if (typeof x === 'string' ? x.trim() : (x && typeof x === 'object') || x !== x) throw fail(CODES.VALUE, here(scope), __DEV__ && ('arithmetic takes numbers, not ' + show(x)));
      return typeof x === 'string' ? 0 : x;
    };
    // The composition's seconds at a layer's time t: level() and spectrum() read the music on the composition's clock.
    const song = (scope, t) => (t + (scope.at || 0)) / perSecond + (opts.clipStart || 0);
    function value(v, scope, t, depth = 0) {
      if (!depth && v && (typeof v === 'object' || typeof v === 'string')) forming = v;
      if (typeof v === 'number' || v === null || v === undefined || typeof v === 'boolean') return v;
      if (typeof v === 'string') { const n = sum(v, scope, t, depth); return n === undefined ? v : n; }
      if (Array.isArray(v)) return v.map((x) => value(x, scope, t, depth));
      if (typeof v === 'object') {
        if (MODS.some((k) => k in v)) return modified(v, scope, t, depth);
        // The music's drivers, at the time: an audio band's level, this copy's bin of the spectrum (its i of n bins,
        // or `bins`), and a pulse on a beat list.
        // { level: band } (a name, or any value such as a knob's link), or { level: { band, clip } }.
        // A band written as a string is the band's name itself ('bass'), never a name to look up; a link is read.
        if ('level' in v) { const o = isObj(v.level) && 'band' in v.level ? v.level : { band: v.level }; return K.level(song(scope, t),typeof o.band === 'string' ? o.band : value(o.band, scope, t, depth + 1), o.clip === undefined ? undefined : { clip: o.clip }); }
        if (isObj(v.spectrum)) {
          const i = named('i', scope, t, depth + 1), n = named('n', scope, t, depth + 1), bins = v.spectrum.bins === undefined ? n : value(v.spectrum.bins, scope, t, depth + 1);
          if (typeof i !== 'number') throw fail(CODES.NAME, here(scope), __DEV__ && 'spectrum reads its bin as i, which only a repeat\'s copy, one of several elements a src finds, or a text\'s part has');
          return memo(v, t, String(bins), () => K.spectrum(song(scope, t), bins))[i];
        }
        if (isObj(v.beat)) {
          const o = {};
          for (const k in v.beat) if (k !== 'beats') o[k] = value(v.beat[k], scope, t, depth + 1);
          const beats = data(v.beat.beats, scope, t);
          return memo(v, t, JSON.stringify(o), () => K.beat(t / perSecond, beats, o), beats);
        }
        if ('keys' in v) return track(v, scope, t, depth);
        if ('from' in v) return link(v, scope, t, depth);
        if ('rate' in v) return (nOf(value(v.rate, scope, t, depth), scope) * t) / perSecond;
        if ('multiply' in v) return listOf(v.multiply, __DEV__ && 'multiply', scope).reduce((a, x) => a * nOf(value(x, scope, t, depth), scope), 1);
        if (Array.isArray(v.add) && !('from' in v)) return v.add.reduce((a, x) => a + nOf(value(x, scope, t, depth), scope), 0);
        if ('focus' in v) return K.focus(self.z, self.focus || 0, { depth: value(v.focus.depth, scope, t, depth), max: value(v.focus.max, scope, t, depth) });
        // Where a clip starts. A clip's id alone, in timeOf()'s grammar, is where it ends (so data-start="rest" follows
        // it); its start is its own data-start, a number or a name.
        if ('startOf' in v) {
          const el = document.getElementById(v.startOf);
          if (!el) throw fail(CODES.ELEMENT, here(scope), __DEV__ && ('startOf names ' + show(v.startOf) + ', and no element has that id'));
          const s = el.getAttribute('data-start');
          return ((isFinite(+s) ? +s : K.timeOf(s)) - (opts.clipStart || 0)) * perSecond;
        }
        // Kinetic's stagger() and sweep() of this copy, element or part: its i of n, from where it is worked out.
        if (isObj(v.stagger) || isObj(v.sweep)) {
          const i = named('i', scope, t, depth + 1), n = named('n', scope, t, depth + 1);
          const which = isObj(v.stagger) ? 'stagger' : 'sweep';
          if (typeof i !== 'number' || typeof n !== 'number') throw fail(CODES.NAME, here(scope), __DEV__ && (which + ' reads i and n, which only a repeat\'s copy, one of several elements a src finds, or a text\'s part has'));
          const o = {}, src = v[which];
          // An option that names a choice by a word ('last', an ease) is that word, never a name of the record's.
          for (const k in src) if (k !== 'p') o[k] = typeof src[k] === 'string' && WORDS.includes(k) ? src[k] : value(src[k], scope, t, depth + 1);
          return which === 'stagger' ? K.stagger(i, n, o) : K.sweep(i, n, value(src.p, scope, t, depth + 1), o);
        }
        if ('min' in v) return Math.min(...listOf(v.min, __DEV__ && 'min', scope).map((x) => nOf(value(x, scope, t, depth), scope)));
        if ('max' in v) return Math.max(...listOf(v.max, __DEV__ && 'max', scope).map((x) => nOf(value(x, scope, t, depth), scope)));
        if ('floor' in v) return Math.floor(nOf(value(v.floor, scope, t, depth), scope));
        // A follower: Kinetic's own `follow`, a spring easing toward a store path, which layers.scene() defines.
        if ('follow' in v) { const n = opts.follows && opts.follows.get(v); return n && opts.scene ? opts.scene[n] : read(v.follow, scope, t, depth); }
        // Kinetic's own track form, on time.
        if ('at' in v && 'to' in v) {
          const o = {};
          if (v.ease !== undefined) o.ease = v.ease;
          if (v.extrapolate !== undefined) o.extrapolate = v.extrapolate;
          return K.interpolate(t, v.at.map((x) => asNum(value(x, scope, t, depth))), v.to.map((x) => inks(asNum(value(x, scope, t, depth)), scope)), Object.keys(o).length ? o : undefined);
        }
        // The escape hatch: a function the page hands the record (a model's numbers), shown in an editor as code.
        if ('call' in v) {
          const fn = opts.fns && opts.fns[v.call];
          if (typeof fn !== 'function') throw fail(CODES.FUNCTION, here(scope), __DEV__ && ('no function ' + show(v.call) + ' was handed to layers()'));
          const x = fn(...(v.args || []).map((a) => value(a, scope, t, depth)));
          // NaN written to a style is dropped by the browser, and the element keeps what it had.
          if (x !== x) throw fail(CODES.VALUE, here(scope), __DEV__ && ('the function ' + show(v.call) + ' returned NaN'));
          return typeof x === 'number' ? x * (v.scale === undefined ? 1 : value(v.scale, scope, t, depth)) + (v.add === undefined ? 0 : value(v.add, scope, t, depth)) : x;
        }
        throw fail(CODES.VALUE, here(scope), __DEV__ && (show(v) + ' is no value form: a value is a number, a name or sum, a list, or an object with keys, at and to, from, follow, call, min, max, floor, multiply, add, rate, focus, startOf, stagger, sweep, level, spectrum, beat or wiggle (and on, loop, hold on any of them)'));
      }
      return v;
    }
    function read(path, scope, t, depth) {
      // Links that lead back to where they started never end: each hop is one deeper.
      if (depth > 64) throw fail(CODES.LOOP, here(scope), __DEV__ && ('links lead back to themselves, through ' + show(path)));
      const [id, ...rest] = path.split('.');
      if (id === 'params') return named(rest[0], scope, t, depth + 1);
      // The scene's composition variables, as its `inputs` declares and coerces them, and its clip's own props
      // (data-prop-* on the clip), as its `props` declares them. A declared input that failed its check is reported
      // once as KN-130 by the scene and reads as undefined here.
      if (id === 'inputs' || id === 'props') {
        const got = opts.scene && opts.scene[id];
        if (got && rest[0] in got) return got[rest[0]];
        if (record[id] && rest[0] in record[id]) return undefined;
        throw fail(CODES.LINK, here(scope), __DEV__ && ('a link reads ' + show(path) + ', and the scene declares no ' + (id === 'inputs' ? 'input ' : 'prop ') + show(rest[0])));
      }
      if (id === 'self') { if (!(rest[0] in self)) throw fail(CODES.LINK, here(scope), __DEV__ && ('self.' + rest[0] + ' is not measured for this layer')); return self[rest[0]]; }
      const node = find(id, scope);
      if (!node) {
        // A store the record says it reads: its field, as the learner and the steps' scripts leave it.
        // A query the record reads: its rows and fields, as loaded.
        const store = (record.stores || []).includes(id), query = !store && (record.queries || []).includes(id);
        if (store || query) {
          if (!held.has(path)) {
            let f = store ? wf.getStore(id) : wf.getQuery(id);
            rest.forEach((k, j) => {
              // A field it does not have is a mistake in the record; one that is there and empty is read as empty.
              if (f === null || f === undefined || (f[k] === undefined && !(typeof f === 'object' && k in f))) throw fail(CODES.LINK, here(scope), __DEV__ && ('a link reads ' + show(path) + ', and ' + show(id) + ' has no ' + show(k) + ' there'));
              // Past the store's own field the walk is over plain data, where a key is there or it is not.
              f = j ? f[k] : plain(f[k], new Map());
            });
            held.set(path, f === undefined ? null : f);
          }
          return held.get(path);
        }
        throw fail(CODES.LINK, here(scope), __DEV__ && ('a link reads ' + show(path) + ', and no layer is named ' + show(id) + ' and no store or query it reads is'));
      }
      // What a renderer works out for a layer each frame (a path's head, its progress along each stop).
      if (node.out && rest.length === 1 && rest[0] in node.out) return node.out[rest[0]];
      // The source's own time: the same moment, in its scope's frames.
      const tt = t + scope.at - node.scope.at;
      const rec = node.rec;
      if (rest.length === 1 && rec.controls && rest[0] in rec.controls) return value(rec.controls[rest[0]], node.scope, tt, depth + 1);
      let f = rec;
      for (const k of rest) f = f && f[k];
      if (f === undefined) throw fail(CODES.LINK, node.name, __DEV__ && ('a link reads ' + show(path) + ', which it does not have'));
      return value(f, node.scope, tt, depth + 1);
    }
    function link(v, scope, t, depth) {
      let x = read(v.from, scope, t + (v.time ? value(v.time, scope, t, depth) : 0), depth);
      // Data is read as it is: text stays text ('1.10', a label that is also a marker's name), and a flag or an object
      // (a whole store's fields) as they are. A link that scales or adds works with the number its text holds, and so
      // does each form that takes numbers (asNum).
      if (v.scale !== undefined || v.add !== undefined) x = asNum(x);
      // Nothing there (a store's empty field) stays nothing, so text shows none; scaled or added to, it counts as 0.
      else if (x === null || x === undefined) return x;
      if (typeof x === 'string' || typeof x === 'boolean' || isObj(x)) return x;
      const k = v.scale === undefined ? 1 : nOf(value(v.scale, scope, t, depth), scope), a = v.add === undefined ? 0 : nOf(value(v.add, scope, t, depth), scope);
      return Array.isArray(x) ? x.map((n) => (typeof n === 'number' ? n * k + a : n)) : x * k + a;
    }
    function mix(a, b, u, scope) {
      a = asNum(a); b = asNum(b);
      if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
      // A number beside text that is no color: a name the record meant to read, such as 'params.w' for { from: 'params.w' }.
      if ((typeof a === 'number' && typeof b === 'string' && !isHex(color(b, scope))) || (typeof b === 'number' && typeof a === 'string' && !isHex(color(a, scope)))) {
        throw fail(CODES.VALUE, here(scope), __DEV__ && ('a track goes from ' + show(a) + ' to ' + show(b) + ': text beside a number; a path such as \'params.w\' is read with a link, { from: \'params.w\' }'));
      }
      if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => mix(x, b[i], u, scope));
      const ca = typeof a === 'string' ? color(a, scope) : null, cb = typeof b === 'string' ? color(b, scope) : null;
      if (isHex(ca) && isHex(cb)) { const p = rgb(ca), q = rgb(cb); return hexOf(p.map((x, i) => x + (q[i] - x) * u)); }
      return u < 1 ? a : b;
    }
    function track(v, scope, t, depth) {
      // The input: the time, a path ('rig.turn', 'cell.t'), or any value (a shared name, a follower).
      const x = asNum(v.by === undefined ? t : typeof v.by === 'string' && v.by.includes('.') ? read(v.by, scope, t, depth) : value(v.by, scope, t, depth));
      const keys = listOf(v.keys, __DEV__ && 'keys', scope).map((key) => {
        const [kx, kv] = listOf(key, __DEV__ && 'a key, [place, value],', scope), hold = Array.isArray(kv) && kv[0] === 'hold';
        return { x: value(kx, scope, t, depth), v: hold ? kv[1] : kv, hold };
      });
      // Keys run forward (two at one x make a step). Checked each time: a place can be a copy's own parameter, or a
      // value that moves.
      keys.forEach((k, j) => {
        if (typeof k.x !== 'number' || k.x !== k.x) throw fail(CODES.NAME, here(scope), __DEV__ && ('a key\'s place ' + show(v.keys[j][0]) + ' is no number, parameter, constant, shared value, marker or beat'));
        if (j && k.x < keys[j - 1].x) throw fail(CODES.VALUE, here(scope), __DEV__ && ('keys run forward; ' + show(v.keys[j][0]) + ' comes after ' + show(v.keys[j - 1][0])));
        if (k.hold && v.keys[j][1].length < 2) throw fail(CODES.VALUE, here(scope), __DEV__ && "['hold', v] holds a value; this hold has none");
      });
      // An eased track of numbers is Kinetic's own interpolate(), so 'smooth' threads one curve through all its keys.
      if (v.ease && keys.length > 1 && !keys.some((k) => k.hold) && keys.every((k, j) => !j || k.x > keys[j - 1].x)) {
        const vs = keys.map((k) => asNum(value(k.v, scope, t, depth)));
        if (vs.every((n) => typeof n === 'number')) return K.interpolate(x, keys.map((k) => k.x), vs, { ease: v.ease });
      }
      // Path keys: matched once with Kinetic's matchPaths() (match: { segments, align }), then blended with mix().
      let vals = null;
      if (v.match !== undefined) {
        // The options as matchPaths() takes them, each a value ({} for its defaults).
        const m = deep(v.match, scope, t), raw = keys.map((k) => value(k.v, scope, t, depth)), key = show([m, raw]);
        let got = matched.get(v);
        if (!got || got.key !== key) matched.set(v, (got = { key, paths: K.matchPaths(raw, m) }));
        vals = got.paths;
      }
      const at = (j) => (vals ? vals[j] : value(keys[j].v, scope, t, depth));
      // A key held or at an end: a swatch or role name is its color, as it is while it blends; a word (a band) as written.
      const end = (j) => { const w = at(j); if (vals || word || typeof w !== 'string') return w; const c = color(w, scope); return isHex(c) ? c : w; };
      let i = -1;
      for (let j = 0; j < keys.length; j++) if (x >= keys[j].x) i = j;
      if (i < 0) return end(0);
      const a = keys[i], b = keys[i + 1];
      if (!b || a.hold) return end(i);
      let u = (x - a.x) / (b.x - a.x || 1);
      if (v.ease) u = K.ease(v.ease)(u);
      if (vals) return K.mix(vals[i], vals[i + 1], u);
      return word ? end(u < 1 ? i : i + 1) : mix(at(i), at(i + 1), u, scope);
    }
    // A value as CSS takes it: a swatch or role name is its color; anything else as it is.
    function inks(x, scope) { return typeof x === 'string' ? color(x, scope) : x; }
    // A style's value as the text CSS takes: 'end' and 'last' alone are the keywords there (text-align), since they
    // name times only where a time goes; any other value is worked out, a color name being its color, and a form's
    // `unit` is written after it.
    function cssOf(v, scope, t) { return String(v === 'end' || v === 'last' ? v : inks(value(v, scope, t), scope)) + (isObj(v) && typeof v.unit === 'string' ? v.unit : ''); }
    // A color: a role names a swatch, or another role; a swatch is a color.
    function color(c, scope) {
      for (let n = 0; n < 8 && typeof c === 'string' && !isHex(c); n++) {
        if (scope.roles && c in scope.roles) c = scope.roles[c];
        else if (c in swatches) c = swatches[c];
        else break;
      }
      return c;
    }
    // An object of a call's options (an effect's parameters, a shade's marks, a drawing's strokes): every value form in
    // it worked out, every other object walked, and the colors (ink, paper, shadow, highlight) through roles. A value
    // form is told from an option by its shape: a link's `from` is a string (a band's is a point), min and max are lists.
    const COLORED = ['ink', 'paper', 'shadow', 'highlight'];
    // Options that name a choice by a word: kept as written, so a word that is also an element's id or a marker's
    // name (a composition called 'grain') stays the word.
    const WORDS = ['kind', 'side', 'falloff', 'ease', 'shape', 'blend', 'freeze', 'speck', 'direction', 'renderer', 'spacing', 'align', 'valign', 'from', 'axis', 'gradient', 'around', 'along'];
    function deep(v, scope, t, key) {
      if (Array.isArray(v)) return v.map((x) => deep(x, scope, t));
      if (isObj(v)) {
        if (isForm(v)) return deep(value(v, scope, t), scope, t, key);
        const o = {};
        for (const k in v) o[k] = deep(v[k], scope, t, k);
        return o;
      }
      if (typeof v === 'string') {
        if (WORDS.includes(key)) return v;
        const x = value(v, scope, t);
        return COLORED.includes(key) && typeof x === 'string' ? color(x, scope) : x;
      }
      return v;
    }
    // Data a call takes whole (a beat list, a transcript's cues): written in the record as it is, or read by a value
    // form such as { from: 'words.rows' }.
    const data = (v, scope, t) => (isObj(v) && isForm(v) ? value(v, scope, t) : v);
    // A curve: an ease's name, { power }, { from, power, ease } (nothing below from), or points.
    function curve(c) {
      if (typeof c === 'string') return record.curves && c in record.curves ? curve(record.curves[c]) : c;
      if (Array.isArray(c)) return (x) => { let i = 0; while (i < c.length - 2 && x > c[i + 1][0]) i++; const [x0, y0] = c[i], [x1, y1] = c[i + 1]; return y0 + ((y1 - y0) * Math.max(0, Math.min(1, (x - x0) / (x1 - x0 || 1)))); };
      if (c && typeof c === 'object') {
        const from = c.from || 0, p = c.power || 1, e = c.ease === 'smooth' ? (s) => s * s * (3 - 2 * s) : c.ease ? K.ease(c.ease) : (s) => s;
        return (x) => { const s = Math.max(0, Math.min(1, (x - from) / (1 - from))); return Math.pow(e(s), p); };
      }
      return c;
    }
    // A time a placement or a life is given as: a number once its names resolve, or KN-163 (a marker misspelled
    // would stay text, and no time is before or after text).
    const timeAt = (x, scope, t, where) => {
      const n = value(x, scope, t);
      if (typeof n !== 'number' || n !== n) throw fail(CODES.NAME, where, __DEV__ && (show(x) + ' is no time: a number, parameter, constant, shared value, marker or beat'));
      return n;
    };
    const alive = (node, t) => { const life = node.rec.life; return !life || (t >= timeAt(life[0], node.scope, t, node.name + '.life') && t < timeAt(life[1], node.scope, t, node.name + '.life')); };
    const v3 = (p) => (p.length === 2 ? [p[0], p[1], 0] : p);
    // A node's own time at the composition's time F, and its lap with a wrapping loop; null while it is not alive.
    function when(node, F) {
      for (const k of wrap ? [0, -1, 1] : [0]) { const tt = F + k * D - node.scope.at; if (alive(node, tt)) return { t: tt, lap: k }; }
      return null;
    }

    // Each placement's start, now that names resolve (a number, a marker, a clip's id), and where it starts in the
    // composition, outer placements first.
    // A repeated copy's start is worked out in the copy, so a { stagger } reads its own i.
    for (const s of scopes) {
      const raw = s.start;
      const where = s.prefix.slice(0, -1) + '.start';
      if (s.rows) { s.start = 0; s.start = timeAt(raw, s, 0, where); } else s.start = timeAt(raw, s.parent, 0, where);
      s.at = s.parent.at + s.start;
    }

    // What a selector finds in the composition when the scene's clip holds no match: the elements beside the clip,
    // those in a clip with no scene of its own included (one record may draw a whole piece's clips). Never one
    // inside another scene's clip, which is that scene's own.
    const beside = (rootEl, sel) => [...rootEl.querySelectorAll(sel)].filter((e) => {
      const own = e.parentElement && e.parentElement.closest('[data-component],[data-wf-component]');
      return !own || !rootEl.contains(own) || own === rootEl || own.contains(opts.clip || rootEl);
    });
    const parts = [];
    if (nodes.some((n) => SOLID(n.rec.kind))) parts.push(solidsPart());
    if (nodes.some((n) => DOM(n.rec.kind) || n.rec.kind === 'camera')) parts.push(domPart());

    function seek(seconds) {
      let F = seconds * perSecond;
      if (record.loop) F = ((F % D) + D) % D;
      held.clear();
      seekNo++;
      current = ''; forming = undefined;
      try { for (const p of parts) p.seek(F); } catch (e) { throw locate(e); }
    }
    // refresh(): the layer calls paint their marks again, for a change seek cannot see (a knob while the clock is still).
    const refresh = () => { held.clear(); seekNo++; let calls = false; for (const p of parts) if (p.refresh && p.refresh()) calls = true; return calls; };
    // dispose(): what the record put on the page comes off it (the copies of a <template>, the solids' drawing).
    const dispose = () => { for (const p of parts) p.dispose(); };
    return { seek, refresh, dispose, stage: parts.length ? parts[0].stage : null };

    // ---- solids ----
    function solidsPart() {
      const solids = K.solids;
      if (!solids) throw fail(CODES.CALL, 'stage', __DEV__ && 'it has solids; load kinetic.25d.js after kinetic.wf.js');
      // The two files are made for each other: one without the shapes this file asks of it is from another version.
      if (typeof solids.plane !== 'function') throw fail(CODES.CALL, 'stage', __DEV__ && 'this kinetic.25d.js is from an earlier version than kinetic.wf.js; load the two from the same version');
      const SHAPES = { plane: solids.plane, disc: solids.disc, sector: solids.sector, capsule: solids.capsule, box: solids.box, faces: (o) => solids.faces(o.faces),
        polygon: solids.polygon, prism: solids.prism, pyramid: solids.pyramid, sphere: solids.sphere };
      // Where it draws and its settings: the record's stage, worked out once, in the clip first (code may hand both).
      const st = record.stage || {}, clipEl = opts.clip || opts.root;
      const findEl = (sel) => clipEl && (clipEl.querySelector(sel) || (opts.root && beside(opts.root, sel)[0]));
      const target = opts.target || (st.src !== undefined ? findEl(st.src) : clipEl && clipEl.querySelector('svg'));
      if (!target) throw fail(CODES.ELEMENT, 'stage.src', __DEV__ && (st.src !== undefined ? 'src ' + show(st.src) + ' finds no element' : 'the solids draw into an SVG element: the clip has no <svg>; name one with stage.src'));
      const canvas = opts.canvas || (st.grain !== undefined ? findEl(st.grain) : undefined);
      if (st.grain !== undefined && !canvas) throw fail(CODES.ELEMENT, 'stage.grain', __DEV__ && ('grain ' + show(st.grain) + ' finds no element'));
      // An object of settings key by key, so a setting named as a value form is ('floor' in the light) stays a setting.
      const settings = (o) => { if (!isObj(o)) return deep(o, root, 0); const out = {}; for (const k in o) out[k] = deep(o[k], root, 0, k); return out; };
      const set = {};
      if (st.view !== undefined) set.camera = settings(st.view);
      if (st.light !== undefined) set.light = settings(st.light);
      if (st.rim !== undefined) set.rim = st.rim === false ? false : settings(st.rim);
      if (st.glows !== undefined) set.glows = st.glows.map(settings);
      // A drop shadow: each solid's outline, blurred, darkening what it falls on; its color a swatch or role too.
      if (st.dropShadow) { set.dropShadow = settings(st.dropShadow); if (typeof set.dropShadow.color === 'string') set.dropShadow.color = color(set.dropShadow.color, root); }
      const stage = solids(target, Object.assign(
        st.view === undefined ? { camera: { distance: 200, focal: record.size[0] * 200 } } : {},
        st.rim === undefined ? { rim: false } : {},
        { shade: { canvas, scene: opts.scene, fps: 0 } },
        set, opts.stage));
      const mine = nodes.filter((n) => SOLID(n.rec.kind));
      const lookOf = (name, scope) => { for (let s = scope; s; s = s.parent) if (s.comp.looks && name in s.comp.looks) return s.comp.looks[name]; return null; };
      const markOf = (name, scope) => { for (let s = scope; s; s = s.parent) if (s.comp.marks && name in s.comp.marks) return s.comp.marks[name]; return null; };
      function mark(mk, scope, t, flip) {
        if (typeof mk === 'string') { const m = markOf(mk, scope); if (!m) throw fail(CODES.NAME, here(scope), __DEV__ && ('no mark is named ' + show(mk))); return mark(m, scope, t, flip); }
        const at = (p) => {
          if (p && !Array.isArray(p) && typeof p === 'object' && 'point' in p) { const o = value(p.offset || [0, 0], scope, t); return { point: p.point, offset: flip ? [o[0], -o[1]] : o }; }
          const q = value(p, scope, t);
          return flip ? [q[0], -q[1]] : q;
        };
        const out = { ink: color(value(mk.ink, scope, t), scope), amount: Math.max(0, Math.min(1, value(mk.amount === undefined ? 1 : mk.amount, scope, t))) };
        // A curve written in place ({ power }, { from, ease }) is a curve, not a value; a name or a track of names is a value.
        if (mk.falloff !== undefined) out.falloff = curve(isObj(mk.falloff) && !('keys' in mk.falloff) && !('at' in mk.falloff) ? mk.falloff : value(mk.falloff, scope, t));
        if (mk.glow) out.glow = { at: at(mk.glow.at), radius: value(mk.glow.radius, scope, t), invert: !!mk.glow.invert };
        if (mk.edge) out.edge = { width: value(mk.edge.width, scope, t) };
        if (mk.within) out.within = { point: mk.within.point, radius: value(mk.within.radius, scope, t) };
        return out;
      }
      function shade(v, scope, t, flip = false) {
        if (v === undefined || v === null) return null;
        if (typeof v === 'string') {
          const name = color(v, scope), look = lookOf(name, scope);
          if (!look) throw fail(CODES.NAME, here(scope), __DEV__ && ('no look is named ' + show(name)));
          return shade(look, scope, t, flip);
        }
        if (!Array.isArray(v) && typeof v === 'object' && 'role' in v) return shade(v.role, scope, t, flip !== (v.mirror === 'y'));
        return v.map((g) => Object.assign({}, record.looks[g.look], { marks: g.marks.map((m) => mark(m, scope, t, flip)) }));
      }
      // A solid's color as set() takes it: a color, swatch or role name; a ramp, a list of them, dark to lit; or a
      // gradient, each stop a color or [offset, color] and each number a value, every stop a #rrggbb or #rrggbbaa.
      function paint(v, scope, t) {
        if (!isGradient(v)) { const x = value(v, scope, t); return Array.isArray(x) ? x.map((c) => color(c, scope)) : color(x, scope); }
        const o = { gradient: v.gradient.map((s) => {
          const c = color(value(Array.isArray(s) ? s[1] : s, scope, t), scope);
          if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c)) throw fail(CODES.VALUE, here(scope), __DEV__ && ('a gradient\'s stop is #rrggbb, #rrggbbaa, or a swatch or role that names one, not ' + show(c)));
          return Array.isArray(s) ? [value(s[0], scope, t), c] : c;
        }) };
        for (const k of ['angle', 'from', 'to']) if (v[k] !== undefined) o[k] = value(v[k], scope, t);
        return o;
      }
      // Each side's look, { color, shade }, by name or in order; a side written as a color alone is its color.
      function sides(v, scope, t) {
        const one = (s) => {
          if (!isSide(s)) return s === undefined || s === null ? s : { color: paint(s, scope, t) };
          const o = {};
          if (s.color !== undefined) o.color = paint(s.color, scope, t);
          if (s.shade !== undefined) o.shade = shade(s.shade, scope, t);
          return o;
        };
        if (Array.isArray(v)) return v.map(one);
        const o = {};
        for (const k in v) o[k] = one(v[k]);
        return o;
      }
      // A faces list a value form gives (a call, a link, a track) is read every frame, and the shape made again when it
      // changes; an empty list draws nothing.
      const flowing = (rec) => rec.content && rec.content.shape === 'faces' && isObj(rec.content.faces) && isForm(rec.content.faces);
      const facesOf = (list) => (Array.isArray(list) && !list.length ? solids.null() : solids.faces(list));
      // A shape's numbers; a faces list is data, each corner a value.
      const numbers = (content, scope, t) => { const out = {}; for (const k in content || {}) if (k !== 'shape') out[k] = k === 'faces' ? deep(content[k], scope, t) : value(content[k], scope, t); return out; };
      for (const node of mine) {
        const rec = node.rec, scope = node.scope, kind = rec.kind === 'null' ? 'null' : rec.content && rec.content.shape;
        const made = kind === 'null' ? solids.null() : flowing(rec) ? facesOf(numbers(rec.content, scope, 0).faces) : SHAPES[kind] && SHAPES[kind](Object.assign({}, START[kind], numbers(rec.content, scope, 0)));
        if (!made) throw fail(CODES.FIELD, node.name, __DEV__ && ('content.shape is ' + Object.keys(SHAPES).join(', ') + ', or the layer is a null; not ' + show(kind)));
        const o = {}, sd = rec.look && rec.look.side;
        node.cache.sides = made.sides || [];
        // Its sides, by the names its shape gives them, or in order for a sphere's parts. A faces list that moves
        // names its sides as it goes, so they are not known here.
        if (sd !== undefined && !flowing(rec)) {
          const n = made.ball ? (made.split ? made.split.sides : 1) : 0, names = made.sides || [];
          const bad = made.ball ? !Array.isArray(sd) || sd.length > n : Array.isArray(sd) || Object.keys(sd).find((k) => !names.includes(k));
          if (bad) throw fail(CODES.FIELD, node.name + '.look.side' + (typeof bad === 'string' ? '.' + bad : ''), __DEV__ && (made.ball ? 'a sphere\'s side is a list, one for each of its ' + n + ' parts, in order' : 'this shape\'s sides are ' + (names.join(', ') || 'not named') + ', given by name'));
        }
        // Its material: how much light it returns and how strongly its glows show, and whether shadows fall on it,
        // worked out once.
        for (const k of ['albedo', 'glow', 'accepts']) if (rec.look && rec.look[k] !== undefined) o[k] = value(rec.look[k], scope, 0);
        if (o.accepts !== undefined && typeof o.accepts !== 'boolean') throw fail(CODES.VALUE, node.name + '.look.accepts', __DEV__ && ('accepts is true or false, not ' + show(o.accepts)));
        if (rec.hidden) o.hidden = true;
        const parent = rec.parent === null ? null : rec.parent !== undefined ? find(rec.parent, scope) : scope.under ? find(scope.under.name, scope.under.scope) : null;
        if (parent) o.parent = parent.name;
        const clip = rec.look && rec.look.clip;
        // Inside another layer's outline, or with { layer, invert: true } outside it.
        if (clip) {
          const by = isObj(clip) ? clip.layer : clip, c = find(by, scope);
          if (!c) throw fail(CODES.LINK, node.name, __DEV__ && ('look.clip names ' + show(by) + ', which is not a layer here'));
          o.clip = clip.invert ? { shape: c.name, invert: true } : c.name;
        }
        stage.add(node.name, made, o);
      }
      function seek(F) {
        self = {};
        for (const node of mine) {
          current = node.name;
          const rec = node.rec, scope = node.scope, w = when(node, F);
          if (!w) { stage.set(node.name, { opacity: 0 }); continue; }
          const t = w.t, p = {}, place = rec.place || {}, look = rec.look || {};
          if (place.position !== undefined) p.position = v3(value(place.position, scope, t));
          if (place.rotate !== undefined) p.rotate = value(place.rotate, scope, t);
          if (place.scale !== undefined) p.scale = value(place.scale, scope, t);
          if (place.pivot !== undefined) p.pivot = v3(value(place.pivot, scope, t));
          if (rec.kind !== 'null') {
            // A shape whose numbers can move over time is made again when they do (its numbers, as set({ shape }) takes them).
            if (rec.content && ['sector', 'capsule', 'polygon', 'prism', 'pyramid', 'sphere'].includes(rec.content.shape)) {
              const n = numbers(rec.content, scope, t), key = show(n);
              if (key !== node.cache.shape) { node.cache.shape = key; p.shape = n; }
            } else if (flowing(rec)) {
              const f = numbers(rec.content, scope, t).faces, key = show(f);
              if (key !== node.cache.shape) { node.cache.shape = key; p.shape = facesOf(f); node.cache.sides = p.shape.sides || []; }
            }
            if (!rec.hidden) {
              p.opacity = look.opacity === undefined ? 1 : value(look.opacity, scope, t);
              if (look.color !== undefined) p.color = paint(look.color, scope, t);
              if (look.side !== undefined) {
                p.side = sides(look.side, scope, t);
                // A moving faces list is colored by the sides it has at this moment.
                if (flowing(rec)) for (const k in p.side) if (!node.cache.sides.includes(k)) delete p.side[k];
              }
              if (look.casts !== undefined) p.casts = value(look.casts, scope, t);
              p.shade = shade(look.shade, scope, t);
              let band = null;
              word = true;
              try { if (rec.band !== undefined) band = value(rec.band, scope, t); } finally { word = false; }
              const b = band === null ? 0 : bands.indexOf(band);
              if (b < 0) throw fail(CODES.ORDER, node.name, __DEV__ && ('band ' + show(band) + ' is not one of ' + bands.join(', ')));
              // A scene with bands states its order: within a band, a placement that started later draws over one that
              // started earlier (by its start, and with a wrapping loop by its lap), then as written. Without bands the
              // stage sorts every face by depth, so shapes that pass in front of each other draw as they stand.
              // One number, each part with room under the one before it: a start up to a million of the record's unit,
              // and 30,000 layers between two starts a frame apart.
              p.order = bands.length ? b * 1e13 + (1 - w.lap) * 1e12 + scope.at * 1e6 + node.seq : 0;
            }
          }
          stage.set(node.name, p);
        }
        stage.draw();
      }
      return { seek, stage, dispose: () => stage.dispose() };
    }

    // ---- HTML and SVG layers, and cameras ----
    function domPart() {
      const rootEl = opts.root, worldEl = rootEl.querySelector('.world');
      // Every element a src selector finds (a class can name several).
      // A repeated comp's copies: each a clone of its container's <template>, in order; a copy's layers look inside it.
      // Where a scope's selectors look: a repeated copy's own element; at the top, the scene's clip, then the whole
      // composition when the clip holds no match (a record's elements may sit beside its clip).
      const clipEl = opts.clip || rootEl;
      const elOf = (s) => { for (; s; s = s.parent) if (s.el) return s.el; return clipEl; };
      const within = (s, sel, one) => {
        const base = elOf(s);
        const found = one ? base.querySelector(sel) : [...base.querySelectorAll(sel)];
        if (base !== clipEl || base === rootEl || (one ? found : found.length)) return found;
        const all = beside(rootEl, sel);
        return one ? all[0] || null : all;
      };
      for (const s of scopes) if (s.copy) {
        const box = within(s.parent, s.copy.src, true);
        const tpl = box && box.querySelector(':scope > template');
        if (!tpl) throw fail(CODES.ELEMENT, s.prefix.slice(0, -1), __DEV__ && ('a repeat\'s src ' + show(s.copy.src) + ' names a container with a <template> for its copies' + (box ? '; it has none' : ', and finds no element')));
        s.el = proto(tpl).cloneNode(true);
        box.appendChild(s.el);
      }
      // ':scope' is a copy's own element, or at the top the scene's clip.
      const pick = (sel, node) => { const all = sel === ':scope' ? [elOf(node.scope)] : within(node.scope, sel, false); if (!all.length) throw fail(CODES.ELEMENT, node.name, __DEV__ && ('src ' + show(sel) + ' finds no element')); return all; };
      const els = nodes.filter((n) => DOM(n.rec.kind));
      const [W, H] = record.size;
      for (const node of els) {
        const src = node.rec.src;
        node.els = src === undefined ? [] : [].concat(...(Array.isArray(src) ? src : [src]).map((s) => pick(s, node)));
        // A layer in the 3D world, or in a group in it, is laid out at its size about its center.
        if (node.rec.size && (node.rec.band === 'world' || node.rec.parent)) {
          const [w, h] = value(node.rec.size, node.scope, 0);
          for (const el of node.els) { el.style.width = w + 'px'; el.style.height = h + 'px'; }
        }
      }
      // A lottie layer: its animation loaded into its element by the page's lottie-web, made now so readiness waits
      // for it, and played by Kinetic's lottie() from start at rate (looping or holding its last frame).
      const lottieOpts = (node) => {
        const c = node.rec.content, o = {};
        for (const k of ['start', 'rate', 'loop']) if (c[k] !== undefined) o[k] = deep(c[k], node.scope, 0, k);
        if (o.start !== undefined) o.start /= perSecond;
        return o;
      };
      for (const node of els.filter((n) => n.rec.kind === 'lottie')) {
        if (!window.lottie || !window.lottie.loadAnimation) throw fail(CODES.CALL, node.name, __DEV__ && 'a lottie layer plays an animation from lottie-web; load lottie-web on the page first');
        const c = node.rec.content || {};
        node.anim = window.lottie.loadAnimation({ container: node.els[0], renderer: c.renderer || 'svg', loop: false, autoplay: false, path: c.path });
        node.played = show(lottieOpts(node));
        K.lottie(node.anim, Object.assign(opts.scene ? { scene: opts.scene } : {}, lottieOpts(node)));
      }
      // A group stands in the world as one plane, far behind all it holds, which its children are set forward from:
      // Kinetic's depth() then draws them exactly, and only while that plane is in front of the eye.
      const groupOf = (node) => { const p = node.rec.parent && find(node.rec.parent, node.scope); return p && p.rec.group ? p : null; };
      for (const g of els.filter((n) => n.rec.group)) {
        const zs = els.filter((n) => groupOf(n) === g && n.rec.place && n.rec.place.position).map((n) => v3(value(n.rec.place.position, n.scope, 0))[2]);
        g.plane = (zs.length ? Math.min(...zs) : 0) - 2400;
      }
      // A layer's place in the world and how it is turned (a group's children turn about their own centers).
      const placeOf = (n) => {
        const pl = n.rec.place || {}, size = n.rec.size ? value(n.rec.size, n.scope, 0) : [0, 0];
        return { c: v3(value(pl.position, n.scope, 0)), r: pl.rotate ? value(pl.rotate, n.scope, 0) : [0, 0, 0], size };
      };

      // ---- paths: points on other layers, drawn on by a trim, with a head that rides the trim's end ----
      const paths = els.filter((n) => n.rec.kind === 'path');
      for (const p of paths) { p.out = { head: 0 }; for (const a of p.rec.content.points) if (a.stop) p.out[a.stop] = 0; }
      function measure(p) {
        const c = p.rec.content, pts = [], segs = [];
        if (!groupOf(p)) throw fail(CODES.FIELD, p.name, __DEV__ && 'a path is drawn in the world inside a group: its parent is a layer with group: true');
        let d = 0;
        const push = (q) => { if (pts.length) d += vlen(vsub(q, pts[pts.length - 1].p)); pts.push({ p: q, d }); };
        const stops = { start: 0 };
        c.points.forEach((a, i) => {
          const layer = find(a.on, p.scope);
          if (!layer) throw fail(CODES.LINK, p.name, __DEV__ && ('a point is on ' + show(a.on) + ', which is not a layer here'));
          const L = placeOf(layer);
          if (a.at) {
            // A point on an element inside an HTML layer: its center, once laid out (shown for the reading if hidden).
            const host = layer.els[0], was = host.style.display;
            host.style.display = '';
            const el = host.querySelector(a.at), r = el.offsetWidth / 2;
            push([L.c[0] - L.size[0] / 2 + el.offsetLeft + r, L.c[1] - L.size[1] / 2 + el.offsetTop + r, L.c[2]]);
            host.style.display = was;
            if (!i) p.headR = r;
            return;
          }
          // A path inside a layer: its points carried into the world as the layer is placed and turned.
          if (!pts.length) throw fail(CODES.FIELD, p.name, __DEV__ && ('a path starts at a point on an element, { on, at }; its first point is ' + show(a)));
          const el = layer.els[0].querySelector(a.path), local = polyOf(el.getAttribute('d'));
          const onIt = (q) => vadd(L.c, turnXY([q[0] - L.size[0] / 2, q[1] - L.size[1] / 2, 0], L.r[0], L.r[1]));
          const from = d, A = pts[pts.length - 1].p;
          push(onIt(local[0]));
          segs.push({ kind: 'conn', from, to: d, A, B: pts[pts.length - 1].p });
          stops[a.stop + '.start'] = d;
          const b = d;
          for (const q of local.slice(1)) push(onIt(q));
          let len = 0;
          const lens = [0];
          for (let k = 1; k < local.length; k++) lens.push((len += Math.hypot(local[k][0] - local[k - 1][0], local[k][1] - local[k - 1][1])));
          segs.push({ kind: 'stop', stop: a.stop, from: b, to: d, layer, els: [a.path].concat(a.also || []).map((s) => layer.els[0].querySelector(s)),
            head: a.head && layer.els[0].querySelector(a.head), local, lens, len });
          stops[a.stop + '.end'] = d;
        });
        p.pts = pts; p.segs = segs; p.total = d;
        p.conns = segs.filter((s) => s.kind === 'conn');
        // The trim's keys name stops along the path; as distances they make an ordinary track.
        const tr = p.rec.look && p.rec.look.trim && p.rec.look.trim.end;
        if (!(tr && Array.isArray(tr.keys))) throw fail(CODES.FIELD, p.name, __DEV__ && ('look.trim.end is a track of keys, { keys: [[time, distance or stop name], ...] }, not ' + show(tr)));
        p.trim = Object.assign({}, tr, { keys: tr.keys.map(([x, v]) => [x, typeof v === 'string' && v in stops ? stops[v] : v]) });
        // Each straight stretch between stops is a ribbon element, laid from its start and turned to its direction.
        const g = groupOf(p);
        p.conns.forEach((s, i) => {
          const el = c.between && rootEl.querySelector(c.between[i]);
          if (!el) return;
          const v = vsub(s.B, s.A), Lg = vlen(v), phi = Math.asin(v[1] / Lg) / RAD, theta = Math.atan2(-v[2], v[0]) / RAD;
          Object.assign(el.style, { left: (W / 2 + s.A[0]) + 'px', top: (H / 2 + s.A[1] - (parseFloat(getComputedStyle(el).height) || 0) / 2) + 'px', width: Lg.toFixed(1) + 'px' });
          s.el = el;
          s.base = 'translateZ(' + (s.A[2] - g.plane).toFixed(1) + 'px) rotateY(' + theta.toFixed(3) + 'deg) rotateZ(' + phi.toFixed(3) + 'deg)';
        });
        p.measured = document.fonts ? document.fonts.status === 'loaded' : true;
      }
      const pointAt = (p, d) => {
        const pts = p.pts;
        if (d <= 0) return pts[0].p;
        for (let i = 1; i < pts.length; i++) if (d <= pts[i].d) return vmix(pts[i - 1].p, pts[i].p, (d - pts[i - 1].d) / (pts[i].d - pts[i - 1].d || 1));
        return pts[pts.length - 1].p;
      };
      const headAt = (p, t) => (p.trim ? value(p.trim, p.scope, t) : 0);

      // ---- the ride: a camera that follows a path's head, faces each layer it passes, then hands over to a shot ----
      function ride(o, P, t) {
        const p = find(o.path, root);
        if (!p || !p.pts) return {};
        const until = o.until === undefined ? Infinity : value(o.until, root, 0) / perSecond;
        const at1 = (tt) => {
          const d = headAt(p, Math.min(tt, until) * perSecond);
          let at = [0, 0, 0];
          for (const k of [-160, 0, 160, 320]) at = vadd(at, pointAt(p, d + k), 0.25);
          let dir = [0, 0, 0], aim = [0, 0, 0], wsum = 0;
          const reach = value(o.reach, root, 0), wander = value(o.wander || 0, root, 0);
          p.segs.filter((s) => s.kind === 'stop').forEach((s, i) => {
            const L = placeOf(s.layer), gap = Math.max(0, s.from - d, d - s.to), w = Math.exp(-((gap / reach) ** 2));
            const life = wander * Math.sin(d / 700 + i * 2.1);
            dir = vadd(dir, turnXY([life, 0.5 * life, 1], L.r[0], L.r[1]), w);
            aim = vadd(aim, vmix(L.c, at, 0.25), w);
            wsum += w;
          });
          const ws = Math.min(1, wsum);
          if (wsum > 0) { dir = vadd([0, 0, 0], dir, ws / wsum); aim = vadd([0, 0, 0], aim, 1 / wsum); }
          dir = vadd(dir, [0, -0.15, 1], 1 - ws);
          const dist = value(o.distance, root, 0) * (1 + 0.8 * (1 - ws)), target = vmix(at, aim, ws);
          return { eye: vadd(target, dir, dist / vlen(dir)), at: target };
        };
        const r = at1(t), h = o.then;
        if (!h) return K.look(r.eye, r.at, { perspective: P });
        const a = value(h.at, root, 0).map((x) => x / perSecond), push = value(h.push || 0, root, 0) * Math.max(0, t - a[0]);
        const k = K.ramp(t, a[0], a[1], h.ease), eye = vadd(value(h.eye, root, 0), [0, 0, -push]), look = vadd(value(h.look, root, 0), [0, 0, -push]);
        return K.look(vmix(r.eye, eye, k), vmix(r.at, look, k), { perspective: P });
      }

      // An element's own scope when its layer's src finds several: i and n beside the layer's scope.
      const child = (scope, i, n) => ({ comp: scope.comp, parent: scope, start: 0, at: scope.at, prefix: scope.prefix, ids: new Map(), roles: scope.roles, params: null, rows: { i, n }, under: scope.under });
      function elScope(node, i) {
        if (node.els.length < 2) return node.scope;
        const all = node.escopes || (node.escopes = []);
        return all[i] || (all[i] = child(node.scope, i, node.els.length));
      }

      // ---- Kinetic's layer calls on an element: effect(), shade(), blur() (as backdrop) and draw() ----
      // Made at the layer's first frame, with the scene so it runs on the scene's time and goes with it; then set()
      // each frame with its options worked out now (an unchanged value changes nothing). A new `kind` makes it again on a
      // fresh copy of its element, since a canvas takes one context. Marks and strokes are data, worked out at the time
      // the call paints them.
      const SET = { effect: null, shade: null, backdrop: ['radius', 'fps', 'delay', 'freeze'], draw: ['inks', 'wobble', 'pressure', 'speed', 'tooth', 'lead', 'seed', 'paper', 'drawn'] };
      const STROKES = ['construct', 'contour', 'hatch', 'accent', 'text', 'pause'];
      const engines = [];
      function engine(node, k, el, i, t) {
        const rec = node.rec, scope = node.scope, spec = rec.look[k], own = node.cache[i] || (node.cache[i] = {});
        const at = (s) => s * perSecond - node.scope.at;   // a call's own time (seconds of the scene) as the layer's
        const o = {};
        for (const key in spec) if (key !== 'marks' && key !== 'strokes' && key !== 'move' && key !== 'source' && key !== 'options') o[key] = deep(spec[key], scope, t, key);
        // options: several options at once, from a value (a call that picks a kind's own parameters, say).
        if (spec.options !== undefined) {
          const more = deep(spec.options, scope, t);
          if (!isObj(more)) throw fail(CODES.VALUE, node.name, __DEV__ && ('look.' + k + '.options gives an object of options, not ' + show(more)));
          Object.assign(o, more);
        }
        if (k === 'draw') { for (const key of ['start', 'end']) if (o[key] !== undefined) o[key] /= perSecond; }
        if (k === 'shade' || k === 'backdrop') for (const key of ['delay']) if (o[key] !== undefined) o[key] /= perSecond;
        // move: the name of a function handed over in fns, or null for none (a knob may switch it).
        if (spec.move !== undefined) {
          const name = deep(spec.move, scope, t);
          const fn = name === null ? null : opts.fns && opts.fns[name];
          if (fn === undefined || (fn !== null && typeof fn !== 'function')) throw fail(CODES.FUNCTION, node.name, __DEV__ && ('look.' + k + '.move names ' + show(name) + ', and no function of that name was handed over in fns'));
          o.move = fn;
        }
        own.t = t;
        if (own.engine && k !== 'draw' && k !== 'backdrop' && o.kind !== own.kind) {
          // Another kind: the old call let go, and a fresh element in its place.
          own.engine.dispose();
          const fresh = el.cloneNode(false);
          el.replaceWith(fresh);
          node.els[i] = el = fresh;
          own.engine = null;
        }
        if (!own.engine) {
          const make = Object.assign({}, o);
          if (opts.scene) make.scene = opts.scene;
          if (spec.source !== undefined) {
            const src = within(node.scope, spec.source, true);
            if (!src) throw fail(CODES.ELEMENT, node.name, __DEV__ && ('look.' + k + '.source ' + show(spec.source) + ' finds no element'));
            make.source = src;
          }
          // Painted at the time the call asks for, or the layer's own when it gives none.
          if (spec.marks !== undefined) make.marks = (m, s) => m.marks(deep(spec.marks, scope, s === undefined ? own.t : at(s)));
          if (make.move === null) delete make.move;
          if (k === 'draw') make.strokes = (s) => {
            for (const st of deep(spec.strokes || [], scope, 0)) {
              const call = STROKES.find((c) => c in st);
              if (!call) throw fail(CODES.FIELD, node.name, __DEV__ && ('a stroke is one of ' + STROKES.join(', ') + ': ' + show(st)));
              if (call === 'pause') { s.pause(st.pause); continue; }
              // The call's options, and the stroke's own keys beside them (ink, group); a text stroke's `text` option is
              // its words, so the call's key is left out of the stroke's keys alone.
              const args = Object.assign({}, st[call]);
              for (const key in st) if (key !== call) args[key] = st[key];
              s[call](args);
            }
          };
          own.engine = k === 'effect' ? K.effect(el, make) : k === 'shade' ? K.shade(el, make) : k === 'backdrop' ? K.blur(el, make) : K.draw(el, make);
          own.kind = o.kind;
          // Listed once for refresh(), however many times its kind changes.
          if (own.last === undefined) engines.push(own);
          own.last = show(o);
          return el;
        }
        // set() takes what can change: all but the kind for effect and shade; the listed options for blur and draw.
        const now = {};
        for (const key in o) if (key !== 'kind' && (!SET[k] || SET[k].includes(key))) now[key] = o[key];
        const key = show(now) + (typeof now.move === 'function' ? ' move' : '');
        if (key !== own.last) { own.last = key; own.engine.set(now); }
        return el;
      }

      // ---- copies: smear (the layer's own motion sampled across the shutter) and trails (ghosts, a ribbon, dots) ----
      // A layer's style at its own time t: its place and look tracks as Kinetic's styleAt() writes them, then look.style.
      function styleOf(node, t) {
        const rec = node.rec, scope = node.scope, place = rec.place || {}, look = rec.look || {}, spec = {};
        for (const k of ['translate', 'rotate', 'scale']) if (place[k] !== undefined) {
          const v = value(place[k], scope, t);
          if (k === 'translate') { spec.translateX = v[0]; spec.translateY = v[1]; } else spec[k] = Array.isArray(v) ? v[2] : v;
        }
        if (look.opacity !== undefined) spec.opacity = value(look.opacity, scope, t);
        const st = Object.keys(spec).length ? K.styleAt(0, spec) : {};
        for (const k in look.style || {}) st[k] = cssOf(look.style[k], scope, t);
        return st;
      }
      // Rows of copies, each a clone of the template in el (or, for smear, of el itself beside it), styled per row.
      function rowsInto(own, el, rows, make) {
        if (!own.rows || own.rows.length !== rows.length) {
          for (const r of own.rows || []) if (r.el !== el) r.el.remove();
          own.rows = [];
          rows.forEach((_, j) => own.rows.push({ el: make(j, j ? own.rows[j - 1].el : null), style: {} }));
        }
        rows.forEach((r, j) => {
          const p = own.rows[j];
          for (const k in r) if (p.style[k] !== r[k]) { p.el.style[k] = r[k]; p.style[k] = r[k]; }
        });
      }
      const fromTemplate = (el, own) => () => {
        if (own.tpl === undefined) own.tpl = el.querySelector(':scope > template');
        const c = own.tpl ? proto(own.tpl).cloneNode(true) : document.createElement('span');
        el.appendChild(c);
        return c;
      };
      function copies(node, el, i, t) {
        const rec = node.rec, scope = node.scope, look = rec.look, own = node.cache[i] || (node.cache[i] = {}), sec = t / perSecond;
        if (look.smear) {
          // The element is copy 0; the others are clones after it, each at its own share of the shutter.
          const o = deep(look.smear, scope, t);
          const rows = K.smear(sec, (s) => styleOf(node, s * perSecond), o);
          rowsInto(own, el, rows.map((r) => r.style), (j, prev) => {
            if (!j) return el;
            const c = el.cloneNode(true);
            c.removeAttribute('data-moves');
            prev.after(c);
            return c;
          });
          return true;
        }
        if (look.repeat) {
          // Kinetic's repeat(): count copies from the container's <template>, each the last one's step again.
          // `each: { scale }` scales every copy about its own origin after its step (a count of 0 or less: none).
          const o = deep(look.repeat, scope, t), n = Math.max(0, Math.round(o.count)), each = o.each || {};
          delete o.count;
          delete o.each;
          if (o.translate) { o.translateX = o.translate[0]; o.translateY = o.translate[1]; delete o.translate; }
          const rows = n ? K.repeat(n, o).map((r) => r.style) : [], last = rows[rows.length - 1] || {};
          if (each.scale !== undefined) for (const r of rows) r.transform += ' scale(' + Number(each.scale).toFixed(3) + ')';
          // Others read 'id.count', and the last copy's 'id.transform' and 'id.transformOrigin'.
          node.out = { count: n, transform: last.transform, transformOrigin: last.transformOrigin };
          rowsInto(own, el, rows, fromTemplate(el, own));
          return true;
        }
        const tr = look.trails, kind = tr.kind;
        const o = {};
        for (const k in tr) if (k !== 'kind' && k !== 'of' && k !== 'u' && k !== 'past' && k !== 'future') o[k] = deep(tr[k], scope, t, k);
        if (kind === 'ghosts') {
          const of = find(tr.of, scope);
          if (!of) throw fail(CODES.LINK, node.name, __DEV__ && ('look.trails.of names ' + show(tr.of) + ', which is not a layer here'));
          o.style = (s) => styleOf(of, s * perSecond + node.scope.at - of.scope.at);
          if (o.lag !== undefined) o.lag /= perSecond;
          rowsInto(own, el, K.trails('ghosts', sec, o).map((r) => r.style), fromTemplate(el, own));
          return true;
        }
        const u = value(tr.u, scope, t);
        if (kind === 'ribbon') {
          const d = K.trails('ribbon', u, o);
          if (own.d !== d) { el.setAttribute('d', d); own.d = d; }
          node.out = { d };
          return true;
        }
        if (kind === 'dots') {
          const states = { past: deep(tr.past || {}, scope, t), future: deep(tr.future || {}, scope, t) };
          rowsInto(own, el, K.trails('dots', u, o).map((p) => Object.assign({ left: p.x + 'px', top: p.y + 'px' }, states[p.state === 'past' ? 'past' : 'future'])), fromTemplate(el, own));
          return true;
        }
        throw fail(CODES.FIELD, node.name, __DEV__ && ("look.trails.kind is 'ghosts', 'ribbon' or 'dots', not " + show(kind)));
      }

      // A copy's or a letter's style from an animator's place and look, worked out in its own scope at its own time:
      // Kinetic's styleAt() for the transform and the look; `class` is returned apart.
      function animated(a, sc, t) {
        const spec = {}, css = {};
        let cls = null;
        for (const f of ['place', 'look']) for (const k in a[f] || {}) {
          if (k === 'style') {
            // Any CSS property by name; a value form with a unit is written with it.
            for (const p in a[f].style) css[p] = cssOf(a[f].style[p], sc, t);
            continue;
          }
          const v = value(a[f][k], sc, t);
          // A color is the value's own, written as CSS: styleAt() takes numbers and tracks, not a color worked out.
          if (k === 'class') cls = v;
          else if (k === 'color') css.color = String(color(v, sc));
          else if (k === 'translate') { spec.translateX = v[0]; spec.translateY = v[1]; } else spec[PART_KEYS[k]] = v;
        }
        return { style: Object.assign(Object.keys(spec).length ? K.styleAt(0, spec) : {}, css), cls };
      }

      // ---- copies born over time: one every `every`, each living `life`, a clone of the container's <template> ----
      // Copy j is born at j * every and shows while its age is under life; it reads its index as i and its age as
      // age, and plays the animator at its age. Copies stand in the order they were born, the newest last.
      function cycle(node, el, i, t) {
        const rec = node.rec, scope = node.scope, own = node.cache[i] || (node.cache[i] = {}), a = rec.animate || {};
        // { count }: copies 0 to count - 1, each at the layer's own time, reading i of n (a count may follow a knob).
        const counted = rec.repeat.count !== undefined, count = counted ? Math.max(0, Math.round(value(rec.repeat.count, scope, t))) : 0;
        const every = counted ? 1 : value(rec.repeat.every, scope, t), life = counted ? 0 : value(rec.repeat.life, scope, t);
        // The oldest copy still under life: born after t - life (copies born before frame 0 included, so the stream is
        // already running at the start).
        const lo = counted ? 0 : Math.floor((t - life) / every) + 1, hi = counted ? count - 1 : Math.floor(t / every), born = own.born || (own.born = new Map());
        if (own.tpl === undefined) own.tpl = el.querySelector(':scope > template');
        if (!own.tpl) throw fail(CODES.ELEMENT, node.name, __DEV__ && 'a repeat born over time makes its copies from a <template> in its element; it has none');
        for (const [j, c] of born) if (j < lo || j > hi) { c.el.remove(); born.delete(j); }
        for (let j = lo; j <= hi; j++) {
          let c = born.get(j);
          if (!c) {
            const e = proto(own.tpl).cloneNode(true);
            // Before the first copy born later (a seek back), or last.
            let next = null;
            for (const [k, o] of born) if (k > j && (!next || k < next.j)) next = { j: k, el: o.el };
            el.insertBefore(e, next ? next.el : null);
            c = { el: e, base: e.className, style: {}, cls: null };
            born.set(j, c);
          }
          const age = counted ? t : t - j * every, rows = counted ? { i: j, n: count } : { i: j, age };
          const s = animated(a, { comp: scope.comp, parent: scope, start: 0, at: scope.at, prefix: scope.prefix, ids: new Map(), roles: scope.roles, params: null, rows, under: scope.under }, age);
          for (const k in s.style) if (c.style[k] !== s.style[k]) { css(c.el, k, s.style[k]); c.style[k] = s.style[k]; }
          if (s.cls !== c.cls) { c.el.className = c.base + (s.cls ? ' ' + s.cls : ''); c.cls = s.cls; }
        }
      }

      // ---- lettering: a text layer on a canvas, drawn by Kinetic's text() from baked outlines ----
      // content.font names the outlines (a global the outline baker's file sets, or the object); the line's options
      // are content's at, size, align, valign, tracking, spacing and color; each letter takes the animator's place,
      // look and font axes at its own time (start and stagger as a split text's parts).
      function lettering(node, el, i) {
        const rec = node.rec, scope = node.scope, c = rec.content, own = node.cache[i] || (node.cache[i] = {});
        if (own.letters) return;
        const font = typeof c.font === 'string' ? window[c.font] : c.font;
        if (!font) throw fail(CODES.NAME, node.name, __DEV__ && ('content.font names ' + show(c.font) + ', and no outlines are there; load the outline baker\'s file first'));
        const a = rec.animate || {}, parts = [];
        const o = { font, lines: (m, s) => {
          const t = s * perSecond - node.scope.at, line = {};
          for (const k of LINE) if (c[k] !== undefined) line[k] = deep(c[k], scope, t, k);
          const text = String(c.text), n = K.split(text, 'letter').length, start = a.start === undefined ? 0 : value(a.start, scope, t);
          const so = {};
          for (const k of ['each', 'total', 'ease', 'grid', 'axis', 'seed', 'from']) if (a[k] !== undefined) so[k] = value(a[k], scope, t);
          m.line(text, line, (j) => {
            const ps = parts[j] || (parts[j] = child(scope, j, n)), lt = t - start - (a.each !== undefined || a.total !== undefined ? K.stagger(j, n, so) : 0);
            const out = {};
            for (const k in a.place || {}) {
              const v = value(a.place[k], ps, lt);
              if (k === 'translate') { out.dx = v[0]; out.dy = v[1]; } else out[k] = v;
            }
            for (const k in a.look || {}) { const v = value(a.look[k], ps, lt); out[k] = k === 'color' ? color(v, ps) : v; }
            for (const k in a.axes || {}) out[k] = value(a.axes[k], ps, lt);
            return out;
          });
        } };
        if (opts.scene) o.scene = opts.scene;
        own.letters = K.text(el, o);
      }

      // ---- text: a line typed or scrambled whole, or split into letters or words that each play the animator ----
      // A string in content.text is the text itself; a name or a store's field is read with a link ({ from }).
      // A value as the words a layer shows: nothing (a store's empty field) is no words.
      const words = (x) => (x === null || x === undefined ? '' : String(x));
      // A CSS property by name, a custom property (--name) included.
      const css = (el, k, v) => { if (k.startsWith('--')) el.style.setProperty(k, v); else el.style[k] = v; };
      const PART_KEYS = { translate: null, rotate: 'rotate', scale: 'scale', opacity: 'opacity', blur: 'blur', color: 'color' };
      // A part's text, ahead of whatever its template holds (a mark drawn inside the letter keeps its place).
      const put = (pe, text) => pe.insertBefore(document.createTextNode(text), pe.firstChild);
      // The template an element's parts are copies of. The parts take the place of the text the element holds, as a
      // whole text does, so that text goes; the <template> stays.
      const partsOf = (el) => { for (const n of [...el.childNodes]) if (n.nodeType === 3) n.remove(); return el.querySelector(':scope > template'); };
      function drawText(node, el, i, t) {
        const rec = node.rec, scope = node.scope, c = rec.content || {};
        const num = (v, d) => (v === undefined ? d : value(v, scope, t));
        if (c.captions) return drawCaptions(node, el, i, t, num);
        if (c.font !== undefined) return lettering(node, el, i);
        let s = c.text === undefined ? '' : typeof c.text === 'string' ? c.text : words(value(c.text, scope, t));
        // Times in the record's unit; cps and a scramble's fps are a second's worth, as Kinetic's calls take them.
        if (c.typewriter) s = K.typewriter((t - num(c.typewriter.start, 0)) / perSecond, s, num(c.typewriter.cps, 20));
        if (c.scramble) {
          const o = {}, sc = c.scramble;
          if (sc.duration !== undefined) o.duration = num(sc.duration) / perSecond;
          for (const k of ['fps', 'seed']) if (sc[k] !== undefined) o[k] = num(sc[k]);
          if (sc.chars !== undefined) o.chars = sc.chars;
          s = K.scramble(Math.max(0, (t - num(sc.start, 0)) / perSecond), s, o);
        }
        // What it shows, for a link to read: 'line.text', and 'line.length' in letters.
        node.out = { text: s, length: K.split(s, 'letter').length };
        if (!c.split) { if (el.textContent !== s) el.textContent = s; return; }
        // The parts, made again when the text changes: each a copy of the element's own <template> (its class and
        // markup), or a span set inline-block so it can move. Whitespace keeps its parts, so the gaps stay.
        const own = node.cache[i] || (node.cache[i] = {});
        if (own.text !== s) {
          own.text = s;
          if (own.tpl === undefined) own.tpl = partsOf(el);
          for (const p of own.parts || []) p.el.remove();
          own.parts = K.split(s, c.split).map((r) => {
            const pe = own.tpl ? proto(own.tpl).cloneNode(true) : document.createElement('span');
            if (!own.tpl) { pe.style.display = 'inline-block'; pe.style.whiteSpace = 'pre'; }
            put(pe, r.text);
            el.appendChild(pe);
            return { el: pe, space: r.space, style: {} };
          });
        }
        const a = rec.animate;
        if (!a) return;
        const n = own.parts.length, start = num(a.start, 0), o = {};
        for (const k of ['each', 'total', 'ease', 'grid', 'axis', 'seed', 'from']) if (a[k] !== undefined) o[k] = k === 'ease' || k === 'axis' || (k === 'from' && typeof a[k] === 'string') ? a[k] : num(a[k]);
        own.parts.forEach((p, j) => {
          // Spaces stay still unless spaces: true, so a stagger's timing still counts them.
          if (p.space && !a.spaces) return;
          // A stagger only where the animator asks for one (each or total); a sweep's weights need none.
          const lt = t - start - (a.each !== undefined || a.total !== undefined ? K.stagger(j, n, o) : 0);
          // Worked out in the part's own scope: its i of n, for a { sweep } or a { stagger } inside the tracks.
          const s = animated(a, p.scope || (p.scope = child(scope, j, n)), lt);
          for (const k in s.style) if (p.style[k] !== s.style[k]) { css(p.el, k, s.style[k]); p.style[k] = s.style[k]; }
          if (s.cls !== (p.cls || null)) { if (p.base === undefined) p.base = p.el.className; p.el.className = p.base + (s.cls ? ' ' + s.cls : ''); p.cls = s.cls; }
        });
      }

      // The caption line current now: a span per word (a copy of the element's <template>, or a span), each styled by
      // look.words for its state. The transcript is read once, so captions() groups it once.
      function drawCaptions(node, el, i, t, num) {
        const rec = node.rec, scope = node.scope, cp = rec.content.captions, own = node.cache[i] || (node.cache[i] = {});
        // Written in the record, or read once from a query or a store ({ from: 'words.rows' }).
        if (!node.words) node.words = cp.srt !== undefined ? K.srt(value(cp.srt, scope, t)) : data(cp.cues, scope, t);
        const o = {};
        for (const k of ['maxWords', 'maxChars', 'maxGap', 'hold']) if (cp[k] !== undefined) o[k] = num(cp[k]);
        if (cp.sentences !== undefined) o.sentences = !!num(cp.sentences);
        const line = K.captions(t / perSecond, node.words, o);
        node.out = { text: line.text, index: line.index, empty: line.empty, length: line.words.length };
        const key = line.words.map((w) => w.key).join(' ');
        if (own.key !== key) {
          own.key = key;
          if (own.tpl === undefined) own.tpl = partsOf(el);
          for (const p of own.parts || []) p.el.remove();
          own.parts = line.words.map((w) => {
            const pe = own.tpl ? proto(own.tpl).cloneNode(true) : document.createElement('span');
            put(pe, w.text);
            el.appendChild(pe);
            return { el: pe, style: {} };
          });
        }
        const looks = (rec.look && rec.look.words) || {};
        line.words.forEach((w, j) => {
          // Each word's look is worked out in its own scope: its i of n, and p, its own progress from 0 to 1.
          const p = own.parts[j], lk = looks[w.state] || {}, ws = { comp: scope.comp, parent: scope, start: 0, at: scope.at, prefix: scope.prefix, ids: new Map(), roles: scope.roles, params: null, rows: { i: j, n: line.words.length, p: w.p }, under: scope.under };
          for (const k in lk) {
            const v = value(lk[k], ws, t), css = String(k === 'color' ? color(v, scope) : v);
            if (p.style[k] !== css) { p.el.style[k] = css; p.style[k] = css; }
          }
        });
      }

      // A camera's moves are Kinetic's moves(), with its times and places worked out from the record.
      const where = (name) => { const n = find(name, root); if (!n) throw fail(CODES.LINK, 'camera', __DEV__ && ('no layer is named ' + show(name))); return v3(value(n.rec.place.position, n.scope, 0)); };
      let cams = [];
      const makeCams = () => (cams = nodes.filter((n) => n.rec.kind === 'camera').map((node) => {
        const rec = node.rec, P = value(rec.perspective || 1000, node.scope, 0);
        const num = (v) => value(v, node.scope, 0);
        const to = (o) => {
          const out = {};
          for (const k in o) {
            const v = o[k];
            // { distance, from }: so far in front of a layer's plane.
            out[k] = v && typeof v === 'object' && 'distance' in v ? P - where(v.from)[2] - num(v.distance) : num(v);
          }
          return out;
        };
        const list = rec.moves.map((m) => {
          const out = Object.assign({}, m);
          if (m.t !== undefined) out.t = num(m.t) / perSecond;
          if (m.d !== undefined) out.d = num(m.d) / perSecond;
          if (m.blend !== undefined) out.blend = num(m.blend) / perSecond;
          // A behavior: the move's target worked out at each moment.
          if (m.to && m.to.behavior === 'ride') out.to = (tt) => ride(m.to, P, tt);
          else if (m.to && m.to.behavior) throw fail(CODES.FIELD, node.name, __DEV__ && ('no behavior is named ' + show(m.to.behavior)));
          else if (m.to) out.to = to(m.to);
          if (typeof m.dolly === 'string') out.dolly = where(m.dolly)[2];
          return out;
        });
        return { node, P, fn: K.moves(list, { perspective: P }) };
      }));
      makeCams();

      function seek(F) {
        // Paths are measured once their layers are laid out in their fonts; the cameras that ride them are made again.
        if (paths.some((p) => !p.measured)) { for (const p of paths) if (!p.measured) measure(p); makeCams(); }
        // The live camera: the last one listed that is alive now.
        let cam = null;
        for (const c of cams) if (when(c.node, F)) cam = c;
        const t = F / perSecond;
        const m = cam ? cam.fn(t) : {};
        const tracks = { x: m.x || 0, y: m.y || 0, z: m.z || 0, pan: m.pan || 0, tilt: m.tilt || 0, roll: m.roll || 0 };
        const P = cam ? cam.P : 1000;
        const focus = cam && cam.node.rec.focus !== undefined ? value(cam.node.rec.focus, cam.node.scope, when(cam.node, F).t) : 0;
        // The composition's world is moved by a record with cameras; one without leaves it to the record that has them.
        if (worldEl && cams.length) Object.assign(worldEl.style, K.camera(t, tracks, { perspective: P }));
        // Each path's head, and its progress along each stop, before anything that reads them.
        for (const p of paths) {
          if (!p.pts) continue;
          const d = (p.out.head = headAt(p, F));
          for (const s of p.segs) if (s.kind === 'stop') p.out[s.stop] = Math.min(1, Math.max(0, (d - s.from) / (s.to - s.from)));
        }
        const near = (z) => P - (z + tracks.z);
        for (const node of els) {
          current = node.name;
          const rec = node.rec, scope = node.scope, w = when(node, F), place = rec.place || {}, look = rec.look || {};
          const set = (el, i, key, v) => { const c = node.cache[i] || (node.cache[i] = {}); if (c[key] !== v) { css(el, key, v); c[key] = v; } };
          const attr = (el, i, key, v) => { const c = node.cache[i] || (node.cache[i] = {}); if (c['@' + key] !== v) { el.setAttribute(key, v); c['@' + key] = v; } };
          const group = groupOf(node);
          if (rec.group) {
            // The group's plane, drawn exactly from where the camera is now.
            node.els.forEach((el, i) => set(el, i, 'display', w ? '' : 'none'));
            if (w) Object.assign(node.els[0].style, { zoom: '' }, K.depth(node.plane, { perspective: P, fill: false, detail: 1, camera: K.cameraAt(t, tracks) }));
            continue;
          }
          if (rec.kind === 'path') {
            if (!w || !node.pts) continue;
            const d = node.out.head;
            node.segs.forEach((s, i) => {
              if (s.kind === 'stop') {
                // The path inside its layer, drawn on as far as the head; its own head shows while the head is on it.
                const pr = node.out[s.stop];
                for (const el of s.els) el.setAttribute('stroke-dashoffset', (1 - pr).toFixed(4));
                if (s.head) {
                  let k = 0;
                  const at = pr * s.len;
                  while (k < s.lens.length - 2 && at > s.lens[k + 1]) k++;
                  const u = (at - s.lens[k]) / (s.lens[k + 1] - s.lens[k] || 1), a = s.local[k], b = s.local[k + 1];
                  s.head.setAttribute('cx', (a[0] + (b[0] - a[0]) * u).toFixed(1));
                  s.head.setAttribute('cy', (a[1] + (b[1] - a[1]) * u).toFixed(1));
                  const next = node.segs[i + 1];
                  s.head.style.display = pr > 0 && (!next || d <= next.from) ? '' : 'none';
                }
                return;
              }
              if (!s.el) return;
              // A straight stretch, drawn on from its start by its scale, faded as the camera reaches it.
              const pr = Math.min(1, Math.max(0, (d - s.from) / (s.to - s.from)));
              self = { cameraDistance: near(Math.min(s.A[2], s.B[2])), z: Math.min(s.A[2], s.B[2]), focus };
              s.el.style.transform = s.base + ' scaleX(' + pr.toFixed(4) + ')';
              s.el.style.visibility = pr > 0 ? 'visible' : 'hidden';
              s.el.style.opacity = Number(look.opacity === undefined ? 1 : value(look.opacity, scope, w.t)).toFixed(3);
            });
            // The head between stops: a disc facing the camera, at first the size of the point the path starts from.
            const hd = rec.content.head && rootEl.querySelector(rec.content.head.el);
            if (hd) {
              const onConn = d <= 0 || node.conns.some((s) => d > s.from && d < s.to), hp = pointAt(node, d);
              const [over, to] = value(rec.content.head.grow, scope, w.t), rr = node.headR + (to - node.headR) * Math.min(1, Math.max(0, d / over));
              Object.assign(hd.style, {
                display: onConn ? '' : 'none', width: (2 * rr).toFixed(2) + 'px', height: (2 * rr).toFixed(2) + 'px',
                transform: 'translate3d(' + (W / 2 + hp[0] - rr).toFixed(2) + 'px, ' + (H / 2 + hp[1] - rr).toFixed(2) + 'px, ' + (hp[2] - group.plane).toFixed(2) + 'px)'
                  + ' rotateY(' + (-tracks.pan).toFixed(3) + 'deg) rotateX(' + (-tracks.tilt).toFixed(3) + 'deg)',
              });
            }
            continue;
          }
          if (group && place.position) {
            // A child of a group: placed from the group's plane, turned about its own center.
            const L = placeOf(node);
            self = { cameraDistance: near(L.c[2]), z: L.c[2], focus };
            node.els.forEach((el, i) => {
              set(el, i, 'left', (W / 2 - L.size[0] / 2 + L.c[0]) + 'px');
              set(el, i, 'top', (H / 2 - L.size[1] / 2 + L.c[1]) + 'px');
              set(el, i, 'transform', 'translateZ(' + (L.c[2] - group.plane) + 'px) rotateY(' + L.r[1] + 'deg) rotateX(' + L.r[0] + 'deg)');
              if (look.opacity !== undefined) set(el, i, 'opacity', Number(value(look.opacity, scope, w ? w.t : 0)).toFixed(3));
            });
            continue;
          }
          if (rec.band === 'world') {
            // In the world: alive, in front of the camera, faded and blurred by what the camera measures.
            const pos = v3(value(place.position, scope, w ? w.t : 0)), dd = P - (pos[2] + tracks.z);
            let showIt = !!w && dd > 4, alpha = 0, blur = 0;
            if (showIt) {
              self = { cameraDistance: dd, screenScale: P / dd, z: pos[2], focus };
              alpha = look.opacity === undefined ? 1 : value(look.opacity, scope, w.t);
              blur = look.blur === undefined ? 0 : value(look.blur, scope, w.t);
              if (alpha < 0.004) showIt = false;
            }
            node.els.forEach((el, i) => {
              set(el, i, 'display', showIt ? '' : 'none');
              set(el, i, 'opacity', showIt ? alpha.toFixed(3) : '0');
              set(el, i, 'filter', showIt && blur > 0.25 ? 'blur(' + blur.toFixed(1) + 'px)' : 'none');
              set(el, i, 'transform', 'translate3d(' + pos[0] + 'px, ' + pos[1] + 'px, ' + pos[2] + 'px) translate(-50%, -50%)');
              // Its own styles while it is shown, as a layer on the screen takes them, and none of them while it is
              // not, so the page at a time is the same whatever was drawn before.
              for (const k in look.style || {}) set(el, i, k, showIt ? cssOf(look.style[k], scope, w.t) : '');
            });
            continue;
          }
          // A part inside a layer, or a layer on the screen: its own fields, while it is alive.
          self = {};
          const t0 = w ? w.t : null;
          node.els.forEach((el, i) => {
            if (rec.life) set(el, i, 'display', w ? '' : 'none');
            if (!w) return;
            // Each of several elements is worked out with its own i of n; delay starts its time that much later.
            const scope = elScope(node, i), tt = rec.delay === undefined ? t0 : t0 - value(rec.delay, scope, t0);
            if (look.smear || look.trails || look.repeat) { if (copies(node, el, i, tt)) return; }
            if (look.transition) {
              // Kinetic's transition(kind, p, { direction }): this side's styles, every property it can write reset first.
              const o = deep(look.transition, scope, tt), st = K.transition(o.kind, o.p, o.direction == null ? undefined : { direction: o.direction })[o.side || 'in'];
              for (const k of ['opacity', 'translate', 'scale', 'rotate', 'clipPath', 'filter', 'zIndex']) set(el, i, k, st[k] === undefined ? '' : String(st[k]));
            }
            if (rec.repeat) cycle(node, el, i, tt);
            // A stagger plays one preset from each element's own start.
            const start = rec.stagger ? value(rec.stagger.starts[i], scope, tt) : 0, lt = tt - start;
            const preset = look.preset && record.presets && record.presets[look.preset];
            if (preset) {
              // A track the preset leaves out stays at rest: opacity 1, y 0, scale 1.
              const at = (v, rest) => (v === undefined ? rest : asNum(value(v, scope, lt)));
              const o = at(preset.opacity, 1), y = at(preset.y, 0), s = at(preset.scale, 1);
              set(el, i, 'opacity', o.toFixed(3));
              set(el, i, 'transform', 'translateY(' + y.toFixed(2) + 'px) scale(' + s.toFixed(4) + ')');
              return;
            }
            // Written as Kinetic's styleAt() writes it, in full.
            if (look.opacity !== undefined) set(el, i, 'opacity', String(value(look.opacity, scope, tt)));
            // The element's CSS color, a swatch or role name being its color (look.style.color wins when both are given).
            if (look.color !== undefined) set(el, i, 'color', String(inks(value(look.color, scope, tt), scope)));
            // A CSS blur, in px; none at 0.
            if (look.blur !== undefined) { const b = value(look.blur, scope, tt); set(el, i, 'filter', b > 0 ? 'blur(' + b.toFixed(2) + 'px)' : 'none'); }
            if (look.trim) {
              // Drawn on from its start: a path trimmed to nothing draws nothing, not even its cap.
              const end = Math.max(0, Math.min(1, value(look.trim.end, scope, tt)));
              attr(el, i, 'stroke-dashoffset', (1 - end).toFixed(4));
              set(el, i, 'visibility', end > 0 ? '' : 'hidden');
            }
            for (const k of ENGINES) if (look[k] !== undefined) { el = engine(node, k, el, i, tt); break; }
            if (rec.kind === 'lottie') {
              // Played again when its options change (a knob).
              const o = lottieOpts(node), key = show(o);
              if (key !== node.played) { node.played = key; K.lottie(node.anim, Object.assign(opts.scene ? { scene: opts.scene } : {}, o)); }
            } else if (rec.kind === 'text') drawText(node, el, i, tt);
            // Its content: attributes (places to a tenth of a px, opacities to a thousandth, colors by swatch), and text.
            else for (const k in rec.content || {}) {
              // Text written as a string is shown as it is; an attribute's 'end' or 'last' is the keyword.
              const raw = rec.content[k];
              let x = k === 'text' && typeof raw === 'string' ? raw : raw === 'end' || raw === 'last' ? raw : value(raw, scope, tt);
              // Line boil: Kinetic's boil() of the outline, its seed stepped by the layer's own time.
              if (k === 'd' && look.boil) {
                const b = deep(look.boil, scope, tt);
                if (b.delay !== undefined) b.delay /= perSecond;
                x = K.boil(x, Object.assign(b, { t: tt / perSecond }));
              }
              // The outline drawn (boiled, morphed), for a link to read as 'id.d'.
              if (k === 'd') node.out = Object.assign(node.out || {}, { d: x });
              if (k === 'text') { const s = words(x); if (el.textContent !== s) el.textContent = s; continue; }
              attr(el, i, k, typeof x === 'number' ? x.toFixed(k === 'opacity' ? 3 : 1) : String(color(x, scope)));
            }
            // CSS properties by name, such as strokeDashoffset on a group of drawn paths.
            // A value with a unit ({ ..., unit: '%' }) is written with it.
            for (const k in look.style || {}) set(el, i, k, cssOf(look.style[k], scope, tt));
            const in3d = (rec.kind === 'html' || rec.kind === 'text') && (place.rotate !== undefined || place.perspective !== undefined || (Array.isArray(place.translate) && place.translate.length === 3));
            // A shift's two parts: CSS lengths as written, or value forms written with their unit ({ at, to, unit: '%' }).
            const shift = place.shift === undefined ? null : place.shift.map((v) => (isObj(v) ? String(value(v, scope, tt)) + (typeof v.unit === 'string' ? v.unit : '') : v));
            if (in3d) {
              // In 3D: perspective, translate [x, y, z], rotate (degrees, or [x, y, z]) and scale, as Kinetic's styleAt()
              // writes them, then a shift.
              const spec = {};
              if (place.perspective !== undefined) spec.perspective = value(place.perspective, scope, tt);
              if (place.translate !== undefined) { const p = value(place.translate, scope, tt); spec.translateX = p[0]; spec.translateY = p[1]; if (p.length > 2) spec.translateZ = p[2]; }
              if (place.rotate !== undefined) { const r = value(place.rotate, scope, tt); if (Array.isArray(r)) { spec.rotateX = r[0]; spec.rotateY = r[1]; spec.rotate = r[2]; } else spec.rotate = r; }
              if (place.scale !== undefined) { const s = value(place.scale, scope, tt); if (Array.isArray(s)) { spec.scaleX = s[0]; spec.scaleY = s[1]; } else spec.scale = s; }
              const tf = K.styleAt(0, spec).transform || '';
              set(el, i, 'transform', shift ? tf + ' translate(' + shift[0] + ', ' + shift[1] + ')' : tf);
            }
            // An SVG part turned about its pivot: its transform attribute when the turn is all there is. With a move
            // or a scale, which are a CSS transform (and that takes the attribute's place), the turn is in it.
            const moved = !in3d && (place.translate !== undefined || place.shift !== undefined || place.scale !== undefined);
            const turn = in3d || place.rotate === undefined ? null : value(place.rotate, scope, tt), pv = turn === null ? null : value(place.pivot || [0, 0], scope, tt);
            const deg = turn === null ? 0 : (Array.isArray(turn) ? turn[2] : turn).toFixed(2);
            if (turn !== null && !moved) attr(el, i, 'transform', 'rotate(' + deg + ' ' + pv[0] + ' ' + pv[1] + ')');
            // Moved by px, then by a share of its own size (shift, such as ['0', '-50%']), then turned, then scaled.
            if (moved) {
              const parts = [];
              if (place.translate !== undefined) { const p = value(place.translate, scope, tt); parts.push('translate(' + p[0] + 'px, ' + p[1] + 'px)'); }
              if (shift) parts.push('translate(' + shift[0] + ', ' + shift[1] + ')');
              if (turn !== null) parts.push('translate(' + pv[0] + 'px, ' + pv[1] + 'px) rotate(' + deg + 'deg) translate(' + -pv[0] + 'px, ' + -pv[1] + 'px)');
              // A scale is one number, or [x, y].
              if (place.scale !== undefined) { const s = value(place.scale, scope, tt); if (Array.isArray(s)) parts.push('scale(' + s.join(', ') + ')'); else if (s !== 1 || parts.length) parts.push('scale(' + s + ')'); }
              set(el, i, 'transform', parts.join(' '));
            }
          });
        }
      }
      // Whether there are layer calls: they draw in Kinetic's own seek, after it settles, so a redraw seeks again.
      return { seek, stage: null, dispose: () => { for (const s of scopes) if (s.copy && s.el) s.el.remove(); }, refresh: () => { for (const e of engines) if (e.engine && e.engine.redraw) e.engine.redraw(); return engines.length > 0; } };
    }
  }

  // layers.scene(name, record, { fns }): the record's steps given to step(), and a scene of that name that draws the
  // record: subscribed to the stores it reads, with a Kinetic `follow` for each follower in it, drawn on each seek and
  // again when a store it reads changes while the clock is still (a learner's slider, a choice).
  layers.scene = function (name, record, o = {}) {
    for (const id in record.steps || {}) K.step(id, record.steps[id]);
    // The composition's own settings: the finishing pass (shown live, and on every rendered frame) and the shutter.
    if (record.finish !== undefined || record.shutter !== undefined) {
      const c = {};
      if (record.finish !== undefined) c.finish = record.finish;
      if (record.shutter !== undefined) c.shutter = record.shutter;
      K.config(c);
    }
    const follows = new Map(), follow = {}, seen = new Set(), paths = [];
    const stores = record.stores || [];
    (function walk(v) {
      if (!v || typeof v !== 'object') return;
      // Every store path the record reads, in a link or a driven track.
      for (const k of ['from', 'by']) {
        const s = typeof v[k] === 'string' ? v[k].split('.') : null;
        if (s && s.length > 1 && stores.includes(s[0]) && !seen.has(v[k])) { seen.add(v[k]); paths.push({ store: s[0], path: s.slice(1).join('.') }); }
        // A link to a whole store: each of its fields, once the store is made.
        if (s && s.length === 1 && stores.includes(s[0]) && !seen.has(v[k])) { seen.add(v[k]); paths.push({ store: s[0], path: null }); }
      }
      if (!Array.isArray(v) && 'follow' in v && typeof v.follow === 'string') {
        const n = 'follow' + follows.size;
        follows.set(v, n);
        follow[n] = v.ease === undefined ? v.follow : { target: v.follow, ease: v.ease };
      }
      for (const k in v) walk(v[k]);
    })(record);
    const def = {
      init() {
        const root = this.element.closest('[data-composition-id]');
        // What the page already says, where the record leaves it out: its id is the scene's name, its size the
        // root's, its duration the clip's (else the root's), and its fps the root's data-fps: the rate the piece is
        // written at, which a render at another rate leaves as it is.
        const num = (el, a) => { const v = el && parseFloat(el.getAttribute(a)); return v > 0 ? v : undefined; };
        const full = Object.assign({ id: name, size: [num(root, 'data-width'), num(root, 'data-height')], duration: num(this.element, 'data-duration') || num(root, 'data-duration'), fps: num(root, 'data-fps') }, record);
        // The clip's start in the composition, as its data-start says it (seconds, or a name timeOf() reads), so the
        // composition's markers and beats are read in the clip's own time.
        const at = this.element.getAttribute('data-start');
        let clipStart = 0;
        if (at !== null && at.trim() !== '') { try { clipStart = isFinite(+at) ? +at : K.timeOf(at); } catch (e) { clipStart = 0; } }
        // A record the check refuses throws here once, and again at every seek, so check() and render() see it.
        const build = () => { try { return layers(full, Object.assign({ root, clip: this.element, clipStart, scene: this, follows }, o)); } catch (e) { this.failed = e; throw e; } };
        // A store path the record reads changed (the learner's slider, a choice): drawn again at the clock's time, so
        // the picture answers the learner while the lesson holds.
        // At the scene's own time (seek is handed its clip's local time), so a clip that starts late redraws in place.
        // Layer calls (effect, shade, blur, draw) draw in Kinetic's seek, so with any, the clock seeks its own time again.
        const redraw = () => {
          if (!this.comp) return;
          this.comp.seek(this.local);
          if (this.comp.refresh()) { const clock = wf.getStore('kinetic'); if (!clock.playing) K.seek(clock.time); }
        };
        // A record that reads queries is built once readiness has their rows (its waitFor): at a seek, or when the
        // rows land, since the clock's first seek comes before them and a seek to the same time does not run the
        // scene again. Any other is built now. It is built again when the rows change, so the copies of a repeat
        // over them match the data its links read, and left as it is when a refresh brings the same rows (kept
        // as text, to compare).
        // What the scene follows, each as the function that stops it, for destroy().
        const offs = this.offs = [], keep = (off) => { if (typeof off === 'function') offs.push(off); };
        if (record.queries && record.queries.length) {
          const rowsNow = () => JSON.stringify(record.queries.map((q) => wf.getQuery(q).rows));
          this.build = () => { this.rows = rowsNow(); return build(); };
          const land = () => {
            if (!this.build || !loaded() || (this.comp && rowsNow() === this.rows)) return;
            if (this.comp) { this.comp.dispose(); this.comp = null; }
            this.comp = this.build();
            redraw();
          };
          for (const q of record.queries) { const Q = wf.getQuery && wf.getQuery(q); if (Q && typeof Q.subscribe === 'function') keep(Q.subscribe('rows', land)); }
        } else this.comp = build();
        // A follower moves on Kinetic's own seconds (its 'kinetic-follow' store, written while a spring is moving),
        // also while a lesson holds the clock: drawn again on each.
        const springs = follows.size && wf.getStore('kinetic-follow');
        if (springs) keep(springs.subscribe('seconds', () => { if (this.comp) this.comp.seek(this.local); }));
        for (const p of paths) {
          const st = wf.getStore(p.store);
          for (const path of p.path === null ? Object.keys(st.state || {}) : [p.path]) keep(st.subscribe(path, redraw));
        }
      },
      // The clip is gone: the scene stops following its stores, queries and springs, and takes its drawing with it.
      destroy() {
        for (const off of (this.offs || []).splice(0)) off();
        if (this.comp) this.comp.dispose();
        this.comp = this.build = null;
      },
      seek(t) {
        if (this.failed) throw this.failed;
        if (!this.comp && this.build && loaded()) this.comp = this.build();
        if (this.comp) this.comp.seek(t);
      },
    };
    if (record.stores && record.stores.length) def.subscribe = record.stores.slice();
    if (record.queries && record.queries.length) def.waitFor = record.queries.slice();
    // Every query the record reads has its rows, as readiness judges it: not loading, and synced once.
    const loaded = () => (record.queries || []).every((q) => { const Q = wf.getQuery && wf.getQuery(q); return !!Q && !Q.isLoading && Q.lastSync != null; });
    if (record.inputs) def.inputs = record.inputs;
    if (record.props) def.props = record.props;
    if (follows.size) {
      def.follow = follow;
    }
    K.scene(name, def);
  };

  return layers;
}
