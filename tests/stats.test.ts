import { describe, expect, it } from 'vitest'

import {
  DOY_MAX,
  analyzeYear,
  annualTrend,
  climatology,
  concentrationDays,
  criticalPeriods,
  monthlyShare,
  seasonShape,
  summarizeYears,
  toYearGrid,
} from '../src/core/stats'
import type { AdjustedDay } from '../src/core/harmonize'
import { parseFirmsCsv } from '../src/sources/firms-csv'

function row(fill: (doy: number) => number): Float64Array {
  const out = new Float64Array(DOY_MAX + 1)
  for (let d = 1; d <= 365; d++) out[d] = fill(d)
  return out
}

/** A season centred on day 220, the shape most boreal and Mediterranean AOIs take. */
function seasonal(peakDoy: number, height: number, width = 22): (doy: number) => number {
  return (doy) => height * Math.exp(-((doy - peakDoy) ** 2) / (2 * width ** 2))
}

describe('year grid', () => {
  it('uses the adjusted value when harmonized and the raw one otherwise', () => {
    const days: AdjustedDay[] = [{ day: '2005-07-01', raw: 4, value: 12, lo: 10, hi: 14, adjusted: true }]
    expect(toYearGrid(days, true).get(2005)![182]).toBe(12)
    expect(toYearGrid(days, false).get(2005)![182]).toBe(4)
  })

  it('accumulates several records landing on the same day of year', () => {
    const days: AdjustedDay[] = [
      { day: '2005-07-01', raw: 1, value: 1, lo: 1, hi: 1, adjusted: false },
      { day: '2005-07-01', raw: 2, value: 2, lo: 2, hi: 2, adjusted: false },
    ]
    expect(toYearGrid(days).get(2005)![182]).toBe(3)
  })
})

describe('climatology', () => {
  const grid = new Map<number, Float64Array>()
  for (let y = 2000; y < 2012; y++) grid.set(y, row(seasonal(220, 100)))

  it('reproduces the shape of the years it was built from', () => {
    const clim = climatology(grid, 7)
    expect(clim.years).toHaveLength(12)
    expect(clim.median[220]).toBeGreaterThan(clim.median[120])
    expect(clim.median[220]).toBeGreaterThan(90)
  })

  it('orders the percentiles', () => {
    const clim = climatology(grid, 7)
    for (const doy of [60, 150, 220, 300]) {
      expect(clim.p10[doy]).toBeLessThanOrEqual(clim.median[doy])
      expect(clim.median[doy]).toBeLessThanOrEqual(clim.p90[doy])
    }
  })

  it('can leave a year out of its own baseline', () => {
    const withOutlier = new Map(grid)
    withOutlier.set(2012, row(seasonal(220, 5000)))
    const all = climatology(withOutlier, 7)
    const without = climatology(withOutlier, 7, [2012])
    expect(without.p90[220]).toBeLessThan(all.p90[220])
  })

  it('wraps the window across the new year', () => {
    const winter = new Map<number, Float64Array>()
    for (let y = 2000; y < 2010; y++) {
      winter.set(
        y,
        row((d) => (d >= 360 || d <= 5 ? 50 : 0)),
      )
    }
    const clim = climatology(winter, 7)
    // Day 1 pools days 359-365 as well, so a January window sees the December fires.
    expect(clim.mean[1]).toBeGreaterThan(0)
  })
})

describe('season shape', () => {
  it('finds onset, peak and end of a single-peaked season', () => {
    const shape = seasonShape(row(seasonal(220, 100)))!
    expect(shape.peak).toBeGreaterThan(210)
    expect(shape.peak).toBeLessThan(230)
    expect(shape.start).toBeLessThan(shape.peak)
    expect(shape.end).toBeGreaterThan(shape.peak)
    expect(shape.length).toBeGreaterThan(30)
  })

  it('ignores a stray detection months before the season', () => {
    const noisy = row(seasonal(220, 100))
    noisy[30] = 1
    const shape = seasonShape(noisy)!
    // Onset is taken at 10% of the annual total, not at the first spark.
    expect(shape.start).toBeGreaterThan(150)
  })

  it('returns null for a year with no fire at all', () => {
    expect(seasonShape(row(() => 0))).toBeNull()
  })
})

describe('critical periods', () => {
  const grid = new Map<number, Float64Array>()
  for (let y = 2000; y < 2015; y++) grid.set(y, row(seasonal(220, 100)))
  const clim = climatology(grid, 7)

  it('reports a sustained exceedance', () => {
    const extreme = row(seasonal(220, 100))
    for (let d = 215; d <= 228; d++) extreme[d] = 900
    const periods = criticalPeriods(extreme, clim)
    expect(periods.length).toBeGreaterThan(0)
    expect(periods[0].days).toBeGreaterThanOrEqual(10)
    expect(periods[0].ratio).toBeGreaterThan(1)
  })

  it('ignores a two-day blip', () => {
    const blip = row(seasonal(220, 100))
    blip[100] = 900
    blip[101] = 900
    expect(criticalPeriods(blip, clim)).toHaveLength(0)
  })

  it('finds nothing in a year that behaves exactly like its history', () => {
    expect(criticalPeriods(row(seasonal(220, 100)), clim)).toHaveLength(0)
  })
})

