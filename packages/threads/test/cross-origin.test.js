/**
 * The extension loaded from another origin: the expected path once it is on
 * a CDN. A browser refuses a cross-origin worker script, so the default route
 * cannot spawn its own URL there; it starts a same-origin blob: worker that
 * loads the extension instead (review TR-03).
 *
 * The test server answers on localhost and on [::1], which are different
 * origins, so the extension is loaded from [::1] while the page, the
 * framework core and the definition file stay on localhost. Its own file: it
 * installs the cross-origin copy of the extension as the page's
 * `wildflower.thread`.
 */
import { describe, it, expect } from 'vitest';
import { WF_FILE, CORE, loadScript, until, BUILD } from './helpers.js';

function otherOrigin(path) {
  const u = new URL(path, location.href);
  u.hostname = u.hostname === 'localhost' ? '[::1]' : 'localhost';
  return u.href;
}

describe(`the extension on another origin (${BUILD})`, () => {
  it('spawns and round-trips a call, with the definition loaded by URL', async () => {
    const extUrl = otherOrigin(WF_FILE);
    expect(new URL(extUrl).origin, 'the extension is not on another origin; the case did not arise').not.toBe(location.origin);
    await loadScript(CORE);
    await loadScript(extUrl);

    const t = window.wildflower.thread('stats', {
      state: { rows: [], params: { query: '' } },
      computed: { filtered() { return []; }, count() { return 0; }, revenue() { return 0; } },
      search() {},
    }, { core: CORE, def: '/packages/threads/test/fixtures/stats-def.js' });
    try {
      await until(() => t.isLoading === false, 5000, 'first patch');
      expect(t.count).toBe(5);
      await t.search('beta');
      await until(() => t.count === 2, 2000, 'the search to apply');
      expect(t.error).toBe(null);
    } finally { window.wildflower.unregister('stats'); }
  });

  // The blob: bootstrap needs worker-src to allow blob:. A stricter policy
  // must get a coded failure that names the way out, not a raw one.
  it('under a policy without blob:, fails with TH-103 and says to serve the file from this origin', async () => {
    const abs = (p) => new URL(p, location.href).href;
    const html = `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src * 'unsafe-inline'; worker-src 'self'">
<script>
  window.__warns = [];
  const ow = console.warn;
  console.warn = (...a) => { window.__warns.push(a.join(' ')); ow.apply(console, a); };
</script>
<script src="${abs(CORE)}"></script>
<script src="${otherOrigin(WF_FILE)}"></script>
<script>
  const report = (r) => parent.postMessage(Object.assign({ probe: 'xo-csp', warns: window.__warns }, r), '*');
  try {
    const t = wildflower.thread('stats', { state: { rows: [], params: { query: '' } } },
      { core: ${JSON.stringify(abs(CORE))}, def: ${JSON.stringify(abs('/packages/threads/test/fixtures/stats-def.js'))} });
    const start = Date.now();
    (function poll() {
      if (t.error) report({ via: 'error', error: t.error });
      else if (Date.now() - start > 4000) report({ via: 'timeout', error: null });
      else setTimeout(poll, 50);
    })();
  } catch (e) { report({ via: 'throw', code: e.code, error: e.message }); }
</script>`;
    const frame = document.createElement('iframe');
    const got = new Promise((resolve) => {
      window.addEventListener('message', function h(ev) {
        if (ev.data && ev.data.probe === 'xo-csp') { window.removeEventListener('message', h); resolve(ev.data); }
      });
    });
    frame.srcdoc = html;
    document.body.appendChild(frame);
    const r = await got;
    frame.remove();

    expect(r.via, 'nothing reported a failure: ' + JSON.stringify(r)).not.toBe('timeout');
    if (r.via === 'throw') expect(r.code).toBe('TH-103');
    expect(r.error).toMatch(/TH-103|worker/i);
    if (BUILD === 'dev') expect(r.warns.join('\n')).toMatch(/own origin/);
  });
});
