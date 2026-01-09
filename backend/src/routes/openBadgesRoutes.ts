import { Router, Request, Response } from 'express'
import { auth } from '../middleware/authMiddleware'
import { getAgent } from '../services/agentService'
import { sendBadgeNotification } from '../services/emailService'

const router = Router()

// Platform tenant ID - used for platform-level issuer determination
const PLATFORM_TENANT_ID = process.env.PLATFORM_TENANT_ID

// Domain for did:web DIDs (e.g., 'api.example.com' -> did:web:api.example.com)
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002'
const didWebDomain = process.env.DID_WEB_DOMAIN || new URL(apiBaseUrl).host

/**
 * Issue OpenBadge Credential
 * POST /api/openbadges/credentials/issue
 *
 * Issues a credential with DataIntegrityProof (eddsa-rdfc-2022)
 * Compatible with Credly and OBv3 certification
 */
router.post('/credentials/issue', auth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user
    const {
      recipientName,
      recipientDid,
      recipientEmail,
      connectionId,
      achievement,
      issuerName,
      issuerUrl,
      issuerDescription,
    } = req.body

    // Validate required fields
    if (!recipientName || !achievement?.name) {
      return res.status(400).json({
        success: false,
        message: 'recipientName and achievement.name are required',
      })
    }

    const agent = await getAgent({ tenantId })

    // Determine issuer DID based on tenant
    const isPlatformTenant = tenantId === PLATFORM_TENANT_ID
    const issuerDid = isPlatformTenant
      ? `did:web:${didWebDomain}`
      : `did:web:${didWebDomain}:issuers:${tenantId}`

    // Get the OpenBadges API from the agent
    // Note: This requires OpenBadgesModule to be registered in agentService.ts
    const openbadgesApi = (agent.modules as any).openbadges

    if (!openbadgesApi) {
      return res.status(500).json({
        success: false,
        message: 'OpenBadges module not configured. Add OpenBadgesModule to agent.',
      })
    }

    // Build the credential (Credly-compatible format)
    const credential = {
      '@context': [
        'https://www.w3.org/ns/credentials/v2',
        'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json',
        'https://purl.imsglobal.org/spec/ob/v3p0/extensions.json',
      ],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      credentialSchema: [
        {
          id: 'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json',
          type: '1EdTechJsonSchemaValidator2019',
        },
      ],
      issuer: {
        id: issuerDid,
        type: ['Profile'],
        name: issuerName || process.env.ISSUER_NAME || 'Your Organization',
        url: issuerUrl || process.env.ISSUER_URL || 'http://localhost:3000',
        ...(issuerDescription && { description: issuerDescription }),
      },
      validFrom: new Date().toISOString(),
      issuanceDate: new Date().toISOString(), // VC 1.1 compatibility for plain JSON validators
      name: recipientName,
      credentialSubject: {
        id: recipientDid || `urn:uuid:${crypto.randomUUID()}`,
        type: ['AchievementSubject'],
        achievement: {
          id: achievement.id || `urn:uuid:${crypto.randomUUID()}`,
          type: ['Achievement'],
          achievementType: achievement.achievementType || 'Badge',
          name: achievement.name,
          description: achievement.description || '',
          criteria: achievement.criteria || {
            narrative: 'Criteria not specified',
          },
          ...(achievement.image && { image: achievement.image }),
        },
      },
    }

    // Issue the credential (signs with eddsa-rdfc-2022)
    // IssuerService expects credential with proof.verificationMethod
    const credentialWithProof = {
      ...credential,
      proof: {
        verificationMethod: `${issuerDid}#key-0`,
      },
    }
    const record = await openbadgesApi.issueCredential(credentialWithProof)

    let sentViaDIDComm = false
    let emailSent = false

    // Send via DIDComm if connectionId provided
    if (connectionId) {
      try {
        // Pass the unsigned credential input (with verificationMethod hint) - sendCredential will sign it
        await openbadgesApi.sendCredential(connectionId, credentialWithProof)
        sentViaDIDComm = true
      } catch (err) {
        console.error('Failed to send via DIDComm:', err)
        // Continue - credential is still issued, just not sent
      }
    }

    // Send email notification if recipientEmail provided
    if (recipientEmail) {
      try {
        await sendBadgeNotification({
          to: recipientEmail,
          recipientName,
          achievementName: achievement.name,
          issuerName: issuerName || process.env.ISSUER_NAME || 'Essi Studio',
          credentialId: record.credential.id,
          imageUrl: achievement.image?.id || achievement.image,
        })
        emailSent = true
      } catch (err) {
        console.error('Failed to send email notification:', err)
        // Continue - credential is still issued
      }
    }

    res.status(201).json({
      success: true,
      credential: record.credential,
      sentViaDIDComm,
      emailSent,
    })
  } catch (error: any) {
    console.error('Error issuing OpenBadge:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to issue credential',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

/**
 * Verify OpenBadge Credential
 * POST /api/openbadges/credentials/verify
 *
 * PUBLIC endpoint - anyone can verify credentials
 * Supports Credly and other OBv3 credentials
 */
router.post('/credentials/verify', async (req: Request, res: Response) => {
  try {
    const { credential } = req.body

    if (!credential) {
      return res.status(400).json({
        success: false,
        message: 'credential is required in request body',
      })
    }

    // Use platform tenant for verification
    const agent = await getAgent({ tenantId: PLATFORM_TENANT_ID })

    const openbadgesApi = (agent.modules as any).openbadges

    if (!openbadgesApi) {
      return res.status(500).json({
        success: false,
        message: 'OpenBadges module not configured',
      })
    }

    const result = await openbadgesApi.verifyCredential(credential)

    // Extract useful info for response
    const issuer = credential.issuer
    const achievement = credential.credentialSubject?.achievement

    res.status(200).json({
      success: true,
      verified: result.verified,
      error: result.error,
      issuer: typeof issuer === 'string' ? { id: issuer } : issuer,
      achievement: achievement
        ? {
            name: achievement.name,
            description: achievement.description,
          }
        : undefined,
    })
  } catch (error: any) {
    console.error('Error verifying OpenBadge:', error)
    res.status(500).json({
      success: false,
      verified: false,
      message: 'Verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

/**
 * List issued OpenBadges for tenant
 * GET /api/openbadges/credentials
 */
router.get('/credentials', auth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user
    const agent = await getAgent({ tenantId })

    const openbadgesApi = (agent.modules as any).openbadges

    if (!openbadgesApi) {
      return res.status(200).json({
        success: true,
        credentials: [],
        count: 0,
        message: 'OpenBadges module not configured',
      })
    }

    const credentials = await openbadgesApi.getAllCredentials()

    res.status(200).json({
      success: true,
      credentials,
      count: credentials.length,
    })
  } catch (error: any) {
    console.error('Error listing OpenBadges:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to list credentials',
    })
  }
})

/**
 * Get single OpenBadge credential
 * GET /api/openbadges/credentials/:credentialId
 */
router.get('/credentials/:credentialId', auth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user
    const { credentialId } = req.params

    const agent = await getAgent({ tenantId })
    const openbadgesApi = (agent.modules as any).openbadges

    if (!openbadgesApi) {
      return res.status(404).json({
        success: false,
        message: 'OpenBadges module not configured',
      })
    }

    const credential = await openbadgesApi.getCredentialById(credentialId)

    if (!credential) {
      return res.status(404).json({
        success: false,
        message: 'Credential not found',
      })
    }

    res.status(200).json({
      success: true,
      credential,
    })
  } catch (error: any) {
    console.error('Error getting OpenBadge:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to get credential',
    })
  }
})

/**
 * Create Achievement Definition
 * POST /api/openbadges/achievements
 */
router.post('/achievements', auth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user
    const {
      name,
      description,
      criteria,
      image,
      achievementType = 'Badge',
      tags,
    } = req.body

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'name and description are required',
      })
    }

    const isPlatformTenant = tenantId === PLATFORM_TENANT_ID
    const creatorDid = isPlatformTenant
      ? `did:web:${didWebDomain}`
      : `did:web:${didWebDomain}:issuers:${tenantId}`

    const achievement = {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      achievementType,
      name,
      description,
      criteria: criteria || { narrative: 'Complete all requirements' },
      ...(image && { image }),
      ...(tags && { tag: tags }),
      creator: {
        id: creatorDid,
        type: ['Profile'],
      },
    }

    // TODO: Store in repository when OpenBadgesModule is configured
    // const agent = await getAgent({ tenantId })
    // await agent.modules.openbadges.storeAchievement(achievement)

    res.status(201).json({
      success: true,
      achievement,
    })
  } catch (error: any) {
    console.error('Error creating achievement:', error)
    res.status(500).json({
      success: false,
      message: 'Failed to create achievement',
    })
  }
})

/**
 * Get issuer profile
 * GET /api/openbadges/profile
 */
router.get('/profile', auth, async (req: Request, res: Response) => {
  try {
    const { tenantId } = (req as any).user

    const isPlatformTenant = tenantId === PLATFORM_TENANT_ID
    const issuerDid = isPlatformTenant
      ? `did:web:${didWebDomain}`
      : `did:web:${didWebDomain}:issuers:${tenantId}`

    const profile = {
      id: issuerDid,
      type: ['Profile'],
      name: process.env.ISSUER_NAME || 'Your Organization',
      url: process.env.ISSUER_URL || apiBaseUrl,
      description: process.env.ISSUER_DESCRIPTION || 'Digital credential issuer',
    }

    res.status(200).json({
      success: true,
      profile,
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
    })
  }
})

export default router
