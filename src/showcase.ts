/**
 * The showcase: every palette against the same real content.
 *
 * A colour set can look handsome as a row of swatches and fall apart the
 * moment a map of burning is drawn on it. So this page draws the map, the
 * globe, the ring and the model's charts from the same files the site
 * ships, and lets the palette change under them.
 *
 * ── What it is for beyond palettes ────────────────────────────────────────
 *
 * The globe here takes a click. Press a fire and the planet turns until
 * that point faces you, closes in, and says what is there. That
 * interaction does not exist in the product yet; it exists here so it can
 * be judged before it does.
 *
 * Nothing in the product imports this, and Vite builds `index.html` alone,
 * so none of it reaches `dist`.
 */

import './styles/tokens.css'
import './styles/app.css'
import './styles/themes.css'
import './styles/showcase.css'

import { loadForecast } from './core/forecast'
import { loadLand } from './core/land'
import { loadModelCard } from './core/model-card'
import { setLang } from './i18n'
import { drawCalibration } from './ui/calibration'
import { mountFireYear, type FireYear } from './ui/fire-year'
import { mountGlobe, type GlobeHandle, type GlobePick } from './ui/globe'
import { drawImportance } from './ui/importance'
import { cssVar, heat, invalidateRamp } from './ui/paint'

setLang('ru')

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const root = document.documentElement

/** Everything that has to be repainted when the palette changes. */
const repaint: Array<() => void> = []

// ── the palette switch ──────────────────────────────────────────────────
$('theme-pick').addEventListener('change', (e) => {
  root.dataset.theme = (e.target as HTMLInputElement).value
  // The ramp is cached as a lookup table; a palette change invalidates it
  // and every canvas has to be told, because none of them watch the DOM.
  invalidateRamp()
  for (const again of repaint) again()
})

// ── swatches, read back out of the stylesheet ───────────────────────────
function swatches(host: HTMLElement, names: string[]): void {
  const paint = () => {
    host.innerHTML = ''
    for (const name of names) {
      const item = document.createElement('li')
      const chip = document.createElement('span')
      chip.className = 'show__chip'
      chip.style.background = `var(${name})`
      const label = document.createElement('code')
      label.textContent = name.replace('--', '')
      const value = document.createElement('small')
      value.textContent = cssVar(name)
      item.append(chip, label, value)
      host.append(item)
    }
  }
  paint()
  repaint.push(paint)
}

swatches($('show-swatches'), [
  '--heat-00',
  '--heat-15',
  '--heat-35',
  '--heat-55',
  '--heat-75',
  '--heat-90',
  '--heat-100',
])

swatches($('show-surfaces'), [
  '--ash-void',
  '--ash-base',
  '--ash-raised',
  '--ash-panel',
  '--ash-lifted',
  '--ink-primary',
  '--ink-secondary',
  '--ink-tertiary',
  '--ink-muted',
  '--ember',
])

// ── the type scale, at the sizes the site actually uses ─────────────────
const TYPE: Array<[string, string]> = [
  ['--t-display', 'Когда и где горит'],
  ['--t-h1', 'Когда и где горит'],
  ['--t-h2', 'Когда и где горит'],
  ['--t-h3', 'Когда и где горит'],
  ['--t-h4', 'Когда и где горит'],
  ['--t-body', 'Когда и где горит'],
  ['--t-small', 'Когда и где горит'],
  ['--t-caption', 'Когда и где горит'],
]
for (const [size, text] of TYPE) {
  const row = document.createElement('p')
  row.className = 'show__type-row'
  row.style.fontSize = `var(${size})`
  const tag = document.createElement('small')
  tag.textContent = size.replace('--t-', '')
  row.append(document.createTextNode(text + ' '), tag)
  $('show-type').append(row)
}

// ── the ring ────────────────────────────────────────────────────────────
void (async () => {
  const res = await fetch('/data/world/l0-daily.json').catch(() => null)
  if (!res?.ok) return
  const ring = mountFireYear($<HTMLCanvasElement>('show-ring'), (await res.json()) as FireYear)
  repaint.push(() => ring.retheme())
})()

