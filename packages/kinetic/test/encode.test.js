/**
 * config({ encode }): the encoder's settings a piece carries, the default for
 * every render(), the preview bar's Render button's too. Reported by config(),
 * cleared by false or null, checked as render()'s own options are (KN-100,
 * naming the field under encode), a field render() is given still wins, and
 * the default bitrate is 16 Mbps. What the encoders were configured with is
 * read from their configure() calls.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, wavUrl, tone, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
const restores = [];
afterEach(async () => {
  for (const f of restores.splice(0)) f();
  const { wf } = await load();
  wf.kinetic.config({ encode: false });
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

// Records what each VideoEncoder and AudioEncoder is configured with.
function spyConfigure() {
  const seen = { video: [], audio: [] };
  for (const [E, list] of [[window.VideoEncoder, seen.video], [window.AudioEncoder, seen.audio]]) {
    if (typeof E !== 'function') continue;
    const real = E.prototype.configure;
    E.prototype.configure = function (c) { list.push(c); return real.call(this, c); };
    restores.push(() => { E.prototype.configure = real; });
  }
  return seen;
}

// A 0.5 s, 64 by 36 composition drawn on a canvas, with a tone when `sound`.
async function small(id, sound = false) {
  const { wf } = await load();
  const name = uniqueName('fill');
  wf.kinetic.scene(name, { seek() { const g = this.element.querySelector('canvas').getContext('2d'); g.fillStyle = '#3050c0'; g.fillRect(0, 0, 64, 36); } });
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="0.5" data-width="64" data-height="36" data-fps="10">
    ${sound ? `<audio src="${wavUrl(tone(440, 0.5, 0.3), 48000)}" data-start="0"></audio>` : ''}
    <div data-component="${name}" data-start="0" data-duration="0.5"><canvas width="64" height="36"></canvas></div>
  </div>`);
  cleanup.push(host);
  await wf.kinetic.ready();
  return { wf, canvas: host.querySelector('canvas') };
}

describe(`config({ encode }) (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('is reported as set, false when none is, and false or null clears it', async () => {
    const { wf } = await load();
    expect(wf.kinetic.config().encode).toBe(false);
    expect(wf.kinetic.config({ encode: { bitrate: 20e6 } }).encode).toEqual({ bitrate: 20e6 });
    expect(wf.kinetic.config({ encode: { codec: 'avc1.640028', audioBitrate: 256000 } }).encode).toEqual({ codec: 'avc1.640028', audioBitrate: 256000 });
    expect(wf.kinetic.config({ encode: null }).encode).toBe(false);
    wf.kinetic.config({ encode: { bitrate: 20e6 } });
    expect(wf.kinetic.config({ encode: false }).encode).toBe(false);
  });

  it('KN-100 for an unknown field or a bad value, naming the field under encode, and applies nothing', async () => {
    const { wf } = await load();
    wf.kinetic.config({ encode: { bitrate: 12e6 } });
    expectKN(() => wf.kinetic.config({ encode: { quality: 5 } }), 'KN-100', 'config({ encode: { quality } })', /^'quality' is not a field of encode; the fields are codec, bitrate, audioCodec and audioBitrate/);
    expectKN(() => wf.kinetic.config({ encode: { bitrate: -1 } }), 'KN-100', 'config({ encode: { bitrate } })', 'bitrate is bits per second, a number above 0 such as 16e6, not -1');
    expectKN(() => wf.kinetic.config({ encode: { codec: 'h264' } }), 'KN-100', 'config({ encode: { codec } })', /^an avc1, av01 or vp09 codec string/);
    expectKN(() => wf.kinetic.config({ encode: { audioCodec: 'mp3' } }), 'KN-100', 'config({ encode: { audioCodec } })', /^audioCodec is 'mp4a\.40\.2'/);
    expectKN(() => wf.kinetic.config({ encode: 20e6 }), 'KN-100', 'config({ encode })', /^encode is \{ codec, bitrate, audioCodec, audioBitrate \}/);
    expectKN(() => wf.kinetic.config({ fps: 50, encode: { bitrate: 0 } }), 'KN-100', 'config({ encode: { bitrate } })');
    expect(wf.kinetic.config().encode).toEqual({ bitrate: 12e6 });
    expect(wf.kinetic.config().fps).toBe(30);
  });

  it('render() encodes at 16 Mbps by default, at the bitrate config({ encode }) sets, and at its own when given one', async ({ skip }) => {
    if (typeof window.VideoEncoder !== 'function') skip();
    const { wf, canvas } = await small('en1');
    const seen = spyConfigure();
    await wf.kinetic.render({ source: canvas, download: false });
    wf.kinetic.config({ encode: { bitrate: 3e6 } });
    await wf.kinetic.render({ source: canvas, download: false });
    await wf.kinetic.render({ source: canvas, download: false, bitrate: 2e6 });
    expect(seen.video.map((c) => c.bitrate)).toEqual([16e6, 3e6, 2e6]);
  });

  it('render() takes the codec and the sound\'s bitrate from config({ encode })', async ({ skip }) => {
    if (typeof window.VideoEncoder !== 'function' || typeof window.AudioEncoder !== 'function') skip();
    const vp9 = 'vp09.00.10.08';
    if (!(await VideoEncoder.isConfigSupported({ codec: vp9, width: 64, height: 36 })).supported) skip();
    const { wf, canvas } = await small('en2', true);
    const seen = spyConfigure();
    wf.kinetic.config({ encode: { codec: vp9, audioBitrate: 96000 } });
    const r = await wf.kinetic.render({ source: canvas, download: false });
    expect(r.codec).toBe(vp9);
    expect(seen.video[0].codec).toBe(vp9);
    expect(seen.audio.map((c) => c.bitrate)).toContain(96000);
  });
});
