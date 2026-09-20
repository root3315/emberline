/**
 * The global overview, read back from the binary the fold produced.
 *
 * The archive behind this is ten gigabytes; what a browser gets is a degree
 * grid, one slot a month, one file a year. That file is not JSON — a year is
 * a few tens of thousands of records and JSON would spend half its bytes on
 * punctuation and the other half turning digits into text and back. It is a
 * flat little-endian block, read straight into typed arrays:
 *
 *   per month:  u32 count, then `count` records of
 *               u32 cell · u32 modis · u32 viirs · f32 frp
 *
 * `cell` is `row * 360 + col` with row 0 at 90°S and col 0 at 180°W, so the
 * centre of a cell is a subtraction rather than a lookup.
 *
 * What is deliberately *not* here is a single "activity" number. MODIS and
 * VIIRS are kept apart all the way to the screen, because the two disagreeing
 * is the subject of the project and not an artefact to be averaged away — the
 * finer instrument sees perhaps seven times as many fires over stubble and
 * less than twice as many over boreal forest. A reader has to be able to ask
 * for one alone.
 */

const COLS = 360
const ROWS = 180
const REC = 16

export interface WorldIndex {
  level: string
  degrees: number
  cols: number
  rows: number
  years: Array<{ year: number; bytes: number; records: number }>
  /**
   * Per-year totals, summed during the fold so the charts need no grids.
   *
   * The power is also carried split by instrument, because only MODIS runs
   * the whole record: the combined figure steps upward on every new satellite
   * and cannot be used for arithmetic. Optional, so an index built before the
   * split still loads.
   */
  totals: Array<{
    year: number
    modis: number
    viirs: number
    frp: number
    frpModis?: number
    frpViirs?: number
  }>
  /** The same, by month, for the planet's seasonal shape. */
  seasons: Array<{ year: number; modis: number[]; viirs: number[] }>
  detections: number
  builtAt: string
}

/** One month of the grid, as parallel arrays — no object per cell. */
export interface WorldMonth {
  cell: Uint32Array
  modis: Uint32Array
  viirs: Uint32Array
  frp: Float32Array
}

export type WorldYear = WorldMonth[]

/** Which instruments a reading should count. */
export type WorldLens = 'both' | 'modis' | 'viirs'

export interface WorldCell {
  lat: number
  lon: number
  /** Detections under the chosen lens, summed over the chosen months. */
  value: number
}

/**
 * What counts as "a lot", per level and per year, decided for the whole planet.
 *
 * Without this the map scales its colours to whatever is on screen, which is
 * right for the planet and badly wrong for a place: framing a quiet city makes
 * its handful of stubble fires the top of the scale and paints them the same
 * red as the Cerrado in August. The ceilings are the ninety-ninth percentile of
 * every burning cell on Earth that year, so a dark cell means the same thing
 * wherever the camera is.
 */
export interface WorldRamp {
  percentile: number
  l0: Record<string, number>
  l1: Record<string, number>
  l2: Record<string, number>
  l3?: Record<string, number>
  now?: number
  /** Per cell-day, for the fine snapshot: multiply by the days on screen. */
  nowFine?: number
}

let ramp: WorldRamp | null = null
let rampWanted: Promise<WorldRamp | null> | null = null

export async function loadWorldRamp(base = '/data/world'): Promise<WorldRamp | null> {
  if (ramp) return ramp
  rampWanted ??= fetch(`${base}/ramp.json`)
    .then(async (res) => {
      if (!res.ok) return null
      ramp = (await res.json()) as WorldRamp
      return ramp
    })
    // A missing file is not a failure: the layer falls back to scaling itself.
    .catch(() => null)
  return rampWanted
}

/** The ceiling for a level and year, or undefined to let the layer decide. */
export function worldCeiling(level: WorldLevel, year: number): number | undefined {
  return ramp?.[level]?.[String(year)]
}

export function nowCeiling(): number | undefined {
  return ramp?.now
}

/**
 * The ceiling for the fine snapshot, widened by the square root of the window.
 *
 * Not by the window itself: a cell alight on Monday is usually not alight on
 * all seven days, so multiplying by seven would dim a whole week of fire to
 * nothing. Not flat either, or a week would saturate where one day was
 * legible. The square root sits between the two, and one day, three days and
 * a week all read at about the same strength.
 */
export function nowFineCeiling(days: number): number | undefined {
  const per = ramp?.nowFine
  return per ? Math.max(1, Math.round(per * Math.sqrt(Math.max(1, days)))) : undefined
}

