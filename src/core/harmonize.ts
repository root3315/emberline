/**
 * The harmonization pipeline.
 *
 * Six steps turn two incompatible detection records into one comparable series:
 *   1. snap every detection onto a shared grid  (grid.ts)
 *   2. date it by local solar day               (grid.ts)
 *   3. deduplicate cells seen by several sensors on the same day
 *   4. collapse both confidence schemes onto one scale
 *   5. measure the sensitivity ratio between the two families, per AOI
 *   6. carry FRP without double counting the same fire
 *
 * Step 5 is the honest part. The pre-VIIRS record cannot be made equivalent to
 * the modern one; it can only be adjusted by a stated ratio carrying a stated
 * uncertainty. Every raw number survives alongside its adjusted twin so the
 * interface can always show both.
 */

import { cellOf, dayIndex, localSolarDay, DEFAULT_CELL_KM } from './grid'
import {
  MODIS_MASK,
  SENSOR_BIT,
  SENSOR_META,
  SENSORS,
  VIIRS_MASK,
  type CellDay,
  type ConfidenceClass,
  type DayRecord,
  type Detection,
  type SensorId,
} from './types'

/**
 * Step 4. MODIS reports 0-100, VIIRS reports low/nominal/high. The two schemes
 * meet at 30 and 80, the break points FIRMS documents for MODIS, rather than at
 * an invented midpoint.
 */
export function confidenceFromModis(pct: number): ConfidenceClass {
  if (pct >= 80) return 2
  if (pct >= 30) return 1
  return 0
}

export function confidenceFromViirs(token: string): ConfidenceClass {
  const t = String(token).trim().toLowerCase()
  if (t === 'h' || t === 'high') return 2
  if (t === 'l' || t === 'low') return 0
  if (t === 'n' || t === 'nominal') return 1
  const n = Number(t)
  return Number.isFinite(n) ? confidenceFromModis(n) : 1
}

export interface HarmonizeOptions {
  cellKm?: number
  /** Drop detections below this confidence class. */
  minConfidence?: ConfidenceClass
}

export interface CellAggregate {
  lat: number
  lon: number
  days: number
  frp: number
  sensors: number
}

export interface HarmonizedRecord {
  cellDays: CellDay[]
  /** One entry per day that had at least one detection, ascending. */
  days: DayRecord[]
  /** Per-cell totals across the whole record, for the map. */
  cells: Map<string, CellAggregate>
  sensorsPresent: Set<SensorId>
  firstDay: string | null
  lastDay: string | null
  rawDetections: number
}

/** Steps 1-4 and 6: raw detections in, one deduplicated cell-day record out. */
export function harmonize(detections: readonly Detection[], options: HarmonizeOptions = {}): HarmonizedRecord {
  const cellKm = options.cellKm ?? DEFAULT_CELL_KM
  const minConfidence = options.minConfidence ?? 0

  const byCellDay = new Map<string, CellDay>()
  const cells = new Map<string, CellAggregate>()
  const sensorsPresent = new Set<SensorId>()
  let rawDetections = 0

  for (const d of detections) {
    if (d.confidence < minConfidence) continue
    rawDetections++
    sensorsPresent.add(d.sensor)

    const cell = cellOf(d.lat, d.lon, cellKm)
    const day = localSolarDay(d.dateUtc, d.timeUtc, d.lon)
    const key = cell.id + '|' + day

    let rec = byCellDay.get(key)
    if (!rec) {
      rec = {
        cell: cell.id,
        day,
        sensors: 0,
        raw: 0,
        confidence: 0,
        frp: 0,
        night: true,
        lat: cell.lat,
        lon: cell.lon,
      }
      byCellDay.set(key, rec)
    }

    // Step 3: one cell seen by two sensors is one burning cell, not two.
    rec.sensors |= SENSOR_BIT[d.sensor]
    rec.raw++
    if (d.confidence > rec.confidence) rec.confidence = d.confidence
    // Step 6: two sensors staring at one fire is not twice the power.
    if (d.frp > rec.frp) rec.frp = d.frp
    if (!d.night) rec.night = false
  }

  const cellDays = [...byCellDay.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))

  const byDay = new Map<string, DayRecord>()
  for (const cd of cellDays) {
    let day = byDay.get(cd.day)
    if (!day) {
      day = { day: cd.day, activeCells: 0, modisOnly: 0, viirsOnly: 0, both: 0, frp: 0, raw: 0 }
      byDay.set(cd.day, day)
    }
    day.activeCells++
    day.frp += cd.frp
    day.raw += cd.raw

    const hasModis = (cd.sensors & MODIS_MASK) !== 0
    const hasViirs = (cd.sensors & VIIRS_MASK) !== 0
    if (hasModis && hasViirs) day.both++
    else if (hasModis) day.modisOnly++
    else day.viirsOnly++

    let agg = cells.get(cd.cell)
    if (!agg) {
      agg = { lat: cd.lat, lon: cd.lon, days: 0, frp: 0, sensors: 0 }
      cells.set(cd.cell, agg)
    }
    agg.days++
    agg.frp += cd.frp
    agg.sensors |= cd.sensors
  }

  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1))

  return {
    cellDays,
    days,
    cells,
    sensorsPresent,
    firstDay: days.length ? days[0].day : null,
    lastDay: days.length ? days[days.length - 1].day : null,
    rawDetections,
  }
}

