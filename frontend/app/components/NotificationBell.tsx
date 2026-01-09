'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotifications } from '../context/NotificationContext'

function formatItem(n: any) {
  const t = String(n?.type || '')
  if (t === 'AppMessageReceived') {
    const c = n?.data?.content || '(no content)'
    const when = n?.data?.sentTime ? new Date(n.data.sentTime).toLocaleTimeString() : ''
    return { title: 'New message', body: c, meta: when }
  }
  if (t === 'AppMessageSent') {
    const c = n?.data?.content || '(no content)'
    const when = n?.data?.sentTime ? new Date(n.data.sentTime).toLocaleTimeString() : ''
    return { title: 'Message sent', body: c, meta: when }
  }
  if (t.includes('Workflow')) {
    const state = n?.data?.newState || n?.data?.state || ''
    return { title: 'Workflow update', body: state, meta: '' }
  }
  return { title: t, body: '', meta: '' }
}

export default function NotificationBell() {
  const { notifications, unread } = useNotifications()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const recent = useMemo(() => notifications.slice(0, 8), [notifications])

  // Position the panel using a portal so it overlays everything (z-index)
  const computePos = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const panelWidth = 320
    const margin = 8
    const left = Math.max(margin, Math.min(r.right - panelWidth, window.innerWidth - panelWidth - margin))
    const top = r.bottom + margin
    setPos({ top, left })
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

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-3 rounded-2xl bg-surface-200/60 hover:bg-surface-200 text-text-secondary hover:text-text-primary transition"
        aria-label="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary-600 text-white font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && pos && typeof window !== 'undefined' && createPortal(
        <div
          className="w-80 max-w-[90vw] rounded-2xl border border-border-primary/30 bg-surface-100 shadow-xl p-2"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
        >
          <div className="px-2 py-1 text-xs font-semibold text-text-secondary">Notifications</div>
          <div className="max-h-72 overflow-y-auto divide-y divide-border-primary/20">
            {recent.length === 0 && (
              <div className="px-3 py-4 text-sm text-text-tertiary">No notifications yet</div>
            )}
            {recent.map((n) => {
              const f = formatItem(n)
              return (
                <div key={n.id} className="px-3 py-2">
                  <div className="text-sm font-semibold text-text-primary">{f.title}</div>
                  {f.body && <div className="text-sm text-text-secondary truncate">{f.body}</div>}
                  {f.meta && <div className="text-xs text-text-tertiary mt-0.5">{f.meta}</div>}
                </div>
              )}
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