export async function loadWorldIndex(base = '/data/world'): Promise<WorldIndex> {
  const res = await fetch(`${base}/l0-index.json`)
  if (!res.ok) throw new Error(`world index: HTTP ${res.status}`)
  return (await res.json()) as WorldIndex
}

/**
 * One year, decoded.
 *
 * The buffer is sliced rather than copied: each month's arrays are views onto
 * the bytes that already arrived, so decoding a year costs no more than the
 * download did. `Uint32Array` needs four-byte alignment and the record layout
 * guarantees it — the header is one u32 and every record is sixteen bytes —
 * but only as long as the month blocks stay a multiple of four, which is why
 * the writer never emits an odd-sized field.
 */
/**
 * Which level of the pyramid a zoom deserves.
 *
 * One degree is right for a planet on one screen and ridiculous over a
 * country — a single cell then covers more ground than the viewport, so the
 * fires read as a few enormous plates. Each step down is four times finer and
 * costs more, so each is made where the coarser one starts looking like a
 * mosaic rather than a map:
 *
 *   l0 · 1°     ~110 km   the planet, and anything wider than a continent
 *   l1 · 0.25°   ~25 km   a country
 *   l2 · 0.05°    ~5 km   a province
 *   l3 · 0.01°    ~1 km   a district, and as fine as MODIS itself sees
 *
 * There is no level below l3 and there should not be: a hundredth of a degree
 * is already the footprint of the coarser instrument, and a finer grid would
 * be inventing detail that was never measured.
 */
export type WorldLevel = 'l0' | 'l1' | 'l2' | 'l3'

export function levelForZoom(zoom: number): WorldLevel {
  if (zoom >= 9.5) return 'l3'
  if (zoom >= 7.5) return 'l2'
  return zoom >= 5 ? 'l1' : 'l0'
}

/**
 * The level a framed area deserves, decided from the area itself.
 *
 * Choosing by zoom is right for a reader turning the wheel and wrong the one
 * time it matters most: when the map is *about* to be framed on somewhere.
 * The level is picked, the cells are built, and only then does `fitBounds`
 * move the camera — so the first view of a country is always drawn at the
 * resolution of the view it replaced, which is the whole planet.
 *
 * The box is known in advance, so use it. Below about thirty degrees across a
 * whole-degree cell is a visible plate; below twelve the quarter-degree one is
 * too, and a province-sized box costs two tiles of the finest level rather
 * than the whole planet, so it can afford them.
 */
export function levelForBounds(b: { west: number; south: number; east: number; north: number }): WorldLevel {
  const span = Math.max(b.north - b.south, b.east - b.west)
  if (span <= 2) return 'l3'
  if (span <= 12) return 'l2'
  return span <= 30 ? 'l1' : 'l0'
}

export const LEVEL_DEGREES: Record<WorldLevel, number> = { l0: 1, l1: 0.25, l2: 0.05, l3: 0.01 }

/** The levels that are cut into tiles rather than served a file a year. */
export type TiledLevel = 'l2' | 'l3'

export function isTiled(level: WorldLevel): level is TiledLevel {
  return level === 'l2' || level === 'l3'
}

/**
 * A year, from however many files that level keeps it in.
 *
 * The coarse level is one file; the fine one is four, because a busy year at
 * a quarter degree runs past the five-megabyte ceiling a static asset is
 * allowed. The quarters are fetched together and concatenated, so nothing
 * above this function knows or cares which level it asked for.
 */
export async function loadWorldYear(
  year: number,
  base = '/data/world',
  level: WorldLevel = 'l0',
): Promise<WorldYear> {
  if (isTiled(level)) throw new Error(`${level} is tiled: use loadWorldPatch`)
  if (level === 'l1') {
    const parts = await Promise.all([1, 2, 3, 4].map((q) => decodeChunk(`${base}/l1-${year}-q${q}.bin`, 3)))
    return parts.flat()
  }
  return decodeChunk(`${base}/l0-${year}.bin`, 12)
}

async function decodeChunk(url: string, monthCount: number): Promise<WorldYear> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const view = new DataView(buf)

  const months: WorldYear = []
  let p = 0
  for (let m = 0; m < monthCount; m++) {
    const n = view.getUint32(p, true)
    p += 4
    const cell = new Uint32Array(n)
    const modis = new Uint32Array(n)
    const viirs = new Uint32Array(n)
    const frp = new Float32Array(n)
    for (let k = 0; k < n; k++) {
      const at = p + k * REC
      cell[k] = view.getUint32(at, true)
      modis[k] = view.getUint32(at + 4, true)
      viirs[k] = view.getUint32(at + 8, true)
      frp[k] = view.getFloat32(at + 12, true)
    }
    p += n * REC
    months.push({ cell, modis, viirs, frp })
  }
  return months
}

