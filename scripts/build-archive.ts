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
 *
 * Two more switches exist for the global pull, which is a different size of job
 * from a region and cannot be done the same way:
 *
 *   FIRMS_CACHE_DIR=D:/emberline-cache   keep the raw cache off the system disk
 *   FETCH_ONLY=1                         fill the cache and fold nothing
 *   ... build-archive.ts world           the whole planet, not a listed region
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { gunzipSync, gzip } from 'node:zlib'

/**
 * Compressing off the event loop.
 *
 * `gzipSync` on a 35 MB buffer blocks everything for the best part of a
 * second. With one window in flight that is invisible; with a dozen it
 * serialises the whole pull behind the compressor and the link goes idle
 * between bursts.
 */
const gzipAsync = promisify(gzip)

import { AOIS, aoiById, boundsToFirms, WORLD } from '../src/core/aoi'
import type { ArchiveCube } from '../src/core/cube'
import { cellOf, dayIndex, DEFAULT_CELL_KM, localSolarDay } from '../src/core/grid'
import { dailySensitivityRatios, harmonize, summarizeSensitivity, type DailyRatio } from '../src/core/harmonize'
import { SENSOR_META, SENSORS, type Aoi, type Detection, type SensorId } from '../src/core/types'
import { parseFirmsCsv } from '../src/sources/firms-csv'

/**
 * Every key we are allowed to spend, as separate quota pools.
 *
 * The quota is per key and it is the thing that makes a regional pull slow:
 * windows are small, ~500 requests drain a ten-minute window in a couple of
 * minutes, and the rest of the run is spent sitting in silence waiting for it
 * to roll. A second key is a second pool, and the waiting divides.
 *
 * Keys are never logged. Lanes are referred to by number.
 *
 *   FIRMS_MAP_KEYS=aaa,bbb,ccc   several
 *   FIRMS_MAP_KEY=aaa            one, still works
 */
const KEYS = (process.env.FIRMS_MAP_KEYS ?? process.env.FIRMS_MAP_KEY ?? '')
  .split(/[,\s]+/)
  .map((k) => k.trim())
  .filter(Boolean)

if (!KEYS.length) {
  console.error(
    'No FIRMS key. Set FIRMS_MAP_KEY, or FIRMS_MAP_KEYS=k1,k2,k3 for several.\n' +
      'Free key: https://firms.modaps.eosdis.nasa.gov/api/map_key/',
  )
  process.exit(1)
}

const API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'

/**
 * Where raw responses are kept.
 *
 * Every window is written here gzipped before anything is parsed, so a run that
 * dies — quota, network, a closed laptop — resumes from where it stopped rather
 * than paying for the same bytes twice. That makes this directory the expensive
 * thing in the project: re-fetching it costs hours, not disk.
 *
 * Overridable because it outgrows the system drive. Four regions fit in a few
 * hundred megabytes; the global pull the plan describes is about twenty
 * gigabytes gzipped, which belongs on a second disk.
 *
 *   FIRMS_CACHE_DIR=D:/emberline-cache npm run archive:fetch
 */
const CACHE = process.env.FIRMS_CACHE_DIR ?? 'data/cache'
const OUT = 'public/data'

/**
 * Every FIRMS area product currently caps a query at 5 days, archive products
 * included, whatever the documentation says. Asking for more does not just fail
 * — it burns a transaction on the rejection and another on each retry.
 */
const WINDOW_DAYS = 5
const CONCURRENCY = 5
/**
 * More in flight for the world, not fewer.
 *
 * This started at three on the assumption that the link was already saturated
 * and extra connections would only cost memory. Measured against the live API
 * on global MODIS windows, that was wrong — throughput keeps climbing well past
 * the point where it was supposed to flatten:
 *
 *     1 lane   1.23 MB/s        9 lanes  2.79 MB/s
 *     3 lanes  2.31 MB/s       16 lanes  3.99 MB/s
 *     6 lanes  2.41 MB/s       24 lanes  4.57 MB/s
 *
 * So the ~1.2 MB/s ceiling belongs to a single connection, not to the key, the
 * account or the link. Spreading the same requests over separate keys made no
 * difference at all (2.31 on one key versus 2.01 on three), which also settles
 * the other half of the question: extra keys buy quota, never bandwidth.
 *
 * Sixteen rather than twenty-four because the gain is flattening while the
 * memory is not: a global VIIRS window is ~35 MB, and at this width that is
 * around 670 MB of buffers in flight. It turns a 35-hour pull into under six.
 */
const WORLD_CONCURRENCY = Math.max(1, Math.trunc(Number(process.env.WORLD_LANES)) || 16)

/**
 * The floor on how fast one key may fire, when it has quota to spare.
 *
 * This is not what keeps us under the limit — the sliding window below does
 * that. It only stops a lane from opening connections faster than the server
 * wants to answer them.
 */
const MIN_REQUEST_GAP_MS = 200

/**
 * Staying under the quota by spending it evenly, instead of hitting the wall.
 *
 * The key allows 5 000 transactions per rolling ten minutes and one area
 * request costs about ten of them, so a key sustains roughly 500 requests per
 * window. The obvious thing — fire flat out and sit out the penalty when the
 * limit answers — is what this did at first, and it is almost exactly twice as
 * slow as it needs to be: 500 requests, then eleven minutes of silence, is 24
 * requests a minute. Pacing to the same 500 per ten minutes and never tripping
 * anything is 50 a minute.
 *
 * Measured on the run that showed this up: seven keys burned 2 073 windows in
 * four minutes and then every one of them went quiet at once, because
 * round-robin spends them all at the same rate and so exhausts them all at the
 * same moment. More keys did not fix that; they made the stall bigger.
 *
 * So each lane keeps the timestamps of its own recent requests and simply will
 * not fire a 451st inside ten minutes. It bursts freely while there is headroom
 * — the start of a run is free — and settles into the sustainable rate once
 * there is not. The quota gate is still there, but now it is for surprises
 * rather than for normal operation.
 */
const QUOTA_CAP = 5000
const QUOTA_WINDOW_MS = 10 * 60_000

/**
 * What one window costs, measured for the area actually being asked for.
 *
 * This was a constant — two transactions per day of data — and the measurement
 * behind it was taken against a regional bounding box. It is not a property of
 * the request's *length*. It scales with its *area* as well:
 *
 *     5 days over Punjab (4° × 3.5°)      10 transactions
 *     5 days over the world              120 transactions
 *
 * Twelve times the price, against a budget that assumed otherwise. The global
 * pull spent nine keys' worth of quota in about ten minutes, took all nine into
 * an eleven-minute silence at once, and stopped dead at 650 windows — while the
 * pacing code believed it was comfortably inside the limit.
 *
 * So it is no longer assumed. Before an AOI is fetched, two one-day requests
 * are made against its own bounding box and the key's transaction counter is
 * read either side of them. Whatever FIRMS charges for this shape of request,
 * for whatever reason, is what the budget is then built from — a formula
 * inferred from two data points would have been the same mistake again.
 *
 * The default is the expensive end, so an uncalibrated run under-spends rather
 * than walking into the wall.
 */
