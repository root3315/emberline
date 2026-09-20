/**
 * The emissions estimate, computed once here rather than in every browser.
 *
 * The arithmetic is small enough to do on the page, and doing it there would
 * still be wrong: it needs the annual index, which is four hundred kilobytes
 * of monthly seasons the impact section has no use for, and a reader who
 * never opens the global view would never see the figure. One kilobyte of
 * finished numbers instead.
 *
 * The method itself is not duplicated — this imports the same module the
 * interface would have used, so there is exactly one place where the
 * constants and the calibration live, and one place to argue with.
 *
 *   npx tsx scripts/build-emissions.ts
 */

import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

import { estimateEmissions, FOSSIL_ANNUAL_CO2_GT, GFED_ANNUAL_CO2_GT } from '../src/core/emissions'

const INDEX = 'public/data/world/l0-index.json'
const OUT = 'public/data/emissions.json'

interface Index {
  totals: Array<{ year: number; frpModis?: number }>
  /** Monthly counts per year, used here only to tell a finished year apart. */
  seasons: Array<{ year: number; modis: number[] }>
}

async function main(): Promise<void> {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8')) as Index
  const totals = idx.totals
    .filter((t): t is { year: number; frpModis: number } => typeof t.frpModis === 'number')
    .map((t) => ({ year: t.year, frpModis: t.frpModis }))

  if (!totals.length) {
    console.error(
      `${INDEX} carries no per-instrument radiative power.\n` +
        'Rebuild it first: npx tsx scripts/build-world-l0.ts <cacheDir>',
    )
    process.exit(1)
  }

  const est = estimateEmissions(totals)
  if (!est) {
    console.error('Not enough usable years to calibrate an estimate.')
    process.exit(1)
  }

  const years: Record<string, number> = {}
  for (const [year, gt] of [...est.byYear].sort((a, b) => a[0] - b[0])) {
    years[String(year)] = Number(gt.toFixed(3))
  }

  /**
   * Which years are not finished.
   *
   * The current year always has months still to come, and its figure is
   * therefore a part-year total that looks exactly like a collapse in
   * burning. Globally every month of a complete year carries MODIS
   * detections somewhere, so an empty month is a missing month.
   */
  const partial = idx.seasons
    .filter((se) => se.modis.length === 12 && se.modis.some((m) => m === 0))
    .map((se) => se.year)
    .filter((y) => years[String(y)] !== undefined)

  await writeFile(
    OUT,
    JSON.stringify(
      {
        measure: 'Gigatonnes of CO₂ released by vegetation fires, per year',
        method:
          'MODIS fire radiative power → radiative energy → dry matter burned → CO₂, ' +
          'with the series scaled so its 2003–2016 mean meets the published GFED figure. ' +
          'An order of magnitude, not an independent measurement.',
        calibratedTo: { source: 'GFED4.1s, van der Werf et al. 2017', annualGtCo2: GFED_ANNUAL_CO2_GT },
        comparison: { label: 'Fossil fuels and industry', annualGtCo2: FOSSIL_ANNUAL_CO2_GT },
        uncertaintyFactor: est.uncertainty,
        from: est.from,
        to: est.to,
        partial,
        builtAt: new Date().toISOString(),
        years,
      },
      null,
      2,
    ) + '\n',
  )

  const list = Object.entries(years)
  process.stdout.write(
    `${list.length} years, ${est.from}–${est.to}\n` +
      list
        .slice(-4)
        .map(([y, v]) => `  ${y}  ${v.toFixed(1)} Gt CO2`)
        .join('\n') +
      `\n${OUT}\n`,
  )
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
