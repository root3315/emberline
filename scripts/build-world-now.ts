/**
 * What is burning on the planet right now, as a file anyone can open.
 *
 * The live FIRMS endpoint needs a key, and this site is public — ours cannot
 * ship with it, and asking every reader for their own to answer "what is on
 * fire today" is not an answer. So the current picture is fetched here, folded
 * to a grid, and served as data. It is exactly as fresh as the last time this
 * ran, and it says so on the page rather than implying live.
 *
 * Finer than the archive level on purpose. L0 is one degree because it carries
 * twenty-six years; a single week is a thousandth of that, so it can afford
 * quarter-degree cells — about 25 km, fine enough that a fire front reads as a
 * front rather than as one square.
 *
 *   FIRMS_MAP_KEYS=... npx tsx scripts/build-world-now.ts [days]
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

const KEYS = (process.env.FIRMS_MAP_KEYS ?? process.env.FIRMS_MAP_KEY ?? '')
  .split(/[,\s]+/)
  .map((k) => k.trim())
  .filter(Boolean)

if (!KEYS.length) {
  console.error('Set FIRMS_MAP_KEYS=k1,k2,k3 (or FIRMS_MAP_KEY).')
  process.exit(1)
}

const API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv'
const OUT = 'public/data/world'
const WORLD = '-180,-90,180,90'

/** Near-real-time only: the science products lag a year and are not "now". */
const PRODUCTS = ['MODIS_NRT', 'VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT']

/** Days back. A week is long enough to show a front, short enough to be news. */
const DAYS = Math.max(1, Math.min(10, Number(process.argv[2] ?? 7)))
/** The API caps a window at five days however the request is phrased. */
const WINDOW = 5

const DEG = 0.25
const COLS = Math.round(360 / DEG)
const ROWS = Math.round(180 / DEG)

const modis = new Uint32Array(COLS * ROWS)
const viirs = new Uint32Array(COLS * ROWS)
const frp = new Float32Array(COLS * ROWS)

/**
 * The same week again, finer and day by day.
 *
 * The coarse grid above is right for the planet on one screen and wrong
 * everywhere else, in two ways at once. A quarter-degree cell is 25 km, so one
 * fire in the fields paints a square that covers a city and reads as the city
 * burning; and seven days folded into one number cannot be compared with what
 * FIRMS shows for today, which is the obvious thing a reader will do.
 *
 * So the week is also kept at a twentieth of a degree with the day attached,
 * cut into 20° tiles. A city costs one small file, the day filter becomes
 * possible, and the two products stay honest about being one week of data.
 */
const FINE = 0.05
const FINE_COLS = Math.round(360 / FINE)
const FINE_ROWS = Math.round(180 / FINE)
const TILE_DEG = 20
const TILE = Math.round(TILE_DEG / FINE)
const TX = Math.round(360 / TILE_DEG)
const TY = Math.round(180 / TILE_DEG)

/** cell * 8 + dayIndex → packed counts, kept sparse: the planet is mostly quiet. */
const fine = new Map<number, { m: number; v: number }>()
let dayZero = ''

/**
 * And the week as the detections themselves, not a grid at all.
 *
 * Below about a kilometre a grid stops meaning anything: a MODIS pixel *is* a
 * kilometre at nadir and spreads past five at the edge of the swath, so a
 * finer mesh would be inventing precision the instrument never had. What does
 * survive the zoom is the detection: one point, with the minute the satellite
 * passed, how much power it saw and how sure it was.
 *
 * Only for the live week. The whole archive as points is six or seven
 * gigabytes and stops being a static site; one week is a million and a half
 * and fits in a few megabytes, which is also exactly the view anyone will
 * hold up against FIRMS.
 */
interface Spark {
  /** Offsets inside the tile, 1/65536 of 20° — about thirty-four metres. */
  lat: number
  lon: number
  /** Minutes past midnight UTC. */
  minute: number
  /** Megawatts, clamped. */
  frp: number
  day: number
  /** Bit 0: VIIRS rather than MODIS. Bits 2–3: confidence class. */
  flags: number
}

const sparks = new Map<string, Spark[]>()

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

interface Seen {
  rows: number
  kept: number
  first: string
  last: string
}

