/**
 * render() with footage, in the installed Chrome with HTML-in-Canvas
 * (vitest.render.config.js), from the MP4 fixture (H.264 and AAC) and the
 * WebM ones. Each rendered frame is read back from the file: the fixture's
 * stripes give the source frame, and the red behind the clips shows where a
 * clip is hidden. The sound is read with Chrome's own decode of the file,
 * and each beep found by its middle.
 *
 * Arrivals: in the page at load (a page of its own in a frame), added after
 * load and then ready(), a src changed and then ready(). The attributes: no
 * data-duration, data-media-start, data-playback-rate 2 and 0.5,
 * data-has-audio (also at rate 2), a window in the middle, and past the end
 * of the file. A file that fails rejects with KN-138, a video with no sound
 * track and data-has-audio with KN-135. Also an <audio> clip at rate 2,
 * whose beeps come at half the spacing. With the shutter: 30 fps footage
 * exact and unblurred at 180 degrees, and 60 fps footage one source frame
 * per frame at 180 degrees and two blended at 360.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, wavUrl, FOOTAGE, shownFrame, footageFrame, framedPage, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const ROOT = 'data-start="0" data-width="160" data-height="90" data-fps="30" style="position:relative;width:160px;height:90px;background:#ff0000"';
const BOX = 'style="position:absolute;left:0;top:0;width:160px;height:90px"';
const video = (id, src, attrs = '', muted = true) => `<video id="${id}" src="${FOOTAGE + src}" ${attrs}${muted ? ' muted' : ''} playsinline ${BOX}></video>`;

async function stage(id, duration, clips) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-duration="${duration}" ${ROOT}>${clips}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  await wf.kinetic.ready();
  return { wf, host, k: wf.kinetic };
}

const render = (k, o = {}) => k.render(Object.assign({ download: false, bitrate: 2e6 }, o));

// Every frame of a rendered file, read from the middle of each frame, by
// shownFrame() or by `read`.
async function framesOf(blob, n, fps = 30, read = shownFrame) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  document.body.appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('the render did not load: ' + (v.error && v.error.message))); });
    const out = [];
    for (let i = 0; i < n; i++) {
      v.currentTime = (i + 0.5) / fps;
      await new Promise((res) => { v.onseeked = () => res(); });
      out.push(read(v));
    }
    return out;
  } finally { v.remove(); URL.revokeObjectURL(url); }
}

// The ten stripes of a frame as values 0 to 255, read where shownFrame()
// reads them.
function stripes(el) {
  const c = document.createElement('canvas');
  c.width = 10; c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(el, 0, 0, 10, 1);
  const d = ctx.getImageData(0, 0, 10, 1).data;
  return Array.from({ length: 10 }, (_, i) => d[i * 4]);
}

// The frames that differ from `want(i)`, as 'i: got for want'.
const wrongFrames = (got, want) => got.map((g, i) => [i, g, want(i)]).filter(([, g, w]) => g !== w).map(([i, g, w]) => i + ': ' + g + ' for ' + w);

// The middle of each beep in the file's sound, in seconds: a run of samples
// above 0.1 in channel 0, ended by 10 ms below it.
async function beepsOf(blob) {
  const b = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await blob.arrayBuffer());
  const d = b.getChannelData(0), out = [];
  for (let i = 0; i < d.length; i++) {
    if (Math.abs(d[i]) <= 0.1) continue;
    let last = i, j = i;
    for (; j < d.length && j - last < 480; j++) if (Math.abs(d[j]) > 0.1) last = j;
    out.push((i + last) / 2 / 48000);
    i = j;
  }
  return out;
}
const near = (got, want, tol = 0.003) => got.length === want.length && got.every((g, i) => Math.abs(g - want[i]) <= tol);

describe(`render() with footage (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('in the page at load: every frame exact, 30 fps then 24 fps footage, and its sound in the file', async () => {
    const page = await framedPage(`<div data-composition-id="rl" data-duration="2" ${ROOT}>`
      + video('a', 'f30.mp4', 'data-start="0" data-duration="1" data-has-audio="true"', false)
      + video('b', 'f24.webm', 'data-start="1" data-duration="1"') + '</div>', cleanup);
    expect(page.result).toBe('resolved');
    const r = await render(page.kinetic);
    expect(r.frames).toBe(60);
    expect(r.audioCodec).toBe('mp4a.40.2');
    const got = await framesOf(r.blob, 60);
    expect(wrongFrames(got, (i) => (i < 30 ? i : footageFrame(i / 30, { start: 1, fps: 24 })))).toEqual([]);
    // a's beep at 0 s; its beep at 1 s is past its window.
    const beeps = await beepsOf(r.blob);
    expect(near(beeps, [0.005]), beeps.join(', ')).toBe(true);
  });

  it('added after load, then ready(): every frame exact', async () => {
    const { k } = await stage('ra', 1, video('v', 'f30.mp4', 'data-start="0"'));
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 30), (i) => i)).toEqual([]);
  });

  it("src changed after load, then ready(): every frame exact, from the new file", async () => {
    const { host, k } = await stage('rs', 1, video('v', 'f30.mp4', 'data-start="0"'));
    host.querySelector('#v').src = FOOTAGE + 'f24.webm';
    await k.ready();
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 30), (i) => footageFrame(i / 30, { fps: 24 }))).toEqual([]);
  });

  it("without data-duration: every frame exact, and the clip ends where the file does", async () => {
    // 2.5 s into a file of 4 s, so the window is [0, 1.5).
    const { k } = await stage('rd', 2, video('v', 'f30.mp4', 'data-start="0" data-media-start="2.5"'));
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 60), (i) => (i < 45 ? 75 + i : 'bg'))).toEqual([]);
  });

  it('data-media-start: every frame trimmed', async () => {
    const { k } = await stage('rm', 1, video('v', 'f30.mp4', 'data-start="0" data-duration="1" data-media-start="1.5"'));
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 30), (i) => 45 + i)).toEqual([]);
  });

  it('data-playback-rate 2 and 0.5: every frame exact at the rate', async () => {
    const { k } = await stage('rr', 2, video('fast', 'f30.mp4', 'data-start="0" data-duration="1" data-playback-rate="2"')
      + video('slow', 'f30.mp4', 'data-start="1" data-duration="1" data-playback-rate="0.5"'));
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 60), (i) => (i < 30 ? 2 * i : Math.floor((i - 30) / 2)))).toEqual([]);
  });

  it('data-remap: double speed, a hold, then single speed, every frame exact; a clip with no length ends at the remap\'s last key', async () => {
    // The ramp: file 0 to 2 s over the first second, held at 2 s for the
    // second, then 2 to 3 s over the third. The cut: from 0.5 s, the first
    // 2 s of the file over 1 s, and no data-duration, so the clip ends at 1.5 s.
    const { k, host } = await stage('rm', 3, video('ramp', 'f30.mp4', 'data-start="0" data-duration="3" data-remap=\'{"at":[0,1,2,3],"to":[0,2,2,3]}\''));
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 90), (i) => (i < 30 ? 2 * i : i < 60 ? 60 : i))).toEqual([]);
    // The page's first composition root is the one rendered: take this one off.
    host.remove();
    const { k: k2 } = await stage('rm2', 2, video('cut', 'f30.mp4', 'data-start="0.5" data-remap=\'{"at":[0,1],"to":[0,2]}\''));
    const r2 = await render(k2);
    expect(wrongFrames(await framesOf(r2.blob, 60), (i) => (i < 15 || i >= 45 ? 'bg' : 2 * (i - 15)))).toEqual([]);
  });

  it('data-remap with ease smooth: each frame is the source frame 1 ms after the time interpolate() gives', async () => {
    const { k } = await stage('rms', 2, video('ramp', 'f30.mp4', 'data-start="0" data-duration="2" data-remap=\'{"at":[0,1,2],"to":[0,1,3],"ease":"smooth"}\''));
    const r = await render(k);
    const want = (i) => Math.min(119, Math.floor((k.interpolate(i / 30, [0, 1, 2], [0, 1, 3], { ease: 'smooth' }) + 0.001002) * 30 + 1e-9));
    expect(wrongFrames(await framesOf(r.blob, 60), want)).toEqual([]);
    // Through the keys without a stop: the frame advances at 1 s.
    expect(want(31)).toBeGreaterThan(want(29));
  });

  it('data-has-audio with data-remap: the beeps come at the remapped times, and none through the hold', async () => {
    // 1.5x for a second (file 0 to 1.5 s), a hold at 1.5 s for a second, then
    // 1x: the file's beeps at 0, 1 and 2 s play at 0, 0.667 and 2.5 s.
    const { k } = await stage('rmh', 3, video('v', 'f30.mp4', 'data-start="0" data-duration="3" data-has-audio="true" data-remap=\'{"at":[0,1,2,3],"to":[0,1.5,1.5,2.5]}\'', false));
    const r = await render(k);
    const beeps = await beepsOf(r.blob);
    expect(near(beeps, [0.0025, 0.6692, 2.5025], 0.006), beeps.join(', ')).toBe(true);
    expect(wrongFrames(await framesOf(r.blob, 90), (i) => (i < 30 ? Math.floor(1.5 * i) : i < 60 ? 45 : i - 15))).toEqual([]);
  });

  it("data-has-audio: the sound is in the file at the beep's time", async () => {
    // From 0.5 s, 0.2 s into the file: the beeps at 1 s and 2 s in the file
    // play at 1.3 s and 2.3 s.
    const { k } = await stage('rh', 3, video('v', 'f30.mp4', 'data-start="0.5" data-duration="2.5" data-media-start="0.2" data-has-audio="true"', false));
    const r = await render(k);
    const beeps = await beepsOf(r.blob);
    expect(near(beeps, [1.305, 2.305]), beeps.join(', ')).toBe(true);
  });

  it('data-has-audio with rate 2: the beeps come at half the spacing', async () => {
    const { k } = await stage('rh2', 2, video('v', 'f30.mp4', 'data-start="0" data-duration="2" data-has-audio="true" data-playback-rate="2"', false));
    const r = await render(k);
    const beeps = await beepsOf(r.blob);
    expect(near(beeps, [0.0025, 0.5025, 1.0025, 1.5025]), beeps.join(', ')).toBe(true);
    expect(wrongFrames(await framesOf(r.blob, 60), (i) => Math.min(119, 2 * i))).toEqual([]);
  });

  it('an <audio> clip at data-playback-rate 2: its beeps come at half the spacing in the mix', async () => {
    // A beep of 10 ms at every whole second of a 4 s file.
    const beeping = new Float32Array(4 * 48000);
    for (let k = 0; k < 4; k++) for (let i = 0; i < 480; i++) beeping[k * 48000 + i] = 0.5 * Math.sin(2 * Math.PI * 1000 * i / 48000);
    const { k } = await stage('ra2', 2, `<audio id="music" src="${wavUrl(beeping)}" data-start="0" data-playback-rate="2"></audio>`);
    const r = await render(k);
    const beeps = await beepsOf(r.blob);
    expect(near(beeps, [0.0025, 0.5025, 1.0025, 1.5025]), beeps.join(', ')).toBe(true);
  });

  it('a window in the middle: hidden before and after, exact from the frame it enters on', async () => {
    const { k } = await stage('rw', 2, video('v', 'f30.mp4', 'data-start="1" data-duration="0.5"'));
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 60), (i) => (i >= 30 && i < 45 ? i - 30 : 'bg'))).toEqual([]);
  });

  it('29.97 fps footage: each frame is the source frame on screen 1 ms after the composition frame\'s time', async () => {
    const { k } = await stage('r2997', 2, video('v', 'f2997.mp4', 'data-start="0"'));
    const r = await render(k);
    // Source frame n starts at n * 1001 / 30000 s.
    expect(wrongFrames(await framesOf(r.blob, 60), (i) => Math.floor((i / 30 + 0.001) * 30000 / 1001 + 1e-9))).toEqual([]);
  });

  it('with a 180-degree shutter, 30 fps footage in a 30 fps composition is the exact source frame in every frame, unblurred', async () => {
    const { wf, k } = await stage('rsh30', 1, video('v', 'f30.mp4', 'data-start="0"'));
    // The positive control: the store says a shutter render ran.
    const during = new Set();
    const r = await render(k, { shutter: 180, onProgress: () => during.add(wf.getStore('kinetic').shutter) });
    expect([...during]).toEqual([180]);
    expect(wrongFrames(await framesOf(r.blob, 30), (i) => i)).toEqual([]);
  });

  it('60 fps footage: at 180 degrees every sample falls in source frame 2i, and at 360 degrees the frame blends 2i and 2i + 1', async () => {
    const { k } = await stage('rsh60', 0.5, video('v', 'f60.mp4', 'data-start="0"'));
    // The last of eight samples at 180 degrees is t + 14.6 ms, 15.6 ms with the
    // 1 ms nudge, short of 2i + 1 at 16.7 ms.
    const half = await render(k, { shutter: 180 });
    expect(wrongFrames(await framesOf(half.blob, 15), (i) => 2 * i)).toEqual([]);
    // At 360 degrees samples 4 to 7 fall in 2i + 1. 2i and 2i + 1 differ in
    // stripe 0 alone, which comes out half lit, and the other stripes read 2i.
    const whole = await render(k, { shutter: 360 });
    const got = await framesOf(whole.blob, 15, 30, stripes);
    const wrong = got.map((s, i) => {
      let n = 0;
      for (let b = 1; b < 10; b++) if (s[b] > 128) n |= 1 << b;
      const firm = s.slice(1).every((v) => v < 64 || v > 192);
      return n === 2 * i && firm && s[0] > 64 && s[0] < 192 ? null : i + ': ' + s.join(',');
    }).filter(Boolean);
    expect(wrong).toEqual([]);
  });

  it('preload="none" footage is loaded for the render, which does not wait forever on it', async () => {
    const { wf } = await load();
    const host = await mount(`<div data-composition-id="rpn" data-duration="1" ${ROOT}>${video('v', 'f30.mp4', 'data-start="0" preload="none"')}</div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const r = await Promise.race([render(wf.kinetic), tick(15000).then(() => 'timed out')]);
    expect(r === 'timed out' ? r : 'rendered').toBe('rendered');
    expect(wrongFrames(await framesOf(r.blob, 30), (i) => i)).toEqual([]);
  });

  it('past the end of the file, the last frame holds', async () => {
    const { k } = await stage('re', 2, video('v', 'f30.mp4', 'data-start="0" data-duration="2" data-media-start="3"'));
    const r = await render(k);
    expect(wrongFrames(await framesOf(r.blob, 60), (i) => Math.min(119, 90 + i))).toEqual([]);
  });

  it('a file that fails: render() rejects with KN-138 before the page is touched', async () => {
    const page = await framedPage(`<div data-composition-id="rf" data-duration="1" ${ROOT}>${video('gone', 'no-such-file.mp4', 'data-start="0"')}</div>`, cleanup);
    const err = await page.kinetic.render({ download: false }).catch((e) => e);
    expectKN(err, 'KN-138', /the footage clip video#gone \(\S*no-such-file\.mp4\)/, /HTTP 404/);
    expect(page.doc.querySelector('[data-kinetic-render]')).toBeNull();
  });

  it('a video with no sound track and data-has-audio: render() rejects with KN-135', async () => {
    const page = await framedPage(`<div data-composition-id="rn" data-duration="1" ${ROOT}>${video('mute', 'f30-silent.webm', 'data-start="0" data-has-audio="true"', false)}</div>`, cleanup);
    const err = await page.kinetic.render({ download: false }).catch((e) => e);
    expectKN(err, 'KN-135', /the footage clip video#mute \(\S*f30-silent\.webm\)/, /^has no sound track/);
    await tick(0);
  });
});
