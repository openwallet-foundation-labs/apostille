'use client'

import { useState } from 'react'

interface WorkflowTemplate {
  template_id: string
  version: string
  title: string
  states?: Array<{ name: string; type: 'start' | 'normal' | 'final' }>
  sections?: Array<{ name: string }>
}

interface QuickStartCardsProps {
  templates: WorkflowTemplate[]
  onStart: (template: WorkflowTemplate) => void
  onCustomize: (template: WorkflowTemplate) => void
  onCreateCustom: () => void
  disabled?: boolean
  startingTemplateId?: string | null
}

function TemplateCard({
  template,
  onStart,
  onCustomize,
  disabled,
  isStarting,
}: {
  template: WorkflowTemplate
  onStart: () => void
  onCustomize: () => void
  disabled: boolean
  isStarting: boolean
}) {
  const states = template.states || []
  const stateCount = states.length
  const sections = template.sections || []

  // Get color for state type
  const getStateColor = (type: string) => {
    switch (type) {
      case 'start':
        return 'bg-emerald-500'
      case 'final':
        return 'bg-purple-500'
      default:
        return 'bg-blue-500'
    }
  }

  // Get icon for template type
  const getTemplateIcon = (templateId: string) => {
    if (templateId.includes('application') || templateId.includes('approval')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
    if (templateId.includes('kyc') || templateId.includes('multi-step')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      )
    }
    if (templateId.includes('proof')) {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    }
    // Auto-issue / default
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  }

  return (
    <div className="bg-surface-100 border border-border-primary/30 rounded-xl p-4 hover:shadow-lg hover:border-primary-500/50 transition-all duration-200 group flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
            {getTemplateIcon(template.template_id)}
          </div>
          <div>
            <h3 className="font-semibold text-text-primary text-sm leading-tight">
              {template.title}
            </h3>
            <span className="text-xs text-text-tertiary">v{template.version}</span>
          </div>
        </div>
      </div>

      {/* Mini state diagram */}
      <div className="flex items-center gap-1 mb-3 py-2 overflow-x-auto">
        {states.slice(0, 5).map((state, i) => (
          <div key={state.name} className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full ${getStateColor(state.type)} flex-shrink-0`}
              title={state.name}
            />
            {i < Math.min(states.length - 1, 4) && (
              <div className="w-3 h-0.5 bg-border-primary mx-0.5 flex-shrink-0" />
            )}
          </div>
        ))}
        {stateCount > 5 && (
          <span className="text-xs text-text-tertiary ml-1 flex-shrink-0">+{stateCount - 5}</span>
        )}
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-4 text-xs text-text-tertiary">
        <span>{stateCount} states</span>
        {sections.length > 0 && <span>{sections.length} sections</span>}
      </div>

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        <button
          onClick={onStart}
          disabled={disabled || isStarting}
          className="btn btn-primary flex-1 text-sm py-2 disabled:opacity-50"
        >
          {isStarting ? (
            <>
              <span className="spinner h-3 w-3 mr-2" />
              Starting...
            </>
          ) : (
            'Start'
          )}
        </button>
        <button
          onClick={onCustomize}
          className="btn btn-secondary text-sm py-2 px-3"
          title="Edit template"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export function QuickStartCards({
  templates,
  onStart,
  onCustomize,
  onCreateCustom,
  disabled = false,
  startingTemplateId = null,
}: QuickStartCardsProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="bg-gradient-to-br from-primary-50/50 to-surface-100 border border-primary-200/30 rounded-2xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-primary-50/30 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-600 text-white flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Quick Start</h2>
            <p className="text-xs text-text-tertiary">Select a template and start a workflow</p>
          </div>
        </div>
        <button className="text-text-tertiary hover:text-text-primary p-1">
          <svg
            className={`w-5 h-5 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="px-5 pb-5">
          {/* Template Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {templates.map((template) => (
              <TemplateCard
                key={template.template_id}
                template={template}
                onStart={() => onStart(template)}
                onCustomize={() => onCustomize(template)}
                disabled={disabled}
                isStarting={startingTemplateId === template.template_id}
              />
            ))}
          </div>

          {/* Create Custom Button */}
          <button
            onClick={onCreateCustom}
            className="w-full py-3 border-2 border-dashed border-border-primary/50 rounded-xl text-text-tertiary hover:text-primary-600 hover:border-primary-500/50 transition-colors flex items-center justify-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Custom Template
          </button>
        </div>
      )}
    </div>
  )
}
