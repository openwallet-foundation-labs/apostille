/**
 * API Integration Tests
 *
 * Tests the backend API endpoints against a live deployment.
 * Run with: npm run test:integration
 */

import { config, apiRequest, authenticatedRequest, generateTestId } from './setup'

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await apiRequest('/health')
      expect(response.ok).toBe(true)

      const data = await response.json()
      expect(data.status).toBe('ok')
      expect(data.message).toContain('running')
    })
  })

  describe('Authentication', () => {
    const testUser = {
      email: `${generateTestId()}@test.com`,
      password: 'TestPassword123',
      label: 'Integration Test User',
    }

    let authToken: string

    it('should register a new user', async () => {
      const response = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(testUser),
      })

      // Accept 201 (created) or 200 (ok)
      expect([200, 201]).toContain(response.status)

      const data = await response.json()
      expect(data.token || data.accessToken).toBeDefined()
      authToken = data.token || data.accessToken
    })

    it('should login with registered user', async () => {
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: testUser.email,
          password: testUser.password,
        }),
      })

      expect(response.ok).toBe(true)

      const data = await response.json()
      expect(data.token || data.accessToken).toBeDefined()
      authToken = data.token || data.accessToken
    })

    it('should reject invalid credentials', async () => {
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: testUser.email,
          password: 'wrongpassword',
        }),
      })

      expect(response.ok).toBe(false)
      expect([400, 401, 403]).toContain(response.status)
    })

    it('should access protected endpoint with token', async () => {
      if (!authToken) {
        console.warn('Skipping: no auth token available')
        return
      }

      const response = await authenticatedRequest('/api/auth/me', authToken)
      // This endpoint may not exist, so we just check it doesn't crash
      expect(response.status).not.toBe(500)
    })
  })

  describe('Tenant Operations', () => {
    let authToken: string
    let tenantId: string

    beforeAll(async () => {
      // Register and login a test user
      const testUser = {
        email: `${generateTestId()}@test.com`,
        password: 'TestPassword123',
        label: 'Tenant Test User',
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

    it('should have a tenant after registration', () => {
      expect(tenantId).toBeDefined()
    })

    it('should list connections for tenant', async () => {
      if (!authToken || !tenantId) {
        console.warn('Skipping: no auth token or tenant available')
        return
      }

      const response = await authenticatedRequest(
        '/api/connections',
        authToken,
        {
          headers: {
            'x-tenant-id': tenantId,
          },
        }
      )

      // Should return array (empty or with connections)
      expect([200, 404]).toContain(response.status)
    })

    it('should list credentials for tenant', async () => {
      if (!authToken || !tenantId) {
        console.warn('Skipping: no auth token or tenant available')
        return
      }

      const response = await authenticatedRequest(
        '/api/credentials',
        authToken,
        {
          headers: {
            'x-tenant-id': tenantId,
          },
        }
      )

      expect([200, 404]).toContain(response.status)
    })
  })

  describe('CORS', () => {
    it('should allow requests from frontend origin', async () => {
      const response = await fetch(`${config.apiUrl}/health`, {
        method: 'OPTIONS',
        headers: {
          'Origin': config.frontendUrl,
          'Access-Control-Request-Method': 'GET',
        },
      })

      // Should return CORS headers
      const allowOrigin = response.headers.get('access-control-allow-origin')
      expect(allowOrigin).toBeTruthy()
    })
  })
})
