/**
 * Turning a typed place into a box on the globe.
 *
 * Now that the archive covers the whole planet, restricting the chooser to
 * four hand-picked regions is an artificial limit: the data for Uzbekistan is
 * already sitting in the same files as the data for the Cerrado. All that was
 * missing is a way to say where Uzbekistan is.
 *
 * Nominatim is used because it needs no key and no account — this site is
 * public and ships no secrets, so any geocoder that wanted one was out. The
 * price is its usage policy: one request a second, and do not hammer it. Hence
 * the debounce at the call site, the abort of anything still in flight, and a
 * cache — typing "узбекистан" one letter at a time must not be nine requests.
 */

export interface Place {
  /** What to show in the list. */
  name: string
  /** The rest of the address, dimmer, so two "Cambridge"s can be told apart. */
  detail: string
  lat: number
  lon: number
  bounds: { west: number; south: number; east: number; north: number }
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'
const cache = new Map<string, Place[]>()

interface NominatimRow {
  display_name?: string
  name?: string
  lat?: string
  lon?: string
  boundingbox?: [string, string, string, string]
}

/**
 * A place's smallest sensible box.
 *
 * A city comes back as a point with a box a few hundred metres across, which
 * at the archive's one-degree grid is less than a single cell — the map would
 * fly to it and show nothing. Anything smaller than a quarter degree is opened
 * out to that, which is one L0 cell either way: still the right place, and now
 * with something in it.
 */
function widen(b: Place['bounds']): Place['bounds'] {
  const MIN = 0.5
  const midLat = (b.north + b.south) / 2
  const midLon = (b.east + b.west) / 2
  const h = Math.max(MIN, b.north - b.south)
  const w = Math.max(MIN, b.east - b.west)
  return {
    south: Math.max(-90, midLat - h / 2),
    north: Math.min(90, midLat + h / 2),
    west: Math.max(-180, midLon - w / 2),
    east: Math.min(180, midLon + w / 2),
  }
}

export async function geocode(query: string, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim()
  if (q.length < 2) return []
  // The language is part of the question, not just of the answer: the same
  // query returns "Узбекистан" or "Uzbekistan" depending on it, and a cache
  // that ignored it served whichever language asked first for the rest of the
  // session.
  const lang = document.documentElement.lang || 'en'
  const key = `${lang}:${q.toLowerCase()}`
  const hit = cache.get(key)
  if (hit) return hit

  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&accept-language=${lang}`
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`geocode: HTTP ${res.status}`)
  const rows = (await res.json()) as NominatimRow[]

  const places: Place[] = []
  for (const row of rows) {
    const lat = Number(row.lat)
    const lon = Number(row.lon)
    const bb = row.boundingbox
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !bb) continue
    const parts = (row.display_name ?? '').split(',').map((p) => p.trim())
    places.push({
      name: row.name || parts[0] || row.display_name || q,
      detail: parts.slice(1).join(', '),
      lat,
      lon,
      bounds: widen({
        south: Number(bb[0]),
        north: Number(bb[1]),
        west: Number(bb[2]),
        east: Number(bb[3]),
      }),
    })
  }

  cache.set(key, places)
  return places
}

/** Pack a place into the picker's value, so nothing else needs a new type. */
export function placeValue(p: Place): string {
  const b = p.bounds
  return `place:${b.west.toFixed(3)},${b.south.toFixed(3)},${b.east.toFixed(3)},${b.north.toFixed(3)}:${p.name}`
}

export function parsePlaceValue(value: string): { bounds: Place['bounds']; name: string } | null {
  if (!value.startsWith('place:')) return null
  const rest = value.slice('place:'.length)
  const cut = rest.indexOf(':')
  if (cut < 0) return null
  const [west, south, east, north] = rest.slice(0, cut).split(',').map(Number)
  if (![west, south, east, north].every(Number.isFinite)) return null
  return { bounds: { west, south, east, north }, name: rest.slice(cut + 1) }
}