describe('year analysis', () => {
  const grid = new Map<number, Float64Array>()
  for (let y = 2000; y < 2015; y++) grid.set(y, row(seasonal(220, 100)))
  grid.set(2015, row(seasonal(190, 260)))
  const clim = climatology(grid, 7)

  it('detects an early, larger season', () => {
    const a = analyzeYear(2015, grid, clim)
    expect(a.shape).not.toBeNull()
    expect(a.totalRatio).toBeGreaterThan(1.5)
    expect(a.startShiftDays!).toBeLessThan(-10)
    expect(a.peakShiftDays!).toBeLessThan(-10)
    expect(a.daysAboveP90).toBeGreaterThan(5)
  })

  it('calls an ordinary year ordinary', () => {
    const a = analyzeYear(2008, grid, clim)
    expect(a.totalRatio).toBeCloseTo(1, 1)
    expect(Math.abs(a.startShiftDays!)).toBeLessThan(5)
  })
})

describe('annual trend', () => {
  it('reports a rising record', () => {
    const grid = new Map<number, Float64Array>()
    for (let y = 2000; y < 2020; y++) grid.set(y, row(seasonal(220, 100 + (y - 2000) * 10)))
    const trend = annualTrend(grid)!
    expect(trend.slope).toBeGreaterThan(0)
    expect(trend.years).toBe(20)
  })

  it('is not dragged around by one catastrophic year', () => {
    const flat = new Map<number, Float64Array>()
    for (let y = 2000; y < 2020; y++) flat.set(y, row(seasonal(220, 100)))
    const spiked = new Map(flat)
    spiked.set(2019, row(seasonal(220, 9000)))
    expect(Math.abs(annualTrend(spiked)!.slope)).toBeLessThan(Math.abs(annualTrend(flat)!.slope) + 1)
  })

  it('declines to report a trend from too few years', () => {
    const grid = new Map<number, Float64Array>()
    grid.set(2000, row(seasonal(220, 100)))
    expect(annualTrend(grid)).toBeNull()
  })
})

describe('the trend leaves out the years it cannot compare', () => {
  /** A grid whose totals rise by a fixed amount every year. */
  const rising = (from: number, to: number, step: number, seam?: [number, number]) => {
    const grid = new Map<number, Float64Array>()
    for (let y = from; y <= to; y++) {
      const row = new Float64Array(367)
      const level = seam && y <= seam[0] ? seam[1] : (y - from + 1) * step
      row[100] = level
      grid.set(y, row)
    }
    return grid
  }

  it('drops a part year at either end', () => {
    // 2010 is worth ten times the rest and would dominate the slope; with
    // the range saying the record starts mid-2010 it must not count.
    const grid = rising(2010, 2020, 100)
    grid.get(2010)![100] = 100_000
    const all = annualTrend(grid)!
    const trimmed = annualTrend(grid, { from: '2010-06-01', to: '2020-12-31' })!
    expect(all.years).toBe(11)
    expect(trimmed.years).toBe(10)
    /*
     * Asserted against the same years asked for directly, rather than
     * against a direction. Theil-Sen takes the median of the pairwise
     * slopes and shrugs off a single outlier, so "the slope must fall"
     * would be a guess about the estimator; "the part year is not in it"
     * is the contract.
     */
    const without2010 = new Map([...grid.entries()].filter(([y]) => y >= 2011))
    expect(trimmed.slope).toBeCloseTo(annualTrend(without2010)!.slope, 6)
  })

  it('never reaches back past the year the MODIS pair was complete', () => {
    // Terra alone, then both: the step is instrument, not fire, and a
    // trend measured across it points the wrong way.
    const grid = rising(2001, 2015, 100, [2002, 10])
    const trimmed = annualTrend(grid, { from: '2001-01-01', to: '2015-12-31' })!
    expect(trimmed.years).toBe(2015 - 2003 + 1)
    // Same years, asked for directly: the answer has to match.
    const from2003 = new Map([...grid.entries()].filter(([y]) => y >= 2003))
    expect(trimmed.slope).toBeCloseTo(annualTrend(from2003)!.slope, 6)
  })

  it('is unchanged by a constant factor, which is what makes it instrument-free', () => {
    const grid = rising(2003, 2020, 100)
    const scaled = new Map(
      [...grid.entries()].map(([y, row]) => [y, row.map((v) => v * 7.07) as Float64Array]),
    )
    const a = annualTrend(grid, { from: '2003-01-01', to: '2020-12-31' })!
    const b = annualTrend(scaled, { from: '2003-01-01', to: '2020-12-31' })!
    expect(b.slopePct).toBeCloseTo(a.slopePct, 12)
  })
})

