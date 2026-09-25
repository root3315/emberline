# How it works

*Russian original: [how-it-works.md](how-it-works.md). If the two disagree, the code is right and both documents are wrong.*

A walk through the whole project: where the data come from, what happens to
them on the way, and which file is responsible for what. It can be read
front to back: the order follows the path of one detection from the
satellite to a pixel on the screen.

> **Note:** this is the long-form walkthrough. Everything needed to build
> and run the project, including the full rebuild order for the world data
> and the Python model, is in [README.md](../README.md).

---

## 1. The problem, and why it is not trivial

NASA provides two families of instruments that see the same thing:

- **MODIS** on the Terra (since 2000) and Aqua (since 2002) satellites.
  Pixel: 1 km.
- **VIIRS** on Suomi-NPP (since 2012), NOAA-20 (2018) and NOAA-21 (2024).
  Pixel: 375 m.

If you simply add up their detections and plot them by year, it looks as if
the planet caught fire in 2012. That is not true. An instrument several
times sharper had simply gone into orbit: over the planet in 2012, VIIRS
counted 4.1 times as many detections as MODIS. These two numbers come from
our own index:

| year | MODIS detections | VIIRS detections |
|---|---|---|
| 2011 | 4.5 million | 0 |
| 2012 | 4.8 million | 19.5 million |

Removing this step without faking the data is the task of the project.
Everything else is built around it.

**How it is solved.** Take the days on which both families looked at the
same ground, and compute the ratio: how many times more burning cells VIIRS
sees. The median of these ratios is the coefficient by which the whole
series is multiplied. The comparable series is built from MODIS cell-days
over its whole length, because the MODIS record has no steps from new VIIRS
satellites. The coefficient is **measured for each area separately**,
because it depends on how fragmented the fires are: stubble in a field
breaks up differently from a crown fire in the taiga.

**And it is measured on one fleet.** The overlap is not one instrument:
until 1 April 2018 only S-NPP flew, until 17 January 2024 two VIIRS, and
three after that (these are the dates from which the archive actually takes
data, not launch dates). The ratio grows with the fleet, not with the fire
(`sensitivityByEra`):

| area | S-NPP (unit of the series) | +NOAA-20 | +NOAA-21 | median over the whole mix |
|---|---|---|---|---|
| Punjab | 4.60 | 9.14 | 12.57 | 7.07 |
| Sierra | 1.86 | 2.91 | 4.50 | 2.56 |
| Cerrado | 1.64 | 2.43 | 2.77 | 2.13 |
| Yakutia | 1.64 | 2.06 | 1.98 | 1.88 |
| planet (detections) | 4.47 | — | — | 8.11 |

The median over the whole mix used to be published. It has no defined unit
("VIIRS equivalent": of one satellite or of three?), and it shifted with
every rebuild as NOAA-21 days accumulated. Now the coefficient is taken from
the era when S-NPP flew alone (`calibrate`). The reconciled series means
"what one VIIRS would have counted", and that era is closed, so it will be
the same in every rebuild. The median over the mix remains in the archives
and in the code for reference.

**The "leave one year out" test** (`leaveOneYearOut`). Within the
S-NPP-only era the target does not move, so the question "does MODIS × one
number work" has a clean answer: each of 2013–2017 is left out in turn, the
coefficient is fitted on the rest, and it predicts what S-NPP counted in the
year left out. There is no pass/fail threshold; the errors themselves are
printed:

| area | 2013 | 2014 | 2015 | 2016 | 2017 | k, 95% (bootstrap over years) |
|---|---|---|---|---|---|---|
| Punjab | +19.0% | +1.2% | −3.5% | +6.7% | −2.0% | 4.60 [4.29–5.00] |
| Sierra | +4.3% | −4.4% | −6.6% | +7.1% | +4.8% | 1.86 [1.75–1.93] |
| Cerrado | −9.4% | −15.7% | −6.9% | −1.9% | −12.8% | 1.64 [1.55–1.68] |
| Yakutia | +6.8% | −2.8% | −32.6% | −10.0% | +14.3% | 1.64 [1.52–1.73] |
| planet | +0.6% | +0.2% | +0.8% | −0.7% | +1.9% | 4.47 [4.42–4.51] |

