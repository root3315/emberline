/**
 * Folds the global cache into the overview grid the browser can actually open.
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
 *   npx tsx scripts/build-world-l0.ts [cacheDir]
 */

import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const CACHE = process.argv[2] ?? process.env.FIRMS_CACHE_DIR ?? 'data/cache'
const DIR = `${CACHE}/world`
const OUT = 'public/data/world'

/** Degrees per cell. One is the coarsest useful view of a planet. */
const COLS = 360
const ROWS = 180
const CELLS = COLS * ROWS

/** The record starts with MODIS Terra. */
const BASE_YEAR = 2000
const BASE_MONTH = 11

function monthIndex(year: number, month: number): number {
  return (year - BASE_YEAR) * 12 + (month - 1) - (BASE_MONTH - 1)
}

const LAST_YEAR = new Date().getUTCFullYear()
const MONTHS = monthIndex(LAST_YEAR + 1, 1)

/**
 * Radiative power per year, kept apart by instrument.
 *
 * The grid sums the two families into one power figure, which is right for
 * drawing and wrong for arithmetic: the combined series jumps in 2012 when
 * VIIRS arrives and again in 2018 and 2024 as more satellites join, and any
 * quantity derived from it inherits those steps as if the planet had caught
 * fire on those dates. An emissions estimate in particular has to run on one
 * consistent pair of instruments, so MODIS is kept on its own — Terra from
 * 2000, Aqua from mid-2002, and nothing added since.
 *
 * Only the annual totals, not a grid: this exists to be divided and scaled,
 * never to be drawn.
 */
const frpModisYear = new Float64Array(LAST_YEAR - BASE_YEAR + 1)
const frpViirsYear = new Float64Array(LAST_YEAR - BASE_YEAR + 1)

/**
 * The accumulator: three flat arrays over cell × month.
 *
 * Twenty million slots each. Counts are 32-bit because a hot degree-cell in
 * the Cerrado or the Congo passes sixty-five thousand detections in a month
 * without difficulty, and a silent overflow there would quietly cap exactly
 * the places the map exists to show.
 */
const modis = new Uint32Array(CELLS * MONTHS)
const viirs = new Uint32Array(CELLS * MONTHS)
const frp = new Float32Array(CELLS * MONTHS)

/**
 * The planet's day, with no map attached.
 *
 * The ribbon — year down, day across — is the one view this project is really
 * about, and it needs daily numbers, which the monthly grid above cannot give.
 * But it does not need them *per cell*: the whole ribbon is one value a day
 * for the entire surface. That is nine and a half thousand numbers for
 * twenty-six years, which costs nothing to accumulate here and a hundred
 * kilobytes to ship, instead of the daily grid it looks like it would need.
 */
const DAY_EPOCH = Date.UTC(BASE_YEAR, BASE_MONTH - 1, 1)
const DAYS = Math.ceil((Date.now() - DAY_EPOCH) / 86_400_000) + 2
const dayModis = new Uint32Array(DAYS)
const dayViirs = new Uint32Array(DAYS)
const dayFrp = new Float32Array(DAYS)

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
    const dom = readInt(buf, field[5] + 8, field[5] + 10)

    const mi = monthIndex(year, month)
    if (mi < 0 || mi >= MONTHS) {
      i = j + 1
      continue
    }

    let row = Math.floor(lat + 90)
    let col = Math.floor(lon + 180)
    if (row < 0) row = 0
    else if (row >= ROWS) row = ROWS - 1
    if (col < 0) col = 0
    else if (col >= COLS) col = COLS - 1

    const slot = mi * CELLS + row * COLS + col
    const di = Math.round((Date.UTC(year, month - 1, dom) - DAY_EPOCH) / 86_400_000)
    const power = readFloat(buf, field[12], field[13] - 1)
    // Instrument is the only thing distinguishing the two families here, and
    // its first byte is enough: MODIS or VIIRS.
    if (buf[field[8]] === 0x4d) {
      modis[slot]++
      if (di >= 0 && di < DAYS) dayModis[di]++
    } else {
      viirs[slot]++
      if (di >= 0 && di < DAYS) dayViirs[di]++
    }
    frp[slot] += power
    if (di >= 0 && di < DAYS) dayFrp[di] += power
    const yi = year - BASE_YEAR
    if (yi >= 0 && yi < frpModisYear.length) {
      if (buf[field[8]] === 0x4d) frpModisYear[yi] += power
      else frpViirsYear[yi] += power
    }
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

async function writeYear(year: number): Promise<{ bytes: number; records: number }> {
  const months: Array<{ mi: number; cells: number[] }> = []
  let records = 0

  for (let m = 1; m <= 12; m++) {
    const mi = monthIndex(year, m)
    const cells: number[] = []
    if (mi >= 0 && mi < MONTHS) {
      const base = mi * CELLS
      for (let c = 0; c < CELLS; c++) {
        if (modis[base + c] !== 0 || viirs[base + c] !== 0) cells.push(c)
      }
    }
    records += cells.length
    months.push({ mi, cells })
  }

  const size = 12 * 4 + records * REC
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

  await writeFile(`${OUT}/l0-${year}.bin`, out)
  return { bytes: size, records }
}

