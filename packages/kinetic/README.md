# Kinetic (`@wildflowerjs/kinetic`)

Kinetic is a WildflowerJS extension, used in code as `wildflower.kinetic`. It
turns a WildflowerJS page into a video, where every value is a function of
time, previewed, checked and rendered in the browser. A scene has no
timeline to register. The renderer seeks, and the scene's computeds answer.

The same scenes run in two modes. In video mode the page is a video that
plays straight through and renders to an MP4. In interactive mode it is a
lesson that plays one step at a time, waits for the learner, and follows
their input.

Kinetic is HyperFrames-compatible, so the same page also renders through
[HyperFrames](https://github.com/heygen-com/hyperframes) with its runtime's
script tag added. HyperFrames is by HeyGen, and Kinetic is not affiliated
with HeyGen.

Status: in development, not published.

Reference: https://kinetic.wildflowerjs.com/docs/reference/. Error codes:
https://www.wildflowerjs.com/docs/error-codes/.

## Use

Serve `dist/kinetic.wf.min.js` (or `dist/kinetic.wf.js`, the development
build) and load it after the framework, before the page's own scripts. On
npm the package is `@wildflowerjs/kinetic`.

```html
<script defer src="/js/wildflower.lite.min.js"></script>
<script defer src="/js/kinetic.wf.min.js"></script>
<script defer src="/js/scenes.js"></script>
```

Kinetic settles readiness after `DOMContentLoaded`, when every deferred and
module script has registered its scenes. A second copy of the file does
nothing, and development builds say so (KN-102).

## A scene

The composition is an element with `data-composition-id`, and each scene is
a component inside it, timed by the clip attributes HyperFrames reads.

```html
<div data-composition-id="main" data-start="0" data-duration="6" data-fps="30" data-width="1920" data-height="1080">
  <div data-component="title" data-start="1" data-duration="3">
    <h1 data-bind-style="style">Launch</h1>
  </div>
</div>
```

```js
wildflower.kinetic.scene('title', {
  keyframes: {
    style: {
      opacity:    { at: [0, 0.5, 2.5, 3], to: [0, 1, 1, 0] },
      translateY: { at: [0, 0.6], to: [40, 0], ease: 'spring' }
    }
  }
});
```

Open the page with `?preview` on the URL and a preview bar appears: play,
scrub, step a frame, check and render. The same render from code:

```js
const report = await wildflower.kinetic.check({ samples: 30 });   // { ok: true, frames: 180, ... }
const { blob, frames, ms } = await wildflower.kinetic.render();   // an MP4, with its sound
```

## Scenes and time

`scene(name, definition)` registers a component, so `name` is its
`data-component`. The definition is an ordinary component definition plus
`keyframes`, `edges`, `follow`, `inputs`, `waitFor` and `seek(local)`, and
the scene gets the computeds `time`, `local` (seconds since its clip's
`data-start`, held at 0 before the clip and at its duration after it, where
the scene is hidden and costs nothing), `clipFrame`, `progress`,
`remaining`, `enter`, `exit`, `presence` and `vars`.

The clock is the store `kinetic` (`time`, `frame`, `fps`, `duration`,
`playing`, `mode` and the step fields). HyperFrames drives it through
`hf-seek`, and without the runtime on the page Kinetic drives it from
`requestAnimationFrame` and hides each clip outside its window, so a scene
file previews in a plain tab as it renders. The controls are `seek()`,
`play()`, `play({ from, to })`, `pause()` and `config(options)`.

Clips are timed as HyperFrames times them: `data-start` in seconds or
relative to another clip (`"intro - 0.5"`), `data-duration` or `data-end`,
and `data-playback-start` on a nested composition. Kinetic also reads
`"voice.start"`, when the clip `voice` starts, which HyperFrames does not. Seeks land on whole
frames, so a moment such as an impact is tied to a frame with
`this.clipFrame`. `seek(local)` runs after every seek and before the frame's
bindings are written, and a promise it returns holds the capture.

## Motion

The motion helpers are pure functions on `wildflower.kinetic`, so the same
frame always gives the same value.

- Tracks and keyframes: `interpolate()`, `styleAt()`, `ease()` (the CSS names,
  GSAP's, and `'smooth'`, one curve through every key of a track), `spring()`
  and `settle()`, `ramp()`, `mix()`, with colors
  per channel or in OKLCh, and text values with numbers in them, SVG path
  data included.
- Time: `stagger()`, `sweep()` (a range selector over letters or rows),
  `posterize()`, `loop()` and `hold()`.
- Copies: `repeat()`, a repeater whose copies each take the transform of
  the one before again.
- Noise: `random()`, `noise()`, `noise2()`, `noise3()` and `wiggle()`.
- Camera: `camera()`, `depth()`, `shake()` and `focus()`, for a camera
  moving through layers of HTML, CSS and SVG.
- Motion blur in the preview: `smear()`.
- Paths: `matchPaths()`, which makes any paths morphable, and `shape()`.
- Many things as one: `distribute()` and `falloff()`.
- Text and data: `split()`, `typewriter()`, `scramble()`, `format()`,
  `ticks()`, `rank()`, `captions()`, `srt()` and `beat()`.

## Interactive mode

`config({ mode })` takes `'auto'`, `'interactive'` or `'video'`, and
`$kinetic.mode` holds the mode in force. A render, `check()`, the
HyperFrames runtime and the preview bar under `'auto'` are video mode, and a
plain page is interactive.

A step is a clip with an `id` and `data-step`, and steps chain with relative
starts. `wildflower.kinetic.step(id, { wait, until, entry, script })` gives a
step what markup cannot carry: where it holds, a store path that plays the
rest of the step and readies Next, values written on entry, and a
script that writes store paths on
every seek in video mode. `next()`, `back()`, `go(step)` and `play()` move
through the lesson, and Kinetic never moves to the next step by itself:
`canAdvance` follows the step's `until` path (true with none), and the step
holds on its last frame until the learner presses Next. One store field has two writers: a slider writes
`sine.angle` in interactive mode, the script writes it in video mode, and
the scene reads it either way. A scene's `follow` block eases values toward
store paths by a spring, the same in both modes.

The demo `www/demos/kinetic-sine/` is the running example.

## Clips, media and effects

- Transitions: `data-clip-transition` on a clip that overlaps the one before
  makes the overlap a transition, and `data-clip-enter` and `data-clip-exit`
  give a clip an entrance or an exit. The kinds are `fade`, `push`, `cover`,
  `reveal`, `wipe`, `iris`, `clock`, `zoom`, `blur`, `flip`, `luma`,
  `halftone` and `dissolve`. `transition(kind, p)` gives the same styles for
  a layer inside a scene.
- Sound: an `<audio>` with `data-start` is an audio clip, played through Web
  Audio in the preview and mixed into the render. `data-tempo`,
  `data-downbeat`, `data-meter` and `data-markers` name the moments of a
  song, read by `timeOf()` and `tempo()`, and `scripts/beatgrid.cjs` finds
  them. `level()` and `spectrum()` read the mix.
- Footage: a `<video>` with `data-start` is a footage clip, sought to the
  frame for each seek. `data-remap` gives a footage or audio clip a speed
  ramp, its time as a track of file seconds, holds included.
- `lottie(animation)` and `animatedImage(src)` put a Lottie animation and an
  animated GIF, WebP or APNG on Kinetic's clock.
- `effect(canvas, { scene, source, kind })` draws halftone, stipple, splatter,
  dither or duotone with WebGL 2.
- `shade(canvas, { scene, kind, marks })` paints shading from marks (a band, a
  glow, a shape's edge, a fill, or the author's own painting) and draws it
  as stipple, splatter, halftone or dither, as light or grain, or in up to
  four printing inks as crachis (sprayed drops) or ink (smooth); `fps: n`
  gives the noise a new seed n times a second. `blur(element, { scene, radius,
  marks })` blurs what is under an element where the same marks paint.
- `text(canvas, { scene, font, lines })` draws lines of type from a variable
  font's outlines, each letter at its own weight and slant; the outline
  baker (`bake/outlines.mjs`, and a page on the Kinetic site) makes the
  outlines from a font file.
- `scene: this`, given to any of those layers or to `lottie()` in a
  scene's own methods, puts the layer on that scene's local time and
  disposes it with the scene. Without it, a layer runs on composition time
  until its `dispose()`.
- Line boil: `boil(d)` for SVG path data and `effect()`'s `boil` kind for
  a canvas, an image or a video move edges by a little noise, each with a
  new seed `fps` times a second.
- A Trillium view whose canvas sits inside a scene is drawn once per seek.

## Readiness, check() and render()

Readiness waits for the scenes, the fonts, every `waitFor` query, the images
under the scenes, the audio and footage clips, the transition maps and the
Lottie animations and animated images. `await wildflower.kinetic.ready()` is
the same promise, and Kinetic sets `data-kinetic-ready` on the root when the
page may be shown. Kinetic's cloak, one rule in the page, hides the stage
until then:

```css
[data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }
```

It is named after WildflowerJS's `[data-cloak]`, which lifts when the
components initialize. Kinetic's cloak lifts later, when Kinetic is ready
(fonts, media decoded, effects drawn, the first seek landed), and hides with
`visibility`, keeping the layout Kinetic measures, where `[data-cloak]` uses
`display: none`. Kinetic gives the root its `data-width` and `data-height`
when the page's CSS sets no size, so the CSS need not repeat them.

`check()` seeks a sample of frames twice in different orders and compares
what the root held, so a composition that depends on the order of seeks is
caught before a render is. `render()` writes an MP4 from the page itself:
each frame a seek, drawn with `drawElementImage`, encoded with WebCodecs and
written by Kinetic's own MP4 writer, with the audio clips mixed into the
sound track. `render({ shutter: 180 })` blurs motion, and
`render({ finish })` gives every frame grain, a vignette, bloom, aberration,
a grade, a soften or dust; set in `config()`, the finish also shows live in
the page where the browser can carry it.

## Many videos from one page

`scripts/batch.cjs` renders a page once for each row of a JSON or CSV
file, in Chrome through the page's own `render()`, with the row's values as
the composition's variables (`data-composition-variables` on the root,
`inputs` in a scene). It needs Playwright, `playwright-core` with Chrome
installed or `playwright`, and passes HTML-in-Canvas to the browser itself.

```bash
node scripts/batch.cjs index.html rows.json --out renders
node scripts/batch.cjs index.html people.csv --name name
```

Files are named `<composition id>-<row number>.mp4`, or by `--name field`.
A row whose input fails (KN-130) stops the batch with the KN line and exit
code 1.

## Rendering through HyperFrames

The same page renders through `npx hyperframes render`, with
`--batch rows.json` for the rows and parallel workers. That route needs the
HyperFrames runtime, 0.8.0 or later, after Kinetic's tag and before the
page's own script. `wildflower.kinetic.compat.hyperframes` is the runtime
version Kinetic is tested against, and
https://kinetic.wildflowerjs.com/docs/hyperframes/ has what changes on the
page while the runtime is present.

```html
<script defer src="https://cdn.jsdelivr.net/npm/@hyperframes/core@0.8.133/dist/hyperframe.runtime.iife.js"></script>
```

## Requirements

wildflowerjs 1.5.5 or later, on every tier (nano, mini, mini-pool, lite,
core, spa, full), in development and production builds. Rows from
`data-list` need a tier with lists, pools need one with pools, and `waitFor`
and queries need full.

`render()` needs Chrome. A canvas source renders in any Chrome, and the
composition's DOM needs
[HTML-in-Canvas](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
enabled (KN-201 otherwise), until Chrome 157 a setting: paste
`chrome://flags/#canvas-draw-element` into the address bar, set the entry to
Enabled and restart Chrome. WebCodecs needs a secure context, https or
localhost (KN-200). Media from another origin needs CORS (KN-204).
`animatedImage()` needs `ImageDecoder`, which Safari lacks at the time of
writing.

## Diagnostics

The codes carry the prefix `KN`. Errors are thrown on every build with the
code in `error.code`, and readiness failures print on every build and reject
`ready()`. Warnings are development builds only. Build with
`kinetic.wf.js`, whose messages say what is wrong and how to fix it; the
production file's messages carry the code, where the error came from and a
link to its entry on the
[error codes](https://www.wildflowerjs.com/docs/error-codes/) page.

| Range | |
|---|---|
| KN-10x | Install and the seek channel; KN-100 is a bad call. |
| KN-11x | The composition's markup: root, timing, transitions, steps. |
| KN-12x | Tracks and eases. |
| KN-13x | Inputs, readiness, audio clips and footage. |
| KN-14x | Determinism hazards seen during a seek. |
| KN-15x | The scene definition. |
| KN-16x | `check()`. |
| KN-17x | Seek cost. |
| KN-18x | Lottie and animated images. |
| KN-19x | WebGL: Trillium's views and effects. |
| KN-20x | `render()`. |

## TypeScript

`types.d.ts` declares `WildflowerKinetic` and the type of every option and
result, and inside a scene's computeds and methods `this` is the scene
context plus the scene's own properties. On a page that loads the files by
script tag, add
`/// <reference types="@wildflowerjs/kinetic/types.global" />`.

## The skill for Claude Code

`skills/wildflower-kinetic/` is a skill in the Claude Code layout, shipped
in the package: `SKILL.md`, the rules, the API, the patterns with their code,
and `scripts/check.cjs`, which opens a composition in a headless browser
(the installed Chrome, else Playwright's Chromium), runs `check()` and
prints every KN line, saves frames to look at with `--frames 0,2.5,5` or
`--frames 12`, and walks a lesson's steps with `--lesson`. Copy the folder into a project's
`.claude/skills/` (or `~/.claude/skills/` for every project). It applies to
any brief that asks for a video: a title, motion graphics, a chart or
captions from data, a lesson, or many videos from one page.

## Tests

```
node scripts/build-rollup.cjs kinetic.wf
node scripts/fetch-hyperframes.cjs          # once: the pinned runtime for test/runtime.test.js
node scripts/fetch-lottie.cjs               # once: the pinned lottie-web for test/lottie.test.js
npx vitest run --config packages/kinetic/vitest.config.js
node scripts/test-extension.cjs kinetic   # every tier and build the manifest declares
node --test packages/kinetic/test/coverage-skill-check.test.cjs   # the skill's check.cjs, in Node
node packages/kinetic/test/fixtures/make-footage.cjs             # rewrites the committed footage fixtures, with FFmpeg
node packages/kinetic/test/fixtures/make-images.cjs              # rewrites the committed animated images (GIF and APNG with FFmpeg)
```

## License

MIT
