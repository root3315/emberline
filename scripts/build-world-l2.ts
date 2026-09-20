/**
 * The third level of the pyramid: twentieth-degree cells, for when the camera
 * is over a district rather than a country.
 *
 * L0 is a degree and L1 a quarter of one, which is about 25 km — enough for a
 * country and far too coarse once someone zooms into the valley they live in,
 * where a 25 km plate covers the whole view and says only "somewhere near
 * here". At 0.05° a cell is about 5.5 km, roughly what a MODIS pixel sees, so
 * this is as fine as the coarser of the two instruments can honestly be drawn.
 *
 * Two things had to change to make that level affordable, and both come from
 * the same fact: twenty-five times as many cells.
 *
 *   No months. L0 and L1 keep twelve slots a year because the ribbon and the
 *   season chart read them. Nothing reads a month at this level — you only
 *   arrive here by zooming a map that is already showing a year — and dropping
 *   the month collapses every cell that burned in March and again in September
 *   into one record instead of two.
 *
 *   Tiles. A year at this resolution is tens of megabytes, which is neither a
 *   file a static host will serve nor a download anyone should make to look at
 *   one district. The globe is cut into 20° squares and the page fetches the
 *   two or three its viewport touches.
 *
 * The files are gzipped on disk rather than left raw. Counts compress about
 * three to one, and at this level that is the difference between a repository
 * that can be cloned and one that cannot.
 *
 *   npx tsx scripts/build-world-l2.ts [cacheDir] [firstYear] [lastYear]
 */

import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'

const CACHE = process.argv[2] ?? process.env.FIRMS_CACHE_DIR ?? 'data/cache'
const DIR = `${CACHE}/world`
const OUT = 'public/data/world/l2'
const INDEX = 'public/data/world/l2-index.json'

const DEG = 0.05
const COLS = Math.round(360 / DEG)
const ROWS = Math.round(180 / DEG)
const CELLS = COLS * ROWS

/** A tile is 20° square — 400 × 400 cells, and eighteen by nine of them. */
const TILE_DEG = 20
const TILE = Math.round(TILE_DEG / DEG)
const TX = Math.round(360 / TILE_DEG)
const TY = Math.round(180 / TILE_DEG)

const BASE_YEAR = Number(process.argv[3] ?? 2000)
const LAST_YEAR = Number(process.argv[4] ?? new Date().getUTCFullYear())

/** One year of counts, and only one year: 26M cells × two arrays is 207 MB. */
const modis = new Uint32Array(CELLS)
const viirs = new Uint32Array(CELLS)
let foldYear = 0

const COMMA = 0x2c
const NL = 0x0a
const MINUS = 0x2d
const DOT = 0x2e
const ZERO = 0x30

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
 * One window's detections, added to the year.
 *
 * The same byte walk as the coarser levels, and the same two column layouts:
 * the science products end with `type` and the near-real-time ones do not, so
 * a row with thirteen commas is taken as it comes and one with fourteen is
 * filtered down to `type` 0, a presumed vegetation fire. Demanding fourteen is
 * what once emptied three months of the global record in silence.
 */
function foldWindow(buf: Buffer, stats: { rows: number; kept: number }): void {
  const len = buf.length
  let i = 0
  while (i < len && buf[i] !== NL) i++
  i++

  const field = new Int32Array(16)
  while (i < len) {
    let n = 0
    field[0] = i
    let j = i
    while (j < len && buf[j] !== NL) {
      if (buf[j] === COMMA && n < 15) field[++n] = j + 1
      j++
    }
    if (n < 13) {
      i = j + 1
      continue
    }
    stats.rows++
    if (n >= 14 && readInt(buf, field[14], j) !== 0) {
      i = j + 1
      continue
    }

    if (readInt(buf, field[5], field[5] + 4) !== foldYear) {
      i = j + 1
      continue
    }

    const lat = readFloat(buf, field[0], field[1] - 1)
    const lon = readFloat(buf, field[1], field[2] - 1)

    let row = Math.floor((lat + 90) / DEG)
    let col = Math.floor((lon + 180) / DEG)
    if (row < 0) row = 0
    else if (row >= ROWS) row = ROWS - 1
    if (col < 0) col = 0
    else if (col >= COLS) col = COLS - 1

    const slot = row * COLS + col
    if (buf[field[8]] === 0x4d) modis[slot]++
    else viirs[slot]++
    stats.kept++
    i = j + 1
  }
}

