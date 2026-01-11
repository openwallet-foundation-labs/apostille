/**
 * API client for communicating with the Express backend
 *
 * Security: Uses in-memory token from tokenStore instead of localStorage
 * This protects against XSS attacks as tokens are not persisted in browser storage
 */
'use client';
// Import runtime configuration
import { runtimeConfig } from './runtimeConfig';
import { getAccessToken } from './auth/tokenStore';

// Use the API URL from runtime config instead of directly from process.env
const API_BASE_URL = runtimeConfig.API_URL;

if (!API_BASE_URL) {
  console.error(
    'ERROR: API_BASE_URL is not set. This environment variable is required for the application to connect to the backend. ' +
    'Please define it in your .env.local file (or other appropriate .env file). ' +
    'Next.js uses @next/env to load these variables automatically. Example: NEXT_PUBLIC_API_URL=http://localhost:3000'
  );
}

// The console.log will now show the actual value from runtime config
console.log('API_BASE_URL (from runtime config):', API_BASE_URL);

/**
 * Get the JWT token from in-memory store
 * Security: No longer uses localStorage (XSS vulnerable)
 */
const getToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return getAccessToken();
};

/**
 * Generic fetch wrapper with error handling
 * Security: Uses in-memory token and includes credentials for httpOnly cookies
 */
async function fetchWithErrorHandling(url: string, options: RequestInit = {}) {
  try {
    // Add authorization header if token exists
    const token = getToken();
    if (token) {
      options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      };
    }

    // Include credentials to send httpOnly cookies
    options.credentials = 'include';

    const response = await fetch(url, options);
    
    if (response.status === 401) {
      // Dispatch a custom event to signal an authentication error
      window.dispatchEvent(new CustomEvent('authError'));
      // It's important to still throw an error to stop the current operation
      throw new Error('Unauthorized: Token might be invalid or expired.');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'An error occurred');
    }
    
    return data;
  } catch (error: any) {
    console.error('API request failed:', error);
    throw error;
  }
}

/**
 * Auth API functions
 */
export const authApi = {
  register: async (label: string, email: string, password: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, email, password })
    });
  },
  
  login: async (credentials: { email: string, password: string }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
  },
  
  verify: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/auth/verify`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Dashboard API functions
 */
export const dashboardApi = {
  getStats: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/dashboard/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * Agent API functions
 */
export const agentApi = {
  initialize: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/agent/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  },
  
  validate: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/agent/validate`, {
      method: 'GET'
    });
  },
  
  createTenant: async (label: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/agent/tenant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });
  }
};

/**
 * Connection API functions
 */
export const connectionApi = {
  getAll: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections`);
  },
  
  getById: async (connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections/${connectionId}`);
  },
  
  createInvitation: async (label?: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections/invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: label ? JSON.stringify({ label }) : undefined,
    });
  },
  
  receiveInvitation: async (invitationUrl: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections/receive-invitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invitationUrl })
    });
  },
  
  getMessages: async (connectionId: string) => {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/api/connections/messages/${connectionId}`);
    
    // Map the message format from the backend to what the frontend expects
    if (response.success && response.messages) {
      return {
        ...response,
        messages: response.messages.map((msg: any) => ({
          id: msg.connectionId + '-' + new Date(msg.timestamp).getTime(),
          connectionId: msg.connectionId,
          content: msg.content,
          role: msg.role ,
          createdAt: msg.createdAt,
          sentTime: msg.sentTime,
          updatedAt: msg.updatedAt,
          threadId: msg.threadId
        }))
      };
    }
    
    return response;
  },
  
  sendMessage: async (connectionId: string, message: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, message })
    });
  },

  /**
   * Get KEM key exchange status for a connection
   * Returns whether local and peer keys are ready for encryption
   */
  getKemStatus: async (connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections/${connectionId}/kem-status`);
  },

  /**
   * Initiate KEM key exchange with a connection
   * Generates local keypair and sends public key to peer
   */
  exchangeKeys: async (connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections/${connectionId}/exchange-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * Accept a pending KEM key exchange request from a peer
   * Generates local keypair and sends public key back to the peer who initiated
   */
  acceptKeyExchange: async (connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/connections/${connectionId}/accept-key-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

/**
 * Demo API functions
 */
export const demoApi = {
  createInvitation: async (label: string, goal: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/demo?label=${encodeURIComponent(label)}&goal=${encodeURIComponent(goal)}`);
  },

  // Get connection ID from OOB invitation ID
  getConnection: async (oobId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/demo/connection/${encodeURIComponent(oobId)}`);
  },

  // Request proof verification (no auth required)
  requestProof: async (connectionId: string, userType: 'student' | 'lawyer') => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/demo/proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, userType })
    });
  },

  // Get proof status and disclosed attributes
  getProof: async (proofId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/demo/proof/${encodeURIComponent(proofId)}`);
  }
};

/**
 * Credential API functions
 */
export const credentialApi = {
  getAll: async () => {
    const response = await fetchWithErrorHandling(`${API_BASE_URL}/api/credentials`);
    console.log('Credential API response:', response);
    return response
  },
  
  getById: async (credentialId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/credentials/${credentialId}`);
  },
  
  issue: async (
    connectionId: string, 
    credentialDefinitionId: string, 
    attributes: Record<string, string>
  ) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/credentials/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        connectionId, 
        credentialDefinitionId, 
        attributes 
      })
    });
  }
};

