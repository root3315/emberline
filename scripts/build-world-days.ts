/**
 * The fourth product: a day at a time, for anywhere.
 *
 * The three pyramid levels answer "where": L0 and L1 keep a month per slot and
 * L2 keeps a year, because a map only ever draws one period at once. The
 * ribbon asks the other question — "when does it burn *here*" — and needs
 * something none of them has: every day of every year, for whatever box the
 * reader picked.
 *
 * That is only affordable because a box is small and the planet is mostly
 * quiet. A quarter-degree cell burns on perhaps sixty days a year and five
 * million cell-days exist across the whole Earth in a recent year, so the
 * globe is cut into 10° squares, each square keeps its own records, and a city
 * costs one square. Quarter-degree rather than whole-degree deliberately: a
 * 110 km calendar under a map of a city would be the same "says one thing,
 * shows another" fault the clipped map had.
 *
 * Grouped in five-year spans rather than by year. Per year would be twenty-seven
 * requests for one ribbon and twelve thousand files on the host; this way it is
 * six, and no file is near the five-megabyte ceiling a static host allows.
 *
 *   npx tsx scripts/build-world-days.ts [cacheDir] [firstYear] [lastYear]
 */

import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'

const CACHE = process.argv[2] ?? process.env.FIRMS_CACHE_DIR ?? 'data/cache'
const DIR = `${CACHE}/world`
const OUT = 'public/data/world/days'
const INDEX = 'public/data/world/days-index.json'

const DEG = 0.25
const COLS = Math.round(360 / DEG)
const ROWS = Math.round(180 / DEG)

const TILE_DEG = 10
const TILE = Math.round(TILE_DEG / DEG)
const TX = Math.round(360 / TILE_DEG)
const TY = Math.round(180 / TILE_DEG)

const BASE_YEAR = Number(process.argv[3] ?? 2000)
const LAST_YEAR = Number(process.argv[4] ?? new Date().getUTCFullYear())
/**
 * Five years a file, not ten.
 *
 * A decade was the first guess and it put the busiest tile — central Siberia
 * through the 2010s — at 5.03 MB, three hundredths of a megabyte over what a
 * static host will serve, and a heavy download for one ribbon besides. Halving
 * the span halves the file and costs one extra request.
 */
const DECADE = 5

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
 * Every detection of the year as one sortable number, then counted by runs.
 *
 * A hash map keyed on cell and day is the obvious way and the wrong one at
 * sixty-six million rows: the map alone runs to half a gigabyte and spends
 * most of the fold rehashing. Packing (cell, day, sensor) into one integer
 * costs four bytes a detection in a typed array, sorts in a couple of seconds,
 * and turns counting into a walk over equal neighbours.
 *
 *   key = ((cell * 366 + day) * 2) + sensor
 *
 * The largest key is about 760 million, comfortably inside a signed 32-bit
 * integer, which is what makes the typed array — and therefore the whole
 * approach — possible.
 */
const DAYS = 366
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

function doy(y: number, m: number, d: number): number {
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000)
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
    // Thirteen commas is a near-real-time row with no `type` column; fourteen
    // is a science row, and only `type` 0 — a presumed vegetation fire —
    // belongs in a burning calendar.
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

    const day = doy(foldYear, readInt(buf, field[5] + 5, field[5] + 7), readInt(buf, field[5] + 8, field[5] + 10))
    if (day < 0 || day >= DAYS) {
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

    const sensor = buf[field[8]] === 0x4d ? 0 : 1
    push(((row * COLS + col) * DAYS + day) * 2 + sensor)
    stats.kept++
    i = j + 1
  }
}

const REC = 8

