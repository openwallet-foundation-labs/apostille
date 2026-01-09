import type { Agent, BaseEvent } from '@credo-ts/core'
import { EventEmitter } from '@credo-ts/core'
import { RepositoryEventTypes } from '@credo-ts/core'
import { AgentEventTypes, type AgentMessageReceivedEvent } from '@credo-ts/core'
import { BasicMessageEventTypes, type BasicMessageStateChangedEvent } from '@credo-ts/core'
import { CredentialEventTypes, type CredentialStateChangedEvent } from '@credo-ts/core'
import { ProofEventTypes, type ProofStateChangedEvent } from '@credo-ts/core'
import { WorkflowEventTypes, type WorkflowInstanceStateChangedEvent, type WorkflowInstanceStatusChangedEvent, type WorkflowInstanceCompletedEvent } from '@ajna-inc/workflow/build/WorkflowEvents'
import { SigningEventTypes } from '@ajna-inc/signing'
import type { SigningStateChangedEvent } from '@ajna-inc/signing'
import { PoeEventTypes } from '@ajna-inc/poe'
import { bus, type NotificationPayload } from '../notifications/bus'
import { WebRTCEvents } from '@ajna-inc/webrtc'
import { isEnabled } from '../notifications/registry'
import crypto from 'crypto'

type TenantId = string

type Detach = () => void

const refCount: Map<TenantId, number> = new Map()
const detachMap: Map<TenantId, Detach> = new Map()

// Simple de-duplication for bursty events (e.g., basic messages)
const DEDUP_TTL_MS = 2000
const seenKeys: Map<string, number> = new Map()
function dedup(key: string): boolean {
  const now = Date.now()
  const last = seenKeys.get(key)
  if (last && now - last < DEDUP_TTL_MS) return true
  seenKeys.set(key, now)
  setTimeout(() => {
    const v = seenKeys.get(key)
    if (v && Date.now() - v >= DEDUP_TTL_MS) seenKeys.delete(key)
  }, DEDUP_TTL_MS + 500)
  return false
}

function emit<T extends BaseEvent>(tenantId: string, e: T) {
  if (!bus.hasActive(tenantId)) {
    try { console.log(`[WS] skip send (no active) type=${(e as any).type} tenant=${tenantId}`) } catch {}
    return
  }
  // Type-specific filters & transforms before enabled check
  let outType: any = (e as any).type
  let basicDirection: 'received' | 'sent' | undefined
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    if (e.type === BasicMessageEventTypes.BasicMessageStateChanged) {
      const rec = (e as any)?.payload?.basicMessageRecord
      const msg = (e as any)?.payload?.message
      const role = rec?.role
      // Emit both directions from BasicMessage events, scoped by tenant context.
      if (role === 'sender') {
        outType = 'AppMessageSent'
        basicDirection = 'sent'
      } else if (role === 'receiver') {
        outType = 'AppMessageReceived'
        basicDirection = 'received'
      }
      // De-dup by stable message/thread id when possible + direction
      const threadId = rec?.threadId || msg?.['@id']
      const key = threadId || rec?.id || msg?.id
      if (key && dedup(`${tenantId}:${String(outType)}:${key}`)) {
        console.log(`[WS] skip send (dedup ${String(outType)}) tenant=${tenantId} key=${key}`)
        return
      }
    }
  } catch {}

  // Only forward enabled types (after filters)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore strict type narrowing on enums with string literal values
  if (!isEnabled(tenantId, outType)) {
    try { console.log(`[WS] skip send (disabled) type=${(e as any).type} tenant=${tenantId}`) } catch {}
    return
  }

  // Build normalized payload; for basic message, include exact content/ids
  let data: any = e.payload
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if ((e as any).type === BasicMessageEventTypes.BasicMessageStateChanged) {
    const rec = (e as any)?.payload?.basicMessageRecord
    const msg = (e as any)?.payload?.message
    data = {
      id: rec?.id || msg?.id,
      content: rec?.content || msg?.content,
      sentTime: rec?.sentTime || msg?.sent_time,
      connectionId: rec?.connectionId,
      threadId: rec?.threadId || msg?.['@id'],
      role: rec?.role,
      direction: basicDirection,
      source: (e as any)?.payload?.source || 'event',
    }
  }
  const payload: NotificationPayload<any> = {
    v: 1,
    id: crypto.randomUUID(),
    type: outType,
    tenantId,
    createdAt: new Date().toISOString(),
    data,
  }
  try { console.log(`[WS] send type=${payload.type} tenant=${tenantId}`) } catch {}
  bus.sendSync(tenantId, payload)
}