/**
 * Schema API functions
 */
export const schemaApi = {
  getAll: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/schemas`);
  },
  
  getById: async (schemaId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/schemas/${schemaId}`);
  },
  
  getBySchemaId: async (schemaId: string) => {
    const params = new URLSearchParams({
      schemaId
    });
    
    return fetchWithErrorHandling(`${API_BASE_URL}/api/schemas/schemaId?${params.toString()}`);
  },

  create: async (name: string, version: string, attributes: string[], provider: string = 'cheqd', issuerId?: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/schemas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, version, attributes, provider, issuerId })
    });
  }
};

/**
 * OCA Overlay structure for credential definitions
 */
export interface CredentialDefinitionOverlay {
  meta?: {
    name?: string;
    description?: string;
    issuer?: string;
    issuer_url?: string;
    issuer_description?: string;
  };
  branding?: {
    primary_background_color?: string;
    secondary_background_color?: string;
    primary_attribute?: string;
    secondary_attribute?: string;
    logo?: string;
    background_image?: string;
  };
}

/**
 * mdoc/mDL credential types for ISO 18013-5 mobile credentials
 */

// Attribute type definitions for mdoc namespaces
export type MdocAttributeType = 'tstr' | 'bstr' | 'uint' | 'int' | 'bool' | 'full-date' | 'array';

export interface MdocAttributeDefinition {
  type: MdocAttributeType;
  required: boolean;
  display?: string;
  description?: string;
}

export interface MdocNamespace {
  [attribute: string]: MdocAttributeDefinition;
}

export interface MdocNamespaceData {
  [namespace: string]: MdocNamespace;
}

// Standard document types
export const MDL_DOCTYPE = 'org.iso.18013.5.1.mDL';
export const MID_DOCTYPE = 'org.iso.23220.1.mID';
export const MDL_NAMESPACE = 'org.iso.18013.5.1';
export const MID_NAMESPACE = 'org.iso.23220.1';

// Standard mDL attributes based on ISO 18013-5
export const MDL_STANDARD_ATTRIBUTES: MdocNamespace = {
  family_name: { type: 'tstr', required: true, display: 'Family Name' },
  given_name: { type: 'tstr', required: true, display: 'Given Name' },
  birth_date: { type: 'full-date', required: true, display: 'Date of Birth' },
  issue_date: { type: 'full-date', required: true, display: 'Issue Date' },
  expiry_date: { type: 'full-date', required: true, display: 'Expiry Date' },
  issuing_country: { type: 'tstr', required: true, display: 'Issuing Country' },
  issuing_authority: { type: 'tstr', required: true, display: 'Issuing Authority' },
  document_number: { type: 'tstr', required: true, display: 'Document Number' },
  portrait: { type: 'bstr', required: true, display: 'Portrait Photo' },
  driving_privileges: { type: 'array', required: true, display: 'Driving Privileges' },
  un_distinguishing_sign: { type: 'tstr', required: false, display: 'UN Distinguishing Sign' },
  administrative_number: { type: 'tstr', required: false, display: 'Administrative Number' },
  sex: { type: 'uint', required: false, display: 'Sex' },
  height: { type: 'uint', required: false, display: 'Height (cm)' },
  weight: { type: 'uint', required: false, display: 'Weight (kg)' },
  eye_colour: { type: 'tstr', required: false, display: 'Eye Colour' },
  hair_colour: { type: 'tstr', required: false, display: 'Hair Colour' },
  birth_place: { type: 'tstr', required: false, display: 'Place of Birth' },
  resident_address: { type: 'tstr', required: false, display: 'Resident Address' },
  resident_city: { type: 'tstr', required: false, display: 'Resident City' },
  resident_state: { type: 'tstr', required: false, display: 'Resident State' },
  resident_postal_code: { type: 'tstr', required: false, display: 'Postal Code' },
  resident_country: { type: 'tstr', required: false, display: 'Resident Country' },
  age_over_18: { type: 'bool', required: false, display: 'Age Over 18' },
  age_over_21: { type: 'bool', required: false, display: 'Age Over 21' },
  nationality: { type: 'tstr', required: false, display: 'Nationality' },
};

