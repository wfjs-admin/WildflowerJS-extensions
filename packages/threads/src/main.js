/**
 * The main half: a Proxy over a plain mirror.
 *
 * Reads come from the mirror, the last snapshot the worker pushed, possibly
 * one message stale. A write updates the mirror at once and posts a SET with
 * a sequence number. A method name yields a function that posts a CALL and
 * returns a promise settled by the reply with that id. Incoming PATCHes
 * update the mirror, fire `subscribe` listeners, a `change` event on the
 * mirror's own EventTarget and a `thread:patch` document event. `snapshot`
 * is a stable plain object replaced on every change (useSyncExternalStore);
 * `settled()` resolves once every sequence number sent so far is
 * acknowledged; `isLoading` is true from creation until the first patch;
 * `error` holds the message of the last worker failure and clears on the
 * next acknowledgement, the way a query store's `error` behaves (the Error
 * itself, with name, stack and `thread`, rejects the call); `pending` counts
 * unacknowledged messages, both writes and calls.
 *
 * The mirror is updated immutably along the changed path, so `snapshot` is
 * the mirror itself and child proxies read the current value at their path
 * rather than an object that may since have been replaced.
 *
 * Nothing reactive here: a cache with notifications.
 */

import { SET, CALL, PATCH, ACK, ERROR, getPath, copyPlain } from './protocol.js';
import { CODES, warn, makeError, findUncloneable } from './diagnostics.js';
import { EVENT_PREFIX } from './names.js';

const RESERVED = ['name', 'isLoading', 'error', 'pending', 'snapshot', 'subscribe', 'settled', 'terminate',
  'addEventListener', 'removeEventListener', 'dispatchEvent'];
// Store lifecycle hooks and blocks: the worker's store runs them; they are
// not callable methods on the mirror. `tick` is the worker's own loop.
const LIFECYCLE = ['state', 'computed', 'watch', 'init', 'beforeInit', 'beforeUpdate', 'onUpdate',
  'beforeDestroy', 'destroy', 'onError', 'tick', 'workerOnly'];
const ARRAY_MUTATORS = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin'];
// Fields the runtime owns. A write to one is dropped, not sent to the worker.
const RUNTIME_OWNED = ['isLoading', 'error', 'pending', 'name', 'snapshot'];
// How long one message may go unanswered before the dev build says so
// (TH-110). Long enough that an ordinary slow method never trips it.
const WATCHDOG_MS = 5000;
// Ceiling on cached child proxies. Comfortably above any realistic state
// shape, so ordinary reads always hit the cache; only a sweep across a long
// array reaches it, which is the case that used to grow without bound.
const MAX_CHILD_PROXIES = 512;

