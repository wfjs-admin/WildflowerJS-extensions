/**
 * Audio-reactive levels: level(t, band, { clip }) and spectrum(t, bins), read
 * from tables Kinetic builds at readiness from the same decode the render
 * mixes. A 60 Hz tone reads high on 'bass' and near 0 on 'treble', a 5 kHz
 * tone the reverse, silence 0 everywhere; a level falls over about 0.15 s;
 * one clip reads alone by its id; the same file gives the same numbers on
 * two pages; a scene computed that calls level() shows the level once the
 * tables land, with no seek after. KN-137 in development for a read with no
 * audio clip, KN-100 for a bad band, bins or clip.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, tick, tone, wavUrl, captureWarnings, uniqueName, CORE, WF_FILE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

// A composition of `seconds` holding the given <audio> markup, ready.
async function withClips(id, clips, seconds = 2) {
  const { wf } = await load();
  const host = await mount(`<div data-composition-id="${id}" data-start="0" data-duration="${seconds}" data-fps="30">${clips}</div>`);
  cleanup.push(host);
  wf.kinetic.config({});
  await wf.kinetic.ready();
  return { wf, host };
}

describe(`level() and spectrum() (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it("a 60 Hz tone reads high on 'bass' and near 0 on 'treble', and the spectrum leans low", async () => {
    const { wf } = await withClips('al1', `<audio src="${wavUrl(tone(60, 2))}" data-start="0"></audio>`);
    const { level, spectrum } = wf.kinetic;
    expect(level(1, 'bass')).toBeGreaterThan(0.9);
    expect(level(1, 'all')).toBeGreaterThan(0.9);
    expect(level(1, 'treble')).toBeLessThan(0.1);
    expect(level(1, 'mid')).toBeLessThan(0.5);
    const s = spectrum(1, 16);
    expect(s.length).toBe(16);
    expect(s.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(Math.max(...s.slice(0, 4))).toBeGreaterThan(0.9);
    expect(Math.max(...s.slice(12))).toBeLessThan(0.1);
  });

  it("a 5 kHz tone reads high on 'treble' and near 0 on 'bass'", async () => {
    const { wf } = await withClips('al2', `<audio src="${wavUrl(tone(5000, 2))}" data-start="0"></audio>`);
    const { level, spectrum } = wf.kinetic;
    expect(level(1, 'treble')).toBeGreaterThan(0.9);
    expect(level(1, 'bass')).toBeLessThan(0.1);
    const s = spectrum(1, 8);
    expect(s.indexOf(Math.max(...s))).toBeGreaterThanOrEqual(5);
  });

  it('silence reads 0 in every band and every bin, and outside the composition too', async () => {
    const { wf } = await withClips('al3', `<audio src="${wavUrl(new Float32Array(96000))}" data-start="0"></audio>`);
    const { level, spectrum } = wf.kinetic;
    for (const band of ['bass', 'mid', 'treble', 'all']) for (const t of [0, 0.5, 1.5]) expect(level(t, band)).toBe(0);
    expect(spectrum(1, 64)).toEqual(new Array(64).fill(0));
    expect(level(-1, 'all')).toBe(0);
    expect(level(30, 'all')).toBe(0);
  });

  it('a level falls over about 0.15 s after the sound stops, and data-start, data-media-start and data-volume move it as they move the sound', async () => {
    // One second of tone, then silence; and the same tone placed at 1 s, trimmed and quiet.
    const { wf } = await withClips('al4', `<audio id="first" src="${wavUrl(tone(200, 1))}" data-start="0"></audio>
      <audio id="second" src="${wavUrl(tone(200, 1.5))}" data-start="1.6" data-media-start="0.5" data-volume="0.25"></audio>`, 3);
    const { level } = wf.kinetic;
    expect(level(0.5, 'all', { clip: 'first' })).toBeGreaterThan(0.9);
    const falling = level(1.1, 'all', { clip: 'first' });
    expect(falling).toBeGreaterThan(0.1);
    expect(falling).toBeLessThan(0.9);
    expect(level(1.3, 'all', { clip: 'first' })).toBe(0);
    // The second clip is silent before 1.6 s and plays 1 s of tone from there.
    expect(level(1.4, 'all', { clip: 'second' })).toBe(0);
    expect(level(2.1, 'all', { clip: 'second' })).toBeGreaterThan(0.9);
    // In the mix the quiet clip reads below the loud one: 0.25 is -12 dB.
    expect(level(2.1, 'all')).toBeLessThan(level(0.5, 'all'));
    expect(level(2.1, 'all')).toBeGreaterThan(0.5);
  });

  it('one clip alone, by its id: the bass of one clip and the treble of the other', async () => {
    const { wf } = await withClips('al5', `<audio id="low" src="${wavUrl(tone(60, 2))}" data-start="0"></audio><audio id="high" src="${wavUrl(tone(5000, 2))}" data-start="0"></audio>`);
    const { level } = wf.kinetic;
    expect(level(1, 'bass', { clip: 'low' })).toBeGreaterThan(0.9);
    expect(level(1, 'treble', { clip: 'low' })).toBeLessThan(0.1);
    expect(level(1, 'treble', { clip: 'high' })).toBeGreaterThan(0.9);
    expect(level(1, 'bass', { clip: 'high' })).toBeLessThan(0.1);
    expect(level(1, 'bass')).toBeGreaterThan(0.9);
    expect(level(1, 'treble')).toBeGreaterThan(0.9);
  });

  it('an <audio> whose file is a <source> child decodes, and reads its level', async () => {
    const { wf } = await withClips('al5d', `<audio id="src1" data-start="0"><source src="${wavUrl(tone(60, 2))}" type="audio/wav"></audio>`);
    expect(wf.kinetic.level(1, 'bass', { clip: 'src1' })).toBeGreaterThan(0.9);
  });

  it('a DC offset reads as nothing: a tone plus an offset reads as the tone alone', async () => {
    const s = tone(5000, 2);
    for (let i = 0; i < s.length; i++) s[i] = (i < 48000 ? s[i] : 0) + 0.05;
    const { wf } = await withClips('al5c', `<audio src="${wavUrl(s)}" data-start="0"></audio>`);
    const { level, spectrum } = wf.kinetic;
    expect(level(0.5, 'treble')).toBeGreaterThan(0.9);
    expect(level(0.5, 'bass')).toBeLessThan(0.1);
    expect(Math.max(...spectrum(0.5, 64).slice(0, 4))).toBeLessThan(0.1);
    for (const band of ['bass', 'mid', 'treble', 'all']) expect(level(1.5, band), band).toBe(0);
    expect(spectrum(1.5, 64)).toEqual(new Array(64).fill(0));
  });

  it('a ready() overtaken by a newer ready() resolves with tables that cover its own clips', async () => {
    const { wf, host } = await withClips('al5b', `<audio id="a" src="${wavUrl(tone(60, 6))}" data-start="0"></audio>`, 6);
    const root = host.querySelector('[data-composition-id]') || host;
    const add = (id, hz) => { const el = document.createElement('audio'); el.id = id; el.src = wavUrl(tone(hz, 6)); el.setAttribute('data-start', '0'); root.appendChild(el); return el.src; };
    const bUrl = add('b', 60);
    // c arrives, and a second ready() is made, once the first run has read
    // the page (its fetch of b's file).
    let p2 = null;
    const realFetch = window.fetch;
    window.fetch = (...a) => {
      if (!p2 && String(a[0]) === bUrl) { add('c', 5000); p2 = wf.kinetic.ready(); }
      return realFetch.apply(window, a);
    };
    let atFirst = null;
    try {
      await wf.kinetic.ready().then(() => {
        try { atFirst = wf.kinetic.level(1, 'all', { clip: 'b' }); } catch (e) { atFirst = e.message; }
      });
      await p2;
    } finally { window.fetch = realFetch; }
    expect(atFirst).toBeGreaterThan(0.9);
    expect(wf.kinetic.level(1, 'treble', { clip: 'c' })).toBeGreaterThan(0.9);
  });

  it('a decoded file no clip uses any more is let go: kept while a clip uses it, fetched again once one does after a load without it', async () => {
    const a = wavUrl(tone(60, 2)), b = wavUrl(tone(5000, 2));
    const { wf, host } = await withClips('al5c', `<audio id="x" src="${a}" data-start="0"></audio>`);
    const el = host.querySelector('#x');
    const realFetch = window.fetch;
    const fetched = [];
    window.fetch = (...args) => { fetched.push(String(args[0])); return realFetch.apply(window, args); };
    try {
      await wf.kinetic.ready();
      expect(fetched.filter((u) => u === a).length).toBe(0);   // still in use: kept
      el.src = b;
      await wf.kinetic.ready();
      el.src = a;
      await wf.kinetic.ready();
    } finally { window.fetch = realFetch; }
    expect(fetched.filter((u) => u === a).length).toBe(1);
    expect(wf.kinetic.level(1, 'bass')).toBeGreaterThan(0.9);
  });

  it('the same file gives the same numbers on two pages', async () => {
    const samples = tone(90, 2, 0.4);
    for (let i = 0; i < samples.length; i++) samples[i] += 0.2 * Math.sin(2 * Math.PI * 3100 * i / 48000) * (i % 9600 < 4800 ? 1 : 0);
    const url = wavUrl(samples);
    const read = async () => {
      const frame = document.createElement('iframe');
      frame.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:100px;border:0;opacity:0;pointer-events:none';
      frame.srcdoc = '<!doctype html><html><body><div data-composition-id="al6" data-start="0" data-duration="2" data-fps="30"><audio src="' + url + '" data-start="0"></audio></div>'
        + '<script src="' + CORE + '"><\/script><script src="' + WF_FILE + '"><\/script>'
        + '<script>wildflower.kinetic.config({ autoplay: false }); window.__done = wildflower.kinetic.ready().then(() => { const k = wildflower.kinetic, out = []; for (let f = 0; f < 60; f++) out.push(k.level(f / 30, "bass"), k.level(f / 30, "treble"), k.level(f / 30, "all"), ...k.spectrum(f / 30, 12)); return out; });<\/script></body></html>';
      const loaded = new Promise((r) => { frame.onload = r; });
      document.body.appendChild(frame);
      cleanup.push(frame);
      await loaded;
      return frame.contentWindow.__done;
    };
    const one = await read(), two = await read();
    expect(one.length).toBe(60 * 15);
    expect(one.some((v) => v > 0.5)).toBe(true);
    expect(two).toEqual(one);
  });

  it('a scene computed that calls level() shows the level once the tables land, with no seek after', async () => {
    const { wf } = await load();
    const name = uniqueName('meter');
    const { level } = wf.kinetic;
    wf.kinetic.scene(name, { computed: { bass() { return level(this.time, 'bass').toFixed(2); } } });
    const host = await mount(`<div data-composition-id="al7" data-start="0" data-duration="2" data-fps="30">
      <audio src="${wavUrl(tone(60, 2))}" data-start="0"></audio>
      <div data-component="${name}" data-start="0" data-duration="2"><b data-bind="bass"></b></div>
    </div>`);
    cleanup.push(host);
    wf.kinetic.config({});
    wf.kinetic.seek(1);
    await tick(10);
    await wf.kinetic.ready();
    await tick(10);
    expect(Number(host.querySelector('b').textContent)).toBeGreaterThan(0.9);
  });

  it.runIf(BUILD === 'dev')('an audio clip whose data-start names no element starts at 0, with KN-113 in development', async () => {
    let lines;
    const { wf } = await load();
    lines = await captureWarnings(async () => { await withClips('al10', `<audio id="sting" src="${wavUrl(tone(60, 0.5))}" data-start="intor - 0.3"></audio>`, 2); });
    const hits = lines.filter((l) => l.startsWith('[KN-113]'));
    expect(hits.length).toBe(1);
    expect(hits[0]).toMatch(/audio#sting/);
    expect(hits[0]).toMatch(/'intor'/);
    expect(wf.kinetic.level(0.25, 'all')).toBeGreaterThan(0.5);
  });

  it('bad arguments are KN-100; a read with no audio clip is 0, with KN-137 once in development', async () => {
    let wf, values;
    // From the mount on: a scene of the test before may still read level()
    // as the tables change, and the warning is printed once.
    const lines = await captureWarnings(async () => {
      ({ wf } = await withClips('al8', '', 2));
      const { level, spectrum } = wf.kinetic;
      values = [level(1, 'bass'), level(1.5, 'all'), spectrum(1, 4)];
    });
    const { level, spectrum } = wf.kinetic;
    expect(values).toEqual([0, 0, [0, 0, 0, 0]]);
    expect(lines.filter((l) => l.startsWith('[KN-137]')).length).toBe(BUILD === 'dev' ? 1 : 0);
    expect(() => level(1, 'loud')).toThrow(/KN-100/);
    expect(() => level('1', 'bass')).toThrow(/KN-100/);
    expect(() => spectrum(1, 0)).toThrow(/KN-100/);
    expect(() => spectrum(1, 65)).toThrow(/KN-100/);
    expect(() => spectrum(1, 2.5)).toThrow(/KN-100/);
    cleanup.splice(0).forEach((el) => el.remove());
    const { wf: w2 } = await withClips('al9', `<audio id="music" src="${wavUrl(tone(60, 1))}" data-start="0"></audio>`);
    expect(() => w2.kinetic.level(0.5, 'bass', { clip: 'drums' })).toThrow(/KN-100/);
    expect(() => w2.kinetic.level(0.5, 'bass', { clip: 3 })).toThrow(/KN-100/);
  });
});
