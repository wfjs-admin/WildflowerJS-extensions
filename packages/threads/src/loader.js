/**
 * Loading: how the worker gets the framework and the definition.
 *
 * The worker loads two files. First the framework's own tier file, the one
 * the page loaded (found among document.scripts, or named by { core }),
 * which evaluates headless in a worker and gives `self.wildflower`. Then the
 * definition.
 *
 * Default, the isomorphic form: the extension file is its own
 * worker entry. On the page it finds itself through document.currentScript
 * and spawns `new Worker(ownUrl + '?core=&def=&name=')`. As the worker, the
 * same file reads those values, importScripts the framework and then the
 * definition, and the definition's own `thread(name, def)` call, now on the
 * worker side, registers the store. No Blob, no serialised source, nothing
 * a `script-src 'self'; worker-src 'self'` policy objects to.
 *
 * Escape hatch, behind `{ inline: true }`: the definition is serialised
 * through Function.prototype.toString into a Blob bootstrap that sets the
 * inline global and importScripts the extension. Refused wherever worker-src
 * lacks blob:, which surfaces as a Worker `error` event; the main
 * half names the directive in TH-103.
 */

import { INLINE_GLOBAL, BOOT_GLOBAL, QUERY_DEF, QUERY_NAME, QUERY_CORE, FRAMEWORK_SCRIPT_RE } from './names.js';
import { CODES, makeError } from './diagnostics.js';
import { isPlainLike } from './protocol.js';

// The extension's own URL, query stripped, captured while its script runs.
export function findOwnUrl() {
  if (typeof document === 'undefined') return null;
  const cs = document.currentScript;
  if (!cs || !cs.src) return null;
  const u = new URL(cs.src, document.baseURI);
  u.search = '';
  u.hash = '';
  return u.href;
}

// The URL of the script currently executing, when `thread()` is called from
// a definition file's top level: that file's own element.
export function currentScriptUrl() {
  if (typeof document === 'undefined') return null;
  const cs = document.currentScript;
  return cs && cs.src ? cs.src : null;
}

// The framework's script-tag file on this page, so the worker loads the same
// tier and version from cache. The first <script src> whose name matches
// wildflower[.tier][.dev|.min].js; null when the page has none (a module
// import, a bundler), in which case { core } must name a classic build.
export function findFrameworkUrl() {
  if (typeof document === 'undefined') return null;
  const scripts = document.scripts;
  for (let i = 0; i < scripts.length; i++) {
    const src = scripts[i].src;
    if (src && FRAMEWORK_SCRIPT_RE.test(src)) return src;
  }
  return null;
}

// A browser refuses a worker script from another origin, which is where the
// extension sits when it is loaded from a CDN.
export function isCrossOrigin(url) {
  return typeof location !== 'undefined' && new URL(url).origin !== location.origin;
}

export function spawnIsomorphic(ownUrl, coreUrl, defUrl, name) {
  // From another origin: a same-origin blob: worker that loads the extension.
  // importScripts may cross origins where `new Worker` may not. The worker
  // side reads the boot values from the global the bootstrap sets.
  if (isCrossOrigin(ownUrl)) {
    const boot = { name, core: coreUrl, def: defUrl };
    return spawnFromSource('self.' + BOOT_GLOBAL + ' = ' + JSON.stringify(boot) + ';\n'
      + 'importScripts(' + JSON.stringify(ownUrl) + ');\n');
  }
  const u = new URL(ownUrl);
  u.searchParams.set(QUERY_CORE, coreUrl);
  u.searchParams.set(QUERY_DEF, defUrl);
  u.searchParams.set(QUERY_NAME, name);
  return new Worker(u.href);
}

export function spawnInline(ownUrl, coreUrl, name, def) {
  return spawnFromSource('self.' + INLINE_GLOBAL + ' = ' + serialiseDefinition(name, def, coreUrl) + ';\n'
    + 'importScripts(' + JSON.stringify(ownUrl) + ');\n');
}

