/**
 * One clean frame of a theme transition, plus the frame rate it ran at.
 *
 * Deliberately a single screenshot: capturing a burst of them starves the main
 * thread badly enough that the canvas falls behind the compositor, and the
 * resulting frames are an artefact of the harness rather than of the effect.
 *
 *   node scripts/burn-shots.mjs <out.png> <delayMs> [startTheme]
 */
import { chromium } from 'playwright-core'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const [, , out, delayMs, theme] = process.argv
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto('http://localhost:5178/', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
if (theme) await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
await page.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t) }; requestAnimationFrame(t) })
const t0 = Date.now()
await page.evaluate(() => document.getElementById('theme').click())
await page.waitForTimeout(Number(delayMs))
await page.screenshot({ path: out })
// Alpha down two columns of the effect canvas: the honest way to see how far
// the flame actually reaches, which a screenshot only hints at.
const prof = await page.evaluate(() => {
  const c = document.querySelector('canvas.burn-layer')
  if (!c) return 'no canvas'
  const g = c.getContext('2d', { willReadFrequently: true })
  const col = (x) => {
    const d = g.getImageData(x, 0, 1, c.height).data
    let top = -1
    let bottom = -1
    let solid = 0
    for (let y = 0; y < c.height; y++) {
      const a = d[y * 4 + 3]
      if (a > 8) {
        if (top < 0) top = y
        bottom = y
        if (a > 180) solid++
      }
    }
    return top < 0 ? 'empty' : `y ${top}..${bottom} (${bottom - top}px, ${solid}px solid)`
  }
  return { x260: col(260), x980: col(980) }
})
const f = await page.evaluate(() => window.__f)
console.log('profile', JSON.stringify(prof))
console.log('shot at', Date.now() - t0, 'ms | fps', (f / ((Date.now() - t0) / 1000)).toFixed(1), '| errors', errs.length ? errs : 'none')
await browser.close()
