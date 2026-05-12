---
title: AnonCreds Credential Format Profile for OpenID4VCI
version: 0.1.0
status: Draft
authors:
  - name: Vinay Singh
    email: vinay@ajna.inc
date: 2026-04-29
implementation: ESSI Studio (this repository)
---

## Abstract

This document defines an AnonCreds Credential Format Profile for OpenID for Verifiable Credential Issuance (OID4VCI) 1.0. It specifies how AnonCreds credentials using CL (Camenisch-Lysyanskaya) signatures can be issued within the standard OID4VCI protocol flow, including the interactive blinded link secret binding that is unique to AnonCreds.

The reference implementation lives in this repository:

- Issuer service: `backend/src/services/oid4vci/anonCredsIssuance.ts`
- Holder helpers: `backend/src/services/oid4vci/anonCredsHolder.ts`
- Wire route: `backend/src/routes/oid4vciRoutes.ts` (the `anoncreds` branch in the credential endpoint)
- Issuer metadata: `backend/src/routes/wellKnownRoutes.ts`
- Frontend issuer UI: `frontend/app/dashboard/oid4vci/page.tsx` + `frontend/app/components/oid4vci/`

## 1. Introduction

AnonCreds credentials provide unique privacy properties not available in other credential formats: unlinkable multi-show presentations, zero-knowledge predicate proofs (e.g., "age >= 18" without revealing date of birth), and holder binding via a blinded link secret that prevents credential correlation across issuers.

OID4VCI 1.0 defines a general framework for credential issuance with extension points for new credential formats via Credential Format Profiles, and §8.2 explicitly invites new `proof_type` values to be defined by other specifications. This document defines the `anoncreds` format profile and the matching `proof_type: "anoncreds"`.

### 1.1 The Link Secret Challenge

AnonCreds issuance requires an interactive blind signature protocol:

1. The Holder generates (or already owns) a **link secret** (a large random number, persistent across all credentials).
2. The Holder creates a **blinded link secret commitment** and a **correctness proof** (using the Issuer's nonce).
3. The Issuer creates a **blind CL signature** over the committed link secret and the credential attributes.
4. The Holder **unblinds** the signature to obtain the final credential.

This is fundamentally different from JWT/SD-JWT issuance where the Holder simply proves possession of a key pair. The OID4VCI protocol must accommodate the blinded commitment in the Credential Request and the blind signature in the Credential Response.

### 1.2 Solution Overview

| AnonCreds Step | OID4VCI Mapping |
|---|---|
| Credential Offer (with nonce) | Credential Offer + `c_nonce` from Token / Nonce Endpoint |
| Credential Request (blinded commitment) | `POST /credential` with `proof_type: "anoncreds"` |
| Credential Response (blind signature) | Credential Response with `format: "anoncreds"` |
| Holder unblinds | Client-side post-processing (same as today) |

## 2. Credential Format Identifier

The credential format identifier is:

```
anoncreds
```

Used in:
- Credential Issuer Metadata (`credential_configurations_supported`)
- Credential Offer (`credential_configuration_id` referencing an `anoncreds` config)
- Credential Request body (`format` field)
- Credential Response body (`format` field)

## 3. Credential Issuer Metadata

The Credential Issuer Metadata MUST include AnonCreds-specific parameters in `credential_configurations_supported`.

### 3.1 Credential Configuration Object

```json
{
  "credential_configurations_supported": {
    "UniversityDegree_AnonCreds": {
      "format": "anoncreds",
      "scope": "university_degree",
      "cryptographic_binding_methods_supported": ["link_secret"],
      "credential_signing_alg_values_supported": ["CLSignature2019"],
      "proof_types_supported": {
        "anoncreds": {
          "proof_signing_alg_values_supported": ["CLSignature2019"]
        }
      },
      "anoncreds": {
        "schema": {
          "id": "did:ajna:...:2:degree:1.0",
          "name": "degree",
          "version": "1.0",
          "attr_names": ["name", "degree", "university", "year", "gpa"]
        },
        "credential_definition": {
          "id": "did:ajna:...:3:CL:17:default",
          "schema_id": "did:ajna:...:2:degree:1.0",
          "type": "CL",
          "tag": "default"
        },
        "revocation": {
          "supported": true,
          "registry_id": "did:ajna:...:4:...:CL_ACCUM:default"
        }
      },
      "display": [{ "name": "University Degree", "locale": "en-US" }]
    }
  }
}
```

### 3.2 AnonCreds-Specific Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `cryptographic_binding_methods_supported` | Array | REQUIRED | MUST contain `"link_secret"` |
| `credential_signing_alg_values_supported` | Array | REQUIRED | MUST contain `"CLSignature2019"` |
| `proof_types_supported.anoncreds` | Object | REQUIRED | Lists the AnonCreds proof types this config accepts |
| `anoncreds.schema` | Object | REQUIRED | Schema definition: `id`, `name`, `version`, `attr_names` |
| `anoncreds.credential_definition` | Object | REQUIRED | Cred-def: `id`, `schema_id`, `type` (`"CL"`), `tag` |
| `anoncreds.revocation` | Object | OPTIONAL | `{ supported: boolean, registry_id?: string }` |

## 4. Credential Offer

Standard OID4VCI Credential Offer; the `credential_configuration_id` references an AnonCreds configuration. No AnonCreds-specific extensions are required in the offer object — the credential nonce is obtained via the Token Response or the Nonce Endpoint (§5).

```json
{
  "credential_issuer": "https://issuer.example.com",
  "credential_configuration_ids": ["UniversityDegree_AnonCreds"],
  "grants": {
    "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
      "pre-authorized_code": "oaKazRN8I0IbtZ0C7JuMn5"
    }
  }
}
```

## 5. Nonce Exchange

The AnonCreds blinded link secret correctness proof requires a nonce from the Issuer. OID4VCI provides the `c_nonce` mechanism for this purpose.

### 5.1 Obtaining the Nonce

The Holder obtains the `c_nonce` via one of:

1. **Token Response**: the `c_nonce` field in the OID4VCI Token Response.
2. **Nonce Endpoint**: `POST /nonce` as defined in OID4VCI §8.

The Holder MUST use this `c_nonce` as the `cred_def_nonce` when creating the AnonCreds Credential Request.

### 5.1.1 AnonCreds Offer Object in the Token Response (Profile Extension)

For the `anoncreds` format, the Token Response carries an additional `anoncreds_offer` field containing the issuer-minted credential offer object (`schema_id`, `cred_def_id`, `nonce`, `key_correctness_proof`). The Holder uses this object to build the blinded link secret commitment.

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 300,
  "c_nonce": "987654321012345678901234",
  "c_nonce_expires_in": 300,
  "anoncreds_offer": {
    "schema_id": "did:ajna:...:2:degree:1.0",
    "cred_def_id": "did:ajna:...:3:CL:17:default",
    "nonce": "987654321012345678901234",
    "key_correctness_proof": { "c": "...", "xz_cap": "...", "xr_cap": [["..."]] }
  }
}
```

The `anoncreds_offer.nonce` MUST equal the `c_nonce` in the same response.

Wallets that don't recognise this profile ignore the field and proceed with the standard flow (and naturally receive an `invalid_proof` error from the Credential Endpoint).

### 5.2 Nonce Format

For an `anoncreds`-format session, the Issuer:

- MUST generate the `c_nonce` natively as a decimal string of at least 80 bits of entropy.
- MUST generate a fresh nonce for each issuance session (no reuse across sessions).
- MAY rotate the nonce on each round-trip via the Nonce Endpoint.

Issuers SHOULD NOT transcode from another encoding (base64url, hex) — the nonce is exchanged as a decimal string end-to-end. The reference implementation produces nonces via:

```ts
BigInt('0x' + crypto.randomBytes(10).toString('hex')).toString()
```

(`backend/src/services/oid4vci/anonCredsIssuance.ts`)

## 6. Credential Request

### 6.1 Request Format

```http
POST /credential HTTP/1.1
Host: issuer.example.com
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "format": "anoncreds",
  "credential_identifier": "UniversityDegree_AnonCreds",
  "proof": {
    "proof_type": "anoncreds",
    "anoncreds": {
      "prover_did": "did:ajna:ka-ra-na-...",
      "cred_def_id": "did:ajna:...:3:CL:17:default",
      "blinded_ms": { "u": "12345...", "hidden_attributes": ["master_secret"], "committed_attributes": {} },
      "blinded_ms_correctness_proof": {
        "c": "67890...",
        "v_dash_cap": "11111...",
        "m_caps": { "master_secret": "22222..." },
        "r_caps": {}
      },
      "nonce": "98765432101234567890"
    }
  }
}
```

### 6.2 Proof Object Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `proof_type` | String | REQUIRED | MUST be `"anoncreds"` |
| `anoncreds.prover_did` | String | OPTIONAL | Holder's DID (for non-anonymous issuance) |
| `anoncreds.cred_def_id` | String | REQUIRED | Credential definition identifier |
| `anoncreds.blinded_ms` | Object | REQUIRED | Blinded link secret commitment |
| `anoncreds.blinded_ms_correctness_proof` | Object | REQUIRED | Zero-knowledge proof that the blinded commitment is well-formed |
| `anoncreds.nonce` | String | REQUIRED | MUST equal the `c_nonce` issued for this session |

### 6.3 Issuer Validation

The Issuer MUST:
1. Verify `proof.proof_type === "anoncreds"`.
2. Verify `anoncreds.nonce === offer.c_nonce` (replay defence).
3. Verify the `cred_def_id` matches the offer's credential definition.
4. Verify the `blinded_ms_correctness_proof` against the `blinded_ms` and the issuer's stored `key_correctness_proof`. (This validation is enforced inside the AnonCreds library — `CredentialRequest.fromJson` throws on invalid proofs.)
5. Reject sessions whose `c_nonce` has been used.

## 7. Credential Response

### 7.1 Response Format

```json
{
  "format": "anoncreds",
  "credential": {
    "schema_id": "did:ajna:...:2:degree:1.0",
    "cred_def_id": "did:ajna:...:3:CL:17:default",
    "rev_reg_id": null,
    "values": {
      "name": { "raw": "Alice Smith", "encoded": "72637923..." },
      "degree": { "raw": "Computer Science", "encoded": "83749201..." }
    },
    "signature": { "p_credential": { "m_2": "...", "a": "...", "e": "...", "v": "..." } },
    "signature_correctness_proof": { "se": "...", "c": "..." },
    "rev_reg": null,
    "witness": null
  },
  "c_nonce": "fresh_decimal_nonce",
  "c_nonce_expires_in": 86400
}
```

### 7.2 Holder Post-Processing

After receiving the response the Holder MUST:
1. Verify the `signature_correctness_proof` using the nonce embedded in the credential.
2. Unblind the signature using the metadata stored alongside the credential request.
3. Store the unblinded credential in the wallet.

This is done via the AnonCreds holder service (`agent.modules.anoncreds` → `storeCredential`). The reference implementation wraps it in `processAnonCredsCredentialResponse` (`backend/src/services/oid4vci/anonCredsHolder.ts`).

## 8. Presentation (OID4VP)

AnonCreds presentation over OID4VP uses the `ac_vp` format identifier as already defined in OID4VP 1.0. Predicate constraints are expressed via a `predicate` field on constraint fields, with the operator and integer threshold matching AnonCreds' `>=`/`>`/`<=`/`<` semantics.

The reference implementation's predicate UI lives in the verifier studio (Phase 6 of `lets-make-a-execution-gleaming-petal.md`). Backend `ac_vp` verification reuses Credo's `agent.modules.anoncreds` proof verifier — no protocol-level extensions are required.

## 9. Revocation

When the credential definition supports revocation (CL_ACCUM), the Credential Response includes:

- `rev_reg_id`: revocation registry identifier
- `rev_reg`: accumulator value at issuance time
- `witness`: holder's revocation witness (used to construct non-revocation proofs)

Verifiers request a fresh non-revocation proof during presentation by including a `non_revoked: { from, to }` constraint. The Holder produces a ZKP that the credential is not revoked at the requested timestamp without revealing the credential's index.

## 10. Security Considerations

### 10.1 Link Secret Privacy
The link secret MUST never be revealed to any party. The blinded commitment and correctness proof in the Credential Request are zero-knowledge.

### 10.2 Nonce Freshness
The `c_nonce` MUST be fresh and unpredictable. Reusing nonces enables replay attacks. The Issuer MUST reject Credential Requests with stale or reused nonces.

### 10.3 Credential Correlation
AnonCreds provides unlinkable multi-show by design. However, the OID4VCI Token Endpoint requires authentication (e.g., pre-authorized code), which may create a correlation point. Implementations SHOULD use single-use pre-authorized codes.

### 10.4 Transport Security
All communication MUST use TLS 1.3 or later.

## 11. References

- [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
- [OpenID for Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
- [AnonCreds v1.0 Specification](https://hyperledger.github.io/anoncreds-spec/)
- [Aries RFC 0036 — Issue Credential Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0036-issue-credential)
- [Aries RFC 0037 — Present Proof Protocol](https://github.com/hyperledger/aries-rfcs/tree/main/features/0037-present-proof)
- [DIF Presentation Exchange 2.0](https://identity.foundation/presentation-exchange/)
