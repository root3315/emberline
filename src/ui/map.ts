/**
 * The map: a real slippy map, with the harmonized fire grid drawn over it.
 *
 * An earlier version drew its own coastlines to stay offline-capable. It was
 * honest but unreadable — an orange rectangle with a few thin lines, and no way
 * to tell a floodplain from a foothill. Real tiles give terrain, settlements
 * and labels for free, and let someone zoom into their own district, which is
 * the first thing anyone actually wants to do with a fire map.
 *
 * The fire grid is a custom canvas layer rather than thousands of Leaflet
 * rectangles: at 5 km cells a large area runs to tens of thousands of squares,
 * and one canvas repaint is the difference between a smooth pan and a locked
 * tab.
 */

import L from 'leaflet'

import { heat, heatScale, rgba, varColor } from './paint'
import type { Bounds } from '../core/types'

export interface MapCell {
  lat: number
  lon: number
  days: number
}

export interface MapModel {
  bounds: Bounds
  cells: MapCell[]
  cellKm: number
  /**
   * Cell size in degrees, for grids that are square in degrees rather than on
   * the ground.
   *
   * The regional grids are metric — a kilometre is a kilometre wherever it is
   * — so their cells are stretched east-west by `1/cos(lat)` to stay square on
   * the map. The global overview is the other kind: its cells are one degree
   * each way by construction, and applying that stretch to them would smear
   * every high-latitude cell into a band several times too wide, which over
   * Siberia and Canada is most of what there is to look at.
   */
  cellDeg?: number
  /**
   * Whether to outline the area. Off for the planet: a dashed rectangle round
   * the whole world says nothing, and at that zoom it sits on the edge of the
   * viewport pretending to be a border.
   */
  frame?: boolean
  /**
   * The value that should read as the top of the colour ramp.
   *
   * Given, the colours mean the same thing in every view. Left out, the layer
   * scales to its own cells, which is only right when the cells *are* the
   * subject — a region's own map, where "busy for here" is the question.
   */
  ceiling?: number
  /**
   * Individual detections, drawn instead of the grid when they are present.
   *
   * Past about a kilometre a cell is a lie of precision: a MODIS pixel is a
   * kilometre at nadir and spreads past five at the edge of the swath. What
   * survives that zoom is the detection itself — a point the satellite flagged
   * at a known minute — so at that range the map stops drawing squares and
   * draws what was actually measured.
   */
  points?: MapPoint[]
}

export interface MapPoint {
  lat: number
  lon: number
  /** Minutes past midnight, UTC. */
  minute: number
  frp: number
  day: number
  viirs: boolean
  confidence: number
}

export type Basemap = 'dark' | 'satellite' | 'relief'

/*
 * All three sources serve tiles without an API key. CARTO's basemaps were the
 * obvious dark choice until they started stamping "API KEY REQUIRED" across
 * every tile, which is worse than no basemap at all.
 */
const ESRI_CANVAS = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
const ESRI_IMAGERY = 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
const ESRI_RELIEF = 'Shaded relief &copy; Esri'

interface TileSpec {
  url: string
  attribution: string
  maxZoom: number
  /** Swapped in under the daylight theme. */
  light?: string
  /** Place names, drawn above the fire so a label is never buried by data. */
  labels?: string
  labelsLight?: string
}

const TILES: Record<Basemap, TileSpec> = {
  dark: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    labelsLight:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution: ESRI_CANVAS,
    maxZoom: 16,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: ESRI_IMAGERY,
    maxZoom: 18,
  },
  relief: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    labels:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: ESRI_RELIEF,
    maxZoom: 13,
  },
}

