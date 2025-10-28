import React from 'react'
import dynamic from 'next/dynamic'
import type { ItineraryMapProps } from './ItineraryMap.client'
export type { MapActivity } from './ItineraryMap.client'

const ItineraryMap = dynamic(() => import('./ItineraryMap.client'), {
  ssr: false,
  loading: () => (
    <div style={{
      width: '100%',
      height: '100%',
      minHeight: 360,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #fdf2f8 0%, #e0f2fe 100%)',
      borderRadius: 16,
      color: '#1d4ed8'
    }}>
      正在加载地图模块…
    </div>
  )
})

export default ItineraryMap as React.ComponentType<ItineraryMapProps>
