export type Lang = 'en' | 'ru'

type Dict = Record<string, string>

/**
 * Plain language, not instrument language.
 *
 * The underlying unit is a 1 km grid cell that burned on a given day. The
 * literature calls that an "active cell-day", which nobody outside the
 * literature understands, so the interface says "fire" and explains the grid
 * once, in the place where the grid actually matters.
 */
const en: Dict = {
  skip: 'Skip to the calendar',
  tagline: 'When and where it burns, MODIS and VIIRS reconciled',

  areaOfInterest: 'Area',
  seriesMode: 'Series',
  modeHarmonized: 'Reconciled',
  modeRaw: 'As recorded',
  modeExplainHarmonized:
    'Years before 2012 are scaled up to match what the sharper modern sensor would have seen, so the whole record can be compared.',
  modeExplainRaw:
    'Exactly what the satellites counted. The jump in 2012 is a better sensor arriving, not more fire.',
  modeCompare: 'Compare the two — watch the years before 2012.',

  heroSeason: 'Fire here runs from {start} to {end}, peaking around {peak}.',
  heroNoSeason: 'No burning has been detected in this area yet.',
  heroYearBusy: '{year} ran {ratio} a normal year.',
  heroYearQuiet: '{year} was quieter than usual, at {ratio} the normal total.',
  heroYearPlain: '{year} came in close to normal.',
  heroConcentration: 'Half of it arrived in just {n} days.',
  partialYear: '{year} is still running — the record ends {date}, so totals for it are incomplete.',
  partialYearShort: 'Not comparable yet: {year} has not finished.',

  statTypical: 'Typical season',
  statThisYear: 'Selected year',
  statWatching: 'Watched since',
  statFires: 'Fires counted',

  sectionCalendar: 'When does it burn here?',
  sectionCalendarNote:
    'One row per year, one square per day. Brighter means more of the area burning at once. A red outline marks a day busier than 9 out of 10 days at that time of year. Click any row to open it below.',
  sectionYear: 'What about {year}?',
  sectionYearNote: 'The shaded band is what this date normally looks like. The line is the year you picked.',
  sectionTable: 'Every year, side by side',
  sectionTableNote: 'Click a column to sort, click a row to open that year above.',
  sectionSensors: 'Who saw it, and how it was reconciled',
  sectionMap: 'Where it burns',
  sectionSource: 'Where the numbers come from',

  yearTotal: 'year',
  legendRamp: 'more burning',
  legendAbove: 'busier than usual',
  normalBand: 'usual range',
  median: 'usual',

  metricYears: 'Years of record',
  metricActive: 'Fires counted',
  metricDetections: 'Detections',
  metricMerged: 'Duplicates removed',
  mergedNote: 'same fire, several satellites',
  metricTrend: 'Change per year',
  metricPeakYear: 'Worst year',
  metricPower: 'Peak power',
  trendFlat: 'no clear trend',

  colYear: 'Year',
  colSeason: 'Season ran',
  colPeak: 'Peak',
  colLength: 'Days',
  colTotal: 'Fires',
  colRatio: 'vs usual',
  colAbove: 'Busy days',

  readingTitle: 'What stands out',
  verdictBusy: 'This year ran {ratio} a usual one, and spent {days} unusually busy.',
  verdictQuiet: 'A quiet year — {ratio} of a usual one, with no long busy stretch.',
  verdictNoSeason: 'Nothing burned here in {year}.',
  criticalTitle: 'Stretches under pressure',
  criticalNote: 'Runs of three days or more busier than 9 out of 10 days at that time of year.',
  factPeak: 'Busiest day',
  factSeason: 'Season',
  factLength: 'Season length',
  factAbove: 'Busy days',
  factConcentration: 'Half the year in',
  factTotal: 'vs a usual year',
  daysUnit: 'days',
  cellsUnit: 'fires',
  ofNormal: 'of a usual year',

  shiftEarlier: 'It started {n} days earlier than usual',
  shiftLater: 'It started {n} days later than usual',
  shiftOnTime: 'It started on schedule',
  peakEarlier: 'and peaked {n} days early',
  peakLater: 'and peaked {n} days late',
  peakOnTime: 'and peaked on time',
  shortBaseline: 'Only {n} of record here, so there is no reliable "usual" to compare against yet.',
  noPeriods: 'Nothing this year stayed unusually busy for three days or more.',
  periodDays: '{n} days',
  periodRatio: '{n}x the usual',

  sensorFrom: 'since {date}',
  sensorAbsent: 'not in this record',
  splitTitle: 'Who detected {year}',
  splitModis: 'Only the 1 km sensor',
  splitBoth: 'Both',
  splitViirs: 'Only the 375 m sensor',
  contribTitle: 'Detections by sensor, year by year',
  contribNote:
    'The step in 2012 is the finer sensor arriving, not more fire. Removing that step is what this project is for.',
  legendModis: '1 km only',
  legendViirs: '375 m only',
  legendBoth: 'both',

  sensitivity:
    'Here the 375 m sensor picks up {k}x as many fires as the 1 km one on the same day (between {lo}x and {hi}x, measured across {n} days when both were watching). Years before 2012 are scaled by that, and the uncertainty is kept.',
  sensitivityUnknown:
    'The two sensor families do not overlap enough in this record to measure a correction, so nothing has been scaled.',

  mapNoteArchive: '{cells} squares of {km} km burned in {years}',
  mapCovered: 'Squares ever burned',
  mapThisYear: 'Burned this year',
  mapHottest: 'Most persistent square',
  mapArea: 'Area watched',
  pickerSearch: 'Search a place…',
  cellDegree: '110 km',
  cellQuarter: '25 km',
  cellFine: '5 km',
  cellFinest: '1 km',
  impactTitle: 'What the burning does',
  impactNote: 'The map says where and when. This is the part that makes it matter — and the part where our own numbers need the most care.',
  impactLead: 'Fires across the planet released roughly {co2} of CO₂ in {year} — about {share} of what fossil fuels put out in a year.',
  impactLeadNone: 'No emissions estimate for {year} yet: it needs a full year of MODIS radiative power.',
  impactPartial: 'That year is still running, so this is a part of it.',
  impactCaveat: 'Read that as an order of magnitude, not a measurement. It comes from radiative power, which a polar-orbiting satellite samples a few times a day, and the whole series is scaled so the MODIS era matches the published GFED total of {gfed} Gt a year. Peat fires, which burn below ground, are badly underestimated. MODIS only, from {from}, because the combined series steps upward every time a new satellite joins.',
  impactCo2: 'Carbon that had been stored for centuries',
  impactCo2Body: 'Forests and peat hold carbon that took decades or millennia to accumulate. Burning returns it to the air in hours.',
  impactSoot: 'Soot that darkens ice',
  impactSootBody: 'Black carbon absorbs sunlight in the air, and where it settles on snow it makes the surface darker — so the surface absorbs more and melts faster.',
  impactSink: 'A smaller sink',
  impactSinkBody: 'A burnt forest stops taking carbon out of the air. Where drought and heat prevent regrowth, that loss is not temporary.',
  impactLoop: 'And round again',
  impactLoopBody: 'Warmer, drier weather makes fire more likely; fire makes the air warmer. That loop is why this record is worth keeping at all.',
  impactSources: 'Emission method: Wooster 2005, GFAS. Reference total: van der Werf 2017 (GFED4.1s). Fossil comparison: Global Carbon Budget 2024.',
  tempTitle: 'Temperature',
  tempLegend: 'Global anomaly, °C',
  tempNote: 'The grey line is the global temperature anomaly, for context only. This record cannot attribute fires to warming: it is twenty-six years long, the instruments changed in the middle of it, and much of what burns follows a sowing calendar rather than the weather.',
  worldPointsNote: '{fires} detections between {from} and {to}, drawn one by one. Equal dots: a pixel\'s true footprint is not in the record. A snapshot from the last build, not a live feed.',
  placePointsNote: '{place}: {fires} detections between {from} and {to}, drawn one by one. Equal dots: a pixel\'s true footprint is not in the record.',
  probePoint: '{sensor}, {time} UTC',
  probeConfidence: 'Confidence',
  confLow: 'low',
  confNominal: 'nominal',
  confHigh: 'high',
  unitKm2: 'km²',
  unitGt: 'Gt',
  placeHint: 'Anywhere on Earth, from the global archive',
  placeNote: '{place}: {fires} detections in {year}, {cell} cells, monthly.',
  placeNoteFine: '{place}: {fires} detections over {year}, {cell} cells.',
  placeCalendarNote: '{place}: every day since 2000, summed over the {n} cells of {cell} inside the frame. One row a year, one square a day; brighter means more burning at once, and a red outline marks a day hotter than 9 in 10 days at that time of year. Click a row to select that year.',
  placeQuiet: '{place}: nothing detected in {year}.',
  pickerEmpty: 'Nothing matches that.',
  pickerSearching: 'Looking…',
  pickerFailed: 'Place search is unavailable — try again in a moment.',
  worldNowNote: '{fires} detections between {from} and {to}, {cell} cells. A snapshot, taken when the site was last built — not a live feed.',
  placeNowNote: '{place}: {fires} detections between {from} and {to}, {cell} cells. A snapshot from the last build, not a live feed.',
  rangeLegend: 'Period',
  rangeYear: '{year}',
  rangeNow: 'Right now',
  rangeForecast: 'Next week',
  forecastNote: 'Chance of a fire large enough for the 1 km sensor to see, {from} to {to}, per {cell} cell. Computed from the archive as it stood on {asOf} — a build-time estimate, not a live forecast.',
  forecastSkill: 'Scored on {tested}, years the model never saw: {model} average precision against {clim} for "how often it burns here at this time of year" and {persist} for "it burned last week". Picking at random scores {base}. The margin over the seasonal baseline is small, and it is printed here rather than hidden: without daily weather — rain, wind, humidity — most of what is predictable about the next week is the season.',
  forecastProbe: '{p} chance in the next {n} days',
  forecastMissing: 'No forecast has been built for this deployment.',
  nowDaysLegend: 'How far back',
  nowDay1: 'Last day',
  nowDay3: '3 days',
  nowDay7: '7 days',
  worldNowLabel: 'The whole world · right now',
  worldNowHint: 'The last week, as of the latest update',
  worldHint: 'Every year since 2000, monthly',
  regionHint: 'Daily, 27 years, 1 km',
  worldModis: 'MODIS · 1 km',
  worldViirs: 'VIIRS · 375 m',
  worldSeasonTitle: 'When the planet burns',
  worldSeasonNote: 'Every year is a faint line; the chosen one is drawn over them. A month here is the whole surface of the Earth added together.',
  worldYearsTitle: 'Year by year',
  worldYearsNote: 'The two instruments stand side by side, not stacked. VIIRS arrives in 2012 and sees several times as many fires over the same ground — stacked, that would read as the planet catching fire.',
  worldHeadline: '{fires} detections in {year}. {all} across {from}–{to}, one-degree cells, monthly.',
  placeHeadline: '{place}: {fires} detections in {year}, {all} across {from}–{to}.',
  scopeWorld: 'World',
  worldLoading: 'Loading the planet…',
  worldNote: '{fires} detections in {year}, {cell} cells, MODIS and VIIRS together. Monthly — for a single day, pick a region.',
  worldNoteFine: '{fires} detections in {year}, {cell} cells, MODIS and VIIRS together. The whole year — for a single day, pick a region.',
  worldFailed: 'The global overview could not be loaded.',
  basemapLegend: 'Base map',
  basemapDark: 'Map',
  basemapSatellite: 'Satellite',
  basemapRelief: 'Relief',
  mapHint: 'Drag to pan, double-click or use the buttons to zoom.',
  probeBurned: 'burned {n} of {total} days',
  probeDetections: '{n} detections here in {year}',
  probeQuiet: 'never burned here',
  rampLow: 'burned once',
  rampHigh: 'burns often',
  rampUnlikely: 'unlikely',
  rampLikely: 'near certain',

  dataSource: 'Data source',
  srcArchive: 'Bundled',
  srcLive: 'Live',
  srcFile: 'My file',
  mapKey: 'FIRMS key',
  lastDays: 'Window',
  fetchLive: 'Fetch recent fires',
  liveNote: 'Recent days only. NASA gives keys away free; yours stays in this browser.',
  dropCsv: 'Drop a FIRMS CSV here, or click to choose',
  fileNote: 'Any archive download from FIRMS works. The file is read here and never uploaded.',
  exportSeries: 'Download this series as CSV',

  statusLoading: 'Loading…',
  statusFetching: 'Asking NASA…',
  statusParsing: 'Reconciling…',
  statusLiveDone: '{n} detections over {days} days became {cells} fires.',
  statusFileDone: '{n} detections from {files} files became {cells} fires.',
  statusNeedKey: 'Paste a FIRMS key first.',
  statusNoRows: 'Nothing usable came back.',
  statusFailed: 'Could not load: {err}',
  statusNoArchive: 'Nothing bundled for this area yet.',
  statusShortRecord: 'Short record — a reliable "usual" needs several years.',
  emptyArchiveTitle: 'This area has no bundled data yet',
  emptyArchiveBody:
    'Pick another area, or switch the source to a live NASA query or your own CSV export. Both run exactly the same reconciliation, right here in the browser.',

  concentrationLine: 'Half of {year} burned in {n} days, and {pct}% of the year fell in {month}.',
  colophon:
    'Fire detections from NASA FIRMS (MODIS and VIIRS). These mark burning at the moment a satellite passed overhead, not the area burned. Built for the NASA Space Apps Challenge 2026.',
  provenanceFirms: 'NASA FIRMS — MODIS C6.1 and VIIRS C2 active fire products, retrieved via the FIRMS area API',
  ctaTitle: 'And then?',
  scopeGlobal: 'Worldwide',
  aboutLink: 'About the project',
  aboutKicker: 'NASA Space Apps 2026 \u00b7 Harmonization of MODIS and VIIRS Hot Spots',
  aboutAnswer: 'Two satellites disagree about how much the world burns. This makes them agree.',
  aboutLede:
    'MODIS has watched since 2000 at a kilometre. VIIRS arrived in 2012 and sees several times as many fires over the same ground. Put the two together without thinking and the record shows a global surge in 2012 that never happened \u2014 an instrument being replaced, read as the planet catching fire.',
  aboutStatYears: 'Years of record',
  aboutStatDetections: 'Detections read',
  aboutStatCells: 'Cells in the forecast',
  aboutStatModel: 'Model features',

  aboutProblemTitle: 'The problem',
  aboutProblemBody:
    'A fire detection is not a fire. It is one satellite pass finding one pixel hot enough to flag, and how many it flags depends on the pixel\u2019s size. The 375-metre sensor resolves small fires the 1-kilometre one averages away; over the same ground on the same day it reports several times as many. The ratio is not a constant \u2014 it is about 4 in dense cropland and over 13 in sparse bush \u2014 so a single global correction is the wrong answer too. It has to be measured per place.',
  aboutProblemAside: 'Why it matters',
  aboutProblemNote:
    'Anyone asking "is it burning more than it used to" is asking a question the raw record cannot answer. Every trend through 2012 is contaminated by the instrument. Switch between "as recorded" and "reconciled" anywhere on this site and watch what happens to the years before 2012 \u2014 that difference is the whole problem, made visible.',

  aboutBuiltTitle: 'What was built',
  aboutBuiltNote:
    'A static site: no server, no database, no account. Everything below is a file the browser fetches and draws.',

  aboutModelTitle: 'The model',
  aboutModelNote:
    'A gradient-boosted classifier, trained on the archive and on the weather of the week it is asked about.',
  aboutModelBody:
    'It reads {features} things about every quarter-degree cell: how often it burns at this time of year, how recently it burned, what its neighbours are doing, how far the year is from its own normal, where ENSO stands \u2014 and the forecast weather of the week ahead, which is the half the fire archive cannot supply. Trained on {train}, tuned on {validate}, scored on {test}: years it had never seen. The weather roughly doubles its margin over the seasonal baseline.',
  aboutModelNumbers: 'Measured',
  aboutModelCaveat:
    'One qualifier: the model learned from the weather that actually happened, and the live map runs on a forecast of it. The figures above are what is reachable if the weather forecast is right.',

  aboutCheckTitle: 'Check us',
  aboutCheckNote:
    'Every claim on this site is either visible in the interface or reproducible from the code. Nothing rests on trusting the authors.',
  barFossil: 'Fossil fuels, a year',
  barFires: 'The planet burning, {year}',
  barNote: 'On one scale, so the share is a picture rather than a division. The fuel figure is a whole year; the fires are only the part of the year that has happened.',
  ctaNote:
    'Everything above already happened. One thing has not: a model trained on the whole record puts a number on the week ahead, and says plainly how often that number has been right.',
  ctaButton: 'What happens next week',
  ctaLine: 'Somewhere in <b>{cells}</b> squares, the next seven days carry a real chance of fire.',

  futureWhere: '{from} to {to} \u00b7 built {asOf}',
  futureAnswer: 'Somewhere in <em>{cells}</em> squares, the next seven days carry a real chance of fire.',
  futureAside:
    'A gradient-boosted model reads this archive <b>back to {since}</b> \u2014 where it has burned, how recently, what the season usually does \u2014 together with <b>the weather of the week ahead</b>: how hot, how windy, how much rain, and what is standing there to burn. Every 25 km cell gets the chance that the 1 km sensor sees a fire there before {to}.',
  futureStatCells: 'Cells at risk',
  futureStatTop: 'Widest front',
  futureStatTested: 'Scored on',
  futureStatSkill: 'Against the season',

  futureMapTitle: 'Where it may burn',
  futureMapNote:
    'Brighter is likelier. This is a chance, not a count: a pale cell may still burn and a bright one may not. A pale cell is not a safe one; it is a cell the model is less sure about.',

  futureRiskTitle: 'Twenty places to watch',
  futureRiskNote:
    'The likeliest cells, kept apart so the list names twenty places rather than one place twenty times. All twenty are above 97%, which is why the bar shows something else: how many cells within two degrees are also more likely than not to burn. One hot cell and a front three hundred kilometres wide are not the same warning. Names come from OpenStreetMap at build time.',

  futureTrustTitle: 'How much to believe it',
  futureTrustNote:
    'A forecast that cannot be checked is decoration. Everything below was scored on years the model never saw while it was learning.',
  calibCaption:
    'Each dot is a group of cells the model gave about the same chance. On the line means the chance was right. Ours sit just above it: when it says 85%, about 89% burn \u2014 it is slightly too cautious, which is the safer way to be wrong.',
  futureSkillHead: 'Measured against',
  skillModel: 'This model',
  skillClimatology: 'The season alone',
  skillPersistence: 'It burned last week',
  skillRandom: 'Picking at random',
  futureSkillNote:
    'Average precision on {tested}. The season alone is a hard baseline; with the weather the model roughly doubles its margin over it, from 2.0% to 3.9%. One qualifier, because it matters: the model learned from the weather that actually happened, and the live map is driven by a forecast of it. So this is what is reachable if the weather forecast is right \u2014 an upper bound, not a promise.',
  futureBack: 'Back to the record',
  globeHint: 'Drag to turn',
  riskMore: 'Show {n} more',
  riskLess: 'Show fewer',

  provenanceLine:
    '{provenance}. {days} days of record, {detections} detections, {dropped} rows dropped as volcanoes, gas flares or offshore sources.',
}

