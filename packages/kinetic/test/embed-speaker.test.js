/**
 * An embedded piece with sound (option (a) for the embed's sound control):
 * under ?embed, Kinetic's speaker over the stage's corner stays shown while
 * everything else beside the root is hidden, so the viewer can turn the
 * sound on; it used to be hidden with the rest, and the first-gesture unlock
 * stood aside for it, so an embed had no way to sound. In a render's capture
 * there is no speaker at all, and the speaker is never in what render()
 * draws, since it sits beside the root.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, tick, wavUrl, tone, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });
const abs = (u) => new URL(u, location.href).href;
const until = async (fn, ms = 3000) => { for (let i = 0; i < ms / 20 && !fn(); i++) await tick(20); return fn(); };

async function soundPage({ embed = true, capture = false } = {}) {
  await load();
  const markup = '<script>'
    + (capture ? 'window.__HF_RENDER_CAPTURE_MODE = true;' : '')
    + 'window.__resumes = 0; const R = window.AudioContext; window.AudioContext = class extends R { resume() { window.__resumes++; return super.resume(); } };'
    + '<\/script><p id="caption">beside</p>'
    + '<div id="stage" data-composition-id="snd" data-no-timeline data-start="0" data-duration="2" data-fps="30" data-width="320" data-height="180"><audio data-start="0" src="' + wavUrl(tone(330, 1)) + '"></audio></div>'
    + '<script src="' + abs(CORE) + '"><\/script><script src="' + abs(WF_FILE) + '"><\/script>'
    + '<script>wildflower.kinetic.config({ autoplay: false });<\/script>';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px;border:0';
  const loaded = new Promise((r) => { frame.onload = r; });
  // fixtures/page-shell.html: a page on this origin, its markup in the hash.
  frame.src = '/packages/kinetic/test/fixtures/page-shell.html' + (embed ? '?embed' : '') + '#' + encodeURIComponent(markup);
  document.body.appendChild(frame);
  cleanup.push(frame);
  await loaded;
  const w = frame.contentWindow;
  await w.wildflower.kinetic.ready();
  await until(() => w.document.querySelector('[data-kinetic-speaker]'), 1500);
  return { w, doc: w.document, k: w.wildflower.kinetic, speaker: () => w.document.querySelector('[data-kinetic-speaker]') };
}

describe(`the speaker under ?embed (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('stays shown beside the root while the rest is hidden, and pressing it resumes the sound', async () => {
    const { w, doc, speaker } = await soundPage();
    expect(w.getComputedStyle(doc.getElementById('caption')).display).toBe('none');
    const sp = speaker();
    expect(sp).toBeTruthy();
    expect(w.getComputedStyle(sp).display).not.toBe('none');
    const before = w.__resumes;
    sp.click();
    await tick(50);
    expect(w.__resumes).toBeGreaterThan(before);
    expect(sp.getAttribute('aria-pressed') === 'true' || w.__resumes > before).toBe(true);
  });

  it('is not in what render() draws', async () => {
    const { w, k, speaker } = await soundPage();
    if (typeof w.VideoEncoder !== 'function') return;
    const handed = [];
    w.CanvasRenderingContext2D.prototype.drawElementImage = function (el) { handed.push(!!el.querySelector('[data-kinetic-speaker]')); };
    expect(speaker()).toBeTruthy();
    await k.render({ download: false, to: 0.1, audio: false });
    expect(handed.length).toBeGreaterThan(0);
    expect(handed.filter(Boolean)).toEqual([]);
  });

  it('is absent in a render\'s capture', async () => {
    const { speaker } = await soundPage({ embed: false, capture: true });
    expect(speaker()).toBeNull();
  });
});
