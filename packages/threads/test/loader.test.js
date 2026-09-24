/**
 * Loading, against the built file.
 *
 * - the isomorphic classic form on this page: the framework and the
 *   extension loaded through classic <script src> tags, then a definition
 *   file whose top-level wildflower.thread() call returns the store on the
 *   page and registers the real state in the worker (the same file spawned
 *   as the Worker with ?def=&name=)
 * - the same form under a strict CSP in an iframe (script-src 'self';
 *   worker-src 'self'), where the inline (Blob) route is refused and the
 *   extension reports TH-103 naming worker-src
 * - the TH-106 refusal when wildflower.thread() cannot find a URL to spawn
 * - the TH-107 refusal when the framework's script tag cannot be found
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { loadFrameworkForm, loadScript, until, captureWarnings, isMin, BUILD, CORE } from './helpers.js';

let wf;
const live = [];   // store names, unregistered after each test
beforeAll(async () => { wf = await loadFrameworkForm(); });
afterEach(() => { while (live.length) wf.unregister(live.pop()); });

function loadFixture(page) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    const timer = setTimeout(() => { cleanup(); reject(new Error('no report from ' + page)); }, 20000);
    function cleanup() { clearTimeout(timer); window.removeEventListener('message', onMessage); iframe.remove(); }
    function onMessage(ev) {
      if (!ev.data || ev.data.probe !== 'threads-csp') return;
      cleanup();
      resolve(ev.data.report);
    }
    window.addEventListener('message', onMessage);
    iframe.src = '/packages/threads/test/fixtures/' + page;
    document.body.appendChild(iframe);
  });
}

describe(`loading (${BUILD})`, () => {
  it('when the framework\'s script tag cannot be found and no { core } is given, wildflower.thread() throws TH-107', async () => {
    // A page whose framework is bundled has an instance but no matching
    // <script src>; take the core's tag out of document.scripts for the call.
    const tag = Array.prototype.find.call(document.scripts, (s) => s.src && s.src.indexOf(CORE) !== -1);
    expect(tag, 'the framework tag is on the page').toBeTruthy();
    const parent = tag.parentNode;
    const nextSibling = tag.nextSibling;
    tag.remove();
    let err = null;
    try {
      await captureWarnings(() => {
        try { wf.thread('orphan', { state: { n: 1 } }, { def: '/packages/threads/test/fixtures/stats-def.js' }); } catch (e) { err = e; }
      });
    } finally {
      parent.insertBefore(tag, nextSibling);
    }
    expect(err).toBeTruthy();
    expect(err.code).toBe('TH-107');
    expect(err.message).toMatch(/cannot spawn/);
    expect(wf.getStore('orphan')).toBeFalsy();
  });

  it('isomorphic classic form: the framework script on the page is found and loaded in the worker; a definition file loaded by URL registers on both sides', async () => {
    await loadScript('/packages/threads/test/fixtures/stats-def.js');
    const stats = window.stats;
    live.push('stats');
    expect(stats).toBeTruthy();
    expect(stats).toBe(wf.getStore('stats'));
    expect(stats.isLoading).toBe(true);
    await until(() => stats.isLoading === false, 5000, 'first patch through the isomorphic worker');
    expect(stats.count).toBe(5);
    await stats.search('beta');
    expect(stats.count).toBe(2);
    expect(stats.revenue).toBe(70);
    expect(await stats.hasWindow()).toBe(false);
    expect(stats.error).toBeNull();
  });

  it('under a strict CSP the isomorphic form works and the inline route is refused with TH-103 naming worker-src', async () => {
    const report = await loadFixture('csp.html?build=' + BUILD + '&core=' + encodeURIComponent(CORE));
    console.log(`[threads csp ${BUILD}] ` + JSON.stringify(report));
    expect(report.fatal).toBeNull();
    expect(report.inlineRan, 'the CSP is live: the inline script did not run').toBe(false);
    expect(report.iso.created).toBe(true);
    expect(report.iso.isLoadingAtStart).toBe(true);
    expect(report.iso.error).toBeNull();
    expect(report.iso.count).toBe(2);
    expect(report.iso.hasWindow).toBe(false);
    expect(report.iso.firstPatchMs).toBeLessThan(5000);

    // The Blob route: refused by worker-src, surfacing as a Worker error
    // event, which the main half turns into TH-103 on `error`, rejects the
    // call with, and leaves isLoading true.
    expect(report.violations.some((v) => v.directive === 'worker-src' && /^blob/.test(v.blockedURI))).toBe(true);
    expect(report.inline.threw).toBeNull();
    // `error` carries the message; the TH-103 code arrives on the rejection
    // (callRejectionCode below), which is where a page can branch on it.
    expect(report.inline.errorMessage).toMatch(/failed to start/);
    expect(report.inline.isLoading).toBe(true);
    expect(report.inline.callRejected).toBe(true);
    expect(report.inline.callRejectionCode).toBe('TH-103');
    const th103 = report.warnings.filter((l) => l.indexOf('TH-103') !== -1 || l.indexOf('worker-src') !== -1);
    if (isMin) {
      expect(th103.length).toBe(0);
    } else {
      expect(th103.some((l) => l.indexOf('TH-103') !== -1)).toBe(true);
      expect(th103.some((l) => l.indexOf('worker-src') !== -1 && l.indexOf('blob:') !== -1)).toBe(true);
    }
  });

  it('wildflower.thread() called where no URL can be found throws TH-106 with the way out', async () => {
    let err = null;
    const lines = await captureWarnings(() => {
      try { wf.thread('orphan', { state: { n: 1 } }); } catch (e) { err = e; }
    });
    expect(err).toBeTruthy();
    expect(err.code).toBe('TH-106');
    expect(err.message).toMatch(/cannot spawn/);
    expect(wf.getStore('orphan')).toBeFalsy();
    if (!isMin) {
      expect(err.message).toMatch(/\{ def \}|inline/);
      expect(lines.some((l) => l.indexOf('TH-106') !== -1)).toBe(true);
    }
    // The way out: pass the definition file's URL.
    const t = wf.thread('stats', { state: { rows: [], params: { query: '' } }, computed: { count() { return this.rows.length; } }, search(q) { this.params.query = q; } },
      { def: '/packages/threads/test/fixtures/stats-def.js' });
    live.push('stats');
    await until(() => t.isLoading === false, 5000, 'first patch with { def }');
    expect(t.count).toBe(5);
  });
});

describe(`a definition that never registers the asked-for name (${BUILD})`, () => {
  // The worker's registrar ignores a wildflower.thread() call whose name is
  // not the one it was spawned for, and nothing checked afterwards that any
  // call matched. A typo between the page and the definition file left
  // `side` null, so every SET and CALL piled into the `early` buffer with no
  // bound and no signal: isLoading stuck true, pending climbing, and on the
  // min build not even the dev-only watchdog.
  it('fails the worker with TH-103 rather than buffering forever', async () => {
    // the fixture registers 'stats'; ask for a name it never registers
    const t = wf.thread('statz', { state: { n: 1 } },
      { core: CORE, def: '/packages/threads/test/fixtures/stats-def.js' });
    live.push('statz');
    await until(() => t.error !== null, 6000, 'the worker to report a failure');
    expect(t.isLoading).toBe(true);
    expect(String(t.error)).toMatch(/statz|did not register/i);
  });
});
