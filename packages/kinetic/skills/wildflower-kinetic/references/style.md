# The default style

Read this when the brief says nothing about the look. Anything the user asks for wins over it: a palette, a ground, a font, a mood, a reference to match. When the brief gives some style and not the rest, follow what it gives and take the rest from here.

The aim is a piece the person is proud to show others: calm, considered, and printed in feel. It should look as if a designer made it with time to spare.

## Contents

- The look
- Color
- Type
- Layout
- Motion
- Finish
- Gradation and print
- Texture and imagery
- Sound
- Trillium and 3D
- A finished video page
- Interactive pieces

## The look

- **Printed paper and ink.** Warm paper with ink on it, muted color, texture, simple repeated geometry, and layered depth. Bright colors glowing on a near-black ground read as a tech demo, so they are out.
- **One idea per moment.** Each frame says one thing. Between moves, things hold, and one thing moves at a time (rules.md, "Motion habits").
- **Everything serves the message.** An element that is pretty but carries nothing is cut, however good it looks.
- **Of a piece.** Shapes have no outlines; fills meet fills. A box is a solid fill with rounded corners (8 to 12 px), never a box with a colored stripe down one side.

## Color

The default palette is the house style's. Vary it to suit the subject (a forest can be greener, a medical piece cooler), keeping its character: a warm neutral ground, ink for text, one accent, one cue, and a muted series for data.

| Role | Light (the default) | Dark |
|---|---|---|
| ground | `#efe8db` paper | `#22201d` |
| raised surface, a panel or a quiet button | `#e4dbca` | `#2e2b27` |
| ink, all text | `#26282d` | `#efe8db` |
| muted text, axes, secondary labels | `#6e685f` | `#a69e91` |
| line, a track, a gridline | `#ddd3c2` | `#3a3632` |
| accent, the subject | `#B1A8FF` lavender | the same |
| cue, the current moment only | `#EFC187` pale amber | the same |
| text on any accent, cue or series fill | `#26282d` | the same |
| data series, in this order | `#B1A8FF`, `#90CDEF`, `#EF9481`, `#4280A2`, `#cf86a8` | the same, fifth `#d99ab8` |
| deep ground, for a dark scene | `#26315c` indigo, with `#efe8db` text | the same |

- **Color sells the piece.** Give each beat a full ground of its own from the palette (indigo, the cue, the accent, sky `#90CDEF`, coral `#EF9481`, paper), changing from scene to scene: the color sets the mood and marks the rhythm. Open on one of the colors, not on paper: the first frame sets the look, and pieces that all open on paper look alike whatever their type. Paper is one ground among the others, and the ground throughout for a quiet piece. A palette held to paper and one small accent reads dull. A lesson, and a single chart that stays on screen throughout, keep paper and carry the color in their marks, since a ground that changes under them changes every mark's contrast: each series in its own palette color at full strength. A scene may set marks aside in a tint, but the last stage gives every mark its color back, so the finished chart is in full color. A single chart can still open on a colored title and close on a colored card with its finding. Text on a colored ground is ink, or paper on indigo, at the contrast below.
- **Context in tints, not gray.** On a colored ground, supporting marks are a lighter or darker tint of that ground's own hue (a darker amber on amber, a pale lavender on lavender), and the hero takes a color that stands apart from the ground (indigo on amber, amber on indigo).
- **The dark column** is for a piece whose subject asks for it throughout: night, space, a cinema-style title, a product shown on black.
- **The accent is for fills and strokes, and text stays ink.** Lavender on paper is too faint to read as text. A word in the accent color is set on an accent fill in ink instead.
- **The cue marks "now" and nothing else:** the step being explained, the value that just changed, the beat that just landed.
- **Data:** series colors mark data and never set text; labels stay in the ink. A series color under 3:1 against the ground (on paper, all but the steel blue) is a fill only: a bar, an area, a slice. A line or a small dot in it takes a darker step of its hue, at 3:1. Never tell two series apart by hue alone where they sit close in lightness (lavender and coral). Label series directly, beside their lines or bars, rather than through a legend.
- **Contrast:** text meets 4.5:1 against what is behind it, and 3:1 for display type of 48 px and up. Check it where text sits over an image or a gradient.
- **Lightness, not hue alone.** A video stores color at a quarter of the resolution of brightness, so text or a thin line set apart from its ground by hue alone smears once encoded. Every text color differs from its ground in lightness.
- **Never full saturation.** Fully saturated reds and magentas bleed and clip after compression; keep accents a step below full chroma.

