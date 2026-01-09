'use client';

// Import the build-time configuration
import { buildTimeConfig } from './buildTimeConfig';

// This file provides runtime configuration values for the Next.js app
// It will prioritize build-time values injected during container build

// Get the base configuration
const baseConfig = {
  API_URL: buildTimeConfig.API_URL,
  API_BASE_URL: buildTimeConfig.API_BASE_URL,
  INTERNAL_API_URL: buildTimeConfig.INTERNAL_API_URL,
  EXTERNAL_API_URL: buildTimeConfig.EXTERNAL_API_URL
};

// For browser requests, use the external API URL directly
// Note: Next.js rewrites are disabled during Docker builds with runtime URL injection
const getBrowserSafeApiUrl = () => {
  // Use the configured API URL for all requests
  // The EXTERNAL_API_URL is injected at container runtime via docker-entrypoint.sh
  return baseConfig.EXTERNAL_API_URL || baseConfig.API_URL;
};

// Export the runtime configuration with browser-safe URLs
export const runtimeConfig = {
  ...baseConfig,
  // Override the API URLs with browser-safe versions
  API_URL: getBrowserSafeApiUrl(),
  API_BASE_URL: getBrowserSafeApiUrl()
};

// For debugging
if (typeof window !== 'undefined') {
  console.log('Runtime config loaded (using proxy):', runtimeConfig);
}

export default runtimeConfig; 