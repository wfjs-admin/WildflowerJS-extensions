/**
 * The MP4 writer, parsed back box by box: the file layout, the sample
 * tables, the keyframe list, the chunk offsets that land on the sample
 * bytes, and the codec configuration for each of the three codecs. The
 * writer is internal, reached through the built file's render() module, so
 * this test imports the source directly; it is pure and needs no DOM.
 */
import { describe, it, expect } from 'vitest';
import * as mp4 from '../src/mp4.js';

const { createMp4 } = mp4;
const dec = new TextDecoder();
const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16 = (b, o) => (b[o] << 8) | b[o + 1];
const type = (b, o) => dec.decode(b.subarray(o + 4, o + 8));

// Top-level boxes, and the boxes inside a container. A size field of 1 means
// a 64-bit largesize follows the type, and the body starts 16 bytes in; 0
// means the box runs to the end.
function boxes(b, start = 0, end = b.length) {
  const out = [];
  for (let o = start; o < end;) {
    let size = u32(b, o), body = o + 8;
    if (size === 1) { size = u32(b, o + 8) * 4294967296 + u32(b, o + 12); body = o + 16; }
    else if (size === 0) size = end - o;
    out.push({ type: type(b, o), start: o, size, body });
    o += size;
  }
  return out;
}
const find = (list, t) => list.find((x) => x.type === t);
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf']);
function path(b, root, ...types) {
  let cur = root;
  for (const t of types) {
    const inner = boxes(b, cur.body + (CONTAINERS.has(cur.type) ? 0 : 0), cur.start + cur.size);
    cur = find(inner, t);
    if (!cur) throw new Error('missing ' + t);
  }
  return cur;
}

function sample(n, key) { const s = new Uint8Array(n); for (let i = 0; i < n; i++) s[i] = (key ? 0x80 : 0) | (i & 0x7f); return s; }

// The av1C bytes a one-sample file carries for a codec string, built by the
// writer with no encoder description.
function av1CFor(codec) {
  const w = createMp4({ width: 64, height: 64, fps: 30, codec, description: null });
  w.addSample(sample(8, true), true);
  const b = w.finish();
  const stbl = path(b, boxes(b)[1], 'trak', 'mdia', 'minf', 'stbl');
  const stsd = find(boxes(b, stbl.body, stbl.start + stbl.size), 'stsd');
  const e = boxes(b, stsd.body + 8, stsd.start + stsd.size)[0];
  const cfg = boxes(b, e.body + 78, e.start + e.size)[0];
  return Array.from(b.subarray(cfg.body, cfg.start + cfg.size));
}

