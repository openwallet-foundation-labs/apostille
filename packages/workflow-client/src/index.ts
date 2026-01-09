export type StartParams = {
  template_id: string
  template_version?: string
  connection_id: string
  participants?: Record<string, unknown>
  context?: Record<string, unknown>
}

export type AdvanceParams = {
  instance_id: string
  event: string
  idempotency_key?: string
  input?: Record<string, unknown>
}

export type StatusOptions = {
  includeUi?: boolean
  includeActions?: boolean
  uiProfile?: string
  connectionId?: string
  viewerDid?: string
}

export type WorkflowStatus = {
  instance_id: string
  connection_id?: string
  participants?: Record<string, unknown>
  state: string
  section?: string
  allowed_events: string[]
  action_menu: Array<{ label?: string; event: string }>
  artifacts: Record<string, unknown>
  ui?: unknown[]
  ui_profile?: string
  assets?: Record<string, { mediaType: string; uri?: string; attachmentId?: string }>
  context?: Record<string, unknown>
}

export class WorkflowClient {
  constructor(private readonly baseUrl: string, private readonly authToken?: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { ...headers, ...(init?.headers as any) } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error((data && data.message) || res.statusText)
    return data as T
  }

  start(params: StartParams) {
    return this.request<{ success: boolean; instance: { instance_id: string } }>(`/api/workflows/instances`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  advance(params: AdvanceParams) {
    return this.request<{ success: boolean; instance: { instance_id: string } }>(
      `/api/workflows/instances/${encodeURIComponent(params.instance_id)}/advance`,
      {
        method: 'POST',
        body: JSON.stringify({ event: params.event, idempotency_key: params.idempotency_key, input: params.input }),
      }
    )
  }

  status(instanceId: string, opts?: StatusOptions) {
    const q = new URLSearchParams()
    if (opts?.includeUi !== false) q.set('include_ui', 'true')
    if (opts?.includeActions !== false) q.set('include_actions', 'true')
    if (opts?.uiProfile) q.set('ui_profile', opts.uiProfile)
    if (opts?.connectionId) q.set('connection_id', opts.connectionId)
    if (opts?.viewerDid) q.set('viewer_did', opts.viewerDid)
    const qs = q.toString()
    return this.request<{ success: boolean; status: WorkflowStatus }>(
      `/api/workflows/instances/${encodeURIComponent(instanceId)}${qs ? `?${qs}` : ''}`
    )
  }

  setAuthToken(token?: string) {
    ;(this as any).authToken = token
  }

  listTemplates() {
    return this.request<{ success: boolean; templates: Array<{ id: string; template_id: string; version: string }> }>(
      `/api/workflows/templates`
    )
  }

  discoverTemplates(connectionId: string, templateId?: string, templateVersion?: string) {
    const q = new URLSearchParams({ connection_id: connectionId })
    if (templateId) q.set('template_id', templateId)
    if (templateVersion) q.set('template_version', templateVersion)
    return this.request(`/api/workflows/templates/discover?${q.toString()}`)
  }
}
