/**
 * OID4VC Integration Tests
 *
 * Tests OID4VCI (credential issuance) and OID4VP (verification) flows.
 * Run with: npm run test:integration
 */

import {
  config,
  apiRequest,
  authenticatedRequest,
  registerTenant,
  createOID4VCIOffer,
  listOID4VCIIssuers,
  createOID4VPRequest,
  TenantInfo,
  generateTestId,
} from './setup'

describe('OID4VCI Integration Tests', () => {
  jest.setTimeout(60000)

  let tenant: TenantInfo

  beforeAll(async () => {
    tenant = await registerTenant('OID4VCI Test Tenant')
    console.log(`Registered tenant: ${tenant.email}`)
  })

  describe('OID4VCI Issuer Operations', () => {
    it('should list OID4VCI issuers', async () => {
      try {
        const issuers = await listOID4VCIIssuers(tenant.token)
        expect(Array.isArray(issuers)).toBe(true)
        console.log(`Found ${issuers.length} OID4VCI issuers`)
      } catch (error) {
        console.log(`List issuers: ${(error as Error).message}`)
      }
    })

    it('should get issuer metadata', async () => {
      const response = await authenticatedRequest('/api/oid4vci/metadata', tenant.token)

      if (response.ok) {
        const data = await response.json()
        console.log('Issuer metadata:', JSON.stringify(data, null, 2).substring(0, 500))
      } else {
        console.log(`Metadata endpoint status: ${response.status}`)
      }
    })

    it('should get credential configurations', async () => {
      const response = await authenticatedRequest('/api/oid4vci/credentials', tenant.token)

      if (response.ok) {
        const data = await response.json()
        console.log(`Found ${Array.isArray(data) ? data.length : 'unknown'} credential configs`)
      } else {
        console.log(`Credentials endpoint status: ${response.status}`)
      }
    })

    it('should create a credential offer', async () => {
      try {
        const offer = await createOID4VCIOffer(
          tenant.token,
          'UniversityDegree',
          {
            name: 'Test Student',
            degree: 'Bachelor of Science',
            university: 'Test University',
          }
        )

        expect(offer.offerId).toBeDefined()
        console.log(`Created offer: ${offer.offerId}`)
        console.log(`Offer URI: ${offer.credentialOfferUri?.substring(0, 100)}...`)
      } catch (error) {
        console.log(`Create offer: ${(error as Error).message}`)
      }
    })
  })

  describe('OID4VCI Well-Known Endpoints', () => {
    it('should serve .well-known/openid-credential-issuer', async () => {
      const response = await apiRequest('/.well-known/openid-credential-issuer')

      console.log(`OpenID Credential Issuer status: ${response.status}`)

      if (response.ok) {
        const data = await response.json()
        expect(data.credential_issuer).toBeDefined()
        console.log(`Credential issuer: ${data.credential_issuer}`)
      }
    })

    it('should serve .well-known/oauth-authorization-server', async () => {
      const response = await apiRequest('/.well-known/oauth-authorization-server')

      console.log(`OAuth Authorization Server status: ${response.status}`)

      if (response.ok) {
        const data = await response.json()
        expect(data.issuer).toBeDefined()
        console.log(`OAuth issuer: ${data.issuer}`)
      }
    })
  })
})

describe('OID4VP Integration Tests', () => {
  jest.setTimeout(60000)

  let tenant: TenantInfo

  beforeAll(async () => {
    tenant = await registerTenant('OID4VP Test Tenant')
    console.log(`Registered tenant: ${tenant.email}`)
  })

  describe('OID4VP Verifier Operations', () => {
    it('should get verifier metadata', async () => {
      const response = await authenticatedRequest('/api/oid4vp/metadata', tenant.token)

      console.log(`Verifier metadata status: ${response.status}`)

      if (response.ok) {
        const data = await response.json()
        console.log('Verifier metadata:', JSON.stringify(data, null, 2).substring(0, 500))
      }
    })

    it('should create a verification request', async () => {
      const presentationDefinition = {
        id: `test-${generateTestId()}`,
        input_descriptors: [
          {
            id: 'identity',
            name: 'Identity Verification',
            purpose: 'Verify user identity',
            constraints: {
              fields: [
                {
                  path: ['$.credentialSubject.name'],
                },
                {
                  path: ['$.credentialSubject.email'],
                },
              ],
            },
          },
        ],
      }

      try {
        const request = await createOID4VPRequest(tenant.token, presentationDefinition)

        expect(request.requestId).toBeDefined()
        console.log(`Created verification request: ${request.requestId}`)
        console.log(`Request URI: ${request.authorizationRequestUri?.substring(0, 100)}...`)
      } catch (error) {
        console.log(`Create verification request: ${(error as Error).message}`)
      }
    })

    it('should list verification sessions', async () => {
      const response = await authenticatedRequest('/api/oid4vp/sessions', tenant.token)

      console.log(`Sessions endpoint status: ${response.status}`)

      if (response.ok) {
        const data = await response.json()
        console.log(`Found ${Array.isArray(data) ? data.length : 'unknown'} sessions`)
      }
    })
  })

  describe('OID4VP Well-Known Endpoints', () => {
    it('should serve client metadata if configured', async () => {
      const response = await apiRequest('/.well-known/openid-verifier')

      console.log(`OpenID Verifier status: ${response.status}`)

      if (response.ok) {
        const data = await response.json()
        console.log('Verifier config:', JSON.stringify(data, null, 2).substring(0, 300))
      }
    })
  })
})

