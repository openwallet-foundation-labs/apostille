import http from 'http'
import url from 'url'
import jwt from 'jsonwebtoken'
import { Server as WsServer } from 'ws'
import type WebSocket from 'ws'
import { bus } from '../notifications/bus'
import { setEnableRule } from '../notifications/registry'
import { getAgent } from './agentService'
import { onSocketConnected, onSocketDisconnected } from './tenantSubscriptions'
import { jwtConfig } from '../config/jwt'

type DecodedToken = { tenantId?: string; [k: string]: unknown }

export class SocketGateway {
  private wss: WsServer
  private readonly path: string
  private readonly pingInterval: number
  private heartbeat?: NodeJS.Timer

  constructor(opts?: { path?: string; pingIntervalMs?: number }) {
    this.path = opts?.path ?? '/ws'
    this.pingInterval = opts?.pingIntervalMs ?? 30000
    this.wss = new WsServer({ noServer: true })
    this.wss.on('connection', (ws: WebSocket & { _tenantId?: string }, request) => {
      // Attach basic close handling
      ws.on('close', () => {
        if (ws._tenantId) {
          bus.disconnect(ws._tenantId, ws)
          onSocketDisconnected(ws._tenantId)
        }
      })
      // Log incoming client messages (for diagnostics)
      ws.on('message', (data) => {
        try {
          let buf: Buffer
          if (Buffer.isBuffer(data)) buf = data
          else if (Array.isArray(data)) buf = Buffer.concat(data as any)
          else if (data instanceof ArrayBuffer) buf = Buffer.from(data as ArrayBuffer)
          else buf = Buffer.from(String(data))
          const preview = buf.toString('utf8').slice(0, 200)
          console.log('[WS] recv', { tenantId: ws._tenantId, bytes: buf.length, preview })
        } catch {}
      })
      // Mark alive for heartbeat
      ;(ws as any).isAlive = true
      ws.on('pong', () => {
        ;(ws as any).isAlive = true
      })
    })
  }

  attach(server: http.Server) {
    server.on('upgrade', (request, socket, head) => {
      const { pathname, query } = url.parse(request.url || '', true)
      try { console.log(`[WS] upgrade url=${request.url} path=${pathname}`) } catch {}
      if (pathname !== this.path) return

      const token = this.extractToken(request, query)
      if (!token) {
        try { console.warn('[WS] upgrade rejected: missing token') } catch {}
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      let decoded: DecodedToken
      try {
        decoded = jwt.verify(token, jwtConfig.secret) as DecodedToken
      } catch {
        try { console.warn('[WS] upgrade rejected: invalid token (jwt verify failed)') } catch {}
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
      const tenantId = decoded?.tenantId
      if (!tenantId) {
        try { console.warn('[WS] upgrade rejected: token missing tenantId') } catch {}
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }

      this.wss.handleUpgrade(request, socket, head, (ws: WebSocket & { _tenantId?: string }) => {
        ws._tenantId = tenantId
        bus.connect(tenantId, ws)
        try { console.log(`[WS] connected tenant=${tenantId}`) } catch {}
        ws.on('error', (err) => {
          try { console.warn('[WS] socket error', { tenantId, err: (err as Error).message }) } catch {}
        })
        this.wss.emit('connection', ws, request)
        // Attach producers on first active socket with retries
        const tryAttach = async (attempt = 1) => {
          try {
            const agent = await getAgent({ tenantId })
            await onSocketConnected(tenantId, agent)
            try { console.log(`[WS] producers attached tenant=${tenantId}`) } catch {}
          } catch (e) {
            const msg = (e as Error)?.message || String(e)
            const stack = (e as Error)?.stack
            const max = 3
            const delay = 500 * attempt
            console.warn('[WS] attach failed', { tenantId, attempt, error: msg, stack })
            // Retry a few times before closing
            if (attempt < max) {
              setTimeout(() => void tryAttach(attempt + 1), delay)
            } else {
              try {
                console.error('[WS] attach giving up, closing socket', { tenantId, error: msg })
                ;(ws as any).close?.(4001, 'agent-init-failed')
              } catch {}
            }
          }
        }
        void tryAttach()
      })
    })

    // Heartbeat to cleanup dead sockets
    this.heartbeat = setInterval(() => {
      for (const client of this.wss.clients as Set<(WebSocket & { isAlive?: boolean; _tenantId?: string })>) {
        if (client.isAlive === false) {
          try {
            if (client._tenantId) bus.disconnect(client._tenantId, client)
            if (client._tenantId) onSocketDisconnected(client._tenantId)
            client.terminate()
          } catch {}
          continue
        }
        client.isAlive = false as any
        try {
          client.ping()
        } catch {}
      }
    }, this.pingInterval)

    // Optional: per-tenant enable rule placeholder
    setEnableRule((_tenantId, _type) => {
      // Keep enabled by default; overridable via registry/env
      return true
    })
  }

  private extractToken(request: http.IncomingMessage, query: any): string | null {
    const auth = request.headers['authorization']
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      return auth.slice('bearer '.length)
    }
    if (query && typeof query['token'] === 'string') return query['token']
    const proto = request.headers['sec-websocket-protocol']
    if (typeof proto === 'string') {
      const parts = proto.split(',').map((s) => s.trim())
      if (parts[0] && parts[0].toLowerCase() === 'bearer' && parts[1]) return parts[1]
      if (parts.length === 1 && parts[0].length > 20) return parts[0]
    }
    return null
  }
}

export function createSocketGateway(server: http.Server) {
  const gw = new SocketGateway({ path: process.env.WS_PATH || '/ws', pingIntervalMs: Number(process.env.WS_PING_INTERVAL_MS || 30000) })
  gw.attach(server)
}