export interface SensitivityRatio {
  /** Median VIIRS-to-MODIS active-cell ratio measured for this AOI. */
  k: number
  /** Interquartile bounds — the uncertainty the adjustment carries. */
  lo: number
  hi: number
  /** Days that qualified for the measurement. */
  samples: number
  /** First day on which both families were operating in this record. */
  overlapFrom: string | null
}

/**
 * Step 5, measured per AOI rather than assumed globally. How much more a 375 m
 * sensor resolves than a 1 km one depends on how fragmented the fires are, and
 * a stubble-burning plain fragments nothing like a crown fire front.
 */
export function measureSensitivity(record: HarmonizedRecord, minModisCells = 3): SensitivityRatio {
  return summarizeSensitivity(dailySensitivityRatios(record, minModisCells))
}

export interface DailyRatio {
  day: string
  ratio: number
}

/**
 * One ratio per day on which both families saw the AOI. Exposed separately so a
 * long archive can be processed a year at a time without holding every
 * detection in memory at once.
 */
export function dailySensitivityRatios(record: HarmonizedRecord, minModisCells = 3): DailyRatio[] {
  const perDay = new Map<string, { modis: number; viirs: number }>()
  for (const cd of record.cellDays) {
    let d = perDay.get(cd.day)
    if (!d) perDay.set(cd.day, (d = { modis: 0, viirs: 0 }))
    if (cd.sensors & MODIS_MASK) d.modis++
    if (cd.sensors & VIIRS_MASK) d.viirs++
  }

  const out: DailyRatio[] = []
  for (const [day, d] of [...perDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (d.modis < minModisCells || d.viirs === 0) continue
    out.push({ day, ratio: d.viirs / d.modis })
  }
  return out
}

export function summarizeSensitivity(daily: readonly DailyRatio[]): SensitivityRatio {
  const overlapFrom = daily.length ? daily.reduce((a, b) => (a.day < b.day ? a : b)).day : null
  if (daily.length < MIN_RATIO_SAMPLES) {
    return { k: 1, lo: 1, hi: 1, samples: daily.length, overlapFrom }
  }
  const ratios = daily.map((d) => d.ratio).sort((a, b) => a - b)
  return {
    k: quantileSorted(ratios, 0.5),
    lo: quantileSorted(ratios, 0.25),
    hi: quantileSorted(ratios, 0.75),
    samples: ratios.length,
    overlapFrom,
  }
}

/**
 * The trend each route shows over the same years, as a share per year.
 *
 * A drift of MODIS against VIIRS — the one thing a series built on MODIS
 * has to fear — shows up here as two different slopes. It is what the page
 * leads with; the correlation above only says the two move together.
 */
export function routeTrends(rows: readonly RouteYear[]): { modis: number; viirs: number; drift: number } | null {
  if (rows.length < 5) return null
  // The drift itself: Sen's slope of log(VIIRS route / MODIS route), as a
  // share per year. Zero if the two instruments tell one story; +10% if
  // one of them runs away from the other by a tenth a year.
  const logs = rows.map((r) => Math.log(r.viirs / r.modis))
  const pairs: number[] = []
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) pairs.push((logs[j] - logs[i]) / (rows[j].year - rows[i].year))
  }
  pairs.sort((x, y) => x - y)
  const drift = Math.exp(quantileSorted(pairs, 0.5)) - 1
  const slope = (key: 'modis' | 'viirs') => {
    const values = rows.map((r) => r[key])
    const slopes: number[] = []
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) slopes.push((values[j] - values[i]) / (rows[j].year - rows[i].year))
    }
    slopes.sort((a, b) => a - b)
    const median = quantileSorted([...values].sort((a, b) => a - b), 0.5)
    return median > 0 ? quantileSorted(slopes, 0.5) / median : 0
  }
  return { modis: slope('modis'), viirs: slope('viirs'), drift }
}

