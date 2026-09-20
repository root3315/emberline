/**
 * Theme transition.
 *
 * Two effects, one per direction, because the two directions mean opposite
 * things. Going to night the page is *burned* away: a line of fire climbs it
 * from the bottom edge. Going to day the page is *cleaned*: a yellow sponge
 * works across it in diagonal strokes, lifting a film of grime off as it goes.
 *
 * Both work the same way underneath. The browser hands us a snapshot of the
 * outgoing page — `startViewTransition` freezes it as `::view-transition-old`,
 * the new one paints beneath as `::view-transition-new` — and we animate a
 * `clip-path` on the old snapshot so it is eaten away along a moving edge. The
 * content is therefore live and readable on both sides of that edge the whole
 * time; nothing is hidden behind a slab of colour.
 *
 * The fire below is the committed one, restored unchanged.
 */

export type ThemeName = 'night' | 'day'

/**
 * Burn-away transition between themes.
 *
 * A line of fire climbs the page. Below it the interface is already in the new
 * theme, above it still in the old one, and the content stays readable on both
 * sides — nothing is covered by a slab of colour.
 *
 * That is only possible because the browser hands us a snapshot of the outgoing
 * page: `startViewTransition` freezes the old frame as `::view-transition-old`,
 * the new one paints underneath as `::view-transition-new`, and we clip the old
 * snapshot away from the bottom up. An earlier attempt painted a solid overlay
 * in the outgoing background colour and burned that — it looked like fire, but
 * it hid the page, which is exactly what the effect should not do.
 *
 * The torn edge is a sum of three sine waves rather than a noise field: the
 * clip path only needs a few dozen points, and animating those on the compositor
 * is far cheaper than recomputing a pixel mask every frame.
 */

/**
 * Burn-away transition between themes.
 *
 * A line of fire climbs the page. Below it the interface is already in the new
 * theme, above it still in the old one, and the content stays readable on both
 * sides — nothing is covered by a slab of colour.
 *
 * That is only possible because the browser hands us a snapshot of the outgoing
 * page: `startViewTransition` freezes the old frame as `::view-transition-old`,
 * the new one paints underneath as `::view-transition-new`, and we clip the old
 * snapshot away from the bottom up. An earlier attempt painted a solid overlay
 * in the outgoing background colour and burned that — it looked like fire, but
 * it hid the page, which is exactly what the effect should not do.
 *
 * The torn edge is a sum of three sine waves rather than a noise field: the
 * clip path only needs a few dozen points, and animating those on the compositor
 * is far cheaper than recomputing a pixel mask every frame.
 */

/*
 * Fire has its own colours, deliberately not the theme's ramp. The data ramp
 * flips with the theme — its hot end is near-white at night and deep red on
 * paper — so borrowing it made the flame vanish against a light background. A
 * flame looks like a flame regardless of what it is burning.
 */
const FLAME = {
  halo: 'rgba(255, 96, 24, 0.55)',
  warm: 'rgba(255, 142, 40, 0.92)',
  bright: 'rgba(255, 198, 96, 1)',
  core: 'rgba(255, 244, 214, 1)',
  scorch: 'rgba(12, 7, 4, 0.62)',
}

/** Ember colour by remaining life: white-hot, to orange, to a dull red coal. */
function emberColour(life: number): string {
  if (life > 0.72) return 'rgba(255, 236, 190, ' + life + ')'
  if (life > 0.4) return 'rgba(255, 158, 54, ' + life + ')'
  return 'rgba(214, 74, 22, ' + life + ')'
}


/**
 * How long the fire takes to climb one screenful.
 *
 * It is a speed, not a run time: the burn ends when it has passed above the top
 * of what the reader can see, so scrolling up hands it more page and the whole
 * thing lasts longer. Slower than it looks like it should be on paper — much
 * under two seconds a screen and the eye reads it as a wipe.
 */
const DURATION_MS = 2600
/** Vertical swing of the torn edge, as a fraction of the window's height. */
const AMPLITUDE = 0.055
/**
 * Points along the edge. Enough to carry the fine octaves without aliasing —
 * at the original fifty-six the two added below turned into a jitter instead
 * of a fray. Every one of them is also a vertex in four blurred strokes a
 * frame, so this is as far as it goes.
 */
const SEGMENTS = 132
/** Key frames handed to the compositor for the clip animation. */
const EMBER_LIMIT = 120

interface Wave {
  freq: number
  phase: number
  amp: number
  /**
   * Radians this octave turns over the whole climb. Modest on the coarse octaves
   * and several times larger on the fine ones, so the silhouette keeps its
   * shape while its fray boils — the edge seethes as it rises instead of
   * sliding up as one rigid curve. The ceiling on it is STEPS: the clip path
   * gets that many samples of this in time, and beyond a fraction of a radian
   * between them the seething would read as stepping.
   */
  drift: number
}

interface Ember {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  size: number
  heat: number
}

/**
 * Five octaves. The first three carry the silhouette; the last two only rough
 * it up, which is the whole difference between a torn edge and a smooth swell.
 * The top one is kept under about a dozen periods across the page — finer than
 * that and it facets against the sampling instead of reading as fray.
 */
