'use client'

import { FieldType, FIELD_LABELS } from './types'

const IconSignature = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 20h16M6 16l7-7 3 3-7 7H6v-3z" />
  </svg>
)

const IconInitials = () => (
  <span className="text-[11px] font-semibold tracking-wide">AB</span>
)

const IconDate = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 6V4m8 2V4M5 10h14M6 20h12a2 2 0 002-2v-9a2 2 0 00-2-2H6a2 2 0 00-2 2v9a2 2 0 002 2z" />
  </svg>
)

const IconUser = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 20a8 8 0 0116 0" />
  </svg>
)

const PALETTE_ITEMS: { type: FieldType; icon: React.ReactNode; color: string }[] = [
  { type: 'signature', icon: <IconSignature />, color: 'bg-yellow-500/20 border-yellow-500 text-yellow-700' },
  { type: 'initials', icon: <IconInitials />, color: 'bg-blue-500/20 border-blue-500 text-blue-700' },
  { type: 'date', icon: <IconDate />, color: 'bg-green-500/20 border-green-500 text-green-700' },
  { type: 'name', icon: <IconUser />, color: 'bg-purple-500/20 border-purple-500 text-purple-700' },
]

export default function FieldPalette() {
  const handleDragStart = (e: React.DragEvent, type: FieldType) => {
    e.dataTransfer.setData('fieldType', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">
        Drag Fields
      </h4>
      {PALETTE_ITEMS.map(({ type, icon, color }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => handleDragStart(e, type)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed ${color} cursor-grab active:cursor-grabbing select-none text-sm hover:scale-[1.02] transition-transform`}
        >
          <span className="flex items-center justify-center w-5 h-5">{icon}</span>
          <span className="font-medium text-text-primary">{FIELD_LABELS[type]}</span>
        </div>
      ))}
    </div>
  )
}
