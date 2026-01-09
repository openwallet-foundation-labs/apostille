import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type {
  WorkflowTemplate,
  BuilderNode,
  BuilderEdge,
  DragItem,
  Selection,
  BuilderMode,
  StateType,
  StateDef,
  TransitionDef,
  ActionDef,
  CredentialProfile,
  ProofProfile,
  UIElement,
  CredDefOption,
  SchemaOption,
  HistoryEntry,
  StateNodeData,
} from './types'
import { DEFAULT_TEMPLATE, CANVAS_CONFIG, ELK_LAYOUT_OPTIONS } from './constants'

export interface BuilderState {
  // Graph model for visual representation
  nodes: BuilderNode[]
  edges: BuilderEdge[]

  // Canvas state
  zoom: number
  pan: { x: number; y: number }
  selection: Selection
  mode: BuilderMode

  // Drag state
  draggingItem: DragItem | null

  // Pending edge creation
  pendingEdgeFrom: string | null
  pendingEdgeAnchor?: number

  // The actual WorkflowTemplate being built
  template: WorkflowTemplate

  // Sync state
  lastJsonSync: number
  jsonSyncPending: boolean

  // Backend data (fetched)
  credentialDefinitions: CredDefOption[]
  schemas: SchemaOption[]

  // UI state
  selectedTab: 'visual' | 'json'
  propertiesPanelOpen: boolean

  // History for undo/redo
  history: HistoryEntry[]
  historyIndex: number
  maxHistory: number
}

export interface BuilderActions {
  // Canvas actions
  setZoom: (z: number) => void
  setPan: (p: { x: number; y: number }) => void
  setSelection: (sel: Selection) => void
  clearSelection: () => void
  setMode: (m: BuilderMode) => void

  // Drag-drop actions
  startDrag: (item: DragItem) => void
  endDrag: () => void
  dropNode: (x: number, y: number) => void

  // State actions
  addState: (type: StateType, x: number, y: number, name?: string) => void
  updateState: (name: string, updates: Partial<StateDef>) => void
  removeState: (name: string) => void
  updateNodePosition: (id: string, x: number, y: number) => void

  // Transition (edge) actions
  beginEdge: (fromStateName: string, anchorDeg?: number) => void
  completeEdge: (toStateName: string, event: string) => void
  cancelEdge: () => void
  updateTransition: (id: string, updates: Partial<TransitionDef>) => void
  removeTransition: (id: string) => void

  // Action definition actions
  addAction: (actionDef: ActionDef) => void
  updateAction: (key: string, updates: Partial<ActionDef>) => void
  removeAction: (key: string) => void

  // Catalog (credentials/proofs) actions
  addCredentialProfile: (profileId: string, profile: CredentialProfile) => void
  updateCredentialProfile: (profileId: string, updates: Partial<CredentialProfile>) => void
  removeCredentialProfile: (profileId: string) => void
  addProofProfile: (profileId: string, profile: ProofProfile) => void
  updateProofProfile: (profileId: string, updates: Partial<ProofProfile>) => void
  removeProofProfile: (profileId: string) => void

  // Display hints actions
  addUIElement: (stateName: string, profile: 'sender' | 'receiver', element: UIElement) => void
  updateUIElement: (stateName: string, profile: 'sender' | 'receiver', index: number, updates: Partial<UIElement>) => void
  removeUIElement: (stateName: string, profile: 'sender' | 'receiver', index: number) => void
  reorderUIElements: (stateName: string, profile: 'sender' | 'receiver', fromIndex: number, toIndex: number) => void

  // Template metadata actions
  updateTemplateMetadata: (updates: Partial<Pick<WorkflowTemplate, 'template_id' | 'version' | 'title'>>) => void
  addSection: (name: string) => void
  removeSection: (name: string) => void

  // Template sync actions
  setTemplate: (template: WorkflowTemplate) => void
  setTemplateFromJson: (json: string) => boolean
  getTemplateJson: () => string
  syncNodesFromTemplate: () => void

