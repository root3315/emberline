/**
 * Two bars on one scale, because nobody has intuition for a gigatonne.
 *
 * The section it belongs to says the year's fires released a few gigatonnes
 * of carbon dioxide, "about nine per cent of what fossil fuels put out in a
 * year". Both halves of that are true and neither is legible: a reader is
 * being handed two enormous numbers and asked to divide one by the other in
 * their head, and what they take away is "a big number, probably bad".
 *
 * Drawn against each other the same sentence needs no arithmetic. The short
 * bar is the fires, the long one is the fuel, and the ratio is the picture.
 *
 * ── What this deliberately is not ─────────────────────────────────────────
 *
 * Not a series by year. That chart already exists forty pixels above, drawn
 * from detections, and emissions are derived from the same radiative power —
 * so it would have almost exactly the same silhouette and would read as the
 * page repeating itself for the sake of having another chart.
 */

import { fitCanvas, MONO, rgba, varColor } from './paint'

export interface ScaleBar {
  label: string
  value: number
  /** The one the section is about, drawn in the accent. */
  ours?: boolean
}

const ROW = 46
const PAD = { top: 6, right: 8, bottom: 6, left: 8 }

export function drawScaleBars(canvas: HTMLCanvasElement, bars: ScaleBar[], unit: string): void {
  const height = PAD.top + PAD.bottom + bars.length * ROW
  const surface = fitCanvas(canvas, height)
  if (!surface || bars.length === 0) return
  const { ctx, width } = surface

  const track = varColor('--ash-lifted')
  const ink = varColor('--ink-secondary')
  const strong = varColor('--ink-primary')
  const ember = varColor('--ember')

  const widest = Math.max(...bars.map((b) => b.value)) || 1
  const plotW = width - PAD.left - PAD.right

  bars.forEach((bar, i) => {
    const top = PAD.top + i * ROW

    ctx.font = MONO
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    ctx.fillStyle = rgba(bar.ours ? strong : ink)
    ctx.fillText(bar.label, PAD.left, top + 14)

    ctx.textAlign = 'right'
    ctx.fillStyle = rgba(bar.ours ? ember : ink)
    ctx.fillText(`${bar.value.toFixed(1)} ${unit}`, width - PAD.right, top + 14)

    const y = top + 24
    const h = 10
    ctx.fillStyle = rgba(track)
    ctx.beginPath()
    ctx.roundRect(PAD.left, y, plotW, h, h / 2)
    ctx.fill()

    // A bar shorter than it is tall stops reading as a bar, and the point of
    // the picture is that one of these is very much shorter than the other.
    const w = Math.max(h, (bar.value / widest) * plotW)
    ctx.fillStyle = rgba(bar.ours ? ember : ink, bar.ours ? 1 : 0.42)
    ctx.beginPath()
    ctx.roundRect(PAD.left, y, w, h, h / 2)
    ctx.fill()
  })
}
