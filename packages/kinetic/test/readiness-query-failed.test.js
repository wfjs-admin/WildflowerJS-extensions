/**
 * A waitFor query that failed holds readiness. The failure is KN-131, printed
 * once with console.error on every build, and ready() rejects. The page keeps
 * the first failure for good (one page is one render), so this case has its
 * own file, apart from the other readiness tests. The missing-query case
 * (KN-133) is in readiness-query-missing.test.js for the same reason.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { load, mount, uniqueName, expectKN, BUILD, CORE_TIER } from './helpers.js';
import { queryFailedWhy } from '../src/readiness.js';

// KN-131's sentence: on a page opened from disk it names the cause and the
// two ways out; elsewhere it gives the query's error alone.
describe('KN-131 on a page opened from disk', () => {
  it('names the cause and the ways out on file:, and only the error elsewhere', () => {
    const err = new TypeError('Failed to fetch');
    const disk = queryFailedWhy(err, 'file:');
    expect(disk).toMatch(/^the query failed \(Failed to fetch\); this page was opened from disk/);
    expect(disk).toMatch(/serve the folder \(npx serve\)/);
    expect(disk).toMatch(/load the data as a script/);
    expect(queryFailedWhy(err, 'http:')).toBe('the query failed (Failed to fetch)');
    expect(queryFailedWhy(err, 'https:')).toBe('the query failed (Failed to fetch)');
  });
});

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

describe(`readiness held by a failed query (${BUILD} extension, ${CORE_TIER} core)`, () => {
  it('waitFor: a query that fails is KN-131 on the console once, and ready() rejects', async ({ skip }) => {
    const { wf } = await load();
    if (!wf.features || wf.features.query === false) skip();
    const bad = uniqueName('q');
    wf.query(bad, { from: () => Promise.reject(new Error('no such file')) });
    const a = uniqueName('scene');
    wf.kinetic.scene(a, { waitFor: [bad] });
    const host = await mount(`<div data-composition-id="rq1" data-start="0" data-duration="2"><div data-component="${a}"></div></div>`);
    cleanup.push(host);
    let err = null;
    const errors = await captureErrors(async () => {
      await wf.kinetic.ready().catch((e) => { err = e; });
    });
    expectKN(err, 'KN-131', "scene '" + a + "' waits for query '" + bad + "'", 'the query failed (no such file)');
    // The failure is on the console in every build, once, so a render that
    // stops at its readiness timeout carries it in its diagnostics.
    expect(errors.filter((l) => l.startsWith('[KN-131] scene '))).toEqual([err.message]);
    expect(host.firstElementChild.getAttribute('data-kinetic-ready')).toBe('failed');
    // The page keeps the failure. A later ready() rejects with it and does
    // not print it again.
    err = null;
    const again = await captureErrors(async () => {
      await wf.kinetic.ready().catch((e) => { err = e; });
    });
    expect(err && err.code).toBe('KN-131');
    expect(again.filter((l) => l.startsWith('[KN-13'))).toEqual([]);
  });
});
