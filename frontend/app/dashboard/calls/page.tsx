"use client"
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { apiGet, apiPost } from '../../utils/api'
import { connectionApi } from '@/lib/api'
import { useNotifications } from '../../context/NotificationContext'

type Connection = { id: string; theirLabel?: string; state: string }
type OfferEvt = { connectionId: string; threadId: string; sdp: string; theirLabel?: string; pthid?: string }
type IceServer = { urls: string | string[]; username?: string; credential?: string }
type IceConfigResponse = { iceServers: IceServer[]; ttlSeconds?: number; expiresAt?: string }

function RemoteVideo({ stream, label }: { stream: MediaStream | null; label?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (ref.current && stream) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream
        ref.current.play().catch(e => console.error('[RemoteVideo] Play failed:', e))
      }
    }
  }, [stream, label])

  return (
    <div className="relative w-full h-full bg-surface-900 rounded-2xl overflow-hidden">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={false}
        className="absolute inset-0 w-full h-full object-cover"
      />
      {label && (
        <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm">
          <span className="text-sm font-medium text-white">{label}</span>
        </div>
      )}
    </div>
  )
}

// Phone icons
const PhoneIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
)

const PhoneOffIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
)

const VideoIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
)

const UserIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
)

export default function CallsPage() {
  const { token } = useAuth()
  const { notifications } = useNotifications()

  // Directory
  const [connections, setConnections] = useState<Connection[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Ringtone audio ref
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)

  // Single peer state (1-on-1 calls only)
  const roomIdRef = useRef<string | null>(null)
  const pcRef = useRef<{ pc: RTCPeerConnection; threadId: string; connectionId: string } | null>(null)
  const thidToConnRef = useRef<Map<string, string>>(new Map())
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const [remotePeer, setRemotePeer] = useState<{ connectionId: string; label?: string } | null>(null)

  // Local media
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  // TURN/STUN config cache
  const iceCfgRef = useRef<({ iceServers: IceServer[]; iceTransportPolicy: 'all'; iceCandidatePoolSize: number } & { expiresAtMs: number }) | null>(null)

  // Incoming call state
  const [incomingCall, setIncomingCall] = useState<OfferEvt | null>(null)
  const processedIdsRef = useRef<Set<string>>(new Set())
  const recentNotificationsRef = useRef<Map<string, number>>(new Map())
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map())
  const [status, setStatus] = useState<'idle' | 'calling' | 'incoming' | 'connected'>('idle')
  const [callingPeer, setCallingPeer] = useState<Connection | null>(null)

  // Ringtone control
  const playRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.loop = true
      ringtoneRef.current.play().catch(() => {})
    }
  }, [])

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause()
      ringtoneRef.current.currentTime = 0
    }
  }, [])

  // Load connections
  useEffect(() => {
    if (!token) return
    connectionApi
      .getAll()
      .then((resp: any) => setConnections(resp.connections?.filter((c: Connection) => c.state === 'completed') || []))
      .catch(() => setConnections([]))
  }, [token])

  // Filter connections by search
  const filteredConnections = useMemo(() => {
    if (!searchQuery.trim()) return connections
    const q = searchQuery.toLowerCase()
    return connections.filter(c =>
      c.theirLabel?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    )
  }, [connections, searchQuery])

  // Prefetch ICE config
  const getIceConfig = useCallback(async () => {
    if (iceCfgRef.current && Date.now() < (iceCfgRef.current.expiresAtMs - 60_000)) return iceCfgRef.current
    const cfg = await apiGet('/api/webrtc/turn').catch((): IceConfigResponse => ({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      ttlSeconds: 300,
    }))
    const typedCfg = cfg as IceConfigResponse
    const ttlSeconds = Number.isFinite(typedCfg.ttlSeconds) && (typedCfg.ttlSeconds as number) > 0
      ? Math.floor(typedCfg.ttlSeconds as number)
      : 3600
    const expiresAtMs = typedCfg.expiresAt ? Date.parse(typedCfg.expiresAt) : Date.now() + ttlSeconds * 1000
    iceCfgRef.current = {
      iceServers: typedCfg.iceServers || [],
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 10,
      expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + ttlSeconds * 1000,
    }
    return iceCfgRef.current
  }, [])

  // Acquire local media
  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      localStreamRef.current = s
      if (localVideoRef.current) localVideoRef.current.srcObject = s
      return s
    } catch {
      alert('Failed to get camera/mic permission')
      throw new Error('media-failed')
    }
  }, [])

  // Stop local media
  const stopLocalMedia = useCallback(() => {
    const s = localStreamRef.current
    if (s) {
      for (const track of s.getTracks()) {
        try { track.stop() } catch {}
      }
    }
    if (localVideoRef.current) {
      try { (localVideoRef.current as any).srcObject = null } catch {}
    }
    localStreamRef.current = null
  }, [])

  // Process buffered ICE candidates
  const processPendingIceCandidates = useCallback(async (connectionId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceCandidatesRef.current.get(connectionId)
    if (pending && pending.length > 0) {
      for (const candidate of pending) {
        try { await pc.addIceCandidate(candidate) } catch {}
      }
      pendingIceCandidatesRef.current.delete(connectionId)
    }
  }, [])

  // Create peer connection
  const createPeer = useCallback(async (connectionId: string, threadId: string, roomId: string, label?: string) => {
    const iceCfg = await getIceConfig()
    const pc = new RTCPeerConnection(iceCfg)
    pcRef.current = { pc, threadId, connectionId }
    thidToConnRef.current.set(threadId, connectionId)

    pc.ontrack = (e) => {
      const stream = e.streams?.[0]
      if (stream) {
        remoteStreamRef.current = stream
        setRemotePeer({ connectionId, label })
      }
    }

    pc.onicecandidate = (e) => {
      apiPost('/api/webrtc/ice', {
        connectionId,
        threadId,
        parentThreadId: roomId,
        candidate: e.candidate ?? undefined,
        endOfCandidates: e.candidate == null,
      }).catch(() => {})
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setStatus('connected')
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.error('[WebRTC] Connection state:', pc.connectionState)
      }
    }

    const local = await ensureLocalStream()
    local.getTracks().forEach((t) => pc.addTrack(t, local))
    return pc
  }, [ensureLocalStream, getIceConfig])

  // Start 1-on-1 call
  const startCall = useCallback(async (connection: Connection) => {
    const roomId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    roomIdRef.current = roomId
    setStatus('calling')
    setCallingPeer(connection)

    await ensureLocalStream()
    const pc = await createPeer(connection.id, threadId, roomId, connection.theirLabel)
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
    await pc.setLocalDescription(offer)
    const iceCfg = await getIceConfig()
    await apiPost('/api/webrtc/start', {
      connectionId: connection.id,
      threadId,
      roomId,
      sdp: offer.sdp,
      iceServers: iceCfg.iceServers,
    })
  }, [createPeer, ensureLocalStream, getIceConfig])

  // End call
  const endCall = useCallback(async () => {
    const roomId = roomIdRef.current
    const peer = pcRef.current
    if (peer) {
      await apiPost('/api/webrtc/end', {
        connectionId: peer.connectionId,
        threadId: peer.threadId,
        parentThreadId: roomId,
        reason: 'hangup'
      }).catch(() => {})
      try { peer.pc.close() } catch {}
    }
    pcRef.current = null
    thidToConnRef.current.clear()
    remoteStreamRef.current = null
    setRemotePeer(null)
    roomIdRef.current = null
    setStatus('idle')
    setCallingPeer(null)
    stopLocalMedia()
  }, [stopLocalMedia])

  // Handle WebRTC events
  const handleWsEvent = useCallback(async (evt: any) => {
    const p = evt?.data
    if (!evt?.type || !p) return

    if (evt.type === 'WebRTCIncomingOffer') {
      const connId = p.connectionId || p.context?.connection?.id
      const thid = p.thid
      const roomId = p.pthid || p.parentThreadId || ''

      // If already in a call, reject new offers
      if (pcRef.current) return

      setIncomingCall({
        connectionId: connId,
        threadId: thid,
        sdp: p.sdp,
        theirLabel: p.theirLabel,
        pthid: roomId
      })
      setStatus('incoming')
    }

    if (evt.type === 'WebRTCIncomingAnswer') {
      const thid = p.thid
      const connId = thidToConnRef.current.get(thid)
      if (!connId || !pcRef.current) return
      const pc = pcRef.current.pc
      await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp })
      await processPendingIceCandidates(connId, pc)
      setStatus('connected')
    }

    if (evt.type === 'WebRTCIncomingIce') {
      const thid = p.thid
      const connId = thidToConnRef.current.get(thid)
      if (!connId || !pcRef.current) return
      const pc = pcRef.current.pc

      if (pc.remoteDescription) {
        await pc.addIceCandidate(p.endOfCandidates ? null : p.candidate)
      } else {
        if (!p.endOfCandidates) {
          if (!pendingIceCandidatesRef.current.has(connId)) {
            pendingIceCandidatesRef.current.set(connId, [])
          }
          pendingIceCandidatesRef.current.get(connId)?.push(p.candidate)
        }
      }
    }

    if (evt.type === 'WebRTCCallEnded') {
      const thid = p.thid
      const connId = thidToConnRef.current.get(thid)
      if (connId && pcRef.current?.connectionId === connId) {
        try { pcRef.current.pc.close() } catch {}
        pcRef.current = null
        thidToConnRef.current.delete(thid)
        remoteStreamRef.current = null
        pendingIceCandidatesRef.current.delete(connId)
        setRemotePeer(null)
        roomIdRef.current = null
        setStatus('idle')
        setCallingPeer(null)
        stopLocalMedia()
      }
    }
  }, [processPendingIceCandidates, stopLocalMedia])

  // Process notifications
  useEffect(() => {
    if (!notifications || notifications.length === 0) return
    const now = Date.now()
    const DUPLICATE_WINDOW_MS = 1000

    for (const [key, timestamp] of recentNotificationsRef.current.entries()) {
      if (now - timestamp > 5000) recentNotificationsRef.current.delete(key)
    }

    for (const n of notifications) {
      if (!n?.id || processedIdsRef.current.has(n.id)) continue

      const p = n?.data
      let duplicateKey = `${n.type}:${p?.connectionId || ''}:${p?.thid || ''}`
      if (n.type === 'WebRTCIncomingIce' && p?.candidate) {
        const candidateStr = typeof p.candidate === 'string' ? p.candidate : p.candidate?.candidate || ''
        duplicateKey += `:${candidateStr.slice(0, 50)}`
      }
      const lastSeen = recentNotificationsRef.current.get(duplicateKey)

      if (lastSeen && (now - lastSeen) < DUPLICATE_WINDOW_MS) {
        processedIdsRef.current.add(n.id)
        continue
      }

      recentNotificationsRef.current.set(duplicateKey, now)
      processedIdsRef.current.add(n.id)
      void handleWsEvent(n)
    }
  }, [notifications, handleWsEvent])

  // Accept incoming call
  const acceptCall = useCallback(async () => {
    stopRingtone()
    const call = incomingCall
    if (!call) return

    const roomId = call.pthid || crypto.randomUUID()
    roomIdRef.current = roomId
    await ensureLocalStream()
    setStatus('connected')

    const pc = await createPeer(call.connectionId, call.threadId, roomId, call.theirLabel)
    await pc.setRemoteDescription({ type: 'offer', sdp: call.sdp })
    await processPendingIceCandidates(call.connectionId, pc)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await apiPost('/api/webrtc/answer', {
      connectionId: call.connectionId,
      threadId: call.threadId,
      parentThreadId: roomId,
      sdp: answer.sdp
    })
    setIncomingCall(null)
  }, [createPeer, ensureLocalStream, incomingCall, processPendingIceCandidates, stopRingtone])

  // Reject incoming call
  const rejectCall = useCallback(async () => {
    stopRingtone()
    const call = incomingCall
    if (!call) return
    await apiPost('/api/webrtc/end', {
      connectionId: call.connectionId,
      threadId: call.threadId,
      parentThreadId: call.pthid,
      reason: 'rejected'
    }).catch(() => {})
    setIncomingCall(null)
    setStatus('idle')
  }, [incomingCall, stopRingtone])

  // Play ringtone on incoming
  useEffect(() => {
    if (status === 'incoming') playRingtone()
    else stopRingtone()
  }, [status, playRingtone, stopRingtone])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { pcRef.current?.pc.close() } catch {}
      pcRef.current = null
      stopLocalMedia()
      stopRingtone()
    }
  }, [stopLocalMedia, stopRingtone])

  const inCall = status === 'calling' || status === 'connected'
  const callerName = incomingCall?.theirLabel || connections.find(c => c.id === incomingCall?.connectionId)?.theirLabel || 'Unknown'

  return (
    <div className="h-full">
      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface-100 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center animate-pulse">
              <UserIcon className="w-10 h-10 text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-1">Incoming Call</h2>
            <p className="text-text-secondary mb-8">{callerName}</p>
            <div className="flex justify-center gap-6">
              <button
                onClick={rejectCall}
                className="w-16 h-16 rounded-full bg-error-500 hover:bg-error-600 text-white flex items-center justify-center transition-colors shadow-lg"
              >
                <PhoneOffIcon className="w-7 h-7" />
              </button>
              <button
                onClick={acceptCall}
                className="w-16 h-16 rounded-full bg-success-500 hover:bg-success-600 text-white flex items-center justify-center transition-colors shadow-lg"
              >
                <PhoneIcon className="w-7 h-7" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In Call View */}
      {inCall ? (
        <div className="h-[calc(100vh-200px)] flex flex-col">
          {/* Main video area */}
          <div className="flex-1 relative bg-surface-900 rounded-2xl overflow-hidden">
            {/* Remote video (full size) */}
            {remotePeer ? (
              <RemoteVideo
                stream={remoteStreamRef.current}
                label={remotePeer.label || remotePeer.connectionId}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                <div className="w-24 h-24 rounded-full bg-surface-700 flex items-center justify-center mb-4">
                  <UserIcon className="w-12 h-12 text-surface-400" />
                </div>
                <p className="text-lg font-medium">{callingPeer?.theirLabel || 'Connecting...'}</p>
                {status === 'calling' && (
                  <p className="text-sm text-surface-400 mt-2">Ringing...</p>
                )}
              </div>
            )}

            {/* Local video (picture-in-picture) */}
            <div className="absolute bottom-4 right-4 w-32 md:w-48 aspect-video rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Call controls */}
          <div className="flex justify-center gap-4 py-6">
            <button
              onClick={endCall}
              className="w-14 h-14 rounded-full bg-error-500 hover:bg-error-600 text-white flex items-center justify-center transition-colors shadow-lg"
            >
              <PhoneOffIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      ) : (
        /* Contact List View */
        <div className="space-y-6">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-10"
            />
            <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Contacts grid */}
          {filteredConnections.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-200 flex items-center justify-center">
                <UserIcon className="w-8 h-8 text-text-tertiary" />
              </div>
              <h3 className="text-lg font-medium text-text-primary mb-2">No contacts found</h3>
              <p className="text-text-secondary text-sm">
                {searchQuery ? 'Try a different search term' : 'Add connections to start calling'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredConnections.map((connection) => (
                <div
                  key={connection.id}
                  className="card p-4 flex items-center gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                    <UserIcon className="w-6 h-6 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text-primary truncate">
                      {connection.theirLabel || 'Unknown'}
                    </p>
                    <p className="text-xs text-text-tertiary truncate font-mono">
                      {connection.id.slice(0, 16)}...
                    </p>
                  </div>
                  <button
                    onClick={() => startCall(connection)}
                    className="w-10 h-10 rounded-full bg-success-500 hover:bg-success-600 text-white flex items-center justify-center transition-colors flex-shrink-0"
                    title="Start video call"
                  >
                    <VideoIcon className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hidden audio element for ringtone */}
      <audio
        ref={ringtoneRef}
        src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"
        preload="auto"
      />
    </div>
  )
}
