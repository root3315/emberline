/**
 * The second level of the pyramid: quarter-degree cells, for when the camera
 * is over a country rather than the planet.
 *
 * The cache is ~10 GB of gzipped CSV — call it six hundred million detections.
 * No page opens that, and the limit is not the network but the memory of one
 * tab. So it collapses into a pyramid, the same way map tiles do: the further
 * out the camera, the coarser the cell. This builds the outermost level.
 *
 *   L0 — one degree (~110 km), one month per slot, the whole record.
 *
 * At that resolution the planet is 360 × 180 cells and the record is 311
 * months, which is twenty million slots — small enough to hold in memory as
 * flat typed arrays and write out in one pass.
 *
 * What a cell-month keeps is deliberately not a single number. MODIS and VIIRS
 * are counted apart, because the whole project is about the two of them
 * disagreeing and a reader must be able to see either alone; and the power is
 * summed, because "how many fires" and "how much fire" are different
 * questions that a season can answer in opposite directions.
 *
 *   npx tsx scripts/build-world-l1.ts [cacheDir]
 */

import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const CACHE = process.argv[2] ?? process.env.FIRMS_CACHE_DIR ?? 'data/cache'
const DIR = `${CACHE}/world`
const OUT = 'public/data/world'
const LEVEL = 'l1'

/**
 * Quarter-degree cells — the level the map switches to when you zoom in.
 *
 * L0's whole degree is right for a planet on one screen and absurd once the
 * camera is over a country: a single cell covers more ground than the screen
 * does, so the fires read as a handful of enormous tiles. At 0.25° there are
 * sixteen times as many cells and about 25 km each, which is where a fire
 * front starts looking like a front.
 *
 * Sixteen times the cells is not sixteen times the file: most of them are
 * empty at any resolution, because most of the planet is ocean, desert or ice.
 */
const DEG = 0.25
const COLS = Math.round(360 / DEG)
const ROWS = Math.round(180 / DEG)
const CELLS = COLS * ROWS

/** The record starts with MODIS Terra, in November 2000. */
const BASE_YEAR = 2000


const LAST_YEAR = new Date().getUTCFullYear()

/**
 * The accumulator: three flat arrays over cell × month.
 *
 * Twenty million slots each. Counts are 32-bit because a hot degree-cell in
 * the Cerrado or the Congo passes sixty-five thousand detections in a month
 * without difficulty, and a silent overflow there would quietly cap exactly
 * the places the map exists to show.
 */
/**
 * One year at a time, and only one year in memory.
 *
 * At a whole degree the entire record fits in flat arrays — twenty million
 * slots, a couple of hundred megabytes. At a quarter degree it is sixteen
 * times that: three and a half gigabytes, which this machine does not have
 * and which no build machine should be asked for either.
 *
 * So the pass is inverted. Each year gets its own arrays, the windows that
 * could touch it are read, the file is written and the memory is handed back.
 * A five-day window can straddle a new year, so the years either side of it
 * are both offered every window and the rows sort themselves out by date —
 * which costs a few duplicate reads out of three and a half thousand files
 * and saves the whole difficulty.
 */
const YEAR_SLOTS = CELLS * 12
const modis = new Uint32Array(YEAR_SLOTS)
const viirs = new Uint32Array(YEAR_SLOTS)
const frp = new Float32Array(YEAR_SLOTS)
let foldYear = 0

/* -------------------------------------------------------------------------- *
 * Parsing.
 *
 * Six hundred million rows is where the ordinary approach stops working:
 * `split(',')` on every line allocates sixteen strings per detection, which is
 * ten billion short-lived objects and hours of collection. So the buffer is
 * walked as bytes, fields are located by counting commas, and numbers are read
 * straight out of the bytes. Nothing becomes a string.
 * -------------------------------------------------------------------------- */

const COMMA = 0x2c
const NL = 0x0a
const MINUS = 0x2d
const DOT = 0x2e
const ZERO = 0x30

