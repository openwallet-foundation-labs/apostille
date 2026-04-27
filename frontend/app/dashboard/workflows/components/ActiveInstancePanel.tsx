'use client'

import { useEffect, useRef, useState } from 'react'
import { WorkflowInstancePanel } from '@ajna-inc/workflow-react'
import { WorkflowVisualizer } from '@/app/components/workflows/WorkflowVisualizer'

interface ActiveInstancePanelProps {
  instanceId: string | null
  instanceStatus: any
  template: any
  connectionLabel?: string
  onClose: () => void
  onAdvance: (event: string, input?: any) => Promise<void>
  onRefresh: () => Promise<void>
  loading?: boolean
}

export function ActiveInstancePanel({
  instanceId,
  instanceStatus,
  template,
  connectionLabel,
  onClose,
  onAdvance,
  onRefresh,
  loading = false,
}: ActiveInstancePanelProps) {
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Keep a stable ref to onRefresh so the interval never restarts due to prop reference changes
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  // Auto-refresh every 3 seconds when enabled
  useEffect(() => {
    if (!instanceId || !autoRefresh) return

    const interval = setInterval(() => {
      void onRefreshRef.current()
    }, 3000)

    return () => clearInterval(interval)
  }, [instanceId, autoRefresh])

  // Empty state
  if (!instanceId) {
    return (
      <div className="empty">
        <div className="empty-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="22" height="22">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="empty-title">No Active Instance</div>
        <div className="empty-desc">Start a workflow from Quick Start above, or open an existing instance from the list below.</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div className="card-header">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-text-primary">Active Instance</h2>

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full transition-colors ${
                autoRefresh
                  ? 'badge green'
                  : 'badge badge-gray'
              }`}
              title={autoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-surface-400'}`} />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>

            <button
              onClick={() => { void onRefresh() }}
              disabled={loading}
              className="text-text-tertiary hover:text-text-primary p-1"
              title="Refresh now"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary p-1"
          title="Close instance"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Instance Info Bar */}
      <div className="px-5 py-3 bg-surface-50/50 border-b border-border-primary/20 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-text-tertiary">Instance:</span>
          <code className="text-xs bg-surface-200 px-2 py-0.5 rounded font-mono">
            {instanceId.slice(0, 12)}...
          </code>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-text-tertiary">Template:</span>
          <span className="font-medium text-text-primary">
            {instanceStatus?.template_id || template?.template_id || 'Unknown'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-text-tertiary">State:</span>
          <span className="badge badge-primary">
            {instanceStatus?.state || 'Loading...'}
          </span>
        </div>

        {connectionLabel && (
          <div className="flex items-center gap-2">
            <span className="text-text-tertiary">Connection:</span>
            <span className="font-medium text-text-primary">{connectionLabel}</span>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto text-xs text-text-tertiary">
          <span>Role:</span>
          <span className="badge badge-gray">
            {instanceStatus?.ui_profile || 'auto'}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Actions Panel */}
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Actions</h3>
            {instanceStatus ? (
              <WorkflowInstancePanel
                status={instanceStatus}
                onAdvance={onAdvance}
              />
            ) : (
              <div className="bg-surface-200 rounded-lg p-6 text-center">
                <span className="spinner h-6 w-6 mx-auto" />
                <p className="text-sm text-text-tertiary mt-2">Loading status...</p>
              </div>
            )}
          </div>

          {/* Right: Visual Flow */}
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Workflow Progress</h3>
            <div className="bg-surface-50 border border-border-primary/30 rounded-lg p-4 min-h-[300px]">
              {template ? (
                <WorkflowVisualizer
                  template={template}
                  currentState={instanceStatus?.state}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-text-tertiary">No template loaded</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer with context info */}
      {instanceStatus?.context && Object.keys(instanceStatus.context).length > 0 && (
        <details className="border-t border-border-primary/30">
          <summary className="px-5 py-3 text-sm text-text-tertiary cursor-pointer hover:bg-surface-50">
            Context Data ({Object.keys(instanceStatus.context).length} fields)
          </summary>
          <div className="px-5 pb-4">
            <pre className="text-xs bg-surface-200 rounded-lg p-3 overflow-x-auto">
              {JSON.stringify(instanceStatus.context, null, 2)}
            </pre>
          </div>
        </details>
      )}
    </div>
  )
}