  // Layout actions
  autoLayout: () => Promise<void>
  fitToView: (stageWidth: number, stageHeight: number) => void

  // History actions
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // Backend data actions
  setCredentialDefinitions: (defs: CredDefOption[]) => void
  setSchemas: (schemas: SchemaOption[]) => void

  // UI state actions
  setSelectedTab: (tab: 'visual' | 'json') => void
  setPropertiesPanelOpen: (open: boolean) => void

  // Selection helpers
  getSelectedState: () => StateDef | null
  getSelectedTransition: () => TransitionDef | null

  // Delete selection
  deleteSelection: () => void
}

type BuilderStore = BuilderState & BuilderActions

// Helper to generate unique state name
const generateStateName = (states: StateDef[], prefix: string = 'state'): string => {
  const existingNames = new Set(states.map(s => s.name))
  let counter = 1
  let name = prefix
  while (existingNames.has(name)) {
    name = `${prefix}_${counter}`
    counter++
  }
  return name
}

// Helper to convert template to graph nodes
const templateToNodes = (template: WorkflowTemplate): BuilderNode[] => {
  // Use larger spacing for card-based nodes
  const NODE_SPACING_X = CANVAS_CONFIG.NODE_WIDTH + 80
  return template.states.map((state, index) => ({
    id: state.name,
    x: state._x ?? index * NODE_SPACING_X + 80,
    y: state._y ?? 120,
    type: 'state' as const,
    data: {
      name: state.name,
      stateType: state.type,
      section: state.section,
    } as StateNodeData,
  }))
}

// Helper to convert template transitions to edges
const templateToEdges = (template: WorkflowTemplate): BuilderEdge[] => {
  return template.transitions.map((trans, index) => ({
    id: `trans_${index}`,
    from: trans.from,
    to: trans.to,
    data: {
      on: trans.on,
      guard: trans.guard,
      action: trans.action,
    },
  }))
}

