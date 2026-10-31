/**
 * The animated images the suite decodes with animatedImage(), committed
 * beside this script. Each frame is one flat colour that gives its number:
 * 0 red, 1 green, 2 blue, 3 yellow, so a frame read back from a canvas or a
 * rendered file says which one it is.
 *
 *   frames.gif   40x20, four frames of 100, 300, 200 and 400 ms (uneven),
 *                looping; FFmpeg
 *   frames.png   40x20 APNG, three frames of 200, 100 and 300 ms, looping;
 *                FFmpeg
 *   frames.webp  40x20, four frames of 150, 50, 300 and 500 ms (uneven),
 *                looping, lossless. This FFmpeg has no WebP encoder, so each
 *                frame is a one-colour VP8L bitstream written here (its five
 *                prefix codes each have one symbol, so the pixels take no
 *                bits), in the animated WebP container (VP8X, ANIM, ANMF).
 *   once.gif     40x20, two frames of 100 ms, played once (no loop
 *                extension: ImageDecoder's repetitionCount 0)
 *   twice.gif    the same, played twice (a loop count of 1: repetitionCount 1)
 *   short.gif    40x20, looping, frames of 10, 190 and 0 ms, which browsers
 *                play as 100, 190 and 100 ms
 *
 *   node packages/kinetic/test/fixtures/make-images.cjs
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const W = 40, H = 20;
const COLOURS = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
const NAMES = ['red', 'lime', 'blue', 'yellow'];

// Frames of one colour each for `ms`, joined, with every repeated frame
// dropped, so each colour is one frame whose delay is its length.
function ffmpegFrames(ms) {
  const parts = ms.map((d, i) => 'color=c=' + NAMES[i] + ':s=' + W + 'x' + H + ':r=100:d=' + d / 1000 + '[f' + i + ']');
  return parts.join(';') + ';' + ms.map((_, i) => '[f' + i + ']').join('') + 'concat=n=' + ms.length + ',mpdecimate=hi=1:lo=1:frac=0';
}

// A GIF of `ms` frames; `loop` is the GIF muxer's: 0 forever, -1 once, n
// that many times more. The last frame's delay is `last` ms.
function gif(name, ms, loop, last = ms[ms.length - 1]) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', ffmpegFrames(ms) + ',format=rgb8',
    '-fps_mode', 'vfr', '-loop', String(loop), '-final_delay', String(last / 10), path.join(DIR, name)], { stdio: 'inherit' });
}

function apng() {
  const ms = [200, 100, 300];
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', ffmpegFrames(ms) + ',format=rgb24',
    '-fps_mode', 'vfr', '-f', 'apng', '-plays', '0', '-final_delay', String(ms[ms.length - 1] / 1000), path.join(DIR, 'frames.png')], { stdio: 'inherit' });
}

// A lossless VP8L bitstream of one opaque colour: the header, no transform,
// no colour cache, no meta prefix codes, then the five prefix codes (green,
// red, blue, alpha, distance), each a simple code of one symbol.
function vp8l([r, g, b]) {
  const bits = [];
  const put = (v, n) => { for (let i = 0; i < n; i++) bits.push((v >> i) & 1); };
  put(W - 1, 14); put(H - 1, 14); put(0, 1); put(0, 3);
  put(0, 1); put(0, 1); put(0, 1);
  for (const s of [g, r, b, 255]) { put(1, 1); put(0, 1); put(1, 1); put(s, 8); }
  put(1, 1); put(0, 1); put(0, 1); put(0, 1);
  const out = [0x2f];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8 && i + j < bits.length; j++) byte |= bits[i + j] << j;
    out.push(byte);
  }
  return Buffer.from(out);
}

const u24 = (v) => Buffer.from([v & 255, (v >> 8) & 255, (v >> 16) & 255]);
function chunk(id, payload) {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(payload.length);
  return Buffer.concat([Buffer.from(id, 'ascii'), size, payload, payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function webp() {
  const ms = [150, 50, 300, 500];
  const vp8x = Buffer.concat([Buffer.from([0x02, 0, 0, 0]), u24(W - 1), u24(H - 1)]);   // the animation flag
  const anim = Buffer.from([0, 0, 0, 0, 0, 0]);                                           // background, loop forever
  const frames = ms.map((d, i) => chunk('ANMF', Buffer.concat([u24(0), u24(0), u24(W - 1), u24(H - 1), u24(d), Buffer.from([0x02]), chunk('VP8L', vp8l(COLOURS[i]))])));
  const body = Buffer.concat([Buffer.from('WEBP', 'ascii'), chunk('VP8X', vp8x), chunk('ANIM', anim), ...frames]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  fs.writeFileSync(path.join(DIR, 'frames.webp'), Buffer.concat([Buffer.from('RIFF', 'ascii'), size, body]));
}

gif('frames.gif', [100, 300, 200, 400], 0);
gif('once.gif', [100, 100], -1);
gif('twice.gif', [100, 100], 1);
gif('short.gif', [10, 200, 10], 0, 0);
apng();
webp();
console.log('frames.gif, once.gif, twice.gif, short.gif, frames.png and frames.webp -> ' + DIR);
