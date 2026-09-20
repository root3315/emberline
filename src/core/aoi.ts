import type { Aoi } from './types'

/**
 * Four areas chosen because their burning calendars disagree with each other.
 * Put side by side they make the point the challenge is about: there is no such
 * thing as "the fire season" — there are fire seasons, and they are driven by
 * harvests, droughts, lightning and policy in different proportions everywhere.
 */
export const AOIS: readonly Aoi[] = [
  {
    id: 'punjab',
    name: { en: 'Punjab & Haryana, India', ru: 'Пенджаб и Харьяна, Индия' },
    blurb: {
      en: 'Post-harvest stubble burning. Two sharp pulses a year, set by the cropping calendar rather than the weather.',
      ru: 'Послеуборочные палы стерни. Два резких всплеска в год — по календарю урожая, а не погоды.',
    },
    bounds: { west: 73.5, south: 29.0, east: 77.5, north: 32.5 },
  },
  {
    id: 'sierra',
    name: { en: 'Sierra Nevada, California', ru: 'Сьерра-Невада, Калифорния' },
    blurb: {
      en: 'Lightning and drought-driven forest fire. One long late-summer season with a strong upward trend.',
      ru: 'Лесные пожары от гроз и засух. Один длинный позднелетний сезон с выраженным ростом.',
    },
    bounds: { west: -123.0, south: 35.5, east: -118.0, north: 40.5 },
  },
  {
    id: 'cerrado',
    name: { en: 'Mato Grosso Cerrado, Brazil', ru: 'Серрадо, Мату-Гросу, Бразилия' },
    blurb: {
      en: 'Savanna and deforestation fire in the dry season. Enormous totals concentrated into August and September.',
      ru: 'Саванна и расчистка леса в сухой сезон. Огромные объёмы, сжатые в август и сентябрь.',
    },
    bounds: { west: -58.0, south: -16.0, east: -52.0, north: -11.0 },
  },
  {
    id: 'yakutia',
    name: { en: 'Central Yakutia, Russia', ru: 'Центральная Якутия, Россия' },
    blurb: {
      en: 'Boreal forest fire above permafrost. Short, violent seasons and the extreme years of 2020 and 2021.',
      ru: 'Бореальные пожары над вечной мерзлотой. Короткие яростные сезоны и экстремальные 2020 и 2021 годы.',
    },
    bounds: { west: 122.0, south: 61.0, east: 130.0, north: 65.0 },
  },
]

/**
 * The whole planet, for the archive pull only.
 *
 * Deliberately not in `AOIS`: that list is what the region picker is built
 * from, and the world is not a region you compare against the others — it is
 * the source the global pyramid is folded out of. FIRMS treats this bbox and
 * its own `world` keyword identically, and a bbox is one less special case.
 */
export const WORLD: Aoi = {
  id: 'world',
  name: { en: 'World', ru: 'Весь мир' },
  blurb: {
    en: 'Every detection on Earth, the source for the global pyramid.',
    ru: 'Все засечки на планете — источник для глобальной пирамиды.',
  },
  bounds: { west: -180, south: -90, east: 180, north: 90 },
}

export function aoiById(id: string): Aoi | undefined {
  return AOIS.find((a) => a.id === id)
}

export function boundsToFirms(b: Aoi['bounds']): string {
  return `${b.west},${b.south},${b.east},${b.north}`
}