async function main(): Promise<void> {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.csv.gz'))
  if (!files.length) {
    console.error(`No windows in ${DIR}`)
    process.exit(1)
  }
  process.stdout.write(`Folding ${files.length} windows from ${DIR}\n`)

  const stats = { rows: 0, kept: 0 }
  const t0 = Date.now()
  let done = 0
  let bytesIn = 0

  for (const f of files) {
    const raw = readFileSync(`${DIR}/${f}`)
    bytesIn += raw.length
    foldWindow(gunzipSync(raw), stats)
    done++
    if (done % 50 === 0 || done === files.length) {
      const secs = (Date.now() - t0) / 1000
      process.stdout.write(
        `\r  ${done}/${files.length}  ${(stats.rows / 1e6).toFixed(0)}M rows  ` +
          `${(bytesIn / 1048576 / secs).toFixed(1)} MB/s  ${secs.toFixed(0)}s   `,
      )
    }
  }
  process.stdout.write('\n')

  await mkdir(OUT, { recursive: true })
  let total = 0
  let records = 0
  const index: Array<{ year: number; bytes: number; records: number }> = []
  for (let y = BASE_YEAR; y <= LAST_YEAR; y++) {
    const r = await writeYear(y)
    if (r.records === 0) continue
    total += r.bytes
    records += r.records
    index.push({ year: y, ...r })
  }

  /**
   * Totals per year and per month, folded into the index.
   *
   * Without these, the annual chart and the seasonal curve would each need
   * every year's grid — thirty-three megabytes fetched before the page could
   * say anything at all, to draw two small figures. Summed here they are
   * about a thousand numbers, they ride along with the index the page already
   * loads, and the heavy per-cell file is only touched for the one year
   * actually on the map.
   *
   * Split by instrument for the same reason the grid is: the two disagreeing
   * is the subject, and a reader has to be able to take the planet's season
   * from the finer sensor alone and see that it is not the same curve.
   */
  const totals: Array<{
    year: number
    modis: number
    viirs: number
    frp: number
    /** The same power, split, because only one family runs the whole record. */
    frpModis: number
    frpViirs: number
  }> = []
  const seasons: Array<{ year: number; modis: number[]; viirs: number[] }> = []
  for (let y = BASE_YEAR; y <= LAST_YEAR; y++) {
    let ym = 0
    let yv = 0
    let yf = 0
    const mm: number[] = new Array(12).fill(0)
    const mv: number[] = new Array(12).fill(0)
    for (let m = 1; m <= 12; m++) {
      const mi = monthIndex(y, m)
      if (mi < 0 || mi >= MONTHS) continue
      const base = mi * CELLS
      for (let c = 0; c < CELLS; c++) {
        const a = modis[base + c]
        const b = viirs[base + c]
        if (a === 0 && b === 0) continue
        mm[m - 1] += a
        mv[m - 1] += b
        ym += a
        yv += b
        yf += frp[base + c]
      }
    }
    if (ym + yv === 0) continue
    totals.push({
      year: y,
      modis: ym,
      viirs: yv,
      frp: Math.round(yf),
      frpModis: Math.round(frpModisYear[y - BASE_YEAR]),
      frpViirs: Math.round(frpViirsYear[y - BASE_YEAR]),
    })
    seasons.push({ year: y, modis: mm, viirs: mv })
  }

  /**
   * The daily series, one file, as plain arrays per year.
   *
   * Written apart from the index because the index is fetched to draw two
   * small charts and this is a hundred kilobytes — the ribbon asks for it only
   * when it is actually being drawn. Days with nothing are zeros rather than
   * gaps, so the reader can tell "nothing burned" from "nobody was looking"
   * by the sensor rail rather than by a hole in the array.
   */
  const daily: Record<string, { modis: number[]; viirs: number[] }> = {}
  for (let d = 0; d < DAYS; d++) {
    if (dayModis[d] === 0 && dayViirs[d] === 0) continue
    const date = new Date(DAY_EPOCH + d * 86_400_000)
    const y = String(date.getUTCFullYear())
    const start = Date.UTC(date.getUTCFullYear(), 0, 1)
    const idx = Math.round((date.getTime() - start) / 86_400_000)
    daily[y] ??= { modis: new Array(366).fill(0), viirs: new Array(366).fill(0) }
    daily[y].modis[idx] = dayModis[d]
    daily[y].viirs[idx] = dayViirs[d]
  }
  await writeFile(`${OUT}/l0-daily.json`, JSON.stringify({ years: daily }))

  await writeFile(
    `${OUT}/l0-index.json`,
    JSON.stringify(
      {
        level: 'L0',
        degrees: 1,
        cols: COLS,
        rows: ROWS,
        totals,
        seasons,
        recordBytes: REC,
        fields: ['cell', 'modis', 'viirs', 'frp'],
        years: index,
        builtAt: new Date().toISOString(),
        detections: stats.kept,
      },
      null,
      2,
    ) + '\n',
  )

  const secs = (Date.now() - t0) / 1000
  process.stdout.write(
    `\n${(stats.rows / 1e6).toFixed(1)}M rows read, ${(stats.kept / 1e6).toFixed(1)}M vegetation fires kept\n` +
      `${records.toLocaleString('en')} cell-months → ${(total / 1048576).toFixed(1)} MB across ${index.length} files\n` +
      `${secs.toFixed(0)}s total\n`,
  )
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
