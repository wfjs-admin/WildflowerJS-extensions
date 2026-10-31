/**
 * Transitions: data-clip-transition on a clip turns its overlap with the sibling
 * clip it starts inside into a transition of a kind; data-clip-enter and
 * data-clip-exit give a clip an entrance or an exit of its own length; and
 * transition(kind, p, options) returns the same styles for use inside a
 * scene. Kinetic writes translate, scale, rotate, opacity, clip-path, filter
 * and z-index inline during the window only, and puts back the clip's own
 * inline value after.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount as mountHost, dispatchSeek, captureWarnings, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

// Mounts a composition and has the clock read its length: the clock reads
// the root on the first seek, and a test's root replaces the one before it.
async function mount(html) {
  const host = await mountHost(html);
  const { wf } = await load();
  wf.kinetic.config({});
  return host;
}

const cleanup = [];
const scenesToDrop = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const name of scenesToDrop.splice(0)) wf.unregister(name);
  for (const el of cleanup.splice(0)) el.remove();
});

// The properties a transition writes, as inline style names.
const OWNED = ['opacity', 'translate', 'scale', 'rotate', 'clip-path', 'filter', 'z-index'];
const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

// The owned properties an element carries inline, as the browser writes them.
function owned(el) {
  const o = {};
  for (const k of OWNED) { const v = el.style.getPropertyValue(k); if (v) o[k] = v; }
  return o;
}

// A style object as the browser writes it back, keyed like owned().
function css(style) {
  const probe = document.createElement('i');
  const o = {};
  for (const k of Object.keys(style)) {
    probe.style.setProperty(kebab(k), String(style[k]));
    o[kebab(k)] = probe.style.getPropertyValue(kebab(k));
  }
  return o;
}

// The table of Part B at p = 0, 0.5 and 1, written out: [in, out] for each.
const SLIDE = {
  'from-right':  ['100% 0%', '50% 0%', '-50% 0%', '-100% 0%'],
  'from-left':   ['-100% 0%', '-50% 0%', '50% 0%', '100% 0%'],
  'from-top':    ['0% -100%', '0% -50%', '0% 50%', '0% 100%'],
  'from-bottom': ['0% 100%', '0% 50%', '0% -50%', '0% -100%'],
};
const WIPE = {
  'from-left':   ['inset(0% 100% 0% 0%)', 'inset(0% 50% 0% 0%)'],
  'from-right':  ['inset(0% 0% 0% 100%)', 'inset(0% 0% 0% 50%)'],
  'from-top':    ['inset(0% 0% 100% 0%)', 'inset(0% 0% 50% 0%)'],
  'from-bottom': ['inset(100% 0% 0% 0%)', 'inset(50% 0% 0% 0%)'],
};
const CLOCK = {
  clockwise:     ['polygon(50% 50%, 50% 0%, 50% 0%)', 'polygon(50% 50%, 50% 0%, 100% 0%, 100% 100%, 50% 100%)'],
  anticlockwise: ['polygon(50% 50%, 50% 0%, 50% 0%)', 'polygon(50% 50%, 50% 0%, 0% 0%, 0% 100%, 50% 100%)'],
};
function table(kind, dir, p) {
  const i = p === 0 ? 0 : p === 0.5 ? 1 : 2;
  switch (kind) {
    case 'fade':   return [[{ opacity: 0 }, {}], [{ opacity: 0.5 }, { opacity: 0.5 }], [{}, { opacity: 0 }]][i];
    case 'push':   return [[{ translate: SLIDE[dir][0] }, {}], [{ translate: SLIDE[dir][1] }, { translate: SLIDE[dir][2] }], [{}, { translate: SLIDE[dir][3] }]][i];
    case 'cover':  return [[{ translate: SLIDE[dir][0], zIndex: 1 }, {}], [{ translate: SLIDE[dir][1], zIndex: 1 }, {}], [{ zIndex: 1 }, {}]][i];
    case 'reveal': return [[{}, { zIndex: 1 }], [{}, { translate: SLIDE[dir][2], zIndex: 1 }], [{}, { translate: SLIDE[dir][3], zIndex: 1 }]][i];
    case 'wipe':   return [[{ clipPath: WIPE[dir][0] }, {}], [{ clipPath: WIPE[dir][1] }, {}], [{}, {}]][i];
    case 'iris':   return [[{ clipPath: 'circle(0% at 50% 50%)' }, {}], [{ clipPath: 'circle(35.3553% at 50% 50%)' }, {}], [{}, {}]][i];
    case 'clock':  return [[{ clipPath: CLOCK[dir][0] }, {}], [{ clipPath: CLOCK[dir][1] }, {}], [{}, {}]][i];
    case 'zoom':   return [[{ scale: 1.15, opacity: 0 }, {}], [{ scale: 1.075, opacity: 0.5 }, { scale: 0.95, opacity: 0.5 }], [{}, { scale: 0.9, opacity: 0 }]][i];
    case 'blur':   return [[{ filter: 'blur(16px)', opacity: 0 }, {}], [{ filter: 'blur(8px)', opacity: 0.5 }, { filter: 'blur(8px)', opacity: 0.5 }], [{}, { filter: 'blur(16px)', opacity: 0 }]][i];
    case 'flip':   return [[{ rotate: 'y 90deg' }, {}], [{ rotate: 'y 90deg' }, { rotate: 'y -90deg' }], [{}, { rotate: 'y -90deg' }]][i];
  }
  throw new Error('no kind ' + kind);
}

const SIDES = ['from-right', 'from-left', 'from-top', 'from-bottom'];
const CASES = [
  ['fade'],
  ...SIDES.map((d) => ['push', d]), ...SIDES.map((d) => ['cover', d]), ...SIDES.map((d) => ['reveal', d]),
  ...['from-left', 'from-right', 'from-top', 'from-bottom'].map((d) => ['wipe', d]),
  ['iris'], ['clock', 'clockwise'], ['clock', 'anticlockwise'], ['zoom'], ['blur'], ['flip'],
];
const DEFAULT_DIR = { push: 'from-right', cover: 'from-right', reveal: 'from-right', wipe: 'from-left', clock: 'clockwise' };

describe(`transition(kind, p, options) (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("returns the table's in and out styles for every kind and direction at p = 0, 0.5 and 1", async () => {
    const { wf } = await load();
    const { transition } = wf.kinetic;
    expect(typeof transition).toBe('function');
    for (const [kind, dir] of CASES) {
      for (const p of [0, 0.5, 1]) {
        const [i, o] = table(kind, dir || null, p);
        expect(transition(kind, p, dir ? { direction: dir } : undefined), kind + ' ' + (dir || '') + ' at ' + p).toEqual({ in: i, out: o });
      }
      if (DEFAULT_DIR[kind] === dir) expect(transition(kind, 0.5), kind + ' default').toEqual(transition(kind, 0.5, { direction: dir }));
    }
    // Between the corners, the sweep ends on the box's edge.
    expect(transition('clock', 0.25).in.clipPath).toBe('polygon(50% 50%, 50% 0%, 100% 0%, 100% 50%)');
  });

  it('throws KN-100 on a bad kind, a direction the kind does not take, or a p that is not a number', async () => {
    const { wf } = await load();
    const { transition } = wf.kinetic;
    expectKN(() => transition('slide', 0.5), 'KN-100', 'transition(kind)', /^kind is one of .*, not "slide"/);
    expectKN(() => transition('constructor', 0.5), 'KN-100', 'transition(kind)');
    expectKN(() => transition(undefined, 0.5), 'KN-100', 'transition(kind)');
    expectKN(() => transition('push', 0.5, 'left'), 'KN-100', "transition('push', p, options)", /^options is \{ direction \}/);
    expectKN(() => transition('push', 0.5, { direction: 'clockwise' }), 'KN-100', "transition('push', p, { direction })", /clockwise/);
    expectKN(() => transition('fade', 0.5, { direction: 'from-left' }), 'KN-100', "transition('fade', p, { direction })", /fade/);
    expectKN(() => transition('push', NaN), 'KN-100', "transition('push', p)");
    expectKN(() => transition('push', '0.5'), 'KN-100', "transition('push', p)");
  });
});

describe(`data-clip-transition, data-clip-enter and data-clip-exit on clips (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('every kind, both sides, at p = 0, 0.5 and 1 for each direction, and nothing left before or after the overlap', async () => {
    const { wf } = await load();
    // A from 0 to 2, B from 1 to 3: the overlap is 1 to 2, whose last frame
    // at 10 fps is 1.9, so p is (t - 1) / 0.9. The default ease and linear
    // both give 0.5 at the middle; the tokens come in either order.
    const attr = ([kind, dir], n) => {
      const d = dir && dir !== DEFAULT_DIR[kind] ? dir : '';
      if (n % 3 === 0) return [kind, d, 'linear'].filter(Boolean).join(' ');
      if (n % 3 === 1) return [kind, 'linear', d].filter(Boolean).join(' ');
      return [kind, d].filter(Boolean).join(' ');
    };
    const groups = CASES.map((c, n) => `<div class="g"><div class="a" data-start="0" data-duration="2"></div><div class="b" data-start="1" data-duration="2" data-clip-transition="${attr(c, n)}"></div></div>`).join('');
    const host = await mount(`<div data-composition-id="tr1" data-start="0" data-duration="4" data-fps="10">${groups}</div>`);
    cleanup.push(host);
    const gs = [...host.querySelectorAll('.g')];
    const snap = () => gs.map((g) => [owned(g.querySelector('.a')), owned(g.querySelector('.b'))]);
    const at = async (t) => { await dispatchSeek(t).done; return snap(); };
    const none = CASES.map(() => [{}, {}]);
    const expected = (p) => CASES.map(([kind, dir]) => { const [i, o] = table(kind, dir || null, p); return [css(o), css(i)]; });
    expect(await at(1.45), 'p = 0.5').toEqual(expected(0.5));
    expect(await at(0.5), 'before').toEqual(none);
    expect(await at(1.9), 'p = 1').toEqual(expected(1));
    expect(await at(1), 'p = 0').toEqual(expected(0));
    expect(await at(2.5), 'after').toEqual(none);
    expect(await at(2), 'the end of the overlap').toEqual(none);
    expect(await at(1.45), 'p = 0.5 again').toEqual(expected(0.5));
    expect(await at(0), 'the start').toEqual(none);
  });

  it('an ease token shapes p, and power2.inOut is the default', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr2" data-start="0" data-duration="4" data-fps="10">
      <div class="g"><div data-start="0" data-duration="2"></div><div id="in" data-start="1" data-duration="2" data-clip-transition="fade power3.in"></div></div>
      <div class="g"><div data-start="0" data-duration="2"></div><div id="def" data-start="1" data-duration="2" data-clip-transition="fade"></div></div>
    </div>`);
    cleanup.push(host);
    // power3.in at 0.5 is 0.5^4; power2.inOut at 0.25 is 4 * 0.25^3.
    await dispatchSeek(1.45).done;
    expect(host.querySelector('#in').style.opacity).toBe('0.0625');
    await dispatchSeek(1 + 0.9 * 0.25).done;
    expect(host.querySelector('#def').style.opacity).toBe('0.0625');
  });

  it('data-clip-transition finds the sibling it overlaps, runs over exactly the overlap, and gives the same styles in any seek order', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr3" data-start="0" data-duration="6" data-fps="30">
      <div id="backdrop" data-start="0" data-duration="6"></div>
      <div id="early" data-start="0" data-duration="1"></div>
      <div id="intro" data-start="0" data-duration="3"></div>
      <div id="next" data-start="intro - 0.5" data-duration="3" data-clip-transition="push from-right"></div>
    </div>`);
    cleanup.push(host);
    const ids = ['backdrop', 'early', 'intro', 'next'];
    const snap = () => ids.map((id) => id + ':' + JSON.stringify(owned(host.querySelector('#' + id)))).join(' ');
    const times = [2.49, 2.5, 2.75, 3 - 1 / 30, 3, 4, 1];
    const first = {};
    for (const t of times) { await dispatchSeek(t).done; first[t] = snap(); }
    const second = {};
    for (const t of [3, 2.75, 1, 3 - 1 / 30, 4, 2.5, 2.49]) { await dispatchSeek(t).done; second[t] = snap(); }
    expect(second).toEqual(first);
    const plain = (next, intro) => `backdrop:{} early:{} intro:${JSON.stringify(intro)} next:${JSON.stringify(next)}`;
    expect(first[2.49]).toBe(plain({}, {}));
    expect(first[2.5]).toBe(plain(css({ translate: '100% 0%' }), {}));
    const p = (2.75 - 2.5) / (0.5 - 1 / 30);
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(2 - 2 * p, 3) / 2;   // power2.inOut
    const r = (v) => String(Math.round(v * 1e4) / 1e4);
    expect(first[2.75]).toBe(plain(css({ translate: r(100 * (1 - e)) + '% 0%' }), css({ translate: r(-100 * e) + '% 0%' })));
    expect(first[3 - 1 / 30]).toBe(plain({}, css({ translate: '-100% 0%' })));
    expect(first[3]).toBe(plain({}, {}));
    expect(first[4]).toBe(plain({}, {}));
    expect(first[1]).toBe(plain({}, {}));
    const report = await wf.kinetic.check({ samples: 60 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
  });

  it("a clip's own transform composes with a push: the box is scaled by the clip's transform and moved by the push", async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr4" data-start="0" data-duration="4" data-fps="10" style="position: relative; width: 200px; height: 100px">
      <div class="g" style="position: absolute; inset: 0">
        <div style="position: absolute; inset: 0" data-start="0" data-duration="2"></div>
        <div id="b" style="position: absolute; inset: 0; transform: scale(0.5)" data-start="1" data-duration="2" data-clip-transition="push linear"></div>
</div>
    </div>`);
    cleanup.push(host);
    const b = host.querySelector('#b');
    const box = () => { const r = b.getBoundingClientRect(), o = host.firstElementChild.getBoundingClientRect(); return [Math.round(r.left - o.left), Math.round(r.width)]; };
    await dispatchSeek(0.5).done;
    expect(box()).toEqual([50, 100]);            // scale(0.5) about the centre
    await dispatchSeek(1.45).done;               // p = 0.5: translate 50% of 200px
    expect(b.style.transform).toBe('scale(0.5)');
    expect(b.style.translate).toBe(css({ translate: '50% 0%' }).translate);
    expect(box()).toEqual([150, 100]);
    await dispatchSeek(2.5).done;
    expect(box()).toEqual([50, 100]);
    expect(b.style.translate).toBe('');
  });

  it("a clip's own inline opacity is restored after a fade, on both sides", async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr5" data-start="0" data-duration="4" data-fps="10">
      <div class="g"><div id="a" style="opacity: 0.8; color: red" data-start="0" data-duration="2"></div><div id="b" style="opacity: 0.6" data-start="1" data-duration="2" data-clip-transition="fade linear"></div></div>
    </div>`);
    cleanup.push(host);
    const a = host.querySelector('#a'), b = host.querySelector('#b');
    const op = () => [a.style.opacity, b.style.opacity];
    await dispatchSeek(0.5).done;
    expect(op()).toEqual(['0.8', '0.6']);
    await dispatchSeek(1.45).done;
    expect(op()).toEqual(['0.5', '0.5']);
    await dispatchSeek(1.9).done;
    expect(op()).toEqual(['0', '0.6']);         // p = 1: the incoming clip carries no transition style
    await dispatchSeek(2.5).done;
    expect(op()).toEqual(['0.8', '0.6']);
    expect(a.style.color).toBe('red');
    await dispatchSeek(1).done;
    expect(op()).toEqual(['0.8', '0']);         // p = 0: the outgoing clip carries none
  });

  it('data-clip-enter and data-clip-exit with seconds, s and f lengths, f at 30 and 24 fps', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr6" data-start="0" data-duration="5" data-fps="30">
      <h1 id="t" data-start="1" data-duration="3" data-clip-enter="fade 0.5 linear" data-clip-exit="fade linear 15f"></h1>
      <h2 id="w" data-start="1" data-duration="3" data-clip-enter="wipe from-right 0.5s linear"></h2>
    </div>`);
    cleanup.push(host);
    const t = host.querySelector('#t'), w = host.querySelector('#w');
    const at = async (s) => { await dispatchSeek(s).done; return [t.style.opacity, w.style.clipPath]; };
    // Over 0.5 s at 30 fps, p runs from 0 on the first frame to 1 on the
    // fifteenth, 0.5 - 1/30 s later.
    const mid = 1 + (0.5 - 1 / 30) / 2;
    expect(await at(0.5)).toEqual(['', '']);
    expect(await at(1)).toEqual(['0', css({ clipPath: 'inset(0% 0% 0% 100%)' })['clip-path']]);
    expect(await at(mid)).toEqual(['0.5', css({ clipPath: 'inset(0% 0% 0% 50%)' })['clip-path']]);
    expect(await at(1.5 - 1 / 30)).toEqual(['', '']);
    expect(await at(2.5)).toEqual(['', '']);
    // The exit: 15 frames at 30 fps is 0.5 s, the last of them on the clip's last frame.
    expect(await at(3.5)).toEqual(['', '']);
    expect(await at(3.5 + (0.5 - 1 / 30) / 2)).toEqual(['0.5', '']);
    expect(await at(4 - 1 / 30)).toEqual(['0', '']);
    expect(await at(4)).toEqual(['', '']);
    expect(await at(mid)).toEqual(['0.5', css({ clipPath: 'inset(0% 0% 0% 50%)' })['clip-path']]);
    host.remove();
    const h24 = await mount(`<div data-composition-id="tr7" data-start="0" data-duration="5" data-fps="24">
      <h1 id="t" data-start="1" data-duration="3" data-clip-exit="fade 12f linear"></h1>
    </div>`);
    cleanup.push(h24);
    const t24 = h24.querySelector('#t');
    await dispatchSeek(3.5 - 1 / 24).done;
    expect(t24.style.opacity).toBe('');
    await dispatchSeek(3.5).done;
    expect(t24.style.opacity).toBe('');          // p = 0: the clip on its way out carries none yet
    await dispatchSeek(3.5 + (0.5 - 1 / 24) / 2).done;
    expect(t24.style.opacity).toBe('0.5');
    await dispatchSeek(4 - 1 / 24).done;
    expect(t24.style.opacity).toBe('0');
  });

  it("a clip's data-clip-exit and the next clip's data-clip-transition over the same seconds: the clip gets both, their opacities multiply, and the later clip's wins any other shared property", async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr12" data-start="0" data-duration="4" data-fps="10">
      <div class="g"><div id="a" data-start="0" data-duration="2" data-clip-exit="fade 1 linear"></div><div id="b" data-start="1" data-duration="2" data-clip-transition="push linear"></div></div>
      <div class="g"><div id="c" data-start="0" data-duration="2" data-clip-exit="fade 1 power3.in"></div><div id="d" data-start="1" data-duration="2" data-clip-transition="zoom linear"></div></div>
    </div>`);
    cleanup.push(host);
    await dispatchSeek(1.45).done;
    expect(owned(host.querySelector('#a'))).toEqual(css({ opacity: 0.5, translate: '-50% 0%' }));
    // c's own exit alone gives opacity 0.9375 (power3.in at 0.5) and d's zoom 0.5, so c shows at 0.9375 * 0.5.
    expect(owned(host.querySelector('#c'))).toEqual(css({ opacity: 0.4688, scale: 0.95 }));
    await dispatchSeek(1.9).done;
    expect(owned(host.querySelector('#a'))).toEqual(css({ opacity: 0, translate: '-100% 0%' }));
    await dispatchSeek(2).done;
    expect(owned(host.querySelector('#a'))).toEqual({});
  });

  it('an overshooting ease on iris and blur writes no negative radius or length, so a frame reads the same after any seek, and check() passes', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr13" data-start="0" data-duration="4" data-fps="30" style="position: relative; width: 200px; height: 100px">
      <div id="i" style="position: absolute; inset: 0" data-start="0" data-duration="3" data-clip-enter="iris 1s back.in"></div>
      <div id="b" style="position: absolute; inset: 0" data-start="0" data-duration="3" data-clip-enter="blur 1s back.out"></div>
    </div>`);
    cleanup.push(host);
    const i = host.querySelector('#i'), b = host.querySelector('#b');
    const at = async (before, t) => { await dispatchSeek(before).done; await dispatchSeek(t).done; return [i.getAttribute('style'), b.getAttribute('style')]; };
    // back.in dips under 0 early in the window and back.out passes 1 late in it.
    expect(await at(0.5, 0.1)).toEqual(await at(0, 0.1));
    expect(await at(0.5, 0.8)).toEqual(await at(0.3, 0.8));
    await dispatchSeek(0.1).done;
    expect(i.style.clipPath).toBe(css({ clipPath: 'circle(0% at 50% 50%)' })['clip-path']);
    await dispatchSeek(0.8).done;
    expect(b.style.filter).toBe(css({ filter: 'blur(0px)' }).filter);
    const report = await wf.kinetic.check({ samples: 30 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
  });

  it('cover puts the incoming clip on top for the whole overlap when it comes first in the markup', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr14" data-start="0" data-duration="4" data-fps="10" style="position: relative; width: 200px; height: 100px">
      <div id="b" style="position: absolute; inset: 0; background: red" data-start="a - 0.5" data-duration="2" data-clip-transition="cover linear"></div>
      <div id="a" style="position: absolute; inset: 0; background: blue" data-start="0" data-duration="2"></div>
    </div>`);
    cleanup.push(host);
    const box = host.firstElementChild.getBoundingClientRect();
    const top = () => { const el = document.elementFromPoint(box.left + 190, box.top + 50); return el && el.id; };
    // The overlap is 1.5 to 2, its last frame 1.9; at 1.8 b covers the right three quarters.
    for (const t of [1.6, 1.8, 1.9]) { await dispatchSeek(t).done; expect(top(), 'at ' + t).toBe('b'); }
    await dispatchSeek(2.5).done;
    expect(top()).toBe('b');
    expect(owned(host.querySelector('#b'))).toEqual({});
    const report = await wf.kinetic.check({ samples: 40 });
    expect(report.ok, JSON.stringify(report)).toBe(true);
  });

  it('an inline value written on a clip while its transition runs becomes its own value and comes back after the window; development builds say so once (KN-156)', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr15" data-start="0" data-duration="4" data-fps="10">
      <div class="g"><div id="a" data-start="0" data-duration="2"></div><div id="b" data-start="1" data-duration="2" data-clip-transition="fade linear"></div></div>
    </div>`);
    cleanup.push(host);
    const a = host.querySelector('#a');
    const lines = await captureWarnings(async () => {
      await dispatchSeek(1.2).done;
      a.style.opacity = '0.25';
      await dispatchSeek(1.45).done;
      expect(a.style.opacity).toBe('0.5');
      await dispatchSeek(2.5).done;
      expect(a.style.opacity).toBe('0.25');
      await dispatchSeek(1.45).done;
      await dispatchSeek(0.5).done;
      expect(a.style.opacity).toBe('0.25');
    });
    const kn = lines.filter((l) => l.includes('KN-156'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, lines.join(' || ')).toBe(1);
    expect(kn[0]).toMatch(/div#a.*opacity/);
  });

  it('reveal sets z-index: 1 on the outgoing clip for the whole overlap and removes it after', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="tr8" data-start="0" data-duration="4" data-fps="10">
      <div class="g"><div id="a" data-start="0" data-duration="2"></div><div id="b" data-start="1" data-duration="2" data-clip-transition="reveal from-left"></div></div>
      <div class="g"><div id="c" style="z-index: 5" data-start="0" data-duration="2"></div><div data-start="1" data-duration="2" data-clip-transition="reveal"></div></div>
    </div>`);
    cleanup.push(host);
    const z = () => [host.querySelector('#a').style.zIndex, host.querySelector('#c').style.zIndex];
    await dispatchSeek(0.9).done;
    expect(z()).toEqual(['', '5']);
    for (const t of [1, 1.45, 1.9]) { await dispatchSeek(t).done; expect(z(), 'at ' + t).toEqual(['1', '1']); }
    await dispatchSeek(2).done;
    expect(z()).toEqual(['', '5']);
    expect(owned(host.querySelector('#b'))).toEqual({});
  });

  it('each bad attribute warns once per clip in development, nothing in production, and leaves the clips untouched', async () => {
    const { wf } = await load();
    const pair = (id, attrs, a = 'data-start="0" data-duration="2"') => `<div class="g"><div id="${id}-a" ${a}></div><div id="${id}" data-start="1" data-duration="2" ${attrs}></div></div>`;
    const host = await mount(`<div data-composition-id="tr9" data-start="0" data-duration="4" data-fps="10">
      ${pair('kind', 'data-clip-transition="slide from-left"')}
      ${pair('token', 'data-clip-transition="push sideways"')}
      ${pair('nodir', 'data-clip-transition="fade from-left"')}
      ${pair('twodirs', 'data-clip-transition="push from-left from-top"')}
      ${pair('trlen', 'data-clip-transition="fade 0.5"')}
      ${pair('none', 'data-clip-transition="fade"', 'data-start="0" data-duration="1"')}
      <div class="g"><div id="many-a" data-start="0" data-duration="2"></div><div id="many-a2" data-start="0.5" data-duration="1.4"></div><div id="many" data-start="1" data-duration="2" data-clip-transition="fade"></div></div>
      ${pair('nolen', 'data-clip-enter="fade"')}
      ${pair('long', 'data-clip-exit="fade 3"')}
      ${pair('both', 'data-clip-transition="fade" data-clip-enter="fade 0.5"')}
      ${pair('half', 'data-clip-enter="fade 0.5" data-clip-exit="wipe 1q"')}
      <div class="g"><h1 id="noclip" data-clip-enter="fade 0.5"></h1></div>
    </div>`);
    cleanup.push(host);
    const all = [...host.querySelectorAll('.g > *')];
    const lines = await captureWarnings(async () => {
      for (const t of [1, 1.45, 1.9, 2.5, 1.2, 0.2]) {
        await dispatchSeek(t).done;
        for (const el of all) expect(owned(el), (el.id || el.localName) + ' at ' + t).toEqual({});
      }
    });
    const kn = lines.filter((l) => /KN-11[56]/.test(l));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    const of = (id) => kn.filter((l) => l.includes('#' + id + ' '));
    for (const id of ['kind', 'token', 'nodir', 'twodirs', 'trlen', 'nolen', 'long', 'both', 'half', 'noclip']) {
      expect(of(id).length, id + ': ' + kn.join(' || ')).toBe(1);
      expect(of(id)[0], id).toMatch(/\[KN-115\]/);
    }
    for (const id of ['none', 'many']) {
      expect(of(id).length, id + ': ' + kn.join(' || ')).toBe(1);
      expect(of(id)[0], id).toMatch(/\[KN-116\]/);
    }
    expect(kn.length).toBe(12);
    expect(of('kind')[0]).toMatch(/'slide' is not a kind/);
    expect(of('token')[0]).toMatch(/'sideways'/);
    expect(of('nodir')[0]).toMatch(/fade takes no direction/);
    expect(of('twodirs')[0]).toMatch(/two directions/);
    expect(of('trlen')[0]).toMatch(/takes no length/);
    expect(of('none')[0]).toMatch(/no sibling clip/);
    expect(of('many')[0]).toMatch(/div#many-a, div#many-a2/);
    expect(of('nolen')[0]).toMatch(/no length/);
    expect(of('long')[0]).toMatch(/3 s, is longer than the clip, 2 s/);
    expect(of('both')[0]).toMatch(/both data-clip-transition and data-clip-enter/);
    expect(of('half')[0]).toMatch(/data-clip-exit="wipe 1q".*'1q'/);
    expect(of('noclip')[0]).toMatch(/no data-start/);
  });

  it("KN-156: a scene's root: block that writes opacity on a clip with a fade warns once in development", async () => {
    const { wf } = await load();
    const name = uniqueName('rootfade');
    scenesToDrop.push(name);
    wf.kinetic.scene(name, {
      root: { style: { opacity: 'look' } },
      computed: { look() { return String(Math.max(0, Math.min(1, 0.2 + this.local))); } },
    });
    const host = await mount(`<div data-composition-id="tr10" data-start="0" data-duration="4" data-fps="10">
      <div class="g"><div data-start="0" data-duration="2"></div><div id="sc" data-component="${name}" data-start="1" data-duration="2" data-clip-transition="fade"></div></div>
    </div>`);
    cleanup.push(host);
    const lines = await captureWarnings(async () => {
      for (const t of [0.5, 1.2, 1.45, 1.7, 2.5, 1.3]) await dispatchSeek(t).done;
    });
    const kn = lines.filter((l) => l.includes('KN-156'));
    if (BUILD !== 'dev') { expect(kn).toEqual([]); return; }
    expect(kn.length, lines.join(' || ')).toBe(1);
    expect(kn[0]).toMatch(/div#sc.*opacity/);
    expect(lines[lines.indexOf(kn[0]) + 1]).toMatch(/inner element/);
  });

  it('four clips joined by three transitions on the frame grid pass check() with no console lines', async () => {
    const { wf } = await load();
    const lines = [];
    const origWarn = console.warn, origError = console.error;
    console.warn = (...a) => lines.push('warn: ' + a.join(' '));
    console.error = (...a) => lines.push('error: ' + a.join(' '));
    let report;
    try {
      const host = await mount(`<div data-composition-id="tr11" data-start="0" data-duration="6" data-fps="30" style="position: relative; width: 320px; height: 180px; overflow: hidden">
        <div id="c1" style="position: absolute; inset: 0; background: #203040" data-start="0" data-duration="2" data-clip-enter="fade 18f"></div>
        <div id="c2" style="position: absolute; inset: 0; background: #402030" data-start="c1 - 0.6" data-duration="2" data-clip-transition="push from-bottom"></div>
        <div id="c3" style="position: absolute; inset: 0; background: #304020" data-start="c2 - 0.6" data-duration="2" data-clip-transition="iris"></div>
        <div id="c4" style="position: absolute; inset: 0; background: #403020" data-start="c3 - 0.6" data-duration="1.8" data-clip-transition="wipe" data-clip-exit="fade 18f"></div>
      </div>`);
      cleanup.push(host);
      await dispatchSeek(1.7).done;
      expect(host.querySelector('#c2').style.translate).not.toBe('');
      report = await wf.kinetic.check({ samples: 60 });
    } finally {
      console.warn = origWarn; console.error = origError;
    }
    expect(report.ok, JSON.stringify(report)).toBe(true);
    expect(lines).toEqual([]);
  });
});
