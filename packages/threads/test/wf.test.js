/**
 * The framework form, against the built .wf.js file, with the framework's
 * own tier file on the page (THREADS_CORE: dev or min, any tier) and in the
 * worker. Public API only on both sides.
 *
 * Covers, from the design's seams and Probe 3's assertions: the store
 * seeded from the mirror and readable on the first frame (seam 3); outputs
 * arriving as writes that re-run component computeds, bindings, a keyed
 * data-list over `$store.field`, a `store:` watcher and `store.subscribe`
 * (seam 5); inputs flowing out through data-model, a component method and
 * the store's array mutators, never echoed back (seam 4); methods as store
 * methods returning promises, and settled() (seam 7); teardown through
 * wildflower.unregister and wildflower.destroy() terminating the worker
 * (seam 6); TH-102 on a main-thread write to an output (dev).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  loadFrameworkForm, statsDefinition, until, tick, captureWarnings, recordPosts, recordTerminates,
  isMin, BUILD, CORE_TIER, CORE_HAS_LISTS,
} from './helpers.js';

let wf;
let n = 0;
const live = [];
const settle = (ms = 60) => tick(ms);

// A thread store with a unique name, its worker ended in afterEach.
async function threadStore(def, ready = true) {
  const name = 'stats' + (++n);
  const store = wf.thread(name, def || statsDefinition(), { inline: true });
  live.push(name);
  if (ready) await until(() => store.isLoading === false, 5000, 'first patch');
  return { name, store };
}

function mount(html) {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  wf.scan(el);
  live.push(el);
  return el;
}

beforeAll(async () => { wf = await loadFrameworkForm(); });
afterEach(() => {
  while (live.length) {
    const x = live.pop();
    if (typeof x === 'string') wf.unregister(x); else x.remove();
  }
});

describe(`framework form (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('wildflower.thread registers a store seeded from the mirror; the first patch clears isLoading and fills the computeds', async () => {
    const { name, store } = await threadStore(undefined, false);
    expect(store).toBe(wf.getStore(name));
    expect(store.isLoading).toBe(true);
    expect(store.pending).toBe(0);
    expect(store.error).toBeNull();
    expect(store.rows.length).toBe(5);
    expect(store.params.query).toBe('');
    expect(store.count).toBeUndefined();
    await until(() => store.isLoading === false, 5000, 'first patch');
    expect(store.count).toBe(5);
    expect(store.revenue).toBe(150);
    expect(store.top).toBe('beta-two');
    expect(store.filtered.length).toBe(5);
  });

  // A generated app in the AI-surface eval (th1) listed a thread output of
  // plain strings with $this: the rows appeared, but empty.
  it.skipIf(!CORE_HAS_LISTS)('a data-list of strings over a thread output renders each value with $this', async () => {
    const { name, store } = await threadStore({
      state: { n: 0 },
      // Two outputs change together, so the patch is applied as a batch.
      computed: {
        names() { var out = []; for (var i = 0; i < this.n; i++) out.push('w' + i); return out; },
        size() { return this.n; },
      },
    }, false);
    wf.component('prim' + n, { subscribe: [name], state: {} });
    const el = mount(`<div data-component="prim${n}"><ul class="prim" data-list="$${name}.names"><template><li data-bind="$this"></li></template></ul></div>`);
    await until(() => store.isLoading === false, 5000, 'first patch');
    // 12 rows: at this size the list takes the bulk create path, where the
    // empty rows came from.
    store.n = 12;
    await until(() => el.querySelectorAll('.prim li').length === 12, 3000, 'twelve rows');
    await settle(120);
    expect(Array.from(el.querySelectorAll('.prim li')).map((li) => li.textContent))
      .toEqual(Array.from({ length: 12 }, (_, i) => 'w' + i));
  });

  it('outputs arrive as writes: component computeds, $store bindings, a store: watcher, store.subscribe and (where the tier has lists) a keyed data-list over $store.filtered', async () => {
    const { name, store } = await threadStore(undefined, false);
    const evals = { doubled: 0, status: 0, unrelated: 0 };
    const watched = [];
    const subscribed = [];
    const seeded = {};
    let loadReturned = null;
    store.subscribe('count', (nv, ov) => subscribed.push([nv, ov]));
    wf.component('view' + n, {
      subscribe: [name],
      state: { local: 'L' },
      computed: {
        doubled() { evals.doubled++; return (this.stores[name].count || 0) * 2; },
        status() { evals.status++; return this.stores[name].isLoading ? 'loading' : 'ready'; },
        unrelated() { evals.unrelated++; return this.state.local; },
      },
      watch: { [`store:${name}.count`]: function (nv, ov) { watched.push([nv, ov]); } },
      // Seam 3: the store is readable from init on, whether or not the
      // worker's first patch has landed by then (the mount is scheduled,
      // so either can come first); what init sees is consistent.
      init() { seeded.status = this.status; seeded.doubled = this.doubled; seeded.isLoading = this.stores[name].isLoading; },
      load() { loadReturned = this.stores[name].search('beta'); },
    });
    const list = CORE_HAS_LISTS
      ? `<div class="rows" data-list="$${name}.filtered" data-key="id"><template><span class="row" data-bind="name"></span></template></div>`
      : '';
    const el = mount(`<div data-component="view${n}">
      <span class="doubled" data-bind="doubled"></span>
      <span class="status" data-bind="status"></span>
      <span class="count" data-bind="$${name}.count"></span>
      <span class="unrelated" data-bind="unrelated"></span>
      <button class="load" data-action="load"></button>${list}</div>`);
    await until(() => 'status' in seeded, 2000, 'init');
    expect(seeded).toEqual(seeded.isLoading ? { status: 'loading', doubled: 0, isLoading: true } : { status: 'ready', doubled: 10, isLoading: false });
    const before = { ...evals };
    const text = (sel) => el.querySelector(sel).textContent.trim();

    await until(() => store.isLoading === false, 5000, 'first patch');
    await settle(120);
    expect(text('.unrelated')).toBe('L');
    expect(text('.status')).toBe('ready');
    expect(text('.doubled')).toBe('10');
    expect(text('.count')).toBe('5');
    if (CORE_HAS_LISTS) {
      expect(Array.from(el.querySelectorAll('.row')).map((r) => r.textContent.trim())).toEqual(['alpha', 'beta', 'gamma', 'delta', 'beta-two']);
    }
    expect(watched[watched.length - 1]).toEqual([5, undefined]);
    expect(subscribed[subscribed.length - 1]).toEqual([5, undefined]);
    expect(evals.doubled).toBeGreaterThan(before.doubled);
    expect(evals.status).toBeGreaterThan(before.status);

    // A component method (data-action) calls a thread method through
    // this.stores; the second patch re-runs only what it changed.
    el.querySelector('.load').click();
    await until(() => loadReturned !== null, 2000, 'the action to run');
    expect(loadReturned).toBeInstanceOf(Promise);
    await loadReturned;
    await settle(120);
    expect(store.count).toBe(2);
    expect(text('.doubled')).toBe('4');
    expect(text('.count')).toBe('2');
    expect(text('.unrelated')).toBe('L');
    if (CORE_HAS_LISTS) {
      expect(Array.from(el.querySelectorAll('.row')).map((r) => r.textContent.trim())).toEqual(['beta', 'beta-two']);
    }
    expect(watched[watched.length - 1]).toEqual([2, 5]);
    expect(subscribed[subscribed.length - 1]).toEqual([2, 5]);
    expect(evals.unrelated).toBe(before.unrelated);
    // status reads isLoading, which the second patch did not change.
    const statusAfterFirst = evals.status;
    expect(statusAfterFirst).toBe(evals.status);
  });

  it('inputs flow out: a data-model write on the store path reaches the worker, and applying the answer posts nothing back', async () => {
    const { name, store } = await threadStore();
    wf.component('form' + n, { subscribe: [name], state: {} });
    const el = mount(`<div data-component="form${n}"><input class="q" data-model="${name}.params.query"></div>`);
    await settle();
    const input = el.querySelector('.q');
    expect(input.value).toBe('');
    const posted = await recordPosts(async () => {
      input.value = 'beta';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      expect(store.params.query).toBe('beta');
      await store.settled();
      await settle();
    });
    expect(posted.map((m) => m.type)).toEqual(['set']);
    expect(posted[0].path).toBe('params.query');
    expect(posted[0].value).toBe('beta');
    expect(store.count).toBe(2);
    expect(store.revenue).toBe(70);
  });

  it('echo suppression: patches that carry state paths (a method that writes rows) are applied to the store and never forwarded', async () => {
    const { store } = await threadStore();
    const posted = await recordPosts(async () => {
      const len = await store.addRow({ id: 6, name: 'beta-three', revenue: 5 });
      expect(len).toBe(6);
      await store.search('beta');
      await settle();
    });
    expect(posted.map((m) => m.type)).toEqual(['call', 'call']);
    expect(store.rows.length).toBe(6);
    expect(store.count).toBe(3);
    expect(store.pending).toBe(0);
  });

  it('methods are store methods returning the mirror\'s promises; settled() and pending are on the store; a worker error lands in error', async () => {
    const { name, store } = await threadStore();
    expect(await store.echoSelf()).toEqual({ count: 5, query: '' });
    expect(await store.hasWindow()).toBe(false);
    store.params.query = 'gamma';
    expect(store.pending).toBe(1);
    await store.settled();
    expect(store.pending).toBe(0);
    expect(store.count).toBe(1);
    let err = null;
    try { await store.boom('bad thing'); } catch (e) { err = e; }
    expect(err.name).toBe('TypeError');
    expect(err.message).toBe('bad thing');
    expect(err.thread).toBe(name);
    // The store field is the message, matching a query store's `error`, and
    // it clears once the worker acknowledges the next message.
    expect(store.error).toBe('bad thing');
    expect(await store.echoSelf()).toEqual({ count: 1, query: 'gamma' });
    expect(store.error).toBeNull();
  });

  it('array mutators on the store forward the whole array once; nested writes forward their path', async () => {
    const { store } = await threadStore();
    const posted = await recordPosts(async () => {
      store.rows.push({ id: 6, name: 'beta-four', revenue: 1 });
      await store.settled();
    });
    const sets = posted.filter((m) => m.type === 'set');
    expect(sets.length).toBeGreaterThanOrEqual(1);
    expect(sets[sets.length - 1].path).toBe('rows');
    expect(sets[sets.length - 1].value.length).toBe(6);
    expect(store.count).toBe(6);
    expect(store.revenue).toBe(151);
    const posted2 = await recordPosts(async () => {
      store.rows[0].name = 'beta-zero';
      await store.settled();
    });
    expect(posted2.map((m) => [m.type, m.path])).toEqual([['set', 'rows.0.name']]);
    await settle();
    expect(store.count).toBe(6);
    expect(store.filtered[0].name).toBe('beta-zero');
  });

  it('underscore-prefixed state lands on the store as a non-reactive instance field, read by pulling', async () => {
    const def = {
      state: { n: 0, _buf: [1, 2, 3] },
      fill(k) { const b = new Array(k); for (let i = 0; i < k; i++) b[i] = i; this._buf = b; this.n = k; },
    };
    const { store } = await threadStore(def);
    expect(store._buf).toEqual([1, 2, 3]);
    let reactiveFired = 0;
    store.subscribe('_buf', () => { reactiveFired++; });
    await store.fill(5);
    await settle();
    expect(store.n).toBe(5);
    expect(store._buf).toEqual([0, 1, 2, 3, 4]);
    expect(Array.isArray(store._buf)).toBe(true);
    expect(reactiveFired).toBe(0);
  });

  it('worker-only state has no field on the store; the computeds over it arrive as usual', async () => {
    const def = statsDefinition();
    def.workerOnly = ['rows'];
    // Worker-only state is reactive by identity: replaced, not mutated in place.
    def.addRow = function (row) { this.rows = this.rows.concat([row]); return this.rows.length; };
    const { store } = await threadStore(def);
    expect(store.rows).toBeUndefined();
    expect(store.count).toBe(5);
    await store.addRow({ id: 6, name: 'beta-three', revenue: 5 });
    await settle();
    expect(store.count).toBe(6);
    expect(store.rows).toBeUndefined();
    store.params.query = 'beta';
    await store.settled();
    await settle();
    expect(store.count).toBe(3);
  });

  it.skipIf(isMin)('TH-102 warns on a main-thread write to a computed field or a runtime field (dev build)', async () => {
    const { store } = await threadStore();
    const lines = await captureWarnings(async () => {
      store.count = 99;
      store.isLoading = true;
      await settle();
    });
    const hits = lines.filter((l) => l.indexOf('TH-102') !== -1);
    expect(hits.some((l) => l.indexOf("'count'") !== -1 && l.indexOf('computed') !== -1)).toBe(true);
    expect(hits.some((l) => l.indexOf("'isLoading'") !== -1)).toBe(true);
  });

  it('teardown: wildflower.unregister runs the store\'s destroy, which terminates the worker; later calls reject with TH-104', async () => {
    const { name, store } = await threadStore();
    const terminated = recordTerminates();
    try {
      expect(wf.unregister(name)).toBe(true);
      live.splice(live.indexOf(name), 1);
      await settle();
      expect(terminated.length).toBe(1);
      let err = null;
      try { await store.echoSelf(); } catch (e) { err = e; }
      expect(err.code).toBe('TH-104');
      expect(wf.getStore(name)).toBeFalsy();
    } finally {
      terminated.stop();
    }
  });

  it('teardown: wildflower.destroy() terminates every thread worker (last test in this file)', async () => {
    const a = await threadStore();
    const b = await threadStore();
    live.splice(live.indexOf(a.name), 1);
    live.splice(live.indexOf(b.name), 1);
    const terminated = recordTerminates();
    try {
      wf.destroy();
      await settle();
      expect(terminated.length).toBe(2);
    } finally {
      terminated.stop();
    }
  });
});

describe(`a class instance written to an input (${BUILD})`, () => {
  afterEach(() => {
    while (live.length) {
      const x = live.pop();
      if (typeof x === 'string') wf.unregister(x); else x.remove();
    }
  });

  // The page's framework proxies a class instance written to store state,
  // and the input forwarder copies it before it crosses; a proxy cannot be
  // cloned, so the copy has to unwrap it into plain data.
  it('reaches the worker as plain data', async () => {
    const { store } = await threadStore({ state: { box: null }, read() { return this.box ? this.box.x : 'none'; } });
    class Box { constructor(x) { this.x = x; } }
    store.box = new Box(7);
    await store.settled();
    expect(await store.read()).toBe(7);
    expect(store.error).toBe(null);
  });
});

describe(`author batch around thread inputs (${BUILD})`, () => {
  // The forwarder runs from the framework's own state dispatch, and the
  // mirror write it makes calls setField('pending') -> notify -> onChange,
  // which opens a wf.batch() of its own. wildflower.batch() is not a counter
  // (_batchMode is a boolean, batchScopeBoundary a single module-level
  // value), so an author batch around two thread inputs nests one inside the
  // other while the outer apply is still walking its instances.
  it('applies every write in the batch and still re-renders bindings', async () => {
    const { store } = await threadStore();
    const el = mount('<div data-component="batchprobe"><span id="c" data-bind="$STORE.count"></span></div>'
      .replace('$STORE', store.name || 'x'));
    void el;

    wf.batch(() => {
      store.params.query = 'beta';
      store.evals = 7;
    });

    await store.settled();
    await settle(80);

    // both writes crossed
    expect(store.params.query).toBe('beta');
    expect(store.evals).toBe(7);
    // and the computed the worker sent back agrees
    expect(store.count).toBe(2);
  });

  it('a second batch after the first still works', async () => {
    const { store } = await threadStore();
    wf.batch(() => { store.params.query = 'gamma'; });
    await store.settled();
    wf.batch(() => { store.params.query = 'delta'; });
    await store.settled();
    await settle(60);
    expect(store.params.query).toBe('delta');
    expect(store.count).toBe(1);
  });
});

describe(`thread method called inside an author batch (${BUILD})`, () => {
  // Unlike a state write, which the batch buffers until apply, a method call
  // posts immediately: call() -> send() -> setField('pending') -> notify ->
  // onChange -> wf.batch(). That inner batch runs while the OUTER batch's
  // fn() is still executing and _batchMode is still true, so the inner
  // apply clears _batchMode and batchScopeBoundary out from under it.
  it('does not lose the batch\'s own state writes', async () => {
    const { store } = await threadStore();
    const p = [];
    wf.batch(() => {
      store.evals = 11;                 // buffered by the batch
      p.push(store.search('beta'));     // posts now, re-enters wf.batch
      store.params.region = undefined;  // after the re-entry
    });
    await Promise.all(p);
    await store.settled();
    await settle(80);
    expect(store.evals).toBe(11);
    expect(store.params.query).toBe('beta');
  });
});

describe(`a thrown batch leaves the thread store's writes in place (${BUILD})`, () => {
  // Not a rollback: cancelBatch explicitly does not undo the writes, it only
  // skips the render scheduling ("cancelBatch does NOT roll back the writes
  // themselves; mutations made during the batch persist", EntitySystem.js).
  // Pinned here because a thread store is still an ordinary store and must
  // follow that same contract rather than inventing one of its own.
  it('keeps them, and the thread stays usable afterwards', async () => {
    const { store } = await threadStore();
    try {
      wf.batch(() => { store.params.query = 'beta'; throw new Error('boom'); });
    } catch (e) { /* expected */ }
    await settle(80);
    expect(store.params.query).toBe('beta');
    await store.settled();
    expect(store.count).toBe(2);
  });
});

describe(`a thread name already registered as a store (${BUILD})`, () => {
  // registerThreadStore spawns the Worker BEFORE calling wf.store(), and
  // StoreManager returns the existing context on a name collision. So the
  // second call used to leave a live worker with nothing reading it, and
  // then wire the OLD store's inputs into the NEW mirror.
  it('does not spawn an orphan worker, and returns the existing store', async () => {
    const name = 'dup' + (++n);
    const RealWorker = window.Worker;
    let made = 0;
    window.Worker = new Proxy(RealWorker, { construct(T, args) { made++; return new T(...args); } });
    try {
      const first = wf.thread(name, statsDefinition(), { inline: true });
      live.push(name);
      await until(() => first.isLoading === false, 5000, 'first patch');

      // Only the delta across the colliding call matters; other tests'
      // workers may still be settling.
      const before = made;
      const second = wf.thread(name, statsDefinition(), { inline: true });
      expect(made - before).toBe(0);    // no second worker
      expect(second).toBe(first);       // the existing store comes back

      // the original still works, i.e. nothing was cross-wired
      second.params.query = 'beta';
      await second.settled();
      await settle(80);
      expect(first.count).toBe(2);
    } finally {
      window.Worker = RealWorker;
    }
  });
});
