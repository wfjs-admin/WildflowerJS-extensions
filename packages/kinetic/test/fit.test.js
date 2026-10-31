/**
 * The page around the composition (fit.js): outside a render, html and body
 * get back what the HyperFrames runtime takes from them (margin, padding,
 * overflow, and the composition's width and height, which it writes again),
 * and in a render they are left alone. config({ fit }) wraps the root in a
 * plain <div class="kinetic-fit"> and scales it to the wrapper's width; it is
 * on by default when the preview bar is asked for. Each case is a page of its
 * own in an iframe, so the window's width is the iframe's.
 *
 * The runtime here is a stand-in that writes what the pinned runtime writes
 * (probed against tools/hyperframes): margin 0, padding 0 and overflow hidden
 * on both elements as it starts, the composition's width and height on both,
 * and the size again later (__relayout()).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, frames, BUILD, CORE, WF_FILE, CORE_TIER } from './helpers.js';

const dev = BUILD === 'dev';
const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const FAKE_RUNTIME = '<script>window.__renderReady = false; (function () {'
  + ' var els = [document.documentElement, document.body];'
  + ' function size() { els.forEach(function (el) { el.style.width = "640px"; el.style.height = "360px"; }); }'
  + ' els.forEach(function (el) { el.style.margin = "0"; el.style.padding = "0"; el.style.overflow = "hidden"; });'
  + ' size(); window.__relayout = size;'
  + ' setTimeout(function () { window.__renderReady = true; }, 30);'
  + ' })();<\/script>';

const ROOT = '<div id="stage" data-composition-id="fit" data-no-timeline data-start="0" data-duration="2" data-fps="10" data-width="640" data-height="360">'
  + '<div id="wash" data-component="fit-wash" data-start="0" data-duration="2" data-bind-style="wash"></div></div>';

// A page in an iframe `width` pixels wide. Its first script records the
// console and the order of two things: the wrapper arriving and the root
// being marked ready. `runtime` puts the stand-in before or after Kinetic.
async function page({ width = 320, preview = false, runtime = null, capture = false, css = '', head = '', before = '', after = '', tall = true } = {}) {
  await load();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:400px;border:0;opacity:0;pointer-events:none';
  frame.srcdoc = '<!doctype html><html' + head + '><head><style>'
    + 'body { margin: 7px; } #stage { position: relative; width: 640px; height: 360px; overflow: hidden; }'
    + ' #wash { position: absolute; inset: 0; } .tall { height: 2000px; }' + css + '</style>'
    + '<script>' + (capture ? 'window.__HF_RENDER_CAPTURE_MODE = true;' : '')
    + 'window.__lines = []; window.__order = []; for (const m of ["warn", "error"]) { const o = console[m]; console[m] = (...a) => { window.__lines.push(a.join(" ")); o.apply(console, a); }; }'
    + 'new MutationObserver((rs) => { for (const r of rs) {'
    + ' if (r.type === "childList" && [...r.addedNodes].some((n) => n.classList && n.classList.contains("kinetic-fit"))) window.__order.push("wrap");'
    + ' if (r.type === "attributes" && r.attributeName === "data-kinetic-ready") { window.__order.push("ready"); window.__sizeAtReady = window.__sizeAtReady || [r.target.offsetWidth, r.target.offsetHeight]; } } })'
    + '.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-kinetic-ready"] });<\/script>'
    + '</head><body>' + ROOT + (tall ? '<div class="tall"></div>' : '') + before
    + (runtime === 'first' ? FAKE_RUNTIME : '')
    + '<script src="' + CORE + '"><\/script>'
    + '<script src="' + WF_FILE + '"' + (preview ? ' data-preview' : '') + '><\/script>'
    + (runtime === 'after' ? FAKE_RUNTIME : '')
    + '<script>wildflower.kinetic.config({ autoplay: false });'
    + 'wildflower.kinetic.scene("fit-wash", { computed: { wash() { return { opacity: String(this.local < 1 ? 0.25 : 0.75) }; } } });<\/script>'
    + after + '</body></html>';
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  const root = w.document.getElementById('stage');
  for (let i = 0; i < 200 && root.getAttribute('data-kinetic-ready') !== 'true'; i++) await tick(10);
  await frames(2);
  return { frame, w, root, doc: w.document, html: w.document.documentElement, body: w.document.body };
}

const rect = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10]; };

describe(`html and body outside a render (${BUILD} extension, ${CORE_TIER} core)`, () => {
  for (const order of ['after', 'first']) {
    it(`gets back the page's own size, margin and overflow from the runtime, and again when it writes the size (runtime loaded ${order === 'first' ? 'before' : 'after'} Kinetic)`, async () => {
      const { w, html, body, root } = await page({ runtime: order });
      expect(root.getAttribute('data-kinetic-ready')).toBe('true');
      for (const el of [html, body]) {
        for (const k of ['margin', 'padding', 'overflow', 'width', 'height']) expect(el.style.getPropertyValue(k), el.tagName + ' ' + k).toBe('');
      }
      expect(w.getComputedStyle(body).marginTop).toBe('7px');
      expect(w.getComputedStyle(html).overflow).toBe('visible');
      expect(html.scrollHeight).toBeGreaterThan(html.clientHeight);
      // The runtime lays the composition out again.
      w.__relayout();
      await tick(0);
      expect(html.style.width).toBe('');
      expect(body.style.height).toBe('');
      // An overflow the page sets itself, later, stays.
      body.style.overflow = 'hidden';
      w.__relayout();
      await tick(0);
      expect(body.style.overflow).toBe('hidden');
      expect(body.style.width).toBe('');
    });
  }

  it('in a render leaves html and body as the runtime set them and fits nothing, with fit asked for', async () => {
    const { w, html, body, root, doc } = await page({ runtime: 'after', capture: true, preview: true });
    expect(w.wildflower.kinetic.config().fit).toBe(true);
    for (const el of [html, body]) {
      expect(el.style.margin).toBe('0px');
      expect(el.style.overflow).toBe('hidden');
      expect(el.style.width).toBe('640px');
      expect(el.style.height).toBe('360px');
    }
    expect(root.parentElement).toBe(body);
    expect(doc.querySelector('.kinetic-fit')).toBeNull();
    expect(root.style.transform).toBe('');
    w.__relayout();
    await tick(0);
    expect(html.style.width).toBe('640px');
  });

  it('with no runtime on the page leaves html and body as the page wrote them, and still fits the stage', async () => {
    const { w, html, root } = await page({ head: ' style="overflow: hidden; width: 640px"', preview: true });
    expect(html.style.overflow).toBe('hidden');
    expect(html.style.width).toBe('640px');
    expect(w.wildflower.kinetic.config().fit).toBe(true);
    expect(root.parentElement.className).toBe('kinetic-fit');
  });
});

describe(`config({ fit }) (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('wraps the root in a plain element, scales it to a narrow window and sets the height, before the root is shown', async () => {
    const { w, root, doc, frame, body } = await page({ preview: true, css: ' body { margin: 0; }', tall: false });
    const wrap = root.parentElement;
    expect(wrap.className).toBe('kinetic-fit');
    expect(wrap.parentElement).toBe(body);
    expect(wrap.hasAttribute('data-component')).toBe(false);
    expect(root.style.transform).toBe('scale(0.5)');
    expect(w.getComputedStyle(root).transformOrigin).toBe('0px 0px');
    expect(rect(wrap)).toEqual([320, 180]);
    expect(rect(root)).toEqual([320, 180]);
    // The root's own layout stays the composition's size.
    expect([root.offsetWidth, root.offsetHeight]).toEqual([640, 360]);
    expect(w.__order).toEqual(['wrap', 'ready']);
    // A wider window: the scale follows, and never goes above 1.
    frame.style.width = '480px';
    await frames(3);
    expect(root.style.transform).toBe('scale(0.75)');
    expect(rect(wrap)).toEqual([480, 270]);
    frame.style.width = '900px';
    await frames(3);
    expect(root.style.transform).toBe('scale(1)');
    expect(rect(wrap)).toEqual([640, 360]);
    expect(doc.querySelectorAll('.kinetic-fit').length).toBe(1);
  });

  it('unwraps on config({ fit: false }), giving the root back its place and its own transform, and wraps again on fit: true', async () => {
    const { w, root, doc, body } = await page({ preview: true, tall: false });
    expect(root.parentElement.className).toBe('kinetic-fit');
    expect(w.wildflower.kinetic.config({ fit: false }).fit).toBe(false);
    expect(root.parentElement).toBe(body);
    expect(body.firstElementChild).toBe(root);
    expect(doc.querySelector('.kinetic-fit')).toBeNull();
    expect(root.style.transform).toBe('');
    expect(root.style.transformOrigin).toBe('');
    // The bar stays: fit is its own setting.
    expect(doc.querySelector('[data-kinetic-preview]')).toBeTruthy();
    expect(w.wildflower.kinetic.config({ fit: true }).fit).toBe(true);
    expect(root.parentElement.className).toBe('kinetic-fit');
    expect(root.style.transform).toBe('scale(0.478125)');   // (320 - 2 * 7) / 640, inside the body's margin
  });

  it('is on by default when the bar is asked for and off without it, and set on its own it stays', async () => {
    const withBar = await page({ preview: true });
    expect(withBar.w.wildflower.kinetic.config().fit).toBe(true);
    expect(withBar.root.parentElement.className).toBe('kinetic-fit');

    const { w, root, doc, body } = await page();
    const k = w.wildflower.kinetic;
    expect(k.config().fit).toBe(false);
    expect(root.parentElement).toBe(body);
    k.config({ preview: true });
    expect(k.config().fit).toBe(true);
    expect(root.parentElement.className).toBe('kinetic-fit');
    k.config({ preview: false });
    expect(k.config().fit).toBe(false);
    expect(root.parentElement).toBe(body);
    // fit: true with no bar, as a page with its own controls has it.
    k.config({ fit: true });
    expect(root.parentElement.className).toBe('kinetic-fit');
    expect(doc.querySelector('[data-kinetic-preview]')).toBeNull();
    k.config({ preview: true });
    k.config({ preview: false });
    expect(k.config().fit).toBe(true);
    expect(root.parentElement.className).toBe('kinetic-fit');
  });

  it('the wrapper is no component: a binding on the root tag of a scene directly inside the root reads the scene', async () => {
    const { w, root } = await page({ preview: true });
    const wash = root.querySelector('#wash');
    expect(root.parentElement.className).toBe('kinetic-fit');
    expect(root.parentElement.closest('[data-component], [data-wf-component]')).toBeNull();
    w.wildflower.kinetic.seek(0.5);
    await tick(10);
    expect(wash.style.opacity).toBe('0.25');
    w.wildflower.kinetic.seek(1.5);
    await tick(10);
    expect(wash.style.opacity).toBe('0.75');
    if (dev) expect(w.__lines.filter((l) => l.includes('KN-154'))).toEqual([]);
  });
});

describe(`the stage's size from data-width and data-height (${BUILD} extension, ${CORE_TIER} core)`, () => {
  // The page's base rule gives #stage a size; `auto` takes it away again.
  const NO_SIZE = ' #stage { width: auto; height: auto; }';
  const NO_TYPED_OM = '<script>delete Element.prototype.computedStyleMap;<\/script>';

  it('a root the page gives no size gets data-width x data-height before it is shown, with Typed OM and without', async () => {
    for (const before of ['', NO_TYPED_OM]) {
      const label = before ? 'without computedStyleMap' : 'with computedStyleMap';
      const { w, root } = await page({ css: NO_SIZE, before, tall: false });
      expect(w.__sizeAtReady, label).toEqual([640, 360]);
      expect([root.offsetWidth, root.offsetHeight], label).toEqual([640, 360]);
      expect([root.style.width, root.style.height], label).toEqual(['640px', '360px']);
      // The read without Typed OM leaves the style attribute as it was.
      expect(root.style.display, label).toBe('');
    }
  });

  it("a root with a size of the page's own keeps it: a style sheet rule, a style attribute, and an aspect-ratio for the height", async () => {
    for (const before of ['', NO_TYPED_OM]) {
      const label = before ? 'without computedStyleMap' : 'with computedStyleMap';
      const sheet = await page({ css: ' #stage { width: 500px; height: 300px; }', before, tall: false });
      expect([sheet.root.offsetWidth, sheet.root.offsetHeight], label).toEqual([500, 300]);
      expect([sheet.root.style.width, sheet.root.style.height], label).toEqual(['', '']);
      const inline = await page({ css: NO_SIZE, before: before + '<script>document.getElementById("stage").setAttribute("style", "width: 400px; height: 200px");<\/script>', tall: false });
      expect([inline.root.offsetWidth, inline.root.offsetHeight], label).toEqual([400, 200]);
      // Width alone from the page: the height still comes from data-height.
      const half = await page({ css: ' #stage { width: 320px; height: auto; }', before, tall: false });
      expect([half.root.offsetWidth, half.root.offsetHeight], label).toEqual([320, 360]);
      // An aspect-ratio of the page's own sizes the height from the width.
      const ratio = await page({ css: ' #stage { width: auto; height: auto; aspect-ratio: 2 / 1; }', before, tall: false });
      expect([ratio.root.offsetWidth, ratio.root.offsetHeight], label).toEqual([640, 320]);
      expect(ratio.root.style.height, label).toBe('');
    }
  });

  it('with config({ fit }) the sized root is scaled into the wrapper, its layout data-width x data-height', async () => {
    const { root } = await page({ css: NO_SIZE + ' body { margin: 0; }', preview: true, tall: false });
    expect(root.parentElement.className).toBe('kinetic-fit');
    expect([root.offsetWidth, root.offsetHeight]).toEqual([640, 360]);
    expect(root.style.transform).toBe('scale(0.5)');
    expect(rect(root)).toEqual([320, 180]);
  });

  it('the pause mark stays over the center of the fitted root when the window, or only its container, is resized', async () => {
    const { w, root, frame, body } = await page({ css: ' body { margin: 0; }', tall: false, after: '<script>wildflower.kinetic.config({ fit: true });<\/script>' });
    w.wildflower.kinetic.play();
    root.querySelector('#wash').click();
    const mark = () => w.document.querySelector('[data-kinetic-paused]');
    expect(mark()).toBeTruthy();
    const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const resized = [() => { frame.style.width = '480px'; }, () => { frame.style.width = '260px'; }, () => { body.style.width = '200px'; }];
    for (const [i, resize] of resized.entries()) {
      resize();
      await frames(3);
      const [mx, my] = centre(mark()), [rx, ry] = centre(root);
      expect(Math.abs(mx - rx), 'x after resize ' + i).toBeLessThan(1);
      expect(Math.abs(my - ry), 'y after resize ' + i).toBeLessThan(1);
    }
    w.wildflower.kinetic.pause();
  });

  it('a root added after load is sized by the next ready()', async () => {
    const { w, doc } = await page({ css: NO_SIZE, tall: false });
    doc.getElementById('stage').remove();
    doc.body.insertAdjacentHTML('afterbegin', '<div id="late" data-composition-id="late" data-start="0" data-duration="1" data-width="300" data-height="150"></div>');
    await w.wildflower.kinetic.ready();
    const late = doc.getElementById('late');
    expect([late.offsetWidth, late.offsetHeight]).toEqual([300, 150]);
  });
});
