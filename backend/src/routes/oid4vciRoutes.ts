import { Router, Request, Response } from 'express'
import { getAgent } from '../services/agentService'
import { db } from '../db/driver'
import { auth } from '../middleware/authMiddleware'
import crypto from 'crypto'
import { buildMdocNamespaces, MDL_DOCTYPE } from '../utils/mdlUtils'
import { StateStore } from '../services/redis/stateStore'
import { cacheStores } from '../services/redis/cacheStore'
import { getMdocCertificateConfig, getIssuerCertificate, pemToBase64Der } from '../config/mdlCertificates'
import { Kms, Mdoc } from '@credo-ts/core'
import { transformPrivateKeyToPrivateJwk } from '@credo-ts/askar'
import {
  createAnonCredsOidcOffer,
  generateAnonCredsNonce,
  verifyAndIssueAnonCredsCredential,
} from '../services/oid4vci/anonCredsIssuance'
import type { AnonCredsCredentialOffer } from '@credo-ts/anoncreds'
import { issueOpenBadgeCredential } from '../services/oid4vci/openBadgeIssuance'
import { signJwtVc, signLdpVc, ensureDidKeyForW3c } from '../services/oid4vci/w3cIssuance'
import { OpenBadgesKeyBindingRepository } from '@ajna-inc/openbadges'

const router = Router()

// Base URL for OpenID4VC
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002'
const SD_JWT_ISSUER_DID_METHOD = (process.env.SD_JWT_ISSUER_DID_METHOD || 'key').toLowerCase()

// Pending offer structure for OID4VCI flow
interface WireTrace {
  offer?: unknown
  tokenResponse?: unknown
  credentialRequest?: unknown
  credentialResponse?: unknown
}

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
  status: 'pending' | 'token_issued' | 'credential_request_received' | 'credential_issued' | 'expired'
  format?: 'vc+sd-jwt' | 'mso_mdoc' | 'anoncreds' | 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc' | 'openbadge_v3'
  doctype?: string  // For mdoc: e.g., 'org.iso.18013.5.1.mDL'
  // AnonCreds-only fields (per docs/specs/anoncreds-oid4vci-profile.md)
  credDefId?: string
  anoncredsOffer?: AnonCredsCredentialOffer
  revRegId?: string
  // W3C VC / OBv3 fields
  vcContexts?: string[]
  vcTypes?: string[]
  achievement?: Record<string, any>
  proofSuite?: string
  signingAlg?: string
  wireTrace?: WireTrace
  createdAt: string  // ISO string for serialization
  expiresAt: string  // ISO string for serialization
}