/** Canvas layer that paints the grid in one pass, in sync with the map. */
const FireLayer = L.Layer.extend({
  initialize(this: FireLayerInstance) {
    this._cells = []
    this._cellKm = 5
    this._ceiling = 1
    this._drawnZoom = 0
    this._drawnCenter = null
  },

  onAdd(this: FireLayerInstance, map: L.Map) {
    this._map = map as ZoomingMap
    // `leaflet-zoom-animated` is not decoration. Leaflet drives its zoom with a
    // CSS transition on the panes, and only elements carrying that class are
    // transitioned along with it — without it the transform handed over in
    // `zoomanim` lands instantly while the tiles are still travelling, so the
    // grid sits in the wrong corner for the length of the animation and snaps
    // back at the end.
    const canvas = L.DomUtil.create(
      'canvas',
      'fire-layer leaflet-zoom-animated',
    ) as HTMLCanvasElement
    canvas.style.position = 'absolute'
    canvas.style.pointerEvents = 'none'
    this._canvas = canvas
    map.getPanes().overlayPane.appendChild(canvas)
    map.on('moveend zoomend resize viewreset', this._reset, this)
    // Both: `zoomanim` is the discrete animated jump, `zoom` fires repeatedly
    // through a pinch or a held wheel. Handling only the first left the canvas
    // frozen for the whole gesture and snapping into place at the end.
    map.on('zoomanim', this._animateZoom, this)
    map.on('zoom', this._onZoom, this)
    this._reset()
  },

  onRemove(this: FireLayerInstance, map: L.Map) {
    this._canvas?.remove()
    map.off('moveend zoomend resize viewreset', this._reset, this)
    map.off('zoomanim', this._animateZoom, this)
    map.off('zoom', this._onZoom, this)
  },

  setData(
    this: FireLayerInstance,
    cells: MapCell[],
    cellKm: number,
    cellDeg?: number,
    ceiling?: number,
    points?: MapPoint[],
  ) {
    this._points = points
    this._cells = cells
    this._cellKm = cellKm
    this._cellDeg = cellDeg
    if (ceiling && ceiling > 0) {
      this._ceiling = ceiling
    } else {
      // Key the ramp off a high percentile: one square that burned every week
      // of the year would otherwise flatten a whole region into one shade.
      const sorted = cells.map((c) => c.days).sort((a, b) => a - b)
      this._ceiling = Math.max(1, sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.97)] : 1)
    }
    this._reset()
  },

  /**
   * Carry the painted canvas through a zoom instead of repainting it.
   *
   * The pixels are only redrawn when the gesture settles; until then the same
   * image is scaled and shifted to stand in, which is what every Leaflet
   * renderer does and what keeps a pinch smooth. The arithmetic has to be
   * against the view the canvas was *drawn* for, not the live one — using the
   * live zoom means comparing a frame to itself, the scale comes out as 1, and
   * the fires sit still while the basemap moves underneath them.
   */
  _transform(this: FireLayerInstance, center: L.LatLng, zoom: number) {
    const map = this._map
    const canvas = this._canvas
    if (!map || !canvas || this._drawnCenter === null) return
    const scale = map.getZoomScale(zoom, this._drawnZoom)
    const half = map.getSize().multiplyBy(0.5)
    const drawnCentre = map.project(this._drawnCenter, zoom)
    const offset = half.multiplyBy(-scale).add(drawnCentre).subtract(map._getNewPixelOrigin(center, zoom))
    L.DomUtil.setTransform(canvas, offset, scale)
  },

  _animateZoom(this: FireLayerInstance, e: L.ZoomAnimEvent) {
    this._transform(e.center, e.zoom)
  },

  _onZoom(this: FireLayerInstance) {
    if (this._map) this._transform(this._map.getCenter(), this._map.getZoom())
  },

  _reset(this: FireLayerInstance) {
    const map = this._map
    const canvas = this._canvas
    if (!map || !canvas) return

    const size = map.getSize()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size.x * dpr
    canvas.height = size.y * dpr
    canvas.style.width = `${size.x}px`
    canvas.style.height = `${size.y}px`

    const topLeft = map.containerPointToLayerPoint([0, 0])
    L.DomUtil.setPosition(canvas, topLeft)
    // Remember what this paint is for, so a gesture can be measured against it.
    this._drawnZoom = map.getZoom()
    this._drawnCenter = map.getCenter()

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)

    const bounds = map.getBounds().pad(0.05)

    /**
     * Detections, when there are any: one dot each, all the same size.
     *
     * The same size on purpose. The footprint of a detection is not knowable
     * from the row — it depends where in the swath the pixel fell — so drawing
     * circles of different radii would be inventing a shape. FIRMS draws fixed
     * markers for the same reason. Colour carries the one thing that *is*
     * measured, the radiative power, and the faintest ring marks a low
     * confidence flag.
     */
    if (this._points) {
      const ceiling = Math.max(1, this._ceiling)
      for (const pt of this._points) {
        if (pt.lat > bounds.getNorth() || pt.lat < bounds.getSouth()) continue
        if (pt.lon > bounds.getEast() || pt.lon < bounds.getWest()) continue
        const t = heatScale(Math.max(1, pt.frp), ceiling, 0.55)
        const at = map.latLngToContainerPoint([pt.lat, pt.lon])
        ctx.beginPath()
        ctx.arc(at.x, at.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = rgba(heat(t), pt.confidence === 0 ? 0.35 : 0.85)
        ctx.fill()
        if (pt.confidence === 2) {
          ctx.lineWidth = 1
          ctx.strokeStyle = rgba(heat(Math.min(1, t + 0.25)), 0.9)
          ctx.stroke()
        }
      }
      return
    }

    const deg = this._cellDeg
    const dLat = deg ?? this._cellKm / 111.32

    /**
     * One copy of the world carries the fires, and it is the one in the
     * middle of the view.
     *
     * Zoomed out, the basemap tiles the Earth sideways for ever and the
     * viewport can hold two or three of them. Drawing the cells on every
     * copy was the first fix, for the opposite fault — fires on one strip
     * between two blank oceans — and it overshot: three burning Earths side
     * by side read as three planets rather than one seen three times.
     *
     * Drawing on none but the nearest is not an option either, because the
     * copies are how Leaflet lets anyone look at Chukotka or Fiji in one
     * piece; the date line falls in the middle of the only copy that has
     * them together. So the shift is chosen from where the reader is
     * actually looking, and it follows them across the seam.
     */
    const middle = (bounds.getWest() + bounds.getEast()) / 2
    const shift = Math.round(middle / 360) * 360

    for (const cell of this._cells) {
      if (cell.lat > bounds.getNorth() || cell.lat < bounds.getSouth()) continue
      const t = heatScale(cell.days, this._ceiling, 0.62)
      if (t <= 0) continue

      const dLon = deg ?? dLat / Math.max(Math.cos((cell.lat * Math.PI) / 180), 0.05)
      /**
       * Faint cells stay faint, and let the ground through.
       *
       * Opacity used to start at 0.78 whatever the value, so a cell that
       * burned twice in a year was a solid slab — over the satellite basemap,
       * an opaque rectangle covering a district. Tying it to the same scale as
       * the colour means a quiet cell is a tint over the imagery and only a
       * genuinely busy one blocks it out.
       */
      ctx.fillStyle = rgba(heat(t), 0.25 + t * 0.65)

      const lon = cell.lon + shift
      if (lon + dLon < bounds.getWest() || lon - dLon > bounds.getEast()) continue
      const nw = map.latLngToContainerPoint([cell.lat + dLat / 2, lon - dLon / 2])
      const se = map.latLngToContainerPoint([cell.lat - dLat / 2, lon + dLon / 2])

      // Half a pixel of bleed, or the seams read as a honeycomb texture.
      const w = Math.max(1.5, se.x - nw.x + 0.5)
      const h = Math.max(1.5, se.y - nw.y + 0.5)
      ctx.fillRect(nw.x, nw.y, w, h)
    }
  },
})

