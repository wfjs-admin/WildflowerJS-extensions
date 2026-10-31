# Craft

Read this before step 1 of the procedure, for every piece. It holds what every
Kinetic piece follows, whatever its kind; `kinds/` holds what applies to one
kind alone, and `style.md` the default look.

## Contents

- The bar
- The intake
- The plan
- Principles for every piece
- A visual idea
- Composition
- Color and value
- Time
- Motion and structure
- Judging a frame
- Still to come

## The bar

The message comes first. A piece exists to make the viewer know, feel or do
one thing, and every choice on the page is in service of that: what is
shown, how big, in what color, for how long, and how it moves. An element
that does not serve the message goes, however good it looks.

Part of every message is the way it is made. A viewer judges what they are
told by how it is told, so the design is professional, clear, appropriate to
its audience and setting, and excellent. A clean, correct piece that looks
like a default slide deck has not met the bar.

## The intake

Ask the user, in one message, the questions below that the brief leaves open
and whose answers would change the piece. Ask none that the brief already
answers, and at most five in all, counting the questions the kind file adds:
pick the five whose answers would change the piece most. Where no one can answer (a batch, an unattended
run), choose a sensible answer for each, and write the choices at the top of
the plan, so they can be seen and changed.

1. **The message.** What should the viewer know or feel at the end, in one
   sentence?
2. **The audience and the setting.** Who watches, and where: a screen in a
   meeting room while people wait, a website's opening, a phone feed with the
   sound off, a classroom, a talk.
3. **The length.** How long, and whether it loops or plays once.
4. **The look.** The brand's colors, fonts and logo, or the default style
   (`style.md`), with Work Sans or one of its other type pairings, and the
   default palette or one of its others.
5. **The material.** The data, the text, the images, the footage and the
   sound there are, and which of them is fixed.

The kind's file in `kinds/` adds the questions that matter for that kind.

## The plan

Before writing the page, write the plan and confirm it:

- the message, in one sentence;
- the audience and the setting, and what follows from them (a screen across
  a room needs bigger type and longer holds than a laptop);
- the kind, or the mix of kinds, with the file for each read;
- the scenes in order, each with the one thing it says, its hero (the one
  number, phrase, shape or line the eye goes to first), what supports the
  hero, its visual idea ("A visual idea", below), and its start and
  duration;
- the length a brief fixes, and what is cut to fit it ("Time");
- the choices made for any question no one answered.

## Principles for every piece

- **One thing per frame.** Each frame says one thing, and has one hero. What
  supports the hero is smaller, quieter and lower in contrast.
- **Every frame stands on its own.** Paused at any moment once a scene is in,
  the frame says its one thing with nothing moving: a still a viewer could
  read and understand without the frames around it.
- **Hierarchy by scale and weight.** The hero is the largest or heaviest
  thing in the frame, by a clear margin; a viewer can say what to read first,
  second and third.
- **A grid, held.** Text and shapes align to the safe area's edges and to a
  grid; once placed, they do not drift (`style.md`, "Layout").
- **Legible at its distance.** Type sizes and contrast suit the setting
  (`style.md`, "Type" and "Color"); text never sits on a busy picture
  without a ground under it.
- **Color carries meaning and mood.** On the marks, a color marks a
  category, a magnitude or the hero, and keeps that meaning. The ground sets
  the mood and the rhythm, a full color for each beat. Never color
  scattered for decoration.
- **Text holds until it is read** ("Time", below).
- **Motion serves the message.** A move shows change, order, cause or
  emphasis. The hero moves; what supports it stays still or moves on one
  calm, predictable path. Nothing moves for decoration.
- **Direction means something.** Left to right reads as time and progress,
  upward as growth; a move against those reads as reversal or decline.
- **Every figure checked.** Before finishing, recompute each number the piece
  states from its source or its model, and confirm the animation shows the
  same at the frame that states it.

## A visual idea

Restraint alone makes a tidy report, not a piece people remember. Each scene
also has one visual idea: an image, a metaphor or a transformation that shows
its one thing instead of labeling it, chosen in the plan before any layout.

- **Show the thing, not a box about it.** Rides growing month by month can
  be a route line that lengthens; a city's growth, its stations lighting up
  on a map; a loss of energy, heat rising off a band; a quote, the place it
  was said. A heading over a chart is the fallback, never the first idea.
- **The idea carries the data.** The image is drawn from the figures (the
  line's length is the rides, the map's dots are the stations), so it is
  the chart and the picture at once, never decoration beside the chart.
