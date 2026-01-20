/**
 * ESSI Agent Setup
 *
 * Handles initialization of the ESSI default institutional agent on server startup.
 * - Registers all credential providers
 * - Creates or loads the ESSI institutional agent from DB
 * - Creates schemas and credential definitions for supported credential types
 */

import { randomBytes, randomUUID } from 'crypto';
import { Agent } from '@credo-ts/core';
import { db } from '../../db/driver';
import { ProviderRegistry } from './ProviderRegistry';
import { DigilockerProvider } from './providers/DigilockerProvider';
import { CredentialProvider, SchemaDefinition } from './CredentialProvider';
import { getAgent, createTenant, getMainAgent } from '../agentService';
import { InstitutionalAgentSchema, CredentialProviderSchema } from '../../db/schema';
import { CacheStore } from '../redis/cacheStore';

// Redis-backed cache for ESSI agent tenant ID (shared across pods)
const essiTenantCache = new CacheStore<{ tenantId: string }>({
    prefix: 'essi:agent:',
    defaultTtlSeconds: 3600, // 1 hour
});

/**
 * Get provider-specific configuration from environment or defaults
 */
function getProviderConfig(providerId: string): Record<string, unknown> {
    switch (providerId) {
        case 'digilocker':
            return {
                clientId: process.env.DIGILOCKER_CLIENT_ID,
                clientSecret: process.env.DIGILOCKER_CLIENT_SECRET,
                redirectUri: process.env.DIGILOCKER_REDIRECT_URI ||
                    `${process.env.API_URL || 'http://localhost:3002'}/api/institutional/callback/digilocker`,
                endpoints: {
                    base: process.env.DIGILOCKER_BASE_URL || 'https://digilocker.meripehchaan.gov.in/public'
                }
            };
        default:
            return {};
    }
}

/**
 * Register all credential providers with the registry
 */
async function registerProviders(): Promise<void> {
    const registry = ProviderRegistry.getInstance();

    // Register Digilocker provider
    const digilockerProvider = new DigilockerProvider();
    await digilockerProvider.initialize(getProviderConfig('digilocker'));
    registry.registerProvider(digilockerProvider);

    // Add more providers here as they're implemented
    // registry.registerProvider(new AadhaarOfflineProvider());

    console.log('[ESSISetup] Registered providers:', registry.getProviderIds().join(', '));
}

/**
 * Get or create the ESSI institutional agent record from database
 */
async function getOrCreateESSIAgentRecord(): Promise<InstitutionalAgentSchema> {
    const client = await db.connect();
    try {
        // Check if ESSI default agent exists
        const result = await client.query(
            'SELECT * FROM institutional_agents WHERE is_default = true AND is_active = true'
        );

        if (result.rows.length > 0) {
            console.log('[ESSISetup] Found existing ESSI default agent');
            return result.rows[0];
        }

        // Create new ESSI default agent
        const walletId = `essi-default-${Date.now()}`;
        const walletKey = randomBytes(32).toString('hex');

        const insertResult = await client.query(
            `INSERT INTO institutional_agents (name, wallet_id, wallet_key, is_default, is_active)
            VALUES ($1, $2, $3, true, true)
            RETURNING *`,
            ['ESSI Default Agent', walletId, walletKey]
        );

        console.log('[ESSISetup] Created new ESSI default institutional agent');
        return insertResult.rows[0];
    } finally {
        client.release();
    }
}

/**
 * Create a Credo tenant for the ESSI agent if it doesn't exist
 */
async function ensureESSITenant(agentRecord: InstitutionalAgentSchema): Promise<string> {
    // Check if we have a tenant ID stored
    const client = await db.connect();
    try {
        // If wallet_id looks like a valid tenant ID, try to use it
        if (agentRecord.wallet_id && !agentRecord.wallet_id.startsWith('essi-default-')) {
            try {
                const agent = await getAgent({ tenantId: agentRecord.wallet_id });
                console.log('[ESSISetup] Found existing ESSI tenant agent');
                return agentRecord.wallet_id;
            } catch (error: any) {
                console.log('[ESSISetup] Stored tenant ID not valid, creating new tenant...');
            }
        }

        // Create a new tenant
        console.log('[ESSISetup] Creating new ESSI tenant...');
        const tenant = await createTenant({ label: 'ESSI Default Agent' }) as any;

        // Credo TenantsModule returns { id, tenantId, config } - tenantId is the actual ID to use
        const tenantId = tenant.tenantId || tenant.id;
        console.log('[ESSISetup] Created ESSI tenant:', tenantId, 'Full tenant object:', JSON.stringify(tenant));

        if (!tenantId) {
            throw new Error('Failed to get tenant ID from created tenant');
        }

        // Update the agent record with the actual tenant ID
        await client.query(
            'UPDATE institutional_agents SET wallet_id = $1, updated_at = NOW() WHERE id = $2',
            [tenantId, agentRecord.id]
        );

        return tenantId;
    } finally {
        client.release();
    }
}

