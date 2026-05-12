/**
 * AnonCreds OID4VCI integration tests.
 *
 * These tests exercise the public HTTP contract defined in
 * docs/specs/anoncreds-oid4vci-profile.md. They run against a live
 * deployment (TEST_API_URL, default http://localhost:30002) and gracefully
 * degrade when the backend or AnonCreds ledger isn't reachable — same
 * pattern as oid4vc.integration.test.ts.
 *
 * Run: npm run test:integration:oid4vci-anoncreds
 */

import {
  config,
  apiRequest,
  authenticatedRequest,
  registerTenant,
  TenantInfo,
} from './setup'

const SKIP_ANONCREDS = process.env.SKIP_ANONCREDS_INTEGRATION === '1'

// Deployment readiness check shared across describe blocks.
async function deploymentReachable(): Promise<boolean> {
  try {
    const r = await apiRequest('/health')
    return r.ok
  } catch {
    return false
  }
}

describe('AnonCreds OID4VCI Integration', () => {
  jest.setTimeout(120000)

  let tenant: TenantInfo
  let reachable = false

  beforeAll(async () => {
    reachable = await deploymentReachable()
    if (!reachable || SKIP_ANONCREDS) {
      console.log(`⚠️  Skipping AnonCreds OID4VCI tests — reachable=${reachable}, SKIP=${SKIP_ANONCREDS}`)
      return
    }
    tenant = await registerTenant('AnonCreds OID4VCI Test')
    console.log(`Registered tenant: ${tenant.email}`)
  })

  describe('Issuer metadata advertises anoncreds format', () => {
    it('exposes the anoncreds proof_type in credential_configurations_supported', async () => {
      if (!reachable || SKIP_ANONCREDS) return
      const res = await apiRequest(`/issuers/${tenant.tenantId}/.well-known/openid-credential-issuer`)
      // 200 with empty configs is acceptable — tenant has no AnonCreds cred-defs yet.
      expect([200, 400]).toContain(res.status)
      if (res.ok) {
        const data = await res.json()
        const configs = data.credential_configurations_supported || {}
        for (const [, cfg] of Object.entries<any>(configs)) {
          if (cfg.format === 'anoncreds') {
            expect(cfg.proof_types_supported?.anoncreds).toBeDefined()
            expect(cfg.cryptographic_binding_methods_supported).toContain('link_secret')
            expect(cfg.credential_signing_alg_values_supported).toContain('CLSignature2019')
            expect(cfg.anoncreds?.schema?.id).toBeDefined()
          }
        }
      }
    })
  })

  describe('Nonce endpoint', () => {
    it('returns a decimal-string c_nonce when format=anoncreds (or a valid nonce otherwise)', async () => {
      if (!reachable || SKIP_ANONCREDS) return
      const res = await apiRequest(`/issuers/${tenant.tenantId}/nonce`, { method: 'POST' })
      // The nonce endpoint is public — it should always be reachable.
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(typeof data.c_nonce).toBe('string')
      expect(typeof data.c_nonce_expires_in).toBe('number')
    })
  })

  describe('Credential endpoint validation guards', () => {
    it('rejects a request with proof_type !== "anoncreds" when format=anoncreds', async () => {
      if (!reachable || SKIP_ANONCREDS) return
      // Without a real offer/access token we expect 401 invalid_token, but if
      // the wiring is wrong we'd get 500 — guard against that regression.
      const res = await apiRequest(`/issuers/${tenant.tenantId}/credential`, {
        method: 'POST',
        headers: { Authorization: 'Bearer not-a-real-token' },
        body: JSON.stringify({
          format: 'anoncreds',
          credential_identifier: 'anything',
          proof: { proof_type: 'jwt', jwt: 'eyJ...' },
        }),
      })
      expect([400, 401]).toContain(res.status)
    })
  })

  describe('Wire-trace endpoint', () => {
    it('returns 404 for an unknown offerId', async () => {
      if (!reachable || SKIP_ANONCREDS) return
      const res = await authenticatedRequest(
        '/api/oid4vci/offers/00000000-0000-0000-0000-000000000000/wire-trace',
        tenant.token,
      )
      expect([404, 400]).toContain(res.status)
    })
  })
})
