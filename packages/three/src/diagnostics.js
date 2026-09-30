/**
 * Coded diagnostics for the three extension. Own prefix (3D), own ledger.
 *
 *   3D-101  view() was called before wildflower.three.use(THREE)
 *   3D-102  view(name, options) without a name, a renderer, a scene or a camera
 *   3D-103  the name is already a store that is not a view; no view was created
 *           (a view is a store, and store names are shared across the app)
 *   3D-104  instanced() was given something other than a pool or a function
 *           returning an array, a mesh that is not an InstancedMesh, or a spec
 *           without `position`
 *   3D-105  buffer() was given a source that is not a function, a mesh that is
 *           not an InstancedMesh, or a spec without stride, position and count
 *   3D-106  a source has more entities than the mesh holds; the rest are not
 *           drawn (raise the InstancedMesh's count)
 *   3D-107  the file loaded on a page with no framework instance (the
 *           framework script must come first)
 *   3D-108  a view by that name already exists; it was returned and the new
 *           options were ignored
 *   3D-109  the file was loaded a second time; the first copy stays in use
 *   3D-110  view() on a framework build with no frame loop (nano, mini:
 *           wildflower.features.pools is false), so the view will never draw
 *   3D-111  a binding with sync: 'change' holds an entity that changed in
 *           place with no markDirty()/update(), so the change is not drawn
 *
 * Warnings (106 to 111) are development-only, through console.warn; the
 * behaviour they describe is the same on every build. Errors (101 to 105)
 * are thrown on every build as real Errors carrying `code`.
 */

import { DIAG_PREFIX } from './names.js';

export const CODES = {
  NO_THREE: DIAG_PREFIX + '-101',
  BAD_VIEW: DIAG_PREFIX + '-102',
  NAME_TAKEN: DIAG_PREFIX + '-103',
  BAD_INSTANCED: DIAG_PREFIX + '-104',
  BAD_BUFFER: DIAG_PREFIX + '-105',
  OVER_CAPACITY: DIAG_PREFIX + '-106',
  NO_FRAMEWORK: DIAG_PREFIX + '-107',
  VIEW_EXISTS: DIAG_PREFIX + '-108',
  LOADED_TWICE: DIAG_PREFIX + '-109',
  NO_FRAME_LOOP: DIAG_PREFIX + '-110',
  UNREPORTED_CHANGE: DIAG_PREFIX + '-111',
};

export function warn(code, message, suggestion) {
  console.warn('[' + DIAG_PREFIX + ' ' + code + '] ' + message);
  if (suggestion) console.warn('  ↳ Suggestion: ' + suggestion);
}

// An Error with the code in `code` and in the message, so it reads the same
// in a console and in a catch block.
export function fail(code, message) {
  const err = new Error('[' + code + '] ' + message);
  err.code = code;
  return err;
}
