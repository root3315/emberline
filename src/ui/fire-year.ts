/**
 * The planet's fire year, as one object.
 *
 * Twenty-seven rings, one per year, the innermost 2000 and the outermost
 * the year now running. Around each ring, a day: January at the top,
 * clockwise through December. Brightness is how much of the Earth was
 * alight that day.
 *
 * ── Why a circle and not another calendar ─────────────────────────────────
 *
 * The site already has a rectangular calendar, and it is the right shape
 * for one place: rows stack, years compare, the eye runs left to right
 * through a season. What it cannot show is that the year *closes* — that
 * the last week of December sits against the first week of January, and
 * that the southern hemisphere's season runs straight through that join.
 * On a grid that continuity is cut in half and pasted at opposite edges.
 * On a ring it is one arc.
 *
 * It also does something a grid cannot: the whole record becomes a single
 * shape you can recognise. The planet's fire year has a silhouette — two
 * bright arcs, August and the turn of the year — and once seen it is hard
 * to unsee.
 *
 * ── The seam, made structural ─────────────────────────────────────────────
 *
 * In "as recorded" the rings brighten abruptly partway out. That ring is
 * 2012, and it is VIIRS arriving rather than the Earth igniting: a sharper
 * instrument counting fires the older one averaged away. Nothing else in
 * the record changes that year. Switch to "reconciled" and the step
 * disappears, because the older years are lifted to what today's sensor
 * would have seen.
 *
 * Every other chart on this site argues that in words beside it. Here the
 * flaw is a literal ring, and the fix is the ring going away, which is a
 * better argument than any caption.
 */

import { months } from '../i18n'
import { heat, heatScale, MONO, rgba, varColor } from './paint'

export interface FireYear {
  years: Record<string, { modis: number[]; viirs: number[] }>
}

export interface YearHandle {
  setMode(mode: 'raw' | 'harmonized'): void
  retheme(): void
  destroy(): void
}

const TWO_PI = Math.PI * 2
const SWEEP_MS = 1600

/** A hole in the middle, or the innermost years become unreadable slivers. */
const CORE = 0.22

/**
 * January, April, July, October, in whichever language is showing.
 *
 * The short forms, because the long ones ran off the sides of a square
 * canvas: "октябрь" set against the left edge of the disc came out as
 * "ктябрь", which looks like a rendering fault rather than a label.
 */
const QUARTERS = [0, 3, 6, 9]

