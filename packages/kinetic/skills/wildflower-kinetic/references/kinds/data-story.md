# A data story

A piece whose message is in numbers: a chart, a flow, a year in review, a
report's findings. Read with `../craft.md`.

## The intake, added

- What is the one takeaway the data supports? A chart without a takeaway is a
  table.
- Which number, series or change matters most, and compared with what?
- Where do the figures come from, and does the source need a credit on
  screen?

## For this kind

**What the chart says**
- **The title states the finding** as a sentence with a verb ("Rides doubled
  from January to July"), not the topic ("Rides by month"): a viewer who
  reads only the title knows the point. (Bylinskii and Borkin 2015; Knaflic,
  *Storytelling with Data*.)
- **The piece ends on its finding.** Once the chart is whole, the last scene
  states the one takeaway with its number and holds it, so the viewer leaves
  with the figure, not with the last thing drawn. Every mark is back in its
  own color by then; nothing stays in a set-aside tint.
- **One chart answers one question.** A second question gets a second frame,
  shown after. (Small multiples; the Reuters graphics desk's sequences.)
- **The chart fits the relationship the sentence states**: change over time,
  ranking, part of a whole, size, difference, distribution, correlation,
  flow, or place. Columns for size start at zero; a map only when the
  geography is the point. (FT Visual Vocabulary.)
- **The comparison that matters is made by position or length**, the most
  accurately read, with the two things compared side by side; never by area
  or angle. (Cleveland and McGill 1986.)
- **Line charts are wider than tall**, the main run of the line near 45°.
  (Tufte, after Cleveland.)
- **A mark's size changes in proportion to its number** (a lie factor of 1):
  bars from zero, a circle's area and never its radius, and no perspective,
  depth or 3D on a data mark. 3D is for a subject, never to tilt a chart. A
  round cap is fine while the bar's length still runs to its value. (Tufte,
  *The Visual Display of Quantitative Information*.)
- **No second y-axis.** Two measures on different scales are two charts,
  stacked on one shared time axis. (Small multiples.)
- **Chart only what a sentence cannot say.** A single number is a big
  figure, not a one-bar chart.

- **A diagram's layout comes from pele, not from hand-written math**, when
  it has more than a few nodes or flows that skip a column: write the
  Mermaid text, take pele's geometry, and draw and animate it in Kinetic
  (`../patterns.md`, "A Sankey laid out by pele", "A flowchart laid out by
  pele"). Turn its own figures off (`showValues: false`) and set the
  source's printed totals, since pele's are sums of the flows and can differ
  by rounding. pele orders each column itself to cross fewer bands, so a
  story that needs a fixed order (a small diagram, a ranked list) keeps the
  hand-built "A Sankey from a table of flows".

**Color and labels**
- **Color for what the frame is about, the rest gray.** On one chart, one
  series in color, or a lighter shade of the same hue. A story told in
  stages gives each meaning its own color (the source being drawn, the
  part being discussed, the loss) and keeps it for the whole piece; at any
  moment, what is not being discussed is gray. Gray is for context only:
  on paper a warm gray, and on a colored ground a tint of that ground
  (`style.md`, "Context in tints"). At most seven
  colors in any frame; a sequential scale runs light to dark, never a
  rainbow. (Lisa Charlotte Muth and Datawrapper; Simon Scarr's Iraq
  graphic.)
- **Labels on the data**, beside the line or on the bar, with no legend
  unless the color scale is continuous. Words that name a series in the
  title are set in that series' color. (Datawrapper; The Pudding.)
- **The key number is written** as digits on or beside its mark, never left
  to be read off an axis. (Bylinskii and Borkin; Scarr.)
- **One reference mark** for the threshold or event the message turns on,
  labeled at the mark, and few annotations besides. (The Wall Street
  Journal's measles chart; Ed Hawkins's climate spiral.)
- **An unfamiliar scale**, such as a log or an index, is explained on the
  chart where it first appears. (John Burn-Murdoch.)
- **Ink that carries nothing goes; imagery that carries the subject stays.**
  (Tufte; Bateman et al. 2010.)
- **The data-ink pass**, on each chart's key frame before motion, element
  by element: gridlines (none, or a few light horizontal ones at major
  steps), the chart's box and its top and right axis lines (gone), ticks
  that repeat gridlines (gone), shadows, gradients and depth on data marks
  (gone), a legend (direct labels instead), color on anything that encodes
  nothing (gone). Mark each keep, remove or simplify, and make the one
  change that most helps the reading first. (Tufte's data-ink ratio; the
  MLJAR data-ink audit.)

**Time**
- **The empty stage first.** A data scene opens on its axes, labels and
  reference lines, with no data, held long enough to read them. The data
  then plays briskly, and the finished chart holds at least as long as the
  empty one; in Hawkins's spiral, 4 s empty, then 5 s finished. (Ed Hawkins,
  measured.)
- **Animate only when the movement is the message**: growth, a race, a
  before and after. Otherwise show the finished chart. (Burn-Murdoch; Archie
  Tse, The New York Times.)
- **A number the viewer must take in holds**: once it has landed, the
  reading floor plus a second at least (`../craft.md`, "Time").
- **Data per row**: when one page renders once per row, the imagery answers
  the data (bar lengths, positions), not only the digits. (Giant Ant for
  Strava; Illo.)
