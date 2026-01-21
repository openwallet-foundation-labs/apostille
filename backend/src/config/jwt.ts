/**
 * JWT Configuration
 *
 * Centralizes JWT secret management to ensure consistent handling
 * across all authentication code paths.
 *
 * Security Model:
 * - Access tokens: Short-lived (15 minutes), stored in memory on frontend
 * - Refresh tokens: Long-lived (7 days), stored in httpOnly cookies
 * - This protects against XSS attacks as JavaScript cannot access httpOnly cookies
 */

// JWT_SECRET is REQUIRED - application should fail fast if not set
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required');
  console.error('Generate one with: openssl rand -base64 32');
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters');
  process.exit(1);
}

// Use separate refresh token secret if provided, otherwise use main secret
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || JWT_SECRET;

export const jwtConfig = {
  secret: JWT_SECRET as string,
  refreshSecret: REFRESH_TOKEN_SECRET as string,
  accessTokenExpiresIn: '15m',      // Short-lived access token
  refreshTokenExpiresIn: '7d',       // Long-lived refresh token
  // Legacy support - will be removed after migration
  expiresIn: '24h',
} as const;

// Get cookie domain from FRONTEND_URL or default to undefined (current domain only)
const getCookieDomain = (): string | undefined => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) return undefined;

  try {
    const url = new URL(frontendUrl);
    const hostname = url.hostname;
    // For subdomains like essi.studio, set domain to .essi.studio
    // This allows cookies to be shared across api.essi.studio and essi.studio
    const parts = hostname.split('.');
    if (parts.length >= 2) {
      // Get the last two parts (e.g., essi.studio from www.essi.studio)
      return '.' + parts.slice(-2).join('.');
    }
    return undefined;
  } catch {
    return undefined;
  }
};

// Cookie configuration for refresh tokens
export const cookieConfig = {
  httpOnly: true,           // Prevents JavaScript access (XSS protection)
  secure: process.env.NODE_ENV === 'production',  // HTTPS only in production
  sameSite: 'lax' as const, // 'lax' allows cookie on same-site navigations (better than 'strict' for refresh)
  path: '/',                // Send cookie with all requests to allow refresh
  maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days in milliseconds
  domain: getCookieDomain(), // Set domain for cross-subdomain cookie sharing
} as const;
