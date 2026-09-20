/**
 * Where the land is, as one bit per half-degree cell.
 *
 * Four kilobytes for the shape of every continent, because the answer is a
 * yes or a no and there are only 259,200 of them. A coastline drawn as
 * vectors would be a hundred times the size and would also be a promise the
 * rest of this site does not make: nothing else here is smooth.
 */

export interface LandMask {
  cols: number
  rows: number
  degrees: number
  /** One bit per cell, row-major from the south pole and the date line. */
  bits: Uint8Array
}

let mask: LandMask | null = null
let wanted: Promise<LandMask | null> | null = null

export async function loadLand(base = '/data'): Promise<LandMask | null> {
  if (mask) return mask
  wanted ??= (async () => {
    const res = await fetch(`${base}/land.bin.gz`)
    if (!res.ok) return null
    let raw = await res.arrayBuffer()

    // Some hosts serve .gz with Content-Encoding and hand it over already
    // expanded; the magic bytes say which happened.
    const head = new Uint8Array(raw, 0, Math.min(2, raw.byteLength))
    if (head[0] === 0x1f && head[1] === 0x8b) {
      raw = await new Response(
        new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip')),
      ).arrayBuffer()
    }

    const view = new DataView(raw)
    mask = {
      cols: view.getUint16(0, true),
      rows: view.getUint16(2, true),
      degrees: view.getFloat32(4, true),
      bits: new Uint8Array(raw, 8),
    }
    return mask
  })().catch(() => null)
  return wanted
}

export function isLand(m: LandMask, row: number, col: number): boolean {
  const i = row * m.cols + col
  return (m.bits[i >> 3] & (0x80 >> (i & 7))) !== 0
}
