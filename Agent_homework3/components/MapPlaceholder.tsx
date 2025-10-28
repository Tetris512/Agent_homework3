import React from 'react'

type Props = { address?: string }

export default function MapPlaceholder({ address }: Props) {
  if (!address) return <div style={{ padding: 12, border: '1px dashed #ccc' }}>未提供地址，无法显示地图</div>
  const q = encodeURIComponent(address)
  const url = `https://www.google.com/maps/search/?api=1&query=${q}`
  return (
    <div style={{ padding: 8, border: '1px solid #eee', borderRadius: 6, maxWidth: 600 }}>
      <div style={{ marginBottom: 8 }}>{address}</div>
      <a href={url} target="_blank" rel="noreferrer">在地图中查看</a>
    </div>
  )
}
