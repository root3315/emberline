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
  basemapLegend: 'Base map',
  basemapDark: 'Map',
  basemapSatellite: 'Satellite',
  basemapRelief: 'Relief',
  mapHint: 'Drag to pan, double-click or use the buttons to zoom.',
  probeBurned: 'burned {n} of {total} days',
  probeQuiet: 'never burned here',
  rampLow: 'burned once',
  rampHigh: 'burns often',

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
  basemapLegend: 'Подложка',
  basemapDark: 'Карта',
  basemapSatellite: 'Спутник',
  basemapRelief: 'Рельеф',
  mapHint: 'Тяните, чтобы двигать; двойной щелчок или кнопки — масштаб.',
  probeBurned: 'горел {n} из {total} дней',
  probeQuiet: 'здесь не горело',
  rampLow: 'горел однажды',
  rampHigh: 'горит часто',

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
}
