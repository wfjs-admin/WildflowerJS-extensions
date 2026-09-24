/**
 * The worker half: a WildflowerJS store, in a worker, through public API.
 *
 * The worker loads the framework's own tier file (the one the page loaded,
 * headless: no document, no scan) and `startWorkerSide(name, def, post, wf)`
 * registers the definition with `wf.store(name, def)`. The store IS the
 * entity: state, computeds, methods with `this` bound the way every store
 * binds them, lifecycle hooks included. One `store.subscribe('', cb)` is the
 * change feed: every state leaf path the tree reports, and every
 * `computed:NAME` pulse (the notifier the framework installs for a
 * subscribe-all, fired on a real value change).
 *
 * Each incoming message is applied inside `wf.batch()`, which drains the
 * graph synchronously at its end, so the computeds that re-evaluated are
 * known before the message's single PATCH and its ACK (or ERROR) go out.
 * Writes a method makes after an `await` ride an unattributed patch (seq 0)
 * from a microtask.
 *
 * Nothing here reads a framework internal, so the worker half runs against
 * any tier, dev or min, and the file's own build has nothing to mangle.
 */

import { SET, CALL, PATCH, ACK, ERROR, getPath, copyPlain, isPlainLike } from './protocol.js';
import { CODES, warn, findUncloneable } from './diagnostics.js';

const COMPUTED_PULSE = 'computed:';
// How many times emit() will drop one uncloneable change and retry the rest.
// Bounded so a pathological batch cannot spin.
const MAX_POST_ATTEMPTS = 8;
// A throwing tick(): how many failures are reported, and how many consecutive
// ones end the loop. Reporting every frame floods; reporting none hides it.
const TICK_ERRORS_REPORTED = 3;
const TICK_ERRORS_BEFORE_STOP = 5;

// Structural equality over the data that crosses the boundary, by the rule
// copyPlain copies with. Used once, to tell whether the definition's init()
// changed a mirrored key. Plain-like values (including class instances, which
// the snapshot holds as plain copies) compare field by field; anything else (a
// Date, a typed array) compares by identity.
function samePlain(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a !== a && b !== b;
  const aArr = Array.isArray(a);
  if (aArr !== Array.isArray(b)) return false;
  if (aArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!samePlain(a[i], b[i])) return false;
    return true;
  }
  if (!isPlainLike(a) || !isPlainLike(b)) return false;   // not plain: identity, already checked
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
    if (!samePlain(a[ka[i]], b[ka[i]])) return false;
  }
  return true;
}

// The tick loop's period. setTimeout, not requestAnimationFrame: rAF exists
// in a worker on both browsers but is throttled with the tab hidden, and a
// simulation that stops when the tab is hidden is not what "off the main
// thread" promises.
const TICK_MS = 16;

