/**
 * The lesson walk: the page in interactive mode, each step entered in order
 * with go() and waited on to its hold, the last frame before the step's
 * wait (0.467 s for a wait of 0.5 at 30 fps). For each step: whether it
 * held and when, whether it plays on into the next (a step left without a
 * hold, as wait: false does), whether it waits on its until (canAdvance
 * false at the hold), the KN lines and console errors during it, and a PNG
 * of the frame at the hold. It answers no question: a step that waits on
 * its until is reported and the walk goes on with go() to the next. A step
 * that never holds and does not play on, or that prints a KN line or an
 * error, makes the walk's `ok` false.
 */

import { png } from './pixels.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `log` is the run's console record (wf.js), `px` the captures; `skip(e)`
// takes the error that stops the stills.
export async function walkLesson(wf, k, log, px, skip) {
  const s = wf.getStore('kinetic');
  k.pause();
  k.config({ mode: 'interactive' });
  // A page held in video mode (a renderer's runtime on it) has no lesson to
  // walk, and nor has a page with no steps.
  if (s.mode !== 'interactive') return { ok: false, steps: [], reason: 'video mode' };
  if (!s.stepCount) return { ok: false, steps: [], reason: 'no steps' };
  // Every hold, as the store reports it: the step and the time.
  let holds = [];
  const off = s.subscribe('waiting', (v) => { if (v) holds.push({ i: s.stepIndex, t: s.time, can: s.canAdvance }); });
  const steps = [];
  try {
    for (let i = 0; i < s.stepCount; i++) {
      const mark = log.lines.length;
      holds = [];
      k.go(i);
      const id = s.step, limit = (s.stepLength + 5) * 1000, start = performance.now();
      let hold = null, left = false;
      while (performance.now() - start < limit) {
        hold = holds.find((h) => h.i === i) || null;
        if (hold) break;
        if (s.stepIndex > i || (s.stepIndex < 0 && !s.playing)) { left = true; break; }
        await sleep(25);
      }
      const step = { index: i, id, held: !!hold, playsOn: !hold && left, waited: (performance.now() - start) / 1000 };
      if (hold) {
        step.time = hold.t;
        step.waits = !hold.can;
        if (px) {
          try { step.png = await png(await px.still(hold.t)); } catch (e) { skip(e); px = null; }
        }
      }
      // Lines that arrive a moment after the hold still belong to the step.
      await sleep(100);
      step.lines = log.lines.slice(mark).map((l) => l.text);
      step.ok = (step.held || step.playsOn) && !log.lines.slice(mark).some((l) => l.kind !== 'note');
      steps.push(step);
    }
  } finally {
    if (typeof off === 'function') off();
  }
  return { ok: steps.every((x) => x.ok), steps };
}
