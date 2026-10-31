# Trillium (`@wildflowerjs/three`)

Trillium is the three.js connector for WildflowerJS, used in code as
`wildflower.three`. It draws WildflowerJS data with three.js. A view is a store: you bind pools and
arrays to instanced meshes, and the entity under the pointer, the one
selected, the canvas size and the frame cost are store state you can bind in
markup like any other.

## Use

Serve `dist/three.wf.min.js` (or `dist/three.wf.js`, the development build)
and load it after the framework. Bring your own three.js; the extension never
imports it.

```html
<script defer src="/js/wildflower.min.js"></script>
<script defer src="/js/three.wf.min.js"></script>
<script type="module" src="/js/globe.js"></script>
```

```js
import * as THREE from 'three';

wildflower.three.use(THREE);

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#globe canvas') });
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

const globe = wildflower.three.view('globe', {
  renderer, scene, camera,
  fit: document.querySelector('#globe'),        // size to this element
  occluder: new THREE.Sphere(new THREE.Vector3(), 1),   // hides what is behind the Earth
});

const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.01), new THREE.MeshBasicMaterial(), 5000);
scene.add(dots);
const quakes = wildflower.getQuery('quakes');   // getQuery also starts the query fetching
globe.instanced(() => quakes.rows, dots, {
  name: 'quakes', position: ['x', 'y', 'z'], color: 'color',
});
```

```html
<p data-show="$globe.selected">
  <span data-bind="$globe.selected.entity.place"></span>
</p>
```

The view draws once per frame, after every `tick()` and pool update.

## The view's store

`wildflower.three.view(name, options)` registers a store called `name` and
returns it. Store names are shared across the app, so choose one no other
store or thread uses (3D-103). Its state:

| Field | What it holds |
|---|---|
| `hovered` | The entity under the pointer, as `{ binding, id, entity }`, or `null`. A computed: picking runs only while a binding, watcher or subscription reads it. |
| `selected` | The entity last clicked without dragging, in the same form, or `null`. A click on nothing clears it. |
| `pointer` | `{ x, y }` over the canvas in CSS pixels, or `null`. |
| `size` | `{ width, height }` of the canvas in CSS pixels, kept current whether or not the view uses `fit`. |
| `pixelRatio` | The renderer's pixel ratio. |
| `stats` | `{ syncMs, renderMs, fps }`, averaged over each second. |

`hovered` and `selected` hold a plain copy of the entity, taken when it
changes. `binding` is the binding's `name` and `id` its key (the entity's
`id`, or the field `key` names, or the instance index), so you can look up
the live entity when you need it.

`wildflower.unregister(name)` stops the view. It removes its pointer
listeners and frees the geometries, materials and textures in its scene,
except those another view's scene still uses. It never disposes the
renderer or any controls. Pass `dispose: false` to keep the scene.

### Options

| Option | |
|---|---|
| `renderer`, `scene`, `camera` | Required. Your three.js objects. |
| `fit` | An element. The renderer, pixel ratio (up to `maxPixelRatio`, default 2) and camera aspect follow its size. |
| `inset` | `{ left, right, top, bottom }` in CSS pixels, or a function returning one. The scene centres in the area left free, such as beside a side panel. Call `resize()` when it changes on its own. |
| `occluder` | What hides things, in world space. Picking and `follow()` skip what is behind it. A three.js `Sphere` or `Box3` (or `{ x, y, z, radius }`) is tested exactly and cheaply. An object or a list of objects is raycast for its real shape; meshes the view draws into and hidden objects never count. A function `(x, y, z) => boolean` is your own test. |
| `before` | A function called at the start of each frame, such as `() => controls.update()`. |
| `draw` | A function `(renderer, scene, camera)` that draws the frame in place of the view's own `renderer.render(scene, camera)` call, for a post-processing pass such as an `EffectComposer`. |
| `dispose` | `false` to keep the scene on unregister. |
| `render` | `'frame'` (default) draws every frame. `'change'` draws only after a binding writes, the camera moves, the canvas is resized, or `invalidate()` is called. |
| `maxFps` | Run the whole frame at most this many times a second. |

