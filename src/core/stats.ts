/**
 * Climatology and anomaly detection.
 *
 * A calendar of burning activity is only useful against a baseline: "4 000 active
 * cells" means nothing until you know whether this week normally has forty or
 * four thousand. Everything here builds that baseline from the record itself,
 * per day of year, and then reports how a given year departs from it — in
 * sentences a duty officer can act on, not z-scores.
 */

import { dayOfYear, daysInYear, yearOf } from './grid'
import { quantileSorted, type AdjustedDay } from './harmonize'

export const DOY_MAX = 366

/** Activity per day of year, one row per calendar year. */
export type YearGrid = Map<number, Float64Array>

/**
 * Lay the series out as year x day-of-year. Days with no detections are real
 * zeros, not gaps: FIRMS reports no row for a quiet day, and a quiet day is
 * exactly what we want the calendar to show.
 */
export function toYearGrid(days: readonly AdjustedDay[], useAdjusted = true): YearGrid {
  const grid: YearGrid = new Map()
  for (const d of days) {
    const y = yearOf(d.day)
    let row = grid.get(y)
    if (!row) grid.set(y, (row = new Float64Array(DOY_MAX + 1)))
    row[dayOfYear(d.day)] += useAdjusted ? d.value : d.raw
  }
  return grid
}

export interface Climatology {
  /** Indexed 1..366. */
  median: Float64Array
  p10: Float64Array
  p90: Float64Array
  mean: Float64Array
  /** Years that contributed. */
  years: number[]
  windowDays: number
}

/**
 * Per-day-of-year distribution, pooled over a +/- window. A single calendar day
 * across twenty-odd years is a sample of twenty — far too noisy to call a
 * "normal". Pooling a week either side turns it into a few hundred and smooths
 * the day-to-day jitter without blurring the season itself.
 */
export function climatology(grid: YearGrid, windowDays = 7, excludeYears: readonly number[] = []): Climatology {
  const skip = new Set(excludeYears)
  const years = [...grid.keys()].filter((y) => !skip.has(y)).sort((a, b) => a - b)

  const median = new Float64Array(DOY_MAX + 1)
  const p10 = new Float64Array(DOY_MAX + 1)
  const p90 = new Float64Array(DOY_MAX + 1)
  const mean = new Float64Array(DOY_MAX + 1)
  if (years.length === 0) return { median, p10, p90, mean, years, windowDays }

  const pool: number[] = []
  for (let doy = 1; doy <= DOY_MAX; doy++) {
    pool.length = 0
    let sum = 0
    for (const y of years) {
      const row = grid.get(y)!
      const span = daysInYear(y)
      for (let o = -windowDays; o <= windowDays; o++) {
        // Wrap across the new year: fire seasons do not stop at 31 December.
        let d = doy + o
        if (d < 1) d += span
        if (d > span) d -= span
        const v = row[d]
        pool.push(v)
        sum += v
      }
    }
    pool.sort((a, b) => a - b)
    median[doy] = quantileSorted(pool, 0.5)
    p10[doy] = quantileSorted(pool, 0.1)
    p90[doy] = quantileSorted(pool, 0.9)
    mean[doy] = sum / pool.length
  }
  return { median, p10, p90, mean, years, windowDays }
}

export interface SeasonShape {
  /** Day of year at which 10% of the annual total has accumulated. */
  start: number
  /** Day of year of the smoothed peak. */
  peak: number
  /** Day of year at which 90% has accumulated. */
  end: number
  /**
   * How many days the season covers, counting both ends.
   *
   * A count, not a difference: a season from 6 May to 12 November is
   * 191 days, and the tile that prints this beside those two dates said
   * 190. The two shift statistics subtract one of these from another,
   * where the extra day cancels.
   */
  length: number
  total: number
  peakValue: number
  /**
   * The long quiet spell inside the season, when there is one.
   *
   * Null for a place with a single season, which is most of them. Set
   * where the 10-to-90 rule has spanned two seasons and the trough
   * between: the days are inclusive and lie strictly inside `start` and
   * `end`.
   */
  gap: { from: number; to: number; days: number } | null
}