// A worker started from a blob: URL holding `source`. Needs a worker-src
// that allows blob:.
function spawnFromSource(source) {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const worker = new Worker(url);
  // The bootstrap is fetched once; release the object URL after the worker
  // has had time to read it (revoking synchronously races the fetch).
  const release = () => { try { URL.revokeObjectURL(url); } catch (_) { /* already released */ } };
  worker.addEventListener('message', release, { once: true });
  worker.addEventListener('error', release, { once: true });
  return worker;
}

// The worker side's view of how it was started.
export function workerBootInfo() {
  const inline = self[INLINE_GLOBAL];
  if (inline) return { inline: true, name: inline.name, def: inline.def, defUrl: null, coreUrl: inline.core };
  const boot = self[BOOT_GLOBAL];
  if (boot) return { inline: false, name: boot.name, def: null, defUrl: boot.def, coreUrl: boot.core };
  const sp = new URL(self.location.href).searchParams;
  return { inline: false, name: sp.get(QUERY_NAME), def: null, defUrl: sp.get(QUERY_DEF), coreUrl: sp.get(QUERY_CORE) };
}

// `{ name, core, def }` as JavaScript source. State by JSON; every function by
// its own source text, kept in the method-definition form when that is how it
// was written (`search(q) { ... }` is only valid inside an object literal).
function serialiseDefinition(name, def, coreUrl) {
  const parts = [];
  parts.push('state: ' + valueSource(def.state === undefined ? {} : def.state, 'state', new Set()));
  const computed = def.computed || {};
  const cparts = [];
  for (const k in computed) if (typeof computed[k] === 'function') cparts.push(fnEntry(k, computed[k]));
  parts.push('computed: {' + cparts.join(',\n') + '}');
  if (Array.isArray(def.workerOnly)) parts.push('workerOnly: ' + JSON.stringify(def.workerOnly));
  for (const k in def) {
    if (k === 'state' || k === 'computed' || typeof def[k] !== 'function') continue;
    parts.push(fnEntry(k, def[k]));
  }
  return '{ name: ' + JSON.stringify(name) + ', core: ' + JSON.stringify(coreUrl) + ', def: {\n' + parts.join(',\n') + '\n} }';
}

// Initial state as JavaScript source.
//
// This used to be JSON.stringify, which quietly disagreed with the page: the
// mirror is seeded with copyPlain, which keeps a Date a Date, so the two sides
// started out holding different values with no diagnostic on either. JSON
// drops `undefined` keys, turns Date into a string, Map and Set into `{}`,
// typed arrays into index objects, and NaN and Infinity into null.
//
// What is emitted here is what structured clone would have carried, since that
// is the contract the boundary advertises everywhere else.
const TYPED_ARRAYS = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'];

