# Changelog

Notable changes to Kinetic (`@wildflowerjs/kinetic`). The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-11-01

### Added

- `text()` takes any axis the outlines were baked with, by its tag (such as
  Shantell Sans's `BNCE`), as a line or letter value beside `wght` and
  `slnt`, and the outline baker offers every axis a font has.

### Fixed

- A page's own sound button starts the sound with one press:
  `config({ sound: true })` called from a click resumes the audio, and
  Kinetic's corner speaker no longer turns it off again.
- `render()` of a canvas with a border or padding and `object-fit` in
  Chrome 157 and later, which paints a canvas into its content box: the
  canvas came out a few pixels off.

### Changed

- `captions()` balances its lines: between sentence ends and pauses, the
  words take the fewest lines `maxWords` and `maxChars` allow, about equal
  in length and broken after a comma near the middle, so a short fragment
  is no longer left on a line of its own.
- KN-131 on a page opened from disk (its address starts with `file:`) says
  the page cannot fetch the files beside it, and to serve the folder or load
  the data as a script.
- KN-170 prints when 3 of the last 30 seeks took longer than 8 ms, instead of
  on the first slow seek, and gives the slowest and a typical seek time.
- KN-151's suggestion, and the guide, put a lesson's frame-loop work on a
  store's `tick()`, which runs in both modes and checks the mode and the
  hold itself.
- The guide: eight more type pairings and six more palettes (Tol Bright,
  Viridis Ordered, Neon Stage, Canopy, Lavender Clinic, Solarized Light),
  and italics used sparingly where they suit the words.
- The guide: a pattern for a rate the learner controls, which the video
  sums from the scripted settings and the lesson advances while a step
  holds, both from one rate function.
- The guide: the starter lesson lays its heading and line out in normal flow,
  so a heading that wraps no longer runs into the line; a pattern for ink
  plates out of register; `boil()`'s `detail` for large shapes; a centered
  line that types in place; and the intake asks nothing when the brief
  already gives enough to build.

## [0.1.1] - 2026-10-31

### Fixed

- `render()` of a DOM composition in Chrome 157 and later, where HTML-in-Canvas
  is on by default: the composition root is marked `drawable` for the render,
  which Chrome now requires of an element it draws, and unmarked after.

### Changed

- The guide's script tags load `@wildflowerjs/kinetic@0.1` (and Trillium
  `@0.2`), so a page built from it picks up patch releases.

## [0.1.0] - 2026-10-31

### Added

- The clock: the `kinetic` store (`time`, `frame`, `fps`, `duration`, `playing`),
  fed by HyperFrames' `hf-seek` with a barrier promise, by a registered
  timeline as a fallback (`config({ channel: 'timeline' })`), or by a
  `requestAnimationFrame` loop when no runtime is on the page. That loop
  holds the last frame 3 s before it starts again (`config({ loop: { hold } })`
  for another length, `loop: false` to stop there; no hold with the preview
  bar up), and with no bar a click on the composition, outside its
  controls, pauses it and plays it again (in a lesson, while a step plays,
  on to its hold), as does Space or Enter on the root, which Kinetic makes
  focusable unless it has a `tabindex` of its own; while a
  click has it paused, a large pause mark sits over the stage's center,
  outside the composition, shown and hidden with no fade. Without
  the bar, a page with sound gets a speaker button over the stage's lower
  right corner, outside the composition: the sound is off until it is
  pressed, and it toggles the sound alone; it shows for 2 s as the page
  starts, then on hover, after a touch and with keyboard focus, and left
  alone it fades.
- `wildflower.kinetic.scene(name, definition)`: a component with `time`,
  `local`, `progress`, `remaining`, `enter`, `exit` and `vars`, timing
  read from HyperFrames' `data-start` (absolute and relative), `data-duration`,
  `data-end`, host composition offsets and `data-playback-start`, an `edges`
  block and a `seek(local)` method; a timing attribute changed on the page
  moves the clips timed from that element at the next seek.
- `data-start="voice.start"`, a clip that starts when `voice` starts, with
  `+ n` and `- n`, and `"voice.end"` as the same as `"voice"`; Kinetic's own
  form, which HyperFrames does not read. An element whose id is the whole
  value wins, and `timeOf()` reads the same form.