/**
 * How quiet a day has to be to count as out of season, and for how long.
 *
 * A tenth of the peak, for thirty days. The floor matters as much as the
 * depth: a fortnight of rain in the middle of one season is weather, and
 * calling it a second season would be worse than the fault this fixes.
 * Measured on the areas this repository ships, through this very
 * function: the longest such spell runs 154 days in Punjab, 125 in
 * Central Yakutia, 105 in the Sierra Nevada and 49 in the Cerrado. Length
 * alone does not separate them, then, and the vote below is what does —
 * 25 years of 27 carry a break in Punjab, against 11 of 26, 12 of 27 and
 * 2 of 27 elsewhere. A place that burns twice does it every year; a place
 * that had one wet August does not.
 */
const QUIET_SHARE = 0.1
const QUIET_DAYS = 30

/**
 * Where the season sits and how long it runs. Onset is taken at 10% of the
 * annual total rather than at the first detection, because one stray hot pixel
 * in February should not redefine when the season began.
 */
export function seasonShape(row: Float64Array, span = 365): SeasonShape | null {
  let total = 0
  for (let d = 1; d <= span; d++) total += row[d]
  if (total <= 0) return null

  const smooth = smoothCircular(row, span, 7)
  let peak = 1
  let peakValue = -1
  for (let d = 1; d <= span; d++) {
    if (smooth[d] > peakValue) {
      peakValue = smooth[d]
      peak = d
    }
  }

  let cum = 0
  let start = 1
  let end = span
  let haveStart = false
  for (let d = 1; d <= span; d++) {
    cum += row[d]
    if (!haveStart && cum >= total * 0.1) {
      start = d
      haveStart = true
    }
    if (cum >= total * 0.9) {
      end = d
      break
    }
  }
  // The trough, if the window that was just measured contains one.
  let gap: SeasonShape['gap'] = null
  let run = 0
  for (let d = start + 1; d < end; d++) {
    if (smooth[d] < peakValue * QUIET_SHARE) {
      run += 1
      if (run >= QUIET_DAYS && (!gap || run > gap.days)) {
        gap = { from: d - run + 1, to: d, days: run }
      }
    } else {
      run = 0
    }
  }

  return { start, peak, end, length: end - start + 1, total, peakValue: row[peak], gap }
}

/**
 * How many days of a season actually burn.
 *
 * The whole span for a place with one season. For a place with two, the
 * two windows added up — and counted from `start`, `gap.from`, `gap.to`
 * and `end`, which are the four dates the page prints, rather than by
 * subtracting `gap.days` from `length`.
 *
 * Those two are the same arithmetic on one year and different arithmetic
 * on the typical season, because the typical season is not a season: each
 * of its fields is a median taken separately across the years, and three
 * independent medians need not agree. Punjab's median gap runs 23 May to
 * 6 October, a span of 137 days, while the median of the per-year gap
 * lengths is 135. The subtraction gave 56 under a sentence naming two
 * windows of 17 and 37 days.
 */
export function burningDays(shape: SeasonShape): number {
  if (!shape.gap) return shape.length
  return Math.max(0, shape.gap.from - shape.start) + Math.max(0, shape.end - shape.gap.to)
}

function smoothCircular(row: Float64Array, span: number, half: number): Float64Array {
  const out = new Float64Array(row.length)
  for (let d = 1; d <= span; d++) {
    let sum = 0
    for (let o = -half; o <= half; o++) {
      let i = d + o
      if (i < 1) i += span
      if (i > span) i -= span
      sum += row[i]
    }
    out[d] = sum / (half * 2 + 1)
  }
  return out
}

export interface CriticalPeriod {
  startDoy: number
  endDoy: number
  days: number
  /** Total activity inside the window. */
  total: number
  /** How many times above the seasonal normal the window ran. */
  ratio: number
}

/**
 * Runs of consecutive days above the 90th percentile — the windows where this
 * year outran its own history and where response capacity would have been under
 * strain. Short spikes are dropped; a two-day blip is weather, not a period.
 */
