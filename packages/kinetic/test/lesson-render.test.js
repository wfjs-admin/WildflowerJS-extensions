/**
 * The sine lesson rendered in the tab: render() runs in video mode, plays
 * the steps straight through with their scripts, undoes a slider dragged
 * while a frame waits to be captured, and afterwards gives the learner's
 * values back. Needs WebCodecs and drawElementImage, so it runs in the
 * render suite (vitest.render.config.js).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, sinePage, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });
const canRender = () => typeof VideoEncoder === 'function' && typeof CanvasRenderingContext2D.prototype.drawElementImage === 'function';

describe(`the sine lesson, rendered (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("render() plays the steps straight through in video mode with the scripts, undoes a slider dragged before a frame is captured, and gives the learner's values back", async ({ skip }) => {
    const { wf } = await load();
    if (!canRender() || (wf.features && wf.features.lists === false)) skip();
    const { w, k, store, sine, doc } = await sinePage(cleanup, { width: 1280, height: 800 });
    const slider = doc.querySelector('.lesson input[type="range"]');
    sine.angle = 200;
    sine.choice = 90;
    // Each capture: the time, the mode, the step and the angle, the answer
    // and the slider at that moment. After each one, the next frame's wait
    // for its paint starts with a drag of the slider to 5, while the render
    // is still in video mode. The demo disables its slider in video mode, so
    // the drag is a page's that does not: the attribute comes off first, and
    // each drag has to reach the store.
    const seen = [], reached = [], lines = [];
    let drag = false;
    const realRaf = w.requestAnimationFrame;
    w.requestAnimationFrame = function (cb) {
      if (drag && store.mode === 'video') {
        drag = false;
        slider.removeAttribute('disabled');
        slider.value = '5';
        slider.dispatchEvent(new w.Event('input', { bubbles: true }));
        reached.push(sine.angle);
      }
      return realRaf.call(w, cb);
    };
    const warn = w.console.warn;
    w.console.warn = (...a) => { lines.push(a.map(String).join(' ')); return warn.apply(w.console, a); };
    const proto = w.CanvasRenderingContext2D.prototype, draw = proto.drawElementImage;
    proto.drawElementImage = function (...a) {
      seen.push([store.time, store.mode, store.step, sine.angle, sine.choice, Number(slider.value)]);
      drag = true;
      return draw.apply(this, a);
    };
    let r;
    try {
      r = await k.render({ download: false, fps: 10, shutter: 0 });   // one capture a frame: the page's own shutter would take a sample's worth each
    } finally {
      proto.drawElementImage = draw;
      w.requestAnimationFrame = realRaf;
      w.console.warn = warn;
    }
    expect(r.frames).toBe(240);
    expect(seen.length).toBe(240);
    // Every drag wrote the store, and was undone before its frame was captured.
    expect(reached.length).toBeGreaterThanOrEqual(239);
    expect(reached.every((v) => v === 5), JSON.stringify(reached.slice(0, 5))).toBe(true);
    const undone = lines.filter((l) => l.startsWith('[KN-146]'));
    expect(undone.length).toBe(BUILD === 'dev' ? 1 : 0);
    seen.forEach(([t, mode], i) => {
      expect(t, 'frame ' + i).toBeCloseTo(i / 10, 9);
      expect(mode).toBe('video');
    });
    const at = (t) => seen[Math.round(t * 10)];
    // The scripts, as the frames carry them: the angle from 30 to 120, back
    // to 0 and round to 360, the answer chosen 2 s into the question, the
    // angle down to 270 in the last step. The slider shows each, never 5.
    expect(at(1).slice(2)).toEqual(['circle', 30, null, 30]);
    expect(at(5.5).slice(2, 5)).toEqual(['circle', 120, null]);
    expect(at(14).slice(2, 5)).toEqual(['ask', 360, null]);
    expect(at(16.1).slice(2, 5)).toEqual(['ask', 360, 270]);
    expect(at(21.9).slice(2, 5)).toEqual(['find', 270, 270]);
    for (const [t, , , angle, , value] of seen) expect(value, 'the slider at ' + t).toBe(Math.round(angle));
    // Back in interactive mode with the learner's values.
    expect([store.mode, sine.angle, sine.choice]).toEqual(['interactive', 200, 90]);
  });
});
