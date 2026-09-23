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
  /** end - start, in days. */
  length: number
  total: number
  peakValue: number
}

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
  return { start, peak, end, length: end - start, total, peakValue: row[peak] }
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
}

/**
 * Theil-Sen slope over annual totals. The median of pairwise slopes shrugs off
 * the one catastrophic year that would drag an ordinary least-squares line
 * across the whole record.
 */
/**
 * The first year the MODIS pair was complete.
 *
 * Terra came up in November 2000 and Aqua in July 2002, and two
 * satellites see roughly twice the overpasses of one. Measured on this
 * repository's own archives, Punjab's MODIS cell-days average 77.6k
 * before Aqua and 148.7k over the nine years after it — a 1.9x step with
 * no fire behind it, which is the same defect this project exists to
 * remove, one satellite generation earlier than the one it is named for.
 *
 * It only matters where a statistic integrates across the seam. A
 * calendar row is one year and implies no comparison; a climatology pools
 * twenty-odd years and two of them barely move it. A trend is exactly the
 * thing that must not span it.
 */
export const MODIS_PAIR_FROM = 2003

export function annualTrend(grid: YearGrid, whole?: { from: string; to: string }): Trend | null {
  /*
   * Part years are left out, because a part year is a low year for a
   * reason that has nothing to do with fire.
   *
   * The archive opens in November 2000, when Terra came up, and closes on
   * whatever day it was last built. Both of those years hold a fraction
   * of a season and both pull on the slope. Yakutia, whose record starts
   * in May 2001, is the clearest case: every year gives -0.98%, this rule
   * gives +0.68%, and the sign is the part that matters rather than the
   * size. None of the three clears the one per cent the page needs before
   * it prints a trend at all, so what this fixes is the number behind the
   * words, not the words.
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
  return { slope, slopePct: median > 0 ? slope / median : 0, years: totals.length }
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

  const totals = years.map((y) => shapes.get(y)?.total ?? 0).filter((v) => v > 0)
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
