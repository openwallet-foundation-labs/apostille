import {  VerificationMethods } from "@cheqd/sdk";
import { EthereumLedgerService } from "../ledger";
import {
  AgentContext,
  DidCreateOptions,
  DidCreateResult,
  DidDeactivateOptions,
  DidDocument,
  DidDocumentRole,
  DidOperationStateActionBase,
  DidRecord,
  DidRegistrar,
  DidRepository,
  DidUpdateOptions,
  DidUpdateResult,
  injectable,
  KeyType,
} from "@credo-ts/core";
import { uuid } from "@credo-ts/core/build/utils/uuid";
import { id } from "ethers";
import { AnonCredsCredentialDefinitionRepository } from "@credo-ts/anoncreds";
import { AnonCredsRegistryService, AnonCredsSchemaRepository } from "@credo-ts/anoncreds";

@injectable()
export class KanonDIDRegistrar implements DidRegistrar {
  public readonly supportedMethods = ["kanon"];

  constructor(private ledgerService: EthereumLedgerService) {}

  async create(
    agentContext: AgentContext,
    options: EthereumDidCreateOptions
  ): Promise<DidCreateResult<DidOperationStateActionBase>> {
    const didRepository = agentContext.dependencyManager.resolve(DidRepository);
    const etheriumLedgerService = agentContext.dependencyManager.resolve(
      EthereumLedgerService
    );
    console.log(options, "options");

    let didDocument: DidDocument;
    const _didDocument = options.options?.didDocument;
    console.log(options);
    if (!options.network) {
      throw new Error("Network is required");
    }

    const key = await agentContext.wallet.createKey({ keyType: KeyType.Ed25519 });
    console.log(key, "key");
    const publicKeyBase58 = key.publicKeyBase58;
    console.log(publicKeyBase58, "publicKeyBase58");
    try {
      let didStr = "";
      if (_didDocument) {
        didDocument = _didDocument;
        const kanonId = _didDocument.id;
      } else {
        didDocument = new DidDocument({
          id: options.did,
          context: "https://www.w3.org/ns/did/v1",
          verificationMethod: [
            {
              controller: `did:kanon:${options.network}:${publicKeyBase58}`,
              id: options.did + "#key-1",
              type: "Ed25519VerificationKey2020",
              publicKeyBase58,
              
            },

          ],
          authentication:[
            options.did + "#key-1"
          ],
          assertionMethod:[
            options.did + "#key-1"
          ],
        });
      }
      if (options.did) {
        didStr = options.did;
      } else {
        didStr = `did:kanon:${options.network}:${uuid()}`;
      }
      const didDocumentjson = JSON.stringify(didDocument);
      console.log(didDocumentjson, didStr);
      await etheriumLedgerService.executeDIDOperation(
        "create",
        didStr,
        options.network,
        didDocumentjson
      );
      console.log(didStr);
      didDocument.id = options.did || didStr;
      const didRecord = new DidRecord({
        did: didStr,
        role: DidDocumentRole.Created,
        didDocument: didDocument,
        tags: {
          network: options.network,
          role: DidDocumentRole.Created,
          method: "kanon",
        },
      });
      console.log(didRecord);
      await didRepository.save(agentContext, didRecord);
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: "finished",
          did: didDocument.id,
          didDocument,
          secret: options.secret,
        },
      };
    } catch (e: any) {
      console.log(e);
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: "failed",
          reason: e.message,
        },
      };
    }
  }

  public async createResource(
    agentContext: AgentContext,
    did: string,
    options: KanonCreateResourceOptions
  ) {
    const etheriumLedgerService = agentContext.dependencyManager.resolve(
      EthereumLedgerService
    );
    const didRepository = agentContext.dependencyManager.resolve(DidRepository);
    try {
      const didRecord = await didRepository.findCreatedDid(agentContext, did);
      console.log(JSON.stringify(options), "options");
      

      let issuerId = options.issuerId;
      if (!issuerId && typeof options.data === 'object') {
        const data = options.data as any;
        issuerId = options.issuerId;
      }
      
      
      console.log("Using values for registration:", {
        schemaId: did,
        details: typeof options === 'string' ? options : JSON.stringify(options),
        network: options.network,
        issuerId: issuerId
      });
      
      const response = await etheriumLedgerService.registerSchema(
        did,
        JSON.stringify(options),
        options.network,
        issuerId 
      );
      console.log(response, "responsfbe");

      return {
        resource: {
          id: options.id || did
        },
        resourceState: {
          state: "finished",
          resource: response
        }
      };

    } catch (e: any) {
      console.log(e);
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: "failed",
          reason: e.message,
        },
      };
    }
  }

  async createCredentialDefinition(
    agentContext: AgentContext,
    did: string,
    options: any,
  ): Promise<any> {
    const etheriumLedgerService = agentContext.dependencyManager.resolve(
      EthereumLedgerService
    );
    console.log(options, "optionsds");
    
    try {
      // ${credentialDefinition.issuerId}/resources/${credentialDefinitionResource.id}
      const response = await etheriumLedgerService.registerCredentialDefinition(
        `${options.issuerId}/resources/${options.id}`,
        options.data.schemaId,
        options.issuerId,
        JSON.stringify(options),
        options.network
      );
      console.log(response, "responskgvfkje");

      if (response.status !== 1) {
        return {
          credentialDefinitionMetadata: {},
          credentialDefinitionState: {
            state: "failed",
            reason: response.logs,
          },
        };
      }
      return {
        credentialDefinition: response,
        credentialDefinitionMetadata: {},
        
        credentialDefinitionState: {
          state: "finished",
          credentialDefinition: response,
        },
      };
    } catch (e: any) {
      console.log(e);
      return {
        credentialDefinitionMetadata: {},
        credentialDefinitionState: {
          state: "failed",
          reason: e.message,
        },
      };
    }
  }

  async update(
    agentContext: AgentContext,
    options: EthereumDidUpdateOptions
  ): Promise<DidUpdateResult> {
    const didRepository = agentContext.dependencyManager.resolve(DidRepository);
    const etheriumLedgerService = agentContext.dependencyManager.resolve(
      EthereumLedgerService
    );
    let didDocument: DidDocument;
    const versionId = options.options?.versionId;

    try {
      if (options.didDocument) {
        didDocument = options.didDocument;
        const kanonId = options.didDocument.id;
      } else {
        didDocument = new DidDocument({
          id: options.id || options.did,
          context: "https://www.w3.org/ns/did/v1",
        });
      }
      const didDocumentjson = JSON.stringify(didDocument);
      const response = await etheriumLedgerService.executeDIDOperation(
        "update",
        didDocument.id,
        options.network,
        didDocumentjson
      );
      const did = response.did;
      didDocument.id = did;
      const didRecord = new DidRecord({
        did: didDocument.id,
        role: DidDocumentRole.Created,
        didDocument: didDocument,
      });

      await didRepository.save(agentContext, didRecord);
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: "finished",
          did: didDocument.id,
          didDocument,
          secret: options.secret,
        },
      };
    } catch (e: any) {
      console.log(e);
      return {
        didDocumentMetadata: {},
        didRegistrationMetadata: {},
        didState: {
          state: "failed",
          reason: e.message,
        },
      };
    }
  }

  async deactivate(
    agentContext: AgentContext,
    options: EthereumDidDeactivateOptions
  ): Promise<DidUpdateResult> {
    throw new Error("Method not implemented.");
  }
}