const ru: Dict = {
  skip: 'К календарю',
  tagline: 'Когда и где горит: MODIS и VIIRS, сведённые вместе',

  areaOfInterest: 'Район',
  seriesMode: 'Ряд',
  modeHarmonized: 'Сведено',
  modeRaw: 'Как снято',
  modeExplainHarmonized:
    'Годы до 2012-го подняты до того, что увидел бы сегодняшний, более острый сенсор — чтобы весь ряд можно было сравнивать.',
  modeExplainRaw:
    'Ровно то, что насчитали спутники. Скачок в 2012-м — это приход более точного сенсора, а не рост пожаров.',
  modeCompare: 'Сравните два режима — смотрите на годы до 2012-го.',

  heroSeason: 'Здесь горит с {start} по {end}, пик приходится на {peak}.',
  heroNoSeason: 'Горения в этом районе пока не зафиксировано.',
  heroYearBusy: '{year} год дал {ratio} от обычного.',
  heroYearQuiet: '{year} год был спокойнее обычного — {ratio} от нормы.',
  heroYearPlain: '{year} год прошёл примерно как обычно.',
  heroConcentration: 'Половина этого пришлась всего на {n} дней.',
  partialYear: '{year} год ещё идёт — данные заканчиваются {date}, поэтому итоги за него неполные.',
  partialYearShort: 'Сравнивать пока не с чем: {year} год не закончился.',

  statTypical: 'Обычный сезон',
  statThisYear: 'Выбранный год',
  statWatching: 'Наблюдаем с',
  statFires: 'Очагов насчитано',

  sectionCalendar: 'Когда здесь горит?',
  sectionCalendarNote:
    'Строка — год, квадратик — день. Чем ярче, тем больше горело одновременно. Красный контур — день горячее, чем 9 из 10 дней в это же время года. Нажмите строку, чтобы открыть год ниже.',
  sectionYear: 'Что с {year} годом?',
  sectionYearNote: 'Заливка — то, как эта дата выглядит обычно. Линия — выбранный вами год.',
  sectionTable: 'Все годы рядом',
  sectionTableNote: 'Нажмите заголовок, чтобы отсортировать, строку — чтобы открыть год выше.',
  sectionSensors: 'Кто это видел и как данные сведены',
  sectionMap: 'Где горит',
  sectionSource: 'Откуда цифры',

  yearTotal: 'год',
  legendRamp: 'сильнее горит',
  legendAbove: 'горячее обычного',
  normalBand: 'обычный коридор',
  median: 'обычно',

  metricYears: 'Лет наблюдений',
  metricActive: 'Очагов насчитано',
  metricDetections: 'Засечек',
  metricMerged: 'Дублей убрано',
  mergedNote: 'один очаг, несколько спутников',
  metricTrend: 'Изменение за год',
  metricPeakYear: 'Худший год',
  metricPower: 'Пик мощности',
  trendFlat: 'явного тренда нет',

  colYear: 'Год',
  colSeason: 'Сезон шёл',
  colPeak: 'Пик',
  colLength: 'Дней',
  colTotal: 'Очагов',
  colRatio: 'к обычному',
  colAbove: 'Горячих дней',

  readingTitle: 'Что бросается в глаза',
  verdictBusy: 'Год дал {ratio} от обычного и провёл {days} горячее нормы.',
  verdictQuiet: 'Спокойный год — {ratio} от обычного, без длинных горячих отрезков.',
  verdictNoSeason: 'В {year} году здесь ничего не горело.',
  criticalTitle: 'Периоды под нагрузкой',
  criticalNote: 'Отрезки от трёх дней подряд горячее, чем 9 из 10 дней в это время года.',
  factPeak: 'Самый горячий день',
  factSeason: 'Сезон',
  factLength: 'Длина сезона',
  factAbove: 'Горячих дней',
  factConcentration: 'Половина года за',
  factTotal: 'к обычному году',
  daysUnit: 'дней',
  cellsUnit: 'очагов',
  ofNormal: 'от обычного года',

  shiftEarlier: 'Он начался на {n} дней раньше обычного',
  shiftLater: 'Он начался на {n} дней позже обычного',
  shiftOnTime: 'Он начался в обычный срок',
  peakEarlier: 'и вышел на пик на {n} дней раньше',
  peakLater: 'и вышел на пик на {n} дней позже',
  peakOnTime: 'и вышел на пик вовремя',
  shortBaseline: 'Здесь всего {n} наблюдений — надёжной «нормы» для сравнения пока нет.',
  noPeriods: 'В этом году ничего не держалось горячее обычного три дня подряд и дольше.',
  periodDays: '{n} дней',
  periodRatio: '{n}× от обычного',

  sensorFrom: 'с {date}',
  sensorAbsent: 'нет в этих данных',
  splitTitle: 'Кто засёк {year} год',
  splitModis: 'Только километровый',
  splitBoth: 'Оба',
  splitViirs: 'Только 375-метровый',
  contribTitle: 'Засечки по сенсорам, год за годом',
  contribNote:
    'Ступенька в 2012-м — это выход на орбиту более точного сенсора, а не рост пожаров. Убрать её и есть задача этого проекта.',
  legendModis: 'только 1 км',
  legendViirs: 'только 375 м',
  legendBoth: 'оба',

  sensitivity:
    'Здесь 375-метровый сенсор различает в {k} раза больше очагов, чем километровый, в тот же день (от {lo}× до {hi}×, измерено по {n} дням, когда работали оба). Годы до 2012-го пересчитаны с этим коэффициентом, погрешность сохранена.',
  sensitivityUnknown:
    'Два семейства сенсоров пересекаются в этих данных слишком мало, чтобы измерить поправку, поэтому пересчёт не применялся.',

  mapNoteArchive: '{cells} квадратов по {km} км горели в {years}',
  mapCovered: 'Квадратов горело хоть раз',
  mapThisYear: 'Горели в этом году',
  mapHottest: 'Самый упорный квадрат',
  mapArea: 'Площадь наблюдения',
  pickerSearch: 'Найти место…',
  cellDegree: '110 км',
  cellQuarter: '25 км',
  cellFine: '5 км',
  cellFinest: '1 км',
  impactTitle: 'Чем это отзывается',
  impactNote: 'Карта говорит где и когда. Здесь — зачем это важно, и здесь же наши собственные цифры требуют больше всего осторожности.',
  impactLead: 'Пожары планеты за {year} год выбросили примерно {co2} CO₂ — около {share} от годовых выбросов от ископаемого топлива.',
  impactLeadNone: 'Для {year} оценки пока нет: нужен полный год измерений мощности MODIS.',
  impactPartial: 'Год ещё идёт, так что это его часть.',
  impactCaveat: 'Читайте это как порядок величины, а не как измерение. Оценка считается от мощности излучения, которую спутник видит несколько раз в сутки, и весь ряд приведён к опубликованному итогу GFED — {gfed} Гт в год. Торфяники, горящие под землёй, занижены сильно. Только MODIS и только с {from} года: в общем ряду ступенька на каждом новом спутнике.',
  impactCo2: 'Углерод, копившийся веками',
  impactCo2Body: 'В лесах и торфе запасён углерод, на который ушли десятилетия и тысячелетия. Пожар возвращает его в воздух за часы.',
  impactSoot: 'Сажа, которая темнит лёд',
  impactSootBody: 'Чёрный углерод поглощает солнечный свет в воздухе, а осев на снег — делает поверхность темнее. Темнее — значит больше тепла и быстрее таяние.',
  impactSink: 'Меньше того, что поглощает',
  impactSinkBody: 'Сгоревший лес перестаёт забирать углерод из воздуха. Там, где засуха и жара мешают подросту, эта потеря не временная.',
  impactLoop: 'И снова по кругу',
  impactLoopBody: 'Суше и жарче — больше пожаров; больше пожаров — теплее. Ради этой петли такой архив и имеет смысл вести.',
  impactSources: 'Метод оценки: Wooster 2005, GFAS. Опорный итог: van der Werf 2017 (GFED4.1s). Сравнение с топливом: Global Carbon Budget 2024.',
  tempTitle: 'Температура',
  tempLegend: 'Аномалия, °C',
  tempNote: 'Серая линия — глобальная аномалия температуры, только как контекст. Связать пожары с потеплением по этому ряду нельзя: в нём двадцать шесть лет, приборы менялись посередине, а большая часть горения идёт по аграрному календарю, а не по погоде.',
  worldPointsNote: '{fires} засечек с {from} по {to}, каждая отдельно. Точки одинаковые: настоящий след пикселя в данных не записан. Снимок последней сборки, не живой поток.',
  placePointsNote: '{place}: {fires} засечек с {from} по {to}, каждая отдельно. Точки одинаковые: настоящий след пикселя в данных не записан.',
  probePoint: '{sensor}, {time} UTC',
  probeConfidence: 'Уверенность',
  confLow: 'низкая',
  confNominal: 'обычная',
  confHigh: 'высокая',
  unitKm2: 'км²',
  unitGt: 'Гт',
  placeHint: 'Любая точка Земли, из глобального архива',
  placeNote: '{place}: {fires} засечек за {year} год, ячейка {cell}, помесячно.',
  placeNoteFine: '{place}: {fires} засечек за {year} год, ячейка {cell}.',
  placeCalendarNote: '{place}: каждый день с 2000 года, сложено по {n} ячейкам по {cell} внутри рамки. Строка — год, квадратик — день; чем ярче, тем больше горело одновременно, а красный контур — день горячее, чем 9 из 10 дней в это же время года. Нажмите строку, чтобы выбрать год.',
  placeQuiet: '{place}: за {year} год ничего не зафиксировано.',
  pickerEmpty: 'Ничего не нашлось.',
  pickerSearching: 'Ищу…',
  pickerFailed: 'Поиск мест недоступен — попробуйте через минуту.',
  worldNowNote: '{fires} засечек с {from} по {to}, ячейка {cell}. Это снимок на момент последней сборки сайта, а не живой поток.',
  placeNowNote: '{place}: {fires} засечек с {from} по {to}, ячейка {cell}. Снимок последней сборки, не живой поток.',
  rangeLegend: 'Период',
  rangeYear: '{year}',
  rangeNow: 'Прямо сейчас',
  rangeForecast: 'На неделю вперёд',
  forecastNote: 'Вероятность пожара, достаточно крупного для километрового сенсора, с {from} по {to}, на ячейку {cell}. Считано по архиву на {asOf} — оценка на момент сборки, не живой прогноз.',
  forecastSkill: 'Проверено на {tested} — годах, которых модель не видела: средняя точность {model} против {clim} у «как часто здесь горит в это время года» и {persist} у «горело на прошлой неделе». Случайный выбор даёт {base}. Перевес над сезонной базой небольшой, и он здесь написан, а не спрятан: без суточной погоды — дождя, ветра, влажности — предсказуемо в ближайшей неделе почти только сезон.',
  forecastProbe: '{p} вероятность в ближайшие {n} дней',
  forecastMissing: 'Для этой сборки прогноз не посчитан.',
  nowDaysLegend: 'За какой срок',
  nowDay1: 'Последний день',
  nowDay3: '3 дня',
  nowDay7: '7 дней',
  worldNowLabel: 'Весь мир · прямо сейчас',
  worldNowHint: 'Последняя неделя, на момент обновления',
  worldHint: 'Каждый год с 2000-го, помесячно',
  regionHint: 'Посуточно, 27 лет, 1 км',
  worldModis: 'MODIS · 1 км',
  worldViirs: 'VIIRS · 375 м',
  worldSeasonTitle: 'Когда горит планета',
  worldSeasonNote: 'Каждый год — бледная линия, выбранный нарисован поверх. Месяц здесь — это вся поверхность Земли, сложенная вместе.',
  worldYearsTitle: 'Год за годом',
  worldYearsNote: 'Два прибора стоят рядом, а не друг на друге. VIIRS появляется в 2012-м и видит на той же земле в несколько раз больше очагов — сложенные, они читались бы как вспышка пожаров.',
  worldHeadline: '{fires} засечек за {year} год. Всего {all} за {from}–{to}, ячейка в градус, помесячно.',
  placeHeadline: '{place}: {fires} засечек за {year} год, всего {all} за {from}–{to}.',
  scopeWorld: 'Весь мир',
  worldLoading: 'Загружаю планету…',
  worldNote: '{fires} засечек за {year} год, ячейка {cell}, MODIS и VIIRS вместе. Помесячно — за конкретный день смотрите регион.',
  worldNoteFine: '{fires} засечек за {year} год, ячейка {cell}, MODIS и VIIRS вместе. Год целиком — за конкретный день смотрите регион.',
  worldFailed: 'Не удалось загрузить глобальный обзор.',
  basemapLegend: 'Подложка',
  basemapDark: 'Карта',
  basemapSatellite: 'Спутник',
  basemapRelief: 'Рельеф',
  mapHint: 'Тяните, чтобы двигать; двойной щелчок или кнопки — масштаб.',
  probeBurned: 'горел {n} из {total} дней',
  probeDetections: '{n} засечек здесь за {year} год',
  probeQuiet: 'здесь не горело',
  rampLow: 'горел однажды',
  rampHigh: 'горит часто',
  rampUnlikely: 'маловероятно',
  rampLikely: 'почти наверняка',

  dataSource: 'Источник данных',
  srcArchive: 'В комплекте',
  srcLive: 'Живые',
  srcFile: 'Мой файл',
  mapKey: 'Ключ FIRMS',
  lastDays: 'Окно',
  fetchLive: 'Запросить свежие',
  liveNote: 'Только последние дни. NASA выдаёт ключи бесплатно, ваш останется в браузере.',
  dropCsv: 'Перетащите сюда CSV из FIRMS или нажмите для выбора',
  fileNote: 'Подойдёт любая выгрузка из FIRMS. Файл читается здесь и никуда не отправляется.',
  exportSeries: 'Скачать этот ряд в CSV',

  statusLoading: 'Загружаю…',
  statusFetching: 'Спрашиваю NASA…',
  statusParsing: 'Свожу данные…',
  statusLiveDone: '{n} засечек за {days} дней превратились в {cells} очагов.',
  statusFileDone: '{n} засечек из {files} файлов превратились в {cells} очагов.',
  statusNeedKey: 'Сначала вставьте ключ FIRMS.',
  statusNoRows: 'Ничего пригодного не пришло.',
  statusFailed: 'Не удалось загрузить: {err}',
  statusNoArchive: 'Для этого района данных в комплекте пока нет.',
  statusShortRecord: 'Короткий ряд — для надёжной «нормы» нужно несколько лет.',
  emptyArchiveTitle: 'Для этого района данных пока нет',
  emptyArchiveBody:
    'Выберите другой район или переключите источник на живой запрос к NASA либо на свой CSV. Оба пути проходят ровно то же сведение — прямо здесь, в браузере.',

  concentrationLine: 'Половина {year} года сгорела за {n} дней, а {pct}% всего объёма пришлось на {month}.',
  colophon:
    'Засечки огня из NASA FIRMS (MODIS и VIIRS). Они отмечают горение в момент пролёта спутника, а не выгоревшую площадь. Сделано для NASA Space Apps Challenge 2026.',
  provenanceFirms: 'NASA FIRMS — продукты активных пожаров MODIS C6.1 и VIIRS C2, получены через area API FIRMS',
  ctaTitle: 'А дальше?',
  scopeGlobal: 'По всей планете',
  aboutLink: 'О проекте',
  aboutKicker: 'NASA Space Apps 2026 \u00b7 Сведение очагов MODIS и VIIRS',
  aboutAnswer: 'Два спутника не согласны, сколько горит мир. Здесь они приведены к согласию.',
  aboutLede:
    'MODIS смотрит с 2000 года с километрового шага. VIIRS появился в 2012-м и видит на той же земле в несколько раз больше очагов. Сложите их не думая — и в ряду появится всплеск 2012 года, которого не было: смена прибора, прочитанная как загоревшаяся планета.',
  aboutStatYears: 'Лет ряда',
  aboutStatDetections: 'Засечек прочитано',
  aboutStatCells: 'Ячеек в прогнозе',
  aboutStatModel: 'Признаков у модели',

  aboutProblemTitle: 'Задача',
  aboutProblemBody:
    'Засечка — это не пожар. Это один пролёт спутника, нашедший один пиксель достаточно горячим, и сколько таких пикселей найдётся, зависит от размера пикселя. Сенсор 375 м различает мелкие очаги, которые километровый усредняет до нуля. И отношение не постоянное — около 4 на густой пашне и больше 13 в редком кустарнике, — так что один общий коэффициент тоже неверен. Его надо мерить для каждого места отдельно.',
  aboutProblemAside: 'Почему это важно',
  aboutProblemNote:
    'Любой, кто спрашивает «горит ли больше, чем раньше», задаёт вопрос, на который сырой ряд ответить не может. Любой тренд через 2012 год испорчен прибором. Переключите «как снято» и «сведено» где угодно на сайте и посмотрите на годы до 2012-го — эта разница и есть вся задача, показанная глазам.',

  aboutBuiltTitle: 'Что сделано',
  aboutBuiltNote:
    'Статический сайт: ни сервера, ни базы, ни аккаунта. Всё ниже — файлы, которые браузер скачивает и рисует сам.',

  aboutModelTitle: 'Модель',
  aboutModelNote:
    'Градиентный бустинг, обученный на архиве и на погоде той недели, о которой его спрашивают.',
  aboutModelBody:
    'Он читает {features} вещей про каждую ячейку в четверть градуса: как часто здесь горит в это время года, как давно горело, что делают соседи, насколько год отошёл от своей нормы, где сейчас Эль-Ниньо — и прогноз погоды на ближайшую неделю, то есть ту половину, которую архив пожаров дать не может. Обучение {train}, настройка {validate}, проверка {test} — годы, которых он не видел. Погода почти удваивает его перевес над сезонной базой.',
  aboutModelNumbers: 'Измерено',
  aboutModelCaveat:
    'Одна оговорка: модель училась на погоде, которая была на самом деле, а живая карта идёт по прогнозу погоды. Цифры выше — это то, что достижимо, если прогноз погоды верен.',

  aboutCheckTitle: 'Проверьте нас',
  aboutCheckNote:
    'Каждое утверждение на этом сайте либо видно в интерфейсе, либо воспроизводится из кода. Верить авторам не требуется нигде.',
  barFossil: 'Ископаемое топливо за год',
  barFires: 'Пожары планеты, {year}',
  barNote: 'На одной шкале — чтобы доля была картинкой, а не делением в уме. Топливо — целый год; пожары — только та часть года, которая уже прошла.',
  ctaNote:
    'Всё выше уже случилось. Одно — нет: модель, обученная на всём архиве, ставит число на ближайшую неделю и честно говорит, как часто это число сбывалось.',
  ctaButton: 'Что будет на следующей неделе',
  ctaLine: 'В <b>{cells}</b> квадратах ближайшие семь дней несут реальный шанс пожара.',

  futureWhere: 'с {from} по {to} · считано {asOf}',
  futureAnswer: 'В <em>{cells}</em> квадратах ближайшие семь дней несут реальный шанс пожара.',
  futureAside:
    'Модель градиентного бустинга читает архив <b>с {since} года</b> — где горело, как давно, что обычно делает сезон — и вместе с этим <b>погоду ближайшей недели</b>: жару, ветер, дождь и то, чему там гореть. Каждая ячейка 25 км получает вероятность того, что километровый сенсор увидит там огонь до {to}.',
  futureStatCells: 'Ячеек в зоне риска',
  futureStatTop: 'Самый широкий фронт',
  futureStatTested: 'Проверено на',
  futureStatSkill: 'Против сезона',

  futureMapTitle: 'Где может загореться',
  futureMapNote:
    'Ярче — вероятнее. Это шанс, а не количество: бледная ячейка всё равно может загореться, а яркая — нет. Бледная ячейка — не безопасная, а та, в которой модель меньше уверена.',

  futureRiskTitle: 'Двадцать мест, за которыми стоит следить',
  futureRiskNote:
    'Самые вероятные ячейки, разнесённые друг от друга — чтобы в списке было двадцать разных мест, а не одно место двадцать раз. Все двадцать выше 97%, поэтому полоска показывает другое: сколько ячеек в радиусе двух градусов тоже скорее загорятся, чем нет. Одна горячая точка и фронт в триста километров — разные новости. Названия — из OpenStreetMap, подставлены при сборке.',

  futureTrustTitle: 'Насколько ей можно верить',
  futureTrustNote:
    'Прогноз, который нельзя проверить, — это украшение. Всё ниже посчитано на годах, которых модель при обучении не видела.',
  calibCaption:
    'Каждая точка — группа ячеек, которым модель дала примерно одинаковый шанс. На линии — значит шанс был верный. Наши лежат чуть выше: когда модель говорит 85%, горит около 89% — она слегка перестраховывается, и это безопасная сторона ошибки.',
  futureSkillHead: 'С чем сравниваем',
  skillModel: 'Эта модель',
  skillClimatology: 'Один только сезон',
  skillPersistence: 'Горело на прошлой неделе',
  skillRandom: 'Случайный выбор',
  futureSkillNote:
    'Средняя точность на {tested}. Один только сезон — очень сильная база; с погодой модель почти удваивает перевес над ней, с 2.0% до 3.9%. Одна оговорка, и она важная: модель училась на погоде, которая была на самом деле, а живая карта идёт по прогнозу погоды. То есть это то, что достижимо, если прогноз погоды верен, — верхняя граница, а не обещание.',
  futureBack: 'Назад к архиву',
  globeHint: 'Потяните, чтобы повернуть',
  riskMore: 'Показать ещё {n}',
  riskLess: 'Свернуть',

  provenanceLine:
    '{provenance}. {days} дней ряда, {detections} засечек, {dropped} строк отброшено как вулканы, газовые факелы и офшорные источники.',
}

