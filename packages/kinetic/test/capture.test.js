/**
 * The composition alone, in a render's capture and under ?embed (fit.js).
 * The HyperFrames CLI captures the window's top left corner at the
 * composition's size, so a toolbar above the stage would be in every frame.
 * With window.__HF_RENDER_CAPTURE_MODE set (the CLI sets it before any
 * script runs) or `embed` in the URL, Kinetic hides every element beside
 * the root and beside each of its ancestors up to body's children (scripts,
 * styles, links and templates are left as they are), zeroes the margin and
 * padding of each ancestor and the root's margin, and so leaves the root at
 * the window's top left at its own size. It does this once the page is
 * parsed and again when readiness settles, so an element a script adds in
 * between is hidden too. Outside those two cases it touches nothing.
 *
 * The flag is set by the page's first script, before Kinetic loads, as the
 * CLI does. A srcdoc page cannot carry a search, so the ?embed pages are
 * data: URLs that post what they found back.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, frames, CORE, WF_FILE, RUNTIME_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const STYLE = '<style>body { margin: 12px; font: 14px sans-serif; }'
  + ' .toolbar { height: 48px; background: #223; }'
  + ' .frame { padding: 24px; margin: 10px 30px; }'
  + ' #stage { position: relative; width: 640px; height: 360px; margin: 6px; overflow: hidden; background: #111; }'
  + ' #wash { position: absolute; inset: 0; } .footer { height: 300px; }</style>';

// A toolbar, a padded wrapper holding a caption and the stage, and a footer.
const MARKUP = '<header class="toolbar" id="toolbar">Demos</header>'
  + '<main class="frame" id="frame"><p id="caption">Beside the stage</p>'
  + '<div id="stage" data-composition-id="cap" data-no-timeline data-start="0" data-duration="2" data-fps="10" data-width="640" data-height="360">'
  + '<div id="wash" data-component="cap-wash" data-start="0" data-duration="2" data-bind-style="wash"></div></div>'
  + '<template id="tpl"><b>unused</b></template></main>'
  + '<footer class="footer" id="footer">About the demo</footer>';

// The page's own script: one scene, and an element added to the top of the
// body once the page is parsed, after Kinetic's own DOMContentLoaded work.
const SCENE = 'wildflower.kinetic.config({ autoplay: false });'
  + 'wildflower.kinetic.scene("cap-wash", { computed: { wash() { return { opacity: String(this.local < 1 ? 0.25 : 0.75) }; } } });'
  + 'document.addEventListener("DOMContentLoaded", function () { var n = document.createElement("div"); n.id = "late"; n.textContent = "added late";'
  + ' document.body.insertBefore(n, document.body.firstChild); });';

const tags = (origin, preview, runtime) => '<script src="' + origin + CORE + '"><\/script>'
  + '<script src="' + origin + WF_FILE + '"' + (preview ? ' data-preview' : '') + '><\/script>'
  + (runtime ? '<script src="' + origin + RUNTIME_FILE + '"><\/script>' : '');

// A srcdoc page in an iframe `width` pixels wide, ready.
async function page({ capture = false, runtime = false, preview = false, width = 900 } = {}) {
  await load();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:600px;border:0;opacity:0;pointer-events:none';
  frame.srcdoc = '<!doctype html><html><head>' + STYLE
    + (capture ? '<script>window.__HF_RENDER_CAPTURE_MODE = true;<\/script>' : '')
    + '</head><body>' + MARKUP + tags('', preview, runtime) + '<script>' + SCENE + '<\/script></body></html>';
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  const root = w.document.getElementById('stage');
  for (let i = 0; i < 300 && root.getAttribute('data-kinetic-ready') !== 'true'; i++) await tick(10);
  await frames(2);
  const doc = w.document;
  const display = (id) => w.getComputedStyle(doc.getElementById(id)).display;
  return { w, doc, root, display };
}

// A page at a data: URL with `search`, which posts back the root's rect,
// what is shown and whether the bar is mounted, once the root is ready.
async function embedPage(search, { preview = false, width = 900 } = {}) {
  await load();
  const report = '<script>(function wait() { var r = document.getElementById("stage");'
    + ' if (r.getAttribute("data-kinetic-ready") !== "true") return void setTimeout(wait, 10);'
    + ' requestAnimationFrame(function () { requestAnimationFrame(function () { var b = r.getBoundingClientRect();'
    + ' var d = function (id) { return getComputedStyle(document.getElementById(id)).display; };'
    + ' parent.postMessage({ capProbe: { search: location.search, rect: [b.x, b.y, b.width, b.height],'
    + ' toolbar: d("toolbar"), caption: d("caption"), footer: d("footer"), late: d("late"),'
    + ' bar: !!document.querySelector("[data-kinetic-preview]"), fit: wildflower.kinetic.config().fit } }, "*"); }); }); })();<\/script>';
  const html = '<!doctype html><html><head><meta charset="utf-8">' + STYLE + '</head><body>' + MARKUP
    + tags(location.origin, preview, false) + '<script>' + SCENE + '<\/script>' + report + '</body></html>';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:' + width + 'px;height:600px;border:0;opacity:0;pointer-events:none';
  const message = new Promise((resolve) => {
    const on = (e) => { if (e.source === frame.contentWindow && e.data && e.data.capProbe) { removeEventListener('message', on); resolve(e.data.capProbe); } };
    addEventListener('message', on);
  });
  frame.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html) + search;
  document.body.appendChild(frame);
  cleanup.push(frame);
  return Promise.race([message, tick(8000).then(() => { throw new Error('the data: page never reported back'); })]);
}

const box = (el) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };

describe(`the composition alone in a capture and under ?embed (${BUILD} extension, ${CORE_TIER} core)`, () => {
  for (const runtime of [false, true]) {
    it(`with the capture flag set before Kinetic loads, puts the root at the window's top left at its own size and hides the rest (${runtime ? 'with' : 'no'} runtime)`, async () => {
      const { doc, root, display } = await page({ capture: true, runtime, preview: true });
      expect(box(root)).toEqual([0, 0, 640, 360]);
      for (const id of ['toolbar', 'caption', 'footer', 'late']) expect(display(id), id).toBe('none');
      // The template and the scripts are left as they are.
      expect(doc.getElementById('tpl').hasAttribute('style')).toBe(false);
      for (const s of doc.querySelectorAll('script')) expect(s.hasAttribute('style')).toBe(false);
      // No bar and no fit in a render, even with data-preview.
      expect(doc.querySelector('[data-kinetic-preview]')).toBeNull();
      expect(doc.querySelector('.kinetic-fit')).toBeNull();
    });
  }

  it('without the flag leaves the page as it wrote it: the toolbar shows and nothing gets a style', async () => {
    const { doc, root, display } = await page();
    for (const id of ['toolbar', 'caption', 'footer', 'late']) expect(display(id), id).toBe('block');
    expect(box(root)[1]).toBeGreaterThan(48);
    for (const el of [doc.documentElement, doc.body, doc.getElementById('frame'), doc.getElementById('toolbar'), doc.getElementById('footer')]) {
      expect(el.hasAttribute('style'), el.id || el.tagName).toBe(false);
    }
    // The root carries the clip rule's visibility; its margin is the page's.
    expect(root.style.margin).toBe('');
  });

  it('?embed in the URL does what the flag does', async () => {
    const r = await embedPage('?embed');
    expect(r.search).toBe('?embed');
    expect(r.rect).toEqual([0, 0, 640, 360]);
    expect([r.toolbar, r.caption, r.footer, r.late]).toEqual(['none', 'none', 'none', 'none']);
    expect(r.bar).toBe(false);
  });

  it('?embed with data-preview keeps the fit, with no bar: the stage scaled to a narrow window from its top left', async () => {
    const r = await embedPage('?x=1&embed', { preview: true, width: 480 });
    expect(r.fit).toBe(true);
    expect(r.rect).toEqual([0, 0, 480, 270]);
    expect([r.toolbar, r.caption, r.footer, r.late]).toEqual(['none', 'none', 'none', 'none']);
    expect(r.bar).toBe(false);
  });

  it('a search that only contains the word, such as ?embedded, is not ?embed', async () => {
    const r = await embedPage('?embedded=1');
    expect(r.toolbar).toBe('block');
    expect(r.rect[1]).toBeGreaterThan(48);
  });
});
