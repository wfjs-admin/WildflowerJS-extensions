/**
 * Without the preview bar, a page with sound gets a speaker button over the
 * stage's lower right corner, outside the composition root. The sound stays
 * off until the speaker is pressed: a click elsewhere on the page leaves it
 * off, and a click on the speaker turns it on and off, never pausing. The
 * speaker shows for 2 s once it is made, then fades. A file of its own, so
 * no click from another test has happened on this page. A click in a test
 * file that ran before, in the same browser, can let the browser start the
 * context running; the speaker turns it off as it is made.
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

describe(`sound without the bar (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a speaker over the stage\'s corner, outside the root, turns the sound on and off; a click elsewhere leaves it off; it shows for 2 s, and left alone it fades, also after a click on it', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="ag1" data-start="0" data-duration="2" style="width:320px;height:180px"><audio src="${wavUrl(tone(330, 1))}" data-start="0"></audio></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    expect(document.querySelector('[data-kinetic-preview]')).toBeNull();
    expect(made.length).toBe(1);
    const root = host.querySelector('[data-composition-id]');
    expect(await until(() => document.querySelector('[data-kinetic-speaker]'))).toBeTruthy();
    const speaker = document.querySelector('[data-kinetic-speaker]');
    // Beside the root, not in it, over its lower right corner.
    expect(root.contains(speaker)).toBe(false);
    const r = root.getBoundingClientRect(), s = speaker.getBoundingClientRect();
    expect(s.right).toBeLessThanOrEqual(r.right);
    expect(s.bottom).toBeLessThanOrEqual(r.bottom);
    expect(s.right).toBeGreaterThan(r.right - 40);
    expect(await until(() => made[0].state === 'suspended')).toBe(true);
    expect(speaker.getAttribute('aria-pressed')).toBe('false');
    expect(speaker.style.opacity).toBe('1');
    // A click on the page leaves the sound off.
    await userEvent.click(document.body);
    await tick(100);
    expect(made[0].state).toBe('suspended');
    // The speaker turns it on, and off again, and the clock's playing is left alone.
    const playing = wf.getStore('kinetic').playing;
    await userEvent.click(speaker);
    expect(await until(() => made[0].state === 'running' && speaker.getAttribute('aria-pressed') === 'true')).toBe(true);
    expect(wf.getStore('kinetic').playing).toBe(playing);
    await userEvent.click(speaker);
    expect(await until(() => made[0].state === 'suspended' && speaker.getAttribute('aria-pressed') === 'false')).toBe(true);
    // Left alone it fades, though the click left the focus on it: a page may run unattended.
    expect(document.activeElement).toBe(speaker);
    expect(await until(() => speaker.style.opacity === '0', 4000)).toBe(true);
    expect(speaker.style.pointerEvents).toBe('none');
  });

  it('the speaker follows the root into the fit\'s wrapper, over the stage\'s corner, with the sound as the viewer left it', async () => {
    const { wf } = await load();
    const host = await mount(`<div style="height:200px"></div><div data-composition-id="ag2" data-start="0" data-duration="2" data-width="320" data-height="180" style="width:320px;height:180px"><audio src="${wavUrl(tone(330, 1))}" data-start="0"></audio></div>`);
    cleanup.push(host);
    await wf.kinetic.ready();
    const root = host.querySelector('[data-composition-id]');
    expect(await until(() => document.querySelector('[data-kinetic-speaker]'))).toBeTruthy();
    const speaker = document.querySelector('[data-kinetic-speaker]');
    await userEvent.click(speaker);
    expect(await until(() => speaker.getAttribute('aria-pressed') === 'true')).toBe(true);
    wf.kinetic.config({ fit: true });
    try {
      expect(root.parentElement.className).toBe('kinetic-fit');
      await tick(50);
      const r0 = root.getBoundingClientRect();
      root.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r0.left + 10, clientY: r0.top + 10, pointerType: 'mouse' }));
      const s = document.querySelector('[data-kinetic-speaker]'), r = root.getBoundingClientRect(), b = s.getBoundingClientRect();
      expect(s.parentElement).toBe(root.parentElement);
      expect(b.right).toBeLessThanOrEqual(r.right + 0.5);
      expect(b.bottom).toBeLessThanOrEqual(r.bottom + 0.5);
      expect(b.right).toBeGreaterThan(r.right - 40);
      expect(b.bottom).toBeGreaterThan(r.bottom - 40);
      expect(s.getAttribute('aria-pressed')).toBe('true');
    } finally {
      wf.kinetic.config({ fit: false });
    }
  });
});
