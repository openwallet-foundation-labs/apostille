// NOTE: `@credo-ts/core` is shipped as ESM. Lazy-require inside functions so
// Jest (still on CommonJS) can load this module for unit tests without
// transforming Credo's full bundle.

/**
 * W3C Verifiable Credential issuance helpers for OID4VCI.
 *
 * Wraps `agent.w3cCredentials.signCredential` for the three W3C formats
 * the wallet matrix asks for:
 *   - jwt_vc_json   (W3C VC-JWT, no JSON-LD)
 *   - jwt_vc_json-ld (W3C VC-JWT with JSON-LD context)
 *   - ldp_vc        (Linked Data Proof VC with embedded proof)
 *
 * For OBv3 use `services/oid4vci/openBadgeIssuance.ts` instead — it routes
 * through `@ajna-inc/openbadges` so the credential gets a
 * DataIntegrityProof with `eddsa-rdfc-2022`.
 */

export const DEFAULT_VC_V1_CONTEXT = 'https://www.w3.org/2018/credentials/v1'
export const DEFAULT_VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2'

export interface W3cIssuanceInput {
  /** Verifiable Credential `type` array. `VerifiableCredential` will be prepended if missing. */
  types: string[]
  /** Issuer DID. Must be resolvable by the agent. */
  issuerDid: string
  /** Verification method URL (did:key full vmId, did:jwk, or did:web#key-0). */
  verificationMethod: string
  /** credentialSubject. `id` should be the holder DID when available. */
  credentialSubject: Record<string, unknown> & { id?: string }
  /** ISO 8601 issuance date (defaults to now). */
  issuanceDate?: string
  /** Optional expiration date. */
  expirationDate?: string
  /** Optional override credential id. Defaults to `urn:uuid:<random>`. */
  credentialId?: string
  /** Optional JSON-LD `@context` list to merge (defaults: VC v1 for jwt_vc_json, VC v2 for ldp/jsonld variants). */
  contexts?: string[]
}

export interface SignJwtVcOptions extends W3cIssuanceInput {
  /** JWA signature algorithm. Defaults to `EdDSA` (the OID4VCI default). */
  alg?: string
  /** When true, include JSON-LD context (jwt_vc_json-ld). Default false (jwt_vc_json). */
  jsonLd?: boolean
}

export interface SignLdpVcOptions extends W3cIssuanceInput {
  /** Linked Data Signature suite. Defaults to `Ed25519Signature2020`. */
  proofType?: string
}

function buildW3cCredential(input: W3cIssuanceInput, defaultContext: string): any {
  const types = input.types.includes('VerifiableCredential')
    ? input.types
    : ['VerifiableCredential', ...input.types]

  const context = Array.from(new Set([defaultContext, ...(input.contexts ?? [])]))

  const { W3cCredential } = require('@credo-ts/core')
  return new W3cCredential({
    context,
    id: input.credentialId,
    type: types,
    issuer: input.issuerDid,
    issuanceDate: input.issuanceDate || new Date().toISOString(),
    ...(input.expirationDate && { expirationDate: input.expirationDate }),
    credentialSubject: input.credentialSubject,
  })
}

/**
 * Sign a W3C VC as a JWT (`jwt_vc_json` or `jwt_vc_json-ld`).
 *
 * Returns the compact JWT string ready for the OID4VCI `credential` field.
 */
export async function signJwtVc(agent: any, opts: SignJwtVcOptions): Promise<{ jwt: string }> {
  const defaultContext = opts.jsonLd ? DEFAULT_VC_V2_CONTEXT : DEFAULT_VC_V1_CONTEXT
  const credential = buildW3cCredential(opts, defaultContext)
  const { ClaimFormat } = require('@credo-ts/core')

  const signed = await agent.w3cCredentials.signCredential({
    format: ClaimFormat.JwtVc,
    credential,
    verificationMethod: opts.verificationMethod,
    alg: (opts.alg ?? 'EdDSA') as any,
  })

  const jwt: string | undefined =
    (signed as any).encoded ??
    (typeof (signed as any).serializedJwt === 'string' ? (signed as any).serializedJwt : undefined)

  if (typeof jwt !== 'string') {
    throw new Error('signJwtVc: signed credential did not expose a JWT string')
  }

  return { jwt }
}

/**
 * Sign a W3C VC with a Linked Data Proof (`ldp_vc`).
 *
 * Returns the JSON-LD credential object (with `proof`) ready for the
 * OID4VCI `credential` field.
 */
export async function signLdpVc(
  agent: any,
  opts: SignLdpVcOptions,
): Promise<{ credential: Record<string, unknown> }> {
  const credential = buildW3cCredential(opts, DEFAULT_VC_V2_CONTEXT)
  const { ClaimFormat } = require('@credo-ts/core')

  const signed = await agent.w3cCredentials.signCredential({
    format: ClaimFormat.LdpVc,
    credential,
    verificationMethod: opts.verificationMethod,
    proofType: opts.proofType ?? 'Ed25519Signature2020',
  })

  const json: Record<string, unknown> | undefined =
    typeof (signed as any).toJson === 'function'
      ? (signed as any).toJson()
      : ((signed as any).encoded as Record<string, unknown> | undefined)

  if (!json || typeof json !== 'object') {
    throw new Error('signLdpVc: signed credential did not expose a JSON representation')
  }

  return { credential: json }
}

/**
 * Convenience: ensure the agent has a did:key suitable for ldp_vc/jwt_vc signing.
 * Lazily creates one if none exists.
 */
export async function ensureDidKeyForW3c(
  agent: any,
  keyType: 'Ed25519' | 'P-256' = 'Ed25519',
): Promise<{ did: string; vmId: string }> {
  const created = await agent.dids.getCreatedDids({})
  const existing = created.find((d: any) => typeof d.did === 'string' && d.did.startsWith('did:key:'))
  if (existing?.did) {
    const did: string = existing.did
    const keyFragment = did.replace('did:key:', '')
    return { did, vmId: `${did}#${keyFragment}` }
  }

  const created2 = await agent.dids.create({
    method: 'key',
    options: {
      createKey: {
        type:
          keyType === 'Ed25519'
            ? { kty: 'OKP', crv: 'Ed25519' }
            : { kty: 'EC', crv: 'P-256' },
      },
    },
  })

  if (created2.didState.state !== 'finished' || !created2.didState.did) {
    const reason = (created2.didState as any).reason || 'unknown error'
    throw new Error(`Failed to create did:key for W3C issuer: ${reason}`)
  }
  const did: string = created2.didState.did
  const keyFragment = did.replace('did:key:', '')
  return { did, vmId: `${did}#${keyFragment}` }
}
