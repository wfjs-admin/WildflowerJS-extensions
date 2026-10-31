/**
 * The guard: CSS animations that HyperFrames never positioned are placed
 * at the seek before the barrier resolves (every build), and in development
 * the determinism hazards seen during a seek are warned about once each.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { load, mount, tick, dispatchSeek, captureWarnings, uniqueName, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = '@keyframes kn-rise { from { opacity: 0 } to { opacity: 1 } } .rise { animation: kn-rise 2s linear both; } .fade { transition: opacity 1s linear; }';
  document.head.appendChild(style);
});

const codesIn = (lines) => lines.filter((l) => l.startsWith('[KN-')).map((l) => l.slice(1, 7));

describe(`guard: CSS-animation catch-up (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('positions a running CSS animation under a scene at the seek, relative to the clip, before the barrier', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="g1" data-start="0" data-duration="10"><div data-component="${name}" data-start="1" data-duration="4"><i class="rise"></i><b data-start="2"><i class="rise"></i></b></div></div>`);
    cleanup.push(host);
    const [outer, inner] = host.querySelectorAll('i');
    expect(outer.getAnimations()[0].playState).toBe('running');
    await dispatchSeek(2.5).done;
    const a = outer.getAnimations()[0], b = inner.getAnimations()[0];
    expect(a.playState).toBe('paused');
    expect(a.currentTime).toBe(1500);          // 2.5 - 1
    expect(b.currentTime).toBe(500);           // 2.5 - 2, the nearest data-start
    expect(getComputedStyle(outer).opacity).toBe('0.75');
    await dispatchSeek(0.2).done;
    expect(a.currentTime).toBe(0);
    await dispatchSeek(4).done;
    expect(a.currentTime).toBe(3000);
    expect(getComputedStyle(outer).opacity).toBe('1');
  });

  it('rows a seek creates get their animations positioned in the same seek, with no hazard charged to the page', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, { computed: { rows() { return this.local > 0.5 ? [{ k: 1 }, { k: 2 }] : []; } } });
    // Settled before the mount: a scene that mounts inside an open seek holds
    // it open for a few tasks, and the mount's own timer would be charged to it.
    await dispatchSeek(0).done;
    const host = await mount(`<div data-composition-id="g2" data-start="0" data-duration="10"><div data-component="${name}" data-start="1"><ol data-list="rows" data-key="k"><template><li class="rise"></li></template></ol></div></div>`);
    cleanup.push(host);
    expect(host.querySelectorAll('li').length).toBe(0);
    // The framework's own timers during the list render are not the page's.
    const lines = await captureWarnings(async () => { await dispatchSeek(3).done; });
    expect(codesIn(lines)).toEqual([]);
    const lis = [...host.querySelectorAll('li')];
    expect(lis.length).toBe(2);
    for (const li of lis) {
      const a = li.getAnimations()[0];
      expect(a.playState).toBe('paused');
      expect(a.currentTime).toBe(2000);
    }
    await dispatchSeek(2).done;
    expect(lis.map((li) => li.getAnimations()[0].currentTime)).toEqual([1000, 1000]);
  });

  it('leaves an animation the runtime paused alone', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    wf.kinetic.scene(name, {});
    const host = await mount(`<div data-composition-id="g3" data-start="0" data-duration="10"><div data-component="${name}" data-start="0"><i class="rise"></i></div></div>`);
    cleanup.push(host);
    const a = host.querySelector('i').getAnimations()[0];
    a.currentTime = 777; a.pause();           // as HyperFrames' adapter would have
    await dispatchSeek(3).done;
    // Close to, not equal: once the animation has started, Chromium reads
    // the held time back through its start time as 776.9999999999999.
    expect(a.currentTime).toBeCloseTo(777, 6);
  });
});

if (BUILD === 'dev') {
  describe(`guard: determinism diagnostics (${BUILD} extension, ${CORE_TIER} core)`, () => {
    // First in this block: each code warns once per page, and a false KN-140
    // here would hide the real one the next test expects.
    it("does not charge Kinetic's own clock reads in an open seek to the line that called Kinetic", async () => {
      const { wf } = await load();
      const name = uniqueName('scene');
      wf.kinetic.scene(name, {});
      const host = await mount(`<div data-composition-id="g8" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      const lines = await captureWarnings(async () => {
        wf.kinetic.seek(0.7);               // its barrier has not resolved when check() starts seeking
        await wf.kinetic.check({ samples: 3 });
      });
      expect(lines.filter((l) => l.startsWith('[KN-'))).toEqual([]);
    });

    // Before the test that expects KN-142, which warns once a page.
    it('page code that calls seek(t) and then starts a timer in the same task draws no KN-142', async () => {
      const { wf } = await load();
      const name = uniqueName('scene');
      wf.kinetic.scene(name, {});
      const host = await mount(`<div data-composition-id="g10" data-start="0" data-duration="10"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      const lines = await captureWarnings(async () => {
        wf.kinetic.seek(1);
        await new Promise((r) => setTimeout(r, 20));
        await tick(10);
      });
      expect(codesIn(lines)).toEqual([]);
    });

    it('a synchronous throw inside a seek, after the window opened, still puts every global back', async () => {
      const { wf } = await load();
      const D = Date, rnd = Math.random, st = setTimeout, round = Math.round;
      const name = uniqueName('scene');
      wf.kinetic.scene(name, {});
      const host = await mount(`<div data-composition-id="g11" data-start="0" data-duration="10"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      let threw = false, armed = true;
      Math.round = function (x) {
        if (armed && Date !== D) { armed = false; throw new Error('boom'); }
        return round(x);
      };
      try { wf.kinetic.seek(1.3); } catch (_) { threw = true; } finally { Math.round = round; }
      await tick(10);
      expect(threw).toBe(true);
      expect(Date).toBe(D);
      expect(Math.random).toBe(rnd);
      expect(setTimeout).toBe(st);
    });

    it('warns once for a wall clock, Math.random, a timer and an unlocalized format read during a seek, and names the caller', async () => {
      const { wf } = await load();
      const name = uniqueName('scene');
      let seeks = 0;
      wf.kinetic.scene(name, {
        computed: {
          hazards() {
            const t = this.local;
            return [Date.now(), Math.random(), (1234.5).toLocaleString(), new Date().getTime(), performance.now(), t].join(' ').length;
          },
        },
        seek() { seeks++; setTimeout(() => {}, 0); },
      });
      let host;
      const lines = await captureWarnings(async () => {
        host = await mount(`<div data-composition-id="g4" data-start="0" data-duration="10"><div data-component="${name}"><b data-bind="hazards"></b></div></div>`);
        cleanup.push(host);
        // The scene's init is deferred to a later task; the hook runs once
        // there, outside any seek. Seek only once the scene is live.
        for (let i = 0; i < 50 && !seeks; i++) await tick(2);
        expect(seeks).toBe(1);
        await dispatchSeek(1).done;
        await dispatchSeek(2).done;
      });
      const codes = codesIn(lines);
      const seen = JSON.stringify(lines.filter((l) => l.startsWith('[KN-')));
      expect(codes.filter((c) => c === 'KN-140').length, seen).toBe(1);
      expect(codes.filter((c) => c === 'KN-141').length, seen).toBe(1);
      expect(codes.filter((c) => c === 'KN-142').length, seen).toBe(1);
      expect(codes.filter((c) => c === 'KN-145').length, seen).toBe(1);
      expect(lines.find((l) => l.includes('KN-141'))).toMatch(/guard\.test\.js/);
      // Outside a seek nothing is wrapped, and nothing is reported.
      expect(Date.now).toBe(Date.now);
      const after = await captureWarnings(async () => { Date.now(); Math.random(); setTimeout(() => {}, 0); (1).toLocaleString(); });
      expect(codesIn(after)).toEqual([]);
    });

    it('restores every global after the barrier, even when a hook holds the seek open', async () => {
      const { wf } = await load();
      const D = Date, now = Date.now, perf = performance.now, rnd = Math.random, st = setTimeout, raf = requestAnimationFrame, nf = Intl.NumberFormat;
      const name = uniqueName('scene');
      wf.kinetic.scene(name, { seek() { return new Promise((r) => st(r, 5)); } });
      const host = await mount(`<div data-composition-id="g5" data-start="0" data-duration="10"><div data-component="${name}"></div></div>`);
      cleanup.push(host);
      const { done } = dispatchSeek(1);
      expect(Date).toBe(D);                     // not for the code that seeked, in its own task
      await Promise.resolve();
      expect(Date).not.toBe(D);                 // wrapped while the seek is open
      expect(new Date(0) instanceof Date).toBe(true);
      expect(new Date(5).getTime()).toBe(5);
      await done;
      expect(Date).toBe(D);
      expect(Date.now).toBe(now);
      expect(performance.now).toBe(perf);
      expect(Math.random).toBe(rnd);
      expect(setTimeout).toBe(st);
      expect(requestAnimationFrame).toBe(raf);
      expect(Intl.NumberFormat).toBe(nf);
    });

    it('warns once about a CSS transition under the root and a slow seek, naming how many scenes are inside their clips (dev)', async () => {
      const { wf } = await load();
      const name = uniqueName('scene');
      const plain = uniqueName('scene');
      wf.kinetic.scene(name, {
        computed: { o() { return { opacity: String(this.local > 1 ? 1 : 0) }; } },
        seek() { const until = performance.now() + 12; while (performance.now() < until) { /* a slow seek */ } },
      });
      wf.kinetic.scene(plain, {});
      let host;
      const lines = await captureWarnings(async () => {
        // Two scenes on screen throughout, and one hidden until 8 s.
        host = await mount(`<div data-composition-id="g6" data-start="0" data-duration="10"><div data-component="${name}"><i class="fade" data-bind-style="o"></i></div><div data-component="${plain}"></div><div data-component="${plain}" data-start="8" data-duration="1"></div></div>`);
        cleanup.push(host);
        await tick(10);
        await dispatchSeek(0.5).done;
        await dispatchSeek(2).done;
        await dispatchSeek(0.5).done;
      });
      const codes = codesIn(lines);
      expect(codes.filter((c) => c === 'KN-143').length, lines.join(' || ')).toBe(1);
      expect(codes.filter((c) => c === 'KN-170').length).toBe(1);
      expect(lines.find((l) => l.includes('KN-143'))).toMatch(/transition of 'opacity'/);
      if (BUILD === 'dev') {
        const hint = lines[lines.findIndex((l) => l.startsWith('[KN-170]')) + 1];
        const m = / (\d+) scenes are inside their clips at [\d.]+ s, and each one's computeds and seek\(local\) run on every seek; a scene outside its clip costs nothing/.exec(hint);
        expect(m, hint).not.toBeNull();
        expect(Number(m[1])).toBeGreaterThanOrEqual(2);
      }
    });

    // Last in this block, so KN-141 has already warned and the scene's read
    // of Math.random() prints nothing.
    it('keeps a global the page replaced after load, and a seek reads through to it', async () => {
      const { wf } = await load();
      const native = Math.random;
      const nativePerf = performance.now;
      const seeded = () => 0.25;
      const perf = function () { return nativePerf.call(performance); };
      const seen = [];
      Math.random = seeded;
      performance.now = perf;
      try {
        const name = uniqueName('scene');
        wf.kinetic.scene(name, { seek() { seen.push(Math.random()); } });
        const host = await mount(`<div data-composition-id="g9" data-start="0" data-duration="10"><div data-component="${name}"></div></div>`);
        cleanup.push(host);
        await dispatchSeek(1).done;
        expect('seeded? ' + (Math.random === seeded) + ' native? ' + (Math.random === native)).toBe('seeded? true native? false');
        expect(performance.now).toBe(perf);
        expect(seen[seen.length - 1]).toBe(0.25);
      } finally {
        Math.random = native;
        delete performance.now;
      }
    });
  });
}