// Standard mID (Mobile ID) attributes
export const MID_STANDARD_ATTRIBUTES: MdocNamespace = {
  family_name: { type: 'tstr', required: true, display: 'Family Name' },
  given_name: { type: 'tstr', required: true, display: 'Given Name' },
  birth_date: { type: 'full-date', required: true, display: 'Date of Birth' },
  portrait: { type: 'bstr', required: true, display: 'Portrait Photo' },
  document_number: { type: 'tstr', required: true, display: 'Document Number' },
  issue_date: { type: 'full-date', required: true, display: 'Issue Date' },
  expiry_date: { type: 'full-date', required: true, display: 'Expiry Date' },
  issuing_country: { type: 'tstr', required: true, display: 'Issuing Country' },
  issuing_authority: { type: 'tstr', required: true, display: 'Issuing Authority' },
  nationality: { type: 'tstr', required: false, display: 'Nationality' },
  birth_place: { type: 'tstr', required: false, display: 'Place of Birth' },
  resident_address: { type: 'tstr', required: false, display: 'Resident Address' },
  sex: { type: 'uint', required: false, display: 'Sex' },
};

// Credential definition types including mdoc
export type CredentialFormat = 'anoncreds' | 'oid4vc' | 'mso_mdoc';

export interface MdocCredentialDefinitionParams {
  format: 'mso_mdoc';
  doctype: string;
  namespaces: MdocNamespaceData;
  tag: string;
  overlay?: CredentialDefinitionOverlay;
}

export interface CredentialDefinitionResponse {
  id: string;
  credentialDefinitionId: string;
  schemaId?: string;
  tag: string;
  format: CredentialFormat;
  doctype?: string;
  namespaces?: MdocNamespaceData;
  overlay?: CredentialDefinitionOverlay;
  schemaAttributes?: string[];
  createdAt: string;
}

/**
 * Credential Definition API functions
 */
export const credentialDefinitionApi = {
  getAll: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/credential-definitions`);
  },

  getById: async (credDefId: string) => {
    console.log(`Fetching credential definition: ${credDefId}`);
    // Check if the credDefId contains a resource path format
    if (credDefId.includes('/resources/')) {
      // Parse issuer ID and resource ID from the format "issuerId/resources/resourceId"
      const parts = credDefId.split('/resources/');
      if (parts.length === 2) {
        const issuerId = parts[0];
        const resourceId = parts[1];
        return fetchWithErrorHandling(`${API_BASE_URL}/api/credential-definitions/${issuerId}/resources/${resourceId}`);
      }
    }

    // Use the regular endpoint for simple IDs
    return fetchWithErrorHandling(`${API_BASE_URL}/api/credential-definitions/${credDefId}`);
  },

  create: async (
    schemaId: string,
    tag: string,
    supportRevocation: boolean = false,
    overlay?: CredentialDefinitionOverlay,
    format: CredentialFormat = 'anoncreds',
    mdocOptions?: {
      doctype?: string;
      namespaces?: MdocNamespaceData;
    }
  ) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/credential-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemaId,
        tag,
        supportRevocation,
        overlay,
        format,
        ...(format === 'mso_mdoc' && mdocOptions ? {
          doctype: mdocOptions.doctype,
          namespaces: mdocOptions.namespaces,
        } : {})
      })
    });
  },

  /**
   * Create an mdoc credential definition (ISO 18013-5)
   */
  createMdoc: async (params: MdocCredentialDefinitionParams) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/credential-definitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'mso_mdoc',
        tag: params.tag,
        doctype: params.doctype,
        namespaces: params.namespaces,
        overlay: params.overlay,
      })
    });
  },

  /**
   * Get OCA overlay for a credential definition (public endpoint)
   * Works for Kanon DIDs where overlay is stored on ledger
   */
  getOverlay: async (credDefId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/credential-definitions/${encodeURIComponent(credDefId)}/overlay`);
  }
};

