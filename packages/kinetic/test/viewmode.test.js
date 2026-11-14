/**
 * The view: 'render' while check() or render() runs or a render captures,
 * 'live' otherwise, in the store's `viewmode` and from viewmode(). An element
 * with data-viewmode="render" is shown only in the render view, one with
 * "live" only in the live view; self.__KINETIC_VIEW, set by a tool before
 * the page loads (check.cjs --view), holds one view throughout.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
  delete window.__HF_RENDER_CAPTURE_MODE;
  delete window.__KINETIC_VIEW;
  wf.kinetic.seek(0);
});

// A composition whose scene records, on every seek, the view and whether
// each marked element is displayed.
async function stage(wf) {
  const name = uniqueName('scene');
  const seen = [];
  wf.kinetic.scene(name, {
    seek() {
      const shown = (sel) => getComputedStyle(this.element.querySelector(sel)).display !== 'none';
      seen.push({ view: wf.kinetic.viewmode(), render: shown('.r'), live: shown('.l'), both: shown('.b') });
    },
  });
  const host = await mount(`<div data-composition-id="vm" data-start="0" data-duration="1" data-fps="10"><div data-component="${name}">`
    + '<i class="r" data-viewmode="render"></i><i class="l" data-viewmode="live"></i><i class="b"></i></div></div>');
  cleanup.push(host);
  await wf.kinetic.ready();
  return seen;
}

describe(`viewmode (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('is live while the page plays, render inside check(), and live again after', async () => {
    const { wf } = await load();
    const seen = await stage(wf);
    wf.kinetic.seek(0.3);
    expect(wf.kinetic.viewmode()).toBe('live');
    expect(wf.getStore('kinetic').viewmode).toBe('live');
    expect(seen.at(-1)).toEqual({ view: 'live', render: false, live: true, both: true });
    seen.length = 0;
    const r = await wf.kinetic.check({ samples: 4 });
    expect(r.ok).toBe(true);
    const inside = seen.filter((s) => s.view === 'render');
    expect(inside.length).toBeGreaterThan(0);
    for (const s of inside) expect(s).toEqual({ view: 'render', render: true, live: false, both: true });
    expect(wf.kinetic.viewmode()).toBe('live');
    wf.kinetic.seek(0.5);
    expect(seen.at(-1)).toEqual({ view: 'live', render: false, live: true, both: true });
  });

  it('is render while a render captures', async () => {
    const { wf } = await load();
    const seen = await stage(wf);
    window.__HF_RENDER_CAPTURE_MODE = true;
    wf.kinetic.seek(0.2);
    expect(seen.at(-1)).toEqual({ view: 'render', render: true, live: false, both: true });
  });

  it('holds the view a tool set, through check() too', async () => {
    const { wf } = await load();
    const seen = await stage(wf);
    window.__KINETIC_VIEW = 'live';
    seen.length = 0;
    await wf.kinetic.check({ samples: 4 });
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s.view).toBe('live');
    window.__KINETIC_VIEW = 'render';
    wf.kinetic.seek(0.4);
    expect(seen.at(-1)).toEqual({ view: 'render', render: true, live: false, both: true });
  });
});