function makeWaves(): Wave[] {
  const rand = () => Math.random() * Math.PI * 2
  return [
    { freq: 5.5 + Math.random() * 2.5, phase: rand(), amp: 0.55, drift: 1.4 },
    { freq: 12 + Math.random() * 4, phase: rand(), amp: 0.3, drift: -2.4 },
    { freq: 23 + Math.random() * 7, phase: rand(), amp: 0.15, drift: 4.1 },
    { freq: 49 + Math.random() * 11, phase: rand(), amp: 0.11, drift: -6.3 },
    { freq: 71 + Math.random() * 13, phase: rand(), amp: 0.066, drift: 9.2 },
  ]
}

/**
 * The torn edge's deviation at `x` (0..1), before it is given a scale.
 *
 * `time` is the climb's own progress, and every octave turns a little with it.
 * Without that the whole silhouette is fixed and merely slides up the page,
 * which reads as a shape being dragged rather than as an edge burning.
 */
function wobbleAt(x: number, waves: Wave[], time: number): number {
  let wobble = 0
  for (const w of waves) wobble += Math.sin(x * w.freq + w.phase + time * w.drift) * w.amp
  return wobble
}

/**
 * Key frames handed to the compositor: samples in *time*, not along the edge.
 *
 * Raised with the drift. The compositor interpolates straight lines between
 * these, so the faster the edge seethes the more often it has to be told where
 * it is — otherwise the seething turns into stepping. At the top octave's rate
 * this is a seventh of a radian per frame, well inside what reads as smooth.
 */
const STEPS = 64

/** Fire catches fast, then runs steadily; a slow start reads as a dead click. */
function ignite(t: number): number {
  return 1 - Math.pow(1 - t, 1.5)
}

/**
 * Height of the burn edge at `x` (0..1), as a fraction of viewport height where
 * 0 is the top. Overshoots both ends so the very first and very last slivers
 * also burn through instead of stalling.
 */
function edgeAt(x: number, progress: number, waves: Wave[]): number {
  const base = (1 - progress) * (1 + AMPLITUDE * 3) - AMPLITUDE * 1.5
  return base + wobbleAt(x, waves, progress) * AMPLITUDE
}

/** Polygon covering everything *above* the edge — the part not yet burned. */
function clipAbove(progress: number, waves: Wave[]): string {
  const pts: string[] = ['0% -5%', '100% -5%']
  for (let i = SEGMENTS; i >= 0; i--) {
    const x = i / SEGMENTS
    pts.push((x * 100).toFixed(2) + '% ' + (edgeAt(x, progress, waves) * 100).toFixed(2) + '%')
  }
  return 'polygon(' + pts.join(',') + ')'
}

let running = false

/**
 * Let the transition close.
 *
 * The stylesheet keeps a do-nothing animation running on the outgoing snapshot
 * so the transition cannot end before the effect has started. Finishing it is
 * what ends the transition, and it has to happen however the effect ends —
 * normally, early, or because the canvas could not be had.
 */
/**
 * Holds the page still for the length of the transition.
 *
 * The outgoing theme is a photograph of the window. It cannot scroll, and every
 * way of pretending otherwise turned out worse than the problem: letting it sit
 * still froze the page behind it; shifting it with the scroll turned it into a
 * rectangle visibly sliding over the page, with a seam at its edge and the map
 * showing through from underneath. There is nothing in between, because there
 * is no picture of the rest of the document to show.
 *
 * So the page waits. It is under three seconds, `scrollbar-gutter` is already
 * stable so nothing shifts, and the reader gets an effect with no seams in it
 * rather than a broken one they are free to scroll during.
 */
/**
 * How many holds are outstanding, so the page is only released by the last.
 *
 * Each hold used to snapshot `overflow` and restore that literal value. The
 * `running` guard normally keeps there from being two, but it is cleared by
 * `transition.finished`, and the browser can end a view transition for reasons
 * of its own — the document being hidden, another transition starting — while
 * the canvas loop is still running with the page held. A second transition
 * getting through then captures `'hidden'` as the value to put back, and the
 * page is left unscrollable for the rest of the session with nothing on screen
 * to explain it.
 *
 * Counting makes the pairing correct however many overlap, and the saved value
 * is the one from before any of them.
 */
let holds = 0
let heldOverflow = ''

function holdPage(): () => void {
  const root = document.documentElement
  if (holds === 0) heldOverflow = root.style.overflow
  holds++
  root.style.overflow = 'hidden'

  let released = false
  return () => {
    // Idempotent: a caller that releases twice must not uncount someone else.
    if (released) return
    released = true
    holds--
    if (holds === 0) root.style.overflow = heldOverflow
  }
}

function releaseHold(): void {
  for (const a of document.getAnimations()) {
    const named = a as Animation & { animationName?: string }
    if (named.animationName === 'vt-hold') a.finish()
  }
}
function layer(): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.className = 'burn-layer'
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = w
  canvas.height = h
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  document.body.appendChild(canvas)
  return canvas
}