export function startWorkerSide(name, def, post, wf) {
  // `tick(dt)` is run here on the worker's own timer. It is kept out of the
  // store definition: on a tier with pools the framework would register a
  // store's tick into its rAF frame loop, and on a tier without them it
  // would warn that tick never runs.
  const storeDef = Object.assign({}, def);
  delete storeDef.tick;
  // `workerOnly: ['rows', 'filtered']`: state and computeds that never cross.
  // State stays in the store's reactive state here, so computeds track it
  // as usual; a worker-only computed is evaluated here and read by the
  // others. Their paths and pulses are filtered out of every patch, and the
  // main side has no field for them.
  delete storeDef.workerOnly;
  const workerOnlyKeys = Array.isArray(def.workerOnly) ? def.workerOnly : [];
  // A worker-only STATE key is reactive by identity only: the value is held
  // raw and handed to computeds and methods without the tree's per-element
  // proxies and tracking; a hidden reactive counter, bumped on assignment,
  // is the one dependency. Reads go through a computed of the same name,
  // because inside a nested computed evaluation `this` is a wrapper that
  // resolves state, computeds and methods only (an accessor defined on the
  // context is invisible there). Writes go through an
  // accessor on the context, which the set trap reaches before its
  // computed-write block. Replace to change; an in-place mutation is not
  // seen (dev warns TH-109).
  const VERSION_PREFIX = 'workerOnly$';
  // Both take the context as `ctx` rather than closing over the store
  // variable: the framework evaluates computeds eagerly inside
  // wildflower.store(), before that variable is assigned, and a computed
  // that threw then stays cached as an error.
  const cells = {};
  function readWorkerOnly(key, ctx) {
    const cell = cells[key];
    void ctx[VERSION_PREFIX + key];
    if (__DEV__ && !cell.warned && Array.isArray(cell.raw) && cell.raw.length !== cell.lengthAtSet) {
      cell.warned = true;
      warn(CODES.WORKER_ONLY_MUTATED,
        `thread '${name}': worker-only '${key}' was changed in place; worker-only state is reactive by identity, so nothing recomputed`,
        `Replace it: this.${key} = this.${key}.concat(row), or a new array from a filter or a map.`);
    }
    return cell.raw;
  }
  function writeWorkerOnly(key, v, ctx) {
    const cell = cells[key];
    cell.raw = v;
    cell.lengthAtSet = Array.isArray(v) ? v.length : -1;
    ctx[VERSION_PREFIX + key] = ctx[VERSION_PREFIX + key] + 1;
  }
  // Underscore-prefixed state keys are the framework's non-reactive
  // instance fields (the context proxy routes them to the raw entity, not
  // the state tree). Here they are the per-frame output channel: kept out of
  // the store's reactive state, seeded on the instance, and shipped whole
  // whenever their identity changes after a message or a tick. Pool-shaped:
  // no per-element reactivity on either side.
  const initialState = def.state || {};
  const rawKeys = [];
  const reactiveState = {};
  const workerOnlyState = [];
  storeDef.computed = Object.assign({}, def.computed || {});
  for (const k in initialState) {
    if (k.charCodeAt(0) === 95) rawKeys.push(k);
    else if (workerOnlyKeys.indexOf(k) !== -1) {
      workerOnlyState.push(k);
      reactiveState[VERSION_PREFIX + k] = 0;
      const v = copyPlain(initialState[k]);
      cells[k] = { raw: v, lengthAtSet: Array.isArray(v) ? v.length : -1, warned: false };
      storeDef.computed[k] = function () { return readWorkerOnly(k, this); };
    } else reactiveState[k] = initialState[k];
  }
  storeDef.state = reactiveState;

  // The state keys the page mirrors: everything that is neither worker-only
  // nor a raw underscore field.
  const mirroredKeys = [];
  for (const k in initialState) {
    if (k.charCodeAt(0) !== 95 && workerOnlyKeys.indexOf(k) === -1) mirroredKeys.push(k);
  }
  // Keys the definition's own init() changed. The store runs init inside
  // wf.store(), which is before the change subscription below exists, so
  // those writes are recorded here or not at all.
  const initTouched = [];

  {
    // The write accessors go on from the store's init hook, so they exist
    // before the definition's own init (which may assign a worker-only key)
    // and before any method runs. Without one, the context's set trap would
    // refuse the assignment as a write to a computed.
    const userInit = def.init;
    storeDef.init = function () {
      for (let i = 0; i < workerOnlyState.length; i++) {
        const k = workerOnlyState[i];
        Object.defineProperty(this, k, {
          configurable: true, enumerable: true,
          get() { return readWorkerOnly(k, this); },
          set(v) { writeWorkerOnly(k, v, this); },
        });
      }
      if (typeof userInit !== 'function') return undefined;
      // Snapshot before, compare after. Taken from the live context rather
      // than from initialState, because the store seeds its tree from the
      // same objects, so a nested write through init would show up in both.
      const before = {};
      for (let i = 0; i < mirroredKeys.length; i++) before[mirroredKeys[i]] = copyPlain(this[mirroredKeys[i]]);
      const out = userInit.apply(this, arguments);
      for (let i = 0; i < mirroredKeys.length; i++) {
        const k = mirroredKeys[i];
        if (!samePlain(before[k], this[k])) initTouched.push(k);
      }
      return out;
    };
  }
  wf.store(name, storeDef);
  const store = wf.getStore(name);
  const lastSent = {};
  for (let i = 0; i < rawKeys.length; i++) {
    store[rawKeys[i]] = copyPlain(initialState[rawKeys[i]]);
    lastSent[rawKeys[i]] = store[rawKeys[i]];
  }
  const computedNames = Object.keys(def.computed || {});

  // What changed since the last emit: leaf paths the tree reported, and the
  // computed:NAME pulses (value included) the notifiers reported.
  const changedPaths = new Set();
  const changedComputeds = new Map();
  let emitQueued = false;
  // The message being applied, so the emit that runs after the graph's own
  // microtask flush (where the computed pulses arrive) carries its seq and
  // leaves out the set's own path. 0 between messages: a write outside any
  // message (an async continuation, a timer, the store's init) is emitted
  // unattributed.
  let pendingSeq = 0;
  let pendingExclude;

  store.subscribe('', (nv, _ov, path) => {
    if (typeof path !== 'string') return;
    if (path.indexOf(COMPUTED_PULSE) === 0) changedComputeds.set(path.slice(COMPUTED_PULSE.length), nv);
    else changedPaths.add(path);
    scheduleEmit();
  });

  function scheduleEmit() {
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => { emitQueued = false; emit(pendingSeq, pendingExclude); });
  }

  // The first snapshot: every computed at its initial value. The subscribe
  // above installs the notifiers on a microtask (their first run records a
  // baseline and pulses nothing); this runs after them.
  queueMicrotask(() => {
    changedComputeds.clear();
    changedPaths.clear();
    const changes = [];
    // Anything the definition's init() changed. The page seeded its mirror
    // from the declared state, so without these it would hold the declared
    // values for the life of the thread while the worker used init's.
    for (let i = 0; i < initTouched.length; i++) {
      changes.push({ path: initTouched[i], value: copyPlain(store[initTouched[i]]) });
    }
    for (let i = 0; i < computedNames.length; i++) {
      if (workerOnlyKeys.indexOf(computedNames[i]) !== -1) continue;
      changes.push({ path: computedNames[i], value: copyPlain(store[computedNames[i]]) });
    }
    safePost({ type: PATCH, seq: 0, changes }, 0);
  });

  // tick(dt): dt in milliseconds since the previous tick, as the framework's
  // pool loop passes it. Writes it makes ride an unattributed patch (seq 0)
  // from the emit microtask; a throw is reported as an unattributed ERROR
  // (the mirror's `error` holds it) and the loop goes on.
  if (typeof def.tick === 'function') {
    let last = performance.now();
    // A tick that throws on one frame is worth reporting and carrying on
    // from; a tick that throws on every frame is a broken definition, and
    // reporting it sixty times a second buries the first report and floods
    // the main thread with work (each ERROR writes the mirror, and in the
    // framework form the store too). So: report the first few, then give up
    // on the loop and say so. `error` would never clear on its own here,
    // because nothing the loop does is ever acknowledged.
    let consecutive = 0;
    const step = () => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      let threw = false;
      try {
        def.tick.call(store, dt);
      } catch (e) {
        threw = true;
        consecutive++;
        if (consecutive <= TICK_ERRORS_REPORTED) postError(0, e);
        if (consecutive >= TICK_ERRORS_BEFORE_STOP) {
          postError(0, new Error("tick() threw on " + consecutive + " consecutive frames for thread '" + name
            + "', so the loop was stopped; the thread still answers writes and calls"));
          return;   // not re-armed
        }
      }
      if (!threw) consecutive = 0;
      // A tick that only wrote raw fields queued nothing; the emit checks them.
      if (rawKeys.length) scheduleEmit();
      // Compensate for the tick's own duration so the period stays TICK_MS.
      setTimeout(step, Math.max(0, TICK_MS - (performance.now() - now)));
    };
    setTimeout(step, TICK_MS);
  }

  // Send one patch for everything that changed. Returns false when the patch
  // could not be sent (an uncloneable value); the caller turns that into an
  // ERROR reply for its message.
  function emit(seq, excludePaths) {
    if (excludePaths) for (let i = 0; i < excludePaths.length; i++) changedPaths.delete(excludePaths[i]);
    const changes = [];
    // Raw fields: shipped when the identity changed since the last send. A
    // set from the main side updates lastSent as it lands, so it never
    // echoes. A typed array or ArrayBuffer is transferred, not cloned: its
    // buffer moves to the main thread and the worker's field is detached
    // (byteLength 0) until the definition assigns a fresh one, so a
    // per-frame producer allocates per tick.
    let transfer = null;
    for (let i = 0; i < rawKeys.length; i++) {
      const k = rawKeys[i];
      const v = store[k];
      if (v === lastSent[k]) continue;
      // lastSent is advanced by commitSent() after the post succeeds, not
      // here: a field marked sent by a post that then threw would never be
      // offered again.
      changes.push({ path: k, value: v });
      const buf = transferableBuffer(v);
      // Once only: two views over one buffer would list it twice, and
      // postMessage refuses a duplicate.
      if (buf && (!transfer || transfer.indexOf(buf) === -1)) (transfer || (transfer = [])).push(buf);
    }
    if (changes.length === 0 && changedPaths.size === 0 && changedComputeds.size === 0) return true;
    const paths = normalizePaths(changedPaths);
    for (let i = 0; i < paths.length; i++) {
      const head = paths[i].split('.')[0];
      if (workerOnlyKeys.indexOf(head) !== -1 || head.indexOf(VERSION_PREFIX) === 0) continue;
      changes.push({ path: paths[i], value: copyPlain(getPath(store, paths[i])) });
    }
    changedComputeds.forEach((value, key) => {
      if (workerOnlyKeys.indexOf(key) === -1) changes.push({ path: key, value: copyPlain(value) });
    });

    // Post first, commit second. Clearing the accumulators before the post
    // meant one uncloneable value took every good change in the same batch
    // down with it, permanently: the paths were already gone, so nothing
    // ever re-sent them and the mirror diverged in silence.
    //
    // On a failure the offending change is dropped and the rest are retried,
    // so a single bad value costs its own key rather than the patch, and
    // cannot wedge the channel by failing again on every later emit.
    const sent = safePost({ type: PATCH, seq, changes }, seq, transfer);
    if (!sent) return false;
    // A raw field counts as sent only once a post carrying it succeeded.
    for (let i = 0; i < sent.length; i++) {
      const p = sent[i].path;
      if (rawKeys.indexOf(p) !== -1) lastSent[p] = sent[i].value;
    }
    changedPaths.clear();
    changedComputeds.clear();
    return true;
  }

  // Post a patch, dropping one uncloneable change per attempt and retrying
  // the rest. Returns the array of changes that actually went out, or false
  // if nothing could be sent.
  //
  // Dropping only the offender matters in both directions: a single bad value
  // must not take the good changes beside it down (they would be lost, since
  // the caller clears its accumulators on success), and it must not wedge the
  // channel by failing again on every later emit.
  function safePost(msg, seq, transfer) {
    let changes = msg.changes;
    // No `changes.length` guard on the loop: an empty patch is a real message.
    // The first snapshot sends one when a definition has no computeds, and it
    // is what flips isLoading on the page.
    for (let attempt = 0; attempt < MAX_POST_ATTEMPTS; attempt++) {
      try {
        post({ type: msg.type, seq: msg.seq, changes }, transfer);
        return changes;
      } catch (e) {
        const hit = firstUncloneable(changes);
        // Nothing uncloneable, so the transfer list was refused: send by copy.
        if (hit.path === '?' && transfer) { transfer = null; continue; }
        if (__DEV__) {
          warn(CODES.NOT_CLONEABLE,
            `thread '${name}': the value at '${hit.path}' (${hit.type}) cannot cross to the main thread, so that field was left out of the patch`,
            'Keep functions and DOM nodes out of state and computed results; the mirror only holds what structured clone can copy.');
        }
        if (seq) { postError(seq, e); seq = 0; }   // one ERROR per patch, not per attempt
        const next = [];
        for (let i = 0; i < changes.length; i++) if (changes[i].path !== hit.path) next.push(changes[i]);
        if (next.length === changes.length) return false;   // unidentifiable; stop rather than spin
        changes = next;
        transfer = null;                                    // the transfer list belonged to attempt 0
      }
    }
    return false;
  }

  function postError(seq, e, id) {
    const msg = { type: ERROR, seq, name: (e && e.name) || 'Error', message: String(e && e.message || e), stack: (e && e.stack) || '' };
    if (id !== undefined) msg.id = id;
    post(msg);
  }

  // Input coalescing, the query's last-call-wins in the thread's terms.
  // Messages are macrotasks: while one recompute blocks this thread, the
  // writes behind it queue as message events. Each arrival goes into an
  // inbox and the drain runs on a timer task, which sits behind every
  // message event already queued, so a burst is applied in order in one
  // pass and the graph flushes once: one recompute for the newest input,
  // one patch under the last seq, then an ack or error per message in
  // order. The set's own paths are left out of the patch (the mirror holds
  // them) unless a call in the same batch ran after them.
  const inbox = [];
  let drainScheduled = false;

  function handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    inbox.push(msg);
    if (!drainScheduled) {
      drainScheduled = true;
      setTimeout(drain, 0);
    }
  }

  function drain() {
    drainScheduled = false;
    const outcomes = [];
    const excludes = [];
    const setsSinceCall = [];
    let seq = 0;
    while (inbox.length) {
      const msg = inbox.shift();
      const out = { msg, result: undefined, error: null };
      outcomes.push(out);
      seq = msg.seq;
      try {
        if (msg.type === SET) {
          writePath(store, msg.path, msg.value);
          const head = msg.path.split('.')[0];
          if (rawKeys.indexOf(head) !== -1) lastSent[head] = store[head];
          setsSinceCall.push(msg.path);
        } else if (msg.type === CALL) {
          setsSinceCall.length = 0;
          const fn = store[msg.method];
          if (typeof fn !== 'function') throw new Error(`thread '${name}' has no method '${msg.method}'`);
          out.result = fn.apply(store, msg.args || []);
          // An async method's continuation runs on a microtask; it must land
          // before any later message, as it did when each message was its
          // own task. The batch ends here and the rest drains next tick.
          if (out.result !== null && typeof out.result === 'object' && typeof out.result.then === 'function' && inbox.length) {
            drainScheduled = true;
            setTimeout(drain, 0);
            break;
          }
        }
      } catch (e) {
        out.error = e;
      }
    }
    for (let i = 0; i < setsSinceCall.length; i++) if (excludes.indexOf(setsSinceCall[i]) === -1) excludes.push(setsSinceCall[i]);
    pendingSeq = seq;
    pendingExclude = excludes;
    // The graph flushes on a microtask queued during the first write, before
    // the one the subscribe callback queues; this one runs after both, so
    // every pulse for the batch has been emitted under its seq.
    queueMicrotask(() => {
      const ok = emit(pendingSeq, excludes);
      clearPending();
      for (let i = 0; i < outcomes.length; i++) finish(outcomes[i], ok);
    });
  }

  function finish(out, ok) {
    const msg = out.msg;
    if (out.error) { postError(msg.seq, out.error, msg.id); return; }
    if (!ok) { postError(msg.seq, new Error('the patch for this message could not be sent'), msg.id); return; }
    if (msg.type === SET) { post({ type: ACK, seq: msg.seq }); return; }
    const result = out.result;
    if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
      // Writes after an await are emitted unattributed as they happen; the
      // ack follows the settled promise.
      result.then(
        (r) => queueMicrotask(() => { if (emit(msg.seq)) ack(msg, r); }),
        (e) => queueMicrotask(() => { emit(msg.seq); postError(msg.seq, e, msg.id); })
      );
      return;
    }
    ack(msg, result);
  }

  function clearPending() { pendingSeq = 0; pendingExclude = undefined; }

  function ack(msg, result) {
    try {
      post({ type: ACK, seq: msg.seq, id: msg.id, result: copyPlain(result) });
    } catch (e) {
      postError(msg.seq, e, msg.id);
    }
  }

  return { handleMessage, store };
}