- `seek()`, `play()`, `pause()`, `config()`, `compat`.
- Motion as pure functions: `keyframes` tracks on a scene and `styleAt(t, tracks)`,
  the style object for time t, where a key is a track or a plain number held
  at every time, `interpolate(t, at, to, opts)` or `interpolate(t, track)` with per-segment easing, three extrapolation
  modes and colors, `ease(name)` with the CSS vocabulary and GSAP's families,
  `spring(t, opts)` in closed form, `random(seed)` and `noise(x, seed)`.
- Text and data helpers: `split(text, by)` by grapheme, `typewriter(t, text,
  cps)`, `format(n, opts)` with a fixed `en-US` default (a locale or options
  Intl refuses is KN-100), `ticks(min, max,
  count)`, `rank(t, rows, by)` for races, `captions(t, words, opts)` over a
  HyperFrames transcript (a bad option is KN-100), `moment(t, rows)`, the row
  of a timing table current at t with its progress, the next row and each
  row's state, and `beat(t, beats, opts)` over a beat file.
- `trails(kind, at, options)`: `'ghosts'`, copies of an element at earlier
  times, fading and shrinking; `'ribbon'`, the stretch of a path behind a
  mover; `'dots'`, marks along a path, past once the mover reaches them.
- `textMetrics(text, font, { tracking, letters, width })`: a line measured with
  the canvas's `measureText()`, each grapheme's place, and the font size that
  fits a width; readiness waits for each font measured with, and a computed
  that measured before its font loaded measures again once it has.
- `trimPath(d, from, to, { by })`: the stretch of a path between two
  fractions of it, by length or by segment, as path data that can fill; and
  `trimPath([top, bottom], from, to)`, a band between two edges drawn
  partway and closed, either edge direction; and `pathLength(d)`, a path's
  length.
- Markers and tempo on an audio clip, in the file's seconds: `data-markers`
  (an object of names and seconds, as `{ drop: 14.28 }` or JSON), `data-tempo`, `data-downbeat` and
  `data-meter`; `timeOf(time)` reads a time as `data-start` writes one, with a
  marker's name as well as an id, never before 0, and `tempo(id)` gives the beat grid,
  `{ bpm, beat, meter, at(n), of(t) }`.
- `scripts/beatgrid.cjs`, shipped in the package: a music file's tempo, meter
  and first downbeat, each with a confidence, the bar lines where a section
  changes, once per change, and the attributes to paste, with a double-time
  or half-time reading when the music can be counted either way; WAV is read
  directly (PCM, float and the extensible format) and anything else through
  ffmpeg, a silent file is an error, and `--json` gives the same as JSON.
- Readiness: `window.__hf.buildReady.kinetic` and `wildflower.kinetic.ready()`,
  settled after the first scan, fonts, every `waitFor` query and the images
  under the scenes; a failure is printed to the console, holds the render
  and rejects `ready()`.
- `inputs` on a scene: typed, defaulted and validated from the composition's
  variables before `init()`, as `this.inputs`.
- CSS-animation catch-up: after every seek, before the frame is captured,
  any CSS animation under a scene that HyperFrames did not position is set
  to the seek, relative to its clip, the way the runtime's adapter does.
- Determinism diagnostics in development, for the window between a seek and
  its capture: wall clock, `Math.random`, timers and fetch, CSS transitions,
  unlocalized formatting, slow seeks.
- `wildflower.kinetic.check({ samples })`: the determinism self-test, two
  shuffled passes over a sample of frames compared element by element.
- The preview bar (`?preview`, `data-preview`, `config({ preview: true })`):
  play, pause, scrub, frame steps and a readout, outside the root, never
  during a render.
- Trillium views inside a scene are drawn once per seek, once its footage has
  landed and before the frame is captured, through `view.draw()` (Trillium
  0.2), so a footage clip on a texture registered with `view.video()` shows
  the seek's frame. A view that throws does not stop the later views' draws,
  and the seek rejects with its error.
- `wildflower.kinetic.render({ fps, codec, from, to, source })`: an MP4 from
  the page through WebCodecs and a built-in MP4 writer, every frame a settled
  seek and a whole number of 90 kHz ticks, so the file lasts `frames / fps`
  at any rate; a canvas source in any Chrome, the DOM through
  `drawElementImage` behind Chrome's flag, scaled to a `width` and `height`
  passed; one render at a time (KN-100 for a second while one runs), `from`
  and `to` within the composition, a playing clock playing on after it, and
  KN-207 for an encoder that fails or stalls; a Render button on the preview
  bar.
