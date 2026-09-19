/**
 * The year ribbon — the one view this product exists for.
 *
 * Twenty-odd rows, one per year, 366 columns each. Read down a column and you
 * see whether a date is reliably a burning date; read across a row and you see
 * one year's whole season at once. The normal is not banished to a separate
 * chart: days that ran above their own 90th percentile are ringed in place, and
 * the rail on the left shows which instruments were in orbit to see them, so the
 * thinness of the early record is visible rather than asserted.
 *
 * It is drawn as SVG, so it stays sharp at any zoom — but not one rectangle per
 * day. Twenty-seven years of 366 days is nearly ten thousand of them, and the
 * ribbon is rebuilt every time a row is selected or the window changes width;
 * ten thousand nodes would make each of those a visible stall. Instead the days
 * are quantised into a few dozen colour steps and every day in a step goes into
 * *one* path. Same picture, forty-odd nodes, and the whole thing is still
 * vector.
 */

import { formatDoy, formatNumber, months, t } from '../i18n'
import { daysInYear } from '../core/grid'
import { MODIS_MASK, SENSOR_META, SENSORS, VIIRS_MASK, type SensorId } from '../core/types'
import type { Climatology } from '../core/stats'
import { heat, heatScale, rgba, varColor, type Rgb } from './paint'

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

const SVG_NS = 'http://www.w3.org/2000/svg'

const GUTTER_LEFT = 78
/** Room for the annual-total bar that sits beside every row. */
const GUTTER_RIGHT = 86
const TOTAL_BAR_W = 70
const HEAD = 22
const ROW_GAP = 2
const RAIL_W = 26
const MIN_ROW = 9
const MAX_ROW = 17

/**
 * Colour steps the days are quantised into.
 *
 * This is the whole reason the ribbon can be vector at all: it sets how many
 * paths the ten thousand days collapse into. Forty-eight is past the point
 * where the banding is visible against a ramp that is already gamma-curved —
 * the eye finds the boundary between two adjacent steps well before it finds a
 * forty-eighth of the range.
 */
const HEAT_STEPS = 48

/**
 * One rounded rectangle, appended to a path being built.
 *
 * A day cell is under three pixels wide, so the radius is clamped to half of
 * whichever side is shorter — without that the arcs cross over and the cell
 * collapses. At this size the rounding is barely a pixel, but it is the
 * difference between a row of chips and a row of shards, and nothing else in
 * the interface has a sharp corner.
 */
function rect(out: string[], x: number, y: number, w: number, h: number, radius = 1.6): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2))
  const n = (v: number) => v.toFixed(2)
  if (r < 0.15) {
    out.push('M' + n(x) + ' ' + n(y) + 'h' + n(w) + 'v' + n(h) + 'h' + n(-w) + 'z')
    return
  }
  out.push(
    'M' + n(x + r) + ' ' + n(y) +
      'h' + n(w - 2 * r) + 'a' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(r) + ' ' + n(r) +
      'v' + n(h - 2 * r) + 'a' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(-r) + ' ' + n(r) +
      'h' + n(-(w - 2 * r)) + 'a' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(-r) + ' ' + n(-r) +
      'v' + n(-(h - 2 * r)) + 'a' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(r) + ' ' + n(-r) + 'z',
  )
}

export class Ribbon {
  private readonly svg: SVGSVGElement
  private model: RibbonModel | null = null
  private geom = { x0: 0, y0: 0, cellW: 0, rowH: 0, rowStep: 0 }
  private selected: number | null = null

