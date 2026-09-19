import { AOIS, aoiById } from './core/aoi'
import { daysInYear, dayOfYear, yearOf } from './core/grid'
import { quantileSorted } from './core/harmonize'
import {
  analyzeYear,
  annualTotals,
  annualTrend,
  climatology,
  concentrationDays,
  monthlyShare,
  summarizeYears,
  toYearGrid,
  type Climatology,
  type YearAnalysis,
} from './core/stats'
import { SENSOR_META, SENSORS, type SensorId } from './core/types'
import {
  applyStaticStrings,
  formatDate,
  formatDoy,
  formatDoyLong,
  formatNumber,
  formatDays,
  formatYears,
  getLang,
  monthOn,
  setLang,
  t,
  type Lang,
} from './i18n'
import {
  ArchiveMissing,
  boundsOf,
  datasetFromDetections,
  fetchLive,
  loadArchive,
  parseFiles,
  type Dataset,
} from './sources'
import { contribLegend, drawContrib, type ContribYear } from './ui/contrib'
import { drawCycle } from './ui/cycle'
import {
  ensureMap,
  invalidateMapSize,
  refreshBasemapTheme,
  setBasemap,
  updateMap,
  type Basemap,
  type MapProbe,
} from './ui/map'
import { burnTransition } from './ui/burn'
import { invalidateRamp } from './ui/paint'
import { Ribbon, type RibbonHit } from './ui/ribbon'

type Mode = 'harmonized' | 'raw'

/**
 * Below this many years, the per-day-of-year distribution is too thin to call
 * anything "normal", so the interface stops making comparisons against it.
 */
const MIN_BASELINE_YEARS = 4

interface State {
  dataset: Dataset | null
  year: number
  mode: Mode
  grid: Map<number, Float64Array>
  clim: Climatology | null
  years: number[]
  ceiling: number
  analysis: YearAnalysis | null
}

