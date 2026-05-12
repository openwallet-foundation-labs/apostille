/**
 * Calendar Integration Tests
 *
 * Tests the Calendar 1.0 DIDComm protocol endpoints:
 * - Event creation (invite)
 * - RSVP (accept, decline, tentative)
 * - Event listing and filtering
 * - Event cancellation
 * - Poll-based scheduling
 * - WebRTC call scheduling (reminder with join_call)
 *
 * Run with: npx jest --testPathPattern=calendar --runInBand
 */

import {
  config,
  authenticatedRequest,
  registerTenant,
  createInvitation,
  TenantInfo,
  waitFor,
} from './setup'

describe('Calendar Integration Tests', () => {
  jest.setTimeout(120000)

  let organizer: TenantInfo
  let invitee: TenantInfo
  let connectionId: string

  beforeAll(async () => {
    // Register two tenants
    organizer = await registerTenant('Calendar Organizer')
    invitee = await registerTenant('Calendar Invitee')
    console.log(`Organizer: ${organizer.email} (${organizer.tenantId})`)
    console.log(`Invitee: ${invitee.email} (${invitee.tenantId})`)

    // Establish DIDComm connection between them
    const inv = await createInvitation(organizer.token, 'Calendar Test')
    const invUrl = inv.invitationUrl || inv.url
    const receiveRes = await authenticatedRequest('/api/connections/receive-invitation', invitee.token, {
      method: 'POST',
      body: JSON.stringify({ invitationUrl: invUrl }),
    })
    const receiveData = await receiveRes.json()
    connectionId = receiveData?.connectionRecord?.id || receiveData?.id || ''

    // Wait for connection to be established
    await waitFor(async () => {
      const res = await authenticatedRequest('/api/connections', organizer.token)
      const data = await res.json()
      const conns = data?.data || data || []
      return conns.some((c: any) => c.state === 'completed')
    }, 30000)

    // Get organizer's connection ID
    const orgConns = await authenticatedRequest('/api/connections', organizer.token)
    const orgData = await orgConns.json()
    const orgConnList = orgData?.data || orgData || []
    const orgConn = orgConnList.find((c: any) => c.state === 'completed')
    if (orgConn) connectionId = orgConn.id
    console.log(`Connection established: ${connectionId}`)
  })

  // ── Basic Event CRUD ──────────────────────────────────────────────

  describe('Event Lifecycle', () => {
    let eventId: string

    it('POST /api/calendar/invite — creates a meeting event', async () => {
      const res = await authenticatedRequest('/api/calendar/invite', organizer.token, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Test Meeting',
          type: 'meeting',
          start: new Date(Date.now() + 3600000).toISOString(),
          end: new Date(Date.now() + 7200000).toISOString(),
          timezone: 'UTC',
          participant_dids: [],
          connection_id: connectionId,
          organizer_did: '',
        }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data?.eventId).toBeTruthy()
      eventId = data.data.eventId
    })

    it('GET /api/calendar/events — lists events', async () => {
      const res = await authenticatedRequest('/api/calendar/events', organizer.token)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBeGreaterThanOrEqual(1)
    })

    it('GET /api/calendar/events/:eventId — gets single event', async () => {
      const res = await authenticatedRequest(`/api/calendar/events/${eventId}`, organizer.token)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data?.eventId).toBe(eventId)
      expect(data.data?.event?.title).toBe('Test Meeting')
    })

    it('GET /api/calendar/upcoming — lists upcoming events', async () => {
      const res = await authenticatedRequest('/api/calendar/upcoming', organizer.token)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
    })

    it('POST /api/calendar/update — updates the event', async () => {
      const res = await authenticatedRequest('/api/calendar/update', organizer.token, {
        method: 'POST',
        body: JSON.stringify({
          event_id: eventId,
          changes: { title: 'Updated Meeting' },
          reason: 'test update',
        }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data?.event?.title).toBe('Updated Meeting')
      expect(data.data?.event?.sequence).toBeGreaterThan(0)
    })

    it('POST /api/calendar/cancel — cancels the event', async () => {
      const res = await authenticatedRequest('/api/calendar/cancel', organizer.token, {
        method: 'POST',
        body: JSON.stringify({
          event_id: eventId,
          reason: 'test cancellation',
        }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data?.organizerState).toBe('cancelled')
    })
  })

  // ── Call Event with WebRTC ────────────────────────────────────────

  describe('Call Event Scheduling', () => {
    let callEventId: string

    it('POST /api/calendar/invite — creates a call event with call_config', async () => {
      const res = await authenticatedRequest('/api/calendar/invite', organizer.token, {
        method: 'POST',
        body: JSON.stringify({
          title: 'Team Standup Call',
          type: 'call',
          start: new Date(Date.now() + 3600000).toISOString(),
          end: new Date(Date.now() + 5400000).toISOString(),
          timezone: 'UTC',
          participant_dids: [],
          connection_id: connectionId,
          organizer_did: '',
          call_config: {
            topology: 'mesh',
            media: ['audio', 'video'],
          },
        }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      expect(data.data?.event?.type).toBe('call')
      expect(data.data?.event?.call_config?.topology).toBe('mesh')
      callEventId = data.data.eventId
    })

    it('POST /api/calendar/send-reminder — sends join_call reminder', async () => {
      const res = await authenticatedRequest('/api/calendar/send-reminder', organizer.token, {
        method: 'POST',
        body: JSON.stringify({
          event_id: callEventId,
          connection_id: connectionId,
          offset_minutes: -15,
          action: 'join_call',
        }),
      })
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })
  })

  // ── Error Handling ────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('POST /api/calendar/accept — fails without event_id', async () => {
      const res = await authenticatedRequest('/api/calendar/accept', organizer.token, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })

    it('GET /api/calendar/events/nonexistent — returns error for missing event', async () => {
      const res = await authenticatedRequest('/api/calendar/events/nonexistent-id', organizer.token)
      expect(res.status).toBe(500) // event_not_found error
    })

    it('POST /api/calendar/cancel — fails without event_id', async () => {
      const res = await authenticatedRequest('/api/calendar/cancel', organizer.token, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(400)
    })
  })

  // ── Filter Queries ────────────────────────────────────────────────

  describe('Filtered Queries', () => {
    it('GET /api/calendar/events?role=organizer — filters by role', async () => {
      const res = await authenticatedRequest('/api/calendar/events?role=organizer', organizer.token)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
      for (const ev of data.data || []) {
        expect(ev.role).toBe('organizer')
      }
    })

    it('GET /api/calendar/events?connectionId=... — filters by connection', async () => {
      const res = await authenticatedRequest(
        `/api/calendar/events?connectionId=${connectionId}`,
        organizer.token
      )
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })
  })
})