function valueSource(v, path, seen) {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  const t = typeof v;
  if (t === 'number') {
    if (Number.isNaN(v)) return 'NaN';
    if (v === Infinity) return 'Infinity';
    if (v === -Infinity) return '-Infinity';
    if (Object.is(v, -0)) return '-0';
    return String(v);
  }
  if (t === 'string' || t === 'boolean') return JSON.stringify(v);
  if (t === 'bigint') return String(v) + 'n';
  if (t === 'function' || t === 'symbol') {
    throw makeError(CODES.BAD_DEFINITION,
      "state at '" + path + "' is a " + t + ", which cannot cross to the worker");
  }
  // A cycle or a value used twice needs a name to refer back to, which this
  // emitter has no way to introduce. JSON.stringify threw outright on a cycle
  // and silently duplicated a shared reference; both now say so.
  if (seen.has(v)) {
    throw makeError(CODES.BAD_DEFINITION,
      "state at '" + path + "' is part of a cycle, or is the same object as another field; "
      + 'the inline route writes state as source and cannot express that. Load the definition '
      + 'by URL instead, or build the shared value in init().');
  }
  seen.add(v);
  try {
    if (v instanceof Date) return 'new Date(' + v.getTime() + ')';
    if (v instanceof RegExp) return String(v);
    if (v instanceof Map) {
      const entries = [];
      v.forEach((val, k) => entries.push('[' + valueSource(k, path + '<key>', seen) + ', ' + valueSource(val, path + '<value>', seen) + ']'));
      return 'new Map([' + entries.join(', ') + '])';
    }
    if (v instanceof Set) {
      const items = [];
      v.forEach((val) => items.push(valueSource(val, path + '<item>', seen)));
      return 'new Set([' + items.join(', ') + '])';
    }
    if (v instanceof ArrayBuffer) return 'new Uint8Array([' + Array.from(new Uint8Array(v)).join(', ') + ']).buffer';
    const ctor = v.constructor && v.constructor.name;
    if (TYPED_ARRAYS.indexOf(ctor) !== -1) {
      const nums = Array.prototype.map.call(v, (n) => (typeof n === 'bigint' ? String(n) + 'n' : String(n)));
      return 'new ' + ctor + '([' + nums.join(', ') + '])';
    }
    if (Array.isArray(v)) {
      const items = [];
      for (let i = 0; i < v.length; i++) items.push(valueSource(v[i], path + '.' + i, seen));
      return '[' + items.join(', ') + ']';
    }
    // A class instance is written as a plain object, as structured clone
    // carries it. Anything else left here reports its own type (a URL, a
    // Blob, an Error) and has no source form this emitter can write.
    if (!isPlainLike(v)) {
      throw makeError(CODES.BAD_DEFINITION,
        "state at '" + path + "' is a " + (ctor || 'value') + ", which the inline route cannot write as source; "
        + 'load the definition by URL instead, or build the value in init().');
    }
    const entries = [];
    for (const k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      // Computed-key form: `"__proto__": v` in a literal sets the prototype,
      // `["__proto__"]: v` defines the key, as JSON.parse does.
      entries.push('[' + JSON.stringify(k) + ']: ' + valueSource(v[k], path + '.' + k, seen));
    }
    return '{' + entries.join(', ') + '}';
  } finally {
    seen.delete(v);
  }
}

const EXPRESSION_FORM = /^(async\s+)?(function\b|\(|[A-Za-z_$][\w$]*\s*=>)/;

// Method form: `name(args) {}`, `async name() {}`, `*name() {}`, and the two
// combined. Captures the modifiers so the name can be replaced.
const METHOD_FORM = /^(async\s+)?(\*\s*)?([A-Za-z_$][\w$]*)\s*\(/;

const NATIVE_CODE = /\{\s*\[native code\]\s*\}\s*$/;

function fnEntry(key, fn) {
  const src = Function.prototype.toString.call(fn);
  // A bound or built-in function has no source to send: its text is
  // `function () { [native code] }`, which the worker cannot parse.
  if (NATIVE_CODE.test(src)) {
    throw makeError(CODES.BAD_DEFINITION,
      "the function under '" + key + "' is bound or built in, so the inline route has no source to send; "
      + 'write it out in the definition, or load the definition by URL');
  }
  if (EXPRESSION_FORM.test(src)) return JSON.stringify(key) + ': ' + src;
  // A method-form function's source carries its own name, which is not
  // necessarily the key it now sits under: `{ search: helpers.find }` gave
  // `find(q) {}`, so the worker's store had `find` and no `search`, and the
  // first call rejected pointing nowhere near here. Any definition assembled
  // by renaming or spreading hits this.
  const m = METHOD_FORM.exec(src);
  if (m && m[3] === key) return src;
  if (m) {
    // Rewrite as a function expression under the right key, keeping `async`
    // and the generator star. src.slice from the '(' keeps the parameter
    // list and body exactly as written.
    const rest = src.slice(m[0].length - 1);
    return JSON.stringify(key) + ': ' + (m[1] || '') + 'function' + (m[2] ? '*' : '') + rest;
  }
  // Something this does not parse: a computed name, or a shape not covered
  // above. Emitting it verbatim would register it under whatever name the
  // source carries, silently. TH-105 is the definition-not-usable code.
  throw makeError(CODES.BAD_DEFINITION,
    "the function under '" + key + "' cannot be serialised for the inline route; "
    + 'give it a plain name or write it as `' + key + ': function (...) { ... }`');
}