- **One idea a scene, and a thread through them.** A motif that returns (a
  route, a shape, a line) ties the scenes into one piece, and the closing
  scene brings it back.
- **The transition is part of the idea.** One scene's image becomes the next
  scene's (the route line becomes the chart's axis, a dot becomes a city)
  rather than leaving for a new one.
- **Still the message first.** An idea that makes the frame harder to read,
  or needs explaining, is the wrong idea: try another, or fall back to the
  plain chart done well. (Ordinary Folk's School of Motion manifesto: one
  subject in a large field, each scene turning into the next; Buck's IBM
  watsonx film: one circle that multiplies is the brand idea; Pentagram's
  Light/Years and Müller-Brockmann's *der Film*: the words themselves as the
  image.)

## Composition

- **Two type sizes a frame.** One frame uses at most two sizes, plus a small
  label, and the larger is at least twice the smaller; on a title frame,
  four times or more. A step of 1.2 to 1.5 times reads as a mistake, not a
  hierarchy. Headings inside a run of text take a heavier weight, not a new
  size. The rule counts the piece's own type (titles, captions, labels);
  text inside something the piece shows, an app's screen or a document, is
  the subject and keeps its own sizes. (Vignelli, *The Vignelli Canon*,
  p. 82; the Unigrid; posters by Müller-Brockmann and Hofmann, measured.)
