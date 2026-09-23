# Emberline

A burning-activity calendar built from NASA FIRMS active fire detections, harmonized across MODIS and VIIRS.

Built for the **NASA Space Apps Challenge 2026** — *Harmonization of MODIS and VIIRS Hot Spots*.

---

## The problem this solves

Satellites have watched for active fire since late 2000, but the record is split across instruments that cannot be compared directly:

| Instrument | Pixel | Operating since | Confidence scale |
|---|---|---|---|
| MODIS Terra | 1000 m | 2000-11 | 0–100 |
| MODIS Aqua | 1000 m | 2002-07 | 0–100 |
| VIIRS S-NPP | 375 m | 2012-01 | low / nominal / high |
| VIIRS NOAA-20 | 375 m | 2018-04 | low / nominal / high |
| VIIRS NOAA-21 | 375 m | 2024-01 | low / nominal / high |

A 375 m sensor resolves several hot pixels where a 1 km sensor resolves one. Plot raw detection counts across 2012 and the line jumps — not because more was burning, but because a better instrument arrived. A fire manager reading that chart would conclude the wrong thing about their own history.

Emberline reconciles the two records into a single comparable series, and shows its work.

## How harmonization works

Six steps, in `src/core/`:

1. **One shared grid.** Every detection is snapped to a ~1 km equal-area cell (`grid.ts`). The unit of measure becomes *active cells per day*, which does not depend on pixel size, instead of *detections*, which does.
2. **Local solar days.** A day is defined by the sun at that longitude, not by UTC (`grid.ts`). A UTC date cuts the night in half for most of the world, pushing evening fires onto the following day.
3. **Deduplication.** A cell seen by several sensors on one day is one burning cell, tagged with which instruments saw it (`harmonize.ts`).
4. **One confidence scale.** MODIS percentages collapse onto low/nominal/high at FIRMS' own break points of 30 and 80.
5. **A measured sensitivity ratio.** Over the overlap era (2012 onward) Emberline measures, *for this specific area*, how many active cells VIIRS resolves per MODIS cell. The median becomes the scaling factor and the interquartile range its stated uncertainty. How much more a fine sensor resolves depends on how fragmented the fires are — 7.07 over Punjab's stubble, 1.88 over Yakutian taiga — so this is never a global constant.
6. **One instrument carries the whole series.** The comparable series is MODIS cell-days throughout, scaled once by that ratio — not “lift the old part up to meet the modern count”. VIIRS is not one arrival but three: S-NPP in 2012, NOAA-20 in 2018, NOAA-21 in 2024, and a combined count steps at every one of them. Measured on this repository's own archives, the old rule left Punjab's reconciled series 55% above its 2012–2017 level while MODIS alone sat 9% below it. MODIS has flown the same sensor since 2002, so a series driven by it moves only when fire moves. The raw combined count survives beside it, and that is what the “as recorded” toggle draws.
7. **FRP without double counting.** Within a cell-day, radiative power is the maximum across sensors, never the sum.

Then, in `stats.ts`: a per-day-of-year climatology pooled over a ±7 day window, season onset/peak/end at 10 %, smoothed max and 90 % of the annual total, runs above the 90th percentile as *critical periods*, and a Theil–Sen trend over annual totals.

## How the page reads

It is a report you read downwards, not a dashboard of equal panels. Every section is headed by the question someone actually arrived with.

