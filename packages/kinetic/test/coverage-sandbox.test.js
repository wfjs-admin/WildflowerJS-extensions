/**
 * The sandbox mode of the docs site's code-example component
 * (www/js/components/code-example.js, data-sandbox="kinetic"): each Kinetic
 * example runs in an iframe page of its own with the framework, Kinetic and
 * the example's code, loaded when the example scrolls near the viewport.
 *
 * The component is loaded into this page as the docs site loads it, over
 * the framework's full tier, so this file runs on the full legs only (the
 * sandbox picks its own tier). The sandbox page is the component's own
 * srcdoc with one URL routed: the site serves www/ at its root, so Kinetic's
 * local path is /js/extensions/kinetic.wf.min.js, which this test server
 * has under /packages/kinetic/dist/. Everything else, the framework file
 * included, is the path the component wrote.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { load, tick, CORE_TIER, BUILD, SITE_CODE_EXAMPLE, siteHas } from './helpers.js';

const HAS_SITE = await siteHas(SITE_CODE_EXAMPLE);

const SITE_KINETIC = '/js/extensions/kinetic.wf.min.js';
const TEST_KINETIC = '/packages/kinetic/dist/kinetic.wf.min.js';

// Every srcdoc the component writes, as written; the iframe gets it routed.
const written = [];
let restoreSrcdoc = null;
let routeTo = (doc) => doc.split('src="' + SITE_KINETIC + '"').join('src="' + TEST_KINETIC + '"');

beforeAll(async () => {
  const { wf } = await load();
  if (CORE_TIER !== 'full' || !HAS_SITE) return;
  // As a module: the test server rewrites the file's dynamic import(THREE_SRC),
  // which makes it one. It registers its component on the global wildflower.
  await import(/* @vite-ignore */ SITE_CODE_EXAMPLE);
  const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
  Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
    configurable: true,
    enumerable: desc.enumerable,
    get: desc.get,
    set(v) { written.push(v); desc.set.call(this, routeTo(v)); },
  });
  restoreSrcdoc = () => Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', desc);
  void wf;
}, 20000);

afterAll(() => { if (restoreSrcdoc) restoreSrcdoc(); });

const hosts = [];
afterEach(() => { for (const h of hosts.splice(0)) h.remove(); window.scrollTo(0, 0); });

const EXAMPLE_HTML = `<div data-composition-id="main" data-start="0" data-duration="2"
     data-width="1280" data-height="720" data-fps="30">
    <div class="card" data-component="sb-card" data-start="0.2" data-duration="1.5">
        <h1 data-bind-style="heading">Launch</h1>
    </div>
</div>`;
const EXAMPLE_CSS = '[data-composition-id] { position: relative; width: 1280px; height: 720px; overflow: hidden; }';
// The string holds a closing script tag, which the page must not end the module on.
const EXAMPLE_JS = `const marker = '</script>';
window.ran = marker;
const { scene } = wildflower.kinetic;
scene('sb-card', { keyframes: { heading: { opacity: { at: [0, 0.5], to: [0, 1] } } } });`;

// A code example as the docs pages write one, below a spacer taller than the
// viewport, so the reader has not reached it yet. Returns the example element.
async function example(attrs = '') {
  const { wf } = await load();
  const host = document.createElement('div');
  host.innerHTML = `<div class="spacer" style="height: ${window.innerHeight + 2000}px"></div>
    <div class="interactive-example" data-component="codeExample" data-sandbox="kinetic" data-title="Sandboxed" ${attrs}>
      <div class="example-container stacked">
        <div class="code-panel">
          <div class="file-tabs">
            <button class="tab-button active" data-action="switchTab" data-tab="html">HTML</button>
            <button class="tab-button" data-action="switchTab" data-tab="css">CSS</button>
            <button class="tab-button" data-action="switchTab" data-tab="js">JavaScript</button>
          </div>
          <div class="code-content">
            <div class="tab-content active" data-tab="html"><pre><code class="language-html"></code></pre></div>
            <div class="tab-content" data-tab="css"><pre><code class="language-css"></code></pre></div>
            <div class="tab-content" data-tab="js"><pre><code class="language-javascript"></code></pre></div>
          </div>
        </div>
        <div class="preview-panel">
          <div class="preview-header"><span class="preview-title">Live Preview</span><button data-action="resetPreview">Reset</button></div>
          <div class="preview-content" style="width: 640px"></div>
        </div>
      </div>
    </div>`;
  host.querySelector('[data-tab="html"] code').textContent = EXAMPLE_HTML;
  host.querySelector('[data-tab="css"] code').textContent = EXAMPLE_CSS;
  host.querySelector('[data-tab="js"] code').textContent = EXAMPLE_JS;
  document.body.appendChild(host);
  hosts.push(host);
  wf.scan(host);
  await wf.whenIdle();
  await tick(20);
  return host.querySelector('[data-sandbox]');
}

async function until(fn, what, ms = 5000) {
  const end = Date.now() + ms;
  for (;;) {
    let v = null;
    try { v = fn(); } catch (_) { /* the page is still loading */ }
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for ' + what);
    await tick(20);
  }
}

// Scrolls the example into view and waits for its page to have Kinetic running.
async function reach(ex) {
  ex.scrollIntoView({ block: 'center' });
  const frame = ex.querySelector('iframe');
  return until(() => {
    const w = frame.contentWindow;
    return w && w.wildflower && w.wildflower.kinetic && w.wildflower.getStore('kinetic') && w.document.querySelector('[data-kinetic-ready]') ? w : null;
  }, 'the sandbox page');
}

