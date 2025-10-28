import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import type { LatLngExpression } from 'leaflet'
import L from 'leaflet'

const DEFAULT_CENTER: LatLngExpression = [35.6762, 139.6503] // Tokyo as a neutral default
const REQUEST_DELAY_MS = 750
const MAX_MARKERS = 25

const iconUrls = {
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
}

L.Icon.Default.mergeOptions(iconUrls)

const geocodeCache = new Map<string, { lat: number; lon: number } | null>()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export type MapActivity = {
  id: string
  name: string
  time: string
  type: string
  day: number
  address?: string
}

export type ItineraryMapProps = {
  destination: string
  activities: MapActivity[]
  selectedActivityId?: string | null
  onSelectActivity?: (activityId: string) => void
}

type GeocodedActivity = MapActivity & { lat: number; lon: number }

async function geocode(query: string): Promise<{ lat: number; lon: number } | null> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return null

  if (geocodeCache.has(normalized)) {
    return geocodeCache.get(normalized) || null
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`

  try {
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'zh-CN'
      }
    })
    if (!response.ok) throw new Error(`Geocode request failed: ${response.status}`)
    const payload = await response.json()
    if (Array.isArray(payload) && payload.length > 0) {
      const { lat, lon } = payload[0]
      const result = { lat: Number(lat), lon: Number(lon) }
      geocodeCache.set(normalized, result)
      return result
    }
  } catch (err) {
    console.warn('Geocode error', query, err)
  }

  geocodeCache.set(normalized, null)
  return null
}

const FitToMarkers: React.FC<{ markers: GeocodedActivity[]; center: LatLngExpression | null }> = ({ markers, center }) => {
  const map = useMap()

  useEffect(() => {
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.lat, m.lon] as [number, number]))
      map.fitBounds(bounds, { padding: [32, 32] })
    } else if (center) {
      map.setView(center, 11)
    }
  }, [markers, center, map])

  return null
}

const FocusOnSelected: React.FC<{ marker: GeocodedActivity | undefined }> = ({ marker }) => {
  const map = useMap()

  useEffect(() => {
    if (marker) {
      map.flyTo([marker.lat, marker.lon], Math.max(map.getZoom(), 13), { duration: 0.6 })
    }
  }, [marker, map])

  return null
}

const MapSkeleton: React.FC<{ message?: string }> = ({ message }) => (
  <div style={{
    width: '100%',
    height: '100%',
    minHeight: 360,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #eef2ff 0%, #dbeafe 100%)',
    color: '#2563eb',
    borderRadius: 16,
    border: '1px solid rgba(37,99,235,0.2)'
  }}>
    <span>{message || '正在加载智能地图…'}</span>
  </div>
)

const GeocodeNotice: React.FC<{ loading: boolean; error: string | null }> = ({ loading, error }) => (
  <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 1000 }}>
    <div style={{
      background: 'rgba(15,23,42,0.75)',
      color: '#f8fafc',
      padding: '8px 12px',
      borderRadius: 12,
      fontSize: 12,
      maxWidth: 220,
      lineHeight: 1.5
    }}>
      {loading ? '正在定位行程地点，请稍候…' : null}
      {error ? <div style={{ color: '#fca5a5', marginTop: loading ? 4 : 0 }}>{error}</div> : null}
      {!loading && !error ? '提示：点击地图标记或行程卡片以查看详情。' : null}
    </div>
  </div>
)

const ItineraryMapInner: React.FC<ItineraryMapProps> = ({ destination, activities, selectedActivityId, onSelectActivity }) => {
  const [markers, setMarkers] = useState<GeocodedActivity[]>([])
  const [center, setCenter] = useState<LatLngExpression | null>(null)
  const [loadingGeocode, setLoadingGeocode] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  const selectedMarker = useMemo(
    () => markers.find(marker => marker.id === selectedActivityId),
    [markers, selectedActivityId]
  )

  useEffect(() => {
    setReady(true)
    return () => {
      abortRef.current.cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return

    const run = async () => {
      abortRef.current.cancelled = false
      setLoadingGeocode(true)
      setGeocodeError(null)

      try {
        const activitiesWithAddresses = activities.filter(item => item.address && item.address.trim().length > 0)
        const uniqueAddresses = Array.from(
          new Map(
            activitiesWithAddresses
              .slice(0, MAX_MARKERS)
              .map(item => [item.address!.trim().toLowerCase(), item])
          ).values()
        )

        const geocoded: GeocodedActivity[] = []

        const destinationQuery = destination ? `${destination}` : null
        if (destinationQuery) {
          const destCoords = await geocode(destinationQuery)
          if (abortRef.current.cancelled) return
          if (destCoords) {
            setCenter([destCoords.lat, destCoords.lon])
          } else {
            setCenter(DEFAULT_CENTER)
          }
        } else {
          setCenter(DEFAULT_CENTER)
        }

        for (const activity of uniqueAddresses) {
          if (abortRef.current.cancelled) return
          const query = destination ? `${activity.address} ${destination}` : activity.address!
          const coords = await geocode(query)
          if (abortRef.current.cancelled) return
          if (coords) {
            geocoded.push({ ...activity, lat: coords.lat, lon: coords.lon })
          }
          await sleep(REQUEST_DELAY_MS)
        }

        if (!abortRef.current.cancelled) {
          setMarkers(geocoded)
          if (!destinationQuery && geocoded.length > 0) {
            setCenter([geocoded[0].lat, geocoded[0].lon])
          }
          if (geocoded.length === 0 && activitiesWithAddresses.length > 0) {
            setGeocodeError('无法定位部分景点，已为你保留行程卡片。')
          } else if (activitiesWithAddresses.length === 0) {
            setGeocodeError('当前行程缺少地点信息，地图以目的地为中心。')
          }
        }
      } finally {
        setLoadingGeocode(false)
      }
    }

    run()

    return () => {
      abortRef.current.cancelled = true
    }
  }, [activities, destination, ready])

  if (!ready) {
    return <MapSkeleton message="初始化地图组件…" />
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 360 }}>
      <MapContainer
        center={(center as LatLngExpression) || DEFAULT_CENTER}
        zoom={12}
        scrollWheelZoom
        style={{ height: '100%', width: '100%', borderRadius: 16, overflow: 'hidden' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToMarkers markers={markers} center={center} />
        <FocusOnSelected marker={selectedMarker} />
        {markers.map(marker => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lon]}
            eventHandlers={{
              click: () => onSelectActivity?.(marker.id)
            }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong>{marker.name}</strong>
                <div style={{ fontSize: 12, marginTop: 4 }}>{marker.time}</div>
                <div style={{ fontSize: 12, marginTop: 4, color: '#2563eb' }}>Day {marker.day} · {marker.type}</div>
                {marker.address && <div style={{ fontSize: 12, marginTop: 6 }}>{marker.address}</div>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <GeocodeNotice loading={loadingGeocode} error={geocodeError} />
    </div>
  )
}

export default ItineraryMapInner
