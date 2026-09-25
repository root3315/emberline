/**
 * The seam, in the hero: each year against the same area's 2003-2011 mean,
 * as recorded and as reconciled.
 *
 * ── Why a doubling axis ─────────────────────────────────────────────────
 *
 * On a linear axis the recorded line ran to 10× and the axis to 20×, so the
 * reconciled line, the one the page is about, lay pressed against the floor
 * between 0.4 and 1.3. Both are ratios, and a ratio reads on a scale where
 * each gridline doubles the last: 1× sits in the middle, 0.5× is as far
 * below it as 2× is above, and the recorded line climbs in the steps the
 * satellites actually made instead of in one bar that hides the other line.
 *
 * ── Whole years only ────────────────────────────────────────────────────
 *
 * A running year is a few months set against twelve. In Punjab, whose
 * heavier season is October and November, September's 2026 read 0.2× and
 * dragged both lines to the floor at the right-hand end. It is left out
 * here; the calendar and the table show it as the part-year it is.
 *
 * ── What the chart says for itself ──────────────────────────────────────
 *
 * The years the ratio is taken against are shaded and named, so "1×" means
 * something without the caption. Each VIIRS satellite is marked where it
 * arrived, which is where the grey line steps. Each line is named at its
 * own end rather than in a legend: the eye is already there. (It printed
 * the last value at first, 0.45× on the 2003-2011 mean, beside a sentence
 * saying 0.4× of a usual year, which is the median of every whole year;
 * two true numbers that read as one wrong one.)
 */

import { formatNumber } from '../i18n'
import { fitCanvas, MONO, rgba, varColor } from './paint'

export interface SeamChart {
  years: readonly number[]
  recorded: readonly number[]
  reconciled: readonly number[]
  /** The years the ratio is taken against. */
  base: { from: number; to: number; label: string }
  /** Where a new instrument joined: a dotted rule and its name. */
  arrivals: readonly { year: number; label: string }[]
  /** Each line's name, printed at its end in place of a legend. */
  names: { recorded: string; reconciled: string }
}

const PAD = { top: 26, bottom: 24 }

const times = (v: number) => `${formatNumber(v, v < 1 ? (v < 0.5 ? 2 : 1) : v < 10 ? (Number.isInteger(v) ? 0 : 1) : 0)}×`