/**
 * Leaflet's zoom animation hook needs an internal method that its public types
 * do not expose; this is the narrow surface we actually touch.
 */
type ZoomingMap = L.Map & {
  _latLngBoundsToNewLayerBounds(b: L.LatLngBounds, z: number, c: L.LatLng): L.Bounds
  _getNewPixelOrigin(center: L.LatLng, zoom: number): L.Point
}

interface FireLayerInstance extends Omit<L.Layer, '_map'> {
  _map: ZoomingMap | null
  _canvas: HTMLCanvasElement | null
  _cells: MapCell[]
  _points?: MapPoint[]
  _cellKm: number
  _cellDeg?: number
  _ceiling: number
  _drawnZoom: number
  _drawnCenter: L.LatLng | null
  _transform(center: L.LatLng, zoom: number): void
  _onZoom(): void
  setData(
    cells: MapCell[],
    cellKm: number,
    cellDeg?: number,
    ceiling?: number,
    points?: MapPoint[],
  ): void
  _reset(): void
  _animateZoom(e: L.ZoomAnimEvent): void
}

let map: L.Map | null = null
let tiles: L.TileLayer | null = null
let labelTiles: L.TileLayer | null = null
let fire: FireLayerInstance | null = null
let aoiFrame: L.Rectangle | null = null
let basemap: Basemap = 'dark'
let currentModel: MapModel | null = null

export interface MapProbe {
  lat: number
  lon: number
  days: number
  /** The detection under the pointer, when detections are what is drawn. */
  point?: MapPoint
}

