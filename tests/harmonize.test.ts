import { describe, expect, it } from 'vitest'

import { cellOf, dayOfYear, localSolarDay } from '../src/core/grid'
import {
  applySensitivity,
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

  it('scales only the era before VIIRS, and leaves the overlap untouched', () => {
    const ratio = { k: 3, lo: 2.5, hi: 3.6, samples: 40, overlapFrom: '2012-01-20' }
    const days = [
      { day: '2005-07-01', activeCells: 10, modisOnly: 10, viirsOnly: 0, both: 0, frp: 0, raw: 10 },
      { day: '2015-07-01', activeCells: 30, modisOnly: 2, viirsOnly: 20, both: 8, frp: 0, raw: 40 },
    ]
    const out = applySensitivity(days, ratio, '2012-01-20')

    expect(out[0].adjusted).toBe(true)
    expect(out[0].raw).toBe(10)
    expect(out[0].value).toBeCloseTo(30)
    expect(out[0].lo).toBeCloseTo(25)
    expect(out[0].hi).toBeCloseTo(36)

    expect(out[1].adjusted).toBe(false)
    expect(out[1].value).toBe(30)
    expect(out[1].lo).toBe(30)
  })

  it('leaves everything raw when the ratio is not measurable', () => {
    const ratio = { k: 1, lo: 1, hi: 1, samples: 2, overlapFrom: null }
    const days = [{ day: '2005-07-01', activeCells: 10, modisOnly: 10, viirsOnly: 0, both: 0, frp: 0, raw: 10 }]
    const out = applySensitivity(days, ratio, '2012-01-20')
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
