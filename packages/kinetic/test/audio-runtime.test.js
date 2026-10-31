/**
 * With the HyperFrames runtime on the page (the pinned IIFE in
 * tools/hyperframes, loaded first as runtime.test.js loads it), the runtime
 * owns media playback and Kinetic plays nothing: no AudioContext of its own,
 * and no source started from its file, while the player plays.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { userEvent } from 'vitest/browser';
import { loadScript, tick, tone, wavUrl, CORE, WF_FILE, RUNTIME_FILE, BUILD, CORE_TIER } from './helpers.js';

// Whether the direct caller of the wrapper below is Kinetic's file: the
// stack's first line is the Error, the second this wrapper, the third its
// caller. The runtime's own calls, even inside a call Kinetic made to the
// player, have the runtime as their direct caller.
const calledByKinetic = () => /kinetic\.wf/.test((new Error().stack || '').split('\n').filter((l) => /(https?|blob):/.test(l))[2] || '');
// Sources on a live context only: the levels' analysis mixes the clips on
// an OfflineAudioContext, which plays nothing.
const fromKinetic = [];
const realStart = AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start = function () {
  if (!(this.context instanceof OfflineAudioContext) && calledByKinetic()) fromKinetic.push(this);
  return realStart.apply(this, arguments);
};
const made = [];
const RealContext = window.AudioContext;
window.AudioContext = class extends RealContext {
  constructor(...a) { super(...a); if (calledByKinetic()) made.push(this); }
};

let wf, available = true;

beforeAll(async () => {
  const host = document.createElement('div');
  host.innerHTML = `<div id="stage" data-composition-id="main" data-no-timeline data-start="0" data-duration="3" data-fps="30" data-width="320" data-height="180">
    <audio id="music" src="${wavUrl(tone(220, 3))}" data-start="0" data-duration="3"></audio>
    <div style="position: absolute; inset: 0" data-start="0" data-duration="3"></div>
  </div>`;
  document.body.appendChild(host);
  try { await loadScript(RUNTIME_FILE); } catch (_) { available = false; return; }
  await loadScript(CORE);
  await loadScript(WF_FILE);
  wf = window.wildflower;
  for (let i = 0; i < 600 && !window.__player; i++) await tick(16);
  await tick(0);
}, 20000);

describe(`audio with the HyperFrames runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the runtime is on the page', () => {
    expect(available).toBe(true);
    expect(window.__player).toBeTruthy();
  });

  it('Kinetic decodes the clip but starts nothing while the player plays', async () => {
    await wf.kinetic.ready();
    await userEvent.click(document.body);
    wf.kinetic.play();
    await tick(400);
    wf.kinetic.pause();
    wf.kinetic.seek(1);
    await tick(50);
    expect(made.length).toBe(0);
    expect(fromKinetic.length).toBe(0);
    // The decode was done all the same: level() reads the clip.
    expect(wf.kinetic.level(1, 'all')).toBeGreaterThan(0.5);
  });
});
