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

const IconNote = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 8h6M9 12h6M9 16h4" />
  </svg>
)

const IconStamp = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 18h10m-8-6a3 3 0 116 0c0 1.5-.8 2.2-1.5 3H8.5c-.7-.8-1.5-1.5-1.5-3z" />
  </svg>
)

const IconText = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M10 6v12m4-12v12" />
  </svg>
)

const IconNumber = () => (
  <span className="text-[11px] font-semibold tracking-wide">123</span>
)

const IconDrawing = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 17l8-8 3 3-8 8H4v-3z" />
  </svg>
)

const IconFormula = () => (
  <span className="text-[11px] font-semibold tracking-wide">fx</span>
)

const IconEmail = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16v12H4z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7l8 6 8-6" />
  </svg>
)

const PALETTE_GROUPS: {
  title: string
  description?: string
  items: { type: FieldType; icon: React.ReactNode; accent: string }[]
}[] = [
  {
    title: 'Sign',
    items: [
      { type: 'signature', icon: <IconSignature />, accent: 'text-yellow-700' },
      { type: 'initials', icon: <IconInitials />, accent: 'text-blue-700' },
      { type: 'stamp', icon: <IconStamp />, accent: 'text-rose-700' },
      { type: 'drawing', icon: <IconDrawing />, accent: 'text-indigo-700' },
    ],
  },
  {
    title: 'Identity',
    items: [
      { type: 'name', icon: <IconUser />, accent: 'text-purple-700' },
      { type: 'email', icon: <IconEmail />, accent: 'text-teal-700' },
    ],
  },
  {
    title: 'Dates & Numbers',
    items: [
      { type: 'date', icon: <IconDate />, accent: 'text-green-700' },
      { type: 'number', icon: <IconNumber />, accent: 'text-emerald-700' },
    ],
  },
  {
    title: 'Text & Notes',
    items: [
      { type: 'text', icon: <IconText />, accent: 'text-cyan-700' },
      { type: 'note', icon: <IconNote />, accent: 'text-orange-700' },
      { type: 'formula', icon: <IconFormula />, accent: 'text-slate-700' },
    ],
  },
]

export default function FieldPalette() {
  const handleDragStart = (e: React.DragEvent, type: FieldType) => {
    e.dataTransfer.setData('fieldType', type)
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          Drag Fields
        </h4>
        <p className="text-xs text-text-tertiary mt-1">
          Drag a field onto the document to place it.
        </p>
      </div>

      {PALETTE_GROUPS.map((group) => (
        <div key={group.title} className="bg-white rounded-xl border border-border-secondary p-3 shadow-sm">
          <div className="mb-2">
            <div className="text-sm font-semibold text-text-primary">{group.title}</div>
            {group.description && (
              <div className="text-xs text-text-tertiary">{group.description}</div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {group.items.map(({ type, icon, accent }) => (
              <div
                key={type}
                draggable
                onDragStart={(e) => handleDragStart(e, type)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border-secondary bg-bg-secondary hover:bg-bg-tertiary cursor-grab active:cursor-grabbing select-none text-sm transition-colors"
              >
                <span className={`flex items-center justify-center w-5 h-5 ${accent}`}>{icon}</span>
                <span className="font-medium text-text-primary">{FIELD_LABELS[type]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
