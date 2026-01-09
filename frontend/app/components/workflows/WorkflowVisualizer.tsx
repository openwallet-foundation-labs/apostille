'use client'

import { useMemo } from 'react'

// Types for workflow template
interface WorkflowState {
  name: string
  type: 'start' | 'normal' | 'final'
  section?: string
}

interface WorkflowTransition {
  from: string
  to: string
  on: string
  action?: string
  guard?: string
}

interface WorkflowTemplate {
  template_id?: string
  version?: string
  title?: string
  states?: WorkflowState[]
  transitions?: WorkflowTransition[]
  sections?: Array<{ name: string }>
  display_hints?: {
    profiles?: {
      sender?: { states?: Record<string, unknown[]> }
      receiver?: { states?: Record<string, unknown[]> }
    }
  }
}

interface WorkflowVisualizerProps {
  template: WorkflowTemplate | null
  currentState?: string
  parseError?: string | null
}

// State node component
function StateNode({
  state,
  isActive,
  transitionsOut,
}: {
  state: WorkflowState
  isActive: boolean
  transitionsOut: WorkflowTransition[]
}) {
  const typeStyles = {
    start: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500',
      text: 'text-emerald-700',
      icon: '▶',
      label: 'START',
    },
    normal: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500',
      text: 'text-blue-700',
      icon: '○',
      label: '',
    },
    final: {
      bg: 'bg-purple-500/10',
      border: 'border-purple-500',
      text: 'text-purple-700',
      icon: '◉',
      label: 'FINAL',
    },
  }

  const style = typeStyles[state.type] || typeStyles.normal

  return (
    <div className="flex flex-col items-center">
      {/* State box */}
      <div
        className={`
          relative px-4 py-3 rounded-xl border-2 min-w-[140px] text-center
          transition-all duration-300
          ${style.bg} ${style.border}
          ${isActive ? 'ring-4 ring-primary-500/50 shadow-lg scale-105' : 'shadow-sm'}
        `}
      >
        {/* Type badge */}
        {style.label && (
          <div
            className={`
              absolute -top-2.5 left-1/2 -translate-x-1/2
              px-2 py-0.5 text-[10px] font-bold rounded-full
              ${style.bg} ${style.border} ${style.text} border
            `}
          >
            {style.label}
          </div>
        )}

        {/* State name */}
        <div className={`font-medium text-sm ${style.text}`}>
          <span className="mr-1.5">{style.icon}</span>
          {state.name}
        </div>

        {/* Section indicator */}
        {state.section && (
          <div className="text-[10px] text-text-tertiary mt-1">
            {state.section}
          </div>
        )}
      </div>

      {/* Outgoing transitions */}
      {transitionsOut.length > 0 && (
        <div className="flex flex-col items-center mt-2">
          {/* Arrow line */}
          <div className="w-0.5 h-6 bg-gradient-to-b from-text-tertiary/60 to-text-tertiary/30" />

          {/* Transition labels */}
          <div className="flex flex-wrap gap-1 justify-center max-w-[160px] mb-1">
            {transitionsOut.map((t, i) => (
              <div
                key={i}
                className={`
                  px-2 py-0.5 text-[10px] rounded-full
                  bg-surface-200 text-text-secondary border border-border-primary/30
                  ${t.guard ? 'border-dashed' : ''}
                `}
                title={t.guard ? `Guard: ${t.guard}` : undefined}
              >
                {t.on}
                {t.action && (
                  <span className="text-text-tertiary ml-1">→ {t.action}</span>
                )}
              </div>
            ))}
          </div>

          {/* Arrow head */}
          <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-text-tertiary/40" />
        </div>
      )}
    </div>
  )
}

export function WorkflowVisualizer({ template, currentState, parseError }: WorkflowVisualizerProps) {
  // Build a map of transitions by source state
  const transitionMap = useMemo(() => {
    if (!template?.transitions) return new Map<string, WorkflowTransition[]>()

    const map = new Map<string, WorkflowTransition[]>()
    for (const t of template.transitions) {
      const existing = map.get(t.from) || []
      existing.push(t)
      map.set(t.from, existing)
    }
    return map
  }, [template?.transitions])

  // Order states: start first, then normal, then final
  const orderedStates = useMemo(() => {
    if (!template?.states) return []

    const starts = template.states.filter(s => s.type === 'start')
    const normals = template.states.filter(s => s.type === 'normal')
    const finals = template.states.filter(s => s.type === 'final')

    return [...starts, ...normals, ...finals]
  }, [template?.states])

  // Error state
  if (parseError) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-error-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-error-600 text-xl">!</span>
          </div>
          <div className="text-error-600 font-medium mb-1">Invalid JSON</div>
          <div className="text-text-tertiary text-sm max-w-[200px]">{parseError}</div>
        </div>
      </div>
    )
  }

  // Empty state
  if (!template || !template.states || template.states.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="text-center text-text-tertiary">
          <div className="w-12 h-12 rounded-full bg-surface-200 flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">⬡</span>
          </div>
          <div className="font-medium mb-1">No Workflow</div>
          <div className="text-sm">Edit the JSON to see the flow</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border-primary/30">
        <div>
          <h3 className="font-semibold text-text-primary">
            {template.title || template.template_id || 'Workflow'}
          </h3>
          {template.version && (
            <div className="text-xs text-text-tertiary">v{template.version}</div>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Start
          </div>
          <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
            <span className="w-2 h-2 rounded-full bg-blue-500" /> Normal
          </div>
          <div className="flex items-center gap-1 text-[10px] text-text-tertiary">
            <span className="w-2 h-2 rounded-full bg-purple-500" /> Final
          </div>
        </div>
      </div>

      {/* Flow visualization */}
      <div className="flex-1 overflow-auto">
        <div className="flex flex-col items-center gap-1 py-4">
          {orderedStates.map((state, index) => {
            const isLast = index === orderedStates.length - 1
            const transitionsOut = transitionMap.get(state.name) || []

            // Filter transitions that go to the next sequential state (for cleaner arrows)
            const relevantTransitions = isLast ? [] : transitionsOut

            return (
              <StateNode
                key={state.name}
                state={state}
                isActive={currentState === state.name}
                transitionsOut={relevantTransitions}
              />
            )
          })}
        </div>
      </div>

      {/* Stats footer */}
      <div className="mt-4 pt-3 border-t border-border-primary/30 flex justify-between text-xs text-text-tertiary">
        <span>{template.states.length} states</span>
        <span>{template.transitions?.length || 0} transitions</span>
      </div>
    </div>
  )
}

export default WorkflowVisualizer