export function drawSeam(canvas: HTMLCanvasElement, chart: SeamChart, height = 196): void {
  const surface = fitCanvas(canvas, height)
  const { years, recorded, reconciled } = chart
  if (!surface || years.length < 2) return
  const { ctx, width } = surface

  const all = [...recorded, ...reconciled].filter((v) => v > 0)
  const lo = Math.max(1 / 16, Math.min(0.5, 2 ** Math.floor(Math.log2(Math.min(...all)))))
  const hi = Math.max(2, 2 ** Math.ceil(Math.log2(Math.max(...all))))
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v *= 2) ticks.push(v)

  ctx.font = MONO
  const left = Math.ceil(Math.max(...ticks.map((v) => ctx.measureText(times(v)).width))) + 14
  // Room on the right for the longer of the two names, measured, not guessed.
  const right = Math.ceil(Math.max(ctx.measureText(chart.names.recorded).width, ctx.measureText(chart.names.reconciled).width)) + 14
  const plotW = width - left - right
  const plotH = height - PAD.top - PAD.bottom
  const step = plotW / (years.length - 1)
  const x = (i: number) => left + i * step
  const xOfYear = (year: number) => x(years.indexOf(year))
  const y = (v: number) => {
    const k = (Math.log2(Math.max(v, lo)) - Math.log2(lo)) / (Math.log2(hi) - Math.log2(lo))
    return PAD.top + plotH - k * plotH
  }

  const ink = varColor('--ink-tertiary')
  const inkStrong = varColor('--ink-secondary')
  const edge = varColor('--edge-soft')
  const grey = varColor('--ink-tertiary')
  const ember = varColor('--ember')

  // The years the ratio is taken against.
  const b0 = years.indexOf(chart.base.from)
  const b1 = years.indexOf(chart.base.to)
  if (b0 >= 0 && b1 >= b0) {
    const bx = x(b0) - step / 2
    const bw = x(b1) - x(b0) + step
    const bLeft = Math.max(left, bx)
    const bWidth = Math.min(bw, left + plotW - bx)
    ctx.fillStyle = rgba(ink, 0.08)
    ctx.fillRect(bLeft, PAD.top, bWidth, plotH)
    // Named inside its own band, at the top, where the lines never go in
    // those years (they sit at 1× by construction). Above the plot it ran
    // into the first satellite's name on a phone. Two lines if it must.
    ctx.fillStyle = rgba(ink, 1)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    const label = chart.base.label
    const room = bWidth - 12
    if (ctx.measureText(label).width <= room) {
      ctx.fillText(label, bLeft + 6, PAD.top + 5)
    } else {
      const cut = label.lastIndexOf(' ')
      ctx.fillText(label.slice(0, cut), bLeft + 6, PAD.top + 5)
      ctx.fillText(label.slice(cut + 1), bLeft + 6, PAD.top + 19)
    }
  }

  // Gridlines, one per doubling; 1× drawn as the line everything is read against.
  const every = plotH / (ticks.length - 1) < 18 ? 2 : 1
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ticks.forEach((v, i) => {
    const isOne = Math.abs(v - 1) < 1e-9
    const gy = Math.round(y(v)) + 0.5
    ctx.save()
    if (isOne) ctx.setLineDash([4, 3])
    ctx.strokeStyle = isOne ? rgba(inkStrong, 0.7) : rgba(edge, 0.7)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, gy)
    ctx.lineTo(left + plotW, gy)
    ctx.stroke()
    ctx.restore()
    if (isOne || i % every === 0) {
      ctx.fillStyle = rgba(isOne ? inkStrong : ink, 1)
      ctx.fillText(times(v), left - 8, gy)
    }
  })

  // Where each VIIRS satellite joined.
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  let lastLabelEnd = -Infinity
  for (const a of chart.arrivals) {
    const i = years.indexOf(a.year)
    if (i < 0) continue
    const ax = Math.round(x(i)) + 0.5
    ctx.save()
    ctx.setLineDash([1, 3])
    ctx.strokeStyle = rgba(inkStrong, 0.55)
    ctx.beginPath()
    ctx.moveTo(ax, PAD.top)
    ctx.lineTo(ax, PAD.top + plotH)
    ctx.stroke()
    ctx.restore()
    const w = ctx.measureText(a.label).width
    const lx = Math.min(ax - 3, left + plotW + right - w - 2)
    if (lx > lastLabelEnd + 6) {
      ctx.fillStyle = rgba(ink, 1)
      ctx.fillText(a.label, lx, PAD.top - 6)
      lastLabelEnd = lx + w
    }
  }

  const drawLine = (values: readonly number[], colour: typeof ink, quiet: boolean) => {
    ctx.strokeStyle = rgba(colour, quiet ? 0.85 : 1)
    ctx.lineWidth = quiet ? 1.5 : 2.25
    ctx.lineJoin = 'round'
    ctx.beginPath()
    values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))))
    ctx.stroke()
    ctx.fillStyle = rgba(colour, quiet ? 0.85 : 1)
    values.forEach((v, i) => {
      ctx.beginPath()
      ctx.arc(x(i), y(v), quiet ? 2 : 2.8, 0, Math.PI * 2)
      ctx.fill()
    })
  }
  drawLine(recorded, grey, true)
  drawLine(reconciled, ember, false)

  // Each line's name at its end, kept apart if the two meet.
  const n = years.length - 1
  let yRec = y(recorded[n])
  let yCon = y(reconciled[n])
  if (Math.abs(yRec - yCon) < 13) {
    const mid = (yRec + yCon) / 2
    const up = yRec < yCon ? -1 : 1
    yRec = mid + up * 6.5
    yCon = mid - up * 6.5
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = rgba(grey, 1)
  ctx.fillText(chart.names.recorded, x(n) + 8, yRec)
  ctx.fillStyle = rgba(ember, 1)
  ctx.fillText(chart.names.reconciled, x(n) + 8, yCon)

  // Years along the foot: the ends and the arrivals, never crowding.
  ctx.fillStyle = rgba(ink, 1)
  ctx.textBaseline = 'top'
  // The ends first, so a satellite year next to the last one gives way to it.
  const marks = [...new Set([years[0], years[n], ...chart.arrivals.map((a) => a.year)])].filter((yr) => years.includes(yr))
  const placed: [number, number][] = []
  ctx.textAlign = 'left'
  for (const yr of marks) {
    const label = String(yr)
    const w = ctx.measureText(label).width
    const cx = xOfYear(yr)
    const start = yr === years[n] ? cx - w + 3 : cx - w / 2
    if (placed.some(([s0, s1]) => start < s1 + 8 && start + w > s0 - 8)) continue
    ctx.fillText(label, start, PAD.top + plotH + 7)
    placed.push([start, start + w])
  }
}
