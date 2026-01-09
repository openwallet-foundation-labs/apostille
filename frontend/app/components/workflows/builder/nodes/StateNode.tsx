/**
 * StateNode - Card-based state node for workflow builder
 * Replaces the circular nodes with professional card design
 */

'use client'

import { Group, Rect, Text, Path, Circle } from 'react-konva'
import { ICON_PATHS, getScaledIconProps } from '../icons'
import { BadgesRow, BadgeType } from './FeatureBadge'
import { StateFeatures } from '../utils/featureDetection'
import type { StateType } from '@/lib/workflow-builder/types'
import { useStateNodeColors, useThemeColors, type StateNodeColors } from '../useThemeColors'

// Node dimensions
export const NODE_WIDTH = 180
export const NODE_HEIGHT = 88
export const NODE_HEADER_HEIGHT = 24
export const NODE_BORDER_RADIUS = 8
export const NODE_ACCENT_WIDTH = 4

// Legacy export for backwards compatibility - use useStateNodeColors() instead
export const STATE_NODE_COLORS: Record<StateType, { border: string; headerBg: string; headerText: string; label: string }> = {
  start: {
    border: '#22c55e',
    headerBg: '#14532d',
    headerText: '#86efac',
    label: 'START',
  },
  normal: {
    border: '#3b82f6',
    headerBg: '#1e3a8a',
    headerText: '#93c5fd',
    label: 'STATE',
  },
  final: {
    border: '#a855f7',
    headerBg: '#581c87',
    headerText: '#d8b4fe',
    label: 'FINAL',
  },
}

// Icon keys for state types
const STATE_ICONS: Record<StateType, keyof typeof ICON_PATHS> = {
  start: 'play',
  normal: 'circle',
  final: 'checkCircle',
}

interface StateNodeProps {
  id: string
  x: number
  y: number
  name: string
  stateType: StateType
  features: StateFeatures
  isSelected: boolean
  isConnectMode: boolean
  isConnecting: boolean  // Currently drawing an edge from another node
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
  onDelete: () => void
  onBeginEdge: () => void
  onCompleteEdge: () => void
}

