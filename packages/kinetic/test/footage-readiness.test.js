/**
 * Readiness waits for each footage clip's metadata and first frame. A clip
 * whose file fails is KN-138: a console error on every build, ready()
 * rejects with it, the entry registered for the runtime is held open, the
 * root gets data-kinetic-ready="failed" so the page shows, and check()
 * reports ready: 'failed'. The message gives the clip and its src, and in
 * the development build the cause: an HTTP status, a format the browser
 * cannot play, a server that cannot be reached, or a file on another origin
 * that is missing or unplayable, with no CORS advice, since a <video> needs
 * none to play. A src that is no URL fails too, and does not hang
 * readiness. A video with no sound track and data-has-audio is KN-135, whose
 * development message says the file has no sound track; a 404 on a clip
 * with data-has-audio is KN-138, the picture
 * first. preload="none" is loaded all the same, a clip's sound is read from
 * its <source> children, and when ready() resolves each clip is on its
 * frame. Each case loads its own page in a frame, since a page keeps its
 * first failure.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { tick, framedPage, expectKN, FOOTAGE, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(() => { for (const el of cleanup.splice(0)) el.remove(); });

const page = (clip, onReady) => framedPage(`<div data-composition-id="fr" data-start="0" data-duration="2" data-fps="30" data-width="160" data-height="90">${clip}</div>`, cleanup, onReady);

// The test server under another loopback name, which is another origin: the
// first of [::1], 127.0.0.1 and localhost that answers and is not the page's
// own (the server can listen on one address family only), or null.
async function otherOrigin() {
  for (const host of ['[::1]', '127.0.0.1', 'localhost']) {
    const origin = location.protocol + '//' + host + ':' + location.port;
    if (origin === location.origin) continue;
    try { await fetch(origin + FOOTAGE + 'f30.webm', { mode: 'no-cors' }); return origin; } catch (_) { /* not listening there */ }
  }
  return null;
}

