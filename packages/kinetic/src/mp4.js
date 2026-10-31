/**
 * A minimal MP4 (ISO BMFF) writer for one video track and an optional
 * sound track, enough for a file that Chrome, Safari, VLC and FFmpeg read:
 * ftyp, moov (a trak each, with the sample tables) and mdat. Samples are the
 * encoded chunks WebCodecs hands out; the codec configuration record is the
 * encoder's `description` (avcC for H.264, av1C for AV1) or, for VP9, a vpcC
 * built from the codec string. The whole file is assembled in memory when
 * finish() is called, moov before mdat, so a player can start without
 * reading to the end.
 *
 * The sound track (`audio`: { codec, description, priming, samples:
 * [{ bytes, duration }] }, durations in samples at 48 kHz) is AAC-LC in an
 * mp4a entry whose esds carries the AudioSpecificConfig (ISO/IEC 14496-14
 * and 14496-1), or Opus in an Opus entry whose dOps is built from the
 * OpusHead (the Opus in ISOBMFF encapsulation). Its edit list lasts as long
 * as the video and, for AAC, starts the encoder's priming into the media, so
 * the first sample heard is the render's first; Opus's pre-skip is in dOps.
 * In mdat the video samples come first, then the audio, one chunk each.
 * header() is the file up to the first sample's bytes, from the sizes alone.
 *
 * Pure: no DOM, no WebCodecs; the unit tests feed it bytes and parse the
 * boxes back.
 */

const enc = new TextEncoder();

function u8(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const u16 = (v) => new Uint8Array([(v >>> 8) & 255, v & 255]);
const u32 = (v) => new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]);
const u64 = (v) => u8(u32(Math.floor(v / 4294967296)), u32(v >>> 0));
const str = (s) => enc.encode(s);
const zeros = (n) => new Uint8Array(n);
const box = (type, ...payload) => { const body = u8(...payload); return u8(u32(8 + body.length), str(type), body); };
const fullBox = (type, version, flags, ...payload) => box(type, new Uint8Array([version, (flags >>> 16) & 255, (flags >>> 8) & 255, flags & 255]), ...payload);

// 16.16 and 8.8 fixed point, and the identity matrix every track carries.
const fixed16 = (v) => u32(Math.round(v * 65536));
const MATRIX = u8(fixed16(1), u32(0), u32(0), u32(0), fixed16(1), u32(0), u32(0), u32(0), u32(0x40000000));

// The VisualSampleEntry shared by avc1, av01 and vp09.
function visualEntry(type, width, height, config) {
  return box(type,
    zeros(6), u16(1),                      // reserved, data_reference_index
    zeros(16),                             // pre_defined, reserved
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000),      // 72 dpi
    u32(0), u16(1),                        // reserved, frame_count
    zeros(32),                             // compressorname
    u16(0x0018), u16(0xffff),              // depth, pre_defined
    config);
}

// vpcC from a codec string such as vp09.00.10.08: profile, level, bit depth.
function vpcC(codec) {
  const [, profile = '0', level = '10', depth = '8'] = codec.split('.');
  return fullBox('vpcC', 1, 0,
    new Uint8Array([Number(profile), Number(level), (Number(depth) << 4) | (1 << 1) | 0]),   // bitDepth, chromaSubsampling 4:2:0, full range 0
    new Uint8Array([1, 1, 1]),             // colour primaries, transfer, matrix: BT.709
    u16(0));                               // codecInitializationDataSize
}

// av1C from a codec string such as av01.0.04M.08 (profile, level, tier,
// bit depth, then optionally monochrome and chroma subsampling), for an
// encoder that hands out no description: the marker and version byte, then
// the profile and level, then tier, depth, monochrome and chroma, then no
// presentation delay and no config OBUs. The chroma subsampling field is
// three digits, x, y and the sample position; without it the profile
// decides: 4:2:0 for profile 0, 4:4:4 for profile 1, 4:2:2 for profile 2.
// A monochrome stream is 4:2:0.
function av1C(codec) {
  const [, profile = '0', levelTier = '04M', depth = '08', mono = '0', chroma] = codec.split('.');
  const level = Number(levelTier.slice(0, 2));
  const tier = levelTier.endsWith('H') ? 1 : 0;
  const bits = Number(depth);
  const monochrome = mono === '1' ? 1 : 0;
  const p = Number(profile);
  let x = p === 1 ? 0 : 1, y = p === 0 ? 1 : 0, position = 0;
  if (chroma && /^[01][01][0-3]$/.test(chroma)) { x = Number(chroma[0]); y = Number(chroma[1]); position = Number(chroma[2]); }
  if (monochrome) { x = 1; y = 1; }
  return box('av1C', new Uint8Array([
    0x81,
    (p << 5) | (level & 31),
    (tier << 7) | ((bits >= 10 ? 1 : 0) << 6) | ((bits === 12 ? 1 : 0) << 5) | (monochrome << 4) | (x << 3) | (y << 2) | position,
    0,
  ]));
}

// ---- the sound track ------------------------------------------------------------

const AUDIO_RATE = 48000;

