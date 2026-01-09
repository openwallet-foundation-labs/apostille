'use client'

import { useState } from 'react'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import {
  STATE_TYPE_COLORS,
  ACTION_TYPE_URIS,
  ACTION_TYPE_LABELS,
  UI_ELEMENT_TYPES,
  UI_ELEMENT_LABELS,
} from '@/lib/workflow-builder/constants'
import type { StateType } from '@/lib/workflow-builder/types'
import { CredentialProfilesPanel } from './CredentialProfilesPanel'

type SidebarTab = 'components' | 'credentials'

interface PaletteItemProps {
  label: string
  icon: React.ReactNode
  description: string
  color?: string
  onDragStart: () => void
}

function PaletteItem({ label, icon, description, color, onDragStart }: PaletteItemProps) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy'
        onDragStart()
      }}
      className="flex items-center gap-2 p-2 bg-surface-100 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700 rounded cursor-grab active:cursor-grabbing transition-colors border border-border-secondary"
      title={description}
    >
      <div
        className="w-8 h-8 flex items-center justify-center rounded"
        style={{ backgroundColor: color ? `${color}20` : 'transparent' }}
      >
        {icon}
      </div>
      <span className="text-sm text-text-secondary">{label}</span>
    </div>
  )
}

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border-secondary">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors"
      >
        {title}
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  )
}

// Icons as SVG components
const PlayIcon = ({ color }: { color?: string }) => (
  <svg className="w-4 h-4" fill={color || 'currentColor'} viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const CircleIcon = ({ color }: { color?: string }) => (
  <svg className="w-4 h-4" fill="none" stroke={color || 'currentColor'} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10" strokeWidth="2" />
  </svg>
)

const CheckCircleIcon = ({ color }: { color?: string }) => (
  <svg className="w-4 h-4" fill={color || 'currentColor'} viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
)

const DatabaseIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
  </svg>
)

const AwardIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="8" r="7" />
    <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
  </svg>
)

const ShieldIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const TypeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" y1="20" x2="15" y2="20" />
    <line x1="12" y1="4" x2="12" y2="20" />
  </svg>
)

const MousePointerIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  </svg>
)

const SendIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)

export function BuilderSidebar() {
  const { startDrag, credentialDefinitions } = useBuilderStore()
  const [activeTab, setActiveTab] = useState<SidebarTab>('components')

  const stateItems: Array<{ type: StateType; label: string; icon: React.ReactNode; description: string }> = [
    {
      type: 'start',
      label: 'Start State',
      icon: <PlayIcon color={STATE_TYPE_COLORS.start} />,
      description: 'Entry point of the workflow',
    },
    {
      type: 'normal',
      label: 'Normal State',
      icon: <CircleIcon color={STATE_TYPE_COLORS.normal} />,
      description: 'Intermediate state',
    },
    {
      type: 'final',
      label: 'Final State',
      icon: <CheckCircleIcon color={STATE_TYPE_COLORS.final} />,
      description: 'Completion state',
    },
  ]

  const actionItems = [
    {
      typeURI: ACTION_TYPE_URIS.STATE_SET,
      icon: <DatabaseIcon />,
      color: '#f59e0b',
    },
    {
      typeURI: ACTION_TYPE_URIS.CREDENTIAL_OFFER,
      icon: <AwardIcon />,
      color: '#22c55e',
    },
    {
      typeURI: ACTION_TYPE_URIS.CREDENTIAL_PROPOSE,
      icon: <AwardIcon />,
      color: '#22c55e',
    },
    {
      typeURI: ACTION_TYPE_URIS.CREDENTIAL_REQUEST,
      icon: <AwardIcon />,
      color: '#22c55e',
    },
    {
      typeURI: ACTION_TYPE_URIS.CREDENTIAL_ISSUE,
      icon: <AwardIcon />,
      color: '#22c55e',
    },
    {
      typeURI: ACTION_TYPE_URIS.PROOF_REQUEST,
      icon: <ShieldIcon />,
      color: '#3b82f6',
    },
  ]

  const uiItems = [
    { type: 'text' as const, icon: <TypeIcon /> },
    { type: 'button' as const, icon: <MousePointerIcon /> },
    { type: 'submit-button' as const, icon: <SendIcon /> },
  ]

  return (
    <div className="w-72 bg-surface-50 dark:bg-surface-900 border-r border-border-secondary flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border-secondary">
        <button
          onClick={() => setActiveTab('components')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'components'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400 bg-surface-100 dark:bg-surface-800'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Components
        </button>
        <button
          onClick={() => setActiveTab('credentials')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'credentials'
              ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400 bg-surface-100 dark:bg-surface-800'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Credentials
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'components' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 border-b border-border-secondary">
            <p className="text-xs text-text-tertiary">Drag items onto the canvas</p>
          </div>

          <CollapsibleSection title="States">
            {stateItems.map((item) => (
              <PaletteItem
                key={item.type}
                label={item.label}
                icon={item.icon}
                description={item.description}
                color={STATE_TYPE_COLORS[item.type]}
                onDragStart={() =>
                  startDrag({
                    type: 'state',
                    data: { type: item.type },
                  })
                }
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Actions">
            {actionItems.map((item) => (
              <PaletteItem
                key={item.typeURI}
                label={ACTION_TYPE_LABELS[item.typeURI]}
                icon={item.icon}
                description={`Action: ${item.typeURI.split('/').pop()}`}
                color={item.color}
                onDragStart={() =>
                  startDrag({
                    type: 'action',
                    data: { typeURI: item.typeURI },
                  })
                }
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Credential Definitions" defaultOpen={false}>
            {credentialDefinitions.length === 0 ? (
              <p className="text-xs text-text-tertiary p-2">No credential definitions found</p>
            ) : (
              credentialDefinitions.map((cd) => (
                <PaletteItem
                  key={cd.id}
                  label={cd.tag}
                  icon={<AwardIcon />}
                  description={`Cred Def: ${cd.credentialDefinitionId.slice(0, 30)}...`}
                  color="#22c55e"
                  onDragStart={() =>
                    startDrag({
                      type: 'credential',
                      data: { credDefId: cd.credentialDefinitionId, tag: cd.tag },
                    })
                  }
                />
              ))
            )}
          </CollapsibleSection>

          <CollapsibleSection title="UI Elements" defaultOpen={false}>
            {uiItems.map((item) => (
              <PaletteItem
                key={item.type}
                label={UI_ELEMENT_LABELS[item.type]}
                icon={item.icon}
                description={`UI element: ${item.type}`}
                color="#6366f1"
                onDragStart={() =>
                  startDrag({
                    type: 'ui',
                    data: { uiType: item.type },
                  })
                }
              />
            ))}
          </CollapsibleSection>
        </div>
      ) : (
        <CredentialProfilesPanel />
      )}
    </div>
  )
}
