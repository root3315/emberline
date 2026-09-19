/**
 * The year ribbon — the one view this product exists for.
 *
 * Twenty-odd rows, one per year, 366 columns each. Read down a column and you
 * see whether a date is reliably a burning date; read across a row and you see
 * one year's whole season at once. The normal is not banished to a separate
 * chart: days that ran above their own 90th percentile are ringed in place, and
 * the rail on the left shows which instruments were in orbit to see them, so the
 * thinness of the early record is visible rather than asserted.
 */

import { formatDoy, formatNumber, months, t } from '../i18n'
import { daysInYear } from '../core/grid'
import { MODIS_MASK, SENSOR_META, SENSORS, VIIRS_MASK, type SensorId } from '../core/types'
import type { Climatology } from '../core/stats'
import { DISPLAY, fitCanvas, heat, heatScale, LABEL, MONO, rgba, roundRect, varColor, type Rgb } from './paint'

export interface RibbonModel {
  years: number[]
  rows: Map<number, Float64Array>
  clim: Climatology
  /** Peaks beyond this are clipped so one catastrophic day cannot flatten the rest. */
  ceiling: number
  observedFrom: string
  observedTo: string
  /** Day counts per sensor family, per year, for the rail. */
  sensorsByYear: Map<number, number>
  /** Annual totals, drawn as a bar beside each row. */
  totals: Map<number, number>
}

export interface RibbonHit {
  year: number
  doy: number
  value: number
  aboveP90: boolean
}

const GUTTER_LEFT = 78
/** Room for the annual-total bar that sits beside every row. */
const GUTTER_RIGHT = 86
const TOTAL_BAR_W = 70
const HEAD = 22
const ROW_GAP = 2
const RAIL_W = 26
const MIN_ROW = 9
const MAX_ROW = 17

