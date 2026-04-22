/**
 * Institutional Issuance Service
 *
 * Main service for handling institutional credential issuance.
 * Coordinates between providers, database sessions, and agent credential issuance.
 */

import { Agent } from '@credo-ts/core';
import { randomUUID } from 'crypto';
import { db } from '../../db/driver';
import { ProviderRegistry } from './ProviderRegistry';
import { CredentialProvider, VerificationResult, CredentialAttributes } from './CredentialProvider';
import {
    IssuanceSessionSchema,
    InstitutionalCredentialTypeSchema
} from '../../db/schema';

export interface StartIssuanceResult {
    authUrl: string;
    sessionId: string;
}

export interface IssuanceCallbackResult {
    success: boolean;
    credentialExchangeId?: string;
    sessionId?: string;
    error?: string;
}

export class InstitutionalIssuanceService {
    private agent: Agent<any>;
    private registry: ProviderRegistry;

    constructor(agent: Agent<any>) {
        this.agent = agent;
        this.registry = ProviderRegistry.getInstance();
    }

    /**
     * Start OAuth issuance flow
     * Creates a session and returns the authorization URL
     */
    async startOAuthIssuance(
        providerId: string,
        oobId: string,
        options?: Record<string, unknown>
    ): Promise<StartIssuanceResult> {
        const provider = this.registry.getProvider(providerId);
        if (!provider) {
            throw new Error(`Provider ${providerId} not found`);
        }

        if (provider.type !== 'oauth' || !provider.getAuthorizationUrl) {
            throw new Error(`Provider ${providerId} is not an OAuth provider`);
        }

        const csrfToken = randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create issuance session in database
        const client = await db.connect();
        try {
            const result = await client.query(
                `INSERT INTO issuance_sessions
                (out_of_band_id, csrf_token, provider_id, status, expires_at)
                VALUES ($1, $2, $3, 'pending', $4)
                RETURNING id`,
                [oobId, csrfToken, providerId, expiresAt]
            );

            const sessionId = result.rows[0].id;

            // Get authorization URL from provider
            const authUrl = provider.getAuthorizationUrl(oobId, csrfToken, options);

            console.log(`[InstitutionalIssuance] Created session ${sessionId} for provider ${providerId}`);

            return { authUrl, sessionId };
        } finally {
            client.release();
        }
    }

    /**
     * Handle OAuth callback from provider
     * Verifies session, gets credential data, and issues credential
     */
    async handleOAuthCallback(
        providerId: string,
        code: string,
        state: string,
        codeVerifier?: string
    ): Promise<IssuanceCallbackResult> {
        const provider = this.registry.getProvider(providerId);
        if (!provider || !provider.handleCallback) {
            return { success: false, error: 'Provider not found or invalid type' };
        }

        // Parse state to get csrf and oobId
        const [csrfToken, oobId] = this.parseState(state);

        // Verify session exists and is valid
        const client = await db.connect();
        try {
            // Find and lock session
            const sessionResult = await client.query(
                `SELECT * FROM issuance_sessions
                WHERE out_of_band_id = $1
                AND csrf_token = $2
                AND status = 'pending'
                AND (expires_at IS NULL OR expires_at > NOW())
                FOR UPDATE`,
                [oobId, csrfToken]
            );

            if (sessionResult.rows.length === 0) {
                return { success: false, error: 'Invalid or expired session' };
            }

            const session: IssuanceSessionSchema = sessionResult.rows[0];

            // Handle callback with provider
            const result = await provider.handleCallback(code, state, codeVerifier);
            if (!result.success) {
                await client.query(
                    `UPDATE issuance_sessions SET status = 'failed' WHERE id = $1`,
                    [session.id]
                );
                return { success: false, sessionId: session.id, error: result.error };
            }

            // Update session with provider data
            await client.query(
                `UPDATE issuance_sessions
                SET status = 'verified', provider_data = $1, credential_type = $2
                WHERE id = $3`,
                [JSON.stringify(result.data), result.credentialType, session.id]
            );

            // Find connection by outOfBandId
            const connection = await this.findConnectionByOobId(oobId);
            if (!connection) {
                console.error(`[InstitutionalIssuance] No connection found for oobId: ${oobId}`);
                return {
                    success: false,
                    sessionId: session.id,
                    error: 'Connection not found for the given out-of-band ID'
                };
            }

            // Get credential type configuration
            const credTypeResult = await client.query(
                `SELECT * FROM institutional_credential_types
                WHERE provider_id = $1 AND credential_type = $2 AND is_active = true`,
                [providerId, result.credentialType]
            );

            if (credTypeResult.rows.length === 0) {
                console.error(`[InstitutionalIssuance] No credential type config found for ${providerId}:${result.credentialType}`);
                return {
                    success: false,
                    sessionId: session.id,
                    error: `Credential type ${result.credentialType} not configured for provider ${providerId}`
                };
            }

            const credTypeConfig: InstitutionalCredentialTypeSchema = credTypeResult.rows[0];

            if (!credTypeConfig.credential_definition_id) {
                return {
                    success: false,
                    sessionId: session.id,
                    error: 'Credential definition not configured'
                };
            }

            // Map provider data to credential attributes
            const attributes = provider.mapToCredentialAttributes(result.data!, result.credentialType!);

            // Issue credential
            const credentialExchange = await this.issueCredential(
                connection.id,
                credTypeConfig.credential_definition_id,
                attributes
            );

            // Update session with issued credential
            await client.query(
                `UPDATE issuance_sessions
                SET status = 'issued', connection_id = $1, credential_exchange_id = $2, issued_at = NOW()
                WHERE id = $3`,
                [connection.id, credentialExchange.id, session.id]
            );

            console.log(`[InstitutionalIssuance] Issued credential ${credentialExchange.id} for session ${session.id}`);

            return {
                success: true,
                credentialExchangeId: credentialExchange.id,
                sessionId: session.id
            };
        } catch (error: any) {
            console.error('[InstitutionalIssuance] handleOAuthCallback error:', error);
            return {
                success: false,
                error: error.message || 'Failed to process callback'
            };
        } finally {
            client.release();
        }
    }

