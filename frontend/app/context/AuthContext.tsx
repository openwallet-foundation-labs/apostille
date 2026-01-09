'use client';

import React, {
  createContext,
  useState,
  useContext,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { runtimeConfig } from '../../lib/runtimeConfig';
import { setAccessToken as setStoreAccessToken, clearAccessToken } from '../../lib/auth/tokenStore';

const API_BASE_URL = runtimeConfig.API_URL;

if (!API_BASE_URL) {
  console.error(
    'ERROR: API_BASE_URL is not set in AuthContext.tsx. This environment variable is required for the application to connect to the backend. ' +
      'Please define it in your .env.local file (or other appropriate .env file). ' +
      'Next.js uses @next/env to load these variables automatically. Example: NEXT_PUBLIC_API_URL=http://localhost:3000'
  );
}

console.log('API_BASE_URL in AuthContext (from runtime config):', API_BASE_URL);

/**
 * Auth state interface
 */
interface AuthState {
  accessToken: string | null;
  tenantId: string | null;
  email: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Auth context interface
 */
interface AuthContextType extends AuthState {
  // Alias for backwards compatibility
  token: string | null;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (
    data: { label: string; email: string; password: string },
    autoLogin?: boolean
  ) => Promise<string>;
  logout: () => Promise<void>;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Token refresh interval (refresh 1 minute before expiry)
 * Access tokens expire in 15 minutes, so refresh at 14 minutes
 */
const TOKEN_REFRESH_INTERVAL = 14 * 60 * 1000; // 14 minutes

/**
 * AuthProvider component
 *
 * Security Architecture:
 * - Access tokens: Stored ONLY in React state (memory) - XSS cannot steal them
 * - Refresh tokens: Stored in httpOnly cookies by backend - JavaScript cannot access them
 * - Silent refresh: On page load and periodically, we call /api/auth/refresh
 *   which reads the httpOnly cookie and returns a new access token
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  // Store access token in memory only (XSS protection)
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const router = useRouter();
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Refresh access token using httpOnly cookie
   * Browser automatically sends the httpOnly cookie with credentials: 'include'
   */
  const refreshAccessToken = useCallback(
    async (signal?: AbortSignal): Promise<boolean> => {
      try {
        console.log('[Auth] Attempting to refresh token...');
        const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include', // Sends httpOnly cookie automatically
          headers: {
            'Content-Type': 'application/json',
          },
          signal,
        });

        console.log('[Auth] Refresh response status:', response.status);

        if (response.ok) {
          const data = await response.json();
          console.log('[Auth] Refresh successful, got token');
          setAccessToken(data.accessToken || data.token);
          setTenantId(data.tenantId);
          setEmail(data.email);
          return true;
        }

        // Token invalid or expired - clear state
        console.log('[Auth] Refresh failed - no valid refresh token');
        setAccessToken(null);
        setTenantId(null);
        setEmail(null);
        return false;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          // Request was aborted - don't update state
          return false;
        }
        console.error('[Auth] Token refresh error:', error);
        setAccessToken(null);
        setTenantId(null);
        setEmail(null);
        return false;
      }
    },
    []
  );

  /**
   * Start periodic token refresh
   */
  const startTokenRefresh = useCallback(() => {
    // Clear any existing interval
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    // Set up periodic refresh
    refreshIntervalRef.current = setInterval(() => {
      refreshAccessToken();
    }, TOKEN_REFRESH_INTERVAL);
  }, [refreshAccessToken]);

  /**
   * Stop periodic token refresh
   */
  const stopTokenRefresh = useCallback(() => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  }, []);

  /**
   * Initialize auth state on mount
   * Attempts silent refresh using httpOnly cookie
   */
  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      abortControllerRef.current = new AbortController();

      try {
        const success = await refreshAccessToken(abortControllerRef.current.signal);
        if (success) {
          startTokenRefresh();
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      stopTokenRefresh();
    };
  }, [refreshAccessToken, startTokenRefresh, stopTokenRefresh]);

  /**
   * Sync access token to the token store for use by API utilities
   */
  useEffect(() => {
    setStoreAccessToken(accessToken);
  }, [accessToken]);

  /**
   * Handle auth errors from API calls
   */
  useEffect(() => {
    const handleAuthError = () => {
      console.warn('Authentication error detected, logging out.');
      logout();
    };

    window.addEventListener('authError', handleAuthError);

    return () => {
      window.removeEventListener('authError', handleAuthError);
    };
  }, []);

  /**
   * Login with email and password
   */
  const login = async (credentials: { email: string; password: string }) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        credentials: 'include', // Receive httpOnly cookie
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData?.message || `Login failed: ${response.status}`);
        throw new Error(
          errorData?.message || `Login failed: Server responded with status ${response.status}`
        );
      }

      const data = await response.json();

      // Store access token in memory only (XSS protection)
      setAccessToken(data.accessToken || data.token);
      setTenantId(data.tenantId);
      setEmail(data.email || credentials.email);

      // Start periodic token refresh
      startTokenRefresh();

      toast.success('Login successful');
      router.push('/');
    } catch (error) {
      console.error('Login failed:', error);
      setAccessToken(null);
      setTenantId(null);
      setEmail(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Register a new account
   */
  const register = async (
    data: { label: string; email: string; password: string },
    autoLogin: boolean = true
  ): Promise<string> => {
    setIsLoading(true);
    try {
      console.log(`Registering tenant with label: ${data.label}`);
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        credentials: 'include', // Receive httpOnly cookie
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const responseText = await response.text();
      console.log('Registration response:', responseText);

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error('Failed to parse response as JSON:', e);
        throw new Error(`Registration failed: Invalid response format - ${responseText}`);
      }

      if (!response.ok || !responseData.success) {
        toast.error(
          responseData?.message || `Registration failed: Server responded with status ${response.status}`
        );
        throw new Error(
          responseData?.message || `Registration failed: Server responded with status ${response.status}`
        );
      }

      const newTenantId = responseData.tenantId;

      console.log(`Registration successful. Tenant ID: ${newTenantId}`);
      toast.success(`Registration successful. Tenant ID: ${newTenantId}`);

      if (!newTenantId) {
        throw new Error('Registration completed but no tenant ID was returned from the server');
      }

      if (autoLogin) {
        // Store access token in memory only (XSS protection)
        setAccessToken(responseData.accessToken || responseData.token);
        setTenantId(newTenantId);
        setEmail(data.email);

        // Start periodic token refresh
        startTokenRefresh();

        router.push('/');
      }

      return newTenantId;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Logout - clear tokens and httpOnly cookie
   */
  const logout = async () => {
    try {
      // Stop token refresh
      stopTokenRefresh();

      // Clear token store first
      clearAccessToken();

      // Call backend to clear httpOnly cookie
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }).catch((err) => {
        console.error('Logout API call failed:', err);
      });

      // Clear in-memory state
      setAccessToken(null);
      setTenantId(null);
      setEmail(null);

      router.push('/login');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still clear state even if API call fails
      clearAccessToken();
      setAccessToken(null);
      setTenantId(null);
      setEmail(null);
      router.push('/login');
    }
  };

  /**
   * Get current access token
   * Used by API layer to add Authorization header
   */
  const getAccessToken = useCallback(() => {
    return accessToken;
  }, [accessToken]);

  const isAuthenticated = !!accessToken;

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        token: accessToken, // Alias for backwards compatibility
        tenantId,
        email,
        isAuthenticated,
        isLoading,
        login,
        register,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to use auth context
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Export a function to get access token from outside React components
 * This is used by the API layer
 */
let authContextRef: AuthContextType | null = null;

export const setAuthContextRef = (context: AuthContextType) => {
  authContextRef = context;
};

export const getAccessTokenOutsideComponent = (): string | null => {
  return authContextRef?.getAccessToken() ?? null;
};
