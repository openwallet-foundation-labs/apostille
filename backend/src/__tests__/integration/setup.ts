/**
 * Integration Test Setup
 *
 * These tests run against a live deployment (local k8s or remote)
 * Set environment variables to configure the target:
 *
 * TEST_API_URL - Backend API URL (default: http://localhost:30002)
 * TEST_FRONTEND_URL - Frontend URL (default: http://localhost:30000)
 */

export const config = {
  apiUrl: process.env.TEST_API_URL || 'http://localhost:30002',
  frontendUrl: process.env.TEST_FRONTEND_URL || 'http://localhost:30000',
  timeout: 30000,
}

// Helper to make API requests
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${config.apiUrl}${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  return response
}

// Helper to make authenticated API requests
export async function authenticatedRequest(
  endpoint: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  return apiRequest(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  })
}

// Generate unique test identifiers
export function generateTestId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

// Wait for condition with timeout
export async function waitFor(
  condition: () => Promise<boolean>,
  timeoutMs: number = 10000,
  intervalMs: number = 500
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`)
}

// Check if the deployment is reachable
export async function isDeploymentReady(): Promise<boolean> {
  try {
    const response = await apiRequest('/health')
    return response.ok
  } catch {
    return false
  }
}

// ==================== Connection Flow Helpers ====================

export interface TenantInfo {
  token: string
  tenantId: string
  email: string
  label: string
}

export interface InvitationInfo {
  id: string
  url: string
  invitationUrl?: string
  outOfBandInvitation?: any
}

export interface ConnectionInfo {
  id: string
  state: string
  theirLabel?: string
  outOfBandId?: string
}

/**
 * Register a new tenant and return auth info
 */
export async function registerTenant(label: string): Promise<TenantInfo> {
  const email = `${generateTestId()}@test.com`
  const password = 'TestPassword123'

  const response = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ label, email, password }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to register tenant: ${error}`)
  }

  const data = await response.json()
  return {
    token: data.token || data.accessToken,
    tenantId: data.tenantId || data.tenant?.id,
    email,
    label,
  }
}

/**
 * Create an OOB invitation for a tenant
 */
export async function createInvitation(
  token: string,
  label?: string
): Promise<InvitationInfo> {
  const response = await authenticatedRequest('/api/connections/invitation', token, {
    method: 'POST',
    body: JSON.stringify({ label: label || 'Connection Invitation' }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create invitation: ${error}`)
  }

  const data = await response.json()
  // API returns { success: true, invitation: { id, url, outOfBandInvitation } }
  const invitation = data.invitation || data
  return {
    id: invitation.id || invitation.outOfBandInvitation?.id,
    url: invitation.url || invitation.invitationUrl,
    invitationUrl: invitation.url || invitation.invitationUrl,
    outOfBandInvitation: invitation.outOfBandInvitation,
  }
}

/**
 * Receive and accept an OOB invitation
 */
export async function receiveInvitation(
  token: string,
  invitationUrl: string
): Promise<ConnectionInfo> {
  const response = await authenticatedRequest('/api/connections/receive-invitation', token, {
    method: 'POST',
    body: JSON.stringify({ invitationUrl }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to receive invitation: ${error}`)
  }

  const data = await response.json()
  // API returns { success: true, connection: { id, state, role, theirLabel, createdAt } }
  const connection = data.connection || data.connectionRecord || data
  return {
    id: connection.id,
    state: connection.state,
    theirLabel: connection.theirLabel,
    outOfBandId: data.outOfBandRecord?.id || data.outOfBandId,
  }
}

/**
 * Get all connections for a tenant
 */
export async function getConnections(token: string): Promise<{
  connections: ConnectionInfo[]
  invitations: any[]
}> {
  const response = await authenticatedRequest('/api/connections', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get connections: ${error}`)
  }

  const data = await response.json()
  return {
    connections: data.connections || data || [],
    invitations: data.invitations || [],
  }
}

/**
 * Get a specific connection by ID
 */
export async function getConnection(
  token: string,
  connectionId: string
): Promise<ConnectionInfo | null> {
  const response = await authenticatedRequest(`/api/connections/${connectionId}`, token)

  if (!response.ok) {
    if (response.status === 404) return null
    const error = await response.text()
    throw new Error(`Failed to get connection: ${error}`)
  }

  const data = await response.json()
  // API returns { success: true, connection: { id, state, ... } }
  const connection = data.connection || data
  return {
    id: connection.id,
    state: connection.state,
    theirLabel: connection.theirLabel,
    outOfBandId: connection.outOfBandId,
  }
}

/**
 * Wait for a connection to reach completed state
 */
export async function waitForConnectionComplete(
  token: string,
  connectionId: string,
  timeoutMs: number = 15000
): Promise<ConnectionInfo> {
  const start = Date.now()
  const intervalMs = 500

  while (Date.now() - start < timeoutMs) {
    const connection = await getConnection(token, connectionId)

    if (connection && connection.state === 'completed') {
      return connection
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  // One final check
  const connection = await getConnection(token, connectionId)
  if (connection && connection.state === 'completed') {
    return connection
  }

  throw new Error(
    `Connection ${connectionId} did not complete within ${timeoutMs}ms. ` +
    `Last state: ${connection?.state || 'unknown'}`
  )
}

/**
 * Send a basic message over a connection
 */
export async function sendMessage(
  token: string,
  connectionId: string,
  message: string
): Promise<void> {
  const response = await authenticatedRequest('/api/connections/message', token, {
    method: 'POST',
    body: JSON.stringify({ connectionId, message }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to send message: ${error}`)
  }
}

