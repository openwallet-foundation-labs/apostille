import {
  AnonCredsCredentialDefinitionRepository,
  AnonCredsRegistry,
  AnonCredsRegistryService,
  GetCredentialDefinitionReturn,
  GetRevocationRegistryDefinitionReturn,
  GetRevocationStatusListReturn,
  GetSchemaReturn,
  RegisterCredentialDefinitionOptions,
  RegisterCredentialDefinitionReturn,
  RegisterRevocationRegistryDefinitionOptions,
  RegisterRevocationRegistryDefinitionReturn,
  RegisterRevocationStatusListOptions,
  RegisterRevocationStatusListReturn,
  RegisterSchemaOptions,
  RegisterSchemaReturn,
} from "@credo-ts/anoncreds";
import { anoncreds } from '@hyperledger/anoncreds-shared'

import { AgentContext, DidRepository } from "@credo-ts/core";
import {
  parsekanonDid,
} from "../../utils/identifiers";
import { KanonDIDResolver } from "../../dids";
import {
  KanonCreateResourceOptions,
  KanonDIDRegistrar,
} from "../../dids/KanonDidRegistrar";
import { uuid } from "@credo-ts/core/build/utils/uuid";
import { EthereumLedgerService } from "../../ledger";

export class KanonAnonCredsRegistry implements AnonCredsRegistry {
  public supportedIdentifier: RegExp = new RegExp(".*");