// `spawn(handlers)` returns a transport { post(msg), terminate() } and wires
// handlers.onMessage(msg) / handlers.onError(event) to it. `meta.inline`
// says which loading route was used, for the TH-103 wording.
export function createMainSide(name, def, spawn, meta) {
  // Before anything reads off `def`. The dev validator below covers the
  // usable-but-wrong cases, but it ran after `def.computed` had already been
  // dereferenced, so `thread('x')` threw a raw TypeError from inside the
  // extension and the coded diagnostic could never fire for the case it was
  // written for. Thrown on every build, because there is no thread to create.
  if (def === null || typeof def !== 'object') {
    throw makeError(CODES.BAD_DEFINITION,
      `thread '${name}': the definition must be an object with state, computed and methods`);
  }
  // `state` is an object, as it is for a store or a component. The factory
  // form was accepted in six places, used in none, documented nowhere and
  // absent from types.d.ts, and it ran a different number of times on the dev
  // and production builds. Removed 2026-09-21. Build the definition itself
  // from a factory when each thread needs its own state, which is what every
  // definition in this repo already does, or seed it in init().
  if (typeof def.state === 'function') {
    throw makeError(CODES.BAD_DEFINITION,
      `thread '${name}': 'state' must be an object, not a function; `
      + 'return the whole definition from a factory instead, or seed the values in init()');
  }
  const computedNames = Object.keys(def.computed || {});
  const methodNames = [];
  for (const k in def) {
    if (LIFECYCLE.indexOf(k) === -1 && typeof def[k] === 'function') methodNames.push(k);
  }
  if (__DEV__) validateDefinition(name, def, computedNames, methodNames);

  // The mirror. Immutable along changed paths; `raw` is also `snapshot`.
  // `workerOnly: ['rows', 'filtered']` names state and computeds that live in
  // the worker only: reactive there (computeds track them), never
  // mirrored, so they have no field here.
  const workerOnlyNames = Array.isArray(def.workerOnly) ? def.workerOnly.slice() : [];
  let raw = copyPlain(def.state || {});
  for (let i = 0; i < workerOnlyNames.length; i++) delete raw[workerOnlyNames[i]];
  for (let i = 0; i < computedNames.length; i++) {
    if (!(computedNames[i] in raw) && workerOnlyNames.indexOf(computedNames[i]) === -1) raw[computedNames[i]] = undefined;
  }
  raw.isLoading = true;
  raw.error = null;
  raw.pending = 0;

  let lastSeq = 0;
  const unacked = new Set();
  const claims = new Map();      // path -> seq of the latest local write not yet acknowledged
  const calls = new Map();       // seq -> { resolve, reject }
  const waiters = [];            // settled(): { target, resolve, reject }
  const listeners = [];          // { path: string | null, cb }
  const events = new EventTarget();
  let stopped = null;            // the Error every further write/call gets
  let terminated = false;        // the Worker itself has been killed
  // Watchdog (dev only): a message left unanswered this long says the worker
  // is not reading its queue, which on the page looks like nothing happening.
  let watchdog = null;
  let watchdogWarned = false;
  let transport = null;

  // ---- notifications ------------------------------------------------------

  // source: 'patch' (a worker patch), 'local' (a write on this side), or
  // 'meta' (pending / error bookkeeping). Only a worker patch is a
  // `thread:patch` document event.
  function notify(changes, oldRaw, source, seq) {
    // Iterate a copy. unsubscribe() splices `listeners`, so a one-shot
    // subscriber removing itself (the natural way to write "wait for the
    // first change") shifted everything after it down one and the loop's
    // i++ skipped whichever moved into its place. A listener removed during
    // the walk still gets this notification, which is the usual and more
    // predictable of the two choices for a snapshot-style dispatch.
    const current = listeners.slice();
    for (let i = 0; i < current.length; i++) {
      const l = current[i];
      if (l.path === null) { l.cb(raw, changes); continue; }
      for (let j = 0; j < changes.length; j++) {
        if (related(l.path, changes[j].path)) {
          l.cb(getPath(raw, l.path), getPath(oldRaw, l.path), changes[j].path);
          break;
        }
      }
    }
    const detail = { name, seq, changes, source, fromWorker: source !== 'local' };
    events.dispatchEvent(new CustomEvent('change', { detail }));
    if (source === 'patch' && typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(EVENT_PREFIX + 'patch', { detail }));
    }
  }

  function applyLocal(path, value) {
    const oldRaw = raw;
    raw = assoc(raw, path.split('.'), 0, value);
    return oldRaw;
  }

  // Bookkeeping fields live in the mirror so a snapshot carries them too.
  function setField(key, value) {
    if (Object.is(raw[key], value)) return;
    const oldRaw = raw;
    raw = Object.assign({}, raw);
    raw[key] = value;
    notify([{ path: key, value }], oldRaw, 'meta', 0);
  }

  // ---- outbound -----------------------------------------------------------

  function send(msg) {
    try {
      transport.post(msg);
    } catch (e) {
      if (__DEV__ && e && e.name === 'DataCloneError') {
        const subject = msg.type === SET ? msg.value : msg.args;
        const base = msg.type === SET ? msg.path : msg.method + '(args)';
        const hit = findUncloneable(subject, base) || { path: base, type: 'unknown' };
        warn(CODES.NOT_CLONEABLE,
          `thread '${name}': the value at '${hit.path}' (${hit.type}) cannot cross to the worker`,
          'Only what structured clone can copy crosses the boundary: plain objects, arrays, primitives, typed arrays, and class instances as plain objects. Functions and DOM nodes stay on this side.');
      }
      throw e;
    }
    unacked.add(msg.seq);
    setField('pending', unacked.size);
    if (__DEV__) armWatchdog();
  }

  // Runs while anything is outstanding, re-armed on each acknowledgement, so
  // the clock measures one message's wait rather than a busy period. Warns
  // once per quiet-to-busy episode: a genuinely long method says so once, and
  // a worker that has stopped reading its queue does not fill the console.
  function armWatchdog() {
    if (watchdog !== null || stopped) return;
    watchdog = setTimeout(() => {
      watchdog = null;
      if (unacked.size === 0 || watchdogWarned || stopped) return;
      watchdogWarned = true;
      warn(CODES.WORKER_UNRESPONSIVE,
        `thread '${name}': the worker has not answered for ${Math.round(WATCHDOG_MS / 1000)} seconds, with ${unacked.size} message${unacked.size === 1 ? '' : 's'} outstanding`,
        'A method that takes this long is fine and this is the only warning you will get for it. Otherwise the worker is not reading its queue: a tick() that never returns, or a loop inside a method.');
    }, WATCHDOG_MS);
  }

  function write(path, value) {
    if (stopped) throw stopped;
    const head = path.indexOf('.') === -1 ? path : path.slice(0, path.indexOf('.'));
    if (RUNTIME_OWNED.indexOf(head) !== -1) {
      if (__DEV__) {
        warn(CODES.WRITE_TO_COMPUTED,
          `thread '${name}': '${path}' is set by the runtime; the write was dropped`,
          'isLoading, error and pending track the worker; error clears itself on the next acknowledged message.');
      }
      return;
    }
    if (computedNames.indexOf(head) !== -1 || workerOnlyNames.indexOf(head) !== -1) {
      if (__DEV__) {
        const what = computedNames.indexOf(head) !== -1 ? 'a computed' : 'worker-only state';
        warn(CODES.WRITE_TO_COMPUTED,
          `thread '${name}': '${path}' is ${what}; the worker owns it and the write was dropped`,
          what === 'a computed' ? 'Write to the state the computed reads, or call a method on the thread.' : 'Worker-only state is changed by the thread\'s own methods; call one.');
      }
      return;
    }
    value = unwrapOwn(value);
    const seq = ++lastSeq;
    send({ type: SET, seq, path, value });
    // The write owns its path until the worker acknowledges it: a patch from
    // an earlier message must not roll the mirror back over it.
    claims.set(path, seq);
    const oldRaw = applyLocal(path, value);
    notify([{ path, value }], oldRaw, 'local', seq);
  }

  // Is `path`, or a path above it, owned by a local write the worker had not
  // yet applied when it produced the patch carrying `seq`? seq 0
  // (unattributed) is treated as older than any pending write.
  function claimed(path, seq) {
    if (claims.size === 0) return false;
    let hit = false;
    claims.forEach((cseq, cpath) => {
      if ((seq === 0 || cseq > seq) && (cpath === path || path.indexOf(cpath + '.') === 0)) hit = true;
    });
    return hit;
  }

  // A change to `path` from the patch carrying `seq` replaces everything
  // under it, including paths a newer local write owns. Put those back from
  // the mirror, so the rest of the change still applies.
  function keepClaimedBelow(next, path, seq) {
    if (claims.size === 0) return next;
    claims.forEach((cseq, cpath) => {
      if ((seq === 0 || cseq > seq) && cpath.indexOf(path + '.') === 0) {
        next = assoc(next, cpath.split('.'), 0, getPath(raw, cpath));
      }
    });
    return next;
  }

  function call(method, args) {
    if (stopped) return Promise.reject(stopped);
    const seq = ++lastSeq;
    let msg;
    try {
      msg = { type: CALL, seq, id: seq, method, args: unwrapOwn(Array.prototype.slice.call(args)) };
      send(msg);
    } catch (e) {
      return Promise.reject(e);
    }
    return new Promise((resolve, reject) => { calls.set(seq, { resolve, reject }); });
  }

  // ---- inbound ------------------------------------------------------------

  function onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === PATCH) {
      const oldRaw = raw;
      const changes = msg.changes;
      let next = raw;
      const reported = [];
      for (let i = 0; i < changes.length; i++) {
        if (claimed(changes[i].path, msg.seq)) continue;
        next = assoc(next, changes[i].path.split('.'), 0, changes[i].value);
        const kept = keepClaimedBelow(next, changes[i].path, msg.seq);
        // With a claimed path restored, report the value the mirror now
        // holds, so a listener (the store) does not apply the worker's
        // older value over the local write.
        if (kept !== next) { next = kept; reported.push({ path: changes[i].path, value: getPath(next, changes[i].path) }); }
        else reported.push(changes[i]);
      }
      if (next.isLoading) { next = next === raw ? Object.assign({}, next) : next; next.isLoading = false; reported.push({ path: 'isLoading', value: false }); }
      if (reported.length === 0) return;
      raw = next;
      notify(reported, oldRaw, 'patch', msg.seq);
      return;
    }
    if (msg.type === ACK) {
      // A message the worker handled clears the last failure, so a banner
      // bound to `error` empties itself once the thread is working again.
      // Cleared here rather than in acknowledge(), which the ERROR branch
      // also calls, and which would otherwise wipe the error it just set.
      if (raw.error !== null) setField('error', null);
      acknowledge(msg.seq);
      const c = calls.get(msg.seq);
      if (c) { calls.delete(msg.seq); c.resolve(msg.result); }
      return;
    }
    if (msg.type === ERROR) {
      const err = makeError(undefined, msg.message, msg.name, msg.stack);
      err.thread = name;
      // The field holds the message, as a query store's `error` does, so the
      // two read the same way in a binding and in a comparison. The Error
      // itself, with its name, stack and `thread`, rejects the call below.
      setField('error', err.message);
      acknowledge(msg.seq);
      const c = calls.get(msg.seq);
      if (c) { calls.delete(msg.seq); c.reject(err); }
    }
  }

  function acknowledge(seq) {
    if (!seq) return;
    unacked.delete(seq);
    claims.forEach((cseq, cpath) => { if (cseq === seq) claims.delete(cpath); });
    setField('pending', unacked.size);
    if (__DEV__) {
      if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
      if (unacked.size === 0) watchdogWarned = false; else armWatchdog();
    }
    checkWaiters();
  }

  function checkWaiters() {
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (!anyUnackedUpTo(waiters[i].target)) { const w = waiters.splice(i, 1)[0]; w.resolve(); }
    }
  }

  function anyUnackedUpTo(target) {
    let hit = false;
    unacked.forEach((s) => { if (s <= target) hit = true; });
    return hit;
  }

  // The worker's `error` event: a script that failed to load (the isomorphic
  // URL unreachable, or the Blob route refused by CSP), or an uncaught error
  // thrown outside any message.
  function onError(ev) {
    const detail = (ev && ev.message) ? ': ' + ev.message : '';
    const failedToStart = raw.isLoading;
    const err = makeError(CODES.WORKER_FAILED,
      `thread '${name}': ` + (failedToStart ? 'the worker failed to start' : 'uncaught error in the worker') + detail,
      'Error');
    err.thread = name;
    // The message, as above. `stop(err)` below still rejects every waiting
    // call and every settled() with the Error itself.
    setField('error', err.message);
    if (!failedToStart) {
      if (__DEV__) warn(CODES.WORKER_FAILED, err.message, 'The worker is still running; see the worker stack in the console.');
      return;
    }
    if (__DEV__) {
      warn(CODES.WORKER_FAILED, err.message, meta && meta.inline
        ? 'The inline (Blob) route needs a Content-Security-Policy whose worker-src allows blob:. Under a stricter policy use the default form: load the definition file by URL and the extension spawns itself.'
        : meta && meta.crossOrigin
          ? 'The extension is on another origin, so the worker starts from a blob: URL that loads it, which needs a Content-Security-Policy whose worker-src allows blob:. Under a stricter policy, serve the extension file from this page\'s own origin.'
          : 'Check that the extension and definition URLs are reachable from this page and that worker-src allows same-origin workers.');
    }
    stop(err);
  }

  // ---- lifecycle ----------------------------------------------------------

  function stop(err) {
    if (stopped) return;
    stopped = err;
    if (watchdog !== null) { clearTimeout(watchdog); watchdog = null; }
    calls.forEach((c) => c.reject(err));
    calls.clear();
    while (waiters.length) waiters.pop().reject(err);
    unacked.clear();
    // The child proxies outlived the thread otherwise: each closes over this
    // scope, so a terminated thread's cache held the mirror alive with it.
    // A later read still works, it just builds a fresh proxy.
    children.clear();
    setField('pending', 0);
  }

  function terminate() {
    // Killing the thread and settling the promises are two separate jobs, and
    // `stopped` only tracks the second. A worker that failed to start has
    // already been through stop(), so guarding the whole function on
    // `stopped` left its Worker running for the life of the page while
    // destroy() and unregister() reported success. The load matters: if the
    // framework file loaded and only the definition failed, that worker is
    // holding a whole copy of the framework.
    if (!terminated) {
      terminated = true;
      transport.terminate();
    }
    if (stopped) return;
    const err = makeError(CODES.CANCELLED, `thread '${name}' was terminated`, 'AbortError');
    stop(err);
  }

  function settled() {
    const target = lastSeq;
    if (stopped) return Promise.reject(stopped);
    if (!anyUnackedUpTo(target)) return Promise.resolve();
    return new Promise((resolve, reject) => { waiters.push({ target, resolve, reject }); });
  }

  function subscribe(pathOrCb, cb) {
    const entry = typeof pathOrCb === 'function' ? { path: null, cb: pathOrCb } : { path: String(pathOrCb), cb };
    listeners.push(entry);
    return function unsubscribe() {
      const i = listeners.indexOf(entry);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  // ---- proxies ------------------------------------------------------------

  const proxyPaths = new WeakMap();  // own child proxy -> its path
  const children = new Map();        // path -> { proxy, isArray }

  // `seen` stops a cycle. Without it a plain `a.self = a` handed to a write
  // recursed until the stack overflowed, and because this runs before the
  // post, the RangeError arrived in place of any useful diagnostic.
  function unwrapOwn(v, seen) {
    if (v === null || typeof v !== 'object') return v;
    const p = proxyPaths.get(v);
    if (p !== undefined) return getPath(raw, p);
    const isArr = Array.isArray(v);
    if (!isArr) {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) return v;
    }
    seen = seen || new Set();
    if (seen.has(v)) return v;   // already on this path: leave it as it is
    seen.add(v);
    if (isArr) {
      let out = null;
      for (let i = 0; i < v.length; i++) {
        const u = unwrapOwn(v[i], seen);
        if (u !== v[i]) { if (out === null) out = v.slice(); out[i] = u; }
      }
      return out === null ? v : out;
    }
    let out = null;
    for (const k in v) {
      if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
      const u = unwrapOwn(v[k], seen);
      if (u !== v[k]) { if (out === null) out = Object.assign({}, v); out[k] = u; }
    }
    return out === null ? v : out;
  }

  function wrapValue(v, path) {
    if (v === null || typeof v !== 'object') return v;
    const isArray = Array.isArray(v);
    if (!isArray && Object.getPrototypeOf(v) !== Object.prototype) return v;
    const cached = children.get(path);
    if (cached && cached.isArray === isArray) return cached.proxy;
    // The cache is keyed by path, so an object's shape bounds it but an
    // array's length does not: reading `rows[i]` across a long array cached
    // one proxy per index ever touched, each closing over this whole scope,
    // and nothing removed them. Cleared wholesale past a cap rather than
    // evicted one at a time: the entries are equally cheap to rebuild on the
    // next read, and a sweep over a long array would defeat any LRU anyway.
    if (children.size >= MAX_CHILD_PROXIES) children.clear();
    const proxy = new Proxy(isArray ? [] : {}, childHandler(path));
    children.set(path, { proxy, isArray });
    proxyPaths.set(proxy, path);
    return proxy;
  }

  function childHandler(path) {
    const current = () => getPath(raw, path);
    return {
      get(_t, key) {
        const cur = current();
        if (cur === null || cur === undefined) return undefined;
        if (typeof key === 'symbol') return cur[key];
        if (Array.isArray(cur) && ARRAY_MUTATORS.indexOf(key) !== -1) {
          return function () {
            const copy = cur.slice();
            const result = Array.prototype[key].apply(copy, arguments);
            write(path, copy);
            return result;
          };
        }
        const v = cur[key];
        if (typeof v === 'function') return v;
        return wrapValue(v, path + '.' + key);
      },
      set(_t, key, value) { write(path + '.' + String(key), value); return true; },
      deleteProperty(_t, key) { write(path + '.' + String(key), undefined); return true; },
      has(_t, key) { const cur = current(); return cur != null && key in cur; },
      ownKeys(t) { const cur = current(); return cur == null ? Reflect.ownKeys(t) : Reflect.ownKeys(cur); },
      getOwnPropertyDescriptor(_t, key) {
        const cur = current();
        if (cur == null) return undefined;
        const d = Object.getOwnPropertyDescriptor(cur, key);
        if (d && !Array.isArray(cur)) d.configurable = true;
        return d;
      },
    };
  }

  const callers = {};
  for (let i = 0; i < methodNames.length; i++) {
    const m = methodNames[i];
    callers[m] = function () { return call(m, arguments); };
  }
  const bound = {
    subscribe,
    settled,
    terminate,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };

  const root = new Proxy({}, {
    get(_t, key) {
      if (typeof key !== 'string') return undefined;
      if (key === 'name') return name;
      if (key === 'snapshot') return raw;
      if (bound[key]) return bound[key];
      if (callers[key]) return callers[key];
      return wrapValue(raw[key], key);
    },
    set(_t, key, value) {
      if (typeof key !== 'string') return false;
      write(key, value);
      return true;
    },
    has(_t, key) { return key in raw || !!callers[key] || !!bound[key] || key === 'name'; },
    ownKeys() { return Reflect.ownKeys(raw); },
    getOwnPropertyDescriptor(_t, key) {
      const d = Object.getOwnPropertyDescriptor(raw, key);
      if (d) d.configurable = true;
      return d;
    },
  });

  transport = spawn({ onMessage, onError });
  return root;
}