describe('mp4 writer', () => {
  it('writes ftyp, moov then mdat, with the tables describing every sample', () => {
    const avcC = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 2, 0x68, 0xee]);
    const w = createMp4({ width: 1280, height: 720, fps: 30, codec: 'avc1.640028', description: avcC });
    const sizes = [500, 120, 130, 140, 480, 110];
    sizes.forEach((n, i) => w.addSample(sample(n, i % 4 === 0), i % 4 === 0));
    const b = w.finish();
    const top = boxes(b);
    expect(top.map((x) => x.type)).toEqual(['ftyp', 'moov', 'mdat']);
    expect(dec.decode(b.subarray(top[0].body, top[0].body + 4))).toBe('isom');
    const moov = top[1], mdat = top[2];
    expect(mdat.size).toBe(8 + sizes.reduce((a, c) => a + c, 0));

    const stbl = path(b, moov, 'trak', 'mdia', 'minf', 'stbl');
    const inner = boxes(b, stbl.body, stbl.start + stbl.size);
    expect(inner.map((x) => x.type)).toEqual(['stsd', 'stts', 'stss', 'stsc', 'stsz', 'stco']);
    const stts = find(inner, 'stts'); expect(u32(b, stts.body + 4)).toBe(1); expect(u32(b, stts.body + 8)).toBe(6); expect(u32(b, stts.body + 12)).toBe(3000);   // 90000 / 30
    const stss = find(inner, 'stss'); expect(u32(b, stss.body + 4)).toBe(2); expect([u32(b, stss.body + 8), u32(b, stss.body + 12)]).toEqual([1, 5]);
    const stsz = find(inner, 'stsz'); expect(u32(b, stsz.body + 8)).toBe(6);
    expect(sizes.map((_, i) => u32(b, stsz.body + 12 + 4 * i))).toEqual(sizes);
    const stco = find(inner, 'stco'); const offset = u32(b, stco.body + 8);
    expect(offset).toBe(mdat.body);
    // The bytes at the chunk offset are the first sample's, and the second
    // sample follows at offset + size.
    expect(b[offset]).toBe(0x80); expect(b[offset + 500]).toBe(0x00); expect(b[offset + 501]).toBe(0x01);

    const stsd = find(inner, 'stsd');
    const entry = boxes(b, stsd.body + 8, stsd.start + stsd.size)[0];
    expect(entry.type).toBe('avc1');
    expect(u16(b, entry.body + 24)).toBe(1280); expect(u16(b, entry.body + 26)).toBe(720);
    const cfg = boxes(b, entry.body + 78, entry.start + entry.size)[0];
    expect(cfg.type).toBe('avcC');
    expect(Array.from(b.subarray(cfg.body, cfg.start + cfg.size))).toEqual(Array.from(avcC));

    const mdhd = path(b, moov, 'trak', 'mdia', 'mdhd');
    expect(u32(b, mdhd.body + 4 + 16)).toBe(90000);                         // timescale, after version/flags and two 64-bit times
    expect(u32(b, mdhd.body + 4 + 20 + 4)).toBe(6 * 3000);                  // duration low word
    const tkhd = path(b, moov, 'trak', 'tkhd');
    expect(u32(b, tkhd.body + 4 + 16)).toBe(1);                             // track id
    const hdlr = path(b, moov, 'trak', 'mdia', 'hdlr');
    expect(dec.decode(b.subarray(hdlr.body + 8, hdlr.body + 12))).toBe('vide');
  });

  it('builds av1C from the codec string when the encoder gives no description', () => {
    const a = createMp4({ width: 64, height: 64, fps: 30, codec: 'av01.0.08M.08', description: null });
    a.addSample(sample(8, true), true);
    const af = a.finish();
    const stbl = path(af, boxes(af)[1], 'trak', 'mdia', 'minf', 'stbl');
    const stsd = find(boxes(af, stbl.body, stbl.start + stbl.size), 'stsd');
    const e = boxes(af, stsd.body + 8, stsd.start + stsd.size)[0];
    const cfg = boxes(af, e.body + 78, e.start + e.size)[0];
    expect(cfg.type).toBe('av1C');
    expect(Array.from(af.subarray(cfg.body, cfg.start + cfg.size))).toEqual([0x81, 0x08, 0x0c, 0x00]);
    // The third byte: tier, high bit depth, twelve bit, monochrome,
    // subsampling x, subsampling y, then the two bits of sample position.
    expect(av1CFor('av01.1.12H.10')).toEqual([0x81, 0x2c, 0xc0, 0x00]);         // profile 1, level 12, tier high, 10-bit, 4:4:4
    expect(av1CFor('av01.2.08M.10')).toEqual([0x81, 0x48, 0x48, 0x00]);         // profile 2 with no subsampling field: 4:2:2
    expect(av1CFor('av01.2.08M.12.0.000')).toEqual([0x81, 0x48, 0x60, 0x00]);   // profile 2, 12-bit, 4:4:4 by the field
    expect(av1CFor('av01.2.08M.12.0.100')).toEqual([0x81, 0x48, 0x68, 0x00]);   // profile 2, 12-bit, 4:2:2 by the field
    expect(av1CFor('av01.0.04M.08.0.112')).toEqual([0x81, 0x04, 0x0e, 0x00]);   // profile 0, 4:2:0, colocated sample position
    expect(av1CFor('av01.0.04M.08.1')).toEqual([0x81, 0x04, 0x1c, 0x00]);       // profile 0, monochrome
  });

  it('writes the 32-bit mdat size up to 2^32 - 1 bytes in all, and the 64-bit largesize past it', () => {
    const small = mp4.mdatHeader(100);
    expect(boxes(small, 0, small.length)[0]).toEqual({ type: 'mdat', start: 0, size: 108, body: 8 });
    const edge = mp4.mdatHeader(2 ** 32 - 9);                     // 8 + payload = 0xffffffff, the largest 32-bit size
    expect(edge.length).toBe(8);
    expect(u32(edge, 0)).toBe(0xffffffff);
    const big = mp4.mdatHeader(2 ** 32 - 8);                      // one byte more no longer fits
    expect(big.length).toBe(16);
    expect(u32(big, 0)).toBe(1);
    expect(boxes(big, 0, big.length)[0]).toEqual({ type: 'mdat', start: 0, size: 2 ** 32 + 8, body: 16 });
    const huge = mp4.mdatHeader(5e9);
    expect(boxes(huge, 0, huge.length)[0]).toEqual({ type: 'mdat', start: 0, size: 5e9 + 16, body: 16 });
  });

  it('writes av01 with av1C and vp09 with a vpcC built from the codec string', () => {
    const av1C = new Uint8Array([0x81, 0x08, 0x0c, 0x00]);
    const a = createMp4({ width: 640, height: 360, fps: 25, codec: 'av01.0.04M.08', description: av1C });
    a.addSample(sample(40, true), true);
    const af = a.finish();
    const astbl = path(af, boxes(af)[1], 'trak', 'mdia', 'minf', 'stbl');
    const astsd = find(boxes(af, astbl.body, astbl.start + astbl.size), 'stsd');
    const ae = boxes(af, astsd.body + 8, astsd.start + astsd.size)[0];
    expect(ae.type).toBe('av01');
    const acfg = boxes(af, ae.body + 78, ae.start + ae.size)[0];
    expect(acfg.type).toBe('av1C');
    expect(Array.from(af.subarray(acfg.body, acfg.start + acfg.size))).toEqual(Array.from(av1C));

    const v = createMp4({ width: 640, height: 360, fps: 25, codec: 'vp09.00.10.08', description: null });
    v.addSample(sample(40, true), true);
    const vf = v.finish();
    const vstbl = path(vf, boxes(vf)[1], 'trak', 'mdia', 'minf', 'stbl');
    const vstsd = find(boxes(vf, vstbl.body, vstbl.start + vstbl.size), 'stsd');
    const ve = boxes(vf, vstsd.body + 8, vstsd.start + vstsd.size)[0];
    expect(ve.type).toBe('vp09');
    const vcfg = boxes(vf, ve.body + 78, ve.start + ve.size)[0];
    expect(vcfg.type).toBe('vpcC');
    expect(Array.from(vf.subarray(vcfg.body, vcfg.body + 7))).toEqual([1, 0, 0, 0, 0, 10, 0x82]);   // version 1, flags, profile 0, level 10, depth 8 with 4:2:0
  });

  // ---- the audio track ---------------------------------------------------------

  // The audio samples carry 0xa0 + their index in their first byte, so an
  // offset can be checked to land on one.
  const audioSamples = (sizes, duration) => sizes.map((n, i) => { const s = new Uint8Array(n); s.fill(0x11); s[0] = 0xa0 + i; return { bytes: s, duration }; });
  // An MPEG-4 descriptor at o: its tag, its body and where it ends. The size
  // is seven bits a byte, the high bit set on every byte but the last.
  function descriptor(b, o) {
    const tag = b[o];
    let size = 0, p = o + 1;
    for (;;) { const c = b[p++]; size = (size << 7) | (c & 0x7f); if (!(c & 0x80)) break; }
    return { tag, body: p, end: p + size };
  }
  const traks = (b) => boxes(b, boxes(b)[1].body, boxes(b)[1].start + boxes(b)[1].size).filter((x) => x.type === 'trak');
  const inTrak = (b, trak, ...types) => path(b, trak, ...types);
  const AVCC = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 2, 0x68, 0xee]);

  it('adds an AAC track: a second trak with soun, the esds holding the description, stts in 1024s, an edit list over the priming, and each stco on its own first bytes', () => {
    const asc = new Uint8Array([0x11, 0x90]);                          // AAC-LC, 48 kHz, stereo
    const vsizes = [300, 80, 90];
    const asizes = [6, 6, 160, 171, 150];
    const w = createMp4({ width: 320, height: 180, fps: 30, codec: 'avc1.640028', description: AVCC,
      audio: { codec: 'mp4a.40.2', description: asc, priming: 2112, samples: audioSamples(asizes, 1024) } });
    vsizes.forEach((n, i) => w.addSample(sample(n, i === 0), i === 0));
    const b = w.finish();
    const top = boxes(b);
    expect(top.map((x) => x.type)).toEqual(['ftyp', 'moov', 'mdat']);
    const mdat = top[2];
    expect(mdat.size).toBe(8 + vsizes.reduce((a, c) => a + c, 0) + asizes.reduce((a, c) => a + c, 0));
    const moovKids = boxes(b, top[1].body, top[1].start + top[1].size).map((x) => x.type);
    expect(moovKids).toEqual(['mvhd', 'trak', 'trak']);
    const mvhd = find(boxes(b, top[1].body, top[1].start + top[1].size), 'mvhd');
    expect(u32(b, mvhd.start + mvhd.size - 4)).toBe(3);                // next_track_ID
    expect(u32(b, mvhd.body + 4 + 20 + 4)).toBe(3 * 3000);            // the movie lasts as long as the video

    const [video, audio] = traks(b);
    expect(dec.decode(b.subarray(inTrak(b, video, 'mdia', 'hdlr').body + 8, inTrak(b, video, 'mdia', 'hdlr').body + 12))).toBe('vide');
    const hdlr = inTrak(b, audio, 'mdia', 'hdlr');
    expect(dec.decode(b.subarray(hdlr.body + 8, hdlr.body + 12))).toBe('soun');
    const tkhd = inTrak(b, audio, 'tkhd');
    expect(u32(b, tkhd.body) & 0xffffff).toBe(3);                      // enabled, in movie
    expect(u32(b, tkhd.body + 4 + 16)).toBe(2);                         // track id
    expect(u16(b, tkhd.body + 48)).toBe(0x0100);                       // volume, after duration, reserved, layer and alternate group
    const mdhd = inTrak(b, audio, 'mdia', 'mdhd');
    expect(u32(b, mdhd.body + 4 + 16)).toBe(48000);
    expect(u32(b, mdhd.body + 4 + 20 + 4)).toBe(5 * 1024);
    expect(boxes(b, inTrak(b, audio, 'mdia', 'minf').body, inTrak(b, audio, 'mdia', 'minf').start + inTrak(b, audio, 'mdia', 'minf').size).map((x) => x.type)).toEqual(['smhd', 'dinf', 'stbl']);

    // The edit list: one entry, the render's length in the movie's timescale,
    // starting the priming into the media, at rate 1.
    const edts = inTrak(b, audio, 'edts');
    const elst = find(boxes(b, edts.body, edts.start + edts.size), 'elst');
    const version = b[elst.body];
    expect(u32(b, elst.body + 4)).toBe(1);
    const at = elst.body + 8;
    const segment = version === 1 ? u32(b, at) * 4294967296 + u32(b, at + 4) : u32(b, at);
    const media = version === 1 ? u32(b, at + 8) * 4294967296 + u32(b, at + 12) : u32(b, at + 4);
    const rate = version === 1 ? u16(b, at + 16) : u16(b, at + 8);
    expect([segment, media, rate]).toEqual([3 * 3000, 2112, 1]);

    const stbl = inTrak(b, audio, 'mdia', 'minf', 'stbl');
    const inner = boxes(b, stbl.body, stbl.start + stbl.size);
    expect(inner.map((x) => x.type)).toEqual(['stsd', 'stts', 'stsc', 'stsz', 'stco']);
    const stts = find(inner, 'stts');
    let total = 0, count = 0;
    for (let i = 0, n = u32(b, stts.body + 4); i < n; i++) { const c = u32(b, stts.body + 8 + 8 * i), d = u32(b, stts.body + 12 + 8 * i); count += c; total += c * d; }
    expect([count, total]).toEqual([5, 5 * 1024]);
    const stsz = find(inner, 'stsz');
    expect(asizes.map((_, i) => u32(b, stsz.body + 12 + 4 * i))).toEqual(asizes);
    const stsc = find(inner, 'stsc');
    expect([u32(b, stsc.body + 4), u32(b, stsc.body + 8), u32(b, stsc.body + 12)]).toEqual([1, 1, 5]);

    const entry = boxes(b, find(inner, 'stsd').body + 8, find(inner, 'stsd').start + find(inner, 'stsd').size)[0];
    expect(entry.type).toBe('mp4a');
    expect(u16(b, entry.body + 16)).toBe(2);                            // channelcount
    expect(u16(b, entry.body + 18)).toBe(16);                           // samplesize
    expect(u32(b, entry.body + 24)).toBe(48000 * 65536);               // samplerate, 16.16
    const esds = boxes(b, entry.body + 28, entry.start + entry.size)[0];
    expect(esds.type).toBe('esds');
    const es = descriptor(b, esds.body + 4);
    expect(es.tag).toBe(3);
    const dcd = descriptor(b, es.body + 3);                             // after ES_ID and the flags byte
    expect(dcd.tag).toBe(4);
    expect([b[dcd.body], b[dcd.body + 1]]).toEqual([0x40, 0x15]);      // MPEG-4 audio, an audio stream
    const dsi = descriptor(b, dcd.body + 13);
    expect(dsi.tag).toBe(5);
    expect(Array.from(b.subarray(dsi.body, dsi.end))).toEqual(Array.from(asc));

    // Video first in mdat, then audio, each one chunk.
    const vOffset = u32(b, find(boxes(b, inTrak(b, video, 'mdia', 'minf', 'stbl').body, inTrak(b, video, 'mdia', 'minf', 'stbl').start + inTrak(b, video, 'mdia', 'minf', 'stbl').size), 'stco').body + 8);
    const aOffset = u32(b, find(inner, 'stco').body + 8);
    expect(vOffset).toBe(mdat.body);
    expect(b[vOffset]).toBe(0x80);
    expect(aOffset).toBe(mdat.body + 300 + 80 + 90);
    expect(b[aOffset]).toBe(0xa0);
    expect(b[aOffset + 6]).toBe(0xa1);
    expect(b[aOffset + 12]).toBe(0xa2);
  });

  it('adds an Opus track with dOps built from the OpusHead (big-endian there, little-endian in the head), stts in 960s, and the edit list from 0 since dOps carries the pre-skip', () => {
    // OpusHead: magic, version 1, 2 channels, pre-skip 312, 48000 Hz, gain -256, family 0.
    const head = new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0x00, 0xff, 0]);
    const w = createMp4({ width: 64, height: 36, fps: 25, codec: 'vp09.00.10.08', description: null,
      audio: { codec: 'opus', description: head, priming: 312, samples: audioSamples([3, 3, 700, 650], 960) } });
    w.addSample(sample(40, true), true);
    w.addSample(sample(20, false), false);
    const b = w.finish();
    const [, audio] = traks(b);
    const stbl = inTrak(b, audio, 'mdia', 'minf', 'stbl');
    const inner = boxes(b, stbl.body, stbl.start + stbl.size);
    const entry = boxes(b, find(inner, 'stsd').body + 8, find(inner, 'stsd').start + find(inner, 'stsd').size)[0];
    expect(entry.type).toBe('Opus');
    expect(u16(b, entry.body + 16)).toBe(2);
    expect(u32(b, entry.body + 24)).toBe(48000 * 65536);
    const dOps = boxes(b, entry.body + 28, entry.start + entry.size)[0];
    expect(dOps.type).toBe('dOps');
    // version 0, 2 channels, pre-skip 0x0138, 48000 as 0x0000bb80, gain 0xff00, family 0
    expect(Array.from(b.subarray(dOps.body, dOps.start + dOps.size))).toEqual([0, 2, 0x01, 0x38, 0, 0, 0xbb, 0x80, 0xff, 0x00, 0]);
    const stts = find(inner, 'stts');
    expect([u32(b, stts.body + 4), u32(b, stts.body + 8), u32(b, stts.body + 12)]).toEqual([1, 4, 960]);
    const edts = inTrak(b, audio, 'edts');
    const elst = find(boxes(b, edts.body, edts.start + edts.size), 'elst');
    const at = elst.body + 8;
    const media = b[elst.body] === 1 ? u32(b, at + 12) : u32(b, at + 4);
    expect(media).toBe(0);
    const mdat = boxes(b)[2];
    expect(b[u32(b, find(inner, 'stco').body + 8)]).toBe(0xa0);
    expect(u32(b, find(inner, 'stco').body + 8)).toBe(mdat.body + 60);
  });

  it('puts the sound past 4 GB in co64 when only the final layout crosses 4 GB, and both offsets land on their samples', () => {
    // The samples' sizes alone: header() lays the file out without their bytes.
    const sized = (n) => ({ length: n });
    const u64 = (b, o) => u32(b, o) * 4294967296 + u32(b, o + 4);
    // Video data that ends just short of 4 GB from the start of mdat's
    // payload, so the sound's offset passes 4 GB only once ftyp and moov
    // come before it.
    for (const short of [0, 100, 600, 2000]) {
      const video = 0xffffffff - 16 - short;
      const w = createMp4({ width: 64, height: 36, fps: 30, codec: 'avc1.640028', description: AVCC,
        audio: { codec: 'mp4a.40.2', description: new Uint8Array([0x11, 0x90]), priming: 2112, samples: [{ bytes: sized(6), duration: 1024 }, { bytes: sized(160), duration: 1024 }] } });
      w.addSample(sized(video), true);
      const b = w.header();
      const top = boxes(b);
      expect(top.map((x) => x.type)).toEqual(['ftyp', 'moov', 'mdat']);
      const payload = top[2].body;                                   // the first byte after mdat's header
      expect(payload).toBe(b.length);
      const [vt, at] = traks(b);
      const vstbl = inTrak(b, vt, 'mdia', 'minf', 'stbl'), astbl = inTrak(b, at, 'mdia', 'minf', 'stbl');
      const vco = boxes(b, vstbl.body, vstbl.start + vstbl.size).find((x) => x.type === 'stco');
      expect(u32(b, vco.body + 8), 'video at ' + short).toBe(payload);
      const aco = boxes(b, astbl.body, astbl.start + astbl.size).find((x) => x.type === 'stco' || x.type === 'co64');
      const offset = aco.type === 'co64' ? u64(b, aco.body + 8) : u32(b, aco.body + 8);
      expect(offset, 'sound at ' + short).toBe(payload + video);
      expect(aco.type, 'box at ' + short).toBe(payload + video > 0xffffffff ? 'co64' : 'stco');
    }
  });

  it('600 s at 59.94, 60000/1001, 23.976 and 24000/1001 fps lasts 600 s in mvhd, mdhd and stts, as the sound encoded for frames / fps does', () => {
    const u64 = (b, o) => u32(b, o) * 4294967296 + u32(b, o + 4);
    for (const fps of [59.94, 60000 / 1001, 23.976, 24000 / 1001]) {
      const w = createMp4({ width: 64, height: 36, fps, codec: 'avc1.640028', description: AVCC });
      const frames = Math.round(600 * fps);
      for (let i = 0; i < frames; i++) w.addSample(sample(1, i === 0), i === 0);
      const b = w.header();
      const moov = boxes(b)[1];
      const mvhd = find(boxes(b, moov.body, moov.start + moov.size), 'mvhd');
      const [vt] = traks(b);
      const mdhd = inTrak(b, vt, 'mdia', 'mdhd');
      const stbl = inTrak(b, vt, 'mdia', 'minf', 'stbl');
      const stts = find(boxes(b, stbl.body, stbl.start + stbl.size), 'stts');
      let n = 0, ticks = 0;
      for (let k = 0, runs = u32(b, stts.body + 4); k < runs; k++) { const c = u32(b, stts.body + 8 + 8 * k), d = u32(b, stts.body + 12 + 8 * k); n += c; ticks += c * d; }
      // Version 1 boxes: creation and modification in 64 bits, then the
      // timescale and a 64-bit duration.
      const scale = u32(b, mdhd.body + 20), seconds = u64(b, mdhd.body + 24) / scale;
      const movie = u64(b, mvhd.body + 24) / u32(b, mvhd.body + 20);
      const truth = frames / fps;
      expect(n, String(fps)).toBe(frames);
      expect(ticks, String(fps)).toBe(u64(b, mdhd.body + 24));
      expect(Math.abs(seconds - truth), fps + ' fps: ' + seconds + ' s against ' + truth).toBeLessThan(1e-3);
      expect(Math.abs(movie - truth), fps + ' fps movie: ' + movie + ' s').toBeLessThan(1e-3);
    }
  });

  it('without audio the file keeps one trak and next_track_ID 2', () => {
    const w = createMp4({ width: 64, height: 36, fps: 30, codec: 'avc1.640028', description: AVCC });
    w.addSample(sample(10, true), true);
    const b = w.finish();
    expect(traks(b).length).toBe(1);
    const mvhd = find(boxes(b, boxes(b)[1].body, boxes(b)[1].start + boxes(b)[1].size), 'mvhd');
    expect(u32(b, mvhd.start + mvhd.size - 4)).toBe(2);
  });

  it('refuses an empty file, an unknown codec, and avc1 without its description (av01 builds its own)', () => {
    expect(() => createMp4({ width: 1, height: 1, fps: 30, codec: 'avc1.640028', description: new Uint8Array(4) }).finish()).toThrow(/no samples/);
    const w = createMp4({ width: 1, height: 1, fps: 30, codec: 'hvc1.1', description: null });
    w.addSample(sample(4, true), true);
    expect(() => w.finish()).toThrow(/unsupported codec/);
    const n = createMp4({ width: 1, height: 1, fps: 30, codec: 'avc1.640028', description: null });
    n.addSample(sample(4, true), true);
    expect(() => n.finish()).toThrow(/avcC/);
  });
});
