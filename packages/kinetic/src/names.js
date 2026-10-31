/**
 * Every name the Kinetic extension puts into a page, in one place.
 *
 * GLOBAL_NAME   wildflower.kinetic
 * STORE_NAME    the clock store every scene subscribes to: `$kinetic.time`
 *               in a binding, `this.stores.kinetic` in a scene
 * FOLLOW_STORE  the seconds that a scene's `follow` computeds read while a
 *               follower moves (follow.js), made with the first follow
 *               block; Kinetic's own, not for pages to read
 * FONTS_STORE   a count that textMetrics() reads and readiness raises once
 *               the fonts measured with have loaded (metrics.js), so a
 *               computed that measured the fallback measures again;
 *               Kinetic's own, not for pages to read
 * DIAG_PREFIX   the prefix of the extension's diagnostic codes (KN-101 ...)
 * HF_VERSION    the HyperFrames runtime this build was tested against
 *               (scripts/fetch-hyperframes.cjs pins the same version)
 */

export const GLOBAL_NAME = 'kinetic';

export const STORE_NAME = 'kinetic';

export const FOLLOW_STORE = 'kinetic-follow';

export const FONTS_STORE = 'kinetic-fonts';

export const DIAG_PREFIX = 'KN';

export const HF_VERSION = '0.8.133';
