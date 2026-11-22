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
time, previewed, checked and rendered in the browser. A piece is written as
layers: each layer picks an element on the page and lists the tracks that
move it, the way a motion designer fills in a timeline's fields.
`wildflower.kinetic.layers.scene(name, { layers: [...] })` makes the scene
that draws them; when the renderer seeks to a time, every value is worked
out for that time from the layers. The page's HTML and CSS set what is on
screen at rest, and the layers say how it changes. The page previews in a plain browser tab and renders through
`wildflower.kinetic.render()` in the browser, with its `<video>` footage and
the sound of its `<audio>` clips. For many videos from one page,
`render.batch()` renders it once per row of a file, see step 8.

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
`references/rules.md` before writing layers, `references/api.md` for
every field of a layer (its first part) and the helpers underneath, and
copy shapes from `references/patterns.md` (each of the last two opens with
a list of its sections).

What a layer's fields cannot say, such as a model's numbers or a shape's
geometry, goes in a small pure function handed over in `fns` and called by
name. Write a whole scene in code (`scene()` with `computed` and `seek()`)
only for a picture no layer can describe; reach for it last.

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
<script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/kinetic@0.3/dist/kinetic.wf.js" data-preview></script>
<script defer src="title.js"></script>
<style>[data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }</style>

<div data-composition-id="main" data-start="0" data-duration="6"
     data-width="1280" data-height="720" data-fps="30">
    <div class="card" data-component="title-card" data-start="0.4" data-duration="5">
        <h1>Launch</h1>
    </div>