/** A signed decimal read directly from bytes; no substring, no `Number`. */
function readFloat(buf: Buffer, from: number, to: number): number {
  let i = from
  let sign = 1
  if (i < to && buf[i] === MINUS) {
    sign = -1
    i++
  }
  let whole = 0
  while (i < to) {
    const c = buf[i]
    if (c < ZERO || c > ZERO + 9) break
    whole = whole * 10 + (c - ZERO)
    i++
  }
  if (i >= to || buf[i] !== DOT) return sign * whole
  i++
  let frac = 0
  let scale = 1
  while (i < to) {
    const c = buf[i]
    if (c < ZERO || c > ZERO + 9) break
    frac = frac * 10 + (c - ZERO)
    scale *= 10
    i++
  }
  return sign * (whole + frac / scale)
}

function readInt(buf: Buffer, from: number, to: number): number {
  let n = 0
  for (let i = from; i < to; i++) {
    const c = buf[i]
    if (c < ZERO || c > ZERO + 9) break
    n = n * 10 + (c - ZERO)
  }
  return n
}

/**
 * One window's worth of detections, added to the grid.
 *
 * Columns, fixed across every FIRMS product:
 *   0 latitude · 1 longitude · 5 acq_date · 8 instrument · 12 frp · 14 type
 *
 * `type` 0 is a presumed vegetation fire; 1 is a volcano, 2 another static
 * source, 3 offshore. Only 0 belongs in a burning calendar — a gas flare burns
 * every day of the year and would forge a fire season out of industry.
 */
function foldWindow(buf: Buffer, stats: { rows: number; kept: number }): void {
  const len = buf.length
  let i = 0

  // Skip the header line.
  while (i < len && buf[i] !== NL) i++
  i++

  const field = new Int32Array(16)

  while (i < len) {
    // Locate the commas of this line, and its end.
    let n = 0
    field[0] = i
    let j = i
    while (j < len && buf[j] !== NL) {
      if (buf[j] === COMMA && n < 15) field[++n] = j + 1
      j++
    }
    /**
     * Two layouts, and the difference is one column at the end.
     *
     * The science products carry `type` — 0 a presumed vegetation fire, 1 a
     * volcano, 2 another static source, 3 offshore — and only 0 belongs in a
     * burning calendar, because a gas flare burns every day of the year and
     * would forge a season out of industry. The near-real-time products do not
     * classify at all and simply end at `daynight`, thirteen commas instead of
     * fourteen.
     *
     * Requiring fourteen therefore threw away every NRT row in silence. In the
     * global archive that was July, August and September 2026 — the three most
     * recent months, reading as zero fires on the whole planet. Nothing failed
     * and nothing was logged; the months were just empty.
     *
     * With no classification there is nothing to filter, so NRT rows are taken
     * as they come. That makes the newest months very slightly more inclusive
     * than the years before them, which is the honest trade and worth knowing.
     */
    if (n < 13) {
      i = j + 1
      continue
    }
    stats.rows++

    if (n >= 14 && readInt(buf, field[14], j) !== 0) {
      i = j + 1
      continue
    }

    const lat = readFloat(buf, field[0], field[1] - 1)
    const lon = readFloat(buf, field[1], field[2] - 1)
    const year = readInt(buf, field[5], field[5] + 4)
    const month = readInt(buf, field[5] + 5, field[5] + 7)

    if (year !== foldYear) {
      i = j + 1
      continue
    }
    const mi = month - 1

    let row = Math.floor((lat + 90) / DEG)
    let col = Math.floor((lon + 180) / DEG)
    if (row < 0) row = 0
    else if (row >= ROWS) row = ROWS - 1
    if (col < 0) col = 0
    else if (col >= COLS) col = COLS - 1

    const slot = mi * CELLS + row * COLS + col
    if (buf[field[8]] === 0x4d) modis[slot]++
    else viirs[slot]++
    frp[slot] += readFloat(buf, field[12], field[13] - 1)
    stats.kept++

    i = j + 1
  }
}

/* -------------------------------------------------------------------------- *
 * Writing.
 *
 * One file per year, because a year is what the reader scrubs through. Inside
 * it, twelve months, each a count followed by that many fixed-width records:
 *
 *   cell (u16 row, u16 col is wasteful; a single u32 index is not) · 4 bytes
 *   modis · 4    viirs · 4    frp · 4
 *
 * Sixteen bytes a record, and only cells that actually burned are written — at
 * one degree most of the planet is ocean or desert and stays empty all year.
 * -------------------------------------------------------------------------- */

const REC = 16