/**
 * Proof API functions
 */
export const proofApi = {
  getAll: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/proofs`);
  },
  
  getById: async (proofId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/proofs/${proofId}`);
  },
  
  requestProof: async (
    connectionId: string,
    proofAttributes: {name: string, restrictions?: any[]}[] | Record<string, any>,
    credentialDefinitionId?: string
  ) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/proofs/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        connectionId, 
        proofAttributes,
        credentialDefinitionId
      })
    });
  },
  
  acceptProofRequest: async (
    proofId: string,
    selectedCredentials: {
      requestedAttributes: Record<string, any>,
      selfAttestedAttributes?: Record<string, string>
    }
  ) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/proofs/${proofId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        selectedCredentials 
      })
    });
  }
};

/**
 * DID API functions
 */
export const didApi = {
  getAll: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/dids`);
  },
  
  create: async (method: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/dids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method })
    });
  }
};

/**
 * Workflow API functions
 */
export const workflowApi = {
  start: async (params: {
    template_id: string
    template_version?: string
    connection_id: string
    participants?: Record<string, unknown>
    context?: Record<string, unknown>
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  },

  advance: async (params: {
    instance_id: string
    event: string
    idempotency_key?: string
    input?: Record<string, unknown>
    connection_id?: string
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/instances/${encodeURIComponent(params.instance_id)}/advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: params.event, idempotency_key: params.idempotency_key, input: params.input, connection_id: params.connection_id }),
    })
  },

  status: async (
    instanceId: string,
    opts?: { includeUi?: boolean; includeActions?: boolean; uiProfile?: string }
  ) => {
    const includeUi = opts?.includeUi !== false
    const includeActions = opts?.includeActions !== false
    const q = new URLSearchParams()
    if (includeUi) q.set('include_ui', 'true')
    if (includeActions) q.set('include_actions', 'true')
    if (opts?.uiProfile) q.set('ui_profile', opts.uiProfile)
    const qs = q.toString()
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/instances/${instanceId}${qs ? `?${qs}` : ''}`)
  },
  publish: async (template: unknown) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template })
    });
  },

  listTemplates: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/templates`);
  },
  discoverTemplates: async (connectionId: string, opts?: { template_id?: string; template_version?: string }) => {
    const q = new URLSearchParams()
    q.set('connection_id', connectionId)
    if (opts?.template_id) q.set('template_id', opts.template_id)
    if (opts?.template_version) q.set('template_version', opts.template_version)
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/templates/discover?${q.toString()}`)
  },

  ensureTemplate: async (params: { connection_id: string; template_id: string; template_version?: string; prefer_hash?: string; waitMs?: number }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/templates/ensure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  },

  getTemplate: async (templateId: string, version?: string) => {
    const q = new URLSearchParams()
    if (version) q.set('version', version)
    const qs = q.toString()
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/templates/${encodeURIComponent(templateId)}${qs ? `?${qs}` : ''}`)
  },

  listInstances: async (connectionId?: string) => {
    const q = connectionId ? `?connection_id=${encodeURIComponent(connectionId)}` : ''
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/instances${q}`)
  },
  listInstancesByConnection: async (connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/connections/${encodeURIComponent(connectionId)}/instances`)
  },
  queueMetrics: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/workflows/queue/metrics`)
  },
  listQueueCommands: async (opts?: { status?: 'pending' | 'processing' | 'completed' | 'failed'; thid?: string; limit?: number }) => {
    const q = new URLSearchParams()
    if (opts?.status) q.set('status', opts.status)
    if (opts?.thid) q.set('thid', opts.thid)
    if (opts?.limit) q.set('limit', String(opts.limit))
    const qs = q.toString()
    const url = `${API_BASE_URL}/api/workflows/queue/commands${qs ? `?${qs}` : ''}`
    return fetchWithErrorHandling(url)
  },
};

/**
 * Signing API functions
 */
