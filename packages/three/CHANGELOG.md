# Changelog

Notable changes to Trillium (`@wildflowerjs/three`). The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Where a change needs a newer
`wildflowerjs` core, the entry says which.

## [Unreleased]

## [0.1.0] - 2026-09-29

First release. `wildflower.three.view(name, options)` registers a store that draws a three.js scene: pools and arrays bind to instanced meshes, and `hovered`, `selected`, `size` and `stats` are store state you can bind in markup. A pool binding with `sync: 'change'` is written only when the pool's `version` changes, so a pool that sits still costs nothing, and a view with `render: 'change'` draws only when something changed, so a still scene costs almost nothing to draw either. Works with wildflowerjs 1.5.4 or later on the tiers with pools, in development and production builds, with three.js 0.160 or later.
