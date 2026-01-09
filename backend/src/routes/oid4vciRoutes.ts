import { Router, Request, Response } from 'express'
import { getAgent } from '../services/agentService'
import { db } from '../db/driver'
import { auth } from '../middleware/authMiddleware'
import crypto from 'crypto'
import { buildMdocNamespaces, MDL_DOCTYPE } from '../utils/mdlUtils'
import { StateStore } from '../services/redis/stateStore'
import { cacheStores } from '../services/redis/cacheStore'

const router = Router()

// Base URL for OpenID4VC
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002'

// Pending offer structure for OID4VCI flow
interface PendingOffer {
  id: string
  tenantId: string
  credentialDefinitionId: string
  credentialConfigurationId: string
  credentialData: Record<string, any>
  preAuthorizedCode: string
  txCode?: string
  accessToken?: string
  cNonce?: string
  status: 'pending' | 'token_issued' | 'credential_issued' | 'expired'
  format?: 'vc+sd-jwt' | 'mso_mdoc'  // Credential format
  doctype?: string  // For mdoc: e.g., 'org.iso.18013.5.1.mDL'
  createdAt: string  // ISO string for serialization
  expiresAt: string  // ISO string for serialization
}

// Distributed state store for pending offers (Redis with in-memory fallback)
const pendingOffers = new StateStore<PendingOffer>({
  prefix: 'oid4vci:offers:',
  defaultTtlSeconds: 600  // 10 minutes
})

// Helper to generate random strings
function generateCode(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url')
}

/**
 * Create a credential offer
 *
 * POST /api/oid4vci/offers
 *
 * Creates a new credential offer that can be scanned by a wallet
 * Returns the offer URI and QR code data
 */