export const signingApi = {
  requestSigning: async (params: {
    connectionId: string
    document: any
    label?: string
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  },

  consentToSign: async (sessionId: string, params?: {
    objectId?: string
    keyId?: string
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/consent/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    })
  },

  sign: async (sessionId: string, params?: {
    objectId?: string
    keyId?: string
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/sign/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    })
  },

  complete: async (sessionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/complete/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
  },

  decline: async (sessionId: string, reason?: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/decline/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason || 'Declined by user' }),
    })
  },

  getSessions: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/sessions`)
  },

  getSession: async (sessionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/sessions/${sessionId}`)
  },

  getKeys: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/keys`)
  },

  createKey: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/signing/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
  },
};

/**
 * Vault API functions
 * For encrypted vault storage and sharing
 */
export const vaultApi = {
  /**
   * List all vaults
   */
  getAll: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults`);
  },

  /**
   * Get vault info by ID
   */
  getById: async (vaultId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults/${vaultId}`);
  },

  /**
   * Create a new vault with file upload
   */
  create: async (file: File, passphrase: string, description?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('passphrase', passphrase);
    if (description) {
      formData.append('description', description);
    }

    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/vaults`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'include',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to create vault');
    }
    return data;
  },

  /**
   * Delete a vault
   */
  delete: async (vaultId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults/${vaultId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Open (decrypt) a vault
   */
  open: async (vaultId: string, passphrase: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults/${vaultId}/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
  },

  /**
   * Update vault with new file
   */
  update: async (vaultId: string, file: File, passphrase: string, description?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('passphrase', passphrase);
    if (description) {
      formData.append('description', description);
    }

    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}`, {
      method: 'PUT',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'include',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Failed to update vault');
    }
    return data;
  },

  /**
   * Share vault with a connection
   */
  share: async (vaultId: string, connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults/${vaultId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    });
  },

  /**
   * Check storage configuration status
   */
  getStorageStatus: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults/storage/status`);
  },

  /**
   * Generate a new KEM keypair for vault sharing
   */
  generateKey: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults/keys/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * Get all KEM keys
   */
  getKeys: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/vaults/keys`);
  },
};

/**
 * PDF Signing API functions
 * For PDF document signing workflows with vaults
 * Uses ML-KEM-768 post-quantum encryption ()
 */
export const pdfSigningApi = {
  /**
   * Upload a PDF and create an encrypted vault
   * Requires a connection with KEM keys exchanged
   * @param file - PDF file to upload
   * @param recipientConnectionId - Connection ID of recipient (must have KEM keys)
   * @param description - Optional description
   */
  upload: async (file: File, recipientConnectionId: string, description?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('recipientConnectionId', recipientConnectionId);
    if (description) {
      formData.append('description', description);
    }

    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/pdf-signing/upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'include',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to upload PDF');
    }
    return data;
  },

  /**
   * Sign a PDF stored in a vault
   * Uses KEM keys for decryption - 
   */
  sign: async (vaultId: string, params: {
    certificate: string;
    privateKey: string;
    reason?: string;
    location?: string;
    name?: string;
    contactInfo?: string;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/pdf-signing/sign/${vaultId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  /**
   * Download a decrypted PDF from a vault
   * Uses KEM keys for decryption - 
   */
  download: async (vaultId: string) => {
    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/pdf-signing/download/${vaultId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to download PDF');
    }

    // Return the blob for download
    return response.blob();
  },

  /**
   * Share a PDF vault for signing
   */
  share: async (vaultId: string, connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/pdf-signing/share/${vaultId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId }),
    });
  },

  /**
   * Return a signed PDF to the owner
   */
  returnSigned: async (vaultId: string, ownerConnectionId: string, passphrase: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/pdf-signing/return/${vaultId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerConnectionId, passphrase }),
    });
  },

  /**
   * Verify a PDF signature
   */
  verify: async (vaultId: string, passphrase: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/pdf-signing/verify/${vaultId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
  },

  /**
   * Get PDF signing workflow status
   */
  getStatus: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/pdf-signing/status`);
  },

  /**
   * Upload an already-signed PDF (client-side signing)
   * The PDF is signed in the browser and uploaded to replace the unsigned version
   */
  uploadSigned: async (vaultId: string, signedPdfBytes: Uint8Array, signerName?: string) => {
    const formData = new FormData();
    // Convert Uint8Array to ArrayBuffer then to Blob for TypeScript compatibility
    const arrayBuffer = signedPdfBytes.buffer.slice(
      signedPdfBytes.byteOffset,
      signedPdfBytes.byteOffset + signedPdfBytes.byteLength
    ) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
    formData.append('file', blob, 'signed.pdf');
    if (signerName) {
      formData.append('signerName', signerName);
    }

    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/api/pdf-signing/upload-signed/${vaultId}`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      credentials: 'include',
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || 'Failed to upload signed PDF');
    }
    return data;
  },
};

/**
 * Group Messaging API functions
 */
export const groupMessagingApi = {
  createRoom: async (params: {
    label: string;
    policy?: {
      join?: string;
      maxMembers?: number;
      adminThreshold?: number;
    };
    ciphersuite?: string;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  getRooms: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms`);
  },

  getRoom: async (roomId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}`);
  },

  getRoster: async (roomId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/roster`);
  },

  inviteMember: async (roomId: string, params: {
    inviteeDid: string;
    devicePublicKey?: string;
    role?: string;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  joinRoom: async (params: {
    roomDid: string;
    joinToken: any;
    connectionId: string;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  getMessages: async (roomId: string, params?: { limit?: number; skip?: number }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', params.limit.toString());
    if (params?.skip) query.set('skip', params.skip.toString());
    const queryString = query.toString();
    return fetchWithErrorHandling(
      `${API_BASE_URL}/api/groups/rooms/${roomId}/messages${queryString ? `?${queryString}` : ''}`
    );
  },

  sendMessage: async (roomId: string, message: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
  },

  getUnreadMessages: async (roomId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/messages/unread`);
  },

  markMessageAsRead: async (roomId: string, messageId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/messages/${messageId}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  markRoomAsRead: async (roomId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/read`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  getMessageStatus: async (roomId: string, messageId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/messages/${messageId}/status`);
  },

  leaveRoom: async (roomId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  archiveRoom: async (roomId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}`, {
      method: 'DELETE',
    });
  },

  removeMember: async (roomId: string, params: {
    memberDid: string;
    reason?: string;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/groups/rooms/${roomId}/remove-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },
};

/**
 * POE (Proof of Execution) API functions
 */
export const poeApi = {
  // Session Management
  getSessions: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/sessions`);
  },

  getSession: async (sessionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/sessions/${sessionId}`);
  },

  getSessionsByConnection: async (connectionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/connections/${connectionId}/sessions`);
  },

  // Request Proof (Requester Role)
  requestProofOfExecution: async (params: {
    connectionId: string;
    programs: Array<{
      program_id: string;
      program_version?: string;
      inputs?: {
        by_value?: Record<string, unknown>;
        by_ref?: Array<{ uri: string; digest?: { alg: string; value: string } }>;
      };
      public_constraints?: Record<string, unknown>;
      disclosure: 'proof-only' | 'proof+summary' | 'proof+evidence-ref';
      policy?: {
        max_execution_time_ms?: number;
        allowed_attesters?: string[];
      };
    }>;
    expiry?: string;
    bindingContext?: {
      nonce: string;
      context_hash: string;
      session_id: string;
    };
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  // Submit Proof (Prover Role)
  submitProof: async (sessionId: string, proofArtifact: {
    program_id: string;
    result: 'pass' | 'fail' | 'partial';
    public: {
      binding: {
        nonce: string;
        context_hash: string;
        session_id: string;
      };
      outputs?: Record<string, unknown>;
    };
    zk: {
      system: string;
      proof: string;
      vk_hash: string;
      public_inputs?: string[];
    };
    summary?: {
      execution_time_ms?: number;
      resource_usage?: Record<string, unknown>;
    };
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/submit/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proofArtifact }),
    });
  },

  // Negotiation
  proposeAlternative: async (sessionId: string, options: {
    programs?: Array<{
      program_id: string;
      program_version?: string;
    }>;
    reason?: string;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/propose/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
  },

  acceptProposal: async (sessionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/accept/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  declineProposal: async (sessionId: string, reason?: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/decline/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
  },

  // Complete Protocol
  complete: async (sessionId: string, issueReceipt?: boolean) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/complete/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issueReceipt }),
    });
  },

  // Problem Report
  sendProblemReport: async (sessionId: string, code: string, explain?: string, details?: Record<string, unknown>) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/problem-report/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, explain, details }),
    });
  },

  // Programs & Proof Systems
  getPrograms: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/programs`);
  },

  getProofSystems: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/proof-systems`);
  },

  // Utilities
  generateNonce: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/poe/generate-nonce`);
  },
};

