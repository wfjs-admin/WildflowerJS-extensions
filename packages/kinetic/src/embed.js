/**
 * The embed API. A page with `embed` in its URL shows the composition alone
 * (fit.js); inside another page's <iframe> it also takes play, pause and
 * seek from that page through postMessage and posts its time back, so a
 * host on any origin drives the composition without reaching into the
 * frame. Plain messages, no library:
 *
 *   parent -> frame   { type: 'kinetic:play' }               play(); with `from` and `to`, play({ from, to })
 *                     { type: 'kinetic:pause' }
 *                     { type: 'kinetic:seek', time: 2.5 }
 *                     { type: 'kinetic:state' }              asks for a kinetic:time message now
 *   frame -> parent   { type: 'kinetic:ready', ready, duration, fps, width, height }
 *                                                            once readiness has settled: 'true' or 'failed'
 *                     { type: 'kinetic:time', time, frame, playing, duration, fps }
 *                                                            after every seek, and whenever it pauses or plays
 *                     { type: 'kinetic:error', message }     the KN-100 error of a seek whose time is
 *                                                            no number, or of a play the clock refused
 *
 * The frame posts to its parent with '*' (its time is nothing to protect)
 * and takes commands from its parent alone. Without `embed` in the URL, or
 * at the top of a window, nothing here runs.
 */

import { embedded } from './fit.js';
import { compositionRoot } from './timing.js';

const PREFIX = 'kinetic:';

export function createEmbed(clock, api) {
  const w = self;
  let parent = null;
  try { parent = embedded() && w.parent !== w ? w.parent : null; } catch (_) { parent = null; }
  if (!parent) return;
  const store = clock.store;
  const post = (msg) => { try { parent.postMessage(msg, '*'); } catch (_) { /* a parent that is gone */ } };
  const state = () => ({ type: PREFIX + 'time', time: store.time, frame: store.frame, playing: store.playing, duration: store.duration, fps: store.fps });

  clock.onAfterSeek(() => post(state()));
  // A pause or play from inside the frame, such as a click, has no seek.
  store.subscribe('playing', () => post(state()));

  w.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== parent || !d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith(PREFIX)) return;
    const cmd = d.type.slice(PREFIX.length);
    try {
      if (cmd === 'play') { api.play(d.from !== undefined || d.to !== undefined ? { from: d.from, to: d.to } : undefined); post(state()); }
      else if (cmd === 'pause') { api.pause(); post(state()); }
      // seek() throws KN-100 for a time that is no number, as the API does.
      else if (cmd === 'seek') api.seek(d.time);
      else if (cmd === 'state') post(state());
    } catch (err) {
      post({ type: PREFIX + 'error', message: String(err && err.message || err) });
    }
  });

  // Readiness marks the root once it has settled, 'true' or 'failed'. A root
  // added later is waited for.
  const ready = () => {
    const root = compositionRoot(document);
    if (!root) {
      const wait = new MutationObserver(() => { if (compositionRoot(document)) { wait.disconnect(); ready(); } });
      wait.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    const report = () => {
      const r = root.getAttribute('data-kinetic-ready');
      if (r !== 'true' && r !== 'failed') return false;
      post({ type: PREFIX + 'ready', ready: r, duration: store.duration, fps: store.fps, width: Number(root.getAttribute('data-width')) || 0, height: Number(root.getAttribute('data-height')) || 0 });
      return true;
    };
    if (report()) return;
    const mo = new MutationObserver(() => { if (report()) mo.disconnect(); });
    mo.observe(root, { attributes: true, attributeFilter: ['data-kinetic-ready'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
}