**Other palettes.** When the brief asks for another mood, or the person picks one at intake, use one of these in place of the default, with the same roles and rules. Each takes its raised surface, line and muted text from its ground mixed toward its ink (about 7%, 15% and 70%). Text on a fill takes the fill's lightness into account, not the palette's: the ink on a light fill, the ground on a dark one, whichever reaches 4.5:1 (the table gives it for the accent), and a fill where neither does carries no small text. On the deep ground the subject takes whichever of the accent and the cue reaches 3:1 against it. A dark palette's deep ground is its ground lifted toward its accent; its beat grounds, the opening's among them, are its accent, its cue, its deep ground, or a tint of one of them, never a series color at full strength.

| Palette | Its voice | Ground, ink | Accent, cue, deep ground | Text on the accent | Series, in order |
|---|---|---|---|---|---|
| Okabe-Ito Clarity (light) | neutral, scientific, colorblind-safe: education, research | `#FAFAF7`, `#1A1C20` | `#0072B2`, `#E69F00`, `#08203A` | the ground | `#0072B2`, `#56B4E9`, `#009E73`, `#CC79A7`, `#D55E00` (the 2nd and 4th are fills only) |
| Carbon Signal (light) | systematic, data first: enterprise, analytics | `#F4F4F4`, `#161616` | `#6929C4`, `#F1C21B`, `#1C0F30` | the ground | `#6929C4`, `#1192E8`, `#005D5D`, `#9F1853`, `#198038` |
| Paper and Navy (light) | literate, considered, authoritative: economics, policy, research | `#F4F2EE`, `#1C2430` | `#1F3A5F`, `#C9A13B`, `#2B4A40` | the ground | `#1F3A5F`, `#3E6E9E`, `#3F7F6E`, `#8A6E9E`, `#B5523B` |
| Newsprint (light) | stark and urgent, black and white and one red: news, sport, sales, a manifesto | `#F3F1EC`, `#161616` | `#C8352B`, `#F2D04B`, `#161616` | the ground | `#161616`, `#C8352B`, `#7A7A7A`, `#3F6C8F`, `#C9BFAE` (the 5th is a fill only) |
| Riso (light) | playful, printed in bright inks: explainers, children, culture, a launch | `#F5EFE3`, `#1F2440` | `#EC6DA8`, `#F3CF3E`, `#2D4C9C` | the ink | `#EC6DA8`, `#2F78C4`, `#F0843C`, `#1F8A84`, `#7A5BB0` (the 1st and 3rd are fills only) |
| Terracotta Field (light) | warm, earthy, handmade: artisanal brands, food, lifestyle, craft | `#F2ECE2`, `#2A231F` | `#AA4A28`, `#2E7C74`, `#261B16` | the ground | `#AA4A28`, `#2E6E8E`, `#6F8A3A`, `#9A7020`, `#7D7268` |
| Midnight Ledger (dark) | composed, quietly premium: finance, consulting | `#0E1621`, `#E6EBF1` | `#7FB2E5`, `#E3B35C`, `#27384c` | the ground | `#7FB2E5`, `#3A7BC8`, `#9A7FD1`, `#8CC7A1`, `#D98277` |
| Harbor Graphite (dark) | grounded, editorial: documentary, journalism, maps | `#16191D`, `#EEF0F2` | `#4FB3A9`, `#E8B04A`, `#233b3c` | the ground | `#4FB3A9`, `#2A7F78`, `#8E7CC9`, `#9AA5B1`, `#E07A5F` |
| Nordic Frost (dark) | cool, soft-spoken, focused: software, education, long tutorials | `#2E3440`, `#ECEFF4` | `#88C0D0`, `#EBCB8B`, `#425360` | the ground | `#88C0D0`, `#5E81AC`, `#A3BE8C`, `#B48EAD`, `#BF616A` |
| Flexoki Ink (dark) | warm, analog, literary: video essays, writing | `#100F0F`, `#CECDC3` | `#3AA99F`, `#D0A215`, `#19312f` | the ground | `#3AA99F`, `#4385BE`, `#879A39`, `#8B7EC8`, `#D14D41` |