## Bindings

`view.instanced(source, mesh, spec)` writes entities into an
`InstancedMesh` every frame. `source` is a pool handle or a function
returning an array (a query's rows). An array source is re-read only when the
function returns a different array; pass `live: true` for an array you
change in place.

| Spec | |
|---|---|
| `position` | Three field names: `['x', 'y', 'z']`. Required. |
| `quaternion` | Four field names: `['qx', 'qy', 'qz', 'qw']`, the rotation as a quaternion (what a physics engine gives). Normalized when drawn. |
| `rotation` | Three field names: `['rx', 'ry', 'rz']`, the rotation in radians about each axis, in three.js's `'XYZ'` order (as `Object3D.rotation`). |
| `direction` | Three field names; the instance's +Z points along them. |
| `rotationY` | A field or function: rotation about Y, in radians. |
| `scale` | A field or function, for all three axes; or three field names, `['sx', 'sy', 'sz']`, each along the instance's own axis, before its rotation. With `direction`, the third stretches the instance along the direction. |

A spec sets the rotation one way: `quaternion`, `rotation`, `direction` or
`rotationY`. With `quaternion` or `rotation` beside another of them,
`instanced()` throws 3D-104. (`direction` beside `rotationY` draws the
direction, as it always has.)
| `color` | A field or function: `0xRRGGBB`, or `[r, g, b]` in linear space. |
| `attributes` | `{ name: field }` or `{ name: { field, size } }`: per-instance shader attributes. |
| `name`, `key` | The binding's name and the entity's key field, as `hovered` and `selected` report them. |
| `pickable` | `false` to leave the binding out of picking. |
| `sync` | For a pool: `'frame'` (default) writes it every frame; `'change'` writes it only after `pool.version` goes up, so a still pool costs nothing. With `'change'`, report an in-place change with `pool.markDirty(key)` or `pool.update(key, props)`. |

`view.buffer(source, mesh, spec)` draws a flat array written by something
else, such as a Threads worker's frame: records `stride` floats apart from
`offset`, `count(arr)` of them, `position` and either `direction` or
`quaternion` (four offsets, x, y, z, w; both is 3D-105) as offsets within a
record, and
`color(i)` written once per slot (`binding.recolor()` rewrites
them). With `entity(i)`, the binding is picked in screen space within
`pickRadius` pixels (default 6); `pickFilter(i, x, y, z)` can reject points.

`view.uniform(target, source)` keeps a shader parameter in step with the
app: `target` is anything with a `value` (a TSL `uniform()` node, a
`ShaderMaterial`'s uniforms entry) and `source` a function read each frame.
A changed value is written (a `Color`, vector or array is copied into the
target's own object, and a number is set into a `Color` target) and, under
`render: 'change'`, drawn once. A typed-array target keeps its length: it
takes as much of the source as fits. Returns a function that stops it.

```js
const reveal = uniform(0);                       // from 'three/tsl'
house.uniform(reveal, () => ui.reveal);          // a slider writes ui.reveal
```

`view.video(texture)` draws a texture of a `<video>` at the video's own
time: on the next frame after its `currentTime` moves, the texture is
uploaded and, under `render: 'change'`, drawn once. A video still seeking,
or with no frame yet, waits until it has one. three.js uploads a
`VideoTexture` when the browser presents a new video frame, which a paused
video that was sought need not do before the next draw, so without this a
scrubbed or Kinetic-driven video can show an old frame. Returns a function
that stops it. 3D-114 for anything but a three.js texture of a `<video>`.

```js
const screen = new THREE.VideoTexture(video);
view.video(screen);
```

## Picking and projection

- `view.pick(event)`: the entity on top under a pointer event, as
  `{ entity, binding, name, point, hits }`, or `null`. `entity` is your own
  row or pool entity, not a copy. `hits` lists everything under the pointer
  in the order three.js shows it: markers that write no depth and sit in
  front of the nearest depth-writing hit (higher `renderOrder` first, then
  nearest), then the depth-writing hits (nearest first), then markers behind
  them.
- `view.hits(event)`: that list alone.
- `view.project(entity, binding)`, `view.projectPoint(x, y, z, camera?)`:
  screen position in CSS pixels, or `null` behind the camera, through the
  camera where it is now, also when your code moved it since the last
  frame. Given a `camera`, `projectPoint()` projects through it instead of
  the view's, still in the view's canvas pixels. Inside a Kinetic scene, a
  camera aimed in the view's `before()` is aimed when the view draws, after
  the scene's computeds run, so a computed that projects passes a camera
  aimed from the scene's time (or the scene aims the view's camera in
  `seek(local)`, which runs before them).
- `view.follow(element, getEntity, binding)`: keeps an element over an
  entity each frame by writing its `style.transform` (a `translate` to the
  point, from the canvas's top-left) and `style.display`. Position the
  element absolutely at the canvas's top-left, and put any offset of your own
  on an inner element. It is hidden when there is no entity, its position is
  not a number, or it is behind the camera or the occluder, and it is dropped
  once removed from the page. Returns a function that stops it.
- `view.occluded(x, y, z)`: whether a world point is behind the occluder.
- `view.draw()`: one frame now, whatever `render` and `maxFps` say, for
  code that must have the canvas hold this moment before it reads or
  captures it. Called while the view is drawing (from its `draw` option or
  `before()`), it does nothing (3D-115). `view.canvas()` is the renderer's
  canvas.
- `wildflower.three.views()`: the live views, as their stores.

## Tiers and requirements

wildflowerjs 1.5.4 or later, on the tiers with pools (mini-pool, lite,
core, spa, full), in development and production builds. The frame loop
lives in the pool module, so nano and mini have none, and on those `view()`
warns in development builds (3D-110, from `wildflower.features.pools`).
three.js 0.160 or later.

`WebGPURenderer` (from `three/webgpu`) works too, on WebGPU or its WebGL2
fallback, with TSL node materials. The view draws each frame with
`render()`, which that renderer skips until it has started, so
`await renderer.init()` before calling `view()`.

## Diagnostics

| Code | |
|---|---|
| 3D-101 | `view()` before `wildflower.three.use(THREE)`. |
| 3D-102 | `view()` without a name, a renderer, a scene or a camera, a renderer with no canvas, a `fit` that is not an element, or a `draw` that is not a function. The message says which. |
| 3D-103 | The name belongs to a store that is not a view (store names are shared across the app). Thrown. |
| 3D-104 | Bad `instanced()` arguments. |
| 3D-105 | Bad `buffer()` arguments. |
| 3D-106 | More entities than the mesh holds; the rest are not drawn. |
| 3D-107 | The file loaded before the framework. |
| 3D-108 | A view by that name already exists; it is returned and the new options are ignored. |
| 3D-109 | The file was loaded a second time; the first copy stays in use. |
| 3D-110 | `view()` on a framework build with no frame loop (nano, mini), so the view will never draw. |
| 3D-111 | A `sync: 'change'` binding holds an entity changed in place with no `markDirty()` or `update()`, so the change is not drawn. |
| 3D-112 | `uniform()` was given a target with no `value`, or a source that is not a function (thrown). |
| 3D-113 | A uniform's source threw; the last value stays (development builds, once per binding). |
| 3D-114 | `video()` was given something other than a three.js texture of a `<video>` (thrown). |
| 3D-115 | `view.draw()` was called while the view was drawing a frame, from its `draw` option or `before()`; it did nothing (development builds, once per view). |

## License

MIT
