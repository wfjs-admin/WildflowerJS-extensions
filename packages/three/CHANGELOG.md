# Changelog

Notable changes to Trillium (`@wildflowerjs/three`). The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). Where a change needs a newer
`wildflowerjs` core, the entry says which.

## [0.2.0] - 2026-10-31

### Added
- `quaternion: ['qx', 'qy', 'qz', 'qw']` (normalized when drawn) or `rotation: ['rx', 'ry', 'rz']` (radians, in three.js's `'XYZ'` order) in an `instanced()` spec sets a full rotation per instance, and a `buffer()` spec takes `quaternion` as four offsets. A spec sets the rotation one way: `quaternion` or `rotation` beside another rotation field is 3D-104, and a `buffer()` quaternion beside `direction` is 3D-105. A `quaternion`, `rotation`, or per-axis `scale` that is not four, three, or three field names is 3D-104, and a `buffer()` quaternion that is not four offsets is 3D-105.
- `scale: ['sx', 'sy', 'sz']` in an `instanced()` spec scales each instance along its own axes. With `direction`, the third value stretches the instance along the direction.
- The `draw` option on a view, `draw: (renderer, scene, camera) => ...`, replaces the view's own `renderer.render(scene, camera)` call, so a post-processing pass such as an `EffectComposer` with a depth-of-field pass can draw the frame. A value that is not a function is 3D-102.
- `view.draw()` draws one frame now, whatever `render` and `maxFps` say, for code that needs the canvas to hold the current frame before it reads or captures it. Called while the view is drawing, from its `draw` option or `before()`, it does nothing, with a 3D-115 warning in development builds. `view.canvas()` returns the renderer's canvas.
- `wildflower.three.views()` lists the live views as their stores.
- `view.projectPoint(x, y, z, camera)` projects through the given camera, its matrices brought up to date first, and returns the point in the view's canvas pixels, or `null` behind that camera. Without `camera` it uses the view's camera. Inside a Kinetic scene that aims the view's camera in `before()`, a computed can pass a camera aimed from the scene's time.
- `view.video(texture)` uploads a `<video>` texture on the next frame after the video's `currentTime` changes, never while the video is seeking or has no frame, and draws once under `render: 'change'`. A paused video that was sought, by a scrubber or by Kinetic, shows the frame it was sought to. It returns a function that stops it. Anything but a three.js texture of a `<video>` throws 3D-114.
- `view.uniform(target, source)` keeps a shader parameter in step with the app. `target` is any object with a `value`, such as a TSL `uniform()` node or an entry in a `ShaderMaterial`'s uniforms, and `source` is a function read each frame. A changed value is written to the target, with three.js math objects and arrays copied into the target's own object and a number set into a `Color` target, and a view with `render: 'change'` draws once. A typed-array target takes as much of the source as fits. It returns a function that stops it. A bad target or source throws 3D-112. A source that throws leaves the last value in place, with a 3D-113 warning in development builds.
- The README notes that `WebGPURenderer` works after `await renderer.init()`.

### Changed
- Warnings print as `[3D-106] ...`, where they printed `[3D 3D-106] ...`. With a development build of wildflowerjs 1.5.5 or later they print through `wildflower.diagnostic()`, which adds the Docs line and keeps each one in `wildflower.diagnostics`; with an earlier core or a production one the line is the same and comes from Trillium.

### Fixed
- `view.projectPoint()` and `view.project()` project through the camera where it is now, its matrices brought up to date first. Previously a camera moved in code since the last frame projected from half-updated matrices.

## [0.1.0] - 2026-09-29

First release. `wildflower.three.view(name, options)` registers a store that draws a three.js scene: pools and arrays bind to instanced meshes, and `hovered`, `selected`, `size` and `stats` are store state you can bind in markup. A pool binding with `sync: 'change'` is written only when the pool's `version` changes, so a pool that sits still costs nothing, and a view with `render: 'change'` draws only when something changed, so a still scene costs almost nothing to draw either. Works with wildflowerjs 1.5.4 or later on the tiers with pools, in development and production builds, with three.js 0.160 or later.
