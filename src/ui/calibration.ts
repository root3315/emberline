/**
 * The one chart that says whether the forecast can be trusted.
 *
 * Every other number on the page is a claim. This is the audit: take the
 * cells the model gave roughly the same chance, count how many actually
 * burned, and plot one against the other. A model whose dots sit on the
 * diagonal means what it says — when it claims sixty per cent, sixty per
 * cent burn. A model whose dots wander is confident about nothing in
 * particular, however good its ranking looks.
 *
 * Average precision cannot show this. A model can rank perfectly and still
 * be wildly miscalibrated; a reader deciding whether to act on "eighty per
 * cent" needs the second question answered, not the first.
 *
 * ── Why the dots are different sizes ──────────────────────────────────────
 *
 * The lowest bucket holds nine hundred thousand cells and the highest holds
 * eleven thousand. Drawn the same size they read as equally solid evidence,
 * and the eye is drawn to the top right where the data is thinnest. The
 * radius follows the count, so weight on the page matches weight in the
 * record.
 */

import { t } from '../i18n'
import { fitCanvas, MONO, rgba, varColor } from './paint'

export interface Bucket {
  from: number
  to: number
  n: number
  said: number
  burned: number
}

const HEIGHT = 300
const PAD = { top: 18, right: 18, bottom: 34, left: 44 }

export function drawCalibration(canvas: HTMLCanvasElement, buckets: Bucket[]): void {
  const surface = fitCanvas(canvas, HEIGHT)
  if (!surface || buckets.length === 0) return
  const { ctx, width } = surface

  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (v: number) => PAD.left + v * plotW
  const y = (v: number) => PAD.top + (1 - v) * plotH

  const soft = varColor('--edge-soft')
  // Tertiary, not muted: the axis labels are text and muted is below 4.5:1.
  const muted = varColor('--ink-tertiary')
  const ember = varColor('--ember')

  // The grid, quiet enough to read through.
  ctx.lineWidth = 1
  for (let g = 0; g <= 4; g++) {
    const v = g / 4
    ctx.strokeStyle = rgba(soft)
    ctx.beginPath()
    ctx.moveTo(x(0), Math.round(y(v)) + 0.5)
    ctx.lineTo(x(1), Math.round(y(v)) + 0.5)
    ctx.stroke()
  }

  ctx.font = MONO
  ctx.fillStyle = rgba(muted)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let g = 0; g <= 4; g++) {
    const v = g / 4
    ctx.fillText(`${Math.round(v * 100)}%`, PAD.left - 8, y(v))
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let g = 0; g <= 4; g++) {
    const v = g / 4
    ctx.fillText(`${Math.round(v * 100)}%`, x(v), HEIGHT - PAD.bottom + 8)
  }
  // The axes named, inside the plot where there is room: percentages on
  // both sides with nothing to say which is which read as one scale twice.
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(t('calibAxisSaid'), x(1), y(0) - 4)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText(t('calibAxisBurned'), x(0) + 4, y(1) + 4)

  /*
   * Perfect calibration, dashed.
   *
   * It is a reference, not a reading, and a solid line of the same weight
   * as the data would compete with it.
   */
  ctx.save()
  ctx.setLineDash([4, 4])
  // The whole chart is read against this line, so it has to be findable.
  // At the border token's own weight it vanished on the dark theme, and a
  // reference nobody can see turns the curve back into decoration.
  ctx.strokeStyle = rgba(muted, 0.55)
  ctx.beginPath()
  ctx.moveTo(x(0), y(0))
  ctx.lineTo(x(1), y(1))
  ctx.stroke()
  ctx.restore()

  // The path through the dots first, so the dots sit on top of it.
  ctx.strokeStyle = rgba(ember, 0.5)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  buckets.forEach((b, i) => {
    const px = x(b.said)
    const py = y(b.burned)
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()

  const biggest = Math.max(...buckets.map((b) => b.n))
  for (const b of buckets) {
    // Area, not radius, follows the count: doubling the dot's width would
    // quadruple what the eye reads as its weight.
    const r = 3 + 6 * Math.sqrt(b.n / biggest)
    ctx.beginPath()
    ctx.arc(x(b.said), y(b.burned), r, 0, Math.PI * 2)
    ctx.fillStyle = rgba(ember, 0.22)
    ctx.fill()
    ctx.strokeStyle = rgba(ember, 0.95)
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}
