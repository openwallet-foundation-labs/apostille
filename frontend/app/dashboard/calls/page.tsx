"use client"
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { connectionApi } from '@/lib/api'
import { useCall } from '../../context/CallContext'
import { Icon } from '../../components/ui/Icons'

type Connection = { id: string; theirLabel?: string; state: string }

function RemoteVideo({ stream, label }: { stream: MediaStream | null; label?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)

  useEffect(() => {
    if (ref.current && stream) {
      if (ref.current.srcObject !== stream) {
        ref.current.srcObject = stream
        ref.current.play().catch(e => console.error('[RemoteVideo] Play failed:', e))
      }
    }
  }, [stream, label])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handleLoaded = () => {
      if (el.videoWidth && el.videoHeight) setAspectRatio(el.videoWidth / el.videoHeight)
    }
    el.addEventListener('loadedmetadata', handleLoaded)
    return () => el.removeEventListener('loadedmetadata', handleLoaded)
  }, [stream])

  return (
    <div className="relative w-full h-full bg-black overflow-hidden" style={{ borderRadius: 'var(--radius-lg)' }}>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full max-w-full" style={aspectRatio ? { aspectRatio } : undefined}>
          <video ref={ref} autoPlay playsInline muted={false} className="absolute inset-0 w-full h-full object-contain" />
        </div>
      </div>
      {label && (
        <div className="absolute bottom-4 left-4" style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(0,0,0,0.6)' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'white' }}>{label}</span>
        </div>
      )}
    </div>
  )
}

const PhoneOffIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
  </svg>
)

export default function CallsPage() {
  const { token } = useAuth()
  const { status, remoteStream, remotePeer, callingPeer, localStream, startCall, endCall } = useCall()

  const [connections, setConnections] = useState<Connection[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const localVideoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!token) return
    connectionApi
      .getAll()
      .then((resp: any) => setConnections(resp.connections?.filter((c: Connection) => c.state === 'completed') || []))
      .catch(() => setConnections([]))
  }, [token])

  // Attach local stream to the PiP video element whenever we enter a call
  useEffect(() => {
    const el = localVideoRef.current
    if (el && localStream && el.srcObject !== localStream) {
      el.srcObject = localStream
      el.play().catch(() => {})
    }
  }, [localStream, status])

  const filteredConnections = useMemo(() => {
    if (!searchQuery.trim()) return connections
    const q = searchQuery.toLowerCase()
    return connections.filter(c =>
      c.theirLabel?.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    )
  }, [connections, searchQuery])

  const inCall = status === 'calling' || status === 'connected'

  return (
    <div className="h-full">
      {inCall ? (
        <div style={{ height: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column' }}>
          <div className="flex-1 relative overflow-hidden" style={{ background: 'var(--bg-sunk)', borderRadius: 'var(--radius-lg)' }}>
            {remotePeer ? (
              <RemoteVideo stream={remoteStream} label={remotePeer.label || remotePeer.connectionId} />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color: 'var(--ink-3)' }}>
                <div style={{
                  width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-sunk)',
                  display: 'grid', placeItems: 'center', marginBottom: 16,
                }}>
                  <Icon name="user" size={36} />
                </div>
                <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--ink)' }}>{callingPeer?.theirLabel || 'Connecting...'}</p>
                {status === 'calling' && (
                  <p style={{ fontSize: 13, color: 'var(--ink-4)', marginTop: 8 }}>Ringing...</p>
                )}
              </div>
            )}
            <div className="absolute bottom-4 right-4" style={{
              width: 160, aspectRatio: '16/9', borderRadius: 'var(--radius)',
              overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)',
              background: 'black', boxShadow: 'var(--shadow-md)',
            }}>
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '20px 0' }}>
            <button onClick={endCall} style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--red)',
              color: 'white', display: 'grid', placeItems: 'center',
              border: 'none', cursor: 'pointer', boxShadow: 'var(--shadow-md)',
            }}>
              <PhoneOffIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="page-header">
            <div>
              <h1 className="page-title">Calls</h1>
              <p className="page-sub">WebRTC calls over DIDComm-mediated signaling.</p>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-pad" style={{ padding: '14px 18px' }}>
              <div style={{ position: 'relative' }}>
                <Icon name="search" size={14} className="absolute left-[10px] top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-4)' }} />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input"
                  style={{ paddingLeft: 32, height: 36, width: '100%' }}
                />
              </div>
            </div>
          </div>

          {filteredConnections.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><Icon name="phone" size={22} /></div>
              <div className="empty-title">No contacts found</div>
              <div className="empty-desc">
                {searchQuery ? 'Try a different search term' : 'Add connections to start calling'}
              </div>
            </div>
          ) : (
            <div className="grid-3">
              {filteredConnections.map((connection, idx) => {
                const label = connection.theirLabel || 'Unknown'
                const avatarCls = ['a1','a2','a3','a4','a5','a6'][idx % 6]
                const initials = label.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()
                return (
                  <div key={connection.id} className="contact">
                    <div className={`avatar avatar-lg ${avatarCls}`}>{initials}</div>
                    <div className="contact-info">
                      <div className="contact-name">{label}</div>
                      <div className="contact-id">{connection.id.slice(0, 18)}...</div>
                    </div>
                    <div className="contact-actions">
                      <button className="contact-action" title="Audio call" onClick={() => startCall(connection)}>
                        <Icon name="phone" size={14} />
                      </button>
                      <button className="contact-action video" title="Video call" onClick={() => startCall(connection)}>
                        <Icon name="video" size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
