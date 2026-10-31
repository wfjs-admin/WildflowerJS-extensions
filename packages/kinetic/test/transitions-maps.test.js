/**
 * The luma transitions: luma, halftone and dissolve in data-clip-transition,
 * data-clip-enter and data-clip-exit. Each masks the clip with a map: the
 * clip shows where the map is darker than a threshold that sweeps through
 * its tones, through an SVG filter Kinetic keeps in one hidden <svg> in the
 * composition root and writes on the clip only inside the window. The
 * pixels are read from screenshots of a red stage with a blue clip. The
 * luma map is test/fixtures/ramp.png, 256 x 4 and grayscale, column x of
 * value x, so dark on the left.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { load, mount as mountHost, tick, dispatchSeek, captureWarnings, framedPage, uniqueName, expectKN, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const RAMP = '/packages/kinetic/test/fixtures/ramp.png';

async function mount(html) {
  const host = await mountHost(html);
  const { wf } = await load();
  wf.kinetic.config({});
  await wf.kinetic.ready();
  return host;
}

const cleanup = [];
const scenesToDrop = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

// A screenshot of `el` as { at(x, y), share(x0, x1, test) } in the element's
// own CSS pixels: at() is [r, g, b], share() the part of the band from x0 to
// x1 (fractions of the width) whose pixels pass `test`. The runner scales
// the page (k), and the last row and column of the shot are part outside
// the element, so share() leaves them out.
async function shot(el) {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const img = new Image();
  img.src = 'data:image/png;base64,' + await page.screenshot({ save: false, element: el });
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const k = img.width / el.offsetWidth;
  const px = (x, y) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  return {
    k,
    at: (x, y) => px(Math.floor(x * k), Math.floor(y * k)),
    share(x0, x1, test) {
      let n = 0, hit = 0;
      for (let y = 0; y < c.height - 1; y++) {
        for (let x = Math.floor(x0 * c.width); x < Math.min(Math.floor(x1 * c.width), c.width - 1); x++) { n++; if (test(px(x, y))) hit++; }
      }
      return hit / n;
    },
    row(y) { return Array.from({ length: c.width - 1 }, (_, x) => px(x, Math.floor(y * k))); },
  };
}
const blue = ([r, , b]) => b > 200 && r < 60;
const bluish = ([, , b]) => b > 100;
const red = ([r, , b]) => r > 200 && b < 60;
const mixed = ([r, , b]) => r > 30 && r < 225 && b > 30 && b < 225;

// A red stage 200 x 100 with a red clip from 0 to 2 s and a blue one from 1
// to 3 s with `attrs`, at 10 fps: the overlap's p is (t - 1) / 0.9.
const STAGE = 'data-start="0" data-duration="4" data-fps="10" data-width="200" data-height="100" style="position:fixed;left:0;top:0;width:200px;height:100px;background:#ff0000;overflow:hidden"';
const pair = (id, attrs) => `<div data-composition-id="${id}" ${STAGE}>
  <div id="a" style="position:absolute;inset:0;background:#ff0000" data-start="0" data-duration="2"></div>
  <div id="b" style="position:absolute;inset:0;background:#0000ff" data-start="1" data-duration="2" ${attrs}></div>
</div>`;
const at = async (t) => { await dispatchSeek(t).done; };

describe(`luma, halftone and dissolve (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('each kind hides the clip at p = 0, shows the map\'s darkest parts first, reveals it in the map\'s order at 0.5 and shows it at 1, with nothing written outside the window', async () => {
    // `first` checks the frame after p = 0, p = 1/9, where only the map's
    // darkest parts are in: with no map the mask would be all in or all out.
    for (const [kind, check, first] of [
      [`luma url(${RAMP}) linear`, (s) => { expect(s.share(0, 0.4, blue), 'luma, dark left').toBeGreaterThan(0.97); expect(s.share(0.55, 1, blue), 'luma, light right').toBeLessThan(0.02); },
        (s) => { expect(s.share(0, 0.05, bluish), 'luma, the darkest edge').toBeGreaterThan(0.9); expect(s.share(0.15, 1, bluish), 'luma, the rest').toBe(0); }],
      ['halftone from-left linear', (s) => { expect(s.share(0, 0.33, blue), 'halftone, left').toBeGreaterThan(0.5); expect(s.share(0.67, 1, blue), 'halftone, right').toBeLessThan(0.3); expect(s.share(0.67, 1, blue), 'halftone, right has dots').toBeGreaterThan(0.01); },
        (s) => { const l = s.share(0, 0.2, bluish); expect(l, 'halftone, dot centres on the left').toBeGreaterThan(0.005); expect(l).toBeLessThan(0.3); expect(s.share(0.3, 1, bluish), 'halftone, the rest').toBe(0); }],
      ['halftone linear', (s) => { const l = s.share(0, 0.33, blue), r = s.share(0.67, 1, blue); expect(Math.abs(l - r), 'halftone with no direction, ' + l + ' ' + r).toBeLessThan(0.12); expect(l).toBeGreaterThan(0.2); expect(l).toBeLessThan(0.8); },
        (s) => { const l = s.share(0, 0.5, bluish), r = s.share(0.5, 1, bluish); expect(l, 'halftone, small dots everywhere').toBeGreaterThan(0.002); expect(r).toBeGreaterThan(0.002); expect(l + r).toBeLessThan(0.3); }],
      ['dissolve linear', (s) => { const all = s.share(0, 1, blue); expect(all, 'dissolve').toBeGreaterThan(0.3); expect(all).toBeLessThan(0.7); },
        (s) => { const all = s.share(0, 1, bluish); expect(all, 'dissolve, a few grains').toBeGreaterThan(0); expect(all).toBeLessThan(0.2); }],
    ]) {
      const host = await mount(pair('lm1', `data-clip-transition="${kind}"`));
      cleanup.push(host);
      const root = host.firstElementChild, a = host.querySelector('#a'), b = host.querySelector('#b');
      await at(0.5);
      expect([a.style.filter, b.style.filter], kind + ' before').toEqual(['', '']);
      await at(1);
      expect(b.style.filter, kind + ' at p = 0').toMatch(/^url\("?#kinetic-map-\d+"?\)$/);
      expect((await shot(root)).share(0, 1, blue), kind + ' at p = 0').toBe(0);
      await at(1.1);
      first(await shot(root));
      await at(1.45);
      check(await shot(root));
      expect(a.style.filter, kind + ': the outgoing clip stays').toBe('');
      await at(1.9);
      expect(b.style.filter, kind + ' at p = 1').toBe('');
      expect((await shot(root)).share(0, 1, blue), kind + ' at p = 1').toBeGreaterThan(0.99);
      await at(2.5);
      expect([a.style.filter, b.style.filter], kind + ' after').toEqual(['', '']);
      host.remove();
    }
  });

  it('data-clip-exit takes the clip away in the map\'s order, dark first, and data-clip-enter brings it in', async () => {
    const host = await mount(`<div data-composition-id="lm2" ${STAGE}>
      <div id="c" style="position:absolute;inset:0;background:#0000ff" data-start="0" data-duration="3" data-clip-enter="luma url(${RAMP}) 1 linear" data-clip-exit="luma url(${RAMP}) linear 10f"></div>
    </div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    await at(0.45);
    let s = await shot(root);
    expect(s.share(0, 0.4, blue), 'enter: dark left in').toBeGreaterThan(0.97);
    expect(s.share(0.55, 1, red), 'enter: light right still out').toBeGreaterThan(0.97);
    await at(2);
    expect((await shot(root)).share(0, 1, blue), 'exit at p = 0').toBeGreaterThan(0.99);
    await at(2.45);
    s = await shot(root);
    expect(s.share(0, 0.4, red), 'exit: dark left gone').toBeGreaterThan(0.97);
    expect(s.share(0.55, 1, blue), 'exit: light right still there').toBeGreaterThan(0.97);
    await at(2.9);
    expect((await shot(root)).share(0, 1, red), 'exit at p = 1').toBeGreaterThan(0.99);
  });

  it('invert reveals the light parts first, and soft widens the edge', async () => {
    // Three pairs, one above another, each in a group of its own so that
    // each incoming clip has one sibling to replace.
    const group = (top, id, attr) => `<div style="position:absolute;left:0;top:${top}px;width:200px;height:100px">
      <div style="position:absolute;inset:0;background:#ff0000" data-start="0" data-duration="2"></div>
      <div id="${id}" style="position:absolute;inset:0;background:#0000ff" data-start="1" data-duration="2" data-clip-transition="${attr}"></div>
    </div>`;
    const host = await mount(`<div data-composition-id="lm3" ${STAGE.replace('height:100px', 'height:300px').replace('data-height="100"', 'data-height="300"')}>
      ${group(0, 'hard', `luma url(${RAMP}) linear`)}${group(100, 'soft', `luma soft url(${RAMP}) linear`)}${group(200, 'inv', `luma linear invert url(${RAMP})`)}
    </div>`);
    cleanup.push(host);
    await at(1.45);
    const s = await shot(host.firstElementChild);
    const edge = (y) => s.row(y).filter(mixed).length / s.k;
    // The edge is where the mask is between 0 and 1: 200 / k px of the ramp,
    // and the colours counted here are its middle three quarters.
    expect(edge(50), 'hard edge in CSS px').toBeLessThan(9);
    expect(edge(150), 'soft edge in CSS px').toBeGreaterThan(14);
    const inv = s.row(250);
    expect(blue(inv[Math.floor(inv.length * 0.8)]) && red(inv[Math.floor(inv.length * 0.2)]), 'invert: right in, left out').toBe(true);
  });

  it('the filter: one per clip and attribute in a hidden <svg> in the root; only the intercept changes per seek, and it reads 0 outside the window', async () => {
    const host = await mount(`<div data-composition-id="lm4" ${STAGE}>
      <div id="a" style="position:absolute;inset:0" data-start="0" data-duration="2"></div>
      <div id="b" style="position:absolute;inset:0" data-start="1" data-duration="2" data-clip-transition="halftone linear" data-clip-exit="dissolve soft 0.5 linear"></div>
      <div id="c" style="position:absolute;inset:0" data-start="0" data-duration="4" data-clip-enter="luma invert url(${RAMP}) 1 linear"></div>
    </div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    const svg = root.querySelector(':scope > svg');
    expect(svg, 'the hidden svg').not.toBeNull();
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelectorAll('filter').length).toBe(3);
    const filterOf = (id) => { const m = /#([\w-]+)/.exec(host.querySelector('#' + id).style.filter); return m && svg.querySelector('#' + m[1]); };
    const funcs = () => [...svg.querySelectorAll('feFuncA')].map((f) => f.getAttribute('slope') + '/' + f.getAttribute('intercept'));
    await at(1.45);
    // b at p = 0.5: k = 30, threshold 0.5. c at p = 1.45 / 0.9 > 1: no filter.
    const fb = filterOf('b');
    expect(fb.querySelector('feFuncA').getAttribute('slope')).toBe('-30');
    expect(fb.querySelector('feFuncA').getAttribute('intercept')).toBe('15');
    expect(fb.querySelector('feImage').getAttribute('href')).toMatch(/^blob:/);
    expect(fb.getAttribute('color-interpolation-filters')).toBe('sRGB');
    expect(host.querySelector('#c').style.filter).toBe('');
    // c at p = 0.5, inverted: k (threshold - 1) with slope 30.
    await at(0.45);
    const fc = filterOf('c');
    expect(fc.querySelector('feFuncA').getAttribute('slope') + '/' + fc.querySelector('feFuncA').getAttribute('intercept')).toBe('30/-15');
    expect(fc.querySelector('feImage').getAttribute('href')).toMatch(/^blob:/);
    // b's exit, soft, at p = 0.5: k = 8, 1 - 8 * 0.5 with slope 8.
    await at(2.5 + 0.2);
    const fe = filterOf('b');
    expect(fe).not.toBe(fb);
    expect(fe.querySelector('feFuncA').getAttribute('slope') + '/' + fe.querySelector('feFuncA').getAttribute('intercept')).toBe('8/-3');
    // At p = 0 the incoming clip is fully hidden: k * (-1 / k) = -1.
    await at(1);
    expect(filterOf('b').querySelector('feFuncA').getAttribute('intercept')).toBe('-1');
    // Outside every window the intercepts read 0, so a frame's attributes
    // read the same whichever frame came before.
    await at(3.5);
    expect(funcs().map((f) => f.split('/')[1])).toEqual(['0', '0', '0']);
    expect(['a', 'b', 'c'].map((id) => host.querySelector('#' + id).style.filter)).toEqual(['', '', '']);
  });

  it('three clips joined by luma, halftone and dissolve pass check() with no console lines', async () => {
    const { wf } = await load();
    const lines = [];
    const origWarn = console.warn, origError = console.error;
    console.warn = (...a) => lines.push('warn: ' + a.join(' '));
    console.error = (...a) => lines.push('error: ' + a.join(' '));
    let report;
    try {
      const host = await mount(`<div data-composition-id="lm5" data-start="0" data-duration="6" data-fps="30" style="position:relative;width:320px;height:180px;overflow:hidden">
        <div id="c1" style="position:absolute;inset:0;background:#203040" data-start="0" data-duration="2" data-clip-enter="dissolve 3px 18f"></div>
        <div id="c2" style="position:absolute;inset:0;background:#402030" data-start="c1 - 0.6" data-duration="2" data-clip-transition="halftone from-top 24px 30deg power2.inOut"></div>
        <div id="c3" style="position:absolute;inset:0;background:#304020" data-start="c2 - 0.6" data-duration="2.2" data-clip-transition="luma url(${RAMP}) soft" data-clip-exit="halftone from-right 18f"></div>
      </div>`);
      cleanup.push(host);
      await at(1.7);
      expect(host.querySelector('#c2').style.filter).not.toBe('');
      report = await wf.kinetic.check({ samples: 60 });
    } finally {
      console.warn = origWarn; console.error = origError;
    }
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(lines).toEqual([]);
  });

  it('KN-115: a token a kind does not take, a url() on a kind that takes none, luma with no url(), two of one token; each warns once in development and leaves the clip as it is', async () => {
    const one = (id, attrs) => `<div class="g"><div id="${id}-a" data-start="0" data-duration="2"></div><div id="${id}" data-start="1" data-duration="2" ${attrs}></div></div>`;
    let host = null;
    // Readiness applies the transitions once, so the warnings come from mount() on.
    const lines = await captureWarnings(async () => {
      host = await mount(`<div data-composition-id="lm6" data-start="0" data-duration="4" data-fps="10">
        ${one('nourl', 'data-clip-transition="luma soft"')}
        ${one('urlon', `data-clip-transition="halftone url(${RAMP})"`)}
        ${one('inv', 'data-clip-transition="dissolve invert"')}
        ${one('cells', 'data-clip-transition="halftone 24px 30px"')}
        ${one('maps', `data-clip-transition="luma url(${RAMP}) url(${RAMP})"`)}
        ${one('dir', 'data-clip-transition="dissolve from-left"')}
        ${one('deg', 'data-clip-transition="dissolve 30deg"')}
        ${one('zero', 'data-clip-transition="halftone 0px"')}
        ${one('word', 'data-clip-enter="halftone sideways 0.5"')}
      </div>`);
      cleanup.push(host);
      const all = [...host.querySelectorAll('.g > *')];
      for (const t of [1, 1.45, 1.9, 2.5]) {
        await at(t);
        for (const el of all) expect(el.style.filter, el.id + ' at ' + t).toBe('');
      }
    });
    const kn = lines.filter((l) => /KN-11[56]/.test(l));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    const of = (id) => kn.filter((l) => l.includes('#' + id + ' '));
    for (const id of ['nourl', 'urlon', 'inv', 'cells', 'maps', 'dir', 'deg', 'zero', 'word']) {
      expect(of(id).length, id + ': ' + kn.join(' || ')).toBe(1);
      expect(of(id)[0], id).toMatch(/\[KN-115\]/);
    }
    expect(kn.length).toBe(9);
    expect(of('nourl')[0]).toMatch(/luma takes its map as url\(path\), and it has none/);
    expect(of('urlon')[0]).toMatch(/is a map, and only luma takes one/);
    expect(of('inv')[0]).toMatch(/'invert'.*luma/);
    expect(of('cells')[0]).toMatch(/two cells/);
    expect(of('maps')[0]).toMatch(/two maps/);
    expect(of('dir')[0]).toMatch(/dissolve takes no direction/);
    expect(of('deg')[0]).toMatch(/'30deg'.*halftone/);
    expect(of('zero')[0]).toMatch(/'0px' is 0/);
    expect(of('word')[0]).toMatch(/'sideways'/);
  });

  it('transition() is for the kinds with no map: KN-100 for luma, halftone and dissolve', async () => {
    const { wf } = await load();
    for (const kind of ['luma', 'halftone', 'dissolve']) {
      let err = null;
      try { wf.kinetic.transition(kind, 0.5); } catch (e) { err = e; }
      expectKN(err, 'KN-100', "transition('" + kind + "')", /data-clip-transition, data-clip-enter and data-clip-exit/);
    }
  });

  it("KN-156: a scene's root: block that writes filter on a clip with a dissolve warns once in development", async () => {
    const { wf } = await load();
    const name = uniqueName('rootfilter');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      root: { style: { filter: 'look' } },
      computed: { look() { return 'saturate(' + (1 + Math.round(this.local * 10) / 10) + ')'; } },
    });
    const host = await mount(`<div data-composition-id="lm7" data-start="0" data-duration="4" data-fps="10">
      <div class="g"><div data-start="0" data-duration="2"></div><div id="sc" data-component="${name}" data-start="1" data-duration="2" data-clip-transition="dissolve"></div></div>
    </div>`);
    cleanup.push(host);
    const lines = await captureWarnings(async () => {
      for (const t of [0.5, 1.2, 1.45, 1.7, 2.5, 1.3]) await at(t);
    });
    const kn = lines.filter((l) => l.includes('KN-156'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, lines.join(' || ')).toBe(1);
    expect(kn[0]).toMatch(/div#sc.*filter/);
  });

  it('a clip added after load with a luma transition, then ready(): its map is loaded and applied; a clip removed during a transition leaves nothing behind', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="lm8" ${STAGE}>
      <div id="a" style="position:absolute;inset:0;background:#ff0000" data-start="0" data-duration="2"></div>
    </div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    await at(0.5);
    root.insertAdjacentHTML('beforeend', `<div id="b" style="position:absolute;inset:0;background:#0000ff" data-start="1" data-duration="2" data-clip-transition="luma url(${RAMP}) linear"></div>`);
    await wf.kinetic.ready();
    await at(1.45);
    const s = await shot(root);
    expect(s.share(0, 0.4, blue)).toBeGreaterThan(0.97);
    expect(s.share(0.55, 1, blue)).toBeLessThan(0.02);
    // Removed in the middle of its transition: its filter goes with it, and
    // the seeks and check() that follow see no trace of it.
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      root.querySelector('#b').remove();
      await at(1.5);
      expect(root.querySelectorAll('svg filter').length).toBe(0);
      expect(root.querySelector('#a').style.filter).toBe('');
      const report = await wf.kinetic.check({ samples: 20 });
      expect(report.ok, JSON.stringify(report)).toBe(true);
    } finally { console.error = orig; }
    expect(errors).toEqual([]);
  });

  it("a dissolve-entered caption whose box grows as its text wraps passes check()", async () => {
    const { wf } = await load();
    const name = uniqueName('caption');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, { computed: { line() { return wf.kinetic.typewriter(this.local, 'one two three four five six seven eight', 40); } } });
    const host = await mount(`<div data-composition-id="lm9" data-start="0" data-duration="3" data-fps="30" style="position:relative;width:200px;height:200px">
      <div data-component="${name}" data-start="0" data-duration="3" style="position:absolute;inset:0">
        <p id="cap" data-start="0" data-duration="3" data-clip-enter="dissolve 1" data-bind="line" style="position:absolute;left:0;top:0;width:96px;margin:0;font:16px/20px monospace"></p>
      </div>
    </div>`);
    cleanup.push(host);
    const heights = new Set();
    for (const t of [0.3, 0.6, 0.9]) { await at(t); heights.add(host.querySelector('#cap').offsetHeight); }
    expect(heights.size, 'the caption wraps onto more lines as it types').toBeGreaterThan(1);
    const report = await wf.kinetic.check({ samples: 60 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
  });

  it('KN-115: a clip whose own box is empty under a map transition warns once in development', async () => {
    const lines = await captureWarnings(async () => {
      const host = await mount(`<div data-composition-id="lm10" ${STAGE}>
        <div style="position:absolute;inset:0" data-start="0" data-duration="2"></div>
        <div id="flat" style="position:absolute;left:0;top:0;width:200px;height:0" data-start="1" data-duration="2" data-clip-transition="dissolve"><div style="width:200px;height:100px;background:#0000ff"></div></div>
      </div>`);
      cleanup.push(host);
      for (const t of [1.2, 1.5, 1.8]) await at(t);
    });
    const kn = lines.filter((l) => l.includes('KN-115'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, lines.join(' || ')).toBe(1);
    expect(kn[0]).toMatch(/div#flat .*box is empty/);
  });

  it('a luma clip added after readiness stays hidden through its transition until ready() has loaded its map', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="lm11" ${STAGE}><div style="position:absolute;inset:0;background:#ff0000" data-start="0" data-duration="2"></div></div>`);
    cleanup.push(host);
    const root = host.firstElementChild;
    root.insertAdjacentHTML('beforeend', `<div id="b" style="position:absolute;inset:0;background:#0000ff" data-start="1" data-duration="2" data-clip-transition="luma url(${RAMP}?late=1) linear"></div>`);
    await at(1.45);
    expect((await shot(root)).share(0, 1, bluish), 'before ready()').toBe(0);
    await tick(300);
    await at(1.46);
    expect((await shot(root)).share(0, 1, bluish), 'still before ready()').toBe(0);
    await wf.kinetic.ready();
    await at(1.45);
    const s = await shot(root);
    expect(s.share(0, 0.4, blue)).toBeGreaterThan(0.97);
    expect(s.share(0.55, 1, blue)).toBeLessThan(0.02);
  });

  it('a clip hidden outside its window shows its wipe and its iris as they are inside it', async () => {
    for (const [kind, check] of [
      ['wipe linear', (s) => { expect(s.share(0, 0.45, blue), 'wipe, left').toBeGreaterThan(0.97); expect(s.share(0.55, 1, red), 'wipe, right').toBeGreaterThan(0.97); }],
      ['iris linear', (s) => { expect(blue(s.at(100, 50)), 'iris, centre').toBe(true); expect(red(s.at(3, 3)), 'iris, corner').toBe(true); }],
    ]) {
      const host = await mount(pair('lm12', `data-clip-transition="${kind}"`));
      cleanup.push(host);
      const root = host.firstElementChild, b = host.querySelector('#b');
      await at(0.5);
      expect(b.hasAttribute('data-kinetic-hidden'), kind).toBe(true);
      expect((await shot(root)).share(0, 1, bluish), kind + ' before').toBe(0);
      await at(1.45);
      expect(b.hasAttribute('data-kinetic-hidden'), kind).toBe(false);
      check(await shot(root));
      host.remove();
    }
  });
});

describe(`the maps, page by page (${BUILD} extension, ${CORE_TIER} core)`, () => {
  const body = `<div data-composition-id="mp" data-start="0" data-duration="4" data-fps="10" data-width="200" data-height="100" style="position:relative;width:200px;height:100px">
    <div id="a" style="position:absolute;inset:0" data-start="0" data-duration="2"></div>
    <div id="b" style="position:absolute;inset:0" data-start="1" data-duration="2" data-clip-transition="halftone from-left 20px 30deg"></div>
    <div id="c" style="position:absolute;inset:0" data-start="0" data-duration="4" data-clip-enter="dissolve 3px 1"></div>
  </div>`;
  // The SHA-256 of each built-in map, fetched from its feImage inside the page.
  const hashes = (w) => w.eval(`Promise.all([...document.querySelectorAll('feImage')].map((f) => fetch(f.getAttribute('href')).then((r) => r.arrayBuffer()).then((b) => crypto.subtle.digest('SHA-256', b)).then((d) => Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join(''))))`);

  it('the built-in maps are the same PNG on two page loads', async () => {
    const one = await framedPage(body, cleanup);
    expect(one.result).toBe('resolved');
    const two = await framedPage(body, cleanup);
    expect(two.result).toBe('resolved');
    const [h1, h2] = [await hashes(one.w), await hashes(two.w)];
    expect(h1.length).toBe(2);
    expect(h1[0]).not.toBe(h1[1]);
    expect(h2).toEqual(h1);
  });

  it('a map that is not there is KN-117 on the console on every build, ready() rejects with it, and readiness holds', async () => {
    const p = await framedPage(`<div data-composition-id="mp2" data-start="0" data-duration="2" data-fps="10">
      <div id="gone" data-start="0" data-duration="2" data-clip-enter="luma url(/packages/kinetic/test/fixtures/no-such-map.png) 0.5"></div>
    </div>`, cleanup);
    const { w, result } = p;
    expectKN(result, 'KN-117', "the map url(/packages/kinetic/test/fixtures/no-such-map.png) of div#gone's data-clip-enter", /HTTP 404/);
    expect(w.__errors.filter((l) => l.startsWith('[KN-117]'))).toEqual([result.message]);
    expect(w.document.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready')).toBe('failed');
    const held = await Promise.race([w.__hf.buildReady.kinetic.then(() => 'resolved'), tick(100).then(() => 'pending')]);
    expect(held).toBe('pending');
  });

  it('a map from another origin that sends no CORS header is KN-117, and the message says a map from another origin needs CORS', async () => {
    // A frame sandboxed without allow-same-origin has an opaque origin, so
    // the test server's own files are another origin to it.
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:100px;border:0;pointer-events:none';
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = '<!doctype html><html><body style="margin:0">'
      + '<div data-composition-id="xo" data-start="0" data-duration="2" data-fps="10">'
      + '<div id="far" data-start="0" data-duration="2" data-clip-enter="luma url(' + location.origin + RAMP + ') 0.5"></div></div>'
      + '<script src="' + location.origin + CORE + '"><\/script><script src="' + location.origin + WF_FILE + '"><\/script>'
      + '<script>wildflower.kinetic.config({ autoplay: false }); wildflower.kinetic.ready()'
      + '.then(() => parent.postMessage({ ok: true }, "*"), (e) => parent.postMessage({ code: e.code, message: e.message }, "*"));<\/script>'
      + '</body></html>';
    const got = new Promise((resolve) => {
      const hear = (e) => { if (e.source === frame.contentWindow) { removeEventListener('message', hear); resolve(e.data); } };
      addEventListener('message', hear);
    });
    document.body.appendChild(frame);
    cleanup.push(frame);
    const r = await Promise.race([got, tick(20000).then(() => ({ code: 'timed out' }))]);
    expectKN(r, 'KN-117', 'the map url(' + location.origin + RAMP + ") of div#far's data-clip-enter", /another origin.*Access-Control-Allow-Origin/);
  });

  it('a map that failed is fetched again by the next check() or render(), and not kept failed', async () => {
    const p = await framedPage(`<div data-composition-id="mp3" data-start="0" data-duration="2" data-fps="10">
      <div id="gone" data-start="0" data-duration="2" data-clip-enter="luma url(/packages/kinetic/test/fixtures/no-such-map.png) 0.5"></div>
    </div>`, cleanup);
    expect(p.result && p.result.code).toBe('KN-117');
    const asked = await p.w.eval(`(async () => {
      let n = 0;
      const f = window.fetch;
      window.fetch = (u, o) => { if (String(u).includes('no-such-map')) n++; return f(u, o); };
      try { await wildflower.kinetic.check({ samples: 2 }); } finally { window.fetch = f; }
      return n;
    })()`);
    expect(asked).toBe(1);
  });

  it('a luma data-clip-transition with no clip to replace (KN-116) does not load its map', async () => {
    const p = await framedPage(`<div data-composition-id="mp4" data-start="0" data-duration="2" data-fps="10">
      <div id="alone" data-start="0" data-duration="2" data-clip-transition="luma url(/packages/kinetic/test/fixtures/no-such-map.png)"></div>
    </div>`, cleanup);
    expect(p.result).toBe('resolved');
    expect(p.w.__errors.filter((l) => l.includes('KN-117'))).toEqual([]);
  });

  it('a map that fails and an audio clip that fails both print, KN-117 and KN-135', async () => {
    const p = await framedPage(`<div data-composition-id="mp5" data-start="0" data-duration="2" data-fps="10">
      <div id="gone" data-start="0" data-duration="2" data-clip-enter="luma url(/packages/kinetic/test/fixtures/no-such-map.png) 0.5"></div>
      <audio id="mute" src="/packages/kinetic/test/fixtures/no-such-sound.wav" data-start="0"></audio>
    </div>`, cleanup);
    expect(['KN-117', 'KN-135']).toContain(p.result && p.result.code);
    const codes = () => ['KN-117', 'KN-135'].map((c) => p.w.__errors.filter((l) => l.startsWith('[' + c + ']')).length);
    for (let i = 0; i < 100 && codes().includes(0); i++) await tick(30);
    expect(codes()).toEqual([1, 1]);
  });
});
