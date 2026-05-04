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

      // Send one invite per invitee (the API expects a single connection_id).
      // If only one invitee, this is a single call.
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
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Decentralized scheduling tied to DIDComm peers.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            ↓ Export ICS
          </button>
          <button
            type="button"
            onClick={() => setTab(tab === 'create' ? 'upcoming' : 'create')}
            className={
              tab === 'create'
                ? 'inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50'
                : 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700'
            }
          >
            {tab === 'create' ? '← Back to calendar' : '+ New invitation'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ' +
              (tab === t.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700')
            }
          >
            {t.label}
            {t.count != null && (
              <span
                className={
                  'inline-flex items-center justify-center rounded-full text-[10px] font-semibold min-w-[18px] h-[18px] px-1.5 ' +
                  (tab === t.key ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600')
                }
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Create */}
      {tab === 'create' && (
        <form
          onSubmit={createMode === 'fixed' ? handleCreateInvite : handleCreateProposal}
          className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5"
        >
          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setCreateMode('fixed')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                createMode === 'fixed' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
            >
              Fixed time
            </button>
            <button
              type="button"
              onClick={() => setCreateMode('poll')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                createMode === 'poll' ? 'bg-white shadow text-gray-900' : 'text-gray-500'
              }`}
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </Field>
                <Field label="Start">
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </Field>
                <Field label="End">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </Field>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiDay}
                    onChange={(e) => setMultiDay(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Multi-day event
                </label>
                {multiDay && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">End date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={eventDate}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
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
                  <div key={opt.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <span className="text-xs text-gray-400 w-5">{idx + 1}</span>
                    <input
                      type="datetime-local"
                      value={opt.start}
                      onChange={(e) =>
                        setPollOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, start: e.target.value } : o)))
                      }
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                    <span className="text-gray-400">—</span>
                    <input
                      type="datetime-local"
                      value={opt.end}
                      onChange={(e) =>
                        setPollOptions((prev) => prev.map((o) => (o.id === opt.id ? { ...o, end: e.target.value } : o)))
                      }
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm"
                    />
                    {pollOptions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions((prev) => prev.filter((o) => o.id !== opt.id))}
                        className="text-red-400 hover:text-red-600 text-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setPollOptions((prev) => [...prev, { id: String(Date.now()), start: '', end: '' }])}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700"
                >
                  + Add another time option
                </button>
              </div>
            </Field>
          )}

          {/* Invitees — chip multiselect */}
          <Field label="Invitees">
            <div className="flex flex-wrap items-center gap-2 p-2 border border-gray-300 rounded-lg min-h-[44px]">
              {invitees.map((p) => (
                <div
                  key={p.id}
                  className="inline-flex items-center gap-2 pl-2 pr-1 py-1 bg-gray-100 rounded-full text-sm"
                >
                  <span className="w-5 h-5 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center text-[10px] font-semibold">
                    {(p.theirLabel || p.id).slice(0, 2).toUpperCase()}
                  </span>
                  <span className="font-medium">{p.theirLabel || p.id.slice(0, 12)}</span>
                  {p.theirDid && (
                    <span className="text-[11px] text-gray-400 font-mono">{shortDid(p.theirDid)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setInvitees((prev) => prev.filter((x) => x.id !== p.id))}
                    className="w-5 h-5 rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 inline-flex items-center justify-center"
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
                  className="inline-flex items-center gap-1 px-2 py-1 text-sm text-primary-700 hover:bg-primary-50 rounded-md"
                >
                  + Add from connections
                </button>
                {showInviteePicker && (
                  <div className="absolute z-20 left-0 mt-1 w-72 max-h-72 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                    {inviteeUnselected.length === 0 && (
                      <div className="px-3 py-4 text-sm text-gray-500 text-center">No connections available</div>
                    )}
                    {inviteeUnselected.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setInvitees((prev) => [...prev, c])
                          setShowInviteePicker(false)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 text-sm border-b border-gray-100 last:border-b-0"
                      >
                        <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 inline-flex items-center justify-center text-xs font-semibold">
                          {(c.theirLabel || c.id).slice(0, 2).toUpperCase()}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{c.theirLabel || c.id.slice(0, 12)}</div>
                          {c.theirDid && (
                            <div className="text-[11px] text-gray-400 font-mono truncate">{shortDid(c.theirDid)}</div>
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Virtual / Address…"
            />
          </Field>

          {/* Notes */}
          <Field label="Notes" hint="optional">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              placeholder="Anything your invitee should know…"
            />
          </Field>

          {/* WebRTC meeting toggle */}
          {!hasMeeting ? (
            <button
              type="button"
              onClick={() => setHasMeeting(true)}
              className="w-full flex items-center gap-3 p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50/40 text-left transition-colors"
            >
              <span className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 inline-flex items-center justify-center">
                ▶
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">Add WebRTC meeting</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Generate a secure meeting link, signaled over DIDComm.
                </div>
              </div>
              <span className="px-3 py-1 bg-primary-600 text-white rounded-md text-xs font-medium">+ Add</span>
            </button>
          ) : (
            <div className="p-4 bg-primary-50 border border-primary-200 rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-primary-600 text-white inline-flex items-center justify-center">
                  ▶
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">WebRTC meeting</div>
                  <div className="text-xs text-gray-500 font-mono mt-0.5">essi.studio/meet/{meetingId}</div>
                </div>
                <button
                  type="button"
                  onClick={regenMeetingId}
                  className="px-2 py-1 border border-primary-300 bg-white rounded text-xs hover:bg-primary-100"
                  title="Regenerate"
                >
                  ↻
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(`essi.studio/meet/${meetingId}`)}
                  className="px-2 py-1 border border-primary-300 bg-white rounded text-xs hover:bg-primary-100"
                >
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => setHasMeeting(false)}
                  className="px-2 py-1 text-gray-400 hover:text-gray-700 text-lg leading-none"
                  title="Remove meeting"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-4 pl-12">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={meetingMedia.audio}
                    onChange={(e) => setMeetingMedia((m) => ({ ...m, audio: e.target.checked }))}
                  />
                  Audio
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={meetingMedia.video}
                    onChange={(e) => setMeetingMedia((m) => ({ ...m, video: e.target.checked }))}
                  />
                  Video
                </label>
                <label className="flex items-center gap-2 text-sm">
                  Topology
                  <select
                    value={meetingTopology}
                    onChange={(e) => setMeetingTopology(e.target.value as 'mesh' | 'sfu')}
                    className="px-2 py-1 border border-primary-300 rounded text-xs bg-white"
                  >
                    <option value="mesh">Mesh (P2P)</option>
                    <option value="sfu">SFU</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                resetForm()
                setTab('upcoming')
              }}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <div className="flex-1" />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
            >
              ↗ {createMode === 'fixed' ? 'Send invite' : 'Send poll'}
            </button>
          </div>
        </form>
      )}

      {/* Upcoming list */}
      {tab === 'upcoming' && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
          {loading && <div className="p-6 text-sm text-gray-500">Loading…</div>}
          {!loading && upcomingEvents.length === 0 && <EmptyState label="No upcoming events" />}
          {!loading &&
            upcomingEvents.map((ev) => (
              <EventRow
                key={ev.id}
                ev={ev}
                stateLabel={ev.role === 'organizer' ? ev.organizerState : ev.inviteeState}
                onCancel={ev.role === 'organizer' ? () => handleCancel(ev.eventId) : undefined}
              />
            ))}
        </div>
      )}

      {/* Invitations */}
      {tab === 'invitations' && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
          {loading && <div className="p-6 text-sm text-gray-500">Loading…</div>}
          {!loading && invitationEvents.length === 0 && <EmptyState label="No pending invitations" />}
          {!loading &&
            invitationEvents.map((ev) => (
              <InvitationRow
                key={ev.id}
                ev={ev}
                onAccept={() => handleAccept(ev.eventId)}
                onDecline={() => handleDecline(ev.eventId)}
                onTentative={() => handleTentative(ev.eventId)}
              />
            ))}
        </div>
      )}

      {/* All events */}
      {tab === 'all' && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
          {loading && <div className="p-6 text-sm text-gray-500">Loading…</div>}
          {!loading && events.length === 0 && <EmptyState label="No events yet" />}
          {!loading &&
            events.map((ev) => (
              <EventRow
                key={ev.id}
                ev={ev}
                stateLabel={ev.role === 'organizer' ? ev.organizerState : ev.inviteeState}
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
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {hint && <span className="text-xs text-gray-400 font-normal">{hint}</span>}
      </label>
      {children}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="p-12 text-center text-gray-400">
      <div className="text-3xl mb-2">📅</div>
      <p className="font-medium text-gray-600">{label}</p>
      <p className="text-sm mt-1">Create an event to get started</p>
    </div>
  )
}

function EventRow({
  ev,
  stateLabel,
  onCancel,
}: {
  ev: CalendarEvent
  stateLabel?: string
  onCancel?: () => void
}) {
  const start = ev.event.start ? new Date(ev.event.start) : null
  const end = ev.event.end ? new Date(ev.event.end) : null
  const day = start ? start.toLocaleDateString(undefined, { weekday: 'short' }) : '—'
  const date = start ? String(start.getDate()).padStart(2, '0') : '—'
  const when = start && end ? `${fmtTime(start)} — ${fmtTime(end)}` : start ? fmtTime(start) : 'all day'
  const isCall = ev.event.type === 'call'
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-14 text-center bg-gray-50 rounded-lg py-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{day}</div>
        <div className="text-lg font-semibold tracking-tight">{date}</div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{ev.event.title}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          <span>{isCall ? '🎥' : '📅'}</span>
          <span>{when}</span>
          {ev.event.location && (
            <>
              <span className="text-gray-300">·</span>
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
          className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          Join
        </button>
      )}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-red-600 border border-gray-200 rounded-md hover:bg-red-50"
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
}: {
  ev: CalendarEvent
  onAccept: () => void
  onDecline: () => void
  onTentative: () => void
}) {
  const start = ev.event.start ? new Date(ev.event.start) : null
  const when = start ? `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${fmtTime(start)}` : 'TBD'
  const from = ev.event.organizer ? shortDid(ev.event.organizer) : 'Unknown'
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 inline-flex items-center justify-center text-sm font-semibold">
        {from.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{ev.event.title}</div>
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
          <span>
            From <b className="text-gray-700">{from}</b>
          </span>
          <span className="text-gray-300">•</span>
          <span>{when}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onDecline}
          className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={onTentative}
          className="px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Tentative
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-md hover:bg-primary-700"
        >
          Accept
        </button>
      </div>
    </div>
  )
}

function StateBadge({ state }: { state?: string }) {
  const cls = (() => {
    switch (state) {
      case 'accepted':
      case 'confirmed':
      case 'completed':
        return 'bg-green-100 text-green-700'
      case 'declined':
      case 'cancelled':
      case 'failed':
        return 'bg-red-100 text-red-700'
      case 'tentative':
      case 'proposing':
      case 'polling':
        return 'bg-yellow-100 text-yellow-700'
      case 'pending':
      case 'invited':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-600'
    }
  })()
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
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
