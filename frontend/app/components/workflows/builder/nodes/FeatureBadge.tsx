/**
 * FeatureBadge - Small icon badges for state feature indicators
 * Used in the footer row of StateNode cards
 */

'use client'

import { Group, Rect, Path, Text } from 'react-konva'
import { ICON_PATHS, getScaledIconProps } from '../icons'
import { useBadgeColors } from '../useThemeColors'

export type BadgeType = 'section' | 'form' | 'credential' | 'proof' | 'guard' | 'action'

interface FeatureBadgeProps {
  type: BadgeType
  x: number
  y: number
  label?: string  // For section badge
  size?: number   // Badge size (default 20)
}

// Legacy export for backwards compatibility - use useBadgeColors() instead
const BADGE_COLORS: Record<BadgeType, { bg: string; icon: string }> = {
  section: { bg: '#4338ca40', icon: '#a5b4fc' },   // indigo
  form: { bg: '#0891b240', icon: '#67e8f9' },      // cyan
  credential: { bg: '#16a34a40', icon: '#86efac' }, // green
  proof: { bg: '#2563eb40', icon: '#93c5fd' },     // blue
  guard: { bg: '#d9770640', icon: '#fcd34d' },     // amber
  action: { bg: '#7c3aed40', icon: '#c4b5fd' },    // violet
}

// Icon mapping for each badge type
const BADGE_ICONS: Record<BadgeType, keyof typeof ICON_PATHS> = {
  section: 'section',
  form: 'form',
  credential: 'credential',
  proof: 'shield',
  guard: 'lock',
  action: 'bolt',
}

// Tooltip labels
const BADGE_TOOLTIPS: Record<BadgeType, string> = {
  section: 'Section',
  form: 'Has Form',
  credential: 'Credential Action',
  proof: 'Proof Request',
  guard: 'Guarded Transition',
  action: 'Has Action',
}

export function FeatureBadge({ type, x, y, label, size = 20 }: FeatureBadgeProps) {
  const badgeColors = useBadgeColors()
  const colors = badgeColors[type] || BADGE_COLORS[type]
  const iconKey = BADGE_ICONS[type]
  const iconProps = getScaledIconProps(iconKey, size * 0.6)

  // Calculate width based on whether we have a label
  const hasLabel = type === 'section' && label
  const width = hasLabel ? Math.max(size, label.length * 6 + size) : size
  const iconOffset = (size - (size * 0.6)) / 2

  return (
    <Group x={x} y={y}>
      {/* Background */}
      <Rect
        width={width}
        height={size}
        fill={colors.bg}
        cornerRadius={4}
      />

      {/* Icon */}
      <Path
        x={iconOffset}
        y={iconOffset}
        data={iconProps.data}
        scaleX={iconProps.scaleX}
        scaleY={iconProps.scaleY}
        fill={colors.icon}
      />

      {/* Label (for section badge) */}
      {hasLabel && (
        <Text
          x={size - 2}
          y={(size - 10) / 2}
          text={label}
          fontSize={10}
          fontFamily="system-ui, -apple-system, sans-serif"
          fill={colors.icon}
        />
      )}
    </Group>
  )
}

// Helper to calculate total width of badges row
export function calculateBadgesWidth(badges: BadgeType[], sectionLabel?: string): number {
  const GAP = 4
  let width = 0

  for (const badge of badges) {
    if (badge === 'section' && sectionLabel) {
      width += Math.max(20, sectionLabel.length * 6 + 20)
    } else {
      width += 20
    }
    width += GAP
  }

  return width > 0 ? width - GAP : 0 // Remove last gap
}

// Component to render a row of badges
interface BadgesRowProps {
  x: number
  y: number
  badges: BadgeType[]
  sectionLabel?: string
  spacing?: number
}

export function BadgesRow({ x, y, badges, sectionLabel, spacing = 4 }: BadgesRowProps) {
  let currentX = x

  return (
    <Group>
      {badges.map((type, index) => {
        const label = type === 'section' ? sectionLabel : undefined
        const badgeWidth = type === 'section' && sectionLabel
          ? Math.max(20, sectionLabel.length * 6 + 20)
          : 20

        const badge = (
          <FeatureBadge
            key={`${type}-${index}`}
            type={type}
            x={currentX}
            y={y}
            label={label}
          />
        )

        currentX += badgeWidth + spacing

        return badge
      })}
    </Group>
  )
}

export default FeatureBadge