export async function onSocketConnected(tenantId: string, agent: Agent) {
  const current = refCount.get(tenantId) ?? 0
  const alreadyAttached = detachMap.has(tenantId)
  if (alreadyAttached) {
    refCount.set(tenantId, current + 1)
    try { console.log(`[WS] already attached; increment refCount tenant=${tenantId} -> ${current + 1}`) } catch {}
    return
  }

  let emitter: EventEmitter | undefined = (agent as any)?.events
  let emitterSource: 'agent.events' | 'dm.resolve' | 'unknown' = 'unknown'
  if (emitter && (emitter as any).on) {
    emitterSource = 'agent.events'
  } else {
    try {
      const resolved = (agent as any)?.dependencyManager?.resolve?.(EventEmitter)
      if (resolved && resolved.on) {
        emitter = resolved as EventEmitter
        emitterSource = 'dm.resolve'
      }
    } catch (e) {
      // no-op, we handle below
    }
  }
  if (!emitter || !(emitter as any).on) {
    throw new Error('Agent events emitter unavailable (both agent.events and dm.resolve failed)')
  }
  const tenantCtxId: string | undefined = (agent as any)?.context?.contextCorrelationId
  try { console.log(`[WS] attaching event producers for tenant=${tenantId} via=${emitterSource} ctx=${tenantCtxId}`) } catch {}

  const acceptForTenant = (e: any) => {
    const metaCid = e?.metadata?.contextCorrelationId || e?.payload?.contextCorrelationId
    if (tenantCtxId && metaCid && metaCid !== tenantCtxId) {
      try { console.log(`[WS] skip send (context mismatch) tenant=${tenantId} eventCtx=${metaCid}`) } catch {}
      return false
    }
    return true
  }

  const onBasic: (e: BasicMessageStateChangedEvent) => void = (e) => { if (acceptForTenant(e)) emit(tenantId, e) }
  const onCred: (e: CredentialStateChangedEvent) => void = (e) => { if (acceptForTenant(e)) emit(tenantId, e) }
  const onProof: (e: ProofStateChangedEvent) => void = (e) => { if (acceptForTenant(e)) emit(tenantId, e) }
  const onWfState: (e: WorkflowInstanceStateChangedEvent) => void = (e) => { if (acceptForTenant(e)) emit(tenantId, e as any) }
  const onWfStatus: (e: WorkflowInstanceStatusChangedEvent) => void = (e) => { if (acceptForTenant(e)) emit(tenantId, e as any) }
  const onWfDone: (e: WorkflowInstanceCompletedEvent) => void = (e) => { if (acceptForTenant(e)) emit(tenantId, e as any) }
  const onSigning: (e: SigningStateChangedEvent) => void = (e) => { if (acceptForTenant(e)) emit(tenantId, e as any) }
  // WebRTC events (DIDComm signaling)
  const onRtcOffer = (e: any) => {
    if (!acceptForTenant(e)) return
    // Enrich payload with commonly used fields for UI
    try {
      const ctx = (e as any)?.payload?.context
      const conn = ctx?.connection
      const enriched = {
        ...e.payload,
        connectionId: conn?.id,
        theirLabel: conn?.theirLabel,
        theirDid: conn?.theirDid,
        createdAt: new Date().toISOString(),
      }
      emit(tenantId, { type: 'WebRTCIncomingOffer', payload: enriched } as any)
    } catch {
      emit(tenantId, { type: 'WebRTCIncomingOffer', payload: (e as any).payload } as any)
    }
  }
  const onRtcAnswer = (e: any) => { if (acceptForTenant(e)) emit(tenantId, { type: 'WebRTCIncomingAnswer', payload: e.payload } as any) }
  const onRtcIce = (e: any) => { if (acceptForTenant(e)) emit(tenantId, { type: 'WebRTCIncomingIce', payload: e.payload } as any) }
  const onRtcEnd = (e: any) => { if (acceptForTenant(e)) emit(tenantId, { type: 'WebRTCCallEnded', payload: e.payload } as any) }
  // POE (Proof of Execution) events
  const onPoeStateChanged = (e: any) => {
    if (!acceptForTenant(e)) return
    const record = e?.payload?.poeRecord
    emit(tenantId, {
      type: 'PoeStateChanged',
      payload: {
        id: record?.id,
        sessionId: record?.sessionId,
        state: record?.state,
        role: record?.role,
        connectionId: record?.connectionId,
        programId: record?.execution?.program_id,
      },
    } as any)
  }
  const onPoeRequestReceived = (e: any) => {
    if (!acceptForTenant(e)) return
    const record = e?.payload?.poeRecord
    emit(tenantId, {
      type: 'PoeRequestReceived',
      payload: {
        id: record?.id,
        sessionId: record?.sessionId,
        state: record?.state,
        connectionId: record?.connectionId,
        execution: record?.execution,
        bindingContext: record?.bindingContext,
      },
    } as any)
  }
  const onPoeSubmitReceived = (e: any) => {
    if (!acceptForTenant(e)) return
    const record = e?.payload?.poeRecord
    emit(tenantId, {
      type: 'PoeSubmitReceived',
      payload: {
        id: record?.id,
        sessionId: record?.sessionId,
        state: record?.state,
        verificationResult: record?.verificationResult,
        proofArtifact: record?.proofArtifact,
      },
    } as any)
  }
  const onPoeCompleted = (e: any) => {
    if (!acceptForTenant(e)) return
    const record = e?.payload?.poeRecord
    emit(tenantId, {
      type: 'PoeCompleted',
      payload: {
        id: record?.id,
        sessionId: record?.sessionId,
        state: record?.state,
        verificationResult: record?.verificationResult,
      },
    } as any)
  }
  // Repository hooks: capture BasicMessageRecord persistence as a fallback
  const onRepoSaved: (e: any) => void = (e) => {
    try {
      if (!acceptForTenant(e)) return
      const rec = e?.payload?.record
      try { console.log(`[WS] repo event RecordSaved type=${rec?.type} tenant=${tenantId}`) } catch {}
      // Only fallback if app-level received type is disabled; otherwise skip
      if (rec?.type === 'BasicMessageRecord') {
        const role = rec?.role
        const type = role === 'receiver' ? 'AppMessageReceived' : 'AppMessageSent'
        if (!isEnabled(tenantId, type as any)) {
          emit(tenantId, {
            type: BasicMessageEventTypes.BasicMessageStateChanged,
            payload: { basicMessageRecord: rec, source: 'repository' },
          } as any)
        }
      }
    } catch {}
  }
  const onAgentRecv: (e: AgentMessageReceivedEvent) => void = (e) => {
    try { console.log('[WS] AgentMessageReceived', { tenantId, type: (e as any).type }) } catch {}
    if (!acceptForTenant(e)) return
    // Only forward basic messages as AppMessageReceived
    try {
      const payload: any = (e as any)?.payload || {}
      const m: any = payload.message || {}
      const type = m['@type'] || m.type || ''
      if (String(type).includes('basicmessage/1.0/message')) {
        const connId = payload?.connection?.id
        const threadId = m['@id']
        const key = `${tenantId}:AppMessageReceived:${threadId || ''}`
        if (threadId && dedup(key)) {
          console.log(`[WS] skip send (dedup AppMessageReceived) tenant=${tenantId} key=${threadId}`)
          return
        }
        const out: NotificationPayload<any> = {
          v: 1,
          id: crypto.randomUUID(),
          type: 'AppMessageReceived' as any,
          tenantId,
          createdAt: new Date().toISOString(),
          data: {
            id: m.id || threadId,
            content: m.content,
            sentTime: m.sent_time,
            connectionId: connId,
            threadId,
            role: 'receiver',
            direction: 'received',
            source: 'agent',
          },
        }
        if (isEnabled(tenantId, out.type as any)) {
          try { console.log(`[WS] send type=${out.type} tenant=${tenantId}`) } catch {}
          bus.sendSync(tenantId, out)
        } else {
          console.log(`[WS] skip send (disabled) type=${out.type} tenant=${tenantId}`)
        }
      }
    } catch (err) {
      console.warn('[WS] AgentMessageReceived handling error', (err as Error).message)
    }
  }

  emitter.on(BasicMessageEventTypes.BasicMessageStateChanged, onBasic)
  emitter.on(CredentialEventTypes.CredentialStateChanged, onCred)
  emitter.on(ProofEventTypes.ProofStateChanged, onProof)
  emitter.on(WorkflowEventTypes.WorkflowInstanceStateChanged, onWfState as any)
  emitter.on(WorkflowEventTypes.WorkflowInstanceStatusChanged, onWfStatus as any)
  emitter.on(WorkflowEventTypes.WorkflowInstanceCompleted, onWfDone as any)
  emitter.on(SigningEventTypes.SigningStateChanged, onSigning as any)
  emitter.on(WebRTCEvents.IncomingOffer as any, onRtcOffer as any)
  emitter.on(WebRTCEvents.IncomingAnswer as any, onRtcAnswer as any)
  emitter.on(WebRTCEvents.IncomingIce as any, onRtcIce as any)
  emitter.on(WebRTCEvents.CallEnded as any, onRtcEnd as any)
  emitter.on(PoeEventTypes.PoeStateChanged as any, onPoeStateChanged as any)
  emitter.on(PoeEventTypes.PoeRequestReceived as any, onPoeRequestReceived as any)
  emitter.on(PoeEventTypes.PoeSubmitReceived as any, onPoeSubmitReceived as any)
  emitter.on(PoeEventTypes.PoeCompleted as any, onPoeCompleted as any)
  emitter.on(RepositoryEventTypes.RecordSaved, onRepoSaved as any)
  // Do not attach AgentMessageReceived; it's diagnostic only and may log context mismatches noisily.

  const detach = () => {
    try {
      emitter.off(BasicMessageEventTypes.BasicMessageStateChanged, onBasic)
      emitter.off(CredentialEventTypes.CredentialStateChanged, onCred)
      emitter.off(ProofEventTypes.ProofStateChanged, onProof)
      emitter.off(WorkflowEventTypes.WorkflowInstanceStateChanged, onWfState as any)
      emitter.off(WorkflowEventTypes.WorkflowInstanceStatusChanged, onWfStatus as any)
      emitter.off(WorkflowEventTypes.WorkflowInstanceCompleted, onWfDone as any)
      emitter.off(SigningEventTypes.SigningStateChanged, onSigning as any)
      emitter.off(RepositoryEventTypes.RecordSaved, onRepoSaved as any)
      try { emitter.off(AgentEventTypes.AgentMessageReceived, onAgentRecv as any) } catch {}
      try { emitter.off(WebRTCEvents.IncomingOffer as any, onRtcOffer as any) } catch {}
      try { emitter.off(WebRTCEvents.IncomingAnswer as any, onRtcAnswer as any) } catch {}
      try { emitter.off(WebRTCEvents.IncomingIce as any, onRtcIce as any) } catch {}
      try { emitter.off(WebRTCEvents.CallEnded as any, onRtcEnd as any) } catch {}
      try { emitter.off(PoeEventTypes.PoeStateChanged as any, onPoeStateChanged as any) } catch {}
      try { emitter.off(PoeEventTypes.PoeRequestReceived as any, onPoeRequestReceived as any) } catch {}
      try { emitter.off(PoeEventTypes.PoeSubmitReceived as any, onPoeSubmitReceived as any) } catch {}
      try { emitter.off(PoeEventTypes.PoeCompleted as any, onPoeCompleted as any) } catch {}
      try { console.log(`[WS] detached event producers for tenant=${tenantId}`) } catch {}
    } catch {}
  }
  detachMap.set(tenantId, detach)
  refCount.set(tenantId, 1)
  try { console.log(`[WS] attached producers and set refCount tenant=${tenantId} -> 1`) } catch {}

  // No initial test event on connection; producers are attached silently
}

export function onSocketDisconnected(tenantId: string) {
  const current = refCount.get(tenantId) ?? 0
  if (current <= 1) {
    refCount.delete(tenantId)
    const detach = detachMap.get(tenantId)
    detachMap.delete(tenantId)
    try {
      detach?.()
      console.log(`[WS] refCount->0; detached producers tenant=${tenantId}`)
    } catch {}
  } else {
    refCount.set(tenantId, current - 1)
    try { console.log(`[WS] decremented refCount tenant=${tenantId} -> ${current - 1}`) } catch {}
  }
}
