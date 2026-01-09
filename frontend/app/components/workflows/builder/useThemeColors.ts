/**
 * useThemeColors - Theme-aware color hook for workflow builder
 * Provides colors for canvas components based on current theme
 */

'use client'

import { useTheme } from '@/app/components/ThemeProvider'
import type { StateType } from '@/lib/workflow-builder/types'

// State node colors per theme
export interface StateNodeColors {
  border: string
  headerBg: string
  headerText: string
  label: string
}

// Edge colors per theme
export interface EdgeColors {
  normal: string
  guarded: string
  action: string
  selected: string
  labelBg: string
  labelText: string
}

// Badge colors per theme
export interface BadgeColors {
  bg: string
  icon: string
}

// Canvas colors per theme
export interface CanvasColors {
  background: string
  gridLine: string
  gridOpacity: number
}

// Common colors (theme-independent)
export interface CommonColors {
  delete: string
  deleteText: string
  preview: string
}

// Full theme colors object
export interface ThemeColors {
  stateNodes: Record<StateType, StateNodeColors>
  edges: EdgeColors
  badges: Record<string, BadgeColors>
  canvas: CanvasColors
  common: CommonColors
  // Node styling
  nodeBg: string
  nodeBorder: string
  nodeText: string
  nodeShadow: string
  // Anchor styling
  anchorFill: string
  anchorStroke: string
}

// Dark theme colors (original design)
const darkThemeColors: ThemeColors = {
  stateNodes: {
    start: {
      border: '#22c55e',      // green-500
      headerBg: '#14532d',    // green-900
      headerText: '#86efac',  // green-300
      label: 'START',
    },
    normal: {
      border: '#3b82f6',      // blue-500
      headerBg: '#1e3a8a',    // blue-900
      headerText: '#93c5fd',  // blue-300
      label: 'STATE',
    },
    final: {
      border: '#a855f7',      // purple-500
      headerBg: '#581c87',    // purple-900
      headerText: '#d8b4fe',  // purple-300
      label: 'FINAL',
    },
  },
  edges: {
    normal: '#64748b',        // slate-500
    guarded: '#f59e0b',       // amber-500
    action: '#22c55e',        // green-500
    selected: '#a78bfa',      // violet-400
    labelBg: '#1e293b',       // slate-800
    labelText: '#e2e8f0',     // slate-200
  },
  badges: {
    section: { bg: '#4338ca40', icon: '#a5b4fc' },   // indigo
    form: { bg: '#0891b240', icon: '#67e8f9' },      // cyan
    credential: { bg: '#16a34a40', icon: '#86efac' }, // green
    proof: { bg: '#2563eb40', icon: '#93c5fd' },     // blue
    guard: { bg: '#d9770640', icon: '#fcd34d' },     // amber
    action: { bg: '#7c3aed40', icon: '#c4b5fd' },    // violet
  },
  canvas: {
    background: '#030712',    // gray-950
    gridLine: '#1e293b',      // slate-800
    gridOpacity: 0.5,
  },
  common: {
    delete: '#ef4444',        // red-500
    deleteText: '#ffffff',
    preview: '#94a3b8',       // slate-400
  },
  nodeBg: '#0f172a',          // slate-900
  nodeBorder: '#334155',      // slate-700
  nodeText: '#e2e8f0',        // slate-200
  nodeShadow: '#000000',
  anchorFill: '#1e293b',      // slate-800
  anchorStroke: '#64748b',    // slate-500
}

// Light theme colors
const lightThemeColors: ThemeColors = {
  stateNodes: {
    start: {
      border: '#16a34a',      // green-600
      headerBg: '#dcfce7',    // green-100
      headerText: '#166534',  // green-800
      label: 'START',
    },
    normal: {
      border: '#2563eb',      // blue-600
      headerBg: '#dbeafe',    // blue-100
      headerText: '#1e40af',  // blue-800
      label: 'STATE',
    },
    final: {
      border: '#9333ea',      // purple-600
      headerBg: '#f3e8ff',    // purple-100
      headerText: '#6b21a8',  // purple-800
      label: 'FINAL',
    },
  },
  edges: {
    normal: '#64748b',        // slate-500
    guarded: '#d97706',       // amber-600
    action: '#16a34a',        // green-600
    selected: '#8b5cf6',      // violet-500
    labelBg: '#f8fafc',       // slate-50
    labelText: '#1e293b',     // slate-800
  },
  badges: {
    section: { bg: '#e0e7ff', icon: '#4338ca' },     // indigo light
    form: { bg: '#cffafe', icon: '#0891b2' },        // cyan light
    credential: { bg: '#dcfce7', icon: '#16a34a' },  // green light
    proof: { bg: '#dbeafe', icon: '#2563eb' },       // blue light
    guard: { bg: '#fef3c7', icon: '#d97706' },       // amber light
    action: { bg: '#ede9fe', icon: '#7c3aed' },      // violet light
  },
  canvas: {
    background: '#f8fafc',    // slate-50
    gridLine: '#e2e8f0',      // slate-200
    gridOpacity: 0.8,
  },
  common: {
    delete: '#ef4444',        // red-500
    deleteText: '#ffffff',
    preview: '#94a3b8',       // slate-400
  },
  nodeBg: '#ffffff',          // white
  nodeBorder: '#e2e8f0',      // slate-200
  nodeText: '#1e293b',        // slate-800
  nodeShadow: '#64748b',      // slate-500
  anchorFill: '#f1f5f9',      // slate-100
  anchorStroke: '#94a3b8',    // slate-400
}

/**
 * Hook to get theme-aware colors for workflow builder canvas components
 */
export function useThemeColors(): ThemeColors {
  const { actualTheme } = useTheme()
  return actualTheme === 'dark' ? darkThemeColors : lightThemeColors
}

/**
 * Get state node colors for the current theme
 */
export function useStateNodeColors(): Record<StateType, StateNodeColors> {
  const colors = useThemeColors()
  return colors.stateNodes
}

/**
 * Get edge colors for the current theme
 */
export function useEdgeColors(): EdgeColors {
  const colors = useThemeColors()
  return colors.edges
}

/**
 * Get badge colors for the current theme
 */
export function useBadgeColors(): Record<string, BadgeColors> {
  const colors = useThemeColors()
  return colors.badges
}

export default useThemeColors