router.post('/offers', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return res.status(401).json({ error: 'unauthorized', error_description: 'Tenant ID required' })
    }

    const {
      credentialDefinitionId,
      credentialConfigurationId,
      credentialData,
      txCodeRequired = false,
    } = req.body

    if (!credentialDefinitionId || !credentialConfigurationId || !credentialData) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'credentialDefinitionId, credentialConfigurationId, and credentialData are required'
      })
    }

    // Generate unique identifiers
    const offerId = crypto.randomUUID()
    const preAuthorizedCode = generateCode(32)
    const txCode = txCodeRequired ? generateCode(6).substring(0, 6).toUpperCase() : undefined

    // Get credential definition format and doctype from database
    let credFormat: 'vc+sd-jwt' | 'mso_mdoc' = 'vc+sd-jwt'
    let doctype: string | undefined

    try {
      const credDefResult = await db.query(
        'SELECT format, doctype FROM credential_definitions WHERE credential_definition_id = $1 AND tenant_id = $2',
        [credentialDefinitionId, tenantId]
      )
      if (credDefResult.rows.length > 0) {
        const row = credDefResult.rows[0]
        credFormat = row.format === 'mso_mdoc' ? 'mso_mdoc' : 'vc+sd-jwt'
        doctype = row.doctype
      }
    } catch (dbError: any) {
      console.warn('Failed to get credential definition format:', dbError.message)
    }

    // Create the pending offer
    const now = new Date()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry
    const offer: PendingOffer = {
      id: offerId,
      tenantId,
      credentialDefinitionId,
      credentialConfigurationId,
      credentialData,
      preAuthorizedCode,
      txCode,
      status: 'pending',
      format: credFormat,
      doctype,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await pendingOffers.set(offerId, offer)

    // Build the credential offer URI
    const issuerUrl = `${apiBaseUrl}/issuers/${tenantId}`
    const credentialOfferUri = buildCredentialOfferUri(issuerUrl, preAuthorizedCode, credentialConfigurationId, txCodeRequired)

    // Store in database for persistence
    try {
      await db.query(`
        INSERT INTO oid4vci_pending_offers (
          id, tenant_id, credential_definition_id, credential_configuration_id,
          credential_data, pre_authorized_code, tx_code, status, format, doctype, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        offerId, tenantId, credentialDefinitionId, credentialConfigurationId,
        JSON.stringify(credentialData), preAuthorizedCode, txCode, 'pending',
        credFormat, doctype, offer.expiresAt
      ])
    } catch (dbError: any) {
      console.warn('Failed to persist offer to database (table may not exist yet):', dbError.message)
    }

    res.status(201).json({
      success: true,
      offerId,
      offerUri: credentialOfferUri,
      txCode: txCode || undefined,
      expiresAt: offer.expiresAt,
    })
  } catch (error: any) {
    console.error('Error creating credential offer:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to create credential offer'
    })
  }
})

/**
 * Get offer status
 *
 * GET /api/oid4vci/offers/:offerId/status
 */
router.get('/offers/:offerId/status', auth, async (req: Request, res: Response) => {
  try {
    const { offerId } = req.params
    const tenantId = req.user?.tenantId

    // Check distributed store first
    const offer = await pendingOffers.get(offerId)

    if (offer && offer.tenantId === tenantId) {
      // Check if expired
      if (new Date() > new Date(offer.expiresAt)) {
        offer.status = 'expired'
        await pendingOffers.set(offerId, offer)
      }

      return res.json({
        success: true,
        offerId: offer.id,
        status: offer.status,
        createdAt: offer.createdAt,
        expiresAt: offer.expiresAt,
      })
    }

    // Check database
    try {
      const result = await db.query(
        'SELECT * FROM oid4vci_pending_offers WHERE id = $1 AND tenant_id = $2',
        [offerId, tenantId]
      )

      if (result.rows.length > 0) {
        const dbOffer = result.rows[0]
        return res.json({
          success: true,
          offerId: dbOffer.id,
          status: dbOffer.status,
          createdAt: dbOffer.created_at,
          expiresAt: dbOffer.expires_at,
        })
      }
    } catch (dbError) {
      // Table might not exist
    }

    res.status(404).json({
      error: 'not_found',
      error_description: 'Offer not found'
    })
  } catch (error: any) {
    console.error('Error getting offer status:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to get offer status'
    })
  }
})

/**
 * Token Endpoint
 *
 * POST /issuers/:tenantId/token
 *
 * Exchanges a pre-authorized code for an access token
 * This is a PUBLIC endpoint called by the wallet
 */
router.post('/:tenantId/token', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params
    const {
      grant_type,
      'pre-authorized_code': preAuthorizedCode,
      tx_code: txCode,
    } = req.body

    // Validate grant type
    if (grant_type !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only pre-authorized_code grant type is supported'
      })
    }

    if (!preAuthorizedCode) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'pre-authorized_code is required'
      })
    }

    // Find the pending offer by pre-authorized code
    let offer: PendingOffer | null = null

    // Check distributed store
    offer = await pendingOffers.findOne(
      (o) => o.preAuthorizedCode === preAuthorizedCode && o.tenantId === tenantId
    )

    // Check database if not found in distributed store
    if (!offer) {
      try {
        const result = await db.query(
          'SELECT * FROM oid4vci_pending_offers WHERE pre_authorized_code = $1 AND tenant_id = $2',
          [preAuthorizedCode, tenantId]
        )
        if (result.rows.length > 0) {
          const row = result.rows[0]
          offer = {
            id: row.id,
            tenantId: row.tenant_id,
            credentialDefinitionId: row.credential_definition_id,
            credentialConfigurationId: row.credential_configuration_id,
            credentialData: row.credential_data,
            preAuthorizedCode: row.pre_authorized_code,
            txCode: row.tx_code,
            accessToken: row.access_token,
            cNonce: row.c_nonce,
            status: row.status,
            createdAt: new Date(row.created_at).toISOString(),
            expiresAt: new Date(row.expires_at).toISOString(),
          }
          await pendingOffers.set(offer.id, offer)
        }
      } catch (dbError) {
        console.warn('Database query failed:', dbError)
      }
    }

    if (!offer) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid pre-authorized code'
      })
    }

    // Check expiration
    if (new Date() > new Date(offer.expiresAt)) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Pre-authorized code has expired'
      })
    }

    // Check tx_code if required
    if (offer.txCode && offer.txCode !== txCode) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid transaction code'
      })
    }

    // Check if already used
    if (offer.status !== 'pending') {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Pre-authorized code has already been used'
      })
    }

    // Generate access token and c_nonce
    const accessToken = generateCode(32)
    const cNonce = generateCode(16)

    // Update offer
    offer.accessToken = accessToken
    offer.cNonce = cNonce
    offer.status = 'token_issued'
    await pendingOffers.set(offer.id, offer)

    // Update database
    try {
      await db.query(
        `UPDATE oid4vci_pending_offers
         SET access_token = $1, c_nonce = $2, status = 'token_issued'
         WHERE id = $3`,
        [accessToken, cNonce, offer.id]
      )
    } catch (dbError) {
      console.warn('Failed to update offer in database:', dbError)
    }

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 300, // 5 minutes
      c_nonce: cNonce,
      c_nonce_expires_in: 300,
    })
  } catch (error: any) {
    console.error('Error in token endpoint:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to process token request'
    })
  }
})

/**
 * Credential Endpoint
 *
 * POST /issuers/:tenantId/credential
 *
 * Issues a credential in exchange for an access token
 * This is a PUBLIC endpoint called by the wallet
 */
router.post('/:tenantId/credential', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params

    // Extract access token from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Access token required'
      })
    }
    const accessToken = authHeader.substring(7)

    const {
      format,
      credential_identifier,
      proof,
    } = req.body

    // Find offer by access token
    let offer: PendingOffer | null = null

    offer = await pendingOffers.findOne(
      (o) => o.accessToken === accessToken && o.tenantId === tenantId
    )

    // Check database if not found
    if (!offer) {
      try {
        const result = await db.query(
          'SELECT * FROM oid4vci_pending_offers WHERE access_token = $1 AND tenant_id = $2',
          [accessToken, tenantId]
        )
        if (result.rows.length > 0) {
          const row = result.rows[0]
          offer = {
            id: row.id,
            tenantId: row.tenant_id,
            credentialDefinitionId: row.credential_definition_id,
            credentialConfigurationId: row.credential_configuration_id,
            credentialData: row.credential_data,
            preAuthorizedCode: row.pre_authorized_code,
            txCode: row.tx_code,
            accessToken: row.access_token,
            cNonce: row.c_nonce,
            status: row.status,
            createdAt: new Date(row.created_at).toISOString(),
            expiresAt: new Date(row.expires_at).toISOString(),
          }
        }
      } catch (dbError) {
        console.warn('Database query failed:', dbError)
      }
    }

    if (!offer) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Invalid access token'
      })
    }

    if (offer.status === 'credential_issued') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Credential has already been issued for this offer'
      })
    }

    // Get schema attributes for this credential
    // First try to get from our OID4VC credential definitions table
    let schemaAttributes: string[] = []
    let credDefTag: string = offer.credentialConfigurationId

    try {
      const credDefResult = await db.query(
        'SELECT schema_attributes, tag FROM credential_definitions WHERE credential_definition_id = $1 AND tenant_id = $2',
        [offer.credentialDefinitionId, tenantId]
      )

      if (credDefResult.rows.length > 0) {
        const row = credDefResult.rows[0]
        schemaAttributes = Array.isArray(row.schema_attributes)
          ? row.schema_attributes
          : JSON.parse(row.schema_attributes || '[]')
        credDefTag = row.tag || credDefTag
      }
    } catch (dbError: any) {
      console.warn('Failed to get OID4VC credential definition from database:', dbError.message)
    }

    // If not found in our table, try to get from anoncreds module (for backward compatibility)
    if (schemaAttributes.length === 0) {
      try {
        const agent = await getAgent({ tenantId })
        const credDef = await agent.modules.anoncreds.getCredentialDefinition(offer.credentialDefinitionId)
        if (credDef?.credentialDefinition) {
          const schema = await agent.modules.anoncreds.getSchema(credDef.credentialDefinition.schemaId)
          if (schema?.schema) {
            schemaAttributes = schema.schema.attrNames
          }
        }
      } catch (agentError) {
        console.warn('Failed to get credential definition from anoncreds:', agentError)
      }
    }

    if (schemaAttributes.length === 0) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Credential definition not found or has no attributes'
      })
    }

    // Build the SD-JWT VC credential
    const hostname = new URL(apiBaseUrl).hostname
    const issuerDid = `did:web:${hostname}:issuers:${tenantId}`
    const issuanceDate = new Date().toISOString()

    // Extract holder binding from proof (did:jwk or did:key)
    let holderDid: string | undefined
    if (proof?.jwt) {
      try {
        const [headerB64] = proof.jwt.split('.')
        const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
        if (header.jwk) {
          // Use did:jwk for the holder
          const jwkB64 = Buffer.from(JSON.stringify(header.jwk)).toString('base64url')
          holderDid = `did:jwk:${jwkB64}`
        } else if (header.kid && header.kid.startsWith('did:')) {
          holderDid = header.kid.split('#')[0]
        }
      } catch (proofError) {
        console.warn('Failed to parse proof JWT:', proofError)
      }
    }

    // Generate new c_nonce for potential subsequent requests
    const newCNonce = generateCode(16)

    // Determine the format to use (from offer or request)
    const credentialFormat = offer.format || (format === 'mso_mdoc' ? 'mso_mdoc' : 'vc+sd-jwt')

    // Handle mso_mdoc format - mdoc credential issuance
    if (credentialFormat === 'mso_mdoc') {
      try {
        const agent = await getAgent({ tenantId })

        // Get doctype from offer or use default
        const mdocDoctype = offer.doctype || MDL_DOCTYPE

        // Build namespaces from credential data
        const namespaces = buildMdocNamespaces(offer.credentialData, mdocDoctype)

        // Import required classes from credo-ts
        const { Mdoc, KeyType, X509Service } = await import('@credo-ts/core')

        // Get or create persistent issuer key and certificate for this tenant
        // Note: Keys are stored in the wallet (PostgreSQL) and are shared across pods
        // We use Redis to cache the certificate and track which tenants have been initialized
        let certificateBase64: string
        let issuerKey: any

        // Check if we have a cached certificate in Redis
        const cachedCert = await cacheStores.issuerCertificates.get(tenantId)

        if (cachedCert && cachedCert.certificateBase64) {
          console.log('[MDL] Using cached certificate for tenant:', tenantId)
          certificateBase64 = cachedCert.certificateBase64
          // Create a new key for signing (keys are in shared wallet)
          // TODO: In production, store key fingerprint in DB and retrieve by fingerprint
          issuerKey = await agent.context.wallet.createKey({ keyType: KeyType.P256 })
        } else {
          // Create issuer key in the wallet
          console.log('[MDL] Creating NEW issuer key in wallet for tenant:', tenantId)
          issuerKey = await agent.context.wallet.createKey({ keyType: KeyType.P256 })
          console.log('[MDL] Issuer key created, fingerprint:', issuerKey.fingerprint)

          // Create X509 self-signed certificate using the wallet key
          console.log('[MDL] Creating X509 certificate...')
          const certNow = new Date()
          const oneYearFromNow = new Date(certNow.getTime() + 365 * 24 * 60 * 60 * 1000)

          const issuerCertificate = await X509Service.createSelfSignedCertificate(agent.context, {
            key: issuerKey,
            notBefore: certNow,
            notAfter: oneYearFromNow,
            name: 'C=US'
          })

          certificateBase64 = issuerCertificate.toString('base64')
          console.log('[MDL] X509 certificate created and cached in Redis')

          // Cache the certificate in Redis for other pods
          await cacheStores.issuerCertificates.set(tenantId, {
            issuerKey: { fingerprint: issuerKey.fingerprint },
            issuerCertificate: null,
            certificateBase64
          }, 86400) // 24 hours
        }

        // Create holder key for device binding
        console.log('[MDL] Creating holder key...')
        const holderKey = await agent.context.wallet.createKey({
          keyType: KeyType.P256
        })

        // Sign the mdoc using Credo-TS Mdoc.sign()
        // issuerCertificate must be base64-encoded DER string
        console.log('[MDL] Signing mdoc...')
        const now = new Date()
        const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

        const signedMdoc = await Mdoc.sign(agent.context, {
          docType: mdocDoctype,
          namespaces,
          holderKey,
          issuerCertificate: certificateBase64,
          validityInfo: {
            signed: now,
            validFrom: now,
            validUntil: oneYearFromNow
          }
        })
        console.log('[MDL] Mdoc signed successfully')

        // Update offer status
        offer.status = 'credential_issued'
        await pendingOffers.set(offer.id, offer)

        // Update database
        try {
          await db.query(
            `UPDATE oid4vci_pending_offers SET status = 'credential_issued', issued_at = NOW() WHERE id = $1`,
            [offer.id]
          )
        } catch (dbError) {
          console.warn('Failed to update offer status in database:', dbError)
        }

        return res.json({
          format: 'mso_mdoc',
          credential: signedMdoc.base64Url,
          c_nonce: newCNonce,
          c_nonce_expires_in: 300,
        })
      } catch (mdocError: any) {
        console.error('Failed to sign mdoc credential:', mdocError)
        return res.status(500).json({
          error: 'server_error',
          error_description: `Failed to sign mdoc credential: ${mdocError.message}`
        })
      }
    }

    // Handle SD-JWT VC format (existing logic)
    // Build credential claims from schema attributes and provided data
    const credentialSubject: Record<string, any> = {}
    for (const attrName of schemaAttributes) {
      if (offer.credentialData[attrName] !== undefined) {
        credentialSubject[attrName] = offer.credentialData[attrName]
      }
    }

    // Create a simple SD-JWT VC response
    // In production, this would use the OpenId4VcIssuerModule's credential signing
    const credential = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', credDefTag],
      issuer: issuerDid,
      issuanceDate,
      credentialSubject: {
        ...credentialSubject,
        ...(holderDid && { id: holderDid })
      }
    }

    // Update offer status
    offer.status = 'credential_issued'
    await pendingOffers.set(offer.id, offer)

    // Update database
    try {
      await db.query(
        `UPDATE oid4vci_pending_offers SET status = 'credential_issued', issued_at = NOW() WHERE id = $1`,
        [offer.id]
      )
    } catch (dbError) {
      console.warn('Failed to update offer status in database:', dbError)
    }

    res.json({
      format: 'vc+sd-jwt',
      credential: JSON.stringify(credential), // In production, this would be a signed SD-JWT
      c_nonce: newCNonce,
      c_nonce_expires_in: 300,
    })
  } catch (error: any) {
    console.error('Error in credential endpoint:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to issue credential'
    })
  }
})

/**
 * Build credential offer URI
 */
function buildCredentialOfferUri(
  issuerUrl: string,
  preAuthorizedCode: string,
  credentialConfigurationId: string,
  txCodeRequired: boolean
): string {
  const credentialOffer = {
    credential_issuer: issuerUrl,
    credential_configuration_ids: [credentialConfigurationId],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': preAuthorizedCode,
        ...(txCodeRequired && {
          tx_code: {
            input_mode: 'numeric',
            length: 6,
            description: 'Enter the transaction code'
          }
        })
      }
    }
  }

  const encodedOffer = encodeURIComponent(JSON.stringify(credentialOffer))
  return `openid-credential-offer://?credential_offer=${encodedOffer}`
}

/**
 * Get the trusted issuer certificate for mdoc verification
 *
 * GET /api/oid4vci/trusted-certificates
 *
 * Returns the issuer certificate that wallets need to trust for mdoc verification
 */
router.get('/trusted-certificates', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant ID required' })
    }

    const cache = await cacheStores.issuerCertificates.get(tenantId)
    if (!cache || !cache.certificateBase64) {
      return res.status(404).json({
        error: 'No issuer certificate found',
        message: 'Issue an mdoc credential first to generate the issuer certificate'
      })
    }

    // Return the certificate in multiple formats
    return res.json({
      certificates: [cache.certificateBase64],
      // PEM format for easy copying
      pem: `-----BEGIN CERTIFICATE-----\n${cache.certificateBase64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`,
      message: 'Add this certificate to your wallet\'s trusted certificates to verify mdoc credentials'
    })
  } catch (error: any) {
    console.error('Failed to get trusted certificates:', error)
    return res.status(500).json({
      error: 'Failed to get trusted certificates',
      message: error.message
    })
  }
})

export default router
