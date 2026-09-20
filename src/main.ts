import { AOIS, aoiById } from './core/aoi'
import {
  LEVEL_DEGREES,
  levelForBounds,
  levelForZoom,
  loadWorldDaily,
  loadWorldIndex,
  loadNowPatch,
  loadNowPoints,
  loadWorldNow,
  loadPlaceDays,
  isTiled,
  loadWorldPatch,
  loadWorldRamp,
  loadWorldYear,
  worldCells,
  worldCeiling,
  nowCeiling,
  lastCompleteDay,
  nowFineCeiling,
  worldLastDay,
  type WorldCell,
  type WorldDaily,
  type WorldIndex,
  type PlaceDays,
  type WorldLevel,
  type FirePoint,
  type NowCell,
  type WorldNowMeta,
  type WorldYear,
} from './core/world'
import { drawWorldSeason, drawWorldYears, worldHeadline, type WorldTotal } from './ui/world-panel'
import { daysInYear, dayOfYear, yearOf } from './core/grid'
import {
  MIN_RATIO_SAMPLES,
  quantileSorted,
  summarizeSensitivity,
  type DailyRatio,
  type SensitivityRatio,
} from './core/harmonize'
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
import { MODIS_MASK, SENSOR_META, SENSORS, VIIRS_MASK, type Bounds, type SensorId } from './core/types'
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
  mapZoom,
  mapBox,
  onMoveSettled,
  onZoomSettled,
  refreshBasemapTheme,
  setBasemap,
  updateMap,
  type Basemap,
  type MapProbe,
} from './ui/map'
import { burnTransition } from './ui/burn'
import { invalidateRamp } from './ui/paint'
import { Picker } from './ui/picker'
import { geocode, parsePlaceValue, placeValue } from './core/geocode'
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
  ribbonHost: $('ribbon-svg'),
  worldBand: $('world-band'),
  worldSeason: $('world-season') as HTMLCanvasElement,
  worldSeasonCol: $('world-season-col'),
  worldYearsHeadline: $('world-years-headline'),
  mapRange: $('map-range'),
  mapPeriod: $('map-period'),
  mapDays: $('map-days'),
  mapYearValue: $<HTMLOutputElement>('map-year-value'),
  mapYearPrev: $<HTMLButtonElement>('map-year-prev'),
  mapYearNext: $<HTMLButtonElement>('map-year-next'),
  rangeYearLabel: $('range-year-label'),
  worldYears: $('world-years') as HTMLCanvasElement,
  worldHeadline: $('world-headline'),
  worldLegend: $('world-legend'),
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

const ribbon = new Ribbon(els.ribbonHost, pickYear, showTip)

const picker = new Picker({
  root: $('picker'),
  button: $('picker-button'),
  current: $('picker-current'),
  pop: $('picker-pop'),
  search: $<HTMLInputElement>('picker-search'),
  list: $('picker-list'),
  empty: $('picker-empty'),
  select: els.aoi,
})

/**
 * Anywhere on Earth, not just the four.
 *
 * The archive is global now, so the only thing standing between a reader and
 * Uzbekistan was knowing where Uzbekistan is. Failures are swallowed on
 * purpose: the geocoder is a courtesy service and the six built-in entries
 * must keep working when it is slow, blocked or down.
 */
picker.setLookup(async (query, signal) => {
  const places = await geocode(query, signal)
  return places.map((p) => ({ value: placeValue(p), label: p.name, hint: p.detail || t('placeHint') }))
})

/**
 * What the list says when it has nothing to show.
 *
 * Three different situations used to print the same sentence. "Nothing
 * matches" is a claim about the world; while the request is still in the air
 * it is premature, and when the geocoder has refused it is simply false —
 * and it is the one wording that tells a reader not to try again.
 */
picker.setPhrases((state) =>
  t(state === 'searching' ? 'pickerSearching' : state === 'failed' ? 'pickerFailed' : 'pickerEmpty'),
)

/**
 * Switch the map between the chosen year and the last week.
 *
 * The snapshot is one global file at a quarter degree, so every area can be
 * asked the same question and gets the same answer clipped to its own frame:
 * the planet sees the planet, a searched place sees its box, a bundled region
 * sees its rectangle.
 */
/**
 * What the map's period controls say and which of them are usable.
 *
 * The years come from whichever scope is showing: the planet has a reading for
 * every year since 2000, a small region may not.
 */
function paintRangeLabel(): void {
  els.rangeYearLabel.textContent = t('rangeYear', { year: String(state.year) })
  els.mapYearValue.textContent = String(state.year)
  els.mapPeriod.dataset.range = worldNow ? 'now' : 'year'
  // The day chips only make sense over a framed area: the planet's snapshot is
  // one coarse file for the whole week and has no day in it.
  els.mapDays.hidden = !worldNow || (worldScope && !worldPlace)

  const years = mapYears()
  const i = years.indexOf(state.year)
  els.mapYearPrev.disabled = i <= 0
  els.mapYearNext.disabled = i < 0 || i >= years.length - 1
}

function mapYears(): number[] {
  return worldScope ? (worldIndex?.totals.map((d) => d.year) ?? []) : state.years
}

function setRange(now: boolean): void {
  if (worldNow === now) return
  worldNow = now
  const input = els.mapRange.querySelector<HTMLInputElement>(`input[value="${now ? 'now' : 'year'}"]`)
  if (input) input.checked = true
  paintRangeLabel()
  if (now && !worldNowData) {
    els.mapNote.textContent = t('worldLoading')
    void loadWorldNow()
      .then((snap) => {
        worldNowData = snap
        drawMap()
      })
      .catch(() => {
        els.mapNote.textContent = t('worldFailed')
      })
  } else {
    drawMap()
  }
  writeUrl()
}

/**
 * Walk to the next or previous year of whatever is showing.
 *
 * Also leaves the snapshot: asking for a year is a statement about what to
 * show, and it would be strange to change the year and see the same week.
 */
function stepYear(delta: number): void {
  const years = mapYears()
  const i = years.indexOf(state.year)
  const next = years[i + delta]
  if (i < 0 || next === undefined) return
  if (worldNow) {
    setRange(false)
  }
  state.year = next
  if (worldScope) {
    drawScopeRibbon()
    renderWorldPanels()
    renderMapWorld()
    paintRangeLabel()
    writeUrl()
  } else {
    pickYear(next)
  }
}

/**
 * Whichever ribbon the current scope calls for, and nothing if it has none.
 *
 * A place's daily series arrives after its map does, so a redraw — a language
 * switch, a mode switch — can land in the gap. Falling through to the planet's
 * ribbon there would put the whole Earth's calendar under a city's heading,
 * which is the one thing this panel must never do. An empty panel is honest;
 * the wrong panel is not.
 */
function drawScopeRibbon(): void {
  if (!worldPlace) {
    renderWorldRibbon()
    return
  }
  if (!renderPlaceRibbon()) document.getElementById('calendar')!.hidden = true
}

/** Whichever map the current scope and period call for. */
function drawMap(): void {
  if (worldScope) renderMapWorld()
  else if (state.dataset) renderMap(state.dataset)
}

/** Only re-frame the map when the area changes, never on a year click. */
let mapFittedFor = ''