## Type

- **Choose the type by the piece's voice.** Use the pairing below that fits the subject and the audience; Work Sans for everything when none fits better, or when the brief wants the house look. A face the brief or the person names wins. The subjects after each voice are examples, not a list to match the brief against: choose by the feeling the piece should carry (a celebration, a warning, a quiet explanation), so the same pairing does not turn up every time.
- **Work Sans.** Load it from Google Fonts with `display=block`, so a render never draws the fallback: `<link href="https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,100..900;1,100..900&display=block" rel="stylesheet">`.
- **A pairing:** a display face for titles and a body face for the rest, both from Google Fonts in one link with `display=block` (`?family=Urbanist:wght@100..900&family=Literata:wght@200..900&display=block`; a face with fixed weights, such as Barlow, lists them: `wght@400;500`). The weights are the pairing's own, in place of the 800 to 900 below.

| Pairing (display + body) | Its voice | Display weight | Body weight |
|---|---|---|---|
| Urbanist + Literata | modern and friendly over a bookish serif: education, editorial | 800 | 400 to 500 |
| Oswald + Lora | condensed and loud over a warm serif: news, sport, a poster | 600 to 700, uppercase sits well | 400 to 500 |
| Playfair Display + Source Sans 3 | high-contrast serif over a clean sans: culture, events, luxury | 700 to 900, at 64 px and up at 1920, since its hairlines thin out smaller | 400 to 600 |
| DM Serif Display + DM Sans | refined and warm: a product, a brand, a quote | 400, its only weight | 400 to 500 |
| Space Grotesk + IBM Plex Sans | technical and exact: software, engineering, data | 600 to 700 | 400 to 500 |
| Barlow Condensed + Barlow | narrow and sturdy, many labels to a frame: dashboards, transit, sport | 700 to 800 | 400 to 500 |
| Mona Sans, wide + Manrope | wide and bold over a precise geometric sans: launches, music, events | 700 to 800 at `font-stretch: 112%` to `125%`, loaded with its width axis (`Mona+Sans:wdth,wght@75..125,200..900`) | 400 to 500 |
| Sora + Inter | clean geometric with a little quirk: tech, digital products | 600 to 700 | 400 |
| Fraunces + Chivo | soft-vintage serif over a sturdy grotesque: artisanal brands, lifestyle, editorial | 600 to 700 | 400 |
| Abril Fatface + Lato | a fat titling serif over a warm sans: magazines, beauty, agencies | 400, its only weight | 400 |
| Bebas Neue + Montserrat | cinematic capitals over a geometric sans: film titles, fitness, posters | 400, its only weight, all capitals | 400 to 500 |
| Archivo, wide + Archivo | heavy and wide over its own text width: breaking news, sales, announcements | 800 to 900 at `font-stretch: 112%` to `125%`, loaded with its width axis (`Archivo:wdth,wght@62..125,100..900`), capitals sit well | 400 at 100% |
| Fredoka + Nunito | rounded and friendly: children, explainers, playful products | 600 | 400 to 600 |
| Cormorant Garamond + Proza Libre | elegant, high-contrast serif over a humanist sans: fine dining, literature, luxury | 600 to 700, at 64 px and up at 1920, since its hairlines thin out smaller | 400 |

- **Display in Work Sans:** weight 800 to 900, tracking -0.02 to -0.04 em, short lines. **Body and captions:** weight 500 to 600, line height 1.25 to 1.35, lines no wider than about 18 em.
- **With Work Sans, at most one serif**, upright, and only where the subject wants warmth (a story, a quotation, a historical subject): Bitter, from Google Fonts. A pairing brings its own faces instead. Never an italic display serif.
- **Sizes at 1920 by 1080** (scale by two thirds at 1280 by 720): titles 96 px and up; a caption or step text 44 to 56 px; body 32 to 36 px; the smallest label 22 px. Nothing smaller, since a video is watched at a distance and on phones. These are the sizes to choose from, not to use together: one frame uses at most two of them, plus a small label, the larger at least twice the smaller (`craft.md`, "Composition").
- **Numbers that change** hold their width as they count: tabular figures (`font-variant-numeric: lining-nums tabular-nums`), or, in a face without them (Oswald), the number in a box as wide as its widest value, right-aligned, so the words after it hold still. **Monospace** only for code and small technical labels.
- **Animate HTML text by whole words.** Scaling HTML text stutters; a per-letter weight or scale effect is `text()` on a canvas (api.md, "Type with a weight per letter").

