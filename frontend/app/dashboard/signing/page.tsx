'use client';

import { useState, useEffect } from 'react';
import { signingApi, connectionApi } from '../../../lib/api';
import { toast } from 'react-toastify';

interface SigningSession {
  id: string;
  sessionId: string;
  state: string;
  role: 'requester' | 'signer';
  connectionId?: string;
  threadId?: string;
  object?: {
    id: string;
    data: string;
    digest?: {
      algorithm: string;
      value: string;
    };
  };
  suite?: {
    suite: string;
  };
  partialSignatures?: Array<{
    keyId: string;
    signature: {
      format: string;
      value: string;
      publicKeyHint?: string;
    } | string;
  }>;
  consentMessages?: Array<{
    keyId: string;
    timestamp: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

interface Connection {
  id: string;
  theirLabel?: string;
  state: string;
}

interface SigningKey {
  fingerprint: string;
  keyType: string;
  createdAt?: string;
}

export default function SigningPage() {
  const [sessions, setSessions] = useState<SigningSession[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [availableKeys, setAvailableKeys] = useState<SigningKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creatingKey, setCreatingKey] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SigningSession | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Request modal state
  const [selectedConnection, setSelectedConnection] = useState('');
  const [documentInput, setDocumentInput] = useState('');
  const [signingLabel, setSigningLabel] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sessionsRes, connectionsRes, keysRes] = await Promise.all([
        signingApi.getSessions(),
        connectionApi.getAll(),
        signingApi.getKeys(),
      ]);

      if (sessionsRes.success) {
        setSessions(sessionsRes.sessions || []);
      }

      if (connectionsRes.success) {
        // Filter to only active connections
        const activeConnections = (connectionsRes.connections || []).filter(
          (c: Connection) => c.state === 'completed' || c.state === 'response-sent'
        );
        setConnections(activeConnections);
      }

      if (keysRes.success) {
        setAvailableKeys(keysRes.keys || []);
        // Auto-select first available key if not already selected
        if (!selectedKeyId && keysRes.keys?.length > 0) {
          setSelectedKeyId(keysRes.keys[0].fingerprint);
        }
      }
    } catch (error: any) {
      console.error('Failed to load signing data:', error);
      toast.error('Failed to load signing sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    setCreatingKey(true);
    try {
      const response = await signingApi.createKey();
      if (response.success) {
        toast.success('Signing key created successfully!');
        await loadData(); // Reload to show the new key
      }
    } catch (error: any) {
      console.error('Failed to create signing key:', error);
      toast.error(error.message || 'Failed to create signing key');
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRequestSigning = async () => {
    if (!selectedConnection || !documentInput) {
      toast.error('Please select a connection and enter a document');
      return;
    }

    try {
      let document;
      try {
        document = JSON.parse(documentInput);
      } catch {
        document = documentInput;
      }

      const response = await signingApi.requestSigning({
        connectionId: selectedConnection,
        document,
        label: signingLabel || undefined,
      });

      if (response.success) {
        toast.success('Signing request sent successfully!');
        setShowRequestModal(false);
        setDocumentInput('');
        setSigningLabel('');
        setSelectedConnection('');
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to request signing:', error);
      toast.error(error.message || 'Failed to send signing request');
    }
  };

  const handleConsent = async (session: SigningSession) => {
    try {
      const params = selectedKeyId ? { keyId: selectedKeyId } : {};
      const response = await signingApi.consentToSign(session.id, params);
      if (response.success) {
        toast.success('Consent provided successfully!');
        await loadData(); // Reload to get updated state
      }
    } catch (error: any) {
      console.error('Failed to consent:', error);
      // Check if it's already in consent-sent state
      if (error.message?.includes('consent-sent')) {
        toast.info('Already consented! Click "Sign Document" to continue.');
        await loadData(); // Refresh to show correct buttons
      } else {
        toast.error(error.message || 'Failed to provide consent');
      }
    }
  };

  const handleSign = async (session: SigningSession) => {
    try {
      const params = selectedKeyId ? { keyId: selectedKeyId } : {};
      const response = await signingApi.sign(session.id, params);
      if (response.success) {
        toast.success('Document signed successfully!');
        await loadData(); // Reload to get updated state
      }
    } catch (error: any) {
      console.error('Failed to sign:', error);
      toast.error(error.message || 'Failed to sign document');
    }
  };

  const handleComplete = async (session: SigningSession) => {
    try {
      const response = await signingApi.complete(session.id);
      if (response.success) {
        toast.success('Signing session completed!');
        await loadData(); // Reload to get updated state
      }
    } catch (error: any) {
      console.error('Failed to complete:', error);
      toast.error(error.message || 'Failed to complete session');
    }
  };

  const handleDecline = async (session: SigningSession, reason?: string) => {
    try {
      const response = await signingApi.decline(session.id, reason);
      if (response.success) {
        toast.success('Signing request declined');
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to decline:', error);
      toast.error(error.message || 'Failed to decline request');
    }
  };

  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'completed':
        return 'bg-success-100 text-success-700 border-success-300 dark:bg-success-900/30 dark:text-success-400 dark:border-success-700';
      case 'declined':
      case 'abandoned':
        return 'bg-error-100 text-error-700 border-error-300 dark:bg-error-900/30 dark:text-error-400 dark:border-error-700';
      case 'request-sent':
      case 'request-received':
        return 'bg-primary-100 text-primary-700 border-primary-300 dark:bg-primary-900/30 dark:text-primary-400 dark:border-primary-700';
      case 'consent-received':
      case 'consent-sent':
        return 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700';
      case 'signature-received':
        return 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-700';
      default:
        return 'bg-surface-100 text-text-secondary border-border-secondary';
    }
  };

  const getRoleLabel = (role: string) => {
    return role === 'requester' ? 'Requester' : 'Signer';
  };

  // Actions for list view - just "View Details" button
  const getListActions = (session: SigningSession) => {
    const actions = [];

    // Only show "View Details" button for sessions that have pending actions
    const hasPendingAction =
      (session.role === 'signer' && (session.state === 'request-received' || session.state === 'consent-sent')) ||
      (session.role === 'requester' && (session.state === 'signature-received' || session.state.includes('signature-received')));

    if (hasPendingAction) {
      actions.push(
        <button
          key="view"
          onClick={(e) => {
            e.stopPropagation(); // Prevent row click from also triggering
            setSelectedSession(session);
          }}
          className="btn btn-sm btn-primary"
        >
          View Details
        </button>
      );
    }

    return actions;
  };

  // Actions for modal view - actual action buttons
  const getModalActions = (session: SigningSession) => {
    const actions = [];

    if (session.role === 'signer' && session.state === 'request-received') {
      actions.push(
        <button
          key="consent"
          onClick={() => handleConsent(session)}
          className="btn btn-sm bg-purple-600 hover:bg-purple-700 text-white"
        >
          Consent to Sign
        </button>
      );
      actions.push(
        <button
          key="decline"
          onClick={() => handleDecline(session)}
          className="btn btn-sm bg-error-600 hover:bg-error-700 text-white"
        >
          Decline
        </button>
      );
    }

    if (session.role === 'signer' && session.state === 'consent-sent') {
      actions.push(
        <button
          key="sign"
          onClick={() => handleSign(session)}
          className="btn btn-sm btn-primary"
        >
          Sign Document
        </button>
      );
    }

    // Check for signature-received state (could also be partial-signature-received)
    if (session.role === 'requester' &&
        (session.state === 'signature-received' || session.state.includes('signature-received'))) {
      actions.push(
        <button
          key="complete"
          onClick={() => handleComplete(session)}
          className="btn btn-sm bg-success-600 hover:bg-success-700 text-white"
        >
          Complete & Deliver
        </button>
      );
    }

    return actions;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowRequestModal(true)}
          className="btn btn-primary"
        >
          Request Signature
        </button>
      </div>

      {/* Key Selection */}
      <div className="card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Signing Keys</h2>
          <button
            onClick={handleCreateKey}
            disabled={creatingKey}
            className="btn btn-sm bg-success-600 hover:bg-success-700 text-white"
          >
            {creatingKey ? 'Creating...' : '+ Create New Key'}
          </button>
        </div>

        {availableKeys.length === 0 ? (
          <div className="bg-warning-100 border border-warning-300 rounded-lg p-4">
            <p className="text-sm text-warning-800 mb-3">
              No signing keys available. You need to create a signing key before you can sign documents.
            </p>
            <button
              onClick={handleCreateKey}
              disabled={creatingKey}
              className="btn btn-sm bg-warning-600 hover:bg-warning-700 text-white"
            >
              {creatingKey ? 'Creating Key...' : 'Create Your First Signing Key'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="form-label">
                Select signing key for consent and signature operations
              </label>
              <select
                value={selectedKeyId}
                onChange={(e) => setSelectedKeyId(e.target.value)}
                className="input w-full"
              >
                <option value="">-- Select a signing key --</option>
                {availableKeys.map((key) => (
                  <option key={key.fingerprint} value={key.fingerprint}>
                    {key.fingerprint} ({key.keyType})
                  </option>
                ))}
              </select>
            </div>
            {selectedKeyId && (
              <div className="bg-primary-100 border border-primary-300 rounded-lg p-3">
                <p className="text-sm text-primary-800">
                  <span className="font-semibold">Selected Key:</span>
                  <span className="ml-2 font-mono text-xs break-all">{selectedKeyId}</span>
                </p>
              </div>
            )}
            {!selectedKeyId && (
              <div className="bg-warning-100 border border-warning-300 rounded-lg p-3">
                <p className="text-sm text-warning-800">
                  No key selected. Please select a signing key before performing consent or signature operations.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sessions List */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Signing Sessions</h2>
        </div>

        {sessions.length === 0 ? (
          <div className="px-6 py-12 text-center text-text-secondary">
            No signing sessions yet. Request a signature to get started.
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="px-6 py-4 hover:bg-surface-100 cursor-pointer transition-colors"
                onClick={() => setSelectedSession(session)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded border ${getStateColor(session.state)}`}>
                        {session.state}
                      </span>
                      <span className="badge badge-gray">
                        {getRoleLabel(session.role)}
                      </span>
                      {session.suite && (
                        <span className="text-xs text-text-tertiary">
                          {session.suite.suite}
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-text-primary font-medium mb-1">
                      Session ID: {session.sessionId}
                    </div>

                    {session.object && (
                      <div className="text-xs text-text-secondary mb-2">
                        <div className="font-mono bg-surface-100 p-2 rounded overflow-x-auto max-w-2xl">
                          {session.object.data.substring(0, 100)}
                          {session.object.data.length > 100 && '...'}
                        </div>
                      </div>
                    )}

                    {session.partialSignatures && session.partialSignatures.length > 0 && (
                      <div className="mt-2 text-xs text-text-secondary">
                        <span className="font-semibold">Signatures:</span> {session.partialSignatures.length}
                      </div>
                    )}

                    {session.createdAt && (
                      <div className="mt-1 text-xs text-text-tertiary">
                        Created: {new Date(session.createdAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    {getListActions(session)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Request Signing Modal */}
      {showRequestModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Request Document Signature</h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">
                  Select Connection
                </label>
                <select
                  value={selectedConnection}
                  onChange={(e) => setSelectedConnection(e.target.value)}
                  className="input w-full"
                >
                  <option value="">-- Select a connection --</option>
                  {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.theirLabel || conn.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={signingLabel}
                  onChange={(e) => setSigningLabel(e.target.value)}
                  placeholder="e.g., Employment Contract"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="form-label">
                  Document (JSON or text)
                </label>
                <textarea
                  value={documentInput}
                  onChange={(e) => setDocumentInput(e.target.value)}
                  placeholder='{"agreement": "I agree to the terms", "date": "2025-10-20"}'
                  rows={8}
                  className="input w-full font-mono text-sm"
                />
                <p className="mt-1 text-xs text-text-tertiary">
                  Enter a JSON object or plain text document to be signed
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRequestModal(false);
                  setDocumentInput('');
                  setSigningLabel('');
                  setSelectedConnection('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestSigning}
                disabled={!selectedConnection || !documentInput}
                className="btn btn-primary"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session Details Modal */}
      {selectedSession && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border-primary">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Signing Session Details</h3>
                  <p className="text-sm text-text-tertiary mt-1">Session ID: {selectedSession.sessionId}</p>
                </div>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="text-text-tertiary hover:text-text-primary transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-6">
              {/* Status and Role */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">State</label>
                  <span className={`inline-block px-3 py-1 text-sm font-medium rounded border ${getStateColor(selectedSession.state)}`}>
                    {selectedSession.state}
                  </span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Role</label>
                  <span className="badge badge-gray">
                    {getRoleLabel(selectedSession.role)}
                  </span>
                </div>
              </div>

              {/* Document */}
              {selectedSession.object && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Document</label>
                  <div className="bg-surface-100 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                    <pre className="whitespace-pre-wrap text-text-primary">{selectedSession.object.data}</pre>
                  </div>
                  {selectedSession.object.digest && (
                    <div className="mt-2 text-xs text-text-secondary">
                      <span className="font-semibold">Digest ({selectedSession.object.digest.algorithm}):</span>
                      <div className="font-mono bg-surface-50 p-2 rounded border border-border-secondary mt-1 break-all">
                        {selectedSession.object.digest.value}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Signature Suite */}
              {selectedSession.suite && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Signature Suite</label>
                  <div className="text-sm text-text-primary">{selectedSession.suite.suite}</div>
                </div>
              )}

              {/* Signatures */}
              {selectedSession.partialSignatures && selectedSession.partialSignatures.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Signatures ({selectedSession.partialSignatures.length})</label>
                  <div className="space-y-3">
                    {selectedSession.partialSignatures.map((sig, idx) => {
                      const signatureValue = typeof sig.signature === 'string'
                        ? sig.signature
                        : sig.signature.value;
                      const signatureFormat = typeof sig.signature === 'object'
                        ? sig.signature.format
                        : 'unknown';

                      return (
                        <div key={idx} className="bg-surface-100 p-3 rounded-lg">
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-xs text-text-tertiary">Key ID: {sig.keyId}</div>
                            {signatureFormat && (
                              <span className="badge badge-primary text-xs">
                                {signatureFormat}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-xs bg-surface-50 p-2 rounded border border-border-secondary break-all text-text-primary">
                            {signatureValue}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Consent Messages */}
              {selectedSession.consentMessages && selectedSession.consentMessages.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">Consent Messages</label>
                  <div className="space-y-2">
                    {selectedSession.consentMessages.map((consent, idx) => (
                      <div key={idx} className="bg-success-100 p-2 rounded text-sm">
                        <div className="text-success-700">Key: {consent.keyId}</div>
                        <div className="text-success-600 text-xs">{new Date(consent.timestamp).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t border-border-primary">
                {getModalActions(selectedSession)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
