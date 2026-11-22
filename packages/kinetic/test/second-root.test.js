/**
 * Kinetic drives one composition: the first element with data-composition-id
 * (or data-root="true"). A second root beside it is left half attached: its
 * scenes are seeked by the first root's clock, but it gets no duration, no
 * size from its data attributes, no fit and no data-kinetic-ready (so the
 * documented hide-until-ready rule hides it for good). The development build
 * says so once after load, naming both roots; a composition nested inside
 * the first root is the first root's own and is not warned about.
 *
 * The test reads the warning's text, not its code.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const root = (id, inner = '') => '<div id="' + id + '" data-composition-id="' + id + '" data-no-timeline data-start="0" data-duration="2" data-fps="30" data-width="320" data-height="180">' + inner + '</div>';

// A page of its own whose first script records console.warn.
async function page(body) {
  await load();
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:400px;border:0;opacity:0;pointer-events:none';
  frame.srcdoc = '<!doctype html><html><head><script>window.__lines = []; const o = console.warn; console.warn = (...a) => { window.__lines.push(a.join(" ")); o.apply(console, a); };<\/script></head><body>' + body
    + '<script src="' + CORE + '"><\/script><script src="' + WF_FILE + '"><\/script><script>wildflower.kinetic.config({ autoplay: false });<\/script></body></html>';
  const loaded = new Promise((r) => { frame.onload = r; });
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  await w.wildflower.kinetic.ready();
  await tick(50);
  return w;
}

describe(`a second composition root (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('two roots side by side: development builds warn once, naming the one driven and the one left out', async () => {
    const w = await page(root('first') + root('second'));
    const lines = w.__lines.filter((l) => /^\[KN-\d+\]/.test(l) && l.includes('second'));
    if (BUILD === 'min') { expect(lines).toEqual([]); return; }
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('data-composition-id');
    expect(lines[0]).toContain('first');
  });

  it('a composition nested inside the root is not warned about', async () => {
    const w = await page(root('outer', root('inner')));
    expect(w.__lines.filter((l) => /^\[KN-\d+\]/.test(l) && l.includes('inner'))).toEqual([]);
  });
});