// The AudioSampleEntry shared by mp4a and Opus: 2 channels, 16 bits, 48 kHz.
function audioEntry(type, config) {
  return box(type,
    zeros(6), u16(1),                      // reserved, data_reference_index
    zeros(8),                              // reserved
    u16(2), u16(16),                       // channelcount, samplesize
    zeros(4),                              // pre_defined, reserved
    u32(AUDIO_RATE * 65536),               // samplerate, 16.16
    config);
}

// An MPEG-4 descriptor (ISO/IEC 14496-1): its tag, then its size seven bits
// to a byte in four bytes, the high bit set on all but the last.
function descriptor(tag, ...payload) {
  const body = u8(...payload), n = body.length;
  return u8(new Uint8Array([tag, 0x80 | ((n >>> 21) & 127), 0x80 | ((n >>> 14) & 127), 0x80 | ((n >>> 7) & 127), n & 127]), body);
}

// esds for AAC: an ES descriptor holding the decoder config (MPEG-4 audio,
// an audio stream, buffer size and bitrates 0, which 14496-1 allows for a
// variable bitrate) with the AudioSpecificConfig, and the SL config.
function esds(asc) {
  return fullBox('esds', 0, 0, descriptor(3, u16(0), new Uint8Array([0]),
    descriptor(4, new Uint8Array([0x40, 0x15]), zeros(11), descriptor(5, asc)),
    descriptor(6, new Uint8Array([2]))));
}

// dOps from an OpusHead: the head is little-endian, dOps big-endian, and
// dOps has version 0 where the head has 1. A channel mapping table, for a
// mapping family other than 0, is copied as it is.
function dOps(head) {
  if (!head || head.length < 19) throw new Error('mp4: Opus needs the OpusHead description');
  const le = (o, n) => { let v = 0; for (let i = n - 1; i >= 0; i--) v = v * 256 + head[o + i]; return v; };
  return box('dOps', new Uint8Array([0, head[9]]), u16(le(10, 2)), u32(le(12, 4)), u16(le(16, 2)), new Uint8Array([head[18]]), head.subarray(19));
}

// The sound track's trak: track 2, `length` long in the movie's timescale,
// its samples' bytes at `offset` in the file.
function soundTrak(audio, length, offset) {
  const opus = audio.codec === 'opus';
  const samples = audio.samples;
  const count = samples.length;
  let duration = 0;
  const runs = [];                         // [count, delta] for stts
  for (const s of samples) {
    duration += s.duration;
    const last = runs[runs.length - 1];
    if (last && last[1] === s.duration) last[0]++;
    else runs.push([1, s.duration]);
  }
  const entry = opus ? audioEntry('Opus', dOps(new Uint8Array(audio.description))) : audioEntry('mp4a', esds(new Uint8Array(audio.description)));
  const stts = fullBox('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => u8(u32(c), u32(d))));
  const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(count), u32(1));
  const stsz = fullBox('stsz', 0, 0, u32(0), u32(count), ...samples.map((s) => u32(s.bytes.length)));
  const stco = offset > 0xffffffff ? fullBox('co64', 0, 0, u32(1), u64(offset)) : fullBox('stco', 0, 0, u32(1), u32(offset));
  const stbl = box('stbl', fullBox('stsd', 0, 0, u32(1), entry), stts, stsc, stsz, stco);
  const minf = box('minf', fullBox('smhd', 0, 0, zeros(4)), box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))), stbl);
  const hdlr = fullBox('hdlr', 0, 0, u32(0), str('soun'), zeros(12), str('Kinetic\0'));
  const mdhd = fullBox('mdhd', 1, 0, u64(0), u64(0), u32(AUDIO_RATE), u64(duration), u16(0x55c4), u16(0));
  // For Opus the edit list starts at 0 and dOps alone carries the pre-skip:
  // Chrome applies both, and a media time of the pre-skip put a click 6.5 ms
  // early in its decode (measured 2026-10-08, Chrome 154; FFmpeg was exact
  // either way). Chrome then drops the pre-skip from inside the edit, so
  // the edit lasts that much longer (createMp4) and its decode is the
  // render's whole length.
  const elst = fullBox('elst', 1, 0, u32(1), u64(length), u64(opus ? 0 : audio.priming), u16(1), u16(0));
  const tkhd = fullBox('tkhd', 1, 3, u64(0), u64(0), u32(2), u32(0), u64(length), zeros(8), u16(0), u16(0), u16(0x0100), u16(0), MATRIX, u32(0), u32(0));
  return box('trak', tkhd, box('edts', elst), box('mdia', mdhd, hdlr, minf));
}

// The mdat header for a payload of n bytes. Its 32-bit size counts the
// 8-byte header too, so a payload of 2^32 - 8 bytes or more takes the
// 64-bit form: a size of 1, the type, then the whole box's size in 64 bits.
export function mdatHeader(n) {
  return 8 + n <= 0xffffffff ? u8(u32(8 + n), str('mdat')) : u8(u32(1), str('mdat'), u64(16 + n));
}

