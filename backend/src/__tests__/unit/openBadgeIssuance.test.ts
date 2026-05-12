/**
 * Unit tests for the OpenBadge v3 OID4VCI issuance helper.
 *
 * Stubs the agent's openbadges module so the test exercises only the
 * credential-shape construction. The full sign-and-store path is covered
 * by integration tests against a live agent.
 */

import {
  buildOpenBadgeCredential,
  issueOpenBadgeCredential,
  OBV3_CONTEXT,
  OBV3_EXTENSIONS_CONTEXT,
  VC_V2_CONTEXT,
  OBV3_ACHIEVEMENT_SCHEMA_URL,
} from '../../services/oid4vci/openBadgeIssuance'

describe('buildOpenBadgeCredential', () => {
  const baseInput = {
    achievement: {
      name: 'Distinguished Service',
      description: 'For exemplary contribution',
      criteria: 'Completed all requirements.',
      achievementType: 'Badge',
    },
    issuer: {
      id: 'did:web:example.com:issuers:tenant-x',
      name: 'Example Issuer',
      url: 'https://example.com',
    },
    recipient: {
      id: 'did:key:zHolder123',
      name: 'Alice',
    },
  } as const

  it('emits the expected OBv3 envelope shape', () => {
    const { credentialWithProof } = buildOpenBadgeCredential(baseInput as any)
    expect(credentialWithProof['@context']).toEqual([
      VC_V2_CONTEXT,
      OBV3_CONTEXT,
      OBV3_EXTENSIONS_CONTEXT,
    ])
    expect(credentialWithProof.type).toEqual(['VerifiableCredential', 'OpenBadgeCredential'])
    expect(credentialWithProof.credentialSchema?.[0]?.id).toBe(OBV3_ACHIEVEMENT_SCHEMA_URL)
    expect(credentialWithProof.proof.verificationMethod).toBe(`${baseInput.issuer.id}#key-0`)
  })

  it('binds the credentialSubject to the holder DID', () => {
    const { credentialWithProof } = buildOpenBadgeCredential(baseInput as any)
    const cs = credentialWithProof.credentialSubject as any
    expect(cs.id).toBe('did:key:zHolder123')
    expect(cs.type).toEqual(['AchievementSubject'])
    expect(cs.achievement.name).toBe('Distinguished Service')
    expect(cs.achievement.achievementType).toBe('Badge')
    expect(cs.achievement.criteria).toEqual({ narrative: 'Completed all requirements.' })
  })

  it('mints a urn:uuid recipient id when none is provided', () => {
    const input = { ...baseInput, recipient: { name: 'Bob' } } as any
    const { credentialWithProof } = buildOpenBadgeCredential(input)
    const cs = credentialWithProof.credentialSubject as any
    expect(cs.id).toMatch(/^urn:uuid:[0-9a-f-]{36}$/i)
  })

  it('passes structured criteria objects through unchanged', () => {
    const input = {
      ...baseInput,
      achievement: { ...baseInput.achievement, criteria: { id: 'https://example.com/c', narrative: 'A' } },
    } as any
    const { credentialWithProof } = buildOpenBadgeCredential(input)
    const cs = credentialWithProof.credentialSubject as any
    expect(cs.achievement.criteria).toEqual({ id: 'https://example.com/c', narrative: 'A' })
  })

  it('normalises a string image into { id, type:Image }', () => {
    const input = {
      ...baseInput,
      achievement: { ...baseInput.achievement, image: 'https://example.com/badge.png' },
    } as any
    const { credentialWithProof } = buildOpenBadgeCredential(input)
    const cs = credentialWithProof.credentialSubject as any
    expect(cs.achievement.image).toEqual({ id: 'https://example.com/badge.png', type: 'Image' })
  })

  it('uses the provided verificationMethod when set', () => {
    const input = {
      ...baseInput,
      verificationMethod: 'did:web:example.com:issuers:tenant-x#custom',
    } as any
    const { credentialWithProof } = buildOpenBadgeCredential(input)
    expect(credentialWithProof.proof.verificationMethod).toBe(
      'did:web:example.com:issuers:tenant-x#custom',
    )
  })

  it('derives a default credential name from recipient + achievement', () => {
    const { credentialWithProof } = buildOpenBadgeCredential(baseInput as any)
    expect(credentialWithProof.name).toBe('Alice - Distinguished Service')
  })
})

describe('issueOpenBadgeCredential', () => {
  it('delegates to agent.modules.openbadges.issueCredential and returns the signed credential', async () => {
    const fakeSigned = {
      '@context': [VC_V2_CONTEXT, OBV3_CONTEXT],
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      id: 'urn:uuid:abc',
      proof: { type: 'DataIntegrityProof', cryptosuite: 'eddsa-rdfc-2022', proofValue: 'z...' },
    }
    let receivedArg: any
    const agent = {
      modules: {
        openbadges: {
          issueCredential: async (input: any) => {
            receivedArg = input
            return { credential: fakeSigned }
          },
        },
      },
    }
    const result = await issueOpenBadgeCredential(agent, {
      achievement: { name: 'Test' },
      issuer: { id: 'did:web:example.com' },
      recipient: { name: 'Carol' },
    })
    expect(result.credential).toBe(fakeSigned)
    expect(receivedArg.type).toEqual(['VerifiableCredential', 'OpenBadgeCredential'])
    expect(receivedArg.proof.verificationMethod).toBe('did:web:example.com#key-0')
  })

  it('throws when the openbadges module is missing from the agent', async () => {
    const agent = { modules: {} }
    await expect(
      issueOpenBadgeCredential(agent, {
        achievement: { name: 'Test' },
        issuer: { id: 'did:web:example.com' },
        recipient: {},
      }),
    ).rejects.toThrow(/openbadges/i)
  })
})
