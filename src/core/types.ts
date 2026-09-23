/** Sensors that contribute active fire detections to the harmonized record. */
export type SensorId =
  | 'modis_terra'
  | 'modis_aqua'
  | 'viirs_snpp'
  | 'viirs_noaa20'
  | 'viirs_noaa21'

export type Platform = 'modis' | 'viirs'

export const SENSORS: readonly SensorId[] = [
  'modis_terra',
  'modis_aqua',
  'viirs_snpp',
  'viirs_noaa20',
  'viirs_noaa21',
]

/**
 * Nominal pixel size (m) and first operational year. The size gap is the whole
 * reason this project exists: a 375 m sensor resolves several hot pixels where a
 * 1 km sensor resolves one, so raw detection counts are not comparable.
 */
export const SENSOR_META: Record<SensorId, { platform: Platform; pixelM: number; since: string; label: string }> = {
  modis_terra: { platform: 'modis', pixelM: 1000, since: '2000-11-01', label: 'MODIS Terra' },
  modis_aqua: { platform: 'modis', pixelM: 1000, since: '2002-07-04', label: 'MODIS Aqua' },
  viirs_snpp: { platform: 'viirs', pixelM: 375, since: '2012-01-20', label: 'VIIRS S-NPP' },
  viirs_noaa20: { platform: 'viirs', pixelM: 375, since: '2018-01-01', label: 'VIIRS NOAA-20' },
  // NOAA-21 launched in November 2022, but FIRMS did not serve its product
  // until 2024-01-17, which is where `build-archive.ts` starts asking for
  // it. The rail is meant to show the fleet the archive actually holds, so
  // the date is the one the data begins, not the one the rocket left.
  viirs_noaa21: { platform: 'viirs', pixelM: 375, since: '2024-01-17', label: 'VIIRS NOAA-21' },
}

export const SENSOR_BIT: Record<SensorId, number> = {
  modis_terra: 1,
  modis_aqua: 2,
  viirs_snpp: 4,
  viirs_noaa20: 8,
  viirs_noaa21: 16,
}

export const MODIS_MASK = SENSOR_BIT.modis_terra | SENSOR_BIT.modis_aqua
export const VIIRS_MASK = SENSOR_BIT.viirs_snpp | SENSOR_BIT.viirs_noaa20 | SENSOR_BIT.viirs_noaa21

/** Confidence collapsed to one scale shared by both instrument families. */
export type ConfidenceClass = 0 | 1 | 2 // low | nominal | high

/** A single active fire pixel, as delivered by FIRMS, normalized. */
export interface Detection {
  lat: number
  lon: number
  /** Acquisition date in UTC, `YYYY-MM-DD`. */
  dateUtc: string
  /** Acquisition time in UTC, minutes since midnight. */
  timeUtc: number
  sensor: SensorId
  confidence: ConfidenceClass
  /** Fire radiative power, MW. `0` when the product did not report one. */
  frp: number
  night: boolean
}

/** One grid cell on one local solar day, after every sensor has been merged in. */
export interface CellDay {
  cell: string
  /** Local solar day, `YYYY-MM-DD`. */
  day: string
  /** Bitmask of contributing sensors. */
  sensors: number
  /** Raw detection count, kept only so the UI can show what harmonization removed. */
  raw: number
  confidence: ConfidenceClass
  /** Highest single-sensor FRP seen in this cell-day; never a cross-sensor sum. */
  frp: number
  night: boolean
  lat: number
  lon: number
}

/** AOI-wide totals for one local solar day. */
export interface DayRecord {
  day: string
  /** Distinct active cells — the sensor-independent headline measure. */
  activeCells: number
  modisOnly: number
  viirsOnly: number
  both: number
  frp: number
  raw: number
}

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

export interface Aoi {
  id: string
  name: { en: string; ru: string }
  blurb: { en: string; ru: string }
  bounds: Bounds
}
