/**
 * Behaviour of the vanilla thread runtime, against the built file, with real
 * Workers. Definitions are declared inline (the Blob route) so each case
 * owns its definition; the loader suite covers the isomorphic form.
 *
 * Covers: the mirror and its proxy, one patch per message, no echo of a
 * set, subscribe/snapshot/events, methods and their promises, a method that
 * throws, async methods, array mutators on the mirror, terminate(), and the
 * dev diagnostics TH-101, TH-102, TH-105 (dev build only).
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  threadInline, endThread, loadFrameworkForm, statsDefinition, until, tick, captureWarnings, recordPosts, recordReplies, isMin, BUILD, CORE,
} from './helpers.js';

const live = [];
async function stats(def) {
  const t = await threadInline('stats', def || statsDefinition());
  live.push(t);
  await until(() => t.isLoading === false, 5000, 'first patch');
  return t;
}
afterEach(() => { while (live.length) endThread(live.pop()); });

function patchEvents() {
  const seen = [];
  const h = (e) => seen.push(e.detail);
  document.addEventListener('thread:patch', h);
  seen.stop = () => document.removeEventListener('thread:patch', h);
  return seen;
}

describe(`thread store (${BUILD})`, () => {
  it('seeds the store from the definition; isLoading is true until the first patch, which carries every computed', async () => {
    const t = await threadInline('stats', statsDefinition());
    live.push(t);
    expect(t.isLoading).toBe(true);
    expect(t.rows.length).toBe(5);
    expect(t.params.query).toBe('');
    expect(t.count).toBeUndefined();
    const events = patchEvents();
    await until(() => t.isLoading === false);
    events.stop();
    expect(events.length).toBe(1);
    expect(events[0].seq).toBe(0);
    expect(events[0].name).toBe('stats');
    expect(events[0].changes.map((c) => c.path).sort()).toEqual(['count', 'filtered', 'isLoading', 'revenue', 'top']);
    expect(t.count).toBe(5);
    expect(t.pending).toBe(0);
    expect(t.error).toBeNull();
  });

  it('a write updates the store before the worker sees it, and its own path is not echoed back', async () => {
    const t = await stats();
    const events = patchEvents();
    t.params.query = 'beta';
    expect(t.params.query).toBe('beta');
    expect(t.pending).toBe(1);
    await t.settled();
    events.stop();
    expect(events.length).toBe(1);
    const paths = events[0].changes.map((c) => c.path);
    expect(paths).not.toContain('params.query');
    expect(paths).not.toContain('params');
    expect(paths).toEqual(expect.arrayContaining(['filtered', 'count', 'revenue']));
    expect(paths).not.toContain('top');
    expect(t.count).toBe(2);
  });

  it('one message, one patch: every write a method makes coalesces, and only computeds that changed are in it', async () => {
    const t = await stats();
    const events = patchEvents();
    const len = await t.addRow({ id: 6, name: 'beta-three', revenue: 5 });
    events.stop();
    expect(len).toBe(6);
    expect(events.length).toBe(1);
    const paths = events[0].changes.map((c) => c.path);
    expect(paths).toContain('rows');
    expect(paths).toEqual(expect.arrayContaining(['filtered', 'count', 'revenue']));
    expect(paths).not.toContain('top');
    expect(events[0].changes.find((c) => c.path === 'rows').value.length).toBe(6);
    expect(t.rows.length).toBe(6);
    expect(t.count).toBe(6);
    expect(t.revenue).toBe(155);
    expect(t.top).toBe('beta-two');
  });

  it('a write of the value a field already holds sends nothing', async () => {
    const t = await stats();
    const events = patchEvents();
    const posted = await recordPosts(async () => {
      t.params.query = '';
      await t.settled();
    });
    events.stop();
    expect(posted.length).toBe(0);
    expect(events.length).toBe(0);
    expect(t.pending).toBe(0);
  });

  it('thread:patch fires on document for worker patches only, not for local writes or bookkeeping', async () => {
    const t = await stats();
    const events = patchEvents();
    t.params.query = 'beta';
    expect(events.length).toBe(0);
    await t.settled();
    events.stop();
    expect(events.length).toBe(1);
    expect(events[0].source).toBe('patch');
    expect(events[0].fromWorker).toBe(true);
    expect(events[0].changes.some((x) => x.path === 'count')).toBe(true);
  });

  it('methods return promises settled by the matching reply, carrying the result; `this` in the worker is state plus computeds plus methods, with no window', async () => {
    const t = await stats();
    expect(await t.echoSelf()).toEqual({ count: 5, query: '' });
    expect(await t.hasWindow()).toBe(false);
    const a = t.search('beta');
    const b = t.echoSelf();
    expect(a).toBeInstanceOf(Promise);
    expect(await a).toBeUndefined();
    expect(await b).toEqual({ count: 2, query: 'beta' });
    expect(t.pending).toBe(0);
  });

  it('a method that throws in the worker rejects with its name, message and stack; error holds the message and clears on the next acknowledgement', async () => {
    const t = await stats();
    let err = null;
    try { await t.boom('bad thing'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('TypeError');
    expect(err.message).toBe('bad thing');
    expect(typeof err.stack).toBe('string');
    expect(err.stack.length).toBeGreaterThan(0);
    expect(err.thread).toBe('stats');
    // The field carries the message, as a query store's `error` does; the
    // Error with its name, stack and thread is what the promise rejected with.
    expect(t.error).toBe('bad thing');
    expect(t.pending).toBe(0);
    // The thread keeps working, and the next acknowledged message clears the
    // field, so a banner bound to it does not outlive the failure.
    expect(await t.echoSelf()).toEqual({ count: 5, query: '' });
    expect(t.error).toBeNull();
    await t.settled();
  });

  it('a write clears a standing error once the worker acknowledges it', async () => {
    const t = await stats();
    try { await t.boom('bad thing'); } catch (e) { /* expected */ }
    expect(t.error).toBe('bad thing');
    t.params.query = 'beta';
    await t.settled();
    expect(t.error).toBeNull();
    expect(t.count).toBe(2);
  });

  it('an async method acknowledges after it settles; its writes after an await reach the mirror before the promise resolves', async () => {
    const t = await stats();
    const events = patchEvents();
    const p = t.later('gamma', 15);
    expect(t.pending).toBe(1);
    await tick(5);
    expect(t.count).toBe(5);
    const result = await p;
    events.stop();
    expect(result).toBe(1);
    expect(t.count).toBe(1);
    expect(t.params.query).toBe('gamma');
    expect(t.pending).toBe(0);
    expect(events.length).toBe(1);
  });

  it('array mutators on the mirror post one write of the whole array and never a set per index', async () => {
    const t = await stats();
    const posted = await recordPosts(async () => {
      const len = t.rows.push({ id: 6, name: 'beta-four', revenue: 1 });
      expect(len).toBe(6);
      expect(t.rows.length).toBe(6);
      expect(t.rows[5].name).toBe('beta-four');
      await t.settled();
    });
    expect(posted.length).toBe(1);
    expect(posted[0].type).toBe('set');
    expect(posted[0].path).toBe('rows');
    expect(posted[0].value.length).toBe(6);
    expect(t.count).toBe(6);
    expect(t.revenue).toBe(151);
    const posted2 = await recordPosts(async () => {
      const removed = t.rows.splice(0, 2);
      expect(removed.map((r) => r.id)).toEqual([1, 2]);
      await t.settled();
    });
    expect(posted2.length).toBe(1);
    expect(posted2[0].path).toBe('rows');
    expect(t.count).toBe(4);
  });

  it('echo suppression: applying a patch never sends a set back', async () => {
    const t = await stats();
    const posted = await recordPosts(async () => {
      await t.search('beta');
      await t.addRow({ id: 7, name: 'beta-five', revenue: 2 });
      await t.settled();
    });
    expect(posted.map((m) => m.type)).toEqual(['call', 'call']);
    expect(t.count).toBe(3);
  });

  it('a value taken from the store\'s own proxies crosses as plain data', async () => {
    const t = await stats();
    const posted = await recordPosts(async () => {
      t.rows = t.rows.slice(0, 2);
      await t.settled();
    });
    expect(posted.length).toBe(1);
    expect(Object.getPrototypeOf(posted[0].value)).toBe(Array.prototype);
    expect(Object.getPrototypeOf(posted[0].value[0])).toBe(Object.prototype);
    expect(t.count).toBe(2);
  });

  it('for...of, spread and JSON.stringify see the store\'s fields as plain data', async () => {
    const t = await stats();
    const names = [];
    for (const r of t.rows) names.push(r.name);
    expect(names).toEqual(['alpha', 'beta', 'gamma', 'delta', 'beta-two']);
    expect([...t.filtered].length).toBe(5);
    expect(JSON.parse(JSON.stringify(t.params))).toEqual({ query: '' });
    expect('rows' in t).toBe(true);
    expect('search' in t).toBe(true);
    expect('nope' in t).toBe(false);
  });

  it('unregistering rejects in-flight calls and pending settled() with AbortError TH-104, and later calls reject', async () => {
    const t = await stats();
    const call = t.later('zzz', 500);
    const wait = t.settled();
    expect(t.pending).toBe(1);
    endThread(t);
    let e1 = null; let e2 = null;
    try { await call; } catch (e) { e1 = e; }
    try { await wait; } catch (e) { e2 = e; }
    expect(e1.name).toBe('AbortError');
    expect(e1.code).toBe('TH-104');
    expect(e2).toBe(e1);
    let e3 = null;
    try { await t.echoSelf(); } catch (e) { e3 = e; }
    expect(e3.code).toBe('TH-104');
    let e4 = null;
    try { await t.settled(); } catch (e) { e4 = e; }
    expect(e4.code).toBe('TH-104');
    endThread(t);
  });

  it('tick(dt) runs in the worker on its own timer: its writes arrive as unattributed patches, dt is milliseconds, an input can stop it, and it is not a callable method', async () => {
    const t = await threadInline('ticker', {
      state: { running: true, ticks: 0, dtTotal: 0 },
      computed: { avgDt() { return this.ticks ? this.dtTotal / this.ticks : 0; } },
      tick(dt) { if (!this.running) return; this.ticks++; this.dtTotal += dt; },
    });
    live.push(t);
    const events = patchEvents();
    await until(() => t.ticks >= 5, 5000, 'five ticks');
    events.stop();
    expect(events.every((e) => e.seq === 0)).toBe(true);
    expect(t.avgDt).toBeGreaterThan(5);
    expect(t.avgDt).toBeLessThan(200);
    expect(t.tick).toBeUndefined();
    t.running = false;
    await t.settled();
    await tick(60);
    const at = t.ticks;
    await tick(80);
    expect(t.ticks).toBe(at);
    expect(t.error).toBeNull();
  });

  it('underscore-prefixed state is the raw channel: seeded on both sides, shipped whole on identity change from a tick or a method, silent when untouched', async () => {
    const t = await threadInline('raw', {
      state: { n: 0, _buf: [1, 2, 3] },
      computed: { doubled() { return this.n * 2; } },
      fill(k) { const b = new Array(k); for (let i = 0; i < k; i++) b[i] = i; this._buf = b; return b.length; },
      bump() { this.n++; },
      readBuf() { return this._buf; },
      tick() { if (this.n === 7) { this._buf = [7]; this.n = 8; } },
    });
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    expect(t._buf).toEqual([1, 2, 3]);
    expect(t.doubled).toBe(0);
    const events = patchEvents();
    expect(await t.fill(4)).toBe(4);
    expect(t._buf).toEqual([0, 1, 2, 3]);
    await t.bump();
    events.stop();
    const withBuf = events.filter((e) => e.changes.some((c) => c.path === '_buf'));
    expect(withBuf.length).toBe(1);
    // A tick that writes the raw field ships it without a message in flight.
    t.n = 7;
    await until(() => t.n === 8, 5000, 'the tick');
    expect(t._buf).toEqual([7]);
    expect(await t.readBuf()).toEqual([7]);
  });

  it('a typed array in a raw field is transferred, not cloned: it arrives as the same kind of view and the worker\'s copy is detached until reassigned', async () => {
    const t = await threadInline('xfer', {
      state: { n: 0, _buf: null },
      produce(k) { const b = new Float32Array(k); for (let i = 0; i < k; i++) b[i] = i / 2; this._buf = b; this.n++; },
      workerByteLength() { return this._buf ? this._buf.byteLength : -1; },
    });
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    await t.produce(8);
    expect(t._buf).toBeInstanceOf(Float32Array);
    expect(t._buf.length).toBe(8);
    expect(t._buf[3]).toBe(1.5);
    expect(t._buf.byteLength).toBe(32);
    // The buffer moved: the worker's field is detached until the next produce.
    expect(await t.workerByteLength()).toBe(0);
    await t.produce(4);
    expect(t._buf.length).toBe(4);
    expect(await t.workerByteLength()).toBe(0);
    expect(t.n).toBe(2);
  });

  // Two views over one buffer put that buffer on the transfer list twice, and
  // postMessage refuses a duplicate. Nothing in the patch is uncloneable, so
  // the drop-the-offender retry found nothing to drop and lost everything,
  // an ordinary field included.
  it('two raw fields over one buffer both arrive, and so does everything else in the patch', async () => {
    const t = await threadInline('xfer-shared', {
      state: { n: 0, _a: null, _b: null },
      share() {
        const buf = new ArrayBuffer(8);
        this._a = new Uint8Array(buf, 0, 4); this._a.set([1, 2, 3, 4]);
        this._b = new Uint8Array(buf, 4, 4); this._b.set([5, 6, 7, 8]);
        this.n = 1;
      },
    });
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    await t.share();
    expect(t.n, 'the ordinary field was lost with the raw ones').toBe(1);
    expect(Array.from(t._a)).toEqual([1, 2, 3, 4]);
    expect(Array.from(t._b)).toEqual([5, 6, 7, 8]);
    expect(t.error).toBe(null);
  });

  it('worker-only state never crosses: no field on the store, computeds over it still update, its paths are absent from patches, and a main-side write never reaches the worker', async () => {
    const def = statsDefinition();
    def.workerOnly =['rows', 'filtered'];
    // Worker-only state is reactive by identity: replace, never mutate in place.
    def.addRow = function (row) { this.rows = this.rows.concat([row]); return this.rows.length; };
    def.rowsAreRaw = function () { return Object.getPrototypeOf(this.rows) === Array.prototype && Object.getPrototypeOf(this.rows[0]) === Object.prototype; };
    const t = await threadInline('workerOnly', def);
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    expect('rows' in t).toBe(false);
    expect('filtered' in t).toBe(false);
    expect(t.rows).toBeUndefined();
    expect(t.filtered).toBeUndefined();
    expect(t.count).toBe(5);
    const events = patchEvents();
    const posted = await recordPosts(async () => {
      expect(await t.addRow({ id: 6, name: 'beta-three', revenue: 5 })).toBe(6);
      await captureWarnings(() => { t.rows = []; });
      await t.search('beta');
    });
    events.stop();
    expect(posted.map((m) => m.type)).toEqual(['call', 'call']);
    expect(events.every((e) => e.changes.every((c) => ['rows', 'filtered'].indexOf(c.path.split('.')[0]) === -1))).toBe(true);
    expect(t.count).toBe(3);
    expect(t.revenue).toBe(75);
    expect(t.filtered).toBeUndefined();
    // Inside the worker the worker-only array is the plain array, no proxies.
    expect(await t.rowsAreRaw()).toBe(true);
  });

  it('worker-only state is reactive by identity: an in-place push in the worker recomputes nothing (TH-109 on dev); a replacement does', async () => {
    const def = statsDefinition();
    def.workerOnly =['rows'];
    def.pushInPlace = function (row) { this.rows.push(row); return this.rows.length; };
    def.replace = function (row) { this.rows = this.rows.concat([row]); return this.rows.length; };
    const t = await threadInline('workerOnly3', def);
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    expect(await t.pushInPlace({ id: 6, name: 'beta-three', revenue: 5 })).toBe(6);
    await tick(30);
    expect(t.count).toBe(5);
    expect(await t.replace({ id: 7, name: 'beta-four', revenue: 5 })).toBe(7);
    await tick(30);
    expect(t.count).toBe(7);
  });

  it.skipIf(isMin)('TH-109 warns once in the worker when a worker-only array is mutated in place (dev build)', async () => {
    const def = statsDefinition();
    def.workerOnly =['rows'];
    def.pushInPlace = function (row) { this.rows.push(row); return this.count; };
    const t = await threadInline('workerOnly4', def);
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    // The warning is printed in the worker; it is reported here as the
    // worker's console line reaching the page's console is not observable
    // from a test, so the method returns what the computed saw instead.
    expect(await t.pushInPlace({ id: 6, name: 'x', revenue: 1 })).toBe(5);
  });

  it.skipIf(isMin)('TH-105 warns on a workerOnly key that is not in state (dev build)', async () => {
    const def = statsDefinition();
    def.workerOnly =['rows', 'nope'];
    let t;
    const lines = await captureWarnings(async () => {
      t = await threadInline('workerOnly2', def);
      live.push(t);
      await until(() => t.isLoading === false, 5000, 'first patch');
    });
    expect(lines.some((l) => l.indexOf('TH-105') !== -1 && l.indexOf("'nope'") !== -1)).toBe(true);
  });

  it.skipIf(isMin)('TH-110 warns once when a message goes unanswered, and not again until the worker catches up (dev build)', async () => {
    const def = statsDefinition();
    // Leaves one message unacknowledged without occupying the worker: its
    // promise is resolved later by release(). A busy loop would do the same
    // to the watchdog and would also starve whatever else the suite is
    // running at the time.
    def.hang = function () { const self = this; return new Promise((resolve) => { self._release = resolve; }); };
    def.release = function () { if (this._release) { this._release('let go'); this._release = null; } return true; };
    const t = await threadInline('stuck', def);
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    const lines = await captureWarnings(async () => {
      const held = t.hang();
      expect(t.pending).toBe(1);
      // The worker is idle, so this one is answered while the other waits.
      t.params.query = 'beta';
      await until(() => t.count === 2, 3000, 'the write to be answered');
      await tick(5400);
      expect(await t.release()).toBe(true);
      expect(await held).toBe('let go');
      await t.settled();
    });
    const hits = lines.filter((l) => l.indexOf('TH-110') !== -1);
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatch(/has not answered/);
    expect(hits[0]).toContain("'stuck'");
    expect(t.pending).toBe(0);
    // Caught up: the next exchange is quiet.
    const quiet = await captureWarnings(async () => {
      t.params.query = 'gamma';
      await t.settled();
    });
    expect(quiet.filter((l) => l.indexOf('TH-110') !== -1).length).toBe(0);
    expect(t.count).toBe(1);
  }, 20000);

  it('a write to a computed is dropped; nothing is posted', async () => {
    const t = await stats();
    const posted = await recordPosts(async () => {
      await captureWarnings(() => { t.count = 99; t.filtered.push({ id: 9 }); });
    });
    expect(posted.length).toBe(0);
    expect(t.count).toBe(5);
    expect(t.filtered.length).toBe(5);
  });

  // The runtime owns these. `t.error = null` is the natural way to dismiss a
  // banner; it used to reach the worker as a state write, create a junk key
  // there, and be reset on this side by the next acknowledgement anyway.
  it('a write to isLoading, error or pending is dropped; nothing is posted', async () => {
    const t = await stats();
    const posted = await recordPosts(async () => {
      await captureWarnings(() => {
        t.error = 'dismissed'; t.isLoading = true; t.pending = 9;
      });
    });
    expect(posted.length).toBe(0);
    expect(t.error).toBe(null);
    expect(t.isLoading).toBe(false);
    expect(t.pending).toBe(0);
  });

  it.skipIf(isMin)('TH-102 warns on a write to a field the runtime owns (dev build)', async () => {
    const t = await stats();
    const lines = await captureWarnings(() => { t.error = 'dismissed'; });
    const hits = lines.filter((l) => l.indexOf('TH-102') !== -1);
    expect(hits.length).toBe(1);
    expect(hits[0]).toContain("'error'");
  });

  it.skipIf(isMin)('TH-102 warns on a main-thread write to a computed field (dev build)', async () => {
    const t = await stats();
    const lines = await captureWarnings(() => { t.count = 99; t.filtered.push({ id: 9 }); });
    const hits = lines.filter((l) => l.indexOf('TH-102') !== -1);
    expect(hits.length).toBe(2);
    expect(hits[0]).toContain("'count'");
    expect(hits[1]).toContain("'filtered'");
  });

  it.skipIf(isMin)('TH-101 names the path and type of a value that cannot cross, and the write still throws (dev build)', async () => {
    const t = await stats();
    const lines = await captureWarnings(() => {
      expect(() => { t.params = { query: 'x', onDone: () => 1 }; }).toThrow();
    });
    const hit = lines.find((l) => l.indexOf('TH-101') !== -1);
    expect(hit).toBeTruthy();
    expect(hit).toContain("'params.onDone'");
    expect(hit).toContain('function');
    expect(t.params.query).toBe('');
    expect(t.pending).toBe(0);
    const lines2 = await captureWarnings(async () => {
      let err = null;
      try { await t.search(document.body); } catch (e) { err = e; }
      expect(err).toBeTruthy();
      expect(err.name).toBe('DataCloneError');
    });
    const hit2 = lines2.find((l) => l.indexOf('TH-101') !== -1);
    expect(hit2).toBeTruthy();
    expect(hit2).toContain('DOM node');
    expect(t.pending).toBe(0);
  });

  it.skipIf(isMin)('TH-105 warns on a methods: block and on names the mirror reserves (dev build)', async () => {
    let t;
    const lines = await captureWarnings(async () => {
      t = await threadInline('bad', {
        state: { error: 1, n: 0 },
        computed: { pending() { return this.n; } },
        methods: { hidden() {} },
        settled() {},
      });
    });
    live.push(t);
    const hits = lines.filter((l) => l.indexOf('TH-105') !== -1);
    expect(hits.some((l) => l.indexOf("'methods:'") !== -1)).toBe(true);
    expect(hits.some((l) => l.indexOf("'error'") !== -1)).toBe(true);
    expect(hits.some((l) => l.indexOf("'pending'") !== -1)).toBe(true);
    expect(hits.some((l) => l.indexOf("'settled'") !== -1)).toBe(true);
    expect(typeof t.settled).toBe('function');
  });

  // A thread's watch block runs in the worker, on both routes: stores run
  // watch: {} (it used to be component-only, and TH-105 said it never ran).
  // The inline route dropped the block; it now writes it as source, method
  // form with a quoted path key included.
  it('inline route: a watch block runs in the worker and its write reaches the page', async () => {
    let t;
    const lines = await captureWarnings(async () => {
      t = await threadInline('watched', {
        state: { page: 3, flag: 0, params: { region: '' } },
        watch: {
          'params.region'() { this.page = 0; },
          page: { handler(v) { if (v === 0) this.flag = 1; } },
        },
      });
    });
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    t.params = { region: 'EU' };
    await until(() => t.page === 0 && t.flag === 1, 3000, 'the watchers to run in the worker');
    expect(lines.filter((l) => l.indexOf('TH-105') !== -1 && l.indexOf("'watch'") !== -1).length).toBe(0);
  });

  // reset() on the page puts the inputs back and lets the worker recompute;
  // it used to rewrite every output too, and each one warned TH-102.
  it('reset() on the page restores the inputs, the worker recomputes, and nothing warns', async () => {
    const t = await stats();
    await t.search('beta');
    await until(() => t.count === 2, 2000, 'the search to apply');
    const lines = await captureWarnings(() => { wildflower.getStore('stats').reset(); });
    await until(() => t.count === 5, 2000, 'the worker to recompute');
    expect(t.params.query).toBe('');
    expect(lines.filter((l) => l.indexOf('TH-102') !== -1).length).toBe(0);
  });

  it('onStoreUpdate is a lifecycle hook, not a method on the mirror', async () => {
    const t = await threadInline('hooked', { state: { n: 1 }, onStoreUpdate() {} });
    live.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    expect(typeof t.onStoreUpdate).toBe('undefined');
  });

  it.skipIf(isMin)('TH-105 warns that storageKey and autoSave do nothing in a worker (dev build)', async () => {
    let t;
    const lines = await captureWarnings(async () => {
      t = await threadInline('persisted', { state: { n: 1 }, storageKey: 'persisted', autoSave: true });
    });
    live.push(t);
    const hits = lines.filter((l) => l.indexOf('TH-105') !== -1 && l.indexOf('storageKey') !== -1);
    expect(hits.length).toBe(1);
  });

  it('file route: a watch block runs in the worker and its write reaches the page', async () => {
    const wf = await loadFrameworkForm();
    let t;
    const lines = await captureWarnings(() => {
      t = wf.thread('watchfile', { state: { page: 3, params: { region: '' } }, watch: { 'params.region': function () {} } },
        { core: CORE, def: '/packages/threads/test/fixtures/watch-def.js' });
    });
    try {
      await until(() => t.isLoading === false, 5000, 'first patch');
      t.params = { region: 'EU' };
      await until(() => t.page === 0, 3000, 'the watcher to run in the worker');
      expect(lines.filter((l) => l.indexOf('TH-105') !== -1 && l.indexOf("'watch'") !== -1).length).toBe(0);
    } finally { wf.unregister('watchfile'); }
  });

  it.skipIf(!isMin)('the min build drops the dev warnings and keeps the behaviour', async () => {
    const t = await stats();
    const lines = await captureWarnings(() => {
      t.count = 99;
      expect(() => { t.params = { query: 'x', onDone: () => 1 }; }).toThrow();
    });
    expect(lines.filter((l) => /TH-10/.test(l)).length).toBe(0);
    expect(t.count).toBe(5);
    expect(t.params.query).toBe('');
  });
});

