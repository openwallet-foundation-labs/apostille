// frontend/lib/buildTimeConfig.ts
// This file provides default configuration values for local development.
// In production, set NEXT_PUBLIC_API_URL environment variable.

// Runtime domain detection for API URLs
function getApiUrl(): string {
  // Server-side: use environment variable
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
  }

  // Client-side: use environment variable if set, otherwise fallback to localhost
  // The NEXT_PUBLIC_ prefix makes it available on the client
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Fallback to localhost for development
  return 'http://localhost:3002';
}

export const buildTimeConfig = {
  API_URL: getApiUrl(),
  API_BASE_URL: getApiUrl(),
  INTERNAL_API_URL: getApiUrl(),
  EXTERNAL_API_URL: getApiUrl(),
};
