/**
 * check()'s passes that read pixels, each frame drawn by render.still(t):
 * the frames as PNG Blobs at the right times and their strip, the contrast
 * measure (4.5:1, and 3:1 at 48 px and up), the seam, the jumps, the diff,
 * isolate, the pace against its dial, and the lesson's stills. Needs the
 * installed Chrome with HTML-in-Canvas (vitest.render.config.js), as
 * render() does.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, loadScript, mount, uniqueName, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const TOOLS_FILE = WF_FILE.replace(/kinetic\.wf(\.min)?\.js$/, 'kinetic.tools$1.js');
let ready = null;
const tools = () => ready || (ready = (async () => { const { wf } = await load(); await loadScript(TOOLS_FILE); return wf; })());

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  wf.kinetic.config({ mode: 'auto', finish: null, shutter: 0 });
  for (const el of cleanup.splice(0)) el.remove();
});

// A composition 160 by 90, `duration` seconds at 10 fps, holding `inner`.
async function comp(duration, inner, style = 'background:#000') {
  const wf = await tools();
  scrollTo(0, 0);
  const host = await mount(`<div data-composition-id="${uniqueName('tp')}" data-no-timeline data-start="0" data-duration="${duration}" data-fps="10" data-width="160" data-height="90" style="position:relative;width:160px;height:90px;overflow:hidden;font:14px/1.2 sans-serif;${style}">${inner}</div>`);
  cleanup.push(host);
  await wf.kinetic.ready();
  return wf;
}

// A PNG Blob's pixels, as a canvas.
async function decode(blob) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c;
}
const at = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3));

// A scene that moves a white square 200 px a second, from x 20.
async function mover() {
  const wf = await tools();
  const name = uniqueName('scene');
  wf.kinetic.scene(name, { computed: { box() { return { position: 'absolute', top: '35px', width: '20px', height: '20px', background: '#fff', left: (20 + 200 * this.local) + 'px' }; } } });
  return `<div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="box"></div></div>`;
}

// A scene whose background is a gray of level(local), 0 to 255.
async function gray(level) {
  const wf = await tools();
  const name = uniqueName('scene');
  wf.kinetic.scene(name, { computed: { bg() { const v = Math.round(level(this.local)); return { position: 'absolute', inset: '0', background: 'rgb(' + v + ',' + v + ',' + v + ')' }; } } });
  return `<div data-component="${name}" style="position:absolute;inset:0"><div data-bind-style="bg"></div></div>`;
}

// A white box 60 px square that shows for frame 5 alone.
const POP = '<div id="pop" data-start="0.5" data-duration="0.1" style="position:absolute;left:50px;top:15px;width:60px;height:60px;background:#fff"></div>';

describe(`check() with the pixel passes (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('frames: a count from 0 to the last frame, or seconds snapped to frames, each a PNG of the frame; strip tiles them', async () => {
    const wf = await comp(1, await mover());
    const r = await wf.kinetic.check({ samples: 2, frames: 3, strip: true });
    expect(r.skipped).toBeUndefined();
    expect(r.images.map((x) => [x.frame, x.t])).toEqual([[0, 0], [5, 0.5], [9, 0.9]]);
    for (const x of r.images) expect(x.png.type).toBe('image/png');
    const [first, mid] = await Promise.all([decode(r.images[0].png), decode(r.images[1].png)]);
    expect([first.width, first.height]).toEqual([160, 90]);
    // The square at x 20 to 40 at 0 s, and 120 to 140 at 0.5 s.
    expect(at(first, 30, 45)).toEqual([255, 255, 255]);
    expect(at(mid, 30, 45)).toEqual([0, 0, 0]);
    expect(at(mid, 130, 45)).toEqual([255, 255, 255]);
    expect(r.strip.type).toBe('image/png');
    const strip = await decode(r.strip);
    expect([strip.width, strip.height]).toEqual([320, 180]);
    const listed = await wf.kinetic.check({ samples: 2, frames: [0, 0.5, 7] });
    expect(listed.images.map((x) => x.frame)).toEqual([0, 5, 9]);
    expect(listed.strip).toBeUndefined();
  });

  it('layout: text under its contrast floor is listed with its ratio, 4.5:1 below 48 px and 3:1 from it; text above it is not', async () => {
    const t = (id, style, words) => `<p id="${id}" style="position:absolute;margin:0;white-space:nowrap;left:20px;${style}">${words}</p>`;
    const wf = await comp(1, t('low', 'top:6px;color:#777', 'Low words')
      + t('small', 'top:26px;color:#333', 'Small dark')
      + t('big', 'top:40px;color:#333;font-size:48px', 'Big')
      + '<div style="position:absolute;left:90px;top:6px;width:70px;height:20px;background:#fff"></div>'
      + t('high', 'top:8px;left:92px;color:#000', 'Black'), 'background:#888');
    const r = await wf.kinetic.check({ samples: 2, layout: true });
    expect(r.skipped).toBeUndefined();
    const low = r.layout.found.filter((f) => f.kind === 'contrast');
    const byText = Object.fromEntries(low.map((f) => [f.text, f]));
    expect(Object.keys(byText).sort()).toEqual(['Low words', 'Small dark']);
    expect(byText['Low words'].ratio).toBeLessThan(1.5);
    expect(byText['Low words'].needs).toBe(4.5);
    expect(byText['Low words'].size).toBe(14);
    // #333 on #888 is about 3.6:1: under 4.5 at 14 px, over 3 at 48 px.
    expect(byText['Small dark'].ratio).toBeGreaterThan(3);
    expect(byText['Small dark'].ratio).toBeLessThan(4.5);
  });

  it('layout: text on a root with a transform of its own is measured as on one without, and its frame is the whole composition', async () => {
    const t = (id, style, words) => `<p id="${id}" style="position:absolute;margin:0;white-space:nowrap;left:20px;${style}">${words}</p>`;
    const inner = t('low', 'top:6px;color:#777', 'Low words') + t('small', 'top:26px;color:#333', 'Small dark');
    const measured = async (style) => {
      const wf = await comp(1, inner, 'background:#888;' + style);
      const r = await wf.kinetic.check({ samples: 2, layout: true, frames: 1 });
      expect(r.skipped).toBeUndefined();
      const png = await decode(r.images[0].png);
      for (const el of cleanup.splice(0)) el.remove();
      return { found: r.layout.found.filter((f) => f.kind === 'contrast').map((f) => [f.text, f.ratio, f.needs, f.size]), corners: [at(png, 3, 3), at(png, 156, 86)] };
    };
    const plain = await measured('');
    expect(plain.found.map((f) => f[0]).sort()).toEqual(['Low words', 'Small dark']);
    expect(plain.corners).toEqual([[136, 136, 136], [136, 136, 136]]);
    for (const style of ['transform:scale(0.5);transform-origin:0 0', 'transform:scale(2);transform-origin:0 0', 'translate:40px 30px']) {
      expect(await measured(style), style).toEqual(plain);
    }
  });

  it('seam: a loop that jumps from its last frame to frame 0 is a jump, one that comes round smoothly is not', async () => {
    let wf = await comp(1, await gray((l) => 255 * l));
    const r = await wf.kinetic.check({ samples: 2, seam: true });
    expect(r.seam.jump).toBe(true);
    expect(r.seam.wrap.mean).toBeGreaterThan(200);
    expect(r.seam.wrap.box).toEqual({ x: 0, y: 0, width: 160, height: 90 });
    for (const el of cleanup.splice(0)) el.remove();
    wf = await comp(1, await gray((l) => 255 * (1 - Math.abs(2 * l - 1))));
    const smooth = await wf.kinetic.check({ samples: 2, seam: true });
    expect(smooth.seam.jump).toBe(false);
    expect(smooth.seam.wrap.mean).toBeGreaterThan(40);
  });

  it('jumps, diff and isolate: a box that pops in for one frame is two jumps, the diff boxes it, and hiding it takes the change away', async () => {
    const wf = await comp(1, POP);
    const r = await wf.kinetic.check({ samples: 2, jumps: true, diff: [4, 5], isolate: ['#pop', '#nothing', '##bad'] });
    expect(r.skipped).toBeUndefined();
    expect(r.jumps.map((j) => [j.a, j.b])).toEqual([[4, 5], [5, 6]]);
    expect(r.jumps[0].mean).toBeCloseTo(255 * 3600 / 14400, 0);
    expect(r.jumps[0].box).toEqual({ x: 50, y: 15, width: 60, height: 60 });
    expect(r.diff).toMatchObject({ a: 4, b: 5, box: { x: 50, y: 15, width: 60, height: 60 } });
    expect(r.isolate.a).toBe(4);
    expect(r.isolate.rows).toEqual([
      { selector: '#pop', found: 1, mean: 0, gone: 1 },
      { selector: '#nothing', found: 0, mean: null, gone: null },
      { selector: '##bad', found: -1, mean: null, gone: null },
    ]);
    // No pop, no jump; isolate with no pair to take says so.
    document.getElementById('pop').remove();
    const calm = await wf.kinetic.check({ samples: 2, jumps: true, isolate: ['#x'] });
    expect(calm.jumps).toEqual([]);
    expect(calm.isolate).toEqual({ none: true });
  });

  it('pace: the measures beside the dial, with the ones it misses', async () => {
    const wf = await comp(1, POP);
    const r = await wf.kinetic.check({ samples: 2, pace: 'lively' });
    const p = r.pace;
    expect(p.dial).toBe('lively');
    expect(p.secs).toBe(1);
    expect(p.still).toBeCloseTo(7 / 9, 6);
    expect(p.snaps).toBe(60);
    expect(p.range).toBeCloseTo(255 * 3600 / 14400, 0);
    expect(p.target).toEqual({ still: [0.35, 0.6], snaps: [20, 60], longest: [0, 3.5], range: [120, 255], ramps: [0.15, 1], tones: [14, 64] });
    expect(p.misses).toContain('still');
    expect(p.misses).toContain('range');
    expect(p.misses).not.toContain('snaps');
  });

  it("lesson: a still of each step's hold", async () => {
    const wf = await tools();
    const [a, b] = [uniqueName('one'), uniqueName('two')];
    await comp(1, `<section id="${a}" data-step data-start="0" data-duration="0.5"></section><section id="${b}" data-step data-start="0.5" data-duration="0.5"></section>`);
    const r = await wf.kinetic.check({ samples: 2, lesson: true });
    expect(r.lesson.ok).toBe(true);
    expect(r.skipped).toBeUndefined();
    for (const s of r.lesson.steps) {
      expect(s.png.type).toBe('image/png');
      expect((await decode(s.png)).width).toBe(160);
    }
  });
});
