/**
 * Feature detection utilities for workflow states
 * Analyzes workflow template to determine what features each state has
 */

import { WorkflowTemplate, TransitionDef, ActionDef } from '@/lib/workflow-builder/types'

export interface StateFeatures {
  hasForm: boolean           // Has submit-button with input_schema
  hasCredential: boolean     // References credential actions
  hasProof: boolean          // References proof actions
  hasGuardedExit: boolean    // Outgoing transition has guard
  hasActionExit: boolean     // Outgoing transition has action
  section?: string           // Section name
  incomingCount: number      // Number of incoming transitions
  outgoingCount: number      // Number of outgoing transitions
}

export interface TransitionFeatures {
  hasGuard: boolean
  hasAction: boolean
  actionType?: 'credential' | 'proof' | 'state' | 'other'
  isSelfLoop: boolean
}

// Action type categories
const CREDENTIAL_ACTIONS = [
  'offer-credential',
  'propose-credential',
  'request-credential',
  'issue-credential',
  'accept-credential',
  'decline-credential',
]

const PROOF_ACTIONS = [
  'request-presentation',
  'present-proof',
  'accept-presentation',
  'decline-presentation',
]

const STATE_ACTIONS = [
  'state:set@1',
]

/**
 * Detect features for a specific state
 */
export function detectStateFeatures(
  stateName: string,
  template: WorkflowTemplate
): StateFeatures {
  const state = template.states.find(s => s.name === stateName)

  const features: StateFeatures = {
    hasForm: false,
    hasCredential: false,
    hasProof: false,
    hasGuardedExit: false,
    hasActionExit: false,
    section: state?.section,
    incomingCount: 0,
    outgoingCount: 0,
  }

  // Check display hints for form (submit-button with input_schema)
  if (template.display_hints?.states?.[stateName]) {
    features.hasForm = hasFormInElements(template.display_hints.states[stateName])
  }

  // Check profile-specific display hints
  if (template.display_hints?.profiles) {
    const senderStates = template.display_hints.profiles.sender?.states?.[stateName]
    const receiverStates = template.display_hints.profiles.receiver?.states?.[stateName]

    if (senderStates && hasFormInElements(senderStates)) {
      features.hasForm = true
    }
    if (receiverStates && hasFormInElements(receiverStates)) {
      features.hasForm = true
    }
  }

  // Analyze transitions
  const outgoingTransitions = template.transitions.filter(t => t.from === stateName)
  const incomingTransitions = template.transitions.filter(t => t.to === stateName)

  features.outgoingCount = outgoingTransitions.length
  features.incomingCount = incomingTransitions.length

  for (const transition of outgoingTransitions) {
    if (transition.guard) {
      features.hasGuardedExit = true
    }
    if (transition.action) {
      features.hasActionExit = true
      const actionDef = template.actions.find(a => a.key === transition.action)
      if (actionDef) {
        if (isCredentialAction(actionDef)) {
          features.hasCredential = true
        }
        if (isProofAction(actionDef)) {
          features.hasProof = true
        }
      }
    }
  }

  // Also check actions that reference credential/proof profiles
  for (const action of template.actions) {
    if (action.profile_ref) {
      if (template.catalog.credential_profiles?.[action.profile_ref]) {
        // Check if this action is used by a transition from this state
        const usedByThisState = outgoingTransitions.some(t => t.action === action.key)
        if (usedByThisState) {
          features.hasCredential = true
        }
      }
      if (template.catalog.proof_profiles?.[action.profile_ref]) {
        const usedByThisState = outgoingTransitions.some(t => t.action === action.key)
        if (usedByThisState) {
          features.hasProof = true
        }
      }
    }
  }

  return features
}

/**
 * Detect features for a transition
 */
export function detectTransitionFeatures(
  transition: TransitionDef,
  template: WorkflowTemplate
): TransitionFeatures {
  const features: TransitionFeatures = {
    hasGuard: !!transition.guard,
    hasAction: !!transition.action,
    isSelfLoop: transition.from === transition.to,
  }

  if (transition.action) {
    const actionDef = template.actions.find(a => a.key === transition.action)
    if (actionDef) {
      features.actionType = getActionType(actionDef)
    }
  }

  return features
}

/**
 * Check if UI elements contain a form (submit-button with input_schema)
 */
function hasFormInElements(elements: unknown[]): boolean {
  if (!Array.isArray(elements)) return false

  for (const element of elements) {
    if (typeof element !== 'object' || element === null) continue

    const el = element as Record<string, unknown>

    if (el.type === 'submit-button' && el.input_schema) {
      return true
    }

    // Recursively check children
    if (Array.isArray(el.children)) {
      if (hasFormInElements(el.children)) {
        return true
      }
    }
  }

  return false
}

/**
 * Check if action is a credential action
 */
function isCredentialAction(action: ActionDef): boolean {
  return CREDENTIAL_ACTIONS.some(type => action.typeURI.includes(type))
}

/**
 * Check if action is a proof action
 */
function isProofAction(action: ActionDef): boolean {
  return PROOF_ACTIONS.some(type => action.typeURI.includes(type))
}

/**
 * Get the category of an action
 */
function getActionType(action: ActionDef): 'credential' | 'proof' | 'state' | 'other' {
  if (isCredentialAction(action)) return 'credential'
  if (isProofAction(action)) return 'proof'
  if (STATE_ACTIONS.some(type => action.typeURI.includes(type))) return 'state'
  return 'other'
}

/**
 * Get all state features for a template
 */
export function getAllStateFeatures(
  template: WorkflowTemplate
): Map<string, StateFeatures> {
  const featuresMap = new Map<string, StateFeatures>()

  for (const state of template.states) {
    featuresMap.set(state.name, detectStateFeatures(state.name, template))
  }

  return featuresMap
}