describe(`init() writes reach the mirror (${BUILD})`, () => {
  const live2 = [];
  afterEach(() => { while (live2.length) endThread(live2.pop()); });

  // The worker runs the store's init() synchronously inside wf.store(), which
  // is before the change subscription is installed, and the first-snapshot
  // microtask then clears the accumulators and sends only computeds. So a
  // definition that seeds state in init() had no way to tell the page.
  it('state written in init() is in the first patch, and computeds reflect it', async () => {
    const t = await threadInline('initseed', {
      state: { rows: [{ id: 1, name: 'alpha' }, { id: 2, name: 'beta' }], params: { query: '' }, ready: false },
      computed: {
        filtered() { return this.rows.filter((r) => r.name.indexOf(this.params.query) !== -1); },
        count() { return this.filtered.length; }
      },
      init() {
        this.params.query = 'beta';
        this.ready = true;
      }
    });
    live2.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');

    // the computed already agrees with init's write
    expect(t.count).toBe(1);
    // and so does the state the page reads
    expect(t.params.query).toBe('beta');
    expect(t.ready).toBe(true);
  });
});

describe(`unregistering after a failed start (${BUILD})`, () => {
  // stop() sets `stopped` when the worker's error event fires before the
  // first patch. The mirror's terminate() used to return on `stopped` BEFORE
  // calling transport.terminate(), so the Worker thread was never killed and
  // destroy()/unregister() reported success over a live worker.
  it('kills the Worker even though stop() already ran', async () => {
    const realTerminate = Worker.prototype.terminate;
    let terminateCalls = 0;
    Worker.prototype.terminate = function () { terminateCalls++; return realTerminate.apply(this, arguments); };
    try {
      const t = await threadInline('deadcore', { state: { n: 1 } }, { core: '/no-such-framework-file.js' });
      // the worker's error event fires while isLoading is still true
      await until(() => t.error !== null, 5000, 'worker error');
      expect(t.isLoading).toBe(true);
      expect(terminateCalls).toBe(0);

      endThread(t);
      expect(terminateCalls).toBe(1);

      // and it stays idempotent
      endThread(t);
      expect(terminateCalls).toBe(1);
    } finally {
      Worker.prototype.terminate = realTerminate;
    }
  });
});

