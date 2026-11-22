# Flat field

Dial: lively. Read with `../directions.md`, whose laws hold here.

The frame is a field of flat color, and shapes play every part: a disc, an
arch, a petal, a wave, a star, a hill cropped by the frame's edge. Each scene
is one composition of a few large shapes on one ground (the background
color), and each scene ends with one of its shapes growing, opening or
flooding until its color is the next scene's ground. Nothing is drawn as a
person; the color and the shapes carry the feeling. The numbers come from
an illustrated showreel, leaving out its characters: the most saturated of
the reels measured, a shot of about 2.5 s (4 beats at 96 a minute), about
20 scene changes a minute, and half its frames near still.

## Contents

- When to choose it
- Palette and ground
- Shapes
- Layers and light
- Type
- Motion grammar
- Transitions
- The signature move
- Finish
- Never in this direction
- A 30-second arc

## When to choose it

Choose it for a brand film, a studio or product reel without footage, an
opener, a campaign or a cause: subjects with a feeling to get across more
than a thing to show. It needs nothing but the subject's words, so it is the
direction for a brief with no material. It is wrong for an interface, a product that
must be seen, or data that must be read exactly (`kinds/data-story.md`).

## Palette and ground

- **A full ground for every scene**, one palette color filling the frame,
  never paper throughout. Take a palette with warm, mid-light grounds and a
  deep one: Riso, Terracotta Field, Canopy, Lavender Clinic, or the default
  palette's beat grounds (`style.md`, "Color"). A brand's own colors replace
  them role for role.
- **Order the grounds by value**, so light and dark alternate: a pale
  ground, a mid one, the deep ground, a pale one. The deep ground comes at
  least once a piece, as its night scene.
- **Three colors a scene**: the ground, the hero shape in a color that
  stands apart from it in lightness, and tints of the ground's own hue for
  everything else (`style.md`, "Context in tints, not gray").
- **The hero shape's color is the next scene's ground** wherever the scene
  ends in a flood (Transitions, below). Plan the ground order and the hero
  colors together.
- Shapes in the middle layer are fills, never outlined, and fills meet fills
  with no line between. Lines are only for the back layer's structure.

## Shapes

- **Built from `shape()` and plain paths**: discs and half-discs, sectors,
  stars and polygons, arches (a rectangle with a half-disc on top), waves
  (a path of repeated cubic curves), petals and leaves (two arcs), hills (a
  disc much larger than the frame, cropped by its bottom edge).
- **Large, and cropped by the frame.** The hero shape fills a third to a half
  of the frame's height, and the shapes behind it run off the edges. A field
  of small, whole shapes in the middle of the frame reads as clip art.
- **A pattern field is texture**: many small shapes of one kind (leaves,
  dots, stars, letters of the alphabet) in a tint of the ground, from a
  repeater (`patterns.md`, "A repeater"), seeded with `random(seed)`, kept
  behind the hero and out of the type's area.
- **Depth from one light**, smooth or printed (Layers and light, below).

## Layers and light

Only the color is flat. Every shot of this direction is three
planes under one light. In the four reels measured, 22 to 31% of the frame
is in smooth ramps of light and shading, with 15 to 24 tones; a frame with
no layers or light has about 3% and 4 to 7 tones. A layered shot built to
these rules measures about 16% and 17 tones.

