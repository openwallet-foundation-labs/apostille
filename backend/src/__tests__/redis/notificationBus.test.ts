/**
 * Unit tests for NotificationBus
 * Tests local-only mode (no Redis required)
 */

// Mock WebSocket
class MockWebSocket {
  readyState = 1 // OPEN
  sentMessages: string[] = []

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.readyState = 3 // CLOSED
  }
}

describe('NotificationBus', () => {
  // Import fresh instance for each test
  let bus: any

  beforeEach(() => {
    // Clear module cache to get fresh instance
    jest.resetModules()
    const busModule = require('../../notifications/bus')
    bus = busModule.bus
  })

  afterEach(async () => {
    // Cleanup
  })

  describe('initialization', () => {
    it('should initialize successfully in local mode', async () => {
      await bus.initialize()
      // Should not throw
    })

    it('should be idempotent', async () => {
      await bus.initialize()
      await bus.initialize() // Second call should not throw
    })
  })

  describe('connect and disconnect', () => {
    it('should track connected WebSocket clients', () => {
      const ws = new MockWebSocket()

      bus.connect('tenant-1', ws as any)

      expect(bus.hasActive('tenant-1')).toBe(true)
      expect(bus.listTenants()).toContain('tenant-1')
    })

    it('should remove WebSocket on disconnect', () => {
      const ws = new MockWebSocket()

      bus.connect('tenant-2', ws as any)
      expect(bus.hasActive('tenant-2')).toBe(true)

      bus.disconnect('tenant-2', ws as any)
      expect(bus.hasActive('tenant-2')).toBe(false)
    })

    it('should handle multiple connections per tenant', () => {
      const ws1 = new MockWebSocket()
      const ws2 = new MockWebSocket()

      bus.connect('tenant-3', ws1 as any)
      bus.connect('tenant-3', ws2 as any)

      expect(bus.hasActive('tenant-3')).toBe(true)

      // Disconnect one
      bus.disconnect('tenant-3', ws1 as any)
      expect(bus.hasActive('tenant-3')).toBe(true)

      // Disconnect other
      bus.disconnect('tenant-3', ws2 as any)
      expect(bus.hasActive('tenant-3')).toBe(false)
    })
  })

  describe('sendSync (local delivery)', () => {
    it('should deliver messages to connected WebSockets', async () => {
      const ws1 = new MockWebSocket()
      const ws2 = new MockWebSocket()

      bus.connect('tenant-4', ws1 as any)
      bus.connect('tenant-4', ws2 as any)

      const payload = {
        v: 1,
        id: 'msg-1',
        type: 'TestEvent',
        tenantId: 'tenant-4',
        createdAt: new Date().toISOString(),
        data: { test: 'value' }
      }

      bus.sendSync('tenant-4', payload)

      // Allow async operations
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(ws1.sentMessages.length).toBeGreaterThanOrEqual(1)
      expect(ws2.sentMessages.length).toBeGreaterThanOrEqual(1)

      const received1 = JSON.parse(ws1.sentMessages[0])
      expect(received1.type).toBe('TestEvent')
    })

    it('should not deliver to closed WebSockets', async () => {
      const wsOpen = new MockWebSocket()
      const wsClosed = new MockWebSocket()
      wsClosed.readyState = 3 // CLOSED

      bus.connect('tenant-5', wsOpen as any)
      bus.connect('tenant-5', wsClosed as any)

      bus.sendSync('tenant-5', {
        v: 1,
        id: 'msg-2',
        type: 'Test',
        tenantId: 'tenant-5',
        createdAt: new Date().toISOString(),
        data: {}
      })

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(wsOpen.sentMessages.length).toBeGreaterThanOrEqual(1)
      expect(wsClosed.sentMessages).toHaveLength(0)
    })

    it('should not throw for tenant with no connections', () => {
      // Should not throw
      bus.sendSync('nonexistent-tenant', {
        v: 1,
        id: 'msg-3',
        type: 'Test',
        tenantId: 'nonexistent',
        createdAt: new Date().toISOString(),
        data: {}
      })
    })
  })

  describe('send (async)', () => {
    it('should send messages asynchronously', async () => {
      const ws = new MockWebSocket()
      bus.connect('tenant-6', ws as any)

      await bus.send('tenant-6', {
        v: 1,
        id: 'msg-4',
        type: 'AsyncTest',
        tenantId: 'tenant-6',
        createdAt: new Date().toISOString(),
        data: { async: true }
      })

      // Message should be delivered
      expect(ws.sentMessages.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('hasActive and listTenants', () => {
    it('should correctly report active status', () => {
      expect(bus.hasActive('unknown')).toBe(false)

      const ws = new MockWebSocket()
      bus.connect('active-tenant', ws as any)

      expect(bus.hasActive('active-tenant')).toBe(true)
    })

    it('should list all tenants with connections', () => {
      const ws1 = new MockWebSocket()
      const ws2 = new MockWebSocket()

      bus.connect('list-tenant-1', ws1 as any)
      bus.connect('list-tenant-2', ws2 as any)

      const tenants = bus.listTenants()

      expect(tenants).toContain('list-tenant-1')
      expect(tenants).toContain('list-tenant-2')
    })
  })
})
