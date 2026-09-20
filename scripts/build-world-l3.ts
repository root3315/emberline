/**
 * The fourth level: hundredth-degree cells, which is where the sensors stop.
 *
 * L2 is 0.05° — about 5.5 km — and that is a plate once the camera is over a
 * city: a single cell covers a whole district, and on the satellite basemap it
 * is an opaque rectangle sitting on top of the streets it is supposed to be
 * describing. At 0.01° a cell is about 1.1 km, which is the MODIS footprint
 * itself, so this is the last level that means anything. Below it the grid
 * would be inventing detail the coarser of the two instruments never had.
 *
 * Two things had to change again, both from having twenty-five times the cells
 * of L2 and six hundred and forty-eight million of them in total.
 *
 *   No flat accumulator. L2 could keep two arrays over every cell on Earth;
 *   at this resolution that is five gigabytes. Instead every detection is
 *   packed into one sortable integer — `cell * 2 + sensor`, at most 1.3
 *   billion and so still a signed 32-bit int — the year's worth is sorted
 *   once, and equal neighbours are counted off in a single walk.
 *
 *   Smaller tiles. 10° squares rather than L2's 20°, because the download
 *   that matters here is one district and a hot 20° tile would be megabytes.
 *
 *   npx tsx scripts/build-world-l3.ts [cacheDir] [firstYear] [lastYear]
 */

import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'

const CACHE = process.argv[2] ?? process.env.FIRMS_CACHE_DIR ?? 'data/cache'
const DIR = `${CACHE}/world`
const OUT = 'public/data/world/l3'
const INDEX = 'public/data/world/l3-index.json'

const DEG = 0.01
const COLS = Math.round(360 / DEG)
const ROWS = Math.round(180 / DEG)

const TILE_DEG = 10
const TILE = Math.round(TILE_DEG / DEG)
const TX = Math.round(360 / TILE_DEG)
const TY = Math.round(180 / TILE_DEG)

const BASE_YEAR = Number(process.argv[3] ?? 2000)
const LAST_YEAR = Number(process.argv[4] ?? new Date().getUTCFullYear())

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

let keys = new Int32Array(1 << 22)
let used = 0
let foldYear = 0

function push(key: number): void {
  if (used === keys.length) {
    const next = new Int32Array(keys.length * 2)
    next.set(keys)
    keys = next
  }
  keys[used++] = key
}

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

    push((row * COLS + col) * 2 + (buf[field[8]] === 0x4d ? 0 : 1))
    stats.kept++
    i = j + 1
  }
}

/** u32 cell within the tile, then the two instruments as u16 each. */
const REC = 8

async function writeYear(year: number): Promise<{ tiles: string[]; bytes: number; records: number }> {
  const sorted = keys.subarray(0, used)
  sorted.sort()
  await mkdir(`${OUT}/${year}`, { recursive: true })

  const counts = new Map<string, number>()
  let i = 0
  while (i < sorted.length) {
    const cell = (sorted[i] / 2) | 0
    let j = i
    while (j < sorted.length && ((sorted[j] / 2) | 0) === cell) j++
    const row = (cell / COLS) | 0
    const key = `${((cell - row * COLS) / TILE) | 0}-${(row / TILE) | 0}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    i = j
  }

  const bufs = new Map<string, Buffer>()
  const at = new Map<string, number>()
  for (const [key, n] of counts) {
    bufs.set(key, Buffer.allocUnsafe(n * REC))
    at.set(key, 0)
  }

  i = 0
  let records = 0
  while (i < sorted.length) {
    const cell = (sorted[i] / 2) | 0
    let modis = 0
    let viirs = 0
    let j = i
    while (j < sorted.length && ((sorted[j] / 2) | 0) === cell) {
      if (sorted[j] % 2 === 0) modis++
      else viirs++
      j++
    }

    const row = (cell / COLS) | 0
    const col = cell - row * COLS
    const key = `${(col / TILE) | 0}-${(row / TILE) | 0}`
    const buf = bufs.get(key)!
    const p = at.get(key)!
    buf.writeUInt32LE((row % TILE) * TILE + (col % TILE), p)
    buf.writeUInt16LE(Math.min(65535, modis), p + 4)
    buf.writeUInt16LE(Math.min(65535, viirs), p + 6)
    at.set(key, p + REC)
    records++
    i = j
  }

  const tiles: string[] = []
  let bytes = 0
  for (const [key, body] of bufs) {
    const out = Buffer.allocUnsafe(4 + body.length)
    out.writeUInt32LE(body.length / REC, 0)
    body.copy(out, 4)
    const gz = gzipSync(out, { level: 9 })
    await writeFile(`${OUT}/${year}/${key}.bin.gz`, gz)
    tiles.push(key)
    bytes += gz.length
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
    used = 0
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
        level: 'L3',
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
