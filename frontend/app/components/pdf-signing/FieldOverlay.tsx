'use client'

import { useRef, useCallback, useState } from 'react'
import { SigningField, FIELD_LABELS } from './types'
import type { PageDimensions } from './PdfViewer'

interface FieldOverlayProps {
  fields: SigningField[]
  pageIndex: number
  pageDimensions: PageDimensions
  editable: boolean
  onFieldUpdate?: (field: SigningField) => void
  onFieldDelete?: (fieldId: string) => void
  onFieldClick?: (field: SigningField) => void
  activeFieldId?: string
  completions?: Record<string, string> // fieldId → dataUrl for filled signatures
}

const FIELD_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  signature: { border: 'border-yellow-500', bg: 'bg-yellow-500/15', text: 'text-yellow-600' },
  initials: { border: 'border-blue-500', bg: 'bg-blue-500/15', text: 'text-blue-600' },
  date: { border: 'border-green-500', bg: 'bg-green-500/15', text: 'text-green-600' },
  name: { border: 'border-purple-500', bg: 'bg-purple-500/15', text: 'text-purple-600' },
  note: { border: 'border-orange-500', bg: 'bg-orange-500/15', text: 'text-orange-600' },
  stamp: { border: 'border-rose-500', bg: 'bg-rose-500/15', text: 'text-rose-600' },
  text: { border: 'border-cyan-500', bg: 'bg-cyan-500/15', text: 'text-cyan-600' },
  number: { border: 'border-emerald-500', bg: 'bg-emerald-500/15', text: 'text-emerald-600' },
  drawing: { border: 'border-indigo-500', bg: 'bg-indigo-500/15', text: 'text-indigo-600' },
  formula: { border: 'border-slate-500', bg: 'bg-slate-500/15', text: 'text-slate-600' },
  email: { border: 'border-teal-500', bg: 'bg-teal-500/15', text: 'text-teal-600' },
}

export default function FieldOverlay({
  fields,
  pageIndex,
  pageDimensions,
  editable,
  onFieldUpdate,
  onFieldDelete,
  onFieldClick,
  activeFieldId,
  completions,
}: FieldOverlayProps) {
  const dragRef = useRef<{ fieldId: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeRef = useRef<{ fieldId: string; startX: number; startY: number; origW: number; origH: number } | null>(null)
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null)
  const [resizeDelta, setResizeDelta] = useState<{ w: number; h: number } | null>(null)

  const pageFields = fields.filter((f) => f.page === pageIndex)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, field: SigningField) => {
      if (!editable) return
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = {
        fieldId: field.id,
        startX: e.clientX,
        startY: e.clientY,
        origX: field.x,
        origY: field.y,
      }

      const handleMove = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const dy = ev.clientY - dragRef.current.startY
        setDragDelta({ x: dx, y: dy })
      }

      const handleUp = (ev: MouseEvent) => {
        if (!dragRef.current) return
        const dx = ev.clientX - dragRef.current.startX
        const dy = ev.clientY - dragRef.current.startY
        const dxPct = (dx / pageDimensions.width) * 100
        const dyPct = (dy / pageDimensions.height) * 100
        const newX = Math.max(0, Math.min(100 - field.width, dragRef.current.origX + dxPct))
        const newY = Math.max(0, Math.min(100 - field.height, dragRef.current.origY + dyPct))
        onFieldUpdate?.({ ...field, x: newX, y: newY })
        dragRef.current = null
        setDragDelta(null)
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [editable, pageDimensions, onFieldUpdate]
  )

  const handleResizeDown = useCallback(
    (e: React.MouseEvent, field: SigningField) => {
      if (!editable) return
      e.preventDefault()
      e.stopPropagation()
      resizeRef.current = {
        fieldId: field.id,
        startX: e.clientX,
        startY: e.clientY,
        origW: field.width,
        origH: field.height,
      }

      const handleMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return
        const dx = ev.clientX - resizeRef.current.startX
        const dy = ev.clientY - resizeRef.current.startY
        setResizeDelta({ w: dx, h: dy })
      }

      const handleUp = (ev: MouseEvent) => {
        if (!resizeRef.current) return
        const dx = ev.clientX - resizeRef.current.startX
        const dy = ev.clientY - resizeRef.current.startY
        const dwPct = (dx / pageDimensions.width) * 100
        const dhPct = (dy / pageDimensions.height) * 100
        const newW = Math.max(5, resizeRef.current.origW + dwPct)
        const newH = Math.max(3, resizeRef.current.origH + dhPct)
        onFieldUpdate?.({ ...field, width: newW, height: newH })
        resizeRef.current = null
        setResizeDelta(null)
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [editable, pageDimensions, onFieldUpdate]
  )

  return (
    <div className="relative w-full h-full">
      {pageFields.map((field) => {
        const colors = FIELD_COLORS[field.type] || FIELD_COLORS.signature
        const isActive = activeFieldId === field.id
        const isDragging = dragRef.current?.fieldId === field.id
        const isResizing = resizeRef.current?.fieldId === field.id
        const completion = completions?.[field.id]
        const isImageCompletion = typeof completion === 'string' && completion.startsWith('data:image')

        let left = (field.x / 100) * pageDimensions.width
        let top = (field.y / 100) * pageDimensions.height
        let w = (field.width / 100) * pageDimensions.width
        let h = (field.height / 100) * pageDimensions.height

        if (isDragging && dragDelta) {
          left += dragDelta.x
          top += dragDelta.y
        }
        if (isResizing && resizeDelta) {
          w += resizeDelta.w
          h += resizeDelta.h
        }

        return (
          <div
            key={field.id}
            className={`absolute border-2 border-dashed rounded ${colors.border} ${colors.bg} ${
              editable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
            } ${isActive ? 'ring-2 ring-accent-primary' : ''} transition-shadow`}
            style={{ left, top, width: w, height: h }}
            onMouseDown={(e) => {
              if (editable) handleMouseDown(e, field)
              else onFieldClick?.(field)
            }}
            onClick={() => {
              if (!editable) onFieldClick?.(field)
            }}
          >
            {/* Field content */}
            {completion ? (
              isImageCompletion ? (
                <img
                  src={completion as string}
                  alt="Signature"
                  className="w-full h-full object-contain p-0.5"
                  draggable={false}
                />
              ) : (
                <div className={`flex items-center justify-center h-full text-xs font-semibold ${colors.text} px-1`}>
                  {String(completion)}
                </div>
              )
            ) : (
              <div className={`flex items-center justify-center h-full text-xs font-semibold ${colors.text}`}>
                {FIELD_LABELS[field.type]}
              </div>
            )}

            {/* Delete button (editable mode) */}
            {editable && isActive && (
              <button
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600 shadow"
                onClick={(e) => {
                  e.stopPropagation()
                  onFieldDelete?.(field.id)
                }}
              >
                x
              </button>
            )}

            {/* Resize handle (editable mode) */}
            {editable && (
              <div
                className="absolute bottom-0 right-0 w-3 h-3 bg-accent-primary rounded-tl cursor-se-resize opacity-60 hover:opacity-100"
                onMouseDown={(e) => handleResizeDown(e, field)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
