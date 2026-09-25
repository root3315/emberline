# A guide to the site

What is on each page of Emberline, how to read it and what you can click.
Written for someone opening the site for the first time. How everything is
computed is in [how-it-works.en.md](how-it-works.en.md). По-русски:
[guide.md](guide.md).

---

## The site in brief

Emberline answers two questions: **when and where it burns** anywhere on
Earth since 2000, and **where fire may appear** in the next seven days.

Everything is built on NASA FIRMS fire detections. A detection is made when a
satellite passes over and finds a pixel hotter than its neighbours. It is not
a fire and not a burned area. It is a mark saying "something was burning here
at the moment of the pass".

There are four kinds of page:

- **an area**: four built-in regions (Punjab, the Sierra Nevada, the Cerrado,
  Yakutia) or any place found by search;
- **the whole planet**: the same page, for all of the Earth;
- **the forecast for the week ahead**;
- **about the project**.

Every page has its own address you can copy and send. `#/punjab/2016/raw`,
for example, opens Punjab on 2016 in "as recorded" mode.

---

## The one thing to understand first

Two families of instruments watch fire from orbit:

- **MODIS** on Terra (since 2000) and Aqua (since 2002). Pixel: one kilometre.
- **VIIRS** on S-NPP (since 2012), NOAA-20 (since 2018) and NOAA-21 (since
  2024). Pixel: 375 metres.

VIIRS sees small fires that disappear into the background for MODIS. So in
2012, when it arrived, the number of detections jumped several times over,
although there was no more fire on Earth. Then two more steps like that, in
2018 and 2024. Add the instruments together and you get "the planet caught
fire in 2012", which did not happen.

The site handles it like this. The whole series is counted from MODIS, which
has flown since 2000 and has been the same instrument all that time. It is
then multiplied, once, by a number that says how many times more one VIIRS
sees. That number is measured separately for every place, in the years when
S-NPP was the only VIIRS up (January 2012 to March 2018). In Punjab it is
4.6; in the Yakutian taiga, 1.6. The difference makes sense: a one-kilometre
pixel hardly notices small patches of burning stubble, while a big forest
fire it sees anyway.

Hence the main switch on the site:

- **"Reconciled"**: every year in one unit, as if a single VIIRS had flown the
  whole time. Satellites make no steps in this series. Years can be compared.
- **"As recorded"**: the raw detections, both instruments together. You can
  watch the satellites arrive.

The switch changes everything at once: the calendar, the charts, the figures,
the table. Press it on any page and look at 2012. That difference is the
whole problem this project exists to solve.

Two caveats the site repeats wherever they matter:

- **2000–2002.** Until July 2002 only Terra flew, and it sees about a third of
  what the two MODIS see together. These years are shown but kept out of every
  "normal" and every trend.
- **The latest years.** The MODIS satellites are ageing and since the early
  2020s have been drifting in the time they pass over, most visibly from 2024.
  A series built on MODIS may read these years low.

---

## The top bar

The same on every page.

- **Area.** The button opens a list: four built-in regions and "World". In
  the box at the top you can type the name of any place: a country, a
  province, a city, a park. Names come from OpenStreetMap. If a place is too
  small and has seen too little fire over the years, the page says so: a
  handful of detections supports no conclusion.
- **Reconciled / As recorded.** The main switch, described above.
- **About the project.** A page for first-time visitors.
- **RU / EN.** Language. Everything is translated, including chart labels.
- **☾ / ☀.** Dark or light theme.

The forecast page has no area picker and no switch; a "Back to the record"
button takes their place.

---

## An area page

Punjab, 2025, as the example. Every other place works the same way.

### The header

- **The line with coordinates**: which rectangle of the Earth this is.
- **The answer, in large type.** When it burns here, in one sentence: "Fire
  here comes twice: 6 to 22 May, and again 7 Oct to 12 Nov, the heavier of
  them peaking around 2 Nov." A season runs from the day 10% of the year's
  fire had happened to the day 90% had. If there is a quiet gap of more than
  a month in the middle, there are two seasons.
- **The line under it**: how the chosen year compared with a normal one
  ("0.4× the normal total" is less than half), the MODIS caveat when it
  applies to that year, and how many of the busiest days held half the year's
  fire.
- **Four figures**: the usual season; the chosen year's season; the year the
  record starts; the number of "cell-days" with fire. A cell-day is "this grid
  cell burned on this day". Under the figure is a 95% range: how precisely the
  VIIRS/MODIS factor is known.
