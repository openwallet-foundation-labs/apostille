// Workflow Builder Constants

// Action Type URIs
export const ACTION_TYPE_URIS = {
  STATE_SET: 'https://didcomm.org/workflow/actions/state:set@1',
  CREDENTIAL_OFFER: 'https://didcomm.org/issue-credential/2.0/offer-credential',
  CREDENTIAL_PROPOSE: 'https://didcomm.org/issue-credential/2.0/propose-credential',
  CREDENTIAL_REQUEST: 'https://didcomm.org/issue-credential/2.0/request-credential',
  CREDENTIAL_ISSUE: 'https://didcomm.org/issue-credential/2.0/issue-credential',
  PROOF_REQUEST: 'https://didcomm.org/present-proof/2.0/request-presentation',
} as const

export type ActionTypeURI = typeof ACTION_TYPE_URIS[keyof typeof ACTION_TYPE_URIS]

// Friendly names for action types
export const ACTION_TYPE_LABELS: Record<ActionTypeURI, string> = {
  [ACTION_TYPE_URIS.STATE_SET]: 'Set Context',
  [ACTION_TYPE_URIS.CREDENTIAL_OFFER]: 'Offer Credential',
  [ACTION_TYPE_URIS.CREDENTIAL_PROPOSE]: 'Propose Credential',
  [ACTION_TYPE_URIS.CREDENTIAL_REQUEST]: 'Request Credential',
  [ACTION_TYPE_URIS.CREDENTIAL_ISSUE]: 'Issue Credential',
  [ACTION_TYPE_URIS.PROOF_REQUEST]: 'Request Proof',
}

// Action categories for sidebar
export const ACTION_CATEGORIES = {
  STATE: [ACTION_TYPE_URIS.STATE_SET],
  CREDENTIAL: [
    ACTION_TYPE_URIS.CREDENTIAL_OFFER,
    ACTION_TYPE_URIS.CREDENTIAL_PROPOSE,
    ACTION_TYPE_URIS.CREDENTIAL_REQUEST,
    ACTION_TYPE_URIS.CREDENTIAL_ISSUE,
  ],
  PROOF: [ACTION_TYPE_URIS.PROOF_REQUEST],
} as const

// UI Element Types
export const UI_ELEMENT_TYPES = [
  'text',
  'button',
  'submit-button',
  'card',
  'container',
  'divider',
  'spacer',
  'list',
  'table',
  'badge',
  'image',
  'video',
] as const

export type UIElementType = typeof UI_ELEMENT_TYPES[number]

// UI Element Labels
export const UI_ELEMENT_LABELS: Record<UIElementType, string> = {
  text: 'Text',
  button: 'Button',
  'submit-button': 'Submit Button',
  card: 'Card',
  container: 'Container',
  divider: 'Divider',
  spacer: 'Spacer',
  list: 'List',
  table: 'Table',
  badge: 'Badge',
  image: 'Image',
  video: 'Video',
}

// UI Element Icons (icon names from your icon library)
export const UI_ELEMENT_ICONS: Record<UIElementType, string> = {
  text: 'Type',
  button: 'MousePointer',
  'submit-button': 'Send',
  card: 'Square',
  container: 'Box',
  divider: 'Minus',
  spacer: 'Space',
  list: 'List',
  table: 'Table',
  badge: 'Tag',
  image: 'Image',
  video: 'Video',
}

// State Type Colors
export const STATE_TYPE_COLORS = {
  start: '#22c55e', // green-500
  normal: '#3b82f6', // blue-500
  final: '#a855f7', // purple-500
} as const

// State Node Colors (full color scheme for card-based nodes)
export const NODE_COLORS = {
  start: {
    border: '#22c55e',      // green-500
    headerBg: '#14532d',    // green-900
    headerText: '#86efac',  // green-300
  },
  normal: {
    border: '#3b82f6',      // blue-500
    headerBg: '#1e3a8a',    // blue-900
    headerText: '#93c5fd',  // blue-300
  },
  final: {
    border: '#a855f7',      // purple-500
    headerBg: '#581c87',    // purple-900
    headerText: '#d8b4fe',  // purple-300
  },
} as const

// Edge Colors
export const EDGE_COLORS = {
  normal: '#64748b',        // slate-500
  guarded: '#f59e0b',       // amber-500
  action: '#22c55e',        // green-500
  selected: '#a78bfa',      // violet-400
} as const

// Badge Colors for feature indicators
export const BADGE_COLORS = {
  section: '#6366f1',       // indigo-500
  form: '#06b6d4',          // cyan-500
  credential: '#22c55e',    // green-500
  proof: '#3b82f6',         // blue-500
  guard: '#f59e0b',         // amber-500
  action: '#8b5cf6',        // violet-500
} as const

// State Type Icons
export const STATE_TYPE_ICONS = {
  start: 'play',
  normal: 'circle',
  final: 'checkCircle',
} as const

// Default empty template
export const DEFAULT_TEMPLATE = {
  template_id: 'new-workflow',
  version: '1.0.0',
  title: 'New Workflow',
  instance_policy: { mode: 'multi_per_connection' as const },
  sections: [{ name: 'Main' }],
  states: [
    { name: 'start', type: 'start' as const, section: 'Main' },
    { name: 'done', type: 'final' as const, section: 'Main' },
  ],
  transitions: [
    { from: 'start', to: 'done', on: 'finish' },
  ],
  catalog: {},
  actions: [],
  display_hints: {
    ui_version: '1.0',
    profiles: {
      sender: { states: {} },
      receiver: { states: {} },
    },
  },
}

// Canvas constants
export const CANVAS_CONFIG = {
  MIN_ZOOM: 0.2,
  MAX_ZOOM: 3,
  DEFAULT_ZOOM: 1,
  // New card-based node dimensions
  NODE_WIDTH: 180,
  NODE_HEIGHT: 88,
  NODE_HEADER_HEIGHT: 24,
  NODE_BORDER_RADIUS: 8,
  NODE_ACCENT_WIDTH: 4,
  // Legacy (for backward compatibility)
  NODE_RADIUS: 30,
  EDGE_ARROW_SIZE: 10,
  GRID_SIZE: 32,
} as const

// Layout constants for ELK (adjusted for larger card-based nodes)
export const ELK_LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '80',
  'elk.layered.spacing.nodeNodeBetweenLayers': '120',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.layered.nodePlacement.strategy': 'SIMPLE',
} as const

// Profile names
export const PROFILE_NAMES = ['sender', 'receiver'] as const
export type ProfileName = typeof PROFILE_NAMES[number]

// Attribute source types
export const ATTRIBUTE_SOURCES = ['context', 'static', 'compute'] as const
export type AttributeSource = typeof ATTRIBUTE_SOURCES[number]