const DICTS: Record<Lang, Dict> = { en, ru }

const MONTHS: Record<Lang, string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
}

/** Genitive forms, so "с 12 мая по 3 июля" reads like Russian and not like a form. */
const MONTHS_OF: Record<Lang, string[]> = {
  en: MONTHS.en,
  ru: [
    'января',
    'февраля',
    'марта',
    'апреля',
    'мая',
    'июня',
    'июля',
    'августа',
    'сентября',
    'октября',
    'ноября',
    'декабря',
  ],
}


/** Short months as they appear after a day number: 10 мая, not 10 май. */
const MONTHS_SHORT_OF: Record<Lang, string[]> = {
  en: MONTHS.en,
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
}

/** Accusative after "пришлось на": на июль, на май. English needs no change. */
const MONTHS_ON: Record<Lang, string[]> = {
  en: MONTHS.en,
  ru: [
    'январь',
    'февраль',
    'март',
    'апрель',
    'май',
    'июнь',
    'июль',
    'август',
    'сентябрь',
    'октябрь',
    'ноябрь',
    'декабрь',
  ],
}

/** Month name in the form that follows "fell in" / "пришлось на". */
export function monthOn(index: number): string {
  return MONTHS_ON[current][index]
}

let current: Lang = 'en'

export function setLang(lang: Lang): void {
  current = lang
  document.documentElement.lang = lang
}

