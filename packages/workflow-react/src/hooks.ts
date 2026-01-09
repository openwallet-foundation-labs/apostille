import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { WorkflowStatus } from '@ajna-inc/workflow-client'
import { useWorkflowClient } from './context'
import { useUiProfile } from './context'

export function useWorkflowStatus(
  instanceId?: string,
  opts?: { pollMs?: number; includeActions?: boolean; connectionId?: string; viewerDid?: string }
) {
  const client = useWorkflowClient()
  const { uiProfile } = useUiProfile()
  const [status, setStatus] = useState<WorkflowStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollMs = opts?.pollMs ?? 0
  const timer = useRef<NodeJS.Timeout | null>(null)

  const load = useCallback(async () => {
    if (!instanceId) return
    setLoading(true)
    setError(null)
    try {
      const resp = await client.status(instanceId, {
        includeUi: true,
        includeActions: opts?.includeActions !== false,
        uiProfile,
        connectionId: opts?.connectionId,
        viewerDid: opts?.viewerDid,
      })
      setStatus(resp.status)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [client, instanceId, uiProfile, opts?.includeActions, opts?.connectionId, opts?.viewerDid])

  useEffect(() => {
    if (!instanceId) return
    void load()
    if (pollMs > 0) {
      timer.current && clearInterval(timer.current)
      timer.current = setInterval(() => void load(), pollMs)
      return () => {
        timer.current && clearInterval(timer.current)
      }
    }
  }, [instanceId, load, pollMs])

  return { status, loading, error, refresh: load }
}

export function useAdvance(instanceId?: string) {
  const client = useWorkflowClient()
  const advance = useCallback(
    async (event: string, input?: Record<string, unknown>) => {
      if (!instanceId) throw new Error('instanceId required')
      const idempotency_key = `ui:${event}:${instanceId}:${Date.now()}`
      await client.advance({ instance_id: instanceId, event, idempotency_key, input })
    },
    [client, instanceId]
  )
  return { advance }
}