describe('FIRMS CSV parsing', () => {
  const header =
    'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type'

  it('reads a VIIRS row', () => {
    const { detections } = parseFirmsCsv(`${header}\n29.0,76.3,334.3,0.46,0.39,2023-11-05,815,N,VIIRS,n,2,303,3.45,D,0`)
    expect(detections).toHaveLength(1)
    expect(detections[0].sensor).toBe('viirs_snpp')
    expect(detections[0].timeUtc).toBe(8 * 60 + 15)
    expect(detections[0].confidence).toBe(1)
    expect(detections[0].frp).toBeCloseTo(3.45)
    expect(detections[0].night).toBe(false)
  })

  it('separates the VIIRS platforms', () => {
    const rows = [
      `29.0,76.3,334,0.4,0.3,2023-11-05,815,N,VIIRS,n,2,303,3,D,0`,
      `29.1,76.3,334,0.4,0.3,2023-11-05,815,1,VIIRS,n,2,303,3,D,0`,
      `29.2,76.3,334,0.4,0.3,2023-11-05,815,2,VIIRS,n,2,303,3,D,0`,
    ]
    const { detections } = parseFirmsCsv(`${header}\n${rows.join('\n')}`)
    expect(detections.map((d) => d.sensor)).toEqual(['viirs_snpp', 'viirs_noaa20', 'viirs_noaa21'])
  })

  it('reads MODIS Terra and Aqua apart, on the percentage confidence scale', () => {
    const modisHeader =
      'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type'
    const { detections } = parseFirmsCsv(
      `${modisHeader}\n37.5,-119.5,320,1,1,2020-07-01,1900,Terra,MODIS,85,6.1,290,12,D,0\n` +
        `37.6,-119.5,320,1,1,2020-07-01,2100,Aqua,MODIS,45,6.1,290,8,N,0`,
    )
    expect(detections.map((d) => d.sensor)).toEqual(['modis_terra', 'modis_aqua'])
    expect(detections[0].confidence).toBe(2)
    expect(detections[1].confidence).toBe(1)
    expect(detections[1].night).toBe(true)
  })

  it('drops volcanoes, flares and offshore sources', () => {
    const { detections, nonVegetation } = parseFirmsCsv(
      `${header}\n` +
        `29.0,76.3,334,0.4,0.3,2023-11-05,815,N,VIIRS,n,2,303,3,D,0\n` +
        `19.4,-155.6,400,0.4,0.3,2023-11-05,815,N,VIIRS,h,2,320,80,D,1\n` +
        `61.0,74.0,350,0.4,0.3,2023-11-05,815,N,VIIRS,h,2,310,40,N,2`,
    )
    expect(detections).toHaveLength(1)
    expect(nonVegetation).toBe(2)
  })

  it('survives a file with no rows', () => {
    expect(parseFirmsCsv(header).detections).toHaveLength(0)
    expect(parseFirmsCsv('').detections).toHaveLength(0)
  })
})

describe('season concentration', () => {
  it('counts the few days that carry half a spiky year', () => {
    const spiky = row(() => 0)
    for (let d = 200; d < 205; d++) spiky[d] = 100 // 500 of the total
    for (let d = 1; d <= 100; d++) spiky[d] = 5 // 500 spread thin
    // Half the total sits in the five big days.
    expect(concentrationDays(spiky)).toBe(5)
  })

  it('needs many days when the year is flat', () => {
    const flat = row(() => 10)
    expect(concentrationDays(flat)).toBeGreaterThan(150)
  })

  it('returns zero for a year with no fire', () => {
    expect(concentrationDays(row(() => 0))).toBe(0)
  })

  it('takes a different share when asked', () => {
    const spiky = row(() => 0)
    for (let d = 200; d < 210; d++) spiky[d] = 100
    expect(concentrationDays(spiky, 365, 0.9)).toBe(9)
  })
})

describe('monthly share', () => {
  it('assigns a single-month season to that month', () => {
    const july = row((d) => (d >= 182 && d <= 212 ? 10 : 0))
    const shares = monthlyShare(july, 2021)
    expect(shares[6]).toBeGreaterThan(0.6)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
  })

  it('returns all zeros for an empty year', () => {
    expect(monthlyShare(row(() => 0), 2021).every((v) => v === 0)).toBe(true)
  })
})

describe('year summary table', () => {
  it('reports one row per year with a ratio against the median year', () => {
    const grid = new Map<number, Float64Array>()
    for (let y = 2000; y < 2010; y++) grid.set(y, row(seasonal(220, 100)))
    grid.set(2010, row(seasonal(220, 300)))
    const clim = climatology(grid, 7)
    const rows = summarizeYears(grid, clim)

    expect(rows).toHaveLength(11)
    expect(rows[0].year).toBe(2000)
    const big = rows.find((r) => r.year === 2010)!
    expect(big.ratio).toBeGreaterThan(2.5)
    expect(big.shape).not.toBeNull()
    expect(big.activeDays).toBeGreaterThan(0)
  })
})
