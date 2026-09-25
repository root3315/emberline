/**
 * What the model actually leans on, drawn rather than asserted.
 *
 * The number beside each bar is a permutation importance: shuffle that one
 * column across the test rows, score the model again, and see how far the
 * average precision falls. It answers "how much worse would this model be
 * if it did not know this", which is the only question about a feature a
 * reader can hold on to.
 *
 * ── Why the bars are coloured in three ────────────────────────────────────
 *
 * Because the interesting fact is not the order, it is the grouping. Almost
 * everything the model knows comes from the fire archive, and the top of the
 * chart is a wall of it — where it burns, how often, how recently. The
 * weather is a handful of bars in the middle, and what is standing there to
 * burn is two small ones near the bottom. That shape is the honest summary
 * of this whole project: the archive carries the model, the sky sharpens it,
 * and the ground barely registers at a hundred and sixty kilometres.
 *
 * ── Why the scale is not linear ───────────────────────────────────────────
 *
 * The season is worth four tenths and the wind is worth two thousandths.
 * Drawn linearly, everything below the second bar is a line of pixels and
 * twenty features become two. A square-root scale keeps the top bar clearly
 * the largest while leaving the tail readable, and the figures are printed
 * so nobody has to estimate from the length.
 */

import { formatNumber } from '../i18n'
import { fitCanvas, MONO, rgba, varColor, type Rgb } from './paint'

export interface Weight {
  name: string
  kind: string
  drop: number
}

const ROW = 26
const PAD = { top: 10, right: 54, bottom: 10, left: 0 }
const LABEL_W = 0.52

export function drawImportance(canvas: HTMLCanvasElement, weights: Weight[]): void {
  /*
   * On a phone the label goes above its bar. Beside it, half of 358 pixels
   * held "Как часто здесь горит в это…" and every long name lost its end.
   */
  const stacked = (canvas.parentElement?.clientWidth ?? 600) < 560
  const row = stacked ? 38 : ROW
  const height = PAD.top + PAD.bottom + weights.length * row
  const surface = fitCanvas(canvas, height)
  if (!surface || weights.length === 0) return
  const { ctx, width } = surface

  const tone: Record<string, Rgb> = {
    archive: varColor('--ink-muted'),
    weather: varColor('--ember'),
    ground: varColor('--sensor-modis'),
  }
  const track = varColor('--ash-lifted')
  const ink = varColor('--ink-secondary')
  const strong = varColor('--ink-primary')

  const labelW = stacked ? width - PAD.right : Math.min(360, width * LABEL_W)
  const plotX = stacked ? 0 : labelW + 12
  const plotW = Math.max(40, width - plotX - PAD.right)
  const top = Math.max(...weights.map((w) => w.drop)) || 1
  const scale = (v: number) => Math.sqrt(Math.max(v, 0) / top)

  weights.forEach((w, i) => {
    const y = PAD.top + i * row
    const mid = stacked ? y + 27 : y + row / 2
    const colour = tone[w.kind] ?? tone.archive

    ctx.font = MONO
    ctx.textBaseline = 'middle'
    ctx.textAlign = stacked ? 'left' : 'right'
    ctx.fillStyle = rgba(w.kind === 'archive' ? ink : strong)
    ctx.fillText(clip(ctx, w.name, labelW), stacked ? 0 : labelW, stacked ? y + 10 : mid)

    const h = 9
    ctx.fillStyle = rgba(track)
    ctx.beginPath()
    ctx.roundRect(plotX, mid - h / 2, plotW, h, h / 2)
    ctx.fill()

    ctx.fillStyle = rgba(colour, w.kind === 'archive' ? 0.55 : 1)
    ctx.beginPath()
    ctx.roundRect(plotX, mid - h / 2, Math.max(h, scale(w.drop) * plotW), h, h / 2)
    ctx.fill()

    ctx.textAlign = 'left'
    ctx.fillStyle = rgba(ink)
    // Same width either way, and the reader's own decimal mark.
    ctx.fillText(formatNumber(w.drop, 3), plotX + plotW + 10, mid)
  })
}

/** Trim a label to the gutter, with an ellipsis rather than an overrun. */
function clip(ctx: CanvasRenderingContext2D, text: string, room: number): string {
  if (ctx.measureText(text).width <= room) return text
  let cut = text
  while (cut.length > 4 && ctx.measureText(`${cut}…`).width > room) cut = cut.slice(0, -1)
  return `${cut}…`
}
