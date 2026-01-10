'use client';

import { useState, useEffect, useCallback } from 'react';
import { pdfSigningApi, vaultApi, connectionApi } from '../../../lib/api';
import { toast } from 'react-toastify';

interface PdfVault {
  vaultId: string;
  filename?: string;
  createdAt?: string;
  signedAt?: string;
  returnedAt?: string;
}

interface Connection {
  id: string;
  theirLabel?: string;
  state: string;
}

interface KemStatus {
  hasLocalKey: boolean;
  hasPeerKey: boolean;
  ready: boolean;
}

interface SigningStatus {
  total: number;
  pending: number;
  signed: number;
  completed: number;
}

export default function PdfSigningPage() {
  const [status, setStatus] = useState<SigningStatus | null>(null);
  const [pendingVaults, setPendingVaults] = useState<PdfVault[]>([]);
  const [signedVaults, setSignedVaults] = useState<PdfVault[]>([]);
  const [completedVaults, setCompletedVaults] = useState<PdfVault[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadConnectionId, setUploadConnectionId] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  // KEM status tracking
  const [kemStatuses, setKemStatuses] = useState<Record<string, KemStatus>>({});

  // Sign modal state
  const [showSignModal, setShowSignModal] = useState(false);
  const [selectedVault, setSelectedVault] = useState<PdfVault | null>(null);
  const [signPassphrase, setSignPassphrase] = useState('');
  const [signCertificate, setSignCertificate] = useState('');
  const [signPrivateKey, setSignPrivateKey] = useState('');
  const [signReason, setSignReason] = useState('');
  const [signLocation, setSignLocation] = useState('');
  const [signName, setSignName] = useState('');
  const [signing, setSigning] = useState(false);

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareConnectionId, setShareConnectionId] = useState('');
  const [sharing, setSharing] = useState(false);

  // Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadPassphrase, setDownloadPassphrase] = useState('');
  const [downloading, setDownloading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, connectionsRes] = await Promise.all([
        pdfSigningApi.getStatus(),
        connectionApi.getAll(),
      ]);

      if (statusRes.success) {
        setStatus(statusRes.status);
        setPendingVaults(statusRes.vaults?.pending || []);
        setSignedVaults(statusRes.vaults?.signed || []);
        setCompletedVaults(statusRes.vaults?.completed || []);
      }

      if (connectionsRes.success) {
        const activeConnections = (connectionsRes.connections || []).filter(
          (c: Connection) => c.state === 'completed' || c.state === 'response-sent'
        );
        setConnections(activeConnections);

        // Fetch KEM statuses for active connections
        const kemStatusPromises = activeConnections.map(async (conn: Connection) => {
          try {
            const kemRes = await connectionApi.getKemStatus(conn.id);
            if (kemRes.success && kemRes.status) {
              return { id: conn.id, status: kemRes.status };
            }
          } catch (err) {
            console.error(`Failed to get KEM status for ${conn.id}:`, err);
          }
          return null;
        });

        const kemResults = await Promise.all(kemStatusPromises);
        const newKemStatuses: Record<string, KemStatus> = {};
        kemResults.forEach((result) => {
          if (result) {
            newKemStatuses[result.id] = result.status;
          }
        });
        setKemStatuses(newKemStatuses);
      }
    } catch (error: any) {
      console.error('Failed to load PDF signing data:', error);
      toast.error('Failed to load PDF signing status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadConnectionId) {
      toast.error('Please select a PDF and a recipient connection');
      return;
    }

    if (!uploadFile.type.includes('pdf')) {
      toast.error('Please select a PDF file');
      return;
    }

    // Verify connection has KEM keys ready
    const kemStatus = kemStatuses[uploadConnectionId];
    if (!kemStatus?.ready) {
      toast.error('Please select a connection with encryption keys ready');
      return;
    }

    setUploading(true);
    try {
      const response = await pdfSigningApi.upload(uploadFile, uploadConnectionId, uploadDescription);
      if (response.success) {
        toast.success('PDF uploaded and encrypted successfully!');
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadConnectionId('');
        setUploadDescription('');
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to upload PDF:', error);
      toast.error(error.message || 'Failed to upload PDF');
    } finally {
      setUploading(false);
    }
  };

  const handleSign = async () => {
    if (!selectedVault || !signPassphrase || !signCertificate || !signPrivateKey) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSigning(true);
    try {
      const response = await pdfSigningApi.sign(selectedVault.vaultId, {
        passphrase: signPassphrase,
        certificate: signCertificate,
        privateKey: signPrivateKey,
        reason: signReason || undefined,
        location: signLocation || undefined,
        name: signName || undefined,
      });

      if (response.success) {
        toast.success('PDF signed successfully!');
        setShowSignModal(false);
        setSelectedVault(null);
        resetSignForm();
        loadData();
      }
    } catch (error: any) {
      console.error('Failed to sign PDF:', error);
      toast.error(error.message || 'Failed to sign PDF');
    } finally {
      setSigning(false);
    }
  };

  const handleShare = async () => {
    if (!selectedVault || !shareConnectionId) {
      toast.error('Please select a connection');
      return;
    }

    setSharing(true);
    try {
      const response = await pdfSigningApi.share(selectedVault.vaultId, shareConnectionId);
      if (response.success) {
        toast.success('PDF shared for signing!');
        setShowShareModal(false);
        setSelectedVault(null);
        setShareConnectionId('');
      }
    } catch (error: any) {
      console.error('Failed to share PDF:', error);
      toast.error(error.message || 'Failed to share PDF');
    } finally {
      setSharing(false);
    }
  };

  const handleDownload = async () => {
    if (!selectedVault || !downloadPassphrase) {
      toast.error('Please enter passphrase');
      return;
    }

    setDownloading(true);
    try {
      const blob = await pdfSigningApi.download(selectedVault.vaultId, downloadPassphrase);

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = selectedVault.filename || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('PDF downloaded!');
      setShowDownloadModal(false);
      setSelectedVault(null);
      setDownloadPassphrase('');
    } catch (error: any) {
      console.error('Failed to download PDF:', error);
      toast.error(error.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const resetSignForm = () => {
    setSignPassphrase('');
    setSignCertificate('');
    setSignPrivateKey('');
    setSignReason('');
    setSignLocation('');
    setSignName('');
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
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">PDF Signing</h1>
          <p className="text-text-secondary">Securely sign and share PDF documents with digital signatures</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="btn btn-primary"
        >
          + Upload PDF
        </button>
      </div>

      {/* Status Cards */}
      {status && (
        <div className="grid grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="text-2xl font-bold text-text-primary">{status.total}</div>
            <div className="text-sm text-text-secondary">Total PDFs</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-warning-600">{status.pending}</div>
            <div className="text-sm text-text-secondary">Pending</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-primary-600">{status.signed}</div>
            <div className="text-sm text-text-secondary">Signed</div>
          </div>
          <div className="card p-4">
            <div className="text-2xl font-bold text-success-600">{status.completed}</div>
            <div className="text-sm text-text-secondary">Completed</div>
          </div>
        </div>
      )}

      {/* Pending PDFs */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Pending for Signature</h2>
        </div>
        {pendingVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No PDFs pending signature
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {pendingVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-warning-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <div className="font-medium text-text-primary">{vault.filename || 'Unnamed PDF'}</div>
                    <div className="text-xs text-text-tertiary">
                      Created: {vault.createdAt ? new Date(vault.createdAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedVault(vault);
                      setShowSignModal(true);
                    }}
                    className="btn btn-sm btn-primary"
                  >
                    Sign
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVault(vault);
                      setShowShareModal(true);
                    }}
                    className="btn btn-sm btn-secondary"
                  >
                    Share
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVault(vault);
                      setShowDownloadModal(true);
                    }}
                    className="btn btn-sm btn-secondary"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signed PDFs */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Signed (Awaiting Delivery)</h2>
        </div>
        {signedVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No signed PDFs awaiting delivery
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {signedVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <div className="font-medium text-text-primary">{vault.filename || 'Unnamed PDF'}</div>
                    <div className="text-xs text-text-tertiary">
                      Signed: {vault.signedAt ? new Date(vault.signedAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setSelectedVault(vault);
                      setShowDownloadModal(true);
                    }}
                    className="btn btn-sm btn-primary"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVault(vault);
                      setShowShareModal(true);
                    }}
                    className="btn btn-sm btn-secondary"
                  >
                    Return to Owner
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed PDFs */}
      <div className="card">
        <div className="px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-text-primary">Completed</h2>
        </div>
        {completedVaults.length === 0 ? (
          <div className="px-6 py-8 text-center text-text-secondary">
            No completed signing workflows
          </div>
        ) : (
          <div className="divide-y divide-border-secondary">
            {completedVaults.map((vault) => (
              <div key={vault.vaultId} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <svg className="h-8 w-8 text-success-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <div className="font-medium text-text-primary">{vault.filename || 'Unnamed PDF'}</div>
                    <div className="text-xs text-text-tertiary">
                      Completed: {vault.returnedAt ? new Date(vault.returnedAt).toLocaleDateString() : 'Unknown'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedVault(vault);
                    setShowDownloadModal(true);
                  }}
                  className="btn btn-sm btn-secondary"
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Upload PDF for Signing</h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">PDF File</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="form-label">Send to (encrypted)</label>
                <select
                  value={uploadConnectionId}
                  onChange={(e) => setUploadConnectionId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">-- Select a recipient --</option>
                  {connections.map((conn) => {
                    const kemStatus = kemStatuses[conn.id];
                    const isReady = kemStatus?.ready;
                    return (
                      <option
                        key={conn.id}
                        value={conn.id}
                        disabled={!isReady}
                      >
                        {isReady ? '🔒 ' : '⚠️ '}
                        {conn.theirLabel || conn.id}
                        {!isReady && ' (keys not exchanged)'}
                      </option>
                    );
                  })}
                </select>
                {connections.length > 0 && !connections.some(c => kemStatuses[c.id]?.ready) && (
                  <p className="mt-2 text-sm text-warning-600">
                    No connections have encryption keys ready. Go to Connections page to exchange keys first.
                  </p>
                )}
                {connections.length === 0 && (
                  <p className="mt-2 text-sm text-warning-600">
                    No active connections found. Create a connection first.
                  </p>
                )}
              </div>

              <div>
                <label className="form-label">Description (optional)</label>
                <input
                  type="text"
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="e.g., Employment contract"
                  className="input w-full"
                />
              </div>

              <div className="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-md text-sm text-primary-700 dark:text-primary-300">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span>Document will be encrypted using post-quantum ML-KEM-768 encryption to the recipient's key.</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadFile(null);
                  setUploadConnectionId('');
                  setUploadDescription('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || !uploadConnectionId || !kemStatuses[uploadConnectionId]?.ready || uploading}
                className="btn btn-primary"
              >
                {uploading ? 'Uploading...' : 'Upload & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Modal */}
      {showSignModal && selectedVault && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Sign PDF</h3>
              <p className="text-sm text-text-tertiary">{selectedVault.filename || 'Unnamed PDF'}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">Vault Passphrase *</label>
                <input
                  type="password"
                  value={signPassphrase}
                  onChange={(e) => setSignPassphrase(e.target.value)}
                  placeholder="Enter vault passphrase"
                  className="input w-full"
                />
              </div>

              <div>
                <label className="form-label">Certificate (PEM) *</label>
                <textarea
                  value={signCertificate}
                  onChange={(e) => setSignCertificate(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  rows={4}
                  className="input w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="form-label">Private Key (PEM) *</label>
                <textarea
                  value={signPrivateKey}
                  onChange={(e) => setSignPrivateKey(e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                  rows={4}
                  className="input w-full font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Signer Name</label>
                  <input
                    type="text"
                    value={signName}
                    onChange={(e) => setSignName(e.target.value)}
                    placeholder="John Doe"
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="form-label">Location</label>
                  <input
                    type="text"
                    value={signLocation}
                    onChange={(e) => setSignLocation(e.target.value)}
                    placeholder="New York, USA"
                    className="input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="form-label">Reason</label>
                <input
                  type="text"
                  value={signReason}
                  onChange={(e) => setSignReason(e.target.value)}
                  placeholder="e.g., Contract agreement"
                  className="input w-full"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowSignModal(false);
                  setSelectedVault(null);
                  resetSignForm();
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSign}
                disabled={!signPassphrase || !signCertificate || !signPrivateKey || signing}
                className="btn btn-primary"
              >
                {signing ? 'Signing...' : 'Sign PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && selectedVault && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Share PDF</h3>
              <p className="text-sm text-text-tertiary">{selectedVault.filename || 'Unnamed PDF'}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">Select Connection</label>
                <select
                  value={shareConnectionId}
                  onChange={(e) => setShareConnectionId(e.target.value)}
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
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setSelectedVault(null);
                  setShareConnectionId('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleShare}
                disabled={!shareConnectionId || sharing}
                className="btn btn-primary"
              >
                {sharing ? 'Sharing...' : 'Share PDF'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Modal */}
      {showDownloadModal && selectedVault && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-md">
            <div className="px-6 py-4 border-b border-border-primary">
              <h3 className="text-lg font-semibold text-text-primary">Download PDF</h3>
              <p className="text-sm text-text-tertiary">{selectedVault.filename || 'Unnamed PDF'}</p>
            </div>

            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="form-label">Passphrase</label>
                <input
                  type="password"
                  value={downloadPassphrase}
                  onChange={(e) => setDownloadPassphrase(e.target.value)}
                  placeholder="Enter vault passphrase"
                  className="input w-full"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-primary flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDownloadModal(false);
                  setSelectedVault(null);
                  setDownloadPassphrase('');
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={!downloadPassphrase || downloading}
                className="btn btn-primary"
              >
                {downloading ? 'Downloading...' : 'Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