let TXN_PER_REQUEST = 180
let QUOTA_BUDGET = Math.floor((QUOTA_CAP / TXN_PER_REQUEST) * 0.9)

/**
 * Measured costs, kept between runs.
 *
 * The probe only gives an honest answer on a key with an empty window, and
 * during a long pull there is rarely one — every key is busy with the very
 * work being priced. Falling back to the conservative default then punishes
 * the small AOIs badly: assuming 180 for a region that really costs 10 paces
 * it eighteen times slower than it needs to be.
 *
 * So a good measurement is written down and reused. It lives beside the cache
 * rather than in the repository because it describes this account's keys
 * against this API, not the project.
 */
const COST_FILE = `${CACHE}/cost.json`

async function loadCosts(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(COST_FILE, 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}

async function saveCost(aoiId: string, txn: number): Promise<void> {
  const all = await loadCosts()
  all[aoiId] = txn
  await mkdir(CACHE, { recursive: true }).catch(() => {})
  await writeFile(COST_FILE, JSON.stringify(all, null, 2) + '\n').catch(() => {})
}

const TXN_DEFAULT = 180

function setCost(txn: number): void {
  TXN_PER_REQUEST = txn
  QUOTA_BUDGET = Math.max(1, Math.floor((QUOTA_CAP / TXN_PER_REQUEST) * 0.9))
}

async function calibrateCost(aoi: Aoi): Promise<void> {
  /**
   * Reset first, every time, on every path out of here.
   *
   * These are module-level and they used to keep whatever the previous AOI
   * left behind. `build-archive.ts punjab world` was the bad case: Punjab
   * measures ~10 transactions a window, then the world finds no idle key —
   * Punjab just spent them — bails out early, and paces the planet at 450
   * windows per key per ten minutes. At the world's real 180 apiece that is
   * eighty thousand transactions against a cap of five, which is precisely the
   * all-nine-keys-silent failure this file is full of scars from.
   */
  const remembered = (await loadCosts())[aoi.id]
  setCost(remembered && remembered > 0 ? remembered : TXN_DEFAULT)

  // The freshest key, so the probe itself cannot trip anything.
  const reads = await Promise.all(LANES.map((l) => readQuota(l.key)))
  let best = 0
  for (let i = 1; i < LANES.length; i++) {
    if ((reads[i]?.used ?? 1e9) < (reads[best]?.used ?? 1e9)) best = i
  }
  const lane = LANES[best]
  const before = reads[best]
  if (!before) return

  /**
   * Measure the drain, then the probe, so a busy key can still be trusted.
   *
   * The counter is a rolling ten-minute window: while a probe runs, spending
   * from ten minutes ago ages out of it, and the delta comes back smaller than
   * the true price. Earlier versions dealt with that by refusing to measure
   * unless the key was completely idle — which sounds safe and is badly wrong
   * in practice, because only the *first* AOI of a run can ever meet it. After
   * Punjab has moved a few thousand windows every key is loaded, so Sierra,
   * the Cerrado and Yakutia all fall back to the conservative default of 180
   * and get paced at 24 seconds a window instead of the 1.3 their real cost of
   * ten allows. A four-region run turns from hours into days, for want of a
   * measurement it could perfectly well have taken.
   *
   * The drain is not noise, it is a rate, and it can be measured: read the
   * counter twice with nothing in between and whatever it fell by is what to
   * add back. The probe's own delta is then corrected by however long it took,
   * and the answer is honest whatever state the key is in.
   *
   * One day per probe rather than five. Probing at the real width seemed
   * better and gave 120 for a global window; the narrow probe gave 36, so 180
   * — and the run settled it, moving nine keys by 3 600 each over 179 windows,
   * which is 181 apiece. The wide probe is four times slower and so leaves
   * four times as much room for exactly the drain corrected for here.
   */
  const DRIFT_MS = 8_000
  await sleep(DRIFT_MS)
  const settled = await readQuota(lane.key)
  if (!settled) return
  const drainPerMs = Math.max(0, (before.used - settled.used) / DRIFT_MS)

  const probe = `${API}/${lane.key}/MODIS_SP/${boundsToFirms(aoi.bounds)}/1/2014-03-01`
  const probeFrom = Date.now()
  for (let i = 0; i < 2; i++) {
    await fetch(probe, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }).then(
      (r) => r.arrayBuffer(),
      () => null,
    )
    // Charged to the lane like any other request. These go out through `fetch`
    // rather than `takeLane` — they have to, being what decides the pacing —
    // but leaving them unrecorded hides real spending from both the sliding
    // window and the projected ceiling.
    lane.fired.push(Date.now())
    lane.sincePoll++
  }
  const after = await readQuota(lane.key)
  if (!after) return

  const drained = drainPerMs * (Date.now() - probeFrom)
  const perWindow = ((after.used - settled.used + drained) / 2) * WINDOW_DAYS

  /**
   * Reject anything dearer than the whole planet.
   *
   * The measurement assumes these keys are ours alone for its few seconds. If
   * a second collector is running against the same keys — which is easy to do
   * by accident, and I did it — its traffic lands in the delta and the answer
   * is whatever that process happened to spend. Measured that way, Yakutia,
   * which really costs ten, came back at 460 and was written down as such;
   * from then on it would have been paced at nine windows a key per ten
   * minutes for ever.
   *
   * There is a hard bound available, though, and it needs no model of the
   * billing: no bounding box can cost more than the entire globe. Anything
   * above that is contamination, not a price, and must not be remembered.
   */
  const CEILING = Math.ceil(TXN_DEFAULT * 1.25)
  if (perWindow <= 0 || perWindow > CEILING) {
    process.stdout.write(
      `  cost measurement rejected (${Math.ceil(perWindow)} > the whole globe);` +
        ` another run is probably using these keys. Using ${TXN_PER_REQUEST} per window.
`,
    )
    return
  }

  setCost(Math.ceil(perWindow))
  await saveCost(aoi.id, TXN_PER_REQUEST)
  process.stdout.write(
    `  measured: ${TXN_PER_REQUEST} transactions per ${WINDOW_DAYS}-day window over ${aoi.id}` +
      ` → ${QUOTA_BUDGET} windows per key per 10 min (${QUOTA_BUDGET * LANES.length} across the pool)\n`,
  )
}
/**
 * How long a single window may take, body included.
 *
 * `AbortSignal.timeout` covers the whole exchange, not just the headers, so
 * this is a budget for the download and not a connect timeout. Forty-five
 * seconds is right for a regional window of a few tens of kilobytes and
 * catastrophically wrong for the world: a global VIIRS window is ~35 MB, which
 * is 50 s on its own and around 140 s when sixteen lanes are sharing the link.
 * Every one of them would have aborted, burned four retries — each re-fetching
 * from scratch and costing quota — and then failed the run.
 *
 * The global pull got as far as MODIS, whose windows are a quarter the size,
 * before this was caught; nothing would have looked wrong until VIIRS.
 */
