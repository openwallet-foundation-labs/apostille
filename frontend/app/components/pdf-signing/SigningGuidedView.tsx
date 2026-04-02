'use client'

import { useState, useCallback, useMemo } from 'react'
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
}

export default function SigningGuidedView({
  pdfData,
  fields,
  signerName,
  onComplete,
  onCancel,
}: SigningGuidedViewProps) {
  // Clone the ArrayBuffer so pdfjs worker transfer doesn't detach the original
  const pdfBytesForStamping = useMemo(() => new Uint8Array(pdfData.slice(0)), [pdfData])
  const [signerNameInput, setSignerNameInput] = useState(signerName || '')
  const [completions, setCompletions] = useState<Record<string, string>>({}) // fieldId → dataUrl or text
  const [adoptedSignature, setAdoptedSignature] = useState<SignatureAdoption | null>(null)
  const [adoptedInitials, setAdoptedInitials] = useState<SignatureAdoption | null>(null)
  const [activeField, setActiveField] = useState<SigningField | null>(null)
  const [showAdoption, setShowAdoption] = useState(false)
  const [showNameModal, setShowNameModal] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [scale, setScale] = useState(1.0)
  const [stamping, setStamping] = useState(false)

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
      } else if (field.type === 'date') {
        const dateStr = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        setCompletions((prev) => ({ ...prev, [field.id]: dateStr }))
      } else if (field.type === 'name') {
        setActiveField(field)
        setShowNameModal(true)
      }
    },
    [adoptedSignature, adoptedInitials, signerNameInput]
  )

  const handleAdopt = useCallback(
    (adoption: SignatureAdoption) => {
      if (!activeField) return
      if (activeField.type === 'signature') {
        setAdoptedSignature(adoption)
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

  return (
    <div className="fixed inset-0 z-50 bg-white text-black flex flex-col">
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
          <button
            onClick={handleFinish}
            disabled={!allRequiredComplete || stamping}
            className="px-5 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {stamping ? 'Applying...' : 'Continue to Sign'}
          </button>
        </div>
      </div>

      {/* Instructions banner */}
      {completedCount === 0 && (
        <div className="bg-yellow-100 border-b border-yellow-200 px-4 py-2 text-center text-sm text-yellow-800">
          Click on each highlighted field to fill in your signature, initials, or other information
        </div>
      )}

      {/* PDF viewer */}
      <div className="flex-1 overflow-auto p-6 bg-white flex justify-center">
        <PdfViewer
          pdfData={pdfData}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          scale={scale}
          onScaleChange={setScale}
          showControls={false}
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

      {/* Field list sidebar - scrollable on the right */}
      <div className="absolute right-4 top-20 w-52 bg-white rounded-lg shadow-lg border border-neutral-200 p-3 max-h-[60vh] overflow-y-auto">
        <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          Required Fields
        </h4>
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

      {/* Signature adoption modal */}
      {showAdoption && activeField && (
        <SignatureAdoptionModal
          fieldType={activeField.type as 'signature' | 'initials'}
          onAdopt={handleAdopt}
          onCancel={() => {
            setShowAdoption(false)
            setActiveField(null)
          }}
          initialName={signerName}
        />
      )}

      {showNameModal && activeField?.type === 'name' && (
        <NameAdoptionModal
          initialName={signerNameInput}
          onAdopt={(name) => {
            setSignerNameInput(name)
            setCompletions((prev) => ({ ...prev, [activeField.id]: name }))
            setShowNameModal(false)
            setActiveField(null)
          }}
          onCancel={() => {
            setShowNameModal(false)
            setActiveField(null)
          }}
        />
      )}
    </div>
  )
}