export function criticalPeriods(row: Float64Array, clim: Climatology, span = 365, minDays = 3): CriticalPeriod[] {
  const out: CriticalPeriod[] = []
  let runStart = -1
  let runTotal = 0
  let normTotal = 0

  const close = (endDoy: number) => {
    if (runStart < 0) return
    const days = endDoy - runStart + 1
    if (days >= minDays && runTotal > 0) {
      out.push({
        startDoy: runStart,
        endDoy,
        days,
        total: runTotal,
        ratio: normTotal > 0 ? runTotal / normTotal : Infinity,
      })
    }
    runStart = -1
    runTotal = 0
    normTotal = 0
  }

  for (let d = 1; d <= span; d++) {
    const above = row[d] > clim.p90[d] && row[d] > 0
    if (above) {
      if (runStart < 0) runStart = d
      runTotal += row[d]
      normTotal += clim.median[d]
    } else {
      close(d - 1)
    }
  }
  close(span)
  return out.sort((a, b) => b.total - a.total)
}

export interface YearAnalysis {
  year: number
  shape: SeasonShape | null
  /** Median season shape across every other year in the record. */
  normal: SeasonShape | null
  /** Annual total relative to the median annual total. */
  totalRatio: number
  /** Negative means the season opened earlier than normal. */
  startShiftDays: number | null
  peakShiftDays: number | null
  lengthShiftDays: number | null
  critical: CriticalPeriod[]
  /** Days spent above the 90th percentile. */
  daysAboveP90: number
}

export function analyzeYear(year: number, grid: YearGrid, clim: Climatology): YearAnalysis {
  const row = grid.get(year) ?? new Float64Array(DOY_MAX + 1)
  const span = daysInYear(year)
  const shape = seasonShape(row, span)

  const others = clim.years.filter((y) => y !== year)
  const shapes = others
    .map((y) => seasonShape(grid.get(y)!, daysInYear(y)))
    .filter((s): s is SeasonShape => s !== null)

  const normal: SeasonShape | null = shapes.length
    ? {
        start: medianOf(shapes.map((s) => s.start)),
        peak: medianOf(shapes.map((s) => s.peak)),
        end: medianOf(shapes.map((s) => s.end)),
        length: medianOf(shapes.map((s) => s.length)),
        total: medianOf(shapes.map((s) => s.total)),
        peakValue: medianOf(shapes.map((s) => s.peakValue)),
        /*
         * Two seasons, if most years have two.
         *
         * A median over the gaps of only the years that had one would
         * turn a single odd summer into a permanent feature of the
         * place. The question is whether this is how the area behaves,
         * so the years vote first and the medians are taken after.
         */
        gap: (() => {
          const gaps = shapes.map((x) => x.gap).filter((g): g is NonNullable<typeof g> => g !== null)
          return gaps.length * 2 > shapes.length
            ? {
                from: medianOf(gaps.map((g) => g.from)),
                to: medianOf(gaps.map((g) => g.to)),
                days: medianOf(gaps.map((g) => g.days)),
              }
            : null
        })(),
      }
    : null

  let daysAboveP90 = 0
  for (let d = 1; d <= span; d++) if (row[d] > clim.p90[d] && row[d] > 0) daysAboveP90++

  return {
    year,
    shape,
    normal,
    totalRatio: shape && normal && normal.total > 0 ? shape.total / normal.total : 1,
    startShiftDays: shape && normal ? shape.start - normal.start : null,
    peakShiftDays: shape && normal ? shape.peak - normal.peak : null,
    lengthShiftDays: shape && normal ? shape.length - normal.length : null,
    critical: criticalPeriods(row, clim, span),
    daysAboveP90,
  }
}

function medianOf(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  return Math.round(quantileSorted(s, 0.5))
}

export interface Trend {
  /** Change in annual total per year. */
  slope: number
  /** Slope as a share of the median annual total. */
  slopePct: number
  years: number
  /** Two-sided Mann-Kendall p-value for "there is a monotonic trend". */
  p: number
  /** Sen's 95% confidence interval on the slope, as shares of the median. */
  loPct: number
  hiPct: number
}

/** Below this, a slope is printed as a trend. */
export const TREND_ALPHA = 0.05

/**
 * The first year the MODIS pair was complete.
 *
 * Terra came up in November 2000 and Aqua in July 2002, and two
 * satellites see roughly twice the overpasses of one. Measured on this
 * repository's own archives, Punjab averages 11.0k MODIS cell-days over
 * 2001 and 2002 and 21.0k over the nine years after Aqua — a 1.9x step
 * with no fire behind it, which is the same defect this project exists to
 * remove, one satellite generation earlier than the one it is named for.
 * (Those are the instrument's own counts. Carried through the sensitivity
 * coefficient, the way the comparable series carries them, they read
 * 77.6k and 148.7k, and the ratio is the same either way.)
 *
 * It only matters where a statistic integrates across the seam. A
 * calendar row is one year and implies no comparison; a climatology pools
 * twenty-odd years and two of them barely move it. A trend is exactly the
 * thing that must not span it.
 */
