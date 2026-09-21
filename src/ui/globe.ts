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
import { heat, heatScale, rgba, varColor, type Rgb } from './paint'

export interface GlobeFire {
  lat: number
  lon: number
  /** Probability, 0 to 1. */
  p: number
}

export interface GlobePick {
  lat: number
  lon: number
  p: number
}

export interface GlobeHandle {
  setFires(fires: GlobeFire[]): void
  /**
   * Turn the planet until a point faces the reader, close in on it, and
   * ring the fire there if the globe is holding one.
   */
  flyTo(lat: number, lon: number, zoom?: number): void
  /** Back to the whole sphere, turning by itself again. */
  reset(): void
  retheme(): void
  destroy(): void
}

export interface GlobeOptions {
  /** Called with the nearest fire when the reader clicks one. */
  onPick?: (pick: GlobePick | null) => void
}

/**
 * A turn every ninety seconds: present, and never the thing you watch.
 *
 * It drifts west, which is not the way the Earth turns. Eastward was tried
 * — it is the honest direction, and a point at a fixed longitude moves
 * right only while the meridian under the middle of the disc moves west —
 * and it was worse to look at here, because the eye reads the continents
 * coming from the right and Africa, which is where next week's fires are,
 * spent most of the cycle leaving rather than arriving. The drag still
 * follows the cursor either way; that one is not a preference.
 */
const SPIN = (Math.PI * 2) / 90_000
const TILT = 0.38 // radians, so the north is a little toward us
const MAX_DPR = 1.75

/** Long enough to read as travel, short enough not to be a wait. */
const FLY_MS = 950

