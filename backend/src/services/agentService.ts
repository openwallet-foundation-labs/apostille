import 'reflect-metadata';
import { Agent, ConsoleLogger, LogLevel, DidsModule, HttpOutboundTransport, WsOutboundTransport, ConnectionsModule, CredentialsModule, AutoAcceptCredential, V2CredentialProtocol, ProofsModule, AutoAcceptProof, V2ProofProtocol, ConnectionEventTypes, DidExchangeState, InjectionSymbols, BasicMessageEventTypes } from '@credo-ts/core';
import type { BasicMessageStateChangedEvent } from '@credo-ts/core';
import { agentDependencies, HttpInboundTransport, WsInboundTransport } from '@credo-ts/node';
import { AskarModule } from '@credo-ts/askar';
import { ariesAskar } from '@hyperledger/aries-askar-nodejs';
import { TenantsModule } from '@credo-ts/tenants';
import type { ConnectionStateChangedEvent, InitConfig } from '@credo-ts/core';
import { AskarMultiWalletDatabaseScheme } from '@credo-ts/askar';
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { CheqdAnonCredsRegistry, CheqdDidRegistrar, CheqdDidResolver } from '@credo-ts/cheqd';
import { KanonDIDResolver } from '../plugins/kanon/dids/KanonDidResolver';
import { KanonDIDRegistrar } from '../plugins/kanon/dids/KanonDidRegistrar';
import { KanonModuleConfig } from '../plugins/kanon/KanonModuleConfig';
import { EthereumLedgerService } from '../plugins/kanon/ledger';
import { EthereumModule } from '../plugins/kanon/KanonModule';
import { KanonAnonCredsRegistry } from '../plugins/kanon/anoncreds/services/KanonAnonCredsRegistry';
import dotenv from 'dotenv';
import type { AskarWalletPostgresStorageConfig } from '@credo-ts/askar/build/wallet'

import {
    AnonCredsCredentialFormatService,
    AnonCredsModule,
    AnonCredsProofFormatService,
} from '@credo-ts/anoncreds'
import { WorkflowModule, WorkflowCommandRepository, WorkflowInstanceRepository, WorkflowTemplateRepository, WorkflowService, CommandQueueService, PersistentCommandQueue } from '@ajna-inc/workflow/build'
import { WebRTCModule } from '@ajna-inc/webrtc'
import { SigningModule } from '@ajna-inc/signing'
import { VaultsModule } from '@ajna-inc/vaults'
import { GroupMessagingModule } from '@ajna-inc/group-messaging'
import { PoeModule } from '@ajna-inc/poe'
import { OpenBadgesModule } from '@ajna-inc/openbadges'
import { OpenId4VcIssuerModule, OpenId4VcVerifierModule } from '@credo-ts/openid4vc'
import { getMockPoePrograms } from '../poe/MockPoeProgram'
import { CacheStore } from './redis/cacheStore'
import { initializeVaultStorage } from './storageService'

dotenv.config();

// Redis tracking for tenant activity (cross-pod visibility)
const tenantActivityCache = new CacheStore<{ lastAccess: string; podId: string }>({
  prefix: 'agent:tenant-activity:',
  defaultTtlSeconds: 3600  // 1 hour
});

// Unique ID for this pod instance
const POD_ID = process.env.HOSTNAME || `pod-${Date.now()}`;

// Resolve agent and API ports with sane defaults
const apiPort = Number(process.env.PORT || 3002);
const agentPort = process.env.AGENT_PORT ? parseInt(process.env.AGENT_PORT) : 3003;
const agentEndpoint = process.env.AGENT_ENDPOINT || `http://localhost:${agentPort}`;
// Inbound WS transport on a separate port (defaults to AGENT_PORT + 1)
const agentWsPort = process.env.AGENT_WS_PORT ? parseInt(process.env.AGENT_WS_PORT) : agentPort + 1;
// Derive WS endpoint from AGENT_ENDPOINT unless an explicit AGENT_WS_ENDPOINT is provided
let agentWsEndpoint = process.env.AGENT_WS_ENDPOINT;
try {
  if (!agentWsEndpoint) {
    const u = new URL(agentEndpoint);
    const wsProtocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    agentWsEndpoint = `${wsProtocol}//${u.hostname}:${agentWsPort}${u.pathname}`;
  }
} catch {}