export function burnTransition(swap: () => void, target: ThemeName = 'night'): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const supported = typeof document.startViewTransition === 'function'

  if (reduced || running || !document.body) {
    swap()
    return
  }
  running = true

  // Burning blackens, so it takes the page to night; the wind clears what is
  // left, so it takes the page back to day.
  const clean = target === 'day'

  const waves = makeWaves()
  // Built before the transition starts. Seven thousand polygon coordinates is
  // milliseconds of string work, and doing it inside `ready.then()` was long
  // enough for the transition to close underneath it.
  const frames: Keyframe[] = Array.from({ length: STEPS + 1 }, (_, i) =>
    clean
      ? { clipPath: clipAshBlocks(i / STEPS, waves, window.innerWidth, window.innerHeight) }
      : { clipPath: clipAbove(ignite(i / STEPS), waves) },
  )
  if (!supported) {
    // No snapshot available: still run the effect, just over the new theme.
    if (clean) paintAsh(waves, null)
    else paintFire(waves, null)
    swap()
    return
  }

  const transition = document.startViewTransition(() => {
    swap()
  })

  transition.ready
    .then(() => {
      const anim = document.documentElement.animate(frames, {
        duration: clean ? ASH_MS : DURATION_MS,
        easing: 'linear',
        pseudoElement: '::view-transition-old(root)',
        fill: 'forwards',
      })

      if (clean) paintAsh(waves, anim)
      else paintFire(waves, anim)
    })
    .catch(() => {
      releaseHold()
      running = false
    })

  transition.finished.finally(() => {
    running = false
  })
}

/**
 * Viewport pixels per cell of the char field. Two, because the fine forking at
 * the edge of a burn is the whole texture and at three it is a staircase.
 */
const CELL = 2
/** Cap on the field width, so a 4K display does not pay 4K's worth of cells. */
const MAX_SIM_W = 620
/** Rows of full heat laid along the front each frame. */
const SEED_ROWS = 2
/** Rows kept below the front, where the paper has just gone. */
const AFTERGLOW = 2
/**
 * How far into the unburned side the char reaches, in cells. Only a band this
 * deep around the edge is stepped or turned into pixels — the rest of the page
 * is untouched paper or already gone, and simulating either is work thrown
 * away. It is the difference between a quarter of a million cells a frame and
 * forty thousand.
 */
const CHAR_BAND = 62

/**
 * Heat 0..255 to RGBA, as one 32-bit word per level, built once.
 *
 * This ramp is charcoal only — no ember in it at all. The glow along the front
 * is drawn as strokes on top, and if the field carried its own hot end the two
 * would fight. What the field is for is the *paper*: heat climbs into the
 * unburned side, so the field is hottest at the edge and cooler the further in
 * it has crept, and running the ramp from deep char at the top of the range out
 * to ash at the bottom puts a black band just inside the line and a ragged grey
 * fringe beyond it. That is what burning paper looks like from above.
 *
 * Writing the field into an ImageData costs one 32-bit store per cell this way
 * instead of four 8-bit ones, and building the words through a byte view of the
 * same buffer keeps that store endian-safe.
 */
function buildCharLut(): Uint32Array {
  const stops: Array<[number, number, number, number, number]> = [
    // heat, r, g, b, alpha
    [0, 0, 0, 0, 0],
    [50, 70, 59, 51, 0.5],
    [140, 32, 22, 16, 0.95],
    [210, 22, 14, 9, 0.98],
    [255, 48, 21, 8, 1],
  ]
  const buf = new ArrayBuffer(256 * 4)
  const b = new Uint8Array(buf)
  let seg = 1
  for (let i = 0; i < 256; i++) {
    while (seg < stops.length - 1 && stops[seg][0] < i) seg++
    const a = stops[seg - 1]
    const z = stops[seg]
    const span = z[0] - a[0] || 1
    const t = Math.min(1, Math.max(0, (i - a[0]) / span))
    const o = i * 4
    b[o] = a[1] + (z[1] - a[1]) * t
    b[o + 1] = a[2] + (z[2] - a[2]) * t
    b[o + 2] = a[3] + (z[3] - a[3]) * t
    // Ease the start of the alpha ramp so the outermost ash dissolves instead
    // of stopping at a visible line of its own.
    const al = a[4] + (z[4] - a[4]) * t
    b[o + 3] = (i < 50 ? Math.pow(i / 50, 1.4) * 0.5 : al) * 255
  }
  return new Uint32Array(buf)
}

let CHAR_LUT: Uint32Array | null = null

/**
 * A page of random bytes, consumed with a rolling index. `Math.random()` twice
 * per cell is most of a millisecond of the frame budget on its own, and a burn
 * does not care whether its noise repeats every eight thousand draws.
 */
const NOISE_N = 8192
let NOISE: Uint8Array | null = null

/** Sideways drift per cell, as a small signed table indexed by a noise byte. */
const SPREAD = new Int8Array([-1, 0, 1, 0, -1, 1, 0, 1])

interface CharField {
  /**
   * Step the field and paint it under everything else. `edge` gives the burn
   * line at `x` (0..1) as a fraction of the canvas height — the caller decides
   * whether that came from a viewport sweep or a line in document space.
   */
  draw(progress: number, edge: (x: number) => number): void
}

/**
 * The char that eats into the paper ahead of the line.
 *
 * A heat field is seeded along the clip edge and propagated *into* the unburned
 * side, each cell taking heat from a random neighbour behind it and losing a
 * random amount on the way. The sideways shove is what forks the char instead
 * of leaving a clean arc; the decay decides how far in each fork gets. Nothing
 * about the shape is authored — it falls out of the rule, which is why it looks
 * like burning and a drawn band does not.
 */
