/**
 * CacheStore - Distributed caching with Redis + in-memory fallback
 *
 * Use this for cached data that can be regenerated if lost:
 * - DID key bindings
 * - Issuer certificates
 * - Any expensive-to-compute data
 *
 * Unlike StateStore, cache misses are expected and handled gracefully
 */

import { getRedisClient, isRedisAvailable } from './redisClient'

export interface CacheStoreOptions {
  /** Key prefix for namespacing (e.g., 'cache:keybinding:') */
  prefix: string
  /** Default TTL in seconds (default: 1 hour) */
  defaultTtlSeconds?: number
}

export class CacheStore<T> {
  private prefix: string
  private defaultTtl: number
  private memoryCache: Map<string, { data: T; expiresAt: number }> = new Map()

  constructor(options: CacheStoreOptions) {
    this.prefix = options.prefix
    this.defaultTtl = options.defaultTtlSeconds || 3600
  }

  private getKey(id: string): string {
    return `${this.prefix}${id}`
  }

  /**
   * Get a cached value, or compute and cache it if missing
   */
  async getOrSet(
    id: string,
    compute: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const existing = await this.get(id)
    if (existing !== null) {
      return existing
    }

    const value = await compute()
    await this.set(id, value, ttlSeconds)
    return value
  }

  /**
   * Get a cached value
   */
  async get(id: string): Promise<T | null> {
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      const data = await client.get(key)
      return data ? JSON.parse(data) : null
    } else {
      const entry = this.memoryCache.get(key)
      if (!entry) return null
      if (Date.now() > entry.expiresAt) {
        this.memoryCache.delete(key)
        return null
      }
      return entry.data
    }
  }

  /**
   * Set a cached value
   */
  async set(id: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtl
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      await client.setEx(key, ttl, JSON.stringify(value))
    } else {
      const expiresAt = Date.now() + ttl * 1000
      this.memoryCache.set(key, { data: value, expiresAt })
    }
  }

  /**
   * Invalidate a cached value
   */
  async invalidate(id: string): Promise<void> {
    const key = this.getKey(id)

    if (isRedisAvailable()) {
      const client = getRedisClient()!
      await client.del(key)
    } else {
      this.memoryCache.delete(key)
    }
  }

  /**
   * Invalidate all cached values with this prefix
   */
  async invalidateAll(): Promise<void> {
    if (isRedisAvailable()) {
      const client = getRedisClient()!
      const keys = await client.keys(`${this.prefix}*`)
      if (keys.length > 0) {
        await client.del(keys)
      }
    } else {
      for (const key of this.memoryCache.keys()) {
        if (key.startsWith(this.prefix)) {
          this.memoryCache.delete(key)
        }
      }
    }
  }

  /**
   * Cleanup expired entries (only needed for in-memory mode)
   */
  cleanup(): void {
    if (!isRedisAvailable()) {
      const now = Date.now()
      for (const [key, entry] of this.memoryCache.entries()) {
        if (now > entry.expiresAt) {
          this.memoryCache.delete(key)
        }
      }
    }
  }
}

/**
 * Pre-configured cache stores for common use cases
 */
export const cacheStores = {
  keyBindings: new CacheStore<{ publicKeyMultibase: string; vmId: string }>({
    prefix: 'cache:keybinding:',
    defaultTtlSeconds: 3600, // 1 hour
  }),

  issuerCertificates: new CacheStore<{
    issuerKey: any
    issuerCertificate: any
    certificateBase64: string
    iacaCertificateBase64?: string
  }>({
    prefix: 'cache:issuer-cert:',
    defaultTtlSeconds: 86400, // 24 hours
  }),

  mdlCertificates: new CacheStore<any>({
    prefix: 'cache:mdl-cert:',
    defaultTtlSeconds: 86400, // 24 hours
  }),
}