1. **The answer, in words.** The largest type on the page is a sentence — *"Fire here runs from 10 May to 29 September, peaking around 24 June"* — followed by whether the selected year is out of the ordinary, and four figures: typical season, selected year, watched since, fires counted.
2. **When does it burn here?** The calendar: one row per year, one square per day, a red outline on days busier than 9 out of 10 days at that time of year, and a bar beside each row for the year total. It is the only raised surface on the page. Under it sits a band of seven measures, including the share that reconciliation merged away and the Theil–Sen trend.
3. **What about {year}?** The year against its usual range, the sentence the chart cannot say (*half of 2021 burned in 11 days*), what stands out, and the stretches that stayed under pressure.
4. **Every year, side by side.** A sortable table — season, peak, length, total, ratio to usual, busy days. Click a row to open that year above.
5. **Who saw it, and how it was reconciled.** Which instruments were in orbit, how this year split between them, the measured correction with its range, and detections per year by sensor so the 2012 step is visible rather than hidden.
6. **Where it burns** — a real slippy map (pan, zoom) with three keyless basemaps: dark canvas, satellite imagery and shaded relief. The harmonized grid is a single canvas layer over the tiles, and place labels ride in a pane *above* it so a town name is never buried under a hot cell. Hovering reports the coordinates and how many days that square burned.
7. **Where the numbers come from** — the three data sources and a CSV export of the whole series.

Language is plain throughout: "fires" rather than "active cell-days", "busier than 9 out of 10 days" rather than "above p90". Russian is written as Russian, with real plurals and case endings.

## What the interface refuses to hide

- A **Raw counts / Harmonized** toggle. The adjustment is always one click from being turned off.
- The **sensor rail** beside every year in the calendar shows which instrument families were actually in orbit — the thinness of the early record is visible, not asserted.
- **Who saw it** charts active cells per year split by detecting instrument, so the moment VIIRS joins shows up as a seam rather than disappearing into a total.
- The measured ratio, its range, and the number of paired days it rests on are printed in the sidebar.
- Grey cells mean *nothing was watching*, which is not the same as *nothing was burning*.
- FIRMS `type` 1–3 rows (volcanoes, other static land sources such as gas flares, offshore) are dropped, and the count of dropped rows is shown. Gas flares burn 365 days a year and would forge a fire season out of industry.

## The forecast

The archive answers "when does this place burn". The second half of the
project answers "where will it burn next week", and it is the same
argument applied to a different question.

A gradient-boosting classifier reads 25 features about every 25 km cell of
the planet — how often it burns at this time of year, how recently it
burned, what its neighbours are doing, how far the year is from its own
normal, where El Nino stands — and the **forecast weather of the week
ahead**, which is the half the fire archive cannot supply at any
resolution.

- **Target: MODIS alone.** "Will the 1 km sensor see fire in this cell
  within N days." Deliberately not the reconciled series: a target that
  grows with the satellite fleet would teach the model about satellites.
  Same reasoning as the harmonization, applied to the label.
- **Split by era, never at random.** Train 2003–2013, tune 2014–2017,
  score 2018–2021. Consecutive days of one cell are nearly the same
  example, so a random split produces beautiful numbers and no skill. The
  test era stops in 2021 because the weather archive does.
- **Case–control sampling, corrected back.** Training sees three negatives
  per positive because at a 5% base rate a model fed raw data learns to
  say "no". The output is shifted back to the true prior analytically, so
  a printed probability means what it says.
- **Seven models, not one.** One per horizon from a day to the week, so
  the question about Tuesday is answered by a model that was asked about
  Tuesday. Shorter windows are held below longer ones, because "by
  Wednesday" contains "by Tuesday".
- **Scored against free alternatives.** Average precision 0.558 against
  climatology's 0.533 and persistence's 0.387, at a 5% base rate where
  random scores 0.05.
- **And against the future.** The shipped forecast is computed before its
  week begins and then checked against what NASA reports. That number is
  the only one on the site that could not have been arranged, because the
  answer did not exist when the question was asked. `verify_forecast.py`
  writes it, persistence included, and refuses to show calibration until
  the week is complete.

Negative results are on the page, under *What did not earn its place* —
not in a drawer and not only in these script headers:

- **A fitted calibration curve.** Isotonic matched the shipped Brier of
  0.0315 exactly and cost 0.0060 average precision to ties; Platt kept
  the ranking and came out slightly worse on Brier. Neither shipped.
- **Population.** The GHSL settlement layer moved test average precision
  from 0.5579 to 0.5581, and its two features ranked 12th and 13th of 27
  by permutation drop, against climatology's 0.387.
