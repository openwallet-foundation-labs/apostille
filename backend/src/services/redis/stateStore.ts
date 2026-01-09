/**
 * StateStore - Distributed state storage with Redis + in-memory fallback
 *
 * Use this for session-like data that needs to be shared across pods:
 * - OID4VCI pending offers
 * - OID4VP verification sessions
 * - Any temporary state that expires
 */

import { getRedisClient, isRedisAvailable } from './redisClient'

export interface StateStoreOptions {
  /** Key prefix for namespacing (e.g., 'oid4vci:offers:') */
  prefix: string
  /** Default TTL in seconds */
  defaultTtlSeconds?: number
}

export class StateStore<T> {
  private prefix: string
  private defaultTtl: number
  private memoryStore: Map<string, { data: T; expiresAt: number }> = new Map()

  constructor(options: StateStoreOptions) {
    this.prefix = options.prefix
    this.defaultTtl = options.defaultTtlSeconds || 3600 // 1 hour default
  }

  private getKey(id: string): string {
    return `${this.prefix}${id}`
  }

  /**
   * Store a value with optional TTL
   */
  async set(id: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      await client.setEx(key, ttl, JSON.stringify(value))
    } else {
      // In-memory fallback with expiration
      const expiresAt = Date.now() + ttl * 1000
      this.memoryStore.set(key, { data: value, expiresAt })
    }
  }

  /**
   * Get a value by ID
   */
  async get(id: string): Promise<T | null> {
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      const data = await client.get(key)
      return data ? JSON.parse(data) : null
    } else {
      // In-memory fallback
      const entry = this.memoryStore.get(key)
      if (!entry) return null

      // Check expiration
      if (Date.now() > entry.expiresAt) {
        this.memoryStore.delete(key)
        return null
      }
      return entry.data
    }
  }

  /**
   * Delete a value by ID
   */
  async delete(id: string): Promise<boolean> {
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      const result = await client.del(key)
      return result > 0
    } else {
      return this.memoryStore.delete(key)
    }
  }

  /**
   * Check if a value exists
   */
  async exists(id: string): Promise<boolean> {
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      const result = await client.exists(key)
      return result > 0
    } else {
      const entry = this.memoryStore.get(key)
      if (!entry) return false
      if (Date.now() > entry.expiresAt) {
        this.memoryStore.delete(key)
        return false
      }
      return true
    }
  }

  /**
   * Update a value (get + modify + set atomically in Redis)
   */
  async update(id: string, updater: (current: T | null) => T | null): Promise<T | null> {
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      // Use WATCH for optimistic locking
      await client.watch(key)
      try {
        const current = await this.get(id)
        const updated = updater(current)

        if (updated === null) {
          await client.del(key)
          return null
        }

        const multi = client.multi()
        multi.setEx(key, this.defaultTtl, JSON.stringify(updated))
        await multi.exec()
        return updated
      } catch (error) {
        await client.unwatch()
        throw error
      }
    } else {
      const current = await this.get(id)
      const updated = updater(current)
      if (updated === null) {
        await this.delete(id)
        return null
      }
      await this.set(id, updated)
      return updated
    }
  }

  /**
   * Find by custom predicate (expensive - use sparingly)
   * In Redis, this scans all keys with the prefix
   */
  async findOne(predicate: (value: T) => boolean): Promise<T | null> {
    if (isRedisAvailable()) {
      const client = getRedisClient()!
      const keys = await client.keys(`${this.prefix}*`)
      for (const key of keys) {
        const data = await client.get(key)
        if (data) {
          const value = JSON.parse(data) as T
          if (predicate(value)) return value
        }
      }
      return null
    } else {
      const now = Date.now()
      for (const [key, entry] of this.memoryStore.entries()) {
        if (!key.startsWith(this.prefix)) continue
        if (now > entry.expiresAt) {
          this.memoryStore.delete(key)
          continue
        }
        if (predicate(entry.data)) return entry.data
      }
      return null
    }
  }

  /**
   * Get all values (expensive - use sparingly)
   */
  async getAll(): Promise<T[]> {
    if (isRedisAvailable()) {
      const client = getRedisClient()!
      const keys = await client.keys(`${this.prefix}*`)
      const results: T[] = []
      for (const key of keys) {
        const data = await client.get(key)
        if (data) results.push(JSON.parse(data))
      }
      return results
    } else {
      const now = Date.now()
      const results: T[] = []
      for (const [key, entry] of this.memoryStore.entries()) {
        if (!key.startsWith(this.prefix)) continue
        if (now > entry.expiresAt) {
          this.memoryStore.delete(key)
          continue
        }
        results.push(entry.data)
      }
      return results
    }
  }

  /**
   * Cleanup expired entries (only needed for in-memory mode)
   * Redis handles expiration automatically
   */
  cleanup(): void {
    if (!isRedisAvailable()) {
      const now = Date.now()
      for (const [key, entry] of this.memoryStore.entries()) {
        if (now > entry.expiresAt) {
          this.memoryStore.delete(key)
        }
      }
    }
  }
}