console.log('AGENT_ENDPOINT configured:', agentEndpoint);
console.log('AGENT_ENDPOINT env var:', process.env.AGENT_ENDPOINT || 'not set');
console.log('AGENT_PORT env var:', process.env.AGENT_PORT || 'not set');
console.log('AGENT_WS_ENDPOINT configured:', agentWsEndpoint || '<derived>');
console.log('AGENT_WS_PORT env var:', process.env.AGENT_WS_PORT || 'not set');
if (agentWsPort === apiPort) {
  console.warn('[WARN] AGENT_WS_PORT equals API PORT. Will not advertise or bind WS inbound on API port.');
  agentWsEndpoint = undefined;
}
// Ethereum configuration - optional, required for POE/blockchain features
// If not configured, blockchain features will be disabled
const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL;
const ethereumPrivateKey = process.env.ETHEREUM_PRIVATE_KEY;

if (!ethereumRpcUrl || !ethereumPrivateKey) {
    console.warn('[Agent] Ethereum not configured - POE/blockchain features will be unavailable');
    console.warn('[Agent] Set ETHEREUM_RPC_URL and ETHEREUM_PRIVATE_KEY to enable');
}
// Base URL for OpenID4VC (uses API_URL or PUBLIC_URL from env vars)
const apiBaseUrl = process.env.API_URL || process.env.PUBLIC_URL || 'http://localhost:3002';
// Database configuration - parsed from DATABASE_URL or individual variables
let dbConfig: { host: string; user: string; database: string; port: string; password: string };

if (process.env.DATABASE_URL) {
    try {
        const url = new URL(process.env.DATABASE_URL);
        dbConfig = {
            host: url.hostname,
            user: url.username,
            database: url.pathname.slice(1), // Remove leading slash
            port: url.port || '5432',
            password: url.password
        };
        console.log('Using DATABASE_URL for connection configuration');
    } catch (error) {
        console.error('Failed to parse DATABASE_URL:', error);
        throw new Error('DATABASE_URL is invalid');
    }
} else if (process.env.DB_HOST && process.env.DB_PASSWORD) {
    dbConfig = {
        host: process.env.DB_HOST,
        user: process.env.DB_USER || 'postgres',
        database: process.env.DB_NAME || 'verifiable_ai',
        port: process.env.DB_PORT || '5432',
        password: process.env.DB_PASSWORD
    };
} else {
    console.error('FATAL: Database configuration required');
    console.error('Set DATABASE_URL or (DB_HOST + DB_PASSWORD)');
    process.exit(1);
}

// Allow DB_SSL_MODE to override the default SSL behavior
// Set DB_SSL_MODE=disable for local development without SSL
const sslMode = process.env.DB_SSL_MODE || (process.env.NODE_ENV === 'production' ? 'require' : 'disable');
process.env.PGSSLMODE = sslMode;
if (sslMode === 'require') {
    process.env.PGSSLROOTCERT = '';
}
console.log(`Set PGSSLMODE=${sslMode} for database connections`);

process.env.PGHOST = dbConfig.host;
process.env.PGPORT = dbConfig.port;
process.env.PGUSER = dbConfig.user;
process.env.PGPASSWORD = dbConfig.password;
process.env.PGDATABASE = dbConfig.database;
console.log('Set PostgreSQL environment variables for Askar wallet');

// Try using DATABASE_URL directly with SSL parameters if available
let postgresConfig: AskarWalletPostgresStorageConfig;

// Use individual parameters for all configurations
// The Askar wallet doesn't properly handle full connection strings
console.log('Configuring Askar wallet with individual parameters');
postgresConfig = {
    config: {
        host: dbConfig.host,
        connectTimeout: 30000, // Increased from 10s to 30s for better connection handling
    },
    credentials: {
        password: dbConfig.password,
        account: dbConfig.user,
        adminAccount: dbConfig.user,
        adminPassword: dbConfig.password,
    },
    type: "postgres"
}
// Wallet credentials - required for agent initialization
if (!process.env.MAIN_WALLET_ID || !process.env.MAIN_WALLET_KEY) {
    console.error('FATAL: Wallet credentials required');
    console.error('Set MAIN_WALLET_ID and MAIN_WALLET_KEY environment variables');
    process.exit(1);
}
const MAIN_WALLET_ID: string = process.env.MAIN_WALLET_ID;
const MAIN_WALLET_KEY: string = process.env.MAIN_WALLET_KEY;