describe.skipIf(!HAS_SITE)(`code-example sandbox (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('loads nothing until the example nears the viewport, then runs the example in a page of its own: lite tier, Kinetic, the preview bar, the clock playing', async ({ skip }) => {
    if (CORE_TIER !== 'full') skip();
    const before = written.length;
    const ex = await example();
    const frame = ex.querySelector('.preview-content iframe');
    expect(frame).toBeTruthy();
    // Sized before it loads: the 1280 x 720 composition scaled to the 640 px panel, plus the 44 px bar.
    expect(frame.style.height).toBe((Math.round(720 * Math.min(1, ex.querySelector('.preview-content').clientWidth / 1280)) + 44) + 'px');
    await tick(100);
    expect(written.length).toBe(before);
    expect(frame.hasAttribute('srcdoc')).toBe(false);
    const win = await reach(ex);
    expect(written.length).toBe(before + 1);
    // The document: the framework with its tier swapped, Kinetic with data-preview, both deferred, then the example as a module.
    const doc = written[written.length - 1];
    const framework = CORE_TIER_FILE().replace(/wildflower\.[\w.-]*\.js$/, 'wildflower.lite.min.js');
    expect(doc).toContain('<script defer src="' + framework + '"></script><script defer src="' + SITE_KINETIC + '" data-preview></script>');
    expect(doc.indexOf('<script type="module">')).toBeGreaterThan(doc.indexOf(EXAMPLE_HTML.slice(0, 40)));
    expect(win.wildflower.tier).toBe('lite');
    expect(win.ran).toBe('</script>');
    const store = win.wildflower.getStore('kinetic');
    await until(() => store.playing && store.time > 0, 'the clock to play');
    expect(store.duration).toBe(2);
    expect(win.document.querySelector('[data-kinetic-preview]')).toBeTruthy();
    const root = win.document.querySelector('[data-composition-id]');
    expect(root.getAttribute('data-kinetic-ready')).toBe('true');
    // Kinetic's fit (data-preview) scaled the root to the frame's width, in one wrapper.
    const s = Math.min(1, win.document.documentElement.clientWidth / 1280);
    expect(root.parentElement.className).toBe('kinetic-fit');
    expect(root.parentElement.parentElement).toBe(win.document.body);
    expect(root.style.transform).toBe('scale(' + s + ')');
    expect(Math.abs(root.parentElement.getBoundingClientRect().height - 720 * s)).toBeLessThan(0.5);
    // The example's scene is live on the sandbox's page-load path and its keyframes follow the clock.
    const h1 = win.document.querySelector('h1');
    await until(() => store.time > 0.3 && store.time < 1.5, 'the heading to be on screen', 4000);
    const t = store.time;
    const want = win.wildflower.kinetic.interpolate(t - 0.2, [0, 0.5], [0, 1]);
    expect(Number(h1.style.opacity)).toBeCloseTo(want, 5);
  });

  it('data-tier picks the framework file, and data-base becomes the page\'s base URL', async ({ skip }) => {
    if (CORE_TIER !== 'full') skip();
    const ex = await example('data-tier="full" data-base="/packages/kinetic/test/"');
    const win = await reach(ex);
    expect(win.wildflower.tier).toBe('full');
    expect(win.document.baseURI).toBe(location.origin + '/packages/kinetic/test/');
    expect(win.ran).toBe('</script>');
  });

  it('Reset loads a fresh page in a new iframe', async ({ skip }) => {
    if (CORE_TIER !== 'full') skip();
    const ex = await example();
    const first = await reach(ex);
    const frame = ex.querySelector('iframe');
    first.wildflower.kinetic.pause();
    first.marked = true;
    ex.querySelector('[data-action="resetPreview"]').click();
    await tick(20);
    const frames = ex.querySelectorAll('iframe');
    expect(frames.length).toBe(1);
    expect(frames[0]).not.toBe(frame);
    expect(frame.isConnected).toBe(false);
    const again = await reach(ex);
    expect(again.marked).toBe(undefined);
    expect(again.ran).toBe('</script>');
    await until(() => again.wildflower.getStore('kinetic').playing, 'the new page to play');
  });

  it('on a page that loads the framework from the CDN, the sandbox takes the framework from the same CDN path and Kinetic from its pinned CDN file', async ({ skip }) => {
    if (CORE_TIER !== 'full') skip();
    // A script element the browser neither runs nor fetches, placed first, as
    // the site's own framework tag is. The iframe gets an empty page, so
    // nothing is fetched from the CDN.
    const tag = document.createElement('script');
    tag.type = 'text/plain';
    tag.setAttribute('src', 'https://cdn.jsdelivr.net/npm/wildflowerjs@1.5.4/dist/wildflower.full.min.js');
    document.head.insertBefore(tag, document.head.firstChild);
    const route = routeTo;
    routeTo = () => '<!DOCTYPE html><title>empty</title>';
    try {
      const ex = await example();
      ex.scrollIntoView({ block: 'center' });
      const n = written.length;
      await until(() => written.length > n || (ex.querySelector('iframe').hasAttribute('srcdoc') && written.length >= n), 'the sandbox document');
      const doc = written[written.length - 1];
      expect(doc).toContain('<script defer src="https://cdn.jsdelivr.net/npm/wildflowerjs@1.5.4/dist/wildflower.lite.min.js"></script>');
      expect(doc).toMatch(/<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@wildflowerjs\/kinetic@\d+\.\d+\.\d+\/dist\/kinetic\.wf\.min\.js" data-preview><\/script>/);
    } finally {
      routeTo = route;
      tag.remove();
    }
  });
});

// The framework file this page loaded, as its script tag wrote it.
function CORE_TIER_FILE() {
  const tag = Array.from(document.scripts).find((s) => /\/wildflower\.[\w.-]*\.js(\?|$)/.test(s.getAttribute('src') || ''));
  return tag.getAttribute('src');
}