function daylight(): boolean {
  return document.documentElement.dataset.theme === 'day'
}

function tileUrl(kind: Basemap): string {
  const spec = TILES[kind]
  return daylight() && spec.light ? spec.light : spec.url
}

function labelUrl(kind: Basemap): string | undefined {
  const spec = TILES[kind]
  return daylight() && spec.labelsLight ? spec.labelsLight : spec.labels
}

/** (Re)build both tile layers for a basemap. */
function mountTiles(kind: Basemap): void {
  if (!map) return
  tiles?.remove()
  labelTiles?.remove()

  tiles = L.tileLayer(tileUrl(kind), {
    attribution: TILES[kind].attribution,
    maxZoom: TILES[kind].maxZoom,
    className: 'basemap-tiles',
    crossOrigin: true,
  }).addTo(map)

  const labels = labelUrl(kind)
  labelTiles = labels
    ? L.tileLayer(labels, { maxZoom: TILES[kind].maxZoom, pane: 'labels', crossOrigin: true }).addTo(map)
    : null
}

/** Create the map once; later calls only swap data. */
export function ensureMap(container: HTMLElement, onProbe: (probe: MapProbe | null) => void): void {
  if (map) return

  map = L.map(container, {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: false, // a wheel over a long page should scroll the page
    worldCopyJump: true,
    /**
     * Let a fit land between whole zooms.
     *
     * Leaflet rounds a fitted zoom down to the nearest step, and one step is a
     * factor of two. Framing the planet in a container barely under the next
     * step therefore halved it: the Earth came out 256 pixels tall inside 534,
     * marooned in a field of empty page, and every reader read that as the
     * page being broken rather than as arithmetic. With no snap the fit uses
     * the zoom it actually computed and the map fills what it was given.
     */
    zoomSnap: 0,
  })
  map.attributionControl.setPrefix('')

  /**
   * Give it a view immediately, before anything else can need one.
   *
   * A Leaflet map created without `setView` has no centre and no zoom, and
   * adding a vector layer to it crashes inside the renderer on bounds that
   * were never computed. Every path that draws data calls `fitBounds` and so
   * hid the problem — until the snapshot path, which returns early on its
   * first pass while it fetches tiles and therefore reached the frame
   * rectangle with the map still uninitialised. Whatever view is set here is
   * replaced within the same tick by the real one.
   */
  map.setView([20, 0], 2)

  // Labels ride in their own pane above the fire grid, so a place name is never
  // lost under a hot cell — the whole point of putting the map back underneath.
  map.createPane('labels')
  map.getPane('labels')!.style.zIndex = '450'
  map.getPane('labels')!.style.pointerEvents = 'none'

  mountTiles(basemap)

  fire = new (FireLayer as unknown as new () => FireLayerInstance)()
  fire.addTo(map)

  // Ctrl/⌘ + wheel zooms, which keeps the page scrollable but still allows it.
  map.on('mousemove', (e: L.LeafletMouseEvent) => onProbe(probeAt(e.latlng.lat, e.latlng.lng)))
  map.on('mouseout', () => onProbe(null))
}

function probeAt(lat: number, lon: number): MapProbe | null {
  if (!currentModel) return null

  // With detections on screen the question changes from "how much burned in
  // this square" to "what is that dot", so the nearest one within about a
  // kilometre answers instead.
  if (currentModel.points) {
    const reach = 0.012
    let best: MapPoint | null = null
    let bestDist = Infinity
    for (const pt of currentModel.points) {
      const dy = pt.lat - lat
      if (Math.abs(dy) > reach) continue
      const dx = (pt.lon - lon) * Math.max(Math.cos((lat * Math.PI) / 180), 0.05)
      if (Math.abs(dx) > reach) continue
      const d = dy * dy + dx * dx
      if (d < bestDist) {
        bestDist = d
        best = pt
      }
    }
    return best ? { lat, lon, days: 0, point: best } : { lat, lon, days: 0 }
  }

  const dLat = currentModel.cellKm / 111.32
  let best: MapCell | null = null
  let bestDist = Infinity
  for (const c of currentModel.cells) {
    const dy = Math.abs(c.lat - lat)
    if (dy > dLat) continue
    const dLon = dLat / Math.max(Math.cos((c.lat * Math.PI) / 180), 0.05)
    const dx = Math.abs(c.lon - lon)
    if (dx > dLon) continue
    const dist = dy * dy + dx * dx
    if (dist < bestDist) {
      bestDist = dist
      best = c
    }
  }
  return { lat, lon, days: best?.days ?? 0 }
}

