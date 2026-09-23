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
import {
  drawWorldSeason,
  drawWorldYears,
  worldHeadline,
  type WorldSeason,
  type WorldTotal,
} from './ui/world-panel'
import { loadClimate, loadEmissions, type EmissionsFile } from './core/emissions'
import { loadForecast, type ForecastCell, type ForecastMeta } from './core/forecast'
import { drawCalibration } from './ui/calibration'
import { drawScaleBars } from './ui/scale-bars'
import { drawImportance } from './ui/importance'
import { loadModelCard } from './core/model-card'
import { mountFireYear, type FireYear, type YearHandle } from './ui/fire-year'
import { aboutList } from './i18n'
import { loadLand } from './core/land'
import { mountGlobe, type GlobeFire, type GlobeHandle, type GlobePick } from './ui/globe'
import { drawShot } from './ui/satellite'
import { loadHorizon } from './core/forecast'
import { loadVerify, loadVerifyRecord, type VerifyWeek } from './core/verify'
import { loadReasons, reasonsAt } from './core/reasons'
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
  mapCaveat: $('map-caveat'),
  futureHero: $('future-hero'),
  futureWhere: $('future-where'),
  futureAnswer: $('future-answer'),
  futureAside: $('future-aside'),
  futureStats: $('future-stats'),
  futureMapNote: $('future-map-note'),
  futureMapSlot: $('future-map-slot'),
  futureRisk: $('future-risk'),
  futureRiskList: $('future-risk-list'),
  calibCanvas: $<HTMLCanvasElement>('calib-canvas'),
  calibCaption: $('calib-caption'),
  futureSkill: $('future-skill'),
  futureSkillNote: $('future-skill-note'),
  globeCanvas: $<HTMLCanvasElement>('globe-canvas'),
  pick: $('pick'),
  pickClose: $<HTMLButtonElement>('pick-close'),
  pickWhere: $('pick-where'),
  pickFacts: $('pick-facts'),
  pickNote: $('pick-note'),
  pickWhy: $('pick-why'),
  riskMore: $<HTMLButtonElement>('risk-more'),
  ctaWhen: $('cta-when'),
  ctaLine: $('cta-line'),
  ctaGlobe: $<HTMLCanvasElement>('cta-globe'),
  barBack: $<HTMLAnchorElement>('bar-back'),
  barAbout: $<HTMLAnchorElement>('bar-about'),
  aboutHero: $('about-hero'),
  aboutAnswer: $('about-answer'),
  aboutStats: $('about-stats'),
  aboutBuiltList: $('about-built-list'),
  aboutModelBody: $('about-model-body'),
  aboutModelStats: $('about-model-stats'),
  aboutCheckList: $('about-check-list'),
  aboutTriedList: $('about-tried-list'),
  aboutLimitsList: $('about-limits-list'),
  aboutYear: $<HTMLCanvasElement>('about-year'),
  aboutYearRead: $('about-year-read'),
  aboutYearModes: $<HTMLFieldSetElement>('about-year-modes'),
  aboutSeam: $<HTMLCanvasElement>('about-seam'),
  aboutSteps: $('about-steps'),
  aboutImportance: $<HTMLCanvasElement>('about-importance'),
  aboutImportanceLegend: $('about-importance-legend'),
  aboutWeather: $<HTMLCanvasElement>('about-weather'),
  aboutWeatherRaw: $('about-weather-raw'),
  aboutCalib: $<HTMLCanvasElement>('about-calib'),
  lookGlobe: $<HTMLCanvasElement>('look-globe'),
  lookPlace: $('look-place'),
  lookCoords: $('look-coords'),
  lookFrame: $('look-frame'),
  lookShot: $<HTMLCanvasElement>('look-shot'),
  lookScale: $('look-scale'),
  lookBy: $('look-by'),
  lookFacts: $('look-facts'),
  lookNote: $('look-note'),
  lookWhy: $('look-why'),
  week: $('week'),
  weekDays: $('week-days'),
  weekRead: $('week-read'),
  weekPlay: $<HTMLButtonElement>('week-play'),
  weekPlayText: $('week-play-text'),
  futureProof: $('future-proof'),
  proofWhen: $('proof-when'),
  proofRungs: $('proof-rungs'),
  proofLegend: $('proof-legend'),
  proofRecordTitle: $('proof-record-title'),
  proofRecordNote: $('proof-record-note'),
  proofRecord: $('proof-record'),
  proofStats: $('proof-stats'),
  proofNote: $('proof-note'),
  footAbout: $('foot-about'),
  footFuture: $('foot-future'),
  impactBars: $<HTMLCanvasElement>('impact-bars'),
  impactBarsNote: $('impact-bars-note'),
  rampLow: $('ramp-low'),
  rampHigh: $('ramp-high'),
  status: $('status'),
  ribbonHost: $('ribbon-svg'),
  worldBand: $('world-band'),
  worldSeason: $('world-season') as HTMLCanvasElement,
  worldSeasonCol: $('world-season-col'),
  worldYearsHeadline: $('world-years-headline'),
  mapRange: $('map-range'),
  mapPeriod: $('map-period'),
  worldTempNote: $('world-temp-note'),
  impactLead: $('impact-lead'),
  impactCaveat: $('impact-caveat'),
  impactList: $<HTMLUListElement>('impact-list'),
  impactSources: $('impact-sources'),
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
  worst: $('worst'),
  worstList: $('worst-list'),
  worstNote: $('worst-note'),
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
/**
 * The archive files carry their origin as one English sentence, fixed when
 * they were built. Rebuilding them to translate a caption is not a trade
 * worth making, so the one we ship is recognised here and said in the
 * reader's language; anything else — a file someone dropped in themselves —
 * goes through exactly as it came.
 */
const FIRMS_PROVENANCE =
  'NASA FIRMS — MODIS C6.1 and VIIRS C2 active fire products, retrieved via the FIRMS area API'

function sourceName(raw: string): string {
  return raw === FIRMS_PROVENANCE ? t('provenanceFirms') : raw
}

/**
 * A second line under the map, for what qualifies the picture rather than
 * describes it.
 *
 * The forecast has to say how well it scores, and that is three sentences —
 * above the map, next to the heading, it pushed the map itself off the screen
 * and read as the main statement. It is a footnote, so it sits where one does.
 */
function setMapCaveat(text: string): void {
  els.mapCaveat.textContent = text
  els.mapCaveat.hidden = !text
}

function paintRangeLabel(): void {
  els.rangeYearLabel.textContent = t('rangeYear', { year: String(state.year) })
  els.mapYearValue.textContent = String(state.year)
  els.mapPeriod.dataset.range = worldForecast ? 'forecast' : worldNow ? 'now' : 'year'
  // The day chips only make sense over a framed area: the planet's snapshot is
  // one coarse file for the whole week and has no day in it.
  els.mapDays.hidden = !worldNow || (worldScope && !worldPlace)

  /*
   * The colour scale means a different thing next week than it does for a
   * year. "Burned once … burns often" counts fires that happened; the
   * forecast's cells hold the chance that one will. The key is rewritten
   * rather than the text set directly, so switching language afterwards
   * still finds the right words.
   */
  const low = worldForecast ? 'rampUnlikely' : 'rampLow'
  const high = worldForecast ? 'rampLikely' : 'rampHigh'
  els.rampLow.dataset.i18n = low
  els.rampLow.textContent = t(low)
  els.rampHigh.dataset.i18n = high
  els.rampHigh.textContent = t(high)

  const years = mapYears()
  const i = years.indexOf(state.year)
  els.mapYearPrev.disabled = i <= 0
  els.mapYearNext.disabled = i < 0 || i >= years.length - 1
}

function mapYears(): number[] {
  return worldScope ? (worldIndex?.totals.map((d) => d.year) ?? []) : state.years
}

