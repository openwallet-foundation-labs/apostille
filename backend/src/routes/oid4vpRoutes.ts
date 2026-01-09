import { Router, Request, Response } from 'express'
import { getAgent } from '../services/agentService'
import { db } from '../db/driver'
import { auth } from '../middleware/authMiddleware'
import crypto from 'crypto'
import { StateStore } from '../services/redis/stateStore'

const router = Router()

// Base URL for OpenID4VC
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002'

// Verification session structure for OID4VP flow
interface VerificationSession {
  id: string
  tenantId: string
  verifierId: string
  presentationDefinition: any
  nonce: string
  state: string
  status: 'pending' | 'received' | 'verified' | 'failed'
  vpToken?: string
  verifiedClaims?: Record<string, any>
  createdAt: string  // ISO string for serialization
  expiresAt: string  // ISO string for serialization
}

// Distributed state store for verification sessions (Redis with in-memory fallback)
const verificationSessions = new StateStore<VerificationSession>({
  prefix: 'oid4vp:sessions:',
  defaultTtlSeconds: 600  // 10 minutes
})

// Helper to generate random strings
function generateCode(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url')
}

/**
 * Create a verification request (authorization request)
 *
 * POST /api/oid4vp/authorization-requests
 *
 * Creates a new verification request that can be scanned by a wallet
 */
