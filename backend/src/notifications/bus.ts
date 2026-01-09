import type WebSocket from 'ws'
import type { NotificationType, NotificationPayload } from './types'
import { pubsub, channels } from '../services/redis/pubsub'
import { isRedisAvailable } from '../services/redis/redisClient'

type TenantId = string

class NotificationBus {
  private tenants: Map<TenantId, Set<WebSocket>> = new Map()
  private initialized = false
  private subscribedTenants: Set<string> = new Set()

  /**
   * Initialize Redis pub/sub subscriptions
   * Call this after Redis is initialized
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialized = true

    if (!isRedisAvailable()) {
      console.log('[NotificationBus] Redis not available - using local-only mode')
      return
    }

    console.log('[NotificationBus] Initialized with Redis pub/sub support')
  }

  /**
   * Subscribe to Redis channel for a tenant (if not already subscribed)
   */
  private async ensureTenantSubscription(tenantId: TenantId): Promise<void> {
    if (!isRedisAvailable() || this.subscribedTenants.has(tenantId)) {
      return
    }

    try {
      const channel = channels.tenantNotifications(tenantId)
      await pubsub.subscribe(channel, (ch, message) => {
        // Deliver to local WebSocket connections
        this.deliverLocal(tenantId, message as NotificationPayload)
      })
      this.subscribedTenants.add(tenantId)
      console.log(`[NotificationBus] Subscribed to Redis channel: ${channel}`)
    } catch (err) {
      console.error(`[NotificationBus] Failed to subscribe to tenant ${tenantId}:`, (err as Error).message)
    }
  }

  /**
   * Deliver notification to local WebSocket connections only
   */
  private deliverLocal<T = unknown>(tenantId: TenantId, evt: NotificationPayload<T>): void {
    const set = this.tenants.get(tenantId)
    if (!set || set.size === 0) return

    const data = JSON.stringify(evt)
    for (const ws of set) {
      try {
        // 1 = OPEN
        if ((ws as any).readyState === 1) ws.send(data)
      } catch {}
    }
  }

  connect(tenantId: TenantId, ws: WebSocket) {
    const set = this.tenants.get(tenantId) ?? new Set<WebSocket>()
    set.add(ws)
    this.tenants.set(tenantId, set)
    try { console.log(`[WS] bus.connect tenant=${tenantId} size=${set.size}`) } catch {}

    // Ensure we're subscribed to this tenant's Redis channel
    this.ensureTenantSubscription(tenantId).catch(() => {})
  }

  disconnect(tenantId: TenantId, ws: WebSocket) {
    const set = this.tenants.get(tenantId)
    if (!set) return
    set.delete(ws)
    if (set.size === 0) {
      this.tenants.delete(tenantId)
      try { console.log(`[WS] bus.disconnect tenant=${tenantId} removed (empty)`) } catch {}
    } else {
      try { console.log(`[WS] bus.disconnect tenant=${tenantId} size=${set.size}`) } catch {}
    }
  }

  hasActive(tenantId: TenantId): boolean {
    return (this.tenants.get(tenantId)?.size ?? 0) > 0
  }

  listTenants(): TenantId[] {
    return Array.from(this.tenants.keys())
  }

  /**
   * Send notification to all pods via Redis pub/sub
   * If Redis is not available, falls back to local-only delivery
   */
  async send<T = unknown>(tenantId: TenantId, evt: NotificationPayload<T>): Promise<void> {
    try { console.log(`[WS] bus.send tenant=${tenantId} type=${evt.type}`) } catch {}

    if (isRedisAvailable()) {
      // Publish to Redis - all subscribed pods will receive and deliver locally
      const channel = channels.tenantNotifications(tenantId)
      await pubsub.publish(channel, evt)
    } else {
      // Local-only delivery
      this.deliverLocal(tenantId, evt)
    }
  }

  /**
   * Send notification synchronously (for backward compatibility)
   * Prefer using async send() for proper error handling
   */
  sendSync<T = unknown>(tenantId: TenantId, evt: NotificationPayload<T>): void {
    this.send(tenantId, evt).catch((err) => {
      console.error('[NotificationBus] Send failed:', (err as Error).message)
      // Fallback to local delivery
      this.deliverLocal(tenantId, evt)
    })
  }
}

export const bus = new NotificationBus()
export type { NotificationPayload, NotificationType }
