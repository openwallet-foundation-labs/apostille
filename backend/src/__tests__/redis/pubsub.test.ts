/**
 * Unit tests for PubSub
 * Tests local-only fallback mode (no Redis required)
 */

import { pubsub, channels } from '../../services/redis/pubsub'

interface TestMessage {
  type: string
  data: any
  timestamp: string
}

describe('PubSub', () => {
  beforeAll(async () => {
    // Initialize in local-only mode (no Redis URL set)
    await pubsub.initialize()
  })

  afterAll(async () => {
    await pubsub.close()
  })

  describe('channels helper', () => {
    it('should generate tenant notification channel names', () => {
      const channel = channels.tenantNotifications('tenant-123')
      expect(channel).toBe('notifications:tenant-123')
    })

    it('should have broadcast channel defined', () => {
      expect(channels.broadcast).toBe('notifications:broadcast')
    })
  })

  describe('subscribe and publish (local mode)', () => {
    it('should deliver messages to subscribers in local mode', async () => {
      const receivedMessages: TestMessage[] = []
      const testChannel = 'test:local:channel'

      const handler = (_channel: string, message: TestMessage) => {
        receivedMessages.push(message)
      }

      await pubsub.subscribe<TestMessage>(testChannel, handler)

      const testMessage: TestMessage = {
        type: 'test',
        data: { foo: 'bar' },
        timestamp: new Date().toISOString()
      }

      await pubsub.publish(testChannel, testMessage)

      // Allow time for local delivery
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(receivedMessages).toHaveLength(1)
      expect(receivedMessages[0]).toEqual(testMessage)

      // Cleanup
      await pubsub.unsubscribe(testChannel, handler)
    })

    it('should support multiple subscribers on same channel', async () => {
      const messages1: TestMessage[] = []
      const messages2: TestMessage[] = []
      const testChannel = 'test:multi:channel'

      const handler1 = (_channel: string, message: TestMessage) => {
        messages1.push(message)
      }
      const handler2 = (_channel: string, message: TestMessage) => {
        messages2.push(message)
      }

      await pubsub.subscribe<TestMessage>(testChannel, handler1)
      await pubsub.subscribe<TestMessage>(testChannel, handler2)

      const testMessage: TestMessage = {
        type: 'broadcast',
        data: { value: 42 },
        timestamp: new Date().toISOString()
      }

      await pubsub.publish(testChannel, testMessage)

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(messages1).toHaveLength(1)
      expect(messages2).toHaveLength(1)
      expect(messages1[0]).toEqual(testMessage)
      expect(messages2[0]).toEqual(testMessage)

      // Cleanup
      await pubsub.unsubscribe(testChannel, handler1)
      await pubsub.unsubscribe(testChannel, handler2)
    })

    it('should not deliver messages after unsubscribe', async () => {
      const receivedMessages: TestMessage[] = []
      const testChannel = 'test:unsub:channel'

      const handler = (_channel: string, message: TestMessage) => {
        receivedMessages.push(message)
      }

      await pubsub.subscribe<TestMessage>(testChannel, handler)

      // First message should be received
      await pubsub.publish(testChannel, {
        type: 'first',
        data: {},
        timestamp: new Date().toISOString()
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(receivedMessages).toHaveLength(1)

      // Unsubscribe
      await pubsub.unsubscribe(testChannel, handler)

      // Second message should not be received
      await pubsub.publish(testChannel, {
        type: 'second',
        data: {},
        timestamp: new Date().toISOString()
      })

      await new Promise(resolve => setTimeout(resolve, 50))
      expect(receivedMessages).toHaveLength(1)
    })
  })

  describe('different channels', () => {
    it('should isolate messages by channel', async () => {
      const channel1Messages: TestMessage[] = []
      const channel2Messages: TestMessage[] = []

      const handler1 = (_channel: string, message: TestMessage) => {
        channel1Messages.push(message)
      }
      const handler2 = (_channel: string, message: TestMessage) => {
        channel2Messages.push(message)
      }

      await pubsub.subscribe<TestMessage>('channel:one', handler1)
      await pubsub.subscribe<TestMessage>('channel:two', handler2)

      await pubsub.publish<TestMessage>('channel:one', {
        type: 'for-one',
        data: { target: 1 },
        timestamp: new Date().toISOString()
      })

      await pubsub.publish<TestMessage>('channel:two', {
        type: 'for-two',
        data: { target: 2 },
        timestamp: new Date().toISOString()
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(channel1Messages).toHaveLength(1)
      expect(channel1Messages[0].type).toBe('for-one')

      expect(channel2Messages).toHaveLength(1)
      expect(channel2Messages[0].type).toBe('for-two')

      // Cleanup
      await pubsub.unsubscribe('channel:one', handler1)
      await pubsub.unsubscribe('channel:two', handler2)
    })
  })

  describe('tenant notification pattern', () => {
    it('should work with tenant notification channels', async () => {
      const tenant1Messages: any[] = []
      const tenant2Messages: any[] = []

      const handler1 = (_ch: string, msg: any) => tenant1Messages.push(msg)
      const handler2 = (_ch: string, msg: any) => tenant2Messages.push(msg)

      const tenant1Channel = channels.tenantNotifications('tenant-001')
      const tenant2Channel = channels.tenantNotifications('tenant-002')

      await pubsub.subscribe(tenant1Channel, handler1)
      await pubsub.subscribe(tenant2Channel, handler2)

      // Send to tenant 1
      await pubsub.publish(tenant1Channel, {
        type: 'CredentialIssued',
        tenantId: 'tenant-001',
        data: { credentialId: 'cred-123' }
      })

      // Send to tenant 2
      await pubsub.publish(tenant2Channel, {
        type: 'ConnectionCompleted',
        tenantId: 'tenant-002',
        data: { connectionId: 'conn-456' }
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      expect(tenant1Messages).toHaveLength(1)
      expect(tenant1Messages[0].type).toBe('CredentialIssued')

      expect(tenant2Messages).toHaveLength(1)
      expect(tenant2Messages[0].type).toBe('ConnectionCompleted')

      // Cleanup
      await pubsub.unsubscribe(tenant1Channel, handler1)
      await pubsub.unsubscribe(tenant2Channel, handler2)
    })
  })
})
