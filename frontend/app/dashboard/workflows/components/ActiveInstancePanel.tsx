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
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh })

  useEffect(() => {
    if (!instanceId || !autoRefresh) return
    const interval = setInterval(() => { void onRefreshRef.current() }, 3000)
    return () => clearInterval(interval)
  }, [instanceId, autoRefresh])

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

  const state = instanceStatus?.state || 'Loading...'
  const templateId = instanceStatus?.template_id || template?.template_id || 'Unknown'
  const templateTitle = template?.title || templateId

  // Extract allowed events from status
  const allowedEvents: Array<{ event: string; label: string; target?: string }> = []
  if (instanceStatus?.allowed_events) {
    for (const evt of instanceStatus.allowed_events) {
      const transition = template?.transitions?.find((t: any) => t.from === state && t.on === evt)
      allowedEvents.push({
        event: evt,
        label: evt.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        target: transition ? `→ ${transition.to}${transition.action ? ` · ${transition.action}` : ''}` : undefined,
      })
    }
  }

  // State counts
  const totalStates = template?.states?.length || 0
  const doneStates = template?.states?.filter((s: any) => {
    // Find states before current in the linear flow
    const idx = template.states.findIndex((st: any) => st.name === state)
    const sIdx = template.states.findIndex((st: any) => st.name === s.name)
    return sIdx < idx
  }).length || 0

  const getActionStyle = (event: string) => {
    if (event === 'approve' || event === 'confirm' || event === 'accept' || event === 'submit' || event === 'next' || event === 'propose')
      return 'primary'
    if (event === 'reject' || event === 'decline' || event === 'cancel')
      return 'danger'
    return 'default'
  }

  const getActionIcon = (event: string) => {
    if (event === 'approve' || event === 'accept' || event === 'confirm')
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    if (event === 'reject' || event === 'decline' || event === 'cancel')
      return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
    return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {/* Header */}
      <div className="card-header">
        <div>
          <div className="card-title">Active Instance · {templateTitle}</div>
          <div className="card-sub">{instanceStatus?.template_version || template?.version || ''} · with <b>{connectionLabel || 'Connection'}</b></div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-colors ${
              autoRefresh ? 'badge green' : 'badge badge-gray'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-pulse' : 'bg-surface-400'}`} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button onClick={() => { void onRefresh() }} disabled={loading} className="text-text-tertiary hover:text-text-primary p-1" title="Refresh">
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Split pane */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]" style={{ borderTop: '1px solid var(--border, #eee)' }}>
        {/* Left pane: Current state + Actions + Meta */}
        <div className="p-5 flex flex-col gap-5" style={{ borderRight: '1px solid var(--border, #eee)' }}>
          {/* Current state */}
          <div className="p-4 rounded-xl" style={{ background: 'var(--bg-sunk, #f5f4f1)', border: '1px solid var(--border, #eee)' }}>
            <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--ink-4, #8b8b92)' }}>Current State</div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-3 h-3 rounded-full" style={{ background: 'var(--accent, #5b6abf)', boxShadow: '0 0 0 3px var(--accent-soft, rgba(91,106,191,0.2))' }} />
              <span className="text-lg font-semibold" style={{ color: 'var(--ink, #0a0a0b)', fontFamily: 'var(--font-mono, monospace)' }}>{state}</span>
            </div>
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-3, #5c5c63)' }}>
              {state === 'pending_review' && 'Review the submitted application and decide whether to issue the credential or reject the request.'}
              {state === 'apply' && 'Waiting for the holder to submit their application data.'}
              {state === 'issuing' && 'Credential issuance in progress via DIDComm.'}
              {state === 'done' && 'Workflow completed successfully.'}
              {state === 'rejected' && 'Application was rejected.'}
              {!['pending_review', 'apply', 'issuing', 'done', 'rejected'].includes(state) && `The workflow is currently in the "${state}" state.`}
            </p>
          </div>

          {/* Available actions */}
          {allowedEvents.length > 0 ? (
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--ink-4, #8b8b92)' }}>Available Actions</div>
              <div className="flex flex-col gap-2">
                {allowedEvents.map(evt => {
                  const style = getActionStyle(evt.event)
                  return (
                    <button
                      key={evt.event}
                      onClick={() => onAdvance(evt.event)}
                      className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:-translate-y-px"
                      style={{
                        background: style === 'primary' ? 'var(--green-soft, #f0fdf4)' : style === 'danger' ? 'var(--bg-sunk, #f5f4f1)' : 'var(--bg-sunk, #f5f4f1)',
                        borderColor: style === 'primary' ? 'var(--green-border, #86efac)' : 'var(--border, #eee)',
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{
                        background: style === 'primary' ? 'var(--green, #22c55e)' : style === 'danger' ? 'var(--red-soft, #fef2f2)' : 'var(--accent-soft, #eff0ff)',
                        color: style === 'primary' ? 'white' : style === 'danger' ? 'var(--red-ink, #b91c1c)' : 'var(--accent-ink, #3730a3)',
                      }}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">{getActionIcon(evt.event)}</svg>
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-[13px] font-semibold" style={{ color: style === 'primary' ? 'var(--green-ink, #166534)' : 'var(--ink, #0a0a0b)' }}>{evt.label}</div>
                        {evt.target && <div className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--ink-4, #8b8b92)' }}>{evt.target}</div>}
                      </div>
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--ink-4, #8b8b92)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            /* Fallback: use the library WorkflowInstancePanel for form-based actions */
            instanceStatus && (
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--ink-4, #8b8b92)' }}>Actions</div>
                <WorkflowInstancePanel status={instanceStatus} onAdvance={onAdvance} />
              </div>
            )
          )}

          {/* Instance metadata */}
          <div className="grid grid-cols-2 gap-3 pt-3" style={{ borderTop: '1px solid var(--border, #eee)' }}>
            {[
              { label: 'Started', value: instanceStatus?.createdAt ? new Date(instanceStatus.createdAt).toLocaleString() : '—' },
              { label: 'Counterparty', value: connectionLabel || '—' },
              { label: 'Instance ID', value: instanceId.slice(0, 12) + '…', mono: true },
              { label: 'Step', value: `${doneStates + 1} of ${totalStates}` },
            ].map((m, i) => (
              <div key={i}>
                <div className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-4, #8b8b92)' }}>{m.label}</div>
                <div className={`text-[12.5px] mt-0.5 ${m.mono ? 'font-mono' : ''}`} style={{ color: 'var(--ink-2, #2a2a2e)' }}>{m.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right pane: State Diagram */}
        <div className="p-5" style={{ background: 'var(--bg-sunk, #f5f4f1)' }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[13px] font-semibold" style={{ color: 'var(--ink, #0a0a0b)' }}>State Diagram</div>
              <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--ink-4, #8b8b92)' }}>{totalStates} states · {template?.transitions?.length || 0} transitions</div>
            </div>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--ink-3, #5c5c63)' }}>
              <span className="flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--green, #22c55e)' }} />Start</span>
              <span className="flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--accent, #5b6abf)' }} />Active</span>
              <span className="flex items-center gap-1.5"><span className="w-[7px] h-[7px] rounded-full" style={{ background: 'var(--violet, #8b5cf6)' }} />Final</span>
            </div>
          </div>
          <div className="rounded-lg p-4 min-h-[300px]" style={{ background: 'var(--bg-elev, white)', border: '1px solid var(--border, #eee)' }}>
            {template ? (
              <WorkflowVisualizer template={template} currentState={instanceStatus?.state} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: 'var(--ink-4, #8b8b92)' }}>No template loaded</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Context data footer */}
      {instanceStatus?.context && Object.keys(instanceStatus.context).length > 0 && (
        <details className="border-t" style={{ borderColor: 'var(--border, #eee)' }}>
          <summary className="px-5 py-3 text-sm cursor-pointer hover:bg-surface-50" style={{ color: 'var(--ink-3, #5c5c63)' }}>
            Context Data ({Object.keys(instanceStatus.context).length} fields)
          </summary>
          <div className="px-5 pb-4">
            <pre className="text-xs rounded-lg p-3 overflow-x-auto" style={{ background: 'var(--bg-sunk, #f5f4f1)', color: 'var(--ink-2, #2a2a2e)' }}>
              {JSON.stringify(instanceStatus.context, null, 2)}
            </pre>
          </div>
        </details>
      )}
    </div>
  )
}
