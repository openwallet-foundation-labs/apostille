'use client'

import { useRef, useEffect, useState, useCallback, ReactNode } from 'react'

// pdfjs-dist types
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()
  return pdfjsLib
}

export interface PageDimensions {
  width: number
  height: number
}

interface PdfViewerProps {
  pdfData: ArrayBuffer | Uint8Array
  currentPage?: number
  onPageChange?: (page: number) => void
  scale?: number
  onScaleChange?: (scale: number) => void
  overlayContent?: (page: number, dimensions: PageDimensions) => ReactNode
  className?: string
  onTotalPagesChange?: (total: number) => void
  onDrop?: (e: React.DragEvent<HTMLDivElement>, page: number, dims: PageDimensions) => void
}

export default function PdfViewer({
  pdfData,
  currentPage = 0,
  onPageChange,
  scale: externalScale,
  onScaleChange,
  overlayContent,
  className = '',
  onTotalPagesChange,
  onDrop,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(currentPage)
  const [internalScale, setInternalScale] = useState(1.0)
  const [pageDimensions, setPageDimensions] = useState<PageDimensions>({ width: 0, height: 0 })
  const [loading, setLoading] = useState(true)

  const scale = externalScale ?? internalScale

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const pdfjs = await getPdfjs()
        const data = pdfData instanceof ArrayBuffer ? new Uint8Array(pdfData) : pdfData
        const doc = await pdfjs.getDocument({ data }).promise
        if (!cancelled) {
          setPdfDoc(doc)
          setTotalPages(doc.numPages)
          onTotalPagesChange?.(doc.numPages)
          setPage(0)
          onPageChange?.(0)
        }
      } catch (err) {
        console.error('Failed to load PDF:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfData])

  // Sync external page prop
  useEffect(() => {
    if (currentPage !== undefined && currentPage !== page) {
      setPage(currentPage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage])

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return
    let cancelled = false

    async function renderPage() {
      const pdfPage: PDFPageProxy = await pdfDoc!.getPage(page + 1) // 1-indexed
      const viewport = pdfPage.getViewport({ scale })
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!

      // High DPI support
      const dpr = window.devicePixelRatio || 1
      canvas.width = viewport.width * dpr
      canvas.height = viewport.height * dpr
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      ctx.scale(dpr, dpr)

      if (!cancelled) {
        setPageDimensions({ width: viewport.width, height: viewport.height })
      }

      await pdfPage.render({
        canvasContext: ctx,
        viewport,
        canvas: canvasRef.current!,
      }).promise
    }

    renderPage()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, page, scale])

  const goToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(0, Math.min(p, totalPages - 1))
      setPage(clamped)
      onPageChange?.(clamped)
    },
    [totalPages, onPageChange]
  )

  const setScaleValue = useCallback(
    (s: number) => {
      const clamped = Math.max(0.25, Math.min(s, 3.0))
      if (onScaleChange) {
        onScaleChange(clamped)
      } else {
        setInternalScale(clamped)
      }
    },
    [onScaleChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      onDrop?.(e, page, pageDimensions)
    },
    [onDrop, page, pageDimensions]
  )

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="text-text-secondary">Loading PDF...</div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Controls bar */}
      <div className="flex items-center gap-3 py-2 px-4 bg-bg-secondary rounded-lg mb-3 text-sm">
        {/* Page navigation */}
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page === 0}
          className="px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-tertiary/80 disabled:opacity-40 text-text-primary"
        >
          &larr;
        </button>
        <span className="text-text-secondary min-w-[80px] text-center">
          Page {page + 1} / {totalPages}
        </span>
        <button
          onClick={() => goToPage(page + 1)}
          disabled={page >= totalPages - 1}
          className="px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-tertiary/80 disabled:opacity-40 text-text-primary"
        >
          &rarr;
        </button>

        <div className="w-px h-5 bg-border-primary mx-1" />

        {/* Zoom controls */}
        <button
          onClick={() => setScaleValue(scale - 0.15)}
          className="px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary"
        >
          &minus;
        </button>
        <span className="text-text-secondary min-w-[50px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScaleValue(scale + 0.15)}
          className="px-2 py-1 rounded bg-bg-tertiary hover:bg-bg-tertiary/80 text-text-primary"
        >
          +
        </button>
      </div>

      {/* PDF canvas with overlay */}
      <div
        ref={containerRef}
        className="relative inline-block shadow-lg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <canvas ref={canvasRef} className="block" />
        {/* Overlay content (fields, etc.) */}
        {overlayContent && pageDimensions.width > 0 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ width: pageDimensions.width, height: pageDimensions.height }}
          >
            <div className="pointer-events-auto w-full h-full">
              {overlayContent(page, pageDimensions)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