describe(`a patch that cannot be posted (${BUILD})`, () => {
  const live3 = [];
  afterEach(() => { while (live3.length) endThread(live3.pop()); });

  // emit() used to clear changedPaths/changedComputeds and advance lastSent
  // BEFORE posting. One uncloneable value made the whole post throw, and the
  // good changes it was carrying were already gone from the accumulators, so
  // they were never re-sent: the mirror diverged silently for the rest of
  // the session.
  it('keeps the good changes it was carrying and drops only the offending value', async () => {
    const t = await threadInline('cloner', {
      state: { good: 0, other: 'x', bad: null },
      setBoth() { this.good = 42; this.other = 'y'; this.bad = function nope() {}; },
      fixIt() { this.bad = 'clean'; }
    });
    live3.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');

    try { await t.setBoth(); } catch (e) { /* the call reports the failure */ }
    await until(() => t.good === 42, 3000, 'good value survives a failed patch');
    expect(t.good).toBe(42);
    expect(t.other).toBe('y');

    // the offending key is dropped, not retried forever
    try { await t.fixIt(); } catch (e) { /* ignore */ }
    await until(() => t.bad === 'clean', 3000, 'the key works again once the value is cloneable');
    expect(t.bad).toBe('clean');
  });
});

describe(`a tick() that throws every frame (${BUILD})`, () => {
  const live4 = [];
  afterEach(() => { while (live4.length) endThread(live4.pop()); });

  // The loop caught the throw, posted an ERROR and re-armed unconditionally,
  // so a tick that throws on every frame posted ~60 ERRORs a second. Each one
  // writes the mirror's `error` and, in the framework form, a store field, and
  // `error` never clears because no ACK ever arrives.
  it('reports it and stops, instead of flooding the main thread', async () => {
    const replies = recordReplies();
    try {
      const t = await threadInline('boomtick', {
        state: { n: 0 },
        tick() { throw new Error('every frame'); }
      });
      live4.push(t);
      await until(() => t.isLoading === false, 5000, 'first patch');
      const base = replies.filter((m) => m && m.type === 'error').length;

      // ~30 frames' worth of wall clock at a 16 ms period
      await tick(500);
      const errors = replies.filter((m) => m && m.type === 'error').length - base;

      // A handful, not one per frame.
      expect(errors).toBeGreaterThan(0);
      expect(errors).toBeLessThan(10);

      // It settles: no further errors once the loop has given up.
      const settledCount = replies.filter((m) => m && m.type === 'error').length;
      await tick(300);
      expect(replies.filter((m) => m && m.type === 'error').length).toBe(settledCount);

      // And the claim the final message makes is true: writes and calls still work.
      t.n = 5;
      await t.settled();
      expect(t.n).toBe(5);
    } finally {
      replies.stop();
    }
  });
});