function makeCharField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): CharField | null {
  const fw = Math.max(64, Math.min(MAX_SIM_W, Math.ceil(w / CELL)))
  const fh = Math.max(48, Math.round((fw * h) / w))

  const field = document.createElement('canvas')
  field.width = fw
  field.height = fh
  const fctx = field.getContext('2d')
  if (!fctx) return null
  const img = fctx.createImageData(fw, fh)
  const pix = new Uint32Array(img.data.buffer)

  if (!CHAR_LUT) CHAR_LUT = buildCharLut()
  if (!NOISE) {
    NOISE = new Uint8Array(NOISE_N)
    for (let i = 0; i < NOISE_N; i++) NOISE[i] = (Math.random() * 256) | 0
  }
  const lut = CHAR_LUT
  const noise = NOISE
  let ni = (Math.random() * NOISE_N) | 0

  const heat = new Uint8Array(fw * fh)
  const erow = new Int32Array(fw)
  const cool = new Float32Array(fw)
  // Rows written into the field last frame, so they can be wiped this one.
  let dirtyTop = 0
  let dirtyBot = fh

  return {
    draw(progress: number, edge: (x: number) => number) {
      let minE = fh
      let maxE = 0
      for (let x = 0; x < fw; x++) {
        const e = Math.round(edge(x / (fw - 1)) * fh)
        erow[x] = e
        if (e < minE) minE = e
        if (e > maxE) maxE = e
        // How fast this column gives up its heat, and so how deep the char
        // runs. Per cell the decay is independent noise, which averages into a
        // band of uniform depth; drifting it slowly along the edge is what
        // gives the burn places where it eats in and places where it barely
        // takes.
        cool[x] = Math.max(
          0.42,
          0.92 +
            0.45 * Math.sin(x * 0.031 + progress * 4.3) +
            0.2 * Math.sin(x * 0.087 - progress * 7.9),
        )
      }

      // A wandering draught. A burn line creeping dead straight into the page
      // looks machined; the lean is what makes it look like air is moving.
      const draught = Math.sin(progress * 4.7 + 0.6) * 2.2 + Math.sin(progress * 9.9) * 0.9
      const gust = Math.abs(draught)
      const lean = draught > 0 ? 1 : -1

      for (let x = 0; x < fw; x++) {
        const e = erow[x]
        const bottom = Math.min(fh - 1, e + SEED_ROWS + AFTERGLOW + 10)
        const top = Math.max(0, e - CHAR_BAND)
        for (let y = bottom; y >= top; y--) {
          const at = y * fw + x

          if (y > e + SEED_ROWS + AFTERGLOW) {
            heat[at] = 0 // the paper is gone; the new theme shows through
            continue
          }
          if (y > e + SEED_ROWS) {
            heat[at] = (70 * (1 - (y - e - SEED_ROWS) / AFTERGLOW)) | 0
            continue
          }
          if (y >= e) {
            heat[at] = 255
            continue
          }
          if (y === fh - 1) {
            heat[at] = 0
            continue
          }

          const b = noise[(ni = (ni + 1) & (NOISE_N - 1))]
          let sx = x + SPREAD[b >> 5]
          if ((b & 7) < gust) sx += lean
          if (sx < 0) sx = 0
          else if (sx >= fw) sx = fw - 1
          const v = heat[(y + 1) * fw + sx]
          const decay = (((b & 7) + 2) * cool[x]) | 0
          heat[at] = v > decay ? v - decay : 0
        }
      }

      // Convert only the band, and wipe only what was written last time.
      const top = Math.max(0, minE - CHAR_BAND - 1)
      const bot = Math.min(fh, maxE + SEED_ROWS + AFTERGLOW + 12)
      pix.fill(0, dirtyTop * fw, dirtyBot * fw)
      for (let i = top * fw, n = bot * fw; i < n; i++) pix[i] = lut[heat[i]]
      fctx.clearRect(0, dirtyTop, fw, dirtyBot - dirtyTop)
      fctx.putImageData(img, 0, 0, 0, top, fw, bot - top)
      dirtyTop = top
      dirtyBot = bot

      ctx.drawImage(field, 0, 0, fw, fh, 0, 0, w, h)
    },
  }
}

/**
 * The flame: the charring paper, the line of fire along its edge, and embers.
 *
 * The clip animation on the outgoing snapshot is what actually reveals the new
 * theme; everything here is drawn on a canvas over the top, along exactly the
 * same curve. "Exactly" is load-bearing — the crisp passes walk every point the
 * clip has, because a line that samples the edge more coarsely than the reveal
 * does sits *beside* the boundary rather than on it, by a few pixels in every
 * hollow. Only the two heavily blurred passes are allowed to cut corners.
 *
 * The flame reads its clock off the clip animation rather than off the wall,
 * so the two cannot drift apart on a busy frame.
 */