export const MODIS_PAIR_FROM = 2003

/**
 * Theil-Sen slope over annual totals. The median of pairwise slopes shrugs off
 * the one catastrophic year that would drag an ordinary least-squares line
 * across the whole record.
 */
export function annualTrend(grid: YearGrid, whole?: { from: string; to: string }): Trend | null {
  /*
   * Part years are left out, because a part year is a low year for a
   * reason that has nothing to do with fire.
   *
   * The archive opens in November 2000, when Terra came up, and closes on
   * whatever day it was last built. Both of those years hold a fraction
   * of a season and both pull on the slope. Yakutia, whose record starts
   * in May 2001, is the clearest case: every year gives -0.98%, and this
   * rule — with the 2003 floor below — gives +4.34%. That is the right
   * slope to take, and still not a trend: Mann-Kendall below puts it at
   * p = 0.49, so the page prints the slope with its interval and says no
   * trend can be claimed.
   *
   * The range is optional so the statistic can still be taken over a bare
   * grid, which is what the tests do.
   */
  const opens = whole ? Number(whole.from.slice(0, 4)) + (whole.from.endsWith('-01-01') ? 0 : 1) : -Infinity
  // And never before both MODIS satellites were up, for the reason above.
  const first = whole ? Math.max(opens, MODIS_PAIR_FROM) : -Infinity
  const last = whole ? Number(whole.to.slice(0, 4)) - (whole.to.endsWith('-12-31') ? 0 : 1) : Infinity

  const totals: Array<[number, number]> = []
  for (const [year, row] of [...grid.entries()].sort((a, b) => a[0] - b[0])) {
    if (year < first || year > last) continue
    let sum = 0
    for (let d = 1; d <= daysInYear(year); d++) sum += row[d]
    totals.push([year, sum])
  }
  if (totals.length < 4) return null

  const slopes: number[] = []
  for (let i = 0; i < totals.length; i++) {
    for (let j = i + 1; j < totals.length; j++) {
      const dx = totals[j][0] - totals[i][0]
      if (dx !== 0) slopes.push((totals[j][1] - totals[i][1]) / dx)
    }
  }
  slopes.sort((a, b) => a - b)
  const slope = quantileSorted(slopes, 0.5)
  const median = quantileSorted([...totals.map((t) => t[1])].sort((a, b) => a - b), 0.5)
  const share = (v: number) => (median > 0 ? v / median : 0)

  /*
   * Whether the slope is there at all.
   *
   * A median slope is printed for any record, and "+4.3% a year" under
   * Yakutia read as a finding. Over its 23 full years Mann-Kendall gives
   * p = 0.49, and Sen's interval runs from a fall to a rise several times
   * larger: the number was the middle of a range that includes no change.
   * The page now says a trend only when the test does, and carries the
   * interval either way.
   */
  const values = totals.map((t) => t[1])
  const n = values.length
  let S = 0
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) S += Math.sign(values[j] - values[i])
  const ties = new Map<number, number>()
  for (const v of values) ties.set(v, (ties.get(v) ?? 0) + 1)
  let tieTerm = 0
  for (const t of ties.values()) tieTerm += t * (t - 1) * (2 * t + 5)
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18
  const z = variance > 0 ? (S > 0 ? (S - 1) / Math.sqrt(variance) : S < 0 ? (S + 1) / Math.sqrt(variance) : 0) : 0
  const p = 2 * (1 - normalCdf(Math.abs(z)))

  // Sen (1968): the interval is read off the ordered pairwise slopes.
  const c = 1.959964 * Math.sqrt(variance)
  const lower = Math.max(0, Math.round((slopes.length - c) / 2) - 1)
  const upper = Math.min(slopes.length - 1, Math.round((slopes.length + c) / 2))
  return {
    slope,
    slopePct: share(slope),
    years: n,
    p,
    loPct: share(slopes[lower]),
    hiPct: share(slopes[upper]),
  }
}

