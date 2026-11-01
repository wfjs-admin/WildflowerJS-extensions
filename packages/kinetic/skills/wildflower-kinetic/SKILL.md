---
name: wildflower-kinetic
description: >
  Use when a video is built with Kinetic, the WildflowerJS extension that
  turns a page into a video, previewed, checked and rendered in the browser.
  That covers a brief that names WildflowerJS or
  Kinetic, and a video driven by data, such as a chart from a query or a file,
  captions from a transcript, counters, lists, many entities, or one page
  rendered once per row of variables. Also use it for kinetic typography
  written as WildflowerJS scenes, with music and sound in the file, and for
  an interactive lesson whose steps wait for the learner and that is also
  its own video, with the learner's moves scripted. Use it for plain
  motion graphics too: a title, a showreel or a sting, written as a page.
---

# Kinetic

Kinetic (`@wildflowerjs/kinetic`, used in code as `wildflower.kinetic`)
turns a WildflowerJS page into a video, where every value is a function of
time, previewed, checked and rendered in the browser. A scene is a component
whose values are functions of the time. The renderer seeks to a time and the
scene's computed values give the values for it. There is no timeline to
register. The page previews in a plain browser tab and renders through
`wildflower.kinetic.render()` in the browser, with its `<video>` footage and
the sound of its `<audio>` clips. For many videos from one page,
`scripts/batch.cjs` renders it once per row of a file; the same page also
renders through HyperFrames with its runtime tag added, see step 8.

The same scenes run in two modes. Video mode is the video above. Interactive mode
is a lesson on the page: each step is a clip with an `id` and `data-step`,
it plays and then waits for the learner (`wait`, `until`, `next()`), and the
learner's controls write the store fields that each step's `script` writes
in the video (Interactive mode in `references/api.md` and `references/rules.md`).

Settle the intake before you read the rest. Step 1 of the procedure needs only
`references/craft.md` and the kind's file. Once the questions are answered,
read `references/start.md`: one complete video page and one complete
interactive lesson page, each copy-runnable, with the rules that matter for
each. Start from the one that fits the brief. Then read
`references/rules.md` before writing a scene, `references/api.md` for the
names and options, and copy shapes from `references/patterns.md` (each of
the last two opens with a list of its sections).

A Kinetic page is a WildflowerJS page: a scene is a component, and every
attribute and API of the framework works in it. For anything about
WildflowerJS itself (whether an attribute such as `data-bind-html` exists,
what a checkbox's `data-model` writes, whether one element can be a step
and a scene), read the framework's own reference,
https://www.wildflowerjs.com/llms.txt, rather than guessing.

## The page

Load three scripts in this order, then add the composition root, then the
scenes.

```html
<script defer src="https://cdn.jsdelivr.net/npm/wildflowerjs@^1.5.5/dist/wildflower.lite.dev.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/kinetic@0.1/dist/kinetic.wf.js" data-preview></script>
<script defer src="scenes.js"></script>
<style>[data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }</style>

<div data-composition-id="main" data-start="0" data-duration="6"
     data-width="1280" data-height="720" data-fps="30">
    <div class="card" data-component="title-card" data-start="0.4" data-duration="5">
        <h1 data-bind-style="heading">Launch</h1>
    </div>
</div>
```

```javascript
wildflower.kinetic.config({ shutter: 180, finish: { grain: 0.08 } });   // motion blur in every render, and the default style's light, still grain

wildflower.kinetic.scene('title-card', {
    keyframes: {
        heading: {
            opacity:    { at: [0, 0.5], to: [0, 1] },
            translateY: { at: [0, 0.6], to: [40, 0], ease: 'spring' }
        }
    }
});
```

`data-preview` adds the preview bar and fits the stage to the window, and
Kinetic gives the root its `data-width` and `data-height`, so the page needs
no CSS for any of the three. The one rule in `<style>` is Kinetic's cloak:
it hides the stage until Kinetic is ready (fonts, media decoded, effects
drawn, the first seek landed), later than WildflowerJS's `[data-cloak]`,
which lifts when the components initialize, and with `visibility`, which
keeps the layout Kinetic measures, where `[data-cloak]` uses `display: none`.
Keep it in the page: Kinetic's script is deferred, and the stage would flash
before it runs.

A page with Trillium adds its script after Kinetic's, an import map for
three.js, and the scenes as a module, which runs after the deferred scripts:

```html
<script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/three@0.2/dist/three.wf.js"></script>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js" } }</script>
<script type="module" src="scenes.js"></script>
```

A diagram whose layout is the hard part (a Sankey with many flows, a
flowchart, a state diagram, a timeline) is written as Mermaid text and laid
out by pele, a Mermaid renderer with no dependencies (MIT), loaded before
the scenes at this exact version and hash, so a page lays out the same next
month; Kinetic animates what pele places
(`references/patterns.md`, "A Sankey laid out by pele" and "A flowchart
laid out by pele"):

```html
<script defer src="https://cdn.jsdelivr.net/npm/pele@1.12.0/dist/pele.global.js" integrity="sha384-c+QpxCAcAD72seekPP6lAUNHjqe/wUv+S2pk2yBo4ECNKMxym7WFtKKoR5xMtyhz" crossorigin="anonymous"></script>
```

The lite tier covers most pages. A page that reads data through
`wildflower.query` loads the full tier, `wildflower.full.dev.js` while it is
made. There is one page, made and finished in place. While it is being made,
load the development builds, the framework's (`wildflower.lite.dev.js` or
`wildflower.full.dev.js`) and Kinetic's (`kinetic.wf.js`), from the CDN or
copies beside the page: they print the WF and KN warnings. To finish it,
swap those two script lines for the minified builds
(`wildflower.lite.min.js` or `wildflower.full.min.js`, and
`kinetic.wf.min.js`). A finished video page drops `data-preview`, since the
bar is for making it, and adds `fit: true` to its `config()` call, so the
stage still fits the window without the bar. A finished lesson has no bar either, and its last step
always offers a "Start again" button that calls `go(0)`, so the learner
never steps back through every step.

## Procedure

The message comes first, and everything else serves it. Part of every
message is that it was made with professional, clear, appropriate and
excellent design. Work in this order: what the piece must say, then each
frame as a still that says it, then motion. Read `references/craft.md`,
the principles every piece follows, before step 1.

1. Find what the piece is for. Ask the user, in one message, only what the
   brief leaves open and the answer would change (`references/craft.md`,
   "The intake"): the one thing the viewer should know or feel at the end,
   who watches and where, the length and whether it loops, the brand or the
   default style, and the material there is. Where no one can answer, choose,
   and write the choices down. When the brief leaves the choices to you,
   state them in one short message before building, and carry on unless
   told otherwise. Then name the kind of piece (`references/kinds/`:
   a data story, an explainer or lesson, a brand piece or showreel, a product
   demo, a title or social clip, or a mix of them) and read its file. Write
   the plan: the message, the audience and setting, the kind, and the list of
   scenes, each with the one thing it says, its hero, its visual idea (the
   image, metaphor or transformation that shows the thing rather than
   labels it; `references/craft.md`, "A visual idea"), its start and duration
   in seconds, and the data or voice track it reads, together with the
   composition's size and frame rate. Confirm the plan before writing the
   page. When the brief gives no style, or only part of one, read
   `references/style.md` along with the rules and take the rest of the look
   from it.
2. Design each scene's key frame as a still that stands on its own: the
   frame a viewer sees once everything is in, which must say the scene's one
   thing with nothing moving. Build the page with the scenes at their key
   frames first, save them with `--frames` (step 7), and judge each against
   `references/craft.md`, "Judging a frame", before adding any motion.
   Motion then serves what the still says: it shows change, order, cause or
   emphasis, and every frame holds long enough to read.
3. Write the page: the three scripts, the CSS rule that holds the stage until
   Kinetic marks it ready, the root with its attributes, one clip per scene,
   one `<audio src data-start>` per sound and one `<video src data-start>` per
   piece of footage inside the root.
4. Write one scene per clip. Keyframes go in `keyframes`. Anything else a frame
   needs is a computed that reads `this.local` or `this.time` and the
   helpers. `local` holds at 0 before the clip and at its duration after
   it, where the scene is hidden and costs nothing. Follow the motion habits in
   `references/rules.md`: an ease on every move, entrances that settle and
   exits that leave faster, offsets between layers, one `'smooth'` track
   through several points.
5. Data goes through `wildflower.query`, named in the scene's `waitFor`, on
   the full tier. Values that change from video to video are `inputs`, read
   from the composition's variables.
6. Open the page in Chrome with `?preview` on the URL, or `data-preview` on
   Kinetic's script tag, and scrub the bar at the bottom of the window. A
   lesson opens without either, to try it as the learner does; `?preview`
   plays it as the video.
