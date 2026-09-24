/**
 * Ordering and bookkeeping under load, against the built file.
 *
 * - a burst of writes lands in order and patches arrive in ascending seq
 * - settled() under backpressure resolves exactly when the sequence numbers
 *   sent before the call are acknowledged, not later
 * - a model-based suite in the style of data-query-writes-model.test.js:
 *   seeded random sequences of local writes (including array mutators on
 *   the mirror), method calls and settle points, checked against an oracle
 *   that applies the same messages in sequence order. At EVERY step:
 *   pending equals sent minus replies seen (bookkeeping bounds), and a path
 *   with a local write in flight shows that write (the later writer owns
 *   the field; a patch from an earlier message never rolls it back). After
 *   each settle: the whole mirror, computeds included, equals the oracle.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { threadInline, endThread, statsDefinition, until, recordReplies, rng, BUILD } from './helpers.js';

const live = [];
afterEach(() => { while (live.length) endThread(live.pop()); });

function patchSeqs() {
  const seqs = [];
  const h = (e) => seqs.push(e.detail.seq);
  document.addEventListener('thread:patch', h);
  seqs.stop = () => document.removeEventListener('thread:patch', h);
  return seqs;
}

describe(`ordering (${BUILD})`, () => {
  it('a burst of 300 writes lands in order; patches arrive in ascending seq; the mirror matches the last write', async () => {
    const t = await threadInline('stats', statsDefinition());
    live.push(t);
    await until(() => t.isLoading === false);
    const seqs = patchSeqs();
    // Every write changes its field: the store forwards changes, and a write
    // of the value a field already holds sends nothing.
    for (let i = 0; i < 300; i++) {
      t.params.query = i % 2 ? 'beta' : 'q' + i;
      t.evals = i + 1;
    }
    expect(t.pending).toBe(600);
    await t.settled();
    seqs.stop();
    expect(t.pending).toBe(0);
    expect(t.params.query).toBe('beta');
    expect(t.evals).toBe(300);
    expect(t.count).toBe(2);
    // Input coalescing: a burst already queued when the worker drains is
    // applied in one pass, so it produces few patches, possibly one.
    expect(seqs.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });

  it('input coalescing: writes that arrive while the worker is busy are applied together, one recompute for the newest input, every message acknowledged', async () => {
    const def = statsDefinition();
    def.computed.filteredEvals = function () { return this.filtered.length * 0; };
    def.busy = function (ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { /* hold the worker */ } return this.params.query; };
    const t = await threadInline('stats', def);
    live.push(t);
    await until(() => t.isLoading === false);
    const seqs = patchSeqs();
    // The call holds the worker; the five writes queue behind it and drain
    // as one batch after it returns.
    const held = t.busy(80);
    for (let i = 1; i <= 5; i++) t.params.query = 'q' + i;
    expect(t.pending).toBe(6);
    expect(await held).toBe('');
    await t.settled();
    seqs.stop();
    expect(t.pending).toBe(0);
    expect(t.params.query).toBe('q5');
    expect(t.count).toBe(0);
    // One patch for the call (nothing changed) at most, one for the burst.
    expect(seqs.length).toBeLessThanOrEqual(2);
  });

  it('settled() under backpressure resolves when the sequence numbers sent before it are acknowledged, with later ones still pending', async () => {
    const replies = recordReplies();   // before the thread exists: it wraps the handler the main half assigns at spawn
    const t = await threadInline('stats', statsDefinition());
    live.push(t);
    await until(() => t.isLoading === false);
    try {
      for (let i = 1; i <= 200; i++) t.params.query = 'a' + i;
      const p = t.settled();
      for (let i = 201; i <= 400; i++) t.params.query = 'b' + i;
      expect(t.pending).toBe(400);
      await p;
      // The ack for the 200th write resolved it; the continuation runs before
      // the next message is delivered, so exactly 200 are still pending.
      expect(t.pending).toBe(200);
      const acked = replies.filter((m) => m.type === 'ack').map((m) => m.seq);
      expect(Math.max(...acked)).toBe(200);
      await t.settled();
      expect(t.pending).toBe(0);
      expect(t.params.query).toBe('b400');
    } finally {
      replies.stop();
    }
  });

  it('a patch from an earlier message never rolls back a later local write to the same path', async () => {
    const t = await threadInline('stats', statsDefinition());
    live.push(t);
    await until(() => t.isLoading === false);
    const p = t.search('gamma');      // seq 1: the worker writes params.query and patches it back
    t.params.query = 'delta';         // seq 2: the local write owns the path until acknowledged
    expect(t.params.query).toBe('delta');
    await p;
    expect(t.params.query).toBe('delta');
    await t.settled();
    expect(t.params.query).toBe('delta');
    expect(t.count).toBe(1);
    expect(await t.echoSelf()).toEqual({ count: 1, query: 'delta' });
  });

  it('a write an async method makes after its await lands after an intervening local write, on both sides', async () => {
    const t = await threadInline('stats', statsDefinition());
    live.push(t);
    await until(() => t.isLoading === false);
    const p = t.later('gamma', 30);   // seq 1: writes params.query 30 ms later, in real time after seq 2
    t.params.query = 'delta';         // seq 2
    expect(t.params.query).toBe('delta');
    await p;
    expect(t.params.query).toBe('gamma');
    expect(await t.echoSelf()).toEqual({ count: 1, query: 'gamma' });
  });

  const modelDefinition = () => ({
    state: { a: 0, b: 1, obj: { x: 0, y: 0 }, list: [] },
    computed: {
      sum() { return this.a + this.b + this.obj.x; },
      len() { return this.list.length; },
      total() { return this.list.reduce((s, v) => s + v, 0); },
    },
    add(n) { this.a += n; return this.a; },
    mul(k) { this.b *= k; },
    pushItem(v) { this.list.push(v); },
    setX(v) { this.obj.x = v; },
    bumpY() { this.obj.y++; },
    // Writes from a microtask continuation: emitted as an unattributed (seq 0)
    // patch by the worker, and applied before the next message arrives, so
    // the oracle can treat it as in sequence order.
    async addLater(n) { await Promise.resolve(); this.a += n; },
    // Holds the worker so the messages sent behind it queue up and drain as
    // one batch, whose patch is posted before the batch's acknowledgements.
    hold(ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { /* busy */ } },
  });

  it('a patch that replaces an object still applies its other fields while a later local write to one of them is in flight', async () => {
    const t = await threadInline('model', modelDefinition());
    live.push(t);
    await until(() => t.isLoading === false);
    t.obj = { x: 1, y: 1 };           // seq 1: a local write of the whole object
    t.bumpY();                        // seq 2: the worker sets obj.y to 2; seq 1 and 2 drain as one batch
    // Hold the page so the batch's patch is waiting in its queue when the
    // next write is made.
    const t0 = Date.now();
    while (Date.now() - t0 < 150) { /* busy */ }
    t.obj.x = 5;                      // seq 3: owns obj.x, and only obj.x, from here on
    await t.settled();
    expect(JSON.parse(JSON.stringify(t.obj))).toEqual({ x: 5, y: 2 });
  });

  // The oracle is the worker: it applies messages in sequence order, with
  // the values the main side actually posted.
  function oracleApply(o, op) {
    switch (op.kind) {
      case 'setA': o.a = op.value; break;
      case 'setX': o.obj.x = op.value; break;
      case 'setList': o.list = op.value.slice(); break;
      case 'setObj': o.obj = Object.assign({}, op.value); break;
      case 'add': case 'addLater': o.a += op.value; break;
      case 'mul': o.b *= op.value; break;
      case 'pushItem': o.list.push(op.value); break;
      case 'setXm': o.obj.x = op.value; break;
      case 'bumpY': o.obj.y++; break;
      case 'hold': break;
      default: throw new Error('unknown op ' + op.kind);
    }
  }
  function expected(o) {
    return {
      a: o.a, b: o.b, obj: o.obj, list: o.list,
      sum: o.a + o.b + o.obj.x, len: o.list.length, total: o.list.reduce((s, v) => s + v, 0),
    };
  }
  function view(t) {
    return {
      a: t.a, b: t.b, obj: JSON.parse(JSON.stringify(t.obj)), list: JSON.parse(JSON.stringify(t.list)),
      sum: t.sum, len: t.len, total: t.total,
    };
  }

  async function runSeed(seed, bursts) {
    const next = rng(seed);
    const pick = (n) => Math.floor(next() * n);
    // The invariants also hold between replies, where a batch's patch has
    // landed and its acks have not. A throw inside the message handler would
    // not fail the test cleanly, so violations there are collected and
    // asserted at the next settle point.
    const betweenReplies = [];
    let checkAfterReply = null;
    const replies = recordReplies((msg) => {
      if (!checkAfterReply) return;
      try { checkAfterReply(`on ${msg.type} ${msg.seq}`); } catch (e) { betweenReplies.push(e.message); }
    });
    // One store per seed: wildflower.thread hands back an existing store
    // registered under the same name.
    const t = await threadInline('model' + seed, modelDefinition());
    live.push(t);
    try {
      await until(() => t.isLoading === false);
      const oracle = { a: 0, b: 1, obj: { x: 0, y: 0 }, list: [] };
      const trace = [];
      let sent = 0;
      const inflight = [];   // local writes not yet acknowledged: { seq, path, value }
      const promises = [];
      const check = (label) => {
        const ctx = `seed ${seed} ${label}; trace ${JSON.stringify(trace.slice(-8))}`;
        const repliesSeen = replies.filter((m) => m.type === 'ack' || m.type === 'error');
        expect(t.pending, `pending bookkeeping: ${ctx}`).toBe(sent - repliesSeen.length);
        const ackedSeqs = new Set(repliesSeen.map((m) => m.seq));
        // A local write stops owning its path when it is acknowledged, or when
        // a patch from a LATER message has written the same path (or an
        // ancestor or descendant of it): the later writer owns the field. The
        // worker posts a drained batch's patch, stamped with the batch's last
        // seq, before the batch's acks, so that patch can land while an earlier
        // local write in the batch is still unacknowledged, and it is right to
        // apply. Unattributed (seq 0) patches supersede nothing.
        const overlaps = (p, q) => p === q || p.startsWith(q + '.') || q.startsWith(p + '.');
        const superseded = (w) => replies.some((m) => m.type === 'patch' && m.seq > w.seq
          && (m.changes || []).some((c) => overlaps(c.path, w.path)));
        for (let i = inflight.length - 1; i >= 0; i--) {
          if (ackedSeqs.has(inflight[i].seq) || superseded(inflight[i])) inflight.splice(i, 1);
        }
        // A path with a local write in flight shows that write: overlay the
        // in-flight writes in sequence order (a later write to an ancestor or
        // descendant path wins) and compare at each written path.
        const at = (obj, path) => path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
        const snap = JSON.parse(JSON.stringify({ a: t.a, b: t.b, obj: t.obj, list: t.list }));
        const overlay = JSON.parse(JSON.stringify(snap));
        inflight.forEach((w) => {
          const parts = w.path.split('.');
          let cur = overlay;
          for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}; cur = cur[parts[i]]; }
          cur[parts[parts.length - 1]] = JSON.parse(JSON.stringify(w.value));
        });
        inflight.forEach((w) => {
          expect(JSON.stringify(at(snap, w.path)), `local write to ${w.path} owns the field: ${ctx}`).toBe(JSON.stringify(at(overlay, w.path)));
        });
      };
      checkAfterReply = check;
      for (let b = 0; b < bursts; b++) {
        const n = 1 + pick(25);
        for (let i = 0; i < n; i++) {
          const kind = ['setA', 'setX', 'setList', 'setObj', 'add', 'mul', 'pushItem', 'setXm', 'bumpY', 'pushMirror', 'addLater', 'hold'][pick(12)];
          // The store forwards changes: writing the value a field already
          // shows sends nothing, so the model does not issue that write.
          if (kind === 'setA' || kind === 'setX') {
            const value = pick(kind === 'setA' ? 1000 : 50);
            if ((kind === 'setA' ? t.a : t.obj.x) === value) { trace.push(kind + '=same'); continue; }
            const op = { kind, value };
            if (kind === 'setA') t.a = value; else t.obj.x = value;
            sent++;
            inflight.push({ seq: sent, path: kind === 'setA' ? 'a' : 'obj.x', value });
            oracleApply(oracle, op);
            trace.push(kind);
            check(`after ${kind}`);
            if (next() < 0.15) await new Promise((r) => setTimeout(r, 0));
            continue;
          }
          let op;
          if (kind === 'pushMirror') {
            const v = pick(100);
            t.list.push(v);
            op = { kind: 'setList', value: JSON.parse(JSON.stringify(t.list)) };
          } else if (kind === 'setList') { op = { kind, value: [pick(9), pick(9), pick(9)].slice(0, 1 + pick(3)) }; t.list = op.value.slice(); }
          else if (kind === 'setObj') { op = { kind, value: { x: pick(50), y: pick(50) } }; t.obj = Object.assign({}, op.value); }
          else if (kind === 'add') { op = { kind, value: pick(10) }; promises.push(t.add(op.value)); }
          else if (kind === 'addLater') { op = { kind, value: pick(10) }; promises.push(t.addLater(op.value)); }
          else if (kind === 'mul') { op = { kind, value: 1 + pick(3) }; promises.push(t.mul(op.value)); }
          else if (kind === 'pushItem') { op = { kind, value: pick(100) }; promises.push(t.pushItem(op.value)); }
          else if (kind === 'setXm') { op = { kind, value: pick(50) }; promises.push(t.setX(op.value)); }
          else if (kind === 'bumpY') { op = { kind }; promises.push(t.bumpY()); }
          else if (kind === 'hold') { op = { kind, value: 2 + pick(8) }; promises.push(t.hold(op.value)); }
          sent++;
          const isLocal = kind === 'pushMirror' || kind === 'setList' || kind === 'setObj';
          if (isLocal) {
            const path = { setList: 'list', setObj: 'obj' }[op.kind];
            inflight.push({ seq: sent, path, value: op.value });
          }
          oracleApply(oracle, op);
          trace.push(kind);
          check(`after ${kind}`);
          if (next() < 0.15) await new Promise((r) => setTimeout(r, 0));
        }
        await t.settled();
        check('after settle');
        expect(betweenReplies, `seed ${seed} burst ${b}: invariants between replies`).toEqual([]);
        expect(t.pending, `seed ${seed} burst ${b} drained`).toBe(0);
        expect(view(t), `seed ${seed} burst ${b} mirror equals oracle; trace ${JSON.stringify(trace.slice(-30))}`).toEqual(expected(oracle));
      }
      await Promise.all(promises);
      expect(replies.filter((m) => m.type === 'error').length, `seed ${seed}: no worker errors`).toBe(0);
      return trace.length;
    } finally {
      replies.stop();
    }
  }

  it('model: seeded random writes, mirror mutators, calls and settle points agree with the oracle (3 seeds)', async () => {
    let ops = 0;
    for (const seed of [11, 22, 33]) ops += await runSeed(seed, 12);
    console.log(`[threads model] ${ops} operations across 3 seeds (${BUILD})`);
    expect(ops).toBeGreaterThan(150);
  });
});
