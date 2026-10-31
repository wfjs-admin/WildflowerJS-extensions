/**
 * The arrival and context cells of the scene lifecycle that no other file
 * drives: a scene inside a data-list row (created, seeked and removed by the
 * list at a seek), two instances of one scene, a scene destroyed and
 * remounted (by the page, and by a data-render section that turns off and on
 * again), computeds read inside seek(local) on every channel, the timeline
 * channel with a scene on it, a repeated seek, and two seeks whose barriers
 * settle out of order.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, dispatchSeek, uniqueName, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const scenesToDrop = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
  if (wf.kinetic.config().channel !== 'event') wf.kinetic.config({ channel: 'event' });
  await tick(0);
});

const KEYFRAMES = '<style>@keyframes kn-cov-fade { from { opacity: 0 } to { opacity: 1 } }</style>';
const ANIM = '<i class="a" style="animation: kn-cov-fade 10s linear"></i>';
const animOf = (el) => { const a = el.querySelector('.a').getAnimations()[0]; return [a.playState, a.currentTime]; };

async function until(fn, what, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting for ' + what);
    await tick(10);
  }
}

// A scene in each row of a list its host scene derives from local: one row
// before 1 s, two after. The row scene is either inside the row's element
// or is the row's element itself.
const ROW_SHAPES = {
  'inside the row': (row) => `<li><div data-component="${row}" data-start="0.5"><b class="l" data-bind="local"></b>${ANIM}</div></li>`,
  'on the row element': (row) => `<li data-component="${row}" data-start="0.5"><b class="l" data-bind="local"></b>${ANIM}</li>`,
};

async function rowScenes(wf, shape, id) {
  const host = uniqueName('rows');
  const row = uniqueName('row');
  scenesToDrop.push(host, row);
  const calls = [];          // [row number, or 'detached', local] for every seek(local)
  const hold = { first: true, release: null };
  wf.kinetic.scene(host, { computed: { items() { return this.local >= 1 ? [{ k: 1 }, { k: 2 }] : [{ k: 1 }]; } } });
  wf.kinetic.scene(row, {
    seek(local) {
      const li = this.element.closest('li');
      const n = this.element.isConnected && li ? [...li.parentElement.children].indexOf(li) + 1 : 'detached';
      calls.push([n, local]);
      // The second row's first seek holds the barrier, as an image decode would.
      if (n === 2 && hold.first) { hold.first = false; return new Promise((r) => { hold.release = r; }); }
      return undefined;
    },
  });
  wf.kinetic.seek(0.5);
  const el = await mount(`${KEYFRAMES}<div data-composition-id="${id}" data-start="0" data-duration="5">
    <div data-component="${host}" data-start="0"><ol data-list="items" data-key="k"><template>${ROW_SHAPES[shape](row)}</template></ol></div>
  </div>`);
  cleanup.push(el);
  await until(() => calls.length, "the first row's init seek");
  return { el, calls, hold };
}

describe(`scene arrivals (${BUILD} extension, ${CORE_TIER} core)`, () => {
  for (const shape of Object.keys(ROW_SHAPES)) {
    it(`a scene ${shape} of a data-list row: a row a seek adds runs its first seek(local) and its catch-up inside that seek`, async ({ skip }) => {
      const { wf } = await load();
      if (wf.features && wf.features.lists === false) skip();   // nano, mini-pool: no data-list
      const { el, calls, hold } = await rowScenes(wf, shape, 'ar1-' + shape.length);
      expect(calls).toEqual([[1, 0]]);
      calls.length = 0;
      const { done } = dispatchSeek(1.5);
      const first = await Promise.race([done.then(() => 'resolved'), tick(60).then(() => 'held')]);
      expect(first).toBe('held');
      hold.release();
      await done;
      // The new row's scene ran its first seek(local) inside this seek, with
      // the local of this seek, and the catch-up positioned its animation.
      expect(calls).toContainEqual([1, 1]);
      expect(calls).toContainEqual([2, 1]);
      const lis = [...el.querySelectorAll('li')];
      expect(lis.map(animOf)).toEqual([['paused', 1000], ['paused', 1000]]);
      if (shape === 'on the row element') expect(lis.map((li) => li.querySelector('.l').textContent)).toEqual(['1', '1']);
    });
  }

  // A known gap in the framework, not Kinetic: a
  // data-bind inside a component nested below a list row's element
  // (<template><li><div data-component="x"><b data-bind="local">) reads the
  // list host's value whenever the host has a property of that name, and
  // the nested component's own only when the host has none (probed with two
  // plain components on full.dev and mini.dev: "HOST1" both before and after
  // the child changed its own value). Every scene has local, progress, frame
  // and the rest, so a scene nested in a row of another scene shows the
  // host's timing in its bindings while its seek(local) gets its own. With
  // the scene on the row element the bindings are its own, but that shape is
  // never destroyed (the gap two tests below). Remove `.fails` once a binding
  // inside a nested component reads that component first.
  it.fails('a binding inside a scene nested in a row of another scene reads the nested scene, not the host', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const { el, hold } = await rowScenes(wf, 'inside the row', 'ar1b');
    hold.first = false;
    await dispatchSeek(1.5).done;
    // The row scenes start at 0.5, the host at 0: their local is 1, the host's 1.5.
    expect([...el.querySelectorAll('li .l')].map((b) => b.textContent)).toEqual(['1', '1']);   // receives ['1.5', '1.5']
  });

  it('a scene inside a data-list row the list removes is seeked no more', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const { el, calls, hold } = await rowScenes(wf, 'inside the row', 'ar1r');
    hold.first = false;
    await dispatchSeek(1.5).done;
    expect(el.querySelectorAll('li').length).toBe(2);
    await dispatchSeek(0.75).done;   // back before 1 s: the list drops the second row
    await tick(20);
    expect(el.querySelectorAll('li').length).toBe(1);
    calls.length = 0;
    await dispatchSeek(0.8).done;
    expect(calls).toEqual([[1, 0.30000000000000004]]);
  });

  // A known gap in the framework, not Kinetic: a
  // component whose element is the list row's own root element
  // (<template><li data-component="x">) is never destroyed when the list
  // removes the row; one nested inside the row is (probed on full.dev and
  // lite.dev with a plain wildflower.component: no beforeDestroy or destroy
  // within 1 s). Kinetic's afterInit/beforeDestroy hooks then keep the scene
  // in `live`, so it is seeked on its detached element on every later seek,
  // and each time the row comes back a new instance joins it: check() and a
  // scrubbed preview grow `live` with every add and remove. No core test pins
  // the destroy of a row-root component. Remove `.fails` once the list's row
  // removal destroys a component on the row element itself.
  it.fails('a scene on the element of a data-list row the list removes is seeked no more', async ({ skip }) => {
    const { wf } = await load();
    if (wf.features && wf.features.lists === false) skip();
    const { el, calls, hold } = await rowScenes(wf, 'on the row element', 'ar1s');
    hold.first = false;
    await dispatchSeek(1.5).done;
    expect(el.querySelectorAll('li').length).toBe(2);
    await dispatchSeek(0.75).done;
    await tick(20);
    expect(el.querySelectorAll('li').length).toBe(1);
    calls.length = 0;
    await dispatchSeek(0.8).done;
    expect(calls).toEqual([[1, 0.30000000000000004]]);   // receives [[1, 0.3], ['detached', 0.3]]
  });

  it('a composition root that arrives after readiness has settled is marked ready at its first seek, so the stage rule shows it', async () => {
    const { wf } = await load();
    await wf.kinetic.ready();
    const el = await mount('<div data-composition-id="ar0" data-start="0" data-duration="2"></div>');
    cleanup.push(el);
    expect(el.firstElementChild.hasAttribute('data-kinetic-ready')).toBe(false);
    await dispatchSeek(0.5).done;
    expect(el.firstElementChild.getAttribute('data-kinetic-ready')).toBe('true');
  });

  it('two instances of one scene each read their own clip, in computeds and in seek(local)', async () => {
    const { wf } = await load();
    const name = uniqueName('twin');
    scenesToDrop.push(name);
    const seen = new Map();
    wf.kinetic.scene(name, { seek(local) { seen.set(this.element.id, local); } });
    const el = await mount(`<div data-composition-id="ar2" data-start="0" data-duration="20">
      <div id="tw-a" data-component="${name}" data-start="1" data-duration="4"><b class="l" data-bind="local"></b><b class="p" data-bind="progress"></b></div>
      <div data-composition-id="ar2-sub" data-start="3" data-duration="10" data-playback-start="2">
        <div id="tw-b" data-component="${name}" data-start="1" data-duration="8"><b class="l" data-bind="local"></b><b class="p" data-bind="progress"></b></div>
      </div>
    </div>`);
    cleanup.push(el);
    await dispatchSeek(5).done;
    const read = (id) => [el.querySelector('#' + id + ' .l').textContent, el.querySelector('#' + id + ' .p').textContent];
    // tw-a: starts at 1. tw-b: 3 (host) + 1, shown from its own 2 s (playback start).
    expect(read('tw-a')).toEqual(['4', '1']);
    expect(seen.get('tw-a')).toBe(4);
    // tw-b has a data-start of its own, so it is a clip, not a composition: no playback start.
    // progress runs to 1 on the clip's last captured frame, 8 - 1/fps s in.
    expect(read('tw-b')).toEqual(['1', String(1 / (8 - 1 / wf.getStore('kinetic').fps))]);
    expect(seen.get('tw-b')).toBe(1);
  });

  it('a scene removed from the page is seeked no more, and the same element put back is a new live instance', async () => {
    const { wf } = await load();
    const name = uniqueName('again');
    scenesToDrop.push(name);
    const seeks = [];
    let destroyed = 0;
    wf.kinetic.scene(name, { seek(local) { seeks.push(local); }, beforeDestroy() { destroyed++; } });
    wf.kinetic.seek(0);
    const el = await mount(`${KEYFRAMES}<div data-composition-id="ar3" data-start="0" data-duration="5"><div data-component="${name}" data-start="1"><b class="l" data-bind="local"></b>${ANIM}</div></div>`);
    cleanup.push(el);
    await until(() => seeks.length, 'the init seek');
    await dispatchSeek(2).done;
    expect(seeks).toEqual([0, 1]);
    el.remove();
    await until(() => destroyed, 'the removed scene to be destroyed');
    await dispatchSeek(3).done;
    expect(seeks).toEqual([0, 1]);
    // Put back: the framework strips the stale component id and makes a new instance.
    document.body.appendChild(el);
    wf.scan(el);
    await until(() => seeks.length === 3, "the new instance's init seek");
    expect(seeks[2]).toBe(2);
    await dispatchSeek(4).done;
    expect(seeks).toEqual([0, 1, 2, 3]);
    expect(el.querySelector('.l').textContent).toBe('3');
    expect(animOf(el)).toEqual(['paused', 3000]);
  });

  it('a scene in a data-render section that turns off is destroyed, and when it turns on again the new instance runs its first seek inside that seek', async () => {
    const { wf } = await load();
    const outer = uniqueName('gate');
    const inner = uniqueName('gated');
    scenesToDrop.push(outer, inner);
    const seeks = [];
    let destroyed = 0;
    wf.component(outer, { subscribe: ['kinetic'], computed: { on() { return this.stores.kinetic.time > 2; } } });
    wf.kinetic.scene(inner, { seek(local) { seeks.push(local); }, beforeDestroy() { destroyed++; } });
    wf.kinetic.seek(0);
    const el = await mount(`${KEYFRAMES}<div data-composition-id="ar4" data-start="0" data-duration="8">
      <div data-component="${outer}"><section data-render="on"><div data-component="${inner}"><b class="l" data-bind="local"></b>${ANIM}</div></section></div>
    </div>`);
    cleanup.push(el);
    await dispatchSeek(3).done;
    expect(seeks).toEqual([3]);
    // The seek hooks run before the flush that turns the section off, so the
    // scene still answers this one seek.
    await dispatchSeek(1).done;
    await until(() => destroyed === 1, 'the section turning off to destroy the scene');
    await dispatchSeek(1.5).done;
    expect(seeks).toEqual([3, 1]);
    await dispatchSeek(4).done;
    expect(seeks).toEqual([3, 1, 4]);
    expect(el.querySelector('.l').textContent).toBe('4');
    expect(animOf(el)).toEqual(['paused', 4000]);
  });
});

describe(`seek contexts (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("seek(local) reads this seek's computeds (a keyframes track, progress, frame), not the previous seek's, on every channel and at init", async () => {
    const { wf } = await load();
    const name = uniqueName('reader');
    scenesToDrop.push(name);
    const seen = [];
    wf.kinetic.scene(name, {
      keyframes: { plane: { at: [0, 4], to: [0, 400] } },
      seek(local) { seen.push([local, this.local, this.plane, this.progress, this.clipFrame]); },
    });
    wf.kinetic.seek(1);
    const el = await mount(`<div id="ar5-root" data-composition-id="ar5" data-start="0" data-duration="4" data-fps="10"><div data-component="${name}" data-start="0"></div></div>`);
    cleanup.push(el);
    await until(() => seen.length, 'the init seek');
    // The init seek: fps and duration are the earlier root's until the clock reads this one.
    expect(seen[0].slice(0, 3)).toEqual([1, 1, 100]);
    wf.kinetic.config({});
    seen.length = 0;
    await dispatchSeek(2).done;                 // hf-seek
    wf.kinetic.seek(3);                          // the clock's own seek
    await tick(0);
    wf.kinetic.config({ channel: 'timeline' }); // the runtime's timeline registry
    window.__timelines.ar5.seek(0.5);
    await tick(0);
    // progress runs to 1 on the last captured frame, 4 - 1/10 s.
    const last = 4 - 1 / 10;
    expect(seen).toEqual([[2, 2, 200, 2 / last, 20], [3, 3, 300, 3 / last, 30], [0.5, 0.5, 50, 0.5 / last, 5]]);
  });

  it('on the timeline channel, a seek reaches the scenes, the clips and the DOM', async () => {
    const { wf } = await load();
    const name = uniqueName('tl');
    scenesToDrop.push(name);
    const seeks = [];
    wf.kinetic.scene(name, { seek(local) { seeks.push(local); } });
    const el = await mount(`<div data-composition-id="ar6" data-start="0" data-duration="6">
      <div id="ar6-a" data-component="${name}" data-start="1" data-duration="2"><b class="l" data-bind="local"></b></div>
      <div id="ar6-b" data-start="3" data-duration="2"></div>
    </div>`);
    cleanup.push(el);
    await until(() => seeks.length, 'the init seek');
    wf.kinetic.config({ channel: 'timeline' });
    // One timeline per page, registered under the root that was there the
    // first time the channel was chosen (an earlier test's, in a full run).
    const tl = window.__timelines.ar6 || Object.values(window.__timelines)[0];
    tl.seek(2.5);
    await tick(0);
    expect(seeks[seeks.length - 1]).toBe(1.5);
    expect(el.querySelector('.l').textContent).toBe('1.5');
    expect([el.querySelector('#ar6-a').style.visibility, el.querySelector('#ar6-b').style.visibility]).toEqual(['visible', 'hidden']);
    tl.seek(3.5);
    await tick(0);
    expect([el.querySelector('#ar6-a').style.visibility, el.querySelector('#ar6-b').style.visibility]).toEqual(['hidden', 'visible']);
    expect(tl.time()).toBe(3.5);
  });

  it('a seek to the time the clock already holds skips seek(local), whose local has not changed, settles its barrier, and leaves the DOM as it was', async () => {
    const { wf } = await load();
    const name = uniqueName('same');
    scenesToDrop.push(name);
    const seeks = [];
    wf.kinetic.scene(name, { seek(local) { seeks.push(local); this.element.querySelector('.n').textContent = String(seeks.length); } });
    const el = await mount(`${KEYFRAMES}<div data-composition-id="ar7" data-start="0" data-duration="5"><div data-component="${name}" data-start="0"><b class="l" data-bind="local"></b><i class="n"></i>${ANIM}</div></div>`);
    cleanup.push(el);
    await until(() => seeks.length, 'the init seek');
    await dispatchSeek(1.25).done;
    const before = [el.querySelector('.l').textContent, animOf(el)];
    const n = seeks.length;
    const settled = await Promise.race([dispatchSeek(1.25).done.then(() => 'resolved'), tick(200).then(() => 'pending')]);
    expect(settled).toBe('resolved');
    expect(seeks.length).toBe(n);
    expect([el.querySelector('.l').textContent, animOf(el)]).toEqual(before);
    expect(el.querySelector('.n').textContent).toBe(String(n));
  });

  // A seek held by a scene's promise can settle after a later seek has
  // settled. If the after-seek hooks used the time of the seek they belong
  // to, the CSS catch-up would run last with the older time, leaving the
  // store and the bindings on the later frame and the CSS animations on the
  // earlier one. A render awaits each barrier, so only a preview playing
  // through a slow seek(local) promise would show it. The after hooks take
  // the clock's latest time, and this pins that.
  it('two seeks whose barriers settle out of order leave the CSS animations at the later seek, as the store is', async () => {
    const { wf } = await load();
    const name = uniqueName('slow');
    scenesToDrop.push(name);
    let release = null;
    wf.kinetic.scene(name, { seek(local) { if (local === 1) return new Promise((r) => { release = r; }); return undefined; } });
    const el = await mount(`${KEYFRAMES}<div data-composition-id="ar8" data-start="0" data-duration="5"><div data-component="${name}" data-start="0">${ANIM}</div></div>`);
    cleanup.push(el);
    await dispatchSeek(0.5).done;
    const a = dispatchSeek(1);                // held by the scene
    const b = dispatchSeek(2);                // settles first
    await b.done;
    expect(animOf(el), 'once the later seek has settled').toEqual(['paused', 2000]);
    release();
    await a.done;
    expect(wf.getStore('kinetic').time).toBe(2);
    expect(animOf(el), 'once the earlier seek has settled too').toEqual(['paused', 2000]);   // receives ['paused', 1000]
  });
});