- A scene's `local` holds at its clip's edges, 0 before the clip and its
  duration after it, where the scene is hidden, so a hidden scene's
  computeds stop running; its `seek(local)` is skipped on a seek that leaves
  `local` as it was (`check()` calls it on every seek), and a Trillium view
  inside a hidden clip is not drawn. KN-170 names how many scenes are inside
  their clips when a seek is slow.
- With no runtime on the page, each clip (every element with `data-start`)
  is hidden outside its window on every seek, by the runtime's rule: a
  half-open window, the last clip shown on the final instant, a descendant
  of a hidden clip hidden with it.
- `check()` compares every attribute as well (an SVG path's `d`, a viewBox).
  Class tokens, style declarations and attributes are compared in sorted
  order, since a binding adds and removes them one at a time; a report shows
  them in the order the element held them.
- A `blur` track in `keyframes` and `styleAt()`, which becomes `filter: blur()` in
  px, and `focus(z, plane, { range, max, steps, depth })`, the blur of a thing at
  depth `z` when the focal plane is at `plane`, for rack focus across
  elements at different depths.
- A skill for Claude Code, `skills/wildflower-kinetic/`, shipped in the
  package: the procedure, the rules, the API, the patterns, and
  `scripts/check.cjs`, which runs `check()` on a page in a headless browser
  and prints every KN line, failing on any of them, and an error that comes
  again from many seeks once, with its count, then times each block of text
  on screen and lists any that leaves before it can be read, by the BBC
  subtitle rate. The skill has a default style (`references/style.md`) and a
  craft reference drawn from research into professional design
  (`references/craft.md`, with one file for each kind of piece): the intake
  questions, a plan with each scene's message, hero and visual idea, still
  key frames judged before motion, and sourced rules for composition, color,
  time and motion.
- `presence` on every scene, `enter * (1 - exit)`, and `clipFrame`, the
  frame number within the clip (the composition's frame is `$kinetic.frame`
  on the store).
- `ramp(t, from, to, ease)` and `mix(a, b, p)` for numbers and colors.
- A track's `ease` can be an array with one ease per segment.
- Development warnings for a clip whose start or end falls between two
  frames (KN-114), a length property given numbers with no unit (KN-122),
  and a spring cut off by its next key short of rest (KN-123).
- `progress` and `exit` reach 1 on a clip's last captured frame,
  `duration - 1/fps` after its start, so a fade out is complete in the file.
- Every seek flushes the page's pools with `wildflower.flushPools()`
  (WildflowerJS 1.5.5) once its scenes have settled, so what `seek(local)`
  wrote to a pool is in the frame whenever the pool mounted. KN-150 is
  retired.
- A seek and readiness wait for every pending `init()`, store waits included,
  with `wildflower.whenInitialized()` (WildflowerJS 1.5.5).
- Development warnings print as `[KN-141] ...`, through
  `wildflower.diagnostic()` when WildflowerJS is a development build, so they
  are also in `wildflower.diagnostics`. The preview bar counts the KN lines
  Kinetic prints and leaves the console as it is.
- KN-154 covers a binding on the root tag of a scene inside another scene
  that uses one of Kinetic's own values; a name only the scene has is
  WildflowerJS's WF-521.
- With no runtime on the page, `vars` and `inputs` read the defaults the page
  declares in `data-composition-variables`, under `window.__hfVariables`, as
  a render does; KN-134 when an input's own default differs.
- Outside a render, `html` and `body` get back the size, margin, padding and
  overflow that the HyperFrames runtime sets on them. `config({ fit })`, on
  by default with the preview bar, scales the stage down to the window
  inside a plain `<div class="kinetic-fit">`, and `render()` draws a fitted
  stage at the composition's own size.
- Eight more transform keys in `keyframes` and `styleAt()`: `perspective`,
  `translateZ`, `rotateX`, `rotateY`, `skewX`, `skewY`, `scaleX` and `scaleY`,
  written into `transform` in a fixed order with `perspective()` first. The
  transform keys and `blur` take numbers only (KN-120).
- Tracks whose values are text with numbers and colors in them, such as
  `clipPath`, `filter: drop-shadow()`, `fontVariationSettings` and gradient
  stops. Every keyframe has the same text, a mismatch is KN-120 with the
  first difference, and numbers are written with at most four decimals.
  `interpolate()` and `mix()` take text values too.
- SVG path data in text tracks. A value that is all path data, and the
  inside of `path("…")` or `path('…')` on `clipPath`, `offsetPath` or `d`, is
  read by the SVG 2 path grammar, so numbers written together such as
  `M190-30C130` move, an arc's flags stay as written, and the path is written
  back with a space between its numbers. Paths with different commands are
  KN-120, and the message points to `matchPaths()`.
- `matchPaths(paths, { segments, align })`: two or more paths with any
  commands returned as absolute cubics with the same commands and segment
  count (at least 8), each closed subpath turned to run the first path's way
  and started nearest its start, ready to be a track's `to`.
- `shape(kind, options)`: the path data of a `'polygon'`, `'star'`, `'sector'`
  or `'arrow'` from numbers a track can drive.
- `distribute(kind, n, options)`: n points `{ i, x, y, heading, u }` along a
  line, round a circle or an arc, on a grid, in a sunflower spiral, in a
  seeded even scatter or evenly by length along SVG path data.
  `falloff(kind, point, options)`: a weight from 0 to 1 for a point from a
  radial, linear, band, ring or shape field, eased or inverted.
- `wiggle(t, { frequency, amplitude, seed })`: After Effects' wiggle, a value
  that passes through a seeded one in -amplitude to amplitude every
  1 / frequency seconds, smoothly; stepped by `posterize()`, a stop-motion jitter.
- KN-122 covers `offsetDistance`, which the browser drops when it has no unit.
- Transitions. `data-clip-transition="kind [direction] [ease]"` on a clip turns its
  overlap with the sibling clip it starts inside into a transition, over
  exactly the overlap; `data-clip-enter` and `data-clip-exit` give a clip an entrance or
  an exit of its own length, in seconds or frames (`18f`). The kinds are
  `fade`, `push`, `cover`, `reveal`, `wipe`, `iris`, `clock`, `zoom`, `blur`
  and `flip`. Kinetic writes `translate`, `scale`, `rotate`, `opacity`,
  `clip-path`, `filter` and `z-index` inline during the window only, never
  `transform`, and puts the clip's own inline value back after, on every
  seek with or without the HyperFrames runtime. `cover` keeps the incoming
  clip and `reveal` the outgoing one at `z-index: 1` for the whole overlap,
  and two transitions that write `opacity` on one clip at once multiply.
- `transition(kind, p, { direction })`: the same incoming and outgoing style
  objects for use inside a scene.
- Development warnings for a transition attribute Kinetic cannot apply
  (KN-115), a `data-clip-transition` that overlaps no sibling clip or more than
  one (KN-116), and a binding, a `root:` block or page code that writes a
  property a transition writes on the same clip during its window (KN-156).
- Audio. An `<audio>` with `data-start` in the composition root is a clip,
  with `data-duration`, `data-end`, `data-media-start`, `data-volume` and
  `data-fade-in`/`data-fade-out`, its file the `src` or a `<source>` child's,
  decoded once at readiness. The preview plays
  the clips in step with the clock, and plays one frame's sound on a paused
  seek; a speaker button on the bar and `config({ sound })`.
- `render()` writes the clips' mix as an AAC or Opus track
  (`audio`, `audioCodec`, `audioBitrate`), with an edit list over AAC's
  priming and Opus's pre-skip in `dOps`.
- `level(t, band, { clip })` and `spectrum(t, bins)`: the mix's levels at a
  time, from tables built at readiness, with any DC offset taken out; the
  clock store's `levels` field.
- Footage. A `<video>` with `data-start` in the composition root is a clip,
  with `data-duration` (or the rest of the file), `data-end`,
  `data-media-start` (or `data-playback-start`, read first, as the runtime
  reads it) and `data-playback-rate`, `muted` or
  `data-has-audio="true"`; with no length written, a media start at or past
  the file's end is a clip of no length, never shown (KN-139). Each paused seek, `check()` and `render()` seeks it
  to the source frame on screen 1 ms after the composition frame's time, and
  the preview plays it in step with the clock. A video with sound is also an
  audio clip, with `data-volume` and the fades.
- `data-playback-rate` applies to the sound of `<audio>` clips and footage,
  with the pitch following the rate.
- `render()` throws KN-204, before it touches the page, for media from another
  origin that it would draw black: an `<img>`, `<video>` (its poster too) or
  SVG `<image>` without `crossorigin`, a CSS image on an element or its
  `::before` or `::after`, an `<input type="image">`, or a frame or `<object>`
  (drawn empty), open shadow roots included.
- A camera for scenes made of HTML, CSS and SVG. `camera(t, tracks, options)`
  gives the element that holds the layers its style from `x`, `y`, `z`,
  `pan`, `tilt`, `roll` and `zoom`, each a track or a number, with
  `perspective` and `shake` options; `depth(z, options)` puts a layer at a
  depth, scaled to fill the frame at rest; `shake(t, profile, options)` gives
  `'handheld'`, `'rumble'` or `'impact'` offsets from seeded layered noise.
- Motion blur. `render({ shutter })`, with `config({ shutter })` as the
  default, makes each frame the average of `samples` seeks (8) over a
  shutter `angle` (180 degrees), forward from the frame's time, so the DOM,
  camera moves, Trillium views and footage blur and a cut stays a cut, with
  `frame` and `clipFrame` on the frame's own number through its samples;
  `smear(t, style, { samples, angle, fps })` gives rows of copies added with
  `plus-lighter` in an isolated group for blur in the preview, one copy
  inside a render with a shutter; the clock store's `shutter` field. With the
  HyperFrames runtime on the page, whose player rounds each seek down to one
  of its own frames, `render()` does not apply the shutter, and development
  builds warn once per page (KN-205).
- With Kinetic loaded before the HyperFrames runtime starts, the runtime's
  player seeks on the root's `data-fps`. When the page sets no
  `window.__HF_EXPORT_RENDER_SEEK_CONFIG`, Kinetic defines it to read as the
  root's `data-fps`, which the runtime reads as it starts; a config the CLI
  or the page sets is kept as set. With the runtime on the page, a render's
  fps has to divide the root's `data-fps` (a root at 60 renders at 60 or 30,
  one at 25 at 25): each frame's seek has to land on the frame's own time,
  and `render()` throws KN-206 when one lands anywhere else, as it does with
  Kinetic loaded after the runtime started (with no config set, the player
  then stays at 30 fps) or a `from` between the player's frames.