export const useBuilderStore = create<BuilderStore>()(
  immer((set, get) => ({
    // Initial state
    nodes: templateToNodes(DEFAULT_TEMPLATE),
    edges: templateToEdges(DEFAULT_TEMPLATE),
    zoom: CANVAS_CONFIG.DEFAULT_ZOOM,
    pan: { x: 0, y: 0 },
    selection: { nodes: [], edges: [] },
    mode: 'select',
    draggingItem: null,
    pendingEdgeFrom: null,
    template: { ...DEFAULT_TEMPLATE },
    lastJsonSync: Date.now(),
    jsonSyncPending: false,
    credentialDefinitions: [],
    schemas: [],
    selectedTab: 'visual',
    propertiesPanelOpen: true,
    history: [],
    historyIndex: -1,
    maxHistory: 50,

    // Canvas actions
    setZoom: (z) => set(s => {
      s.zoom = Math.max(CANVAS_CONFIG.MIN_ZOOM, Math.min(CANVAS_CONFIG.MAX_ZOOM, z))
    }),
    setPan: (p) => set(s => { s.pan = p }),
    setSelection: (sel) => set(s => { s.selection = sel }),
    clearSelection: () => set(s => { s.selection = { nodes: [], edges: [] } }),
    setMode: (m) => set(s => { s.mode = m }),

    // Drag-drop actions
    startDrag: (item) => set(s => {
      s.draggingItem = item
      s.mode = 'drag-drop'
    }),
    endDrag: () => set(s => {
      s.draggingItem = null
      s.mode = 'select'
    }),
    dropNode: (x, y) => {
      const { draggingItem } = get()
      if (!draggingItem) return

      if (draggingItem.type === 'state') {
        const data = draggingItem.data as { type: StateType }
        get().addState(data.type, x, y)
      }
      // Handle other types as needed
      get().endDrag()
    },

    // State actions
    addState: (type, x, y, name) => set(s => {
      const stateName = name || generateStateName(s.template.states, type === 'start' ? 'start' : type === 'final' ? 'done' : 'state')
      const section = s.template.sections?.[0]?.name || 'Main'

      // Add to template
      const stateDef: StateDef = { name: stateName, type, section, _x: x, _y: y }
      s.template.states.push(stateDef)

      // Add visual node
      s.nodes.push({
        id: stateName,
        x,
        y,
        type: 'state',
        data: { name: stateName, stateType: type, section },
      })

      // Select the new state
      s.selection = { nodes: [stateName], edges: [] }
    }),

    updateState: (name, updates) => set(s => {
      // Update in template
      const stateIndex = s.template.states.findIndex(st => st.name === name)
      if (stateIndex === -1) return

      const oldName = s.template.states[stateIndex].name
      Object.assign(s.template.states[stateIndex], updates)

      // If name changed, update transitions and nodes
      if (updates.name && updates.name !== oldName) {
        // Update transitions
        s.template.transitions.forEach(t => {
          if (t.from === oldName) t.from = updates.name!
          if (t.to === oldName) t.to = updates.name!
        })
        // Update node id
        const node = s.nodes.find(n => n.id === oldName)
        if (node) {
          node.id = updates.name
          if (node.data && 'name' in node.data) {
            (node.data as StateNodeData).name = updates.name
          }
        }
        // Update edges
        s.edges.forEach(e => {
          if (e.from === oldName) e.from = updates.name!
          if (e.to === oldName) e.to = updates.name!
        })
        // Update selection
        if (s.selection.nodes.includes(oldName)) {
          s.selection.nodes = s.selection.nodes.map(n => n === oldName ? updates.name! : n)
        }
      }

      // Update node data
      const node = s.nodes.find(n => n.id === (updates.name || name))
      if (node && node.data && 'stateType' in node.data) {
        const nodeData = node.data as StateNodeData
        if (updates.type) nodeData.stateType = updates.type
        if (updates.section !== undefined) nodeData.section = updates.section
      }
    }),

    removeState: (name) => set(s => {
      // Remove from template
      s.template.states = s.template.states.filter(st => st.name !== name)
      // Remove related transitions
      s.template.transitions = s.template.transitions.filter(t => t.from !== name && t.to !== name)
      // Remove node
      s.nodes = s.nodes.filter(n => n.id !== name)
      // Remove edges
      s.edges = s.edges.filter(e => e.from !== name && e.to !== name)
      // Clear selection if selected
      s.selection.nodes = s.selection.nodes.filter(n => n !== name)
    }),

    updateNodePosition: (id, x, y) => set(s => {
      const node = s.nodes.find(n => n.id === id)
      if (node) {
        node.x = x
        node.y = y
      }
      // Update template state position
      const state = s.template.states.find(st => st.name === id)
      if (state) {
        state._x = x
        state._y = y
      }
    }),

    // Transition (edge) actions
    beginEdge: (fromStateName, anchorDeg) => set(s => {
      s.pendingEdgeFrom = fromStateName
      s.pendingEdgeAnchor = anchorDeg
      s.mode = 'connect'
    }),

    completeEdge: (toStateName, event) => set(s => {
      if (!s.pendingEdgeFrom) return

      // Check if transition already exists
      const exists = s.template.transitions.some(
        t => t.from === s.pendingEdgeFrom && t.to === toStateName && t.on === event
      )
      if (exists) {
        s.pendingEdgeFrom = null
        s.mode = 'select'
        return
      }

      // Add transition to template
      const transition: TransitionDef = {
        from: s.pendingEdgeFrom,
        to: toStateName,
        on: event,
      }
      s.template.transitions.push(transition)

      // Add visual edge
      const edgeId = `trans_${s.edges.length}`
      s.edges.push({
        id: edgeId,
        from: s.pendingEdgeFrom,
        to: toStateName,
        data: { on: event },
      })

      // Select the new edge
      s.selection = { nodes: [], edges: [edgeId] }
      s.pendingEdgeFrom = null
      s.mode = 'select'
    }),

    cancelEdge: () => set(s => {
      s.pendingEdgeFrom = null
      s.pendingEdgeAnchor = undefined
      s.mode = 'select'
    }),

    updateTransition: (id, updates) => set(s => {
      const edgeIndex = s.edges.findIndex(e => e.id === id)
      if (edgeIndex === -1) return

      const edge = s.edges[edgeIndex]
      // Find and update template transition
      const transIndex = s.template.transitions.findIndex(
        t => t.from === edge.from && t.to === edge.to && t.on === edge.data.on
      )
      if (transIndex !== -1) {
        Object.assign(s.template.transitions[transIndex], updates)
      }

      // Update edge data
      if (updates.on) edge.data.on = updates.on
      if (updates.guard !== undefined) edge.data.guard = updates.guard
      if (updates.action !== undefined) edge.data.action = updates.action
    }),

    removeTransition: (id) => set(s => {
      const edge = s.edges.find(e => e.id === id)
      if (!edge) return

      // Remove from template
      s.template.transitions = s.template.transitions.filter(
        t => !(t.from === edge.from && t.to === edge.to && t.on === edge.data.on)
      )
      // Remove edge
      s.edges = s.edges.filter(e => e.id !== id)
      // Clear selection
      s.selection.edges = s.selection.edges.filter(e => e !== id)
    }),

    // Action definition actions
    addAction: (actionDef) => set(s => {
      // Check if key already exists
      if (s.template.actions.some(a => a.key === actionDef.key)) return
      s.template.actions.push(actionDef)
    }),

    updateAction: (key, updates) => set(s => {
      const action = s.template.actions.find(a => a.key === key)
      if (action) Object.assign(action, updates)
    }),

    removeAction: (key) => set(s => {
      s.template.actions = s.template.actions.filter(a => a.key !== key)
      // Clear action reference from transitions
      s.template.transitions.forEach(t => {
        if (t.action === key) t.action = undefined
      })
      s.edges.forEach(e => {
        if (e.data.action === key) e.data.action = undefined
      })
    }),

    // Catalog actions
    addCredentialProfile: (profileId, profile) => set(s => {
      if (!s.template.catalog.credential_profiles) {
        s.template.catalog.credential_profiles = {}
      }
      s.template.catalog.credential_profiles[profileId] = profile
    }),

    updateCredentialProfile: (profileId, updates) => set(s => {
      const profile = s.template.catalog.credential_profiles?.[profileId]
      if (profile) Object.assign(profile, updates)
    }),

    removeCredentialProfile: (profileId) => set(s => {
      if (s.template.catalog.credential_profiles) {
        delete s.template.catalog.credential_profiles[profileId]
      }
    }),

    addProofProfile: (profileId, profile) => set(s => {
      if (!s.template.catalog.proof_profiles) {
        s.template.catalog.proof_profiles = {}
      }
      s.template.catalog.proof_profiles[profileId] = profile
    }),

    updateProofProfile: (profileId, updates) => set(s => {
      const profile = s.template.catalog.proof_profiles?.[profileId]
      if (profile) Object.assign(profile, updates)
    }),

    removeProofProfile: (profileId) => set(s => {
      if (s.template.catalog.proof_profiles) {
        delete s.template.catalog.proof_profiles[profileId]
      }
    }),

    // Display hints actions
    addUIElement: (stateName, profile, element) => set(s => {
      if (!s.template.display_hints) {
        s.template.display_hints = { profiles: { sender: { states: {} }, receiver: { states: {} } } }
      }
      if (!s.template.display_hints.profiles) {
        s.template.display_hints.profiles = { sender: { states: {} }, receiver: { states: {} } }
      }
      if (!s.template.display_hints.profiles[profile]) {
        s.template.display_hints.profiles[profile] = { states: {} }
      }
      if (!s.template.display_hints.profiles[profile]!.states) {
        s.template.display_hints.profiles[profile]!.states = {}
      }
      if (!s.template.display_hints.profiles[profile]!.states![stateName]) {
        s.template.display_hints.profiles[profile]!.states![stateName] = []
      }
      s.template.display_hints.profiles[profile]!.states![stateName].push(element)
    }),

    updateUIElement: (stateName, profile, index, updates) => set(s => {
      const elements = s.template.display_hints?.profiles?.[profile]?.states?.[stateName]
      if (elements && elements[index]) {
        Object.assign(elements[index], updates)
      }
    }),

    removeUIElement: (stateName, profile, index) => set(s => {
      const elements = s.template.display_hints?.profiles?.[profile]?.states?.[stateName]
      if (elements) {
        elements.splice(index, 1)
      }
    }),

    reorderUIElements: (stateName, profile, fromIndex, toIndex) => set(s => {
      const elements = s.template.display_hints?.profiles?.[profile]?.states?.[stateName]
      if (elements && elements[fromIndex]) {
        const [removed] = elements.splice(fromIndex, 1)
        elements.splice(toIndex, 0, removed)
      }
    }),

    // Template metadata
    updateTemplateMetadata: (updates) => set(s => {
      Object.assign(s.template, updates)
    }),

    addSection: (name) => set(s => {
      if (!s.template.sections) s.template.sections = []
      if (!s.template.sections.some(sec => sec.name === name)) {
        s.template.sections.push({ name })
      }
    }),

    removeSection: (name) => set(s => {
      if (s.template.sections) {
        s.template.sections = s.template.sections.filter(sec => sec.name !== name)
      }
      // Clear section from states
      s.template.states.forEach(st => {
        if (st.section === name) st.section = undefined
      })
    }),

    // Template sync
    setTemplate: (template) => set(s => {
      s.template = template
      s.nodes = templateToNodes(template)
      s.edges = templateToEdges(template)
      s.selection = { nodes: [], edges: [] }
      s.lastJsonSync = Date.now()
    }),

    setTemplateFromJson: (json) => {
      try {
        const parsed = JSON.parse(json)
        get().setTemplate(parsed)
        return true
      } catch {
        return false
      }
    },

    getTemplateJson: () => {
      const { template, nodes } = get()
      // Sync node positions to template before export
      const templateCopy = JSON.parse(JSON.stringify(template))
      templateCopy.states.forEach((state: StateDef) => {
        const node = nodes.find(n => n.id === state.name)
        if (node) {
          state._x = node.x
          state._y = node.y
        }
      })
      return JSON.stringify(templateCopy, null, 2)
    },

    syncNodesFromTemplate: () => set(s => {
      s.nodes = templateToNodes(s.template)
      s.edges = templateToEdges(s.template)
    }),

    // Layout actions
    autoLayout: async () => {
      const ELK = (await import('elkjs/lib/elk.bundled.js')).default
      const elk = new ELK()

      const { template } = get()

      const graph = {
        id: 'root',
        layoutOptions: ELK_LAYOUT_OPTIONS,
        children: template.states.map(state => ({
          id: state.name,
          width: CANVAS_CONFIG.NODE_WIDTH,
          height: CANVAS_CONFIG.NODE_HEIGHT,
        })),
        edges: template.transitions.map((trans, i) => ({
          id: `e${i}`,
          sources: [trans.from],
          targets: [trans.to],
        })),
      }

      try {
        const layout = await elk.layout(graph)
        set(s => {
          layout.children?.forEach(child => {
            const node = s.nodes.find(n => n.id === child.id)
            if (node && child.x !== undefined && child.y !== undefined) {
              node.x = child.x + 80
              node.y = child.y + 80
            }
            const state = s.template.states.find(st => st.name === child.id)
            if (state && child.x !== undefined && child.y !== undefined) {
              state._x = child.x + 80
              state._y = child.y + 80
            }
          })
        })
      } catch (err) {
        console.error('Auto-layout failed:', err)
      }
    },

    fitToView: (stageWidth, stageHeight) => set(s => {
      if (s.nodes.length === 0) return

      const padding = 50
      const xs = s.nodes.map(n => n.x)
      const ys = s.nodes.map(n => n.y)
      const minX = Math.min(...xs) - CANVAS_CONFIG.NODE_WIDTH / 2
      const maxX = Math.max(...xs) + CANVAS_CONFIG.NODE_WIDTH / 2
      const minY = Math.min(...ys) - CANVAS_CONFIG.NODE_HEIGHT / 2
      const maxY = Math.max(...ys) + CANVAS_CONFIG.NODE_HEIGHT / 2

      const contentW = maxX - minX + padding * 2
      const contentH = maxY - minY + padding * 2

      const newScale = Math.min(
        stageWidth / contentW,
        stageHeight / contentH,
        CANVAS_CONFIG.MAX_ZOOM
      )
      s.zoom = Math.max(CANVAS_CONFIG.MIN_ZOOM, newScale)
      s.pan = {
        x: -(minX - padding) * s.zoom + (stageWidth - contentW * s.zoom) / 2,
        y: -(minY - padding) * s.zoom + (stageHeight - contentH * s.zoom) / 2,
      }
    }),

    // History
    undo: () => set(s => {
      if (s.historyIndex < 0) return
      const entry = s.history[s.historyIndex]
      if (entry) {
        s.template = JSON.parse(JSON.stringify(entry.template))
        s.nodes = templateToNodes(s.template)
        s.edges = templateToEdges(s.template)
        s.historyIndex--
      }
    }),

    redo: () => set(s => {
      if (s.historyIndex >= s.history.length - 1) return
      s.historyIndex++
      const entry = s.history[s.historyIndex]
      if (entry) {
        s.template = JSON.parse(JSON.stringify(entry.template))
        s.nodes = templateToNodes(s.template)
        s.edges = templateToEdges(s.template)
      }
    }),

    pushHistory: () => set(s => {
      // Remove future history if we're not at the end
      if (s.historyIndex < s.history.length - 1) {
        s.history = s.history.slice(0, s.historyIndex + 1)
      }
      // Add current state
      s.history.push({
        template: JSON.parse(JSON.stringify(s.template)),
        timestamp: Date.now(),
      })
      // Limit history size
      if (s.history.length > s.maxHistory) {
        s.history.shift()
      } else {
        s.historyIndex++
      }
    }),

    // Backend data
    setCredentialDefinitions: (defs) => set(s => { s.credentialDefinitions = defs }),
    setSchemas: (schemas) => set(s => { s.schemas = schemas }),

    // UI state
    setSelectedTab: (tab) => set(s => { s.selectedTab = tab }),
    setPropertiesPanelOpen: (open) => set(s => { s.propertiesPanelOpen = open }),

    // Selection helpers
    getSelectedState: () => {
      const { selection, template } = get()
      if (selection.nodes.length !== 1) return null
      return template.states.find(s => s.name === selection.nodes[0]) || null
    },

    getSelectedTransition: () => {
      const { selection, edges, template } = get()
      if (selection.edges.length !== 1) return null
      const edge = edges.find(e => e.id === selection.edges[0])
      if (!edge) return null
      return template.transitions.find(
        t => t.from === edge.from && t.to === edge.to && t.on === edge.data.on
      ) || null
    },

    // Delete selection
    deleteSelection: () => set(s => {
      const selNodes = new Set(s.selection.nodes)
      const selEdges = new Set(s.selection.edges)

      // Remove selected edges from template
      s.edges.forEach(edge => {
        if (selEdges.has(edge.id)) {
          s.template.transitions = s.template.transitions.filter(
            t => !(t.from === edge.from && t.to === edge.to && t.on === edge.data.on)
          )
        }
      })

      // Remove edges from visual
      s.edges = s.edges.filter(e => !selEdges.has(e.id))

      // Remove states and their transitions
      selNodes.forEach(nodeName => {
        s.template.states = s.template.states.filter(st => st.name !== nodeName)
        s.template.transitions = s.template.transitions.filter(
          t => t.from !== nodeName && t.to !== nodeName
        )
      })

      // Remove nodes and incident edges from visual
      s.nodes = s.nodes.filter(n => !selNodes.has(n.id))
      s.edges = s.edges.filter(e => !selNodes.has(e.from) && !selNodes.has(e.to))

      // Clear selection
      s.selection = { nodes: [], edges: [] }
    }),
  }))
)
