'use client'

import { useRef, useEffect, useState, useCallback, ReactNode } from 'react'

// pdfjs-dist types
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib
  pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
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
  showControls?: boolean
  searchQuery?: string
  searchActiveIndex?: number
  onSearchResults?: (total: number) => void
  onPageClick?: (page: number, x: number, y: number, dims: PageDimensions, clientX: number, clientY: number) => void
  /** Right-click / long-press context menu. Same params as onPageClick. */
  onPageContextMenu?: (page: number, x: number, y: number, dims: PageDimensions, clientX: number, clientY: number) => void
  enableScrollPaging?: boolean
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
  showControls = true,
  searchQuery,
  searchActiveIndex,
  onSearchResults,
  onPageClick,
  onPageContextMenu,
  enableScrollPaging = false,
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastWheelAtRef = useRef(0)
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [page, setPage] = useState(currentPage)
  const [internalScale, setInternalScale] = useState(1.0)
  const [pageDimensions, setPageDimensions] = useState<PageDimensions>({ width: 0, height: 0 })
  const [loading, setLoading] = useState(true)
  const [highlights, setHighlights] = useState<Array<{ left: number; top: number; width: number; height: number }>>([])
  const [allMatches, setAllMatches] = useState<Array<{ page: number; left: number; top: number; width: number; height: number }>>([])
  const renderTaskRef = useRef<any>(null)

  const scale = externalScale ?? internalScale

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    let localDoc: PDFDocumentProxy | null = null
    async function load() {
      setLoading(true)
      try {
        const pdfjs = await getPdfjs()
        // Clone the buffer to avoid "detached ArrayBuffer" errors from worker transfer
        const data = pdfData instanceof ArrayBuffer ? new Uint8Array(pdfData.slice(0)) : new Uint8Array(pdfData)
        const doc = await pdfjs.getDocument({ data }).promise
        localDoc = doc
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
      if (localDoc) {
        localDoc.destroy().catch(() => {
          // ignore
        })
      }
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
      const dpr = window.devicePixelRatio || 1

      // Bake DPR into the viewport scale so the bitmap is rendered at the
      // exact pixel resolution we want — no second DPR pass from pdfjs.
      // Using `canvasContext` opts out of pdfjs v5's auto-DPR behaviour,
      // which was producing faded / clipped renders when render() ran more
      // than once (the search-matches effect retriggers this hook on every
      // page change).
      const viewport = pdfPage.getViewport({ scale: scale * dpr })
      const canvas = canvasRef.current!
      const ctx = canvas.getContext('2d')!

      // Setting canvas.width clears the bitmap and resets transforms — that's
      // exactly what we want before each render to avoid ghost pixels.
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.width = `${viewport.width / dpr}px`
      canvas.style.height = `${viewport.height / dpr}px`

      if (!cancelled) {
        setPageDimensions({ width: viewport.width / dpr, height: viewport.height / dpr })
      }

      renderTaskRef.current?.cancel?.()
      const renderTask = pdfPage.render({ canvasContext: ctx, viewport } as any)
      renderTaskRef.current = renderTask
      try {
        await renderTask.promise
      } catch (err: any) {
        // Cancelled renders throw — swallow to avoid noisy errors.
        if (err?.name !== 'RenderingCancelledException') throw err
      }

      if (!cancelled) {
        const pageRects = allMatches.filter((m) => m.page === page)
        setHighlights(pageRects)
      }
    }

    renderPage()
    return () => {
      cancelled = true
      renderTaskRef.current?.cancel?.()
    }
  }, [pdfDoc, page, scale, allMatches])

  // Build search matches across document
  useEffect(() => {
    if (!pdfDoc || !searchQuery || searchQuery.trim().length === 0) {
      setAllMatches([])
      onSearchResults?.(0)
      return
    }
    let cancelled = false
    const run = async () => {
      const pdfjs = await getPdfjs()
      const query = searchQuery.trim().toLowerCase()
      const matches: Array<{ page: number; left: number; top: number; width: number; height: number }> = []
      for (let i = 0; i < pdfDoc.numPages; i += 1) {
        const pdfPage = await pdfDoc.getPage(i + 1)
        const viewport = pdfPage.getViewport({ scale })
        const textContent = await pdfPage.getTextContent()
        textContent.items.forEach((item: any) => {
          const raw = String(item.str || '')
          if (!raw) return
          const str = raw.toLowerCase()
          let idx = str.indexOf(query)
          if (idx === -1) return
          const transform = pdfjs.Util.transform(viewport.transform, item.transform)
          const x = transform[4]
          const y = transform[5]
          const height = Math.hypot(transform[1], transform[3])
          const width = item.width * scale
          const charWidth = raw.length > 0 ? width / raw.length : width
          while (idx !== -1) {
            const left = x + idx * charWidth
            const rectWidth = charWidth * query.length
            matches.push({ page: i, left, top: y - height, width: rectWidth, height })
            idx = str.indexOf(query, idx + query.length)
          }
        })
      }
      if (!cancelled) {
        setAllMatches(matches)
        onSearchResults?.(matches.length)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, searchQuery, scale, onSearchResults])

  // Jump to active match
  useEffect(() => {
    if (!pdfDoc || allMatches.length === 0 || searchActiveIndex === undefined) return
    const idx = Math.max(0, Math.min(searchActiveIndex, allMatches.length - 1))
    const target = allMatches[idx]
    if (target && target.page !== page) {
      setPage(target.page)
      onPageChange?.(target.page)
    }
  }, [pdfDoc, allMatches, searchActiveIndex, page, onPageChange])

  // Jump to first match on search
  useEffect(() => {
    if (!pdfDoc || !searchQuery || searchQuery.trim().length === 0) return
    let cancelled = false
    const run = async () => {
      const query = searchQuery.trim().toLowerCase()
      for (let i = 0; i < pdfDoc.numPages; i += 1) {
        const pdfPage = await pdfDoc.getPage(i + 1)
        const textContent = await pdfPage.getTextContent()
        const found = textContent.items.some((item: any) =>
          String(item.str || '').toLowerCase().includes(query)
        )
        if (found) {
          if (!cancelled) {
            setPage(i)
            onPageChange?.(i)
          }
          break
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pdfDoc, searchQuery, onPageChange])

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

  // Tracks whether the most recent pointer interaction was a drop, so we can
  // suppress the synthetic click that some browsers fire after a drag-drop.
  const justDroppedRef = useRef(false)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      justDroppedRef.current = true
      // Reset shortly after so a real, separate click still works.
      setTimeout(() => {
        justDroppedRef.current = false
      }, 250)
      onDrop?.(e, page, pageDimensions)
    },
    [onDrop, page, pageDimensions]
  )

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (justDroppedRef.current) return
      if (e.button !== 0) return
      if (!onPageClick || !canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
      onPageClick(page, x, y, pageDimensions, e.clientX, e.clientY)
      e.stopPropagation()
    },
    [onPageClick, page, pageDimensions]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onPageContextMenu || !canvasRef.current) return
      e.preventDefault()
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
      onPageContextMenu(page, x, y, pageDimensions, e.clientX, e.clientY)
      e.stopPropagation()
    },
    [onPageContextMenu, page, pageDimensions]
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!enableScrollPaging) return
      const now = Date.now()
      if (now - lastWheelAtRef.current < 150) return
      if (Math.abs(e.deltaY) < 20) return
      e.preventDefault()
      lastWheelAtRef.current = now
      if (e.deltaY > 0) {
        goToPage(page + 1)
      } else {
        goToPage(page - 1)
      }
    },
    [enableScrollPaging, page, goToPage]
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
      {showControls && (
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
      )}

      {/* PDF canvas with overlay */}
      <div
        ref={containerRef}
        className="relative inline-block shadow-lg"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      >
        <canvas ref={canvasRef} className="block" />
        {highlights.length > 0 && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ width: pageDimensions.width, height: pageDimensions.height }}
          >
            {highlights.map((r, idx) => {
              const globalIndex = allMatches.findIndex(
                (m) => m.page === page && m.left === r.left && m.top === r.top && m.width === r.width && m.height === r.height
              )
              const isActive = searchActiveIndex !== undefined && globalIndex === searchActiveIndex
              return (
              <div
                key={`${r.left}-${r.top}-${idx}`}
                className={`absolute rounded-sm ${isActive ? 'bg-yellow-400/70' : 'bg-yellow-300/40'}`}
                style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
              />
            )})}
          </div>
        )}
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
