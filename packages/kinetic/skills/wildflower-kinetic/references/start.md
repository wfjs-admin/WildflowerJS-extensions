# Start here

Two complete pages, each copy-runnable as it stands: a video, and an
interactive lesson that is also its own video. Start from the one that fits
the brief, keep its shape, and change its content. Each is followed by the
rules that matter most for it; `rules.md` has the rest, `api.md` the names
and options, and `patterns.md` one idea at a time.

Both pages load the framework, then Kinetic, then the page's own script,
all deferred. Serve the folder over http (`npx serve`, or any static
server): a page opened from disk previews, but cannot fetch files beside it.

Each is one page, made and finished in place. Both load the development
builds (`wildflower.lite.dev.js`, or `wildflower.full.dev.js` for queries,
and `kinetic.wf.js`), which print the WF and KN warnings. To finish a page,
swap those two script lines for the minified builds
(`wildflower.lite.min.js` or `wildflower.full.min.js`, and
`kinetic.wf.min.js`).

Both are in the default style (`style.md`), for a brief that says nothing
about the look: warm paper, ink, Work Sans, the house palette, and a light
finish. When the brief gives a look, it wins; keep the Kinetic in the pages
and change the colors, the type and the finish.

## A video

A title card on paper: a lavender disc rises, the heading fades in and
springs up under it, the letters of a line come in one after another, and
the card pushes to an end card in the accent.

File `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Launch</title>
    <link href="https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,100..900;1,100..900&display=block" rel="stylesheet">
    <script defer src="https://cdn.jsdelivr.net/npm/wildflowerjs@^1.5.5/dist/wildflower.lite.dev.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/kinetic@0.1/dist/kinetic.wf.js" data-preview></script>
    <script defer src="scenes.js"></script>
    <style>
        html, body { margin: 0; background: #efe8db; }
        [data-composition-id] {
            position: relative;
            overflow: hidden;
            background: #efe8db;
            color: #26282d;
            font-family: 'Work Sans', sans-serif;
        }
        [data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }
        .card {
            position: absolute;
            inset: 0;
            box-sizing: border-box;
            padding: 64px;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
        }
        .card h1 { margin: 0; font-size: 168px; font-weight: 850; line-height: 0.9; letter-spacing: -0.04em; }
        .sun {
            position: absolute;
            right: 112px;
            top: 88px;
            width: 300px;
            height: 300px;
            border-radius: 50%;
            background: #B1A8FF;
        }
        .line { margin: 28px 0 0; font-size: 36px; font-weight: 500; line-height: 1.3; }
        .line span { display: inline-block; white-space: pre; }
        .end { background: #B1A8FF; }
    </style>
</head>
<body>
    <div data-composition-id="launch" data-start="0" data-duration="6"
         data-width="1280" data-height="720" data-fps="30">
        <div id="title" class="card" data-component="title-card" data-start="0" data-duration="3.6">
            <div class="sun" data-bind-style="sun"></div>
            <h1 data-bind-style="heading">Launch</h1>
            <p class="line" data-list="letters" data-key="key">
                <template><span data-bind="text" data-bind-style="style"></span></template>
            </p>
        </div>
        <div class="card end" data-start="title - 0.6" data-duration="3"
             data-clip-transition="push from-right power3.inOut">
            <h1>Out now</h1>
        </div>
    </div>
</body>
</html>
```

File `scenes.js`:

```javascript
wildflower.kinetic.config({ shutter: 180, finish: { grain: 0.08 } });   // the light finish: motion blur and the paper's still grain
const { scene, split, styleAt, stagger } = wildflower.kinetic;

// How each letter of the line comes in: a fade, and a spring up from 24 px below.
const RISE = {
    opacity:    { at: [0, 0.35], to: [0, 1] },
    translateY: { at: [0, 0.6],  to: [24, 0], ease: 'spring' },
};

scene('title-card', {
    keyframes: {
        // The disc rises first, then the heading under it.
        sun: {
            opacity:    { at: [0, 0.4], to: [0, 1] },
            scale:      { at: [0, 0.8], to: [0.6, 1], ease: 'spring' },
            translateY: { at: [0, 0.8], to: [120, 0], ease: 'spring' },
        },
        heading: {
            opacity:    { at: [0.3, 0.8], to: [0, 1] },
            translateY: { at: [0.3, 0.9], to: [40, 0], ease: 'spring' },
        },
    },
    computed: {
        letters() {
            const rows = split('A new way to make video');
            return rows.map((r) => ({
                key: r.key,
                text: r.text,
                style: r.space ? {} : styleAt(this.local - 0.9 - stagger(r.i, rows.length, { each: 0.04 }), RISE),
            }));
        },
    },
});
```