/** Below this, the overlap era is too thin to support an adjustment. */
export const MIN_RATIO_SAMPLES = 10

/**
 * The daily ratios from per-day family counts, for when the cell-days are
 * gone. The shipped archives keep only the daily sums, and `modisOnly +
 * both` is exactly the number of cells MODIS saw that day, so this is the
 * same measurement `dailySensitivityRatios` takes from the full record.
 */
export function ratiosFromDays(days: readonly DayRecord[], minModisCells = 3): DailyRatio[] {
  return ratiosFromCounts(
    days.map((d) => ({ day: d.day, modis: d.modisOnly + d.both, viirs: d.viirsOnly + d.both })),
    minModisCells,
  )
}

/**
 * The same rule for any unit: a region's active cells, or the planet's
 * detections, which have no cells to deduplicate.
 *
 * The planet's ribbon and the ring on the about page draw the same file,
 * and each used to derive its own coefficient from it — a median of daily
 * ratios in one, the ratio of the sums in the other. Both now come
 * through here.
 */
export function ratiosFromCounts(
  days: Iterable<{ day: string; modis: number; viirs: number }>,
  minModis = 3,
): DailyRatio[] {
  const out: DailyRatio[] = []
  for (const d of days) {
    if (d.modis < minModis || !(d.viirs > 0)) continue
    out.push({ day: d.day, ratio: d.viirs / d.modis })
  }
  return out
}

/** Day `index` (0-based) of `year`, as an ISO date. */
export function dayOfYearIso(year: number, index: number): string {
  return new Date(Date.UTC(year, 0, 1 + index)).toISOString().slice(0, 10)
}

export interface EraRatio extends SensitivityRatio {
  /** The VIIRS satellites flying through this era, oldest first. */
  fleet: SensorId[]
  from: string
  /** Last day of the era, or null for the one still running. */
  to: string | null
}

/**
 * The same ratio, measured separately for each VIIRS fleet.
 *
 * `k` is one median over the whole overlap, and the overlap is not one
 * instrument: S-NPP alone until NOAA-20's data begins, two satellites
 * until NOAA-21's, three after. Each extra satellite adds overpasses, so
 * the VIIRS count per MODIS cell climbs with the fleet rather than with
 * the fire — Punjab reads 4.60, 9.14 and 12.57 across the three.
 *
 * That is why the single `k` scales the whole record and never enters its
 * shape. It is also why the published figure has to be read as a median
 * over a mixture of fleets, which this is here to show.
 *
 * Era boundaries come from `SENSOR_META`, the dates the archive's data
 * actually begins, so the table and the availability rail cannot
 * disagree about when a satellite joined.
 */
