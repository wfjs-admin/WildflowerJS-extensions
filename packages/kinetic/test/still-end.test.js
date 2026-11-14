/**
 * render.still(t), the preview bar's As Rendered, at the end of a piece: a
 * time past the last frame's start, up to and at the composition's
 * duration, where playback stops and the bar's step lands, shows the last
 * frame, the same pixels as the full render's last frame; a time that is no
 * number or below 0 is KN-100 naming render.still(t). Needs the installed
 * Chrome (vitest.render.config.js), as render() does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.config({ finish: null, shutter: 0 });
  for (const el of cleanup.splice(0)) el.remove();
});

// The frames render() hands its encoder, as ImageData, read before encoding.
async function encodedFrames(wf, opts) {
  const frames = [];
  const real = VideoEncoder.prototype.encode;
  VideoEncoder.prototype.encode = function (frame, o) {
    const c = document.createElement('canvas');
    c.width = frame.displayWidth; c.height = frame.displayHeight;
    c.getContext('2d').drawImage(frame, 0, 0);
    frames.push(c.getContext('2d').getImageData(0, 0, c.width, c.height));
    return real.call(this, frame, o);
  };
  try { await wf.kinetic.render(Object.assign({ download: false }, opts)); } finally { VideoEncoder.prototype.encode = real; }
  return frames;
}
const pixels = (c) => Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);

describe(`render.still() at the end (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a time from the last frame to the duration shows the last frame, as the render has it; a bad time is KN-100 naming render.still(t)', async () => {
    const { wf } = await load();
    const name = uniqueName('scene');
    // A white square on black, moving 400 px a second: each frame differs.
    wf.kinetic.scene(name, { computed: { box() { return { position: 'absolute', top: '35px', width: '20px', height: '20px', background: '#fff', left: (20 + 200 * this.local) + 'px' }; } } });
    const host = await mount(`<div data-composition-id="${uniqueName('se')}" data-start="0" data-duration="0.5" data-width="160" data-height="90" data-fps="10" style="width:160px;height:90px;position:relative;overflow:hidden;background:#000"><div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="box"></div></div></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    wf.kinetic.config({ finish: { vignette: 0.4, grain: { amount: 0.3, fps: 10 } } });
    const frames = await encodedFrames(wf, {});
    expect(frames.length).toBe(5);
    const last = Array.from(frames[4].data);
    for (const t of [0.4, 0.45, 0.5]) expect(pixels(await wf.kinetic.render.still(t)), 'still(' + t + ')').toEqual(last);
    await expectKN(wf.kinetic.render.still(-1), 'KN-100', 'render.still(t)');
    await expectKN(wf.kinetic.render.still('end'), 'KN-100', 'render.still(t)');
  });
});
