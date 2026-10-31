/**
 * A waitFor name that is no query holds readiness. The failure is KN-133,
 * printed once with console.error on every build, and ready() rejects. The
 * page keeps the first failure for good (one page is one render), so this
 * case has its own file. The failed-query case (KN-131) is in
 * readiness-query-failed.test.js.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';

const cleanup = [];
afterEach(async () => {
  const { wf } = await load();
  wf.kinetic.pause();
  for (const el of cleanup.splice(0)) el.remove();
});

async function captureErrors(fn) {
  const lines = [];
  const orig = console.error;
  console.error = (...a) => { lines.push(a.map(String).join(' ')); };
  try { await fn(); } finally { console.error = orig; }
  return lines;
}

describe(`readiness held by a missing query (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('waitFor: a name that is no query is KN-133 on the console once, and ready() rejects', async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const missing = uniqueName('nothing');
    const a = uniqueName('scene');
    wf.kinetic.scene(a, { waitFor: [missing] });
    let err = null;
    // Captured from before the mount: readiness starts by itself when the
    // page changes, so its KN-133 can print before ready() is called.
    const errors = await captureErrors(async () => {
      const host = await mount(`<div data-composition-id="rq2" data-start="0" data-duration="2"><div data-component="${a}"></div></div>`);
      cleanup.push(host);
      await wf.kinetic.ready().catch((e) => { err = e; });
    });
    const host = cleanup[cleanup.length - 1];
    expectKN(err, 'KN-133', "scene '" + a + "' waits for query '" + missing + "'", 'no query by that name exists');
    expect(errors.filter((l) => l.startsWith('[KN-133] scene '))).toEqual([err.message]);
    expect(host.firstElementChild.getAttribute('data-kinetic-ready')).toBe('failed');
    err = null;
    const again = await captureErrors(async () => {
      await wf.kinetic.ready().catch((e) => { err = e; });
    });
    expect(err && err.code).toBe('KN-133');
    expect(again.filter((l) => l.startsWith('[KN-13'))).toEqual([]);
  });
});
