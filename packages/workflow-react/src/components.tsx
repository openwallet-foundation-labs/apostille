import React from 'react'

export type AssetsMap = Record<string, { mediaType: string; uri?: string; attachmentId?: string }>

export function TextItem({ text }: { text?: string }) {
  return <div>{text}</div>
}

export function ButtonItem({ label, disabled, onClick }: { label?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  )
}

export function Divider() {
  return <hr />
}

export function Spacer({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'sm' ? 8 : size === 'lg' ? 24 : 16
  return <div style={{ height: h }} />
}

export function Card({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
      {title ? <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div> : null}
      {children}
    </div>
  )
}

export function Container({ children }: { children?: React.ReactNode }) {
  return <div>{children}</div>
}

export function List({ items }: { items: Array<string | React.ReactNode> }) {
  return (
    <ul>
      {items.map((it, idx) => (
        <li key={idx}>{it}</li>
      ))}
    </ul>
  )
}

export function Table({ columns, rows }: { columns: Array<{ key: string; label: string }>; rows: Array<Record<string, React.ReactNode>> }) {
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, idx) => (
          <tr key={idx}>
            {columns.map((c) => (
              <td key={c.key}>{r[c.key] as React.ReactNode}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Badge({ label, variant }: { label: string; variant?: string }) {
  return <span style={{ padding: '2px 6px', borderRadius: 8, border: '1px solid #ddd' }}>{label}</span>
}

export function ImageItem({ asset, src, alt, assets }: { asset?: string; src?: string; alt?: string; assets?: AssetsMap }) {
  const finalSrc = asset && assets && assets[asset]?.uri ? assets[asset].uri : src
  if (!finalSrc) return null
  return <img src={finalSrc} alt={alt || ''} />
}

export function VideoItem({ asset, src, assets }: { asset?: string; src?: string; assets?: AssetsMap }) {
  const finalSrc = asset && assets && assets[asset]?.uri ? assets[asset].uri : src
  if (!finalSrc) return null
  return (
    <video src={finalSrc} controls>
      Your browser does not support the video tag.
    </video>
  )
}

