/* eslint-disable @typescript-eslint/no-var-requires */
import express from 'express'
import request from 'supertest'
import { Subject } from 'rxjs'

import { Agent, ConsoleLogger, LogLevel, ConnectionsModule } from '@credo-ts/core'
import { AskarModule } from '@credo-ts/askar'
import { agentDependencies } from '@credo-ts/node'
import { TenantsModule } from '@credo-ts/tenants'

import { SubjectInboundTransport, SubjectOutboundTransport } from './transport'

// Lazy require workflow module from backend's node_modules if not available via workspace
function requireWorkflowModule() {
  try {
    return require('@ajna-inc/workflow')
  } catch {
    const path = require('path')
    const root = path.join(__dirname, '../../../..')
    const backendPath = path.join(root, 'backend')
    const resolved = require.resolve('@ajna-inc/workflow', { paths: [backendPath] })
    return require(resolved)
  }
}

describe('Workflow API over Express with tenant agents', () => {
  const Workflow = requireWorkflowModule()

  const { registerCleanup } = require('./testSetup') as { registerCleanup: (fn: () => Promise<void> | void) => void }

  const createRootAgent = async () => {
    const agent = new Agent({
      config: {
        label: `wf-e2e-root-${Date.now()}`,
        logger: new ConsoleLogger(LogLevel.off),
        walletConfig: { id: `wf-e2e-root-${Date.now()}`, key: 'key' },
        endpoints: ['rxjs:root'],
      },
      dependencies: agentDependencies,
      modules: {
        askar: new AskarModule({ ariesAskar: require('@hyperledger/aries-askar-nodejs').ariesAskar }),
        tenants: new TenantsModule(),
        connections: new ConnectionsModule({ autoAcceptConnections: true }),
        workflow: new Workflow.WorkflowModule({ guardEngine: 'jmespath' }),
      },
    })
    const inbound = new SubjectInboundTransport()
    agent.registerInboundTransport(inbound)
    const subjectMap: Record<string, Subject<any>> = { 'rxjs:root': inbound.ourSubject }
    agent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await agent.initialize()
    registerCleanup(async () => {
      try { await agent.shutdown() } catch {}
      try { await agent.wallet.delete() } catch {}
      try { await inbound.stop() } catch {}
      try {
        const q = agent.dependencyManager.resolve(Workflow.CommandQueueService) as unknown as { stop?: () => Promise<void> }
        await q?.stop?.()
      } catch {}
    })
    return { agent, inbound, subjectMap }
  }

  const simpleTemplate = (id: string) => ({
    template_id: id,
    version: '1.0.0',
    title: id,
    instance_policy: { mode: 'multi_per_connection' },
    states: [
      { name: 'menu', type: 'start' },
      { name: 'done', type: 'final' },
    ],
    transitions: [{ from: 'menu', to: 'done', on: 'go' }],
    catalog: {},
    actions: [],
  })

  test('publish/start/advance/status across tenants via HTTP API', async () => {
    const { agent: root, inbound, subjectMap } = await createRootAgent()
    let tAgentA: any, tAgentB: any
    try {
      // Create tenants A and B
      const tenantA = await root.modules.tenants.createTenant({ config: { label: 'A', walletConfig: { id: `A-${Date.now()}`, key: 'a-key' } } as any })
      const tenantB = await root.modules.tenants.createTenant({ config: { label: 'B', walletConfig: { id: `B-${Date.now()}`, key: 'b-key' } } as any })
      tAgentA = await root.modules.tenants.getTenantAgent({ tenantId: tenantA.id })
      tAgentB = await root.modules.tenants.getTenantAgent({ tenantId: tenantB.id })

      // Outbound transport registered on root agent is reused by tenants via shared MessageSender

      // Establish connection between tenants
      const oob = await tAgentA.oob.createInvitation()
      const { connectionRecord: connAtB } = await tAgentB.oob.receiveInvitation(oob.outOfBandInvitation)
      if (!connAtB) throw new Error('No connection at B')
      await tAgentB.connections.returnWhenIsConnected(connAtB.id)
      const [connAtA] = await tAgentA.connections.findAllByOutOfBandId(oob.id)
      await tAgentA.connections.returnWhenIsConnected(connAtA.id)

      // Build express app with workflow routes
      const app = express()
      app.use(express.json())
      // fake auth: read tenantId from header
      app.use((req, _res, next) => {
        const tenantId = req.headers['x-tenant-id'] as string | undefined
        ;(req as any).user = { tenantId }
        next()
      })
      const router = express.Router()
      const getAgent = async (tenantId?: string) => {
        if (!tenantId) throw new Error('tenantId missing')
        return await root.modules.tenants.getTenantAgent({ tenantId })
      }
      // Publish template
      router.post('/templates', async (req, res) => {
        try {
          const agent = await getAgent((req as any).user?.tenantId)
          const record = await (agent as any).modules.workflow.publishTemplate(req.body?.template)
          res.status(200).json({ success: true, template: { id: record.id } })
        } catch (e) {
          res.status(500).json({ success: false, message: (e as Error).message })
        }
      })
      // Start instance
      router.post('/instances', async (req, res) => {
        try {
          const agent = await getAgent((req as any).user?.tenantId)
          const rec = await (agent as any).modules.workflow.start(req.body)
          res.status(200).json({ success: true, instance: { instance_id: rec.instanceId } })
        } catch (e) {
          res.status(500).json({ success: false, message: (e as Error).message })
        }
      })
      // Status
      router.get('/instances/:instanceId', async (req, res) => {
        try {
          const agent = await getAgent((req as any).user?.tenantId)
          const st = await (agent as any).modules.workflow.status({ instance_id: req.params.instanceId, include_ui: true, include_actions: true, ui_profile: typeof req.query.ui_profile === 'string' ? (req.query.ui_profile as string) : undefined })
          res.status(200).json({ success: true, status: st })
        } catch (e) {
          res.status(500).json({ success: false, message: (e as Error).message })
        }
      })
      // Advance
      router.post('/instances/:instanceId/advance', async (req, res) => {
        try {
          const agent = await getAgent((req as any).user?.tenantId)
          const rec = await (agent as any).modules.workflow.advance({ instance_id: req.params.instanceId, event: req.body?.event, idempotency_key: req.body?.idempotency_key, input: req.body?.input })
          res.status(200).json({ success: true, instance: { instance_id: rec.instanceId, state: rec.state } })
        } catch (e) {
          res.status(500).json({ success: false, message: (e as Error).message })
        }
      })
      app.use('/api/workflows', router)

      // Publish template at A
      const tplId = 'wf-e2e-http'
      await request(app)
        .post('/api/workflows/templates')
        .set('x-tenant-id', tenantA.id)
        .send({ template: simpleTemplate(tplId) })
        .expect(200)

      // Start from B over HTTP
      const startRes = await request(app)
        .post('/api/workflows/instances')
        .set('x-tenant-id', tenantB.id)
        .send({ template_id: tplId, connection_id: connAtB.id })
        .expect(200)
      const instanceId = startRes.body?.instance?.instance_id
      expect(instanceId).toBeTruthy()

      // Wait until A reports state 'menu'
      const wait = async (cond: () => Promise<boolean>, timeoutMs = 5000) => {
        const start = Date.now()
        while (Date.now() - start < timeoutMs) {
          if (await cond()) return
          await new Promise((r) => setTimeout(r, 100))
        }
        throw new Error('timeout')
      }
      await wait(async () => {
        const st = await request(app)
          .get(`/api/workflows/instances/${encodeURIComponent(instanceId)}`)
          .set('x-tenant-id', tenantA.id)
          .expect(200)
        return st.body?.status?.state === 'menu'
      })

      // Advance from B over HTTP
      await request(app)
        .post(`/api/workflows/instances/${encodeURIComponent(instanceId)}/advance`)
        .set('x-tenant-id', tenantB.id)
        .send({ event: 'go' })
        .expect(200)

      // Wait until A reports 'done'
      await wait(async () => {
        const st = await request(app)
          .get(`/api/workflows/instances/${encodeURIComponent(instanceId)}`)
          .set('x-tenant-id', tenantA.id)
          .expect(200)
        return st.body?.status?.state === 'done'
      })
    } finally {
      try { await (tAgentA as any)?.endSession?.() } catch {}
      try { await (tAgentB as any)?.endSession?.() } catch {}
    }
  })
})
