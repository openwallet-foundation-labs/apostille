// Typed notification primitives for WS-only delivery

import { BasicMessageEventTypes } from '@credo-ts/core'
import { CredentialEventTypes } from '@credo-ts/core'
import { ProofEventTypes } from '@credo-ts/core'
import { AgentEventTypes } from '@credo-ts/core'
import { WorkflowEventTypes } from '@ajna-inc/workflow/build/WorkflowEvents'
import { SigningEventTypes } from '@ajna-inc/signing'

export type NotificationType =
  | 'AppMessageReceived'
  | 'AppMessageSent'
  | typeof AgentEventTypes.AgentMessageReceived
  | typeof AgentEventTypes.AgentMessageProcessed
  | typeof BasicMessageEventTypes.BasicMessageStateChanged
  | typeof CredentialEventTypes.CredentialStateChanged
  | typeof ProofEventTypes.ProofStateChanged
  | WorkflowEventTypes.WorkflowInstanceStateChanged
  | WorkflowEventTypes.WorkflowInstanceStatusChanged
  | WorkflowEventTypes.WorkflowInstanceCompleted
  | SigningEventTypes.SigningStateChanged
  // WebRTC call signaling events
  | 'WebRTCIncomingOffer'
  | 'WebRTCIncomingAnswer'
  | 'WebRTCIncomingIce'
  | 'WebRTCCallEnded'
  // POE events
  | 'PoeStateChanged'
  | 'PoeRequestReceived'
  | 'PoeSubmitReceived'
  | 'PoeCompleted'

// Build a concrete list for validation from the enums
export const NOTIFICATION_TYPES = [
  'AppMessageReceived',
  'AppMessageSent',
  AgentEventTypes.AgentMessageReceived,
  AgentEventTypes.AgentMessageProcessed,
  BasicMessageEventTypes.BasicMessageStateChanged,
  CredentialEventTypes.CredentialStateChanged,
  ProofEventTypes.ProofStateChanged,
  WorkflowEventTypes.WorkflowInstanceStateChanged,
  WorkflowEventTypes.WorkflowInstanceStatusChanged,
  WorkflowEventTypes.WorkflowInstanceCompleted,
  SigningEventTypes.SigningStateChanged,
  // WebRTC call signaling events
  'WebRTCIncomingOffer',
  'WebRTCIncomingAnswer',
  'WebRTCIncomingIce',
  'WebRTCCallEnded',
  // POE events
  'PoeStateChanged',
  'PoeRequestReceived',
  'PoeSubmitReceived',
  'PoeCompleted',
] as const satisfies readonly NotificationType[]

export type NotificationPayload<T = unknown> = {
  v: 1
  id: string
  type: NotificationType
  tenantId: string
  createdAt: string
  data: T
}