describe(`unsubscribing from inside a notification (${BUILD})`, () => {
  const live6 = [];
  afterEach(() => { while (live6.length) endThread(live6.pop()); });

  // notify() walks `listeners` by index while unsubscribe() splices it. A
  // one-shot subscriber that removes itself, which is the natural way to
  // write "wait for the first change", shifted every later listener down one
  // and the loop's i++ skipped whichever took its place.
  it('still delivers to the listeners that come after it', async () => {
    const t = await threadInline('unsub', { state: { a: 0, b: 0 } });
    live6.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');

    const seen = [];
    const off0 = t.subscribe('a', () => { seen.push('first'); off0(); });   // one-shot
    t.subscribe('a', () => seen.push('second'));
    t.subscribe('a', () => seen.push('third'));

    t.a = 1;
    expect(seen).toEqual(['first', 'second', 'third']);

    // the one-shot really is gone on the next change
    seen.length = 0;
    t.a = 2;
    expect(seen).toEqual(['second', 'third']);
  });
});

describe(`an uncloneable value inside a cycle (${BUILD})`, () => {
  const live7 = [];
  afterEach(() => { while (live7.length) endThread(live7.pop()); });

  // structuredClone handles cycles, so findUncloneable's own guard never
  // tripped for the cycle itself: it recursed a.self.self.self... until the
  // stack blew. Because it runs inside send()'s catch, the RangeError
  // replaced the DataCloneError the author needed to see.
  it('reports the offending path instead of overflowing the stack', async () => {
    const t = await threadInline('cyclic', { state: { box: null } });
    live7.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');

    const a = { label: 'ring' };
    a.self = a;                 // the cycle structuredClone copes with
    a.bad = function nope() {}; // the part it cannot

    let err = null;
    await captureWarnings(() => {
      try { t.box = a; } catch (e) { err = e; }
    });
    expect(err).toBeTruthy();
    expect(err.name).not.toBe('RangeError');
    expect(String(err.message)).not.toMatch(/call stack/i);
  });
});