/**
 * OpenBadges API functions
 * For issuing and verifying OBv3 credentials (Credly-compatible)
 */
export interface OpenBadgeAchievement {
  id?: string;
  name: string;
  description: string;
  achievementType?: string;
  criteria?: { narrative: string };
  image?: { id: string; type: string };
}

export interface IssueBadgeRequest {
  recipientName: string;
  recipientDid?: string;
  recipientEmail?: string;
  connectionId?: string;
  achievement: OpenBadgeAchievement;
  issuerName?: string;
  issuerUrl?: string;
  issuerDescription?: string;
}

export interface OpenBadgeCredential {
  '@context': string[];
  id: string;
  type: string[];
  issuer: {
    id: string;
    type: string[];
    name: string;
    url?: string;
    description?: string;
  };
  validFrom: string;
  name: string;
  credentialSubject: {
    type: string[];
    id?: string;
    achievement: OpenBadgeAchievement;
  };
  proof?: {
    type: string;
    cryptosuite: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string;
  };
}

/**
 * OID4VCI (OpenID for Verifiable Credential Issuance) API functions
 */

// Mdoc credential data interface for issuance
export interface MdocCredentialData {
  // Standard mDL fields
  family_name?: string;
  given_name?: string;
  birth_date?: string; // YYYY-MM-DD format
  issue_date?: string;
  expiry_date?: string;
  issuing_country?: string;
  issuing_authority?: string;
  document_number?: string;
  portrait?: string; // Base64 encoded image
  driving_privileges?: Array<{
    vehicle_category_code: string;
    issue_date?: string;
    expiry_date?: string;
    codes?: Array<{ code: string; sign?: string; value?: string }>;
  }>;
  // Optional fields
  sex?: number;
  height?: number;
  weight?: number;
  eye_colour?: string;
  hair_colour?: string;
  birth_place?: string;
  resident_address?: string;
  resident_city?: string;
  resident_state?: string;
  resident_postal_code?: string;
  resident_country?: string;
  age_over_18?: boolean;
  age_over_21?: boolean;
  nationality?: string;
  // Allow additional custom fields
  [key: string]: unknown;
}