// Increased session timeout (from default 1000ms to 5000ms)
const AGENT_SESSION_TIMEOUT = process.env.AGENT_SESSION_TIMEOUT ? parseInt(process.env.AGENT_SESSION_TIMEOUT) : 5000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

let mainAgent: Agent | null = null;

interface Tenant {
    id: string;
    tenantId: string;
    config: any;
}

const tenantAgentCache: Record<string, Agent<any>> = {};
const startedTenantQueues: Record<string, boolean> = {};

async function ensureTenantWorkflowQueue(tenantAgent: Agent<any>, tenantId: string) {
    if (startedTenantQueues[tenantId]) return;
    try {
        const dm: any = tenantAgent.dependencyManager as any;
        // If a queue is already registered in this DM, skip
        try {
            const existing = dm.resolve?.(CommandQueueService as any);
            if (existing) {
                startedTenantQueues[tenantId] = true;
                return;
            }
        } catch {}

        const contextProvider = tenantAgent.dependencyManager.resolve(InjectionSymbols.AgentContextProvider) as any;
        const commandRepo = tenantAgent.dependencyManager.resolve(WorkflowCommandRepository);

        // Try to read asyncQueue options from WorkflowModuleConfig if present
        let asyncQueueOpts: any = undefined;
        try {
            const { WorkflowModuleConfig } = require('@ajna-inc/workflow/build');
            const cfg = tenantAgent.dependencyManager.resolve(WorkflowModuleConfig) as any;
            asyncQueueOpts = (cfg && (cfg as any).asyncQueue) || undefined;
        } catch {}

        const queue = new PersistentCommandQueue(commandRepo, contextProvider as any, (tenantAgent as any).context, {
            pollIntervalMs: asyncQueueOpts?.pollIntervalMs,
            concurrency: asyncQueueOpts?.concurrency,
            processingTimeoutMs: asyncQueueOpts?.processingTimeoutMs,
            staleCheckIntervalMs: asyncQueueOpts?.staleCheckIntervalMs,
            cleanupIntervalMs: asyncQueueOpts?.cleanupIntervalMs,
            commandRetentionMs: asyncQueueOpts?.commandRetentionMs,
            failedRetentionMs: asyncQueueOpts?.failedRetentionMs,
            maxAttempts: asyncQueueOpts?.maxAttempts,
        });

        // Register instance for handlers to resolve
        try { dm.registerInstance?.(CommandQueueService as any, queue); } catch {}

        const logger = tenantAgent.config.logger;
        const contextProviderLocal: any = contextProvider;
        const dmLocal = tenantAgent.dependencyManager;

        await queue.startWorker(async (job) => {
            // Resolve correct AgentContext for job (PersistentCommandQueue also resolves internally; we keep this for safety)
            const correlationId = (job as any).contextCorrelationId as string;
            let scopedContext = (tenantAgent as any).context;
            if (correlationId && correlationId !== scopedContext.contextCorrelationId) {
                try {
                    scopedContext = await (contextProviderLocal as any).getAgentContextForContextCorrelationId(correlationId);
                } catch (e) {
                    logger.debug?.('Tenant queue: failed to resolve tenant context', { error: (e as Error).message });
                    return;
                }
            }

            const service = dmLocal.resolve(WorkflowService) as WorkflowService;
            try {
                switch ((job as any).cmd) {
                    case 'start': {
                        // Precheck: ensure template exists, otherwise try fetch and defer
                        const payload = ((job as any).payload || {}) as { template_id?: string; template_version?: string; template_hash?: string; allow_discover?: boolean };
                        const repo = dmLocal.resolve(WorkflowTemplateRepository) as WorkflowTemplateRepository;
                        const rec = payload.template_id ? await repo.findByTemplateIdAndVersion(scopedContext, payload.template_id, payload.template_version) : null;
                        if (!rec) {
                            const allowDiscover = (payload as any).allow_discover ?? true;
                            if (allowDiscover && (job as any).connectionId) {
                                // Rely on WorkflowService discovery mechanisms instead of manual DIDComm.
                                try {
                                    const svc: any = service as any;
                                    if (typeof svc.discoverTemplates === 'function') {
                                        await svc.discoverTemplates(scopedContext as any, {
                                            connection_id: (job as any).connectionId,
                                            template_id: payload.template_id,
                                            template_version: payload.template_version,
                                        } as any);
                                        logger.info?.('Tenant queue: discoverTemplates invoked', { thid: (job as any).thid, template_id: payload.template_id, template_version: payload.template_version });
                                    } else if (typeof svc.discover === 'function') {
                                        await svc.discover(scopedContext as any, {
                                            connection_id: (job as any).connectionId,
                                            template_id: payload.template_id,
                                            template_version: payload.template_version,
                                        } as any);
                                        logger.info?.('Tenant queue: discover invoked', { thid: (job as any).thid, template_id: payload.template_id, template_version: payload.template_version });
                                    }
                                } catch (e) {
                                    logger.debug?.('Tenant queue: discover failed', { error: (e as Error).message });
                                }
                            }
                            const err: any = new Error('template not found for start'); err.code = 'invalid_template'; throw err;
                        }
                        await service.start(scopedContext as any, (job as any).payload);
                        break;
                    }
                    case 'advance':
                        await service.advance(scopedContext as any, (job as any).payload);
                        break;
                    case 'pause':
                        await service.pause(scopedContext as any, (job as any).payload);
                        break;
                    case 'resume':
                        await service.resume(scopedContext as any, (job as any).payload);
                        break;
                    case 'cancel':
                        await service.cancel(scopedContext as any, (job as any).payload);
                        break;
                    case 'complete':
                        await service.complete(scopedContext as any, (job as any).payload);
                        break;
                }

                // Follow-up status to counterparty (best-effort)
                // Do not send custom StatusMessage; rely on Workflow protocol handlers for updates
            } finally {
                if (correlationId && scopedContext && scopedContext !== (tenantAgent as any).context) {
                    try { await (contextProviderLocal as any).endSessionForAgentContext(scopedContext); } catch {}
                }
            }
        });

        startedTenantQueues[tenantId] = true;
        console.log(`Started workflow queue worker for tenant: ${tenantId}`);
    } catch (e) {
        console.warn('Failed to start tenant workflow queue', { tenantId, error: (e as Error).message });
    }
}

