/**
 * The planet's two figures: when it burns, and whether it burns more.
 *
 * At one degree and one month there is no calendar to draw — no season start,
 * no percentile, no "hotter than nine days in ten". What the global level can
 * answer is the pair of questions the regions answer at their own scale, and
 * it answers them with something the regions cannot: the whole surface at once.
 *
 * "As recorded", the year bars keep MODIS and VIIRS apart. Stacking them into
 * one total would be the easy thing and the wrong one — VIIRS arrives in 2012
 * and sees several times as many fires as MODIS over the same ground, so a
 * combined line rises sharply in 2012 for a reason that has nothing to do
 * with fire. Side by side, that seam is visible and the reader can discount it.
 *
 * "Reconciled", both charts draw MODIS times the ratio the ribbon above uses,
 * through `comparable()`. They used to draw the recorded counts whichever way
 * the switch was set, so the planet's page said "reconciled" over 2005 lying
 * near zero and 2025 at eleven times its height.
 */

import { comparable } from '../core/harmonize'
import { MODIS_PAIR_FROM } from '../core/stats'
import { counted, detectionsUnit, formatCompact, formatNumber, months, t } from '../i18n'
import { fitCanvas, LABEL, MONO, niceCeil, rgba, roundRect, varColor } from './paint'

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

/**
 * The three labels up the left edge, and the room they need.
 *
 * They used to come from a private formatter that wrote "3.5M" whatever
 * language the page was in. `formatCompact` writes "3,5 млн" in Russian,
 * which is right and also wider than the gutter was drawn for, so the
 * gutter is measured rather than assumed: the labels are built first, the
 * widest one decides, and it never shrinks below what it was.
 */
function axisLabels(ctx: CanvasRenderingContext2D, peak: number): { at: number[]; text: string[]; left: number } {
  const at = [0, 0.5, 1]
  const text = at.map((frac) => formatCompact(Math.round(peak * (1 - frac))))
  ctx.font = MONO
  const widest = Math.max(...text.map((t) => ctx.measureText(t).width))
  return { at, text, left: Math.max(PAD.left, Math.ceil(widest) + 16) }
}

/**
 * When the planet burns, month by month.
 *
 * Every year is drawn as a faint line and the selected one on top, so the
 * chosen season is read against the shape of every other rather than in
 * isolation — that a year peaked in August means little until you can see
 * that they all do.
 */
