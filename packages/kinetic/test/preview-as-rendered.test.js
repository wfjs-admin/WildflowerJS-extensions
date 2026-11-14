/**
 * The preview bar's As Rendered against the real render.still(), which
 * seeks the clock through the frame's shutter samples and back to where it
 * started: a frame step or scrub made while a frame draws is kept, and
 * holding a step key through twenty frames ends on the twentieth frame with
 * the last draw for that frame. The frame laid over the stage never outlives
 * what it shows: turning the bar off takes it away, and a seek from outside
 * the bar (page code, a lesson, an embed host) draws the new frame. Render
 * and Check are off while a frame draws, and render() called from page code
 * while As Rendered is on does not draw the laid-over frame into the file.
 *
 * Headless Chromium has no drawElementImage; a no-op stands in, so the
 * still runs its own seeks and waits and returns a blank frame.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const restores = [];
afterEach(async () => {
  for (const f of restores.splice(0).reverse()) f();
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ preview: false, shutter: 0 });
  for (const el of cleanup.splice(0)) el.remove();
});

// Replaces obj[name] for the rest of the test.
function stub(obj, name, fn) {
  const had = Object.prototype.hasOwnProperty.call(obj, name);
  const orig = obj[name];
  obj[name] = fn;
  restores.push(() => { if (had) obj[name] = orig; else delete obj[name]; });
}
const until = async (fn, ms = 5000) => { for (let i = 0; i < ms / 5 && !fn(); i++) await tick(5); return fn(); };
const DRAWING = 'drawing the frame as rendered…';

// A 6 s, 30 fps stage with a shutter (so the bar has As Rendered), the bar
// up, and the real still behind it; `drawn` lists the time of each still.
async function asRenderedBar() {
  const { wf } = await load();
  stub(CanvasRenderingContext2D.prototype, 'drawElementImage', function () {});
  const host = await mount('<div data-composition-id="' + uniqueName('ar') + '" data-start="0" data-duration="6" data-fps="30" data-width="64" data-height="36" style="width:64px;height:36px"></div>');
  cleanup.push(host);
  wf.kinetic.config({ shutter: { angle: 180, samples: 8 } });
  wf.kinetic.config({ preview: true });
  await tick(10);
  const real = wf.kinetic.render.still;
  const drawn = [];
  stub(wf.kinetic.render, 'still', (t) => { drawn.push(t); return real(t); });
  const bar = document.querySelector('[data-kinetic-preview]');
  const readout = () => bar.querySelector('span').textContent;
  return {
    wf, bar, drawn, readout,
    root: host.querySelector('[data-composition-id]'),
    s: wf.getStore('kinetic'),
    button: (action) => bar.querySelector('[data-action="' + action + '"]'),
    frames: () => document.querySelectorAll('[data-kinetic-as-rendered]').length,
    // A draw has started, and then: every draw has finished.
    drawing: () => until(() => readout() === DRAWING, 1000),
    settled: async (ms = 5000) => { await until(() => readout() !== DRAWING, ms); await tick(30); },
  };
}

describe(`As Rendered with the real still (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a frame step made while a frame draws is kept, and that frame is drawn', async () => {
    const { wf, s, button, drawn, drawing, settled } = await asRenderedBar();
    wf.kinetic.seek(1);
    button('asRendered').click();
    expect(await drawing()).toBe(true);
    button('forward').click();
    await settled();
    expect(s.time).toBeCloseTo(31 / 30, 9);
    expect(drawn.at(-1)).toBeCloseTo(31 / 30, 9);
  });

  it('a scrub made while a frame draws is kept', async () => {
    const { wf, s, bar, button, drawing, settled } = await asRenderedBar();
    wf.kinetic.seek(1);
    button('asRendered').click();
    expect(await drawing()).toBe(true);
    const range = bar.querySelector('input[type="range"]');
    range.value = '4';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await settled();
    expect(s.time).toBeCloseTo(4, 9);
  });

  it('holding the step key through twenty frames ends on the twentieth, with the last draw for it', async () => {
    const { wf, s, button, drawn, drawing, settled } = await asRenderedBar();
    wf.kinetic.seek(1);
    button('asRendered').click();
    expect(await drawing()).toBe(true);
    // A held key repeats about every 33 ms.
    for (let i = 0; i < 20; i++) { button('forward').click(); await tick(33); }
    await settled(10000);
    expect(s.time).toBeCloseTo(50 / 30, 9);
    expect(drawn.at(-1)).toBeCloseTo(50 / 30, 9);
    // Nothing more draws once the last frame is up.
    const n = drawn.length;
    await tick(300);
    expect(drawn.length).toBe(n);
  });

  it('turning the bar off takes the frame away and puts the root back as it was', async () => {
    const { wf, root, button, frames, drawing, settled } = await asRenderedBar();
    wf.kinetic.seek(1);
    button('asRendered').click();
    await drawing();
    await settled();
    expect(frames()).toBe(1);
    wf.kinetic.config({ preview: false });
    await tick(20);
    expect(frames()).toBe(0);
    expect(root.style.position).toBe('');
  });

  it('a seek from outside the bar draws the frame it lands on', async () => {
    const { wf, button, frames, drawn, drawing, settled } = await asRenderedBar();
    wf.kinetic.seek(1);
    button('asRendered').click();
    await drawing();
    await settled();
    wf.kinetic.seek(3);
    await tick(30);
    await settled();
    expect(drawn.at(-1)).toBe(3);
    expect(frames()).toBe(1);
  });

  it('Render and Check are off while a frame draws, and on again after', async () => {
    const { wf, button, drawing, settled } = await asRenderedBar();
    wf.kinetic.seek(1);
    button('asRendered').click();
    expect(await drawing()).toBe(true);
    await tick(10);
    expect(button('render').disabled).toBe(true);
    expect(button('check').disabled).toBe(true);
    await settled();
    expect(button('render').disabled).toBe(false);
    expect(button('check').disabled).toBe(false);
  });

  it('render() from page code while As Rendered is on does not draw the laid-over frame', async () => {
    const { wf, button, frames, drawing, settled } = await asRenderedBar();
    if (typeof VideoEncoder !== 'function') return;
    wf.kinetic.seek(1);
    button('asRendered').click();
    await drawing();
    await settled();
    expect(frames()).toBe(1);
    const handed = [];
    stub(CanvasRenderingContext2D.prototype, 'drawElementImage', function (el) {
      const c = el.querySelector('[data-kinetic-as-rendered]');
      handed.push(!!c && getComputedStyle(c).display !== 'none');
    });
    const r = await wf.kinetic.render({ download: false, to: 0.2 });
    expect(r.frames).toBe(6);
    expect(handed.length).toBeGreaterThan(0);
    expect(handed.filter(Boolean)).toEqual([]);
  });
});