async function initializeAgent(walletId: string, walletKey: string, multiWalletDatabaseScheme?: AskarMultiWalletDatabaseScheme): Promise<Agent> {
    // Test database connection first
    console.log('Testing database connection...');
    try {
        const { db } = await import('../db/driver');
        const client = await db.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('Database connection test successful');
    } catch (dbError) {
        console.error('Database connection test failed:', dbError);
        console.log('Continuing with agent initialization despite database test failure');
        // Don't throw error - let the agent try to connect
    }

    const endpoints: string[] = [agentEndpoint];
    if (agentWsEndpoint) endpoints.push(agentWsEndpoint);

    const config: InitConfig = {
        label: `CredoAgent-${walletId}`,
        walletConfig: {
            id: walletId,
            key: walletKey,
            storage: postgresConfig
        },
        endpoints,
        logger: new ConsoleLogger(LogLevel.info),
    };
    // Ethereum config - uses empty strings if not configured (POE features disabled)
    const ethConfig = new KanonModuleConfig({
        networks: [
            {
                network: "testnet",
                rpcUrl: ethereumRpcUrl || "",
                privateKey: ethereumPrivateKey || "",
            },
        ],
    });
    const ledgerService = new EthereumLedgerService(ethConfig);
    try {

        // did:cheqd:testnet:e6a2015b-3d0e-462a-bf8b-88872553867d/resources/d99ac606-ab4b-4957-97c5-bf97438b2180
        const agent = new Agent({
            config,
            dependencies: agentDependencies,
            modules: {
                tenants: new TenantsModule({
                    sessionAcquireTimeout: AGENT_SESSION_TIMEOUT,
                    sessionLimit: 10
                }),
                // basicMessages: new BasicMessagesModule(),
                askar: new AskarModule({
                    ariesAskar: ariesAskar,
                    multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.DatabasePerWallet,

                }),
                dids: new DidsModule({
                    resolvers: [new CheqdDidResolver(), new KanonDIDResolver(ledgerService)],
                    registrars: [new CheqdDidRegistrar(), new KanonDIDRegistrar(ledgerService)],
                }),
                connections: new ConnectionsModule({
                    autoAcceptConnections: true,
                }),
                proofs: new ProofsModule({
                    autoAcceptProofs: AutoAcceptProof.Always,
                    proofProtocols: [
                        new V2ProofProtocol({
                            proofFormats: [new AnonCredsProofFormatService()],
                        }),
                    ],
                }),
                kanon: new EthereumModule(ethConfig),

                credentials: new CredentialsModule({
                    autoAcceptCredentials: AutoAcceptCredential.Always,
                    credentialProtocols: [
                        new V2CredentialProtocol({
                            credentialFormats: [new AnonCredsCredentialFormatService()],
                        }),
                    ],
                }),

                // oob: new OutOfBandModule(),
                anoncreds: new AnonCredsModule({
                    registries: [new CheqdAnonCredsRegistry(), new KanonAnonCredsRegistry()],
                    anoncreds,
                }),
                
                workflow: new WorkflowModule({
                    enableProblemReport: true,
                    enablePaymentsEventMapping: false,
                    // Enable POE event mapping for workflow integration
                    enablePoeEventMapping: true,
                    // Enable auto-discover on start so queued start auto-resumes when template arrives
                    enableAutoDiscoverOnStart: true,
                    // Increase discovery window to allow remote template fetch
                    discoveryTimeoutMs: 30000,
                }),

                signing: new SigningModule(),

                vaults: new VaultsModule({
                    operatorMode: true,  // Can store vaults for other agents
                    inlineThreshold: 5 * 1024 * 1024,  // 5MB - files larger use S3
                }),

                groupMessaging: new GroupMessagingModule(),
                webrtc: new WebRTCModule(),
                poe: new PoeModule({
                    autoExecuteProofs: true,
                    persistNonces: true,
                    poePrograms: getMockPoePrograms(),
                }),
                openbadges: new OpenBadgesModule({
                    cryptosuite: 'eddsa-rdfc-2022',
                }),
                // OpenID4VC Issuer Module for issuing credentials via OID4VCI
                openId4VcIssuer: new OpenId4VcIssuerModule({
                    baseUrl: apiBaseUrl,
                    endpoints: {
                        credential: {
                            credentialRequestToCredentialMapper: async ({
                                agentContext,
                                credentialRequest,
                                holderBinding,
                                credentialConfigurationIds,
                            }) => {
                                // This will be implemented in the routes - placeholder for now
                                // The actual credential mapping logic is handled per-tenant in the routes
                                throw new Error('Credential mapper should be overridden per issuance request');
                            },
                        },
                    },
                }),
                // OpenID4VC Verifier Module for verifying credentials via OID4VP
                openId4VcVerifier: new OpenId4VcVerifierModule({
                    baseUrl: apiBaseUrl,
                }),
            },
        });

        // Enable DIDComm transports: HTTP outbound + WS outbound, HTTP inbound
        agent.registerOutboundTransport(new HttpOutboundTransport());
        agent.registerOutboundTransport(new WsOutboundTransport());

        agent.registerInboundTransport(new HttpInboundTransport({
            port: agentPort,
            // Allow more time for inbound message processing before timing out
            processedMessageListenerTimeoutMs: 60000,
        }));
        // Also listen for DIDComm over WebSocket on AGENT_WS_PORT, but avoid API port conflicts
        try {
            if (agentWsPort === apiPort) {
                console.warn('[WARN] Skipping WS inbound transport: AGENT_WS_PORT equals API PORT');
            } else {
                agent.registerInboundTransport(new WsInboundTransport({ port: agentWsPort }));
            }
        } catch (e) {
            console.warn('Failed to register WS inbound transport', { error: (e as Error).message });
        }
        await agent.initialize();
        console.log(`Agent initialized successfully for wallet: ${walletId}`);
        console.log('Mock POE programs registered via module config');

        // Initialize vault S3 storage if configured
        await initializeVaultStorage(agent);

        mainAgent = agent;

        setupConnectionListener(agent);
        return agent;
    } catch (error) {
        console.error(`Failed to initialize agent: ${error}`);
        throw error;
    }
}