export interface EthereumDidCreateOptions extends DidCreateOptions {
  method: "kanon";
  did: string;
  network: string;
  id: string;
  options: {
    versionId?: string;
    didDocument: DidDocument;
  };
}

export interface EthereumDidUpdateOptions extends DidUpdateOptions {
  did: string;
  didDocument: DidDocument;
  network: string;
  id: string;
  options: {
    versionId?: string;
  };
}

export interface EthereumDidDeactivateOptions extends DidDeactivateOptions {
  method: "kanon";
  did: string;
  network: string;
  options: {
    versionId?: string;
  };
}

interface IVerificationMethod {
  type: `${VerificationMethods}`;
  id: TVerificationKey<string, number>;
  privateKey?: Buffer;
}
export type TVerificationKeyPrefix = string;
export type TVerificationKey<
  K extends TVerificationKeyPrefix,
  N extends number
> = `${K}-${N}`;


export interface KanonCreateResourceOptions
  extends Omit<Partial<MsgCreateResourcePayload>, "data"> {
  data: string | Uint8Array | object;
  network: string;
  issuerId: string;
}

export interface MsgCreateResourcePayload {
  /** data is a byte-representation of the actual Data the user wants to store. */
  data: Uint8Array;
  /**
   * collection_id is an identifier of the DidDocument the resource belongs to.
   * Format: <unique-identifier>
   *
   * Examples:
   * - c82f2b02-bdab-4dd7-b833-3e143745d612
   * - wGHEXrZvJxR8vw5P3UWH1j
   */
  collectionId: string;
  /**
   * id is a unique id of the resource.
   * Format: <uuid>
   */
  id: string;
  /**
   * name is a human-readable name of the resource.
   * Format: <string>
   *
   * Does not change between different versions.
   * Example: PassportSchema, EducationTrustRegistry
   */
  name: string;
  /**
   * version is a version of the resource.
   * Format: <string>
   * Stored as a string. OPTIONAL.
   *
   * Example: 1.0.0, v2.1.0
   */
  version: string;
  /**
   * resource_type is a type of the resource.
   * Format: <string>
   *
   * This is NOT the same as the resource's media type.
   * Example: AnonCredsSchema, StatusList2021
   */
  resourceType: string;
  /** also_known_as is a list of URIs that can be used to get the resource. */
  alsoKnownAs: AlternativeUri[];
}

export interface AlternativeUri {
  /**
   * uri is the URI of the Resource.
   * Examples:
   * - did:cheqd:testnet:MjYxNzYKMjYxNzYK/resources/4600ea35-8916-4ac4-b412-55b8f49dd94e
   * - https://resolver..cheqd.net/1.0/identifiers/did:cheqd:testnet:MjYxNzYKMjYxNzYK/resources/4600ea35-8916-4ac4-b412-55b8f49dd94e
   * - https://example.com/example.json
   * - https://gateway.ipfs.io/ipfs/bafybeihetj2ng3d74k7t754atv2s5dk76pcqtvxls6dntef3xa6rax25xe
   * - ipfs://bafybeihetj2ng3d74k7t754atv2s5dk76pcqtvxls6dntef3xa6rax25xe
   */
  uri: string;
  /**
   * description is a human-readable description of the URI. Defined client-side.
   * Examples:
   * - did-uri
   * - http-uri
   * - ipfs-uri
   */
  description: string;
}
