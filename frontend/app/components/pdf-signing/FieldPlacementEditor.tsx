'use client'

import { useState, useCallback } from 'react'
import PdfViewer from './PdfViewer'
import type { PageDimensions } from './PdfViewer'
import FieldPalette from './FieldPalette'
import FieldOverlay from './FieldOverlay'
import { SigningField, FieldType, DEFAULT_FIELD_SIZES, FIELD_LABELS } from './types'

interface FieldPlacementEditorProps {
  pdfData: ArrayBuffer
  onComplete: (fields: SigningField[]) => void
  onCancel: () => void
}

let fieldCounter = 0
function nextFieldId() {
  return `field-${Date.now()}-${++fieldCounter}`
}

export default function FieldPlacementEditor({
  pdfData,
  onComplete,
  onCancel,
}: FieldPlacementEditorProps) {
  const [fields, setFields] = useState<SigningField[]>([])
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [scale, setScale] = useState(1.0)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, page: number, dims: PageDimensions) => {
      const fieldType = e.dataTransfer.getData('fieldType') as FieldType
      if (!fieldType) return

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const dropX = e.clientX - rect.left
      const dropY = e.clientY - rect.top

      const defaults = DEFAULT_FIELD_SIZES[fieldType]
      const xPct = (dropX / dims.width) * 100
      const yPct = (dropY / dims.height) * 100

      const newField: SigningField = {
        id: nextFieldId(),
        type: fieldType,
        page,
        x: Math.max(0, Math.min(100 - defaults.width, xPct - defaults.width / 2)),
        y: Math.max(0, Math.min(100 - defaults.height, yPct - defaults.height / 2)),
        width: defaults.width,
        height: defaults.height,
        required: true,
        label: FIELD_LABELS[fieldType],
      }

      setFields((prev) => [...prev, newField])
      setActiveFieldId(newField.id)
    },
    []
  )

  const handleFieldUpdate = useCallback((updated: SigningField) => {
    setFields((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }, [])

  const handleFieldDelete = useCallback((fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId))
    setActiveFieldId(null)
  }, [])

  const signatureFieldCount = fields.filter((f) => f.type === 'signature').length

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col !mt-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-bg-secondary border-b border-border-primary">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            Cancel
          </button>
          <h3 className="text-lg font-semibold text-text-primary">Place Signing Fields</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-secondary">
            {fields.length} field{fields.length !== 1 ? 's' : ''} placed
            {signatureFieldCount === 0 && (
              <span className="text-yellow-500 ml-2">Add at least one signature field</span>
            )}
          </span>
          <button
            onClick={() => onComplete(fields)}
            disabled={signatureFieldCount === 0}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-accent-primary text-black hover:bg-accent-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Done - Send for Signing
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 p-4 bg-bg-secondary border-r border-border-primary overflow-y-auto">
          <FieldPalette />

          {/* Page list */}
          {totalPages > 1 && (
            <div className="mt-6">
              <h4 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                Pages
              </h4>
              <div className="flex flex-col gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    className={`text-left text-sm px-2 py-1 rounded ${
                      currentPage === i
                        ? 'bg-accent-primary/20 text-accent-primary font-medium'
                        : 'text-text-secondary hover:bg-bg-tertiary'
                    }`}
                  >
                    Page {i + 1}
                    {fields.filter((f) => f.page === i).length > 0 && (
                      <span className="ml-1 text-xs opacity-60">
                        ({fields.filter((f) => f.page === i).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* PDF viewer area */}
        <div
          className="flex-1 overflow-auto p-6 bg-bg-tertiary/50 flex justify-center"
          onClick={() => setActiveFieldId(null)}
        >
          <PdfViewer
            pdfData={pdfData}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            scale={scale}
            onScaleChange={setScale}
            onTotalPagesChange={setTotalPages}
            onDrop={handleDrop}
            overlayContent={(page, dims) => (
              <FieldOverlay
                fields={fields}
                pageIndex={page}
                pageDimensions={dims}
                editable={true}
                onFieldUpdate={handleFieldUpdate}
                onFieldDelete={handleFieldDelete}
                activeFieldId={activeFieldId ?? undefined}
                onFieldClick={(f) => setActiveFieldId(f.id)}
              />
            )}
          />
        </div>
      </div>
    </div>
  )
}
