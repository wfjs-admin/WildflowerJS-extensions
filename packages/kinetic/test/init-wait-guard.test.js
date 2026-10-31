/**
 * A seek waits for every scene's init() still running (the settle hook,
 * wildflower.whenInitialized()), so a scene that mounts with slow setup,
 * such as loading three.js or compiling shaders, is in the frame. That wait
 * is the scene's setup, not the seek's work, so KN-170 leaves it out; a
 * seek(local) that is itself slow is still KN-170. Its own file, since the
 * code warns once a page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, captureWarnings, dispatchSeek, uniqueName, BUILD, CORE_TIER } from './helpers.js';

// The page's own timer and clock, taken before any seek wraps them.
const later = window.setTimeout.bind(window);
const busy = performance.now.bind(performance);

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

describe(`the init wait and KN-170 (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a seek that waits for a scene whose init() waits on a store draws no KN-170, and the frame has the scene', async () => {
    const { wf } = await load();
    const name = uniqueName('slow-init'), store = uniqueName('late-store');
    let setUp = false;
    // The scene subscribes to a store whose own init() takes 80 ms, so the
    // scene's init is still pending when the seek arrives.
    wf.store(store, { state: { n: 1 }, async init() { await new Promise((r) => later(r, 80)); } });
    wf.kinetic.scene(name, { subscribe: [store], init() { setUp = true; } });
    let host;
    const lines = await captureWarnings(async () => {
      host = await mount(`<div data-composition-id="iw" data-start="0" data-duration="4" data-fps="30"><div data-component="${name}" data-start="0" data-duration="4"></div></div>`);
      cleanup.push(host);
      expect(setUp, 'the init is still waiting for its store').toBe(false);
      const t0 = busy();
      await dispatchSeek(1).done;
      expect(busy() - t0, 'the seek waited for the init').toBeGreaterThan(30);
    });
    expect(setUp).toBe(true);
    expect(lines.filter((l) => l.startsWith('[KN-170]')), lines.join(' || ')).toEqual([]);
  });

  // After the test above, which expects no KN-170 on this page.
  it('a seek(local) that is itself slow is still KN-170', async ({ skip }) => {
    if (BUILD !== 'dev') skip();
    const { wf } = await load();
    const name = uniqueName('slow-seek');
    wf.kinetic.scene(name, { seek(local) { if (Math.abs(local - 2) < 1e-6) { const until = busy() + 14; while (busy() < until) { /* a slow seek */ } } } });
    const host = await mount(`<div data-composition-id="iw2" data-start="0" data-duration="4" data-fps="30"><div data-component="${name}" data-start="0" data-duration="4"></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    const lines = await captureWarnings(async () => { await dispatchSeek(2).done; });
    expect(lines.filter((l) => l.startsWith('[KN-170]')).length, lines.join(' || ')).toBe(1);
  });
});