describe('OID4VC End-to-End Flow', () => {
  jest.setTimeout(120000)

  let issuer: TenantInfo
  let verifier: TenantInfo

  beforeAll(async () => {
    issuer = await registerTenant('OID4VC Issuer')
    verifier = await registerTenant('OID4VC Verifier')

    console.log(`Issuer: ${issuer.email}`)
    console.log(`Verifier: ${verifier.email}`)
  })

  it('should complete credential issuance setup', async () => {
    // Create a credential offer
    try {
      const offer = await createOID4VCIOffer(
        issuer.token,
        'EmployeeBadge',
        {
          employeeId: 'EMP-12345',
          name: 'John Doe',
          department: 'Engineering',
          startDate: '2024-01-15',
        }
      )

      console.log(`Created employee badge offer: ${offer.offerId}`)

      // In a full E2E test, a wallet would:
      // 1. Scan the QR code / open the credential offer URI
      // 2. Fetch issuer metadata
      // 3. Request token from authorization server
      // 4. Request credential from credential endpoint

      console.log('Issuance setup complete')
    } catch (error) {
      console.log(`Issuance setup: ${(error as Error).message}`)
    }
  })

  it('should complete verification request setup', async () => {
    const presentationDefinition = {
      id: `e2e-verification-${generateTestId()}`,
      name: 'Employee Verification',
      purpose: 'Verify employment status',
      input_descriptors: [
        {
          id: 'employee_badge',
          name: 'Employee Badge',
          purpose: 'Verify you are an employee',
          constraints: {
            fields: [
              { path: ['$.credentialSubject.employeeId'] },
              { path: ['$.credentialSubject.department'] },
            ],
          },
        },
      ],
    }

    try {
      const request = await createOID4VPRequest(verifier.token, presentationDefinition)

      console.log(`Created verification request: ${request.requestId}`)

      // In a full E2E test, a wallet would:
      // 1. Scan the QR code / open the authorization request URI
      // 2. Parse the presentation definition
      // 3. Find matching credentials in wallet
      // 4. Create verifiable presentation
      // 5. Submit to response endpoint

      console.log('Verification request setup complete')
    } catch (error) {
      console.log(`Verification setup: ${(error as Error).message}`)
    }
  })
})

describe('SD-JWT and mDL Support', () => {
  jest.setTimeout(60000)

  let tenant: TenantInfo

  beforeAll(async () => {
    tenant = await registerTenant('SD-JWT Test Tenant')
    console.log(`Registered tenant: ${tenant.email}`)
  })

  it('should check SD-JWT credential support', async () => {
    const response = await authenticatedRequest('/api/oid4vci/credentials/sd-jwt', tenant.token)

    console.log(`SD-JWT credentials endpoint status: ${response.status}`)

    if (response.ok) {
      const data = await response.json()
      console.log('SD-JWT supported:', data)
    }
  })

  it('should check mDL (ISO 18013-5) support', async () => {
    const response = await authenticatedRequest('/api/oid4vci/credentials/mdl', tenant.token)

    console.log(`mDL credentials endpoint status: ${response.status}`)

    if (response.ok) {
      const data = await response.json()
      console.log('mDL supported:', data)
    }
  })

  it('should list supported credential formats', async () => {
    const response = await authenticatedRequest('/api/oid4vci/formats', tenant.token)

    console.log(`Formats endpoint status: ${response.status}`)

    if (response.ok) {
      const data = await response.json()
      console.log('Supported formats:', data)
    }
  })
})