/**
 * Collapse a span of months into one set of cells to draw.
 *
 * Months are summed rather than averaged: the question the map answers is
 * "how much burned here over this period", and an average would make a place
 * that burns furiously for six weeks look like one that smoulders all year.
 */
export function worldCells(
  year: WorldYear,
  lens: WorldLens,
  fromMonth = 0,
  toMonth = 11,
  degrees = 1,
): WorldCell[] {
  const total = new Map<number, number>()
  for (let m = Math.max(0, fromMonth); m <= Math.min(11, toMonth); m++) {
    const mo = year[m]
    if (!mo) continue
    for (let k = 0; k < mo.cell.length; k++) {
      const v = lens === 'modis' ? mo.modis[k] : lens === 'viirs' ? mo.viirs[k] : mo.modis[k] + mo.viirs[k]
      if (v === 0) continue
      total.set(mo.cell[k], (total.get(mo.cell[k]) ?? 0) + v)
    }
  }

  const cols = Math.round(360 / degrees)
  const out: WorldCell[] = []
  for (const [cell, value] of total) {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    // Cell centres, not corners: the renderer draws a square around the point.
    out.push({ lat: row * degrees - 90 + degrees / 2, lon: col * degrees - 180 + degrees / 2, value })
  }
  return out
}

/** Total detections in a year under a lens, for the headline figure. */
export function worldTotal(year: WorldYear, lens: WorldLens): number {
  let sum = 0
  for (const mo of year) {
    for (let k = 0; k < mo.cell.length; k++) {
      sum += lens === 'modis' ? mo.modis[k] : lens === 'viirs' ? mo.viirs[k] : mo.modis[k] + mo.viirs[k]
    }
  }
  return sum
}

export const WORLD_GRID = { cols: COLS, rows: ROWS }

/* -------------------------------------------------------------------------- *
 * The planet's day.
 *
 * The ribbon is the view this project exists for, and it needs a number per
 * day — which the monthly grid cannot give. But it does not need one per
 * *cell*: the whole ribbon is one value a day for the entire surface, which is
 * nine and a half thousand numbers instead of a daily grid of gigabytes. They
 * are summed during the fold and shipped as their own small file, fetched only
 * when the ribbon is actually drawn.
 * -------------------------------------------------------------------------- */

export interface WorldDaily {
  years: Record<string, { modis: number[]; viirs: number[] }>
}

export async function loadWorldDaily(base = '/data/world'): Promise<WorldDaily> {
  const res = await fetch(`${base}/l0-daily.json`)
  if (!res.ok) throw new Error(`world daily: HTTP ${res.status}`)
  return (await res.json()) as WorldDaily
}

/**
 * The daily series as the grid the ribbon and the statistics already speak.
 *
 * Day one is index one, matching the rest of the app: a `Float64Array(367)`
 * whose slot zero is never used, so day-of-year arithmetic needs no offset
 * anywhere it is read.
 */
export function worldDayGrid(daily: WorldDaily, lens: WorldLens = 'both'): Map<number, Float64Array> {
  const grid = new Map<number, Float64Array>()
  for (const [key, row] of Object.entries(daily.years)) {
    const year = Number(key)
    const out = new Float64Array(367)
    for (let d = 0; d < 366; d++) {
      const m = row.modis[d] ?? 0
      const v = row.viirs[d] ?? 0
      out[d + 1] = lens === 'modis' ? m : lens === 'viirs' ? v : m + v
    }
    grid.set(year, out)
  }
  return grid
}

/** Which instrument families were returning anything at all, per year. */
export function worldSensorMask(daily: WorldDaily, modisBit: number, viirsBit: number): Map<number, number> {
  const out = new Map<number, number>()
  for (const [key, row] of Object.entries(daily.years)) {
    let mask = 0
    if (row.modis.some((n) => n > 0)) mask |= modisBit
    if (row.viirs.some((n) => n > 0)) mask |= viirsBit
    out.set(Number(key), mask)
  }
  return out
}

/** The last day that actually carries a detection, for the observed span. */
export function worldLastDay(daily: WorldDaily): string {
  let best = ''
  for (const [key, row] of Object.entries(daily.years)) {
    for (let d = 365; d >= 0; d--) {
      if ((row.modis[d] ?? 0) + (row.viirs[d] ?? 0) === 0) continue
      const date = new Date(Date.UTC(Number(key), 0, 1) + d * 86_400_000).toISOString().slice(0, 10)
      if (date > best) best = date
      break
    }
  }
  return best
}

