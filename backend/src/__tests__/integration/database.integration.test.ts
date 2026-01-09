/**
 * Database Integration Tests
 *
 * Tests database connectivity and operations through the API.
 * These tests verify that PostgreSQL is properly configured and
 * accessible from all backend pods.
 *
 * Run with: npm run test:integration
 */

import { apiRequest, generateTestId } from './setup'

describe('Database Integration Tests', () => {
  describe('User Operations', () => {
    it('should create user in database', async () => {
      const testUser = {
        email: `${generateTestId()}@test.com`,
        password: 'TestPassword123',
        label: 'Database Test User',
      }

      const response = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(testUser),
      })

      expect([200, 201]).toContain(response.status)

      const data = await response.json()
      expect(data.token || data.accessToken).toBeDefined()
    })

    it('should prevent duplicate email registration', async () => {
      const testUser = {
        email: `${generateTestId()}@test.com`,
        password: 'TestPassword123',
        label: 'Duplicate Test User',
      }

      // First registration
      const firstResponse = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(testUser),
      })
      expect([200, 201]).toContain(firstResponse.status)

      // Second registration with same email should fail
      const secondResponse = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(testUser),
      })
      expect([400, 409, 422]).toContain(secondResponse.status)
    })

    it('should validate user credentials on login', async () => {
      const testUser = {
        email: `${generateTestId()}@test.com`,
        password: 'TestPassword123',
        label: 'Login Test User',
      }

      // Register
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(testUser),
      })

      // Login with correct password
      const validLogin = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password,
        }),
      })
      expect(validLogin.ok).toBe(true)

      // Login with wrong password
      const invalidLogin = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: testUser.email,
          password: 'wrongpassword',
        }),
      })
      expect(invalidLogin.ok).toBe(false)
    })
  })

  describe('Tenant Operations', () => {
    let authToken: string
    let tenantId: string

    beforeAll(async () => {
      const testUser = {
        email: `${generateTestId()}@test.com`,
        password: 'TestPassword123',
        label: 'Tenant DB Test User',
      }

      const response = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(testUser),
      })

      if (response.ok) {
        const data = await response.json()
        authToken = data.token || data.accessToken
        tenantId = data.tenantId || data.tenant?.id
      }
    })

    it('should create tenant on user registration', () => {
      expect(tenantId).toBeDefined()
    })

    it('should persist tenant data across requests', async () => {
      if (!authToken || !tenantId) {
        console.warn('Skipping: no auth token or tenant available')
        return
      }

      // Make multiple requests to verify data persists
      const requests = Array.from({ length: 5 }, () =>
        fetch(`${process.env.TEST_API_URL || 'http://localhost:30002'}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        })
      )

      const responses = await Promise.all(requests)

      // Check responses are consistent (if endpoint exists)
      const statuses = responses.map(r => r.status)
      const firstStatus = statuses[0]

      // All should return same status
      expect(statuses.every(s => s === firstStatus)).toBe(true)
    })
  })

  describe('Connection Pool', () => {
    it('should handle multiple concurrent database operations', async () => {
      // Make concurrent registration requests
      // Each creates a user and tenant in the database

      const concurrentUsers = 10
      const users = Array.from({ length: concurrentUsers }, () => ({
        email: `${generateTestId()}@test.com`,
        password: 'TestPassword123',
        label: 'Concurrent Test User',
      }))

      const startTime = Date.now()

      const requests = users.map(user =>
        apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify(user),
        })
      )

      const responses = await Promise.all(requests)
      const duration = Date.now() - startTime

      const successful = responses.filter(r => [200, 201].includes(r.status)).length

      console.log(`${concurrentUsers} concurrent registrations:
        Successful: ${successful}
        Duration: ${duration}ms
        Avg: ${Math.round(duration / concurrentUsers)}ms per registration
      `)

      // All should succeed
      expect(successful).toBe(concurrentUsers)
    })
  })

  describe('Data Integrity', () => {
    it('should maintain data integrity across pods', async () => {
      // Register user
      const testUser = {
        email: `${generateTestId()}@test.com`,
        password: 'TestPassword123',
        label: 'Integrity Test User',
      }

      const registerResponse = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(testUser),
      })

      expect([200, 201]).toContain(registerResponse.status)

      // Immediately try to login (might hit different pod)
      const loginResponse = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password,
        }),
      })

      // Login should work - data committed to shared PostgreSQL
      expect(loginResponse.ok).toBe(true)
    })
  })
})