/**
 * Ensure provider is registered in database
 */
async function ensureProviderInDB(provider: CredentialProvider): Promise<void> {
    const client = await db.connect();
    try {
        await client.query(
            `INSERT INTO credential_providers (provider_id, name, type, config, is_active)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (provider_id) DO UPDATE SET
                name = EXCLUDED.name,
                type = EXCLUDED.type,
                config = EXCLUDED.config`,
            [
                provider.providerId,
                provider.name,
                provider.type,
                JSON.stringify(getProviderConfig(provider.providerId))
            ]
        );
    } finally {
        client.release();
    }
}

/**
 * Create schema and credential definition for a credential type
 */
async function createSchemaAndCredDef(
    agent: Agent<any>,
    provider: CredentialProvider,
    credentialType: string,
    agentId: string
): Promise<{ schemaId: string; credentialDefinitionId: string } | null> {
    const client = await db.connect();
    try {
        // Check if already exists
        const existing = await client.query(
            `SELECT * FROM institutional_credential_types
            WHERE provider_id = $1 AND credential_type = $2`,
            [provider.providerId, credentialType]
        );

        if (existing.rows.length > 0 && existing.rows[0].credential_definition_id) {
            console.log(`[ESSISetup] Credential type ${credentialType} already configured`);
            return {
                schemaId: existing.rows[0].schema_id,
                credentialDefinitionId: existing.rows[0].credential_definition_id
            };
        }

        // Get schema definition from provider
        const schemaDef = provider.getSchemaDefinition(credentialType);

        // Get the agent's DID
        const dids = await agent.dids.getCreatedDids();
        let issuerDid = dids.find(d => d.did.startsWith('did:kanon'))?.did;

        if (!issuerDid) {
            // Create a new DID for the ESSI agent
            console.log('[ESSISetup] Creating new DID for ESSI agent...');
            const didResult = await agent.dids.create({
                method: 'kanon',
                options: {
                    network: 'testnet',
                    methodSpecificIdAlgo: 'uuid'
                }
            });
            issuerDid = didResult.didState.did;
            console.log('[ESSISetup] Created DID:', issuerDid);
        }

        if (!issuerDid) {
            console.error('[ESSISetup] Failed to get or create issuer DID');
            return null;
        }

        // Register schema
        console.log(`[ESSISetup] Registering schema ${schemaDef.name} v${schemaDef.version}...`);
        const schemaResult = await agent.modules.anoncreds.registerSchema({
            network: 'testnet',
            options: {
                methodSpecificIdAlgo: 'uuid',
                method: 'kanon',
                network: 'testnet'
            },
            schema: {
                attrNames: schemaDef.attributes,
                issuerId: issuerDid,
                name: schemaDef.name,
                version: schemaDef.version
            }
        });

        if (schemaResult.schemaState.state !== 'finished') {
            console.error('[ESSISetup] Failed to register schema:', schemaResult);
            return null;
        }

        const schemaId = schemaResult.schemaState.schemaId;
        console.log(`[ESSISetup] Schema registered: ${schemaId}`);

        // Register credential definition
        console.log(`[ESSISetup] Registering credential definition for ${schemaDef.name}...`);
        const credDefResult = await agent.modules.anoncreds.registerCredentialDefinition({
            options: {
                network: 'testnet',
                methodSpecificIdAlgo: 'uuid'
            },
            credentialDefinition: {
                issuerId: issuerDid,
                schemaId,
                tag: `${provider.providerId}-${credentialType}`
            }
        });

        if (credDefResult.credentialDefinitionState.state !== 'finished') {
            console.error('[ESSISetup] Failed to register credential definition:', credDefResult);
            return null;
        }

        const credentialDefinitionId = credDefResult.credentialDefinitionState.credentialDefinitionId;
        console.log(`[ESSISetup] Credential definition registered: ${credentialDefinitionId}`);

        // Store in database
        await client.query(
            `INSERT INTO institutional_credential_types
            (provider_id, agent_id, credential_type, schema_id, credential_definition_id, is_active)
            VALUES ($1, $2, $3, $4, $5, true)
            ON CONFLICT (provider_id, credential_type) DO UPDATE SET
                schema_id = EXCLUDED.schema_id,
                credential_definition_id = EXCLUDED.credential_definition_id`,
            [provider.providerId, agentId, credentialType, schemaId, credentialDefinitionId]
        );

        return { schemaId, credentialDefinitionId };
    } finally {
        client.release();
    }
}

/**
 * Update agent DID in database
 */