- **The back layer is structure.** One or two kinds for the whole piece,
  chosen with the idea: a grid, rings around the hero (some dashed or
  dotted), guide lines, dotted arcs, stripes, a horizon. Strokes 3 to 4 px at
  1920, in a tint of the ground one or two steps lighter (85% or 65% toward
  the ground's own lighter step), so it reads as texture, not as a subject.
  It moves all through the shot: a grid slides, rings turn, lines scroll.
- **The middle is the hero, lit.** A solid shape takes a gradient of its own
  color from the piece's one light, its lit side a tint and its far side its
  30% shade, and a soft cast shadow in the ground's shade under what stands
  on something. Large shapes behind the hero (hills, half-discs) take a
  vertical ramp of their own color, lighter toward the light.
- **The front layer is rare, and shows the scene's own things, nearer.**
  Most shots have none. Where a scene is made of many things that could
  come near (a field of leaves, a night of stars), one or two of them may
  pass in front, larger and out of focus, keeping their own shape and color,
  moving with the camera and faster than the back, never over a word being
  read. Do not scatter a set of small accents across shots (they read as
  cake sprinkles), and do not move a soft disc across the frame (it reads
  as a lens effect laid over the work); both distract.
- **The ground takes its light as ink**, never as a radial gradient: a
  radial spot reads as a lit card, one round hotspot fading evenly every
  way, and makes the frame look flat. The ground is a canvas under the scene with a `shade()` layer of
  kind `'ink'` (`api.md`, "Shading, light, grain and blur"): two bands of
  one darker ink of the ground's own color multiplied over it, denser away
  from the light, so the field deepens the way a second pass of ink does,
  and two inks overprint (yellow under an orange ink goes warm, never gray).
  Paper takes a warm ink (the paper mixed 14% toward orange); a cool ink on
  paper reads as dirty gray.
- **Move far enough to be seen.** On the pace check this direction's still
  share reads high, since its large flat fields change few pixels as they
  move: up to 65% passes when every shot's layers move, and do not add a
  front layer only to bring the number down. The camera and the back layer
  move about 5% of the frame's width a second, any front element about twice
  that; the type holds its place. In a layered shot, a 120 px push over 5 s
  reads 99% still; 500 px over 5 s, with the grid sliding 120 px a second,
  reads 55%.

The ground's ink, on a canvas that is the scene's first layer over its flat
ground color:

```html
<div id="night" class="layer" data-component="night" data-start="…" data-duration="…" style="background: #2D4C9C">
    <canvas class="layer" width="1920" height="1080"></canvas>
    …the back layer, the hero, the word…
</div>
```

```javascript
wildflower.kinetic.layers.scene('night', {
    layers: [{
        id: 'ink', kind: 'html', src: 'canvas',
        look: {
            shade: {
                kind: 'ink',
                // denser toward the bottom and the right, away from a light at the top left
                marks: [
                    { band: { from: [0, 1080], to: [1920, 1080], width: 1000, side: 'left' }, ink: '#1F2440', amount: 0.6, falloff: 'smooth' },
                    { band: { from: [1920, 1080], to: [1920, 0], width: 1500, side: 'left' }, ink: '#1F2440', amount: 0.4, falloff: 'smooth' },
                ],
            },
        },
    }],
});
```

Each ink layer is a WebGL context, and one per scene is well within a
page's limit. In a browser with no GPU each seek
draws them in software, and a check of every frame takes many minutes; in a
desktop browser and in a render with a GPU they cost little.

The shapes take their light as linear gradients in SVG, each stop a step of
one color mixed in OKLab beforehand (`style.md`, "Gradation and print"),
never a second hue, and a cast shadow is a flat ellipse in the ground's
shade, its edge softened, never a radial gradient:

```html
<defs>
    <linearGradient id="sun" x1="0.2" y1="0.1" x2="0.8" y2="0.95">  <!-- lit from the top left -->
        <stop offset="0" stop-color="#FBE48E"/><stop offset="0.5" stop-color="#F3CF3E"/><stop offset="1" stop-color="#C99A22"/>
    </linearGradient>
</defs>
<g class="back" stroke="#3A58A4" stroke-width="3" fill="none">…the grid, moved by its layer…</g>
<ellipse cx="1330" cy="830" rx="300" ry="40" fill="#233B79" opacity="0.6"/>
<circle cx="1300" cy="470" r="250" fill="url(#sun)"/>
```

A grid that slides forever is a transform from the time, wrapped at its
spacing: `back() { return 'translate(' + ((this.local * 120) % 200 - 200) +
' 0)'; }` for lines 200 px apart. In a piece whose feeling is printed,
`shade()`'s spray can replace the smooth gradients (`style.md`,
"Printed ink"), with the same one light.

## Type

- **One face, one to three words a shot**, in ink on a light ground and in
  the ground's color on the deep ground. Rounded or soft faces suit it:
  Bricolage Grotesque, Fredoka, Besley, DM Serif Display, each with its own
  pairing for small text (`style.md`, "Type").
- **The type sits in the field's calmest part**, never over a pattern field
  without a block of flat ground under it.
- Letters may arrive as shapes do, growing from their baseline with the
  direction's overshoot, a letter at a time, staggered 0.04 to 0.06 s.

## Motion grammar

- **Shapes enter by growing** from a point or from their base (`scale` from 0
  on `back.out`, or `{ spring: { duration: 0.5, bounce: 0.2 } }`), by
  unrolling (a sector's sweep, a wave's length), or by changing from the
  shape before (`matchPaths()`). Never a fade alone.