export function mountFireYear(
  canvas: HTMLCanvasElement,
  data: FireYear,
  onProbe?: (text: string | null) => void,
): YearHandle {
  const ctx = canvas.getContext('2d')!
  const years = Object.keys(data.years)
    .map(Number)
    .sort((a, b) => a - b)

  let mode: 'raw' | 'harmonized' = 'harmonized'
  let width = 0
  let height = 0
  let raf = 0
  let started = 0

  /*
   * The rings are painted once into their own canvas.
   *
   * Twenty-seven years of days is ten thousand annular segments, and each
   * is an arc, an arc back and a fill. Redrawing all of them on every
   * frame of the opening sweep meant six hundred thousand paths in a
   * second and a half, which on any laptop is a visible stutter before
   * the page settles.
   *
   * Nothing about the rings changes during the sweep — only how much of
   * them is showing. So they go into an offscreen canvas once, and each
   * frame is one clipped copy: the same picture, drawn in a millisecond.
   */
  const cache = document.createElement('canvas')
  const cacheCtx = cache.getContext('2d')!
  let cacheMode: string | null = null
  const still = window.matchMedia('(prefers-reduced-motion: reduce)')

  /**
   * How much to lift the older instrument.
   *
   * MODIS alone is comparable across the whole record; the trouble is only
   * that it counts fewer fires than VIIRS does. So the reconciled view is
   * MODIS throughout, scaled by the ratio the two instruments actually
   * show each other over the years they overlap. One number, measured from
   * the record rather than assumed, and the same idea the rest of the site
   * applies per place and per season.
   */
  const lift = (() => {
    let m = 0
    let v = 0
    for (const year of years) {
      const both = data.years[String(year)]
      const vTotal = both.viirs.reduce((s, n) => s + n, 0)
      if (vTotal <= 0) continue
      m += both.modis.reduce((s, n) => s + n, 0)
      v += vTotal
    }
    return m > 0 ? (m + v) / m : 1
  })()

  function series(year: number): number[] {
    const both = data.years[String(year)]
    if (!both) return []
    if (mode === 'raw') return both.modis.map((n, i) => n + (both.viirs[i] ?? 0))
    return both.modis.map((n) => n * lift)
  }

  const ceiling = (() => {
    const all: number[] = []
    for (const year of years) {
      const both = data.years[String(year)]
      for (let i = 0; i < both.modis.length; i++) {
        all.push(both.modis[i] + (both.viirs[i] ?? 0))
      }
    }
    all.sort((a, b) => a - b)
    // The 99th percentile, so one freak day does not black out the rest.
    return all[Math.floor(all.length * 0.99)] || 1
  })()

  function resize(): void {
    const box = canvas.parentElement?.getBoundingClientRect()
    const side = Math.max(200, Math.round(Math.min(box?.width ?? 320, box?.height ?? 320)))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = height = Math.round(side * dpr)
    canvas.width = width
    canvas.height = height
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(1)
  }

  function geometry() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const side = width / dpr
    const cx = side / 2
    const cy = side / 2
    const outer = side / 2 - 22 // room for the month labels outside
    const inner = outer * CORE
    const ring = (outer - inner) / years.length
    return { cx, cy, outer, inner, ring }
  }

  /** Paint every ring into the cache. Slow, and done once per mode. */
  function paint(): void {
    const { cx, cy, inner, outer, ring } = geometry()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const side = width / dpr
    cache.width = width
    cache.height = height
    const ctx = cacheCtx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, side, side)

    const dim = varColor('--ash-raised')
    const edge = varColor('--edge-soft')
    const limit = TWO_PI

    years.forEach((year, yi) => {
      const days = series(year)
      const r0 = inner + yi * ring
      const r1 = r0 + ring - 0.4
      const n = days.length || 365

      // The quiet ring under the data, so a year with no fires still reads
      // as a year rather than as a gap in the object.
      ctx.beginPath()
      ctx.arc(cx, cy, r1, 0, TWO_PI)
      ctx.arc(cx, cy, r0, TWO_PI, 0, true)
      ctx.fillStyle = rgba(dim)
      ctx.fill()

      for (let d = 0; d < n; d++) {
        const a0 = (d / n) * TWO_PI - Math.PI / 2
        const a1 = ((d + 1) / n) * TWO_PI - Math.PI / 2
        if (a0 + Math.PI / 2 > limit) break
        const value = days[d] ?? 0
        if (value <= 0) continue
        ctx.beginPath()
        ctx.arc(cx, cy, r1, a0, a1)
        ctx.arc(cx, cy, r0, a1, a0, true)
        ctx.closePath()
        // Linear, not the site's usual power curve.
        //
        // Globally the planet always burns somewhere: a quiet day is two
        // thousand detections and a violent one is half a million, but the
        // middle half of the record sits inside a factor of two. Under the
        // 0.42 gamma the rest of this site uses, that middle half all came
        // out bright orange and the object turned into a solid disc with
        // no season in it. Straight through, the quiet months go dark and
        // the burning arc appears.
        ctx.fillStyle = rgba(heat(heatScale(value, ceiling, 1)))
        ctx.fill()
      }
    })

    // Month spokes, barely there: enough to find August, not enough to
    // turn the object into a clock face.
    ctx.strokeStyle = rgba(edge, 1.6)
    ctx.lineWidth = 1
    for (let m = 0; m < 12; m++) {
      const a = (m / 12) * TWO_PI - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer)
      ctx.stroke()
    }

    /*
     * Four months around the outside, and the span in the middle.
     *
     * Without them the object is a beautiful abstraction: a reader can
     * see that something happens twice a year and has no way to learn
     * when. Four is enough to orient by and few enough not to turn the
     * ring into a dial.
     */
    ctx.font = MONO
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = rgba(varColor('--ink-tertiary'))
    const short = months()
    QUARTERS.forEach((month, q) => {
      const a = (q / 4) * TWO_PI - Math.PI / 2
      ctx.fillText(short[month], cx + Math.cos(a) * (outer + 13), cy + Math.sin(a) * (outer + 13))
    })

    cacheMode = mode
  }

  /**
   * One frame: the cached rings, wiped in clockwise from January.
   *
   * The centre is left to the caller's readout rather than stamped into
   * the cache, so hovering can change it without repainting ten thousand
   * segments.
   */
  function draw(progress: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const side = width / dpr
    if (cacheMode !== mode || cache.width !== width) paint()

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, side, side)
    ctx.save()
    if (progress < 1) {
      const { cx, cy, outer } = geometry()
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, outer + 30, -Math.PI / 2, -Math.PI / 2 + TWO_PI * progress)
      ctx.closePath()
      ctx.clip()
    }
    ctx.drawImage(cache, 0, 0, side, side)
    ctx.restore()

    centre(null)
  }

  /** The hole, which is where the readout lives. */
  function centre(text: string | null): void {
    const { cx, cy, inner } = geometry()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, inner - 1, 0, TWO_PI)
    ctx.clip()
    ctx.clearRect(cx - inner, cy - inner, inner * 2, inner * 2)
    ctx.restore()

    ctx.font = MONO
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (text) {
      const [when, count] = text.split(' \u00b7 ')
      ctx.fillStyle = rgba(varColor('--ink-tertiary'))
      ctx.fillText(when, cx, cy - 8)
      ctx.fillStyle = rgba(varColor('--ember'))
      ctx.fillText(count, cx, cy + 8)
    } else {
      ctx.fillStyle = rgba(varColor('--ink-muted'))
      ctx.fillText(`${years[0]}\u2013${years[years.length - 1]}`, cx, cy)
    }
  }

  function step(now: number): void {
    const t = Math.min(1, (now - started) / SWEEP_MS)
    draw(t * t * (3 - 2 * t))
    if (t < 1) raf = requestAnimationFrame(step)
  }

  function replay(): void {
    if (still.matches) {
      draw(1)
      return
    }
    cancelAnimationFrame(raf)
    started = performance.now()
    raf = requestAnimationFrame(step)
  }

  /** Which day the cursor is over, read back out of the geometry. */
  function onMove(e: PointerEvent): void {
    if (!onProbe) return
    const box = canvas.getBoundingClientRect()
    const { cx, cy, inner, ring } = geometry()
    const x = e.clientX - box.left - cx
    const y = e.clientY - box.top - cy
    const r = Math.hypot(x, y)
    const yi = Math.floor((r - inner) / ring)
    if (yi < 0 || yi >= years.length) {
      centre(null)
      onProbe(null)
      return
    }
    const year = years[yi]
    const days = series(year)
    const angle = (Math.atan2(y, x) + Math.PI / 2 + TWO_PI) % TWO_PI
    const d = Math.min(days.length - 1, Math.floor((angle / TWO_PI) * days.length))
    const when = new Date(Date.UTC(year, 0, 1 + d))
    const text = `${when.toISOString().slice(0, 10)} · ${Math.round(days[d] ?? 0).toLocaleString()}`
    centre(text)
    onProbe(text)
  }

  const observer = new ResizeObserver(() => resize())
  if (canvas.parentElement) observer.observe(canvas.parentElement)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', () => {
    centre(null)
    onProbe?.(null)
  })

  resize()
  replay()

  return {
    setMode(next) {
      if (next === mode) return
      mode = next
      cacheMode = null
      replay()
    },
    retheme() {
      cacheMode = null
      draw(1)
    },
    destroy() {
      cancelAnimationFrame(raf)
      observer.disconnect()
      canvas.removeEventListener('pointermove', onMove)
    },
  }
}