export const oid4vciApi = {
  /**
   * Create a credential offer
   */
  createOffer: async (params: {
    credentialDefinitionId: string;
    credentialConfigurationId: string;
    credentialData: Record<string, unknown>;
    txCodeRequired?: boolean;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/oid4vci/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  /**
   * Create an mdoc credential offer (for mDL/mobile documents)
   */
  createMdocOffer: async (params: {
    credentialDefinitionId: string;
    credentialConfigurationId: string;
    credentialData: MdocCredentialData;
    txCodeRequired?: boolean;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/oid4vci/offers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  /**
   * Get offer status
   */
  getOfferStatus: async (offerId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/oid4vci/offers/${offerId}/status`);
  },
};

/**
 * OID4VP (OpenID for Verifiable Presentations) API functions
 */
export const oid4vpApi = {
  /**
   * Create an authorization request (verification request)
   */
  createAuthorizationRequest: async (params: {
    credentialTypes: string[];
    requestedAttributes?: string[];
    purpose?: string;
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/oid4vp/authorization-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  },

  /**
   * Get verification session status
   */
  getSessionStatus: async (sessionId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/oid4vp/sessions/${sessionId}`);
  },
};

export const openbadgesApi = {
  /**
   * Issue a new OpenBadge credential
   */
  issue: async (data: IssueBadgeRequest) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/openbadges/credentials/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  /**
   * Verify an OpenBadge credential (public endpoint)
   */
  verify: async (credential: OpenBadgeCredential | Record<string, unknown>) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/openbadges/credentials/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
  },

  /**
   * Get all issued badges for the current tenant
   */
  getAll: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/openbadges/credentials`);
  },

  /**
   * Get a specific badge by ID
   */
  getById: async (credentialId: string) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/openbadges/credentials/${encodeURIComponent(credentialId)}`);
  },

  /**
   * Create an achievement definition
   */
  createAchievement: async (data: {
    name: string;
    description: string;
    criteria?: { narrative: string };
    image?: { id: string; type: string };
    achievementType?: string;
    tags?: string[];
  }) => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/openbadges/achievements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  /**
   * Get issuer profile for the current tenant
   */
  getProfile: async () => {
    return fetchWithErrorHandling(`${API_BASE_URL}/api/openbadges/profile`);
  },
};
