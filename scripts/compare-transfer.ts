/**
 * The reconciliation's own tests, rerunnable from the shipped archives.
 *
 * Everything the pages and docs/how-it-works.md say about how well MODIS × k
 * reproduces VIIRS comes out of this script, so a reader can check it
 * without trusting the prose:
 *
 *   - leave-one-year-out inside the S-NPP-only era, per area and for the
 *     planet (the planet needs the local global daily file);
 *   - the same test for a power law, V = a·M^b fitted in logs with Duan's
 *     smearing to bring it back from logs — the obvious alternative to one
 *     constant, and the reason it was not taken;
 *   - the same test for the ratio of the sums instead of the median of
 *     the daily ratios;
 *   - the same test for a ratio per level of activity (terciles of the
 *     day's MODIS count) and for a ratio per calendar month — the two
 *     ways the constant could be made to bend, measured before taking
 *     either;
 *   - the two routes (MODIS × k, and VIIRS alone in the same unit): their
 *     trends over 2013-2025, the drift of one against the other, and the
 *     correlation of their year-to-year changes (which cannot see a drift).
 *
 *     npx tsx scripts/compare-transfer.ts
 */

import { existsSync, readFileSync } from 'node:fs'

import { readDays, type ArchiveCube } from '../src/core/cube'
import { dayFromIndex, daysInYear } from '../src/core/grid'
import {
  calibrate,
  dayOfYearIso,
  leaveOneYearOut,
  ratiosFromDays,
  routeAgreement,
  routeTrends,
  sensitivityByEra,
  summarizeSensitivity,
  twoRoutes,
} from '../src/core/harmonize'
import type { DayRecord } from '../src/core/types'

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

/** Leave-one-year-out for V = a·M^b, on the same years as the constant. */
function powerLawLoyo(days: readonly DayRecord[]): number[] {
  const era = sensitivityByEra([])[0]
  const inside = days.filter((d) => d.day >= era.from && d.day <= era.to!)
  const errors: number[] = []
  for (let year = 2013; year <= 2017; year++) {
    const tag = String(year)
    const fit = inside.filter((d) => !d.day.startsWith(tag) && d.modisOnly + d.both >= 1 && d.viirsOnly + d.both >= 1)
    const x = fit.map((d) => Math.log(d.modisOnly + d.both))
    const y = fit.map((d) => Math.log(d.viirsOnly + d.both))
    const mx = x.reduce((s, v) => s + v, 0) / x.length
    const my = y.reduce((s, v) => s + v, 0) / y.length
    let sxy = 0
    let sxx = 0
    for (let i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my)
      sxx += (x[i] - mx) ** 2
    }
    const b = sxy / sxx
    const a = my - b * mx
    const smear = y.reduce((s, v, i) => s + Math.exp(v - (a + b * x[i])), 0) / y.length
    let predicted = 0
    let observed = 0
    for (const d of inside) {
      if (!d.day.startsWith(tag)) continue
      const m = d.modisOnly + d.both
      if (m > 0) predicted += Math.exp(a) * m ** b * smear
      observed += d.viirsOnly + d.both
    }
    errors.push(predicted / observed - 1)
  }
  return errors
}

/** Leave-one-year-out for the ratio of the sums over the other years. */
function sumsLoyo(days: readonly DayRecord[]): number[] {
  const era = sensitivityByEra([])[0]
  const inside = days.filter((d) => d.day >= era.from && d.day <= era.to!)
  const errors: number[] = []
  for (let year = 2013; year <= 2017; year++) {
    const tag = String(year)
    let fm = 0
    let fv = 0
    let m = 0
    let v = 0
    for (const d of inside) {
      const dm = d.modisOnly + d.both
      const dv = d.viirsOnly + d.both
      if (d.day.startsWith(tag)) {
        m += dm
        v += dv
      } else {
        fm += dm
        fv += dv
      }
    }
    errors.push((m * fv) / fm / v - 1)
  }
  return errors
}

/**
 * Leave-one-year-out for a ratio that depends on something about the day.
 *
 * `binOf` puts each day in a bin using only what the fit is allowed to
 * know (the thresholds come from the years being fitted on); each bin gets
 * the median of its own daily ratios, and a bin with too few days falls
 * back to the one constant, so neither variant can win by having nothing
 * to say.
 */
