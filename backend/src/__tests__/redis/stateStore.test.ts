/**
 * Unit tests for StateStore
 * Tests in-memory fallback mode (no Redis required)
 */

import { StateStore } from '../../services/redis/stateStore'

interface TestData {
  id: string
  name: string
  value: number
  createdAt: string
}

describe('StateStore', () => {
  let store: StateStore<TestData>

  beforeEach(() => {
    // Create a fresh store for each test (in-memory mode)
    store = new StateStore<TestData>({
      prefix: 'test:state:',
      defaultTtlSeconds: 60
    })
  })

  describe('set and get', () => {
    it('should store and retrieve a value', async () => {
      const testData: TestData = {
        id: '123',
        name: 'Test Item',
        value: 42,
        createdAt: new Date().toISOString()
      }

      await store.set('item1', testData)
      const result = await store.get('item1')

      expect(result).toEqual(testData)
    })

    it('should return null for non-existent key', async () => {
      const result = await store.get('nonexistent')
      expect(result).toBeNull()
    })

    it('should overwrite existing value', async () => {
      const data1: TestData = { id: '1', name: 'First', value: 1, createdAt: '' }
      const data2: TestData = { id: '1', name: 'Second', value: 2, createdAt: '' }

      await store.set('key1', data1)
      await store.set('key1', data2)

      const result = await store.get('key1')
      expect(result).toEqual(data2)
    })
  })

  describe('delete', () => {
    it('should delete an existing key', async () => {
      const testData: TestData = { id: '1', name: 'Test', value: 1, createdAt: '' }

      await store.set('toDelete', testData)
      expect(await store.get('toDelete')).toEqual(testData)

      const deleted = await store.delete('toDelete')
      expect(deleted).toBe(true)
      expect(await store.get('toDelete')).toBeNull()
    })

    it('should return false when deleting non-existent key', async () => {
      const deleted = await store.delete('nonexistent')
      expect(deleted).toBe(false)
    })
  })

  describe('exists', () => {
    it('should return true for existing key', async () => {
      const testData: TestData = { id: '1', name: 'Test', value: 1, createdAt: '' }
      await store.set('existing', testData)

      const exists = await store.exists('existing')
      expect(exists).toBe(true)
    })

    it('should return false for non-existent key', async () => {
      const exists = await store.exists('nonexistent')
      expect(exists).toBe(false)
    })
  })

  describe('update', () => {
    it('should update an existing value', async () => {
      const initial: TestData = { id: '1', name: 'Initial', value: 1, createdAt: '' }
      await store.set('toUpdate', initial)

      const updated = await store.update('toUpdate', (current) => {
        if (!current) return null
        return { ...current, name: 'Updated', value: current.value + 10 }
      })

      expect(updated).toEqual({ id: '1', name: 'Updated', value: 11, createdAt: '' })

      const result = await store.get('toUpdate')
      expect(result).toEqual({ id: '1', name: 'Updated', value: 11, createdAt: '' })
    })

    it('should handle update on non-existent key', async () => {
      const updated = await store.update('nonexistent', (current) => {
        if (!current) return { id: 'new', name: 'New', value: 0, createdAt: '' }
        return current
      })

      expect(updated).toEqual({ id: 'new', name: 'New', value: 0, createdAt: '' })
    })

    it('should delete when updater returns null', async () => {
      const initial: TestData = { id: '1', name: 'ToDelete', value: 1, createdAt: '' }
      await store.set('toNullify', initial)

      const result = await store.update('toNullify', () => null)
      expect(result).toBeNull()

      const exists = await store.exists('toNullify')
      expect(exists).toBe(false)
    })
  })

  describe('findOne', () => {
    it('should find a value matching predicate', async () => {
      await store.set('item1', { id: '1', name: 'Alice', value: 100, createdAt: '' })
      await store.set('item2', { id: '2', name: 'Bob', value: 200, createdAt: '' })
      await store.set('item3', { id: '3', name: 'Charlie', value: 300, createdAt: '' })

      const result = await store.findOne((item) => item.name === 'Bob')
      expect(result).toEqual({ id: '2', name: 'Bob', value: 200, createdAt: '' })
    })

    it('should return null when no match found', async () => {
      await store.set('item1', { id: '1', name: 'Alice', value: 100, createdAt: '' })

      const result = await store.findOne((item) => item.name === 'Unknown')
      expect(result).toBeNull()
    })
  })

  describe('getAll', () => {
    it('should return all stored values', async () => {
      await store.set('item1', { id: '1', name: 'Alice', value: 100, createdAt: '' })
      await store.set('item2', { id: '2', name: 'Bob', value: 200, createdAt: '' })

      const results = await store.getAll()
      expect(results).toHaveLength(2)
      expect(results).toContainEqual({ id: '1', name: 'Alice', value: 100, createdAt: '' })
      expect(results).toContainEqual({ id: '2', name: 'Bob', value: 200, createdAt: '' })
    })

    it('should return empty array when no values', async () => {
      const results = await store.getAll()
      expect(results).toEqual([])
    })
  })

  describe('TTL expiration (in-memory mode)', () => {
    it('should expire values after TTL', async () => {
      // Create store with very short TTL
      const shortTtlStore = new StateStore<TestData>({
        prefix: 'test:expiry:',
        defaultTtlSeconds: 1 // 1 second TTL
      })

      await shortTtlStore.set('expiring', { id: '1', name: 'Expiring', value: 1, createdAt: '' })

      // Value should exist immediately
      expect(await shortTtlStore.get('expiring')).not.toBeNull()

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Value should be expired
      expect(await shortTtlStore.get('expiring')).toBeNull()
    })

    it('should respect custom TTL per item', async () => {
      await store.set('shortLived', { id: '1', name: 'Short', value: 1, createdAt: '' }, 1)
      await store.set('longLived', { id: '2', name: 'Long', value: 2, createdAt: '' }, 60)

      // Wait for short TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      expect(await store.get('shortLived')).toBeNull()
      expect(await store.get('longLived')).not.toBeNull()
    })
  })

  describe('cleanup', () => {
    it('should clean up expired entries', async () => {
      const shortTtlStore = new StateStore<TestData>({
        prefix: 'test:cleanup:',
        defaultTtlSeconds: 1
      })

      await shortTtlStore.set('item1', { id: '1', name: 'Item1', value: 1, createdAt: '' })
      await shortTtlStore.set('item2', { id: '2', name: 'Item2', value: 2, createdAt: '' }, 60)

      // Wait for first item to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Run cleanup
      shortTtlStore.cleanup()

      // First item should be gone, second should remain
      const all = await shortTtlStore.getAll()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe('2')
    })
  })
})
