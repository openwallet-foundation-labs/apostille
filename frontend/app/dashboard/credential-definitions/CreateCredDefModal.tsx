'use client'
import React, { useEffect } from 'react'
import Link from 'next/link'
import type { CardTemplate } from '../../../lib/credential-designer/types'
import type { CredentialFormat } from '../../../lib/api'

interface Schema {
  id: string
  name: string
  version: string
  attributes?: string[]
  schemaId?: string
}

const FORMATS: Array<{ id: CredentialFormat; label: string; desc: string; color: string }> = [
  { id: 'anoncreds', label: 'AnonCreds', desc: 'Hyperledger / Kanon, ZK selective disclosure', color: '#5b6abf' },
  { id: 'oid4vc', label: 'SD-JWT VC (OpenID4VC)', desc: 'W3C format via OpenID credential issuance', color: '#8b5fbf' },
  { id: 'mso_mdoc', label: 'mDL / mdoc (ISO 18013-5)', desc: 'Mobile Driver License & mobile documents', color: '#bf8b5f' },
]

interface CreateCredDefModalProps {
  isOpen: boolean
  onClose: () => void
  schemas: Schema[]
  designerTemplates: CardTemplate[]
  loadingTemplates: boolean
  // Form state (lifted from parent)
  credentialFormat: CredentialFormat
  setCredentialFormat: (f: CredentialFormat) => void
  selectedSchemaId: string
  setSelectedSchemaId: (id: string) => void
  tag: string
  setTag: (t: string) => void
  supportRevocation: boolean
  setSupportRevocation: (v: boolean) => void
  selectedTemplateId: string
  onTemplateSelect: (id: string) => void
  creating: boolean
  onSubmit: (e: React.FormEvent) => void
  error: string | null
}

