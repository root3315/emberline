import { describe, expect, it } from 'vitest'

import { cellOf, dayOfYear, localSolarDay } from '../src/core/grid'
import {
  applySensitivity,
  comparable,
  confidenceFromModis,
  confidenceFromViirs,
  harmonize,
  measureSensitivity,
  quantileSorted,
} from '../src/core/harmonize'
import type { Detection, SensorId } from '../src/core/types'

function det(partial: Partial<Detection> & { lat: number; lon: number; sensor: SensorId }): Detection {
  return {
    dateUtc: '2020-07-01',
    timeUtc: 12 * 60,
    confidence: 1,
    frp: 10,
    night: false,
    ...partial,
  }
}

describe('grid alignment', () => {
  it('puts two detections a few hundred metres apart in the same cell', () => {
    const a = cellOf(37.5, -119.5)
    const b = cellOf(37.5031, -119.5028)
    expect(b.id).toBe(a.id)
  })

  it('separates detections further apart than the cell size', () => {
    const a = cellOf(37.5, -119.5)
    const b = cellOf(37.53, -119.5)
    expect(b.id).not.toBe(a.id)
  })

  it('keeps cells roughly square by widening longitude towards the poles', () => {
    const equator = cellOf(0, 0)
    const high = cellOf(64, 0)
    // At 64N a degree of longitude is less than half its equatorial length, so
    // the cell must span more degrees to cover the same ground distance.
    expect(Math.abs(high.lon)).toBeGreaterThan(Math.abs(equator.lon))
  })
})

describe('local solar dating', () => {
  it('rolls an evening UTC acquisition forward in the far east', () => {
    // 23:00 UTC at 120E is 07:00 the next morning, locally.
    expect(localSolarDay('2020-07-01', 23 * 60, 120)).toBe('2020-07-02')
  })

  it('rolls an early UTC acquisition back in the far west', () => {
    // 02:00 UTC at 120W is 18:00 the previous evening, locally.
    expect(localSolarDay('2020-07-02', 2 * 60, -120)).toBe('2020-07-01')
  })

  it('leaves mid-day acquisitions near the prime meridian alone', () => {
    expect(localSolarDay('2020-07-01', 12 * 60, 2)).toBe('2020-07-01')
  })
})

describe('confidence harmonization', () => {
  it('maps MODIS percentages onto the three-class scale at 30 and 80', () => {
    expect(confidenceFromModis(10)).toBe(0)
    expect(confidenceFromModis(30)).toBe(1)
    expect(confidenceFromModis(79)).toBe(1)
    expect(confidenceFromModis(80)).toBe(2)
  })

  it('reads the VIIRS tokens', () => {
    expect(confidenceFromViirs('l')).toBe(0)
    expect(confidenceFromViirs('nominal')).toBe(1)
    expect(confidenceFromViirs('H')).toBe(2)
  })
})

describe('deduplication across sensors', () => {
  const shared = { lat: 37.5, lon: -119.5, dateUtc: '2020-07-01', timeUtc: 12 * 60 }

  it('counts one cell when two sensors see the same place on the same day', () => {
    const record = harmonize([
      det({ ...shared, sensor: 'modis_terra' }),
      det({ ...shared, sensor: 'viirs_snpp' }),
    ])
    expect(record.days).toHaveLength(1)
    expect(record.days[0].activeCells).toBe(1)
    expect(record.days[0].both).toBe(1)
    expect(record.days[0].modisOnly).toBe(0)
    expect(record.days[0].viirsOnly).toBe(0)
    // The raw count is preserved so the interface can show what was merged.
    expect(record.days[0].raw).toBe(2)
  })

  it('never sums FRP across sensors watching one fire', () => {
    const record = harmonize([
      det({ ...shared, sensor: 'modis_terra', frp: 40 }),
      det({ ...shared, sensor: 'viirs_snpp', frp: 25 }),
    ])
    expect(record.days[0].frp).toBe(40)
  })

  it('takes the highest confidence any sensor reported for a cell', () => {
    const record = harmonize([
      det({ ...shared, sensor: 'modis_terra', confidence: 0 }),
      det({ ...shared, sensor: 'viirs_snpp', confidence: 2 }),
    ])
    expect(record.cellDays[0].confidence).toBe(2)
  })

  it('splits cells that only one family saw', () => {
    const record = harmonize([
      det({ ...shared, sensor: 'modis_terra' }),
      det({ lat: 37.6, lon: -119.5, dateUtc: '2020-07-01', timeUtc: 720, sensor: 'viirs_snpp' }),
    ])
    expect(record.days[0].activeCells).toBe(2)
    expect(record.days[0].modisOnly).toBe(1)
    expect(record.days[0].viirsOnly).toBe(1)
    expect(record.days[0].both).toBe(0)
  })

  it('drops detections below the confidence floor', () => {
    const record = harmonize(
      [det({ ...shared, sensor: 'modis_terra', confidence: 0 }), det({ lat: 37.6, lon: -119.5, sensor: 'viirs_snpp', confidence: 2 })],
      { minConfidence: 2 },
    )
    expect(record.rawDetections).toBe(1)
    expect(record.days[0].activeCells).toBe(1)
  })
})

