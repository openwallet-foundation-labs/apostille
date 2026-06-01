'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useNotifications } from '../context/NotificationContext'
import { Icon } from './ui/Icons'
import type { ICON_PATHS } from './ui/Icons'

type IconName = keyof typeof ICON_PATHS

type NotifMeta = {
  category: string
  iconName: IconName
  iconColor: string
  title: string
  body: string
  from: string
  time: string
  actionHint?: string
  onClick?: () => void
}

function relativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - Date.parse(iso)
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function formatItem(
  n: any,
  resolveConnectionName: (id: string) => string,
  navigate: (path: string) => void,
  closePanel: () => void,
): NotifMeta {
  const t = String(n?.type || '')
  const d: any = n?.data || {}
  const time = relativeTime(n?.createdAt || '')
  const connId = d?.connectionId || ''
  const from = connId ? resolveConnectionName(connId) : ''

  if (t === 'AppMessageReceived') {
    let body = String(d?.content || '')
    try {
      const parsed = JSON.parse(body)
      if (parsed?.type === 'pdf-signing-shared') {
        return {
          category: 'PDF Signing', iconName: 'fileSig', iconColor: 'oklch(0.60 0.18 200)',
          title: 'PDF received for signing', body: '', from, time,
          actionHint: '→ Open PDF signing',
          onClick: () => { navigate('/dashboard/pdf-signing'); closePanel() },
        }
      }
      if (parsed?.type === 'pdf-signing-signed-returned') {
        return {
          category: 'PDF Signing', iconName: 'fileSig', iconColor: 'oklch(0.60 0.18 200)',
          title: 'Signed PDF returned', body: '', from, time,
          actionHint: '→ Open PDF signing',
          onClick: () => { navigate('/dashboard/pdf-signing'); closePanel() },
        }
      }
      if (parsed?.type === 'pdf-signing-owner-ack') {
        return {
          category: 'PDF Signing', iconName: 'fileSig', iconColor: 'oklch(0.60 0.18 200)',
          title: 'PDF signing acknowledged', body: '', from, time,
          actionHint: '→ Open PDF signing',
          onClick: () => { navigate('/dashboard/pdf-signing'); closePanel() },
        }
      }
      if (parsed?.type) {
        body = parsed.type.replace(/-/g, ' ')
      }
    } catch {}
    return {
      category: 'Message', iconName: 'msg', iconColor: 'oklch(0.65 0.18 250)',
      title: 'New message', body: body.slice(0, 80), from, time,
      actionHint: '→ Open messages',
      onClick: connId ? () => { navigate(`/dashboard/connections?openConnection=${connId}`); closePanel() } : undefined,
    }
  }

  if (t === 'WebRTCIncomingOffer') {
    return {
      category: 'Call', iconName: 'phone', iconColor: 'oklch(0.62 0.20 160)',
      title: 'Incoming call', body: '', from, time,
      actionHint: '→ Go to calls',
      onClick: () => { navigate('/dashboard/calls'); closePanel() },
    }
  }

  if (t === 'MissedCall') {
    return {
      category: 'Call', iconName: 'phone', iconColor: 'oklch(0.55 0.20 25)',
      title: 'Missed call', body: '', from, time,
      actionHint: '→ Go to calls',
      onClick: () => { navigate('/dashboard/calls'); closePanel() },
    }
  }

  if (t === 'DidCommCredentialStateChanged' || t.includes('CredentialStateChanged')) {
    const state = d?.credentialRecord?.state || d?.state || ''
    const stateLabels: Record<string, string> = {
      'offer-received': 'Credential offer received',
      'request-sent': 'Credential request sent',
      'credential-received': 'Credential received',
      'done': 'Credential exchange completed',
      'abandoned': 'Credential exchange abandoned',
    }
    return {
      category: 'Credentials', iconName: 'badge', iconColor: 'oklch(0.62 0.20 160)',
      title: stateLabels[state] || `Credential: ${state}`, body: '', from, time,
      actionHint: '→ View credentials',
      onClick: () => { navigate('/dashboard/credentials'); closePanel() },
    }
  }

  if (t === 'ProofStateChanged' || t.includes('ProofStateChanged')) {
    const state = d?.proofRecord?.state || d?.state || ''
    const stateLabels: Record<string, string> = {
      'request-received': 'Proof request received',
      'presentation-sent': 'Proof submitted',
      'done': 'Proof exchange completed',
      'abandoned': 'Proof exchange abandoned',
    }
    return {
      category: 'Proofs', iconName: 'shieldCheck', iconColor: 'oklch(0.60 0.18 280)',
      title: stateLabels[state] || `Proof: ${state}`, body: '', from, time,
      actionHint: '→ View proofs',
      onClick: () => { navigate('/dashboard/proofs'); closePanel() },
    }
  }

  if (t.includes('Workflow')) {
    const state = d?.newState || d?.state || ''
    const status = d?.newStatus || d?.status || ''
    const label = d?.templateName || d?.workflowId || ''
    const title = status === 'completed' ? 'Workflow completed' : status === 'waiting' ? 'Workflow needs input' : 'Workflow updated'
    return {
      category: 'Workflow', iconName: 'workflow', iconColor: 'oklch(0.60 0.18 30)',
      title, body: label || state, from, time,
      actionHint: '→ View workflows',
      onClick: () => { navigate('/dashboard/workflows'); closePanel() },
    }
  }

  if (t.includes('Signing')) {
    const state = d?.sessionRecord?.state || d?.state || ''
    const role = d?.sessionRecord?.role || d?.role || ''
    const sigLabels: Record<string, string> = {
      'request-received': role === 'signer' ? 'Signing request received' : 'Signing request sent',
      'consent-received': 'Signer consented',
      'signature-received': 'Document signed',
      'completed': 'Signing completed',
      'declined': 'Signing declined',
    }
    return {
      category: 'Signing', iconName: 'pen', iconColor: 'oklch(0.58 0.18 310)',
      title: sigLabels[state] || `Signing: ${state}`, body: '', from, time,
      actionHint: '→ View signing',
      onClick: () => { navigate('/dashboard/signing'); closePanel() },
    }
  }

  if (t === 'PoeRequestReceived' || t === 'PoeStateChanged' || t === 'PoeSubmitReceived' || t === 'PoeCompleted') {
    const labels: Record<string, string> = {
      PoeRequestReceived: 'Execution proof request',
      PoeSubmitReceived: 'Execution proof submitted',
      PoeCompleted: 'Execution proof completed',
      PoeStateChanged: `POE: ${d?.state || ''}`,
    }
    return {
      category: 'Proof of Execution', iconName: 'log', iconColor: 'oklch(0.58 0.18 340)',
      title: labels[t] || t, body: '', from, time,
      actionHint: '→ View proof of execution',
      onClick: () => { navigate('/dashboard/poe'); closePanel() },
    }
  }

  if (t.startsWith('Calendar')) {
    const calLabels: Record<string, string> = {
      CalendarEventStateChanged: 'Calendar event updated',
      CalendarInviteeStatusChanged: 'Invitee status changed',
      CalendarPollCompleted: 'Calendar poll completed',
      CalendarEventCancelled: 'Calendar event cancelled',
      CalendarReminderTriggered: 'Calendar reminder',
    }
    const eventTitle = d?.title || d?.eventTitle || ''
    return {
      category: 'Calendar', iconName: 'calendar', iconColor: 'oklch(0.62 0.18 80)',
      title: calLabels[t] || 'Calendar event', body: eventTitle, from, time,
      actionHint: '→ View calendar',
      onClick: () => { navigate('/dashboard/calendar'); closePanel() },
    }
  }

  const readable = t.replace(/([A-Z])/g, ' $1').trim()
  return { category: 'System', iconName: 'bell', iconColor: 'var(--ink-3)', title: readable, body: '', from, time }
}