export default function CreateCredDefModal({
  isOpen,
  onClose,
  schemas,
  designerTemplates,
  loadingTemplates,
  credentialFormat,
  setCredentialFormat,
  selectedSchemaId,
  setSelectedSchemaId,
  tag,
  setTag,
  supportRevocation,
  setSupportRevocation,
  selectedTemplateId,
  onTemplateSelect,
  creating,
  onSubmit,
  error,
}: CreateCredDefModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const schema = schemas.find(s => s.id === selectedSchemaId || s.schemaId === selectedSchemaId)
  const canCreate = !!selectedSchemaId && !!tag.trim()

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-black/40 backdrop-blur-[4px] animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-[1080px] max-h-[calc(100vh-48px)] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Create Credential Definition</h2>
            <p className="text-[11.5px] text-gray-400 mt-0.5">Pick a schema and a saved card design. Metadata and attributes come from the schema&apos;s OCA bundle.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50 dark:bg-gray-950 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">{error}</div>
          )}

          {/* Section: Credential Format */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-[13.5px] font-semibold text-gray-900 dark:text-white">Credential format</h3>
                <p className="text-xs text-gray-400 mt-0.5">Wire format used when issuing this credential.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FORMATS.map(f => (
                <label
                  key={f.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    credentialFormat === f.id
                      ? 'border-gray-900 dark:border-white shadow-[0_0_0_1px] shadow-gray-900 dark:shadow-white'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <input type="radio" className="hidden" checked={credentialFormat === f.id} onChange={() => setCredentialFormat(f.id)} />
                  <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                    credentialFormat === f.id ? 'border-gray-900 dark:border-white' : 'border-gray-300 dark:border-gray-600'
                  }`}>
                    {credentialFormat === f.id && <div className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{f.label}</span>
                      <span className="w-[5px] h-[5px] rounded-full" style={{ background: f.color }} />
                      <span className="font-mono text-[10.5px] text-gray-400">{f.id}</span>
                    </div>
                    <p className="text-[11.5px] text-gray-400 leading-snug mt-0.5">{f.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* Section: Schema */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-[13.5px] font-semibold text-gray-900 dark:text-white">Schema</h3>
                <p className="text-xs text-gray-400 mt-0.5">Attributes, name, and issuer metadata are inherited from the schema.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Linked schema</label>
                <select
                  value={selectedSchemaId}
                  onChange={e => setSelectedSchemaId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                >
                  <option value="">Select a schema…</option>
                  {schemas.map(s => (
                    <option key={s.id} value={s.id}>{s.name} · v{s.version} · {s.attributes?.length || 0} attrs</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tag</label>
                <input
                  value={tag}
                  onChange={e => setTag(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                  placeholder="default"
                />
              </div>
            </div>

            {/* Schema summary */}
            {schema && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[13px] font-semibold text-gray-900 dark:text-white">{schema.name}</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">v{schema.version}</span>
                </div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{schema.attributes?.length || 0} attributes</div>
                <div className="flex flex-wrap gap-1.5">
                  {(schema.attributes || []).map((attr, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs font-medium text-gray-900 dark:text-white">
                      <span className="font-mono text-[10px] text-gray-400 mr-0.5">{String(i + 1).padStart(2, '0')}</span>
                      {attr}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Revocation */}
            <div className="mt-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${supportRevocation ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                  onClick={() => setSupportRevocation(!supportRevocation)}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${supportRevocation ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-[13px] font-medium text-gray-900 dark:text-white">Support revocation</span>
              </label>
            </div>
          </section>

          {/* Section: Card Design (OCA) */}
          <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-[13.5px] font-semibold text-gray-900 dark:text-white">Card design (OCA branding)</h3>
                <p className="text-xs text-gray-400 mt-0.5">Pick an existing OCA bundle, or open the Card Designer to create a new one.</p>
              </div>
              <Link
                href="/dashboard/credential-designer"
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                New design
              </Link>
            </div>

            {loadingTemplates ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
                Loading templates...
              </div>
            ) : designerTemplates.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {designerTemplates.map(template => {
                  const sel = selectedTemplateId === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => onTemplateSelect(template.id)}
                      className={`text-left border rounded-xl overflow-hidden transition-all relative flex flex-col ${
                        sel
                          ? 'border-gray-900 dark:border-white shadow-[0_0_0_1px] shadow-gray-900 dark:shadow-white'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:-translate-y-0.5 hover:shadow-sm'
                      }`}
                    >
                      {sel && (
                        <div className="absolute top-2 right-2 z-10 w-[22px] h-[22px] rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 grid place-items-center shadow-md">
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5L6.5 12L13 5"/></svg>
                        </div>
                      )}
                      {/* Thumbnail */}
                      <div className="h-[130px] bg-gray-100 dark:bg-gray-800 overflow-hidden border-b border-gray-200 dark:border-gray-700 p-3">
                        {template.thumbnail ? (
                          <img src={template.thumbnail} alt={template.name} className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full rounded-lg" style={{
                            background: template.oca_branding?.primary_background_color
                              ? `linear-gradient(135deg, ${template.oca_branding.primary_background_color}, ${template.oca_branding.secondary_background_color || template.oca_branding.primary_background_color})`
                              : 'linear-gradient(135deg, #1e3a5f, #0f1f33)',
                          }} />
                        )}
                      </div>
                      {/* Meta */}
                      <div className="p-3">
                        <div className="text-[13px] font-semibold text-gray-900 dark:text-white">{template.name}</div>
                        {template.category && <div className="text-[11.5px] text-gray-400 mt-0.5 capitalize">{template.category}</div>}
                        <div className="flex items-center justify-between mt-2">
                          <span className="inline-flex gap-1">
                            <span className="w-[10px] h-[10px] rounded-[3px] border border-black/10" style={{ background: template.oca_branding?.primary_background_color || '#1e3a5f' }} />
                            <span className="w-[10px] h-[10px] rounded-[3px] border border-black/10" style={{ background: template.oca_branding?.secondary_background_color || '#0f1f33' }} />
                          </span>
                        </div>
                      </div>
                    </button>
                  )
                })}

                {/* Create new design card */}
                <Link
                  href="/dashboard/credential-designer"
                  target="_blank"
                  className="flex flex-col items-center justify-center gap-2 p-7 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg border border-dashed border-gray-400 dark:border-gray-500 grid place-items-center text-gray-400">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                  </div>
                  <div className="text-[13px] font-semibold text-gray-900 dark:text-white">Create new design</div>
                  <div className="text-[11.5px] text-gray-400 text-center leading-snug">Open the Card Designer to build a new OCA bundle.</div>
                </Link>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-400 mb-2">No saved templates found</p>
                <Link href="/dashboard/credential-designer" target="_blank" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Open Card Designer →
                </Link>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
          <div className="flex items-center gap-3 text-[11.5px] text-gray-400">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium border" style={{
              borderColor: FORMATS.find(f => f.id === credentialFormat)?.color + '33',
              color: FORMATS.find(f => f.id === credentialFormat)?.color,
              background: FORMATS.find(f => f.id === credentialFormat)?.color + '10',
            }}>
              <span className="w-[5px] h-[5px] rounded-full" style={{ background: FORMATS.find(f => f.id === credentialFormat)?.color }} />
              {FORMATS.find(f => f.id === credentialFormat)?.label}
            </span>
            {schema && <span className="text-gray-600 dark:text-gray-300">{schema.name} <span className="px-1 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 rounded ml-1">v{schema.version}</span></span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit as any}
              disabled={!canCreate || creating}
              className="px-5 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {creating ? 'Creating...' : 'Create definition'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