`data-preview` adds the preview bar (play, scrub, Check, Render) and fits the
stage to the window. Before rendering, run the self-test in the console:

```javascript
await wildflower.kinetic.ready();
await wildflower.kinetic.check({ samples: 30 });   // { ok: true, ... }
const { blob } = await wildflower.kinetic.render();  // launch.mp4, downloaded
```

The rules that matter here:

- Every value on screen is a function of the time. A scene reads
  `this.local` (seconds since its clip started) or `keyframes`, never a
  timer, `Date.now()`, `Math.random()` (use `random(seed)`), a CSS
  animation or a CSS transition.
- The root carries `data-composition-id`, `data-start="0"`,
  `data-duration`, `data-width`, `data-height` and `data-fps`. Kinetic gives
  the root its `data-width` and `data-height`, so the CSS does not repeat
  them.
- The `:not([data-kinetic-ready])` rule is Kinetic's cloak, and stays in
  the page: it hides the stage, keeping its layout, until Kinetic is ready
  (fonts, media decoded, effects drawn, the first seek landed).
- Work Sans loads with `display=block`, so neither the preview nor a render
  ever draws the fallback font; readiness waits for it.
- The text sits inside the safe area, 64 px in from every edge at 1280 by
  720 (the card's padding), aligned to its left edge. The accent is a fill
  (the disc, the end card), and the text on it stays ink.
- `config({ shutter: 180, finish: { grain: 0.08 } })` is the light finish:
  the shutter gives the render motion blur, and the grain, which holds
  still, gives the paper its tooth, on the page and in the file.
- A clip is an element with `data-start` and `data-duration`, shown only
  inside that window. `data-start="title - 0.6"` starts it 0.6 s before
  the clip `title` ends, and `data-clip-transition` makes that overlap a
  push, so the change of ground comes through a move. Kinetic writes the
  transition on the clip's own tag, so a scene styles the elements inside
  its clip, never the clip's tag.
- A `data-list` row's template has one root element. A letter row needs
  `display: inline-block` (a transform does nothing on an inline element)
  and `white-space: pre` (spaces have rows of their own).
- `check()` must report `ok: true` before a render; a render needs Chrome
  with HTML-in-Canvas (`api.md`, Control, readiness, self-test and
  rendering).
- The finished page drops `data-preview`, since the bar is for making the
  video, and loads the minified builds. Kinetic gives it the rest: a click
  on the stage pauses and plays it, and the loop holds the last frame 3 s
  before it starts again (`style.md`, "A finished video page").

## An interactive lesson

Three steps, in the layout every lesson uses (`style.md`, "Interactive
pieces"). Everything, the lesson and its controls, fits in one 1280 by 720
composition fitted to the page: each step's heading and a line of body at
the top left of the safe area, the step's choices or its own control under
them, the dial on the right, and a band along the bottom with the step and
its title, play, replay the step, and Back and Next.
On a phone held upright the page shows "Turn your phone sideways" over the
frame, outside the composition root, so no check or render sees it.
The first step holds while the learner turns the dial with a slider; the
second asks a question, holds for the answer, and then plays its
explanation; the third sums up and offers "Start again". Each step holds
at its end until the learner presses Next. The same page
plays straight through as a video, with the slider's moves and the answer
scripted, and in the video the band and the slider are not drawn, so their
space is empty paper.

File `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>A quarter turn</title>
    <link href="https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,100..900;1,100..900&display=block" rel="stylesheet">
    <script defer src="https://cdn.jsdelivr.net/npm/wildflowerjs@^1.5.5/dist/wildflower.lite.dev.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/kinetic@0.1/dist/kinetic.wf.js"></script>
    <script defer src="lesson.js"></script>
    <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; background: #e4dbca; color: #26282d; font-family: 'Work Sans', sans-serif; }
        /* The page: the stage as wide as the window, and no taller than it. */
        main { position: relative; width: min(100%, calc(100vh * 16 / 9)); margin: 0 auto; }
        /* On a phone held upright, a note over the frame, outside the root, so no check or render sees it. */
        .turn { display: none; }
        @media (orientation: portrait) and (max-width: 600px) {
            .turn { display: block; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0; padding: 10px 16px; border-radius: 10px; background: #26282d; color: #efe8db; font-size: 16px; font-weight: 600; white-space: nowrap; }
        }

        /* The stage: the whole lesson, its controls too. */
        [data-composition-id] { position: relative; overflow: hidden; background: #efe8db; }
        [data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }
        .layer { position: absolute; inset: 0; pointer-events: none; }

        /* The left column, from the safe area's top left. */
        .cap h2 { position: absolute; left: 64px; top: 64px; width: 560px; margin: 0; font-size: 44px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
        .cap p { position: absolute; left: 64px; top: 120px; width: 500px; margin: 0; font-size: 22px; font-weight: 500; line-height: 1.3; }
        .prompt { position: absolute; left: 64px; top: 196px; margin: 0; padding: 6px 12px; border-radius: 8px; background: #EFC187; font-size: 18px; font-weight: 600; }
        .choices { position: absolute; left: 64px; top: 252px; display: flex; flex-direction: column; gap: 8px; width: 220px; }
        .choices button { pointer-events: auto; padding: 10px 18px; border: 0; border-radius: 10px; background: #e4dbca; color: #26282d; font: 600 22px/1.2 'Work Sans', sans-serif; text-align: left; cursor: pointer; }
        .choices button:disabled { cursor: default; }
        .choices button.right { background: #B1A8FF; }
        .choices button.wrong { background: #EF9481; }
        .why, .cap p.reveal { position: absolute; left: 64px; top: 484px; width: 460px; margin: 0; font-size: 22px; font-weight: 600; line-height: 1.3; }
        .ctl { position: absolute; left: 64px; top: 252px; width: 360px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px; pointer-events: auto; font-size: 20px; font-weight: 600; }
        .ctl b { justify-self: start; padding: 2px 10px; border-radius: 8px; background: #B1A8FF; font-variant-numeric: tabular-nums; }
        .ctl input { grid-column: 1 / -1; width: 100%; }
        .tag { position: absolute; left: 0; top: 0; padding: 4px 10px; border-radius: 8px; background: #B1A8FF; font-size: 24px; font-weight: 700; white-space: pre; }

        /* The band along the bottom of the safe area. */
        .band { position: absolute; left: 64px; right: 64px; top: 600px; height: 56px; display: flex; align-items: center; gap: 32px; pointer-events: auto; }
        .where { width: 240px; }
        .count { font-size: 15px; font-weight: 600; color: #6e685f; }
        .title { margin-top: 2px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; white-space: nowrap; }
        .transport { flex: 1; display: flex; align-items: center; gap: 8px; }
        .nav { display: flex; gap: 8px; }
        .band button { padding: 10px 18px; border: 0; border-radius: 10px; background: #e4dbca; color: #26282d; font: 600 18px/1.2 'Work Sans', sans-serif; white-space: nowrap; cursor: pointer; }
        .band button.play { width: 96px; }
        .band button.go { background: #B1A8FF; }
        .band button:disabled { background: #e4dbca; color: #6e685f; cursor: default; }
        input[type="range"] { -webkit-appearance: none; appearance: none; height: 24px; margin: 0; background: transparent; cursor: pointer; }
        input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: #ddd3c2; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 50%; background: #26282d; }
        input[type="range"]::-moz-range-track { height: 6px; border-radius: 3px; background: #ddd3c2; }
        input[type="range"]::-moz-range-thumb { width: 20px; height: 20px; border: 0; border-radius: 50%; background: #26282d; }
    </style>
</head>
<body>
<main>
    <div data-composition-id="turn" data-start="0" data-duration="13"
         data-width="1280" data-height="720" data-fps="30">
        <!-- The dial, in the frame above the band. -->
        <div class="layer" data-component="dial" data-start="0" data-duration="13">
            <svg viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true">
                <circle cx="900" cy="320" r="170" fill="#e4dbca"></circle>
                <path fill="#B1A8FF" data-bind-attr="wedge"></path>
                <path d="M900 150V490M730 320H1070" stroke="#efe8db" stroke-width="6" data-bind-attr="quarters"></path>
                <path d="M1082 320h22M900 138v-22M718 320h-22M900 502v22" stroke="#6e685f" stroke-width="4" stroke-linecap="round"></path>
                <line x1="900" y1="320" stroke="#26282d" stroke-width="6" stroke-linecap="round" data-bind-attr="hand"></line>
                <circle cx="900" cy="320" r="8" fill="#26282d"></circle>
                <circle r="14" fill="#26282d" data-bind-attr="point"></circle>
            </svg>
            <span class="tag" data-bind="label" data-bind-style="labelAt"></span>
        </div>
        <section id="spin" class="layer cap" data-step data-start="0" data-duration="5">
            <h2>An angle measures a turn</h2>
            <p>The point starts at 0°, on the right, and turns anticlockwise.</p>
        </section>
        <section id="ask" class="layer cap" data-step data-start="spin" data-duration="5">
            <h2>Where is the top?</h2>
            <p>At what angle does the point sit at the top of the dial?</p>
        </section>
        <!-- The explanation: inside the question's step, after its hold at 6 s. -->
        <div class="layer cap" data-start="7" data-duration="3">
            <p class="reveal">90°: a quarter turn.</p>
        </div>
        <section id="recap" class="layer cap" data-step data-start="ask" data-duration="3">
            <h2>Each quarter turn adds 90°</h2>
            <p>Four quarter turns make a whole turn of 360°.</p>
        </section>
        <div class="layer" data-component="quiz" data-start="spin" data-duration="5">
            <div class="choices" data-list="choices" data-key="a">
                <template><button type="button" data-action="choose" data-bind="label" data-bind-class="cls" data-bind-attr="{ disabled: off }"></button></template>
            </div>
            <p class="why" data-show="why" data-bind="why"></p>
        </div>
        <!-- The learner's prompts: in interactive mode only, so never in the video. -->
        <div class="layer" data-component="prompt" data-start="0" data-duration="13">
            <p class="prompt" data-show="text" data-bind="text"></p>
        </div>
        <!-- The step's own control and the band: in interactive mode only, so the video keeps their space as empty paper. -->
        <div class="layer" data-component="controls" data-start="0" data-duration="13">
            <label class="ctl" data-show="turning">
                <span>Angle</span><b data-bind="angleText"></b>
                <input type="range" min="0" max="360" step="1" data-model="dial.angle" data-model-number>
            </label>
            <div class="band" data-show="$kinetic.mode === 'interactive'">
                <div class="where">
                    <div class="count" data-bind="countText"></div>
                    <div class="title" data-bind="title"></div>
                </div>
                <div class="transport">
                    <button type="button" class="play" data-action="toggle" data-bind="playLabel"></button>
                    <button type="button" data-action="replay">Replay step</button>
                </div>
                <div class="nav">
                    <button type="button" data-action="back" data-bind-attr="backAttrs">Back</button>
                    <button type="button" class="go" data-action="next" data-show="more" data-bind-attr="nextAttrs">Next</button>
                    <button type="button" class="go" data-action="again" data-show="last">Start again</button>
                </div>
            </div>
        </div>
    </div>
    <p class="turn">Turn your phone sideways</p>
</main>
</body>
</html>
```

File `lesson.js`:

```javascript
const { scene, step, ramp } = wildflower.kinetic;
// The stage scaled down to the window, and the light finish: motion blur and the paper's grain.
wildflower.kinetic.config({ fit: true, shutter: 180, finish: { grain: 0.08 } });

// The steps' titles, for the band.
const TITLES = { spin: 'Turning the dial', ask: 'The top of the dial', recap: 'Quarter turns' };
// Why each wrong answer is wrong, shown while the question waits.
const WHY = {
    0: 'Not quite: 0° is where the point starts, on the right. Try another.',
    180: 'Not quite: 180° is half a turn, on the left. Try another.',
    270: 'Not quite: 270° is three quarters, at the bottom. Try another.',
};

// One store holds what the learner sets; the video's scripts write the same fields.
wildflower.store('dial', {
    state: { angle: 0, choice: null },
    computed: { right() { return this.choice === 90; } },
});

step('spin', { wait: 1, entry: { 'dial.angle': 0 }, script: { 'dial.angle': { at: [1, 4], to: [0, 180], ease: 'power2.inOut' } } });
step('ask', {
    wait: 1,                                                   // the lesson: holds before the explanation at 2 s
    until: 'dial.right',                                       // the lesson: a wrong answer keeps it waiting; the right one plays the explanation
    entry: { 'dial.choice': null },                            // the lesson: cleared on the way in
    script: {
        'dial.choice': { at: [0, 1.5], set: [null, 90] },      // the video: 90 is chosen at 1.5 s
        'dial.angle': { at: [2, 3], to: [180, 90], ease: 'power2.inOut' },
    },
});

// The dial: the turn as a wedge, the hand, the point, and the angle beside it,
// sized so the angle at the bottom stays clear of the band.
const CX = 900, CY = 320, R = 170;
const at = (deg, r) => [CX + r * Math.cos(deg * Math.PI / 180), CY - r * Math.sin(deg * Math.PI / 180)];
scene('dial', {
    subscribe: ['dial'],
    follow: { angle: 'dial.angle' },   // eased toward the store's angle by a spring
    computed: {
        point() { const [x, y] = at(this.angle, R); return { cx: x.toFixed(1), cy: y.toFixed(1) }; },
        hand() { return { x2: this.point.cx, y2: this.point.cy }; },
        wedge() {
            const a = Math.min(Math.max(this.angle, 0), 360);
            if (a < 0.5) return { d: '' };
            if (a > 359.5) return { d: `M${CX - R} ${CY}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0Z` };
            const [x, y] = at(a, R);
            return { d: `M${CX} ${CY}L${CX + R} ${CY}A${R} ${R} 0 ${a > 180 ? 1 : 0} 0 ${x.toFixed(1)} ${y.toFixed(1)}Z` };
        },
        // The recap: the disc parts into quarters, 0.5 s into its step at 10 s.
        quarters() { return { opacity: ramp(this.local, 10.5, 11.1).toFixed(3) }; },
        label() { return Math.round(this.angle) + '°'; },
        labelAt() { const [x, y] = at(this.angle, R + 64); return { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)` }; },
    },
});

