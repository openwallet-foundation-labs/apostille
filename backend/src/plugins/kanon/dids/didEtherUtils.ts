
import { DidDocument } from "@credo-ts/core";

export function validateSpecCompliantPayload(
  didDocument: DidDocument
): SpecValidationResult {

  if (!didDocument.id && !didDocument.id.startsWith("did:cheqd:"))
    return { valid: false, error: "id is required" };


  if (!didDocument.verificationMethod)
    return { valid: false, error: "verificationMethod is required" };


  if (!Array.isArray(didDocument.verificationMethod))
    return { valid: false, error: "verificationMethod must be an array" };


  if (!didDocument.verificationMethod.length)
    return { valid: false, error: "verificationMethod must be not be empty" };


  const isValidVerificationMethod = didDocument.verificationMethod.every(
    (vm) => {
      switch (vm.type) {
        case VerificationMethods.Ed255192020:
          return vm.publicKeyMultibase != null;
        case VerificationMethods.JWK:
          return vm.publicKeyJwk != null;
        case VerificationMethods.Ed255192018:
          return vm.publicKeyBase58 != null;
        default:
          return false;
      }
    }
  );

  if (!isValidVerificationMethod)
    return { valid: false, error: "verificationMethod publicKey is Invalid" };

  const isValidService = didDocument.service
    ? didDocument?.service?.every((s) => {
        return s?.serviceEndpoint && s?.id && s?.type;
      })
    : true;

  if (!isValidService) return { valid: false, error: "Service is Invalid" };
  return { valid: true } as SpecValidationResult;
}


export type SpecValidationResult = {
    valid: boolean;
    error?: string;
    protobufVerificationMethod?: any[];
    protobufService?: any[];
};

export declare enum VerificationMethods {
  Ed255192020 = "Ed25519VerificationKey2020",
  Ed255192018 = "Ed25519VerificationKey2018",
  JWK = "JsonWebKey2020"
}