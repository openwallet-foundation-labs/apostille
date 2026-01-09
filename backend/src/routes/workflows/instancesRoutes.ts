import { Router, Request, Response } from 'express'
import { auth } from '../../middleware/authMiddleware'
import { getAgent } from '../../services/agentService'
import { ConnectionService } from '@credo-ts/core'
import { WorkflowInstanceRepository, WorkflowService, WorkflowTemplateRepository } from '@ajna-inc/workflow/build'

const router = Router()

// Create/start a new instance
router.post('/instances', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { template_id, template_version, connection_id, participants, context } = req.body || {}
    let startTemplateVersion: string | undefined = template_version

    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!template_id || typeof template_id !== 'string')
      return res.status(400).json({ success: false, message: 'template_id is required' })
    if (!connection_id || typeof connection_id !== 'string')
      return res.status(400).json({ success: false, message: 'connection_id is required' })

    const agent = await getAgent({ tenantId })

    // Validate connection
    try {
      const connectionSvc = agent.dependencyManager.resolve(ConnectionService)
      await connectionSvc.getById(agent.context, connection_id)
    } catch {
      return res.status(400).json({ success: false, code: 'invalid_connection', message: `connection not found or not owned by tenant: ${connection_id}` })
    }

    // Ensure template exists (exact version → latest → any)
    const tplRepo = agent.dependencyManager.resolve(WorkflowTemplateRepository)
    let tplRec = await tplRepo.findByTemplateIdAndVersion(agent.context, template_id, template_version)
    if (!tplRec) {
      try {
        const ensured = await agent.modules.workflow.ensureTemplate({ connection_id, template_id, template_version, waitMs: 8000 })
        if (ensured) tplRec = ensured
      } catch {}
      if (!tplRec) {
        try {
          const ensuredLatest = await agent.modules.workflow.ensureTemplate({ connection_id, template_id, waitMs: 8000 })
          if (ensuredLatest) tplRec = ensuredLatest
        } catch {}
      }
      if (!tplRec) {
        try {
          const all = await tplRepo.getAll(agent.context)
          const any = (all || []).find((r) => r?.template?.template_id === template_id)
          if (any) {
            tplRec = any
            startTemplateVersion = any.template.version
          }
        } catch {}
      }
    }
    if (!tplRec) {
      return res.status(400).json({ success: false, code: 'invalid_template', message: `template not found locally: ${template_id}@${template_version || 'latest'} (try Discover Templates first)` })
    }

    const record = await agent.modules.workflow.start({
      template_id,
      template_version: startTemplateVersion,
      connection_id,
      participants,
      context,
    })

    return res.status(200).json({
      success: true,
      instance: {
        id: record.id,
        instance_id: record.instanceId,
        template_id: record.templateId,
        template_version: record.templateVersion,
        connection_id: record.connectionId,
        state: record.state,
        section: record.section,
        status: record.status,
        createdAt: record.createdAt,
      },
    })
  } catch (error) {
    const message = (error as Error).message || 'Failed to start workflow instance'
    const code = (error as { code?: string }).code
    const status = code === 'invalid_template' || code?.startsWith('invalid_') || code === 'forbidden' ? 400 : code === 'already_exists' ? 409 : 500
    return res.status(status).json({ success: false, message, code })
  }
})

// Get instance status
router.get('/instances/:instanceId', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { instanceId } = req.params
    const include_ui = String(req.query.include_ui || 'true') === 'true'
    const include_actions = String((req.query.include_actions ?? (include_ui ? 'true' : 'false'))) === 'true'
    let ui_profile = typeof req.query.ui_profile === 'string' ? (req.query.ui_profile as string) : undefined
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!instanceId) return res.status(400).json({ success: false, message: 'instanceId is required' })

    const agent = await getAgent({ tenantId })
    // Auto-derive ui_profile based on holder DID match
    try {
      if (!ui_profile) {
        const instanceRepo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
        const inst = await instanceRepo.getByInstanceId(agent.context, instanceId)
        const holderDid = (inst as any)?.participants?.holder?.did as string | undefined
        if (holderDid) {
          const connSvc = agent.dependencyManager.resolve(ConnectionService)
          const connectionId = (inst as any)?.connectionId as string | undefined
          const conn = connectionId ? await connSvc.getById(agent.context, connectionId) : undefined
          const myDid = (conn as any)?.did as string | undefined
          ui_profile = myDid && holderDid === myDid ? 'receiver' : 'sender'
        }
      }
    } catch {}

    const service = agent.dependencyManager.resolve(WorkflowService)
    const statusObj = await service.status(
      agent.context,
      {
        instance_id: instanceId,
        include_ui,
        include_actions,
        ...(ui_profile ? { ui_profile } : {}),
      } as unknown as {
        instance_id: string
        include_ui?: boolean
        include_actions?: boolean
        ui_profile?: string
      }
    )
    // Attach context for UI previews
    try {
      const instanceRepo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
      const inst = await instanceRepo.getByInstanceId(agent.context, instanceId)
      const statusWithContext = { ...statusObj, context: inst?.context ?? {} }
      return res.status(200).json({ success: true, status: statusWithContext })
    } catch {
      return res.status(200).json({ success: true, status: statusObj })
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get workflow status' })
  }
})

