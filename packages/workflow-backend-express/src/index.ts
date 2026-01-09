// Use loose types to avoid cross-package @types/express conflicts in host apps
type Request = any
type Response = any
type Router = any

export type GetAgent = (opts: { tenantId: string }) => Promise<{
  modules: any
  dependencyManager: any
  context: any
}>

function badRequest(res: Response, message: string, code?: string) {
  return res.status(400).json({ success: false, message, ...(code ? { code } : {}) })
}

export function registerWorkflowRoutes(router: Router, getAgent: GetAgent) {
  // Templates: publish, list, discover, ensure, get
  router.post('/templates', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const template = req.body?.template
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!template || typeof template !== 'object') return badRequest(res, 'Template payload is required')
      const agent = await getAgent({ tenantId })
      const record = await agent.modules.workflow.publishTemplate(template)
      return res.status(200).json({
        success: true,
        template: {
          id: record.id,
          template_id: record.template.template_id,
          version: record.template.version,
          hash: record.hash,
          createdAt: record.createdAt,
        },
      })
    } catch (error) {
      const message = (error as Error).message || 'Failed to publish workflow template'
      const code = (error as any)?.code
      const status = code === 'invalid_template' ? 400 : 500
      return res.status(status).json({ success: false, message, code })
    }
  })

  router.get('/templates', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      const agent = await getAgent({ tenantId })
      const records = await agent.modules.workflow.listTemplates()
      return res.status(200).json({
        success: true,
        templates: records.map((record: any) => ({
          id: record.id,
          template_id: record.template.template_id,
          version: record.template.version,
          title: record.template.title,
          createdAt: record.createdAt,
          hash: record.hash,
        })),
      })
    } catch (_e) {
      return res.status(500).json({ success: false, message: 'Failed to list workflow templates' })
    }
  })

  router.get('/templates/discover', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const connectionId = typeof req.query.connection_id === 'string' ? req.query.connection_id : undefined
      const templateId = typeof req.query.template_id === 'string' ? req.query.template_id : undefined
      const templateVersion = typeof req.query.template_version === 'string' ? req.query.template_version : undefined
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!connectionId) return badRequest(res, 'connection_id is required')
      const agent = await getAgent({ tenantId })
      try {
        await agent.modules.workflow.discoverTemplates(connectionId, { template_id: templateId, version: templateVersion })
      } catch {}
      const records = await agent.modules.workflow.listTemplates()
      return res.status(200).json({
        success: true,
        templates: records.map((record: any) => ({
          id: record.id,
          template_id: record.template.template_id,
          version: record.template.version,
          title: record.template.title,
          createdAt: record.createdAt,
          hash: record.hash,
        })),
      })
    } catch (_e) {
      return res.status(500).json({ success: false, message: 'Failed to discover workflow templates' })
    }
  })

  router.post('/templates/ensure', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { connection_id, template_id, template_version, prefer_hash, waitMs } = req.body || {}
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!connection_id || !template_id) return badRequest(res, 'connection_id and template_id are required')
      const agent = await getAgent({ tenantId })
      const rec = await agent.modules.workflow.ensureTemplate({ connection_id, template_id, template_version, prefer_hash, waitMs })
      if (!rec) return res.status(404).json({ success: false, message: 'template not found on counterparty' })
      return res.status(200).json({
        success: true,
        template: {
          id: rec.id,
          template_id: rec.template.template_id,
          version: rec.template.version,
          title: rec.template.title,
          createdAt: rec.createdAt,
          hash: rec.hash,
        },
      })
    } catch (_e) {
      return res.status(500).json({ success: false, message: 'Failed to ensure template' })
    }
  })

  router.get('/templates/:templateId', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { templateId } = req.params
      const version = typeof req.query.version === 'string' ? req.query.version : undefined
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!templateId) return badRequest(res, 'templateId is required')
      const agent = await getAgent({ tenantId })
      const rec = await agent.modules.workflow.getTemplate(templateId, version)
      if (!rec) return res.status(404).json({ success: false, message: 'template not found' })
      return res.status(200).json({
        success: true,
        template: {
          id: rec.id,
          template_id: rec.template.template_id,
          version: rec.template.version,
          title: rec.template.title,
          createdAt: rec.createdAt,
          hash: rec.hash,
        },
      })
    } catch (_e) {
      return res.status(500).json({ success: false, message: 'Failed to get template' })
    }
  })

  // Instances: start, status, manual advance, list, list by connection
  router.post('/instances', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { template_id, template_version, connection_id, participants, context } = req.body || {}
      let startTemplateVersion: string | undefined = template_version
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!template_id || typeof template_id !== 'string') return badRequest(res, 'template_id is required')
      if (!connection_id || typeof connection_id !== 'string') return badRequest(res, 'connection_id is required')

      const agent = await getAgent({ tenantId })

      // Validate connection exists
      try {
        const { ConnectionService } = require('@credo-ts/core')
        const connectionSvc = agent.dependencyManager.resolve(ConnectionService)
        const conn = await connectionSvc.getById(agent.context, connection_id)
        try {
          // Lightweight diagnostics: confirm DID ownership + context id
          const myDid = (conn as any).myDid
          const theirDid = (conn as any).theirDid
          const ccid = (agent as any)?.context?.contextCorrelationId
          // eslint-disable-next-line no-console
          console.info('[workflow-backend-express] start: validate connection ok', {
            tenantId,
            connection_id,
            myDid,
            theirDid,
            contextCorrelationId: ccid,
          })
        } catch {}
      } catch {
        return res.status(400).json({ success: false, code: 'invalid_connection', message: `connection not found or not owned by tenant: ${connection_id}` })
      }

      // Ensure template exists (exact → latest → any)
      try {
        const { WorkflowTemplateRepository } = require('@ajna-inc/workflow/build')
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
              const any = (all || []).find((r: any) => r?.template?.template_id === template_id)
              if (any) {
                tplRec = any
                startTemplateVersion = any.template.version
              }
            } catch {}
          }
        }
        if (!tplRec) return res.status(400).json({ success: false, code: 'invalid_template', message: `template not found locally: ${template_id}@${template_version || 'latest'} (try Discover Templates first)` })
      } catch (e) {
        // If repo resolution fails, continue and let start throw
      }

      const record = await agent.modules.workflow.start({
        template_id,
        template_version: startTemplateVersion,
        connection_id,
        participants,
        context,
      })

      try {
        const ccid2 = (agent as any)?.context?.contextCorrelationId
        // eslint-disable-next-line no-console
        console.info('[workflow-backend-express] start: created instance', {
          tenantId,
          instance_id: (record as any)?.instanceId,
          template_id,
          connection_id,
          contextCorrelationId: ccid2,
        })
      } catch {}

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
      const code = (error as any)?.code
      const status = code === 'invalid_template' || (typeof code === 'string' && code.startsWith('invalid_')) || code === 'forbidden' ? 400 : code === 'already_exists' ? 409 : 500
      return res.status(status).json({ success: false, message, code })
    }
  })

  router.get('/instances/:instanceId', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { instanceId } = req.params
      const include_ui = String(req.query.include_ui || 'true') === 'true'
      const include_actions = String((req.query.include_actions ?? (include_ui ? 'true' : 'false'))) === 'true'
      let ui_profile = typeof req.query.ui_profile === 'string' ? (req.query.ui_profile as string) : undefined
      // Allow explicit 'auto' to mean derive on server
      if (ui_profile === 'auto') ui_profile = undefined
      const connection_id = typeof req.query.connection_id === 'string' ? (req.query.connection_id as string) : undefined
      const viewer_did = typeof req.query.viewer_did === 'string' ? (req.query.viewer_did as string) : undefined
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!instanceId) return badRequest(res, 'instanceId is required')
      const agent = await getAgent({ tenantId })

      // Optionally derive ui_profile based on instance participants per spec
      try {
        if (!ui_profile) {
          const { WorkflowInstanceRepository } = require('@ajna-inc/workflow/build')
          const instanceRepo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
          const inst = await instanceRepo.getByInstanceId(agent.context, instanceId)
          // Do not force a profile here; let service derive using opts.viewer or participants mapping
          // ui_profile remains undefined unless explicitly provided by the caller
        }
      } catch {}
      try {
        const status = await agent.modules.workflow.status({ instance_id: instanceId, include_ui, include_actions, ...(ui_profile ? { ui_profile } : {}), ...(viewer_did ? { viewer: { did: viewer_did } } : {}) })
        return res.status(200).json({ success: true, status })
      } catch (err) {
        const code = (err as any)?.code
        const msg = (err as Error)?.message || ''
        if (code === 'invalid_event' || /instance not found/i.test(msg)) {
          return res.status(404).json({ success: false, message: msg || 'instance not found', code: 'not_found' })
        }
        return res.status(500).json({ success: false, message: msg || 'Failed to fetch workflow status' })
      }
    } catch (e) {
      return res.status(500).json({ success: false, message: (e as Error).message })
    }
  })

  router.post('/instances/:instanceId/advance', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { instanceId } = req.params
      const { event, idempotency_key, input, connection_id } = req.body || {}
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!instanceId || typeof instanceId !== 'string') return badRequest(res, 'instance_id is required')
      if (!event || typeof event !== 'string') return badRequest(res, 'event is required')

      const agent = await getAgent({ tenantId })
      try {
        const rec = await agent.modules.workflow.advance({ instance_id: instanceId, event, idempotency_key, input })
        return res.status(200).json({
          success: true,
          instance: {
            id: rec.id,
            instance_id: rec.instanceId,
            template_id: rec.templateId,
            template_version: rec.templateVersion,
            connection_id: rec.connectionId,
            state: rec.state,
            section: rec.section,
            status: rec.status,
            updatedAt: rec.updatedAt,
          },
        })
      } catch (err) {
        // No remote fallback: propagate error to mapper below
        throw err
      }
    } catch (error) {
      const message = (error as Error).message || 'Failed to advance workflow instance'
      const code = (error as any)?.code
      const status = code === 'invalid_template' || (typeof code === 'string' && code.startsWith('invalid_')) || code === 'forbidden' || code === 'guard_failed' ? 400 : code === 'state_conflict' || code === 'idempotency_conflict' ? 409 : 500
      return res.status(status).json({ success: false, message, code })
    }
  })

  router.post('/instances/:instanceId/manual', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { instanceId } = req.params
      const { event, idempotency_key, input } = req.body || {}
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!instanceId || typeof instanceId !== 'string') return badRequest(res, 'instance_id is required')
      if (!event || typeof event !== 'string') return badRequest(res, 'event is required')

      const agent = await getAgent({ tenantId })
      const { WorkflowService } = require('@ajna-inc/workflow/build')
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
      const code = (error as any)?.code
      const status = code === 'invalid_template' || (typeof code === 'string' && code.startsWith('invalid_')) || code === 'forbidden' || code === 'guard_failed' ? 400 : code === 'state_conflict' || code === 'idempotency_conflict' ? 409 : 500
      return res.status(status).json({ success: false, message, code })
    }
  })

  router.get('/instances', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const connectionId = typeof req.query.connection_id === 'string' ? req.query.connection_id : undefined
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      const agent = await getAgent({ tenantId })
      const { WorkflowInstanceRepository } = require('@ajna-inc/workflow/build')
      const repo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
      const records = connectionId ? await repo.findByConnection(agent.context, connectionId) : await repo.getAll(agent.context)
      return res.status(200).json({
        success: true,
        instances: records.map((r: any) => ({
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
    } catch (_e) {
      return res.status(500).json({ success: false, message: 'Failed to list workflow instances' })
    }
  })

  router.get('/connections/:connectionId/instances', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { connectionId } = req.params
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      if (!connectionId) return badRequest(res, 'connectionId is required')
      const agent = await getAgent({ tenantId })
      const { WorkflowInstanceRepository } = require('@ajna-inc/workflow/build')
      const repo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
      const records = await repo.findByConnection(agent.context, connectionId)
      return res.status(200).json({
        success: true,
        instances: records.map((r: any) => ({
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
    } catch (_e) {
      return res.status(500).json({ success: false, message: 'Failed to list workflow instances' })
    }
  })

  // Queue: metrics, commands
  router.get('/queue/metrics', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      const agent = await getAgent({ tenantId })
      const { WorkflowCommandRepository } = require('@ajna-inc/workflow/build')
      const repo = agent.dependencyManager.resolve(WorkflowCommandRepository)
      const repoMetrics = await repo.getMetrics(agent.context)

      let active: number | undefined = undefined
      try {
        const { CommandQueueService } = require('@ajna-inc/workflow/build')
        const queue = agent.dependencyManager.resolve(CommandQueueService) as { getMetrics?: () => Promise<{ active?: number }> }
        if (queue?.getMetrics) {
          const qm = await queue.getMetrics()
          active = qm?.active
        }
      } catch {}

      return res.status(200).json({ success: true, metrics: { ...repoMetrics, ...(active !== undefined ? { active } : {}) } })
    } catch (error) {
      return res.status(500).json({ success: false, message: (error as Error).message || 'Failed to load queue metrics' })
    }
  })

  router.get('/queue/commands', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      const status = typeof req.query.status === 'string' ? req.query.status : undefined
      const thid = typeof req.query.thid === 'string' ? req.query.thid : undefined
      const limit = req.query.limit ? Number(req.query.limit) : 50
      const agent = await getAgent({ tenantId })
      const { WorkflowCommandRepository } = require('@ajna-inc/workflow/build')
      const repo = agent.dependencyManager.resolve(WorkflowCommandRepository)
      const all = await repo.getAll(agent.context)
      const filtered = all
        .filter((r: any) => (status ? r.status === status : true))
        .filter((r: any) => (thid ? r.thid === thid : true))
        .sort((a: any, b: any) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))
        .slice(0, Math.max(1, Math.min(500, limit)))
      const items = filtered.map((r: any) => ({
        id: r.id,
        cmd: r.cmd,
        thid: r.thid,
        status: r.status,
        attempts: r.attempts,
        lastAttemptAt: r.lastAttemptAt,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        error: r.error,
        connectionId: r.connectionId,
        contextCorrelationId: r.contextCorrelationId,
        tags: (r as any)._tags || {},
      }))
      return res.status(200).json({ success: true, items })
    } catch (error) {
      return res.status(500).json({ success: false, message: (error as Error).message || 'Failed to load queue commands' })
    }
  })

  // Debug: confirm a connection record exists in the current tenant
  router.get('/_debug/connections/:connectionId', async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).user?.tenantId
      const { connectionId } = req.params
      if (!tenantId) return badRequest(res, 'Tenant ID missing from request context')
      const agent = await getAgent({ tenantId })
      const { ConnectionService } = require('@credo-ts/core')
      const svc = agent.dependencyManager.resolve(ConnectionService)
      try {
        const rec = await svc.getById(agent.context, connectionId)
        return res.status(200).json({
          success: true,
          tenantId,
          connection: {
            id: (rec as any).id,
            myDid: (rec as any).myDid,
            theirDid: (rec as any).theirDid,
          },
          contextCorrelationId: (agent as any)?.context?.contextCorrelationId,
        })
      } catch (e) {
        return res.status(404).json({ success: false, tenantId, message: (e as Error).message, contextCorrelationId: (agent as any)?.context?.contextCorrelationId })
      }
    } catch (e) {
      return res.status(500).json({ success: false, message: (e as Error).message })
    }
  })
}