describe('the comparable number', () => {
  /*
   * The fleet grows, the reconciled series does not.
   *
   * Measured on the committed global level, VIIRS detections per MODIS
   * detection run 4.09 in 2012 with S-NPP alone, 8.87 in 2019 once
   * NOAA-20 is up and 15.59 in 2026 once NOAA-21 is. Every one of those
   * steps is a satellite. A series meant to be read end to end has to be
   * flat across them when the fire is flat, and the observed one is not
   * expected to be — that is what the two modes are for.
   */
  const FLEET = [4.09, 4.43, 8.87, 9.02, 13.22, 15.59]
  const MODIS_PER_DAY = 1000

  it('does not move when only the number of satellites does', () => {
    const series = FLEET.map((r) => comparable(MODIS_PER_DAY, MODIS_PER_DAY * r, 7))
    expect(new Set(series).size).toBe(1)
  })

  it('leaves the observed series stepping, which is the point of showing it', () => {
    const series = FLEET.map((r) => comparable(MODIS_PER_DAY, MODIS_PER_DAY * r, null))
    expect(series[series.length - 1] / series[0]).toBeGreaterThan(3)
  })

  it('never falls back to adding the two together once a ratio is known', () => {
    // The bug this replaces: scale the early years, add them after the
    // overlap begins. There is no argument that produces `modis + viirs`
    // while a ratio is in hand.
    expect(comparable(1000, 8870, 7)).toBe(7000)
    expect(comparable(1000, 8870, 7)).not.toBe(9870)
  })

  it('agrees with the series builder, which is the same rule on a record', () => {
    const days = [
      { day: '2005-06-01', activeCells: 40, modisOnly: 40, viirsOnly: 0, both: 0, frp: 0, raw: 40 },
      { day: '2019-06-01', activeCells: 900, modisOnly: 30, viirsOnly: 860, both: 10, frp: 0, raw: 900 },
    ]
    const ratio = { k: 7, lo: 5, hi: 9, samples: 500, overlapFrom: '2012-01-20' }
    const out = applySensitivity(days, ratio)
    expect(out[0].value).toBe(comparable(40, 0, 7))
    expect(out[1].value).toBe(comparable(40, 860, 7))
  })
})

