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


const DURATION_MS = 1650
/** Vertical swing of the torn edge, as a fraction of viewport height. */
const AMPLITUDE = 0.055
/** Points along the edge. Enough to look organic, few enough to stay cheap. */
const SEGMENTS = 56
/** Key frames handed to the compositor for the clip animation. */
const STEPS = 48
const EMBER_LIMIT = 120

interface Wave {
  freq: number
  phase: number
  amp: number
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

/** Fire catches fast, then runs steadily; a slow start reads as a dead click. */
function ignite(t: number): number {
  return 1 - Math.pow(1 - t, 1.5)
}

function makeWaves(): Wave[] {
  const rand = () => Math.random() * Math.PI * 2
  return [
    { freq: 5.5 + Math.random() * 2.5, phase: rand(), amp: 0.55 },
    { freq: 12.0 + Math.random() * 4.0, phase: rand(), amp: 0.3 },
    { freq: 23.0 + Math.random() * 7.0, phase: rand(), amp: 0.15 },
  ]
}

/**
 * Height of the burn edge at `x` (0..1), as a fraction of viewport height where
 * 0 is the top. Overshoots both ends so the very first and very last slivers
 * also burn through instead of stalling.
 */
function edgeAt(x: number, progress: number, waves: Wave[]): number {
  let wobble = 0
  for (const w of waves) wobble += Math.sin(x * w.freq + w.phase) * w.amp
  const base = (1 - progress) * (1 + AMPLITUDE * 3) - AMPLITUDE * 1.5
  return base + wobble * AMPLITUDE
}

/** Polygon covering everything *above* the edge — the part not yet burned. */
function clipAbove(progress: number, waves: Wave[]): string {
  const pts: string[] = ['0% -5%', '100% -5%']
  for (let i = SEGMENTS; i >= 0; i--) {
    const x = i / SEGMENTS
    const y = edgeAt(x, progress, waves) * 100
    pts.push(`${(x * 100).toFixed(2)}% ${y.toFixed(2)}%`)
  }
  return `polygon(${pts.join(',')})`
}

let running = false

export function burnTransition(swap: () => void): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const supported = typeof document.startViewTransition === 'function'

  if (reduced || running || !document.body) {
    swap()
    return
  }
  running = true

  const waves = makeWaves()

  if (!supported) {
    // No snapshot available: still run the flame, just over the new theme.
    paintFire(waves, performance.now())
    swap()
    return
  }

  const transition = document.startViewTransition(() => {
    swap()
  })

  transition.ready
    .then(() => {
      const frames: Keyframe[] = []
      for (let i = 0; i <= STEPS; i++) {
        frames.push({ clipPath: clipAbove(ignite(i / STEPS), waves) })
      }

      document.documentElement.animate(frames, {
        duration: DURATION_MS,
        easing: 'linear',
        pseudoElement: '::view-transition-old(root)',
        fill: 'forwards',
      })

      paintFire(waves, performance.now())
    })
    .catch(() => {
      running = false
    })

  transition.finished.finally(() => {
    running = false
  })
}

/** The flame itself, plus embers, on a canvas above everything. */
function paintFire(waves: Wave[], start: number): void {
  const canvas = document.createElement('canvas')
  canvas.className = 'burn-layer'
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    running = false
    return
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  document.body.appendChild(canvas)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const embers: Ember[] = []

  const traceEdge = (progress: number, offsetPx: number) => {
    ctx.beginPath()
    for (let i = 0; i <= SEGMENTS; i++) {
      const x = (i / SEGMENTS) * w
      const y = edgeAt(i / SEGMENTS, progress, waves) * h + offsetPx
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
  }

  const frame = (now: number) => {
    const raw = Math.min(1, (now - start) / DURATION_MS)
    const progress = ignite(raw)

    ctx.clearRect(0, 0, w, h)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (raw < 1) {
      // Scorch: a soft dark band riding just above the flame, on the part of
      // the page that is about to go.
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = FLAME.scorch
      ctx.lineWidth = 30
      ctx.filter = 'blur(10px)'
      traceEdge(progress, -16)
      ctx.stroke()
      ctx.filter = 'none'

      // Flame: a wide warm halo, then a hot core.
      ctx.globalCompositeOperation = 'lighter'

      // Three passes: a broad halo that carries onto both themes, a bright
      // middle, and a thin near-white core. Built up rather than blurred once,
      // so the line still reads against a pale background.
      ctx.filter = 'blur(14px)'
      ctx.strokeStyle = FLAME.halo
      ctx.lineWidth = 30
      traceEdge(progress, 0)
      ctx.stroke()

      ctx.filter = 'blur(5px)'
      ctx.strokeStyle = FLAME.warm
      ctx.lineWidth = 11
      traceEdge(progress, 0)
      ctx.stroke()

      ctx.filter = 'blur(1.5px)'
      ctx.strokeStyle = FLAME.bright
      ctx.lineWidth = 4
      traceEdge(progress, 0)
      ctx.stroke()

      ctx.filter = 'none'
      ctx.strokeStyle = FLAME.core
      ctx.lineWidth = 1.8
      traceEdge(progress, 0)
      ctx.stroke()

      // Embers lift off the line.
      if (embers.length < EMBER_LIMIT) {
        for (let n = 0; n < 4; n++) {
          const x = Math.random()
          const y = edgeAt(x, progress, waves) * h
          if (y < -20 || y > h + 20) continue
          embers.push({
            x: x * w,
            y,
            vx: (Math.random() - 0.5) * 0.7,
            vy: -(0.8 + Math.random() * 1.8),
            life: 1,
            decay: 0.010 + Math.random() * 0.014,
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

    const overdue = now - start > DURATION_MS + 1400
    if (!overdue && (raw < 1 || embers.length > 0)) {
      requestAnimationFrame(frame)
      return
    }
    canvas.remove()
    running = false
  }

  // A hairline of warmth along the bottom edge before the line takes hold.
  ctx.fillStyle = 'rgba(255, 120, 40, 0.35)'
  ctx.fillRect(0, h - 2, w, 2)
  requestAnimationFrame(frame)
}