- `render()` at an fps other than the clock store's sets the store's `frame`
  with its `fps`, so frame 0 has its own number when the runtime's player is
  already at `from` and sends no seek for it.
- Small helpers. `stagger(i, n, { each, total, from, grid, axis, ease, seed })`
  gives item i of n its delay from the first, the last, the center, the
  edges, a seeded order or an index, in a row or on a grid;
  `scramble(t, text, options)` settles text left to right from scrambled
  characters; `spring(t, { duration, bounce })` and a spring ease take a
  settle time and a bounce in place of stiffness, damping and mass, and
  `settle(options)` gives the seconds any spring takes to stay within 2%,
  which KN-123's suggestion now reads; `noise2()` and `noise3()`;
  `posterize(t, fps)`, `loop(t, from, to)` and `hold(t, at, length)`;
  `space: 'oklch'` on a track, `interpolate()` and `mix()` mixes colors in
  OKLCh; `extrapolate` takes `'wrap'` and `'mirror'`; and `srt(text)` reads
  SRT or WebVTT subtitles into the transcript `captions()` takes.
- Luma transitions. `luma url(path)`, `halftone` and `dissolve` in
  `data-clip-transition`, `data-clip-enter` and `data-clip-exit` mask the clip
  with a grayscale map through an SVG filter, so the map's dark parts come in
  first: an image's brightness (`invert`), dot cones on a turned grid that
  open from a side or all at once (`24px`, `45deg`), or seeded noise (`3px`),
  each with `soft`. The built-in maps are drawn at the clip's size, the same
  PNG on every load; a `luma` map that fails to load holds readiness
  (KN-117), and a clip whose own box is empty is warned about (KN-115).
