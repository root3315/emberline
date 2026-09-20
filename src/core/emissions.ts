/**
 * From radiative power to carbon dioxide, with the assumptions in the open.
 *
 * The obvious way to estimate emissions is to count fires, and it is wrong: a
 * detection means "this pixel looked hot when the satellite passed", not "this
 * much burned". Two detections can differ by three orders of magnitude in the
 * fuel they consumed.
 *
 * The accepted way runs on energy instead, and is the method behind ECMWF's
 * GFAS product:
 *
 *   radiative power  →  radiative energy  →  biomass burned  →  CO₂
 *
 * Each arrow has a measured constant. Wooster's laboratory and field work put
 * the second at about 0.368 kg of dry matter per megajoule of fire radiative
 * energy; the third is an emission factor, near 1.55 kg of CO₂ per kilogram of
 * dry matter across the mix of biomes that actually burn.
 *
 * ── Where the honesty has to be ──────────────────────────────────────────
 *
 * The first arrow is the weak one and it carries a free parameter. Power is an
 * instantaneous reading, energy is its integral over time, and a polar-orbiting
 * satellite samples a fire two to four times a day. Turning a handful of
 * snapshots into an integral requires assuming how long each one stands for,
 * and that assumption cannot be derived from our data.
 *
 * So it is calibrated instead: the constant is chosen so that the global total
 * across the MODIS era matches the published GFED figure. That makes this
 * **not an independent measurement of emissions**. It is the published global
 * total, redistributed across our years and our map by radiative power. Useful
 * — it puts a defensible number on a region and a year, which the raw archive
 * cannot — but it must be labelled as what it is, and the interface says so.
 *
 * ── Why MODIS alone ──────────────────────────────────────────────────────
 *
 * The combined power series steps upward in 2012 when VIIRS arrives, again in
 * 2018 with NOAA-20 and again in 2024 with NOAA-21. Any quantity derived from
 * it inherits those steps as though the planet had caught fire on three
 * particular dates. MODIS Terra and Aqua have both been flying since mid-2002
 * and nothing has been added since, so the MODIS power series is the one
 * consistent thread through the record — and it is the thread GFED's own
 * burned-area product is built from.
 *
 * The cost is that the series starts in 2003 rather than 2000.
 */

/** Dry matter consumed per megajoule of fire radiative energy (Wooster 2005). */
const DRY_MATTER_PER_MJ = 0.368

/**
 * Kilograms of CO₂ per kilogram of dry matter.
 *
 * Emission factors run from about 1.6 in savanna to 1.5 in boreal forest and
 * lower in peat, where much of the carbon leaves as CO and methane instead.
 * One number across the whole planet is a simplification worth roughly ±10%,
 * which is small next to the uncertainty in the line above it.
 */
const CO2_PER_KG_DRY_MATTER = 1.55

/**
 * The published total this estimate is scaled to.
 *
 * GFED4.1s puts global fire carbon emissions near 2.2 Pg a year over its
 * record; about nine tenths of that carbon leaves as CO₂ rather than as CO,
 * methane or particulates, which is 7.3 Gt of CO₂ a year.
 *
 *   van der Werf et al., Global fire emissions estimates during 1997-2016,
 *   Earth System Science Data 9, 2017.
 */
export const GFED_ANNUAL_CO2_GT = 7.3

/** The years over which the calibration is taken: both MODIS satellites up. */
const CALIBRATION_FROM = 2003
const CALIBRATION_TO = 2016

export interface YearPower {
  year: number
  /** Summed MODIS radiative power for the year, in megawatts. */
  frpModis: number
}

export interface Emissions {
  /** Gigatonnes of CO₂, per year. */
  byYear: Map<number, number>
  /**
   * The factor the whole series was multiplied by to meet the published
   * total — exposed so the interface can say the estimate is scaled, and so
   * a reader who distrusts the calibration can undo it.
   */
  scale: number
  /** How wide the band around each figure should be read as being. */
  uncertainty: number
  from: number
  to: number
}