const state: State = {
  dataset: null,
  year: new Date().getUTCFullYear(),
  mode: 'harmonized',
  grid: new Map(),
  clim: null,
  years: [],
  ceiling: 1,
  analysis: null,
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const els = {
  aoi: $<HTMLSelectElement>('aoi'),
  mode: $<HTMLFieldSetElement>('mode'),
  source: $<HTMLFieldSetElement>('source'),
  lang: $<HTMLButtonElement>('lang'),
  theme: $<HTMLButtonElement>('theme'),
  mapEl: $('map'),
  basemap: $<HTMLFieldSetElement>('basemap'),
  mapProbe: $('map-probe'),
  mapNote: $('map-note'),
  sensors: $<HTMLUListElement>('sensors'),
  sensitivityNote: $('sensitivity-note'),
  provenance: $('provenance'),
  status: $('status'),
  ribbonCanvas: $<HTMLCanvasElement>('ribbon-canvas'),
  ribbonTip: $('ribbon-tip'),
  ribbonLegend: $('ribbon-legend'),
  cycleCanvas: $<HTMLCanvasElement>('cycle-canvas'),
  heroWhere: $('hero-where'),
  heroAnswer: $('hero-answer'),
  heroAside: $('hero-aside'),
  heroStats: $<HTMLDListElement>('hero-stats'),
  yearTitle: $('year-title'),
  splitTitle: $('split-title'),
  contribCanvas: $<HTMLCanvasElement>('contrib-canvas'),
  contribLegend: $('contrib-legend'),
  yearValue: $<HTMLOutputElement>('year-value'),
  yearPrev: $<HTMLButtonElement>('year-prev'),
  yearNext: $<HTMLButtonElement>('year-next'),
  verdict: $('verdict'),
  facts: $<HTMLDListElement>('facts'),
  periods: $<HTMLOListElement>('periods'),
  colophon: $('colophon-text'),
  metrics: $<HTMLDListElement>('metrics'),
  mapFacts: $<HTMLDListElement>('map-facts'),
  sensorSplit: $('sensor-split'),
  yearsBody: $<HTMLTableSectionElement>('years-body'),
  concentration: $('concentration'),
  export: $<HTMLButtonElement>('export'),
  blank: $('blank'),
  calendarNote: $('calendar-note'),
  modeExplain: $('mode-explain'),
  ribbonLegendWrap: $('ribbon-legend'),
  blankTitle: $('blank-title'),
  blankBody: $('blank-body'),
  ribbonWrap: $('ribbon-canvas-wrap'),
  paneArchive: $('pane-archive'),
  paneLive: $('pane-live'),
  paneFile: $('pane-file'),
  mapKey: $<HTMLInputElement>('map-key'),
  liveDays: $<HTMLSelectElement>('live-days'),
  liveFetch: $<HTMLButtonElement>('live-fetch'),
  dropzone: $('dropzone'),
  file: $<HTMLInputElement>('file'),
}

const ribbon = new Ribbon(els.ribbonCanvas, pickYear, showTip)

/** Only re-frame the map when the area changes, never on a year click. */
let mapFittedFor = ''

/** Coordinates and burn history of whatever the pointer is over. */
function showMapProbe(hit: MapProbe | null): void {
  if (!hit || !state.dataset) {
    els.mapProbe.hidden = true
    return
  }
  els.mapProbe.innerHTML = ''

  const coords = document.createElement('div')
  coords.textContent =
    `${Math.abs(hit.lat).toFixed(2)}°${hit.lat < 0 ? 'S' : 'N'} ` +
    `${Math.abs(hit.lon).toFixed(2)}°${hit.lon < 0 ? 'W' : 'E'}`

  const value = document.createElement('div')
  if (hit.days > 0) {
    const strong = document.createElement('b')
    strong.textContent = String(hit.days)
    // t() leaves {n} alone because it is not in the params, so it survives as a
    // split marker. A literal NUL here would make the source file binary.
    const [head, tail] = t('probeBurned', { total: daysInYear(state.year) }).split('{n}')
    value.append(document.createTextNode(head ?? ''), strong, document.createTextNode(tail ?? ''))
  } else {
    value.textContent = t('probeQuiet')
  }

  els.mapProbe.append(coords, value)
  els.mapProbe.hidden = false
}

/**
 * Every section except the calendar is meaningless without data. Leaving them
 * on screen as empty headings reads like a broken page, so they come and go
 * with the dataset.
 */
const dataSections = [...document.querySelectorAll<HTMLElement>('.band')].filter((el) => el.id !== 'calendar')
const heroSection = document.querySelector<HTMLElement>('.hero')!

function showDataSections(visible: boolean): void {
  heroSection.hidden = !visible
  for (const section of dataSections) section.hidden = !visible
}

/* ------------------------------------------------------------ status */

function status(message: string, tone: 'idle' | 'busy' | 'error' = 'idle'): void {
  els.status.textContent = message
  els.status.dataset.tone = tone
}

/* ------------------------------------------------------------ model */

function rebuild(): void {
  const ds = state.dataset
  if (!ds) return

  state.grid = toYearGrid(ds.adjusted, state.mode === 'harmonized')
  state.years = [...state.grid.keys()].sort((a, b) => a - b)
  state.clim = climatology(state.grid, 7)

  // Clip the ramp just below the extreme so an outlier day cannot black out
  // every ordinary one; the footer states the ceiling so nothing is hidden.
  const all: number[] = []
  for (const row of state.grid.values()) {
    for (let d = 1; d <= 366; d++) if (row[d] > 0) all.push(row[d])
  }
  all.sort((a, b) => a - b)
  state.ceiling = all.length ? Math.max(1, quantileSorted(all, 0.995)) : 1

  if (!state.years.includes(state.year)) {
    state.year = state.years[state.years.length - 1] ?? new Date().getUTCFullYear()
  }
  state.analysis = state.clim ? analyzeYear(state.year, state.grid, state.clim) : null
}

/* ------------------------------------------------------------ render */

function render(): void {
  const ds = state.dataset
  if (!ds || !state.clim) return

  const totals = new Map(annualTotals(state.grid).map((t2) => [t2.year, t2.total]))

  ribbon.setModel(
    {
      years: state.years,
      rows: state.grid,
      clim: state.clim,
      ceiling: state.ceiling,
      observedFrom: ds.range.from,
      observedTo: ds.range.to,
      sensorsByYear: ds.sensorsByYear,
      totals,
    },
    state.year,
  )

  els.yearValue.textContent = String(state.year)
  const i = state.years.indexOf(state.year)
  els.yearPrev.disabled = i <= 0
  els.yearNext.disabled = i < 0 || i >= state.years.length - 1

  drawCycle(els.cycleCanvas, {
    year: state.year,
    row: state.grid.get(state.year) ?? new Float64Array(367),
    clim: state.clim,
    span: daysInYear(state.year),
  })
  els.yearTitle.textContent = t('sectionYear', { year: state.year })
  els.splitTitle.textContent = t('splitTitle', { year: state.year })
  renderConcentration()

  drawContrib(els.contribCanvas, contribData(ds))
  updateMap({ bounds: ds.bounds, cells: ds.mapCells(state.year), cellKm: ds.mapCellKm }, ds.id !== mapFittedFor)
  mapFittedFor = ds.id

  renderHero(ds)
  renderModeExplain()
  renderLegends()
  renderSensors(ds)
  renderReading()
  renderProvenance(ds)
  renderMetrics(ds, totals)
  renderYearTable()
  renderSensorSplit(ds)
  renderMapFacts(ds)

  writeUrl()

  const cells = ds.mapCells(state.year).length
  els.mapNote.textContent = t('mapNoteArchive', { cells: formatNumber(cells), km: ds.mapCellKm, years: state.year })
}

/**
 * The answer, in a sentence, before any chart asks to be interpreted.
 *
 * Someone who reads only the top of this page should already know the two
 * things they came for: when this area burns, and whether the year they are
 * looking at is out of the ordinary.
 */
/** True when the selected year is the last one and the record stops mid-year. */
function isPartialYear(ds: Dataset): boolean {
  const last = state.years[state.years.length - 1]
  return state.year === last && !ds.range.to.endsWith('-12-31')
}

function renderHero(ds: Dataset): void {
  const a = state.analysis
  const aoi = aoiById(ds.id)
  const b = ds.bounds

  const coords =
    `${Math.abs(b.south).toFixed(1)}°${b.south < 0 ? 'S' : 'N'}–${Math.abs(b.north).toFixed(1)}°${b.north < 0 ? 'S' : 'N'}, ` +
    `${Math.abs(b.west).toFixed(1)}°${b.west < 0 ? 'W' : 'E'}–${Math.abs(b.east).toFixed(1)}°${b.east < 0 ? 'W' : 'E'}`
  els.heroWhere.textContent = aoi ? `${aoi.name[getLang()]} · ${coords}` : coords

  // The typical season comes from every other year, not from the one on screen.
  const typical = a?.normal ?? a?.shape ?? null
  els.heroAnswer.innerHTML = ''
  if (!typical) {
    els.heroAnswer.textContent = t('heroNoSeason')
  } else {
    const sentence = t('heroSeason', {
      start: formatDoyLong(typical.start, state.year),
      end: formatDoyLong(typical.end, state.year),
      peak: formatDoyLong(typical.peak, state.year),
    })
    els.heroAnswer.append(emphasiseDates(sentence))
  }

  els.heroAside.innerHTML = ''
  const baselineYears = state.clim?.years.length ?? 0
  if (isPartialYear(ds)) {
    els.heroAside.textContent = t('partialYear', { year: state.year, date: formatDate(ds.range.to) })
  } else if (a?.shape && baselineYears >= MIN_BASELINE_YEARS) {
    const ratio = a.totalRatio
    const ratioText = `${ratio.toFixed(ratio < 10 ? 1 : 0)}×`
    const key = ratio > 1.15 ? 'heroYearBusy' : ratio < 0.85 ? 'heroYearQuiet' : 'heroYearPlain'
    const line = document.createElement('span')
    line.textContent = t(key, { year: state.year, ratio: ratioText })
    els.heroAside.append(line)

    const row = state.grid.get(state.year)
    const half = row ? concentrationDays(row, daysInYear(state.year), 0.5) : 0
    if (half > 0) {
      els.heroAside.append(document.createTextNode(' '), boldSpan(t('heroConcentration', { n: half })))
    }
  } else if (baselineYears > 0) {
    els.heroAside.textContent = t('shortBaseline', { n: formatYears(baselineYears) })
  }

  els.heroStats.innerHTML = ''
  const totalFires = ds.days.reduce((s, d) => s + d.activeCells, 0)

  if (typical) {
    heroStat(t('statTypical'), `${formatDoy(typical.start)} – ${formatDoy(typical.end)}`, formatDays(typical.length))
  }
  if (a?.shape) {
    heroStat(t('statThisYear'), `${formatDoy(a.shape.start, state.year)} – ${formatDoy(a.shape.end, state.year)}`, String(state.year))
  }
  heroStat(t('statWatching'), ds.range.from.slice(0, 4), formatYears(state.years.length))
  heroStat(t('statFires'), compact(totalFires), t('cellsUnit'))
}

/** Put the accent on the dates, which is what the sentence is actually about. */
function emphasiseDates(sentence: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const parts = sentence.split(/(\d{1,2}\s+\p{L}+)/gu)
  for (const part of parts) {
    if (/^\d{1,2}\s+\p{L}+$/u.test(part)) {
      const em = document.createElement('em')
      em.textContent = part
      frag.append(em)
    } else if (part) {
      frag.append(document.createTextNode(part))
    }
  }
  return frag
}

function boldSpan(text: string): HTMLElement {
  const b = document.createElement('b')
  b.textContent = text
  return b
}

function heroStat(label: string, value: string, note: string): void {
  const wrap = document.createElement('div')
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  const small = document.createElement('small')
  small.textContent = note
  dd.append(small)
  wrap.append(dt, dd)
  els.heroStats.append(wrap)
}

/** Says what the mode switch actually does, in the mode it is currently in. */
function renderModeExplain(): void {
  const harmonized = state.mode === 'harmonized'
  els.modeExplain.dataset.mode = state.mode
  els.modeExplain.innerHTML = ''

  const label = document.createElement('b')
  label.textContent = harmonized ? t('modeHarmonized') : t('modeRaw')
  const body = document.createElement('span')
  body.textContent = harmonized ? t('modeExplainHarmonized') : t('modeExplainRaw')
  const hint = document.createElement('i')
  hint.textContent = ' ' + t('modeCompare')
  body.append(hint)

  els.modeExplain.append(label, body)
}

/** Canvas-only repaint: safe to call on resize, because it changes no layout. */
function redrawCanvases(): void {
  const ds = state.dataset
  if (!ds || !state.clim) return

  ribbon.draw()
  drawCycle(els.cycleCanvas, {
    year: state.year,
    row: state.grid.get(state.year) ?? new Float64Array(367),
    clim: state.clim,
    span: daysInYear(state.year),
  })
  drawContrib(els.contribCanvas, contribData(ds))
  // The map owns its own sizing; it only needs to be told the box changed.
  invalidateMapSize()
}

/**
 * The band under the calendar. Six numbers that say how much record there is,
 * how much of it harmonization actually merged, and which way it is moving —
 * the questions a reader has before they trust any single year.
 */
function renderMetrics(ds: Dataset, totals: Map<number, number>): void {
  els.metrics.innerHTML = ''
  els.metrics.hidden = false

  const activeCellDays = ds.days.reduce((s, d) => s + d.activeCells, 0)
  const merged = Math.max(0, ds.totals.rawDetections - activeCellDays)
  const mergedPct = ds.totals.rawDetections > 0 ? (merged / ds.totals.rawDetections) * 100 : 0
  const peakDay = ds.days.reduce((best, d) => (d.frp > best.frp ? d : best), ds.days[0])
  const biggest = [...totals.entries()].sort((a, b) => b[1] - a[1])[0]
  const trend = annualTrend(state.grid)

  metric(t('metricYears'), String(state.years.length), `${ds.range.from.slice(0, 4)}–${ds.range.to.slice(0, 4)}`)
  metric(t('metricActive'), compact(activeCellDays), t('cellsUnit'))
  metric(t('metricDetections'), compact(ds.totals.rawDetections), '')
  metric(t('metricMerged'), `${mergedPct.toFixed(0)}%`, t('mergedNote'))

  if (trend && Math.abs(trend.slopePct) >= 0.01) {
    const pct = trend.slopePct * 100
    metric(t('metricTrend'), `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, '', pct > 0 ? 'up' : 'down')
  } else {
    metric(t('metricTrend'), '—', t('trendFlat'))
  }

  if (biggest) metric(t('metricPeakYear'), String(biggest[0]), compact(Math.round(biggest[1])))
  if (peakDay && peakDay.frp > 0) metric(t('metricPower'), `${compact(Math.round(peakDay.frp))}`, 'MW')
}

function metric(label: string, value: string, note: string, tone?: 'up' | 'down'): void {
  const wrap = document.createElement('div')
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  if (tone) dd.dataset.tone = tone
  if (note) {
    const small = document.createElement('small')
    small.textContent = note
    dd.append(small)
  }
  wrap.append(dt, dd)
  els.metrics.append(wrap)
}

/** 12 400 rather than 12,431 — the extra digits are noise at this size. */
function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 10_000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`
  return formatNumber(value)
}

type SortKey = 'year' | 'start' | 'peak' | 'length' | 'total' | 'ratio' | 'above'

const sort: { key: SortKey; desc: boolean } = { key: 'year', desc: false }

function sortValue(r: ReturnType<typeof summarizeYears>[number], key: SortKey): number {
  switch (key) {
    case 'start':
      return r.shape?.start ?? Infinity
    case 'peak':
      return r.shape?.peak ?? Infinity
    case 'length':
      return r.shape?.length ?? -1
    case 'total':
      return r.shape?.total ?? -1
    case 'ratio':
      return r.ratio
    case 'above':
      return r.daysAboveP90
    default:
      return r.year
  }
}

function renderYearTable(): void {
  els.yearsBody.innerHTML = ''
  if (!state.clim) return

  const rows = summarizeYears(state.grid, state.clim)
  rows.sort((a, b) => {
    const d = sortValue(a, sort.key) - sortValue(b, sort.key)
    return sort.desc ? -d : d
  })
  const maxTotal = Math.max(1, ...rows.map((r) => r.shape?.total ?? 0))
  const trustworthy = state.clim.years.length >= MIN_BASELINE_YEARS

  for (const r of rows) {
    const tr = document.createElement('tr')
    tr.setAttribute('aria-selected', String(r.year === state.year))
    tr.tabIndex = 0
    tr.addEventListener('click', () => pickYear(r.year))
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        pickYear(r.year)
      }
    })

    const total = r.shape?.total ?? 0
    const cells: Array<{ text: string; cls?: string; bar?: number; hot?: boolean }> = [
      { text: String(r.year), cls: 'year-cell' },
      { text: r.shape ? `${formatDoy(r.shape.start, r.year)} → ${formatDoy(r.shape.end, r.year)}` : '—' },
      { text: r.shape ? formatDoy(r.shape.peak, r.year) : '—' },
      { text: r.shape ? String(r.shape.length) : '—', cls: 'num' },
      { text: compact(Math.round(total)), cls: 'num bar-cell', bar: (total / maxTotal) * 100 },
      { text: trustworthy && r.ratio > 0 ? `${r.ratio.toFixed(1)}×` : '—', cls: 'num' },
      {
        text: trustworthy ? String(r.daysAboveP90) : '—',
        cls: 'num above-cell',
        hot: trustworthy && r.daysAboveP90 > 14,
      },
    ]

    for (const cell of cells) {
      const td = document.createElement('td')
      if (cell.cls) td.className = cell.cls
      if (cell.bar !== undefined) {
        td.style.setProperty('--bar', `${cell.bar.toFixed(1)}%`)
        const span = document.createElement('span')
        span.textContent = cell.text
        td.append(span)
      } else {
        td.textContent = cell.text
      }
      if (cell.hot) td.dataset.hot = 'true'
      tr.append(td)
    }
    els.yearsBody.append(tr)
  }
}

