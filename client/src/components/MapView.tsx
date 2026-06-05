import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection, Point } from 'geojson'
import type { SelectedPhoto } from '../types/photo'

interface MapViewProps {
  onSelectPhoto: (photo: SelectedPhoto) => void
  refreshKey: number
}

export default function MapView({ onSelectPhoto, refreshKey }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const onSelectRef = useRef(onSelectPhoto)

  useEffect(() => {
    onSelectRef.current = onSelectPhoto
  }, [onSelectPhoto])

  // Re-fetch GeoJSON and update source after a new upload
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('photos') as maplibregl.GeoJSONSource | undefined
    if (!source) return
    fetch('/api/photos', { credentials: 'include' })
      .then((r) => r.json())
      .then((geojson) => source.setData(geojson))
      .catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [6.782, 48.869], // Nancy — where the test photo is
      zoom: 6,
    })

    mapRef.current = map

    map.addControl(new maplibregl.NavigationControl(), 'top-right')

    map.on('load', async () => {
      let geojson: FeatureCollection

      try {
        const res = await fetch('/api/photos', { credentials: 'include' })
        geojson = await res.json()
      } catch {
        geojson = { type: 'FeatureCollection', features: [] }
      }

      map.addSource('photos', {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      })

      // Cluster circles
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'photos',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step',
            ['get', 'point_count'],
            '#3b82f6',
            10, '#f59e0b',
            30, '#ef4444',
          ],
          'circle-radius': ['step', ['get', 'point_count'], 20, 10, 30, 30, 40],
          'circle-opacity': 0.85,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.2)',
        },
      })

      // Cluster count labels
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'photos',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size': 13,
        },
        paint: { 'text-color': '#ffffff' },
      })

      // Individual photo markers
      map.addLayer({
        id: 'unclustered-point',
        type: 'circle',
        source: 'photos',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#3b82f6',
          'circle-radius': 9,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      // Click cluster → zoom in
      map.on('click', 'clusters', async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        if (!features.length) return
        const clusterId = features[0].properties?.cluster_id as number
        const source = map.getSource('photos') as maplibregl.GeoJSONSource
        try {
          const zoom = await source.getClusterExpansionZoom(clusterId)
          const coords = (features[0].geometry as Point).coordinates as [number, number]
          map.easeTo({ center: coords, zoom })
        } catch {}
      })

      // Click photo point → open sidebar
      map.on('click', 'unclustered-point', (e) => {
        if (!e.features?.length) return
        const props = e.features[0].properties
        const [lng, lat] = (e.features[0].geometry as Point).coordinates
        onSelectRef.current({
          id: props.id,
          thumb_url: props.thumb_url,
          full_url: props.full_url,
          altitude: props.altitude,
          ai_description: props.ai_description,
          ai_status: props.ai_status,
          taken_at: props.taken_at,
          lng,
          lat,
        })
      })

      map.on('mouseenter', 'clusters', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'clusters', () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'unclustered-point', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'unclustered-point', () => { map.getCanvas().style.cursor = '' })

      // Fit map to data if any features exist
      if (geojson.features.length > 0) {
        const coords = geojson.features.map(
          (f) => (f.geometry as Point).coordinates as [number, number],
        )
        const bounds = coords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(coords[0], coords[0]),
        )
        map.fitBounds(bounds, { padding: 80, maxZoom: 14 })
      }
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  return <div ref={containerRef} className="w-full h-full" />
}
