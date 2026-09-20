/**
 * What "a lot" means, decided once for the whole planet instead of per view.
 *
 * The map colours a cell by how it compares to a ceiling, and that ceiling used
 * to be the ninety-seventh percentile of whatever happened to be on screen.
 * On the planet that reads correctly — the Congo is dark, the Gobi is white.
 * On a searched place it lies, and the lie is severe: framing Tashkent leaves
 * the map holding a hundred cells that run from one detection to forty-eight,
 * so forty-eight becomes "the top of the scale" and the ordinary stubble fires
 * around the city are painted the same red as the Cerrado in August. The
 * legend says "burns often"; the picture says a city is on fire.
 *
 * So the ceiling comes from the data, not the viewport: for each level and each
 * year, the ninety-ninth percentile of every burning cell on Earth. A cell is
 * then dark because it is in the top one per cent of burning ground that year,
 * wherever the camera happens to be pointed, and two places can be compared by
 * colour because the colour finally means the same thing in both.
 *
 * Per year rather than across the record, deliberately. The global levels carry
 * raw instrument counts, and VIIRS sees several times as many fires as MODIS
 * over the same ground; one ceiling for all twenty-seven years would drain the
 * colour out of every year before 2012 for a reason that has nothing to do with
 * fire. Which year burned more is a question the charts answer properly, with
 * the instruments kept apart.
 *
 *   npx tsx scripts/build-world-ramp.ts
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const DIR = 'public/data/world'
const OUT = `${DIR}/ramp.json`
const PERCENTILE = 0.99

/**
 * Percentiles from a histogram, not from a sorted list.
 *
 * There are twenty-nine million values at the finest level; sorting them costs
 * a gigabyte and several minutes for one number. Counts are small integers, so
 * a histogram with everything above the last bucket lumped together is exact
 * wherever it matters and free everywhere else.
 */
const TOP = 262_144

class Spread {
  private readonly bins = new Uint32Array(TOP + 1)
  private n = 0
  private max = 0

  add(v: number): void {
    if (v <= 0) return
    this.n++
    if (v > this.max) this.max = v
    this.bins[Math.min(v, TOP)]++
  }

  at(p: number): number {
    if (this.n === 0) return 1
    const want = Math.ceil(this.n * p)
    let seen = 0
    for (let v = 1; v <= TOP; v++) {
      seen += this.bins[v]
      if (seen >= want) return v
    }
    return this.max
  }

  get count(): number {
    return this.n
  }
}

/** A level whose file holds months: sum them per cell, then take the spread. */
function foldMonthly(buf: Buffer, months: number, cells: Uint32Array): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let p = 0
  for (let m = 0; m < months; m++) {
    const n = view.getUint32(p, true)
    p += 4
    for (let k = 0; k < n; k++) {
      const at = p + k * 16
      cells[view.getUint32(at, true)] += view.getUint32(at + 4, true) + view.getUint32(at + 8, true)
    }
    p += n * 16
  }
}

function spreadOf(cells: Uint32Array): Spread {
  const s = new Spread()
  for (let c = 0; c < cells.length; c++) s.add(cells[c])
  return s
}

async function main(): Promise<void> {
  const ramp: {
    percentile: number
    l0: Record<string, number>
    l1: Record<string, number>
    l2: Record<string, number>
    now?: number
    nowFine?: number
    builtAt: string
  } = { percentile: PERCENTILE, l0: {}, l1: {}, l2: {}, builtAt: new Date().toISOString() }

  const l0Cells = new Uint32Array(360 * 180)
  const l1Cells = new Uint32Array(1440 * 720)

  const years = readdirSync(DIR)
    .map((f) => /^l0-(\d{4})\.bin$/.exec(f)?.[1])
    .filter((y): y is string => Boolean(y))
    .sort()

  for (const year of years) {
    l0Cells.fill(0)
    foldMonthly(readFileSync(`${DIR}/l0-${year}.bin`), 12, l0Cells)
    const s0 = spreadOf(l0Cells)
    ramp.l0[year] = s0.at(PERCENTILE)

    l1Cells.fill(0)
    let haveL1 = false
    for (let q = 1; q <= 4; q++) {
      const path = `${DIR}/l1-${year}-q${q}.bin`
      if (!existsSync(path)) continue
      foldMonthly(readFileSync(path), 3, l1Cells)
      haveL1 = true
    }
    if (haveL1) ramp.l1[year] = spreadOf(l1Cells).at(PERCENTILE)

    // The finest level is already a year per record, and no cell is in two
    // tiles, so its values only have to be poured into one histogram.
    const tileDir = `${DIR}/l2/${year}`
    if (existsSync(tileDir)) {
      const s2 = new Spread()
      for (const f of readdirSync(tileDir)) {
        const raw = gunzipSync(readFileSync(`${tileDir}/${f}`))
        const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
        const n = view.getUint32(0, true)
        for (let k = 0; k < n; k++) {
          const at = 4 + k * 12
          s2.add(view.getUint32(at + 4, true) + view.getUint32(at + 8, true))
        }
      }
      ramp.l2[year] = s2.at(PERCENTILE)
    }

    process.stdout.write(
      `  ${year}  l0 ${String(ramp.l0[year]).padStart(6)}  ` +
        `l1 ${String(ramp.l1[year] ?? '-').padStart(6)}  ` +
        `l2 ${String(ramp.l2[year] ?? '-').padStart(6)}  (${s0.count} cells at 1°)\n`,
    )
  }

  // The snapshot is a week, not a year, and needs its own ceiling for the
  // same reason: a week's counts against a year's scale is a blank map.
  if (existsSync(`${DIR}/now.bin`)) {
    const raw = readFileSync(`${DIR}/now.bin`)
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
    const n = view.getUint32(0, true)
    const s = new Spread()
    for (let k = 0; k < n; k++) {
      const at = 4 + k * 16
      s.add(view.getUint32(at + 4, true) + view.getUint32(at + 8, true))
    }
    ramp.now = s.at(PERCENTILE)
    process.stdout.write(`  now   ${ramp.now}\n`)
  }

  /**
   * And the fine snapshot, per cell-day.
   *
   * The framed view of the week draws a twentieth-degree cell over one to
   * seven days, which holds orders of magnitude less than the coarse weekly
   * one; scaled to that ceiling every live fire would come out white. The page
   * multiplies this by however many days it is showing.
   */
  const fineDir = `${DIR}/now`
  if (existsSync(fineDir)) {
    const fs = new Spread()
    for (const f of readdirSync(fineDir)) {
      const raw = gunzipSync(readFileSync(`${fineDir}/${f}`))
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
      const n = view.getUint32(0, true)
      for (let k = 0; k < n; k++) {
        const at = 4 + k * 10
        fs.add(view.getUint16(at + 6, true) + view.getUint16(at + 8, true))
      }
    }
    /**
     * A lower percentile here, on purpose.
     *
     * The archive levels use the ninety-ninth because the question is "how
     * does this place compare with the rest of the planet over a year". The
     * live view asks something else — "is anything burning here now" — and
     * against a ninety-ninth-percentile ceiling a real fire two days old comes
     * out almost white. The ninetieth makes an ordinary active cell legible
     * and still leaves the worst of them at the top of the ramp.
     */
    ramp.nowFine = fs.at(0.9)
    process.stdout.write(`  nowFine ${ramp.nowFine} per cell-day (p99 is ${fs.at(PERCENTILE)})\n`)
  }

  await writeFile(OUT, JSON.stringify(ramp, null, 2) + '\n')
  process.stdout.write(`\n${OUT}\n`)
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
