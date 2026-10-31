/**
 * Trillium views inside scenes. A view draws from the framework's frame
 * loop, in a microtask after its store's tick(), so nothing guarantees its
 * canvas holds frame t when a seek's barrier resolves. Once every seek's
 * footage has landed, each view whose canvas sits inside a live scene is
 * drawn once through the public view.draw() (Trillium 0.2), before the
 * barrier, so a texture of a footage clip (view.video()) is drawn at the
 * seek's frame. A view inside a hidden clip is not drawn: it paints
 * nothing there, and is drawn again on the first seek that shows its clip.
 * check() draws every view on every seek, hidden or not.
 * The draw counts toward the seek's time for KN-170 (guard.js).
 *
 * Development builds warn once per view (KN-190) when its WebGL context was
 * created without preserveDrawingBuffer: HyperFrames' own WebGL blocks set
 * it, and a context without it can read back blank to a capture.
 */

import { CODES, warn } from './diagnostics.js';

export function createThree(wf, clock, scenes) {
  const checked = new WeakSet();   // canvases already looked at for KN-190

  function inScene(canvas) {
    for (const inst of scenes.live) if (inst.element.contains(canvas)) return inst;
    return null;
  }

  // A canvas inside a hidden clip (clips.js, or the runtime, hides a clip
  // with visibility, and a data-hidden one with display) paints nothing,
  // so its view is not drawn until the clip shows again.
  function hidden(canvas) {
    for (let el = canvas; el; el = el.parentElement) {
      if (el.hasAttribute('data-start') && (el.style.visibility === 'hidden' || el.style.display === 'none')) return true;
    }
    return false;
  }

  function checkBuffer(canvas, store, inst) {
    if (checked.has(canvas)) return;
    checked.add(canvas);
    let gl = null;
    try { gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); } catch (_) { /* not a WebGL canvas */ }
    if (!gl || typeof gl.getContextAttributes !== 'function') return;
    const attrs = gl.getContextAttributes();
    if (attrs && attrs.preserveDrawingBuffer === false) {
      warn(CODES.NO_PRESERVE, "the Trillium view in scene '" + inst.name + "' draws to a WebGL context created without preserveDrawingBuffer, which can read back blank when a frame is captured",
        'Create the renderer with new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true }).');
    }
  }

  // One view that throws never stops the later views' draws; the first
  // error is thrown after the loop, so the seek still fails with it.
  clock.onLanded(() => {
    const three = wf.three;
    if (!three || typeof three.views !== 'function') return;
    let failed = null;
    for (const store of three.views()) {
      if (typeof store.canvas !== 'function' || typeof store.draw !== 'function') continue;
      const canvas = store.canvas();
      const inst = canvas && inScene(canvas);
      // check() draws them all, so a hidden canvas holds the seek's frame in
      // both its passes and the order of its seeks never shows.
      if (!inst || (hidden(canvas) && !(clock.checking > 0))) continue;
      if (__DEV__) checkBuffer(canvas, store, inst);
      try { store.draw(); } catch (e) { if (!failed) failed = { e }; }
    }
    if (failed) throw failed.e;
  });
}