- **Shapes leave by shrinking to a point** on `power3.in`, faster than they
  came, or by being covered by the flood.
- **A field arrives as a wave**: its small shapes grow in with `stagger()`
  from the center or from one edge, 0.04 to 0.08 s apart, the whole field in
  under 0.8 s.
- **Something moves through every hold**: the layers move (Layers and
  light, above), and one or two things loop through a hold, a ring turning, a star swelling
  ±3%, a wave sliding, on `sine.inOut` with a period of 2 to 4 s (a track of
  two keyframes half a period apart, `extrapolate: 'mirror'`, so it swings
  forward and back for as long as the scene holds).
- **One overshoot kind**, the spring above, for the hero and letters only;
  everything else settles on `power3.out`.
- **Timing at about 96 a minute**: a shot of 4 beats (2.5 s), the change in
  the last 0.5 to 0.7 s of it, landing on the bar; a field's wave starts on
  the beat after the hero lands.

## Transitions

Every scene change is one of these, and a piece uses at least four of
them: never the same one twice in a row, none more than three times
(`../directions.md`, "Vary the change"). Ten changes of which eight are
growing discs read as one effect repeated; a rising sea, a hard wipe, a leaf
and an arch each flooding in its own shape, a push and two swaps under blur
read as ten different moments.

**A rise.** The ground of the next scene comes up from the bottom edge as
the outgoing scene's own horizon (a wave, a hill line, a row of roofs),
across the whole width, on `power3.in`, and covers the frame before the cut.
For a sea rising to become a yellow sky at 1920 by 1080: a wave path 40 px
deep and 1500 px tall, translated up from 1140 to -120 px over 0.55 s while
it slides sideways.

**A flood.** The outgoing scene's hero grows in its own shape (an arch as an
arch, a leaf as a leaf; a disc only where the disc is the motif) until it
covers the frame. Its color is the incoming scene's ground, so the change of
clip, on the frame the flood completes, cannot be seen. The hero is a `shape()` placed by its
own `<g>`, last in the scene's SVG so it covers everything, and its path
moves between two shapes with the same commands, from `matchPaths()`. At full
size the shape must reach past the frame's farthest corner from its center
everywhere along its edge, not only at its points: a polygon's or a star's
edges pass well inside its corners, so grow a disc, or check a frame.
`shape('star')` draws straight edges, which read as a hard polygon at a
hero's size; a sun, a moon or a dot is a disc of two arcs.

```html
<div id="meadow" class="layer" data-component="meadow" data-start="0" data-duration="5">
    <svg class="layer" viewBox="0 0 1920 1080" width="1920" height="1080">
        <!-- the scene's hills, field and words come first -->
        <g transform="translate(1310 420)"><path class="sun"></path></g>
    </svg>
</div>
<div class="layer night" data-component="night" data-start="meadow" data-duration="5">…</div>
```

```css
#meadow { background: #F5EFE3; }          /* this scene's ground */
.sun { fill: #2D4C9C; }                   /* the hero, in the next scene's ground */
.night { background: #2D4C9C; }
```

```javascript
const { matchPaths } = wildflower.kinetic;

// A disc of radius r centered on its <g>, as two arcs.
const disc = (r) => 'M 0 ' + -r + ' A ' + r + ' ' + r + ' 0 1 1 0 ' + r + ' A ' + r + ' ' + r + ' 0 1 1 0 ' + -r + ' Z';

// The sun at rest, and the same disc grown past the corners: the farthest
// corner from (1310, 420) is 1467 px away.
const [SUN, FIELD] = matchPaths([disc(120), disc(1700)]);

wildflower.kinetic.layers.scene('meadow', {
    layers: [{ id: 'sun', kind: 'svg', src: '.sun', content: { d: { at: [4.4, 4.9], to: [SUN, FIELD], ease: 'power3.in' } } }],
});
```

The flood takes the last 0.5 to 0.7 s of the shot on an `.in` ease, so it
accelerates into the cut, and the incoming scene's first move settles out
of it on `.out`. It completes at least 3 frames before the clip ends and
holds the full cover to the cut: a frame caught mid-growth just before the
cut shows a corner of the old scene, and the cut can be seen. Save the last
few frames of the clip (`check({ frames: [...] })`) and look at each. The incoming
clip starts on the frame the outgoing one ends (`data-start="meadow"`),
both edges on whole frames (`rules.md`, KN-114).