- **Empty space in blocks.** Gather what is left empty into one or two
  large blocks, never scattered gaps. A frame of text keeps at least a third
  of its area bare, and a card that carries one idea at least two thirds; a
  chart may fill its own area, with the text kept clear of it. (Measured
  posters, 24 to 50% of a frame's dimension in one block; studio text frames
  half to 80% bare; DIA's word cards over 98%.)
- **One family.** One typeface family on a frame, hierarchy by size, weight
  and position. Two exceptions, each its own role: a quotation may be set in
  the house serif where `style.md` allows one, and code or a technical label
  in monospace. Numbers that change stay in the family with tabular figures
  (`font-variant-numeric: tabular-nums`), so they hold their width. (Vignelli;
  the Unigrid; Psycho and DIA's Squarespace film.)
- **Few left edges, each used twice.** Three or fewer x positions where
  text starts, each shared by at least two elements, the display element
  aside. Small text shares an edge with the large text it belongs to, and a
  label hangs from the word it qualifies. (Müller-Brockmann's *der Film*;
  Hofmann; Buck's IBM watsonx film, measured.)
- **A grid from the type, and a fixed scaffold.** Positions and gaps are
  multiples of one unit made from the body's line height. What repeats
  across the piece (a title, a label, a band) sits at the same place in
  every frame; only the content changes. (Vignelli's Unigrid; Studio Dumbar's
  Amsterdam Sinfonietta; Marber.)
- **Mass off center, balanced.** The visual mass sits at least about 11% of
  the frame from its center, with the small text on the other side to
  balance it. A single centered title frame is the exception. (Six posters,
  measured.)
- **Display words scaled to the frame.** On a title frame the display line
  spans most of the safe area's width, not a default size. (*der Film*;
  Hofmann's Rothko Chillida.)
- **Group by space.** The gap between groups is at least twice the gap
  between lines. (Hofmann's Gubler Zurkinden; the Unigrid.)
- **One system of angles.** Everything is level, or everything near a
  rotated element shares its angle. (Müller-Brockmann's Musica Viva.)
- **Short lines.** A line of reading text is about 35 to 40 characters, at
  most two lines of about 42 on screen at once; split longer text across
  holds. (Ruder; Bringhurst; Netflix.)
- **Let the words be the image** when an idea in them can be: their length,
  overlap or scale carrying the point before a picture is added. (*der
  Film*; Pentagram's Light/Years.)
- **Type where the image is not.** Over a picture, text overlaps no part of
  the subject and keeps its contrast. (Ferro; `style.md`.)

## Color and value

- **One dominant ground, a small accent.** The ground or main field is about
  60 to 90% of the frame, and it may be a full color, changing from beat to
  beat (`style.md`, "Color"); the accent that carries meaning stands apart
  from it and is small, under 1% of the frame as a mark and well under 10%
  as a shape. (Measured posters;
  Buck's watsonx; Vignelli: color "as a signifier, or as an identifier".)
- **Layers by value, not hue.** In grayscale, the element meant to be in
  front differs most from the ground. (Albers, *Interaction of Color*.)
- **Judge color as rendered**, against its real neighbours in a still, not
  from the stylesheet. (Albers.)
- **Contrast for video.** Text 4.5:1 against what is behind it, display type
  of 48 px and up 3:1; the masters' lower ratios on paper are no license on
  a screen. (WCAG 2.2.)

## Time

- **The floor.** Each block of text is fully on screen, still and readable,
  for at least 1.5 s, and at least 0.5 s plus 0.375 s a word, counted from
  the moment its last word is legible, with 1 s more for a figure (BBC
  Subtitle Guidelines; Karamitroglou 1998). The check script's reading pass
  lists every block that falls short.
- **The target.** A calm piece holds about twice the floor, and a headline
  card at least 3 s, as finished studio work does (Buck, Illo, measured).
  A chart the viewer must take in holds longer than its words alone. One
  text state holds at most about 7 s, except the end card and a chart
  (Netflix); the cap wins over the target, and a line too long to read in
  7 s is cut or split.
- **A fixed length wins over the target, never over the floor.** When the
  brief fixes the length, the holds come down toward the floor to fit it;
  if they would go below it, cut material (a scene, a figure, words) and say
  in the plan what was cut. Never shorten a hold below the floor to keep
  everything in.
- **Words build up, never replace.** Words may arrive one at a time, but
  each one stays: readers look back at 10 to 15% of what they read (Schotter,
  Tran and Rayner). One word replacing another belongs to a brief that asks
  for it. Reveal in reading order, one element at a time.
- **Similar text, similar time.** Two lines of about the same length hold
  for about the same time. (BBC.)
- **Clean changes.** When text replaces text, swap it within 2 frames or
  leave a real gap of 0.5 s or more, never a near-gap between, and change it
  with the scene, never across a scene change. (Netflix; BBC.)
- **Move briefly, then hold.** An entrance takes under about 1 s and is
  followed by a hold at least three times as long. In a piece that carries
  text, the picture is near still for at least half the running time; a
  piece with no text, or with a voice carrying it, may drift. (Illo and Buck,
  measured; Ordinary Folk's School of Motion manifesto, measured.)
- **Calm, then a burst.** The rhythm alternates calm passages with short
  bursts, never constant energy. (Ordinary Folk, measured.)
- **No flashing**: nothing flashes more than three times in a second.
  (WCAG 2.3.1.)

## Motion and structure

- **Every transition says something.** Write down what each one means, in a
  sentence: "this becomes that", "we go inside", "the year turns". A
  transition with no such sentence is decoration; a transformation of one
  scene into the next says more than a cut. (Buck; Headspace; Ordinary Folk.)
- **One path for each element.** An element leaves along the direction it
  came in, or stays; it does not wander. (Saul Bass, *Psycho*.)
- **Mass settles.** A slight overshoot, then rest; the last frame of every
  move is still. Squash and stretch belongs to a brief that asks for it.
  (Thomas and Johnston's principles; Mat Voyce.)
- **Orient first.** The opening seconds establish the subject and where we
  are, before any detail. (The *Game of Thrones* titles, as their makers
  describe them.)
- **Show only what the piece explains.** No move reveals an unfinished edge
  or an object the piece never names.
- **Close where you opened**, and hold the end card at least 3 s: the last
  content frame relates visibly to the first. (Microsoft Azure explainer and
  Ordinary Folk, measured; Oddfellows' Figma film.)

## Judging a frame

Look at each still from `--frames` and answer these. A frame that fails one
is redesigned before motion is added.

1. What is this frame's one thing? Would a viewer who sees only this frame
   get it?
2. What is its visual idea? If the answer is "a heading over a chart" or
   "a heading over text", look for the image that shows the thing.
3. Where does the eye go first? Is that the hero?
4. Is anything in the frame not serving the message? Remove it.
5. Is the text big enough and long enough on screen for the setting?
6. Does the color mean something everywhere it is used?
7. Is the frame balanced, with the space left empty doing work, or does it
   look unfinished, crowded or centered by default?
8. How many type sizes, and how many left edges? Two sizes at least twice
   apart, and three edges or fewer, each used twice.
9. Grayscale it in your head: does the hero still come forward?
10. Would a professional studio's client sign this frame off as it is?
11. For a chart, has it had the data-ink pass (`kinds/data-story.md`), and
    does each mark's size follow its number?

Then, across the piece: does each transition say something, does the rhythm
rest between bursts, does the end echo the opening, and does the reading
pass list nothing?

The kinds' files add their own rules. Where a rule here and the user's
brief disagree, the brief wins, and the plan says so.
