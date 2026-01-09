// credo-next-app/lib/buildTimeConfig.js
// This file provides default configuration values for local development.
// In a Docker environment, this file might be overwritten or generated at runtime.

export const buildTimeConfig = {
  API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002',
  API_BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002',
  INTERNAL_API_URL: process.env.INTERNAL_API_URL || 'http://localhost:3002',
  EXTERNAL_API_URL: process.env.EXTERNAL_API_URL || 'http://localhost:3002',
}; 