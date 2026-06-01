'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from './NotificationContext'
import { apiGet, apiPost } from '../utils/api'
import { Icon } from '../components/ui/Icons'

export type Connection = { id: string; theirLabel?: string; state: string }
export type OfferEvt = { connectionId: string; threadId: string; sdp: string; theirLabel?: string; pthid?: string }
type IceServer = { urls: string | string[]; username?: string; credential?: string }
type IceConfigResponse = { iceServers: IceServer[]; ttlSeconds?: number; expiresAt?: string }
export type CallStatus = 'idle' | 'calling' | 'incoming' | 'connected'

type CallCtx = {
  status: CallStatus
  incomingCall: OfferEvt | null
  callingPeer: Connection | null
  remotePeer: { connectionId: string; label?: string } | null
  remoteStream: MediaStream | null
  localStream: MediaStream | null
  startCall: (connection: Connection) => Promise<void>
  endCall: () => Promise<void>
  acceptCall: () => Promise<void>
  rejectCall: () => Promise<void>
}

const CallContext = createContext<CallCtx | undefined>(undefined)

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

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { notifications, addSyntheticNotification } = useNotifications()
  const router = useRouter()

  const roomIdRef = useRef<string | null>(null)
  const pcRef = useRef<{ pc: RTCPeerConnection; threadId: string; connectionId: string } | null>(null)
  const thidToConnRef = useRef<Map<string, string>>(new Map())
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [remotePeer, setRemotePeer] = useState<{ connectionId: string; label?: string } | null>(null)

  const localStreamRef = useRef<MediaStream | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  const iceCfgRef = useRef<({ iceServers: IceServer[]; iceTransportPolicy: 'all'; iceCandidatePoolSize: number } & { expiresAtMs: number }) | null>(null)

  const [incomingCall, setIncomingCall] = useState<OfferEvt | null>(null)
  const incomingCallRef = useRef<OfferEvt | null>(null)
  const setIncomingCallTracked = (c: OfferEvt | null) => { incomingCallRef.current = c; setIncomingCall(c) }
  const [status, setStatus] = useState<CallStatus>('idle')
  const statusRef = useRef<CallStatus>('idle')
  const setStatusTracked = (s: CallStatus) => { statusRef.current = s; setStatus(s) }
  const [callingPeer, setCallingPeer] = useState<Connection | null>(null)

  const processedIdsRef = useRef<Set<string>>(new Set())
  const recentNotificationsRef = useRef<Map<string, number>>(new Map())
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidate[]>>(new Map())
  const mountTimeRef = useRef<number>(Date.now())

  const ringtoneRef = useRef<HTMLAudioElement | null>(null)

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

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      localStreamRef.current = s
      setLocalStream(s)
      return s
    } catch {
      alert('Failed to get camera/mic permission')
      throw new Error('media-failed')
    }
  }, [])

  const stopLocalMedia = useCallback(() => {
    const s = localStreamRef.current
    if (s) {
      for (const track of s.getTracks()) {
        try { track.stop() } catch {}
      }
    }
    localStreamRef.current = null
    setLocalStream(null)
  }, [])

  const processPendingIceCandidates = useCallback(async (connectionId: string, pc: RTCPeerConnection) => {
    const pending = pendingIceCandidatesRef.current.get(connectionId)
    if (pending && pending.length > 0) {
      for (const candidate of pending) {
        try { await pc.addIceCandidate(candidate) } catch {}
      }
      pendingIceCandidatesRef.current.delete(connectionId)
    }
  }, [])

  const createPeer = useCallback(async (connectionId: string, threadId: string, roomId: string, label?: string) => {
    const iceCfg = await getIceConfig()
    const pc = new RTCPeerConnection(iceCfg)
    pcRef.current = { pc, threadId, connectionId }
    thidToConnRef.current.set(threadId, connectionId)

    pc.ontrack = (e) => {
      let stream = e.streams?.[0]
      if (!stream) {
        if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream()
        remoteStreamRef.current.addTrack(e.track)
        stream = remoteStreamRef.current
      } else {
        remoteStreamRef.current = stream
      }
      setRemoteStream(stream)
      setRemotePeer({ connectionId, label })
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
      if (pc.connectionState === 'connected') setStatusTracked('connected')
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.error('[WebRTC] Connection state:', pc.connectionState)
      }
    }

    const local = await ensureLocalStream()
    local.getTracks().forEach((t) => pc.addTrack(t, local))
    return pc
  }, [ensureLocalStream, getIceConfig])

  const startCall = useCallback(async (connection: Connection) => {
    const roomId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    roomIdRef.current = roomId
    setStatusTracked('calling')
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
    setRemoteStream(null)
    setRemotePeer(null)
    roomIdRef.current = null
    setStatusTracked('idle')
    setCallingPeer(null)
    stopLocalMedia()
  }, [stopLocalMedia])

  const acceptCall = useCallback(async () => {
    stopRingtone()
    const call = incomingCall
    if (!call) return

    const roomId = call.pthid || crypto.randomUUID()
    roomIdRef.current = roomId
    await ensureLocalStream()
    setStatusTracked('connected')

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
    setIncomingCallTracked(null)
    router.push('/dashboard/calls')
  }, [createPeer, ensureLocalStream, incomingCall, processPendingIceCandidates, router, stopRingtone])

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
    addSyntheticNotification({
      v: 1,
      id: crypto.randomUUID(),
      type: 'MissedCall',
      tenantId: '',
      createdAt: new Date().toISOString(),
      data: { connectionId: call.connectionId, theirLabel: call.theirLabel },
    })
    setIncomingCallTracked(null)
    setStatusTracked('idle')
  }, [incomingCall, stopRingtone, addSyntheticNotification])

  const handleWsEvent = useCallback(async (evt: any) => {
    const p = evt?.data
    if (!evt?.type || !p) return

    if (evt.type === 'WebRTCIncomingOffer') {
      const connId = p.connectionId || p.context?.connection?.id
      const thid = p.thid
      const roomId = p.pthid || p.parentThreadId || ''
      if (pcRef.current) return
      setIncomingCallTracked({ connectionId: connId, threadId: thid, sdp: p.sdp, theirLabel: p.theirLabel, pthid: roomId })
      setStatusTracked('incoming')
    }

    if (evt.type === 'WebRTCIncomingAnswer') {
      const thid = p.thid
      const connId = thidToConnRef.current.get(thid)
      if (!connId || !pcRef.current) return
      const pc = pcRef.current.pc
      await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp })
      await processPendingIceCandidates(connId, pc)
      setStatusTracked('connected')
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
          if (!pendingIceCandidatesRef.current.has(connId)) pendingIceCandidatesRef.current.set(connId, [])
          pendingIceCandidatesRef.current.get(connId)?.push(p.candidate)
        }
      }
    }

    if (evt.type === 'WebRTCCallEnded') {
      const thid = p.thid
      const connId = thidToConnRef.current.get(thid)
      // If the remote side hung up while we were ringing (incoming, not yet answered) → missed call
      if (statusRef.current === 'incoming') {
        const pendingCall = incomingCallRef.current
        addSyntheticNotification({
          v: 1,
          id: crypto.randomUUID(),
          type: 'MissedCall',
          tenantId: '',
          createdAt: new Date().toISOString(),
          data: {
            connectionId: pendingCall?.connectionId || connId || '',
            theirLabel: pendingCall?.theirLabel,
          },
        })
        setIncomingCallTracked(null)
      }
      if (connId && pcRef.current?.connectionId === connId) {
        try { pcRef.current.pc.close() } catch {}
        pcRef.current = null
        thidToConnRef.current.delete(thid)
        remoteStreamRef.current = null
        pendingIceCandidatesRef.current.delete(connId)
        setRemoteStream(null)
        setRemotePeer(null)
        roomIdRef.current = null
        setStatusTracked('idle')
        setCallingPeer(null)
        stopLocalMedia()
      }
    }
  }, [processPendingIceCandidates, stopLocalMedia, addSyntheticNotification])

  useEffect(() => {
    if (!notifications || notifications.length === 0) return
    const now = Date.now()
    const DUPLICATE_WINDOW_MS = 1000
    const OLDEST_ALLOWED_MS = mountTimeRef.current - 5000

    for (const [key, timestamp] of recentNotificationsRef.current.entries()) {
      if (now - timestamp > 5000) recentNotificationsRef.current.delete(key)
    }

    for (const n of notifications) {
      if (!n?.id || processedIdsRef.current.has(n.id)) continue
      const createdAtMs = n.createdAt ? Date.parse(n.createdAt) : NaN
      if (Number.isFinite(createdAtMs) && createdAtMs < OLDEST_ALLOWED_MS) {
        processedIdsRef.current.add(n.id)
        continue
      }

      if (!String(n.type).startsWith('WebRTC')) continue

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

  useEffect(() => {
    if (status === 'incoming') playRingtone()
    else stopRingtone()
  }, [status, playRingtone, stopRingtone])

  useEffect(() => {
    return () => {
      try { pcRef.current?.pc.close() } catch {}
      pcRef.current = null
      stopLocalMedia()
      stopRingtone()
    }
  }, [stopLocalMedia, stopRingtone])

  const callerName = incomingCall?.theirLabel || 'Unknown'

  const value = useMemo<CallCtx>(() => ({
    status,
    incomingCall,
    callingPeer,
    remotePeer,
    remoteStream,
    localStream,
    startCall,
    endCall,
    acceptCall,
    rejectCall,
  }), [status, incomingCall, callingPeer, remotePeer, remoteStream, localStream, startCall, endCall, acceptCall, rejectCall])

  return (
    <CallContext.Provider value={value}>
      {incomingCall && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="card" style={{
            padding: 32, maxWidth: 340, width: '100%',
            textAlign: 'center', borderRadius: 'var(--radius-xl)',
          }}>
            <div style={{
              width: 72, height: 72, margin: '0 auto 16px', borderRadius: '50%',
              background: 'var(--accent-soft)', display: 'grid', placeItems: 'center',
            }} className="animate-pulse-subtle">
              <Icon name="user" size={32} style={{ color: 'var(--accent)' }} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>Incoming Call</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 28 }}>{callerName}</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20 }}>
              <button onClick={rejectCall} style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--red)',
                color: 'white', display: 'grid', placeItems: 'center',
                border: 'none', cursor: 'pointer', boxShadow: 'var(--shadow-md)',
              }}>
                <PhoneOffIcon className="w-6 h-6" />
              </button>
              <button onClick={acceptCall} style={{
                width: 56, height: 56, borderRadius: '50%', background: 'var(--green)',
                color: 'white', display: 'grid', placeItems: 'center',
                border: 'none', cursor: 'pointer', boxShadow: 'var(--shadow-md)',
              }}>
                <PhoneIcon className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}
      <audio
        ref={ringtoneRef}
        src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"
        preload="auto"
      />
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}
