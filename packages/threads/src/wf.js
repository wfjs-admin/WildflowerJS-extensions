/**
 * The extension's entry: the isomorphic runtime plus the WildflowerJS layer.
 * Public API only; the framework never learns the word "thread".
 *
 * On the page, `wildflower.thread(name, def, options)` creates the mirror
 * through the runtime's internal `thread()` and registers `wildflower.store(name, ...)` whose state
 * is the mirror's: the definition's state fields (inputs), one field per
 * computed (outputs, pushed in by the worker), and `isLoading`, `error`,
 * `pending`. Outputs flow in as plain writes inside one `wildflower.batch()`
 * per change; inputs flow out through `store.subscribe(field, cb)` on each
 * state field, forwarded to the mirror as writes, with a flag held while a
 * change is being applied so nothing the layer wrote is forwarded back.
 * Methods are store methods returning the mirror's promises; `settled()` is
 * one of them; the store's `destroy()` terminates the worker, so
 * `wildflower.unregister(name)` and `wildflower.destroy()` both end it.
 *
 * In the worker, the registrar is exposed as `wildflower.thread`, so a
 * definition file runs unchanged on both sides.
 *
 * Entry: `wildflower.plugin(install)` where the tier ships plugins (full,
 * spa, standard), `install(wildflower)` directly where it does not (nano,
 * mini, mini-pool, lite). Either way the only addition to the framework's
 * surface is `wildflower.thread`.
 */

import { start, isWorker } from './entry.js';
import { GLOBAL_NAME } from './names.js';
import { CODES, warn } from './diagnostics.js';
import { getPath, copyPlain } from './protocol.js';

// Store lifecycle hooks and blocks: never callable methods. `tick` is the
// worker's own loop.
const LIFECYCLE = ['state', 'computed', 'watch', 'init', 'beforeInit', 'beforeUpdate', 'onUpdate',
  'beforeDestroy', 'destroy', 'onError', 'tick', 'workerOnly'];
// The mirror's bookkeeping fields, mirrored into the store as plain state.
const META = ['isLoading', 'error', 'pending'];

if (isWorker) {
  start({ onWorkerCore(wf, registrar) { wf[GLOBAL_NAME] = registrar; } });
} else {
  const thread = start();
  const wf = self.wildflower;
  if (!wf) {
    if (__DEV__) warn(CODES.NO_FRAMEWORK, 'the framework is not on this page; load the wildflower script before this file',
      'Order the tags: the framework, then this file, then the definition files.');
  } else if (typeof wf.plugin === 'function') {
    wf.plugin(install);
  } else {
    install(wf);
  }

  function install(wf) {
    wf[GLOBAL_NAME] = function (name, def, options) { return registerThreadStore(wf, thread, name, def, options); };
  }
}

