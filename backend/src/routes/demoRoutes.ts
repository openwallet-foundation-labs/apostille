import { Router, Request, Response } from 'express';
import { getAgent } from '../services/agentService';
import crypto from 'crypto';
import { StateStore } from '../services/redis/stateStore';
import { db } from '../db/driver';
import { MDL_DOCTYPE } from '../utils/mdlUtils';

const router = Router();
const DEMO_TENANT_ID = process.env.PLATFORM_TENANT_ID;
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002';

// Simplified PendingOffer interface to match what's in oid4vciRoutes.ts
interface PendingOffer {
  id: string
  tenantId: string
  credentialDefinitionId: string
  credentialConfigurationId: string
  credentialData: Record<string, any>
  preAuthorizedCode: string
  txCode?: string
  status: 'pending' | 'token_issued' | 'credential_request_received' | 'credential_issued' | 'expired'
  format?: 'vc+sd-jwt' | 'mso_mdoc' | 'anoncreds' | 'jwt_vc_json' | 'jwt_vc_json-ld' | 'ldp_vc' | 'openbadge_v3'
  doctype?: string
  vcContexts?: string[]
  vcTypes?: string[]
  achievement?: Record<string, any>
  createdAt: string
  expiresAt: string
}

const pendingOffers = new StateStore<PendingOffer>({
  prefix: 'oid4vci:offers:',
  defaultTtlSeconds: 600  // 10 minutes
});

function generateCode(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

function buildCredentialOfferUri(
  issuerUrl: string,
  preAuthorizedCode: string,
  credentialConfigurationId: string
): string {
  const credentialOffer = {
    credential_issuer: issuerUrl,
    credential_configuration_ids: [credentialConfigurationId],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': preAuthorizedCode,
      }
    }
  };
  
  const encodedOffer = encodeURIComponent(JSON.stringify(credentialOffer));
  return `openid-credential-offer://?credential_offer=${encodedOffer}`;
}

const DEMO_CREDENTIAL_TYPES: Record<string, any> = {
  // SD-JWT Tier
  'StudentID': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'StudentID',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Alice',
        family_name: family || 'Johnson',
        student_id: 'S1234567890',
        university: 'Digital University',
        program: 'Computer Science',
        enrollment_year: '2023',
        expiry_date: '2027-06-30'
      };
    }
  },
  'ProfessionalLicense': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'ProfessionalLicense',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Joyce',
        family_name: family || 'Smith',
        license_number: 'L-987654321',
        profession: 'Lawyer',
        issuing_authority: 'State Bar Association',
        issue_date: '2020-05-15',
        expiry_date: '2025-05-15'
      };
    }
  },
  'EmployeeBadge': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'EmployeeBadge',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Bob',
        family_name: family || 'Williams',
        employee_id: 'E-554433',
        department: 'Engineering',
        job_title: 'Senior Developer',
        company: 'Tech Corp',
        issue_date: '2022-01-10'
      };
    }
  },
  'HealthInsurance': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'HealthInsurance',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Charlie',
        family_name: family || 'Brown',
        member_id: 'M-11223344',
        plan_name: 'Premium Health',
        insurer: 'Global Care Provider',
        group_number: 'G-998877',
        effective_date: '2024-01-01'
      };
    }
  },
  'LoyaltyMembership': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'LoyaltyMembership',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Diana',
        family_name: family || 'Prince',
        member_id: 'LM-776655',
        tier: 'Gold',
        points: '15400',
        joined_date: '2021-11-20',
        program_name: 'SkyHigh Rewards'
      };
    }
  },
  'AgeVerification': {
    format: 'vc+sd-jwt',
    credentialConfigurationId: 'AgeVerification',
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      return {
        given_name: given || 'Eve',
        family_name: family || 'Adams',
        birth_date: '1995-08-14',
        over_18: true,
        over_21: true,
        nationality: 'US'
      };
    }
  },
  
  // OBv3 Tier
  'AcademicExcellence': {
    format: 'openbadge_v3',
    credentialConfigurationId: 'AcademicExcellence',
    generateData: (name: string) => ({ name: name || 'Alice Johnson' }),
    achievement: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      achievementType: 'Award',
      name: "Dean's List for Academic Excellence",
      description: 'Awarded for maintaining a GPA of 3.8 or higher during the academic year.',
      criteria: { narrative: 'Student must complete at least 12 credit hours with a minimum 3.8 GPA.' }
    }
  },
  'SkillsCertification': {
    format: 'openbadge_v3',
    credentialConfigurationId: 'SkillsCertification',
    generateData: (name: string) => ({ name: name || 'Bob Williams' }),
    achievement: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      achievementType: 'Certificate',
      name: 'Cloud Computing Specialist',
      description: 'Professional certification demonstrating proficiency in cloud architecture and deployment.',
      criteria: { narrative: 'Passed the Cloud Computing Specialist Exam with a score of 85% or higher.' }
    }
  },
  'CourseCompletion': {
    format: 'openbadge_v3',
    credentialConfigurationId: 'CourseCompletion',
    generateData: (name: string) => ({ name: name || 'Charlie Brown' }),
    achievement: {
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['Achievement'],
      achievementType: 'CourseRecord',
      name: 'Introduction to Web Development',
      description: 'Successfully completed the introductory course covering HTML, CSS, and JavaScript basics.',
      criteria: { narrative: 'Completed all course modules and the final capstone project.' }
    }
  },

  // mDL Tier (ISO 18013-5)
  'mDL': {
    format: 'mso_mdoc' as const,
    credentialConfigurationId: 'mDL',
    doctype: MDL_DOCTYPE,
    generateData: (name: string) => {
      const [given, family] = name.split(' ');
      const today = new Date();
      const expiry = new Date(today);
      expiry.setFullYear(expiry.getFullYear() + 5);
      return {
        given_name: given || 'Alice',
        family_name: family || 'Johnson',
        birth_date: '1990-07-15',
        document_number: 'DL-' + Math.floor(Math.random() * 9000000 + 1000000),
        issue_date: today.toISOString().split('T')[0],
        expiry_date: expiry.toISOString().split('T')[0],
        issuing_country: 'US',
        issuing_authority: 'Department of Motor Vehicles',
        issuing_jurisdiction: 'US-CA',
        driving_privileges: [
          { vehicle_category_code: 'B', issue_date: today.toISOString().split('T')[0], expiry_date: expiry.toISOString().split('T')[0] }
        ],
        age_over_18: true,
        age_over_21: true,
        portrait: '',  // wallets gracefully handle missing portrait
      };
    }
  }
};

