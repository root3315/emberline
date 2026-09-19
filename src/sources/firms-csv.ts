/**
 * FIRMS CSV parsing, shared by the archive builder, the live API client and the
 * drag-and-drop upload. One parser means a file a user drops in is treated
 * exactly like the bundled archive — the harmonization is not a story told about
 * prepared data, it is the code path everything takes.
 */

import { confidenceFromModis, confidenceFromViirs } from '../core/harmonize'
import type { Detection, SensorId } from '../core/types'

/**
 * FIRMS `type`: 0 presumed vegetation fire, 1 active volcano, 2 other static
 * land source, 3 offshore. Only 0 belongs in a burning-activity calendar —
 * gas flares burn 365 days a year and would forge a fire season out of industry.
 */
const VEGETATION_FIRE = 0

export function detectSensor(instrument: string, satellite: string): SensorId | null {
  const inst = instrument.trim().toUpperCase()
  const sat = satellite.trim().toUpperCase()

  if (inst.startsWith('MODIS')) {
    if (sat.startsWith('A')) return 'modis_aqua'
    if (sat.startsWith('T')) return 'modis_terra'
    return 'modis_terra'
  }
  if (inst.startsWith('VIIRS')) {
    if (sat === 'N' || sat.includes('NPP') || sat.includes('SUOMI')) return 'viirs_snpp'
    if (sat === '1' || sat.includes('20')) return 'viirs_noaa20'
    if (sat === '2' || sat.includes('21')) return 'viirs_noaa21'
    return 'viirs_snpp'
  }
  return null
}

/** `"815"` and `"0815"` both mean 08:15. */
export function parseAcqTime(raw: string): number {
  const n = Number(String(raw).trim())
  if (!Number.isFinite(n)) return 0
  return Math.floor(n / 100) * 60 + (n % 100)
}

export interface ParseResult {
  detections: Detection[]
  /** Rows rejected as volcanoes, flares or offshore sources. */
  nonVegetation: number
  /** Rows that were not readable at all. */
  malformed: number
}

export function parseFirmsCsv(text: string): ParseResult {
  const detections: Detection[] = []
  let nonVegetation = 0
  let malformed = 0

  const lines = text.split(/\r?\n/)
  let header: string[] | null = null
  const col: Record<string, number> = {}

  for (const line of lines) {
    if (!line) continue
    if (!header) {
      if (!/latitude/i.test(line)) continue
      header = line.split(',').map((h) => h.trim().toLowerCase())
      header.forEach((h, i) => (col[h] = i))
      continue
    }

    const f = line.split(',')
    if (f.length < header.length - 1) {
      malformed++
      continue
    }

    const at = (name: string): string => {
      const i = col[name]
      return i === undefined ? '' : (f[i] ?? '')
    }

    if (col.type !== undefined && at('type') !== '') {
      if (Number(at('type')) !== VEGETATION_FIRE) {
        nonVegetation++
        continue
      }
    }

    const lat = Number(at('latitude'))
    const lon = Number(at('longitude'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      malformed++
      continue
    }

    const sensor = detectSensor(at('instrument'), at('satellite'))
    if (!sensor) {
      malformed++
      continue
    }

    const confRaw = at('confidence')
    const confidence = sensor.startsWith('modis')
      ? confidenceFromModis(Number(confRaw))
      : confidenceFromViirs(confRaw)

    detections.push({
      lat,
      lon,
      dateUtc: at('acq_date').trim(),
      timeUtc: parseAcqTime(at('acq_time')),
      sensor,
      confidence,
      frp: Number(at('frp')) || 0,
      night: at('daynight').trim().toUpperCase() === 'N',
    })
  }

  return { detections, nonVegetation, malformed }
}
