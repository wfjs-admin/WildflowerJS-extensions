/**
 * Readiness holds nothing: every run (the one registered for the runtime,
 * and each ready(), check() and render()) evaluates the page as it is then,
 * fetching again a map or an animated image that failed, and its result
 * sets the root's data-kinetic-ready. So a file that failed once and then
 * loads leaves the next check() ok and the root "true", and a scene that
 * fails stops failing once it is removed. A failure a source reports after
 * frame 0 marks the root failed until the next run; one that comes while a
 * run is going is that run's, and one during check()'s seeks fails that
 * check(). A failure is printed once while it lasts, and again once its
 * source has passed. With the runtime on the page the root says "true" only
 * after __renderReady. An error without a KN code (one the browser threw) is
 * a run's failure like any other. Each case is a page of its own.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { framedPage, expectKN, wavUrl, tone, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const FIX = '/packages/kinetic/test/fixtures/';
const ROOT = (inner = '') => `<div data-composition-id="rr" data-no-timeline data-start="0" data-duration="1" data-fps="10" data-width="100" data-height="60" style="position:relative;width:100px;height:60px">${inner}</div>`;
// fetch() answers 404 the first time a URL containing `part` is asked for.
const FAIL_ONCE = (part) => `<script>{ const f = window.fetch; let n = 0; window.fetch = (u, o) => (String(u).includes(${JSON.stringify(part)}) && !n++ ? Promise.resolve(new Response('', { status: 404 })) : f(u, o)); }<\/script>`;
// fetch() answers 404 for a URL containing `part` until the page sets window.__fixed.
const BROKEN = (part) => `<script>{ const f = window.fetch; window.fetch = (u, o) => (String(u).includes(${JSON.stringify(part)}) && !window.__fixed ? Promise.resolve(new Response('', { status: 404 })) : f(u, o)); }<\/script>`;
// A Lottie animation's stand-in, with its listeners in `on`.
const fakeLottie = (extra) => { const on = {}; return Object.assign({ on, isLoaded: false, goToAndStop() {}, addEventListener(n, f) { (on[n] = on[n] || []).push(f); return () => {}; } }, extra); };
const readyOf = (p) => p.doc.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready');
const until = async (fn) => { for (let i = 0; i < 50 && !fn(); i++) await new Promise((r) => setTimeout(r, 10)); };

describe(`readiness failures recover (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a luma map that 404s once in check() fails that check() and marks the page failed; the next check() fetches it again, passes, and the root is "true"', async () => {
    const p = await framedPage(ROOT('<div id="a" style="position:absolute;inset:0;background:#f00" data-start="0" data-duration="1"></div>'), cleanup, '', FAIL_ONCE('ramp.png?once'));
    expect(p.result).toBe('resolved');
    expect(readyOf(p)).toBe('true');
    p.doc.querySelector('[data-composition-id]').insertAdjacentHTML('beforeend',
      `<div id="b" style="position:absolute;inset:0;background:#00f" data-start="0.2" data-duration="0.8" data-clip-enter="luma url(${FIX}ramp.png?once) 0.3s"></div>`);
    const first = await p.kinetic.check({ samples: 3 });
    expect([first.ok, first.reason, readyOf(p)]).toEqual([false, 'readiness failed', 'failed']);
    expect(p.w.__errors.filter((l) => l.startsWith('[KN-117]')).length).toBe(1);
    const second = await p.kinetic.check({ samples: 3 });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    expect(readyOf(p)).toBe('true');
    await p.kinetic.ready();
  });

  it('an animated image made after frame 0 that 404s marks the page failed as it fails; the next check() fetches it again, passes, and the root is "true"', async () => {
    const p = await framedPage(ROOT(), cleanup, '', FAIL_ONCE('frames.gif?once'));
    expect(p.result).toBe('resolved');
    const img = p.kinetic.animatedImage(FIX + 'frames.gif?once');
    await until(() => readyOf(p) === 'failed');
    expect(readyOf(p)).toBe('failed');
    expect(p.w.__errors.filter((l) => l.startsWith('[KN-181]')).length).toBe(1);
    const r = await p.kinetic.check({ samples: 3 });
    expect([r.ok, readyOf(p), img.frames]).toEqual([true, 'true', 4]);
  });

  it('a scene mounted after frame 0 whose input fails (KN-130) fails check() whatever the root says, and once the scene is removed check() passes and the root is "true"', async () => {
    const p = await framedPage(ROOT() + `<script>
      wildflower.kinetic.scene('rr-card', { inputs: { title: { type: String, required: true } } });
    <\/script>`, cleanup, '', '');
    expect(p.result).toBe('resolved');
    const root = p.doc.querySelector('[data-composition-id]');
    root.insertAdjacentHTML('beforeend', '<div id="card" data-component="rr-card" data-start="0"><b data-bind="inputs.title"></b></div>');
    p.w.wildflower.scan(root);
    if (typeof p.w.wildflower.whenIdle === 'function') await p.w.wildflower.whenIdle();
    await until(() => readyOf(p) === 'failed');
    const failed = await p.kinetic.check({ samples: 3 });
    expect([failed.ok, failed.reason, readyOf(p)]).toEqual([false, 'readiness failed', 'failed']);
    // check() goes by its own run of readiness, not by the attribute.
    root.setAttribute('data-kinetic-ready', 'true');
    const still = await p.kinetic.check({ samples: 3 });
    expect([still.ok, still.reason, readyOf(p)]).toEqual([false, 'readiness failed', 'failed']);
    expectKN(await p.kinetic.ready().then(() => null, (e) => e), 'KN-130', "scene 'rr-card' input 'title'");
    p.doc.getElementById('card').remove();
    const ok = await p.kinetic.check({ samples: 3 });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
    expect(readyOf(p)).toBe('true');
  });

  it('an error without a KN code fails the run it comes in: ready() rejects with it, and once its cause is gone the next ready() resolves and the root is "true"', async () => {
    const stub = '<script>window.__O = window.OfflineAudioContext; window.OfflineAudioContext = function (c, n, r) { if (n > 1) throw new Error("no mixing here"); return new window.__O(c, n, r); };<\/script>';
    const p = await framedPage(ROOT(`<audio id="music" src="${wavUrl(tone(440, 0.5))}" data-start="0"></audio>`), cleanup, '', stub);
    expect(p.result && p.result.message).toBe('no mixing here');
    expect(p.result.code).toBeUndefined();
    p.w.OfflineAudioContext = p.w.__O;
    await p.kinetic.ready();
    expect(readyOf(p)).toBe('true');
    const r = await p.kinetic.check({ samples: 2 });
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  // A Lottie animation handed to lottie() while the run waits for its last
  // image, and failing at once, is a source that run had not seen: the run
  // looks at the page again, and fails with it.
  it('a failure that comes while a run waits for its last image is that run\'s: ready() rejects with it and the root is "failed"; once the animation is handed back, check() passes and the root is "true"', async () => {
    const p = await framedPage(ROOT(`<div data-component="rr-pic" data-start="0"><img id="pic" alt="" src="${FIX}ramp.png"></div>`)
      + "<script>wildflower.kinetic.scene('rr-pic', {});<\/script>", cleanup, '', '');
    expect(p.result).toBe('resolved');
    const anim = fakeLottie({ name: 'late' });
    let off = null;
    p.doc.getElementById('pic').decode = () => {
      if (!off) { off = p.kinetic.lottie(anim); for (const f of anim.on.data_failed) f(); }
      return Promise.resolve();
    };
    expectKN(await p.kinetic.ready().then(() => null, (e) => e), 'KN-180', "the Lottie animation 'late'");
    expect(readyOf(p)).toBe('failed');
    expect((await p.kinetic.check({ samples: 2 })).reason).toBe('readiness failed');
    off.dispose();
    const r = await p.kinetic.check({ samples: 2 });
    expect([r.ok, readyOf(p)]).toEqual([true, 'true']);
  });

  // check()'s run of readiness comes before its seeks; a failure reported
  // during them (a scene a section mounts partway) fails that check() too,
  // and every check() after it, however many times it has been printed.
  it('a scene that a section mounts partway with a bad input fails every check() with readiness failed, and the report gives the code and where', async () => {
    const p = await framedPage(ROOT('<div data-component="rr-host" data-start="0" style="position:absolute;inset:0"><div data-render="on"><div data-component="rr-bad"><b data-bind="inputs.title"></b></div></div></div>')
      + `<script>
        wildflower.kinetic.scene('rr-host', { computed: { on() { return this.local >= 0.5; } } });
        wildflower.kinetic.scene('rr-bad', { inputs: { title: { type: String, required: true } } });
      <\/script>`, cleanup, '', '');
    expect(p.result).toBe('resolved');
    for (let i = 1; i <= 3; i++) {
      const r = await p.kinetic.check({ samples: 10 });
      expect([r.ok, r.reason, r.code, r.where, r.ready], 'check() number ' + i).toEqual([false, 'readiness failed', 'KN-130', "scene 'rr-bad' input 'title'", 'failed']);
    }
  });

  // Each animation is its own source, so two whose messages are the same
  // (no name, no file, no scene) are both printed.
  it('two Lottie animations with no name or file, outside any scene, that both fail are each printed, and check() gives the code and where', async () => {
    const p = await framedPage(ROOT(), cleanup, '', '');
    expect(p.result).toBe('resolved');
    const a = fakeLottie(), b = fakeLottie();
    p.kinetic.lottie(a);
    p.kinetic.lottie(b);
    for (const x of [a, b]) for (const f of x.on.data_failed) f();
    expect(p.w.__errors.filter((l) => l.startsWith('[KN-180] the Lottie animation')).length).toBe(2);
    const r = await p.kinetic.check({ samples: 2 });
    expect([r.ok, r.reason, r.code, r.where]).toEqual([false, 'readiness failed', 'KN-180', 'the Lottie animation']);
  });

  // A failure is printed again once a run has found its source passing.
  it('a map that fails, is fixed, and fails again is printed each time it fails', async () => {
    const p = await framedPage(ROOT(`<div id="m" style="position:absolute;inset:0" data-start="0.2" data-duration="0.8" data-clip-enter="luma url(${FIX}missing-map.png) 0.3s"></div>`), cleanup, '', BROKEN('missing-map'));
    expect(p.result && p.result.code).toBe('KN-117');
    const printed = () => p.w.__errors.filter((l) => l.startsWith('[KN-117]')).length;
    expect(printed()).toBe(1);
    const m = p.doc.getElementById('m');
    m.setAttribute('data-clip-enter', `luma url(${FIX}ramp.png) 0.3s`);
    expect((await p.kinetic.check({ samples: 2 })).ok).toBe(true);
    m.setAttribute('data-clip-enter', `luma url(${FIX}missing-map.png) 0.3s`);
    const r = await p.kinetic.check({ samples: 2 });
    expect([r.ok, r.code]).toEqual([false, 'KN-117']);
    expect(printed()).toBe(2);
    expect((await p.kinetic.check({ samples: 2 })).ok).toBe(false);
    expect(printed()).toBe(2);
  });

  // The server answers 404 for both files, and then has them at the same
  // URLs: each run asks again, as it does for maps and animated images.
  it('a footage clip and an audio clip whose files 404 and are then put on the server: the next check() asks for each again and passes', async () => {
    const key = 'rr' + Math.random().toString(36).slice(2);
    const at = (part) => '/__kinetic/flaky/' + key + part;
    const p = await framedPage(ROOT(`<video id="v" src="${at('v/f30.webm')}" data-start="0" data-duration="1" muted playsinline></video><audio id="s" src="${at('a/f30.webm')}" data-start="0" data-duration="1"></audio>`), cleanup, '', '');
    expect(p.result && p.result.code).toBe('KN-138');
    await fetch(at('v/fix'));
    const a = await p.kinetic.check({ samples: 2 });
    expect([a.ok, a.reason, a.code]).toEqual([false, 'readiness failed', 'KN-135']);
    await fetch(at('a/fix'));
    const b = await p.kinetic.check({ samples: 2 });
    expect(b.ok, JSON.stringify(b)).toBe(true);
    expect(readyOf(p)).toBe('true');
  });

  // With the runtime on the page, the root says "true" only once the
  // runtime has published __renderReady, which it does not while the
  // registered entry it waits on is held.
  it('with the runtime on the page, a run that passes after the first one failed leaves the root "failed" until __renderReady is true', async () => {
    const p = await framedPage(ROOT(`<div style="position:absolute;inset:0" data-start="0.2" data-duration="0.8" data-clip-enter="luma url(${FIX}ramp.png?rt) 0.3s"></div>`), cleanup, '',
      '<script>window.__renderReady = false;<\/script>' + BROKEN('?rt'));
    expect(p.result && p.result.code).toBe('KN-117');
    expect(readyOf(p)).toBe('failed');
    p.w.__fixed = true;
    await p.kinetic.ready();
    expect(readyOf(p)).toBe('failed');
    p.w.__renderReady = true;
    await until(() => readyOf(p) === 'true');
    expect(readyOf(p)).toBe('true');
  });
});
