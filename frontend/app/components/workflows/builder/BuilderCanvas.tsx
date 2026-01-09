'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Stage, Layer, Line, Arrow } from 'react-konva'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { CANVAS_CONFIG } from '@/lib/workflow-builder/constants'
import type { StateNodeData } from '@/lib/workflow-builder/types'
import { StateNode, NODE_WIDTH, NODE_HEIGHT, getStateNodeAnchors } from './nodes/StateNode'
import { TransitionEdge, EdgePreview } from './nodes/TransitionEdge'
import { detectStateFeatures, detectTransitionFeatures } from './utils/featureDetection'
import { useThemeColors } from './useThemeColors'

export function BuilderCanvas() {
  const {
    nodes,
    edges,
    zoom,
    pan,
    setZoom,
    setPan,
    selection,
    setSelection,
    clearSelection,
    mode,
    setMode,
    draggingItem,
    endDrag,
    dropNode,
    pendingEdgeFrom,
    beginEdge,
    completeEdge,
    cancelEdge,
    updateNodePosition,
    removeState,
    removeTransition,
    fitToView,
    deleteSelection,
    template,
  } = useBuilderStore()

  const themeColors = useThemeColors()
  const stageRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [editEdge, setEditEdge] = useState<{ edgeId: string; screenX: number; screenY: number } | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Focus edge label input
  useEffect(() => {
    if (editEdge && editInputRef.current) editInputRef.current.focus()
  }, [editEdge])

  // Resize observer
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const el = containerRef.current
      if (!el) return
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelEdge()
        setEditEdge(null)
        endDrag()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement?.tagName === 'INPUT') return
        deleteSelection()
      }
      // Zoom with +/-
      const zoomAt = (factor: number) => {
        const newScale = Math.max(
          CANVAS_CONFIG.MIN_ZOOM,
          Math.min(CANVAS_CONFIG.MAX_ZOOM, zoom * factor)
        )
        setZoom(newScale)
      }
      if (e.key === '=' || e.key === '+') zoomAt(1.15)
      if (e.key === '-') zoomAt(1 / 1.15)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, setZoom, cancelEdge, endDrag, deleteSelection])

  // Handle drop from sidebar
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!draggingItem || !stageRef.current) return

      const stage = stageRef.current
      const rect = stage.container().getBoundingClientRect()
      const x = (e.clientX - rect.left - pan.x) / zoom
      const y = (e.clientY - rect.top - pan.y) / zoom

      dropNode(x, y)
    },
    [draggingItem, pan, zoom, dropNode]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Handle edge label commit
  const handleEdgeLabelCommit = useCallback(
    (value: string) => {
      if (!editEdge) return
      const edge = edges.find((e) => e.id === editEdge.edgeId)
      if (edge && value.trim()) {
        // Update the transition event name
        const { updateTransition } = useBuilderStore.getState()
        updateTransition(editEdge.edgeId, { on: value.trim() })
      }
      setEditEdge(null)
    },
    [editEdge, edges]
  )

  // Compute state features for all states
  const stateFeatures = useMemo(() => {
    const features = new Map<string, ReturnType<typeof detectStateFeatures>>()
    for (const node of nodes) {
      if (node.type === 'state') {
        const data = node.data as StateNodeData
        features.set(node.id, detectStateFeatures(data.name, template))
      }
    }
    return features
  }, [nodes, template])

  // Compute transition features
  const transitionFeatures = useMemo(() => {
    const features = new Map<string, ReturnType<typeof detectTransitionFeatures>>()
    for (const edge of edges) {
      const transition = template.transitions.find(
        t => t.from === edge.from && t.to === edge.to && t.on === edge.data.on
      ) || { from: edge.from, to: edge.to, on: edge.data.on, guard: edge.data.guard, action: edge.data.action }
      features.set(edge.id, detectTransitionFeatures(transition, template))
    }
    return features
  }, [edges, template])

  // Render state node
  const renderStateNode = (node: { id: string; x: number; y: number; data: StateNodeData }) => {
    const { id, x, y, data } = node
    const isSelected = selection.nodes.includes(id)
    const features = stateFeatures.get(id) || {
      hasForm: false,
      hasCredential: false,
      hasProof: false,
      hasGuardedExit: false,
      hasActionExit: false,
      incomingCount: 0,
      outgoingCount: 0,
    }
    const isConnecting = mode === 'connect' && pendingEdgeFrom && pendingEdgeFrom !== id

    return (
      <StateNode
        key={id}
        id={id}
        x={x}
        y={y}
        name={data.name}
        stateType={data.stateType}
        features={features}
        isSelected={isSelected}
        isConnectMode={mode === 'connect'}
        isConnecting={!!isConnecting && isNodeNearPointer(x, y)}
        onSelect={() => setSelection({ nodes: [id], edges: [] })}
        onDragEnd={(newX, newY) => updateNodePosition(id, newX, newY)}
        onDelete={() => removeState(id)}
        onBeginEdge={() => {
          if (!pendingEdgeFrom) {
            beginEdge(id)
          }
        }}
        onCompleteEdge={() => {
          if (pendingEdgeFrom && pendingEdgeFrom !== id) {
            // Show inline editor for event name
            const fromNode = nodes.find((n) => n.id === pendingEdgeFrom)
            if (fromNode) {
              const midX = (fromNode.x + NODE_WIDTH / 2 + x + NODE_WIDTH / 2) / 2
              const midY = (fromNode.y + NODE_HEIGHT / 2 + y + NODE_HEIGHT / 2) / 2
              const screenX = midX * zoom + pan.x
              const screenY = midY * zoom + pan.y
              completeEdge(id, 'event')
              setTimeout(() => {
                const newEdge = useBuilderStore.getState().edges.slice(-1)[0]
                if (newEdge) {
                  setEditEdge({ edgeId: newEdge.id, screenX, screenY })
                }
              }, 0)
            }
          } else if (pendingEdgeFrom === id) {
            // Self-loop
            const screenX = (x + NODE_WIDTH / 2) * zoom + pan.x
            const screenY = (y - 50) * zoom + pan.y
            completeEdge(id, 'event')
            setTimeout(() => {
              const newEdge = useBuilderStore.getState().edges.slice(-1)[0]
              if (newEdge) {
                setEditEdge({ edgeId: newEdge.id, screenX, screenY })
              }
            }, 0)
          }
        }}
      />
    )
  }

  // Check if pointer is near a node (for hover highlighting during connect)
  const isNodeNearPointer = (nodeX: number, nodeY: number): boolean => {
    if (!pointerPos) return false
    const centerX = nodeX + NODE_WIDTH / 2
    const centerY = nodeY + NODE_HEIGHT / 2
    const dx = pointerPos.x - centerX
    const dy = pointerPos.y - centerY
    const distance = Math.sqrt(dx * dx + dy * dy)
    return distance < NODE_WIDTH
  }

  // Render edge
  const renderEdge = (edge: typeof edges[0]) => {
    const fromNode = nodes.find((n) => n.id === edge.from)
    const toNode = nodes.find((n) => n.id === edge.to)
    if (!fromNode || !toNode) return null

    const isSelected = selection.edges.includes(edge.id)
    const features = transitionFeatures.get(edge.id) || {
      hasGuard: !!edge.data.guard,
      hasAction: !!edge.data.action,
      isSelfLoop: edge.from === edge.to,
    }

    return (
      <TransitionEdge
        key={edge.id}
        id={edge.id}
        fromX={fromNode.x}
        fromY={fromNode.y}
        toX={toNode.x}
        toY={toNode.y}
        eventName={edge.data.on}
        features={features}
        isSelected={isSelected}
        onSelect={() => setSelection({ nodes: [], edges: [edge.id] })}
        onDelete={() => removeTransition(edge.id)}
      />
    )
  }

  // Render edge preview when connecting
  const renderEdgePreview = () => {
    if (mode !== 'connect' || !pendingEdgeFrom || !pointerPos) return null

    const fromNode = nodes.find((n) => n.id === pendingEdgeFrom)
    if (!fromNode) return null

    return (
      <EdgePreview
        fromX={fromNode.x}
        fromY={fromNode.y}
        toX={pointerPos.x}
        toY={pointerPos.y}
      />
    )
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-surface-950 dark:bg-surface-950 overflow-hidden relative"
      style={{ backgroundColor: themeColors.canvas.background }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Toolbar */}
      <div className="absolute top-2 left-2 z-10 flex gap-1 bg-surface-100/90 dark:bg-surface-800/90 backdrop-blur rounded-lg p-1 shadow-lg border border-border-secondary">
        <button
          onClick={() => setMode('select')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'select'
              ? 'bg-primary-600 text-white'
              : 'text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary'
          }`}
          title="Select mode (move nodes)"
        >
          Select
        </button>
        <button
          onClick={() => setMode('connect')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === 'connect'
              ? 'bg-primary-600 text-white'
              : 'text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary'
          }`}
          title="Connect mode (create transitions)"
        >
          Connect
        </button>
        <div className="w-px bg-border-secondary mx-1" />
        <button
          onClick={() => fitToView(size.w, size.h)}
          className="px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary rounded-md transition-colors"
          title="Fit to view"
        >
          Fit
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute top-2 right-2 z-10 bg-surface-100/90 dark:bg-surface-800/90 backdrop-blur rounded-lg px-3 py-1.5 text-xs text-text-secondary border border-border-secondary">
        {Math.round(zoom * 100)}%
      </div>

      {/* Mode indicator */}
      {mode === 'connect' && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 bg-warning-600/90 backdrop-blur rounded-lg px-4 py-2 text-xs text-white font-medium shadow-lg">
          Click a state to start, then click another state to connect
        </div>
      )}

      {/* Canvas */}
      {size.w > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={zoom}
          scaleY={zoom}
          x={pan.x}
          y={pan.y}
          draggable={mode === 'select' && !pendingEdgeFrom}
          onDragEnd={(e) => setPan({ x: e.target.x(), y: e.target.y() })}
          onWheel={(e) => {
            e.evt.preventDefault()
            const stage = e.target.getStage()
            if (!stage) return
            const pointer = stage.getPointerPosition()
            if (!pointer) return
            const oldScale = zoom
            const scaleBy = 1.06
            const newScale =
              e.evt.deltaY < 0
                ? Math.min(CANVAS_CONFIG.MAX_ZOOM, oldScale * scaleBy)
                : Math.max(CANVAS_CONFIG.MIN_ZOOM, oldScale / scaleBy)
            const mousePointTo = {
              x: (pointer.x - pan.x) / oldScale,
              y: (pointer.y - pan.y) / oldScale,
            }
            const newPos = {
              x: pointer.x - mousePointTo.x * newScale,
              y: pointer.y - mousePointTo.y * newScale,
            }
            setZoom(newScale)
            setPan(newPos)
          }}
          onMouseDown={(e) => {
            const st = e.target.getStage()
            if (e.target === st && mode === 'select') {
              clearSelection()
            }
          }}
          onMouseMove={(e) => {
            const stage = e.target.getStage()
            if (!stage) return
            const pos = stage.getPointerPosition()
            if (!pos) return
            setPointerPos({ x: (pos.x - pan.x) / zoom, y: (pos.y - pan.y) / zoom })
          }}
          onMouseUp={(e) => {
            const st = e.target.getStage()
            if (mode === 'connect' && pendingEdgeFrom && e.target === st) {
              cancelEdge()
            }
          }}
        >
          <Layer>
            {/* Grid */}
            {(() => {
              const lines: React.ReactElement[] = []
              const gs = 32
              const cols = Math.ceil(size.w / zoom / gs) + 2
              const rows = Math.ceil(size.h / zoom / gs) + 2
              const offsetX = Math.floor(-pan.x / zoom / gs) * gs
              const offsetY = Math.floor(-pan.y / zoom / gs) * gs
              for (let i = 0; i < cols; i++) {
                lines.push(
                  <Line
                    key={`v${i}`}
                    points={[offsetX + i * gs, offsetY, offsetX + i * gs, offsetY + rows * gs]}
                    stroke={themeColors.canvas.gridLine}
                    strokeWidth={1}
                    opacity={themeColors.canvas.gridOpacity}
                  />
                )
              }
              for (let j = 0; j < rows; j++) {
                lines.push(
                  <Line
                    key={`h${j}`}
                    points={[offsetX, offsetY + j * gs, offsetX + cols * gs, offsetY + j * gs]}
                    stroke={themeColors.canvas.gridLine}
                    strokeWidth={1}
                    opacity={themeColors.canvas.gridOpacity}
                  />
                )
              }
              return lines
            })()}

            {/* Edge preview when connecting */}
            {renderEdgePreview()}

            {/* Edges */}
            {edges.map(renderEdge)}

            {/* Nodes */}
            {nodes
              .filter((n) => n.type === 'state')
              .map((n) => renderStateNode(n as { id: string; x: number; y: number; data: StateNodeData }))}
          </Layer>
        </Stage>
      )}

      {/* Inline edge label editor */}
      {editEdge && (
        <input
          ref={editInputRef}
          className="absolute z-20 rounded-lg border border-border-secondary bg-surface-50 dark:bg-surface-800 px-3 py-1.5 text-sm text-text-primary shadow-lg focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          style={{
            left: Math.max(4, editEdge.screenX - 70),
            top: Math.max(4, editEdge.screenY - 16),
            width: 140,
          }}
          placeholder="event name"
          defaultValue="event"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleEdgeLabelCommit((e.target as HTMLInputElement).value)
            } else if (e.key === 'Escape') {
              setEditEdge(null)
            }
          }}
          onBlur={(e) => handleEdgeLabelCommit(e.target.value)}
        />
      )}

      {/* Drop indicator */}
      {draggingItem && (
        <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-primary-500 bg-primary-500/5 rounded-lg" />
      )}
    </div>
  )
}
