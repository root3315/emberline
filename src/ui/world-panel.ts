/**
 * The planet's two figures: when it burns, and whether it burns more.
 *
 * At one degree and one month there is no calendar to draw — no season start,
 * no percentile, no "hotter than nine days in ten". What the global level can
 * answer is the pair of questions the regions answer at their own scale, and
 * it answers them with something the regions cannot: the whole surface at once.
 *
 * Both charts keep MODIS and VIIRS apart. Stacking them into one total would
 * be the easy thing and the wrong one — VIIRS arrives in 2012 and sees several
 * times as many fires as MODIS over the same ground, so a combined line rises
 * sharply in 2012 for a reason that has nothing to do with fire. Side by side,
 * that seam is visible and the reader can discount it.
 */

import { formatNumber, months, t } from '../i18n'
import { fitCanvas, LABEL, MONO, rgba, roundRect, varColor } from './paint'

export interface WorldSeason {
  year: number
  modis: number[]
  viirs: number[]
}

export interface WorldTotal {
  year: number
  modis: number
  viirs: number
  frp: number
}

const SEASON_H = 190
const YEARS_H = 190
const PAD = { top: 16, right: 12, bottom: 26, left: 56 }

/** Compact axis labels: the planet deals in millions. */
function shortCount(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e3) return Math.round(n / 1e3) + 'k'
  return String(n)
}

/**
 * When the planet burns, month by month.
 *
 * Every year is drawn as a faint line and the selected one on top, so the
 * chosen season is read against the shape of every other rather than in
 * isolation — that a year peaked in August means little until you can see
 * that they all do.
 */
