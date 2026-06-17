"use client"
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { calendarApi, connectionApi } from '@/lib/api'
import { useNotifications } from '../../context/NotificationContext'

// ─────────────────────────── types ───────────────────────────

type CalendarEvent = {
  id: string
  eventId: string
  role: string
  organizerState?: string
  inviteeState?: string
  event: {
    event_id: string
    title: string
    type: string
    start?: string
    end?: string
    timezone?: string
    organizer: string
    participants: Array<{ did: string; role: string; status: string }>
    sequence: number
    sensitivity: string
    allow_delegation: boolean
    recurrence?: { rrule: string } | null
    description?: string
    location?: string
    call_config?: { topology?: 'mesh' | 'sfu'; media?: string[]; meeting_id?: string }
  }
  timeOptions?: Array<{ option_id: string; start: string; end: string; timezone: string }>
  connectionId?: string
}

type Connection = { id: string; theirLabel?: string; theirDid?: string; state: string }

type Tab = 'upcoming' | 'all' | 'invitations' | 'create'

// ─────────────────────────── component ───────────────────────────

export default function CalendarPage() {
  const { token } = useAuth()
  const { notifications } = useNotifications()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [tab, setTab] = useState<Tab>('upcoming')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [createMode, setCreateMode] = useState<'fixed' | 'poll'>('fixed')
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [multiDay, setMultiDay] = useState(false)
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState('')
  const [invitees, setInvitees] = useState<Connection[]>([])
  const [showInviteePicker, setShowInviteePicker] = useState(false)
  const [pollOptions, setPollOptions] = useState<Array<{ id: string; start: string; end: string }>>([
    { id: '1', start: '', end: '' },
  ])
  const [hasMeeting, setHasMeeting] = useState(false)
  const [meetingId, setMeetingId] = useState(makeMeetingId())
  const [meetingMedia, setMeetingMedia] = useState<{ audio: boolean; video: boolean }>({ audio: true, video: true })
  const [meetingTopology, setMeetingTopology] = useState<'mesh' | 'sfu'>('mesh')

  const regenMeetingId = () => setMeetingId(makeMeetingId())

  // ─── data ───

  const fetchEvents = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res =
        tab === 'upcoming'
          ? await calendarApi.getUpcoming()
          : tab === 'invitations'
            ? await calendarApi.listEvents({ role: 'invitee' })
            : await calendarApi.listEvents()
      setEvents((res as any)?.data || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }, [token, tab])

  const fetchConnections = useCallback(async () => {
    if (!token) return
    try {
      const res = await connectionApi.getAll()
      const list = (res as any)?.connections || (res as any)?.data || []
      setConnections(Array.isArray(list) ? list.filter((c: Connection) => c.state === 'completed') : [])
    } catch {
      /* ignore */
    }
  }, [token])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])
  useEffect(() => {
    fetchConnections()
  }, [fetchConnections])

  // Refresh on calendar WebSocket events
  useEffect(() => {
    if (!notifications.length) return
    const latest = notifications[0]
    const type = (latest as any)?.type || ''
    if (type.startsWith('Calendar')) fetchEvents()
  }, [notifications, fetchEvents])

  // ─── handlers ───

  const resetForm = () => {
    setTitle('')
    setEventDate('')
    setStartTime('')
    setEndTime('')
    setEndDate('')
    setMultiDay(false)
    setNotes('')
    setLocation('')
    setInvitees([])
    setHasMeeting(false)
    setMeetingId(makeMeetingId())
    setPollOptions([{ id: '1', start: '', end: '' }])
  }

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!invitees.length) {
      setError('Add at least one invitee')
      return
    }
    setError(null)
    try {
      const eventType = hasMeeting ? 'call' : 'meeting'
      const startISO = new Date(`${eventDate}T${startTime}`).toISOString()
      const endISO = new Date(`${(multiDay && endDate) || eventDate}T${endTime}`).toISOString()

      await Promise.all(
        invitees.map((c) =>
          calendarApi.invite({
            title,
            type: eventType,
            start: startISO,
            end: endISO,
            timezone,
            participant_dids: c.theirDid ? [c.theirDid] : [],
            connection_id: c.id,
            organizer_did: '',
            allow_delegation: false,
            description: notes || undefined,
            location: location || undefined,
            ...(hasMeeting
              ? {
                  call_config: {
                    topology: meetingTopology,
                    media: [
                      ...(meetingMedia.audio ? ['audio'] : []),
                      ...(meetingMedia.video ? ['video'] : []),
                    ],
                    meeting_id: meetingId,
                  },
                }
              : {}),
          } as any)
        )
      )
      resetForm()
      setTab('upcoming')
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to create event')
    }
  }

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (!invitees.length) {
      setError('Add at least one invitee')
      return
    }
    const options = pollOptions
      .filter((o) => o.start && o.end)
      .map((o, idx) => ({
        option_id: `opt-${idx + 1}`,
        start: new Date(o.start).toISOString(),
        end: new Date(o.end).toISOString(),
        timezone,
      }))
    if (!options.length) {
      setError('Add at least one time option')
      return
    }
    setError(null)
    try {
      await Promise.all(
        invitees.map((c) =>
          calendarApi.propose({
            title,
            type: hasMeeting ? 'call' : 'meeting',
            time_options: options,
            participant_dids: c.theirDid ? [c.theirDid] : [],
            connection_id: c.id,
            organizer_did: '',
          } as any)
        )
      )
      resetForm()
      setTab('upcoming')
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to create proposal')
    }
  }

  const handleAccept = async (eventId: string) => {
    try {
      await calendarApi.accept({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to accept')
    }
  }
  const handleDecline = async (eventId: string) => {
    try {
      await calendarApi.decline({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to decline')
    }
  }
  const handleTentative = async (eventId: string) => {
    try {
      await calendarApi.tentative({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to mark tentative')
    }
  }
  const handleCancel = async (eventId: string) => {
    try {
      await calendarApi.cancel({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel')
    }
  }

  // ─── derived ───

  const upcomingEvents = useMemo(() => events.filter((e) => e.role === 'organizer' || e.inviteeState === 'accepted'), [
    events,
  ])
  const invitationEvents = useMemo(
    () => events.filter((e) => e.role === 'invitee' && (e.inviteeState === 'invited' || e.inviteeState === 'pending')),
    [events]
  )

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: upcomingEvents.length },
    { key: 'invitations', label: 'Invitations', count: invitationEvents.length },
    { key: 'all', label: 'All events' },
    { key: 'create', label: 'Create' },
  ]

  const inviteeUnselected = useMemo(
    () => connections.filter((c) => !invitees.find((i) => i.id === c.id)),
    [connections, invitees]
  )

  // ─── render ───

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-sub">Decentralized scheduling tied to DIDComm peers.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
          >
            Export ICS
          </button>
          <button
            type="button"
            onClick={() => setTab(tab === 'create' ? 'upcoming' : 'create')}
            className={tab === 'create' ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
          >
            {tab === 'create' ? 'Back to calendar' : '+ New invitation'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
            style={{
              borderBottomColor: tab === t.key ? 'var(--accent)' : 'transparent',
              color: tab === t.key ? 'var(--accent-ink)' : 'var(--ink-4)',
            }}
          >
            {t.label}
            {t.count != null && (
              <span
                className="inline-flex items-center justify-center rounded-full text-[10px] font-semibold min-w-[18px] h-[18px] px-1.5"
                style={
                  tab === t.key
                    ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' }
                    : { background: 'var(--bg-sunk)', color: 'var(--ink-3)' }
                }
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'var(--red-soft)', border: '1px solid var(--red-border)', color: 'var(--red-ink)' }}>{error}</div>
      )}

      {/* Create */}
      {tab === 'create' && (
        <form
          onSubmit={createMode === 'fixed' ? handleCreateInvite : handleCreateProposal}
          className="rounded-xl p-6 space-y-5"
          style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)' }}
        >
          {/* Mode toggle */}
          <div className="flex rounded-lg p-1" style={{ background: 'var(--bg-sunk)' }}>
            <button
              type="button"
              onClick={() => setCreateMode('fixed')}
              className="flex-1 py-2 text-sm font-medium rounded-md transition-colors"
              style={
                createMode === 'fixed'
                  ? { background: 'var(--bg-elev)', color: 'var(--ink)', boxShadow: 'var(--shadow-sm)' }
                  : { color: 'var(--ink-3)', background: 'transparent' }
              }
            >
              Fixed time
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('poll')}
              className="flex-1 py-2 text-sm font-medium rounded-md transition-colors"
              style={
                createMode === 'poll'
                  ? { background: 'var(--bg-elev)', color: 'var(--ink)', boxShadow: 'var(--shadow-sm)' }
                  : { color: 'var(--ink-3)', background: 'transparent' }
              }
            >
              Time poll
            </button>
          </div>

          {/* Title */}
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Credential review with BWN Wallet"
              className="input w-full"
            />
          </Field>

          {/* Time row */}
          {createMode === 'fixed' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => {
                      setEventDate(e.target.value)
                      if (!endDate) setEndDate(e.target.value)
                    }}
                    required
                    className="input w-full"
                  />
                </Field>
                <Field label="Start">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="input w-full"
                  />
                </Field>
                <Field label="End">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    className="input w-full"
                  />
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--ink-2)' }}>
                  <input
                    type="checkbox"
                    checked={multiDay}
                    onChange={(e) => setMultiDay(e.target.checked)}
                    className="rounded"
                    style={{ borderColor: 'var(--border)' }}
                  />
                  Multi-day event
                </label>
                {multiDay && (
                  <div>
                    <label className="block text-xs mb-0.5" style={{ color: 'var(--ink-4)' }}>End date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={eventDate}
                      className="input"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {createMode === 'poll' && (
            <Field label="Proposed times">
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <div key={opt.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--bg-sunk)', border: '1px solid var(--border)' }}>
                    <span className="text-xs w-5" style={{ color: 'var(--ink-4)' }}>{idx + 1}</span>
                    <input
                      type="datetime-local"
                      value={opt.start}
                      onChange={(e) =>
                        setPollOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, start: e.target.value } : o)))
                      }
                      className="input flex-1"
                    />
                    <span style={{ color: 'var(--ink-4)' }}>—</span>
                    <input
                      type="datetime-local"
                      value={opt.end}
                      onChange={(e) =>
                        setPollOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, end: e.target.value } : o)))
                      }
                      className="input flex-1"
                    />
                    {pollOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions((prev) => prev.filter((o) => o.id !== opt.id))}
                        className="text-lg leading-none transition-colors"
                        style={{ color: 'var(--red)' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPollOptions((prev) => [...prev, { id: String(Date.now()), start: '', end: '' }])}
                  className="w-full py-2 rounded-lg text-sm transition-colors"
                  style={{ border: '2px dashed var(--border)', color: 'var(--ink-4)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-4)' }}
                >
                  + Add another time option
                </button>
              </div>
            </Field>
          )}

          {/* Invitees */}
          <Field label="Invitees">
            <div className="flex flex-wrap items-center gap-2 p-2 rounded-lg min-h-[44px]" style={{ border: '1px solid var(--border)' }}>
              {invitees.map((p) => (
                <div
                  key={p.id}
                  className="inline-flex items-center gap-2 pl-2 pr-1 py-1 rounded-full text-sm"
                  style={{ background: 'var(--bg-sunk)', color: 'var(--ink)' }}
                >
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center text-[10px] font-semibold">
                    {(p.theirLabel || p.id).slice(0, 2).toUpperCase()}
                  </span>
                  <span className="font-medium">{p.theirLabel || p.id.slice(0, 12)}</span>
                  {p.theirDid && (
                    <span className="text-[11px] font-mono" style={{ color: 'var(--ink-4)' }}>{shortDid(p.theirDid)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setInvitees((prev) => prev.filter((x) => x.id !== p.id))}
                    className="w-5 h-5 rounded-full inline-flex items-center justify-center transition-colors"
                    style={{ color: 'var(--ink-4)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    aria-label="Remove invitee"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowInviteePicker((v) => !v)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-sm rounded-md transition-colors"
                  style={{ color: 'var(--accent-ink)' }}
                >
                  + Add from connections
                </button>
                {showInviteePicker && (
                  <div className="absolute z-20 left-0 mt-1 w-72 max-h-72 overflow-auto rounded-lg shadow-lg" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
                    {inviteeUnselected.length === 0 && (
                      <div className="px-3 py-4 text-sm text-center" style={{ color: 'var(--ink-4)' }}>No connections available</div>
                    )}
                    {inviteeUnselected.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setInvitees((prev) => [...prev, c])
                          setShowInviteePicker(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm last:border-b-0 transition-colors"
                        style={{ borderBottom: '1px solid var(--border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-sunk)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center text-xs font-semibold">
                          {(c.theirLabel || c.id).slice(0, 2).toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate" style={{ color: 'var(--ink)' }}>{c.theirLabel || c.id.slice(0, 12)}</div>
                          {c.theirDid && (
                            <div className="text-[11px] font-mono truncate" style={{ color: 'var(--ink-4)' }}>{shortDid(c.theirDid)}</div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Field>

          {/* Location */}
          <Field label="Location" hint="optional">
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input w-full"
              placeholder="Virtual / Address…"
            />
          </Field>

          {/* Notes */}
          <Field label="Notes" hint="optional">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="input w-full"
              placeholder="Anything your invitee should know…"
            />
          </Field>

          {/* WebRTC meeting toggle */}
          {!hasMeeting ? (
            <button
              type="button"
              onClick={() => setHasMeeting(true)}
              className="w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
              style={{ border: '2px dashed var(--border)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-soft)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 inline-flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Add WebRTC meeting</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--ink-4)' }}>
                  Generate a secure meeting link, signaled over DIDComm.
                </div>
              </div>
              <span className="px-3 py-1 bg-primary-600 text-white rounded-md text-xs font-medium">+ Add</span>
            </button>
          ) : (
            <div className="p-4 rounded-lg space-y-3" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)' }}>
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-primary-600 text-white inline-flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium" style={{ color: 'var(--ink)' }}>WebRTC meeting</div>
                  <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--ink-4)' }}>essi.studio/meet/{meetingId}</div>
                </div>
                <button
                  type="button"
                  onClick={regenMeetingId}
                  className="btn btn-secondary btn-sm"
                  title="Regenerate"
                >
                  ↻
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(`essi.studio/meet/${meetingId}`)}
                  className="btn btn-secondary btn-sm"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => setHasMeeting(false)}
                  className="px-2 py-1 text-lg leading-none transition-colors"
                  style={{ color: 'var(--ink-4)' }}
                  title="Remove meeting"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-4 pl-12">
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
                  <input
                    type="checkbox"
                    checked={meetingMedia.audio}
                    onChange={(e) => setMeetingMedia((m) => ({ ...m, audio: e.target.checked }))}
                  />
                  Audio
                </label>
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
                  <input
                    type="checkbox"
                    checked={meetingMedia.video}
                    onChange={(e) => setMeetingMedia((m) => ({ ...m, video: e.target.checked }))}
                  />
                  Video
                </label>
                <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
                  Topology
                  <select
                    value={meetingTopology}
                    onChange={(e) => setMeetingTopology(e.target.value as 'mesh' | 'sfu')}
                    className="input"
                    style={{ padding: '2px 8px', height: 28, fontSize: 12 }}
                  >
                    <option value="mesh">Mesh (P2P)</option>
                    <option value="sfu">SFU</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={() => {
                resetForm()
                setTab('upcoming')
              }}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <div className="flex-1" />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
            >
              {createMode === 'fixed' ? 'Send invite' : 'Send poll'}
            </button>
          </div>
        </form>
      )}

      {/* Upcoming list */}
      {tab === 'upcoming' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
          {loading && <div className="p-6 text-sm" style={{ color: 'var(--ink-4)' }}>Loading…</div>}
          {!loading && upcomingEvents.length === 0 && <EmptyState label="No upcoming events" />}
          {!loading &&
            upcomingEvents.map((ev, i) => (
              <EventRow
                key={ev.id}
                ev={ev}
                stateLabel={ev.role === 'organizer' ? ev.organizerState : ev.inviteeState}
                onCancel={ev.role === 'organizer' ? () => handleCancel(ev.eventId) : undefined}
                isLast={i === upcomingEvents.length - 1}
              />
            ))}
        </div>
      )}

      {/* Invitations */}
      {tab === 'invitations' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
          {loading && <div className="p-6 text-sm" style={{ color: 'var(--ink-4)' }}>Loading…</div>}
          {!loading && invitationEvents.length === 0 && <EmptyState label="No pending invitations" />}
          {!loading &&
            invitationEvents.map((ev, i) => (
              <InvitationRow
                key={ev.id}
                ev={ev}
                onAccept={() => handleAccept(ev.eventId)}
                onDecline={() => handleDecline(ev.eventId)}
                onTentative={() => handleTentative(ev.eventId)}
                isLast={i === invitationEvents.length - 1}
              />
            ))}
        </div>
      )}

      {/* All events */}
      {tab === 'all' && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elev)', border: '1px solid var(--border)' }}>
          {loading && <div className="p-6 text-sm" style={{ color: 'var(--ink-4)' }}>Loading…</div>}
          {!loading && events.length === 0 && <EmptyState label="No events yet" />}
          {!loading &&
            events.map((ev, i) => (
              <EventRow
                key={ev.id}
                ev={ev}
                stateLabel={ev.role === 'organizer' ? ev.organizerState : ev.inviteeState}
                isLast={i === events.length - 1}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────── small components ───────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--ink-2)' }}>
        {label} {hint && <span className="text-xs font-normal" style={{ color: 'var(--ink-4)' }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="p-12 text-center" style={{ color: 'var(--ink-4)' }}>
      <div className="flex justify-center mb-3">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--ink-5)' }}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
      <p className="font-medium" style={{ color: 'var(--ink-2)' }}>{label}</p>
      <p className="text-sm mt-1">Create an event to get started</p>
    </div>
  )
}

function EventRow({
  ev,
  stateLabel,
  onCancel,
  isLast,
}: {
  ev: CalendarEvent
  stateLabel?: string
  onCancel?: () => void
  isLast?: boolean
}) {
  const start = ev.event.start ? new Date(ev.event.start) : null
  const end = ev.event.end ? new Date(ev.event.end) : null
  const day = start ? start.toLocaleDateString(undefined, { weekday: 'short' }) : '—'
  const date = start ? String(start.getDate()).padStart(2, '0') : '—'
  const when = start && end ? `${fmtTime(start)} — ${fmtTime(end)}` : start ? fmtTime(start) : 'all day'
  const isCall = ev.event.type === 'call'
  return (
    <div
      className="flex items-center gap-4 px-5 py-4"
      style={!isLast ? { borderBottom: '1px solid var(--border)' } : undefined}
    >
      <div className="w-14 text-center rounded-lg py-2" style={{ background: 'var(--bg-sunk)' }}>
        <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--ink-4)' }}>{day}</div>
        <div className="text-lg font-semibold tracking-tight" style={{ color: 'var(--ink)' }}>{date}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{ev.event.title}</div>
        <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--ink-4)' }}>
          {isCall ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          )}
          <span>{when}</span>
          {ev.event.location && (
            <>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span className="truncate">{ev.event.location}</span>
            </>
          )}
        </div>
      </div>
      <StateBadge state={stateLabel} />
      {isCall && ev.event.call_config?.meeting_id && (
        <button
          type="button"
          onClick={() => window.open(`/dashboard/calls?meeting=${ev.event.call_config?.meeting_id}`, '_blank')}
          className="btn btn-primary btn-sm"
        >
          Join
        </button>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary btn-sm"
          style={{ color: 'var(--ink-3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--red-ink)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--red-border)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ink-3)'; (e.currentTarget as HTMLElement).style.borderColor = '' }}
        >
          Cancel
        </button>
      )}
    </div>
  )
}

function InvitationRow({
  ev,
  onAccept,
  onDecline,
  onTentative,
  isLast,
}: {
  ev: CalendarEvent
  onAccept: () => void
  onDecline: () => void
  onTentative: () => void
  isLast?: boolean
}) {
  const start = ev.event.start ? new Date(ev.event.start) : null
  const when = start ? `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${fmtTime(start)}` : 'TBD'
  const from = ev.event.organizer ? shortDid(ev.event.organizer) : 'Unknown'
  return (
    <div
      className="flex items-center gap-4 px-5 py-4"
      style={!isLast ? { borderBottom: '1px solid var(--border)' } : undefined}
    >
      <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 inline-flex items-center justify-center text-sm font-semibold">
        {from.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{ev.event.title}</div>
        <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: 'var(--ink-4)' }}>
          <span>
            From <b style={{ color: 'var(--ink-2)' }}>{from}</b>
          </span>
          <span style={{ color: 'var(--ink-5)' }}>•</span>
          <span>{when}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onDecline} className="btn btn-ghost btn-sm">Decline</button>
        <button type="button" onClick={onTentative} className="btn btn-secondary btn-sm">Tentative</button>
        <button type="button" onClick={onAccept} className="btn btn-primary btn-sm">Accept</button>
      </div>
    </div>
  )
}

function StateBadge({ state }: { state?: string }) {
  const style = (() => {
    switch (state) {
      case 'accepted':
      case 'confirmed':
      case 'completed':
        return { background: 'var(--green-soft)', color: 'var(--green-ink)' }
      case 'declined':
      case 'cancelled':
      case 'failed':
        return { background: 'var(--red-soft)', color: 'var(--red-ink)' }
      case 'tentative':
      case 'proposing':
      case 'polling':
        return { background: 'var(--amber-soft)', color: 'var(--amber-ink)' }
      case 'pending':
      case 'invited':
        return { background: 'var(--accent-soft)', color: 'var(--accent-ink)' }
      default:
        return { background: 'var(--bg-sunk)', color: 'var(--ink-3)' }
    }
  })()
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium" style={style}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {state || '—'}
    </span>
  )
}

// ─────────────────────────── helpers ───────────────────────────

function makeMeetingId() {
  const part = () => Math.random().toString(36).slice(2, 7)
  return `apo-${part()}-${part()}`
}

function shortDid(did: string) {
  if (!did) return ''
  if (did.length <= 22) return did
  return `${did.slice(0, 12)}…${did.slice(-6)}`
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
