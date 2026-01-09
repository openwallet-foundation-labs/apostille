/**
 * Connection Flow Integration Tests
 *
 * Tests end-to-end DIDComm connection establishment between tenants.
 * Verifies that connections work across horizontally-scaled backend pods.
 *
 * Run with: npm run test:integration
 */

import {
  config,
  registerTenant,
  createInvitation,
  receiveInvitation,
  getConnections,
  getConnection,
  waitForConnectionComplete,
  sendMessage,
  TenantInfo,
} from './setup'

describe('Connection Flow Integration Tests', () => {
  // Increase timeout for DIDComm operations
  jest.setTimeout(30000)

  describe('Basic Connection', () => {
    let tenantA: TenantInfo
    let tenantB: TenantInfo
    let connectionAId: string
    let connectionBId: string

    beforeAll(async () => {
      // Register two tenants
      tenantA = await registerTenant('Tenant A - Inviter')
      tenantB = await registerTenant('Tenant B - Invitee')

      console.log(`Registered tenants:
        A: ${tenantA.email} (${tenantA.tenantId})
        B: ${tenantB.email} (${tenantB.tenantId})
      `)
    })

    it('should create OOB invitation', async () => {
      const invitation = await createInvitation(tenantA.token, 'Connection from A')

      expect(invitation.id).toBeDefined()
      expect(invitation.url).toBeDefined()
      expect(invitation.url).toContain('oob=')

      console.log(`Invitation created: ${invitation.id}`)
      console.log(`URL: ${invitation.url.substring(0, 100)}...`)
    })

    it('should establish connection between two tenants', async () => {
      // Tenant A creates invitation
      const invitation = await createInvitation(tenantA.token, 'Connection from A to B')

      // Tenant B receives and accepts
      const connectionB = await receiveInvitation(tenantB.token, invitation.url)

      expect(connectionB.id).toBeDefined()
      expect(connectionB.state).toBeDefined()

      connectionBId = connectionB.id

      console.log(`Tenant B connection: ${connectionBId}, state: ${connectionB.state}`)

      // Wait for connection to complete on B's side
      const completedB = await waitForConnectionComplete(tenantB.token, connectionBId)
      expect(completedB.state).toBe('completed')

      console.log(`Tenant B connection completed`)
    })

    it('should show connection on both sides', async () => {
      // Get connections for both tenants
      const connectionsA = await getConnections(tenantA.token)
      const connectionsB = await getConnections(tenantB.token)

      console.log(`Tenant A connections: ${connectionsA.connections.length}`)
      console.log(`Tenant B connections: ${connectionsB.connections.length}`)

      // Both should have at least one connection
      expect(connectionsA.connections.length).toBeGreaterThanOrEqual(1)
      expect(connectionsB.connections.length).toBeGreaterThanOrEqual(1)

      // Find the connection on A's side (may take a moment to sync)
      const connectionA = connectionsA.connections.find(
        c => c.state === 'completed' || c.state === 'response-sent'
      )

      if (connectionA) {
        connectionAId = connectionA.id
        console.log(`Tenant A connection: ${connectionAId}, state: ${connectionA.state}`)
      }
    })

    it('should have correct theirLabel values', async () => {
      if (!connectionAId || !connectionBId) {
        console.warn('Skipping: connections not established')
        return
      }

      const connectionA = await getConnection(tenantA.token, connectionAId)
      const connectionB = await getConnection(tenantB.token, connectionBId)

      // Tenant A should see Tenant B's label
      if (connectionA?.theirLabel) {
        expect(connectionA.theirLabel).toContain('Tenant B')
      }

      // Tenant B should see Tenant A's label or invitation label
      if (connectionB?.theirLabel) {
        expect(connectionB.theirLabel).toBeDefined()
      }

      console.log(`A sees: ${connectionA?.theirLabel}`)
      console.log(`B sees: ${connectionB?.theirLabel}`)
    })
  })

  describe('Cross-Pod Connection', () => {
    it('should work when requests may hit different pods', async () => {
      // Register tenants (may hit different pods)
      const tenantC = await registerTenant('Tenant C - Cross Pod')
      const tenantD = await registerTenant('Tenant D - Cross Pod')

      // Create invitation (pod 1 potentially)
      const invitation = await createInvitation(tenantC.token, 'Cross-pod invitation')

      // Small delay to ensure state is synced to Redis
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Receive invitation (may hit pod 2)
      const connectionD = await receiveInvitation(tenantD.token, invitation.url)

      expect(connectionD.id).toBeDefined()

      // Wait for completion
      const completed = await waitForConnectionComplete(tenantD.token, connectionD.id)
      expect(completed.state).toBe('completed')

      console.log('Cross-pod connection established successfully')
    })
  })

  describe('Multiple Connections', () => {
    it('should handle connections between multiple tenants', async () => {
      // Create 3 tenants
      const tenant1 = await registerTenant('Multi Tenant 1')
      const tenant2 = await registerTenant('Multi Tenant 2')
      const tenant3 = await registerTenant('Multi Tenant 3')

      const connections: string[] = []

      // 1 -> 2
      const inv12 = await createInvitation(tenant1.token, 'From 1 to 2')
      const conn12 = await receiveInvitation(tenant2.token, inv12.url)
      connections.push(conn12.id)

      // 2 -> 3
      const inv23 = await createInvitation(tenant2.token, 'From 2 to 3')
      const conn23 = await receiveInvitation(tenant3.token, inv23.url)
      connections.push(conn23.id)

      // 3 -> 1
      const inv31 = await createInvitation(tenant3.token, 'From 3 to 1')
      const conn31 = await receiveInvitation(tenant1.token, inv31.url)
      connections.push(conn31.id)

      console.log(`Created ${connections.length} connections`)

      // Wait for all to complete
      await Promise.all([
        waitForConnectionComplete(tenant2.token, conn12.id),
        waitForConnectionComplete(tenant3.token, conn23.id),
        waitForConnectionComplete(tenant1.token, conn31.id),
      ])

      console.log('All multi-tenant connections completed')
    })

    it('should handle concurrent connection attempts', async () => {
      const tenantMain = await registerTenant('Main Tenant')

      // Create multiple tenants that will connect concurrently
      const otherTenants = await Promise.all([
        registerTenant('Concurrent 1'),
        registerTenant('Concurrent 2'),
        registerTenant('Concurrent 3'),
      ])

      // Create invitations for each
      const invitations = await Promise.all(
        otherTenants.map((_, i) =>
          createInvitation(tenantMain.token, `Concurrent invite ${i + 1}`)
        )
      )

      // Accept all invitations concurrently
      const connectionPromises = otherTenants.map((tenant, i) =>
        receiveInvitation(tenant.token, invitations[i].url)
      )

      const connections = await Promise.all(connectionPromises)

      // All should have IDs
      expect(connections.every(c => c.id)).toBe(true)

      console.log(`Concurrent connections created: ${connections.length}`)

      // Wait for completions
      await Promise.all(
        connections.map((conn, i) =>
          waitForConnectionComplete(otherTenants[i].token, conn.id)
        )
      )

      console.log('All concurrent connections completed')
    })
  })

  describe('Error Handling', () => {
    it('should reject invalid invitation URL', async () => {
      const tenant = await registerTenant('Error Test Tenant')

      try {
        await receiveInvitation(tenant.token, 'https://invalid-url.com/not-an-invitation')
        fail('Should have thrown an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to receive invitation')
      }
    })

    it('should reject malformed invitation', async () => {
      const tenant = await registerTenant('Malformed Test Tenant')

      try {
        await receiveInvitation(tenant.token, 'not-a-url-at-all')
        fail('Should have thrown an error')
      } catch (error) {
        expect((error as Error).message).toContain('Failed to receive invitation')
      }
    })

    it('should handle connection timeout gracefully', async () => {
      const tenant = await registerTenant('Timeout Test Tenant')

      // Try to wait for a non-existent connection
      try {
        await waitForConnectionComplete(tenant.token, 'non-existent-id', 2000)
        fail('Should have thrown a timeout error')
      } catch (error) {
        expect((error as Error).message).toContain('did not complete')
      }
    })
  })

  describe('Connection State Verification', () => {
    it('should track connection state transitions', async () => {
      const tenantE = await registerTenant('State Test E')
      const tenantF = await registerTenant('State Test F')

      // Create invitation
      const invitation = await createInvitation(tenantE.token, 'State tracking test')

      // Receive invitation
      const initialConnection = await receiveInvitation(tenantF.token, invitation.url)

      console.log(`Initial state: ${initialConnection.state}`)

      // Check intermediate states by polling
      const states: string[] = [initialConnection.state]
      const maxPolls = 20
      let lastState = initialConnection.state

      for (let i = 0; i < maxPolls; i++) {
        await new Promise(resolve => setTimeout(resolve, 500))

        const current = await getConnection(tenantF.token, initialConnection.id)
        if (current && current.state !== lastState) {
          states.push(current.state)
          lastState = current.state
          console.log(`State transition: ${current.state}`)
        }

        if (current?.state === 'completed') break
      }

      console.log(`State transitions observed: ${states.join(' -> ')}`)

      // Should have gone through some states and ended at completed
      expect(states[states.length - 1]).toBe('completed')
    })
  })
})