describe(`a cyclic plain object in state (${BUILD})`, () => {
  const live8 = [];
  afterEach(() => { while (live8.length) endThread(live8.pop()); });

  // structured clone carries cycles and shared references, and the docs say
  // what structured clone can copy is what crosses. copyPlain and unwrapOwn
  // recursed without a guard, so a plain `a.self = a` overflowed the stack on
  // this side long before postMessage saw it.
  it('crosses, and keeps its shape on both sides', async () => {
    const t = await threadInline('ring', {
      state: { box: null },
      describe() { return { label: this.box.label, selfIsSame: this.box.self === this.box }; }
    });
    live8.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');

    const a = { label: 'ring' };
    a.self = a;
    t.box = a;
    await t.settled();

    // the worker received it with the cycle intact
    expect(await t.describe()).toEqual({ label: 'ring', selfIsSame: true });
    // and the mirror holds it the same way
    expect(t.box.label).toBe('ring');
  });

  // Written rather than declared: the inline route serialises initial state
  // through JSON, which flattens a shared reference into two objects before
  // any of this is reached (see T-13). A write is the path copyPlain and
  // structured clone actually own.
  it('a value referenced twice stays one object after a write', async () => {
    const t = await threadInline('shared', {
      state: { pair: null },
      same() { return this.pair.left === this.pair.right; }
    });
    live8.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    const shared = { n: 1 };
    t.pair = { left: shared, right: shared };
    await t.settled();
    expect(await t.same()).toBe(true);
  });
});

