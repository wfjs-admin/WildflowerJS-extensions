# Kinetic patterns

This file holds the sixty-nine Kinetic patterns, each one idea with its markup and scene code, all running inside the composition set up in the first section.
Every helper comes from `wildflower.kinetic`, destructured in the line at the top of the scene file.

Contents, one entry for each `##` section below:

- [The composition](#the-composition)
- [A staggered title](#a-staggered-title)
- [A title that sweeps in](#a-title-that-sweeps-in)
- [A repeater](#a-repeater)
- [A typewriter line](#a-typewriter-line)
- [Style tracks on an element](#style-tracks-on-an-element)
- [Spring in, ease out](#spring-in-ease-out)
- [A card that turns over](#a-card-that-turns-over)
- [A wipe](#a-wipe)
- [An iris](#an-iris)
- [A shadow that lifts](#a-shadow-that-lifts)
- [Weight that breathes](#weight-that-breathes)
- [Lines that draw themselves](#lines-that-draw-themselves)
- [Along a path](#along-a-path)
- [A shape that becomes another](#a-shape-that-becomes-another)
- [A star that breathes, a pie that fills](#a-star-that-breathes-a-pie-that-fills)
- [A clip that changes shape](#a-clip-that-changes-shape)
- [Enter and exit](#enter-and-exit)
- [Styling the scene's own root](#styling-the-scenes-own-root)
- [One scene, several clips](#one-scene-several-clips)
- [A push between two scenes](#a-push-between-two-scenes)
- [An iris into the next scene](#an-iris-into-the-next-scene)
- [A title that wipes in and fades out](#a-title-that-wipes-in-and-fades-out)
- [A sequence of transitions](#a-sequence-of-transitions)
- [A transition inside a scene](#a-transition-inside-a-scene)
- [Still effects with an SVG filter](#still-effects-with-an-svg-filter)
- [A luma matte](#a-luma-matte)
- [An alpha matte and a feathered mask](#an-alpha-matte-and-a-feathered-mask)
- [A paper texture and a light leak](#a-paper-texture-and-a-light-leak)
- [An adjustment layer](#an-adjustment-layer)
- [A halftone that moves](#a-halftone-that-moves)
- [Crayon shading on flat shapes](#crayon-shading-on-flat-shapes)
- [Tilt-shift focus, a light leak and grain at the edges](#tilt-shift-focus-a-light-leak-and-grain-at-the-edges)
- [Hand-drawn wobble on shapes](#hand-drawn-wobble-on-shapes)
- [A title that swells in weight](#a-title-that-swells-in-weight)
- [A Lottie logo sting](#a-lottie-logo-sting)
- [A looping sticker](#a-looping-sticker)
- [Bars that grow in](#bars-that-grow-in)
- [A bar race](#a-bar-race)
- [An axis](#an-axis)
- [A pie from data](#a-pie-from-data)
- [Data before frame 0](#data-before-frame-0)
- [Captions from a transcript](#captions-from-a-transcript)
- [A pulse on the beat](#a-pulse-on-the-beat)
- [Music under a scene](#music-under-a-scene)
- [A track shorter than the film](#a-track-shorter-than-the-film)
- [A sound on a cut](#a-sound-on-a-cut)
- [Bars that move with the music](#bars-that-move-with-the-music)
- [A pulse on the bass](#a-pulse-on-the-bass)
- [Many particles](#many-particles)
- [Particles from an emitter](#particles-from-an-emitter)
- [Rack focus across phrases](#rack-focus-across-phrases)
- [Depth bands for hundreds of elements](#depth-bands-for-hundreds-of-elements)
- [Bokeh particles with no filter](#bokeh-particles-with-no-filter)
- [A landing on a whole frame](#a-landing-on-a-whole-frame)
- [A simulation baked at load](#a-simulation-baked-at-load)
- [Cuts on whole frames](#cuts-on-whole-frames)
- [A camera push and a fly-through](#a-camera-push-and-a-fly-through)
- [Morphing a formation](#morphing-a-formation)
- [Depth of field in 3D](#depth-of-field-in-3d)
- [Typed inputs for a batch](#typed-inputs-for-a-batch)
- [A lesson that is also its video](#a-lesson-that-is-also-its-video)
- [A question that explains a wrong answer](#a-question-that-explains-a-wrong-answer)
- [Content for the lesson alone](#content-for-the-lesson-alone)
- [A lesson's layout](#a-lessons-layout)
- [Shapes from data inside an SVG](#shapes-from-data-inside-an-svg)
- [A Sankey from a table of flows](#a-sankey-from-a-table-of-flows)
- [A Sankey laid out by pele](#a-sankey-laid-out-by-pele)
- [A flowchart laid out by pele](#a-flowchart-laid-out-by-pele)
- [Checking and rendering](#checking-and-rendering)

## The composition

Every pattern is a scene inside a composition root.
The root carries `data-composition-id`, its length in `data-duration`, and its size and frame rate.
Kinetic loads after the framework, and the scene file loads after both.

```html
<script defer src="https://cdn.jsdelivr.net/npm/wildflowerjs@^1.5.5/dist/wildflower.lite.dev.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/kinetic@0.1/dist/kinetic.wf.js" data-preview></script>
<script defer src="app.js"></script>

<div id="stage" data-composition-id="main"
     data-start="0" data-duration="6" data-width="1280" data-height="720" data-fps="30">
    <!-- the scene elements of the patterns go here -->
</div>
```

The two development builds print the WF and KN warnings while the page is made; the finished page swaps those two lines for `wildflower.lite.min.js` and `kinetic.wf.min.js`, and drops `data-preview`.
`data-preview` on Kinetic's script tag adds a bar at the bottom of the window with play, pause, a scrubber and a Render button, so the file previews in a plain tab.
Kinetic also scales the stage down to fit the window.
Kinetic gives the stage the composition's size from `data-width` and `data-height`, so the CSS does not repeat it, and a scene element fills it.
The last rule is Kinetic's cloak: it hides the stage until Kinetic sets `data-kinetic-ready` on the root, since before that the stage holds unbound markup and every clip at once.

```css
#stage { position: relative; overflow: hidden; }
.layer { position: absolute; inset: 0; }
[data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }
```

A scene is registered with `scene(name, definition)` and bound to the element whose `data-component` has the same name.
The element's `data-start` and `data-duration` set its clip, and `this.local` counts seconds from `data-start`.
`this.time` is the composition's seconds; `local` holds at 0 before the clip and at the clip's length after it, where the scene is hidden.
The scene code in every pattern follows these two lines at the top of the file: the shutter, so every render has motion blur, and the helpers.

```javascript
wildflower.kinetic.config({ shutter: 180 });
const { scene, split, styleAt, stagger, sweep, repeat, typewriter, scramble, moment, interpolate, ease, spring, ramp, mix, focus, random, noise, transition, effect, shade, blur, boil, text, lottie, animatedImage, matchPaths, shape, format, ticks, rank, captions, srt, beat, level, spectrum } = wildflower.kinetic;
```

## A staggered title

The letters of a title fade in and spring up into place, one after another.
`split()` returns a row for each letter, and `styleAt()` turns the tracks in `RISE` into a style object at a given time.
Each row is styled at `local - 0.2 - stagger(i, n, { each: 0.06 })`, so each letter starts 0.06 s after the one before it.
`from: 'center'` would start from the middle letter outward, and `total: 0.5` would spread the starts over half a second whatever the length of the title.
A row whose time is still negative returns the first value of each track.
`RISE` fades the letter in, springs it up from 48 px below and settles its scale.
The row needs `white-space: pre`, because spaces get rows of their own, and `display: inline-block`, because a transform has no effect on an inline element.

```html
<div class="layer" data-component="title" data-start="0" data-duration="4">
    <h1 data-list="letters" data-key="key">
        <template><span style="display: inline-block; white-space: pre" data-bind="text" data-bind-style="style"></span></template>
    </h1>
</div>
```

```javascript
const RISE = {
    opacity:    { at: [0, 0.35], to: [0, 1] },
    translateY: { at: [0, 0.6],  to: [48, 0], ease: 'spring' },
    scale:      { at: [0, 0.6],  to: [0.9, 1], ease: 'power2.out' },
};

scene('title', {
    computed: {
        letters() {
            const rows = split('WILDFLOWER');
            return rows.map((r) => ({
                key: r.key,
                text: r.text,
                style: r.space ? {} : styleAt(this.local - 0.2 - stagger(r.i, rows.length, { each: 0.06 }), RISE),
            }));
        },
    },
});
```

The Launch Title demo (/demos/kinetic-title/) styles the letters of its title this way.

## A title that sweeps in

The letters of a title rise and fade in under a window that sweeps through the word, each letter's change scaled by its weight, so neighbouring letters overlap in motion instead of starting one after another.
`sweep(i, n, p, options)` gives letter i's weight: 0 before the window reaches it, 1 once the window has passed, and in between the window's shape at the letter's place in it.
`p` is the sweep's progress, here `ramp(local, 0.2, 1.4)`.
The weight is then the time of a one-second track set: `styleAt(w, RISE)`, with `RISE`'s keys at 0 and 1, gives the letter's style from its weight, with the units and the transform folded as `styleAt()` folds them.
`shape: 'triangle'` makes a bump instead, a wave that travels through the word and leaves the letters as they were; `from: 'center'` sweeps outward from the middle; `width` is the window as a fraction of the letters, and a wider one has more of them moving at once.
Spaces are rows and count, which pauses the sweep at each gap.

```html
<div class="layer" data-component="title" data-start="0" data-duration="4">
    <h1 data-list="letters" data-key="key">
        <template><span style="display: inline-block; white-space: pre" data-bind="text" data-bind-style="style"></span></template>
    </h1>
</div>
```

```javascript
const RISE = {
    opacity:    { at: [0, 1], to: [0, 1] },
    translateY: { at: [0, 1], to: [40, 0] },
    blur:       { at: [0, 1], to: [6, 0] },
};

scene('title', {
    computed: {
        letters() {
            const rows = split('WILDFLOWER');
            const p = ramp(this.local, 0.2, 1.4, 'power1.inOut');
            return rows.map((r) => ({
                key: r.key,
                text: r.text,
                style: r.space ? {} : styleAt(sweep(r.i, rows.length, p, { width: 0.4, ease: 'power2.out' }), RISE),
            }));
        },
    },
});
```

## A repeater

A shape repeated twelve times, each copy the transform of the one before it again, so a small turn makes a fan and a turn with a move an arc; a `data-list` of the rows, each copy bound to its row's style.
`repeat(n, options)` returns the rows, every copy's transform composed as one matrix about the element's `transform-origin`, which `origin` writes.
The copies sit on one another to start, so the copy is absolutely positioned at the list element's origin and the list element is placed where the fan's pivot goes.
A track drives any number: `rotate` here fans the copies out over 1.4 seconds, and `opacity` fades them from the first to the last.

```html
<div class="layer" data-component="fan" data-start="0" data-duration="4">
    <div class="copies" data-list="copies" data-key="key">
        <template><div class="leaf" data-bind-style="style"></div></template>
    </div>
</div>
```

```css
.copies { position: absolute; left: 628px; top: 400px; }
.leaf { position: absolute; left: 0; top: 0; width: 24px; height: 160px; border-radius: 12px; background: #f5c542; }
```

```javascript
scene('fan', {
    computed: {
        copies() {
            const turn = interpolate(this.local, [0.2, 1.6], [0, 15], { ease: 'power2.out' });
            return repeat(12, { rotate: turn, opacity: [1, 0.35], origin: '50% 100%' });
        },
    },
});
```

## A typewriter line

A line of text types itself out one character at a time.
`typewriter(t, text, cps)` returns the first `Math.floor(t * cps)` characters of the text, counted by grapheme, so an emoji types as one character.
With `t` as `local` minus a start time, the string is empty until the start, grows at `cps` characters per second, and is the whole text once it has been typed.
An empty string gives the element no height, so it needs a `min-height` to keep the layout still.

```html
<div class="layer" data-component="subtitle" data-start="0" data-duration="4">
    <p style="min-height: 1.3em" data-bind="typed"></p>
</div>
```

```javascript
scene('subtitle', {
    computed: {
        typed() { return typewriter(this.local - 0.5, 'Every frame is a function of time.', 28); },
    },
});
```

The Launch Title demo (/demos/kinetic-title/) types its subtitle this way.

## Style tracks on an element

A badge slides up, straightens and fades in, then fades out, while the backdrop behind it shifts from near-black to a dark purple and back.
A `keyframes` entry that is an object of tracks becomes a style object.
`translateY`, `rotate` and `scale` among its tracks fold into one `transform`, in that order.
Any other track is a style property of its own, so a color track such as `background` blends between colors.
A track is `{ at, to, ease, unit }`, with `at` in the clip's seconds.
`translateY` defaults to `px` and `rotate` to `deg`.

```html
<div class="layer" data-component="badge" data-start="0" data-duration="4">
    <div class="layer" data-bind-style="backdrop"></div>
    <div style="position: relative" data-bind-style="badge">New</div>
</div>
```

```javascript
scene('badge', {
    keyframes: {
        badge: {
            opacity:    { at: [0, 0.4, 3.4, 4], to: [0, 1, 1, 0] },
            translateY: { at: [0, 0.6], to: [40, 0], ease: 'spring' },
            rotate:     { at: [0, 0.6], to: [-6, 0], ease: 'power3.out' },
            scale:      { at: [0, 0.6], to: [0.9, 1], ease: 'power2.out' },
        },
        backdrop: { background: { at: [0, 2, 4], to: ['#0b0f1a', '#181030', '#0b0f1a'] } },
    },
});
```

The Launch Title demo (/demos/kinetic-title/) uses a color track for its backdrop and a track for the width of its rule.

## Spring in, ease out

A heading springs up into place, holds, and then accelerates away upward, all on one `translateY` track.
An `ease` that is an array gives each pair of keyframes its own ease, one entry per segment, so four keyframes take three entries.
The first segment springs, the middle one holds at 0, and the last one eases in with `power3.in`.
The spring's segment is 1 second long, which leaves the default spring within 0.3% of rest when the second key arrives.
A shorter segment cuts the spring off while it is still moving, the value jumps to the key, and development builds warn (KN-123).

```html
<div class="layer" data-component="headline" data-start="0" data-duration="3">
    <h2 data-bind-style="title">Spring sale</h2>
</div>
```

```javascript
scene('headline', {
    keyframes: {
        title: {
            opacity:    { at: [0, 0.3, 2.6, 3], to: [0, 1, 1, 0] },
            translateY: { at: [0, 1, 2.4, 3], to: [60, 0, 0, -60], ease: ['spring', 'linear', 'power3.in'] },
        },
    },
});
```

## A card that turns over

A card comes forward, turns over to show its back, and settles again.
`rotateY` turns it about its vertical axis and `translateZ` brings it toward the viewer during the turn, both under `perspective`, which Kinetic writes first in the transform.
A track that holds one value has two equal keyframes, as `perspective` does here.
The card has `transform-style: preserve-3d`, so its two faces turn with it in 3D.
Each face has `backface-visibility: hidden`, so a face turned away from the viewer is not drawn, and the back face starts turned by 180 degrees, so the turn brings it round to the front.

```html
<div class="layer" data-component="turn" data-start="0" data-duration="3">
    <div class="card" data-bind-style="card">
        <div class="face">Question</div>
        <div class="face back">Answer</div>
    </div>
</div>
```

```css
.card { position: absolute; left: 490px; top: 160px; width: 300px; height: 400px; transform-style: preserve-3d; }
.face { position: absolute; inset: 0; backface-visibility: hidden; }
.back { transform: rotateY(180deg); }
```

```javascript
scene('turn', {
    keyframes: {
        card: {
            perspective: { at: [0, 3], to: [1200, 1200] },
            translateZ:  { at: [1, 1.4, 1.8], to: [0, 120, 0], ease: ['power2.out', 'power2.in'] },
            rotateY:     { at: [1, 1.8], to: [0, 180], ease: 'power3.inOut' },
        },
    },
});
```

## A wipe

A panel is uncovered from left to right, holds, and is covered again from left to right.
A `clipPath` track holds text with numbers in it, and Kinetic moves each number between keyframes while the text around the numbers stays as written.
`inset(top right bottom left)` cuts that much off each side, so the right inset falling from 100% to 0% uncovers the panel, and the left inset rising from 0% to 100% covers it again.
Every keyframe has the same text, with the same unit after each number, and a keyframe that differs throws when the scene is defined (KN-120).

```html
<div class="layer" data-component="wipe" data-start="0" data-duration="4">
    <div class="layer panel" data-bind-style="panel">
        <h2>Chapter two</h2>
    </div>
</div>
```

```javascript
scene('wipe', {
    keyframes: {
        panel: {
            clipPath: {
                at: [0, 0.8, 3, 3.8],
                to: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 100%)'],
                ease: ['power3.out', 'linear', 'power3.in'],
            },
        },
    },
});
```

## An iris

A shot opens from a point at the center of the frame and later closes onto a point above and to the right of it.
The `clipPath` track moves through `circle(R% at X% Y%)`, the radius and the center together.
A percentage radius is measured against the layer's diagonal divided by the square root of 2, which puts each corner 70.7% from the center, so 75% uncovers the whole layer.
In the last segment the radius shrinks while the center moves to the point, so the circle closes on that point.

```html
<div class="layer" data-component="iris" data-start="0" data-duration="4">
    <div class="layer" data-bind-style="shot">
        <img src="harbour.jpg" alt="" style="width: 100%; height: 100%; object-fit: cover">
    </div>
</div>
```

```javascript
scene('iris', {
    keyframes: {
        shot: {
            clipPath: {
                at: [0, 1, 2.8, 3.6],
                to: ['circle(0% at 50% 50%)', 'circle(75% at 50% 50%)', 'circle(75% at 50% 50%)', 'circle(0% at 72% 38%)'],
                ease: ['expo.out', 'linear', 'power2.in'],
            },
        },
    },
});
```

## A shadow that lifts

A tile rises a little, and its shadow drops further below it, spreads and fades.
`filter: drop-shadow()` draws the shadow from what the element draws, rounded corners and transparent parts included.
The `filter` track holds text with a color in it, and Kinetic mixes the `rgba()` color per channel, alpha included, while it moves the offset and the blur.
The tile's `translateY` and `scale` tracks sit beside it and fold into `transform`.
A `blur` track cannot sit beside a `filter` track, since both write `filter`, so a blur goes into the same text, as in `'blur(0px) drop-shadow(...)'`.

```html
<div class="layer" data-component="lift" data-start="0" data-duration="3">
    <div class="tile" data-bind-style="tile">Pick me</div>
</div>
```

```css
.tile { position: absolute; left: 540px; top: 260px; width: 200px; height: 200px; border-radius: 24px; background: #f4f1ff; }
```

```javascript
scene('lift', {
    keyframes: {
        tile: {
            translateY: { at: [0.5, 1.1], to: [0, -18], ease: 'power2.out' },
            scale:      { at: [0.5, 1.1], to: [1, 1.04], ease: 'power2.out' },
            filter: {
                at: [0.5, 1.1],
                to: ['drop-shadow(0px 2px 3px rgba(20, 16, 48, 0.35))', 'drop-shadow(0px 22px 28px rgba(20, 16, 48, 0.25))'],
                ease: 'power2.out',
            },
        },
    },
});
```

## Weight that breathes

A word grows heavier and wider, then lighter and narrower, in one slow breath across its clip.
A variable font carries its weights and widths as axes, and `font-variation-settings` sets each axis by its tag, so one track moves both.
The page loads the font with `@font-face`, which declares the ranges of its axes, and readiness waits for the page's fonts (`document.fonts.ready`) before frame 0.
Any variable font with weight and width axes works, such as Roboto Flex, whose `wght` axis runs from 100 to 1000 and `wdth` from 25 to 151.

```html
<div class="layer" data-component="breathe" data-start="0" data-duration="4">
    <h1 class="word" data-bind-style="word">Breathe</h1>
</div>
```

```css
@font-face {
    font-family: 'Roboto Flex';
    src: url('fonts/RobotoFlex.woff2') format('woff2');
    font-weight: 100 1000;
    font-stretch: 25% 151%;
}
.word { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; font: 160px 'Roboto Flex', sans-serif; }
```

```javascript
scene('breathe', {
    keyframes: {
        word: {
            fontVariationSettings: {
                at: [0, 2, 4],
                to: ['"wght" 200, "wdth" 75', '"wght" 900, "wdth" 125', '"wght" 200, "wdth" 75'],
                ease: 'sine.inOut',
            },
        },
    },
});
```

## Lines that draw themselves

A signature draws itself, one stroke after another.
`pathLength="1"` makes a path measure its own length as 1, so `stroke-dasharray: 1` gives it one dash as long as the path and a gap as long again.
A `strokeDashoffset` track from 1 to 0 shifts the dash along the path, and the stroke appears from its start to its end.
A path with several subpaths draws all of them at once, each at the same rate, so strokes that draw one after another are separate paths with staggered tracks.
With `stroke-linecap: round`, the first frame after the offset leaves 1 shows a dot at the start of the stroke, which is the round cap.
The dash draws a stroke only. For a fill drawn partway, such as a band, or the part as a shape a canvas or three.js draws, use `trimPath()` (api.md, "Paths and shapes"); never cut the curves by hand.
`pathLength` works the same way on `circle`, `rect`, `ellipse`, `line` and `polygon`.

```html
<div class="layer" data-component="sign" data-start="0" data-duration="3">
    <svg class="layer" viewBox="0 0 1280 720" width="1280" height="720">
        <path class="stroke" pathLength="1" d="M 200 400 C 300 200 450 200 520 380" data-bind-style="s1"></path>
        <path class="stroke" pathLength="1" d="M 560 380 L 640 220 L 720 380" data-bind-style="s2"></path>
        <path class="stroke" pathLength="1" d="M 760 300 C 860 200 980 420 1080 300" data-bind-style="s3"></path>
    </svg>
</div>
```

```css
.stroke { fill: none; stroke: #f5c542; stroke-width: 8; stroke-linecap: round; stroke-dasharray: 1; }
```

```javascript
const draw = (from, to) => ({ strokeDashoffset: { at: [from, to], to: [1, 0], ease: 'power2.inOut' } });

scene('sign', {
    keyframes: { s1: draw(0.2, 1.2), s2: draw(0.8, 1.8), s3: draw(1.4, 2.4) },
});
```

A closed shape, such as a `rect`, a `polygon`, a path that ends in `Z` or a `shape()`, meets its own start when it is fully drawn.
A dashed stroke has two ends at that corner and no join, so with the default flat ends a notch shows there, even once the shape is complete.
Round caps with round joins fill the corner as the stroke arrives, at any angle.
Square caps do the same for a shape whose corners are right angles, such as a rectangle, and leave its corners sharp.

```css
.box  { fill: none; stroke: #ff7a59; stroke-width: 10; stroke-dasharray: 1; stroke-linecap: square; }
.star { fill: none; stroke: #ff7a59; stroke-width: 10; stroke-dasharray: 1; stroke-linecap: round; stroke-linejoin: round; }
```

## Along a path

A paper plane flies along a curve and turns with it.
CSS `offset-path: path('…')` puts an element on a path, `offset-rotate: auto` turns it to the path's direction, and an `offsetDistance` track moves it from 0% to 100% of the way.
The track needs `unit: '%'`, since the browser ignores a bare number there, and development builds warn about a track without one (KN-122).
The path's coordinates start at the element's own position, so the plane sits at `left: 0; top: 0` in a layer whose coordinates are the drawn path's, here the stage's.
The plane's center is the point on the path.
The dashed route is the same path, drawn in an SVG the size of the stage.

```html
<div class="layer" data-component="flight" data-start="0" data-duration="4">
    <svg class="layer" viewBox="0 0 1280 720" width="1280" height="720">
        <path class="route" d="M 160 560 C 400 80 880 80 1120 560"></path>
    </svg>
    <div class="plane" data-bind-style="plane"></div>
</div>
```

```css
.route { fill: none; stroke: #334; stroke-width: 3; stroke-dasharray: 8 10; }
.plane { position: absolute; left: 0; top: 0; width: 40px; height: 20px; background: #f5c542;
         offset-path: path('M 160 560 C 400 80 880 80 1120 560'); offset-rotate: auto; }
```

```javascript
scene('flight', {
    keyframes: {
        plane: { offsetDistance: { at: [0.3, 3.5], to: [0, 100], unit: '%', ease: 'power1.inOut' } },
    },
});
```

## A shape that becomes another

A square rounds into a circle as it turns, and beside it a triangle grows into an octagon.
A track between two paths moves their numbers, so the paths need the same commands in the same order, and a square drawn with lines and a circle drawn with arcs do not have them (KN-120).
`matchPaths()` converts both to cubic curves with the same commands and the same number of segments, and its result goes into the track's `to`.
It gives each path at least 8 segments, the fewest that keeps a square to a circle from twisting, and turns each later path to run the same way as the first and start at the point nearest the first's start.
For polygons, `segments` set to the least common multiple of the two corner counts gives every side an even share of the points, which is 24 for a triangle and an octagon.
The square turns about its own center because it has `transform-box: fill-box; transform-origin: center`, and without them a `rotate` track on an SVG element turns it about the origin of the `viewBox`.
A transform track replaces the element's `transform` attribute, so each shape is placed by a wrapping `<g>`.

```html
<div class="layer" data-component="morph" data-start="0" data-duration="3">
    <svg class="layer" viewBox="0 0 1280 720" width="1280" height="720">
        <g transform="translate(400 360)"><path class="shape turning" data-bind-attr="{ d: blob }" data-bind-style="turn"></path></g>
        <g transform="translate(880 360)"><path class="shape" data-bind-attr="{ d: poly }"></path></g>
    </svg>
</div>
```

```css
.shape { fill: #f5c542; }
.turning { transform-box: fill-box; transform-origin: center; }
```

```javascript
const SQUARE = 'M -100 -100 H 100 V 100 H -100 Z';
const CIRCLE = 'M 0 -120 A 120 120 0 1 1 0 120 A 120 120 0 1 1 0 -120 Z';
const TRIANGLE = shape('polygon', { sides: 3, radius: 130 });
const OCTAGON = shape('polygon', { sides: 8, radius: 120 });

scene('morph', {
    keyframes: {
        blob: { at: [0.3, 1.5], to: matchPaths([SQUARE, CIRCLE]), ease: 'power2.inOut' },
        turn: { rotate: { at: [0.3, 1.5], to: [0, 45], ease: 'power2.inOut' } },
        poly: { at: [1, 2.6], to: matchPaths([TRIANGLE, OCTAGON], { segments: 24 }), ease: 'power2.inOut' },
    },
});
```

## A star that breathes, a pie that fills

A star's points grow and shrink twice, and a pie beside it fills from nothing to a whole circle.
`shape()` returns the path data of a polygon, star, sector or arrow from numbers, so a computed that calls it with a value from a track draws a new shape on every frame.
The star's inner radius comes from the `inner` track, and the pie's end angle, in degrees clockwise from up, from the `sweep` track.
At 0 degrees the sector is an empty string, which draws nothing, and at 360 it is two arcs that close into a circle.
A count such as `sides` or `points` has to be a whole number, so a track cannot take a star from 5 points to 6 (KN-100); to change the count, morph between the two shapes with `matchPaths()`, as in the pattern above.

```html
<div class="layer" data-component="gauges" data-start="0" data-duration="4">
    <svg class="layer" viewBox="0 0 1280 720" width="1280" height="720">
        <path class="star" data-bind-attr="{ d: star }"></path>
        <path class="pie" data-bind-attr="{ d: pie }"></path>
    </svg>
</div>
```

```css
.star { fill: #f5c542; }
.pie { fill: #c8452d; }
```

```javascript
scene('gauges', {
    keyframes: {
        inner: { at: [0, 1, 2, 3, 4], to: [40, 80, 40, 80, 40], ease: 'sine.inOut' },
        sweep: { at: [0.5, 3.5], to: [0, 360], ease: 'power2.inOut' },
    },
    computed: {
        star() { return shape('star', { points: 5, outer: 120, inner: this.inner, cx: 400, cy: 360 }); },
        pie() { return shape('sector', { radius: 120, to: this.sweep, cx: 880, cy: 360 }); },
    },
});
```

## A clip that changes shape

A photo opens from a point into a diamond and then fills the frame, and afterwards a star-shaped badge rounds into a disc.
A `clipPath` track over `polygon()` moves every vertex, so each keyframe lists the same number of points, and the photo's first keyframe puts all four on the center.
A `clipPath` track over `path("…")` reads the path data inside the quotes as commands and numbers, so its keyframes need the same commands.
The badge's star and disc go through `matchPaths()`, which takes `path("…")` values and returns them in the same form.
The coordinates inside `path()` are pixels in the element's own box, and every keyframe uses the same quote style, since the quotes are text.

```html
<div class="layer" data-component="reveal" data-start="0" data-duration="3">
    <div class="layer photo" data-bind-style="photo"></div>
    <div class="layer badge" data-bind-style="badge"></div>
</div>
```

```css
.photo { background: url('harbour.jpg') center / cover; }
.badge { background: #f5c542; }
```

```javascript
const [STAR, DISC] = matchPaths([
    'path("' + shape('star', { points: 5, outer: 200, inner: 90, cx: 640, cy: 360 }) + '")',
    'path("' + shape('sector', { radius: 260, to: 360, cx: 640, cy: 360 }) + '")',
]);

scene('reveal', {
    keyframes: {
        photo: {
            clipPath: {
                at: [0, 0.6, 1.4],
                to: ['polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)', 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'],
                ease: ['power2.out', 'power2.inOut'],
            },
        },
        badge: { clipPath: { at: [1.4, 2.6], to: [STAR, DISC], ease: 'power2.inOut' } },
    },
});
```

## Enter and exit

A card with a heading fades in at the start of its clip and fades out at the end.
A plain fade like this is the clip's attributes by default, `data-clip-enter="fade 0.4"` and `data-clip-exit="fade 0.6"`, with no scene code; the form below is for a scene whose own code needs to know how far in or out it is (the "Which to use" tables in rules.md).
With `edges: { enter, exit }`, `enter` rises from 0 to 1 over the first `enter` seconds of the clip and `exit` rises from 0 to 1 over its last `exit` seconds.
`presence` is `enter * (1 - exit)`, which is 0 at both ends and 1 between them, so it fades a layer in and out.
The opacity goes on a layer inside the scene, which reads the scene's values wherever the scene sits, as the next pattern explains.

```html
<div class="layer" data-component="card" data-start="2" data-duration="3">
    <div class="layer" data-bind-style="card">
        <h2>Spring sale</h2>
    </div>
</div>
```

```javascript
scene('card', {
    edges: { enter: 0.4, exit: 0.6 },
    computed: {
        card() { return { opacity: String(this.presence) }; },
    },
});
```

The Launch Title (/demos/kinetic-title/), Sales Chart (/demos/kinetic-chart/) and Captions on a Beat (/demos/kinetic-captions/) demos each fade their scene this way.

## Styling the scene's own root

The background of a scene shifts from near-black to a dark purple and back while its heading stays where it is.
The `root:` block of a definition applies to the scene's root element, and each value is an expression in the scene's own scope, so a `keyframes` entry such as `bg` can drive the root's `background`.
A binding written on the root tag, such as `data-bind-style="bg"`, reads the scene's values too, unless the scene sits inside a component of your own, which happens only when you put the composition inside a component or one scene inside another.
The binding then reads that component, where `bg` does not exist, so the `root:` block is the form that works in both cases.
Development builds warn when a binding on the root tag of a scene inside a component of your own uses a value that belongs to the scene (WF-521 from WildflowerJS, or KN-154 for one of Kinetic's own values in a scene inside a scene).
`root:` also takes `class`, `attr`, `show` and `directives`, and Bindings on a component's root (/docs/components#root-bindings) has the rules.

```html
<div class="layer" data-component="backdrop" data-start="0" data-duration="6">
    <h1>Launch</h1>
</div>
```

```javascript
scene('backdrop', {
    keyframes: {
        bg: { at: [0, 2.6, 5.6], to: ['#0b0f1a', '#181030', '#0b0f1a'] },
    },
    root: { style: { background: 'bg' } },
});
```

The Launch Title demo (/demos/kinetic-title/) animates its backdrop with a color track of the same kind, on a layer inside its scene.

## One scene, several clips

Three name cards follow one another, each with its own name, role and color, all from one scene.
A registered scene runs on every element whose `data-component` is the scene's name, and each clip counts its own `local` from its own `data-start`.
Text that the scene only animates goes in each clip's markup, as the names do here.
A value the scene computes from is a prop on the clip element, `data-prop-role="'Director'"`, which the scene declares in `props` and a computed reads as `this.props.role` (a binding reads `props.role`).
Text is always quoted, one word or many, as `'Director'` and `'#892dbf'` are, since a bare word names a value; a number, `true` and `false` go bare.
A color for each clip goes on the scene's own root through `root: { style: { background: 'background' } }`, from a computed that reads `this.props.color`, and `presence` fades each card on the same root.
`inputs` are composition-wide, so every clip of a scene reads the same values, and for values that change from clip to clip, each clip takes its own props, as this pattern does.
The stylesheet needs `.card { position: absolute; left: 80px; bottom: 80px; padding: 18px 28px; color: #fff; }`.

```html
<div class="card" data-component="name-card" data-start="0" data-duration="2" data-prop-role="'Director'" data-prop-color="'#892dbf'">
    <div data-bind-style="slide"><h2>Ada Lovelace</h2><p data-bind="role"></p></div>
</div>
<div class="card" data-component="name-card" data-start="2" data-duration="2" data-prop-role="'Engineer'" data-prop-color="'#2d5fbf'">
    <div data-bind-style="slide"><h2>Grace Hopper</h2><p data-bind="role"></p></div>
</div>
<div class="card" data-component="name-card" data-start="4" data-duration="2" data-prop-role="'Mathematician'" data-prop-color="'#bf6a2d'">
    <div data-bind-style="slide"><h2>Katherine Johnson</h2><p data-bind="role"></p></div>
</div>
```

```javascript
scene('name-card', {
    props: {
        role: { type: String, default: '' },
        color: { type: String, default: '#0b0f1a' },
    },
    edges: { enter: 0.4, exit: 0.4 },
    root: { style: { background: 'background', opacity: 'presence' } },
    keyframes: {
        slide: { translateX: { at: [0, 0.5], to: [-40, 0], ease: 'power3.out' } },
    },
    computed: {
        background() { return this.props.color; },
        role() { return typewriter(this.local - 0.3, this.props.role, 24); },
    },
});
```

No demo uses this pattern yet.

## A push between two scenes

A title card gives way to a counter, which pushes it out to the left as it comes in from the right.
The second clip starts 0.6 seconds before the first ends, with `data-start="intro - 0.6"`, and `data-clip-transition` turns that overlap into a push.
The overlap is the push's length, so a change to the first clip's duration moves the push with it.
Kinetic writes `translate` on both clip elements during the overlap and removes it after, and each scene's own motion stays on the elements inside it.
The ease is `power3.inOut`, and without one a transition takes `power2.inOut`.

```html
<div id="intro" class="layer" data-component="title" data-start="0" data-duration="3">
    <h1 data-bind-style="rise">Northwind</h1>
</div>
<div class="layer" data-component="numbers" data-start="intro - 0.6" data-duration="3.6"
     data-clip-transition="push from-right power3.inOut">
    <h2 data-bind="orders"></h2>
</div>
```

```javascript
scene('title', {
    keyframes: {
        rise: { opacity: { at: [0.2, 0.8], to: [0, 1] }, translateY: { at: [0.2, 0.8], to: [40, 0], ease: 'power3.out' } },
    },
});

scene('numbers', {
    computed: {
        orders() { return format(Math.round(interpolate(this.local, [0.6, 2], [0, 48200], { ease: 'power2.out' }))) + ' orders'; },
    },
});
```

No demo uses this pattern yet.

## An iris into the next scene

A photo of a harbour gives way to a photo of a market, which opens from a point at the center of the frame.
`data-clip-transition="iris power2.out"` on the second clip grows a `clip-path: circle()` on it over the 0.8 seconds it overlaps the first, until the circle reaches the corners.
The first clip stays as it is underneath until its own window ends.
Both clips use one scene that drifts each photo 8% larger over four seconds.
The drift goes on the layer inside the clip, so it scales the photo and leaves the circle on the clip at its own size.

```html
<div id="harbour" class="layer" data-component="still" data-start="0" data-duration="3">
    <div class="layer" data-bind-style="drift">
        <img src="harbour.jpg" alt="" style="width: 100%; height: 100%; object-fit: cover">
    </div>
</div>
<div class="layer" data-component="still" data-start="harbour - 0.8" data-duration="3.8"
     data-clip-transition="iris power2.out">
    <div class="layer" data-bind-style="drift">
        <img src="market.jpg" alt="" style="width: 100%; height: 100%; object-fit: cover">
    </div>
</div>
```

```javascript
scene('still', {
    keyframes: {
        drift: { scale: { at: [0, 4], to: [1, 1.08] } },
    },
});
```

No demo uses this pattern yet.

## A title that wipes in and fades out

A title wipes in from the left over a backdrop whose color shifts, holds, and fades out.
`data-clip-enter` and `data-clip-exit` take a length of their own, since no clip comes before or after the title.
The wipe takes 0.6 seconds, and the fade takes 12 frames, which at 30 fps is 0.4 seconds.
The title needs no scene, since an element with `data-start` is a clip, and Kinetic writes the wipe's `clip-path` and the fade's `opacity` on it directly.
The backdrop is a sibling that runs for the whole composition, and `data-clip-enter` and `data-clip-exit` do not look at siblings.
The stylesheet needs `.title { position: absolute; left: 120px; top: 300px; margin: 0; font-size: 96px; color: #fff; }`.

```html
<div class="layer" data-component="sky" data-start="0" data-duration="6"></div>
<h1 class="title" data-start="1" data-duration="4"
    data-clip-enter="wipe from-left 0.6" data-clip-exit="fade 12f">Launch</h1>
```

```javascript
scene('sky', {
    keyframes: {
        bg: { at: [0, 6], to: ['#0b0f1a', '#181030'] },
    },
    root: { style: { background: 'bg' } },
});
```

No demo uses this pattern yet.

## A sequence of transitions

Four cards follow one another, each joined to the next by a different transition, and the first fades in and the last fades out.
Each card starts 0.6 seconds before the previous one ends, which at 30 fps is 18 frames, so every overlap starts and ends on a whole frame, and development builds warn about a clip that does not (KN-114).
The lengths of `data-clip-enter` and `data-clip-exit` are written in frames, `18f`, to match.
The cards are plain HTML, and the transitions need no scene and no script.
The last card ends with the composition, at 6 seconds.
The stylesheet needs `.card { display: flex; align-items: center; justify-content: center; }` and a background color for each card.

```html
<div id="one" class="layer card" data-start="0" data-duration="2" data-clip-enter="fade 18f"><h2>Plan</h2></div>
<div id="two" class="layer card" data-start="one - 0.6" data-duration="2" data-clip-transition="push from-bottom"><h2>Build</h2></div>
<div id="three" class="layer card" data-start="two - 0.6" data-duration="2" data-clip-transition="clock"><h2>Ship</h2></div>
<div class="layer card" data-start="three - 0.6" data-duration="1.8" data-clip-transition="zoom" data-clip-exit="fade 18f"><h2>Again</h2></div>
```

No demo uses this pattern yet.

## A transition inside a scene

A quiz card turns over from its question to its answer, inside one scene.
`transition(kind, p)` returns the incoming and outgoing style objects of a kind at a progress p, the same values the attributes write, for a part of a scene that is no clip.
`ramp()` gives the eased progress from 1.6 to 2.2 seconds, the question takes the outgoing side of a `flip`, and the answer takes the incoming side.
At p = 0 the answer stands edge-on, where it cannot be seen, and at p = 1 the question stands edge-on in its place.
`perspective` on the scene's root makes the turn read as depth.
The stylesheet needs `.face { display: flex; align-items: center; justify-content: center; background: #102040; color: #fff; }`.

```html
<div class="layer" data-component="quiz" data-start="0" data-duration="4" style="perspective: 1200px">
    <div class="layer face" data-bind-style="question"><h2>What is the capital of Australia?</h2></div>
    <div class="layer face" data-bind-style="answer"><h2>Canberra</h2></div>
</div>
```

```javascript
scene('quiz', {
    computed: {
        turn() { return transition('flip', ramp(this.local, 1.6, 2.2, 'power2.inOut')); },
        question() { return this.turn.out; },
        answer() { return this.turn.in; },
    },
});
```

No demo uses this pattern yet.

## Still effects with an SVG filter

A title card sits over a stippled sky, and a photo beside it is printed as a halftone.
Both effects are SVG filters on ordinary HTML, which suits HTML that does not change, since `effect()` takes only an image, a video or a canvas.
The stipple compares fine noise from `feTurbulence` with the brightness under it and puts ink where the noise is higher.
The halftone does the same with a field of dot cones, white at each dot's center and black at its cell's corners, so a dark area gets large dots.
The field is a PNG the scene draws once on a canvas and sets on the `feImage` itself, since a binding does not accept an SVG `data:` URL in an attribute.
The stylesheet needs `.sky { position: absolute; inset: 0; background: linear-gradient(#0a0a10, #6b6b78 45%, #f4f4f4); }` and `.photo { position: absolute; right: 0; top: 0; width: 50%; height: 100%; }`.

```html
<svg width="0" height="0" style="position: absolute" aria-hidden="true"><defs>
    <filter id="stipple" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" result="noiseRGB"/>
        <feColorMatrix in="noiseRGB" type="luminanceToAlpha" result="noiseRaw"/>
        <feComponentTransfer in="noiseRaw" result="noise"><feFuncA type="linear" slope="3.2" intercept="-1.1"/></feComponentTransfer>
        <feComposite in="noise" in2="lum" operator="arithmetic" k2="1" k3="-1" k4="0.5" result="diff"/>
        <feComponentTransfer in="diff" result="ink"><feFuncA type="linear" slope="16" intercept="-8"/></feComponentTransfer>
        <feFlood flood-color="#132a4a" result="inkColour"/>
        <feComposite in="inkColour" in2="ink" operator="in" result="dots"/>
        <feFlood flood-color="#f6efe2" result="paper"/>
        <feMerge><feMergeNode in="paper"/><feMergeNode in="dots"/></feMerge>
    </filter>
    <filter id="halftone" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>
        <feImage id="dot-field" x="0" y="0" width="640" height="720" preserveAspectRatio="none" result="fieldRGB"/>
        <feColorMatrix in="fieldRGB" type="luminanceToAlpha" result="field"/>
        <feComposite in="field" in2="lum" operator="arithmetic" k2="1" k3="-1" k4="0.45" result="diff"/>
        <feComponentTransfer in="diff" result="ink"><feFuncA type="linear" slope="14" intercept="-7"/></feComponentTransfer>
        <feFlood flood-color="#1b1530" result="inkColour"/>
        <feComposite in="inkColour" in2="ink" operator="in" result="dots"/>
        <feFlood flood-color="#f3ead8" result="paper"/>
        <feMerge><feMergeNode in="paper"/><feMergeNode in="dots"/></feMerge>
    </filter>
</defs></svg>

<div class="layer" data-component="night-card" data-start="0" data-duration="4">
    <div class="sky" data-bind-style="sky"></div>
    <img class="photo" src="tree.jpg" alt="" data-bind-style="photo">
    <h1 class="title">Night Shift</h1>
</div>
```

```javascript
// A field of dot cones on a grid turned by `angle`, `cell` px apart, as a PNG.
function dotField(w, h, cell, angle) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d'), img = g.createImageData(w, h);
    const a = angle * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), r = cell * Math.SQRT1_2;
    for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i += 4) {
            const u = x * cos + y * sin, v = y * cos - x * sin;
            const d = Math.hypot(u - (Math.floor(u / cell) + 0.5) * cell, v - (Math.floor(v / cell) + 0.5) * cell);
            img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(255 * Math.max(0, 1 - d / r));
            img.data[i + 3] = 255;
        }
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
}

scene('night-card', {
    init() {
        document.getElementById('dot-field').setAttribute('href', dotField(640, 720, 12, 45));
    },
    computed: {
        // Each filter is on only inside the clip's window: the clip starts at 0, and
        // after it local holds at its length, so remaining is 0 there.
        on() { return this.remaining > 0; },
        sky() { return { filter: this.on ? 'url(#stipple)' : 'none' }; },
        photo() { return { filter: this.on ? 'url(#halftone)' : 'none' }; },
    },
});
```

Two rules keep filters like these cheap and correct.

- A filter runs again in full whenever anything in the filtered element, or a parameter of the filter, changes, so keep these filters for stills.
  The title is a sibling of the filtered elements, so it can move without running either filter again.
  For an effect that changes on every frame, use `effect()` on an image, a video or a canvas (the next pattern).
- A filter with `feFlood`, `feImage` or `feTurbulence` paints even inside a clip hidden with `visibility: hidden`.
  Kinetic hides a clip outside its window so that nothing in it paints.
  A runtime that hides with `visibility` alone would let the stippled sky show over the scenes before and after the card, so the scene turns each filter on only inside the clip's window, as `on` does here.

No demo uses this pattern yet.

## A luma matte

A layer shows through where a matte is bright and is hidden where it is dark, and the matte moves, so a photo is revealed by a sweep with a soft edge.
`mask-image` on the layer takes the matte, a gradient here, or an image such as a photograph of smoke, with `mask-mode: luminance` so its brightness is the matte rather than its alpha.
The gradient is twice the layer's width with a soft step in its middle, and a `maskPosition` track slides it across: at 100% the dark half covers the layer and at 0% the bright half does.
Nothing here is an SVG `<mask>` referenced by id, which the page draws and a render does not.

```html
<div class="layer" data-component="reveal" data-start="0" data-duration="4">
    <img class="photo" src="harbour.jpg" alt="" data-bind-style="matte">
</div>
```

```css
.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
         mask-image: linear-gradient(to right, #fff 45%, #000 55%); mask-mode: luminance;
         mask-size: 200% 100%; mask-repeat: no-repeat; }
```

```javascript
scene('reveal', {
    keyframes: {
        matte: { maskPosition: { at: [0.3, 1.8], to: [100, 0], unit: '%', ease: 'power2.inOut' } },
    },
});
```

## An alpha matte and a feathered mask

A soft-edged shape cut from a layer: `mask-image` with a gradient from opaque to transparent, whose width is the feather; a disc here, grown by a `maskSize` track until it clears the frame.
For any other shape with a feather, an SVG image is the mask, with the shape blurred by a filter inside the image, since a filter works in an image used this way, where an SVG `<mask>` referenced by id is not drawn in a render.

```css
.disc { mask-image: radial-gradient(circle, #000 40%, transparent 70%); mask-position: center; mask-repeat: no-repeat; }
.cut  { mask-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='b'><feGaussianBlur stdDeviation='10'/></filter><path d='M 30 100 L 100 20 L 170 100 L 100 180 Z' fill='white' filter='url(%23b)'/></svg>");
        mask-size: 100% 100%; }
```

```javascript
scene('iris', {
    keyframes: {
        disc: { maskSize: { at: [0.3, 1.5], to: ['20% 20%', '300% 300%'], ease: 'power2.in' } },
    },
});
```

## A paper texture and a light leak

The scene under paper: a texture layer over everything, blended with `multiply`, darkens the scene by the paper's grain and leaves white untouched; a light leak is a warm gradient blended with `screen`, which lightens, moved by a track so it drifts across the frame.
Both are plain layers above the scene and under the pointer, and both draw the same in the page and in a render.
The paper here is an SVG image of turbulence as a data URL, so the pattern needs no file; a scan of real paper does better.

```html
<div class="layer" data-component="texture" data-start="0" data-duration="6">
    <div class="paper"></div>
    <div class="leak" data-bind-style="leak"></div>
</div>
```

```css
.paper { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: multiply;
         background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' seed='7'/><feColorMatrix values='0 0 0 0 0.84 0 0 0 0 0.8 0 0 0 0 0.72 0 0 0 0.35 0.65'/></filter><rect width='400' height='400' fill='white'/><rect width='400' height='400' filter='url(%23p)'/></svg>");
         background-size: 400px 400px; }
.leak  { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: screen;
         background: radial-gradient(circle at 30% 30%, rgba(255, 160, 80, 0.9), rgba(255, 120, 60, 0) 60%); }
```

```javascript
scene('texture', {
    keyframes: {
        leak: { translateX: { at: [0, 6], to: [-200, 200] }, opacity: { at: [0, 1, 5, 6], to: [0, 1, 1, 0] } },
    },
});
```

## An adjustment layer

An element over part of the stage with `backdrop-filter` changes everything beneath it in its area and nothing above: a grade on the footage under a title, a blur behind a panel, or a desaturated half that a track slides across.
It is the one layer an author places; the finish is the same thing over the whole frame.
A camera's world draws it flat with the layers under it, so it sits above the world, not inside it.

```html
<div class="layer" data-component="grade" data-start="0" data-duration="5">
    <div class="adjust" data-bind-style="adjust"></div>
</div>
```

```css
.adjust { position: absolute; top: 0; bottom: 0; left: 50%; right: 0; pointer-events: none; backdrop-filter: grayscale(1) contrast(1.3); }
```

```javascript
scene('grade', {
    keyframes: {
        adjust: { left: { at: [0.5, 2], to: [100, 50], unit: '%', ease: 'power2.inOut' } },
    },
});
```

## A halftone that moves

A photo turns into a halftone whose dots grow and turn as the scene runs.
`effect(canvas, { scene: this, source, kind })` draws the photo into the canvas through a WebGL shader after every seek, and `set()` changes the cell, the angle, the density and the colors on every frame for the cost of one draw.
The `<img>` is the source and stays hidden, and the canvas covers the layer.
The stylesheet needs `.fill { position: absolute; inset: 0; width: 100%; height: 100%; }`.

```html
<div class="layer" data-component="poster" data-start="0" data-duration="4">
    <img src="tree.jpg" alt="" hidden>
    <canvas class="fill"></canvas>
</div>
```

```javascript
scene('poster', {
    init() {
        this.fx = effect(this.element.querySelector('canvas'), {
            scene: this,
            source: this.element.querySelector('img'),
            kind: 'halftone',
            ink: '#1b1530',
            paper: '#f3ead8',
        });
    },
    seek(local) {
        const p = ramp(local, 0, 3, 'power2.inOut');
        this.fx.set({ cell: 18 - 8 * p, angle: 45 + 30 * p, density: p - 0.5 });
    },
});
```

The same scene with `kind: 'stipple'`, `'dither'` or `'duotone'` draws the other looks, and a `<video data-start>` as the source puts the effect on footage, drawn from the footage's frame on every seek.
`color: 'source'` prints each dot in the photo's color under it.

No demo uses this pattern yet.

## Crayon shading on flat shapes

Flat shapes get printed shading.
Here that is crayon stipple down one edge of a block, splatter thickening at a hill's edge, a sphere shaded from an offset light, and a stripe across the sky.
`shade(canvas, { kind, marks })` paints a field of how much ink each point gets from marks, and draws it as stipple, splatter, halftone or dither in the color of the field.
Each mark is cut to a shape with `clip` and falls off by an ease, and `fps: 2` gives the noise a new seed twice a second, so the specks change place twice a second and hold still between.
Each canvas fills the scene and sits above the shapes it shades.
A layer has one kind, so the splatter has a canvas of its own; marks of one kind belong on one layer, since each layer is one canvas and one WebGL context.
The stylesheet places the shapes where the marks expect them: `.block { position: absolute; left: 200px; top: 300px; width: 220px; height: 320px; background: #b2462e; }`, `.sun { position: absolute; left: 870px; top: 100px; width: 220px; height: 220px; border-radius: 50%; background: #e8a33d; }` and `.hill { position: absolute; inset: 0; background: #3f7a5c; clip-path: path('M0 560 C 320 420, 760 440, 1280 520 L 1280 720 L 0 720 Z'); }`.

```html
<div class="layer" data-component="park" data-start="0" data-duration="6">
    <div class="sun"></div>
    <div class="hill"></div>
    <div class="block"></div>
    <canvas class="fill"></canvas>
    <canvas class="fill spray"></canvas>
</div>
```

```javascript
scene('park', {
    init() {
        // The canvas is the 1280 x 720 stage, so the marks use the stage's px.
        shade(this.element.querySelector('canvas:not(.spray)'), { scene: this, kind: 'stipple', fps: 2, grade: 0.6, marks: (m) => {
            // One edge of a block: a band along its left side, falling off inward, cut to the block.
            // Walking down the screen from `from` to `to`, the block is on the left.
            m.band({ from: [200, 300], to: [200, 620], width: 50, side: 'left', ink: '#f3ead8', clip: { rect: [200, 300, 220, 320] } })
             // A sphere: shading that rises away from a light up and to the left, cut to the circle.
             .glow({ at: [930, 160], radius: 140, invert: true, ink: '#b2462e', amount: 0.7, falloff: 'smooth', clip: { circle: [980, 210, 110] } })
             // A stripe across the sky, falling off on both sides of its line.
             .band({ from: [0, 120], to: [1280, 90], width: 24, ink: '#ffffff', amount: 0.5 });
        } });
        // Splatter on its own layer, denser at the hill's top edge. The clip is the hill's
        // outline taken past the canvas on three sides, so only its top edge is in view.
        shade(this.element.querySelector('canvas.spray'), { scene: this, kind: 'splatter', fps: 2, marks: (m) => {
            m.edge({ width: 60, ink: '#2c5a46', falloff: 'power2.in', clip: { path: 'M-80 560 L0 560 C 320 420, 760 440, 1280 520 L1360 520 L1360 800 L-80 800 Z' } });
        } });
    },
});
```

The sphere's light sits up and to the left of the circle's center, so `invert` leaves that side bare and the far side shaded; `edge` follows any outline inward, here the hill's path.
`freeze` and `move` set what moving marks do between seeds, and need `fps` above 0.
By default (`freeze: 'seed'`) the marks are painted for every frame and the seed is kept, `freeze: 'all'` paints them once a seed so the whole texture holds still and jumps, and `move(t)` sets the canvas's transform so the specks move with marks that all move together, as in a tunnel of growing rings: `{ fps: 2, move: (t) => ({ scale: Math.pow(1.5, t), origin: [640, 360] }) }`.

No demo uses this pattern yet.

## Tilt-shift focus, a light leak and grain at the edges

A street of HTML shapes is made to look like a model.
It is sharp across the middle and blurred toward the top and the bottom, with a warm light leak drifting in from a corner and grain heavier toward the frame's edges.
`blur(element, { radius, marks })` blurs what is under an element where the marks paint and leaves it sharp where they do not, and `shade()` with `kind: 'light'` paints the marks as light, blended by screen, and with `kind: 'grain'` as noise as strong as the marks, blended by overlay.
The marks are the same ones shading uses: two bands for the tilt-shift, a glow for the leak, and an inverted glow for the grain, none at the center and full at the corners.
The `.over` element and both canvases fill the scene above the street; the blur goes under the light and the grain, so they stay sharp.

```html
<div class="layer" data-component="model" data-start="0" data-duration="6">
    <div class="street"></div>
    <div class="over fill"></div>
    <canvas class="fill leak"></canvas>
    <canvas class="fill grain"></canvas>
</div>
```

```javascript
scene('model', {
    init() {
        const q = (s) => this.element.querySelector(s);
        blur(q('.over'), { scene: this, radius: 12, marks: (m) => m
            .band({ from: [0, 0], to: [1280, 0], width: 300, side: 'right', falloff: 'smooth' })
            .band({ from: [1280, 720], to: [0, 720], width: 300, side: 'right', falloff: 'smooth' }) });
        shade(q('canvas.leak'), { scene: this, kind: 'light', marks: (m, t) => m
            .glow({ at: [1180 - t * 40, 60], radius: 420, ink: '#ff9a4a', amount: 0.6, falloff: 'smooth' }) });
        shade(q('canvas.grain'), { scene: this, kind: 'grain', fps: 30, opacity: 0.5, marks: (m) => m
            .glow({ at: [640, 360], radius: 734, invert: true, falloff: 'power2.in' }) });
    },
});
```

Walking right from `[0, 0]`, the frame is on the right, so `side: 'right'` falls inward from the top; the second band walks left along the bottom, so its right points up, into the frame as well.
The inverted glow's radius, 734 px, is the distance from the center to a corner, so the grain is full there.
The mask blends between sharp and fully blurred, and a `smooth` falloff over 300 px takes the street from fully blurred at the frame's edge to sharp, with no visible line.
`fps: 30` gives the grain a new pattern every frame at 30 fps, as film grain does; `fps: 12` would hold each for a few frames, and without `fps` it holds still.

No demo uses this pattern yet.

## Hand-drawn wobble on shapes

A sun and a hill wobble at their edges, and the wobble changes eight times a second.
`boil(d, options)` moves an SVG path's outline along its normals by noise and returns the new path data, which a computed returns as `{ d }` for the path's `data-bind-attr`.
It steps its noise's seed 8 times a second (`fps: 8`) and takes the scene's local time as `t`, so each wobble holds for an eighth of a second and then changes.

```html
<div class="layer" data-component="sketch" data-start="0" data-duration="6">
    <svg class="fill" viewBox="0 0 1280 720">
        <path data-bind-attr="sun" fill="#e8a33d"></path>
        <path data-bind-attr="hill" fill="#3f7a5c"></path>
    </svg>
</div>
```

```javascript
const SUN = 'M 980 90 A 110 110 0 1 1 979.99 90 Z';
const HILL = 'M -20 560 C 320 420, 760 440, 1300 520 L 1300 740 L -20 740 Z';

scene('sketch', {
    computed: {
        sun() { return { d: boil(SUN, { amount: 4, scale: 40, fps: 8, t: this.local }) }; },
        hill() { return { d: boil(HILL, { amount: 3, scale: 60, fps: 8, t: this.local, seed: 2 }) }; },
    },
});
```

`amount` is about the largest move in px and `scale` the length along the outline over which the noise changes, in px; a different `seed` keeps two shapes from wobbling in step.
`boil()` works on paths only, so HTML text does not wobble; draw a title as a path, or with `text()` on a canvas and through the boil effect.
A canvas, an image or a video takes the same wobble from `effect(canvas, { source, kind: 'boil', fps: 8 })`, a new seed 8 times a second.

No demo uses this pattern yet.

## A title that swells in weight

A title's letters thicken one after another and thin again, so the peak moves along the word, and on the way the line widens and narrows with them.
`text(canvas, { scene: this, font, lines })` draws the line from Work Sans's outlines, which the outline baker writes as `work-sans-outlines.js` when given the characters SPRING and the variable name `WORK_SANS`; each letter takes its own weight from `letter(i)`.
Animating `font-variation-settings` on page text can stutter while the browser prepares each new weight; `text()` draws outlines, so it prepares none.
The canvas fills the scene with the `.fill` rule from the halftone pattern, and the outlines' script loads before the scene's.

```html
<script src="work-sans-outlines.js"></script>
<div class="layer" data-component="swell" data-start="0" data-duration="4">
    <canvas class="fill"></canvas>
</div>
```

```javascript
scene('swell', {
    init() {
        text(this.element.querySelector('canvas'), { scene: this, font: window.WORK_SANS, lines: (m, t) => {
            m.line('SPRING', { at: [640, 360], size: 120, align: 'center', valign: 'middle', tracking: 0.08, color: '#26282d' },
                (i) => ({ wght: interpolate(t - stagger(i, 6, { each: 0.08 }), [0.5, 1.5, 2.5], [300, 900, 300], { ease: 'sine.inOut' }) }));
        } });
    },
});
```

Each letter starts 0.08 s after the one before it, so the swell runs along the word; with `spacing: 'fixed'` each letter keeps its slot and the line keeps its width.

No demo uses this pattern yet.

## A Lottie logo sting

A logo animation exported from After Effects plays once as the scene opens and holds on its last frame, and a tagline fades in under it.
lottie-web plays the animation, and `lottie(anim, { scene: this, start })` hands it to Kinetic's clock, so a scrub, a check and a render each show the frame for their time.
The page loads lottie-web after Kinetic, and Kinetic waits for `logo.json` to load before the first frame.
The stylesheet gives `.mark` the logo's size.

```html
<script defer src="https://cdn.jsdelivr.net/npm/lottie-web@5.13.0/build/player/lottie.min.js"></script>

<div class="layer" data-component="sting" data-start="0" data-duration="3">
    <div class="mark"></div>
    <p class="tagline" data-bind-style="tagline">Made with care</p>
</div>
```

```javascript
scene('sting', {
    init() {
        this.anim = window.lottie.loadAnimation({
            container: this.element.querySelector('.mark'),
            renderer: 'svg', loop: false, autoplay: false, path: 'logo.json',
        });
        lottie(this.anim, { scene: this, start: 0.2 });
    },
    computed: {
        tagline() { return { opacity: ramp(this.local, 1.6, 2.2) }; },
    },
    destroy() { this.anim.destroy(); },
});
```

The animation holds its first frame until 0.2 s, then plays on the scene's own time, and after its last frame it holds that frame for the rest of the clip.
`scene: this` puts the animation on the scene's own time, and `lottie()` goes in the same task as `loadAnimation()`, so a failed load is heard.
The animation's `destroy()` in the scene's frees it, since lottie-web keeps every animation until then, and Kinetic lets go of it at the same time.
`rate: 1.5` plays it faster, and `loop: true` starts it again at its end for a mark that keeps moving.
The `'canvas'` renderer suits an animation with many shapes, and it renders the same way.

No demo uses this pattern yet.

## A looping sticker

An animated GIF sticker waves in a corner for the whole composition.
`animatedImage()` decodes the file once, made at the top of the file so the first frame waits for it, and the scene draws the frame for its time into a canvas on every seek.
A browser without WebCodecs' `ImageDecoder` shows the file in a plain `<img>` instead, which plays on the browser's own clock, close to the render for a preview.
The stylesheet gives `.sticker` its size and place.

```html
<div class="layer" data-component="sticker" data-start="0" data-duration="6">
    <canvas class="sticker" width="240" height="240"></canvas>
</div>
```

```javascript
const wave = 'ImageDecoder' in window ? animatedImage('wave.gif') : null;

scene('sticker', {
    init() {
        if (wave) return;
        const img = document.createElement('img');
        img.src = 'wave.gif';
        img.alt = '';
        img.className = 'sticker';
        this.element.querySelector('canvas').replaceWith(img);
    },
    seek(local) {
        if (wave) wave.draw(this.element.querySelector('canvas'), local);
    },
});
```

The canvas has the GIF's own width and height, since `draw()` stretches the frame over the canvas, and CSS sets the size it shows at.
The sticker plays as browsers play the GIF, looping when the file loops; `draw(canvas, local, { loop: true })` loops it whatever the file says, and `{ loop: false }` holds the last frame after one play.
Keep a sticker small: every frame is kept decoded, its width × height × 4 bytes.
A GIF on another origin needs CORS headers from its server.
A render needs Chrome, which has `ImageDecoder`.

No demo uses this pattern yet.

## Bars that grow in

Bars grow from the left one after another, the top one first, while the number beside each bar counts up.
Each bar's growth is `interpolate(local, [start, end], [0, 1], { ease })`, a number that is 0 before `start` and 1 after `end`.
Each bar starts `slot * 0.12` seconds after the first, so the bars grow in top first when the rows are listed largest first.
A width is a string with its unit.
The number beside the bar is the value times the same growth, written by `format()`, which uses `en-US` unless `locale` is passed, so the text reads the same on every render machine.

```html
<div class="layer" data-component="bars" data-start="0" data-duration="4">
    <div data-list="bars" data-key="id">
        <template>
            <div style="display: flex; align-items: center; height: 56px">
                <span style="width: 120px" data-bind="name"></span>
                <div style="height: 36px" data-bind-style="bar"></div>
                <b data-bind="shown"></b>
            </div>
        </template>
    </div>
</div>
```

```javascript
const PLOT = 600;   // px, the longest bar
const ROWS = [
    { id: 'atlas', name: 'Atlas', color: '#9d7bff', value: 5800000 },
    { id: 'birch', name: 'Birch', color: '#5fa6a6', value: 4200000 },
    { id: 'cedar', name: 'Cedar', color: '#e8b416', value: 3100000 },
];

scene('bars', {
    computed: {
        bars() {
            const max = Math.max(...ROWS.map((r) => r.value));
            return ROWS.map((row, slot) => {
                const grown = interpolate(this.local, [0.4 + slot * 0.12, 1.6 + slot * 0.12], [0, 1], { ease: 'power3.out' });
                return {
                    id: row.id,
                    name: row.name,
                    bar: { width: (PLOT * row.value / max * grown).toFixed(2) + 'px', background: row.color },
                    shown: format(row.value * grown, { notation: 'compact', maximumFractionDigits: 1 }),
                };
            });
        },
    },
});
```

The Sales Chart demo (/demos/kinetic-chart/) grows its bars in this way before the race starts.

## A bar race

Bars for three products change length and swap places as the years pass from 2021 to 2024, with the year shown above them.
`rank(t, rows, by)` takes `t` as a fractional keyframe.
Whole numbers are the keyframes that `by(row, k)` reads, here an index into each row's `values`, and a fraction blends the two neighbouring values and the two orderings.
`year` maps the clock onto that `t` with `interpolate`, and holds each year for its first 45 percent before easing to the next.
Each result's `position` (0 is first) times the row height gives the row's `translateY`, and its blended `value` sets the bar's width.

```html
<div class="layer" data-component="race" data-start="0" data-duration="8">
    <h2 data-bind="label"></h2>
    <div style="position: relative" data-list="bars" data-key="id">
        <template>
            <div style="position: absolute; top: 0; left: 0; display: flex; align-items: center; height: 56px" data-bind-style="style">
                <span style="width: 120px" data-bind="name"></span>
                <div style="height: 36px" data-bind-style="bar"></div>
            </div>
        </template>
    </div>
</div>
```

```javascript
const YEARS = [2021, 2022, 2023, 2024];
const RACE = [1, 7];     // seconds: the years roll from the first to the last
const ROW = 56;          // px per row
const PLOT = 600;        // px, the bars' full width
const SCALE = 6000000;   // the value that fills PLOT
const ROWS = [
    { id: 'atlas', name: 'Atlas', color: '#9d7bff', values: [3000000, 4200000, 5100000, 5800000] },
    { id: 'birch', name: 'Birch', color: '#5fa6a6', values: [4500000, 4400000, 4700000, 4900000] },
    { id: 'cedar', name: 'Cedar', color: '#e8b416', values: [2000000, 3800000, 5200000, 4000000] },
];

scene('race', {
    computed: {
        // 0 is 2021, 3 is 2024, and fractions fall between. Each year holds
        // for its first 45%, then the rows move to the next ordering.
        year() {
            const raw = interpolate(this.local, RACE, [0, YEARS.length - 1]);
            const k = Math.floor(raw);
            return k + interpolate(raw - k, [0.45, 1], [0, 1], { ease: 'power2.inOut' });
        },
        label() { return String(YEARS[Math.round(this.year)]); },
        bars() {
            return rank(this.year, ROWS, (r, k) => r.values[k]).map(({ row, value, position }) => ({
                id: row.id,
                name: row.name,
                style: styleAt(this.local, { translateY: position * ROW }),
                bar: { width: (PLOT * value / SCALE).toFixed(2) + 'px', background: row.color },
            }));
        },
    },
});
```

The Sales Chart demo (/demos/kinetic-chart/) races its product lines across six years this way.

## An axis

Vertical lines mark round values from 0 to 6M, each labeled with a short number such as 2M.
`ticks(min, max, count)` returns about `count` round values from at or below `min` to at or above `max`, so the last tick is a scale that covers the largest value.
Bar widths computed as `PLOT * value / scaleMax` keep the axis and the bars on one scale for the whole race.
The last tick replaces the constant `SCALE` in the race above.
`format(v, { notation: 'compact' })` writes the labels, such as `2M`.

```html
<div class="layer" data-component="axis" data-start="0" data-duration="4">
    <div style="position: relative; height: 200px" data-list="axis" data-key="key">
        <template>
            <div style="position: absolute; top: 0; bottom: 0; border-left: 1px solid #888" data-bind-style="style">
                <span data-bind="label"></span>
            </div>
        </template>
    </div>
</div>
```

```javascript
const PLOT = 600;
const VALUES = [3100000, 4200000, 5800000];

scene('axis', {
    computed: {
        axisTicks() { return ticks(0, Math.max(...VALUES), 5); },   // [0, 2000000, 4000000, 6000000]
        scaleMax() { const t = this.axisTicks; return t[t.length - 1]; },
        axis() {
            return this.axisTicks.map((v) => ({
                key: v,
                label: format(v, { notation: 'compact' }),
                style: { left: (PLOT * v / this.scaleMax) + 'px' },
            }));
        },
    },
});
```

The Sales Chart demo (/demos/kinetic-chart/) draws its axis from the largest value in any year.

## A pie from data

A donut chart fills clockwise, its four slices growing out together.
Kinetic has no chart module: each slice's angles come from a running sum of the shares, worked out once beside the scene, and `shape('sector')` draws the slice.
The slices are paths inside an `<svg>`, so they are a pool (see "Shapes from data inside an SVG").
`seek(local)` multiplies every angle by one `ramp()`, so the pie fills from the top; give each slice its own `ramp()` delayed by `stagger()` to grow them one after another.

```html
<div class="layer" data-component="pie" data-start="0" data-duration="4">
    <svg viewBox="0 0 1280 720" width="1280" height="720">
        <g data-pool="slices" data-key="id"><template><path data-bind-attr="attrs"></path></template></g>
    </svg>
</div>
```

```javascript
const DATA = [
    { label: 'Solar', value: 31, color: '#f2c14e' },
    { label: 'Wind', value: 24, color: '#5fd3c6' },
    { label: 'Hydro', value: 18, color: '#4280a2' },
    { label: 'Other', value: 27, color: '#aa3de6' },
];

// Each slice's start and end in degrees, clockwise from the top.
const TOTAL = DATA.reduce((sum, d) => sum + d.value, 0);
let from = 0;
const SLICES = DATA.map((d, id) => {
    const to = from + (360 * d.value) / TOTAL, slice = { id, from, to, color: d.color };
    from = to;
    return slice;
});

scene('pie', {
    pools: { slices: {} },
    init() { for (const s of SLICES) this.pools.slices.add({ id: s.id, attrs: { d: '', fill: s.color } }); },
    seek(local) {
        const p = ramp(local, 0.3, 1.5, 'power2.inOut');
        for (const s of SLICES) {
            const d = shape('sector', { cx: 640, cy: 360, radius: 220, inner: 120, from: s.from * p, to: s.to * p });
            this.pools.slices.update(s.id, { attrs: { d, fill: s.color } });
        }
    },
});
```

At `p` 0 every slice is empty, since a sector whose `to` equals its `from` is `''`; at 1 the slices meet round the full circle.

## Data before frame 0

A list shows one name for each row of a data file, already filled in on the first frame.
A scene that reads a query lists it in `waitFor`, and frame 0 is not captured until the query has its rows.
Kinetic settles readiness after the first scan, the fonts, every `waitFor` query and the images under the scenes, and registers it at `window.__hf.buildReady.kinetic` for a renderer that waits on it.
`await wildflower.kinetic.ready()` is the same promise for code of your own.
Queries exist on the full tier only.
A query that fails is KN-131, and a `waitFor` entry that matches no query is KN-133.
Either one stops the render at its timeout.

```html
<div class="layer" data-component="chart" data-start="0" data-duration="6">
    <ul data-list="rows" data-key="id">
        <template><li data-bind="name"></li></template>
    </ul>
</div>
```

```javascript
// the full tier: wildflower.full.min.js
wildflower.query('sales', {
    from: 'data/sales.json',
    select: (data) => data.rows,
});

scene('chart', {
    waitFor: ['sales'],
    computed: {
        rows() { return wildflower.getQuery('sales').rows; },
    },
});
```

The Sales Chart (/demos/kinetic-chart/) and Captions on a Beat (/demos/kinetic-captions/) demos load their data this way.

## Captions from a transcript

A line of words appears dimmed, each word lights up as it is spoken, and the word being spoken swells a little.
`captions(t, words, options)` groups a transcript into lines at a sentence end, at a pause longer than `maxGap` seconds, or at `maxWords` or `maxChars`.
It returns the line current at `t`, with `empty: true` and no words between lines.
Each word carries a `state` of `past`, `active` or `future` and a `p`, its own progress from 0 to 1, so a word's style is a function of those two.
`hold` is how many seconds a line stays after its last word.
A `data-list` over the mapped words renders nothing while the line is empty.

```html
<div class="layer" data-component="captions" data-start="0" data-duration="13">
    <p data-list="lineWords" data-key="key">
        <template><span style="display: inline-block; margin: 0 0.2em" data-bind="text" data-bind-style="style"></span></template>
    </p>
</div>
```

```javascript
// a word-timed transcript: [{ id, text, start, end }, ...]
wildflower.query('words', { from: 'data/transcript.json' });

scene('captions', {
    waitFor: ['words'],
    computed: {
        line() { return captions(this.local, wildflower.getQuery('words').rows, { maxWords: 4, hold: 0.5 }); },
        lineWords() {
            return this.line.words.map((w) => {
                const lift = w.state === 'active' ? 1 - w.p : 0;
                return {
                    key: w.key,
                    text: w.text,
                    style: styleAt(this.local, { opacity: w.state === 'future' ? 0.3 : 1, scale: 1 + 0.08 * lift }),
                };
            });
        },
    },
});
```

`this.local` counts from the scene's own clip, so the words follow the clip, and a clip at `data-start="voice.start"` reads them from the voice's start.
`captions()` compares the times only with `t`, so with `data-media-start="12"` on the voice, a transcript timed from the start of the file reads `captions(this.local + 12, words)`.

The Captions on a Beat demo (/demos/kinetic-captions/) drives its caption line from a transcript this way.

### From a subtitle file

A URL `from` reads the response as JSON, so an `.srt` or `.vtt` file takes a function `from` that fetches the text and returns the words `srt()` reads from it.
The scene's `waitFor` holds frame 0 until they are in.

```javascript
wildflower.query('words', {
    from: () => fetch('subs.srt').then((r) => r.text()).then(srt)
});
```

## A pulse on the beat

A disc swells on each beat, and a ring of bars around it ripples and grows taller.
`beat(t, beats)` reads a beat file, an object whose `beats` array holds `{ time, strength }`, or that array itself, and returns a value from 0 to 1.
The value jumps to each beat's strength and decays from there, with a time constant of 0.2 s unless `{ decay }` is passed.
Multiplying a scale by `1 + 0.14 * pulse` swells an element on each beat.
A ring of bars takes its heights from `noise()` at an offset of each bar's own, scaled by the pulse.

```html
<div class="layer" data-component="pulse" data-start="0" data-duration="13">
    <div style="position: absolute; left: 50%; top: 50%; width: 0; height: 0" data-list="bars" data-key="key">
        <template><i style="position: absolute; left: -4px; top: -4px; width: 8px; background: #c9b8ff; transform-origin: 50% 0" data-bind-style="style"></i></template>
    </div>
    <div style="position: absolute; left: 50%; top: 50%; width: 180px; height: 180px; margin: -90px 0 0 -90px; border-radius: 50%; background: #9d7bff" data-bind-style="disc"></div>
</div>
```

```javascript
wildflower.query('beats', { from: 'data/beats.json', select: (file) => file.beats });

const BARS = 36;

scene('pulse', {
    waitFor: ['beats'],
    computed: {
        pulse() { return beat(this.time, wildflower.getQuery('beats').rows); },
        disc() { return styleAt(this.time, { scale: 1 + 0.14 * this.pulse }); },
        bars() {
            const out = [];
            for (let i = 0; i < BARS; i++) {
                const n = 0.5 + 0.5 * noise(i * 0.61 + this.time * 1.7, 11);
                const h = 18 + 70 * n * (0.35 + 0.65 * this.pulse);
                out.push({ key: i, style: { height: h.toFixed(1) + 'px', transform: 'rotate(' + (360 / BARS) * i + 'deg) translateY(112px)' } });
            }
            return out;
        },
    },
});
```

The Captions on a Beat demo (/demos/kinetic-captions/) pulses a disc and a ring of bars this way.

## Music under a scene

Music plays under a title for the whole composition, fading in over its first second and out over its last two.
The `<audio>` element sits inside the composition root with `data-start`, and the scene's code does not change for it.
`data-volume="0.8"` is about 2 dB down, and each fade runs from the clip's own start or end.
In the preview, the speaker button on the bar turns the sound on, since a browser plays sound only after a gesture on the page.
`render()` mixes the clip into the file's sound track.

```html
<audio id="music" src="music.mp3" data-start="0" data-duration="6" data-volume="0.8" data-fade-in="1" data-fade-out="2"></audio>
<div class="layer" data-component="title" data-start="0" data-duration="6">
    <h1 data-bind-style="heading">Northwind</h1>
</div>
```

```javascript
scene('title', {
    keyframes: {
        heading: {
            opacity:    { at: [0.5, 1.5], to: [0, 1] },
            translateY: { at: [0.5, 1.5], to: [30, 0], ease: 'power3.out' }
        }
    }
});
```

## A track shorter than the film

A 17.6 s track runs under a 40 s film as three audio clips laid end to end, each seam on a bar line, so the beat runs on unbroken.
An audio clip never loops (`loop` is not applied, KN-136), so the repeats are clips: each later one starts at a bar line of the film and plays the file from a bar line of the file, with `data-media-start`.
The track here is 114 BPM in 4, its first downbeat 0.499 s into the file: a bar is 4 × 60 / 114 = 2.105263 s, and the file holds 8 whole bars after the downbeat (0.499 + 8 bars = 17.341 s, inside its 17.6 s).
So the first clip plays the file from 0 to the end of bar 8, and each repeat plays bars 0 to 8 again, from the downbeat.
A seam's exact time is rarely on a frame: round each `data-start` to the nearest frame, and move the repeat's `data-media-start` by the same amount, so the music still meets the bar line exactly (`data-media-start` = downbeat + rounded start − exact seam).
At 30 fps the first seam, 17.341105 s, rounds to frame 520, 17.333333 s, so the second clip plays from 0.499 − 0.007772 = 0.491228 s into the file; the second seam, 34.183210 s, rounds to frame 1025, 34.166667 s, and the third plays from 0.482457 s.
A 30 ms fade at each side of a seam takes out the click, and the last clip fades out over the film's end.
The tempo goes on the first clip alone: `tempo()` reads the one clip with `data-tempo`, and its `at(n)` is arithmetic from that clip's downbeat, so it counts on past the clip's end through the repeats.

```html
<audio id="music" src="music.mp3" data-start="0" data-duration="17.333333" data-fade-out="0.03"
       data-tempo="114" data-downbeat="0.499" data-meter="4"></audio>
<audio id="music-2" src="music.mp3" data-start="17.333333" data-media-start="0.491228" data-duration="16.833334"
       data-fade-in="0.03" data-fade-out="0.03"></audio>
<audio id="music-3" src="music.mp3" data-start="34.166667" data-media-start="0.482457" data-duration="5.833333"
       data-fade-in="0.03" data-fade-out="2.5"></audio>
```

```javascript
const { tempo } = wildflower.kinetic;
const bar = (n) => tempo('music').at(n * 4);   // bar n's start in composition seconds, through every repeat
```

Listen to the seams before the film is done: a track whose last bars change (a fill, a cymbal) repeats better from an earlier bar line, and one with a long tail needs its repeat to start before the tail ends.

## A sound on a cut

A whoosh plays over a push from one clip to the next.
The push runs over the 0.6 s the second clip overlaps `intro`, and the whoosh starts at the same moment, `intro - 0.6`, for the same 0.6 s.
Both are timed from `intro`, so a change to its length moves the cut and its sound together.
An audio clip never counts as the clip a transition replaces, so the whoosh beside the two clips leaves the push as it is.

```html
<div id="intro" class="layer" data-start="0" data-duration="3">…</div>
<div class="layer" data-start="intro - 0.6" data-duration="3.6" data-clip-transition="push from-right power3.inOut">…</div>
<audio src="whoosh.wav" data-start="intro - 0.6" data-duration="0.6" data-volume="0.7"></audio>
```

## Bars that move with the music

Sixteen bars rise and fall with the music, the bass on the left and the treble on the right.
`spectrum(t, 16)` returns 16 levels from 0 to 1, from 20 Hz to 16 kHz on a logarithmic scale, for the frame nearest `t`, and each level becomes a bar's height.
Kinetic analyzes the decoded music once, before frame 0, so each frame reads a table and the bars come out the same in every render.
Each level is measured against its own loudest frame in the composition, and it falls over about 0.15 s after a sound stops.

```html
<audio id="music" src="music.mp3" data-start="0"></audio>
<div class="layer" data-component="bars" data-start="0" data-duration="6">
    <div class="bars" data-list="bars" data-key="key">
        <template><i data-bind-style="style"></i></template>
    </div>
</div>
```

```css
.bars { position: absolute; left: 240px; right: 240px; bottom: 120px; height: 300px; display: flex; align-items: flex-end; gap: 8px; }
.bars i { flex: 1; background: #9d7bff; }
```

```javascript
scene('bars', {
    computed: {
        bars() {
            return spectrum(this.time, 16).map((v, i) => ({ key: i, style: { height: (4 + 296 * v).toFixed(1) + 'px' } }));
        },
    },
});
```

## A pulse on the bass

A disc swells on each kick drum, and a glow behind it brightens.
`level(t, 'bass')` returns the music's level from 20 to 250 Hz at the frame nearest `t`, from 0 to 1, so the disc follows the drum the composition plays, with no beat file.
The level falls over about 0.15 s after each kick.
`level(t, 'bass', { clip: 'music' })` reads one clip alone, by its `id`, when other clips play beside it.
`beat()` gives a pulse from a beat file instead (A pulse on the beat).

```html
<audio id="music" src="music.mp3" data-start="0"></audio>
<div class="layer" data-component="kick" data-start="0" data-duration="6">
    <div class="glow" style="position: absolute; inset: 0; background: radial-gradient(circle, #9d7bff66, transparent 60%)" data-bind-style="glow"></div>
    <div class="disc" style="position: absolute; left: 50%; top: 50%; width: 180px; height: 180px; margin: -90px 0 0 -90px; border-radius: 50%; background: #9d7bff" data-bind-style="disc"></div>
</div>
```

```javascript
scene('kick', {
    computed: {
        bass() { return level(this.time, 'bass'); },
        disc() { return styleAt(this.time, { scale: 1 + 0.25 * this.bass }); },
        glow() { return { opacity: (0.2 + 0.8 * this.bass).toFixed(3) }; },
    },
});
```

## Many particles

Two hundred and forty small white dots drift slowly from side to side across the frame.
`init()` fills a pool once with positions from `random(seed)`.
`seek(local)` rewrites each entity's style with `update()` after every seek, with a drift from `noise()` at an offset of the entity's own.
Every seek flushes the page's pools before the frame is captured, so the DOM holds the seek's frame when the seek settles, and a pool added to the scene later is flushed the same way.
`random(seed)` and `noise(x, seed)` give the same values on every run, where `Math.random()` would give each render a different field (KN-141).
The pool needs a tier with pools, which is mini-pool and up.

```html
<div class="layer" data-component="dust" data-start="0" data-duration="6">
    <div data-pool="dust" data-key="id">
        <template><i style="position: absolute; left: 0; top: 0; border-radius: 50%; background: #fff" data-bind-style="style"></i></template>
    </div>
</div>
```

```javascript
const DUST = 240;
const SEED = 7;

scene('dust', {
    pools: { dust: {} },
    init() {
        const rnd = random(SEED);
        for (let i = 0; i < DUST; i++) {
            this.pools.dust.add({ id: i, x: rnd() * 1280, y: rnd() * 720, size: 1.5 + rnd() * 3, style: {} });
        }
    },
    seek(local) {
        this.pools.dust.forEach((d) => {
            const drift = noise(d.id * 0.37 + local * 0.12, SEED) * 36;
            this.pools.dust.update(d.id, {
                style: {
                    width: d.size + 'px',
                    height: d.size + 'px',
                    ...styleAt(local, { translateX: d.x + drift, translateY: d.y }),
                },
            });
        });
    },
});
```

The Launch Title demo (/demos/kinetic-title/) drifts 240 motes of dust behind its title this way.

## Particles from an emitter

A fountain throws sparks up from one point, forty a second, each falling back and fading over a second and a half.
Every particle the clip will ever have is made beside the scene, with its birth time and its speeds from `random(seed)`, and each one is a function of its age, `local - born`, so a seek to any time draws the right sparks.
A pool holds a fixed number of slots, and particle `i` lives in slot `i % SLOTS`.
`SLOTS` is the rate times the life, rounded up, plus one: a particle born just as the last one in its slot reaches the end of its life would otherwise find that one still alive by a rounding error, and one of the two would not be drawn.
A burst is the same with every birth time equal.

```html
<div class="layer" data-component="fountain" data-start="0" data-duration="5">
    <div data-pool="sparks" data-key="id">
        <template><i style="position: absolute; left: -4px; top: -4px; border-radius: 50%; background: #f2c14e" data-bind-style="style"></i></template>
    </div>
</div>
```

```javascript
const DURATION = 5;
const RATE = 40;      // particles a second
const LIFE = 1.5;     // seconds each one lives
const G = 900;        // px/s², pulling them back down
const SLOTS = Math.ceil(RATE * LIFE) + 1;

const rnd = random(9);
const SPARKS = Array.from({ length: Math.ceil(RATE * DURATION) }, (_, i) => ({
    born: i / RATE, vx: -120 + 240 * rnd(), vy: -620 - 160 * rnd(), size: 4 + 6 * rnd(),
}));
// A hidden slot writes the same properties a shown one does, so nothing a
// spark set at another time is left on it.
const HIDDEN = { width: '0px', height: '0px', opacity: '0', transform: 'none' };

scene('fountain', {
    pools: { sparks: {} },
    init() { for (let s = 0; s < SLOTS; s++) this.pools.sparks.add({ id: s, style: HIDDEN }); },
    seek(local) {
        const n = Math.floor(local * RATE + 1e-9);   // the newest particle born by now
        for (let s = 0; s < SLOTS; s++) {
            const p = SPARKS[n - ((((n - s) % SLOTS) + SLOTS) % SLOTS)];   // the newest one in slot s
            const age = p ? local - p.born : -1;
            if (!(age >= 0 && age < LIFE)) { this.pools.sparks.update(s, { style: HIDDEN }); continue; }
            const x = 640 + p.vx * age, y = 620 + p.vy * age + 0.5 * G * age * age;
            this.pools.sparks.update(s, {
                style: { width: p.size + 'px', height: p.size + 'px', opacity: (1 - age / LIFE).toFixed(3), ...styleAt(local, { translateX: x, translateY: y }) },
            });
        }
    },
});
```

Before the first particle, and in a slot whose index is above the newest particle's, the lookup finds no particle and the slot is hidden.
`update()` writes the properties it is given and leaves the rest, so a hidden slot writes every property a shown one does; with `opacity` alone a slot keeps the size and place of the spark it last showed, and a frame depends on the frames before it (`check()` reports it).
A position from the age in closed form, as here, or from `noise()` read at the age for a drift, keeps every frame independent of the ones before it.

## Rack focus across phrases

Five phrases hang at different depths, and as the focal plane moves from the back to the front, each phrase sharpens in turn while the others soften.
The front phrase, "the power of focus", is sharp at the end.
`focus(z, plane, { range, max })` returns the blur in px for a thing at depth `z` when the focal plane is at `plane`, 0 on the plane and `max` far from it.
The `plane` entry in `keyframes` is a single track, so the scene reads it as one number, `this.plane`.
The list goes on an element inside the scene, which reads the scene's values wherever the scene sits.
`perspective` on the field gives the phrases parallax and scale, so a far phrase is small as well as soft.
Each phrase costs one GPU filter, so this pattern suits a dozen elements, and the next two patterns cover hundreds.
The stylesheet needs `.field { position: absolute; inset: 0; perspective: 900px; transform-style: preserve-3d; }` and `.phrase { position: absolute; left: 50%; top: 50%; font-size: 72px; font-weight: 700; white-space: nowrap; }`.

```html
<div class="layer" data-component="phrases" data-start="0" data-duration="5">
    <div class="field" data-list="rows" data-key="key">
        <template><div class="phrase" data-bind="text" data-bind-style="style"></div></template>
    </div>
</div>
```

```javascript
// Depth is CSS translateZ pixels: 0 at the stage, negative away from the camera.
const PHRASES = [
    { key: 'a', text: 'the power of focus', z: 0,     x: 0,    y: 0 },
    { key: 'b', text: 'depth',              z: -300,  x: -340, y: -180 },
    { key: 'c', text: 'field',              z: -600,  x: 300,  y: 160 },
    { key: 'd', text: 'plane',              z: -900,  x: -120, y: 220 },
    { key: 'e', text: 'lens',               z: -1200, x: 380,  y: -220 },
];

scene('phrases', {
    keyframes: {
        // The focal plane comes from the back to the front over the clip.
        plane: { at: [0.5, 4], to: [-1200, 0], ease: 'power2.inOut' },
    },
    computed: {
        rows() {
            const plane = this.plane;
            return PHRASES.map((p) => {
                const blur = focus(p.z, plane, { range: 250, max: 14 });
                return {
                    key: p.key,
                    text: p.text,
                    style: {
                        transform: 'translate(-50%, -50%) translate3d(' + p.x + 'px, ' + p.y + 'px, ' + p.z + 'px)',
                        filter: 'blur(' + blur + 'px)',
                        opacity: String(1 - blur / 28),
                    },
                };
            });
        },
    },
});
```

The Showreel demo (/demos/kinetic-showreel/) racks through the fragments of its sentence this way in its focus scene.

## Depth bands for hundreds of elements

Four hundred and fifty motes sit in three layers at three depths, and as the focal plane moves, whole layers soften and sharpen.
Each band is a static pool inside a container, and the container's `filter` comes from a computed that calls `focus()` with `steps`.
`init()` places the motes once with `random(seed)` and nothing writes to them again, so the three container filters are the only styles that change from frame to frame.
`steps: 6` rounds a band's blur to one of six levels, so its filter is re-rasterised only when the level changes.
A mote's band is fixed when it is added.
The cost is three filters however many motes there are.
The stylesheet needs `.band { position: absolute; inset: 0; }` and `.mote { position: absolute; border-radius: 50%; background: #fff; }`.

```html
<div class="layer" data-component="bands" data-start="0" data-duration="5">
    <div class="band" data-bind-style="far"><div data-pool="far" data-key="id"><template><i class="mote" data-bind-style="style"></i></template></div></div>
    <div class="band" data-bind-style="mid"><div data-pool="mid" data-key="id"><template><i class="mote" data-bind-style="style"></i></template></div></div>
    <div class="band" data-bind-style="near"><div data-pool="near" data-key="id"><template><i class="mote" data-bind-style="style"></i></template></div></div>
</div>
```

```javascript
const BANDS = { far: -900, mid: -450, near: 0 };   // one depth per band
const PER_BAND = 150;

scene('bands', {
    pools: { far: {}, mid: {}, near: {} },
    keyframes: {
        plane: { at: [0.5, 4.5], to: [-900, 0], ease: 'power2.inOut' },
    },
    init() {
        const rnd = random(11);
        for (const name of Object.keys(BANDS)) {
            const scale = 1 + BANDS[name] / 1800;      // nearer bands have larger motes
            for (let i = 0; i < PER_BAND; i++) {
                const size = (2 + rnd() * 4) * scale;
                this.pools[name].add({ id: i, style: { left: (rnd() * 1280).toFixed(1) + 'px', top: (rnd() * 720).toFixed(1) + 'px', width: size.toFixed(1) + 'px', height: size.toFixed(1) + 'px' } });
            }
        }
    },
    computed: {
        far()  { return { filter: 'blur(' + focus(BANDS.far,  this.plane, { range: 300, steps: 6 }) + 'px)' }; },
        mid()  { return { filter: 'blur(' + focus(BANDS.mid,  this.plane, { range: 300, steps: 6 }) + 'px)' }; },
        near() { return { filter: 'blur(' + focus(BANDS.near, this.plane, { range: 300, steps: 6 }) + 'px)' }; },
    },
});
```

No demo uses this pattern yet.

## Bokeh particles with no filter

Three hundred points of light sit at different depths, and as the focal plane moves, each point out of focus becomes a soft disc that grows, the way a lens draws a point of light.
`focus()` with `max: 1` returns an amount of defocus, 0 on the plane and close to 1 far from it.
`seek()` writes each light's style from that amount through one static pool.
The disc is a radial gradient whose hard edge moves inward and whose size grows as the blur grows, so the softness comes from the gradient.
The pool writes 300 styles per seek, and none of them sets a filter.
The same pattern fits dust, stars, rain and city lights.
The stylesheet needs `.light { position: absolute; left: 0; top: 0; border-radius: 50%; }`.

```html
<div class="layer" data-component="bokeh" data-start="0" data-duration="5">
    <div data-pool="lights" data-key="id"><template><i class="light" data-bind-style="style"></i></template></div>
</div>
```

```javascript
const COUNT = 300;

scene('bokeh', {
    pools: { lights: {} },
    keyframes: {
        plane: { at: [0.5, 4.5], to: [-1000, 0], ease: 'power2.inOut' },
    },
    init() {
        const rnd = random(23);
        for (let i = 0; i < COUNT; i++) {
            this.pools.lights.add({ id: i, x: rnd() * 1280, y: rnd() * 720, z: -rnd() * 1000, base: 3 + rnd() * 3, hue: 30 + rnd() * 40, style: {} });
        }
    },
    seek(local) {
        const plane = this.plane;
        this.pools.lights.forEach((l) => {
            const blur = focus(l.z, plane, { range: 250, max: 1 });    // 0 sharp, 1 fully out of focus
            const size = l.base * (1 + 6 * blur);                       // the disc grows with the blur
            const edge = 100 - 70 * blur;                               // and its edge softens
            this.pools.lights.update(l.id, {
                style: {
                    width: size.toFixed(1) + 'px',
                    height: size.toFixed(1) + 'px',
                    ...styleAt(local, { translateX: l.x - size / 2, translateY: l.y - size / 2 }),
                    opacity: (1 - 0.6 * blur).toFixed(3),
                    background: 'radial-gradient(circle, hsl(' + l.hue.toFixed(0) + ' 90% 70%) ' + (edge - 30).toFixed(0) + '%, transparent ' + edge.toFixed(0) + '%)',
                },
            });
        });
    },
});
```

The Showreel demo (/demos/kinetic-showreel/) drifts its bokeh lights behind the phrases of its focus scene this way.

## A landing on a whole frame

A ball hangs in the air, drops to a line on the floor, and bounces twice more, each bounce shorter, squashing flat on every landing.
A render seeks to whole frames (a frame number divided by the frame rate), so a contact that falls between two frames is never drawn.
The frame before it shows the ball above the floor, and the frame after shows it already rising.
Here the ball is let go at frame 9, falls for 10 frames and then bounces for 6 and 3, so every landing is a whole frame.
Each arc's launch speed is computed from its length, so the arc ends exactly on the floor.
The scene counts in frames.
`this.clipFrame` is the frame number within the clip, a whole number, so `f >= LANDS[0]` is true from the landing frame on, with no tolerance for the rounding that a time in seconds such as `19 / 30` carries.
The squash is a function of the frames since the landing, so it is largest on the contact frame.

```html
<div class="layer" data-component="ball" data-start="0" data-duration="2">
    <div style="position: absolute; left: 0; top: 470px; width: 1280px; height: 2px; background: #888"></div>
    <div style="position: absolute; left: -22px; top: -44px; width: 44px; height: 44px; border-radius: 50%; background: #aa3de6; transform-origin: 50% 100%" data-bind-style="ball"></div>
</div>
```

```javascript
const FPS = 30;         // the root's data-fps="30"; the arcs below are worked out before any scene runs, so this.fps is not there yet
const FLOOR = 470;      // px, the line the ball lands on
const HANG = 128;       // px, the ball's bottom edge before it is let go
const DROP = 9;         // let go at frame 9
const FALL = 10;        // and falls for 10 frames
const ARCS = [6, 3];    // then bounces of 6 and 3 frames
const G = 2 * (FLOOR - HANG) / ((FALL / FPS) ** 2);   // px/s²

const LANDS = [DROP + FALL];   // frames, each landing
const LAUNCH = [];             // px/s, each bounce's launch speed
for (const n of ARCS) {
    LAUNCH.push(G * (n / FPS) / 2);                    // an arc of n frames lasts 2 * speed / G
    LANDS.push(LANDS[LANDS.length - 1] + n);
}

// The ball's bottom edge at frame f: held, then falling, then bouncing.
function ballY(f) {
    if (f <= DROP) return HANG;
    if (f < LANDS[0]) { const u = (f - DROP) / FPS; return HANG + 0.5 * G * u * u; }
    for (let k = 0; k < ARCS.length; k++) {
        if (f < LANDS[k + 1]) { const u = (f - LANDS[k]) / FPS; return FLOOR - (LAUNCH[k] * u - 0.5 * G * u * u); }
    }
    return FLOOR;
}

scene('ball', {
    computed: {
        ball() {
            const f = this.clipFrame;
            let squash = 0;
            for (const at of LANDS) if (f >= at) squash += 0.4 * Math.max(0, 1 - (f - at) / (0.09 * FPS));
            return styleAt(this.local, { translateX: 640, translateY: ballY(f), scaleX: 1 + 0.8 * squash, scaleY: 1 - squash });
        },
    },
});
```

The opening scene of the Showreel (/demos/kinetic-showreel/) demo times its bouncing ball this way.

## A simulation baked at load

Three balls drop and bounce, each losing a different share of its speed on every landing.
A simulation steps forward in time while a render asks for frames in any order, so it never runs in a seek.
Beside the scene, each ball is stepped to the end of the clip at 1/240 s, finer than any frame, and its height at every step is kept in a typed array.
The computed reads the two steps either side of the time and mixes them, so a seek to any frame, in any order, draws the same thing.
Any physics engine works this way when it runs at load with a fixed step and takes its randomness from `random(seed)`.

```html
<div class="layer" data-component="balls" data-start="0" data-duration="4">
    <div style="position: absolute; left: 0; top: 600px; width: 1280px; height: 2px; background: #888"></div>
    <div data-list="balls" data-key="key">
        <template><div style="position: absolute; left: -22px; top: -44px; width: 44px; height: 44px; border-radius: 50%" data-bind-style="style"></div></template>
    </div>
</div>
```

```javascript
const DURATION = 4, DT = 1 / 240, STEPS = Math.ceil(DURATION / DT) + 1;
const FLOOR = 600;   // px, where a ball's bottom edge lands
const G = 2400;      // px/s²

const BALLS = [
    { x: 440, bounce: 0.8, color: '#5fd3c6' },
    { x: 640, bounce: 0.6, color: '#f2c14e' },
    { x: 840, bounce: 0.4, color: '#aa3de6' },
];

// Baked once: each ball's height at every step, from a drop at y 120.
for (const b of BALLS) {
    b.y = new Float32Array(STEPS);
    let y = 120, v = 0;
    for (let k = 0; k < STEPS; k++) {
        b.y[k] = y;
        v += G * DT;
        y += v * DT;
        if (y > FLOOR) { y = FLOOR - (y - FLOOR) * b.bounce; v = -v * b.bounce; }
    }
}

// The height at time t, between the two steps either side of it; held at the ends.
function heightAt(b, t) {
    const u = Math.min(STEPS - 1, Math.max(0, t / DT)), k = Math.min(STEPS - 2, Math.floor(u));
    return mix(b.y[k], b.y[k + 1], u - k);
}

scene('balls', {
    computed: {
        balls() {
            return BALLS.map((b, key) => ({ key, style: { background: b.color, ...styleAt(this.local, { translateX: b.x, translateY: heightAt(b, this.local) }) } }));
        },
    },
});
```

A landing between two frames is never drawn, and the frames either side show the ball above the floor; for a contact that has to be seen, choose the drop and the speeds so it lands on a whole frame, as "A landing on a whole frame" does.
When a learner's setting changes the result, bake again from a watcher on that store field.

## Cuts on whole frames

The screen cuts between five words, TYPE, SHAPE, TIME, SPACE and COLOR, in changing colors, and each card stays up for fewer frames than the one before.
A table of cuts with `at` in frames makes every card last a whole number of frames.
`moment(this.clipFrame, CUTS)` takes the frame number within the clip and finds the last cut whose `at` is at or before it, so each comparison is between two whole numbers.
Here the cards shorten from 14 frames to 10, and `since`, the frames since the cut started, divided by `this.fps`, drives each card's own motion in seconds.
Another scene can read the same table, as the showreel's overlay does to take each cut's color.

```html
<div class="layer" data-component="cuts" data-start="0" data-duration="2">
    <div class="layer" style="display: flex; align-items: center; justify-content: center" data-bind-style="card">
        <h2 data-bind="word" data-bind-style="wordStyle"></h2>
    </div>
</div>
```

```javascript
const CUTS = [
    { at: 0,  word: 'TYPE',  bg: '#0c0c10', fg: '#f2eee6' },
    { at: 14, word: 'SHAPE', bg: '#892dbf', fg: '#f2eee6' },
    { at: 27, word: 'TIME',  bg: '#0c0c10', fg: '#aa3de6' },
    { at: 39, word: 'SPACE', bg: '#aa3de6', fg: '#0c0c10' },
    { at: 50, word: 'COLOR', bg: '#0c0c10', fg: '#f2eee6' },
];

scene('cuts', {
    computed: {
        // The cut on screen at this frame of the clip: the at values are frames, so since is too.
        now() { return moment(this.clipFrame, CUTS); },
        card() { const c = this.now.row; return { background: c.bg, color: c.fg }; },
        word() { return this.now.row.word; },
        wordStyle() {
            const scale = interpolate(this.now.since / this.fps, [0, 0.25], [1.14, 1], { ease: 'power3.out' });
            return styleAt(this.local, { scale });
        },
    },
});
```

The rhythm scene of the Showreel (/demos/kinetic-showreel/) demo cuts between its words this way.

## A camera push and a fly-through

A sphere of 600 purple beads bursts outward from its center as the camera pushes in, and at the end the beads fly out past the camera.
This pattern uses Trillium, the three.js connector for WildflowerJS.
A Trillium view whose canvas sits inside a scene is drawn once after every seek, so `seek(local)` can move the camera directly.
The formation comes from a function of the clip's time, `beadsAt(t)`, bound with `view.instanced(() => this.beads, mesh, spec)`.
The renderer is created with `preserveDrawingBuffer: true` so the canvas still holds the frame when it is captured (development builds warn with KN-190 otherwise).
`renderer.compile()` builds the shaders in `init()`, so no seek has to build them.
Using Trillium (/docs/three-guide) covers views and bindings.

```html
<div class="layer" data-component="space" data-start="0" data-duration="5">
    <canvas width="1280" height="720" style="position: absolute; left: 0; top: 0; width: 1280px; height: 720px"></canvas>
</div>
```

```javascript
import * as THREE from 'three';

wildflower.three.use(THREE);

const inOut = ease('power3.inOut'), flyIn = ease('power3.in');

const BEADS = 600;
const golden = Math.PI * (3 - Math.sqrt(5));
const SPHERE = Array.from({ length: BEADS }, (_, i) => {
    const y = 1 - 2 * (i + 0.5) / BEADS, r = Math.sqrt(1 - y * y), a = i * golden;
    return [Math.cos(a) * r * 2.2, y * 2.2, Math.sin(a) * r * 2.2];
});

// The beads at t: bursting out from the center on a spring, then flying out past the camera.
function beadsAt(t) {
    const out = spring(t, { stiffness: 120, damping: 11 });
    const fly = 1 + 7 * ramp(t, 4.3, 5, flyIn);
    return SPHERE.map((p, i) => ({ id: i, x: p[0] * out * fly, y: p[1] * out * fly, z: p[2] * out * fly, scale: 0.06, colour: 0xaa3de6 }));
}

const camera = new THREE.PerspectiveCamera(40, 1280 / 720, 0.05, 100);

scene('space', {
    computed: {
        beads() { return beadsAt(this.local); },
    },
    init() {
        const renderer = new THREE.WebGLRenderer({ canvas: this.element.querySelector('canvas'), antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(1280, 720, false);
        const world = new THREE.Scene();
        const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial(), BEADS);
        world.add(mesh);

        const view = wildflower.three.view('space-view', { renderer, scene: world, camera, render: 'change' });
        view.instanced(() => this.beads, mesh, { position: ['x', 'y', 'z'], scale: 'scale', color: 'colour', pickable: false });
        renderer.compile(world, camera);
    },
    seek(local) {
        camera.position.set(0, 0, mix(9.5, 5.9, ramp(local, 0, 4.6, inOut)));
        camera.lookAt(0, 0, 0);
    },
});
```

The space scene of the Showreel (/demos/kinetic-showreel/) demo has the same shape, and sets its camera from a computed in the view's `before` callback.

## Morphing a formation

The sphere of beads turns into a doughnut shape, starting at the top and rippling down, while the beads brighten from dark to bright purple.
A morph blends each entity's two positions with `mix(a, b, ramp(t, from, to, ease))`, and giving each entity its own lag in `from` and `to` turns one blend into a wave.
Here the lag runs from the top of the sphere to the bottom, so the sphere becomes a torus from the top down.
Color blends through `mixHex`, which mixes the red, green and blue channels of two hex numbers, because three.js takes a color as a number and `mix()` returns a color as a string.
This code goes after the previous pattern's definitions of `BEADS`, `golden` and `inOut`, and its `beadsAt` replaces that pattern's.

```html
<div class="layer" data-component="space" data-start="0" data-duration="5">
    <canvas width="1280" height="720" style="position: absolute; left: 0; top: 0; width: 1280px; height: 720px"></canvas>
</div>
```

```javascript
const RING = 2.4, TUBE = 0.6;
const SHAPES = Array.from({ length: BEADS }, (_, i) => {
    const y = 1 - 2 * (i + 0.5) / BEADS, r = Math.sqrt(1 - y * y), around = i * golden, tube = 2 * Math.acos(y);
    return {
        sphere: [Math.cos(around) * r * 2.2, y * 2.2, Math.sin(around) * r * 2.2],
        torus: [(RING + TUBE * Math.cos(tube)) * Math.cos(around), TUBE * Math.sin(tube), (RING + TUBE * Math.cos(tube)) * Math.sin(around)],
        lag: (1 - y) / 2 * 0.3,   // the morph runs from the top down
    };
});

// A color between two hex numbers.
function mixHex(a, b, p) {
    const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
    const [ar, ag, ab] = ch(a), [br, bg, bb] = ch(b);
    return (Math.round(mix(ar, br, p)) << 16) | (Math.round(mix(ag, bg, p)) << 8) | Math.round(mix(ab, bb, p));
}

function beadsAt(t) {
    return SHAPES.map((b, i) => {
        const m = ramp(t, 1.6 + b.lag, 2.35 + b.lag, inOut);
        return {
            id: i,
            x: mix(b.sphere[0], b.torus[0], m),
            y: mix(b.sphere[1], b.torus[1], m),
            z: mix(b.sphere[2], b.torus[2], m),
            scale: 0.06,
            colour: mixHex(0x521a78, 0xaa3de6, m),
        };
    });
}
```

The space scene of the Showreel (/demos/kinetic-showreel/) demo morphs its beads from a sphere to a torus to a logo this way.

## Depth of field in 3D

A field of 600 purple beads fills the depth of the frame, and the focus moves through them from the back to the front like a camera's focus pull, with a blur computed for each pixel from its depth.
A Trillium view takes a `draw: (renderer, scene, camera) => ...` option that replaces the view's own `renderer.render(scene, camera)` call, and here it renders through an `EffectComposer` with a `BokehPass`.
Kinetic draws every view inside a scene through `view.draw()` after each seek, so `seek()` only sets the pass's focus from `plane`.
The pass's `focus` is a distance along the camera's look direction in world units, so `plane` runs from 24, past the farthest bead, to 8, the nearest.
The pass blurs the rendered image by its depth, so the number of beads does not change the cost of the blur.
The renderer, the mesh and its binding are set up as in the camera push above.
An import map in the page maps `three` and `three/addons/` to the three.js build and its `examples/jsm/` folder.
The pass's own shaders are not compiled by `renderer.compile()`, so one `composer.render()` in `init()` compiles them before frame 0.
The pass was run with these values in a headless browser; the bead layout is one of many.

```html
<div class="layer" data-component="dof" data-start="0" data-duration="5">
    <canvas width="1280" height="720" style="position: absolute; left: 0; top: 0; width: 1280px; height: 720px"></canvas>
</div>
```

```javascript
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

wildflower.three.use(THREE);

const BEADS = 600;
const golden = Math.PI * (3 - Math.sqrt(5));
const rnd = random(5);
// A golden-angle disc, wider than tall, with each bead at its own depth from z = -2 to 8.
const FIELD = Array.from({ length: BEADS }, (_, i) => {
    const r = 4 * Math.sqrt((i + 0.5) / BEADS), a = i * golden;
    return { id: i, x: Math.cos(a) * r * 1.8, y: Math.sin(a) * r, z: -2 + rnd() * 10, scale: 0.08, colour: 0xaa3de6 };
});

const camera = new THREE.PerspectiveCamera(40, 1280 / 720, 0.05, 100);
camera.position.set(0, 0, 16);
let bokeh;

scene('dof', {
    keyframes: {
        // The focal distance from the camera in world units, from past the farthest bead to the nearest.
        plane: { at: [0.5, 4.5], to: [24, 8], ease: 'power2.inOut' },
    },
    computed: {
        beads() { return FIELD; },
    },
    init() {
        const renderer = new THREE.WebGLRenderer({ canvas: this.element.querySelector('canvas'), antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(1280, 720, false);
        const world = new THREE.Scene();
        const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial(), BEADS);
        world.add(mesh);

        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(world, camera));
        bokeh = new BokehPass(world, camera, { focus: 14, aperture: 0.02, maxblur: 0.01 });
        composer.addPass(bokeh);

        const view = wildflower.three.view('dof-view', { renderer, scene: world, camera, render: 'change', draw: () => composer.render() });
        view.instanced(() => this.beads, mesh, { position: ['x', 'y', 'z'], scale: 'scale', color: 'colour', pickable: false });
        renderer.compile(world, camera);
        composer.render();   // compiles the pass's shaders before frame 0
    },
    seek() {
        bokeh.uniforms.focus.value = this.plane;
    },
});
```

The Showreel demo (/demos/kinetic-showreel/) renders its space shot through a bokeh pass this way, and its fly-out opens the aperture as the beads pass the lens. It needs the `draw` option of Trillium 0.2.

## Typed inputs for a batch

A promo shows a name as a heading, a price line under it and a bar in an accent color, and each video of a batch shows its own name, price and color.
The composition root declares its variables in `data-composition-variables`, and `inputs` declares what a scene reads from the composition's values: the declared defaults with `window.__hfVariables` over them.
An input takes a `type` of `String`, `Number` or `Boolean`, `required` and `default` for a missing value, and a `validator` that returns false, or throws, to reject one.
The scene reads it as `this.inputs.price`, already coerced to the type (the text `'12.5'` becomes the number 12.5) and checked before frame 0.
A value that is missing, of the wrong type or rejected is a `[KN-130]` error on the console in every build, with the scene and the input in the message, and in the development build what is wrong with the value.
The render stops at its timeout instead of producing a wrong video.

```html
<div id="stage" data-composition-id="promo"
     data-start="0" data-duration="5" data-width="1280" data-height="720" data-fps="30"
     data-composition-variables='[{"id":"name","type":"string","label":"Name","default":"Meadow"},{"id":"price","type":"number","label":"Price","default":49},{"id":"accent","type":"color","label":"Accent","default":"#c8452d"}]'>
    <div class="layer" data-component="promo" data-start="0" data-duration="5">
        <h1 data-bind="inputs.name"></h1>
        <p data-bind="priceLine"></p>
        <div style="height: 8px" data-bind-style="rule"></div>
    </div>
</div>
```

```javascript
scene('promo', {
    inputs: {
        name:   { type: String, required: true },
        price:  { type: Number, validator: (v) => v > 0 },
        accent: { type: String, default: '#c8452d' },
    },
    computed: {
        priceLine() { return format(this.inputs.price, { style: 'currency', currency: 'USD' }); },
        rule() { return { background: this.inputs.accent }; },
    },
});
```

The Launch Title demo (/demos/kinetic-title/) reads its title, subtitle and accent color through `inputs`, and the Sales Chart demo (/demos/kinetic-chart/) reads its title.

## A lesson that is also its video

A lesson on the page plays one step, then waits for the learner to drag a slider or answer a question, and the same page as a video plays every step straight through with the slider's moves and the answer scripted.
Each step is a clip with an `id` and `data-step`, and `step()` gives it the second it holds at (`wait`), the store path it waits for (`until`), the values it writes as it is entered (`entry`) and the script that writes the store in the video.
The learner's slider and the script write one store field, and the scenes read it through `follow`, which eases it by a spring in both modes.
Once `until` is true the rest of the step plays and holds on its last frame, so the question holds 1 s in, before its explanation at 2 s, and the explanation plays once the learner has answered right; a wrong answer shows a line saying why and keeps the step waiting.
Kinetic never moves to the next step by itself: every step holds at its end for Next. Next binds to `canAdvance`, false only while `until` is, so on a step with nothing to answer it is ready at once, and a press while the step plays skips the rest of it.
At a hold the clock stands still, so the learner's slider moves the point only through `follow`.
The page uses the one layout every lesson uses ("A lesson's layout", below), all of it inside the root: the step's heading, body, choices, and angle slider in the left column, the circle and the wave beside them, and the band along the bottom with the step, Play and Replay, and Back and Next, where the last step offers "Start again".
The slider, the prompts, and the band show in interactive mode alone, so in the video their space is empty paper; the choices show in both, disabled in the video, where the script answers.
On a phone held upright the page shows "Turn your phone sideways" over the frame, outside the root, where no check or render sees it.
The page's CSS is the layout's, with the lines below for the circle, the wave, and a note under the fourth choice.

```html
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,100..900;1,100..900&display=block" rel="stylesheet">
<script defer src="https://cdn.jsdelivr.net/npm/wildflowerjs@^1.5.5/dist/wildflower.lite.dev.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/kinetic@0.1/dist/kinetic.wf.js"></script>
<script defer src="app.js"></script>

<main class="lesson">
    <div id="stage" data-composition-id="sine" data-start="0" data-duration="19" data-width="1280" data-height="720" data-fps="30">
        <!-- The circle and the wave, right of the left column and above the band. -->
        <div class="layer" data-component="sine-circle" data-start="0" data-duration="19">
            <svg viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true">
                <path class="axis" d="M610 320H910M760 170V470M930 320H1216"></path>
                <circle class="unit" cx="760" cy="320" r="130"></circle>
                <line class="height" data-bind-attr="height"></line>
                <path class="wave" data-bind-attr="wave"></path>
                <circle r="9" fill="#26282d" data-bind-attr="point"></circle>
            </svg>
        </div>
        <section id="circle" class="layer cap" data-step data-start="0" data-duration="6">
            <h2>A point on a circle</h2>
            <p>A point goes round a circle of radius 1. Its height is sin θ.</p>
        </section>
        <section id="unwrap" class="layer cap" data-step data-start="circle" data-duration="8">
            <h2>The height draws a wave</h2>
            <p>Lay the angle out along a line, and the height draws a wave.</p>
        </section>
        <section id="ask" class="layer cap" data-step data-start="unwrap" data-duration="5">
            <h2>The lowest point</h2>
            <p>At what angle is the wave at its lowest?</p>
        </section>
        <div class="layer" data-component="sine-quiz" data-start="unwrap" data-duration="5">
            <div class="choices" data-list="choices" data-key="a">
                <template><button type="button" data-action="choose" data-bind="label" data-bind-class="cls" data-bind-attr="{ disabled: off }"></button></template>
            </div>
            <p class="note" data-show="why" data-bind="why"></p>
        </div>
        <!-- The explanation, 2 s into the question's step: after the hold. -->
        <div class="layer cap" data-start="16" data-duration="3"><p class="note">270°: the bottom of the circle, where the height is −1.</p></div>
        <div class="layer" data-component="prompt" data-start="0" data-duration="19">
            <p class="prompt" data-show="text" data-bind="text"></p>
        </div>
        <!-- The step's own control and the band: inside the root, shown in interactive mode alone. -->
        <div class="layer" data-component="lesson-controls" data-start="0" data-duration="19">
            <label class="ctl" data-show="turning">
                <span>Angle</span><b data-bind="angleText"></b>
                <input type="range" min="0" max="360" step="1" data-model="sine.angle" data-model-number>
            </label>
            <div class="band" data-show="$kinetic.mode === 'interactive'">
                <div class="where"><div class="count" data-bind="countText"></div><div class="title" data-bind="title"></div></div>
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
```

```css
/* With the layout's CSS: the circle and the wave, and the note under four choices. */
.axis { fill: none; stroke: #ddd3c2; stroke-width: 2; }
.unit { fill: none; stroke: #6e685f; stroke-width: 3; }
.height, .wave { fill: none; stroke: #B1A8FF; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
.cap p.note, .note { top: 484px; }
```

```javascript
const { scene, step } = wildflower.kinetic;
wildflower.kinetic.config({ fit: true, finish: { grain: 0.08 } });   // the stage fitted to the page, and the paper's still grain

const TITLES = { circle: 'Round the circle', unwrap: 'Drawing the wave', ask: 'The lowest point' };
const WHY = {
    90: 'Not quite: at 90° the point is at the top, where the wave is highest. Try another.',
    180: 'Not quite: at 180° the point is on the left, at a height of 0. Try another.',
    360: 'Not quite: 360° is a whole turn, back at the start, at a height of 0. Try another.',
};

wildflower.store('sine', { state: { angle: 30, choice: null }, computed: { right() { return this.choice === 270; } } });

step('circle', { wait: 2, script: { 'sine.angle': { at: [2, 5.5], to: [30, 120], ease: 'power2.inOut' } } });
step('unwrap', { wait: 1.5, script: { 'sine.angle': { at: [1.5, 2.3, 7.5], to: [120, 0, 360], ease: ['power2.inOut', 'linear'] } } });
step('ask', {
    wait: 1,                                                        // the page: holds before the explanation at 2 s
    until: 'sine.right',                                            // the page: a wrong answer keeps it waiting; the right one plays the explanation
    entry: { 'sine.choice': null, 'sine.angle': 360 },              // the page: cleared on the way in, with the whole wave drawn
    script: { 'sine.choice': { at: [0, 1.5], set: [null, 270] } },  // the video: 270 is chosen at 1.5 s
});

// The circle, its point's height, and the wave that height draws, one point a degree.
const CX = 760, CY = 320, R = 130, WX = 930, WS = 286 / 360, RAD = Math.PI / 180;
const y = (deg) => CY - R * Math.sin(deg * RAD);
scene('sine-circle', {
    subscribe: ['sine'],
    follow: { angle: 'sine.angle' },   // eased toward the store's angle by a spring, in both modes
    computed: {
        point() { return { cx: (CX + R * Math.cos(this.angle * RAD)).toFixed(1), cy: y(this.angle).toFixed(1) }; },
        height() { return { x1: this.point.cx, y1: CY, x2: this.point.cx, y2: this.point.cy }; },
        wave() {
            let d = 'M' + WX + ' ' + CY;
            for (let a = 1; a <= this.angle; a++) d += ' L' + (WX + a * WS).toFixed(1) + ' ' + y(a).toFixed(1);
            return { d };
        },
    },
});

wildflower.component('sine-quiz', {
    subscribe: ['sine', 'kinetic'],
    computed: {
        choices() {
            const c = this.stores.sine.choice, off = this.stores.kinetic.mode === 'video';   // the video's script answers
            return [90, 180, 270, 360].map((a) => ({ a, off, label: a + '°', cls: c !== a ? '' : a === 270 ? 'right' : 'wrong' }));
        },
        why() { return WHY[this.stores.sine.choice] || ''; },
    },
    choose(event, element, details) { this.stores.sine.choice = details.item.a; },
});

// Prompts to the learner, in the lesson alone.
wildflower.component('prompt', {
    subscribe: ['sine', 'kinetic'],
    computed: {
        text() {
            const k = this.stores.kinetic;
            if (k.mode !== 'interactive' || (k.step === 'ask' && this.stores.sine.right)) return '';
            return { circle: 'Your turn: drag the angle, and watch the height.', unwrap: 'Your turn: drag the angle, and the wave follows it.', ask: 'Your turn: pick an answer.' }[k.step] || '';
        },
    },
});

// The angle and the band, the layout's, in the frame and in the lesson alone.
wildflower.component('lesson-controls', {
    subscribe: ['sine', 'kinetic'],
    computed: {
        countText() { const k = this.stores.kinetic; return k.stepCount ? 'Step ' + (k.stepIndex + 1) + ' of ' + k.stepCount : ''; },
        title() { return TITLES[this.stores.kinetic.step] || ''; },
        backAttrs() { return { disabled: this.stores.kinetic.stepIndex <= 0 }; },
        nextAttrs() { return { disabled: !this.stores.kinetic.canAdvance }; },   // off while until is false: a question not yet answered
        last() { const k = this.stores.kinetic; return k.stepCount > 0 && k.stepIndex === k.stepCount - 1; },
        more() { return !this.last; },
        playLabel() { return this.stores.kinetic.playing ? 'Pause' : 'Play'; },
        // The angle belongs to the steps before the question, in the lesson alone.
        turning() { const k = this.stores.kinetic; return k.mode === 'interactive' && (k.step === 'circle' || k.step === 'unwrap'); },
        angleText() { return Math.round(this.stores.sine.angle) + '°'; },
    },
    back() { wildflower.kinetic.back(); },
    next() { wildflower.kinetic.next(); },
    again() { wildflower.kinetic.go(0); },
    replay() { wildflower.kinetic.go(this.stores.kinetic.stepIndex); },
    toggle() { if (this.stores.kinetic.playing) wildflower.kinetic.pause(); else wildflower.kinetic.play(); },
});
```

A page can offer the video as well, from a button outside the root, where the video never draws it: `config({ mode: 'video' })` and `play({ from: 0 })` play it from the start, and `config({ mode: 'interactive' })` takes the page back to the lesson with the learner's angle and answer, where `go()` enters the step they were on.
The question's buttons have no CSS transition, since the script changes their class in the video.
The sine lesson demo (/demos/kinetic-sine/) is this lesson in four steps, with a last step that waits for the learner to drag the point to the bottom of the circle, and its toolbar offers the video.
`scripts/check.cjs index.html --lesson` walks a lesson's steps: whether each holds (on the last frame before its `wait`), the `until` it waits on, the console errors and KN lines during it, and a still of each hold.
The finished lesson loads the minified builds and has no preview bar.

## A question that explains a wrong answer

The step holds with the question up, before the explanation of the right answer.
A wrong pick shows why it is wrong, a binding on the store that shows during the hold, and the step keeps holding for another try.
The right pick turns `until` true, so the rest of the step plays, the explanation with it, and the step holds at its end for Next.
In the video the script picks the right answer before the explanation, which plays as it does on the page.

```html
<div id="stage" data-composition-id="planets" data-start="0" data-duration="9" data-width="1280" data-height="720" data-fps="30">
    <section id="ask" class="layer cap" data-step data-start="0" data-duration="6"><h2>Which planet is closest to the Sun?</h2></section>
    <div class="layer quiz" data-component="quiz" data-start="0" data-duration="6">
        <div class="choices" data-list="choices" data-key="id">
            <template><button type="button" data-action="choose" data-bind="label" data-bind-class="cls" data-bind-attr="{ disabled: off }"></button></template>
        </div>
        <p class="why" data-show="why" data-bind="why"></p>
        <!-- The lesson alone: off until the right pick, then ready; the step holds at its end for it. -->
        <button type="button" class="next" data-action="next" data-show="$kinetic.mode === 'interactive'" data-bind-attr="{ disabled: !$kinetic.canAdvance }">Next</button>
    </div>
    <!-- After the hold at 2 s: plays once the answer is right. -->
    <p class="layer reveal" data-start="2" data-duration="4">Right: Mercury orbits 58 million km from the Sun.</p>
    <section id="next" class="layer cap" data-step data-start="ask" data-duration="3">
        <h2>Next: why Venus is hotter.</h2>
        <!-- The last step: the lesson alone offers the way back to the start. -->
        <div data-component="again"><button type="button" data-action="again" data-show="$kinetic.mode === 'interactive'">Start again</button></div>
    </section>
</div>
```

```javascript
const { step } = wildflower.kinetic;

const CHOICES = [
    { id: 'venus', label: 'Venus', why: 'Not quite: Venus is the second planet out. Try another.' },
    { id: 'mercury', label: 'Mercury', why: '' },
    { id: 'earth', label: 'Earth', why: 'Not quite: Earth is the third planet out. Try another.' },
];

wildflower.store('quiz', { state: { pick: null }, computed: { right() { return this.pick === 'mercury'; } } });

step('ask', {
    wait: 2,                                                         // holds before the explanation, which starts at 2 s
    until: 'quiz.right',                                             // a wrong pick keeps it holding; the right one plays the explanation
    entry: { 'quiz.pick': null },                                    // cleared on the way in
    script: { 'quiz.pick': { at: [0, 1], set: [null, 'mercury'] } }, // the video picks the right answer at 1 s
});

wildflower.component('quiz', {
    subscribe: ['quiz', 'kinetic'],
    computed: {
        choices() {
            const p = this.stores.quiz.pick, off = this.stores.kinetic.mode === 'video';   // the video's script picks
            return CHOICES.map((c) => ({ id: c.id, label: c.label, off, cls: p !== c.id ? '' : c.id === 'mercury' ? 'right' : 'wrong' }));
        },
        why() { const c = CHOICES.find((c) => c.id === this.stores.quiz.pick); return c ? c.why : ''; },
    },
    choose(event, element, details) { this.stores.quiz.pick = details.item.id; },
    next() { wildflower.kinetic.next(); },
});

wildflower.component('again', { subscribe: ['kinetic'], again() { wildflower.kinetic.go(0); } });
```

The buttons and the wrong pick's text take no CSS transition, since the script changes the pick in the video.
The buttons are disabled in video mode, where the script picks.
The last step offers "Start again" in the lesson alone, so the learner never steps back through every step.

## Content for the lesson alone

A hint or a "try it" prompt belongs to the lesson and has no place in the video.
The store's `mode` tells the two apart: a binding reads `$kinetic.mode`, and a computed reads `this.stores.kinetic.mode` in a scene or component with `kinetic` in `subscribe`.
`check()` and `render()` run in video mode, so the frames they see and the file a render makes have none of it.

```html
<div id="stage" data-composition-id="lab" data-start="0" data-duration="5" data-width="1280" data-height="720" data-fps="30">
    <section id="grow" class="layer" data-step data-start="0" data-duration="5"></section>
    <div class="layer" data-component="lab" data-start="0" data-duration="5">
        <svg viewBox="0 0 1280 720" width="1280" height="720"><circle cx="640" cy="330" fill="#5fd3c6" data-bind-attr="dot"></circle></svg>
        <div class="try" data-show="$kinetic.mode === 'interactive'">
            <p>Try it: double the radius.</p>
            <button type="button" data-action="small">Radius 60</button>
            <button type="button" data-action="large">Radius 120</button>
        </div>
        <p class="hint" data-show="hint" data-bind="hint"></p>
    </div>
</div>
```

```javascript
const { scene, step } = wildflower.kinetic;

wildflower.store('lab', { state: { r: 60 } });

// The lesson holds at 1 s for the learner; the video doubles the radius itself.
step('grow', { wait: 1, script: { 'lab.r': { at: [1, 3], to: [60, 120], ease: 'power2.inOut' } } });

scene('lab', {
    subscribe: ['lab', 'kinetic'],
    follow: { r: 'lab.r' },
    computed: {
        dot() { return { r: this.r.toFixed(1) }; },
        // The lesson alone: a hint once the learner has doubled the radius.
        hint() {
            const lesson = this.stores.kinetic.mode === 'interactive';
            return lesson && this.stores.lab.r === 120 ? 'Twice the radius gives four times the area.' : '';
        },
    },
    small() { this.stores.lab.r = 60; },
    large() { this.stores.lab.r = 120; },
});
```

## A lesson's layout

Every lesson uses this one layout in the default style (`style.md`, "Interactive pieces"), so one lesson is consistent with the next.
Everything, the lesson and its controls, is inside one 1280 by 720 composition fitted to the page with `config({ fit: true })`, and the page around it holds nothing else.
The left column starts at the top left of the 64 px safe area: the step's heading, a line or two of body, a question's choices stacked as filled buttons, and the current step's own controls, each a name, its value as ink on an accent pill, and the control (in the choices' place, when the step asks no question).
A right choice turns to the accent fill and the explanation plays under the choices; a wrong one turns coral, shows a line saying why, and keeps the step waiting.
The illustration takes the rest of the frame above the band, which runs along the bottom of the safe area: "Step 1 of 2" and the step's title at the left, play and pause and replay the step in the middle, and Back on the surface fill and Next at the right.
There is no scrubber: a step is short, and Replay starts it again.
Each step plays, then holds on its last frame until the learner presses Next; Kinetic never moves on by itself.
Next binds `canAdvance`, false only while the step's `until` is, so it is ready at once on a step with nothing to answer, and a press while the step plays skips the rest of it; it is in the accent while it can be used and on the surface fill with muted text while it cannot.
Back always works, and the last step offers "Start again" in Next's place.
The band, the step's controls, and the prompts to the learner ("Your turn: ...") show in interactive mode alone, so `check()` and a render, which run in video mode, never draw them, and in the video their space is empty paper.
The choices show in both modes, disabled in the video, where the script picks.
On a phone held upright the frame is too small to read or tap, so the page shows "Turn your phone sideways" over it, outside the root, where no check or render sees it.
Kinetic loads with no `data-preview` here, since the bar would put the lesson in video mode, and the recipe's `config()` adds the fit and the finish's grain to the shutter that "The composition" sets at the top of the scene file (`config({ shutter: 180 })`); a page made from this recipe alone sets all three in one call.

```html
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,100..900;1,100..900&display=block" rel="stylesheet">
<script defer src="https://cdn.jsdelivr.net/npm/wildflowerjs@^1.5.5/dist/wildflower.lite.dev.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/@wildflowerjs/kinetic@0.1/dist/kinetic.wf.js"></script>
<script defer src="app.js"></script>

<main class="lesson">
    <div id="stage" data-composition-id="area" data-start="0" data-duration="10" data-width="1280" data-height="720" data-fps="30">
        <!-- The illustration, in the frame above the band. -->
        <div class="layer" data-component="disc" data-start="0" data-duration="10">
            <svg viewBox="0 0 1280 720" width="1280" height="720" aria-hidden="true">
                <circle cx="900" cy="320" fill="#B1A8FF" data-bind-attr="disc"></circle>
                <circle cx="900" cy="320" r="80" fill="#90CDEF"></circle>
            </svg>
        </div>
        <section id="grow" class="layer cap" data-step data-start="0" data-duration="5">
            <h2>A circle's area</h2>
            <p>The blue disc has a radius of 80. The lavender one grows around it.</p>
        </section>
        <section id="ask" class="layer cap" data-step data-start="grow" data-duration="5">
            <h2>Twice the radius</h2>
            <p>When the radius doubles, how many times the area does the circle have?</p>
        </section>
        <div class="layer" data-component="quiz" data-start="grow" data-duration="5">
            <div class="choices" data-list="choices" data-key="id">
                <template><button type="button" data-action="choose" data-bind="label" data-bind-class="cls" data-bind-attr="{ disabled: off }"></button></template>
            </div>
            <p class="note" data-show="why" data-bind="why"></p>
        </div>
        <!-- The explanation, after the question's hold at 6 s: it plays once the answer is right. -->
        <div class="layer cap" data-start="7" data-duration="3"><p class="note">Four times: the disc is twice as wide and twice as tall.</p></div>
        <div class="layer" data-component="prompt" data-start="0" data-duration="10">
            <p class="prompt" data-show="text" data-bind="text"></p>
        </div>
        <!-- The step's own control and the band: inside the root, shown in interactive mode alone,
             so the video keeps their space as empty paper. -->
        <div class="layer" data-component="lesson-controls" data-start="0" data-duration="10">
            <label class="ctl" data-show="growing">
                <span>Radius</span><b data-bind="radiusText"></b>
                <input type="range" min="80" max="200" step="1" data-model="area.r" data-model-number>
            </label>
            <div class="band" data-show="$kinetic.mode === 'interactive'">
                <div class="where"><div class="count" data-bind="countText"></div><div class="title" data-bind="title"></div></div>
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
    <!-- Outside the root: a note for a phone held upright, which no check or render sees. -->
    <p class="turn">Turn your phone sideways</p>
</main>
```

```css
* { box-sizing: border-box; }
body { margin: 0; background: #e4dbca; color: #26282d; font-family: 'Work Sans', sans-serif; }
/* The page: the stage as wide as the window, and no taller than it. */
.lesson { position: relative; width: min(100%, calc(100vh * 16 / 9)); margin: 0 auto; }
/* On a phone held upright, the note over the frame. */
.turn { display: none; }
@media (orientation: portrait) and (max-width: 600px) {
    .turn { display: block; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); margin: 0; padding: 10px 16px; border-radius: 10px; background: #26282d; color: #efe8db; font-size: 16px; font-weight: 600; white-space: nowrap; }
}
#stage { position: relative; overflow: hidden; background: #efe8db; }
.layer { position: absolute; inset: 0; pointer-events: none; }
[data-composition-id]:not([data-kinetic-ready]) { visibility: hidden; }
/* The left column, from the safe area's top left: the heading, the body, the prompt, the choices or the step's control, the note. */
.cap h2 { position: absolute; left: 64px; top: 64px; width: 560px; margin: 0; font-size: 44px; font-weight: 800; line-height: 1.1; letter-spacing: -0.02em; }
.cap p { position: absolute; left: 64px; top: 120px; width: 500px; margin: 0; font-size: 22px; font-weight: 500; line-height: 1.3; }
.prompt { position: absolute; left: 64px; top: 196px; margin: 0; padding: 6px 12px; border-radius: 8px; background: #EFC187; font-size: 18px; font-weight: 600; }
.choices { position: absolute; left: 64px; top: 252px; display: flex; flex-direction: column; gap: 8px; width: 220px; }
.choices button { pointer-events: auto; padding: 10px 18px; border: 0; border-radius: 10px; background: #e4dbca; color: #26282d; font: 600 22px/1.2 'Work Sans', sans-serif; text-align: left; cursor: pointer; }
.choices button:disabled { cursor: default; }
.choices button.right { background: #B1A8FF; }
.choices button.wrong { background: #EF9481; }
.cap p.note, .note { position: absolute; left: 64px; top: 430px; width: 460px; margin: 0; font-size: 22px; font-weight: 600; line-height: 1.3; }
.ctl { position: absolute; left: 64px; top: 252px; width: 360px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 12px; pointer-events: auto; font-size: 20px; font-weight: 600; }
.ctl b { justify-self: start; padding: 2px 10px; border-radius: 8px; background: #B1A8FF; font-variant-numeric: tabular-nums; }
.ctl input { grid-column: 1 / -1; width: 100%; }
/* The band along the bottom of the safe area: where the lesson is, Play and Replay, Back and Next. */
.band { position: absolute; left: 64px; right: 64px; top: 600px; height: 56px; display: flex; align-items: center; gap: 32px; pointer-events: auto; }
.where { width: 240px; }
.count { font-size: 15px; font-weight: 600; color: #6e685f; }
.title { margin-top: 2px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; white-space: nowrap; }
.transport { flex: 1; display: flex; align-items: center; gap: 8px; }
.nav { display: flex; gap: 8px; }
.band button { padding: 10px 18px; border: 0; border-radius: 10px; background: #e4dbca; color: #26282d; font: 600 18px/1.2 'Work Sans', sans-serif; white-space: nowrap; cursor: pointer; }
.band button.play { width: 96px; }   /* Play and Pause, one width */
/* Next in the accent once it can be used; quiet until then. */
.band button.go { background: #B1A8FF; }
.band button:disabled { background: #e4dbca; color: #6e685f; cursor: default; }
input[type="range"] { -webkit-appearance: none; appearance: none; height: 24px; margin: 0; background: transparent; cursor: pointer; }
input[type="range"]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: #ddd3c2; }
input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; margin-top: -7px; border-radius: 50%; background: #26282d; }
input[type="range"]::-moz-range-track { height: 6px; border-radius: 3px; background: #ddd3c2; }
input[type="range"]::-moz-range-thumb { width: 20px; height: 20px; border: 0; border-radius: 50%; background: #26282d; }
```

```javascript
const { scene, step } = wildflower.kinetic;
wildflower.kinetic.config({ fit: true, finish: { grain: 0.08 } });   // the stage fitted to the page, and the paper's still grain

const TITLES = { grow: 'Growing the radius', ask: 'Twice the radius' };
const CHOICES = [
    { id: '2', label: '2×', why: 'Not quite: the disc is twice as wide, and twice as tall too. Try another.' },
    { id: '4', label: '4×', why: '' },
    { id: '8', label: '8×', why: 'Not quite: 8× is for a ball, which doubles in depth as well. Try another.' },
];

wildflower.store('area', { state: { r: 80, pick: null }, computed: { right() { return this.pick === '4'; } } });

step('grow', { wait: 1, entry: { 'area.r': 80 }, script: { 'area.r': { at: [1, 4], to: [80, 160], ease: 'power2.inOut' } } });
step('ask', {
    wait: 1,                                                    // holds before the explanation at 2 s
    until: 'area.right',                                        // a wrong pick keeps it waiting; the right one plays the explanation
    entry: { 'area.pick': null },                               // cleared on the way in
    script: { 'area.pick': { at: [0, 1.5], set: [null, '4'] } }, // the video picks the right answer at 1.5 s
});

scene('disc', { subscribe: ['area'], follow: { r: 'area.r' }, computed: { disc() { return { r: this.r.toFixed(1) }; } } });

wildflower.component('quiz', {
    subscribe: ['area', 'kinetic'],
    computed: {
        choices() {
            const p = this.stores.area.pick, off = this.stores.kinetic.mode === 'video';   // the video's script picks
            return CHOICES.map((c) => ({ id: c.id, label: c.label, off, cls: p !== c.id ? '' : c.id === '4' ? 'right' : 'wrong' }));
        },
        why() { const c = CHOICES.find((c) => c.id === this.stores.area.pick); return c ? c.why : ''; },
    },
    choose(event, element, details) { this.stores.area.pick = details.item.id; },
});

// Prompts to the learner, in the lesson alone.
wildflower.component('prompt', {
    subscribe: ['kinetic'],
    computed: {
        text() {
            const k = this.stores.kinetic;
            if (k.mode !== 'interactive') return '';
            return { grow: 'Your turn: double the radius with the slider.', ask: 'Your turn: pick an answer.' }[k.step] || '';
        },
    },
});

// The step's own control and the band, both in the frame and in the lesson alone.
wildflower.component('lesson-controls', {
    subscribe: ['area', 'kinetic'],
    computed: {
        countText() { const k = this.stores.kinetic; return k.stepCount ? 'Step ' + (k.stepIndex + 1) + ' of ' + k.stepCount : ''; },
        title() { return TITLES[this.stores.kinetic.step] || ''; },
        backAttrs() { return { disabled: this.stores.kinetic.stepIndex <= 0 }; },
        nextAttrs() { return { disabled: !this.stores.kinetic.canAdvance }; },   // off while until is false: a question not yet answered
        last() { const k = this.stores.kinetic; return k.stepCount > 0 && k.stepIndex === k.stepCount - 1; },
        more() { return !this.last; },
        playLabel() { return this.stores.kinetic.playing ? 'Pause' : 'Play'; },
        // The radius slider belongs to the first step, in the lesson alone.
        growing() { const k = this.stores.kinetic; return k.mode === 'interactive' && k.step === 'grow'; },
        radiusText() { return String(Math.round(this.stores.area.r)); },
    },
    back() { wildflower.kinetic.back(); },
    next() { wildflower.kinetic.next(); },
    again() { wildflower.kinetic.go(0); },
    replay() { wildflower.kinetic.go(this.stores.kinetic.stepIndex); },
    toggle() { if (this.stores.kinetic.playing) wildflower.kinetic.pause(); else wildflower.kinetic.play(); },
});
```

The disc follows the store's radius by a spring, so the learner's drag at the hold moves it although the clock stands still.
The blue disc on top, in the series' third color, is the radius the step starts from, so the lavender ring around it shows how much the area grew.
The illustration stays clear of the band's place: the disc at its largest, a radius of 200, ends 80 px above the band.
Each layer takes no pointer events, so the layers above never catch a click, and the band, the control, and the choices take them back with `pointer-events: auto`.
The fit scales the root with a CSS transform, and a click or a drag lands on a scaled control where it is drawn.
Play and Pause share one width, so nothing in the band moves when the label changes.
`scripts/check.cjs index.html --lesson` walks the two steps; its stills are interactive mode, with the band drawn, and the `--frames` PNGs are video mode, where the band's place is empty paper.
start.md's lesson is this layout in three steps, with a dial.

## Shapes from data inside an SVG

Paths, circles or lines drawn from data inside an `<svg>` are a pool, never a list.
The HTML parser leaves a `<template>` inside `<svg>` inert, so `data-list` draws nothing there, and WildflowerJS's development build warns and points to pools; a pool's template works inside `<svg>`.
Each seek flushes the pools, so the paths hold the frame's shapes when the seek settles.
Pools need the mini-pool tier or above.
`update(key, props)` finds the entity by the field the container's `data-key` names (`id` here), so `update(f.id, ...)`.
The `attrs` object's keys are written as attribute names, so an SVG attribute with a hyphen is a quoted key (`'stroke-width'`), never camel case.

```html
<div class="layer" data-component="flows" data-start="0" data-duration="6">
    <svg viewBox="0 0 1280 720" width="1280" height="720">
        <g data-pool="flows" data-key="id"><template><path fill="none" stroke="#5fd3c6" data-bind-attr="attrs"></path></template></g>
    </svg>
</div>
```

```javascript
const { scene, ramp, stagger } = wildflower.kinetic;

const FLOWS = [{ id: 0, y: 200 }, { id: 1, y: 360 }, { id: 2, y: 520 }];

scene('flows', {
    pools: { flows: {} },
    init() { for (const f of FLOWS) this.pools.flows.add({ id: f.id, y: f.y, attrs: { d: '', 'stroke-width': 4 } }); },
    seek(local) {
        this.pools.flows.forEach((f) => {
            const p = ramp(local - stagger(f.id, FLOWS.length, { each: 0.3 }), 0.5, 2.5, 'power2.inOut');
            const x = 100 + 1080 * p;
            this.pools.flows.update(f.id, { attrs: { d: 'M100 ' + f.y + ' L' + x.toFixed(1) + ' ' + f.y, 'stroke-width': (2 + 6 * p).toFixed(1) } });
        });
    },
});
```

## A Sankey from a table of flows

A flow diagram draws in column by column: each band is a flow's value in height, leaving its node and arriving at the next in a fixed order, so no two bands cross at a node.
The layout is worked out once, at load: one scale for every column (the fullest column fills the height), each node's height its value, and each band's two edges, top and bottom, as cubic curves.
`trimPath([top, bottom], 0, p)` draws the area between the two edges from the left up to `p`, so a band grows along its own curve.
Bands and nodes are two pools inside the `<svg>` ("Shapes from data inside an SVG"); the labels are a list on the data, left of the first column and right of the others, the middle column's on a patch of paper where they sit over bands.
The one meaning that matters here, the loss, is in coral, and every other flow gray; a story in stages gives each stage's meaning its color (`kinds/data-story.md`).

```html
<div class="layer" data-component="sankey" data-start="0" data-duration="8">
    <svg viewBox="0 0 1280 720" width="1280" height="720">
        <g data-pool="bands" data-key="id"><template><path data-bind-attr="attrs"></path></template></g>
        <g data-pool="nodes" data-key="id"><template><rect data-bind-attr="attrs"></rect></template></g>
    </svg>
    <div data-list="labels" data-key="id">
        <template><p data-bind-class="cls" data-bind-style="pos"><b data-bind="name"></b><span data-bind="value"></span></p></template>
    </div>
</div>
```

```css
.label { position: absolute; margin: 0; font-size: 22px; font-weight: 600; white-space: nowrap; }
.label span { margin-left: 8px; color: #6e685f; font-variant-numeric: tabular-nums; }   /* a margin, since a template's space between two inline elements collapses */
.label.left { transform: translate(-100%, -50%); }
.label.right { transform: translate(0, -50%); }
.label.inside { padding: 2px 8px; border-radius: 6px; background: #efe8db; }   /* over the bands, on a patch of paper */
```

```javascript
const { scene, ramp, trimPath } = wildflower.kinetic;

// The columns, left to right, and the flows between them: [from, to, value].
const COLS = [['coal', 'gas', 'wind'], ['power', 'heat'], ['homes', 'industry', 'lost']];
const NAMES = { coal: 'Coal', gas: 'Gas', wind: 'Wind', power: 'Power', heat: 'Heat', homes: 'Homes', industry: 'Industry', lost: 'Lost' };
const FLOWS = [
    ['coal', 'power', 30], ['gas', 'power', 25], ['gas', 'heat', 20], ['wind', 'power', 15],
    ['power', 'homes', 28], ['power', 'industry', 20], ['power', 'lost', 22], ['heat', 'homes', 12], ['heat', 'industry', 8],
];

// The layout, worked out once: one scale for every column, so a node's height is its value.
const TOP = 120, BOTTOM = 600, GAP = 28, W = 16, X0 = 200, X1 = 1000;
const sum = (list) => list.reduce((s, f) => s + f[2], 0);
const value = (id) => Math.max(sum(FLOWS.filter((f) => f[0] === id)), sum(FLOWS.filter((f) => f[1] === id)));
const K = Math.min(...COLS.map((c) => (BOTTOM - TOP - GAP * (c.length - 1)) / c.reduce((s, id) => s + value(id), 0)));
const NODES = {};
COLS.forEach((col, ci) => {
    let y = TOP;
    for (const id of col) { NODES[id] = { id, col: ci, x: X0 + ci * (X1 - X0) / (COLS.length - 1), y, h: value(id) * K }; y += NODES[id].h + GAP; }
});
// Each band leaves and arrives stacked in column order, so no two cross at a node.
const order = (id) => COLS.flat().indexOf(id);
const LINKS = FLOWS.map(([from, to, v], id) => ({ id, from, to, h: v * K, start: 0.8 + NODES[from].col * 1.6 }));
for (const n of Object.values(NODES)) {
    let o = n.y, i = n.y;
    LINKS.filter((l) => l.from === n.id).sort((a, b) => order(a.to) - order(b.to)).forEach((l) => { l.y0 = o; o += l.h; });
    LINKS.filter((l) => l.to === n.id).sort((a, b) => order(a.from) - order(b.from)).forEach((l) => { l.y1 = i; i += l.h; });
}
// A band is its two edges, top and bottom: trimPath draws the area between them from the left.
const f1 = (v) => v.toFixed(1);
for (const l of LINKS) {
    const x0 = NODES[l.from].x + W, x1 = NODES[l.to].x, xm = (x0 + x1) / 2;
    const edge = (a, b) => `M${f1(x0)} ${f1(a)}C${f1(xm)} ${f1(a)} ${f1(xm)} ${f1(b)} ${f1(x1)} ${f1(b)}`;
    l.edges = [edge(l.y0, l.y1), edge(l.y0 + l.h, l.y1 + l.h)];
    l.fill = l.to === 'lost' ? '#EF9481' : '#c4b7a0';   // the one meaning in color; the rest gray
}

scene('sankey', {
    pools: { bands: {}, nodes: {} },
    init() {
        for (const l of LINKS) this.pools.bands.add({ id: l.id, attrs: { d: '', fill: l.fill } });
        for (const n of Object.values(NODES)) this.pools.nodes.add({ id: n.id, attrs: { x: n.x, y: f1(n.y), width: W, height: f1(n.h), fill: '#26282d' } });
    },
    seek(local) {
        for (const l of LINKS) this.pools.bands.update(l.id, { attrs: { d: trimPath(l.edges, 0, ramp(local, l.start, l.start + 1.2, 'power2.inOut')), fill: l.fill } });
    },
    computed: {
        // Labels on the data: left of the first column, right of the rest, each in once its node's flow arrives.
        labels() {
            return Object.values(NODES).map((n) => {
                const at = n.col === 0 ? 0.6 : 0.8 + (n.col - 1) * 1.6 + 1.2;
                return {
                    id: n.id, name: NAMES[n.id], value: String(value(n.id)),
                    cls: 'label ' + (n.col === 0 ? 'left' : n.col === COLS.length - 1 ? 'right' : 'right inside'),
                    pos: { left: (n.col === 0 ? n.x - 14 : n.x + W + 6) + 'px', top: f1(n.y + n.h / 2) + 'px', opacity: ramp(this.local, at, at + 0.4).toFixed(3) },
                };
            });
        },
    },
});
```

Each column draws 1.2 s after the last began, and the finished diagram holds from 4.4 s to the end, longer than any one step took to draw ("Time" in `craft.md`).
`attrs` is replaced whole on each `update()`, so the fill goes with the path every time.
For a story told in stages (draw the sources, then follow one node's flows), give each band a start of its own from a timing table, and its fill a `mix()` between the stage colors over the moment the story moves on.

## A Sankey laid out by pele

The same diagram with pele, a Mermaid renderer loaded before the scenes (the script line in `SKILL.md`), doing the layout: for many flows, and flows that skip a column, which hand-written layout gets wrong.
The flows are Mermaid's sankey text, one `from,to,value` row each; `pele.render()` lays them out once, at load, into an `<svg>` kept out of sight, and the scene reads its geometry: each node's rect, and each band's outline, `M` along the top in curves, `L` down the far end, and the bottom's curves back, which becomes the two edges `trimPath()` grows.
Everything after the layout is "A Sankey from a table of flows": the pools, the growth along each band, the labels on the data.
`showValues: false` turns pele's own figures off, and the labels carry the source's printed totals, since pele's are sums of the flows and can differ from them by rounding.
pele orders each column itself, so fewer bands cross; a story that needs its own order keeps the hand-built pattern.
A band's position comes through the transforms around it (`getScreenCTM()`), so the hidden `<svg>` is in the page, laid out, not merely parsed.

```html
<div class="layer" data-component="flows" data-start="0" data-duration="8">
    <svg viewBox="0 0 1000 560" width="1000" height="560" style="position: absolute; left: 140px; top: 110px">
        <g data-pool="bands" data-key="id"><template><path data-bind-attr="attrs"></path></template></g>
        <g data-pool="nodes" data-key="id"><template><rect data-bind-attr="attrs"></rect></template></g>
    </svg>
</div>
```

```javascript
const { scene, ramp, trimPath } = wildflower.kinetic;

const FLOWS = `Coal,Power,30
Gas,Power,25
Gas,Heat,20
Gas,Industry,6
Wind,Power,15
Power,Homes,28
Power,Industry,20
Power,Lost,22
Heat,Homes,12
Heat,Industry,8`;

// pele's layout, at the chart's size (inset from the frame's edges, for the labels beside it), out of sight; no figures of its own.
const W = 1000, H = 560;
const host = document.createElement('div');
host.style.cssText = 'position: absolute; left: -10000px; top: 0';
host.innerHTML = pele.render(`---\nconfig:\n  sankey:\n    width: ${W}\n    height: ${H}\n    nodeWidth: 16\n    showValues: false\n---\nsankey-beta\n${FLOWS}`).svg;
document.body.appendChild(host);
const svg = host.querySelector('svg'), vb = svg.viewBox.baseVal, k = W / vb.width;
// An element's own coordinates on the chart, through the transforms around it.
const place = (el) => { const m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM()); return (x, y) => [(m.a * x + m.c * y + m.e - vb.x) * k, (m.b * x + m.d * y + m.f - vb.y) * k]; };
const f1 = (v) => v.toFixed(1);

const NODES = [...svg.querySelectorAll('.pele-sankey-node')].map((r) => {
    const [x, y] = place(r)(+r.getAttribute('x'), +r.getAttribute('y'));
    return { id: r.getAttribute('data-id'), x, y, w: +r.getAttribute('width') * k, h: Math.max(+r.getAttribute('height') * k, 2) };
});
const columns = [...new Set(NODES.map((n) => Math.round(n.x)))].sort((a, b) => a - b);
// Each band's outline: M, curves along the top, L, curves back along the bottom; the bottom's reversed.
const LINKS = [...svg.querySelectorAll('.pele-sankey-link')].map((p) => {
    const [from, to] = p.getAttribute('data-id').split('->');
    const at = place(p), pt = (q) => at(q[0], q[1]).map(f1).join(' ');
    const pairs = (s) => { const n = s.match(/-?[\d.]+/g).map(Number), out = []; for (let i = 0; i < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
    const [t, b] = p.getAttribute('d').split('L').map(pairs);
    let top = 'M' + pt(t[0]), bottom = 'M' + pt(b[b.length - 1]);
    for (let i = 1; i < t.length; i += 3) top += 'C' + [t[i], t[i + 1], t[i + 2]].map(pt).join(' ');
    for (let i = b.length - 1; i >= 3; i -= 3) bottom += 'C' + [b[i - 1], b[i - 2], b[i - 3]].map(pt).join(' ');
    const col = columns.indexOf(Math.round(NODES.find((n) => n.id === from).x));
    return { id: from + '->' + to, edges: [top, bottom], start: 0.8 + col * 1.6, fill: to === 'Lost' ? '#EF9481' : '#c4b7a0' };
});

scene('flows', {
    pools: { bands: {}, nodes: {} },
    init() {
        for (const l of LINKS) this.pools.bands.add({ id: l.id, attrs: { d: '', fill: l.fill } });
        for (const n of NODES) this.pools.nodes.add({ id: n.id, attrs: { x: f1(n.x), y: f1(n.y), width: f1(n.w), height: f1(n.h), fill: '#26282d' } });
    },
    seek(local) {
        for (const l of LINKS) this.pools.bands.update(l.id, { attrs: { d: trimPath(l.edges, 0, ramp(local, l.start, l.start + 1.2, 'power2.inOut')), fill: l.fill } });
    },
});
```

The labels are the hand-built pattern's list, placed from `NODES` (each node's `x`, `y + h / 2`) and carrying the printed totals.
The layout is pele's at its pinned version: a newer pele may place the same flows differently, so the version moves only with a look at the result.

## A flowchart laid out by pele

A flowchart, state diagram or timeline written as Mermaid text, drawn by pele into the stage in the page's font and colors, and animated on pele's own SVG: each node rises in and each edge draws along its length, in reading order.
pele measures every label in the font, so it lays out in `init()` once the font has loaded, and `seek()` returns that promise, which holds every frame until the diagram is there; the first seek waits for it, and a development build reports that one wait as KN-170, once.
Its colors and font come from its CSS variables on the box it draws into, `--pele-bg` among them, which is the patch behind an edge's label.
A node's group keeps pele's `transform` attribute, which places it, so a rise moves the node's children: a CSS `transform` on the group would replace the attribute and send every node to the corner.
An edge is a path made one unit long with `pathLength="1"`, its dash moved off by `strokeDashoffset`, and its arrowhead shown once the line has arrived.

```html
<div class="layer" data-component="flow" data-start="0" data-duration="8">
    <div class="diagram"></div>
</div>
```

```css
.diagram { position: absolute; left: 96px; top: 160px; width: 1088px; height: 480px;
    --pele-font: 'Work Sans', sans-serif; --pele-bg: #f4f1ea; --pele-fg: #26282d; --pele-line: #4F43B4; --pele-surface: #efe8db; --pele-border: #4F43B4; }
.diagram svg { width: 1088px; height: 480px; font-size: 22px; }
```

```javascript
const { scene, ramp } = wildflower.kinetic;

const TEXT = `flowchart LR
  cart[In the cart] --> paid[Paid]
  paid --> packed[Packed]
  packed --> shipped[Shipped]
  paid -- refund asked --> refunded[Refunded]`;

scene('flow', {
    init() {
        const box = this.element.querySelector('.diagram');
        this._ready = document.fonts.load('500 22px "Work Sans"').then(() => {
            pele.mount(box, TEXT);
            const svg = box.querySelector('svg');
            const mid = (el) => { const b = el.getBoundingClientRect(); return b.left + b.width / 2; };
            // Reading order, left to right; an edge just before the node it reaches.
            this._parts = [
                ...[...svg.querySelectorAll('.pele-node')].map((el) => ({ el, edge: false, x: mid(el) })),
                ...[...svg.querySelectorAll('.pele-edge')].map((el) => ({ el, edge: true, x: mid(el) - 1,
                    line: el.querySelector('path:not(.pele-marker)'), head: el.querySelector('.pele-marker'),
                    label: svg.querySelector('.pele-edge-label[data-id="' + el.getAttribute('data-id') + '"]') })),
            ].sort((a, b) => a.x - b.x);
            this._parts.forEach((p, i) => {
                p.at = 0.6 + i * 0.45;
                if (p.edge) { p.line.setAttribute('pathLength', '1'); p.line.style.strokeDasharray = '1 1'; }
            });
        });
    },
    seek(local) {
        return this._ready.then(() => {
            for (const p of this._parts) {
                if (!p.edge) {
                    const u = ramp(local, p.at, p.at + 0.4, 'power3.out');
                    p.el.style.opacity = u.toFixed(3);
                    for (const c of p.el.children) c.style.transform = `translateY(${((1 - u) * 16).toFixed(2)}px)`;
                    continue;
                }
                const u = ramp(local, p.at, p.at + 0.5, 'power2.inOut');
                p.line.style.strokeDashoffset = (1 - u).toFixed(4);
                if (p.head) p.head.style.opacity = u >= 1 ? '1' : '0';
                if (p.label) p.label.style.opacity = ramp(local, p.at + 0.3, p.at + 0.7).toFixed(3);
            }
        });
    },
});
```

`direction LR` suits a 16:9 frame; pele lays a diagram with no direction out top to bottom, tall and narrow.
A state diagram has the same parts, `.pele-node` and `.pele-edge`; a timeline or a mind map has its own class names, which the SVG shows (`.pele-…`).

## Checking and rendering

A check returns a report of whether the page is ready and its frames come out the same on two passes, and a render ends with an MP4 file downloaded.
`check({ samples })` seeks a shuffled sample of frames twice, in different orders, and compares what the composition root held each time, down to each animation's position and each canvas's pixels.
Every report carries `ready`, the root's `data-kinetic-ready`, and `errors`, the number of console errors, uncaught errors and unhandled rejections during the seeks.
A passing report is `{ ok: true, frames, samples, ready, errors }`.
A failing one has `reason: 'readiness failed'`, or `reason: 'a seek threw'` with the first message in `firstError`, or describes the first frame that differed: `{ ok: false, frame, time, element, property, first, second, ready, errors }`, where `element` is a selector for the element, `property` is what differed, such as `style`, and `first` and `second` are the two values.

```javascript
const report = await wildflower.kinetic.check({ samples: 30 });
if (!report.ok) console.log(report.reason || 'frame ' + report.frame, report.firstError || [report.element, report.property, report.first, report.second]);
```

`render({ fps })` writes an MP4 from the page with WebCodecs and resolves to `{ blob, name, frames, width, height, fps, codec, audioCodec, ms }`, downloading the file unless `download: false` is passed.
It needs a secure context, https or localhost (KN-200 otherwise).
A render of the page's DOM needs `drawElementImage`, which Chrome has only with HTML-in-Canvas enabled until Chrome 157: paste chrome://flags/#canvas-draw-element into the address bar, set the entry to Enabled and restart Chrome (KN-201 without it; https://developer.chrome.com/blog/html-in-canvas-origin-trial).
A canvas source works in any Chrome.
When the composition has an audio clip, the file has a sound track, AAC unless `audioCodec: 'opus'` is passed, and `audio: false` leaves it out.

```javascript
const { blob, frames, ms } = await wildflower.kinetic.render();
console.log(frames + ' frames in ' + ms + ' ms, ' + blob.size + ' bytes');
```

The Render button on the preview bar of each demo, such as Launch Title (/demos/kinetic-title/), makes the `render()` call.

For many videos from one page, the batch script (`scripts/batch.cjs` in the package) renders the page once for each row of a JSON or CSV file, with the row's values as the composition's variables.

```bash
node batch.cjs index.html rows.json --out renders
```

The same page also renders through HyperFrames (https://kinetic.wildflowerjs.com/docs/hyperframes/).
