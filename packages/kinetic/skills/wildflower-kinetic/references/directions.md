# Directions

Read this for a showreel, a brand film, a sting or a title set at the lively
or bold end of the expression dial (below). It replaces `style.md` for that
piece; `craft.md` still holds, except for the rules this file replaces
("What this replaces", below). An explainer, a lesson, a data story and a product demo keep `style.md`, unless
the brief asks for a reel's energy.

A direction is a whole look and way of moving, chosen once for the piece:
its idea, palette, type, motion grammar, the transitions it allows, its
signature move, and what it never does. One piece takes one direction. The
range of what Kinetic can make lives across the directions; the taste lives
inside each one, which is narrow on purpose. A piece that mixes directions,
or takes a little of everything Kinetic can do, reads as a feature tour, not
as work.

## Contents

- The expression dial
- What this replaces
- Laws for a lively or bold piece
- A bold piece is a system
- The camera in a bold piece
- Checking the pace
- Choosing a direction
- Tells
- The catalogue

## The expression dial

Set it once, from the brief, and keep it for the whole piece. The numbers
are measured from finished work: the calm column from the studio films
`craft.md` cites, the other two from four motion designers' showreels of
2023 to 2026, frame by frame.

| | Calm (`style.md`) | Lively | Bold |
|---|---|---|---|
| For | explainers, lessons, data, a waiting-room screen | a brand film, an illustrated reel, a launch with a story | a showreel, a sting, an opener, a launch cut to a track |
| A shot (a held composition) | 3 to 7 s | 2 to 3 s, about 4 beats | 1 to 2 s, about 2 beats, never under 0.5 s |
| Scene changes a minute | under 10 | about 20 | 25 to 40 |
| Frames near still | over half | about half | a third |
| A scene change takes | 0.5 to 1 s | 0.3 to 0.6 s | 3 to 8 frames at its fastest, then a 0.4 to 0.8 s settle |
| The ground's lightness | holds, changes by beat color | changes every 2 to 4 shots | swings from near white to near black, or a deep color, every 2 to 4 shots |

Reels measured at 89 to 103 beats a minute; at another tempo, scale the
shot lengths to the same count of beats.

A bold brief takes a bold direction (Flythrough, so far), and a lively
brief a lively one. A bold piece also follows "A bold piece is a system",
below, whatever direction it takes.

## What this replaces

For a lively or bold piece, these rules of `craft.md` and `style.md` give
way to the dial and the laws below. Each was written for a calm film that
plays while people wait, and each, followed in a reel, makes it still.

- `craft.md`, "Time", **the target**: a calm piece's holds at twice the
  reading floor, a headline card held 3 s or more. Here a block of text
  holds for the floor and at most about half a second more, and a shot
  lasts the dial's length. The floor itself stays.
- `craft.md`, "Time", **"Move briefly, then hold"**: a hold three times as
  long as the entrance, and the picture near still for half the running
  time. Here the dial sets the share near still and the length of a shot.
- `craft.md`, "Principles for every piece", **"Nothing moves for
  decoration"**: here holds are alive (below).
- `style.md`, all of it: the look, the color, the type, the layout and the
  motion come from the direction.

What stays from `craft.md`: one thing per frame, every frame standing on
its own, hierarchy, the grid, the reading floor, contrast, no flashing, and
every transition saying something.

## Laws for a lively or bold piece

These hold in every direction. Each one is something the measured reels do
and a generated piece does not do unless told.

- **Drift, snap, hold.** The energy is the contrast between stillness and a
  fast move, never a steady medium speed. A shot drifts (a slow push, a
  float, a word typing), a change snaps in the dial's time with the shutter
  blurring it, and the result settles and holds. On a plot of how much
  changes from frame to frame, a good reel is a flat line with tall, narrow
  spikes. A piece where everything always moves a little reads as bland
  however good its frames are.