**An opening.** The incoming scene appears through the outgoing hero's shape,
as through a window: the incoming clip starts while the outgoing one plays,
and an element inside it carries a `clipPath` that grows from the hero's
shape and place to past the frame (`patterns.md`, "A clip that changes
shape"). Use it for "we go inside": a window, an eye, a door, a circle that
becomes the world.

```javascript
const [WINDOW, ALL] = matchPaths([
    'path("' + shape('sector', { radius: 120, to: 360, cx: 1310, cy: 420 }) + '")',
    'path("' + shape('sector', { radius: 1560, to: 360, cx: 1310, cy: 420 }) + '")',
]);

wildflower.kinetic.layers.scene('inside', {
    layers: [{ id: 'view', kind: 'html', src: '.view', look: { style: { clipPath: { at: [0, 0.6], to: [WINDOW, ALL], ease: 'power3.out' } } } }],
});
```

The clip starts 0.6 s before the outgoing one ends (`data-start="meadow -
0.6"`), with no `data-clip-transition`, and the clip path goes on a layer
inside it (`class="layer view"`), never on the clip's own tag.

**A change of shape.** The hero becomes the next scene's hero in place, by
`matchPaths()` (`patterns.md`, "A shape that becomes another"), while the
ground changes behind it by a flood from another shape: a sun becomes an eye's
iris, a petal becomes a flame. Use it whenever the two shapes share a
meaning; it is the direction's best transition.

**An assembly.** Many small shapes (squares, discs, half-discs, stars, each
in a palette color) gather from scattered places into a ring, a letter or
the mark, staggered from one end, turning as they come; then the gathered
form turns fast and is swapped under blur for the solid shape it makes, in
one color (`../directions.md`, "Swap under blur"). It is the direction's
strongest opening, and a good close, where the small shapes become the mark.
(A measured showreel opens this way: a star, a ring of about thirty shapes
in 2 s, the ring blurred into a "0", the year's other digits landing around
it.)

**A split frame.** For the piece's busiest moment, the frame splits into two
or three panels, each its own ground and composition, and the panels change
on alternate beats, never together; then one panel's shape floods across
all of them and the frame is whole again. Keep it to one passage of 2 to 4
bars.

**The fallbacks**: `iris` and `wipe` from the clip attributes, at most one
change in four.

## The signature move

One shape is the piece's motif. It is the hero of the opening, comes back in
at least two scenes as something else (the sun, then an iris, then a planet),
and is the dot or the counter of the mark at the close. Name it in the plan
with the sentence for each of its changes.

## Finish

```javascript
wildflower.kinetic.config({ shutter: 180, finish: { grain: 0.1 } });
```

Still grain gives the flat color a paper texture. No bloom, aberration or vignette.

## Never in this direction

- Characters, faces, hands, animals or any other figure you draw yourself.
  A figure belongs only in a piece whose user supplies the artwork, as
  layered SVG Kinetic can move.
- An outline on the hero or the shapes it acts with, a glow around a shape,
  3D, photographs or footage.
- A gradient between two hues. Light and shading within one color's own
  steps is required.
- A hero alone on a flat ground with nothing behind or in front of it.
- A second typeface for display, or text over a pattern field.
- A plain cut to a new ground.

## A 30-second arc

At 96 a minute, a bar is 2.5 s; twelve bars, eleven shots, ten changes.
Dense shots are marked; the rest are one hero.

| Bar | Shot | Ground | Change out |
|---|---|---|---|
| 1 | An assembly, dense: about thirty small shapes gather into a ring, swapped under blur for a solid disc, the motif | pale | the disc floods |
| 2 | The name builds a letter at a time around the disc, which is its "o" | the disc's color | the "o" becomes a sun |
| 3 | A sun over hills, a field of leaves arrives as a wave, dense | mid | the hills rise |
| 4 | Night: the disc is a moon, stars arrive from the center, dense | deep | an opening through the moon |
| 5 | Inside the moon, one petal, one word from the subject | pale | the petal becomes a flame |
| 6 | A split frame, dense: three panels, each its own ground and shape, changing on alternate beats | three | the middle panel's arch floods as an arch |
| 7 | The flame over a field of small shapes in its tints | mid | the flame shrinks to a point |
| 8 | One word on an empty ground, the quietest shot | the flame's color | a wipe |
| 9 | Waves of the motif in three sizes, rolling across | pale | they roll off fast, swapped under blur |
| 10 | The disc alone, swelling on the beat twice | deep | an iris |
| 11 to 12 | The mark, its "o" the motif, held 4 s | the opening's ground | none |
