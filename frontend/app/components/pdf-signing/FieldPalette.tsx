'use client'

import { FieldType, FIELD_LABELS } from './types'

const PALETTE_ITEMS: { type: FieldType; icon: string; color: string }[] = [
  { type: 'signature', icon: '✍', color: 'bg-yellow-500/20 border-yellow-500' },
  { type: 'initials', icon: 'AB', color: 'bg-blue-500/20 border-blue-500' },
  { type: 'date', icon: '📅', color: 'bg-green-500/20 border-green-500' },
  { type: 'name', icon: '👤', color: 'bg-purple-500/20 border-purple-500' },
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
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed ${color} cursor-grab active:cursor-grabbing select-none text-sm text-text-primary hover:scale-[1.02] transition-transform`}
        >
          <span className="text-base">{icon}</span>
          <span className="font-medium">{FIELD_LABELS[type]}</span>
        </div>
      ))}
    </div>
  )
}