/**
 * A year, in four files.
 *
 * Not a stylistic choice: Cloudflare refuses a static asset over five
 * megabytes, and a busy year at a quarter degree is nearly eleven. Quarters
 * put the largest under three with room to spare, and they suit the reader
 * too — a season rarely spans the turn of a quarter, so a map of one is often
 * one file rather than four.
 *
 * Each file still starts with its months' counts, so the decoder does not
 * need to know which quarter it is holding.
 */
const QUARTER = 3

async function writeYear(year: number): Promise<{ bytes: number; records: number }> {
  let bytes = 0
  let records = 0

  for (let q = 0; q < 4; q++) {
    const months: Array<{ mi: number; cells: number[] }> = []
    let inQuarter = 0

    for (let k = 0; k < QUARTER; k++) {
      const mi = q * QUARTER + k
      const cells: number[] = []
      const base = mi * CELLS
      for (let c = 0; c < CELLS; c++) {
        if (modis[base + c] !== 0 || viirs[base + c] !== 0) cells.push(c)
      }
      inQuarter += cells.length
      months.push({ mi, cells })
    }

    const size = QUARTER * 4 + inQuarter * REC
    const out = Buffer.allocUnsafe(size)
    let p = 0
    for (const { mi, cells } of months) {
      out.writeUInt32LE(cells.length, p)
      p += 4
      const base = mi * CELLS
      for (const c of cells) {
        out.writeUInt32LE(c, p)
        out.writeUInt32LE(modis[base + c], p + 4)
        out.writeUInt32LE(viirs[base + c], p + 8)
        out.writeFloatLE(frp[base + c], p + 12)
        p += REC
      }
    }

    await writeFile(`${OUT}/${LEVEL}-${year}-q${q + 1}.bin`, out)
    bytes += size
    records += inQuarter
  }

  return { bytes, records }
}

async function main(): Promise<void> {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.csv.gz'))
  if (!files.length) {
    console.error(`No windows in ${DIR}`)
    process.exit(1)
  }
  await mkdir(OUT, { recursive: true })

  /** Which windows could hold a day of year Y: its own, and the tail of Y-1. */
  const startOf = new Map<string, string>()
  for (const f of files) {
    const m = /-(\d{4}-\d{2}-\d{2})-[0-9a-f]+\.csv\.gz$/.exec(f)
    if (m) startOf.set(f, m[1])
  }

  const stats = { rows: 0, kept: 0 }
  const t0 = Date.now()
  const index: Array<{ year: number; bytes: number; records: number }> = []
  let total = 0
  let records = 0

  for (let year = BASE_YEAR; year <= LAST_YEAR; year++) {
    foldYear = year
    modis.fill(0)
    viirs.fill(0)
    frp.fill(0)

    // A five-day window starting in late December carries days of the next
    // year, so the last week of the previous one is offered too.
    const from = `${year - 1}-12-25`
    const to = `${year}-12-31`
    const mine = files.filter((f) => {
      const d = startOf.get(f)
      return d !== undefined && d >= from && d <= to
    })

    for (const f of mine) foldWindow(gunzipSync(readFileSync(`${DIR}/${f}`)), stats)

    const r = await writeYear(year)
    if (r.records === 0) continue
    total += r.bytes
    records += r.records
    index.push({ year, ...r })
    process.stdout.write(
      `  ${year}  ${mine.length} windows  ${r.records.toLocaleString('en')} cells  ` +
        `${(r.bytes / 1048576).toFixed(1)} MB  ${((Date.now() - t0) / 1000).toFixed(0)}s
`,
    )
  }

  await writeFile(
    `${OUT}/${LEVEL}-index.json`,
    JSON.stringify(
      {
        level: 'L1',
        degrees: DEG,
        cols: COLS,
        rows: ROWS,
        recordBytes: REC,
        fields: ['cell', 'modis', 'viirs', 'frp'],
        // Four files a year, three months each, to stay under the asset limit.
        quarters: true,
        years: index,
        builtAt: new Date().toISOString(),
        detections: stats.kept,
      },
      null,
      2,
    ),
  )

  process.stdout.write(
    `
${records.toLocaleString('en')} cell-months → ${(total / 1048576).toFixed(1)} MB across ${index.length} files
` +
      `${((Date.now() - t0) / 1000).toFixed(0)}s total
`,
  )
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