router.post('/authorization-requests', auth, async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    if (!tenantId) {
      return res.status(401).json({ error: 'unauthorized', error_description: 'Tenant ID required' })
    }

    const {
      credentialTypes,
      requestedAttributes,
      purpose,
    } = req.body

    if (!credentialTypes || !Array.isArray(credentialTypes) || credentialTypes.length === 0) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'credentialTypes array is required'
      })
    }

    // Generate unique identifiers
    const sessionId = crypto.randomUUID()
    const nonce = generateCode(16)
    const state = generateCode(16)

    // Build presentation definition (DIF Presentation Exchange)
    const presentationDefinition = buildPresentationDefinition(
      sessionId,
      credentialTypes,
      requestedAttributes || [],
      purpose || 'Verification request'
    )

    // Create the verification session
    const now = new Date()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes expiry
    const session: VerificationSession = {
      id: sessionId,
      tenantId,
      verifierId: `verifier-${tenantId}`,
      presentationDefinition,
      nonce,
      state,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await verificationSessions.set(sessionId, session)

    // Store in database for persistence
    try {
      await db.query(`
        INSERT INTO oid4vp_verification_sessions (
          id, tenant_id, verifier_id, presentation_definition, nonce, state, status, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        sessionId, tenantId, session.verifierId, JSON.stringify(presentationDefinition),
        nonce, state, 'pending', expiresAt
      ])
    } catch (dbError: any) {
      console.warn('Failed to persist session to database (table may not exist yet):', dbError.message)
    }

    // Build the authorization request URI
    const verifierUrl = `${apiBaseUrl}/issuers/${tenantId}`
    const authRequestUri = buildAuthorizationRequestUri(verifierUrl, sessionId, presentationDefinition, nonce, state)

    res.status(201).json({
      success: true,
      sessionId,
      authorizationRequestUri: authRequestUri,
      expiresAt: session.expiresAt,
    })
  } catch (error: any) {
    console.error('Error creating authorization request:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to create authorization request'
    })
  }
})

/**
 * Get verification session status
 *
 * GET /api/oid4vp/sessions/:sessionId
 */
router.get('/sessions/:sessionId', auth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params
    const tenantId = req.user?.tenantId

    // Check distributed store first
    const session = await verificationSessions.get(sessionId)

    if (session && session.tenantId === tenantId) {
      // Check if expired
      if (new Date() > new Date(session.expiresAt) && session.status === 'pending') {
        session.status = 'failed'
        await verificationSessions.set(sessionId, session)
      }

      return res.json({
        success: true,
        sessionId: session.id,
        status: session.status,
        verifiedClaims: session.verifiedClaims,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })
    }

    // Check database
    try {
      const result = await db.query(
        'SELECT * FROM oid4vp_verification_sessions WHERE id = $1 AND tenant_id = $2',
        [sessionId, tenantId]
      )

      if (result.rows.length > 0) {
        const dbSession = result.rows[0]
        return res.json({
          success: true,
          sessionId: dbSession.id,
          status: dbSession.status,
          verifiedClaims: dbSession.verified_claims,
          createdAt: dbSession.created_at,
          expiresAt: dbSession.expires_at,
        })
      }
    } catch (dbError) {
      // Table might not exist
    }

    res.status(404).json({
      error: 'not_found',
      error_description: 'Session not found'
    })
  } catch (error: any) {
    console.error('Error getting session status:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to get session status'
    })
  }
})

/**
 * Authorization Response Endpoint (direct_post)
 *
 * POST /issuers/:tenantId/response
 *
 * Receives the presentation from the wallet
 * This is a PUBLIC endpoint called by the wallet
 */
router.post('/:tenantId/response', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params
    const {
      vp_token,
      presentation_submission,
      state,
    } = req.body

    if (!state) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'state parameter is required'
      })
    }

    // Find the session by state
    let session: VerificationSession | null = null

    session = await verificationSessions.findOne(
      (s) => s.state === state && s.tenantId === tenantId
    )

    // Check database if not found
    if (!session) {
      try {
        const result = await db.query(
          'SELECT * FROM oid4vp_verification_sessions WHERE state = $1 AND tenant_id = $2',
          [state, tenantId]
        )
        if (result.rows.length > 0) {
          const row = result.rows[0]
          session = {
            id: row.id,
            tenantId: row.tenant_id,
            verifierId: row.verifier_id,
            presentationDefinition: row.presentation_definition,
            nonce: row.nonce,
            state: row.state,
            status: row.status,
            vpToken: row.vp_token,
            verifiedClaims: row.verified_claims,
            createdAt: new Date(row.created_at).toISOString(),
            expiresAt: new Date(row.expires_at).toISOString(),
          }
          await verificationSessions.set(session.id, session)
        }
      } catch (dbError) {
        console.warn('Database query failed:', dbError)
      }
    }

    if (!session) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid state parameter'
      })
    }

    // Check expiration
    if (new Date() > new Date(session.expiresAt)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Session has expired'
      })
    }

    // Check if already processed
    if (session.status !== 'pending') {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Session has already been processed'
      })
    }

    // Store the vp_token
    session.vpToken = typeof vp_token === 'string' ? vp_token : JSON.stringify(vp_token)
    session.status = 'received'

    // Try to extract claims from vp_token
    let verifiedClaims: Record<string, any> = {}
    try {
      // Parse the vp_token (could be JWT or SD-JWT)
      if (typeof vp_token === 'string' && vp_token.includes('.')) {
        // JWT format - decode the payload
        const parts = vp_token.split('~') // SD-JWT uses ~ separator for disclosures
        const jwtPart = parts[0]
        const [, payloadB64] = jwtPart.split('.')
        if (payloadB64) {
          const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
          verifiedClaims = payload

          // Parse SD-JWT disclosures if present
          if (parts.length > 1) {
            for (let i = 1; i < parts.length; i++) {
              const disclosure = parts[i]
              if (disclosure) {
                try {
                  const decoded = JSON.parse(Buffer.from(disclosure, 'base64url').toString())
                  if (Array.isArray(decoded) && decoded.length >= 2) {
                    // Format: [salt, claim_name, claim_value] or [salt, claim_value] for array elements
                    if (decoded.length === 3) {
                      verifiedClaims[decoded[1]] = decoded[2]
                    }
                  }
                } catch (e) {
                  // Skip invalid disclosures
                }
              }
            }
          }
        }
      } else if (typeof vp_token === 'object') {
        // Direct object format
        verifiedClaims = vp_token
      }
    } catch (parseError) {
      console.warn('Failed to parse vp_token:', parseError)
    }

    session.verifiedClaims = verifiedClaims
    session.status = 'verified'
    await verificationSessions.set(session.id, session)

    // Update database
    try {
      await db.query(
        `UPDATE oid4vp_verification_sessions
         SET vp_token = $1, verified_claims = $2, status = 'verified', completed_at = NOW()
         WHERE id = $3`,
        [session.vpToken, JSON.stringify(verifiedClaims), session.id]
      )
    } catch (dbError) {
      console.warn('Failed to update session in database:', dbError)
    }

    // Return success - wallet will redirect user if redirect_uri was provided
    res.json({
      success: true,
    })
  } catch (error: any) {
    console.error('Error processing authorization response:', error)
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to process presentation'
    })
  }
})

/**
 * Build DIF Presentation Exchange Presentation Definition
 */
function buildPresentationDefinition(
  id: string,
  credentialTypes: string[],
  requestedAttributes: string[],
  purpose: string
): any {
  const inputDescriptors = credentialTypes.map((type, index) => {
    const descriptor: any = {
      id: `${type}-${index}`,
      name: type,
      purpose: purpose,
      constraints: {
        fields: [
          {
            path: ['$.type', '$.vct'],
            filter: {
              type: 'string',
              pattern: type
            }
          }
        ]
      }
    }

    // Add specific attribute requirements if provided
    if (requestedAttributes.length > 0) {
      for (const attr of requestedAttributes) {
        descriptor.constraints.fields.push({
          path: [`$.${attr}`, `$.credentialSubject.${attr}`, `$.vc.credentialSubject.${attr}`],
          optional: false
        })
      }
    }

    return descriptor
  })

  return {
    id,
    input_descriptors: inputDescriptors,
    purpose
  }
}

/**
 * Build SIOP authorization request URI
 */
function buildAuthorizationRequestUri(
  verifierUrl: string,
  sessionId: string,
  presentationDefinition: any,
  nonce: string,
  state: string
): string {
  const responseUri = `${verifierUrl}/response`

  const authRequest = {
    response_type: 'vp_token',
    response_mode: 'direct_post',
    response_uri: responseUri,
    client_id: verifierUrl,
    nonce,
    state,
    presentation_definition: presentationDefinition
  }

  const encodedRequest = encodeURIComponent(JSON.stringify(authRequest))
  return `openid4vp://?request=${encodedRequest}`
}

export default router
