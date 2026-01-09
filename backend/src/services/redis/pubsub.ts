/**
 * PubSub - Distributed pub/sub with Redis + local fallback
 *
 * Use this for broadcasting messages across pods:
 * - WebSocket notifications to all connected clients
 * - Event propagation across instances
 *
 * When Redis is available:
 * - Messages are published to Redis channels
 * - All pods subscribe and forward to their local WebSocket clients
 *
 * When Redis is not available:
 * - Messages are delivered locally only (single-pod mode)
 */

import { createClient, RedisClientType } from 'redis'
import { getRedisClient, isRedisAvailable } from './redisClient'
import { EventEmitter } from 'events'

type MessageHandler<T> = (channel: string, message: T) => void

class PubSubManager {
  private subscriber: RedisClientType | null = null
  private publisher: RedisClientType | null = null
  private localEmitter = new EventEmitter()
  private subscriptions = new Map<string, Set<MessageHandler<any>>>()
  // Track wrapper functions for proper unsubscribe from localEmitter
  private localWrappers = new Map<MessageHandler<any>, (message: any) => void>()
  private isInitialized = false

  /**
   * Initialize the PubSub system
   * Should be called after Redis is connected
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    const redisUrl = process.env.REDIS_URL
    if (!redisUrl || !isRedisAvailable()) {
      console.log('[PubSub] Redis not available - using local-only mode')
      this.isInitialized = true
      return
    }

    try {
      // Create dedicated subscriber and publisher clients
      // Subscriber client is in subscribe mode and can't be used for other commands
      this.subscriber = createClient({ url: redisUrl })
      this.publisher = getRedisClient()

      this.subscriber.on('error', (err) => {
        console.error('[PubSub] Subscriber error:', err.message)
      })

      await this.subscriber.connect()
      console.log('[PubSub] Redis PubSub initialized')
      this.isInitialized = true
    } catch (error) {
      console.error('[PubSub] Failed to initialize:', (error as Error).message)
      console.log('[PubSub] Falling back to local-only mode')
      this.subscriber = null
      this.publisher = null
      this.isInitialized = true
    }
  }

  /**
   * Subscribe to a channel
   */
  async subscribe<T = any>(channel: string, handler: MessageHandler<T>): Promise<void> {
    // Track local handlers
    let handlers = this.subscriptions.get(channel)
    if (!handlers) {
      handlers = new Set()
      this.subscriptions.set(channel, handlers)
    }
    handlers.add(handler)

    // If Redis is available, also subscribe there
    if (this.subscriber && this.isInitialized) {
      try {
        await this.subscriber.subscribe(channel, (message) => {
          try {
            const parsed = JSON.parse(message) as T
            // Notify all handlers for this channel
            const channelHandlers = this.subscriptions.get(channel)
            if (channelHandlers) {
              for (const h of channelHandlers) {
                try {
                  h(channel, parsed)
                } catch (err) {
                  console.error('[PubSub] Handler error:', (err as Error).message)
                }
              }
            }
          } catch (err) {
            console.error('[PubSub] Failed to parse message:', (err as Error).message)
          }
        })
      } catch (err) {
        console.error('[PubSub] Redis subscribe error:', (err as Error).message)
      }
    }

    // Also listen locally (for single-pod mode)
    // Store the wrapper so we can properly unsubscribe later
    const wrapper = (message: T) => {
      handler(channel, message)
    }
    this.localWrappers.set(handler, wrapper)
    this.localEmitter.on(channel, wrapper)
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe<T = any>(channel: string, handler: MessageHandler<T>): Promise<void> {
    const handlers = this.subscriptions.get(channel)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.subscriptions.delete(channel)

        // Unsubscribe from Redis if no more handlers
        if (this.subscriber && this.isInitialized) {
          try {
            await this.subscriber.unsubscribe(channel)
          } catch (err) {
            console.error('[PubSub] Redis unsubscribe error:', (err as Error).message)
          }
        }
      }
    }

    // Remove the wrapper from localEmitter
    const wrapper = this.localWrappers.get(handler)
    if (wrapper) {
      this.localEmitter.off(channel, wrapper)
      this.localWrappers.delete(handler)
    }
  }

  /**
   * Publish a message to a channel
   * If Redis is available, broadcasts to all pods
   * Otherwise, only local delivery
   */
  async publish<T = any>(channel: string, message: T): Promise<void> {
    if (this.publisher && isRedisAvailable()) {
      try {
        await this.publisher.publish(channel, JSON.stringify(message))
        // Don't emit locally - Redis subscriber will receive it
        return
      } catch (err) {
        console.error('[PubSub] Redis publish error:', (err as Error).message)
        // Fall through to local emit
      }
    }

    // Local-only delivery
    this.localEmitter.emit(channel, message)
  }

  /**
   * Close the PubSub connections
   */
  async close(): Promise<void> {
    if (this.subscriber) {
      try {
        await this.subscriber.quit()
      } catch (err) {
        console.error('[PubSub] Error closing subscriber:', (err as Error).message)
      }
    }
    this.subscriber = null
    this.publisher = null
    this.subscriptions.clear()
    this.localWrappers.clear()
    this.localEmitter.removeAllListeners()
    this.isInitialized = false
  }
}

// Singleton instance
export const pubsub = new PubSubManager()

/**
 * Channel names for common use cases
 */
export const channels = {
  /** Notifications for a specific tenant */
  tenantNotifications: (tenantId: string) => `notifications:${tenantId}`,

  /** Broadcast to all connected clients */
  broadcast: 'notifications:broadcast',
}