async function updateAgentDID(agentId: string, did: string): Promise<void> {
    const client = await db.connect();
    try {
        await client.query(
            'UPDATE institutional_agents SET did = $1, updated_at = NOW() WHERE id = $2',
            [did, agentId]
        );
    } finally {
        client.release();
    }
}

/**
 * Main setup function - call this on server startup
 */
export async function setupESSIDefaultAgent(): Promise<void> {
    console.log('[ESSISetup] Starting ESSI default agent setup...');

    try {
        // Step 1: Register providers
        await registerProviders();

        // Step 2: Get or create ESSI agent record
        const agentRecord = await getOrCreateESSIAgentRecord();

        // Step 3: Ensure Credo tenant exists
        const tenantId = await ensureESSITenant(agentRecord);
        // Store tenant ID in Redis for cross-pod access
        await essiTenantCache.set('default', { tenantId });
        console.log('[ESSISetup] ESSI tenant ID:', tenantId);

        // Step 4: Ensure providers are in DB
        const registry = ProviderRegistry.getInstance();
        for (const provider of registry.getAllProviders()) {
            await ensureProviderInDB(provider);
        }

        // Step 5: Try to get the agent (may fail if not fully initialized)
        // This is deferred to first use to avoid startup race conditions
        // Note: We don't cache the agent instance - each request gets a fresh one via getAgent()
        try {
            const agent = await getAgent({ tenantId });
            console.log('[ESSISetup] ESSI agent obtained successfully');

            // Step 6: Setup credential types (skip if Ethereum not configured)
            if (process.env.ETHEREUM_RPC_URL && process.env.ETHEREUM_PRIVATE_KEY) {
                for (const provider of registry.getAllProviders()) {
                    for (const credType of provider.getSupportedCredentialTypes()) {
                        try {
                            const result = await createSchemaAndCredDef(agent, provider, credType, agentRecord.id);
                            if (result) {
                                console.log(`[ESSISetup] Setup complete for ${provider.providerId}:${credType}`);
                            }
                        } catch (error) {
                            console.error(`[ESSISetup] Error setting up ${provider.providerId}:${credType}:`, error);
                        }
                    }
                }

                // Step 7: Update agent DID in DB
                const dids = await agent.dids.getCreatedDids();
                const primaryDid = dids.find((d: any) => d.did.startsWith('did:kanon'))?.did;
                if (primaryDid && !agentRecord.did) {
                    await updateAgentDID(agentRecord.id, primaryDid);
                }
            } else {
                console.log('[ESSISetup] Skipping schema/cred-def creation - Ethereum not configured');
            }
        } catch (agentError) {
            console.warn('[ESSISetup] Could not get ESSI agent immediately, will be initialized on first use:', agentError);
        }

        console.log('[ESSISetup] ESSI default agent setup complete');
    } catch (error) {
        console.error('[ESSISetup] Failed to setup ESSI default agent:', error);
        throw error;
    }
}

/**
 * Get the ESSI agent instance
 * Note: This always retrieves a fresh agent instance via getAgent() for multi-pod compatibility.
 * The agent state is stored in PostgreSQL (Askar), so this is safe across pods.
 */
export async function getESSIAgent(): Promise<Agent<any>> {
    // First try to get tenant ID from Redis cache
    let cachedTenant = await essiTenantCache.get('default');

    if (!cachedTenant) {
        // Fallback: Try to load from database
        const client = await db.connect();
        try {
            const result = await client.query(
                'SELECT wallet_id FROM institutional_agents WHERE is_default = true AND is_active = true'
            );
            if (result.rows.length > 0 && result.rows[0].wallet_id) {
                const tenantId = result.rows[0].wallet_id;
                // Cache in Redis for other pods
                await essiTenantCache.set('default', { tenantId });
                cachedTenant = { tenantId };
            }
        } finally {
            client.release();
        }
    }

    if (!cachedTenant?.tenantId) {
        throw new Error('ESSI agent not initialized. Call setupESSIDefaultAgent first.');
    }

    // Always get a fresh agent instance - the agentService handles its own caching
    return getAgent({ tenantId: cachedTenant.tenantId });
}

/**
 * Check if ESSI agent is initialized
 * Note: This checks Redis cache - if running in multi-pod setup, another pod may have initialized it
 */
export async function isESSIAgentInitialized(): Promise<boolean> {
    const cached = await essiTenantCache.get('default');
    if (cached?.tenantId) {
        return true;
    }
    // Fallback check database
    const client = await db.connect();
    try {
        const result = await client.query(
            'SELECT wallet_id FROM institutional_agents WHERE is_default = true AND is_active = true'
        );
        return result.rows.length > 0 && !!result.rows[0].wallet_id;
    } finally {
        client.release();
    }
}
