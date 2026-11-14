/**
 * What ?embed leaves on screen (fit.js): the page shows the composition
 * alone, so an element the page adds beside the root after load is hidden
 * too, at once, with no run of readiness needed (it used to stay visible
 * until the next ready()). Nothing inside the root is touched.
 *
 * The page is fixtures/page-shell.html?embed on this origin, so the test
 * can read its DOM (embed.test.js's data: URL pages are on another origin);
 * its markup is the address's hash.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const abs = (u) => new URL(u, location.href).href;

// A page with `embed` in its address, in a frame; resolves once readiness has settled.
async function embedPage(body, after = '') {
  await load();
  const markup = body
    + '<script src="' + abs(CORE) + '"><\/script><script src="' + abs(WF_FILE) + '"><\/script>'
    + '<script>wildflower.kinetic.config({ autoplay: false });' + after + '<\/script>';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0;opacity:0;pointer-events:none';
  const loaded = new Promise((r) => { frame.onload = r; });
  frame.src = '/packages/kinetic/test/fixtures/page-shell.html?embed#' + encodeURIComponent(markup);
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  await w.wildflower.kinetic.ready();
  await tick(20);
  return { w, doc: w.document, k: w.wildflower.kinetic };
}

const STAGE = '<p id="caption">beside the stage</p><div id="stage" data-composition-id="emb" data-no-timeline data-start="0" data-duration="2" data-fps="30" data-width="320" data-height="180"><i id="inside">in the stage</i></div>';

describe(`?embed shows the composition alone (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('hides what sits beside the root at load, and leaves the root alone', async () => {
    const { w, doc } = await embedPage(STAGE);
    expect(w.location.search).toBe('?embed');
    expect(w.getComputedStyle(doc.getElementById('caption')).display).toBe('none');
    expect(w.getComputedStyle(doc.getElementById('inside')).display).not.toBe('none');
  });

  it('hides an element the page adds beside the root after load, without a run of readiness', async () => {
    const { w, doc } = await embedPage(STAGE);
    const late = doc.createElement('div');
    late.id = 'late';
    late.textContent = 'added after load';
    doc.body.appendChild(late);
    const beside = doc.createElement('div');
    beside.id = 'beside';
    doc.getElementById('stage').after(beside);
    const inner = doc.createElement('b');
    inner.id = 'inner';
    doc.getElementById('stage').appendChild(inner);
    await tick(20);
    expect(w.getComputedStyle(late).display).toBe('none');
    expect(w.getComputedStyle(beside).display).toBe('none');
    // An element added inside the root is the composition's own.
    expect(w.getComputedStyle(inner).display).not.toBe('none');
  });
});