/* -------------------------------------------------------------------------- *
 * This week.
 *
 * The live FIRMS endpoint needs a key and this site is public, so "right now"
 * is not fetched in the browser: it is folded at build time and served as
 * data. Quarter-degree cells rather than the archive's whole degree — a week
 * is a thousandth of the record, so it can afford to be eight times finer, and
 * at 25 km a fire front reads as a front instead of as one square.
 * -------------------------------------------------------------------------- */

export interface WorldNowFine {
  degrees: number
  cols: number
  tileDegrees: number
  tileCells: number
  tilesX: number
  tilesY: number
  /** The date a record's day counts from. */
  dayZero: string
  days: number
  tiles: string[]
}

export interface WorldNowMeta {
  degrees: number
  cols: number
  rows: number
  cells: number
  detections: number
  from: string
  to: string
  fetchedAt: string
  incomplete: boolean
  /**
   * Planet-wide detections for each day of the window, from `fine.dayZero`.
   *
   * FIRMS publishes a day over the hours that follow it, so the newest one is
   * nearly always a stub. These totals are what lets the page tell a finished
   * day from a half-written one instead of offering an empty map as "today".
   */
  dayTotals?: number[]
  /** The same week at a twentieth of a degree, day by day, in tiles. */
  fine?: WorldNowFine
  /** And the same week as individual detections, for below the grid. */
  points?: WorldNowPoints
}

export interface WorldNowPoints {
  tileDegrees: number
  tilesX: number
  tilesY: number
  recordBytes: number
  dayZero: string
  count: number
  tiles: string[]
}

/**
 * The last day of the snapshot that is actually finished.
 *
 * A day counts as finished if it holds at least two fifths of what a typical
 * day of the window holds. The threshold is loose on purpose: fire varies
 * enormously day to day, and the thing being detected here is a truncated
 * file, not a quiet Tuesday.
 */
export function lastCompleteDay(meta: WorldNowMeta): number {
  const days = meta.fine?.days ?? 0
  const totals = meta.dayTotals
  let last = Math.max(0, days - 1)
  if (!totals || totals.length !== days || days < 2) return last
  const sorted = [...totals].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  while (last > 0 && totals[last] < median * 0.4) last--
  return last
}

export async function loadWorldNow(base = '/data/world'): Promise<{ cells: WorldCell[]; meta: WorldNowMeta }> {
  const [metaRes, binRes] = await Promise.all([fetch(`${base}/now.json`), fetch(`${base}/now.bin`)])
  if (!metaRes.ok || !binRes.ok) throw new Error('world now: not available')
  const meta = (await metaRes.json()) as WorldNowMeta
  const view = new DataView(await binRes.arrayBuffer())

  const n = view.getUint32(0, true)
  const cells: WorldCell[] = []
  for (let k = 0; k < n; k++) {
    const at = 4 + k * 16
    const cell = view.getUint32(at, true)
    const value = view.getUint32(at + 4, true) + view.getUint32(at + 8, true)
    const row = Math.floor(cell / meta.cols)
    const col = cell % meta.cols
    cells.push({
      lat: row * meta.degrees - 90 + meta.degrees / 2,
      lon: col * meta.degrees - 180 + meta.degrees / 2,
      value,
    })
  }
  return { cells, meta }
}

/* -------------------------------------------------------------------------- *
 * The finest level, which is tiled.
 *
 * L0 and L1 are a file a year and the page takes the whole planet whether it
 * is looking at it or not — at those resolutions that is a megabyte or two,
 * and not worth the complication. At a twentieth of a degree a year is five
 * megabytes and twenty-five times as many cells, and downloading Siberia to
 * look at the Fergana valley stops being reasonable.
 *
 * So this level is cut into 20° squares and the page fetches the two or three
 * its viewport touches. Tiles are kept once decoded: panning back and forth
 * across a boundary is the normal way to read a map and must not re-fetch.
 * -------------------------------------------------------------------------- */

export interface WorldTileIndex {
  degrees: number
  cols: number
  tileDegrees: number
  tileCells: number
  tilesX: number
  tilesY: number
  /** Eight bytes at the finest level, twelve at the one above it. */
  recordBytes?: number
  /** Which tiles hold anything, per year, so nothing is asked for in vain. */
  years: Record<string, string[]>
}

const tileIndexes = new Map<TiledLevel, Promise<WorldTileIndex>>()