- **The "as recorded" and "reconciled" chart** on the right. Each year is
  divided by the 2003–2011 average (those years are shaded), so 1× is a
  normal level. The scale is in multiples, each gridline double the one below,
  so both lines stay readable. The grey line (as recorded) jumps where the
  dotted lines mark the satellites: S-NPP in 2012, NOAA-20 in 2018, NOAA-21
  in 2024. The orange one (reconciled) does not. Only whole years are drawn: a
  year still running cannot be set against whole ones. The caption gives the
  numbers: how far apart the two lines have been in recent years.

### The calendar, "When does it burn here?"

The largest picture on the site.

- **A row is a year**, from 2000 at the top to the current one at the bottom.
  **A square is a day.**
- **Colour.** The brighter and stronger a square, the more places burned that
  day. Under the calendar on the right, "more burning ≤ …" gives the number
  at which the colour is already at its brightest.
- **A red outline** marks a day busier than 9 out of 10 days at that time of
  year. It shows not just the season but the unusual bursts inside it.
- **Two thin lines to the left of the years** show which instruments were
  flying: one for MODIS, and a second one from 2012 for VIIRS.
- **Faint squares** are days that have not happened yet or were not yet
  observed (before November 2000, and the rest of the current year).
- **Bars on the right**: each year's total.
- **Hover** over a square for a tooltip with the date and that day's numbers.
  **Click** a row to open that year in the blocks below.
- **The text above the calendar** says what is being shown: the reconciled
  series or the raw detections.

### The summary under the calendar

Five figures the header does not already give:

- **Detections**: how many individual fire marks were read over all the years.
- **Duplicates removed**: when several detections land in one cell on one
  day, they count once. In Punjab that removed 22%.
- **Change per year**: whether there is a trend. Computed over whole years
  from 2003 with the Theil–Sen method; significance by the Mann–Kendall test.
  If the trend does not pass, it says "none", with the range the trend could
  lie in (95%) and p under it. In "as recorded" mode, Punjab would show +7.5% a
  year here: growth drawn by the new satellites.
- **Worst year**: the year with the most fire, and its cell-days.
- **Peak power**: the highest fire radiative power a satellite measured, in
  megawatts. Always "as recorded": the instruments measure power differently
  and it is not reconciled.

### "What about 2025?"

One year in detail. The ‹ › arrows step through the years.

- **The chart on the left.** The grey band is what each date looks like in a
  normal year (from the quiet years to the busy ones). The orange line is the
  chosen year. Where the line is above the band, the year burned harder than
  usual.
- **The line under the chart**: how many days held half the fire, and what
  share fell in the busiest month.
- **"What stands out"**: the reading in words: a quiet year or a hard one,
  whether it started early or late, whether it peaked on time.
- **The year's figures**: busiest day; season; length of the season from 10%
  to 90% of the fire and the difference from normal; how many days held half
  the fire; how many days were above normal; how the year compares with a
  normal one.
- **"Stretches under pressure"**: runs of three or more days when fire stayed
  above 9 out of 10 normal days. If there were none, it says so.

### "Every year, side by side"

A table, one row per year. The frame shows about ten years and the rest
scroll inside it. The chosen year is highlighted and always brought into
view; a fade at the foot of the frame means there are more rows below.

- **Season ran**: from 10% to 90% of the year's fire.
- **Peak (15-day)**: the middle of the busiest fifteen days.
- **Days**: the length of the season.
- **Cells × days**: how much burned in the year, with a bar for comparison.
- **vs usual**: how many times more or less than the 2003–2011 average.
- **Busy days**: how many days were busier than 9 out of 10 normal ones.

Click a heading to sort, or a row to open that year above. From the keyboard,
Tab enters the table, the up and down arrows move between years and Enter
opens one. For 2000–2002 "vs usual" is a dash: those are Terra-only years.

### "Who saw it, and how it was reconciled"

- **The list of satellites**, with the date each one started and its pixel
  size.
- **"Who caught 2025"**: a bar in three parts: how many burning cells only the
  one-kilometre instrument saw, how many both saw, and how many only the
  375-metre one. In Punjab in 2025, 92% were seen only at 375 metres.
- **The factor, as a card.** In large type, how many times more S-NPP saw
  while it flew alone (4.60× in Punjab). Under it, how precisely that is known
  (4.29 to 5.00, 95%) and from how many days. Then how the ratio changes with
  each new satellite, and why that is the reason the one-satellite era is
  used. At the foot of the card, a test: leave out each year of 2013–2017 in
  turn, fit the factor without it, and see how well it predicts the year left
  out.
