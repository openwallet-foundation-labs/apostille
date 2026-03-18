'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { SignatureAdoption, SIGNATURE_FONTS, SignatureFont } from './types'
import { renderTypedSignature } from '../../../lib/signing/signatureStamper'

interface SignatureAdoptionModalProps {
  fieldType: 'signature' | 'initials'
  onAdopt: (adoption: SignatureAdoption) => void
  onCancel: () => void
  initialName?: string
}

type TabId = 'type' | 'draw' | 'upload'

const TABS: { id: TabId; label: string }[] = [
  { id: 'type', label: 'Type' },
  { id: 'draw', label: 'Draw' },
  { id: 'upload', label: 'Upload' },
]

const PEN_COLORS = [
  { label: 'Black', value: '#1a1a2e' },
  { label: 'Blue', value: '#1e3a8a' },
  { label: 'Red', value: '#991b1b' },
]

export default function SignatureAdoptionModal({
  fieldType,
  onAdopt,
  onCancel,
  initialName = '',
}: SignatureAdoptionModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('type')
  const [name, setName] = useState(initialName)
  const [selectedFont, setSelectedFont] = useState<SignatureFont>(SIGNATURE_FONTS[0])
  const [fontsLoaded, setFontsLoaded] = useState(false)

  // Draw state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [penColor, setPenColor] = useState(PEN_COLORS[0].value)
  const [penWidth, setPenWidth] = useState(2.5)
  const [hasDrawn, setHasDrawn] = useState(false)

  // Upload state
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load Google Fonts
  useEffect(() => {
    const families = SIGNATURE_FONTS.map((f) => f.replace(/ /g, '+')).join('&family=')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`
    document.head.appendChild(link)
    link.onload = () => setFontsLoaded(true)
    return () => {
      document.head.removeChild(link)
    }
  }, [])

  // Init draw canvas
  useEffect(() => {
    if (activeTab !== 'draw' || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = 400 * dpr
    canvas.height = 150 * dpr
    canvas.style.width = '400px'
    canvas.style.height = '150px'
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 400, 150)
    // Draw guideline
    ctx.strokeStyle = '#e2e2e2'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, 110)
    ctx.lineTo(380, 110)
    ctx.stroke()
  }, [activeTab])

  const startDraw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      setIsDrawing(true)
      setHasDrawn(true)
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      const rect = canvas.getBoundingClientRect()
      ctx.beginPath()
      ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
      ctx.strokeStyle = penColor
      ctx.lineWidth = penWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    },
    [penColor, penWidth]
  )

  const draw = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!
      const rect = canvas.getBoundingClientRect()
      ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
      ctx.stroke()
    },
    [isDrawing]
  )

  const endDraw = useCallback(() => {
    setIsDrawing(false)
  }, [])

  const clearCanvas = useCallback(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, 400, 150)
    ctx.strokeStyle = '#e2e2e2'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(20, 110)
    ctx.lineTo(380, 110)
    ctx.stroke()
    setHasDrawn(false)
  }, [])

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setUploadedImage(reader.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleAdopt = useCallback(() => {
    if (activeTab === 'type') {
      if (!name.trim()) return
      const dataUrl = renderTypedSignature(name, selectedFont)
      onAdopt({ type: 'typed', dataUrl, name, fontFamily: selectedFont })
    } else if (activeTab === 'draw') {
      if (!hasDrawn || !canvasRef.current) return
      const dataUrl = canvasRef.current.toDataURL('image/png')
      onAdopt({ type: 'drawn', dataUrl })
    } else if (activeTab === 'upload') {
      if (!uploadedImage) return
      onAdopt({ type: 'uploaded', dataUrl: uploadedImage })
    }
  }, [activeTab, name, selectedFont, hasDrawn, uploadedImage, onAdopt])

  const canAdopt =
    (activeTab === 'type' && name.trim().length > 0) ||
    (activeTab === 'draw' && hasDrawn) ||
    (activeTab === 'upload' && !!uploadedImage)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="bg-bg-primary rounded-xl shadow-2xl w-[480px] max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-primary">
          <h3 className="text-lg font-semibold text-text-primary">
            {fieldType === 'signature' ? 'Adopt Your Signature' : 'Adopt Your Initials'}
          </h3>
          <p className="text-sm text-text-secondary mt-1">
            Create your {fieldType} using one of the methods below
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-primary">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-accent-primary border-b-2 border-accent-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {/* TYPE TAB */}
          {activeTab === 'type' && (
            <div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={fieldType === 'signature' ? 'Your full name' : 'Your initials'}
                className="w-full px-3 py-2 rounded-lg border border-border-primary bg-bg-secondary text-text-primary text-sm mb-4"
                autoFocus
              />
              <div className="flex flex-col gap-2">
                {SIGNATURE_FONTS.map((font) => (
                  <button
                    key={font}
                    onClick={() => setSelectedFont(font)}
                    className={`px-4 py-3 rounded-lg border-2 text-left transition-all ${
                      selectedFont === font
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-border-primary hover:border-border-secondary bg-bg-secondary'
                    }`}
                  >
                    <span
                      style={{ fontFamily: `"${font}", cursive`, fontSize: '24px' }}
                      className="text-text-primary"
                    >
                      {name || (fieldType === 'signature' ? 'Your Name' : 'AB')}
                    </span>
                    <span className="text-xs text-text-secondary ml-3">{font}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* DRAW TAB */}
          {activeTab === 'draw' && (
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex gap-1">
                  {PEN_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setPenColor(c.value)}
                      className={`w-6 h-6 rounded-full border-2 ${
                        penColor === c.value ? 'border-accent-primary' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.label}
                    />
                  ))}
                </div>
                <div className="flex gap-1">
                  {[1.5, 2.5, 4].map((w) => (
                    <button
                      key={w}
                      onClick={() => setPenWidth(w)}
                      className={`px-2 py-1 rounded text-xs ${
                        penWidth === w ? 'bg-accent-primary text-white' : 'bg-bg-tertiary text-text-secondary'
                      }`}
                    >
                      {w === 1.5 ? 'Thin' : w === 2.5 ? 'Med' : 'Thick'}
                    </button>
                  ))}
                </div>
                <button onClick={clearCanvas} className="ml-auto text-xs text-red-400 hover:text-red-300">
                  Clear
                </button>
              </div>
              <canvas
                ref={canvasRef}
                className="border border-border-primary rounded-lg cursor-crosshair bg-white"
                style={{ width: 400, height: 150 }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
              />
              <p className="text-xs text-text-secondary mt-2 text-center">
                Draw your {fieldType} above the line
              </p>
            </div>
          )}

          {/* UPLOAD TAB */}
          {activeTab === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleUpload}
                className="hidden"
              />
              {uploadedImage ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="border border-border-primary rounded-lg p-4 bg-white">
                    <img src={uploadedImage} alt="Uploaded signature" className="max-h-32 max-w-full object-contain" />
                  </div>
                  <button
                    onClick={() => {
                      setUploadedImage(null)
                      fileInputRef.current?.click()
                    }}
                    className="text-sm text-accent-primary hover:underline"
                  >
                    Choose different image
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-12 border-2 border-dashed border-border-primary rounded-lg text-text-secondary hover:border-accent-primary hover:text-accent-primary transition-colors"
                >
                  <div className="text-center">
                    <div className="text-2xl mb-2">Upload Image</div>
                    <div className="text-sm">PNG, JPG, or SVG</div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border-primary flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-bg-tertiary"
          >
            Cancel
          </button>
          <button
            onClick={handleAdopt}
            disabled={!canAdopt}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-accent-primary text-white hover:bg-accent-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Adopt {fieldType === 'signature' ? 'Signature' : 'Initials'}
          </button>
        </div>
      </div>
    </div>
  )
}
