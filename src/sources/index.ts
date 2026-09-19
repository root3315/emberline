/**
 * The three ways data reaches the calendar: the bundled archive, a live FIRMS
 * query, and a CSV the user drops in. They converge on one `Dataset` because
 * they converge on one pipeline — the archive was folded by the same
 * `harmonize()` the other two call at runtime.
 */

import { AOIS, boundsToFirms } from '../core/aoi'
import { readDays, type ArchiveCube } from '../core/cube'
import { cellOf, dayFromIndex, dayIndex, yearOf } from '../core/grid'
import {
  applySensitivity,
  harmonize,
  measureSensitivity,
  type AdjustedDay,
  type SensitivityRatio,
} from '../core/harmonize'
import { MODIS_MASK, SENSOR_META, VIIRS_MASK, type Bounds, type DayRecord, type Detection, type SensorId } from '../core/types'
import type { MapCell } from '../ui/map'
import { parseFirmsCsv } from './firms-csv'

export interface Dataset {
  id: string
  bounds: Bounds
  provenance: string
  days: DayRecord[]
  adjusted: AdjustedDay[]
  sensitivity: SensitivityRatio
  sensors: SensorId[]
  sensorsByYear: Map<number, number>
  range: { from: string; to: string }
  totals: { rawDetections: number; nonVegetation: number }
  mapCells(year: number | null): MapCell[]
  mapCellKm: number
}

/** First day on which a VIIRS detection actually appears in this record. */
function viirsOnsetOf(days: readonly DayRecord[]): string | null {
  for (const d of days) {
    if (d.viirsOnly > 0 || d.both > 0) return d.day
  }
  return null
}

function sensorsByYearOf(days: readonly DayRecord[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const d of days) {
    const y = yearOf(d.day)
    let mask = out.get(y) ?? 0
    if (d.modisOnly > 0 || d.both > 0) mask |= MODIS_MASK
    if (d.viirsOnly > 0 || d.both > 0) mask |= VIIRS_MASK
    out.set(y, mask)
  }
  return out
}

/** Thrown when an area simply has no archive built yet. */
export class ArchiveMissing extends Error {}

export async function loadArchive(aoiId: string): Promise<Dataset> {
  const res = await fetch(`./data/${aoiId}.json`)
  if (!res.ok) throw new ArchiveMissing(`archive ${res.status}`)

  // A dev server answers a missing file with the SPA shell and a 200, so the
  // status code alone cannot tell "no archive" from "broken archive".
  const text = await res.text()
  if (!text.startsWith('{')) throw new ArchiveMissing('archive is not JSON')
  const cube = JSON.parse(text) as ArchiveCube
  if (cube.version !== 1 || !Array.isArray(cube.days)) throw new ArchiveMissing('archive is not a cube')

  const days: DayRecord[] = readDays(cube).map((d) => ({
    day: dayFromIndex(d.dayIndex),
    activeCells: d.activeCells,
    modisOnly: d.modisOnly,
    viirsOnly: d.viirsOnly,
    both: d.both,
    frp: d.frp,
    raw: d.raw,
  }))

  const aoi = AOIS.find((a) => a.id === cube.aoi)
  return {
    id: cube.aoi,
    bounds: cube.bounds ?? aoi!.bounds,
    provenance: cube.provenance,
    days,
    adjusted: applySensitivity(days, cube.sensitivity, viirsOnsetOf(days)),
    sensitivity: cube.sensitivity,
    sensors: cube.sensors,
    sensorsByYear: sensorsByYearOf(days),
    range: cube.range,
    totals: cube.totals,
    mapCellKm: cube.map.cellKm,
    mapCells(year) {
      const tally = new Map<number, number>()
      const years = year === null ? Object.keys(cube.map.years) : [String(year)]
      for (const key of years) {
        const flat = cube.map.years[key]
        if (!flat) continue
        for (let i = 0; i + 1 < flat.length; i += 2) {
          tally.set(flat[i], (tally.get(flat[i]) ?? 0) + flat[i + 1])
        }
      }
      const out: MapCell[] = []
      for (const [idx, count] of tally) {
        out.push({ lat: cube.map.cells[idx * 2], lon: cube.map.cells[idx * 2 + 1], days: count })
      }
      return out
    },
  }
}

