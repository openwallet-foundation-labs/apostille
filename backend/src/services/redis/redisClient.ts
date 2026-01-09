/**
 * Redis Client with graceful fallback to in-memory storage
 *
 * This module provides a Redis client that falls back to in-memory storage
 * when Redis is not available. This allows the application to work in both
 * single-pod (local dev) and multi-pod (production) scenarios.
 */

import { createClient, RedisClientType } from 'redis'

export type RedisClient = RedisClientType

let client: RedisClient | null = null
let isConnected = false
let connectionAttempted = false

/**
 * Get the Redis client instance
 * Returns null if Redis is not configured or not connected
 */
export function getRedisClient(): RedisClient | null {
  return isConnected ? client : null
}

/**
 * Check if Redis is available
 */
export function isRedisAvailable(): boolean {
  return isConnected
}

/**
 * Initialize Redis connection
 * Call this once at application startup
 */
export async function initializeRedis(): Promise<boolean> {
  if (connectionAttempted) {
    return isConnected
  }
  connectionAttempted = true

  const redisUrl = process.env.REDIS_URL

  if (!redisUrl) {
    console.log('[Redis] REDIS_URL not configured - using in-memory fallback')
    return false
  }

  try {
    client = createClient({ url: redisUrl })

    client.on('error', (err) => {
      console.error('[Redis] Client error:', err.message)
      isConnected = false
    })

    client.on('connect', () => {
      console.log('[Redis] Connected')
      isConnected = true
    })

    client.on('disconnect', () => {
      console.log('[Redis] Disconnected')
      isConnected = false
    })

    client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...')
    })

    await client.connect()
    isConnected = true
    console.log('[Redis] Successfully connected to Redis')
    return true
  } catch (error) {
    console.error('[Redis] Failed to connect:', (error as Error).message)
    console.log('[Redis] Using in-memory fallback')
    isConnected = false
    return false
  }
}

/**
 * Gracefully close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (client && isConnected) {
    try {
      await client.quit()
      console.log('[Redis] Connection closed')
    } catch (error) {
      console.error('[Redis] Error closing connection:', (error as Error).message)
    }
  }
  isConnected = false
  client = null
  connectionAttempted = false
}