7. Run this skill's `scripts/check.cjs` on the page:
   `node <this skill's folder>/scripts/check.cjs <page>`. It finds
   Playwright and the page's files itself. It waits for
   readiness, runs `wildflower.kinetic.check()` and prints every `[KN` line.
   Fix each line it prints, then run it again until the report is `ok: true`
   and no line prints. The run fails on a report that is not ok, on any `[KN`
   line, on an uncaught error or unhandled rejection at any time (`page
   error:`), and on a console error the framework or an extension printed
   (`[WildflowerJS]`, `[WF-238]`, `[TH-101]` and the like), even outside
   the seeks, where `check()`'s own report does not count them. Your own
   `console.error` lines are printed and do not fail it; read them too. An
   error that comes again from many seeks prints once, with its count
   (`× 37`). It runs in the installed Chrome (Playwright's
   Chromium without one) and prints which.

   `check()` cannot see a binding that shows nothing or a layer in the wrong
   place, since those are the same on every seek, so look at frames too:
   `--frames 0,2.5,5` saves a PNG of the stage at each time, and
   `--frames 12` twelve evenly spaced, into `frames/` beside the page
   (`--out <dir>` for another folder). Open the PNGs it prints and look at
   each one against the brief.

   After the check it times every block of text on screen and lists, under
   `reading:`, each one that leaves before it can be read, by the BBC
   subtitle rate (fully on screen for at least 1.5 s, and 0.5 s plus
   0.375 s a word, with 1 s more for a figure). Every frame has to stand on
   its own, so fix each block it lists, by holding it longer or cutting
   words, unless a word is meant to fly past. That is a floor: a calm piece
   holds about twice as long (`references/craft.md`, "Time"). The list does
   not fail the run. `--no-reading` skips it.

   For a lesson, add `--lesson`: it enters each step in interactive mode
   with `go()`, waits for its hold (the last frame before the step's wait,
   so 0.467 s for a wait of 0.5 at 30 fps) and saves a still of it, and reports
   whether each step held, the `until` path it waits on, and the console
   errors and KN lines during it. It answers no question and goes on to the
   next step, so a step that should wait for the learner and is not
   reported as waiting on its `until` is a step to fix. A step that never
   holds, a console error or a KN line fails it.
