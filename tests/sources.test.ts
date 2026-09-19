import { describe, expect, it } from 'vitest'

import { boundsOf, datasetFromDetections, parseFiles } from '../src/sources'
import { yearOf } from '../src/core/grid'
import type { Bounds, Detection, SensorId } from '../src/core/types'

const SIERRA: Bounds = { west: -123, south: 35.5, east: -118, north: 40.5 }

function det(day: string, lat: number, lon: number, sensor: SensorId): Detection {
  return { lat, lon, dateUtc: day, timeUtc: 12 * 60, sensor, confidence: 1, frp: 5, night: false }
}

describe('dataset assembly', () => {
  it('carries raw detections through the same pipeline the archive used', () => {
    const detections = [
      det('2020-07-01', 37.5, -119.5, 'modis_terra'),
      det('2020-07-01', 37.5, -119.5, 'viirs_snpp'),
      det('2020-07-02', 37.6, -119.5, 'viirs_snpp'),
    ]
    const ds = datasetFromDetections('t', SIERRA, 'test', detections, 7)

    expect(ds.days).toHaveLength(2)
    expect(ds.days[0].activeCells).toBe(1)
    expect(ds.days[0].both).toBe(1)
    expect(ds.totals.rawDetections).toBe(3)
    expect(ds.totals.nonVegetation).toBe(7)
    expect(ds.sensors.sort()).toEqual(['modis_terra', 'viirs_snpp'])
  })

  it('reports which sensor families contributed in each year', () => {
    const ds = datasetFromDetections(
      't',
      SIERRA,
      'test',
      [det('2005-07-01', 37.5, -119.5, 'modis_terra'), det('2015-07-01', 37.5, -119.5, 'viirs_snpp')],
      0,
    )
    const modisOnlyYear = ds.sensorsByYear.get(2005)!
    const viirsOnlyYear = ds.sensorsByYear.get(2015)!
    expect(modisOnlyYear).not.toBe(viirsOnlyYear)
    expect(ds.sensorsByYear.size).toBe(2)
  })

  it('bins map cells per year and merges them when asked for all years', () => {
    const ds = datasetFromDetections(
      't',
      SIERRA,
      'test',
      [
        det('2020-07-01', 37.5, -119.5, 'viirs_snpp'),
        det('2020-07-02', 37.5, -119.5, 'viirs_snpp'),
        det('2021-07-01', 37.5, -119.5, 'viirs_snpp'),
      ],
      0,
    )
    const one = ds.mapCells(2020)
    expect(one).toHaveLength(1)
    expect(one[0].days).toBe(2)

    const all = ds.mapCells(null)
    expect(all).toHaveLength(1)
    expect(all[0].days).toBe(3)

    expect(ds.mapCells(1999)).toHaveLength(0)
  })

  it('spans the record it was given', () => {
    const ds = datasetFromDetections(
      't',
      SIERRA,
      'test',
      [det('2019-06-01', 37.5, -119.5, 'viirs_snpp'), det('2021-09-30', 37.5, -119.5, 'viirs_snpp')],
      0,
    )
    expect(yearOf(ds.range.from)).toBe(2019)
    expect(yearOf(ds.range.to)).toBe(2021)
  })
})

describe('bounds from an unknown file', () => {
  it('wraps the detections with a margin', () => {
    const b = boundsOf([det('2020-07-01', 37.5, -119.5, 'viirs_snpp'), det('2020-07-01', 38.5, -118.5, 'viirs_snpp')])
    expect(b.south).toBeLessThan(37.5)
    expect(b.north).toBeGreaterThan(38.5)
    expect(b.west).toBeLessThan(-119.5)
    expect(b.east).toBeGreaterThan(-118.5)
  })

  it('falls back to the whole world for an empty file', () => {
    const b = boundsOf([])
    expect(b.west).toBe(-180)
    expect(b.east).toBe(180)
  })
})

describe('multi-file upload', () => {
  const header =
    'latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type'

  it('concatenates detections across files and totals the rejected rows', () => {
    const a = `${header}\n37.5,-119.5,320,1,1,2020-07-01,1900,Terra,MODIS,85,6.1,290,12,D,0`
    const b = `${header}\n37.6,-119.5,320,1,1,2020-07-02,1900,Aqua,MODIS,85,6.1,290,12,D,0\n` +
      `19.4,-155.6,400,1,1,2020-07-02,1900,Terra,MODIS,90,6.1,320,80,D,1`
    const out = parseFiles([a, b])
    expect(out.detections).toHaveLength(2)
    expect(out.nonVegetation).toBe(1)
  })
})