- **A change carries something across.** Each scene change is one element of
  the outgoing scene becoming, opening into, or flooding into the incoming
  one: a flower shrinks into a logo mark, a word swells past the frame and
  its counter becomes the next ground, a shape's color floods the frame and
  is the next scene's ground. Write the sentence for each (`craft.md`,
  "Motion and structure"). A plain push, fade, zoom or dissolve between two
  unrelated scenes is the fallback, at most one in four changes. A hard cut
  on a strong hit in the music is allowed as punctuation, about once in ten
  seconds; a cut to black, with the next scene lit up out of it over 0.3 s,
  is the strongest of these. In a camera piece, what carries across is the
  world itself: the camera leaves one place and arrives at the next, and a
  cut hides only in a whip or a pass through a plane ("The camera in a bold
  piece", below).
- **Vary the change.** No kind of transition comes twice in a row, and none
  more than three times in a piece. A flood takes the outgoing hero's own
  shape (an arch floods as an arch, a wave rises as a wave, a leaf grows as
  a leaf); a disc floods only where the disc is the motif. Ten changes that
  are all growing circles read as one effect repeated, however well each is
  timed. In a camera piece the kinds are the camera's moves: push, whip,
  tilt, fly-through and rack focus, a push and a whip being two kinds.
- **Swap under blur.** Two things of the same size, place and colors read as
  one becoming the other when the swap happens at the height of a blur: the
  outgoing thing spins or moves fast enough to blur over about 6 frames, the
  incoming one takes its place at the peak, and the blur clears over about 5
  (a ring of small shapes becoming the solid "0" of a year, measured). Use
  two clips overlapping by 8 to 12 frames with
  `data-clip-transition="blur"`, the outgoing thing turning fast through the
  overlap so the shutter adds its own blur. It is the cheapest morph there
  is, for two shapes `matchPaths()` cannot join.
- **Holds are alive.** A held shot is still in its layout, never dead: the
  camera and the back layer travel through the hold at about 5% of the
  frame's width a second (about 100 px a second at 1920, 10 to 15% over a
  shot of 2.5 s), the front layer faster, and one or two small things keep a
  loop (a star turns, a ring revolves). Slower than that, the measure and the
  eye both read the shot as still: a 3% creep over a shot does not count.
  The type does not travel: it holds its place while it is read, and the
  layers move around it. This relaxes `craft.md`'s "Nothing moves for
  decoration" for these pieces; the hero still holds its place in the
  composition.
- **Value carries the rhythm.** Light and dark grounds alternate, and the
  change between them is part of a transition, never a cut to a new ground.
  Color comes in as one hero hue per scene against a ground that is either
  neutral or a full field of one palette color.
- **Busy, then empty.** A dense shot (many cards in a ring, a field of
  shapes, a grid of work) is followed by a nearly empty one (one word, one
  mark). Two dense shots in a row blur into one.
- **Few words, large.** One to three words on screen at once, set large,
  added a word at a time. `craft.md`'s reading floor still holds for every
  word meant to be read (the check script lists them); a word that flies
  past on purpose is marked so in the plan.
- **Cut to the music.** With a track, a scene change lands across a bar line
  and a snap lands on a beat or a hit in the track, from `tempo().at(n)` or a
  beat file, each rounded to a whole frame (`rules.md`, "Motion habits";
  `patterns.md`, "Cuts on whole frames"). Without a track, pick a tempo
  between 90 and 110 and land on it anyway.
- **Open on type, close on the mark.** The piece opens with type treated as
  the direction treats it, after about 1.2 s of the words set plainly
  (`kinds/title-social.md`), and closes on the name or mark, held 3 to 4 s,
  the whole closing scene, its build included, at most 5 s, in a way that
  echoes the opening: the same ground, the same motif. A reel
  of many clients' work in many looks holds together by little else, which
  is why it reads as a list of jobs; a piece in one direction does not need
  to.
- **The shutter stays on.** `config({ shutter: 180 })`: a snap without motion
  blur strobes. Its default 8 samples break a fast move into rings: give a
  fast move about one sample per 3 px of travel a frame (32 for a whip),
  `shutter: { angle: 180, samples: 32 }`, at that cost in render time.
- **Change often.** A lively piece changes scene every 2 to 3 s, about ten
  times in 30 s, and its shots carry beats of their own between (an element
  landing, a ground changing color, a field arriving). Four or five long
  scenes is a calm piece in bright colors.
- **Fill some shots.** At least one shot in three is dense: a field of a
  dozen or more elements arriving as a wave, a ring, a grid, a split frame.
  The others are one hero and its word. A piece of one shape and one word in
  every shot reads as a deck of slides.
- **Layer every shot.** Every shot has a back layer of structure (a grid,
  rings, guide lines, dotted arcs, stripes) in tints of the ground, moving
  slowly and continuously, behind the middle: the hero, its word, and what
  the scene is made of. A front layer is the exception, not the rule: an
  element comes in front only where the scene holds things that could come
  near (the leaves of its field, the stars of its night), as one or two of
  them, nearer, larger and soft. Never a set of accents scattered in every
  shot, and never a soft disc roving across the frame: both read as
  decoration laid over the work. The back and the front never pull focus:
  the back stays within a step or two of the ground's lightness, the hero
  alone is large, sharp and in full contrast, and nothing crosses a word
  while it is read. A hero alone on a flat ground is a diagram, not a
  frame.
