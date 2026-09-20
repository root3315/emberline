/**
 * The planet, turning, with next week's fires burning on it.
 *
 * ── Why this is drawn by hand ─────────────────────────────────────────────
 *
 * A globe is the one view that says "this is everywhere at once" without a
 * caption, and a flat map never quite does: Mercator makes Siberia the size
 * of Africa and puts the fires that matter most at the bottom of the frame.
 * But a WebGL globe library is half a megabyte and arrives with its own
 * lighting, its own texture of somebody's Earth, its own idea of how a
 * planet should look. None of that belongs to this site.
 *
 * So it is an orthographic projection into a pixel buffer, about two hundred
 * lines, made of the same square cells as every other picture here: land
 * where the half-degree mask says land, and light where the model expects
 * fire. Nothing is smoothed and nothing is invented.
 *
 * ── Why a pixel buffer ────────────────────────────────────────────────────
 *
 * Ninety thousand land cells and forty thousand forecast cells, half of each
 * facing us, is sixty thousand marks a frame. As canvas calls that is a
 * slideshow; as writes into an ImageData it is a few milliseconds. The ocean
 * and the atmosphere never change, so they are rendered once and copied in
 * with a memcpy at the top of each frame.
 *
 * ── The projection, without trigonometry in the loop ──────────────────────
 *
 *   cos c = sin φ₀ sin φ + cos φ₀ cos φ cos(λ − λ₀)
 *
 * Every term that depends only on the cell — sin φ, cos φ, sin λ, cos λ —
 * is computed once when the points are built. Inside the frame there is
 * nothing left but multiplication, which is what makes sixty thousand of
 * them affordable at sixty frames a second.
 */

import { isLand, type LandMask } from '../core/land'
import { heat, heatScale, varColor, type Rgb } from './paint'

export interface GlobeFire {
  lat: number
  lon: number
  /** Probability, 0 to 1. */
  p: number
}

export interface GlobeHandle {
  setFires(fires: GlobeFire[]): void
  retheme(): void
  destroy(): void
}

/** A turn every ninety seconds: present, and never the thing you watch. */
const SPIN = (Math.PI * 2) / 90_000
const TILT = 0.38 // radians, so the north is a little toward us
const MAX_DPR = 1.75

interface Point {
  sinLat: number
  cosLat: number
  sinLon: number
  cosLon: number
}

interface Fire extends Point {
  p: number
  phase: number
}

function project(p: Point, sinLat0: number, cosLat0: number, sinLon0: number, cosLon0: number) {
  // cos(λ − λ₀) and sin(λ − λ₀) from the angle-difference identities, so the
  // loop never calls Math.cos.
  const cosD = p.cosLon * cosLon0 + p.sinLon * sinLon0
  const sinD = p.sinLon * cosLon0 - p.cosLon * sinLon0
  const cosC = sinLat0 * p.sinLat + cosLat0 * p.cosLat * cosD
  const x = p.cosLat * sinD
  const y = cosLat0 * p.sinLat - sinLat0 * p.cosLat * cosD
  return { cosC, x, y }
}

