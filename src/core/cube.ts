import type { SensitivityRatio } from './harmonize'
import type { Bounds, SensorId } from './types'

/**
 * The precomputed archive, as shipped to the browser.
 *
 * Stored as flat number runs rather than arrays of objects: a quarter of a
 * century of daily records plus a mapped grid is a lot of repeated JSON keys,
 * and the flat form is roughly a fifth of the size for the same content.
 */
export interface ArchiveCube {
  version: 1
  aoi: string
  bounds: Bounds
  generatedAt: string
  /** Where the numbers came from, shown verbatim in the interface. */
  provenance: string
  range: { from: string; to: string }
  /** Grid resolution used for harmonization, km. */
  cellKm: number
  sensors: SensorId[]
  sensitivity: SensitivityRatio
  /** Runs of 7: dayIndex, activeCells, modisOnly, viirsOnly, both, frp, rawDetections. */
  days: number[]
  map: {
    /** Coarser grid for drawing, km. */
    cellKm: number
    /** Runs of 2: lat, lon. */
    cells: number[]
    /** Year -> runs of 2: cellIndex, activeDays. */
    years: Record<string, number[]>
  }
  totals: {
    rawDetections: number
    /** Rows dropped as volcanoes, gas flares or offshore sources. */
    nonVegetation: number
  }
}

export const DAY_STRIDE = 7

export interface CubeDay {
  dayIndex: number
  activeCells: number
  modisOnly: number
  viirsOnly: number
  both: number
  frp: number
  raw: number
}

export function readDays(cube: ArchiveCube): CubeDay[] {
  const out: CubeDay[] = []
  for (let i = 0; i + DAY_STRIDE <= cube.days.length; i += DAY_STRIDE) {
    out.push({
      dayIndex: cube.days[i],
      activeCells: cube.days[i + 1],
      modisOnly: cube.days[i + 2],
      viirsOnly: cube.days[i + 3],
      both: cube.days[i + 4],
      frp: cube.days[i + 5],
      raw: cube.days[i + 6],
    })
  }
  return out
}