async function getOrCreateSdJwtIssuerDid(agent: any): Promise<{ did: string; vmId: string }> {
  if (SD_JWT_ISSUER_DID_METHOD !== 'key') {
    throw new Error(`Unsupported SD_JWT_ISSUER_DID_METHOD: ${SD_JWT_ISSUER_DID_METHOD}`)
  }

  const created = await agent.dids.getCreatedDids({})
  const existing = created.find((d: any) => typeof d.did === 'string' && d.did.startsWith('did:key:'))
  if (existing?.did) {
    const did: string = existing.did
    // For did:key, the VM fragment equals the key identifier (everything after 'did:key:')
    const keyFragment = did.replace('did:key:', '')
    return { did, vmId: `${did}#${keyFragment}` }
  }

  const didResult = await agent.dids.create({
    method: 'key',
    options: {
      createKey: {
        type: {
          kty: 'OKP',
          crv: 'Ed25519',
        },
      },
    },
  })

  if (didResult.didState.state !== 'finished' || !didResult.didState.did) {
    const reason = (didResult.didState as any).reason || 'unknown error'
    throw new Error(`Failed to create did:key for SD-JWT issuer: ${reason}`)
  }

  const did: string = didResult.didState.did
  const keyFragment = did.replace('did:key:', '')
  return { did, vmId: `${did}#${keyFragment}` }
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
 * Hydrate a PendingOffer object from an oid4vci_pending_offers DB row,
 * including AnonCreds-specific columns when present. Centralised so all
 * call-sites pick up new columns automatically.
 */
function hydrateOfferFromRow(row: any): PendingOffer {
  const parseJson = (value: any): any => {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'object') return value
    try {
      return JSON.parse(value)
    } catch {
      return undefined
    }
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    credentialDefinitionId: row.credential_definition_id,
    credentialConfigurationId: row.credential_configuration_id,
    credentialData: row.credential_data,
    preAuthorizedCode: row.pre_authorized_code,
    txCode: row.tx_code ?? undefined,
    accessToken: row.access_token ?? undefined,
    cNonce: row.c_nonce ?? undefined,
    status: row.status,
    format: row.format ?? undefined,
    doctype: row.doctype ?? undefined,
    credDefId: row.cred_def_id ?? undefined,
    anoncredsOffer: parseJson(row.anoncreds_offer),
    revRegId: row.rev_reg_id ?? undefined,
    vcContexts: parseJson(row.vc_contexts),
    vcTypes: parseJson(row.vc_types),
    achievement: parseJson(row.achievement),
    wireTrace: parseJson(row.wire_trace),
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
  }
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

    // Resolve credential definition format.
    //
    // Storage split: OID4VC (SD-JWT) and mso_mdoc cred-defs live in the
    // `credential_definitions` DB table; AnonCreds cred-defs live in the
    // agent's anoncreds module (Askar). The DB query below catches the
    // first two; the agent fallback catches the third. Without this
    // fallback, AnonCreds cred-defs default to 'vc+sd-jwt' and the
    // SD-JWT signing path fires on AnonCreds schemas, which fails.
    let credFormat: PendingOffer['format']
    let doctype: string | undefined
    let supportsRevocation = false
    let vcContexts: string[] | undefined
    let vcTypes: string[] | undefined
    let achievementTemplate: Record<string, any> | undefined
    let proofSuite: string | undefined
    let signingAlg: string | undefined

    try {
      const credDefResult = await db.query(
        'SELECT format, doctype, vc_contexts, vc_types, achievement, proof_suite, signing_alg FROM credential_definitions WHERE credential_definition_id = $1 AND tenant_id = $2',
        [credentialDefinitionId, tenantId]
      )
      if (credDefResult.rows.length > 0) {
        const row = credDefResult.rows[0]
        if (row.format === 'mso_mdoc') credFormat = 'mso_mdoc'
        else if (row.format === 'anoncreds') credFormat = 'anoncreds'
        else if (row.format === 'oid4vc') credFormat = 'vc+sd-jwt'
        else if (
          row.format === 'jwt_vc_json' ||
          row.format === 'jwt_vc_json-ld' ||
          row.format === 'ldp_vc' ||
          row.format === 'openbadge_v3'
        ) {
          credFormat = row.format
        }
        doctype = row.doctype
        const parseJson = (v: any) => {
          if (v === null || v === undefined) return undefined
          if (typeof v === 'object') return v
          try { return JSON.parse(v) } catch { return undefined }
        }
        vcContexts = parseJson(row.vc_contexts)
        vcTypes = parseJson(row.vc_types)
        achievementTemplate = parseJson(row.achievement)
        proofSuite = row.proof_suite ?? undefined
        signingAlg = row.signing_alg ?? undefined
      }
    } catch (dbError: any) {
      console.warn('Failed to get credential definition format:', dbError.message)
    }

    // Fallback: not in the local table → look up the AnonCreds module.
    if (!credFormat) {
      try {
        const agent = await getAgent({ tenantId })
        const credDef = await agent.modules.anoncreds.getCredentialDefinition(credentialDefinitionId)
        if (credDef?.credentialDefinition) {
          credFormat = 'anoncreds'
        }
      } catch (e: any) {
        console.warn('AnonCreds cred-def lookup failed:', e.message)
      }
    }

    if (!credFormat) {
      // Default for ancient cred-defs with no metadata anywhere.
      credFormat = 'vc+sd-jwt'
      console.warn(
        `[oid4vci/offers] Could not determine format for credentialDefinitionId=${credentialDefinitionId}; defaulting to vc+sd-jwt`
      )
    }

    // For AnonCreds, mint the credential offer object (nonce + key_correctness_proof)
    // up front so it can be validated against the holder's blinded request later.
    let anoncredsOffer: AnonCredsCredentialOffer | undefined
    if (credFormat === 'anoncreds') {
      try {
        const agent = await getAgent({ tenantId })
        anoncredsOffer = await createAnonCredsOidcOffer(agent, credentialDefinitionId)

        // Detect revocation support so we can advertise it.
        try {
          const credDef = await agent.modules.anoncreds.getCredentialDefinition(credentialDefinitionId)
          supportsRevocation = !!credDef?.credentialDefinition?.value?.revocation
        } catch (e: any) {
          console.warn('AnonCreds revocation detection skipped:', e.message)
        }
      } catch (anoncredsError: any) {
        console.error('Failed to create AnonCreds offer:', anoncredsError)
        return res.status(500).json({
          error: 'server_error',
          error_description: `Failed to create AnonCreds offer: ${anoncredsError.message}`,
        })
      }
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
      credDefId: credFormat === 'anoncreds' ? credentialDefinitionId : undefined,
      anoncredsOffer,
      vcContexts,
      vcTypes,
      achievement: achievementTemplate,
      proofSuite,
      signingAlg,
      wireTrace: anoncredsOffer ? { offer: anoncredsOffer } : undefined,
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
          credential_data, pre_authorized_code, tx_code, status, format, doctype,
          cred_def_id, anoncreds_offer, wire_trace, vc_contexts, vc_types, achievement, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      `, [
        offerId, tenantId, credentialDefinitionId, credentialConfigurationId,
        JSON.stringify(credentialData), preAuthorizedCode, txCode, 'pending',
        credFormat, doctype,
        offer.credDefId ?? null,
        offer.anoncredsOffer ? JSON.stringify(offer.anoncredsOffer) : null,
        offer.wireTrace ? JSON.stringify(offer.wireTrace) : null,
        offer.vcContexts ? JSON.stringify(offer.vcContexts) : null,
        offer.vcTypes ? JSON.stringify(offer.vcTypes) : null,
        offer.achievement ? JSON.stringify(offer.achievement) : null,
        offer.expiresAt,
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
      format: credFormat,
      ...(credFormat === 'anoncreds' && {
        anoncredsOffer,
        revocationSupported: supportsRevocation,
      }),
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
          offer = hydrateOfferFromRow(row)
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

    // Generate access token. For AnonCreds offers, the c_nonce serves as the
    // AnonCreds credential request nonce — it must be a decimal string of at
    // least 80 bits (spec §5.2). For other formats keep the existing
    // base64url shape.
    const accessToken = generateCode(32)
    const cNonce = offer.format === 'anoncreds' ? generateAnonCredsNonce() : generateCode(16)

    // For AnonCreds, the c_nonce we hand out is the same one embedded in the
    // anoncredsOffer object — overwrite both so they stay in sync.
    if (offer.format === 'anoncreds' && offer.anoncredsOffer) {
      offer.anoncredsOffer = { ...offer.anoncredsOffer, nonce: cNonce }
    }

    // Update offer
    offer.accessToken = accessToken
    offer.cNonce = cNonce
    offer.status = 'token_issued'
    if (offer.wireTrace) {
      offer.wireTrace.tokenResponse = {
        access_token: '<redacted>',
        token_type: 'Bearer',
        expires_in: 300,
        c_nonce: cNonce,
        c_nonce_expires_in: 300,
      }
    }
    await pendingOffers.set(offer.id, offer)

    // Update database
    try {
      await db.query(
        `UPDATE oid4vci_pending_offers
         SET access_token = $1, c_nonce = $2, status = 'token_issued',
             anoncreds_offer = COALESCE($4, anoncreds_offer),
             wire_trace = COALESCE($5, wire_trace)
         WHERE id = $3`,
        [
          accessToken,
          cNonce,
          offer.id,
          offer.anoncredsOffer ? JSON.stringify(offer.anoncredsOffer) : null,
          offer.wireTrace ? JSON.stringify(offer.wireTrace) : null,
        ]
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
      // Non-standard: when format=anoncreds, surface the issuer-minted offer
      // object (schema_id, cred_def_id, key_correctness_proof, nonce). The
      // wallet needs this to build a blinded link-secret commitment per
      // docs/specs/anoncreds-oid4vci-profile.md §5–§6. The nonce is already
      // synced with c_nonce above. Wallets that don't speak this profile
      // ignore the field harmlessly.
      ...(offer.format === 'anoncreds' && offer.anoncredsOffer
        ? { anoncreds_offer: offer.anoncredsOffer }
        : {}),
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
          offer = hydrateOfferFromRow(result.rows[0])
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

    // ---- AnonCreds format branch (spec §6) ----
    // Trust only the offer's server-side format. The wallet's `format` field
    // is informational — never let it override server-side state, otherwise
    // a malicious or misconfigured wallet could trigger the AnonCreds branch
    // for an SD-JWT/mdoc offer.
    if (offer.format === 'anoncreds') {
      const proofType = proof?.proof_type
      if (proofType !== 'anoncreds') {
        return res.status(400).json({
          error: 'invalid_proof',
          error_description: `proof_type must be 'anoncreds' for anoncreds format (got '${proofType ?? 'undefined'}')`,
        })
      }
      const acProof = proof?.anoncreds
      if (!acProof || !acProof.blinded_ms || !acProof.blinded_ms_correctness_proof || !acProof.cred_def_id) {
        return res.status(400).json({
          error: 'invalid_proof',
          error_description: 'AnonCreds proof must include cred_def_id, blinded_ms, blinded_ms_correctness_proof and nonce',
        })
      }
      if (!offer.anoncredsOffer) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'No AnonCreds offer recorded for this session',
        })
      }

      // Mark that we received the request before doing the (potentially
      // slow) crypto so the studio UI can react in real-time.
      offer.status = 'credential_request_received'
      if (offer.wireTrace) offer.wireTrace.credentialRequest = acProof
      await pendingOffers.set(offer.id, offer)
      try {
        await db.query(
          `UPDATE oid4vci_pending_offers
           SET status = 'credential_request_received', wire_trace = $2
           WHERE id = $1`,
          [offer.id, offer.wireTrace ? JSON.stringify(offer.wireTrace) : null]
        )
      } catch (dbError) {
        console.warn('Failed to update offer status in database:', dbError)
      }

      try {
        const agent = await getAgent({ tenantId })
        const { credential } = await verifyAndIssueAnonCredsCredential(agent, {
          storedOffer: offer.anoncredsOffer,
          credentialRequest: acProof,
          attributeValues: offer.credentialData,
          revocationRegistryDefinitionId: offer.revRegId,
        })

        const newCNonceForNext = generateAnonCredsNonce()
        const responseBody = {
          format: 'anoncreds',
          credential,
          c_nonce: newCNonceForNext,
          c_nonce_expires_in: 300,
        }

        offer.status = 'credential_issued'
        offer.cNonce = newCNonceForNext
        if (offer.wireTrace) offer.wireTrace.credentialResponse = responseBody
        await pendingOffers.set(offer.id, offer)

        try {
          await db.query(
            `UPDATE oid4vci_pending_offers
             SET status = 'credential_issued', issued_at = NOW(),
                 c_nonce = $2, wire_trace = $3
             WHERE id = $1`,
            [offer.id, newCNonceForNext, offer.wireTrace ? JSON.stringify(offer.wireTrace) : null]
          )
        } catch (dbError) {
          console.warn('Failed to update offer status in database:', dbError)
        }

        return res.json(responseBody)
      } catch (acError: any) {
        console.error('Failed to issue AnonCreds credential:', acError)
        return res.status(400).json({
          error: 'invalid_proof',
          error_description: `AnonCreds issuance failed: ${acError.message}`,
        })
      }
    }
    // ---- end AnonCreds branch ----

    // ---- W3C VC / OBv3 branches (jwt_vc_json, jwt_vc_json-ld, ldp_vc, openbadge_v3) ----
    if (
      offer.format === 'jwt_vc_json' ||
      offer.format === 'jwt_vc_json-ld' ||
      offer.format === 'ldp_vc' ||
      offer.format === 'openbadge_v3'
    ) {
      const proofType = proof?.proof_type
      if (proofType && proofType !== 'jwt') {
        return res.status(400).json({
          error: 'invalid_proof',
          error_description: `proof_type must be 'jwt' for ${offer.format} (got '${proofType}')`,
        })
      }

      // Resolve holder DID from proof JWT (reuses the kid/jwk shape seen in
      // the SD-JWT branch). We tolerate missing proofs for openbadge_v3 since
      // OBv3 issuance can be holder-binding-optional.
      let holderDidLocal: string | undefined
      let holderJwkLocal: any
      if (proof?.jwt) {
        try {
          const [headerB64] = proof.jwt.split('.')
          const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
          if (header.jwk) {
            holderJwkLocal = header.jwk
            const jwkB64 = Buffer.from(JSON.stringify(header.jwk)).toString('base64url')
            holderDidLocal = `did:jwk:${jwkB64}`
          } else if (typeof header.kid === 'string' && header.kid.startsWith('did:')) {
            holderDidLocal = header.kid.split('#')[0]
          }
        } catch (proofError) {
          console.warn(`[${offer.format}] Failed to parse proof JWT:`, proofError)
        }
      }

      // Resolve schema attributes (best-effort) for non-OBv3 formats so we
      // can pass `credentialSubject` claims to the W3C signer.
      let claimAttrs: string[] = []
      try {
        const credDefResult = await db.query(
          'SELECT schema_attributes FROM credential_definitions WHERE credential_definition_id = $1 AND tenant_id = $2',
          [offer.credentialDefinitionId, tenantId]
        )
        if (credDefResult.rows.length > 0) {
          const row = credDefResult.rows[0]
          claimAttrs = Array.isArray(row.schema_attributes)
            ? row.schema_attributes
            : JSON.parse(row.schema_attributes || '[]')
        }
      } catch (e: any) {
        console.warn(`[${offer.format}] Schema-attrs lookup failed:`, e.message)
      }

      const credentialSubjectClaims: Record<string, any> = {}
      for (const attr of claimAttrs) {
        if (offer.credentialData[attr] !== undefined) {
          credentialSubjectClaims[attr] = offer.credentialData[attr]
        }
      }
      // If no schema attributes are recorded (e.g. OBv3 cred-def with achievement
      // template only), fall through to using credentialData directly.
      const fallbackClaims =
        claimAttrs.length === 0 ? { ...offer.credentialData } : credentialSubjectClaims

      const cNonceForNext = generateCode(16)

      try {
        const agent = await getAgent({ tenantId })

        if (offer.format === 'openbadge_v3') {
          const hostname = new URL(apiBaseUrl).host
          const issuerDid = `did:web:${hostname}:issuers:${tenantId}`
          const achievementSrc = offer.achievement || {}
          const recipient = offer.credentialData || {}

          const verificationMethod = `${issuerDid}#key-0`
          const openbadgesApi = (agent.modules as any)?.openbadges
          if (!openbadgesApi) {
            throw new Error('OpenBadges module not configured on tenant agent')
          }
          let binding = await openbadgesApi.ensureBinding(issuerDid, verificationMethod)
          // Self-heal stale binding records that were created before kmsKeyId
          // existed. Without kmsKeyId, DataIntegrityService cannot sign.
          if (!binding?.kmsKeyId) {
            console.warn('[OBv3] Stale key binding detected (missing kmsKeyId); recreating', { verificationMethod })
            const bindingRepo: any = agent.dependencyManager.resolve(OpenBadgesKeyBindingRepository as any)
            try {
              const stale = await bindingRepo.findByVmId(agent.context, verificationMethod)
              if (stale) {
                await bindingRepo.delete(agent.context, stale)
              }
            } catch (e: any) {
              console.warn('[OBv3] Failed deleting stale key binding:', e?.message || e)
            }
            binding = await openbadgesApi.ensureBinding(issuerDid, verificationMethod)
            if (!binding?.kmsKeyId) {
              throw new Error(`Failed to create kms-backed key binding for ${verificationMethod}`)
            }
          }

          const { credential: obCredential } = await issueOpenBadgeCredential(agent, {
            achievement: {
              id: (recipient as any).achievementId || (achievementSrc as any).id,
              type: (recipient as any).achievementTypeList || (achievementSrc as any).type,
              achievementType: (recipient as any).achievementType || (achievementSrc as any).achievementType,
              name: (recipient as any).achievementName || (achievementSrc as any).name || 'Achievement',
              description: (recipient as any).achievementDescription || (achievementSrc as any).description || '',
              criteria:
                (recipient as any).achievementCriteria
                  ? { narrative: (recipient as any).achievementCriteria }
                  : (achievementSrc as any).criteria,
              image: (recipient as any).achievementImage || (achievementSrc as any).image,
            },
            issuer: {
              id: issuerDid,
              name: process.env.ISSUER_NAME,
              url: process.env.ISSUER_URL,
            },
            recipient: {
              id: holderDidLocal || (recipient as any).recipientDid,
              name: (recipient as any).recipientName || (recipient as any).name,
              identifiers: (recipient as any).identifiers,
              extras: claimAttrs.length > 0 ? credentialSubjectClaims : undefined,
            },
            verificationMethod,
          })

          const responseBody = {
            format: 'ldp_vc',
            credential: obCredential,
            c_nonce: cNonceForNext,
            c_nonce_expires_in: 300,
          }

          offer.status = 'credential_issued'
          offer.cNonce = cNonceForNext
          if (offer.wireTrace) offer.wireTrace.credentialResponse = responseBody
          await pendingOffers.set(offer.id, offer)
          try {
            await db.query(
              `UPDATE oid4vci_pending_offers SET status = 'credential_issued', issued_at = NOW(), c_nonce = $2 WHERE id = $1`,
              [offer.id, cNonceForNext],
            )
          } catch (e) { console.warn('OBv3 offer update failed:', e) }
          return res.json(responseBody)
        }

        // jwt_vc_json / jwt_vc_json-ld / ldp_vc — use Credo's W3cCredentialsApi
        const { did: issuerDid, vmId } = await ensureDidKeyForW3c(agent, 'Ed25519')
        const types = (offer.vcTypes && offer.vcTypes.length > 0)
          ? offer.vcTypes
          : ['VerifiableCredential', offer.credentialConfigurationId]
        const contexts = offer.vcContexts
        const credentialSubject = {
          ...(holderDidLocal && { id: holderDidLocal }),
          ...fallbackClaims,
        }

        if (offer.format === 'ldp_vc') {
          const { credential } = await signLdpVc(agent, {
            types,
            issuerDid,
            verificationMethod: vmId,
            credentialSubject,
            contexts,
            proofType: offer.proofSuite || 'Ed25519Signature2020',
          })
          const responseBody = {
            format: 'ldp_vc',
            credential,
            c_nonce: cNonceForNext,
            c_nonce_expires_in: 300,
          }
          offer.status = 'credential_issued'
          offer.cNonce = cNonceForNext
          if (offer.wireTrace) offer.wireTrace.credentialResponse = responseBody
          await pendingOffers.set(offer.id, offer)
          try {
            await db.query(
              `UPDATE oid4vci_pending_offers SET status = 'credential_issued', issued_at = NOW(), c_nonce = $2 WHERE id = $1`,
              [offer.id, cNonceForNext],
            )
          } catch (e) { console.warn('ldp_vc offer update failed:', e) }
          return res.json(responseBody)
        }

        // jwt_vc_json or jwt_vc_json-ld
        const { jwt } = await signJwtVc(agent, {
          types,
          issuerDid,
          verificationMethod: vmId,
          credentialSubject,
          contexts,
          alg: offer.signingAlg || 'EdDSA',
          jsonLd: offer.format === 'jwt_vc_json-ld',
        })

        // Reference holderJwkLocal so it isn't flagged as unused; it's
        // available for future binding validation but not required by Credo
        // for signing.
        void holderJwkLocal

        const responseBody = {
          format: offer.format,
          credential: jwt,
          c_nonce: cNonceForNext,
          c_nonce_expires_in: 300,
        }

        offer.status = 'credential_issued'
        offer.cNonce = cNonceForNext
        if (offer.wireTrace) offer.wireTrace.credentialResponse = responseBody
        await pendingOffers.set(offer.id, offer)
        try {
          await db.query(
            `UPDATE oid4vci_pending_offers SET status = 'credential_issued', issued_at = NOW(), c_nonce = $2 WHERE id = $1`,
            [offer.id, cNonceForNext],
          )
        } catch (e) { console.warn('jwt_vc offer update failed:', e) }
        return res.json(responseBody)
      } catch (w3cError: any) {
        console.error(`[${offer.format}] Issuance failed:`, w3cError)
        return res.status(500).json({
          error: 'server_error',
          error_description: `${offer.format} issuance failed: ${w3cError.message}`,
        })
      }
    }
    // ---- end W3C / OBv3 branches ----

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

    // Demo/Fallback: If it's a dummy credential offer and not in DB, extract schema attributes from the provided credentialData
    if (schemaAttributes.length === 0 && offer.credentialData && Object.keys(offer.credentialData).length > 0) {
      schemaAttributes = Object.keys(offer.credentialData)
      console.log(`[OID4VCI] Falling back to credentialData keys for schema attributes: ${schemaAttributes.join(', ')}`)
    }

    // If not found in our table or credentialData, try to get from anoncreds module (for backward compatibility)
    if (schemaAttributes.length === 0 && offer.credentialDefinitionId) {
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

        // Get the IACA-signed issuer certificate from mdlCertificates config
        // This certificate is signed by the IACA root CA, which wallets trust
        const certConfig = await getMdocCertificateConfig()
        const issuerCertificate = await getIssuerCertificate()
        const issuerCertificateBase64 = pemToBase64Der(certConfig.issuerCertificate)
        console.log('[MDL] Using IACA-signed issuer certificate')

        // Import the issuer private key into the wallet for signing
        // The key is imported fresh each time but uses the same key material
        const { privateJwk } = transformPrivateKeyToPrivateJwk({
          type: {
            kty: 'EC',
            crv: 'P-256',
          },
          privateKey: new Uint8Array(certConfig.issuerPrivateKeyBytes),
        })
        const { keyId: issuerKeyId, publicJwk: issuerPublicJwk } = await agent.kms.importKey({
          privateJwk,
        })
        const issuerPublicJwkInstance = Kms.PublicJwk.fromPublicJwk(issuerPublicJwk)
        issuerCertificate.keyId = issuerKeyId
        console.log('[MDL] Issuer key imported, keyId:', issuerKeyId)

        // Cache the certificate info in Redis for the /trusted-certificates endpoint
        await cacheStores.issuerCertificates.set(tenantId, {
          issuerKey: { keyId: issuerKeyId, fingerprint: issuerPublicJwkInstance.legacyKeyId },
          issuerCertificate: null,
          certificateBase64: issuerCertificateBase64,
          iacaCertificateBase64: certConfig.iacaCertificate
            .replace(/-----BEGIN CERTIFICATE-----/g, '')
            .replace(/-----END CERTIFICATE-----/g, '')
            .replace(/\s+/g, ''),
        }, 86400) // 24 hours

        // Extract holder public key from proof JWT for device binding
        // The holder's JWK in the proof header represents their device key
        console.log('[MDL] Processing holder key for device binding...')
        let holderKey: Kms.PublicJwk | undefined
        let holderJwk: any = null

        if (proof?.jwt) {
          try {
            const [headerB64] = proof.jwt.split('.')
            const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
            if (header.jwk) {
              holderJwk = header.jwk
              console.log('[MDL] Holder JWK found in proof:', JSON.stringify(holderJwk))

              holderKey = Kms.PublicJwk.fromUnknown(holderJwk)
              console.log('[MDL] Created holder key for binding')
            }
          } catch (jwkError: any) {
            console.warn('[MDL] Failed to process holder JWK from proof:', jwkError.message)
          }
        }

        // If no JWK in proof, create a new holder key (wallet-side binding)
        if (!holderKey) {
          console.log('[MDL] No holder JWK in proof, creating server-side device key...')
          const { publicJwk } = await agent.kms.createKey({
            type: {
              kty: 'EC',
              crv: 'P-256',
            },
          })
          holderKey = Kms.PublicJwk.fromPublicJwk(publicJwk)
        }

        // Sign the mdoc using Credo-TS Mdoc.sign()
        // issuerCertificate must be base64-encoded DER string (IACA-signed)
        console.log('[MDL] Signing mdoc with IACA-signed certificate...')
        const now = new Date()
        const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)

        const signedMdoc = await Mdoc.sign(agent.context, {
          docType: mdocDoctype,
          namespaces,
          holderKey,
          issuerCertificate,
          validityInfo: {
            signed: now,
            validFrom: now,
            validUntil: oneYearFromNow
          }
        })
        console.log('[MDL] Mdoc signed successfully with IACA-trusted certificate')

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

    // Handle SD-JWT VC format - Sign using Credo's SdJwtVcModule
    try {
      const agent = await getAgent({ tenantId })
      // did:key DIDs are created and managed by Credo's DID repository directly —
      // no ensureBinding needed; Credo resolves the key from the created DID record.
      const { did: issuerDid, vmId } = await getOrCreateSdJwtIssuerDid(agent)
      console.log(`[SD-JWT] Using issuer DID: ${issuerDid}, vmId: ${vmId}`)

      // Build credential claims from schema attributes and provided data
      const credentialClaims: Record<string, any> = {}
      for (const attrName of schemaAttributes) {
        if (offer.credentialData[attrName] !== undefined) {
          credentialClaims[attrName] = offer.credentialData[attrName]
        }
      }

      // Extract holder key binding from the wallet's proof JWT (per OID4VCI
      // §7.2). Bifold and Credo wallets emit one of two shapes depending on
      // the binding method picked by their resolver:
      //   1. `header.jwk` — raw JWK binding ("method: jwk")
      //   2. `header.kid` starting with `did:` — DID-based binding (did:jwk
      //      or did:key); the kid is a verification-method id
      //
      // If we don't surface either to Credo's sdJwtVc.sign, the resulting
      // credential is unbound — no `cnf` claim — and wallets that read
      // `cnf.kid` for display purposes crash with
      // "cannot read property kid of undefined".
      let holderBinding: { method: 'jwk'; jwk: any } | { method: 'did'; didUrl: string } | undefined
      if (proof?.jwt) {
        try {
          const [headerB64] = proof.jwt.split('.')
          const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
          if (header.jwk) {
            holderBinding = { method: 'jwk', jwk: header.jwk }
            console.log('[SD-JWT] Holder key binding extracted from proof JWT (jwk)')
          } else if (typeof header.kid === 'string' && header.kid.startsWith('did:')) {
            // The kid is a verification method id. Ensure it includes the
            // fragment — strip-and-rebuild only if a bare did was sent.
            const didUrl = header.kid.includes('#') ? header.kid : `${header.kid}#0`
            holderBinding = { method: 'did', didUrl }
            console.log('[SD-JWT] Holder key binding extracted from proof JWT (did)', didUrl)
          } else {
            console.warn(
              '[SD-JWT] Proof header has neither `jwk` nor a `did:` kid — credential will be unbound. Header:',
              JSON.stringify(header),
            )
          }
        } catch (proofError) {
          console.warn('[SD-JWT] Failed to extract holder binding from proof:', proofError)
        }
      }

      // Build SD-JWT VC payload
      const sdJwtPayload = {
        vct: offer.credentialConfigurationId || credDefTag,  // Verifiable Credential Type
        iss: issuerDid,
        iat: Math.floor(Date.now() / 1000),
        ...credentialClaims,
      }

      // Sign the SD-JWT VC using Credo
      console.log('[SD-JWT] Signing credential with issuer:', vmId)
      const signedSdJwt = await agent.sdJwtVc.sign({
        payload: sdJwtPayload,
        holder: holderBinding,
        issuer: {
          method: 'did',
          didUrl: vmId,
        },
        disclosureFrame: {
          _sd: schemaAttributes,  // Make all attributes selectively disclosable
        },
      })

      console.log('[SD-JWT] Credential signed successfully')

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
        credential: signedSdJwt.compact,  // Properly signed SD-JWT string
        c_nonce: newCNonce,
        c_nonce_expires_in: 300,
      })
    } catch (sdJwtError: any) {
      console.error('[SD-JWT] Failed to sign credential:', sdJwtError)
      return res.status(500).json({
        error: 'server_error',
        error_description: `Failed to sign SD-JWT credential: ${sdJwtError.message}`
      })
    }
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

