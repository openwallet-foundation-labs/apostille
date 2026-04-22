import 'reflect-metadata';
import {
    Agent,
    ConsoleLogger,
    LogLevel,
    DidsModule,
    InjectionSymbols,
    WebDidResolver,
    KeyDidResolver,
    PeerDidResolver,
    JwkDidResolver,
    KeyDidRegistrar,
    PeerDidRegistrar,
    JwkDidRegistrar,
    type DependencyManager,
    type Module,
} from '@credo-ts/core';
import {
    DidCommAutoAcceptCredential,
    DidCommAutoAcceptProof,
    DidCommBasicMessageEventTypes,
    DidCommConnectionEventTypes,
    DidCommCredentialV2Protocol,
    DidCommDidExchangeState,
    DidCommFeatureRegistry,
    DidCommHttpOutboundTransport,
    DidCommModule,
    DidCommProofV2Protocol,
    DidCommProtocol,
    DidCommWsOutboundTransport,
    type DidCommConnectionStateChangedEvent,
} from '@credo-ts/didcomm';
import { VaultRepository } from '@ajna-inc/vaults';
// BasicMessageStateChangedEvent type used implicitly in KEM handler event typing
import { agentDependencies, DidCommHttpInboundTransport, DidCommWsInboundTransport } from '@credo-ts/node';
import { askar, askarNodeJS, registerAskar } from '@openwallet-foundation/askar-nodejs';
import { TenantsModule } from '@credo-ts/tenants';
import type { InitConfig } from '@credo-ts/core';
import type { AskarMultiWalletDatabaseScheme } from '@credo-ts/askar';
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { CheqdAnonCredsRegistry, CheqdDidRegistrar, CheqdDidResolver } from '@credo-ts/cheqd';
import { KanonDIDResolver } from '../plugins/kanon/dids/KanonDidResolver';
import { KanonDIDRegistrar } from '../plugins/kanon/dids/KanonDidRegistrar';
import { KanonModuleConfig } from '../plugins/kanon/KanonModuleConfig';
import { EthereumLedgerService } from '../plugins/kanon/ledger';
import { EthereumModule } from '../plugins/kanon/KanonModule';
import { KanonAnonCredsRegistry } from '../plugins/kanon/anoncreds/services/KanonAnonCredsRegistry';
import dotenv from 'dotenv';
import type { AskarPostgresStorageConfig } from '@credo-ts/askar'

import {
    AnonCredsDidCommCredentialFormatService,
    AnonCredsDidCommProofFormatService,
    AnonCredsModule,
} from '@credo-ts/anoncreds'
import { WorkflowModule, WorkflowCommandRepository, WorkflowInstanceRepository, WorkflowTemplateRepository, WorkflowService, CommandQueueService, PersistentCommandQueue, WorkflowModuleConfig } from '@ajna-inc/workflow'
// import { registerWorkflowActionOverrides } from './workflowActions'
import { WebRTCModule } from '@ajna-inc/webrtc'
import { SigningModule } from '@ajna-inc/signing'
import { VaultsModule } from '@ajna-inc/vaults'
// import { GroupMessagingModule } from '@ajna-inc/group-messaging' // Disabled: group-messaging package not available for Credo 0.6.x
import { PoeModule } from '@ajna-inc/poe'
import { OpenBadgesModule } from '@ajna-inc/openbadges'
import { OpenId4VcIssuerModule, OpenId4VcVerifierModule } from '@credo-ts/openid4vc'
import { getMockPoePrograms } from '../poe/MockPoeProgram'
import { CacheStore } from './redis/cacheStore'
import { initializeVaultStorage } from './storageService'
import { isRedisAvailable, getRedisClient } from './redis/redisClient'
import { StorageServiceMessageQueue } from '../plugins/storage/StorageMessageQueue'
import { MessageRepository } from '../plugins/storage/MessageRepository'
import type { Express } from 'express'

dotenv.config();

type AgentWithDidComm = Agent & { didcomm: any };