- `effect(canvas, { source, kind, ...params })`: halftone, stipple,
  splatter, dither and duotone with WebGL 2 from an `<img>`, `<video>` or
  `<canvas>` (stipple with `grade`, round specks and `color: 'source'`,
  dither with `color: 'source'`, splatter as round drops from `max` px down to `min` px,
  large ones only where it is darkest, each at its own strength by
  `vary`), drawn
  after each seek once the footage has landed and again only when its
  parameters or its source's frame change, with `set(params)` and
  `dispose()`, one live effect a canvas (KN-100 for a second); KN-204, once, for a source from another origin without CORS;
  an effect made with `scene: this` is disposed with the scene and one
  whose canvas leaves the page at the next seek, and a lost WebGL context is
  warned about (KN-191) and set up again when restored.
- A clip outside its window paints nothing: it also carries
  `data-kinetic-hidden`, which an adopted style sheet clips to nothing, so an
  SVG filter that makes its own pixels no longer paints through
  `visibility: hidden`. Readiness sets a lazy `<img>` or `<iframe>` in the
  composition to eager, since Chrome does not load one in a clipped clip.
- Readiness prints every failure as it comes, so a KN-117 and a KN-135 both
  show, and every broken audio or footage file prints its own line; the
  audio clips are read when a footage clip fails.
