/**
 * Candidate theme transitions, kept out of the product.
 *
 * The burn earns its place: fire eats a bright page and leaves night behind it,
 * and that is what the whole site is about. Nothing has earned the other
 * direction yet — a kitchen sponge is an object from somewhere else, and the
 * only thing in the interface with no reason to be here. These are the
 * candidates to replace it, built far enough to be judged side by side rather
 * than argued about.
 *
 * Every one of them runs night → day, always, however the page is sitting when
 * you press it: that is the direction being decided, and comparing candidates
 * is pointless if they alternate.
 *
 * They run on the machinery the real one uses — `startViewTransition`, a clip
 * animated on the outgoing snapshot, a canvas over the top — so what you see
 * here is what shipping it would look like. Nothing in the product imports this
 * file, and `lab.html` is not in the build.
 *
 * A note on how all of them work, because it is the same trick every time: a
 * `clip-path` can only ever be a hard edge. None of these effects wants a hard
 * edge, so in each one the canvas has to put enough in front of the boundary
 * that nobody ever sees it. Where a candidate looks cheap, that is usually
 * where the disguise is too thin.
 */

export type LabEffect = 'dawn' | 'smoke' | 'rain' | 'scan' | 'ash'

interface Effect {
  /** How long it runs. */
  ms: number
  /** The clip on the outgoing snapshot at `t` (0..1), as a polygon. */
  clip(t: number): string
  /** The overlay, drawn every frame in viewport pixels. */
  paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, done: boolean): void
}

/** Key frames the compositor gets. Enough that a wandering edge stays smooth. */
const STEPS = 64

const rand = () => Math.random()

/** A soft round sprite, drawn once and stamped — cheaper than a gradient a frame. */
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

/** A sum of sines with a phase that drifts, so an edge wanders as it travels. */
function wobbler(octaves: Array<[freq: number, amp: number, drift: number]>) {
  const waves = octaves.map(([f, a, d]) => ({ f, a, d, p: rand() * Math.PI * 2 }))
  return (x: number, t: number) => {
    let sum = 0
    for (const w of waves) sum += Math.sin(x * w.f + w.p + t * w.d) * w.a
    return sum
  }
}

/** A polygon keeping everything above `edge`, which is a fraction of the height. */
function above(edge: (x: number) => number): string {
  const pts = ['0% -6%', '100% -6%']
  for (let i = 56; i >= 0; i--) {
    const x = i / 56
    pts.push(`${(x * 100).toFixed(2)}% ${(edge(x) * 100).toFixed(2)}%`)
  }
  return `polygon(${pts.join(',')})`
}

/** A polygon keeping everything below `edge`. */
function below(edge: (x: number) => number): string {
  const pts = ['0% 106%', '100% 106%']
  for (let i = 56; i >= 0; i--) {
    const x = i / 56
    pts.push(`${(x * 100).toFixed(2)}% ${(edge(x) * 100).toFixed(2)}%`)
  }
  return `polygon(${pts.join(',')})`
}

/* ------------------------------------------------------------------------- *
 * Dawn.
 *
 * The opposite of a page burning down to night is not cleaning it — it is
 * morning. A terminator crosses the page and daylight follows it.
 *
 * This is the only candidate that comes out of the data rather than being
 * applied to it. MODIS and VIIRS are polar-orbiting: every detection carries a
 * day/night flag, and the whole calendar is counted in local solar days rather
 * than UTC precisely because the sun is what decides when a sensor can see a
 * fire at all. The line crossing the page is the same line that decides what is
 * in the record.
 *
 * It is raked rather than horizontal because a terminator is — the angle is the
 * one thing that says "planet" instead of "wipe".
 * ------------------------------------------------------------------------- */