const setupConnectionListener = async (agent: Agent) => {
    agent.events.on<ConnectionStateChangedEvent>(ConnectionEventTypes.ConnectionStateChanged, async ({ payload }) => {
        if (payload.connectionRecord.state === DidExchangeState.Completed) {
            const connectionId = payload.connectionRecord.id
            const oobId = payload.connectionRecord.outOfBandId

            // Use environment variable for platform tenant, skip auto-credential flow if not configured
            const platformTenantId = process.env.PLATFORM_TENANT_ID;
            if (!platformTenantId) {
                console.log('[Connection] No PLATFORM_TENANT_ID configured, skipping auto-credential flow');
                return;
            }

            let _workerAgent;
            try {
                _workerAgent = await getAgent({ tenantId: platformTenantId });
            } catch (error) {
                console.error(`[Connection] Failed to get platform tenant agent (${platformTenantId}):`, error);
                return; // Don't crash, just skip the auto-credential flow
            }

            const oob = await _workerAgent.oob.getAll()
            const oobRecord = oob.find((oob) => oob.id === oobId)
            const goal = oobRecord?.outOfBandInvitation.goalCode
            console.log(`Goal: ${goal}`)
            if (goal === "Get Student ID Card credential") {
                const credentialDefinitionId = "did:kanon:testnet:351e178d-dd03-40e0-899c-65fe9b86ab66/resources/c51c0dc0-4719-48f2-b5f2-8969c87ef9e0"
                const credentialDefinition = await _workerAgent.modules.anoncreds.getCredentialDefinition(credentialDefinitionId);
                if (!credentialDefinition) {
                    new Error("Credential definition not found")
                }
                const schemaId = credentialDefinition.credentialDefinition?.schemaId || ""
                if (!schemaId) {
                    new Error("Schema ID not found")
                }

                const schema = await _workerAgent.modules.anoncreds.getSchema(schemaId);
                if (!schema?.schema) {
                    new Error("Schema not found")
                }
                // Log schema attribute names to debug case sensitivity
                console.log("Student Schema attrNames:", schema?.schema?.attrNames);

                const attributes: any = {
                    "name": "Alice",
                    "Student ID": "S1234567890",
                    "Course": "Computer Science",
                    "Graduation Year": "2025"
                }
                // Map attributes with case-insensitive matching
                const credentialAttributes = schema?.schema?.attrNames.map((attrName: string) => {
                    // Try exact match first
                    let value = attributes[attrName];
                    // If no exact match, try case-insensitive
                    if (!value) {
                        const lowerAttrName = attrName.toLowerCase();
                        const matchingKey = Object.keys(attributes).find(k => k.toLowerCase() === lowerAttrName);
                        if (matchingKey) {
                            value = attributes[matchingKey];
                        }
                    }
                    return {
                        name: attrName,
                        value: value || '',
                    };
                });
                await _workerAgent.credentials.offerCredential({
                    connectionId,
                    // @ts-ignore
                    protocolVersion: 'v2',
                    credentialFormats: {
                        anoncreds: {
                            credentialDefinitionId,
                            attributes: credentialAttributes || []
                        }
                    }
                })
            }
            else if (goal === "Get Professional License credential") {
                const credentialDefinitionId = "did:kanon:testnet:351e178d-dd03-40e0-899c-65fe9b86ab66/resources/3c62ca2b-b4be-4f9a-b5d8-df4e8e404433"
                const credentialDefinition = await _workerAgent.modules.anoncreds.getCredentialDefinition(credentialDefinitionId);
                if (!credentialDefinition) {
                    new Error("Credential definition not found")
                }
                const schemaId = credentialDefinition.credentialDefinition?.schemaId || ""
                if (!schemaId) {
                    new Error("Schema ID not found")
                }
                const schema = await _workerAgent.modules.anoncreds.getSchema(schemaId);
                if (!schema?.schema) {
                    new Error("Schema not found")
                }
                // Log schema attribute names to debug case sensitivity
                console.log("Lawyer Schema attrNames:", schema?.schema?.attrNames);

                // Create case-insensitive attribute lookup
                const attributes: any = {
                    "name": "Joyce",
                    "Lawyer Licence": "1234567890"
                }
                // Map attributes with case-insensitive matching
                const credentialAttributes = schema?.schema?.attrNames.map((attrName: string) => {
                    // Try exact match first
                    let value = attributes[attrName];
                    // If no exact match, try case-insensitive
                    if (!value) {
                        const lowerAttrName = attrName.toLowerCase();
                        const matchingKey = Object.keys(attributes).find(k => k.toLowerCase() === lowerAttrName);
                        if (matchingKey) {
                            value = attributes[matchingKey];
                        }
                    }
                    return {
                        name: attrName,
                        value: value || '',
                    };
                });
                await _workerAgent.credentials.offerCredential({
                    connectionId,
                    // @ts-ignore
                    protocolVersion: 'v2',
                    credentialFormats: {
                        anoncreds: {
                            credentialDefinitionId,
                            attributes: credentialAttributes || []
                        }
                    }
                })
            }




        }
    })
}

