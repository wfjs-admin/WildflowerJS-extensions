# Kinetic rules

Each rule is a failure that has been seen. The code in parentheses is the
diagnostic a development build prints when the rule is broken. Build with
the development files, the framework's `.dev.js` and `kinetic.wf.js`, whose
error messages say what is wrong; the production file's message carries
only the code, where the error came from and a link to the code's entry on
the error-codes page. To finish the page, swap the two script lines for the
`.min.js` builds.

## The page

- Load the framework, then Kinetic, then the scenes. Kinetic installs itself
  into `wildflower` as it loads. The scenes register in a deferred or module
  script, which has run by `DOMContentLoaded`, when Kinetic settles
  readiness. The page needs no other script to preview, check and render.
- The composition root carries `data-composition-id`, `data-start="0"`,
  `data-duration` in seconds, `data-width` and `data-height` in pixels,
  and `data-fps` when it is not 30. Without `data-duration` it has no
  length to render (KN-110). Only a page with the HyperFrames runtime on it
  also needs `data-no-timeline` on the root (KN-111). Kinetic gives the root
  its `data-width` and `data-height` where the CSS leaves the size at auto,
  so the CSS does not repeat them; a size the CSS sets stays.
- One composition root a page. Kinetic drives the first; a second beside it
  gets no size and is never marked ready (KN-155 in development). Several
  pieces on one page each get a page of their own, shown in an iframe; a
  root nested inside the first is the first's own.
- Hold the stage until Kinetic marks it ready, or the first frame shows
  every clip at once, with Kinetic's cloak:
  `[data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }`.
  It stays in the page, since Kinetic's script is deferred. Unlike
  WildflowerJS's `[data-cloak]`, which lifts when the components initialize
  and uses `display: none`, it lifts when Kinetic is ready (fonts, media
  decoded, effects drawn, the first seek landed) and uses `visibility`,
  which keeps the layout Kinetic measures.
- `data-preview` fits the stage to the window; a page with its own controls
  and no bar sets `config({ fit: true })`. Do not scale the stage with a
  component of your own, since a scene inside a component reads that
  component on its root tag (WF-521).
- For many videos from one page, the preview bar's Render batch button, or
  `render.batch(rows, { name })`, renders the page once per row of a JSON
  or CSV file in Chrome, each row as the composition's variables, named
  `<composition id>-<row>.mp4` or by the `name` field, and stops at a row
  whose input fails (KN-130). The page carries no runtime tag, since rows
  do not reach it. With the HyperFrames runtime's tag on the page (after
  Kinetic's and before the scenes;
  https://kinetic.wildflowerjs.com/docs/hyperframes/), the runtime owns
  the clock and the media, its player seeks on the root's `data-fps` only
  when Kinetic's tag comes first and the root is in the page as the runtime
  starts (30 otherwise; `config({ fps })` comes too late), and a `render()`
  whose fps does not divide that rate throws KN-206. In a render's
  capture, with the runtime or without it, Kinetic hides everything beside the composition and puts it at
  the window's top left, so a page with a toolbar or text around the stage
  needs no CSS for it.
- Queries and `waitFor` exist on the full tier only (KN-101 elsewhere).
  Rows from `data-list` need a tier with lists, so not nano or mini-pool.
  Pools need a tier with pools, so not nano or mini.

## Layers

- `layers.scene(name, { layers: [...] })` draws its layers on the clip whose
  `data-component` is that name, and their times count from the clip's start.
  The HTML and CSS lay each element out at rest; the layers move it from
  there. Give each element a layer moves a class or an id: a layer's `src` is
  searched in the scene's clip first, then the whole composition, so an
  `h1` that is not in the clip finds every heading on the page (select it
  with `#title h1`).
- `layers.scene()` checks the layers when a clip of the scene starts, not at
  the call: a key the layer's kind does not take, a misspelled field, an
  unknown kind or a comp placed inside itself is an error in the console
  then (KN-161, KN-162, KN-167) and again at every seek, so `check()` fails.
  `layers()` throws the same errors at the call. The error gives the layer
  and the field and lists what is allowed. A name nothing defines, a
  link to nothing and a value of no known form throw at the first frame that
  reads them (KN-163 to KN-165).
- A value on a length property in `look.style` (`width`, `left`,
  `fontSize`) carries its unit: `{ at: [0, 1], to: [0, 480], unit: 'px' }`.
  The browser drops a number with no unit there, and a development build
  warns once (KN-122) for a number or a track of numbers.
  `place.translate` is in px and `place.rotate` in degrees already.
