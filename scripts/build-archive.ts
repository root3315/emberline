/**
 * Builds the bundled archive from the real NASA FIRMS record.
 *
 * Fetches the FIRMS area API window by window, caches every raw response so an
 * interrupted run resumes instead of restarting, and folds each year through the
 * same harmonization code the browser uses. Nothing is simulated and nothing is
 * smoothed on the way in.
 *
 *   FIRMS_MAP_KEY=xxxx npx tsx scripts/build-archive.ts [aoiId ...]
 *
 * Narrow a run while iterating with ONLY_PRODUCT=... and FROM=YYYY-MM-DD.
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'

import { AOIS, aoiById, boundsToFirms } from '../src/core/aoi'
import type { ArchiveCube } from '../src/core/cube'
import { cellOf, dayIndex, DEFAULT_CELL_KM } from '../src/core/grid'
import { dailySensitivityRatios, harmonize, summarizeSensitivity, type DailyRatio } from '../src/core/harmonize'
import { SENSOR_META, SENSORS, type Aoi, type Detection, type SensorId } from '../src/core/types'
import { parseFirmsCsv } from '../src/sources/firms-csv'

const KEY = process.env.FIRMS_MAP_KEY ?? ''
if (!KEY) {
  console.error('FIRMS_MAP_KEY is not set. Free key: https://firms.modaps.eosdis.nasa.gov/api/map_key/')
  process.exit(1)
}

const API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
const CACHE = 'data/cache'
const OUT = 'public/data'

/**
 * Every FIRMS area product currently caps a query at 5 days, archive products
 * included, whatever the documentation says. Asking for more does not just fail
 * — it burns a transaction on the rejection and another on each retry.
 */
const WINDOW_DAYS = 5
const CONCURRENCY = 5

/**
 * The key allows 5 000 transactions per rolling 10 minutes. One request every
 * 150 ms is 4 000 per window: fast enough to finish a quarter century in under
 * an hour, slow enough never to trip the limit and lose the run.
 */
const MIN_REQUEST_GAP_MS = 200
const REQUEST_TIMEOUT_MS = 45_000
/** The quota window is 10 minutes; wait past it with a margin. */
const QUOTA_SILENCE_MS = 11 * 60_000
/** Coarser than the harmonization grid: the map is read at a glance, not measured. */
const MAP_CELL_KM = 5
const DAY_MS = 86_400_000

interface Product {
  id: string
  from: string
  to: string
}

/** Spans as reported by the FIRMS data_availability endpoint. */
const SP_CUTOVER = '2026-06-30'
const NRT_START = '2026-07-01'

function products(): Product[] {
  const only = process.env.ONLY_PRODUCT
  const from = process.env.FROM
  const all: Product[] = [
    { id: 'MODIS_SP', from: '2000-11-01', to: SP_CUTOVER },
    { id: 'MODIS_NRT', from: NRT_START, to: today() },
    { id: 'VIIRS_SNPP_SP', from: '2012-01-20', to: SP_CUTOVER },
    { id: 'VIIRS_SNPP_NRT', from: NRT_START, to: today() },
    { id: 'VIIRS_NOAA20_SP', from: '2018-04-01', to: SP_CUTOVER },
    { id: 'VIIRS_NOAA20_NRT', from: NRT_START, to: today() },
    { id: 'VIIRS_NOAA21_NRT', from: '2024-01-17', to: today() },
  ]
  return all
    .filter((p) => !only || p.id === only)
    .map((p) => (from && from > p.from ? { ...p, from } : p))
    .filter((p) => p.from <= p.to)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10)
}

interface Task {
  product: string
  start: string
  days: number
}

function windowsFor(p: Product): Task[] {
  const width = WINDOW_DAYS
  const out: Task[] = []
  let cursor = p.from
  while (cursor <= p.to) {
    const last = addDays(cursor, width - 1)
    const clipped = last > p.to ? p.to : last
    const span = Math.round((Date.parse(clipped) - Date.parse(cursor)) / DAY_MS) + 1
    out.push({ product: p.id, start: cursor, days: span })
    cursor = addDays(cursor, width)
  }
  return out
}

