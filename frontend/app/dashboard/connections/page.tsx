'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiGet, apiPost, getHeaders } from '../../utils/api';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { connectionApi } from '@/lib/api';
import { useNotifications } from '../../context/NotificationContext';
import { Icon } from '../../components/ui/Icons';
import QRScanner from '../../components/QRScanner';
interface Connection {
  id: string;
  createdAt: string;
  state: string;
  role: string;
  theirLabel?: string;
  theirDid?: string;
  threadId?: string;
  invitationId?: string;
  url?: string;
  label?: string;
  autoAcceptConnection?: boolean;
}

interface KemStatus {
  hasLocalKey: boolean;
  hasPeerKey: boolean;
  ready: boolean;
  hasPendingRequest?: boolean;
  pendingRequest?: {
    receivedAt: string;
    peerAlgorithm: string;
  } | null;
}


interface Invitation {
  id: string;
  url: string;
  outOfBandInvitation: any;
}


interface Message {
  id: string;
  connectionId: string;
  content: string;
  role: "sender" | "receiver";
  createdAt: string;
  sentTime: string;
  threadId: string;
  updatedAt: string;
}


interface ConnectionsResponse {
  success: boolean;
  connections?: Connection[];
  invitations?: Connection[];
  message?: string;
}

interface InvitationResponse {
  success: boolean;
  invitation?: Invitation;
  message?: string;
}

interface ReceiveInvitationResponse {
  success: boolean;
  connection?: {
    id: string;
    state: string;
    role: string;
    theirLabel?: string;
    createdAt: string;
  };
  message?: string;
}

interface MessagesResponse {
  success: boolean;
  messages: Message[];
  message?: string;
}


