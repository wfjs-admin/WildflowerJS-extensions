/**
 * A page with a sound button of its own (the homepage's beat square): it
 * starts with config({ sound: false }), and its button's click calls
 * config({ sound: true }). That click is the viewer's gesture, so one press
 * starts the sound, and Kinetic's speaker shows it on rather than turning it
 * off again. A file of its own, so the page has had no gesture and made no
 * audio context before the press.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { userEvent } from 'vitest/browser';
import { load, mount, tick, tone, wavUrl, BUILD, CORE_TIER } from './helpers.js';

const made = [];
const RealContext = window.AudioContext;
window.AudioContext = class extends RealContext { constructor(...a) { super(...a); made.push(this); } };

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const until = async (fn, ms = 3000) => { for (let i = 0; i < ms / 20 && !fn(); i++) await tick(20); return fn(); };

describe(`a page's own sound button (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('calling config({ sound: true }) from its click starts the sound with one press', async () => {
    const { wf } = await load();
    wf.kinetic.config({ sound: false });
    const host = await mount(`<div data-composition-id="ob1" data-start="0" data-duration="2" style="width:320px;height:180px"><audio src="${wavUrl(tone(330, 1))}" data-start="0"></audio></div><button type="button" id="ob1-sound">Play with sound</button>`);
    cleanup.push(host);
    try {
      await wf.kinetic.ready();
      expect(made.length, 'no audio context while the sound is off').toBe(0);
      host.querySelector('#ob1-sound').addEventListener('click', () => wf.kinetic.config({ sound: true }));
      await userEvent.click(host.querySelector('#ob1-sound'));
      expect(made.length).toBe(1);
      expect(await until(() => made[0].state === 'running'), 'the context runs after one press').toBe(true);
      const speaker = await until(() => document.querySelector('[data-kinetic-speaker]'));
      expect(speaker && speaker.getAttribute('aria-pressed'), 'the speaker shows the sound on').toBe('true');
      await tick(300);
      expect(made[0].state, 'and it stays on').toBe('running');
    } finally {
      wf.kinetic.config({ sound: true });
    }
  });
});