export default function NotificationBell() {
  const { displayNotifications, unread, clear, dismiss, resolveConnectionName } = useNotifications()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const recent = useMemo(() => displayNotifications.slice(0, 12), [displayNotifications])

  const closePanel = () => setOpen(false)

  const computePos = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelWidth = 340
    const margin = 8
    const left = Math.max(margin, Math.min(r.right - panelWidth, window.innerWidth - panelWidth - margin))
    setPos({ top: r.bottom + margin, left })
  }

  useEffect(() => {
    if (open) computePos()
    const onResize = () => open && computePos()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: 'relative', padding: '7px 8px', borderRadius: 8, border: 'none',
          background: open ? 'var(--bg-elev)' : 'transparent', cursor: 'pointer',
          color: 'var(--ink-2)', transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elev)'; e.currentTarget.style.color = 'var(--ink)' }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-2)' } }}
        aria-label="Notifications"
      >
        <Icon name="bell" size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            fontSize: 10, fontWeight: 700,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 8, background: 'var(--accent)',
            color: 'white', display: 'grid', placeItems: 'center',
            lineHeight: 1,
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && pos && typeof window !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 9990,
            width: 340, maxWidth: 'calc(100vw - 16px)',
            background: 'var(--bg-elev)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-xl)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px 10px',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Notifications</span>
            {recent.length > 0 && (
              <button
                onClick={clear}
                style={{
                  fontSize: 11, color: 'var(--ink-3)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '2px 6px',
                  borderRadius: 4, transition: 'color 0.12s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-3)' }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div style={{
                padding: '28px 16px', textAlign: 'center',
                fontSize: 13, color: 'var(--ink-4)',
              }}>
                No notifications
              </div>
            ) : (
              recent.map((n) => {
                const f = formatItem(n, resolveConnectionName, router.push.bind(router), closePanel)
                return (
                  <div
                    key={n.id}
                    onClick={f.onClick}
                    style={{
                      display: 'flex', gap: 10, padding: '10px 14px',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${f.iconColor}`,
                      cursor: f.onClick ? 'pointer' : 'default',
                      transition: f.onClick ? 'background 0.1s' : undefined,
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => { if (f.onClick) e.currentTarget.style.background = 'var(--bg-sunk)' }}
                    onMouseLeave={(e) => { if (f.onClick) e.currentTarget.style.background = '' }}
                  >
                    <div style={{
                      flexShrink: 0, width: 28, height: 28, borderRadius: 6,
                      background: 'var(--bg-sunk)',
                      display: 'grid', placeItems: 'center',
                    }}>
                      <Icon name={f.iconName} size={13} style={{ color: f.iconColor }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>{f.title}</span>
                        {f.from && (
                          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                            {f.from}
                          </span>
                        )}
                      </div>
                      {f.body && (
                        <div style={{
                          fontSize: 12, color: 'var(--ink-3)', marginTop: 2,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {f.body}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 10, color: 'var(--ink-4)',
                            background: 'var(--bg-sunk)', padding: '1px 6px',
                            borderRadius: 4,
                          }}>
                            {f.category}
                          </span>
                          {f.time && (
                            <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>{f.time}</span>
                          )}
                        </div>
                        {f.actionHint && (
                          <span style={{
                            fontSize: 10, color: f.onClick ? 'var(--accent)' : 'var(--ink-4)',
                            fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0,
                          }}>
                            {f.actionHint}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(n.id) }}
                      style={{
                        flexShrink: 0, alignSelf: 'flex-start', marginTop: 2,
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, lineHeight: 1, color: 'var(--ink-4)',
                        padding: '2px 4px', borderRadius: 4,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'var(--bg-sunk)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-4)'; e.currentTarget.style.background = 'none' }}
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