// Advance an instance
router.post('/instances/:instanceId/advance', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { instanceId } = req.params
    const { event, idempotency_key, input } = req.body || {}
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!instanceId || typeof instanceId !== 'string') return res.status(400).json({ success: false, message: 'instance_id is required' })
    if (!event || typeof event !== 'string') return res.status(400).json({ success: false, message: 'event is required' })

    const agent = await getAgent({ tenantId })

    // Prevent receiver from sending issuer-only actions
    try {
      const instanceRepo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
      const inst = await instanceRepo.getByInstanceId(agent.context, instanceId)
      const holderDid = (inst as any)?.participants?.holder?.did as string | undefined
      const connectionId = (inst as any)?.connectionId as string | undefined
      if (holderDid && connectionId) {
        const connSvc = agent.dependencyManager.resolve(ConnectionService)
        const conn = await connSvc.getById(agent.context, connectionId)
        const myDid = (conn as any)?.did as string | undefined
        const isReceiver = myDid && holderDid === myDid
        if (isReceiver && event === 'send_offer') {
          return res.status(403).json({ success: false, code: 'forbidden', message: 'Receiver cannot send issuer-only action: send_offer' })
        }
      }
    } catch {}

    const record = await agent.modules.workflow.advance({ instance_id: instanceId, event, idempotency_key, input })
    return res.status(200).json({
      success: true,
      instance: {
        id: record.id,
        instance_id: record.instanceId,
        template_id: record.templateId,
        template_version: record.templateVersion,
        connection_id: record.connectionId,
        state: record.state,
        section: record.section,
        status: record.status,
        updatedAt: record.updatedAt,
      },
    })
  } catch (error) {
    const message = (error as Error).message || 'Failed to advance workflow instance'
    const code = (error as { code?: string }).code
    const status = code === 'invalid_template' || code?.startsWith('invalid_') || code === 'forbidden' || code === 'guard_failed' ? 400 : code === 'state_conflict' || code === 'idempotency_conflict' ? 409 : 500
    return res.status(status).json({ success: false, message, code })
  }
})

// Manual advance (no notify)
router.post('/instances/:instanceId/manual', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { instanceId } = req.params
    const { event, idempotency_key, input } = req.body || {}
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!instanceId || typeof instanceId !== 'string') return res.status(400).json({ success: false, message: 'instance_id is required' })
    if (!event || typeof event !== 'string') return res.status(400).json({ success: false, message: 'event is required' })

    const agent = await getAgent({ tenantId })
    const service = agent.dependencyManager.resolve(WorkflowService)
    const record = await service.advance(agent.context, { instance_id: instanceId, event, idempotency_key, input })
    return res.status(200).json({
      success: true,
      instance: {
        id: record.id,
        instance_id: record.instanceId,
        template_id: record.templateId,
        template_version: record.templateVersion,
        connection_id: record.connectionId,
        state: record.state,
        section: record.section,
        status: record.status,
        updatedAt: record.updatedAt,
      },
    })
  } catch (error) {
    const message = (error as Error).message || 'Failed to manually advance workflow instance'
    const code = (error as { code?: string }).code
    const status = code === 'invalid_template' || code?.startsWith('invalid_') || code === 'forbidden' || code === 'guard_failed' ? 400 : code === 'state_conflict' || code === 'idempotency_conflict' ? 409 : 500
    return res.status(status).json({ success: false, message, code })
  }
})

// List instances (optional connection_id)
router.get('/instances', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const connectionId = typeof req.query.connection_id === 'string' ? req.query.connection_id : undefined
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    const agent = await getAgent({ tenantId })
    const repo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
    const records = connectionId ? await repo.findByConnection(agent.context, connectionId) : await repo.getAll(agent.context)
    return res.status(200).json({
      success: true,
      instances: records.map((r) => ({
        id: r.id,
        instance_id: r.instanceId,
        template_id: r.templateId,
        template_version: r.templateVersion,
        connection_id: r.connectionId,
        state: r.state,
        section: r.section,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: (r as any).updatedAt,
      })),
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to list workflow instances' })
  }
})

// List instances for a connection
router.get('/connections/:connectionId/instances', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { connectionId } = req.params
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!connectionId) return res.status(400).json({ success: false, message: 'connectionId is required' })
    const agent = await getAgent({ tenantId })
    const repo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
    const records = await repo.findByConnection(agent.context, connectionId)
    return res.status(200).json({
      success: true,
      instances: records.map((r) => ({
        id: r.id,
        instance_id: r.instanceId,
        template_id: r.templateId,
        template_version: r.templateVersion,
        connection_id: r.connectionId,
        state: r.state,
        section: r.section,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: (r as any).updatedAt,
      })),
    })
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to list workflow instances' })
  }
})

export default router

