import { Router, Request, Response } from 'express'
import { getAgent } from '../services/agentService'
import { db } from '../db/driver'
import { buildMdocClaimsFromNamespaces } from '../utils/mdlUtils'
import { cacheStores } from '../services/redis/cacheStore'
import { getMdocCertificateConfig, pemToBase64Der } from '../config/mdlCertificates'

const router = Router()

// Base URL for OpenID4VC (uses API_URL from env vars)
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002'

// Domain for did:web DIDs (e.g., 'api.example.com' -> did:web:api.example.com)
const didWebDomain = process.env.DID_WEB_DOMAIN || new URL(apiBaseUrl).host

// Platform tenant ID - required for platform-level DID operations
const PLATFORM_TENANT_ID = process.env.PLATFORM_TENANT_ID

/**
 * Platform DID Document
 *
 * Endpoint: GET /.well-known/did.json
 * Resolves: did:web:{domain} -> https://{domain}/.well-known/did.json
 *
 * This serves the PLATFORM's DID document (main platform issuer)
 * PUBLIC endpoint - no authentication required
 */
router.get('/did.json', async (req: Request, res: Response) => {
  try {
    if (!PLATFORM_TENANT_ID) {
      return res.status(503).json({
        success: false,
        message: 'Platform DID not configured. Set PLATFORM_TENANT_ID environment variable.',
      })
    }
    const agent = await getAgent({ tenantId: PLATFORM_TENANT_ID })
    const did = `did:web:${didWebDomain}`

    const keyBinding = await getOrCreateKeyBinding(agent, PLATFORM_TENANT_ID, did)
    const didDocument = buildDidDocument(did, keyBinding.publicKeyMultibase)

    res.set({
      'Content-Type': 'application/did+ld+json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    })

    res.status(200).json(didDocument)
  } catch (error: any) {
    console.error('Error serving /.well-known/did.json:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to serve DID document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

/**
 * IACA Certificate for mDL/mdoc Verification
 *
 * Endpoint: GET /.well-known/iaca-certificate
 *
 * Returns the IACA (root) certificate that wallets need to trust for mdoc verification.
 * This is a PUBLIC endpoint - no authentication required.
 *
 * Wallets should add this certificate to their trusted certificates list to verify
 * mdoc credentials issued by this platform.
 */
router.get('/iaca-certificate', async (req: Request, res: Response) => {
  try {
    const certConfig = await getMdocCertificateConfig()

    // Return in multiple formats for flexibility
    res.set({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    })

    res.status(200).json({
      // Base64 DER format (for programmatic use)
      certificate: pemToBase64Der(certConfig.iacaCertificate),
      // PEM format (for display/manual copy)
      pem: certConfig.iacaCertificate,
      // Issuer certificate (for chain verification)
      issuerCertificate: pemToBase64Der(certConfig.issuerCertificate),
      issuerCertificatePem: certConfig.issuerCertificate,
      // Metadata
      algorithm: certConfig.algorithm,
      isTestCertificate: process.env.MDL_USE_TEST_CERTIFICATES === 'true' || !process.env.MDL_ISSUER_CERT_PATH,
      message: 'Add this IACA certificate to your wallet\'s trusted certificates to verify mdoc credentials from this issuer.',
    })
  } catch (error: any) {
    console.error('Error serving IACA certificate:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to serve IACA certificate',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

export default router

/**
 * Tenant-Specific DID Documents
 *
 * These routes handle tenant-specific DIDs
 * Format: did:web:{domain}:issuers:{tenantId}
 * URL: https://{domain}/issuers/{tenantId}/did.json
 */
export function createIssuerRoutes(): Router {
  const issuerRouter = Router()

  issuerRouter.get('/:tenantId/did.json', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params

      if (!tenantId) {
        return res.status(400).json({ success: false, message: 'Tenant ID required' })
      }

      const agent = await getAgent({ tenantId })
      const did = `did:web:${didWebDomain}:issuers:${tenantId}`

      const keyBinding = await getOrCreateKeyBinding(agent, tenantId, did)
      const didDocument = buildDidDocument(did, keyBinding.publicKeyMultibase)

      res.set({
        'Content-Type': 'application/did+ld+json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      })

      res.status(200).json(didDocument)
    } catch (error: any) {
      console.error(`Error serving tenant DID document:`, error)
      res.status(500).json({
        success: false,
        message: 'Failed to serve DID document',
      })
    }
  })

  /**
   * OpenID4VCI Issuer Metadata Endpoint
   *
   * Endpoint: GET /issuers/:tenantId/.well-known/openid-credential-issuer
   *
   * Returns the issuer metadata for OpenID4VCI credential issuance.
   * This includes:
   * - credential_issuer: The issuer identifier URL
   * - credential_endpoint: Where to request credentials
   * - token_endpoint: Where to exchange pre-auth codes for access tokens
   * - credential_configurations_supported: List of credential types this issuer can issue
   *
   * PUBLIC endpoint - no authentication required
   */
  issuerRouter.get('/:tenantId/.well-known/openid-credential-issuer', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params

      if (!tenantId) {
        return res.status(400).json({ error: 'invalid_request', error_description: 'Tenant ID required' })
      }

      const issuerUrl = `${apiBaseUrl}/issuers/${tenantId}`

      // Get OID4VC credential definitions for this tenant
      // Query credential definitions with format = 'oid4vc' for this tenant
      let credentialConfigurations: Record<string, any> = {}
      let issuerDisplayName = process.env.ISSUER_NAME || 'Credential Issuer'

      try {
        // Query the database for credential definitions with format = 'oid4vc' or 'mso_mdoc'
        const result = await db.query(`
          SELECT cd.*, cd.overlay
          FROM credential_definitions cd
          WHERE cd.tenant_id = $1
            AND cd.format IN ('oid4vc', 'mso_mdoc')
        `, [tenantId])

        // If we have credential definitions, build configurations from them
        if (result.rows && result.rows.length > 0) {
          for (const credDef of result.rows) {
            const overlay = credDef.overlay || {}
            const meta = overlay.meta || {}
            const branding = overlay.branding || {}

            // Use the first credential's issuer name as the display name
            if (meta.issuer && issuerDisplayName === (process.env.ISSUER_NAME || 'Credential Issuer')) {
              issuerDisplayName = meta.issuer
            }

            // Build the credential configuration based on format
            const configId = credDef.tag || credDef.credential_definition_id || credDef.id

            if (credDef.format === 'mso_mdoc') {
              // Build mso_mdoc configuration
              const doctype = credDef.doctype || 'org.iso.18013.5.1.mDL'
              const namespaces = credDef.namespaces || {}

              // Build claims from namespaces
              const claims = buildMdocClaimsFromNamespaces(namespaces)

              credentialConfigurations[configId] = {
                format: 'mso_mdoc',
                doctype: doctype,
                scope: configId,
                cryptographic_binding_methods_supported: ['cose_key'],
                credential_signing_alg_values_supported: ['ES256', 'ES384', 'ES512'],
                display: [{
                  name: meta.name || `Mobile Document (${doctype.split('.').pop()})`,
                  description: meta.description || `ISO 18013-5 compliant mobile document`,
                  background_color: branding.primary_background_color || '#1E3A5F',
                  text_color: branding.text_color || '#FFFFFF',
                  logo: branding.logo ? { uri: branding.logo, alt_text: meta.name || configId } : undefined,
                  locale: 'en'
                }],
                claims
              }
            } else {
              // Build vc+sd-jwt configuration (existing logic)
              let claims: Record<string, any> = {}
              if (credDef.schema_attributes) {
                const attrs = Array.isArray(credDef.schema_attributes)
                  ? credDef.schema_attributes
                  : JSON.parse(credDef.schema_attributes || '[]')

                for (const attr of attrs) {
                  claims[attr] = {
                    display: [{ name: attr, locale: 'en' }]
                  }
                }
              }

              credentialConfigurations[configId] = {
                format: 'vc+sd-jwt',
                vct: configId,
                scope: configId,
                cryptographic_binding_methods_supported: ['jwk', 'did:jwk', 'did:key'],
                credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
                display: [{
                  name: meta.name || configId,
                  description: meta.description,
                  background_color: branding.primary_background_color,
                  text_color: branding.text_color || '#FFFFFF',
                  logo: branding.logo ? { uri: branding.logo, alt_text: meta.name || configId } : undefined,
                  locale: 'en'
                }],
                claims
              }
            }
          }
        }
      } catch (dbError: any) {
        console.warn('Failed to fetch credential definitions from database:', dbError.message)
        // Continue with empty configurations - issuer metadata is still valid
      }

      // Build the issuer metadata response
      const issuerMetadata = {
        credential_issuer: issuerUrl,
        credential_endpoint: `${issuerUrl}/credential`,
        token_endpoint: `${issuerUrl}/token`,
        authorization_server: issuerUrl,
        display: [{
          name: issuerDisplayName,
          locale: 'en'
        }],
        credential_configurations_supported: credentialConfigurations
      }

      res.set({
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      })

      res.status(200).json(issuerMetadata)
    } catch (error: any) {
      console.error(`Error serving OID4VCI issuer metadata:`, error)
      res.status(500).json({
        error: 'server_error',
        error_description: 'Failed to serve issuer metadata',
      })
    }
  })

  return issuerRouter
}

/**
 * Build W3C DID Document structure
 */
function buildDidDocument(did: string, publicKeyMultibase: string) {
  // Extract tenantId from did:web:{domain}:issuers:{tenantId}
  const parts = did.split(':')
  const tenantId = parts.length >= 5 ? parts[4] : null

  const services: any[] = [
    {
      id: `${did}#openbadges`,
      type: 'OpenBadgeIssuer',
      serviceEndpoint: `${apiBaseUrl}/api/openbadges`,
    },
  ]

  // Add OpenID4VCI service endpoint for tenant DIDs
  if (tenantId) {
    services.push({
      id: `${did}#openid4vci`,
      type: 'OpenID4VCI',
      serviceEndpoint: `${apiBaseUrl}/issuers/${tenantId}`,
    })
  }

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/multikey/v1',
      'https://w3id.org/security/data-integrity/v2',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#key-0`,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase,
      },
    ],
    authentication: [`${did}#key-0`],
    assertionMethod: [`${did}#key-0`],
    capabilityInvocation: [`${did}#key-0`],
    capabilityDelegation: [`${did}#key-0`],
    service: services,
  }
}

/**
 * Get or create key binding using OpenBadges module
 */
async function getOrCreateKeyBinding(
  agent: any,
  tenantId: string,
  did: string
): Promise<{ publicKeyMultibase: string; vmId: string }> {
  const vmId = `${did}#key-0`

  // Use distributed cache with getOrSet pattern
  return await cacheStores.keyBindings.getOrSet(
    tenantId,
    async () => {
      // Get the OpenBadges API from the agent
      const openbadgesApi = (agent.modules as any)?.openbadges

      if (!openbadgesApi) {
        throw new Error('OpenBadges module not registered in agent. Add OpenBadgesModule to agent configuration.')
      }

      // Ensure key binding exists via OpenBadges module
      const binding = await openbadgesApi.ensureBinding(did, vmId)

      console.log(`Created/loaded key binding for tenant ${tenantId}: ${vmId}`)

      return {
        publicKeyMultibase: binding.publicKeyMultibase,
        vmId: binding.vmId,
      }
    },
    3600  // 1 hour TTL
  )
}
