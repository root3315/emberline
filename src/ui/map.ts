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
    map.on('zoomanim', this._animateZoom, this)
    this._reset()
  },

  onRemove(this: FireLayerInstance, map: L.Map) {
    this._canvas?.remove()
    map.off('moveend zoomend resize viewreset', this._reset, this)
    map.off('zoomanim', this._animateZoom, this)
  },

  setData(this: FireLayerInstance, cells: MapCell[], cellKm: number) {
    this._cells = cells
    this._cellKm = cellKm
    // Key the ramp off a high percentile: one square that burned every week of
    // the year would otherwise flatten a whole region into one shade.
    const sorted = cells.map((c) => c.days).sort((a, b) => a - b)
    this._ceiling = Math.max(1, sorted.length ? sorted[Math.floor((sorted.length - 1) * 0.97)] : 1)
    this._reset()
  },

  _animateZoom(this: FireLayerInstance, e: L.ZoomAnimEvent) {
    if (!this._canvas || !this._map) return
    const scale = this._map.getZoomScale(e.zoom, this._map.getZoom())
    const offset = this._map._latLngBoundsToNewLayerBounds(this._map.getBounds(), e.zoom, e.center).min
    if (offset) L.DomUtil.setTransform(this._canvas, offset, scale)
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

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)

    const dLat = this._cellKm / 111.32
    const bounds = map.getBounds().pad(0.05)

    for (const cell of this._cells) {
      if (!bounds.contains([cell.lat, cell.lon])) continue
      const t = heatScale(cell.days, this._ceiling, 0.62)
      if (t <= 0) continue

      const dLon = dLat / Math.max(Math.cos((cell.lat * Math.PI) / 180), 0.05)
      const nw = map.latLngToContainerPoint([cell.lat + dLat / 2, cell.lon - dLon / 2])
      const se = map.latLngToContainerPoint([cell.lat - dLat / 2, cell.lon + dLon / 2])

      // Half a pixel of bleed, or the seams read as a honeycomb texture.
      const w = Math.max(1.5, se.x - nw.x + 0.5)
      const h = Math.max(1.5, se.y - nw.y + 0.5)
      ctx.fillStyle = rgba(heat(t), 0.78 + t * 0.2)
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
}

interface FireLayerInstance extends Omit<L.Layer, '_map'> {
  _map: ZoomingMap | null
  _canvas: HTMLCanvasElement | null
  _cells: MapCell[]
  _cellKm: number
  _ceiling: number
  setData(cells: MapCell[], cellKm: number): void
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
  })
  map.attributionControl.setPrefix('')

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

  if (aoiFrame) aoiFrame.remove()
  aoiFrame = L.rectangle(b, {
    color: rgba(varColor('--ember'), 0.65),
    weight: 1,
    dashArray: '5 4',
    fill: false,
    interactive: false,
  }).addTo(map)

  if (fit) map.fitBounds(b, { padding: [14, 14], animate: false })
  fire.setData(model.cells, model.cellKm)
}

export function invalidateMapSize(): void {
  map?.invalidateSize({ animate: false })
}