const wrapLegacyModule = <T extends { register: (...args: any[]) => unknown }>(module: T): Module => {
  const legacyRegister = module.register.bind(module);
  (module as any).register = (dependencyManager: DependencyManager) => {
    let featureRegistry: DidCommFeatureRegistry | undefined;
    try {
      featureRegistry = dependencyManager.resolve(DidCommFeatureRegistry);
    } catch {
      featureRegistry = undefined;
    }
    return legacyRegister(dependencyManager, featureRegistry);
  };
  return module as unknown as Module;
};

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
let postgresConfig: AskarPostgresStorageConfig;

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

let mainAgent: AgentWithDidComm | null = null;

interface Tenant {
    id: string;
    tenantId: string;
    config: any;
}

// Pod-local cache for tenant agent instances
// Note: This is intentionally pod-local. Agent instances cannot be shared across pods,
// but their state is stored in PostgreSQL (Askar), so each pod getting its own instance is safe.
const tenantAgentCache: Record<string, AgentWithDidComm> = {};

// In-flight initialization promises — prevents multiple concurrent getTenantAgent calls
// for the same tenant (race condition on first activation).
const tenantInitPending: Record<string, Promise<AgentWithDidComm> | undefined> = {};

// Pod-local tracking for started queues (within this pod)
// The Redis-backed coordination happens in ensureTenantWorkflowQueue
const startedTenantQueues: Record<string, boolean> = {};

let openId4VcApp: Express | null = null;

// Redis-backed coordination for workflow queue startup across pods
const workflowQueueCoordination = new CacheStore<{ podId: string; startedAt: string }>({
    prefix: 'agent:workflow-queue:',
    defaultTtlSeconds: 300, // 5 minutes - pods should refresh periodically
});