- **Light every surface.** One light for the piece, from one side. Every
  ground takes its light as ink, denser away from the light, never as a
  radial spot, which reads as a lit card (`directions/flat-field.md`, "Layers
  and light"), and
  every solid shape is shaded from that light, a tint on its lit side to a
  shade on the other, with a soft cast shadow under what stands. All of it
  within each color's own steps (`style.md`, "Gradation and print"): judicious
  gradation, never a second hue. Flat fills on flat grounds read as unfinished
  however good the composition.

## A bold piece is a system

A bold piece gets its richness from a system, not from more things on
screen: a few objects, rules for how they act on each other and on the
frame, and one agent whose actions set the rules off. Each scene is then the
world reacting, and the piece reads as one made thing rather than a run of
effects. (Two measured reels, and a looping piece built to a track.)

- **One protagonist.** One object (a ball, a mark, a shape) is on screen or
  born in every scene, and causes what happens there: it strikes, draws,
  breaks or opens the next thing. Cuts match on its position and direction.
  A scene it sits out reads as a separate demo.
- **Few objects, many reactions.** Primitives (lines, discs, squares, a
  sphere, a cube), 2D and 3D together in one palette under one light, each
  with a rule: a surface gives under a contact and throws back; the ground
  answers each contact, one frame of a deep shade of the color the contact
  brings; overlaps cancel; a trail becomes geometry (an arc becomes a
  ring). Write the rules down in the plan, and choreograph only what no rule
  covers.
- **One field, many windows.** A single field (a wave, a gradient, a sweep)
  runs under the frame, and each shape is a window onto it, so every shape
  changes state together as the field passes.
- **Blur with three jobs.** Depth: one plane sharp, nearer and farther
  things soft, and a rack focus is a beat. Speed: the shutter, which smears
  a fast corner while the center stays crisp, as no filter can. Transition:
  the frame defocuses to pure color, holds long enough to be a picture, and
  refocuses as the next scene. Soft washes come from flat shapes blurred
  until they merge, not from gradient fills.
- **Speed as shape, chosen once.** Graphic speed (a drag tail behind a round
  head, a stretch only at impact) or optical speed (the shutter alone), one
  for the whole piece.
- **Polarity.** The protagonist is solid on a dark ground and a hole on a
  light one, and can pass through a shape as a moving hole.
- **The ending builds the opening.** In a loop, the last scene makes what
  the first starts from (the protagonist lays down the opening's lines, or
  returns to where it first falls from), so the seam is the system closing,
  not a last frame matched to a first.
- **A loop can close on a symmetry.** A cube or a cage turned a quarter
  turn, or a nest of shapes zoomed by one step of its nesting, is its first
  frame again, so the seam is exact with nothing matched by hand. In a nest,
  set each shape's visibility from its size on screen (in as it grows from
  nothing, out as it passes the frame), never from which one it is: the one
  ending the loop is not the one that started it.

Making it:

- **3D or 2.5D, by what the shot needs.** Both are open; choose per piece
  and say which in the plan.
  - **3D** (Trillium, three.js in a WebGL layer) for what flat faces cannot
    do: curved, lit surfaces (a shaded sphere, a coin's rim), real materials
    and shadows, many objects, solids that pass through each other, and
    stencil tricks such as overlaps that cancel. It costs a WebGL context
    (15 at most with a finish), and the layer is pixels at its own
    resolution.
  - **2.5D** (`solids()` from kinetic.25d.js: solids in 3D only as numbers,
    each face drawn as an SVG path, shaded by its angle to one light, with a
    rim and glows) for a few simple solids (boxes, cages, prisms) in a
    graphic, flat-shaded look (patterns.md, "Solids in 2.5D"). It is sharp at
    any size, costs no WebGL context, and the finish works on it as on
    anything else. Faces that cross each other sort wrong; that is 3D's job.
- **A look from a reference takes its colors and its finish from it.** Read
  the colors off the reference's own pixels (its ground, its darkest and
  lightest tones, the color of its glows and edges) and build the ramp, the
  glows and the rim from those. Judge its finish the same way: how strong
  and coarse its grain is, whether it moves, how far its glows spread and
  how soft the whole frame is. Set the finish's `grain`, `bloom` and
  `diffuse` to match, and compare a frame shown As Rendered on the preview
  bar with the reference.
- **Diffuse lightly.** `finish: { diffuse }` softens the frame toward a
  filmed look and lifts the darks as it does. Look at the darkest frame with
  As Rendered on the preview bar, with and without it, and back it off when
  the blacks turn to haze.