export function mountGlobe(canvas: HTMLCanvasElement, land: LandMask): GlobeHandle {
  const ctx = canvas.getContext('2d', { alpha: true })!
  let width = 0
  let height = 0
  let radius = 0
  let dot = 1
  let base: ImageData | null = null
  let frame: ImageData | null = null

  let lon0 = -0.35 // start over Africa, where next week's fires are
  let lat0 = TILT
  let spinning = true
  let dragging = false
  let lastX = 0
  let lastY = 0
  let raf = 0
  let last = performance.now()
  let onScreen = true

  const still = window.matchMedia('(prefers-reduced-motion: reduce)')

  let landPoints: Point[] = []
  let fires: Fire[] = []
  let inkLand: Rgb = [255, 255, 255, 1]
  let ocean: Rgb = [0, 0, 0, 1]
  let rim: Rgb = [255, 255, 255, 1]

  function pointOf(lat: number, lon: number): Point {
    const a = (lat * Math.PI) / 180
    const b = (lon * Math.PI) / 180
    return { sinLat: Math.sin(a), cosLat: Math.cos(a), sinLon: Math.sin(b), cosLon: Math.cos(b) }
  }

  /**
   * The land, thinned to what the globe can show.
   *
   * At half a degree the equator carries seven hundred and twenty cells, and
   * on a four-hundred-pixel globe those are closer together than the pixels.
   * So the grid is walked with a stride.
   *
   * ── Why the stride changes with latitude ──────────────────────────────
   *
   * A lat/lon grid crowds toward the poles: at sixty degrees north the
   * meridians are half as far apart as at the equator, and at eighty they
   * are a sixth. Sampling it evenly drew Siberia as a dense corduroy of
   * moire stripes while the tropics stayed sparse — the pattern of the grid
   * rather than the shape of the land. Dividing the longitude step by the
   * cosine of the latitude keeps the dots roughly the same distance apart
   * on the sphere, which is what the eye is reading them as.
   */
  function buildLand(): void {
    const base = radius > 260 ? 1 : radius > 150 ? 2 : 3
    const out: Point[] = []
    for (let row = 0; row < land.rows; row += base) {
      const lat = -90 + (row + 0.5) * land.degrees
      const shrink = Math.max(0.12, Math.cos((lat * Math.PI) / 180))
      const step = Math.max(base, Math.round(base / shrink))

      /*
       * Each row starts at a different offset.
       *
       * Rows that all begin at zero put their dots on the same meridians,
       * and near the pole — where the step is six cells wide and the rows
       * converge — those meridians read as spokes and rings across the
       * Arctic. An offset that walks with the row scatters them into a
       * stipple, which is what the rest of the globe already looks like.
       */
      const offset = (row * 3) % step
      for (let col = offset; col < land.cols; col += step) {
        // Only the cell actually sampled. Asking whether anything in the
        // skipped span is land sounds generous and is not: at eighty north
        // the span is six cells, so one Arctic island painted a dot for a
        // thousand kilometres of open water, and the cap grew a crust of
        // land that is not there.
        if (!isLand(land, row, col)) continue
        out.push(pointOf(lat, -180 + (col + 0.5) * land.degrees))
      }
    }
    landPoints = out
  }

  function readTheme(): void {
    inkLand = varColor('--ink-muted')
    ocean = varColor('--ash-base')
    rim = varColor('--ember')
  }

  /**
   * Ocean and air, rendered once.
   *
   * The disc darkens toward its edge because a sphere does, and a ring of
   * ember sits just outside it — thin, and the only place on the page where
   * a glow is allowed, because a planet does have an atmosphere.
   */
  function buildBase(): void {
    if (width <= 0 || height <= 0) return
    base = ctx.createImageData(width, height)
    const data = base.data
    const cx = width / 2
    const cy = height / 2

    for (let y = 0; y < height; y++) {
      const dy = y - cy
      for (let x = 0; x < width; x++) {
        const dx = x - cx
        const d = Math.hypot(dx, dy)
        const i = (y * width + x) * 4
        if (d <= radius) {
          // Limb darkening: the edge of a sphere turns away from us.
          const t = d / radius
          const shade = 1 - 0.55 * t * t
          data[i] = ocean[0] * shade
          data[i + 1] = ocean[1] * shade
          data[i + 2] = ocean[2] * shade
          data[i + 3] = 255
        } else if (d < radius + 14) {
          const fall = 1 - (d - radius) / 14
          const a = fall * fall * 70
          data[i] = rim[0]
          data[i + 1] = rim[1]
          data[i + 2] = rim[2]
          data[i + 3] = a
        }
      }
    }
    frame = ctx.createImageData(width, height)
  }

  function resize(): void {
    const box = canvas.parentElement?.getBoundingClientRect()
    const cssW = Math.max(160, Math.round(box?.width ?? 320))
    const cssH = Math.max(160, Math.round(box?.height ?? cssW))
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)

    width = Math.round(cssW * dpr)
    height = Math.round(cssH * dpr)
    canvas.width = width
    canvas.height = height
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    radius = Math.min(width, height) / 2 - 16 * dpr
    // One device pixel is half a CSS pixel on a retina screen, and the
    // continents came out as a grey haze rather than a stipple.
    dot = dpr > 1.3 ? 2 : 1

    readTheme()
    buildLand()
    buildBase()
  }

  function draw(now: number): void {
    if (!onScreen) {
      raf = 0
      return
    }
    raf = requestAnimationFrame(draw)
    const dt = Math.min(now - last, 60)
    last = now
    if (spinning && !dragging && !still.matches) lon0 += SPIN * dt
    if (!base || !frame || radius <= 0) return

    frame.data.set(base.data)
    const data = frame.data
    const cx = width / 2
    const cy = height / 2

    const sinLat0 = Math.sin(lat0)
    const cosLat0 = Math.cos(lat0)
    const sinLon0 = Math.sin(lon0)
    const cosLon0 = Math.cos(lon0)

    // ---- the continents, one pixel each, dimming toward the limb ----------
    for (const p of landPoints) {
      const { cosC, x, y } = project(p, sinLat0, cosLat0, sinLon0, cosLon0)
      if (cosC <= 0.02) continue
      const px = (cx + x * radius) | 0
      const py = (cy - y * radius) | 0
      if (px < 0 || py < 0 || px + dot >= width || py + dot >= height) continue
      const a = 0.35 + 0.65 * cosC
      for (let oy = 0; oy < dot; oy++) {
        for (let ox = 0; ox < dot; ox++) {
          const i = ((py + oy) * width + px + ox) * 4
          data[i] = inkLand[0] * a
          data[i + 1] = inkLand[1] * a
          data[i + 2] = inkLand[2] * a
          data[i + 3] = 255
        }
      }
    }

    // ---- and the fires, which flicker ------------------------------------
    const beat = now / 1000
    for (const f of fires) {
      const { cosC, x, y } = project(f, sinLat0, cosLat0, sinLon0, cosLon0)
      if (cosC <= 0.02) continue
      const px = (cx + x * radius) | 0
      const py = (cy - y * radius) | 0
      if (px < 1 || py < 1 || px >= width - 1 || py >= height - 1) continue

      /*
       * The flicker is the one liberty taken with the data.
       *
       * These are weekly probabilities and nothing about them pulses. But a
       * still field of dots reads as a texture, and a field that breathes
       * reads as something happening — which is the honest impression, since
       * fire is what the dots are about. Each has its own phase so the
       * planet never blinks in unison, which would look like a fault.
       */
      const pulse = 0.72 + 0.28 * Math.sin(beat * 2.1 + f.phase)
      const glow = heat(heatScale(f.p, 1, 0.55))
      const a = Math.min(1, f.p * pulse * cosC * 1.5)

      paint(data, px, py, glow, a)
      if (f.p > 0.55) {
        // Only the strongest spill into their neighbours, or the planet
        // turns into one bright smear.
        const spill = a * 0.3
        paint(data, px + 1, py, glow, spill)
        paint(data, px - 1, py, glow, spill)
        paint(data, px, py + 1, glow, spill)
        paint(data, px, py - 1, glow, spill)
      }
    }

    ctx.putImageData(frame, 0, 0)
  }

  /** Screen blending, so overlapping fires build up rather than replace. */
  function paint(data: Uint8ClampedArray, px: number, py: number, rgb: Rgb, a: number): void {
    const i = (py * width + px) * 4
    data[i] = data[i] + (rgb[0] - data[i]) * a
    data[i + 1] = data[i + 1] + (rgb[1] - data[i + 1]) * a
    data[i + 2] = data[i + 2] + (rgb[2] - data[i + 2]) * a
    data[i + 3] = 255
  }

  /*
   * ---- turning it by hand ------------------------------------------------
   *
   * The move and release are listened for on the window rather than on the
   * canvas, and no pointer capture is taken.
   *
   * Capture is the usual answer to "the cursor left the element mid-drag",
   * and it half worked: `setPointerCapture` throws when the id is not a
   * pointer the browser has down, and on the ids it does accept Chrome
   * answers a capture it did not want with `pointercancel` — which landed
   * on the release handler and ended the drag on its first frame. Window
   * listeners solve the same problem without asking the browser for
   * anything, and they are removed the moment the button comes up.
   */
  function onDown(e: PointerEvent): void {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.style.cursor = 'grabbing'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function onMove(e: PointerEvent): void {
    if (!dragging) return
    const scale = 0.005
    lon0 += (e.clientX - lastX) * scale
    lat0 = Math.max(-1.2, Math.min(1.2, lat0 + (e.clientY - lastY) * scale))
    lastX = e.clientX
    lastY = e.clientY
  }

  function onUp(): void {
    dragging = false
    canvas.style.cursor = 'grab'
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }

  const observer = new ResizeObserver(() => resize())
  if (canvas.parentElement) observer.observe(canvas.parentElement)

  /*
   * A planet nobody is looking at should not be costing anyone a frame.
   *
   * There are two of these now — one at the foot of the record and one on
   * the forecast page — and the record's page is already drawing a ribbon,
   * three charts and a Leaflet map. Whichever globe is scrolled away stops
   * entirely rather than turning into a heater.
   */
  const watcher = new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting)
      if (onScreen && !raf) {
        last = performance.now()
        raf = requestAnimationFrame(draw)
      }
    },
    { rootMargin: '120px' },
  )
  watcher.observe(canvas)

  canvas.style.cursor = 'grab'
  canvas.style.touchAction = 'pan-y'
  canvas.addEventListener('pointerdown', onDown)

  resize()
  raf = requestAnimationFrame(draw)

  return {
    setFires(next: GlobeFire[]): void {
      fires = next.map((f, i) => ({
        ...pointOf(f.lat, f.lon),
        p: f.p,
        // A cheap scatter: consecutive cells must not share a phase, or
        // whole regions would pulse together like a signal.
        phase: (i * 2.399963) % (Math.PI * 2),
      }))
    },
    retheme(): void {
      readTheme()
      buildBase()
    },
    destroy(): void {
      cancelAnimationFrame(raf)
      observer.disconnect()
      watcher.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      onUp()
    },
  }
}