/**
 * Get the captured wire-trace for an offer (RI / debugging aid).
 *
 * GET /api/oid4vci/offers/:offerId/wire-trace
 *
 * Returns the JSON payloads observed at each step of the OID4VCI flow:
 * offer object, token response, credential request, credential response.
 * Used by the studio's WirePayloadInspector — vendors can diff their bytes
 * against what we recorded.
 */
router.get('/offers/:offerId/wire-trace', auth, async (req: Request, res: Response) => {
  try {
    const { offerId } = req.params
    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    let offer = await pendingOffers.get(offerId)
    if (!offer || offer.tenantId !== tenantId) {
      try {
        const result = await db.query(
          'SELECT * FROM oid4vci_pending_offers WHERE id = $1 AND tenant_id = $2',
          [offerId, tenantId]
        )
        if (result.rows.length > 0) {
          offer = hydrateOfferFromRow(result.rows[0])
        }
      } catch {
        /* table may not yet exist */
      }
    }
    if (!offer) {
      return res.status(404).json({ error: 'not_found' })
    }

    return res.json({
      offerId,
      format: offer.format,
      status: offer.status,
      wireTrace: offer.wireTrace ?? null,
    })
  } catch (error: any) {
    console.error('Error getting wire trace:', error)
    return res.status(500).json({ error: 'server_error', error_description: error.message })
  }
})

