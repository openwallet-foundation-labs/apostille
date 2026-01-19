/**
 * Credential Provider Interface
 *
 * This interface defines the contract for credential providers that can be used
 * with the institutional credential issuance system. Providers can be of different
 * types: OAuth (like Digilocker), file_upload (like Aadhaar offline XML), or api.
 */

export interface ProviderConfig {
    clientId?: string;
    clientSecret?: string;
    redirectUri?: string;
    endpoints?: Record<string, string>;
    [key: string]: unknown;
}

export interface VerificationResult {
    success: boolean;
    data?: Record<string, unknown>;
    credentialType?: string;
    error?: string;
}

export interface CredentialAttributes {
    [key: string]: string | number | boolean;
}

export interface SchemaDefinition {
    name: string;
    version: string;
    attributes: string[];
}

export type ProviderType = 'oauth' | 'file_upload' | 'api';

export interface CredentialProvider {
    /**
     * Unique identifier for this provider (e.g., 'digilocker', 'aadhaar_offline')
     */
    readonly providerId: string;

    /**
     * Human-readable name for this provider
     */
    readonly name: string;

    /**
     * Type of provider - determines which methods are available
     */
    readonly type: ProviderType;

    /**
     * Initialize the provider with configuration from database
     */
    initialize(config: ProviderConfig): Promise<void>;

    /**
     * Get OAuth authorization URL (for oauth type providers)
     * @param oobId - Out of band ID for connection tracking
     * @param csrfToken - CSRF token for security
     * @param options - Additional provider-specific options
     */
    getAuthorizationUrl?(oobId: string, csrfToken: string, options?: Record<string, unknown>): string;

    /**
     * Handle OAuth callback (for oauth type providers)
     * @param code - Authorization code from OAuth provider
     * @param state - State parameter containing csrf:oobId
     * @param codeVerifier - PKCE code verifier if applicable
     */
    handleCallback?(code: string, state: string, codeVerifier?: string): Promise<VerificationResult>;

    /**
     * Verify uploaded file (for file_upload type providers)
     * @param file - File buffer
     * @param metadata - Additional metadata like password for encrypted files
     */
    verifyFile?(file: Buffer, metadata?: Record<string, unknown>): Promise<VerificationResult>;

    /**
     * Call external API (for api type providers)
     * @param data - Data to send to the API
     */
    verifyViaApi?(data: Record<string, unknown>): Promise<VerificationResult>;

    /**
     * Map provider data to credential attributes for AnonCreds
     * @param data - Raw data from provider
     * @param credentialType - Type of credential being issued
     */
    mapToCredentialAttributes(data: Record<string, unknown>, credentialType: string): CredentialAttributes;

    /**
     * Get list of credential types this provider supports
     */
    getSupportedCredentialTypes(): string[];

    /**
     * Get AnonCreds schema definition for a credential type
     * @param credentialType - Type of credential
     */
    getSchemaDefinition(credentialType: string): SchemaDefinition;
}

/**
 * Base abstract class that providers can extend for common functionality
 */
export abstract class BaseCredentialProvider implements CredentialProvider {
    abstract readonly providerId: string;
    abstract readonly name: string;
    abstract readonly type: ProviderType;

    protected config: ProviderConfig = {};

    async initialize(config: ProviderConfig): Promise<void> {
        this.config = config;
    }

    getAuthorizationUrl?(oobId: string, csrfToken: string, options?: Record<string, unknown>): string;
    handleCallback?(code: string, state: string, codeVerifier?: string): Promise<VerificationResult>;
    verifyFile?(file: Buffer, metadata?: Record<string, unknown>): Promise<VerificationResult>;
    verifyViaApi?(data: Record<string, unknown>): Promise<VerificationResult>;

    abstract mapToCredentialAttributes(data: Record<string, unknown>, credentialType: string): CredentialAttributes;
    abstract getSupportedCredentialTypes(): string[];
    abstract getSchemaDefinition(credentialType: string): SchemaDefinition;

    /**
     * Parse state parameter to extract csrf token and oobId
     */
    protected parseState(state: string): { csrfToken: string; oobId: string } {
        const parts = state.split(':');
        if (parts.length < 2) {
            throw new Error('Invalid state parameter format');
        }
        return {
            csrfToken: parts[0],
            oobId: parts.slice(1).join(':') // In case oobId contains colons
        };
    }

    /**
     * Encode csrf token and oobId into state parameter
     */
    protected encodeState(csrfToken: string, oobId: string): string {
        return `${csrfToken}:${oobId}`;
    }
}
