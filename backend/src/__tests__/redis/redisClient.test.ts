/**
 * Unit tests for Redis Client
 * Tests initialization and fallback behavior
 */

import { initializeRedis, closeRedis, isRedisAvailable, getRedisClient } from '../../services/redis/redisClient'

describe('Redis Client', () => {
  afterEach(async () => {
    // Clean up after each test
    await closeRedis()
  })

  describe('initialization without REDIS_URL', () => {
    beforeEach(() => {
      // Ensure no Redis URL is set
      delete process.env.REDIS_URL
    })

    it('should return false when REDIS_URL is not set', async () => {
      const result = await initializeRedis()
      expect(result).toBe(false)
    })

    it('should indicate Redis is not available', async () => {
      await initializeRedis()
      expect(isRedisAvailable()).toBe(false)
    })

    it('should return null for getRedisClient', async () => {
      await initializeRedis()
      expect(getRedisClient()).toBeNull()
    })
  })

  describe('closeRedis', () => {
    it('should handle closing when not connected', async () => {
      // Should not throw
      await closeRedis()
    })

    it('should reset connection state after close', async () => {
      // Initialize (will fail without Redis)
      await initializeRedis()

      // Close
      await closeRedis()

      // Can reinitialize
      const result = await initializeRedis()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isRedisAvailable', () => {
    it('should return false initially', () => {
      expect(isRedisAvailable()).toBe(false)
    })
  })
})

describe('Redis Client with connection (integration)', () => {
  const originalRedisUrl = process.env.REDIS_URL

  // Only run these tests if REDIS_URL is available
  const runIntegrationTests = !!process.env.REDIS_URL

  beforeAll(() => {
    if (!runIntegrationTests) {
      console.log('Skipping Redis integration tests - REDIS_URL not set')
    }
  })

  afterAll(async () => {
    await closeRedis()
    // Restore original REDIS_URL
    if (originalRedisUrl) {
      process.env.REDIS_URL = originalRedisUrl
    }
  })

  if (runIntegrationTests) {
    it('should connect successfully when REDIS_URL is valid', async () => {
      const result = await initializeRedis()
      expect(result).toBe(true)
      expect(isRedisAvailable()).toBe(true)
      expect(getRedisClient()).not.toBeNull()
    })

    it('should be able to set and get values', async () => {
      await initializeRedis()
      const client = getRedisClient()

      if (client) {
        const testKey = 'test:integration:key'
        const testValue = JSON.stringify({ test: 'value', timestamp: Date.now() })

        await client.setEx(testKey, 60, testValue)
        const result = await client.get(testKey)

        expect(result).toBe(testValue)

        // Cleanup
        await client.del(testKey)
      }
    })
  } else {
    it.skip('should connect successfully when REDIS_URL is valid', () => {})
    it.skip('should be able to set and get values', () => {})
  }
})