describe('sensitivity ratio', () => {
  /** 30 overlap days where VIIRS resolves three cells for every MODIS cell. */
  function overlapRecord() {
    const detections: Detection[] = []
    for (let d = 1; d <= 30; d++) {
      const date = `2020-07-${String(d).padStart(2, '0')}`
      for (let m = 0; m < 4; m++) {
        detections.push(det({ lat: 37.5 + m * 0.02, lon: -119.5, dateUtc: date, sensor: 'modis_terra' }))
      }
      for (let v = 0; v < 12; v++) {
        detections.push(det({ lat: 37.5 + v * 0.02, lon: -119.4, dateUtc: date, sensor: 'viirs_snpp' }))
      }
    }
    return harmonize(detections)
  }

  it('measures how many more cells the finer sensor resolves', () => {
    const ratio = measureSensitivity(overlapRecord())
    expect(ratio.samples).toBe(30)
    expect(ratio.k).toBeCloseTo(3, 1)
    expect(ratio.lo).toBeLessThanOrEqual(ratio.k)
    expect(ratio.hi).toBeGreaterThanOrEqual(ratio.k)
  })

  it('refuses to invent a ratio without enough overlap', () => {
    const record = harmonize([
      det({ lat: 37.5, lon: -119.5, sensor: 'modis_terra' }),
      det({ lat: 37.5, lon: -119.4, sensor: 'viirs_snpp' }),
    ])
    const ratio = measureSensitivity(record)
    expect(ratio.samples).toBeLessThan(10)
    expect(ratio.k).toBe(1)
  })

  it('drives the whole series from MODIS, and keeps the raw count beside it', () => {
    const ratio = { k: 3, lo: 2.5, hi: 3.6, samples: 40, overlapFrom: '2012-01-20' }
    const days = [
      { day: '2005-07-01', activeCells: 10, modisOnly: 10, viirsOnly: 0, both: 0, frp: 0, raw: 10 },
      { day: '2015-07-01', activeCells: 30, modisOnly: 2, viirsOnly: 20, both: 8, frp: 0, raw: 40 },
    ]
    const out = applySensitivity(days, ratio)

    // Before VIIRS there is nothing else to measure with, so this is as
    // it always was.
    expect(out[0].adjusted).toBe(true)
    expect(out[0].raw).toBe(10)
    expect(out[0].value).toBeCloseTo(30)
    expect(out[0].lo).toBeCloseTo(25)
    expect(out[0].hi).toBeCloseTo(36)

    // In the overlap it is MODIS cell-days -- 2 alone plus 8 shared --
    // times the ratio, not the combined 30. The combined count survives
    // as `raw`, which is what "as recorded" draws.
    expect(out[1].adjusted).toBe(true)
    expect(out[1].raw).toBe(30)
    expect(out[1].value).toBeCloseTo(30)
    expect(out[1].lo).toBeCloseTo(25)
    expect(out[1].hi).toBeCloseTo(36)
  })

  it('does not step when another VIIRS satellite joins', () => {
    /*
     * The defect this replaces, in four days.
     *
     * MODIS sees the same ten cells burning on every one of them. The
     * combined count climbs anyway, because S-NPP arrives, then NOAA-20,
     * then NOAA-21. The old rule scaled the first day up to meet the
     * combined count and left the rest of it to keep climbing, so the
     * comparable series carried a step at every launch. It must not move.
     */
    const ratio = { k: 3, lo: 2.5, hi: 3.6, samples: 40, overlapFrom: '2012-01-20' }
    const days = [
      { day: '2005-07-01', activeCells: 10, modisOnly: 10, viirsOnly: 0, both: 0, frp: 0, raw: 10 },
      { day: '2015-07-01', activeCells: 25, modisOnly: 0, viirsOnly: 15, both: 10, frp: 0, raw: 25 },
      { day: '2020-07-01', activeCells: 40, modisOnly: 0, viirsOnly: 30, both: 10, frp: 0, raw: 40 },
      { day: '2025-07-01', activeCells: 55, modisOnly: 0, viirsOnly: 45, both: 10, frp: 0, raw: 55 },
    ]
    const out = applySensitivity(days, ratio)
    expect(out.map((d) => d.value)).toEqual([30, 30, 30, 30])
    // And every step is still there in the raw series, on purpose.
    expect(out.map((d) => d.raw)).toEqual([10, 25, 40, 55])
  })

  it('leaves everything raw when the ratio is not measurable', () => {
    const ratio = { k: 1, lo: 1, hi: 1, samples: 2, overlapFrom: null }
    const days = [{ day: '2005-07-01', activeCells: 10, modisOnly: 10, viirsOnly: 0, both: 0, frp: 0, raw: 10 }]
    const out = applySensitivity(days, ratio)
    expect(out[0].adjusted).toBe(false)
    expect(out[0].value).toBe(10)
  })
})

describe('quantiles', () => {
  it('interpolates between neighbours', () => {
    expect(quantileSorted([0, 10], 0.5)).toBe(5)
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantileSorted([5], 0.9)).toBe(5)
    expect(quantileSorted([], 0.5)).toBe(0)
  })
})

describe('day of year', () => {
  it('counts from one and crosses a leap day', () => {
    expect(dayOfYear('2020-01-01')).toBe(1)
    expect(dayOfYear('2020-03-01')).toBe(61)
    expect(dayOfYear('2021-03-01')).toBe(60)
    expect(dayOfYear('2020-12-31')).toBe(366)
  })
})
