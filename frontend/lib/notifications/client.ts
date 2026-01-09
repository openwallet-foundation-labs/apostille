'use client'

import { runtimeConfig } from '../runtimeConfig'
import type { WsNotification } from './types'

export type OnEvent = (n: WsNotification<any>) => void

export function connectNotifications(token: string, onEvent: OnEvent) {
  const base = runtimeConfig.API_URL || ''
  // Prefer token via query param to avoid subprotocol negotiation issues
  const wsUrl = base.replace(/^http/, 'ws') + '/ws?token=' + encodeURIComponent(token)
  const ws = new WebSocket(wsUrl)
  ws.onopen = () => {
    // eslint-disable-next-line no-console
    console.log('[WS] open', wsUrl)
    try {
      const ping = { v: 1, type: 'client.ping', at: new Date().toISOString() }
      ws.send(JSON.stringify(ping))
      // eslint-disable-next-line no-console
      console.log('[WS] sent', ping)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[WS] send failed', e)
    }
  }
  ws.onerror = (e) => {
    // eslint-disable-next-line no-console
    console.log('[WS] error', e)
  }
  ws.onclose = (e) => {
    // eslint-disable-next-line no-console
    console.log('[WS] close', e.code, e.reason)
  }

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data as string) as WsNotification<any>
      // Debug to verify event flow
      // eslint-disable-next-line no-console
      console.log('[WS] event', data)
      if (data && data.v === 1 && data.type) onEvent(data)
    } catch {}
  }

  return {
    close: () => {
      try { ws.close() } catch {}
    },
  }
}
