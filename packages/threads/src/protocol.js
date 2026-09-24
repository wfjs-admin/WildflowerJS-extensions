/**
 * The message protocol between the two halves. Internal, and never seen by an
 * author, which is why it can be its own shape rather than borrowing one.
 *
 * main -> worker
 *   { type: SET,  seq, path, value }          one write, dot path from the root
 *   { type: CALL, seq, id, method, args }     one method call; id === seq
 *
 * worker -> main
 *   { type: PATCH, seq, changes: [{ path, value }] }
 *       everything that changed while handling message `seq`: state leaf
 *       paths written by a method, and every computed that re-evaluated to a
 *       new value. seq 0 = not attributable to one message (the initial
 *       snapshot, or writes made after an `await` inside a method).
 *   { type: ACK, seq, id?, result? }          message `seq` fully applied
 *   { type: ERROR, seq, id?, name, message, stack }
 *       message `seq` failed; for a CALL the promise with that id rejects
 *
 * Both halves are built into the same file, so these names are consistent
 * per build whatever the mangler does to them.
 */

export const SET = 'set';
export const CALL = 'call';
export const PATCH = 'patch';
export const ACK = 'ack';
export const ERROR = 'error';

// Dot-path helpers shared by both halves. Paths are the reactive tree's own
// spelling: `params.query`, `rows.3.name`, `rows.length`.
export function getPath(root, path) {
  if (!path) return root;
  const parts = path.split('.');
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

export function setPath(root, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  let cur = root;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (cur[p] === null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  const old = cur[last];
  cur[last] = value;
  return old;
}

// Data structured clone copies field by field: an array, or anything whose type
// tag is [object Object], which covers plain objects and class instances,
// proxied or not. Anything reporting its own tag (Date, Map, Set, typed arrays,
// platform objects) is structured clone's to carry and is left as it is.
export function isPlainLike(v) {
  if (Array.isArray(v)) return true;
  const proto = Object.getPrototypeOf(v);
  if (proto === Object.prototype || proto === null) return true;
  return Object.prototype.toString.call(v) === '[object Object]';
}

// Deep copy of plain-like data into plain objects and arrays, leaving anything
// else by reference. Used to seed and snapshot the mirror, and before every
// post. A class instance comes out as a plain object, prototype dropped, which
// is what structured clone would make of it; it also has to, because the
// framework holds one behind a reactive proxy, and a proxy cannot be cloned.
// `seen` maps each original to its copy, so a cycle terminates and a value
// referenced twice stays one object in the copy. structured clone does both,
// and this is the copy that stands in for it on either side of the boundary,
// so behaving differently would make a value that crosses fine unusable
// before it got there: a plain `a.self = a` overflowed the stack here long
// before postMessage ever saw it.
export function copyPlain(v, seen) {
  if (v === null || typeof v !== 'object') return v;
  if (!isPlainLike(v)) return v;
  const isArr = Array.isArray(v);
  seen = seen || new Map();
  const already = seen.get(v);
  if (already !== undefined) return already;
  if (isArr) {
    const out = new Array(v.length);
    seen.set(v, out);
    for (let i = 0; i < v.length; i++) out[i] = copyPlain(v[i], seen);
    return out;
  }
  const out = {};
  seen.set(v, out);
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    const c = copyPlain(v[k], seen);
    // `out[k] = c` would call the __proto__ setter; define the own key instead.
    if (k === '__proto__') Object.defineProperty(out, k, { value: c, enumerable: true, writable: true, configurable: true });
    else out[k] = c;
  }
  return out;
}