/** Standard normal CDF, Abramowitz and Stegun 7.1.26 (error below 1.5e-7). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2))
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-(x * x) / 2)
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2
}

/**
 * The years a baseline or a comparison may use.
 *
 * Whole years only, and none before the MODIS pair was complete. The
 * climatology used to take every year on the grid: January to October 2000
 * before Terra had flown, the months of the running year that have not
 * happened yet, and 2001-2002, when one MODIS counted about a third of
 * what two do — all as zeros or near-zeros under "usual". In Punjab that
 * pulled the 2 November median down by a fifth and let 775 days rather
 * than 717 read as busier than usual across 2003-2025.
 */
export function comparableYears(years: readonly number[], range: { from: string; to: string }): number[] {
  const first = Number(range.from.slice(0, 4)) + (range.from.endsWith('-01-01') ? 0 : 1)
  const last = Number(range.to.slice(0, 4)) - (range.to.endsWith('-12-31') ? 0 : 1)
  return years.filter((y) => y >= Math.max(first, MODIS_PAIR_FROM) && y <= last)
}

/**
 * How many days carry a given share of the year.
 *
 * The single most useful number a fire calendar can hand a duty officer: a year
 * whose worst 50% arrives over nine days needs a completely different posture
 * from one that spreads the same total across two months.
 */
export function concentrationDays(row: Float64Array, span = 365, share = 0.5): number {
  const values: number[] = []
  let total = 0
  for (let d = 1; d <= span; d++) {
    if (row[d] > 0) {
      values.push(row[d])
      total += row[d]
    }
  }
  if (total <= 0) return 0

  values.sort((a, b) => b - a)
  let acc = 0
  for (let i = 0; i < values.length; i++) {
    acc += values[i]
    if (acc >= total * share) return i + 1
  }
  return values.length
}

/** Share of the year that falls in each calendar month, 0..11. */
export function monthlyShare(row: Float64Array, year: number): number[] {
  const out = new Array(12).fill(0)
  let total = 0
  const span = daysInYear(year)
  for (let d = 1; d <= span; d++) {
    const date = new Date(Date.UTC(year, 0, 1) + (d - 1) * 86_400_000)
    out[date.getUTCMonth()] += row[d]
    total += row[d]
  }
  return total > 0 ? out.map((v) => v / total) : out
}

export interface YearRow {
  year: number
  shape: SeasonShape | null
  /** Annual total relative to the median annual total of every other year. */
  ratio: number
  daysAboveP90: number
  /** Days with any detection at all. */
  activeDays: number
}

/**
 * One pass over the whole record, so the year table does not re-derive every
 * other year's season shape once per row. Twenty-six years of that is a
 * six-hundred-fold repeat of the same work.
 */
export function summarizeYears(grid: YearGrid, clim: Climatology): YearRow[] {
  const years = [...grid.keys()].sort((a, b) => a - b)
  const shapes = new Map<number, SeasonShape | null>()
  for (const y of years) shapes.set(y, seasonShape(grid.get(y)!, daysInYear(y)))

  // The usual year is the median of the years the baseline was built from,
  // so a Terra-only year or a half-finished one cannot pull it down.
  const base = new Set(clim.years)
  const totals = years
    .filter((y) => base.size === 0 || base.has(y))
    .map((y) => shapes.get(y)?.total ?? 0)
    .filter((v) => v > 0)
  const medianTotal = quantileSorted([...totals].sort((a, b) => a - b), 0.5)

  return years.map((year) => {
    const row = grid.get(year)!
    const span = daysInYear(year)
    let daysAboveP90 = 0
    let activeDays = 0
    for (let d = 1; d <= span; d++) {
      if (row[d] > 0) activeDays++
      if (row[d] > clim.p90[d] && row[d] > 0) daysAboveP90++
    }
    const shape = shapes.get(year) ?? null
    return {
      year,
      shape,
      ratio: shape && medianTotal > 0 ? shape.total / medianTotal : 0,
      daysAboveP90,
      activeDays,
    }
  })
}

/** Annual totals, for the year-over-year bars. */
export function annualTotals(grid: YearGrid): Array<{ year: number; total: number }> {
  return [...grid.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, row]) => {
      let sum = 0
      for (let d = 1; d <= daysInYear(year); d++) sum += row[d]
      return { year, total: sum }
    })
}
