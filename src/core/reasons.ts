/**
 * Why this square, in words.
 *
 * The forecast hands a reader a number and asks to be believed. A number
 * with a reason beside it asks something different: it can be argued
 * with. "Eighty-seven per cent — it usually burns here at this time of
 * year, and the week ahead is dry" is a claim somebody who lives there
 * can check against what they already know, which a bare 87% is not.
 *
 * ── The file ─────────────────────────────────────────────────────────
 *
 * A count, one byte saying how many reasons a cell carries, then that
 * many bytes per cell in the same order as the forecast grid. 255 means
 * "nothing further worth saying". It is aligned to the grid on the build
 * side rather than carrying cell indices of its own, which is why a
 * reader who never presses a fire pays 127 kB and not a byte more — and
 * why it is fetched on the first press rather than with the page.
 */

import { loadForecast } from './forecast'

/*
 * The names come out of the file, not out of a list kept here.
 *
 * A byte is an index into the *model's* feature list, which is not the
 * canonical thirty: the fitter drops whatever the validation years call
 * dead weight, and this one kept twenty-five. Decoding against a list
 * written here gave a plausible wrong word for every cell — `own_14d`
 * read as `own_7d` — and nothing failed, which is the worst way for it
 * to be wrong. The file says what its own bytes mean.
 */

/** Cell index to the reasons for it, strongest first. */
let table: Promise<Map<number, string[]> | null> | null = null

export async function loadReasons(base = '/data'): Promise<Map<number, string[]> | null> {
  table ??= (async () => {
    const got = await loadForecast(base)
    if (!got) return null

    const res = await fetch(`${base}/world/why-${got.meta.horizonDays}d.bin.gz`)
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
    const keep = view.getUint8(4)
    const headLen = view.getUint16(5, true)
    const names = JSON.parse(
      new TextDecoder().decode(new Uint8Array(raw, 7, headLen)),
    ) as string[]
    const bytes = new Uint8Array(raw, 7 + headLen, n * keep)

    /*
     * Keyed by the cell's own index rather than by position.
     *
     * The grid the page holds is sorted by that index, so the two lists
     * do line up — but the pick card looks a cell up by where it is, and
     * a map is the honest way to say "this cell, whatever order it came
     * in". It also survives the day the grid is filtered before it
     * reaches here.
     */
    const { meta, cells } = got
    const half = meta.degrees / 2
    const out = new Map<number, string[]>()
    for (let k = 0; k < n && k < cells.length; k++) {
      const found: string[] = []
      for (let j = 0; j < keep; j++) {
        const at = bytes[k * keep + j]
        if (at === 255) break
        const name = names[at]
        if (name) found.push(name)
      }
      if (!found.length) continue
      const c = cells[k]
      const row = Math.round((c.lat + 90 - half) / meta.degrees)
      const col = Math.round((c.lon + 180 - half) / meta.degrees)
      out.set(row * meta.cols + col, found)
    }
    return out
  })().catch(() => null)
  return table
}

/** The reasons for the cell covering a point, or none. */
export function reasonsAt(
  map: Map<number, string[]> | null,
  lat: number,
  lon: number,
  degrees: number,
  cols: number,
): string[] {
  if (!map) return []
  const row = Math.floor((lat + 90) / degrees)
  const col = Math.floor((lon + 180) / degrees)
  return map.get(row * cols + col) ?? []
}