// Immutable update along a dot path: copies each container on the way down
// and leaves every other branch shared with the previous mirror.
function assoc(root, parts, i, value) {
  if (i === parts.length) return value;
  const key = parts[i];
  const container = (root !== null && typeof root === 'object') ? root : {};
  // Spread defines keys, so an own `__proto__` key stays a key; Object.assign
  // and `copy[key] =` would run the prototype setter (as copyPlain explains).
  const copy = Array.isArray(container) ? container.slice() : { ...container };
  const v = assoc(container[key], parts, i + 1, value);
  if (key === '__proto__') Object.defineProperty(copy, key, { value: v, enumerable: true, writable: true, configurable: true });
  else copy[key] = v;
  return copy;
}

function related(sub, changed) {
  return sub === changed || changed.indexOf(sub + '.') === 0 || sub.indexOf(changed + '.') === 0;
}

function validateDefinition(name, def, computedNames, methodNames) {
  if (!def || typeof def !== 'object') {
    warn(CODES.BAD_DEFINITION, `thread '${name}': the definition must be an object with state, computed and methods`);
    return;
  }
  if (def.methods && typeof def.methods === 'object') {
    warn(CODES.BAD_DEFINITION, `thread '${name}': a 'methods:' block is not part of the shape; the functions inside it are not callable`,
      'Declare methods at the top level of the definition, beside state and computed, as a store does.');
  }
  if (def.watch !== undefined) {
    warn(CODES.BAD_DEFINITION, `thread '${name}': a 'watch' block is not part of the shape; a store has no watchers, so it never runs`,
      "Watch the thread from the page: thread.subscribe(path, cb), or in the framework form a component's watch: { 'store:" + name + ".field': ... }.");
  }
  if (def.workerOnly !== undefined) {
    const known = Object.keys(def.state || {}).concat(computedNames);
    if (!Array.isArray(def.workerOnly)) {
      warn(CODES.BAD_DEFINITION, `thread '${name}': 'workerOnly' must be an array of state or computed names`);
    } else {
      for (let i = 0; i < def.workerOnly.length; i++) {
        if (known.indexOf(def.workerOnly[i]) === -1) {
          warn(CODES.BAD_DEFINITION, `thread '${name}': workerOnly name '${def.workerOnly[i]}' is not a state key or a computed`,
            'Declare it in state or computed; workerOnly only says it stays in the worker.');
        }
      }
    }
  }
  const keys = Object.keys(def.state || {}).concat(computedNames, methodNames);
  for (let i = 0; i < keys.length; i++) {
    if (RESERVED.indexOf(keys[i]) !== -1) {
      warn(CODES.BAD_DEFINITION, `thread '${name}': '${keys[i]}' is part of the mirror's own surface and cannot be a state, computed or method name`,
        'Reserved: ' + RESERVED.join(', ') + '.');
    }
  }
}