export function sensitivityByEra(daily: readonly DailyRatio[]): EraRatio[] {
  const viirs = SENSORS.filter((s) => SENSOR_META[s].platform === 'viirs').sort((a, b) =>
    SENSOR_META[a].since < SENSOR_META[b].since ? -1 : 1,
  )
  return viirs.map((id, i) => {
    const from = SENSOR_META[id].since
    const next = viirs[i + 1]
    const to = next ? previousDay(SENSOR_META[next].since) : null
    const inside = daily.filter((d) => d.day >= from && (to === null || d.day <= to))
    return { ...summarizeSensitivity(inside), fleet: viirs.slice(0, i + 1), from, to }
  })
}

function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

export interface Calibration extends SensitivityRatio {
  /**
   * "reference": measured while S-NPP was the only VIIRS, so the reconciled
   * series is in the units of one VIIRS. "overlap": the record does not
   * reach that era, and the median over whatever overlap it has is used.
   */
  basis: 'reference' | 'overlap'
  /** The days the coefficient was measured on. */
  from: string | null
  to: string | null
  /** The median over the whole overlap: the figure this project published before. */
  overlap: SensitivityRatio
  /**
   * 95% interval on `k` itself, from resampling whole years of the
   * reference era. The interquartile range of the daily ratios says how
   * much one day differs from another; this says how well the median is
   * known, which is what a reconciled total inherits.
   */
  ci: { lo: number; hi: number } | null
}

/**
 * The coefficient the reconciled series is expressed in.
 *
 * It was the median over the whole overlap, which is a mixture of three
 * fleets — Punjab's 7.07 sits between 4.60 for S-NPP alone and 12.57 for
 * three satellites — so "VIIRS-equivalent" had no fixed meaning, and every
 * rebuild that added NOAA-21 days moved it and rescaled the whole history.
 *
 * Measured on the years S-NPP flew alone, the unit is one VIIRS, and the
 * era is closed: 2012-01-20 to 2018-03-31 will hold the same days in every
 * rebuild. It is also where the constant can be tested cleanly
 * (`leaveOneYearOut`): with each year of 2013-2017 left out in turn it
 * predicts what S-NPP counted in the missing year typically within 3-10%,
 * at worst Yakutia 2015 at -33%. A power law on MODIS, the obvious
 * alternative, is nowhere better on the same test and in Punjab much worse
 * (+47% against +19%); `scripts/compare-transfer.ts` reruns both.
 */
export function calibrate(daily: readonly DailyRatio[]): Calibration {
  const overlap = summarizeSensitivity(daily)
  const reference = sensitivityByEra(daily)[0]
  if (reference && reference.samples >= MIN_RATIO_SAMPLES) {
    const { fleet: _fleet, from, to, ...ratio } = reference
    const inside = daily.filter((d) => d.day >= from && (to === null || d.day <= to))
    // The days actually measured: a file covering 45 days of 2015 printed
    // the era's bounds, "2012 to 2018", as if it held all of them.
    return {
      ...ratio,
      basis: 'reference',
      from: inside[0]?.day ?? from,
      to: inside[inside.length - 1]?.day ?? to,
      overlap,
      ci: bootstrapByYear(inside),
    }
  }
  return {
    ...overlap,
    basis: 'overlap',
    from: daily[0]?.day ?? null,
    to: daily[daily.length - 1]?.day ?? null,
    overlap,
    ci: bootstrapByYear(daily),
  }
}

/**
 * The median ratio, re-estimated on whole years drawn with replacement.
 *
 * Years, not days: consecutive days share weather, fires and overpass
 * geometry, and resampling them one at a time would pretend there are a
 * thousand independent measurements where there are six or seven years.
 * Seeded, so the page prints the same interval on every load.
 */
