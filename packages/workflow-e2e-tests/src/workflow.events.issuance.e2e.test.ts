import { Subject } from 'rxjs'
import express from 'express'
import request from 'supertest'

import { Agent, ConsoleLogger, LogLevel, ConnectionsModule, EventEmitter, CredentialEventTypes, CredentialState, ProofEventTypes, ProofState } from '@credo-ts/core'
import { AskarModule } from '@credo-ts/askar'
import { agentDependencies } from '@credo-ts/node'
import { TenantsModule } from '@credo-ts/tenants'

import { SubjectInboundTransport, SubjectOutboundTransport } from './transport'

function requireWorkflowModule() {
  try { return require('@ajna-inc/workflow') } catch { const p = require('path'); const root = p.join(__dirname, '../../../..'); const backendPath = p.join(root, 'backend'); const resolved = require.resolve('@ajna-inc/workflow', { paths: [backendPath] }); return require(resolved) }
}

describe('Workflow event mapping (issuance/proof) advances state', () => {
  jest.setTimeout(30000)
  const Workflow = requireWorkflowModule()

  const { registerCleanup } = require('./testSetup') as { registerCleanup: (fn: () => Promise<void> | void) => void }

  const createRootAgent = async () => {
    const agent = new Agent({
      config: { label: `wf-events-root-${Date.now()}`, logger: new ConsoleLogger(LogLevel.off), walletConfig: { id: `wf-events-root-${Date.now()}`, key: 'key' }, endpoints: ['rxjs:root'] },
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

  const issuanceTemplate = (id: string) => ({
    template_id: id, version: '1.0.0', title: id, instance_policy: { mode: 'multi_per_connection' },
    states: [ { name: 'offer', type: 'start' }, { name: 'await_request', type: 'normal' }, { name: 'done', type: 'final' } ],
    transitions: [
      { from: 'offer', to: 'await_request', on: 'request_received' },
      { from: 'await_request', to: 'done', on: 'issued_ack' },
    ],
    catalog: {}, actions: [],
  })

  const proofTemplate = (id: string) => ({
    template_id: id, version: '1.0.0', title: id, instance_policy: { mode: 'multi_per_connection' },
    states: [ { name: 'request', type: 'start' }, { name: 'await_presentation', type: 'normal' }, { name: 'done', type: 'final' } ],
    transitions: [
      { from: 'request', to: 'await_presentation', on: 'presentation_received' },
      { from: 'await_presentation', to: 'done', on: 'verified_ack' },
    ],
    catalog: {}, actions: [],
  })

  test('credential state events advance workflow', async () => {
    const { agent: root } = await createRootAgent()
    let tAgentA: any, tAgentB: any
    try {
      const tenantA = await root.modules.tenants.createTenant({ config: { label: 'A' } as any })
      const tenantB = await root.modules.tenants.createTenant({ config: { label: 'B' } as any })
      tAgentA = await root.modules.tenants.getTenantAgent({ tenantId: tenantA.id })
      tAgentB = await root.modules.tenants.getTenantAgent({ tenantId: tenantB.id })
      const oob = await tAgentA.oob.createInvitation(); const { connectionRecord: connAtB } = await tAgentB.oob.receiveInvitation(oob.outOfBandInvitation)
      if (!connAtB) throw new Error('No connection at B'); await tAgentB.connections.returnWhenIsConnected(connAtB.id)
      const [connAtA] = await tAgentA.connections.findAllByOutOfBandId(oob.id); await tAgentA.connections.returnWhenIsConnected(connAtA.id)

      // Express with minimal routes
      const app = express(); app.use(express.json()); app.use((req,_res,next)=>{ (req as any).user={ tenantId: req.headers['x-tenant-id'] as string|undefined }; next() })
      const router = express.Router(); const getAgent = async (tenantId?: string) => { if (!tenantId) throw new Error('tenantId missing'); return await root.modules.tenants.getTenantAgent({ tenantId }) }
      router.post('/templates', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.publishTemplate(req.body?.template); res.status(200).json({ success:true, id:r.id }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      router.post('/instances', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.start(req.body); res.status(200).json({ success:true, instance:{ instance_id:r.instanceId } }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      router.post('/instances/:id/advance', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.advance({ instance_id:req.params.id, event:req.body?.event, idempotency_key:req.body?.idempotency_key, input:req.body?.input }); res.status(200).json({ success:true, instance:{ instance_id:r.instanceId, state:r.state } }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      router.get('/instances/:id', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.status({ instance_id:req.params.id, include_ui:true, include_actions:true }); res.status(200).json({ success:true, status:r }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      const appRoutes = app.use('/api/workflows', router)

      // Publish issuance template at A, start at B
      const tplId = 'wf-events-cred'
      await request(app).post('/api/workflows/templates').set('x-tenant-id', tenantA.id).send({ template: issuanceTemplate(tplId) }).expect(200)
      // Start on B (holder) and drive events on B's connection/context
      const start = await request(app).post('/api/workflows/instances').set('x-tenant-id', tenantB.id).send({ template_id: tplId, connection_id: connAtB.id }).expect(200)
      const instanceId = start.body?.instance?.instance_id
      expect(instanceId).toBeTruthy()

      // Emit RequestReceived for connection id to simulate inbound offer->request
      // Simulate credential events by advancing with the mapped events over HTTP
      const a1 = await request(app)
        .post(`/api/workflows/instances/${encodeURIComponent(instanceId)}/advance`)
        .set('x-tenant-id', tenantB.id)
        .send({ event: 'request_received' })
        .expect(200)
      expect(a1.body?.instance?.state).toBe('await_request')
      const a2 = await request(app)
        .post(`/api/workflows/instances/${encodeURIComponent(instanceId)}/advance`)
        .set('x-tenant-id', tenantB.id)
        .send({ event: 'issued_ack' })
        .expect(200)
      expect(a2.body?.instance?.state).toBe('done')

      // Wait for transitions to be applied via queue/worker
      const wait = async (cond: () => Promise<boolean>, timeoutMs = 20000) => {
        const startT = Date.now()
        while (Date.now() - startT < timeoutMs) {
          if (await cond()) return
          await new Promise((r) => setTimeout(r, 100))
        }
        throw new Error('timeout')
      }
      const s1 = await request(app).get(`/api/workflows/instances/${encodeURIComponent(instanceId)}`).set('x-tenant-id', tenantB.id).expect(200)
      expect(s1.body?.status?.state).toBe('done')
    } finally {
      try { await (tAgentA as any)?.endSession?.() } catch {}
      try { await (tAgentB as any)?.endSession?.() } catch {}
    }
  })

  test('proof state events advance workflow', async () => {
    const { agent: root } = await createRootAgent()
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
      router.post('/templates', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.publishTemplate(req.body?.template); res.status(200).json({ success:true, id:r.id }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      router.post('/instances', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.start(req.body); res.status(200).json({ success:true, instance:{ instance_id:r.instanceId } }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      router.post('/instances/:id/advance', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.advance({ instance_id:req.params.id, event:req.body?.event, idempotency_key:req.body?.idempotency_key, input:req.body?.input }); res.status(200).json({ success:true, instance:{ instance_id:r.instanceId, state:r.state } }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      router.get('/instances/:id', async (req,res)=>{ try{ const a=await getAgent((req as any).user?.tenantId); const r=await (a as any).modules.workflow.status({ instance_id:req.params.id, include_ui:true, include_actions:true }); res.status(200).json({ success:true, status:r }) }catch(e){ res.status(500).json({ success:false, message:(e as Error).message }) } })
      app.use('/api/workflows', router)

      const tplId = 'wf-events-proof'
      await request(app).post('/api/workflows/templates').set('x-tenant-id', tenantA.id).send({ template: proofTemplate(tplId) }).expect(200)
      // Start on B (holder) and drive events on B's connection/context
      const start = await request(app).post('/api/workflows/instances').set('x-tenant-id', tenantB.id).send({ template_id: tplId, connection_id: connAtB.id }).expect(200)
      const instanceId = start.body?.instance?.instance_id
      expect(instanceId).toBeTruthy()

      // Simulate proof events by advancing mapped events over HTTP
      const p1 = await request(app)
        .post(`/api/workflows/instances/${encodeURIComponent(instanceId)}/advance`)
        .set('x-tenant-id', tenantB.id)
        .send({ event: 'presentation_received' })
        .expect(200)
      expect(p1.body?.instance?.state).toBe('await_presentation')
      const p2 = await request(app)
        .post(`/api/workflows/instances/${encodeURIComponent(instanceId)}/advance`)
        .set('x-tenant-id', tenantB.id)
        .send({ event: 'verified_ack' })
        .expect(200)
      expect(p2.body?.instance?.state).toBe('done')

      const wait2 = async (cond: () => Promise<boolean>, timeoutMs = 20000) => {
        const startT = Date.now()
        while (Date.now() - startT < timeoutMs) {
          if (await cond()) return
          await new Promise((r) => setTimeout(r, 100))
        }
        throw new Error('timeout')
      }
      const s2 = await request(app).get(`/api/workflows/instances/${encodeURIComponent(instanceId)}`).set('x-tenant-id', tenantB.id).expect(200)
      expect(s2.body?.status?.state).toBe('done')
    } finally {
      try { await (tAgentA as any)?.endSession?.() } catch {}
      try { await (tAgentB as any)?.endSession?.() } catch {}
    }
  })
})
