/**
 * Unit tests for CacheStore
 * Tests in-memory fallback mode (no Redis required)
 */

import { CacheStore } from '../../services/redis/cacheStore'

interface CachedData {
  publicKeyMultibase: string
  vmId: string
}

describe('CacheStore', () => {
  let cache: CacheStore<CachedData>

  beforeEach(() => {
    cache = new CacheStore<CachedData>({
      prefix: 'test:cache:',
      defaultTtlSeconds: 60
    })
  })

  describe('set and get', () => {
    it('should store and retrieve a cached value', async () => {
      const data: CachedData = {
        publicKeyMultibase: 'z6MkpTHR8VNs',
        vmId: 'did:web:example.com#key-0'
      }

      await cache.set('tenant1', data)
      const result = await cache.get('tenant1')

      expect(result).toEqual(data)
    })

    it('should return null for cache miss', async () => {
      const result = await cache.get('nonexistent')
      expect(result).toBeNull()
    })
  })

  describe('getOrSet', () => {
    it('should return existing cached value without calling compute', async () => {
      const existingData: CachedData = {
        publicKeyMultibase: 'existing-key',
        vmId: 'existing-vm'
      }
      await cache.set('tenant2', existingData)

      const computeFn = jest.fn().mockResolvedValue({
        publicKeyMultibase: 'new-key',
        vmId: 'new-vm'
      })

      const result = await cache.getOrSet('tenant2', computeFn)

      expect(result).toEqual(existingData)
      expect(computeFn).not.toHaveBeenCalled()
    })

    it('should compute and cache value on cache miss', async () => {
      const newData: CachedData = {
        publicKeyMultibase: 'computed-key',
        vmId: 'computed-vm'
      }
      const computeFn = jest.fn().mockResolvedValue(newData)

      const result = await cache.getOrSet('tenant3', computeFn)

      expect(result).toEqual(newData)
      expect(computeFn).toHaveBeenCalledTimes(1)

      // Verify it was cached
      const cached = await cache.get('tenant3')
      expect(cached).toEqual(newData)
    })

    it('should use provided TTL', async () => {
      const data: CachedData = {
        publicKeyMultibase: 'short-ttl',
        vmId: 'short-vm'
      }
      const computeFn = jest.fn().mockResolvedValue(data)

      await cache.getOrSet('shortTtl', computeFn, 1) // 1 second TTL

      expect(await cache.get('shortTtl')).toEqual(data)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(await cache.get('shortTtl')).toBeNull()
    })
  })

  describe('invalidate', () => {
    it('should invalidate a cached value', async () => {
      const data: CachedData = {
        publicKeyMultibase: 'to-invalidate',
        vmId: 'invalidate-vm'
      }
      await cache.set('toInvalidate', data)

      expect(await cache.get('toInvalidate')).toEqual(data)

      await cache.invalidate('toInvalidate')

      expect(await cache.get('toInvalidate')).toBeNull()
    })

    it('should handle invalidating non-existent key gracefully', async () => {
      // Should not throw
      await cache.invalidate('nonexistent')
    })
  })

  describe('invalidateAll', () => {
    it('should invalidate all cached values with prefix', async () => {
      await cache.set('item1', { publicKeyMultibase: 'key1', vmId: 'vm1' })
      await cache.set('item2', { publicKeyMultibase: 'key2', vmId: 'vm2' })
      await cache.set('item3', { publicKeyMultibase: 'key3', vmId: 'vm3' })

      expect(await cache.get('item1')).not.toBeNull()
      expect(await cache.get('item2')).not.toBeNull()
      expect(await cache.get('item3')).not.toBeNull()

      await cache.invalidateAll()

      expect(await cache.get('item1')).toBeNull()
      expect(await cache.get('item2')).toBeNull()
      expect(await cache.get('item3')).toBeNull()
    })
  })

  describe('TTL expiration', () => {
    it('should expire values after TTL', async () => {
      const shortTtlCache = new CacheStore<CachedData>({
        prefix: 'test:expiry:',
        defaultTtlSeconds: 1
      })

      await shortTtlCache.set('expiring', {
        publicKeyMultibase: 'expiring-key',
        vmId: 'expiring-vm'
      })

      expect(await shortTtlCache.get('expiring')).not.toBeNull()

      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(await shortTtlCache.get('expiring')).toBeNull()
    })
  })

  describe('cleanup', () => {
    it('should clean up expired entries', async () => {
      const shortTtlCache = new CacheStore<CachedData>({
        prefix: 'test:cleanup:',
        defaultTtlSeconds: 1
      })

      await shortTtlCache.set('expiring', { publicKeyMultibase: 'exp', vmId: 'exp' })
      await shortTtlCache.set('valid', { publicKeyMultibase: 'valid', vmId: 'valid' }, 60)

      await new Promise(resolve => setTimeout(resolve, 1100))

      shortTtlCache.cleanup()

      expect(await shortTtlCache.get('expiring')).toBeNull()
      expect(await shortTtlCache.get('valid')).not.toBeNull()
    })
  })
})

describe('Pre-configured cacheStores', () => {
  // Import the pre-configured stores
  const { cacheStores } = require('../../services/redis/cacheStore')

  it('should have keyBindings store configured', () => {
    expect(cacheStores.keyBindings).toBeInstanceOf(CacheStore)
  })

  it('should have issuerCertificates store configured', () => {
    expect(cacheStores.issuerCertificates).toBeInstanceOf(CacheStore)
  })

  it('should have mdlCertificates store configured', () => {
    expect(cacheStores.mdlCertificates).toBeInstanceOf(CacheStore)
  })
})
