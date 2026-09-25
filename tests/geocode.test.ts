import { describe, expect, it } from 'vitest'

import { distinctPlaces, type Place } from '../src/core/geocode'

const place = (
  name: string,
  south: number,
  north: number,
  west: number,
  east: number,
  detail = 'Valle del Cauca, Colombia',
): Place => ({
  name,
  detail,
  lat: (south + north) / 2,
  lon: (west + east) / 2,
  bounds: { south, north, west, east },
})

describe('geocoder results', () => {
  it('keeps one row when a city comes back as its boundary and as its centre', () => {
    const boundary = place('Cali', 3.2, 3.7, -76.8, -76.3)
    const centre = place('Cali', 3.2, 3.7, -76.78, -76.28)
    expect(distinctPlaces([boundary, centre])).toEqual([boundary])
  })

  it('keeps two places that share a name but not the ground', () => {
    const colombia = place('Cali', 3.2, 3.7, -76.8, -76.3)
    const elsewhere = place('Cali', 10.1, 10.6, -66.9, -66.4, 'Miranda, Venezuela')
    expect(distinctPlaces([colombia, elsewhere])).toHaveLength(2)
  })

  it('keeps one of two rows a reader could not tell apart, whatever their boxes', () => {
    const city = place('Moscow', 55.5, 56.0, 37.3, 37.9)
    const oblast = place('Moscow', 54.2, 56.9, 35.1, 40.2)
    expect(distinctPlaces([city, oblast])).toEqual([city])
  })

  it('keeps a region and a city inside it, which are different boxes', () => {
    const city = place('Cali', 3.2, 3.7, -76.8, -76.3)
    const province = place('Valle del Cauca', 3.0, 5.0, -77.6, -75.7)
    expect(distinctPlaces([province, city])).toHaveLength(2)
  })
})