/** The shorter way round a circle, so a flight never takes the long way. */
function shortest(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

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

export function mountGlobe(
  canvas: HTMLCanvasElement,
  land: LandMask,
  options: GlobeOptions = {},
): GlobeHandle {
  const ctx = canvas.getContext('2d', { alpha: true })!

  /*
   * Two layers rather than one buffer.
   *
   * The ocean and its halo used to be baked into the same ImageData the
   * land and fires were written into, which was cheap while the globe
   * never changed size: build it once, memcpy it each frame. Zooming
   * breaks that — the disc's radius changes, so the baked ocean would
   * have to be rebuilt every frame, a quarter of a million pixels at
   * sixty frames a second.
   *
   * So the ocean is now ordinary canvas drawing, which scales for free,
   * and the land and fires go into a transparent layer of their own that
   * is composited over it. One `drawImage` a frame, and the zoom costs
   * nothing.
   */
  const layer = document.createElement('canvas')
  const layerCtx = layer.getContext('2d', { alpha: true })!
  let pixels: ImageData | null = null

  let width = 0
  let height = 0
  let radius = 0
  let dot = 1

  /** 1 is the whole sphere; larger closes in on whatever faces us. */
  let zoom = 1
  let flight:
    | { lon: number; lat: number; zoom: number; lon0: number; lat0: number; zoom0: number; from: number }
    | null = null

  let lon0 = -0.35 // start over Africa, where next week's fires are
  let lat0 = TILT
  let spinning = true
  let dragging = false
  let lastX = 0
  let lastY = 0

  /*
   * How far the pointer went between pressing and letting go.
   *
   * A browser sends `click` after any press-and-release, including the
   * one that just spun the planet half a turn — so without this, letting
   * go of a drag picked whatever fire happened to be under the cursor at
   * the end of it. Anything past a few pixels was a drag and is not an
   * attempt to press a point.
   */
  let downAt: { x: number; y: number } | null = null
  let travelled = 0
  let raf = 0
  let last = performance.now()
  let onScreen = true

  const still = window.matchMedia('(prefers-reduced-motion: reduce)')

  let landPoints: Point[] = []
  let fires: Fire[] = []

  /** The one that was pressed, ringed so the reader can see the choice. */
  let marked: Fire | null = null
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
   * Ocean and air, drawn rather than baked.
   *
   * A radial gradient from the middle of the disc to its limb does what
   * the per-pixel shading did, in one fill, and it follows the radius
   * wherever the zoom puts it. The halo outside is a second gradient,
   * thin, and the only glow anywhere on this site — a planet does have an
   * atmosphere.
   */
  function drawOcean(cx: number, cy: number, r: number): void {
    /*
     * How hard the limb darkens depends on what colour the ocean is.
     *
     * Multiplying toward black is what a sphere does to light, and against
     * the night theme's near-black ocean it reads as exactly that. Against
     * the day theme's near-white one the same multiplication turns the rim
     * into a mid grey and the planet becomes a smudge on paper. A light
     * ocean gets a fraction of the shading.
     */
    const bright = (ocean[0] * 0.299 + ocean[1] * 0.587 + ocean[2] * 0.114) / 255
    const depth = bright > 0.5 ? 0.15 : 0.55
    const edge: Rgb = [
      ocean[0] * (1 - depth),
      ocean[1] * (1 - depth),
      ocean[2] * (1 - depth),
      1,
    ]

    /*
     * The air first, the ocean over it.
     *
     * A radial gradient that starts at radius r still paints everything
     * inside r with its first stop, so filling a disc of r+16 with the
     * halo washed thirty per cent of ember across the whole planet and
     * turned it pink. Painting the halo first and dropping the opaque
     * ocean on top leaves only the ring outside the sphere showing, which
     * is the part that was ever wanted.
     */
    const air = ctx.createRadialGradient(cx, cy, r, cx, cy, r + 16)
    air.addColorStop(0, rgba(rim, 0.3))
    air.addColorStop(1, rgba(rim, 0))
    ctx.beginPath()
    ctx.arc(cx, cy, r + 16, 0, Math.PI * 2)
    ctx.fillStyle = air
    ctx.fill()

    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    fill.addColorStop(0, rgba(ocean))
    fill.addColorStop(0.7, rgba(ocean))
    fill.addColorStop(1, rgba(edge))
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
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

    layer.width = width
    layer.height = height
    pixels = layerCtx.createImageData(width, height)

    readTheme()
    buildLand()
  }

  function draw(now: number): void {
    if (!onScreen) {
      raf = 0
      return
    }
    raf = requestAnimationFrame(draw)
    const dt = Math.min(now - last, 60)
    last = now

    /*
     * A flight takes the wheel from the idle spin.
     *
     * Easing the central meridian toward the target rather than jumping
     * keeps the reader's place on the sphere: they can see which way the
     * planet turned and therefore where they have arrived. A jump would
     * be the same picture with the context thrown away.
     */
    if (flight) {
      const t = Math.min(1, (now - flight.from) / FLY_MS)
      const e = t * t * (3 - 2 * t)
      lon0 = flight.lon0 + shortest(flight.lon0, flight.lon) * e
      lat0 = flight.lat0 + (flight.lat - flight.lat0) * e
      zoom = flight.zoom0 + (flight.zoom - flight.zoom0) * e
      if (t >= 1) flight = null
    } else if (spinning && !dragging && !still.matches && zoom <= 1.01) {
      lon0 += SPIN * dt
    }

    if (!pixels || radius <= 0) return

    const cx = width / 2
    const cy = height / 2
    const r = radius * zoom

    // ---- the ocean and its air, straight onto the canvas -----------------
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, Math.min(radius + 16, r + 16), 0, Math.PI * 2)
    ctx.clip()
    drawOcean(cx, cy, r)
    ctx.restore()

    const data = pixels.data
    data.fill(0)

    const sinLat0 = Math.sin(lat0)
    const cosLat0 = Math.cos(lat0)
    const sinLon0 = Math.sin(lon0)
    const cosLon0 = Math.cos(lon0)

    // ---- the continents, one pixel each, dimming toward the limb ----------
    for (const p of landPoints) {
      const { cosC, x, y } = project(p, sinLat0, cosLat0, sinLon0, cosLon0)
      if (cosC <= 0.02) continue
      const px = (cx + x * r) | 0
      const py = (cy - y * r) | 0
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
      const px = (cx + x * r) | 0
      const py = (cy - y * r) | 0
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

    /*
     * The land and the fires are pixels; the ocean under them is not.
     * `putImageData` would replace what is underneath rather than sit on
     * it, so the pixel layer goes to its own canvas and is composited.
     */
    /*
     * The chosen point, ringed.
     *
     * Without it a reader who felt they had pressed the wrong fire had no
     * way to check, because the card only shows numbers and one patch of
     * savanna looks much like the next. A ring turns "it picked something
     * odd" into "it picked that one", which is answerable.
     */
    if (marked) {
      const { cosC, x, y } = project(marked, sinLat0, cosLat0, sinLon0, cosLon0)
      const mx = cx + x * r
      const my = cy - y * r
      /*
       * Facing the reader is not the same as being on the disc.
       *
       * `cosC` only says the point is on the near side of the sphere. Once
       * a flight has closed in, the near side is wider than the disc — `r`
       * is the zoomed radius and the disc is still `radius` — so a point
       * near the limb projects past the edge, and the ring was drawn on
       * the black beside the planet, circling nothing. The fire it marks
       * is clipped away at that point too, so there is nothing to ring.
       */
      const onDisc = Math.hypot(mx - cx, my - cy) <= radius
      if (cosC > 0.02 && onDisc) {
        ctx.save()
        ctx.strokeStyle = rgba(varColor('--ink-primary'), 0.85)
        ctx.lineWidth = Math.max(1.2, width / 420)
        ctx.beginPath()
        ctx.arc(mx, my, Math.max(7, width / 52), 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }

    /*
     * Clipped to the disc, not to the sphere.
     *
     * `r` is the sphere's radius after the zoom, and once a flight closes
     * in it is larger than the canvas — so clipping the land and fires to
     * it clipped them to nothing, and Borneo came apart across the corners
     * of the square while the ocean stayed politely inside its circle. The
     * disc is what the reader sees a planet as; the zoom magnifies what is
     * inside it and must not change its edge.
     */
    layerCtx.putImageData(pixels, 0, 0)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, Math.min(radius, r), 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
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
    flight = null
    lastX = e.clientX
    lastY = e.clientY
    downAt = { x: e.clientX, y: e.clientY }
    travelled = 0
    canvas.style.cursor = 'grabbing'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function onMove(e: PointerEvent): void {
    if (!dragging) return
    const scale = 0.005
    // Both signs are set so the ground follows the cursor: drag right and
    // the surface goes right, as though it were being pushed. Adding the
    // delta to the central meridian moves the surface the other way, which
    // is the same gesture running in reverse.
    travelled += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY)
    lon0 -= (e.clientX - lastX) * scale
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

  /**
   * The fire nearest the click, if one is close enough to have been meant.
   *
   * Everything is projected anyway on the frame the click lands in, so
   * this repeats that arithmetic rather than caching screen positions
   * that would be stale the moment the planet turned. Twenty-five
   * thousand multiplications to answer a click is nothing.
   */
  function pickAt(clientX: number, clientY: number): GlobePick | null {
    const box = canvas.getBoundingClientRect()
    const scale = width / box.width
    const px = (clientX - box.left) * scale
    const py = (clientY - box.top) * scale
    const cx = width / 2
    const cy = height / 2
    const r = radius * zoom

    const sinLat0 = Math.sin(lat0)
    const cosLat0 = Math.cos(lat0)
    const sinLon0 = Math.sin(lon0)
    const cosLon0 = Math.cos(lon0)

    /*
     * Nearest wins, and brightness only settles a tie.
     *
     * The first version let a brighter fire beat a nearer one within
     * twenty per cent, which sounds generous and is why the wrong point
     * kept being chosen: in a dense cluster almost everything is within
     * twenty per cent of everything else, so the brightest in the
     * neighbourhood won regardless of where the reader had aimed.
     *
     * Now distance decides outright, and probability is consulted only
     * when two points are within a pixel of each other — which does
     * happen, because at this scale several quarter-degree cells land on
     * the same pixel and the reader cannot have meant one over another.
     */
    const reach = (14 * width) / 460
    let best: Fire | null = null
    let bestD = Infinity

    for (const f of fires) {
      const { cosC, x, y } = project(f, sinLat0, cosLat0, sinLon0, cosLon0)
      if (cosC <= 0.02) continue
      const d = Math.hypot(cx + x * r - px, cy - y * r - py)
      if (d > reach) continue
      if (d < bestD - 1 || (Math.abs(d - bestD) <= 1 && best !== null && f.p > best.p)) {
        bestD = Math.min(bestD, d)
        best = f
      }
    }
    if (!best) return null
    marked = best
    return {
      lat: (Math.asin(best.sinLat) * 180) / Math.PI,
      lon: (Math.atan2(best.sinLon, best.cosLon) * 180) / Math.PI,
      p: best.p,
    }
  }

  function onClick(e: PointerEvent): void {
    if (!options.onPick) return
    // Anything that travelled was a drag; the click that ends it is the
    // browser's, not the reader's.
    if (travelled > 6) return
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return

    const pick = pickAt(e.clientX, e.clientY)
    if (!pick) {
      marked = null
      return
    }
    options.onPick(pick)
    fly(pick.lat, pick.lon, 2.2)
  }

  /**
   * The stored fire nearest a place, or none if nothing is near.
   *
   * Needed because the page sometimes chooses the place itself — the
   * project's page opens on the week's likeliest cell rather than on an
   * empty frame — and the ring has to land on a fire the globe actually
   * holds. Ringing a bare coordinate would put the circle beside the glow
   * instead of on it.
   *
   * Compared as a dot product of the two unit vectors, which is the same
   * arithmetic the projection already does and needs no trigonometry: the
   * larger the cosine, the closer the point.
   */
  function nearestTo(lat: number, lon: number): Fire | null {
    const t = pointOf(lat, lon)
    let best: Fire | null = null
    let bestCos = Math.cos((1.5 * Math.PI) / 180) // no further than a degree and a half
    for (const f of fires) {
      const cosD = f.cosLon * t.cosLon + f.sinLon * t.sinLon
      const c = f.sinLat * t.sinLat + f.cosLat * t.cosLat * cosD
      if (c > bestCos) {
        bestCos = c
        best = f
      }
    }
    return best
  }

  function fly(lat: number, lon: number, to: number): void {
    flight = {
      /*
       * East is positive here, and it was negated.
       *
       * `lon0` is the longitude of the meridian down the middle of the
       * disc — that is what `cos(lon - lon0)` in the projection makes it —
       * so flying to a place means easing `lon0` toward that place's own
       * longitude. The sign flip sent every flight to the mirror image of
       * its target: pressing a fire on Borneo turned the planet to the
       * empty Pacific at the same latitude, which looked like the globe
       * had simply failed to find anything rather than like a wrong turn.
       */
      lon: (lon * Math.PI) / 180,
      lat: (lat * Math.PI) / 180,
      zoom: to,
      lon0,
      lat0,
      zoom0: zoom,
      from: performance.now(),
    }
    if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(draw)
    }
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
  canvas.addEventListener('click', onClick as EventListener)

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
    flyTo(lat: number, lon: number, to = 2.4): void {
      // Flying somewhere is the page saying "this place", so it gets the
      // same ring a reader's own press would get.
      marked = nearestTo(lat, lon) ?? marked
      fly(lat, lon, to)
    },
    reset(): void {
      marked = null
      flight = {
        lon: lon0,
        lat: TILT,
        zoom: 1,
        lon0,
        lat0,
        zoom0: zoom,
        from: performance.now(),
      }
    },
    retheme(): void {
      readTheme()
    },
    destroy(): void {
      cancelAnimationFrame(raf)
      observer.disconnect()
      watcher.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('click', onClick as EventListener)
      onUp()
    },
  }
}
