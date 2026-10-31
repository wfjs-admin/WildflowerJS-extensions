/**
 * draw(canvas, { …, strokes }): the drawn look. Strokes in pencil, pen and
 * ballpoint, laid by a hand that speeds up and slows down, inked on as the
 * time passes or already drawn. The pixels are read from the layer's canvas
 * through a 2D copy: the draw-on, already drawn, more than four inks each in
 * its colour, the same frame for the same time in any seek order, the
 * paper's tooth held to the frame as the drawing moves, hatching cut to its
 * clip, text written letter by letter, timeOf(), check() on a scene with a
 * drawing, and the KN-100 cases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, dispatchSeek, uniqueName, expectKN, captureWarnings, tick, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const scenesToDrop = [];
const handles = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const h of handles.splice(0)) h.dispose();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

// A 1280 x 200 stage (the hand's own scale) with one canvas for the drawing,
// inside a box the tests can move.
async function stage(id, duration = 4) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="${duration}" data-fps="10" data-width="1280" data-height="200" style="position:relative;width:1280px;height:200px;background:#fff">
    <div id="box" style="position:absolute;left:0;top:0;width:1280px;height:200px"><canvas id="fx" style="position:absolute;left:0;top:0;width:1280px;height:200px"></canvas></div>
  </div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return { wf, host, canvas: host.querySelector('#fx'), box: host.querySelector('#box') };
}

// The canvas read back: at(x, y) a pixel as [r, g, b, a]; inked(x0, x1, y0,
// y1) the share of that box with any ink; hash() of every pixel.
function read(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width; c.height = canvas.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
  return {
    at: px,
    inked(x0, x1, y0, y1) {
      let n = 0, hit = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (px(x, y)[3] > 40) hit++; }
      return hit / n;
    },
    // The most inked pixel in the box, as [r, g, b, a], or null for none.
    darkest(x0, x1, y0, y1) {
      let best = null;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = px(x, y); if (p[3] > 0 && (!best || p[3] > best[3])) best = p; }
      return best;
    },
    hash() { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; },
  };
}

async function drawing(id, opts, t, duration) {
  const { wf, canvas, box } = await stage(id, duration);
  const h = wf.kinetic.draw(canvas, opts);
  handles.push(h);
  await dispatchSeek(t).done;
  return { wf, canvas, box, h };
}

describe(`draw() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('draws on: nothing before it starts, the start of a line before its end, the whole line once the hand is past it', async () => {
    const opts = { start: 0.5, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.contour({ points: [[100, 100], [1100, 100]], ink: 'pen', twice: false }) };
    const { wf, canvas, h } = await drawing('dr1', opts, 0.2);
    expect(read(canvas).inked(80, 1120, 90, 110)).toBe(0);
    // A 1000 px contour at 300 px/s takes about 3.3 s; a third of the way in, its start is drawn and its end not.
    const mid = h.timeOf().start + (h.timeOf().end - h.timeOf().start) / 3;
    expect(h.timeOf().start).toBeCloseTo(0.5, 5);
    expect(h.timeOf().end).toBeGreaterThan(3.5);
    await dispatchSeek(mid).done;
    let r = read(canvas);
    expect(r.inked(100, 200, 95, 105)).toBeGreaterThan(0.1);
    expect(r.inked(1000, 1100, 90, 110)).toBe(0);
    await dispatchSeek(h.duration + 0.1).done;
    r = read(canvas);
    expect(r.inked(100, 200, 95, 105)).toBeGreaterThan(0.1);
    expect(r.inked(1000, 1090, 95, 105)).toBeGreaterThan(0.1);
  });

  it('drawn: true shows the whole drawing at any time', async () => {
    const { canvas } = await drawing('dr2', { drawn: true, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.contour({ points: [[100, 100], [1100, 100]], ink: 'pen' }) }, 0);
    const r = read(canvas);
    expect(r.inked(100, 200, 95, 105)).toBeGreaterThan(0.1);
    expect(r.inked(1000, 1090, 95, 105)).toBeGreaterThan(0.1);
  });

  it('more than four inks, each in its own colour, on one canvas', async () => {
    const colors = ['#d02020', '#20a020', '#2040d0', '#d0a000', '#a020c0', '#0080d0'];
    const inks = {};
    colors.forEach((c, i) => { inks['i' + i] = { tool: 'pen', color: c }; });
    const { canvas } = await drawing('dr3', { drawn: true, inks, strokes: (s) => colors.forEach((c, i) => s.contour({ points: [[60 + i * 200, 60], [60 + i * 200, 160]], ink: 'i' + i, pressure: 1.2 })) }, 0);
    const r = read(canvas);
    colors.forEach((c, i) => {
      const want = [1, 3, 5].map((k) => parseInt(c.substr(k, 2), 16));
      // The ink's darkest point, over white: its hue leads the way the ink's does.
      const p = r.darkest(40 + i * 200, 80 + i * 200, 80, 140);
      expect(p, 'ink ' + c).not.toBeNull();
      const lead = want.indexOf(Math.max(...want)), got = p.slice(0, 3);
      expect(got.indexOf(Math.max(...got)), 'ink ' + c + ' drew ' + p).toBe(lead);
    });
  });

  it('the same time draws the same pixels, whatever the seeks before it', async () => {
    const opts = { inks: { lead: { tool: 'pencil' }, red: { tool: 'pencil', color: '#c03030' } }, strokes: (s) => s
      .construct({ points: [[50, 40], [1200, 60]], ink: 'lead' })
      .contour({ d: 'M100 150 C 400 20 800 190 1150 120', ink: 'red' })
      .hatch({ clip: { rect: [200, 40, 300, 120] }, ink: 'lead', angle: -50, spacing: 8 }) };
    const { wf, canvas } = await drawing('dr4', opts, 1.2);
    const first = read(canvas).hash();
    await dispatchSeek(3.9).done;
    await dispatchSeek(0).done;
    await dispatchSeek(1.2).done;
    expect(read(canvas).hash()).toBe(first);
  });

  it("the paper's tooth belongs to the frame: a pencil drawing moved catches the paper anew, and moved back is as it was", async () => {
    const opts = { drawn: true, inks: { lead: { tool: 'pencil' } }, strokes: (s) => s.hatch({ clip: { rect: [100, 30, 400, 140] }, ink: 'lead', angle: -45, spacing: 6 }) };
    const { wf, canvas, box } = await drawing('dr5', opts, 0);
    const before = read(canvas).hash();
    box.style.transform = 'translate(3px, 2px)';
    await dispatchSeek(0.1).done;
    const moved = read(canvas).hash();
    expect(moved).not.toBe(before);
    box.style.transform = '';
    await dispatchSeek(0.2).done;
    expect(read(canvas).hash()).toBe(before);
  });

  it('hatching stays inside its clip, and cross adds a second layer', async () => {
    const { canvas } = await drawing('dr6', { drawn: true, inks: { lead: { tool: 'pen' } }, strokes: (s) => s.hatch({ clip: { circle: [640, 100, 70] }, ink: 'lead', spacing: 8 }) }, 0);
    const r = read(canvas);
    expect(r.inked(600, 680, 70, 130)).toBeGreaterThan(0.1);
    expect(r.inked(0, 540, 0, 200)).toBe(0);
    expect(r.inked(740, 1280, 0, 200)).toBe(0);
    const one = r.inked(590, 690, 50, 150);
    const { canvas: c2 } = await drawing('dr7', { drawn: true, inks: { lead: { tool: 'pen' } }, strokes: (s) => s.hatch({ clip: { circle: [640, 100, 70] }, ink: 'lead', spacing: 8, cross: true }) }, 0);
    expect(read(c2).inked(590, 690, 50, 150)).toBeGreaterThan(one * 1.3);
    // A Path2D clip hatches the same way.
    const disc = new Path2D();
    disc.arc(640, 100, 70, 0, Math.PI * 2);
    const { canvas: c3 } = await drawing('dr7b', { drawn: true, inks: { lead: { tool: 'pen' } }, strokes: (s) => s.hatch({ clip: disc, ink: 'lead', spacing: 8 }) }, 0);
    const r3 = read(c3);
    expect(r3.inked(600, 680, 70, 130)).toBeGreaterThan(0.1);
    expect(r3.inked(0, 540, 0, 200)).toBe(0);
  });

  it('text is written letter by letter, the first before the last', async () => {
    const opts = { inks: { pen: { tool: 'pen' } }, strokes: (s) => s.text({ text: 'HHHH', font: '700 120px sans-serif', x: 100, y: 150, ink: 'pen', group: 'title' }) };
    const { wf, canvas, h } = await drawing('dr8', opts, 0);
    const { start, end } = h.timeOf('title');
    expect(end).toBeGreaterThan(start);
    await dispatchSeek(start + (end - start) * 0.3).done;
    let r = read(canvas);
    expect(r.inked(100, 180, 60, 150)).toBeGreaterThan(0.1);
    expect(r.inked(330, 420, 60, 150)).toBe(0);
    await dispatchSeek(end + 0.1).done;
    r = read(canvas);
    expect(r.inked(330, 420, 60, 150)).toBeGreaterThan(0.1);
  });

  it('timeOf(group) spans its strokes; pause() and at place strokes in time', async () => {
    const { h } = await drawing('dr9', { start: 1, inks: { pen: { tool: 'pen' } }, strokes: (s) => s
      .contour({ points: [[10, 10], [310, 10]], ink: 'pen', group: 'a', twice: false })
      .pause(0.5)
      .contour({ points: [[10, 50], [310, 50]], ink: 'pen', group: 'b', twice: false })
      .accent({ points: [[10, 90], [110, 90]], ink: 'pen', at: 0.2, group: 'c' }) }, 0);
    const a = h.timeOf('a'), b = h.timeOf('b'), c = h.timeOf('c');
    expect(a.start).toBeCloseTo(1, 5);
    expect(b.start - a.end).toBeGreaterThan(0.5);
    // at is on the same clock as start, not after it.
    expect(c.start).toBeCloseTo(0.2, 5);
    expect(h.duration).toBeCloseTo(b.end, 5);
    expect(h.timeOf('none')).toBe(null);
  });

  it('paper: a colour paints the sheet, blended normally; none multiplies the ink onto what is under it', async () => {
    const { canvas } = await drawing('dr10', { paper: '#f3efe6', drawn: true, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.contour({ points: [[100, 100], [300, 100]], ink: 'pen' }) }, 0);
    const p = read(canvas).at(800, 150);
    expect(p[3]).toBe(255);
    expect(Math.abs(p[0] - 0xf3)).toBeLessThan(12);
    expect(canvas.style.mixBlendMode).toBe('normal');
    const { canvas: c2 } = await drawing('dr11', { drawn: true, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.contour({ points: [[100, 100], [300, 100]], ink: 'pen' }) }, 0);
    expect(read(c2).at(800, 150)[3]).toBe(0);
    expect(c2.style.mixBlendMode).toBe('multiply');
  });

  it('a scene with a drawing in its init() passes check()', async () => {
    const { wf } = await load();
    const name = uniqueName('draw');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      init() {
        handles.push(wf.kinetic.draw(this.element.querySelector('canvas'), { scene: this, inks: { lead: { tool: 'pencil' } }, strokes: (s) => s
          .contour({ d: 'M40 100 C 300 10 600 190 1200 100', ink: 'lead' }) }));
      },
    });
    const host = await mount(`<div data-composition-id="${name}-c" data-start="0" data-duration="2" data-fps="10" data-width="1280" data-height="200" style="position:relative;width:1280px;height:200px">
      <div data-component="${name}" data-start="0" data-duration="2" style="position:absolute;inset:0"><canvas style="position:absolute;left:0;top:0;width:1280px;height:200px"></canvas></div>
    </div>`);
    cleanup.push(host);
    const report = await wf.kinetic.check({ samples: 6 });
    expect(report.ok).toBe(true);
  });

  it('KN-100 for a bad call: the canvas, the options, the strokes, an ink, a stroke', async () => {
    const { wf, canvas } = await stage('dr12');
    const k = wf.kinetic;
    const ok = { inks: { pen: { tool: 'pen' } } };
    expectKN(() => k.draw(document.createElement('div'), { strokes: () => {} }), 'KN-100', 'draw(canvas)');
    expectKN(() => k.draw(canvas, Object.assign({}, ok)), 'KN-100', 'draw(canvas, { strokes })');
    expectKN(() => k.draw(canvas, Object.assign({ wobble: 'x' }, ok, { strokes: () => {} })), 'KN-100', 'draw(canvas, { wobble })');
    expectKN(() => k.draw(canvas, Object.assign({ colour: 1 }, ok, { strokes: () => {} })), 'KN-100', 'draw(canvas, { colour })');
    expectKN(() => k.draw(canvas, { inks: { pen: { tool: 'brush' } }, strokes: () => {} }), 'KN-100', 'draw(canvas, { inks: { pen: { tool } } })');
    expectKN(() => k.draw(canvas, Object.assign({}, ok, { strokes: (s) => s.contour({ points: [[0, 0], [9, 9]], ink: 'red' }) })), 'KN-100', 'contour({ ink })');
    expectKN(() => k.draw(canvas, Object.assign({}, ok, { strokes: (s) => s.contour({ ink: 'pen' }) })), 'KN-100', 'contour({ d, points })');
    expectKN(() => k.draw(canvas, Object.assign({}, ok, { strokes: (s) => s.hatch({ ink: 'pen' }) })), 'KN-100', 'hatch({ clip })');
    expectKN(() => k.draw(canvas, Object.assign({}, ok, { strokes: (s) => s.text({ text: 'a', ink: 'pen' }) })), 'KN-100', 'text({ font })');
    const many = {};
    for (let i = 0; i < 17; i++) many['i' + i] = { tool: 'pen' };
    expectKN(() => k.draw(canvas, { inks: many, strokes: () => {} }), 'KN-100', 'draw(canvas, { inks })');
  });

  it('a later stroke in the same ink over an earlier one shows its ink from its own time, not the earlier one\'s', async () => {
    const line = [[100, 100], [600, 100]];
    const alone = { inks: { lead: { tool: 'pencil' } }, strokes: (s) => s.construct({ points: line, ink: 'lead' }) };
    const both = { inks: { lead: { tool: 'pencil' } }, strokes: (s) => s.construct({ points: line, ink: 'lead' }).pause(3).accent({ points: line, ink: 'lead' }) };
    const { canvas: a, h: ha } = await drawing('dr13', alone, 0);
    const { canvas: b, h: hb } = await drawing('dr14', both, 0);
    const before = ha.duration + 1.5;
    expect(before).toBeLessThan(hb.duration - 1);
    await dispatchSeek(before).done;
    expect(read(b).hash()).toBe(read(a).hash());
    await dispatchSeek(hb.duration + 0.2).done;
    expect(read(b).darkest(100, 600, 90, 110)[3]).toBeGreaterThan(read(a).darkest(100, 600, 90, 110)[3]);
  });

  it('hatching fills every part of a clip: both shapes of a two-part path, and both legs of a U', async () => {
    const { canvas } = await drawing('dr15', { drawn: true, inks: { lead: { tool: 'pen' } }, strokes: (s) => s
      .hatch({ clip: { path: 'M100 40 h200 v120 h-200 Z M400 40 h200 v120 h-200 Z' }, ink: 'lead', angle: 0, spacing: 8 })
      .hatch({ clip: { polygon: [[800, 30], [840, 30], [840, 130], [960, 130], [960, 30], [1000, 30], [1000, 170], [800, 170]] }, ink: 'lead', angle: 0, spacing: 8 }) }, 0);
    const r = read(canvas);
    expect(r.inked(120, 280, 50, 150)).toBeGreaterThan(0.1);
    expect(r.inked(420, 580, 50, 150)).toBeGreaterThan(0.1);
    expect(r.inked(805, 835, 40, 120)).toBeGreaterThan(0.1);
    expect(r.inked(965, 995, 40, 120)).toBeGreaterThan(0.1);
  });

  it('KN-100 for text() in a font CSS cannot read, such as a family with no size', async () => {
    const { wf, canvas } = await stage('dr16');
    expectKN(() => wf.kinetic.draw(canvas, { inks: { pen: { tool: 'pen' } }, strokes: (s) => s.text({ text: 'a', font: 'Manrope', x: 10, y: 50, ink: 'pen' }) }), 'KN-100', 'text({ font })');
  });

  it('a context the browser loses is warned about in development, and drawn again once restored', async () => {
    const opts = { drawn: true, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.contour({ points: [[100, 100], [1100, 100]], ink: 'pen' }) };
    const { canvas } = await drawing('dr17', opts, 0);
    expect(read(canvas).inked(100, 1100, 95, 105)).toBeGreaterThan(0.1);
    const ext = canvas.getContext('webgl2').getExtension('WEBGL_lose_context');
    const lines = await captureWarnings(async () => {
      ext.loseContext();
      await new Promise((r) => canvas.addEventListener('webglcontextlost', r, { once: true }));
      await tick(0);
    });
    const kn = lines.filter((l) => l.includes('KN-191'));
    if (BUILD === 'dev') expect(kn.length, lines.join(' || ')).toBe(1);
    else expect(kn).toEqual([]);
    ext.restoreContext();
    await new Promise((r) => canvas.addEventListener('webglcontextrestored', r, { once: true }));
    await dispatchSeek(0.2).done;
    expect(read(canvas).inked(100, 1100, 95, 105)).toBeGreaterThan(0.1);
  });

  it('a canvas drawn on again after dispose(), as a scene brought back does, draws', async () => {
    const opts = { drawn: true, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.contour({ points: [[100, 100], [1100, 100]], ink: 'pen' }) };
    const { wf, canvas, h } = await drawing('dr18', opts, 0);
    h.dispose();
    handles.push(wf.kinetic.draw(canvas, opts));
    await dispatchSeek(0.3).done;
    expect(read(canvas).inked(100, 1100, 95, 105)).toBeGreaterThan(0.1);
  });

  it('end paces the strokes that follow one another and leaves a stroke pinned with at where it is; timeOf() starts at the earliest stroke', async () => {
    const { wf, canvas } = await stage('dr28', 30);
    const strokes = (s) => s
      .contour({ points: [[100, 100], [200, 100]], ink: 'pen', twice: false, at: 0.2, group: 'early' })
      .contour({ points: [[300, 100], [600, 100]], ink: 'pen', twice: false, group: 'flow' })
      .contour({ points: [[700, 100], [800, 100]], ink: 'pen', twice: false, at: 5, group: 'late' });
    const free = wf.kinetic.draw(canvas, { start: 1, inks: { pen: { tool: 'pen' } }, strokes });
    const early = free.timeOf('early'), late = free.timeOf('late');
    expect(early.start).toBeCloseTo(0.2, 5);
    expect(free.timeOf().start).toBeCloseTo(0.2, 5);
    free.dispose();
    const paced = wf.kinetic.draw(canvas, { start: 1, end: 20, inks: { pen: { tool: 'pen' } }, strokes });
    handles.push(paced);
    expect(paced.timeOf('early').start).toBeCloseTo(0.2, 5);
    expect(paced.timeOf('early').end).toBeCloseTo(early.end, 5);
    expect(paced.timeOf('late').start).toBeCloseTo(5, 5);
    expect(paced.timeOf('late').end).toBeCloseTo(late.end, 5);
    expect(paced.timeOf('flow').start).toBeCloseTo(1, 5);
    expect(paced.timeOf('flow').end).toBeCloseTo(20, 5);
    expect(paced.duration).toBeCloseTo(20, 5);
  });

  it('a rect clip with a negative width or height hatches the same box as its positive form', async () => {
    const hatched = async (id, rect) => read((await drawing(id, { drawn: true, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.hatch({ clip: { rect }, ink: 'pen', spacing: 8 }) }, 0)).canvas).inked(300, 500, 70, 130);
    const plain = await hatched('dr24', [300, 50, 200, 100]);
    expect(plain).toBeGreaterThan(0.1);
    expect(await hatched('dr25', [500, 50, -200, 100])).toBeGreaterThan(plain * 0.7);
    expect(await hatched('dr26', [500, 150, -200, -100])).toBeGreaterThan(plain * 0.7);
  });

  it('a Path2D hatch clip planned before the canvas has a layout keeps its duration and times once it is drawn', async () => {
    const { wf, canvas } = await stage('dr27');
    canvas.style.display = 'none';
    const band = new Path2D();
    band.rect(40, 40, 1200, 120);
    const h = wf.kinetic.draw(canvas, { inks: { pen: { tool: 'pen' } }, strokes: (s) => s.hatch({ clip: band, ink: 'pen', spacing: 8, group: 'band' }) });
    handles.push(h);
    const before = h.duration, span = h.timeOf('band');
    canvas.style.display = '';
    await dispatchSeek(0.5).done;
    expect(h.duration).toBeCloseTo(before, 5);
    expect(h.timeOf('band').end).toBeCloseTo(span.end, 5);
  });

  it('KN-100 for a hatch clip path the grammar cannot read, a canvas with a 2D context, and a second drawing on one canvas', async () => {
    const { wf, canvas, host } = await stage('dr23');
    const k = wf.kinetic, inks = { pen: { tool: 'pen' } };
    expectKN(() => k.draw(canvas, { inks, strokes: (s) => s.hatch({ clip: { path: 'garbage' }, ink: 'pen' }) }), 'KN-100', 'hatch({ clip })', /grammar stops at character 0/);
    const flat = document.createElement('canvas');
    host.appendChild(flat);
    flat.getContext('2d');
    expectKN(() => k.draw(flat, { inks, strokes: (s) => s.accent({ points: [[0, 0], [9, 9]], ink: 'pen' }) }), 'KN-100', 'draw(canvas): WebGL 2');
    const line = (s) => s.accent({ points: [[100, 100], [600, 100]], ink: 'pen' });
    const first = k.draw(canvas, { inks, strokes: line });
    handles.push(first);
    expectKN(() => k.draw(canvas, { inks, strokes: line }), 'KN-100', 'draw(canvas)', /already has a drawing/);
    first.dispose();
    handles.push(k.draw(canvas, { inks, strokes: line }));
  });

  it('a thin line at a small data-width or lead thins and lightens, and does not vanish', async () => {
    const { wf } = await load();
    // The summed alpha of a ruler line across a composition `w` px wide,
    // divided by the scale squared, so it stays about the same as w changes.
    const ink = async (w, tool, lead = 1) => {
      const h = Math.round(w / 6.4);
      const host = await mount(`<div data-composition-id="${uniqueName('thin')}" data-start="0" data-duration="2" data-fps="10" data-width="${w}" data-height="${h}" style="position:relative;width:${w}px;height:${h}px"><canvas style="position:absolute;left:0;top:0;width:${w}px;height:${h}px"></canvas></div>`);
      cleanup.push(host);
      wf.kinetic.config({});
      const canvas = host.querySelector('canvas');
      const d = wf.kinetic.draw(canvas, { drawn: true, wobble: 0, lead, inks: { k: { tool } }, strokes: (s) => s.contour({ points: [[w * 0.1, Math.round(h / 2)], [w * 0.9, Math.round(h / 2)]], ink: 'k', twice: false }) });
      handles.push(d);
      await dispatchSeek(0.5).done;
      const c = document.createElement('canvas');
      c.width = canvas.width; c.height = canvas.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(canvas, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 3; i < px.length; i += 4) sum += px[i];
      const S = (w / 1280) * (canvas.width / w);
      return sum / (S * S);
    };
    for (const tool of ['pen', 'pencil']) {
      const full = await ink(1280, tool);
      expect(full, tool).toBeGreaterThan(0);
      for (const w of [640, 320]) {
        // Before the fix: pen 0.047 at 640 and 0 at 320, pencil 0 at 320.
        // Spread by area the pen kept 0.27 at 320, washed out; by width it
        // keeps 0.76, and the pencil 0.59.
        const r = (await ink(w, tool)) / full;
        expect(r, tool + ' at ' + w).toBeGreaterThan(0.4);
        expect(r, tool + ' at ' + w).toBeLessThan(1.6);
      }
    }
    const thin = (await ink(1280, 'pen', 0.3)) / (await ink(1280, 'pen'));
    expect(thin, 'lead 0.3').toBeGreaterThan(0.05);
  });

  it('text in a font sized in pt, rem or em is as tall as the same size in px, not clipped', async () => {
    // The rows an "H" with its baseline at 170 inks, drawn already drawn.
    const rows = async (id, font) => {
      const opts = { drawn: true, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.text({ text: 'H', font, x: 100, y: 170, ink: 'pen' }) };
      const { canvas, h } = await drawing(id, opts, 0.5);
      const r = read(canvas);
      let n = 0;
      for (let y = 0; y < 200; y++) if (r.inked(90, 200, y, y + 1) > 0) n++;
      h.dispose();
      return n;
    };
    const px = await rows('dr20', '700 96px sans-serif');
    expect(px).toBeGreaterThan(50);
    for (const [id, font] of [['dr21', '700 72pt sans-serif'], ['dr22', '700 6rem sans-serif']]) {
      expect(Math.abs(await rows(id, font) - px), font).toBeLessThan(3);
    }
  });

  it('a drawing that starts late in a long composition is drawn on from its start, not before', async () => {
    const opts = { start: 280, inks: { pen: { tool: 'pen' } }, strokes: (s) => s.contour({ points: [[100, 100], [1100, 100]], ink: 'pen', twice: false }) };
    const { canvas, h } = await drawing('dr19', opts, 279, 300);
    expect(read(canvas).inked(100, 1100, 90, 110)).toBe(0);
    await dispatchSeek(h.timeOf().start + (h.duration - h.timeOf().start) / 3).done;
    let r = read(canvas);
    expect(r.inked(100, 200, 95, 105)).toBeGreaterThan(0.1);
    expect(r.inked(1000, 1100, 90, 110)).toBe(0);
    await dispatchSeek(h.duration + 0.1).done;
    expect(read(canvas).inked(1000, 1090, 95, 105)).toBeGreaterThan(0.1);
  });
});