function cachePath(aoi: Aoi, task: Task): string {
  const sig = `${boundsToFirms(aoi.bounds)}|${task.product}|${task.start}|${task.days}`
  const key = createHash('sha1').update(sig).digest('hex').slice(0, 10)
  return `${CACHE}/${aoi.id}/${task.product}-${task.start}-${key}.csv.gz`
}

const HEADER_RE = /^\s*latitude/i
const LIMIT_RE = /Expects \[1\.\.(\d+)\]/
/**
 * Once the quota is fully spent FIRMS stops saying "Exceeding allowed
 * transaction limit" and starts answering "Invalid MAP_KEY" to everything,
 * including the availability endpoint. The key is fine; the window is not. Both
 * messages therefore mean the same thing here — wait.
 */
const THROTTLE_RE = /transaction|limit|throttl|too many|invalid map_key/i

/**
 * Serialises request starts so the whole pool shares one steady rate, and holds
 * every worker behind one gate when the quota runs out. Without the shared gate
 * the other workers keep firing into the limit, each rejection costs another
 * transaction, and the window never gets a chance to drain.
 */
let nextSlot = 0
let quotaGate: Promise<void> | null = null

async function takeSlot(): Promise<void> {
  while (quotaGate) await quotaGate
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + MIN_REQUEST_GAP_MS
  if (at > now) await sleep(at - now)
}

/** Stop the entire pool until the rolling window has drained. */
function holdForQuota(): Promise<void> {
  if (!quotaGate) {
    quotaGate = drainQuota().finally(() => {
      quotaGate = null
      nextSlot = Date.now()
    })
  }
  return quotaGate
}

async function readQuota(): Promise<{ used: number; cap: number } | null> {
  try {
    const res = await fetch(`https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${KEY}`, {
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json()) as { current_transactions?: number; transaction_limit?: number }
    return { used: body.current_transactions ?? 0, cap: body.transaction_limit ?? 5000 }
  } catch {
    return null
  }
}

/**
 * Go completely silent until the window has rolled.
 *
 * A rejected request still counts against the quota, so polling the API to ask
 * whether the quota has recovered is what keeps it from recovering. The only
 * way out is to stop talking for longer than the window, then try exactly once.
 */
async function drainQuota(): Promise<void> {
  for (let round = 1; round <= 6; round++) {
    const until = Date.now() + QUOTA_SILENCE_MS
    while (Date.now() < until) {
      const left = Math.ceil((until - Date.now()) / 60_000)
      process.stdout.write(`\r  rate limited — silent for ${left} more min (round ${round})      `)
      await sleep(20_000)
    }
    try {
      const res = await fetch(`${API}/${KEY}/MODIS_SP/0,0,1,1/1/2010-01-01`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      const text = await res.text()
      if (res.ok && (HEADER_RE.test(text) || text.trim() === '')) {
        process.stdout.write('\n  quota recovered, resuming\n')
        return
      }
    } catch {
      // Treat a network hiccup during the probe as still-limited.
    }
  }
  process.stdout.write('\n  quota did not recover; continuing anyway\n')
}

async function fetchWindow(aoi: Aoi, task: Task): Promise<string> {
  const path = cachePath(aoi, task)
  if (existsSync(path)) return gunzipSync(await readFile(path)).toString('utf8')

  const url = `${API}/${KEY}/${task.product}/${boundsToFirms(aoi.bounds)}/${task.days}/${task.start}`
  let lastError = ''
  /** Quota waits are not failures, but they cannot be unlimited either. */
  let quotaWaits = 0

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await takeSlot()
      const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      const text = await res.text()

      if (res.ok && (HEADER_RE.test(text) || text.trim() === '')) {
        await writeFile(path, gzipSync(Buffer.from(text, 'utf8')))
        return text
      }

      lastError = `${res.status} ${text.slice(0, 120).replace(/\s+/g, ' ')}`

      // The API states its own maximum when we overshoot. Honour it by splitting.
      const limit = LIMIT_RE.exec(text)
      if (limit && task.days > Number(limit[1])) {
        const width = Number(limit[1])
        const parts: string[] = []
        for (let offset = 0; offset < task.days; offset += width) {
          const span = Math.min(width, task.days - offset)
          parts.push(await fetchWindow(aoi, { product: task.product, start: addDays(task.start, offset), days: span }))
        }
        const joined = joinCsv(parts)
        await writeFile(path, gzipSync(Buffer.from(joined, 'utf8')))
        return joined
      }

      // A rolling-window limit needs the whole pool to stop, not a local retry.
      if (THROTTLE_RE.test(text)) {
        if (++quotaWaits <= 4) attempt--
        await holdForQuota()
      } else {
        await sleep(1500 * (attempt + 1))
      }
    } catch (e) {
      lastError = String(e)
      await sleep(1500 * (attempt + 1))
    }
  }
  throw new Error(`${task.product} ${task.start}: ${lastError}`)
}

