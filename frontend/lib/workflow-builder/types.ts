// Workflow Builder Type Definitions

// ===== Workflow Template Types =====

export type StateType = 'start' | 'normal' | 'final'

export interface StateDef {
  name: string
  type: StateType
  section?: string
  // Position stored for visual builder
  _x?: number
  _y?: number
}

export interface TransitionDef {
  from: string
  to: string
  on: string
  guard?: string
  action?: string
}

export interface ActionDef {
  key: string
  typeURI: string
  profile_ref?: string
  staticInput?: string | { merge: Record<string, unknown> }
}

export interface AttributeSpec {
  source: 'context' | 'static' | 'compute'
  path?: string
  value?: unknown
  expr?: string
  required?: boolean
}

export interface CredentialProfile {
  cred_def_id: string
  to_ref: string
  attribute_plan: Record<string, AttributeSpec>
  options?: Record<string, unknown>
}

export interface ProofProfile {
  cred_def_id?: string
  schema_id?: string
  requested_attributes?: string[]
  requested_predicates?: Array<{
    name: string
    p_type: string
    p_value: number
  }>
  to_ref: string
  options?: Record<string, unknown>
}

export interface Catalog {
  credential_profiles?: Record<string, CredentialProfile>
  proof_profiles?: Record<string, ProofProfile>
  defaults?: Record<string, unknown>
}

export interface UIElement {
  type: 'text' | 'button' | 'submit-button' | 'card' | 'container' | 'divider' | 'spacer' | 'list' | 'table' | 'badge' | 'image' | 'video'
  text?: string
  label?: string
  event?: string
  enabledWhen?: string
  showWhen?: string
  input_schema?: JsonSchema
  children?: UIElement[]
  title?: string
  items?: string[]
  columns?: Array<{ key: string; label: string }>
  rows?: Array<Record<string, unknown>>
  variant?: string
  src?: string
  alt?: string
  asset?: string
  size?: 'sm' | 'md' | 'lg'
}

export interface JsonSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array'
  required?: string[]
  properties?: Record<string, JsonSchema>
  title?: string
  items?: JsonSchema
}

export interface DisplayHints {
  ui_version?: string
  states?: Record<string, UIElement[]>
  profiles?: {
    sender?: { states?: Record<string, UIElement[]> }
    receiver?: { states?: Record<string, UIElement[]> }
  }
}

export interface SectionDef {
  name: string
  icon?: string
  order?: number
}

export interface InstancePolicy {
  mode: 'singleton_per_connection' | 'multi_per_connection'
  multiplicity_key?: string
}

export interface WorkflowTemplate {
  template_id: string
  version: string
  title: string
  instance_policy: InstancePolicy
  sections?: SectionDef[]
  states: StateDef[]
  transitions: TransitionDef[]
  catalog: Catalog
  actions: ActionDef[]
  display_hints?: DisplayHints
}

// ===== Visual Builder Types =====

export type BuilderNodeType = 'state' | 'action-group' | 'credential-profile' | 'proof-profile' | 'ui-group'

export interface StateNodeData {
  name: string
  stateType: StateType
  section?: string
}

export interface ActionGroupData {
  actions: ActionDef[]
}

export interface ProfileData {
  profileId: string
  profile: CredentialProfile | ProofProfile
  profileType: 'credential' | 'proof'
}

export interface UIGroupData {
  stateName: string
  profileName?: 'sender' | 'receiver'
  elements: UIElement[]
}

export interface BuilderNode {
  id: string
  x: number
  y: number
  type: BuilderNodeType
  data: StateNodeData | ActionGroupData | ProfileData | UIGroupData
}

export interface BuilderEdge {
  id: string
  from: string
  to: string
  data: {
    on: string
    guard?: string
    action?: string
  }
}

// ===== Sidebar Palette Types =====

export type PaletteItemType = 'state' | 'action' | 'credential' | 'proof' | 'ui'

export interface PaletteItem {
  id: string
  type: PaletteItemType
  label: string
  icon: string
  description: string
  defaultData: unknown
}

export interface PaletteCategory {
  id: string
  label: string
  icon: string
  items: PaletteItem[]
  collapsed?: boolean
}

// ===== Drag and Drop Types =====

export interface DragItem {
  type: PaletteItemType
  data: unknown
}

// ===== Selection Types =====

export interface Selection {
  nodes: string[]
  edges: string[]
}

// ===== Canvas Types =====

export interface CanvasState {
  zoom: number
  pan: { x: number; y: number }
}

export type BuilderMode = 'select' | 'drag-drop' | 'connect'

// ===== Backend Data Types =====

export interface CredDefOption {
  id: string
  credentialDefinitionId: string
  tag: string
  schemaId: string
  issuerId: string
  attributes?: string[]
}

export interface SchemaOption {
  id: string
  schemaId: string
  name: string
  version: string
  attrNames: string[]
  issuerId: string
}

export interface ConnectionOption {
  id: string
  theirLabel?: string
  theirDid?: string
  state: string
}

// ===== History Types =====

export interface HistoryEntry {
  template: WorkflowTemplate
  timestamp: number
}