export async function loadWorldTileIndex(
  level: TiledLevel,
  base = '/data/world',
): Promise<WorldTileIndex> {
  let held = tileIndexes.get(level)
  if (!held) {
    held = fetch(`${base}/${level}-index.json`).then(async (res) => {
      if (!res.ok) throw new Error(`${level} index: HTTP ${res.status}`)
      return (await res.json()) as WorldTileIndex
    })
    held.catch(() => tileIndexes.delete(level))
    tileIndexes.set(level, held)
  }
  return held
}

/**
 * Tiles already asked for, by the request rather than the answer.
 *
 * Holding the decoded tile is not enough: a settled zoom and a settled move
 * arrive together and both call this before either has finished, so the same
 * file went out twice. Holding the promise means the second caller waits on
 * the first request instead of making its own.
 */
const tiles = new Map<string, Promise<WorldMonth>>()

/**
 * Gzip on the wire, unpacked here.
 *
 * The tiles are stored compressed rather than raw — counts go about three to
 * one — because at this level that is the difference between a repository
 * that can be cloned and one that cannot. Every browser that can run the rest
 * of this page has `DecompressionStream`.
 */
async function loadTile(
  url: string,
  tileCells: number,
  cols: number,
  tx: number,
  ty: number,
  recordBytes: number,
): Promise<WorldMonth> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status)

  /**
   * Unpack it here, unless the server already did.
   *
   * A `.gz` file is served raw by some hosts and with `Content-Encoding: gzip`
   * by others, and in the second case the browser has already unpacked it by
   * the time this sees it. Decompressing unconditionally therefore works in
   * development and fails in production, or the other way round. The bytes
   * themselves say which happened — a gzip member begins 1f 8b — so ask them
   * rather than the host.
   */
  let raw = await res.arrayBuffer()
  const head = new Uint8Array(raw, 0, Math.min(2, raw.byteLength))
  if (head[0] === 0x1f && head[1] === 0x8b) {
    raw = await new Response(
      new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer()
  }

  const view = new DataView(raw)
  const n = view.getUint32(0, true)
  const cell = new Uint32Array(n)
  const modis = new Uint32Array(n)
  const viirs = new Uint32Array(n)

  // A record carries the cell's index inside its own tile; the rest of the app
  // speaks in global cells, so the tile's corner is added back here.
  const rowFrom = ty * tileCells
  const colFrom = tx * tileCells
  // The coarser tiled level counts a whole year into 32 bits; the finer one
  // covers a square kilometre, where sixteen is plenty and the file is a
  // third smaller for it.
  const wide = recordBytes >= 12
  for (let k = 0; k < n; k++) {
    const at = 4 + k * recordBytes
    const local = view.getUint32(at, true)
    const r = (local / tileCells) | 0
    const c = local - r * tileCells
    cell[k] = (rowFrom + r) * cols + (colFrom + c)
    modis[k] = wide ? view.getUint32(at + 4, true) : view.getUint16(at + 4, true)
    viirs[k] = wide ? view.getUint32(at + 8, true) : view.getUint16(at + 6, true)
  }
  return { cell, modis, viirs, frp: new Float32Array(0) }
}

/**
 * Everything at the finest level inside a box, shaped like a year.
 *
 * The result has one slot rather than twelve: the fold drops the month at this
 * level, because nothing reads a month here — you arrive by zooming a map that
 * is already showing one year — and dropping it collapses a cell that burned in
 * March and again in September into one record instead of two. `worldCells`
 * sums whatever slots it is handed, so one is as welcome as twelve.
 */
export async function loadWorldPatch(
  year: number,
  box: { west: number; south: number; east: number; north: number },
  level: TiledLevel = 'l2',
  base = '/data/world',
): Promise<WorldYear> {
  const idx = await loadWorldTileIndex(level, base)
  const have = new Set(idx.years[String(year)] ?? [])
  if (!have.size) return []

  const step = idx.tileDegrees
  // East may run past 180° when the view straddles the date line, so the
  // column walks on and is wrapped back into the grid rather than cut short.
  const x0 = Math.floor((box.west + 180) / step)
  const x1 = Math.min(x0 + idx.tilesX - 1, Math.floor((box.east + 180) / step))
  const y0 = Math.max(0, Math.floor((box.south + 90) / step))
  const y1 = Math.min(idx.tilesY - 1, Math.floor((box.north + 90) / step))

  const wanted: Array<Promise<WorldMonth>> = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let i = x0; i <= x1; i++) {
      const tx = ((i % idx.tilesX) + idx.tilesX) % idx.tilesX
      const key = tx + '-' + ty
      if (!have.has(key)) continue
      const id = level + ':' + year + ':' + key
      let held = tiles.get(id)
      if (!held) {
        const url = `${base}/${level}/${year}/${key}.bin.gz`
        held = loadTile(url, idx.tileCells, idx.cols, tx, ty, idx.recordBytes ?? 12)
        // A tile that failed must not be remembered as failed for ever.
        held.catch(() => tiles.delete(id))
        tiles.set(id, held)
      }
      wanted.push(held)
    }
  }
  return Promise.all(wanted)
}