wildflower.component('quiz', {
    subscribe: ['dial', 'kinetic'],
    computed: {
        choices() {
            const c = this.stores.dial.choice, off = this.stores.kinetic.mode === 'video';   // the video's script answers
            return [0, 90, 180, 270].map((a) => ({ a, off, label: a + '°', cls: c !== a ? '' : a === 90 ? 'right' : 'wrong' }));
        },
        why() { return WHY[this.stores.dial.choice] || ''; },
    },
    choose(event, element, details) {
        this.stores.dial.choice = details.item.a;
        if (details.item.a === 90) this.stores.dial.angle = 90;   // the lesson: the dial turns to the answer
    },
});

// Prompts to the learner, in the lesson alone.
wildflower.component('prompt', {
    subscribe: ['kinetic'],
    computed: {
        text() {
            const k = this.stores.kinetic;
            if (k.mode !== 'interactive') return '';
            return { spin: 'Your turn: turn the dial with the Angle slider.', ask: 'Your turn: pick an answer.' }[k.step] || '';
        },
    },
});

// The controls in the frame, in the lesson alone: the current step's own
// control, and the band with where the lesson is, Play and Replay, Back and Next.
wildflower.component('controls', {
    subscribe: ['dial', 'kinetic'],
    computed: {
        countText() { const k = this.stores.kinetic; return k.stepCount ? 'Step ' + (k.stepIndex + 1) + ' of ' + k.stepCount : ''; },
        title() { return TITLES[this.stores.kinetic.step] || ''; },
        backAttrs() { return { disabled: this.stores.kinetic.stepIndex <= 0 }; },
        // Off while the step's until is false: a question not yet answered.
        nextAttrs() { return { disabled: !this.stores.kinetic.canAdvance }; },
        last() { const k = this.stores.kinetic; return k.stepCount > 0 && k.stepIndex === k.stepCount - 1; },
        more() { return !this.last; },
        playLabel() { return this.stores.kinetic.playing ? 'Pause' : 'Play'; },
        // The Angle slider belongs to the first step, in the lesson alone.
        turning() { const k = this.stores.kinetic; return k.mode === 'interactive' && k.step === 'spin'; },
        angleText() { return Math.round(this.stores.dial.angle) + '°'; },
    },
    back() { wildflower.kinetic.back(); },
    next() { wildflower.kinetic.next(); },
    again() { wildflower.kinetic.go(0); },
    replay() { wildflower.kinetic.go(this.stores.kinetic.stepIndex); },
    toggle() { if (this.stores.kinetic.playing) wildflower.kinetic.pause(); else wildflower.kinetic.play(); },
});
```

Open it and it is the lesson: the first step plays and holds, and the
learner drags, answers and steps on. With `?preview` in the address, or
`wildflower.kinetic.config({ mode: 'video' })` and
`wildflower.kinetic.play({ from: 0 })`, the same page plays as the video;
`check()` and `render()` always use video mode.

The rules that matter here:

- A step is a clip with an `id` and `data-step`; its range runs to the
  next step's start. `step(id, { wait, until, entry, script })` gives it
  the second it holds at, the store path that must be truthy before the
  rest of it plays, what it writes as it is entered, and the script that
  writes the store in the video.
- The learner's control and the step's script write the same store field,
  and the scenes read it, here through `follow`. A scene never reads the
  slider itself.
- The layout is the same in every lesson, and all of it is inside the
  composition root. The left column: the step's heading at the top left of
  the safe area, a line or two of body under it, a question's choices
  stacked under that, with the explanation under them once answered, and
  the current step's own controls (the Angle slider, in the first step
  alone, in the choices' place). The illustration takes the rest of the
  frame above the band, and stays clear of it. The band runs along the
  bottom of the safe area.
- The band and the step's controls show in interactive mode alone
  (`data-show="$kinetic.mode === 'interactive'"`, or a computed that reads
  the store's `mode`), so `check()` and a render never draw them. In the
  video their space is empty paper: the layout is the same in both modes,
  and nothing moves into it. The choices show in both, since the video
  answers the question too.
- Each layer takes no pointer events, so a layer above never catches a
  click, and the band, the slider, and the choices take them back with
  `pointer-events: auto`. The fit scales the root with a CSS transform, and
  a click or a drag lands on a scaled control where it is drawn.
- Kinetic never moves to the next step by itself: each step plays, then
  holds on its last frame until the learner presses Next. Next follows
  `$kinetic.canAdvance`, which is false only while a step's `until` path is
  falsy, so on a step with nothing to answer it is ready at once, and a
  press while the step plays skips the rest of it. Once an `until` path is
  truthy, the rest of the step plays by itself, Next lit. Next is in the
  accent while it can be used and on the raised surface with muted text
  while it cannot. Back always works.
- There is no scrubber: a step is short, and Replay step (`go()` with the
  step's index) starts it again. Play and Pause share one width. Play at or
  past the step's hold plays the step again from its start.
- At a hold the clock stands still, so `local` does too: what the learner
  changes there moves only through `follow` (the dial here) or a binding to
  the store, never through the time.
- A right answer turns its button to the accent fill and makes `until`
  true, so the explanation plays; the action handler also turns the dial to
  90°, which only the learner's click runs. A wrong answer turns coral,
  shows a line saying why under the choices, and the step keeps waiting.
- The learner's own values (the angle, beside the point and beside the
  slider) are ink on the accent fill throughout, since lavender text on
  paper is too faint to read.
- The question's buttons are disabled in video mode, where the script
  writes the answer and the angle.
- The prompts to the learner ("Your turn: ...") are in the second person
  and read the store's `mode`, so the video has none of them.
- The last step offers "Start again" (`go(0)`) in Next's place, so the
  learner never steps back through every step. The first step's `entry`
  puts the angle back to 0°. The finished lesson has no preview bar and
  loads the minified builds.
- A question holds before its explanation: `wait` is earlier than the
  step's end, and the explanation is a clip that starts after the hold, so
  it plays once the question is answered.
- `node <this skill's folder>/scripts/check.cjs index.html --lesson` walks
  the steps: whether each holds, the `until` it waits on, and a still of
  each hold. The stills are interactive mode, with the band drawn; the
  `--frames` PNGs are video mode, where the band's place is empty paper.
- Nothing inside the root changes through a CSS transition: the question's
  buttons change class with no transition, since the script sets the answer
  in the video and a render captures each frame at once.
- "Interactive mode" is the lesson on the page, and "video mode" the video.
  `config({ mode })` is `'auto'` by default: video with the preview bar up,
  interactive otherwise.
