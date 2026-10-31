/**
 * What interactive mode costs a page that does not use it. With no steps and no
 * step definitions, Kinetic does not watch the composition's DOM, so a seek
 * costs the same however many rows change between seeks. Once the page has
 * a step definition, Kinetic watches the root and finds a step added under
 * it.
 *
 * A file of its own: step() is a page-wide definition, and the first test
 * needs a page on which it has never been called.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, uniqueName, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

// Counts, while `fn` runs, the observers started on `root()` and the reads
// for steps: querySelector('[data-step]') and querySelectorAll('[data-step]').
async function counting(root, fn) {
  const observe = MutationObserver.prototype.observe;
  const q = Element.prototype.querySelector, qa = Element.prototype.querySelectorAll;
  const n = { observed: 0, one: 0, all: 0 };
  MutationObserver.prototype.observe = function (target, opts) { if (target === root()) n.observed++; return observe.call(this, target, opts); };
  Element.prototype.querySelector = function (sel) { if (sel === '[data-step]') n.one++; return q.call(this, sel); };
  Element.prototype.querySelectorAll = function (sel) { if (sel === '[data-step]') n.all++; return qa.call(this, sel); };
  try { await fn(); } finally {
    MutationObserver.prototype.observe = observe;
    Element.prototype.querySelector = q;
    Element.prototype.querySelectorAll = qa;
  }
  return n;
}

const stage = (inner) => `<div data-composition-id="${uniqueName('lc')}" data-start="0" data-duration="4" data-fps="30">${inner}</div>`;

describe(`interactive mode's cost (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a page with no steps and no step definitions has no observer on its root, and its seeks read nothing for steps however many rows change', async () => {
    const { wf } = await load();
    const k = wf.kinetic;
    const host = await mount(stage('<div class="rows" data-start="0" data-duration="4"></div>'));
    cleanup.push(host);
    const root = host.firstElementChild, rows = root.querySelector('.rows');
    k.config({});
    // A run of readiness reads the steps afresh; the seeks after it read nothing.
    await k.ready();
    const n = await counting(() => root, async () => {
      k.seek(0);
      for (let i = 0; i < 20; i++) {
        for (let j = 0; j < 5; j++) rows.insertAdjacentHTML('beforeend', '<p><b>row</b> <i>' + i + '</i></p>');
        rows.firstElementChild.remove();
        k.seek(i / 10);
      }
      await tick(0);
      k.seek(2);
    });
    expect(n.observed).toBe(0);
    expect(n.one).toBe(0);
    expect(n.all).toBe(0);
    expect(wf.getStore('kinetic').stepCount).toBe(0);
  });

  it('once the page has a step definition, Kinetic watches the root and finds a step added under it before the next seek', async () => {
    const { wf } = await load();
    const k = wf.kinetic, s = wf.getStore('kinetic');
    const id = uniqueName('s');
    k.step(id, { wait: 1 });
    const host = await mount(stage(''));
    cleanup.push(host);
    const root = host.firstElementChild;
    k.config({});
    const n = await counting(() => root, async () => {
      k.seek(0);
      root.insertAdjacentHTML('beforeend', `<section id="${id}" data-step data-start="1" data-duration="2"></section>`);
      k.seek(1.5);
    });
    expect(n.observed).toBe(1);
    expect([s.stepCount, s.step]).toEqual([1, id]);
  });
});
