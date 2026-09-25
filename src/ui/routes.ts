/**
 * Two routes to the same years.
 *
 * The reconciled series is MODIS scaled once. This draws the second estimate
 * of the same years, made from VIIRS alone and brought into the same unit
 * (`twoRoutes` in harmonize.ts), so a reader can see at once where the two
 * instruments agree about a year and where they part — which is the honest
 * size of any year-to-year comparison — and that the series has a way to go
 * on once MODIS stops flying.
 *
 * Lines rather than bars: the question is whether they move together.
 */

import type { RouteYear } from '../core/harmonize'
import { formatCompact } from '../i18n'
import { fitCanvas, MONO, niceCeil, rgba, varColor, type Rgb } from './paint'

const HEIGHT = 170
const PAD = { top: 12, right: 10, bottom: 24, left: 52 }

export function drawRoutes(canvas: HTMLCanvasElement, rows: readonly RouteYear[], partialYear: number | null): void {
  drawYearLines(
    canvas,
    rows.map((r) => r.year),
    [
      { values: rows.map((r) => r.modis), colour: varColor('--sensor-modis') },
      { values: rows.map((r) => r.viirs), colour: varColor('--sensor-viirs') },
    ],
    partialYear,
  )
}

export interface YearLine {
  values: number[]
  colour: Rgb
  /** Thinner and quieter: the series the other one is read against. */
  quiet?: boolean
}

/** Year-by-year lines on one axis. The hero's seam has its own, in seam.ts. */
export function drawYearLines(
  canvas: HTMLCanvasElement,
  years: readonly number[],
  lines: readonly YearLine[],
  partialYear: number | null,
  height = HEIGHT,
): void {
  const surface = fitCanvas(canvas, height)
  if (!surface || years.length < 2) return
  const { ctx, width } = surface
  const HEIGHT_ = height

  const top = niceCeil(Math.max(1, ...lines.flatMap((l) => l.values)))
  const marks = [0, 0.5, 1].map((f) => formatCompact(Math.round(top * f)))
  ctx.font = MONO
  const left = Math.max(PAD.left, Math.ceil(Math.max(...marks.map((m) => ctx.measureText(m).width))) + 16)
  const plotW = width - left - PAD.right
  const plotH = HEIGHT_ - PAD.top - PAD.bottom
  const x = (i: number) => left + (years.length === 1 ? plotW / 2 : (i / (years.length - 1)) * plotW)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH

  const ink = varColor('--ink-tertiary')
  const edge = varColor('--edge-soft')

  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  ;[0, 0.5, 1].forEach((f, i) => {
    const gy = Math.round(y(top * f)) + 0.5
    ctx.strokeStyle = rgba(edge, 0.7)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, gy)
    ctx.lineTo(left + plotW, gy)
    ctx.stroke()
    ctx.fillStyle = rgba(ink, 1)
    ctx.fillText(marks[i], left - 8, gy)
  })

  for (const line of lines) {
    const colour = line.colour
    ctx.strokeStyle = rgba(colour, line.quiet ? 0.8 : 1)
    ctx.lineWidth = line.quiet ? 1.5 : 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    line.values.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))))
    ctx.stroke()
    line.values.forEach((v, i) => {
      ctx.beginPath()
      ctx.arc(x(i), y(v), line.quiet ? 2 : 2.6, 0, Math.PI * 2)
      // The running year is only part of a year: drawn open.
      if (years[i] === partialYear) {
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        ctx.fillStyle = rgba(colour, line.quiet ? 0.8 : 1)
        ctx.fill()
      }
    })
  }

  ctx.fillStyle = rgba(ink, 1)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  // The ends, and every fourth year that is not crowding one of them.
  const firstYear = years[0]
  const lastYear = years[years.length - 1]
  // Kept apart by pixels, not years: at 390 a two-year gap was eleven
  // pixels and "2024" and "2026" printed as "202026".
  const room = 40
  const xLast = x(years.length - 1)
  years.forEach((year, i) => {
    const end = year === firstYear || year === lastYear
    const ruled = year % 4 === 0 && x(i) - x(0) >= room && xLast - x(i) >= room
    if (!end && !ruled) return
    // The last label ends at its point rather than centring on it, or half
    // of it falls off the canvas.
    ctx.textAlign = year === lastYear ? 'right' : 'center'
    ctx.fillText(String(year), year === lastYear ? x(i) + 3 : x(i), PAD.top + plotH + 7)
  })
}
