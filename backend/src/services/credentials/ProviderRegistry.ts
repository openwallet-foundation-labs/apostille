/**
 * Provider Registry
 *
 * Singleton registry for managing credential providers.
 * Providers register themselves here and can be retrieved by ID.
 *
 * Multi-pod note: This uses a pod-local singleton pattern, which is acceptable because:
 * 1. Providers are registered at startup from environment configuration
 * 2. All pods register the same providers (determined by environment variables)
 * 3. Provider configuration is static and doesn't change at runtime
 * 4. If dynamic provider registration is needed in the future, this should be
 *    refactored to use database storage with Redis caching.
 */

import { CredentialProvider } from './CredentialProvider';

export class ProviderRegistry {
    private static instance: ProviderRegistry;
    private providers: Map<string, CredentialProvider> = new Map();

    private constructor() {}

    /**
     * Get the singleton instance of the registry
     */
    static getInstance(): ProviderRegistry {
        if (!ProviderRegistry.instance) {
            ProviderRegistry.instance = new ProviderRegistry();
        }
        return ProviderRegistry.instance;
    }

    /**
     * Register a provider with the registry
     */
    registerProvider(provider: CredentialProvider): void {
        if (this.providers.has(provider.providerId)) {
            console.warn(`Provider ${provider.providerId} already registered, overwriting...`);
        }
        this.providers.set(provider.providerId, provider);
        console.log(`Registered credential provider: ${provider.providerId}`);
    }

    /**
     * Get a provider by ID
     */
    getProvider(providerId: string): CredentialProvider | undefined {
        return this.providers.get(providerId);
    }

    /**
     * Get all registered providers
     */
    getAllProviders(): CredentialProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * Check if a provider is registered
     */
    hasProvider(providerId: string): boolean {
        return this.providers.has(providerId);
    }

    /**
     * Get all OAuth type providers
     */
    getOAuthProviders(): CredentialProvider[] {
        return this.getAllProviders().filter(p => p.type === 'oauth');
    }

    /**
     * Get all file upload type providers
     */
    getFileUploadProviders(): CredentialProvider[] {
        return this.getAllProviders().filter(p => p.type === 'file_upload');
    }

    /**
     * Get all API type providers
     */
    getApiProviders(): CredentialProvider[] {
        return this.getAllProviders().filter(p => p.type === 'api');
    }

    /**
     * Get provider IDs
     */
    getProviderIds(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Clear all registered providers (useful for testing)
     */
    clear(): void {
        this.providers.clear();
    }
}
