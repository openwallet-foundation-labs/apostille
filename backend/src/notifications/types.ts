// Typed notification primitives for WS-only delivery

import { DidCommBasicMessageEventTypes, DidCommCredentialEventTypes, DidCommEventTypes, DidCommProofEventTypes } from '@credo-ts/didcomm'
import { WorkflowEventTypes } from '@ajna-inc/workflow'
import { SigningEventTypes } from '@ajna-inc/signing'

export type NotificationType =
  | 'AppMessageReceived'
  | 'AppMessageSent'
  | typeof DidCommEventTypes.DidCommMessageReceived
  | typeof DidCommEventTypes.DidCommMessageProcessed
  | typeof DidCommBasicMessageEventTypes.DidCommBasicMessageStateChanged
  | typeof DidCommCredentialEventTypes.DidCommCredentialStateChanged
  | typeof DidCommProofEventTypes.ProofStateChanged
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
  DidCommEventTypes.DidCommMessageReceived,
  DidCommEventTypes.DidCommMessageProcessed,
  DidCommBasicMessageEventTypes.DidCommBasicMessageStateChanged,
  DidCommCredentialEventTypes.DidCommCredentialStateChanged,
  DidCommProofEventTypes.ProofStateChanged,
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
