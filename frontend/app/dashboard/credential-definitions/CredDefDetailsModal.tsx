'use client'
import React, { useEffect, useState } from 'react'

interface CredDefDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  credDef: any
  schemaDetails: any
  overlayData: any
  loadingOverlay: boolean
}

function KV({ label, value, mono, copy }: { label: string; value: React.ReactNode; mono?: boolean; copy?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider font-medium text-gray-400 mb-1">{label}</div>
      <div className={`text-[13px] flex items-start gap-1.5 break-all ${mono ? 'font-mono text-gray-500 text-xs' : 'text-gray-600 dark:text-gray-300'}`}>
        {value}
        {copy && (
          <button
            onClick={() => { if (typeof value === 'string') navigator.clipboard.writeText(value) }}
            className="shrink-0 w-5 h-5 grid place-items-center rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Copy"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-[10px] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function CredDefDetailsModal({ isOpen, onClose, credDef, schemaDetails, overlayData, loadingOverlay }: CredDefDetailsModalProps) {
  const [tab, setTab] = useState<'overview' | 'schema' | 'branding' | 'raw'>('overview')

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [isOpen, onClose])

  if (!isOpen || !credDef) return null

  const cd = credDef
  const id = cd.credentialDefinitionId || cd.id
  const issuerDid = cd.issuerId || cd.credentialDefinition?.issuerId || ''
  const schemaId = cd.schemaId || cd.credentialDefinition?.schemaId || ''
  const tagVal = cd.tag || cd.credentialDefinition?.tag || ''
  const format = cd.format || 'anoncreds'
  const schema = schemaDetails?.schema || schemaDetails
  const schemaName = schema?.name || schemaDetails?.name || '—'
  const schemaVersion = schema?.version || schemaDetails?.version || '—'
  const attributes: string[] = schema?.attrNames || schema?.attributes || schemaDetails?.attributes || []
  const overlay = overlayData
  const primaryColor = overlay?.branding?.primary_background_color || '#1e3a5f'
  const secondaryColor = overlay?.branding?.secondary_background_color || primaryColor
  const primaryAttr = overlay?.branding?.primary_attribute || attributes[0] || ''
  const secondaryAttr = overlay?.branding?.secondary_attribute || attributes[1] || ''
  const logoUrl = overlay?.branding?.logo || ''
  const bgUrl = overlay?.branding?.background_image || overlay?.branding?.svg_template_url || ''
  const metaName = overlay?.meta?.name || schemaName
  const metaDesc = overlay?.meta?.description || ''

  const tabs = [
    { id: 'overview' as const, label: 'Overview' },
    { id: 'schema' as const, label: 'Schema' },
    { id: 'branding' as const, label: 'Branding (OCA)' },
    { id: 'raw' as const, label: 'Raw' },
  ]

  const formatBadge = (f: string) => {
    const map: Record<string, { color: string; label: string }> = {
      anoncreds: { color: '#5b6abf', label: 'AnonCreds' },
      oid4vc: { color: '#8b5fbf', label: 'OID4VC' },
      mso_mdoc: { color: '#bf8b5f', label: 'mso_mdoc' },
    }
    const m = map[f] || map.anoncreds
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium" style={{
        border: `1px solid ${m.color}33`, color: m.color, background: `${m.color}10`,
      }}>
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: m.color }} />
        {m.label}
      </span>
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6 bg-black/40 backdrop-blur-[4px] animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="w-full max-w-[980px] max-h-[calc(100vh-48px)] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-[10px] shrink-0 shadow-md" style={{
              background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            }} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[16px] font-semibold text-gray-900 dark:text-white truncate">{metaName}</span>
                {formatBadge(format)}
              </div>
              <div className="font-mono text-[11.5px] text-gray-400 truncate">{id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => navigator.clipboard.writeText(id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5"/></svg>
              Copy ID
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-6 border-b border-gray-200 dark:border-gray-700 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-3 text-[12.5px] font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50 dark:bg-gray-950">
          {tab === 'overview' && (
            <div className="grid grid-cols-[1.4fr_1fr] gap-4">
              <div className="flex flex-col gap-4">
                <Section title="Identifiers">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                    <KV label="Cred Def ID" value={id} mono copy />
                    <KV label="Issuer DID" value={issuerDid} mono copy />
                    <KV label="Method" value={<span className="px-1.5 py-0.5 text-[10.5px] bg-gray-100 dark:bg-gray-800 rounded font-medium">{id.split(':')[1] || 'kanon'}</span>} />
                    <KV label="Format" value={formatBadge(format)} />
                  </div>
                </Section>
                <Section title="Configuration">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
                    <KV label="Display name" value={<b className="text-gray-900 dark:text-white font-medium">{metaName}</b>} />
                    <KV label="Description" value={metaDesc || '—'} />
                    <KV label="Tag" value={<span className="px-1.5 py-0.5 text-[10.5px] bg-gray-100 dark:bg-gray-800 rounded font-medium">{tagVal}</span>} />
                    <KV label="Created" value={cd.createdAt ? new Date(cd.createdAt).toLocaleString() : '—'} />
                  </div>
                </Section>
                <Section title="Attributes" right={<span className="px-1.5 py-0.5 text-[10.5px] bg-gray-100 dark:bg-gray-800 rounded font-medium">{attributes.length}</span>}>
                  <div className="flex flex-wrap gap-1.5">
                    {attributes.map((a, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded text-xs font-medium text-gray-900 dark:text-white">
                        <span className="font-mono text-[10px] text-gray-400 mr-0.5">{String(i + 1).padStart(2, '0')}</span>
                        {a}
                        {a === primaryAttr && <span className="ml-1 px-1 py-px text-[9px] uppercase tracking-wider font-semibold rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">primary</span>}
                        {a === secondaryAttr && <span className="ml-1 px-1 py-px text-[9px] uppercase tracking-wider font-semibold rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">secondary</span>}
                      </span>
                    ))}
                  </div>
                </Section>
              </div>
              <div className="flex flex-col gap-4">
                <Section title="Card preview">
                  <div className="flex justify-center py-2 pb-4">
                    <div className="w-[306px] h-[187px] rounded-[14px] overflow-hidden relative text-white shadow-lg" style={{
                      background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                    }}>
                      {bgUrl && <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                      <div className="relative z-10 flex flex-col justify-between h-full p-4">
                        <div className="flex justify-between items-start">
                          <div className="text-[11px] opacity-80 font-medium uppercase tracking-wider">{metaName}</div>
                          {logoUrl && <img src={logoUrl} alt="" className="h-7 w-auto object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                        </div>
                        <div>
                          <div className="text-[18px] font-semibold mb-1.5">{metaName}</div>
                          <div className="font-mono text-[11px] opacity-75 leading-relaxed">
                            {primaryAttr && <div>{`{{${primaryAttr}}}`}</div>}
                            {secondaryAttr && <div>{`{{${secondaryAttr}}}`}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                    <KV label="Primary attribute" value={<b className="text-gray-900 dark:text-white font-medium">{primaryAttr || '—'}</b>} />
                    <KV label="Secondary attribute" value={<b className="text-gray-900 dark:text-white font-medium">{secondaryAttr || '—'}</b>} />
                  </div>
                </Section>
              </div>
            </div>
          )}

          {tab === 'schema' && (
            <div className="space-y-4">
              <Section title="Linked schema">
                <div className="p-3.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-[34px] h-[34px] rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 grid place-items-center">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold text-gray-900 dark:text-white">{schemaName}</div>
                      <div className="text-[11.5px] text-gray-400">Version {schemaVersion} · {attributes.length} attributes</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                    <KV label="Schema ID" value={schemaId} mono copy />
                    <KV label="Issuer" value={issuerDid} mono copy />
                  </div>
                </div>
              </Section>
              <Section title="Attribute schema">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[50px_2fr_1.2fr_1fr] gap-2.5 px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
                    <div>#</div><div>Name</div><div>Role</div><div>Type</div>
                  </div>
                  {attributes.map((a, i) => {
                    const role = a === primaryAttr ? 'primary' : a === secondaryAttr ? 'secondary' : '—'
                    return (
                      <div key={i} className="grid grid-cols-[50px_2fr_1.2fr_1fr] gap-2.5 px-3.5 py-2.5 text-[13px] text-gray-500 border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                        <div className="font-mono text-gray-400">{String(i + 1).padStart(2, '0')}</div>
                        <div className="font-medium text-gray-900 dark:text-white">{a}</div>
                        <div>{role === '—' ? <span className="text-gray-300">—</span> : <span className="px-1.5 py-0.5 text-[10.5px] bg-gray-100 dark:bg-gray-800 rounded font-medium">{role}</span>}</div>
                        <div className="font-mono text-gray-400">string</div>
                      </div>
                    )
                  })}
                </div>
              </Section>
            </div>
          )}

          {tab === 'branding' && (
            <div className="grid grid-cols-[1.4fr_1fr] gap-4">
              <div className="flex flex-col gap-4">
                <Section title="Colors">
                  <div className="grid grid-cols-2 gap-2.5">
                    {[{ label: 'Primary', color: primaryColor }, { label: 'Secondary', color: secondaryColor }].map((c, i) => (
                      <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="w-9 h-9 rounded-lg shrink-0 border border-white/15 shadow-inner" style={{ background: c.color }} />
                        <div>
                          <div className="text-[11.5px] text-gray-400">{c.label}</div>
                          <div className="font-mono text-xs text-gray-900 dark:text-white">{c.color}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
                <Section title="Assets">
                  <div className="grid grid-cols-1 gap-3.5">
                    <KV label="Logo URL" value={logoUrl ? <a href={logoUrl} target="_blank" className="text-blue-600 break-all">{logoUrl}</a> : <span className="text-gray-300">Not set</span>} mono copy={!!logoUrl} />
                    <KV label="Background URL" value={bgUrl ? <a href={bgUrl} target="_blank" className="text-blue-600 break-all">{bgUrl}</a> : <span className="text-gray-300">Not set</span>} mono copy={!!bgUrl} />
                  </div>
                </Section>
                <Section title="Display attributes">
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                    <KV label="Primary" value={<b className="text-gray-900 dark:text-white font-medium">{primaryAttr || '—'}</b>} />
                    <KV label="Secondary" value={<b className="text-gray-900 dark:text-white font-medium">{secondaryAttr || '—'}</b>} />
                  </div>
                </Section>
              </div>
              <div>
                <Section title="Preview" right={<span className="px-1.5 py-0.5 text-[10.5px] bg-gray-100 dark:bg-gray-800 rounded font-medium">OCA overlay</span>}>
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-[306px] h-[187px] rounded-[14px] overflow-hidden relative text-white shadow-lg" style={{
                      background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                    }}>
                      {bgUrl && <img src={bgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                      <div className="relative z-10 flex flex-col justify-between h-full p-4">
                        <div className="flex justify-between items-start">
                          <div className="text-[11px] opacity-80 font-medium uppercase tracking-wider">{metaName}</div>
                          {logoUrl && <img src={logoUrl} alt="" className="h-7 w-auto object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />}
                        </div>
                        <div>
                          <div className="text-[18px] font-semibold mb-1.5">{metaName}</div>
                          <div className="font-mono text-[11px] opacity-75 leading-relaxed">
                            {primaryAttr && <div>{`{{${primaryAttr}}}`}</div>}
                            {secondaryAttr && <div>{`{{${secondaryAttr}}}`}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-[11px] text-gray-400">How issued credentials will appear in wallets</div>
                  </div>
                </Section>
              </div>
            </div>
          )}

          {tab === 'raw' && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-[10px] bg-white dark:bg-gray-900 overflow-hidden">
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <span className="font-mono text-[11.5px] text-gray-400">credential-definition.json</span>
                <button onClick={() => navigator.clipboard.writeText(JSON.stringify({ id, issuerDid, schemaId, tag: tagVal, format, attributes, branding: overlay?.branding, meta: overlay?.meta, createdAt: cd.createdAt }, null, 2))}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M5 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V5"/></svg>
                  Copy
                </button>
              </div>
              <pre className="p-4 font-mono text-xs leading-relaxed text-gray-500 overflow-x-auto whitespace-pre">
                {JSON.stringify({ id, issuerDid, schemaId, tag: tagVal, format, attributes, branding: overlay?.branding, meta: overlay?.meta, createdAt: cd.createdAt, updatedAt: cd.updatedAt }, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shrink-0">
          <div className="text-[11.5px] text-gray-400">
            Last updated <span className="text-gray-600 dark:text-gray-300">{cd.updatedAt ? new Date(cd.updatedAt).toLocaleString() : cd.createdAt ? new Date(cd.createdAt).toLocaleString() : '—'}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-100">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
