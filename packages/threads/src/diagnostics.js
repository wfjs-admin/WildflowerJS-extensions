/**
 * Coded diagnostics for the thread extension. Own prefix (TH), own ledger.
 *
 * Codes allocated in this phase:
 *   TH-101  a value cannot cross the boundary (DataCloneError), with the path
 *           and the type of the offending value
 *   TH-102  a main-thread write to a field the worker or the runtime owns: a
 *           computed, worker-only state, or isLoading / error / pending
 *   TH-103  the worker failed to start; names `worker-src` for the Blob route
 *   TH-104  cancelled: the thread was terminated with calls in flight (the
 *           `code` carried by the rejection)
 *   TH-105  the definition is not usable: no state, a `methods:` block, or a
 *           state or computed key that collides with the mirror's own surface
 *   TH-106  the extension cannot find its own URL (loaded without a classic
 *           `<script src>`), so it cannot spawn itself
 *   TH-107  no framework script to load in the worker: none among
 *           document.scripts and no { core } option
 *   TH-108  the .wf.js file loaded on a page with no framework instance
 *           (the framework script must come first)
 *   TH-109  a workerOnly array was mutated in place in the worker;
 *           worker-only state is reactive by identity, so it must be replaced
 *   TH-110  the worker has not acknowledged a message for several seconds:
 *           a long method, or a tick loop starving the message handler
 *   TH-111  the name is already a registered store, so no thread was created
 *           and the existing store was returned; unregister it first to
 *           replace it
 *
 * Warnings are emitted through console.warn on both sides of the boundary so
 * they survive the production build's console.log stripping. The `dev`
 * argument decides whether the long form (message plus suggestion) or the
 * compact form (code only) is printed; callers pass the folded `__DEV__`.
 */

import { DIAG_PREFIX } from './names.js';

export const CODES = {
  NOT_CLONEABLE: DIAG_PREFIX + '-101',
  WRITE_TO_COMPUTED: DIAG_PREFIX + '-102',
  WORKER_FAILED: DIAG_PREFIX + '-103',
  CANCELLED: DIAG_PREFIX + '-104',
  BAD_DEFINITION: DIAG_PREFIX + '-105',
  NO_OWN_URL: DIAG_PREFIX + '-106',
  NO_CORE: DIAG_PREFIX + '-107',
  NO_FRAMEWORK: DIAG_PREFIX + '-108',
  WORKER_ONLY_MUTATED: DIAG_PREFIX + '-109',
  WORKER_UNRESPONSIVE: DIAG_PREFIX + '-110',
  NAME_TAKEN: DIAG_PREFIX + '-111',
};

export function warn(code, message, suggestion) {
  console.warn('[' + DIAG_PREFIX + ' ' + code + '] ' + message);
  if (suggestion) console.warn('  ↳ Suggestion: ' + suggestion);
}

// A real Error with a name `catch` blocks can test and a `code` the reference
// page lists. `name` defaults to the platform's own AbortError for
// cancellation so `err.name === 'AbortError'` reads as it does for fetch.
export function makeError(code, message, name, stack) {
  const err = new Error(message);
  err.code = code;
  if (name) err.name = name;
  if (stack) err.stack = stack;
  return err;
}

// Locate the first value under `value` that structured clone refuses, for the
// TH-101 warning: returns { path, type } or null when everything clones.
// Dev-only helper; the caller already knows the clone failed.
// `seen` guards the walk against cycles. structuredClone handles a cycle
// fine, so the try below does not throw for the cycle itself and the recursion
// has nothing to stop it: a.self.self.self... until the stack overflows. That
// matters because this runs inside send()'s catch, so the RangeError replaced
// the DataCloneError and the TH-101 path the author actually needed.
export function findUncloneable(value, path, seen) {
  if (typeof structuredClone !== 'function') return { path, type: typeof value };
  try {
    structuredClone(value);
    return null;
  } catch (_) {
    if (value !== null && typeof value === 'object' && !isPlatformObject(value)) {
      seen = seen || new Set();
      if (seen.has(value)) return null;   // already on this path; not the culprit
      seen.add(value);
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        const hit = findUncloneable(value[keys[i]], path ? path + '.' + keys[i] : keys[i], seen);
        if (hit) return hit;
      }
    }
    return { path, type: describeType(value) };
  }
}

function isPlatformObject(v) {
  return (typeof Node !== 'undefined' && v instanceof Node)
    || (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(v));
}

export function describeType(v) {
  if (v === null) return 'null';
  if (typeof v !== 'object') return typeof v;
  if (typeof Node !== 'undefined' && v instanceof Node) return 'DOM node (' + v.nodeName + ')';
  const proto = Object.getPrototypeOf(v);
  if (proto === null || proto === Object.prototype || Array.isArray(v)) return Array.isArray(v) ? 'array' : 'object';
  return (proto.constructor && proto.constructor.name) ? 'instance of ' + proto.constructor.name : 'object';
}