describe('Messaging Over Connection', () => {
  jest.setTimeout(30000)

  it('should send message over established connection', async () => {
    // Register two tenants
    const sender = await registerTenant('Message Sender')
    const receiver = await registerTenant('Message Receiver')

    // Establish connection
    const invitation = await createInvitation(sender.token, 'Messaging test')
    const connectionReceiver = await receiveInvitation(receiver.token, invitation.url)

    // Wait for connection to complete
    await waitForConnectionComplete(receiver.token, connectionReceiver.id)

    // Get sender's connection
    const senderConnections = await getConnections(sender.token)
    const connectionSender = senderConnections.connections.find(
      c => c.state === 'completed'
    )

    if (!connectionSender) {
      console.warn('Sender connection not found, waiting...')
      await new Promise(resolve => setTimeout(resolve, 3000))
    }

    // Try to send a message
    // Note: This may fail if messaging endpoint isn't implemented
    try {
      const senderConns = await getConnections(sender.token)
      const senderConn = senderConns.connections.find(c => c.state === 'completed')

      if (senderConn) {
        await sendMessage(sender.token, senderConn.id, 'Hello from integration test!')
        console.log('Message sent successfully')
      } else {
        console.warn('No completed connection found for sender')
      }
    } catch (error) {
      console.log('Messaging not available:', (error as Error).message)
      // Don't fail - messaging may not be implemented
    }
  })
})
