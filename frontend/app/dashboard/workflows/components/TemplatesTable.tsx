'use client'

import { useState } from 'react'

interface TemplateItem {
  id: string
  template_id: string
  version: string
  title: string
  createdAt: string
  hash?: string
}

interface TemplatesTableProps {
  templates: TemplateItem[]
  loading?: boolean
  onStart: (template: TemplateItem) => void
  onEnsure: (template: TemplateItem) => void
  onEdit: (template: TemplateItem) => void
  connectionSelected: boolean
}

export function TemplatesTable({
  templates,
  loading = false,
  onStart,
  onEnsure,
  onEdit,
  connectionSelected,
}: TemplatesTableProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="bg-surface-100 border border-border-primary/30 rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-surface-200 text-text-secondary flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">Published Templates</h2>
            <p className="text-xs text-text-tertiary">{templates.length} templates available</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="badge badge-gray">{templates.length}</span>
          <svg
            className={`w-5 h-5 text-text-tertiary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-border-primary/30">
          {loading ? (
            <div className="p-8 text-center">
              <span className="spinner h-6 w-6 mx-auto" />
              <p className="text-sm text-text-tertiary mt-2">Loading templates...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-text-tertiary">No templates published yet.</p>
              <p className="text-xs text-text-tertiary mt-1">
                Use the Template Builder to create and publish templates.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border-primary/30">
                <thead className="bg-surface-50">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Template
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Version
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-medium text-text-tertiary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-primary/20">
                  {templates.map((template) => (
                    <tr key={template.id} className="hover:bg-surface-50 transition-colors">
                      <td className="px-5 py-4">
                        <div>
                          <div className="font-medium text-text-primary">{template.title}</div>
                          <div className="text-xs text-text-tertiary font-mono">{template.template_id}</div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="badge badge-gray">v{template.version}</span>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-secondary">
                        {new Date(template.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => onStart(template)}
                            disabled={!connectionSelected}
                            className="btn btn-primary text-xs py-1.5 px-3 disabled:opacity-50"
                            title={connectionSelected ? 'Start workflow' : 'Select a connection first'}
                          >
                            Start
                          </button>
                          <button
                            onClick={() => onEnsure(template)}
                            disabled={!connectionSelected}
                            className="btn btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
                            title="Sync template to peer"
                          >
                            Sync
                          </button>
                          <button
                            onClick={() => onEdit(template)}
                            className="text-text-tertiary hover:text-text-primary p-1.5"
                            title="Edit template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
