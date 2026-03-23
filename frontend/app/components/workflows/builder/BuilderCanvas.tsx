'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { CANVAS_CONFIG } from '@/lib/workflow-builder/constants'
import type { StateNodeData } from '@/lib/workflow-builder/types'
import { StateNode, NODE_WIDTH, NODE_HEIGHT } from './nodes/StateNode'
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
    addState,
    autoLayout,
    undo,
    redo,
  } = useBuilderStore()

  const themeColors = useThemeColors()
  const stageRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 500 })
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null)
  const [editEdge, setEditEdge] = useState<{ edgeId: string; screenX: number; screenY: number } | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [panTool, setPanTool] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const isPanning = (panTool || spaceDown) && !draggingItem
  const [selectionBox, setSelectionBox] = useState<{
    active: boolean
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    cx: number
    cy: number
  } | null>(null)

  const snapToGrid = useCallback((v: number) => {
    const grid = 32
    return Math.round(v / grid) * grid
  }, [])

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const stage = stageRef.current
      if (!stage) return { x: 0, y: 0 }
      const rect = stage.container().getBoundingClientRect()
      const x = (clientX - rect.left - pan.x) / zoom
      const y = (clientY - rect.top - pan.y) / zoom
      return { x, y }
    },
    [pan.x, pan.y, zoom]
  )

  const centerView = useCallback(() => {
    if (nodes.length === 0) return
    const xs = nodes.map((n) => n.x)
    const ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs) + NODE_WIDTH
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys) + NODE_HEIGHT
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const newPan = {
      x: size.w / 2 - centerX * zoom,
      y: size.h / 2 - centerY * zoom,
    }
    setPan(newPan)
  }, [nodes, size.w, size.h, zoom, setPan])
  const [minimapDragging, setMinimapDragging] = useState(false)

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
      const activeTag = document.activeElement?.tagName
      const isTyping =
        activeTag === 'INPUT' ||
        activeTag === 'TEXTAREA' ||
        (document.activeElement as HTMLElement | null)?.isContentEditable

      if (e.key === 'Escape') {
        cancelEdge()
        setEditEdge(null)
        endDrag()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isTyping) return
        deleteSelection()
      }
      if (e.code === 'Space' && !isTyping) {
        e.preventDefault()
        setSpaceDown(true)
      }
      if (!isTyping && !e.metaKey && !e.ctrlKey) {
        if (e.key.toLowerCase() === 'c' && selection.nodes.length === 1 && !pendingEdgeFrom) {
          beginEdge(selection.nodes[0])
          return
        }
        if (e.key.toLowerCase() === 'n') {
          const x = pointerPos?.x ?? (size.w / 2 - pan.x) / zoom
          const y = pointerPos?.y ?? (size.h / 2 - pan.y) / zoom
          addState('normal', snapToGrid(x), snapToGrid(y))
        } else if (e.key.toLowerCase() === 's') {
          const x = pointerPos?.x ?? (size.w / 2 - pan.x) / zoom
          const y = pointerPos?.y ?? (size.h / 2 - pan.y) / zoom
          addState('start', snapToGrid(x), snapToGrid(y))
        } else if (e.key.toLowerCase() === 'f') {
          const x = pointerPos?.x ?? (size.w / 2 - pan.x) / zoom
          const y = pointerPos?.y ?? (size.h / 2 - pan.y) / zoom
          addState('final', snapToGrid(x), snapToGrid(y))
        }
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
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpaceDown(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [
    zoom,
    setZoom,
    cancelEdge,
    endDrag,
    deleteSelection,
    undo,
    redo,
    addState,
    pointerPos,
    selection.nodes,
    pendingEdgeFrom,
    beginEdge,
    size.w,
    size.h,
    pan.x,
    pan.y,
    snapToGrid,
  ])

  // Handle drop from sidebar
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!draggingItem || !stageRef.current) return

      const stage = stageRef.current
      const rect = stage.container().getBoundingClientRect()
      const x = (e.clientX - rect.left - pan.x) / zoom
      const y = (e.clientY - rect.top - pan.y) / zoom

      dropNode(snapToGrid(x), snapToGrid(y))
    },
    [draggingItem, pan, zoom, dropNode, snapToGrid, nodes, endDrag, setSelection]
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
    const isConnecting = !!pendingEdgeFrom && pendingEdgeFrom !== id
    const canCompleteSelf = pendingEdgeFrom === id
    const showAnchors = isSelected || isConnecting || canCompleteSelf

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
        showAnchors={showAnchors}
        canDrag={!isPanning}
        isConnecting={!!isConnecting && isNodeNearPointer(x, y)}
        canCompleteSelf={canCompleteSelf}
        onSelect={() => {
          if (isPanning) return
          setSelection({ nodes: [id], edges: [] })
        }}
        onDragEnd={(newX, newY) => updateNodePosition(id, snapToGrid(newX), snapToGrid(newY))}
        onDelete={() => removeState(id)}
        onBeginEdge={() => {
          if (isPanning) return
          if (!pendingEdgeFrom) {
            beginEdge(id)
          }
        }}
        onCompleteEdge={() => {
          if (isPanning) return
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
    if (!pendingEdgeFrom || !pointerPos) return null

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
      style={{
        backgroundColor: themeColors.canvas.background,
        cursor: isPanning ? 'grab' : pendingEdgeFrom ? 'crosshair' : 'default',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onContextMenu={(e) => {
        e.preventDefault()
        const rect = containerRef.current?.getBoundingClientRect()
        const world = toWorld(e.clientX, e.clientY)
        const x = rect ? e.clientX - rect.left : e.clientX
        const y = rect ? e.clientY - rect.top : e.clientY
        setContextMenu({ x, y, cx: world.x, cy: world.y })
      }}
    >
      {/* Floating toolbar (Excalidraw-style) */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-surface-100/90 dark:bg-surface-800/90 backdrop-blur rounded-xl p-1.5 shadow-lg border border-border-secondary">
        <button
          onClick={() => setPanTool(false)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            !panTool
              ? 'bg-primary-600 text-white'
              : 'text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary'
          }`}
          title="Select (move nodes)"
        >
          Select
        </button>
        <button
          onClick={() => setPanTool(!panTool)}
          className={`px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            panTool
              ? 'bg-primary-600 text-white'
              : 'text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary'
          }`}
          title="Hand tool (pan)"
        >
          Hand
        </button>
        <button
          onClick={() => fitToView(size.w, size.h)}
          className="px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary rounded-lg transition-colors"
          title="Fit to view"
        >
          Fit
        </button>
        <button
          onClick={() => centerView()}
          className="px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary rounded-lg transition-colors"
          title="Center view"
        >
          Center
        </button>
        <div className="w-px bg-border-secondary mx-1" />
        <button
          onClick={() => setZoom(Math.max(CANVAS_CONFIG.MIN_ZOOM, zoom / 1.15))}
          className="px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary rounded-lg transition-colors"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={() => setZoom(1)}
          className="px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary rounded-lg transition-colors"
          title="Reset zoom (100%)"
        >
          100%
        </button>
        <button
          onClick={() => setZoom(Math.min(CANVAS_CONFIG.MAX_ZOOM, zoom * 1.15))}
          className="px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-200 dark:hover:bg-surface-700 hover:text-text-primary rounded-lg transition-colors"
          title="Zoom in"
        >
          +
        </button>
        <div className="px-2 text-[11px] text-text-tertiary border-l border-border-secondary ml-1">
          {Math.round(zoom * 100)}%
        </div>
      </div>

      {/* Hint */}
      {!pendingEdgeFrom && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 bg-surface-100/90 dark:bg-surface-800/90 backdrop-blur rounded-lg px-3 py-1.5 text-[11px] text-text-secondary border border-border-secondary">
          Connect: drag from a node handle. Pan: hold Space or use Hand.
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="absolute z-20 min-w-[180px] rounded-lg border border-border-secondary bg-surface-50 dark:bg-surface-900 shadow-xl py-1 text-sm"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-text-secondary"
            onClick={() => {
              addState('start', snapToGrid(contextMenu.cx), snapToGrid(contextMenu.cy))
              setContextMenu(null)
            }}
          >
            Add Start State
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-text-secondary"
            onClick={() => {
              addState('normal', snapToGrid(contextMenu.cx), snapToGrid(contextMenu.cy))
              setContextMenu(null)
            }}
          >
            Add State
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-text-secondary"
            onClick={() => {
              addState('final', snapToGrid(contextMenu.cx), snapToGrid(contextMenu.cy))
              setContextMenu(null)
            }}
          >
            Add Final State
          </button>
          <div className="my-1 h-px bg-border-secondary" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-text-secondary"
            onClick={() => {
              fitToView(size.w, size.h)
              setContextMenu(null)
            }}
          >
            Fit to View
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-text-secondary"
            onClick={() => {
              centerView()
              setContextMenu(null)
            }}
          >
            Center View
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-surface-100 dark:hover:bg-surface-800 text-text-secondary"
            onClick={async () => {
              await autoLayout()
              setContextMenu(null)
            }}
          >
            Auto Layout
          </button>
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
          draggable={isPanning && !pendingEdgeFrom}
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
            if (contextMenu && e.evt.button === 0) {
              setContextMenu(null)
            }
            if (e.target === st && !isPanning && e.evt.button === 0) {
              clearSelection()
              const world = toWorld(e.evt.clientX, e.evt.clientY)
              setSelectionBox({ active: true, x1: world.x, y1: world.y, x2: world.x, y2: world.y })
            }
          }}
          onMouseMove={(e) => {
            const stage = e.target.getStage()
            if (!stage) return
            const pos = stage.getPointerPosition()
            if (!pos) return
            setPointerPos({ x: (pos.x - pan.x) / zoom, y: (pos.y - pan.y) / zoom })
            if (selectionBox?.active) {
              const world = toWorld(e.evt.clientX, e.evt.clientY)
              setSelectionBox((prev) =>
                prev ? { ...prev, x2: world.x, y2: world.y } : prev
              )
            }
          }}
          onMouseUp={(e) => {
            const st = e.target.getStage()
            if (pendingEdgeFrom && e.target === st) {
              cancelEdge()
            }
            if (selectionBox?.active) {
              const xMin = Math.min(selectionBox.x1, selectionBox.x2)
              const xMax = Math.max(selectionBox.x1, selectionBox.x2)
              const yMin = Math.min(selectionBox.y1, selectionBox.y2)
              const yMax = Math.max(selectionBox.y1, selectionBox.y2)
              const width = xMax - xMin
              const height = yMax - yMin
              if (width > 4 && height > 4) {
                const selectedNodes = nodes
                  .filter((n) => n.type === 'state')
                  .filter((n) => {
                    const nx = n.x
                    const ny = n.y
                    const nRight = nx + NODE_WIDTH
                    const nBottom = ny + NODE_HEIGHT
                    return nRight >= xMin && nx <= xMax && nBottom >= yMin && ny <= yMax
                  })
                  .map((n) => n.id)
                setSelection({ nodes: selectedNodes, edges: [] })
              }
              setSelectionBox(null)
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

            {/* Selection box */}
            {selectionBox?.active && (
              <Line
                points={[
                  selectionBox.x1,
                  selectionBox.y1,
                  selectionBox.x2,
                  selectionBox.y1,
                  selectionBox.x2,
                  selectionBox.y2,
                  selectionBox.x1,
                  selectionBox.y2,
                  selectionBox.x1,
                  selectionBox.y1,
                ]}
                stroke={themeColors.edges.selected}
                strokeWidth={1}
                dash={[4, 3]}
                opacity={0.9}
              />
            )}

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
