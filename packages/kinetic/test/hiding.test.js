/**
 * A clip outside its window paints nothing. Kinetic hides such a clip with
 * inline visibility, as the HyperFrames runtime does, and an SVG filter that
 * makes its own pixels (feFlood, feImage, feTurbulence) on the clip or on a
 * descendant painted through visibility: hidden (probed in Chrome 155,
 * 2026-10-09), as did a descendant with visibility: visible of its own. The
 * pixels are read from a screenshot of the stage; the layout of clips in
 * the flow is read from their boxes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { load, mount, tick, uniqueName, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__hyperframes;
});

// The share of a screenshot of `el` that is red.
async function redShare(el) {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const img = new Image();
  img.src = 'data:image/png;base64,' + await page.screenshot({ save: false, element: el });
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let red = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] < 80) red++;
  return red / (d.length / 4);
}

const FILTERS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="hd-flood" x="0" y="0" width="100%" height="100%"><feFlood flood-color="#ff0000"/></filter>
  <filter id="hd-noise" x="0" y="0" width="100%" height="100%"><feTurbulence baseFrequency="0.5" seed="3"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1"/></filter>
</defs></svg>`;

const seek = async (wf, t) => { wf.kinetic.seek(t); await tick(0); };

describe(`a hidden clip paints nothing (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('an SVG filter that floods or makes noise, on a hidden clip or on its descendant, paints nothing; inside the window it paints', async () => {
    const { wf } = await load();
    const stage = (id, inner) => `<div data-composition-id="${id}" data-no-timeline data-start="0" data-duration="2" data-width="200" data-height="120" style="position:fixed;left:0;top:0;width:200px;height:120px;background:#fff;overflow:hidden">
      ${FILTERS}
      <div style="position:absolute;inset:0" data-start="0" data-duration="1"></div>
      <div id="late" style="position:absolute;inset:0" data-start="1" data-duration="1">${inner}</div>
    </div>`;
    for (const [what, inner, style] of [
      ['a flood on the clip', '', 'filter: url(#hd-flood)'],
      ['noise on the clip', '', 'filter: url(#hd-noise)'],
      ['a flood on a descendant', '<div style="position:absolute;inset:10px;filter:url(#hd-flood)"><p>text</p></div>', ''],
      ['noise on a descendant', '<div style="position:absolute;inset:10px;filter:url(#hd-noise)"></div>', ''],
      ['a descendant with visibility: visible', '<div style="position:absolute;inset:10px;visibility:visible;background:#ff0000"></div>', ''],
    ]) {
      const host = await mount(stage('hd1', inner));
      cleanup.push(host);
      wf.kinetic.config({});
      const root = host.firstElementChild;
      if (style) host.querySelector('#late').setAttribute('style', 'position:absolute;inset:0;' + style);
      await seek(wf, 0.5);
      expect(host.querySelector('#late').style.visibility, what).toBe('hidden');
      expect(await redShare(root), what + ', hidden').toBe(0);
      await seek(wf, 1.5);
      expect(await redShare(root), what + ', shown').toBeGreaterThan(0.2);
      host.remove();
    }
  });

  it('a clip in the flow keeps its box while hidden, and so do its siblings', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="hd2" data-no-timeline data-start="0" data-duration="2" style="position:fixed;left:0;top:0;width:200px;display:flex;flex-direction:column">
      <div id="top" style="height:30px" data-start="0" data-duration="2"></div>
      <div id="mid" data-start="1" data-duration="1"><p style="margin:0;font:20px/1 sans-serif">two</p><p style="margin:0;font:20px/1 sans-serif">lines</p></div>
      <div id="end" style="height:30px" data-start="0" data-duration="2"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const boxes = () => ['top', 'mid', 'end'].map((id) => { const b = host.querySelector('#' + id).getBoundingClientRect(); return [b.top, b.height, b.width].join(','); }).join(' | ');
    await seek(wf, 1.5);
    const shown = boxes();
    await seek(wf, 0.5);
    expect(host.querySelector('#mid').style.visibility).toBe('hidden');
    expect(boxes()).toBe(shown);
    expect(host.querySelector('#mid').getBoundingClientRect().height).toBe(40);
  });

  it("the clip's own inline style is left as it was, hidden and shown again", async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="hd3" data-no-timeline data-start="0" data-duration="2">
      <div id="c" style="clip-path: circle(40%); color: red" data-start="1" data-duration="1"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const c = host.querySelector('#c');
    await seek(wf, 0.5);
    expect(c.getAttribute('style')).toBe('clip-path: circle(40%); color: red; visibility: hidden;');
    await seek(wf, 1.5);
    expect(c.getAttribute('style')).toBe('clip-path: circle(40%); color: red; visibility: visible;');
    expect(getComputedStyle(c).clipPath).toBe('circle(40%)');
  });

  // The clip-path comes from a style sheet Kinetic adopts; page code that
  // sets document.adoptedStyleSheets without it gets it back at the next seek.
  it('page code that replaces document.adoptedStyleSheets: the next seek adopts the sheet again, so a hidden clip is still clipped', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="hd7" data-no-timeline data-start="0" data-duration="2">
      <div id="c" data-start="1" data-duration="1"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const c = host.querySelector('#c');
    const saved = [...document.adoptedStyleSheets];
    try {
      await seek(wf, 0.5);
      expect(getComputedStyle(c).clipPath).not.toBe('none');
      document.adoptedStyleSheets = [];
      await seek(wf, 0.6);
      expect(getComputedStyle(c).clipPath).not.toBe('none');
    } finally {
      if (!document.adoptedStyleSheets.length) document.adoptedStyleSheets = saved;
    }
  });

  it('a clip that gains data-hidden loses data-kinetic-hidden', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="hd5" data-no-timeline data-start="0" data-duration="2">
      <div id="c" data-start="1" data-duration="1"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const c = host.querySelector('#c');
    await seek(wf, 0.5);
    expect(c.hasAttribute('data-kinetic-hidden')).toBe(true);
    c.setAttribute('data-hidden', '');
    await seek(wf, 0.6);
    expect(c.style.display).toBe('none');
    expect(c.hasAttribute('data-kinetic-hidden')).toBe(false);
  });

  // The clip-path that hides a clip also keeps Chrome from loading a lazy
  // image inside it until the clip shows (probed 2026-10-09: an image added
  // to a hidden clip was not requested), so readiness makes them eager.
  it('a lazy image added to a clip while it is hidden is loaded by the next ready()', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="hd6" data-no-timeline data-start="0" data-duration="4" style="position:fixed;left:0;top:0;width:200px;height:120px">
      <div id="b" style="position:absolute;inset:0" data-start="2" data-duration="2"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    await seek(wf, 0.5);
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.alt = '';
    img.style.cssText = 'display:block;width:100px;height:100px';
    img.src = '/packages/kinetic/test/fixtures/ramp.png?lazy=' + uniqueName('img');
    host.querySelector('#b').appendChild(img);
    await wf.kinetic.ready();
    expect(img.getAttribute('loading')).toBe('eager');
    const loaded = await Promise.race([img.decode().then(() => img.naturalWidth), tick(3000).then(() => 'not loaded')]);
    expect(loaded).toBe(256);
  });

  it('a clip Kinetic took out for data-hidden before a runtime came gets its inline display back, so removing the attribute shows it', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="hd7" data-no-timeline data-start="0" data-duration="2">
      <div id="h" data-start="0" data-duration="2" data-hidden></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const h = host.querySelector('#h');
    await seek(wf, 0.5);
    expect(h.style.display).toBe('none');
    window.__hyperframes = {};   // what the runtime sets as it loads
    await seek(wf, 0.6);
    h.removeAttribute('data-hidden');
    await seek(wf, 0.7);
    expect(h.style.display).toBe('');
    expect(getComputedStyle(h).display).toBe('block');
  });

  it('with a runtime on the page, a clip Kinetic hid before it came is not held hidden', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="hd4" data-no-timeline data-start="0" data-duration="2" style="position:fixed;left:0;top:0;width:200px;height:120px;background:#fff">
      <div id="c" style="position:absolute;inset:0;background:#ff0000" data-start="1" data-duration="1"></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const c = host.querySelector('#c');
    await seek(wf, 0.5);
    expect(getComputedStyle(c).clipPath).not.toBe('none');
    window.__hyperframes = {};   // what the runtime sets as it loads
    await seek(wf, 1.5);
    c.style.visibility = 'visible';   // the runtime's own pass
    expect(getComputedStyle(c).clipPath).toBe('none');
    expect(await redShare(host.firstElementChild)).toBeGreaterThan(0.9);
  });
});