/** Coordinates and burn history of whatever the pointer is over. */
function showMapProbe(hit: MapProbe | null): void {
  // The planet and a searched place have no region dataset, and requiring one
  // left the whole global map without a readout: you could see that a cell was
  // dark and never find out what number made it dark.
  if (!hit || (!state.dataset && !worldScope)) {
    els.mapProbe.hidden = true
    return
  }
  els.mapProbe.innerHTML = ''

  const coords = document.createElement('div')
  coords.textContent =
    `${Math.abs(hit.lat).toFixed(2)}°${hit.lat < 0 ? 'S' : 'N'} ` +
    `${Math.abs(hit.lon).toFixed(2)}°${hit.lon < 0 ? 'W' : 'E'}`

  const value = document.createElement('div')
  if (hit.point) {
    /**
     * A detection is one observation, so it is described rather than counted:
     * which instrument saw it, at what minute, and how much power.
     */
    const pt = hit.point
    const hh = String(Math.floor(pt.minute / 60)).padStart(2, '0')
    const mm = String(pt.minute % 60).padStart(2, '0')
    value.textContent = t('probePoint', {
      time: `${hh}:${mm}`,
      sensor: pt.viirs ? t('worldViirs') : t('worldModis'),
    })
    const rows = document.createElement('div')
    rows.className = 'tip__rows'
    rows.append(tipRow('FRP', `${formatNumber(pt.frp)} MW`))
    rows.append(tipRow(t('probeConfidence'), t(['confLow', 'confNominal', 'confHigh'][pt.confidence])))
    els.mapProbe.append(coords, value, rows)
    els.mapProbe.hidden = false
    return
  }
  if (worldScope) {
    // A global cell counts detections, not days burned, so it gets its own
    // wording rather than being squeezed into the region's.
    if (hit.days > 0) {
      const strong = document.createElement('b')
      strong.textContent = formatNumber(hit.days)
      const [head, tail] = t('probeDetections', { year: String(state.year) }).split('{n}')
      value.append(document.createTextNode(head ?? ''), strong, document.createTextNode(tail ?? ''))
    } else {
      value.textContent = t('probeQuiet')
    }
    els.mapProbe.append(coords, value)
    els.mapProbe.hidden = false
    return
  }

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
  for (const section of dataSections) {
    // The planet's band is not part of "the data sections": it belongs to the
    // world scope and `showWorldLayout` owns it. Unhiding it here put two
    // empty canvases under "When the planet burns" into every region view,
    // including the first thing anyone sees on load.
    if (section.id === 'world-band') continue
    section.hidden = !visible
  }
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

  // A searched place writes its own wording under the calendar heading; a
  // region must put the general one back, or it inherits the last city's.
  els.calendarNote.textContent = t('sectionCalendarNote')

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
  paintRangeLabel()

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
  renderMap(ds)

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

  // The map writes its own caption and this runs after it, so the guard keeps
  // that caption: the planet's line, or the snapshot's, would otherwise be
  // replaced by a count of five-kilometre squares over a period nobody asked
  // for. The figures under the map describe the archive too, so they go with
  // it when the period is the last week.
  els.mapFacts.hidden = worldScope || worldNow
  if (!worldScope && !worldNow) {
    const cells = ds.mapCells(state.year).length
    els.mapNote.textContent = t('mapNoteArchive', { cells: formatNumber(cells), km: ds.mapCellKm, years: state.year })
  }
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
  /**
   * The planet and a place have no region dataset, so they come first.
   *
   * This used to bail out on `!state.dataset` before reaching the block that
   * redrew the global charts — which meant that block never ran at all in the
   * scope it was written for, and resizing the window left both charts
   * stretched until something else happened to redraw them.
   */
  if (worldScope) {
    ribbon.draw()
    renderWorldPanels()
    invalidateMapSize()
    return
  }

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
  miniFact(t('mapArea'), `${compact(Math.round(km2))} ${t('unitKm2')}`)
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

/** What the two instrument families saw on one day, in world scope. */
function scopeSplit(year: number, doy: number): { modis: number; viirs: number } | null {
  if (worldPlace) {
    const row = placeDays?.years.get(year)
    return row ? { modis: row.modis[doy], viirs: row.viirs[doy] } : null
  }
  const row = worldDaily?.years[String(year)]
  if (!row) return null
  return { modis: row.modis[doy - 1] ?? 0, viirs: row.viirs[doy - 1] ?? 0 }
}

function showTip(hit: RibbonHit | null, x: number, y: number): void {
  /**
   * The planet and a searched place have a ribbon but no region dataset.
   *
   * This asked for `state.clim`, which only a bundled region has, so hovering
   * a day anywhere else quietly did nothing — the one panel that answers
   * "what happened on this exact day" was missing from two thirds of the
   * views that draw the calendar.
   */
  const clim = worldScope ? worldClim : state.clim
  if (!hit || !clim) {
    els.ribbonTip.hidden = true
    return
  }

  /**
   * The region's day record, and only while a region is what is on screen.
   *
   * `state.dataset` outlives the view that loaded it, so in world scope this
   * found a day from whatever region was open last and printed its breakdown
   * under a place's total — "18 detections" above "only 1 km: 4", two numbers
   * from two different parts of the planet in one panel.
   */
  const day = worldScope
    ? undefined
    : state.dataset?.days.find((d) => yearOf(d.day) === hit.year && dayOfYear(d.day) === hit.doy)
  // In world scope the instrument split comes from whichever daily series is
  // feeding the ribbon rather than from a region's day records.
  const split = worldScope ? scopeSplit(hit.year, hit.doy) : null

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
    tipRow(t('median'), formatNumber(Math.round(clim.median[hit.doy]))),
    tipRow('p90', formatNumber(Math.round(clim.p90[hit.doy]))),
  )
  if (split) {
    rows.append(
      tipRow(t('worldModis'), formatNumber(split.modis)),
      tipRow(t('worldViirs'), formatNumber(split.viirs)),
    )
  }
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

/**
 * Redraw whatever scope is on screen.
 *
 * `render()` is the region path and only the region path — it reads
 * `state.dataset`, which in the world view still holds whichever region was
 * loaded last. Every caller that just wants "show it again" was reaching for
 * it directly and quietly rebuilding the page as that stale region while the
 * layout claimed to be the planet.
 */
function rerender(): void {
  if (!worldScope) {
    render()
    return
  }
  // Not `renderWorldRibbon` directly: this runs on a mode or language switch,
  // and a searched place has its own daily series. Calling the planet's here
  // is what put the whole Earth's calendar under a city's heading.
  drawScopeRibbon()
  renderWorldPanels()
  renderMapWorld()
  writeUrl()
}

function pickYear(year: number): void {
  state.year = year
  paintRangeLabel()
  // Choosing a year is a statement about what to show: leave the snapshot.
  if (worldNow) {
    worldNow = false
    const input = els.mapRange.querySelector<HTMLInputElement>('input[value="year"]')
    if (input) input.checked = true
  }
  /**
   * The ribbon belongs to whichever scope is showing.
   *
   * Clicking a year is the ribbon's main interaction, and this callback knew
   * only about regions: in the world view one click rebuilt the map, the hero
   * and the metrics from whatever region happened to be loaded last, while
   * the layout still said "planet". `stepYear` had been taught the
   * difference; this path had not.
   */
  if (worldScope) {
    drawScopeRibbon()
    renderWorldPanels()
    renderMapWorld()
    writeUrl()
    return
  }
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

/**
 * The planet, kept apart from the region dataset on purpose.
 *
 * Everything else on the page — the ribbon, the cycle, the percentiles — is
 * built from daily detections inside one bounding box. The global level has
 * neither: it is one degree and one month, which is the only shape that fits
 * five hundred million fires into a page. Feeding it through the same dataset
 * would mean either inventing days it does not have or teaching every panel
 * to be empty, so the world lives beside the dashboard and only takes over
 * the map.
 *
 * Years are cached because scrubbing back and forth is the point of having it.
 */
/**
 * Grids held by level *and* year.
 *
 * The same year exists at both resolutions and they are different files; a
 * cache keyed on the year alone would hand the coarse grid back after the
 * reader had zoomed in, and the detail would never arrive.
 */
const worldYears = new Map<string, WorldYear>()
let worldLevel: WorldLevel = 'l0'
let worldIndex: WorldIndex | null = null
let worldDaily: WorldDaily | null = null
/**
 * What period the map is showing: the chosen year, or the last week.
 *
 * This used to be an entry in the area list — "the whole world · right now" —
 * which put a *period* among a list of *places* and meant the snapshot existed
 * only for the planet. It is a filter, not a place: any area can be asked what
 * is burning in it this week, and the control belongs over the map where the
 * answer appears.
 */
let worldNow = false
/** A searched place: the world view, framed on somewhere in particular. */
let worldPlace: { bounds: Bounds; name: string } | null = null
/**
 * The daily series for that place, when there is one.
 *
 * The ribbon is the thing people came for, and hiding it outside the four
 * bundled regions made every searched place a lesser view. The global levels
 * keep months, so this comes from a product of its own — a quarter-degree
 * daily cube, fetched for the tiles the box touches.
 */
let placeDays: PlaceDays | null = null
/** The climatology behind whatever ribbon the world scope last drew. */
let worldClim: ReturnType<typeof climatology> | null = null
let worldNowData: { cells: WorldCell[]; meta: WorldNowMeta } | null = null
/**
 * How much of the snapshot week to show, in days back from its last one.
 *
 * Seven by default, because that is what the file holds, but a reader
 * comparing the page with FIRMS will have FIRMS set to today — and a week of
 * fires against one day of fires looks like the page inventing them. One day
 * has to be reachable, and the caption has to name the dates either way.
 */
let nowDays = 7
/** The fine records of the week for the framed area, when it has been fetched. */
let nowPatch: { key: string; cells: NowCell[] } | null = null
/**
 * The week's detections themselves, for the zoom below the grid.
 *
 * Only ever the live week, and only for the ground in view: the whole archive
 * as points is several gigabytes, one week over one district is kilobytes.
 */
let nowPoints: { key: string; points: FirePoint[] } | null = null

/** Past this the grid is finer than the sensors are, so draw the detections. */
const POINT_ZOOM = 9.5
let worldScope = false

/**
 * The ribbon, for the planet.
 *
 * It is the same component the regions use, fed the same shape of model — the
 * daily series is a `Map<year, Float64Array>` exactly like a region's, so the
 * climatology, the ninetieth percentile and the ceiling all come from the
 * code that already computes them. Nothing here is a special case except
 * where the numbers come from.
 */
/**
 * The daily series for the world scope, in whichever mode is selected.
 *
 * "As recorded" is the two instruments added together, which steps sharply
 * upward in 2012 when VIIRS arrives and sees several times as many fires over
 * the same ground. "Reconciled" scales the MODIS-only era up by the ratio
 * measured where the two overlap, so the record can be read end to end.
 *
 * The ratio is measured here the same way a region measures its own, and for
 * the same reason it is measured rather than assumed: how much more a 375 m
 * sensor resolves than a 1 km one depends on how fragmented the fires are. The
 * one difference is the unit — a region counts active cells, the global levels
 * count detections — so this is a ratio of detections, and the caption says so.
 */
function worldSeries(byInstrument: Map<number, { modis: Float64Array; viirs: Float64Array }>): {
  grid: Map<number, Float64Array>
  sensorsByYear: Map<number, number>
  ratio: SensitivityRatio
} {
  const ratios: DailyRatio[] = []
  let viirsFrom: string | null = null

  for (const [year, row] of [...byInstrument].sort((a, b) => a[0] - b[0])) {
    for (let d = 1; d <= 366; d++) {
      const m = row.modis[d]
      const v = row.viirs[d]
      if (v > 0 && viirsFrom === null) viirsFrom = isoDay(year, d)
      if (m >= 3 && v > 0) ratios.push({ day: isoDay(year, d), ratio: v / m })
    }
  }

  const ratio = summarizeSensitivity(ratios)
  const usable = state.mode === 'harmonized' && ratio.samples >= MIN_RATIO_SAMPLES
  const cut = viirsFrom ?? '2012-01-20'

  const grid = new Map<number, Float64Array>()
  const sensorsByYear = new Map<number, number>()
  for (const [year, row] of byInstrument) {
    const out = new Float64Array(367)
    let mask = 0
    for (let d = 1; d <= 366; d++) {
      const m = row.modis[d]
      const v = row.viirs[d]
      if (m > 0) mask |= MODIS_MASK
      if (v > 0) mask |= VIIRS_MASK
      // Only the era before VIIRS is scaled; days when both were watching are
      // real observations and bending them to fit the model would be the
      // opposite of the point.
      out[d] = usable && isoDay(year, d) < cut ? m * ratio.k : m + v
    }
    grid.set(year, out)
    sensorsByYear.set(year, mask)
  }
  return { grid, sensorsByYear, ratio }
}

/** A day-of-year back into a date, for comparing against the VIIRS onset. */
function isoDay(year: number, doy: number): string {
  return new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The ribbon model, from a daily grid and nothing else.
 *
 * The planet and a searched place differ only in where the numbers come from
 * — one file for the whole surface, a few tiles for one box — so the shaping
 * of them into years, climatology and a ceiling is written once.
 */
function ribbonFromGrid(
  byInstrument: Map<number, { modis: Float64Array; viirs: Float64Array }>,
  observedFrom: string,
  observedTo: string,
): void {
  const { grid, sensorsByYear } = worldSeries(byInstrument)
  const years = [...grid.keys()].sort((a, b) => a - b)
  const clim = climatology(grid, 7)
  // Keep it: the hover panel needs the same "usual for this date" numbers the
  // ribbon was drawn against, and in world scope there is no region to ask.
  worldClim = clim

  const all: number[] = []
  for (const row of grid.values()) {
    for (let d = 1; d <= 366; d++) if (row[d] > 0) all.push(row[d])
  }
  all.sort((a, b) => a - b)

  const totals = new Map<number, number>()
  for (const [y, row] of grid) {
    let sum = 0
    for (let d = 1; d <= 366; d++) sum += row[d]
    totals.set(y, sum)
  }

  ribbon.setModel(
    {
      years,
      rows: grid,
      clim,
      ceiling: all.length ? Math.max(1, quantileSorted(all, 0.995)) : 1,
      observedFrom,
      observedTo,
      sensorsByYear,
      totals,
    },
    state.year,
  )
}

/**
 * The calendar for a searched place.
 *
 * Same component, same shape of model; the only difference is that the series
 * is summed out of the quarter-degree daily cube over the cells inside the
 * box, so "here" means the box on the map rather than the whole planet.
 */
function renderPlaceRibbon(): boolean {
  const days = placeDays
  const place = worldPlace
  if (!days || !place) return false
  renderModeExplain()

  let last = ''
  let any = false
  for (const [year, row] of days.years) {
    for (let d = 1; d <= 366; d++) {
      if (row.modis[d] + row.viirs[d] <= 0) continue
      any = true
      const iso = isoDay(year, d)
      if (iso > last) last = iso
    }
  }
  if (!any) return false

  ribbonFromGrid(days.years, '2000-11-01', last)
  els.calendarNote.textContent = t('placeCalendarNote', {
    place: place.name,
    cell: t('cellQuarter'),
    n: formatNumber(days.cells),
  })
  return true
}

/** The planet's daily series, still split by instrument family. */
function worldInstruments(daily: WorldDaily): Map<number, { modis: Float64Array; viirs: Float64Array }> {
  const out = new Map<number, { modis: Float64Array; viirs: Float64Array }>()
  for (const [key, row] of Object.entries(daily.years)) {
    const modis = new Float64Array(367)
    const viirs = new Float64Array(367)
    for (let d = 0; d < 366; d++) {
      modis[d + 1] = row.modis[d] ?? 0
      viirs[d + 1] = row.viirs[d] ?? 0
    }
    out.set(Number(key), { modis, viirs })
  }
  return out
}

function renderWorldRibbon(): void {
  const daily = worldDaily
  if (!daily) return
  // A place leaves its own wording behind; put the general one back.
  els.calendarNote.textContent = t('sectionCalendarNote')
  renderModeExplain()

  ribbonFromGrid(worldInstruments(daily), '2000-11-01', worldLastDay(daily))
}

async function worldFor(year: number, level: WorldLevel): Promise<WorldYear | null> {
  const key = `${level}:${year}`
  const have = worldYears.get(key)
  if (have) return have
  try {
    const y = await loadWorldYear(year, '/data/world', level)
    worldYears.set(key, y)
    return y
  } catch {
    return null
  }
}

/**
 * Whichever map the scope asks for.
 *
 * The region path is unchanged. The world path hands the same layer a degree
 * grid instead of a metric one and stops it re-fitting the view on every
 * redraw — at planet scale the reader has usually gone somewhere deliberately,
 * and snapping back to the whole globe each time the year changes would undo
 * that on every click.
 */
/** The map alone, for the world path where there is no region dataset. */
/**
 * The last week, for whatever area is open.
 *
 * One global file at a quarter degree answers this for everyone: the planet
 * gets all of it, a searched place or a bundled region gets it clipped to
 * their own frame. It shares the map with the archive but not the grid — eight
 * times finer than the planet's degree, and no year to scrub, because the only
 * period it has is the one it was taken over. The caption says when that was
 * rather than implying a live feed.
 */
function renderMapNow(box: Bounds | null, name: string | null, fitKey: string): void {
  const snap = worldNowData
  if (!snap) {
    els.mapNote.textContent = t('worldLoading')
    return
  }

  /**
   * Close enough in, the grid gives way to the detections.
   *
   * A cell at a twentieth of a degree is five kilometres, which over a
   * district is a slab; and no finer grid would be honest, because a MODIS
   * pixel is a kilometre at nadir and more at the swath edge. So past this
   * zoom the map draws what was actually measured — one dot per detection,
   * with the minute of the overpass behind it.
   */
  const points = snap.meta.points
  if (points && mapZoom() >= POINT_ZOOM) {
    const view = box ?? mapBox()
    const key = `${view.west.toFixed(2)},${view.south.toFixed(2)},${view.east.toFixed(2)},${view.north.toFixed(2)}`
    if (nowPoints?.key !== key) {
      els.mapNote.textContent = t('worldLoading')
      void loadNowPoints(points, view)
        .then((got) => {
          nowPoints = { key, points: got }
          drawMap()
        })
        .catch(() => {
          nowPoints = { key, points: [] }
          drawMap()
        })
      return
    }
    if (nowPoints.points.length) {
      drawNowPoints(nowPoints.points, box, name, fitKey, snap.meta)
      return
    }
  }

  const fine = snap.meta.fine
  /**
   * A framed area gets the fine tiles; the planet keeps the coarse file.
   *
   * At planet zoom a twentieth of a degree is invisible and the whole week
   * would be ten times the bytes for nothing. Over a city it is the difference
   * between a square that covers the city and a square that covers the field
   * that is actually alight.
   */
  if (box && fine) {
    const key = `${box.west},${box.south},${box.east},${box.north}`
    if (nowPatch?.key !== key) {
      els.mapNote.textContent = t('worldLoading')
      void loadNowPatch(fine, box)
        .then((cells) => {
          nowPatch = { key, cells }
          drawMap()
        })
        .catch(() => {
          // No fine tiles here: the coarse grid still answers, less sharply.
          nowPatch = { key, cells: [] }
          drawMap()
        })
      return
    }
    if (nowPatch.cells.length) {
      drawNowFine(nowPatch.cells, fine, box, name, fitKey, snap.meta)
      return
    }
  }

  const deg = snap.meta.degrees
  const half = deg / 2
  const inside = box
    ? snap.cells.filter(
        (c) =>
          c.lat + half > box.south &&
          c.lat - half < box.north &&
          c.lon + half > box.west &&
          c.lon - half < box.east,
      )
    : snap.cells

  updateMap(
    {
      bounds: box ?? WORLD_VIEW,
      cells: inside.map((c) => ({ lat: c.lat, lon: c.lon, days: c.value })),
      cellKm: 111.32 * deg,
      cellDeg: deg,
      frame: box !== null,
      ceiling: nowCeiling(),
    },
    mapFittedFor !== fitKey,
  )
  mapFittedFor = fitKey

  const fires = box ? inside.reduce((sum, c) => sum + c.value, 0) : snap.meta.detections
  const cell = t('cellQuarter')
  els.mapNote.textContent =
    box && name
      ? t('placeNowNote', { place: name, fires: formatNumber(fires), from: snap.meta.from, to: snap.meta.to, cell })
      : t('worldNowNote', { fires: formatNumber(fires), from: snap.meta.from, to: snap.meta.to, cell })
}

/** The framed week at a twentieth of a degree, cut to the chosen days. */
function drawNowFine(
  records: NowCell[],
  fine: NonNullable<WorldNowMeta['fine']>,
  box: Bounds,
  name: string | null,
  fitKey: string,
  meta: WorldNowMeta,
): void {
  // The newest day is usually still being written, so the window ends at the
  // last one that is finished — and the caption names the dates it used.
  const last = lastCompleteDay(meta)
  const firstDay = Math.max(0, last - (nowDays - 1))
  const half = fine.degrees / 2

  const tally = new Map<string, number>()
  let fires = 0
  for (const r of records) {
    if (r.day < firstDay) continue
    if (r.lat + half <= box.south || r.lat - half >= box.north) continue
    if (r.lon + half <= box.west || r.lon - half >= box.east) continue
    const key = `${r.lat},${r.lon}`
    const v = r.modis + r.viirs
    tally.set(key, (tally.get(key) ?? 0) + v)
    fires += v
  }

  const cells = [...tally].map(([key, days]) => {
    const [lat, lon] = key.split(',').map(Number)
    return { lat, lon, days }
  })

  updateMap(
    {
      bounds: box,
      cells,
      cellKm: 111.32 * fine.degrees,
      cellDeg: fine.degrees,
      frame: true,
      // The snapshot's own ceiling is for the coarse weekly grid; a
      // twentieth-degree cell over a day or three holds orders of magnitude
      // less, so this level has a ceiling of its own, per day.
      ceiling: nowFineCeiling(nowDays),
    },
    mapFittedFor !== fitKey,
  )
  mapFittedFor = fitKey

  const from = addDays(fine.dayZero, firstDay)
  const to = addDays(fine.dayZero, last)
  const cell = t('cellFine')
  els.mapNote.textContent = name
    ? t('placeNowNote', { place: name, fires: formatNumber(fires), from, to, cell })
    : t('worldNowNote', { fires: formatNumber(fires), from, to, cell })
}

/**
 * The week's detections over whatever is framed, cut to the chosen days.
 *
 * The ramp runs on radiative power rather than on a count, because a point is
 * one observation and counting it against itself would say nothing. Ninety
 * megawatts tops the scale — that is roughly the ninety-ninth percentile of a
 * detection's power — so an ordinary agricultural fire reads mid-scale and a
 * crown fire saturates.
 */
function drawNowPoints(
  all: FirePoint[],
  box: Bounds | null,
  name: string | null,
  fitKey: string,
  meta: WorldNowMeta,
): void {
  const fine = meta.fine
  const last = fine ? lastCompleteDay(meta) : 6
  const firstDay = Math.max(0, last - (nowDays - 1))
  const view = box ?? mapBox()

  const shown = all.filter(
    (pt) =>
      pt.day >= firstDay &&
      pt.day <= last &&
      pt.lat >= view.south &&
      pt.lat <= view.north &&
      pt.lon >= view.west &&
      pt.lon <= view.east,
  )

  updateMap(
    {
      bounds: box ?? view,
      cells: [],
      points: shown,
      cellKm: 1,
      frame: box !== null,
      ceiling: 90,
    },
    mapFittedFor !== fitKey,
  )
  mapFittedFor = fitKey

  const from = addDays(fine?.dayZero ?? meta.from, firstDay)
  const to = addDays(fine?.dayZero ?? meta.from, last)
  els.mapNote.textContent = name
    ? t('placePointsNote', { place: name, fires: formatNumber(shown.length), from, to })
    : t('worldPointsNote', { fires: formatNumber(shown.length), from, to })
}

/** Calendar arithmetic, in UTC, so a date never slips by a day. */
function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
}

function renderMapWorld(): void {
  if (worldNow) {
    const place = worldPlace
    renderMapNow(place?.bounds ?? null, place?.name ?? null, place ? `now:${place.name}` : 'world-now')
    return
  }

  /**
   * Detail follows whatever is being framed, and then follows the wheel.
   *
   * A searched place knows its own box before the camera has moved, so it can
   * say what it deserves without waiting for the fit — otherwise the first
   * view of a country is drawn at the resolution of the planet it replaced.
   * But the box is only the opening position: someone who then zooms into one
   * valley is asking for the finer grid, and pinning the level to the box
   * meant a place never sharpened however far in they went. Whichever of the
   * two is finer wins.
   */
  worldLevel = wantedWorldLevel()

  /**
   * At the finest level, only the ground in view.
   *
   * The two coarser levels are a whole planet a year and are simply held. This
   * one is five megabytes a year across a hundred and thirty tiles, so the page
   * takes the two or three squares the camera is over — which is also why it is
   * keyed on those squares: a pan inside one costs nothing, and crossing an
   * edge costs one file.
   */
  let year: WorldYear | undefined
  if (isTiled(worldLevel)) {
    const level = worldLevel
    const box = worldPlace ? worldPlace.bounds : mapBox()
    const key = `${level}:${patchKey(state.year, box, level === 'l3' ? 10 : 20)}`
    if (worldPatch?.key !== key) {
      els.mapNote.textContent = t('worldLoading')
      void loadWorldPatch(state.year, box, level)
        .then((data) => {
          if (!worldScope) return
          worldPatch = { key, data }
          renderMapWorld()
        })
        .catch(() => {
          // This level is not in this deployment, or a tile went missing.
          // Note it and redraw at the next grid down instead of retrying.
          if (!worldScope) return
          missingLevels.add(level)
          worldPatch = null
          renderMapWorld()
        })
      return
    }
    // Nothing at this level for this ground: the quarter degree stands in
    // rather than leaving the map empty.
    year = worldPatch.data.length ? worldPatch.data : worldYears.get(`l1:${state.year}`)
    if (!year) {
      els.mapNote.textContent = t('worldLoading')
      void worldFor(state.year, 'l1').then((y) => {
        if (!worldScope) return
        if (!y) els.mapNote.textContent = t('worldFailed')
        else renderMapWorld()
      })
      return
    }
  } else {
    year = worldYears.get(`${worldLevel}:${state.year}`)
    if (!year) {
      els.mapNote.textContent = t('worldLoading')
      void worldFor(state.year, worldLevel).then((y) => {
        if (!worldScope) return
        if (!y) {
          els.mapNote.textContent = t('worldFailed')
          return
        }
        renderMapWorld()
      })
      return
    }
  }

  // If the finest level had nothing and the quarter degree stood in, the cells
  // are quarter-degree cells and must be drawn as such.
  const drawnLevel: WorldLevel = isTiled(worldLevel) && !worldPatch?.data.length ? 'l1' : worldLevel
  const drawnDeg = LEVEL_DEGREES[drawnLevel]
  const all = worldCells(year, 'both', 0, 11, drawnDeg)
  const place = worldPlace

  if (place) {
    /**
     * Inside the box, and only inside it.
     *
     * The dashed rectangle says "this is the area you asked for"; drawing the
     * rest of the planet behind it says the opposite, and the figure under
     * the map — which counts only what is inside — then disagrees with what
     * is on screen. A cell that straddles the edge is kept: it holds fires
     * that are in the box, and at this grid there is no finer answer.
     */
    const b = place.bounds
    const half = drawnDeg / 2
    const inside = all.filter(
      (c) =>
        c.lat + half > b.south && c.lat - half < b.north && c.lon + half > b.west && c.lon - half < b.east,
    )
    const sum = inside.reduce((s2, c) => s2 + c.value, 0)
    const cells = inside.map((c) => ({ lat: c.lat, lon: c.lon, days: c.value }))
    updateMap(
      {
        bounds: b,
        cells,
        cellKm: 111.32 * drawnDeg,
        cellDeg: drawnDeg,
        frame: true,
        ceiling: worldCeiling(drawnLevel, state.year),
      },
      mapFittedFor !== `place:${place.name}`,
    )
    mapFittedFor = `place:${place.name}`
    els.mapNote.textContent = sum
      ? t(isTiled(drawnLevel) ? 'placeNoteFine' : 'placeNote', {
          place: place.name,
          fires: formatNumber(sum),
          year: String(state.year),
          cell: t(cellName(drawnLevel)),
        })
      : t('placeQuiet', { place: place.name, year: String(state.year) })
    return
  }

  updateMap(
    {
      bounds: WORLD_VIEW,
      cells: all.map((c) => ({ lat: c.lat, lon: c.lon, days: c.value })),
      cellKm: 111.32 * drawnDeg,
      cellDeg: drawnDeg,
      frame: false,
      ceiling: worldCeiling(drawnLevel, state.year),
    },
    mapFittedFor !== 'world',
  )
  mapFittedFor = 'world'
  const tot = worldIndex?.totals.find((d) => d.year === state.year)
  els.mapNote.textContent = t(isTiled(drawnLevel) ? 'worldNoteFine' : 'worldNote', {
    fires: formatNumber(tot ? tot.modis + tot.viirs : 0),
    year: String(state.year),
    cell: t(cellName(drawnLevel)),
  })
}

function renderMap(ds: Dataset): void {
  // A bundled region can be asked "what is burning here this week" too. Its
  // own archive cannot answer it — the cube keeps a year per cell, not a day
  // — so the answer is the same global snapshot, clipped to the region.
  if (worldNow) {
    const aoi = aoiById(ds.id)
    renderMapNow(ds.bounds, aoi ? aoi.name[getLang()] : ds.id, `now:${ds.id}`)
    return
  }
  updateMap({ bounds: ds.bounds, cells: ds.mapCells(state.year), cellKm: ds.mapCellKm }, ds.id !== mapFittedFor)
  mapFittedFor = ds.id
}

/**
 * What "the whole world" is framed on.
 *
 * Not the full Mercator square. Nothing burns below 60°S but an ice shelf and
 * almost nothing above 78°N, so framing the poles spends a third of the map on
 * two white bands and shrinks everything that matters to fit around them.
 */
const WORLD_VIEW = { west: -180, south: -60, east: 180, north: 78 }

/**
 * The level the current view deserves.
 *
 * Kept as one function because two callers need the same answer: the render,
 * and the zoom handler deciding whether a settled wheel changed anything. When
 * the handler compared the raw zoom against the level instead, a place framed
 * from its box disagreed with it permanently and rebuilt the grid on every
 * single zoom — fetching and folding a year of cells to draw the same picture.
 */
const FINER: Record<WorldLevel, number> = { l0: 0, l1: 1, l2: 2, l3: 3 }

/** What to call the cell in the caption under the map. */
function cellName(level: WorldLevel): 'cellDegree' | 'cellQuarter' | 'cellFine' | 'cellFinest' {
  if (level === 'l3') return 'cellFinest'
  if (level === 'l2') return 'cellFine'
  return level === 'l1' ? 'cellQuarter' : 'cellDegree'
}

/**
 * Levels this deployment turned out not to have.
 *
 * The finest grids are optional: they are a hundred megabytes each and a
 * deployment may reasonably ship without one. Asking for a level that is not
 * there must therefore degrade to the next one down and stay there, rather
 * than 404 on every pan — and it must not fall all the way back to the
 * quarter degree, which would make zooming in show *less* than zooming out.
 */
const missingLevels = new Set<WorldLevel>()

const COARSER: Record<WorldLevel, WorldLevel> = { l3: 'l2', l2: 'l1', l1: 'l0', l0: 'l0' }

function wantedWorldLevel(): WorldLevel {
  const byZoom = levelForZoom(mapZoom())
  const byBox = worldPlace ? levelForBounds(worldPlace.bounds) : byZoom
  let level = FINER[byBox] >= FINER[byZoom] ? byBox : byZoom
  while (missingLevels.has(level) && COARSER[level] !== level) level = COARSER[level]
  return level
}

/**
 * The finest level is tiled, so it is held per patch of ground.
 *
 * L0 and L1 are a file a year and the whole planet is in memory whatever the
 * camera is doing. L2 is not: the page holds whichever 20° squares the view
 * touches, and the key is the range of those squares rather than the exact
 * box, so panning inside one square redraws from what is already here.
 */
let worldPatch: { key: string; data: WorldYear } | null = null

function patchKey(year: number, b: Bounds, step: number): string {
  const x0 = Math.floor((b.west + 180) / step)
  const x1 = Math.floor((b.east + 180) / step)
  const y0 = Math.floor((b.south + 90) / step)
  const y1 = Math.floor((b.north + 90) / step)
  return `${year}:${x0}-${x1}:${y0}-${y1}`
}

/**
 * The planet's own panels.
 *
 * Both figures come out of the index, not the grids: the totals and the
 * monthly shape were summed during the fold precisely so that switching to
 * the world costs one small JSON rather than thirty-three megabytes. The map
 * still fetches the chosen year, and only that year.
 */
/**
 * A place's own totals, out of its daily series.
 *
 * Without this a reader who picked Uzbekistan was shown the planet's forty
 * million detections and the planet's year-by-year bars. Both were labelled
 * "planet", so neither was a lie, but neither was an answer either — you ask
 * about one country and every number on the screen is about the Earth.
 */
function placeTotals(days: PlaceDays): WorldTotal[] {
  const out: WorldTotal[] = []
  for (const [year, row] of [...days.years].sort((a, b) => a[0] - b[0])) {
    let modis = 0
    let viirs = 0
    for (let d = 1; d <= 366; d++) {
      modis += row.modis[d]
      viirs += row.viirs[d]
    }
    out.push({ year, modis, viirs, frp: 0 })
  }
  return out
}

function renderWorldPanels(): void {
  const idx = worldIndex
  if (!idx) return

  /**
   * A place answers with its own figures and drops the monthly chart.
   *
   * The ribbon above it is the same question asked better — every day rather
   * than every month — so keeping both would be saying the same thing twice,
   * once worse. The planet keeps the monthly chart because it has no ribbon
   * that fine.
   */
  const days = worldPlace && placeDays ? placeDays : null
  const totals = days ? placeTotals(days) : idx.totals
  els.worldSeasonCol.hidden = days !== null
  if (!days) drawWorldSeason(els.worldSeason, idx.seasons, state.year)
  // The headline lives in the monthly column, which a place hides, so a place
  // gets its own copy beside the chart it does keep.
  const headline = days && worldPlace ? els.worldYearsHeadline : els.worldHeadline
  els.worldYearsHeadline.hidden = !(days && worldPlace)
  headline.textContent =
    days && worldPlace
      ? t('placeHeadline', {
          place: worldPlace.name,
          fires: formatNumber(
            (totals.find((d) => d.year === state.year)?.modis ?? 0) +
              (totals.find((d) => d.year === state.year)?.viirs ?? 0),
          ),
          year: String(state.year),
          all: formatNumber(totals.reduce((sum, d) => sum + d.modis + d.viirs, 0)),
          from: String(totals[0]?.year ?? ''),
          to: String(totals[totals.length - 1]?.year ?? ''),
        })
      : worldHeadline(idx.totals, state.year)
  drawWorldYears(els.worldYears, totals, state.year)

  els.worldLegend.innerHTML = ''
  for (const [key, colour] of [
    ['worldModis', '--sensor-modis'],
    ['worldViirs', '--sensor-viirs'],
  ] as const) {
    const item = document.createElement('span')
    item.className = 'legend__item'
    const dot = document.createElement('i')
    dot.style.background = `var(${colour})`
    item.append(dot, document.createTextNode(t(key)))
    els.worldLegend.append(item)
  }

  els.yearValue.textContent = String(state.year)
  paintRangeLabel()
  const i = idx.totals.findIndex((d) => d.year === state.year)
  els.yearPrev.disabled = i <= 0
  els.yearNext.disabled = i < 0 || i >= idx.totals.length - 1
}

/** The world band is redrawn on resize and theme change like everything else. */

/**
 * Whether the calendar has anything to say.
 *
 * It used to be hidden for a searched place, because the only daily series on
 * hand was the planet's and putting that under a heading reading "when does it
 * burn *here*" would be showing one thing and claiming another. The answer was
 * to get the right numbers rather than to drop the panel, so now only a place
 * with no detections at all — or one whose daily cube has not arrived — goes
 * without.
 */
function showCalendar(world = worldScope): void {
  document.getElementById('calendar')!.hidden = world && worldPlace !== null && placeDays === null
}

/** The planet replaces the region's panels rather than sitting beside them. */
function showWorldLayout(on: boolean): void {
  heroSection.hidden = on
  showCalendar(on)
  if (on) {
    // Coming from a failed region load these are still hidden, and the planet
    // would draw its ribbon into a collapsed box.
    els.ribbonWrap.hidden = false
    els.calendarNote.hidden = false
    els.ribbonLegendWrap.hidden = false
  }
  // The reconciliation is real here as well now: the global levels keep the
  // instruments apart, so the switch has something to do and the note that
  // explains it should be on screen.
  els.modeExplain.hidden = false
  els.metrics.hidden = on
  /**
   * The figures under the map belong to a region's dataset.
   *
   * "Squares ever burned", "area watched" and the rest are computed from the
   * kilometre grid, which the planet does not have. Leaving them on screen in
   * world scope did not blank them — it left the last region's numbers sitting
   * under a map of somewhere else, which is the worst of the three options.
   */
  els.mapFacts.hidden = on
  if (on) els.mapFacts.innerHTML = ''
  for (const section of dataSections) {
    if (section.id === 'world-band') section.hidden = !on
    else if (section.id === 'map-band') section.hidden = false
    else section.hidden = on
  }

  /**
   * Tell Leaflet the container moved.
   *
   * Switching scope hides or restores whole sections above the map, so the
   * container ends up somewhere else on the page and usually a different size.
   * Leaflet caches both and has no way to notice: the tiles keep being placed
   * for the old geometry, so the basemap sits offset from its own frame and
   * every cell is drawn against coordinates that no longer line up — which on
   * a zoom looks like the fires sliding away and then snapping back.
   *
   * After a frame, not immediately: the sections have only just been unhidden
   * and the new height does not exist until layout has run.
   */
  requestAnimationFrame(() => invalidateMapSize(true))
}

/**
 * A place somebody typed, shown out of the global archive.
 *
 * There is no separate dataset to load: the degree grid already covers
 * Uzbekistan as much as it covers the Cerrado, so this is the world view with
 * the camera moved and the numbers taken from the cells inside the box. What
 * it cannot offer is the region panels — those need daily detections at a
 * kilometre, which only the four bundled areas have.
 */
async function selectPlace(bounds: Bounds, name: string, wantYear?: number): Promise<void> {
  const token = ++loadToken
  status(t('worldLoading'), 'busy')
  try {
    worldIndex ??= await loadWorldIndex()
    worldDaily ??= await loadWorldDaily()
    await loadWorldRamp()
    if (token !== loadToken) return

    const years = worldIndex.totals.map((d) => d.year)
    if (wantYear && years.includes(wantYear)) state.year = wantYear
    else if (!years.includes(state.year)) state.year = years[years.length - 1]

    if (worldNow) {
      worldNowData ??= await loadWorldNow()
      if (token !== loadToken) return
    }
    worldScope = true
    worldPlace = { bounds, name }
    // The map first, then the calendar: the cube is a few hundred kilobytes
    // and the reader should not watch an empty page while it arrives.
    placeDays = null
    showWorldLayout(true)
    renderWorldPanels()
    renderMapWorld()
    writeUrl()
    status('')

    const days = await loadPlaceDays(bounds).catch(() => null)
    if (token !== loadToken || worldPlace?.name !== name) return
    placeDays = days
    /**
     * Reveal the panel, then draw into it.
     *
     * The ribbon sizes itself and its hit layer from the box it is drawn in,
     * and the calendar is hidden until the cube arrives. Drawing first left
     * the interactive overlay at its collapsed height: the picture looked
     * right and hovering a day did nothing at all, anywhere below the first
     * few rows.
     *
     * Only the calendar's visibility, mind, not the whole layout — re-running
     * that would re-fit the map and undo a zoom the reader had already made
     * while the cube was on its way.
     */
    showCalendar()
    if (!renderPlaceRibbon()) {
      placeDays = null
      showCalendar()
    }
    renderWorldPanels()
  } catch {
    status(t('worldFailed'), 'error')
  }
}

async function selectWorld(wantYear?: number): Promise<void> {
  worldPlace = null
  placeDays = null
  const token = ++loadToken
  status(t('worldLoading'), 'busy')
  try {
    worldIndex ??= await loadWorldIndex()
    await loadWorldRamp()
    if (token !== loadToken) return
    const years = worldIndex.totals.map((d) => d.year)
    if (wantYear && years.includes(wantYear)) state.year = wantYear
    else if (!years.includes(state.year)) state.year = years[years.length - 1]

    if (worldNow) {
      worldNowData ??= await loadWorldNow()
      if (token !== loadToken) return
    }
    worldDaily ??= await loadWorldDaily()
    if (token !== loadToken) return

    worldScope = true
    showWorldLayout(true)
    renderWorldRibbon()
    renderWorldPanels()
    renderMapWorld()
    writeUrl()
    status('')
  } catch {
    status(t('worldFailed'), 'error')
  }
}

async function selectAoi(id: string, wantYear?: number): Promise<void> {
  const token = ++loadToken
  status(t('statusLoading'), 'busy')
  try {
    const ds = await loadArchive(id)
    if (token !== loadToken) return
    state.dataset = ds
    state.year = ds.days.length ? yearOf(ds.days[ds.days.length - 1].day) : state.year
    if (wantYear) state.year = wantYear
    // Coming back from the planet: put the region's panels back before they
    // are asked to render into hidden sections, and forget where the planet
    // was pointed. Leaving `worldPlace` set was enough to make the link this
    // view writes claim to be the place the reader had just left.
    if (worldNow) worldNowData ??= await loadWorldNow().catch(() => null)
    worldScope = false
    worldPlace = null
    placeDays = null
    showWorldLayout(false)
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
  // Places first, then the planet — the list reads narrow to wide, and the two
  // global entries are set apart because they are a different kind of thing:
  // one is a quarter-century of history, the other is this week.
  picker.setEntries([
    ...AOIS.map((aoi) => ({ value: aoi.id, label: aoi.name[getLang()], hint: t('regionHint') })),
    { value: 'world', label: t('scopeWorld'), hint: t('worldHint'), apart: true },
  ])
  if (selected) picker.setValue(selected)
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
 * Switching theme clears the old one away rather than cutting to the new one —
 * fire on the way to night, a sponge on the way to day. The swap happens under
 * the cover, so the repaint of every canvas and the map tiles is hidden behind
 * the effect instead of flashing through it.
 */
function setTheme(theme: 'night' | 'day'): void {
  burnTransition(() => applyTheme(theme), theme)
}

function switchLang(lang: Lang): void {
  setLang(lang)
  localStorage.setItem('emberline.lang', lang)
  els.lang.textContent = lang === 'en' ? 'RU' : 'EN'
  applyStaticStrings()
  fillAoiOptions()
  paintRangeLabel()
  rerender()
}

function showSourcePane(kind: string): void {
  els.paneArchive.hidden = kind !== 'archive'
  els.paneLive.hidden = kind !== 'live'
  els.paneFile.hidden = kind !== 'file'
  if (kind !== 'archive') return
  void goTo(els.aoi.value)
}

/**
 * Go to an area, whatever kind of area it is.
 *
 * Four things can be in `els.aoi.value` now — a bundled region, the planet,
 * the planet this week, and a packed place from the search — and three of them
 * are not archive ids. Every route in (a click, a link, switching back to the
 * Archive tab) has to make the same three-way choice, and each copy of it that
 * was written separately got it wrong in its own way: the Archive tab asked
 * `loadArchive('world')` and got a 404, and a shared link to a place opened on
 * Punjab. One function, used everywhere.
 */
function goTo(value: string, wantYear?: number): Promise<void> {
  const place = parsePlaceValue(value)
  if (place) return selectPlace(place.bounds, place.name, wantYear)
  if (value === 'world') return selectWorld(wantYear)
  return selectAoi(value, wantYear)
}

function wire(): void {
  els.aoi.addEventListener('change', () => void goTo(els.aoi.value))

  els.mode.addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement
    state.mode = input.value as Mode
    // Harmonized-versus-raw is a property of the regional series; the global
    // levels carry raw instrument counts only, so the planet has nothing to
    // rebuild and `rebuild()` would run over the stale region dataset.
    if (!worldScope) rebuild()
    rerender()
  })

  els.source.addEventListener('change', (e) => {
    showSourcePane((e.target as HTMLInputElement).value)
  })

  els.mapRange.addEventListener('change', (e) => {
    setRange((e.target as HTMLInputElement).value === 'now')
  })

  els.mapDays.addEventListener('change', (e) => {
    nowDays = Number((e.target as HTMLInputElement).value) || 7
    drawMap()
  })

  els.lang.addEventListener('click', () => switchLang(getLang() === 'en' ? 'ru' : 'en'))
  els.theme.addEventListener('click', () =>
    setTheme(document.documentElement.dataset.theme === 'night' ? 'day' : 'night'),
  )

  els.yearPrev.addEventListener('click', () => stepYear(-1))
  els.yearNext.addEventListener('click', () => stepYear(1))
  // The same two arrows over the map, because a reader down there should not
  // have to scroll back to the calendar to change the year.
  els.mapYearPrev.addEventListener('click', () => stepYear(-1))
  els.mapYearNext.addEventListener('click', () => stepYear(1))

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
  place?: { name: string; bounds: Bounds }
  year?: number
  /** `#/punjab/now/raw` — the period sits where the year would be. */
  now?: boolean
  mode?: Mode
}

function readUrl(): UrlState {
  const raw = location.hash.replace(/^#\/?/, '')
  if (!raw) return {}
  const parts = raw.split('/')

  /**
   * A searched place carries its own box in the link.
   *
   * `#/place/Португалия/-9.56,36.84,-6.17,42.16/2026/harmonized` — the name is
   * only a caption, the numbers are what actually frames the map. Encoding the
   * box rather than re-asking the geocoder means the link resolves to the same
   * view for ever, even if the service renames the place or goes away.
   */
  if (parts[0] === 'place' && parts.length >= 3) {
    const nums = parts[2].split(',').map(Number)
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      return {
        place: {
          name: decodeURIComponent(parts[1]),
          bounds: { west: nums[0], south: nums[1], east: nums[2], north: nums[3] },
        },
        year: parts[3] && /^\d{4}$/.test(parts[3]) ? Number(parts[3]) : undefined,
        now: parts[3] === 'now',
        mode: parts[4] === 'raw' || parts[4] === 'harmonized' ? parts[4] : undefined,
      }
    }
  }

  const [aoi, year, mode] = parts
  return {
    // `world-now` was an area before the snapshot became a period; links to it
    // are already out in the world, so it still resolves — to the planet, with
    // the period set.
    aoi: aoi === 'world-now' ? 'world' : aoi === 'world' || (aoi && aoiById(aoi)) ? aoi : undefined,
    year: year && /^\d{4}$/.test(year) ? Number(year) : undefined,
    now: year === 'now' || aoi === 'world-now',
    mode: mode === 'raw' || mode === 'harmonized' ? mode : undefined,
  }
}

/** The link's own pieces, packed the way the search packs a chosen place. */
function placeValueOf(place: { name: string; bounds: Bounds }): string {
  const b = place.bounds
  return `place:${b.west.toFixed(3)},${b.south.toFixed(3)},${b.east.toFixed(3)},${b.north.toFixed(3)}:${place.name}`
}

/** Replace rather than push: the back button should leave the page, not undo a click. */
function writeUrl(): void {
  // The planet has no dataset, but it does have a year, and a link to it
  // should come back to the same year rather than to whatever region was
  // loaded last.
  const id = worldPlace
    ? `place/${encodeURIComponent(worldPlace.name)}/${worldPlace.bounds.west.toFixed(2)},${worldPlace.bounds.south.toFixed(2)},${worldPlace.bounds.east.toFixed(2)},${worldPlace.bounds.north.toFixed(2)}`
    : worldScope
      ? 'world'
      : state.dataset?.id
  if (!id) return
  const next = `#/${id}/${worldNow ? 'now' : state.year}/${state.mode}`
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

  if ((wanted.now ?? false) !== worldNow) {
    worldNow = wanted.now ?? false
    const input = els.mapRange.querySelector<HTMLInputElement>(
      `input[value="${worldNow ? 'now' : 'year'}"]`,
    )
    if (input) input.checked = true
  }

  const target = wanted.place ? placeValueOf(wanted.place) : wanted.aoi
  if (target && target !== els.aoi.value) {
    picker.setValue(target, wanted.place?.name)
    void goTo(target, wanted.year).finally(() => {
      applyingUrl = false
    })
    return
  }

  /**
   * The area is already right, so only the year and the mode are left.
   *
   * This asked `state.years`, which is the region's list and empty whenever
   * the planet or a place is open — so a link like `#/world/2005/raw` set
   * nothing, and the next `writeUrl` quietly rewrote the address to whatever
   * was on screen. The year list has to come from the scope that is showing.
   */
  const years = mapYears()
  if (wanted.year && years.includes(wanted.year)) state.year = wanted.year
  if (wanted.year || wanted.mode || wanted.now !== undefined) {
    if (!worldScope) rebuild()
    rerender()
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
  paintRangeLabel()
  wire()

  window.addEventListener('hashchange', applyUrl)

  ensureMap(els.mapEl, showMapProbe)
  // Crossing a pyramid boundary means different data, not a rescale, so the
  // world view redraws when the zoom settles — and only if the level changed,
  // or every wheel click would rebuild a grid that is already correct.
  onZoomSettled(() => {
    // Crossing into or out of the point view is a change of representation,
    // not of level, so it is checked before the pyramid is.
    if (worldNow) {
      drawMap()
      return
    }
    if (!worldScope) return
    if (wantedWorldLevel() === worldLevel) return
    renderMapWorld()
  })

  /**
   * Panning matters too, but only at the level that is tiled.
   *
   * The coarse levels hold the whole planet, so a drag is a repaint and
   * nothing more. At the finest one the page is holding two or three squares
   * of ground, and dragging past their edge would otherwise reach the end of
   * the data and simply stop drawing.
   */
  onMoveSettled(() => {
    // The detections are fetched for the ground in view, so a drag at that
    // zoom needs the next square of them.
    if (worldNow && mapZoom() >= POINT_ZOOM) {
      drawMap()
      return
    }
    if (!worldScope || !isTiled(worldLevel) || worldPlace) return
    const step = worldLevel === 'l3' ? 10 : 20
    if (worldPatch?.key === `${worldLevel}:${patchKey(state.year, mapBox(), step)}`) return
    renderMapWorld()
  })

  const wanted = readUrl()
  if (wanted.mode) {
    state.mode = wanted.mode
    const input = els.mode.querySelector<HTMLInputElement>('input[value="' + wanted.mode + '"]')
    if (input) input.checked = true
  }
  if (wanted.now) {
    worldNow = true
    const input = els.mapRange.querySelector<HTMLInputElement>('input[value="now"]')
    if (input) input.checked = true
  }
  const startId = wanted.place ? placeValueOf(wanted.place) : (wanted.aoi ?? AOIS[0].id)
  picker.setValue(startId, wanted.place?.name)
  await goTo(startId, wanted.year)
}

void boot()

export type { SensorId }