export function getLang(): Lang {
  return current
}

export function t(key: string, params?: Record<string, string | number>): string {
  let out = DICTS[current][key] ?? DICTS.en[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) out = out.replaceAll(`{${k}}`, String(v))
  }
  return out
}

/**
 * Plural forms. English needs two, Russian needs three and picks by the last
 * digits: 1 год, 2-4 года, 5-20 лет. Writing "year(s)" instead is the tell of an
 * interface nobody proof-read.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  if (current === 'en') return n === 1 ? one : many
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** "142 days" / "142 дня" */
export function formatDays(n: number): string {
  return current === 'en'
    ? `${n} ${plural(n, 'day', 'days', 'days')}`
    : `${n} ${plural(n, 'день', 'дня', 'дней')}`
}

/** "3 years" / "3 года" */
export function formatYears(n: number): string {
  return current === 'en'
    ? `${n} ${plural(n, 'year', 'years', 'years')}`
    : `${n} ${plural(n, 'год', 'года', 'лет')}`
}

export function months(): string[] {
  return MONTHS[current]
}

/** Day of year as a short label: "12 Aug" / "12 авг". */
export function formatDoy(doy: number, year = 2001): string {
  const d = new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86_400_000)
  return `${d.getUTCDate()} ${MONTHS_SHORT_OF[current][d.getUTCMonth()]}`
}