## Layout

- **A safe area of 5% on every side** (96 px at 1920, 64 px at 1280). Text stays inside it.
- **A grid, held.** Text aligns to the left edge of the safe area unless a single centered title is the whole frame. Once a thing is placed, it does not drift.
- **Generous space, in blocks.** Gather the empty space into one or two large blocks, never scattered: a text frame keeps at least a third of its area bare, and a card that carries one idea at least two thirds (`craft.md`, "Composition"). Resist filling it.

## Motion

rules.md, "Motion habits", sets how things move. On top of it:

- **Quick and readable.** Movement is brisk, and every frame stands on its own: think of the film playing on a screen while people wait for a meeting to start. Each block of text holds fully on screen, still and readable, by the rules in `craft.md`, "Time": in this calm style, about twice the subtitle floor, so a headline card holds at least 3 s and a 10-word line about 7 s, the cap in `craft.md`, with more for a chart the viewer takes in. The check script's reading pass lists every block that leaves before the floor; fix each one, by holding it longer or cutting words, unless a word is meant to fly past.
- **Scene changes are moves.** A color change between scenes comes through an element that grows to fill the frame, or a wipe, never a hard cut to a new ground and never a cross-fade, which muddies the two colors between them.
- **Restraint with effects.** A wiggle is a pixel or two; shadows are soft and blurred; a texture's movement is slow, about twice a second.
- **Keep the subject sharp.** Depth of field goes around the title and the subject, through `focus()` with a `depth` band, never as a rack that blurs each word in turn.

## Finish

Start every page with a light finish:

```javascript
wildflower.kinetic.config({ shutter: 180, finish: { grain: 0.08 } });
```

The shutter gives motion blur in the render, and the grain gives the paper its tooth. The grain holds still, as paper's does; grain that changes every frame (`grain: { amount, fps: 30 }`) boils, and is for a brief that asks for film. No vignette, bloom or heavy grain unless the brief asks; a brief that asks for a clean, crisp, or flat look sets `grain: 0` and `shutter: 0`.

## Gradation and print

**Steps of a color are mixed, never picked.** A tint mixes the color toward the surface it sits on (paper, the deep ground, or a colored beat ground) and a shade toward the deep ground, never toward white or black, in OKLab: `color-mix(in oklab, var(--accent), var(--paper) 40%)`. Use the steps 85%, 65%, 40% and 20% toward the surface, and 30% and 60% toward the deep ground. A step keeps its color's role, so a tint of a series still belongs to that series, and the cue has no steps. The "darker step" a line or set-aside mark takes (Color, above) is one of these, its contrast computed, never assumed.

**Gradients stay within one color.** A gradient runs over at most three neighboring steps of one color, from the ground to a tint, or from the deep ground to a shade, drawn `linear-gradient(in oklab, …)`. Between two palette colors, only as a rainbow roll (below). No gradient on a data mark. The lightest point of a gradient sits behind or beside the focus. Animate a gradient's position, slowly, never its colors, and keep the finish's grain on over a large one, which hides banding.

**Printed ink.** `shade()`'s `'crachis'` sprays each ink as drops, the spatter of 1920s and 1930s French posters such as Jean Carlu's and of today's textured flat illustration, and `'ink'` mixes the same inks smoothly, as ink mixes on paper. Flat color stays the default. Reach for print when the piece's feeling is printed or crafted (a poster, an illustrated scene, a travel or heritage subject, art deco, a hand-made brand, a title card) or when a shape needs depth; leave it out of data marks, interface, and a brief that asks for clean or flat. A spray in a step of the color under it is drawn `blend: 'normal'`, so each drop is that step; multiplied, the drop would be the step times the color, about two steps darker.