export function bootstrapByYear(daily: readonly DailyRatio[], draws = 1000): { lo: number; hi: number } | null {
  const byYear = new Map<string, number[]>()
  for (const d of daily) {
    const y = d.day.slice(0, 4)
    let list = byYear.get(y)
    if (!list) byYear.set(y, (list = []))
    list.push(d.ratio)
  }
  const years = [...byYear.values()]
  if (years.length < 3) return null
  let seed = 20260923
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const medians: number[] = []
  for (let b = 0; b < draws; b++) {
    const pool: number[] = []
    for (let j = 0; j < years.length; j++) pool.push(...years[Math.floor(next() * years.length)])
    pool.sort((a, c) => a - c)
    medians.push(quantileSorted(pool, 0.5))
  }
  medians.sort((a, c) => a - c)
  return { lo: quantileSorted(medians, 0.025), hi: quantileSorted(medians, 0.975) }
}

export interface RouteYear {
  year: number
  /** MODIS × k: the reconciled series as the page draws it. */
  modis: number
  /** VIIRS brought to the same unit: its count × k ÷ the ratio of its own fleet. */
  viirs: number
}

/**
 * The same years, reached by two instruments that do not share a detection.
 *
 * The reconciled series is MODIS scaled once, and the question it invites is
 * what VIIRS contributes. This is the answer: VIIRS, divided by how much its
 * own fleet sees per MODIS cell and multiplied into the same unit, is a
 * second estimate of every year from 2012. Where the two agree, a year is
 * confirmed by two independent sensors; where they part, the gap is the
 * uncertainty of comparing those years; and when MODIS is switched off —
 * Terra and Aqua are near the end of their missions — the VIIRS route is
 * how the series goes on.
 *
 * By construction the routes agree on the median day of each fleet, so the
 * test is not their level but whether they move together year to year.
 */
export function twoRoutes(days: readonly DayRecord[], cal: Calibration): RouteYear[] {
  const viirs = viirsRouteByDay(days, cal)
  if (!viirs.size) return []
  const byYear = new Map<number, RouteYear>()
  for (const d of days) {
    const v = viirs.get(d.day)
    if (v === undefined) continue
    const year = Number(d.day.slice(0, 4))
    let row = byYear.get(year)
    if (!row) byYear.set(year, (row = { year, modis: 0, viirs: 0 }))
    row.modis += (d.modisOnly + d.both) * cal.k
    row.viirs += v
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year)
}

/**
 * The second route, a day at a time: VIIRS alone, in the reconciled unit.
 *
 * Each day's VIIRS count times the reference factor, divided by what its
 * own fleet sees per MODIS cell. It shares no detection with the series,
 * which is what makes it a check, and it needs no MODIS at all, which is
 * how the record can go on once the MODIS pair stops flying. Days before
 * VIIRS, or in an era too short to have its own ratio, have no value.
 */
export function viirsRouteByDay(days: readonly DayRecord[], cal: Calibration): Map<string, number> {
  const out = new Map<string, number>()
  if (cal.basis !== 'reference') return out
  const eras = sensitivityByEra(ratiosFromDays(days)).filter((e) => e.samples >= MIN_RATIO_SAMPLES)
  if (!eras.length) return out
  const eraOf = (day: string) => eras.find((e) => day >= e.from && (e.to === null || day <= e.to))
  for (const d of days) {
    const era = eraOf(d.day)
    if (era) out.set(d.day, ((d.viirsOnly + d.both) * cal.k) / era.k)
  }
  return out
}

export interface HeldOutYear {
  year: number
  /** MODIS cell-days times the coefficient fitted without this year. */
  predicted: number
  /** What VIIRS itself counted that year. */
  observed: number
}

/**
 * Does MODIS times one number reproduce what VIIRS saw, on a year it was
 * not fitted to?
 *
 * Inside the reference era there is one VIIRS, so the target does not
 * move. Each whole year of the era is left out in turn, `k` is fitted on
 * the rest, and the prediction for the missing year is compared with what
 * S-NPP counted. It used to test only the last two years, which sit next
 * to the years they were fitted on and flattered the result: Punjab 2013
 * misses by 19% and Yakutia 2015 by a third, and a reader should see that.
 *
 * No pass mark is applied here. The page prints the errors; judging them
 * is the reader's business.
 */
