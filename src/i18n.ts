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
  modeLegend: 'How the years are counted',
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
  heroConcentration: 'Half of it arrived in just {n}.',
  partialYear: '{year} is still running — the record ends {date}, so totals for it are incomplete.',
  partialYearShort: 'Not comparable yet: {year} has not finished.',

  statTypical: 'Typical season',
  statThisYear: 'Selected year',
  statWatching: 'Watched since',

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
  colTotal: 'Cells × days',
  colRatio: 'vs usual',
  colAbove: 'Busy days',

  readingTitle: 'What stands out',
  verdictBusy: 'Detections ran {ratio} the usual for a year, and {days} were busier than usual.',
  verdictQuiet: 'A quiet year: detections ran {ratio} the usual, with no long busy stretch.',
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
  pageTitle: 'Emberline — when and where it burns',
  unitCells: 'cells',
  unitCellSize: '25 km each',
  /* Cells alight on a single day — not detections, and not cell-days:
     one number that three different words had been tried on. */
  unitCellsLit: 'cells alight',
  statFires: 'Cells × days with fire',
  metricActive: 'Cells × days with fire',
  ofNormal: 'of a usual year',

  shiftEarlier: 'It started {n} days earlier than usual',
  shiftLater: 'It started {n} days later than usual',
  shiftOnTime: 'It started on schedule',
  peakEarlier: 'and peaked {n} days early',
  peakLater: 'and peaked {n} days late',
  peakOnTime: 'and peaked on time',
  shortBaseline: 'Only {n} of record here, so there is no reliable "usual" to compare against yet.',
  noPeriods: 'Nothing this year stayed unusually busy for three days or more.',
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

  mapNoteArchive: '{cells} cells of {km} km burned in {years}',
  mapCovered: 'Cells ever burned',
  mapThisYear: 'Burned this year',
  mapHottest: 'Most persistent cell',
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
  snapshotBehind: 'It is {n} behind today.',
  worldNowNote: '{fires} detections between {from} and {to}, {cell} cells. A snapshot, taken when the site was last built — not a live feed.',
  placeNowNote: '{place}: {fires} detections between {from} and {to}, {cell} cells. A snapshot from the last build, not a live feed.',
  rangeLegend: 'Period',
  rangeYear: '{year}',
  rangeNow: 'Right now',
  forecastShortWindow:
    'The scale is the same on every day of the strip, so a shorter window looks paler \u2014 fewer cells clear one per cent at all, and the ones that do have had less time. Over a single day {cells} cells are on the map against {all} for the whole week. The map has not gone quiet; the chance really is smaller.',
  forecastNote: 'Chance of a fire large enough for the 1 km sensor to see, {from} to {to}, per {cell} cell. Computed from the archive as it stood on {asOf} — a build-time estimate, not a live forecast.',
  forecastSkill: 'Scored on {tested}, years the model never saw: {model} average precision against {clim} for "how often it burns here at this time of year" and {persist} for "it burned last week". Picking at random scores {base}. The margin over the seasonal baseline is small, and it is printed here rather than hidden: without daily weather — rain, wind, humidity — most of what is predictable about the next week is the season.',
  forecastProbe: '{p} chance in the next {n} days',
  forecastMissing: 'No forecast has been built for this deployment.',
  nowDaysLegend: 'How far back',
  nowDay1: 'Last day',
  nowDay3: '3 days',
  nowDay7: '7 days',
  worldHint: 'Every year since 2000, monthly',
  regionHint: 'Daily, 27 years, 1 km',
  worldModis: 'MODIS · 1 km',
  worldViirs: 'VIIRS · 375 m',
  worldSeasonTitle: 'When the planet burns',
  worldSeasonNote: 'Every year is a faint line; the chosen one is drawn over them. A month here is the whole surface of the Earth added together.',
  worldYearsTitle: 'Year by year',
  worldYearsNote: 'The two instruments stand side by side, not stacked. VIIRS arrives in 2012 and sees several times as many fires over the same ground — stacked, that would read as the planet catching fire.',
  worldHeroWhere: 'The whole planet · MODIS and VIIRS, monthly',
  worldHeroPeak: 'The peak falls in {month} more often than in any other month — in {n} of {all} years.',
  worldHeroPlain: 'The monthly record, for the whole surface at once.',
  worldHeroAside:
    'The two instruments are counted apart. VIIRS arrives in 2012 and sees several times as much over the same ground, so totals either side of that year are not the same measurement.',
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
  probeBurned: 'burned {n} of {total} days',
  probeDetections: '{n} detections here in {year}',
  probeQuiet: 'never burned here',
  rampLow: 'burned once',
  rampHigh: 'burns often',
  rampUnlikely: 'unlikely',
  rampForecastNote:
    'The bar is linear: the colour halfway along it is an even chance, and a cell painted at a tenth of the way is a one-in-ten cell. Anything under one per cent is left off the map entirely.',
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
  worstTitle: 'The days that made the year',
  worstNote: 'These five hold {pct} of everything {year} burned, across {days} days that burned at all. Fire is not spread through a season; it arrives in a handful of afternoons.',

  statusLoading: 'Loading…',
  statusFetching: 'Asking NASA…',
  statusParsing: 'Reconciling…',
  statusLiveDone: '{n} detections over {days} days — that is {cells} cells alight, counted a day at a time.',
  statusFileDone: '{n} detections from {files} files — that is {cells} cells alight, counted a day at a time.',
  statusNeedKey: 'Paste a FIRMS key first.',
  statusNoRows: 'Nothing usable came back.',
  statusFailed: 'Could not load: {err}',
  statusNoArchive: 'Nothing bundled for this area yet.',
  statusShortRecord: 'Short record — a reliable "usual" needs several years.',
  emptyArchiveTitle: 'This area has no bundled data yet',
  emptyArchiveBody:
    'Pick another area, or switch the source to a live NASA query or your own CSV export. Both run exactly the same reconciliation, right here in the browser.',

  concentrationLine: 'Half of {year} burned in {n}, and {pct}% of the year fell in {month}.',
  colophon:
    'Fire detections from NASA FIRMS (MODIS and VIIRS). These mark burning at the moment a satellite passed overhead, not the area burned. Built for the NASA Space Apps Challenge 2026.',
  provenanceFirms: 'NASA FIRMS — MODIS C6.1 and VIIRS C2 active fire products, retrieved via the FIRMS area API',
  ctaTitle: 'And then?',
  scopeGlobal: 'Worldwide',
  aboutLink: 'About the project',
  aboutSeamTitle: 'The seam, in the record',
  aboutSeamNote:
    'Detections per year, the two instruments kept apart. VIIRS begins in 2012 and immediately dwarfs MODIS over the same ground. Add the two series and the total jumps; that jump is an instrument, not a planet.',
  aboutTargetTitle: 'What it is asked',
  aboutTargetBody:
    'Reconciling the two instruments is for the reader — so the eye can hold 2005 against 2020. The model is asked about MODIS alone: will the 1 km sensor see fire in this cell. That is the same argument, applied to the question rather than to the record. A target that grows with the satellite fleet would teach the model about satellites instead of about fire — NOAA-20 arrived in 2018 and NOAA-21 in 2024, and “it burned” would quietly come to mean “there are more instruments now”. MODIS has flown the same 1 km sensor since 2002, so the question put to it reads the same in all twenty-four years.',
  aboutHowTitle: 'How it learns',
  aboutWeighsTitle: 'What it weighs',
  aboutWeighsNote:
    'What the model actually leans on. Take one thing away from it — make that column meaningless and score it again — and the drop is how much it needed it. The shape is the honest summary of this project: the fire archive carries the model almost entirely, the weather sharpens it, and what is standing there to burn barely registers at a hundred and sixty kilometres. Among the weather, rain decides.',
  aboutLegendArchive: 'From the fire archive',
  aboutLegendWeather: 'From the weather forecast',
  aboutLegendGround: 'What is standing there',
  aboutWeatherTitle: 'What the weather bought',
  aboutWeatherNote:
    'How far past the seasonal baseline each model gets — the baseline being "how often does this cell burn at this time of year", which already knows where fires usually are. Same rows, same splits, same seed; the weather columns are the only difference. The raw scores are in the table above: they sit close together, and the margin is what moves.',
  aboutWeatherWith: 'With the weather',
  aboutWeatherWithout: 'Archive only',
  aboutWeatherRaw: 'In full: {withAp} against {withoutAp} on the scale above. The second figure in the table, ROC AUC, is the same question asked another way and moves the same direction: {withRoc} against {withoutRoc}.',
  aboutCalibTitle: 'Does 85% mean 85%',
  aboutCalibNote:
    'Group the cells the model gave about the same chance, and count how many burned. On the line means the number meant what it said. A model can rank perfectly and still be wrong about how sure it is, and average precision cannot show that.',
  aboutKicker: 'NASA Space Apps 2026 \u00b7 Harmonization of MODIS and VIIRS Hot Spots',
  ringNote: 'Every day of the record. A ring is a year, 2000 in the middle; around it, January at the top through December. Brighter is more of the planet alight. Switch to “as recorded” and watch a bright ring appear partway out — that is VIIRS arriving in 2012, not the Earth igniting.',
  aboutAnswer: 'Two satellites disagree about how much the world burns. This makes them agree.',
  aboutLede:
    'MODIS has watched since 2000 at a kilometre. VIIRS arrived in 2012 and sees several times as many fires over the same ground. Put the two together without thinking and the record shows a global surge in 2012 that never happened \u2014 an instrument being replaced, read as the planet catching fire.',
  aboutStatYears: 'Years of record',
  aboutStatDetections: 'Detections read',
  aboutStatCells: 'Cells in the forecast',
  aboutStatModel: 'Model features',

  aboutProblemTitle: 'The problem',
  aboutProblemBody:
    'A fire detection is not a fire. It is one satellite pass finding one pixel hot enough to flag, and how many it flags depends on the pixel\u2019s size. The 375-metre sensor resolves small fires the 1-kilometre one averages away; over the same ground on the same day it reports several times as many. The ratio is not a constant \u2014 about 7 over Punjab\u2019s cropland, where stubble burns in small scattered patches, and under 2 over Yakutian taiga, where a fire is already large enough for a 1 km pixel to catch \u2014 so a single global correction is the wrong answer too. It has to be measured per place.',
  aboutProblemNote:
    'Anyone asking "is it burning more than it used to" is asking a question the raw record cannot answer. Every trend through 2012 is contaminated by the instrument. Switch between "as recorded" and "reconciled" anywhere on this site and watch what happens to the years before 2012 \u2014 that difference is the whole problem, made visible.',

  aboutBuiltTitle: 'What was built',
  aboutBuiltNote:
    'A static site: no server, no database, no account. Everything below is a file the browser fetches and draws.',

  aboutModelTitle: 'The model',
  aboutModelNote:
    'A gradient-boosted classifier, trained on the archive and on the weather of the week it is asked about.',
  aboutModelBody:
    'It reads {features} things about every 25 km cell of the planet: how often it burns at this time of year, how recently it burned, what its neighbours are doing, how far the year is from its own normal, where El Ni\u00f1o stands \u2014 and the forecast weather of the week ahead, which is the half the fire archive cannot supply. It learns on {train}, is tuned on {validate}, and is marked on {test} \u2014 years it had never seen. The weather very nearly doubles how far it gets past a simple seasonal guess.',
  aboutModelNumbers: 'Measured',
  aboutScoreGloss:
    'One number, from 0 to 1, for how well a method sorts cells by risk: put every cell in its order, walk down the list, and see how much of it is fire before the guesses run out. Picking at random scores 0.05, because one cell in twenty burns. Nothing reaches 1, because the same weather over the same ground sometimes burns and sometimes does not.',
  aboutModelCaveat:
    'One thing to hold on to: the model learned from weather that had already happened, and the live map runs on a forecast of it. These figures are what is reachable if the weather forecast turns out right.',

  aboutLimitsTitle: 'What it cannot see',
  aboutLimitsNote: 'Every limit below is one a reader could otherwise find the hard way, by trusting a number further than it deserves.',
  aboutTriedTitle: 'What did not earn its place',
  aboutTriedNote:
    'Three things were built, measured and thrown away. They are here because a page that only shows what worked is not showing its work \u2014 and because each of these is a thing a reader might reasonably assume we forgot to try.',
  aboutCheckTitle: 'Check us',
  aboutCheckNote:
    'Every claim on this site is either visible in the interface or reproducible from the code. Nothing rests on trusting the authors.',
  barFossil: 'Fossil fuels, a year',
  barFires: 'The planet burning, {year}',
  barNote: 'On one scale, so the share is a picture rather than a division. The fuel figure is a whole year; the fires are only the part of the year that has happened.',
  ctaNote:
    'Everything above already happened. One thing has not: a model trained on the whole record puts a number on the week ahead, and says plainly how often that number has been right.',
  ctaButton: 'What happens next week',
  ctaLine: 'Somewhere in <b>{cells}</b> cells, the next seven days carry a real chance of fire.',

  windowRunning: 'day {n} of seven',
  windowLastDay: 'the last day of it',
  windowClosed: 'closed {n} ago \u2014 time to build the next one',
  windowEarly: 'it has not begun yet',
  calibPartialSlope:
    'On a part week the two columns cannot be read as calibration, and the shape of the gap is still worth having: on day {n} the cells above 70% have already reached the share their seven-day number implies, while the cells under 5% are running at two thirds of theirs. Either the low end is overstated or its fire is still to come, and only the finished week can say which.',
  futureWhere: '{from} to {to} \u00b7 built {asOf}',
  futureAnswer: 'Somewhere in <em>{cells}</em> cells, the next seven days carry a real chance of fire.',
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
    'Average precision on {tested}. The season alone is a hard baseline; the weather very nearly doubles the model’s margin over it, from 2.5% to 4.7%. One qualifier, because it matters: the model learned from the weather that actually happened, and the live map is driven by a forecast of it. So this is what is reachable if the weather forecast is right \u2014 an upper bound, not a promise. Persistence looks weak here and nearly matches the model on the live week below, and both are right: this column is average precision over every cell on the planet, where \u201cit burned last week\u201d has nothing to say about the millions that did not. The live ladder asks a narrower question \u2014 of the thousand cells ranked highest, how many burned \u2014 and at the very top of a peak-season list, fire mostly continues where it already is.',
  futureBack: 'Back to the record',
  globeCall: 'Press a fire to see the detail',
  pickForecast: 'Expected next week',
  pickSeen: 'Detections the week before',
  pickNote: 'The model\u2019s chance for this 25 km cell between {from} and {to}, beside what MODIS and VIIRS actually recorded on the same ground in the seven days before. One is a forecast; the other is a measurement.',
  pickNoneSeen: 'Nothing was recorded here last week, which is not the same as nothing burning: a satellite sees a fire only if it passes while the fire is alight and the sky is clear.',
  aboutLookTitle: 'See for yourself',
  aboutLookNote:
    'Everything above is an argument. This is the thing itself: turn the planet, press any fire, and the model\u2019s number for that cell arrives beside a photograph of the ground it is about.',
  aboutLookCall: 'Drag to turn \u00b7 press a fire',
  lookScale: '{km} km across',
  lookBy: 'Imagery: Esri, Maxar, Earthstar. Points: this model, one per quarter-degree cell.',
  lookFail: 'The imagery for this cell did not come down. The figures beside it are unaffected.',
  lookNote:
    'Every point of light is a place the model expects to burn in the coming week, the brighter the likelier. The white outline is the cell that was pressed \u2014 about 25 km on a side, and the grid it belongs to is the one the whole forecast is made on.',
  weekPlay: 'Play the week',
  weekStop: 'Stop',
  weekLoading: 'Loading the days\u2026',
  weekAll: 'The whole week, to {to}',
  weekBy: 'By the end of {to}, counting every day up to it',
  weekCells: 'cells at risk',
  proofTitle: 'Checked against what happened',
  proofLadderTitle: 'Of the cells it ranked highest, this share has burned',
  proofWhen: 'The week on this page was computed on {computed}, before it began. Checked on {checked}, {elapsed} of its 7 days had passed and NASA had reported {detections} MODIS detections inside the window.',
  proofPartial: '{days} is not a week: the shares below can only grow from here, and a rate that looks low this early may be exactly right once the window closes on {to}. What the ladder already shows is the ordering — the cells it liked most are the ones burning first.',
  proofWhole: 'The window has closed, so these are final.',
  proofTop: 'top {n}',
  proofAll: 'everything it flagged',
  /* Recall on its own says nothing without the breadth it was bought
     with: flag every cell and it reaches 100%. */
  proofBaseline: 'it burned last week: {pct}',
  proofBaselineLegend:
    'The notch on each bar is what “it burned in the last seven days” would have given you — no model, no features, free. On the top thousand it reaches {base} against the model’s {model}. The model leads on every rung, and not by much: over a seven-day window in peak season, fire mostly continues where it already is. The gap it earns is over the whole ranking, and in the places that have not just burned.',
  proofRecordTitle: 'Every week we have checked',
  proofRecordMean:
    'Across {n} finished weeks, an average of {pct} of the thousand cells ranked highest burned inside the window. Partly run weeks are marked and can only rise.',
  proofRecordPartial:
    'One week is on record so far, and it is still running. The row grows by one every time a finished window is checked, and nothing is ever removed from it \u2014 a forecast that scored badly would stay here too.',
  proofRecordWhole: 'computed {computed}, full week',
  proofRecordSoFar: 'computed {computed}, {days} in',
  proofRecordAgainst: 'free method {pct}',
  proofRecallNote: 'with {flagged} cells flagged',
  trendOnModis: 'on MODIS alone — the ratio cancels',
  proofCaught: 'Burned and flagged',
  proofMissed: 'Burned, not flagged',
  proofRecall: 'Caught',
  whyLead: 'Why here',
  whyClim: 'it usually burns here at this time of year',
  whyCellRate: 'this cell burns often',
  whyRecent: 'something burned here in the last few days',
  whyLately: 'it has been burning here for weeks',
  whyRing: 'the ground next to it is burning',
  whyRingAnom: 'the neighbourhood is burning more than it should',
  whyAnom: 'this cell is burning more than it should',
  whyRegion: 'the whole region is running hot',
  whyYear: 'the year is running above its own normal',
  whyDry: 'the week ahead is dry',
  whyRain: 'the rain in the week ahead',
  whyHeat: 'the week ahead is hot',
  whyWind: 'the week ahead is windy',
  whyGrass: 'what grows here is grass and scrub, which carries fire',
  whyTrees: 'what grows here is forest',
  whyNino: 'where El Ni\u00f1o stands',
  whyActive: 'fire has been alight here on many days',
  whyLastYear: 'it burned in this same fortnight a year ago',
  whySince: 'how long it has been since it last burned',
  riskHeadPlace: 'Place, and its own chance',
  riskHeadNear: 'Cells within 200 km more likely than not',
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
  modeLegend: 'Как считаются годы',
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
  heroConcentration: 'Половина этого пришлась всего на {n}.',
  partialYear: '{year} год ещё идёт — данные заканчиваются {date}, поэтому итоги за него неполные.',
  partialYearShort: 'Сравнивать пока не с чем: {year} год не закончился.',

  statTypical: 'Обычный сезон',
  statThisYear: 'Выбранный год',
  statWatching: 'Наблюдаем с',

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
  colTotal: 'Ячеек × дней',
  colRatio: 'к обычному',
  colAbove: 'Горячих дней',

  readingTitle: 'Что бросается в глаза',
  verdictBusy: 'Засечек за год — {ratio} от обычной нормы, и горячее неё оказалось {days}.',
  verdictQuiet: 'Спокойный год: засечек — {ratio} от обычной нормы, без длинных горячих отрезков.',
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
  pageTitle: 'Emberline — когда и где горит',
  unitCells: 'ячеек',
  unitCellSize: 'по 25 км',
  unitCellsLit: 'ячеек с огнём',
  statFires: 'Ячеек × дней с огнём',
  metricActive: 'Ячеек × дней с огнём',
  ofNormal: 'от обычного года',

  shiftEarlier: 'Он начался на {n} раньше обычного',
  shiftLater: 'Он начался на {n} позже обычного',
  shiftOnTime: 'Он начался в обычный срок',
  peakEarlier: 'и вышел на пик на {n} раньше',
  peakLater: 'и вышел на пик на {n} позже',
  peakOnTime: 'и вышел на пик вовремя',
  shortBaseline: 'Здесь всего {n} наблюдений — надёжной «нормы» для сравнения пока нет.',
  noPeriods: 'В этом году ничего не держалось горячее обычного три дня подряд и дольше.',
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

  mapNoteArchive: '{cells} ячеек по {km} км горели в {years}',
  mapCovered: 'Ячеек горело хоть раз',
  mapThisYear: 'Горели в этом году',
  mapHottest: 'Самая упорная ячейка',
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
  snapshotBehind: 'Отстаёт от сегодня на {n}.',
  worldNowNote: '{fires} засечек с {from} по {to}, ячейка {cell}. Это снимок на момент последней сборки сайта, а не живой поток.',
  placeNowNote: '{place}: {fires} засечек с {from} по {to}, ячейка {cell}. Снимок последней сборки, не живой поток.',
  rangeLegend: 'Период',
  rangeYear: '{year}',
  rangeNow: 'Прямо сейчас',
  forecastShortWindow:
    'Шкала одна и та же на каждом дне полосы, поэтому короткое окно выглядит бледнее: меньше ячеек вообще переходит порог в один процент, а у тех, что перешли, было меньше времени. За один день на карте {cells} ячеек против {all} за всю неделю. Карта не потухла \u2014 шанс и правда меньше.',
  forecastNote: 'Вероятность пожара, достаточно крупного для километрового сенсора, с {from} по {to}, на ячейку {cell}. Считано по архиву на {asOf} — оценка на момент сборки, не живой прогноз.',
  forecastSkill: 'Проверено на {tested} — годах, которых модель не видела: средняя точность {model} против {clim} у «как часто здесь горит в это время года» и {persist} у «горело на прошлой неделе». Случайный выбор даёт {base}. Перевес над сезонной базой небольшой, и он здесь написан, а не спрятан: без суточной погоды — дождя, ветра, влажности — предсказуемо в ближайшей неделе почти только сезон.',
  forecastProbe: '{p} вероятность в ближайшие {n} дней',
  forecastMissing: 'Для этой сборки прогноз не посчитан.',
  nowDaysLegend: 'За какой срок',
  nowDay1: 'Последний день',
  nowDay3: '3 дня',
  nowDay7: '7 дней',
  worldHint: 'Каждый год с 2000-го, помесячно',
  regionHint: 'Посуточно, 27 лет, 1 км',
  worldModis: 'MODIS · 1 км',
  worldViirs: 'VIIRS · 375 м',
  worldSeasonTitle: 'Когда горит планета',
  worldSeasonNote: 'Каждый год — бледная линия, выбранный нарисован поверх. Месяц здесь — это вся поверхность Земли, сложенная вместе.',
  worldYearsTitle: 'Год за годом',
  worldYearsNote: 'Два прибора стоят рядом, а не друг на друге. VIIRS появляется в 2012-м и видит на той же земле в несколько раз больше очагов — сложенные, они читались бы как вспышка пожаров.',
  worldHeroWhere: 'Весь мир · MODIS и VIIRS, помесячно',
  worldHeroPeak: 'Чаще всего пик приходится на {month}: так было в {n} из {all} лет.',
  worldHeroPlain: 'Помесячный ряд — вся поверхность разом.',
  worldHeroAside:
    'Приборы считаются порознь. VIIRS появился в 2012-м и видит на той же земле в несколько раз больше, поэтому суммы по разные стороны от этого года — не одно и то же измерение.',
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
  probeBurned: 'горел {n} из {total} дней',
  probeDetections: '{n} засечек здесь за {year} год',
  probeQuiet: 'здесь не горело',
  rampLow: 'горел однажды',
  rampHigh: 'горит часто',
  rampUnlikely: 'маловероятно',
  rampForecastNote:
    'Полоса линейная: цвет ровно посередине — это равные шансы, а ячейка, окрашенная на десятую часть пути, — одна из десяти. Всё ниже одного процента на карту не попадает вовсе.',
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
  worstTitle: 'Дни, из которых сложился год',
  worstNote: 'Эти пять держат {pct} всего, что сгорело в {year} — из {days} дней, когда горело вообще. Огонь не размазан по сезону — он приходит за несколько дней.',

  statusLoading: 'Загружаю…',
  statusFetching: 'Спрашиваю NASA…',
  statusParsing: 'Свожу данные…',
  statusLiveDone: '{n} засечек за {days} дней — это {cells} ячеек с огнём, если считать каждый день отдельно.',
  statusFileDone: '{n} засечек из {files} файлов — это {cells} ячеек с огнём, если считать каждый день отдельно.',
  statusNeedKey: 'Сначала вставьте ключ FIRMS.',
  statusNoRows: 'Ничего пригодного не пришло.',
  statusFailed: 'Не удалось загрузить: {err}',
  statusNoArchive: 'Для этого района данных в комплекте пока нет.',
  statusShortRecord: 'Короткий ряд — для надёжной «нормы» нужно несколько лет.',
  emptyArchiveTitle: 'Для этого района данных пока нет',
  emptyArchiveBody:
    'Выберите другой район или переключите источник на живой запрос к NASA либо на свой CSV. Оба пути проходят ровно то же сведение — прямо здесь, в браузере.',

  concentrationLine: 'Половина {year} года сгорела за {n}, а {pct}% всего объёма пришлось на {month}.',
  colophon:
    'Засечки огня из NASA FIRMS (MODIS и VIIRS). Они отмечают горение в момент пролёта спутника, а не выгоревшую площадь. Сделано для NASA Space Apps Challenge 2026.',
  provenanceFirms: 'NASA FIRMS — продукты активных пожаров MODIS C6.1 и VIIRS C2, получены через area API FIRMS',
  ctaTitle: 'А дальше?',
  scopeGlobal: 'По всей планете',
  aboutLink: 'О проекте',
  aboutSeamTitle: 'Шов в самом ряду',
  aboutSeamNote:
    'Засечек за год, приборы порознь. VIIRS начинается в 2012-м и сразу затмевает MODIS на той же земле. Сложите два ряда — и общая кривая прыгнет. Этот скачок — прибор, а не планета.',
  aboutTargetTitle: 'На каком приборе её спрашивают',
  aboutTargetBody:
    'Сведение приборов — для читателя: чтобы глаз мог сравнить 2005 год с 2020-м. А модель мы спрашиваем только про MODIS: увидит ли километровый сенсор огонь в этой ячейке. Это тот же довод, только приложенный к вопросу, а не к записи. Цель, которая растёт вместе с составом группировки, научила бы модель спутникам, а не пожарам: в 2018-м вышел NOAA-20, в 2024-м NOAA-21 — и «загорелось» незаметно стало бы означать «приборов стало больше». MODIS летает с тем же километровым сенсором с 2002 года, поэтому заданный ему вопрос звучит одинаково во все двадцать четыре года.',
  aboutHowTitle: 'Как она учится',
  aboutWeighsTitle: 'На что она опирается',
  aboutWeighsNote:
    'На что модель опирается на самом деле. Отнимите у неё одну вещь — испортьте этот признак и посчитайте заново, — и насколько просядет точность, настолько он ей был нужен. Форма графика и есть честная сводка всего проекта: архив пожаров тянет модель почти целиком, погода её затачивает, а то, чему там гореть, на ста шестидесяти километрах почти не слышно. Из погоды решает дождь.',
  aboutLegendArchive: 'Из архива пожаров',
  aboutLegendWeather: 'Из прогноза погоды',
  aboutLegendGround: 'Что там растёт',
  aboutWeatherTitle: 'Что дала погода',
  aboutWeatherNote:
    'Насколько каждая модель уходит вперёд от сезонной базы — то есть от «как часто здесь горит в это время года», которая уже знает, где обычно горит. Те же строки, то же разбиение, тот же сид; отличие только в погодных колонках. Сама точность — в таблице выше: цифры близки, а двигается именно перевес.',
  aboutWeatherWith: 'С погодой',
  aboutWeatherWithout: 'Только архив',
  aboutWeatherRaw: 'В цифрах: {withAp} против {withoutAp} по шкале выше. Вторая цифра в таблице, ROC AUC, — тот же вопрос с другой стороны, и двигается туда же: {withRoc} против {withoutRoc}.',
  aboutCalibTitle: 'Значит ли 85% именно 85%',
  aboutCalibNote:
    'Сгруппируйте ячейки, которым модель дала примерно один шанс, и посчитайте, сколько сгорело. На линии — значит число значило то, что говорило. Модель может ранжировать идеально и при этом врать о своей уверенности, а средняя точность этого не показывает.',
  aboutKicker: 'NASA Space Apps 2026 \u00b7 Сведение очагов MODIS и VIIRS',
  ringNote: 'Каждый день ряда. Кольцо — год, 2000-й в центре; по кругу — январь сверху и далее до декабря. Ярче — больше планеты горит. Переключите на «как снято» и посмотрите, как где-то на полпути появится яркое кольцо — это VIIRS в 2012-м, а не загоревшаяся Земля.',
  aboutAnswer: 'Два спутника не согласны, сколько горит мир. Здесь они приведены к согласию.',
  aboutLede:
    'MODIS смотрит с 2000 года с километрового шага. VIIRS появился в 2012-м и видит на той же земле в несколько раз больше очагов. Сложите их не думая — и в ряду появится всплеск 2012 года, которого не было: смена прибора, прочитанная как загоревшаяся планета.',
  aboutStatYears: 'Лет ряда',
  aboutStatDetections: 'Засечек прочитано',
  aboutStatCells: 'Ячеек в прогнозе',
  aboutStatModel: 'Признаков у модели',

  aboutProblemTitle: 'Задача',
  aboutProblemBody:
    'Засечка — это не пожар. Это один пролёт спутника, нашедший один пиксель достаточно горячим, и сколько таких пикселей найдётся, зависит от размера пикселя. Сенсор 375 м различает мелкие очаги, которые километровый усредняет до нуля. И отношение не постоянное — около 7 на пенджабской пашне, где стерня горит мелкими разбросанными пятнами, и меньше 2 в якутской тайге, где пожар и так велик для километрового пикселя, — так что один общий коэффициент тоже неверен. Его надо мерить для каждого места отдельно.',
  aboutProblemNote:
    'Любой, кто спрашивает «горит ли больше, чем раньше», задаёт вопрос, на который сырой ряд ответить не может. Любой тренд через 2012 год испорчен прибором. Переключите «как снято» и «сведено» где угодно на сайте и посмотрите на годы до 2012-го — эта разница и есть вся задача, показанная глазам.',

  aboutBuiltTitle: 'Что сделано',
  aboutBuiltNote:
    'Статический сайт: ни сервера, ни базы, ни аккаунта. Всё ниже — файлы, которые браузер скачивает и рисует сам.',

  aboutModelTitle: 'Модель',
  aboutModelNote:
    'Градиентный бустинг, обученный на архиве и на погоде той недели, о которой его спрашивают.',
  aboutModelBody:
    'Она смотрит на {features} вещей про каждую ячейку 25 на 25 километров: как часто здесь горит в это время года, как давно горело, что делается у соседей, насколько год отошёл от своей нормы, где сейчас Эль-Ниньо — и прогноз погоды на ближайшую неделю, то есть ту половину, которую архив пожаров дать не может. Учится на {train}, настраивается на {validate}, а оценивается на {test} — годах, которых ни разу не видела. Погода почти удваивает её отрыв от простой сезонной догадки.',
  aboutModelNumbers: 'Измерено',
  aboutScoreGloss:
    'Одно число от 0 до 1 — насколько хорошо способ расставляет ячейки по риску: выстройте все ячейки в порядке, идите по списку сверху и считайте, сколько из него действительно загорелось. Случайный выбор даёт 0.05, потому что горит одна ячейка из двадцати. Единицы не достигает никто: одна и та же погода на одной и той же земле иногда даёт пожар, а иногда нет.',
  aboutModelCaveat:
    'Одно важное: модель училась на погоде, которая уже случилась, а живая карта идёт по прогнозу погоды. Эти цифры — то, что достижимо, если прогноз погоды окажется верным.',

  aboutLimitsTitle: 'Чего модель не знает',
  aboutLimitsNote: 'Каждое ограничение ниже — из тех, что иначе находят на своей шкуре, поверив числу дальше, чем оно того стоит.',
  aboutTriedTitle: 'Что не прошло порог',
  aboutTriedNote:
    'Три вещи были сделаны, измерены и выброшены. Они здесь потому, что страница, показывающая только удачи, не показывает работу \u2014 и потому, что каждую из них читатель вправе счесть тем, о чём мы забыли.',
  aboutCheckTitle: 'Проверьте нас',
  aboutCheckNote:
    'Каждое утверждение на этом сайте либо видно в интерфейсе, либо воспроизводится из кода. Верить авторам не требуется нигде.',
  barFossil: 'Ископаемое топливо за год',
  barFires: 'Пожары планеты, {year}',
  barNote: 'На одной шкале — чтобы доля была картинкой, а не делением в уме. Топливо — целый год; пожары — только та часть года, которая уже прошла.',
  ctaNote:
    'Всё выше уже случилось. Одно — нет: модель, обученная на всём архиве, ставит число на ближайшую неделю и честно говорит, как часто это число сбывалось.',
  ctaButton: 'Что будет на следующей неделе',
  ctaLine: 'В <b>{cells}</b> ячейках ближайшие семь дней несут реальный шанс пожара.',

  windowRunning: 'идёт {n}-й день из семи',
  windowLastDay: 'последний её день',
  windowClosed: 'закрылось {n} назад — пора считать следующее',
  windowEarly: 'ещё не началось',
  calibPartialSlope:
    'На неполной неделе две колонки нельзя читать как калибровку, но форма расхождения всё равно чего-то стоит: на {n}-й день ячейки выше 70% уже добрали долю, которую подразумевает их недельное число, а ячейки ниже 5% идут на двух третях от своей. Либо нижний конец завышен, либо его огонь ещё впереди — и сказать, что из двух, может только закрывшаяся неделя.',
  futureWhere: 'с {from} по {to} · считано {asOf}',
  futureAnswer: 'В <em>{cells}</em> ячейках ближайшие семь дней несут реальный шанс пожара.',
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
    'Средняя точность на {tested}. Один только сезон — очень сильная база; с погодой перевес над ней почти удваивается — с 2,5% до 4,7%. Одна оговорка, и она важная: модель училась на погоде, которая была на самом деле, а живая карта идёт по прогнозу погоды. То есть это то, что достижимо, если прогноз погоды верен, — верхняя граница, а не обещание. Здесь персистенция выглядит слабо, а на живой неделе ниже почти догоняет модель \u2014 и верно и то, и другое: в этой колонке средняя точность по всем ячейкам планеты, где \u00abгорело на прошлой неделе\u00bb нечего сказать о миллионах, где не горело. Живая лестница спрашивает уже\u0301 \u2014 из тысячи верхних ячеек сколько сгорело, \u2014 а на самом верху списка в разгар сезона огонь в основном продолжается там, где уже идёт.',
  futureBack: 'Назад к архиву',
  globeCall: 'Нажмите огонь, чтобы увидеть подробности',
  pickForecast: 'Ждём на неделе',
  pickSeen: 'Засечек за неделю до',
  pickNote: 'Шанс, который модель даёт этой ячейке 25 км с {from} по {to}, рядом с тем, что MODIS и VIIRS реально засекли на той же земле за семь дней до этого. Одно — прогноз, второе — измерение.',
  pickNoneSeen: 'За прошлую неделю здесь ничего не засекли — это не то же, что ничего не горело: спутник видит огонь, только если пролетает, пока тот горит, и небо чистое.',
  aboutLookTitle: 'Посмотрите сами',
  aboutLookNote:
    'Всё выше — это доводы. А это сама вещь: поверните планету, нажмите на любой огонь — и число модели по этой ячейке появится рядом с фотографией той земли, о которой оно.',
  aboutLookCall: 'Тяните, чтобы повернуть · нажмите на огонь',
  lookScale: '{km} км поперёк',
  lookBy: 'Снимок: Esri, Maxar, Earthstar. Точки: эта модель, по одной на ячейку в четверть градуса.',
  lookFail: 'Снимок этой ячейки не загрузился. На числа рядом это не влияет.',
  lookNote:
    'Каждая светящаяся точка — место, где модель ждёт огонь на ближайшей неделе: чем ярче, тем вероятнее. Белым обведена та самая ячейка — около 25 км в поперечнике, — та самая сетка, на которой считается весь прогноз.',
  weekPlay: 'Прокрутить неделю',
  weekStop: 'Стоп',
  weekLoading: 'Загружаем дни…',
  weekAll: 'Вся неделя, по {to}',
  weekBy: 'К концу {to} — считая все дни до него',
  weekCells: 'ячеек в зоне риска',
  proofTitle: 'Сверено с тем, что случилось',
  proofLadderTitle: 'Из ячеек, которые модель поставила выше всех, уже сгорело',
  proofWhen: 'Неделя на этой странице посчитана {computed} — до того, как она началась. На {checked} из её 7 дней прошло {elapsed}, и NASA сообщила о {detections} засечках MODIS внутри окна.',
  proofPartial: '{days} — это ещё не неделя: доли ниже могут только расти, и то, что выглядит скромно сейчас, к закрытию окна {to} может оказаться ровно верным. Что лестница показывает уже сейчас — это порядок: ячейки, которые модель поставила выше, горят первыми.',
  proofWhole: 'Окно закрылось, так что это окончательные числа.',
  proofTop: 'первые {n}',
  proofAll: 'всё, что отмечено',
  proofBaseline: 'горело на прошлой неделе: {pct}',
  proofBaselineLegend:
    'Засечка на каждой полоске — то, что дало бы «горело за последние семь дней»: без модели, без признаков, бесплатно. На верхней тысяче она берёт {base} против {model} у модели. Модель впереди на каждой ступени, и ненамного: на семидневном окне в разгар сезона огонь в основном продолжается там, где уже идёт. Свой отрыв она зарабатывает на всём ранжировании и там, где только что не горело.',
  proofRecordTitle: 'Все недели, которые мы проверили',
  proofRecordMean:
    'По {n} завершённым неделям в среднем {pct} из тысячи верхних ячеек сгорело внутри окна. Неполные недели помечены, и их доля может только вырасти.',
  proofRecordPartial:
    'Пока на счету одна неделя, и она ещё идёт. Строка прибавляется каждый раз, когда проверяется закрывшееся окно, и из неё ничего не убирается — прогноз, который отработал плохо, остался бы здесь тоже.',
  proofRecordWhole: 'посчитан {computed}, неделя целиком',
  proofRecordSoFar: 'посчитан {computed}, прошло {days}',
  proofRecordAgainst: 'бесплатный способ {pct}',
  proofRecallNote: 'при {flagged} отмеченных ячейках',
  trendOnModis: 'по MODIS — коэффициент сокращается',
  proofCaught: 'Сгорело и отмечено',
  proofMissed: 'Сгорело, не отмечено',
  proofRecall: 'Поймано',
  whyLead: 'Почему здесь',
  whyClim: 'здесь обычно горит в это время года',
  whyCellRate: 'эта ячейка горит часто',
  whyRecent: 'горело здесь на днях',
  whyLately: 'горит здесь уже которую неделю',
  whyRing: 'горит земля по соседству',
  whyRingAnom: 'у соседей горит больше обычного',
  whyAnom: 'в этой ячейке горит больше обычного',
  whyRegion: 'весь регион идёт выше нормы',
  whyYear: 'год идёт выше своей нормы',
  whyDry: 'впереди сухая неделя',
  whyRain: 'дожди на ближайшей неделе',
  whyHeat: 'впереди жаркая неделя',
  whyWind: 'впереди ветреная неделя',
  whyGrass: 'здесь трава и кустарник — они хорошо несут огонь',
  whyTrees: 'здесь лес',
  whyNino: 'где сейчас Эль-Ниньо',
  whyActive: 'огонь держится здесь помногу дней',
  whyLastYear: 'горело в те же две недели год назад',
  whySince: 'сколько прошло с прошлого пожара',
  riskHeadPlace: 'Место и его собственный шанс',
  riskHeadNear: 'Ячеек в 200 км, где скорее загорится',
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
  /*
   * The tab, the bookmark and anything the link is pasted into.
   *
   * `lang` was being set here from the first version and the title never
   * was, so a reader on the Russian site had an English name in the tab
   * strip, in their history, and in every link they shared.
   */
  document.title = t('pageTitle')
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
    ['A day at a time', 'Seven models, not one: the target is “will this cell burn within N days”, so Tuesday needs a model that was asked about Tuesday. Each picks its own features and its own number of trees, and the shorter windows are held below the longer ones so the week can only ever warm as it runs.'],
    ['The reconciliation', 'The sensitivity ratio between the two instruments, measured separately for every area and season rather than assumed, and applied so the years before 2012 read on the same scale as the years after.'],
    ['A pyramid of resolutions', 'The whole planet at one degree by month, down to a hundredth of a degree by year \u2014 four levels, drawn from the level the zoom can actually use, so the globe loads as fast as a city.'],
    ['A day at a time', 'Every day of 24 years at a quarter degree, which is what makes a calendar of 9,000 days possible for any point on Earth.'],
    ['This week, and next', 'The last seven days as a snapshot, and a gradient-boosted model\u2019s estimate of the seven to come.'],
    ['What it does', 'Fire radiative power turned into carbon dioxide by the published method, calibrated against GFED, with the caveats printed beside the number rather than in a footnote.'],
    ],
    aboutSteps: [
      ['Every cell that has ever burned, on every fourth day of 24 years, becomes one question: given what was known that morning, did it burn in the week that followed? Three million questions with the answers attached.', ''],
      ['Fires are rare \u2014 five cells in a hundred \u2014 so most of the quiet ones are set aside. Otherwise the shortest way to be right would be to answer \u201cno fire\u201d every time and score ninety-five per cent, and the model would learn exactly that. What it gives back is corrected afterwards so the numbers still mean what they say.', ''],
      ['The years are split by time, never shuffled: it learns on 2003\u20132013, is adjusted on 2014\u20132017, and sees 2018\u20132021 once, at the very end. Shuffling would let it learn from a Tuesday to answer about the Monday beside it, and the score would be a lie.', ''],
      ['{trees} small decision trees, each correcting what the ones before it got wrong. Nothing deep and nothing fashionable: on a table of {features} columns this beats a neural network and, unlike one, can be asked why it said what it said \u2014 which is the chart above.', ''],
    ],
    aboutLimitsList: [
    ['The weather is six times coarser than the forecast', 'Every cell is 25 km across; the weather driving it comes off a 167 km grid, so 36 neighbouring cells are told about the same hot, dry, windy day. Fire weather is mostly synoptic and survives that, but a reader in a mountain valley should know the model is being told about the mountain.'],
    ['It knows nothing about people', 'Not population, not roads, not fields — and most fire on this planet is lit by someone. The model infers human activity only from where fire has been before, which works until the pattern changes.'],
    ['It was marked on 2018-2021 and is running in 2026', 'The public ERA5 mirror ends in 2021, so the weather-fed model cannot be scored past it. Five years of drift are unmeasured here, which is why the forecast is also checked against fresh detections every week.'],
    ['It learned on weather that happened', 'The live map runs on a forecast of the weather instead. The skill figures are what is reachable if that forecast is right \u2014 an upper bound, not a promise.'],
    ['A detection is not a fire', 'It is one satellite pass finding one pixel hot enough. A fire under cloud, or one that starts and dies between passes, is not in the record and so is not in the model.'],
    ],
    aboutTriedList: [
      ['A fitted calibration curve', 'The model is slightly under-confident: on the test years it says 84% where 90% burns. Isotonic regression and Platt scaling were both fitted on the tuning years and measured once on the test years. Isotonic matched the shipped Brier score of 0.0315 exactly and cost 0.0060 of average precision, because its staircase puts cells the model had ranked apart onto one tread. Platt kept the ranking and came out slightly worse on Brier, 0.0315 against 0.0315. Neither passed, so neither shipped, and the chart below is the uncalibrated model.'],
      ['Where the people are', 'Every feature this model has is about fire, and most fire on this planet is lit by somebody \u2014 so the European Commission\u2019s global settlement layer went in as population per cell and population of the eight neighbours. Test average precision moved from 0.5579 to 0.5581. The two features came 12th and 13th of 27 by how much the score drops when each is scrambled: 0.0031 and 0.0030, against climatology\u2019s 0.387. The fire archive already knows where people are, because they have been lighting fires in it for twenty-four years.'],
      ['More trees', 'Training loss was still falling at a thousand trees, which reads like a model cut off early. It was not. Validation average precision peaks at 200 trees, 0.7147, and then goes backwards: 0.7132 at 300, 0.7125 at a thousand. Five times the compute for slightly less skill.'],
    ],
    aboutCheckList: [
    ['Nothing was chosen on the test years', 'How many trees, which features to keep, how deep to grow — every one of those was decided on 2014–2017 and the test years were opened once, at the end. Picking any of them by the test score is how a model flatters itself, and the scripts are written so that it cannot.'],
    ['The forecast is scored against reality', 'The week on the map was computed before it happened. verify_forecast.py asks NASA what has burned since and scores it \u2014 ranking from day one, calibration once the week closes. The answer did not exist when the question was asked.'],
    ['The reconciliation is a switch', 'Every chart has "as recorded" beside "reconciled". If the correction were doing something dishonest, it would be visible in one click.'],
    ['The skill figure is the unflattering one', 'Average precision against a seasonal baseline that already knows where fires usually are \u2014 not accuracy against a 5% base rate, which would read as 95% and mean nothing.'],
    ['The data is NASA\u2019s', 'FIRMS MODIS C6.1 and VIIRS C2, fetched through the public API. Every number here can be recomputed from the same source.'],
    ],
  },
  ru: {
    aboutBuiltList: [
    ['День за днём', 'Семь моделей, а не одна: цель — «загорится ли эта ячейка за N дней», поэтому про вторник надо спрашивать модель, которую спрашивали про вторник. Каждая сама выбрала себе набор признаков и число деревьев, а короткие окна удержаны ниже длинных — чтобы неделя только набирала, а не проседала.'],
    ['Сведение приборов', 'Отношение чувствительности двух сенсоров — измеренное для каждой местности и сезона, а не принятое на веру, — и применённое так, что годы до 2012-го читаются в одной шкале с последующими.'],
    ['Пирамида разрешений', 'Вся планета от градуса помесячно до сотой градуса погодно — четыре уровня, и берётся тот, который зум реально может показать. Поэтому глобус грузится так же быстро, как город.'],
    ['Сутки за сутками', 'Каждый день 24 лет на четверти градуса — именно это делает возможным календарь на 9 000 дней для любой точки Земли.'],
    ['Эта неделя и следующая', 'Последние семь дней снимком и оценка модели на семь вперёд.'],
    ['Чем это отзывается', 'Мощность излучения, переведённая в CO₂ по опубликованной методике и сверенная с GFED, с оговорками рядом с числом, а не в сноске.'],
    ],
    aboutSteps: [
      ['Каждая ячейка, где когда-либо горело, на каждый четвёртый день 24 лет становится вопросом: если знать только то, что было известно тем утром, — загорелось ли там в ближайшую неделю? Три миллиона вопросов с уже известными ответами.', ''],
      ['Пожары редки — пять ячеек из ста, — поэтому большую часть спокойных мы откладываем в сторону. Иначе самый лёгкий способ быть правой — всегда отвечать «не загорится» и попадать в 95% случаев, и модель именно этому бы и научилась. То, что она потом выдаёт, поправляется обратно, чтобы числа значили то, что говорят.', ''],
      ['Годы делятся по времени, а не вперемешку: учёба на 2003–2013, настройка на 2014–2017, а 2018–2021 она видит один раз, в самом конце. Если перемешать, модель сможет подглядеть во вторник, чтобы ответить про соседний понедельник, и оценка будет врать.', ''],
      ['{trees} маленьких решающих деревьев, каждое правит ошибки предыдущих. Ничего глубокого и ничего модного: на таблице из {features} колонок это обходит нейросеть и, в отличие от неё, умеет объяснить, почему сказала именно так — это и есть график выше.', ''],
    ],
    aboutLimitsList: [
    ['Погода в шесть раз грубее прогноза', 'Ячейка — 25 км, а погода к ней приходит с сетки в 167 км: 36 соседних ячеек узнают про один и тот же жаркий, сухой и ветреный день. Пожарная погода в основном синоптическая и это переживает, но читатель в горной долине должен знать, что модели рассказали про гору.'],
    ['Про людей она не знает ничего', 'Ни населения, ни дорог, ни полей — а большинство пожаров на планете зажигает человек. О людях модель догадывается только по тому, где горело раньше, и это работает, пока привычка не меняется.'],
    ['Оценена на 2018–2021, работает в 2026-м', 'Публичное зеркало ERA5 кончается 2021 годом, поэтому модель с погодой дальше не на чем оценивать. Пять лет сноса здесь не измерены — именно поэтому прогноз ещё и сверяется со свежими засечками каждую неделю.'],
    ['Училась на погоде, которая случилась', 'А живая карта идёт по прогнозу погоды. Цифры точности — это то, что достижимо, если прогноз верен: верхняя граница, а не обещание.'],
    ['Засечка — это не пожар', 'Это один пролёт спутника, нашедший один пиксель достаточно горячим. Пожар под облаком или тот, что начался и погас между пролётами, в архив не попал — значит, его нет и в модели.'],
    ],
    aboutTriedList: [
      ['Подогнанная калибровочная кривая', 'Модель слегка перестраховывается: на тестовых годах она говорит 84% там, где горит 90%. Изотоническую регрессию и шкалирование Платта обе подогнали на настроечных годах и измерили один раз на тестовых. Изотоника в точности повторила шипнутый Brier 0.0315 и стоила 0.0060 средней точности: её ступенька сводит на одну ступень ячейки, которые модель развела. Платт ранжирование сохранил, но по Brier вышел чуть хуже. Ни одна не прошла порог — значит ни одна не поехала, и график ниже показывает некалиброванную модель.'],
      ['Где живут люди', 'Все признаки этой модели — про огонь, а большинство пожаров на планете зажигает человек. Поэтому в неё добавили слой расселения Европейской комиссии: население ячейки и население восьми соседей. Средняя точность на тесте сдвинулась с 0.5579 до 0.5581. Два признака заняли 12-е и 13-е места из 27 по тому, насколько падает оценка, если каждый перемешать: 0.0031 и 0.0030 против 0.387 у климатологии. Архив пожаров уже знает, где люди, — они двадцать четыре года в нём и жгут.'],
      ['Больше деревьев', 'На тысяче деревьев ошибка на обучении всё ещё падала — так выглядит модель, которую оборвали рано. Это оказалось не так. Средняя точность на валидации достигает максимума на 200 деревьях, 0.7147, и дальше идёт назад: 0.7132 на 300 и 0.7125 на тысяче. Впятеро больше счёта за чуть меньшее умение.'],
    ],
    aboutCheckList: [
    ['Ничто не выбиралось по тестовым годам', 'Сколько деревьев, какие признаки оставить, насколько глубоко растить — всё это решалось на 2014–2017, а тестовые годы открыли один раз, в самом конце. Подобрать что-нибудь по тесту — это и есть способ модели польстить себе, и скрипты написаны так, чтобы она не смогла.'],
    ['Прогноз сверяется с реальностью', 'Неделя на карте посчитана до того, как она случилась. verify_forecast.py спрашивает у NASA, что сгорело с тех пор, и считает оценку: ранжирование с первого дня, калибровка когда неделя закроется. Ответа не существовало в момент вопроса.'],
    ['Сведение — это переключатель', 'У каждого графика рядом с «сведено» есть «как снято». Если бы поправка делала что-то нечестное, это было бы видно в один клик.'],
    ['Цифра точности — самая невыгодная', 'Средняя точность против сезонной базы, которая уже знает, где обычно горит, — а не «доля верных ответов» при базе 5%, которая дала бы 95% и не значила бы ничего.'],
    ['Данные — насовские', 'FIRMS MODIS C6.1 и VIIRS C2 через публичный API. Любое число отсюда пересчитывается из того же источника.'],
    ],
  },
}

export function aboutList(name: string): readonly AboutRow[] {
  return aboutLists[getLang()][name] ?? []
}
