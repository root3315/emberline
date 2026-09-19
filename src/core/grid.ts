/**
 * Spatial and temporal alignment — step 1 and 2 of harmonization.
 *
 * MODIS and VIIRS disagree on both axes. Spatially, a 1 km footprint and a
 * 375 m footprint cannot be counted against each other, so every detection is
 * snapped onto one shared grid and the unit of measure becomes "active cells",
 * not "detections". Temporally, a UTC date cuts the night in half for most of
 * the world, so evening fires land on the following day and night overpasses
 * separate from the day burn they belong to. Both are fixed here.
 */

const EARTH_CIRCUMFERENCE_KM = 40075.017
const DEG_LAT_KM = EARTH_CIRCUMFERENCE_KM / 360 // ~111.32 km

/** Grid resolution in km. 1.0 matches the coarser sensor's nominal footprint. */
export const DEFAULT_CELL_KM = 1.0

export function latStepDeg(cellKm: number): number {
  return cellKm / DEG_LAT_KM
}

/**
 * Longitude step for a latitude band, widened by 1/cos(lat) so cells stay
 * roughly equal-area instead of collapsing to slivers near the poles.
 */
export function lonStepDeg(bandLatDeg: number, cellKm: number): number {
  const c = Math.cos((bandLatDeg * Math.PI) / 180)
  return cellKm / DEG_LAT_KM / Math.max(c, 0.05)
}

export interface Cell {
  row: number
  col: number
  id: string
  /** Centre of the cell, for drawing. */
  lat: number
  lon: number
}

/** Snap a coordinate onto the shared grid. */
export function cellOf(lat: number, lon: number, cellKm = DEFAULT_CELL_KM): Cell {
  const dLat = latStepDeg(cellKm)
  const row = Math.floor((lat + 90) / dLat)
  const bandLat = (row + 0.5) * dLat - 90
  const dLon = lonStepDeg(bandLat, cellKm)
  const col = Math.floor((lon + 180) / dLon)
  return {
    row,
    col,
    id: `${row}:${col}`,
    lat: bandLat,
    lon: (col + 0.5) * dLon - 180,
  }
}

const MS_PER_DAY = 86_400_000
const MS_PER_MIN = 60_000

/**
 * Local solar day for an acquisition. Offset comes from longitude rather than a
 * political timezone: fire regimes follow the sun, and AOIs routinely straddle
 * timezone borders that mean nothing to a fire.
 */
export function localSolarDay(dateUtc: string, timeUtcMin: number, lon: number): string {
  const base = Date.parse(`${dateUtc}T00:00:00Z`)
  const offsetMin = (lon / 15) * 60
  return new Date(base + (timeUtcMin + offsetMin) * MS_PER_MIN).toISOString().slice(0, 10)
}

export function dayIndex(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / MS_PER_DAY)
}

export function dayFromIndex(index: number): string {
  return new Date(index * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Day of year, 1..366. */
export function dayOfYear(day: string): number {
  const d = new Date(`${day}T00:00:00Z`)
  const start = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.round((d.getTime() - start) / MS_PER_DAY) + 1
}

export function yearOf(day: string): number {
  return Number(day.slice(0, 4))
}

export function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInYear(year: number): number {
  return isLeap(year) ? 366 : 365
}
