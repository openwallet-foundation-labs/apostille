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
  const [showPagesPanel, setShowPagesPanel] = useState(true)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchIndex, setSearchIndex] = useState(0)
  const [contextMenu, setContextMenu] = useState<{
    open: boolean
    x: number
    y: number
    page: number
    pageX: number
    pageY: number
    dims: PageDimensions
  }>({ open: false, x: 0, y: 0, page: 0, pageX: 0, pageY: 0, dims: { width: 0, height: 0 } })

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

  const placeFieldAt = useCallback((fieldType: FieldType, page: number, x: number, y: number, dims: PageDimensions) => {
    const defaults = DEFAULT_FIELD_SIZES[fieldType]
    const xPct = (x / dims.width) * 100
    const yPct = (y / dims.height) * 100
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
        <div className="w-64 p-4 bg-bg-secondary border-r border-border-primary overflow-y-auto">
          <FieldPalette />
        </div>

        {/* PDF viewer area */}
        <div
          className="relative flex-1 overflow-auto p-6 bg-bg-tertiary/50 flex justify-center"
          onClick={() => {
            setActiveFieldId(null)
            setContextMenu((prev) => ({ ...prev, open: false }))
          }}
        >
          <PdfViewer
            pdfData={pdfData}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            scale={scale}
            onScaleChange={setScale}
            onTotalPagesChange={setTotalPages}
            onDrop={handleDrop}
            enableScrollPaging={true}
            onPageClick={(page, x, y, dims, clientX, clientY) => {
              setContextMenu({
                open: true,
                x: clientX,
                y: clientY,
                page,
                pageX: x,
                pageY: y,
                dims,
              })
            }}
            searchQuery={searchQuery}
            searchActiveIndex={searchTotal > 0 ? searchIndex : undefined}
            onSearchResults={(total) => {
              setSearchTotal(total)
              if (total === 0) {
                setSearchIndex(0)
              } else if (searchIndex >= total) {
                setSearchIndex(0)
              }
            }}
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

          {contextMenu.open && (
            <div
              className="fixed z-50 w-48 rounded-lg border border-neutral-200 bg-white shadow-lg"
              style={{ left: contextMenu.x + 12, top: contextMenu.y + 12 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-3 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Place Field
              </div>
              {(['signature', 'initials', 'name', 'date', 'note', 'stamp', 'text', 'number', 'drawing', 'formula', 'email'] as FieldType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-100"
                  onClick={() => {
                    placeFieldAt(type, contextMenu.page, contextMenu.pageX, contextMenu.pageY, contextMenu.dims)
                    setContextMenu((prev) => ({ ...prev, open: false }))
                  }}
                >
                  {FIELD_LABELS[type]}
                </button>
              ))}
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
                onClick={() => setContextMenu((prev) => ({ ...prev, open: false }))}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="relative flex h-full">
          {showPagesPanel && totalPages > 1 && (
            <div className="w-48 bg-bg-secondary border-l border-border-primary p-3 overflow-y-auto">
              <div className="flex items-center gap-2 mb-2 text-text-secondary">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 4h9l3 3v13H6z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6M9 16h6" />
                </svg>
                <span className="sr-only">Pages</span>
              </div>
              {showSearchPanel && (
                <div className="mb-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">Search</div>
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Find text"
                    className="input w-full h-8 text-sm"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery(searchInput)
                        setSearchIndex(0)
                      }}
                      className="btn btn-sm btn-secondary"
                    >
                      Find
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!searchInput) return
                        const total = searchTotal
                        if (total > 0) {
                          setSearchIndex((prev) => (prev - 1 + total) % total)
                        }
                      }}
                      className="btn btn-sm btn-secondary"
                      aria-label="Previous match"
                      disabled={searchTotal < 1}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!searchInput) return
                        if (searchQuery !== searchInput) {
                          setSearchQuery(searchInput)
                          setSearchIndex(0)
                          return
                        }
                        const total = searchTotal
                        if (total > 0) {
                          setSearchIndex((prev) => (prev + 1) % total)
                        }
                      }}
                      className="btn btn-sm btn-secondary"
                      aria-label="Next match"
                      disabled={searchInput.length === 0}
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchInput('')
                        setSearchQuery('')
                        setSearchTotal(0)
                        setSearchIndex(0)
                      }}
                      className="btn btn-sm btn-secondary"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
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
          <div className="w-12 bg-bg-secondary border-l border-border-primary flex flex-col items-center py-3 gap-2">
            <button
              type="button"
              title="Search"
              onClick={() => {
                setShowSearchPanel((prev) => {
                  const next = !prev
                  if (next) setShowPagesPanel(true)
                  return next
                })
              }}
              className="w-9 h-9 rounded-lg border border-border-secondary bg-white text-text-secondary hover:text-text-primary hover:border-border-primary flex items-center justify-center"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <button
              type="button"
              title="View Pages"
              onClick={() => setShowPagesPanel((prev) => !prev)}
              className={`w-9 h-9 rounded-lg border bg-white flex items-center justify-center ${
                showPagesPanel
                  ? 'border-border-primary text-text-primary'
                  : 'border-border-secondary text-text-secondary hover:text-text-primary hover:border-border-primary'
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 4h9l3 3v13H6z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6M9 16h6" />
              </svg>
            </button>
            <div className="mt-auto flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                title="Zoom Out"
                onClick={() => setScale((prev) => Math.max(0.25, Math.round((prev - 0.15) * 100) / 100))}
                className="w-9 h-9 rounded-lg border border-border-secondary bg-white text-text-secondary hover:text-text-primary hover:border-border-primary flex items-center justify-center"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                title="Zoom In"
                onClick={() => setScale((prev) => Math.min(3, Math.round((prev + 0.15) * 100) / 100))}
                className="w-9 h-9 rounded-lg border border-border-secondary bg-white text-text-secondary hover:text-text-primary hover:border-border-primary flex items-center justify-center"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
