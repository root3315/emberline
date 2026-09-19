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
5. **A measured sensitivity ratio.** Over the overlap era (2012 onward) Emberline measures, *for this specific area*, how many active cells VIIRS resolves per MODIS cell. The median becomes the scaling factor for the MODIS-only years, and the interquartile range becomes its stated uncertainty. How much more a fine sensor resolves depends on how fragmented the fires are — a stubble-burning plain fragments nothing like a crown fire front — so this is never a global constant.
6. **FRP without double counting.** Within a cell-day, radiative power is the maximum across sensors, never the sum.

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

## Running it

```bash
npm install
npm run dev        # http://localhost:5178
npm test           # 55 unit tests over the harmonization and statistics core
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
- The pre-2012 adjustment is an estimate with a stated range, not a measurement. Read it with the Raw toggle.
- Cloud cover, overpass timing and viewing geometry all bias detection in ways this does not correct.
- The map uses a coarser 5 km grid than the 1 km harmonization grid, for legibility and file size.

## Layout

```
src/core/      grid, harmonization, statistics, area definitions  (no DOM, unit tested)
src/sources/   FIRMS CSV parsing, archive loading, live queries
src/ui/        ribbon, annual cycle, sensor contribution, Leaflet map, palette
scripts/       archive builder, asset vendoring, screenshot + contrast audit harness
tests/         55 tests over core
```

Data courtesy of NASA FIRMS / LANCE and the MODIS and VIIRS science teams.