// The ArrayBuffer behind a typed array or DataView, or the buffer itself;
// null for anything else (and for a detached or shared buffer, which cannot
// be transferred).
function transferableBuffer(v) {
  if (v === null || typeof v !== 'object') return null;
  const buf = ArrayBuffer.isView(v) ? v.buffer : (v instanceof ArrayBuffer ? v : null);
  if (!buf || buf.byteLength === 0) return null;
  if (typeof SharedArrayBuffer !== 'undefined' && buf instanceof SharedArrayBuffer) return null;
  return buf;
}

// A dot-path write on the store: `params.query` walks to the parent through
// the store's reactive proxies and assigns the leaf, so the tree reports it.
function writePath(store, path, value) {
  const parts = path.split('.');
  // Never a writable segment: mid-path it walks into Object.prototype, last
  // it replaces the parent's prototype. The core's own path writer refuses it
  // the same way.
  if (parts.indexOf('__proto__') !== -1) throw new Error(`'${path}': '__proto__' is not a writable path segment`);
  const last = parts.pop();
  let cur = store;
  for (let i = 0; i < parts.length; i++) {
    cur = cur[parts[i]];
    if (cur === null || typeof cur !== 'object') throw new Error(`'${path}': '${parts.slice(0, i + 1).join('.')}' is not an object`);
  }
  cur[last] = value;
}

// Leaf paths as the tree reports them, reduced to what the mirror needs: a
// structural array change (`rows.length`) becomes the array itself (`rows`),
// and a path whose ancestor is also present is dropped (the ancestor's value
// carries it).
function normalizePaths(set) {
  const out = [];
  set.forEach((p) => {
    if (p.length > 7 && p.slice(-7) === '.length') p = p.slice(0, -7);
    if (out.indexOf(p) === -1) out.push(p);
  });
  out.sort();
  const kept = [];
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    let covered = false;
    for (let j = 0; j < kept.length; j++) {
      if (p.indexOf(kept[j] + '.') === 0) { covered = true; break; }
    }
    if (!covered) kept.push(p);
  }
  return kept;
}

function firstUncloneable(changes) {
  for (let i = 0; i < changes.length; i++) {
    const hit = findUncloneable(changes[i].value, changes[i].path);
    if (hit) return hit;
  }
  return { path: '?', type: 'unknown' };
}