/**
 * The year's tiles.
 *
 * A record's index is the cell *within its tile* — nought to a hundred and
 * sixty thousand — so the page never has to know where a tile sits to read it,
 * and the number stays small enough to compress well.
 */
const REC = 12

async function writeYear(year: number): Promise<{ tiles: string[]; bytes: number; records: number }> {
  const tiles: string[] = []
  let bytes = 0
  let records = 0
  await mkdir(`${OUT}/${year}`, { recursive: true })

  for (let ty = 0; ty < TY; ty++) {
    for (let tx = 0; tx < TX; tx++) {
      const rowFrom = ty * TILE
      const colFrom = tx * TILE

      let n = 0
      for (let r = 0; r < TILE; r++) {
        const base = (rowFrom + r) * COLS + colFrom
        for (let c = 0; c < TILE; c++) {
          if (modis[base + c] !== 0 || viirs[base + c] !== 0) n++
        }
      }
      if (n === 0) continue

      const out = Buffer.allocUnsafe(4 + n * REC)
      out.writeUInt32LE(n, 0)
      let p = 4
      for (let r = 0; r < TILE; r++) {
        const base = (rowFrom + r) * COLS + colFrom
        for (let c = 0; c < TILE; c++) {
          const m = modis[base + c]
          const v = viirs[base + c]
          if (m === 0 && v === 0) continue
          out.writeUInt32LE(r * TILE + c, p)
          out.writeUInt32LE(m, p + 4)
          out.writeUInt32LE(v, p + 8)
          p += REC
        }
      }

      const gz = gzipSync(out, { level: 9 })
      await writeFile(`${OUT}/${year}/${tx}-${ty}.bin.gz`, gz)
      tiles.push(`${tx}-${ty}`)
      bytes += gz.length
      records += n
    }
  }

  return { tiles, bytes, records }
}

async function main(): Promise<void> {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.csv.gz'))
  if (!files.length) {
    console.error(`No windows in ${DIR}`)
    process.exit(1)
  }
  await mkdir(OUT, { recursive: true })

  const startOf = new Map<string, string>()
  for (const f of files) {
    const m = /-(\d{4}-\d{2}-\d{2})-[0-9a-f]+\.csv\.gz$/.exec(f)
    if (m) startOf.set(f, m[1])
  }

  const stats = { rows: 0, kept: 0 }
  const t0 = Date.now()
  const years: Record<string, string[]> = {}
  let total = 0
  let records = 0

  for (let year = BASE_YEAR; year <= LAST_YEAR; year++) {
    foldYear = year
    modis.fill(0)
    viirs.fill(0)

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
    years[String(year)] = r.tiles
    total += r.bytes
    records += r.records
    process.stdout.write(
      `  ${year}  ${mine.length} windows  ${r.records.toLocaleString('en')} cells  ` +
        `${r.tiles.length} tiles  ${(r.bytes / 1048576).toFixed(1)} MB  ` +
        `${((Date.now() - t0) / 1000).toFixed(0)}s\n`,
    )
  }

  await writeFile(
    INDEX,
    JSON.stringify(
      {
        level: 'L2',
        degrees: DEG,
        cols: COLS,
        rows: ROWS,
        tileDegrees: TILE_DEG,
        tileCells: TILE,
        tilesX: TX,
        tilesY: TY,
        recordBytes: REC,
        fields: ['cell', 'modis', 'viirs'],
        gzipped: true,
        // Only the tiles that hold something, so the page never asks for a
        // file that is not there and never waits on a 404 to find out.
        years,
        builtAt: new Date().toISOString(),
        detections: stats.kept,
      },
      null,
      2,
    ) + '\n',
  )

  process.stdout.write(
    `\n${records.toLocaleString('en')} cells → ${(total / 1048576).toFixed(1)} MB gzipped\n` +
      `${((Date.now() - t0) / 1000).toFixed(0)}s total\n`,
  )
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