const REQUEST_TIMEOUT_MS = 45_000
/**
 * Twenty minutes, not ten, because the server's pace is not ours to assume.
 *
 * Ten was sized against FIRMS delivering ~600 KB/s, which is what it did in
 * the morning: a 35 MB VIIRS window in under a minute, with the timeout there
 * for genuinely wedged connections. By evening the same endpoint was giving
 * 67 KB/s — measured, while an unrelated host on the same line still gave
 * 3.2 MB/s, so it is congestion at their end and not something to work
 * around. At that rate a window needs 522 seconds and the margin was 15%.
 *
 * Going under would not just lose the window: each of the four attempts
 * re-downloads it from the start, so a slow spell would turn into four times
 * the traffic at the exact moment there is least of it to go round. A long
 * timeout costs one stalled lane; a short one costs the run.
 */
const WORLD_REQUEST_TIMEOUT_MS = 20 * 60_000
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

/**
 * Spans as reported by the FIRMS data_availability endpoint on 19 Sep 2026.
 *
 * These are only the fallback. The real spans are asked for at startup, because
 * hard-coding them quietly rots in a way that is very hard to notice: NASA
 * republishes each period as a science-quality `*_SP` product about a year
 * later, and the NRT one stops being the best available. Frozen dates would
 * keep fetching the provisional version for ever, and the archive would look
 * complete while slowly filling up with data that had already been superseded.
 */
const SP_CUTOVER = '2026-06-30'
const NRT_START = '2026-07-01'

/**
 * What FIRMS says it currently holds, per product.
 *
 * One request, no key cost worth counting, and it removes a whole class of
 * silent staleness. If it fails — the endpoint is down, the key is cold — the
 * run carries on with the constants above rather than refusing to start.
 */
