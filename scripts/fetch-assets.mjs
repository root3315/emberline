// Vendors fonts + land geometry into /public so the app runs fully offline.
import { mkdir, writeFile } from 'node:fs/promises'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
const FAMILIES = 'family=Manrope:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500'
const KEEP = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'])

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

async function main() {
  await mkdir('public/fonts', { recursive: true })
  await mkdir('public/geo', { recursive: true })

  const css = await (await fetch(`https://fonts.googleapis.com/css2?${FAMILIES}&display=swap`, {
    headers: { 'User-Agent': UA },
  })).text()

  // Google returns blocks of `/* subset */ @font-face { ... }` — split on the subset comment.
  const blocks = css.split(/\/\*\s*([a-z-]+)\s*\*\//i).slice(1)
  const out = []
  for (let i = 0; i < blocks.length; i += 2) {
    const subset = blocks[i].trim()
    const face = blocks[i + 1]
    if (!KEEP.has(subset)) continue

    const family = /font-family:\s*'([^']+)'/.exec(face)?.[1]
    const weight = /font-weight:\s*(\d+)/.exec(face)?.[1]
    const url = /src:\s*url\(([^)]+)\)/.exec(face)?.[1]
    const range = /unicode-range:\s*([^;]+);/.exec(face)?.[1]
    if (!family || !weight || !url) continue

    const name = `${slug(family)}-${weight}-${subset}.woff2`
    const bytes = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer())
    await writeFile(`public/fonts/${name}`, bytes)
    out.push(
      `@font-face {\n  font-family: '${family}';\n  font-style: normal;\n  font-weight: ${weight};\n  font-display: swap;\n  src: url('./fonts/${name}') format('woff2');${range ? `\n  unicode-range: ${range.trim()};` : ''}\n}`,
    )
    process.stdout.write(`  ${name} ${(bytes.length / 1024).toFixed(1)}kb\n`)
  }
  await writeFile('public/fonts.css', `/* Vendored from Google Fonts. Regenerate: node scripts/fetch-assets.mjs */\n\n${out.join('\n\n')}\n`)

  const land = Buffer.from(await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')).arrayBuffer())
  await writeFile('public/geo/land-110m.json', land)
  process.stdout.write(`  land-110m.json ${(land.length / 1024).toFixed(1)}kb\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
