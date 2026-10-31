/**
 * With the HyperFrames runtime on the page (the pinned IIFE in
 * tools/hyperframes, loaded first as audio-runtime.test.js loads it), the
 * runtime owns media and Kinetic leaves every footage clip alone: no seek,
 * no play() or pause(), no playbackRate and no muting from its file, for a
 * clip in the page at load, one added after load, and one whose src changed,
 * through ready(), seeks, play and pause. KN-139 still prints in
 * development, since it describes the markup.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadScript, tick, CORE, WF_FILE, RUNTIME_FILE, FOOTAGE, BUILD, CORE_TIER } from './helpers.js';

// Whether the direct caller of a wrapper below is Kinetic's file: the
// stack's first line with a URL is this function, the second the wrapper,
// the third its caller.
const calledByKinetic = () => /kinetic\.wf/.test((new Error().stack || '').split('\n').filter((l) => /(https?|blob):/.test(l))[2] || '');
const touched = [];
const proto = HTMLMediaElement.prototype;
for (const key of ['currentTime', 'muted', 'playbackRate']) {
  const d = Object.getOwnPropertyDescriptor(proto, key);
  Object.defineProperty(proto, key, Object.assign({}, d, {
    set(v) { if (calledByKinetic()) touched.push((this.id || this.localName) + '.' + key + ' = ' + v); return d.set.call(this, v); },
  }));
}
for (const key of ['play', 'pause', 'load']) {
  const f = proto[key];
  proto[key] = function (...a) { if (calledByKinetic()) touched.push((this.id || this.localName) + '.' + key + '()'); return f.apply(this, a); };
}
const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.map(String).join(' ')); return realWarn.apply(console, a); };

const BOX = 'style="position:absolute;left:0;top:0;width:160px;height:90px"';
let wf, root, available = true;

beforeAll(async () => {
  const host = document.createElement('div');
  host.innerHTML = `<div id="stage" data-composition-id="main" data-no-timeline data-start="0" data-duration="3" data-fps="30" data-width="160" data-height="90" style="position:relative;width:160px;height:90px">
    <video id="atload" src="${FOOTAGE}f30.webm" data-start="0" data-duration="3" data-media-start="0.5" data-playback-rate="2" playsinline ${BOX}></video>
  </div>`;
  document.body.appendChild(host);
  root = host.firstElementChild;
  try { await loadScript(RUNTIME_FILE); } catch (_) { available = false; return; }
  await loadScript(CORE);
  await loadScript(WF_FILE);
  wf = window.wildflower;
  for (let i = 0; i < 600 && !window.__player; i++) await tick(16);
  await tick(0);
}, 20000);

// ready(), a few seeks, a short play and a pause.
async function drive() {
  await wf.kinetic.ready();
  for (const t of [1, 0.5, 2.2]) { wf.kinetic.seek(t); await tick(60); }
  wf.kinetic.play();
  await tick(400);
  wf.kinetic.pause();
  await tick(100);
}

describe(`footage with the HyperFrames runtime (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('the runtime is on the page', () => {
    expect(available).toBe(true);
    expect(window.__player).toBeTruthy();
  });

  it('a clip in the page at load is left alone', async () => {
    await drive();
    expect(touched).toEqual([]);
  });

  it('a clip added after load, then ready(), is left alone', async () => {
    const v = document.createElement('video');
    v.id = 'late';
    v.setAttribute('src', FOOTAGE + 'f24.webm');
    v.setAttribute('data-start', '0.5');
    v.setAttribute('muted', '');
    root.appendChild(v);
    await drive();
    expect(touched).toEqual([]);
  });

  it('a clip whose src changed after load, then ready(), is left alone', async () => {
    document.getElementById('atload').setAttribute('src', FOOTAGE + 'f24.webm');
    await drive();
    expect(touched).toEqual([]);
  });

  it('KN-139 still prints in development: the clip has neither muted nor data-has-audio', () => {
    const kn = warnings.filter((l) => l.startsWith('[KN-139]') && l.includes('video#atload'));
    expect(kn.length).toBe(BUILD === 'dev' ? 1 : 0);
  });
});