function dawnEffect(): Effect {
  const TILT = 0.26
  const wob = wobbler([
    [1.7, 0.4, 0.5],
    [3.1, 0.22, -0.8],
  ])
  const AMP = 0.02
  const edgeAt = (x: number, t: number) =>
    t * (1 + TILT + AMP * 3) - TILT * x - AMP * 1.5 + wob(x, t) * AMP

  const stars = Array.from({ length: 90 }, () => ({
    x: rand(),
    y: rand(),
    r: 0.5 + rand() * 1.3,
    a: 0.15 + rand() * 0.5,
  }))
  const glow = softDisc(256, 'rgba(255, 186, 96, 0.5)', 'rgba(255, 186, 96, 0)')

  return {
    ms: 2600,
    clip: (t) => below((x) => edgeAt(x, t)),
    paint(ctx, w, h, t, done) {
      if (done) return

      // The night side still has its stars, and they go out as the light
      // reaches them rather than all at once.
      for (const s of stars) {
        const y = s.y * h
        const line = edgeAt(s.x, t) * h
        const lead = (y - line) / (h * 0.25)
        if (lead < 0) continue
        ctx.globalAlpha = Math.min(1, lead) * s.a
        ctx.fillStyle = '#e8e2d6'
        ctx.beginPath()
        ctx.arc(s.x * w, y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      // The band along the terminator: the sky's own ramp, deep blue behind,
      // amber at the line, white just in front of it. Drawn as a strip per
      // column so it follows the rake and the wander exactly.
      const cols = 64
      for (let i = 0; i < cols; i++) {
        const x0 = (i / cols) * w
        const x1 = ((i + 1) / cols) * w + 1
        const line = edgeAt((i + 0.5) / cols, t) * h
        const g = ctx.createLinearGradient(0, line - 170, 0, line + 90)
        g.addColorStop(0, 'rgba(255, 244, 226, 0)')
        g.addColorStop(0.42, 'rgba(255, 216, 158, 0.34)')
        g.addColorStop(0.66, 'rgba(255, 170, 84, 0.5)')
        g.addColorStop(0.78, 'rgba(196, 96, 66, 0.4)')
        g.addColorStop(0.9, 'rgba(58, 52, 88, 0.34)')
        g.addColorStop(1, 'rgba(22, 24, 48, 0)')
        ctx.fillStyle = g
        ctx.fillRect(x0, line - 170, x1 - x0, 260)
      }

      // The sun itself, coming up somewhere along the line. Without a source
      // the gradient is just a band; with one it is a sunrise.
      const sx = 0.72 * w
      const sy = edgeAt(0.72, t) * h
      ctx.globalAlpha = Math.min(1, t * 2.4)
      ctx.drawImage(glow, sx - 260, sy - 260, 520, 520)
      ctx.globalAlpha = 1
    },
  }
}

/* ------------------------------------------------------------------------- *
 * Smoke.
 *
 * The dark theme is what is left after the fire, so it leaves the way smoke
 * leaves: it thins, rolls, and is gone.
 *
 * Plumes are built in clusters rather than one blob at a time — a single soft
 * disc has no structure, and a field of them is fog. Each cluster is a handful
 * of discs sharing a drift, which is what gives smoke its billow: lobes that
 * move together while their edges shear past one another.
 * ------------------------------------------------------------------------- */

interface Puff {
  x: number
  y: number
  r: number
  life: number
  decay: number
  vx: number
  vy: number
  spin: number
  dark: boolean
}

function smokeEffect(): Effect {
  const wob = wobbler([
    [2.1, 0.5, 0.9],
    [3.7, 0.3, -1.5],
    [6.9, 0.2, 2.4],
  ])
  const AMP = 0.09
  const edgeAt = (x: number, t: number) =>
    (1 - t) * (1 + AMP * 3) - AMP * 1.5 + wob(x, t) * AMP

  const puffs: Puff[] = []
  const dark = softDisc(128, 'rgba(32, 28, 25, 0.9)', 'rgba(32, 28, 25, 0)')
  const pale = softDisc(128, 'rgba(186, 180, 170, 0.62)', 'rgba(186, 180, 170, 0)')
  const soot = softDisc(128, 'rgba(14, 11, 9, 0.9)', 'rgba(14, 11, 9, 0)')

  return {
    ms: 2600,
    clip: (t) => above((x) => edgeAt(x, t)),
    paint(ctx, w, h, t, done) {
      if (!done) {
        // One cluster a frame, not one disc: lobes that share a drift are what
        // make a billow instead of fog.
        const x = rand()
        const bx = x * w
        const by = edgeAt(x, t) * h
        const vx = (rand() - 0.5) * 1.5
        const vy = -(0.25 + rand() * 0.9)
        const isDark = rand() > 0.45
        const lobes = 3 + ((rand() * 3) | 0)
        for (let i = 0; i < lobes; i++) {
          const spread = 30 + rand() * 90
          puffs.push({
            x: bx + (rand() - 0.5) * spread,
            y: by + (rand() - 0.5) * spread * 0.6,
            r: 26 + Math.pow(rand(), 2) * 160,
            life: 1,
            decay: 0.005 + rand() * 0.008,
            vx: vx + (rand() - 0.5) * 0.5,
            vy: vy + (rand() - 0.5) * 0.3,
            spin: (rand() - 0.5) * 0.9,
            dark: isDark,
          })
        }
      }

      // Soot right on the front — the heavy part that has not lifted yet. It is
      // what keeps the boundary itself out of sight.
      if (!done) {
        for (let i = 0; i <= 26; i++) {
          const x = i / 26
          const y = edgeAt(x, t) * h
          const r = 70 + Math.sin(x * 9.1 + t * 5) * 26
          ctx.globalAlpha = 0.16
          ctx.drawImage(soot, x * w - r, y - r * 0.55, r * 2, r * 1.5)
        }
      }

      for (let i = puffs.length - 1; i >= 0; i--) {
        const s = puffs[i]
        s.x += s.vx
        s.y += s.vy
        s.vx += s.spin * 0.02
        s.vy -= 0.006
        s.r += 0.7
        s.life -= s.decay
        if (s.life <= 0) {
          puffs.splice(i, 1)
          continue
        }
        // Two tones, because smoke is only ever one colour against one
        // background: pale plumes carry on the dark theme, dark ones on the
        // light, and this effect has to cross both.
        ctx.globalAlpha = s.life * s.life * 0.3
        ctx.drawImage(s.dark ? dark : pale, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2)
      }
      ctx.globalAlpha = 1
    },
  }
}

/* ------------------------------------------------------------------------- *
 * Rain.
 *
 * Rain is what ends a fire season, and it arrives from above — so the clean
 * page comes down from the top rather than up from the bottom, which is the one
 * thing keeping it from reading as the burn played backwards.
 *
 * Three depths of drop, because rain seen against a page is mostly parallax:
 * the far ones are short, faint and slow, the near ones long and quick. All of
 * it stays nearly colourless — the site has no blue in it, and introducing one
 * for two seconds costs more than the effect is worth.
 * ------------------------------------------------------------------------- */

interface Drop {
  x: number
  y: number
  len: number
  speed: number
  alpha: number
  width: number
}

interface Ring {
  x: number
  y: number
  r: number
  life: number
  grow: number
}

function rainEffect(): Effect {
  const wob = wobbler([
    [3.3, 0.5, 0],
    [7.1, 0.3, 0],
    [15.3, 0.2, 0],
  ])
  const AMP = 0.045
  const LEAN = 0.16
  const edgeAt = (x: number, t: number) => t * (1 + AMP * 3) - AMP * 1.5 + wob(x, t) * AMP

  const drops: Drop[] = []
  const rings: Ring[] = []
  const splash: Ring[] = []

  return {
    ms: 2400,
    clip: (t) => below((x) => edgeAt(x, t)),
    paint(ctx, w, h, t, done) {
      if (!done && drops.length < 300) {
        for (let i = 0; i < 11; i++) {
          const depth = rand()
          drops.push({
            x: rand() * (w + h * LEAN) - h * LEAN,
            y: -20 - rand() * 160,
            len: 10 + depth * 46,
            speed: 9 + depth * 22,
            alpha: 0.08 + depth * 0.3,
            width: 0.8 + depth * 1.1,
          })
        }
      }

      // A darker band just ahead of the front: paper about to be wet.
      if (!done) {
        const cols = 48
        for (let i = 0; i < cols; i++) {
          const x0 = (i / cols) * w
          const line = edgeAt((i + 0.5) / cols, t) * h
          const g = ctx.createLinearGradient(0, line, 0, line + 90)
          g.addColorStop(0, 'rgba(210, 220, 228, 0.16)')
          g.addColorStop(1, 'rgba(180, 194, 204, 0)')
          ctx.fillStyle = g
          ctx.fillRect(x0, line, w / cols + 1, 90)
        }
      }

      ctx.lineCap = 'round'
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]
        d.y += d.speed
        d.x += d.speed * LEAN
        const line = edgeAt(d.x / w, t) * h
        if (!done && d.y > line) {
          // It lands on the front. That is where the page becomes clean, so
          // that is where the ring goes — plus a smaller, faster one for the
          // spray, because a drop does not make one clean circle.
          rings.push({ x: d.x, y: line, r: 2, life: 1, grow: 1.5 + rand() })
          if (rand() > 0.55) {
            splash.push({ x: d.x, y: line, r: 1, life: 1, grow: 3.4 + rand() * 2 })
          }
          drops.splice(i, 1)
          continue
        }
        if (d.y - d.len > h) {
          drops.splice(i, 1)
          continue
        }
        ctx.strokeStyle = `rgba(228, 234, 238, ${d.alpha})`
        ctx.lineWidth = d.width
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - d.len * LEAN, d.y - d.len)
        ctx.stroke()
      }

      const drawRings = (list: Ring[], fade: number, squash: number) => {
        for (let i = list.length - 1; i >= 0; i--) {
          const r = list[i]
          r.r += r.grow
          r.life -= fade
          if (r.life <= 0) {
            list.splice(i, 1)
            continue
          }
          ctx.strokeStyle = `rgba(236, 242, 246, ${r.life * 0.5})`
          ctx.lineWidth = 1.1
          ctx.beginPath()
          ctx.ellipse(r.x, r.y, r.r, r.r * squash, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      drawRings(rings, 0.03, 0.34)
      drawRings(splash, 0.07, 0.5)
    },
  }
}

/* ------------------------------------------------------------------------- *
 * Sensor pass.
 *
 * MODIS and VIIRS build an image a line at a time, sweeping across the track as
 * the spacecraft moves along it — so the page is rebuilt the way the data
 * behind it was gathered.
 *
 * The across-track samples grow toward the edges because the ground each one
 * covers does: at the far edge of a swath a footprint is several times what it
 * is at nadir. That is exactly why a kilometre sensor and a 375-metre one
 * disagree about the same fire, which is the subject of this page — so the
 * detail is not decoration, it is the argument.
 *
 * The risk, stated plainly: a bright bar crossing a page is also what a loading
 * indicator looks like. The nadir mark, the ragged detections and the widening
 * are all there to say *instrument* rather than *progress*.
 * ------------------------------------------------------------------------- */

function scanEffect(): Effect {
  const N = 128
  const jitter = Array.from({ length: N }, () => rand())
  const hits = Array.from({ length: N }, () => rand())

  return {
    ms: 2400,
    clip: (t) => below(() => t * 1.12 - 0.06),
    paint(ctx, w, h, t, done) {
      if (done) return
      const y = (t * 1.12 - 0.06) * h

      // Everything already read, fading back: the swath behind the head.
      const trail = ctx.createLinearGradient(0, y - 220, 0, y)
      trail.addColorStop(0, 'rgba(255, 150, 48, 0)')
      trail.addColorStop(0.7, 'rgba(255, 150, 48, 0.08)')
      trail.addColorStop(1, 'rgba(255, 170, 70, 0.2)')
      ctx.fillStyle = trail
      ctx.fillRect(0, y - 220, w, 220)

      // The last few lines, still legible as separate lines.
      for (let k = 1; k <= 6; k++) {
        const ly = y - k * 9
        ctx.strokeStyle = `rgba(255, 196, 120, ${0.16 / k})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, ly)
        ctx.lineTo(w, ly)
        ctx.stroke()
      }

      // Across-track samples, widening toward the edges of the swath.
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1)
        const off = Math.abs(u - 0.5) * 2
        const len = 4 + off * off * 22
        ctx.strokeStyle = `rgba(255, 200, 128, ${0.08 + jitter[i] * 0.2})`
        ctx.lineWidth = 1 + off * 1.6
        ctx.beginPath()
        ctx.moveTo(u * w, y - len)
        ctx.lineTo(u * w, y)
        ctx.stroke()
      }

      // The head: a hot line with a soft shoulder either side.
      const glow = ctx.createLinearGradient(0, y - 16, 0, y + 16)
      glow.addColorStop(0, 'rgba(255, 168, 62, 0)')
      glow.addColorStop(0.5, 'rgba(255, 214, 148, 0.6)')
      glow.addColorStop(1, 'rgba(255, 168, 62, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, y - 16, w, 32)

      ctx.strokeStyle = 'rgba(255, 250, 238, 0.95)'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()

      // Nadir: the one sample directly under the spacecraft, and the only place
      // the footprint is the size the specification claims.
      ctx.strokeStyle = 'rgba(255, 252, 244, 0.8)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(w / 2, y - 22)
      ctx.lineTo(w / 2, y + 22)
      ctx.stroke()

      // What the pass actually returns.
      for (let i = 0; i < N; i++) {
        if (hits[i] < 0.76) continue
        const u = i / (N - 1)
        const off = Math.abs(u - 0.5) * 2
        const r = (1.2 + hits[i] * 2.2) * (1 + off * 1.4)
        ctx.fillStyle = `rgba(255, ${130 + hits[i] * 100}, 54, ${0.45 + hits[i] * 0.45})`
        ctx.beginPath()
        ctx.arc(u * w + (jitter[i] - 0.5) * 9, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}

/* ------------------------------------------------------------------------- *
 * Ash.
 *
 * The one candidate that needs nothing new at all: the dark theme is the char
 * the fire left, and the wind takes it away. It reads as the second half of an
 * effect the site already has, and every colour in it is already in the ramp.
 *
 * The front is raked and the flakes stream off it, tumbling and fading, with a
 * few embers still alive among them. Cheapest of the five to justify and the
 * least likely to be mistaken for something else.
 * ------------------------------------------------------------------------- */

interface Flake {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  life: number
  decay: number
  spin: number
  rot: number
  ember: boolean
}

function ashEffect(): Effect {
  const TILT = 0.2
  const wob = wobbler([
    [2.3, 0.45, 1.1],
    [5.1, 0.28, -1.8],
    [11.3, 0.16, 2.9],
  ])
  const AMP = 0.045
  const edgeAt = (x: number, t: number) =>
    (1 - t) * (1 + TILT + AMP * 3) - TILT * (1 - x) - AMP * 1.5 + wob(x, t) * AMP

  const flakes: Flake[] = []

  return {
    ms: 2500,
    clip: (t) => above((x) => edgeAt(x, t)),
    paint(ctx, w, h, t, done) {
      if (!done) {
        for (let i = 0; i < 7; i++) {
          const x = rand()
          const ember = rand() > 0.88
          flakes.push({
            x: x * w,
            y: edgeAt(x, t) * h + (rand() - 0.5) * 18,
            vx: 2.4 + rand() * 5.5,
            vy: -(0.4 + rand() * 2.2),
            r: ember ? 1 + rand() * 1.8 : 1.6 + rand() * 5,
            life: 1,
            decay: 0.008 + rand() * 0.012,
            spin: (rand() - 0.5) * 0.4,
            rot: rand() * Math.PI,
            ember,
          })
        }

        // The char itself, still on the front and about to lift.
        const cols = 40
        for (let i = 0; i < cols; i++) {
          const x0 = (i / cols) * w
          const line = edgeAt((i + 0.5) / cols, t) * h
          const g = ctx.createLinearGradient(0, line - 54, 0, line + 6)
          g.addColorStop(0, 'rgba(20, 15, 12, 0)')
          g.addColorStop(1, 'rgba(20, 15, 12, 0.5)')
          ctx.fillStyle = g
          ctx.fillRect(x0, line - 54, w / cols + 1, 60)
        }
      }

      for (let i = flakes.length - 1; i >= 0; i--) {
        const f = flakes[i]
        f.x += f.vx
        f.y += f.vy
        f.vy -= 0.02
        f.vx += 0.04
        f.rot += f.spin
        f.life -= f.decay
        if (f.life <= 0 || f.x > w + 40) {
          flakes.splice(i, 1)
          continue
        }
        if (f.ember) {
          ctx.fillStyle = `rgba(255, ${140 + f.life * 90}, 60, ${f.life})`
          ctx.beginPath()
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
          ctx.fill()
          continue
        }
        // Flakes, not dots: a scrap of char tumbles, so it is a thin rectangle
        // that keeps turning end over end.
        ctx.save()
        ctx.translate(f.x, f.y)
        ctx.rotate(f.rot)
        ctx.fillStyle = `rgba(26, 21, 17, ${f.life * 0.85})`
        ctx.fillRect(-f.r, -f.r * 0.34, f.r * 2, f.r * 0.68)
        ctx.restore()
      }
    },
  }
}

const EFFECTS: Record<LabEffect, () => Effect> = {
  dawn: dawnEffect,
  smoke: smokeEffect,
  rain: rainEffect,
  scan: scanEffect,
  ash: ashEffect,
}

let running = false

/**
 * Run one candidate, always from night to day.
 *
 * If the page is already light it is snapped back to dark first, without a
 * transition — the direction is the thing being decided here, and candidates
 * that alternate cannot be compared.
 */
export function runLabEffect(kind: LabEffect): void {
  if (running) return
  const root = document.documentElement
  if (root.dataset.theme !== 'night') root.dataset.theme = 'night'

  const swap = () => {
    root.dataset.theme = 'day'
  }

  if (typeof document.startViewTransition !== 'function') {
    swap()
    return
  }
  running = true
  const effect = EFFECTS[kind]()

  // Built before the transition starts: doing this inside `ready` is long
  // enough for the transition to close underneath it.
  const frames: Keyframe[] = Array.from({ length: STEPS + 1 }, (_, i) => ({
    clipPath: effect.clip(i / STEPS),
  }))

  const transition = document.startViewTransition(swap)

  transition.ready
    .then(() => {
      const anim = root.animate(frames, {
        duration: effect.ms,
        easing: 'linear',
        pseudoElement: '::view-transition-old(root)',
        fill: 'forwards',
      })
      paint(effect, anim)
    })
    .catch(() => {
      release()
      running = false
    })

  transition.finished.finally(() => {
    running = false
  })
}

/** The stylesheet holds the transition open; finishing that lets it close. */
function release(): void {
  for (const a of document.getAnimations()) {
    const named = a as Animation & { animationName?: string }
    if (named.animationName === 'vt-hold') a.finish()
  }
}

function paint(effect: Effect, anim: Animation): void {
  const canvas = document.createElement('canvas')
  canvas.className = 'burn-layer'
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    release()
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

  const started = performance.now()
  const frame = (now: number) => {
    const ct = typeof anim.currentTime === 'number' ? anim.currentTime : now - started
    const t = Math.min(1, Math.max(0, ct) / effect.ms)
    const done = t >= 1

    ctx.clearRect(0, 0, w, h)
    effect.paint(ctx, w, h, t, done)

    if (now - started < effect.ms + 1800) {
      requestAnimationFrame(frame)
      return
    }
    release()
    canvas.remove()
    running = false
  }
  requestAnimationFrame(frame)
}
