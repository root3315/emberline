/**
 * The other half of the story: how warm the year was.
 *
 * The archive says where and when it burned. It cannot, on its own, say
 * anything about why — and the temptation to let a reader draw the line
 * themselves, by putting a rising temperature beside a rising fire count, is
 * exactly the trap this project exists to avoid. Two things rise together
 * here for reasons that have nothing to do with each other: VIIRS arrives in
 * 2012 and the planet warms throughout.
 *
 * So the temperature is fetched and shown as *context*, on its own axis, with
 * a caption that says the record cannot attribute one to the other. Twenty-six
 * years is short for a climate signal, half the detections are agricultural
 * burning that follows a sowing calendar, and the instruments changed in the
 * middle. All three are said out loud rather than hidden behind a correlation
 * coefficient.
 *
 * GISTEMP is NASA's own surface temperature analysis, which makes it the right
 * source for a NASA challenge and, more to the point, a well-documented one:
 * the anomaly is against the 1951-1980 mean, in degrees Celsius.
 *
 *   npx tsx scripts/build-climate.ts
 */

import { writeFile } from 'node:fs/promises'

const SOURCE = 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv'
const OUT = 'public/data/climate.json'

/** The record only has fires from here; earlier anomalies are not needed. */
const FROM = 2000

async function main(): Promise<void> {
  /**
   * With a user agent, because the server closes the socket without one.
   *
   * Node sends no `User-Agent` by default and GISS drops the connection
   * rather than answering, which surfaces as a bare `UND_ERR_SOCKET` and
   * looks like a network fault. curl works because curl identifies itself.
   */
  const res = await fetch(SOURCE, {
    signal: AbortSignal.timeout(60_000),
    headers: {
      'User-Agent': 'Emberline/1.0 (NASA Space Apps 2026; fire archive viewer)',
      Accept: 'text/csv,*/*',
    },
  })
  if (!res.ok) throw new Error(`GISTEMP: HTTP ${res.status}`)
  const text = await res.text()

  /**
   * The file opens with two lines of preamble, then a header, then one row a
   * year. Column 0 is the year and the last useful one, `J-D`, is the annual
   * mean; a year still in progress carries `***` there, which is the file's
   * way of saying "not yet" and must not be read as zero.
   */
  const years: Record<string, number> = {}
  for (const line of text.split('\n')) {
    const cells = line.split(',')
    const year = Number(cells[0])
    if (!Number.isInteger(year) || year < FROM) continue
    const annual = Number(cells[13])
    if (!Number.isFinite(annual)) continue
    years[String(year)] = annual
  }

  const list = Object.keys(years).sort()
  if (list.length < 10) throw new Error(`GISTEMP: only ${list.length} years parsed — format changed?`)

  await writeFile(
    OUT,
    JSON.stringify(
      {
        measure: 'Global land-ocean temperature anomaly, °C vs the 1951-1980 mean',
        source: 'NASA GISS Surface Temperature Analysis (GISTEMP v4)',
        url: 'https://data.giss.nasa.gov/gistemp/',
        fetchedAt: new Date().toISOString(),
        years,
      },
      null,
      2,
    ) + '\n',
  )

  process.stdout.write(
    `${list.length} years, ${list[0]}–${list[list.length - 1]}\n` +
      `${list[0]}: ${years[list[0]]}°C   ${list[list.length - 1]}: ${years[list[list.length - 1]]}°C\n` +
      `${OUT}\n`,
  )
}

main().catch((e) => {
  console.error('\n' + String(e))
  process.exit(1)
})
