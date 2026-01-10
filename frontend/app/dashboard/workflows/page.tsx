'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { workflowApi, connectionApi } from '@/lib/api'
import { useAuth } from '../../context/AuthContext'
import { runtimeConfig } from '@/lib/runtimeConfig'
import {
  WorkflowProvider,
  UiProfileProvider,
  useWorkflowStatus,
} from '@ajna-inc/workflow-react'
import dynamic from 'next/dynamic'

// Import new components
import {
  ConnectionContextBar,
  QuickStartCards,
  ActiveInstancePanel,
  TemplatesTable,
  InstancesTable,
} from './components'

// Dynamically import the WorkflowBuilder to avoid SSR issues with Konva
const WorkflowBuilder = dynamic(
  () => import('@/app/components/workflows/builder/WorkflowBuilder').then((mod) => mod.WorkflowBuilder),
  { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center text-text-tertiary">Loading Visual Builder...</div> }
)

// ============================================================================
// WORKFLOW TEMPLATES
// ============================================================================

// Template 1: Application with Approval - Manual approve/reject by issuer
const applicationApprovalTemplate = {
  template_id: 'credential-application',
  version: '1.0.0',
  title: 'Application & Approval',
  instance_policy: { mode: 'multi_per_connection' },
  sections: [{ name: 'Application' }],
  states: [
    { name: 'apply', type: 'start', section: 'Application' },
    { name: 'pending_review', type: 'normal', section: 'Application' },
    { name: 'issuing', type: 'normal', section: 'Application' },
    { name: 'rejected', type: 'final', section: 'Application' },
    { name: 'done', type: 'final', section: 'Application' },
  ],
  transitions: [
    { from: 'apply', to: 'pending_review', on: 'submit', action: 'save_application' },
    { from: 'pending_review', to: 'issuing', on: 'approve', action: 'offer_credential' },
    { from: 'pending_review', to: 'rejected', on: 'reject' },
    { from: 'issuing', to: 'issuing', on: 'offer_received', action: 'request_credential' },
    { from: 'issuing', to: 'done', on: 'request_received', action: 'issue_credential' },
    { from: 'issuing', to: 'done', on: 'issued_ack' },
  ],
  catalog: {
    credential_profiles: {
      approved_cred: {
        cred_def_id: 'REPLACE_WITH_CRED_DEF_ID',
        to_ref: 'holder',
        attribute_plan: {
          Name: { source: 'context', path: 'application.Name', required: true },
          Email: { source: 'context', path: 'application.Email', required: true },
          Status: { source: 'static', value: 'Approved' },
        },
        options: { comment: 'Approved credential' },
      },
    },
  },
  actions: [
    { key: 'save_application', typeURI: 'https://didcomm.org/workflow/actions/state:set@1', staticInput: '{{ input.application }}' },
    { key: 'offer_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/offer-credential', profile_ref: 'cp.approved_cred' },
    { key: 'request_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/request-credential', profile_ref: 'cp.approved_cred' },
    { key: 'issue_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/issue-credential', profile_ref: 'cp.approved_cred' },
  ],
  display_hints: {
    ui_version: '1.0',
    profiles: {
      sender: {
        states: {
          apply: [{ type: 'text', text: 'Waiting for applicant to submit application...' }],
          pending_review: [
            { type: 'text', text: 'Review the application and approve or reject.' },
            { type: 'submit-button', label: 'Approve', event: 'approve' },
            { type: 'submit-button', label: 'Reject', event: 'reject' },
          ],
          issuing: [{ type: 'text', text: 'Issuing credential...' }],
          rejected: [{ type: 'text', text: 'Application was rejected.' }],
          done: [{ type: 'text', text: 'Credential issued successfully.' }],
        },
      },
      receiver: {
        states: {
          apply: [{
            type: 'submit-button',
            label: 'Submit Application',
            event: 'submit',
            input_schema: {
              type: 'object',
              required: ['application'],
              properties: {
                application: {
                  type: 'object',
                  required: ['Name', 'Email'],
                  properties: {
                    Name: { type: 'string', title: 'Full Name' },
                    Email: { type: 'string', title: 'Email Address' },
                  },
                },
              },
            },
          }],
          pending_review: [{ type: 'text', text: 'Your application is under review...' }],
          issuing: [{ type: 'text', text: 'Your application was approved! Receiving credential...' }],
          rejected: [{ type: 'text', text: 'Sorry, your application was rejected.' }],
          done: [{ type: 'text', text: 'Credential received!' }],
        },
      },
    },
  },
}

// Template 2: Multi-Step Data Collection with back navigation
const multiStepKycTemplate = {
  template_id: 'multi-step-kyc',
  version: '1.0.0',
  title: 'Multi-Step KYC',
  instance_policy: { mode: 'multi_per_connection' },
  sections: [
    { name: 'Personal' },
    { name: 'Address' },
    { name: 'Documents' },
    { name: 'Review' },
  ],
  states: [
    { name: 'collect_personal', type: 'start', section: 'Personal' },
    { name: 'collect_address', type: 'normal', section: 'Address' },
    { name: 'collect_documents', type: 'normal', section: 'Documents' },
    { name: 'review', type: 'normal', section: 'Review' },
    { name: 'issuing', type: 'normal', section: 'Review' },
    { name: 'done', type: 'final', section: 'Review' },
  ],
  transitions: [
    { from: 'collect_personal', to: 'collect_address', on: 'next', action: 'save_personal' },
    { from: 'collect_address', to: 'collect_documents', on: 'next', action: 'save_address' },
    { from: 'collect_documents', to: 'review', on: 'next', action: 'save_documents' },
    { from: 'review', to: 'issuing', on: 'confirm', action: 'propose_credential' },
    { from: 'collect_address', to: 'collect_personal', on: 'back' },
    { from: 'collect_documents', to: 'collect_address', on: 'back' },
    { from: 'review', to: 'collect_documents', on: 'back' },
    { from: 'issuing', to: 'issuing', on: 'proposal_received', action: 'offer_credential' },
    { from: 'issuing', to: 'issuing', on: 'offer_received', action: 'request_credential' },
    { from: 'issuing', to: 'done', on: 'request_received', action: 'issue_credential' },
    { from: 'issuing', to: 'done', on: 'issued_ack' },
  ],
  catalog: {
    credential_profiles: {
      kyc_cred: {
        cred_def_id: 'REPLACE_WITH_CRED_DEF_ID',
        to_ref: 'holder',
        attribute_plan: {
          FullName: { source: 'context', path: 'personal.FullName', required: true },
          DateOfBirth: { source: 'context', path: 'personal.DateOfBirth', required: true },
          Address: { source: 'context', path: 'address.StreetAddress', required: true },
          City: { source: 'context', path: 'address.City', required: true },
          Country: { source: 'context', path: 'address.Country', required: true },
          IdNumber: { source: 'context', path: 'documents.IdNumber', required: true },
        },
        options: { comment: 'KYC Credential' },
      },
    },
  },
  actions: [
    { key: 'save_personal', typeURI: 'https://didcomm.org/workflow/actions/state:set@1', staticInput: '{{ input.personal }}' },
    { key: 'save_address', typeURI: 'https://didcomm.org/workflow/actions/state:set@1', staticInput: '{{ input.address }}' },
    { key: 'save_documents', typeURI: 'https://didcomm.org/workflow/actions/state:set@1', staticInput: '{{ input.documents }}' },
    { key: 'propose_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/propose-credential', profile_ref: 'cp.kyc_cred' },
    { key: 'offer_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/offer-credential', profile_ref: 'cp.kyc_cred' },
    { key: 'request_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/request-credential', profile_ref: 'cp.kyc_cred' },
    { key: 'issue_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/issue-credential', profile_ref: 'cp.kyc_cred' },
  ],
  display_hints: {
    ui_version: '1.0',
    profiles: {
      sender: {
        states: {
          collect_personal: [{ type: 'text', text: 'Holder entering personal info...' }],
          collect_address: [{ type: 'text', text: 'Holder entering address...' }],
          collect_documents: [{ type: 'text', text: 'Holder entering documents...' }],
          review: [{ type: 'text', text: 'Holder reviewing submission...' }],
          issuing: [{ type: 'text', text: 'Auto-issuing credential...' }],
          done: [{ type: 'text', text: 'Credential issued.' }],
        },
      },
      receiver: {
        states: {
          collect_personal: [{
            type: 'submit-button',
            label: 'Next',
            event: 'next',
            input_schema: {
              type: 'object',
              required: ['personal'],
              properties: {
                personal: {
                  type: 'object',
                  required: ['FullName', 'DateOfBirth'],
                  properties: {
                    FullName: { type: 'string', title: 'Full Name' },
                    DateOfBirth: { type: 'string', title: 'Date of Birth' },
                  },
                },
              },
            },
          }],
          collect_address: [
            { type: 'submit-button', label: 'Back', event: 'back' },
            {
              type: 'submit-button',
              label: 'Next',
              event: 'next',
              input_schema: {
                type: 'object',
                required: ['address'],
                properties: {
                  address: {
                    type: 'object',
                    required: ['StreetAddress', 'City', 'Country'],
                    properties: {
                      StreetAddress: { type: 'string', title: 'Street Address' },
                      City: { type: 'string', title: 'City' },
                      Country: { type: 'string', title: 'Country' },
                    },
                  },
                },
              },
            },
          ],
          collect_documents: [
            { type: 'submit-button', label: 'Back', event: 'back' },
            {
              type: 'submit-button',
              label: 'Next',
              event: 'next',
              input_schema: {
                type: 'object',
                required: ['documents'],
                properties: {
                  documents: {
                    type: 'object',
                    required: ['IdNumber'],
                    properties: {
                      IdNumber: { type: 'string', title: 'ID/Passport Number' },
                    },
                  },
                },
              },
            },
          ],
          review: [
            { type: 'text', text: 'Review your information before submitting.' },
            { type: 'submit-button', label: 'Back', event: 'back' },
            { type: 'submit-button', label: 'Submit & Get Credential', event: 'confirm' },
          ],
          issuing: [{ type: 'text', text: 'Processing your credential...' }],
          done: [{ type: 'text', text: 'KYC Credential received!' }],
        },
      },
    },
  },
}

// Template 3: Proof Prerequisite for Issuance
const proofThenIssueTemplate = {
  template_id: 'proof-then-issue',
  version: '1.0.0',
  title: 'Proof → Credential',
  instance_policy: { mode: 'multi_per_connection' },
  sections: [{ name: 'Verification' }],
  states: [
    { name: 'start', type: 'start', section: 'Verification' },
    { name: 'await_proof', type: 'normal', section: 'Verification' },
    { name: 'issuing', type: 'normal', section: 'Verification' },
    { name: 'done', type: 'final', section: 'Verification' },
    { name: 'failed', type: 'final', section: 'Verification' },
  ],
  transitions: [
    { from: 'start', to: 'await_proof', on: 'request_proof', action: 'send_proof_request' },
    { from: 'await_proof', to: 'issuing', on: 'presentation_received', action: 'offer_new_credential' },
    { from: 'await_proof', to: 'issuing', on: 'verified_ack', action: 'offer_new_credential' },
    { from: 'issuing', to: 'issuing', on: 'offer_received', action: 'request_credential' },
    { from: 'issuing', to: 'done', on: 'request_received', action: 'issue_credential' },
    { from: 'issuing', to: 'done', on: 'issued_ack' },
    { from: 'await_proof', to: 'failed', on: 'proof_failed' },
  ],
  catalog: {
    proof_profiles: {
      identity_proof: {
        cred_def_id: 'REPLACE_WITH_REQUIRED_CRED_DEF_ID',
        requested_attributes: ['Name', 'DateOfBirth'],
        to_ref: 'holder',
        options: { comment: 'Please present your identity credential' },
      },
    },
    credential_profiles: {
      new_credential: {
        cred_def_id: 'REPLACE_WITH_NEW_CRED_DEF_ID',
        to_ref: 'holder',
        attribute_plan: {
          HolderName: { source: 'context', path: 'verified.Name', required: true },
          VerifiedDate: { source: 'compute', expr: 'now' },
          Status: { source: 'static', value: 'Verified' },
        },
        options: { comment: 'Credential based on verified proof' },
      },
    },
  },
  actions: [
    { key: 'send_proof_request', typeURI: 'https://didcomm.org/present-proof/2.0/request-presentation', profile_ref: 'pp.identity_proof' },
    { key: 'offer_new_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/offer-credential', profile_ref: 'cp.new_credential' },
    { key: 'request_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/request-credential', profile_ref: 'cp.new_credential' },
    { key: 'issue_credential', typeURI: 'https://didcomm.org/issue-credential/2.0/issue-credential', profile_ref: 'cp.new_credential' },
  ],
  display_hints: {
    ui_version: '1.0',
    profiles: {
      sender: {
        states: {
          start: [
            { type: 'text', text: 'Start by requesting proof from holder.' },
            { type: 'submit-button', label: 'Request Proof', event: 'request_proof' },
          ],
          await_proof: [{ type: 'text', text: 'Waiting for holder to present proof...' }],
          issuing: [{ type: 'text', text: 'Proof verified! Issuing new credential...' }],
          done: [{ type: 'text', text: 'New credential issued based on verified proof.' }],
          failed: [{ type: 'text', text: 'Proof verification failed.' }],
        },
      },
      receiver: {
        states: {
          start: [{ type: 'text', text: 'Waiting for proof request...' }],
          await_proof: [{ type: 'text', text: 'Please present your credential proof in your wallet.' }],
          issuing: [{ type: 'text', text: 'Proof accepted! Receiving new credential...' }],
          done: [{ type: 'text', text: 'New credential received!' }],
          failed: [{ type: 'text', text: 'Proof was not accepted.' }],
        },
      },
    },
  },
}

// Template 4: Auto-Issue on Request
const kanonAutoIssueTemplate = {
  template_id: 'kanon-auto-issue-on-request',
  version: '1.0.0',
  title: 'Auto-Issue',
  instance_policy: { mode: 'multi_per_connection' },
  sections: [{ name: 'Main' }],
  states: [
    { name: 'collect', type: 'start', section: 'Main' },
    { name: 'confirm', type: 'normal', section: 'Main' },
    { name: 'await_offer', type: 'normal', section: 'Main' },
    { name: 'await_issue', type: 'normal', section: 'Main' },
    { name: 'done', type: 'final', section: 'Main' },
  ],
  transitions: [
    { from: 'collect', to: 'confirm', on: 'next', action: 'set_context' },
    { from: 'confirm', to: 'await_offer', on: 'propose', action: 'propose_kanon' },
    { from: 'await_offer', to: 'await_issue', on: 'proposal_received', action: 'offer_kanon' },
    { from: 'await_issue', to: 'await_issue', on: 'offer_received', action: 'request_kanon' },
    { from: 'await_issue', to: 'done', on: 'request_received', action: 'issue_kanon' },
    { from: 'await_issue', to: 'done', on: 'issued_ack' },
  ],
  catalog: {
    credential_profiles: {
      kanon_id: {
        cred_def_id: 'REPLACE_WITH_DID_KANON_CRED_DEF_ID',
        to_ref: 'holder',
        attribute_plan: {
          Name: { source: 'context', path: 'Name', required: true },
          Institution: { source: 'context', path: 'Institution', required: true },
          Id: { source: 'context', path: 'Id', required: true },
        },
        options: { comment: 'Kanon auto-issue' },
      },
    },
  },
  actions: [
    { key: 'set_context', typeURI: 'https://didcomm.org/workflow/actions/state:set@1', staticInput: '{{ input.profile }}' },
    { key: 'propose_kanon', typeURI: 'https://didcomm.org/issue-credential/2.0/propose-credential', profile_ref: 'cp.kanon_id' },
    { key: 'offer_kanon', typeURI: 'https://didcomm.org/issue-credential/2.0/offer-credential', profile_ref: 'cp.kanon_id' },
    { key: 'request_kanon', typeURI: 'https://didcomm.org/issue-credential/2.0/request-credential', profile_ref: 'cp.kanon_id' },
    { key: 'issue_kanon', typeURI: 'https://didcomm.org/issue-credential/2.0/issue-credential', profile_ref: 'cp.kanon_id' },
  ],
  display_hints: {
    ui_version: '1.0',
    profiles: {
      sender: {
        states: {
          collect: [{ type: 'text', text: 'User is entering their details...' }],
          confirm: [{ type: 'text', text: 'User is reviewing their details...' }],
          await_offer: [{ type: 'text', text: 'Responding to proposal...' }],
          await_issue: [{ type: 'text', text: 'Issuing credential automatically...' }],
          done: [{ type: 'text', text: 'Credential issuance completed.' }],
        },
      },
      receiver: {
        states: {
          collect: [{
            type: 'submit-button',
            label: 'Next',
            event: 'next',
            input_schema: {
              type: 'object',
              required: ['profile'],
              properties: {
                profile: {
                  type: 'object',
                  required: ['Name', 'Institution', 'Id'],
                  properties: {
                    Name: { type: 'string', title: 'Full Name' },
                    Institution: { type: 'string', title: 'Institution' },
                    Id: { type: 'string', title: 'ID Number' },
                  },
                },
              },
            },
          }],
          confirm: [
            { type: 'text', text: 'Review your details and send the credential request.' },
            { type: 'submit-button', label: 'Send Request', event: 'propose' },
          ],
          await_offer: [{ type: 'text', text: 'Waiting for issuer offer...' }],
          await_issue: [{ type: 'text', text: 'Requesting credential...' }],
          done: [{ type: 'text', text: 'Credential received.' }],
        },
      },
    },
  },
}

// All preset templates
const PRESET_TEMPLATES = [
  applicationApprovalTemplate,
  multiStepKycTemplate,
  proofThenIssueTemplate,
  kanonAutoIssueTemplate,
]

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export default function WorkflowsPage() {
  const { token } = useAuth()
  const baseUrl = runtimeConfig.API_URL
  return (
    <WorkflowProvider baseUrl={baseUrl} token={token || undefined}>
      <UiProfileProvider initial={undefined}>
        <WorkflowsContent />
      </UiProfileProvider>
    </WorkflowProvider>
  )
}

// ============================================================================
// WORKFLOWS CONTENT
// ============================================================================

interface TemplateListItem {
  id: string
  template_id: string
  version: string
  title: string
  createdAt: string
  hash?: string
}

interface Instance {
  id: string
  instance_id: string
  template_id: string
  template_version?: string
  connection_id?: string
  state: string
  section?: string
  status: string
  createdAt: string
  updatedAt?: string
}

function WorkflowsContent() {
  const { isAuthenticated } = useAuth()

  // Connection state
  const [connections, setConnections] = useState<{ id: string; theirLabel?: string; state?: string; theirDid?: string }[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')
  const [discovering, setDiscovering] = useState(false)

  // Templates state
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  // Instances state
  const [instances, setInstances] = useState<Instance[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)

  // Active instance state
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null)

  // Builder state
  const [showBuilder, setShowBuilder] = useState(false)
  const [templateJson, setTemplateJson] = useState(() => JSON.stringify(applicationApprovalTemplate, null, 2))

  // Error/success state
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Get instance status using the hook
  const { status: instanceStatus, loading: statusLoading, refresh: refreshStatus } = useWorkflowStatus(
    activeInstanceId || undefined,
    { includeActions: true }
  )

  // Parse template for active instance
  const activeTemplate = useMemo(() => {
    const status = instanceStatus as any
    if (!status?.template_id) return null
    // Try to find in published templates or presets
    const published = templates.find(t => t.template_id === status.template_id)
    if (published) {
      // Would need to fetch full template - for now use preset if available
      const preset = PRESET_TEMPLATES.find(p => p.template_id === status.template_id)
      return preset || null
    }
    return PRESET_TEMPLATES.find(p => p.template_id === status.template_id) || null
  }, [(instanceStatus as any)?.template_id, templates])

  // Get connection label for active instance
  const activeConnectionLabel = useMemo(() => {
    if (!activeInstanceId) return undefined
    const instance = instances.find(i => i.instance_id === activeInstanceId)
    if (!instance?.connection_id) return undefined
    const conn = connections.find(c => c.id === instance.connection_id)
    return conn?.theirLabel || undefined
  }, [activeInstanceId, instances, connections])

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadConnections = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const response = await connectionApi.getAll()
      const list = response.connections ?? []
      setConnections(list)
      // Auto-select first completed connection
      if (!selectedConnectionId && list.length > 0) {
        const completed = list.find((c: any) => c.state === 'completed' || c.state === 'complete')
        setSelectedConnectionId(completed?.id || list[0].id)
      }
    } catch (err) {
      console.error('Failed to load connections:', err)
    }
  }, [isAuthenticated, selectedConnectionId])

  const loadTemplates = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingTemplates(true)
    try {
      const response = await workflowApi.listTemplates()
      setTemplates(response.templates ?? [])
    } catch (err) {
      console.error('Failed to fetch workflow templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }, [isAuthenticated])

  const loadInstances = useCallback(async (connId?: string) => {
    if (!isAuthenticated) return
    setLoadingInstances(true)
    try {
      const response = await workflowApi.listInstances(connId)
      setInstances(response.instances ?? [])
    } catch (err) {
      console.error('Failed to load workflow instances:', err)
    } finally {
      setLoadingInstances(false)
    }
  }, [isAuthenticated])

  // Initial load
  useEffect(() => {
    loadConnections()
    loadTemplates()
  }, [loadConnections, loadTemplates])

  // Load instances when connection changes
  useEffect(() => {
    loadInstances(selectedConnectionId || undefined)
  }, [selectedConnectionId, loadInstances])

  // ============================================================================
  // ACTIONS
  // ============================================================================

  const handleDiscover = async () => {
    if (!selectedConnectionId) {
      setError('Select a connection first')
      return
    }
    setDiscovering(true)
    setError(null)
    try {
      await workflowApi.discoverTemplates(selectedConnectionId)
      await loadTemplates()
      setSuccess('Templates discovered successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError((err as Error).message || 'Failed to discover templates')
    } finally {
      setDiscovering(false)
    }
  }

  const handleRefresh = async () => {
    await Promise.all([
      loadTemplates(),
      loadInstances(selectedConnectionId || undefined),
    ])
  }

  const handleStartWorkflow = async (template: any) => {
    if (!selectedConnectionId) {
      setError('Select a connection first')
      return
    }

    setStartingTemplateId(template.template_id)
    setError(null)

    try {
      // First, publish the template if it's a preset
      const isPreset = PRESET_TEMPLATES.some(p => p.template_id === template.template_id)
      if (isPreset) {
        try {
          await workflowApi.publish(template)
        } catch (e) {
          // Ignore if already published
        }
      }

      // Get holder DID for participants
      let participants: Record<string, { did: string }> | undefined
      try {
        const conn = await connectionApi.getById(selectedConnectionId)
        const theirDid = conn?.connection?.theirDid
        if (theirDid) participants = { holder: { did: theirDid } }
      } catch (_e) {
        // non-blocking
      }

      // Start the instance
      const resp = await workflowApi.start({
        template_id: template.template_id,
        template_version: template.version,
        connection_id: selectedConnectionId,
        ...(participants ? { participants } : {}),
      })

      const instId = resp?.instance?.instance_id
      if (instId) {
        setActiveInstanceId(instId)
        await loadInstances(selectedConnectionId)
        setSuccess('Workflow started successfully')
        setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) {
      console.error('Failed to start instance:', err)
      setError((err as Error).message || 'Failed to start instance')
    } finally {
      setStartingTemplateId(null)
    }
  }

  const handleAdvance = async (event: string, input?: any) => {
    if (!activeInstanceId) return
    setError(null)

    try {
      // Best-effort: ensure the template exists on the counterparty
      try {
        const status = instanceStatus as any
        if (selectedConnectionId && status?.template_id) {
          await workflowApi.ensureTemplate({
            connection_id: selectedConnectionId,
            template_id: status.template_id,
            template_version: status.template_version,
            waitMs: 6000,
          })
        }
      } catch (_e) {
        // ignore
      }

      const idempotency_key = `ui:${event}:${activeInstanceId}:${Date.now()}`
      await workflowApi.advance({ instance_id: activeInstanceId, event, input, idempotency_key })
      await refreshStatus()
    } catch (err) {
      console.error('Advance failed:', err)
      setError((err as Error).message || 'Advance failed')
    }
  }

  const handleEnsureTemplate = async (template: TemplateListItem) => {
    if (!selectedConnectionId) {
      setError('Select a connection first')
      return
    }
    setError(null)
    try {
      await workflowApi.ensureTemplate({
        connection_id: selectedConnectionId,
        template_id: template.template_id,
        template_version: template.version,
        waitMs: 6000,
      })
      setSuccess('Template synced to peer')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError((err as Error).message || 'Failed to sync template')
    }
  }

  const handlePublish = async (json: string) => {
    setError(null)
    try {
      const parsed = JSON.parse(json)
      await workflowApi.publish(parsed)
      await loadTemplates()
      setSuccess(`Template "${parsed.template_id}" published successfully`)
      setTimeout(() => setSuccess(null), 3000)
      setShowBuilder(false)
    } catch (err) {
      setError((err as Error).message || 'Failed to publish template')
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {error && (
        <div className="alert alert-error">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-error-600 hover:text-error-800 p-1 hover:bg-error-100 rounded">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{success}</span>
        </div>
      )}

      {/* Connection Context Bar */}
      <ConnectionContextBar
        connections={connections}
        selectedConnectionId={selectedConnectionId}
        onConnectionChange={setSelectedConnectionId}
        onDiscover={handleDiscover}
        onRefresh={handleRefresh}
        discovering={discovering}
        refreshing={loadingTemplates || loadingInstances}
      />

      {/* Quick Start Cards */}
      <QuickStartCards
        templates={PRESET_TEMPLATES as any}
        onStart={handleStartWorkflow}
        onCustomize={(template) => {
          setTemplateJson(JSON.stringify(template, null, 2))
          setShowBuilder(true)
        }}
        onCreateCustom={() => {
          setTemplateJson(JSON.stringify(applicationApprovalTemplate, null, 2))
          setShowBuilder(true)
        }}
        disabled={!selectedConnectionId}
        startingTemplateId={startingTemplateId}
      />

      {/* Active Instance Panel */}
      <ActiveInstancePanel
        instanceId={activeInstanceId}
        instanceStatus={instanceStatus}
        template={activeTemplate}
        connectionLabel={activeConnectionLabel}
        onClose={() => setActiveInstanceId(null)}
        onAdvance={handleAdvance}
        onRefresh={refreshStatus}
        loading={statusLoading}
      />

      {/* Published Templates */}
      <TemplatesTable
        templates={templates}
        loading={loadingTemplates}
        onStart={(t) => handleStartWorkflow({ template_id: t.template_id, version: t.version, title: t.title })}
        onEnsure={handleEnsureTemplate}
        onEdit={(t) => {
          // Load template into builder
          const preset = PRESET_TEMPLATES.find(p => p.template_id === t.template_id)
          if (preset) {
            setTemplateJson(JSON.stringify(preset, null, 2))
          }
          setShowBuilder(true)
        }}
        connectionSelected={!!selectedConnectionId}
      />

      {/* Workflow Instances */}
      <InstancesTable
        instances={instances}
        connections={connections}
        loading={loadingInstances}
        activeInstanceId={activeInstanceId}
        onOpen={setActiveInstanceId}
      />

      {/* Template Builder (Collapsible) */}
      {showBuilder && (
        <div className="bg-surface-100 border border-border-primary/30 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-primary/30 bg-surface-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary-100 text-primary-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Template Builder</h2>
                <p className="text-xs text-text-tertiary">Create and customize workflow templates</p>
              </div>
            </div>
            <button
              onClick={() => setShowBuilder(false)}
              className="text-text-tertiary hover:text-text-primary p-2 hover:bg-surface-200 rounded-lg transition-colors"
              title="Close builder"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Preset buttons */}
          <div className="px-5 py-3 bg-surface-50/50 border-b border-border-primary/20 flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-tertiary mr-2">Load preset:</span>
            {PRESET_TEMPLATES.map((t) => (
              <button
                key={t.template_id}
                onClick={() => setTemplateJson(JSON.stringify(t, null, 2))}
                className="text-xs px-3 py-1.5 rounded-lg border border-border-primary/50 text-text-primary hover:bg-surface-200 transition-colors"
              >
                {t.title}
              </button>
            ))}
          </div>

          {/* Visual Builder */}
          <div className="h-[600px]">
            <WorkflowBuilder
              initialJson={templateJson}
              onJsonChange={(json) => setTemplateJson(json)}
              onPublish={handlePublish}
            />
          </div>
        </div>
      )}
    </div>
  )
}