// KEM key exchange tag (must match connectionRoutes.ts)
const KEM_KEYPAIR_TAG = 'kem-keypair-connection';

/**
 * Set up KEM key exchange message handler for a tenant agent
 * Listens for incoming basic messages that contain KEM key exchange data
 */
const setupKemKeyExchangeHandler = (agent: Agent<any>) => {
    agent.events.on<BasicMessageStateChangedEvent>(BasicMessageEventTypes.BasicMessageStateChanged, async ({ payload }) => {
        try {
            const { basicMessageRecord } = payload;
            const { content, connectionId, role } = basicMessageRecord;

            // Only process received messages
            if (role !== 'receiver') return;

            // Try to parse as KEM key exchange message
            let kemData: { type: string; kid: string; publicKey: string; algorithm?: string } | null = null;
            try {
                kemData = JSON.parse(content);
            } catch {
                // Not JSON, not a KEM message
                return;
            }

            if (kemData?.type !== 'kem-key-exchange' || !kemData.kid || !kemData.publicKey) {
                return; // Not a KEM key exchange message
            }

            console.log(`[KEM] Received key exchange from connection ${connectionId}: kid=${kemData.kid}`);

            // Store peer's public key in connection metadata
            const publicKeyBytes = new Uint8Array(Buffer.from(kemData.publicKey, 'base64url'));
            await agent.modules.vaults.storePeerKemKey(connectionId, {
                kid: kemData.kid,
                publicKey: publicKeyBytes,
            });
            console.log(`[KEM] Stored peer key for connection ${connectionId}`);

            // Auto-respond with our own key if we don't have one yet
            const existingKeypairs = await agent.genericRecords.findAllByQuery({
                type: KEM_KEYPAIR_TAG,
                connectionId: connectionId,
            });

            if (existingKeypairs.length === 0) {
                // Generate our keypair and send back
                const keypair = agent.modules.vaults.generateKemKeypair();
                console.log(`[KEM] Auto-generating response keypair for connection ${connectionId}: kid=${keypair.kid}`);

                // Store our keypair
                await agent.genericRecords.save({
                    content: {
                        kid: keypair.kid,
                        publicKey: Buffer.from(keypair.publicKey).toString('base64url'),
                        secretKey: Buffer.from(keypair.secretKey).toString('base64url'),
                        connectionId: connectionId,
                        createdAt: new Date().toISOString(),
                    },
                    tags: {
                        type: KEM_KEYPAIR_TAG,
                        connectionId: connectionId,
                        kid: keypair.kid,
                    },
                });

                // Send our public key back
                const responseMessage = JSON.stringify({
                    type: 'kem-key-exchange',
                    kid: keypair.kid,
                    publicKey: Buffer.from(keypair.publicKey).toString('base64url'),
                    algorithm: 'ML-KEM-768',
                    timestamp: new Date().toISOString(),
                });

                await agent.basicMessages.sendMessage(connectionId, responseMessage);
                console.log(`[KEM] Sent response key to connection ${connectionId}`);
            }
        } catch (error) {
            console.error('[KEM] Error processing key exchange message:', error);
        }
    });
};