// The clip and its src are the where on every build; the cause is the
// development build's sentence, which `detail` matches.
async function expectFailed(p, code, where, detail) {
  const { w, result } = p;
  expectKN(result, code, where, detail);
  // Printed once, with console.error, on every build.
  expect(w.__errors.filter((l) => l.startsWith('[' + code + ']'))).toEqual([result.message]);
  expect(w.document.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready')).toBe('failed');
  const held = await Promise.race([w.__hf.buildReady.kinetic.then(() => 'resolved'), tick(100).then(() => 'pending')]);
  expect(held).toBe('pending');
}

describe(`a footage clip that fails (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('a 404 is KN-138 with the clip, its src and the status, and ready() rejects with it', async () => {
    const p = await page(`<video id="gone" src="${FOOTAGE}no-such-file.webm" data-start="0" muted></video>`);
    await expectFailed(p, 'KN-138', 'the footage clip video#gone (' + FOOTAGE + 'no-such-file.webm)', /404/);
  });

  it('a file this browser cannot play is KN-138 with the formats Chrome plays', async () => {
    const p = await page(`<video id="text" src="${FOOTAGE}make-footage.cjs" data-start="0" muted></video>`);
    await expectFailed(p, 'KN-138', 'the footage clip video#text (' + FOOTAGE + 'make-footage.cjs)', /H\.264, VP9 and AV1/);
  });

  it('a server that cannot be reached is KN-138 saying so, with no CORS advice, which a <video> does not need', async () => {
    const p = await page('<video id="far" src="http://127.0.0.1:9/far.webm" data-start="0" muted></video>');
    await expectFailed(p, 'KN-138', 'the footage clip video#far (http://127.0.0.1:9/far.webm)', /could not be reached/);
    expect(p.result.message).not.toMatch(/CORS/);
  });

  it('a file missing on another origin that answers is KN-138 saying it is missing or unplayable, with no CORS advice', async () => {
    const other = await otherOrigin();
    expect(other, 'the test server answers under another loopback name').not.toBeNull();
    const p = await page(`<video id="away" src="${other}${FOOTAGE}no-such-file.webm" data-start="0" muted></video>`);
    await expectFailed(p, 'KN-138', 'the footage clip video#away (' + other + FOOTAGE + 'no-such-file.webm)', /missing/);
    expect(p.result.message).not.toMatch(/CORS/);
  });

  it('a src that is no URL is KN-138, and readiness does not hang on it', async () => {
    const p = await page('<video id="nourl" src="https://" data-start="0" muted></video>');
    await expectFailed(p, 'KN-138', 'the footage clip video#nourl (https://)', /could not be loaded/);
  });

  it('two missing videos and two missing audio files print four lines, each clip once, and ready() rejects with a video\'s', async () => {
    const p = await page(`<video id="v1" src="${FOOTAGE}missing-v1.webm" data-start="0" muted></video><video id="v2" src="${FOOTAGE}missing-v2.webm" data-start="0" muted></video>`
      + `<audio id="a1" src="${FOOTAGE}missing-a1.wav" data-start="0"></audio><audio id="a2" src="${FOOTAGE}missing-a2.wav" data-start="0"></audio>`);
    expect(p.result && p.result.code).toBe('KN-138');
    await tick(100);
    const lines = p.w.__errors.filter((l) => /^\[KN-13[58]\]/.test(l));
    expect(lines.length, lines.join('\n')).toBe(4);
    for (const id of ['video#v1', 'video#v2', 'audio#a1', 'audio#a2']) expect(lines.filter((l) => l.includes(id)).length, id).toBe(1);
  });

  it('a revoked blob: URL is KN-138 saying so, with no server advice', async () => {
    const url = URL.createObjectURL(new Blob(['not a video'], { type: 'video/webm' }));
    URL.revokeObjectURL(url);
    const p = await page(`<video id="revoked" src="${url}" data-start="0" muted></video>`);
    await expectFailed(p, 'KN-138', 'the footage clip video#revoked (' + url + ')', /revoked/);
    expect(p.result.message).not.toMatch(/server/);
  });

  it('a cause-finding request that stalls still gives KN-138 within a few seconds', async () => {
    const t0 = performance.now();
    const p = await framedPage(`<div data-composition-id="fr" data-start="0" data-duration="2" data-fps="30" data-width="160" data-height="90"><video id="stall" src="${FOOTAGE}no-such-file.webm" data-start="0" muted></video></div>`,
      cleanup, '', '<script>window.fetch = () => new Promise(() => {});<\/script>');
    expect(performance.now() - t0).toBeLessThan(8000);
    await expectFailed(p, 'KN-138', 'the footage clip video#stall (' + FOOTAGE + 'no-such-file.webm)', /could not be loaded/);
  });

  it('a clip with no src and no <source> is KN-138', async () => {
    const p = await page('<video id="empty" data-start="0" muted></video>');
    await expectFailed(p, 'KN-138', 'the footage clip video#empty', /no src/);
  });

  it('a clip whose every <source> fails is KN-138, with the cause from its first source', async () => {
    const p = await page(`<video id="sources" data-start="0" muted><source src="${FOOTAGE}nope-1.webm" type="video/webm"><source src="${FOOTAGE}nope-2.webm"></video>`);
    await expectFailed(p, 'KN-138', 'the footage clip video#sources (' + FOOTAGE + 'nope-1.webm ' + FOOTAGE + 'nope-2.webm)', /HTTP 404/);
  });

  it('a 404 on a clip with data-has-audio is KN-138 every time, the picture before its sound', async () => {
    for (let i = 0; i < 3; i++) {
      const p = await page(`<video id="gone" src="${FOOTAGE}no-such-file.webm" data-start="0" data-has-audio="true"></video>`);
      expect(p.result && p.result.code, 'run ' + i + ': ' + String(p.result && p.result.message || p.result)).toBe('KN-138');
      cleanup.splice(0).forEach((f) => f.remove());
    }
  });

  it("check() reports ready: 'failed'", async () => {
    const p = await page(`<video id="gone" src="${FOOTAGE}no-such-file.webm" data-start="0" muted></video>`);
    const r = await p.kinetic.check({ samples: 4 });
    expect(r.ok).toBe(false);
    expect(r.ready).toBe('failed');
    expect(r.reason).toBe('readiness failed');
  });

  it('a video with no sound track and data-has-audio is KN-135, which says the file has no sound track and suggests muted', async () => {
    const p = await page(`<video id="mute" src="${FOOTAGE}f30-silent.webm" data-start="0" data-has-audio="true" playsinline></video>`);
    await expectFailed(p, 'KN-135', 'the footage clip video#mute (' + FOOTAGE + 'f30-silent.webm)', /^has no sound track to decode .*muted/);
  });

  it('footage that loads leaves readiness to settle, and when ready() resolves the clip is on the frame for the clock\'s time', async () => {
    // 1 s into the file, so the file's own first frame, 0, would be wrong.
    // The frame is read inside the page, in ready()'s own callback.
    const p = await page(`<video id="ok" src="${FOOTAGE}f30.webm" data-start="0" data-media-start="1" muted></video>`,
      "const v = document.getElementById('ok'); const c = document.createElement('canvas'); c.width = 10; c.height = 1;"
      + " const x = c.getContext('2d'); x.drawImage(v, 0, 0, 10, 1); const d = x.getImageData(0, 0, 10, 1).data; let n = 0;"
      + ' for (let i = 0; i < 10; i++) if (d[i * 4] > 128) n |= 1 << i;'
      + " window.__atReady = { seeking: v.seeking, readyState: v.readyState, frame: n, marked: document.querySelector('[data-composition-id]').getAttribute('data-kinetic-ready') }");
    expect(p.result).toBe('resolved');
    const at = p.w.__atReady;
    expect([at.seeking, at.readyState >= 2, at.marked, at.frame]).toEqual([false, true, 'true', 30]);
    expect(p.w.__errors.filter((l) => l.startsWith('[KN'))).toEqual([]);
  });

  it('preload="none" is loaded all the same, with one request for the file: ready() resolves with the first frame there', async () => {
    const p = await page(`<video id="lazy" src="${FOOTAGE}f30.webm?lazy" data-start="0" preload="none" muted></video>`);
    expect(p.result).toBe('resolved');
    expect(p.doc.getElementById('lazy').readyState).toBeGreaterThanOrEqual(2);
    expect(p.w.performance.getEntriesByType('resource').filter((e) => e.name.includes('f30.webm?lazy')).length).toBe(1);
    expect(p.w.__errors.filter((l) => l.startsWith('[KN'))).toEqual([]);
  });

  it('a clip with data-has-audio and <source> children has its sound read from the source the element plays', async () => {
    const p = await page(`<video id="talk" data-start="0" data-has-audio="true"><source src="${FOOTAGE}f30.webm" type="video/webm"></video>`);
    expect(p.result, String(p.result && p.result.message || p.result)).toBe('resolved');
    expect(p.kinetic.level(1.0, 'all', { clip: 'talk' })).toBeGreaterThan(0.5);
  });
});
