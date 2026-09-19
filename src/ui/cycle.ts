/**
 * The annual cycle: one year drawn against the shape of a normal year.
 *
 * The band is where this area usually sits on a given date (p10 to p90), the
 * dotted line is the median, and the lit line is the year in focus. Anywhere the
 * line leaves the top of the band, the year is doing something its own history
 * did not prepare anyone for — which is the whole question an early-warning user
 * brings to a fire calendar.
 */

import { formatNumber, months, t } from '../i18n'
import type { Climatology } from '../core/stats'
import { fitCanvas, LABEL, MONO, rgba, varColor } from './paint'

export interface CycleModel {
  year: number
  row: Float64Array
  clim: Climatology
  span: number
}

const PAD = { top: 14, right: 10, bottom: 24, left: 46 }
const HEIGHT = 216

export function drawCycle(canvas: HTMLCanvasElement, model: CycleModel | null): void {
  const surface = fitCanvas(canvas, HEIGHT)
  if (!surface || !model) return
  const { ctx, width } = surface

  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const { row, clim, span } = model

  let peak = 0
  for (let d = 1; d <= span; d++) peak = Math.max(peak, row[d], clim.p90[d])
  if (peak <= 0) peak = 1

  const x = (doy: number) => PAD.left + ((doy - 1) / (span - 1)) * plotW
  const y = (v: number) => PAD.top + plotH - (Math.min(v, peak) / peak) * plotH

  const inkTertiary = varColor('--ink-tertiary')
  const inkMuted = varColor('--ink-muted')
  const edgeSoft = varColor('--edge-soft')
  const normal = varColor('--signal-normal')
  const ember = varColor('--ember')
  const above = varColor('--signal-above')

  // Horizontal rules, quiet enough to sit behind the data.
  ctx.font = MONO
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i <= 2; i++) {
    const v = (peak / 2) * i
    const yy = Math.round(y(v)) + 0.5
    ctx.strokeStyle = rgba(edgeSoft, 1)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD.left, yy)
    ctx.lineTo(width - PAD.right, yy)
    ctx.stroke()
    ctx.fillStyle = rgba(inkMuted, 0.9)
    ctx.fillText(formatNumber(Math.round(v)), PAD.left - 8, yy)
  }

  // Month ticks.
  ctx.font = LABEL
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const names = months()
  let acc = 0
  for (let m = 0; m < 12; m++) {
    const xx = x(acc + 1)
    ctx.fillStyle = rgba(inkTertiary, 0.75)
    if (m % 2 === 0) ctx.fillText(names[m], xx + 2, HEIGHT - 7)
    acc += new Date(Date.UTC(2001, m + 1, 0)).getUTCDate()
  }

  // The normal band.
  ctx.beginPath()
  for (let d = 1; d <= span; d++) ctx.lineTo(x(d), y(clim.p90[d]))
  for (let d = span; d >= 1; d--) ctx.lineTo(x(d), y(clim.p10[d]))
  ctx.closePath()
  ctx.fillStyle = rgba(normal, 0.2)
  ctx.fill()

  // Median.
  ctx.beginPath()
  for (let d = 1; d <= span; d++) ctx.lineTo(x(d), y(clim.median[d]))
  ctx.strokeStyle = rgba(normal, 0.85)
  ctx.lineWidth = 1.25
  ctx.setLineDash([3, 3])
  ctx.stroke()
  ctx.setLineDash([])

  // Exceedance: fill only where the year is above its own p90.
  ctx.save()
  ctx.beginPath()
  let open = false
  for (let d = 1; d <= span; d++) {
    const over = row[d] > clim.p90[d] && row[d] > 0
    if (over && !open) {
      ctx.moveTo(x(d), y(clim.p90[d]))
      open = true
    }
    if (over) ctx.lineTo(x(d), y(row[d]))
    if (!over && open) {
      for (let b = d - 1; b >= 1 && row[b] > clim.p90[b]; b--) ctx.lineTo(x(b), y(clim.p90[b]))
      ctx.closePath()
      open = false
    }
  }
  if (open) ctx.closePath()
  ctx.fillStyle = rgba(above, 0.22)
  ctx.fill()
  ctx.restore()

  // The year itself.
  ctx.beginPath()
  for (let d = 1; d <= span; d++) ctx.lineTo(x(d), y(row[d]))
  ctx.strokeStyle = rgba(ember, 1)
  ctx.lineWidth = 1.75
  ctx.lineJoin = 'round'
  ctx.stroke()

  // Legend, inline rather than in a box.
  ctx.font = LABEL
  ctx.textAlign = 'left'
  let lx = PAD.left
  const entries: Array<[string, string]> = [
    [rgba(normal, 0.45), t('normalBand')],
    [rgba(ember, 1), `${model.year}`],
  ]
  for (const [color, label] of entries) {
    ctx.fillStyle = color
    ctx.fillRect(lx, PAD.top - 9, 10, 3)
    ctx.fillStyle = rgba(inkTertiary, 0.95)
    ctx.fillText(label, lx + 15, PAD.top - 5)
    lx += ctx.measureText(label).width + 34
  }
}