/** How the selected year's cells divide between the instrument families. */
function renderSensorSplit(ds: Dataset): void {
  els.sensorSplit.innerHTML = ''

  let modisOnly = 0
  let both = 0
  let viirsOnly = 0
  for (const d of ds.days) {
    if (yearOf(d.day) !== state.year) continue
    modisOnly += d.modisOnly
    both += d.both
    viirsOnly += d.viirsOnly
  }
  const total = modisOnly + both + viirsOnly
  if (total === 0) return

  const parts: Array<[string, number, string]> = [
    [t('splitModis'), modisOnly, 'var(--sensor-modis)'],
    [t('splitBoth'), both, 'var(--sensor-both)'],
    [t('splitViirs'), viirsOnly, 'var(--sensor-viirs)'],
  ]

  const track = document.createElement('div')
  track.className = 'split-bar__track'
  for (const [, value, color] of parts) {
    const seg = document.createElement('span')
    seg.className = 'split-bar__seg'
    seg.style.flexGrow = String(value)
    seg.style.background = color
    if (value === 0) seg.style.display = 'none'
    track.append(seg)
  }

  const keys = document.createElement('div')
  keys.className = 'split-bar__keys'
  for (const [label, value, color] of parts) {
    const key = document.createElement('div')
    key.className = 'split-bar__key'
    const dot = document.createElement('i')
    dot.style.background = color
    const name = document.createElement('span')
    name.textContent = label
    const count = document.createElement('b')
    count.textContent = compact(value)
    const pct = document.createElement('span')
    pct.textContent = `${((value / total) * 100).toFixed(0)}%`
    key.append(dot, name, count, pct)
    keys.append(key)
  }

  els.sensorSplit.append(track, keys)
}