function binnedLoyo(
  days: readonly DayRecord[],
  bins: (fit: readonly DayRecord[]) => (d: DayRecord) => number,
): number[] {
  const era = sensitivityByEra([])[0]
  const inside = days.filter((d) => d.day >= era.from && d.day <= era.to!)
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
  }
  const errors: number[] = []
  for (let year = 2013; year <= 2017; year++) {
    const tag = String(year)
    const fit = inside.filter((d) => !d.day.startsWith(tag))
    const usable = fit.filter((d) => d.modisOnly + d.both >= 3)
    const global = median(usable.map((d) => (d.viirsOnly + d.both) / (d.modisOnly + d.both)))
    const binOf = bins(usable)
    const byBin = new Map<number, number[]>()
    for (const d of usable) {
      const b = binOf(d)
      const list = byBin.get(b) ?? []
      list.push((d.viirsOnly + d.both) / (d.modisOnly + d.both))
      byBin.set(b, list)
    }
    const kOf = (b: number) => {
      const list = byBin.get(b)
      return list && list.length >= 20 ? median(list) : global
    }
    let predicted = 0
    let observed = 0
    for (const d of inside) {
      if (!d.day.startsWith(tag)) continue
      predicted += (d.modisOnly + d.both) * kOf(binOf(d))
      observed += d.viirsOnly + d.both
    }
    errors.push(predicted / observed - 1)
  }
  return errors
}

/** Terciles of the day's MODIS count, cut on the years being fitted. */
const byActivity = (fit: readonly DayRecord[]) => {
  const m = fit.map((d) => d.modisOnly + d.both).sort((a, b) => a - b)
  const t1 = m[Math.floor(m.length / 3)]
  const t2 = m[Math.floor((2 * m.length) / 3)]
  return (d: DayRecord) => {
    const x = d.modisOnly + d.both
    return x <= t1 ? 0 : x <= t2 ? 1 : 2
  }
}

/** The calendar month. */
const byMonth = () => (d: DayRecord) => Number(d.day.slice(5, 7))

function report(name: string, days: DayRecord[]): void {
  const cal = calibrate(ratiosFromDays(days))
  const loyo = leaveOneYearOut(days).map((r) => ({ year: r.year, err: r.predicted / r.observed - 1 }))
  const power = powerLawLoyo(days)
  const routes = twoRoutes(days, cal).filter((r) => r.year >= 2013 && r.year <= 2025)
  const agree = routeAgreement(routes)
  const worst = (xs: number[]) => xs.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0)
  console.log(`\n${name}: k = ${cal.k.toFixed(2)} [95% ${cal.ci?.lo.toFixed(2)}–${cal.ci?.hi.toFixed(2)}]`)
  console.log(`  constant, leave one year out: ${loyo.map((e) => `${e.year} ${pct(e.err)}`).join('  ')}`)
  console.log(`  power law, same test:         ${power.map((e, i) => `${2013 + i} ${pct(e)}`).join('  ')}`)
  console.log(`  worst year: constant ${pct(worst(loyo.map((e) => e.err)))}, power law ${pct(worst(power))}`)
  const sums = sumsLoyo(days)
  const mae = (xs: number[]) => pct(xs.reduce((s, x) => s + Math.abs(x), 0) / xs.length)
  console.log(`  mean error, leave one year out: median of days ${mae(loyo.map((e) => e.err))}, ratio of sums ${mae(sums)}`)
  const act = binnedLoyo(days, byActivity)
  const mon = binnedLoyo(days, byMonth)
  console.log(`  ratio by activity tercile:     ${act.map((e, i) => `${2013 + i} ${pct(e)}`).join('  ')}  (mean ${mae(act)}, worst ${pct(worst(act))})`)
  console.log(`  ratio by calendar month:       ${mon.map((e, i) => `${2013 + i} ${pct(e)}`).join('  ')}  (mean ${mae(mon)}, worst ${pct(worst(mon))})`)
  const trends = routeTrends(routes)
  if (trends) {
    console.log(`  two routes, trend 2013-2025: MODIS ${pct(trends.modis)}/yr, VIIRS alone ${pct(trends.viirs)}/yr, drift ${pct(trends.drift)}/yr`)
  }
  if (agree) console.log(`  two routes, year-on-year changes: r = ${agree.r.toFixed(2)} over ${agree.n} steps (blind to a steady drift)`)
  void summarizeSensitivity
}

for (const aoi of ['punjab', 'sierra', 'cerrado', 'yakutia']) {
  const cube = JSON.parse(readFileSync(`public/data/${aoi}.json`, 'utf8')) as ArchiveCube
  report(aoi, readDays(cube).map((d) => ({ ...d, day: dayFromIndex(d.dayIndex) })))
}

const planet = 'public/data/world/l0-daily.json'
if (existsSync(planet)) {
  const daily = JSON.parse(readFileSync(planet, 'utf8')) as { years: Record<string, { modis: number[]; viirs: number[] }> }
  const days: DayRecord[] = []
  for (const [year, row] of Object.entries(daily.years)) {
    row.modis.slice(0, daysInYear(Number(year))).forEach((m, i) => {
      days.push({ day: dayOfYearIso(Number(year), i), activeCells: 0, modisOnly: m, viirsOnly: row.viirs[i] ?? 0, both: 0, frp: 0, raw: 0 })
    })
  }
  report('planet (detections)', days)
} else {
  console.log('\nplanet: public/data/world/l0-daily.json is not in this checkout; build the world levels to include it')
}
