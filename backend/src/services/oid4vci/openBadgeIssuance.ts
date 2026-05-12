import crypto from 'crypto'

/**
 * OpenBadges v3 OID4VCI issuance helper.
 *
 * The OBv3 OID4VCI flow piggybacks on `format: ldp_vc` per OID4VCI §A.3 —
 * the wallet detects OBv3 from the `type` array (`OpenBadgeCredential`)
 * rather than the wire format string.
 *
 * Internally we delegate signing to `@ajna-inc/openbadges` which produces a
 * `DataIntegrityProof` with `cryptosuite: eddsa-rdfc-2022` (the suite
 * required by the IMS Global OBv3 specification).
 *
 * This module intentionally does NOT bundle the OBv3 verification step;
 * verification is the verifier's concern and lives in a separate module.
 */

export const OBV3_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
export const OBV3_EXTENSIONS_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/extensions.json'
export const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2'
export const OBV3_ACHIEVEMENT_SCHEMA_URL =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json'

export interface AchievementTemplate {
  id?: string
  type?: string | string[]
  achievementType?: string
  name: string
  description?: string
  criteria?: { id?: string; narrative?: string } | string
  image?: string | { id: string; type?: string }
}

export interface IssuerProfile {
  id: string                  // did:web:...
  name?: string
  url?: string
  description?: string
  image?: string | { id: string; type?: string }
}

export interface RecipientData {
  /**
   * Recipient identifier. When the holder presents a holder-binding proof
   * (jwk or did kid), the resolved DID should be passed here so the
   * `credentialSubject.id` is correctly bound. If unset, a `urn:uuid:` is
   * minted as a placeholder.
   */
  id?: string
  name?: string
  /** Extra OBv3 identifier objects (e.g. email, sourcedId). */
  identifiers?: Array<{ type?: string; identityType: string; identityHash?: string; hashed?: boolean; salt?: string; identityHashAlg?: string; identityValue?: string }>
  /** Extra fields to merge onto credentialSubject (e.g. `givenName`). */
  extras?: Record<string, unknown>
}

export interface BuildOpenBadgeOptions {
  achievement: AchievementTemplate
  issuer: IssuerProfile
  recipient: RecipientData
  /** Verification-method id used to ensure key binding before signing. Defaults to `${issuer.id}#key-0`. */
  verificationMethod?: string
  /** Override the credential id. Defaults to `urn:uuid:<random>`. */
  credentialId?: string
  /** Override the validFrom timestamp. Defaults to now. */
  validFrom?: string
  /** Optional validUntil timestamp. */
  validUntil?: string
  /** Override the `name` claim. Defaults to `${recipient.name} - ${achievement.name}`. */
  credentialName?: string
}

interface BuiltOpenBadgeCredential {
  '@context': string[]
  id: string
  type: string[]
  credentialSchema?: Array<{ id: string; type: string }>
  issuer: Record<string, unknown>
  validFrom: string
  validUntil?: string
  issuanceDate: string
  name?: string
  credentialSubject: Record<string, unknown>
}

/**
 * Build an unsigned OBv3 AchievementCredential ready to be passed to
 * `agent.modules.openbadges.issueCredential(credentialWithProof)`.
 *
 * The shape mirrors the existing DIDComm route at
 * `backend/src/routes/openBadgesRoutes.ts` so issued credentials look
 * identical across transports.
 */
export function buildOpenBadgeCredential(opts: BuildOpenBadgeOptions): {
  credentialWithProof: BuiltOpenBadgeCredential & { proof: { verificationMethod: string } }
} {
  const {
    achievement,
    issuer,
    recipient,
    verificationMethod = `${issuer.id}#key-0`,
    credentialId = `urn:uuid:${crypto.randomUUID()}`,
    validFrom = new Date().toISOString(),
    validUntil,
    credentialName,
  } = opts

  const recipientId = recipient.id || `urn:uuid:${crypto.randomUUID()}`
  const achievementId = achievement.id || `urn:uuid:${crypto.randomUUID()}`

  const credentialSubject: Record<string, unknown> = {
    id: recipientId,
    type: ['AchievementSubject'],
    achievement: {
      id: achievementId,
      type: Array.isArray(achievement.type)
        ? achievement.type
        : achievement.type
          ? [achievement.type]
          : ['Achievement'],
      achievementType: achievement.achievementType || 'Badge',
      name: achievement.name,
      description: achievement.description || '',
      criteria:
        typeof achievement.criteria === 'string'
          ? { narrative: achievement.criteria }
          : achievement.criteria || { narrative: 'Criteria not specified' },
      ...(achievement.image && { image: normalizeImage(achievement.image) }),
    },
    ...(recipient.name && { name: recipient.name }),
    ...(recipient.identifiers && recipient.identifiers.length > 0 && { identifier: recipient.identifiers }),
    ...(recipient.extras || {}),
  }

  const credentialWithoutProof: BuiltOpenBadgeCredential = {
    '@context': [VC_V2_CONTEXT, OBV3_CONTEXT, OBV3_EXTENSIONS_CONTEXT],
    id: credentialId,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    credentialSchema: [
      {
        id: OBV3_ACHIEVEMENT_SCHEMA_URL,
        type: '1EdTechJsonSchemaValidator2019',
      },
    ],
    issuer: {
      id: issuer.id,
      type: ['Profile'],
      ...(issuer.name && { name: issuer.name }),
      ...(issuer.url && { url: issuer.url }),
      ...(issuer.description && { description: issuer.description }),
      ...(issuer.image && { image: normalizeImage(issuer.image) }),
    },
    validFrom,
    issuanceDate: validFrom,
    ...(validUntil && { validUntil }),
    ...(credentialName || (recipient.name && achievement.name)
      ? { name: credentialName || `${recipient.name} - ${achievement.name}` }
      : {}),
    credentialSubject,
  }

  return {
    credentialWithProof: {
      ...credentialWithoutProof,
      proof: { verificationMethod },
    },
  }
}

function normalizeImage(image: string | { id: string; type?: string }) {
  if (typeof image === 'string') return { id: image, type: 'Image' }
  return { type: 'Image', ...image }
}

/**
 * Issue an OpenBadge v3 credential via the agent's openbadges module.
 *
 * Returns the signed credential JSON (with DataIntegrityProof) ready to be
 * placed in the `credential` field of an OID4VCI credential response.
 */
export async function issueOpenBadgeCredential(
  agent: any,
  opts: BuildOpenBadgeOptions,
): Promise<{ credential: Record<string, unknown> }> {
  const openbadgesApi = (agent.modules as any).openbadges
  if (!openbadgesApi) {
    throw new Error(
      'OpenBadges module not configured on agent. Add OpenBadgesModule to agent modules.',
    )
  }

  const { credentialWithProof } = buildOpenBadgeCredential(opts)
  const record = await openbadgesApi.issueCredential(credentialWithProof)
  // `record.credential` is the fully signed credential with DataIntegrityProof.
  return { credential: record.credential }
}