  public methodName = "kanon";
  public async getSchema(
    agentContext: AgentContext,
    schemaId: string
  ): Promise<GetSchemaReturn> {
    try {
      const kanonDidResolver =
        agentContext.dependencyManager.resolve(KanonDIDResolver);
      console.log(schemaId);
      const parsedDid = parsekanonDid(schemaId);
      console.log(parsedDid, "parsedDiddssd");
      console.log(schemaId, "schemaId");


      const response = await kanonDidResolver.resolveResource(
        agentContext,
        schemaId
      );
      console.log(response, "responsesdlkjd");
      return {
        schema: {
          attrNames: response.didDocument.schema.attrNames,
          name: response.didDocument.schema.name,
          version: response.didDocument.schema.version,
          issuerId: response.didDocument.schema.issuerId,
        },
        schemaId,
        resolutionMetadata: {},
        schemaMetadata: {},
      };
    } catch (error: any) {
      console.log(error);
      agentContext.config.logger.error(
        `Error retrieving schema '${schemaId}'`,
        {
          error,
          schemaId,
        }
      );

      return {
        schemaId,
        resolutionMetadata: {
          error: "notFound",
          message: `unable to resolve schema: ${error.message}`,
        },
        schemaMetadata: {},
      };
    }
  }
  public async registerSchema(
    agentContext: AgentContext,
    options: RegisterSchemaOptions
  ): Promise<RegisterSchemaReturn> {
    console.log(options, "options register schema");
    try {
      const kanonDisRegistrar =
        agentContext.dependencyManager.resolve(KanonDIDRegistrar);
      const schema = options.schema;
      const schemaResource = {
        id: uuid(),
        name: `${schema.name}-Schema`,
        resourceType: "anonCredsSchema",
        data: {
          name: schema.name,
          version: schema.version,
          attrNames: schema.attrNames,
          issuerId: schema.issuerId,
        },
        version: schema.version,
      } as KanonCreateResourceOptions;

      console.log(schema, "schemadsfgdsf");
      const response = await kanonDisRegistrar.createResource(
        agentContext,
        `${schema.issuerId}/resources/${schemaResource.id}`,
        {
          data: schemaResource,
          // @ts-ignore 
          network: options.network,
          issuerId: schema.issuerId,

        }

      );
      console.log(response, "response anoncreds");
      if (response.didState?.state === "failed") {
        throw new Error("Failed to register schema");
      }

      return {
        schemaState: {
          state: "finished",
          schema,
          schemaId: `${schema.issuerId}/resources/${schemaResource.id}`,
        },
        registrationMetadata: {},
        schemaMetadata: {},
      };
    } catch (error: any) {
      agentContext.config.logger.debug(
        `Error registering schema for did '${options.schema.issuerId}'`,
        {
          error,
          did: options.schema.issuerId,
          schema: options,
        }
      );

      return {
        schemaMetadata: {},
        registrationMetadata: {},
        schemaState: {
          state: "failed",
          schema: options.schema,
          reason: `unknownError: ${error.message}`,
        },
      };
    }
  }
  public async getCredentialDefinition(
    agentContext: AgentContext,
    credentialDefinitionId: string
  ): Promise<GetCredentialDefinitionReturn> {
  //   export interface AnonCredsCredentialDefinition {
  //     issuerId: string;
  //     schemaId: string;
  //     type: 'CL';
  //     tag: string;
  //     value: {
  //         primary: Record<string, unknown>;
  //         revocation?: unknown;
  //     };
  // }
    const ledgerService = agentContext.dependencyManager.resolve(
      EthereumLedgerService
    );
    console.log(credentialDefinitionId, "credentialDefinitionIdsdsda");
    const credentialDefinition = await ledgerService.getCredentialDefinition(
      credentialDefinitionId
    );
    console.log(credentialDefinition, "credentialDefinitionjhgfjhgsdfs");
    console.log(credentialDefinition[0], "credentialDefinitionjhgfjhgsdfs");
    const credDefJson = credentialDefinition[2]
    const credDefJsonObject = JSON.parse(credDefJson)
    console.log(credDefJsonObject, "credentialDefinitionjhgfjhg");

    // Extract overlay data if present (OCA branding/meta stored on ledger)
    const overlay = credDefJsonObject.data?.overlay;

    return {
      credentialDefinitionId: credentialDefinitionId,
      resolutionMetadata: {},
      credentialDefinitionMetadata: {
        overlay: overlay || undefined
      },
      credentialDefinition: {
        issuerId: credDefJsonObject.data.issuerId,
        schemaId: credDefJsonObject.data.schemaId,
        type: 'CL',
        tag: credDefJsonObject.data.tag,
        value: credDefJsonObject.data.value.primary.value
      }
    }
      
    
  }
  public async registerCredentialDefinition(
    agentContext: AgentContext,
    options: RegisterCredentialDefinitionOptions
  ): Promise<RegisterCredentialDefinitionReturn> {
    const kanonDisRegistrar =
      agentContext.dependencyManager.resolve(KanonDIDRegistrar);
    const schema = await this.getSchema(agentContext, options.credentialDefinition.schemaId)
    console.log(options, "schsddssdcsema");
    if (!schema.schema) {
      throw new Error("Schema not found");
    }

    try {

      const didResolver = agentContext.dependencyManager.resolve(DidRepository);
      console.log(JSON.stringify(options, null, 2), "optionsdssd");
      const didRecord = await didResolver.getAll(agentContext)
      const issuerDid = didRecord.find((did) => did.did === options.credentialDefinition.issuerId)
      console.log(didRecord, "didRecordsdsd");
      // throw new Error("Failed to register credential definition");
    } catch (error: any) {
      console.log(error, "error");
      throw new Error("Failed to register credential definition");
    }


    const credentialDefinition = options.credentialDefinition;

    // Extract overlay from options if provided (custom extension for OCA support)
    // @ts-ignore - overlay is a custom extension not in Credo's types
    const overlay = options.overlay || options.options?.overlay;

    const credentialDefinitionResource = {
      id: uuid(),
      name: `${credentialDefinition.tag}-CredentialDefinition`,
      resourceType: "anonCredsCredentialDefinition",
      data: {
        schemaId: credentialDefinition.schemaId,
        issuerId: credentialDefinition.issuerId,
        tag: credentialDefinition.tag,
        value: {
          primary: {
            name: credentialDefinition.tag,
            value: credentialDefinition.value
          }
        },
        // Include OCA overlay if provided (meta, branding)
        ...(overlay && { overlay })
      },
      
      // @ts-ignore 
      network: options.network,
      issuerId: credentialDefinition.issuerId,
      version: uuid(),
    } as KanonCreateResourceOptions;
    console.log(credentialDefinitionResource, "credentialDefinitionResource");
    const response = await kanonDisRegistrar.createCredentialDefinition(
      agentContext,
      credentialDefinitionResource.id!,
      credentialDefinitionResource
    );
    console.log(response, "response anoncredsdsds");

    return {
      credentialDefinitionState: {
        state: "finished",
        credentialDefinition,
        credentialDefinitionId: `${credentialDefinition.issuerId}/resources/${credentialDefinitionResource.id}`,
      },
      registrationMetadata: {},
      credentialDefinitionMetadata: {},
    };
  }
  getRevocationRegistryDefinition(
    agentContext: AgentContext,
    revocationRegistryDefinitionId: string
  ): Promise<GetRevocationRegistryDefinitionReturn> {
    throw new Error("Method not implemented.");
  }
  registerRevocationRegistryDefinition(
    agentContext: AgentContext,
    options: RegisterRevocationRegistryDefinitionOptions
  ): Promise<RegisterRevocationRegistryDefinitionReturn> {
    throw new Error("Method not implemented.");
  }
  getRevocationStatusList(
    agentContext: AgentContext,
    revocationRegistryId: string,
    timestamp: number
  ): Promise<GetRevocationStatusListReturn> {
    throw new Error("Method not implemented.");
  }
  registerRevocationStatusList(
    agentContext: AgentContext,
    options: RegisterRevocationStatusListOptions
  ): Promise<RegisterRevocationStatusListReturn> {
    throw new Error("Method not implemented.");
  }
}
