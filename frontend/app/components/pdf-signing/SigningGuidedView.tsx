'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import PdfViewer from './PdfViewer'
import FieldOverlay from './FieldOverlay'
import SignatureAdoptionModal from './SignatureAdoptionModal'
import NameAdoptionModal from './NameAdoptionModal'
import { SigningField, SignatureAdoption } from './types'
import { stampSignaturesOnPdf } from '../../../lib/signing/signatureStamper'

interface SigningGuidedViewProps {
  pdfData: ArrayBuffer
  fields: SigningField[]
  signerName: string
  onComplete: (stampedPdfBytes: Uint8Array) => void
  onCancel: () => void
  onRequestDownload?: () => void
}

export default function SigningGuidedView({
  pdfData,
  fields,
  signerName,
  onComplete,
  onCancel,
  onRequestDownload,
}: SigningGuidedViewProps) {
  // Clone the ArrayBuffer so pdfjs worker transfer doesn't detach the original
  const pdfBytesForStamping = useMemo(() => new Uint8Array(pdfData.slice(0)), [pdfData])
  const [signerNameInput, setSignerNameInput] = useState(signerName || '')
  const [completions, setCompletions] = useState<Record<string, string>>({}) // fieldId → dataUrl or text
  const [adoptedSignature, setAdoptedSignature] = useState<SignatureAdoption | null>(null)
  const [adoptedInitials, setAdoptedInitials] = useState<SignatureAdoption | null>(null)
  const [adoptedStamp, setAdoptedStamp] = useState<SignatureAdoption | null>(null)
  const [adoptedDrawing, setAdoptedDrawing] = useState<SignatureAdoption | null>(null)
  const [activeField, setActiveField] = useState<SigningField | null>(null)
  const [showAdoption, setShowAdoption] = useState(false)
  const [showTextModal, setShowTextModal] = useState(false)
  const [textModalConfig, setTextModalConfig] = useState<{
    title: string
    placeholder: string
    buttonLabel: string
    inputType?: string
    multiline?: boolean
  }>({
    title: 'Enter Text',
    placeholder: 'Type here',
    buttonLabel: 'Apply',
  })
  const [currentPage, setCurrentPage] = useState(0)
  const [scale, setScale] = useState(1.0)
  const [stamping, setStamping] = useState(false)
  const [showPagesPanel, setShowPagesPanel] = useState(true)
  const [totalPages, setTotalPages] = useState(0)
  const [showSearchPanel, setShowSearchPanel] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchIndex, setSearchIndex] = useState(0)
  const [showOtherActions, setShowOtherActions] = useState(false)
  const [fieldBoxPos, setFieldBoxPos] = useState({ x: 64, y: 24 })
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragOriginRef = useRef({ x: 0, y: 0 })

  const requiredFields = fields.filter((f) => f.required)
  const completedCount = requiredFields.filter((f) => completions[f.id]).length
  const allRequiredComplete = completedCount === requiredFields.length

  const handleFieldClick = useCallback(
    (field: SigningField) => {
      if (field.type === 'signature' || field.type === 'initials') {
        // Check if we already have an adopted signature for this type
        const existing = field.type === 'signature' ? adoptedSignature : adoptedInitials
        if (existing) {
          // Auto-fill with existing adoption
          setCompletions((prev) => ({ ...prev, [field.id]: existing.dataUrl }))
        } else {
          // Open adoption modal
          setActiveField(field)
          setShowAdoption(true)
        }
      } else if (field.type === 'stamp') {
        if (adoptedStamp) {
          setCompletions((prev) => ({ ...prev, [field.id]: adoptedStamp.dataUrl }))
        } else {
          setActiveField(field)
          setShowAdoption(true)
        }
      } else if (field.type === 'drawing') {
        if (adoptedDrawing) {
          setCompletions((prev) => ({ ...prev, [field.id]: adoptedDrawing.dataUrl }))
        } else {
          setActiveField(field)
          setShowAdoption(true)
        }
      } else if (field.type === 'date') {
        const dateStr = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        setCompletions((prev) => ({ ...prev, [field.id]: dateStr }))
      } else if (field.type === 'name') {
        setActiveField(field)
        setTextModalConfig({
          title: 'Enter Your Name',
          placeholder: 'Your full name',
          buttonLabel: 'Apply Name',
        })
        setShowTextModal(true)
      } else if (field.type === 'text') {
        setActiveField(field)
        setTextModalConfig({
          title: 'Enter Text',
          placeholder: 'Type here',
          buttonLabel: 'Apply Text',
        })
        setShowTextModal(true)
      } else if (field.type === 'number') {
        setActiveField(field)
        setTextModalConfig({
          title: 'Enter Number',
          placeholder: '0',
          buttonLabel: 'Apply Number',
          inputType: 'number',
        })
        setShowTextModal(true)
      } else if (field.type === 'email') {
        setActiveField(field)
        setTextModalConfig({
          title: 'Enter Email',
          placeholder: 'name@example.com',
          buttonLabel: 'Apply Email',
          inputType: 'email',
        })
        setShowTextModal(true)
      } else if (field.type === 'note') {
        setActiveField(field)
        setTextModalConfig({
          title: 'Enter Note',
          placeholder: 'Write a note',
          buttonLabel: 'Apply Note',
          multiline: true,
        })
        setShowTextModal(true)
      } else if (field.type === 'formula') {
        setActiveField(field)
        setTextModalConfig({
          title: 'Enter Formula',
          placeholder: 'e.g., x = a + b',
          buttonLabel: 'Apply Formula',
        })
        setShowTextModal(true)
      }
    },
    [adoptedSignature, adoptedInitials, adoptedStamp, adoptedDrawing, signerNameInput]
  )

  const handleAdopt = useCallback(
    (adoption: SignatureAdoption) => {
      if (!activeField) return
      if (activeField.type === 'signature') {
        setAdoptedSignature(adoption)
      } else if (activeField.type === 'stamp') {
        setAdoptedStamp(adoption)
      } else if (activeField.type === 'drawing') {
        setAdoptedDrawing(adoption)
      } else {
        setAdoptedInitials(adoption)
      }
      setCompletions((prev) => ({ ...prev, [activeField.id]: adoption.dataUrl }))
      setShowAdoption(false)
      setActiveField(null)
    },
    [activeField]
  )

  const handleFinish = useCallback(async () => {
    setStamping(true)
    try {
      const stamped = await stampSignaturesOnPdf(pdfBytesForStamping, fields, completions, signerNameInput)
      onComplete(new Uint8Array(stamped))
    } catch (err) {
      console.error('Failed to stamp signatures:', err)
    } finally {
      setStamping(false)
    }
  }, [pdfBytesForStamping, fields, completions, signerNameInput, onComplete])

  const handleDownload = useCallback(async () => {
    if (onRequestDownload) {
      await onRequestDownload()
      return
    }
    const blob = new Blob([pdfData], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'document.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [onRequestDownload, pdfData])

  const handleDownloadAndSign = useCallback(async () => {
    if (!allRequiredComplete || stamping) return
    await handleDownload()
    await handleFinish()
  }, [allRequiredComplete, stamping, handleDownload, handleFinish])

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = event.clientX - dragStartRef.current.x
      const dy = event.clientY - dragStartRef.current.y
      setFieldBoxPos({
        x: dragOriginRef.current.x + dx,
        y: dragOriginRef.current.y + dy,
      })
    }

    const handleMouseUp = () => {
      draggingRef.current = false
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-white text-black flex flex-col !mt-0">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white text-black border-b border-neutral-200">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm text-black hover:bg-neutral-100"
          >
            Cancel
          </button>
          <h3 className="text-lg font-semibold text-black">Review & Sign Document</h3>
        </div>
        <div className="flex items-center gap-4">
          {/* Progress */}
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${requiredFields.length > 0 ? (completedCount / requiredFields.length) * 100 : 0}%` }}
              />
            </div>
            <span className="text-sm text-neutral-700">
              {completedCount} / {requiredFields.length} fields
            </span>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              onClick={handleFinish}
              disabled={!allRequiredComplete || stamping}
              className="px-5 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {stamping ? 'Applying...' : 'Continue'}
            </button>
            <button
              type="button"
              onClick={() => setShowOtherActions((prev) => !prev)}
              className="w-9 h-9 rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
              aria-label="Other actions"
            >
              <svg className="h-5 w-5 mx-auto" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="19" r="1.8" />
              </svg>
            </button>
            {showOtherActions && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-neutral-200 bg-white shadow-lg z-10">
                <div className="px-4 pt-3 pb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Other Actions
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowOtherActions(false)
                    onCancel()
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-100"
                >
                  Finish Later
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOtherActions(false)
                    handleDownloadAndSign()
                  }}
                  disabled={!allRequiredComplete || stamping}
                  className="w-full text-left px-4 py-2 text-sm text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download &amp; Sign
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions banner */}
      {completedCount === 0 && (
        <div className="bg-yellow-100 border-b border-yellow-200 px-4 py-2 text-center text-sm text-yellow-800">
          Click on each highlighted field to fill in your signature, initials, or other information
        </div>
      )}

      {/* PDF viewer */}
      <div className="flex-1 overflow-hidden bg-white">
        <div className="relative flex h-full">
          <div className="flex-1 overflow-auto p-6 flex justify-center">
            <PdfViewer
              pdfData={pdfData}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              scale={scale}
              onScaleChange={setScale}
              showControls={false}
              onTotalPagesChange={setTotalPages}
              enableScrollPaging={true}
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
                  editable={false}
                  onFieldClick={handleFieldClick}
                  completions={completions}
                />
              )}
            />
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
              <button
                type="button"
                title="Download"
                onClick={handleDownload}
                className="w-9 h-9 rounded-lg border border-border-secondary bg-white text-text-secondary hover:text-text-primary hover:border-border-primary flex items-center justify-center"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v12m0 0l4-4m-4 4l-4-4" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 20h16" />
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

          {/* Field list sidebar - scrollable on the right */}
          <div
            className="absolute w-52 bg-white rounded-lg shadow-lg border border-neutral-200 p-3 max-h-[60vh] overflow-y-auto z-30"
            style={{ left: fieldBoxPos.x, top: fieldBoxPos.y }}
          >
            <div
              className="mb-2 flex items-center justify-between cursor-move select-none"
              onMouseDown={(event) => {
                draggingRef.current = true
                dragStartRef.current = { x: event.clientX, y: event.clientY }
                dragOriginRef.current = { x: fieldBoxPos.x, y: fieldBoxPos.y }
              }}
            >
              <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Required Fields
              </h4>
              <span className="text-neutral-300 text-xs">Drag</span>
            </div>
            {fields.map((field) => {
              const isComplete = !!completions[field.id]
              return (
                <button
                  key={field.id}
                  onClick={() => {
                    setCurrentPage(field.page)
                    handleFieldClick(field)
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm mb-1 flex items-center gap-2 ${
                    isComplete
                      ? 'text-green-700 bg-green-100'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border flex items-center justify-center text-xs ${
                    isComplete ? 'border-green-600 bg-green-600 text-white' : 'border-neutral-300'
                  }`}>
                    {isComplete ? '✓' : ''}
                  </span>
                  <span>{field.label || field.type}</span>
                  <span className="text-xs opacity-50 ml-auto">p.{field.page + 1}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Signature adoption modal */}
      {showAdoption && activeField && (
        <SignatureAdoptionModal
          fieldType={activeField.type as 'signature' | 'initials' | 'stamp' | 'drawing'}
          onAdopt={handleAdopt}
          onCancel={() => {
            setShowAdoption(false)
            setActiveField(null)
          }}
          initialName={signerName}
        />
      )}

      {showTextModal && activeField && (
        <NameAdoptionModal
          initialName={activeField.type === 'name' ? signerNameInput : ''}
          title={textModalConfig.title}
          placeholder={textModalConfig.placeholder}
          buttonLabel={textModalConfig.buttonLabel}
          inputType={textModalConfig.inputType}
          multiline={textModalConfig.multiline}
          onAdopt={(value) => {
            if (activeField.type === 'name') {
              setSignerNameInput(value)
            }
            setCompletions((prev) => ({ ...prev, [activeField.id]: value }))
            setShowTextModal(false)
            setActiveField(null)
          }}
          onCancel={() => {
            setShowTextModal(false)
            setActiveField(null)
          }}
        />
      )}
    </div>
  )
}
