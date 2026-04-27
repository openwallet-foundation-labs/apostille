'use client'

import { useState } from 'react'
import { Icon } from '../../../components/ui/Icons'

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
  if (loading) {
    return (
      <>
        <div className="section-title">Published Templates</div>
        <div className="empty"><div className="spinner" style={{ width: 24, height: 24 }} /></div>
      </>
    )
  }

  if (templates.length === 0) {
    return (
      <>
        <div className="section-title">Published Templates</div>
        <div className="empty">
          <div className="empty-icon"><Icon name="layout" size={22} /></div>
          <div className="empty-title">No templates published yet</div>
          <div className="empty-desc">Use the Template Builder to create and publish templates.</div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="section-title">Published Templates &middot; {templates.length} available</div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Template</th>
              <th>Version</th>
              <th>Created</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>
                  <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{template.title}</span>
                  <br />
                  <span className="mono-dim" style={{ fontSize: 11 }}>{template.template_id}</span>
                </td>
                <td><span className="tag">v{template.version}</span></td>
                <td><span className="mono-dim">{new Date(template.createdAt).toLocaleDateString()}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                    <button
                      onClick={() => onStart(template)}
                      disabled={!connectionSelected}
                      className="btn btn-accent btn-xs"
                    >
                      Start
                    </button>
                    <button
                      onClick={() => onEnsure(template)}
                      disabled={!connectionSelected}
                      className="btn btn-secondary btn-xs"
                    >
                      Sync
                    </button>
                    <button onClick={() => onEdit(template)} className="btn btn-ghost btn-icon btn-sm">
                      <Icon name="edit" size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