async function askAvailability(): Promise<Map<string, { from: string; to: string }>> {
  // Try each key rather than just the first. A spent key answers "Invalid
  // MAP_KEY" to this endpoint too, and taking that as "availability unknown"
  // would drop us back to the frozen dates without anything looking wrong.
  for (const lane of LANES) {
    const out = new Map<string, { from: string; to: string }>()
    try {
      const res = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/${lane.key}/ALL`, {
        signal: AbortSignal.timeout(20_000),
      })
      const text = await res.text()
      for (const line of text.split(/\r?\n/).slice(1)) {
        const [id, from, to] = line.split(',').map((s) => s.trim())
            if (id && /^\d{4}-\d{2}-\d{2}$/.test(from ?? '') && /^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) {
          out.set(id, { from, to })
        }
      }
    } catch {
      // Network hiccup on this key; try the next one.
    }
    if (out.size) return out
  }
  return new Map()
}

let AVAILABLE = new Map<string, { from: string; to: string }>()

/**
 * Where each product's window grid starts counting, for ever.
 *
 * Not the same thing as when the product has data. The cache key is
 * bounds + product + start + span, so if window boundaries move, every key
 * moves with them and the whole cache is orphaned. Boundaries used to be laid
 * out from the product's `from`, which now comes from the network — so a
 * flaky availability endpoint, or NRT retention rolling forward by a day,
 * would silently re-download gigabytes that were already on disk.
 *
 * These dates are therefore frozen and must never be edited. What the API
 * reports still decides which windows are *wanted*; it no longer decides where
 * they fall.
 */
const GRID_ANCHOR: Record<string, string> = {
  MODIS_SP: '2000-11-01',
  MODIS_NRT: '2026-07-01',
  VIIRS_SNPP_SP: '2012-01-20',
  VIIRS_SNPP_NRT: '2026-07-01',
  VIIRS_NOAA20_SP: '2018-04-01',
  VIIRS_NOAA20_NRT: '2026-07-01',
  VIIRS_NOAA21_NRT: '2024-01-17',
}

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
    // What the API says it holds wins over what was true when this was written.
    // The NRT tail moves forward every day and the SP cutover jumps forward
    // once a year; both are exactly the kind of date a person forgets to bump.
    .map((p) => {
      const live = AVAILABLE.get(p.id)
      return live ? { ...p, from: live.from, to: live.to < today() ? live.to : today() } : p
    })
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

  // Start on the fixed grid, not at whatever `from` happens to be today, so a
  // span that moves does not shift every boundary behind it.
  const anchor = GRID_ANCHOR[p.id] ?? p.from
  /**
   * Walk the fixed grid, but emit only the part of each cell inside the span.
   *
   * Snapping the cursor to the grid and starting there is not enough, and the
   * two halves of this went wrong in opposite directions. Falling back to
   * `p.from` when the span begins before the anchor throws the grid away and
   * orphans the cache — the one thing the anchor exists to prevent. Snapping
   * backwards unconditionally reaches outside the span instead, and that is
   * worse: the science and near-real-time halves of a sensor are clamped to
   * abut, so a first cell reaching a few days back pulls those days in from
   * *both* products. Every detection on them is then folded twice, inflating
   * the totals and the sensitivity ratio, and nothing downstream can tell —
   * the days stay unique, only their contents double.
   *
   * Intersecting each cell with the span settles both. Interior cells are
   * whole and grid-aligned, so their cache keys never move; only the first and
   * last can be partial, and those change exactly when the span's own edges
   * do, which is correct.
   */
  const offset = Math.round((Date.parse(p.from) - Date.parse(anchor)) / DAY_MS)
  let cell = addDays(anchor, Math.floor(offset / width) * width)

  while (cell <= p.to) {
    const cellEnd = addDays(cell, width - 1)
    const start = cell < p.from ? p.from : cell
    const end = cellEnd > p.to ? p.to : cellEnd
    if (start <= end) {
      out.push({ product: p.id, start, days: Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1 })
    }
    cell = addDays(cell, width)
  }
  return out
}

/**
 * Each product's span, widened to cover whatever is already on disk.
 *
 * The spans come from the API now, and they move: near-real-time retention is
 * a rolling couple of months, so days served last week can simply stop being
 * offered. Taken at face value those days fall out of the task list, out of
 * the fold, and out of the published cube — while the cube's own range still
 * spans them, so the reader paints them as days when nothing burned rather
 * than days when nothing was watching. Silently, at the newest end of the
 * record, which is where anyone looks first.
 *
 * They are still on disk. So the span used is the union of what FIRMS offers
 * and what we already hold: nothing ever collected is dropped, and including a
 * cached window costs nothing because it never goes near the network.
 */
async function widenToCache(dir: string): Promise<Product[]> {
  const held = new Map<string, { from: string; to: string }>()
  let names: string[] = []
  try {
    names = await readdir(dir)
  } catch {
    return products()
  }
  for (const name of names) {
    // PRODUCT-YYYY-MM-DD-hash.csv.gz
    const m = /^([A-Z0-9_]+)-(\d{4}-\d{2}-\d{2})-[0-9a-f]+\.csv\.gz$/.exec(name)
    if (!m) continue
    const id = m[1]
    const start = m[2]
    const span = held.get(id)
    if (!span) held.set(id, { from: start, to: start })
    else {
      if (start < span.from) span.from = start
      if (start > span.to) span.to = start
    }
  }
  // An explicit FROM is a deliberate narrowing for iteration, so widening must
  // not quietly undo it — with a full cache, `FROM=2026-01-01` would otherwise
  // still fold every year back to 2000 and the switch would do nothing.
  const pinned = Boolean(process.env.FROM)
  const live = products()

  /**
   * Widening must not undo the SP/NRT clamp.
   *
   * The two halves of a sensor are clamped to abut when the spans are read, but
   * that happens before this. At the next cutover advance the science product
   * reaches forward a year while the cache still holds NRT windows from before
   * it — widening `from` back to the oldest cached window would hand twelve
   * months to *both* products, and every detection in them would be folded
   * twice: inflated totals, inflated FRP, and a corrupted sensitivity ratio.
   *
   * The duplicate-day assertion would not catch it either. The days stay
   * unique; only their contents double.
   */
  const spEndOf = new Map<string, string>()
  const nrtStartOf = new Map<string, string>()
  for (const p of live) {
    if (p.id.endsWith('_SP')) spEndOf.set(p.id.replace(/_SP$/, '_NRT'), p.to)
    if (p.id.endsWith('_NRT')) nrtStartOf.set(p.id.replace(/_NRT$/, '_SP'), p.from)
  }

  return live.map((p) => {
    const have = held.get(p.id)
    if (!have) return p

    // Filenames carry each window's *start*. Interior cells run the full
    // width, but the newest is clipped by the calendar — treating it as
    // full-width pushes `to` into next week and asks FIRMS, every run, for
    // days that do not exist yet.
    const heldEnd = addDays(have.to, WINDOW_DAYS - 1)
    const now = today()
    const heldTo = heldEnd > now ? now : heldEnd

    let from = !pinned && have.from < p.from ? have.from : p.from
    let to = heldTo > p.to ? heldTo : p.to

    /**
     * Both ends need the guard, not just the near one.
     *
     * Only `from` was clamped at first, which covers an NRT half reaching back
     * into its SP sibling. The mirror case is just as real and quieter: a
     * cache built while the availability endpoint was down used the frozen
     * cutover, so the SP half on disk ends later than the live report says —
     * and widening `to` to match pushes it past where NRT now begins. Weeks
     * arrive from both products, every detection on them is folded twice, and
     * because the interior windows all hit existing cache keys it costs no
     * network and looks entirely normal.
     */
    const spEnd = spEndOf.get(p.id)
    if (spEnd && from <= spEnd) from = addDays(spEnd, 1)
    const nrtStart = nrtStartOf.get(p.id)
    if (nrtStart && to >= nrtStart) to = addDays(nrtStart, -1)

    return from <= to ? { ...p, from, to } : p
  })
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
interface Lane {
  key: string
  /** 1-based, for logs. The key itself is never printed. */
  n: number
  /** Earliest moment this key may fire again, for its own steady rate. */
  nextSlot: number
  /** When this key's recent requests went out, oldest first. */
  fired: number[]
  /** The key's real transaction count, as last read from FIRMS. */
  used: number
  /** When that reading arrived; a stale one must not be trusted for ever. */
  usedAt: number
  /** Requests fired since that reading, which it does not yet include. */
  sincePoll: number
  /** Set while this key is sitting out a spent quota window. */
  gate: Promise<void> | null
}

const LANES: Lane[] = KEYS.map((key, i) => ({ key, n: i + 1, nextSlot: 0, fired: [], used: 0, usedAt: 0, sincePoll: 0, gate: null }))

/**
 * The second line of defence, and the only one that cannot be wrong.
 *
 * The sliding-window budget is only as good as its estimate of what a request
 * costs, and that estimate has now been wrong twice — once by assuming the
 * price was per day, once by extrapolating a five-day window from a one-day
 * probe. Rather than keep refining a model of someone else's billing, poll the
 * counter they actually keep and stop using a key when it gets near the top.
 *
 * Polling is cheap and the timer is unreferenced, so it cannot keep the
 * process alive after the pull is done — a mistake already made once here with
 * an unawaited quota wait.
 */
/**
 * A reading alone is not enough — it has to be projected forward.
 *
 * The counter is polled, not pushed, so between two reads a lane can fire many
 * more requests than the last reading knows about. At sixteen lanes and a
 * window a second, twenty seconds of lag is hundreds of unaccounted
 * transactions, which is exactly how the pool sailed from a 4 250 ceiling to
 * 4 880 and stalled. So each lane carries what it has spent since its reading,
 * and the check is made against the sum.
 */
const QUOTA_SOFT_CEILING = Math.floor(QUOTA_CAP * 0.75)
const QUOTA_POLL_MS = 10_000

/**
 * How stale a reading may be before it stops being evidence.
 *
 * `readQuota` returns null on any failure, and a persistently unreachable
 * status endpoint would then freeze `used` while `sincePoll` kept climbing —
 * so the projection would exceed the ceiling on every lane, for ever, and the
 * pull would hang silently with no error and nothing in the log. The local
 * sliding-window budget is a correct limiter on its own, so when the reading
 * goes stale the ceiling check simply steps aside and lets it do the work.
 */
const QUOTA_READING_MAX_AGE_MS = 4 * QUOTA_POLL_MS

function projectedUse(lane: Lane): number {
  if (Date.now() - lane.usedAt > QUOTA_READING_MAX_AGE_MS) return 0
  return lane.used + lane.sincePoll * TXN_PER_REQUEST
}

async function startQuotaWatch(): Promise<() => void> {
  const tick = async () => {
    // Snapshot before the round trip, subtract after. Zeroing would discard
    // every request fired while the status endpoint was answering — requests
    // the server had not seen yet either, so they would vanish from both
    // halves of the projection, which is the very undercount it exists to
    // prevent.
    const before = LANES.map((l) => l.sincePoll)
    const reads = await Promise.all(LANES.map((l) => readQuota(l.key)))
    reads.forEach((q, i) => {
      if (!q) return
      const lane = LANES[i]
      lane.used = q.used
      lane.usedAt = Date.now()
      lane.sincePoll = Math.max(0, lane.sincePoll - before[i])
    })
  }
  // Awaited, not fired and forgotten. Until the first reading lands every lane
  // looks idle, so the pool opens at full width against keys that may be spent
  // — which is exactly what happened: 207 rejections in the first seconds, and
  // all nine lanes sent to wait while their counters were already draining.
  await tick()
  const timer = setInterval(() => void tick(), QUOTA_POLL_MS)
  timer.unref()
  return () => clearInterval(timer)
}

/**
 * Claim the next key that is free to fire.
 *
 * Each key paces itself independently, so N keys fire at N times the rate, and
 * a key that has spent its window takes only itself out of service. The whole
 * pool stops only when every key is cooling at once — and then it waits for
 * whichever comes back first rather than for a particular one.
 */
async function takeLane(): Promise<Lane> {
  for (;;) {
    const now = Date.now()
    const open = LANES.filter((l) => !l.gate)

    if (!open.length) {
      await Promise.race(LANES.map((l) => l.gate).filter((g): g is Promise<void> => !!g))
      continue
    }

    // Forget requests that have aged out of the rolling window.
    for (const l of open) {
      let drop = 0
      while (drop < l.fired.length && l.fired[drop] <= now - QUOTA_WINDOW_MS) drop++
      if (drop) l.fired.splice(0, drop)
    }

    const ready = open.filter((l) => l.fired.length < QUOTA_BUDGET && projectedUse(l) < QUOTA_SOFT_CEILING)
    if (ready.length) {
      // Least recently used wins, which is what keeps the keys spending evenly.
      const lane = ready.reduce((a, b) => (a.nextSlot <= b.nextSlot ? a : b))
      const at = Math.max(now, lane.nextSlot)
      /**
       * Spread the budget across the window instead of spending it at once.
       *
       * A lane allowed 25 requests per ten minutes will, left alone, fire all
       * 25 in the first few seconds and then sit out the remaining nine and a
       * half minutes. That is the same sawtooth the server's own limit
       * produces, just self-inflicted, and it wastes the link for most of every
       * cycle: the pull ran at a window a second and then stopped dead for
       * seven minutes with no rejection and nothing wrong.
       *
       * Deriving the gap from the budget turns the allowance into a rate. The
       * floor still applies when there is plenty of quota, as on a region.
       */
      lane.nextSlot = at + Math.max(MIN_REQUEST_GAP_MS, QUOTA_WINDOW_MS / QUOTA_BUDGET)
      lane.fired.push(at)
      lane.sincePoll++
      if (at > now) {
        await sleep(at - now)
        // The slot was reserved before the wait. At sixteen lanes on one key
        // those waits stack to about three seconds, and a throttle answer
        // arriving inside that window gates the key while a queue of workers
        // is still holding slots on it. Firing them anyway is what the gate
        // exists to prevent: each rejection costs another transaction and the
        // window never drains.
        if (lane.gate) {
          // Give *this* reservation back. Popping the last entry instead would
          // drop whichever concurrent caller reserved most recently: the count
          // would come out right and the timestamps would not.
          const mine = lane.fired.lastIndexOf(at)
          if (mine >= 0) lane.fired.splice(mine, 1)
          lane.sincePoll = Math.max(0, lane.sincePoll - 1)
          continue
        }
      }
      return lane
    }

    // Every key is either at its own budget or near its real counter. Wait for
    // whichever frees up first — seconds, not the eleven minutes a rejection
    // would cost. A lane held back by the counter rather than by the local
    // budget has no timestamp to wait on, so fall back to the poll interval.
    const byBudget = open.filter((l) => l.fired.length).map((l) => l.fired[0] + QUOTA_WINDOW_MS)
    const soonest = byBudget.length ? Math.min(...byBudget) : now + QUOTA_POLL_MS
    await sleep(Math.max(250, Math.min(soonest - now, 30_000)))
  }
}

/** Take one key out of service until its rolling window has drained. */
function holdForQuota(lane: Lane): Promise<void> {
  if (!lane.gate) {
    const waitedFrom = Date.now()
    lane.gate = drainQuota(lane).finally(() => {
      lane.gate = null
      lane.nextSlot = Date.now()
      /**
       * Only forget the spending if the wait really outlasted the window.
       *
       * This used to clear unconditionally, on the premise that a gated key
       * always sat out eleven minutes — longer than the ten-minute window, so
       * its history was genuinely gone. `drainQuota` no longer works that way:
       * it returns as soon as the polled counter drops under the ceiling,
       * which can be after a single fifteen-second sleep. Wiping then hands a
       * key that is sitting at 3 740 out of 5 000 a full fresh budget, and
       * resets the one limiter that is correct on its own at the exact moment
       * the key is closest to the cap.
       */
      if (Date.now() - waitedFrom >= QUOTA_WINDOW_MS) lane.fired.length = 0
    })
  }
  return lane.gate
}

async function readQuota(key: string): Promise<{ used: number; cap: number } | null> {
  try {
    const res = await fetch(`https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${key}`, {
      signal: AbortSignal.timeout(20_000),
    })
    const body = (await res.json()) as { current_transactions?: number; transaction_limit?: number }
    /**
     * No counter means no answer, not an idle key.
     *
     * Defaulting the missing field to 0 makes a revoked or mistyped key look
     * like the freshest one in the pool, and everything then prefers it: the
     * least-recently-used pick in `takeLane` sends it every request, the gate
     * lets it straight back out after fifteen seconds because "0/5000", and
     * `calibrateCost` always chooses it to probe with — so its delta is zero
     * and cost measurement is silently switched off for the whole run.
     */
    if (typeof body.current_transactions !== 'number') return null
    return { used: body.current_transactions, cap: body.transaction_limit ?? QUOTA_CAP }
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
async function drainQuota(lane: Lane): Promise<void> {
  /**
   * Wait on the counter, not on a stopwatch.
   *
   * This used to go silent for a flat eleven minutes and then probe with a real
   * request. That was the right shape when the only way to learn about the
   * quota was to spend some of it — but the status endpoint reports the true
   * figure, answers even while the data API is refusing, and costs nothing
   * worth counting. So a key comes back the moment it actually has room instead
   * of serving out a fixed sentence.
   *
   * It matters more than it sounds. A run that tripped the limit in its first
   * seconds sat idle for eleven minutes with every counter already down at a
   * quarter of the cap, because nothing was looking.
   */
  const deadline = Date.now() + 6 * QUOTA_SILENCE_MS
  while (Date.now() < deadline) {
    await sleep(15_000)
    const q = await readQuota(lane.key)
    if (!q) continue
    lane.used = q.used
    // Stamp it: this is the freshest reading in the process, and without the
    // timestamp `projectedUse` would judge it stale and wave the lane through
    // with no ceiling check at the moment the key is closest to the cap.
    lane.usedAt = Date.now()
    lane.sincePoll = 0
    if (q.used < QUOTA_SOFT_CEILING) {
      process.stdout.write(`\n  key #${lane.n} back at ${q.used}/${q.cap}, resuming\n`)
      return
    }
    const others = LANES.filter((l) => l !== lane && !l.gate).length
    process.stdout.write(
      `\r  key #${lane.n} waiting at ${q.used}/${q.cap}` +
        (others ? `, ${others} other key(s) working` : ', whole pool idle') +
        '      ',
    )
  }
  process.stdout.write(`\n  key #${lane.n} never came back under the ceiling; trying anyway\n`)
}