export function drawWorldSeason(canvas: HTMLCanvasElement, seasons: WorldSeason[], year: number): void {
  const surface = fitCanvas(canvas, SEASON_H)
  if (!surface || seasons.length === 0) return
  const { ctx, width } = surface

  const plotW = width - PAD.left - PAD.right
  const plotH = SEASON_H - PAD.top - PAD.bottom

  const series = seasons.map((s) => s.modis.map((m, i) => m + s.viirs[i]))
  const peak = Math.max(1, ...series.flat())

  const inkTertiary = varColor('--ink-tertiary')
  const edgeSoft = varColor('--edge-soft')
  const ember = varColor('--ember')

  const x = (m: number) => PAD.left + (plotW * (m + 0.5)) / 12
  const y = (v: number) => PAD.top + plotH - (v / peak) * plotH

  // Baseline and two gridlines — enough to read a height, not a grid to study.
  ctx.strokeStyle = rgba(edgeSoft, 0.7)
  ctx.lineWidth = 1
  for (const frac of [0, 0.5, 1]) {
    const gy = Math.round(PAD.top + plotH * frac) + 0.5
    ctx.beginPath()
    ctx.moveTo(PAD.left, gy)
    ctx.lineTo(PAD.left + plotW, gy)
    ctx.stroke()
    ctx.fillStyle = rgba(inkTertiary, 0.8)
    ctx.font = MONO
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(shortCount(peak * (1 - frac)), PAD.left - 8, gy)
  }

  // Every other year, quietly.
  ctx.lineWidth = 1
  for (let i = 0; i < seasons.length; i++) {
    if (seasons[i].year === year) continue
    ctx.strokeStyle = rgba(inkTertiary, 0.22)
    ctx.beginPath()
    series[i].forEach((v, m) => (m === 0 ? ctx.moveTo(x(m), y(v)) : ctx.lineTo(x(m), y(v))))
    ctx.stroke()
  }

  // The chosen one, over the top.
  const pick = seasons.findIndex((s) => s.year === year)
  if (pick >= 0) {
    ctx.strokeStyle = rgba(ember, 0.95)
    ctx.lineWidth = 2
    ctx.beginPath()
    series[pick].forEach((v, m) => (m === 0 ? ctx.moveTo(x(m), y(v)) : ctx.lineTo(x(m), y(v))))
    ctx.stroke()
    ctx.fillStyle = rgba(ember, 1)
    series[pick].forEach((v, m) => {
      ctx.beginPath()
      ctx.arc(x(m), y(v), 2.4, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  const names = months()
  ctx.fillStyle = rgba(inkTertiary, 0.9)
  ctx.font = LABEL
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (let m = 0; m < 12; m++) ctx.fillText(names[m], x(m), PAD.top + plotH + 7)
}

/**
 * How much burned each year, with the instruments kept apart.
 *
 * The bars are side by side rather than stacked. Stacked, the arrival of VIIRS
 * in 2012 would read as the planet catching fire; apart, it reads as a second
 * instrument switching on — which is what happened, and is the thing this
 * whole project exists to make visible.
 */
export function drawWorldYears(
  canvas: HTMLCanvasElement,
  totals: WorldTotal[],
  year: number,
  temps?: Map<number, number>,
): void {
  const surface = fitCanvas(canvas, YEARS_H)
  if (!surface || totals.length === 0) return
  const { ctx, width } = surface

  /**
   * Room on the right only when there is a second axis to put there.
   *
   * The temperature is a different quantity in different units, so it gets
   * its own scale; and a second scale needs its own labels, which need their
   * own margin. Without the temperature the chart keeps the full width.
   */
  const hasTemp = Boolean(temps && temps.size >= 2)
  const padRight = hasTemp ? 44 : PAD.right
  const plotW = width - PAD.left - padRight
  const plotH = YEARS_H - PAD.top - PAD.bottom
  const peak = Math.max(1, ...totals.map((d) => Math.max(d.modis, d.viirs)))

  const step = plotW / totals.length
  const barW = Math.max(2, Math.min(11, step / 2 - 1.5))

  const inkTertiary = varColor('--ink-tertiary')
  const edgeSoft = varColor('--edge-soft')
  const cModis = varColor('--sensor-modis')
  const cViirs = varColor('--sensor-viirs')

  ctx.strokeStyle = rgba(edgeSoft, 0.7)
  ctx.lineWidth = 1
  for (const frac of [0, 0.5, 1]) {
    const gy = Math.round(PAD.top + plotH * frac) + 0.5
    ctx.beginPath()
    ctx.moveTo(PAD.left, gy)
    ctx.lineTo(PAD.left + plotW, gy)
    ctx.stroke()
    ctx.fillStyle = rgba(inkTertiary, 0.8)
    ctx.font = MONO
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(shortCount(peak * (1 - frac)), PAD.left - 8, gy)
  }

  totals.forEach((d, i) => {
    const cx = PAD.left + step * (i + 0.5)
    const on = d.year === year
    const pairs: Array<[number, ReturnType<typeof varColor>, number]> = [
      [d.modis, cModis, cx - barW - 1],
      [d.viirs, cViirs, cx + 1],
    ]
    for (const [v, colour, bx] of pairs) {
      if (v <= 0) continue
      const h = Math.max(1.5, (v / peak) * plotH)
      roundRect(ctx, bx, PAD.top + plotH - h, barW, h, 2)
      ctx.fillStyle = rgba(colour, on ? 1 : 0.6)
      ctx.fill()
    }
    // Label every fifth year, and always the selected one — but never both
    // when they would collide. At twenty-seven years the columns are about
    // eleven pixels apart and a four-digit label is nearer thirty, so a
    // selected 2026 sitting next to a ruled 2025 prints one over the other.
    const ruled = d.year % 5 === 0
    const near = Math.abs(d.year - year) < 3
    if (on || (ruled && !near)) {
      ctx.fillStyle = rgba(inkTertiary, on ? 1 : 0.8)
      ctx.font = MONO
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(String(d.year), cx, PAD.top + plotH + 7)
    }
  })

  if (!hasTemp || !temps) return

  /**
   * Temperature, on its own scale, deliberately quiet.
   *
   * Grey and thin, over the bars rather than among them, because it is
   * context and not a finding. The two series share a horizontal axis and
   * nothing else — putting them on one vertical scale would invent a
   * relationship, and drawing the line as boldly as the bars would suggest
   * the page is claiming one.
   */
  const shown = totals.map((d) => temps.get(d.year)).filter((v): v is number => v !== undefined)
  if (shown.length < 2) return
  const lo = Math.min(...shown)
  const hi = Math.max(...shown)
  const span = hi - lo || 1
  const ty = (v: number) => PAD.top + plotH - ((v - lo) / span) * plotH * 0.82 - plotH * 0.09

  ctx.strokeStyle = rgba(inkTertiary, 0.85)
  ctx.lineWidth = 1.6
  ctx.lineJoin = 'round'
  ctx.beginPath()
  let started = false
  totals.forEach((d, i) => {
    const v = temps.get(d.year)
    if (v === undefined) return
    const cx = PAD.left + step * (i + 0.5)
    if (started) ctx.lineTo(cx, ty(v))
    else {
      ctx.moveTo(cx, ty(v))
      started = true
    }
  })
  ctx.stroke()

  ctx.fillStyle = rgba(inkTertiary, 0.85)
  ctx.font = MONO
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`+${hi.toFixed(1)}°`, PAD.left + plotW + 8, ty(hi))
  ctx.fillText(`+${lo.toFixed(1)}°`, PAD.left + plotW + 8, ty(lo))
}

/** The one-line summary above the charts. */
export function worldHeadline(totals: WorldTotal[], year: number): string {
  const pick = totals.find((d) => d.year === year)
  const all = totals.reduce((s, d) => s + d.modis + d.viirs, 0)
  return t('worldHeadline', {
    all: formatNumber(all),
    from: String(totals[0]?.year ?? ''),
    to: String(totals[totals.length - 1]?.year ?? ''),
    year: String(year),
    fires: formatNumber(pick ? pick.modis + pick.viirs : 0),
  })
}