async function ensureTenantWorkflowQueue(tenantAgent: AgentWithDidComm, tenantId: string) {
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

async function initializeAgent(
    walletId: string,
    walletKey: string,
    multiWalletDatabaseScheme?: AskarMultiWalletDatabaseScheme
): Promise<AgentWithDidComm> {
    // Ensure Askar native bindings are registered before loading @credo-ts/askar
    registerAskar({ askar: askarNodeJS });
    const { AskarModule, AskarMultiWalletDatabaseScheme } = await import('@credo-ts/askar');

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
    if (!openId4VcApp) {
        throw new Error('OpenID4VC app not configured. Call initializeAgentSystem(app) before initializing agents.');
    }

    const config: InitConfig = {
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
                    askar: askar,
                    store: {
                        id: walletId,
                        key: walletKey,
                        database: postgresConfig,
                    },
                    multiWalletDatabaseScheme: AskarMultiWalletDatabaseScheme.DatabasePerWallet,
                }),
                dids: new DidsModule({
                    resolvers: [
                        new WebDidResolver(),
                        new KeyDidResolver(),
                        new PeerDidResolver(),
                        new JwkDidResolver(),
                        new CheqdDidResolver(),
                        new KanonDIDResolver(ledgerService),
                    ],
                    registrars: [
                        new KeyDidRegistrar(),
                        new PeerDidRegistrar(),
                        new JwkDidRegistrar(),
                        new CheqdDidRegistrar(),
                        new KanonDIDRegistrar(ledgerService),
                    ],
                }),
                didcomm: new DidCommModule({
                    endpoints,
                    queueTransportRepository: new StorageServiceMessageQueue(),
                    connections: {
                        autoAcceptConnections: true,
                    },
                    proofs: {
                        autoAcceptProofs: DidCommAutoAcceptProof.Always,
                        proofProtocols: [
                            new DidCommProofV2Protocol({
                                proofFormats: [new AnonCredsDidCommProofFormatService()],
                            }),
                        ],
                    },
                    credentials: {
                        autoAcceptCredentials: DidCommAutoAcceptCredential.Always,
                        credentialProtocols: [
                            new DidCommCredentialV2Protocol({
                                credentialFormats: [new AnonCredsDidCommCredentialFormatService()],
                            }),
                        ],
                    },
                    basicMessages: true,
                    messagePickup: true,
                }),
                kanon: new EthereumModule(ethConfig),

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

                signing: wrapLegacyModule(new SigningModule()),

                vaults: wrapLegacyModule(new VaultsModule({
                    operatorMode: true,  // Can store vaults for other agents
                    inlineThreshold: 5 * 1024 * 1024,  // 5MB - files larger use S3
                })),

                // groupMessaging: wrapLegacyModule(new GroupMessagingModule()),
                webrtc: wrapLegacyModule(new WebRTCModule()),
                poe: wrapLegacyModule(new PoeModule({
                    autoExecuteProofs: true,
                    persistNonces: true,
                    poePrograms: getMockPoePrograms(),
                })),
                openbadges: wrapLegacyModule(new OpenBadgesModule({
                    cryptosuite: 'eddsa-rdfc-2022',
                })),
                // OpenID4VC Issuer Module for issuing credentials via OID4VCI
                openId4VcIssuer: new OpenId4VcIssuerModule({
                    baseUrl: apiBaseUrl,
                    app: openId4VcApp!,
                    credentialRequestToCredentialMapper: async ({
                        agentContext,
                        credentialRequest,
                        holderBinding,
                        credentialConfigurationId,
                    }) => {
                        // This will be implemented in the routes - placeholder for now
                        // The actual credential mapping logic is handled per-tenant in the routes
                        throw new Error('Credential mapper should be overridden per issuance request');
                    },
                }),
                // OpenID4VC Verifier Module for verifying credentials via OID4VP
                openId4VcVerifier: new OpenId4VcVerifierModule({
                    baseUrl: apiBaseUrl,
                    app: openId4VcApp!,
                }),
            },
        });

        const didcomm = (agent as AgentWithDidComm).didcomm;

        // Enable DIDComm transports: HTTP outbound + WS outbound, HTTP inbound
        didcomm.registerOutboundTransport(new DidCommHttpOutboundTransport());
        didcomm.registerOutboundTransport(new DidCommWsOutboundTransport());

        didcomm.registerInboundTransport(new DidCommHttpInboundTransport({
            port: agentPort,
            // Allow more time for inbound message processing before timing out
            processedMessageListenerTimeoutMs: 60000,
        }));
        // Also listen for DIDComm over WebSocket on AGENT_WS_PORT, but avoid API port conflicts
        try {
            if (agentWsPort === apiPort) {
                console.warn('[WARN] Skipping WS inbound transport: AGENT_WS_PORT equals API PORT');
            } else {
                didcomm.registerInboundTransport(new DidCommWsInboundTransport({ port: agentWsPort }));
            }
        } catch (e) {
            console.warn('Failed to register WS inbound transport', { error: (e as Error).message });
        }
        agent.dependencyManager.registerSingleton(MessageRepository);
        await agent.initialize();
        try {
            didcomm.features.register(new DidCommProtocol({ id: KEM_PROTOCOL_URI }));
        } catch (error: any) {
            console.warn('[KEM] Failed to register protocol feature:', error?.message || error);
        }
        // try {
        //     registerWorkflowActionOverrides(agent);
        // } catch (e) {
        //     console.warn('[Workflow] Failed to register action overrides', { error: (e as Error).message });
        // }
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