/* -------------------------------------------------------------------------- *
 * A day at a time, for anywhere.
 *
 * The pyramid answers "where" and keeps months or years; the ribbon asks
 * "when does it burn here" and needs every day of every year for one box.
 * That is a different product, cut into 10° squares and grouped by decade, so
 * a city costs three files and a country a dozen.
 * -------------------------------------------------------------------------- */

export interface WorldDaysIndex {
  degrees: number
  cols: number
  tileDegrees: number
  tileCells: number
  tilesX: number
  tilesY: number
  firstYear: number
  lastYear: number
  /** Which decades each tile holds, so nothing is fetched in vain. */
  tiles: Record<string, number[]>
}

/** One tile-decade, decoded: parallel arrays per year, nothing per record. */
interface DayChunk {
  years: Array<{ year: number; cell: Uint16Array; day: Uint16Array; modis: Uint16Array; viirs: Uint16Array }>
}

let daysIndex: WorldDaysIndex | null = null
let daysIndexWanted: Promise<WorldDaysIndex | null> | null = null

export async function loadWorldDaysIndex(base = '/data/world'): Promise<WorldDaysIndex | null> {
  if (daysIndex) return daysIndex
  daysIndexWanted ??= fetch(base + '/days-index.json')
    .then(async (res) => {
      if (!res.ok) return null
      daysIndex = (await res.json()) as WorldDaysIndex
      return daysIndex
    })
    .catch(() => null)
  return daysIndexWanted
}

const dayChunks = new Map<string, Promise<DayChunk>>()

async function loadDayChunk(url: string): Promise<DayChunk> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status)
  // Same reasoning as the finest level: some hosts hand back `.gz` untouched
  // and some unpack it on the way, and the first two bytes say which.
  let raw = await res.arrayBuffer()
  const head = new Uint8Array(raw, 0, Math.min(2, raw.byteLength))
  if (head[0] === 0x1f && head[1] === 0x8b) {
    raw = await new Response(
      new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer()
  }

  const view = new DataView(raw)
  const count = view.getUint16(0, true)
  const years: DayChunk['years'] = []
  let p = 2
  for (let y = 0; y < count; y++) {
    const year = view.getUint16(p, true)
    const n = view.getUint32(p + 2, true)
    p += 6
    const cell = new Uint16Array(n)
    const day = new Uint16Array(n)
    const modis = new Uint16Array(n)
    const viirs = new Uint16Array(n)
    for (let k = 0; k < n; k++) {
      const at = p + k * 8
      cell[k] = view.getUint16(at, true)
      day[k] = view.getUint16(at + 2, true)
      modis[k] = view.getUint16(at + 4, true)
      viirs[k] = view.getUint16(at + 6, true)
    }
    p += n * 8
    years.push({ year, cell, day, modis, viirs })
  }
  return { years }
}

export interface PlaceDays {
  /** Day of year 1–366 per year, the two instrument families kept apart. */
  years: Map<number, { modis: Float64Array; viirs: Float64Array }>
  /** Cell size of the underlying grid, in degrees. */
  degrees: number
  /** How many of its cells the box actually covers. */
  cells: number
}

/**
 * The daily series for a box, summed out of whichever tiles it touches.
 *
 * A cell counts if its centre is inside the box — the same rule the map uses
 * for the figure under it, so the calendar and the caption cannot disagree.
 */
