/**
 * The three extension's entry: three.js views as stores. Public API only;
 * the framework never learns the word "three".
 *
 *   wildflower.three.use(THREE)            the page's own three.js, once
 *   wildflower.three.view(name, options)   registers store `name` and returns it
 *
 * A view's store holds what the page reacts to:
 *
 *   pointer     { x, y } over the canvas in CSS px, or null; refreshed each
 *               frame while it is over the canvas
 *   hovered     computed: the entity under the pointer, as a snapshot
 *               { binding, id, entity }, or null. Picking runs only when a
 *               binding, watcher or subscription reads it
 *   selected    the entity last clicked without dragging (snapshot), or null
 *   size        { width, height } of the canvas in CSS px
 *   pixelRatio  the renderer's pixel ratio
 *   stats       { syncMs, renderMs, fps }, averaged over each second
 *
 * and its methods draw: instanced(), buffer(), pick(), hits(), project(),
 * projectPoint(), follow(), occluded(), resize(). wildflower.unregister(name)
 * runs the store's destroy(), which stops the view and, unless the view was
 * made with dispose: false, frees its scene's GPU resources.
 *
 * Every view draws once per frame, from the tick() of one store (`wf-three`),
 * deferred to a microtask so it runs after every other tick and pool flush of
 * the frame. A store's tick() runs on the framework's frame loop, which is
 * part of the pool module: the tiers with pools (mini-pool and up) have it,
 * nano and mini do not. Plugins exist on fewer tiers still, so the entry is
 * wildflower.plugin(install) where the tier has plugins and
 * install(wildflower) directly where it does not.
 */

import { GLOBAL_NAME, LOOP_STORE } from './names.js';
import { CODES, warn, fail } from './diagnostics.js';
import { lib } from './bindings.js';
import { View } from './view.js';

const views = new Map();   // store name -> View
let scheduled = false;

const reported = new WeakSet();   // views whose frame error was printed once

// One view's error (in its before(), a source, a follower) never stops the
// others. It is the author's own exception, so it is printed on every build,
// once per view.
function runFrames() {
  scheduled = false;
  for (const v of views.values()) {
    try {
      v.frame();
    } catch (err) {
      if (!reported.has(v)) { reported.add(v); console.error("[3D] view '" + v.name + "' threw while drawing a frame:", err); }
    }
  }
}

const wf = self.wildflower;
if (!wf) {
  if (__DEV__) warn(CODES.NO_FRAMEWORK, 'the framework is not on this page; load the wildflower script before this file',
    'Order the tags: the framework, then this file, then the code that uses wildflower.three.');
} else if (typeof wf.plugin === 'function') {
  wf.plugin(install);
} else {
  install(wf);
}

function install(wf) {
  // Loaded a second time (a duplicated script tag, a hot reload): the first
  // install keeps running. Replacing it would leave its frame loop drawing
  // only the views it already knew, and every later view drawing nothing.
  if (wf[GLOBAL_NAME]) {
    if (__DEV__) warn(CODES.LOADED_TWICE, 'the extension was loaded a second time; the first copy stays in use and this one does nothing',
      'Load three.wf.js once.');
    return;
  }
  const api = {
    use(THREE) { lib.T = THREE; return api; },
    view(name, options) { return createView(wf, name, options); },
  };
  wf[GLOBAL_NAME] = api;
  wf.store(LOOP_STORE, {
    state: {},
    tick() {
      if (!views.size || scheduled) return;
      scheduled = true;
      queueMicrotask(runFrames);
    },
  });
}

