# Flythrough

Dial: bold. Read with `../directions.md`, whose laws hold here, and its
"The camera in a bold piece", which this direction is built on.

The piece is one dark world of lit planes at depths, and the camera travels
through it. Each scene is a place in that world (a cluster of panels, lines
and words), and every change of scene is the camera leaving one place and
arriving at the next: a push, a whip, a tilt, a fly-through, a rack focus.
Light on black: saturated hues that glow against a near-black ground.
Measured from two reels, a fast neon reel and a camera tutorial (the camera
moving in 61% of frames, 3% cuts, each move fast in and long to settle), and
from five camera studies and an encoder test of its palettes.

## Contents

- When to choose it
- Palette and ground
- The world
- Type
- Motion grammar
- Transitions
- The signature move
- Finish
- Never in this direction
- A 20-second arc

## When to choose it

A sting, an opener, a launch cut to a track, a showreel: a piece that should
feel like an event. It fits a subject with places or parts that can stand in
one space (cities, products, features, chapters, a timeline), each a place
the camera reaches. It is wrong for a calm or warm subject, a lesson, data
that must be read exactly, or a brand whose colors cannot glow on black.

## Palette and ground

Three palettes, each a ground, its lighter step toward the light, and three
hues. A brand's colors replace the hues role for role, each pushed to its
brightest step that is still the brand's.

| Palette | Ground | Lift | Hues |
|---|---|---|---|
| Sodium night | `#0B0712` | `#2A1530` | `#FF3D7F` `#FFB01F` `#3DE8FF` |
| Ultraviolet | `#08061C` | `#1E1650` | `#7A5CFF` `#FF4FD8` `#5CFFB8` |
| Deep blue | `#04081A` | `#0E1E52` | `#2F5BFF` `#00C2FF` `#FFD447` |

- **The ground is never pure black**: it carries its hue, lifted toward the
  light as a linear ramp from the ground to its lift across the frame, never
  a radial spot.
- **One hero hue per place**, the other two as its lines and accents. The
  places take the hues in turn, so the color moves through the piece.
- **The value swing is light.** The dial's swing from dark to light comes
  from the camera passing into a lit plane until it fills the frame
  (Transitions, below), not from a light ground.
- **Through the encoder.** Each palette was rendered to MP4 and re-encoded
  at 5 Mbps, still and under a whip at 10% of the frame a frame: the hues
  hold to 1 or 2 levels in 255, and the 5 Mbps copy is within 1 of the
  render. Two things the encoder does: it doubles the steps of a dark ramp
  (grain hides them, so grain is on; Finish, below), and it rings a lit line
  under 4 px (keep lit lines 4 px or more, with their glow).

## The world

- **Places at three or more depths.** Each place is a cluster of panels,
  lines and words on layers at their depths (`depth()`), a far layer of
  structure (lit lines, a grid, frames), a middle of panels and the word, and
  now and then a near piece passing. Three depths turned together read as a
  place; one flat card turned reads as a slide.
- **Panels are lit**: a fill in the hue with a gradient within its own steps
  toward the light, rounded corners, and a glow of their own color
  (`box-shadow: 0 0 80px <hue>`). Lit lines are 4 to 6 px with an 18 to 24 px
  glow. Every glow is something the world explains: a lit panel, a line, a
  word, never a soft disc on its own.
- **Places stand apart in space**, a frame or more apart in x, y or z, so the
  camera travels between them. Lay out the whole world first, in one
  coordinate system, and write each place's position in the plan.
- **Depth of field.** The plane the camera is looking at is sharp; nearer and
  farther layers blur with their distance from it (a `filter: blur()` on
  each layer, in px, set in `seek()`), and a rack focus between them is a
  beat.

## Type

- **A heavy grotesque, very large**, one to three words a place: Archivo
  900 or Bricolage Grotesque 800, tight tracking.
- **White on the ground**; a hue for the one cue word. On a field of a hue,
  the type is in the ground's color, except on the violet or the blue, which
  take white.
- **A word is a plane in the world.** The camera reaches it and settles; it
  holds for the reading floor while the layers around it keep drifting; then
  the camera leaves. A word that passes on purpose is marked in the plan.
- **No word in a color that crosses it** during a move (`../directions.md`,
  "Words keep their own color").

## Motion grammar

- **The camera moves in most frames.** Things in a place move little: a
  panel lands, a line draws, a word types. The energy is the camera's.