/**
 * Fill the cache and fold nothing.
 *
 * The global pull is ~100 GB across the wire and a single five-day VIIRS window
 * for the whole planet is around 45 MB of CSV. Parsing those into detections
 * and holding them by year — which is what a regional run does — is several
 * gigabytes of live objects before the first year is even complete, and Node
 * dies long before the download does.
 *
 * So the two halves are separated. This mode does the eighteen-hour part, which
 * is bounded by bandwidth, and writes each window straight to disk without ever
 * materialising it as anything but a buffer. Folding the cache into a pyramid
 * is then a local, restartable, streaming job with no network in it at all.
 */
const FETCH_ONLY = process.env.FETCH_ONLY === '1'

/**
 * Whether this particular AOI is fetch-only.
 *
 * Per AOI, not per run. Setting one global flag because `world` appeared in the
 * argument list meant `build-archive.ts punjab world` downloaded every Punjab
 * window and then folded none of them — printing "cache filled, nothing
 * folded", leaving the old cube in place, and exiting successfully. The world
 * cannot be folded here; a region in the same command still can.
 */
function fetchOnlyFor(aoi: Aoi): boolean {
  return FETCH_ONLY || aoi.id === WORLD.id
}

/**
 * How recent a window has to be before its cached copy is not trusted.
 *
 * FIRMS publishes a day's detections over the hours after each satellite pass,
 * so a window that reaches up to today is still filling in when it is fetched.
 * The cache key is bounds + product + start + span, and none of those change
 * once the span stops being clipped by the calendar — so an undercounted window
 * fetched on its own last day would be served from cache for ever, quietly
 * missing the passes that landed after it.
 *
 * Three days rather than one because the NRT products are also revised
 * slightly, not only appended to, for a little while after first publication.
 * The cost of being wrong here is a handful of refetches per run; the cost of
 * trusting it is a permanent dent at the end of the record, which is exactly
 * where anyone looks first.
 */
