'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { WsNotification } from '../../lib/notifications/types'
import { connectNotifications } from '../../lib/notifications/client'
import { useAuth } from './AuthContext'
import { toast } from 'react-toastify'
import { connectionApi } from '@/lib/api'

// Event types that are handled by other contexts or are noise for the user
const SILENT_TYPES = new Set([
  'WebRTCIncomingAnswer',
  'WebRTCIncomingIce',
  'WebRTCCallEnded',
  'AppMessageSent', // user already knows they sent it
])

type Ctx = {
  connected: boolean
  notifications: WsNotification<any>[]        // raw stream — for internal consumers (CallContext)
  displayNotifications: WsNotification<any>[] // filtered — for bell + history UI
  unread: number
  clear: () => void
  dismiss: (id: string) => void
  resolveConnectionName: (connectionId: string) => string
  addSyntheticNotification: (n: WsNotification<any>) => void
}

const NotificationContext = createContext<Ctx | undefined>(undefined)

function handleToast(n: WsNotification<any>, resolveConnectionName: (id: string) => string) {
  const t = String(n.type)
  const d: any = n.data || {}

  if (t === 'AppMessageReceived') {
    try {
      const c = d.content || ''
      if (typeof c === 'string') {
        const parsed = JSON.parse(c)
        if (parsed?.type === 'pdf-signing-shared') {
          toast.info('PDF received for signing')
          return
        }
        if (parsed?.type === 'pdf-signing-signed-returned') {
          toast.success('Signed PDF returned')
          return
        }
        if (parsed?.type === 'pdf-signing-owner-ack') {
          toast.success('Owner acknowledged the signed PDF')
          return
        }
      }
    } catch {}
    const sender = d.connectionId ? resolveConnectionName(d.connectionId) : 'someone'
    toast.info(`Message from ${sender}`)
    return
  }

  // Credential state changes — only toast on offer-received (action needed by you)
  if (t === 'DidCommCredentialStateChanged' || t.includes('CredentialStateChanged')) {
    const state = d?.credentialRecord?.state || d?.state || ''
    if (state === 'offer-received') {
      toast.info('Credential offer received')
    }
    return
  }

  // Proof state changes — only toast on request-received (action needed by you)
  if (t === 'ProofStateChanged' || t.includes('ProofStateChanged')) {
    const state = d?.proofRecord?.state || d?.state || ''
    if (state === 'request-received') {
      toast.info('Proof request received')
    }
    return
  }

  if (t.includes('Workflow')) {
    const status = d?.newStatus || d?.status || ''
    const state = d?.newState || d?.state || ''
    if (status === 'waiting' || state === 'waiting-for-input') {
      toast.info('Workflow needs your input')
    }
    return
  }

  if (t.includes('Signing')) {
    const state = d?.sessionRecord?.state || d?.state || ''
    const role = d?.sessionRecord?.role || d?.role || ''
    if (state === 'request-received' && role === 'signer') {
      toast.info('New signing request received')
    } else if (state === 'consent-received' && role === 'requester') {
      toast.success('Signer consented to sign')
    } else if (state === 'signature-received' && role === 'requester') {
      toast.success('Document signed — ready to complete')
    } else if (state === 'completed') {
      toast.success('Signing session completed')
    } else if (state === 'declined') {
      toast.warning('Signing request declined')
    }
    return
  }

  if (t === 'PoeRequestReceived') {
    toast.info('Proof of execution request received')
    return
  }

  if (t === 'CalendarReminderTriggered') {
    const title = d?.title || d?.eventTitle || 'event'
    toast.info(`Reminder: ${title}`)
    return
  }

  if (t === 'CalendarEventStateChanged') {
    const state = d?.state || ''
    if (state === 'invited') toast.info('Calendar invite received')
    return
  }

  // All other types: store in bell history but no toast
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const [connected, setConnected] = useState(false)
  const [items, setItems] = useState<WsNotification<any>[]>([])
  const connRef = useRef<{ close: () => void } | null>(null)
  const [connectionCache, setConnectionCache] = useState<Record<string, string>>({})

  // Fetch connections once when authenticated to build name cache
  useEffect(() => {
    if (!token) {
      setConnectionCache({})
      return
    }
    connectionApi.getAll().then((res: any) => {
      if (!res?.success) return
      const all = [...(res.connections || []), ...(res.invitations || [])]
      const cache: Record<string, string> = {}
      for (const c of all) {
        if (c.id) cache[c.id] = c.theirLabel || c.label || ''
      }
      setConnectionCache(cache)
    }).catch(() => {})
  }, [token])

  const resolveConnectionName = useCallback((connectionId: string): string => {
    const label = connectionCache[connectionId]
    if (label) return label
    return `…${String(connectionId).slice(-6)}`
  }, [connectionCache])

  const addSyntheticNotification = useCallback((n: WsNotification<any>) => {
    setItems((prev) => [n, ...prev].slice(0, 200))
  }, [])

  useEffect(() => {
    if (!token) {
      connRef.current?.close()
      connRef.current = null
      setConnected(false)
      setItems([])
      return
    }

    const conn = connectNotifications(token, (n) => {
      setItems((prev) => [n, ...prev].slice(0, 200))
      try {
        const t = String(n.type)
        // WebRTC signalling events are handled entirely by CallContext — no toast
        if (t === 'WebRTCIncomingAnswer' || t === 'WebRTCIncomingIce' || t === 'WebRTCCallEnded') return
        // Incoming offer goes to bell (not SILENT_TYPES) but no toast — the call modal handles it
        if (t === 'WebRTCIncomingOffer') return
        // AppMessageSent is silent — user already knows they sent it
        if (t === 'AppMessageSent') return
        handleToast(n, resolveConnectionName)
      } catch {}
    })
    connRef.current = conn
    setConnected(true)

    return () => {
      conn.close()
      setConnected(false)
    }
  }, [token, resolveConnectionName])

  const displayNotifications = useMemo(
    () => items.filter((n) => !SILENT_TYPES.has(String(n.type))),
    [items]
  )

  const dismiss = useCallback((id: string) => {
    setItems(prev => prev.filter(n => n.id !== id))
  }, [])

  const value = useMemo<Ctx>(() => ({
    connected,
    notifications: items,
    displayNotifications,
    unread: displayNotifications.length,
    clear: () => setItems([]),
    dismiss,
    resolveConnectionName,
    addSyntheticNotification,
  }), [connected, items, displayNotifications, dismiss, resolveConnectionName, addSyntheticNotification])

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
