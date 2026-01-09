import express from 'express'
import request from 'supertest'
import { Subject } from 'rxjs'

import { Agent, ConsoleLogger, LogLevel, ConnectionsModule } from '@credo-ts/core'
import { AskarModule } from '@credo-ts/askar'
import { agentDependencies } from '@credo-ts/node'
import { TenantsModule } from '@credo-ts/tenants'

import { SubjectInboundTransport, SubjectOutboundTransport } from './transport'

function requireWorkflowModule() {
  try { return require('@ajna-inc/workflow') } catch { const p = require('path'); const root = p.join(__dirname, '../../../..'); const backendPath = p.join(root, 'backend'); const resolved = require.resolve('@ajna-inc/workflow', { paths: [backendPath] }); return require(resolved) }
}

describe('Workflow UI profile filtering (sender vs receiver)', () => {
  const Workflow = requireWorkflowModule()

  const { registerCleanup } = require('./testSetup') as { registerCleanup: (fn: () => Promise<void> | void) => void }
  const createRootAgent = async () => {
    const agent = new Agent({
      config: {
        label: `wf-ui-root-${Date.now()}`,
        logger: new ConsoleLogger(LogLevel.off),
        walletConfig: { id: `wf-ui-root-${Date.now()}`, key: 'key' },
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
      try { const q = agent.dependencyManager.resolve(Workflow.CommandQueueService) as unknown as { stop?: () => Promise<void> }; await q?.stop?.() } catch {}
    })
    return { agent, inbound, subjectMap }
  }

  const profTemplate = (id: string) => ({
    template_id: id,
    version: '1.0.0',
    title: id,
    instance_policy: { mode: 'multi_per_connection' },
    states: [ { name: 'menu', type: 'start' }, { name: 'done', type: 'final' } ],
    transitions: [ { from: 'menu', to: 'done', on: 'go' } ],
    catalog: {},
    actions: [],
    display_hints: {
      profiles: {
        sender: { states: { menu: [ { type: 'text', text: 'Sender sees this' } ] } },
        receiver: { states: { menu: [ { type: 'text', text: 'Receiver sees this' } ] } },
      },
    },
  })

  test('status returns different UI based on ui_profile', async () => {
    const { agent: root, inbound, subjectMap } = await createRootAgent()
    let tAgentA: any, tAgentB: any
    try {
      const tenantA = await root.modules.tenants.createTenant({ config: { label: 'A' } as any })
      const tenantB = await root.modules.tenants.createTenant({ config: { label: 'B' } as any })
      tAgentA = await root.modules.tenants.getTenantAgent({ tenantId: tenantA.id })
      tAgentB = await root.modules.tenants.getTenantAgent({ tenantId: tenantB.id })

      // Establish connection
      const oob = await tAgentA.oob.createInvitation()
      const { connectionRecord: connAtB } = await tAgentB.oob.receiveInvitation(oob.outOfBandInvitation)
      if (!connAtB) throw new Error('No connection at B')
      await tAgentB.connections.returnWhenIsConnected(connAtB.id)
      const [connAtA] = await tAgentA.connections.findAllByOutOfBandId(oob.id)
      await tAgentA.connections.returnWhenIsConnected(connAtA.id)

      // Express API
      const app = express(); app.use(express.json()); app.use((req,_res,next)=>{ (req as any).user={ tenantId: req.headers['x-tenant-id'] as string|undefined }; next() })
      const router = express.Router()
      const getAgent = async (tenantId?: string) => { if (!tenantId) throw new Error('tenantId missing'); return await root.modules.tenants.getTenantAgent({ tenantId }) }
      router.post('/templates', async (req, res) => { try { const a = await getAgent((req as any).user?.tenantId); const r = await (a as any).modules.workflow.publishTemplate(req.body?.template); res.status(200).json({ success: true, id: r.id }) } catch(e){ res.status(500).json({ success: false, message: (e as Error).message }) } })
      router.post('/instances', async (req, res) => { try { const a = await getAgent((req as any).user?.tenantId); const r = await (a as any).modules.workflow.start(req.body); res.status(200).json({ success: true, instance: { instance_id: r.instanceId } }) } catch(e){ res.status(500).json({ success: false, message: (e as Error).message }) } })
      router.get('/instances/:id', async (req, res) => { try { const a = await getAgent((req as any).user?.tenantId); const r = await (a as any).modules.workflow.status({ instance_id: req.params.id, include_ui: true, include_actions: true, ui_profile: typeof req.query.ui_profile==='string' ? (req.query.ui_profile as string): undefined }); res.status(200).json({ success: true, status: r }) } catch(e){ res.status(500).json({ success: false, message: (e as Error).message }) } })
      app.use('/api/workflows', router)

      // Publish
      const tplId = 'wf-ui-profiles'
      await request(app).post('/api/workflows/templates').set('x-tenant-id', tenantA.id).send({ template: profTemplate(tplId) }).expect(200)
      // Start
      const start = await request(app).post('/api/workflows/instances').set('x-tenant-id', tenantB.id).send({ template_id: tplId, connection_id: connAtB.id }).expect(200)
      const instanceId = start.body?.instance?.instance_id
      expect(instanceId).toBeTruthy()

      // Sender profile
      const s1 = await request(app).get(`/api/workflows/instances/${encodeURIComponent(instanceId)}`).query({ ui_profile: 'sender' }).set('x-tenant-id', tenantA.id).expect(200)
      const senderText = (s1.body?.status?.ui || []).find((i: any)=> i?.type==='text')?.text
      expect(senderText).toBe('Sender sees this')
      // Receiver profile
      const s2 = await request(app).get(`/api/workflows/instances/${encodeURIComponent(instanceId)}`).query({ ui_profile: 'receiver' }).set('x-tenant-id', tenantA.id).expect(200)
      const receiverText = (s2.body?.status?.ui || []).find((i: any)=> i?.type==='text')?.text
      expect(receiverText).toBe('Receiver sees this')
    } finally {
      try { await (tAgentA as any)?.endSession?.() } catch {}
      try { await (tAgentB as any)?.endSession?.() } catch {}
    }
  })
})