- **Stacked gradients show a mesh.** Chrome dithers every gradient with the
  same pixel pattern, so dozens of translucent gradients stacked (glows,
  washes) add up to a fine screen-door mesh in the bright areas. Put them in
  one layer with a blur of about a pixel.
- **No filter inside a mirrored copy.** A filter on an element that a `<use>`
  repeats (a floor reflection, a mirrored half) stalls playback and can
  flash. Filter the original and its copy together, from a group around both.
- **Scale the finish with the frame.** A piece drawn at 540 and taken to 1080
  keeps its SVG units, but the finish counts pixels: double the grain's
  `size`, the bloom's `radius` and the `aberration`, or the look changes.

## The camera in a bold piece

In a bold piece with a camera, the camera is how scenes change: in a
measured reel it moves in 61% of frames, and 3% are cuts. (Two measured
reels and five studies.)

- **The camera is the transition.** In a piece that uses camera moves,
  every change of scene is one: a push, a whip, a tilt, a fly-through or a
  rack focus. The scenes are places in one world, and the camera travels
  between them; a flood, wipe or dissolve among them breaks the world into
  slides. A cut hides only inside a whip, at full speed, or a pass through a
  plane, while the camera is inside a lit panel and the frame is one color.
  Choose camera or not
  once, for the whole piece, and say which in the plan.
- **A world of planes, turned as a group.** Put the scene's things on layers
  at their depths with `depth()` and move through them with `camera()`:
  truck, push, and a few degrees of tilt and roll, so near things pass
  faster than far ones. Three or more depths turned together read as a
  place; one flat card turned reads as a slide. A rack focus between depths
  is a beat: blur each layer by its distance from the focus plane. A layer
  the camera flies past fades on its own layer over the last 500 px before
  the camera reaches it (P − z), so it passes and never fills the frame.
- **Fast in, long settle.** A move reaches full speed in about 0.2 s and
  settles over about 0.6 s: `interpolate()` with three keys and the
  `'smooth'` ease, the middle key placed for the attack. A move at one
  steady speed reads as a slide sliding.
- **Most moves curve.** Start one axis a little before or after the others,
  so the path bows off the straight line by a quarter to half its length;
  now and then let a move overshoot its mark by a few percent and come
  back. Keep whips straight, and never add shake. (In a measured reel, six
  of eight moves curved; the two straight ones were whips.)
- **Nothing in motion stops partway**: the camera, a line drawing on, a word
  growing. A move stops only where it ends, and a move that runs into a
  hold hands its speed to the hold's drift instead of settling to zero
  first. A move frozen for even a few frames, as on a short stop in the
  track, reads as a stutter. The end is the other way round: a settle
  reaches its value at a set time and holds dead still, never creeping
  toward it, because text under a camera moving a fraction of a pixel a
  frame snaps a whole pixel at a time.
- **Few big layers on screen at once.** When the camera pulls back over
  many places, the large layers behind them (grids, grounds) all redraw
  every frame, and in the browser the cards in front tear for a frame. Give
  such a shot one shared background layer, not one per place, and mark a
  layer that is detail only `data-viewmode="render"`, so it is in the video
  and stays out of the playing page (`api.md`, "Control").
- **A whip carries the cut.** Up to about 10% of the frame a frame, the cut
  at full speed, the next shot moving the same way at that speed, then
  settling. The next ground travels in with its shot at its own depth; it
  never just changes color behind. Set both shots' cameras on every seek.
- **Words keep their own color.** A word never shares a color with anything
  that crosses behind or in front of it during a move: where they cross, the
  word is lost.
- **Draw magnified layers finer.** Under a turned camera (pan, tilt or roll)
  Chrome draws a layer at its CSS size and stretches it as the camera nears,
  so its edges step. Give such a layer `depth(z, { detail, camera:
  cameraAt(t, tracks) })`, detail near its largest magnification (2 to 4),
  the layer 100% of the world. Judge edges at 2x.

## Checking the pace

Before rendering, run the check script with the dial: `node
<this skill's folder>/scripts/check.cjs <page> --pace lively` (or `bold`).
It seeks every frame and prints the share of frames near still, the snaps
a minute, the longest stretch near still (the end card aside), the
brightness range, the share of each frame in smooth ramps (light and
shading) and the tones each frame uses, each beside the dial's target,
marking each one that misses. Fix every miss before rendering: more scene
changes, shorter holds, faster drift, denser shots, a darker ground, light
and shading, layers. Never meet a target with clutter (accents, soft discs,
particles added for the number): the measure counts change, and the eye
counts clutter. A large flat field moving changes almost no pixel, so a
flat direction reads stiller than it looks; its file says what its still
share may read. A miss stands only when the brief itself asks for
what causes it (a calm passage, a long hold on one image), and the plan
quotes the brief; the agent's own preference is no reason. The four
measured reels read 26 to 44% near still, 25 to 96 snaps a minute, 22 to
31% of a frame in ramps and 15 to 24 tones; the default style reads near
90% still, under 10 snaps, 3% in ramps and 4 to 7 tones.

