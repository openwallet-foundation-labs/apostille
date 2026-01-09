import { Router, Request, Response } from 'express'
import { auth } from '../../middleware/authMiddleware'
import { getAgent } from '../../services/agentService'
import { WorkflowCommandRepository } from '@ajna-inc/workflow/build'

const router = Router()

// Queue metrics
router.get('/queue/metrics', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })

    const agent = await getAgent({ tenantId })
    const repo = agent.dependencyManager.resolve(WorkflowCommandRepository)
    const repoMetrics = await repo.getMetrics(agent.context)

    let active = undefined as number | undefined
    try {
      const queue = agent.dependencyManager.resolve((require('@ajna-inc/workflow/build').CommandQueueService)) as unknown as {
        getMetrics?: () => Promise<{ active?: number }>
      }
      if (queue && typeof queue.getMetrics === 'function') {
        const qm = await queue.getMetrics()
        active = qm?.active
      }
    } catch {}

    return res.status(200).json({ success: true, metrics: { ...repoMetrics, ...(active !== undefined ? { active } : {}) } })
  } catch (error) {
    return res.status(500).json({ success: false, message: (error as Error).message || 'Failed to load queue metrics' })
  }
})

// Queue commands list
router.get('/queue/commands', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })

    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const thid = typeof req.query.thid === 'string' ? req.query.thid : undefined
    const limit = req.query.limit ? Number(req.query.limit) : 50

    const agent = await getAgent({ tenantId })
    const repo = agent.dependencyManager.resolve(WorkflowCommandRepository)

    const all = await repo.getAll(agent.context)
    const filtered = all
      .filter((r) => (status ? r.status === status : true))
      .filter((r) => (thid ? r.thid === thid : true))
      .sort((a, b) => (b.createdAt?.getTime?.() || 0) - (a.createdAt?.getTime?.() || 0))
      .slice(0, Math.max(1, Math.min(500, limit)))

    const items = filtered.map((r) => ({
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

export default router