/** Day of year inside a sentence: "12 August" / "12 августа". */
export function formatDoyLong(doy: number, year = 2001): string {
  const d = new Date(Date.UTC(year, 0, 1) + (doy - 1) * 86_400_000)
  return `${d.getUTCDate()} ${MONTHS_OF[current][d.getUTCMonth()]}`
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(current === 'ru' ? 'ru-RU' : 'en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value)
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.getUTCDate()} ${months()[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** Apply every `data-i18n` attribute in the document. */
export function applyStaticStrings(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!)
  })
  // Placeholders are text a reader sees, and were being missed: the search box
  // carried the attribute from the start and kept its English prompt in Russian
  // because nothing ever read it.
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder!)
  })
}

/**
 * The two lists on the about page, kept out of the string dictionary.
 *
 * Everything else in here is one string for one key, which is what makes
 * `t()` simple and what the `Dict` type enforces. These are pairs of a
 * heading and a paragraph, repeated, and squeezing them into that shape
 * would have meant four keys per row and a numbering scheme nobody could
 * edit. Their own structure costs one exported function.
 */
export type AboutRow = readonly [string, string]

const aboutLists: Record<Lang, Record<string, readonly AboutRow[]>> = {
  en: {
    aboutBuiltList: [
    ['The reconciliation', 'The sensitivity ratio between the two instruments, measured separately for every area and season rather than assumed, and applied so the years before 2012 read on the same scale as the years after.'],
    ['A pyramid of resolutions', 'The whole planet at one degree by month, down to a hundredth of a degree by year \u2014 four levels, drawn from the level the zoom can actually use, so the globe loads as fast as a city.'],
    ['A day at a time', 'Every day of 24 years at a quarter degree, which is what makes a calendar of 9,000 days possible for any point on Earth.'],
    ['This week, and next', 'The last seven days as a snapshot, and a gradient-boosted model\u2019s estimate of the seven to come.'],
    ['What it does', 'Fire radiative power turned into carbon dioxide by the published method, calibrated against GFED, with the caveats printed beside the number rather than in a footnote.'],
    ],
    aboutCheckList: [
    ['The forecast is scored against reality', 'The week on the map was computed before it happened. `verify_forecast.py` asks NASA what has burned since and scores it \u2014 ranking from day one, calibration once the week closes. The answer did not exist when the question was asked.'],
    ['The reconciliation is a switch', 'Every chart has "as recorded" beside "reconciled". If the correction were doing something dishonest, it would be visible in one click.'],
    ['The skill figure is the unflattering one', 'Average precision against a seasonal baseline that already knows where fires usually are \u2014 not accuracy against a 5% base rate, which would read as 95% and mean nothing.'],
    ['The data is NASA\u2019s', 'FIRMS MODIS C6.1 and VIIRS C2, fetched through the public API. Every number here can be recomputed from the same source.'],
    ],
  },
  ru: {
    aboutBuiltList: [
    ['Сведение приборов', 'Отношение чувствительности двух сенсоров — измеренное для каждой местности и сезона, а не принятое на веру, — и применённое так, что годы до 2012-го читаются в одной шкале с последующими.'],
    ['Пирамида разрешений', 'Вся планета от градуса помесячно до сотой градуса погодно — четыре уровня, и берётся тот, который зум реально может показать. Поэтому глобус грузится так же быстро, как город.'],
    ['Сутки за сутками', 'Каждый день 24 лет на четверти градуса — именно это делает возможным календарь на 9 000 дней для любой точки Земли.'],
    ['Эта неделя и следующая', 'Последние семь дней снимком и оценка модели на семь вперёд.'],
    ['Чем это отзывается', 'Мощность излучения, переведённая в CO₂ по опубликованной методике и сверенная с GFED, с оговорками рядом с числом, а не в сноске.'],
    ],
    aboutCheckList: [
    ['Прогноз сверяется с реальностью', 'Неделя на карте посчитана до того, как она случилась. `verify_forecast.py` спрашивает у NASA, что сгорело с тех пор, и считает оценку: ранжирование с первого дня, калибровка когда неделя закроется. Ответа не существовало в момент вопроса.'],
    ['Сведение — это переключатель', 'У каждого графика рядом с «сведено» есть «как снято». Если бы поправка делала что-то нечестное, это было бы видно в один клик.'],
    ['Цифра точности — самая невыгодная', 'Средняя точность против сезонной базы, которая уже знает, где обычно горит, — а не «доля верных ответов» при базе 5%, которая дала бы 95% и не значила бы ничего.'],
    ['Данные — насовские', 'FIRMS MODIS C6.1 и VIIRS C2 через публичный API. Любое число отсюда пересчитывается из того же источника.'],
    ],
  },
}

export function aboutList(name: string): readonly AboutRow[] {
  return aboutLists[getLang()][name] ?? []
}