export function leaveOneYearOut(days: readonly DayRecord[], minModisCells = 3): HeldOutYear[] {
  const era = sensitivityByEra([])[0]
  if (!era?.to) return []
  const firstWhole = Number(era.from.slice(0, 4)) + (era.from.endsWith('-01-01') ? 0 : 1)
  const lastWhole = Number(era.to.slice(0, 4)) - (era.to.endsWith('-12-31') ? 0 : 1)
  const inside = days.filter((d) => d.day >= era.from && d.day <= era.to!)
  const out: HeldOutYear[] = []
  for (let year = firstWhole; year <= lastWhole; year++) {
    const tag = String(year)
    const fit = summarizeSensitivity(ratiosFromDays(inside.filter((d) => !d.day.startsWith(tag)), minModisCells))
    if (fit.samples < MIN_RATIO_SAMPLES) continue
    let modis = 0
    let viirs = 0
    for (const d of inside) {
      if (!d.day.startsWith(tag)) continue
      modis += d.modisOnly + d.both
      viirs += d.viirsOnly + d.both
    }
    if (viirs > 0) out.push({ year, predicted: modis * fit.k, observed: viirs })
  }
  return out
}

/**
 * Whether the two routes rise and fall together: the correlation of their
 * year-on-year changes, in logs.
 *
 * Their level is matched by construction — each fleet's ratio is measured
 * on the same days the VIIRS route is divided by — so agreeing in level
 * proves nothing. This measures the wiggles. It cannot see a steady drift
 * of one route against the other: centring the changes removes it, and an
 * added +10% a year leaves r where it was. `routeTrends` is the check that
 * can.
 */
export function routeAgreement(rows: readonly RouteYear[]): { r: number; n: number } | null {
  const dm: number[] = []
  const dv: number[] = []
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]
    const b = rows[i]
    if (a.modis <= 0 || b.modis <= 0 || a.viirs <= 0 || b.viirs <= 0) continue
    dm.push(Math.log(b.modis / a.modis))
    dv.push(Math.log(b.viirs / a.viirs))
  }
  if (dm.length < 4) return null
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const mm = mean(dm)
  const mv = mean(dv)
  let cov = 0
  let vm = 0
  let vv = 0
  for (let i = 0; i < dm.length; i++) {
    cov += (dm[i] - mm) * (dv[i] - mv)
    vm += (dm[i] - mm) ** 2
    vv += (dv[i] - mv) ** 2
  }
  return vm > 0 && vv > 0 ? { r: cov / Math.sqrt(vm * vv), n: dm.length } : null
}

export interface AdjustedDay {
  day: string
  /** What the instruments actually counted. */
  raw: number
  /** Raw, or a MODIS-only day scaled to its VIIRS-era equivalent. */
  value: number
  lo: number
  hi: number
  /** True when this day predates VIIRS and carries the adjustment. */
  adjusted: boolean
}

