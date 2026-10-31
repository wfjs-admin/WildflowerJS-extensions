/**
 * List rows that read a store path: a data-list row template inside a scene
 * that binds $kinetic.time, and one that binds a path of a store of the
 * page's own. Every row must show the current value after every seek:
 * forward, back, the same time again, after the list re-renders with new
 * rows, keyed and unkeyed, through both seek channels (hf-seek and seek()).
 * Beside them, the same rows read `local` and a scene computed, the form the
 * docs have always shown.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, dispatchSeek, uniqueName, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

// Times to visit: forward, back, the same time twice, across the count
// changes of the growing list, and back to 0.
const TIMES = [0.5, 1, 2.5, 4, 1.5, 1.5, 3, 0, 3.9, 3.9, 0.2, 2, 2, 5.5, 0.9];

const texts = (host, sel) => [...host.querySelectorAll(sel)].map((e) => e.textContent);

describe(`rows that read a store path (${BUILD} extension, ${CORE_TIER} core)`, () => {
  for (const keyed of [true, false]) {
    it(`a ${keyed ? 'keyed' : 'unkeyed'} data-list row reading $kinetic.time shows the current time after every seek, as rows reading local and a computed do, through hf-seek and seek()`, async ({ skip }) => {
      const { wf } = await load();
      if (wf.features && wf.features.lists === false) skip();
      const k = wf.kinetic, s = wf.getStore('kinetic');
      const name = uniqueName('rowtime');
      k.scene(name, {
        state: { fixed: [{ id: 1 }, { id: 2 }, { id: 3 }] },
        computed: {
          // A list whose rows come and go with the time: one row per whole
          // second of local, and at least one.
          grown() { const n = Math.max(1, Math.floor(this.local) + 1); return Array.from({ length: n }, (_, i) => ({ id: i + 1 })); },
          // A list whose rows are new objects on every seek, same keys.
          fresh() { return [{ id: 1, at: this.local }, { id: 2, at: this.local }]; },
          stamp() { return String(this.local); },
        },
      });
      const key = keyed ? ' data-key="id"' : '';
      const row = '<li><b class="t" data-bind="$kinetic.time"></b><i class="l" data-bind="local"></i><u class="c" data-bind="stamp"></u></li>';
      const host = await mount(`<div data-composition-id="${uniqueName('rt')}" data-start="0" data-duration="6" data-fps="30">
        <div data-component="${name}" data-start="0" data-duration="6">
          <ul class="fixed" data-list="fixed"${key}><template>${row}</template></ul>
          <ul class="grown" data-list="grown"${key}><template>${row}</template></ul>
          <ul class="fresh" data-list="fresh"${key}><template>${row}</template></ul>
        </div></div>`);
      cleanup.push(host);

      const stale = [];
      const look = (how, t) => {
        const now = String(s.time);
        for (const list of ['fixed', 'grown', 'fresh']) {
          const ts = texts(host, '.' + list + ' .t'), ls = texts(host, '.' + list + ' .l'), cs = texts(host, '.' + list + ' .c');
          const want = list === 'grown' ? Math.max(1, Math.floor(s.time) + 1) : list === 'fixed' ? 3 : 2;
          if (ts.length !== want) stale.push(how + ' ' + t + ' ' + list + ': ' + ts.length + ' rows, not ' + want);
          ts.forEach((x, i) => { if (x !== now) stale.push(how + ' ' + t + ' ' + list + ' row ' + i + ' $kinetic.time ' + JSON.stringify(x) + ', not ' + now); });
          ls.forEach((x, i) => { if (x !== now) stale.push(how + ' ' + t + ' ' + list + ' row ' + i + ' local ' + JSON.stringify(x) + ', not ' + now); });
          cs.forEach((x, i) => { if (x !== now) stale.push(how + ' ' + t + ' ' + list + ' row ' + i + ' computed ' + JSON.stringify(x) + ', not ' + now); });
        }
      };
      for (const t of TIMES) { await dispatchSeek(t).done; look('hf-seek', t); }
      for (const t of TIMES.slice().reverse()) { k.seek(t); await tick(0); look('seek()', t); }
      // Seeks with no wait between them, then one look at the last.
      for (const t of [1, 3.5, 0.4, 2.2]) dispatchSeek(t);
      await dispatchSeek(2.7).done;
      look('burst', 2.7);
      expect(stale, stale.slice(0, 12).join('\n')).toEqual([]);
    });
  }

  it("a data-list row reading a path of the page's own store follows every write, in a scene and across a re-render of the list", async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const store = uniqueName('rowstore');
    wf.store(store, { state: { n: 0, label: 'a' } });
    const st = wf.getStore(store);
    const name = uniqueName('rowscene');
    wf.kinetic.scene(name, {
      computed: { rows() { const n = Math.max(1, Math.floor(this.local) + 1); return Array.from({ length: n }, (_, i) => ({ id: i + 1 })); } },
    });
    const host = await mount(`<div data-composition-id="${uniqueName('rs')}" data-start="0" data-duration="6" data-fps="30">
      <div data-component="${name}" data-start="0" data-duration="6">
        <ul data-list="rows" data-key="id"><template><li><b class="n" data-bind="$${store}.n"></b><i class="w" data-bind="$${store}.label"></i></li></template></ul>
      </div></div>`);
    cleanup.push(host);
    const stale = [];
    const steps = [[0.5, 1, 'b'], [2.5, 2, 'c'], [1.2, 3, 'c'], [1.2, 4, 'd'], [4.1, 5, 'e'], [0, 6, 'f'], [3, 6, 'f']];
    for (const [t, n, label] of steps) {
      st.n = n;
      st.label = label;
      await dispatchSeek(t).done;
      await tick(0);
      const ns = texts(host, '.n'), ws = texts(host, '.w');
      if (ns.length !== Math.max(1, Math.floor(t) + 1)) stale.push(t + ': ' + ns.length + ' rows');
      ns.forEach((x, i) => { if (x !== String(n)) stale.push(t + ' row ' + i + ' n ' + x + ', not ' + n); });
      ws.forEach((x, i) => { if (x !== label) stale.push(t + ' row ' + i + ' label ' + x + ', not ' + label); });
      // A write with no seek reaches the rows too.
      st.n = n + 100;
      await tick(0);
      if (wf.whenIdle) await wf.whenIdle();
      texts(host, '.n').forEach((x, i) => { if (x !== String(n + 100)) stale.push(t + ' (write alone) row ' + i + ' n ' + x + ', not ' + (n + 100)); });
    }
    expect(stale, stale.slice(0, 12).join('\n')).toEqual([]);
  });
});