// Helper function to implement retries with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = RETRY_DELAY): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        if (retries <= 0 || !error.message?.includes('Failed to acquire an agent context session')) {
            throw error;
        }

        console.log(`Operation failed, retrying in ${delay}ms (${retries} retries left): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 1.5); // Exponential backoff
    }
}

/**
 * Get or create an agent for a wallet ID
 */
export async function getAgent({
    tenantId
}: {
    tenantId?: string
}): Promise<Agent<any>> {
    console.log(`Getting agent for tenant: ${tenantId}`);

    if (!tenantId) {
        throw new Error('Tenant ID is required');
    }

    if (tenantAgentCache[tenantId]) {
        console.log(`Using cached tenant agent for tenant: ${tenantId}`);
        // Update activity in Redis (async, don't await to avoid blocking)
        tenantActivityCache.set(tenantId, { lastAccess: new Date().toISOString(), podId: POD_ID }).catch(() => {});
        return tenantAgentCache[tenantId];
    }

    if (mainAgent) {
        console.log(`Using existing main agent for tenant: ${tenantId}`);

        try {
            const tenantAgent = await withRetry(() => mainAgent!.modules.tenants.getTenantAgent({
                tenantId
            })) as Agent<any>;

            tenantAgentCache[tenantId] = tenantAgent;
            console.log(`Cached tenant agent for tenant: ${tenantId}`);

            // Set up KEM key exchange message handler
            setupKemKeyExchangeHandler(tenantAgent);

            // Track activity in Redis
            await tenantActivityCache.set(tenantId, { lastAccess: new Date().toISOString(), podId: POD_ID });

            await ensureTenantWorkflowQueue(tenantAgent, tenantId);

            return tenantAgent;
        } catch (error) {
            console.error(`Error getting tenant agent: ${error}`);
            throw error;
        }
    }

    try {
        console.log(`Main agent not initialized. Creating new main agent.`);
        const agent = await initializeAgent(MAIN_WALLET_ID, MAIN_WALLET_KEY);

        const tenantAgent = await withRetry(() => agent.modules.tenants.getTenantAgent({
            tenantId
        })) as Agent<any>;

        tenantAgentCache[tenantId] = tenantAgent;
        console.log(`Cached tenant agent for tenant: ${tenantId}`);

        // Set up KEM key exchange message handler
        setupKemKeyExchangeHandler(tenantAgent);

        await ensureTenantWorkflowQueue(tenantAgent, tenantId);

        return tenantAgent;
    } catch (error: any) {
        if (error.message?.includes('already exists')) {
            console.log(`Wallet already exists, trying to open it`);

            const agent = await initializeAgent(MAIN_WALLET_ID, MAIN_WALLET_KEY);

            const tenantAgent = await withRetry(() => agent.modules.tenants.getTenantAgent({
                tenantId
            })) as Agent<any>;

            tenantAgentCache[tenantId] = tenantAgent;
            console.log(`Cached tenant agent for tenant: ${tenantId}`);

            // Set up KEM key exchange message handler
            setupKemKeyExchangeHandler(tenantAgent);

            await ensureTenantWorkflowQueue(tenantAgent, tenantId);

            return tenantAgent;
        }

        console.error(`Failed to get agent for tenant ${tenantId}:`, error);
        throw error;
    }
}

/**
 * Get the main agent
 */
export async function getMainAgent(): Promise<Agent> {
    if (!mainAgent) {
        throw new Error('Main agent not initialized');
    }
    return mainAgent;
}

/**
 * Create a tenant for an agent
 */
export async function createTenant(config: { label: string }): Promise<Tenant> {
    if (!mainAgent || !mainAgent.isInitialized) {
        console.log(`Initializing main agent for tenant creation`);

        await initializeAgent(MAIN_WALLET_ID, MAIN_WALLET_KEY);
    }

    if (!mainAgent) {
        throw new Error('Failed to initialize main agent');
    }

    const tenant = await withRetry(() => mainAgent!.modules.tenants.createTenant({ config })) as Tenant;

    if (tenant && tenant.tenantId && tenantAgentCache[tenant.tenantId]) {
        delete tenantAgentCache[tenant.tenantId];
        console.log(`Cleared cached tenant agent for recreated tenant: ${tenant.tenantId}`);
    }

    return tenant;
}

/**
 * Validate wallet credentials by attempting to initialize an agent
 */
export async function validateCredentials(tenantId: string): Promise<boolean> {
    try {
        await getAgent({ tenantId });
        return true;
    } catch (error) {
        console.error(`Invalid credentials for tenant ${tenantId}:`, error);
        return false;
    }
}

/**
 * Initialize the agent system - should be called once when the Express server starts
 */
export async function initializeAgentSystem(): Promise<void> {

    if (mainAgent) {
        return;
    }
    if (process.env.DEFAULT_ADMIN_WALLET_ID && process.env.DEFAULT_ADMIN_WALLET_KEY) {
        try {
            console.log('Initializing default admin agent...');
            await initializeAgent(
                process.env.DEFAULT_ADMIN_WALLET_ID,
                process.env.DEFAULT_ADMIN_WALLET_KEY
            );
            console.log('Default admin agent initialized successfully');
        } catch (error) {
            console.error('Failed to initialize default admin agent:', error);
        }
    } else {

        try {
            console.log('Initializing default main agent...');
            await initializeAgent(MAIN_WALLET_ID, MAIN_WALLET_KEY);
            console.log('Default main agent initialized successfully');
        } catch (error) {
            console.error('Failed to initialize default main agent:', error);
        }
    }
} 