function setRange(mode: string): void {
  const now = mode === 'now'
  const fc = mode === 'forecast'
  if (worldNow === now && worldForecast === fc) return
  worldNow = now
  worldForecast = fc
  const input = els.mapRange.querySelector<HTMLInputElement>(`input[value="${mode}"]`)
  if (input) input.checked = true
  paintRangeLabel()

  if (fc && !forecast) {
    els.mapNote.textContent = t('worldLoading')
    void loadForecast().then((got) => {
      forecast = got
      if (!got) els.mapNote.textContent = t('forecastMissing')
      else drawMap()
    })
  } else if (now && !worldNowData) {
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
 * The forecast, clipped to whatever is framed.
 *
 * One global grid of probabilities, so a region or a place simply shows its
 * own part of it. The colour runs on probability against a ceiling of one,
 * which is the only scale a probability can honestly have.
 */
/**
 * Which day of the week the map is answering for.
 *
 * Zero means the whole week, which is the model the page has always
 * shipped and the state it opens in. Anything else is one of the shorter
 * horizons: a separate model, asked a separate question.
 */
let weekDay = 0

/** The grid for the chosen day, once it has arrived. */
let weekCells: ForecastCell[] | null = null

function renderMapForecast(box: Bounds | null, name: string | null, fitKey: string): void {
  const got = forecast
  if (!got) {
    els.mapNote.textContent = t('forecastMissing')
    return
  }
  const meta = got.meta
  // The day strip only ever applies to the forecast page's own map; a
  // region's framed forecast is always the full week.
  const cells = weekDay && weekCells && fitKey === 'future' ? weekCells : got.cells
  const half = meta.degrees / 2
  const inside = box
    ? cells.filter(
        (c) =>
          c.lat + half > box.south &&
          c.lat - half < box.north &&
          c.lon + half > box.west &&
          c.lon - half < box.east,
      )
    : cells

  updateMap(
    {
      bounds: box ?? WORLD_VIEW,
      cells: inside.map((c) => ({ lat: c.lat, lon: c.lon, days: c.p })),
      cellKm: 111.32 * meta.degrees,
      cellDeg: meta.degrees,
      frame: box !== null,
      ceiling: 1,
      scale: 'probability',
    },
    claimFit(fitKey),
  )

  const pct = (v: number) => `${(v * 100).toFixed(0)}%`
  // Name the area when there is one, so a framed forecast does not read as
  // a statement about the planet.
  const picked = weekDay && fitKey === 'future'
    ? meta.horizons?.find((h) => h.days === weekDay)
    : undefined
  els.mapNote.textContent =
    (name ? `${name}. ` : '') +
    t('forecastNote', {
      from: formatDate(picked?.from ?? meta.from),
      to: formatDate(picked?.to ?? meta.to),
      asOf: formatDate(meta.asOf),
      cell: t('cellQuarter'),
    })
  // How well it scores belongs under the map, not in front of it.
  setMapCaveat(
    t('forecastSkill', {
      tested: meta.tested,
      model: meta.skill.model.toFixed(2),
      clim: meta.skill.climatology.toFixed(2),
      persist: meta.skill.persistence.toFixed(2),
      base: pct(meta.skill.baseRate),
    }),
  )
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
  if (worldNow || worldForecast) setRange('year')
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
/**
 * Draw the map, and refuse to do it from inside itself.
 *
 * Framing the map moves it, moving it settles, and a settled move asks for a
 * redraw — which frames it again. That closed the circle and overflowed the
 * stack: every view after it froze on the caption of whatever had been open
 * before. The guard is crude on purpose; the alternative is reasoning about
 * which of five draw paths may fit the camera, and being wrong once is a
 * hung page.
 */
let drawing = false

function drawMap(): void {
  if (drawing) return
  drawing = true
  try {
    if (worldScope) renderMapWorld()
    else if (state.dataset) renderMap(state.dataset)
  } finally {
    // After the current task, so a `moveend` raised by this draw's own
    // `fitBounds` still finds the guard closed.
    setTimeout(() => {
      drawing = false
    }, 0)
  }
}

/** Only re-frame the map when the area changes, never on a year click. */
let mapFittedFor = ''

/**
 * Claim the camera for a view, and say whether it still needs framing.
 *
 * The claim is staked before the draw, never after. Leaflet raises `moveend`
 * from inside `fitBounds` synchronously, and the handler for that asks for a
 * redraw; with the key recorded afterwards the redraw read the old one, framed
 * the same view again, and went round until the stack gave out. The throw
 * landed in the caller's catch and the page reported that the globe would not
 * load, which is why this looked like a fetch problem for so long.
 */
function claimFit(key: string): boolean {
  const need = mapFittedFor !== key
  mapFittedFor = key
  return need
}

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
  if (worldForecast && forecast) {
    // A probability, not a count: the readout has to say so or the number
    // reads as "this many fires".
    value.textContent = t('forecastProbe', {
      p: `${Math.round(hit.days * 100)}%`,
      n: String(forecast.meta.horizonDays),
    })
    els.mapProbe.append(coords, value)
    els.mapProbe.hidden = false
    return
  }
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
/**
 * The bands that come and go with a dataset.
 *
 * Two do not. The calendar has always been exempt; the consequences band is
 * the other, because what fires do to the climate is true of a region, of the
 * planet and of a city alike — its one figure is global and its four lines are
 * physics. Hiding it with the region panels left it visible only in the one
 * scope it was least about.
 */
const ALWAYS_ON = new Set(['calendar', 'impact'])

/**
 * The forecast's own bands, which the record's layout must not touch.
 *
 * `dataSections` is every band that a change of area shows or hides. These
 * four answer to the route instead: three belong to the forecast page and
 * the fourth is the door to it, which is the one thing on the record's page
 * that should disappear once the reader has gone through.
 */
const FUTURE_SECTIONS = [
  'future-cta',
  'future-map',
  'future-proof',
  'future-risk',
  'future-trust',
]

/** The about page's bands, which belong to the route and not to the area. */
const ABOUT_SECTIONS = [
  'about-problem',
  'about-built',
  'about-model',
  'about-check',
  'about-limits',
  'about-look',
]

const dataSections = [...document.querySelectorAll<HTMLElement>('.band')].filter(
  (el) =>
    !ALWAYS_ON.has(el.id) &&
    !FUTURE_SECTIONS.includes(el.id) &&
    !ABOUT_SECTIONS.includes(el.id),
)

const futureSections = FUTURE_SECTIONS.map((id) => document.getElementById(id)!)
const aboutSections = ABOUT_SECTIONS.map((id) => document.getElementById(id)!)

/** True while the project's own page is open rather than the record. */
let aboutScope = false

/** True while the forecast page is open rather than the record. */
let futureScope = false

/**
 * Where "back" goes: the last address the record was at.
 *
 * Sending the reader to a fixed route would drop whatever they had open —
 * a region, a year, a searched place — and make the forecast a one-way
 * door.
 *
 * Written by `writeUrl` when it writes a record address, and nowhere else.
 * The two layout switches used to take it themselves, on the way in, by
 * reading `location.hash` — and by then the hash is already the page being
 * opened, because a press changes the address first and the router reacts
 * after. So it was never updated on the usual path and kept whatever it
 * had, which on a direct link to #/future was the address of the link
 * itself. "Back to the record" then pointed at the forecast, and pressing
 * it went nowhere.
 */
let lastRecord = ''

/** Built on the first visit to the forecast page, and kept turning after. */
let globe: GlobeHandle | null = null

/** The small one at the foot of the record, which is the door's window. */
let doorGlobe: GlobeHandle | null = null

/** The record as one ring, on the project's own page. */
let fireYear: YearHandle | null = null

/**
 * How many places the list shows before it is asked for the rest.
 *
 * Twenty rows arriving at once is a wall, and its tail — where the count
 * falls to single figures — is the least interesting part given the most
 * room. Eight is enough to see the shape and the gradient.
 */
const RISK_SHOWN = 8
let riskAll = false

/**
 * The most the globe will draw, chosen by what a frame can afford.
 *
 * The forecast holds seventy-four thousand cells. Projecting all of them
 * beside ninety thousand of land is more arithmetic than sixty frames a
 * second will carry on a laptop, and at this size the faintest are a pixel
 * nobody sees. The brightest twenty-five thousand look the same and cost a
 * third as much.
 */
const GLOBE_CELLS = 25_000
const heroSection = document.querySelector<HTMLElement>('.hero')!

/*
 * Where the map normally lives, remembered before anything moves it.
 *
 * The forecast page shows the same Leaflet instance, wider. Building a
 * second one would mean two tile caches, two view states and two things to
 * keep in step; moving the one we have costs a call to tell it the box
 * changed size.
 */
const mapShell = els.mapEl.parentElement!
const mapShellHome = mapShell.parentElement!
const mapShellAfter = mapShell.nextElementSibling

/**
 * Where the model's reading of the record starts, for the sentence that
 * says so.
 *
 * A year rather than a count of years: a reader can check "since 2003"
 * against the rest of the site, and neither language has to decline it.
 */
const FUTURE_SINCE = 2003

/**
 * What the model card says, restated for the page that describes it.
 *
 * The test years travel with the forecast file, because they can change
 * when the model is retrained. The other two do not travel, so they are
 * written here next to a comment saying where to correct them: in
 * `train_fire_model.py`, which is the one place that decides.
 */
/**
 * How many things the model looks at, when the card has not arrived.
 *
 * This was a constant of thirty, and it went stale the moment the model
 * was first fitted on fewer columns: the page went on saying thirty while
 * the file beside it said twenty-five. A number that describes the model
 * belongs to the model, so it is read from the card now, and this is only
 * the stand-in for a card that failed to load.
 */
const FEATURES_FALLBACK = 25
const ABOUT_SPLITS = { train: '2003\u20132013', validate: '2014\u20132017' }

const calendarSection = document.getElementById('calendar')!
const impactSection = document.getElementById('impact')!
const pickerField = document.getElementById('picker')!

/**
 * Our own dictionary's markup, turned into nodes rather than innerHTML.
 *
 * The strings carry <em> and <b> because the sentence needs emphasis in
 * different places in each language, and only the translator knows where.
 * Parsing them here keeps the interpolated values — counts, dates — out of
 * anything that could be read as markup.
 */
function markup(text: string): DocumentFragment {
  const frag = document.createDocumentFragment()
  const parts = text.split(/(<em>.*?<\/em>|<b>.*?<\/b>)/g)
  for (const part of parts) {
    const tag = /^<(em|b)>(.*)<\/\1>$/s.exec(part)
    if (tag) {
      const node = document.createElement(tag[1])
      node.textContent = tag[2]
      frag.append(node)
    } else if (part) {
      frag.append(document.createTextNode(part))
    }
  }
  return frag
}

/** One figure in a hero's row of figures, for either hero. */
function statInto(list: HTMLElement, label: string, value: string, note: string): void {
  const wrap = document.createElement('div')
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  if (note) {
    const small = document.createElement('small')
    small.textContent = note
    dd.append(' ', small)
  }
  wrap.append(dt, dd)
  list.append(wrap)
}

/**
 * Swap the record's layout for the forecast's, or back.
 *
 * The picker and the raw/harmonised switch go with it: neither has anything
 * to act on here. Leaving a control on screen that changes nothing is worse
 * than not having it.
 */
/**
 * Swap the record's layout for the project's own page, or back.
 *
 * Same shape as the forecast's switch and for the same reason: the picker
 * and the raw/reconciled toggle have nothing to act on here. The map stays
 * where it lives — this page never shows it — so nothing is reparented and
 * nothing has to be put back.
 */
function showAboutLayout(on: boolean): void {
  aboutScope = on
  pickerField.hidden = on
  els.mode.hidden = on
  els.barAbout.hidden = on
  els.barBack.hidden = !on && !futureScope
  els.barBack.href = lastRecord || '#/'

  heroSection.hidden = on
  calendarSection.hidden = on
  impactSection.hidden = on
  els.aboutHero.hidden = !on
  for (const section of aboutSections) section.hidden = !on
  if (on) {
    for (const section of dataSections) section.hidden = true
    for (const section of futureSections) section.hidden = true
    /*
     * The forecast's hero is not one of `futureSections`, and it showed.
     *
     * Those four are the bands the router owns; the hero is turned on and
     * off inside `showFutureLayout`, which the about branch returns before
     * ever reaching. So arriving here from the forecast page left its
     * headline — "83,075 squares carry a real chance of fire" — sitting
     * above the project's page, which is why the footer underneath looked
     * like it was pointing at the wrong place. It was the page above it
     * that was wrong.
     */
    els.futureHero.hidden = true
  }
}

/**
 * Fill the project's page.
 *
 * Every number on it is read from the files the site already ships rather
 * than typed into the copy, so a rebuild cannot leave the prose claiming
 * something the data no longer says.
 */
async function renderAbout(): Promise<void> {
  showAboutLayout(true)
  els.aboutAnswer.textContent = t('aboutAnswer')

  worldIndex ??= await loadWorldIndex().catch(() => null)
  forecast ??= await loadForecast()
  const meta = forecast?.meta

  // Fetched here rather than only inside the charts, because the
  // headline stat and the opening paragraph both quote it and both
  // run before the charts do.
  const card = await loadModelCard().catch(() => null)
  const features = String(card?.features ?? FEATURES_FALLBACK)

  const totals = worldIndex?.totals ?? []
  const detections = totals.reduce((sum, y) => sum + y.modis + y.viirs, 0)

  els.aboutStats.innerHTML = ''
  if (totals.length) {
    statInto(
      els.aboutStats,
      t('aboutStatYears'),
      String(totals.length),
      `${totals[0].year}\u2013${totals[totals.length - 1].year}`,
    )
    statInto(els.aboutStats, t('aboutStatDetections'), compact(detections), '')
  }
  if (meta) {
    statInto(els.aboutStats, t('aboutStatModel'), features, '')
    statInto(
      els.aboutStats,
      t('aboutStatCells'),
      formatNumber(meta.cells),
      t('unitCellSize'),
    )
  }

  fillAboutList(els.aboutBuiltList, 'aboutBuiltList')
  fillAboutList(els.aboutCheckList, 'aboutCheckList')
  fillAboutList(els.aboutTriedList, 'aboutTriedList')
  fillAboutList(els.aboutLimitsList, 'aboutLimitsList')
  fillSteps(formatNumber(card?.trees ?? 500), features)
  drawSeam()
  void drawModelCharts()
  void aboutRing()
  void showLook()

  if (meta) {
    const splits = ABOUT_SPLITS
    els.aboutModelBody.textContent = t('aboutModelBody', {
      features,
      train: splits.train,
      validate: splits.validate,
      // The model card writes its span with a hyphen and the two typed
      // above use an en dash; three date ranges in one sentence should not
      // be punctuated three different ways.
      test: meta.tested.replace('-', '–'),
    })
    els.aboutModelStats.innerHTML = ''
    aboutStat(t('skillModel'), meta.skill.model.toFixed(3))
    aboutStat(t('skillClimatology'), meta.skill.climatology.toFixed(3))
    aboutStat(t('skillPersistence'), meta.skill.persistence.toFixed(3))
    aboutStat('ROC AUC', meta.skill.rocAuc.toFixed(3))
  }
  writeUrl()
  status('')
}

/**
 * The four steps, numbered, because "how it learns" is a sequence and a
 * bulleted list of it reads as four unrelated facts.
 */
/**
 * The four steps, with the two numbers in them read from the model.
 *
 * They were written into the sentence — fifteen hundred trees, thirty
 * columns — and both went stale the first time the model was refitted.
 * The page then described a model that no longer exists, in the one
 * paragraph whose whole purpose is to say how this one works.
 */
function fillSteps(trees: string, features: string): void {
  els.aboutSteps.innerHTML = ''
  for (const [text] of aboutList('aboutSteps')) {
    const item = document.createElement('li')
    item.textContent = text.replace('{trees}', trees).replace('{features}', features)
    els.aboutSteps.append(item)
  }
}

/**
 * The seam itself: the two instruments side by side, year by year.
 *
 * The same chart the world view already draws, reused rather than
 * reinvented. On this page it is not a reading — it is the evidence for
 * the paragraph beside it, which is why it sits under the problem rather
 * than under a heading of its own.
 */
function drawSeam(): void {
  const totals = worldIndex?.totals
  if (!totals?.length) return
  drawWorldYears(els.aboutSeam, totals, totals[totals.length - 1].year)
}

/** The three questions about the model, each answered with its measurement. */
async function drawModelCharts(): Promise<void> {
  const model = await loadModelCard()
  if (!model) return

  drawImportance(
    els.aboutImportance,
    model.importance.map((w) => ({ ...w, name: w.name[getLang()] })),
  )
  els.aboutImportanceLegend.innerHTML = ''
  for (const [key, colour] of [
    ['aboutLegendArchive', '--ink-muted'],
    ['aboutLegendWeather', '--ember'],
    ['aboutLegendGround', '--sensor-modis'],
  ] as const) {
    const item = document.createElement('span')
    item.className = 'legend__item'
    const dot = document.createElement('i')
    dot.className = 'legend__swatch'
    dot.style.background = `var(${colour})`
    item.append(dot, document.createTextNode(t(key)))
    els.aboutImportanceLegend.append(item)
  }

  if (model.edge) {
    /*
     * The margin over the baseline, not the raw scores.
     *
     * Drawn as average precision the three bars were 0.55, 0.54 and 0.53:
     * rounded to one figure they printed as identical, and drawn from zero
     * they were three full-length bars. The chart showed nothing, which is
     * worse than having no chart, because it implied there was nothing to
     * see. What is actually being compared is how far each model gets past
     * a baseline that already knows where fires usually are, and that
     * difference is a clean factor of two.
     */
    drawScaleBars(
      els.aboutWeather,
      [
        { label: t('aboutWeatherWith'), value: model.edge.with * 100, ours: true },
        { label: t('aboutWeatherWithout'), value: model.edge.without * 100 },
      ],
      '%',
    )
    // The bars show the margin; the raw scores belong under them, because
    // the first question anyone asks of a percentage is "of what".
    els.aboutWeatherRaw.textContent = t('aboutWeatherRaw', {
      withAp: model.scores.model.toFixed(3),
      withoutAp: model.without?.model.toFixed(3) ?? '—',
      withRoc: model.scores.rocAuc.toFixed(3),
      withoutRoc: model.without?.rocAuc.toFixed(3) ?? '—',
    })
  }
  if (model.reliability.length) {
    drawCalibration(
      els.aboutCalib,
      model.reliability.map((b) => ({ from: 0, to: 1, n: b.n, said: b.said, burned: b.burned })),
    )
  }
}

/**
 * The radial year, built once and kept.
 *
 * Its data is the global daily series the world view already ships — a
 * hundred kilobytes for every day of the record, both instruments apart —
 * so nothing new is downloaded for it.
 */
async function aboutRing(): Promise<void> {
  if (fireYear) return
  const res = await fetch('/data/world/l0-daily.json').catch(() => null)
  if (!res?.ok) return
  const data = (await res.json()) as FireYear
  fireYear = mountFireYear(els.aboutYear, data, (text) => {
    els.aboutYearRead.textContent = text ?? ''
  })
  fireYear.setMode(state.mode === 'raw' ? 'raw' : 'harmonized')
}

function aboutStat(label: string, value: string): void {
  const wrap = document.createElement('div')
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  wrap.append(dt, dd)
  els.aboutModelStats.append(wrap)
}

function fillAboutList(host: HTMLElement, name: string): void {
  host.innerHTML = ''
  for (const [head, body] of aboutList(name)) {
    const item = document.createElement('li')
    const title = document.createElement('h3')
    title.className = 'subhead subhead--plain'
    title.textContent = head
    const text = document.createElement('p')
    text.className = 'note'
    text.textContent = body
    item.append(title, text)
    host.append(item)
  }
}

function showFutureLayout(on: boolean): void {
  if (!on) els.pick.hidden = true
  // An interval left running against a hidden map is a leak with a view.
  if (!on && weekTimer) stopWeek()
  futureScope = on
  els.barBack.hidden = !on
  els.barBack.href = lastRecord || '#/'
  pickerField.hidden = on
  els.mode.hidden = on
  heroSection.hidden = on
  calendarSection.hidden = on
  impactSection.hidden = on
  for (const section of dataSections) section.hidden = on || section.hidden
  if (on) for (const section of dataSections) section.hidden = true

  els.futureHero.hidden = !on
  for (const section of futureSections) {
    // The door is only on the record's side of it.
    section.hidden = section.id === 'future-cta' ? on : !on
  }

  if (on) els.futureMapSlot.append(mapShell)
  else mapShellHome.insertBefore(mapShell, mapShellAfter)
  invalidateMapSize(true)
}

/**
 * Where today sits inside the forecast's week, in words.
 *
 * Four states, because they mean four different things to a reader: the
 * week has not started, it is running, this is its last day, or it is
 * over and the page is showing history. The last one is deliberately
 * blunt — a forecast page whose window closed is out of date, and saying
 * so is worth more than looking current.
 */
function windowStanding(from: string, to: string): string {
  const day = 86_400_000
  const today = Date.parse(new Date().toISOString().slice(0, 10))
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (today < start) return t('windowEarly')
  if (today > end) return t('windowClosed', { n: formatDays(Math.round((today - end) / day)) })
  const n = Math.round((today - start) / day) + 1
  return today === end ? t('windowLastDay') : t('windowRunning', { n: String(n) })
}


/** The forecast page, filled from the one file the model ships. */
async function renderFuture(): Promise<void> {
  const token = ++loadToken
  status(t('worldLoading'), 'busy')

  /*
   * The layout goes over before the file arrives, not after it.
   *
   * It used to wait for the forecast, and the forecast is the largest
   * thing the site downloads — so for a second and a half warm, and
   * longer on a first visit, the address said `#/future` while the
   * record's own page was still on screen underneath it. Including the
   * band at its foot that invites the reader to the forecast: a door to
   * the room they were standing in, on a page that was already that room.
   *
   * Switching first costs an empty forecast page for that same moment,
   * which at least says what it is, and the status line says it is
   * loading. If the file never comes, the record goes back.
   */
  worldScope = true
  worldPlace = null
  worldNow = false
  worldForecast = true
  showFutureLayout(true)

  try {
    forecast ??= await loadForecast()
    if (token !== loadToken) return
    const got = forecast
    if (!got) {
      status(t('forecastMissing'), 'error')
      showFutureLayout(false)
      return
    }
    const { meta } = got

    /*
     * The dates, and then where the reader's own today falls among them.
     *
     * A window that closed a month ago and one that is running right now
     * print the same three dates, and a page about a forecast lives or
     * dies on which of the two it is. Taken from the clock rather than
     * from the file, so this goes stale on its own and admits it.
     */
    els.futureWhere.textContent =
      t('futureWhere', {
        from: formatDate(meta.from),
        to: formatDate(meta.to),
        asOf: formatDate(meta.asOf),
      }) + ` \u00b7 ${windowStanding(meta.from, meta.to)}`
    els.futureAnswer.replaceChildren(
      markup(t('futureAnswer', { cells: formatNumber(meta.cells) })),
    )
    els.futureAside.replaceChildren(
      markup(t('futureAside', { since: String(FUTURE_SINCE), to: formatDate(meta.to) })),
    )

    els.futureStats.innerHTML = ''
    statInto(els.futureStats, t('futureStatCells'), formatNumber(meta.cells), t('unitCellSize'))
    const spread = [...(meta.hotspots ?? [])].sort((a, b) => b.near - a.near)[0]
    if (spread)
      statInto(
        els.futureStats,
        t('futureStatTop'),
        String(spread.near),
        spread.name[getLang()] ?? '',
      )
    statInto(els.futureStats, t('futureStatTested'), meta.tested, '')
    statInto(
      els.futureStats,
      t('futureStatSkill'),
      `${meta.skill.model.toFixed(2)} / ${meta.skill.climatology.toFixed(2)}`,
      '',
    )

    void showGlobe()

    const back = document.querySelector<HTMLAnchorElement>('.future__back')
    if (back) back.href = lastRecord || '#/'

    els.futureMapNote.textContent = t('futureMapNote')
    fillWeek()
    renderMapForecast(null, null, 'future')
    void renderProof()
    renderRisk()
    renderTrust()
    writeUrl()
    status('')
  } catch (err) {
    console.error('[emberline] forecast page failed', err)
    status(t('worldFailed'), 'error')
  }
}

/**
 * Bring the globe up, once, and give it this week's fires.
 *
 * It keeps turning rather than being torn down and rebuilt: rebuilding
 * costs the land mask's projection every time, and a reader who comes back
 * should find the planet where they left it.
 */
async function showGlobe(): Promise<void> {
  if (!globe) {
    const land = await loadLand()
    if (!land) return
    globe = mountGlobe(els.globeCanvas, land, { onPick: (p) => void openPick(p) })
  }
  globe.setFires(globeFires())
}

/**
 * What the model expects here, beside what the satellite actually saw.
 *
 * The forecast grid and the weekly snapshot are both a quarter of a
 * degree, so the same cell index addresses the same ground in each. That
 * is not a coincidence to be grateful for; it is why the comparison can
 * be made at all, and it is the one this whole project is about —
 * prediction on the left, measurement on the right, same square, seven
 * days apart.
 */
async function openPick(pick: GlobePick | null): Promise<void> {
  els.pick.hidden = !pick
  if (!pick || !forecast) return
  const meta = forecast.meta

  els.pickWhere.textContent = `${pick.lat.toFixed(2)}, ${pick.lon.toFixed(2)}`

  // The snapshot is a separate file and most readers never press a fire,
  // so it is fetched on the first click rather than with the page.
  worldNowData ??= await loadWorldNow().catch(() => null)
  const seen = observedAt(pick.lat, pick.lon)

  els.pickFacts.innerHTML = ''
  pickFact(els.pickFacts, t('pickForecast'), `${Math.min(99, Math.round(pick.p * 100))}%`, 'fore')
  pickFact(els.pickFacts, t('pickSeen'), seen === null ? '—' : formatNumber(seen))

  els.pickNote.textContent =
    seen === 0
      ? t('pickNoneSeen')
      : t('pickNote', { from: formatDate(meta.from), to: formatDate(meta.to) })

  reasonTable ??= await loadReasons().catch(() => null)
  sayWhy(els.pickWhy, pick.lat, pick.lon)
}

/** One labelled figure, in whichever of the two pick panels asked for it. */
function pickFact(host: HTMLElement, label: string, value: string, tone?: string): void {
  const wrap = document.createElement('div')
  const dt = document.createElement('dt')
  dt.textContent = label
  const dd = document.createElement('dd')
  dd.textContent = value
  if (tone) dd.dataset.tone = tone
  wrap.append(dt, dd)
  host.append(wrap)
}

/**
 * A feature name, as something a person would say.
 *
 * Several columns say one thing between them — six windows of "it burned
 * here recently", four of "it is burning next door" — and printing them
 * separately would fill the card with the model's bookkeeping instead of
 * an explanation. They collapse onto one phrase each, and a card that
 * would say the same thing twice says it once.
 */
const WHY_SAYS: Record<string, string> = {
  clim: 'whyClim',
  cell_rate: 'whyCellRate',
  own_1d: 'whyRecent',
  own_3d: 'whyRecent',
  own_7d: 'whyRecent',
  own_14d: 'whyLately',
  own_30d: 'whyLately',
  own_90d: 'whyLately',
  ring_1d: 'whyRing',
  ring_3d: 'whyRing',
  ring_7d: 'whyRing',
  ring_30d: 'whyRing',
  clim_ring: 'whyRing',
  ring_anom_30d: 'whyRingAnom',
  anom_30d: 'whyAnom',
  tile_anom_30d: 'whyRegion',
  ytd_anom: 'whyYear',
  oni: 'whyNino',
  active_30d: 'whyActive',
  lastyear_14d: 'whyLastYear',
  since_last: 'whySince',
  w_dry: 'whyDry',
  w_rain: 'whyRain',
  w_tmax: 'whyHeat',
  w_wind: 'whyWind',
  veg_low: 'whyGrass',
  veg_high: 'whyTrees',
}

/** Fill one of the two cards' reason lines, or hide it. */
function sayWhy(host: HTMLElement, lat: number, lon: number): void {
  const meta = forecast?.meta
  const found = meta ? reasonsAt(reasonTable, lat, lon, meta.degrees, meta.cols) : []

  const said = new Set<string>()
  const words: string[] = []
  for (const name of found) {
    const key = WHY_SAYS[name]
    if (!key || said.has(key)) continue
    said.add(key)
    words.push(t(key))
  }

  host.hidden = words.length === 0
  if (!words.length) return
  host.innerHTML = ''
  const lead = document.createElement('b')
  lead.textContent = t('whyLead')
  host.append(lead, document.createTextNode(words.join(' \u00b7 ')))
}

/** Fetched on the first press, because most readers never make one. */
let reasonTable: Map<number, string[]> | null = null

/** Detections in the snapshot's cell covering this point, or null if unknown. */
function observedAt(lat: number, lon: number): number | null {
  const snap = worldNowData
  if (!snap) return null
  const deg = snap.meta.degrees
  const row = Math.floor((lat + 90) / deg)
  const col = Math.floor((lon + 180) / deg)
  const hit = snap.cells.find(
    (c) => Math.floor((c.lat + 90) / deg) === row && Math.floor((c.lon + 180) / deg) === col,
  )
  return hit ? hit.value : 0
}

/**
 * The planet at the foot of the project's page, and what it is showing.
 *
 * A second instance rather than the forecast page's one moved about: the
 * two pages can both be in the router's history, and a canvas cannot be in
 * two documents at once. Everything inside `mountGlobe` is closed over, so
 * two of them cost two animation frames and nothing else — and neither
 * draws while it is scrolled off, which the globe already handles.
 */
let lookGlobe: GlobeHandle | null = null

/** Where the band is looking, so a theme change can repaint the overlay. */
let lookAt: GlobePick | null = null

/**
 * Only the newest request may write into the frame.
 *
 * Sixteen tiles take a moment, and a reader pressing three places in a row
 * would otherwise get whichever set of tiles happened to land last — a
 * photograph of one place under the numbers of another, with nothing on
 * screen to say so.
 */
let lookRun = 0

async function showLook(): Promise<void> {
  if (!lookGlobe) {
    const land = await loadLand()
    if (!land) return
    lookGlobe = mountGlobe(els.lookGlobe, land, { onPick: (p) => void openLook(p) })
  }
  lookGlobe.setFires(globeFires())
  if (lookAt) return

  /*
   * It opens on the week's likeliest place rather than on an empty frame.
   *
   * A panel that says "press something" before it says anything is a panel
   * most readers scroll past, and this one is the last thing on the page.
   * Starting on the hottest cell of the week means the band is already
   * making its point when the reader arrives; pressing is how they
   * disagree with the choice, not how they earn the first answer.
   */
  const named = [...(forecast?.meta.hotspots ?? [])].sort((a, b) => b.p - a.p)[0]
  const start = named ?? [...globeFires()].sort((a, b) => b.p - a.p)[0]
  if (!start) return
  lookGlobe.flyTo(start.lat, start.lon, 2.2)
  await openLook({ lat: start.lat, lon: start.lon, p: start.p })
}

/**
 * Fill the panel: where this is, what it looks like, what is expected.
 *
 * The photograph is fetched last and awaited on its own, so the numbers —
 * which are already in memory — are on screen while the tiles are still
 * coming down. A reader should never be waiting on imagery to find out
 * what the model said.
 */
async function openLook(pick: GlobePick | null): Promise<void> {
  if (!pick) return
  lookAt = pick
  const run = ++lookRun

  /*
   * The coordinates become the heading when there is no name for the place.
   *
   * Only twenty places on the planet carry one here, so most presses land
   * somewhere unnamed, and a stand-in like "open country" is a sentence
   * that asserts something nobody checked — some of those cells are
   * plantation, some are swamp. The coordinates are the one label that is
   * always true, so they move up and the line under them goes away rather
   * than repeating them.
   */
  const where = `${degree(pick.lat, 'NS')}, ${degree(pick.lon, 'EW')}`
  const named = nameNear(pick.lat, pick.lon)
  els.lookPlace.textContent = named ?? where
  els.lookPlace.dataset.kind = named ? 'name' : 'coords'
  els.lookCoords.textContent = where
  els.lookCoords.hidden = !named

  worldNowData ??= await loadWorldNow().catch(() => null)
  if (run !== lookRun) return
  const seen = observedAt(pick.lat, pick.lon)

  els.lookFacts.innerHTML = ''
  pickFact(els.lookFacts, t('pickForecast'), `${Math.min(99, Math.round(pick.p * 100))}%`, 'fore')
  pickFact(els.lookFacts, t('pickSeen'), seen === null ? '—' : formatNumber(seen))
  els.lookNote.textContent = seen === 0 ? t('pickNoneSeen') : t('lookNote')

  reasonTable ??= await loadReasons().catch(() => null)
  if (run !== lookRun) return
  sayWhy(els.lookWhy, pick.lat, pick.lon)

  els.lookFrame.dataset.state = 'loading'
  const shot = await drawShot(els.lookShot, pick, forecast?.cells ?? [])
  if (run !== lookRun) return
  els.lookFrame.dataset.state = shot.tiles ? 'ready' : 'fail'
  els.lookScale.textContent = t('lookScale', { km: formatNumber(shot.km) })
  els.lookBy.textContent = shot.tiles ? t('lookBy') : t('lookFail')
}

/** 12.25, 'NS' → 12.25° N. Degrees with a hemisphere read better than a sign. */
function degree(value: number, axis: 'NS' | 'EW'): string {
  const side = value >= 0 ? axis[0] : axis[1]
  return `${Math.abs(value).toFixed(2)}\u00b0 ${side}`
}

/**
 * The nearest named place, if one is near enough to be this one.
 *
 * Only the twenty hotspots the risk list prints carry names — they were
 * resolved once at build time rather than twenty times per reader — so
 * most presses fall outside them and get none. Two degrees is roughly two
 * hundred kilometres: close enough that the name still describes the
 * ground in the frame, far enough away that it is not naming a different
 * country.
 */
function nameNear(lat: number, lon: number): string | null {
  const lang = getLang()
  let best: string | null = null
  let bestD = 2
  for (const spot of forecast?.meta.hotspots ?? []) {
    const east = Math.abs(((spot.lon - lon + 540) % 360) - 180) * Math.cos((lat * Math.PI) / 180)
    const d = Math.hypot(spot.lat - lat, east)
    if (d < bestD && spot.name[lang]) {
      bestD = d
      best = spot.name[lang]
    }
  }
  return best
}

/**
 * Build the week strip, or leave it hidden.
 *
 * Hidden is the honest default: a build that made only the seven-day
 * model has nothing to put in it, and a control that offers days the
 * data cannot answer for is worse than no control.
 */
function fillWeek(): void {
  const list = forecast?.meta.horizons
  els.week.hidden = !list || list.length < 2
  if (!list || list.length < 2) return

  // Somebody who has asked for less movement is not offered a control
  // whose only purpose is movement; the days themselves still work.
  els.weekPlay.hidden = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const all = [...list].sort((a, b) => a.days - b.days)
  els.weekDays.innerHTML = ''
  for (const h of all) {
    const day = new Date(`${h.to}T00:00:00Z`)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'week__day'
    btn.setAttribute('role', 'tab')
    // The last horizon is the whole week, which is what `weekDay = 0`
    // means, so both spellings of "everything" select the same thing.
    const isAll = h.days === forecast!.meta.horizonDays
    const mine = isAll ? weekDay === 0 || weekDay === h.days : weekDay === h.days
    btn.dataset.on = h.days <= (weekDay || forecast!.meta.horizonDays) ? 'yes' : 'no'
    btn.dataset.end = mine ? 'yes' : 'no'
    btn.setAttribute('aria-selected', mine ? 'true' : 'false')

    const name = document.createElement('span')
    name.className = 'week__name'
    name.textContent = day.toLocaleDateString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', {
      weekday: 'short',
      timeZone: 'UTC',
    })
    const date = document.createElement('span')
    date.className = 'week__date'
    date.textContent = String(day.getUTCDate())
    btn.append(name, date)
    btn.addEventListener('click', () => {
      // A hand on the strip takes it back from the animation.
      if (weekTimer) stopWeek()
      void pickDay(isAll ? 0 : h.days)
    })
    els.weekDays.append(btn)
  }

  const now = all.find((h) => h.days === (weekDay || forecast!.meta.horizonDays))
  const read = document.createElement('span')
  /*
   * Spelled out, because it sits directly under chips that say "СБ 26".
   *
   * The horizons carry ISO dates and this line printed them raw, so the
   * reader's eye went from a weekday and a number to 2026-09-26 in the
   * same breath. The rest of the site writes dates in words.
   */
  read.textContent = t(weekDay ? 'weekBy' : 'weekAll', {
    to: formatDate(now?.to ?? forecast!.meta.to),
  })
  els.weekRead.innerHTML = ''
  els.weekRead.append(read)
  if (now) {
    const n = document.createElement('b')
    n.textContent = formatNumber(now.cells)
    els.weekRead.append(document.createTextNode(' \u00b7 '), n,
      document.createTextNode(` ${t('weekCells')}`))
  }
}

/**
 * Run the week forward, a day at a time.
 *
 * The strip already says the forecast is cumulative; playing it *shows*
 * that, which is a different kind of knowing — the eye follows fire
 * spreading out of the places it starts, and the shape of a fire season
 * arrives without a sentence explaining it.
 *
 * Every grid is fetched before the first frame rather than during it. On
 * a first play that is seven files, and asking for them one at a time as
 * the animation reached each day made the early days snap past and the
 * later ones stall — the reader would have seen the network, not the
 * week.
 */
let weekTimer = 0

async function playWeek(): Promise<void> {
  if (weekTimer) return stopWeek()
  const all = forecast?.meta.horizons
  if (!all || all.length < 2) return

  els.weekPlay.disabled = true
  els.weekPlayText.textContent = t('weekLoading')
  await Promise.all(all.map((h) => loadHorizon(h.days)))
  els.weekPlay.disabled = false

  els.weekPlay.dataset.on = 'yes'
  els.weekPlayText.textContent = t('weekStop')

  const order = [...all].map((h) => h.days).sort((a, b) => a - b)
  let at = 0
  // Restarting from the first day, because pressing play on the last one
  // and watching nothing happen is the obvious way to get this wrong.
  void pickDay(order[0])

  // Slow enough to read the figure under the map, quick enough that the
  // week is one gesture rather than a slideshow.
  weekTimer = window.setInterval(() => {
    at += 1
    if (at >= order.length) return stopWeek()
    const last = order[order.length - 1]
    void pickDay(order[at] === last ? 0 : order[at])
  }, 1100)
}

function stopWeek(): void {
  if (weekTimer) window.clearInterval(weekTimer)
  weekTimer = 0
  els.weekPlay.dataset.on = 'no'
  els.weekPlayText.textContent = t('weekPlay')
}

/**
 * The weeks that have been scored, oldest first.
 *
 * Each row is one forecast that was published before its week began and
 * then checked against what NASA reported. The share is of the thousand
 * cells the model ranked highest, with the free baseline beside it, so a
 * reader can see both whether the model holds up and whether it is
 * earning its keep — week after week rather than once.
 *
 * A part week is marked as one. Its share can only rise as the remaining
 * days arrive, so an unmarked low number would read as a miss when it is
 * simply early.
 */
function renderRecord(weeks: readonly VerifyWeek[]): void {
  const show = weeks.length > 0
  els.proofRecordTitle.hidden = !show
  els.proofRecordNote.hidden = !show
  els.proofRecord.hidden = !show
  els.proofRecord.innerHTML = ''
  if (!show) return

  const whole = weeks.filter((w) => w.whole)
  const mean = whole.length
    ? whole.reduce((sum, w) => sum + (w.ranking[0]?.burned ?? 0), 0) / whole.length
    : null
  els.proofRecordNote.textContent =
    mean === null
      ? t('proofRecordPartial', { n: String(weeks.length) })
      : t('proofRecordMean', { n: String(whole.length), pct: `${(mean * 100).toFixed(1)}%` })

  for (const week of weeks) {
    const li = document.createElement('li')
    li.className = 'record__row'

    const when = document.createElement('span')
    when.className = 'record__when'
    when.textContent = `${formatDate(week.from)} – ${formatDate(week.to)}`

    const how = document.createElement('span')
    how.className = 'record__how'
    how.textContent = week.whole
      ? t('proofRecordWhole', { computed: formatDate(week.computed) })
      : t('proofRecordSoFar', { computed: formatDate(week.computed), days: formatDays(week.elapsed) })

    const got = document.createElement('span')
    got.className = 'record__got'
    const top = week.ranking[0]
    got.textContent = top ? `${(top.burned * 100).toFixed(1)}%` : '—'

    const base = week.baselines?.persistence?.[0]
    const against = document.createElement('span')
    against.className = 'record__against'
    against.textContent = base ? t('proofRecordAgainst', { pct: `${(base.burned * 100).toFixed(1)}%` }) : ''

    li.append(when, how, got, against)
    els.proofRecord.append(li)
  }
}

/**
 * What became of the forecast that is on this page.
 *
 * The band stays hidden until the verification has been run, and it is
 * hidden rather than filled with dashes because this is the claim a
 * reader is most likely to take on trust. A scorecard that cannot say
 * which week it scored is worth less than no scorecard.
 */
async function renderProof(): Promise<void> {
  const got = await loadVerify().catch(() => null)
  els.futureProof.hidden = !got
  if (!got) return

  els.proofWhen.textContent = t('proofWhen', {
    computed: formatDate(got.computed),
    checked: formatDate(got.checked),
    elapsed: String(got.elapsed),
    detections: formatNumber(got.detections),
  })

  /*
   * The ladder, longest bar first.
   *
   * Scaled to the best rung rather than to a hundred per cent: the
   * argument is that the rate *falls* as the list lengthens, and against
   * a full-width axis every bar would be short and the fall invisible.
   */
  const base = got.baselines?.persistence
  const top = Math.max(
    ...got.ranking.map((r) => r.burned),
    ...(base ?? []).map((r) => r.burned),
    0.01,
  )
  els.proofRungs.innerHTML = ''
  got.ranking.forEach((rung, i) => {
    const li = document.createElement('li')
    li.className = 'proof__rung'

    const label = document.createElement('span')
    label.className = 'proof__label'
    label.textContent =
      rung.top >= got.flagged
        ? t('proofAll')
        : t('proofTop', { n: formatNumber(rung.top) })

    const pct = document.createElement('span')
    pct.className = 'proof__pct'
    pct.textContent = `${(rung.burned * 100).toFixed(1)}%`

    const bar = document.createElement('span')
    bar.className = 'proof__bar'
    const fill = document.createElement('i')
    fill.style.width = `${Math.max(1, (rung.burned / top) * 100)}%`
    bar.append(fill)

    /*
     * The free opponent, on the same rung.
     *
     * "It burned in the last seven days" needs no model and, over a
     * seven-day window in peak season, it is nearly as good: on the week
     * this page was checked against it reached 71.3% of the top thousand
     * where the model reached 72.4%. Drawing it as a mark on the model's
     * own bar rather than as a second bar keeps the comparison to one
     * line per rung, and keeps the reader from having to hold two
     * ladders in their head.
     */
    const other = base?.[i]
    if (other) {
      const mark = document.createElement('u')
      mark.className = 'proof__base'
      mark.style.left = `${Math.min(100, Math.max(0, (other.burned / top) * 100))}%`
      mark.title = t('proofBaseline', { pct: `${(other.burned * 100).toFixed(1)}%` })
      bar.append(mark)
    }

    li.append(label, pct, bar)
    els.proofRungs.append(li)
  })

  /*
   * The calibration chart above cannot be read as calibration until the
   * week closes, and the slope across its bands can be read at any point
   * in it. Appended here because this is the function that knows how far
   * into the window we are; `renderTrust` draws that chart from the model
   * card alone and has no idea what day it is.
   */
  if (!got.whole) {
    els.calibCaption.textContent += ` ${t('calibPartialSlope', { n: String(got.elapsed) })}`
  }

  els.proofLegend.hidden = !base
  if (base) {
    els.proofLegend.textContent = t('proofBaselineLegend', {
      model: `${(got.ranking[0].burned * 100).toFixed(1)}%`,
      base: `${(base[0].burned * 100).toFixed(1)}%`,
    })
  }

  const recall = got.burnedCells ? got.caught / got.burnedCells : 0
  els.proofStats.innerHTML = ''
  statInto(
    els.proofStats,
    t('proofRecall'),
    `${(recall * 100).toFixed(1)}%`,
    t('proofRecallNote', { flagged: formatNumber(got.flagged) }),
  )
  statInto(els.proofStats, t('proofCaught'), formatNumber(got.caught), t('unitCells'))
  statInto(els.proofStats, t('proofMissed'), formatNumber(got.missed), t('unitCells'))

  els.proofNote.textContent = got.whole
    ? t('proofWhole')
    : t('proofPartial', { days: formatDays(got.elapsed), to: formatDate(got.to) })

  renderRecord(await loadVerifyRecord())
}

/** Fetch the day's grid if it is not here yet, then redraw. */
async function pickDay(days: number): Promise<void> {
  if (days === weekDay) return
  weekDay = days
  weekCells = days ? await loadHorizon(days) : null
  if (days && !weekCells) {
    // The file did not arrive. Fall back rather than draw the wrong week.
    weekDay = 0
  }
  fillWeek()
  renderMapForecast(null, null, 'future')
}

/**
 * The brightest cells, and no more than a frame can carry.
 *
 * Sorted once and shared by both globes, because the sort is the expensive
 * part and the answer is the same for each.
 */
let globeCache: GlobeFire[] | null = null

function globeFires(): GlobeFire[] {
  if (globeCache) return globeCache
  const cells = forecast?.cells ?? []
  globeCache =
    cells.length > GLOBE_CELLS
      ? [...cells].sort((a, b) => b.p - a.p).slice(0, GLOBE_CELLS)
      : cells
  return globeCache
}

/**
 * The door at the foot of the record: its line, and its little planet.
 *
 * Loaded on its own rather than with the page, because a reader who never
 * scrolls that far should not pay for the forecast file or the land mask.
 */
async function showDoor(): Promise<void> {
  forecast ??= await loadForecast()
  const meta = forecast?.meta
  if (!meta) return

  els.ctaWhen.textContent = t('futureWhere', {
    from: formatDate(meta.from),
    to: formatDate(meta.to),
    asOf: formatDate(meta.asOf),
  })
  els.ctaLine.replaceChildren(
    markup(t('ctaLine', { cells: formatNumber(meta.cells) })),
  )

  if (!doorGlobe) {
    const land = await loadLand()
    if (!land) return
    doorGlobe = mountGlobe(els.ctaGlobe, land)
  }
  doorGlobe.setFires(globeFires())
}

/**
 * The twenty named places, ordered by how much ground is at stake.
 *
 * Not by probability, although that is how they were chosen. In late
 * September every one of them sits between ninety-seven and a hundred per
 * cent, because the places that burn every year are all burning at once —
 * so a bar drawn from that number is twenty identical bars, and sorting by
 * it puts 99 above 98 as though the difference meant something.
 *
 * What separates them by two orders of magnitude is the size of the
 * neighbourhood that is also at risk: two cells around Al Jufra, two
 * hundred and thirty around Zambia's Western Province. One hot cell and a
 * front three hundred kilometres wide are not the same warning, and that is
 * what the list is sorted and drawn by.
 */
function renderRisk(): void {
  const all = [...(forecast?.meta.hotspots ?? [])].sort((a, b) => b.near - a.near)
  /*
   * No names, no band.
   *
   * The names are added to the forecast file by a second script, so a
   * rebuild that has not been followed by that script leaves the file
   * without them — and this band drew its heading, its explanation and
   * then nothing at all, which reads as a page that broke rather than as
   * data that has not arrived. It has happened once; folding the band
   * means it will not be visible the next time.
   */
  els.futureRisk.hidden = all.length === 0
  if (!all.length) return
  const spots = riskAll ? all : all.slice(0, RISK_SHOWN)
  els.futureRiskList.innerHTML = ''
  const lang = getLang()
  // Measured against the widest of all twenty rather than of the eight on
  // screen, so the bars do not stretch out when the list is folded away.
  const widest = Math.max(1, ...all.map((s) => s.near))

  els.riskMore.hidden = all.length <= RISK_SHOWN
  els.riskMore.textContent = riskAll
    ? t('riskLess')
    : t('riskMore', { n: String(all.length - RISK_SHOWN) })

  spots.forEach((spot, i) => {
    const row = document.createElement('li')
    row.className = 'risk__row'

    const rank = document.createElement('span')
    rank.className = 'risk__rank'
    rank.textContent = String(i + 1)

    const name = document.createElement('span')
    name.className = 'risk__name'
    const label = spot.name[lang] || `${spot.lat.toFixed(1)}, ${spot.lon.toFixed(1)}`
    name.textContent = label
    const where = document.createElement('span')
    where.className = 'risk__where'
    // A byte of probability cannot really say "certain", so it does not.
    where.textContent = `${Math.min(99, Math.round(spot.p * 100))}% · ${spot.lat.toFixed(1)}, ${spot.lon.toFixed(1)}`
    name.append(where)

    const bar = document.createElement('span')
    bar.className = 'risk__bar'
    const fill = document.createElement('i')
    fill.style.setProperty('--p', String(spot.near / widest))
    bar.append(fill)

    const value = document.createElement('span')
    value.className = 'risk__p'
    value.textContent = String(spot.near)

    row.append(rank, name, bar, value)
    els.futureRiskList.append(row)
  })
}

/** The audit: the calibration curve, and what the model is worth against. */
function renderTrust(): void {
  const meta = forecast?.meta
  if (!meta) return

  if (meta.reliability?.length) drawCalibration(els.calibCanvas, meta.reliability)
  els.calibCaption.textContent = t('calibCaption')

  const rows: Array<[string, number, boolean]> = [
    [t('skillModel'), meta.skill.model, true],
    [t('skillClimatology'), meta.skill.climatology, false],
    [t('skillPersistence'), meta.skill.persistence, false],
    [t('skillRandom'), meta.skill.baseRate, false],
  ]
  const best = Math.max(...rows.map(([, v]) => v))

  els.futureSkill.innerHTML = ''
  for (const [label, value, ours] of rows) {
    const row = document.createElement('div')
    row.className = 'skill__row'
    if (ours) row.dataset.ours = 'yes'
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value.toFixed(2)
    const bar = document.createElement('span')
    bar.className = 'skill__bar'
    const fill = document.createElement('i')
    fill.style.setProperty('--p', String(value / best))
    bar.append(fill)
    row.append(dt, dd, bar)
    els.futureSkill.append(row)
  }
  els.futureSkillNote.textContent = t('futureSkillNote', { tested: meta.tested })
}

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
}