function fold(buf: Buffer, seen: Seen): void {
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
    // Near-real-time rows end at `daynight` — thirteen commas, no `type`
    // column to filter volcanoes and flares by. See the archive fold for why
    // demanding fourteen silently emptied three months of the record.
    if (n < 13) {
      i = j + 1
      continue
    }
    seen.rows++
    if (n >= 14 && readInt(buf, field[14], j) !== 0) {
      i = j + 1
      continue
    }

    const lat = readFloat(buf, field[0], field[1] - 1)
    const lon = readFloat(buf, field[1], field[2] - 1)
    const date = buf.subarray(field[5], field[5] + 10).toString('latin1')
    if (!seen.first || date < seen.first) seen.first = date
    if (date > seen.last) seen.last = date

    let row = Math.floor((lat + 90) / DEG)
    let col = Math.floor((lon + 180) / DEG)
    if (row < 0) row = 0
    else if (row >= ROWS) row = ROWS - 1
    if (col < 0) col = 0
    else if (col >= COLS) col = COLS - 1

    const isModis = buf[field[8]] === 0x4d
    const slot = row * COLS + col
    if (isModis) modis[slot]++
    else viirs[slot]++
    frp[slot] += readFloat(buf, field[12], field[13] - 1)

    // And again on the fine grid, with the day kept.
    let fr = Math.floor((lat + 90) / FINE)
    let fc = Math.floor((lon + 180) / FINE)
    if (fr < 0) fr = 0
    else if (fr >= FINE_ROWS) fr = FINE_ROWS - 1
    if (fc < 0) fc = 0
    else if (fc >= FINE_COLS) fc = FINE_COLS - 1
    const day = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(dayZero + 'T00:00:00Z')) / 86_400_000)
    if (day >= 0 && day < 16) {
      const key = (fr * FINE_COLS + fc) * 16 + day
      const at = fine.get(key)
      if (at) {
        if (isModis) at.m++
        else at.v++
      } else {
        fine.set(key, { m: isModis ? 1 : 0, v: isModis ? 0 : 1 })
      }
    }

    /**
     * The same detection kept as a point.
     *
     * Confidence arrives two different ways — a percentage from MODIS, a
     * letter from VIIRS — and is flattened to three classes so one legend can
     * describe both.
     */
    const tx = Math.min(TX - 1, Math.max(0, Math.floor((lon + 180) / TILE_DEG)))
    const ty = Math.min(TY - 1, Math.max(0, Math.floor((lat + 90) / TILE_DEG)))
    const id = `${tx}-${ty}`
    let list = sparks.get(id)
    if (!list) sparks.set(id, (list = []))

    const conf = isModis
      ? readInt(buf, field[9], field[10] - 1) >= 80
        ? 2
        : readInt(buf, field[9], field[10] - 1) >= 30
          ? 1
          : 0
      : buf[field[9]] === 0x68
        ? 2
        : buf[field[9]] === 0x6e
          ? 1
          : 0

    // Every field is clamped both ways. A row with a longitude a hair outside
    // the globe, or a blank power column read as -1, is rare and real, and it
    // must cost one bad point rather than the whole run.
    const hhmm = readInt(buf, field[6], field[7] - 1)
    const clamp16 = (v: number) => Math.max(0, Math.min(65535, Math.round(v)))
    list.push({
      lat: clamp16(((lat + 90 - ty * TILE_DEG) / TILE_DEG) * 65535),
      lon: clamp16(((lon + 180 - tx * TILE_DEG) / TILE_DEG) * 65535),
      minute: Math.max(0, Math.min(1439, Math.floor(hhmm / 100) * 60 + (hhmm % 100))),
      frp: clamp16(readFloat(buf, field[12], field[13] - 1)),
      day: day >= 0 && day < 16 ? day : 0,
      flags: (isModis ? 0 : 1) | (conf << 2),
    })

    seen.kept++
    i = j + 1
  }
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
}

