/**
 * Unit tests for the AnonCreds OID4VCI issuance helpers.
 *
 * Pure-function coverage — no agent, no DB. Tests the deterministic pieces
 * (encoding, nonce shape, request validation guard rails) that the route
 * relies on. The integration test in oid4vci-anoncreds.integration.test.ts
 * exercises the full issuance against a live tenant.
 */

import {
  encodeCredentialValue,
  encodeAttributes,
  generateAnonCredsNonce,
  verifyAndIssueAnonCredsCredential,
} from '../../services/oid4vci/anonCredsIssuance'

describe('encodeCredentialValue', () => {
  it('encodes booleans as 0/1 (Aries RFC 0036)', () => {
    expect(encodeCredentialValue(true)).toBe('1')
    expect(encodeCredentialValue(false)).toBe('0')
  })

  it('encodes int32-range numbers as their decimal string', () => {
    expect(encodeCredentialValue(0)).toBe('0')
    expect(encodeCredentialValue(42)).toBe('42')
    expect(encodeCredentialValue(-7)).toBe('-7')
    expect(encodeCredentialValue(2147483647)).toBe('2147483647')
  })

  it('encodes int32-range numeric strings as their decimal value', () => {
    expect(encodeCredentialValue('123')).toBe('123')
    expect(encodeCredentialValue('-1')).toBe('-1')
  })

  it('hashes non-numeric strings to a decimal big-endian SHA-256', () => {
    const out = encodeCredentialValue('Alice')
    // Aries RFC 0036: bytes(SHA-256(value)) interpreted as a big-endian integer.
    const crypto = require('crypto')
    const hex = crypto.createHash('sha256').update('Alice').digest('hex')
    expect(out).toBe(BigInt('0x' + hex).toString())
    expect(/^\d+$/.test(out)).toBe(true)
  })

  it('hashes empty string deterministically (not "")', () => {
    const out = encodeCredentialValue('')
    expect(/^\d+$/.test(out)).toBe(true)
    expect(out).toBe(encodeCredentialValue(''))
  })

  it('encodes null/undefined as the string "None" (Aries RFC 0036)', () => {
    const expected = encodeCredentialValue('None')
    expect(encodeCredentialValue(null)).toBe(expected)
    expect(encodeCredentialValue(undefined)).toBe(expected)
  })

  it('handles out-of-int32-range numbers via stringification + hash', () => {
    const big = encodeCredentialValue(2147483648) // > int32 max
    expect(/^\d+$/.test(big)).toBe(true)
    // Same as the string equivalent
    expect(big).toBe(encodeCredentialValue('2147483648'))
  })
})

describe('encodeAttributes', () => {
  it('produces raw + encoded pairs for each attribute', () => {
    const out = encodeAttributes({ name: 'Alice', age: 30, gpa: '3' })
    expect(out.name).toEqual({ raw: 'Alice', encoded: encodeCredentialValue('Alice') })
    expect(out.age).toEqual({ raw: '30', encoded: '30' })
    expect(out.gpa).toEqual({ raw: '3', encoded: '3' })
  })

  it('rejects nested objects', () => {
    expect(() => encodeAttributes({ obj: { nested: 1 } as any })).toThrow(/unsupported value type 'object'/)
  })

  it('renders null/undefined as raw="" with the canonical hash', () => {
    const out = encodeAttributes({ missing: null as any })
    expect(out.missing.raw).toBe('')
    expect(out.missing.encoded).toBe(encodeCredentialValue(null))
  })
})

describe('generateAnonCredsNonce', () => {
  it('returns a decimal string', () => {
    const n = generateAnonCredsNonce()
    expect(/^\d+$/.test(n)).toBe(true)
  })

  it('has at least 80 bits of entropy (≤ 25 decimal digits typical)', () => {
    const n = generateAnonCredsNonce()
    const bits = BigInt(n).toString(2).length
    // 80 random bits → typically 76–80 bits after stripping leading zeros.
    // The lower bound here guards against accidental truncation, not
    // statistical entropy.
    expect(bits).toBeGreaterThanOrEqual(60)
    expect(bits).toBeLessThanOrEqual(80)
  })

  it('produces unique values across many calls', () => {
    const set = new Set<string>()
    for (let i = 0; i < 1000; i++) set.add(generateAnonCredsNonce())
    expect(set.size).toBe(1000)
  })
})

describe('verifyAndIssueAnonCredsCredential — input validation', () => {
  // Tests that exercise pure input-validation guards before any crypto runs.
  // We pass a stub agent that would throw if the issuer service is reached,
  // proving the guards short-circuit.
  const explodingAgent = {
    dependencyManager: {
      resolve: () => {
        throw new Error('issuer service should not have been reached')
      },
    },
    context: {},
  } as any

  const baseOffer = {
    schema_id: 'did:ajna:1',
    cred_def_id: 'did:ajna:2',
    nonce: '12345',
    key_correctness_proof: { c: '0' } as any,
  }

  const baseRequest = {
    cred_def_id: 'did:ajna:2',
    blinded_ms: { u: '0' },
    blinded_ms_correctness_proof: { c: '0' },
    nonce: '12345',
  }

  it('rejects a request with no blinded_ms', async () => {
    await expect(
      verifyAndIssueAnonCredsCredential(explodingAgent, {
        storedOffer: baseOffer,
        credentialRequest: { ...baseRequest, blinded_ms: undefined } as any,
        attributeValues: {},
      })
    ).rejects.toThrow(/blinded_ms/)
  })

  it('rejects a request with no blinded_ms_correctness_proof', async () => {
    await expect(
      verifyAndIssueAnonCredsCredential(explodingAgent, {
        storedOffer: baseOffer,
        credentialRequest: { ...baseRequest, blinded_ms_correctness_proof: undefined } as any,
        attributeValues: {},
      })
    ).rejects.toThrow(/blinded_ms_correctness_proof/)
  })

  it('rejects a request whose cred_def_id does not match the offer', async () => {
    await expect(
      verifyAndIssueAnonCredsCredential(explodingAgent, {
        storedOffer: baseOffer,
        credentialRequest: { ...baseRequest, cred_def_id: 'did:ajna:other' },
        attributeValues: {},
      })
    ).rejects.toThrow(/cred_def_id.*does not match/)
  })

  it('rejects a request whose nonce does not match the offer (replay defence)', async () => {
    await expect(
      verifyAndIssueAnonCredsCredential(explodingAgent, {
        storedOffer: baseOffer,
        credentialRequest: { ...baseRequest, nonce: '99999' },
        attributeValues: {},
      })
    ).rejects.toThrow(/nonce does not match/)
  })

  it('rejects when no offer was recorded', async () => {
    await expect(
      verifyAndIssueAnonCredsCredential(explodingAgent, {
        storedOffer: undefined as any,
        credentialRequest: baseRequest,
        attributeValues: {},
      })
    ).rejects.toThrow(/Missing stored credential offer/)
  })
})
