/**
 * render.batch(rows, options): the page rendered once per row of variables,
 * one MP4 per row. The work is in kinetic.tools.js (tools/batch.js), which
 * the call loads the way check() does (check.js, loadTools()) and hands
 * over to.
 *
 * Each row renders in a frame of its own: this same page, in a hidden frame
 * named 'kinetic-batch:' and the row as JSON, which readVariables()
 * (timing.js) reads over the page's declared defaults. In such a frame this
 * file turns off autoplay and sound, keeps the KN lines and errors the page
 * prints from the start, and once the page has loaded hands them to
 * kinetic.tools.js, which answers the frame that made it by postMessage
 * (the protocol is in tools/batch.js). The page shows the composition
 * alone, with no preview bar (fit.js, isolated()).
 */

import { loadTools } from './check.js';
import { batchName } from './timing.js';

export function createBatch(api) {
  const load = () => loadTools('render.batch()');
  api.render.batch = (rows, options) => load().then((t) => t.batch(rows, options));
  if (!batchName()) return;
  // A row's frame is the page loaded again, so a page that batches as it loads calls this here too. The batch is
  // the outer page's: in the frame the call renders nothing and stays pending, and the frame goes when its row is done.
  api.render.batch = () => new Promise(() => {});
  const lines = [];
  const text = (a) => (a && typeof a === 'object' && typeof a.message === 'string' ? a.message : String(a));
  for (const k of ['warn', 'error']) {
    const orig = console[k];
    console[k] = function (...a) {
      const t = a.map(text).join(' ');
      if (k === 'error' || /\[KN-|^\s*↳/.test(t)) lines.push(t);
      return orig.apply(this, a);
    };
  }
  self.addEventListener('error', (e) => lines.push(e.error ? text(e.error) : e.message));
  // At load, ahead of the clock's own start (clock.js), which reads autoplay.
  const start = () => {
    api.config({ autoplay: false, sound: false });
    load().then((t) => t.batchFrame(lines), () => {});
  };
  if (document.readyState === 'complete') start();
  else self.addEventListener('load', start, { once: true });
}
