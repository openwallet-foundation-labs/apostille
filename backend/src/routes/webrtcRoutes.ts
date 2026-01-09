import { Router, Request, Response } from 'express'
import { getAgent } from '../services/agentService'

const router = Router()

// Helper to read tenant id from auth middleware
function getTenantId(req: Request) {
  // req.user is attached by auth middleware
  return (req as any)?.user?.tenantId as string | undefined
}

// Start call (offer)
router.post('/start', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    const { connectionId, threadId, parentThreadId, roomId, sdp, iceServers } = req.body as {
      connectionId: string
      threadId: string
      parentThreadId?: string
      roomId?: string
      sdp: string
      iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>
    }

    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })
    if (!connectionId || !threadId || !sdp) {
      return res.status(400).json({ success: false, message: 'connectionId, threadId and sdp are required' })
    }

    const agent = await getAgent({ tenantId })
    const pthid = parentThreadId || roomId || undefined
    await agent.modules.webrtc.startCall({
      connectionId,
      threadId,
      parentThreadId: pthid && pthid.length >= 8 ? pthid : undefined,
      sdp,
      iceServers,
    })
    res.json({ success: true })
  } catch (e: any) {
    console.error('[webrtc/start] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// Send answer
router.post('/answer', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    const { connectionId, threadId, parentThreadId, roomId, sdp } = req.body as {
      connectionId: string
      threadId: string
      parentThreadId?: string
      roomId?: string
      sdp: string
    }
    console.log('[webrtc/answer] Received answer request:', { connectionId, threadId, tenantId, sdpLength: sdp?.length })
    console.log('[webrtc/answer] SDP has video:', sdp?.includes('m=video'), 'audio:', sdp?.includes('m=audio'))
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })
    if (!connectionId || !threadId || !sdp) {
      return res.status(400).json({ success: false, message: 'connectionId, threadId and sdp are required' })
    }
    console.log('[webrtc/answer] Getting agent for tenant:', tenantId)
    const agent = await getAgent({ tenantId })
    const pthid = parentThreadId || roomId || undefined
    console.log('[webrtc/answer] Calling acceptCall on agent...')
    await agent.modules.webrtc.acceptCall({ connectionId, threadId, parentThreadId: pthid && pthid.length >= 8 ? pthid : undefined, sdp })
    console.log('[webrtc/answer] Answer sent successfully via DIDComm')
    res.json({ success: true })
  } catch (e: any) {
    console.error('[webrtc/answer] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// Send ICE candidate or end-of-candidates
router.post('/ice', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    const { connectionId, threadId, parentThreadId, roomId, candidate, endOfCandidates } = req.body as {
      connectionId: string
      threadId: string
      parentThreadId?: string
      roomId?: string
      candidate?: Record<string, unknown>
      endOfCandidates?: boolean
    }
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })
    if (!connectionId || !threadId) {
      return res.status(400).json({ success: false, message: 'connectionId and threadId are required' })
    }
    const agent = await getAgent({ tenantId })
    const pthid = parentThreadId || roomId || undefined
    await agent.modules.webrtc.sendIce({
      connectionId,
      threadId,
      parentThreadId: pthid && pthid.length >= 8 ? pthid : undefined,
      candidate,
      endOfCandidates,
    })
    res.json({ success: true })
  } catch (e: any) {
    console.error('[webrtc/ice] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// End call
router.post('/end', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    const { connectionId, threadId, parentThreadId, roomId, reason } = req.body as {
      connectionId: string
      threadId: string
      parentThreadId?: string
      roomId?: string
      reason?: string
    }
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })
    if (!connectionId || !threadId) {
      return res.status(400).json({ success: false, message: 'connectionId and threadId are required' })
    }
    const agent = await getAgent({ tenantId })
    const pthid = parentThreadId || roomId || undefined
    await agent.modules.webrtc.endCall({ connectionId, threadId, parentThreadId: pthid && pthid.length >= 8 ? pthid : undefined, reason })
    res.json({ success: true })
  } catch (e: any) {
    console.error('[webrtc/end] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// TURN/STUN config provider - returns ICE servers for WebRTC
router.get('/turn', async (req: Request, res: Response) => {
  try {
    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = []

    // Always add public STUN servers (no auth needed)
    iceServers.push({ urls: 'stun:stun.l.google.com:19302' })
    iceServers.push({ urls: 'stun:stun1.l.google.com:19302' })

    // Add custom TURN servers if configured (with auth)
    if (process.env.WEBRTC_TURN_USERNAME && process.env.WEBRTC_TURN_CREDENTIAL) {
      const username = process.env.WEBRTC_TURN_USERNAME
      const credential = process.env.WEBRTC_TURN_CREDENTIAL
      const urls = process.env.WEBRTC_STUN_URLS || ''

      // Parse STUN/TURN URLs and add credentials only to TURN servers
      for (const url of urls.split(',').map((u) => u.trim()).filter(Boolean)) {
        if (url.startsWith('turn:') || url.startsWith('turns:')) {
          iceServers.push({ urls: url, username, credential })
        } else if (url.startsWith('stun:')) {
          iceServers.push({ urls: url })
        }
      }

      // If no TURN URLs were in WEBRTC_STUN_URLS, fall through to public TURN servers
      const hasTurn = iceServers.some((s) =>
        (typeof s.urls === 'string' ? s.urls : s.urls[0])?.startsWith('turn')
      )
    } else {
      // Fallback to free public TURN servers
      iceServers.push({ urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' })
      iceServers.push({ urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' })
      iceServers.push({ urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' })
    }

    res.json({ iceServers })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

export default router
