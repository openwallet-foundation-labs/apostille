/**
 * TransitionEdge - Edge component with enhanced labels and icons
 * Supports normal, guarded, and action transitions with visual indicators
 */

'use client'

import { Group, Arrow, Rect, Text, Path, Line } from 'react-konva'
import { ICON_PATHS, getScaledIconProps } from '../icons'
import { NODE_WIDTH, NODE_HEIGHT, findBestAnchors, getStateNodeAnchors } from './StateNode'
import type { TransitionFeatures } from '../utils/featureDetection'
import { useEdgeColors, useThemeColors } from '../useThemeColors'

// Legacy export for backwards compatibility - use useEdgeColors() instead
export const EDGE_COLORS = {
  normal: '#64748b',        // slate-500
  guarded: '#f59e0b',       // amber-500
  action: '#22c55e',        // green-500
  selected: '#a78bfa',      // violet-400
  labelBg: '#1e293b',       // slate-800
  labelText: '#e2e8f0',     // slate-200
}

interface TransitionEdgeProps {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  eventName: string
  features: TransitionFeatures
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}

export function TransitionEdge({
  id,
  fromX,
  fromY,
  toX,
  toY,
  eventName,
  features,
  isSelected,
  onSelect,
  onDelete,
}: TransitionEdgeProps) {
  const themeColors = useThemeColors()
  const edgeColors = useEdgeColors()
  const { hasGuard, hasAction, isSelfLoop } = features

  // Determine edge color based on features
  let strokeColor = edgeColors.normal
  if (isSelected) {
    strokeColor = edgeColors.selected
  } else if (hasAction) {
    strokeColor = edgeColors.action
  } else if (hasGuard) {
    strokeColor = edgeColors.guarded
  }

  const strokeWidth = isSelected ? 2.5 : 2
  const dashArray = hasGuard ? [8, 4] : undefined

  if (isSelfLoop) {
    return (
      <SelfLoopEdge
        id={id}
        nodeX={fromX}
        nodeY={fromY}
        eventName={eventName}
        features={features}
        isSelected={isSelected}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        dashArray={dashArray}
        onSelect={onSelect}
        onDelete={onDelete}
        edgeColors={edgeColors}
        themeColors={themeColors}
      />
    )
  }

  // Find best anchor points
  const anchors = findBestAnchors(fromX, fromY, toX, toY)
  const { from: startPoint, to: endPoint } = anchors

  // Calculate control point for curved line
  const midX = (startPoint.x + endPoint.x) / 2
  const midY = (startPoint.y + endPoint.y) / 2
  const dx = endPoint.x - startPoint.x
  const dy = endPoint.y - startPoint.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1

  // Perpendicular offset for curve
  const nx = -dy / len
  const ny = dx / len
  const curveOffset = Math.min(30, len * 0.15)
  const cpx = midX + nx * curveOffset
  const cpy = midY + ny * curveOffset

  // Calculate label dimensions
  const iconCount = (hasGuard ? 1 : 0) + (hasAction ? 1 : 0)
  const textWidth = eventName.length * 7
  const labelWidth = textWidth + (iconCount * 16) + 16
  const labelHeight = 22
  const labelX = cpx - labelWidth / 2
  const labelY = cpy - labelHeight / 2

  // Icon positions
  const guardIconX = 6
  const actionIconX = hasGuard ? 20 : 6
  const textX = 6 + (iconCount * 14)

  return (
    <Group
      onMouseDown={(e) => {
        onSelect()
        ;(e as any).cancelBubble = true
      }}
    >
      {/* Edge line */}
      <Arrow
        points={[startPoint.x, startPoint.y, cpx, cpy, endPoint.x, endPoint.y]}
        tension={0.5}
        stroke={strokeColor}
        fill={strokeColor}
        strokeWidth={strokeWidth}
        dash={dashArray}
        pointerLength={10}
        pointerWidth={10}
        hitStrokeWidth={15}
      />

      {/* Label background */}
      <Rect
        x={labelX}
        y={labelY}
        width={labelWidth}
        height={labelHeight}
        fill={edgeColors.labelBg}
        cornerRadius={6}
        shadowColor={themeColors.nodeShadow}
        shadowBlur={4}
        shadowOpacity={0.2}
        shadowOffsetY={1}
      />

      {/* Guard icon */}
      {hasGuard && (
        <Path
          x={labelX + guardIconX}
          y={labelY + 5}
          data={getScaledIconProps('lock', 12).data}
          scaleX={0.5}
          scaleY={0.5}
          fill={edgeColors.guarded}
        />
      )}

      {/* Action icon */}
      {hasAction && (
        <Path
          x={labelX + actionIconX}
          y={labelY + 5}
          data={getScaledIconProps('bolt', 12).data}
          scaleX={0.5}
          scaleY={0.5}
          fill={edgeColors.action}
        />
      )}

      {/* Event name text */}
      <Text
        x={labelX + textX}
        y={labelY + 5}
        text={eventName}
        fontSize={12}
        fontFamily="system-ui, -apple-system, sans-serif"
        fill={edgeColors.labelText}
      />

      {/* Delete button when selected */}
      {isSelected && (
        <Group
          x={labelX + labelWidth + 6}
          y={labelY + (labelHeight - 16) / 2}
          onClick={(e) => {
            e.cancelBubble = true
            onDelete()
          }}
        >
          <Rect
            width={16}
            height={16}
            fill={themeColors.common.delete}
            cornerRadius={4}
          />
          <Path
            x={2}
            y={2}
            data={ICON_PATHS.close}
            scaleX={0.5}
            scaleY={0.5}
            fill={themeColors.common.deleteText}
          />
        </Group>
      )}
    </Group>
  )
}

