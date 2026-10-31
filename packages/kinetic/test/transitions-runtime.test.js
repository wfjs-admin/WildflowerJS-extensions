/**
 * Transitions with the real HyperFrames runtime on the page (the pinned IIFE
 * in tools/hyperframes, loaded first as runtime.test.js loads it): the
 * runtime shows and hides the clips itself, and Kinetic still writes the
 * transition's styles on every seek the runtime makes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript, tick, CORE, WF_FILE, RUNTIME_FILE, BUILD, CORE_TIER } from './helpers.js';

let wf, host, available = true;

beforeAll(async () => {
  host = document.createElement('div');
  host.innerHTML = `<div id="stage" data-composition-id="main" data-no-timeline data-start="0" data-duration="4" data-fps="10" data-width="320" data-height="180" style="position: relative; width: 320px; height: 180px">
    <div id="a" style="position: absolute; inset: 0" data-start="0" data-duration="2"></div>
    <div id="b" style="position: absolute; inset: 0" data-start="a - 1" data-duration="2" data-clip-transition="push from-left linear" data-clip-exit="fade 0.5 linear"></div>
  </div>`;
  document.body.appendChild(host);
  try { await loadScript(RUNTIME_FILE); } catch (_) { available = false; return; }
  await loadScript(CORE);
  await loadScript(WF_FILE);
  wf = window.wildflower;
  wf.scan(host);
  for (let i = 0; i < 600 && !window.__player; i++) await tick(16);
  await tick(0);
}, 20000);

const seekAndWait = async (t) => { window.__player.renderSeek(t); await window.__hfWaitForSeekCompletion(); };
const css = (prop, v) => { const i = document.createElement('i'); i.style.setProperty(prop, v); return i.style.getPropertyValue(prop); };
const snap = () => ['a', 'b'].map((id) => { const s = host.querySelector('#' + id).style; return [s.translate, s.opacity].join('|'); });

describe(`transitions with the HyperFrames runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the runtime is on the page (fetch it with node scripts/fetch-hyperframes.cjs if this fails)', () => {
    expect(available).toBe(true);
    expect(window.__player).toBeTruthy();
  });

  it("the transition and the exit apply on the runtime's seeks, and nothing is left outside them", async () => {
    // The overlap runs 1 to 2, its last frame 1.9, so p = (t - 1) / 0.9;
    // the exit runs 2.5 to 3, its last frame 2.9. t is the time the clock
    // took from the runtime, which puts a seek on its own frame grid.
    const { transition } = wf.kinetic;
    const now = () => wf.getStore('kinetic').time;
    await seekAndWait(1.3);
    const push = transition('push', (now() - 1) / 0.9, { direction: 'from-left' });
    expect(now()).toBeGreaterThan(1.2);
    expect(snap()).toEqual([css('translate', push.out.translate) + '|', css('translate', push.in.translate) + '|']);
    await seekAndWait(0.5);
    expect(snap()).toEqual(['|', '|']);
    await seekAndWait(2.7);
    expect(snap()).toEqual(['|', '|' + transition('fade', (now() - 2.5) / 0.4).out.opacity]);
    await seekAndWait(1.9);
    expect(snap()).toEqual([css('translate', '100% 0%') + '|', '|']);
    await seekAndWait(3.5);
    expect(snap()).toEqual(['|', '|']);
  });
});