/**
 * Write a cache entry so it is either wholly there or not there at all.
 *
 * `writeFile` is not atomic. A run killed mid-write — quota, a closed laptop,
 * me stopping it to fix something — leaves a short or empty `.csv.gz`, and that
 * file is then indistinguishable from a good one: `existsSync` says yes and
 * fetch-only mode never even decodes it, so the window counts as done for ever.
 * That is precisely the failure the whole cache exists to prevent, and on the
 * global pull it would leave the archive looking complete while holding holes.
 *
 * Writing beside the target and renaming makes the appearance of the name and
 * the completeness of the contents the same event.
 */
async function writeCache(path: string, body: Buffer): Promise<void> {
  const tmp = `${path}.${process.pid}.tmp`
  try {
    await writeFile(tmp, body)
    await rename(tmp, path)
  } catch (e) {
    // A failed rename leaves a full-size orphan next to the target. Across a
    // fourteen-thousand-window pull restarted a few times that is a quietly
    // growing pile of five-megabyte files on the second disk.
    await unlink(tmp).catch(() => {})
    throw e
  }
}

const VOLATILE_DAYS = 3

function isVolatile(task: Task): boolean {
  // Whole days on both sides. Comparing a window's midnight against "now minus
  // three days" lands mid-afternoon and quietly lets the oldest volatile day
  // through, which is the one most likely to have been caught half-written.
  const endsAt = Date.parse(addDays(task.start, task.days - 1) + 'T00:00:00Z')
  const cutoff = Date.parse(today() + 'T00:00:00Z') - VOLATILE_DAYS * DAY_MS
  return endsAt >= cutoff
}

