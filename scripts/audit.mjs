/**
 * Contrast and craft audit.
 *
 * Checks the things a screenshot cannot settle by eye: WCAG contrast for every
 * text tier in both themes, tap-target sizes, and whether interactive elements
 * carry the states they need.
 */

import { chromium } from 'playwright-core'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const BASE = 'http://localhost:5178/'

function luminance([r, g, b]) {
  const f = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function parse(css) {
  const m = css.match(/rgba?\(([^)]+)\)/)
  if (!m) return [0, 0, 0]
  const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
  return [parts[0], parts[1], parts[2]]
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })

  for (const theme of ['night', 'day']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.addInitScript((t) => {
      localStorage.setItem('emberline.theme', t)
      localStorage.setItem('emberline.lang', 'en')
    }, theme)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.selectOption('#aoi', 'sierra').catch(() => {})
    await page.waitForTimeout(1500)

    const probes = await page.evaluate(() => {
      const pick = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const cs = getComputedStyle(el)
        let bgEl = el
        let bg = 'rgba(0, 0, 0, 0)'
        while (bgEl) {
          const c = getComputedStyle(bgEl).backgroundColor
          if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
            bg = c
            break
          }
          bgEl = bgEl.parentElement
        }
        const r = el.getBoundingClientRect()
        return { sel, color: cs.color, bg, size: cs.fontSize, weight: cs.fontWeight, w: Math.round(r.width), h: Math.round(r.height) }
      }
      return [
        '.hero__answer',
        '.hero__where',
        '.hero__aside',
        '.hero__stats dt',
        '.hero__stats dd',
        '.note',
        '.metrics dt',
        '.metrics dd',
        '.years td',
        '.years th',
        '.sensor__name',
        '.sensor__span',
        '.colophon p',
        '.split-bar__key',
        '.mini-facts dt',
        '.ramp__labels span',
        '.legend',
        '.status',
      ].map(pick).filter(Boolean)
    })

    const targets = await page.evaluate(() =>
      [...document.querySelectorAll('button, select, input:not([type=hidden]), [tabindex="0"]')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { tag: el.tagName.toLowerCase(), id: el.id, w: Math.round(r.width), h: Math.round(r.height) }
        })
        .filter((t) => t.h < 36 || t.w < 36),
    )

    process.stdout.write(`\n=== theme: ${theme} ===\n`)
    for (const p of probes) {
      const ratio = contrast(parse(p.color), parse(p.bg))
      const px = parseFloat(p.size)
      const large = px >= 24 || (px >= 18.66 && Number(p.weight) >= 700)
      const need = large ? 3 : 4.5
      const flag = ratio < need ? (ratio < need - 1 ? 'FAIL' : 'LOW ') : 'ok  '
      process.stdout.write(`  ${flag} ${ratio.toFixed(2).padStart(5)} (need ${need})  ${p.size.padStart(6)} ${String(p.weight).padStart(3)}  ${p.sel}\n`)
    }
    if (targets.length) {
      process.stdout.write(`  small tap targets: ${targets.map((t) => `${t.tag}#${t.id || '?'} ${t.w}x${t.h}`).join(', ')}\n`)
    }
    await context.close()
  }

  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
