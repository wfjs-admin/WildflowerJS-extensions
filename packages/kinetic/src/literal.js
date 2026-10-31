/**
 * The object syntax of WildflowerJS attributes, as data-bind-class takes it,
 * read as data: data-markers="{ drop: 14.28 }" and
 * data-remap="{ at: [0, 1, 3], to: [0, 0.5, 3.5], ease: 'power2.out' }".
 *
 * Objects, arrays, numbers (with a sign, a fraction or an exponent), strings
 * in single or double quotes, true, false and null. A key is a name
 * (letters, digits, _ and $, not starting with a digit) or a quoted string.
 * Strict JSON is a part of it, so JSON keeps working. Nothing is evaluated:
 * no names other than the three words, no expressions, no trailing commas.
 *
 * parseLiteral(text) is { value } or { error, at }, `at` the character where
 * reading stopped and `error` (development builds only) what was expected
 * there. The callers turn it into their KN code.
 */

const NAME = /[A-Za-z_$][\w$]*/y;
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const ESCAPES = { '"': '"', "'": "'", '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

export function parseLiteral(text) {
  let i = 0;
  const bad = (want) => { throw { at: i, error: want }; };
  const space = () => { while (i < text.length && /\s/.test(text[i])) i++; };

  function string() {
    const q = text[i++];
    let out = '';
    while (i < text.length && text[i] !== q) {
      let c = text[i++];
      if (c === '\\') {
        c = text[i++];
        if (c === 'u') {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) bad(__DEV__ && 'four hex digits after \\u');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
          continue;
        }
        if (!(c in ESCAPES)) { i--; bad(__DEV__ && 'an escape such as \\n or \\\''); }
        c = ESCAPES[c];
      }
      out += c;
    }
    if (i >= text.length) bad(__DEV__ && 'the closing ' + q);
    i++;
    return out;
  }

  function word(re) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) return null;
    i += m[0].length;
    return m[0];
  }

  function value() {
    space();
    const c = text[i];
    if (c === '{') {
      i++;
      const o = {};
      space();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        space();
        const k = text[i] === '"' || text[i] === "'" ? string() : word(NAME);
        if (k === null) bad(__DEV__ && 'a key, a name or a quoted string');
        space();
        if (text[i] !== ':') bad(__DEV__ && "':' after the key");
        i++;
        // Defined, so a key such as __proto__ is an own property, as JSON.parse makes it.
        Object.defineProperty(o, k, { value: value(), enumerable: true, writable: true, configurable: true });
        space();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return o; }
        bad(__DEV__ && "',' or '}'");
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      space();
      if (text[i] === ']') { i++; return a; }
      for (;;) {
        a.push(value());
        space();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return a; }
        bad(__DEV__ && "',' or ']'");
      }
    }
    if (c === '"' || c === "'") return string();
    const n = word(NUMBER);
    if (n !== null) return Number(n);
    const w = word(NAME);
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null') return null;
    if (w !== null) i -= w.length;
    return bad(__DEV__ && (w !== null ? "a value; '" + w + "' is a name, and a string is quoted" : 'a value: an object, an array, a number, a quoted string, true, false or null'));
  }

  try {
    const v = value();
    space();
    if (i < text.length) bad(__DEV__ && 'the end of the value');
    return { value: v };
  } catch (e) {
    if (e && typeof e.at === 'number') return e;
    throw e;
  }
}

// Development: what is wrong with `text` as a literal, for a message, such as
// "at character 9, expected ':' after the key"; '' when it reads.
export function literalProblem(text) {
  if (!__DEV__) return '';
  const r = parseLiteral(text);
  return 'value' in r ? '' : 'at character ' + (r.at + 1) + ', expected ' + r.error;
}