/* ------------------------------------------------------------ render */

function render(): void {
  const ds = state.dataset
  if (!ds || !state.clim) return

  /*
   * The year's analysis is computed here, where it is read.
   *
   * It used to live in `rebuild`, which runs when the area or the mode
   * changes — and not when the year does. Stepping through years with
   * the arrows therefore redrew everything from an analysis belonging to
   * whichever year happened to be open when the area was loaded: the
   * heading, the date and the day counts all moved, while "1.7x of
   * normal", the count of hot days and every date shift stayed frozen on
   * the old year. Four numbers that look like measurements of the year
   * you are looking at, and were measurements of a different one.
   *
   * It is the only part of `rebuild` that depends on the year, and it
   * costs a pass over twenty-six season shapes, so it belongs on the
   * render path rather than behind a flag someone has to remember to
   * set.
   */
  state.analysis = analyzeYear(state.year, state.grid, state.clim)

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
  renderWorst(ds)
  renderImpact()

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
  els.mapFacts.hidden = worldScope || worldNow || worldForecast
  els.worst.hidden = worldScope || worldNow || worldForecast
  if (!worldScope && !worldNow && !worldForecast) {
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

/** A frame, written the way this page writes one. Both heroes use it. */
function boundsLabel(b: Bounds): string {
  return (
    `${Math.abs(b.south).toFixed(1)}°${b.south < 0 ? 'S' : 'N'}–${Math.abs(b.north).toFixed(1)}°${b.north < 0 ? 'S' : 'N'}, ` +
    `${Math.abs(b.west).toFixed(1)}°${b.west < 0 ? 'W' : 'E'}–${Math.abs(b.east).toFixed(1)}°${b.east < 0 ? 'W' : 'E'}`
  )
}

function renderHero(ds: Dataset): void {
  // The planet and a searched place write their own; this one is a region's.
  if (worldScope) return
  const a = state.analysis
  const aoi = aoiById(ds.id)
  const b = ds.bounds

  const coords = boundsLabel(b)
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
  heroStat(t('statFires'), compact(totalFires), '')
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
  const trend = annualTrend(state.grid, ds.range)

  metric(t('metricYears'), String(state.years.length), `${ds.range.from.slice(0, 4)}–${ds.range.to.slice(0, 4)}`)
  metric(t('metricActive'), compact(activeCellDays), '')
  metric(t('metricDetections'), compact(ds.totals.rawDetections), '')
  metric(t('metricMerged'), `${mergedPct.toFixed(0)}%`, t('mergedNote'))

  if (trend && Math.abs(trend.slopePct) >= 0.01) {
    const pct = trend.slopePct * 100
    metric(
      t('metricTrend'),
      `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`,
      t('trendOnModis'),
      pct > 0 ? 'up' : 'down',
    )
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
    provenance: sourceName(ds.provenance),
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
          ? t('shiftEarlier', { n: formatDays(Math.abs(shift)) })
          : t('shiftLater', { n: formatDays(shift) })

    const peakShift = a.peakShiftDays
    const peakText =
      peakShift === null || Math.abs(peakShift) < 4
        ? t('peakOnTime')
        : peakShift < 0
          ? t('peakEarlier', { n: formatDays(Math.abs(peakShift)) })
          : t('peakLater', { n: formatDays(peakShift) })

    els.verdict.append(highlight(sentence), document.createTextNode(` ${shiftText}, ${peakText}.`))
  }

  const partial = state.dataset ? isPartialYear(state.dataset) : false
  const trustworthy = baselineYears >= MIN_BASELINE_YEARS && !partial

  fact(
    t('factPeak'),
    formatDoy(a.shape.peak, state.year),
    `${formatNumber(Math.round(a.shape.peakValue))} ${t('unitCellsLit')}`,
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
    meta.textContent = `${formatDays(p.days)} · ${ratioLabel}`

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
  if (worldNow || worldForecast) {
    worldNow = false
    worldForecast = false
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
/**
 * The model's week, rather than the archive's.
 *
 * A third period, not a third place: the same area can be asked what burned
 * in a year, what burned this week, and what the model expects next week.
 */
let worldForecast = false
let forecast: { meta: ForecastMeta; cells: ForecastCell[] } | null = null
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
      // With no box the view is whatever the reader has panned to, and its
      // key is derived from that view. Re-framing would change the view,
      // change the key, and ask for the next fetch of the same ground.
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
    claimFit(fitKey),
  )

  const fires = box ? inside.reduce((sum, c) => sum + c.value, 0) : snap.meta.detections
  const cell = t('cellQuarter')
  els.mapNote.textContent =
    box && name
      ? t('placeNowNote', { place: name, fires: formatNumber(fires), from: formatDate(snap.meta.from), to: formatDate(snap.meta.to), cell })
      : t('worldNowNote', { fires: formatNumber(fires), from: formatDate(snap.meta.from), to: formatDate(snap.meta.to), cell })
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
    claimFit(fitKey),
  )

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
    // With no box the bounds are whatever the reader has panned to, and the
    // ground fetched follows from them. Framing that would move the view,
    // which would move the ground, which would ask for it again.
    box !== null && claimFit(fitKey),
  )

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
  setMapCaveat('')
  if (worldForecast) {
    const place = worldPlace
    renderMapForecast(
      place?.bounds ?? null,
      place?.name ?? null,
      place ? `fc:${place.name}` : 'world-forecast',
    )
    return
  }
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
      claimFit(`place:${place.name}`),
    )
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
    claimFit('world'),
  )
  const tot = worldIndex?.totals.find((d) => d.year === state.year)
  els.mapNote.textContent = t(isTiled(drawnLevel) ? 'worldNoteFine' : 'worldNote', {
    fires: formatNumber(tot ? tot.modis + tot.viirs : 0),
    year: String(state.year),
    cell: t(cellName(drawnLevel)),
  })
}

