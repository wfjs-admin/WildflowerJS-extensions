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
| `direction` | Three field names; the instance's +Z points along them. |
| `rotationY` | A field or function: rotation about Y, in radians. |
| `scale` | A field or function. |
| `color` | A field or function: `0xRRGGBB`, or `[r, g, b]` in linear space. |
| `attributes` | `{ name: field }` or `{ name: { field, size } }`: per-instance shader attributes. |
| `name`, `key` | The binding's name and the entity's key field, as `hovered` and `selected` report them. |
| `pickable` | `false` to leave the binding out of picking. |
| `sync` | For a pool: `'frame'` (default) writes it every frame; `'change'` writes it only after `pool.version` goes up, so a still pool costs nothing. With `'change'`, report an in-place change with `pool.markDirty(key)` or `pool.update(key, props)`. |

`view.buffer(source, mesh, spec)` draws a flat array written by something
else, such as a Threads worker's frame: records `stride` floats apart from
`offset`, `count(arr)` of them, `position` and `direction` as offsets within a
record, and `color(i)` written once per slot (`binding.recolor()` rewrites
them). With `entity(i)`, the binding is picked in screen space within
`pickRadius` pixels (default 6); `pickFilter(i, x, y, z)` can reject points.

## Picking and projection

- `view.pick(event)`: the entity on top under a pointer event, as
  `{ entity, binding, name, point, hits }`, or `null`. `entity` is your own
  row or pool entity, not a copy. `hits` lists everything under the pointer
  in the order three.js shows it: markers that write no depth and sit in
  front of the nearest depth-writing hit (higher `renderOrder` first, then
  nearest), then the depth-writing hits (nearest first), then markers behind
  them.
- `view.hits(event)`: that list alone.
- `view.project(entity, binding)`, `view.projectPoint(x, y, z)`: screen
  position in CSS pixels, or `null` behind the camera.
- `view.follow(element, getEntity, binding)`: keeps an element over an
  entity each frame by writing its `style.transform` (a `translate` to the
  point, from the canvas's top-left) and `style.display`. Position the
  element absolutely at the canvas's top-left, and put any offset of your own
  on an inner element. It is hidden when there is no entity, its position is
  not a number, or it is behind the camera or the occluder, and it is dropped
  once removed from the page. Returns a function that stops it.
- `view.occluded(x, y, z)`: whether a world point is behind the occluder.

## Tiers and requirements

wildflowerjs 1.5.4 or later, on the tiers with pools (mini-pool, lite,
core, spa, full), in development and production builds. The frame loop
lives in the pool module, so nano and mini have none, and on those `view()`
warns in development builds (3D-110, from `wildflower.features.pools`).
three.js 0.160 or later.

## Diagnostics

| Code | |
|---|---|
| 3D-101 | `view()` before `wildflower.three.use(THREE)`. |
| 3D-102 | `view()` without a name, a renderer, a scene or a camera, a renderer with no canvas, or a `fit` that is not an element. The message says which. |
| 3D-103 | The name belongs to a store that is not a view (store names are shared across the app). Thrown. |
| 3D-104 | Bad `instanced()` arguments. |
| 3D-105 | Bad `buffer()` arguments. |
| 3D-106 | More entities than the mesh holds; the rest are not drawn. |
| 3D-107 | The file loaded before the framework. |
| 3D-108 | A view by that name already exists; it is returned and the new options are ignored. |
| 3D-109 | The file was loaded a second time; the first copy stays in use. |
| 3D-110 | `view()` on a framework build with no frame loop (nano, mini), so the view will never draw. |
| 3D-111 | A `sync: 'change'` binding holds an entity changed in place with no `markDirty()` or `update()`, so the change is not drawn. |

## License

MIT
