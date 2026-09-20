/**
 * The model's answer, as a map.
 *
 * A probability per quarter-degree cell that MODIS detects a fire there in
 * the coming week, computed at build time from the end of the archive and
 * shipped as one small file. The site is static; there is no model in the
 * browser and no inference on the page.
 *
 * ── Why the numbers beside it are not decoration ───────────────────────
 *
 * Anyone can colour a map and call it a forecast. What makes this one worth
 * showing is that it was scored against two things that need no model at all
 * — how often a cell burns at this time of year, and whether it burned last
 * week — on years the model never saw. That margin is small, and the
 * interface prints it rather than hiding it, because a forecast whose skill
 * is unstated is indistinguishable from a guess.
 *
 * The file carries only cells above one per cent. Below that the number is
 * noise dressed as precision, and keeping them would quadruple the download
 * to say nothing.
 */

export interface ForecastSkill {
  /** Average precision — the honest metric at a 5% base rate. */
  model: number
  climatology: number
  persistence: number
  baseRate: number
  rocAuc: number
}

export interface ForecastMeta {
  horizonDays: number
  degrees: number
  cols: number
  rows: number
  cells: number
  /** The week the forecast covers. */
  from: string
  to: string
  /** The last day of observation it was computed from. */
  asOf: string
  file: string
  threshold: number
  skill: ForecastSkill
  tested: string
  target: string
}

export interface ForecastCell {
  lat: number
  lon: number
  /** Probability, 0 to 1. */
  p: number
}

let meta: ForecastMeta | null = null
let cells: ForecastCell[] | null = null
let wanted: Promise<{ meta: ForecastMeta; cells: ForecastCell[] } | null> | null = null

/**
 * Two files, fetched once.
 *
 * A count, then that many cell indices as `u32`, then one byte of probability
 * each — the layout puts all the indices together and all the bytes together
 * so both compress far better than an interleaved record would.
 */
export async function loadForecast(
  base = '/data',
): Promise<{ meta: ForecastMeta; cells: ForecastCell[] } | null> {
  if (meta && cells) return { meta, cells }
  wanted ??= (async () => {
    const metaRes = await fetch(`${base}/forecast.json`)
    if (!metaRes.ok) return null
    const m = (await metaRes.json()) as ForecastMeta

    const res = await fetch(`${base}/${m.file}`)
    if (!res.ok) return null
    let raw = await res.arrayBuffer()
    const head = new Uint8Array(raw, 0, Math.min(2, raw.byteLength))
    if (head[0] === 0x1f && head[1] === 0x8b) {
      raw = await new Response(
        new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
      ).arrayBuffer()
    }

    const view = new DataView(raw)
    const n = view.getUint32(0, true)
    const half = m.degrees / 2
    const out: ForecastCell[] = new Array(n)
    for (let k = 0; k < n; k++) {
      const cell = view.getUint32(4 + k * 4, true)
      const row = Math.floor(cell / m.cols)
      const col = cell - row * m.cols
      out[k] = {
        lat: row * m.degrees - 90 + half,
        lon: col * m.degrees - 180 + half,
        p: view.getUint8(4 + n * 4 + k) / 255,
      }
    }
    meta = m
    cells = out
    return { meta: m, cells: out }
  })().catch(() => null)
  return wanted
}

/**
 * How much better than doing nothing, as a plain multiple.
 *
 * Average precision against the base rate: "this many times better than
 * picking cells at random". It is the least flattering way to put it and the
 * one a reader can actually hold on to.
 */
export function skillOverChance(s: ForecastSkill): number {
  return s.model / Math.max(s.baseRate, 1e-6)
}

export function skillOverClimatology(s: ForecastSkill): number {
  return s.model / Math.max(s.climatology, 1e-6)
}