export async function loadPlaceDays(
  box: { west: number; south: number; east: number; north: number },
  base = '/data/world',
): Promise<PlaceDays | null> {
  const idx = await loadWorldDaysIndex(base)
  if (!idx) return null

  const step = idx.tileDegrees
  const x0 = Math.floor((box.west + 180) / step)
  const x1 = Math.min(x0 + idx.tilesX - 1, Math.floor((box.east + 180) / step))
  const y0 = Math.max(0, Math.floor((box.south + 90) / step))
  const y1 = Math.min(idx.tilesY - 1, Math.floor((box.north + 90) / step))

  const jobs: Array<Promise<{ tx: number; ty: number; chunk: DayChunk } | null>> = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let i = x0; i <= x1; i++) {
      const tx = ((i % idx.tilesX) + idx.tilesX) % idx.tilesX
      const key = tx + '-' + ty
      for (const decade of idx.tiles[key] ?? []) {
        const id = key + '-' + decade
        let held = dayChunks.get(id)
        if (!held) {
          held = loadDayChunk(base + '/days/' + id + '.bin.gz')
          held.catch(() => dayChunks.delete(id))
          dayChunks.set(id, held)
        }
        // A tile that will not load must not take the calendar with it: the
        // rest of the box still has something to say, and a half-built deploy
        // should degrade to fewer cells rather than to no panel at all.
        jobs.push(held.then((chunk) => ({ tx, ty, chunk })).catch(() => null))
      }
    }
  }
  if (!jobs.length) return null

  const deg = idx.degrees
  const half = deg / 2
  const years = new Map<number, { modis: Float64Array; viirs: Float64Array }>()
  const inside = new Set<number>()

  const loaded = (await Promise.all(jobs)).filter((j): j is { tx: number; ty: number; chunk: DayChunk } => j !== null)
  if (!loaded.length) return null
  for (const { tx, ty, chunk } of loaded) {
    const rowFrom = ty * idx.tileCells
    const colFrom = tx * idx.tileCells
    for (const y of chunk.years) {
      let row = years.get(y.year)
      if (!row) {
        row = { modis: new Float64Array(367), viirs: new Float64Array(367) }
        years.set(y.year, row)
      }
      for (let k = 0; k < y.cell.length; k++) {
        const local = y.cell[k]
        const r = (local / idx.tileCells) | 0
        const c = local - r * idx.tileCells
        const lat = (rowFrom + r) * deg - 90 + half
        const lon = (colFrom + c) * deg - 180 + half
        if (lat < box.south || lat > box.north || lon < box.west || lon > box.east) continue
        inside.add((rowFrom + r) * idx.cols + (colFrom + c))
        const d = y.day[k] + 1
        if (d < 1 || d > 366) continue
        row.modis[d] += y.modis[k]
        row.viirs[d] += y.viirs[k]
      }
    }
  }

  // Every year of the record gets a row, even an empty one: a gap in the
  // ribbon should read as "nothing burned", not as "no data for this year".
  for (let y = idx.firstYear; y <= idx.lastYear; y++) {
    if (!years.has(y)) years.set(y, { modis: new Float64Array(367), viirs: new Float64Array(367) })
  }

  return { years, degrees: deg, cells: inside.size }
}

/* -------------------------------------------------------------------------- *
 * The week, close up.
 *
 * The coarse snapshot is one file for the planet and right for that job. Over
 * a city it is neither fine enough nor specific enough: a 25 km square reads
 * as the city burning when a field twenty kilometres away is alight, and seven
 * days folded into one number cannot be compared with what FIRMS shows for
 * today — which is the first thing anyone will do.
 *
 * So a framed area reads the fine tiles instead: a twentieth of a degree, with
 * the day kept, and only the two or three squares the frame touches.
 * -------------------------------------------------------------------------- */

export interface NowCell {
  lat: number
  lon: number
  /** Days since `dayZero`. */
  day: number
  modis: number
  viirs: number
}

const nowTiles = new Map<string, Promise<NowCell[]>>()

async function loadNowTile(url: string, fine: WorldNowFine, tx: number, ty: number): Promise<NowCell[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status)
  let raw = await res.arrayBuffer()
  const head = new Uint8Array(raw, 0, Math.min(2, raw.byteLength))
  if (head[0] === 0x1f && head[1] === 0x8b) {
    raw = await new Response(
      new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer()
  }

  const view = new DataView(raw)
  const n = view.getUint32(0, true)
  const out: NowCell[] = []
  const rowFrom = ty * fine.tileCells
  const colFrom = tx * fine.tileCells
  const half = fine.degrees / 2
  for (let k = 0; k < n; k++) {
    const at = 4 + k * 10
    const local = view.getUint32(at, true)
    const r = (local / fine.tileCells) | 0
    const c = local - r * fine.tileCells
    out.push({
      lat: (rowFrom + r) * fine.degrees - 90 + half,
      lon: (colFrom + c) * fine.degrees - 180 + half,
      day: view.getUint8(at + 4),
      modis: view.getUint16(at + 6, true),
      viirs: view.getUint16(at + 8, true),
    })
  }
  return out
}

