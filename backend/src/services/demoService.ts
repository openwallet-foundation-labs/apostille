import { createTenant, getAgent } from '../services/agentService';
import { agentDependencies, HttpInboundTransport } from '@credo-ts/node';
import { KanonModuleConfig } from '../plugins/kanon/KanonModuleConfig';
import { EthereumLedgerService } from '../plugins/kanon/ledger';

// Ethereum configuration - optional, used for blockchain features
const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL;
const ethereumPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;

// Demo tenant ID - will be created if not found
let tenantId = process.env.PLATFORM_TENANT_ID || "demo-tenant";
let did: any;
let personSchemaResult:any;
let personCredDefResult:any;

const getDemoTenantId = async () => {
    let agent;
    try {
        agent = await getAgent({ tenantId })
        return tenantId;
    } catch (error) {
        const demoTennat = await createTenant({ label: "Demmo Tennat" });
        agent = await getAgent({ tenantId: demoTennat.id })
        tenantId = demoTennat.id
        return tenantId;
    }
}

export const demoAgentSetup = async () => {
    try {

        const tenantId = await getDemoTenantId();
        const agent = await getAgent({ tenantId })

        const { outOfBandInvitation } = await agent.oob.createInvitation({
            multiUseInvitation: true,
            goal: "Demo"
        });
        // Use our agent endpoint directly (no mediator)
        const invitationUrl = outOfBandInvitation.toUrl({ domain: agent.config.endpoints[0] });
        return {
            success: true,
            invitationUrl,
            demoTenantId: tenantId
        }

    } catch (error) {
        console.log(error, 42)
        return {
            success: false,
            message: error
        }
    }
}


export const createDemoDid = async () => {

    const didOptions = {
        method: 'kanon',
        secret: {
            verificationMethod: {
                id: 'key-1',
                type: 'EcdsaSecp256k1VerificationKey2019'
            }
        },
        network: 'testnet'

    };

    const tenantId = await getDemoTenantId();
    const agent = await getAgent({ tenantId });
    const didResult = await agent.dids.create(didOptions);
    if (didResult.didState.state !== 'finished' || !didResult.didState.did) {
        const errorMessage = didResult.didState.state === 'failed'
            ? (didResult.didState as any).reason || 'Unknown error'
            : 'Failed to create DID';

        return {
            success: false,
            errorMessage
        };
    }
    console.log("Created Demo Did ", 78)
    console.log(didResult.didState.did, 79)
    return {
        success: true,
        message: 'DID created successfully',
        did: {
            did: didResult.didState.did,
            method: "kanon",
            createdAt: new Date().toISOString()
        }
    }

}

export const getDemoDid = async () => {
    if (did) {
        console.log("Using Cached Demo Did !")
        return did
    } else {
        console.log("Creating Demo Did !")
        did = await createDemoDid()
        return did;
    }
}

export const createDemoSchema = async (structure: string = "person") => {
    try {
        let attributes;
        switch (structure) {
            case "person":       //TODO: MAKE CHANGES ACCORDINGLY FOR DIFFERENT DEMO STRUCTURE
                if(personSchemaResult)return{
                    success:true,
                    schemaResult:personSchemaResult
                }
                attributes = ['name', 'age', 'sex']
                break;

            default:
                attributes = ['defaultAttribute']
                break;
        }


        const tenantId = await getDemoTenantId();
        const agent = await getAgent({ tenantId });
        const didData = await getDemoDid();
        const did = didData.did.did;
        let issuerDid = did;
        let version = '1.0';
        const schemaOptions = {
            network: "testnet",
            options: {
                methodSpecificIdAlgo: "uuid",
                method: "kanon",
                network: "testnet",
            },
            schema: {
                attrNames: attributes,
                issuerId: issuerDid,
                name:"Demo Schema",
                version
            }
        };

        personSchemaResult = await agent.modules.anoncreds.registerSchema(schemaOptions);
        if (personSchemaResult.schemaState.state !== 'finished') {
            return {
                message: "Oops! Something Went Wrong ! ",
                success: false
            };
        }
        console.log('Schema registration result:', personSchemaResult)
        return {success:true,schemaResult:personSchemaResult}

    } catch (error) {
        console.log(error, 148)
        return { success: false, message: "Something went wrong", error }
    }
}

type PersonDetails={  // TODO: for now only for preson details 
    name:string,
    age:number,
    sex:string
}
export const createDemoCredDef= async (defineStructure:any="person")=>{
    try {

        if(personCredDefResult){
            return {
                success:true,
                credDefResult:personCredDefResult
            }
        }
        const getSchema = await createDemoSchema();
        const schemaId = getSchema.schemaResult.schemaState.schemaId;
        const issuerId = getSchema.schemaResult.schemaState.schema.issuerId
        const schemaIdParts = schemaId.split(':');
        const network = schemaIdParts.length >= 3 ? schemaIdParts[2] : 'testnet';
        console.log(network,178)
        console.log(schemaId,179)
        console.log(issuerId,180)
        const tenantId = await getDemoTenantId();
        const agent = await getAgent({ tenantId });
        const tag="Demo"
        const isKanon = issuerId.includes('did:kanon');
        let credDefResult;
        if (isKanon) {
          // add type and value if did:kanon 
          credDefResult = await agent.modules.anoncreds.registerCredentialDefinition({
            options: {
              network: network,
              methodSpecificIdAlgo: 'uuid',
            },
            credentialDefinition: {
              issuerId, // Use the issuer ID from the schema
              schemaId,
              tag,
            }
          });
          console.log(credDefResult, "credDefResult");
        }
        else {
          credDefResult = await agent.modules.anoncreds.registerCredentialDefinition({
            options: {
              network: network,
            methodSpecificIdAlgo: 'uuid',
          },
          credentialDefinition: {
            issuerId, // Use the issuer ID from the schema
            schemaId,
            tag,
            
          }
        });
    }
    
        // const credDefResult = await agent.modules.anoncreds.registerCredentialDefinition({
        //     options: {
        //       network: network,
        //       methodSpecificIdAlgo: 'uuid',
        //     },
        //     credentialDefinition: {
        //       issuerId, 
        //       schemaId,
        //       tag:"Demo",
        //     }
        //   });
          personCredDefResult=credDefResult;
          return{
            success:true,
            credDefResult
          }

        
    } catch (error) {
        return{
            message:"Oops !  Something went wrong !",
            error
        }
    }
}