</div>
```

```javascript
wildflower.kinetic.layers.scene('title-card', {
    id: 'title-card', size: [1280, 720], duration: 5,
    shutter: 180, finish: { grain: 0.08 },   // motion blur in every render, and the default style's light, still grain
    layers: [{
        id: 'heading', kind: 'html', src: '.card h1',
        place: { translate: [0, { at: [0, 0.6], to: [40, 0], ease: 'spring' }] },
        look: { opacity: { at: [0, 0.5], to: [0, 1] } },
    }],
});
```

The layers' times count in seconds from the clip's start (here 0.4 s into
the composition).

`data-preview` adds the preview bar and fits the stage to the window, and
Kinetic gives the root its `data-width` and `data-height`, so the page needs
no CSS for any of the three. The one rule in `<style>` is Kinetic's cloak.
It hides the stage until Kinetic is ready (fonts, media decoded, effects
drawn, the first seek landed), which is later than WildflowerJS's
`[data-cloak]` lifts (when the components initialize). It uses
`visibility`, which keeps the layout Kinetic measures, where `[data-cloak]`
uses `display: none`. Keep it in the page: Kinetic's script is deferred, so
without the rule the stage flashes before the script runs.

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
the scenes at this exact version and hash, so the layout does not change
when pele does. Kinetic animates what pele places
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
stage still fits the window without the bar. A finished lesson has no bar
either, and its last step always offers a "Start again" button that calls
`go(0)`, so the learner does not have to step back through every step.

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
   from it. A showreel, a brand film, a sting or a title at the lively or
   bold end of the expression dial reads `references/directions.md` instead
   and takes its look and motion from one direction there, named in the
   plan.
2. Design each scene's key frame as a still that stands on its own: the
   frame a viewer sees once everything is in, which must say the scene's one
   thing with nothing moving. Build the page with the scenes at their key
   frames first, take them with `check({ frames })` (step 7), and judge each against
   `references/craft.md`, "Judging a frame", before adding any motion.
   Motion then serves what the still says: it shows change, order, cause or
   emphasis, and every frame holds long enough to read.
3. Write the page: the three scripts, the CSS rule that holds the stage until
   Kinetic marks it ready, the root with its attributes, one clip per scene,
   one `<audio src data-start>` per sound and one `<video src data-start>` per
   piece of footage inside the root. The HTML and CSS lay out every element
   as it stands at rest; give each element a layer will move a class or an
   id for its `src` to select.
4. Write each clip's layers with `layers.scene()`, under the name the
   clip's `data-component` gives. Each element that moves is a layer: its
   `src`, then `place` (where it is), `look` (how it looks) and `content`
   (what it shows). Each field is a value, and a value that moves is a track
   (`{ at, to, ease }`, or `{ keys, by, ease }` for several keys or one
   driven by another value). Times count from the clip's start. What the
   fields cannot say goes in a small pure function in `fns`, called with
   `{ call, args }`. Follow the motion habits in `references/rules.md`: an
   ease on every move, entrances that settle and exits that leave faster,
   offsets between layers, one `'smooth'` track through several points.
5. Data goes through `wildflower.query`, on the full tier. List each query
   the layers read in `queries`, so the first frame waits for the rows. A
   repeat places a comp once per row (`repeat: { over: 'sales.rows' }`), and
   each copy reads its row's fields as parameters. Values that change from
   video to video go in `inputs`, read with `{ from: 'inputs.title' }` from
   the composition's variables.
6. Open the page in Chrome with `?preview` on the URL, or `data-preview` on
   Kinetic's script tag, and scrub the bar at the bottom of the window. A
   lesson opens without either, to try it as the learner does; `?preview`
   plays it as the video.
7. Check the page in the page itself. With a browser you can drive, open
   the page (served over http when it fetches files) and run this in it:

   ```js
   const r = await wildflower.kinetic.check({ reading: true, layout: true, frames: 6 });
   ```

   It loads `kinetic.tools.js` from beside Kinetic's file (KN-103 when it
   cannot). Fix what it reports and run it again until `r.ok` is true and
   `r.console`, the KN lines and errors printed during the run (each once,
   with its `count`), is empty. Read the page's console from load too: a
   KN line or a `[WildflowerJS]`, `[WF-238]` or `[TH-101]` error printed
   before the check is not in `r.console`, and it needs fixing as well.

   `check()` cannot see a binding that shows nothing or a layer in the wrong
   place, since those are the same on every seek, so look at the frames:
   `r.images` is `[{ t, frame, png }]`, each `png` a Blob of the frame as a
   render draws it. Open one with `open(URL.createObjectURL(r.images[2].png))`
   and take a screenshot of that tab, and look at each against the brief.
   `frames: [0, 2.5, 5]` takes those seconds instead. Where the browser has
   no HTML-in-Canvas, `r.skipped` lists the frames with KN-201; then seek
   with `wildflower.kinetic.seek(t)` and screenshot the page instead.

   `r.reading.short` lists each block of text that leaves before it can be
   read (`{ text, words, held, from, needs }`), by the BBC subtitle rate
   (fully on screen for at least 1.5 s, and 0.5 s plus 0.375 s a word, with
   1 s more for a figure). Every frame has to stand on its own, so fix each
   block it lists, by holding it longer or cutting words, unless a word is
   meant to fly past. That rate is the minimum, and a calm piece holds about
   twice as long (`references/craft.md`, "Time").

   `r.layout.found` lists text outside the safe area while at rest
   (`'safe'`), cut off at the frame's edge (`'cut'`), over other text
   (`'over'`), and under its contrast floor (`'contrast'`, 4.5:1, 3:1 at
   48 px and up), measured against what is actually behind it. Fix each,
   unless it's on purpose (a grayed hint, a phone mockup that bleeds off the
   frame). Neither list fails the check.

   More options, as the piece needs them:
   - `pace: 'lively'` or `'bold'` measures how much of the piece is still,
     how often it snaps, its longest hold and its range of brightness against
     the dial in `references/directions.md`; `r.pace.misses` lists each
     miss. Fix each, or say in the plan why it is right, before rendering.
   - `seam: true`, for a loop, compares the last frame with frame 0
     (`r.seam.jump`). `jumps: true` lists every pair of frames that changes
     far more than the frames around it (a pop, or a cut). `isolate:
     ['#bleed', '#rims']` hides each selector in turn over the worst pair
     (or the pair `diff: [16, 17]` gives) and reports how much of the change
     each takes away. `strip: true` with `frames` tiles them into one PNG.
   - `lesson: true` enters each step in interactive mode with `go()`, waits
     for its hold (the last frame before the step's wait, so 0.467 s for a
     wait of 0.5 at 30 fps), and reports in `r.lesson.steps` whether each
     held, whether it waits on its `until`, a still of the hold, and the
     lines printed during it. It answers no question and goes on, so a step
     that should wait for the learner and is not reported as waiting is a
     step to fix. A step that never holds, a console error or a KN line makes
     `r.ok` false.

   With no browser you can drive, ask the user to open the page in Chrome
   with `?preview`, paste the `check()` line above into the console
   (Cmd-Option-J on a Mac, Ctrl-Shift-J on Windows), and paste back the
   report and every `[KN` line the console shows, or at least press Check on
   the preview bar and paste what it says. Ask them to describe or screenshot
   the frames you need to see.
8. Render with the Render button on the bar (an MP4 in Chrome, with the
   audio clips' sound). The render has motion blur, since the scene sets
   `shutter: 180`; a brief that asks for a crisp, stepped look sets
   `shutter: 0` instead. For many videos from one page, write the rows as
   a JSON file (an array of objects, one per video, each field a variable's
   id with its value) or a CSV with a header row of ids, and have the user
   press Render batch on the bar (shown when the composition declares
   variables): it asks for the file, then for a folder (a second click on
   Choose folder when the file chooser used up the first), and writes one
   MP4 per row. In code it is `wildflower.kinetic.render.batch(rows, {
   name: 'title' })`, rows an array or a File; from a click the files go
   into a folder, otherwise each downloads (Chrome asks once about several
   downloads), and `save: false` returns the Blobs. Files are named
   `<composition id>-<row number>.mp4`, or by the `name` field. A row whose
   input fails (KN-130) stops the batch with that row's error. Leave the
   HyperFrames runtime's tag off the page: rows do not reach it.

## Rules that matter most

- When the brief says nothing about the look, follow `references/style.md`,
  the default style; anything the user asks for wins over it. A lively or
  bold piece (a showreel, a sting, an opener) follows one direction from
  `references/directions.md` in its place.
- Every frame is a function of the time. Nothing in the layers or their `fns`
  reads `Date.now()`, `performance.now()` or `Math.random()`, starts a
  timer, a `fetch()` or a `requestAnimationFrame()`, and nothing on the page
  moves by a CSS transition or animation. Randomness comes from seeds:
  `{ wiggle: { seed } }`, `{ stagger: { from: 'random', seed } }`, a
  scramble's `seed`, and `random(seed)` or `noise(x, seed)` inside a
  function.
- The layers say what moves and when; the HTML and CSS say where it sits at
  rest. A layer's `src` is a selector searched in the scene's clip first,
  then the whole composition, so select each element precisely (an id, or a
  class inside its clip's id).
- A track is `{ at: [times], to: [values], ease }`, or `{ keys: [[x, v],
  ...], by, ease }` when its input is not the time (a store's value, a
  sweep's weight, the music's level). Name a time or a value once in
  `constants` or `shared` and read it by name; markers and beats read by
  name too (`'hit1'`, `'beat 4'`).
- A row of things is one comp repeated: `repeat: { over: rows }` or
  `{ count }`, each copy reading `i`, `n` and its row's fields. To stagger
  them, start each copy later with `start: { stagger: { each: 0.08 } }`, or
  delay several elements one `src` finds with `delay: { stagger: {...} }`;
  never a delay of your own arithmetic. A text layer splits into letters
  or words with `split` and staggers them with `animate.each`.
- Charts, simulations and particles have no layer field of their own. Write the model
  as small pure functions of the time and the data, handed in `fns`, and
  read them with `{ call }`; `references/rules.md`, "What you write
  yourself", gives the approach for each.
- Measure a line of text with `textMetrics(text, font, options)` inside a
  function: its width, each letter's place (`letters: true`), and the size
  that fits a width (`width`). Never estimate a letter's place by counting
  characters, and measure with a web font from `@font-face`, which
  readiness waits for.
- Quote every text prop, one word or many: `data-prop-role="'Director'"`,
  `data-prop-color="'#892dbf'"`; numbers and booleans go bare.
- A render seeks to whole frames, `n / fps`. A landing, a flash or a cut goes
  on a frame, or it is never shown: `snap: 'frame'` in `layers.scene()` puts every
  marker and beat on its nearest frame. A clip's edges go on frames too (KN-114): write an edge as
  `n / fps` to 8 decimals (`data-start="11.03333333"` for frame 331 at 30
  fps), and to put an edge on a beat, round the beat's time to its frame.
- The root carries `data-composition-id`, `data-start="0"`,
  `data-duration`, `data-width`, and `data-height`.
- Put the composition inside no component of your own, and no scene's clip
  inside another's (KN-154 for Kinetic's own values in a scene inside a
  scene). The page's own components (a lesson's band, its question) sit
  beside the clips, inside the root.
- A transition between two clips is their overlap: the incoming clip starts
  before the other ends (`data-start="intro - 0.5"`) and carries
  `data-clip-transition="push from-right"`. A clip that comes in over nothing, or
  leaves to nothing, takes `data-clip-enter` or `data-clip-exit` with a length.
  A clip's plain fade is `data-clip-enter="fade 0.5"` and
  `data-clip-exit="fade 0.5"`. For blur, grain, music, and fading, the
  "Which to use" tables in `references/rules.md` give the route and the
  default. A halftone, a luma wipe from an image or a dissolve is the same
  attribute with `halftone from-left 24px`, `luma url(maps/burn.png) soft`
  or `dissolve 3px`, never an SVG filter of your own on the clip.
- A halftone, stipple, dither or duotone look on an image, footage or a
  canvas is a layer on a `<canvas>` with `look.effect: { kind, source, ...
  }`, its parameters values that may move. Shading, light and grain marks
  are `look.shade`, a masked blur `look.backdrop`, a hand-drawn sheet
  `look.draw`, line boil on an SVG path `look.boil`. HTML is no source; for
  still HTML, use an SVG filter with the patterns' two rules.
- A Lottie animation is a `kind: 'lottie'` layer with `content: { path,
  start, rate, loop }`; the page loads lottie-web before Kinetic draws it.
  An animated GIF, WebP or APNG is `animatedImage(src)` drawn on a canvas
  from a scene in code (`references/api.md`), never an `<img>` in a render
  (it plays on the browser's clock).
- The clock is the store `kinetic`: `$kinetic.time` in a binding,
  `this.stores.kinetic` in a component that subscribes to it, and
  `wildflower.getStore('kinetic')` from a script.
- Sound is an `<audio src data-start>` clip in the root, never audio the
  page plays itself. Visuals that follow it read `{ level: 'bass' }` (or
  `'mid'`, `'treble'`, `'all'`), `{ spectrum: {} }` (a copy's bin) or
  `{ beat: { beats } }`, as a value or as a track's `by`.
- Footage is a `<video src data-start>` clip in the root with `muted` for the
  picture alone or `data-has-audio="true"` for its sound too, and never
  `autoplay`, `controls` or `loop`. Kinetic seeks and plays it; nothing on
  the page sets its `currentTime` or calls its `play()`.
- Numbers are formatted with `format()` inside a function, never
  `toLocaleString()` with no locale.
- A camera move is a `kind: 'camera'` layer with `moves` (Kinetic's
  `moves()` list); the layers it looks at take `band: 'world'` and a
  `place.position` of `[x, y, z]`, and the camera moves the composition's
  `.world` element. A wrapper between the world and a layer needs
  `transform-style: preserve-3d`, and a fade goes on the layer itself: a
  wrapper with `opacity` below 1, a `filter`, `overflow`, `clip-path`, a mask,
  a blend mode or `isolation` draws its layers flat. The world itself takes
  none of these and no background; the backdrop goes on the clip or the
  farthest layer, and a crop on the clip or the stage.
- The shutter is on: the scene sets `shutter: 180`, so every render, the
  bar's Render button's and each of `render.batch()`'s, averages eight seeks over
  half of each frame and fast moves blur as a camera's would. It costs about
  8 times the render time; only a brief that asks for a crisp, stepped look
  says `shutter: 0`. With the HyperFrames runtime's tag on the page
  `render()` does not apply the shutter (KN-205,
  https://kinetic.wildflowerjs.com/docs/hyperframes/#on-the-page), so leave
  that tag off for a render with motion blur. For blur in the preview too,
  `look.smear` draws a layer's own motion as copies beside it; put it in an
  element with `isolation: isolate`, or the copies brighten the scene
  behind them.
- In a lesson, one store field holds each value the learner and the video
  both change: the control binds it with `data-model`, the step's `script`
  writes it by the same path, and a layer reads it with a link
  (`{ from: 'dial.angle' }`) or eases toward it with `{ follow:
  'dial.angle' }`, with the store listed in `stores`. `steps` in
  `layers.scene()` holds each step's `wait`, `until`, `entry` and `script`. A step that explains a change is a task the learner does, with
  `until` waiting for it. Once `until` is true the rest of the step plays
  and the step holds on its last frame, so a question holds before its
  explanation (`wait` earlier than the step's end) and the explanation plays
  after the right answer. Kinetic never moves to the next step by itself:
  the learner does, with Next. Bind Next to `$kinetic.canAdvance`: it is
  false while the step's `until` is false, and true otherwise, at any point
  in the step, not only at the hold. Pressed anywhere in the step, Next
  enters the next step at once, and the rest of the step is not played. A step with nothing to answer
  needs no `wait`: it plays its range and holds on the last frame. Back is
  always there. At a hold the clock stands still, so tracks on the time do
  too, and what the learner changes moves only through followers, links to
  the store, or bindings to state.
  Controls that write a scripted path, and quiz buttons, are disabled in
  video mode (`data-bind-attr="{ disabled: $kinetic.mode === 'video' }"`).
  Interactive-only effects go in action handlers, a step's
  `entry` or the `kinetic:step` event, and a store with scripted paths has
  no `autoSave`. A lesson page carries no HyperFrames runtime tag, which
  would hold it in video mode.

The full list, with the reason for each, is `references/rules.md`.

## Diagnostics

Codes start with `KN`. The errors in layers are KN-161 to KN-169, thrown by
`layers.scene()` or at the frame that first reads the field, each giving
the layer and the field: KN-161 (the layers object's shape), KN-162 (a
key a layer does not take), KN-163 (a name nothing defines), KN-164 (a link
to nothing), KN-165 (a value of no known form), KN-166 (a function not
handed over in `fns`), KN-167 (an order or band), KN-168 (a `src` that finds
no element) and KN-169 (names that lead back to themselves).
KN-100 (a wrong argument), KN-120 (a malformed track),
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