/** Every fine record of the week inside a box, days and all. */
export async function loadNowPatch(
  fine: WorldNowFine,
  box: { west: number; south: number; east: number; north: number },
  base = '/data/world',
): Promise<NowCell[]> {
  const have = new Set(fine.tiles)
  const step = fine.tileDegrees
  const x0 = Math.floor((box.west + 180) / step)
  const x1 = Math.min(x0 + fine.tilesX - 1, Math.floor((box.east + 180) / step))
  const y0 = Math.max(0, Math.floor((box.south + 90) / step))
  const y1 = Math.min(fine.tilesY - 1, Math.floor((box.north + 90) / step))

  const jobs: Array<Promise<NowCell[]>> = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let i = x0; i <= x1; i++) {
      const tx = ((i % fine.tilesX) + fine.tilesX) % fine.tilesX
      const key = `${tx}-${ty}`
      if (!have.has(key)) continue
      let held = nowTiles.get(key)
      if (!held) {
        held = loadNowTile(`${base}/now/${key}.bin.gz`, fine, tx, ty)
        held.catch(() => nowTiles.delete(key))
        nowTiles.set(key, held)
      }
      jobs.push(held)
    }
  }
  const parts = await Promise.all(jobs)
  return parts.flat()
}

/* -------------------------------------------------------------------------- *
 * The week as detections, not as a grid.
 *
 * Below about a kilometre a grid stops meaning anything — a MODIS pixel is a
 * kilometre at nadir and spreads past five at the swath edge — so the honest
 * thing at that zoom is the detection itself: where the satellite looked, when
 * it passed, how much power it saw. Only the live week is kept this way; the
 * whole archive as points is several gigabytes and would stop being a site.
 * -------------------------------------------------------------------------- */

export interface FirePoint {
  lat: number
  lon: number
  /** Minutes past midnight, UTC. */
  minute: number
  /** Megawatts. */
  frp: number
  /** Days since `dayZero`. */
  day: number
  /** True for the 375 m instrument family. */
  viirs: boolean
  /** 0 low, 1 nominal, 2 high — the two scales flattened into one. */
  confidence: number
}

const pointTiles = new Map<string, Promise<FirePoint[]>>()

async function loadPointTile(url: string, meta: WorldNowPoints, tx: number, ty: number): Promise<FirePoint[]> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status)
  let raw = await res.arrayBuffer()
  const head = new Uint8Array(raw, 0, Math.min(2, raw.byteLength))
  if (head[0] === 0x1f && head[1] === 0x8b) {
    raw = await new Response(
      new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).arrayBuffer()
  }

  const view = new DataView(raw)
  const n = view.getUint32(0, true)
  const step = meta.tileDegrees
  const west = tx * step - 180
  const south = ty * step - 90
  const out: FirePoint[] = new Array(n)
  for (let k = 0; k < n; k++) {
    const at = 4 + k * meta.recordBytes
    const flags = view.getUint8(at + 9)
    out[k] = {
      lat: south + (view.getUint16(at, true) / 65535) * step,
      lon: west + (view.getUint16(at + 2, true) / 65535) * step,
      minute: view.getUint16(at + 4, true),
      frp: view.getUint16(at + 6, true),
      day: view.getUint8(at + 8),
      viirs: (flags & 1) === 1,
      confidence: (flags >> 2) & 3,
    }
  }
  return out
}

/** Every detection of the week inside a box. */
export async function loadNowPoints(
  meta: WorldNowPoints,
  box: { west: number; south: number; east: number; north: number },
  base = '/data/world',
): Promise<FirePoint[]> {
  const have = new Set(meta.tiles)
  const step = meta.tileDegrees
  const x0 = Math.floor((box.west + 180) / step)
  const x1 = Math.min(x0 + meta.tilesX - 1, Math.floor((box.east + 180) / step))
  const y0 = Math.max(0, Math.floor((box.south + 90) / step))
  const y1 = Math.min(meta.tilesY - 1, Math.floor((box.north + 90) / step))

  const jobs: Array<Promise<FirePoint[]>> = []
  for (let ty = y0; ty <= y1; ty++) {
    for (let i = x0; i <= x1; i++) {
      const tx = ((i % meta.tilesX) + meta.tilesX) % meta.tilesX
      const key = `${tx}-${ty}`
      if (!have.has(key)) continue
      let held = pointTiles.get(key)
      if (!held) {
        held = loadPointTile(`${base}/points/${key}.bin.gz`, meta, tx, ty)
        held.catch(() => pointTiles.delete(key))
        pointTiles.set(key, held)
      }
      jobs.push(held.catch(() => []))
    }
  }
  return (await Promise.all(jobs)).flat()
}
