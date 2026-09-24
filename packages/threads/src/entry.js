/**
 * The isomorphic entry, as a function. One file, two branches.
 *
 * On a page it returns the function `thread(name, def, options)` that builds
 * the mirror proxy and spawns this same file as the Worker; the framework
 * layer (wf.js) wraps that mirror in a store and exposes it as
 * `wildflower.thread`. As the Worker entry it reads how it was started (a
 * `?core=&def=` pair, or the inline global the Blob route sets), loads the
 * framework's tier file headless, builds the worker-side registrar, and
 * loads the definition so its `wildflower.thread()` call runs.
 *
 * `start(hooks)` is called once, by wf.js, with `onWorkerCore(wf, registrar)`,
 * which runs in the worker after the framework has loaded and before the
 * definition does, and exposes the registrar as `wildflower.thread`.
 *
 * options (main side only):
 *   core:   the framework's classic (IIFE) build URL for the worker to load;
 *           default: the framework <script src> found on this page
 *   def:    the definition file's URL, when `wildflower.thread()` is not called from
 *           that file's top level (document.currentScript is then null)
 *   url:    this extension's own URL, when it was not loaded through a
 *           classic <script src> (document.currentScript is then null)
 *   inline: true to serialise the definition into a Blob worker instead of
 *           loading it by URL (the documented escape hatch; needs a
 *           worker-src that allows blob:)
 */

import { CODES, warn, makeError } from './diagnostics.js';
import { startWorkerSide } from './worker.js';
import { createMainSide } from './main.js';
import {
  findOwnUrl, currentScriptUrl, findFrameworkUrl, spawnIsomorphic, spawnInline, workerBootInfo, isCrossOrigin,
} from './loader.js';

export const isWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

// Returns the main-side `thread` function on a page, undefined in a worker.
export function start(hooks) {
  hooks = hooks || {};
  if (isWorker) {
    const boot = workerBootInfo();
    let side = null;
    const early = [];
    self.onmessage = (ev) => { if (side) side.handleMessage(ev.data); else early.push(ev.data); };
    const registrar = function thread(name, def) {
      // A definition file may register several threads; this worker is one of
      // them and ignores the rest.
      if (name !== boot.name || side) return undefined;
      side = startWorkerSide(name, def, (msg, transfer) => self.postMessage(msg, transfer || []), self.wildflower);
      while (early.length) side.handleMessage(early.shift());
      return undefined;
    };
    // The framework first (headless: no document, no scan), then the
    // definition. A failure here surfaces as the Worker's error event on the
    // page, which the main half reports as TH-103.
    if (boot.coreUrl) importScripts(boot.coreUrl);
    if (!self.wildflower) throw new Error('the framework did not load in the worker: ' + boot.coreUrl);
    if (hooks.onWorkerCore) hooks.onWorkerCore(self.wildflower, registrar);
    if (boot.inline) registrar(boot.name, boot.def);
    else if (boot.defUrl) importScripts(boot.defUrl);
    else throw new Error("no definition for thread '" + boot.name + "': neither an inline definition nor a definition URL reached the worker");
    // Nothing above guarantees the definition registered the name this worker
    // was spawned for. A typo between the page and the definition file, or a
    // file that returns before its thread() call, used to leave the worker
    // alive with no store: every message piled into `early` with no bound,
    // the page sat with isLoading true and pending climbing, and the only
    // signal was the dev-only watchdog. Throwing here surfaces as the
    // Worker's error event, which the main half reports as TH-103 on every
    // build.
    if (!side) {
      throw new Error("the definition did not register a thread named '" + boot.name
        + "'; check that the name on the page matches the one in the definition file");
    }
    return undefined;
  }

  const ownUrl = findOwnUrl();

  const thread = function thread(name, def, options) {
    options = options || {};
    // Absolute URLs throughout: a Blob worker has no base to resolve a
    // page-relative path against, and the isomorphic worker's base is the
    // extension file, not the page.
    const ext = absolute(options.url) || ownUrl;
    const core = absolute(options.core) || findFrameworkUrl();
    let spawnWorker;
    let inline = false;
    if (!core) throw cannotSpawn(name, CODES.NO_CORE, 'no framework <script src> on this page for the worker to load; pass { core } with the URL of a classic wildflower build');
    if (options.inline) {
      inline = true;
      if (!ext) throw cannotSpawn(name, CODES.NO_OWN_URL, 'inline route: the extension file URL is needed, the worker importScripts it');
      spawnWorker = () => spawnInline(ext, core, name, def);
    } else {
      const defUrl = absolute(options.def) || currentScriptUrl();
      if (!ext) throw cannotSpawn(name, CODES.NO_OWN_URL, 'load the extension through a classic <script src> tag, or pass { url } with its address');
      if (!defUrl) throw cannotSpawn(name, CODES.NO_OWN_URL, 'call wildflower.thread() from the top level of a definition file loaded through a classic <script src> tag, pass { def } with that file\'s URL, or use { inline: true }');
      spawnWorker = () => spawnIsomorphic(ext, core, defUrl, name);
    }
    // Loaded from another origin, the default route starts from a blob: URL
    // too, so a policy refusing blob: is explained the same way.
    const crossOrigin = !inline && isCrossOrigin(ext);
    return createMainSide(name, def, (handlers) => {
      let w;
      try {
        w = spawnWorker();
      } catch (e) {
        // Already coded (the inline route's TH-105 for state it cannot
        // write): pass it through unchanged.
        if (e && typeof e.code === 'string' && e.code.indexOf('TH-') === 0) throw e;
        // A worker the browser refuses outright, rather than one that fails
        // to load, throws here; give it the code a failed start carries.
        const message = `thread '${name}': the worker could not be created: ` + (e && e.message);
        if (__DEV__) warn(CODES.WORKER_FAILED, message, 'Check the extension URL, and that worker-src allows it.');
        throw makeError(CODES.WORKER_FAILED, message, 'Error');
      }
      w.onmessage = (ev) => handlers.onMessage(ev.data);
      w.onerror = (ev) => handlers.onError(ev);
      return { post: (msg) => w.postMessage(msg), terminate: () => w.terminate() };
    }, { inline, crossOrigin });
  };
  return thread;
}

function absolute(url) {
  if (!url) return null;
  return new URL(url, typeof document !== 'undefined' ? document.baseURI : self.location.href).href;
}

// The way out is spelled out on dev builds only; the min build carries the
// code and the short message, and the reference page carries the rest.
function cannotSpawn(name, code, how) {
  const message = `thread '${name}': cannot spawn the worker`;
  if (__DEV__) warn(code, message + '; ' + how);
  return makeError(code, __DEV__ ? message + '; ' + how : message);
}
