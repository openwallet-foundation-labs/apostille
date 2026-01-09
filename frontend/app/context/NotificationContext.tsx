'use client'

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { WsNotification } from '../../lib/notifications/types'
import { connectNotifications } from '../../lib/notifications/client'
import { useAuth } from './AuthContext'
import { toast } from 'react-toastify'

type Ctx = {
  connected: boolean
  notifications: WsNotification<any>[]
  unread: number
  clear: () => void
}

const NotificationContext = createContext<Ctx | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth()
  const [connected, setConnected] = useState(false)
  const [items, setItems] = useState<WsNotification<any>[]>([])
  const connRef = useRef<{ close: () => void } | null>(null)

  useEffect(() => {
    // Close any existing connection when token changes or disappears
    // eslint-disable-next-line no-console
    console.log('[WS] NotificationProvider token', token ? 'present' : 'absent')
    if (!token) {
      connRef.current?.close()
      connRef.current = null
      setConnected(false)
      setItems([])
      return
    }

    const conn = connectNotifications(token, (n) => {
      // eslint-disable-next-line no-console
      console.log('[WS] onEvent', n)
      setItems((prev) => [n, ...prev].slice(0, 200))
      try {
        const t = String(n.type)
        if (t === 'AppMessageReceived') {
          const c = n?.data?.content || '(no content)'
          toast.info(`New message: ${c}`)
        } else if (t === 'AppMessageSent') {
          const c = n?.data?.content || '(no content)'
          toast.info(`Message sent: ${c}`)
        } else if (t.includes('Workflow')) {
          const state = n?.data?.newState || n?.data?.state || ''
          toast.info(`Workflow updated: ${state}`)
        } else if (t.includes('Signing')) {
          const state = n?.data?.sessionRecord?.state || n?.data?.state || ''
          const role = n?.data?.sessionRecord?.role || n?.data?.role || ''

          // Show different messages based on state and role
          if (state === 'request-received' && role === 'signer') {
            toast.info('📝 New signing request received')
          } else if (state === 'consent-received' && role === 'requester') {
            toast.success('✅ Signer consented to sign')
          } else if (state === 'signature-received' && role === 'requester') {
            toast.success('🎉 Document signed! Ready to complete.')
          } else if (state === 'completed') {
            toast.success('✓ Signing session completed')
          } else if (state === 'declined') {
            toast.warning('⚠ Signing request declined')
          } else {
            toast.info(`Signing: ${state}`)
          }
        } else {
          toast.info(`[${t}] event`)
        }
      } catch {}
    })
    connRef.current = conn
    setConnected(true)

    return () => {
      conn.close()
      setConnected(false)
    }
  }, [token])

  const value = useMemo<Ctx>(() => ({
    connected,
    notifications: items,
    unread: items.length,
    clear: () => setItems([]),
  }), [connected, items])

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