    /**
     * Find connection by out-of-band ID
     */
    private async findConnectionByOobId(oobId: string): Promise<any | null> {
        try {
            const connections = await this.agent.didcomm.connections.getAll();
            const connection = connections.find((c: { outOfBandId?: string }) => c.outOfBandId === oobId);
            return connection || null;
        } catch (error) {
            console.error('[InstitutionalIssuance] Error finding connection by oobId:', error);
            return null;
        }
    }

    /**
     * Issue an AnonCreds credential to a connection
     */
    private async issueCredential(
        connectionId: string,
        credentialDefinitionId: string,
        attributes: CredentialAttributes
    ): Promise<any> {
        // Get schema to verify attribute names
        const credDef = await this.agent.modules.anoncreds.getCredentialDefinition(credentialDefinitionId);
        if (!credDef?.credentialDefinition) {
            throw new Error('Credential definition not found');
        }

        const schemaId = credDef.credentialDefinition.schemaId;
        const schema = await this.agent.modules.anoncreds.getSchema(schemaId);
        if (!schema?.schema) {
            throw new Error('Schema not found');
        }

        // Map attributes to schema format (ensure all schema attributes are present)
        const credentialAttributes = schema.schema.attrNames.map((attrName: string) => {
            // Try exact match first
            let value = attributes[attrName];
            // If no exact match, try case-insensitive
            if (value === undefined) {
                const lowerAttrName = attrName.toLowerCase();
                const matchingKey = Object.keys(attributes).find(k => k.toLowerCase() === lowerAttrName);
                if (matchingKey) {
                    value = attributes[matchingKey];
                }
            }
            return {
                name: attrName,
                value: String(value ?? '')
            };
        });

        console.log(`[InstitutionalIssuance] Issuing credential with ${credentialAttributes.length} attributes`);

        return this.agent.didcomm.credentials.offerCredential({
            connectionId,
            // @ts-ignore
            protocolVersion: 'v2',
            credentialFormats: {
                anoncreds: {
                    credentialDefinitionId,
                    attributes: credentialAttributes
                }
            }
        });
    }

    /**
     * Parse state parameter to extract csrf and oobId
     */
    private parseState(state: string): [string, string] {
        const parts = state.split(':');
        if (parts.length < 2) {
            throw new Error('Invalid state parameter format');
        }
        return [parts[0], parts.slice(1).join(':')];
    }

    /**
     * Get session by ID
     */
    async getSession(sessionId: string): Promise<IssuanceSessionSchema | null> {
        const client = await db.connect();
        try {
            const result = await client.query(
                'SELECT * FROM issuance_sessions WHERE id = $1',
                [sessionId]
            );
            return result.rows[0] || null;
        } finally {
            client.release();
        }
    }

    /**
     * Get sessions by oobId
     */
    async getSessionsByOobId(oobId: string): Promise<IssuanceSessionSchema[]> {
        const client = await db.connect();
        try {
            const result = await client.query(
                'SELECT * FROM issuance_sessions WHERE out_of_band_id = $1 ORDER BY created_at DESC',
                [oobId]
            );
            return result.rows;
        } finally {
            client.release();
        }
    }

    /**
     * Cancel a pending session
     */
    async cancelSession(sessionId: string): Promise<boolean> {
        const client = await db.connect();
        try {
            const result = await client.query(
                `UPDATE issuance_sessions SET status = 'failed'
                WHERE id = $1 AND status = 'pending'`,
                [sessionId]
            );
            return result.rowCount ? result.rowCount > 0 : false;
        } finally {
            client.release();
        }
    }
}