8. Render with the Render button on the bar (an MP4 in Chrome, with the
   audio clips' sound). The render has motion blur, since the scene file
   set `config({ shutter: 180 })`; a brief that asks for a crisp, stepped
   look sets `shutter: 0` instead. For many videos from one page, run the batch
   script, `scripts/batch.cjs` in the package (also at
   https://kinetic.wildflowerjs.com/scripts/batch.cjs), which renders the
   page once per row of a JSON or CSV file with the row's values as the
   composition's variables, in Chrome, with no flags-page setting:

   ```bash
   node batch.cjs index.html rows.json --out renders
   node batch.cjs index.html people.csv --name name
   ```

   rows.json is an array of objects, one per video, each field a variable's
   id with its value; a CSV has a header row of ids. Files are named
   `<composition id>-<row number>.mp4`, or by `--name field`. A row whose
   input fails (KN-130) stops the batch with the KN line and exit code 1.
   The page needs no runtime tag; rendering through HyperFrames instead
   (its runtime's tag after Kinetic's, `npx hyperframes render --batch
   rows.json`, parallel workers) is at
   https://kinetic.wildflowerjs.com/docs/hyperframes/.

## Rules that matter most

- When the brief says nothing about the look, follow `references/style.md`,
  the default style; anything the user asks for wins over it.
- Every frame is a function of the time. Nothing in a scene reads
  `Date.now()`, `performance.now()` or `Math.random()`, starts a timer, a
  `fetch()` or a `requestAnimationFrame()`, or uses a CSS transition.
  Randomness comes from `random(seed)`, `noise(x, seed)`, `noise2()`,
  `noise3()`, `stagger(i, n, { from: 'random', seed })`, `scramble(t, text,
  { seed })` and, for camera shake, `shake(t, profile, { seed })`.
- `styleAt(t, tracks)` gives the style object for time t from an object of
  tracks, and a key may be a plain number. One track's value is
  `interpolate(t, track)`: `interpolate(0.5, { at: [0, 1], to: [0, 10] })`
  is the number 5, for a computed that needs the number.
- Charts, simulations and particles have no Kinetic helper. Write them as
  data made at load and read from the time; `references/rules.md`, "What
  you write yourself", gives the approach for each.
- For moments inside a scene, keep the timing table a plain array of
  objects with `at` (and `end` where a row stops before the next), and read
  it with `moment(this.local, ROWS)`: the current row, the seconds since it
  started, its progress, the next row, and each row's state. Never write
  the lookup loop yourself.
- Measure a line of text with `textMetrics(text, font, options)`: its width,
  each letter's place (`letters: true`), and the size that fits a width
  (`width`). Never estimate a letter's place by counting characters, and
  measure with a web font from `@font-face`, which readiness waits for.
- To stagger, subtract `stagger()` from the time you pass to any helper
  (styleAt, ramp, interpolate); never a delay of your own arithmetic:
  `styleAt(this.local - stagger(i, n, options), tracks)`. `stagger()` starts
  from the first, the last, the center, the edges, a seeded order or an
  index, in a row or on a grid.
- Quote every text prop, one word or many: `data-prop-role="'Director'"`,
  `data-prop-color="'#892dbf'"`; numbers and booleans go bare.
- A render seeks to whole frames, `n / fps`. A landing, a flash or a cut goes
  on a frame, or it is never shown. Decide it with `this.clipFrame`, a whole
  number. A clip's edges go on frames too (KN-114): write an edge as
  `n / fps` to 8 decimals (`data-start="11.03333333"` for frame 331 at 30
  fps), and to put an edge on a beat, round the beat's time to its frame.
- The root carries `data-composition-id`, `data-start="0"`,
  `data-duration`, `data-width`, and `data-height`.
- Put the composition inside no component of your own. A binding on a
  scene's own root tag then reads the scene; inside a component it reads that
  component (WF-521 from a development WildflowerJS; KN-154 for Kinetic's own
  values in a scene inside a scene). Style the root with `root: { style: { background: 'bg' } }`
  either way.
- A transition between two clips is their overlap: the incoming clip starts
  before the other ends (`data-start="intro - 0.5"`) and carries
  `data-clip-transition="push from-right"`. A clip that comes in over nothing, or
  leaves to nothing, takes `data-clip-enter` or `data-clip-exit` with a length.
  A clip's plain fade is `data-clip-enter="fade 0.5"` and
  `data-clip-exit="fade 0.5"`; `edges` and `presence` are for a scene whose
  code needs the value. For blur, grain, music, and fading, the "Which to
  use" tables in `references/rules.md` give the route and the default.
  A halftone, a luma wipe from an image or a dissolve is the same attribute
  with `halftone from-left 24px`, `luma url(maps/burn.png) soft` or
  `dissolve 3px`, never an SVG filter of your own on the clip.
- A halftone, stipple, dither or duotone look on an image, footage or a
  canvas is `effect(canvas, { scene: this, source, kind })` from a scene's `init()`, with
  `this.fx.set({ ... })` in `seek(local)` for parameters that move. HTML is
  no source; for still HTML, use an SVG filter with the patterns' two rules.
- Every layer made in a scene takes `scene: this` (`effect()`, `shade()`,
  `blur()`, `text()`, `lottie()`): it then runs on the scene's local time
  and is disposed with the scene. Without it, it runs on composition time
  until you call `dispose()`.
- A Lottie animation is lottie-web's `loadAnimation({ autoplay: false })`
  kept as `this.anim` and handed to `lottie(this.anim, { scene: this, start })` in the
  same task of a scene's `init()`, with `this.anim.destroy()` in the
  scene's `destroy()`, never played or seeked by the scene itself; the page
  loads lottie-web. An animated GIF,
  WebP or APNG is `animatedImage(src)` at the top of the file, drawn with
  `draw(canvas, local)` in `seek(local)`, never an `<img>` in a render (it
  plays on the browser's clock).
- The clock is the store `kinetic`: `$kinetic.time` in a binding,
  `this.stores.kinetic` in a scene or a component that subscribes to it,
  and `wildflower.getStore('kinetic')` from a script.
- Pools in scenes are written in `seek(local)` with `update(key, props)`,
  `key` being the entity's value of the field the container's `data-key`
  names; every seek flushes them before the frame is captured.
- Sound is an `<audio src data-start>` clip in the root, never audio a scene
  plays itself. Visuals that follow it read `level(this.time, band)` or
  `spectrum(this.time, bins)`.
- Footage is a `<video src data-start>` clip in the root with `muted` for the
  picture alone or `data-has-audio="true"` for its sound too, and never
  `autoplay`, `controls` or `loop`. Kinetic seeks and plays it; a scene never
  sets its `currentTime` or calls its `play()`.
- Numbers are formatted with `format()`, never `toLocaleString()` with no
  locale.
- A camera move binds `camera(this.local, tracks)` with `data-bind-style` on
  a world element inside the scene, and each layer in the world binds
  `depth(z)`. A wrapper between the world and a layer needs
  `transform-style: preserve-3d`, and a fade goes on the layer itself: a
  wrapper with `opacity` below 1, a `filter`, `overflow`, `clip-path`, a mask,
  a blend mode or `isolation` draws its layers flat. The world itself takes
  none of these and no background; the backdrop goes on the scene's root or
  the farthest layer, and a crop on the scene's root or the stage.
- The shutter is on: the scene file's first line is
  `wildflower.kinetic.config({ shutter: 180 })`, so every render, the bar's
  Render button's and the batch script's, averages eight seeks over half of
  each frame and fast moves blur as a camera's would. It costs about 8
  times the render time; only a brief that asks for a crisp, stepped look
  sets `shutter: 0`. With the
  HyperFrames runtime's tag on the page `render()` does not apply the
  shutter (KN-205,
  https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page), so leave
  that tag off for a render with motion blur. For blur in the preview too, `smear(this.local, tracks)`
  gives rows of copies for a `data-list` whose element has
  `isolation: isolate`; without it the copies brighten the scene behind
  them. In a render with a shutter, `smear()` gives one copy.
- In a lesson, one store field holds each value the learner and the video
  both change: the control binds it with `data-model`, the step's `script`
  writes it by the same path, and a scene reads it or eases it with
  `follow`. A step that explains a change is a task the learner does, with
  `until` waiting for it. Once `until` is true the rest of the step plays
  and the step holds on its last frame, so a question holds before its
  explanation (`wait` earlier than the step's end) and the explanation plays
  after the right answer. Kinetic never moves to the next step by itself:
  the learner does, with Next. Bind Next to `$kinetic.canAdvance`: it is
  false while the step's `until` is false, and true otherwise, at any point
  in the step, not only at the hold. Pressed anywhere in the step, Next enters the next step at once and
  leaves the rest of the step to the video. A step with nothing to answer
  needs no `wait`: it plays its range and holds on the last frame. Back is
  always there. At a hold the clock stands still, so `local` does too, and what the
  learner changes moves only through `follow` springs or bindings to state.
  Controls that write a scripted path, and quiz buttons, are disabled in
  video mode (`data-bind-attr="{ disabled: $kinetic.mode === 'video' }"`).
  Interactive-only effects go in action handlers, a step's
  `entry` or the `kinetic:step` event, and a store with scripted paths has
  no `autoSave`. A lesson page carries no HyperFrames runtime tag, which
  would hold it in video mode.

The full list, with the reason for each, is `references/rules.md`.

## Diagnostics

Codes start with `KN`. KN-100 (a wrong argument), KN-120 (a malformed track),
KN-121 (an unknown ease), KN-200, KN-201, KN-203 (what `render()` is missing),
KN-204 (media from another origin, which a render draws black, or an
`effect()` source WebGL cannot read) and KN-206
(a runtime's player whose frames miss the render's) are thrown on every build. KN-130 (a bad input), KN-131 (a failed query),
KN-133 (a `waitFor` name that matches no query) and KN-135 (an audio file
that fails to load or decode) are printed on every build; `render()` rejects
with the error before drawing a frame, and a HyperFrames render waits at
its readiness timeout. KN-138 (a footage file that fails to load or
decode, or a `<video>` clip with no source) is printed on every build and
rejects `ready()` and `render()`, except under the HyperFrames runtime,
which loads footage itself. KN-117 (a `luma`
transition's map that fails to load or decode), KN-180 (a Lottie animation
that fires `data_failed`) and KN-181 (an animated image that cannot be
fetched or decoded) are printed on every build and reject `ready()` and
`render()` the same way, and so does KN-100 for a step script's path whose
store does not exist or that names a computed. Every other code is a
development-only warning, with a suggestion on the line under it. The
warnings for a call give the line of the page's code that made it. Each code
has an entry at https://www.wildflowerjs.com/docs/error-codes.
