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
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false)

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
    const json = getTemplateJson()
    setJsonText(json)
    onJsonChange?.(json)
  }, [template, getTemplateJson, onJsonChange])

  // Open JSON modal and sync content
  const openJsonModal = useCallback(() => {
    const json = getTemplateJson()
    setJsonText(json)
    setJsonError(null)
    setIsJsonModalOpen(true)
  }, [getTemplateJson])

  const closeJsonModal = useCallback(() => {
    setIsJsonModalOpen(false)
  }, [])

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
      setIsJsonModalOpen(false)
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
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border-secondary bg-surface-100 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-text-secondary">Visual Builder</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openJsonModal}
            className="px-3 py-1 text-xs bg-surface-200 hover:bg-surface-300 text-text-secondary rounded transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            JSON
          </button>
          <button
            onClick={handleAutoLayout}
            className="px-3 py-1 text-xs bg-surface-200 hover:bg-surface-300 text-text-secondary rounded transition-colors"
          >
            Auto Layout
          </button>
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

      {/* Visual Builder Content */}
      <div className="flex flex-1 overflow-hidden">
        <BuilderSidebar />
        <div className="flex-1 relative">
          <BuilderCanvas />
        </div>
        <PropertiesPanel />
      </div>

      {/* JSON Editor Modal */}
      {isJsonModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeJsonModal}
          />

          {/* Modal */}
          <div className="relative w-full max-w-4xl h-[85vh] mx-4 bg-surface-50 rounded-xl shadow-2xl border border-border-secondary flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-secondary bg-surface-100">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span className="text-sm font-medium text-text-primary">JSON Editor</span>
              </div>
              <div className="flex items-center gap-2">
                {jsonError && (
                  <span className="text-xs text-red-500 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
                    {jsonError}
                  </span>
                )}
                <button
                  onClick={handleApplyJson}
                  disabled={!!jsonError}
                  className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply Changes
                </button>
                <button
                  onClick={closeJsonModal}
                  className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-surface-200 rounded transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 p-4 overflow-hidden">
              <textarea
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                className="w-full h-full font-mono text-sm bg-surface-100 text-text-primary border border-border-secondary rounded-lg p-4 resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                spellCheck={false}
                placeholder="Workflow template JSON..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
