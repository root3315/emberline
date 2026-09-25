/**
 * Sensor contribution per year.
 *
 * This chart exists to keep the project honest. The bars are split by which
 * instrument family actually detected each active cell, so the moment VIIRS
 * joins the record is visible as a seam rather than hidden inside a total. Any
 * claim the calendar makes about the 2000s has to survive looking at this.
 */

import { formatCompact, t } from '../i18n'
import { fitCanvas, LABEL, MONO, rgba, roundRect, varColor, type Rgb } from './paint'

export interface ContribYear {
  year: number
  modisOnly: number
  both: number
  viirsOnly: number
}

const PAD = { top: 16, right: 10, bottom: 26, left: 52 }
const HEIGHT = 188

export function drawContrib(canvas: HTMLCanvasElement, data: ContribYear[], partialYear: number | null = null): void {
  const surface = fitCanvas(canvas, HEIGHT)
  if (!surface || data.length === 0) return
  const { ctx, width } = surface

  const plotH = HEIGHT - PAD.top - PAD.bottom

  const peak = Math.max(...data.map((d) => d.modisOnly + d.both + d.viirsOnly), 1)

  /*
   * The gutter has to fit the labels, and 52 pixels did not.
   *
   * Punjab's tallest year is 220,134, which `formatNumber` writes as
   * "220 134" — about 46 pixels of mono at this size, drawn right-aligned
   * ending 8 short of the gutter, so it started 2 pixels from the left edge
   * of the canvas and ran off it on anything narrower. Compact labels are
   * shorter and still exact enough for an axis, and the gutter is measured
   * from the ones about to be drawn rather than guessed.
   */
  const marks = [0, 1, 2].map((i) => ({ v: (peak / 2) * i, text: formatCompact(Math.round((peak / 2) * i)) }))
  ctx.font = MONO
  const gutter = Math.max(PAD.left, Math.ceil(Math.max(...marks.map((m) => ctx.measureText(m.text).width))) + 16)

  const plotWidth = width - gutter - PAD.right
  const step = plotWidth / data.length
  const barW = Math.max(3, Math.min(26, step - 4))

  const inkTertiary = varColor('--ink-tertiary')
  const edgeSoft = varColor('--edge-soft')
  const cModis = varColor('--sensor-modis')
  const cBoth = varColor('--sensor-both')
  const cViirs = varColor('--sensor-viirs')

  ctx.font = MONO
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (const mark of marks) {
    const yy = Math.round(PAD.top + plotH - (mark.v / peak) * plotH) + 0.5
    ctx.strokeStyle = rgba(edgeSoft, 1)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(gutter, yy)
    ctx.lineTo(width - PAD.right, yy)
    ctx.stroke()
    ctx.fillStyle = rgba(inkTertiary, 1)
    ctx.fillText(mark.text, gutter - 8, yy)
  }

  data.forEach((d, i) => {
    const x = gutter + i * step + (step - barW) / 2
    let cursor = PAD.top + plotH

    const segments: Array<[number, Rgb]> = [
      [d.modisOnly, cModis],
      [d.both, cBoth],
      [d.viirsOnly, cViirs],
    ]

    const total = d.modisOnly + d.both + d.viirsOnly
    const totalH = (total / peak) * plotH
    const topY = PAD.top + plotH - totalH

    // One rounded silhouette, clipped, so the stack keeps a single soft top.
    ctx.save()
    roundRect(ctx, x, topY, barW, Math.max(totalH, 2), Math.min(5, barW / 2))
    ctx.clip()
    for (const [value, color] of segments) {
      if (value <= 0) continue
      const h = (value / peak) * plotH
      // The running year is only part of one: faint, so it is not read as a fall.
      ctx.fillStyle = rgba(color, d.year === partialYear ? 0.38 : 0.92)
      ctx.fillRect(x, cursor - h, barW, h)
      cursor -= h
    }
    ctx.restore()
  })

  // Year labels, thinned so they never collide.
  ctx.font = LABEL
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const every = Math.ceil((data.length * 30) / Math.max(plotWidth, 1))
  const at = (i: number) => gutter + i * step + step / 2
  const last = data.length - 1
  /**
   * The newest year always gets its label; whatever would collide with it does
   * not.
   *
   * Thinning by position alone printed both whenever the record did not end on
   * a multiple of the step — "2025" over "2026" — and dropping the last one
   * instead would remove the single label a reader looks for first. So the
   * last is reserved and the ruled ones give way to it.
   */
  data.forEach((d, i) => {
    const x = at(i)
    if (i !== last && (i % every !== 0 || at(last) - x < 30)) return
    ctx.fillStyle = rgba(inkTertiary, 1)
    ctx.fillText(String(d.year), x, HEIGHT - 8)
  })
}

/** Legend entries, rendered as DOM so they stay selectable and translatable. */
export function contribLegend(): Array<{ label: string; color: string }> {
  return [
    { label: t('legendModis'), color: 'var(--sensor-modis)' },
    { label: t('legendBoth'), color: 'var(--sensor-both)' },
    { label: t('legendViirs'), color: 'var(--sensor-viirs)' },
  ]
}