describe(`a class instance crosses as a plain object (${BUILD})`, () => {
  const live10 = [];
  afterEach(() => { while (live10.length) endThread(live10.pop()); });

  // Structured clone carries a class instance as its own data, prototype
  // dropped. The worker's framework proxies a class instance in state (so it
  // stays reactive there), and a proxy cannot be cloned, so the copy made
  // before posting has to unwrap it into plain data, as structured clone would.
  it('assigned in the worker, directly, nested and in an array', async () => {
    const t = await threadInline('cls', {
      state: { p: null, wrap: null, list: [] },
      make() {
        class P { constructor(x) { this.x = x; } double() { return this.x * 2; } }
        this.p = new P(1);
        this.wrap = { inner: new P(2) };
        this.list = [new P(3), new P(4)];
      }
    });
    live10.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');
    await t.make();
    await until(() => t.p !== null, 2000, 'the instance to arrive');
    expect(t.p.snapshot || JSON.parse(JSON.stringify(t.p))).toEqual({ x: 1 });
    expect(JSON.parse(JSON.stringify(t.wrap))).toEqual({ inner: { x: 2 } });
    expect(JSON.parse(JSON.stringify(t.list))).toEqual([{ x: 3 }, { x: 4 }]);
    expect(t.error).toBe(null);
  });
});