The obvious alternative, a power law V = a·M^b (fitted in logs, brought back
from logs with Duan's smearing), does noticeably worse on the same test in
Punjab (worst year +47% against +19%) and slightly better only for the
planet (1.5% against 1.9%). So the constant stayed. Another estimator of the
same constant, the ratio of the sums instead of the median of the days, is
more accurate in the Cerrado (mean error 5.3% against 9.3%) but worse in the
other three areas; the median stayed. A ratio per level of activity (terciles
of the day's MODIS count) is worse than the constant in four cases out of
five. A ratio per calendar month is much better in the Cerrado (2.2% against
9.3%) and in the Sierra (3.7% against 5.5%), but worse in Punjab (25.8%
against 6.5%) and in Yakutia (16.0% against 13.3%). Choosing a method per
area would need a test of its own, so the one constant stayed.

**Two routes to the same years** (`twoRoutes`, `routeTrends`). The second
series is built without MODIS: the year's VIIRS count, divided by the ratio
of its own fleet and multiplied by k. The level of the two routes is matched
by construction, and that proves nothing. Their trends are not matched, and
every comparison between years rests on them. Over 2013–2025:

| area | trend via MODIS | trend via one VIIRS | drift of the ratio |
|---|---|---|---|
| Punjab | −5.0% a year | −4.8% | −0.3% |
| Sierra | −2.3% | −2.8% | −0.6% |
| Cerrado | −0.3% | −1.1% | −1.0% |
| Yakutia | −5.8% | −4.9% | +2.6% |

The drift is Sen's slope of the logarithm of the ratio between the routes:
if MODIS were moving away from VIIRS by 10% a year, this column would read
about 10%. The correlation of year-to-year changes (r = 0.94–1.00) is
printed too, but it cannot see such a drift: centring subtracts it, and an
artificial +10% a year does not move r (a test pins this down). The check
itself has a limit as well. Each era's coefficient is measured against the
same MODIS, so a MODIS step exactly at the boundary between eras is absorbed
by the normalization; a drift within an era is not. After MODIS, the series
can be continued with VIIRS, fitted to MODIS over the last years they share.

All of this is recomputed by `npx tsx scripts/compare-transfer.ts`, and the
pages print the same numbers from the data, not by hand.

A note on the unit: "what one VIIRS would have counted" holds for the median
day. The ratio of annual sums in the same era is different (Punjab 4.27
instead of 4.60, Cerrado 1.84 instead of 1.64), so the annual level is an
estimate with this caveat.

**What the constant cannot do.** The ratio depends not only on the fleet but
also on the level of activity: on quiet days VIIRS finds more per MODIS cell
than on days of large fires (Sierra in the NOAA-20 era: 4.6 on the quiet
third of days, 2.0 on the active third). So the annual sums of MODIS × k and
of VIIRS from the same fleet diverge: in the S-NPP era by up to 20% (Punjab
and Cerrado in 2012), in later eras by up to 44% in places (Sierra, 2021),
and in a year with almost no fire by more still (Yakutia, 2025: −66%). One
constant sets the height of the axis and leaves the shape of the series
alone, but a comparison of two years is a comparison by MODIS, with all of
its sampling. A difference between years smaller than these percentages is
noise, not a finding. (One more small thing: thresholds such as "a tenth of
the peak" sometimes flip at the boundary because of rounding, so a rebuild
can move a date or a day count by one.)

For the planet as a whole there is a single number: 4.47 (interquartile
range 4.10–4.88), from detections rather than cells, because the global
level has no cell-days that could be reconciled. It is used by the planet's
ribbon, by its charts and by the ring on the "about" page
(`ratiosFromCounts` → `calibrate`). This is coarser than the regional
coefficients: one number for the whole world averages stubble and taiga
together. A field of the coefficient over the grid is in `docs/roadmap.md`.

Code: `src/core/harmonize.ts`, functions `ratiosFromDays`, `calibrate`,
`sensitivityByEra`, `leaveOneYearOut`, `bootstrapByYear`, `twoRoutes`,
`routeAgreement`, `applySensitivity`.

---

## 2. The data path

```
FIRMS API  →  disk cache  →  pyramid aggregation  →  site files  →  browser
(network)     11 GB .csv.gz  scripts in scripts/     public/data/   src/
```

### Step 1. Download — `scripts/build-archive.ts`

The only script that goes to the network. It downloads each product in
5-day windows (the API will not return more) and puts the raw `.csv.gz`
files in the cache.

What is not trivial there:

- **Quota.** 5000 transactions per key per 10 minutes, and the price of a
  request is counted **by area**, not by the number of days: a global
  five-day window costs ~180 transactions, not 10. The script measures the
  price as it goes and spreads requests across nine keys with a sliding
  window.
- **Bandwidth.** Measured: the speed ceiling belongs to the connection, not
  to the key. Extra keys buy quota, not speed.
- **Cache by window.** A run can be interrupted: it resumes from where it
  stopped.

### Step 2. Aggregation — `scripts/build-world-*.ts`

The network is no longer needed: these scripts read the cache and write the
site files. All of them parse CSV **byte by byte**. On 631 million lines, a
plain `split(',')` would create ten billion temporary strings and hours of
garbage collection. Instead the buffer is walked byte by byte, fields are
found by their commas, and numbers are read straight from the bytes. Nothing
is turned into a string, and the speed is about 15 MB/s.

| script | what it does | output |
|---|---|---|
| `build-world-l0.ts` | 1° grid, monthly | 27 files, 33 MB + index |
| `build-world-l1.ts` | 0.25° grid, monthly | 108 files, 196 MB |
| `build-world-l2.ts` | 0.05° grid, per year, in 20° tiles | 2971 files, 102 MB |
| `build-world-l3.ts` | 0.01° grid, per year, in 10° tiles | 8094 files, 463 MB |
| `build-world-days.ts` | daily, 0.25°, in 10° tiles | 2150 files, 233 MB |
| `build-world-now.ts` | the last week: grid + points | 1.5 MB |
| `build-world-ramp.ts` | colour scale ceilings | 1 file |
| `build-emissions.ts` | CO₂ estimate by year | 1 file |
| `build-climate.ts` | NASA GISTEMP temperature | 1 file |

### Step 3. Browser — `src/`

The page does not "load the archive". It takes exactly the pyramid level
the current frame needs, and exactly the tiles that fall inside that frame.
The planet is one megabyte; a district is thirty kilobytes.

---

## 3. The pyramid: why four levels

One and the same grid does not work for both the planet and a district.

| level | cell | on screen | when it switches on |
|---|---|---|---|
| L0 | 1° (111 km) | the whole planet | zoom < 5 |
| L1 | 0.25° (25 km) | a country | zoom 5–7.5 |
| L2 | 0.05° (5 km) | a province | zoom 7.5–9.5 |
| L3 | 0.01° (1 km) | a district | zoom ≥ 9.5 |
| points | — | individual detections | zoom ≥ 9.5, "now" mode |

**There is no grid below a kilometre, and there will not be.** A MODIS pixel
is exactly a kilometre at nadir and spreads to five towards the edge of the
swath. A finer grid would credit the instrument with a precision it does not
have. What survives further zoom is the detections themselves, drawn as
points, and those exist for the live week.

Level selection: `src/core/world.ts`, `levelForZoom` and `levelForBounds`.
The second is needed because when a place is chosen the camera has not
moved yet, but the level already has to be known. Otherwise the first frame
of a country is drawn at the planet's resolution.

---

## 4. The files in `src/`, one by one

### Core — `src/core/`

| file | responsibility |
|---|---|
| `harmonize.ts` | reconciling MODIS and VIIRS: measuring the coefficient and applying it |
| `world.ts` | loading all global levels, tiles, the daily cube and the points |
| `grid.ts` | calendar arithmetic: day of year, leap years |
| `stats.ts` | climatology, percentiles, seasons, "hot" days |
| `cube.ts` | the format of the regional archives (four built-in regions) |
| `aoi.ts` | the description of those four regions |
| `geocode.ts` | finding a place by name (Nominatim) |
| `emissions.ts` | the CO₂ estimation method and loading the precomputed series |
| `types.ts` | shared types |

### Interface — `src/ui/`

| file | what it draws |
|---|---|
| `ribbon.ts` | the calendar ribbon: a row is a year, a square is a day |
| `map.ts` | the Leaflet map and our own canvas layer on top of it |
| `cycle.ts` | a chart of the chosen year against a "normal" one |
| `contrib.ts` | detections by instrument, year by year |
| `world-panel.ts` | the planet's season and "Year by year" with the temperature line |
| `picker.ts` | choosing a region, with search over the whole Earth |
| `paint.ts` | the colour scale, helper drawing |
| `burn.ts` | the transition between the dark and light themes |

### Assembly — `src/main.ts`

One file that connects everything: state, routing by URL, switching between
modes. Key functions:

- `goTo(value)` is the only place that decides what to open: a built-in
  region, the planet, or a place found by search. This choice used to be
  copied in three places, and each copy was broken in its own way.
- `renderMapWorld()` picks the level, loads the missing tiles and draws the
  map.
- `drawScopeRibbon()` draws the ribbon for the area that is open.
- `wantedWorldLevel()` decides which pyramid level the current frame
  deserves.

---

## 5. Why the map is our own canvas and not Leaflet objects

On the 5 km grid, a large area is tens of thousands of squares. That many
Leaflet objects turn the tab into a slide show. So the grid is drawn as a
single canvas over the map, and during a zoom gesture it is scaled rather
than redrawn, which is how every map renderer does it.

There was a subtle bug here that is worth remembering: the canvas has to be
transformed **relative to the frame it was drawn for**, not relative to the
current one. Otherwise the scale comes out as 1, and the points stay where
they are while the map moves underneath them.

---

## 6. Colour: why the scale is global

A cell is coloured relative to a ceiling. If the ceiling is taken from
whatever is in the frame, the planet reads correctly but a chosen town is
misrepresented: a hundred cells with values from 1 to 48 turn 48 into "the
top of the scale", and the ordinary grass burning around the town is
coloured like the Cerrado in August.

So `ramp.json` stores the ceiling **over the whole Earth** for each level and
each year: the 99th percentile. A dark cell means "the top hundredth of
burning land this year", wherever the camera is.

The ceiling is per year, not one for the whole series: otherwise everything
before 2012 would fade out because of the arrival of VIIRS. The cost is that
colours from different years are not comparable: the same shade in 2005 and
in 2020 means a different number. The page says so under the map, and sends
anyone who wants to compare years to the ribbon.

---

## 7. The CO₂ estimate: what is honest and what is not

Emissions cannot be counted from the number of detections: a detection
means "the pixel was hot", not "this much burned". The accepted method works
from energy:

```
radiative power → energy → biomass burned → CO₂
```

**This is where honesty is needed.** Power is an instantaneous quantity,
energy is its integral over time, and a satellite sees a fire 2–4 times a
day. A few snapshots can be turned into an integral only by assuming how
much time each one "represents", and that assumption cannot be derived from
our data.

So it is calibrated: the coefficient is chosen so that the total over the
MODIS era matches the published GFED (7.3 Gt CO₂ a year). This means **we
do not measure emissions independently**. We distribute a known global
total across our years. That is useful, but the caption says exactly that.

It is computed **from MODIS only**, because the combined power series has
the same step. The numbers show it:

| year | MODIS power | VIIRS power |
|---|---|---|
| 2003 | 2.28·10⁸ | 0 |
| 2012 | 2.19·10⁸ | 2.04·10⁸ |
| 2024 | 2.00·10⁸ | 6.49·10⁸ |

MODIS barely changes, while the combined total has tripled. All of the
"growth in fires" in the combined series is the new satellites.

Code: `src/core/emissions.ts` (method and constants),
`scripts/build-emissions.ts` (computes it once, at build time).

---

## 8. How to run it

```bash
npm install
npm run dev          # site on localhost:5178
npm run typecheck    # type check: both src/ and scripts/
npm run build        # build into dist/
```

The data in `public/data/world/` are not in git: they are a gigabyte of
binaries. Without them the site still works: the map stops at 25 km, and the
calendar stays with the four built-in regions. To rebuild them from the
cache:

```bash
npx tsx scripts/build-world-l0.ts <cache>
npx tsx scripts/build-world-l1.ts <cache>
npx tsx scripts/build-world-l2.ts <cache>
npx tsx scripts/build-world-l3.ts <cache>
npx tsx scripts/build-world-days.ts <cache>
FIRMS_MAP_KEYS=... npx tsx scripts/build-world-now.ts 7
npx tsx scripts/build-world-ramp.ts
npx tsx scripts/build-emissions.ts
npx tsx scripts/build-climate.ts
```

The FIRMS keys live in `.env` and do not go into git. They are needed only
for `build-archive.ts` and `build-world-now.ts`; the other scripts do not
touch the network.

---

## 9. Mistakes we have already been burned by

Read this before touching the aggregation.

**The `type` column.** The science products (SP) carry 15 columns; the
near-real-time ones carry 14, without `type`. The code required 14 commas
and **silently threw away every NRT row**. In the global archive that was
July, August and September 2026: the three most recent months, read as zero
fires on the whole planet. Nothing crashed. 65 million detections came back.

**Request price by area.** We counted it by the number of days, were off by
a factor of 12, and burned through the quota of nine keys in ten minutes.

**Clipping the map to the bounding box.** When the map was clipped to the
selected bounding box, the ceiling of the colour scale started being
computed from the visible cells only, and the town "caught fire". One fix
broke something elsewhere; hence the global `ramp.json`.

**A ribbon drawn into a hidden block.** The component takes its size from
its container. If it is drawn while the block is hidden, the hover layer
stays 150 px tall: the picture is right, but the tooltip does not work.

---

## 10. The model and the forecast

The archive answers the question "when does it burn here". The second half
of the project answers "where will it catch fire next week", and it is built
on the same argument, applied to a different question.

**What exactly is asked.** The target is "will the one-kilometre MODIS
sensor see fire in this cell within N days". It is deliberately not the
reconciled series: a target that grows with the make-up of the satellite
fleet would teach the model about satellites, not about fires. MODIS has
flown with the same sensor since 2002, and as a pair since 2003, so the
question means the same thing in every year.

**What it learns from.** Gradient boosting
(`HistGradientBoostingClassifier`) reads 25 features about every 0.25° cell
of the planet: how often it burns here at this time of year, how long ago it
last burned, what the neighbours are doing, how far the year has moved from
its own normal, where El Niño stands, and the weather forecast for the week
ahead. That last one is the half that the fire archive cannot supply at any
resolution.

**Split by era, never at random.** Trained on 2003–2013, tuned on
2014–2017, scored on 2018–2021. Neighbouring days of one cell are almost the
same example, so a random split gives beautiful numbers and no skill. The
test ends in 2021 because that is where the weather archive ends.

**Sampling, and the correction back.** At a base rate of about 5%, a model
fed raw data learns to answer "it will not burn". So training uses three
negative examples per positive one, and the output is brought back to the
true rate by an analytic shift of the logit. The test sample is taken at the
natural rate and left untouched.

**Seven models, not one.** One per horizon, from a day to a week: a
question about Tuesday should go to the model that was asked about Tuesday.
Shorter windows are held no higher than longer ones, since "by Wednesday"
contains "by Tuesday".

**How it is scored.** Average precision 0.558, against 0.533 for
climatology and 0.387 for "it burned last week", at a base rate of 0.05.
Weather adds about +0.012.

**And a check forward in time.** The forecast is computed before its week
begins, and then checked against what NASA reported. This is the only number
on the site that could not have been tuned, because the answer did not exist
when the question was asked. `verify_forecast.py` writes it, puts the free
baseline ("it burned last week") beside it, separately scores the part of
the map where that baseline has nothing to say, and refuses to show
calibration until the week has closed. Every verified week stays in
`verify-history.json` for good, including the ones that went badly.

**What was tried and thrown out.** A fitted calibration curve (isotonic and
Platt; neither passed the threshold), population (+0.0009 average precision
on the tuning years, +0.00013 on the test, 12th and 13th place out of 27),
and more trees (validation peaks at 200 and goes backwards after that). All
three are on the "about" page, and their numbers are in
`docs/model-log.json`, which `scripts/export_model_log.py` assembles from
`models/`. The folder itself is not in git; the log is.

**Who decides which model ships.** `scripts/model_gate.py`. A retrain on the
same features passes if it is no worse than the previous model on the tuning
years; a model with a new feature passes only if it is better by 0.002
average precision. The decision is made on 2014–2017, not on the test.
Before this, `build_horizons.py` copied `-v2` over the working model with no
check at all, and `train_fire_model.py` added population by itself if
`models/population.npz` was on disk. So the next run would have silently
released a model that contradicts the line "it knows nothing about people".
Population now joins only when `people` is passed on the command line.

**What a row may know.** The released model carries one leak, and the About
page names it: `cell_rate` (how often a cell burns at all) was a sum over the
whole record, 2003–2026, test years included, and the choice of cells ("has
burned at least once") looked at the whole record too. On 23–24 September
the code was fixed: `cell_rate` comes from the training years, each split
samples the cells that had burned before it began, and the rule is written
into the model as `feature_rules`. A mismatch turned up on the way:
`build_forecast.py` took the training years to be 2003–2018 while the
features were built on 2003–2013, so three inputs meant one thing in training
and another on the live map. The gate refuses to compare models built by
different rules (the old one would win by exactly the size of its leak); such
a model is released by a person, with `build_horizons.py --release`. The
retrain and the release are still to do: `docs/roadmap.md`, item 2.1.

**Where things are.** `scripts/train_fire_model.py` builds the feature
matrix, `fit_fire_model.py` and `fit_fire_model_v2.py` train,
`build_forecast.py` applies the model to the end of the record,
`build_horizons.py` does the same per horizon, `build_reasons.py` computes
three reasons per cell, and `verify_forecast.py` checks the forecast. The
run order and which keys are needed are in [README.md](../README.md).