- What the fields cannot say (a model's numbers, a shape's geometry, a
  label's formatting) goes in a small function in `fns`, called with `{ call,
  args }`. Keep each pure: the same arguments give the same result, and the
  function reads no clock of its own; pass the time in as `{ rate: 1 }`.
- Name a time or a value several layers use once, in `constants` or
  `shared`, and read it by name; a beat or a marker reads by name too.
- A row of things is one comp repeated (`repeat: { over }` or
  `{ count }`), each copy reading `i`, `n` and its row's fields. Write the
  comp once.
- The scene's element is a clip: it carries `data-start` and `data-duration`
  (or `data-end`). `data-start` is seconds, or another clip's `id`, which
  means after that clip ends (chaining scenes), or `"intro + 0.5"`;
  `"intro.end"` is the same as `"intro"`. `"voice.start"` starts with the
  clip `voice` (`"voice.start + 0.5"`, `"voice.start - 0.5"` too), as
  subtitles over a voice-over do. The `.start` form is Kinetic's own:
  HyperFrames' renderer does not read it, so a page that uses it renders
  through Kinetic only; for a page HyperFrames renders, keep two clips
  together in a group (a nested composition, both clips at `data-start="0"`
  inside it). An element whose id is the whole value (`id="voice.start"`)
  wins over the edge. A scene on an element with no timed ancestor has
  `local` equal to `time` (KN-112). A reference that matches no element
  starts at 0 (KN-113).
- A clip's `data-start` and end fall on whole frames: at 30 fps, any multiple
  of 0.1 s does. A time such as 3.01 is between two frames (KN-114). Write
  any other edge as a frame time, `n / fps` to 8 decimals: frame 331 at 30
  fps is `11.03333333`. To put an edge on a beat, round the beat's time to
  its frame (`Math.round(t * fps) / fps`).
- A clip holds its time at its edges: 0 before it starts and its duration
  after it ends, where it is hidden. So a hidden clip's layers are not drawn
  again until the clip is on screen again, and a page of many clips spends
  time drawing only those on screen.
- Fade a clip in and out with its attributes, `data-clip-enter="fade 0.5"`
  and `data-clip-exit="fade 0.5"`, which need no layer field.
- A spring ends on the last two keyframes of its track, where it runs on
  past the last one, or on a segment long enough for it to come to rest. A
  keyframe that arrives while the spring is still moving cuts it off and the
  value jumps (KN-123). To spring in and ease out on one property, give
  `ease` an array with one entry per segment: `['spring', 'linear',
  'power3.in']` for four keyframes. A spring set by time,
  `{ spring: { duration: 0.6, bounce: 0.2 } }`, comes to rest 0.6 s into its
  segment, so a segment of 0.6 s or more holds it; `settle(options)` gives
  any spring's time.
- Stagger with Kinetic's `stagger()`, never a delay of your own arithmetic:
  a repeated comp's `start: { stagger: { each: 0.05 } }`, a layer's
  `delay: { stagger: {...} }` over the elements its `src` finds, or a text
  layer's `animate.each`. Keep the step shorter than the motion it
  staggers, so the items move at the same time for most of it: a 0.5 s rise
  takes a step of 0.03 to 0.1 s, and a step as long as the rise plays the
  items one after another. Start with the item the viewer should look at
  first: `from: 'center'` for a word read from its middle, an index for the
  item the scene is about, `'edges'` to close in on the middle. Stagger an
  event, such as an entrance, an exit or a change of value, and let the items
  move together, or hold still, once it is over; a list that is only on
  screen needs no stagger.

### A scene in code

Write a scene in code, `scene(name, { keyframes, computed, seek })`
(api.md, "A scene"), only for a picture no layer can describe. Its rules:

- No function calls in bindings. Motion goes in computeds (`styleAt(this.local,
  tracks)`), and the binding reads the result by name, a style object by
  path (`data-bind-style="style"`).
- A `keyframes` entry becomes a computed of `local`; when it and a
  `computed` entry share a name, the scene reads the `keyframes` entry
  (KN-153). An entry of several tracks folds its transform keys into
  `transform`, so `this.rise.translateY` is undefined (KN-159). A scene does
  not define `time`, `local`, `clipFrame`, `frame`, `progress`,
  `remaining`, `enter`, `exit`, `presence`, `vars` or `inputs` (KN-152).
- A track on a length property carries a `unit` (KN-122). Take a progress
  with `ramp(t, from, to, ease)` and a blend with `mix(a, b, p)`, not a
  `clamp`, `lerp` or `ramp` of your own; stagger by subtracting
  `stagger(i, n, options)` from the time you pass to a helper.
- A scene's `tick(dt)` runs only in interactive mode, never in video mode,
  `check()` or `render()` (KN-151 in a render). On a lesson, put physics
  that runs while a step holds on a store's `tick()`, starting with
  `if (k.mode !== 'interactive' || !k.waiting) return;`, where `k` is
  `wildflower.getStore('kinetic')`.
- A binding on the scene's own root tag reads the scene's values, unless the
  scene sits inside a component of your own, which happens only when the
  composition is put inside a component or one scene inside another. The
  binding then reads that component, and the scene's values are not there
  (WF-521 from a development build of WildflowerJS; KN-154 when a scene
  inside another scene uses one of Kinetic's own values, such as
  `progress`, which the outer scene has too). Kinetic's fit wrapper is no
  component.
  `root: { style: { background: 'bg' } }` reads the scene in both cases,
  with `class`, `attr`, `show` and `directives` likewise.
- Pools in a scene are written in `seek(local)` with `update()`. Every seek
  flushes the page's pools (`wildflower.flushPools()`) once its scenes have
  settled, so the frame holds what `seek(local)` wrote, and the markup needs
  no attribute.
- Shapes from data inside an `<svg>` are a pool, never a list. The HTML
  parser leaves a `<template>` inside `<svg>` inert, so `data-list` draws
  nothing there (WildflowerJS's development build warns and points to
  pools). `data-pool` works:
  `<svg><g data-pool="flows" data-key="id"><template><path data-bind-attr="attrs"></path></template></g></svg>`,
  with each entity's `attrs` (`{ d }`) written in `seek(local)`, so the
  pool draws each frame.
- A promise returned from `seek(local)` holds the frame's capture until it
  settles. Everything else a frame needs is synchronous.

## Motion habits

A motion designer keeps these habits without thinking. Follow each of them
unless the brief asks for something else.

- Nothing moves linearly except what turns at a constant rate: a wheel, a
  clock hand, a conveyor. Position, scale and opacity take an ease.
- An entrance settles: `power3.out` for text; `back.out`, or
  `{ spring: { duration: 0.4, bounce: 0.2 } }`, for a shape or an icon. An
  exit leaves faster than the entrance came, on an `.in` ease
  (`power3.in`), and is shorter: 0.3 s out for 0.5 s in.
- Layers that enter together are offset by 0.05 to 0.1 s with `stagger()`,
  never all at one time.
- Text scales in from near 0.9; an icon or a badge may pop from 0 with
  `back.out`. An element's entrance rarely fades alone: a fade comes with
  a move or a scale. A crossfade or a fade to black between scenes is a
  transition and stands on its own.
- A move through several points is one track with `ease: 'smooth'`, not an
  ease per segment: the value keeps its speed through each point and comes
  to rest only at the first and the last, or where the points turn back.
- Between moves, things hold, and one thing moves at a time.
- A move at the scale of a title takes 0.3 to 0.6 s. A camera move takes
  seconds and eases over its whole length, `power2.inOut`.
- The shutter is on (`shutter: 180` in `layers.scene()`); for blur in the
  preview, `look.smear`.
- A color change mixes in oklch (`space: 'oklch'`). A number that counts
  up rounds with the track's `round` and prints through `format()`.
- With music, cuts and the main entrances land on the beat: `tempo().at(n)`
  from the audio clip's `data-tempo`, `data-downbeat`, and `data-meter` for
  steady music, or a beat file's `beats[].time`, the moments `beat()`
  pulses on, for music whose tempo drifts. A move is heard where it lands,
  not where it starts, so time it by its landing: `land(t, tempo().at(n),
  duration, ease)` starts it early enough to arrive on the beat, and
  `arrival(ease, duration)` gives the lead for keyframes. A contact, such
  as a strike or a landing, is its own accent and sits on the beat itself,
  on a whole frame: `tempo().frame(n)` (patterns.md, "Cutting to a track").
- With a move on every beat, each beat ends on a pose of its own. A
  symmetrical shape looks unmoved after a turn of its symmetry (a disc's
  half turn, a square's quarter turn), so two beats can end on the same
  picture even though the shape moved between them. Scrub the end of each beat and change the angle,
  distance or tilt where two match.
- A little anticipation before a big move: a few frames the other way,
  small, as a key before the move's first key.

## Which to use

Four outcomes have several routes. Start from what is wanted; where there
is a default, it is the first row. The docs page, with the routes side by
side, is https://kinetic.wildflowerjs.com/docs/which-to-use/.

Blur:

| What you want | The route |
|---|---|
| An element that blurs in or out | A `look.blur` track, px: `blur: { at: [0, 0.6], to: [12, 0] }` |
| A part of the frame (tilt-shift, a soft patch) | `look.backdrop: { radius, marks }` on an empty element over it |
| A cut between two clips | `data-clip-transition="blur"`, or `blur` with a length in `data-clip-enter`/`data-clip-exit` |
| Depth of field from z | `filter: 'blur(' + focus(z, plane) + 'px)'` |
| Single letters | `text()`'s per-letter `blur` from `letter(i, ch)` |
| The whole frame a little soft | The finish's `soften`: `config({ finish: { soften: 4 } })` |

Blur from movement is the render's shutter, with `smear()` for the preview.

Grain:

| What you want | The route |
|---|---|
| Grain over the whole frame (the default) | The finish's `grain`: `config({ finish: { grain: 0.08 } })`, the default style's light finish (style.md, "Finish"), still by default, a paper texture |
| Film grain that changes every frame | The finish's `grain` with `fps` at the frame rate: `{ grain: { amount: 0.15, fps: 30 } }` |
| Grain heavier in places, such as at the edges | `shade(canvas, { scene: this, kind: 'grain', fps: 30, marks })` |
| Specks of dust | The finish's `dust`, which is specks, not grain |

The page shows the finish on the root, or on the element in it marked
`data-finish`.

Music:

| What you want | The route |
|---|---|
| The beat of steady music, most music made in a DAW (the default) | `data-tempo`, `data-downbeat`, and `data-meter` on the audio clip, read with `tempo()`: `.at(n)`, `.of(t)`; the Beat grid page (https://kinetic.wildflowerjs.com/docs/beat-grid/) finds the values |
| The beat of music whose tempo drifts (live playing, old recordings) | A beat file read by `beat(t, beats)` |
| Loudness | `level(t, band)` or `spectrum(t, bins)` |
| A named moment | `data-markers="{ drop: 14.28 }"` on the clip and `timeOf('drop')` |

Fading a clip:

| What you want | The route |
|---|---|
| One clip fading in or out (the default) | `data-clip-enter="fade 0.5"` and `data-clip-exit="fade 0.5"`: markup only |
| A fade from one clip into the next | The overlap, with `data-clip-transition="fade"` on the incoming clip |
| A fade with a move or a scale on one element | A `look.opacity` track beside the `place` track |
| Something inside a clip that is no clip | A `look.opacity` track, or `look.transition: { kind: 'fade', p }` |

## Transitions

- A transition between two clips is their overlap: start the incoming clip
  before the other ends (`data-start="intro - 0.5"`) and put
  `data-clip-transition="push from-right"` on it. Do not build it from
  tracks on both clips, and do not give it a length;
  the overlap is the length (KN-115 for a length on `data-clip-transition`).
- The incoming clip overlaps exactly one sibling with `data-start` at its
  start, among those that end before it does. None, or two, leaves the clip
  without the transition (KN-116). A backdrop that runs past the clip's end
  does not count, so it can sit beside the clips.
- Give each clip in a transition a background of its own (the paper, or its
  scene's background color). A wipe or a push shows both clips at once over the
  overlap, and a clip with no background lets the other clip's text show
  through its own; nothing checks for it, so look at a frame from the middle
  of the overlap.
- What a push brings in is what the incoming clip shows at its start. Put
  the scene's hero on screen from the clip's first frame, so the push brings
  it in; with an entrance that starts after the push, the push brings in
  empty paper.
- A clip that comes in over nothing, or leaves to nothing, takes
  `data-clip-enter="wipe from-left 0.6"` or `data-clip-exit="fade 12f"`, which need a
  length (KN-115 without one, or with one longer than the clip). Not
  `data-clip-transition` and `data-clip-enter` on one clip (KN-115).
- Keep the lengths on the frame grid: an overlap made by a `data-start` on a
  whole frame, and lengths in frames (`18f`) or multiples of `1/fps`.
- A transition writes `opacity`, `translate`, `scale`, `rotate`, `clip-path`,
  `filter` and, for `reveal`, `z-index` on the clip's own tag. A scene's
  `root:` block or a binding on that tag that writes one of them overwrites
  the transition's value (KN-156): put the scene's own styling on an element
  inside it.
  A `transform` on the clip composes with the transition.
- `flip` needs `perspective` on the clips' common parent; `reveal` and
  `cover` need positioned clips, the incoming one later in the markup.
- Inside a scene, for something that is no clip, take the styles from
  `transition(kind, p, { direction })` with p from `ramp()`, and bind `.in`
  and `.out` with `data-bind-style`.
- A halftone, a wipe along an image's brightness or a dissolve between clips
  is `halftone`, `luma url(path)` or `dissolve` in the same attributes. Do
  not write an SVG filter of your own for it. `luma` needs its `url()` (KN-115
  without one), and its map from another origin needs CORS (KN-117 holds the
  render when a map fails to load). These kinds write `filter`, so a `blur`
  transition, a binding or a `root:` block writing `filter` on the same clip
  conflicts with them (KN-156).

## Effects

- A matte or a mask is `mask-image`: a gradient, an image, or an SVG image
  as a data URL (a filter inside it works), with `mask-mode: luminance` for
  a luma matte. An SVG `<mask>` referenced by id (`mask: url(#id)`) is
  drawn in the page and not in a render: the layer vanishes from the file.
  A texture goes over the scene with `mix-blend-mode: multiply`, a light
  leak with `screen`, and an adjustment layer is `backdrop-filter` on an
  element over the area it grades; all three draw the same in the page and
  the file (the compositing patterns).
- In a camera's world, a render draws the layers in document order: a
  layer that passes through another does not interleave with it as it does
  in the page. Keep each layer at its own depth and let none cross, as the
  depth-bands pattern does. A mask or a blend on a layer inside the world
  is fine; on the world itself it flattens it.
- A halftone, stipple, dither or duotone look on an image, footage or a
  canvas is a layer on a `<canvas>` with `look.effect: { kind, source, ...
  }`, its parameters values that may move. Do not draw it yourself in a
  `requestAnimationFrame` loop: Kinetic draws it after each seek, after the
  footage has landed.
- Give the canvas the source's shape; the source is stretched over it.
- A layer makes each of its calls (`look.effect`, `shade`, `backdrop`,
  `draw`, a lottie layer, canvas lettering) with its scene, so the call runs
  on the clip's time and is disposed with the scene. In a scene written in code, pass
  `scene: this` to `effect()`, `shade()`, `blur()`, `text()` and `lottie()`
  for the same; without it, a layer runs on composition time until its
  `dispose()`.
- HTML is no source. For HTML that does not change, use an SVG filter (the
  patterns' halftone and stipple) with two rules: nothing in the filtered
  element or the filter changes while it runs, since any change runs the
  whole filter again; and a filter with `feFlood`, `feImage` or
  `feTurbulence` is on only inside its clip's window, since such a filter
  paints through `visibility: hidden`. `local` holds at 0 before the clip,
  as on its first frame, so the test is `this.remaining > 0` for a clip
  that starts at 0, and with `this.time >= start` (its `data-start` in
  seconds) beside it for one that starts later.

## Lottie and animated images

- A Lottie animation is made with lottie-web's `loadAnimation()`, with
  `autoplay: false`, in a scene's `init()` and handed to
  `lottie(anim, { scene: this, start, rate, loop })` in the same task, so
  its time is the scene's local time and Kinetic sees a failed load (an
  event before `lottie()` is missed). Keep it as `this.anim` and call
  `this.anim.destroy()` in the scene's `destroy()`: lottie-web keeps every
  animation until then, and Kinetic lets go of it too. Do not call `play()`,
  `goToAndStop()` or `setSpeed()` on it yourself: Kinetic seeks it on every
  seek, and a render captures what the clock says. The HyperFrames runtime
  seeks it itself (https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page).
  The page loads lottie-web; Kinetic does not include it.
  Export the animation as one file, not in segments.
- In layers, a Lottie animation is a `kind: 'lottie'` layer, `content: {
  path, start, rate, loop }`.
- An animated GIF, WebP or APNG in a composition is `animatedImage(src)`,
  made once at the top of a scene in code, drawn with `draw(canvas, local)`
  in its `seek(local)` onto a canvas with the image's own width and height. Not a
  plain `<img>`, which plays on the browser's clock and renders wherever it
  had got to; keep the `<img>` for a browser without `ImageDecoder`, where
  `animatedImage()` throws KN-100 (the patterns' looping sticker). Every
  frame stays decoded, width × height × 4 bytes, so keep it sticker-sized and
  use a `<video>` clip for anything long or large.
- A file on another origin needs CORS headers, and a page opened from a file
  cannot fetch: serve the folder over http. A failed load holds the render
  (KN-180 for Lottie, KN-181 for an image).

## Sound

- Sound is an `<audio src="..." data-start="...">` inside the composition
  root, one element per clip, with `data-duration`, `data-media-start`,
  `data-playback-rate`, `data-volume` and `data-fade-in`/`data-fade-out` as
  needed. At a rate other than 1 the pitch moves with it. Not `loop`, `autoplay` or `controls` (KN-136): Kinetic
  plays the clip itself, so write one `<audio>` per repeat. Never play sound
  from a scene with `new Audio()`, an element's `play()` or Web Audio of
  your own; it is not in the render, and it runs on the wall clock.
- Time a sound from the clip it belongs to (`data-start="intro - 0.6"`
  for a whoosh on a cut), so a change of length moves both.
- A speed ramp on footage or sound is `data-remap`, the clip's time as a
  track: `data-remap="{ at: [0, 1, 2, 3], to: [0, 2, 2, 3], ease: 'smooth' }"`,
  `at` seconds into the clip (increasing), `to` seconds into the file from
  `data-media-start` (never going back). Two equal `to`s hold a frame;
  nothing runs backwards. A clip with no length lasts to the last key; a
  `data-has-audio` sound follows the keys and is silent through a hold.
  Not `data-playback-rate` beside it (KN-139, KN-136 for `<audio>`), and
  not under the HyperFrames runtime, which owns media and plays the clip
  at its rate.
- A file that fails to load or decode is KN-135 and holds the render. A
  file on another origin needs CORS headers.
- Visuals that follow the sound read `{ level: 'bass' }`, `{ spectrum: {}
  }` (a copy's bin) or `{ beat: { beats } }` in a layer, as a value or
  as a track's `by`, never an analyser of your own.
  They read 0 with no audio clip (KN-137). The beat of steady music is the
  clip's `data-tempo` read with `tempo()`; `beat()` is for a beat file, for
  music whose tempo drifts.
- The browser plays preview sound only after a gesture: the bar's speaker or
  play button, or without the bar Kinetic's own speaker in the stage's
  corner. A silent preview is not a silent render.

## Every frame the same

A render asks for frames in any order, on several workers, so a frame has to
come out the same whichever frames came before it.

- No `Date.now()`, `performance.now()` or `new Date()` during a seek
  (KN-140). No `Math.random()` (KN-141); use `random(seed)`,
  `noise(x, seed)`, `noise2()` and `noise3()`. No `setTimeout`, `setInterval`, `fetch()` or
  `requestAnimationFrame()` started during a seek (KN-142).
- No CSS transitions under the root (KN-143). Kinetic positions every CSS
  animation in a scene on every seek, one on an element created after load
  too, but a layer's track is the plainer form.
- Format numbers with `wildflower.kinetic.format()`, which uses `en-US`
  unless given a locale. `toLocaleString()` with no locale differs on another
  render machine (KN-145).
- A render seeks to whole frames, `n / fps`. An impact between two frames shows
  the moment before and the moment after and never the contact. Put a
  landing, a flash or a cut on a frame, and decide it in frames with
  `this.clipFrame`, the clip's frame number, a whole number:
  `this.clipFrame >= 19` needs no tolerance, where a comparison of seconds
  does. A clip whose `data-start`, `data-end` or start plus duration falls
  between two frames changes on the later frame, or in a render with a
  shutter part-way through the frame before (KN-114). `this.clipFrame` stays
  the frame's own number through all of a shutter's samples.
- A seek that takes more than 8 ms is too slow for a preview; KN-170 prints
  when 3 of the last 30 seeks do. Use
  fewer rows, a static pool and no layout reads in computeds. A Trillium view
  compiles its shaders in the first seek that draws it. Call
  `renderer.compile(scene, camera)` in `init()`.
- A Trillium view in a scene needs a renderer created with
  `preserveDrawingBuffer: true` (KN-190), or the captured frame can be blank.
- A camera move is a `kind: 'camera'` layer, which moves the
  composition's `.world` element; each layer in the world takes `band:
  'world'` and a `place.position` of `[x, y, z]`. Every element
  between the world and a layer needs `transform-style: preserve-3d`, since it
  is not inherited, and none of them, nor the world itself, takes `opacity`
  below 1, a `filter`, `overflow` other than `visible`, `clip-path`, a mask,
  `mix-blend-mode` or `isolation`: any of these draws the layers under it
  flat, with no warning. A fade goes on the layer itself. The world takes no
  background, which is a surface at z = 0 that hides every layer behind it;
  the backdrop goes on the scene's root or the farthest layer, and a crop on
  the scene's root or the stage. Kinetic's transitions write `opacity`,
  `clip-path` or `filter` on a clip, so a clip around layers at several
  depths is flat while it transitions.
- `camera()` takes no layer depths. A dolly whose `z` reaches
  `P - z` for a layer at depth `z` draws that layer over the whole frame and
  then not at all, with no error, so keep `z` below that for every layer on
  screen or hide the layer first. Camera shake comes from `shake()`, never
  from `Math.random()` (KN-141).
- `smear()`'s copies go in an element with `isolation: isolate`. They are
  drawn with `mix-blend-mode: plus-lighter`, which adds each copy to what is
  under it, so inside the group they add only to each other, and without it
  they add the scene behind them too and brighten it, with no warning. In a
  camera's world the group is a layer, or sits inside one, since `isolation`
  on a wrapper draws the layers under it flat. A render with a shutter blurs
  the element already, and `smear()` gives one copy in it, so the same scene
  needs no change between the preview and a render with a shutter.

## Interactive mode

A lesson is one page in two modes. In interactive mode each step holds and waits
for the learner; in video mode the steps play straight through with their
scripts. A frame is the same in both for the same time and values.

- A step is a clip with an `id` and `data-step`, chained with relative
  starts (`data-start="circle"`). A `data-step` with no `id` or no
  `data-start`, two steps with one `id`, a step inside another step, two
  steps that start together (the first has no range) and a first step that
  starts after 0 are KN-118. Time the content that outlasts
  a step from it in a clip of its own; a number in `data-start` counts from
  the composition, not from the step around it.
- One store field per value, written by both: the learner's control with
  `data-model="sine.angle"` and the step's `script` by the same path. The
  scene reads that field, or follows it. A script writes state fields only;
  a script path whose store does not exist, or that names a computed, fails
  readiness with KN-100.
- A script's settings (`{ at, set }`) take strings, numbers, booleans and
  `null`. A settings entry in the first step that scripts its path starts at
  0 with the value before (`{ at: [0, 2], set: [null, 270] }`), or that
  value shows from the start of the video (KN-157).
- In video mode a write to a scripted path by anything but the script is
  undone before the next paint (KN-146). That includes a watcher that writes
  the path inside the script's own write, but only once per path between two
  seeks: a watcher that writes the path again every time keeps its value. So
  keep watchers from writing scripted paths. Disable every control that writes a
  scripted path, and every quiz button, in video mode:
  `data-bind-attr="{ disabled: $kinetic.mode === 'video' }"`, or a row
  field set from `this.stores.kinetic.mode` for buttons in a `data-list`.
- The script's writes are real store writes, so watchers and `autoSave` see
  them during `check()`, `render()` and a "watch it as a video". Interactive-only
  effects go in action handlers, in a step's `entry`, or in the
  `kinetic:step` event, never in a watcher on `store:kinetic.step`, which
  runs inside the seek and in video mode too. A store that holds scripted
  paths has no `autoSave`; saved progress goes in a store of its own.
- A step that explains a change is written for interactive mode as a task: the
  learner makes the change, and the step's `until` waits for it (a store
  computed such as `atBottom`). Scripts are off in interactive mode.
- Once `until` is true at the hold, the rest of the step's range plays, and
  the step holds on its last frame for Next. So a question holds before its
  explanation: `wait` earlier than the step's end, and the explanation a clip
  that starts after the hold, which plays once the answer is right. A step
  that holds at its end stays there, so a clip that ends with its step has no
  exit, which would leave the hold empty; the next step's clip enters instead. Feedback on a wrong answer is a binding
  on the store, shown during the hold, and the step keeps holding for another
  try.
- Kinetic never moves to the next step by itself; the learner does, with
  Next. Bind the Next button to `$kinetic.canAdvance`, which follows `until`
  (true when there is none) while the step plays as well as at its hold.
  `next()` does nothing while `until` is false. Otherwise it enters the next
  step at once, wherever the step is, and the rest of the step does not play
  (that part plays only in the video, where the step's script writes). Back
  always works.
- At a hold the clock stands still, and so does `local`. What the learner
  changes there moves only through a `follow` spring or a binding to the
  store, never through the time, so design the hold around a control and
  what follows it, and keep the motion that plays by the time before the
  hold or after it.
- The last step offers a "Start again" button that calls `go(0)`, so the
  learner does not have to step back through every step.
- An answer the learner may come back to is cleared by the step's `entry`,
  or an `until` that is already true plays the rest of the question's step at
  once.
- Hints and "try it" prompts belong to the lesson alone: show them through
  the store's mode, `data-show="$kinetic.mode === 'interactive'"` or a
  computed reading `this.stores.kinetic.mode` (with `kinetic` in
  `subscribe`), so the video has none of them.
- Walk a lesson with `check({ lesson: true })` in the page: it enters each
  step, reports whether it held (on the last frame before its `wait`) and
  the `until` it waits on, and takes a still of each hold.
- `wait` is seconds from the step's start, where the step holds for the
  learner before the rest of its range plays. Give it to a step that waits
  on an `until` (a question, a task), placed where the content before the
  answer ends, so the explanation after it plays once they answer. A step
  with nothing to answer needs no `wait`: it plays its range and holds on
  the last frame, and Next is ready the whole time. A step with an optional
  control (a slider to try) may hold at a `wait` for it, and what follows the
  wait plays only in the video: Next from the hold goes straight to the next
  step. Keep each step's range as long as its content: the learner already
  gets the hold at the end, and seconds of a still, empty clip before it
  only make them wait. A `wait` past the range is clamped (KN-157),
  and `wait: false` with `until` is KN-100. `wait: false` plays on into the
  next step with no hold between, so a run of such steps plays as video does.
- `{ follow }` takes springs only (KN-100 for another ease or
  `overshootClamping`), and follows a store path: follow the control and
  derive the rest from the followed value, by name in `shared`.
- A style the script changes in video mode, such as an answer's class,
  takes no CSS transition: the transition runs on the page's clock, so a
  render captures it part-way and `check()` fails on it. A hover or focus
  transition, which only the learner starts, is fine; KN-143 is off in
  interactive mode on a page with steps and on in `check()` and `render()`.
- Leave the HyperFrames runtime's tag off a lesson page, since it holds the
  page in video mode.
- Leave `data-preview` off a lesson page's script tag too: under the default
  `config({ mode: 'auto' })` the bar puts the page in video mode, and the
  learner's controls stop working (KN-158). To keep the bar on a lesson
  while it is made, call `config({ mode: 'interactive' })`. A finished
  lesson has no bar.

## Data and inputs

- List each query the layers read in `queries`, and frame 0 waits for the
  rows. The layers are built once the rows are in, so a repeat `over:
  'sales.rows'` places one copy per row. A failed query is KN-131, a name that matches no query is
  KN-133; both print on every build, and `render()` rejects with the error
  (a HyperFrames render waits at its readiness timeout) instead of
  producing a wrong video.
- Load the data once. A refresh interval, `invalidate()` or `refresh()`
  after frame 0 lets a render capture frames before the new rows arrive
  (KN-132).
- The `inputs` in `layers.scene()` are typed like props (`String`, `Number`, `Boolean`,
  or `{ type, required, default, validator }`), read from the composition's
  variables with `{ from: 'inputs.title' }`, coerced and validated. A missing required
  value, a wrong type or a rejected value is KN-130, printed on every build,
  and the render stops at its timeout. The variables are declared on the
  root in `data-composition-variables`.
- A default declared in `data-composition-variables` wins over the input's
  own `default`, in a render and in a plain tab, since both read the
  declared defaults as variables (KN-134 when the two differ). Declare a
  default in one place.
- `inputs` are composition-wide: every clip reads the same values. For one
  design on several clips with different text or colors, write it as a
  comp and place it with different `params`.
- A text prop is always quoted, one word or many:
  `data-prop-role="'Director'"`, `data-prop-color="'#892dbf'"`,
  `data-prop-title="'Our year in review'"`. A bare word names a value of
  the component around the clip. Numbers and booleans go bare:
  `data-prop-n="3"`, `data-prop-loop="true"`.
- Run `check()` before a render. `await wildflower.kinetic.check({ samples: 30 })`
  seeks a shuffled sample of frames twice in different orders. The report
  carries `ready` (the root's `data-kinetic-ready`) and `errors` (console
  errors, uncaught errors and unhandled rejections during the seeks). It
  begins with a run of readiness, as `render()` does, and fails with
  `reason: 'readiness failed'` exactly when `render()` would reject, with
  `reason: 'a seek threw'` and
  the first message in `firstError`, or with the first frame that differs
  (KN-160 in development). It cannot see a binding that shows nothing or a
  list with no rows, since those are the same on every seek, so look at a
  few frames too.

## What you write yourself

Kinetic has no chart, physics or particle module. When a brief asks for one,
you write it as small pure functions handed over in `fns`, read with
`{ call }` and the time passed in as `{ rate: 1 }`. Anything that depends
on earlier frames is worked out once at load, beside the layers, into plain
arrays, and the function turns the time into an index and reads from
them. A frame then comes out the same whichever
frames came before it, which a render needs (see "Every frame the same").

- Charts are a few lines of arithmetic over the data. A linear scale is
  `mix(x0, x1, (v - lo) / (hi - lo))`; bar i of a band sits at
  `x0 + i * (width + gap)`. Take the axis range from `ticks(0, max, 5)`,
  whose last value covers the largest number, and write the labels with
  `format()`. A bar race orders its rows with `rank()`. A pie or donut is
  one `shape('sector', { from, to, inner })` per slice, its angles from a
  running sum of the shares, in a pool inside the `<svg>` (patterns.md, "A
  pie from data"). A line is path data built from the points, drawn in with
  `trimPath()` or the `pathLength` dash recipe. Grow a chart in by
  multiplying its values or angles by a `ramp()`, with `stagger()` for each
  bar's delay.
- A simulation never runs inside a seek, since a render asks for frames in
  any order. Run it to the end of its clip at load, with a fixed step finer
  than a frame (1/240 s for a bounce), and keep each step's state in typed
  arrays; the seek reads the two steps either side of its time and mixes
  them (patterns.md, "A simulation baked at load"). Any engine works this
  way, its randomness from `random(seed)`. Put a contact that must be seen
  on a whole frame ("A landing on a whole frame"). When a learner's setting
  changes the result, bake again from a watcher on that store field.
  `tick()` runs only in interactive mode, so a simulation run live from
  `tick()` is never part of the video.
- Particles are a pool of a fixed number of slots, each particle a function
  of its age. Make every particle the clip will have at load, with its
  birth time and its values from `random(seed)`; at time t its age is
  `t - born`, and it shows while the age is between 0 and its life. Its
  place comes from a closed form of the age (`x0 + vx * age`, plus
  `0.5 * g * age * age` for gravity) or from `noise()` read at the age.
  Particle i goes in slot `i % SLOTS`, with `SLOTS` the rate times the
  life, rounded up, plus one, so a rounding error when a slot changes
  particles has room (patterns.md, "Particles from an emitter"). A hidden slot writes
  every style property a shown one does, since `update()` leaves the rest
  as the last particle set them. For hundreds, write
  `style` in one static pool from `seek(local)` and use no filters
  ("Bokeh particles with no filter").
- A dashed or dotted circle takes a whole number of dashes: set the gap
  from the radius, `gap = 2πr / n − dash`, on every frame the radius
  changes. Otherwise, where the pattern wraps, one gap comes out short.
