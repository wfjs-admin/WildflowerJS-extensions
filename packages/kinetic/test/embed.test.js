/**
 * The embed API (embed.js): a page with `embed` in its URL, inside a frame,
 * takes play, pause and seek from its parent by postMessage, answers a
 * state request, posts its time after every seek and a ready message once
 * readiness has settled, refuses a seek with no number, and does none of
 * it without `embed` in the URL.
 *
 * A srcdoc page cannot carry a search, so the pages are data: URLs, which
 * also puts them on another origin, as a host page would be.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, CORE, WF_FILE } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const MARKUP = '<div id="stage" data-composition-id="emb" data-start="0" data-duration="2" data-fps="10" data-width="320" data-height="180" style="position:relative;width:320px;height:180px;background:#123">'
  + '<div data-component="emb-card" data-start="0" data-duration="2"><b data-bind="label">x</b></div></div>';
const SCENE = 'wildflower.kinetic.config({ autoplay: false });'
  + 'wildflower.kinetic.scene("emb-card", { computed: { label() { return this.local.toFixed(1); } } });';

// A page at a data: URL with `search`, in a frame. Returns the frame and a
// reader of the kinetic: messages it posts.
// `extra` is more script for the page; with `late` the root is added at
// DOMContentLoaded, after the embed has looked for it, and before load.
async function page(search, failing = false, { extra = '', late = false } = {}) {
  await load();
  const markup = failing
    ? MARKUP.replace('data-component="emb-card"', 'data-component="emb-card" data-needs="1"')
    : MARKUP;
  const scene = failing
    ? 'wildflower.kinetic.config({ autoplay: false }); wildflower.kinetic.scene("emb-card", { inputs: { price: { type: Number, required: true } }, computed: { label() { return "x"; } } });'
    : SCENE;
  const add = late ? 'document.addEventListener("DOMContentLoaded", () => document.body.insertAdjacentHTML("afterbegin", ' + JSON.stringify(markup) + '));' : '';
  const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + (late ? '' : markup)
    + '<script src="' + location.origin + CORE + '"><\/script><script src="' + location.origin + WF_FILE + '"><\/script>'
    + '<script>' + scene + add + extra + '<\/script></body></html>';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0;opacity:0;pointer-events:none';
  const received = [];
  const listener = (e) => { if (e.source === frame.contentWindow && e.data && typeof e.data.type === 'string' && e.data.type.startsWith('kinetic:')) received.push(e.data); };
  addEventListener('message', listener);
  cleanup.push({ remove() { removeEventListener('message', listener); frame.remove(); } });
  frame.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(html) + search;
  document.body.appendChild(frame);
  const send = (msg) => frame.contentWindow.postMessage(msg, '*');
  // The next message of a type, or null after `ms`.
  const next = async (type, ms = 2000) => {
    const from = received.length;
    for (let i = 0; i < ms / 10; i++) {
      const found = received.slice(from).find((m) => m.type === type);
      if (found) return found;
      await tick(10);
    }
    return null;
  };
  return { frame, received, send, next };
}

describe('the embed API', () => {
  it('posts ready once readiness has settled, with the composition\'s shape', async () => {
    const { next } = await page('?embed');
    const ready = await next('kinetic:ready', 5000);
    expect(ready).toBeTruthy();
    expect(ready).toMatchObject({ ready: 'true', duration: 2, fps: 10, width: 320, height: 180 });
  });

  it('seeks, plays, pauses and answers a state request, posting the time after each', async () => {
    const { send, next, received } = await page('?embed');
    expect(await next('kinetic:ready', 5000)).toBeTruthy();

    send({ type: 'kinetic:seek', time: 1 });
    const seeked = await next('kinetic:time');
    expect(seeked).toMatchObject({ time: 1, frame: 10, playing: false, duration: 2, fps: 10 });

    send({ type: 'kinetic:play' });
    const playing = await next('kinetic:time');
    expect(playing.playing).toBe(true);
    // Later seeks arrive while it plays, and the time moves on.
    await tick(300);
    const later = received.filter((m) => m.type === 'kinetic:time');
    expect(later.length).toBeGreaterThan(3);
    expect(later[later.length - 1].time).not.toBe(1);

    // Frames in flight arrive before the pause is taken; the one after it says
    // so. Every message since the pause is scanned, since under load they come
    // in bursts and the paused one can land in the same burst as a playing one.
    const sincePause = received.length;
    send({ type: 'kinetic:pause' });
    let paused = null;
    for (let i = 0; i < 200 && !paused; i++) {
      paused = received.slice(sincePause).find((m) => m.type === 'kinetic:time' && m.playing === false) || null;
      if (!paused) await tick(10);
    }
    expect(paused && paused.playing).toBe(false);
    await tick(50);
    const count = received.length;
    await tick(150);
    expect(received.length, 'nothing is posted while paused').toBe(count);

    send({ type: 'kinetic:state' });
    const state = await next('kinetic:time');
    expect(state).toMatchObject({ playing: false, duration: 2, fps: 10 });
    expect(state.time).toBe(paused.time);
  });

  it('plays a range with from and to, holding the last frame before to', async () => {
    const { send, next } = await page('?embed');
    expect(await next('kinetic:ready', 5000)).toBeTruthy();
    send({ type: 'kinetic:play', from: 0.5, to: 0.8 });
    const started = await next('kinetic:time');
    expect(started.playing).toBe(true);
    expect(started.time).toBeGreaterThanOrEqual(0.5);
    for (let i = 0; i < 100; i++) {
      const m = await next('kinetic:time', 500);
      if (!m || !m.playing) break;
    }
    send({ type: 'kinetic:state' });
    const held = await next('kinetic:time');
    expect(held.playing).toBe(false);
    expect(held.time).toBeCloseTo(0.7, 5);
  });

  it('answers a seek with no number, and an unknown or foreign message, without changing the clock', async () => {
    const { send, next, received } = await page('?embed');
    expect(await next('kinetic:ready', 5000)).toBeTruthy();
    send({ type: 'kinetic:seek', time: 'later' });
    const err = await next('kinetic:error');
    expect(err.message).toMatch(/^\[KN-100\] seek\(time\)/);
    send({ type: 'kinetic:dance' });
    send({ type: 'other', time: 1 });
    send('kinetic:seek');
    await tick(150);
    expect(received.filter((m) => m.type === 'kinetic:time')).toEqual([]);
    send({ type: 'kinetic:state' });
    expect((await next('kinetic:time')).time).toBe(0);
  });

  it('posts ready as failed when readiness failed, and still answers', async () => {
    const { send, next } = await page('?embed', true);
    const ready = await next('kinetic:ready', 5000);
    expect(ready).toBeTruthy();
    expect(ready.ready).toBe('failed');
    send({ type: 'kinetic:state' });
    expect(await next('kinetic:time')).toBeTruthy();
  });

  it('tells the host when a click in the frame pauses and plays', async () => {
    // The test asks the page to click its stage, which a host cannot do.
    const extra = 'addEventListener("message", (e) => { if (e.data === "test:click") document.querySelector("#stage b").click(); });';
    const { send, next, received } = await page('?embed', false, { extra });
    expect(await next('kinetic:ready', 5000)).toBeTruthy();
    send({ type: 'kinetic:play' });
    expect((await next('kinetic:time')).playing).toBe(true);
    // Every time message since `from`, until one shows `playing`.
    const posted = async (from, playing) => {
      for (let i = 0; i < 300; i++) {
        if (received.slice(from).some((m) => m.type === 'kinetic:time' && m.playing === playing)) return true;
        await tick(10);
      }
      return false;
    };
    let from = received.length;
    send('test:click');
    expect(await posted(from, false), 'a click pause is posted').toBe(true);
    from = received.length;
    send('test:click');
    expect(await posted(from, true), 'a click play is posted').toBe(true);
    send({ type: 'kinetic:pause' });
  });

  it('posts ready when the root is added after the page has loaded', async () => {
    const { next } = await page('?embed', false, { late: true });
    const ready = await next('kinetic:ready', 5000);
    expect(ready).toBeTruthy();
    expect(ready).toMatchObject({ ready: 'true', duration: 2, fps: 10 });
  });

  it('does nothing without embed in the URL', async () => {
    const { send, next, received } = await page('');
    // Give the page time to load and settle.
    await tick(1500);
    expect(received).toEqual([]);
    send({ type: 'kinetic:state' });
    expect(await next('kinetic:time', 300)).toBeNull();
  });
});