export default function ConnectionsPage() {
  const { tenantId, token } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
  const [showInvitation, setShowInvitation] = useState(false);
  const [displayQrCode, setDisplayQrCode] = useState(false);
  const [invitationLabel, setInvitationLabel] = useState('');
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showAcceptForm, setShowAcceptForm] = useState(false);
  const [invitationUrl, setInvitationUrl] = useState('');
  const [isAcceptingInvitation, setIsAcceptingInvitation] = useState(false);
  const [acceptSuccess, setAcceptSuccess] = useState<string | null>(null);
  const [showQrScanner, setShowQrScanner] = useState(false);


  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState<Connection | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const { notifications } = useNotifications();
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // KEM key exchange state
  const [kemStatuses, setKemStatuses] = useState<Record<string, KemStatus>>({});
  const [exchangingKeys, setExchangingKeys] = useState<Record<string, boolean>>({});
  const [acceptingKeys, setAcceptingKeys] = useState<Record<string, boolean>>({});



  const walletId = `${tenantId}`;
  const walletKey = `${tenantId}`;
  function isoToDate(iso: string): Date | null {
    const ts = Date.parse(iso);       // returns NaN on failure
    return Number.isNaN(ts) ? null : new Date(ts);
  }


  const messageIso = (m: Partial<Message>): string | undefined =>
    m.sentTime || m.createdAt;

  const messageEpoch = (m: Partial<Message>): number =>
    Date.parse(messageIso(m) ?? '');        // NaN if iso missing

  const compareMessages = (a: Message, b: Message): number => {
    const tDiff = messageEpoch(a) - messageEpoch(b); // oldest → newest
    return tDiff !== 0 ? tDiff : a.id.localeCompare(b.id);
  };

  const formatMessageDate = (iso?: string): string =>
    iso ? new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
      : '';

  // Live update messages when a notification arrives for the open connection
  useEffect(() => {
    if (!showMessageModal || !selectedConnectionId) return;
    if (!notifications || notifications.length === 0) return;

    // Latest time we have in the list to gate older events
    const lastTs = messages.reduce((acc, m) => {
      const t = Date.parse(m.sentTime || m.createdAt || '') || 0;
      return Math.max(acc, t);
    }, 0);

    const next: Message[] = [];
    for (const n of notifications) {
      if (processedEventIdsRef.current.has(n.id)) continue;
      const t = String(n.type || '');
      if (t !== 'AppMessageReceived' && t !== 'AppMessageSent') continue;
      const d: any = n.data || {};
      if (!d.connectionId || d.connectionId !== selectedConnectionId) continue;
      // Gate by time if available to avoid flooding older events on open
      const nTs = Date.parse(d.sentTime || n.createdAt || '') || 0;
      if (lastTs && nTs && nTs <= lastTs) {
        processedEventIdsRef.current.add(n.id);
        continue;
      }
      const msg: Message = {
        id: String(d.id || n.id),
        connectionId: d.connectionId,
        content: String(d.content || ''),
        role: t === 'AppMessageReceived' ? 'receiver' : 'sender',
        createdAt: (d.sentTime || n.createdAt || new Date().toISOString()),
        sentTime: (d.sentTime || n.createdAt || new Date().toISOString()),
        threadId: String(d.threadId || ''),
        updatedAt: (d.sentTime || n.createdAt || new Date().toISOString()),
      };
      next.push(msg);
      processedEventIdsRef.current.add(n.id);
    }
    if (next.length > 0) {
      // Merge and sort
      setMessages((prev) => {
        const merged = [...prev, ...next];
        return merged.sort(compareMessages);
      });
    }
  }, [notifications, showMessageModal, selectedConnectionId, messages]);


  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    async function fetchConnections() {
      if (!tenantId) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await connectionApi.getAll();
        if (response.success) {
          const allConnections = [
            ...(response.connections || []),
            ...(response.invitations || [])
          ];
          setConnections(allConnections);
        } else {
          throw new Error(response.message || 'Failed to load connections');
        }
      } catch (err: any) {
        console.error('Error fetching connections:', err);
        setError(err.message || 'Unable to load connections');
      } finally {
        setIsLoading(false);
      }
    }
    // Initial load
    void fetchConnections();
    // Debounced refresh on WS notifications
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      void fetchConnections();
    }, 800);
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [tenantId, token, notifications]);

  // Fetch KEM statuses for completed connections
  // Re-fetch when notifications arrive (e.g., when a KEM message is received)
  useEffect(() => {
    async function fetchKemStatuses() {
      const completedConnections = connections.filter(
        c => c.state === 'completed' || c.state === 'complete'
      );

      for (const conn of completedConnections) {
        try {
          const response = await connectionApi.getKemStatus(conn.id);
          if (response.success && response.status) {
            setKemStatuses(prev => {
              // Only update if status changed to avoid unnecessary re-renders
              const existing = prev[conn.id];
              if (existing &&
                  existing.hasLocalKey === response.status.hasLocalKey &&
                  existing.hasPeerKey === response.status.hasPeerKey &&
                  existing.hasPendingRequest === response.status.hasPendingRequest &&
                  existing.ready === response.status.ready) {
                return prev;
              }
              return {
                ...prev,
                [conn.id]: response.status,
              };
            });
          }
        } catch (err) {
          console.error(`Failed to get KEM status for ${conn.id}:`, err);
        }
      }
    }

    if (connections.length > 0) {
      fetchKemStatuses();
    }
  }, [connections, notifications]);

  // Handle key exchange (initiate)
  const handleExchangeKeys = async (connectionId: string) => {
    setExchangingKeys(prev => ({ ...prev, [connectionId]: true }));
    setError(null);

    try {
      const response = await connectionApi.exchangeKeys(connectionId);

      if (response.success) {
        // Update KEM status
        setKemStatuses(prev => ({
          ...prev,
          [connectionId]: response.status,
        }));
        setAcceptSuccess('Key exchange initiated! Waiting for peer to accept.');
      } else {
        throw new Error(response.message || 'Failed to exchange keys');
      }
    } catch (err: any) {
      console.error('Key exchange failed:', err);
      setError(err.message || 'Failed to exchange keys');
    } finally {
      setExchangingKeys(prev => ({ ...prev, [connectionId]: false }));
    }
  };

  // Handle accepting a pending key exchange request
  const handleAcceptKeyExchange = async (connectionId: string) => {
    setAcceptingKeys(prev => ({ ...prev, [connectionId]: true }));
    setError(null);

    try {
      const response = await connectionApi.acceptKeyExchange(connectionId);

      if (response.success) {
        // Update KEM status
        setKemStatuses(prev => ({
          ...prev,
          [connectionId]: {
            ...response.status,
            hasPendingRequest: false,
            pendingRequest: null,
          },
        }));
        setAcceptSuccess('Key exchange accepted! Encryption is now ready.');
      } else {
        throw new Error(response.message || 'Failed to accept key exchange');
      }
    } catch (err: any) {
      console.error('Accept key exchange failed:', err);
      setError(err.message || 'Failed to accept key exchange');
    } finally {
      setAcceptingKeys(prev => ({ ...prev, [connectionId]: false }));
    }
  };


  const handleCreateInvitation = async () => {
    if (!tenantId) return;

    setIsCreatingInvitation(true);
    setError(null);

    try {
      // Use authenticated API request
      const response = await connectionApi.createInvitation(invitationLabel?.trim() || undefined) as InvitationResponse;

      if (response.success && response.invitation) {
        console.log('Created invitation:', response.invitation);
        setInvitation(response.invitation);
        setShowInvitation(true);
        setDisplayQrCode(true); // Show QR code by default
      } else {
        throw new Error(response.message || 'Failed to create invitation');
      }
    } catch (err: any) {
      console.error('Error creating invitation:', err);
      setError(err.message || 'Unable to create invitation');
    } finally {
      setIsCreatingInvitation(false);
    }
  };


  const copyInvitationUrl = () => {
    if (invitation?.url) {
      navigator.clipboard.writeText(invitation.url)
        .then(() => {
          alert('Invitation URL copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy invitation URL:', err);
          alert('Failed to copy invitation URL');
        });
    }
  };


  const toggleDisplayMode = () => {
    setDisplayQrCode(!displayQrCode);
  };


  const showQrCodeForConnection = (connection: Connection) => {
    console.log('Showing QR for connection:', connection);
    setSelectedConnectionId(connection.id);
    setShowQrModal(true);
  };


  const handleQRScan = (data: string) => {
    console.log('QR Code scanned:', data);
    setInvitationUrl(data);
    setShowQrScanner(false);
    // Auto-submit if we have the URL
    if (data.trim()) {
      setTimeout(() => {
        handleAcceptInvitationWithUrl(data);
      }, 100);
    }
  };

  const handleAcceptInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleAcceptInvitationWithUrl(invitationUrl);
  };

  const handleAcceptInvitationWithUrl = async (url: string) => {
    if (!tenantId || !url.trim()) return;

    setIsAcceptingInvitation(true);
    setError(null);
    setAcceptSuccess(null);

    try {
      // Use authenticated API request
      const response = await connectionApi.receiveInvitation(url) as ReceiveInvitationResponse;

      console.log('Accepted invitation:', response);

      if (response.success && response.connection) {
        setAcceptSuccess(`Successfully accepted invitation from ${response.connection.theirLabel || 'unknown'}`);
        setInvitationUrl('');

        // Use authenticated API request
        const params = new URLSearchParams({ tenantId }).toString();
        const connectionsResponse = await apiGet(`/api/connections?${params}`) as ConnectionsResponse;

        if (connectionsResponse.success) {
          const allConnections = [
            ...(connectionsResponse.connections || []),
            ...(connectionsResponse.invitations || [])
          ];
          setConnections(allConnections);
        }
      } else {
        throw new Error(response.message || 'Failed to accept invitation');
      }
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      setError(err.message || 'Unable to accept invitation');
    } finally {
      setIsAcceptingInvitation(false);
    }
  };


  const openMessageModal = async (connection: Connection) => {
    if (!tenantId) return;

    setSelectedConnection(connection);
    setShowMessageModal(true);
    setMessages([]);
    setNewMessage('');


    if (connection.state !== 'completed') {
      return;
    }

    setIsLoadingMessages(true);

    try {
      // Use connectionApi instead of direct fetch
      const response = await connectionApi.getMessages(connection.id) as MessagesResponse;

      if (response.success) {

        const sortedMessages = [...response.messages].sort(compareMessages);

        setMessages(sortedMessages);
      } else {
        console.error('Failed to load messages:', response.message);
      }
    } catch (err: any) {
      console.error('Error loading messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };


  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantId || !selectedConnection || !newMessage.trim()) return;

    setIsSendingMessage(true);

    try {
      // Use connectionApi instead of direct fetch
      const response = await connectionApi.sendMessage(selectedConnection.id, newMessage) as { success: boolean; message?: string };

      if (response.success) {
        // Get updated messages using connectionApi
        const messagesResponse = await connectionApi.getMessages(selectedConnection.id) as MessagesResponse;

        if (messagesResponse.success) {

          const sortedMessages = [...(messagesResponse.messages || [])].sort((a, b) => {
            return parseTimestamp(a) - parseTimestamp(b); // Ascending order (oldest first)
          });
          setMessages(sortedMessages);
        }

        setNewMessage('');
      } else {
        console.error('Failed to send message:', response.message);
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
    } finally {
      setIsSendingMessage(false);
    }
  };


  const getStateBadgeColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'complete':
      case 'completed':
        return 'badge-success';
      case 'invitation':
      case 'await-response':
        return 'badge-primary';
      case 'request':
        return 'badge-warning';
      case 'response':
        return 'badge-info';
      default:
        return 'badge-gray';
    }
  };


  // const formatMessageDate = (dateString: string) => {
  //   const date = new Date(dateString);
  //   return date.toLocaleString();
  // };

  const messageTime = (m: Partial<Message>): number => {
    const iso = m.sentTime ?? m.createdAt;
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };


  const parseTimestamp = (message: Message): number => {
    try {
      const timestamp = message.sentTime || message.createdAt;
      if (!timestamp) return 0;
      return new Date(timestamp).getTime();
    } catch (error) {
      console.error('Error parsing timestamp:', error);
      return 0;
    }
  };

  const isMessageFromMe = (message: Message) => {
    return message.role === 'sender';
  };

  const AVATAR_CLASSES = ['a1','a2','a3','a4','a5','a6'];
  const getAvatar = (name: string, idx: number) => {
    const cls = AVATAR_CLASSES[idx % AVATAR_CLASSES.length];
    const initials = (name || '??').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
    return <span className={`avatar ${cls}`}>{initials}</span>;
  };

  // Compute stats
  const totalConns = connections.length;
  const activeConns = connections.filter(c => c.state === 'completed' || c.state === 'complete').length;
  const kemReady = Object.values(kemStatuses).filter(s => s.ready).length;
  const pendingConns = connections.filter(c => c.state !== 'completed' && c.state !== 'complete').length;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Connections</h1>
          <p className="page-sub">DIDComm peers, key exchange status, and message routing.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowAcceptForm(!showAcceptForm)} className="btn btn-secondary">
            <Icon name="qr" size={14} /> {showAcceptForm ? 'Hide' : 'Accept Invitation'}
          </button>
          <button onClick={handleCreateInvitation} disabled={isCreatingInvitation} className="btn btn-primary">
            {isCreatingInvitation ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Creating...</> : <><Icon name="plus" size={14} /> Create Invitation</>}
          </button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total', value: totalConns, foot: 'all peers' },
          { label: 'Active', value: activeConns, foot: 'completed state' },
          { label: 'KEM Encrypted', value: kemReady, foot: 'PQ-secure' },
          { label: 'Pending', value: pendingConns, foot: 'awaiting response' },
        ].map(s => (
          <div key={s.label} className="stat">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 24, marginTop: 8 }}>{s.value}</div>
            <div className="stat-foot">{s.foot}</div>
          </div>
        ))}
      </div>

      {/* Invitation label input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Invitation label (optional)"
          value={invitationLabel}
          onChange={(e) => setInvitationLabel(e.target.value)}
          className="input"
          style={{ maxWidth: 280 }}
        />
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {acceptSuccess && (
        <div className="alert alert-success">
          <span>{acceptSuccess}</span>
        </div>
      )}

      {/* Accept Invitation Form */}
      {showAcceptForm && (
        <div className="card border-l-4 border-primary-500">
          <h3 className="text-xl font-semibold text-text-primary mb-4">Accept an Invitation</h3>
          <form onSubmit={handleAcceptInvitation}>
            <div className="mb-4">
              <label htmlFor="invitationUrl" className="block text-sm font-medium text-text-primary mb-2">
                Invitation URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="invitationUrl"
                  value={invitationUrl}
                  onChange={(e) => setInvitationUrl(e.target.value)}
                  placeholder="Paste invitation URL here or scan QR code"
                  className="input flex-1"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowQrScanner(true)}
                  className="btn btn-secondary whitespace-nowrap"
                  title="Scan QR Code"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <span className="ml-2">Scan QR</span>
                </button>
              </div>
              <p className="text-sm text-text-secondary mt-2">
                You can paste an invitation URL or click "Scan QR" to scan a QR code with your camera
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isAcceptingInvitation || !invitationUrl.trim()}
                className="btn btn-primary"
              >
                {isAcceptingInvitation ? (
                  <>
                    <span className="spinner h-4 w-4 mr-2"></span>
                    Accepting...
                  </>
                ) : (
                  'Accept Invitation'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showQrScanner && (
        <QRScanner
          onScan={handleQRScan}
          onError={(error) => {
            console.error('QR Scanner error:', error);
            setError(error);
          }}
          onClose={() => setShowQrScanner(false)}
        />
      )}

      {/* Display invitation when created */}
      {showInvitation && invitation && (
        <div className="card border-l-4 border-primary-500">
          <div className="flex justify-between items-start">
            <h3 className="text-xl font-semibold text-text-primary mb-2">Invitation Created</h3>
            <button
              onClick={() => setShowInvitation(false)}
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              ✕
            </button>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-text-secondary">Share this invitation:</p>
              <button
                onClick={toggleDisplayMode}
                className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
              >
                {displayQrCode ? 'Show URL' : 'Show QR Code'}
              </button>
            </div>

            {displayQrCode ? (
              <div className="flex justify-center p-4">
                <div className="p-4 bg-white inline-block rounded-lg border border-border-primary">
                  <QRCodeSVG
                    value={invitation.url}
                    size={250}
                    bgColor={"#ffffff"}
                    fgColor={"#000000"}
                    level={"L"}
                    includeMargin={false}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-surface-200 p-3 rounded-md mb-3 overflow-hidden">
                <p className="text-text-primary break-all font-mono text-sm">{invitation.url}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={copyInvitationUrl}
              className="btn btn-secondary"
            >
              Copy Invitation URL
            </button>
          </div>
        </div>
      )}

      {/* QR Code Modal for Connection */}
      {showQrModal && selectedConnectionId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 9999 }}>
          <div className="modal-container max-w-md w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-text-primary">Connection QR Code</h3>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-text-secondary hover:text-text-primary transition-colors"
              >
                ✕
              </button>
            </div>

            {(() => {
              const connection = connections.find(c => c.id === selectedConnectionId);
              console.log(connection, 501);


              if (!connection || !connection.url) {
                return (
                  <p className="text-text-secondary">Unable to generate QR code for this connection.</p>
                );
              }

              return (
                <>
                  <div className="flex justify-center p-4">
                    <div className="p-4 bg-white inline-block rounded-lg border border-border-primary">
                      <QRCodeSVG
                        value={connection.url}
                        size={250}
                        bgColor={"#ffffff"}
                        fgColor={"#000000"}
                        level={"L"}
                        includeMargin={false}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-text-secondary mb-2 text-sm">Invitation URL:</p>
                    <div className="bg-surface-200 p-3 rounded-md mb-3 overflow-hidden">
                      <p className="text-text-primary break-all text-sm font-mono">{connection.url}</p>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(connection.url || '');
                          alert('URL copied to clipboard!');
                        }}
                        className="btn btn-secondary"
                      >
                        Copy URL
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Message Modal */}
      {showMessageModal && selectedConnection && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2" style={{ zIndex: 9999 }}>
          <div className="modal-container max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-text-primary">
                Messages with {selectedConnection.theirLabel || 'Connection'}
              </h3>
              <button
                onClick={() => setShowMessageModal(false)}
                className="text-text-secondary p-2 hover:text-text-primary transition-colors "
              >
                ✕
              </button>
            </div>

            {selectedConnection.state !== 'completed' && selectedConnection.state !== 'complete' ? (
              <div className="bg-yellow-50 p-4 rounded-md mb-4">
                <p className="text-yellow-700">
                  You can only exchange messages with completed connections. This connection is in state: {selectedConnection.state}
                </p>
              </div>
            ) : (
              <>


                <div className="flex-1 overflow-y-auto mb-4 p-3 bg-surface-100 dark:bg-surface-800 rounded-md min-h-[300px]">
                  {isLoadingMessages ? (
                    <div className="flex justify-center items-center h-full">
                      <p className="text-text-tertiary">Loading messages...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex justify-center items-center h-full">
                      <p className="text-text-tertiary">No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    /* flex‑col allows self‑alignment for right / left bubbles */
                    <div className="flex flex-col gap-3">
                      {[...messages].sort(compareMessages).map((msg, idx) => {
                        const iso = messageIso(msg);           // sentTime ▸ createdAt ▸ undefined
                        const fromMe = msg.role === 'sender';  // shortcut
                        return (
                          <div
                            /* key is ALWAYS unique — id + timestamp (or idx fallback) */
                            key={`${msg.id}-${iso ?? idx}`}
                            className={`flex ${fromMe ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-lg p-3 break-words ${fromMe
                                  ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300'
                                  : 'bg-surface-100 text-text-secondary dark:bg-surface-700 dark:text-text-secondary'
                                }`}
                            >
                              <p>{msg.content}</p>
                              {iso && (
                                <p className="text-xs mt-1 opacity-70 text-right">
                                  {formatMessageDate(iso)}
                                  {/* {fromMe ? ' (You)' : ''} */}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>


                <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message here..."
                    className="flex-1 text-black p-3 border border-border-secondary rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isSendingMessage}
                  />
                  <button
                    type="submit"
                    className="px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-primary-300"
                    disabled={isSendingMessage || !newMessage.trim()}
                  >
                    {isSendingMessage ? 'Sending...' : 'Send'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="empty"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : connections.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="link" size={22} /></div>
          <div className="empty-title">No Connections Found</div>
          <div className="empty-desc">Create an invitation to connect with other agents.</div>
          <div className="empty-actions">
            <button onClick={handleCreateInvitation} disabled={isCreatingInvitation} className="btn btn-primary">
              Create Your First Connection
            </button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '30%' }}>ID / Label</th>
                <th>State</th>
                <th>Encryption</th>
                <th>Role</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((connection, idx) => {
                const label = connection.theirLabel || connection.label || 'Unknown';
                const status = kemStatuses[connection.id];
                const isComplete = connection.state === 'completed' || connection.state === 'complete';
                return (
                  <tr key={connection.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {getAvatar(label, idx)}
                        <div>
                          <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
                          <div className="mono-dim" style={{ fontSize: '11.5px' }}>{connection.id.slice(0, 28)}...</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getStateBadgeColor(connection.state)}`}>
                        <span className="badge-dot" />
                        {connection.state}
                      </span>
                    </td>
                    <td>
                      {isComplete ? (
                        !status ? <span className="muted" style={{ fontSize: 12 }}>Loading...</span> :
                        status.ready ? <span className="badge violet"><Icon name="lock" size={11} style={{ marginRight: 3 }} /> KEM-Active</span> :
                        status.hasPendingRequest ? <span className="badge amber"><span className="badge-dot" /> Pending Request</span> :
                        status.hasLocalKey ? <span className="badge amber"><span className="badge-dot" /> Awaiting Peer</span> :
                        <span className="muted" style={{ fontSize: 12 }}>—</span>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{connection.role}</td>
                    <td><span className="mono-dim">{new Date(connection.createdAt).toLocaleDateString()}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        {connection.state === 'await-response' && connection.url && (
                          <button onClick={() => showQrCodeForConnection(connection)} className="btn btn-secondary btn-xs">Show QR</button>
                        )}
                        {isComplete && status?.hasPendingRequest && (
                          <button onClick={() => handleAcceptKeyExchange(connection.id)} disabled={acceptingKeys[connection.id]} className="btn btn-secondary btn-xs">
                            {acceptingKeys[connection.id] ? 'Accepting...' : 'Accept Key Exchange'}
                          </button>
                        )}
                        {isComplete && !status?.ready && !status?.hasPendingRequest && (
                          <button
                            onClick={() => handleExchangeKeys(connection.id)}
                            disabled={exchangingKeys[connection.id] || status?.hasLocalKey}
                            className="btn btn-secondary btn-xs"
                          >
                            {exchangingKeys[connection.id] ? 'Exchanging...' : status?.hasLocalKey ? 'Awaiting Peer' : 'Exchange Keys'}
                          </button>
                        )}
                        <button onClick={() => openMessageModal(connection)} className="btn btn-secondary btn-xs">Messages</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
