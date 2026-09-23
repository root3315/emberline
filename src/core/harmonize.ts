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

/** Below this, the overlap era is too thin to support an adjustment. */
export const MIN_RATIO_SAMPLES = 10

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
 * the region burned 55% more in 2018-2023 than in 2012-2017, while MODIS
 * alone — the one instrument present for every year of it — says 9% less.
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
 * `k` is the median of the daily ratios, and a median ratio is not the
 * ratio of the totals. Measured over each area's own overlap era, the
 * comparable series lands *below* what the two instruments together
 * actually counted: Punjab 0.97 of it, Sierra 0.94, Yakutia 0.94,
 * Cerrado 0.73. The median daily ratio is the smaller of the two
 * estimates, and `dailySensitivityRatios` only counts days with at least
 * three MODIS cells, which trims the very days where the ratio runs
 * highest. That is a level, not a slope — the same factor applies to 2005
 * and to 2020, so every comparison the page makes is unaffected, and the
 * observed counts are always one click away under "as recorded".
 *
 * The consequence worth naming: the reconciled series is now an estimate
 * for its whole length, in one consistent unit, rather than observations
 * after 2012 and estimates before it. The mixture was the thing that made
 * it incomparable in the first place.
 *
 * `fire-year.ts` uses the ratio of the sums instead, which matches the
 * observed totals and therefore sits at a different absolute level. Its
 * ring prints no counts, so the two never contradict each other on screen
 * — but making them one estimator means changing the coefficient this
 * project publishes, and that means rebuilding the archives from FIRMS.
 * Written down here rather than quietly left as a difference.
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