- **Fast in, long settle**: every move a three-key `interpolate()` on the
  `'smooth'` ease, full speed by about 0.2 s, settled by about 0.6 s.
- **A hold keeps pushing**: a slow push or truck of about 5% of the frame a
  second through every hold, so no frame is dead.
- **Tilt and roll a few degrees with the move**, the whole world turning as
  a group: three panels turned together, with a rack focus between them,
  read as a place.
- **Magnified layers drawn finer.** A layer the camera brings close while it
  is turned gets `depth(z, { detail, camera: cameraAt(t, tracks) })` (`api.md`,
  "Camera").
- **Moves on the music**: a move's attack starts on a beat, and a whip's cut
  lands on a hit. A stop in the track is met by a move timed to end on it,
  never by freezing one partway (`../directions.md`, "Nothing in motion
  stops partway").

```javascript
const { scene, camera, cameraAt, depth, interpolate } = wildflower.kinetic;
const P = 1000;

// Two places 2600 px apart; a whip between them on the beat at 2.4 s.
const tracks = (t) => ({
    x: interpolate(t, [2.4, 2.62, 3.6], [0, 1300, 2600], { ease: 'smooth' }),
    tilt: -4 * Math.sin(Math.min(1, t / 6) * Math.PI),
});

scene('world', {
    init() {
        this.world = this.element.querySelector('.world');
        this.panels = this.element.querySelector('.panels');   // a layer 100% of the world
    },
    seek(t) {
        const tr = tracks(t), at = cameraAt(t, tr);
        Object.assign(this.panels.style, depth(-300, { perspective: P, detail: 2, camera: at }));
        Object.assign(this.world.style, camera(t, tr, { perspective: P }));
    },
});
```

## Transitions

Every change of scene is a camera move, and no kind twice in a row
(`../directions.md`, "Vary the change"):

- **A push** to the next place, nearer or farther down the world.
- **A whip**: at up to about 10% of the frame a frame, to a place beside
  this one. When the places are too far apart for one world, the cut sits
  at full speed, the next shot moving the same way at that speed, its ground
  traveling in with it, and both shots' cameras set on every seek.
- **A pass through a plane**: the camera flies into a lit panel until its
  color fills the frame, the moment of light, and out of the far side into
  the next place, the cut hidden while the frame is one color.
- **A fly-through**: down a corridor of frames or lines at their own size
  (`depth(z, { fill: false })`), each fading on its own layer over the last
  500 px before the camera reaches it.
- **A rack focus**: the camera holds and the focus moves to a nearer or
  farther place, which becomes the scene.
- **A tilt**: the world turns as a group, bringing the next place round.

## The signature move

A whip that lands on a hit and settles into a lit word, the next place's
ground traveling in with it. The piece's strongest hit gets it, once.

## Finish

```javascript
wildflower.kinetic.config({
    shutter: { angle: 180, samples: 32 },
    finish: { grain: { amount: 0.06, fps: 30 }, bloom: { amount: 0.6, threshold: 0.7, radius: 28 } },
});
```

Moving grain over every dark ramp, bloom on the light, 32 samples for the
whips (about 34 s of rendering a second of video at 1080). A little
`diffuse` may soften the frame toward film; back it off when the blacks turn
to haze (`../directions.md`, "Diffuse lightly").

## Never in this direction

- A flood, a wipe, a dissolve or a plain cut between places.
- A camera at one steady speed, or a flat card turned on its own.
- A light ground, or a gradient between hues as a ground.
- A glow that nothing in the world explains.
- A lit line under 4 px, or a dark ramp without grain.

## A 20-second arc

Shots of about 2 beats; the camera arrives somewhere about every 1.5 s.

| Time | Place | Move in |
|---|---|---|
| 0 to 1.5 s | The first word lit up out of black, alone | a slow push from black |
| 1.5 to 6 s | Two or three places of the subject, each a hero hue | a whip on a hit, then a push |
| 6 to 10 s | The densest place: many panels at depths, turned as a group, a rack focus between them | a tilt |
| 10 to 14 s | A fly-through on the track's biggest entry, into the next place | a fly-through |
| 14 to 16 s | One quiet word, the camera nearly still | a pass through a plane |
| 16 to 20 s | The mark, reached last, the camera settling to a dead stop for the hold | the signature whip |