// ── the model's charts ──────────────────────────────────────────────────
void (async () => {
  const card = await loadModelCard()
  if (!card) return
  const paint = () => {
    drawImportance(
      $<HTMLCanvasElement>('show-importance'),
      card.importance.map((w) => ({ ...w, name: w.name.ru })),
    )
    drawCalibration(
      $<HTMLCanvasElement>('show-calib'),
      card.reliability.map((b) => ({ from: 0, to: 1, n: b.n, said: b.said, burned: b.burned })),
    )
  }
  paint()
  repaint.push(paint)
})()

// ── the globe, and what a click on it does ──────────────────────────────
void (async () => {
  const [land, forecast] = await Promise.all([loadLand(), loadForecast()])
  if (!land || !forecast) return

  const cells = [...forecast.cells].sort((a, b) => b.p - a.p).slice(0, 25_000)
  let globe: GlobeHandle | null = null

  globe = mountGlobe($<HTMLCanvasElement>('show-globe'), land, {
    onPick: (pick) => showPick(pick, cells),
  })
  globe.setFires(cells)
  repaint.push(() => {
    globe?.retheme()
    redrawZoom()
  })

  $('show-globe').addEventListener('dblclick', () => {
    globe?.reset()
    $('show-pick-empty').hidden = false
    $('show-pick-facts').hidden = true
    $('show-pick-map').hidden = true
  })
})()

let picked: { pick: GlobePick; near: Array<{ lat: number; lon: number; p: number }> } | null = null

/**
 * What was clicked, and its neighbourhood drawn flat.
 *
 * The globe answers "where"; at the scale a planet is drawn, it cannot
 * answer "and what is around it". Four degrees of the forecast grid, laid
 * out square, does — and it is the same cells in the same colours, so the
 * two pictures agree by construction rather than by care.
 */
function showPick(pick: GlobePick | null, cells: Array<{ lat: number; lon: number; p: number }>): void {
  $('show-pick-empty').hidden = Boolean(pick)
  $('show-pick-facts').hidden = !pick
  $('show-pick-map').hidden = !pick
  if (!pick) {
    picked = null
    return
  }

  const near = cells.filter(
    (c) => Math.abs(c.lat - pick.lat) <= 4 && Math.abs(c.lon - pick.lon) <= 4,
  )
  picked = { pick, near }

  const facts = $('show-pick-facts')
  facts.innerHTML = ''
  const rows: Array<[string, string]> = [
    ['Вероятность', `${Math.min(99, Math.round(pick.p * 100))}%`],
    ['Широта', pick.lat.toFixed(2)],
    ['Долгота', pick.lon.toFixed(2)],
    ['Ячеек рядом', String(near.length)],
  ]
  for (const [label, value] of rows) {
    const wrap = document.createElement('div')
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    wrap.append(dt, dd)
    facts.append(wrap)
  }

  // The count goes after a colon rather than before a noun: Russian
  // declines the noun by the numeral, and «63 ячеек» is as wrong as
  // «5 ячейки» — one phrasing cannot serve every number.
  $('show-zoom-note').textContent = `Восемь градусов вокруг точки. Ячеек выше 1%: ${near.length}.`
  redrawZoom()
}

/** The neighbourhood, square, at the grid's own resolution. */
function redrawZoom(): void {
  const canvas = $<HTMLCanvasElement>('show-zoom')
  const box = canvas.parentElement?.getBoundingClientRect()
  const side = Math.max(160, Math.round(box?.width ?? 240))
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = canvas.height = Math.round(side * dpr)
  canvas.style.width = '100%'
  canvas.style.height = 'auto'

  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, side, side)
  if (!picked) return

  const { pick, near } = picked
  const span = 8 // degrees across
  const cell = side / (span / 0.25)
  for (const c of near) {
    const x = ((c.lon - pick.lon + span / 2) / span) * side
    const y = ((pick.lat - c.lat + span / 2) / span) * side
    ctx.fillStyle = `rgb(${heat(Math.min(1, c.p)).slice(0, 3).join(',')})`
    ctx.fillRect(x - cell / 2, y - cell / 2, Math.max(1.5, cell), Math.max(1.5, cell))
  }

  // The clicked cell, ringed, so it can be found among its neighbours.
  ctx.strokeStyle = cssVar('--ink-primary')
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(side / 2, side / 2, Math.max(6, cell), 0, Math.PI * 2)
  ctx.stroke()
}

window.addEventListener('resize', redrawZoom)
