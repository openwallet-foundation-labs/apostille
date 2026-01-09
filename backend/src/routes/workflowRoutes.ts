import { Router } from 'express'
import { auth } from '../middleware/authMiddleware'
import { registerWorkflowRoutes } from '@ajna-inc/workflow-backend-express'
import { getAgent } from '../services/agentService'

const router = Router()

// Apply auth once and register standardized workflow routes
router.use(auth)
registerWorkflowRoutes(router, async ({ tenantId }) => getAgent({ tenantId }))

export default router