- **More trees.** Training loss was still falling at a thousand;
  validation average precision peaks at 200 and goes backwards after it.

Vegetation cover is *not* on that list, an earlier draft of this file
said it was, and it was wrong: `veg_low` and `veg_high` rank 6th and 7th
of 27, with drops of 0.0090 and 0.0077.

## Rebuilding the model and the forecast

### What a clone gives you, and what it does not

Ten files under `public/data` are committed: the four regional cubes, the
forecast metadata, the model card, the verification record and three
reference files. Two directories are **not**, because between them they
are about a gigabyte of generated binaries:

| | what is in it | without it |
|---|---|---|
| `public/data/world/` | daily tiles, the 4-level global pyramid, the forecast rasters | the regional calendar works; the planet falls back to its coarsest level and the forecast page has no map |
| `models/` | the fitted model, the 2.5 GB weather archive, feature matrices | nothing to rebuild a forecast from |

So a clone runs the site and shows the archive, and the Python block
below needs the world data built first. That is the step that used to be
missing from this file.

```bash
pip install -r requirements.txt
```

Keys go in `.env`, which is gitignored: `FIRMS_MAP_KEY` for anything that
talks to FIRMS, `CDS_KEY` only if you fetch ERA5 through Copernicus
instead of the public mirror.

The world data comes first, because `train_fire_model.py` reads the daily
tiles it writes. It is TypeScript rather than Python, and it needs
`FIRMS_MAP_KEY` — the raw archive is 593 million detections, so expect
hours and tens of gigabytes of traffic the first time, and keep `/data/`
(also gitignored) so a second run is cheap.

```bash
npx tsx scripts/build-archive.ts       # the four regional cubes
npx tsx scripts/build-world-days.ts    # daily tiles on the 0.25 deg grid
npx tsx scripts/build-world-l0.ts      # the global pyramid, coarsest first
npx tsx scripts/build-world-l1.ts
npx tsx scripts/build-world-l2.ts
npx tsx scripts/build-world-l3.ts
npx tsx scripts/build-world-now.ts     # the last-week snapshot
npx tsx scripts/build-world-ramp.ts    # the shared colour ceiling
```

Then the Python half.

```bash
# once: the inputs
python scripts/fetch_arco.py        # past weather, public ERA5 mirror, no queue
python scripts/pack_weather.py      # repack so training reads one tile at a time
python scripts/fetch_oni.py         # El Nino, one number per month
python scripts/build_land.py        # coastlines for the globe

# the model
python scripts/train_fire_model.py  # build the feature matrix, fit, score
python scripts/tune_fire_model.py   # hyperparameter sweep on the tuning era
python scripts/fit_fire_model_v2.py # prune, re-tune, refit; gate on test AP
python scripts/build_model_card.py  # the model's paperwork, for the page

# the week ahead
python scripts/fetch_gfs.py         # forecast weather, GRIB2 from NOAA
python scripts/build_forecast.py    # apply the model, write the map
python scripts/build_horizons.py    # a model per horizon, plus the day index
python scripts/build_reasons.py     # three reasons per cell, packed for the browser
python scripts/name_hotspots.py     # place names from OpenStreetMap
python scripts/verify_forecast.py   # ask NASA what actually burned
```

Two things worth knowing before starting. `build_forecast.py` rewrites
`public/data/forecast.json` wholesale, which drops the hotspot names, the
calibration ladder and the horizon index — hence the three scripts after
it, and `index_horizons.py` if you only need the index back. And the
weather archive is 2.5 GB on disk: `pack_weather.py` exists so training
never holds more than a tile of it at once.

## Running it

```bash
npm install
npm run dev        # http://localhost:5178
npm test           # 56 unit tests over the harmonization and statistics core
npm run build      # static output in dist/
```

The build is static — no backend, no API keys at runtime. Fonts are vendored into `public/`. Map tiles come from Esri and OpenStreetMap-derived services that serve without a key; without a network the page still works and the map simply shows the fire grid on an empty canvas.