/**
 * The full series, scaled once so its calibration era meets GFED.
 *
 * The uncertainty is not computed from anything — it is stated. A factor of
 * two either way is the honest width for a polar-orbiting FRP estimate: the
 * diurnal cycle is undersampled, peat fires burn below ground where radiative
 * power barely sees them, and one emission factor stands in for every biome.
 * Printing a tighter band would be a claim the method cannot support.
 */
export function estimateEmissions(totals: readonly YearPower[]): Emissions | null {
  const usable = totals.filter((t) => t.year >= CALIBRATION_FROM && t.frpModis > 0)
  if (usable.length < 5) return null

  // Unscaled: dry matter per megawatt-year of power, then CO₂ from that. The
  // time constant is missing on purpose — it is what the scaling supplies.
  const raw = new Map<number, number>()
  for (const t of usable) {
    const mj = t.frpModis // megawatts; the seconds are folded into `scale`
    raw.set(t.year, (mj * DRY_MATTER_PER_MJ * CO2_PER_KG_DRY_MATTER) / 1e12)
  }

  const era = [...raw].filter(([y]) => y >= CALIBRATION_FROM && y <= CALIBRATION_TO)
  if (!era.length) return null
  const mean = era.reduce((sum, [, v]) => sum + v, 0) / era.length
  if (mean <= 0) return null

  const scale = GFED_ANNUAL_CO2_GT / mean
  const byYear = new Map<number, number>()
  for (const [y, v] of raw) byYear.set(y, v * scale)

  const years = [...byYear.keys()].sort((a, b) => a - b)
  return {
    byYear,
    scale,
    uncertainty: 2,
    from: years[0],
    to: years[years.length - 1],
  }
}

/**
 * Something the number can be held against.
 *
 * A gigatonne of CO₂ means nothing on its own. Annual emissions from fossil
 * fuels and industry are near 37 Gt (Global Carbon Budget 2024), and that is
 * the comparison a reader actually wants — not because fires and industry are
 * the same kind of thing, but because it puts the figure on a scale they have
 * already met.
 */
export const FOSSIL_ANNUAL_CO2_GT = 37

/**
 * The finished series, as the build wrote it.
 *
 * The page does not recompute this: the estimate needs the annual index,
 * which is four hundred kilobytes of monthly detail the impact section has no
 * use for, and a reader who never opens the global view should still see the
 * figure. One small file, fetched once, and a missing file simply means the
 * section shows its mechanisms without a number.
 */
export interface EmissionsFile {
  uncertaintyFactor: number
  from: number
  to: number
  /** Years still in progress: their figure is a part-year total. */
  partial?: number[]
  calibratedTo: { source: string; annualGtCo2: number }
  comparison: { label: string; annualGtCo2: number }
  years: Record<string, number>
}

let emissionsFile: EmissionsFile | null = null
let emissionsWanted: Promise<EmissionsFile | null> | null = null

export async function loadEmissions(base = '/data'): Promise<EmissionsFile | null> {
  if (emissionsFile) return emissionsFile
  emissionsWanted ??= fetch(`${base}/emissions.json`)
    .then(async (res) => {
      if (!res.ok) return null
      emissionsFile = (await res.json()) as EmissionsFile
      return emissionsFile
    })
    .catch(() => null)
  return emissionsWanted
}

/**
 * Global temperature, for context beside the years.
 *
 * Kept in this module rather than a new one because it serves the same
 * purpose: both are outside numbers brought in so the archive can be read
 * against something. Neither is measured by us, and both carry a caption
 * saying so.
 */
export interface ClimateFile {
  measure: string
  source: string
  url: string
  years: Record<string, number>
}

let climate: ClimateFile | null = null
let climateWanted: Promise<ClimateFile | null> | null = null

export async function loadClimate(base = '/data'): Promise<ClimateFile | null> {
  if (climate) return climate
  climateWanted ??= fetch(`${base}/climate.json`)
    .then(async (res) => {
      if (!res.ok) return null
      climate = (await res.json()) as ClimateFile
      return climate
    })
    .catch(() => null)
  return climateWanted
}