async function main(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10)
  const start = addDays(today, -(DAYS - 1))

  // One window per five days per product, each on its own key so the whole
  // snapshot lands in a handful of seconds without troubling the quota.
  const tasks: Array<{ product: string; from: string; days: number }> = []
  for (const product of PRODUCTS) {
    for (let off = 0; off < DAYS; off += WINDOW) {
      tasks.push({ product, from: addDays(start, off), days: Math.min(WINDOW, DAYS - off) })
    }
  }

  dayZero = start
  process.stdout.write(`Snapshot ${start} → ${today}: ${tasks.length} global windows\n`)
  const seen: Seen = { rows: 0, kept: 0, first: '', last: '' }
  let failed = 0

  await Promise.all(
    tasks.map(async (task, i) => {
      const key = KEYS[i % KEYS.length]
      const url = `${API}/${key}/${task.product}/${WORLD}/${task.days}/${task.from}`
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) })
        const raw = Buffer.from(await res.arrayBuffer())
        const head = raw.subarray(0, 240).toString('latin1')
        if (!/^\s*latitude/i.test(head)) {
          // An empty answer is normal for a product with nothing yet today.
          if (head.trim() !== '') {
            failed++
            process.stdout.write(`  ${task.product} ${task.from}: ${head.slice(0, 70).trim()}\n`)
          }
          return
        }
        fold(raw, seen)
        process.stdout.write(`  ${task.product} ${task.from} +${task.days}d  ${(raw.length / 1048576).toFixed(1)} MB\n`)
      } catch (e) {
        failed++
        process.stdout.write(`  ${task.product} ${task.from}: ${String(e).slice(0, 70)}\n`)
      }
    }),
  )

  const cells: number[] = []
  for (let c = 0; c < modis.length; c++) if (modis[c] !== 0 || viirs[c] !== 0) cells.push(c)

  const REC = 16
  const out = Buffer.allocUnsafe(4 + cells.length * REC)
  out.writeUInt32LE(cells.length, 0)
  let p = 4
  for (const c of cells) {
    out.writeUInt32LE(c, p)
    out.writeUInt32LE(modis[c], p + 4)
    out.writeUInt32LE(viirs[c], p + 8)
    out.writeFloatLE(frp[c], p + 12)
    p += REC
  }

  await mkdir(OUT, { recursive: true })
  await writeFile(`${OUT}/now.bin`, out)

  /**
   * The fine tiles: cell within the tile, the day, and the two instruments.
   *
   * Ten bytes a record. The day is one byte because the snapshot is a week and
   * will never be more; the counts are sixteen bits because a five-kilometre
   * cell cannot see sixty-five thousand fires in a day.
   */
  const FREC = 10
  const byTile = new Map<string, Array<{ local: number; day: number; m: number; v: number }>>()
  for (const [key, count] of fine) {
    const day = key % 16
    const cell = (key - day) / 16
    const row = Math.floor(cell / FINE_COLS)
    const col = cell - row * FINE_COLS
    const tx = Math.floor(col / TILE)
    const ty = Math.floor(row / TILE)
    const id = `${tx}-${ty}`
    const list = byTile.get(id) ?? []
    list.push({ local: (row % TILE) * TILE + (col % TILE), day, m: count.m, v: count.v })
    byTile.set(id, list)
  }

  /**
   * Point tiles, ten bytes each.
   *
   * Two sixteen-bit offsets place it to about thirty-four metres inside its
   * 20° tile, which is well inside the instrument's own geolocation error and
   * therefore as precise as the number deserves to be. The rest is the minute
   * of the overpass, the power, and a byte of flags.
   */
  const PREC = 10
  await rm(`${OUT}/points`, { recursive: true, force: true })
  await mkdir(`${OUT}/points`, { recursive: true })
  const pointTiles: string[] = []
  let pointBytes = 0
  let pointCount = 0
  for (const [id, list] of sparks) {
    list.sort((a, b) => a.day - b.day || a.minute - b.minute)
    const buf = Buffer.allocUnsafe(4 + list.length * PREC)
    buf.writeUInt32LE(list.length, 0)
    let q = 4
    for (const sp of list) {
      buf.writeUInt16LE(sp.lat, q)
      buf.writeUInt16LE(sp.lon, q + 2)
      buf.writeUInt16LE(sp.minute, q + 4)
      buf.writeUInt16LE(sp.frp, q + 6)
      buf.writeUInt8(sp.day, q + 8)
      buf.writeUInt8(sp.flags, q + 9)
      q += PREC
    }
    const gz = gzipSync(buf, { level: 9 })
    await writeFile(`${OUT}/points/${id}.bin.gz`, gz)
    pointTiles.push(id)
    pointBytes += gz.length
    pointCount += list.length
  }

  await rm(`${OUT}/now`, { recursive: true, force: true })
  await mkdir(`${OUT}/now`, { recursive: true })
  const fineTiles: string[] = []
  let fineBytes = 0
  for (const [id, list] of byTile) {
    const buf = Buffer.allocUnsafe(4 + list.length * FREC)
    buf.writeUInt32LE(list.length, 0)
    let q = 4
    for (const r of list) {
      buf.writeUInt32LE(r.local, q)
      buf.writeUInt8(r.day, q + 4)
      buf.writeUInt8(0, q + 5)
      buf.writeUInt16LE(Math.min(65535, r.m), q + 6)
      buf.writeUInt16LE(Math.min(65535, r.v), q + 8)
      q += FREC
    }
    const gz = gzipSync(buf, { level: 9 })
    await writeFile(`${OUT}/now/${id}.bin.gz`, gz)
    fineTiles.push(id)
    fineBytes += gz.length
  }
  await writeFile(
    `${OUT}/now.json`,
    JSON.stringify(
      {
        degrees: DEG,
        cols: COLS,
        rows: ROWS,
        recordBytes: REC,
        cells: cells.length,
        detections: seen.kept,
        // What the data actually covers, taken from the rows rather than from
        // what was asked for: FIRMS publishes a day over the following hours,
        // so the last day present is usually not today.
        from: seen.first,
        to: seen.last,
        fetchedAt: new Date().toISOString(),
        products: PRODUCTS,
        incomplete: failed > 0,
        /**
         * How much each day of the window actually holds, planet-wide.
         *
         * FIRMS publishes a day over the hours that follow it, so the newest
         * day in a snapshot is nearly always a stub — a run taken this morning
         * found one detection in the whole Congo for today and eight thousand
         * for the week. A page that offered "the last day" against that would
         * look broken. With the totals in hand it can pick the last day that
         * is actually finished and say which one it picked.
         */
        dayTotals: Array.from({ length: DAYS }, (_, d) => {
          let sum = 0
          for (const [key, c] of fine) if (key % 16 === d) sum += c.m + c.v
          return sum
        }),
        // The same week at a twentieth of a degree, day by day, in tiles.
        fine: {
          degrees: FINE,
          cols: FINE_COLS,
          rows: FINE_ROWS,
          tileDegrees: TILE_DEG,
          tileCells: TILE,
          tilesX: TX,
          tilesY: TY,
          recordBytes: 10,
          gzipped: true,
          // Day 0 is `dayZero`; a record's day is an offset from it.
          dayZero: start,
          days: DAYS,
          tiles: fineTiles,
          bytes: fineBytes,
        },
        // The same week as individual detections, for the zoom below the grid.
        points: {
          tileDegrees: TILE_DEG,
          tilesX: TX,
          tilesY: TY,
          recordBytes: PREC,
          gzipped: true,
          dayZero: start,
          count: pointCount,
          tiles: pointTiles,
          bytes: pointBytes,
        },
      },
      null,
      2,
    ) + '\n',
  )

  process.stdout.write(
    `\n${(seen.rows / 1e6).toFixed(2)}M rows, ${seen.kept.toLocaleString('en')} vegetation fires\n` +
      `${cells.length.toLocaleString('en')} cells at ${DEG}° → ${(out.length / 1048576).toFixed(2)} MB\n` +
      `${fine.size.toLocaleString('en')} cell-days at ${FINE}° → ${(fineBytes / 1048576).toFixed(2)} MB in ${fineTiles.length} tiles\n` +
      `${pointCount.toLocaleString('en')} points → ${(pointBytes / 1048576).toFixed(2)} MB in ${pointTiles.length} tiles\n` +
      `covers ${seen.first} → ${seen.last}${failed ? `, ${failed} windows failed` : ''}\n`,
  )
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