const setupConnectionListener = async (agent: AgentWithDidComm) => {
    agent.events.on<DidCommConnectionStateChangedEvent>(
        DidCommConnectionEventTypes.DidCommConnectionStateChanged,
        async ({ payload }) => {
            if (payload.connectionRecord.state === DidCommDidExchangeState.Completed) {
            const connectionId = payload.connectionRecord.id
            const oobId = payload.connectionRecord.outOfBandId

            autoKemExchangeIfSupported(agent, connectionId).catch((error) => {
                console.warn('[KEM] Auto-exchange failed on connection completion:', (error as Error).message);
            });

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

            const oob = await _workerAgent.didcomm.oob.getAll()
            const oobRecord = oob.find((record: { id?: string }) => record.id === oobId)
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
                await _workerAgent.didcomm.credentials.offerCredential({
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
                await _workerAgent.didcomm.credentials.offerCredential({
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

// Tag for pending KEM key exchange requests (kept in genericRecords)
const KEM_PENDING_REQUEST_TAG = 'kem-pending-request';
const KEM_PROTOCOL_URI = 'https://essi.studio/kem-key-exchange/1.0';
const KEM_FEATURE_MATCH = 'https://essi.studio/kem-key-exchange/*';
const KEM_DISCOVERY_TIMEOUT_MS = 5000;

const discoverKemSupport = async (agent: AgentWithDidComm, connectionId: string): Promise<boolean> => {
    try {
        const result = await agent.didcomm.discovery.queryFeatures({
            connectionId,
            protocolVersion: 'v2',
            queries: [{ featureType: 'protocol', match: KEM_FEATURE_MATCH }],
            awaitDisclosures: true,
            awaitDisclosuresTimeoutMs: KEM_DISCOVERY_TIMEOUT_MS,
        });
        const features = result?.features || [];
        return features.some((f: any) => f.type === 'protocol' && f.id?.startsWith(KEM_PROTOCOL_URI));
    } catch (error) {
        console.warn('[KEM] Feature discovery failed:', (error as Error).message);
        return false;
    }
};

const autoAcceptKemExchange = async (agent: AgentWithDidComm, connectionId: string) => {
    // Check if there's a pending request
    const pendingRequests = await agent.genericRecords.findAllByQuery({
        type: KEM_PENDING_REQUEST_TAG,
        connectionId: connectionId,
        status: 'pending',
    });

    if (pendingRequests.length === 0) return;

    // Ensure we have a local keypair
    const existingKeypair = await agent.modules.vaults.getLocalKeypair(connectionId);

    let keypair: { kid: string; publicKey: Uint8Array; secretKey: Uint8Array };

    if (existingKeypair) {
        keypair = existingKeypair;
    } else {
        keypair = agent.modules.vaults.generateKemKeypair();
        await agent.modules.vaults.storeLocalKeypair(connectionId, keypair);
    }

    const kemKeyMessage = JSON.stringify({
        type: 'kem-key-exchange',
        kid: keypair.kid,
        publicKey: Buffer.from(keypair.publicKey).toString('base64url'),
        algorithm: 'ML-KEM-768',
        timestamp: new Date().toISOString(),
    });

    await agent.didcomm.basicMessages.sendMessage(connectionId, kemKeyMessage);

    const pendingRecord = pendingRequests[0];
    pendingRecord.content = {
        ...pendingRecord.content,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
    };
    pendingRecord.setTag('status', 'accepted');
    await agent.genericRecords.update(pendingRecord);
};

const autoKemExchangeIfSupported = async (agent: AgentWithDidComm, connectionId: string) => {
    const supported = await discoverKemSupport(agent, connectionId);
    if (!supported) return;

    // If we have an incoming pending request, accept it
    const pendingRequests = await agent.genericRecords.findAllByQuery({
        type: KEM_PENDING_REQUEST_TAG,
        connectionId: connectionId,
        status: 'pending',
    });
    if (pendingRequests.length > 0) {
        await autoAcceptKemExchange(agent, connectionId);
        return;
    }

    // If we already have a local keypair, don't re-send
    const existingKeypair = await agent.modules.vaults.getLocalKeypair(connectionId);
    if (existingKeypair) return;

    // Initiate exchange
    const keypair = agent.modules.vaults.generateKemKeypair();
    await agent.modules.vaults.storeLocalKeypair(connectionId, keypair);

    const kemKeyMessage = JSON.stringify({
        type: 'kem-key-exchange',
        kid: keypair.kid,
        publicKey: Buffer.from(keypair.publicKey).toString('base64url'),
        algorithm: 'ML-KEM-768',
        timestamp: new Date().toISOString(),
    });

    await agent.didcomm.basicMessages.sendMessage(connectionId, kemKeyMessage);
};

/**
 * Process any existing unprocessed KEM key exchange messages
 * This is called when a tenant agent is activated to catch up on messages
 * received while the agent was offline
 */
const processExistingKemMessages = async (agent: AgentWithDidComm) => {
    try {
        // Get all basic messages
        const basicMessages = await agent.didcomm.basicMessages.findAllByQuery({});

        for (const message of basicMessages) {
            // Only process received messages
            if (message.role !== 'receiver') continue;

            // Try to parse as KEM key exchange message
            let kemData: { type: string; kid: string; publicKey: string; algorithm?: string } | null = null;
            try {
                kemData = JSON.parse(message.content);
            } catch {
                continue; // Not JSON, skip
            }

            if (kemData?.type !== 'kem-key-exchange' || !kemData.kid || !kemData.publicKey) {
                continue; // Not a KEM message
            }

            const connectionId = message.connectionId;

            // Check if we already have this peer's key stored
            const hasPeerKey = await agent.modules.vaults.hasPeerKemKey(connectionId);
            if (hasPeerKey) {
                continue; // Already processed
            }

            console.log(`[KEM] Processing existing message for connection ${connectionId}: kid=${kemData.kid}`);

            // Store peer's public key
            const publicKeyBytes = new Uint8Array(Buffer.from(kemData.publicKey, 'base64url'));
            await agent.modules.vaults.storePeerKemKey(connectionId, {
                kid: kemData.kid,
                publicKey: publicKeyBytes,
            });
            console.log(`[KEM] Stored peer key for connection ${connectionId}`);

            // Check if we already have a local keypair
            const hasLocalKey = await agent.modules.vaults.hasLocalKeypair(connectionId);

            if (!hasLocalKey) {
                // Check if we already have a pending request
                const existingPending = await agent.genericRecords.findAllByQuery({
                    type: KEM_PENDING_REQUEST_TAG,
                    connectionId: connectionId,
                });

                if (existingPending.length === 0) {
                    // Store as a pending request
                    await agent.genericRecords.save({
                        content: {
                            connectionId: connectionId,
                            peerKid: kemData.kid,
                            peerAlgorithm: kemData.algorithm || 'ML-KEM-768',
                            receivedAt: message.createdAt || new Date().toISOString(),
                            status: 'pending',
                        },
                        tags: {
                            type: KEM_PENDING_REQUEST_TAG,
                            connectionId: connectionId,
                            status: 'pending',
                        },
                    });
                    console.log(`[KEM] Created pending request for connection ${connectionId} from existing message`);
                    try {
                        await autoAcceptKemExchange(agent, connectionId);
                        console.log(`[KEM] Auto-accepted key exchange for connection ${connectionId} (existing message)`);
                    } catch (error: any) {
                        console.warn(`[KEM] Auto-accept failed for connection ${connectionId}: ${error?.message || error}`);
                    }
                }
            }
        }
    } catch (error) {
        console.error('[KEM] Error processing existing messages:', error);
    }
};

const applyOwnerAckToSigningVault = async (
    agent: AgentWithDidComm,
    opts: { signedVaultId?: string; originalVaultId?: string; action?: string; at?: string; fromConnectionId?: string }
) => {
    try {
        const vaultRepo = agent.context?.dependencyManager?.resolve?.(VaultRepository);
        if (!vaultRepo) return;

        const vaults = await agent.modules.vaults.list();
        const targets = vaults.filter((v: any) => {
            if (opts.signedVaultId && v.vaultId === opts.signedVaultId) return true;
            if (opts.originalVaultId && v.header?.metadata?.originalVaultId === opts.originalVaultId) return true;
            return false;
        });

        if (targets.length === 0) return;

        for (const v of targets) {
            const record = await vaultRepo.findByVaultId(agent.context, v.vaultId);
            if (!record) continue;
            record.header.metadata = {
                ...(record.header.metadata || {}),
                ownerAckAt: opts.at || new Date().toISOString(),
                ownerAckAction: opts.action || 'verified',
                ownerAckFrom: opts.fromConnectionId,
            };
            record.updatedAt = new Date();
            await vaultRepo.update(agent.context, record);
        }
    } catch (error: any) {
        console.warn('[PDF-Signing] Failed to apply owner ack:', error?.message || error);
    }
};

/**
 * Set up KEM key exchange message handler for a tenant agent
 * Listens for incoming basic messages that contain KEM key exchange data
 * Stores the peer's key and creates a pending request for the user to accept
 */
const setupKemKeyExchangeHandler = (agent: AgentWithDidComm) => {
    // Use eventEmitter (Credo 0.5.x) or events (Credo 0.6+)
    const emitter = (agent as any).eventEmitter || (agent as any).events;
    if (!emitter) {
        console.warn('[KEM] agent.eventEmitter/events not available, skipping KEM handler setup');
        return;
    }
    console.log('[KEM] Setting up KEM key exchange handler');
    emitter.on(DidCommBasicMessageEventTypes.DidCommBasicMessageStateChanged, async (event: any) => {
        // Get the tenant context from the event metadata
        const { payload } = event;
        const contextCorrelationId = event.metadata?.contextCorrelationId;

        try {
            const { basicMessageRecord } = payload;
            const { content, connectionId, role } = basicMessageRecord;

            // Only process received messages
            if (role !== 'receiver') return;

            // Try to parse as JSON message
            let parsed: any = null;
            try {
                parsed = JSON.parse(content);
            } catch {
                // Not JSON, ignore
                return;
            }

            // Handle owner ack for signing completion
            if (parsed?.type === 'pdf-signing-owner-ack') {
                const { originalVaultId, signedVaultId, action, at } = parsed || {};
                if (!originalVaultId && !signedVaultId) return;

                console.log(`[PDF-Signing] Received owner ack via basic message for vault ${signedVaultId || originalVaultId}`);

                let targetAgent: any = agent;
                if (contextCorrelationId && contextCorrelationId !== 'default') {
                    try {
                        targetAgent = await getAgent({ tenantId: contextCorrelationId });
                        console.log(`[PDF-Signing] Using tenant agent context: ${contextCorrelationId}`);
                    } catch (e: any) {
                        console.warn(`[PDF-Signing] Could not get tenant agent for ${contextCorrelationId}: ${e.message}`);
                    }
                }

                await applyOwnerAckToSigningVault(targetAgent, {
                    originalVaultId,
                    signedVaultId,
                    action,
                    at,
                    fromConnectionId: connectionId,
                });

                return;
            }

            // KEM key exchange
            const kemData = parsed as { type: string; kid: string; publicKey: string; algorithm?: string };
            if (kemData?.type !== 'kem-key-exchange' || !kemData.kid || !kemData.publicKey) {
                return; // Not a KEM key exchange message
            }

            console.log(`[KEM] Received key exchange from connection ${connectionId}: kid=${kemData.kid}, context=${contextCorrelationId}`);

            // Resolve the correct agent context via getAgent() (uses cached sessions)
            let targetAgent: any = agent;
            if (contextCorrelationId && contextCorrelationId !== 'default') {
                try {
                    targetAgent = await getAgent({ tenantId: contextCorrelationId });
                    console.log(`[KEM] Using tenant agent context: ${contextCorrelationId}`);
                } catch (e: any) {
                    console.warn(`[KEM] Could not get tenant agent for ${contextCorrelationId}: ${e.message}`);
                }
            }

            // Store peer's public key in connection metadata using the correct agent context
            const publicKeyBytes = new Uint8Array(Buffer.from(kemData.publicKey, 'base64url'));
            await targetAgent.modules.vaults.storePeerKemKey(connectionId, {
                kid: kemData.kid,
                publicKey: publicKeyBytes,
            });
            console.log(`[KEM] Stored peer key for connection ${connectionId}`);

            // Check if we already have a local keypair (meaning we initiated the exchange)
            const hasLocalKey = await targetAgent.modules.vaults.hasLocalKeypair(connectionId);

            if (!hasLocalKey) {
                // We didn't initiate - this is an incoming request
                // Check if we already have a pending request for this connection
                const existingPending = await targetAgent.genericRecords.findAllByQuery({
                    type: KEM_PENDING_REQUEST_TAG,
                    connectionId: connectionId,
                });

                if (existingPending.length === 0) {
                    // Store as a pending request for the user to accept
                    await targetAgent.genericRecords.save({
                        content: {
                            connectionId: connectionId,
                            peerKid: kemData.kid,
                            peerAlgorithm: kemData.algorithm || 'ML-KEM-768',
                            receivedAt: new Date().toISOString(),
                            status: 'pending',
                        },
                        tags: {
                            type: KEM_PENDING_REQUEST_TAG,
                            connectionId: connectionId,
                            status: 'pending',
                        },
                    });
                    console.log(`[KEM] Created pending key exchange request for connection ${connectionId}`);
                    try {
                        await autoAcceptKemExchange(targetAgent, connectionId);
                        console.log(`[KEM] Auto-accepted key exchange for connection ${connectionId}`);
                    } catch (error: any) {
                        console.warn(`[KEM] Auto-accept failed for connection ${connectionId}: ${error?.message || error}`);
                    }
                } else {
                    console.log(`[KEM] Pending request already exists for connection ${connectionId}`);
                    try {
                        await autoAcceptKemExchange(targetAgent, connectionId);
                        console.log(`[KEM] Auto-accepted existing pending request for connection ${connectionId}`);
                    } catch (error: any) {
                        console.warn(`[KEM] Auto-accept failed for connection ${connectionId}: ${error?.message || error}`);
                    }
                }
            } else {
                // We already have a keypair - this is a response to our request
                console.log(`[KEM] Received response to our key exchange for connection ${connectionId}`);
            }
        } catch (error) {
            console.error('[KEM] Error processing key exchange message:', error);
        }
    });
};

// Patterns that indicate a stale/dead Askar session — safe to evict + retry
const STALE_SESSION_PATTERNS = [
    'Failed to acquire an agent context session',
    'wallet is closed',
    'wallet has been closed',
    'database is closed',
    'connection was closed',
    'connection refused',
    'AskarError',
    'WalletError',
    'is not open',
];

function isStaleSessionError(error: any): boolean {
    const msg: string = (error?.message ?? '').toLowerCase();
    return STALE_SESSION_PATTERNS.some(p => msg.includes(p.toLowerCase()));
}

// Helper function to implement retries with exponential backoff
async function withRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = RETRY_DELAY): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        if (retries <= 0 || !isStaleSessionError(error)) {
            throw error;
        }

        console.log(`Operation failed, retrying in ${delay}ms (${retries} retries left): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1, delay * 1.5); // Exponential backoff
    }
}

/**
 * Clears the cached tenant agent so the next call to getAgent() opens a fresh session.
 */
export function clearTenantAgentCache(tenantId: string): void {
    delete tenantAgentCache[tenantId];
    console.log(`[AgentService] Cleared cached tenant agent for tenant: ${tenantId}`);
}

/**
 * Activate a tenant agent: open a session, wire up handlers, start the workflow queue.
 * Returns the tenant agent and caches it. Runs processExistingKemMessages in the background.
 */
async function activateTenantAgent(tenantId: string, baseAgent: AgentWithDidComm): Promise<AgentWithDidComm> {
    const tenantAgent = await withRetry(() => baseAgent.modules.tenants.getTenantAgent({
        tenantId
    })) as AgentWithDidComm;

    tenantAgentCache[tenantId] = tenantAgent;
    console.log(`Cached tenant agent for tenant: ${tenantId}`);

    // Set up KEM key exchange message handler
    setupKemKeyExchangeHandler(tenantAgent);

    // Process existing KEM messages in the background — don't block the first API response
    processExistingKemMessages(tenantAgent).catch(err => {
        console.error('[KEM] Failed to process existing messages:', err);
    });

    // Track activity in Redis (non-blocking)
    tenantActivityCache.set(tenantId, { lastAccess: new Date().toISOString(), podId: POD_ID }).catch(() => {});

    // Start workflow queue (awaited — needs to be ready before first workflow request)
    await ensureTenantWorkflowQueue(tenantAgent, tenantId);

    return tenantAgent;
}

/**
 * Get or create an agent for a wallet ID. Automatically evicts the cache and reopens
 * a fresh session when the cached agent's Askar session has gone stale (e.g. after idle).
 */
export async function getAgent({
    tenantId,
}: {
    tenantId?: string;
}): Promise<AgentWithDidComm> {
    if (!tenantId) {
        throw new Error('Tenant ID is required');
    }

    // Fast path: cached agent
    if (tenantAgentCache[tenantId]) {
        // Update activity in Redis (async, don't await to avoid blocking)
        tenantActivityCache.set(tenantId, { lastAccess: new Date().toISOString(), podId: POD_ID }).catch(() => {});
        return tenantAgentCache[tenantId];
    }

    // Serialize initialization: if already initializing this tenant, wait for that promise
    // instead of opening a second concurrent session (prevents leaked sessions + double-init).
    if (tenantInitPending[tenantId]) {
        return tenantInitPending[tenantId];
    }

    const initPromise = (async (): Promise<AgentWithDidComm> => {
        // Re-check cache inside the async block (another init may have completed while we awaited)
        const cached = tenantAgentCache[tenantId];
        if (cached) return cached;

        if (mainAgent) {
            console.log(`Using existing main agent for tenant: ${tenantId}`);
            try {
                return await activateTenantAgent(tenantId, mainAgent);
            } catch (error) {
                console.error(`Error getting tenant agent: ${error}`);
                throw error;
            }
        }

        try {
            console.log(`Main agent not initialized. Creating new main agent.`);
            const agent = await initializeAgent(MAIN_WALLET_ID, MAIN_WALLET_KEY);
            return await activateTenantAgent(tenantId, agent);
        } catch (error: any) {
            if (error.message?.includes('already exists')) {
                console.log(`Wallet already exists, trying to open it`);
                const agent = await initializeAgent(MAIN_WALLET_ID, MAIN_WALLET_KEY);
                return await activateTenantAgent(tenantId, agent);
            }
            console.error(`Failed to get agent for tenant ${tenantId}:`, error);
            throw error;
        }
    })();

    tenantInitPending[tenantId] = initPromise;
    try {
        return await initPromise;
    } finally {
        delete tenantInitPending[tenantId];
    }
}

/**
 * Run an operation with a tenant agent, automatically recovering from stale sessions.
 * On a stale/closed session error the cache is evicted and the operation retried once
 * with a fresh session — fixing the "slows down after idle / stops on error" symptom.
 */
export async function withAgent<T>(
    tenantId: string,
    operation: (agent: AgentWithDidComm) => Promise<T>
): Promise<T> {
    const agent = await getAgent({ tenantId });
    try {
        return await operation(agent);
    } catch (error: any) {
        if (!isStaleSessionError(error)) throw error;

        console.warn(`[AgentService] Stale session detected for tenant ${tenantId}, reopening: ${error.message}`);
        clearTenantAgentCache(tenantId);
        const freshAgent = await getAgent({ tenantId });
        return operation(freshAgent);
    }
}

/**
 * Get the main agent
 */
export async function getMainAgent(): Promise<AgentWithDidComm> {
    if (!mainAgent) {
        throw new Error('Main agent not initialized');
    }
    return mainAgent;
}

/**
 * Get the label for a tenant by ID
 */
export async function getTenantLabel(tenantId: string): Promise<string | null> {
    try {
        if (!mainAgent || !mainAgent.isInitialized) {
            await initializeAgent(MAIN_WALLET_ID, MAIN_WALLET_KEY);
        }
        if (!mainAgent) return null;
        const tenantRecord = await mainAgent.modules.tenants.getTenantById(tenantId);
        return tenantRecord?.config?.label ?? null;
    } catch {
        return null;
    }
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
export async function initializeAgentSystem(app: Express): Promise<void> {

    openId4VcApp = app;

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