  constructor(
    private readonly host: HTMLElement,
    private readonly onPick: (year: number) => void,
    private readonly onHover: (hit: RibbonHit | null, x: number, y: number) => void,
  ) {
    this.svg = document.createElementNS(SVG_NS, 'svg')
    this.svg.setAttribute('preserveAspectRatio', 'none')
    this.svg.style.display = 'block'
    this.svg.style.width = '100%'
    this.svg.style.cursor = 'pointer'
    host.replaceChildren(this.svg)

    this.svg.addEventListener('pointermove', this.handleMove)
    this.svg.addEventListener('pointerleave', () => this.onHover(null, 0, 0))
    this.svg.addEventListener('click', this.handleClick)
    this.svg.addEventListener('keydown', this.handleKey)
    this.svg.tabIndex = 0
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

    const width = this.host.clientWidth
    if (width <= 0) return

    const rowH = Math.max(MIN_ROW, Math.min(MAX_ROW, Math.round(460 / model.years.length) - ROW_GAP))
    const height = HEAD + model.years.length * (rowH + ROW_GAP) + 18

    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    this.svg.setAttribute('width', String(width))
    this.svg.setAttribute('height', String(height))
    this.svg.style.height = `${height}px`

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

    const out: string[] = []
    const add = (s: string) => out.push(s)
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const text = (x: number, y: number, s: string, fill: string, anchor: string, cls: string) =>
      add(
        `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${fill}" text-anchor="${anchor}" class="${cls}">${esc(s)}</text>`,
      )

    // Month scale. Ticks only where a month starts; no boxed axis.
    const monthNames = months()
    const tickPath: string[] = []
    let acc = 0
    for (let m = 0; m < 12; m++) {
      const x = x0 + acc * cellW
      text(x + 2, 13, monthNames[m], rgba(inkTertiary, 0.9), 'start', 'rb-label')
      rect(tickPath, x, HEAD - 5, 1, 4, 0)
      acc += new Date(Date.UTC(2001, m + 1, 0)).getUTCDate()
    }
    add(`<path d="${tickPath.join('')}" fill="${rgba(inkTertiary, 0.35)}"/>`)

    // Header for the annual-total column, aligned with the month scale.
    const barX = width - GUTTER_RIGHT + 12
    text(barX, 13, t('yearTotal'), rgba(inkTertiary, 0.9), 'start', 'rb-label')

    const totalMax = Math.max(1, ...model.years.map((y) => model.totals.get(y) ?? 0))
    const fromDoyLimit = this.limitFor(model.observedFrom)
    const toDoyLimit = this.limitFor(model.observedTo)

    // One bucket of day rectangles per colour step, plus the ones nothing was
    // watching and the ones that ran hot.
    const buckets: string[][] = Array.from({ length: HEAT_STEPS + 1 }, () => [])
    const unobservedPath: string[] = []
    const ringPath: string[] = []
    const railOn: Array<[Rgb, string[]]> = [
      [modisColor, []],
      [viirsColor, []],
    ]
    const railOff: string[] = []
    const barBg: string[] = []
    const barFill: string[][] = Array.from({ length: HEAT_STEPS + 1 }, () => [])
    const selectedBg: string[] = []

    model.years.forEach((year, i) => {
      const y = HEAD + i * (rowH + ROW_GAP)
      const row = model.rows.get(year)
      const span = daysInYear(year)
      const isSelected = year === this.selected

      // Year label: the selected row is the only one at full ink.
      text(
        GUTTER_LEFT - RAIL_W - 12,
        y + rowH / 2 + 4,
        String(year),
        rgba(isSelected ? inkPrimary : inkTertiary, isSelected ? 1 : 0.8),
        'end',
        isSelected ? 'rb-year rb-year--on' : 'rb-year',
      )

      // Sensor rail: one lane per instrument family, drawn edge to edge so the
      // filled years fuse into a continuous thread. The MODIS lane runs the
      // whole record; the VIIRS lane starts partway down and the record visibly
      // thickens where it does.
      const mask = model.sensorsByYear.get(year) ?? 0
      const laneH = rowH + ROW_GAP
      const lanes: boolean[] = [(mask & MODIS_MASK) !== 0, (mask & VIIRS_MASK) !== 0]
      lanes.forEach((on, lane) => {
        const lx = GUTTER_LEFT - RAIL_W + lane * 9
        rect(on ? railOn[lane][1] : railOff, lx, y - ROW_GAP / 2, 5, laneH, 0)
      })

      if (isSelected) rect(selectedBg, x0 - 3, y - 1, plotW + 6, rowH + 2, 5)

      for (let doy = 1; doy <= 366; doy++) {
        const x = x0 + (doy - 1) * cellW
        const w = Math.max(0.6, cellW - 0.35)

        const unobserved =
          doy > span ||
          (year === model.years[0] && doy < fromDoyLimit) ||
          (year === model.years[model.years.length - 1] && doy > toDoyLimit)

        if (unobserved) {
          // Absence must not read as a quiet day, in either theme: a neutral
          // grey separates "nothing was watching" from "nothing was burning".
          rect(unobservedPath, x, y, w, rowH)
          continue
        }

        const value = row ? row[doy] : 0
        const step = Math.round(heatScale(value, model.ceiling) * HEAT_STEPS)
        rect(buckets[step], x, y, w, rowH)

        if (value > 0 && value > model.clim.p90[doy] && model.clim.p90[doy] > 0) {
          rect(ringPath, x + 0.5, y + 0.5, w - 1, rowH - 1)
        }
      }

      // The year's total, as a bar. The calendar answers "when"; this column
      // answers "how much", and the two have to be read together — a long
      // smeared season and a short violent one can total the same.
      const total = model.totals.get(year) ?? 0
      const barH = Math.max(2, rowH - 3)
      const barY = y + (rowH - barH) / 2
      rect(barBg, barX, barY, TOTAL_BAR_W, barH, 2.5)
      if (total > 0) {
        const bw = Math.max(2, (total / totalMax) * TOTAL_BAR_W)
        const step = Math.round((0.55 + 0.4 * (total / totalMax)) * HEAT_STEPS)
        rect(barFill[step], barX, barY, bw, barH, 2.5)
      }
    })

    if (selectedBg.length) {
      add(`<path d="${selectedBg.join('')}" fill="${rgba(inkPrimary, 0.05)}"/>`)
    }
    railOn.forEach(([colour, path]) => {
      if (path.length) add(`<path d="${path.join('')}" fill="${rgba(colour, 0.9)}"/>`)
    })
    if (railOff.length) add(`<path d="${railOff.join('')}" fill="${rgba(inkTertiary, 0.12)}"/>`)
    if (unobservedPath.length) {
      add(`<path d="${unobservedPath.join('')}" fill="${rgba(inkTertiary, 0.16)}"/>`)
    }
    buckets.forEach((path, step) => {
      if (path.length) add(`<path d="${path.join('')}" fill="${rgba(heat(step / HEAT_STEPS), 1)}"/>`)
    })
    if (ringPath.length) {
      add(
        `<path d="${ringPath.join('')}" fill="none" stroke="${rgba(above, 0.85)}" stroke-width="1"/>`,
      )
    }
    if (barBg.length) add(`<path d="${barBg.join('')}" fill="${rgba(inkTertiary, 0.12)}"/>`)
    barFill.forEach((path, step) => {
      if (path.length) add(`<path d="${path.join('')}" fill="${rgba(heat(step / HEAT_STEPS), 0.9)}"/>`)
    })

    // Footer: the record span, stated once, in the same ink as the axis.
    const footY = HEAD + model.years.length * (rowH + ROW_GAP) + 13
    text(x0, footY, `${model.observedFrom} → ${model.observedTo}`, rgba(inkSecondary, 0.6), 'start', 'rb-mono')
    text(
      width - GUTTER_RIGHT,
      footY,
      `${t('legendRamp')} ≤ ${formatNumber(Math.round(model.ceiling))}`,
      rgba(inkTertiary, 0.75),
      'end',
      'rb-mono',
    )

    this.svg.innerHTML = out.join('')
  }

  private limitFor(iso: string): number {
    const d = new Date(`${iso}T00:00:00Z`)
    return Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1
  }

  /** The year under a point, anywhere across the row including its total bar. */
  private rowAt(clientY: number): number | null {
    const model = this.model
    if (!model) return null
    const y = clientY - this.svg.getBoundingClientRect().top
    const i = Math.floor((y - this.geom.y0) / this.geom.rowStep)
    if (i < 0 || i >= model.years.length) return null
    return model.years[i]
  }

  private hitAt(clientX: number, clientY: number): RibbonHit | null {
    const model = this.model
    if (!model) return null
    const rect_ = this.svg.getBoundingClientRect()
    const x = clientX - rect_.left
    const y = clientY - rect_.top

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
    const box = this.svg.getBoundingClientRect()
    this.onHover(hit, e.clientX - box.left, e.clientY - box.top)
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
