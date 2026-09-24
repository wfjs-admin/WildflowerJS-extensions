/**
 * Every name the extension exposes or depends on, in one place.
 *
 * Kept in one place so a rename is one edit: the name registered on
 * `wildflower` on the page and in the worker, the document event prefix, the diagnostic prefix, and the
 * global the Blob escape hatch uses to hand an inline definition to the
 * worker side. The package ships as @wildflowerjs/threads, scoped, so the
 * generic name here cannot collide with the unscoped `threads` on npm.
 */

// The name the framework layer registers on both sides: a definition file
// calls `wildflower.thread(name, def)`.
export const GLOBAL_NAME = 'thread';

// Document events dispatched by the main half: `thread:patch`.
export const EVENT_PREFIX = 'thread:';

// Diagnostic prefix. Codes read `[TH TH-101] ...`, the shape the framework's
// own `[WF WF-216]` lines use, so the two sort together in a console.
export const DIAG_PREFIX = 'TH';

// Set on the worker global by the Blob escape hatch's bootstrap script before
// it importScripts the extension file, so the worker branch finds the inline
// definition instead of a `?def=` URL.
export const INLINE_GLOBAL = '__threadInline';

// Set on the worker global by the cross-origin bootstrap before it
// importScripts the extension: the { name, core, def } the query string
// carries on the same-origin route, since a blob: worker's own URL has none.
export const BOOT_GLOBAL = '__threadBoot';

// Query-string keys the isomorphic form uses when it spawns itself.
export const QUERY_DEF = 'def';
export const QUERY_NAME = 'name';
export const QUERY_CORE = 'core';

// The framework's script-tag file, as found among document.scripts when no
// { core } option names it. Any tier; the worker loads it with importScripts,
// so it must be the classic (IIFE) build, not the .esm twin.
export const FRAMEWORK_SCRIPT_RE = /\/wildflower(\.[\w-]+)*\.js(\?|#|$)/;