export function drawWorldSeason(
  canvas: HTMLCanvasElement,
  seasons: WorldSeason[],
  year: number,
  k: number | null = null,
  observed?: { from: string; to: string },
): void {
  const surface = fitCanvas(canvas, SEASON_H)
  if (!surface || seasons.length === 0) return
  const { ctx, width } = surface

  const series = seasons.map((s) => s.modis.map((m, i) => comparable(m, s.viirs[i], k)))

  /*
   * Which months of each year were watched. The running year's months after
   * the last day of data are not zeros, they are the future, and the first
   * year starts in November; both were drawn as a fall to the floor. A month
   * the record only partly covers is drawn, dashed, rather than hidden.
   */
  const span = (y: number): { first: number; last: number; partialLast: boolean } => {
    let first = 0
    let last = 11
    let partialLast = false
    if (observed && y === Number(observed.from.slice(0, 4))) first = Number(observed.from.slice(5, 7)) - 1
    if (observed && y === Number(observed.to.slice(0, 4))) {
      last = Number(observed.to.slice(5, 7)) - 1
      const end = new Date(Date.UTC(y, last + 1, 0)).getUTCDate()
      partialLast = Number(observed.to.slice(8, 10)) < end
    }
    return { first, last, partialLast }
  }
  const peak = niceCeil(Math.max(1, ...series.flat()))

  const axis = axisLabels(ctx, peak)
  const plotW = width - axis.left - PAD.right
  const plotH = SEASON_H - PAD.top - PAD.bottom

  const inkTertiary = varColor('--ink-tertiary')
  const edgeSoft = varColor('--edge-soft')
  const ember = varColor('--ember')

  const x = (m: number) => axis.left + (plotW * (m + 0.5)) / 12
  const y = (v: number) => PAD.top + plotH - (v / peak) * plotH

  // Baseline and two gridlines — enough to read a height, not a grid to study.
  ctx.strokeStyle = rgba(edgeSoft, 0.7)
  ctx.lineWidth = 1
  axis.at.forEach((frac, i) => {
    const gy = Math.round(PAD.top + plotH * frac) + 0.5
    ctx.beginPath()
    ctx.moveTo(axis.left, gy)
    ctx.lineTo(axis.left + plotW, gy)
    ctx.stroke()
    ctx.fillStyle = rgba(inkTertiary, 1)
    ctx.font = MONO
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(axis.text[i], axis.left - 8, gy)
  })

  // Every other year, quietly.
  ctx.lineWidth = 1
  for (let i = 0; i < seasons.length; i++) {
    if (seasons[i].year === year) continue
    const { first, last } = span(seasons[i].year)
    ctx.strokeStyle = rgba(inkTertiary, 0.22)
    ctx.beginPath()
    for (let m = first; m <= last; m++) (m === first ? ctx.moveTo(x(m), y(series[i][m])) : ctx.lineTo(x(m), y(series[i][m])))
    ctx.stroke()
  }

  // The chosen one, over the top.
  const pick = seasons.findIndex((s) => s.year === year)
  if (pick >= 0) {
    const { first, last, partialLast } = span(year)
    const solidTo = partialLast ? last - 1 : last
    ctx.strokeStyle = rgba(ember, 0.95)
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let m = first; m <= solidTo; m++) (m === first ? ctx.moveTo(x(m), y(series[pick][m])) : ctx.lineTo(x(m), y(series[pick][m])))
    ctx.stroke()
    if (partialLast && last > first) {
      ctx.save()
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x(last - 1), y(series[pick][last - 1]))
      ctx.lineTo(x(last), y(series[pick][last]))
      ctx.stroke()
      ctx.restore()
    }
    for (let m = first; m <= last; m++) {
      const open = partialLast && m === last
      ctx.beginPath()
      ctx.arc(x(m), y(series[pick][m]), 2.4, 0, Math.PI * 2)
      if (open) {
        ctx.strokeStyle = rgba(ember, 1)
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        ctx.fillStyle = rgba(ember, 1)
        ctx.fill()
      }
    }
  }

  const names = months()
  ctx.fillStyle = rgba(inkTertiary, 1)
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
  k: number | null = null,
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
  const peak = niceCeil(Math.max(1, ...totals.map((d) => (k === null ? Math.max(d.modis, d.viirs) : d.modis * k))))
  const axis = axisLabels(ctx, peak)
  const plotW = width - axis.left - padRight
  const plotH = YEARS_H - PAD.top - PAD.bottom

  const step = plotW / totals.length
  const barW = Math.max(2, Math.min(11, step / 2 - 1.5))

  const inkTertiary = varColor('--ink-tertiary')
  const edgeSoft = varColor('--edge-soft')
  const cModis = varColor('--sensor-modis')
  const cViirs = varColor('--sensor-viirs')
  const cOne = varColor('--ember')

  ctx.strokeStyle = rgba(edgeSoft, 0.7)
  ctx.lineWidth = 1
  axis.at.forEach((frac, i) => {
    const gy = Math.round(PAD.top + plotH * frac) + 0.5
    ctx.beginPath()
    ctx.moveTo(axis.left, gy)
    ctx.lineTo(axis.left + plotW, gy)
    ctx.stroke()
    ctx.fillStyle = rgba(inkTertiary, 1)
    ctx.font = MONO
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.fillText(axis.text[i], axis.left - 8, gy)
  })

  totals.forEach((d, i) => {
    const cx = axis.left + step * (i + 0.5)
    const on = d.year === year
    // Reconciled is one quantity, so one bar the width of the pair.
    const pairs: Array<[number, ReturnType<typeof varColor>, number, number]> =
      k === null
        ? [
            [d.modis, cModis, cx - barW - 1, barW],
            [d.viirs, cViirs, cx + 1, barW],
          ]
        : [[d.modis * k, cOne, cx - barW - 1, barW * 2 + 2]]
    // Before 2003 only Terra flew, and a year of one MODIS is about a third
    // of a year of two. Those bars are drawn faint so the step at 2003 reads
    // as the instrument it is.
    const terra = d.year < MODIS_PAIR_FROM
    for (const [v, colour, bx, w] of pairs) {
      if (v <= 0) continue
      const h = Math.max(1.5, (v / peak) * plotH)
      roundRect(ctx, bx, PAD.top + plotH - h, w, h, 2)
      ctx.fillStyle = rgba(colour, (on ? 1 : 0.6) * (terra ? 0.4 : 1))
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
    const cx = axis.left + step * (i + 0.5)
    if (started) ctx.lineTo(cx, ty(v))
    else {
      ctx.moveTo(cx, ty(v))
      started = true
    }
  })
  ctx.stroke()

  ctx.fillStyle = rgba(inkTertiary, 1)
  ctx.font = MONO
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`+${formatNumber(hi, 1)}°`, axis.left + plotW + 8, ty(hi))
  ctx.fillText(`+${formatNumber(lo, 1)}°`, axis.left + plotW + 8, ty(lo))
}

/** The one-line summary above the charts. */
export function worldHeadline(totals: WorldTotal[], year: number, k: number | null = null): string {
  const pick = totals.find((d) => d.year === year)
  const one = (d: WorldTotal) => comparable(d.modis, d.viirs, k)
  const all = totals.reduce((s, d) => s + one(d), 0)
  return t(k === null ? 'worldHeadline' : 'worldHeadlineReconciled', {
    all: k === null ? formatNumber(Math.round(all)) : formatCompact(all),
    from: String(totals[0]?.year ?? ''),
    to: String(totals[totals.length - 1]?.year ?? ''),
    year: String(year),
    // Reconciled figures are estimates and printed like one: "about 16M",
    // not "about 15,645,665" beside a ratio known to a few per cent.
    fires: k === null ? counted(Math.round(pick ? one(pick) : 0), detectionsUnit) : formatCompact(pick ? one(pick) : 0),
  })
}