*A ground.* A background gradation is light falling on the beat's one color, over at most three neighboring steps of it, never a second hue: a sky (deeper toward the top, paler toward the bottom, as aerial perspective has it), a spot (lightest behind or beside the focus, deepening toward the edges), or a lift (the color easing into its 20% tint across the frame).
- **Smooth or sprayed.** Smooth for a clean piece. Sprayed for a printed or crafted one: the ground with its own 15% shade or 25% tint sprayed on, at about 0.7 density, a tint spray that reads as tooth and light. A step two or more apart, or another hue, sprayed across a ground is loud; it is a halo, not a ground.
- **Text sits where the field is calmest.** Display type can cross a tint spray; small text sits on the flat part, or on a sky whose steps run along its lines. Check contrast at the field's worst point behind it.
- **A halo** is a lighter step, or the cue, sprayed around one subject or headline and thinning outward; it is small.
- **A rainbow roll** is the one ground where two hues meet: two or three inks blended across it, overprinted drops making the color between. The inks are neighbors on the color wheel (gold into teal through green, yellow into pink through orange); opposites overprint to brown. Give the blend about a third of the frame, with solid ink on each side.

*An illustration.* Flat shapes, each in one color, take their depth from spray, as in textured flat illustration and on Carlu's sunfish:
- **The shadow side:** the shape's own 30% shade, a `path()` along the edge away from the light with `side` into the shape (one side, never both), cut to the shape, at about 0.6 density with a smooth falloff over a third of the shape's width, so it is a scatter at the edge thinning to nothing; the lit side stays flat. A roof takes it down the slope away from the light, and a wall under eaves takes it along the eave line. A near-white shape (paper, cream) takes its 15% shade instead: at 30% it turns gray.
- **The lit edge:** on a larger shape, its tint (about 35% toward white), at about 0.45 density along the edge facing the light, and a small glow of the ground's tint can spill off that edge into the sky behind, as haze.
- **The cast shadow:** a soft pool of the ground's shade under a standing object or a group, an ellipse flattened along the ground line, densest at the middle of the foot and fading on every side, cut at the ground line so none of it lands on the object.
- **The sky behind:** at most sparse specks of the ground's tint, about 0.2 density, thickest toward a corner; a stripe or a dense field there competes with the subject.
- **Surface:** a path, a field or a wall can carry a sparse spray of a neighboring step for its grain, at 0.2 to 0.4 density.
- **Faces and type stay flat**; a figure's clothes and props can take a little shadow spray.
- **One layer to a depth plane** (far hills, the middle ground, the front), its marks covering every shape in it, at most four inks: each layer is a WebGL context, and a page holds only so many. A layer moves with its plane: put its canvas inside the moving element, or give it `move`.

*Both.*
- **Crachis or ink.** Crachis where the texture is part of the look and the field is still or moves as one; ink where drops would be busy: behind lines of text, on small fields, or as a smooth ground in a cleaner piece.
- **Type is solid ink, never sprayed.** It meets contrast at the worst point of the field behind it; a halo can spray around letters, as Carlu's does, and the letters stay flat.
- **One light for the piece**: every sky, spot, shadow side, lit edge and cast shadow falls from the same side.
- **The drops hold still** (`fps` 0): a ground's light can drift slowly and a shape can move with its spray, but colors never change and drops never re-seed. One dot size through a piece, 1.6 px by default, larger (2.5 to 3) for a coarse, hand-sprayed poster.
- **One printed field leads a frame**; the rest are quieter.

## Texture and imagery

Use Kinetic's own tools for texture: `shade()` for stipple, halftone and grain that varies across the frame, `effect()`, `boil()` for a hand-drawn line, and the finish's grain. Do not fetch stock photographs or textures from the web (looking up facts is another matter, and expected). When the user supplies images or names a source, use those, and credit them where the license asks.

## Sound

Silent unless the user provides a track or asks for sound. Never compose music. A page with sound starts silent. Without the preview bar, Kinetic puts a speaker button over the stage's lower right corner, outside the composition, so no render shows it: it turns the sound on and off and nothing else, while a click on the picture pauses. It shows for 2 s as the page starts, then while the pointer is over the stage and for 3 s after a touch, and left alone it always fades, so a page running unattended in a hall or a talk shows nothing over the picture. The page needs no button of its own.

