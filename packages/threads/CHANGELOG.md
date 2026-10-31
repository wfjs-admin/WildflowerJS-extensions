# Changelog

Notable changes to `@wildflowerjs/threads`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Where a change needs a newer
`wildflowerjs` core, the entry says which.

## [0.1.2] - 2026-10-31

### Changed
- Warnings print as `[TH-101] ...`, where they printed `[TH TH-101] ...`. With a development build of wildflowerjs 1.5.5 or later they print through `wildflower.diagnostic()`, which adds the Docs line and keeps each one in `wildflower.diagnostics`: the page's for a warning on the page, the worker's own for one in the worker. With an earlier core or a production one the line is the same and comes from Threads.

### Fixed
- An underscore field that the definition's `init()` assigns keeps that value and reaches the page in the first patch, with a typed array transferred. Previously the worker reset it to the declared value once `init()` returned.
- A write made in a microtask that `init()` queues reaches the page. Previously the first patch dropped it.
- An underscore field assigned outside a message or a tick, such as late in an async continuation of `init()` or from a timer, reaches the page in a patch of its own. Previously it waited for the next state write, message or tick, and never arrived if none came.

## [0.1.1] - 2026-09-29

### Added
- A `pools` block in a thread definition. The pools live in the worker, where methods and `tick(dt)` reach them as `this.pools.name`; the page's store has no pools. Needs wildflowerjs 1.5.4, the first core with pools in stores, loaded as a build with pools (TH-112 warns in development builds when it is not).

### Changed
- Requires wildflowerjs 1.5.4 or later (was 1.5.3), for `watch` below.
- A `watch` block in a thread definition runs in the worker, on both the file route and the inline route (`{ inline: true }`), and its writes reach the page like any other. 1.5.4 is the first core whose stores run `watch`. TH-105 no longer warns about it.

### Fixed
- `reset()` on the page's store puts the inputs back and lets the worker recompute, with no TH-102 warnings.
- `onStoreUpdate` in a definition is treated as a lifecycle hook, not a method on the page's store.
- `storageKey` and `autoSave` in a definition warn TH-105 in development builds, since a worker has no `localStorage`.
- The inline route accepts a function written in method form under a quoted name, such as `'params.region'() { ... }`.

## [0.1.0] - 2026-09-23

First release. `wildflower.thread(name, definition)` runs a store on a Web Worker: the framework loads in the worker and runs the definition as a real store, and the page gets a store of the same name that mirrors it. Writes to inputs and method calls cross to the worker; computed outputs come back as ordinary store writes. Works with wildflowerjs 1.5.3 or later, on every tier, in development and production builds.