function renderMapFacts(ds: Dataset): void {
  els.mapFacts.innerHTML = ''
  const all = ds.mapCells(null)
  const thisYear = ds.mapCells(state.year)
  const busiest = all.reduce((m, c) => Math.max(m, c.days), 0)

  const b = ds.bounds
  const midLat = ((b.north + b.south) / 2) * (Math.PI / 180)
  const km2 = (b.east - b.west) * 111.32 * Math.cos(midLat) * ((b.north - b.south) * 111.32)

  miniFact(t('mapCovered'), compact(all.length))
  miniFact(t('mapThisYear'), compact(thisYear.length))
  miniFact(t('mapHottest'), formatDays(busiest))
  miniFact(t('mapArea'), `${compact(Math.round(km2))} km²`)
}

/**
 * The one sentence the cycle chart cannot say on its own: how tightly the year
 * is packed. A season that delivers half its burning in nine days is a
 * different operational problem from one that spreads it over two months.
 */
function renderConcentration(): void {
  const row = state.grid.get(state.year)
  const span = daysInYear(state.year)
  const days = row ? concentrationDays(row, span, 0.5) : 0
  if (!row || days === 0) {
    els.concentration.textContent = ''
    return
  }

  const shares = monthlyShare(row, state.year)
  let peakMonth = 0
  for (let m = 1; m < 12; m++) if (shares[m] > shares[peakMonth]) peakMonth = m

  // t() only substitutes the keys it is handed, so {n} survives to split on.
  const template = t('concentrationLine', {
    year: state.year,
    pct: Math.round(shares[peakMonth] * 100),
    month: monthOn(peakMonth),
  })
  const [head, tail] = template.split('{n}')

  const strong = document.createElement('b')
  strong.textContent = String(days)
  els.concentration.innerHTML = ''
  els.concentration.append(document.createTextNode(head), strong, document.createTextNode(tail ?? ''))
}
/**
 * Hand the whole harmonized series back as a file. Raw and adjusted columns go
 * out together, with the adjustment flagged per row, so nobody downstream
 * inherits the scaling without knowing it is there.
 */