function registerThreadStore(wf, thread, name, def, options) {
  // Check before spawning. wf.store() keeps the first registration and hands
  // back the existing context, so a colliding call used to leave a live
  // worker with nothing reading it, and then wire the OLD store's inputs
  // into the NEW mirror: writes went to a worker whose patches landed on a
  // store the page was not reading. One leaked worker per attempt, which a
  // re-run definition file or a hot reload does readily.
  const existing = wf.getStore(name);
  if (existing) {
    if (__DEV__) {
      warn(CODES.NAME_TAKEN,
        `thread '${name}': a store with that name is already registered, so no thread was created`,
        `Call wildflower.unregister('${name}') before registering it again, or use a different name.`);
    }
    return existing;
  }

  const mirror = thread(name, def, options);
  const computedNames = Object.keys(def.computed || {});
  const stateKeys = Object.keys(def.state || {});
  // Underscore-prefixed keys are non-reactive instance fields on a store
  // (the context proxy routes them past the state tree): the per-frame
  // output channel. They are seeded on the instance, arrive as plain
  // assignments sharing the mirror's value, and are read by pulling, as a
  // pool's tick does. They are not inputs.
  const workerOnly = Array.isArray(def.workerOnly) ? def.workerOnly : [];
  const inputNames = stateKeys.filter((k) => k.charCodeAt(0) !== 95 && workerOnly.indexOf(k) === -1);
  const rawKeys = stateKeys.filter((k) => k.charCodeAt(0) === 95);
  const offs = [];
  let applying = false;

  // The store definition: the mirror's snapshot as state (inputs, outputs
  // and the three bookkeeping fields), the definition's methods as
  // forwarders, settled(), and the teardown.
  const state = copyPlain(mirror.snapshot);
  for (let i = 0; i < rawKeys.length; i++) delete state[rawKeys[i]];
  const storeDef = { state };
  for (const k in def) {
    if (LIFECYCLE.indexOf(k) === -1 && typeof def[k] === 'function') {
      storeDef[k] = function () { return mirror[k].apply(null, arguments); };
    }
  }
  storeDef.settled = function () { return mirror.settled(); };
  storeDef.destroy = function () {
    while (offs.length) offs.pop()();
    mirror.terminate();
  };
  const store = wf.store(name, storeDef);
  for (let i = 0; i < rawKeys.length; i++) store[rawKeys[i]] = mirror.snapshot[rawKeys[i]];

  // Outputs and bookkeeping flow in as writes. A local write is already in
  // the store (it came from there), so only what the worker or the runtime
  // changed is applied. Reactive values are copied so the store never
  // shares an object with the mirror's snapshot; raw fields are shared.
  const apply = (changes) => {
    for (let i = 0; i < changes.length; i++) {
      const c = changes[i];
      writePath(store, c.path, c.path.charCodeAt(0) === 95 ? c.value : copyPlain(c.value));
    }
  };
  const onChange = (e) => {
    const d = e.detail;
    if (d.source === 'local') return;
    applying = true;
    try {
      // One write does not need a batch. Worth being deliberate about,
      // because `meta` changes (pending, error) are raised synchronously
      // from send(), which the input forwarder reaches from inside the
      // framework's own dispatch, so batching them nested one wildflower
      // batch inside another. wildflower.batch() does not nest: _batchMode
      // is a boolean and batchScopeBoundary a single module-level value.
      //
      // No defect was demonstrated from that nesting (2026-09-21): applyBatch
      // clears both before it dispatches subscribers, so the inner batch
      // opens after the outer one has already closed them. Avoided anyway,
      // since a batch around a single write buys nothing and this removes the
      // hazard rather than relying on that ordering holding.
      //
      // A worker patch arrives on a message, so it can never land inside an
      // author's batch; only these single-field meta changes could.
      if (d.changes.length > 1) wf.batch(() => apply(d.changes));
      else apply(d.changes);
    } finally {
      applying = false;
    }
  };
  mirror.addEventListener('change', onChange);
  offs.push(() => mirror.removeEventListener('change', onChange));

  // Inputs flow out. A structural array change arrives as `rows.length`;
  // the whole array is forwarded, as the worker half does in the other
  // direction.
  // Put a field back to the mirror's value, as the layer's own write.
  const restore = (field) => {
    applying = true;
    try {
      const v = mirror.snapshot[field];
      writePath(store, field, field.charCodeAt(0) === 95 ? v : copyPlain(v));
    } finally {
      applying = false;
    }
  };
  for (let i = 0; i < inputNames.length; i++) {
    const field = inputNames[i];
    offs.push(store.subscribe(field, (nv, _ov, path) => {
      if (applying) return;
      if (path.length > 7 && path.slice(-7) === '.length') { path = path.slice(0, -7); nv = getPath(store, path); }
      try {
        writePath(mirror, path, copyPlain(nv));
      } catch (e) {
        // The write never reached the worker (a value that cannot cross, or
        // a terminated thread): the store keeps what the mirror holds.
        restore(field);
        throw e;
      }
    }));
  }
  // A main-thread write to an output: the worker owns it. It is not
  // forwarded, and the store goes straight back to the mirror's value, as
  // the mirror itself drops such a write.
  const outputs = computedNames.concat(META);
  for (let i = 0; i < outputs.length; i++) {
    const field = outputs[i];
    offs.push(store.subscribe(field, () => {
      if (applying) return;
      if (__DEV__) {
        warn(CODES.WRITE_TO_COMPUTED,
          `thread '${name}': '${field}' is ${computedNames.indexOf(field) === -1 ? 'set by the runtime' : 'a computed'}; the worker owns it and the write was dropped`,
          'Write to the state the computed reads, or call a method on the thread.');
      }
      restore(field);
    }));
  }
  return store;
}

// A dot-path write through an object's own setters: the store's reactive
// proxies in one direction, the mirror's proxy in the other.
function writePath(root, path, value) {
  const dot = path.lastIndexOf('.');
  if (dot === -1) { root[path] = value; return; }
  const parent = getPath(root, path.slice(0, dot));
  if (parent === null || typeof parent !== 'object') return;
  parent[path.slice(dot + 1)] = value;
}