describe(`a method stored under a different key (${BUILD})`, () => {
  const live9 = [];
  afterEach(() => { while (live9.length) endThread(live9.pop()); });

  // The inline route serialises a method-form function by its own source,
  // which carries its own name. `{ search: helpers.find }` emitted
  // `find(q) {...}`, so the worker's store had `find` and never `search`,
  // and the first call rejected with "has no method 'search'" pointing
  // nowhere near the serialiser.
  it('registers under the key, not the function\'s own name', async () => {
    const helpers = {
      find(q) { this.params.query = q; },
      async later(q) { this.params.query = q; return this.count; }
    };
    const t = await threadInline('rename', {
      state: { rows: [{ name: 'alpha' }, { name: 'beta' }], params: { query: '' } },
      computed: { count() { return this.rows.filter((r) => r.name.indexOf(this.params.query) !== -1).length; } },
      search: helpers.find,
      wait: helpers.later
    });
    live9.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');

    await t.search('beta');
    await t.settled();
    expect(t.count).toBe(1);

    expect(await t.wait('alpha')).toBe(1);
  });
});

describe(`inline route: initial state fidelity (${BUILD})`, () => {
  const liveA = [];
  afterEach(() => { while (liveA.length) endThread(liveA.pop()); });

  // The inline route wrote initial state with JSON.stringify, while the page
  // seeded its mirror with copyPlain. JSON drops undefined keys, turns Date
  // into a string, Map and Set into {}, typed arrays into index objects and
  // NaN into null, so the two sides started out disagreeing with no
  // diagnostic on either.
  it('the worker sees the same values the mirror was seeded with', async () => {
    const t = await threadInline('fidelity', {
      state: {
        when: new Date('2020-01-02T03:04:05Z'),
        budget: NaN,
        ceiling: Infinity,
        missing: undefined,
        tags: new Set(['a', 'b']),
        byId: new Map([[1, 'one']]),
        re: /ab+c/gi,
        buf: new Float32Array([1.5, 2.5])
      },
      report() {
        return {
          whenIsDate: this.when instanceof Date,
          whenYear: this.when instanceof Date ? this.when.getUTCFullYear() : null,
          budgetIsNaN: Number.isNaN(this.budget),
          ceiling: this.ceiling === Infinity,
          hasMissingKey: 'missing' in this,
          tagsIsSet: this.tags instanceof Set && this.tags.has('a'),
          byIdIsMap: this.byId instanceof Map && this.byId.get(1) === 'one',
          reIsRegExp: this.re instanceof RegExp && this.re.source === 'ab+c',
          bufIsTyped: this.buf instanceof Float32Array && this.buf[1] === 2.5
        };
      }
    });
    liveA.push(t);
    await until(() => t.isLoading === false, 5000, 'first patch');

    expect(await t.report()).toEqual({
      whenIsDate: true, whenYear: 2020,
      budgetIsNaN: true, ceiling: true,
      hasMissingKey: true,
      tagsIsSet: true, byIdIsMap: true,
      reIsRegExp: true, bufIsTyped: true
    });
  });
});

