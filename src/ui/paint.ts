/**
 * Shared drawing helpers: the blackbody ramp, crisp canvas sizing, and rounded
 * geometry. Colours are read back out of the stylesheet rather than duplicated
 * here, so a theme change moves the charts with everything else.
 */

/** A resolved colour, alpha included — the border tokens carry one. */
export type Rgb = [number, number, number, number]

const probe = document.createElement('canvas')
probe.width = probe.height = 1
const probeCtx = probe.getContext('2d', { willReadFrequently: true })!

/**
 * Resolve any CSS colour to RGBA, including `hsl(... / 0.09)`. Keeping the alpha
 * matters: the border tokens are defined almost entirely by it, and dropping it
 * turns a whisper-quiet hairline into a hard white rule.
 */
export function resolveColor(value: string): Rgb {
  probeCtx.clearRect(0, 0, 1, 1)
  probeCtx.fillStyle = '#000'
  probeCtx.fillStyle = value
  probeCtx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function varColor(name: string): Rgb {
  return resolveColor(cssVar(name))
}

/** `alpha` scales the colour's own alpha rather than replacing it. */
export function rgba([r, g, b, a]: Rgb, alpha = 1): string {
  return `rgba(${r},${g},${b},${(a ?? 1) * alpha})`
}

const RAMP_STOPS = [
  { at: 0, name: '--heat-00' },
  { at: 0.15, name: '--heat-15' },
  { at: 0.35, name: '--heat-35' },
  { at: 0.55, name: '--heat-55' },
  { at: 0.75, name: '--heat-75' },
  { at: 0.9, name: '--heat-90' },
  { at: 1, name: '--heat-100' },
] as const

const LUT_SIZE = 256
let lut: Rgb[] | null = null

/** Rebuild the ramp after a theme change. */
export function invalidateRamp(): void {
  lut = null
}

function buildLut(): Rgb[] {
  const stops = RAMP_STOPS.map((s) => ({ at: s.at, rgb: varColor(s.name) }))
  const out: Rgb[] = new Array(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1)
    let j = 1
    while (j < stops.length - 1 && stops[j].at < t) j++
    const a = stops[j - 1]
    const b = stops[j]
    const span = b.at - a.at || 1
    const f = Math.min(1, Math.max(0, (t - a.at) / span))
    out[i] = [
      Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f),
      Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f),
      Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f),
      1,
    ]
  }
  return out
}

/** Sample the blackbody ramp at 0..1. */
export function heat(t: number): Rgb {
  if (!lut) lut = buildLut()
  const i = Math.round(Math.min(1, Math.max(0, t)) * (LUT_SIZE - 1))
  return lut[i]
}

/**
 * Fire activity is heavy-tailed: one catastrophic day is worth hundreds of
 * ordinary ones, and a linear ramp turns every ordinary day into the same black.
 * A gentle power curve keeps the quiet season legible without flattening the peak.
 */
export function heatScale(value: number, max: number, gamma = 0.42): number {
  if (max <= 0 || value <= 0) return 0
  return Math.pow(Math.min(1, value / max), gamma)
}

export interface Surface {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

/** Size a canvas to its box at device resolution and return a CSS-pixel context. */
export function fitCanvas(canvas: HTMLCanvasElement, cssHeight: number): Surface | null {
  const width = canvas.parentElement?.clientWidth ?? canvas.clientWidth
  if (width <= 0) return null
  const dpr = Math.min(window.devicePixelRatio || 1, 2)

  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(cssHeight * dpr)
  canvas.style.width = '100%'
  canvas.style.height = `${cssHeight}px`

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, cssHeight)
  return { ctx, width, height: cssHeight }
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, radius)
}

export const MONO = "500 11px 'IBM Plex Mono', ui-monospace, monospace"
export const LABEL = "500 11px 'IBM Plex Sans', system-ui, sans-serif"
export const DISPLAY = "700 13px 'Manrope', system-ui, sans-serif"