export function StateNode({
  id,
  x,
  y,
  name,
  stateType,
  features,
  isSelected,
  isConnectMode,
  isConnecting,
  onSelect,
  onDragEnd,
  onDelete,
  onBeginEdge,
  onCompleteEdge,
}: StateNodeProps) {
  const themeColors = useThemeColors()
  const stateNodeColors = useStateNodeColors()
  const colors = stateNodeColors[stateType]
  const iconKey = STATE_ICONS[stateType]
  const iconProps = getScaledIconProps(iconKey, 14)

  // Build badges list based on features
  const badges: BadgeType[] = []
  if (features.section) badges.push('section')
  if (features.hasForm) badges.push('form')
  if (features.hasCredential) badges.push('credential')
  if (features.hasProof) badges.push('proof')
  if (features.hasGuardedExit) badges.push('guard')
  if (features.hasActionExit) badges.push('action')

  // Truncate name if too long
  const displayName = name.length > 18 ? name.slice(0, 16) + '...' : name

  return (
    <Group
      x={x}
      y={y}
      draggable={!isConnectMode}
      onDragEnd={(e) => onDragEnd(e.target.x(), e.target.y())}
      onMouseDown={(e) => {
        onSelect()
        if (isConnectMode) {
          onBeginEdge()
        }
        ;(e as any).cancelBubble = true
      }}
      onMouseUp={() => {
        if (isConnecting) {
          onCompleteEdge()
        }
      }}
    >
      {/* Selection outline */}
      {isSelected && (
        <Rect
          x={-4}
          y={-4}
          width={NODE_WIDTH + 8}
          height={NODE_HEIGHT + 8}
          stroke={themeColors.edges.selected}
          strokeWidth={2}
          cornerRadius={NODE_BORDER_RADIUS + 2}
          fillEnabled={false}
        />
      )}

      {/* Hover indicator when connecting */}
      {isConnecting && (
        <Rect
          x={-4}
          y={-4}
          width={NODE_WIDTH + 8}
          height={NODE_HEIGHT + 8}
          stroke={themeColors.edges.guarded}
          strokeWidth={2}
          cornerRadius={NODE_BORDER_RADIUS + 2}
          fillEnabled={false}
        />
      )}

      {/* Card shadow */}
      <Rect
        x={2}
        y={2}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        fill={themeColors.nodeShadow}
        opacity={0.2}
        cornerRadius={NODE_BORDER_RADIUS}
      />

      {/* Card background */}
      <Rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        fill={themeColors.nodeBg}
        stroke={themeColors.nodeBorder}
        strokeWidth={1}
        cornerRadius={NODE_BORDER_RADIUS}
      />

      {/* Left accent border */}
      <Rect
        x={0}
        y={0}
        width={NODE_ACCENT_WIDTH}
        height={NODE_HEIGHT}
        fill={colors.border}
        cornerRadius={[NODE_BORDER_RADIUS, 0, 0, NODE_BORDER_RADIUS]}
      />

      {/* Header background */}
      <Rect
        x={NODE_ACCENT_WIDTH}
        y={0}
        width={NODE_WIDTH - NODE_ACCENT_WIDTH}
        height={NODE_HEADER_HEIGHT}
        fill={colors.headerBg}
        opacity={0.5}
        cornerRadius={[0, NODE_BORDER_RADIUS, 0, 0]}
      />

      {/* Header separator line */}
      <Rect
        x={NODE_ACCENT_WIDTH}
        y={NODE_HEADER_HEIGHT}
        width={NODE_WIDTH - NODE_ACCENT_WIDTH}
        height={1}
        fill={themeColors.nodeBorder}
        opacity={0.5}
      />

      {/* Type icon */}
      <Path
        x={NODE_ACCENT_WIDTH + 8}
        y={(NODE_HEADER_HEIGHT - 14) / 2}
        data={iconProps.data}
        scaleX={iconProps.scaleX}
        scaleY={iconProps.scaleY}
        fill={colors.headerText}
      />

      {/* Type label */}
      <Text
        x={NODE_ACCENT_WIDTH + 26}
        y={(NODE_HEADER_HEIGHT - 10) / 2}
        text={colors.label}
        fontSize={10}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontStyle="bold"
        fill={colors.headerText}
        letterSpacing={0.5}
      />

      {/* Delete button (on selection) */}
      {isSelected && !isConnectMode && (
        <Group
          x={NODE_WIDTH - 20}
          y={4}
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
            opacity={0.9}
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

      {/* State name */}
      <Text
        x={NODE_ACCENT_WIDTH + 8}
        y={NODE_HEADER_HEIGHT + 8}
        width={NODE_WIDTH - NODE_ACCENT_WIDTH - 16}
        text={displayName}
        fontSize={14}
        fontFamily="system-ui, -apple-system, sans-serif"
        fontStyle="600"
        fill={themeColors.nodeText}
        align="center"
      />

      {/* Feature badges row */}
      {badges.length > 0 && (
        <BadgesRow
          x={NODE_ACCENT_WIDTH + 8}
          y={NODE_HEIGHT - 28}
          badges={badges}
          sectionLabel={features.section}
          spacing={4}
        />
      )}

      {/* Connection anchors (visible in connect mode) */}
      {isConnectMode && (
        <Group>
          {/* Left anchor */}
          <Circle
            x={0}
            y={NODE_HEIGHT / 2}
            radius={6}
            fill={themeColors.anchorFill}
            stroke={themeColors.anchorStroke}
            strokeWidth={2}
            onMouseDown={(e) => {
              onBeginEdge()
              ;(e as any).cancelBubble = true
            }}
          />
          {/* Right anchor */}
          <Circle
            x={NODE_WIDTH}
            y={NODE_HEIGHT / 2}
            radius={6}
            fill={themeColors.anchorFill}
            stroke={themeColors.anchorStroke}
            strokeWidth={2}
            onMouseDown={(e) => {
              onBeginEdge()
              ;(e as any).cancelBubble = true
            }}
          />
          {/* Top anchor */}
          <Circle
            x={NODE_WIDTH / 2}
            y={0}
            radius={6}
            fill={themeColors.anchorFill}
            stroke={themeColors.anchorStroke}
            strokeWidth={2}
            onMouseDown={(e) => {
              onBeginEdge()
              ;(e as any).cancelBubble = true
            }}
          />
          {/* Bottom anchor */}
          <Circle
            x={NODE_WIDTH / 2}
            y={NODE_HEIGHT}
            radius={6}
            fill={themeColors.anchorFill}
            stroke={themeColors.anchorStroke}
            strokeWidth={2}
            onMouseDown={(e) => {
              onBeginEdge()
              ;(e as any).cancelBubble = true
            }}
          />
        </Group>
      )}

      {/* Start state arrow indicator */}
      {stateType === 'start' && (
        <Group x={-40} y={NODE_HEIGHT / 2 - 8}>
          <Rect
            width={32}
            height={16}
            fill={colors.border}
            cornerRadius={[8, 0, 0, 8]}
            opacity={0.2}
          />
          <Path
            x={8}
            y={2}
            data={ICON_PATHS.arrowRight}
            scaleX={0.5}
            scaleY={0.5}
            fill={colors.border}
          />
        </Group>
      )}
    </Group>
  )
}

// Helper to get anchor points for edge connections
export function getStateNodeAnchors(x: number, y: number): {
  left: { x: number; y: number }
  right: { x: number; y: number }
  top: { x: number; y: number }
  bottom: { x: number; y: number }
  center: { x: number; y: number }
} {
  return {
    left: { x: x, y: y + NODE_HEIGHT / 2 },
    right: { x: x + NODE_WIDTH, y: y + NODE_HEIGHT / 2 },
    top: { x: x + NODE_WIDTH / 2, y: y },
    bottom: { x: x + NODE_WIDTH / 2, y: y + NODE_HEIGHT },
    center: { x: x + NODE_WIDTH / 2, y: y + NODE_HEIGHT / 2 },
  }
}

// Helper to find best anchor points between two nodes
export function findBestAnchors(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const fromAnchors = getStateNodeAnchors(fromX, fromY)
  const toAnchors = getStateNodeAnchors(toX, toY)

  // Determine primary direction
  const dx = toX - fromX
  const dy = toY - fromY

  let fromAnchor: { x: number; y: number }
  let toAnchor: { x: number; y: number }

  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      fromAnchor = fromAnchors.right
      toAnchor = toAnchors.left
    } else {
      fromAnchor = fromAnchors.left
      toAnchor = toAnchors.right
    }
  } else {
    // Vertical connection
    if (dy > 0) {
      fromAnchor = fromAnchors.bottom
      toAnchor = toAnchors.top
    } else {
      fromAnchor = fromAnchors.top
      toAnchor = toAnchors.bottom
    }
  }

  return { from: fromAnchor, to: toAnchor }
}

export default StateNode