/** Concatenate CSV chunks, keeping exactly one header row. */
function joinCsv(parts: string[]): string {
  let header = ''
  const body: string[] = []
  for (const part of parts) {
    const lines = part.split(/\r?\n/).filter((l) => l.trim() !== '')
    if (!lines.length) continue
    if (!header) header = lines[0]
    body.push(...lines.slice(1))
  }
  return header ? [header, ...body].join('\n') : ''
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      await worker(items[i])
    }
  })
  await Promise.all(runners)
}

function cellCentre(row: number, col: number, cellKm: number): { lat: number; lon: number } {
  const dLat = cellKm / (40075.017 / 360)
  const bandLat = (row + 0.5) * dLat - 90
  const dLon = dLat / Math.max(Math.cos((bandLat * Math.PI) / 180), 0.05)
  return { lat: bandLat, lon: (col + 0.5) * dLon - 180 }
}

function round(v: number, digits: number): number {
  const f = 10 ** digits
  return Math.round(v * f) / f
}

async function buildAoi(aoi: Aoi): Promise<void> {
  await mkdir(`${CACHE}/${aoi.id}`, { recursive: true })
  await mkdir(OUT, { recursive: true })

  const tasks = products().flatMap(windowsFor)
  process.stdout.write(`\n${aoi.id}: ${tasks.length} windows\n`)

  /** Detections bucketed by year of acquisition, so each year folds on its own. */
  const byYear = new Map<number, Detection[]>()
  let nonVegetation = 0
  let done = 0

  await pool(tasks, CONCURRENCY, async (task) => {
    const parsed = parseFirmsCsv(await fetchWindow(aoi, task))
    nonVegetation += parsed.nonVegetation
    for (const d of parsed.detections) {
      const y = Number(d.dateUtc.slice(0, 4))
      let bucket = byYear.get(y)
      if (!bucket) byYear.set(y, (bucket = []))
      bucket.push(d)
    }
    done++
    if (done % 25 === 0 || done === tasks.length) {
      process.stdout.write(`\r  fetch ${done}/${tasks.length} (${((done / tasks.length) * 100).toFixed(0)}%)   `)
    }
  })
  process.stdout.write('\n')

  const dayRows: number[][] = []
  const ratios: DailyRatio[] = []
  const sensors = new Set<SensorId>()
  const mapCellIndex = new Map<string, number>()
  const mapCells: number[] = []
  const mapYears: Record<string, number[]> = {}
  let rawDetections = 0

  for (const year of [...byYear.keys()].sort((a, b) => a - b)) {
    const record = harmonize(byYear.get(year)!)
    rawDetections += record.rawDetections
    for (const s of record.sensorsPresent) sensors.add(s)
    ratios.push(...dailySensitivityRatios(record))

    for (const d of record.days) {
      dayRows.push([dayIndex(d.day), d.activeCells, d.modisOnly, d.viirsOnly, d.both, Math.round(d.frp), d.raw])
    }

    // Re-bin onto the coarser drawing grid so the map stays legible and small.
    const coarse = new Map<string, number>()
    for (const cd of record.cellDays) {
      const c = cellOf(cd.lat, cd.lon, MAP_CELL_KM)
      coarse.set(c.id, (coarse.get(c.id) ?? 0) + 1)
    }
    const flat: number[] = []
    for (const [id, count] of coarse) {
      let idx = mapCellIndex.get(id)
      if (idx === undefined) {
        const [row, col] = id.split(':').map(Number)
        idx = mapCells.length / 2
        mapCellIndex.set(id, idx)
        const centre = cellCentre(row, col, MAP_CELL_KM)
        mapCells.push(round(centre.lat, 3), round(centre.lon, 3))
      }
      flat.push(idx, count)
    }
    mapYears[String(year)] = flat

    byYear.delete(year)
    const label = String(record.days.length).padStart(3)
    process.stdout.write(`  ${year}  ${label} active days  ${record.rawDetections} detections\n`)
  }

  // Local solar dating moves a few detections across the year boundary; sort once.
  dayRows.sort((a, b) => a[0] - b[0])

  const sensitivity = summarizeSensitivity(ratios)
  const cube: ArchiveCube = {
    version: 1,
    aoi: aoi.id,
    bounds: aoi.bounds,
    generatedAt: new Date().toISOString(),
    provenance: 'NASA FIRMS — MODIS C6.1 and VIIRS C2 active fire products, retrieved via the FIRMS area API',
    range: { from: dayRows.length ? isoOf(dayRows[0][0]) : today(), to: today() },
    cellKm: DEFAULT_CELL_KM,
    sensors: SENSORS.filter((s) => sensors.has(s)),
    sensitivity,
    days: dayRows.flat(),
    map: { cellKm: MAP_CELL_KM, cells: mapCells, years: mapYears },
    totals: { rawDetections, nonVegetation },
  }

  const json = JSON.stringify(cube)
  await writeFile(`${OUT}/${aoi.id}.json`, json)
  process.stdout.write(
    `  -> ${OUT}/${aoi.id}.json  ${(json.length / 1024 / 1024).toFixed(2)} MB  ` +
      `k=${sensitivity.k.toFixed(2)} [${sensitivity.lo.toFixed(2)}..${sensitivity.hi.toFixed(2)}] ` +
      `from ${sensitivity.samples} overlap days\n`,
  )
}

function isoOf(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10)
}

async function main() {
  const wanted = process.argv.slice(2)
  const list = wanted.length ? wanted.map(aoiById).filter((a): a is Aoi => !!a) : [...AOIS]
  process.stdout.write(`Building ${list.length} archive(s) from NASA FIRMS\n`)
  process.stdout.write(`Sensors: ${SENSORS.map((s) => `${SENSOR_META[s].label} ${SENSOR_META[s].pixelM}m`).join(', ')}\n`)

  // Start inside a usable window, or the first few hundred requests are wasted.
  const quota = await readQuota()
  if (quota) process.stdout.write(`Quota reads ${quota.used}/${quota.cap} per 10 min\n`)
  const probe = await fetch(`${API}/${KEY}/MODIS_SP/0,0,1,1/1/2010-01-01`).then(
    (r) => r.text(),
    () => '',
  )
  if (THROTTLE_RE.test(probe)) {
    process.stdout.write('Key is rate limited right now; waiting before the first fetch.\n')
    await holdForQuota()
  }
  for (const aoi of list) await buildAoi(aoi)
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
