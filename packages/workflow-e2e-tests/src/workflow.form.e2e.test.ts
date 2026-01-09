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

describe('Workflow form submission via UI (input_schema)', () => {
  const Workflow = requireWorkflowModule()
  const { registerCleanup } = require('./testSetup') as { registerCleanup: (fn: () => Promise<void> | void) => void }
  const createRootAgent = async () => {
    const agent = new Agent({
      config: { label: `wf-form-root-${Date.now()}`, logger: new ConsoleLogger(LogLevel.off), walletConfig: { id: `wf-form-root-${Date.now()}`, key: 'key' }, endpoints: ['rxjs:root'] },
      dependencies: agentDependencies,
      modules: { askar: new AskarModule({ ariesAskar: require('@hyperledger/aries-askar-nodejs').ariesAskar }), tenants: new TenantsModule(), connections: new ConnectionsModule({ autoAcceptConnections: true }), workflow: new Workflow.WorkflowModule({ guardEngine: 'jmespath' }) },
    })
    const inbound = new SubjectInboundTransport(); agent.registerInboundTransport(inbound)
    const subjectMap: Record<string, Subject<any>> = { 'rxjs:root': inbound.ourSubject }
    agent.registerOutboundTransport(new SubjectOutboundTransport(subjectMap))
    await agent.initialize();
    registerCleanup(async () => {
      try { await agent.shutdown() } catch {}
      try { await agent.wallet.delete() } catch {}
      try { await inbound.stop() } catch {}
      try { const q = agent.dependencyManager.resolve(Workflow.CommandQueueService) as unknown as { stop?: () => Promise<void> }; await q?.stop?.() } catch {}
    })
    return { agent, inbound, subjectMap }
  }

  const formTemplate = (id: string) => ({
    template_id: id, version: '1.0.0', title: id, instance_policy: { mode: 'multi_per_connection' },
    states: [ { name: 'collect', type: 'start' }, { name: 'done', type: 'final' } ],
    transitions: [ { from: 'collect', to: 'done', on: 'next', action: 'set_profile' } ],
    catalog: {},
    actions: [ { key: 'set_profile', typeURI: 'https://didcomm.org/workflow/actions/state:set@1', staticInput: '{{ input }}' } ],
    display_hints: {
      states: {
        collect: [ { type: 'submit-button', label: 'Next', event: 'next', input_schema: { type: 'object', required: ['profile'], properties: { profile: { type: 'object', required: ['name'], properties: { name: { type: 'string', title: 'Name' } } } } } } ],
      },
    },
  })

  test('advance with input moves to final state', async () => {
    const { agent: root, inbound, subjectMap } = await createRootAgent()
    let tAgentA: any, tAgentB: any
    try {
      const tenantA = await root.modules.tenants.createTenant({ config: { label: 'A' } as any })
      const tenantB = await root.modules.tenants.createTenant({ config: { label: 'B' } as any })
      tAgentA = await root.modules.tenants.getTenantAgent({ tenantId: tenantA.id })
      tAgentB = await root.modules.tenants.getTenantAgent({ tenantId: tenantB.id })
      const oob = await tAgentA.oob.createInvitation(); const { connectionRecord: connAtB } = await tAgentB.oob.receiveInvitation(oob.outOfBandInvitation)
      if (!connAtB) throw new Error('No connection at B'); await tAgentB.connections.returnWhenIsConnected(connAtB.id)
      const [connAtA] = await tAgentA.connections.findAllByOutOfBandId(oob.id); await tAgentA.connections.returnWhenIsConnected(connAtA.id)

      const app = express(); app.use(express.json()); app.use((req,_res,next)=>{ (req as any).user={ tenantId: req.headers['x-tenant-id'] as string|undefined }; next() })
      const router = express.Router(); const getAgent = async (tenantId?: string) => { if (!tenantId) throw new Error('tenantId missing'); return await root.modules.tenants.getTenantAgent({ tenantId }) }
      router.post('/templates', async (req, res) => { try { const a = await getAgent((req as any).user?.tenantId); const r = await (a as any).modules.workflow.publishTemplate(req.body?.template); res.status(200).json({ success: true, id: r.id }) } catch(e){ res.status(500).json({ success: false, message: (e as Error).message }) } })
      router.post('/instances', async (req, res) => { try { const a = await getAgent((req as any).user?.tenantId); const r = await (a as any).modules.workflow.start(req.body); res.status(200).json({ success: true, instance: { instance_id: r.instanceId } }) } catch(e){ res.status(500).json({ success: false, message: (e as Error).message }) } })
      router.get('/instances/:id', async (req, res) => { try { const a = await getAgent((req as any).user?.tenantId); const r = await (a as any).modules.workflow.status({ instance_id: req.params.id, include_ui: true, include_actions: true }); res.status(200).json({ success: true, status: r }) } catch(e){ res.status(500).json({ success: false, message: (e as Error).message }) } })
      router.post('/instances/:id/advance', async (req, res) => { try { const a = await getAgent((req as any).user?.tenantId); const r = await (a as any).modules.workflow.advance({ instance_id: req.params.id, event: req.body?.event, input: req.body?.input }); res.status(200).json({ success: true, instance: { instance_id: r.instanceId, state: r.state, context: r.context } }) } catch(e){ res.status(500).json({ success: false, message: (e as Error).message }) } })
      app.use('/api/workflows', router)

      const tplId = 'wf-form'
      await request(app).post('/api/workflows/templates').set('x-tenant-id', tenantA.id).send({ template: formTemplate(tplId) }).expect(200)
      const start = await request(app).post('/api/workflows/instances').set('x-tenant-id', tenantB.id).send({ template_id: tplId, connection_id: connAtB.id }).expect(200)
      const instanceId = start.body?.instance?.instance_id
      expect(instanceId).toBeTruthy()
      // B collects form and advances
      await request(app).post(`/api/workflows/instances/${encodeURIComponent(instanceId)}/advance`).set('x-tenant-id', tenantB.id).send({ event: 'next', input: { profile: { name: 'Alice' } } }).expect(200)
      // A sees final state
      const st = await request(app).get(`/api/workflows/instances/${encodeURIComponent(instanceId)}`).set('x-tenant-id', tenantA.id).expect(200)
      expect(st.body?.status?.state).toBe('done')
    } finally {
      try { await (tAgentA as any)?.endSession?.() } catch {}
      try { await (tAgentB as any)?.endSession?.() } catch {}
    }
  })
})