function renderMap(ds: Dataset): void {
  setMapCaveat('')
  if (worldForecast) {
    const aoi = aoiById(ds.id)
    renderMapForecast(ds.bounds, aoi ? aoi.name[getLang()] : ds.id, `fc:${ds.id}`)
    return
  }
  // A bundled region can be asked "what is burning here this week" too. Its
  // own archive cannot answer it — the cube keeps a year per cell, not a day
  // — so the answer is the same global snapshot, clipped to the region.
  if (worldNow) {
    const aoi = aoiById(ds.id)
    renderMapNow(ds.bounds, aoi ? aoi.name[getLang()] : ds.id, `now:${ds.id}`)
    return
  }
  updateMap({ bounds: ds.bounds, cells: ds.mapCells(state.year), cellKm: ds.mapCellKm }, claimFit(ds.id))
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

/**
 * Which month the planet peaks in, counted rather than eyeballed.
 *
 * Tallied per year and then across years, which is what keeps the arrival
 * of VIIRS in 2012 out of the answer: a year's own peak month does not
 * move because every month of that year was watched by more instruments.
 * Adding the whole record up month by month would instead have let the
 * post-2012 years outvote the rest on volume alone.
 */
function peakMonth(seasons: readonly WorldSeason[]): { month: number; years: number } | null {
  const tally = new Array<number>(12).fill(0)
  for (const season of seasons) {
    let best = 0
    let at = -1
    for (let m = 0; m < 12; m++) {
      const v = (season.modis[m] ?? 0) + (season.viirs[m] ?? 0)
      if (v > best) {
        best = v
        at = m
      }
    }
    if (at >= 0) tally[at] += 1
  }
  let month = -1
  let years = 0
  for (let m = 0; m < 12; m++) {
    if (tally[m] > years) {
      years = tally[m]
      month = m
    }
  }
  return month < 0 ? null : { month, years }
}

/**
 * The opening line for the planet, and for a place found by search.
 *
 * The record's hero states a season — the dates this area burns between —
 * and neither of these two can. A place has the days but not the years of
 * baseline; the planet has neither, at one degree and one month. So each
 * says the truest thing its own data supports: the planet names the month
 * it peaks in most often and how often that was, a place names itself,
 * and both carry the figures for the year on screen.
 */
function renderWorldHero(totals: readonly WorldTotal[]): void {
  const idx = worldIndex
  if (!idx) return
  const place = worldPlace

  els.heroWhere.textContent = place
    ? `${place.name} \u00b7 ${boundsLabel(place.bounds)}`
    : t('worldHeroWhere')

  els.heroAnswer.innerHTML = ''
  els.heroAside.innerHTML = ''

  if (place) {
    els.heroAnswer.textContent = place.name
  } else {
    const peak = peakMonth(idx.seasons)
    if (!peak) {
      els.heroAnswer.textContent = t('worldHeroPlain')
    } else {
      const month = monthOn(peak.month)
      const sentence = t('worldHeroPeak', {
        month,
        n: String(peak.years),
        all: String(idx.seasons.length),
      })
      // The month takes the accent, the way the dates do on a region.
      const at = sentence.indexOf(month)
      if (at < 0) {
        els.heroAnswer.textContent = sentence
      } else {
        const em = document.createElement('em')
        em.textContent = month
        els.heroAnswer.append(sentence.slice(0, at), em, sentence.slice(at + month.length))
      }
    }
    els.heroAside.textContent = t('worldHeroAside')
  }

  els.heroStats.innerHTML = ''
  const pick = totals.find((d) => d.year === state.year)
  if (pick) heroStat(t('metricDetections'), compact(pick.modis + pick.viirs), String(state.year))
  if (totals.length) {
    heroStat(t('statWatching'), String(totals[0].year), formatYears(totals.length))
  }
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
  renderWorldHero(totals)
  /**
   * The temperature only against the planet's own bars.
   *
   * A global anomaly beside one country's fire counts would be two unrelated
   * curves sharing an axis and inviting exactly the reading the caption
   * spends three lines forbidding.
   */
  const temps = days ? undefined : (climate ?? undefined)
  drawWorldYears(els.worldYears, totals, state.year, temps)
  els.worldTempNote.hidden = !temps
  if (temps) els.worldTempNote.textContent = t('tempNote')

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
  renderImpact()
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

/**
 * What the burning does, with the one computed figure that says it.
 *
 * The estimate is the planet's whatever area is open: a region's own share of
 * global emissions is not something this method can honestly split out, and
 * pretending otherwise would be the worst kind of precision. So the number is
 * global, the year follows the year on screen, and the caption says both.
 */
let emissions: EmissionsFile | null = null
/** Global temperature anomaly by year, drawn beside the planet's bars. */
let climate: Map<number, number> | null = null

/**
 * The five days that carried the year, for the area on screen.
 *
 * Fire is heavy-tailed to a degree that surprises people: in a bad season
 * a single week can hold a quarter of the year. The map sums over time
 * and so cannot show it, and the calendar shows it a cell at a time. Five
 * rows and a share say it outright.
 */
function renderWorst(ds: Dataset): void {
  const year = state.year
  const days = ds.days.filter((d) => d.day.startsWith(String(year)) && d.activeCells > 0)
  els.worst.hidden = days.length === 0
  if (!days.length) return

  const total = days.reduce((sum, d) => sum + d.activeCells, 0)
  const top = [...days].sort((a, b) => b.activeCells - a.activeCells).slice(0, 5)
  const peak = top[0].activeCells

  els.worstList.innerHTML = ''
  for (const day of top) {
    const row = document.createElement('li')
    row.className = 'worst__row'

    const when = document.createElement('span')
    when.className = 'worst__when'
    when.textContent = formatDate(day.day)

    const bar = document.createElement('span')
    bar.className = 'worst__bar'
    const fill = document.createElement('i')
    fill.style.setProperty('--p', String(day.activeCells / peak))
    bar.append(fill)

    const n = document.createElement('span')
    n.className = 'worst__n'
    n.textContent = compact(day.activeCells)

    row.append(when, bar, n)
    els.worstList.append(row)
  }

  const share = top.reduce((sum, d) => sum + d.activeCells, 0) / Math.max(total, 1)
  els.worstNote.textContent = t('worstNote', {
    pct: `${Math.round(share * 100)}%`,
    year: String(year),
    days: String(days.length),
  })
}

function renderImpact(): void {
  const est = emissions

  if (est) {
    const gt = est.years[String(state.year)]
    if (gt) {
      const lead = document.createElement('span')
      const [head, tail] = t('impactLead', {
        year: String(state.year),
        share: `${Math.round((gt / est.comparison.annualGtCo2) * 100)}%`,
      }).split('{co2}')
      const strong = document.createElement('b')
      strong.textContent = `${gt.toFixed(1)} ${t('unitGt')}`
      lead.append(document.createTextNode(head ?? ''), strong, document.createTextNode(tail ?? ''))
      // A year still running has months to come, and its figure would
      // otherwise read as a collapse in burning rather than as a calendar.
      if (est.partial?.includes(state.year)) {
        const part = document.createElement('i')
        part.textContent = ' ' + t('impactPartial')
        lead.append(part)
      }
      els.impactLead.replaceChildren(lead)

      drawScaleBars(
        els.impactBars,
        [
          { label: t('barFossil'), value: est.comparison.annualGtCo2 },
          { label: t('barFires', { year: String(state.year) }), value: gt, ours: true },
        ],
        t('unitGt'),
      )
      els.impactBarsNote.textContent = t('barNote')
      els.impactBars.hidden = false
    } else {
      els.impactLead.textContent = t('impactLeadNone', { year: String(state.year) })
    }
    els.impactCaveat.textContent = t('impactCaveat', {
      gfed: String(est.calibratedTo.annualGtCo2),
      from: String(est.from),
    })
    els.impactCaveat.hidden = false
  } else {
    // The file has not arrived, or was never built. The mechanisms below
    // stand on their own, so only the figure is withheld.
    els.impactLead.textContent = ''
    els.impactCaveat.hidden = true
  }

  els.impactList.replaceChildren(
    ...(
      [
        ['impactCo2', 'impactCo2Body'],
        ['impactSoot', 'impactSootBody'],
        ['impactSink', 'impactSinkBody'],
        ['impactLoop', 'impactLoopBody'],
      ] as const
    ).map(([head, body]) => {
      const li = document.createElement('li')
      const b = document.createElement('b')
      b.textContent = t(head)
      const span = document.createElement('span')
      span.textContent = t(body)
      li.append(b, span)
      return li
    }),
  )
  els.impactSources.textContent = t('impactSources')
}

/** The planet replaces the region's panels rather than sitting beside them. */
function showWorldLayout(on: boolean): void {
  /*
   * The hero belongs to whatever is open, not only to a region.
   *
   * It used to be hidden here, because its sentence is about a region's
   * season and the planet has no season at one degree and one month. That
   * left the world route — and any searched place — opening on a section
   * heading: no line for the eye to land on, and no `h1` at all for a
   * reader who is listening to the page rather than looking at it. It is
   * filled by `renderWorldHero` instead of being taken away.
   */
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
    if (worldForecast) forecast ??= await loadForecast()
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
  } catch (err) {
    // The reader is told the globe would not load either way, but a bug in
    // the drawing reaches this catch as readily as a dropped request does,
    // and silence here once cost an afternoon of looking at the network tab.
    console.error('[emberline] world view failed', err)
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
    if (worldForecast) forecast ??= await loadForecast()
    worldDaily ??= await loadWorldDaily()
    if (token !== loadToken) return

    worldScope = true
    showWorldLayout(true)
    renderWorldRibbon()
    renderWorldPanels()
    renderMapWorld()
    writeUrl()
    status('')
  } catch (err) {
    // The reader is told the globe would not load either way, but a bug in
    // the drawing reaches this catch as readily as a dropped request does,
    // and silence here once cost an afternoon of looking at the network tab.
    console.error('[emberline] world view failed', err)
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
    if (worldForecast) forecast ??= await loadForecast()
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
  burnTransition(() => {
    applyTheme(theme)
    /*
     * Every canvas that is not on the record has to be told.
     *
     * `rerender` redraws the record's charts, and the comment that used to
     * sit here said the globes were the only exception. They were not: the
     * about page's three charts read their colours once, at draw time, and
     * a theme switch left them painted in the other theme's palette —
     * white tracks on a near-black page, which read as a styling mistake
     * rather than as a stale canvas.
     */
    globe?.retheme()
    doorGlobe?.retheme()
    lookGlobe?.retheme()
    fireYear?.retheme()
    if (aboutScope) {
      void drawModelCharts()
      // The squares over the photograph are painted from the fire ramp,
      // which is a different ramp in each theme; the photograph itself is
      // not, but the two are one canvas and it is redrawn together.
      if (lookAt) void openLook(lookAt)
    }
  }, theme)
}

function switchLang(lang: Lang): void {
  setLang(lang)
  localStorage.setItem('emberline.lang', lang)
  els.lang.textContent = lang === 'en' ? 'RU' : 'EN'
  applyStaticStrings()
  // The weekday names in the strip come from the locale, not from the
  // dictionary, so `applyStaticStrings` cannot reach them.
  if (futureScope) fillWeek()
  fillAoiOptions()
  paintRangeLabel()
  /*
   * The forecast page builds its own sentences, place names and table rows
   * in script, so the sweep over `data-i18n` leaves all of them in the old
   * language. `rerender` speaks for the record and has nothing to say here.
   */
  void showDoor()
  if (aboutScope) {
    void renderAbout()
    return
  }
  if (futureScope) {
    void renderFuture()
    return
  }
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
    setRange((e.target as HTMLInputElement).value)
  })

  els.mapDays.addEventListener('change', (e) => {
    nowDays = Number((e.target as HTMLInputElement).value) || 7
    drawMap()
  })

  els.aboutYearModes.addEventListener('change', (e) => {
    const value = (e.target as HTMLInputElement).value
    fireYear?.setMode(value === 'raw' ? 'raw' : 'harmonized')
  })

  els.pickClose.addEventListener('click', () => {
    els.pick.hidden = true
    globe?.reset()
  })

  els.weekPlay.addEventListener('click', () => void playWeek())

  els.riskMore.addEventListener('click', () => {
    riskAll = !riskAll
    renderRisk()
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
  /** `#/future` — the forecast's own page, which has no area and no year. */
  future?: boolean
  /** `#/about` — what this is and how to check it. */
  about?: boolean
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
  /*
   * The forecast page is a place in the site, not a state of the map, so it
   * gets a route of its own with nothing in it. An area and a year would
   * both be lies: it is the whole planet, and the week after the archive
   * ends.
   */
  if (parts[0] === 'future') return { future: true }

  /* `#/about` — the project talking about itself. No area, no year. */
  if (parts[0] === 'about') return { about: true }

  /*
   * `#/punjab/forecast/raw` — an address from when next week was a period
   * of the record's map. It is where a reader asked for the forecast, so
   * it lands on the forecast, and `writeUrl` tidies the address after.
   *
   * The slot differs by route and the test has to follow it: on a searched
   * place the period is fourth, and the second holds the place's own name,
   * which comes from OpenStreetMap and could be any word at all.
   */
  if (parts[0] === 'place' ? parts[3] === 'forecast' : parts[1] === 'forecast') {
    return { future: true }
  }

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
  // Two decimals, which is what the address already rounds to. At three
  // this string could never equal the one rebuilt from a link to the same
  // place, and the comparison below is now load-bearing.
  return `place:${b.west.toFixed(2)},${b.south.toFixed(2)},${b.east.toFixed(2)},${b.north.toFixed(2)}:${place.name}`
}

/**
 * What is on screen, spelled the way `goTo` takes it.
 *
 * The test for "the address already matches the view" used to read the
 * picker's `<select>`, and a searched place is not one of its five options
 * — so after visiting one the select still said `punjab`, and a link back
 * to Punjab was taken for a link to where we already were. Nothing loaded:
 * the address became `#/punjab/2024/harmonized` while the hero, the map and
 * the figures all still belonged to the city. The page has to be asked what
 * it is showing, not a control that cannot say.
 */
function currentArea(): string | undefined {
  if (worldPlace) return placeValueOf(worldPlace)
  if (worldScope) return 'world'
  return state.dataset?.id
}

/** Replace rather than push: the back button should leave the page, not undo a click. */
function writeUrl(): void {
  if (aboutScope) {
    if (location.hash !== '#/about') history.replaceState(null, '', '#/about')
    return
  }
  if (futureScope) {
    if (location.hash !== '#/future') history.replaceState(null, '', '#/future')
    return
  }
  // The planet has no dataset, but it does have a year, and a link to it
  // should come back to the same year rather than to whatever region was
  // loaded last.
  const id = worldPlace
    ? `place/${encodeURIComponent(worldPlace.name)}/${worldPlace.bounds.west.toFixed(2)},${worldPlace.bounds.south.toFixed(2)},${worldPlace.bounds.east.toFixed(2)},${worldPlace.bounds.north.toFixed(2)}`
    : worldScope
      ? 'world'
      : state.dataset?.id
  if (!id) return
  const period = worldNow ? 'now' : String(state.year)
  const next = `#/${id}/${period}/${state.mode}`
  // The one place that knows what the record is showing, so the one place
  // that records where "back" returns to.
  lastRecord = next
  if (location.hash !== next) history.replaceState(null, '', next)
}

/*
 * There is no "already navigating" guard here, and there was one.
 *
 * It dropped any hash change that arrived while a load was still running,
 * and nothing ever came back for it: the address changed, the page did
 * not, and it stayed that way until a reload. A searched place made it
 * easy to hit — its daily cube is a few hundred kilobytes, and every link
 * pressed while that was on its way went nowhere.
 *
 * The guard was never protecting anything. This runs on `hashchange`
 * alone, and every address the app writes itself goes through
 * `history.replaceState`, which does not raise that event. Nothing could
 * re-enter it except a reader actually asking for somewhere else, which
 * is the one case it must not refuse. Overlapping loads are already
 * handled a layer down: every `select*` takes a `loadToken` and abandons
 * itself the moment a newer one exists.
 */
function applyUrl(): void {
  const wanted = readUrl()

  /*
   * The door is filled on every route, not once at start-up.
   *
   * Someone who lands straight on #/future never runs the record's boot
   * path, so its closing band stayed empty — no dates, no count, no small
   * planet — for the rest of the session. After the first call this costs
   * nothing: the forecast is cached and the globe is already mounted.
   */
  void showDoor()

  /*
   * A change of page starts at the top of it.
   *
   * These are separate pages sharing one document, so the browser has no
   * navigation to restore a scroll position for: pressing "about the
   * project" from halfway down the record dropped the reader halfway down
   * the about page, in the middle of a sentence whose beginning they had
   * never seen.
   */
  /*
   * Instantly, against the stylesheet's smooth scrolling.
   *
   * `scroll-behavior: smooth` turns a jump to the top into an animation,
   * and the animation was being cancelled halfway: the sections of the
   * page being left are hidden in the same tick, the document loses three
   * thousand pixels of height mid-flight, and Chrome abandons the scroll
   * wherever it had got to. Leaving the forecast page from its foot
   * dropped the reader into the middle of the record.
   */
  const here = aboutScope ? 'about' : futureScope ? 'future' : 'record'
  const there = wanted.about ? 'about' : wanted.future ? 'future' : 'record'
  if (here !== there) window.scrollTo({ top: 0, behavior: 'instant' })

  /*
   * The footer link to the page you are on is hidden, and it is decided
   * here rather than in the two layout functions.
   *
   * There it was wrong on one path: going from the forecast page straight
   * to the project's page never calls `showFutureLayout(false)` — the
   * about branch returns above it — so the forecast's own link stayed
   * hidden and the reader arrived at a footer with nothing in it. This is
   * the one place that knows the page being asked for whatever the page
   * being left was.
   */
  els.footAbout.hidden = there === 'about'
  els.footFuture.hidden = there === 'future'

  /*
   * Raw or reconciled, decided before anything can return without it.
   *
   * This used to sit below, past three branches that return early, and one
   * of them is the way back from the project's page. So `#/punjab/2026/
   * harmonized` pressed from #/about kept whatever the reader had open
   * before — the address said harmonized, the toggle said raw, and then
   * `writeUrl` rewrote the address to agree with the toggle. A link that
   * names a mode is a link about that mode.
   */
  if (wanted.mode && wanted.mode !== state.mode) {
    state.mode = wanted.mode
    const input = els.mode.querySelector<HTMLInputElement>(`input[value="${wanted.mode}"]`)
    if (input) input.checked = true
  }

  if (wanted.about) {
    /*
     * Leaving the forecast page has to be said out loud, even on the way
     * to somewhere that is not the record.
     *
     * This branch used to return without it, so `futureScope` stayed true
     * all the while the project's page was open. The next press of "what
     * happens next week" then found the flag already set, decided there
     * was nothing to render, and left the reader on the record's layout
     * under a #/future address — the record's hero, the record's
     * calendar, and the forecast nowhere. The two patches before this one
     * hid the symptoms, a stray headline and an empty footer; this is the
     * flag itself.
     */
    if (futureScope) showFutureLayout(false)
    if (!aboutScope) void renderAbout()
    return
  }
  const leavingAbout = aboutScope
  if (aboutScope) showAboutLayout(false)

  if (wanted.future) {
    if (!futureScope) void renderFuture()
    return
  }

  /*
   * Leaving the forecast page puts the map back in its own column before
   * anything else runs, so whatever draws next finds it at its own size.
   *
   * And then the record is drawn again from scratch rather than revealed.
   * Someone who arrived straight at #/future has never had it rendered —
   * the sections behind the forecast are empty — and the usual path only
   * redraws when the chosen area changes, which after a direct link it has
   * not. Unhiding empty bands is worse than a moment of loading.
   */
  if (futureScope || leavingAbout) {
    /*
     * Unconditionally, because the about page turns the forecast's bands
     * off and only this can turn them back on.
     *
     * `showAboutLayout(true)` hides every one of `futureSections`, and one
     * of them — `future-cta` — is the door to the forecast that lives at
     * the foot of the record. Coming back from the project's page without
     * ever having been on the forecast page left `futureScope` false, so
     * this was skipped, and the record lost its door until a reload. The
     * call is cheap when there is nothing to undo.
     */
    showFutureLayout(false)
    /*
     * And the period goes back with it.
     *
     * The forecast page sets the map to "next week" so its own map draws
     * the right thing. Leaving without undoing that drew the probability
     * grid on the record, under whatever the period control happened to
     * say. So the period is set from the address being opened rather than
     * only when that address is silent — "back to the record" could point
     * at `#/punjab/now/raw`, and that one asks for a period, so the old
     * test skipped the reset and left the forecast on screen labelled
     * "right now". `setRange` is a no-op when it is already there.
     */
    setRange(wanted.now ? 'now' : 'year')
    const area = wanted.place ? placeValueOf(wanted.place) : (wanted.aoi ?? els.aoi.value)
    picker.setValue(area, wanted.place?.name)
    void goTo(area, wanted.year)
    return
  }

  const wantMode = wanted.now ? 'now' : 'year'
  if ((wantMode === 'now') !== worldNow || worldForecast) {
    worldNow = wantMode === 'now'
    // Set by the forecast page, and nothing else on the record clears it.
    worldForecast = false
    const input = els.mapRange.querySelector<HTMLInputElement>(`input[value="${wantMode}"]`)
    if (input) input.checked = true
  }

  const target = wanted.place ? placeValueOf(wanted.place) : wanted.aoi
  if (target && target !== currentArea()) {
    picker.setValue(target, wanted.place?.name)
    void goTo(target, wanted.year)
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
  renderImpact()
  wire()

  // Two small files, each redrawing what it belongs to once it lands.
  void loadEmissions().then((got) => {
    emissions = got
    renderImpact()
  })
  void loadClimate().then((got) => {
    if (!got) return
    climate = new Map(Object.entries(got.years).map(([y, v]) => [Number(y), v]))
    if (worldScope) renderWorldPanels()
  })

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
    // Only a year view reads from the pyramid. This week and next week draw
    // from the snapshot and the forecast grid, which the branch above already
    // refetches; falling through to the tile check here asked for a yearly
    // patch that the present view has no use for, and redrew on every drag.
    if (worldNow || worldForecast) return
    if (!worldScope || !isTiled(worldLevel) || worldPlace) return
    const step = worldLevel === 'l3' ? 10 : 20
    if (worldPatch?.key === `${worldLevel}:${patchKey(state.year, mapBox(), step)}`) return
    drawMap()
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
  /*
   * A link straight to the forecast page skips the record entirely.
   *
   * The picker is still given a sensible area first, so that pressing "back
   * to the record" lands somewhere rather than on an empty page.
   */
  const startId = wanted.place ? placeValueOf(wanted.place) : (wanted.aoi ?? AOIS[0].id)
  picker.setValue(startId, wanted.place?.name)
  if (wanted.about) {
    await renderAbout()
    return
  }
  if (wanted.future) {
    await renderFuture()
    void showDoor()
    return
  }
  await goTo(startId, wanted.year)
  // The door is filled after the record, not before: it is the last thing
  // on the page and the first thing that can wait.
  void showDoor()
}

void boot()

export type { SensorId }