/** One year, counted and split into the tiles it belongs to. */
function yearChunks(): Map<string, Buffer> {
  const sorted = keys.subarray(0, used)
  sorted.sort()

  // First pass: how many records each tile will hold, so each buffer is
  // allocated once at the right size.
  const counts = new Map<string, number>()
  const tileOf = (cell: number): string => {
    const row = (cell / COLS) | 0
    const col = cell - row * COLS
    return `${(col / TILE) | 0}-${(row / TILE) | 0}`
  }

  let i = 0
  while (i < sorted.length) {
    const cellDay = (sorted[i] / 2) | 0
    const cell = (cellDay / DAYS) | 0
    let j = i
    // A cell-day occupies at most two keys: one per sensor.
    while (j < sorted.length && ((sorted[j] / 2) | 0) === cellDay) j++
    const key = tileOf(cell)
    counts.set(key, (counts.get(key) ?? 0) + 1)
    i = j
  }

  const out = new Map<string, Buffer>()
  const at = new Map<string, number>()
  for (const [key, n] of counts) {
    out.set(key, Buffer.allocUnsafe(n * REC))
    at.set(key, 0)
  }

  i = 0
  while (i < sorted.length) {
    const cellDay = (sorted[i] / 2) | 0
    const cell = (cellDay / DAYS) | 0
    const day = cellDay - cell * DAYS
    let modis = 0
    let viirs = 0
    let j = i
    while (j < sorted.length && ((sorted[j] / 2) | 0) === cellDay) {
      if (sorted[j] % 2 === 0) modis++
      else viirs++
      j++
    }

    const row = (cell / COLS) | 0
    const col = cell - row * COLS
    const key = `${(col / TILE) | 0}-${(row / TILE) | 0}`
    const buf = out.get(key)!
    let p = at.get(key)!
    buf.writeUInt16LE((row % TILE) * TILE + (col % TILE), p)
    buf.writeUInt16LE(day, p + 2)
    buf.writeUInt16LE(Math.min(65535, modis), p + 4)
    buf.writeUInt16LE(Math.min(65535, viirs), p + 6)
    at.set(key, p + REC)
    i = j
  }

  return out
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
  /** tile → decade → present, for the index. */
  const have = new Map<string, Set<number>>()
  let bytes = 0
  let records = 0

  for (let decade = Math.floor(BASE_YEAR / DECADE) * DECADE; decade <= LAST_YEAR; decade += DECADE) {
    const years: number[] = []
    for (let y = Math.max(BASE_YEAR, decade); y <= Math.min(LAST_YEAR, decade + DECADE - 1); y++) {
      years.push(y)
    }
    if (!years.length) continue

    /** tile → [year, records] for this decade only, so memory stays bounded. */
    const held = new Map<string, Array<{ year: number; buf: Buffer }>>()

    for (const year of years) {
      foldYear = year
      used = 0
      const from = `${year - 1}-12-25`
      const to = `${year}-12-31`
      const mine = files.filter((f) => {
        const d = startOf.get(f)
        return d !== undefined && d >= from && d <= to
      })
      for (const f of mine) foldWindow(gunzipSync(readFileSync(`${DIR}/${f}`)), stats)

      const chunks = yearChunks()
      let cellDays = 0
      for (const [key, buf] of chunks) {
        cellDays += buf.length / REC
        const list = held.get(key) ?? []
        list.push({ year, buf })
        held.set(key, list)
      }
      records += cellDays
      process.stdout.write(
        `  ${year}  ${mine.length} windows  ${cellDays.toLocaleString('en')} cell-days  ` +
          `${chunks.size} tiles  ${((Date.now() - t0) / 1000).toFixed(0)}s\n`,
      )
    }

    for (const [key, list] of held) {
      // u16 year count, then per year: u16 year, u32 count, then the records.
      let size = 2
      for (const { buf } of list) size += 6 + buf.length
      const out = Buffer.allocUnsafe(size)
      out.writeUInt16LE(list.length, 0)
      let p = 2
      for (const { year, buf } of list) {
        out.writeUInt16LE(year, p)
        out.writeUInt32LE(buf.length / REC, p + 2)
        buf.copy(out, p + 6)
        p += 6 + buf.length
      }
      const gz = gzipSync(out, { level: 9 })
      await writeFile(`${OUT}/${key}-${decade}.bin.gz`, gz)
      bytes += gz.length
      const set = have.get(key) ?? new Set<number>()
      set.add(decade)
      have.set(key, set)
    }
    process.stdout.write(`  ${decade}s written: ${held.size} tiles, ${(bytes / 1048576).toFixed(1)} MB so far\n`)
  }

  await writeFile(
    INDEX,
    JSON.stringify(
      {
        degrees: DEG,
        cols: COLS,
        rows: ROWS,
        tileDegrees: TILE_DEG,
        tileCells: TILE,
        tilesX: TX,
        tilesY: TY,
        recordBytes: REC,
        fields: ['cell', 'day', 'modis', 'viirs'],
        gzipped: true,
        firstYear: BASE_YEAR,
        lastYear: LAST_YEAR,
        // Which decades each tile actually has, so nothing is asked for twice
        // and nothing is asked for in vain.
        tiles: Object.fromEntries([...have].map(([k, v]) => [k, [...v].sort((a, b) => a - b)])),
        builtAt: new Date().toISOString(),
        detections: stats.kept,
      },
      null,
      2,
    ) + '\n',
  )

  process.stdout.write(
    `\n${records.toLocaleString('en')} cell-days → ${(bytes / 1048576).toFixed(1)} MB gzipped\n` +
      `${((Date.now() - t0) / 1000).toFixed(0)}s total\n`,
  )
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
