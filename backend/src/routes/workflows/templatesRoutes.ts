import { Router, Request, Response } from 'express'
import { auth } from '../../middleware/authMiddleware'
import { getAgent } from '../../services/agentService'
import { WorkflowService, WorkflowTemplateRepository } from '@ajna-inc/workflow/build'

const router = Router()

// Publish a template
router.post('/templates', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const template = req.body?.template

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    }
    if (!template || typeof template !== 'object') {
      return res.status(400).json({ success: false, message: 'Template payload is required' })
    }

    const agent = await getAgent({ tenantId })
    const service = agent.dependencyManager.resolve(WorkflowService)
    const record = await service.publishTemplate(agent.context, template)

    try {
      const repo = agent.dependencyManager.resolve(WorkflowTemplateRepository)
      await repo.findByTemplateIdAndVersion(agent.context, template.template_id, template.version)
    } catch {}

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
    const code = (error as { code?: string }).code
    const status = code === 'invalid_template' ? 400 : 500
    return res.status(status).json({ success: false, message, code })
  }
})

// List local templates
router.get('/templates', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    }
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
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to list workflow templates' })
  }
})

// Discover templates via DIDComm (reply not persisted) then list local
// NOTE: register this BEFORE the '/templates/:templateId' param route to avoid matching 'discover' as :templateId
router.get('/templates/discover', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const connectionId = typeof req.query.connection_id === 'string' ? req.query.connection_id : undefined
    const templateId = typeof req.query.template_id === 'string' ? req.query.template_id : undefined
    const templateVersion = typeof req.query.template_version === 'string' ? req.query.template_version : undefined
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!connectionId) return res.status(400).json({ success: false, message: 'connection_id is required' })
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
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to discover workflow templates' })
  }
})

// Ensure a template exists locally by fetching from the counterparty
router.post('/templates/ensure', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { connection_id, template_id, template_version, prefer_hash, waitMs } = req.body || {}
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!connection_id || !template_id) return res.status(400).json({ success: false, message: 'connection_id and template_id are required' })
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
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to ensure template' })
  }
})

// Get one template (latest if version omitted)
// NOTE: this param route must come AFTER concrete '/templates/*' routes
router.get('/templates/:templateId', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { templateId } = req.params
    const version = typeof req.query.version === 'string' ? req.query.version : undefined
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!templateId) return res.status(400).json({ success: false, message: 'templateId is required' })
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
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to get template' })
  }
})

export default router