The view lives in the URL: `#/sierra/2020/raw` opens the Sierra Nevada, 2020, unadjusted. Links are shareable.

## Hosting

The site is static, so any host works. It ships with a Cloudflare Workers config:

```bash
npm run deploy:preview   # temporary URL, no Cloudflare account needed
npx wrangler login       # then, for a permanent one on your own account
npm run deploy
```

`public/_headers` sets immutable caching on the hashed bundles and vendored fonts, and an hour on the
archives. No secret reaches the build: `.env` stays out of `dist/`, and the FIRMS key is only ever used
by the offline archive builder.

## Building the archive

The bundled archives under `public/data/` are real FIRMS data, fetched by a script that runs the same `harmonize()` the browser runs:

```bash
FIRMS_MAP_KEY=your_key npm run archive:fetch            # all four areas
FIRMS_MAP_KEY=your_key npx tsx scripts/build-archive.ts sierra
```

A key is free from [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/map_key/).

Practical notes learned the hard way against the live API:

- Every area product caps a query at **5 days**, archive products included, whatever the documentation says.
- The key allows **5 000 transactions per rolling 10 minutes**, and *rejected* requests count too. The script paces itself at 5 requests/second.
- Once the quota is fully spent, FIRMS answers **`Invalid MAP_KEY`** to everything, including the availability endpoint. The key is fine; the window is not. Polling to ask whether the quota has recovered is what keeps it from recovering, so the script goes completely silent for 11 minutes instead.
- Every raw response is cached under `data/cache/`, so an interrupted run resumes instead of restarting.

Re-vendor the fonts with `node scripts/fetch-assets.mjs`.

## Data sources at runtime

Three ways in, one pipeline:

- **Bundled archive** — the precomputed cube, instant.
- **Live FIRMS** — paste a map key, query the NRT products for a recent window. The key stays in the browser.
- **Your CSV** — drop a FIRMS archive download. Parsed and harmonized locally; nothing is uploaded.

The live and upload paths call `harmonize()` in the browser, so what you see is the pipeline running, not a picture of it having run.

## Areas

Four areas whose burning calendars disagree with each other: **Punjab & Haryana** (post-harvest stubble, two sharp pulses set by the cropping calendar), **Sierra Nevada** (lightning and drought, one long late-summer season, strong trend), **Mato Grosso Cerrado** (dry-season savanna and deforestation fire), **Central Yakutia** (boreal fire over permafrost, and the extreme years of 2020–21).

## Going global

The plan for a worldwide map — measured download costs, the resolution pyramid that keeps 100 GB of raw data inside a browser, filters, and daily refresh — is written up in [docs/going-global.md](docs/going-global.md).

## Limits

- Active fire hotspots are **not burned area**. They mark burning at the moment of overpass; a fire under cloud or between overpasses is invisible.
- The reconciled series is an estimate with a stated range for its **whole** length, not only before 2012 — it is MODIS scaled by a measured ratio. Read it against “as recorded”, which is the observation.
- A day that only VIIRS saw reads as zero in the reconciled series. MODIS could not see that fire, and could not have seen it in 2005 either, so a series meant for comparison across the record must not carry it. Between 0.2% and 2.7% of cell-days, by area.
- Cloud cover, overpass timing and viewing geometry all bias detection in ways this does not correct.
- The map uses a coarser 5 km grid than the 1 km harmonization grid, for legibility and file size.

## Layout

```
src/core/      grid, harmonization, statistics, forecast + model card loaders
               (no DOM, unit tested)
src/sources/   FIRMS CSV parsing, archive loading, live queries
src/ui/        ribbon, annual cycle, globe, satellite frame, Leaflet map, charts
scripts/*.py   weather, model, forecast, horizons, reasons, verification
scripts/*.mjs  archive builder, asset vendoring, screenshot + contrast audit
tests/         56 tests over core
models/        fitted model, weather archive, feature rows  (gitignored)
public/data/   everything the page reads: archives, world pyramid, forecast
```

Data courtesy of NASA FIRMS / LANCE and the MODIS and VIIRS science teams.
