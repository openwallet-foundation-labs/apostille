'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { BuilderCanvas } from './BuilderCanvas'
import { BuilderSidebar } from './BuilderSidebar'
import { PropertiesPanel } from './PropertiesPanel'
import { credentialDefinitionApi, schemaApi } from '@/lib/api'

interface WorkflowBuilderProps {
  initialJson?: string
  onJsonChange?: (json: string) => void
  onPublish?: (json: string) => Promise<void>
}

export function WorkflowBuilder({ initialJson, onJsonChange, onPublish }: WorkflowBuilderProps) {
  const {
    selectedTab,
    setSelectedTab,
    template,
    setTemplateFromJson,
    getTemplateJson,
    setCredentialDefinitions,
    setSchemas,
    autoLayout,
  } = useBuilderStore()

  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)

  // Initialize from props
  useEffect(() => {
    if (initialJson) {
      const success = setTemplateFromJson(initialJson)
      if (success) {
        setJsonText(initialJson)
      }
    }
  }, [initialJson, setTemplateFromJson])

  // Sync JSON text when template changes (from visual editor)
  useEffect(() => {
    if (selectedTab === 'visual') {
      const json = getTemplateJson()
      setJsonText(json)
      onJsonChange?.(json)
    }
  }, [template, selectedTab, getTemplateJson, onJsonChange])

  // Fetch credential definitions and schemas
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [credDefsRes, schemasRes] = await Promise.all([
          credentialDefinitionApi.getAll(),
          schemaApi.getAll(),
        ])
        if (credDefsRes.credentialDefinitions) {
          setCredentialDefinitions(
            credDefsRes.credentialDefinitions.map((cd: any) => ({
              id: cd.id,
              credentialDefinitionId: cd.credentialDefinitionId,
              tag: cd.tag || cd.credentialDefinition?.tag || 'Unknown',
              schemaId: cd.credentialDefinition?.schemaId || '',
              issuerId: cd.credentialDefinition?.issuerId || '',
            }))
          )
        }
        if (schemasRes.schemas) {
          setSchemas(
            schemasRes.schemas.map((s: any) => ({
              id: s.id,
              schemaId: s.schemaId,
              name: s.schema?.name || 'Unknown',
              version: s.schema?.version || '1.0.0',
              attrNames: s.schema?.attrNames || [],
              issuerId: s.schema?.issuerId || '',
            }))
          )
        }
      } catch (err) {
        console.error('Failed to fetch credential definitions:', err)
      }
    }
    fetchData()
  }, [setCredentialDefinitions, setSchemas])

  const handleJsonChange = useCallback((value: string) => {
    setJsonText(value)
    try {
      JSON.parse(value)
      setJsonError(null)
    } catch (e) {
      setJsonError((e as Error).message)
    }
  }, [])

  const handleApplyJson = useCallback(() => {
    const success = setTemplateFromJson(jsonText)
    if (success) {
      setJsonError(null)
      onJsonChange?.(jsonText)
    } else {
      setJsonError('Invalid workflow template')
    }
  }, [jsonText, setTemplateFromJson, onJsonChange])

  const handlePublish = useCallback(async () => {
    if (!onPublish) return
    setIsPublishing(true)
    try {
      const json = getTemplateJson()
      await onPublish(json)
    } catch (err) {
      console.error('Publish failed:', err)
    } finally {
      setIsPublishing(false)
    }
  }, [onPublish, getTemplateJson])

  const handleAutoLayout = useCallback(async () => {
    await autoLayout()
  }, [autoLayout])

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-border-secondary bg-surface-800 px-4">
        <div className="flex">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              selectedTab === 'visual'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            onClick={() => setSelectedTab('visual')}
          >
            Visual Builder
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              selectedTab === 'json'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
            onClick={() => setSelectedTab('json')}
          >
            JSON Editor
          </button>
        </div>

        <div className="flex items-center gap-2">
          {selectedTab === 'visual' && (
            <button
              onClick={handleAutoLayout}
              className="px-3 py-1 text-xs bg-surface-700 hover:bg-surface-600 text-text-secondary rounded transition-colors"
            >
              Auto Layout
            </button>
          )}
          {onPublish && (
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
            >
              {isPublishing ? 'Publishing...' : 'Publish'}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {selectedTab === 'visual' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <BuilderSidebar />

          {/* Canvas */}
          <div className="flex-1 relative">
            <BuilderCanvas />
          </div>

          {/* Properties Panel */}
          <PropertiesPanel />
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-text-tertiary">
              Edit the workflow template JSON directly
            </span>
            <div className="flex items-center gap-2">
              {jsonError && (
                <span className="text-xs text-red-400">{jsonError}</span>
              )}
              <button
                onClick={handleApplyJson}
                disabled={!!jsonError}
                className="px-3 py-1 text-xs bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50"
              >
                Apply Changes
              </button>
            </div>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className="flex-1 w-full font-mono text-sm bg-surface-900 text-text-primary border border-border-secondary rounded p-4 resize-none focus:outline-none focus:border-blue-500"
            spellCheck={false}
          />
        </div>
      )}
    </div>
  )
}