## Trillium and 3D

Bring in Trillium where depth enriches the piece: an object the viewer should understand in the round (a neuron with its axon, a molecule, a machine), a stage for a simulation, or something the learner turns or explores. Never 3D for decoration, and never where it pulls the eye from the point.

- **Lit like a studio on paper:** a hemisphere light in the ground's colors, a warm key that casts soft, light shadows, fog or a transparent canvas matched to the ground, and `NeutralToneMapping`. On a dark ground, add a rim light in the accent.
- **Materials from the palette:** the accent for the subject, the series for parts, paper and ink tones for the rest. Matte or softly satin surfaces; no chrome unless the subject is metal.
- **Labels stay HTML,** in the type above, placed over the 3D point: the three extension's view gives a point's place on its canvas with `view.projectPoint(x, y, z)`, `{ x, y }` in CSS pixels, or `null` behind the camera.
- **The camera moves slowly and with purpose,** over seconds, on `power2.inOut`, to show the thing that matters, and holds there.
- **It is still a Kinetic piece:** the 3D answers to the clock, the steps and the data, and the words and the motion carry the message.

## A finished video page

A video on its own page plays as one: fitted to the window (`config({ fit: true })`), with nothing over it. Kinetic gives it the rest, so the page writes none of it: a click on the stage pauses it, with a large pause mark over the center until a second click plays it again, and the loop holds the last frame 3 s before it starts again, time to take in the final frame (`config({ loop: { hold } })` for another length, `loop: false` to stop there). A page with sound starts silent, with Kinetic's speaker in the corner (see "Sound"). Add `fit: true` to the page's `config()` call, beside the shutter and the finish. The page around the fitted frame is a dark neutral none of the scenes uses (`#111`), so the margin never reads as part of a scene when the ground changes.

## Interactive pieces

Every lesson uses one layout, so one is consistent with the next (the recipe is in patterns.md, "A lesson's layout").

Everything, the lesson and its controls, fits in one 16:9 composition (1280 by 720), fitted to the page with `config({ fit: true })`. Nothing of the lesson sits outside the frame.

**The left column**, from the top left of the safe area:
- the step's heading, display type at 44 px, twice the 22 px body, with one or two lines of body under it (the interface is not counted in the two sizes a frame: the band, the prompt to the learner, each control's name and value, and a value tag that follows a control);
- a question's choices, when the step asks one, stacked under the body, each a filled button, the explanation appearing under them once answered. They show in the video too, where the script picks the answer;
- the current step's own controls, and only those, under the choices: each a name, its value, and the control.

**The illustration**, the scene of the step, in the rest of the frame above the band.

**The band** along the bottom of the safe area: "Step 2 of 6" and the step's title at the left, play and pause and replay the step in the middle, and Back and Next at the right. No scrubber: a step is short, and Replay starts it again.

**The flow.** A step plays, then holds on its last frame for Next; Kinetic never moves on by itself. Next follows `$kinetic.canAdvance`, so it is ready at once on a step with nothing to answer, and the learner can skip what is left of the step. On a question it waits for the right answer, then lights while the explanation plays.

The band and the step's controls are inside the composition root and show in interactive mode alone (`data-show="$kinetic.mode === 'interactive'"`), so `check()` and a render, which run in video mode, never draw them. In the video their space stays empty paper: the layout is the same in both modes, and nothing else moves into it.

**On a phone held upright** the frame is too small for the band to read or tap. The page shows a note over the frame, "Turn your phone sideways", on a narrow screen in portrait (`@media (orientation: portrait) and (max-width: 600px)`), outside the composition root. Held sideways, the frame is large enough, and the layout stays the same.

**Buttons** are solid fills with 10 px corners in Work Sans 600: Next in the accent with ink text once it can be used, and on the raised surface with muted text while it cannot (never faded with opacity); the rest on the raised surface. A right answer turns its button to the accent fill and plays the explanation; a wrong one turns coral (series 3), shows a line saying why, and keeps the step waiting. The learner's own values (a slider's number, their answer) are shown in one color throughout the lesson, the accent. The last step offers "Start again". Prompts addressed to the learner ("Your turn: drag the slider") are in the second person and appear only in interactive mode.