async function fetchWindow(aoi: Aoi, task: Task): Promise<string> {
  const path = cachePath(aoi, task)
  if (existsSync(path) && !isVolatile(task)) {
    // Decoding a cached window costs a gunzip and a 45 MB string that the
    // fetch-only caller throws away unread.
    if (fetchOnlyFor(aoi)) return ''
    try {
      return gunzipSync(await readFile(path)).toString('utf8')
    } catch {
      // A cache entry written before the atomic rename above, or damaged since.
      // Refetching is minutes; failing the run on a raw zlib error is the rest
      // of the evening.
      process.stdout.write(`\n  unreadable cache entry, refetching: ${path}\n`)
    }
  }

  const tail = `${task.product}/${boundsToFirms(aoi.bounds)}/${task.days}/${task.start}`
  let lastError = ''
  /** Quota waits are not failures, but they cannot be unlimited either. */
  let quotaWaits = 0
  /** Whichever key was free; a retry may well come back on a different one. */
  let lane = LANES[0]

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      lane = await takeLane()
      const url = `${API}/${lane.key}/${tail}`
      const budget = aoi.id === WORLD.id ? WORLD_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS
      const res = await fetch(url, { signal: AbortSignal.timeout(budget) })

      /**
       * Kept as bytes rather than a string.
       *
       * A global VIIRS window is 35 MB. Decoding that into a JS string and then
       * copying it back into a Buffer to gzip costs twice the memory and a
       * full UTF-8 decode of bytes that are only going to be compressed and
       * written. At the concurrency the global pull wants, that difference is
       * a gigabyte. Only a regional run, which actually parses the CSV, pays
       * for the string.
       *
       * Everything that gets inspected — the header, the API's error text, the
       * window limit it states — lives in the first few bytes, so `head` is
       * enough for all of it.
       */
      const raw = Buffer.from(await res.arrayBuffer())
      const head = raw.subarray(0, 240).toString('latin1')
      /**
       * Error text is matched against much more than the header peek.
       *
       * A rejection is small, but it need not start with its own message — an
       * HTML error page or a proxy interstitial puts kilobytes of markup in
       * front of it. Matching the throttle and window-limit patterns against
       * 240 bytes would read those as some unknown failure, take the plain
       * retry branch, and fire three more requests into a key that is already
       * limited, each one costing quota and extending the outage.
       */
      const errText = raw.subarray(0, 16_384).toString('latin1')

      if (res.ok && (HEADER_RE.test(head) || head.trim() === '')) {
        await writeCache(path, await gzipAsync(raw))
        return fetchOnlyFor(aoi) ? '' : raw.toString('utf8')
      }

      lastError = `${res.status} ${errText.slice(0, 120).replace(/\s+/g, ' ')}`

      // The API states its own maximum when we overshoot. Honour it by splitting.
      const limit = LIMIT_RE.exec(errText)
      if (limit && task.days > Number(limit[1])) {
        const width = Number(limit[1])
        const parts: string[] = []
        for (let offset = 0; offset < task.days; offset += width) {
          const span = Math.min(width, task.days - offset)
          parts.push(await fetchWindow(aoi, { product: task.product, start: addDays(task.start, offset), days: span }))
        }
        /**
         * In fetch-only mode the pieces came back empty on purpose — that mode
         * returns nothing anywhere — so there is nothing to join and joining it
         * would write an empty file under the wide window's name. That file
         * would then be trusted for ever, and the whole global pull could sit
         * there looking complete while holding nothing. The pieces themselves
         * are cached, so leaving the wide window unwritten costs one split on
         * the next run and no network at all.
         */
        if (fetchOnlyFor(aoi)) return ''
        const joined = joinCsv(parts)
        await writeCache(path, await gzipAsync(Buffer.from(joined, 'utf8')))
        return joined
      }

      // A rolling-window limit takes this key out of service, not the run: the
      // retry goes to whichever other key is free, and only stops if they are
      // all cooling at once.
      if (THROTTLE_RE.test(errText)) {
        if (++quotaWaits <= 4 * LANES.length) attempt--
        // The gate runs for up to an hour and writes to stdout along the way.
        // An EPIPE in there rejects a promise nobody is awaiting on the
        // multi-key path, and Node's default mode takes the process down.
        const gate = holdForQuota(lane).catch(() => {})
        if (LANES.every((l) => l.gate)) await gate
      } else {
        await sleep(1500 * (attempt + 1))
      }
    } catch (e) {
      lastError = String(e)
      await sleep(1500 * (attempt + 1))
    }
  }
  /**
   * A stale copy beats no copy, for the volatile tail only.
   *
   * Windows within a few days of today are deliberately refetched rather than
   * served from cache, because FIRMS is still filling them in. But "refetch
   * it" was being read as "refetch it or lose the run": one transient 5xx on
   * one tail window threw, the AOI was marked incomplete, and a rebuild of
   * three and a half thousand windows was thrown away — with a perfectly
   * valid, merely slightly-behind copy of that window sitting on disk the
   * whole time.
   *
   * So the refetch stays best-effort. Nothing older than the tail can reach
   * here with a cache entry, since those return long before.
   */
  if (existsSync(path)) {
    try {
      const text = gunzipSync(await readFile(path)).toString('utf8')
      process.stdout.write(`
  ${task.product} ${task.start}: refetch failed, keeping the cached copy
`)
      return fetchOnlyFor(aoi) ? '' : text
    } catch {
      // Unreadable as well as unfetchable — nothing to fall back on.
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

/** Returns false when the fetch came up short, so the caller can exit non-zero. */
async function buildAoi(aoi: Aoi): Promise<boolean> {
  const dir = `${CACHE}/${aoi.id}`
  await mkdir(dir, { recursive: true })
  await mkdir(OUT, { recursive: true })

  // Sweep half-written entries left by a run killed between the write and the
  // rename. They are never read — the final name is what makes an entry real —
  // so the only harm is disk, but on a global pull that is gigabytes of it.
  /**
   * Sweep only what is certainly abandoned.
   *
   * `writeCache` names its temp file after the process id precisely because
   * two runs can be writing the same directory — a retry started while an
   * overnight pull is still going, say. Deleting every `.tmp` would pull the
   * file out from under the other process: its rename fails, the window is
   * recorded as lost, and for a folding AOI that suppresses the cube. So the
   * ones belonging to this process are left alone, and the rest are only taken
   * once they are far older than any request could still be in flight.
   */
  const mine = `.${process.pid}.tmp`
  const stale = Date.now() - 2 * WORLD_REQUEST_TIMEOUT_MS
  const names = (await readdir(dir)).filter((f) => f.endsWith('.tmp') && !f.endsWith(mine))
  const orphans: string[] = []
  for (const f of names) {
    const when = await stat(`${dir}/${f}`).then(
      (st) => st.mtimeMs,
      () => 0,
    )
    if (when && when < stale) orphans.push(f)
  }
  if (orphans.length) {
    await Promise.all(orphans.map((f) => unlink(`${dir}/${f}`).catch(() => {})))
    process.stdout.write(`  swept ${orphans.length} abandoned half-written entries
`)
  }

  const tasks = (await widenToCache(dir)).flatMap(windowsFor)
  process.stdout.write(`\n${aoi.id}: ${tasks.length} windows\n`)

  // Per AOI, because the price is per area and the AOIs differ by four orders
  // of magnitude in it.
  await calibrateCost(aoi)

  /**
   * Say up front how long the quota alone will take.
   *
   * With few keys the global pull is quota-bound end to end — one key gives 25
   * windows per ten minutes, so 3 781 of them is a full day — while the plan
   * quotes six hours, which only holds from about six keys up. Someone
   * watching a run that is four times slower than the document promised will
   * reasonably conclude it is broken. Better to state the arithmetic before it
   * starts than to leave them to discover it.
   */
  const perHour = (LANES.length * QUOTA_BUDGET * 3600_000) / QUOTA_WINDOW_MS
  const quotaHours = tasks.length / perHour
  if (quotaHours > 1) {
    process.stdout.write(
      `  quota alone allows ${perHour.toFixed(0)} windows an hour on ${LANES.length} key(s)` +
        ` — at least ${quotaHours.toFixed(1)}h for ${tasks.length} windows, before bandwidth
`,
    )
  }

  /** Detections bucketed by year of acquisition, so each year folds on its own. */
  const byYear = new Map<number, Detection[]>()
  let nonVegetation = 0
  let done = 0

  const lanes = aoi.id === WORLD.id ? WORLD_CONCURRENCY : CONCURRENCY

  /**
   * Windows that would not come down, collected instead of thrown.
   *
   * One window failing used to reject the pool and exit the process. On a
   * four-hour global pull that means a single wedged request — which now has a
   * ten-minute budget and four attempts, so forty minutes of it — throws away
   * a run whose other three thousand windows were fine. The cache already makes
   * windows independent of each other, so the only thing the abort bought was
   * losing the rest of the list.
   *
   * They are reported at the end, and a folding run refuses to write a cube
   * built on an incomplete fetch: a silently short archive is worse than none.
   */
  const failed: Array<{ task: Task; why: string }> = []

  await pool(tasks, lanes, async (task) => {
    let text: string
    try {
      text = await fetchWindow(aoi, task)
    } catch (e) {
      failed.push({ task, why: String(e).slice(0, 160) })
      done++
      return
    }
    if (!fetchOnlyFor(aoi)) {
      const parsed = parseFirmsCsv(text)
      nonVegetation += parsed.nonVegetation
      for (const d of parsed.detections) {
        // Bucket by the same day the harmonizer will date this by, not by the
        // UTC date on the row.
        //
        // A detection just before midnight UTC on 31 December can belong to 1
        // January in local solar time. Bucketed by its UTC year it lands in the
        // old year, and that year's fold then emits a row for 1 January — while
        // the next year's fold emits one too. Two rows for the same day, each
        // holding half of it, and whichever the reader keeps is an undercount.
        // Seven such days in Punjab, five in the Cerrado, every one of them a
        // 1 January or a 31 December.
        const y = Number(localSolarDay(d.dateUtc, d.timeUtc, d.lon).slice(0, 4))
        let bucket = byYear.get(y)
        if (!bucket) byYear.set(y, (bucket = []))
        bucket.push(d)
      }
    }
    done++
    if (done % 25 === 0 || done === tasks.length) {
      process.stdout.write(`\r  fetch ${done}/${tasks.length} (${((done / tasks.length) * 100).toFixed(0)}%)   `)
    }
  })
  process.stdout.write('\n')

  if (failed.length) {
    process.stdout.write(`  ${failed.length}/${tasks.length} windows failed:\n`)
    for (const f of failed.slice(0, 10)) {
      process.stdout.write(`    ${f.task.product} ${f.task.start} +${f.task.days}d — ${f.why}\n`)
    }
    if (failed.length > 10) process.stdout.write(`    … and ${failed.length - 10} more\n`)
    process.stdout.write('  Re-run to retry only these; everything else is cached.\n')
  }

  if (fetchOnlyFor(aoi)) {
    const got = tasks.length - failed.length
    process.stdout.write(`  ${aoi.id}: cache filled, ${got}/${tasks.length} windows. Nothing folded.\n`)
    // A holed cache must not look complete to whatever ran this — a retry loop,
    // a shell `&&`, a person reading the exit code after an overnight pull.
    return failed.length === 0
  }

  // A cube folded from a short fetch looks finished and is not, and nothing
  // downstream can tell. Leave the previous file in place instead.
  if (failed.length) {
    process.stdout.write(`  ${aoi.id}: ${failed.length} windows missing; keeping the previous cube.\n`)
    return false
  }

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

  dayRows.sort((a, b) => a[0] - b[0])

  // A day must appear exactly once. Sorting alone used to leave the split
  // year-boundary days sitting next to each other, which looks fine in the file
  // and is wrong in the reader, so assert rather than trust the fix above.
  for (let i = 1; i < dayRows.length; i++) {
    if (dayRows[i][0] === dayRows[i - 1][0]) {
      throw new Error(`${aoi.id}: duplicate day ${isoOf(dayRows[i][0])} in the folded cube`)
    }
  }

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
  // Explicit, not implicit: `noImplicitReturns` is off, so falling off the end
  // here returns undefined, and the caller reads that as a failed region.
  return true
}

function isoOf(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10)
}

async function main() {
  const wanted = process.argv.slice(2)
  // `world` is not in AOIS — it is the global pull, not a region on the site.
  const resolve = (id: string): Aoi | undefined => (id === WORLD.id ? WORLD : aoiById(id))
  const list = wanted.length ? wanted.map(resolve).filter((a): a is Aoi => !!a) : [...AOIS]

  // Folding the world is not a thing that can be done this way, and failing
  // by running out of memory forty minutes in is a bad way to find that out.
  // A global year is 40M+ detections held as objects; the fold would die long
  // before the download did, and there is no global pyramid builder yet anyway.
  if (list.some((a) => a.id === WORLD.id) && !FETCH_ONLY) {
    process.stdout.write('world is fetch-only: its cache is filled and nothing is folded for it.\n')
  }
  process.stdout.write(`Building ${list.length} archive(s) from NASA FIRMS\n`)
  process.stdout.write(`Sensors: ${SENSORS.map((s) => `${SENSOR_META[s].label} ${SENSOR_META[s].pixelM}m`).join(', ')}\n`)

  AVAILABLE = await askAvailability()
  if (AVAILABLE.size) {
    const live = products()
    process.stdout.write(`Spans from FIRMS:\n  ${live.map((p) => `${p.id} ${p.from}..${p.to}`).join('\n  ')}\n`)

    /**
     * The science and near-real-time halves of one sensor must meet exactly.
     *
     * With the spans hard-coded they could not do otherwise; taken live they
     * are two independent rows, and nothing downstream would notice if they
     * stopped abutting. A gap loses days silently. An overlap is worse — the
     * same detections are folded twice, inflating the totals, the daily rows
     * and the sensitivity ratio that the whole harmonization rests on.
     */
    for (const sp of live.filter((p) => p.id.endsWith('_SP'))) {
      const nrtId = sp.id.replace(/_SP$/, '_NRT')
      const nrt = AVAILABLE.get(nrtId)
      const shouldStart = addDays(sp.to, 1)
      if (nrt && nrt.from !== shouldStart) {
        // Reporting and carrying on is not enough here. An overlap means the
        // same days arrive from both products and every detection in them is
        // folded twice — inflating the totals, the daily rows and the
        // sensitivity ratio the whole harmonization rests on. The science
        // product is authoritative, so the provisional half is moved to start
        // where it leaves off.
        if (nrt.from > shouldStart) {
          /**
           * A gap is normal, and closing it would be the damaging move.
           *
           * Near-real-time retention is a rolling couple of months while the
           * science product lags about a year behind it, so a stretch held by
           * neither is the expected state rather than a fault. Back-dating the
           * NRT start to meet the SP end asks for months FIRMS does not serve:
           * it answers either an empty CSV — which folds as genuine
           * zero-detection days, cached for ever, at the newest end of the
           * record where a reader looks first — or an error that costs four
           * retries a window and then fails the build.
           */
          const held = Math.round((Date.parse(nrt.from) - Date.parse(shouldStart)) / DAY_MS)
          process.stdout.write(`  note: ${held} days between ${sp.id} and ${nrtId} are held by neither\n`)
        } else {
          // An overlap is a fault, and an expensive one: the same days arrive
          // from both products and every detection in them is folded twice.
          process.stdout.write(
            `  !! ${sp.id} ends ${sp.to} but ${nrtId} starts ${nrt.from} — overlap; clamping to ${shouldStart}\n`,
          )
          AVAILABLE.set(nrtId, { from: shouldStart, to: nrt.to })
        }
      }
    }
  } else {
    process.stdout.write('Availability endpoint unreachable; using the built-in spans.\n')
  }

  /**
   * Report where each key stands, and gate none of them.
   *
   * An earlier version pre-gated a limited key with `void holdForQuota(lane)`.
   * That started a chain of twenty-second timers lasting from eleven minutes to
   * over an hour, unawaited and unowned — so after every AOI was built the
   * process sat there with a live timer keeping the event loop open, printing
   * "key #N rate limited" over its own finished output, and any rejection in
   * that chain had nobody to catch it.
   *
   * It is not needed. A limited key costs one rejected request, and that
   * rejection is what the gate is driven by in the first place: the normal
   * path notices it, takes the key out of service, and retries elsewhere. Ten
   * transactions to skip a special case that could outlive the run.
   */
  process.stdout.write(`Keys: ${LANES.length}\n`)
  const quotas = await Promise.all(LANES.map((lane) => readQuota(lane.key)))
  quotas.forEach((q, i) => {
    if (q) {
      process.stdout.write(`  key #${LANES[i].n}: ${q.used}/${q.cap} per 10 min\n`)
      return
    }
    // Say so. A key with no counter is almost always a typo or a revocation,
    // and it then behaves worst-case: never judged busy, so always picked
    // first; always answered "Invalid MAP_KEY", which reads as a throttle; and
    // never seen to recover, so it waits the full hour before giving up. On a
    // single-key run that is an hour of silence with no reason given.
    process.stdout.write(`  key #${LANES[i].n}: no counter returned — is this key valid?\n`)
  })

  // Ground truth on every key before a single window is asked for.
  const stopWatch = await startQuotaWatch()

  /** AOIs that did not come out whole, so one bad region cannot bury the rest. */
  const incomplete: string[] = []
  for (const aoi of list) {
    try {
      if (!(await buildAoi(aoi))) incomplete.push(aoi.id)
    } catch (e) {
      // The regions are independent — their fetches share nothing but the keys
      // — so a failure in one is no reason to skip the others entirely.
      process.stdout.write(`\n  ${aoi.id} failed: ${String(e).slice(0, 200)}\n`)
      incomplete.push(aoi.id)
    }
  }

  stopWatch()

  if (incomplete.length) {
    process.stdout.write(`\nIncomplete: ${incomplete.join(', ')}. Re-run to retry; everything else is cached.\n`)
    process.exitCode = 1
  }
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
