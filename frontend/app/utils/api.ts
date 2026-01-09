/* eslint-disable no-console */
/**
 * API utilities
 *
 * Security: Uses in-memory token from tokenStore instead of localStorage
 * This protects against XSS attacks
 */
import { runtimeConfig } from '../../lib/runtimeConfig';
import { getAccessToken } from '../../lib/auth/tokenStore';

const API_BASE_URL = runtimeConfig.API_URL;
console.log('API_BASE_URL in utils/api.ts (from runtime config):', API_BASE_URL);

export interface DashboardStats {
  connections: {
    total: number;
    active: number;
  };
  credentials: {
    total: number;
    issued: number;
    received: number;
  };
  invitations: {
    pending: number;
  };
  tenant?: {
    id: string;
    label?: string;
  };
}


type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: any;
  headers?: Record<string, string>;
  cache?: RequestCache;
  credentials?: RequestCredentials;
};


const defaultOptions: ApiOptions = {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'same-origin',
};

/**
 * Fetches data from an API endpoint
 * @param url The URL to fetch from
 * @param options Additional fetch options
 * @returns The response data
 */
export async function fetchAPI<T>(url: string, options: ApiOptions = {}): Promise<T> {
  // Add authorization header if token exists
  const token = getToken();
  const authHeaders: Record<string, string> = {};
  if (token) {
    authHeaders['Authorization'] = `Bearer ${token}`;
  }

  const mergedOptions: RequestInit = {
    ...defaultOptions,
    ...options,
    credentials: 'include', // Send httpOnly cookies for refresh
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
      ...authHeaders,
      // Note: Access-Control-Allow-Origin is a RESPONSE header set by server, not request header
    },
  };


  if (options.body && typeof options.body === 'object') {
    mergedOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, mergedOptions);


  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
    
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {

    }
    
    throw new Error(errorMessage);
  }


  return response.json();
}

/**
 * Fetches dashboard statistics
 * @param tenantId The tenant ID to fetch statistics for
 * @returns The dashboard statistics
 */
export async function fetchDashboardStats(tenantId: string): Promise<DashboardStats> {
  return fetchAPI<DashboardStats>(`${API_BASE_URL}/api/dashboard/stats`, {
    method: 'POST',
    body: { tenantId },
  });
}

/**
 * Creates a new invitation
 * @param tenantId The tenant ID to create the invitation for
 * @param walletId The wallet ID to use
 * @param walletKey The wallet key to use
 * @returns The created invitation
 */
export async function createInvitation(tenantId: string, walletId: string, walletKey: string, label?: string) {
  return fetchAPI(`${API_BASE_URL}/api/connections/invitation`, {
    method: 'POST',
    body: { tenantId, walletId, walletKey, ...(label ? { label } : {}) },
  });
}

/**
 * Receive an invitation
 * @param invitationUrl The invitation URL to receive
 * @param walletId The wallet ID to use
 * @param walletKey The wallet key to use
 * @param tenantId The tenant ID to use
 * @returns The connection record details
 */
export async function receiveInvitation(invitationUrl: string, walletId: string, walletKey: string, tenantId?: string) {
  return fetchAPI(`${API_BASE_URL}/api/connections/receive-invitation`, {
    method: 'POST',
    body: { 
      invitationUrl,
      walletId,
      walletKey,
      tenantId
    },
  });
}

/**
 * Get all connections
 * @param walletId The wallet ID to use
 * @param walletKey The wallet key to use
 * @param tenantId The tenant ID to use
 * @returns The connections
 */
export async function getConnections(tenantId: string) {
  const params = new URLSearchParams({
    tenantId,
  });
  
  return fetchAPI(`${API_BASE_URL}/api/connections?${params.toString()}`);
}

/**
 * Get messages for a connection
 * @param connectionId The connection ID to get messages for
 * @param tenantId The tenant ID to use
 * @returns The messages for the connection
 */
export async function getMessages(connectionId: string, tenantId: string) {
  const params = new URLSearchParams({
    tenantId,
  });
  
  return fetchAPI(`${API_BASE_URL}/api/connections/messages/${connectionId}?${params.toString()}`);
}

/**
 * Send a message to a connection
 * @param connectionId The connection ID to send the message to
 * @param message The message to send
 * @param tenantId The tenant ID to use
 * @returns The result of sending the message
 */
export async function sendMessage(connectionId: string, message: string, tenantId: string) {
  return fetchAPI(`${API_BASE_URL}/api/connections/message`, {
    method: 'POST',
    body: {
      connectionId,
      message,
      tenantId
    },
  });
}

/**
 * Get all credentials
 * @param walletId The wallet ID to use
 * @param walletKey The wallet key to use
 * @param tenantId The tenant ID to use
 * @returns The credentials
 */
export async function getCredentials(walletId: string, walletKey: string, tenantId?: string) {
  const params = new URLSearchParams({
    walletId,
    walletKey,
    ...(tenantId ? { tenantId } : {})
  });
  
  return fetchAPI(`${API_BASE_URL}/api/credentials?${params.toString()}`);
}

/**
 * Issues a credential
 * @param tenantId The tenant ID to issue the credential from
 * @param data The credential data
 * @returns The issued credential
 */
export async function issueCredential(tenantId: string, data: any) {
  return fetchAPI(`${API_BASE_URL}/api/credentials/issue`, {
    method: 'POST',
    body: { tenantId, ...data },
  });
}

/**
 * Verifies a credential
 * @param tenantId The tenant ID to verify the credential with
 * @param data The verification data
 * @returns The verification result
 */
export async function verifyCredential(tenantId: string, data: any) {
  return fetchAPI(`${API_BASE_URL}/api/credentials/verify`, {
    method: 'POST',
    body: { tenantId, ...data },
  });
}

// API utility functions for making authenticated requests

/**
 * Get the JWT token from in-memory store
 * Security: No longer uses localStorage (XSS vulnerable)
 */
export const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return getAccessToken();
};

/**
 * Get the request headers with JWT token if available
 */
export const getHeaders = (contentType = 'application/json'): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': contentType
  };
  
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

/**
 * Make an authenticated GET request
 */
export const apiGet = async (endpoint: string) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers: getHeaders()
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message || `Request failed with status ${response.status}`);
  }
  
  return response.json();
};

/**
 * Make an authenticated POST request
 */
export const apiPost = async (endpoint: string, data: any) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message || `Request failed with status ${response.status}`);
  }
  
  return response.json();
};

/**
 * Make an authenticated PUT request
 */
export const apiPut = async (endpoint: string, data: any) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message || `Request failed with status ${response.status}`);
  }
  
  return response.json();
};

/**
 * Make an authenticated DELETE request
 */
export const apiDelete = async (endpoint: string) => {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'DELETE',
    headers: getHeaders()
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.message || `Request failed with status ${response.status}`);
  }
  
  return response.json();
}; 
