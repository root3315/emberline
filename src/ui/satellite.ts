/**
 * A satellite photograph of the place that was pressed, with the forecast
 * laid over it.
 *
 * ── Why a photograph and not another chart ────────────────────────────────
 *
 * Everything else here draws the data as squares, which is honest and which
 * also makes every part of the planet look alike: a cell in Zambia and a
 * cell in Siberia are the same orange rectangle. A reader who has just
 * pressed one deserves to see what is actually there — savanna, a mosaic of
 * smallholdings, taiga, the edge of a desert — because that is half the
 * answer to "why would this burn".
 *
 * ── And why the forecast sits on top of it ────────────────────────────────
 *
 * The overlay is the same forecast in the same colours as the globe and the
 * map: a point of light for every cell the model expects to burn, on the
 * actual ground it expects it on. The two pictures therefore cannot
 * disagree, and a point that has been put somewhere absurd — in a lake,
 * on a runway — can be seen to be absurd without any statistics at all.
 *
 * ── Web Mercator, briefly ─────────────────────────────────────────────────
 *
 * The tiles are Esri's, in the projection every slippy map uses. It is not
 * the projection anything else in this project uses — the globe is
 * orthographic, the grid is plate carrée — so the arithmetic for going
 * between a latitude and a tile row lives here and nowhere else.
 */

import { heat } from './paint'

export interface ShotCell {
  lat: number
  lon: number
  p: number
}

/*
 * The same imagery the map's "Satellite" basemap already uses, so the two
 * views of a place cannot show different ground.
 */
const TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'
const SIZE = 256

/**
 * Three tiles across, at a zoom where the frame is about a degree wide.
 *
 * About sixty kilometres across, so the cell is half the width of the frame
 * and the ground around it is still in view. Wider was tried and the cell
 * became a speck in a lot of nothing; it also drops Esri to a coarser
 * source, where neighbouring scenes are exposed differently enough that the
 * picture reads as a chequerboard of tiles rather than as a landscape.
 */
const FRAME = 3 * SIZE
const ZOOM = 10

/** A quarter degree: the grid the whole project is on. */
const CELL = 0.25

export interface Shot {
  /** How wide the picture is on the ground, in kilometres. */
  km: number
  /** How many of the tiles actually arrived. */
  tiles: number
  attribution: string
}

/**
 * A flame, in a box one unit tall, centred on its own base.
 *
 * A filled circle is the honest mark for a cell — the model is talking
 * about a square of ground, not a point — but on a photograph of Borneo
 * it reads as a map pin, and a reader has to be told what it means. A
 * flame is understood before it is read. The square underneath is still
 * drawn, faintly, so the footprint is not lost to the symbol.
 */
function flame(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - s)
  ctx.bezierCurveTo(x + 0.3 * s, y - 0.42 * s, x + 0.8 * s, y - 0.22 * s, x + 0.64 * s, y + 0.24 * s)
  ctx.bezierCurveTo(x + 0.52 * s, y + 0.88 * s, x - 0.52 * s, y + 0.88 * s, x - 0.64 * s, y + 0.24 * s)
  ctx.bezierCurveTo(x - 0.8 * s, y - 0.22 * s, x - 0.3 * s, y - 0.42 * s, x, y - s)
  ctx.closePath()
  ctx.fill()
}

function lonToX(lon: number, n: number): number {
  return ((lon + 180) / 360) * n
}

function latToY(lat: number, n: number): number {
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
}

/*
 * No `crossOrigin` on purpose.
 *
 * Setting it would make a server that does not send the CORS header fail the
 * load outright, and nothing here ever reads the canvas back — the only cost
 * of a tainted canvas is `toDataURL`, which this page does not call. The
 * picture is worth more than the export.
 */
function tile(z: number, x: number, y: number): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = `${TILES}/${z}/${y}/${x}`
  })
}

/**
 * Draw the neighbourhood of a point: imagery first, the forecast over it.
 *
 * The frame is centred on the point exactly rather than on the tile the
 * point happens to fall in, which is why the tile range is computed from
 * the frame's edges instead of counting outwards from the middle. Half a
 * tile of error is forty kilometres at this zoom, and the reader would be
 * looking at the wrong valley.
 */