/**
 * OID4VCI Nonce Endpoint (per OID4VCI 1.0 §8 / spec §5.1)
 *
 * POST /issuers/:tenantId/nonce
 *
 * Returns a fresh c_nonce. For AnonCreds-tagged sessions the nonce is a
 * decimal string ≥ 80 bits. Other sessions get the existing base64url
 * nonce. Public endpoint — wallets call this without auth.
 */
router.post('/:tenantId/nonce', async (req: Request, res: Response) => {
  try {
    const accessToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const tenantId = req.params.tenantId

    let offer: PendingOffer | null = null
    if (accessToken) {
      offer = await pendingOffers.findOne(
        (o) => o.accessToken === accessToken && o.tenantId === tenantId
      )
    }

    const cNonce = offer?.format === 'anoncreds'
      ? generateAnonCredsNonce()
      : generateCode(16)

    if (offer) {
      offer.cNonce = cNonce
      if (offer.format === 'anoncreds' && offer.anoncredsOffer) {
        offer.anoncredsOffer = { ...offer.anoncredsOffer, nonce: cNonce }
      }
      await pendingOffers.set(offer.id, offer)
      try {
        await db.query(
          `UPDATE oid4vci_pending_offers
           SET c_nonce = $2,
               anoncreds_offer = COALESCE($3, anoncreds_offer)
           WHERE id = $1`,
          [offer.id, cNonce, offer.anoncredsOffer ? JSON.stringify(offer.anoncredsOffer) : null]
        )
      } catch (dbError) {
        console.warn('Failed to persist refreshed nonce:', dbError)
      }
    }

    return res.json({ c_nonce: cNonce, c_nonce_expires_in: 300 })
  } catch (error: any) {
    console.error('Error in nonce endpoint:', error)
    return res.status(500).json({ error: 'server_error', error_description: 'Failed to generate nonce' })
  }
})

export default router