function createView(wf, name, opts) {
  if (!lib.T) throw fail(CODES.NO_THREE, 'call wildflower.three.use(THREE) before view()');
  if (typeof name !== 'string' || !name) throw fail(CODES.BAD_VIEW, 'view(name, options): name is the name of the view\'s store');
  const missing = !opts ? ['options'] : ['renderer', 'scene', 'camera'].filter((k) => !opts[k]);
  if (missing.length) throw fail(CODES.BAD_VIEW, "view('" + name + "', options): missing " + missing.join(', '));
  if (!opts.renderer.domElement) throw fail(CODES.BAD_VIEW, "view('" + name + "', options): renderer has no domElement (a three.js renderer's canvas)");
  if (opts.fit && !(opts.fit instanceof Element)) throw fail(CODES.BAD_VIEW, "view('" + name + "', options): fit must be an element, not " + typeof opts.fit);
  if (opts.render !== undefined && opts.render !== 'frame' && opts.render !== 'change') {
    throw fail(CODES.BAD_VIEW, "view('" + name + "', options): render is 'frame' (the default) or 'change', not " + JSON.stringify(opts.render));
  }
  if (opts.maxFps !== undefined && !(typeof opts.maxFps === 'number' && opts.maxFps > 0)) {
    throw fail(CODES.BAD_VIEW, "view('" + name + "', options): maxFps is a number of frames per second above 0, not " + JSON.stringify(opts.maxFps));
  }
  // A view by that name already: the same code ran twice, most likely, so
  // hand back the view it made. Any other store by that name is not a view,
  // and handing it back would fail later with a bare TypeError, so throw.
  const existing = wf.getStore(name);
  if (existing && views.has(name)) {
    if (__DEV__) warn(CODES.VIEW_EXISTS, "a view named '" + name + "' already exists; it was returned and these options were ignored",
      "Create each view once, or unregister it first (wildflower.unregister('" + name + "')) to replace it.");
    return existing;
  }
  if (existing) {
    throw fail(CODES.NAME_TAKEN, "view('" + name + "'): '" + name + "' is already a store that is not a view; choose another name for the view");
  }

  // Writes from the view into its store, as one change. Nothing to write to
  // until the store exists.
  let store = null;
  const publish = (patch) => {
    if (!store || wf.getStore(name) !== store) return;
    if (typeof wf.batch === 'function') wf.batch(() => Object.assign(store, patch));
    else Object.assign(store, patch);
  };

  // A build without the frame loop (nano, mini) never runs the wf-three
  // tick, so the view would never draw.
  if (__DEV__ && wf.features && wf.features.pools === false) {
    warn(CODES.NO_FRAME_LOOP, "view('" + name + "'): this framework build (" + (wf.tier || 'unknown tier') + ') has no frame loop, so the view will never draw',
      'Load a tier with pools: mini-pool, lite, core, spa or full.');
  }

  // The view first, so options that fail leave nothing registered behind.
  const view = new View(name, opts, publish);

  store = wf.store(name, {
    state: {
      pointer: null,
      selected: null,
      size: { width: 0, height: 0 },
      pixelRatio: 1,
      stats: { syncMs: 0, renderMs: 0, fps: 0 },
    },
    computed: {
      // Reads `pointer`, which the view refreshes each frame the pointer is
      // over the canvas; unread, it is never evaluated, so nothing is picked.
      hovered() { return view.hoverAt(this.pointer); },
    },
    instanced(source, mesh, spec) { return view.instanced(source, mesh, spec); },
    buffer(source, mesh, spec) { return view.buffer(source, mesh, spec); },
    pick(ev) { return view.pick(ev); },
    hits(ev) { return view.hits(ev); },
    project(entity, binding) { return view.project(entity, binding); },
    projectPoint(x, y, z) { return view.projectPoint(x, y, z); },
    follow(el, getEntity, binding) { return view.follow(el, getEntity, binding); },
    occluded(x, y, z) { return view.occluded(x, y, z); },
    resize() { view.resize(); },
    invalidate() { view.invalidate(); },
    destroy() {
      views.delete(name);
      view.dispose([...views.values()]);
    },
  });

  views.set(name, view);
  view.resize();   // publish the size now that the store exists
  return store;
}