export function createMp4({ width, height, fps, codec, description, audio }) {
  // Frame i ends at round((i + 1) * timescale / fps), so each frame's delta
  // is whole and the file lasts frames / fps to a tick, as its sound does: a
  // single rounded delta ran 59.94 fps 200 ms long over 10 minutes. At an
  // fps that divides 90000 that is one stts run; at 59.94 two deltas alternate.
  const timescale = 90000;
  const end = (i) => Math.round(i * timescale / fps);
  const samples = [];                      // { bytes, key }
  let dataSize = 0;

  function addSample(bytes, key) {
    samples.push({ bytes, key: !!key });
    dataSize += bytes.length;
  }

  const sound = audio && audio.samples && audio.samples.length ? audio : null;

  // ftyp, moov and mdat's header: the file up to the first sample's bytes.
  // It reads only the samples' sizes.
  function header() {
    if (!samples.length) throw new Error('mp4: no samples');
    const kind = codec.startsWith('avc1') ? 'avc1' : codec.startsWith('av01') ? 'av01' : codec.startsWith('vp09') ? 'vp09' : null;
    if (!kind) throw new Error('mp4: unsupported codec ' + codec);
    let config;
    if (kind === 'avc1') { if (!description) throw new Error('mp4: avc1 needs the avcC description'); config = box('avcC', new Uint8Array(description)); }
    else if (kind === 'av01') config = description ? box('av1C', new Uint8Array(description)) : av1C(codec);
    else config = vpcC(codec);

    const count = samples.length;
    const duration = end(count);
    // The sound lasts as long as the video, and an Opus track its pre-skip
    // more; the movie lasts as long as the longer.
    const heard = sound ? duration + (sound.codec === 'opus' ? Math.round(sound.priming * timescale / AUDIO_RATE) : 0) : 0;
    const movie = Math.max(duration, heard);
    const ftyp = box('ftyp', str('isom'), u32(0x200), str('isom'), str('iso2'), str(kind === 'avc1' ? 'avc1' : 'mp41'), str('mp41'));

    // moov's size is known only once its own tables exist, and stco holds
    // offsets into mdat, which follows moov. The tables are built with a
    // placeholder offset, measured, then rebuilt with the real one. The
    // video's chunk starts right after moov, so its offset fits stco's 32
    // bits; the sound's follows the video's.
    const soundSize = sound ? sound.samples.reduce((n, s) => n + s.bytes.length, 0) : 0;
    const head = mdatHeader(dataSize + soundSize);
    const runs = [];                       // [count, delta] for stts
    for (let i = 0; i < count; i++) {
      const d = end(i + 1) - end(i), last = runs[runs.length - 1];
      if (last && last[1] === d) last[0]++;
      else runs.push([1, d]);
    }
    const build = (mdatStart) => {
      const stts = fullBox('stts', 0, 0, u32(runs.length), ...runs.map(([c, d]) => u8(u32(c), u32(d))));
      const keys = [];
      samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
      const stss = fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32));
      const stsc = fullBox('stsc', 0, 0, u32(1), u32(1), u32(count), u32(1));   // one chunk holding every sample
      const stsz = fullBox('stsz', 0, 0, u32(0), u32(count), ...samples.map((s) => u32(s.bytes.length)));
      const stco = fullBox('stco', 0, 0, u32(1), u32(mdatStart + head.length));
      const stsd = fullBox('stsd', 0, 0, u32(1), visualEntry(kind, width, height, config));
      const stbl = box('stbl', stsd, stts, stss, stsc, stsz, stco);
      const dinf = box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1)));
      const vmhd = fullBox('vmhd', 0, 1, zeros(8));
      const minf = box('minf', vmhd, dinf, stbl);
      const hdlr = fullBox('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('Kinetic\0'));
      const mdhd = fullBox('mdhd', 1, 0, u64(0), u64(0), u32(timescale), u64(duration), u16(0x55c4), u16(0));   // language und
      const mdia = box('mdia', mdhd, hdlr, minf);
      const tkhd = fullBox('tkhd', 1, 3, u64(0), u64(0), u32(1), u32(0), u64(duration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, fixed16(width), fixed16(height));
      const trak = box('trak', tkhd, mdia);
      const mvhd = fullBox('mvhd', 1, 0, u64(0), u64(0), u32(timescale), u64(movie), fixed16(1), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(sound ? 3 : 2));
      return sound ? box('moov', mvhd, trak, soundTrak(sound, heard, mdatStart + head.length + dataSize)) : box('moov', mvhd, trak);
    };
    // The sound's box is stco or co64 by the final offset, which moves with
    // moov's own size, so moov is built again until its size holds: twice,
    // or three times when the sound's offset crosses 4 GB on the way.
    let moov = build(0), size;
    do { size = moov.length; moov = build(ftyp.length + size); } while (moov.length !== size);
    return u8(ftyp, moov, head);
  }

  const finish = () => u8(header(), ...samples.map((s) => s.bytes), ...(sound ? sound.samples.map((s) => s.bytes) : []));

  return { addSample, header, finish, sampleAt: (i) => samples[i], get count() { return samples.length; } };
}