function exportSeries(): void {
  const ds = state.dataset
  if (!ds) return

  const header = [
    'local_solar_day',
    'active_cells_raw',
    'active_cells_harmonized',
    'harmonized_lo',
    'harmonized_hi',
    'scaling_applied',
    'modis_only_cells',
    'both_families_cells',
    'viirs_only_cells',
    'frp_mw',
    'raw_detections',
  ].join(',')

  const byDay = new Map(ds.days.map((d) => [d.day, d]))
  const lines = ds.adjusted.map((a) => {
    const d = byDay.get(a.day)
    return [
      a.day,
      a.raw,
      a.value.toFixed(2),
      a.lo.toFixed(2),
      a.hi.toFixed(2),
      a.adjusted ? 'yes' : 'no',
      d?.modisOnly ?? 0,
      d?.both ?? 0,
      d?.viirsOnly ?? 0,
      d?.frp ?? 0,
      d?.raw ?? 0,
    ].join(',')
  })

  const note =
    `# Emberline harmonized burning activity - ${ds.id}\n` +
    `# ${ds.provenance}\n` +
    `# Harmonized on a 1 km grid, local solar days.\n` +
    `# Sensitivity factor ${ds.sensitivity.k.toFixed(3)} ` +
    `[${ds.sensitivity.lo.toFixed(3)}-${ds.sensitivity.hi.toFixed(3)}] ` +
    `from ${ds.sensitivity.samples} paired days.\n`

  const blob = new Blob([note, header, '\n', lines.join('\n'), '\n'], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `emberline-${ds.id}-${ds.range.from}-${ds.range.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function miniFact(label: string, value: string): void {
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  els.mapFacts.append(dt, dd)
}

function contribData(ds: Dataset): ContribYear[] {
  const byYear = new Map<number, ContribYear>()
  for (const d of ds.days) {
    const y = yearOf(d.day)
    let row = byYear.get(y)
    if (!row) byYear.set(y, (row = { year: y, modisOnly: 0, both: 0, viirsOnly: 0 }))
    row.modisOnly += d.modisOnly
    row.both += d.both
    row.viirsOnly += d.viirsOnly
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year)
}

function renderLegends(): void {
  els.ribbonLegend.innerHTML = ''
  const ramp = document.createElement('span')
  ramp.className = 'legend__item'
  const bar = document.createElement('span')
  bar.className = 'legend__ramp'
  ramp.append(bar, document.createTextNode(t('legendRamp')))
  els.ribbonLegend.append(ramp, swatch('transparent', t('legendAbove'), true))

  els.contribLegend.innerHTML = ''
  for (const entry of contribLegend()) {
    els.contribLegend.append(swatch(entry.color, entry.label))
  }
}

function swatch(color: string, label: string, ring = false): HTMLElement {
  const item = document.createElement('span')
  item.className = 'legend__item'
  const box = document.createElement('span')
  box.className = 'legend__swatch'
  box.style.background = color
  if (ring) box.style.boxShadow = 'inset 0 0 0 1.5px var(--signal-above)'
  item.append(box, document.createTextNode(label))
  return item
}

function renderSensors(ds: Dataset): void {
  els.sensors.innerHTML = ''
  for (const id of SENSORS) {
    const meta = SENSOR_META[id]
    const present = ds.sensors.includes(id)
    const li = document.createElement('li')
    li.className = 'sensor'

    const dot = document.createElement('span')
    dot.className = 'sensor__dot'
    dot.style.background = present
      ? meta.platform === 'modis'
        ? 'var(--sensor-modis)'
        : 'var(--sensor-viirs)'
      : 'var(--edge-strong)'

    const name = document.createElement('span')
    name.className = 'sensor__name'
    name.textContent = `${meta.label} · ${meta.pixelM} m`
    if (!present) name.style.color = 'var(--ink-muted)'

    const span = document.createElement('span')
    span.className = 'sensor__span'
    span.textContent = present ? t('sensorFrom', { date: meta.since.slice(0, 7) }) : t('sensorAbsent')

    li.append(dot, name, span)
    els.sensors.append(li)
  }

  const s = ds.sensitivity
  els.sensitivityNote.textContent =
    s.samples >= 10
      ? t('sensitivity', {
          k: s.k.toFixed(2),
          lo: s.lo.toFixed(2),
          hi: s.hi.toFixed(2),
          n: formatNumber(s.samples),
        })
      : t('sensitivityUnknown')
}

function renderProvenance(ds: Dataset): void {
  els.provenance.textContent = t('provenanceLine', {
    provenance: ds.provenance,
    days: formatNumber(ds.days.length),
    detections: formatNumber(ds.totals.rawDetections),
    dropped: formatNumber(ds.totals.nonVegetation),
  })
  els.colophon.textContent = t('colophon')
}

function renderReading(): void {
  const a = state.analysis
  els.facts.innerHTML = ''
  els.periods.innerHTML = ''

  if (!a || !a.shape) {
    els.verdict.textContent = t('verdictNoSeason', { year: state.year })
    return
  }

  const ratio = a.totalRatio
  const ratioText = `${ratio.toFixed(ratio < 10 ? 1 : 0)}×`
  const quiet = ratio < 0.8 && a.critical.length === 0

  const sentence = quiet
    ? t('verdictQuiet', { ratio: ratioText })
    : t('verdictBusy', { ratio: ratioText, days: formatDays(a.daysAboveP90) })

  els.verdict.innerHTML = ''

  // A "normal" built from two years is not a normal. Say so rather than
  // reporting a 293-day shift against a baseline that cannot support one.
  const baselineYears = state.clim?.years.length ?? 0
  const runningYear = state.dataset ? isPartialYear(state.dataset) : false
  if (baselineYears < MIN_BASELINE_YEARS) {
    els.verdict.append(document.createTextNode(t('shortBaseline', { n: formatYears(baselineYears) })))
  } else if (runningYear) {
    els.verdict.append(document.createTextNode(t('partialYearShort', { year: state.year })))
  } else {
    const shift = a.startShiftDays
    const shiftText =
      shift === null || Math.abs(shift) < 4
        ? t('shiftOnTime')
        : shift < 0
          ? t('shiftEarlier', { n: Math.abs(shift) })
          : t('shiftLater', { n: shift })

    const peakShift = a.peakShiftDays
    const peakText =
      peakShift === null || Math.abs(peakShift) < 4
        ? t('peakOnTime')
        : peakShift < 0
          ? t('peakEarlier', { n: Math.abs(peakShift) })
          : t('peakLater', { n: peakShift })

    els.verdict.append(highlight(sentence), document.createTextNode(` ${shiftText}, ${peakText}.`))
  }

  const partial = state.dataset ? isPartialYear(state.dataset) : false
  const trustworthy = baselineYears >= MIN_BASELINE_YEARS && !partial

  fact(
    t('factPeak'),
    formatDoy(a.shape.peak, state.year),
    `${formatNumber(Math.round(a.shape.peakValue))} ${t('cellsUnit')}`,
  )
  fact(t('factSeason'), `${formatDoy(a.shape.start, state.year)}`, `→ ${formatDoy(a.shape.end, state.year)}`)
  fact(
    t('factLength'),
    `${a.shape.length}`,
    trustworthy && a.lengthShiftDays !== null ? `${t('daysUnit')} · ${signed(a.lengthShiftDays)}` : t('daysUnit'),
  )

  const row = state.grid.get(state.year)
  if (row) {
    const half = concentrationDays(row, daysInYear(state.year), 0.5)
    if (half > 0) fact(t('factConcentration'), String(half), t('daysUnit'))
  }

  // Both of these are statements about a baseline, so they need one.
  if (trustworthy) {
    fact(t('factAbove'), String(a.daysAboveP90), t('daysUnit'))
    fact(t('factTotal'), ratioText, t('ofNormal'))
  }

  if (!trustworthy || a.critical.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    // The hero already carries the long version of the caveat; repeating it
    // word for word three times down one screen reads like a stuck record.
    empty.textContent = trustworthy
      ? t('noPeriods')
      : partial
        ? t('partialYearShort', { year: state.year })
        : t('shortBaseline', { n: formatYears(baselineYears) })
    els.periods.append(empty)
    return
  }

  for (const p of a.critical.slice(0, 4)) {
    const li = document.createElement('li')
    li.className = 'period'

    const span = document.createElement('span')
    span.className = 'period__span'
    span.textContent = `${formatDoy(p.startDoy, state.year)} → ${formatDoy(p.endDoy, state.year)}`

    const meta = document.createElement('span')
    meta.className = 'period__meta'
    const ratioLabel = Number.isFinite(p.ratio) ? t('periodRatio', { n: p.ratio.toFixed(1) }) : ''
    meta.textContent = `${t('periodDays', { n: p.days })} · ${ratioLabel}`

    li.append(span, meta)
    els.periods.append(li)
  }
}

/** Wrap the leading number of a sentence in the accent, once. */
function highlight(sentence: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const match = /([\d.,]+×)/.exec(sentence)
  if (!match) {
    frag.append(document.createTextNode(sentence))
    return frag
  }
  const em = document.createElement('em')
  em.textContent = match[1]
  frag.append(
    document.createTextNode(sentence.slice(0, match.index)),
    em,
    document.createTextNode(sentence.slice(match.index + match[1].length)),
  )
  return frag
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function fact(label: string, value: string, note: string): void {
  const wrap = document.createElement('div')
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  const small = document.createElement('small')
  small.textContent = note
  dd.append(small)
  wrap.append(dt, dd)
  els.facts.append(wrap)
}

/* ------------------------------------------------------------ tooltip */

function showTip(hit: RibbonHit | null, x: number, y: number): void {
  if (!hit || !state.clim) {
    els.ribbonTip.hidden = true
    return
  }

  const day = state.dataset?.days.find(
    (d) => yearOf(d.day) === hit.year && dayOfYear(d.day) === hit.doy,
  )

  els.ribbonTip.innerHTML = ''
  const title = document.createElement('div')
  title.className = 'tip__day'
  title.textContent = `${formatDoy(hit.doy, hit.year)} ${hit.year}`

  const value = document.createElement('div')
  value.className = 'tip__value'
  value.textContent = `${formatNumber(Math.round(hit.value))} ${t('legendRamp')}`

  const rows = document.createElement('div')
  rows.className = 'tip__rows'
  rows.append(
    tipRow(t('median'), formatNumber(Math.round(state.clim.median[hit.doy]))),
    tipRow('p90', formatNumber(Math.round(state.clim.p90[hit.doy]))),
  )
  if (day) {
    rows.append(
      tipRow(t('legendModis'), formatNumber(day.modisOnly)),
      tipRow(t('legendBoth'), formatNumber(day.both)),
      tipRow(t('legendViirs'), formatNumber(day.viirsOnly)),
    )
    if (day.frp > 0) rows.append(tipRow('FRP', `${formatNumber(Math.round(day.frp))} MW`))
    if (day.raw > day.activeCells) {
      rows.append(tipRow(t('metricMerged'), `${formatNumber(day.raw)} → ${formatNumber(day.activeCells)}`))
    }
  }

  els.ribbonTip.append(title, value, rows)
  els.ribbonTip.hidden = false

  const wrap = els.ribbonTip.parentElement!
  const tipW = els.ribbonTip.offsetWidth
  const left = Math.min(Math.max(8, x + 14), wrap.clientWidth - tipW - 8)
  els.ribbonTip.style.left = `${left}px`
  els.ribbonTip.style.top = `${Math.max(4, y + 16)}px`
}

function tipRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'tip__row'
  const l = document.createElement('span')
  l.textContent = label
  const v = document.createElement('b')
  v.textContent = value
  row.append(l, v)
  return row
}

/* ------------------------------------------------------------ actions */

function pickYear(year: number): void {
  state.year = year
  state.analysis = state.clim ? analyzeYear(year, state.grid, state.clim) : null
  render()
}

/** Nothing to draw: say why, and leave no stale numbers from the last area. */
function showBlank(): void {
  state.dataset = null
  state.years = []
  state.clim = null
  state.analysis = null
  els.blank.hidden = false
  els.ribbonWrap.hidden = true
  els.calendarNote.hidden = true
  els.ribbonLegendWrap.hidden = true
  els.modeExplain.hidden = true
  showDataSections(false)
  els.blankTitle.textContent = t('emptyArchiveTitle')
  els.blankBody.textContent = t('emptyArchiveBody')

  els.verdict.textContent = ''
  els.facts.innerHTML = ''
  els.periods.innerHTML = ''
  els.sensors.innerHTML = ''
  els.metrics.innerHTML = ''
  els.metrics.hidden = true
  els.heroAnswer.textContent = ''
  els.heroAside.textContent = ''
  els.heroStats.innerHTML = ''
  els.heroWhere.textContent = ''
  els.mapFacts.innerHTML = ''
  els.sensorSplit.innerHTML = ''
  els.yearsBody.innerHTML = ''
  els.concentration.textContent = ''

  const row = document.createElement('tr')
  const cell = document.createElement('td')
  cell.colSpan = 7
  cell.className = 'table-empty'
  cell.textContent = t('statusNoArchive')
  row.append(cell)
  els.yearsBody.append(row)
  els.sensitivityNote.textContent = ''
  els.provenance.textContent = ''
  els.mapNote.textContent = ''
  els.yearValue.textContent = '—'
  els.yearPrev.disabled = true
  els.yearNext.disabled = true
  for (const canvas of [els.cycleCanvas, els.contribCanvas]) {
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }
}

/**
 * Guards against a slow request for an area the user has already navigated away
 * from: without it, a late failure can wipe the view that replaced it.
 */
let loadToken = 0

async function selectAoi(id: string, wantYear?: number): Promise<void> {
  const token = ++loadToken
  status(t('statusLoading'), 'busy')
  try {
    const ds = await loadArchive(id)
    if (token !== loadToken) return
    state.dataset = ds
    state.year = ds.days.length ? yearOf(ds.days[ds.days.length - 1].day) : state.year
    if (wantYear) state.year = wantYear
    els.blank.hidden = true
    els.ribbonWrap.hidden = false
    els.calendarNote.hidden = false
    els.ribbonLegendWrap.hidden = false
    els.modeExplain.hidden = false
    showDataSections(true)
    rebuild()
    render()
    status('')
  } catch (e) {
    if (token !== loadToken) return
    showBlank()
    status(e instanceof ArchiveMissing ? t('statusNoArchive') : t('statusFailed', { err: String(e) }), 'error')
  }
}

async function runLive(): Promise<void> {
  const key = els.mapKey.value.trim()
  if (!key) {
    status(t('statusNeedKey'), 'error')
    return
  }
  const aoi = aoiById(els.aoi.value)
  if (!aoi) return

  els.liveFetch.disabled = true
  status(t('statusFetching'), 'busy')
  try {
    const days = Number(els.liveDays.value)
    const result = await fetchLive(key, aoi.bounds, days)
    if (result.detections.length === 0) {
      status(result.failures[0] ?? t('statusNoRows'), 'error')
      return
    }
    status(t('statusParsing'), 'busy')
    const ds = datasetFromDetections(
      aoi.id,
      aoi.bounds,
      `NASA FIRMS live query, ${days} day window, retrieved ${formatDate(new Date().toISOString().slice(0, 10))}`,
      result.detections,
      result.nonVegetation,
    )
    state.dataset = ds
    rebuild()
    render()
    status(
      t('statusLiveDone', {
        n: formatNumber(result.detections.length),
        days,
        cells: formatNumber(ds.days.reduce((s, d) => s + d.activeCells, 0)),
      }) + (state.years.length < 4 ? ` ${t('statusShortRecord')}` : ''),
    )
  } catch (e) {
    status(t('statusFailed', { err: String(e) }), 'error')
  } finally {
    els.liveFetch.disabled = false
  }
}

async function loadFiles(files: FileList | null): Promise<void> {
  if (!files || files.length === 0) return
  status(t('statusParsing'), 'busy')
  try {
    const texts = await Promise.all([...files].map((f) => f.text()))
    const { detections, nonVegetation } = parseFiles(texts)
    if (detections.length === 0) {
      status(t('statusNoRows'), 'error')
      return
    }
    const ds = datasetFromDetections(
      'upload',
      boundsOf(detections),
      `Uploaded FIRMS export, ${files.length} file(s)`,
      detections,
      nonVegetation,
    )
    state.dataset = ds
    rebuild()
    render()
    status(
      t('statusFileDone', {
        n: formatNumber(detections.length),
        files: files.length,
        cells: formatNumber(ds.days.reduce((s, d) => s + d.activeCells, 0)),
      }) + (state.years.length < 4 ? ` ${t('statusShortRecord')}` : ''),
    )
  } catch (e) {
    status(t('statusFailed', { err: String(e) }), 'error')
  }
}

/* ------------------------------------------------------------ chrome */

function fillAoiOptions(): void {
  const selected = els.aoi.value
  els.aoi.innerHTML = ''
  for (const aoi of AOIS) {
    const option = document.createElement('option')
    option.value = aoi.id
    option.textContent = aoi.name[getLang()]
    els.aoi.append(option)
  }
  if (selected) els.aoi.value = selected
}

function applyTheme(theme: 'night' | 'day'): void {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('emberline.theme', theme)
  els.theme.querySelector('[data-theme-icon]')!.textContent = theme === 'night' ? '☾' : '☀'
  invalidateRamp()
  refreshBasemapTheme()
  render()
}

/**
 * Switching theme burns the old one away rather than cutting to the new one.
 * The swap happens under the cover, so the repaint of every canvas and the map
 * tiles is hidden behind the fire instead of flashing through it.
 */
function setTheme(theme: 'night' | 'day'): void {
  burnTransition(() => applyTheme(theme))
}

function switchLang(lang: Lang): void {
  setLang(lang)
  localStorage.setItem('emberline.lang', lang)
  els.lang.textContent = lang === 'en' ? 'RU' : 'EN'
  applyStaticStrings()
  fillAoiOptions()
  render()
}

function showSourcePane(kind: string): void {
  els.paneArchive.hidden = kind !== 'archive'
  els.paneLive.hidden = kind !== 'live'
  els.paneFile.hidden = kind !== 'file'
  if (kind === 'archive') void selectAoi(els.aoi.value)
}

function wire(): void {
  els.aoi.addEventListener('change', () => void selectAoi(els.aoi.value))

  els.mode.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement
    state.mode = input.value as Mode
    rebuild()
    render()
  })

  els.source.addEventListener('change', (e) => {
    showSourcePane((e.target as HTMLInputElement).value)
  })

  els.lang.addEventListener('click', () => switchLang(getLang() === 'en' ? 'ru' : 'en'))
  els.theme.addEventListener('click', () =>
    setTheme(document.documentElement.dataset.theme === 'night' ? 'day' : 'night'),
  )

  els.yearPrev.addEventListener('click', () => {
    const i = state.years.indexOf(state.year)
    if (i > 0) pickYear(state.years[i - 1])
  })
  els.yearNext.addEventListener('click', () => {
    const i = state.years.indexOf(state.year)
    if (i >= 0 && i < state.years.length - 1) pickYear(state.years[i + 1])
  })

  // Hovering the map answers "what is that bright square?" without a click.
  els.basemap.addEventListener('change', (e) => {
    setBasemap((e.target as HTMLInputElement).value as Basemap)
  })

  els.export.addEventListener('click', exportSeries)

  $('years-head').addEventListener('click', (e) => {
    const th = (e.target as HTMLElement).closest('th')
    const key = th?.dataset.sort as SortKey | undefined
    if (!key) return
    // Same column toggles direction; a new column starts ascending.
    if (sort.key === key) sort.desc = !sort.desc
    else {
      sort.key = key
      sort.desc = false
    }
    for (const head of $('years-head').querySelectorAll('th')) head.removeAttribute('aria-sort')
    th!.setAttribute('aria-sort', sort.desc ? 'descending' : 'ascending')
    renderYearTable()
  })
  els.liveFetch.addEventListener('click', () => void runLive())
  els.file.addEventListener('change', () => void loadFiles(els.file.files))
  els.dropzone.addEventListener('click', () => els.file.click())
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      els.file.click()
    }
  })
  els.dropzone.addEventListener('dragover', (e) => {
    e.preventDefault()
    els.dropzone.classList.add('is-over')
  })
  els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('is-over'))
  els.dropzone.addEventListener('drop', (e) => {
    e.preventDefault()
    els.dropzone.classList.remove('is-over')
    void loadFiles(e.dataTransfer?.files ?? null)
  })

  /*
   * Resizing must only redraw the canvases, never rebuild the DOM.
   *
   * A full render changes the table's height, which changes the page height,
   * which makes the scrollbar appear or vanish, which changes the width the
   * observer is watching — and the observer renders again. That loop locks the
   * tab solid. Redrawing canvases alone cannot change the page height, so it
   * cannot feed itself. `scrollbar-gutter: stable` removes the oscillation at
   * the source as well.
   */
  let frame = 0
  let lastWidth = 0
  const redraw = (force = false) => {
    const width = document.querySelector('.page')!.clientWidth
    if (!force && Math.abs(width - lastWidth) < 2) return
    lastWidth = width
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(redrawCanvases)
  }
  window.addEventListener('resize', () => redraw(true))
  new ResizeObserver(() => redraw()).observe(document.querySelector('.page')!)
}

/* ------------------------------------------------------------ boot */

/**
 * The view lives in the URL.
 *
 * Someone who finds something worth showing — the 2020 season in the Sierra,
 * the raw record before reconciliation — can send the link and the other person
 * lands on exactly that, rather than on the default view with instructions.
 */
interface UrlState {
  aoi?: string
  year?: number
  mode?: Mode
}

function readUrl(): UrlState {
  const raw = location.hash.replace(/^#\/?/, '')
  if (!raw) return {}
  const [aoi, year, mode] = raw.split('/')
  return {
    aoi: aoi && aoiById(aoi) ? aoi : undefined,
    year: year && /^\d{4}$/.test(year) ? Number(year) : undefined,
    mode: mode === 'raw' || mode === 'harmonized' ? mode : undefined,
  }
}

/** Replace rather than push: the back button should leave the page, not undo a click. */
function writeUrl(): void {
  const ds = state.dataset
  if (!ds) return
  const next = `#/${ds.id}/${state.year}/${state.mode}`
  if (location.hash !== next) history.replaceState(null, '', next)
}

let applyingUrl = false

function applyUrl(): void {
  const wanted = readUrl()
  if (applyingUrl) return
  applyingUrl = true

  if (wanted.mode && wanted.mode !== state.mode) {
    state.mode = wanted.mode
    const input = els.mode.querySelector<HTMLInputElement>(`input[value="${wanted.mode}"]`)
    if (input) input.checked = true
  }

  const changeArea = wanted.aoi && wanted.aoi !== els.aoi.value
  if (changeArea) {
    els.aoi.value = wanted.aoi!
    void selectAoi(wanted.aoi!, wanted.year).finally(() => {
      applyingUrl = false
    })
    return
  }

  if (wanted.year && state.years.includes(wanted.year)) {
    state.year = wanted.year
    rebuild()
    render()
  } else if (wanted.mode) {
    rebuild()
    render()
  }
  applyingUrl = false
}

async function boot(): Promise<void> {
  const savedLang = (localStorage.getItem('emberline.lang') as Lang | null) ?? (navigator.language.startsWith('ru') ? 'ru' : 'en')
  const savedTheme = (localStorage.getItem('emberline.theme') as 'night' | 'day' | null) ?? 'night'

  setLang(savedLang)
  els.lang.textContent = savedLang === 'en' ? 'RU' : 'EN'
  document.documentElement.dataset.theme = savedTheme
  els.theme.querySelector('[data-theme-icon]')!.textContent = savedTheme === 'night' ? '☾' : '☀'

  applyStaticStrings()
  fillAoiOptions()
  wire()

  window.addEventListener('hashchange', applyUrl)

  ensureMap(els.mapEl, showMapProbe)

  const wanted = readUrl()
  if (wanted.mode) {
    state.mode = wanted.mode
    const input = els.mode.querySelector<HTMLInputElement>('input[value="' + wanted.mode + '"]')
    if (input) input.checked = true
  }
  const startId = wanted.aoi ?? AOIS[0].id
  els.aoi.value = startId
  await selectAoi(startId, wanted.year)
}

void boot()

export type { SensorId }
