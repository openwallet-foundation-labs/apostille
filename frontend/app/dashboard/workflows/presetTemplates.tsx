const applicationApprovalTemplate = {
  template_id: 'credential-application',
  version: '1.0.1',
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
          Name: { source: 'context', path: 'Name', required: true },
          Email: { source: 'context', path: 'Email', required: true },
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
    // Verifier sent request
    { from: 'await_proof', to: 'await_proof', on: 'request_sent' },
    // Holder received request, sent presentation
    { from: 'await_proof', to: 'await_proof', on: 'request_received' },
    { from: 'await_proof', to: 'await_proof', on: 'presentation_sent' },
    // Verifier received presentation → issue credential
    { from: 'await_proof', to: 'issuing', on: 'presentation_received', action: 'offer_new_credential' },
    { from: 'await_proof', to: 'issuing', on: 'verified_ack', action: 'offer_new_credential' },
    // Credential issuance (both sides)
    { from: 'issuing', to: 'issuing', on: 'offer_sent' },
    { from: 'issuing', to: 'issuing', on: 'offer_received', action: 'request_credential' },
    { from: 'issuing', to: 'done', on: 'request_received', action: 'issue_credential' },
    { from: 'issuing', to: 'done', on: 'credential_issued' },
    { from: 'issuing', to: 'done', on: 'credential_received' },
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
    // Issuer side: sent proposal, auto-offered
    { from: 'await_offer', to: 'await_issue', on: 'proposal_sent' },
    { from: 'await_offer', to: 'await_issue', on: 'offer_sent' },
    // Holder side: received proposal/offer
    { from: 'await_offer', to: 'await_issue', on: 'proposal_received', action: 'offer_kanon' },
    { from: 'await_offer', to: 'await_issue', on: 'offer_received' },
    // Issuer side: received request, issue
    { from: 'await_issue', to: 'await_issue', on: 'offer_received', action: 'request_kanon' },
    { from: 'await_issue', to: 'done', on: 'request_received', action: 'issue_kanon' },
    { from: 'await_issue', to: 'done', on: 'credential_issued' },
    { from: 'await_issue', to: 'done', on: 'credential_received' },
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

export const PRESET_TEMPLATES = [
  applicationApprovalTemplate,
  multiStepKycTemplate,
  proofThenIssueTemplate,
  kanonAutoIssueTemplate,
]

export { applicationApprovalTemplate }
