/**
 * Unit tests for the W3C VC issuance helpers (jwt_vc_json, ldp_vc,
 * jwt_vc_json-ld).
 *
 * Stubs `agent.w3cCredentials.signCredential` to capture the call shape;
 * the real signing path is exercised by the integration tests.
 */

// Stub out the Credo ESM module so Jest can load this CommonJS test
// without transforming the full @credo-ts/core bundle. The helper only
// uses W3cCredential as a plain holder for the option shape, so a thin
// class with public fields is sufficient.
jest.mock('@credo-ts/core', () => ({
  ClaimFormat: {
    JwtVc: 'jwt_vc',
    LdpVc: 'ldp_vc',
  },
  W3cCredential: class W3cCredentialStub {
    context: any
    id: any
    type: any
    issuer: any
    issuanceDate: any
    expirationDate: any
    credentialSubject: any
    constructor(opts: any) {
      Object.assign(this, opts)
    }
  },
}), { virtual: false })

import { signJwtVc, signLdpVc, DEFAULT_VC_V1_CONTEXT, DEFAULT_VC_V2_CONTEXT } from '../../services/oid4vci/w3cIssuance'

const ClaimFormat = {
  JwtVc: 'jwt_vc' as const,
  LdpVc: 'ldp_vc' as const,
}

function makeAgent(signed: any) {
  const calls: any[] = []
  const agent = {
    w3cCredentials: {
      signCredential: async (opts: any) => {
        calls.push(opts)
        return signed
      },
    },
  }
  return { agent, calls }
}

describe('signJwtVc', () => {
  it('signs as ClaimFormat.JwtVc with VC v1 context for jwt_vc_json', async () => {
    const { agent, calls } = makeAgent({ encoded: 'header.payload.sig' })
    const { jwt } = await signJwtVc(agent as any, {
      types: ['DiplomaCredential'],
      issuerDid: 'did:key:zIssuer',
      verificationMethod: 'did:key:zIssuer#zIssuer',
      credentialSubject: { id: 'did:key:zHolder', degree: 'MSc' },
    })
    expect(jwt).toBe('header.payload.sig')
    expect(calls).toHaveLength(1)
    expect(calls[0].format).toBe(ClaimFormat.JwtVc)
    expect(calls[0].alg).toBe('EdDSA')
    expect(calls[0].verificationMethod).toBe('did:key:zIssuer#zIssuer')
    const cred = calls[0].credential
    expect(cred.context).toContain(DEFAULT_VC_V1_CONTEXT)
    expect(cred.type).toContain('VerifiableCredential')
    expect(cred.type).toContain('DiplomaCredential')
  })

  it('uses VC v2 context when jsonLd: true (jwt_vc_json-ld)', async () => {
    const { agent, calls } = makeAgent({ encoded: 'header.payload.sig' })
    await signJwtVc(agent as any, {
      types: ['DiplomaCredential'],
      issuerDid: 'did:key:zIssuer',
      verificationMethod: 'did:key:zIssuer#zIssuer',
      credentialSubject: { degree: 'BSc' },
      jsonLd: true,
    })
    const cred = calls[0].credential
    expect(cred.context).toContain(DEFAULT_VC_V2_CONTEXT)
  })

  it('honours a custom alg', async () => {
    const { agent, calls } = makeAgent({ encoded: 'jwt' })
    await signJwtVc(agent as any, {
      types: ['X'],
      issuerDid: 'did:key:z',
      verificationMethod: 'did:key:z#z',
      credentialSubject: {},
      alg: 'ES256',
    })
    expect(calls[0].alg).toBe('ES256')
  })

  it('throws when the signed credential has no JWT string', async () => {
    const { agent } = makeAgent({})
    await expect(
      signJwtVc(agent as any, {
        types: ['X'],
        issuerDid: 'did:key:z',
        verificationMethod: 'did:key:z#z',
        credentialSubject: {},
      }),
    ).rejects.toThrow(/JWT string/)
  })

  it('prepends VerifiableCredential to types when missing', async () => {
    const { agent, calls } = makeAgent({ encoded: 'x' })
    await signJwtVc(agent as any, {
      types: ['CustomCred'],
      issuerDid: 'did:key:z',
      verificationMethod: 'did:key:z#z',
      credentialSubject: {},
    })
    expect(calls[0].credential.type[0]).toBe('VerifiableCredential')
  })
})

describe('signLdpVc', () => {
  it('signs as ClaimFormat.LdpVc with default Ed25519Signature2020 suite', async () => {
    const { agent, calls } = makeAgent({
      toJson: () => ({ '@context': [DEFAULT_VC_V2_CONTEXT], type: ['VerifiableCredential'], proof: { type: 'Ed25519Signature2020' } }),
    })
    const { credential } = await signLdpVc(agent as any, {
      types: ['MembershipCredential'],
      issuerDid: 'did:key:zIssuer',
      verificationMethod: 'did:key:zIssuer#zIssuer',
      credentialSubject: { id: 'did:key:zHolder', tier: 'gold' },
    })
    expect(calls[0].format).toBe(ClaimFormat.LdpVc)
    expect(calls[0].proofType).toBe('Ed25519Signature2020')
    expect((credential.proof as any).type).toBe('Ed25519Signature2020')
  })

  it('honours a custom proofType', async () => {
    const { agent, calls } = makeAgent({
      toJson: () => ({ '@context': [DEFAULT_VC_V2_CONTEXT], type: ['VerifiableCredential'], proof: {} }),
    })
    await signLdpVc(agent as any, {
      types: ['X'],
      issuerDid: 'did:key:z',
      verificationMethod: 'did:key:z#z',
      credentialSubject: {},
      proofType: 'DataIntegrityProof',
    })
    expect(calls[0].proofType).toBe('DataIntegrityProof')
  })

  it('throws when the signed credential has no JSON representation', async () => {
    const { agent } = makeAgent({})
    await expect(
      signLdpVc(agent as any, {
        types: ['X'],
        issuerDid: 'did:key:z',
        verificationMethod: 'did:key:z#z',
        credentialSubject: {},
      }),
    ).rejects.toThrow(/JSON representation/)
  })

  it('merges caller-provided contexts after the default VC v2 context', async () => {
    const { agent, calls } = makeAgent({
      toJson: () => ({ '@context': [], type: [], proof: {} }),
    })
    await signLdpVc(agent as any, {
      types: ['X'],
      issuerDid: 'did:key:z',
      verificationMethod: 'did:key:z#z',
      credentialSubject: {},
      contexts: ['https://example.com/custom'],
    })
    expect(calls[0].credential.context).toEqual([
      DEFAULT_VC_V2_CONTEXT,
      'https://example.com/custom',
    ])
  })
})