- **"Detections by sensor, year by year"** (right): bars split into "1 km
  only", "both" and "375 m only". The step in 2012 is a new instrument. The
  faint last bar is the year so far.
- **"Two routes to the same years"** (right, below). Every whole year since
  2012 is computed twice: from MODIS (blue, the site's own series) and from
  VIIRS alone (orange). They share no detections. Their level is matched on
  purpose, which proves nothing. Their slope is not matched: if the correction
  were wrong, the lines would drift apart over time. Under the chart, three
  figures: the slope by MODIS, the slope by VIIRS alone and the drift between
  them; in Punjab, −5.0%, −4.8% and −0.3% a year. Below that, how far the two
  lines part from year to year: a difference between two years smaller than
  that is within what the instruments disagree about.

### "Where it burns", the map

- **Cells** show where it burned in the chosen year. The darker, the more
  often that cell burned.
- **Period**: the chosen year, or "Right now", the last week, by day.
- **Zoom** with the mouse wheel or the + and − buttons. On the year map the
  cells are 5 km squares at every zoom. In "Right now", zoomed far enough in,
  the cells give way to the detections themselves: one dot each, the size of
  the pixel of the instrument that made it (375 m for VIIRS, a kilometre for
  MODIS).
- **Hover** over a cell to see its coordinates and how much burned there.
- **Base map**: map, satellite image or terrain.
- **A scale bar** and the cell size are shown in the corner.
- **In a row under the map**: how many cells ever burned, how many this
  year, the most persistent cell (on how many different days it burned) and
  the area covered.
- **The map is not reconciled**: it shows both instruments' detections as
  they are, and the caption above it says so.

### "Where the numbers come from"

- **Bundled**: the archive that ships with the site, and what it contains:
  how many days, how many detections, how many rows were dropped as
  volcanoes, gas flares and offshore sources.
- **Live**: load the last few days of detections straight from FIRMS. You
  need your own free FIRMS key; the browser sends it only to FIRMS.
- **My file**: open your own FIRMS CSV export and read it with the same
  calendar.
- **"The days that made the year"**: the five busiest days and what share of
  the fire they held.
- **"Download this series as CSV"**: the whole series by day: raw and
  reconciled counts, the split by instrument, fire power, and the "second
  route", the same day from VIIRS alone in the same unit. The top of the file
  says where the data came from, which factor was applied, and its 95%
  interval.

### "What the burning does"

An estimate of the CO₂ from all the planet's fires in a year next to
fossil-fuel emissions, on one scale. For 2025, about 5.3 Gt of CO₂, around
14%. Right under the number it says why this is an order of magnitude and not
a measurement: the estimate comes from radiative power, is scaled to the
published GFED total, and peat is badly undercounted. Below are four short
paragraphs on how fire feeds back into the climate, and the sources.

### "Next week"

A link to the forecast: the days it covers and how many cells are at risk.

---

## The whole planet

Pick "World" from the list of areas. What differs from an area page:

- **The header**: the month in which the planet peaks, and in how many of the
  27 years it did (August, 21 of 27).
- **The chart beside the header**: the same as an area's, for the whole
  planet: the recorded count and the reconciled one, each year against
  2003–2011. The grey line climbs with every satellite, past ten times the
  base by 2024; the reconciled one stays close to 1.
- **"The planet, day by day"**: the same calendar, for the whole Earth.
- **"When the planet burns"**: each year as a faint line by month, the chosen
  one on top. A month here is the whole surface of the Earth added up.
- **"Year by year"**: one bar per year, in one unit. The faint bars of
  2000–2002 are Terra-only years and are left out of comparisons. The grey
  line is NASA GISTEMP global temperature, for context only: the site says
  outright that this record cannot tie fire to warming.
- **The world map**: 111 km cells. Colour is relative to the busiest 1% of
  cells that year, so compare years by the chart, not by the map's colour.

## Anywhere

Type a name in the search box and pick from the list. The site builds a page
for that place from the same archive: the same header, calendar, charts and
map. The built-in regions use a one-kilometre grid; searched places use a
quarter-degree grid, so very small places will not get conclusions.

---

## The forecast for the week ahead

### The header and the globe

- **The week's dates**, when the forecast was computed, and which day of the
  week it is now.
- **In large type**: in how many cells the chance of fire this week is 1% or
  more.
- **How it works, in one paragraph.** The model (gradient boosting) reads the
  archive since 2003 (where it burned, how long ago, what usually happens at
  this time of year, what the neighbours are doing) together with the
  week's weather forecast: heat, wind, rain. For every 28 km cell it gives the
  chance that the one-kilometre MODIS sees fire there before the week ends.
- **Four figures**: cells at risk; the widest front (where the most nearby
  cells are above 50%); which years the model was tested on; its average
  precision against a simple guess from the season.
- **The globe** turns by itself. You can drag it, stop it with ❚❚ and click
  any fire to open that cell's card.
- **A cell's card**: the place, its coordinates, the chance this week, how
  many detections it had last week, and three reasons in words for the
  model's number ("it usually burns here at this time of year", "something
  burned here in the last few days" and so on).

### "Where it may burn"

- **The days of the week** along the top. Choose the chance "by Tuesday", "by
  Wednesday" and so on, or the whole week. "By Wednesday" is never lower than
  "by Tuesday".
- **"Play the week"** shows the risk building up day by day.
- **Colour is a chance, not an amount.** A pale cell can burn and a strong one
  may not. The scale is linear: the colour halfway along is 50/50. Anything
  under 1% is not drawn.

### "Checked against what happened"

The forecast is made from data before the week begins, then checked against
real NASA detections.

- **The ladder**: of the top thousand, five thousand and twenty thousand
  cells the model ranked highest, what share has burned so far. The mark on
  each bar is the simple rule "it burned last week", for comparison. At the
  very top they are close: in the middle of a season, fire mostly continues
  where it already is.
- **"Where the free method is blind"**: cells that did not burn in the week
  before the forecast. The simple rule knows nothing about them. This is where
  the model earns its place: its top thousand of these cells burn several
  times more often than they do on average (7.9 times in the first week).
- **"Every week we have checked"**: one row per week. Rows are never removed,
  even when the forecast did badly.
- **The figures on the side**: what share of the cells that burned fell inside
  the 1% line ("the net"), how many flagged cells burned, and how many burned
  outside the net.

### "Twenty places to watch"

The likeliest cells, kept apart so the list holds twenty different places.
Each has a name from OpenStreetMap, its chance and coordinates. The bar shows
how many cells within about 200 km are also more likely than not to burn: one
spot, or a front hundreds of kilometres wide. Click a row and the globe turns
to that place and opens its card.

### "How much to believe it"

- **The calibration chart.** Cells are grouped by the chance they were given.
  A dot on the diagonal means the chance was honest: of the cells given "80%",
  80% burned. Here the model is a little cautious: it says 84% where about 90%
  burn.
- **"Measured against"**: the average precision of this model, of the season
  alone, of "it burned last week" and of a random pick, on 2018–2021, years
  held out from training. Under it, a plain caveat: the model learned on the
  weather that actually happened, while the live map runs on a weather
  forecast, so these figures are an upper bound.

---

## About the project

- **The header**: the problem in two sentences and four figures: 27 years, 593
  million detections, three satellite steps removed, and the trend by MODIS
  and by VIIRS alone.
- **The rings.** Every day of the record: one ring is one year, 2000 in the
  centre, January at the top and on round to December. The switch under the
  rings flips between "reconciled" and "as recorded": in the raw series the
  rings brighten from 2012, 2018 and 2024.
- **"The problem"**: why a detection is not a fire, and why the correction has
  to be measured place by place.
- **"The seam, in the record"**: detections by year and by instrument for the
  whole planet.
- **"Does the fix hold?"**: the VIIRS to MODIS ratio by era, the
  leave-one-year-out test and the two routes, for the whole planet.
- **"What was built"**: what the site is made of: static files, no server.
- **"The model"**: what it is asked, on which instrument, how it learns and how
  it is scored. Behind "How the model was checked": what it leans on (what
  happens when one input is scrambled), what the weather added, and whether
  its percentages hold up.
- **"Check us"**: how the checks work, and three things that were tried and
  dropped: a calibration curve, a population layer, more trees.
- **"What the model does not know"**: the limits, in plain words.
- **"See for yourself"**: a globe with the forecast. Click a fire and a
  satellite picture of that ground appears next to it, with the chance and the
  reasons.

---

## If something goes wrong

- If the archive fails to load, the page says so at the top and offers a "Try
  again" button.
- If a searched place is too small, there will be no conclusions, and the page
  says why.
- The forecast covers one week. When the week is over, the page says so
  plainly until the forecast is rebuilt.
