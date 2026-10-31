/**
 * The footage the suite seeks, plays, checks and renders, generated with
 * FFmpeg and committed beside this script:
 *
 *   f30.webm         VP9 and Opus, 30 fps, a keyframe every 60 frames
 *   f24.webm         VP9 and Opus, 24 fps, a keyframe every 48 frames
 *   f30-silent.webm  VP9 with no sound track, 30 fps
 *   f30.mp4          H.264 and AAC, 30 fps, a keyframe every 60 frames, for
 *                    the render suite (Playwright's Chromium has no H.264)
 *   f2997.mp4        H.264, 29.97 fps (30000/1001), no sound, for the render
 *                    suite: footage whose frames fall between a 30 fps
 *                    composition's
 *   f60.mp4          H.264, 60 fps, a keyframe every 60 frames, no sound, for
 *                    the render suite: two source frames to each frame of a
 *                    30 fps composition, which a 360-degree shutter blends
 *
 * Each is 160x90 and 4 s long. Every frame shows its own number as ten
 * vertical stripes, bit i in stripe i from the left, white for 1 and black
 * for 0, so a frame read back from the element, or from a rendered file,
 * says which source frame it is. The sound is a 10 ms beep of 1 kHz at
 * every whole second.
 *
 *   node packages/kinetic/test/fixtures/make-footage.cjs            # every file
 *   node packages/kinetic/test/fixtures/make-footage.cjs f2997.mp4  # one file
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const DIR = __dirname;
const SECONDS = 4;

// The commas inside the expressions are escaped for the filtergraph parser.
const picture = (fps) => "color=black:s=160x90:r=" + fps + ":d=" + SECONDS
  + ",format=gray,geq=lum='if(bitand(N\\,pow(2\\,floor(X*10/W)))\\,235\\,16)',format=yuv420p";
const sound = "aevalsrc='if(lt(mod(t\\,1)\\,0.01)\\,0.5*sin(2*PI*1000*t)\\,0)':s=48000:d=" + SECONDS;

const VP9 = ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1'];
const OPUS = ['-c:a', 'libopus', '-b:a', '32k'];
const ONLY = process.argv[2];

function make(name, fps, keyEvery, codec, withSound) {
  if (ONLY && name !== ONLY) return;
  const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', picture(fps)];
  if (withSound) args.push('-f', 'lavfi', '-i', sound);
  args.push(...codec.video, '-g', String(keyEvery), '-keyint_min', String(keyEvery));
  if (withSound) args.push(...codec.audio);
  args.push(...(codec.extra || []), '-t', String(SECONDS), path.join(DIR, name));
  execFileSync('ffmpeg', args, { stdio: 'inherit' });
}

const webm = { video: VP9, audio: OPUS };
const mp4 = {
  video: ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-sc_threshold', '0'],
  audio: ['-c:a', 'aac', '-b:a', '64k'],
  extra: ['-movflags', '+faststart'],
};

make('f30.webm', 30, 60, webm, true);
make('f24.webm', 24, 48, webm, true);
make('f30-silent.webm', 30, 60, webm, false);
make('f30.mp4', 30, 60, mp4, true);
make('f2997.mp4', '30000/1001', 60, mp4, false);
make('f60.mp4', 60, 60, mp4, false);
