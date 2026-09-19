/**
 * Screenshot harness for design review.
 *
 * Drives the system Chrome through playwright-core with its own profile, so it
 * neither fights the browser the user already has open nor needs an extension.
 *
 *   node scripts/shots.mjs [outDir]
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5178/'
const OUT = process.argv[2] ?? 'shots'

const SHOTS = [
  { name: '01-punjab-night-en', aoi: 'punjab', theme: 'night', lang: 'en', width: 1440, height: 1000 },
  { name: '02-punjab-night-en-full', aoi: 'punjab', theme: 'night', lang: 'en', width: 1440, height: 1000, full: true },
  { name: '03-sierra-night-en', aoi: 'sierra', theme: 'night', lang: 'en', width: 1440, height: 1000 },
  { name: '04-sierra-day-ru-full', aoi: 'sierra', theme: 'day', lang: 'ru', width: 1440, height: 1000, full: true },
  { name: '05-punjab-mobile-ru', aoi: 'punjab', theme: 'night', lang: 'ru', width: 390, height: 844, full: true },
  { name: '06-empty-cerrado', aoi: 'cerrado', theme: 'night', lang: 'en', width: 1440, height: 900 },
]

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--force-color-profile=srgb', '--font-render-hinting=none'],
  })

  const report = []

  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()

    const consoleErrors = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200))
    })
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message.slice(0, 200)))

    await page.addInitScript(
      ([theme, lang]) => {
        localStorage.setItem('emberline.theme', theme)
        localStorage.setItem('emberline.lang', lang)
      },
      [shot.theme, shot.lang],
    )

    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.selectOption('#aoi', shot.aoi).catch(() => {})
    await page.waitForTimeout(1600)

    await page.screenshot({ path: `${OUT}/${shot.name}.png`, fullPage: !!shot.full })

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement
      const overflow = doc.scrollWidth - doc.clientWidth
      const text = (id) => document.getElementById(id)?.textContent?.trim() ?? ''
      // Anything still showing a raw i18n key is a missing translation.
      const rawKeys = [...document.querySelectorAll('body *')]
        .filter((el) => el.children.length === 0)
        .map((el) => el.textContent?.trim() ?? '')
        .filter((s) => /^[a-z][A-Za-z]{4,}$/.test(s) && !s.includes(' '))
      return {
        overflow,
        scrollHeight: doc.scrollHeight,
        hero: text('hero-answer'),
        aside: text('hero-aside'),
        years: document.querySelectorAll('#years-body tr').length,
        ribbonHeight: document.getElementById('ribbon-canvas')?.style.height ?? '',
        rawKeys: [...new Set(rawKeys)].slice(0, 8),
      }
    })

    report.push({ shot: shot.name, ...metrics, consoleErrors })
    process.stdout.write(`${shot.name}  overflow=${metrics.overflow}  years=${metrics.years}  errors=${consoleErrors.length}\n`)
    await context.close()
  }

  await browser.close()
  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  process.stdout.write(`\nwrote ${SHOTS.length} shots to ${OUT}/\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
