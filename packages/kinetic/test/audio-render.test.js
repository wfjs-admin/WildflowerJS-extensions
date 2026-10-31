/**
 * render() with sound, end to end, from a canvas source so it runs in any
 * Chrome with WebCodecs: a click at 1.0 s in an <audio> clip and a flash on
 * frame 30. The test reads the file with its own box reader, decodes the
 * audio track with AudioDecoder, applies the edit list, and finds the click
 * within 1 ms of where the composition puts it. The priming in the edit list
 * is the priming the decoded track shows. Also: Opus, render({ audio: false }),
 * a composition with no audio clip, the option errors, and the fallback to
 * Opus when the browser has no AAC encoder (KN-202).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, captureWarnings, wavUrl, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const restores = [];
afterEach(async () => {
  for (const f of restores.splice(0)) f();
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

const hasAudio = typeof AudioEncoder === 'function' && typeof AudioDecoder === 'function';

// ---- reading the file ------------------------------------------------------------

const dec = new TextDecoder();
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
function boxes(b, start, end) {
  const out = [];
  for (let o = start; o < end;) {
    let size = u32(b, o), body = o + 8;
    if (size === 1) { size = u32(b, o + 8) * 4294967296 + u32(b, o + 12); body = o + 16; }
    out.push({ type: dec.decode(b.subarray(o + 4, o + 8)), start: o, size, body });
    o += size;
  }
  return out;
}
const child = (b, box, type) => boxes(b, box.body, box.start + box.size).find((x) => x.type === type);
const walk = (b, box, ...types) => types.reduce((cur, t) => cur && child(b, cur, t), box);
function descriptor(b, o) {
  const tag = b[o];
  let size = 0, p = o + 1;
  for (;;) { const c = b[p++]; size = (size << 7) | (c & 0x7f); if (!(c & 0x80)) break; }
  return { tag, body: p, end: p + size };
}

// The file's tracks: for the sound track its codec, its codec description,
// the edit list's media time, and every sample's bytes and duration.
async function demux(blob) {
  const b = new Uint8Array(await blob.arrayBuffer());
  const top = boxes(b, 0, b.length);
  const moov = top.find((x) => x.type === 'moov');
  const traks = boxes(b, moov.body, moov.start + moov.size).filter((x) => x.type === 'trak');
  const kinds = traks.map((t) => dec.decode(b.subarray(walk(b, t, 'mdia', 'hdlr').body + 8, walk(b, t, 'mdia', 'hdlr').body + 12)));
  const out = { kinds };
  const t = traks[kinds.indexOf('soun')];
  if (!t) return out;
  const stbl = walk(b, t, 'mdia', 'minf', 'stbl');
  const stsd = child(b, stbl, 'stsd');
  const entry = boxes(b, stsd.body + 8, stsd.start + stsd.size)[0];
  out.codec = entry.type;
  const config = boxes(b, entry.body + 28, entry.start + entry.size)[0];
  if (config.type === 'esds') {
    const es = descriptor(b, config.body + 4), dcd = descriptor(b, es.body + 3), dsi = descriptor(b, dcd.body + 13);
    out.description = b.slice(dsi.body, dsi.end);
  } else {
    out.dOps = Array.from(b.subarray(config.body, config.start + config.size));
  }
  const elst = child(b, child(b, t, 'edts'), 'elst');
  const v1 = b[elst.body] === 1;
  out.mediaTime = v1 ? u32(b, elst.body + 8 + 12) : u32(b, elst.body + 8 + 4);
  out.segment = v1 ? u32(b, elst.body + 8 + 4) : u32(b, elst.body + 8);
  const stsz = child(b, stbl, 'stsz'), stts = child(b, stbl, 'stts');
  const co = child(b, stbl, 'stco') || child(b, stbl, 'co64');
  const count = u32(b, stsz.body + 8);
  const durations = [];
  for (let i = 0, n = u32(b, stts.body + 4); i < n; i++) for (let k = 0; k < u32(b, stts.body + 8 + 8 * i); k++) durations.push(u32(b, stts.body + 12 + 8 * i));
  let at = co.type === 'co64' ? u32(b, co.body + 12) : u32(b, co.body + 8);
  out.samples = [];
  for (let i = 0; i < count; i++) {
    const size = u32(b, stsz.body + 12 + 4 * i);
    out.samples.push({ bytes: b.slice(at, at + size), duration: durations[i] });
    at += size;
  }
  return out;
}

// Channel 0 of the sound track, decoded from its first sample, with no edit
// list applied.
async function decodeTrack(track) {
  const parts = [];
  const decoder = new AudioDecoder({
    output(a) { const f = new Float32Array(a.numberOfFrames); a.copyTo(f, { planeIndex: 0, format: 'f32-planar' }); parts.push(f); a.close(); },
    error(e) { throw e; },
  });
  decoder.configure(Object.assign({ codec: track.codec === 'mp4a' ? 'mp4a.40.2' : 'opus', sampleRate: 48000, numberOfChannels: 2 }, track.description ? { description: track.description } : {}));
  let ts = 0;
  for (const s of track.samples) {
    decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(ts * 1e6 / 48000), duration: Math.round(s.duration * 1e6 / 48000), data: s.bytes }));
    ts += s.duration;
  }
  await decoder.flush();
  decoder.close();
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}
const peakAt = (d) => { let at = 0, m = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > m) { m = Math.abs(d[i]); at = i; } return at; };

async function videoDuration(blob) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  document.body.appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('video failed to load: ' + (v.error && v.error.message))); });
    return v.duration;
  } finally { v.remove(); URL.revokeObjectURL(url); }
}

// The frame for a time, from the file, as the red of one pixel.
async function redAt(blob, at) {
  const url = URL.createObjectURL(blob);
  const v = document.createElement('video');
  v.muted = true; v.preload = 'auto'; v.src = url;
  document.body.appendChild(v);
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = () => res(); v.onerror = () => rej(new Error('video failed')); });
    v.currentTime = at;
    await new Promise((res) => { v.onseeked = () => res(); });
    const c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    return c.getContext('2d').getImageData(8, 8, 1, 1).data[0];
  } finally { v.remove(); URL.revokeObjectURL(url); }
}

// A 2 s composition at 30 fps whose canvas flashes white on frame 30 and is
// black on every other, with an <audio> clip: half a second with one
// sample of 0.9 at its start, placed at 1 s.
async function clickAndFlash(id, extra = '') {
  const { wf } = await load();
  const name = uniqueName('flash');
  wf.kinetic.scene(name, {
    seek() {
      const ctx = this.element.querySelector('canvas').getContext('2d');
      ctx.fillStyle = this.clipFrame === 30 ? '#ffffff' : '#000000';
      ctx.fillRect(0, 0, 64, 36);
    },
  });
  const click = new Float32Array(24000);
  click[0] = 0.9;
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="2" data-width="64" data-height="36" data-fps="30">
    <audio id="click" src="${wavUrl(click)}" data-start="1"></audio>${extra}
    <div data-component="${name}" data-start="0" data-duration="2"><canvas width="64" height="36"></canvas></div>
  </div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  await wf.kinetic.ready();
  return { wf, host, canvas: host.querySelector('canvas') };
}

describe(`render() with sound (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it.runIf(hasAudio)('writes an AAC track whose click, with the edit list applied, is within 1 ms of 1.0 s, where the flash is', async () => {
    const { wf, canvas } = await clickAndFlash('ar1');
    const r = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6 });
    expect(r.frames).toBe(60);
    const track = await demux(r.blob);
    expect(track.kinds).toEqual(['vide', 'soun']);
    expect(track.codec).toBe('mp4a');
    expect(track.segment).toBe(2 * 90000);                 // the render's length, in the movie's timescale
    expect(track.samples.every((s) => s.duration === 1024)).toBe(true);
    const pcm = await decodeTrack(track);
    const heard = peakAt(pcm) - track.mediaTime;
    expect(Math.abs(heard - 48000), 'click at sample ' + heard).toBeLessThanOrEqual(48);
    // The flash is on the same second.
    expect(await redAt(r.blob, 1 + 0.5 / 30)).toBeGreaterThan(200);
    expect(await redAt(r.blob, 1 - 1.5 / 30)).toBeLessThan(50);
    // The file plays in a <video> element, for its whole length.
    expect(Math.abs(await videoDuration(r.blob) - 2)).toBeLessThan(0.1);
  });

  it.runIf(hasAudio)('the priming in the edit list is the priming the decoded track shows', async () => {
    const { wf, canvas } = await clickAndFlash('ar2');
    const r = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6 });
    const track = await demux(r.blob);
    const raw = peakAt(await decodeTrack(track));
    expect(track.mediaTime).toBeGreaterThan(0);
    expect(Math.abs((raw - 48000) - track.mediaTime), 'decoded click at ' + raw + ', edit list ' + track.mediaTime).toBeLessThanOrEqual(2);
  });

  it.runIf(hasAudio)('from 0.5: the click is at 0.5 s in the file', async () => {
    const { wf, canvas } = await clickAndFlash('ar3');
    const r = await wf.kinetic.render({ source: canvas, from: 0.5, download: false, bitrate: 1e6 });
    expect(r.frames).toBe(45);
    const track = await demux(r.blob);
    const heard = peakAt(await decodeTrack(track)) - track.mediaTime;
    expect(Math.abs(heard - 24000), 'click at sample ' + heard).toBeLessThanOrEqual(48);
    expect(Math.abs(await videoDuration(r.blob) - 1.5)).toBeLessThan(0.1);
  });

  it.runIf(hasAudio)("audioCodec: 'opus' writes an Opus track with the pre-skip in dOps alone, the edit list starting at 0", async () => {
    const { wf, canvas } = await clickAndFlash('ar4');
    const r = await wf.kinetic.render({ source: canvas, audioCodec: 'opus', download: false, bitrate: 1e6 });
    const track = await demux(r.blob);
    expect(track.codec).toBe('Opus');
    expect(track.dOps.slice(0, 2)).toEqual([0, 2]);
    const preSkip = (track.dOps[2] << 8) | track.dOps[3];
    expect(preSkip).toBeGreaterThan(0);
    // Chrome applies dOps' pre-skip and the edit list's media time both, so
    // the edit list starts at 0 and the pre-skip is skipped once.
    expect(track.mediaTime).toBe(0);
    expect(track.samples.every((s) => s.duration === 960)).toBe(true);
    // Decoded with no OpusHead, the decoder skips nothing itself, so the
    // click comes the pre-skip late.
    const raw = peakAt(await decodeTrack(track)) - preSkip;
    expect(Math.abs(raw - 48000), 'click at sample ' + raw).toBeLessThanOrEqual(48);
    expect(Math.abs(await videoDuration(r.blob) - 2)).toBeLessThan(0.1);
  });

  // The file as Chrome itself reads it: decodeAudioData takes the MP4 the way
  // a <video> or <audio> element does, edit list and pre-skip included.
  // Chrome ends an Opus track on a whole 20 ms packet, past the edit's end
  // within it (measured: 100 packets less the pre-skip with the edit at the
  // render's length, 101 with it a pre-skip longer), so an Opus decode covers
  // the render and runs on by less than one packet.
  for (const [audioCodec, over] of [['mp4a.40.2', 48], ['opus', 959]]) {
    it.runIf(hasAudio)(`Chrome's own decode of the file (${audioCodec}) puts the click within 1 ms of 1.0 s and lasts the render's length`, async () => {
      const { wf, canvas } = await clickAndFlash('ar9' + audioCodec.length);
      const r = await wf.kinetic.render({ source: canvas, audioCodec, download: false, bitrate: 1e6 });
      const b = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await r.blob.arrayBuffer());
      const at = peakAt(b.getChannelData(0));
      expect(Math.abs(at - 48000), audioCodec + ' click at sample ' + at).toBeLessThanOrEqual(48);
      expect(b.length, audioCodec + ' length').toBeGreaterThanOrEqual(96000 - 48);
      expect(b.length, audioCodec + ' length').toBeLessThanOrEqual(96000 + over);
    });
  }

  it.runIf(hasAudio)('an encoder delay that cannot be measured is KN-203, thrown on every build', async () => {
    const { wf, canvas } = await clickAndFlash('ar10');
    // A decoder that hands back nothing: the measuring impulse never comes out.
    const decode = AudioDecoder.prototype.decode;
    AudioDecoder.prototype.decode = function () {};
    restores.push(() => { AudioDecoder.prototype.decode = decode; });
    const err = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6 }).catch((e) => e);
    expectKN(err, 'KN-203', 'render()', /^could not measure the audio encoder's delay/);
  });

  it('render({ audio: false }) and a composition with no audio clip write the video alone', async () => {
    const { wf, canvas } = await clickAndFlash('ar5');
    const r = await wf.kinetic.render({ source: canvas, audio: false, download: false, bitrate: 1e6 });
    expect((await demux(r.blob)).kinds).toEqual(['vide']);
    cleanup.splice(0).forEach((el) => el.remove());
    const name = uniqueName('quiet');
    wf.kinetic.scene(name, { seek() { this.element.querySelector('canvas').getContext('2d').fillRect(0, 0, 8, 8); } });
    const host = await mount(`<div data-composition-id="ar6" data-start="0" data-duration="0.5" data-width="64" data-height="36" data-fps="10"><div data-component="${name}"><canvas width="64" height="36"></canvas></div></div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    const q = await wf.kinetic.render({ source: host.querySelector('canvas'), download: false, bitrate: 1e6 });
    expect((await demux(q.blob)).kinds).toEqual(['vide']);
  });

  it('a bad audio, audioCodec or audioBitrate is KN-100, before the page is touched', async () => {
    const { wf, canvas } = await clickAndFlash('ar7');
    for (const opts of [{ audio: 'yes' }, { audioCodec: 'mp3' }, { audioCodec: 'aac' }, { audioBitrate: '192k' }, { audioBitrate: -1 }]) {
      const err = await wf.kinetic.render(Object.assign({ source: canvas, download: false }, opts)).catch((e) => e);
      expectKN(err, 'KN-100', 'render({ ' + Object.keys(opts)[0] + ' })', Object.keys(opts)[0] + ' is ');
    }
  });

  it.runIf(hasAudio)('falls back to Opus when the browser cannot encode AAC, with KN-202 once in development; an audioCodec it cannot encode is KN-100', async () => {
    const { wf, canvas } = await clickAndFlash('ar8');
    const real = AudioEncoder.isConfigSupported;
    AudioEncoder.isConfigSupported = async (c) => (String(c.codec).startsWith('mp4a') ? { supported: false, config: c } : real.call(AudioEncoder, c));
    restores.push(() => { AudioEncoder.isConfigSupported = real; });
    let r;
    const lines = await captureWarnings(async () => {
      r = await wf.kinetic.render({ source: canvas, download: false, bitrate: 1e6 });
      await wf.kinetic.render({ source: canvas, from: 1.5, download: false, bitrate: 1e6 });
    });
    expect((await demux(r.blob)).codec).toBe('Opus');
    expect(lines.filter((l) => l.startsWith('[KN-202]')).length).toBe(BUILD === 'dev' ? 1 : 0);
    const err = await wf.kinetic.render({ source: canvas, audioCodec: 'mp4a.40.2', download: false }).catch((e) => e);
    expectKN(err, 'KN-100', 'render(): mp4a.40.2 at 48 kHz', /^this browser cannot encode mp4a\.40\.2/);
  });
});