export class Ribbon {
  private model: RibbonModel | null = null
  private geom = { x0: 0, y0: 0, cellW: 0, rowH: 0, rowStep: 0 }
  private selected: number | null = null

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onPick: (year: number) => void,
    private readonly onHover: (hit: RibbonHit | null, x: number, y: number) => void,
  ) {
    canvas.addEventListener('pointermove', this.handleMove)
    canvas.addEventListener('pointerleave', () => this.onHover(null, 0, 0))
    canvas.addEventListener('click', this.handleClick)
    canvas.addEventListener('keydown', this.handleKey)
    canvas.tabIndex = 0
  }

  setModel(model: RibbonModel, selected: number): void {
    this.model = model
    this.selected = selected
    this.draw()
  }

  select(year: number): void {
    this.selected = year
    this.draw()
  }

  draw(): void {
    const model = this.model
    if (!model || model.years.length === 0) return

    const rowH = Math.max(MIN_ROW, Math.min(MAX_ROW, Math.round(460 / model.years.length) - ROW_GAP))
    const height = HEAD + model.years.length * (rowH + ROW_GAP) + 18
    const surface = fitCanvas(this.canvas, height)
    if (!surface) return
    const { ctx, width } = surface

    const x0 = GUTTER_LEFT
    const plotW = width - GUTTER_LEFT - GUTTER_RIGHT
    const cellW = plotW / 366
    this.geom = { x0, y0: HEAD, cellW, rowH, rowStep: rowH + ROW_GAP }

    const inkTertiary = varColor('--ink-tertiary')
    const inkSecondary = varColor('--ink-secondary')
    const inkPrimary = varColor('--ink-primary')
    const above = varColor('--signal-above')
    const modisColor = varColor('--sensor-modis')
    const viirsColor = varColor('--sensor-viirs')

    // Month scale. Ticks only where a month starts; no boxed axis.
    ctx.font = LABEL
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
    const monthNames = months()
    let acc = 0
    for (let m = 0; m < 12; m++) {
      const x = x0 + acc * cellW
      ctx.fillStyle = rgba(inkTertiary, 0.9)
      ctx.fillText(monthNames[m], x + 2, 13)
      ctx.fillStyle = rgba(inkTertiary, 0.35)
      ctx.fillRect(x, HEAD - 5, 1, 4)
      acc += new Date(Date.UTC(2001, m + 1, 0)).getUTCDate()
    }

    // Header for the annual-total column, aligned with the month scale.
    const barX = width - GUTTER_RIGHT + 12
    ctx.textAlign = 'left'
    ctx.fillStyle = rgba(inkTertiary, 0.9)
    ctx.fillText(t('yearTotal'), barX, 13)

    const totalMax = Math.max(1, ...model.years.map((y) => model.totals.get(y) ?? 0))
    const fromDoyLimit = this.limitFor(model.observedFrom)
    const toDoyLimit = this.limitFor(model.observedTo)

    model.years.forEach((year, i) => {
      const y = HEAD + i * (rowH + ROW_GAP)
      const row = model.rows.get(year)
      const span = daysInYear(year)
      const isSelected = year === this.selected

      // Year label: the selected row is the only one at full ink.
      ctx.font = isSelected ? DISPLAY : MONO
      ctx.textAlign = 'right'
      ctx.fillStyle = rgba(isSelected ? inkPrimary : inkTertiary, isSelected ? 1 : 0.8)
      ctx.fillText(String(year), GUTTER_LEFT - RAIL_W - 12, y + rowH / 2 + 4)

      // Sensor rail: one lane per instrument family, drawn edge to edge so the
      // filled years fuse into a continuous thread. The MODIS lane runs the
      // whole record; the VIIRS lane starts partway down and the record visibly
      // thickens where it does.
      const mask = model.sensorsByYear.get(year) ?? 0
      const lanes: Array<[boolean, Rgb]> = [
        [(mask & MODIS_MASK) !== 0, modisColor],
        [(mask & VIIRS_MASK) !== 0, viirsColor],
      ]
      const laneH = rowH + ROW_GAP
      const isFirst = i === 0
      const isLast = i === model.years.length - 1
      lanes.forEach(([on, color], lane) => {
        const lx = GUTTER_LEFT - RAIL_W + lane * 9
        ctx.fillStyle = on ? rgba(color, 0.9) : rgba(inkTertiary, 0.12)
        // Round only the ends of the thread, so the middle reads as one line.
        const radius = isFirst || isLast ? 2.5 : 0
        roundRect(ctx, lx, y - ROW_GAP / 2, 5, laneH, radius)
        ctx.fill()
      })

      if (isSelected) {
        ctx.fillStyle = rgba(inkPrimary, 0.05)
        roundRect(ctx, x0 - 3, y - 1, plotW + 6, rowH + 2, 5)
        ctx.fill()
      }

      for (let doy = 1; doy <= 366; doy++) {
        const x = x0 + (doy - 1) * cellW
        const w = Math.max(1, cellW - 0.35)

        const unobserved =
          doy > span ||
          (year === model.years[0] && doy < fromDoyLimit) ||
          (year === model.years[model.years.length - 1] && doy > toDoyLimit)

        if (unobserved) {
          // Absence must not read as a quiet day, in either theme: a neutral
          // grey separates "nothing was watching" from "nothing was burning".
          ctx.fillStyle = rgba(inkTertiary, 0.16)
          roundRect(ctx, x, y, w, rowH, 1.5)
          ctx.fill()
          continue
        }

        const value = row ? row[doy] : 0
        ctx.fillStyle = rgba(heat(heatScale(value, model.ceiling)), 1)
        roundRect(ctx, x, y, w, rowH, 1.5)
        ctx.fill()

        if (value > 0 && value > model.clim.p90[doy] && model.clim.p90[doy] > 0) {
          ctx.strokeStyle = rgba(above, 0.85)
          ctx.lineWidth = 1
          roundRect(ctx, x + 0.5, y + 0.5, w - 1, rowH - 1, 1.5)
          ctx.stroke()
        }
      }

      // The year's total, as a bar. The calendar answers "when"; this column
      // answers "how much", and the two have to be read together — a long
      // smeared season and a short violent one can total the same.
      const total = model.totals.get(year) ?? 0
      const barH = Math.max(2, rowH - 3)
      const barY = y + (rowH - barH) / 2
      ctx.fillStyle = rgba(inkTertiary, 0.12)
      roundRect(ctx, barX, barY, TOTAL_BAR_W, barH, 2)
      ctx.fill()
      if (total > 0) {
        const w = Math.max(2, (total / totalMax) * TOTAL_BAR_W)
        ctx.fillStyle = rgba(heat(0.55 + 0.4 * (total / totalMax)), isSelected ? 1 : 0.82)
        roundRect(ctx, barX, barY, w, barH, 2)
        ctx.fill()
      }
    })

    // Footer: the record span, stated once, in the same ink as the axis.
    ctx.font = MONO
    ctx.textAlign = 'left'
    ctx.fillStyle = rgba(inkSecondary, 0.6)
    const foot = `${model.observedFrom} → ${model.observedTo}`
    ctx.fillText(foot, x0, HEAD + model.years.length * (rowH + ROW_GAP) + 13)

    ctx.textAlign = 'right'
    ctx.fillStyle = rgba(inkTertiary, 0.75)
    ctx.fillText(`${t('legendRamp')} ≤ ${formatNumber(Math.round(model.ceiling))}`, width - GUTTER_RIGHT, HEAD + model.years.length * (rowH + ROW_GAP) + 13)
  }

  private limitFor(iso: string): number {
    const d = new Date(`${iso}T00:00:00Z`)
    return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1
  }

  /** The year under a point, anywhere across the row including its total bar. */
  private rowAt(clientY: number): number | null {
    const model = this.model
    if (!model) return null
    const y = clientY - this.canvas.getBoundingClientRect().top
    const i = Math.floor((y - this.geom.y0) / this.geom.rowStep)
    if (i < 0 || i >= model.years.length) return null
    return model.years[i]
  }

  private hitAt(clientX: number, clientY: number): RibbonHit | null {
    const model = this.model
    if (!model) return null
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    const i = Math.floor((y - this.geom.y0) / this.geom.rowStep)
    if (i < 0 || i >= model.years.length) return null
    if (y - this.geom.y0 - i * this.geom.rowStep > this.geom.rowH) return null

    const doy = Math.floor((x - this.geom.x0) / this.geom.cellW) + 1
    if (doy < 1 || doy > 366) return null

    const year = model.years[i]
    if (doy > daysInYear(year)) return null
    const value = model.rows.get(year)?.[doy] ?? 0
    return { year, doy, value, aboveP90: value > model.clim.p90[doy] && model.clim.p90[doy] > 0 }
  }

  private handleMove = (e: PointerEvent) => {
    const hit = this.hitAt(e.clientX, e.clientY)
    const rect = this.canvas.getBoundingClientRect()
    this.onHover(hit, e.clientX - rect.left, e.clientY - rect.top)
  }

  private handleClick = (e: MouseEvent) => {
    // Anywhere on the row selects it, including the gutters and the total bar.
    const year = this.rowAt(e.clientY)
    if (year !== null) this.onPick(year)
  }

  private handleKey = (e: KeyboardEvent) => {
    const model = this.model
    if (!model || this.selected === null) return
    const i = model.years.indexOf(this.selected)
    if (e.key === 'ArrowUp' && i > 0) this.onPick(model.years[i - 1])
    else if (e.key === 'ArrowDown' && i < model.years.length - 1) this.onPick(model.years[i + 1])
    else return
    e.preventDefault()
  }
}

/** Sensors known to be in orbit in a given year, for the availability note. */
export function sensorsActiveIn(year: number): SensorId[] {
  return SENSORS.filter((s) => Number(SENSOR_META[s].since.slice(0, 4)) <= year)
}

export function describeHit(hit: RibbonHit, adjusted: boolean): string {
  const date = `${formatDoy(hit.doy, hit.year)} ${hit.year}`
  return adjusted ? `${date} ·` : date
}
