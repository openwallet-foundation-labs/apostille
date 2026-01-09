'use client'

import { useState, useEffect } from 'react'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { schemaApi } from '@/lib/api'

interface AttributePlanEntry {
  source: 'context' | 'static' | 'compute'
  path?: string
  value?: unknown
  expr?: string
  required?: boolean
}

export function CredentialProfilesPanel() {
  const {
    template,
    credentialDefinitions,
    schemas,
    addCredentialProfile,
    updateCredentialProfile,
    removeCredentialProfile,
  } = useBuilderStore()

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [newProfileId, setNewProfileId] = useState('')
  const [showNewForm, setShowNewForm] = useState(false)
  const [schemaAttributes, setSchemaAttributes] = useState<string[]>([])
  const [loadingSchema, setLoadingSchema] = useState(false)

  const credentialProfiles = template.catalog.credential_profiles || {}
  const profileIds = Object.keys(credentialProfiles)

  // Get the selected profile
  const selectedProfile = selectedProfileId ? credentialProfiles[selectedProfileId] : null

  // Find the selected credential definition details
  const selectedCredDef = selectedProfile?.cred_def_id
    ? credentialDefinitions.find(cd => cd.credentialDefinitionId === selectedProfile.cred_def_id)
    : null

  // Find schema for the selected cred def
  const relatedSchema = selectedCredDef?.schemaId
    ? schemas.find(s => s.schemaId === selectedCredDef.schemaId)
    : null

  // Fetch schema attributes when cred def changes
  useEffect(() => {
    const fetchSchemaAttributes = async () => {
      if (!selectedCredDef?.schemaId) {
        setSchemaAttributes([])
        return
      }

      // First check if we have it in local schemas
      if (relatedSchema?.attrNames?.length) {
        setSchemaAttributes(relatedSchema.attrNames)
        return
      }

      // Fetch from API
      setLoadingSchema(true)
      try {
        const response = await schemaApi.getBySchemaId(selectedCredDef.schemaId)
        const attrs = response?.schema?.attrNames || []
        setSchemaAttributes(attrs)
      } catch (err) {
        console.error('Failed to fetch schema:', err)
        setSchemaAttributes([])
      } finally {
        setLoadingSchema(false)
      }
    }

    fetchSchemaAttributes()
  }, [selectedCredDef?.schemaId, relatedSchema])

  const handleAddProfile = () => {
    if (!newProfileId.trim()) return

    addCredentialProfile(newProfileId.trim(), {
      cred_def_id: 'REPLACE_WITH_CRED_DEF_ID',
      to_ref: 'holder',
      attribute_plan: {},
      options: { comment: '' },
    })

    setSelectedProfileId(newProfileId.trim())
    setNewProfileId('')
    setShowNewForm(false)
  }

  const handleCredDefChange = (credDefId: string) => {
    if (!selectedProfileId) return

    const credDef = credentialDefinitions.find(cd => cd.credentialDefinitionId === credDefId)
    const schema = credDef?.schemaId ? schemas.find(s => s.schemaId === credDef.schemaId) : null

    // Auto-populate attribute_plan with schema attributes
    const attributePlan: Record<string, AttributePlanEntry> = {}
    if (schema?.attrNames) {
      schema.attrNames.forEach(attr => {
        attributePlan[attr] = {
          source: 'context',
          path: attr,
          required: true,
        }
      })
    }

    updateCredentialProfile(selectedProfileId, {
      cred_def_id: credDefId,
      attribute_plan: attributePlan,
    })
  }

  const handleAttributeUpdate = (attrName: string, updates: Partial<AttributePlanEntry>) => {
    if (!selectedProfileId || !selectedProfile) return

    const currentEntry = selectedProfile.attribute_plan[attrName] || { source: 'context' as const }
    const newAttributePlan = { ...selectedProfile.attribute_plan }
    newAttributePlan[attrName] = {
      ...currentEntry,
      ...updates,
    }

    updateCredentialProfile(selectedProfileId, { attribute_plan: newAttributePlan })
  }

  const handleDeleteProfile = (profileId: string) => {
    removeCredentialProfile(profileId)
    if (selectedProfileId === profileId) {
      setSelectedProfileId(null)
    }
  }

  return (
    <div className="h-full flex flex-col bg-surface-50 dark:bg-surface-900 text-text-primary">
      {/* Header */}
      <div className="p-3 border-b border-border-secondary">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-secondary">Credential Profiles</h3>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="text-xs bg-primary-600 hover:bg-primary-500 text-white px-2 py-1 rounded"
          >
            + Add
          </button>
        </div>
      </div>

      {/* New Profile Form */}
      {showNewForm && (
        <div className="p-3 border-b border-border-secondary bg-surface-100 dark:bg-surface-800">
          <label className="block text-xs text-text-tertiary mb-1">Profile ID</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newProfileId}
              onChange={(e) => setNewProfileId(e.target.value)}
              placeholder="e.g., kanon_id"
              className="flex-1 bg-surface-50 dark:bg-surface-900 border border-border-secondary rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:border-primary-500"
            />
            <button
              onClick={handleAddProfile}
              disabled={!newProfileId.trim()}
              className="bg-success-600 hover:bg-success-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Profile List */}
      <div className="flex-1 overflow-y-auto">
        {profileIds.length === 0 ? (
          <div className="p-4 text-center text-text-tertiary text-sm">
            No credential profiles defined.
            <br />
            <span className="text-xs">Add a profile to configure credential issuance.</span>
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {profileIds.map((profileId) => {
              const profile = credentialProfiles[profileId]
              const isSelected = selectedProfileId === profileId
              const credDef = credentialDefinitions.find(
                cd => cd.credentialDefinitionId === profile.cred_def_id
              )

              return (
                <div key={profileId}>
                  {/* Profile Header */}
                  <div
                    className={`p-3 cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800 ${isSelected ? 'bg-surface-100 dark:bg-surface-800' : ''}`}
                    onClick={() => setSelectedProfileId(isSelected ? null : profileId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-4 h-4 transition-transform ${isSelected ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="font-medium text-sm">{profileId}</span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProfile(profileId)
                        }}
                        className="text-text-tertiary hover:text-error-500 p-1"
                        title="Delete profile"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-text-tertiary truncate">
                      {credDef?.tag || profile.cred_def_id?.slice(0, 40) + '...' || 'No cred def selected'}
                    </div>
                  </div>

                  {/* Profile Details (expanded) */}
                  {isSelected && (
                    <div className="px-4 pb-4 bg-surface-50 dark:bg-surface-850 border-t border-border-secondary">
                      {/* Credential Definition Selector */}
                      <div className="mt-3">
                        <label className="block text-xs text-text-tertiary mb-1">Credential Definition</label>
                        <select
                          value={profile.cred_def_id || ''}
                          onChange={(e) => handleCredDefChange(e.target.value)}
                          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                        >
                          <option value="">Select credential definition...</option>
                          {credentialDefinitions.map((cd) => (
                            <option key={cd.id} value={cd.credentialDefinitionId}>
                              {cd.tag} ({cd.credentialDefinitionId.slice(0, 30)}...)
                            </option>
                          ))}
                        </select>
                        {profile.cred_def_id && (
                          <p className="mt-1 text-xs text-text-tertiary break-all">
                            {profile.cred_def_id}
                          </p>
                        )}
                      </div>

                      {/* To Ref */}
                      <div className="mt-3">
                        <label className="block text-xs text-text-tertiary mb-1">Recipient (to_ref)</label>
                        <input
                          type="text"
                          value={profile.to_ref || 'holder'}
                          onChange={(e) => updateCredentialProfile(profileId, { to_ref: e.target.value })}
                          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                        />
                      </div>

                      {/* Comment */}
                      <div className="mt-3">
                        <label className="block text-xs text-text-tertiary mb-1">Comment</label>
                        <input
                          type="text"
                          value={String(profile.options?.comment || '')}
                          onChange={(e) => updateCredentialProfile(profileId, {
                            options: { ...profile.options, comment: e.target.value }
                          })}
                          placeholder="Optional comment for the credential"
                          className="w-full bg-surface-100 dark:bg-surface-800 border border-border-secondary rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
                        />
                      </div>

                      {/* Attribute Plan */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-medium text-text-secondary">Attribute Plan</label>
                          {loadingSchema && (
                            <span className="text-xs text-text-tertiary">Loading schema...</span>
                          )}
                        </div>

                        {/* Schema Attributes Info */}
                        {schemaAttributes.length > 0 && (
                          <div className="mb-2 p-2 bg-surface-100 dark:bg-surface-800 rounded text-xs">
                            <span className="text-text-tertiary">Schema attributes: </span>
                            <span className="text-primary-500">{schemaAttributes.join(', ')}</span>
                          </div>
                        )}

                        {/* Attribute Plan Entries */}
                        {Object.keys(profile.attribute_plan || {}).length === 0 ? (
                          <div className="text-xs text-text-tertiary p-2 bg-surface-100 dark:bg-surface-800 rounded">
                            No attributes configured. Select a credential definition to auto-populate.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {Object.entries(profile.attribute_plan || {}).map(([attrName, entry]) => (
                              <div key={attrName} className="p-2 bg-surface-100 dark:bg-surface-800 rounded">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-text-primary">{attrName}</span>
                                  <label className="flex items-center gap-1 text-xs text-text-tertiary">
                                    <input
                                      type="checkbox"
                                      checked={entry.required || false}
                                      onChange={(e) => handleAttributeUpdate(attrName, { required: e.target.checked })}
                                      className="w-3 h-3"
                                    />
                                    Required
                                  </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-xs text-text-tertiary mb-0.5">Source</label>
                                    <select
                                      value={entry.source || 'context'}
                                      onChange={(e) => handleAttributeUpdate(attrName, {
                                        source: e.target.value as 'context' | 'static' | 'compute'
                                      })}
                                      className="w-full bg-surface-50 dark:bg-surface-900 border border-border-secondary rounded px-1.5 py-1 text-xs focus:outline-none focus:border-primary-500"
                                    >
                                      <option value="context">Context</option>
                                      <option value="static">Static</option>
                                      <option value="compute">Compute</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs text-text-tertiary mb-0.5">
                                      {entry.source === 'static' ? 'Value' : entry.source === 'compute' ? 'Expression' : 'Path'}
                                    </label>
                                    <input
                                      type="text"
                                      value={
                                        entry.source === 'static'
                                          ? String(entry.value || '')
                                          : entry.source === 'compute'
                                          ? (entry.expr || '')
                                          : (entry.path || '')
                                      }
                                      onChange={(e) => handleAttributeUpdate(attrName, {
                                        ...(entry.source === 'static'
                                          ? { value: e.target.value }
                                          : entry.source === 'compute'
                                          ? { expr: e.target.value }
                                          : { path: e.target.value })
                                      })}
                                      placeholder={
                                        entry.source === 'static'
                                          ? 'Static value'
                                          : entry.source === 'compute'
                                          ? 'JMESPath expression'
                                          : 'e.g., Name'
                                      }
                                      className="w-full bg-surface-50 dark:bg-surface-900 border border-border-secondary rounded px-1.5 py-1 text-xs focus:outline-none focus:border-primary-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add missing attributes from schema */}
                        {schemaAttributes.length > 0 && (
                          <button
                            onClick={() => {
                              const currentAttrs = Object.keys(profile.attribute_plan || {})
                              const missingAttrs = schemaAttributes.filter(a => !currentAttrs.includes(a))
                              if (missingAttrs.length === 0) return

                              const newPlan = { ...profile.attribute_plan }
                              missingAttrs.forEach(attr => {
                                newPlan[attr] = { source: 'context', path: attr, required: true }
                              })
                              updateCredentialProfile(profileId, { attribute_plan: newPlan })
                            }}
                            className="mt-2 w-full text-xs bg-surface-200 dark:bg-surface-700 hover:bg-surface-300 dark:hover:bg-surface-600 px-2 py-1.5 rounded"
                          >
                            + Add missing schema attributes
                          </button>
                        )}
                      </div>

                      {/* Action Reference */}
                      <div className="mt-4 p-2 bg-surface-100 dark:bg-surface-800 rounded">
                        <label className="block text-xs text-text-tertiary mb-1">Use in action as:</label>
                        <code className="text-xs text-success-500">profile_ref: &quot;cp.{profileId}&quot;</code>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
