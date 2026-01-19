/**
 * Credentials Service Module
 *
 * Exports for the modular institutional credential issuance system.
 */

// Core interfaces and types
export * from './CredentialProvider';

// Registry
export { ProviderRegistry } from './ProviderRegistry';

// Services
export { InstitutionalIssuanceService } from './InstitutionalIssuanceService';

// Setup
export { setupESSIDefaultAgent, getESSIAgent, isESSIAgentInitialized } from './ESSIAgentSetup';

// Providers
export { DigilockerProvider } from './providers/DigilockerProvider';