- `check()` and `render()` each begin with a run of readiness, which looks at the page as it is, so `check()` fails exactly when `render()` rejects, with the failure's `code` and `where` in the report: `render()` rejects for a bad input or a failed `waitFor` in any scene on the page and for a failure reported during its frames, `render({ audio: false })` still needs the audio clips to load, a file that failed is asked for again, and a clip or scene taken off the page fails nothing. An image under a scene still loading after 30 s fails readiness (KN-182), and a footage seek not landed in 30 s fails the seek (KN-138), so a stalled server never holds a render forever.
- `lottie(animation, { start, rate, loop })` seeks a lottie-web animation to the clock, its handle's `dispose()` handing it back, and `animatedImage(src)` draws a GIF, WebP or APNG frame by time, both waited for at readiness (KN-180, KN-181), and `render()` draws each canvas in the composition as the page shows it at that seek, wherever it sits.
- Interactive mode: the same scenes run as a lesson whose steps (`data-step` clips, with `step(id, { wait, until, entry, script })`, `next()`, `back()` and `go()`) hold and wait for the learner, and as a video whose step scripts write the store paths the learner's controls write, with `follow` easing a scene's values by a spring in both, and `config({ mode })` choosing between them. Interactive mode never moves to the next step by itself: each step plays and holds on its last frame for the learner's Next. `canAdvance` follows the step's `until` alone, so Next is ready whenever nothing is left to answer; once `until` is truthy the rest of the step plays by itself (the explanation of a right answer) and holds, and `next()` enters the next step at once from anywhere in the step, leaving what follows a hold to the video. A step's `entry` is written when the step is entered and when it is done again (`play()` from its hold, or a scrub back before the hold), and a scene's `tick(dt)` runs on the page's frame loop in interactive mode only, for what the page does live. A scene's state changed while the clock stands still seeks the time again, once a frame, so its `seek(local)` and its effects follow a control moved during a hold.
- `ease: 'smooth'`: the smoothstep, and as the one ease of a number track with three or more keys a single curve through them all, its velocity continuous at each key between and zero at the ends, never passing a key's value.
- `sweep(i, n, p, options)`, a range selector: item i's weight under a window that sweeps through the items, by shape (`ramp`, `square`, `triangle`, `round`), width, order and ease; and `repeat(n, options)`, a repeater: rows of copies, each the transform of the one before it again, as one `matrix()`.
- The finish: `render({ finish })` and `config({ finish })` draw every rendered frame, after the shutter, through a WebGL 2 pass with grain, a vignette, bloom, chromatic aberration, a grade, a soften and dust, deterministic by frame number; the grain holds still unless its `fps` sets how many times a second it changes; the page shows the vignette, the grain, the dust, the grade's exposure, contrast and saturation and the soften live, as overlays Kinetic keeps in the root and hides for a render. `config()` reports the finish as each field's named parts, which `config({ finish })` takes back, and development builds warn (KN-192) when a render with a finish starts while effects and drawings hold 16 WebGL contexts.
- `shade(canvas, { kind, …, marks })`, printed shading: the `marks(m, t)` option's marks (`band`, `glow`, `edge`, `path`, `fill`, `paint`) paint a density field, the layer's `mask` cuts what it draws to a shape, each clipped to a shape (all but `paint` with a falloff and an ink), drawn as stipple, splatter, halftone or dither, or as light (the field itself) or grain (noise as strong as the field), with a CSS blend mode; `fps` gives the noise a new seed n times a second after `delay` seconds, and `freeze` and `move` set what moving marks do between seeds; `set()` changes every option but `kind`, `marks` included (`move: null` stops the layer moving), and does nothing when every value is as it was, and `redraw()` paints a frozen layer's marks again. `blur(element, { radius, …, marks })` blurs what is under an element where the same marks paint, by masking a backdrop-filter with the field.
- `shade()` kinds `'crachis'` and `'ink'`, which print up to four inks over each other, one ink for each mark's `ink`, blended by multiply: crachis sprays each ink as still drops covering 0.918 of the area at density 1, with overprinted drops multiplied (`dot`, `spread`, `seed`), and ink mixes the inks smoothly in linear light, each absorbing light as its density rises. In both, `paint(fn, { ink })` names its ink. `paint()` takes only `clip` and `ink`.
- `draw(canvas, { inks, …, strokes })`, the drawn look: strokes in pencil, pen and ballpoint (up to 16 inks, each its own color) laid by a hand that speeds up and slows down, wanders and presses in and lifts off, planned with `construct()`, `contour()`, `hatch()`, `accent()`, `text()` and `pause()`, drawn on from `start` (paced to `end`, a stroke pinned with `at` keeping its time) or already drawn, one drawing a canvas, with a tip thinner than a pixel drawn a pixel wide so a small drawing keeps whole lines; any seek order draws the same frame, and a drawing moved by CSS catches the paper's tooth anew.
- Line boil: `boil(d, options)` moves SVG path data along its normals by stepped noise, and `effect()`'s `boil` kind moves a canvas, image or video, each by up to about `amount` px. Each changes its seed `fps` times a second after `delay` seconds, as `effect()`'s stipple and splatter do.
- `text(canvas, { font, lines })`: lines of type on a canvas from a variable font's baked outlines, each letter with its own weight, slant, offset, scale, rotation, opacity, blur and color, placed from its advance and kerning at its own setting; and the outline baker (`bake/outlines.mjs`, and a page on the Kinetic site), which keeps each glyph at a few stops on the weight and slant axes, more wherever blending two stops misses the font's own outline by more than 2 font units.
- `scene: this` on `effect()`, `shade()`, `blur()`, `text()` and `lottie()`, and on `animatedImage(src, { scene })`: the layer runs on that scene's local time and is disposed with the scene, wherever and whenever it was made; without it, a layer runs on composition time until `dispose()`. A `scene` that is no scene's component, and `set({ scene })`, are KN-100.
- The stage's size: a composition root whose CSS leaves its width or height at auto gets `data-width` or `data-height` in px before the page is shown, so a page need not repeat them in CSS; a size the page gives the root stays.
- Speed ramps: `data-remap` on a footage or audio clip, the clip's time as a track of file seconds, eased as a track is, with holds; the render and `check()` seek the remapped time, the preview plays at the remap's speed, and a clip's sound follows the keys, silent through a hold.
- `data-remap` and `data-markers` take WildflowerJS's attribute object syntax, `{ at: [0, 1], to: [0, 2], ease: 'smooth' }`, as well as strict JSON.
- `render({ signal })` takes an `AbortSignal` that cancels the render, putting the page back and rejecting with `signal.reason`; the preview bar's Render button is Cancel while a render runs.
- Diagnostics KN-100, 101, 102, 110, 111, 112, 113, 114, 115, 116, 117, 118, 120, 121,
  122, 123, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142,
  143, 145, 146, 150, 151, 152, 153, 154, 155, 156, 157, 160, 170, 180, 181, 190, 191,
  200, 201, 202, 203, 204, 205, 206, 207.
- An error's message in the production build carries the code, where the
  error came from and a link to the code's entry on the error-codes page; the
  development build's message says what is wrong.