export function setBasemap(kind: Basemap): void {
  basemap = kind
  mountTiles(kind)
}

export function refreshBasemapTheme(): void {
  mountTiles(basemap)
  fire?._reset()
}

/** Point the map at an area and hand it new cells. */
export function updateMap(model: MapModel | null, fit: boolean): void {
  if (!map || !fire || !model) return
  currentModel = model

  const b = L.latLngBounds([model.bounds.south, model.bounds.west], [model.bounds.north, model.bounds.east])

  /**
   * Drop the old frame, defensively.
   *
   * Leaflet builds a path element when a vector layer is added and tears it
   * down on removal by reaching for its parent. If the layer was added while
   * the map had no renderer yet — which happens when the map is drawn into a
   * container that is still hidden — that element never existed, and the
   * teardown throws on `undefined.parentNode`, taking the whole render with
   * it. The frame is decoration; it must not be able to stop the map.
   */
  if (aoiFrame) {
    try {
      aoiFrame.remove()
    } catch {
      // Already gone, or never fully added.
    }
  }
  aoiFrame = null
  if (model.frame === false) {
    if (fit) map.fitBounds(b, { padding: [14, 14], animate: false })
    fire.setData(model.cells, model.cellKm, model.cellDeg, model.ceiling, model.points)
    return
  }
  aoiFrame = L.rectangle(b, {
    color: rgba(varColor('--ember'), 0.65),
    weight: 1,
    dashArray: '5 4',
    fill: false,
    interactive: false,
  }).addTo(map)

  if (fit) map.fitBounds(b, { padding: [14, 14], animate: false })
  fire.setData(model.cells, model.cellKm, model.cellDeg, model.ceiling, model.points)
}

/**
 * Tell Leaflet the container changed, and frame the area again.
 *
 * `invalidateSize` alone keeps the zoom it had, which is the wrong one: the
 * fit that chose it ran while the container was still the old size. Switching
 * to the planet did exactly that — the sections above the map were hidden a
 * frame later, the container grew by two hundred pixels, and the Earth stayed
 * the size it had been, sitting in a band of empty page.
 */
export function invalidateMapSize(refit = false): void {
  if (!map) return
  map.invalidateSize({ animate: false })
  const b = refit && currentModel ? currentModel.bounds : null
  if (b) {
    map.fitBounds(
      L.latLngBounds([b.south, b.west], [b.north, b.east]),
      { padding: [14, 14], animate: false },
    )
  }
}

/** The current zoom, for callers deciding how much detail to hand over. */
export function mapZoom(): number {
  return map?.getZoom() ?? 2
}

/**
 * Redraw when the camera settles at a new zoom.
 *
 * The layer already rescales its own pixels through a gesture, but a change
 * of pyramid level is not a rescale — it is different data — so the page has
 * to be told once the zoom is final, and only when it actually crossed a
 * boundary.
 */
export function onZoomSettled(fn: (zoom: number) => void): void {
  map?.on('zoomend', () => fn(map?.getZoom() ?? 2))
}

/**
 * The same, for a drag.
 *
 * Only the tiled level needs this: the coarser grids are the whole planet and
 * a pan is a repaint. At a twentieth of a degree the page is holding a few
 * squares of ground, and dragging past their edge reaches the end of what was
 * fetched — so the caller is told, and asks for the next ones.
 */
export function onMoveSettled(fn: () => void): void {
  map?.on('moveend', () => fn())
}

/**
 * What the viewport covers, for callers that fetch by area.
 *
 * The west edge is wrapped into the ordinary range and the east one is left
 * beyond it when the view straddles the date line — `west` 179, `east` 181
 * rather than 179 and −179. Clamping both to ±180 instead put the east edge
 * *west* of the west one, which reads as an empty area and would have left the
 * map blank for anyone looking at Chukotka or Fiji.
 */
export function mapBox(): Bounds {
  const b = map?.getBounds()
  if (!b) return { west: -180, south: -90, east: 180, north: 90 }
  const span = Math.min(360, b.getEast() - b.getWest())
  const west = ((((b.getWest() + 180) % 360) + 360) % 360) - 180
  return {
    west,
    south: Math.max(-90, b.getSouth()),
    east: west + span,
    north: Math.min(90, b.getNorth()),
  }
}