const MAP_CELL_KM = 5

/** Everything a runtime source produces goes through here, archive included. */
export function datasetFromDetections(
  id: string,
  bounds: Bounds,
  provenance: string,
  detections: Detection[],
  nonVegetation: number,
): Dataset {
  const record = harmonize(detections)
  const sensitivity = measureSensitivity(record)
  const days = record.days

  const byYear = new Map<number, Map<string, MapCell>>()
  for (const cd of record.cellDays) {
    const y = yearOf(cd.day)
    let cells = byYear.get(y)
    if (!cells) byYear.set(y, (cells = new Map()))
    const c = cellOf(cd.lat, cd.lon, MAP_CELL_KM)
    const existing = cells.get(c.id)
    if (existing) existing.days++
    else cells.set(c.id, { lat: c.lat, lon: c.lon, days: 1 })
  }

  return {
    id,
    bounds,
    provenance,
    days,
    adjusted: applySensitivity(days, sensitivity, viirsOnsetOf(days)),
    sensitivity,
    sensors: [...record.sensorsPresent],
    sensorsByYear: sensorsByYearOf(days),
    range: { from: record.firstDay ?? '', to: record.lastDay ?? '' },
    totals: { rawDetections: record.rawDetections, nonVegetation },
    mapCellKm: MAP_CELL_KM,
    mapCells(year) {
      const merged = new Map<string, MapCell>()
      const sources = year === null ? [...byYear.values()] : [byYear.get(year) ?? new Map<string, MapCell>()]
      for (const cells of sources) {
        for (const [id2, cell] of cells) {
          const existing = merged.get(id2)
          if (existing) existing.days += cell.days
          else merged.set(id2, { ...cell })
        }
      }
      return [...merged.values()]
    },
  }
}

const LIVE_API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'

/** The NRT products, which are the only ones a live query can reach. */
const LIVE_PRODUCTS = ['MODIS_NRT', 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'] as const

export interface LiveResult {
  detections: Detection[]
  nonVegetation: number
  failures: string[]
}

export async function fetchLive(key: string, bounds: Bounds, dayRange: number): Promise<LiveResult> {
  const area = boundsToFirms(bounds)
  const detections: Detection[] = []
  const failures: string[] = []
  let nonVegetation = 0

  await Promise.all(
    LIVE_PRODUCTS.map(async (product) => {
      try {
        const res = await fetch(`${LIVE_API}/${key}/${product}/${area}/${dayRange}`)
        const text = await res.text()
        if (!res.ok || /invalid|error/i.test(text.slice(0, 80))) {
          failures.push(`${product}: ${text.slice(0, 60).trim()}`)
          return
        }
        const parsed = parseFirmsCsv(text)
        detections.push(...parsed.detections)
        nonVegetation += parsed.nonVegetation
      } catch (e) {
        failures.push(`${product}: ${String(e)}`)
      }
    }),
  )

  return { detections, nonVegetation, failures }
}

export function parseFiles(texts: string[]): { detections: Detection[]; nonVegetation: number } {
  const detections: Detection[] = []
  let nonVegetation = 0
  for (const text of texts) {
    const parsed = parseFirmsCsv(text)
    detections.push(...parsed.detections)
    nonVegetation += parsed.nonVegetation
  }
  return { detections, nonVegetation }
}

/** Bounds that actually contain the detections, for a file of unknown extent. */
export function boundsOf(detections: readonly Detection[]): Bounds {
  let west = 180
  let east = -180
  let south = 90
  let north = -90
  for (const d of detections) {
    if (d.lon < west) west = d.lon
    if (d.lon > east) east = d.lon
    if (d.lat < south) south = d.lat
    if (d.lat > north) north = d.lat
  }
  if (west > east || south > north) return { west: -180, south: -60, east: 180, north: 80 }
  const padLon = Math.max(0.15, (east - west) * 0.06)
  const padLat = Math.max(0.15, (north - south) * 0.06)
  return { west: west - padLon, south: south - padLat, east: east + padLon, north: north + padLat }
}

export function sensorLabel(id: SensorId): string {
  return SENSOR_META[id].label
}

export { dayIndex }
