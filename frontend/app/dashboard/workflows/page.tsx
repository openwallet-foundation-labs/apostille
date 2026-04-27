'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { workflowApi, connectionApi, credentialDefinitionApi } from '@/lib/api'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../../components/ui/Icons'
import { runtimeConfig } from '@/lib/runtimeConfig'
import {
  WorkflowProvider,
  UiProfileProvider,
  useWorkflowStatus,
} from '@ajna-inc/workflow-react'
import dynamic from 'next/dynamic'

// Import new components
import {
  ConnectionContextBar,
  QuickStartCards,
  ActiveInstancePanel,
  TemplatesTable,
  InstancesTable,
} from './components'

// Dynamically import the WorkflowBuilder to avoid SSR issues with Konva
const WorkflowBuilder = dynamic(
  () => import('@/app/components/workflows/builder/WorkflowBuilder').then((mod) => mod.WorkflowBuilder),
  { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center text-text-tertiary">Loading Visual Builder...</div> }
)

import { PRESET_TEMPLATES, applicationApprovalTemplate } from './presetTemplates'

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function WorkflowsPage() {
  const { token } = useAuth()
  const baseUrl = runtimeConfig.API_URL
  return (
    <WorkflowProvider baseUrl={baseUrl} token={token || undefined}>
      <UiProfileProvider initial={undefined}>
        <WorkflowsContent />
      </UiProfileProvider>
    </WorkflowProvider>
  )
}

// ============================================================================
// WORKFLOWS CONTENT
// ============================================================================

interface TemplateListItem {
  id: string
  template_id: string
  version: string
  title: string
  createdAt: string
  hash?: string
}

const WORKFLOW_CONNECTION_STORAGE_KEY = 'workflows.selectedConnectionId'

interface Instance {
  id: string
  instance_id: string
  template_id: string
  template_version?: string
  connection_id?: string
  state: string
  section?: string
  status: string
  createdAt: string
  updatedAt?: string
}

function WorkflowsContent() {
  const { isAuthenticated } = useAuth()

  // Connection state
  const [connections, setConnections] = useState<{ id: string; theirLabel?: string; state?: string; theirDid?: string }[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')
  const [discovering, setDiscovering] = useState(false)

  // Templates state
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Instances state
  const [instances, setInstances] = useState<Instance[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)

  // Active instance state
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null)

  // Builder state
  const [showBuilder, setShowBuilder] = useState(false)
  const [templateJson, setTemplateJson] = useState(() => JSON.stringify(applicationApprovalTemplate, null, 2))

  // Error/success state
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const validateTemplateCredDefs = useCallback(async (template: any): Promise<string | null> => {
    const profileCredDefIds: Array<{ profileId: string; credDefId: string }> = []

    const credentialProfiles = template?.catalog?.credential_profiles || {}
    Object.entries(credentialProfiles).forEach(([profileId, profile]) => {
      const credDefId = (profile as { cred_def_id?: string })?.cred_def_id
      if (typeof credDefId === 'string') {
        profileCredDefIds.push({ profileId, credDefId })
      }
    })

    const proofProfiles = template?.catalog?.proof_profiles || {}
    Object.entries(proofProfiles).forEach(([profileId, profile]) => {
      const credDefId = (profile as { cred_def_id?: string })?.cred_def_id
      if (typeof credDefId === 'string') {
        profileCredDefIds.push({ profileId, credDefId })
      }
    })

    if (profileCredDefIds.length === 0) return null

    const credDefsRes = await credentialDefinitionApi.getAll()
    const validIds = new Set(
      (credDefsRes?.credentialDefinitions || [])
        .map((cd: { credentialDefinitionId?: string }) => cd.credentialDefinitionId)
        .filter((id: string | undefined): id is string => !!id)
    )

    const invalidProfiles = profileCredDefIds.filter(({ credDefId }) => {
      if (!credDefId.trim()) return true
      if (credDefId.startsWith('REPLACE_WITH_')) return true
      return !validIds.has(credDefId)
    })

    if (invalidProfiles.length === 0) return null

    const invalidList = invalidProfiles
      .map(({ profileId, credDefId }) => `${profileId}: ${credDefId || '(empty)'}`)
      .join(', ')
    return `Invalid credential definition ID(s) in template: ${invalidList}. ` +
      'Select valid credential definitions before publishing or starting.'
  }, [])

  // Get instance status using the hook
  const { status: instanceStatus, loading: statusLoading, refresh: refreshStatus } = useWorkflowStatus(
    activeInstanceId || undefined,
    { includeActions: true }
  )

  // Parse template for active instance
  const activeTemplate = useMemo(() => {
    const status = instanceStatus as any
    if (!status?.template_id) return null
    // Try to find in published templates or presets
    const published = templates.find(t => t.template_id === status.template_id)
    if (published) {
      // Would need to fetch full template - for now use preset if available
      const preset = PRESET_TEMPLATES.find(p => p.template_id === status.template_id)
      return preset || null
    }
    return PRESET_TEMPLATES.find(p => p.template_id === status.template_id) || null
  }, [(instanceStatus as any)?.template_id, templates])

  // Get connection label for active instance
  const activeConnectionLabel = useMemo(() => {
    if (!activeInstanceId) return undefined
    const instance = instances.find(i => i.instance_id === activeInstanceId)
    if (!instance?.connection_id) return undefined
    const conn = connections.find(c => c.id === instance.connection_id)
    return conn?.theirLabel || undefined
  }, [activeInstanceId, instances, connections])

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadConnections = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const response = await connectionApi.getAll()
      setConnections(response.connections ?? [])
    } catch (err) {
      console.error('Failed to load connections:', err)
    }
  }, [isAuthenticated])

  const loadTemplates = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingTemplates(true)
    try {
      const response = await workflowApi.listTemplates()
      setTemplates(response.templates ?? [])
    } catch (err) {
      console.error('Failed to fetch workflow templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }, [isAuthenticated])

  const loadInstances = useCallback(async (connId?: string) => {
    if (!isAuthenticated) return
    setLoadingInstances(true)
    try {
      const response = await workflowApi.listInstances(connId)
      setInstances(response.instances ?? [])
    } catch (err) {
      console.error('Failed to load workflow instances:', err)
    } finally {
      setLoadingInstances(false)
    }
  }, [isAuthenticated])

  // Restore saved connection from localStorage on mount (once)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedId = window.localStorage.getItem(WORKFLOW_CONNECTION_STORAGE_KEY)
      if (savedId) setSelectedConnectionId(savedId)
    }
  }, [])

  // Initial data load — only re-runs when auth state changes
  useEffect(() => {
    loadConnections()
    loadTemplates()
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select connection when the connections list is updated.
  // Also clears any stale ID that came from localStorage.
  useEffect(() => {
    if (connections.length === 0) return
    setSelectedConnectionId(prev => {
      if (prev && connections.some((c) => c.id === prev)) return prev
      // Stale ID: clear localStorage so it doesn't persist across sessions
      if (prev && typeof window !== 'undefined') {
        window.localStorage.removeItem(WORKFLOW_CONNECTION_STORAGE_KEY)
      }
      const completed = connections.find((c: any) => c.state === 'completed' || c.state === 'complete')
      return completed?.id || connections[0]?.id || prev
    })
  }, [connections])

  // Persist selected connection
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (selectedConnectionId) {
      window.localStorage.setItem(WORKFLOW_CONNECTION_STORAGE_KEY, selectedConnectionId)
    }
  }, [selectedConnectionId])

  // Load instances when connection changes
  useEffect(() => {
    loadInstances(selectedConnectionId || undefined)
  }, [selectedConnectionId, loadInstances])

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleDiscover = async () => {
    if (!selectedConnectionId) {
      setError('Select a connection first')
      return
    }
    setDiscovering(true)
    setError(null)
    try {
      await workflowApi.discoverTemplates(selectedConnectionId)
      await loadTemplates()
      setSuccess('Templates discovered successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError((err as Error).message || 'Failed to discover templates')
    } finally {
      setDiscovering(false)
    }
  }

  const handleRefresh = async () => {
    await Promise.all([
      loadTemplates(),
      loadInstances(selectedConnectionId || undefined),
    ])
  }

  const handleStartWorkflow = async (template: any) => {
    if (!selectedConnectionId) {
      setError('Select a connection first')
      return
    }

    // Guard: ensure the selected connection actually belongs to this tenant
    if (!connections.some((c) => c.id === selectedConnectionId)) {
      // The saved connection ID is stale (e.g. from a previous session or tenant).
      // Auto-select the first valid connection and ask the user to retry.
      const first = connections.find((c: any) => c.state === 'completed' || c.state === 'complete') || connections[0]
      if (first) {
        setSelectedConnectionId(first.id)
        setError('Previous connection was not found. A new connection has been selected — please try again.')
      } else {
        setError('No valid connection found. Please create a connection first.')
      }
      return
    }

    setStartingTemplateId(template.template_id)
    setError(null)

    try {
      // Validate template credential definitions before starting
      try {
        const validationError = await validateTemplateCredDefs(template)
        if (validationError) {
          setError(validationError)
          return
        }
      } catch (e) {
        setError((e as Error).message || 'Failed to validate credential definitions')
        return
      }

      // First, publish the template if it's a preset
      const isPreset = PRESET_TEMPLATES.some(p => p.template_id === template.template_id)
      if (isPreset) {
        try {
          await workflowApi.publish(template)
        } catch (e) {
          // Ignore if already published
        }
      }

      // Get holder DID for participants
      let participants: Record<string, { did: string }> | undefined
      try {
        const conn = await connectionApi.getById(selectedConnectionId)
        const theirDid = conn?.connection?.theirDid
        if (theirDid) participants = { holder: { did: theirDid } }
      } catch (_e) {
        // non-blocking
      }

      // Start the instance
      const resp = await workflowApi.start({
        template_id: template.template_id,
        template_version: template.version,
        connection_id: selectedConnectionId,
        ...(participants ? { participants } : {}),
      })

      const instId = resp?.instance?.instance_id
      if (instId) {
        setActiveInstanceId(instId)
        await loadInstances(selectedConnectionId)
        setSuccess('Workflow started successfully')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Failed to start instance:', err)
      setError((err as Error).message || 'Failed to start instance')
    } finally {
      setStartingTemplateId(null)
    }
  }

  const handleAdvance = async (event: string, input?: any) => {
    if (!activeInstanceId) return
    setError(null)

    try {
      console.debug('[workflow][advance] start', {
        instanceId: activeInstanceId,
        event,
        input,
        state: (instanceStatus as any)?.state,
        template_id: (instanceStatus as any)?.template_id,
        template_version: (instanceStatus as any)?.template_version,
        contextKeys: Object.keys((instanceStatus as any)?.context || {}),
      })
      // Best-effort: ensure the template exists on the counterparty
      try {
        const status = instanceStatus as any
        if (selectedConnectionId && status?.template_id) {
          await workflowApi.ensureTemplate({
            connection_id: selectedConnectionId,
            template_id: status.template_id,
            template_version: status.template_version,
            waitMs: 6000,
          })
        }
      } catch (_e) {
        // ignore
      }

      const idempotency_key = `ui:${event}:${activeInstanceId}:${Date.now()}`
      await workflowApi.advance({ instance_id: activeInstanceId, event, input, idempotency_key })
      await refreshStatus()
    } catch (err) {
      const anyErr = err as any
      console.error('[workflow][advance] failed', {
        instanceId: activeInstanceId,
        event,
        input,
        error: anyErr?.message,
        code: anyErr?.code,
        status: instanceStatus,
        response: anyErr?.data,
      })
      console.error('Advance failed:', err)
      setError((anyErr as Error).message || 'Advance failed')
    }
  }

  const handleEnsureTemplate = async (template: TemplateListItem) => {
    if (!selectedConnectionId) {
      setError('Select a connection first')
      return
    }
    setError(null)
    try {
      await workflowApi.ensureTemplate({
        connection_id: selectedConnectionId,
        template_id: template.template_id,
        template_version: template.version,
        waitMs: 6000,
      })
      setSuccess('Template synced to peer')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError((err as Error).message || 'Failed to sync template')
    }
  }

  const handlePublish = async (json: string) => {
    setError(null)
    try {
      const parsed = JSON.parse(json)
      const validationError = await validateTemplateCredDefs(parsed)
      if (validationError) {
        setError(validationError)
        return
      }

      await workflowApi.publish(parsed)
      await loadTemplates()
      setSuccess(`Template "${parsed.template_id}" published successfully`)
      setTimeout(() => setSuccess(null), 3000)
      setShowBuilder(false)
    } catch (err) {
      setError((err as Error).message || 'Failed to publish template')
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflows</h1>
          <p className="page-sub">Templated state machines for multi-party credential exchange.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleDiscover} disabled={discovering} className="btn btn-secondary">
            Discover
          </button>
          <button onClick={() => { setTemplateJson(JSON.stringify(applicationApprovalTemplate, null, 2)); setShowBuilder(true) }} className="btn btn-primary">
            New Template
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} className="btn btn-ghost btn-icon btn-sm" style={{ marginLeft: 'auto' }}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <span>{success}</span>
        </div>
      )}

      {/* Connection Context Bar */}
      <ConnectionContextBar
        connections={connections}
        selectedConnectionId={selectedConnectionId}
        onConnectionChange={setSelectedConnectionId}
        onDiscover={handleDiscover}
        onRefresh={handleRefresh}
        discovering={discovering}
        refreshing={loadingTemplates || loadingInstances}
      />

      {/* Quick Start Cards */}
      <div className="section-title">Quick Start</div>
      <QuickStartCards
        templates={PRESET_TEMPLATES as any}
        onStart={handleStartWorkflow}
        onCustomize={(template) => {
          setTemplateJson(JSON.stringify(template, null, 2))
          setShowBuilder(true)
        }}
        onCreateCustom={() => {
          setTemplateJson(JSON.stringify(applicationApprovalTemplate, null, 2))
          setShowBuilder(true)
        }}
        disabled={!selectedConnectionId}
        startingTemplateId={startingTemplateId}
      />

      {/* Active Instance Panel */}
      <ActiveInstancePanel
        instanceId={activeInstanceId}
        instanceStatus={instanceStatus}
        template={activeTemplate}
        connectionLabel={activeConnectionLabel}
        onClose={() => setActiveInstanceId(null)}
        onAdvance={handleAdvance}
        onRefresh={refreshStatus}
        loading={statusLoading}
      />

      {/* Published Templates */}
      <TemplatesTable
        templates={templates}
        loading={loadingTemplates}
        onStart={(t) => handleStartWorkflow({ template_id: t.template_id, version: t.version, title: t.title })}
        onEnsure={handleEnsureTemplate}
        onEdit={async (t) => {
          try {
            const resp = await workflowApi.getTemplate(t.template_id, t.version)
            if (resp?.template) {
              setTemplateJson(JSON.stringify(resp.template, null, 2))
            } else {
              const preset = PRESET_TEMPLATES.find(p => p.template_id === t.template_id)
              if (preset) setTemplateJson(JSON.stringify(preset, null, 2))
            }
          } catch {
            const preset = PRESET_TEMPLATES.find(p => p.template_id === t.template_id)
            if (preset) setTemplateJson(JSON.stringify(preset, null, 2))
          }
          setShowBuilder(true)
        }}
        connectionSelected={!!selectedConnectionId}
      />

      {/* Workflow Instances */}
      <InstancesTable
        instances={instances}
        connections={connections}
        loading={loadingInstances}
        activeInstanceId={activeInstanceId}
        onOpen={setActiveInstanceId}
      />

      {/* Template Builder (Modal) */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowBuilder(false)}
          />

          {/* Modal */}
          <div className="relative w-full max-w-7xl h-[90vh] mx-4 flex flex-col overflow-hidden" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary/30 bg-surface-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-semibold text-text-primary">Template Builder</h2>
                  <p className="text-xs text-text-tertiary">Create and customize workflow templates</p>
                </div>
              </div>
              <button
                onClick={() => setShowBuilder(false)}
                className="text-text-tertiary hover:text-text-primary p-2 hover:bg-surface-200 rounded-lg transition-colors"
                title="Close builder"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preset buttons */}
            <div className="px-5 py-3 bg-surface-50/50 border-b border-border-primary/20 flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-tertiary mr-2">Load preset:</span>
              {PRESET_TEMPLATES.map((t) => (
                <button
                  key={t.template_id}
                  onClick={() => setTemplateJson(JSON.stringify(t, null, 2))}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border-primary/50 text-text-primary hover:bg-surface-200 transition-colors"
                >
                  {t.title}
                </button>
              ))}
            </div>

            {/* Visual Builder */}
            <div className="flex-1 overflow-hidden">
              <WorkflowBuilder
                initialJson={templateJson}
                onJsonChange={(json) => setTemplateJson(json)}
                onPublish={handlePublish}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