// ==================== DID Helpers ====================

export interface DidInfo {
  did: string
  didDocument?: any
  method: string
}

/**
 * Create a new DID
 */
export async function createDid(
  token: string,
  method: string = 'key'
): Promise<DidInfo> {
  const response = await authenticatedRequest('/api/dids', token, {
    method: 'POST',
    body: JSON.stringify({ method }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create DID: ${error}`)
  }

  const data = await response.json()
  return {
    did: data.did || data.didDocument?.id,
    didDocument: data.didDocument,
    method,
  }
}

/**
 * List all DIDs for tenant
 */
export async function listDids(token: string): Promise<DidInfo[]> {
  const response = await authenticatedRequest('/api/dids', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list DIDs: ${error}`)
  }

  const data = await response.json()
  return data.dids || data || []
}

// ==================== Schema Helpers ====================

export interface SchemaInfo {
  id: string
  name: string
  version: string
  attributes: string[]
  issuerId?: string
}

/**
 * Create a new schema
 */
export async function createSchema(
  token: string,
  name: string,
  version: string,
  attributes: string[]
): Promise<SchemaInfo> {
  const response = await authenticatedRequest('/api/schemas', token, {
    method: 'POST',
    body: JSON.stringify({ name, version, attributes }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create schema: ${error}`)
  }

  const data = await response.json()
  const schema = data.schema || data
  return {
    id: schema.id || schema.schemaId,
    name: schema.name,
    version: schema.version,
    attributes: schema.attributes || schema.attrNames,
    issuerId: schema.issuerId,
  }
}

/**
 * List all schemas for tenant
 */
export async function listSchemas(token: string): Promise<SchemaInfo[]> {
  const response = await authenticatedRequest('/api/schemas', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list schemas: ${error}`)
  }

  const data = await response.json()
  return data.schemas || data || []
}

// ==================== Credential Definition Helpers ====================

export interface CredDefInfo {
  id: string
  schemaId: string
  tag: string
  supportRevocation?: boolean
}

/**
 * Create a new credential definition
 */
export async function createCredentialDefinition(
  token: string,
  schemaId: string,
  tag: string = 'default',
  supportRevocation: boolean = false
): Promise<CredDefInfo> {
  const response = await authenticatedRequest('/api/credential-definitions', token, {
    method: 'POST',
    body: JSON.stringify({ schemaId, tag, supportRevocation }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create credential definition: ${error}`)
  }

  const data = await response.json()
  const credDef = data.credentialDefinition || data
  return {
    id: credDef.id || credDef.credentialDefinitionId,
    schemaId: credDef.schemaId,
    tag: credDef.tag,
    supportRevocation: credDef.supportRevocation,
  }
}

/**
 * List all credential definitions for tenant
 */
export async function listCredentialDefinitions(token: string): Promise<CredDefInfo[]> {
  const response = await authenticatedRequest('/api/credential-definitions', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list credential definitions: ${error}`)
  }

  const data = await response.json()
  return data.credentialDefinitions || data || []
}

// ==================== Credential Helpers ====================

export interface CredentialInfo {
  id: string
  state: string
  credentialDefinitionId?: string
  attributes?: Record<string, string>
}

/**
 * Offer a credential to a connection
 */
export async function offerCredential(
  token: string,
  connectionId: string,
  credentialDefinitionId: string,
  attributes: Record<string, string>
): Promise<CredentialInfo> {
  const response = await authenticatedRequest('/api/credentials/offer', token, {
    method: 'POST',
    body: JSON.stringify({ connectionId, credentialDefinitionId, attributes }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to offer credential: ${error}`)
  }

  const data = await response.json()
  const credential = data.credential || data.credentialRecord || data
  return {
    id: credential.id,
    state: credential.state,
    credentialDefinitionId: credential.credentialDefinitionId,
    attributes,
  }
}

/**
 * List all credentials for tenant
 */
export async function listCredentials(token: string): Promise<CredentialInfo[]> {
  const response = await authenticatedRequest('/api/credentials', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list credentials: ${error}`)
  }

  const data = await response.json()
  return data.credentials || data || []
}

// ==================== Proof Helpers ====================

export interface ProofRequestInfo {
  id: string
  state: string
  connectionId?: string
}

/**
 * Request a proof from a connection
 */
export async function requestProof(
  token: string,
  connectionId: string,
  attributes: { name: string; restrictions?: any[] }[]
): Promise<ProofRequestInfo> {
  const response = await authenticatedRequest('/api/proofs/request', token, {
    method: 'POST',
    body: JSON.stringify({ connectionId, requestedAttributes: attributes }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to request proof: ${error}`)
  }

  const data = await response.json()
  const proof = data.proof || data.proofRecord || data
  return {
    id: proof.id,
    state: proof.state,
    connectionId: proof.connectionId,
  }
}

/**
 * List all proofs for tenant
 */
export async function listProofs(token: string): Promise<ProofRequestInfo[]> {
  const response = await authenticatedRequest('/api/proofs', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list proofs: ${error}`)
  }

  const data = await response.json()
  return data.proofs || data || []
}

// ==================== OID4VCI Helpers ====================

export interface OID4VCIOfferInfo {
  offerId: string
  credentialOffer: string
  credentialOfferUri?: string
}

/**
 * Create an OID4VCI credential offer
 */
export async function createOID4VCIOffer(
  token: string,
  credentialType: string,
  attributes: Record<string, string>
): Promise<OID4VCIOfferInfo> {
  const response = await authenticatedRequest('/api/oid4vci/offer', token, {
    method: 'POST',
    body: JSON.stringify({ credentialType, attributes }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create OID4VCI offer: ${error}`)
  }

  const data = await response.json()
  return {
    offerId: data.offerId || data.id,
    credentialOffer: data.credentialOffer,
    credentialOfferUri: data.credentialOfferUri,
  }
}

/**
 * List OID4VCI issuers
 */
export async function listOID4VCIIssuers(token: string): Promise<any[]> {
  const response = await authenticatedRequest('/api/oid4vci/issuers', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to list OID4VCI issuers: ${error}`)
  }

  const data = await response.json()
  return data.issuers || data || []
}

// ==================== OID4VP Helpers ====================

export interface OID4VPRequestInfo {
  requestId: string
  authorizationRequest: string
  authorizationRequestUri?: string
}

/**
 * Create an OID4VP verification request
 */
export async function createOID4VPRequest(
  token: string,
  presentationDefinition: any
): Promise<OID4VPRequestInfo> {
  const response = await authenticatedRequest('/api/oid4vp/request', token, {
    method: 'POST',
    body: JSON.stringify({ presentationDefinition }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create OID4VP request: ${error}`)
  }

  const data = await response.json()
  return {
    requestId: data.requestId || data.id,
    authorizationRequest: data.authorizationRequest,
    authorizationRequestUri: data.authorizationRequestUri,
  }
}

// ==================== Dashboard Helpers ====================

export interface DashboardStats {
  totalConnections?: number
  totalCredentials?: number
  totalSchemas?: number
}

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(token: string): Promise<DashboardStats> {
  const response = await authenticatedRequest('/api/dashboard', token)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get dashboard stats: ${error}`)
  }

  const data = await response.json()
  return data.stats || data || {}
}

// ==================== Credential Designer Helpers ====================

export interface CardTemplateInfo {
  id: string
  name: string
  template?: any
}

/**
 * List card templates
 */
export async function listCardTemplates(token: string): Promise<CardTemplateInfo[]> {
  const response = await authenticatedRequest('/api/credential-designer/templates', token)

  if (!response.ok) {
    // May return 404 if no templates
    if (response.status === 404) return []
    const error = await response.text()
    throw new Error(`Failed to list card templates: ${error}`)
  }

  const data = await response.json()
  return data.templates || data || []
}

/**
 * Create a card template
 */
export async function createCardTemplate(
  token: string,
  name: string,
  template: any
): Promise<CardTemplateInfo> {
  const response = await authenticatedRequest('/api/credential-designer/templates', token, {
    method: 'POST',
    body: JSON.stringify({ name, template }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create card template: ${error}`)
  }

  const data = await response.json()
  return {
    id: data.id || data.templateId,
    name: data.name,
    template: data.template,
  }
}

// ==================== OpenBadges Helpers ====================

export interface BadgeInfo {
  id: string
  name: string
  description?: string
}

/**
 * List badges
 */
export async function listBadges(token: string): Promise<BadgeInfo[]> {
  const response = await authenticatedRequest('/api/openbadges', token)

  if (!response.ok) {
    if (response.status === 404) return []
    const error = await response.text()
    throw new Error(`Failed to list badges: ${error}`)
  }

  const data = await response.json()
  return data.badges || data || []
}

// ==================== Groups Helpers ====================

export interface GroupInfo {
  id: string
  name: string
  memberCount?: number
}

/**
 * Create a group
 */
export async function createGroup(
  token: string,
  name: string
): Promise<GroupInfo> {
  const response = await authenticatedRequest('/api/groups', token, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to create group: ${error}`)
  }

  const data = await response.json()
  return {
    id: data.id || data.groupId,
    name: data.name,
    memberCount: data.memberCount || 0,
  }
}

/**
 * List groups
 */
export async function listGroups(token: string): Promise<GroupInfo[]> {
  const response = await authenticatedRequest('/api/groups', token)

  if (!response.ok) {
    if (response.status === 404) return []
    const error = await response.text()
    throw new Error(`Failed to list groups: ${error}`)
  }

  const data = await response.json()
  return data.groups || data || []
}

// ==================== Test Result Tracking ====================

export interface TestResult {
  name: string
  passed: boolean
  duration: number
  error?: string
}

export class TestTracker {
  private results: TestResult[] = []
  private startTime: number = 0

  startTest(name: string): void {
    this.startTime = Date.now()
  }

  endTest(name: string, passed: boolean, error?: string): void {
    this.results.push({
      name,
      passed,
      duration: Date.now() - this.startTime,
      error,
    })
  }

  getSummary(): { total: number; passed: number; failed: number; results: TestResult[] } {
    const passed = this.results.filter(r => r.passed).length
    return {
      total: this.results.length,
      passed,
      failed: this.results.length - passed,
      results: this.results,
    }
  }

  printSummary(): void {
    const { total, passed, failed, results } = this.getSummary()
    console.log('\n' + '='.repeat(60))
    console.log('TEST SUMMARY')
    console.log('='.repeat(60))
    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`)
    console.log('-'.repeat(60))

    for (const result of results) {
      const status = result.passed ? '✅' : '❌'
      const duration = `${result.duration}ms`
      console.log(`${status} ${result.name} (${duration})`)
      if (result.error) {
        console.log(`   Error: ${result.error}`)
      }
    }
    console.log('='.repeat(60))
  }
}

// Jest setup
beforeAll(async () => {
  // Wait for deployment to be ready
  const ready = await isDeploymentReady()
  if (!ready) {
    console.warn(`
      ⚠️  Deployment not reachable at ${config.apiUrl}

      Make sure the k8s deployment is running:
        kubectl get pods -n essi-studio

      Or set TEST_API_URL environment variable to point to your deployment.
    `)
  }
}, config.timeout)
