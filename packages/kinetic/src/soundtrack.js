/**
 * The sound of a render: the codec, the encode and the encoder's delay.
 *
 * soundConfig(asked, bitrate) is the AudioEncoder config, 48 kHz stereo:
 * AAC-LC ('mp4a.40.2') unless `asked` says 'opus'. With nothing asked and
 * no AAC encoder in the browser it falls back to Opus, and development
 * builds say so once (KN-202). A codec the browser cannot encode is KN-100.
 *
 * encodeSound(clips, config, from, length, stop) mixes `length` samples from
 * composition time `from` in 10 s segments (mix.js), feeds each to one
 * AudioEncoder as f32-planar AudioData stamped from its sample count, and
 * returns what mp4.js writes: the codec, its description, the priming and
 * the samples with their durations in samples. `stop`, render()'s abort
 * check, runs before each segment and throws the signal's reason; the
 * encoder is closed either way.
 *
 * The priming: AAC's encoder puts samples before the first real one and its
 * chunk timestamps do not show them. It is measured once per render, before
 * the encode: a buffer with one impulse at a known sample goes through a
 * second encoder with the same config, AudioDecoder decodes it, and the
 * impulse's place less its known one is the priming. Opus's pre-skip is read
 * from that encoder's OpusHead (bytes 10 and 11, little-endian), and the
 * Opus encode runs that many samples past `to`. A measuring encoder or decoder
 * that fails, an impulse that never comes back, or an encoder that gives no
 * codec description is KN-203, thrown on every build.
 */

import { CODES, warn, fail } from './diagnostics.js';
import { RATE, SEGMENT, mixSegment } from './mix.js';

let fellBack = false;

export async function soundConfig(asked, bitrate) {
  const E = self.AudioEncoder;
  const config = (codec) => ({ codec, sampleRate: RATE, numberOfChannels: 2, bitrate });
  const can = async (codec) => {
    if (typeof E !== 'function') return false;
    try { return !!(await E.isConfigSupported(config(codec))).supported; } catch (_) { return false; }
  };
  if (asked) {
    if (!(await can(asked))) throw fail(CODES.BAD_CALL, 'render(): ' + asked + ' at 48 kHz', __DEV__ && 'this browser cannot encode ' + asked + ' at 48 kHz stereo; ' + (asked === 'opus' ? "try 'mp4a.40.2'" : "try 'opus'") + ', or render({ audio: false }) for the video alone');
    return config(asked);
  }
  if (await can('mp4a.40.2')) return config('mp4a.40.2');
  if (await can('opus')) {
    if (__DEV__ && !fellBack) {
      fellBack = true;
      warn(CODES.AAC_FALLBACK, 'render(): this browser cannot encode AAC, so the sound is Opus, which fewer players read in an MP4 than AAC',
        'Render in a browser with an AAC encoder (Chrome on macOS has one), or pass audioCodec: \'opus\' to choose Opus and silence this warning.');
    }
    return config('opus');
  }
  throw fail(CODES.BAD_CALL, 'render({ audio })', __DEV__ && 'this browser cannot encode audio (mp4a.40.2 or opus); render({ audio: false }) writes the video alone');
}

// An AudioEncoder that hands each chunk to `chunk` and keeps the first
// description and the first error.
function encoder(config, chunk) {
  const out = { description: null, failure: null };
  out.encoder = new self.AudioEncoder({
    output(c, meta) {
      if (!out.description && meta && meta.decoderConfig && meta.decoderConfig.description) out.description = new Uint8Array(meta.decoderConfig.description);
      chunk(c);
    },
    error(e) { out.failure = e; },
  });
  out.encoder.configure(config);
  return out;
}

const audioData = (data, frames, at) => new self.AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: frames, numberOfChannels: 2, timestamp: Math.round(at * 1e6 / RATE), data });

const noDelay = (why) => fail(CODES.NO_DELAY, 'render()', __DEV__ && "could not measure the audio encoder's delay (" + why + '), so the sound could not be lined up with the picture');

// The encoder's delay in samples: Opus's pre-skip, or AAC's priming.
async function delayOf(config) {
  const n = 8192, mark = 2048;
  const chunks = [];
  let i = 0, at = 0, max = 0, failure = null;
  try {
    const e = encoder(config, (c) => chunks.push(c));
    const data = new Float32Array(n * 2);
    data[mark] = data[n + mark] = 0.9;
    const ad = audioData(data, n, 0);
    try { e.encoder.encode(ad); } finally { ad.close(); }
    await e.encoder.flush();
    e.encoder.close();
    if (e.failure) throw e.failure;
    if (!e.description) throw new Error(__DEV__ ? 'the encoder gave no codec description' : '');
    if (config.codec === 'opus') return e.description[10] | (e.description[11] << 8);
    const decoder = new self.AudioDecoder({
      output(a) {
        const f = new Float32Array(a.numberOfFrames);
        a.copyTo(f, { planeIndex: 0, format: 'f32-planar' });
        a.close();
        for (let k = 0; k < f.length; k++, i++) if (Math.abs(f[k]) > max) { max = Math.abs(f[k]); at = i; }
      },
      error(err) { failure = err; },
    });
    decoder.configure({ codec: config.codec, sampleRate: RATE, numberOfChannels: 2, description: e.description });
    for (const c of chunks) decoder.decode(c);
    await decoder.flush();
    decoder.close();
  } catch (err) {
    failure = failure || err;
  }
  if (failure) throw noDelay(__DEV__ && (failure && failure.message || String(failure)));
  // The impulse went in at 0.9; it comes out spread, a little lower.
  if (!(max > 0.1)) throw noDelay(__DEV__ && 'the measuring impulse did not come back from the decoder');
  return Math.max(0, at - mark);
}

export async function encodeSound(clips, config, from, length, stop) {
  const opus = config.codec === 'opus';
  const priming = await delayOf(config);
  if (stop) stop();
  // A decoder drops Opus's pre-skip from the start of what it hands out, so
  // that many samples more go in, from past `to`, for the sound to last as
  // long as the render.
  if (opus) length += priming;
  const samples = [];
  const e = encoder(config, (c) => {
    const bytes = new Uint8Array(c.byteLength);
    c.copyTo(bytes);
    samples.push({ bytes, duration: c.duration ? Math.round(c.duration * RATE / 1e6) : opus ? 960 : 1024 });
  });
  try {
    for (let done = 0; done < length; done += SEGMENT) {
      if (e.failure) throw e.failure;
      if (stop) stop();
      const n = Math.min(SEGMENT, length - done);
      const mixed = await mixSegment(clips, from + done, n);
      const data = new Float32Array(n * 2);
      data.set(mixed.getChannelData(0), 0);
      data.set(mixed.getChannelData(1), n);
      const ad = audioData(data, n, done);
      try { e.encoder.encode(ad); } finally { ad.close(); }
      while (e.encoder.encodeQueueSize > 2) await new Promise((r) => setTimeout(r, 2));
    }
    await e.encoder.flush();
    if (e.failure) throw e.failure;
  } finally {
    try { e.encoder.close(); } catch (_) { /* already closed */ }
  }
  if (!e.description) throw noDelay(__DEV__ && 'the encoder gave no codec description');
  return { codec: config.codec, description: e.description, priming, samples };
}
