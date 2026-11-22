/**
 * check() loading kinetic.tools.js: not for samples and seed alone; for any
 * other option, once, from beside the file kinetic.wf.js was loaded from
 * (kinetic.tools.min.js beside kinetic.wf.min.js), and the call handed to
 * it. A file that does not load rejects with KN-103, its address the where,
 * and the next call tries again. The tests run in order: the first two
 * before the file is on the page.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, expectKN, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const TOOLS_URL = new URL(WF_FILE.replace(/kinetic\.wf(\.min)?\.js$/, 'kinetic.tools$1.js'), location.href).href;
const tags = () => Array.from(document.querySelectorAll('script')).filter((s) => s.src === TOOLS_URL);

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

async function comp() {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${uniqueName('tl')}" data-no-timeline data-start="0" data-duration="1" data-fps="10" style="position:relative;width:160px;height:90px"><p data-start="0" data-duration="0.3" style="margin:0">Gone soon</p></div>`);
  cleanup.push(host);
  await wf.kinetic.ready();
  return wf;
}

describe(`check() loading kinetic.tools.js (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('samples and seed alone run the self-test and load nothing', async () => {
    const wf = await comp();
    const r = await wf.kinetic.check({ samples: 3, seed: 2, reading: undefined });
    expect(r).toEqual({ ok: true, frames: 10, samples: 3, ready: 'true', errors: 0 });
    expect(tags()).toHaveLength(0);
    expect(wf.kinetic.tools).toBeUndefined();
  });

  it('a file that does not load rejects with KN-103 naming its address, and the next call tries again', async () => {
    const wf = await comp();
    // The tools' script tag pointed at a file that is not there.
    const real = Node.prototype.appendChild;
    Node.prototype.appendChild = function (n) {
      if (n instanceof HTMLScriptElement && n.src === TOOLS_URL) n.src = TOOLS_URL.replace(/kinetic\.tools/, 'no-such-file');
      return real.call(this, n);
    };
    try {
      await expectKN(wf.kinetic.check({ reading: true }), 'KN-103', 'check(): ' + TOOLS_URL, 'the file did not load');
    } finally {
      Node.prototype.appendChild = real;
    }
    expect(document.querySelectorAll('script[src*="no-such-file"]')).toHaveLength(0);
    expect(wf.kinetic.tools).toBeUndefined();
    const r = await wf.kinetic.check({ samples: 2, reading: true });
    expect(r.reading.short.map((b) => b.text)).toEqual(['Gone soon']);
  });

  it('loads the file beside kinetic.wf.js once, and hands each later call to it', async () => {
    const wf = await comp();
    expect(tags()).toHaveLength(1);
    expect(typeof wf.kinetic.tools.check).toBe('function');
    const a = await wf.kinetic.check({ samples: 2, reading: true });
    const b = await wf.kinetic.check({ samples: 2, layout: true });
    expect(a.reading.short).toHaveLength(1);
    expect(Array.isArray(b.layout.found)).toBe(true);
    expect(tags()).toHaveLength(1);
  });
});