// Self-loop edge component
interface SelfLoopEdgeProps {
  id: string
  nodeX: number
  nodeY: number
  eventName: string
  features: TransitionFeatures
  isSelected: boolean
  strokeColor: string
  strokeWidth: number
  dashArray?: number[]
  onSelect: () => void
  onDelete: () => void
  edgeColors: ReturnType<typeof useEdgeColors>
  themeColors: ReturnType<typeof useThemeColors>
}

function SelfLoopEdge({
  id,
  nodeX,
  nodeY,
  eventName,
  features,
  isSelected,
  strokeColor,
  strokeWidth,
  dashArray,
  onSelect,
  onDelete,
  edgeColors,
  themeColors,
}: SelfLoopEdgeProps) {
  const { hasGuard, hasAction } = features

  // Self-loop arc above the node
  const loopRadius = 35
  const startAngle = -150
  const endAngle = -30
  const centerY = nodeY - loopRadius / 2

  // Calculate arc points
  const startRad = (startAngle * Math.PI) / 180
  const endRad = (endAngle * Math.PI) / 180
  const nodeCenterX = nodeX + NODE_WIDTH / 2

  const sx = nodeCenterX + loopRadius * Math.cos(startRad)
  const sy = centerY + loopRadius * Math.sin(startRad)
  const ex = nodeCenterX + loopRadius * Math.cos(endRad)
  const ey = centerY + loopRadius * Math.sin(endRad)

  // Control points for bezier curve
  const cp1x = nodeCenterX - loopRadius * 0.5
  const cp1y = centerY - loopRadius * 1.2
  const cp2x = nodeCenterX + loopRadius * 0.5
  const cp2y = centerY - loopRadius * 1.2

  // Label position
  const labelY = centerY - loopRadius * 1.5
  const iconCount = (hasGuard ? 1 : 0) + (hasAction ? 1 : 0)
  const textWidth = eventName.length * 7
  const labelWidth = textWidth + (iconCount * 16) + 16
  const labelHeight = 22
  const labelX = nodeCenterX - labelWidth / 2

  const guardIconX = 6
  const actionIconX = hasGuard ? 20 : 6
  const textX = 6 + (iconCount * 14)

  return (
    <Group
      onMouseDown={(e) => {
        onSelect()
        ;(e as any).cancelBubble = true
      }}
    >
      {/* Self-loop arc using bezier curve */}
      <Arrow
        points={[sx, sy, cp1x, cp1y, cp2x, cp2y, ex, ey]}
        bezier
        stroke={strokeColor}
        fill={strokeColor}
        strokeWidth={strokeWidth}
        dash={dashArray}
        pointerLength={10}
        pointerWidth={10}
        hitStrokeWidth={15}
      />

      {/* Label background */}
      <Rect
        x={labelX}
        y={labelY - labelHeight / 2}
        width={labelWidth}
        height={labelHeight}
        fill={edgeColors.labelBg}
        cornerRadius={6}
        shadowColor={themeColors.nodeShadow}
        shadowBlur={4}
        shadowOpacity={0.2}
        shadowOffsetY={1}
      />

      {/* Guard icon */}
      {hasGuard && (
        <Path
          x={labelX + guardIconX}
          y={labelY - labelHeight / 2 + 5}
          data={getScaledIconProps('lock', 12).data}
          scaleX={0.5}
          scaleY={0.5}
          fill={edgeColors.guarded}
        />
      )}

      {/* Action icon */}
      {hasAction && (
        <Path
          x={labelX + actionIconX}
          y={labelY - labelHeight / 2 + 5}
          data={getScaledIconProps('bolt', 12).data}
          scaleX={0.5}
          scaleY={0.5}
          fill={edgeColors.action}
        />
      )}

      {/* Event name text */}
      <Text
        x={labelX + textX}
        y={labelY - labelHeight / 2 + 5}
        text={eventName}
        fontSize={12}
        fontFamily="system-ui, -apple-system, sans-serif"
        fill={edgeColors.labelText}
      />

      {/* Delete button when selected */}
      {isSelected && (
        <Group
          x={labelX + labelWidth + 6}
          y={labelY - 8}
          onClick={(e) => {
            e.cancelBubble = true
            onDelete()
          }}
        >
          <Rect
            width={16}
            height={16}
            fill={themeColors.common.delete}
            cornerRadius={4}
          />
          <Path
            x={2}
            y={2}
            data={ICON_PATHS.close}
            scaleX={0.5}
            scaleY={0.5}
            fill={themeColors.common.deleteText}
          />
        </Group>
      )}
    </Group>
  )
}

// Edge preview when drawing a new connection
interface EdgePreviewProps {
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export function EdgePreview({ fromX, fromY, toX, toY }: EdgePreviewProps) {
  const themeColors = useThemeColors()

  // Get the right anchor from the source node
  const anchors = getStateNodeAnchors(fromX, fromY)

  // Find closest anchor to target
  const dx = toX - (fromX + NODE_WIDTH / 2)
  const dy = toY - (fromY + NODE_HEIGHT / 2)

  let startPoint: { x: number; y: number }
  if (Math.abs(dx) > Math.abs(dy)) {
    startPoint = dx > 0 ? anchors.right : anchors.left
  } else {
    startPoint = dy > 0 ? anchors.bottom : anchors.top
  }

  return (
    <Arrow
      points={[startPoint.x, startPoint.y, toX, toY]}
      stroke={themeColors.common.preview}
      fill={themeColors.common.preview}
      opacity={0.6}
      strokeWidth={2}
      pointerLength={10}
      pointerWidth={10}
      dash={[6, 3]}
    />
  )
}

export default TransitionEdge
