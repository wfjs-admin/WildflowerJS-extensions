/**
 * textMetrics(text, font, options): a line measured with the canvas's own
 * measureText(), the platform being the oracle: its width and ink box, the
 * tracking in em between letters, each grapheme's left edge and advance, the
 * font size that fits a width, and readiness waiting for the font it was
 * measured with. Work Sans comes from the main site's fonts.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, expectKN, BUILD, CORE_TIER, SITE_FONT, siteHas } from './helpers.js';

const HAS_FONT = await siteHas(SITE_FONT);

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

// The platform's own measure of the same line, for the comparisons.
const ctx = document.createElement('canvas').getContext('2d');
const own = (text, font) => { ctx.font = font; return ctx.measureText(text); };

describe(`textMetrics() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a line's width and ink box are the canvas's own; tracking in em adds between letters, never after the last", async () => {
    const { wf } = await load();
    const { textMetrics } = wf.kinetic;
    const FONT = '700 40px sans-serif';
    const m = textMetrics('Hello', FONT), ref = own('Hello', FONT);
    expect(m.width).toBeCloseTo(ref.width, 6);
    expect(m.left).toBeCloseTo(ref.actualBoundingBoxLeft, 6);
    expect(m.right).toBeCloseTo(ref.actualBoundingBoxRight, 6);
    expect(m.ascent).toBeCloseTo(ref.actualBoundingBoxAscent, 6);
    expect(m.descent).toBeCloseTo(ref.actualBoundingBoxDescent, 6);
    expect(Object.keys(m).sort()).toEqual(['ascent', 'descent', 'left', 'right', 'width']);
    // 0.1 em at 40 px is 4 px, four times between five letters.
    const tracked = textMetrics('Hello', FONT, { tracking: 0.1 });
    expect(tracked.width).toBeCloseTo(ref.width + 16, 6);
    expect(tracked.right).toBeCloseTo(ref.actualBoundingBoxRight + 16, 6);
    expect(textMetrics('', FONT).width).toBe(0);
  });

  it("letters: split()'s rows with each grapheme's left edge and advance, kerning and tracking in", async () => {
    const { wf } = await load();
    const { textMetrics, split } = wf.kinetic;
    const FONT = '40px serif';   // é written as e and a combining accent: one grapheme
    const m = textMetrics('AVé!', FONT, { letters: true });
    const rows = split('AVé!', 'letter');
    expect(m.letters.map((l) => [l.i, l.key, l.text, l.space])).toEqual(rows.map((r) => [r.i, r.key, r.text, r.space]));
    expect(m.letters.length).toBe(4);
    let at = 0;
    m.letters.forEach((l, i) => {
      expect(l.x, 'letter ' + i).toBeCloseTo(own(m.letters.slice(0, i).map((r) => r.text).join(''), FONT).width, 6);
      at = l.x + l.width;
    });
    expect(at).toBeCloseTo(m.width, 6);
    const tracked = textMetrics('AVé!', FONT, { letters: true, tracking: 0.25 });
    tracked.letters.forEach((l, i) => expect(l.x, 'tracked ' + i).toBeCloseTo(m.letters[i].x + 10 * i, 6));
  });

  it('width: the font size at which the line is that wide, tracking included', async () => {
    const { wf } = await load();
    const { textMetrics } = wf.kinetic;
    const fit = textMetrics('Kinetic', '900 100px sans-serif', { width: 600 });
    expect(fit.size).toBeGreaterThan(0);
    expect(textMetrics('Kinetic', '900 ' + fit.size + 'px sans-serif').width).toBeCloseTo(600, 0);
    const spaced = textMetrics('Kinetic', '900 100px sans-serif', { width: 600, tracking: 0.05 });
    expect(textMetrics('Kinetic', '900 ' + spaced.size + 'px sans-serif', { tracking: 0.05 }).width).toBeCloseTo(600, 0);
    expect(spaced.size).toBeLessThan(fit.size);
  });

  it.skipIf(!HAS_FONT)('ready() waits for a font measured with, so a render never measures the fallback', async () => {
    const { wf } = await load();
    const { textMetrics } = wf.kinetic;
    const face = new FontFace('KineticMetricsWS', `url(${SITE_FONT})`, { weight: '100 900' });
    document.fonts.add(face);
    try {
      const host = await mount('<div data-composition-id="tm-ready" data-start="0" data-duration="1"></div>');
      cleanup.push(host);
      expect(face.status).toBe('unloaded');
      textMetrics('Kinetic', '700 60px KineticMetricsWS');
      await wf.kinetic.ready();
      expect(face.status).toBe('loaded');
      expect(textMetrics('Kinetic', '700 60px KineticMetricsWS').width).toBeCloseTo(own('Kinetic', '700 60px KineticMetricsWS').width, 6);
    } finally { document.fonts.delete(face); }
  });

  it.skipIf(!HAS_FONT)('a computed that measured before its font loaded measures again once readiness has loaded it, in a clip hidden at load', async () => {
    const { wf } = await load();
    const { textMetrics } = wf.kinetic;
    const FONT = '700 60px KineticMetricsLate';
    const face = new FontFace('KineticMetricsLate', `url(${SITE_FONT})`, { weight: '100 900' });
    document.fonts.add(face);
    try {
      const name = uniqueName('tm-late');
      wf.kinetic.scene(name, { computed: { size() { return textMetrics('Kinetic', FONT, { width: 300 }).size.toFixed(3); } } });
      const host = await mount(`<div data-composition-id="tm-late" data-start="0" data-duration="4"><div data-component="${name}" data-start="2"><b data-bind="size"></b></div></div>`);
      cleanup.push(host);
      await wf.kinetic.ready();
      wf.kinetic.seek(0);
      await tick(0);
      expect(face.status).toBe('loaded');
      expect(host.querySelector('b').textContent).toBe(textMetrics('Kinetic', FONT, { width: 300 }).size.toFixed(3));
    } finally { document.fonts.delete(face); }
  });

  it('KN-100 for text that is no string, a font the canvas refuses, a tracking that is not finite, and a width that is not above 0 or an empty line to fit', async () => {
    const { wf } = await load();
    const { textMetrics } = wf.kinetic;
    expectKN(() => textMetrics(5, '20px serif'), 'KN-100', 'textMetrics(text)', /^text is a string, not 5/);
    for (const font of ['nonsense', 'bold', 20, '']) {
      expectKN(() => textMetrics('a', font), 'KN-100', 'textMetrics(…, font)', /^font is a CSS font shorthand, such as '700 54px "Work Sans"', not /);
    }
    expectKN(() => textMetrics('a', '20px serif', { tracking: NaN }), 'KN-100', 'textMetrics(…, { tracking })', /^tracking is a finite number of em/);
    expectKN(() => textMetrics('a', '20px serif', { width: 0 }), 'KN-100', 'textMetrics(…, { width })', /^width is a finite number of px above 0/);
    expectKN(() => textMetrics('a', '20px serif', { width: Infinity }), 'KN-100', 'textMetrics(…, { width })');
    expectKN(() => textMetrics('', '20px serif', { width: 100 }), 'KN-100', 'textMetrics(…, { width })', /^an empty line has no width to fit/);
  });
});
