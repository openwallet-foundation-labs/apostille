/**
 * Storage Service for Vault S3 Configuration
 *
 * This service initializes S3 storage for the vaults module when
 * environment variables are configured.
 */

import type { Agent } from '@credo-ts/core';

/**
 * Initialize vault storage with S3 configuration from environment variables
 *
 * @param agent - The Credo agent with vaults module
 */
export async function initializeVaultStorage(agent: Agent): Promise<void> {
  const bucket = process.env.S3_VAULT_BUCKET;
  const region = process.env.S3_VAULT_REGION;
  const accessKeyId = process.env.S3_VAULT_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_VAULT_SECRET_ACCESS_KEY;

  // Skip if S3 is not configured
  if (!bucket || !accessKeyId || !secretAccessKey) {
    console.log('Vault S3 storage not configured (optional)');
    return;
  }

  try {
    // Access the vaults module
    const vaultsModule = (agent.modules as any).vaults;

    if (!vaultsModule) {
      console.warn('Vaults module not found on agent');
      return;
    }

    // Configure S3 storage
    await vaultsModule.configureStorage({
      type: 's3',
      bucket,
      region: region || 'us-east-1',
      accessKeyId,
      secretAccessKey,
      endpoint: process.env.S3_VAULT_ENDPOINT || undefined,
    });

    console.log(`Vault S3 storage configured: bucket=${bucket}, region=${region || 'us-east-1'}`);
  } catch (error) {
    console.error('Failed to configure vault S3 storage:', error);
    // Don't throw - S3 storage is optional, vaults still work with inline storage
  }
}
