# Kinetic API

Everything is on `wildflower.kinetic`. The full reference, with every option
and default, is https://kinetic.wildflowerjs.com/docs/reference/.

Contents, one entry for each `##` section below:

- [A scene](#a-scene)
- [Transitions](#transitions)
- [Effects](#effects)
- [Lottie and animated images](#lottie-and-animated-images)
- [Motion](#motion)
- [Camera](#camera)
- [Motion blur](#motion-blur)
- [Paths and shapes](#paths-and-shapes)
- [Distributions and falloffs](#distributions-and-falloffs)
- [Text and data](#text-and-data)
- [Audio](#audio)
- [Footage](#footage)
- [Interactive mode](#interactive-mode)
- [Control, readiness, self-test and rendering](#control-readiness-self-test-and-rendering)

## A scene

```javascript
wildflower.kinetic.scene('promo', {
    // Tracks as data: each entry becomes a computed of `local`. A track is
    // { at, to, ease, unit, round }, with `at` in the clip's seconds and
    // `to` all numbers, all colors, or all text with only its numbers and
    // colors changing. `ease` is one ease, or an array with
    // one per segment (one fewer than the keyframes).
    keyframes: {
        card: { opacity: { at: [0, 0.5], to: [0, 1] }, rotate: -4 },   // an object of tracks: a style object; a number is that key at every time
        x:    { at: [0, 1], to: [0, 100], unit: 'px' },      // one track: one value
        rise: { translateY: { at: [0, 1, 2.4, 3], to: [60, 0, 0, -60], ease: ['spring', 'linear', 'power3.in'] } },
        wipe: { clipPath: { at: [0, 0.6], to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'], ease: 'power3.out' } }   // a text track
    },
    edges: { enter: 0.3, exit: 0.3 },          // ramps for the `enter` and `exit` computeds
    inputs: { price: { type: Number, required: true, validator: (v) => v > 0 } },
    waitFor: ['sales'],                        // queries frame 0 waits for (full tier)
    root: { style: { background: 'bg' } },     // the scene's own root, from its own values
    computed: { /* any component computed */ },
    seek(local) { /* after every seek; a returned promise holds the frame capture */ }
});
```

Every scene has these computeds, which a definition must not redefine:

| Computed | Value |
|---|---|
| `time` | Composition seconds. |
| `local` | Seconds since the clip's `data-start`, with the host composition's offset, plus `data-playback-start`. Held at the clip's edges: 0 before the clip and the clip's duration after it, where the scene is hidden, so a hidden scene's computeds and `seek(local)` stop running (a seek that leaves `local` as it was skips the scene's `seek(local)`; `check()` runs it on every seek). A timing attribute (`data-start`, `data-duration`, `data-end`, `data-media-start`, `data-playback-start`, `data-playback-rate`) edited under the root moves the clip and those timed from it at the next seek; a seek to the time already shown does not work it out again. Equal to `time` for a scene with no `data-start` and no ancestor with one or with `data-composition-id` (KN-112 in development). |
| `clipFrame` | `Math.round(local * fps)`, the frame number within the clip. |
| `fps` | The clock's frames per second (a render's own, else the root's `data-fps`, else `config({ fps })`, else 30). Write a frame count as `n / this.fps`, never a hard-coded rate. |
| `progress` | 0 to 1 from the clip's start to its last captured frame, `duration - 1/fps`. |
| `remaining` | Seconds to the clip's end, `Infinity` without one. |
| `enter`, `exit` | 0 to 1 over the first `edges.enter` seconds, and over the `edges.exit` seconds that end on the last captured frame. A render captures frames 0 to `duration * fps - 1`, so `exit` is 1 on the last frame in the file. |
| `presence` | `enter * (1 - exit)`: 0 at both ends of the clip, 1 between. 1 without `edges`. For a value the scene's code needs, such as a stagger; a clip's plain fade is `data-clip-enter`/`data-clip-exit`. |
| `vars` | The composition variables: the root's declared defaults with `window.__hfVariables` over them, which the batch script sets per row, or the values a renderer's runtime resolved. |
| `inputs` | The declared values from `vars`, checked before `init()`. A default in `data-composition-variables` wins over the input's own (KN-134 when they differ). |

Twelve keys fold into one `transform`, written in this order, each only
when present:

| Key | Default unit | Written as |
|---|---|---|
| `perspective` | `px` | `perspective()` |
| `translateX`, `translateY` | `px` | `translate(X, Y)`, the absent axis as `0px` |
| `translateZ` | `px` | `translateZ()` |
| `rotateX`, `rotateY` | `deg` | `rotateX()`, `rotateY()` |
| `rotate` | `deg` | `rotate()`, in the screen's plane |
| `skewX`, `skewY` | `deg` | `skewX()`, `skewY()` |
| `scale`, `scaleX`, `scaleY` | none | `scale()`, `scaleX()`, `scaleY()` |

The element gets its depth, moves, turns in 3D, turns in the plane, shears
and takes its size; `perspective()` is first because it acts only on what
follows it. A turn about x or y shows depth only with the `perspective` key
or a CSS `perspective` on the parent. A `blur` track becomes
`filter: blur()`, in `px`. These keys take numbers; a color or text track
on one is KN-120. Any other property is a track of numbers, colors or
text. A spec with both `blur` and `filter`, or with `transform` beside any
of the twelve keys, is KN-120, since one would overwrite the other. A bad
`extrapolate`, `round` or `unit` is KN-120 and a bad ease or spring option
KN-121, when the scene is defined. An `ease` array whose length is not one
per segment, or with an entry that is not an ease, is KN-121 with the
entry's index.

A text track's `to` is strings with numbers in them, for `clipPath`,
`filter`, `boxShadow`, `backgroundPosition`, `maskPosition`,
`fontVariationSettings` or a gradient's stops:
`clipPath: { at: [0, 0.6], to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'] }`.
Each keyframe splits into numbers (the CSS number token), colors (hex,
`rgb()`, `rgba()`) and the text between, which keeps units, words, quoted
strings and `url()`; a number right after a letter, digit or `#` stays text.
Every keyframe has the same text, character for character, with numbers and
colors in the same places, so `0px` against `10%` does not match; a
mismatch is KN-120 when the scene is defined, naming the keyframe, and the
development build's message gives the two keyframes and the first
difference. Numbers are written with at most four decimals, no
trailing zeros and no `-0`, after `round`; colors as `rgb()` or `rgba()`.
`ease`, `extrapolate` (`'extend'` moves every number and color, `'wrap'`
and `'mirror'` repeat the keyframes), `round` and `space` (the colors in
oklch) work as on numbers and colors, and a spring runs on past the last key;
`'identity'` and `unit` are KN-120. A text track on `transform` cannot sit
beside the transform keys, and one on `filter` not beside `blur`.

SVG path data in a text track is read by the SVG 2 path grammar. That covers
a value that is all path data (it starts with `M` or `m` and parses), and the
inside of `path("…")` or `path('…')` anywhere in a value, for `d`, `clipPath`
or `offsetPath`. Each command letter is text and its arguments are numbers, so
`M190-30C130` reads as `M`, 190, -30, `C`, 130; an arc's two flags are text
and never move. Keyframes need the same commands in the same places and the
same flags; otherwise KN-120, whose development message ends "the paths have
different commands; wildflower.kinetic.matchPaths() makes any two paths
morphable".
The path is written with a space after each letter and between numbers,
four decimals at most. A value that starts with `M` and does not parse is
ordinary text.

On an SVG element, a `rotate` or `scale` track turns about the `viewBox`
origin unless the element has `transform-box: fill-box; transform-origin:
center`. A transform track writes the CSS `transform`, which replaces the
element's `transform` attribute, so put the placement on a wrapping `<g>`
and the track on the shape inside it.

Two valid tracks still misbehave, and development builds warn once per track
when the scene is defined or `styleAt()` first reads it. A length property
(`width`, `height`, `top`, `left`, `fontSize`, `borderRadius`, margins,
paddings, `gap`, `offsetDistance` and the like) given numbers with no `unit`
is dropped by the browser (KN-122); add `unit: 'px'` (or `'%'` on
`offsetDistance`). A plain number on such a property warns the same way,
once per place; set it in CSS or give it a track with a unit. `lineHeight` warns too, since a bare
number there is a multiple of the font size; `unit: ''` keeps the multiple.
A spring segment that the next keyframe reaches while the spring is more
than 2% of its travel from rest jumps to that keyframe (KN-123); lengthen
the segment, or give the spring the last two keyframes of its track, where
it runs on.

Every seek flushes the page's pools (`wildflower.flushPools()`) once its
scenes have settled, so entities written with `update()` in `seek(local)`
are in the DOM before the frame is captured, whenever the pool mounted.

## Transitions

```html
<div id="intro" class="layer" data-start="0" data-duration="3">…</div>
<!-- the overlap, 2.5 to 3 s, is a push: this clip comes in from the right, intro goes out to the left -->
<div class="layer" data-start="intro - 0.5" data-duration="4" data-clip-transition="push from-right power3.inOut">…</div>
<!-- an entrance over the clip's first 0.6 s and an exit over its last 12 frames -->
<h1 data-start="1" data-duration="4" data-clip-enter="wipe from-left 0.6" data-clip-exit="fade 12f">Launch</h1>
```

```javascript
const { transition, ramp } = wildflower.kinetic;
transition('push', 0.5, { direction: 'from-left' });   // { in: { translate: '-50% 0%' }, out: { translate: '50% 0%' } }
transition('flip', ramp(this.local, 1.6, 2.2, 'power2.inOut'));   // p already eased; bind .in and .out with data-bind-style
```

`data-clip-transition="kind [direction] [ease]"` goes on the incoming clip. The
clip it replaces is the one sibling with `data-start` whose window holds this
clip's start and ends before this clip ends (a backdrop running past it never
counts). The transition runs from this clip's start to the end of that
sibling's window: the overlap a relative `data-start` such as `"intro - 0.5"`
makes. `data-clip-enter="kind [direction] length [ease]"` and `data-clip-exit` apply the
incoming styles over the clip's first `length` and the outgoing styles over
its last. The kind comes first, the rest in any order. A length is seconds
(`0.6`, `0.6s`) or frames (`18f`, over the composition's fps); `data-clip-transition`
takes none. The ease is any `ease()` name, `power2.inOut` by default. The
clips can be scenes or plain HTML. The three attributes carry `data-clip-` so
they never meet the framework's own `data-transition`.

| Kind | Incoming | Outgoing | Default direction |
|---|---|---|---|
| `fade` | `opacity` 0 to 1 | `opacity` 1 to 0 | none |
| `push` | `translate` from 100% on the side to 0 | `translate` to 100% on the opposite side | `from-right` |
| `cover` | slides in as `push`, over the outgoing clip, with `z-index: 1` for the whole overlap | stays | `from-right` |
| `reveal` | stays, under | slides out as `push`, with `z-index: 1` for the whole overlap | `from-right` |
| `wipe` | `clip-path: inset()` opens from the side | stays | `from-left` |
| `iris` | `clip-path: circle()` from the center to the corners | stays | none |
| `clock` | `clip-path: polygon()` sweeps from 12 o'clock | stays | `clockwise` (or `anticlockwise`) |
| `zoom` | `scale` 1.15 to 1, `opacity` 0 to 1 | `scale` 1 to 0.9, `opacity` 1 to 0 | none |
| `blur` | `filter: blur()` 16px to 0, `opacity` 0 to 1 | blur 0 to 16px, `opacity` 1 to 0 | none |
| `flip` | `rotate: y` 90deg to 0 in the second half | 0 to -90deg in the first half | none |
| `luma`, `halftone`, `dissolve` | `filter` with a map, dark parts first (Luma transitions, below) | stays; in `data-clip-exit` the clip goes in the map's order | none (`halftone` takes a side) |

The sides are `from-left`, `from-right`, `from-top`, `from-bottom`; positions
are percentages of the clip's own box. p runs from 0 on the window's first
frame to 1 on its last captured frame, `1/fps` before the window ends, so the
outgoing clip is at its final state there and hidden by its own window on the
next frame. At p = 1 the incoming clip carries no transition style (but
`cover`'s `z-index`), and at p = 0 the outgoing clip carries none (but
`reveal`'s `z-index`). Kinetic writes
`translate`, `scale` and `rotate`, never `transform`, so a transition composes
with the clip's own `transform`; and `opacity`, `clip-path`, `filter`,
`z-index`, inline, only inside the window, putting back the clip's own inline
value after, including one written on the clip while the window ran. Four
decimals at most. On every seek, with or without a runtime on the page, so `check()` compares and `render()` captures them.
`flip` reads as depth only under `perspective` on the clips' common parent.
`cover` and `reveal` need positioned clips for their `z-index`. A clip can have
`data-clip-transition` and `data-clip-exit`; two transitions on one clip at once (its
`data-clip-exit` and the next clip's `data-clip-transition`) both apply, their
opacities multiply, and the later clip's wins any other shared property.

### Luma transitions

```html
<div class="layer" data-start="intro - 0.8" data-duration="5" data-clip-transition="halftone from-left 32px power2.inOut">…</div>
<div class="layer" data-start="8" data-duration="4" data-clip-enter="luma url(maps/burn.png) soft 1s">…</div>
<div class="layer" data-start="12" data-duration="4" data-clip-exit="dissolve 20f">…</div>
```

`luma`, `halftone` and `dissolve` mask the clip with a grayscale map: the
clip shows where the map is darker than a threshold that sweeps through the
map's tones over the eased progress, so dark parts come in first. The mask is
`clamp(k (threshold - map))`, the threshold running from `-1/k` at p = 0 to
`1 + 1/k` at p = 1, k 30, or 8 with `soft`.

| Kind | Map | Tokens |
|---|---|---|
| `luma` | the brightness of the image in `url(path)`, stretched over the clip's box | `url(path)` (needed), `invert` (light parts first), `soft` |
| `halftone` | `1 - cone` at each dot of a grid turned by the angle (each dot opens from its center); with a direction, `0.55 (1 - cone) + 0.45 ramp`, the ramp 0 on that side | a direction (none: every dot at once), the cell `24px` (28px), the angle `45deg` (45deg), `soft` |
| `dissolve` | value noise from a seeded hash at the grain's size, seeded from the clip's id, else its place | the grain `3px` (2px), `soft` |

In `data-clip-transition` the mask is on the incoming clip only, and the
outgoing clip stays, as with `wipe`. In `data-clip-exit` the mask is 1 minus
the incoming one, so the clip goes in the map's order. Kinetic keeps one
hidden `<svg>` in the root with a `<filter>` per clip and attribute, writes
`filter: url(#kinetic-map-N)` on the clip inside the window only, and changes
only the filter's map and threshold per seek. The filter's region is the
clip's own box, so everything the clip draws outside it (overflowing
children, a shadow) is cut while the transition runs, and a clip whose own
box is empty shows nothing then (KN-115 in development when it holds
elements): give the clip a size. The built-in maps are PNGs drawn at the
clip's size, at readiness and once for each new size it takes, the same on
every load, and each size's PNG is kept for the life of the page, since
`check()` compares the filter's URL, so a clip whose size animates keeps one
for every size it has taken. Give a `dissolve` clip an `id`, since a clip
added before one without an id changes its noise. A `luma` map is fetched at readiness, `check()` and `render()`,
never during a seek: a luma clip added after readiness stays hidden through
its transition until the next `ready()`. One that fails to load or decode is
KN-117, a console error on every build that holds readiness and rejects
`ready()` and `render()`, and is fetched again by the next load. A map from
another origin needs `Access-Control-Allow-Origin` from its server. `blur`
and these three all write `filter`. Kinetic applies transitions clip by clip
in markup order, each clip's `data-clip-transition`, then `data-clip-enter`,
then `data-clip-exit`, and for a property two of them write on one clip at
once, the one applied last is used (`opacity` multiplies).

KN-115: an unknown kind or token, a token the kind does not take (a `url()`
on any kind but `luma`, `invert` on any kind but `luma`), `luma` with no
`url()`, two of one token, a length on
`data-clip-transition`, a `data-clip-enter`/`data-clip-exit` with no length or one longer than
the clip, both `data-clip-transition` and `data-clip-enter`, or `data-clip-enter`/`data-clip-exit`
on an element with no `data-start`. KN-116: a `data-clip-transition` that overlaps no
sibling or more than one. Either way the clip is left without its transitions.
KN-156: a binding on the clip's tag, a scene's `root:` block or page code wrote
a property the transition writes, during its window; put the scene's own
styling on an inner element. A value written between two seeks is kept as the
clip's own and put back after the window.
`transition()` throws KN-100 for an
unknown kind, a direction the kind does not take, a p that is not finite, or
`luma`, `halftone` and `dissolve`, which need a clip.

## Effects

```javascript
const { scene, effect, ramp } = wildflower.kinetic;
scene('poster', {
    init() {
        this.fx = effect(this.element.querySelector('canvas'), {
            scene: this,                                   // the scene's local time, disposed with it
            source: this.element.querySelector('img'),     // an <img>, <video> or <canvas>
            kind: 'halftone',                              // 'halftone', 'stipple', 'splatter', 'dither' or 'duotone'
        });
    },
    seek(local) {
        this.fx.set({ cell: 14, angle: 45, density: ramp(local, 0, 2), ink: '#1b1530', paper: '#f3ead8' });
    },
});
```

`effect(canvas, { scene, source, kind, ...params })` draws with WebGL 2 and returns
`{ set(params), dispose() }`. Every parameter is optional and can change on
every frame for one draw. A canvas holds one live effect; `effect()` on a
canvas whose effect is still live is KN-100. On a stipple, a splatter or the
boil kind, `fps: n` moves the seed on n times a second of the layer's time
and `delay: s` holds the first seed for s seconds; `set()` changes
both, and either on another kind is KN-100.

`scene: this`, given in a scene's own methods, is the option every layer
takes (`effect()`, `shade()`, `blur()`, `text()`, `lottie()`): the layer
runs on that scene's local time and is disposed with the scene, wherever
and whenever it was made, after an `await` too. Without it, the layer runs
on composition time until `dispose()`. `scene` is the scene's component,
never its element or name (KN-100), and `set()` cannot change it (KN-100).

| Kind | Parameters (default) |
|---|---|
| `halftone` | `cell` px (12), `angle` deg (45), `shape` (`'circle'`, `'square'`, `'line'`), `density` (0), `ink`, `paper`, `color` (`'ink'`, or `'source'`: each dot in the color under it) |
| `stipple` | `scale` px (1), `seed` whole number (1), `density` (0), `contrast` (1), `grade` (how far a speck shrinks where the source is light, 0 to 1; 0), `speck` (`'square'`, `'round'`), `color` (`'ink'`, `'source'`), `ink`, `paper` |
| `boil` | `amount` px (2, about the largest move), `scale` px (30, the noise's size), `seed` (1), `rough` (1 to 6 octaves; 1); the source itself, each pixel taken from nearby by smooth noise: line boil on a canvas, image or video; `fps` draws it again with a new seed |
| `splatter` | round drops in several sizes, more where it is darker, large ones only where it is darkest: `min` and `max` (the smallest and largest drops' size in px, 2 and 24; up to six sizes between, each about half the last), `seed` (1), `density` (0), `contrast` (1), `warp` (how ragged a drop's edge is, 0 to 1; 0.3), `vary` (how much each drop's strength varies, 0 to 1; 0.5), `color`, `ink`, `paper` |
| `dither` | `matrix` (2, 4 or 8, Bayer; 4), `levels` (2 to 16; 2, more give steps between ink and paper), `scale` px (1), `color`, `ink`, `paper` |
| `duotone` | `shadow`, `highlight`, `contrast` (1), `density` (0) |

Brightness is the luma `0.2126 R + 0.7152 G + 0.0722 B`, a transparent pixel
reading as white. `density`, -1 to 1, moves halftone, stipple, splatter and
duotone toward ink (a halftone's dots grow, and fill the cell at full darkness);
colors are `#rgb`, `#rrggbb` (alpha optional) or `rgb()`, ink and shadow
black, paper and highlight white by default. The shaders read the
parameters, the source and an integer hash, never a time or a random number.
Kinetic draws every live effect after each seek has settled, after the
footage has landed, so a `<video>` source shows the seek's frame; while the
clock plays that is every frame. With the HyperFrames runtime on the page
the runtime plays the media itself, so a video source can be a frame early
(https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page). An effect is drawn again only when its
parameters, size or source frame changed (an `<img>` once loaded, and on its
load event while paused, a `<video>` when its time moves, a `<canvas>` on
every seek). The canvas gets `preserveDrawingBuffer` (so `check()` hashes it
and `render()` captures it) and a drawing size of its shown size (after
transforms) times the device pixel ratio, at most its CSS box times that,
the CSS box itself in a render; a canvas with no CSS size is held at the
size it had. The source is stretched over it, so give the canvas the
source's shape. Readiness decodes each `<img>` source and draws each effect
once. `dispose()` releases the WebGL context, and that canvas takes no new
effect. An effect made with `scene` is disposed when the scene is
destroyed, and one whose canvas left the page at the next seek, so
`dispose()` is for stopping one sooner. One whose canvas was never on the
page stays live until `dispose()` or, made with `scene`, until the scene is
destroyed.
A context the browser loses draws nothing until restored (KN-191 in
development), then is set up again. KN-100: an unknown kind or parameter, a
bad value, a source that is not an `<img>`, `<video>` or `<canvas>`, a
canvas with no WebGL 2 context. KN-204: a source from another origin
without CORS, at its first draw, with its URL; that seek rejects, once, and
the source is skipped until it changes. HTML is no source: for still HTML,
an SVG filter (patterns.md).

### Shading, light, grain and blur: shade() and blur()

```javascript
const { scene, shade } = wildflower.kinetic;
scene('hills', {
    init() {
        shade(this.element.querySelector('canvas.ink'), { scene: this, kind: 'splatter', fps: 2, marks: (m, t) => {
            m.edge({ width: 40, ink: '#2c5a46', falloff: 'power2.in', clip: { circle: [300, 240, 120] } })
             .band({ from: [0, 520], to: [1280, 500], width: 30, ink: '#d99a2b' })
             .glow({ at: [250, 200], radius: 150, invert: true, ink: '#1b3a2c', amount: 0.6, clip: { circle: [300, 240, 120] } });
        } });
    },
});
```

`shade(canvas, { scene, kind, …, marks })` paints a density field (how much ink each
point gets) and draws it with `effect()` as `kind` `'stipple'` (the
default), `'splatter'`, `'halftone'` or `'dither'`, each speck, drop, dot or
cell in the color of the field under it, over a transparent paper; as
`'light'`, the field itself, smooth, for leaks, glows and stripes of light;
or as `'grain'`, gray noise as strong as the field (a new pattern `fps`
times a second, one pattern held with `fps` at 0, the default; its size is
`scale` px, 1 by default). Grain over the whole frame is the finish's
`grain` (the default, still unless its `fps` is set); `'grain'` here is for grain that varies across the
frame, such as heavier at the edges ("Which to use" in rules.md).
Two more kinds print up to four inks over each other, as a poster printer
does, each mark's `ink` one ink (marks in the same ink add up), blended by
`'multiply'` by default: `'crachis'`, each ink sprayed as still drops
covering 0.918 of the area at density 1 and less as the density falls,
overprinted drops multiplied (`dot`, CSS px, 1.6; `spread`, 0.6; `seed`;
a new seed lays new drops, about 0.1 s at 1080p, so keep `fps` low or 0);
and `'ink'`, smooth, each ink absorbing light as its density rises, in
linear light, so a blend between two inks passes through their overprint's
color, never gray. In both, `paint(fn, { ink })` names its ink; a fifth
ink, or `paint()` without one, is KN-100.
`blend` sets the canvas's CSS
`mix-blend-mode`: `'screen'` for light, `'overlay'` for grain and
`'normal'` for the rest by default. Returns
`{ set(params), redraw(), dispose() }`. The `marks(m, t)` option, which
every layer needs (KN-100 without it, and for a third argument), is called whenever the field
needs painting (before every draw with `freeze: 'seed'`, once a scatter with
`freeze: 'all'` or `move`) with the time to paint (the scene's local time
with `scene: this`, else the composition time); each call on `m` adds
a mark and returns `m`:

| Mark | Paints |
|---|---|
| `band({ from, to, width, side })` | along the line from `from` to `to`, `width` px to each side (`side: 'both'`) or one (`'left'`, `'right'`, walking from `from` to `to`), falling off away from the line; for a stripe, one edge of a block (clipped to it), or spray at the frame's edge |
| `glow({ at, radius, invert })` | from the point out to `radius`, falling off outward; `invert: true` rises outward and is full past the radius, which shades a sphere from an offset point clipped to the circle |
| `edge({ width, clip })` | inward from the whole outline of its clip (required), `width` px deep; for a rim |
| `path({ d, width, side })` | along the SVG path data `d`, full on it and falling off over `width` px to each side (`side: 'both'`) or one (`'left'`, `'right'`, walking along the path); for a shade down one side of a flat shape (with the shape as its clip) or a stripe along a curve |
| `fill({ amount })` | its amount everywhere in its clip; for a tint |
| `paint(fn, { clip })` | `fn(ctx, t)` paints the field itself, ink as color and density as alpha |
| `marks([…])` | marks as data: `{ band: { from, to, width }, ink, … }`, `{ fill: 0.3, clip }`, `{ paint: fn }` |

Every mark takes `clip` (`{ circle: [x, y, r] }`, `{ rect: [x, y, w, h] }`,
`{ polygon: [[x, y], …] }`, `{ path: 'M…' }` or a `Path2D`). Every mark but
`paint` also takes `amount` (0 to 1, the density at full; 1), `ink` (its
color; an alpha thins the mark; black) and `falloff` (an ease from the far
end, 0, to full, 1: `'linear'`, `'smooth'`, any ease, or a function);
`paint`'s function sets color and density itself. Coordinates are px from
the canvas's top left. Marks laid over each other combine as alpha layers:
density b over a gives a + b(1 − a), so two marks of 0.5 give 0.75.

The layer's own options: `fps` (n: a new seed for stipple's and
splatter's noise n times a second, each seed's span a scatter; 0, the
default, keeps one), `delay` (s: the first seed held for s seconds of
the layer's time before the boil starts, for a shape that holds still while it
rises; 0), `seed` (1), `opacity` (0 to 1; 1) and what moving
marks do between scatters, which needs `fps` above 0 (at 0 the marks are
painted for every frame): `freeze: 'seed'` (the default: marks painted for
every frame and the seed kept, so specks come and go at a moving edge),
`freeze: 'all'` (marks painted for the scatter's start only, so the whole
texture holds still and jumps on each scatter) or `move(t)` returning
`{ x, y, scale, rotate, origin }` (marks painted for the scatter's start,
then the canvas's CSS transform set to `move(t)` with `move(start)` undone,
so the specks move with marks that all move together; the layer owns the
canvas's transform, and `set({ move: null })` stops it). `density` (-1 to 1, 0 by default) gives a stipple, a
splatter or a halftone more ink everywhere or less, as `effect()`'s
`density` does. The kind's other
parameters (`scale`, `contrast`, `grade`, `speck`, `min`, `max`, `warp`, `vary`,
`cell`, `angle`, `shape`, `matrix`, `levels`) pass through. Each mark gives its ink, so `ink`, `paper`,
`color` and `source` on the layer, or in `set()`, throw KN-100. `set()`
changes `marks`, `blend`, `fps`, `delay`, `freeze`, `move`, `opacity`, `seed`,
`density`, `mask` and the kind's parameters; values all as they were change
nothing, so `seek()` can pass its options every frame. A frozen layer
(`freeze: 'all'` or `move`) paints its marks once a scatter: when they read
something that changed, such as a knob, `redraw()` paints them again. `mask` (a shape as `clip` takes it) cuts what the layer draws to
the shape, so a speck, drop or dot crossing its outline is cut there, where
a mark's `clip` only limits where its density is painted; `set({ mask:
null })` takes it off. Each
layer is one canvas and one WebGL context, painted again only when its
marks can have changed, so marks of one kind drawn together belong on one
layer. KN-100: a bad option or mark (a mark's from the seek's draw; KN-121
for an unknown `falloff` ease).

```javascript
// Tilt-shift: sharp across the middle, blurred toward the top and the bottom.
blur(this.element.querySelector('.over'), { scene: this, radius: 10, marks: (m) => m
    .band({ from: [0, 0], to: [1280, 0], width: 280, side: 'right', falloff: 'smooth' })
    .band({ from: [1280, 720], to: [0, 720], width: 280, side: 'right', falloff: 'smooth' }) });
```

`blur(element, { scene, radius, …, marks })` blurs what is under `element` by `radius`
px (8) where the marks' field is full and leaves it sharp where it is
empty: the element gets `backdrop-filter: blur()` and a `mask-image` of the
field, a quarter of its width and height, painted in the seek's media phase
so the seek waits for the mask to decode and a render never takes a stale
one. Leave the element empty (the mask cuts its own content too); an
ancestor with opacity below 1, a filter or a mask limits the blur to what
is inside it. The marks are the ones above, in px from the element's top
left; their ink's color is not used, though an ink's alpha thins the mask
as `amount` does. The mask blends between sharp and fully blurred and does not vary
the radius from point to point. `fps` and `freeze: 'all'` hold the mask
between steps; with `freeze: 'seed'` (the default) it follows the marks, and
is encoded again only when its pixels change. `set()` changes `radius`,
`fps`, `delay`, `freeze` and `marks`, `redraw()` paints the marks again, and
`dispose()` takes the blur and the mask off. A blur made
with `scene` is disposed with the scene. KN-100 for a bad element,
option or mark.

### The drawn look: draw()

```javascript
const { scene, draw } = wildflower.kinetic;
scene('sheet', {
    init() {
        this._sheet = draw(this.element.querySelector('canvas'), { scene: this, start: 0.5, end: 8,
            inks: { lead: { tool: 'pencil' }, pen: { tool: 'pen' }, red: { tool: 'pencil', color: '#c4452f' } },
            strokes: (s) => s
                .construct({ points: [[200, 540], [1720, 540]], ink: 'lead' })
                .contour({ d: 'M960 300 A240 240 0 1 1 959.9 300', ink: 'pen', group: 'outline' })
                .hatch({ clip: { circle: [1010, 600, 200] }, ink: 'red', angle: -50, spacing: 8 })
                .text({ text: 'Fig. 1', font: '600 56px Manrope', x: 200, y: 160, ink: 'pen' }) });
    },
});
```

`draw(canvas, { scene, inks, …, strokes })` draws strokes the way a hand
does: slow at each end and fast in the middle, wandering a little, pressing
in and lifting off, thinner and lighter where it is fast. `inks` names up to
16 inks, each `{ tool, color }`: `'pencil'` (graphite, `#4a4b51`, catching
only the peaks of the paper's tooth unless pressed hard), `'pen'` (an even
line, `#222222`) or `'ballpoint'` (`#1c2f7a`, blobbing where it starts and
skipping where it is fast); `color` gives a colored pencil or pen. Inks over
each other darken as real inks do. `strokes(s)` plans the drawing, each call
returning `s`:

| Call | Draws |
|---|---|
| `construct({ d \| points })` | light, fast planning lines |
| `contour({ d \| points, twice })` | an outline, drawn twice a little apart and never quite closed (`twice: false` for once) |
| `hatch({ clip, angle, spacing, cross })` | parallel lines across a clip (a shade() clip shape), `angle` in degrees (-50), `spacing` px (7); `cross: true` adds a second layer |
| `accent({ d \| points })` | one firm line |
| `text({ text, font, x, y, letter })` | display text written letter by letter, each along its center line, from the baseline's start; `letter` s a letter (0.11) |
| `pause(s)` | a wait before the next stroke |

Each call takes `ink` (an ink's name), `pressure`, `at` (pins its start, s
on the same clock as `start`) and `group` (a name for `timeOf()`). The
strokes follow one another from `start` (s of the scene's local time with
`scene: this`, else the composition time), with a short pen lift between;
`end` paces the hand so the last of those strokes ends then (a stroke pinned
with `at` keeps its time), and `drawn: true`
shows the drawing already drawn. The hand: `wobble` (1), `pressure` (0.85),
`speed` (1), `tooth` (0 to 1, 0.7: how much the paper breaks a line), `lead`
(1, the tip's size) and `seed` (7). Its sizes and speeds are for a 1280 px
wide composition and scale with `data-width`; coordinates are px of the
canvas. `paper` paints the sheet in a color, blended normally; without it
the ink is multiplied onto what is under the canvas.

The strokes are baked once, at the first draw; every frame is then one
WebGL pass showing the ink laid by its time, so any seek order draws the
same pixels. The paper's tooth belongs to the frame: a drawing moved by CSS
(its canvas or an ancestor) catches the paper anew as it moves, at no cost.
Text in a font still loading is baked again once it loads. Returns
`{ duration, timeOf(group), set(params), redraw(), dispose() }`: `timeOf()`
gives `{ start, end }` of a group's strokes (the whole drawing without one,
`null` for an unknown group), for timing the rest of the piece to the
drawing. KN-100 for a bad call, option, ink or stroke (a `font` CSS cannot
read, such as a family with no size), for a 17th ink, and for a canvas with
no WebGL 2 context. A context the browser loses draws nothing until
restored (KN-191 in development), then the drawing is drawn again.

### Line boil: boil() and effect()'s boil kind

```javascript
const { scene, boil } = wildflower.kinetic;
const BLOB = 'M 200 80 C 280 60 330 140 300 210 C 270 280 150 290 110 220 C 70 150 120 100 200 80 Z';
scene('sketch', {
    computed: {
        // An SVG shape's outline wobbles, drawn again 8 times a second.
        blob() { return { d: boil(BLOB, { amount: 3, scale: 25, fps: 8, t: this.local }) }; },
    },
});
```

Line boil moves edges by up to about `amount` px of smooth noise `scale`
px across (the noise is stretched and eased with tanh, so `amount` is about
the largest move seen), with a new seed `fps` times a second. The two
calls:

- `boil(d, options)`: SVG path data, each subpath sampled every `detail`
  px (2) and each sample moved along its normal by noise that changes once
  every `scale` px along the outline, returned as a polyline
  (`M … L … Z`). Options `amount` (2), `scale` (30), `fps` (0, which
  keeps one seed), `delay` (0), `t`, `seed` (1) and `detail` (2). `t` and
  `fps` step the seed (`t` is usually the scene's `this.local`), and
  `delay` holds the first seed for that many seconds of `t`, as a layer's
  does. A closed subpath
  stays closed, with no jump where it closes when it is longer than
  `scale` px; an open one stays open. Return `{ d: boil(…) }` from a
  computed and bind it to the `<path>` with `data-bind-attr`. It works on
  paths only: HTML, page text included, does not boil. For a boiled title,
  draw it as a path, or with `text()` on a canvas and through the boil
  effect.
- `effect(canvas, { scene, source, kind: 'boil', amount, scale, seed, rough, fps })`:
  a canvas, an image or a video, each pixel taken from nearby, with a new
  seed `fps` times a second of the layer's time (`delay` holds the
  first).

KN-100: bad path data, a bad element or a bad option.

### Type with a weight per letter: text()

```javascript
const { scene, text } = wildflower.kinetic;
scene('title', {
    init() {
        // window.WORK_SANS: outlines from the outline baker, baked with the variable name
        // WORK_SANS, loaded by a <script> before this one.
        text(this.element.querySelector('canvas'), { scene: this, font: window.WORK_SANS, lines: (m, t) => {
            m.line('KINETIC', { at: [640, 360], size: 96, align: 'center', valign: 'middle', tracking: 0.1 },
                (i) => ({ wght: 500 + 400 * Math.sin(t * 2 - i * 0.3) ** 2 }));
        } });
    },
});
```

`text(canvas, { scene, font, lines })` draws lines of type on a canvas from a
variable font's baked outlines, each letter with its own weight and slant.
The outline baker (https://kinetic.wildflowerjs.com/docs/baker/) makes the
outlines from a `.ttf` or `.otf` for chosen characters, and offers them as a
`.js` file that sets a global (`window.OUTLINES` by default) or as JSON.
The baker keeps each glyph at a few stops on each axis (the ends, the
default, and more wherever blending two stops misses the font's own outline
by more than 2 font units), and `text()` blends the two stops either side
of a value after mapping it through the font's avar; advances and kerning
blend the same way. Kinetic places each letter from its advance and
kerning at its own setting and draws it straight onto the canvas, so
nothing is laid out by the page, nothing snaps to a whole pixel, and the
browser prepares no font weight while the clock plays (animating
`font-variation-settings` on page text can stutter while the browser
prepares each new weight).

The `lines(m, t)` option, which `text()` needs (KN-100 without it, and for
a third argument), is called before each draw with the time (the scene's local
time with `scene: this`, else the composition time).
`m.line(string, options, letter)` adds a line; options
`at` ([x, y], px from the canvas's top left), `size` (px, 16), `align`
(`'left'`, the default, `'center'`, `'right'`), `valign` (`'baseline'`,
the default, or `'middle'`, the capitals' middle on y), `tracking` (em
between letters, 0), `spacing` (`'natural'`, the default, each letter at
its own advance and kerning, as After Effects' per-character spacing;
`'fixed'`, each centered in the slot of its default advance with no
kerning, so the line keeps its width), `color` (`'#000'`) and `wght` or
`slnt` for the whole line. `letter(i, ch)` returns that letter's values,
which replace the line's: `wght`, `slnt`, `dx`, `dy` (px), `scale` and
`rotate` (degrees, about its middle), `opacity` (1; at 0 it still takes
its space), `blur` (px) and `color`. On a font with no slnt axis, `slnt`
skews the letter (negative leans right). A kerning pair takes the left
letter's setting; a line's width has no tracking after its last letter.
The canvas is drawn at its shown size times the device pixel ratio, its
CSS box in a render. The handle's `set({ font, lines })` swaps the outlines,
the lines function or both, and `dispose()` stops it; one made with `scene` is disposed with the scene.
KN-100: outlines that are not the baker's, an unknown or bad option or
letter value, a character the outlines do not hold.

## Lottie and animated images

```javascript
const { scene, lottie, animatedImage } = wildflower.kinetic;
scene('logo', {
    init() {
        this.anim = window.lottie.loadAnimation({     // the page loads lottie-web; Kinetic does not
            container: this.element.querySelector('.mark'),
            renderer: 'svg', loop: false, autoplay: false, path: 'logo.json',   // 'svg' or 'canvas'
        });
        lottie(this.anim, { scene: this, start: 0.5, rate: 1, loop: false });   // same task as loadAnimation()
    },
    destroy() { this.anim.destroy(); },   // frees it in lottie-web, and Kinetic lets go
});

const sticker = animatedImage('wave.gif');   // a GIF, animated WebP or APNG, at the top of the file
scene('sticker', {
    seek(local) { sticker.draw(this.element.querySelector('canvas'), local); },   // also { loop: true | false }
});
```

`lottie(animation, { scene, start, rate, loop })` puts a lottie-web animation on the
clock. On every seek, once loaded, Kinetic calls `goToAndStop(frame, true)`,
frame `(t - start) * rate * frameRate`, with t the scene's local time with
`scene: this` and the composition time without: frame 0 before `start`, and past the end `totalFrames - 1`
(lottie-web's own hold; `totalFrames` is past its layers) or, with
`loop: true`, the start again. Frames, not milliseconds, so the
animation's own `setSpeed()` does not compound with `rate`. Subframes on
(`setSubframe(true)`). Put on the clock's frame at once and when it loads.
The svg renderer renders like the page, the canvas renderer through the
render's canvas copies. Readiness, `check()` and `render()` wait for each
animation to load (`isLoaded` or `DOMLoaded`; readiness also decodes the SVG
`<image>` elements under the root that the svg renderer adds for image
layers; an animation in segments is waited for until its first part);
a `data_failed`, or lottie-web's `error` before it has loaded (`: its data`
in the message), is KN-180, a console error on every build that holds
readiness, marks the page failed and rejects `ready()` and `render()`,
giving the animation's `name`, file and scene. A file that is not JSON
fires neither in lottie-web 5.13 and leaves readiness waiting; an event
before `lottie()` is missed, so call it in the same task as
`loadAnimation()`. Returns a handle whose `dispose()` hands the animation back
(no more seeks, listening or waiting); its `destroy()`, which lottie-web
needs to free it, and the removal of the scene it was given hand
it back too, and `lottie()` again for the same animation replaces its
options (readiness waits for the new one). The HyperFrames runtime on the
page seeks lottie-web animations itself
(https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page).
Duck-typed: `goToAndStop()`, `setSubframe()` when present,
`addEventListener()` (`DOMLoaded`, `data_failed`, `error`, `destroy`),
`isLoaded` (missing means loaded), `totalFrames`, `frameRate`, and for the
message `name`, `path`, `fileName`. KN-100: no
`goToAndStop()` and `addEventListener()`, options not an object, an unknown
option, a `start` that is not finite, a `rate` not above 0, a `loop` not a
boolean.

`animatedImage(src)` fetches and decodes the file once per URL (the same URL
returns the same handle) with WebCodecs' `ImageDecoder`, every frame kept as
a bitmap. The handle: `duration` (seconds) and `frames`, 0 until decoded;
`frameAt(t, { loop })`, the index on screen t seconds in, 0 until decoded;
`draw(canvas, t, { loop })`, the canvas cleared and the frame stretched over
it with no transform of the context's (its alpha and composite mode are the
page's), nothing until decoded. Frames last as long as the file says, a
frame of 10 ms or less 100 ms (as browsers play it); before 0 the first
frame; past the end it plays as the file says (ImageDecoder's
`repetitionCount`: for ever, or n + 1 plays and then the last frame held);
`loop: true` wraps for ever, `loop: false` holds after one play. The frame
comes from the durations alone. Every frame stays decoded, width × height ×
4 bytes (300 frames at 1080p are about 2.5 GB): keep animated images small,
and use footage for long clips; a decode that fails partway frees what it
made. Readiness, `check()` and `render()` wait for
every animated image asked for so far (one asked for after `ready()`
resolved, at the next call); `animatedImage(src, { scene: this })` ties the
wait to that scene, so an image only a scene that has left the page asked
for is passed over. A fetch or decode that fails is KN-181, a console error on every
build that holds readiness, marks the page failed and rejects `ready()` and `render()`, with the
file in the message and, in development, the CORS and file: notes. No
`ImageDecoder` (Safari at the time of writing): KN-100 from
`animatedImage()`; show the file in a plain `<img>` there (patterns.md).
KN-100 also for a `src` that is empty or not a string, a `draw()` target that
is not a canvas or has a WebGL context, a t that is not finite, options not
an object, an unknown option, a `loop` not a boolean.

## Motion

```javascript
const { interpolate, styleAt, ease, spring, settle, ramp, mix, stagger, posterize, loop, hold, focus, random, noise, noise2, noise3 } = wildflower.kinetic;
interpolate(t, [0, 1], [0, 100], { ease: 'power2.out', extrapolate: 'clamp', round: true });
   // numbers, colors or text; extrapolate 'clamp' (default) | 'extend' | 'identity' (numbers only)
   //   | 'wrap' (the keyframes repeat) | 'mirror' (forward, then backward, in turn), or extrapolateLeft/Right
   // round: true, or a whole number of decimals
   // ease: one ease, or one per segment: ['spring', 'power3.in'] for three keyframes;
   //   an ease array is read when first seen, so new eases take a new array (an edit in place is not seen)
   // space: 'rgb' (default) | 'oklch', how colors mix, in a color or a text track too
ramp(t, 1.2, 2, 'power3.inOut');  // t's progress from 1.2 to 2 s as 0 to 1, clamped, eased; KN-100 unless to > from
mix(-300, 0, p);                  // a + (b - a) * p, p not clamped
mix('#521a78', '#aa3de6', p);     // two colors mixed as interpolate mixes them: 'rgb(...)' or 'rgba(...)'
mix('#0000ff', '#ffff00', 0.5, { space: 'oklch' });   // 'rgb(0, 186, 174)': lightness and chroma linear, hue the shorter way,
                                  // a gray takes the other's hue, out of sRGB loses chroma; per channel it is 'rgb(128, 128, 128)'
mix('inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)', p);   // two text values with the same text; a mismatch is KN-100
styleAt(t, tracks);               // the style object for time t, from an object of tracks; with only plain numbers
                                  // the time is never read, so any t does (styleAt(0, { translateX: 40, scale: 1.5 }))
styleAt(this.local, { rotate: SPIN, scale: 1 + 0.14 * this.pulse });   // a key is a track or a number: the number is its value
                                  // at every time, with the key's default unit, in the transform's order; never build
                                  // 'scale(' + s + ')' by hand. Not finite, or a string, is KN-120; a number on a length
                                  // outside the transform (width: 120) gets no unit and warns (KN-122)
                                  // one track alone is KN-120: read it with interpolate(t, track)
interpolate(0.5, { at: [0, 1], to: [0, 10] });   // 5: one track's value with its own options; with unit: 'px', '5px';
                                  // nothing after the track (KN-100)
ease('back.inOut');               // CSS: linear, ease, ease-in, ease-out, ease-in-out, cubic-bezier(), steps(n[, start])
                                  // GSAP: power1-4, sine, expo, circ, back, elastic, bounce, with .in/.out/.inOut; bare = .out
                                  // 'smooth': the smoothstep; as the one ease of a number track with 3+ keys, one curve through
                                  //   them all, velocity continuous at each key between, zero at the ends (a move through
                                  //   several points that does not stop at each); per segment or on a color track, the smoothstep
                                  // 'spring', { spring: { stiffness, damping, mass } } or { spring: { duration, bounce } };
                                  // or a function of progress
ease('spring')(0.5);              // a spring ease takes seconds, not progress: the same as spring(0.5)
spring(t, { stiffness: 100, damping: 10, mass: 1, from: 0, to: 1, overshootClamping: false });
                                  // no overshoot when damping >= 2 * Math.sqrt(stiffness * mass): 20, 28.3, 40 for stiffness 100, 200, 400
spring(t, { duration: 0.8, bounce: 0.3 });   // within 2% of `to` from 0.8 s on; bounce 0 (default) never overshoots, toward 1 more
                                  // the damping ratio is 1 - bounce; not with stiffness, damping or mass (KN-100)
settle({ stiffness: 100, damping: 10 });   // 0.8076: the seconds until either form stays within 2% (KN-123's measure)
stagger(i, n, { each: 0.05, total, from: 'first', grid: [cols, rows], axis: 'x', ease: 'linear', seed: 1 });
   // item i of n's delay in seconds: styleAt(this.local - stagger(i, n, opts), tracks)
   // from 'first' | 'last' | 'center' | 'edges' (outermost first) | 'random' (seeded rank) | an index
   // delays count from the item nearest the origin, which starts at 0 ('center' on an even n: the middle two);
   // span = total, or each * (farthest distance - nearest); an item at fraction d of that spread starts at ease(d) * span
sweep(i, n, p, { width: 0.3, shape: 'ramp', from: 'first', ease, seed: 1 });
   // item i of n's weight, 0 to 1, under a window `width` of the items wide that sweeps through them as p goes 0 to 1
   // (p = ramp(this.local, a, b)): the range selector; the letter's change scaled by it, styleAt(w, RISE) with RISE's keys at [0, 1]
   // shape 'ramp' rises and holds; 'square' is 1 under the window; 'triangle' and 'round' bump and return to 0; ease shapes the rise
   // from as stagger's, in one dimension; spaces are rows and count; KN-100 for a bad i, n, p or option, KN-121 for an unknown ease
repeat(n, { translateX, translateY, rotate, scale: 1, opacity: [1, 0.2], offset: 0, origin: '50% 100%' });
   // rows { key, i, style } for a data-list of n copies, copy k the transform of copy k - 1 again as one matrix(): a turn with a
   // move is an arc, a scale with a move a spiral, about the element's transform-origin (origin writes it); opacity [first, last]
   // across the copies, or the last's from 1; offset shifts the series (negative centers it on the original); numbers at a time,
   // so a track drives any of them; KN-100 for a bad n or option
   // grid: straight-line distance between cells (axis: one axis only); 'edges' to the nearest edge
posterize(t, 12);                 // Math.floor(t * 12 + 1e-9) / 12: animation on twos at 24 fps
loop(t, 1, 3);                    // t before 1, then cycling through [1, 3); 3 at t = Infinity
hold(t, 2, 0.5);                  // t before 2, 2 until 2.5, then t - 0.5
focus(z, plane, { range: 200, max: 12, steps: 4 });   // blur px for depth z with the focal plane at plane; steps quantises for bands
focus(z, plane, { depth: 150 });  // a depth of field: sharp within 150 either side of the plane, the knee from the band's edges
random(seed)();                   // a seeded generator (mulberry32), 0 to 1; seed is a number or a string
noise(x, seed);                   // 1-D gradient noise, -1 to 1, 0 at whole numbers; peaks near ±0.95, 95% within ±0.62;
                                  // the seed is required here and in noise2/noise3 (KN-100 without one), where wiggle's defaults to 1
noise2(x, y, seed);               // 2-D, -1 to 1, 0 on the integer lattice; peaks near ±0.75, 95% within ±0.35
noise3(x, y, this.local * 0.4, seed);   // 3-D: time as the third coordinate drifts a 2-D field; peaks near ±0.5, 95% within ±0.25
                                  // scale for the amount you want: 1 + 1.8 * noise3(...) stays mostly in 0.55..1.45
                                  // a coordinate that is not finite gives 0
wiggle(t, { frequency: 2, amplitude: 10, seed: 1 });   // After Effects' wiggle: -10 to 10, a new value every 1/2 s, smooth
   // passes through a value the seed draws in -amplitude..amplitude every 1 / frequency s, never past the ones either side
   // one call per axis, each with its own seed: x, y and a smaller rotate
wiggle(posterize(t, 15), { frequency: 15, amplitude: 2, seed: 3 });   // stop motion: a value of its own on each step
```

## Camera

```javascript
const { camera, depth, shake } = wildflower.kinetic;
camera(t, { z: { at: [0, 2.5], to: [0, 260] }, pan: 5 }, { perspective: 1000, shake: shake(t, 'handheld') });
   // the world's style: { transform, transformStyle: 'preserve-3d', transformOrigin: '50% 50%' }
   // keys x, y, z, pan, tilt, roll, zoom: each a track of numbers (as styleAt() takes, no unit) or a number;
   // left out or undefined = at rest (0, zoom 1); tracks that is not an object = all at rest
   // the camera's directions: x right (truck), y down (crane), z into the scene (dolly), px;
   // pan right, tilt up, roll clockwise, deg; zoom scales the picture with no parallax change
   // x, y, z run along the scene's axes and the turns are about the camera's own position (a dolly on tracks)
   // transform: perspective(P) scale(zoom) translateZ(P) rotateZ(-roll) rotateX(tilt) rotateY(pan) translateZ(-P) translate3d(-x, -y, z)
   // shake: one shake() result or an array of them, added to x, y and roll; null or undefined = none
depth(-1600);                     // a layer's style: { transform: 'translateZ(-1600px) scale(2.6)' }, (P - z) / P, so it fills the frame at rest
depth(-1600, { perspective: 1000, fill: false });   // the same P as the camera's; fill: false leaves out the scale
shake(t, 'handheld', { seed: 1, amount: 1, speed: 1 });   // { x, y, roll } px and deg, layered noise, the same everywhere
   // 'handheld' 0.7 Hz 16/11 px 1.1 deg; 'rumble' 7 Hz 5.4/7.2 px 0.36 deg;
   // 'impact' 11 Hz 61/47 px 4.3 deg, t = seconds since the hit, 0 before it, then x e^(-t / 0.32)
```

```html
<div data-component="shot" data-start="0" data-duration="12" style="position:absolute;inset:0">
  <div data-bind-style="world" style="position:absolute;inset:0">        <!-- world() { return camera(this.local, CAM); } -->
    <div class="layer" data-bind-style="far">…</div>                      <!-- far() { return depth(-1600); } -->
    <div class="layer" data-bind-style="title">…</div>                    <!-- .layer: absolute, 0 0, 100% x 100% -->
  </div>
</div>
```

A layer is a direct child of the world, or sits inside wrappers that each have
`transform-style: preserve-3d` (it is not inherited). A wrapper without it, or
one with `opacity` below 1, a `filter`, `overflow` other than `visible`,
`clip-path`, `mask`, `mix-blend-mode` or `isolation`, draws its layers flat.
A layer can carry any of these on itself, so a fade goes on the layer.
The world itself takes none of them and no background (a background is a
surface at z = 0 that hides every layer behind it): put the backdrop on the
scene's root or the farthest layer, and crop on the scene's root or the stage.
Transitions write `opacity`, `clip-path` or `filter` on a clip, so a clip with
layers at several depths is flat while it transitions. `depth()` scales about
the element's own center, so it holds only a layer centered on the world; put a
small element inside a full-frame layer. A dolly whose `z` reaches `P - z` for
a layer at depth `z` draws that layer over the whole frame and then not at
all, with no error: keep `z` below that for every layer on screen, or hide the
layer first. KN-100: a key outside the table (with `pan`, `tilt` or `roll`
suggested for `rotateY`, `rotateX` or `rotate`), a zoom or perspective below
0.0001, a shake that is not a shake() result, a depth at or behind the eye, an
unknown profile, a t that is not finite, an amount below 0 or a speed of 0 or
less. KN-120: a malformed track, a track of text or colors, a track with a
`unit`, or a value neither a number nor a track.

## Motion blur

```javascript
const { smear } = wildflower.kinetic;
smear(t, tracks, { samples: 8, angle: 180, fps: 30 });   // rows { key, style } for a data-list of copies
   // copy k of N styled at t + (k / N) * (angle / 360) / fps; opacity / N; mixBlendMode 'plus-lighter'
   // the opacity is the style's (1 when none or ''; '50%' = 0.5; 'inherit' is KN-100), never the stylesheet's: a base opacity goes in the style
   // the style is tracks as styleAt() takes, or a function (s) => style object; samples 1 to 32; angle above 0, up to 360
   // fps defaults to the clock store's; samples 1, or inside a render with a shutter: one row, the style at t
await wildflower.kinetic.render({ shutter: 180 });                        // each frame the average of 8 seeks over half the frame
await wildflower.kinetic.render({ shutter: { angle: 360, samples: 16 } }); // samples 2 to 64; 0, false or null: off
wildflower.kinetic.config({ shutter: 180 });                              // the default for every render(), the Render button's too
await wildflower.kinetic.render({ finish: { grain: 0.3, vignette: 0.35 } });   // the finishing pass on every frame, after the shutter, before the encoder
   // fields, each off unless given, a number for its amount or an object of its parts:
   // grain: { amount, size: 1, fps: 0 }  vignette: { amount, radius: 0.5, softness: 0.6 }  bloom: { amount, threshold: 0.8, radius: 24 }
   // aberration: amount  soften: amount  dust: { amount, size: 1 }
   // grade: { exposure: 0, contrast: 1, saturation: 1, temperature: 0, lift: 0, gamma: 1, gain: 1 }
   // deterministic by the frame number; dust changes every frame; the grain changes fps times a second (0 to 240; 0, the default, keeps it still,
   // a paper's tooth; the frame rate is film grain); config() reports each field as its named parts, { grain: { amount, size, fps } }, which
   // config({ finish }) takes back; a light frame needs a high bloom threshold
   // 0, false or null: off; a wrong field, part or range is KN-100 naming it; no WebGL 2 is KN-100
   // the pass opens one more WebGL context, and Chrome keeps 16, dropping the oldest: keep a piece with a finish to 15 WebGL layers (KN-192 at 16)
wildflower.kinetic.config({ finish: { grain: 0.2, vignette: 0.25 } });     // the default for every render(), the Render button's too
   // and the page shows it live: vignette, grain, dust, the grade's exposure/contrast/saturation and soften, as overlays
   // Kinetic keeps as the root's last children (hidden for a render); bloom and aberration are the file's only.
   // An element in the root marked data-finish takes the overlays in the root's place, so controls beside it stay clear of the grade and the soften
   // Grain over the whole frame is this grain (the default), film grain with fps at the frame rate; shade()'s 'grain' kind is for grain that varies across the frame; dust is specks, not grain
```

```html
<div style="isolation: isolate" data-list="copies" data-key="key">   <!-- copies() { return smear(this.local, { rotate: { at: [0, 2], to: [0, 1440] } }); } -->
  <template><div class="wheel" data-bind-style="style"></div></template>
</div>
```

The copies need the isolated group: inside it they add only to each other,
summing to the element where all of them overlap, and without it
`plus-lighter` adds the scene behind them too and brightens it. Inside a
camera's world the group is a layer, or sits inside one, since `isolation`
on a wrapper draws the layers under it flat. `smear()` reads the clock
store's `shutter` (the angle of the render with a shutter that is running, 0
otherwise), so its computed runs again when such a render starts and ends.
KN-100: a t that is not finite, a style that is neither tracks nor a function,
a style function that returns no object, samples, angle or fps out of range;
KN-120: a malformed track.

The shutter seeks each frame `samples` times at
`t + (k / samples) * (angle / 360) / fps`, forward from the frame's time and
short of the next, so a cut on a frame stays a cut, and writes their average
(summed in whole numbers, each color weighted by its alpha: the same pixels
on every run, and a stage with no background blurs as over black).
`this.clipFrame` and the store's `frame` keep the frame's own number through
its samples. It blurs everything: DOM, camera moves, Trillium views, canvas
sources and footage. Footage at the composition's rate stays sharp at 180
degrees, and at 360 with the default 8 samples up to 60 fps; at 360 with many
samples (from 34 at 30 fps, from 17 at 60 fps) the last ones leave a faint
trace of the next source frame. A render takes about `samples` times as long.
With the HyperFrames runtime on the page `render()` does not apply the
shutter and warns once per page in development (KN-205,
https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page). KN-100 before the page is touched for an angle outside
(0, 360], samples outside 2 to 64, a field other than angle and samples, or
another type, an array included.

## Trails

```javascript
const { trails } = wildflower.kinetic;
trails('ghosts', this.local, { style: BALL, count: 8, lag: 0.022, fade: 0.9, scale: 0.09 });
   // rows { key, k, t, style } for a data-list: copy k (1 to count) styled at t - k * lag, its opacity the style's
   // times 1 - fade * k / count, shrunk by scale(1 - scale * k) after its own transform; normal blending, the same
   // in a render with a shutter; style is tracks as styleAt() takes, or (s) => style object
   // defaults: count 6 (1 to 64), lag 0.04 s, fade 0.8, scale 0
trails('ribbon', this.u, { d: ROUTE_D, length: 0.1, by: 'length' });   // path data: trimPath(d, u - length, u, { by })
trails('dots', this.u, { d: FLIGHT_D, count: 12, by: 'segment' });   // rows { i, key, x, y, heading, u, state }:
   // count marks (1 to 1000) evenly along the path, distribute('path')'s fields, state 'past' once u reaches one
```

Every kind is a pure function of its time or place, so each frame seeks.
Ghosts are copies of the element at earlier times; ribbon and dots follow a
mover along its path, `u` its place from 0 to 1 (by segment for a path
written as one segment per even step of time). A trail of something that is
no function of time, such as the pointer or a slider, needs earlier frames a
seek cannot rebuild, and is not a kind: ghosts of a style that reads a store
sit on the element. KN-100 for an unknown kind, a `t` or `u` that is not
finite, or a missing or bad option, the option in the where.

## Paths and shapes

```javascript
const { matchPaths, shape, trimPath, pathLength } = wildflower.kinetic;
matchPaths([SQUARE_D, CIRCLE_D], { segments: 8, align: true });
   // two or more d strings or path("…") values → the same forms, as absolute cubics with the
   // same commands and count, ready for a track's `to`; subpaths match in order
shape('polygon', { sides: 6, radius: 100, cx: 0, cy: 0, rotate: 0 });   // first vertex up at rotate 0
shape('star', { points: 5, outer: 100, inner: 40, cx, cy, rotate });
shape('sector', { radius: 100, inner: 0, from: 0, to: 270, cx, cy });  // degrees clockwise from up; inner > 0: a ring
shape('arrow', { from: [0, 0], to: [200, 0], width: 20, head: 40 });    // the head is twice as wide as long
trimPath(FLIGHT_D, 0, ramp(this.local, 1, 3));          // the first part of a path as path data, so it can fill or feed a canvas
trimPath(ROUTE_D, this.u - 0.08, this.u);               // the stretch just behind a mover; from and to clamp to 0..1
trimPath(FLIGHT_D, 0, this.tau / T, { by: 'segment' }); // each segment an equal share: a path sampled evenly in time, cut at a time
trimPath([TOP_D, BOTTOM_D], 0, p);                      // a band between two edges drawn partway, closed; either edge direction
pathLength(D);                                          // the path's length in its own units: a distance d along it is trimPath(D, 0, d / pathLength(D))
```

`trimPath()` returns the stretch of a path between two fractions of it as
absolute cubics, with a move where it crosses into another subpath, and
`''` when `from` is at or past `to`. By length, a fraction is of the whole
length; by segment, each segment is an equal share and the fraction inside it
is the curve's own parameter, which follows a mover whose speed changes when
the path was written as one segment per even step of time. A closed subpath
taken whole keeps its `Z`, and cut partway leaves it off. A `path("…")`
value comes back in the same form, and trimmed to nothing it is a lone move,
`path("M x y")`, which draws nothing as a `d` and clips all as a `clipPath`
(`''` would take the style off). For a band, each edge is one subpath
running from the band's start to its end; a bottom edge written the other
way is turned round. Use it in place of the dash recipe when the part must
fill, feed a canvas or three.js, or be sampled; never cut curves by hand.
KN-100 for `d` that is no path data, a `from` or `to` that is not finite, an
unknown `by`, or band edges that are not two one-subpath paths.

`matchPaths()` takes any path data (M L H V C S Q T A Z, relative, implicit
repeats, glued numbers and flags), turns every segment into a cubic (arcs by
the SVG 2 implementation notes, in pieces of 90 degrees at most, and a `Z`
away from the start closed with a line), and cuts segments, longest pieces
first, until each subpath has the most segments any path has there and at
least `segments` (default 8, the fewest that keeps a square to a circle from
twisting; polygons morph evenly at the least common multiple of their corner
counts, 24 for a triangle and an octagon). With `align` (default true) each
closed subpath after the first path's is reversed when it runs the other way
and started nearest the first path's start. A `Z` is written where every path
closes the subpath. KN-100 for fewer than two paths, an empty path, path data
the grammar rejects (the development build's message gives the index),
different subpath counts, or a bad `segments`.

`shape()` returns a `d` string, so a track or computed can drive any option.
A sector with `to` equal to `from` is `''` (no line from the center); 360
degrees or more is two arcs, so it closes, and a whole ring keeps its hole; a
`to` below `from` runs anticlockwise. An arrow shorter than its head is the
head alone. KN-100 for an unknown kind, a missing option, a value that is not
finite, or a `sides` or `points` that is not whole. A radius, `outer`,
`inner`, `width` or `head` is a length of 0 or more, and a sector's `inner` is
below its `radius`; a value outside that is KN-100. A star's `inner` above
its `outer` is not checked and draws the star turned over. A count does not
interpolate, so morph between counts with `matchPaths()`.

## Distributions and falloffs

```javascript
const { distribute, falloff } = wildflower.kinetic;
distribute('line', n, { from: [x, y], to: [x, y] });             // both ends included
distribute('circle', n, { cx, cy, radius, from: 0, to: 360 });  // cx, cy, radius required; degrees clockwise from up; a full turn spaced 360 / n
distribute('grid', n, { columns, cell: 40, cx, cy });            // cell: px or [w, h]; row by row, as stagger({ grid }); col, row;
   // a short last row starts at the left edge, so fewer points than columns sit left of cx
distribute('spiral', n, { radius, cx, cy });                     // sunflower: golden angle, equal area per point; heading outward;
   // point i at radius * sqrt((i + 0.5) / n), so a lone point sits off the center
distribute('scatter', n, { width, height, cx, cy, seed: 1 });   // seeded even scatter (best candidate)
distribute('path', n, { d });                                    // evenly by length; closed: n even steps round
   // each → [{ i, x, y, heading, u }]: heading the direction of travel for rotate() (0 right, 90 down), u 0 → 1
falloff('radial', p, { x, y, radius, inner: 0 });   // 1 inside inner, 0 at radius
falloff('linear', p, { x, y, angle, width });       // an edge heading toward angle: 1 behind, 0 at width ahead
falloff('band', p, { x, y, angle, width });         // 1 on the line across angle, 0 at width either side
falloff('ring', p, { x, y, radius, width });        // 1 at radius, 0 at width either side: a ripple as radius grows
falloff('shape', p, { d, x: 0, y: 0, scale: 1, width: 0, rule: 'nonzero' });   // 1 inside the path, 0 at width px outside
   // at width 0 a point exactly on the edge reads 1 on some edges and 0 on others: use a width above 0 for points on the outline
   // p is { x, y } or [x, y]; every kind takes ease and invert; → a weight 0 to 1
```

Move the field with the scene's time and give each point its weight in a
computed, as a scale, an opacity, a color mix or a delay
(`styleAt(this.local - (1 - w) * 0.6, tracks)`). A scatter's search and a path's
measure and outline are kept for their arguments, so calling these on every
frame costs the arithmetic alone. KN-100 for an unknown kind, a bad n, a point
without x and y, or a bad option, with the option in the where.

## Text and data

```javascript
const { split, typewriter, scramble, format, textMetrics, ticks, rank, captions, moment, srt, beat } = wildflower.kinetic;
split(text, 'letter');            // rows { i, key, text, space } by grapheme; or 'word'
typewriter(t, text, 20);          // the first floor(t * cps) graphemes
scramble(t, text, { duration: 1, chars: 'ABC…0-9#%&*+=?', fps: 20, seed: 1 });
   // grapheme k of L settles at duration * (k + 1) / L, scrambled from chars until then, changing fps times a second;
   // whitespace never scrambled; the same for the same seed
format(1234.5, { maximumFractionDigits: 0 });   // Intl.NumberFormat, 'en-US' unless { locale }; a locale or options Intl refuses is KN-100
textMetrics('is a function of', '700 54px "Work Sans"');   // { width, left, right, ascent, descent }: measureText()'s, in px
textMetrics(title, '900 100px "Work Sans"', { width: 1600 }).size;   // the font size in px at which the line is 1600 wide
textMetrics(line, font, { letters: true, tracking: 0.05 }).letters;  // split()'s rows + x (left edge) and width (advance), kerning in
   // font: the CSS font shorthand (one the canvas refuses is KN-100); tracking in em, between graphemes, never after the last
   // readiness waits for each font measured with, so ready(), check() and render() never measure the fallback
   // a web font from @font-face measures the same everywhere, a system font may not; needs a document;
   // give that @font-face font-display: block or swap: with optional, text first drawn in the fallback can stay in it;
   // never estimate a letter's place by counting characters: measure it
ticks(0, 87, 5);                  // about 5 round values from <= min to >= max: [0, 20, 40, 60, 80, 100]; count 2 to 1000
   // a range far smaller than its ends (1 to 1 + 1e-15) gives values that are not round
rank(t, rows, (row, keyframe, index) => row.values[keyframe], { ascending: false });
   // [{ row, index, value, position }] at a fractional keyframe t; position 0 is first
   // by() is called for the whole keyframes either side of any t; a value that is not finite (a keyframe past the data) counts as 0
captions(t, words, { maxWords: 5, maxChars: 40, maxGap: 1, sentences: true, hold: 0.4 });
   // maxWords, maxChars whole from 1; maxGap, hold seconds from 0 (any may be Infinity); sentences a boolean;
   // another value is KN-100, captions(t, words, { maxGap }) in its where
   // words: [{ id?, text, start, end }], a word-timed transcript in seconds
   // → { index, start, end, text, words: [{ key, text, start, end, state: 'past'|'active'|'future', p }], empty }
moment(this.local, CHAPTERS);     // the row of a timing table current at t, never a lookup loop of your own:
   // → { index, row, start, end, since, p, next, empty, rows: [{ key, row, state: 'past'|'active'|'future', p }] }
   // CHAPTERS: [{ at, end?, ...your fields }], plain objects; a row runs from at to its own end, or the next row's at (an end of null is none);
   // the last with no end runs on, with p 0; before the first row, or in a gap after an end, empty with index -1,
   // row null and next the row to come; rows in time order (index and key too), and of equal at the last is current;
   // checked and sorted once per array and length, as captions() groups; KN-100 for a bad row, at or end
srt(fileText);                    // SRT or WebVTT as that transcript: one word per entry, ids 'w0', 'w1', ...;
   // a cue's words share its time by length in characters, the last ending at the cue's end;
   // line breaks become spaces; tags, {\an8}-style override tags, cue settings, a BOM and NOTE/STYLE/REGION blocks
   // are dropped, a < that opens no tag stays, &amp; &lt; &gt; &nbsp; &lrm; &rlm; are decoded (&nbsp; keeps its words
   // together); each timing line starts a cue, even with no blank line before it; no cue is KN-100;
   // a cue that ends before it starts is not checked, and its words run backwards.
   // Call it once at load: captions() groups the words once per array
beat(t, beatFile, { decay: 0.2 }); // 0 to 1 from { version: 1, beats: [{ time, strength }] } or its beats array
```

## Audio

```html
<!-- inside the composition root -->
<audio id="music" src="music.mp3" data-start="0" data-duration="20" data-volume="0.8" data-fade-in="1" data-fade-out="2"></audio>
<audio id="whoosh" src="whoosh.wav" data-start="intro - 0.3" data-media-start="0.1"></audio>
<!-- data-remap ramps the speed as on footage, in place of data-playback-rate; one not applied is KN-136 -->
<audio src="riser.wav" data-start="4" data-duration="3" data-remap="{ at: [0, 2, 3], to: [0, 1, 3] }"></audio>
```

```javascript
const { level, spectrum } = wildflower.kinetic;
level(t, 'bass');                        // 0 to 1: 'bass' 20-250 Hz, 'mid' 250 Hz-2 kHz, 'treble' 2-16 kHz, 'all' (RMS, the default)
level(t, 'all', { clip: 'music' });      // one clip alone, by its id
spectrum(t, 16);                         // 16 levels, 0 to 1, 20 Hz to 16 kHz on a log scale, low to high; bins 1 to 64
```

### Markers and tempo

```html
<!-- in the file's own seconds; through data-start, data-media-start and data-playback-rate -->
<audio id="music" src="music.mp3" data-start="0" data-tempo="134.68" data-downbeat="10.712" data-meter="4"
       data-markers="{ drop: 14.28, stop: 48.05 }"></audio>
```

```javascript
const { timeOf, tempo } = wildflower.kinetic;
timeOf('stop + 0.4');     // composition seconds; data-start's grammar: a number, a name, a name ± seconds
                          // a name is a marker, else an element's id (when that element ends; 'intro.start' when it starts)
const g = tempo();        // the one clip with data-tempo, or tempo('music')
g.beat; g.meter;          // a beat in composition seconds (at the clip's rate); beats to a bar (4 by default)
g.at(4); g.of(t);         // beat 4's time (the downbeat is 0; fractions, negatives); the beat at t
step('drop', { wait: timeOf('stop') + 1.7 - timeOf('intro') });   // wait stays seconds into the step
```

The tempo is the default for steady music; a beat file read by `beat()` is
for music whose tempo drifts ("Which to use" in rules.md).
`data-tempo` is steady beats per minute; `data-downbeat` a time in the file
where a bar starts; `data-markers` an object of names and seconds, in the
object syntax of `data-bind-class` (unquoted keys, single-quoted strings;
strict JSON reads too). Both calls read the page on every call. A
marker is no name in `data-start` (an element's id is). KN-100 on every build
for an expression that is no time, a name that is neither, a `data-markers`
that does not read (the message gives the character) or has a value that is
no number, `tempo()` with no clip or two and
no id, a missing or wrong `data-tempo` or `data-downbeat`, and a wrong
`data-meter` (a missing one is 4).

To find the values, run `node node_modules/@wildflowerjs/kinetic/scripts/beatgrid.cjs track.mp3`
(Node, and ffmpeg for anything but a WAV; `--json` for JSON). Without the
package installed, download it first, from
https://kinetic.wildflowerjs.com/scripts/beatgrid.cjs, and run it from
where it is. It prints the
tempo, the meter, the first downbeat and the bar lines where a section
changes, with the attributes to paste, and a double-time or half-time
reading beside the first when the music can be counted either way. Check
the downbeat by ear.

An audio clip is an `<audio>` with `data-start` inside the composition
root, or the sound of a footage clip with `data-has-audio="true"` (Footage,
below). `data-start` is seconds or a relative start (`"intro - 0.3"`, 0.3 s
before `intro` ends, or `"intro.start"`, when it starts);
`data-duration` or `data-end` its length, else the rest of the file from
`data-media-start` (seconds into the file) at the clip's rate; a length past
the file is silence, never a loop. `data-playback-rate` is the file's
seconds per composition second, 0.1 to 10 (1 by default, clamped outside),
and the pitch moves with it. `data-volume` is a gain, 1 (0 dB,
the default) to 3.98 (+12 dB); `data-fade-in` and `data-fade-out` are seconds
of linear fade at the clip's own edges. `loop`, `autoplay` and `controls` are
not applied (KN-136 in development), and a `data-start` that
names no element starts at 0 (KN-113). An audio clip is never the
clip a `data-clip-transition` replaces. The file is the `src`, or with
`<source>` children the one the element chose, else the first. Each file is
fetched and decoded once, at readiness, at 48 kHz, and Kinetic plays that
decode, so `preload="none"` on the `<audio>` saves a second download for the
element; a file that fails to load or decode is KN-135, a
console error on every build that rejects `ready()` and holds readiness (a
file on another origin needs CORS headers, and a page opened from a file
cannot fetch at all, so serve the folder over http).

In the preview Kinetic plays the clips through Web Audio with its own clock
(with the HyperFrames runtime on the page the runtime plays the media itself,
https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page). Playing, each clip that has not ended
starts so its sound is heard while its frame is on screen, and all restart
when picture and sound drift more than 45 ms apart. A pause stops every
source. Paused, each seek (a frame step, a scrub) plays that frame's slice,
1/fps long; a seek to the time already shown plays nothing. `check()` and
`render()` seeks play nothing. The context starts suspended: the bar's
speaker button (shown only with an audio clip) or its play button resumes
it. Without the bar, Kinetic puts a speaker button of its own over the
stage's lower right corner, beside the composition root and outside it
(`data-kinetic-speaker`, never in a check or a render): the sound stays off
until it is pressed, and it toggles the sound alone. It shows for 2 s once
made, then while the pointer is over the stage (fading 2 s after it leaves
or 3 s after it last moved), for 3 s after a touch, and while it has
keyboard focus; left alone it always fades, for a page running unattended.
`config({ sound: false })` plays nothing and suspends the context. A clip
added or removed while playing is heard, or stops, after the next
`ready()`. The hold at the end of `play({ to })` plays no slice.

With an audio clip, `render()` mixes the clips over `from` to `to`
with `OfflineAudioContext` at 48 kHz stereo, in 10 s segments, sample-exact,
the segments joining exactly at rate 1 and within 1e-3 of full scale (below
-60 dB) at another `data-playback-rate`, and writes AAC-LC (`audioCodec: 'mp4a.40.2'`, the default) or Opus
(`'opus'`) as the file's second track, with an edit list that skips AAC's
priming (measured per render); Opus's pre-skip is in `dOps` alone, since
Chrome applies both, and is encoded past `to`. A delay that cannot be
measured is KN-203, thrown on every build. With no AAC
encoder the default falls back to Opus (KN-202 in development). An
`audioCodec` the browser cannot encode is KN-100. `audio: false` writes the
video alone, after the run of readiness `render()` begins with, which still
decodes the audio clips (KN-135 rejects).

The levels are those of the mix as heard (starts, trims, volumes, fades), per
frame at the composition's fps, from a 2048-sample Hann window centered on the
frame and an FFT in JavaScript, each band in dB mapped from -60 dB to its
loudest frame onto 0 to 1, then a fall over about 0.15 s. Built once at readiness, after the decode,
so a seek reads a table and frame 0 waits; the clock store's `levels` field
counts the times they change, so a computed calling `level()` or `spectrum()` updates
when they land. 0 (or zeros) before the first decode and with no audio clip
(KN-137 in development, after a decode that found none). KN-100 for a bad
band, `bins` or `clip`.

## Footage

```html
<!-- inside the composition root -->
<video id="crowd" src="crowd.mp4" data-start="2" data-duration="5" data-media-start="12.5" muted playsinline></video>
<video id="talk" src="talk.mp4" data-start="intro" data-has-audio="true" data-volume="0.9" data-fade-out="0.5" playsinline></video>
<video id="rush" src="rush.webm" data-start="7" data-duration="2" data-playback-rate="2" muted playsinline></video>
<video id="dive" src="dive.mp4" data-start="9" data-media-start="4" data-remap="{ at: [0, 1, 2, 3], to: [0, 2, 2, 3], ease: 'smooth' }" muted playsinline></video>
<!-- a speed ramp, in the object syntax of data-bind-class (strict JSON reads too): at = seconds into the clip (increasing),
     to = seconds into the file from data-media-start (never going back);
     double speed for a second, a held frame for a second, single speed for a second; ease as a track takes it, 'smooth'
     passes the keys without a step; before the first key the first file time, after the last the last (the frame holds);
     no data-duration: the clip lasts to the last key; data-has-audio sound follows the keys, silent through a hold;
     data-playback-rate beside it is not applied (KN-139), nor a malformed remap or an ease that overshoots
     (spring, back, elastic, a cubic-bezier past 0..1); not applied under the HyperFrames runtime -->
```

A footage clip is a `<video>` with `data-start` inside the composition root,
timed like any clip. `data-playback-start`, when it has one, is read before
`data-media-start`, as the runtime reads it. Without `data-duration` or
`data-end` it runs for the rest of its file from `data-media-start`, at its
rate, a length read from the file at readiness; a media start at or past the
file's end then lasts no time, and the clip is never shown. `data-playback-rate` is the file's seconds per
composition second, 0.1 to 10. A clip whose `data-start` refers to a footage
clip with no length starts where that clip's file ends. At composition time
t the clip is at `data-media-start + (min(max(t, start), end) - start) * rate`
in its file, at most the file's length, so past the end of the file the last
frame holds; each frame shows the source frame on screen 1 ms after that
time (for footage at the composition's frame rate, the frame with the same
number; 29.97 fps in 30 takes a source frame that starts within that 1 ms).
`muted` is the picture alone; `data-has-audio="true"` makes its sound an
audio clip (Audio, above), with `data-volume`, `data-fade-in` and
`data-fade-out`, in the preview, the render's mix, `level()` and
`spectrum()`, also with `muted` beside it (KN-139 warns that the two
contradict). A file with no sound track and `data-has-audio` is KN-135, whose
development message suggests `muted`.

Kinetic drives the element, keeps
it muted (its sound plays through Web Audio) and hides it outside its window.
A paused seek, and every seek of `check()` and `render()`, pauses the element,
sets `currentTime` to its file time plus that millisecond and holds the
seek's barrier until `seeked`, so the frame is on the element when the frame
is captured; that wait is outside the guard's window, so it is no KN-170,
and the page's code running meanwhile is no KN-140 or KN-142. A clip before
its window is held on its first frame, and one after it on the frame at its
end. While the clock plays, a clip inside its window plays natively at its
rate; one that starts within 50 ms of its frame plays from where it is, and
a playing clip is seeked again only past 50 ms of composition time, when it
is neither seeking nor short of data (a scrub, the loop back to 0, a stall).
Starting stalls it about 45 ms in Chrome, so the frame drawn is the clock's
or the one before it. A pause puts every clip back on the exact frame.
`check()` loads the footage first, then compares each footage clip's
`currentTime`, to the microsecond, between its two passes
(`property: 'currentTime'`): the time it was sought to, not the frame
decoded. With the HyperFrames runtime on the page the runtime plays the
media itself (https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page).

Readiness waits for each clip's metadata and first frame (`loadeddata`), and
for each clip to land on its frame, so `ready()` resolves with the page on
the right frame; `preload="none"` is set to `auto`. A file that fails to
load, a format the browser cannot play (Chrome plays H.264, VP9 and AV1 in
MP4 or WebM) and a clip with no `src` and no `<source>` are each KN-138, a
console error on every build that rejects `ready()` and `render()` and holds
readiness; its message gives the clip and its `src`, and the development
build's message the cause (an HTTP status, a format, a decode or network
error, a server that could not be reached; a file on another origin gets no
CORS advice, since a `<video>` needs none to play). With the runtime on the page, KN-138 does not occur.
Development builds warn once per clip (KN-139) about `autoplay`,
`controls` or `loop` (Kinetic plays the element itself), `data-automation`
(speed ramps are not applied; the clip plays at `data-playback-rate`), a clip
with neither `muted` nor `data-has-audio="true"` (it plays no sound in
Kinetic) or with both, a
`data-playback-rate` outside 0.1 to 10 (clamped), and a media start at or
past the file's end with no length written (the clip is never shown); and about a `data-start`
that refers to no element (KN-113). Footage with keyframes far apart renders
correctly but more slowly; `ffmpeg -i in.mp4 -c:v libx264 -g 30 -crf 18 -c:a copy out.mp4`
re-encodes it with a keyframe every second.

## Interactive mode

The same scenes run as a video (video mode) and as a lesson on the page
(interactive mode). `$kinetic.mode` is `'interactive'` or `'video'`;
`config({ mode })` takes `'auto'` (the default: video with the preview bar
up, interactive otherwise), `'interactive'` or `'video'`. A renderer's runtime on the page, a
render capturing, `check()` and `render()` put the page in video mode
whatever the setting.

```html
<!-- A step is a clip with an id and data-step; its range runs to the next step's start. -->
<section id="circle" data-step data-start="0" data-duration="6">…</section>
<section id="ask" data-step data-start="circle" data-duration="3">…</section>
```

```javascript
wildflower.store('sine', { state: { angle: 30, choice: null }, computed: { answered() { return this.choice !== null; } } });

wildflower.kinetic.step('circle', {
    wait: 2,                          // interactive: holds 2 s into the step (default: its range or its own clip, the shorter); false plays on
    script: { 'sine.angle': { at: [2, 5.5], to: [30, 120], ease: 'power2.inOut' } },   // video: a track, the step's seconds
});
wildflower.kinetic.step('ask', {
    wait: 1,
    until: 'sine.answered',           // interactive: once truthy, plays the rest of the step and holds on its last frame for Next; next() and canAdvance wait for it
    entry: { 'sine.choice': null },   // interactive: written as the step is entered, or done again
    script: { 'sine.choice': { at: [0, 2], set: [null, 270] } },   // video: settings, each held from its time
});

wildflower.kinetic.scene('sine-circle', {
    subscribe: ['sine'],
    follow: { angle: 'sine.angle' },  // a computed easing toward the path by a spring; { target, ease: { spring: {...} } }
    computed: { point() { return at(this.angle); } },
});

wildflower.kinetic.next();  wildflower.kinetic.back();  wildflower.kinetic.go('ask');  // or go(1)
wildflower.kinetic.config({ mode: 'video' });  wildflower.kinetic.play({ from: 0 });     // "watch it as a video"
document.addEventListener('kinetic:step', (e) => { /* e.detail: { step, index }, interactive mode, after the seek */ });
const ks = wildflower.getStore('kinetic');   // the clock store from a script: ks.time, ks.step, ks.canAdvance
```

```html
<!-- In a component whose next() and back() call wildflower.kinetic's: Next follows canAdvance, Back is always there. -->
<button type="button" data-action="back">Back</button>
<button type="button" data-action="next" data-bind-attr="{ disabled: !$kinetic.canAdvance }">Next</button>
```

| Store field | Value |
|---|---|
| `mode` | `'interactive'` or `'video'` |
| `step`, `stepIndex` | the step whose range holds `time`; `''` and -1 for none; both modes |
| `stepCount` | how many steps |
| `stepStart`, `stepLength` | its range in composition seconds |
| `waiting` | interactive mode: true once the hold's seek has settled |
| `canAdvance` | what Next binds to: true when the step's `until` path is truthy or the step has none, false while the path is falsy, the same while the step plays in or out as at its hold; always true in video mode |

| Call | Interactive mode | Video mode |
|---|---|---|
| `next()` | nothing while `canAdvance` is false; otherwise enters the next step at once with its `entry`, wherever the step is (playing in, held, playing out), the rest of the step unplayed; nothing on the last step | seeks to the next step's start |
| `back()` | enters the previous step from its start, with its `entry`; past the last step's end, the last; nothing at the first | seeks to its start |
| `go(step)` | enters it, by id or index; KN-100 for neither | seeks to its start |
| `play()` | on to the step's hold; at or past it, the step again from its start, with its `entry`; past the last step's end, on to the composition's end | plays on |

In video mode the three seeks keep a playing clock playing with its hold, so
a video from `play({ from: 0 })` still stops at its end. After a stay in
video mode, interactive mode keeps the step it entered only when the clock is back
inside it. Entering a step in interactive mode is `play({ from: start, to: start + wait })`,
so the step plays in and holds on the last frame before its wait. Once the
step's `until` path is truthy at its hold (or already is as the hold lands),
the clock plays on from the hold to the end of the step's range (the play-out), `waiting` false, and
the step then holds on its last frame, `waiting` true, for Next; a hold at
the range's end whose `until` turns truthy stays where it is. Interactive
mode never moves to the next step by itself: the learner does, with Next.
Back, `go()` and a seek during the play-out do what they do anywhere in the
step, and Back is never disabled.

At a hold the clock stands still, so `local` does too: a learner's change
animates only through a `follow` spring or a binding to state, never
through the time. Design a step's hold so what the learner moves eases by
`follow` or redraws from the store, and keep what plays by the time before
the hold or after it.
In interactive mode a seek of the learner's own (`seek()`, the preview bar's
scrub or frame step) that lands in a step before its hold writes the step's
`entry` too, since the step is being done again; a seek at or past the hold
keeps the learner's values, and so do the playing clock's frames and a
pause and play.

In interactive mode, a change to a scene's state while the clock stands
still (a control the learner moves while a step holds) seeks the time it
stands at again, once a frame, so `seek(local)` runs and effects and shade
layers draw with the new values.

A scene's `tick(dt, now)`, the framework's frame-loop hook (`dt` in
milliseconds), runs only in interactive mode: never in video mode, so never
in `check()`, `render()` or with a renderer's runtime on the page. It is
for what the interactive page does on its own, such as physics in a bowl the
learner drops balls into while the step holds. The video never sees it, so
development builds name such a scene once when it is part of a `render()`, or
the page is in video mode (KN-151); `check()` makes no video and an
interactive page using `tick()` hears nothing.

```javascript
wildflower.kinetic.scene('bowl', {
    // The learner's balls roll on the page's clock while the step holds.
    tick(dt) { if (this.stores.kinetic.waiting) world.step(Math.min(dt, 50) / 1000); },
});
```
`until` and `entry` take store paths, `store.field`. A script entry is a
track (`{ at, to, ease, extrapolate, round, space }`, read by
`interpolate()`; KN-120 and KN-121 at `step()`) or settings (`{ at, set }`,
strings, numbers, booleans or `null`; anything else KN-100). In video mode
a path's value comes from the scripts alone: the latest step that starts by
the time and scripts the path, at the time since its start; before a
settings entry's first time, the step before; before the first, that
entry's first value. It is written in the seek's batch, only when it
differs, and a write by anything else is undone within a microtask
(KN-146), a watcher's write inside the script's own write too. A path is
put back once at most between two seeks, so a watcher that writes it again
every time keeps its value after that one correction, with KN-146 printed.
Switching to video keeps the learner's values aside, and
switching back writes them back; `check()` and `render()` seek back first,
still in video mode. A script path whose store does not exist, or that
names a computed, fails readiness with KN-100. With `autoplay` on, an
interactive page with steps enters its first step when readiness resolves, and not at
all when it fails.

`follow` eases by a spring only: `'spring'`, `{ spring: { stiffness, damping,
mass } }` or `{ spring: { duration, bounce } }`, `{ spring: { duration: 0.4 } }`
by default. Another ease, `overshootClamping` and no damping are KN-100. In
interactive mode it sums one step response per change of the target, on the page's
clock; in video mode it applies the same spring to the target's script,
sampled on the root's `data-fps`, and passes a target no step scripts
through. The target is a finite number, or `true` and `false` as 1 and 0.

## Control, readiness, self-test and rendering

```javascript
await wildflower.kinetic.ready();   // frame 0 may be captured: first scan, fonts, waitFor queries, images, audio decode, footage's first frames, transition maps, effect images, Lottie loads, animated images
const report = await wildflower.kinetic.check({ samples: 30, seed: 1 });   // samples 1 or more, a fraction rounded up; a failing report is also KN-160 in development
// { ok: true, frames, samples, ready, errors }
// { ok: false, reason: 'readiness failed', code, where, frames, samples, ready, errors, firstError? }
// { ok: false, reason: 'a seek threw', frames, samples, ready, errors, firstError }
// { ok: false, frame, time, element, property, first, second, ready, errors }
const { blob, name, frames, width, height, fps, codec, audioCodec, ms } = await wildflower.kinetic.render({
    fps: 30, from: 0, to: 6, codec: 'avc1.640028', bitrate: 8e6, source: root, width: 1280, height: 720,
    audio: true, audioCodec: 'mp4a.40.2', audioBitrate: 192000,   // audioCodec in the result: null with no sound
    shutter: false,   // or 180, or { angle, samples }: motion blur (Motion blur, above)
    name: 'main', download: true, onProgress: (frame, frames) => {},
    signal: controller.signal   // an AbortSignal, as fetch() takes: abort() stops the render, puts the page back, rejects with signal.reason
});                             // already aborted: rejects at once; not an AbortSignal: KN-100; the preview bar's Render is Cancel while one runs
wildflower.kinetic.seek(1.5);  wildflower.kinetic.play();  wildflower.kinetic.pause();
wildflower.kinetic.play({ from: 0, to: 9 });   // plays 0 to 9 s and holds the last frame, 9 - 1/fps
wildflower.kinetic.config({ fps: 30, channel: 'event', autoplay: true, preview: false, loop: true /* or false, or { hold: 3 } */, fit: false, sound: true, shutter: false, mode: 'auto' });
wildflower.kinetic.compat.hyperframes;   // the runtime version Kinetic is tested against
wildflower.kinetic.version;              // the package's version; a second copy of the file does nothing (KN-102 in development)
```

Readiness keeps nothing from one run to the next. The registered entry is
one run, `ready()` another, and `check()` and `render()` each begin with
one, so `check()` fails with `reason: 'readiness failed'` exactly when
`render()` rejects, with the same error, before the page is touched; the
report gives its `code` and `where` on every build. A run looks at the page
as it is: a failed map, animated image, or footage or audio clip's file is
asked for again, and only the clips, scenes and queries on the page count,
so a clip taken off the page or given a file that loads, a removed scene, an
animation handed back or a query that has loaded since fails nothing more.
After frame 0 a run waits for a `waitFor` query that is loading again and
fails on one a refresh left in error (KN-131). `render()` rejects for a bad
input (KN-130) or a failed `waitFor` (KN-131, KN-133) in any scene on the
page, and with `audio: false` still needs the audio clips to load. An
animated image asked for with `scene: this` counts while that scene is on
the page; one asked for without a scene counts for good. The root's
`data-kinetic-ready` follows each run (with the runtime, `"true"` waits for
`__renderReady`). A failure outside a run (a Lottie animation or an animated
image made later, a scene mounted later) marks the root `failed` until the
next run, and one during `check()`'s seeks or `render()`'s frames (a scene a
section mounts partway) fails that call. Each failure is printed once while
it lasts, and again if it comes back after its source has passed. An error
with no KN code fails a run the same way.

The clock is the store `kinetic` (`time`, `frame`, `fps`, `duration`,
`playing`, `levels`, the count of level-table changes, `shutter`, the
angle of the render with a shutter that is running, 0 otherwise, and the
mode and step fields of Interactive mode, above). A runtime on the page drives it through `hf-seek`. With no runtime on the
page Kinetic drives it from `requestAnimationFrame` and hides each clip
outside its window, with `visibility` and `data-kinetic-hidden`, which an
adopted style sheet clips to nothing, so an SVG filter that makes its own
pixels paints nothing there either. Inside its window a clip gets an inline
`visibility: visible`, which shows it even inside an element the page hides
with `visibility: hidden`: hide an element that holds clips (a footage
clip, say) with `opacity: 0` or `display: none`, or give it a `data-start`
of its own. At the end that standalone clock holds the last frame for 3 s
and then starts again from 0 (`loop: true`, the default).
`config({ loop: { hold: 1 } })` sets those seconds, and with the preview bar
up there is no hold. With `config({ loop: false })` it holds the last frame, `duration -
1/fps`, and sets `playing` to false; `play()` on that frame starts again
from 0. `config()` reports `loop` as `{ hold }` or `false`. With a
runtime on the page its player runs playback and `loop` has no effect.
With the preview bar down, a click on the root that
is not on a control (`a`, `button`, `input`, `select`, `textarea`, `label`,
`summary`, `[contenteditable]`, `[tabindex]`, `[data-action]`, a widget
`role` such as `button` or `slider`) pauses the standalone clock, and
another click plays it again, keeping a `play({ from, to })` hold. A click
that ends a drag or leaves text selected does nothing. The root is made
focusable (`tabindex="0"`, unless it has its own), and Space or Enter on
it does what a click does. In an interactive
lesson a click pauses a step only while it plays, and the second click
plays it on to its hold; at a hold a click does nothing. While a click has it
paused, a large pause mark sits over the stage's center, beside the root and
outside it (`data-kinetic-paused`, never in a check or a render), with no
fade; a click on it plays, and it goes whenever the clock plays.
`play({ from, to })` seeks to `from` (default: the current time), plays,
and holds the last frame before `to` (default: the composition's duration),
also when a slow frame passes `to`. With the runtime's player it calls
`renderSeek(from)` and `play()`, applies the first `hf-seek` at or past the
held frame as that frame, then pauses the player and seeks it there.
`config()` throws KN-100 for an option it does not know, and applies
nothing. `?preview` on the URL, `data-preview` on the script tag,
or `config({ preview: true })` adds a bar at the bottom of the window: play,
pause, a scrubber, one frame back or forward, a speaker button when the
composition has an audio clip, the time and the frame, and a
Render button. It never appears while a render captures. A count of the KN
warnings and errors printed since the page loaded sits beside the time, amber
above 0, and reads "production build, no diagnostics" on the production build.
A Check button calls `check({ samples: 30 })` and shows "check ok, 180 frames"
or the first differing frame, and does not run while a render does.
`fit` defaults to whether the bar is asked for. On, it puts the root in a plain
`<div class="kinetic-fit">` (no component) and scales it down to that
element's width, never up; `config({ fit: true })` asks for it on a page with
no bar. Outside a render Kinetic removes the size, margin, padding and
overflow a runtime sets on `html` and `body`. In a render's capture, and with `embed` in the URL,
Kinetic hides everything beside the composition and leaves the root at the
window's top left at its own size. The fit is never applied in a render, and
`render()` draws a fitted stage at the composition's size.

Inside an iframe, an `embed` page takes `{ type: 'kinetic:play' }` (with
`from` and `to` for a range), `{ type: 'kinetic:pause' }`, `{ type:
'kinetic:seek', time }` and `{ type: 'kinetic:state' }` from its parent by
postMessage, and posts `{ type: 'kinetic:time', time, frame, playing,
duration, fps }` after every seek, play and pause (a click inside the frame
included), `{ type: 'kinetic:ready',
ready: 'true' | 'failed', duration, fps, width, height }` once readiness has
settled, and `{ type: 'kinetic:error', message }` for a seek with no number.
Without `embed` in the URL, or at the top of a window, it posts and takes
nothing.

`render()` needs WebCodecs, which Chrome has in a secure context (https,
localhost, or a page opened from disk; KN-200 on plain http from another
host), and for the
page's HTML, Chrome with HTML-in-Canvas enabled, until Chrome 157 a setting:
paste chrome://flags/#canvas-draw-element into the address bar, set the entry
to Enabled and restart Chrome (KN-201;
https://developer.chrome.com/blog/html-in-canvas-origin-trial); a canvas
source renders in any Chrome. `drawElementImage` draws media from another
origin black, so `render()` first throws KN-204, listing each such element: an
`<img>`, `<video>` or SVG `<image>` from another origin needs
`crossorigin="anonymous"` and `Access-Control-Allow-Origin` from its server
(a video's `poster` follows the video's `crossorigin`), and a CSS image (on
the element or its `::before` or `::after`, `content: url()` included), an
`<input type="image">`, a frame and an `<object>` (drawn empty) have to come
from the page's own origin or a `data:` URL; open shadow roots are looked
through too. One render runs at a time (a second call while one runs is
KN-100); `from` and `to` lie within the composition (KN-100 past its
duration); `width` and `height` are the file's size, to which a DOM source's
box is scaled, as a canvas source's frames are; a clock that was playing
plays on from where it was after the render. An encoder that reports an
error, takes no frame for 10 s, or gives output the MP4 cannot hold is
KN-207, thrown on every build once the page and clock are back. The MP4 gives each
frame a whole number of 90 kHz ticks, so the file lasts `frames / fps` to a
tick at any rate, as its sound does. With
an audio clip the file has a sound track (Audio, above). A run of readiness
comes first and its failure rejects (KN-138 for footage, KN-180 and KN-181
for Lottie animations and animated images, KN-182 for an image under a scene
still loading after 30 s, and the rest above), and each frame is captured
once every footage clip has seeked to it (Footage, above); a seek not landed
in 30 s, a file that stopped loading partway, is KN-138 naming the clip, and
an abort ends a render waiting on one. A page that adds or replaces its
composition root after load calls `ready()` once it is in the page.
Every canvas in the composition is drawn through a 2D copy laid over it
after each seek, wherever it sits and whatever its drawing size; a
`visibility` that a CSS animation moves on a canvas is not copied, only its
inline one. `scripts/batch.cjs` in the package renders the page once per
row of a JSON or CSV file, through `render()` in Chrome, with each row as
the composition's variables (`window.__hfVariables`), or the page renders
through HyperFrames (https://kinetic.wildflowerjs.com/docs/hyperframes/).

With the HyperFrames runtime on the page, `render()` seeks through the
runtime's player, so the render's fps has to divide the root's `data-fps`,
or `render()` puts the page and the clock back and throws KN-206 on every
build (https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page).