/**
 * Step 5, applied. One instrument carries the whole series.
 *
 * ── Why not "scale the old part up and leave the rest" ────────────────
 *
 * That is what this did, and it closes one seam out of three. VIIRS is not
 * one instrument arriving once: S-NPP in 2012, NOAA-20 in 2018, NOAA-21 in
 * 2024. Scaling the pre-2012 days to meet the combined count leaves the
 * combined count free to keep climbing underneath, once per satellite.
 *
 * Measured on the archive this repository ships: Punjab's old series says
 * the region burned 52% more in 2018-2023 than in 2012-2017, while MODIS
 * alone — the one instrument present for every year of it — says 10% less.
 * A 1.7x divergence with no fire behind it. Cerrado showed the same sign.
 * That is the challenge's own defect, one satellite generation younger.
 *
 * ── What it does instead ──────────────────────────────────────────────
 *
 * The comparable series is built from MODIS cell-days throughout, scaled
 * once by the measured ratio. MODIS never changed: Terra and Aqua have
 * been flying the same 1 km sensor since 2002, so a series driven by them
 * moves only when fire moves. `k` is a constant, so the product is
 * homogeneous from the first day to the last — no step at any satellite,
 * because no satellite enters the arithmetic.
 *
 * Before 2012 this is exactly what it was: with no VIIRS in orbit,
 * `modisOnly + both` is `activeCells`, and the value is unchanged. The
 * difference is entirely in the modern era, which used to be the
 * reference frame and is now measured the same way as the rest.
 *
 * ── What it costs, said plainly ───────────────────────────────────────
 *
 * A day that only VIIRS saw reads as zero here. That is the honest
 * consequence rather than a bug: MODIS could not see that fire, and it
 * could not have seen it in 2005 either, so a series meant for comparison
 * across the record must not contain it. Every raw number survives beside
 * its adjusted twin — `raw` is still the true combined count, and "as
 * recorded" shows it — which is the whole reason both are carried.
 *
 * `src/ui/fire-year.ts` has drawn the radial year this way from the
 * start, and `train_fire_model.py` picks MODIS-only targets for the same
 * reason. This brings the regional series into line with both.
 *
 * ── One thing to know about the level ─────────────────────────────────
 *
 * `k` is measured on the years S-NPP flew alone (`calibrate`), so the
 * series is in the units of one VIIRS, and in the modern years it sits
 * well below what two or three VIIRS and MODIS together counted. That is
 * the unit, not an error: the observed counts are one click away under
 * "as recorded". It is a level, not a slope — the same factor applies to
 * 2005 and to 2020 — but it is not a guarantee that two years compare
 * exactly: the ratio also falls on busy days, so a year-to-year comparison
 * is MODIS's comparison, and within one fleet MODIS × k and VIIRS differ
 * by up to 20% a year in the S-NPP era and more in the later ones
 * (`twoRoutes`, `leaveOneYearOut`, and docs/how-it-works.md).
 *
 * The consequence worth naming: the reconciled series is now an estimate
 * for its whole length, in one consistent unit, rather than observations
 * after 2012 and estimates before it. The mixture was the thing that made
 * it incomparable in the first place.
 *
 * `fire-year.ts` used the ratio of the sums instead, a different
 * estimator on the same file the planet's ribbon reads with this one. It
 * now takes its coefficient through `ratiosFromCounts` like the ribbon,
 * so the planet has one reconciled level wherever it is drawn.
 */
/**
 * The comparable number for one day, from what each family saw.
 *
 * Reconciled is MODIS scaled once; observed is the two added together.
 * The whole argument of this project is in that first branch, and the
 * branch that is missing is as important: there is no "after 2012 use
 * both". Adding them after the overlap begins puts the size of the fleet
 * back into the modern half of the series, which is the defect the rest
 * of this file exists to remove.
 *
 * It lives here because it used to live in two places. The regional
 * series was moved onto the rule above; the planet's ribbon had its own
 * copy in `main.ts` and kept the old one, and no test could see the
 * difference. Callers differ only in their unit — a region counts active
 * cells, the global levels count detections — and the arithmetic is the
 * same either way.
 */
export function comparable(modis: number, viirs: number, k: number | null): number {
  return k === null ? modis + viirs : modis * k
}

export function applySensitivity(days: readonly DayRecord[], ratio: SensitivityRatio): AdjustedDay[] {
  const usable = ratio.samples >= MIN_RATIO_SAMPLES
  return days.map((d) => {
    const raw = d.activeCells
    if (!usable) {
      // No measurable overlap: there is no honest adjustment to make, so
      // the series stays raw and says so.
      return { day: d.day, raw, value: raw, lo: raw, hi: raw, adjusted: false }
    }
    const modis = d.modisOnly + d.both
    return {
      day: d.day,
      raw,
      value: modis * ratio.k,
      lo: modis * ratio.lo,
      hi: modis * ratio.hi,
      adjusted: true,
    }
  })
}

/** Which sensors were in orbit on a given day — drives the availability rail. */
export function sensorsOnDay(day: string): SensorId[] {
  return SENSORS.filter((s) => day >= SENSOR_META[s].since)
}

export function quantileSorted(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export { dayIndex }