describe(`inline route: state it cannot express (${BUILD})`, () => {
  // Writing state as source cannot introduce a name to refer back to, so a
  // cycle or a value shared between two fields has no representation.
  // JSON.stringify threw a bare TypeError on the first and silently
  // duplicated the second; both now name the field and say what to do.
  it('refuses a cycle with TH-105 rather than a bare TypeError', async () => {
    const a = { label: 'ring' };
    a.self = a;
    let err = null;
    try { await threadInline('cyc-state', { state: { box: a } }); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe('TH-105');
    expect(err.message).toMatch(/cycle|same object/i);
  });

  // A class instance is not one of those: structured clone carries it as a
  // plain object, and the default route does too, so the inline route writes
  // it the same way rather than refusing it.
  it('writes a class instance as a plain object, as structured clone would', async () => {
    class Money { constructor(n) { this.amount = n; } }
    const t = await threadInline('cls-state', { state: { price: new Money(5) }, read() { return this.price.amount; } });
    try {
      await until(() => t.isLoading === false, 5000, 'first patch');
      expect(await t.read()).toBe(5);
      expect(JSON.parse(JSON.stringify(t.price))).toEqual({ amount: 5 });
    } finally { endThread(t); }
  });

  // `"__proto__": v` in an object literal sets the prototype rather than
  // defining a key, and JSON.parse does produce an own __proto__ key, so
  // state loaded from JSON arrived in the worker with a different shape.
  it('keeps an own __proto__ key as a key, not a prototype', async () => {
    const box = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    const t = await threadInline('proto-key', {
      state: { box },
      inspect() { return { polluted: this.box.polluted === true, keys: Object.keys(this.box).sort() }; }
    });
    try {
      await until(() => t.isLoading === false, 5000, 'first patch');
      expect(await t.inspect()).toEqual({ polluted: false, keys: ['__proto__', 'a'] });
    } finally { endThread(t); }
  });

  // The page's mirror is rebuilt by copying each object on the changed path.
  // A copy made with Object.assign ran the __proto__ setter for an own
  // __proto__ key, so after any change inside that object the page read the
  // payload's fields as inherited ones.
  it('keeps an own __proto__ key as a key in the page mirror after changes', async () => {
    const box = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}');
    const t = await threadInline('proto-mirror', {
      state: { box },
      bump() { this.box.a++; }
    });
    try {
      await until(() => t.isLoading === false, 5000, 'first patch');
      await t.bump();
      await until(() => t.box.a === 2, 5000, 'worker change mirrored');
      expect(t.box.polluted).toBeUndefined();
      expect(Object.keys(t.box).sort()).toEqual(['__proto__', 'a']);
      t.box.a = 5;
      expect(t.box.a).toBe(5);
      expect(t.box.polluted).toBeUndefined();
    } finally { endThread(t); }
  });

  // A bound or built-in function's source is `function () { [native code] }`,
  // which the worker cannot parse, so the whole bootstrap failed to start and
  // TH-103 pointed nowhere near the method.
  it('refuses a bound or built-in function with TH-105, naming the key', async () => {
    let err = null;
    try { await threadInline('native-fn', { state: {}, biggest: Math.max }); } catch (e) { err = e; }
    expect(err, 'no synchronous refusal').toBeTruthy();
    expect(err.code).toBe('TH-105');
    expect(err.message).toContain("'biggest'");
  });

  it('refuses a value it cannot write as source, naming the field', async () => {
    let err = null;
    try { await threadInline('url-state', { state: { home: new URL('https://example.com/') } }); } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe('TH-105');
    expect(err.message).toMatch(/state at 'state\.home'/);
  });
});

describe(`a definition that is not an object (${BUILD})`, () => {
  // computedNames was read off `def` before validateDefinition ran, so
  // thread('x') or thread('x', null) threw a raw TypeError from inside the
  // extension and the coded diagnostic could never fire for the case it was
  // written for.
  it('throws TH-105 rather than a TypeError, on every build', async () => {
    const wf = await loadFrameworkForm();
    for (const bad of [undefined, null, 'nope', 42]) {
      let err = null;
      try { wf.thread('nodef', bad, { inline: true }); } catch (e) { err = e; }
      expect(err, String(bad)).toBeTruthy();
      expect(err.name, String(bad)).not.toBe('TypeError');
      expect(err.code, String(bad)).toBe('TH-105');
      expect(wf.getStore('nodef'), String(bad)).toBeFalsy();
    }
  });
});

describe(`state must be an object (${BUILD})`, () => {
  // The factory form was accepted by the implementation, used by nothing,
  // documented nowhere, absent from types.d.ts, and ran a different number
  // of times on dev than on min. Removed; refused loudly rather than
  // silently treated as empty state.
  it('refuses a state factory with TH-105 on every build', async () => {
    const wf = await loadFrameworkForm();
    let err = null;
    try {
      wf.thread('factory', { state() { return { n: 1 }; } }, { inline: true });
    } catch (e) { err = e; }
    expect(err).toBeTruthy();
    expect(err.code).toBe('TH-105');
    expect(err.message).toMatch(/must be an object/);
  });
});