router.post('/oid4vc-offer', async (req: Request, res: Response) => {
  if (!DEMO_TENANT_ID) {
    return res.status(503).json({
      error: 'server_error',
      error_description: 'Demo not configured. Set PLATFORM_TENANT_ID environment variable.'
    });
  }

  const { credentialType, recipientName } = req.body;
  const config = DEMO_CREDENTIAL_TYPES[credentialType];
  
  if (!config) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: `Unknown credential type: ${credentialType}`
    });
  }

  try {
    const offerId = crypto.randomUUID();
    const preAuthorizedCode = generateCode(32);
    const now = new Date();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    const credentialData = config.generateData(recipientName || '');
    
    // For OBv3, we must ensure the issuer key binding exists.
    if (config.format === 'openbadge_v3') {
      try {
        const agent = await getAgent({ tenantId: DEMO_TENANT_ID });
        const openbadgesApi = (agent.modules as any)?.openbadges;
        if (openbadgesApi) {
          const hostname = new URL(apiBaseUrl).host;
          const issuerDid = `did:web:${hostname}:issuers:${DEMO_TENANT_ID}`;
          const verificationMethod = `${issuerDid}#key-0`;
          await openbadgesApi.ensureBinding(issuerDid, verificationMethod);
        }
      } catch (e: any) {
        console.warn('Demo OBv3 ensureBinding failed:', e.message);
      }
    }

    const offer: PendingOffer = {
      id: offerId,
      tenantId: DEMO_TENANT_ID,
      credentialDefinitionId: `demo-${config.credentialConfigurationId}`, // Dummy ID, skipped by using format directly
      credentialConfigurationId: config.credentialConfigurationId,
      credentialData,
      preAuthorizedCode,
      status: 'pending',
      format: config.format,
      doctype: config.doctype,  // mDL / mso_mdoc doctype
      achievement: config.achievement,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    await pendingOffers.set(offerId, offer);

    // Also persist to DB just in case
    try {
      await db.query(`
        INSERT INTO oid4vci_pending_offers (
          id, tenant_id, credential_definition_id, credential_configuration_id,
          credential_data, pre_authorized_code, status, format, achievement, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        offerId, DEMO_TENANT_ID, offer.credentialDefinitionId, offer.credentialConfigurationId,
        JSON.stringify(credentialData), preAuthorizedCode, 'pending',
        config.format,
        offer.achievement ? JSON.stringify(offer.achievement) : null,
        offer.expiresAt,
      ]);
    } catch (dbError: any) {
      console.warn('Failed to persist demo offer to database:', dbError.message);
    }

    const issuerUrl = `${apiBaseUrl}/issuers/${DEMO_TENANT_ID}`;
    const credentialOfferUri = buildCredentialOfferUri(issuerUrl, preAuthorizedCode, config.credentialConfigurationId);

    res.status(201).json({
      success: true,
      offerId,
      offerUri: credentialOfferUri,
      expiresAt: offer.expiresAt,
      format: config.format
    });
  } catch (error: any) {
    console.error('Error creating demo OID4VC offer:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to create demo offer'
    });
  }
});

router.get('/oid4vc-offer/:offerId/status', async (req: Request, res: Response) => {
  const { offerId } = req.params;
  
  if (!DEMO_TENANT_ID) {
    return res.status(503).json({
      error: 'server_error',
      error_description: 'Demo not configured.'
    });
  }

  try {
    const offer = await pendingOffers.get(offerId);

    if (offer && offer.tenantId === DEMO_TENANT_ID) {
      if (new Date() > new Date(offer.expiresAt)) {
        offer.status = 'expired';
        await pendingOffers.set(offerId, offer);
      }

      return res.json({
        success: true,
        offerId: offer.id,
        status: offer.status,
        createdAt: offer.createdAt,
        expiresAt: offer.expiresAt,
      });
    }

    try {
      const result = await db.query(
        'SELECT * FROM oid4vci_pending_offers WHERE id = $1 AND tenant_id = $2',
        [offerId, DEMO_TENANT_ID]
      );

      if (result.rows.length > 0) {
        const dbOffer = result.rows[0];
        return res.json({
          success: true,
          offerId: dbOffer.id,
          status: dbOffer.status,
          createdAt: dbOffer.created_at,
          expiresAt: dbOffer.expires_at,
        });
      }
    } catch (dbError) {
      // ignore
    }

    res.status(404).json({
      error: 'not_found',
      error_description: 'Offer not found'
    });
  } catch (error: any) {
    console.error('Error getting demo offer status:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to get offer status'
    });
  }
});

export default router;
