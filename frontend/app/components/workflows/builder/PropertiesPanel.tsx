'use client'

import { useState } from 'react'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { ACTION_TYPE_LABELS, STATE_TYPE_COLORS } from '@/lib/workflow-builder/constants'
import type { StateType } from '@/lib/workflow-builder/types'

export function PropertiesPanel() {
  const {
    selection,
    nodes,
    edges,
    template,
    updateState,
    updateTransition,
    propertiesPanelOpen,
    setPropertiesPanelOpen,
  } = useBuilderStore()

  // Get selected state
  const selectedStateName = selection.nodes.length === 1 ? selection.nodes[0] : null
  const selectedState = selectedStateName
    ? template.states.find((s) => s.name === selectedStateName)
    : null

  // Get selected transition
  const selectedEdgeId = selection.edges.length === 1 ? selection.edges[0] : null
  const selectedEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : null
  const selectedTransition = selectedEdge
    ? template.transitions.find(
        (t) => t.from === selectedEdge.from && t.to === selectedEdge.to && t.on === selectedEdge.data.on
      )
    : null

  if (!propertiesPanelOpen) {
    return (
      <button
        onClick={() => setPropertiesPanelOpen(true)}
        className="absolute right-2 top-2 z-10 bg-surface-100 dark:bg-surface-800 text-text-secondary hover:text-text-primary px-2 py-1 rounded text-xs border border-border-secondary"
      >
        Properties
      </button>
    )
  }

  return (
    <div className="w-72 bg-surface-50 dark:bg-surface-900 border-l border-border-secondary overflow-y-auto">
      <div className="flex items-center justify-between p-3 border-b border-border-secondary">
        <h2 className="text-sm font-semibold text-text-secondary">Properties</h2>
        <button
          onClick={() => setPropertiesPanelOpen(false)}
          className="text-text-tertiary hover:text-text-secondary"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!selectedState && !selectedTransition && (
        <div className="p-4 text-sm text-text-tertiary">
          Select a state or transition to view its properties
        </div>
      )}

      {selectedState && <StatePropertiesEditor state={selectedState} onUpdate={updateState} />}

      {selectedTransition && (
        <TransitionPropertiesEditor
          transition={selectedTransition}
          edgeId={selectedEdgeId!}
          onUpdate={updateTransition}
        />
      )}
    </div>
  )
}

interface StatePropertiesEditorProps {
  state: { name: string; type: StateType; section?: string }
  onUpdate: (name: string, updates: Partial<{ name: string; type: StateType; section?: string }>) => void
}

function StatePropertiesEditor({ state, onUpdate }: StatePropertiesEditorProps) {
  const { template } = useBuilderStore()
  const [localName, setLocalName] = useState(state.name)

  const handleNameBlur = () => {
    if (localName !== state.name && localName.trim()) {
      onUpdate(state.name, { name: localName.trim() })
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border-secondary">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: STATE_TYPE_COLORS[state.type] }}
        />
        <span className="text-sm font-medium text-text-secondary">State</span>
      </div>

      <div>
        <label className="block text-xs text-text-tertiary mb-1">Name</label>
        <input
          type="text"
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleNameBlur()}
          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-xs text-text-tertiary mb-1">Type</label>
        <select
          value={state.type}
          onChange={(e) => onUpdate(state.name, { type: e.target.value as StateType })}
          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500"
        >
          <option value="start">Start</option>
          <option value="normal">Normal</option>
          <option value="final">Final</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-text-tertiary mb-1">Section</label>
        <select
          value={state.section || ''}
          onChange={(e) => onUpdate(state.name, { section: e.target.value || undefined })}
          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500"
        >
          <option value="">None</option>
          {template.sections?.map((sec) => (
            <option key={sec.name} value={sec.name}>
              {sec.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

interface TransitionPropertiesEditorProps {
  transition: { from: string; to: string; on: string; guard?: string; action?: string }
  edgeId: string
  onUpdate: (id: string, updates: Partial<{ on: string; guard?: string; action?: string }>) => void
}

function TransitionPropertiesEditor({ transition, edgeId, onUpdate }: TransitionPropertiesEditorProps) {
  const { template } = useBuilderStore()
  const [localEvent, setLocalEvent] = useState(transition.on)
  const [localGuard, setLocalGuard] = useState(transition.guard || '')

  const handleEventBlur = () => {
    if (localEvent !== transition.on && localEvent.trim()) {
      onUpdate(edgeId, { on: localEvent.trim() })
    }
  }

  const handleGuardBlur = () => {
    if (localGuard !== (transition.guard || '')) {
      onUpdate(edgeId, { guard: localGuard || undefined })
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border-secondary">
        <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
        <span className="text-sm font-medium text-text-secondary">Transition</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-surface-100 dark:bg-surface-800 rounded px-2 py-1.5">
          <span className="text-text-tertiary">From:</span>{' '}
          <span className="text-text-secondary">{transition.from}</span>
        </div>
        <div className="bg-surface-100 dark:bg-surface-800 rounded px-2 py-1.5">
          <span className="text-text-tertiary">To:</span>{' '}
          <span className="text-text-secondary">{transition.to}</span>
        </div>
      </div>

      <div>
        <label className="block text-xs text-text-tertiary mb-1">Event</label>
        <input
          type="text"
          value={localEvent}
          onChange={(e) => setLocalEvent(e.target.value)}
          onBlur={handleEventBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleEventBlur()}
          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500"
        />
      </div>

      <div>
        <label className="block text-xs text-text-tertiary mb-1">
          Guard <span className="text-text-tertiary/60">(JMESPath expression)</span>
        </label>
        <input
          type="text"
          value={localGuard}
          onChange={(e) => setLocalGuard(e.target.value)}
          onBlur={handleGuardBlur}
          placeholder="e.g., context.ready == `true`"
          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500 placeholder:text-text-tertiary"
        />
      </div>

      <div>
        <label className="block text-xs text-text-tertiary mb-1">Action</label>
        <select
          value={transition.action || ''}
          onChange={(e) => onUpdate(edgeId, { action: e.target.value || undefined })}
          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary-500"
        >
          <option value="">None</option>
          {template.actions.map((action) => (
            <option key={action.key} value={action.key}>
              {action.key} ({ACTION_TYPE_LABELS[action.typeURI as keyof typeof ACTION_TYPE_LABELS] || 'Action'})
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-tertiary">
          Define actions in the Actions tab
        </p>
      </div>
    </div>
  )
}
