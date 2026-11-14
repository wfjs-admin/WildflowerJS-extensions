/**
 * timeOf('frame N') counts frames at the composition's own rate: the root's
 * data-fps, else config({ fps }), else 30. A render at another rate samples
 * the piece more finely; it does not move the piece's frames. For a root
 * with no data-fps, timeOf('frame 15') was 0.5 s in the preview and 0.25 s
 * during render({ fps: 60 }), because the rate was read from the clock's
 * store, which holds the render's rate while a render runs: an event placed
 * by frame number happened at half its time in the file. onFrame() still
 * snaps to the render's own grid, which is what a contact on a frame wants.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, BUILD } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

describe(`timeOf('frame N') during a render at another rate (${BUILD})`, () => {
  for (const [label, rootFps, renderFps, expected] of [
    ['a root with no data-fps, rendered at 60', null, 60, 0.5],
    ['a root with data-fps 10, rendered at 20 (control)', 10, 20, 1.5],
  ]) {
    it(label + ': frame 15 is the same moment in the preview and in the render', async () => {
      const { wf } = await load();
      const name = uniqueName('scene');
      const seen = [];
      wf.kinetic.scene(name, {
        seek() {
          seen.push({ frame15: wf.kinetic.timeOf('frame 15'), onFrame: wf.kinetic.onFrame(0.52), storeFps: wf.getStore('kinetic').fps });
          const ctx = this.element.querySelector('canvas').getContext('2d');
          ctx.fillStyle = '#208040'; ctx.fillRect(0, 0, 160, 90);
        },
      });
      const host = await mount(`<div data-composition-id="${uniqueName('pf')}" data-start="0" data-duration="1" data-width="160" data-height="90"${rootFps ? ` data-fps="${rootFps}"` : ''}><div data-component="${name}"><canvas width="160" height="90"></canvas></div></div>`);
      cleanup.push(host);
      wf.kinetic.seek(0.1);
      await new Promise((r) => setTimeout(r, 50));
      expect(wf.kinetic.timeOf('frame 15')).toBe(expected);
      seen.length = 0;
      await wf.kinetic.render({ source: host.querySelector('canvas'), fps: renderFps, download: false, bitrate: 1e6, codec: 'vp09.00.10.08' });
      const during = seen.find((s) => s.storeFps === renderFps);
      expect(during, 'a seek made while the render ran').toBeTruthy();
      expect(during.frame15).toBe(expected);
      // onFrame() snaps to the grid being captured.
      expect(during.onFrame).toBe(Math.round(0.52 * renderFps) / renderFps);
      expect(wf.kinetic.timeOf('frame 15')).toBe(expected);
    });
  }
});