export async function drawShot(
  canvas: HTMLCanvasElement,
  at: { lat: number; lon: number },
  cells: ShotCell[],
): Promise<Shot> {
  const n = 2 ** ZOOM
  const world = n * SIZE

  // Where the point lands in the whole world's pixels, and the frame's
  // top-left corner half a frame up and to the left of it.
  const fx = lonToX(at.lon, n) * SIZE
  const fy = latToY(at.lat, n) * SIZE
  const ox = fx - FRAME / 2
  const oy = fy - FRAME / 2

  canvas.width = FRAME
  canvas.height = FRAME
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, FRAME, FRAME)

  const x0 = Math.floor(ox / SIZE)
  const x1 = Math.floor((ox + FRAME - 1) / SIZE)
  const y0 = Math.floor(oy / SIZE)
  const y1 = Math.floor((oy + FRAME - 1) / SIZE)

  let got = 0
  const jobs: Array<Promise<void>> = []
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue
    for (let tx = x0; tx <= x1; tx++) {
      // The world wraps east to west; the rows do not.
      const wrapped = ((tx % n) + n) % n
      jobs.push(
        tile(ZOOM, wrapped, ty).then((img) => {
          if (!img) return
          got++
          ctx.drawImage(img, tx * SIZE - ox, ty * SIZE - oy, SIZE, SIZE)
        }),
      )
    }
  }
  await Promise.all(jobs)

  // A cell is the same number of pixels wide at every latitude, because
  // Mercator stretches north and south only.
  const cellW = (CELL / 360) * world
  const mh = (latToY(at.lat - CELL / 2, n) - latToY(at.lat + CELL / 2, n)) * SIZE
  const mx = Math.round(fx - cellW / 2 - ox)
  const my = Math.round(fy - mh / 2 - oy)
  const mw = Math.round(cellW)
  const mhr = Math.round(mh)

  /*
   * Everything outside the square that was pressed, dimmed.
   *
   * A flat translucent wash of the fire ramp was tried first and it simply
   * vanished: imagery arrives at whatever brightness its source scene had,
   * and the top of the ramp is a pale yellow, so ninety-nine per cent over
   * dry savanna was invisible. Dropping the surroundings by a third gives
   * the ramp something to be brighter than, and says which square is the
   * subject before any outline has to.
   */
  ctx.fillStyle = 'rgba(8,6,4,0.34)'
  ctx.fillRect(0, 0, FRAME, my)
  ctx.fillRect(0, my + mhr, FRAME, FRAME - my - mhr)
  ctx.fillRect(0, my, mx, mhr)
  ctx.fillRect(mx + mw, my, FRAME - mx - mw, mhr)

  /*
   * The forecast over the top: one point of light per expected fire.
   *
   * Translucent squares were tried first and they were the wrong drawing.
   * A quarter-degree square painted over a photograph reads as a stain on
   * the landscape — as though the model were claiming that the whole
   * twenty-five kilometres is alight — and at the top of the ramp, which
   * is nearly white, it washed the ground out exactly where the ground was
   * worth seeing.
   *
   * A point says the true thing: here, in this square, we expect fire. The
   * square is still drawn under it, very faintly, because the point is not
   * a coordinate the model knows — it is the middle of a cell, and the
   * cell is the honest footprint. Brightness and size carry the
   * probability, the way they do on the globe and the map, so the same
   * reading works on all three.
   */
  for (const c of cells) {
    if (c.p < 0.06) continue

    // Bring the cell round to the same side of the world as the frame, so a
    // pick near the date line still finds its neighbours.
    let cx = lonToX(c.lon, n) * SIZE
    if (cx - fx > world / 2) cx -= world
    if (fx - cx > world / 2) cx += world

    const px = Math.round(cx - cellW / 2 - ox)
    const py = Math.round(latToY(c.lat + CELL / 2, n) * SIZE - oy)
    const ph = Math.round(latToY(c.lat - CELL / 2, n) * SIZE - oy) - py
    if (px + cellW < 0 || px > FRAME || py + ph < 0 || py > FRAME) continue

    const [r, g, b] = heat(Math.min(1, c.p))
    const dx = px + cellW / 2
    const dy = py + ph / 2

    /*
     * Squared, so the difference between likely and certain is visible.
     *
     * Straight probability made every point nearly the same size, and in a
     * region where the model is confident about most of the grid that is
     * twenty-five identical dots in rows — a wallpaper, not a forecast.
     * Squaring pushes the quiet cells down to specks and leaves the
     * strongest ones large, which is what the reader is looking for.
     */
    const weight = c.p * c.p

    // The footprint, barely there: enough to see that the forecast is on a
    // grid, not enough to be mistaken for the fire itself.
    ctx.fillStyle = `rgba(${r},${g},${b},${0.03 + weight * 0.1})`
    ctx.fillRect(px, py, Math.round(cellW), ph)

    /*
     * A shadow, then a glow, then a core.
     *
     * The shadow is the part that was missing. A warm translucent glow
     * works over forest and disappears over sand: Iraq and the Sahel are
     * already the colour of the ramp, and the points there were a slightly
     * warmer patch of desert. Laying a soft dark disc under each one first
     * gives every point the same dark ground to burn against whatever is
     * actually underneath, which is what a fire seen from orbit at night
     * has and this daytime image does not.
     *
     * The glow above it is drawn with `lighter` so two neighbouring cells
     * build up the way two fires would instead of the nearer hiding the
     * further, and the core is opaque and small so the point still has a
     * position when the glow has spread over half a valley.
     */
    const shade = ctx.createRadialGradient(dx, dy, 0, dx, dy, 6 + weight * 34)
    shade.addColorStop(0, 'rgba(24,10,2,0.5)')
    shade.addColorStop(0.6, 'rgba(24,10,2,0.26)')
    shade.addColorStop(1, 'rgba(24,10,2,0)')
    ctx.fillStyle = shade
    ctx.beginPath()
    ctx.arc(dx, dy, 6 + weight * 34, 0, Math.PI * 2)
    ctx.fill()

    /*
     * The glow is warmer than the core, because fire is.
     *
     * Taking both from the same place on the ramp made a pale yellow disc
     * — at the top of the ramp that colour is nearly white — and nine of
     * them over a green forest looked like street lamps seen from the air.
     * Reading the halo further down the ramp puts orange around a hot
     * centre, which is the shape of the thing being drawn.
     */
    const [hr, hg, hb] = heat(Math.min(1, c.p * 0.7))
    const glow = 5 + weight * 32
    const halo = ctx.createRadialGradient(dx, dy, 0, dx, dy, glow)
    halo.addColorStop(0, `rgba(${hr},${hg},${hb},${0.4 + weight * 0.55})`)
    halo.addColorStop(0.5, `rgba(${hr},${hg},${hb},${0.16 + weight * 0.34})`)
    halo.addColorStop(1, `rgba(${hr},${hg},${hb},0)`)
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = halo
    ctx.beginPath()
    ctx.arc(dx, dy, glow, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

    /*
     * The mark itself: a flame above about a quarter, a dot below it.
     *
     * The threshold is not taste. A flame drawn at four pixels is a blob
     * with a bump on it — the shape carries no meaning at that size and
     * only adds noise — so the faint cells keep the dot they can be, and
     * the ones worth looking at get the shape that says what they are
     * without a caption.
     *
     * Both are drawn twice: once in a dark outline, once filled. Imagery
     * is whatever colour the scene was, and a symbol with no outline
     * disappears over sand exactly as the glow did.
     */
    const size = 4 + weight * 9
    const hot = weight > 0.5
    const core = hot
      ? `rgba(255,${Math.round(236 + weight * 14)},214,${0.86 + weight * 0.14})`
      : `rgba(${r},${g},${b},${0.78 + weight * 0.22})`

    if (weight > 0.25) {
      ctx.save()
      ctx.shadowColor = 'rgba(20,8,0,0.75)'
      ctx.shadowBlur = 5
      ctx.fillStyle = 'rgba(28,12,2,0.75)'
      flame(ctx, dx, dy - size * 0.1, size * 1.16)
      ctx.restore()
      ctx.fillStyle = core
      flame(ctx, dx, dy - size * 0.1, size)
    } else {
      ctx.save()
      ctx.shadowColor = 'rgba(20,8,0,0.7)'
      ctx.shadowBlur = 4
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(dx, dy, 1.6 + weight * 3.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  /*
   * The cell that was pressed, in white with a shadow under it.
   *
   * White because every other mark on the picture is in the fire ramp, and
   * with a shadow because the one thing it must never do is disappear
   * against a pale field.
   */
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 2
  ctx.shadowColor = 'rgba(0,0,0,0.6)'
  ctx.shadowBlur = 8
  ctx.strokeRect(mx + 0.5, my + 0.5, mw, mhr)
  ctx.shadowBlur = 0

  // Degrees across, turned into kilometres at this latitude.
  const across = (FRAME / (world / 360)) * 111.32 * Math.cos((at.lat * Math.PI) / 180)
  return { km: Math.round(across), tiles: got, attribution: 'Esri · Maxar · Earthstar' }
}
