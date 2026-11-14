/**
 * config({ fit }) with a root whose width the page gives as a share of its
 * container (fit.js): the root lays out against the wrapper, which is
 * already no wider than the room, so the scale is the room over the root's
 * own laid-out width, and a root at width: 100% fills the wrapper. The scale
 * used to be the room over data-width whatever the root's width, so such a
 * root was narrowed twice: a 640 x 360 stage in 320 px of room showed at
 * 160 x 90. A root at data-width, by the page's rule or Kinetic's, is fitted
 * as before.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, frames, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

// A page `width` px wide whose root is 640 x 360 by its data attributes and
// is styled by `css`, with the fit on.
async function fitted(css, width = 320) {
  await load();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:400px;border:0;opacity:0;pointer-events:none';
  frame.srcdoc = '<!doctype html><html><head><style>body { margin: 0; }' + css + '</style></head><body>'
    + '<div id="stage" data-composition-id="own" data-no-timeline data-start="0" data-duration="2" data-fps="10" data-width="640" data-height="360"></div>'
    + '<script src="' + CORE + '"><\/script><script src="' + WF_FILE + '"><\/script>'
    + '<script>wildflower.kinetic.config({ autoplay: false, fit: true });<\/script></body></html>';
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  await w.wildflower.kinetic.ready();
  await frames(2);
  await tick(10);
  const r = w.document.getElementById('stage').getBoundingClientRect();
  return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
}

describe(`the fit and a root sized by its container (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a root at width: 100% with the stage\'s aspect-ratio fills the room once', async () => {
    expect(await fitted(' #stage { width: 100%; aspect-ratio: 16 / 9; }')).toEqual([320, 180]);
  });

  it('a root at data-width, from the page or from Kinetic, is fitted as before', async () => {
    expect(await fitted(' #stage { width: 640px; height: 360px; }')).toEqual([320, 180]);
    expect(await fitted('')).toEqual([320, 180]);
    expect(await fitted(' #stage { width: 640px; height: 360px; }', 800)).toEqual([640, 360]);
  });
});
