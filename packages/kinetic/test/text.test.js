/**
 * text(canvas, { font, lines }): lines of type drawn from baked outlines.
 * The fixtures are the baker's output (bake/outlines.mjs) for KINETIC from
 * Work Sans (weight), AVTo from Roboto Flex (weight and slant) and sl from
 * Shantell Sans (weight and Bounce). Checked:
 * the outlines against the browser's own Work Sans at two weights, the
 * spacing (advances with weight, kerning, fixed slots, alignment), slant by
 * the axis and by skewing, any other axis the outlines hold, each letter's values, the scene's local time and
 * check(), and the KN-100 cases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, dispatchSeek, uniqueName, expectKN, BUILD, CORE_TIER, SITE_FONT, siteHas } from './helpers.js';
import WS from './fixtures/outlines-work-sans.json';
import RF from './fixtures/outlines-roboto-flex.json';
import SS from './fixtures/outlines-shantell-sans.json';

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

async function stage(id) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="2" data-fps="10" data-width="400" data-height="200" style="position:relative;width:400px;height:200px">
    <canvas id="tx" style="position:absolute;left:0;top:0;width:400px;height:200px"></canvas>
  </div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  return { wf, canvas: host.querySelector('#tx') };
}

// The canvas's ink: a 400 x 200 alpha mask, with its box and the ink's
// left edge on a row.
function ink(canvas) {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 200;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, 400, 200);
  const d = g.getImageData(0, 0, 400, 200).data;
  const on = (x, y) => d[(y * 400 + x) * 4 + 3] > 128;
  let x0 = 400, x1 = -1, y0 = 200, y1 = -1;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 400; x++) if (on(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return {
    on, box: { x0, x1, y0, y1 },
    leftAt: (y) => { for (let x = 0; x < 400; x++) if (on(x, y)) return x; return -1; },
    count: () => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n; },
  };
}

async function draw(id, font, lines, t = 0.1) {
  const { wf, canvas } = await stage(id);
  const h = wf.kinetic.text(canvas, { font, lines });
  handles.push(h);
  await dispatchSeek(t).done;
  return { wf, canvas, h, ink: ink(canvas) };
}

const HAS_FONT = await siteHas(SITE_FONT);

describe(`text() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it.skipIf(!HAS_FONT)("draws the font's own outlines: at two weights, within a pixel of the browser's Work Sans", async () => {
    const face = new FontFace('KineticTestWS', `url(${SITE_FONT})`, { weight: '100 900' });
    await face.load();
    document.fonts.add(face);
    try {
      for (const [i, wght] of [300, 800].entries()) {
        const { ink: ours } = await draw('tx' + i, WS, (m) => m.line('KINETIC', { at: [20, 140], size: 80, wght }));
        const ref = document.createElement('canvas');
        ref.width = 400; ref.height = 200;
        const g = ref.getContext('2d');
        g.font = wght + ' 80px KineticTestWS';
        g.fillText('KINETIC', 20, 140);
        const theirs = ink(ref);
        // Pixels inked by one with no pixel of the same kind in the other
        // within a pixel of it, against the ink there is: the shapes, not
        // the antialiasing of their edges.
        const near = (mask, x, y, want) => {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy;
            if (X >= 0 && Y >= 0 && X < 400 && Y < 200 && mask.on(X, Y) === want) return true;
          }
          return false;
        };
        let differ = 0;
        for (let y = 0; y < 200; y++) for (let x = 0; x < 400; x++) if (!near(theirs, x, y, ours.on(x, y))) differ++;
        expect(differ / theirs.count(), 'at wght ' + wght).toBeLessThan(0.01);
        expect(Math.abs(ours.box.x1 - theirs.box.x1), 'the line\'s right end at wght ' + wght).toBeLessThanOrEqual(2);
      }
    } finally { document.fonts.delete(face); }
  });

  it('spacing: a heavier line is wider; fixed slots keep its width; kerning pulls A and V together; align and valign place it', async () => {
    const light = (await draw('sp1', WS, (m) => m.line('KINETIC', { at: [10, 100], size: 40, wght: 200 }))).ink.box;
    const heavy = (await draw('sp2', WS, (m) => m.line('KINETIC', { at: [10, 100], size: 40, wght: 900 }))).ink.box;
    expect(heavy.x1 - heavy.x0).toBeGreaterThan(light.x1 - light.x0 + 8);
    const fixedLight = (await draw('sp3', WS, (m) => m.line('KINETIC', { at: [10, 100], size: 40, wght: 200, spacing: 'fixed' }))).ink.box;
    const fixedHeavy = (await draw('sp4', WS, (m) => m.line('KINETIC', { at: [10, 100], size: 40, wght: 900, spacing: 'fixed' }))).ink.box;
    expect(Math.abs((fixedHeavy.x0 + fixedHeavy.x1) - (fixedLight.x0 + fixedLight.x1)) / 2).toBeLessThan(3);
    // A then V, kerned by -87 units of 2048 at 100 px: about 4 px closer than their advances.
    const av = (await draw('sp5', RF, (m) => m.line('AV', { at: [10, 150], size: 100 }))).ink.box;
    const aa = (await draw('sp6', RF, (m) => m.line('A', { at: [10, 150], size: 100 }))).ink.box;
    const vv = (await draw('sp7', RF, (m) => m.line('V', { at: [10, 150], size: 100 }))).ink.box;
    const unkerned = (1272 / 2048) * 100 + (vv.x1 - 10);
    expect(av.x1 - 10).toBeLessThan(unkerned - 2.5);
    expect(aa.x0).toBeGreaterThanOrEqual(0);
    const centre = (await draw('sp8', WS, (m) => m.line('KINETIC', { at: [200, 100], size: 40, align: 'center', valign: 'middle' }))).ink.box;
    expect(Math.abs((centre.x0 + centre.x1) / 2 - 200)).toBeLessThan(2);
    expect(Math.abs((centre.y0 + centre.y1) / 2 - 100)).toBeLessThan(2);
    const right = (await draw('sp9', WS, (m) => m.line('KINETIC', { at: [390, 100], size: 40, align: 'right' }))).ink.box;
    expect(Math.abs(right.x1 - 390)).toBeLessThan(4);
  });

  it("slant: by the font's slnt axis, or by skewing a font with none, the top leaning right", async () => {
    for (const [id, font, str] of [['sl1', RF, 'T'], ['sl2', WS, 'I']]) {
      const up = (await draw(id + 'a', font, (m) => m.line(str, { at: [150, 160], size: 120 }))).ink;
      const leaning = (await draw(id + 'b', font, (m) => m.line(str, { at: [150, 160], size: 120, slnt: -10 }))).ink;
      const lean = (i) => i.leftAt(i.box.y0 + 4) - i.leftAt(i.box.y1 - 4);
      expect(lean(leaning) - lean(up), font.family).toBeGreaterThan(8);
    }
  });

  it("any axis the outlines hold: Shantell Sans's Bounce moves the s down and the l up, set by the line or by the letter", async () => {
    const at = { at: [150, 160], size: 120 };
    for (const ch of ['s', 'l']) {
      const still = (await draw('bn' + ch + '0', SS, (m) => m.line(ch, at))).ink.box;
      const line = (await draw('bn' + ch + '1', SS, (m) => m.line(ch, { ...at, BNCE: 100 }))).ink.box;
      const own = (await draw('bn' + ch + '2', SS, (m) => m.line(ch, at, () => ({ BNCE: 100 })))).ink.box;
      // At Bounce 100 the s sits 61 units of 1000 lower and the l 45 higher: about 7 and 5 px at 120 px.
      if (ch === 's') expect(line.y0 - still.y0).toBeGreaterThan(5);
      else expect(still.y0 - line.y0).toBeGreaterThan(3);
      expect(own).toEqual(line);
    }
  });

  it("each letter's own values: weight, offset, opacity, colour", async () => {
    const { ink: one } = await draw('le1', WS, (m) => m.line('KINETIC', { at: [10, 100], size: 40 }, (i) => ({ opacity: i === 0 ? 0 : 1, dy: i === 6 ? 40 : 0 })));
    expect(one.leftAt(80)).toBeGreaterThan(30);
    expect(one.box.y1).toBeGreaterThan(120);
    const { canvas } = await draw('le2', WS, (m) => m.line('I', { at: [10, 100], size: 80 }, () => ({ color: '#ff0000' })));
    const c = document.createElement('canvas');
    c.width = 400; c.height = 200;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0, 400, 200);
    const p = g.getImageData(22, 70, 1, 1).data;
    expect(p[0]).toBeGreaterThan(200);
    expect(p[2]).toBeLessThan(40);
    // A letter value left undefined is the line's, color as well as the numbers.
    const { ink: two } = await draw('le3', WS, (m) => m.line('KI', { at: [10, 100], size: 40 }, (i) => ({ color: i === 0 ? '#ff0000' : undefined, wght: undefined })));
    expect(two.box.x1).toBeGreaterThan(30);
  });

  it("with scene: this, lines take the scene's local time, and the scene passes check()", async () => {
    const { wf } = await load();
    const name = uniqueName('textscene');
    scenesToDrop.push(name);
    const seen = [];
    wf.kinetic.scene(name, {
      init() {
        handles.push(wf.kinetic.text(this.element.querySelector('canvas'), { scene: this, font: WS, lines: (m, t) => {
          seen.push(t);
          m.line('KINETIC', { at: [20, 100], size: 40 }, (i) => ({ wght: 400 + 400 * Math.sin(t * 3 + i) }));
        } }));
      },
    });
    const host = await mount(`<div data-composition-id="${name}-c" data-start="0" data-duration="2" data-fps="10" data-width="400" data-height="200" style="position:relative;width:400px;height:200px">
      <div data-component="${name}" data-start="1" data-duration="1" style="position:absolute;inset:0"><canvas style="position:absolute;left:0;top:0;width:400px;height:200px"></canvas></div>
    </div>`);
    cleanup.push(host);
    await dispatchSeek(1.25).done;
    expect(seen[seen.length - 1]).toBeCloseTo(0.25, 5);
    const report = await wf.kinetic.check({ samples: 6 });
    expect(report.ok).toBe(true);
  });

  it('KN-100: outlines not the baker\'s, a bad line option, a character not baked', async () => {
    const { wf, canvas } = await stage('kn1');
    const k = wf.kinetic;
    const err = (fn) => { try { fn(); } catch (e) { return e; } return null; };
    const lines = () => {};
    expectKN(err(() => k.text(canvas, { font: {}, lines })), 'KN-100', 'text(canvas, { font })', /baker/);
    // The lines are an option text() needs; a third argument is KN-100, named for where the lines go.
    expectKN(err(() => k.text(canvas, { font: WS })), 'KN-100', 'text(canvas, { lines })', /^lines is a function \(m, t\) that adds the lines/);
    expectKN(err(() => k.text(canvas, { font: WS }, lines)), 'KN-100', 'text(canvas, options, lines)', /^the lines go in the options: \{ …, lines: \(m, t\) => … \}$/);
    const h0 = k.text(canvas, { font: WS, lines });
    handles.push(h0);
    expectKN(err(() => h0.set({ lines: 'KINETIC' })), 'KN-100', 'set({ lines })', /^lines is a function \(m, t\)/);
    // set({ lines }) swaps the function: the next draw adds its lines.
    await dispatchSeek(0.1).done;
    expect(ink(canvas).count()).toBe(0);
    h0.set({ lines: (m) => m.line('KINETIC', { at: [20, 140], size: 80 }) });
    await dispatchSeek(0.2).done;
    expect(ink(canvas).count()).toBeGreaterThan(100);
    h0.dispose();
    for (const [fn, where, why, font] of [
      [(m) => m.line('KINETIC', { size: 0 }), 'line(string, { size })', /^size is a number/],
      [(m) => m.line('KINETIC', { colour: 'red' }), 'line(string, { colour })', /is not an option/],
      [(m) => m.line('KITX', {}), 'line(string)', /hold no "X"/],
      [(m) => m.line('KINETIC', { align: 'middle' }), 'line(string, { align })', /^align is left, center or right, not/],
      [(m) => m.line('KINETIC', { tracking: '2px' }), 'line(string, { tracking })', /^tracking is a number/],
      [(m) => m.line('KINETIC', {}, () => ({ wght: '500' })), 'letter(i, ch).wght', /^wght is a number/],
      // An axis these outlines were not baked with names the ones they were.
      [(m) => m.line('sl', { INFM: 100 }), 'line(string, { INFM })', /is not an option; .* and an axis the outlines hold: wght, BNCE/, SS],
      [(m) => m.line('sl', {}, () => ({ INFM: 100 })), 'letter(i, ch)', /is not a letter value; .* and an axis the outlines hold: wght, BNCE/, SS],
      [(m) => m.line('sl', { BNCE: 'high' }), 'line(string, { BNCE })', /^BNCE is a number/, SS],
    ]) {
      const c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:200px';
      canvas.parentNode.appendChild(c);
      const h = k.text(c, { font: font || WS, lines: fn });
      let e = null;
      try { await dispatchSeek(0.1).done; } catch (x) { e = x; }
      h.dispose();
      c.remove();
      expectKN(e, 'KN-100', where, why);
    }
  });
});