function paintFire(waves: Wave[], anim: Animation | null): void {
  const canvas = layer()
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    releaseHold()
    running = false
    return
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const embers: Ember[] = []
  const started = performance.now()
  const unfollow = holdPage()
  const char = makeCharField(ctx, w, h)

  const traceEdge = (progress: number, offsetPx: number, steps = SEGMENTS) => {
    ctx.beginPath()
    for (let i = 0; i <= steps; i++) {
      const x = i / steps
      const y = edgeAt(x, progress, waves) * h + offsetPx
      if (i === 0) ctx.moveTo(x * w, y)
      else ctx.lineTo(x * w, y)
    }
  }

  /**
   * How hard the front is burning at `x`, 0..1. A stroke has one alpha from end
   * to end, so a line drawn in a single pass is the same brightness the whole
   * way across — the one thing a line of fire never is. Two slow waves beating
   * against each other give it stretches that run hot and stretches that gutter.
   */
  const heatAlong = (x: number, progress: number) =>
    0.42 +
    0.58 * (0.5 + 0.5 * Math.sin(x * 6.3 + progress * 7.1) * Math.sin(x * 2.1 - progress * 3.3))

  /** The bright passes, laid down span by span so they can vary in strength. */
  const strokeUneven = (progress: number, colour: string, width: number) => {
    const spans = 16
    ctx.strokeStyle = colour
    ctx.lineWidth = width
    for (let i = 0; i < spans; i++) {
      const a = Math.max(0, i / spans - 0.01)
      const b = Math.min(1, (i + 1) / spans + 0.01)
      ctx.globalAlpha = heatAlong((a + b) / 2, progress)
      const steps = Math.max(2, Math.round((b - a) * SEGMENTS) + 1)
      ctx.beginPath()
      for (let j = 0; j <= steps; j++) {
        const x = a + ((b - a) * j) / steps
        const y = edgeAt(x, progress, waves) * h
        if (j === 0) ctx.moveTo(x * w, y)
        else ctx.lineTo(x * w, y)
      }
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  const frame = (now: number) => {
    const ct = anim && typeof anim.currentTime === 'number' ? anim.currentTime : now - started
    const raw = Math.min(1, Math.max(0, ct) / DURATION_MS)
    const progress = ignite(raw)

    ctx.clearRect(0, 0, w, h)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (raw < 1) {
      // The paper itself, charring ahead of the line. Under everything, and the
      // reason the effect reads as burning rather than as a lit wire being
      // dragged up the page.
      ctx.globalCompositeOperation = 'source-over'
      char?.draw(progress, (x) => edgeAt(x, progress, waves))

      // Scorch: a soft dark band riding above the char, softening its outer
      // fringe into the page.
      ctx.strokeStyle = FLAME.scorch
      ctx.lineWidth = 26
      ctx.filter = 'blur(12px)'
      traceEdge(progress, -34, 44)
      ctx.stroke()
      ctx.filter = 'none'

      // Then the line: a broad halo that carries onto both themes, a bright
      // middle, and a thin near-white core.
      ctx.globalCompositeOperation = 'lighter'

      ctx.filter = 'blur(14px)'
      ctx.strokeStyle = FLAME.halo
      ctx.lineWidth = 30
      traceEdge(progress, 0, 44)
      ctx.stroke()

      ctx.filter = 'blur(5px)'
      ctx.strokeStyle = FLAME.warm
      ctx.lineWidth = 11
      traceEdge(progress, 0)
      ctx.stroke()

      ctx.filter = 'none'
      strokeUneven(progress, FLAME.bright, 3.4)
      strokeUneven(progress, FLAME.core, 1.8)

      // Embers lift off the line.
      if (embers.length < EMBER_LIMIT) {
        for (let n = 0; n < 4; n++) {
          const x = Math.random()
          const y = edgeAt(x, progress, waves) * h - Math.random() * 60
          if (y < -20 || y > h + 20) continue
          embers.push({
            x: x * w,
            y,
            vx: (Math.random() - 0.5) * 0.7,
            vy: -(0.8 + Math.random() * 1.8),
            life: 1,
            decay: 0.01 + Math.random() * 0.014,
            size: 0.9 + Math.random() * 2.2,
            heat: 0.6 + Math.random() * 0.4,
          })
        }
      }
    }

    ctx.globalCompositeOperation = 'lighter'
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i]
      e.x += e.vx
      e.y += e.vy
      e.vy -= 0.014
      e.vx += (Math.random() - 0.5) * 0.07
      e.life -= e.decay
      if (e.life <= 0 || e.y < -24) {
        embers.splice(i, 1)
        continue
      }
      ctx.fillStyle = emberColour(Math.min(1, e.heat * e.life + 0.28))
      ctx.beginPath()
      ctx.arc(e.x, e.y, e.size * (0.35 + e.life * 0.65), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    const overdue = now - started > DURATION_MS * 3
    if (!overdue && (raw < 1 || embers.length > 0)) {
      requestAnimationFrame(frame)
      return
    }
    unfollow()
    releaseHold()
    canvas.remove()
    running = false
  }

  // A hairline of warmth along the bottom edge before the line takes hold.
  ctx.fillStyle = 'rgba(255, 120, 40, 0.35)'
  ctx.fillRect(0, h - 2, w, 2)
  requestAnimationFrame(frame)
}

/* ------------------------------------------------------------------------- *
 * Ash.
 *
 * The way back from night, and the only one that needed nothing new: the dark
 * theme is the char the fire left, and the wind takes it away. Every colour in
 * it is already in the ramp, and it reads as the second half of an effect the
 * site already has rather than as a device borrowed from somewhere else.
 *
 * The front climbs from the bottom, like the burn, but raked — the right side
 * clears first and the char streams off to the right and up, so the wind is the
 * obvious cause rather than the page simply being wiped.
 *
 * What you actually watch is not the edge but the swarm coming off it: a few
 * hundred scraps at a time, most of them a couple of pixels across, tumbling
 * and cooling as they go. An attempt to make the edge itself break into blocks
 * went in and came straight back out — the clip has to carry every shape in
 * every key frame, so blocks small enough to read as grit cost megabytes of
 * path, and blocks cheap enough to afford read as masonry. The scraps do the
 * job at a thousandth of the price.
 * ------------------------------------------------------------------------- */

const ASH_MS = 2500
/**
 * How far the front leans. Level, it is a wipe; raked, it is weather.
 *
 * The lean also grows as the front climbs, so the left runs further ahead the
 * higher it gets rather than holding a fixed angle all the way up — the corner
 * that clears first pulls away instead of the whole edge sliding.
 */
const ASH_TILT = 0.34
/** Vertical swing of the front, as a fraction of the viewport height. */
const ASH_AMP = 0.045
/**
 * How many scraps can be in the air at once.
 *
 * High, because this is the effect. Each one is a transform and a path, so the
 * ceiling is set by what stays comfortably inside a frame rather than by taste.
 */
const FLAKE_LIMIT = 640
const DUST_LIMIT = 520

interface Flake {
  x: number
  y: number
  vx: number
  vy: number
  /** Half-length of the scrap. */
  r: number
  life: number
  decay: number
  rot: number
  spin: number
  /** How much it is curled, which decides how it catches the light. */
  curl: number
  /** Big enough to be worth drawing as a curled plate rather than a chip. */
  plate: boolean
  tone: number
}

interface Dust {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  decay: number
  size: number
}

interface Streak {
  x: number
  y: number
  len: number
  speed: number
  alpha: number
}

/**
 * The brick the whole edge is built from, in page pixels.
 *
 * Everything snaps to this: the clip, the crust, the pieces that come off. The
 * ragged version that came before read as a drawn path however much grain was
 * piled on it, because an edge that wanders freely is a curve no matter what it
 * is made of. Quantised, it stops being a curve at all.
 *
 * Wider than tall, and deliberately so. Square cells read as a mosaic or a
 * chequerboard — a pattern laid *over* the page. Flat bricks read as layers,
 * which is what a sheet of char comes apart into: it delaminates before it
 * fragments.
 *
 * Small enough that the boundary reads as a soft edge rather than as steps. At
 * five by two a brick is below the size the eye resolves as a shape at arm's
 * length, so the staircase disappears and only the grain is left.
 */
const ASH_BW = 5
const ASH_BH = 2

/**
 * Height of the ash front at `x` (0..1), as a fraction of the viewport.
 *
 * Smooth on purpose. The bite-marks used to live here, and quantising a curve
 * that jumps made neighbouring columns differ by several bricks at once — the
 * boundary read as a torn staircase rather than as an edge. All the raggedness
 * now lives in how *deep* the crust is above this line, which varies just as
 * much without the boundary itself ever lurching. A smooth curve quantised to
 * two pixels steps by one brick at a time, and a one-brick step at this size is
 * not a step, it is grain.
 */
function ashEdgeRaw(x: number, t: number, waves: Wave[]): number {
  let wob = 0
  for (const w of waves) wob += Math.sin(x * w.freq + w.phase + t * w.drift) * w.amp
  const lean = ASH_TILT * (1 - x) * (0.68 + 0.54 * t)
  return (1 - t) * (1 + ASH_TILT + ASH_AMP * 3) - lean - ASH_AMP * 1.5 + wob * ASH_AMP
}

/** How many columns of blocks fit across the window. */
function ashCols(w: number): number {
  return Math.max(8, Math.ceil(w / ASH_BW))
}

/** The top of the char in column `c`, snapped to the grid, in pixels. */
function ashStep(c: number, cols: number, t: number, waves: Wave[], h: number): number {
  const x = (c + 0.5) / cols
  return Math.round((ashEdgeRaw(x, t, waves) * h) / ASH_BH) * ASH_BH
}

/**
 * Everything above the front, as a staircase.
 *
 * In pixels rather than percentages, which lets the page and the bar take the
 * same polygon: percentages are of each layer's own box, and the bar's is
 * eighty pixels tall, but they share the window's origin so pixels mean the
 * same thing in both.
 */
function clipAshBlocks(t: number, waves: Wave[], w: number, h: number): string {
  const cols = ashCols(w)
  const pts: string[] = ['0px -20px', `${w}px -20px`]
  for (let c = cols - 1; c >= 0; c--) {
    const y = ashStep(c, cols, t, waves, h).toFixed(0)
    pts.push(`${((c + 1) * ASH_BW).toFixed(0)}px ${y}px`)
    pts.push(`${(c * ASH_BW).toFixed(0)}px ${y}px`)
  }
  return `polygon(${pts.join(',')})`
}

/**
 * A soft round sprite, drawn once and then stamped.
 *
 * Building a radial gradient per particle per frame is a couple of hundred
 * gradient objects made and thrown away sixty times a second. Stamping one
 * pre-rendered sprite is the same picture for none of the cost.
 */
function softDisc(size: number, inner: string, outer: string): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const g = c.getContext('2d')
  if (g) {
    const r = size / 2
    const grad = g.createRadialGradient(r, r, 0, r, r, r)
    grad.addColorStop(0, inner)
    grad.addColorStop(1, outer)
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
  }
  return c
}

/** The ash blowing off, on a canvas above everything. */
function paintAsh(waves: Wave[], anim: Animation | null): void {
  const canvas = layer()
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    releaseHold()
    running = false
    return
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const unfollow = holdPage()
  const glow = softDisc(96, 'rgba(255, 148, 48, 0.55)', 'rgba(255, 148, 48, 0)')
  const haze = softDisc(128, 'rgba(58, 52, 46, 0.5)', 'rgba(58, 52, 46, 0)')

  const flakes: Flake[] = []
  const dust: Dust[] = []
  const embers: Ember[] = []
  const streaks: Streak[] = []
  const started = performance.now()

  /** The wind. It gusts, so the whole field surges rather than pouring evenly. */
  const gustAt = (t: number) => 1 + 0.4 * Math.sin(t * 7.3) + 0.22 * Math.sin(t * 13.1 + 1.2)

  const frame = (now: number) => {
    const ct = anim && typeof anim.currentTime === 'number' ? anim.currentTime : now - started
    const t = Math.min(1, Math.max(0, ct) / ASH_MS)
    const live = t < 1
    const gust = gustAt(t)

    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'

    if (live) {
      // The crust, on the same grid as the clip.
      //
      // Each column carries a stack of whole blocks above its step, and how
      // many is its own slow wave — so the char is deep in places and barely
      // there in others while every piece of it stays square and aligned. The
      // ones nearest the edge keep some heat; the ones further in have had
      // longer to cool.
      const cols = ashCols(w)
      const detach: Array<[number, number]> = []
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols
        const top = ashStep(c, cols, t, waves, h)
        // Depth carries everything the edge used to: slow swells, mid-scale
        // bites, and a fine chatter column to column. The boundary stays
        // smooth; what sits on it does not.
        const deep =
          2 +
          Math.round(
            Math.pow(Math.abs(Math.sin(x * 13.3 + t * 2.3)), 2) * 22 +
              Math.pow(Math.abs(Math.sin(x * 47 + t * 6.1)), 3) * 18 +
              Math.pow(Math.abs(Math.sin(x * 149 + t * 13.1)), 4) * 11 +
              Math.abs(Math.sin(x * 421.7 + t * 3)) * 5,
          )
        for (let k = 0; k < deep; k++) {
          const by = top - (k + 1) * ASH_BH
          if (by < -ASH_BH || by > h) continue
          const near = 1 - k / deep
          const jitter = Math.abs(Math.sin((c * 13.7 + k * 5.3) * 1.7 + t * 2.1))
          // One block in a dozen is a coal that has not gone out.
          if (jitter > 0.965) {
            ctx.fillStyle = 'rgba(206, 96, 26, 0.85)'
          } else {
            ctx.fillStyle =
              'rgba(' +
              ((17 + near * near * 52 + jitter * 16) | 0) +
              ',' +
              ((14 + near * near * 16 + jitter * 13) | 0) +
              ',' +
              ((11 + jitter * 10) | 0) +
              ',' +
              (0.45 + jitter * 0.45).toFixed(2) +
              ')'
          }
          ctx.fillRect(c * ASH_BW, by, ASH_BW - 1, ASH_BH - 0.6)

          // The topmost block of a column is the one about to go.
          if (k === deep - 1) detach.push([c * ASH_BW, by])
        }
      }

      // The warm seam, in whole blocks rather than as a stroke. A continuous
      // glowing curve is exactly what this edge must not have — it is the one
      // thing that gives away a path being drawn — and here the heat simply
      // belongs to some blocks and not others.
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) / cols
        const heat = 0.5 + 0.5 * Math.sin(x * 37.1 + t * 5.3) * Math.sin(x * 11.7 - t * 2.9)
        if (heat < 0.34) continue
        const top = ashStep(c, cols, t, waves, h)
        ctx.fillStyle = 'rgba(214, 104, 32, ' + (heat * heat * 0.55).toFixed(2) + ')'
        ctx.fillRect(c * ASH_BW, top - ASH_BH, ASH_BW - 1, ASH_BH - 0.6)
      }

      // Everything that comes off, born on the edge and taken downwind. Many,
      // and mostly tiny: the size is a steep power curve, so the field is chips
      // with the occasional plate turning over among them.
      const born = Math.round(22 * gust)
      for (let n = 0; n < born; n++) {
        const cell = detach.length ? detach[(Math.random() * detach.length) | 0] : null
        if (!cell) break
        const px = cell[0] + Math.random() * ASH_BW
        const py = cell[1] + Math.random() * ASH_BH
        if (flakes.length < FLAKE_LIMIT) {
          const r = 1.4 + Math.pow(Math.random(), 3.1) * 5.5
          flakes.push({
            x: px + (Math.random() - 0.5) * 14,
            y: py + (Math.random() - 0.5) * 20,
            vx: (2.4 + Math.random() * 5.5) * gust,
            vy: -(0.4 + Math.random() * 2.2),
            r,
            life: 1,
            decay: 0.008 + Math.random() * 0.014,
            rot: Math.random() * Math.PI,
            spin: (Math.random() - 0.5) * 0.5,
            curl: 0.2 + Math.random() * 0.8,
            plate: r > 3.2,
            tone: Math.random(),
          })
        }
        if (dust.length < DUST_LIMIT) {
          dust.push({
            x: px + (Math.random() - 0.5) * 22,
            y: py + (Math.random() - 0.5) * 26,
            vx: (3 + Math.random() * 8) * gust,
            vy: -(0.3 + Math.random() * 2),
            life: 1,
            decay: 0.012 + Math.random() * 0.02,
            size: 0.7 + Math.random() * 1.6,
          })
        }
        if (Math.random() > 0.97 && embers.length < 70) {
          embers.push({
            x: px,
            y: py,
            vx: (1.8 + Math.random() * 4) * gust,
            vy: -(0.6 + Math.random() * 1.8),
            life: 1,
            decay: 0.012 + Math.random() * 0.016,
            size: 0.9 + Math.random() * 1.8,
            heat: 0.6 + Math.random() * 0.4,
          })
        }
        if (Math.random() > 0.97 && streaks.length < 60) {
          streaks.push({
            x: px,
            y: py - Math.random() * 40,
            len: 40 + Math.random() * 170,
            speed: (5 + Math.random() * 13) * gust,
            alpha: 0.03 + Math.random() * 0.06,
          })
        }
      }
    }

    // Wind streaks first, behind everything: they are the air, not the ash.
    ctx.lineCap = 'round'
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i]
      s.x += s.speed
      s.y -= 0.3
      s.alpha -= 0.0016
      if (s.alpha <= 0 || s.x - s.len > w) {
        streaks.splice(i, 1)
        continue
      }
      ctx.strokeStyle = `rgba(150, 142, 132, ${s.alpha})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(s.x - s.len, s.y)
      ctx.lineTo(s.x, s.y)
      ctx.stroke()
    }

    // Fine ash: too small to be a shape, so it is a haze that streams.
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i]
      d.x += d.vx
      d.y += d.vy
      d.vy -= 0.01
      d.life -= d.decay
      if (d.life <= 0 || d.x > w + 20 || d.y < -20) {
        dust.splice(i, 1)
        continue
      }
      ctx.fillStyle = `rgba(74, 68, 62, ${d.life * 0.5})`
      ctx.fillRect(d.x, d.y, d.size, d.size)
    }

    // A thin haze riding with them, so the stream has body rather than being a
    // cloud of separate specks.
    if (live) {
      const hcols = ashCols(w)
      for (let i = 0; i <= 12; i++) {
        const x = i / 12
        const y = ashStep(Math.round(x * (hcols - 1)), hcols, t, waves, h)
        const r = 56 + Math.sin(x * 7.1 + t * 5.3) * 24
        ctx.globalAlpha = 0.06 * gust
        ctx.drawImage(haze, x * w - r + 26, y - r - 20, r * 2, r * 2)
      }
      ctx.globalAlpha = 1
    }

    // The scraps.
    //
    // Chips are the common case and get a turned rectangle, which is all a
    // three-pixel scrap can show anyway. The few big enough to read as a plate
    // get the curled quad, so something in the field is always catching the
    // light as it comes round. Every one of them cools on the way: warm while
    // it is fresh off the edge, cold ash by the time it fades.
    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i]
      f.x += f.vx
      f.y += f.vy
      f.vy -= 0.018
      f.vx += 0.05
      f.rot += f.spin
      f.life -= f.decay
      if (f.life <= 0 || f.x > w + 30 || f.y < -30) {
        flakes.splice(i, 1)
        continue
      }
      const face = Math.abs(Math.cos(f.rot))
      const lit = 0.16 + face * 0.34
      const heat = f.life * f.life * f.life
      const fill =
        f.tone > 0.94
          ? `rgba(${(96 + lit * 70) | 0}, ${(88 + lit * 62) | 0}, ${(80 + lit * 54) | 0}, ${f.life * 0.85})`
          : `rgba(${(22 + lit * 32 + heat * 74) | 0}, ${(18 + lit * 26 + heat * 24) | 0}, ${(14 + lit * 20) | 0}, ${Math.min(1, f.life * 1.1)})`

      ctx.save()
      ctx.translate(f.x, f.y)
      ctx.rotate(f.rot)
      ctx.fillStyle = fill
      if (f.plate) {
        const hw = f.r
        const hh = f.r * (0.22 + face * 0.4)
        const bend = f.curl * hh
        ctx.beginPath()
        ctx.moveTo(-hw, -hh)
        ctx.quadraticCurveTo(0, -hh - bend, hw, -hh)
        ctx.lineTo(hw, hh)
        ctx.quadraticCurveTo(0, hh - bend, -hw, hh)
        ctx.closePath()
        ctx.fill()
      } else {
        ctx.fillRect(-f.r, -f.r * (0.28 + face * 0.34), f.r * 2, f.r * (0.56 + face * 0.68))
      }
      ctx.restore()
    }

    // The last live coals among them.
    ctx.globalCompositeOperation = 'lighter'
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i]
      e.x += e.vx
      e.y += e.vy
      e.vy -= 0.014
      e.life -= e.decay
      if (e.life <= 0 || e.x > w + 20 || e.y < -20) {
        embers.splice(i, 1)
        continue
      }
      const r = 13 * e.life
      ctx.globalAlpha = e.life * 0.5
      ctx.drawImage(glow, e.x - r, e.y - r, r * 2, r * 2)
      ctx.globalAlpha = 1
      ctx.fillStyle = emberColour(Math.min(1, e.heat * e.life + 0.3))
      ctx.beginPath()
      ctx.arc(e.x, e.y, e.size * (0.4 + e.life * 0.6), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'

    const overdue = now - started > ASH_MS * 3
    if (!overdue && (live || flakes.length > 0 || dust.length > 0 || embers.length > 0)) {
      requestAnimationFrame(frame)
      return
    }
    unfollow()
    releaseHold()
    canvas.remove()
    running = false
  }

  requestAnimationFrame(frame)
}
