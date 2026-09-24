/**
 * Shared helpers for the thread extension's suites.
 *
 * loadFrameworkForm(): the page loads the framework's tier file, then the
 * built extension as a classic <script src>, the way a page does, so
 * document.currentScript is set while it runs and the extension captures its
 * own URL. Resolves with the framework instance.
 *
 * threadInline(name, def): `wildflower.thread` through the Blob escape hatch,
 * so a test can declare its definition inline; resolves with the store.
 * Vitest's page carries no CSP, so the route is open here; the loader suite
 * covers the isomorphic form and the CSP refusal through fixture pages.
 * endThread(store) unregisters it, which terminates its worker.
 */

export const BUILD = typeof __THREADS_BUILD__ !== 'undefined' ? __THREADS_BUILD__ : 'dev';
// The framework tier the page and the worker load.
export const CORE = typeof __THREADS_CORE__ !== 'undefined' ? __THREADS_CORE__ : '/www/js/dist/wildflower.nano.min.js';
export const WF_FILE = typeof __THREADS_WF_FILE__ !== 'undefined' ? __THREADS_WF_FILE__ : '/packages/threads/dist/threads.wf.js';
export const isMin = BUILD === 'min';
// The tier the page (and the worker) run in the wf suite, from the file name.
export const CORE_TIER = (CORE.match(/wildflower(?:\.([\w-]+?))?(?:\.(dev|min))?\.js$/) || [])[1] || 'standard';
export const CORE_HAS_LISTS = CORE_TIER !== 'nano' && CORE_TIER !== 'mini-pool';

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(s);
    s.onerror = () => reject(new Error('could not load ' + src));
    document.head.appendChild(s);
  });
}

let wfLoaded = null;
export function loadFrameworkForm() {
  if (wfLoaded) return wfLoaded;
  wfLoaded = loadScript(CORE)
    .then(() => loadScript(WF_FILE).catch(() => { throw new Error('could not load ' + WF_FILE + '; build it first: node scripts/build-rollup.cjs threads'); }))
    .then(() => window.wildflower);
  return wfLoaded;
}

const storeNames = new WeakMap();

export async function threadInline(name, def, options) {
  const wf = await loadFrameworkForm();
  const store = wf.thread(name, def, Object.assign({ inline: true }, options || {}));
  storeNames.set(store, name);
  return store;
}

// Unregister a thread store made by threadInline; its destroy hook
// terminates the worker, rejecting calls in flight with TH-104.
export function endThread(store) {
  const name = storeNames.get(store);
  if (name !== undefined && window.wildflower) window.wildflower.unregister(name);
}

// Record every Worker.prototype.terminate call while the recorder is live.
export function recordTerminates() {
  const orig = Worker.prototype.terminate;
  const seen = [];
  Worker.prototype.terminate = function () { seen.push(this); return orig.call(this); };
  seen.stop = () => { Worker.prototype.terminate = orig; };
  return seen;
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// Wait until a predicate holds, polling; rejects after `ms`.
export function until(pred, ms = 5000, label = 'condition') {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    (function poll() {
      let ok = false;
      try { ok = pred(); } catch (_) { ok = false; }
      if (ok) return resolve();
      if (performance.now() - t0 > ms) return reject(new Error('timed out waiting for ' + label));
      setTimeout(poll, 5);
    })();
  });
}

// Capture console.warn lines while `fn` runs (sync or async).
export async function captureWarnings(fn) {
  const lines = [];
  const orig = console.warn;
  console.warn = (...args) => { lines.push(args.map(String).join(' ')); };
  try { await fn(); } finally { console.warn = orig; }
  return lines;
}

// Record every message the page posts to any Worker while `fn` runs.
export async function recordPosts(fn) {
  const posted = [];
  const orig = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (msg, ...rest) { posted.push(msg); return orig.call(this, msg, ...rest); };
  try { await fn(); } finally { Worker.prototype.postMessage = orig; }
  return posted;
}

// Record every message any Worker delivers to the page, by wrapping the
// `onmessage` setter the main half assigns. Install BEFORE creating the
// thread; call stop() to restore.
// `after`, when given, runs once the page has applied each reply, so a check
// can observe the mirror between two replies (a batch's patch and its acks).
export function recordReplies(after) {
  const desc = Object.getOwnPropertyDescriptor(Worker.prototype, 'onmessage');
  const seen = [];
  Object.defineProperty(Worker.prototype, 'onmessage', {
    configurable: true,
    get: desc.get,
    set(fn) { desc.set.call(this, (ev) => { seen.push(ev.data); fn(ev); if (after) after(ev.data); }); },
  });
  seen.stop = () => Object.defineProperty(Worker.prototype, 'onmessage', desc);
  return seen;
}

// Deterministic PRNG for the model suites (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The design's dashboard-shaped definition, self-contained for the inline route.
export function statsDefinition() {
  return {
    state: {
      rows: [
        { id: 1, name: 'alpha', revenue: 10 },
        { id: 2, name: 'beta', revenue: 20 },
        { id: 3, name: 'gamma', revenue: 30 },
        { id: 4, name: 'delta', revenue: 40 },
        { id: 5, name: 'beta-two', revenue: 50 },
      ],
      params: { query: '' },
      evals: 0,
    },
    computed: {
      filtered() { return this.rows.filter((r) => r.name.indexOf(this.params.query) !== -1); },
      count() { return this.filtered.length; },
      revenue() { return this.filtered.reduce((s, r) => s + r.revenue, 0); },
      top() { let best = null; this.rows.forEach((r) => { if (!best || r.revenue > best.revenue) best = r; }); return best ? best.name : null; },
    },
    search(q) { this.params.query = q; },
    addRow(row) { this.rows.push(row); return this.rows.length; },
    boom(msg) { throw new TypeError(msg || 'boom'); },
    async later(q, ms) { await new Promise((r) => setTimeout(r, ms || 5)); this.params.query = q; return this.count; },
    echoSelf() { return { count: this.count, query: this.params.query }; },
    hasWindow() { return typeof window !== 'undefined'; },
  };
}