## Choosing a direction

1. Read the catalogue below and pick the directions that could carry the
   subject. A direction that needs material the piece does not have (footage,
   interface screens, product renders) is out, unless the user can supply it.
2. For each, write one sentence joining something only this subject has (its
   name, its material, its numbers, its place) to the direction's device:
   "each project is a field of its brand's color that floods into the next"
   for Flat field.
3. When more than one direction fits and the user is there, offer the two
   strongest in the plan, each with its sentence, and build the one they
   choose. When one fits, or no one can answer, build the strongest and
   write the choice at the top of the plan.
4. Read the direction's file, take its palette, type and grammar whole, and
   change only what the brief or the brand fixes. A brand's colors replace
   the direction's palette role for role (ground, ink, hero, cue).

## Tells

These make a piece read as generated: none is wrong in itself, but each is
what a model does by default, without a reason. Check the frames and the
plan for them before rendering.

| Tell | Instead |
|---|---|
| Everything moves at one medium speed, all the time | Drift, snap, hold |
| Every element fades up, with the same ease and the same 0.5 s | The direction's grammar: a few move kinds, timed to the beat |
| A push, fade or cross-dissolve between every pair of scenes | A change that carries something across |
| Each scene a new idea, with nothing that returns | One motif that transforms through the piece and closes it |
| One abstract word per scene naming a quality ("Shape", "Time", "Motion") | Words from the subject, or none; the scenes show the quality |
| One shape and one word in every shot | Dense shots between the sparse ones |
| Four or five long scenes in 30 s | A change every 2 to 3 s |
| Flat fills on a flat ground, nothing behind or in front of the hero | Light every surface; layer every shot |
| A 1 to 3% camera creep as the only life in a hold | Layers traveling about 5% of the frame a second |
| A soft blob or sparkle in front that nothing in the scene explains | A nearer piece of the scene: its leaf, its motif, its spark |
| Small sharp accents scattered in every shot, like sprinkles | No front layer, or one or two nearer pieces of the scene, soft |
| A soft disc roving across every shot | None |
| A radial spot of light on every ground | The ground's own darker ink, multiplied, denser away from the light |
| Every transition a growing circle | The outgoing hero's own shape, and other kinds between |
| Paper ground and one small accent, throughout | The dial's value swings and a hero color per scene |
| Bright colors glowing on near-black, by default | Only in a direction that lists it, with a reason in the subject |
| Gradients between two or more hues | One color's own steps (`style.md`, "Gradation and print") |
| Everything centered, every shot | The direction's layout; one centered moment, the mark |
| A word replaced by the next in the same place, word after word | Words that build up, or one word per shot |
| A bounce or overshoot on every arrival | One overshoot kind, kept for the hero |
| 3D, particles or a camera move added for spectacle | Only what the direction lists, carrying the sentence; in a bold piece the camera's moves are its changes of shot ("The camera in a bold piece") |
| One flat card turned in 3D, or a camera at one steady speed | Planes at depths turned as a group; fast in, long settle |
| Camera moves between some scenes, floods or dissolves between others | Every change a camera move, or none |
| Invented figures, client names or quotes | Real material, or none |

## The catalogue

Each direction is a file in `directions/`. Deal only from the written ones.
Two are written so far, one at each level, so pieces at a level will share
its look until more are written.

| Direction | Dial | The idea in a line | Needs |
|---|---|---|---|
| [Flat field](directions/flat-field.md) | lively | the frame is a field of flat color; shapes are the actors, and each scene floods into the next | nothing but the subject's words; no characters or faces |
| [Flythrough](directions/flythrough.md) | bold | one dark world of lit planes at depths; the camera travels through it, and every change of scene is the camera arriving somewhere new | a subject with places or parts that can stand in one space; colors that glow on black |

Planned, not yet written: Interface cinema (light, glass and interface panels
in perspective, driven by a cursor; needs screens of a product), Type
monument (one heavy face as the only actor, warped and inverted on the beat),
Pencil and paper (Kinetic's drawn line sketching itself in, then turned to
material). Until each is written, do not imitate it from this line.
