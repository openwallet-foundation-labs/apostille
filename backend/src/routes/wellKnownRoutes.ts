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
        console.log(`[OID4VCI Metadata] Querying credential definitions for tenant: ${tenantId}`)

        const result = await db.query(`
          SELECT cd.*, cd.overlay
          FROM credential_definitions cd
          WHERE cd.tenant_id = $1
            AND cd.format IN ('oid4vc', 'mso_mdoc', 'anoncreds', 'jwt_vc_json', 'jwt_vc_json-ld', 'ldp_vc', 'openbadge_v3')
        `, [tenantId])

        console.log(`[OID4VCI Metadata] Found ${result.rows.length} credential definitions for tenant ${tenantId}`)
        if (result.rows.length === 0) {
          // Debug: check what credential definitions exist for any tenant
          const allCredDefs = await db.query(`
            SELECT tenant_id, tag, format, credential_definition_id
            FROM credential_definitions
            WHERE format IN ('oid4vc', 'mso_mdoc')
            LIMIT 10
          `)
          console.log(`[OID4VCI Metadata] DEBUG - All oid4vc/mso_mdoc credential definitions in DB:`,
            allCredDefs.rows.map(r => ({ tenant_id: r.tenant_id, tag: r.tag, format: r.format })))
        }

        // If we have credential definitions, build configurations from them
        // AnonCreds cred-defs live in the agent's anoncreds module, not in
        // the credential_definitions DB table. Fetch them separately and
        // merge into the metadata so wallets can discover anoncreds configs.
        try {
          const agent = await getAgent({ tenantId })
          const anoncredsDefs = await agent.modules.anoncreds.getCreatedCredentialDefinitions({})
          for (const def of anoncredsDefs) {
            const credDefId = def.credentialDefinitionId
            const credDefVal: any = def.credentialDefinition
            const schemaId = credDefVal.schemaId
            const tag = credDefVal.tag

            // Resolve schema to get attr names.
            let attrNames: string[] = []
            try {
              const schemaRes = await agent.modules.anoncreds.getSchema(schemaId)
              attrNames = schemaRes?.schema?.attrNames ?? []
            } catch {
              /* schema lookup best-effort */
            }

            const configId = tag || credDefId
            const claims: Record<string, any> = {}
            for (const attr of attrNames) {
              claims[attr] = { display: [{ name: attr, locale: 'en' }] }
            }
            credentialConfigurations[configId] = {
              format: 'anoncreds',
              scope: configId,
              cryptographic_binding_methods_supported: ['link_secret'],
              credential_signing_alg_values_supported: ['CLSignature2019'],
              proof_types_supported: {
                anoncreds: { proof_signing_alg_values_supported: ['CLSignature2019'] },
              },
              anoncreds: {
                schema: {
                  id: schemaId,
                  name: attrNames.length ? configId : configId,
                  version: '1.0',
                  attr_names: attrNames,
                },
                credential_definition: {
                  id: credDefId,
                  schema_id: schemaId,
                  type: 'CL',
                  tag,
                },
                revocation: { supported: !!credDefVal.value?.revocation },
              },
              display: [{ name: configId, locale: 'en' }],
              claims,
            }
          }
        } catch (anoncredsErr: any) {
          console.warn('AnonCreds metadata enumeration failed:', anoncredsErr.message)
        }

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

            if (credDef.format === 'anoncreds') {
              // Build AnonCreds configuration per docs/specs/anoncreds-oid4vci-profile.md §3.
              // Schema metadata is fetched lazily — fall back to attribute names from the row.
              const attrNames: string[] = credDef.schema_attributes
                ? (Array.isArray(credDef.schema_attributes)
                    ? credDef.schema_attributes
                    : JSON.parse(credDef.schema_attributes || '[]'))
                : []

              const claims: Record<string, any> = {}
              for (const attr of attrNames) {
                claims[attr] = { display: [{ name: attr, locale: 'en' }] }
              }

              credentialConfigurations[configId] = {
                format: 'anoncreds',
                scope: configId,
                cryptographic_binding_methods_supported: ['link_secret'],
                credential_signing_alg_values_supported: ['CLSignature2019'],
                proof_types_supported: {
                  anoncreds: {
                    proof_signing_alg_values_supported: ['CLSignature2019'],
                  },
                },
                anoncreds: {
                  schema: {
                    id: credDef.schema_id,
                    name: meta.schemaName || configId,
                    version: meta.schemaVersion || '1.0',
                    attr_names: attrNames,
                  },
                  credential_definition: {
                    id: credDef.credential_definition_id,
                    schema_id: credDef.schema_id,
                    type: 'CL',
                    tag: credDef.tag,
                  },
                  // Revocation flag is best-effort; the exact rev_reg_id is
                  // filled in by the issuer at issuance time.
                  revocation: {
                    supported: !!meta.supportRevocation,
                  },
                },
                display: [{
                  name: meta.name || configId,
                  description: meta.description,
                  background_color: branding.primary_background_color,
                  text_color: branding.text_color || '#FFFFFF',
                  logo: branding.logo ? { uri: branding.logo, alt_text: meta.name || configId } : undefined,
                  locale: 'en',
                }],
                claims,
              }
            } else if (
              credDef.format === 'jwt_vc_json' ||
              credDef.format === 'jwt_vc_json-ld' ||
              credDef.format === 'ldp_vc' ||
              credDef.format === 'openbadge_v3'
            ) {
              const parseJson = (v: any) => {
                if (v === null || v === undefined) return undefined
                if (typeof v === 'object') return v
                try { return JSON.parse(v) } catch { return undefined }
              }
              const vcTypes: string[] | undefined = parseJson(credDef.vc_types)
              const vcContexts: string[] | undefined = parseJson(credDef.vc_contexts)
              const achievement: any = parseJson(credDef.achievement)
              const attrs: string[] = Array.isArray(credDef.schema_attributes)
                ? credDef.schema_attributes
                : JSON.parse(credDef.schema_attributes || '[]')
              const claims: Record<string, any> = {}
              for (const attr of attrs) {
                claims[attr] = { display: [{ name: attr, locale: 'en' }] }
              }

              if (credDef.format === 'openbadge_v3') {
                // OBv3 is wire-format `ldp_vc` (wallet detects OBv3 from type[])
                credentialConfigurations[configId] = {
                  format: 'ldp_vc',
                  scope: configId,
                  credential_definition: {
                    '@context': [
                      'https://www.w3.org/ns/credentials/v2',
                      'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
                      ...(vcContexts ?? []),
                    ],
                    type: vcTypes && vcTypes.length > 0
                      ? vcTypes
                      : ['VerifiableCredential', 'OpenBadgeCredential'],
                  },
                  cryptographic_binding_methods_supported: ['did:key', 'did:jwk', 'did:web'],
                  credential_signing_alg_values_supported: ['EdDSA'],
                  proof_types_supported: {
                    jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
                  },
                  display: [{
                    name: meta.name || (achievement?.name) || configId,
                    description: meta.description || achievement?.description,
                    background_color: branding.primary_background_color,
                    text_color: branding.text_color || '#FFFFFF',
                    logo: branding.logo ? { uri: branding.logo, alt_text: meta.name || configId } : undefined,
                    locale: 'en',
                  }],
                  ...(achievement && { achievement }),
                  claims,
                }
              } else if (credDef.format === 'ldp_vc') {
                credentialConfigurations[configId] = {
                  format: 'ldp_vc',
                  scope: configId,
                  credential_definition: {
                    '@context': [
                      'https://www.w3.org/ns/credentials/v2',
                      ...(vcContexts ?? []),
                    ],
                    type: vcTypes && vcTypes.length > 0
                      ? vcTypes
                      : ['VerifiableCredential', configId],
                  },
                  cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
                  credential_signing_alg_values_supported: ['EdDSA'],
                  proof_types_supported: {
                    jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
                  },
                  display: [{
                    name: meta.name || configId,
                    description: meta.description,
                    background_color: branding.primary_background_color,
                    text_color: branding.text_color || '#FFFFFF',
                    logo: branding.logo ? { uri: branding.logo, alt_text: meta.name || configId } : undefined,
                    locale: 'en',
                  }],
                  claims,
                }
              } else {
                // jwt_vc_json or jwt_vc_json-ld
                const isJsonLd = credDef.format === 'jwt_vc_json-ld'
                credentialConfigurations[configId] = {
                  format: credDef.format,
                  scope: configId,
                  credential_definition: {
                    ...(isJsonLd && {
                      '@context': [
                        'https://www.w3.org/ns/credentials/v2',
                        ...(vcContexts ?? []),
                      ],
                    }),
                    type: vcTypes && vcTypes.length > 0
                      ? vcTypes
                      : ['VerifiableCredential', configId],
                  },
                  cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
                  credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
                  proof_types_supported: {
                    jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
                  },
                  display: [{
                    name: meta.name || configId,
                    description: meta.description,
                    background_color: branding.primary_background_color,
                    text_color: branding.text_color || '#FFFFFF',
                    logo: branding.logo ? { uri: branding.logo, alt_text: meta.name || configId } : undefined,
                    locale: 'en',
                  }],
                  claims,
                }
              }
            } else if (credDef.format === 'mso_mdoc') {
              // Build mso_mdoc configuration
              const doctype = credDef.doctype || 'org.iso.18013.5.1.mDL'
              const namespaces = credDef.namespaces || {}

              // Build claims from namespaces
              const claims = buildMdocClaimsFromNamespaces(namespaces)

              credentialConfigurations[configId] = {
                format: 'mso_mdoc',
                doctype: doctype,
                scope: configId,
                // Include jwk and did:jwk for Bifold/Credo compatibility, plus cose_key for standard compliance
                cryptographic_binding_methods_supported: ['jwk', 'did:jwk', 'did:key', 'cose_key'],
                credential_signing_alg_values_supported: ['ES256', 'ES384', 'ES512'],
                // Proof types supported - required for wallet to know how to prove key possession
                proof_types_supported: {
                  jwt: {
                    proof_signing_alg_values_supported: ['ES256', 'ES384', 'ES512']
                  }
                },
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
                // Proof types supported - required for wallet to know how to prove key possession
                proof_types_supported: {
                  jwt: {
                    proof_signing_alg_values_supported: ['EdDSA', 'ES256']
                  }
                },
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

      // DEMO: Inject dummy credentials if this is the platform tenant
      if (tenantId === PLATFORM_TENANT_ID) {
        const demoSdJwtConfigs = [
          { id: 'StudentID', name: 'Student ID', attrs: ['given_name', 'family_name', 'student_id', 'university', 'program', 'enrollment_year', 'expiry_date'] },
          { id: 'ProfessionalLicense', name: 'Professional License', attrs: ['given_name', 'family_name', 'license_number', 'profession', 'issuing_authority', 'issue_date', 'expiry_date'] },
          { id: 'EmployeeBadge', name: 'Employee Badge', attrs: ['given_name', 'family_name', 'employee_id', 'department', 'job_title', 'company', 'issue_date'] },
          { id: 'HealthInsurance', name: 'Health Insurance', attrs: ['given_name', 'family_name', 'member_id', 'plan_name', 'insurer', 'group_number', 'effective_date'] },
          { id: 'LoyaltyMembership', name: 'Loyalty Membership', attrs: ['given_name', 'family_name', 'member_id', 'tier', 'points', 'joined_date', 'program_name'] },
          { id: 'AgeVerification', name: 'Age Verification', attrs: ['given_name', 'family_name', 'birth_date', 'over_18', 'over_21', 'nationality'] }
        ];

        const demoObv3Configs = [
          { id: 'AcademicExcellence', name: "Dean's List for Academic Excellence", desc: 'Awarded for maintaining a GPA of 3.8 or higher during the academic year.' },
          { id: 'SkillsCertification', name: 'Cloud Computing Specialist', desc: 'Professional certification demonstrating proficiency in cloud architecture and deployment.' },
          { id: 'CourseCompletion', name: 'Introduction to Web Development', desc: 'Successfully completed the introductory course covering HTML, CSS, and JavaScript basics.' }
        ];

        for (const config of demoSdJwtConfigs) {
          if (!credentialConfigurations[config.id]) {
            const claims: Record<string, any> = {};
            for (const attr of config.attrs) {
              claims[attr] = { display: [{ name: attr, locale: 'en' }] };
            }
            credentialConfigurations[config.id] = {
              format: 'vc+sd-jwt',
              vct: config.id,
              scope: config.id,
              cryptographic_binding_methods_supported: ['jwk', 'did:jwk', 'did:key'],
              credential_signing_alg_values_supported: ['EdDSA', 'ES256'],
              proof_types_supported: {
                jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] }
              },
              display: [{ name: config.name, description: 'Demo Credential', background_color: '#1E3A5F', text_color: '#FFFFFF', locale: 'en' }],
              claims
            };
          }
        }

        for (const config of demoObv3Configs) {
          if (!credentialConfigurations[config.id]) {
            credentialConfigurations[config.id] = {
              format: 'ldp_vc',
              scope: config.id,
              credential_definition: {
                '@context': [
                  'https://www.w3.org/ns/credentials/v2',
                  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
                ],
                type: ['VerifiableCredential', 'OpenBadgeCredential']
              },
              cryptographic_binding_methods_supported: ['did:key', 'did:jwk', 'did:web'],
              credential_signing_alg_values_supported: ['EdDSA'],
              proof_types_supported: {
                jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] }
              },
              display: [{ name: config.name, description: config.desc, background_color: '#4C1D95', text_color: '#FFFFFF', locale: 'en' }],
              claims: {}
            };
          }
        }
      }

      // Check if tenantId looks like a UUID (valid format)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const isValidUuid = uuidRegex.test(tenantId)

      if (!isValidUuid) {
        console.warn(`[OID4VCI Metadata] WARNING: tenantId '${tenantId}' is not a valid UUID. Use your actual tenant UUID from login response.`)
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
        credential_configurations_supported: credentialConfigurations,
        // Debug info when no credentials are found (helps troubleshooting)
        ...(Object.keys(credentialConfigurations).length === 0 && {
          _debug: {
            message: 'No OID4VC or mdoc credential definitions found for this tenant',
            hint: isValidUuid
              ? 'Create an SD-JWT VC or mDL/mdoc credential definition in the dashboard'
              : `'${tenantId}' does not look like a valid tenant UUID. Use your actual tenant UUID from the login response.`,
            expectedFormat: 'UUID (e.g., 123e4567-e89b-12d3-a456-426614174000)'
          }
        })
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
