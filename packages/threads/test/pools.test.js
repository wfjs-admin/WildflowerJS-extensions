/**
 * Pools in a thread. A thread takes a store definition, and a store may
 * declare data-only pools, so a thread may too. The pool lives in the worker:
 * its methods and tick step it there, and a computed over its length reaches
 * the page like any other computed. The entities themselves stay in the
 * worker; copying them to the page every frame is the cost a thread exists
 * to avoid, so the page's store has no pools.
 *
 * Needs a core tier with pools (mini-pool, lite, core, spa, full).
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadFrameworkForm, until, tick, captureWarnings, isMin, CORE_TIER } from './helpers.js';

const CORE_HAS_POOLS = CORE_TIER !== 'nano' && CORE_TIER !== 'mini';

let wf;
let n = 0;
const live = [];

beforeAll(async () => { wf = await loadFrameworkForm(); });
afterEach(() => { while (live.length) wf.unregister(live.pop()); });

async function threadStore(def) {
  const name = 'poolThread' + (++n);
  const store = wf.thread(name, def, { inline: true });
  live.push(name);
  await until(() => store.isLoading === false, 5000, 'first patch');
  return store;
}

describe.skipIf(!CORE_HAS_POOLS)(`pools in a thread (${CORE_TIER} core)`, () => {
  it('the worker steps the pool in methods and tick, and a computed over length reaches the page', async () => {
    const store = await threadStore({
      state: {},
      pools: { bees: {} },
      computed: { count() { return this.pools.bees.length; } },
      spawn(k) { for (let i = 0; i < k; i++) this.pools.bees.push({ id: this.pools.bees.length + 1, x: 0 }); return this.pools.bees.length; },
      firstX() { const b = this.pools.bees.get(1); return b ? b.x : -1; },
      tick() { for (const b of this.pools.bees) b.x += 1; },
    });
    expect(await store.spawn(3)).toBe(3);
    await until(() => store.count === 3, 3000, 'count on the page');
    await tick(150);
    expect(await store.firstX()).toBeGreaterThan(0);
  });

  it('the pools block crosses whole: key, entity state, computed and methods, and a hook', async () => {
    const store = await threadStore({
      state: { adds: 0 },
      pools: {
        bees: {
          key: 'uid',
          onAdd: 'added',
          entity: {
            state: { hp: 10 },
            computed: { alive() { return this.hp > 0; } },
            hit(d) { this.hp -= d; },
          },
        },
      },
      added() { this.adds++; },
      spawn() { this.pools.bees.push({ uid: 7 }); },
      hitAndRead(d) { const b = this.pools.bees.get(7); b.hit(d); return [b.hp, b.alive]; },
    });
    await store.spawn();
    await until(() => store.adds === 1, 3000, 'onAdd ran in the worker');
    expect(await store.hitAndRead(4)).toEqual([6, true]);
    expect(await store.hitAndRead(6)).toEqual([0, false]);
  });

  it('an underscore field carries a per-frame snapshot of the pool to the page', async () => {
    const store = await threadStore({
      state: { _pos: null },
      pools: { bees: {} },
      init() { for (let i = 0; i < 4; i++) this.pools.bees.push({ id: i, x: i }); },
      tick() {
        const pos = new Float32Array(this.pools.bees.length);
        let i = 0;
        for (const b of this.pools.bees) { b.x += 1; pos[i++] = b.x; }
        this._pos = pos;
      },
    });
    await until(() => store._pos instanceof Float32Array && store._pos.length === 4, 3000, 'snapshot on the page');
    const first = store._pos[0];
    await until(() => store._pos[0] > first, 3000, 'a later snapshot');
  });

  function threadError(def) {
    const name = 'poolThreadBad' + (++n);
    try { wf.thread(name, def, { inline: true }); live.push(name); return null; }
    catch (e) { return e.message; }
  }

  it('a class instance in the pools block is refused with a reason, not sent as a plain object', () => {
    class Vec { len() { return 1; } }
    const msg = threadError({ state: {}, pools: { a: { props: { v: new Vec() } } } });
    expect(msg).toMatch(/pools\.a\.props\.v/);
    expect(msg).toMatch(/Vec/);
  });

  it('a cycle in the pools block is refused with a reason, not a stack overflow', () => {
    const props = { k: 1 };
    props.self = props;
    const msg = threadError({ state: {}, pools: { a: { props } } });
    expect(msg).toMatch(/cycle/);
    expect(msg).not.toMatch(/call stack/i);
  });

  it('a Date in the pools block still crosses', async () => {
    const store = await threadStore({
      state: {},
      pools: { a: { props: { at: new Date(5) } } },
      at() { return this.pools.a.props.at.getTime(); },
    });
    expect(await store.at()).toBe(5);
  });

  it.skipIf(isMin)('workerOnly naming a pool says pools already stay in the worker', async () => {
    const lines = await captureWarnings(() => threadStore({ state: {}, pools: { bees: {} }, workerOnly: ['bees'] }));
    const all = lines.join('\n');
    expect(all).toMatch(/bees/);
    expect(all).toMatch(/pool/);
    expect(all).not.toMatch(/Declare it in state or computed/);
  });

  it('the page store has no pools: the entities stay in the worker', async () => {
    const store = await threadStore({
      state: {},
      pools: { bees: {} },
      computed: { count() { return this.pools.bees.length; } },
    });
    expect(store.pools).toBeUndefined();
    expect(store.count).toBe(0);
  });
});

describe.skipIf(CORE_HAS_POOLS || isMin)(`pools on a core without them (${CORE_TIER} core)`, () => {
  it('TH-112: the page says the build has no pools, since the worker loads the same build', async () => {
    const name = 'poolThreadNoTier' + (++n);
    const lines = await captureWarnings(async () => {
      const store = wf.thread(name, { state: {}, pools: { bees: {} } }, { inline: true });
      live.push(name);
      await until(() => store.isLoading === false, 5000, 'first patch');
    });
    expect(lines.join('\n')).toMatch(/TH-112/);
  });
});
